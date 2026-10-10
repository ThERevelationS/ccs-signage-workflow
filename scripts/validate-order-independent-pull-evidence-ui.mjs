import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORDER_PULL_EVIDENCE_KEY,
  orderIndependentPullEvidenceModel,
} from '../src/components/orders/orderIndependentPullEvidenceModel.mjs';
import { ORDER_PULL_EVIDENCE_SETTING_KEY } from '../base44/shared/smartsheetOrderPullEvidenceStore.mjs';

assert.equal(ORDER_PULL_EVIDENCE_KEY, ORDER_PULL_EVIDENCE_SETTING_KEY);
const evidence = {
  state: 'unresolved', run_started_at: '2026-10-10T12:00:00Z',
  smartsheet_sheet_id: '4963691473987460',
  batch_evidence: {
    attempted_batches: 2, attempted_orders: 102,
    acknowledged_unverified_batches: 1, write_uncertain_batches: 1,
    older_batches_omitted: 0,
    recent_batches: [
      { batch_number: 1, total_batches: 2, count: 2, state: 'acknowledged_unverified',
        base44_order_ids: ['order-a', 'order-b'], smartsheet_row_ids: ['101', '102'] },
      { batch_number: 2, total_batches: 2, count: 1, state: 'write_uncertain',
        base44_order_ids: ['order-c'], smartsheet_row_ids: ['103'] },
    ],
  },
};
const record = { id: 'evidence-1', setting_key: ORDER_PULL_EVIDENCE_KEY, setting_value: evidence };
const view = orderIndependentPullEvidenceModel([record]);
assert.equal(view.kind, 'unresolved');
assert.equal(view.attempted, 2);
assert.equal(view.attemptedOrders, 102);
assert.equal(view.acknowledged, 1);
assert.equal(view.uncertain, 1);
assert.deepEqual(view.entries[0].links, [
  { base44Id: 'order-a', smartsheetRowId: '101' },
  { base44Id: 'order-b', smartsheetRowId: '102' },
]);
assert.equal(view.entries[1].links[0].smartsheetRowId, '103');
assert.equal(view.sheetId, '4963691473987460');
assert.equal(view.startedAt, evidence.run_started_at);
assert.equal(orderIndependentPullEvidenceModel([]).kind, 'none');
assert.equal(orderIndependentPullEvidenceModel([{ ...record, setting_value: { ...evidence, state: 'verified_complete' } }]).kind, 'none');
assert.equal(orderIndependentPullEvidenceModel(null, { readFailed: true }).kind, 'unavailable');
assert.equal(orderIndependentPullEvidenceModel([record, { ...record, id: 'duplicate' }]).kind, 'invalid');
for (const replacement of [
  { ...evidence, state: 'unexpected' },
  { ...evidence, smartsheet_sheet_id: 'not-numeric' },
  { ...evidence, batch_evidence: { ...evidence.batch_evidence, recent_batches: [] } },
  { ...evidence, batch_evidence: { ...evidence.batch_evidence, attempted_batches: 1 } },
  { ...evidence, batch_evidence: { ...evidence.batch_evidence, recent_batches: [
    { ...evidence.batch_evidence.recent_batches[0], smartsheet_row_ids: ['101'] },
  ] } },
  { ...evidence, batch_evidence: { ...evidence.batch_evidence, recent_batches: [
    { ...evidence.batch_evidence.recent_batches[0], smartsheet_row_ids: ['101', 'not-an-id'] },
  ] } },
]) assert.equal(orderIndependentPullEvidenceModel([{ ...record, setting_value: replacement }]).kind, 'invalid');
console.log('PASS independent evidence maps permanent ID pairs, hides verified records, and fails closed on missing/duplicate/malformed reads');

const page = readFileSync('src/pages/OrderForm.jsx', 'utf8');
const component = readFileSync('src/components/orders/OrderIndependentPullEvidence.jsx', 'utf8');
assert.match(page, /<OrderIndependentPullEvidence currentUser=\{currentUser\} sessionToken=\{sessionToken\} \/>/);
assert.ok(page.indexOf('<OrderIndependentPullEvidence') < page.indexOf('<OrderSpreadsheet'));
assert.match(component, /const isAdmin = currentUser\?\.role === 'admin'/);
assert.match(component, /if \(!isAdmin\) \{/);
assert.match(component, /base44\.entities\.GlobalSettings\.filter\(\{\s*setting_key: ORDER_PULL_EVIDENCE_KEY/);
assert.match(component, /setInterval\(refresh, 15000\)/);
assert.match(component, /window\.addEventListener\('focus', refresh\)/);
assert.match(component, /document\.addEventListener\('visibilitychange', refreshVisible\)/);
assert.match(component, /if \(!isAdmin \|\| view\.kind === 'none'\) return null/);
assert.match(component, /Smartsheet row ID/);
assert.match(component, /Base44 Order ID/);
assert.match(component, /role=\{view\.kind === 'unresolved' \|\| view\.kind === 'invalid'/);
assert.match(component, /onClick=\{\(\) => setRefreshKey\(value => value \+ 1\)\}/);
assert.doesNotMatch(component, /\.create\(|\.update\(|\.delete\(/);
assert.match(component, /action: 'review_unresolved_order_pull_row'/);
assert.match(component, /data\.read_only !== true \|\| data\.writes_attempted !== false/);
assert.match(component, /Comparison does not clear the review lock or retry any write/);
const widget = readFileSync('src/components/admin/SmartsheetSyncWidget.jsx', 'utf8');
assert.match(widget, /orderFormSyncStatusRelevant\(status\)/);
console.log('PASS only Order Form admins read and display the independent evidence; read-only mobile panel survives Sales coordinator changes without touching shared widgets');
