// Replace MarkupTier multipliers with CoreBridge's per-part tier ladders (margin m -> multiplier 1/(1-m)).
// Ladder A (Vinyl Print/Cut, Decals, Vehicle Graphics, Tradeshow): 75 -> 63.8%. Ladder B (all else): 63.7 -> 54.1%.
import { writeFileSync } from 'node:fs';
import { login, read, call } from './cb-mm.mjs';
const A = [75, 73.4, 71.8, 70.2, 68.6, 67, 65.4, 63.8];
const B = [63.7, 62.3286, 60.9571, 59.5857, 58.2143, 56.8429, 55.4714, 54.1];
const mult = (m) => Math.round((1 / (1 - m / 100)) * 10000) / 10000;
const LADDER_A = new Set(['printed_vinyls', 'cut_vinyls', 'tradeshow']);
const mode = process.argv[2] || 'plan';
await login();
const tiers = (await read({ entity: 'MarkupTier', limit: 100 })).items.sort((a, b) => a.tier_number - b.tier_number);
writeFileSync(`imports/corebridge-2026-11-16/app-markup-tiers-before-apply-${Date.now()}.json`, JSON.stringify(tiers, null, 1));
for (const t of tiers) {
  const i = t.tier_number - 1;
  const markups = {};
  for (const k of Object.keys(t.markups || {})) markups[k] = mult(LADDER_A.has(k) ? A[i] : B[i]);
  console.log(t.tier_number, t.tier_name.slice(0, 30), JSON.stringify(markups));
  if (mode !== 'apply') continue;
  await call('staffEntityWrite', { entity: 'MarkupTier', op: 'update', id: t.id, expected_updated_date: t.updated_date, data: { tier_number: t.tier_number, tier_name: t.tier_name, description: [t.description, 'Multipliers imported from CoreBridge per-part tier charts 2026-11-17 (vinyl/decals/vehicle/tradeshow ladder 75%->63.8% margin; all other categories 63.7%->54.1%).'].filter(Boolean).join(' '), sort_order: t.sort_order, markups } });
}
if (mode === 'apply') {
  const after = (await read({ entity: 'MarkupTier', limit: 100 })).items.sort((a, b) => a.tier_number - b.tier_number);
  let bad = 0;
  for (const t of after) { const i = t.tier_number - 1; for (const [k, v] of Object.entries(t.markups)) if (v !== mult(LADDER_A.has(k) ? A[i] : B[i])) { bad++; console.log('MISMATCH', t.tier_number, k, v); } }
  console.log(`readback tiers=${after.length} mismatches=${bad}`);
}
