import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  COMMAND_SPECS, canTransition, isTerminal, commandAllowed, routeAgent,
  resolveRole, normalizeFileBridgeSettings, normPath, pathKey, parentPath,
  baseName, extOf, kindOf, safeRelPath, dedupeKey, isExcluded,
  FB_SSE_HOLD_MS, FB_HEALTHY_AGE_MS, FB_REPLAY_WINDOW_MS,
} from '../../shared/fileBridgeModel.ts';

// fileBridgeIngest — HMAC-authenticated agent API (outbound-only transport).
// Agent holds NO Base44 credentials: it signs {key_id, ts, body} with a shared
// secret delivered via env (FILEBRIDGE_HMAC_KEY / _PREV for rotation).

const enc = new TextEncoder();
const te = new TextDecoder();

const toHex = (b: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(b as ArrayBuffer)].map((x) => x.toString(16).padStart(2, '0')).join('');

const hmac = async (key: string, msg: string): Promise<string> => {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
};

const timingSafeEq = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

const uuid = () => crypto.randomUUID();
const now = () => Date.now();

const sha256Hex = async (bytes: Uint8Array): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', bytes.slice().buffer));

async function verifyAgent(req: Request, rawBody: string, sr: any) {
  const keyId = req.headers.get('x-fb-key-id') || '';
  const ts = Number(req.headers.get('x-fb-ts') || '0');
  const sig = req.headers.get('x-fb-sig') || '';
  const agentId = req.headers.get('x-fb-agent') || '';
  if (!keyId || !ts || !sig) return { ok: false, status: 401, error: 'missing auth headers' };
  if (Math.abs(now() - ts) > FB_REPLAY_WINDOW_MS) return { ok: false, status: 401, error: 'stale timestamp' };
  const gs = await getSettings(sr);
  if (gs.error === 'stale_on_error') { /* served last-good — fine */ }
  else if (gs.error) return { ok: false, status: 503, error: 'settings_unavailable' };
  const settings = normalizeFileBridgeSettings(gs.v);
  if (keyId !== String(settings.key_id || 'fbk1')) return { ok: false, status: 401, error: 'bad key_id' };
  const cur = Deno.env.get('FILEBRIDGE_HMAC_KEY') || '';
  const prev = Deno.env.get('FILEBRIDGE_HMAC_KEY_PREV') || '';
  if (!cur) return { ok: false, status: 503, error: 'bridge key not configured' };
  const expectedCur = await hmac(cur, `${ts}.${rawBody}`);
  const expectedPrev = prev ? await hmac(prev, `${ts}.${rawBody}`) : '';
  const ok = timingSafeEq(sig, expectedCur) || (prev ? timingSafeEq(sig, expectedPrev) : false);
  if (!ok) return { ok: false, status: 401, error: 'bad signature' };
  return { ok: true, agentId, settings };
}

let settingsCache: { v: any; at: number } = { v: null, at: 0 };
let lastGood: { v: any; at: number } = { v: null, at: 0 };
// Reads can fail under the shared entity budget — NEVER translate a read
// failure into 'disabled'. Serve last-good settings for ≤10min on error.
async function getSettings(sr: any): Promise<{ v: any; error?: string }> {
  if (settingsCache.v && now() - settingsCache.at < 60_000) return { v: settingsCache.v };
  const rows = await sr.entities.GlobalSettings.filter({ setting_key: 'fileBridge' }, '-updated_date', 1)
    .catch((e: any) => ({ __err: String(e?.message || e) }));
  if (rows?.__err) {
    if (lastGood.v && now() - lastGood.at < 600_000) return { v: lastGood.v, error: 'stale_on_error' };
    return { v: null, error: rows.__err };
  }
  const v = rows?.[0]?.setting_value ?? null;
  settingsCache = { v, at: now() };
  if (v) lastGood = { v, at: now() };
  return { v };
}

const ev = (sr: any, e: Record<string, any>) =>
  sr.entities.FileBridgeEvent.create({ ts: now(), severity: 'info', ...e }).catch(() => null);

async function getHealth(sr: any, agentId: string) {
  const rows = await sr.entities.FileBridgeHealth.filter({ agent_id: agentId }, '-updated_date', 1).catch(() => []);
  return rows?.[0] || null;
}

async function upsertHealth(sr: any, agentId: string, patch: Record<string, any>) {
  const row = await getHealth(sr, agentId);
  // index_stats is the free-object field — merge rather than replace so
  // handshake-written keys (e.g. detected_shares) survive heartbeat stats.
  const merged = { ...patch };
  if (patch.index_stats && row?.index_stats) merged.index_stats = { ...row.index_stats, ...patch.index_stats };
  if (row) return sr.entities.FileBridgeHealth.update(row.id, { ...merged, last_seen_ms: now() });
  return sr.entities.FileBridgeHealth.create({ agent_id: agentId, last_seen_ms: now(), state: 'online', ...merged });
}

