import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const uncertainSync = ui.slice(ui.indexOf('const saveAndSync = async () =>'), ui.indexOf('// Existing internal/manual callers'));

assert.match(uncertainSync, /catch \(error\) \{/);
assert.match(uncertainSync, /try \{\s*await loadData\(false\)/);
assert.match(uncertainSync, /catch \(verificationError\)/);
assert.match(uncertainSync, /Could not verify uncertain Order sync:/);
assert.match(uncertainSync, /Saved in Base44, but Smartsheet sync needs attention:/);
assert.match(uncertainSync, /finally \{\s*syncInFlightRef\.current = false/);

console.log('PASS uncertain Order sync remains retryable when authoritative verification reload also fails');
