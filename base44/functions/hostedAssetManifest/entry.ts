import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

/**
 * Manifest mapping legacy public asset paths ("/fleet-assets/x.jpg",
 * "/permitting-evidence/y.pdf") to file-storage URLs.
 * - get_manifest: PUBLIC — these assets were already public static files
 *   (fleet QR public reports, permitting evidence links), so exposing the
 *   map preserves that visibility.
 * - save_manifest: admin session only — replaces the whole map.
 */
const SETTING_KEY = 'hostedAssetManifest';
const MAX_ENTRIES = 500;
const MAX_PATH = 400;
const MAX_URL = 1200;

const bad = (msg, status = 400) => Response.json({ error: msg }, { status });

async function loadManifest(base44) {
  const rows = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: SETTING_KEY });
  const row = Array.isArray(rows) && rows[0];
  let manifest = {};
  try { manifest = row?.setting_value ? JSON.parse(row.setting_value) : {}; } catch { manifest = {}; }
  return { row, manifest };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const op = String(body?.op || 'get_manifest');

    if (op === 'get_manifest') {
      const { manifest } = await loadManifest(base44);
      return Response.json({ manifest, count: Object.keys(manifest).length });
    }

    if (op === 'save_manifest') {
      const actor = await authenticateSignShopSession(base44, body?.session_token).catch(() => null);
      if (actor?.role !== 'admin') return bad('Forbidden: Admin access required', 403);

      const incoming = body?.manifest;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        return bad('manifest must be an object mapping paths to URLs');
      }
      const entries = Object.entries(incoming);
      if (entries.length > MAX_ENTRIES) return bad(`manifest exceeds ${MAX_ENTRIES} entries`);
      const clean = {};
      for (const [k, v] of entries) {
        const path = String(k || '').trim();
        const url = String(v || '').trim();
        if (!path.startsWith('/') || path.length > MAX_PATH || path.includes('..')) return bad(`invalid path: ${path.slice(0, 60)}`);
        if (!/^https:\/\//.test(url) || url.length > MAX_URL) return bad(`invalid URL for ${path.slice(0, 60)}`);
        clean[path] = url;
      }

      const { row } = await loadManifest(base44);
      const value = JSON.stringify(clean);
      if (row?.id) {
        await base44.asServiceRole.entities.GlobalSettings.update(row.id, { setting_value: value });
      } else {
        await base44.asServiceRole.entities.GlobalSettings.create({ setting_key: SETTING_KEY, setting_value: value });
      }
      return Response.json({ saved: true, count: entries.length });
    }

    return bad('Unknown op');
  } catch (error) {
    console.error('hostedAssetManifest error:', error?.message || error);
    return Response.json({ error: 'Manifest operation failed' }, { status: 500 });
  }
});