async function pendingCommands(sr: any, agentId: string, limit = 10) {
  const rows = await sr.entities.FileBridgeCommand.filter(
    { agent_id: agentId, status: 'queued' }, 'created_ts', limit * 3,
  ).catch((e: any) => ({ __err: String(e?.message || e) }));
  if (rows?.__err || !Array.isArray(rows)) return rows;
  // Base44 sort is single-field only — order by priority in memory.
  rows.sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0) || a.created_ts - b.created_ts);
  return rows.slice(0, limit);
}

const BUNDLE_REV = 'fb-ingest-2026-11-05a';

// Assemble staged FileBridgeChunk rows for a command → UploadFile → stamp
// FileIndex.delivered_url → purge chunks → complete command. Shared by
// deliver_chunk (last-arriving seq) and deliver_stitch (explicit retry after
// a partial stage, e.g. a worker died mid-assembly). Caller must ensure cmd
// is not terminal.
async function stitchStaged(sr: any, cmd: any, ordered: any[], agentId: string, opts: { file_sha256?: string; name?: string }) {
  const parts: Uint8Array[] = [];
  for (const c of ordered) {
    const resp = await fetch(String(c.file_url));
    if (!resp.ok) return { ok: false as const, status: 503, body: { error: `chunk fetch ${c.seq} failed`, retry: true } };
    parts.push(new Uint8Array(await resp.arrayBuffer()));
  }
  const size = parts.reduce((n, p) => n + p.length, 0);
  if (size > 256 * 1024 * 1024) return { ok: false as const, status: 413, body: { error: 'assembled over 256MB cap', needs_proxy: true } };
  const whole = new Uint8Array(size);
  let off = 0; for (const p of parts) { whole.set(p, off); off += p.length; }
  const wholeSha = await sha256Hex(whole);
  if (opts.file_sha256 && opts.file_sha256 !== wholeSha) {
    await sr.entities.FileBridgeChunk.deleteMany({ id: { $in: ordered.map((c: any) => c.id).filter(Boolean) } }).catch(() => null);
    return { ok: false as const, status: 409, body: { error: 'assembled sha256 mismatch — chunks purged, re-deliver', retry: true } };
  }
  const file = new File([whole], String(opts.name || 'delivery.bin'));
  const up = await sr.integrations.Core.UploadFile({ file });
  if (cmd.args?.root_key && cmd.args?.path) {
    const pk = pathKey(cmd.agent_id || agentId, cmd.args.root_key, cmd.args.path);
    const ir = await sr.entities.FileIndex.filter({ path_key: pk }, '-updated_date', 1).catch(() => []);
    if (ir?.[0]) {
      await sr.entities.FileIndex.update(ir[0].id, {
        delivered_url: up.file_url, delivered_at_ms: now(), sha256: wholeSha,
      }).catch(() => null);
    }
  }
  await sr.entities.FileBridgeChunk.deleteMany({ id: { $in: ordered.map((c: any) => c.id).filter(Boolean) } }).catch(() => null);
  if (!isTerminal(cmd.status)) {
    await sr.entities.FileBridgeCommand.update(cmd.id, {
      status: 'completed', updated_ts: now(),
      result: { file_url: up.file_url, bytes: size, sha256: wholeSha },
    });
  }
  return { ok: true as const, status: 200, body: { ok: true, file_url: up.file_url, bytes: size, sha256: wholeSha, assembled: true } };
}

