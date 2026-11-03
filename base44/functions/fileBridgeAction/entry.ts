import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import {
  COMMAND_SPECS, routeAgent, dedupeKey, safeRelPath, normPath,
  normalizeFileBridgeSettings, canDelete, canMove, isDeliveryStale,
  parseQualifiers, FB_HEALTHY_AGE_MS, FB_BULK_DELETE_CAP,
} from '../../shared/fileBridgeModel.ts';

// fileBridgeAction — session-authenticated staff API. Every staff-facing read
// and queue-write for the File Bridge flows through here (entities are
// backend-only RLS). Commands ride FileBridgeCommand rows — the entity queue is
// the source of truth; agents pick them up via command_wait/command_poll.

const uuid = () => crypto.randomUUID();
const now = () => Date.now();

const RATE_LIMITS: Record<string, { max: number; window_ms: number }> = {
  fetch_bytes: { max: 30, window_ms: 60_000 },
  list_dir: { max: 60, window_ms: 60_000 },
  deep_search: { max: 10, window_ms: 60_000 },
  delete: { max: 10, window_ms: 60_000 },
  default: { max: 40, window_ms: 60_000 },
};

async function rateOk(sr: any, actorKey: string, type: string): Promise<boolean> {
  const lim = RATE_LIMITS[type] || RATE_LIMITS.default;
  const since = now() - lim.window_ms;
  const rows = await sr.entities.FileBridgeCommand.filter(
    { actor_rate_key: actorKey, type, created_ts: { $gte: since } }, '-created_ts', lim.max + 1,
  ).catch(() => []);
  return (rows || []).length < lim.max;
}

async function loadAgents(sr: any) {
  const rows = await sr.entities.FileBridgeHealth.filter({}, '-updated_date', 10).catch(() => []);
  return (rows || []).map((r: any) => ({
    agent_id: r.agent_id, role: r.role, last_seen_ms: r.last_seen_ms || 0, state: r.state,
  }));
}

