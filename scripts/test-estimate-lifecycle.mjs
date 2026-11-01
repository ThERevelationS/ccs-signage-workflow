import assert from 'node:assert/strict';
import { build, buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-estimate-lifecycle.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/estimator/estimateLifecycle.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { isEstimateProtected, requiresEstimateLifecycleReason, estimateAuditSnapshot, summarizeEstimateChanges } =
  await import(pathToFileURL(out).href);

for (const s of ['sent', 'approved', 'archived', 'cancelled']) assert.equal(isEstimateProtected(s), true, `${s} protected`);
for (const s of ['draft', 'calculated', '', undefined]) assert.equal(isEstimateProtected(s), false, `${s} editable`);

assert.equal(requiresEstimateLifecycleReason('draft', 'sent'), true, 'into sent needs reason');
assert.equal(requiresEstimateLifecycleReason('sent', 'approved'), true, 'protected→protected needs reason');
assert.equal(requiresEstimateLifecycleReason('draft', 'calculated'), false, 'unprotected transition free');
assert.equal(requiresEstimateLifecycleReason('sent', 'sent'), false, 'no-op transition free');

{
  const snap = estimateAuditSnapshot({ id: 'e1', updated_date: 'v1', status: 'sent', project_name: 'Sign', total_cost: '100' }, { quoteTotal: 250 });
  assert.equal(snap.id, undefined, 'system id excluded');
  assert.equal(snap.updated_date, undefined, 'version excluded');
  assert.equal(snap.status, 'sent');
  assert.equal(snap.quote_total, 250, 'computed quote total injected');
  assert.equal(snap.total_cost, 100, 'string coerced to number');
}

{
  const before = { status: 'draft', quote_total: 100, line_items: [{ id: 'a' }] };
  const after = { status: 'sent', quote_total: 150, quote_version: 1, quote_issue_date: '2026-10-27', line_items: [{ id: 'a' }] };
  const changes = summarizeEstimateChanges(before, after);
  assert.ok(changes.some((c) => c.includes('Status: draft → sent')), 'status change noted');
  assert.ok(changes.some((c) => c.includes('Version 1')), 'quote version noted');
  assert.ok(changes.some((c) => c.includes('100.00 → 150.00')), 'total delta noted');
}
assert.deepEqual(summarizeEstimateChanges({}, {}), ['Estimate saved with no material customer-facing change detected'], 'empty -> fallback note');
{
  const changes = summarizeEstimateChanges({ discount_percent: 10 }, { discount_percent: 20 });
  assert.ok(changes.some((c) => c.includes('quote settings')), 'quote-key drift noted');
  assert.equal(changes.some((c) => c.includes('details changed')), false);
}
{
  const changes = summarizeEstimateChanges({ project_name: 'A' }, { project_name: 'B' });
  assert.ok(changes.some((c) => c.includes('details changed')), 'detail-key drift noted');
}

console.log('PASS estimate lifecycle (14 cases)');

// #255/#271 — quote rejection + acceptance supersede helpers. The service
// module imports @/api/base44Client for its entity writes, so the bundle
// stubs that specifier with a tiny inline plugin (the pure helpers never
// touch it).
const stubBase44 = {
  name: 'stub-base44-client',
  setup(build) {
    build.onResolve({ filter: /^@\/api\/base44Client$/ }, () => ({ path: 'stub-base44', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const base44 = { entities: {}, functions: {} };' }));
  },
};
const svcOut = resolve(here, '.tmp-estimate-revision-service.mjs');
await build({
  entryPoints: [resolve(here, '../src/components/estimator/estimateRevisionService.js')],
  bundle: true, format: 'esm', outfile: svcOut, logLevel: 'silent', plugins: [stubBase44],
});
const {
  isEstimateAcceptanceSuperseded,
  activeEstimateAcceptances,
  cleanQuoteRejectReason,
  quoteRejectFollowUpKey,
  quoteRejectRevisionKey,
  supersedeAcceptanceRevisionKey,
} = await import(pathToFileURL(svcOut).href);

assert.equal(isEstimateAcceptanceSuperseded({ status: 'accepted' }), false, 'accepted row active');
assert.equal(isEstimateAcceptanceSuperseded({}), false, 'legacy row without status counts active');
assert.equal(isEstimateAcceptanceSuperseded({ status: 'superseded' }), true, 'superseded status');
assert.equal(isEstimateAcceptanceSuperseded({ superseded_at: '2026-11-01T00:00:00Z' }), true, 'superseded_at marker');
assert.deepEqual(
  activeEstimateAcceptances([{ id: 'a', status: 'accepted' }, { id: 'b', status: 'superseded' }, { id: 'c', superseded_at: 'x' }]).map((r) => r.id),
  ['a'], 'active filter drops superseded');
assert.deepEqual(activeEstimateAcceptances(null), [], 'non-array yields empty');

assert.equal(cleanQuoteRejectReason('  price too high  '), 'price too high', 'reason trimmed');
assert.equal(cleanQuoteRejectReason('   '), '', 'blank reason rejected — a lost quote is never silent');
assert.equal(cleanQuoteRejectReason('x'.repeat(600)).length, 500, 'reason capped at 500 chars');

assert.equal(quoteRejectFollowUpKey('e1'), 'staff-reject-request:e1', 'stable follow-up key per estimate');
assert.equal(quoteRejectRevisionKey('e1', 'v42'), 'quote_reject:e1:v42', 'revision key anchored on pre-write version');
assert.equal(quoteRejectRevisionKey('e1', ''), 'quote_reject:e1:unknown', 'missing anchor falls back');
assert.equal(supersedeAcceptanceRevisionKey('a9'), 'supersede_acceptance:a9', 'supersede key anchored on acceptance id');

console.log('PASS acceptance supersede + quote reject helpers (13 cases)');