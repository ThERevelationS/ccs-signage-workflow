import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  FB_HEALTHY_AGE_MS, FB_RECENT_RING_CAP, MATCH_AUTO, matchCustomerFolders,
  normalizeFileBridgeSettings,
} from '../../shared/fileBridgeModel.ts';

// fileBridgeMaintenance — scheduled hands-off sweeps (workflow: every 5 min).
// 1. Expire queued commands past expires_at_ms; requeue stale leases once.
// 2. Mark agent health stale/offline from last_seen_ms.
// 3. TTL-sweep FileBridgeEvent (90d), FileBridgeRecent (ring cap), FileBridgeChunk (1h).
// 4. delivered_url dereference sweep is P3 (keep_delivered_max_mb gate).

const now = () => Date.now();
const DAY = 86_400_000;

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
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

  await sr.entities.FileBridgeEvent.create({
    event_type: 'maintenance_run', actor: 'system', severity: 'info', ts: now(), details: out.sweeps,
  }).catch(() => null);

  return Response.json(out);
});
