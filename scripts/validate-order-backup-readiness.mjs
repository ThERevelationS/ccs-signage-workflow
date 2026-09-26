import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeOrderBackupReadiness } from '../base44/shared/smartsheetOrderBackupReadiness.mjs';

const sheetId = '4963691473987460';
const defaults = {
  backupEnabled: true, sheetId, smartsheetConfigured: true,
  driveApiRead: true, driveListRead: true,
  files: [], checkedAt: '2026-09-25T23:30:00Z',
};
const ready = summarizeOrderBackupReadiness(defaults);
assert.equal(ready.read_only, true);
assert.equal(ready.can_attempt_verified_backup, true);
assert.equal(ready.assessment, 'ready_for_real_backup_test');
assert.equal(ready.existing_artifact_contents_verified, false);
assert.equal(ready.new_upload_and_readback_verified, false);
assert.equal(ready.candidate_archives_found, 0);
console.log('PASS healthy connector/configuration permits a real backup attempt without pretending upload/readback were tested');

for (const [name, update] of [
  ['backup disabled', {backupEnabled: false}],
  ['missing sheet', {sheetId: ''}],
  ['wrong sheet ID', {sheetId: 'not-permanent'}],
  ['missing Smartsheet token', {smartsheetConfigured: false}],
  ['Drive credentials unreadable', {driveApiRead: false}],
  ['Drive listing blocked', {driveListRead: false}],
]) {
  const result = summarizeOrderBackupReadiness({...defaults, ...update});
  assert.equal(result.can_attempt_verified_backup, false, name);
  assert.ok(result.reasons.length > 0, name);
}
const files = [
  {id: 'drive-file-1', name: `CCS_OrderRequest_${sheetId}_pre_sync_2026-09-25T23-30-00Z.json`, mimeType: 'application/json', size: '8192'},
  {id: 'drive-file-2', name: `CCS_OrderRequest_9999_pre_sync_2026-09-25.json`, mimeType: 'application/json', size: '8192'},
  {id: 'drive-file-3', name: `CCS_OrderRequest_${sheetId}_pre_sync_2026-09-25.json`, mimeType: 'application/json', size: '0'},
  {id: 'drive-file-4', name: `CCS_OrderRequest_${sheetId}_pre_sync_2026-09-25.csv`, mimeType: 'text/csv', size: '8192'},
];
const existing = summarizeOrderBackupReadiness({...defaults,files});
assert.equal(existing.candidate_archives_found, 1);
assert.equal(existing.existing_artifact_contents_verified, false);
assert.equal(existing.new_upload_and_readback_verified, false);
console.log('PASS only nonempty JSON metadata for this permanent Order sheet counts; filenames never prove recoverability');

const backend = readFileSync(new URL('../base44/functions/smartsheetSyncAction/entry.ts', import.meta.url), 'utf8');
const routeStart = backend.indexOf("if (action === 'audit_order_backup_readiness')");
const routeEnd = backend.indexOf("if (!configured)", routeStart);
const authBoundary = backend.indexOf("if (hasSessionToken)");
assert.ok(authBoundary !== -1 && authBoundary < routeStart);
assert.ok(routeStart > 0 && routeEnd > routeStart);
const action = backend.slice(routeStart, routeEnd);
assert.match(action, /connectors\.getConnection\('googledrive'\)/);
assert.match(action, /method: 'GET'/);
assert.match(action, /drive\/v3\/about\?fields=kind/);
assert.match(action, /drive\/v3\/files\?/);
assert.match(action, /summarizeOrderBackupReadiness/);
assert.match(action, /summarizeOrderBackupReadiness/); // summary owns read_only
assert.match(action, /driveApiRead && \/\^\\d\+\$\//);
assert.doesNotMatch(action, /method: 'POST'|smartsheetWrite\(|\.bulkUpdate\(|\.bulkCreate\(|BackupLog\.create|\/upload\//);
const review = readFileSync(new URL('../src/components/orders/OrderCreateAttemptReview.jsx',import.meta.url),'utf8');
assert.match(review, /action: "audit_order_backup_readiness"/);
assert.match(review, /backupRequestRef\.current\+\+/);
assert.match(review, /Check backup/);
assert.match(review, /remain unverified until a real pre-write backup succeeds/);
console.log('PASS admin-gated route and existing Order review UI are read-only with stale-request protection');
