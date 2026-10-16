import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Synthetic Order Form UI event checks only. No app login, entity write, or
// Smartsheet request is made by this regression.
const source = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const customerStart = source.indexOf('{/* Customer Name with Work Order Link */}');
const customerEnd = source.indexOf('{/* Request Type */}', customerStart);
assert.ok(customerStart >= 0 && customerEnd > customerStart, 'Customer input is inside Order Form only');
const customer = source.slice(customerStart, customerEnd);

function jsxCallback(text, opening, ending, env, asyncCallback = false) {
  const first = text.indexOf(opening);
  assert.ok(first >= 0, 'Missing event handler: ' + opening);
  const last = text.indexOf(ending, first + opening.length);
  assert.ok(last > first, 'Missing end of handler: ' + opening);
  const expression = text.slice(first + opening.length, last).trim();
  const initializer = 'const { ' + Object.keys(env).join(', ') + ' } = env;';
  return new Function('env', initializer + '\nreturn ' + (asyncCallback ? 'async ' : '') +
    '(event) => {\n' + expression + '\n};')(env);
}

function createState({ pullRef = true, pulling = false } = {}) {
  const state = { errors: [], writes: [], draft: null, active: false, dropdown: null, search: null, selection: false, generation: 0 };
  const refs = {
    manualPullInFlightRef: { current: pullRef },
    customerNameDraftOrderRef: { current: null },
    customerSelectionInFlightRef: { current: false },
    verifiedCustomerSelectionRef: { current: new Map() },
    manuallyUnlinkedCustomerOrderIdsRef: { current: new Set() },
    orderLocalEditGenerationRef: { current: 0 },
  };
  const env = {
    ...refs,
    isPulling: pulling,
    order: { id: 'order-test', customer_name: 'Before' },
    setSaveError: message => state.errors.push(message),
    setCustomerDraftActive: value => { state.active = value; },
    setOrders: value => { state.writes.push(value); },
    setCustomerSearch: value => { state.search = value; },
    setShowCustomerDropdown: value => { state.dropdown = value; },
    shouldUnlinkOrderJobForTypedCustomer: () => { throw Error('Must not evaluate customer unlink during pull'); },
  };
  return { state, refs, env };
}

for (const options of [{ pullRef: true, pulling: false }, { pullRef: false, pulling: true }]) {
  const { state, refs, env } = createState(options);
  const onChange = jsxCallback(customer, 'onChange={(e) => {', '\n                  onBlur={(event) => {', env);
  // The closing JSX braces are included by the slice; strip them before executing.
  assert.ok(typeof onChange === 'function');
  onChange({ target: { value: 'Modified while pulling' } });
  assert.equal(state.writes.length, 0, 'A blocked pull-time change cannot touch displayed Orders');
  assert.equal(state.active, false, 'Pull-time typing cannot introduce a customer draft');
  assert.equal(refs.customerNameDraftOrderRef.current, null);
  assert.equal(refs.orderLocalEditGenerationRef.current, 0);
  assert.match(state.errors.at(-1), /Wait for the Smartsheet pull/);
}
console.log('PASS customer typing during an active or same-tick Smartsheet pull never edits the Order, draft latch, or work-order association');

const focused = createState({ pullRef: true, pulling: false });
const focus = jsxCallback(customer, 'onFocus={(e) => {', '\n                  onClick={(event) => {', focused.env);
focus({ target: { value: 'Before' } });
assert.equal(focused.refs.customerNameDraftOrderRef.current, null);
assert.equal(focused.state.active, false);
assert.equal(focused.state.dropdown, null);
console.log('PASS customer focus during a same-tick pull cannot activate an unsafe draft');

const clicking = createState({ pullRef: true, pulling: false });
const click = jsxCallback(customer, 'onClick={(event) => {', '\n                  onKeyDown={(event) => {', clicking.env);
click({ currentTarget: { value: 'Before' } });
assert.equal(clicking.state.dropdown, null);
console.log('PASS customer input click during pull cannot reopen the active-job picker');

assert.match(customer, /disabled=\{!isRegistered \|\| isPulling\}/);
assert.match(customer, /disabled=\{checkingCustomerJobId !== null \|\| isPulling\}/);
assert.match(customer, /onClick=\{async \(\) => \{\s*if \(manualPullInFlightRef\.current \|\| isPulling \|\| customerSelectionInFlightRef\.current\) return;/);
console.log('PASS customer input and job options are disabled during pull with a second in-handler early guard');
