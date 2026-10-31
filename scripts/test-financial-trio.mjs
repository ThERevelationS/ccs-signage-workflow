// Financial trio hardening checks: SalesLocation registry + deposit gating.
//   node scripts/test-financial-trio.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// ---------- A) SalesLocation entity ----------
const slPath = 'base44/entities/SalesLocation.jsonc';
assert.ok(existsSync(slPath), 'SalesLocation.jsonc must exist');
const sl = readFileSync(slPath, 'utf8');
for (const field of ['"name"', '"code"', '"tax_group"', '"address"', '"hours"', '"active"']) {
  assert.ok(sl.includes(field), `SalesLocation missing field ${field}`);
}
assert.match(sl, /"required":\s*\[[^\]]*"name"[^\]]*\]/, 'name must be required');
assert.match(sl, /"active"[^}]*"default":\s*true/, 'active must default true');
assert.match(sl, /__saleslocation_backend_only__/, 'SalesLocation RLS must be backend-only');
assert.equal((sl.match(/user_condition/g) || []).length, 4, 'all four RLS ops must be backend-only');

// ---------- A) Locations panel + wizard select ----------
const panel = readFileSync('src/components/reconciliation/LocationsPanel.jsx', 'utf8');
assert.match(panel, /staffEntities\.SalesLocation\.create/, 'panel must create via staff gateway');
assert.match(panel, /staffEntities\.SalesLocation\.update/, 'panel must update via staff gateway');
assert.match(panel, /isAdmin/, 'panel must be admin-aware');

const page = readFileSync('src/pages/Reconciliation.jsx', 'utf8');
assert.match(page, /staffEntities\.SalesLocation\.list/, 'page must load SalesLocation rows');
assert.match(page, /salesLocations=\{salesLocations\}/, 'page must pass registry rows to wizard');
assert.match(page, /<LocationsPanel/, 'page must render the Locations panel');

const wiz = readFileSync('src/components/reconciliation/ReconcileWizard.jsx', 'utf8');
assert.ok(!wiz.includes('<datalist'), 'free-text datalist must be removed');
assert.ok(!wiz.includes('list="recon-locations"'), 'free-text list attr must be removed');
assert.match(wiz, /<select className/, 'location must be a <select>');
assert.match(wiz, /locationOptions/, 'select must be driven by registry options');
assert.match(wiz, /location: clean\(location\)/, 'batch field name must stay `location` storing the name');
assert.match(wiz, /loc\?\.active === false/, 'inactive locations must be filtered out');

// ---------- B) WorkOrder deposit fields ----------
const wo = readFileSync('base44/entities/WorkOrder.jsonc', 'utf8');
for (const field of ['"deposit_required"', '"deposit_amount"', '"deposit_invoiced"']) {
  assert.ok(wo.includes(field), `WorkOrder missing ${field}`);
}
assert.match(wo, /"deposit_required"[^}]*"type":\s*"boolean"[^}]*"default":\s*false/, 'deposit_required bool default false');
assert.match(wo, /"deposit_amount"[^}]*"type":\s*"number"/, 'deposit_amount number');
assert.match(wo, /"deposit_invoiced"[^}]*"type":\s*"boolean"[^}]*"default":\s*false/, 'deposit_invoiced bool default false');

// ---------- B) Gating hook in the shared transition path ----------
const woc = readFileSync('src/components/estimator/workOrderConversion.js', 'utf8');
assert.match(woc, /import \{ DEPOSIT_GATED_STATUSES, depositGateApplies, depositGateMessage \}/, 'gate helpers must be imported');
assert.match(woc, /window\.confirm\(depositGateMessage/, 'gate must warn via confirm, not block');
assert.match(woc, /workOrder = null/, 'helper must accept a WO snapshot hint');
assert.match(woc, /depositCancelled/, 'declining must abort the transition');

const dg = readFileSync('src/components/estimator/depositGate.js', 'utf8');
assert.match(dg, /PRODUCT_TO_STAGE/, 'gated statuses must derive from PRODUCT_TO_STAGE');
assert.match(dg, /depositCoveredByFinancials/, 'auto-suggest coverage helper must exist');

const pq = readFileSync('src/components/queues/ProductQueue.jsx', 'utf8');
assert.match(pq, /workOrder: workOrderById\.get/, 'queue must pass WO snapshot into transition');

const jw = readFileSync('src/components/jobs/JobWorkspace.jsx', 'utf8');
assert.match(jw, /depositChip\(wo\)/, 'header chip must derive from depositChip helper');
assert.match(jw, /depositChipData\.text/, 'chip must render deposit text');
assert.match(jw, /Mark deposit invoiced/, 'mark-invoiced button must exist');
assert.match(jw, /replaceWorkOrderFieldsIfUnchanged/, 'deposit writes must go through CAS');
assert.match(jw, /depositCoveredByFinancials/, 'auto-suggest must be wired');
assert.match(jw, /workOrder: wo/, 'workspace must pass WO snapshot into transition');

// ---------- Behavioral: depositGate semantics ----------
const out = resolve(here, '.tmp-deposit-gate.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/depositGate.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  external: ['react', 'react-dom', 'lucide-react'],
});
const {
  DEPOSIT_GATED_STATUSES,
  depositGateApplies,
  depositGateMessage,
  depositRequiredUninvoiced,
  depositCoveredByFinancials,
  depositChip,
} = await import(pathToFileURL(out).href);
rmSync(out, { force: true });

