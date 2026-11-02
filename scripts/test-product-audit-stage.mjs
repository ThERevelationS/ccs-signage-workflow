// B-12 + B-13 contract test: ProductActivity entity shape, per-product audit
// event diffs, worst-first product→stage derivation, and the customerSync /
// customer360 wiring. Run: node scripts/test-product-audit-stage.mjs
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// --- Bundle the pure models (esbuild resolves the shared .ts import) --------
buildSync({
  entryPoints: [
    resolve(root, 'src/components/jobs/productAuditModel.js'),
    resolve(root, 'src/components/jobs/productStageModel.js'),
    resolve(root, 'src/components/customer360/customer360Model.js'),
  ],
  bundle: true, format: 'esm', splitting: true,
  outdir: resolve(here, '.tmp-audit-stage-out'), logLevel: 'silent',
});
const audit = await import(pathToFileURL(resolve(here, '.tmp-audit-stage-out/jobs/productAuditModel.js')).href);
const stage = await import(pathToFileURL(resolve(here, '.tmp-audit-stage-out/jobs/productStageModel.js')).href);
const c360 = await import(pathToFileURL(resolve(here, '.tmp-audit-stage-out/customer360/customer360Model.js')).href);
const {
  PRODUCT_AUDIT_EVENT_TYPES, PRODUCT_AUDIT_ACTOR_TYPES,
  buildProductAuditEvent, makeProductAuditEvent, formatAuditLine, renderAuditValue,
} = audit;
const {
  deriveWorkOrderStage, describeWorkOrderStageDerivation,
  hasManualStageOverride, productStageContribution,
  WO_STAGE_ORDER, MANUAL_STAGE_OVERRIDE_FIELD,
} = stage;

// === B-12: entity parses + required shape ====================================
const entity = JSON.parse(
  readFileSync(resolve(root, 'base44/entities/ProductActivity.jsonc'), 'utf8'),
);
assert.equal(entity.name, 'ProductActivity');
for (const f of [
  'work_order_id', 'product_id', 'event_type', 'actor_type', 'actor_label',
  'from_value', 'to_value', 'note', 'occurred_at',
]) {
  assert.ok(entity.properties[f], `entity missing ${f}`);
}
assert.deepEqual(entity.properties.event_type.enum, [
  'status_change', 'substatus_change', 'proof_event', 'due_date_change',
  'assignment_change', 'priority_change', 'note', 'conversion', 'override',
]);
assert.deepEqual(entity.properties.event_type.enum, [...PRODUCT_AUDIT_EVENT_TYPES],
  'entity enum matches model event types');
for (const t of ['staff', 'customer', 'vendor', 'system']) {
  assert.ok(entity.properties.actor_type.enum.includes(t), `actor_type ${t}`);
}
for (const f of ['work_order_id', 'product_id', 'event_type', 'occurred_at']) {
  assert.ok(entity.required.includes(f), `required ${f}`);
}
assert.ok(entity.properties.schema_version && entity.properties.creation_request_key,
  'sibling conventions (schema_version + creation_request_key) present');
for (const op of ['create', 'read', 'update', 'delete']) {
  assert.match(entity.rls[op].user_condition.role, /backend_only/, `rls ${op} backend-only`);
}

// === B-12: buildProductAuditEvent diffs per event_type =======================
const NOW = '2026-11-02T07:19:35.000Z';
const product = {
  id: 'prod-1', work_order_id: 'wo-9', description: 'Channel Letters',
  operational_status: 'order_review', operational_substatus: 'rush',
  proof_status: 'none', design_due_date: '2026-11-10',
  assigned_to: 'amy@shop.com', priority: 50, quantity: 3,
};

// status_change
{
  const evts = buildProductAuditEvent(product, { operational_status: 'in_production' },
    { actor: 'Brett', now: NOW });
  assert.equal(evts.length, 1);
  assert.equal(evts[0].event_type, 'status_change');
  assert.equal(evts[0].from_value, 'order_review');
  assert.equal(evts[0].to_value, 'in_production');
  assert.equal(evts[0].work_order_id, 'wo-9');
  assert.equal(evts[0].product_id, 'prod-1');
  assert.equal(evts[0].actor_label, 'Brett');
  assert.equal(evts[0].actor_type, 'staff');
  assert.equal(evts[0].occurred_at, NOW);
}

