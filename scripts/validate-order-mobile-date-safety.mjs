import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/orders/OrderMobileCards.jsx', 'utf8');
const helperMatch = source.match(/export const safeOrderMobileDate = \(value\) => \{([\s\S]*?)\n\};/);
assert.ok(helperMatch, 'mobile Order date parser should be exported for regression coverage');

const safeOrderMobileDate = new Function('value', helperMatch[1]) ;
const valid = safeOrderMobileDate('2026-09-28');
assert.ok(valid instanceof Date);
assert.equal(valid.getFullYear(), 2026);
assert.equal(valid.getMonth(), 8);
assert.equal(valid.getDate(), 28);

for (const invalid of [null, undefined, '', 'In Stock', 'ASAP', '2026-02-30', '2026-13-01', '09/28/2026', '2026-9-28']) {
  assert.equal(safeOrderMobileDate(invalid), null, `expected ${String(invalid)} to be rejected`);
}

assert.match(source, /const dateNeeded = safeOrderMobileDate\(order\.date_needed\)/);
console.log('PASS Order mobile cards render only verified YYYY-MM-DD Date Needed values and safely ignore translated text or malformed dates');
