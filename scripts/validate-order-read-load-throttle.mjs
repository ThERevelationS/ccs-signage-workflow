import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSmartsheetOrderPageGuard } from '../base44/shared/smartsheetOrderPageGuard.mjs';

const sheet = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const entry = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');

// Single-flight: quiet background loads must not stack in parallel while a
// load is already paging entity rows.
assert.match(sheet, /const loadInFlightRef = useRef\(false\)/, 'loadData needs a single-flight ref');
assert.match(sheet, /if \(!explicitLoad && loadInFlightRef\.current\) return false;/,
  'background loads must return early while a load is in flight');
assert.match(sheet, /finally \{\s*if \(ownsLoadSlot\) loadInFlightRef\.current = false;\s*\}/,
  'the in-flight flag must be released only by the call that claimed it');

// Pending-marker reconciliation poll: 5s -> 30s.
assert.ok(!sheet.includes('loadData(false), 5000)'), 'the 5s pending-marker poll must be removed');
assert.ok(sheet.includes('loadData(false), 30000)'), 'the pending-marker poll must run every 30s');

// Focus/visibility/online refresh throttle.
assert.match(sheet, /const lastLoadStartedAtRef = useRef\(0\)/, 'focus throttle needs the last load start time');
assert.match(sheet, /Date\.now\(\) - lastLoadStartedAtRef\.current < ORDER_FOCUS_RELOAD_THROTTLE_MS/,
  'focus/visibility refreshes must be throttled to 15s');

// WorkOrder/authorized-user reads are cached and gated on explicit loads or a
// 5-minute staleness window; Orders still reload every time.
assert.match(sheet, /const reloadAux = explicitLoad \|\|\s*!lastAuxLoadAtRef\.current \|\| Date\.now\(\) - lastAuxLoadAtRef\.current > ORDER_AUX_RELOAD_MS;/,
  'WorkOrder/user reloads must be gated on explicit loads or staleness');
assert.match(sheet, /reloadAux\s*\?\s*loadAllEntityRows\(\{[\s\S]*?entity: WorkOrder/,
  'WorkOrder paging must be skipped for cached background reloads');

// Backend: the push pre-fetch loop must use the shared page guard driven by
// totalRowCount, not the body's (absent) totalPages field.
assert.ok(!entry.includes('body?.totalPages'), 'entry.ts must not read body?.totalPages');
assert.ok(entry.includes('preFetchGuard.accept('), 'preFetchGuard.accept must drive the pre-fetch loop');
assert.ok(entry.includes('preFetchGuard.assertComplete()'), 'preFetchGuard.assertComplete must verify the pre-fetch');

// Functional regression: 1690 rows at pageSize 500 complete only on page 4.
// The old totalPages loop stopped after page 1.
{
  const guard = createSmartsheetOrderPageGuard({ pageSize: 500, maxPages: 100 });
  let nextId = 1;
  const makePage = (n) => {
    const rows = Array.from({ length: n }, () => ({ id: nextId++ }));
    return [{ totalRowCount: 1690, version: 7, rows }, rows];
  };
  const [b1, r1] = makePage(500);
  const [b2, r2] = makePage(500);
  const [b3, r3] = makePage(500);
  const [b4, r4] = makePage(190);
  assert.equal(guard.accept(1, b1, r1), false);
  assert.equal(guard.accept(2, b2, r2), false);
  assert.equal(guard.accept(3, b3, r3), false);
  assert.equal(guard.accept(4, b4, r4), true, '1690 rows at pageSize 500 complete on page 4');
  assert.doesNotThrow(() => guard.assertComplete());
}

console.log('PASS Order read-load throttle and Smartsheet pre-fetch page guard');
