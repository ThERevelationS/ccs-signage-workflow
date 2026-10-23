// Exercise the production SIPS board progress cache and the checklist dialog's
// memoized dirty-check. No Base44 entities, network requests, or live records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const page = readFileSync(new URL('../src/pages/SIPs.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const dialog = readFileSync(new URL('../src/components/sips/ProductChecklistDialog.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
function test(name, fn) { fn(); console.log('PASS ' + name); passed++; }

// --- Board: getChecklistProgress must be cached per Work Order object ---
const progressStart = page.indexOf('  const getChecklistProgress = (wo) => {');
const progressSource = page.slice(progressStart, page.indexOf('\n  };', progressStart) + 6);

function progressSetup() {
  let lookups = 0;
  const conditions = new Map([['Done', { name: 'Done', is_completed: true }], ['Continued', { name: 'Continued', is_completed: false }]]);
  const ctx = {
    checklistProgressCacheRef: { current: { conditions: null, results: new WeakMap() } },
    WeakMap,
  };
  vm.createContext(ctx);
  vm.runInContext(progressSource + '\nthis.getChecklistProgress = getChecklistProgress;', ctx);
  ctx.dropdownConditionByName = { get: (name) => { lookups += 1; return conditions.get(name); } };
  return { run: ctx.getChecklistProgress, ctx, lookups: () => lookups, conditions };
}

const wo = {
  id: 'w1',
  sip_checklist: [
    { id: 'a', type: 'checklist', approved_by: 'Kim', custom_dropdown_value: 'Done' },
    { id: 'b', type: 'checklist', approved_by: '', custom_dropdown_value: 'Done' },
    { id: 'c', type: 'checklist', approved_by: 'Lee', custom_dropdown_value: 'Gone' },
    { id: 'd', type: 'task', parent_id: 'a', approved_by: '' },
  ],
};

test('progress matches the documented completion semantics', () => {
  const s = progressSetup();
  // 'a' done; 'b' missing approver; 'c' has a status no longer configured = complete.
  assert.equal(JSON.stringify(s.run(wo)), JSON.stringify({ completed: 2, total: 3 }));
});

test('repeat calls for the same Work Order object reuse the cached result', () => {
  const s = progressSetup();
  assert.equal(JSON.stringify(s.run(wo)), JSON.stringify({ completed: 2, total: 3 }));
  const firstLookups = s.lookups();
  assert.ok(firstLookups > 0);
  assert.equal(JSON.stringify(s.run(wo)), JSON.stringify({ completed: 2, total: 3 }));
  assert.equal(s.lookups(), firstLookups, 'a re-render must not rescan the checklist');
});

test('a refreshed Work Order object is recomputed, not served stale data', () => {
  const s = progressSetup();
  s.run(wo);
  const refreshed = { ...wo, sip_checklist: [...wo.sip_checklist, { id: 'e', type: 'checklist', approved_by: 'Kim', custom_dropdown_value: 'Done' }] };
  assert.equal(JSON.stringify(s.run(refreshed)), JSON.stringify({ completed: 3, total: 4 }));
});

test('a changed condition list invalidates cached progress', () => {
  const s = progressSetup();
  s.run(wo);
  let lookups = 0;
  s.ctx.dropdownConditionByName = { get: (name) => { lookups += 1; return s.conditions.get(name); } };
  s.run(wo);
  assert.ok(lookups > 0, 'recomputing after the condition map changed');
});

test('progress never scans the condition list item-by-item', () => {
  assert.doesNotMatch(progressSource, /dropdownConditions\.find\(/);
  assert.match(page, /const dropdownConditionByName = useMemo\(/);
});

// --- Dialog: the snapshot diff must not stringify on every render ---
const memosStart = dialog.indexOf('  const checklistDirtyFromSnapshot = useMemo(');
const memosEnd = dialog.indexOf('  // Checklist rows and product groups are expanded by default.', memosStart);
const flagStart = dialog.indexOf('  const hasUnsavedChecklistChanges');
const flagEnd = dialog.indexOf('  const hasPendingRevisitChoice', flagStart);
const dirtySource = (dialog.slice(memosStart, memosEnd) + dialog.slice(flagStart, flagEnd))
  .replace(/\bconst /g, 'var ');

function dirtySetup() {
  const computes = { checklist: 0, products: 0 };
  const slots = [];
  let cursor = 0;
  // React-slot emulation: useMemo calls happen in a fixed order per render;
  // a callback only reruns when one of its deps changed identity.
  const useMemo = (fn, deps) => {
    const i = cursor++;
    const slot = slots[i] || (slots[i] = { deps: null, value: undefined });
    if (!slot.deps || deps.some((d, j) => !Object.is(d, slot.deps[j]))) {
      slot.value = fn();
      slot.deps = deps;
      computes[['checklist', 'products'][i]]++;
    }
    return slot.value;
  };
  const ctx = {
    checklist: [{ id: 'a' }], loadedUiChecklistSnapshot: [{ id: 'a' }],
    products: [], loadedUiProductsSnapshot: [],
    isLoading: false, hasUnsubmittedDrafts: false,
    JSON, useMemo,
  };
  vm.createContext(ctx);
  return {
    ctx, computes,
    render: () => { cursor = 0; vm.runInContext(dirtySource, ctx); },
  };
}

test('the dirty check recomputes only when checklist or products change', () => {
  const s = dirtySetup();
  s.render();
  assert.equal(s.ctx.hasUnsavedChecklistChanges, false);
  assert.equal(s.computes.checklist, 1);
  assert.equal(s.computes.products, 1);

  // A re-render with the same arrays must not reserialize them.
  s.render();
  assert.equal(s.computes.checklist, 1, 'checklist diff memoized across renders');
  assert.equal(s.computes.products, 1, 'products diff memoized across renders');
  assert.equal(s.ctx.hasUnsavedChecklistChanges, false);

  // A changed checklist recomputes exactly once more and flags the dirty state.
  s.ctx.checklist = [{ id: 'a' }, { id: 'b' }];
  s.render();
  assert.equal(s.computes.checklist, 2, 'changed checklist recomputes its diff');
  assert.equal(s.computes.products, 1, 'unchanged products stays memoized');
  assert.equal(s.ctx.hasUnsavedChecklistChanges, true);

  // Reloading the saved snapshot clears the dirty flag again.
  s.ctx.loadedUiChecklistSnapshot = s.ctx.checklist;
  s.render();
  assert.equal(s.ctx.hasUnsavedChecklistChanges, false);
});

test('raw stringification only happens inside the memoized diff', () => {
  const withoutMemos = dirtySource.replace(/useMemo\(\s*\(\) => [^,]+,\s*\[[^\]]+\]\s*\)/g, '');
  assert.doesNotMatch(withoutMemos, /JSON\.stringify/);
});

console.log(passed + '/' + passed + ' SIPS render-performance checks passed');
