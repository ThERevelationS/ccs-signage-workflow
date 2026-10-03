import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  latestVerifiedOrderColumnEditTime,
  orderPreservedRemoteBlankNeedsReview,
} from '../base44/shared/smartsheetOrderBlankSafety.mjs';

const syncedAt = '2026-10-03T10:00:00.000Z';

assert.equal(orderPreservedRemoteBlankNeedsReview({
  localValue: 'ABC Supply',
  remoteValue: '',
  priorValue: '',
  lastSyncedAt: syncedAt,
  localEditedAt: '',
}), true);
assert.equal(orderPreservedRemoteBlankNeedsReview({
  localValue: 'ABC Supply',
  remoteValue: null,
  priorValue: null,
  lastSyncedAt: syncedAt,
  localEditedAt: '2026-10-03T09:59:59.000Z',
}), true);
assert.equal(orderPreservedRemoteBlankNeedsReview({
  localValue: 'ABC Supply',
  remoteValue: '',
  priorValue: '',
  lastSyncedAt: syncedAt,
  localEditedAt: '2026-10-03T10:00:01.000Z',
}), false);
assert.equal(orderPreservedRemoteBlankNeedsReview({
  localValue: '',
  remoteValue: '',
  priorValue: '',
  lastSyncedAt: syncedAt,
  localEditedAt: '',
}), false);
assert.equal(orderPreservedRemoteBlankNeedsReview({
  localValue: 'ABC Supply',
  remoteValue: 'Remote vendor',
  priorValue: '',
  lastSyncedAt: syncedAt,
  localEditedAt: '',
}), false);
assert.equal(orderPreservedRemoteBlankNeedsReview({
  localValue: 'ABC Supply',
  remoteValue: '',
  priorValue: 'ABC Supply',
  lastSyncedAt: syncedAt,
  localEditedAt: '',
}), false);
console.log('PASS a preserved local value cannot silently repopulate a verified remote blank without a newer field edit');

assert.equal(latestVerifiedOrderColumnEditTime([
  '2026-10-03T09:00:00.000Z',
  '',
  '2026-10-03T11:00:00.000Z',
  'invalid',
  '2026-10-03T10:00:00.000Z',
]), '2026-10-03T11:00:00.000Z');
assert.equal(latestVerifiedOrderColumnEditTime(['', 'invalid']), '');
console.log('PASS shared/contact columns can use the latest verified edit across mapped local fields');

const merge = readFileSync('base44/shared/smartsheetFieldMerge.ts', 'utf8');
const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');

assert.match(merge, /dataset==='orders' && known && text\(a\) && !text\(b\) && !text\(prior\[column\]\)/);
assert.match(merge, /for\(const candidateField of fields\) fieldTimes\.push\(await verifiedLocalFieldTime/);
assert.match(merge, /lastSyncedAt:record\.smartsheet_last_synced_at/);
assert.match(merge, /Save & Sync will not repopulate Smartsheet without review/);
assert.ok(
  merge.indexOf('if(preservedBlankNeedsReview)') <
  merge.indexOf("else if(known && !remoteChanged)winner='app'"),
  'blank-preservation guard must run before the ordinary local-wins branch'
);
assert.match(merge, /if\(approvals\[0\]\?\.status==='approved'\) \{ winner=approvals\[0\]\.decision/);
console.log('PASS field reconciliation routes preserved blanks through the existing conflict-review path before any app-wins write');

assert.match(backend, /const unresolvedOrderFields = Array\.isArray\(fieldPlan\?\.unresolved\) && fieldPlan\.unresolved\.length > 0/);
assert.match(backend, /smartsheet_pending_local_sync: unresolvedOrderFields/);
assert.doesNotMatch(
  backend.slice(
    backend.indexOf('const unresolvedOrderFields ='),
    backend.indexOf("} else {", backend.indexOf('const unresolvedOrderFields =')),
  ),
  /smartsheet_pending_local_sync: false/
);
console.log('PASS partial Order reconciliation stays durably queued until every held field is resolved');