async function enqueue(sr: any, user: any, type: string, args: Record<string, any>, opts: any = {}) {
  const spec = COMMAND_SPECS[type];
  if (!spec) return { error: `unknown command '${type}'`, status: 400 };
  const agents = await loadAgents(sr);
  const route = routeAgent(type, agents, now());
  const agent_id = route.agent_id || (spec.mutating ? '' : null);
  if (route.error) return { error: route.error, status: 503 };
  const dk = dedupeKey(type, agent_id || 'primary', args);
  // collapse onto an in-flight identical command
  const dup = await sr.entities.FileBridgeCommand.filter(
    { dedupe_key: dk, status: { $in: ['queued', 'leased', 'running'] } }, '-created_ts', 1,
  ).catch((e: any) => ({ __err: String(e?.message || e) }));
  // A failed dedupe read would enqueue duplicates — surface it instead.
  if ((dup as any)?.__err) return { error: 'temporarily_unavailable_retry', status: 503 };
  if (dup?.[0]) return { ok: true, command_id: dup[0].command_id, deduped: true, served_by: dup[0].served_by };
  const command_id = `cmd_${uuid()}`;
  const row = await sr.entities.FileBridgeCommand.create({
    command_id, type, agent_id: agent_id || '', target_role: spec.mutating ? 'primary' : 'any',
    status: 'queued', args, dedupe_key: dk, request_key: opts.request_key || command_id,
    served_by: route.served_by, requested_by: user.email, actor_rate_key: user.email,
    priority: opts.priority || 100, created_ts: now(), updated_ts: now(),
    expires_at_ms: now() + (opts.ttl_ms || 15 * 60_000),
  });
  await sr.entities.FileBridgeEvent.create({
    event_type: 'command_enqueued', actor: user.email, agent_id: agent_id || '',
    command_id, root_key: args.root_key, path: args.path || args.src || '',
    details: { type, deduped: false }, ts: now(), severity: 'info',
  }).catch(() => null);
  return { ok: true, command_id, row_id: row?.id, served_by: route.served_by, queued_for: agent_id || 'primary' };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  if (JSON.stringify(body || {}).length > 500_000) {
    return Response.json({ error: 'Request too large.' }, { status: 400 });
  }
  const user = await authenticateSignShopSession(base44, body?.session_token);
  if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const sr = (base44 as any).asServiceRole;
  const action = String(body?.action || '').trim();
  const isAdmin = user.role === 'admin';

  const settingsRow = await sr.entities.GlobalSettings.filter({ setting_key: 'fileBridge' }, '-updated_date', 1)
    .catch((e: any) => ({ __err: String(e?.message || e) }));
  if ((settingsRow as any)?.__err) return Response.json({ error: 'settings_unavailable' }, { status: 503 });
  const settings = normalizeFileBridgeSettings(settingsRow?.[0]?.setting_value);
  if (!settings.enabled && action !== 'admin_settings') {
    return Response.json({ error: 'File Bridge is not enabled yet.' }, { status: 503 });
  }

  // ---------- get_health ----------
  if (action === 'get_health') {
    const agents = await sr.entities.FileBridgeHealth.filter({}, '-updated_date', 10).catch(() => []);
    const roots = await sr.entities.FileShareRoot.filter({}, 'root_key', 50).catch(() => []);
    return Response.json({
      enabled: settings.enabled, settings,
      agents: (agents || []).map((a: any) => ({
        ...a, healthy: now() - (a.last_seen_ms || 0) < FB_HEALTHY_AGE_MS,
      })),
      roots: roots || [],
      server_time_ms: now(),
    });
  }

  // ---------- search_hot (FileIndex hot-scope only) ----------
  if (action === 'search_hot') {
    const { text, filters } = parseQualifiers(String(body.query || ''));
    const limit = Math.min(Number(body.limit) || 50, 100);
    const q: any = {};
    if (filters.ext?.length) q.ext = { $in: filters.ext.map((e: string) => e.toLowerCase()) };
    if (body.root_key) q.root_key = String(body.root_key);
    if (filters.path?.length) q.parent_path = { $regex: `^${filters.path[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` };
    if (body.customer_id) q.customer_ids = { $contains: String(body.customer_id) };
    const rows = await sr.entities.FileIndex.filter(q, '-mtime_ms', limit * 3).catch(() => []);
    const needle = text.toLowerCase();
    const hits = (rows || [])
      .filter((r: any) => !needle || String(r.path || '').toLowerCase().includes(needle) || String(r.name || '').toLowerCase().includes(needle))
      .slice(0, limit);
    return Response.json({ ok: true, hits, hot_scope: true, parsed: { text, filters } });
  }

  // ---------- list_folder (FileIndex fast path; falls back to list_dir command) ----------
  if (action === 'list_folder') {
    const rp = safeRelPath(String(body.path || ''));
    if (!rp.ok) return Response.json({ error: rp.error }, { status: 400 });
    const root_key = String(body.root_key || '');
    const rows = await sr.entities.FileIndex.filter(
      { root_key, parent_path: rp.path, missing: { $ne: true } }, 'name', 500,
    ).catch(() => []);
    // Base44 sort is single-field — dirs-first ordering in memory.
    (rows || []).sort((a: any, b: any) => (b.is_dir ? 1 : 0) - (a.is_dir ? 1 : 0));
    const stale = (rows || []).some((r: any) => isDeliveryStale(r));
    if ((rows || []).length && !body.refresh) {
      return Response.json({ ok: true, source: 'index', entries: rows, stale_hint: stale });
    }
    const enq = await enqueue(sr, user, 'list_dir', { root_key, path: rp.path, limit: 500 });
    return Response.json({ ok: true, source: 'command', ...enq });
  }

  // ---------- queue writers ----------
  const queueTypes: Record<string, (b: any) => { args?: any; err?: string }> = {
    queue_fetch: (b) => {
      const p = safeRelPath(String(b.path || ''));
      if (!p.ok) return { err: p.error };
      return { args: { root_key: String(b.root_key || ''), path: p.path, size: b.size, expected_sha256: b.sha256 } };
    },
    queue_deep_search: (b) => ({ args: { query: String(b.query || ''), filters: b.filters || {}, time_cap_ms: b.time_cap_ms || 5000 } }),
    queue_mkdir: (b) => {
      const p = safeRelPath(String(b.path || ''));
      if (!p.ok) return { err: p.error };
      return { args: { root_key: String(b.root_key || ''), path: p.path } };
    },
    queue_move: (b) => {
      const s = safeRelPath(String(b.src || ''));
      const d = safeRelPath(String(b.dest_dir || ''));
      if (!s.ok) return { err: s.error };
      if (!d.ok) return { err: d.error };
      return { args: { root_key: String(b.root_key || ''), src: s.path, dest_dir: d.path } };
    },
    queue_delete: (b) => {
      const paths = Array.isArray(b.paths) ? b.paths.slice(0, FB_BULK_DELETE_CAP) : [b.path].filter(Boolean);
      const okPaths: string[] = [];
      for (const raw of paths) {
        const p = safeRelPath(String(raw || ''));
        if (!p.ok) return { err: p.error };
        okPaths.push(p.path);
      }
      if (!okPaths.length) return { err: 'no paths' };
      return { args: { root_key: String(b.root_key || ''), paths: okPaths } };
    },
    queue_restore: (b) => {
      // Agent contract: {root_key, path} — it resolves the tombstone from
      // its own manifest (trash_path recorded at delete time).
      const p = safeRelPath(String(b.path || b.tombstone_path || ''));
      if (!p.ok) return { err: p.error };
      return { args: { root_key: String(b.root_key || ''), path: p.path } };
    },
    queue_package: (b) => {
      const paths = Array.isArray(b.paths) ? b.paths.slice(0, 100) : [];
      const okPaths: string[] = [];
      for (const raw of paths) {
        const p = safeRelPath(String(raw || ''));
        if (!p.ok) return { err: p.error };
        okPaths.push(p.path);
      }
      if (!okPaths.length) return { err: 'no paths' };
      return { args: { root_key: String(b.root_key || ''), paths: okPaths, archive_name: String(b.archive_name || 'package.zip') } };
    },
    queue_index_now: (b) => ({ args: { root_key: String(b.root_key || ''), path_prefix: b.path_prefix ? normPath(b.path_prefix) : '' } }),
    queue_log_tail: (b) => ({ args: { lines: Math.min(Number(b.lines) || 200, 1000) } }),
    queue_pin: (b) => {
      const p = safeRelPath(String(b.path || ''));
      if (!p.ok) return { err: p.error };
      return { args: { root_key: String(b.root_key || ''), path: p.path, pinned: b.pinned !== false } };
    },
    queue_relink: (b) => {
      const p = safeRelPath(String(b.path_prefix || ''));
      if (!p.ok) return { err: p.error };
      return { args: { root_key: String(b.root_key || ''), path_prefix: p.path, customer_id: String(b.customer_id || '') } };
    },
  };

  const cmdOfAction: Record<string, string> = {
    queue_fetch: 'fetch_bytes', queue_deep_search: 'deep_search', queue_mkdir: 'mkdir',
    queue_move: 'move', queue_delete: 'delete', queue_restore: 'restore_trash',
    queue_package: 'package_files', queue_index_now: 'index_now', queue_log_tail: 'log_tail',
    queue_pin: 'pin_file', queue_relink: 'relink_files',
  };

  // ---------- queue_upload: command first (learns routing), then ledger ----------
  if (action === 'queue_upload') {
    const dest = safeRelPath(String(body.dest_dir || ''));
    const name = String(body.name || '').trim();
    const size = Number(body.size) || 0;
    const sha256 = String(body.sha256 || '').toLowerCase();
    const file_url = String(body.file_url || '');
    const root_key = String(body.root_key || '');
    if (!dest.ok || !name || !file_url || !root_key || size <= 0 || !/^[0-9a-f]{64}$/.test(sha256)) {
      return Response.json({ error: 'root_key, dest_dir, name, file_url, size and sha256 are required' }, { status: 400 });
    }
    if (!(await rateOk(sr, user.email, 'upload_apply'))) {
      return Response.json({ error: 'Rate limit — slow down.' }, { status: 429 });
    }
    const upload_id = `up_${uuid()}`;
    const final_path = dest.path ? `${dest.path}/${name}` : name;
    const enq = await enqueue(sr, user, 'upload_apply', {
      upload_id, root_key, dest_dir: dest.path, name, sha256, size, file_url,
      mode: body.mode === 'revision' ? 'revision' : 'new',
    }, { request_key: body.request_key });
    if (enq.error) return Response.json({ error: enq.error }, { status: enq.status || 500 });
    // Permanent append-only provenance — survives FileIndex reaping so a
    // promoted backup can still prove bridge-origin (delete guard). A failed
    // ledger write does not block the apply (agent holds args) but is audited.
    const up = await sr.entities.FileBridgeUpload.create({
      upload_id, agent_id: enq.queued_for || '', root_key, path: final_path,
      name, sha256, size, kind: body.mode === 'revision' ? 'revision' : 'upload',
      uploaded_by: user.email, customer_id: body.customer_id ? String(body.customer_id) : undefined,
      file_url, status: 'staged', creation_request_key: String(body.request_key || upload_id),
    }).catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((up as any)?.__err) {
      await sr.entities.FileBridgeEvent.create({
        event_type: 'upload_ledger_write_failed', actor: user.email, root_key, path: final_path,
        severity: 'error', details: { upload_id, err: (up as any).__err }, ts: now(),
      }).catch(() => null);
    }
    return Response.json({ ok: true, upload_id, path: final_path, ...enq });
  }

  if (queueTypes[action]) {
    const built = queueTypes[action](body);
    if (built.err) return Response.json({ error: built.err }, { status: 400 });
    const type = cmdOfAction[action];
    const spec = COMMAND_SPECS[type];
    if (spec.mutating) {
      // delete needs provenance check per path
      if (type === 'delete') {
        for (const p of built.args.paths) {
          const rows = await sr.entities.FileIndex.filter(
            { root_key: built.args.root_key, path: p }, '-updated_date', 1,
          ).catch((e: any) => ({ __err: String(e?.message || e) }));
          if ((rows as any)?.__err) return Response.json({ error: 'temporarily_unavailable_retry' }, { status: 503 });
          const row = rows?.[0];
          if (row && !canDelete(row)) {
            await sr.entities.FileBridgeEvent.create({
              event_type: 'delete_rejected', actor: user.email, root_key: built.args.root_key, path: p,
              severity: 'warn', details: { reason: 'external origin', origin: row.origin }, ts: now(),
            }).catch(() => null);
            return Response.json({ error: `'${p}' was not created by this app and cannot be deleted.`, path: p }, { status: 403 });
          }
        }
      }
      if (type === 'move') {
        const rows = await sr.entities.FileIndex.filter(
          { root_key: built.args.root_key, path: built.args.src }, '-updated_date', 1,
        ).catch((e: any) => ({ __err: String(e?.message || e) }));
        if ((rows as any)?.__err) return Response.json({ error: 'temporarily_unavailable_retry' }, { status: 503 });
        if (rows?.[0] && !canMove(rows[0])) {
          return Response.json({ error: 'Only bridge-managed files can be moved.' }, { status: 403 });
        }
      }
    }
    if (!(await rateOk(sr, user.email, type))) {
      return Response.json({ error: 'Rate limit — slow down.' }, { status: 429 });
    }
    const enq = await enqueue(sr, user, type, built.args, { request_key: body.request_key });
    if (enq.error) return Response.json({ error: enq.error }, { status: enq.status || 500 });
    return Response.json(enq);
  }

  // ---------- command_status ----------
  if (action === 'command_status') {
    const rows = await sr.entities.FileBridgeCommand.filter(
      { command_id: String(body.command_id || '') }, '-updated_date', 1,
    ).catch(() => []);
    if (!rows?.[0]) return Response.json({ error: 'unknown command' }, { status: 404 });
    const c = rows[0];
    return Response.json({
      ok: true, command_id: c.command_id, type: c.type, status: c.status,
      result: c.result, error: c.error, progress: c.progress, served_by: c.served_by,
    });
  }

  // ---------- get_customer_files ----------
  if (action === 'get_customer_files') {
    const cid = String(body.customer_id || '');
    const links = await sr.entities.CustomerFolderLink.filter(
      { customer_id: cid, status: 'confirmed' }, 'folder_path', 10,
    ).catch(() => []);
    const out: any[] = [];
    for (const l of links || []) {
      const rows = await sr.entities.FileIndex.filter(
        { root_key: l.root_key, parent_path: l.folder_path, missing: { $ne: true }, is_dir: false },
        '-mtime_ms', Math.min(Number(body.limit) || 50, 200),
      ).catch(() => []);
      out.push({ link: l, files: rows || [] });
    }
    return Response.json({ ok: true, links: out });
  }

  // ---------- link_review (suggested CustomerFolderLink queue) ----------
  if (action === 'link_review') {
    const rows = await sr.entities.CustomerFolderLink.filter(
      { status: 'suggested' }, '-confidence', 100,
    ).catch(() => []);
    return Response.json({ ok: true, suggestions: rows || [] });
  }

  // ---------- list_trash (tombstoned rows — the restore surface) ----------
  // Deleted-via-bridge rows keep missing:true + trash_path; the .ccs_trash
  // dir itself is scan-excluded so this query is the only staff view into it.
  if (action === 'list_trash') {
    const q: any = { missing: true };
    if (body.root_key) q.root_key = String(body.root_key);
    const rows = await sr.entities.FileIndex.filter(q, '-mtime_ms', Math.min(Number(body.limit) || 200, 500))
      .catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((rows as any)?.__err) return Response.json({ error: 'read_unavailable' }, { status: 503 });
    return Response.json({
      ok: true,
      entries: (rows || []).filter((r: any) => r.trash_path).map((r: any) => ({
        id: r.id, root_key: r.root_key, path: r.path, name: r.name, size: r.size,
        mtime_ms: r.mtime_ms, trash_path: r.trash_path, ext: r.ext, kind: r.kind,
      })),
    });
  }

  if (action === 'link_decide') {
    const rows = await sr.entities.CustomerFolderLink.filter({ id: String(body.link_id || '') }, '-updated_date', 1).catch(() => []);
    const link = rows?.[0];
    if (!link) return Response.json({ error: 'unknown link' }, { status: 404 });
    const decision = body.decision === 'confirm' ? 'confirmed' : 'rejected';
    await sr.entities.CustomerFolderLink.update(link.id, {
      status: decision, confirmed_by: user.email, confirmed_at: new Date().toISOString(),
      rejected_sticky: decision === 'rejected',
    });
    if (decision === 'confirmed') {
      await enqueue(sr, user, 'relink_files', {
        root_key: link.root_key, path_prefix: link.folder_path, customer_id: link.customer_id,
      });
    }
    await sr.entities.FileBridgeEvent.create({
      event_type: 'link_decision', actor: user.email, customer_id: link.customer_id,
      root_key: link.root_key, path: link.folder_path, details: { decision }, ts: now(), severity: 'info',
    }).catch(() => null);
    return Response.json({ ok: true, status: decision });
  }

  // ---------- send_file_email ----------
  // Sends the delivered file_url as a link (SendEmail has no attachment API).
  // Requires a fresh delivered_url — caller should queue_fetch first when
  // needs_delivery comes back.
  if (action === 'send_file_email') {
    const to = String(body.to || '').trim();
    const p = safeRelPath(String(body.path || ''));
    const root_key = String(body.root_key || '');
    if (!to || !p.ok || !root_key || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return Response.json({ error: 'to, root_key and path are required' }, { status: 400 });
    }
    const rows = await sr.entities.FileIndex.filter(
      { root_key, path: p.path }, '-updated_date', 1,
    ).catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((rows as any)?.__err) return Response.json({ error: 'read_unavailable', retry: true }, { status: 503 });
    const row = rows?.[0];
    const fresh = row?.delivered_url && !(row.delivered_at_ms && row.mtime_ms > row.delivered_at_ms);
    if (!row || !fresh) return Response.json({ needs_delivery: true, ok: false }, { status: 409 });
    const who = user.full_name || user.email;
    const subject = String(body.subject || `File from ${who}: ${row.name}`).slice(0, 200);
    const msg = String(body.message || '').slice(0, 4000);
    await sr.integrations.Core.SendEmail({
      to, subject,
      body: `${msg ? `${msg}\n\n` : ''}${who} shared a file with you from the shop server:\n\n${row.name}\n${row.delivered_url}\n\n(Sent via CCS Signage Workflow)`,
    });
    await sr.entities.FileBridgeEvent.create({
      event_type: 'file_emailed', actor: user.email, root_key, path: p.path,
      severity: 'info', details: { to }, ts: now(),
    }).catch(() => null);
    return Response.json({ ok: true, sent_to: to, file_url: row.delivered_url });
  }

  // ---------- admin_settings ----------
  if (action === 'admin_settings') {
    if (!isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });
    const next = normalizeFileBridgeSettings({ ...settings, ...(body.settings || {}) });
    if (settingsRow?.[0]?.id) {
      await sr.entities.GlobalSettings.update(settingsRow[0].id, { setting_value: next });
    } else {
      await sr.entities.GlobalSettings.create({ setting_key: 'fileBridge', setting_value: next });
    }
    return Response.json({ ok: true, settings: next });
  }

  // ---------- promote_agent / demote_agent (staff-initiated failover) ----------
  // Operator-side counterpart to the agent's become_primary claim. Admin-only:
  // flips settings.primary_agent_id + both agents' health roles. The promoted
  // agent picks up its new role on next handshake/heartbeat (≤120s); the
  // demoted one refuses mutations the moment it re-handshakes.
  if (action === 'promote_agent' || action === 'demote_agent') {
    if (!isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });
    const target = String(body.agent_id || '');
    if (!target) return Response.json({ error: 'agent_id required' }, { status: 400 });
    const hs = await sr.entities.FileBridgeHealth.filter({ agent_id: target }, '-updated_date', 1).catch(() => []);
    if (!hs?.[0]) return Response.json({ error: `unknown agent '${target}'` }, { status: 404 });
    const current = String(settings.primary_agent_id || '');
    if (action === 'promote_agent') {
      if (current === target) return Response.json({ ok: true, already: true, primary: target });
      const next = normalizeFileBridgeSettings({ ...settings, primary_agent_id: target });
      if (!settingsRow?.[0]?.id) return Response.json({ error: 'settings row missing' }, { status: 503 });
      await sr.entities.GlobalSettings.update(settingsRow[0].id, { setting_value: next });
      await sr.entities.FileBridgeHealth.update(hs[0].id, { role: 'primary' }).catch(() => null);
      if (current) {
        const ch = await sr.entities.FileBridgeHealth.filter({ agent_id: current }, '-updated_date', 1).catch(() => []);
        if (ch?.[0]) await sr.entities.FileBridgeHealth.update(ch[0].id, { role: 'backup' }).catch(() => null);
      }
      await sr.entities.FileBridgeEvent.create({
        event_type: 'staff_promote', agent_id: target, actor: user.email || 'staff',
        severity: 'warn', details: { previous_primary: current || null },
      }).catch(() => null);
      return Response.json({ ok: true, primary: target, previous_primary: current || null });
    }
    // demote: only allowed on the configured primary
    if (current !== target) return Response.json({ error: `'${target}' is not the configured primary` }, { status: 409 });
    const next = normalizeFileBridgeSettings({ ...settings, primary_agent_id: '' });
    if (!settingsRow?.[0]?.id) return Response.json({ error: 'settings row missing' }, { status: 503 });
    await sr.entities.GlobalSettings.update(settingsRow[0].id, { setting_value: next });
    await sr.entities.FileBridgeHealth.update(hs[0].id, { role: 'backup' }).catch(() => null);
    await sr.entities.FileBridgeEvent.create({
      event_type: 'staff_demote', agent_id: target, actor: user.email || 'staff',
      severity: 'warn', details: {},
    }).catch(() => null);
    return Response.json({ ok: true, demoted: target, primary: null });
  }

  // ---------- save_root / delete_root (admin — FileShareRoot provisioning) ----------
  // Backend-only RLS means only functions can write roots; the setup wizard
  // and agent `detect_roots` suggestions land here. Upsert keyed on
  // (agent_id, root_key). Deleting a root only drops config — never files.
  if (action === 'save_root') {
    if (!isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });
    const agent_id = String(body.agent_id || settings.primary_agent_id || '');
    const root_key = String(body.root_key || '').replace(/[^\w-]/g, '_').slice(0, 60);
    if (!agent_id || !root_key) return Response.json({ error: 'agent_id + root_key required' }, { status: 400 });
    if (body.rel_root != null) {
      const rr = safeRelPath(String(body.rel_root));
      if (!rr.ok) return Response.json({ error: `rel_root: ${rr.error}` }, { status: 400 });
    }
    const existing = await sr.entities.FileShareRoot.filter({ agent_id, root_key }, '-updated_date', 1)
      .catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((existing as any)?.__err) return Response.json({ error: 'read_unavailable' }, { status: 503 });
    const row: any = {
      agent_id, root_key,
      display_name: String(body.display_name || root_key),
      rel_root: String(body.rel_root ?? existing?.[0]?.rel_root ?? ''),
      unc_path: String(body.unc_path ?? existing?.[0]?.unc_path ?? ''),
      purpose: ['customer_folders', 'general', 'inbound'].includes(body.purpose) ? body.purpose : (existing?.[0]?.purpose || 'general'),
      enabled: body.enabled !== undefined ? !!body.enabled : (existing?.[0]?.enabled ?? true),
      inbound_restricted: body.inbound_restricted !== undefined ? !!body.inbound_restricted : (existing?.[0]?.inbound_restricted ?? false),
      scan_priority: Number.isFinite(Number(body.scan_priority)) ? Number(body.scan_priority) : (existing?.[0]?.scan_priority ?? 100),
      extraction_enabled: body.extraction_enabled !== undefined ? !!body.extraction_enabled : (existing?.[0]?.extraction_enabled ?? false),
    };
    if (existing?.[0]) {
      await sr.entities.FileShareRoot.update(existing[0].id, row).catch(() => null);
    } else {
      await sr.entities.FileShareRoot.create(row).catch((e: any) => ({ __err: String(e?.message || e) }));
    }
    // bump config_version so agents pick it up on next handshake
    if (settingsRow?.[0]?.id) {
      const next = normalizeFileBridgeSettings({ ...settings, config_version: (settings.config_version || 0) + 1 });
      await sr.entities.GlobalSettings.update(settingsRow[0].id, { setting_value: next }).catch(() => null);
    }
    return Response.json({ ok: true, root: row, config_version: (settings.config_version || 0) + 1 });
  }
  if (action === 'delete_root') {
    if (!isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });
    const rows = await sr.entities.FileShareRoot.filter(
      { agent_id: String(body.agent_id || ''), root_key: String(body.root_key || '') }, '-updated_date', 1,
    ).catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((rows as any)?.__err) return Response.json({ error: 'read_unavailable' }, { status: 503 });
    if (!rows?.[0]) return Response.json({ error: 'root not found' }, { status: 404 });
    await sr.entities.FileShareRoot.delete(rows[0].id).catch(() => null);
    if (settingsRow?.[0]?.id) {
      const next = normalizeFileBridgeSettings({ ...settings, config_version: (settings.config_version || 0) + 1 });
      await sr.entities.GlobalSettings.update(settingsRow[0].id, { setting_value: next }).catch(() => null);
    }
    return Response.json({ ok: true, deleted: body.root_key });
  }

  return Response.json({ error: `unknown action '${action}'` }, { status: 400 });
});
