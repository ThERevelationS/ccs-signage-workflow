// G-14 customer-merge hardening — esbuild-bundled under plain Node like the
// sibling suites (test-customer-persistence.mjs etc.).
// Covers: entity-coverage completeness vs the declared customer-keyed entity
// list, guard matrix, master-account decisions, per-kind relink patches,
// tombstone/winner/audit payloads, and resume-after-partial semantics driven
// through a mock entity store that mirrors the function's filter→CAS-update
// loop.
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-customer-merge.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/customerMergeModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const M = await import(pathToFileURL(out).href);
const {
  CUSTOMER_RELINK_SPECS, SKIPPED_CUSTOMER_REFS, MERGE_GUARDS,
  customerDisplayName, mergeRunKey, mergeAuditRequestKey,
  evaluateMergeGuards, resolveMasterAccountMerge, buildRelinkPatch,
  buildTombstonePatch, buildWinnerPatch, buildMergeAuditRow,
  initialMergeProgress, nextEntityStep, recordEntityResult,
  mergeCompletionStatus, entityResultsForResponse,
} = M;

let cases = 0;
const ok = (cond, msg) => { cases += 1; assert.ok(cond, msg); };
const eq = (a, b, msg) => { cases += 1; assert.equal(a, b, msg); };

// ---------------------------------------------------------------------------
// 1. Coverage completeness — every entity declaring a top-level customer_id /
//    customer_ids property MUST be in the sweep spec (or be Customer itself,
//    whose internal refs are covered by the customer_ref spec).
// ---------------------------------------------------------------------------
{
  const dir = resolve(here, '../base44/entities');
  const keyed = new Set();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.jsonc')) continue;
    const raw = readFileSync(resolve(dir, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    const props = parsed?.properties || {};
    if ('customer_id' in props || 'customer_ids' in props) keyed.add(file.replace(/\.jsonc$/, ''));
  }
  keyed.delete('Customer'); // internal refs handled by the customer_ref spec
  const specEntities = new Set(CUSTOMER_RELINK_SPECS.map((s) => s.entity));
  const missing = [...keyed].filter((e) => !specEntities.has(e));
  assert.deepEqual(missing, [], `customer-keyed entities missing from sweep: ${missing.join(', ')}`);
  cases += 1;

  // Reverse drift: every spec entity must exist on disk.
  const files = new Set(readdirSync(dir).filter((f) => f.endsWith('.jsonc')).map((f) => f.replace(/\.jsonc$/, '')));
  const ghosts = CUSTOMER_RELINK_SPECS.filter((s) => s.entity !== 'Customer' && !files.has(s.entity)).map((s) => s.entity);
  assert.deepEqual(ghosts, [], `spec entities not declared: ${ghosts.join(', ')}`);
  cases += 1;

  // Every spec must be structurally valid.
  for (const spec of CUSTOMER_RELINK_SPECS) {
    ok(spec.entity && spec.label && spec.kind, `spec ${spec.entity} shape`);
    ok(['id', 'ids', 'customer_ref'].includes(spec.kind), `spec ${spec.entity} kind`);
    ok(Array.isArray(spec.match_fields) && spec.match_fields.length > 0, `spec ${spec.entity} match_fields`);
    cases += 1;
  }
  // Skip list is documented and non-empty entries carry reasons.
  ok(SKIPPED_CUSTOMER_REFS.length > 0, 'documented skip list exists');
  ok(SKIPPED_CUSTOMER_REFS.every((s) => s.ref && s.reason), 'every skip carries a reason');
}

// ---------------------------------------------------------------------------
// 2. Determinism — identical inputs produce identical plans/payloads.
// ---------------------------------------------------------------------------
{
  const keep = { id: 'k1', company_name: 'Acme Corp', master_account_id: 'm1' };
  const lose = { id: 'l1', company_name: 'Acme East', master_account_id: 'm2', in_store_credit_balance: 25 };
  const customers = [keep, lose, { id: 'm1', company_name: 'Holdings' }, { id: 'm2', company_name: 'Other Holdings' }];
  const a = resolveMasterAccountMerge({ keep, lose, customers });
  const b = resolveMasterAccountMerge({ keep, lose, customers });
  eq(JSON.stringify(a), JSON.stringify(b), 'master decision is deterministic');
  const g1 = evaluateMergeGuards({ keep, lose, runKey: 'r' });
  const g2 = evaluateMergeGuards({ keep, lose, runKey: 'r' });
  eq(JSON.stringify(g1), JSON.stringify(g2), 'guard verdict deterministic');
  eq(mergeRunKey('k1', 'l1'), mergeRunKey('k1', 'l1'), 'run key deterministic');
  eq(mergeRunKey('k1', 'l1'), 'custmerge:k1:l1', 'run key shape');
  eq(mergeAuditRequestKey('custmerge:k1:l1'), 'custmerge-audit:custmerge:k1:l1', 'audit key shape');
  const row = { id: 'w9', customer_id: 'l1', client_name: 'Acme East' };
  const spec = CUSTOMER_RELINK_SPECS.find((s) => s.entity === 'WorkOrder');
  eq(JSON.stringify(buildRelinkPatch(spec, row, { keepId: 'k1', keepName: 'Acme Corp', loseId: 'l1' })),
     JSON.stringify(buildRelinkPatch(spec, row, { keepId: 'k1', keepName: 'Acme Corp', loseId: 'l1' })),
     'relink patch deterministic');
}

// ---------------------------------------------------------------------------
// 3. Guard matrix.
// ---------------------------------------------------------------------------
{
  const live = { id: 'k1', company_name: 'A' };
  const loser = { id: 'l1', company_name: 'B' };
  eq(evaluateMergeGuards({ keep: live, lose: live, runKey: 'x' }).code, MERGE_GUARDS.SAME_CUSTOMER, 'self-merge blocked');
  eq(evaluateMergeGuards({ keep: null, lose: loser, runKey: 'x' }).code, MERGE_GUARDS.MISSING_KEEP, 'missing winner');
  eq(evaluateMergeGuards({ keep: live, lose: null, runKey: 'x' }).code, MERGE_GUARDS.MISSING_LOSE, 'missing loser');
  eq(evaluateMergeGuards({ keep: { id: 'k2', merged_into_customer_id: 'other' }, lose: loser, runKey: 'x' }).code,
     MERGE_GUARDS.KEEP_IS_TOMBSTONE, 'tombstone winner blocked');
  {
    const v = evaluateMergeGuards({ keep: live, lose: { id: 'l1', merged_into_customer_id: 'k1' }, runKey: 'x' });
    eq(v.code, MERGE_GUARDS.LOSE_MERGED_INTO_KEEP, 'same-target completed merge detected');
    ok(v.already_merged, 'already_merged flag set');
  }
  eq(evaluateMergeGuards({ keep: live, lose: { id: 'l1', merged_into_customer_id: 'zzz' }, runKey: 'x' }).code,
     MERGE_GUARDS.LOSE_MERGED_OTHER, 'loser merged elsewhere blocked');
  {
    // Unfinished run into a DIFFERENT winner → conflict; same key → resume ok.
    const conflict = evaluateMergeGuards({
      keep: { id: 'k1' }, lose: { id: 'l1', merge_run: { run_key: 'custmerge:other:l1', keep_id: 'other', status: 'in_progress' } },
      runKey: 'custmerge:k1:l1',
    });
    eq(conflict.code, MERGE_GUARDS.CONFLICTING_RUN, 'foreign in-flight run conflicts');
    const resume = evaluateMergeGuards({
      keep: { id: 'k1' }, lose: { id: 'l1', merge_run: { run_key: 'custmerge:k1:l1', keep_id: 'k1', status: 'in_progress' } },
      runKey: 'custmerge:k1:l1',
    });
    ok(resume.ok, 'same-key run resumes');
    const doneRun = evaluateMergeGuards({
      keep: { id: 'k1' }, lose: { id: 'l1', merge_run: { run_key: 'custmerge:old:l1', keep_id: 'old', status: 'done' } },
      runKey: 'custmerge:k1:l1',
    });
    // status done but no merged_into → stored run is stale history, merge may proceed
    ok(doneRun.ok, 'completed prior run does not block a new merge');
  }
}

// ---------------------------------------------------------------------------
// 4. Master-account decisions.
// ---------------------------------------------------------------------------
{
  const keep = { id: 'k1', company_name: 'Winner', master_account_id: 'm1' };
  const lose = { id: 'l1', company_name: 'Loser', master_account_id: 'm2' };
  const cust = [keep, lose, { id: 'm1', company_name: 'Master One' }, { id: 'm2', company_name: 'Master Two' }];
  {
    const d = resolveMasterAccountMerge({ keep, lose, customers: cust });
    eq(d.winner_master_account_id, 'm1', 'both masters → winner keeps its own');
    eq(d.winner_master_label, 'Master One', 'winner master label resolved');
    eq(d.winner_descendant, false);
  }
  {
    // Winner's master IS the loser → re-point to the loser's master (grandparent).
    const d = resolveMasterAccountMerge({
      keep: { id: 'k1', master_account_id: 'l1' },
      lose: { id: 'l1', master_account_id: 'm9' },
      customers: [{ id: 'k1', master_account_id: 'l1' }, { id: 'l1', master_account_id: 'm9' }, { id: 'm9', company_name: 'Grand' }],
    });
    eq(d.winner_master_account_id, 'm9', 'winner re-pointed to grandparent');
    eq(d.winner_master_label, 'Grand');
    eq(d.winner_descendant, true);
  }
  {
    // Winner's master is the loser and the loser has NO master → cleared.
    const d = resolveMasterAccountMerge({
      keep: { id: 'k1', master_account_id: 'l1' },
      lose: { id: 'l1' },
      customers: [{ id: 'k1', master_account_id: 'l1' }, { id: 'l1' }],
    });
    eq(d.winner_master_account_id, '', 'winner master cleared when loser was the root master');
    eq(d.winner_descendant, true);
  }
  {
    // Winner deeper in the loser's subtree (k1 → c1 → l1) → grandparent.
    const d = resolveMasterAccountMerge({
      keep: { id: 'k1', master_account_id: 'c1' },
      lose: { id: 'l1', master_account_id: 'm9' },
      customers: [{ id: 'k1', master_account_id: 'c1' }, { id: 'c1', master_account_id: 'l1' }, { id: 'l1', master_account_id: 'm9' }, { id: 'm9', company_name: 'G' }],
    });
    eq(d.winner_descendant, true, 'deep descendant detected');
    eq(d.winner_master_account_id, 'm9', 'deep descendant re-points to loser master');
  }
  {
    // Winner masterless, loser has a master → winner stays root (documented).
    const d = resolveMasterAccountMerge({ keep: { id: 'k1' }, lose: { id: 'l1', master_account_id: 'm2' }, customers: cust });
    eq(d.winner_master_account_id, '', 'winner root position kept');
    eq(d.winner_descendant, false);
  }
  {
    // Cyclic ancestry can't hang the walk.
    const d = resolveMasterAccountMerge({
      keep: { id: 'k1', master_account_id: 'c1' },
      lose: { id: 'l1' },
      customers: [{ id: 'k1', master_account_id: 'c1' }, { id: 'c1', master_account_id: 'k1' }],
    });
    eq(d.winner_descendant, false, 'cyclic ancestry terminates');
  }
}

// ---------------------------------------------------------------------------
// 5. Relink patches per kind.
// ---------------------------------------------------------------------------
{
  const woSpec = CUSTOMER_RELINK_SPECS.find((s) => s.entity === 'WorkOrder');
  // Scalar id + name rewrite.
  assert.deepEqual(
    buildRelinkPatch(woSpec, { id: 'w1', customer_id: 'l1', client_name: 'Old Name' }, { keepId: 'k1', keepName: 'New Co', loseId: 'l1' }),
    { customer_id: 'k1', client_name: 'New Co' }, 'id spec rewrites id + live label');
  // Name already correct → id only.
  assert.deepEqual(
    buildRelinkPatch(woSpec, { id: 'w1', customer_id: 'l1', client_name: 'New Co' }, { keepId: 'k1', keepName: 'New Co', loseId: 'l1' }),
    { customer_id: 'k1' }, 'matching name not rewritten');
  // Frozen label is never in name_fields.
  const invSpec = CUSTOMER_RELINK_SPECS.find((s) => s.entity === 'Invoice');
  assert.deepEqual(
    buildRelinkPatch(invSpec, { id: 'i1', customer_id: 'l1', customer_display_name: 'Old Name' }, { keepId: 'k1', keepName: 'New Co', loseId: 'l1' }),
    { customer_id: 'k1' }, 'invoice display name stays frozen');
  // A row carrying a DIFFERENT customer is untouched even inside the spec.
  eq(buildRelinkPatch(woSpec, { id: 'w2', customer_id: 'other' }, { keepId: 'k1', keepName: 'N', loseId: 'l1' }), null,
     'non-loser rows never patched');
  // Already-winner rows are no-ops (idempotent re-scan).
  eq(buildRelinkPatch(woSpec, { id: 'w3', customer_id: 'k1', client_name: 'New Co' }, { keepId: 'k1', keepName: 'New Co', loseId: 'l1' }), null,
     'already-relinked rows are no-ops');
  // ids kind — replace + dedupe.
  const annSpec = CUSTOMER_RELINK_SPECS.find((s) => s.entity === 'Announcement');
  assert.deepEqual(
    buildRelinkPatch(annSpec, { id: 'a1', customer_ids: ['x', 'l1', 'y'] }, { keepId: 'k1', loseId: 'l1' }),
    { customer_ids: ['x', 'k1', 'y'] }, 'ids replaces loser in place');
  assert.deepEqual(
    buildRelinkPatch(annSpec, { id: 'a2', customer_ids: ['k1', 'l1'] }, { keepId: 'k1', loseId: 'l1' }),
    { customer_ids: ['k1'] }, 'ids dedupes winner already present');
  eq(buildRelinkPatch(annSpec, { id: 'a3', customer_ids: ['x', 'y'] }, { keepId: 'k1', loseId: 'l1' }), null,
     'ids no-match → null');
  // customer_ref — children + label, parties excluded.
  const refSpec = CUSTOMER_RELINK_SPECS.find((s) => s.kind === 'customer_ref');
  assert.deepEqual(
    buildRelinkPatch(refSpec, { id: 'c9', master_account_id: 'l1', master_account: 'Loser' }, { keepId: 'k1', keepName: 'New Co', loseId: 'l1' }),
    { master_account_id: 'k1', master_account: 'New Co' }, 'child re-parents with label');
  assert.deepEqual(
    buildRelinkPatch(refSpec, { id: 't7', merged_into_customer_id: 'l1' }, { keepId: 'k1', keepName: 'N', loseId: 'l1' }),
    { merged_into_customer_id: 'k1' }, 'prior tombstone flattens to final winner');
  eq(buildRelinkPatch(refSpec, { id: 'k1', master_account_id: 'l1' }, { keepId: 'k1', keepName: 'N', loseId: 'l1' }), null,
     'winner never self-parents through the sweep');
  eq(buildRelinkPatch(refSpec, { id: 'l1', master_account_id: 'm2' }, { keepId: 'k1', keepName: 'N', loseId: 'l1' }), null,
     'loser row untouched by ref sweep (tombstone handles it)');
}

// ---------------------------------------------------------------------------
// 6. Tombstone / winner / audit payloads.
// ---------------------------------------------------------------------------
{
  const keep = { id: 'k1', company_name: 'Acme Corp', in_store_credit_balance: 10, legacy_client_names: ['Acme'] };
  const lose = { id: 'l1', company_name: 'Acme East', master_account_id: 'm2', master_account: 'M2', in_store_credit_balance: 25, legacy_client_names: ['Acme E', 'East'] };
  const tomb = buildTombstonePatch({ keep, lose, actor: 'admin@x.com', at: '2026-01-01T00:00:00Z', runKey: 'rk', progress: { entities: { WorkOrder: { status: 'done' } } } });
  eq(tomb.merged_into_customer_id, 'k1', 'tombstone points at winner');
  eq(tomb.customer_status, 'inactive', 'tombstone inactivated');
  eq(tomb.master_account_id, '', 'tombstone exits account tree');
  eq(tomb.merged_at, '2026-01-01T00:00:00Z', 'tombstone stamped');
  eq(tomb.merged_by, 'admin@x.com');
  eq(tomb.merge_run.status, 'done');
  eq(tomb.merge_run.entities.WorkOrder.status, 'done', 'progress rides the tombstone');
  assert.ok(!('deleted' in tomb), 'tombstone never hard-deletes');

  const win = buildWinnerPatch({ keep: { ...keep, master_account_id: 'l1' }, lose, masterDecision: { winner_master_account_id: '', winner_master_label: '' } });
  eq(win.master_account_id, '', 'winner patch clears a master pointing at the loser');
  eq(win.master_account, '', 'winner master label cleared with the link');
  // No-change master decision produces no master patch fields.
  const noMaster = buildWinnerPatch({ keep, lose, masterDecision: { winner_master_account_id: '', winner_master_label: '' } });
  ok(!('master_account_id' in noMaster), 'unchanged master is not rewritten');
  eq(win.in_store_credit_balance, 35, 'credit balances merge onto winner');
  eq(win.in_store_credit, 25, 'legacy credit field merges too');
  assert.deepEqual(win.legacy_client_names, ['Acme', 'Acme E', 'Acme East', 'East'], 'loser names folded into legacy_client_names');

  const audit = buildMergeAuditRow({
    keep, lose, actor: 'admin@x.com', runKey: 'custmerge:k1:l1', status: 'merged',
    entities: [{ entity: 'WorkOrder', label: 'Work orders', status: 'done', scanned: 3, relinked: 3 }, { entity: 'Invoice', label: 'Invoices', status: 'done', scanned: 2, relinked: 2, failed_count: 1 }],
    masterDecision: { winner_master_account_id: 'm1', keep_master_account_id: 'm1', loser_master_account_id: 'm2', winner_descendant: false, note: 'n' },
    at: '2026-01-01T00:00:00Z',
  });
  eq(audit.event_type, 'customer_merge');
  eq(audit.customer_id, 'k1', 'audit lives on the winner');
  eq(audit.creation_request_key, 'custmerge-audit:custmerge:k1:l1', 'audit retry-safe');
  eq(audit.outcome, 'completed');
  eq(audit.details.totals.relinked, 5);
  eq(audit.details.totals.row_failures, 1);
  eq(audit.details.loser.id, 'l1');
  ok(audit.summary.includes('Acme East') && audit.summary.includes('Acme Corp'), 'audit summary names both parties');
}

// ---------------------------------------------------------------------------
// 7. Resume-after-partial — simulated sweep against a mock entity store.
//    Mirrors the function's per-spec filter → CAS update loop: rows matched
//    by filter({match_field: loseId}), patched via buildRelinkPatch, written
//    only when updated_date still matches (CAS semantics).
// ---------------------------------------------------------------------------
function makeStore(seed) {
  const tables = new Map();
  for (const [entity, rows] of Object.entries(seed)) {
    tables.set(entity, rows.map((r, i) => ({ ...r, updated_date: r.updated_date || `v${i}` })));
  }
  return {
    filter: async (entity, query) => {
      const rows = tables.get(entity) || [];
      const [field, value] = Object.entries(query)[0];
      return rows.filter((r) => {
        const v = r[field];
        return Array.isArray(v) ? v.includes(value) : String(v || '').trim() === String(value);
      }).map((r) => ({ ...r }));
    },
    updateMany: async (entity, query, set) => {
      const rows = tables.get(entity) || [];
      const row = rows.find((r) => r.id === query.id && r.updated_date === query.updated_date);
      if (!row) return { updated: 0 };
      Object.assign(row, set.$set, { updated_date: `${query.updated_date}+` });
      return { updated: 1 };
    },
    update: async (entity, id, patch) => {
      const row = (tables.get(entity) || []).find((r) => r.id === id);
      if (row) Object.assign(row, patch);
      return row;
    },
    get: async (entity, id) => ({ ...((tables.get(entity) || []).find((r) => r.id === id) || {}) }),
    rows: (entity) => (tables.get(entity) || []).map((r) => ({ ...r })),
  };
}

async function sweepOnce(store, { keepId, keepName, loseId, progress, failOn }) {
  let failedAny = false;
  for (const spec of CUSTOMER_RELINK_SPECS) {
    const prior = progress.entities[spec.entity]?.status;
    if (prior === 'done' || prior === 'skipped') continue;
    try {
      if (failOn?.has(spec.entity)) throw new Error(`${spec.entity} boom`);
      const byId = new Map();
      for (const field of spec.match_fields) {
        for (const row of await store.filter(spec.entity, { [field]: loseId })) {
          if (!byId.has(row.id)) byId.set(row.id, row);
        }
      }
      let relinked = 0, skipped = 0;
      const failures = [];
      for (const row of byId.values()) {
        const patch = buildRelinkPatch(spec, row, { keepId, keepName, loseId });
        if (!patch) { skipped += 1; continue; }
        const res = await store.updateMany(spec.entity, { id: row.id, updated_date: row.updated_date }, { $set: patch });
        if (res.updated === 1) relinked += 1; else failures.push({ id: row.id, error: 'conflict' });
      }
      recordEntityResult(progress, spec, { status: failures.length ? 'failed' : 'done', scanned: byId.size, relinked, skipped, failures }, 't');
    } catch (e) {
      recordEntityResult(progress, spec, { status: spec.optional ? 'skipped' : 'failed', error: e.message }, 't');
      if (!spec.optional) failedAny = true; // function records + sweeps on (D6)
    }
  }
  return !failedAny;
}

{
  const seed = {
    WorkOrder: [
      { id: 'w1', customer_id: 'l1', client_name: 'Loser Co' },
      { id: 'w2', customer_id: 'k1', client_name: 'Winner Co' },
      { id: 'w3', customer_id: 'other' },
    ],
    Invoice: [{ id: 'i1', customer_id: 'l1', customer_display_name: 'Loser Co' }],
    Announcement: [{ id: 'a1', customer_ids: ['k1', 'l1'] }],
    Customer: [
      { id: 'k1', company_name: 'Winner Co' },
      { id: 'l1', company_name: 'Loser Co', master_account_id: 'm1' },
      { id: 'c1', company_name: 'Child One', master_account_id: 'l1', master_account: 'Loser Co' },
      { id: 't1', company_name: 'Old Tomb', merged_into_customer_id: 'l1' },
      { id: 'm1', company_name: 'Master' },
    ],
  };
  // First pass: fail Invoice → partial; resume finishes everything.
  let progress = initialMergeProgress({ runKey: 'custmerge:k1:l1', keepId: 'k1' });
  const store1 = makeStore(seed);
  const done1 = await sweepOnce(store1, { keepId: 'k1', keepName: 'Winner Co', loseId: 'l1', progress, failOn: new Set(['Invoice']) });
  eq(done1, false, 'injected entity failure surfaces');
  eq(mergeCompletionStatus(progress), 'partial', 'partial after entity failure');
  eq(progress.entities.Invoice.status, 'failed');
  eq(progress.entities.WorkOrder.status, 'done', 'earlier entities recorded done');

  // Resume: 'done' entities are skipped; only the tail re-runs.
  progress = initialMergeProgress({ runKey: 'custmerge:k1:l1', keepId: 'k1', stored: { entities: progress.entities } });
  const store2 = makeStore(Object.fromEntries(Object.keys(seed).map((k) => [k, store1.rows(k)])));
  eq(nextEntityStep(progress)?.entity, 'Invoice', 'resume picks up at the failed entity');
  const done2 = await sweepOnce(store2, { keepId: 'k1', keepName: 'Winner Co', loseId: 'l1', progress, failOn: null });
  eq(done2, true);
  eq(mergeCompletionStatus(progress), 'done', 'resume completes the sweep');

  // Zero dangling customer_id on the loser across every table.
  for (const spec of CUSTOMER_RELINK_SPECS) {
    if (spec.kind === 'customer_ref') {
      for (const row of store2.rows('Customer')) {
        if (row.id === 'l1' || row.id === 'k1') continue;
        for (const f of spec.match_fields) ok(row[f] !== 'l1', `${spec.entity}.${f} clean on ${row.id}`);
      }
      continue;
    }
    for (const row of store2.rows(spec.entity)) {
      for (const f of spec.match_fields) {
        const v = row[f];
        if (Array.isArray(v)) ok(!v.includes('l1'), `${spec.entity}[${row.id}].${f} has no loser id`);
        else ok(v !== 'l1', `${spec.entity}[${row.id}].${f} has no loser id`);
      }
    }
  }
  const child = store2.rows('Customer').find((r) => r.id === 'c1');
  eq(child.master_account_id, 'k1', 'child re-parented to winner');
  eq(child.master_account, 'Winner Co', 'child label follows winner');
  const tomb = store2.rows('Customer').find((r) => r.id === 't1');
  eq(tomb.merged_into_customer_id, 'k1', 'prior tombstone flattened');
  const wo = store2.rows('WorkOrder').find((r) => r.id === 'w1');
  eq(wo.customer_id, 'k1'); eq(wo.client_name, 'Winner Co', 'WO label relinked');
  const inv = store2.rows('Invoice').find((r) => r.id === 'i1');
  eq(inv.customer_id, 'k1'); eq(inv.customer_display_name, 'Loser Co', 'frozen audit label preserved');
  const ann = store2.rows('Announcement').find((r) => r.id === 'a1');
  assert.deepEqual(ann.customer_ids, ['k1'], 'announcement deduped to winner');

  // Idempotent re-run: a third pass over the same data writes nothing.
  const progress3 = initialMergeProgress({ runKey: 'custmerge:k1:l1', keepId: 'k1' });
  const store3 = makeStore(Object.fromEntries(Object.keys(seed).map((k) => [k, store2.rows(k)])));
  await sweepOnce(store3, { keepId: 'k1', keepName: 'Winner Co', loseId: 'l1', progress: progress3, failOn: null });
  eq(mergeCompletionStatus(progress3), 'done');
  ok(Object.values(progress3.entities).every((e) => e.relinked === 0), 're-run over clean data relinks nothing');
}

// ---------------------------------------------------------------------------
// 8. Response surface — entityResultsForResponse covers every spec in order.
// ---------------------------------------------------------------------------
{
  const progress = initialMergeProgress({ runKey: 'r', keepId: 'k1' });
  recordEntityResult(progress, CUSTOMER_RELINK_SPECS[0], { status: 'done', scanned: 2, relinked: 2 }, 't');
  const rows = entityResultsForResponse(progress);
  eq(rows.length, CUSTOMER_RELINK_SPECS.length, 'response lists every entity');
  eq(rows[0].entity, CUSTOMER_RELINK_SPECS[0].entity);
  eq(rows[0].status, 'done');
  eq(rows[1].status, 'pending', 'untouched entities report pending');
  eq(rows[0].relinked, 2);
}

console.log(`PASS customer merge (${cases} cases)`);
