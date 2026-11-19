// Resumable CoreBridge customer/contact import through manageMigration (dedupe + rollback ledger).
import { readFileSync, appendFileSync } from 'node:fs';
import { login, mm, call } from './cb-mm.mjs';
const D = 'imports/corebridge-2026-11-16/';
const BATCH = 'cb-customers-2026-11-17';
const [, , stage, dry] = process.argv; const dryRun = dry === 'dry';
await login();
const b = await mm({ action: 'start_batch', batch_tag: BATCH, entity: 'customers', source_label: 'CoreBridge account sweep 2026-11-16' });
console.log('batch', b.batch_id, 'reused', b.reused);
const log = (o) => appendFileSync(D + `import-log-${stage}.jsonl`, JSON.stringify(o) + '\n');
const identity = (rows) => { const m = {}; for (const r of rows) for (const k of Object.keys(r)) m[k] = k; return m; };
async function run(entity, rows, onDuplicate, size) {
  const tot = { created: 0, updated: 0, skipped: 0, errors: 0 }; const errs = [];
  for (let i = 0; i < rows.length; i += size) {
    const t0 = Date.now(); const chunk = rows.slice(i, i + size);
    const r = await mm({ action: 'import_rows', batch_id: BATCH, entity, rows: chunk, mapping: identity(chunk), on_duplicate: onDuplicate, dry_run: dryRun, source_label: 'corebridge_account_sweep' });
    for (const k in tot) tot[k] += r.counts[k]; for (const x of r.results) if (x.status === 'error') errs.push(x);
    log({ i, counts: r.counts, errors: r.results.filter((x) => x.status === 'error') });
    if (!dryRun) await new Promise((ok) => setTimeout(ok, Math.max(0, 31000 - (Date.now() - t0))));
    process.stdout.write(`\n${entity} ${Math.min(i + size, rows.length)}/${rows.length} ${JSON.stringify(tot)}   `);
  }
  console.log(); if (errs.length) console.log('errors sample', JSON.stringify(errs.slice(0, 5)));
  return tot;
}
if (stage === 'link') {
  // LegacyMigrationMap rows pointing CB accounts at EXISTING app customers. status 'linked'
  // so unimport_batch can never delete a pre-existing customer.
  const rows = JSON.parse(readFileSync(D + 'rows-linked-updates.json', 'utf8'));
  const existing = new Set((await call('staffDataRead', { entity: 'LegacyMigrationMap', query: { source_entity: 'customers' }, limit: 5000 })).items.map((r) => r.source_id));
  let made = 0;
  for (const { app_id, row } of rows) {
    if (existing.has(row.__source_id__)) continue;
    if (dryRun) { made++; continue; }
    await call('staffEntityWrite', { entity: 'LegacyMigrationMap', op: 'create', data: { source_app_id: 'corebridge', source_entity: 'customers', source_id: row.__source_id__, target_entity: 'Customer', target_id: app_id, migration_batch: BATCH, notes: JSON.stringify({ status: 'linked', matched_existing: true, at: new Date().toISOString() }) } });
    made++; if (made % 25 === 0) process.stdout.write(`\rlinked ${made}`);
  }
  console.log(`\nlink rows created=${made} already=${existing.size}`);
}
if (stage === 'update') console.log(await run('customers', JSON.parse(readFileSync(D + 'rows-linked-updates.json', 'utf8')).map((x) => x.row), 'update', 50));
if (stage === 'new') console.log(await run('customers', JSON.parse(readFileSync(D + 'rows-new-customers.json', 'utf8')).slice(0, Number(process.argv[4]) || Infinity), 'skip', 50));
if (stage === 'contacts') console.log(await run('contacts', JSON.parse(readFileSync(D + 'rows-contacts.json', 'utf8')).slice(0, Number(process.argv[4]) || Infinity), 'skip', 50));