// substatus_change (field + quick_tags)
{
  assert.equal(
    buildProductAuditEvent(product, { operational_substatus: 'hold' }, { now: NOW })[0].event_type,
    'substatus_change');
  const tags = buildProductAuditEvent({ id: 'p', quick_tags: ['a', 'b'] }, { quick_tags: ['a', 'c'] }, { now: NOW });
  assert.equal(tags[0].event_type, 'substatus_change');
  assert.equal(tags[0].from_value, 'a, b');
  assert.equal(tags[0].to_value, 'a, c');
}

// proof_event — every proof field grouped under one event_type
{
  const evts = buildProductAuditEvent(product,
    { proof_status: 'awaiting_approval', proof_version: 2, proof_file_name: 'v2.pdf' }, { now: NOW });
  assert.equal(evts.length, 3);
  assert.ok(evts.every((e) => e.event_type === 'proof_event'));
  assert.deepEqual(evts.map((e) => e.details.field), ['proof_status', 'proof_version', 'proof_file_name']);
}

// due_date_change + assignment_change + priority_change
{
  const due = buildProductAuditEvent(product,
    { design_due_date: '2026-11-12', product_due_date: '2026-11-20', hard_due_date: true }, { now: NOW });
  assert.equal(due.length, 3);
  assert.ok(due.every((e) => e.event_type === 'due_date_change'));
  assert.equal(due[2].to_value, 'yes', 'boolean renders as yes');
  const asg = buildProductAuditEvent(product,
    { assigned_to: 'bob@shop.com', designer: 'dee', responsibility: 'fab' }, { now: NOW });
  assert.equal(asg.length, 3);
  assert.ok(asg.every((e) => e.event_type === 'assignment_change'));
  const pri = buildProductAuditEvent(product, { priority: 10, queue_priority: 2 }, { now: NOW });
  assert.equal(pri.length, 2);
  assert.ok(pri.every((e) => e.event_type === 'priority_change'));
}

// no-signal patches / unchanged values → zero rows
{
  assert.deepEqual(buildProductAuditEvent(product, { quantity: 5, quoted_total: 900 }, { now: NOW }), []);
  assert.deepEqual(buildProductAuditEvent(product, { operational_status: 'order_review' }, { now: NOW }), []);
  assert.deepEqual(buildProductAuditEvent(null, { operational_status: 'x' }, { now: NOW })
    .filter((e) => !e.work_order_id && !e.product_id).length, 1, 'bare patch still emits a row');
}

// note events + actor types + workOrderId override
{
  const note = buildProductAuditEvent(product, { note: 'Customer called' }, { now: NOW, actorType: 'customer' });
  assert.equal(note[0].event_type, 'note');
  assert.equal(note[0].note, 'Customer called');
  assert.equal(note[0].actor_type, 'customer');
  const over = buildProductAuditEvent({ id: 'p2' }, { operational_status: 'built' },
    { now: NOW, workOrderId: 'wo-77', actorType: 'bogus' });
  assert.equal(over[0].work_order_id, 'wo-77', 'opts.workOrderId wins when product lacks it');
  assert.equal(over[0].actor_type, 'staff', 'unknown actor type falls back to staff');
  assert.equal(makeProductAuditEvent({ event_type: 'nope' }), null, 'bad event type rejected');
  assert.equal(makeProductAuditEvent({ event_type: 'conversion', to_value: 'wo-1' }).event_type, 'conversion');
}

// formatAuditLine
{
  const evt = buildProductAuditEvent(product, { operational_status: 'in_production' },
    { actor: 'Brett', now: NOW })[0];
  const line = formatAuditLine(evt);
  assert.match(line, /2026-11-02 07:19/, 'timestamp rendered');
  assert.match(line, /Brett/, 'actor rendered');
  assert.match(line, /order_review → in_production/, 'from → to rendered');
  assert.match(formatAuditLine({ event_type: 'note', note: 'called', occurred_at: NOW }), /Note: called/);
  assert.match(formatAuditLine({ event_type: 'override', note: 'hot job', occurred_at: NOW }), /Override/);
}

// === B-13: worst-first stage derivation ======================================
assert.equal(deriveWorkOrderStage([]), null, 'empty → null (no signal)');
assert.equal(deriveWorkOrderStage(null), null);
assert.equal(deriveWorkOrderStage([{ operational_status: 'in_production' }]), 'production');
assert.equal(
  deriveWorkOrderStage([
    { operational_status: 'in_production' },
    { operational_status: 'in_production' },
    { operational_status: 'in_production' },
  ]), 'production', 'all-in-production flips the stage');
// single straggler holds the stage at its own level
assert.equal(
  deriveWorkOrderStage([
    { operational_status: 'in_production' },
    { operational_status: 'design_review' },
    { operational_status: 'built' },
  ]), 'design', 'design straggler pins the board at design');
