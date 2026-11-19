import { readFileSync, readdirSync } from 'node:fs';
const schemas = {};
for (const f of readdirSync('base44/entities')) {
  try { const e = JSON.parse(readFileSync('base44/entities/' + f, 'utf8')); if (e?.name && e?.properties) schemas[e.name] = new Set(Object.keys(e.properties)); } catch {}
}
if (schemas['PermitLocality']) schemas['PermitLocality'].add('duplicate_of');
const SYSTEM = new Set(['id', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample', '_manual_documents']);
const lines = readFileSync('.audit-work/outbox.jsonl', 'utf8').trim().split('\n');
const unknown = {};
for (const l of lines) {
  let r; try { r = JSON.parse(l); } catch { continue; }
  const keys = new Set([...Object.keys(r.data || {}), ...Object.keys(r.update?.$set || {})]);
  const sch = schemas[r.entity];
  if (!sch) { unknown[r.entity + '|<NO SCHEMA>'] = (unknown[r.entity + '|<NO SCHEMA>'] || 0) + 1; continue; }
  for (const k of keys) if (!sch.has(k) && !SYSTEM.has(k)) unknown[r.entity + '|' + k] = (unknown[r.entity + '|' + k] || 0) + 1;
}
console.log(JSON.stringify(unknown, null, 0));