Deno.serve(async (req) => {
  const rawBody = await req.text();
  const client = createClientFromRequest(req);
  const sr = (client as any).asServiceRole;
  let body: any = {};
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }

  const auth = await verifyAgent(req, rawBody, sr);
  if (!auth.ok) {
    await ev(sr, { event_type: 'auth_failed', actor: req.headers.get('x-fb-agent') || 'unknown', severity: 'warn', details: { reason: auth.error } });
    return Response.json({ error: auth.error }, { status: auth.status });
  }
  const settings = auth.settings;
  const action = String(body.action || '');
  const agentId = auth.agentId || String(body.agent_id || '');

  // ---------- bootstrap_settings: first-run setup (HMAC-gated). Creates the
  // settings row if absent so the bridge can come up without manual UI steps.
  if (action === 'bootstrap_settings') {
    const rows = await sr.entities.GlobalSettings.filter({ setting_key: 'fileBridge' }, '-updated_date', 1).catch(() => []);
    const raw = rows?.[0]?.setting_value;
    const exists = !!(raw && typeof raw === 'object' && Object.keys(raw).length);
    const next = normalizeFileBridgeSettings({
      ...(exists ? raw : {}),
      enabled: true, primary_agent_id: agentId, key_id: String(body.key_id || 'fbk1'),
      ...(body.settings && typeof body.settings === 'object' ? body.settings : {}),
    });
    let writeErr = '';
    if (exists) {
      const u = await sr.entities.GlobalSettings.update(rows[0].id, { setting_value: next }).catch((e: any) => ({ __err: String(e?.message || e) }));
      if (u?.__err) writeErr = u.__err;
    } else {
      const c = await sr.entities.GlobalSettings.create({ setting_key: 'fileBridge', setting_value: next }).catch((e: any) => ({ __err: String(e?.message || e) }));
      if (c?.__err) writeErr = c.__err;
    }
    settingsCache = { v: null, at: 0 };
    await ev(sr, { event_type: 'bootstrap_settings', agent_id: agentId, actor: agentId, details: { existed: exists, writeErr } });
    return Response.json({ ok: !writeErr, existed: exists, settings: next, ...(writeErr ? { error: `settings write failed: ${writeErr}` } : {}) }, { status: writeErr ? 503 : 200 });
  }

  if (!settings.enabled) return Response.json({ error: 'fileBridge disabled', rev: BUNDLE_REV }, { status: 503 });

  // ---------- handshake ----------
  if (action === 'handshake') {
    const envRole = String(body.env_role || '');
    const role = resolveRole(agentId, envRole, settings);
    // singleton-primary guard: never two live primaries
    if (role === 'primary') {
      const rows = await sr.entities.FileBridgeHealth.filter({ role: 'primary' }, '-updated_date', 5).catch(() => []);
      const other = (rows || []).find((r: any) => r.agent_id !== agentId && now() - (r.last_seen_ms || 0) < FB_HEALTHY_AGE_MS);
      if (other) {
        await ev(sr, { event_type: 'role_conflict', agent_id: agentId, actor: agentId, severity: 'error', details: { existing: other.agent_id } });
        return Response.json({ error: `primary already held by ${other.agent_id}`, role: 'observer' }, { status: 409 });
      }
    }
    await upsertHealth(sr, agentId, {
      role, state: 'online', agent_version: body.agent_version || '', agent_host: body.host || '',
      display_name: body.display_name || agentId, spool_depth: body.spool_depth || 0,
      index_stats: { detected_shares: body.detected_shares || null },
    });
    const roots = await sr.entities.FileShareRoot.filter({ agent_id: agentId }, 'root_key', 50).catch(() => []);
    return Response.json({
      ok: true, agent_id: agentId, role,
      config_version: settings.config_version,
      config: {
        roots: roots || [], exclude_patterns: settings.exclude_patterns,
        extraction_roots: settings.extraction_roots, content_search: settings.content_search,
      },
      detect_roots: body.detected_shares || null,
      server_time_ms: now(),
    });
  }

  // ---------- heartbeat ----------
  if (action === 'heartbeat') {
    await upsertHealth(sr, agentId, {
      state: 'online', spool_depth: body.spool_depth || 0,
      index_stats: body.index_stats || undefined, last_scan_at: body.last_scan_at || undefined,
      error: body.error || '',
    });
    return Response.json({ ok: true, config_version: settings.config_version, server_time_ms: now(), rev: BUNDLE_REV });
  }

  // ---------- command_poll (short-poll fallback) ----------
  if (action === 'command_poll') {
    await upsertHealth(sr, agentId, { state: 'online' });
    const cmds = await pendingCommands(sr, agentId);
    if ((cmds as any)?.__err) return Response.json({ error: 'read_unavailable', retry: true }, { status: 503 });
    // lease them
    const leased: any[] = [];
    for (const c of cmds as any[]) {
      const spec = COMMAND_SPECS[c.type];
      const lease_ms = spec?.lease_ms || 60_000;
      const u = await sr.entities.FileBridgeCommand.update(c.id, {
        status: 'leased', leased_by: agentId, lease_expires_ms: now() + lease_ms, updated_ts: now(),
      }).catch(() => null);
      if (u) leased.push({ command_id: c.command_id, id: c.id, type: c.type, args: c.args });
    }
    return Response.json({ ok: true, commands: leased, server_time_ms: now(), rev: BUNDLE_REV });
  }

  // ---------- command_wait (SSE long-poll = primary wake channel) ----------
  if (action === 'command_wait') {
    await upsertHealth(sr, agentId, { state: 'online' });
    const holdMs = Math.min(Number(body.hold_ms) || FB_SSE_HOLD_MS, 55_000);
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: any) => {
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { /* closed */ }
        };
        send({ type: 'hello', agent_id: agentId, server_time_ms: now() });
        const t0 = now();
        while (now() - t0 < holdMs) {
          const cmds = await pendingCommands(sr, agentId, 5);
          if ((cmds as any)?.__err) { send({ type: 'degraded' }); await new Promise((r) => setTimeout(r, 4000)); continue; }
          if ((cmds as any[]).length) {
            for (const c of cmds as any[]) {
              const spec = COMMAND_SPECS[c.type];
              const u = await sr.entities.FileBridgeCommand.update(c.id, {
                status: 'leased', leased_by: agentId,
                lease_expires_ms: now() + (spec?.lease_ms || 60_000), updated_ts: now(),
              }).catch(() => null);
              if (u) send({ type: 'command', command_id: c.command_id, id: c.id, cmd_type: c.type, args: c.args });
            }
          }
          await new Promise((r) => setTimeout(r, 800));
          send({ type: 'tick', t: now() - t0 });
        }
        send({ type: 'bye', held_ms: now() - t0 });
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' },
    });
  }

  // ---------- command_complete (idempotent) ----------
  if (action === 'command_complete') {
    const cid = String(body.command_id || '');
    const rows = await sr.entities.FileBridgeCommand.filter({ command_id: cid }, '-updated_date', 1)
      .catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((rows as any)?.__err) return Response.json({ error: 'read_unavailable', retry: true }, { status: 503 });
    const cmd = rows?.[0];
    if (!cmd) return Response.json({ error: 'unknown command' }, { status: 404 });
    if (isTerminal(cmd.status)) return Response.json({ ok: true, already: true }); // idempotent
    const to = body.success === false ? 'failed' : 'completed';
    if (!canTransition(cmd.status, to)) {
      return Response.json({ error: `bad transition ${cmd.status}->${to}` }, { status: 409 });
    }
    await sr.entities.FileBridgeCommand.update(cmd.id, {
      status: to, result: body.result || {}, error: body.error || '',
      progress: body.progress || undefined, updated_ts: now(),
    });
    // upload_apply completion stamps the permanent provenance ledger.
    if (cmd.type === 'upload_apply' && cmd.args?.upload_id) {
      await sr.entities.FileBridgeUpload.update(cmd.args.upload_row || '', {
        status: to === 'completed' ? 'applied' : 'failed',
        applied_at: to === 'completed' ? new Date().toISOString() : undefined,
        error: to === 'completed' ? '' : String(body.error || 'apply failed').slice(0, 300),
        path: body.result?.path || undefined,
      }).catch(async () => {
        const rows = await sr.entities.FileBridgeUpload.filter({ upload_id: cmd.args.upload_id }, '-updated_date', 1).catch(() => []);
        if (rows?.[0]) {
          await sr.entities.FileBridgeUpload.update(rows[0].id, {
            status: to === 'completed' ? 'applied' : 'failed',
            applied_at: to === 'completed' ? new Date().toISOString() : undefined,
            error: to === 'completed' ? '' : String(body.error || 'apply failed').slice(0, 300),
            path: body.result?.path || undefined,
          }).catch(() => null);
        }
      });
    }
    return Response.json({ ok: true });
  }

  // ---------- command_progress ----------
  if (action === 'command_progress') {
    const rows = await sr.entities.FileBridgeCommand.filter({ command_id: String(body.command_id || '') }, '-updated_date', 1).catch(() => []);
    const cmd = rows?.[0];
    if (!cmd || isTerminal(cmd.status)) return Response.json({ ok: true });
    await sr.entities.FileBridgeCommand.update(cmd.id, { progress: body.progress || {}, status: 'running', updated_ts: now() }).catch(() => null);
    return Response.json({ ok: true });
  }

  // ---------- index_batch (entity-id-first; bulkCreate inserts; one batched resolve) ----------
  if (action === 'index_batch') {
    const items: any[] = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
    const t0 = now();
    const toUpdate: Array<{ id: string; data: any }> = [];
    const toResolve: any[] = [];
    const idMap: Record<string, string> = {};
    for (const it of items) {
      const rp = safeRelPath(String(it.path || ''));
      if (!rp.ok) continue;
      const data: any = {
        agent_id: agentId, root_key: String(it.root_key || ''),
        path: rp.path, name: baseName(rp.path), parent_path: parentPath(rp.path),
        ext: extOf(rp.path), kind: kindOf(rp.path),
        served_by: body.served_by || undefined,
        last_seen_scan: body.scan_id || undefined,
      };
      // State fields apply ONLY when present — scan items carry them, but
      // sparse patches (pin/relink) must not wipe existing values.
      if (it.is_dir !== undefined) data.is_dir = !!it.is_dir;
      if (it.size !== undefined) data.size = it.size || 0;
      if (it.mtime_ms !== undefined) data.mtime_ms = it.mtime_ms || 0;
      if (it.dir_size_bytes !== undefined) data.dir_size_bytes = it.dir_size_bytes;
      if (it.missing !== undefined) data.missing = !!it.missing;
      if (it.customer_ids !== undefined) data.customer_ids = it.customer_ids;
      if (it.hot !== undefined) data.hot = !!it.hot;
      if (it.hot_score !== undefined) data.hot_score = it.hot_score;
      if (it.pinned !== undefined) data.pinned = !!it.pinned;
      if (it.entity_id) toUpdate.push({ id: String(it.entity_id), data });
      else toResolve.push(data);
    }
    // one batched path_key resolution for unknowns
    if (toResolve.length) {
      const keys = toResolve.map((d) => pathKey(d.agent_id, d.root_key, d.path));
      // A swallowed read error here would turn known rows into duplicate
      // path_key creates — surface it, the agent retries the whole batch.
      const found = await sr.entities.FileIndex.filter({ path_key: { $in: keys.slice(0, 200) } }, undefined, 500)
        .catch((e: any) => ({ __err: String(e?.message || e) }));
      if ((found as any)?.__err) return Response.json({ error: 'read_unavailable', retry: true }, { status: 503 });
      const byKey = new Map(((found as any[]) || []).map((r: any) => [r.path_key, r.id]));
      const toCreate: any[] = [];
      toResolve.forEach((d, i) => {
        const pk = keys[i];
        const existing = byKey.get(pk);
        if (existing) { toUpdate.push({ id: existing, data: d }); idMap[pk] = existing; }
        else toCreate.push({
          ...d, path_key: pk, creation_request_key: pk,
          origin: 'external', managed_by: 'none',
          customer_ids: d.customer_ids || [], pinned: !!d.pinned,
          hot: !!d.hot, hot_score: d.hot_score || 0,
        });
      });
      if (toCreate.length) {
        const created = await sr.entities.FileIndex.bulkCreate(toCreate)
          .catch((e: any) => ({ __err: String(e?.message || e) }));
        if ((created as any)?.__err) return Response.json({ error: 'write_unavailable', retry: true }, { status: 503 });
        for (const r of (created as any[]) || []) if (r?.path_key) idMap[r.path_key] = r.id;
      }
    }
    let updateFailures = 0;
    for (const u of toUpdate) {
      const r = await sr.entities.FileIndex.update(u.id, u.data).catch(() => null);
      if (!r) updateFailures += 1;
    }
    return Response.json({
      ok: true, received: items.length, updated: toUpdate.length - updateFailures,
      update_failures: updateFailures || undefined,
      id_map: idMap, suggested_batch_size: items.length >= 500 ? 500 : Math.max(100, items.length * 2),
      elapsed_ms: now() - t0,
    });
  }

  // ---------- thumb_push / preview_push ----------
  if (action === 'thumb_push' || action === 'preview_push') {
    const pk = String(body.path_key || '');
    const rows = await sr.entities.FileIndex.filter({ path_key: pk }, '-updated_date', 1)
      .catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((rows as any)?.__err) return Response.json({ error: 'read_unavailable', retry: true }, { status: 503 });
    const row = rows?.[0];
    if (!row) return Response.json({ error: 'no index row' }, { status: 404 });
    const bytes = Uint8Array.from(atob(String(body.bytes_b64 || '')), (c) => c.charCodeAt(0));
    if (bytes.length > 2 * 1024 * 1024) return Response.json({ error: 'rendition too large' }, { status: 413 });
    const file = new File([bytes], action === 'thumb_push' ? 'thumb.webp' : 'preview.pdf');
    const up = await sr.integrations.Core.UploadFile({ file });
    const patch: any = action === 'thumb_push'
      ? { thumb_url: up.file_url }
      : { preview_url: up.file_url, preview_state: 'ready' };
    await sr.entities.FileIndex.update(row.id, patch);
    return Response.json({ ok: true, file_url: up.file_url });
  }

  // ---------- deliver_complete (≤48MB single-shot full bytes) ----------
  if (action === 'deliver_complete') {
    const cid = String(body.command_id || '');
    const rows = await sr.entities.FileBridgeCommand.filter({ command_id: cid }, '-updated_date', 1)
      .catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((rows as any)?.__err) return Response.json({ error: 'read_unavailable', retry: true }, { status: 503 });
    const cmd = rows?.[0];
    if (!cmd) return Response.json({ error: 'unknown command' }, { status: 404 });
    const bytes = Uint8Array.from(atob(String(body.bytes_b64 || '')), (c) => c.charCodeAt(0));
    if (bytes.length > 48 * 1024 * 1024) return Response.json({ error: 'over inline cap' }, { status: 413 });
    const file = new File([bytes], String(body.name || 'delivery.bin'));
    const up = await sr.integrations.Core.UploadFile({ file });
    // stamp delivered_url on the index row when identifiable
    if (cmd.args?.root_key && cmd.args?.path) {
      const pk = pathKey(cmd.agent_id || agentId, cmd.args.root_key, cmd.args.path);
      const ir = await sr.entities.FileIndex.filter({ path_key: pk }, '-updated_date', 1).catch(() => []);
      if (ir?.[0]) {
        await sr.entities.FileIndex.update(ir[0].id, {
          delivered_url: up.file_url, delivered_at_ms: now(), sha256: body.sha256 || undefined,
        }).catch(() => null);
      }
    }
    if (!isTerminal(cmd.status)) {
      await sr.entities.FileBridgeCommand.update(cmd.id, {
        status: 'completed', updated_ts: now(),
        result: { file_url: up.file_url, bytes: bytes.length, sha256: body.sha256 || '' },
      });
    }
    return Response.json({ ok: true, file_url: up.file_url });
  }

  // ---------- deliver_chunk (>48MB staged delivery) ----------
  // Agent posts raw chunks; each is UploadFile'd and staged in FileBridgeChunk.
  // When all `total` seqs are present, chunks are fetched back, assembled,
  // whole-file sha256 verified, uploaded, and the command completed.
  // Re-posting a seq is idempotent (dedupe on command_id+seq).
  if (action === 'deliver_chunk') {
    const cid = String(body.command_id || '');
    const seq = Number(body.seq);
    const total = Number(body.total);
    if (!cid || !Number.isInteger(seq) || !Number.isInteger(total) || seq < 0 || total < 1 || seq >= total || total > 64) {
      return Response.json({ error: 'bad chunk envelope' }, { status: 400 });
    }
    const cmdRows = await sr.entities.FileBridgeCommand.filter({ command_id: cid }, '-updated_date', 1)
      .catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((cmdRows as any)?.__err) return Response.json({ error: 'read_unavailable', retry: true }, { status: 503 });
    const cmd = cmdRows?.[0];
    if (!cmd) return Response.json({ error: 'unknown command' }, { status: 404 });
    if (isTerminal(cmd.status)) return Response.json({ ok: true, already: true, file_url: cmd.result?.file_url });

    const bytes = Uint8Array.from(atob(String(body.bytes_b64 || '')), (c) => c.charCodeAt(0));
    if (bytes.length > 48 * 1024 * 1024) return Response.json({ error: 'chunk over inline cap' }, { status: 413 });

    // stage this seq (dedupe)
    const have = await sr.entities.FileBridgeChunk.filter({ command_id: cid }, 'seq', 64).catch(() => []);
    if (!(have || []).some((c: any) => c.seq === seq)) {
      const csha = String(body.sha256 || '') || await sha256Hex(bytes);
      const file = new File([bytes], `${cid}.part${seq}`);
      const up = await sr.integrations.Core.UploadFile({ file });
      const created = await sr.entities.FileBridgeChunk.create({
        command_id: cid, seq, file_url: up.file_url, bytes: bytes.length, sha256: csha, received_at: now(),
      }).catch(() => null);
      have.push({ id: created?.id, seq, file_url: up.file_url, bytes: bytes.length, sha256: csha });
    }
    const received = (have || []).length;
    if (!isTerminal(cmd.status)) {
      await sr.entities.FileBridgeCommand.update(cmd.id, {
        progress: { done: received, total, label: 'receiving' }, updated_ts: now(),
      }).catch(() => null);
    }
    if (received < total) return Response.json({ ok: true, received, total });

    // ---- assemble ----
    const ordered = (have || []).slice().sort((a: any, b: any) => a.seq - b.seq);
    const st = await stitchStaged(sr, cmd, ordered, agentId, { file_sha256: body.file_sha256, name: body.name });
    return Response.json(st.body, { status: st.status });
  }

  // ---------- deliver_stitch (explicit re-assembly — no new bytes) ----------
  // Recovery path for a command whose chunks all staged but assembly never ran
  // (worker died between last chunk and assemble). Idempotent: re-checks the
  // staged set against `total` (body or cmd.progress.total) and stitches.
  if (action === 'deliver_stitch') {
    const cid = String(body.command_id || '');
    if (!cid) return Response.json({ error: 'bad command_id' }, { status: 400 });
    const cmdRows = await sr.entities.FileBridgeCommand.filter({ command_id: cid }, '-updated_date', 1)
      .catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((cmdRows as any)?.__err) return Response.json({ error: 'read_unavailable', retry: true }, { status: 503 });
    const cmd = cmdRows?.[0];
    if (!cmd) return Response.json({ error: 'unknown command' }, { status: 404 });
    if (isTerminal(cmd.status)) return Response.json({ ok: true, already: true, file_url: cmd.result?.file_url });
    const total = Number(body.total) || Number(cmd.progress?.total) || 0;
    const have = await sr.entities.FileBridgeChunk.filter({ command_id: cid }, 'seq', 64)
      .catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((have as any)?.__err) return Response.json({ error: 'read_unavailable', retry: true }, { status: 503 });
    const staged = (have || []) as any[];
    if (!total || staged.length < total) {
      return Response.json({ ok: true, assembled: false, received: staged.length, total }, { status: 200 });
    }
    const seqs = new Set(staged.map((c: any) => c.seq));
    for (let i = 0; i < total; i++) {
      if (!seqs.has(i)) return Response.json({ ok: true, assembled: false, missing_seq: i, received: staged.length, total });
    }
    const ordered = staged.slice().sort((a: any, b: any) => a.seq - b.seq);
    const st = await stitchStaged(sr, cmd, ordered, agentId, { file_sha256: body.file_sha256, name: body.name });
    return Response.json(st.body, { status: st.status });
  }

  // ---------- event ----------
  if (action === 'event') {
    await ev(sr, {
      event_type: String(body.event_type || 'agent_event'), agent_id: agentId, actor: agentId,
      severity: ['info', 'warn', 'error'].includes(body.severity) ? body.severity : 'info',
      root_key: body.root_key, path: body.path ? normPath(body.path) : undefined,
      command_id: body.command_id, customer_id: body.customer_id, details: body.details || {},
    });
    return Response.json({ ok: true });
  }

  // ---------- recent_batch ----------
  if (action === 'recent_batch') {
    const items: any[] = Array.isArray(body.items) ? body.items.slice(0, 300) : [];
    const rows = items.map((it) => {
      const rp = safeRelPath(String(it.path || ''));
      return rp.ok ? {
        agent_id: agentId, root_key: String(it.root_key || ''), path: rp.path,
        name: baseName(rp.path), ext: extOf(rp.path), is_dir: !!it.is_dir,
        change_type: ['created', 'modified', 'deleted', 'moved'].includes(it.change_type) ? it.change_type : 'modified',
        size: it.size || 0, mtime_ms: it.mtime_ms || 0,
        customer_id: it.customer_id || undefined, event_ts: it.event_ts || now(), seq: it.seq || now(),
      } : null;
    }).filter(Boolean);
    if (rows.length) await sr.entities.FileBridgeRecent.bulkCreate(rows).catch(() => null);
    return Response.json({ ok: true, received: rows.length });
  }

  // ---------- manifest_export (ledger → agent manifest rebuild source) ----------
  // The FileBridgeUpload append-only ledger is the durable provenance record —
  // it survives index reaping and agent reinstalls, so a promoted/reinstalled
  // agent can rebuild manifest.json (the delete/move security boundary) from it.
  if (action === 'manifest_export') {
    const rows = await sr.entities.FileBridgeUpload.filter(
      { agent_id: agentId }, 'created_date', 2000,
    ).catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((rows as any)?.__err) return Response.json({ error: 'read_unavailable', retry: true }, { status: 503 });
    const entries = (rows || []).filter((u: any) => u.status !== 'failed').map((u: any) => ({
      root_key: u.root_key, path: u.path, origin: 'bridge', managed_by: 'bridge',
      upload_id: u.upload_id, uploaded_by: u.uploaded_by, created_ts: u.created_ts || 0,
    }));
    return Response.json({ ok: true, entries });
  }

  // ---------- manifest_sync (drift check: agent manifest vs server ledger) ----------
  // Agent sends a digest of its local manifest.json; server digests the
  // FileBridgeUpload ledger the same way and reports in_sync. Canonical form:
  // sorted 'root_key|path|origin|managed_by' lines, sha256 hex.
  if (action === 'manifest_sync') {
    const rows = await sr.entities.FileBridgeUpload.filter(
      { agent_id: agentId }, 'created_date', 2000,
    ).catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((rows as any)?.__err) return Response.json({ error: 'read_unavailable', retry: true }, { status: 503 });
    const lines = (rows || []).filter((u: any) => u.status !== 'failed')
      .map((u: any) => `${u.root_key}|${u.path}|bridge|bridge`).sort();
    const serverDigest = await sha256Hex(new TextEncoder().encode(lines.join('\n')));
    const agentDigest = String(body.digest || '');
    const agentCount = Number(body.count) || 0;
    return Response.json({
      ok: true,
      in_sync: agentDigest === serverDigest && agentCount === lines.length,
      server_digest: serverDigest, server_count: lines.length,
      drift: agentDigest === serverDigest ? lines.length - agentCount : null,
    });
  }

  // ---------- inventory_report (per-ext openability + totals snapshot) ----------
  if (action === 'inventory_report') {
    const runId = String(body.run_id || `inv-${agentId}-${now()}`);
    const status = ['running', 'completed', 'failed', 'paused'].includes(body.status) ? body.status : 'completed';
    const existing = await sr.entities.FileBridgeInventory.filter(
      { run_id: runId, agent_id: agentId }, '-updated_date', 1,
    ).catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((existing as any)?.__err) return Response.json({ error: 'read_unavailable', retry: true }, { status: 503 });
    const row = {
      run_id: runId, agent_id: agentId, status,
      roots: Array.isArray(body.roots) ? body.roots.map(String).slice(0, 50) : [],
      totals: body.totals && typeof body.totals === 'object' ? body.totals : {},
      ext_map: body.ext_map && typeof body.ext_map === 'object' ? body.ext_map : {},
      top_dirs: Array.isArray(body.top_dirs) ? body.top_dirs.slice(0, 100) : [],
      cursor: body.cursor && typeof body.cursor === 'object' ? body.cursor : {},
      errors: Array.isArray(body.errors) ? body.errors.slice(0, 50) : [],
      ...(body.started_at ? { started_at: String(body.started_at) } : {}),
      ...(status === 'completed' || status === 'failed' ? { finished_at: new Date(now()).toISOString() } : {}),
    };
    if (existing?.[0]) {
      await sr.entities.FileBridgeInventory.update(existing[0].id, row).catch(() => null);
      return Response.json({ ok: true, run_id: runId, updated: true });
    }
    const c = await sr.entities.FileBridgeInventory.create(row).catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((c as any)?.__err) return Response.json({ error: 'write_unavailable', retry: true }, { status: 503 });
    return Response.json({ ok: true, run_id: runId });
  }

  // ---------- become_primary (failover promotion — mutating) ----------
  // Backup agent asks to take primary. Allowed when: no primary configured,
  // this agent already is primary, the configured primary is stale/offline,
  // or `force:true`. Updates settings + health role; emits a failover event.
  if (action === 'become_primary') {
    const current = String(settings.primary_agent_id || '');
    if (current === agentId) {
      return Response.json({ ok: true, role: 'primary', already: true });
    }
    if (current && !body.force) {
      const rows = await sr.entities.FileBridgeHealth.filter({ agent_id: current }, '-updated_date', 1)
        .catch((e: any) => ({ __err: String(e?.message || e) }));
      if ((rows as any)?.__err) return Response.json({ error: 'read_unavailable', retry: true }, { status: 503 });
      const cur = rows?.[0];
      const fresh = cur && now() - (cur.last_seen_ms || 0) < FB_HEALTHY_AGE_MS;
      if (fresh) {
        await ev(sr, { event_type: 'failover_refused', agent_id: agentId, actor: agentId, severity: 'warn', details: { primary: current, primary_state: cur.state } });
        return Response.json({ error: `primary '${current}' still healthy`, primary: current, primary_last_seen_ms: cur.last_seen_ms }, { status: 409 });
      }
    }
    // promote: settings row update (find it first — bootstrap guarantees it exists)
    const gs = await sr.entities.GlobalSettings.filter({ setting_key: 'fileBridge' }, '-updated_date', 1)
      .catch((e: any) => ({ __err: String(e?.message || e) }));
    if ((gs as any)?.__err) return Response.json({ error: 'read_unavailable', retry: true }, { status: 503 });
    if (!gs?.[0]) return Response.json({ error: 'settings row missing — run bootstrap_settings' }, { status: 503 });
    const nextSettings = normalizeFileBridgeSettings({ ...settings, primary_agent_id: agentId });
    const u = await sr.entities.GlobalSettings.update(gs[0].id, { setting_value: nextSettings })
      .catch((e: any) => ({ __err: String(e?.message || e) }));
    if (u?.__err) return Response.json({ error: 'write_unavailable', retry: true }, { status: 503 });
    settingsCache = { v: null, at: 0 };
    await upsertHealth(sr, agentId, { role: 'primary', state: 'online' });
    if (current) await upsertHealth(sr, current, { role: 'backup', state: 'demoted' }).catch(() => null);
    await ev(sr, { event_type: 'failover_promoted', agent_id: agentId, actor: agentId, severity: 'warn', details: { previous_primary: current || null, forced: !!body.force } });
    const roots = await sr.entities.FileShareRoot.filter({ agent_id: agentId }, 'root_key', 50).catch(() => []);
    return Response.json({
      ok: true, role: 'primary', previous_primary: current || null,
      config_version: nextSettings.config_version,
      config: { roots: roots || [], exclude_patterns: nextSettings.exclude_patterns },
    });
  }

  return Response.json({ error: `unknown action '${action}'` }, { status: 400 });
});
