import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
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