assert.equal(
  deriveWorkOrderStage([{ operational_status: 'order_review' }, { operational_status: 'built' }]),
  'sales', 'least-advanced product wins');
assert.equal(deriveWorkOrderStage([{ operational_status: 'completed' }, { operational_status: 'voided' }]),
  'completed');
assert.equal(deriveWorkOrderStage([{ operational_status: 'built' }, { operational_status: 'completed' }]),
  'installation', 'built waits on install even beside completed');
assert.equal(deriveWorkOrderStage([{ operational_status: 'voided' }, { operational_status: 'in_production' }]),
  'production', 'voided never holds the stage back');
assert.equal(deriveWorkOrderStage([{ operational_status: 'permitting' }, { operational_status: 'quality_control' }]),
  'permitting');
// unknown/legacy statuses carry no signal
assert.equal(deriveWorkOrderStage([{ operational_status: 'bogus' }, {}]), null);
assert.equal(deriveWorkOrderStage([{ operational_status: 'bogus' }, { operational_status: 'in_production' }]),
  'production', 'unknown ignored, known votes');
// terminal fulfillment: a delivered/picked-up built product is done work
assert.equal(productStageContribution({ operational_status: 'built', fulfillment_state: 'installed' }),
  'completed');
assert.equal(deriveWorkOrderStage([{ operational_status: 'built', fulfillment_state: 'delivered' }]),
  'completed');
// describe: reason + counts
{
  const d = describeWorkOrderStageDerivation([
    { operational_status: 'in_production' }, { operational_status: 'design_review' },
  ]);
  assert.equal(d.stage, 'design');
  assert.equal(d.contributing, 2);
  assert.ok(d.bindingStatuses.includes('design_review'));
  assert.match(d.reason, /design_review/);
  assert.equal(describeWorkOrderStageDerivation([]).stage, null);
}
// canonical order is the shared WORK_ORDER_STAGE_SET
assert.deepEqual(WO_STAGE_ORDER, [
  'estimating', 'sales', 'permitting', 'design', 'production', 'fabrication', 'installation', 'completed',
]);

// manual-override honored
assert.equal(MANUAL_STAGE_OVERRIDE_FIELD, 'manual_stage_override');
assert.equal(hasManualStageOverride({ manual_stage_override: true }), true);
assert.equal(hasManualStageOverride({ stage_source: 'manual' }), true);
assert.equal(hasManualStageOverride({ stage_locked: true }), true);
assert.equal(hasManualStageOverride({ manual_stage_override: false }), false);
assert.equal(hasManualStageOverride({}), false);
assert.equal(hasManualStageOverride(null), false);

// === Wiring: customerSync delegates to the model =============================
const syncSrc = readFileSync(resolve(root, 'src/components/estimator/customerSync.js'), 'utf8');
assert.match(syncSrc, /import\s*\{[^}]*deriveWorkOrderStage[^}]*hasManualStageOverride[^}]*\}\s*from\s*["']\.\.\/jobs\/productStageModel["']/,
  'customerSync imports the stage model');
assert.match(syncSrc, /hasManualStageOverride\(existing\)/, 'manual-override guard applied to the WO');
assert.match(syncSrc, /deriveWorkOrderStage\(existing\?\.products\)/, 'existing WO stage derives from products');
assert.match(syncSrc, /manualStageLocked\s*\?\s*""\s*:\s*productDerivedStage\s*\|\|\s*approvalStage/,
  'manual override short-circuits BOTH derived and approval stage writes');
assert.match(syncSrc, /deriveWorkOrderStage\(fields\.products\)\s*\|\|/, 'create path also derives when products ride along');
assert.ok(!/current_stage:\s*"production"\s*:\s*\{\}/.test(syncSrc), 'no unconditional approval stage write remains');

// === Wiring: customer360 unifies onto the derive =============================
assert.equal(c360.workOrderStage({ current_stage: 'fabrication', products: [{ operational_status: 'design_review' }] }),
  'fabrication', 'stored stage wins when present');
assert.equal(c360.workOrderStage({ products: [{ operational_status: 'in_production' }] }),
  'production', 'no stored stage → derived rollup');
assert.equal(c360.workOrderStage({}), '—', 'nothing → dash');
assert.equal(c360.workOrderStage({ sales_status: 'quoted' }), 'quoted', 'sales_status fallback preserved');

rmSync(resolve(here, '.tmp-audit-stage-out'), { recursive: true, force: true });
console.log('PASS product-audit-stage');
