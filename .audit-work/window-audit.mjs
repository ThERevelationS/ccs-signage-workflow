// Read-only: which CNC/Metal/Maintenance project rows (and estimate lines for
// those modules) were created/updated while the clobbered pages were live.
// Window start = deploy of 6af9e6c2 (2026-11-15T17:07:44.684Z); end = now
// (tabs opened in the window keep the old bundle until reloaded).
import { readFileSync, writeFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const login = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: c.user, password: c.pass }) }).then((x) => x.json());
if (!login?.token) { console.log('LOGIN FAILED', JSON.stringify(login).slice(0, 200)); process.exit(1); }
const read = async (payload) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${FN}/staffDataRead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, session_token: login.token }) });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429) { await new Promise((r) => setTimeout(r, body?.retry_after_ms || 2000)); continue; }
    if (res.status !== 200) throw new Error(`${payload.entity} HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
    return body?.data || body;
  }
  throw new Error('rate limited 5x');
};
const START = Date.parse('2026-11-15T17:07:44.684Z');
const ts = (v) => { if (!v) return NaN; const s = String(v); return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z'); };
const PAGE = 1000;
async function readAll(entity) {
  const rows = []; const seen = new Set();
  for (let skip = 0; ; skip += PAGE) {
    // limit is unique per page and per run (staffDataRead caches identical requests)
    const page = await read({ entity, sort: '-updated_date', limit: PAGE - (Date.now() % 7), skip });
    const items = page?.items || [];
    for (const r of items) if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }
    if (!page?.truncated) break;
    if (skip > 50000) throw new Error('runaway paging');
  }
  const counted = await read({ entity, count: true });
  return { rows, count: counted?.count, countTruncated: counted?.truncated };
}
const report = {};
for (const entity of ['CNCProject', 'MetalProject', 'MaintenanceProject']) {
  const { rows, count, countTruncated } = await readAll(entity);
  const unparsable = rows.filter((r) => Number.isNaN(ts(r.updated_date))).length;
  const hit = rows.filter((r) => ts(r.updated_date) >= START || ts(r.created_date) >= START);
  report[entity] = { scanned: rows.length, gatewayCount: count, countTruncated, unparsableUpdatedDate: unparsable,
    newestUpdated: rows.map((r) => r.updated_date).sort().at(-1),
    inWindow: hit.map((r) => ({ id: r.id, project_name: r.project_name, client_name: r.client_name, created_date: r.created_date, updated_date: r.updated_date, created_by: r.created_by, status: r.status, estimate_id: r.estimate_id })) };
}
const est = await readAll('AllInOneEstimate');
const MODS = new Set(['cnc', 'metal', 'maintenance']);
report.AllInOneEstimate = { scanned: est.rows.length, gatewayCount: est.count, countTruncated: est.countTruncated,
  moduleKeysSeen: [...new Set(est.rows.flatMap((e) => (e.line_items || []).map((l) => l?.module_key)))].sort(),
  inWindowWithModuleLines: est.rows.filter((e) => ts(e.updated_date) >= START && (e.line_items || []).some((l) => MODS.has(String(l?.module_key || '').toLowerCase())))
    .map((e) => ({ id: e.id, estimate_number: e.estimate_number, updated_date: e.updated_date, status: e.status, lines: (e.line_items || []).filter((l) => MODS.has(String(l?.module_key || '').toLowerCase())).map((l) => ({ module_key: l.module_key, project_id: l.project_id, total_snapshot: l.total_snapshot, price_state: l.price_state })) })) };
writeFileSync('.audit-work/window-audit-result.json', JSON.stringify(report, null, 1));
for (const [k, v] of Object.entries(report)) console.log(k, 'scanned=' + v.scanned, 'count=' + v.gatewayCount + (v.countTruncated ? '(truncated)' : ''), 'unparsable=' + (v.unparsableUpdatedDate ?? '-'), 'newest=' + (v.newestUpdated ?? '-'), 'IN-WINDOW=' + (v.inWindow || v.inWindowWithModuleLines).length, v.moduleKeysSeen ? 'keys=' + v.moduleKeysSeen.join(',') : '');
