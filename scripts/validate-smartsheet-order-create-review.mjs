import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditOrderCreateAttempts, verifyOrderCreateAuditSheetIdentity } from '../base44/shared/smartsheetOrderCreateReview.mjs';
import { createSmartsheetOrderPageGuard } from '../base44/shared/smartsheetOrderPageGuard.mjs';

const SHEET = '4963691473987460';
const order = (id, marker = {}, overrides = {}) => ({
  id, customer_name: 'Test customer', smartsheet_sheet_id: SHEET,
  smartsheet_create_attempt: { sheet_id: SHEET, attempt_id: 'attempt-' + id,
    started_at: '2026-09-24T12:00:00Z', ...marker },
  ...overrides,
});
const linked = order('linked', { status: 'linked', row_id: '111', linked_at: '2026-09-24T12:01:00Z' }, { smartsheet_row_id: '111' });
const reserved = order('timeout', { status: 'reserved' });
const existing = order('existing', { status: 'created_unlinked', row_id: '222', expected_snapshot: { '1': 'Test customer' } }, { smartsheet_pending_local_sync: true });
const missing = order('missing', { status: 'reserved', row_id: '333' });
const conflicted = order('conflict', { status: 'linked', row_id: '444' }, { smartsheet_row_id: '555' });
const differentSheet = order('other-sheet', { sheet_id: '999', status: 'reserved', row_id: '666' });
const duplicate = order('duplicate', { status: 'linked', row_id: '777' }, { smartsheet_row_id: '777' });
const unmarked = { id: 'unmarked', smartsheet_sheet_id: SHEET, smartsheet_row_id: '777' };
const deleted = order('deleted', { status: 'linked', row_id: '888' }, { deleted: true, smartsheet_row_id: '888' });
const orders = [linked, reserved, existing, missing, conflicted, differentSheet, duplicate, unmarked, deleted];
const rows = [111, 222, 444, 555, 666, 777, 888].map(id => ({ id: String(id) }));
const result = auditOrderCreateAttempts(orders, rows.slice().reverse(), SHEET);
assert.equal(result.read_only, true);
assert.equal(result.total_markers, 8);
assert.equal(result.unresolved_markers, 5);
assert.equal(result.retry_sync_recoverable, 1);
assert.equal(result.manual_investigation_required, 6);
assert.deepEqual(result.counts, { verified_link: 1, ambiguous: 6, missing_row: 1 });
assert.equal(result.records_by_category.verified_link[0].base44_record_id, 'linked');
assert.equal(result.records_by_category.missing_row[0].base44_record_id, 'missing');
assert.equal(result.records_by_category.missing_row[0].remote_row_present, false);
const reasons = Object.fromEntries(result.records_by_category.ambiguous.map(r => [r.base44_record_id, r.reason]));
for (const id of ['timeout', 'existing', 'conflict', 'other-sheet', 'duplicate', 'deleted']) {
  assert.equal(typeof reasons[id], 'string');
}
assert.match(reasons.timeout, /cannot be ruled out/i);
assert.match(reasons.conflict, /different permanent row IDs/i);
assert.match(reasons['other-sheet'], /does not match/i);
assert.match(reasons.duplicate, /multiple active/i);
assert.match(reasons.deleted, /not fully verified/i);
const recoverable = result.records_by_category.ambiguous.find(r => r.base44_record_id === 'existing');
assert.equal(recoverable.remote_row_present, true);
assert.equal(recoverable.retry_sync_recoverable, true);
assert.equal(recoverable.recovery_state, 'retry_sync_recoverable');
assert.match(recoverable.recommended_action, /Retry Sync can safely attempt recovery/);
const reservedReview = result.records_by_category.ambiguous.find(r => r.base44_record_id === 'timeout');
assert.equal(reservedReview.retry_sync_recoverable, false);
assert.equal(reservedReview.recovery_state, 'manual_investigation');
assert.match(reservedReview.recommended_action, /Manual Smartsheet investigation required/);
console.log('PASS create-attempt review distinguishes safe Retry Sync recovery from manual permanent-ID investigation');

