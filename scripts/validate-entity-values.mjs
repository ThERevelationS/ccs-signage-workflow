#!/usr/bin/env node
// WS-7 data-hygiene sweep — finds rows whose stored values violate the entity's
// declared JSONC schema (the "one bad row poisons a batch" class, e.g. an
// `assigned_to` string field holding `["name"]`). Scans every entity visible
// to staffDataRead, reports a fix list, writes .audit-work/schema-violations.json.
//
//   node scripts/validate-entity-values.mjs [--entities A,B] [--page 500] [--max-pages 40]
//
// Read-only: never writes. Paced through the fleet ledger so it shares the
// business-hours budget politely.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { paceCall } from './lib/read-ledger.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const ONLY = arg('--entities', '') ? new Set(arg('--entities', '').split(',').map((s) => s.trim()).filter(Boolean)) : null;
const PAGE = Math.min(Number(arg('--page', 500)), 1000);
const MAX_PAGES = Number(arg('--max-pages', 40));
const OUT = '.audit-work/schema-violations.json';
const TOKEN = readFileSync(process.env.PERMIT_TOKEN_FILE || '.permit-token.txt', 'utf8').trim().split('\n')[0].trim();
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (body) => {
  await paceCall('schema-sweep');
  const r = await fetch(`${FN}/staffDataRead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, session_token: TOKEN }) });
  if (r.status === 429) { await sleep(5000); return call(body); }
  return r.json();
};

// Declared scalar/array types we can check cheaply. `object` children and
// items-of-unknown-type are skipped — false positives are worse than gaps.
const EXPECT = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
};
const schemas = {};
for (const f of readdirSync('base44/entities')) {
  if (!f.endsWith('.jsonc')) continue;
  try {
    const j = JSON.parse(readFileSync(`base44/entities/${f}`, 'utf8'));
    schemas[j.name || f.replace(/\.jsonc$/, '')] = j;
  } catch {}
}

const fmtVal = (v) => JSON.stringify(v).slice(0, 80);
const violations = [];
const counts = {};
let scanned = 0, rowsSeen = 0, skipped = [];

const names = ONLY ? [...ONLY] : Object.keys(schemas);
for (const name of names) {
  const schema = schemas[name];
  if (!schema) { skipped.push(`${name}: no local schema`); continue; }
  const props = schema.properties || {};
  // Flat declared fields with a checkable primitive/array type.
  const checks = Object.entries(props)
    .map(([field, spec]) => [field, EXPECT[spec?.type] ? spec.type : null])
    .filter(([, t]) => t);
  if (!checks.length) { skipped.push(`${name}: no scalar/array fields`); continue; }

  let rows = null, page = 0, forbidden = false;
  for (page = 0; page < MAX_PAGES; page++) {
    const res = await call({ entity: name, query: {}, limit: PAGE, skip: page * PAGE });
    if (res?.error) {
      if (/forbidden|denied|permission|403/i.test(String(res.error))) { forbidden = true; break; }
      skipped.push(`${name}: ${String(res.error).slice(0, 90)}`);
      break;
    }
    rows = res?.rows || res?.items || res?.records || (Array.isArray(res) ? res : null);
    if (!Array.isArray(rows)) { skipped.push(`${name}: unexpected response shape`); break; }
    rowsSeen += rows.length;
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      for (const [field, type] of checks) {
        const v = row[field];
        if (v === undefined || v === null) continue;
        if (!EXPECT[type](v)) {
          violations.push({ entity: name, id: row.id || '?', field, declared: type, found: Array.isArray(v) ? 'array' : typeof v, value: fmtVal(v) });
          const k = `${name}.${field}`;
          counts[k] = (counts[k] || 0) + 1;
        }
      }
    }
    if (rows.length < PAGE) break;
    await sleep(250);
  }
  if (forbidden) skipped.push(`${name}: staffDataRead forbidden (backend-only)`);
  scanned++;
  if (scanned % 25 === 0) console.log(`…${scanned}/${names.length} entities, ${rowsSeen} rows, ${violations.length} violations`);
}

writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), entities_scanned: scanned, rows_seen: rowsSeen, skipped, violations }, null, 2));
console.log(`\n===== SCHEMA SWEEP =====`);
console.log(`entities: ${scanned} scanned, ${skipped.length} skipped | rows: ${rowsSeen} | violations: ${violations.length}`);
const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [k, n] of top) console.log(`  ${n}× ${k}`);
if (skipped.length) console.log(`skipped: ${skipped.slice(0, 10).join(' | ')}${skipped.length > 10 ? ' …' : ''}`);
console.log(`fix list → ${OUT}`);
