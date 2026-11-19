// Verify imported estimates: header fields, customer link, line items, and computePricing == CoreBridge total.
import { readFileSync } from 'node:fs';
import { login, read } from './cb-mm.mjs';
const D = 'imports/corebridge-2026-11-16/';
const rows = new Map(JSON.parse(readFileSync(D + 'rows-estimates.json', 'utf8')).map((r) => [r.__source_id__, r]));
const lines = JSON.parse(readFileSync(D + 'rows-estimate-lines.json', 'utf8'));
const done = readFileSync(process.env.VFILE || (D + 'estimate-lines-done.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const sample = process.argv[2] === 'all' ? done : done.slice(-Number(process.argv[2] || 3));
await login();
function computePricing(e) { // mirror of src/components/estimator/aioPricing.js
  const ls = e.line_items || [];
  const raw = ls.map((l) => (Number.isFinite(Number(l.customer_price_snapshot)) && l.customer_price_snapshot !== null && l.customer_price_snapshot !== undefined && l.customer_price_snapshot !== '' ? Number(l.customer_price_snapshot) : Number(l.total_snapshot || 0)) * Math.max(0, Number(l.customer_quantity ?? 1) || 0) * (1 + Number(l.adjustment_percent || 0) / 100));
  const subtotal = raw.reduce((a, b) => a + b, 0);
  const after = subtotal - subtotal * (Number(e.discount_percent || 0) / 100);
  const cont = after * (Number(e.contingency_percent || 0) / 100);
  const base = after + cont + Number(e.shipping_fee || 0) + Number(e.permit_fee || 0);
  return base + base * (Number(e.tax_percent || 0) / 100);
}
let bad = 0;
for (const d of sample) {
  const r = await read({ entity: 'AllInOneEstimate', id: d.target_id }); const e = r.item || r.items?.[0] || r;
  const src = rows.get(d.source_id);
  const issues = [];
  for (const k of ['estimate_number', 'status', 'quote_total', 'client_name', 'salesperson', 'tags']) if (String(e[k] ?? '') !== String(src[k] ?? '')) issues.push(`${k}: ${src[k]} -> ${e[k]}`);
  if (!e.customer_id) issues.push('no customer_id');
  if ((e.line_items || []).length !== (lines[d.source_id] || []).length) issues.push(`lines ${lines[d.source_id]?.length} -> ${(e.line_items || []).length}`);
  const calc = computePricing(e);
  if (Math.abs(calc - Number(src.quote_total)) > 0.02) issues.push(`computed ${calc.toFixed(2)} vs CB ${src.quote_total}`);
  if (issues.length) bad++;
  if (issues.length || sample.length <= 5) console.log(d.source_id, src.estimate_number, e.status, e.quote_total, 'calc', calc.toFixed(2), 'cust', e.customer_id, issues.join('; ') || 'OK');
}
console.log(`verified ${sample.length}, with issues ${bad}`);