assert.throws(() => auditOrderCreateAttempts(orders, [{ id: '111' }, { id: '111' }], SHEET), /repeated permanent/);
assert.throws(() => auditOrderCreateAttempts(orders, [{ id: 'unsafe-id' }], SHEET), /invalid or repeated/);
assert.throws(() => auditOrderCreateAttempts(null, rows, SHEET), /complete Order/);
assert.throws(() => auditOrderCreateAttempts(orders, rows, ''), /permanent sheet/);
console.log('PASS invalid identifiers, duplicate remote rows, and missing required inputs fail closed');

const noMarkers = auditOrderCreateAttempts([{ id: 'plain' }], [], SHEET);
assert.equal(noMarkers.total_markers, 0);
assert.deepEqual(noMarkers.counts, { verified_link: 0, ambiguous: 0, missing_row: 0 });
assert.equal(noMarkers.retry_sync_recoverable, 0);
assert.equal(noMarkers.manual_investigation_required, 0);
const many = Array.from({ length: 102 }, (_, index) => order('unknown-' + index, { status: 'reserved' }));
const capped = auditOrderCreateAttempts(many, rows, SHEET);
assert.equal(capped.counts.ambiguous, 102);
assert.equal(capped.records_by_category.ambiguous.length, 100);
assert.equal(capped.record_lists_truncated.ambiguous, true);
console.log('PASS empty-marker review and 100-card preview caps preserve full counts');

const pageGuard = createSmartsheetOrderPageGuard({ pageSize: 1, maxPages: 3 });
assert.equal(pageGuard.accept(1, { rows: [{ id: 111 }], version: 1, totalRowCount: 2 }, [{ id: '111' }]), false);
assert.throws(() => pageGuard.accept(2, { rows: [], version: 2, totalRowCount: 2 }, []), /changed|ended before all rows were retrieved/);
assert.throws(() => { const guard = createSmartsheetOrderPageGuard(); guard.assertComplete(); }, /could not be verified/i);
console.log('PASS incomplete and moving-sheet evidence cannot justify a missing-row classification');

assert.equal(verifyOrderCreateAuditSheetIdentity({ id: Number(SHEET) }, SHEET), SHEET);
assert.equal(verifyOrderCreateAuditSheetIdentity({ id: SHEET }, SHEET), SHEET);
for (const response of [null, {}, { id: null }, { id: '999' }, { id: 'bad-id' }]) {
  assert.throws(() => verifyOrderCreateAuditSheetIdentity(response, SHEET), /permanent Order Request sheet ID/);
}
assert.throws(() => verifyOrderCreateAuditSheetIdentity({ id: SHEET }, ''), /permanent Order Request sheet ID/);
console.log('PASS each evidence page requires the exact configured permanent sheet ID');

const ui = readFileSync(new URL('../src/components/orders/OrderCreateAttemptReview.jsx', import.meta.url), 'utf8');
assert.match(ui, /Retry Sync recoverable/);
assert.match(ui, /Manual investigation/);
assert.match(ui, /Retry Sync can safely attempt recovery/);
assert.match(ui, /Manual Smartsheet investigation required/);
assert.match(ui, /no recovery runs automatically/);
assert.match(ui, /durable created_unlinked marker/);
console.log('PASS admin review explains exactly when Retry Sync recovery is eligible and when manual investigation is required');

const source = readFileSync(new URL('../base44/functions/smartsheetSyncAction/entry.ts', import.meta.url), 'utf8');
const action = source.slice(source.indexOf("if (action === 'audit_order_create_attempts')"), source.indexOf("if (action === 'audit_order_requestor_emails')"));
assert.match(action, /loadAllEntityRows/);
assert.match(action, /createSmartsheetOrderPageGuard/);
assert.match(action, /guard\.assertComplete\(\)/);
assert.match(action, /verifyOrderCreateAuditSheetIdentity\(result\.body, sheetId\)/);
assert.match(action, /auditOrderCreateAttempts/);
assert.doesNotMatch(action, /smartsheetWrite|\.create\(|\.update\(|\.delete\(/);
console.log('PASS review backend remains admin-gated by existing router and performs no writes');
