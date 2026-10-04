import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditOrderDateParity } from '../base44/shared/smartsheetOrderDateTranslation.mjs';
import { classifyOrderLocalOnlyDate } from '../base44/shared/smartsheetOrderDateEvidence.mjs';

const sheetId = '4963691473987460';
const bindings = { date_needed: '1', date_ordered: '2', date_received: '3' };
const syncedAt = '2026-10-03T10:00:00.000Z';

const preserved = {
  id: 'preserved', smartsheet_sheet_id: sheetId, smartsheet_row_id: '101',
  date_needed: '2026-10-10', smartsheet_last_synced_at: syncedAt,
  smartsheet_sync_snapshot: { '1': '', '2': '', '3': '' },
};
const newer = {
  id: 'newer', smartsheet_sheet_id: sheetId, smartsheet_row_id: '102',
  date_ordered: '2026-10-11', smartsheet_last_synced_at: syncedAt,
  smartsheet_sync_snapshot: { '1': '', '2': '', '3': '' },
};
const remoteChanged = {
  id: 'remote-changed', smartsheet_sheet_id: sheetId, smartsheet_row_id: '103',
  date_received: '2026-10-12', smartsheet_last_synced_at: syncedAt,
  smartsheet_sync_snapshot: { '1': '', '2': '', '3': '10/12/026' },
};
const remoteChangedOther = {
  id: 'remote-changed-other', smartsheet_sheet_id: sheetId, smartsheet_row_id: '105',
  date_needed: '2026-10-14', smartsheet_last_synced_at: syncedAt,
  smartsheet_sync_snapshot: { '1': '2026-10-13', '2': '', '3': '' },
};
const unverified = {
  id: 'unverified', smartsheet_sheet_id: sheetId, smartsheet_row_id: '104',
  date_needed: '2026-10-13', smartsheet_last_synced_at: '',
  smartsheet_sync_snapshot: null,
};
const audits = [{
  id: 'audit-1', entity_type: 'Order', entity_id: 'newer',
  field_name: 'date_ordered', new_value: '2026-10-11',
  modified_at: '2026-10-03T10:00:05.000Z', source: 'app', status: 'committed',
}];

assert.equal(classifyOrderLocalOnlyDate(preserved, 'date_needed', '1', audits).state, 'preserved_historical');
assert.equal(classifyOrderLocalOnlyDate(newer, 'date_ordered', '2', audits).state, 'verified_newer_local');
assert.equal(classifyOrderLocalOnlyDate(remoteChanged, 'date_received', '3', audits).state, 'remote_blank_changed_since_sync');
assert.equal(classifyOrderLocalOnlyDate(remoteChangedOther, 'date_needed', '1', audits).state, 'remote_blank_changed_since_sync');
assert.equal(classifyOrderLocalOnlyDate(unverified, 'date_needed', '1', audits).state, 'unverified_local_only');
console.log('PASS local-only date evidence distinguishes preserved history, newer local edit, later remote blank and incomplete evidence');

const rows = [
  { id: '101', cells: [] },
  { id: '102', cells: [] },
  { id: '103', cells: [] },
  { id: '104', cells: [] },
  { id: '105', cells: [] },
];
const report = auditOrderDateParity([preserved, newer, remoteChanged, remoteChangedOther, unverified], rows, bindings, sheetId, audits);
assert.equal(report.counts.base44_date_missing_in_smartsheet, 5);
assert.equal(report.counts.preserved_historical_dates, 1);
assert.equal(report.counts.verified_newer_local_dates, 1);
assert.equal(report.counts.remote_blank_changed_since_sync, 2);
assert.equal(report.counts.remote_blank_after_same_date, 1);
assert.equal(report.counts.remote_blank_after_other_value, 1);
assert.equal(report.counts.unverified_local_only_dates, 1);
assert.equal(report.by_field.date_needed.preserved_historical, 1);
assert.equal(report.by_field.date_ordered.verified_newer_local, 1);
assert.equal(report.by_field.date_received.remote_blank_changed_since_sync, 1);
assert.equal(report.by_field.date_received.remote_blank_after_same_date, 1);
assert.equal(report.by_field.date_needed.remote_blank_after_other_value, 1);
assert.equal(report.samples.preserved_historical_dates[0].base44_order_id, 'preserved');
assert.equal(report.samples.verified_newer_local_dates[0].local_modified_at, '2026-10-03T10:00:05.000Z');
assert.equal(report.samples.remote_blank_changed_since_sync[0].prior_remote_value, '10/12/026');
assert.equal(report.samples.remote_blank_changed_since_sync[0].prior_remote_normalized_date, '2026-10-12');
assert.equal(report.samples.remote_blank_changed_since_sync[0].prior_remote_matches_base44, true);
assert.equal(report.samples.remote_blank_changed_since_sync[1].prior_remote_matches_base44, false);
console.log('PASS full-sheet read-only date audit classifies every Base44-only calendar date and legacy-equivalent prior values without changing either side');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const ui = readFileSync('src/components/orders/OrderDateParityReview.jsx', 'utf8');
const action = backend.slice(
  backend.indexOf("if (action === 'audit_order_dates')"),
  backend.indexOf("if (action === 'debug_dates')"),
);

assert.match(action, /entity: base44\.asServiceRole\.entities\.FieldAudit/);
assert.match(action, /entity_type: 'Order'/);
assert.match(action, /status: 'committed'/);
assert.match(action, /field_name: \{ \$in: dateFields \}/);
assert.match(action, /auditOrderDateParity\(orders, sheetRows, bindings, sheetId, dateFieldAudits\)/);
assert.match(action, /date_field_audit_events: dateFieldAudits\.length/);
assert.doesNotMatch(action, /smartsheetWrite|\.bulkUpdate\(|\.create\(|\.update\(|\.delete\(/);
console.log('PASS authenticated historical-date evidence collection remains read-only');

assert.match(ui, /Local-only date evidence/);
assert.match(ui, /Preserved historical/);
assert.match(ui, /Verified newer local/);
assert.match(ui, /Remote became blank/);
assert.match(ui, /Evidence incomplete/);
assert.match(ui, /date_field_audit_events/);
assert.match(ui, /explicit review\/Save & Sync, not automatic mass push/);
assert.match(ui, /Last verified sync:/);
assert.match(ui, /Verified local edit:/);
assert.match(ui, /same calendar date as Base44 after legacy-date normalization/);
assert.match(ui, /Previous value as calendar date:/);
assert.match(ui, /same as Base44/);
console.log('PASS admin review explains historical, newer and legacy-equivalent Base44-only dates instead of presenting one undifferentiated discrepancy count');