// Gated statuses are exactly the production/fabrication-mapped ones.
assert.deepEqual([...DEPOSIT_GATED_STATUSES].sort(), ['in_production', 'proof_approved', 'quality_control']);

const woBlocked = { id: 'wo1', deposit_required: true, deposit_amount: 500, deposit_invoiced: false, estimate_id: 'est1' };
const product = { id: 'p1', operational_status: 'in_design' };

// Gate fires only for production-bound moves on required-but-uninvoiced jobs.
assert.equal(depositGateApplies(woBlocked, product, 'in_production'), true);
assert.equal(depositGateApplies(woBlocked, product, 'proof_approved'), true);
assert.equal(depositGateApplies(woBlocked, product, 'quality_control'), true);
assert.equal(depositGateApplies(woBlocked, product, 'in_design'), false, 'design move not gated');
assert.equal(depositGateApplies(woBlocked, product, 'vended'), false, 'fulfillment-ish status not gated');
assert.equal(depositGateApplies(woBlocked, { id: 'p1', operational_status: 'in_production' }, 'in_production'), false, 'same-status re-save not gated');
assert.equal(depositGateApplies({ ...woBlocked, deposit_invoiced: true }, product, 'in_production'), false, 'invoiced deposit not gated');
assert.equal(depositGateApplies({ ...woBlocked, deposit_required: false }, product, 'in_production'), false, 'no requirement not gated');
assert.equal(depositGateApplies(null, product, 'in_production'), false, 'missing WO snapshot never blocks');

assert.equal(depositRequiredUninvoiced(woBlocked), true);
assert.equal(depositRequiredUninvoiced({ ...woBlocked, deposit_invoiced: true }), false);
assert.match(depositGateMessage(woBlocked), /Deposit required \$500\.00 — not invoiced/);
assert.match(depositGateMessage({ ...woBlocked, deposit_amount: 0 }), /Deposit required — not invoiced/);

// Chips: none when no requirement; amber-ish required; emerald invoiced.
assert.equal(depositChip({}), null);
assert.equal(depositChip(woBlocked).tone, 'required');
assert.match(depositChip(woBlocked).text, /Deposit required \$500\.00 — not invoiced/);
assert.equal(depositChip({ ...woBlocked, deposit_invoiced: true }).tone, 'invoiced');
assert.match(depositChip({ ...woBlocked, deposit_invoiced: true }).text, /Deposit invoiced/);

// Auto-suggest coverage: invoice total >= deposit (non-draft), or a live payment.
assert.equal(depositCoveredByFinancials(woBlocked, {}).covered, false);
assert.equal(
  depositCoveredByFinancials(woBlocked, { invoices: [{ id: 'i1', work_order_id: 'wo1', total: 500, status: 'sent' }] }).covered,
  true, 'sent invoice >= deposit covers'
);
assert.equal(
  depositCoveredByFinancials(woBlocked, { invoices: [{ id: 'i1', work_order_id: 'wo1', total: 499.99, status: 'sent' }] }).covered,
  false, 'invoice below deposit does not cover'
);
assert.equal(
  depositCoveredByFinancials(woBlocked, { invoices: [{ id: 'i1', work_order_id: 'wo1', total: 900, status: 'draft' }] }).covered,
  false, 'draft invoice does not cover'
);
assert.equal(
  depositCoveredByFinancials(woBlocked, { invoices: [{ id: 'i1', work_order_id: 'wo1', total: 900, status: 'void' }] }).covered,
  false, 'void invoice does not cover'
);
assert.equal(
  depositCoveredByFinancials(woBlocked, { payments: [{ id: 'p', work_order_id: 'wo1', amount: 10, status: 'recorded' }] }).covered,
  true, 'a live payment covers'
);
assert.equal(
  depositCoveredByFinancials(woBlocked, { payments: [{ id: 'p', work_order_id: 'wo1', amount: 10, status: 'refunded' }] }).covered,
  false, 'refunded payment does not cover'
);
assert.equal(
  depositCoveredByFinancials(woBlocked, { payments: [{ id: 'p', work_order_id: 'other', amount: 10, status: 'recorded' }] }).covered,
  false, 'unlinked payment does not cover'
);
assert.equal(depositCoveredByFinancials({ ...woBlocked, deposit_invoiced: true }, { payments: [{ work_order_id: 'wo1', amount: 1, status: 'recorded' }] }).covered, false, 'already invoiced → no suggest');

console.log('PASS financial-trio');
