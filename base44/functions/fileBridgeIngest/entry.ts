import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// FB-02 probe — THROWAWAY function. Measures platform limits for the Unraid
// File Bridge design. Delete before publish.
const PROBE_KEY = 'fbspike-7f3a2c91e4b8d6a0c5f2e9b1a4d7c8e3';

const b64ToBytes = (s: string) => Uint8Array.from(atob(s || ''), (c) => c.charCodeAt(0));

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.probe_key !== PROBE_KEY) {
      return Response.json({ error: 'no' }, { status: 403 });
    }
    const client = createClientFromRequest(req);
    const sr = (client as any).asServiceRole;
    const out: any = { probe: body.probe, at: new Date().toISOString() };

    if (body.probe === 'body_size') {
      const raw = String(body.bytes_b64 || '');
      out.received_b64_len = raw.length;
      out.approx_bytes = Math.floor(raw.length * 0.75);
      return Response.json(out);
    }

    if (body.probe === 'entity_write_speed') {
      const n = Math.min(Number(body.count) || 10, 100);
      const E = sr.entities.FileBridgeSpikeRow;
      const t0 = Date.now();
      const ids: string[] = [];
      for (let i = 0; i < n; i += 1) {
        const row = await E.create({ seq: i, probe_run: String(body.run || 'x') });
        ids.push(row.id);
      }
      out.serial_ms_per_write = (Date.now() - t0) / n;
      out.count = n;
      out.cleaned = (await E.deleteMany({ id: { $in: ids } }).catch((e: any) => ({ err: String(e?.message || e) }))) as any;
      return Response.json(out);
    }

    if (body.probe === 'bulk_api') {
      const E: any = sr.entities.FileBridgeSpikeRow;
      out.methods = {};
      for (const name of ['bulkCreate', 'createMany', 'insertMany', 'bulkInsert']) {
        out.methods[name] = typeof E[name] === 'function' ? 'present' : 'absent';
      }
      // try whichever exists
      const fn = ['bulkCreate', 'createMany'].find((m) => typeof E[m] === 'function');
      if (fn) {
        try {
          const rows = Array.from({ length: 5 }, (_, i) => ({ seq: 900 + i, probe_run: 'bulk' }));
          const res = await E[fn](rows);
          out.bulk_result_type = Array.isArray(res) ? `array:${res.length}` : typeof res;
          const ids = (Array.isArray(res) ? res : res?.records || res?.ids || []).map((r: any) => r?.id || r).filter(Boolean);
          if (ids.length) await E.deleteMany({ id: { $in: ids } }).catch(() => null);
          out.bulk_created = ids.length;
        } catch (e: any) {
          out.bulk_error = String(e?.message || e).slice(0, 300);
        }
      }
      return Response.json(out);
    }

    if (body.probe === 'upload') {
      const bytes = b64ToBytes(String(body.bytes_b64 || ''));
      const file = new File([bytes], String(body.name || 'fb-spike.bin'), { type: 'application/octet-stream' });
      try {
        const up = await sr.integrations.Core.UploadFile({ file });
        out.upload = up;
      } catch (e: any) {
        out.upload_error = String(e?.message || e).slice(0, 400);
      }
      // probe delete APIs on integrations.Core surface
      const core: any = sr.integrations.Core;
      out.core_keys = Object.getOwnPropertyNames(Object.getPrototypeOf(core) || core).slice(0, 50);
      out.integration_keys = Object.keys(sr.integrations || {});
      if (out.upload?.file_url) {
        for (const name of ['DeleteFile', 'deleteFile', 'RemoveFile', 'Delete']) {
          if (typeof core[name] === 'function') {
            try {
              const r = await core[name]({ file_url: out.upload.file_url });
              out[`delete_${name}`] = { ok: true, result: r };
            } catch (e: any) {
              out[`delete_${name}`] = { ok: false, error: String(e?.message || e).slice(0, 300) };
            }
          } else {
            out[`delete_${name}`] = 'absent';
          }
        }
      }
      return Response.json(out);
    }

    if (body.probe === 'sse') {
      const holdMs = Math.min(Number(body.hold_ms) || 10000, 120000);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const t0 = Date.now();
          controller.enqueue(encoder.encode(`data: {"probe":"sse","t":0}\n\n`));
          while (Date.now() - t0 < holdMs) {
            await new Promise((r) => setTimeout(r, 2000));
            try {
              controller.enqueue(encoder.encode(`data: {"t":${Date.now() - t0}}\n\n`));
            } catch {
              return;
            }
          }
          controller.enqueue(encoder.encode(`data: {"done":true,"held_ms":${holdMs}}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'x-accel-buffering': 'no',
        },
      });
    }

    if (body.probe === 'actor_wake') {
      try {
        const actors: any = (client as any).actors;
        if (!actors) {
          out.actor_error = 'client.actors absent on request-scoped client';
          return Response.json(out);
        }
        out.actor_keys = Object.getOwnPropertyNames(actors).filter((k) => !k.startsWith('_')).slice(0, 40);
        const t0 = Date.now();
        const room = actors.fileBridgeSpike ? actors.fileBridgeSpike(String(body.room || 'spike-room')) : null;
        if (!room) {
          out.actor_error = 'actors.fileBridgeSpike accessor absent';
          return Response.json(out);
        }
        const conn = room.connect({ id: 'fn-probe-' + Date.now() });
        // give the socket a moment to open
        await new Promise((r) => setTimeout(r, 1200));
        conn.send({ type: 'wake', from: 'function', at: Date.now() });
        await new Promise((r) => setTimeout(r, 400));
        out.connect_ms = Date.now() - t0;
        out.sent = true;
        try { conn.close?.(); } catch { /* ignore */ }
      } catch (e: any) {
        out.actor_error = String(e?.message || e).slice(0, 400);
      }
      return Response.json(out);
    }

    if (body.probe === 'env') {
      out.runtime = { deno: typeof Deno !== 'undefined', now: Date.now() };
      out.env_keys = ['FILEBRIDGE_HMAC_KEY', 'FILEBRIDGE_HMAC_KEY_PREV']
        .filter((k) => !!Deno.env.get(k));
      return Response.json(out);
    }

    if (body.probe === 'set_fb_settings') {
      const rows = await sr.entities.GlobalSettings.filter({ setting_key: 'fileBridge' }, '-updated_date', 1).catch(() => []);
      const value = body.value && typeof body.value === 'object' ? body.value : { enabled: true };
      if (rows?.[0]?.id) {
        await sr.entities.GlobalSettings.update(rows[0].id, { setting_value: value });
        out.updated = true;
      } else {
        await sr.entities.GlobalSettings.create({ setting_key: 'fileBridge', setting_value: value });
        out.created = true;
      }
      out.setting_value = value;
      return Response.json(out);
    }

    return Response.json({ error: 'unknown probe', known: ['body_size', 'entity_write_speed', 'bulk_api', 'upload', 'sse', 'actor_wake', 'env'] }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: String(error?.message || error).slice(0, 500) }, { status: 500 });
  }
});
