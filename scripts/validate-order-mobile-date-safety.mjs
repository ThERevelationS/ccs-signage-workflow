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
assert.match(source, /const dateOrdered = safeOrderMobileDate\(order\.date_ordered\)/);
assert.match(source, /const dateOrderedOption = typeof order\.date_ordered_option === 'string' \? order\.date_ordered_option\.trim\(\) : ''/);
assert.match(source, /\{dateOrderedOption \|\| format\(dateOrdered, 'MMM d, yyyy'\)\}/);
assert.ok(source.indexOf('dateOrderedOption || format(dateOrdered') > source.indexOf('dateOrderedOption || dateOrdered'),
  'mobile Ordered display should prefer a translated option over a paired calendar date');
assert.match(source, /const dateReceived = safeOrderMobileDate\(order\.date_received\)/);
assert.match(source, /const dateReceivedOption = typeof order\.receipt_option === 'string' \? order\.receipt_option\.trim\(\) : ''/);
assert.match(source, /\{dateReceivedOption \|\| format\(dateReceived, 'MMM d, yyyy'\)\}/);
assert.ok(source.indexOf('dateReceivedOption || format(dateReceived') > source.indexOf('dateReceivedOption || dateReceived'),
  'mobile Received display should prefer a translated receipt option over a paired calendar date');
assert.match(source, /<button\s+key=\{order\.id\}\s+type="button"/,
  'each mobile Order card should be a native keyboard-operable button');
assert.ok(source.includes("const customerName = typeof order.customer_name === 'string' ? order.customer_name.trim() : '';"),
  'mobile Order cards should normalize customer names before display');
assert.ok(source.includes("const displayCustomerName = customerName || 'Unnamed customer';"),
  'blank and whitespace-only customer names should share the visible fallback');
assert.ok(source.includes('aria-label={`Open order details for ${displayCustomerName}`}'),
  'each mobile Order card should announce the same normalized customer name it displays');
assert.match(source, /focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2/,
  'keyboard focus should remain visibly apparent on mobile Order cards');
assert.doesNotMatch(source, /<div\s+key=\{order\.id\}[\s\S]{0,300}onClick=/,
  'mobile Order cards should not regress to click-only div controls');
console.log('PASS Order mobile cards render verified dates and options safely and expose each details card as a visible-focus native keyboard control');
