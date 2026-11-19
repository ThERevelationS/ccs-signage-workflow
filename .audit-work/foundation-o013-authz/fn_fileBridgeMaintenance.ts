import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  FB_HEALTHY_AGE_MS, FB_RECENT_RING_CAP, MATCH_AUTO, matchCustomerFolders,
  normalizeFileBridgeSettings,
} from '../../shared/fileBridgeModel.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';

// fileBridgeMaintenance — scheduled hands-off sweeps (workflow: every 5 min).
// 1. Expire queued commands past expires_at_ms; requeue stale leases once.
// 2. Mark agent health stale/offline from last_seen_ms.
// 3. TTL-sweep FileBridgeEvent (90d), FileBridgeRecent (ring cap), FileBridgeChunk (1h),
//    FileBridgeCommand (24h terminal).
// 4. delivered_url dereference sweep — keep newest within keep_delivered_max_mb
//    (no storage delete API; deref only). Files re-deliver on next open.
// 5. link_match — auto-match top-level customer_folders dirs to Customers.
// 6. link_reconcile — heal broken links + re-derive FileIndex.customer_ids.

const now = () => Date.now();
const DAY = 86_400_000;

Deno.serve(async (req) => {
  const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { paceMs: 200 });
  const sr = (base44 as any).asServiceRole;
  const out: any = { at: new Date().toISOString(), sweeps: {} };

  const settingsRow = await sr.entities.GlobalSettings.filter({ setting_key: 'fileBridge' }, '-updated_date', 1).catch(() => []);
  const settings = normalizeFileBridgeSettings(settingsRow?.[0]?.setting_value);
  if (!settings.enabled) return Response.json({ skipped: 'disabled', ...out });

  // ---- command sweeps ----
  let expired = 0, requeued = 0;
  const staleQueued = await sr.entities.FileBridgeCommand.filter(
    { status: 'queued', expires_at_ms: { $lt: now() } }, 'created_ts', 100,
  ).catch(() => []);
  for (const c of staleQueued || []) {
    await sr.entities.FileBridgeCommand.update(c.id, { status: 'expired', updated_ts: now(), error: 'queue ttl' }).catch(() => null);
    expired += 1;
  }
  const staleLeases = await sr.entities.FileBridgeCommand.filter(
    { status: { $in: ['leased', 'running'] }, lease_expires_ms: { $lt: now() } }, 'created_ts', 100,
  ).catch(() => []);
  for (const c of staleLeases || []) {
    // one requeue attempt, then expire — protects against agent death mid-lease
    const retries = Number((c as any).args?._lease_retries || 0);
    if (retries < 1) {
      await sr.entities.FileBridgeCommand.update(c.id, {
        status: 'queued', leased_by: '', lease_expires_ms: 0, updated_ts: now(),
        args: { ...(c.args || {}), _lease_retries: retries + 1 },
      }).catch(() => null);
      requeued += 1;
    } else {
      await sr.entities.FileBridgeCommand.update(c.id, { status: 'expired', updated_ts: now(), error: 'lease lost' }).catch(() => null);
      expired += 1;
    }
  }
  out.sweeps.commands = { expired, requeued };

  // ---- health staleness ----
  let marked = 0;
  const agents = await sr.entities.FileBridgeHealth.filter({ state: 'online' }, '-updated_date', 20).catch(() => []);
  for (const a of agents || []) {
    const age = now() - (a.last_seen_ms || 0);
    const to = age > FB_HEALTHY_AGE_MS * 4 ? 'offline' : age > FB_HEALTHY_AGE_MS ? 'stale' : '';
    if (to) {
      await sr.entities.FileBridgeHealth.update(a.id, { state: to }).catch(() => null);
      marked += 1;
    }
  }
  out.sweeps.health = { marked };

  // ---- TTL sweeps ----
  const cutoff90 = now() - 90 * DAY;
  const oldEvents = await sr.entities.FileBridgeEvent.filter({ ts: { $lt: cutoff90 } }, 'ts', 200).catch(() => []);
  if (oldEvents?.length) {
    await sr.entities.FileBridgeEvent.deleteMany({ id: { $in: oldEvents.map((r: any) => r.id) } }).catch(() => null);
  }
  const recentRows = await sr.entities.FileBridgeRecent.filter({}, '-event_ts', FB_RECENT_RING_CAP + 500).catch(() => []);
  let recentDeleted = 0;
  if ((recentRows || []).length > FB_RECENT_RING_CAP) {
    const excess = recentRows.slice(FB_RECENT_RING_CAP).map((r: any) => r.id);
    await sr.entities.FileBridgeRecent.deleteMany({ id: { $in: excess } }).catch(() => null);
    recentDeleted = excess.length;
  }
  const oldChunks = await sr.entities.FileBridgeChunk.filter({ received_at: { $lt: now() - 3_600_000 } }, 'received_at', 200).catch(() => []);
  if (oldChunks?.length) {
    await sr.entities.FileBridgeChunk.deleteMany({ id: { $in: oldChunks.map((r: any) => r.id) } }).catch(() => null);
  }
  // completed commands older than 24h — keep results visible but bounded
  const oldCmds = await sr.entities.FileBridgeCommand.filter(
    { status: { $in: ['completed', 'failed', 'expired', 'cancelled'] }, updated_ts: { $lt: now() - DAY } },
    'updated_ts', 200,
  ).catch(() => []);
  if (oldCmds?.length) {
    await sr.entities.FileBridgeCommand.deleteMany({ id: { $in: oldCmds.map((r: any) => r.id) } }).catch(() => null);
  }
  out.sweeps.retention = {
    events_deleted: oldEvents?.length || 0, recent_deleted: recentDeleted,
    chunks_deleted: oldChunks?.length || 0, commands_deleted: oldCmds?.length || 0,
  };

  // ---- delivered_url dereference sweep ----
  // UploadFile has no delete API — delivered blobs accumulate. Keep the newest
  // deliveries within keep_delivered_max_mb; deref the rest (file re-delivers
  // on next open — the blob stays orphaned but the index stops pointing at it).
  const capBytes = (settings.keep_delivered_max_mb || 4096) * 1024 * 1024;
  const delivered = await sr.entities.FileIndex.filter(
    { delivered_at_ms: { $gt: 0 } }, '-delivered_at_ms', 500,
  ).catch(() => []);
  let derefed = 0, keptBytes = 0;
  for (const row of delivered || []) {
    keptBytes += Number(row.size || 0);
    if (keptBytes > capBytes) {
      await sr.entities.FileIndex.update(row.id, { delivered_url: '', delivered_at_ms: 0 }).catch(() => null);
      derefed += 1;
    }
  }
  out.sweeps.delivered = { rows: delivered?.length || 0, kept_mb: Math.round(keptBytes / 1048576), derefed };

  // ---- customer folder link matching ----
  // Top-level dirs on purpose:'customer_folders' roots vs Customer.company_name.
  // >=MATCH_AUTO unambiguous -> confirmed+auto; otherwise suggested for human review.
  // Existing link on a folder (any status, incl rejected_sticky) -> never re-suggest.
  const linkStats: any = { candidates: 0, created: 0, auto_confirmed: 0, skipped_existing: 0, errors: 0 };
  const custRoots = await sr.entities.FileShareRoot.filter(
    { purpose: 'customer_folders', enabled: true }, 'root_key', 20,
  ).catch(() => []);
  const customers = await sr.entities.Customer.filter({}, 'company_name', 2000)
    .catch((e: any) => ({ __err: String(e?.message || e) }));
  const cList = Array.isArray(customers)
    ? customers.map((c: any) => ({ id: c.id, name: c.company_name || c.name || '' })).filter((c: any) => c.name)
    : null;
  if (custRoots?.length && cList?.length) {
    for (const root of custRoots) {
      const dirs = await sr.entities.FileIndex.filter(
        { root_key: root.root_key, is_dir: true, parent_path: '', missing: { $ne: true } },
        'name', 500,
      ).catch(() => []);
      if (!dirs?.length) continue;
      const existing = await sr.entities.CustomerFolderLink.filter(
        { root_key: root.root_key }, 'folder_path', 1000,
      ).catch(() => []);
      const taken = new Set((existing || []).map((l: any) => l.folder_path));
      const byPath = new Map(dirs.map((d: any) => [d.path, d]));
      const matches = matchCustomerFolders(dirs.map((d: any) => d.path), cList);
      linkStats.candidates += matches.length;
      for (const m of matches) {
        const dir = byPath.get(m.folder);
        if (!dir || taken.has(m.folder)) { linkStats.skipped_existing += 1; continue; }
        const auto = m.confidence >= MATCH_AUTO;
        const c = await sr.entities.CustomerFolderLink.create({
          creation_request_key: `link|${dir.agent_id || root.agent_id || ''}|${root.root_key}|${m.folder}|${m.customer_id}`,
          customer_id: m.customer_id, customer_name: m.customer_name,
          agent_id: dir.agent_id || root.agent_id || '', root_key: root.root_key,
          folder_path: m.folder, confidence: m.confidence, signals: m.signals,
          status: auto ? 'confirmed' : 'suggested', auto,
        }).catch((e: any) => ({ __err: String(e?.message || e) }));
        if (c?.__err) linkStats.errors += 1;
        else { linkStats.created += 1; if (auto) linkStats.auto_confirmed += 1; taken.add(m.folder); }
      }
    }
  }
  out.sweeps.link_match = linkStats;

  // ---- link reconcile (FB-31) ----
  // a) broken-link detection: linked folder missing/renamed → status:'broken'
  //    (folder reappears → restores previous status). Renamed folders surface
  //    as NEW suggestions via the match sweep above.
  // b) customer_ids[] re-derivation: rows under a confirmed link's folder get
  //    customer_id added — powers customer-scoped search_hot + panel scoping.
  //    Additive only (never strips; wrong-strip is worse than stale-add).
  //    Capped at 100 updates/run to protect the shared entity budget.
  const recStats: any = { checked: 0, broken: 0, healed: 0, cid_updates: 0 };
  const allLinks = await sr.entities.CustomerFolderLink.filter(
    { status: { $in: ['confirmed', 'suggested', 'broken'] } }, 'folder_path', 500,
  ).catch(() => []);
  const escRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Broken-link check, batched: one $in filter per root_key (chunks of 100
  // paths) instead of a per-link point read — was ~1 read per link. On a
  // batch error we fall back to per-link reads rather than trusting an
  // empty result (a silent miss would mass-mark links broken).
  const linksByRoot = new Map<string, any[]>();
  for (const l of allLinks || []) {
    const arr = linksByRoot.get(l.root_key) || [];
    arr.push(l);
    linksByRoot.set(l.root_key, arr);
  }
  const aliveLinks = new Set<string>();
  const perLinkCheck = async (l: any): Promise<boolean> => {
    const dir = await sr.entities.FileIndex.filter(
      { root_key: l.root_key, path: l.folder_path, is_dir: true }, '-updated_date', 1,
    ).catch(() => []);
    return !!dir?.[0] && !dir[0].missing;
  };
  for (const [rootKey, links] of linksByRoot) {
    const paths = [...new Set(links.map((l: any) => l.folder_path))];
    const found = new Set<string>();
    let batched = true;
    for (let i = 0; i < paths.length; i += 100) {
      const rows: any = await sr.entities.FileIndex.filter(
        { root_key: rootKey, is_dir: true, path: { $in: paths.slice(i, i + 100) } },
        '-updated_date', 500,
      ).catch((e: any) => ({ __err: String(e?.message || e) }));
      if (rows?.__err || !Array.isArray(rows)) { batched = false; break; }
      for (const r of rows) if (!r.missing) found.add(r.path);
    }
    if (batched) {
      for (const l of links) if (found.has(l.folder_path)) aliveLinks.add(l.id);
    } else {
      for (const l of links) if (await perLinkCheck(l)) aliveLinks.add(l.id);
    }
  }
  for (const l of allLinks || []) {
    recStats.checked += 1;
    const alive = aliveLinks.has(l.id);
    if (!alive && l.status !== 'broken') {
      await sr.entities.CustomerFolderLink.update(l.id, {
        status: 'broken', broken_at: now(), prev_status: l.status,
      }).catch(() => null);
      recStats.broken += 1;
    } else if (alive && l.status === 'broken') {
      await sr.entities.CustomerFolderLink.update(l.id, {
        status: l.prev_status || 'suggested', broken_at: 0, prev_status: '',
      }).catch(() => null);
      recStats.healed += 1;
    }
  }
  let cidBudget = 100;
  // customer_ids re-derivation, batched: one alternation-regex filter per
  // root_key per 15-folder chunk instead of a per-link filter — was ~1 read
  // per confirmed link. Updates are collected first, so a row under several
  // confirmed folders still receives every customer id in a single write.
  const confByRoot = new Map<string, any[]>();
  for (const l of (allLinks || []).filter((x: any) => x.status === 'confirmed')) {
    const arr = confByRoot.get(l.root_key) || [];
    arr.push(l);
    confByRoot.set(l.root_key, arr);
  }
  const pendingCids = new Map<string, Set<string>>();
  for (const [rootKey, links] of confByRoot) {
    const folders = [...new Set(links.map((l: any) => l.folder_path))];
    const linkByFolder = new Map(links.map((l: any) => [l.folder_path, l]));
    for (let i = 0; i < folders.length; i += 15) {
      const chunk = folders.slice(i, i + 15);
      const rx = `^(${chunk.map(escRx).join('|')})(/|$)`;
      const rows = await sr.entities.FileIndex.filter(
        { root_key: rootKey, missing: { $ne: true }, path: { $regex: rx } },
        'path', 2500,
      ).catch(() => []);
      for (const f of rows || []) {
        for (const folder of chunk) {
          if (f.path !== folder && !f.path.startsWith(folder + '/')) continue;
          const l = linkByFolder.get(folder);
          if (!l || (f.customer_ids || []).includes(l.customer_id)) continue;
          const pending = pendingCids.get(f.id) || new Set(f.customer_ids || []);
          pending.add(l.customer_id);
          pendingCids.set(f.id, pending);
        }
      }
    }
  }
  for (const [rowId, ids] of pendingCids) {
    if (cidBudget <= 0) break;
    const u = await sr.entities.FileIndex.update(rowId, { customer_ids: [...ids] }).catch(() => null);
    if (u !== null) { recStats.cid_updates += 1; cidBudget -= 1; }
  }
  out.sweeps.link_reconcile = recStats;

  await sr.entities.FileBridgeEvent.create({
    event_type: 'maintenance_run', actor: 'system', severity: 'info', ts: now(), details: out.sweeps,
  }).catch(() => null);

  return Response.json(out);
});