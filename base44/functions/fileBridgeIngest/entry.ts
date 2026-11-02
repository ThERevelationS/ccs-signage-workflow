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

async function verifyAgent(req: Request, rawBody: string, sr: any) {
  const keyId = req.headers.get('x-fb-key-id') || '';
  const ts = Number(req.headers.get('x-fb-ts') || '0');
  const sig = req.headers.get('x-fb-sig') || '';
  const agentId = req.headers.get('x-fb-agent') || '';
  if (!keyId || !ts || !sig) return { ok: false, status: 401, error: 'missing auth headers' };
  if (Math.abs(now() - ts) > FB_REPLAY_WINDOW_MS) return { ok: false, status: 401, error: 'stale timestamp' };
  const settings = normalizeFileBridgeSettings(await getSettings(sr));
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
async function getSettings(sr: any) {
  if (settingsCache.v && now() - settingsCache.at < 60_000) return settingsCache.v;
  const rows = await sr.entities.GlobalSettings.filter({ key: 'fileBridge' }, '-updated_date', 1).catch(() => []);
  const v = rows?.[0]?.value ?? null;
  settingsCache = { v, at: now() };
  return v;
}

const ev = (sr: any, e: Record<string, any>) =>
  sr.entities.FileBridgeEvent.create({ ts: now(), severity: 'info', ...e }).catch(() => null);

async function getHealth(sr: any, agentId: string) {
  const rows = await sr.entities.FileBridgeHealth.filter({ agent_id: agentId }, '-updated_date', 1).catch(() => []);
  return rows?.[0] || null;
}

async function upsertHealth(sr: any, agentId: string, patch: Record<string, any>) {
  const row = await getHealth(sr, agentId);
  if (row) return sr.entities.FileBridgeHealth.update(row.id, { ...patch, last_seen_ms: now() });
  return sr.entities.FileBridgeHealth.create({ agent_id: agentId, last_seen_ms: now(), state: 'online', ...patch });
}

async function pendingCommands(sr: any, agentId: string, limit = 10) {
  const rows = await sr.entities.FileBridgeCommand.filter(
    { agent_id: agentId, status: 'queued' }, 'priority,created_ts', limit,
  ).catch(() => []);
  return rows || [];
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
  if (!settings.enabled) return Response.json({ error: 'fileBridge disabled' }, { status: 503 });

  const action = String(body.action || '');
  const agentId = auth.agentId || String(body.agent_id || '');

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
    return Response.json({ ok: true, config_version: settings.config_version, server_time_ms: now() });
  }

  // ---------- command_poll (short-poll fallback) ----------
  if (action === 'command_poll') {
    await upsertHealth(sr, agentId, { state: 'online' });
    const cmds = await pendingCommands(sr, agentId);
    // lease them
    const leased: any[] = [];
    for (const c of cmds) {
      const spec = COMMAND_SPECS[c.type];
      const lease_ms = spec?.lease_ms || 60_000;
      const u = await sr.entities.FileBridgeCommand.update(c.id, {
        status: 'leased', leased_by: agentId, lease_expires_ms: now() + lease_ms, updated_ts: now(),
      }).catch(() => null);
      if (u) leased.push({ command_id: c.command_id, id: c.id, type: c.type, args: c.args });
    }
    return Response.json({ ok: true, commands: leased, server_time_ms: now() });
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
          if (cmds.length) {
            for (const c of cmds) {
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
    const rows = await sr.entities.FileBridgeCommand.filter({ command_id: cid }, '-updated_date', 1).catch(() => []);
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
      const data = {
        agent_id: agentId, root_key: String(it.root_key || ''),
        path: rp.path, name: baseName(rp.path), parent_path: parentPath(rp.path),
        ext: extOf(rp.path), kind: kindOf(rp.path), is_dir: !!it.is_dir,
        size: it.size || 0, mtime_ms: it.mtime_ms || 0, dir_size_bytes: it.dir_size_bytes,
        customer_ids: it.customer_ids || [], hot: !!it.hot, hot_score: it.hot_score || 0,
        missing: !!it.missing, served_by: body.served_by || undefined,
        last_seen_scan: body.scan_id || undefined,
      };
      if (it.entity_id) toUpdate.push({ id: String(it.entity_id), data });
      else toResolve.push(data);
    }
    // one batched path_key resolution for unknowns
    if (toResolve.length) {
      const keys = toResolve.map((d) => pathKey(d.agent_id, d.root_key, d.path));
      const found = await sr.entities.FileIndex.filter({ path_key: { $in: keys.slice(0, 200) } }, undefined, 500).catch(() => []);
      const byKey = new Map((found || []).map((r: any) => [r.path_key, r.id]));
      const toCreate: any[] = [];
      toResolve.forEach((d, i) => {
        const pk = keys[i];
        const existing = byKey.get(pk);
        if (existing) { toUpdate.push({ id: existing, data: d }); idMap[pk] = existing; }
        else toCreate.push({ ...d, path_key: pk, creation_request_key: pk, origin: 'external', managed_by: 'none' });
      });
      if (toCreate.length) {
        const created = await sr.entities.FileIndex.bulkCreate(toCreate).catch(() => []);
        for (const r of created || []) if (r?.path_key) idMap[r.path_key] = r.id;
      }
    }
    for (const u of toUpdate) {
      await sr.entities.FileIndex.update(u.id, u.data).catch(() => null);
    }
    return Response.json({
      ok: true, received: items.length, updated: toUpdate.length,
      id_map: idMap, suggested_batch_size: items.length >= 500 ? 500 : Math.max(100, items.length * 2),
      elapsed_ms: now() - t0,
    });
  }

  // ---------- thumb_push / preview_push ----------
  if (action === 'thumb_push' || action === 'preview_push') {
    const pk = String(body.path_key || '');
    const rows = await sr.entities.FileIndex.filter({ path_key: pk }, '-updated_date', 1).catch(() => []);
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
    const rows = await sr.entities.FileBridgeCommand.filter({ command_id: cid }, '-updated_date', 1).catch(() => []);
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

  return Response.json({ error: `unknown action '${action}'` }, { status: 400 });
});
