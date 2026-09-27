import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Isolated checks of the actual SIPS dialog focus effect and close handler.
// No Base44 records, browser session, or production writes are involved.
const page = readFileSync(new URL('../src/pages/SIPs.jsx', import.meta.url), 'utf8');
let passed = 0;

function check(name, fn) {
  fn();
  console.log('PASS ' + name);
  passed++;
}

const focusSource = page.match(
  /useEffect\(\(\) => \{\n    if \(pendingRevisitClear && revisitClearFailure\?\.requiresReview && !isClearingRevisit\) \{[\s\S]*?\n  \}, \[pendingRevisitClear, revisitClearFailure, isClearingRevisit\]\);/
)?.[0];
assert.ok(focusSource, 'Clear Revisit focus effect must remain attached to conflict/save state');

function simulateFocus({ pending = true, conflict = true, saving = false } = {}) {
  let focuses = 0;
  const scope = {
    pendingRevisitClear: pending ? { id: 'synthetic-order' } : null,
    revisitClearFailure: conflict ? { requiresReview: true } : null,
    isClearingRevisit: saving,
    revisitClearCancelRef: { current: { focus() { focuses++; } } },
    useEffect(fn) { fn(); },
  };
  vm.runInNewContext(focusSource, scope);
  return focuses;
}

check('finished conflict focuses Close & review board', () => {
  assert.equal(simulateFocus(), 1);
});
check('in-flight conflict does not focus the disabled cancel button', () => {
  assert.equal(simulateFocus({ saving: true }), 0);
});
check('transient save errors do not force review focus', () => {
  assert.equal(simulateFocus({ conflict: false }), 0);
});
check('closed dialog does not move keyboard focus', () => {
  assert.equal(simulateFocus({ pending: false }), 0);
});

const closeHandler = page.match(
  /onCloseAutoFocus=\{\(event\) => \{([\s\S]*?)\n          \}\}/
)?.[1];
assert.ok(closeHandler, 'Clear Revisit must restore focus when its controlled dialog closes');

check('dismissal prevents missing-trigger focus and returns focus to board heading', () => {
  let prevented = false;
  let focuses = 0;
  const close = vm.runInNewContext('(event) => {' + closeHandler + '}', {
    revisitClearBoardRef: { current: { focus() { focuses++; } } },
  });
  close({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(focuses, 1);
});
check('modal still blocks stale confirmation after a conflict', () => {
  assert.match(page, /disabled=\{isClearingRevisit \|\| revisitClearFailure\?\.requiresReview\}/);
  assert.match(page, /ref=\{revisitClearCancelRef\} disabled=\{isClearingRevisit\}/);
});
check('mobile dialog leaves screen gutters and scrolls long errors', () => {
  assert.match(page, /w-\[calc\(100vw-2rem\)\]/);
  assert.match(page, /max-h-\[calc\(100dvh-2rem\)\] overflow-y-auto/);
  assert.match(page, /<AlertDialogDescription className="break-words">/);
});
check('board heading can receive visible programmatic keyboard focus', () => {
  assert.match(page, /<h1 ref=\{revisitClearBoardRef\} tabIndex=\{-1\}[^>]+focus:outline/);
});

console.log('PASS ' + passed + ' Clear Revisit accessibility checks');
