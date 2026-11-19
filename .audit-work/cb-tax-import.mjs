// Import CoreBridge tax groups (18) + tax agencies (24). Idempotent by name. No default group is set.
import { readFileSync } from 'node:fs';
import { login, read, call } from './cb-mm.mjs';
const D = 'imports/corebridge-2026-11-16/reference/';
const groups = JSON.parse(readFileSync(D + 'tax_groups.json', 'utf8')).data.taxgroups;
const agencies = JSON.parse(readFileSync(D + 'tax_agencies.json', 'utf8')).data.aaData.map((a) => {
  const m = String(a.Name).match(/populateTextBoxes\(([^)]*)\)/); const args = m ? m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')) : [];
  return { cb_id: a.Id, name: args[2] || String(a.Name).replace(/<[^>]+>/g, ''), rate: Number(a.Rate), active: !/Activate<\/center>/.test(a.Action) || /Deactivate/.test(a.Action) };
});
const mode = process.argv[2] || 'plan';
await login();
const haveG = new Set((await read({ entity: 'TaxGroup', limit: 500 })).items.map((g) => g.group_name));
const haveA = new Set((await read({ entity: 'TaxAgency', limit: 500 })).items.map((a) => a.name));
console.log('groups', groups.length, 'agencies', agencies.length, 'existing', haveG.size, haveA.size);
if (mode !== 'apply') { console.log(agencies.slice(0, 5)); process.exit(0); }
let g = 0, a = 0;
for (const [i, x] of groups.sort((p, q) => p.Name.localeCompare(q.Name)).entries()) {
  if (haveG.has(x.Name)) continue;
  await call('staffEntityWrite', { entity: 'TaxGroup', op: 'create', data: { group_name: x.Name, tax_percent: Math.round(x.TotalRate * 100000) / 1000, is_default: false, is_active: x.IsActive !== false, sort_order: i + 1 } }); g++;
}
for (const x of agencies) {
  if (haveA.has(x.name)) continue;
  await call('staffEntityWrite', { entity: 'TaxAgency', op: 'create', data: { name: x.name, rate: x.rate, jurisdiction: x.name, status: 'active', notes: `CoreBridge tax agency ${x.cb_id}` } }); a++;
}
console.log(`created groups=${g} agencies=${a}`);
