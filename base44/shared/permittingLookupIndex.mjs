// Permitting lookup index — the fast path for address resolution.
//
// One PermitLookupIndex row per normalized address caches the resolver's
// verified jurisdiction pick, so a repeat lookup is a single indexed entity
// read (~100ms) instead of a geocode chain plus 4-6 sequential boundary
// queries (~2-5s). Rows are written after every verified resolution and by
// the validation/sweep workers.
//
// Two read paths:
//   1. address_key  — exact normalized-address repeat. Serves the full pick.
//   2. geohash7     — a NEW address whose pin lands near a stored pin may
//      reuse its jurisdiction pick when the geometric guarantee holds:
//      dist(new_pin, stored_pin) < boundary_distance_m. Conservative by
//      construction — a cell row that can't prove the boundary is further
//      away than the new pin is ignored.
//
// Safety: needs_review/unresolved are never cached (they are flags, not
// answers). Every row carries lookup_revision + ruleset_fingerprint — code
// changes and newly minted resolution rules invalidate rows automatically.
// All calls are dormant-safe: when the entity is not provisioned the index
// silently no-ops and the resolver takes the normal path.
const norm = (v) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export function indexAddressKey(address) { return norm(String(address || '').replace(/\s+(apt|suite|unit|ste|#)\s*.*$/i, '')); }
export function streetKey(address) { return norm(String(address || '').split(',')[0].replace(/\s+(apt|suite|unit|ste|#)\s*.*$/i, '')); }

// Standard base32 geohash.
const GH32 = '0123456789bcdefghjkmnpqrstuvwxyz';
export function geohash(lat, lng, precision = 7) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  let lo = [-180, -90], hi = [180, 90], bits = 0, cur = 0, out = '', even = true;
  while (out.length < precision) {
    const mid = (lo[even ? 0 : 1] + hi[even ? 0 : 1]) / 2;
    const v = even ? lng : lat;
    cur = (cur << 1) | (v >= mid ? 1 : 0);
    if (v >= mid) lo[even ? 0 : 1] = mid; else hi[even ? 0 : 1] = mid;
    even = !even;
    if (++bits === 5) { out += GH32[cur]; bits = 0; cur = 0; }
  }
  return out;
}

function haversineM(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Fingerprint of the active rule catalog — any mint/update bumps count or
// newest timestamp, marking previously cached picks stale.
export function rulesetFingerprint(rules) {
  let newest = '';
  for (const r of rules || []) { const t = String(r?.updated_date || r?.created_date || ''); if (t > newest) newest = t; }
  return `${(rules || []).length}:${newest}`;
}

export function indexEntity(base44) {
  try { return base44?.asServiceRole?.entities?.PermitLookupIndex || null; } catch { return null; }
}

export async function indexReadByAddress(base44, address) {
  const ent = indexEntity(base44);
  if (!ent) return null;
  try {
    const rows = await ent.filter({ address_key: indexAddressKey(address) }, null, 3).catch(() => null);
    const row = Array.isArray(rows) ? rows[0] : null;
    return row || null;
  } catch { return null; }
}

export async function indexReadByCell(base44, point, geohash7) {
  const ent = indexEntity(base44);
  if (!ent || !geohash7) return null;
  try {
    const rows = await ent.filter({ geohash7, pick_status: 'verified' }, null, 10).catch(() => null);
    if (!Array.isArray(rows)) return null;
    // Geometric guarantee: the new pin must be closer to a stored pin than
    // that pin's own distance to the boundary — then the new pin cannot be
    // past the boundary either. Edge rows are never eligible.
    for (const row of rows) {
      if (row.edge || !Number.isFinite(row.boundary_distance_m)) continue;
      if (haversineM(point, row.point) < row.boundary_distance_m) return row;
    }
    return null;
  } catch { return null; }
}

export function indexRowFresh(row, { revision, fingerprint }) {
  if (!row) return false;
  if (row.pick_status !== 'verified' && row.pick_status !== 'rejected') return false;
  if (revision && row.lookup_revision && row.lookup_revision !== revision) return false;
  if (fingerprint && row.ruleset_fingerprint && row.ruleset_fingerprint !== fingerprint) return false;
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) return false;
  return true;
}

// Fire-and-forget upsert keyed on address_key. Never throws — the index is
// an optimization, never a blocker.
export function indexWrite(base44, entry) {
  const ent = indexEntity(base44);
  if (!ent || !entry?.address_key) return;
  (async () => {
    const existing = await ent.filter({ address_key: entry.address_key }, null, 1).catch(() => null);
    const row = Array.isArray(existing) ? existing[0] : null;
    const data = { ...entry, hit_count: row ? (Number(row.hit_count) || 0) : 0 };
    if (row?.id) await ent.update(row.id, data).catch(() => null);
    else await ent.create(data).catch(() => null);
  })().catch(() => {});
}

// Shape of a row written after a verified resolution. `boundaryDistanceM`
// comes from the pick's distance_m when it was an inside hit.
// Compact office answer for the index fast path — one index read returns the
// whole "who do I call" answer without re-walking the locality catalogs.
function officeRefs(offices) {
  const out = [];
  for (const o of Array.isArray(offices) ? offices : []) {
    const roles = (o?.authority_roles || []).filter(Boolean);
    if (!roles.length) continue;
    out.push({
      office_id: o?.id || '',
      name: o?.name || '',
      office_type: o?.office_type || '',
      roles,
      verification: o?.authority_verification_status || '',
      contact_phone: o?.contact_phone || '',
      contact_email: o?.contact_email || '',
      contact_website: o?.contact_website || '',
      contact_address: o?.contact_address || '',
    });
  }
  return out.slice(0, 12);
}

export function buildIndexEntry({ address, point, resolution, geocode, revision, fingerprint, source = 'resolver', ttlDays = 30, offices = null }) {
  const target = resolution?.target || {};
  const status = resolution?.status === 'location_verified' ? 'verified' : resolution?.status === 'invalid_input' ? 'rejected' : null;
  if (!status) return null;
  const boundaryDistanceM = Number.isFinite(target?.distance_m) ? Math.round(target.distance_m) : null;
  const now = new Date();
  return {
    address_key: indexAddressKey(address),
    street_key: streetKey(address),
    geohash5: point ? geohash(point.lat, point.lng, 5) : '',
    geohash6: point ? geohash(point.lat, point.lng, 6) : '',
    geohash7: point ? geohash(point.lat, point.lng, 7) : '',
    state: resolution?.state || '',
    county: target?.county || '',
    jurisdiction_name: target?.name || (status === 'rejected' ? '(not an address)' : ''),
    jurisdiction_type: target?.type || '',
    geoid: target?.geoid || '',
    pick_status: status,
    edge: Number.isFinite(boundaryDistanceM) ? boundaryDistanceM < 120 : true,
    boundary_distance_m: boundaryDistanceM,
    point: point ? { lat: point.lat, lng: point.lng } : null,
    geocode_snapshot: geocode ? { provider: geocode.provider || '', formatted: geocode.formatted_address || geocode.formatted || '', location_exact: !!geocode.location_exact } : null,
    resolution: {
      status: resolution?.status || '',
      target,
      targets: (resolution?.targets || []).map((t) => ({ ...t, geometry: undefined })),
      sources: (resolution?.sources || []).map((s) => ({ kind: s?.kind, url: s?.url, checked_at: s?.checked_at })),
      reason: resolution?.reason || '',
      corroborated_by: resolution?.corroborated_by || '',
    },
    office_refs: officeRefs(offices),
    lookup_revision: revision || '',
    ruleset_fingerprint: fingerprint || '',
    source,
    resolved_at: resolution?.checked_at || now.toISOString(),
    expires_at: new Date(now.getTime() + ttlDays * 86400000).toISOString(),
    last_verified_at: now.toISOString(),
  };
}
