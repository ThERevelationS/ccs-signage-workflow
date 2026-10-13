import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual SIPS board load, quick edit, save wrapper and shared
// conditional persistence with deferred synthetic reads. No app API calls.
const board = readFileSync(new URL('../src/pages/SIPs.jsx', import.meta.url), 'utf8');
const persistence = readFileSync(new URL('../src/components/workflow/workOrderPersistence.js', import.meta.url), 'utf8');
const trackedPersistence = readFileSync(new URL('../src/components/shared/trackedFieldPersistence.js', import.meta.url), 'utf8');
function block(source, begin, end) {
  const start = source.indexOf(begin);
  const stop = source.indexOf(end, start);
  assert.ok(start >= 0 && stop > start, 'Expected source block: ' + begin);
  return source.slice(start, stop);
}
const source = [
  block(board, 'const parseLocalDate = ', '\n};') + '\n};',
  block(board, '  const saveBoardFields = async (options) => {', '\n  // Set document title'),
  block(board, '  const loadWorkOrders = async (showLoading = true, { clearQuickEditErrorOnSuccess = false } = {}) => {', '\n  const updateWorkOrder'),
  block(board, '  const updateWorkOrder = async (orderId, field, value) => {', '\n  // Check if a work order is a WIP item'),
  block(board, '  const isRevisitFuture = (wo) => {', '\n  // Completion must'),
  block(board, '  const toggleSipCompleted = async (wo) => {', '\n  const requestClearRevisit'),
  block(board, '  const requestClearRevisit = (wo) => {', '\n  // All non-completed active items'),
  trackedPersistence.slice(trackedPersistence.indexOf('export async function saveTrackedFields(')).replace(/^export /, ''),
  block(persistence, 'export async function replaceWorkOrderFieldsIfUnchanged(', '\nexport async function transitionWorkOrderFromLoadedSnapshot').replace(/^export /, ''),
  'this.actions = { loadWorkOrders, refreshBoardWhenIdle, updateWorkOrder, isRevisitFuture, toggleSipCompleted, requestClearRevisit, confirmClearRevisit };',
].join('\n');

const dateOnly = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const yesterday = dateOnly(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
const tomorrow = dateOnly(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
const later = dateOnly(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
function fixture(date = yesterday, { completed = false } = {}) {
  const record = {
    id: 'synthetic-only', updated_date: '1', sip_revisit_date: date,
    sip_completed: completed, deleted: false, is_rider: false, completed: false,
    current_task_assigned_to: 'SIPs', created_date: '2025-01-01',
    notes: 'starting note',
  };
  const reads = [];
  let holdNextGet = null;
  let holdNextSavedRead = null;
  let writes = 0;
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const functions = {
    invoke: async (name, args) => {
      assert.equal(name, 'fieldHistoryAction');
      assert.equal(args.action, 'save');
      if (holdNextGet) {
        const held = holdNextGet;
        holdNextGet = null;
        await held.promise;
      }
      const loaded = structuredClone(record);
      if (loaded.deleted === true) {
        return { data: { success: false, error: 'This record is in Trash. Restore it first.' } };
      }
      for (const [field, nextValue] of Object.entries(args.next_fields || {})) {
        const expected = args.expected_fields?.[field] ?? null;
        if (!same(loaded[field], expected) && !same(loaded[field], nextValue)) {
          return { data: { success: false, error: `This field changed in another session: ${field}. Reload before saving.` } };
        }
      }
      if (!Object.entries(args.next_fields || {}).every(([field, value]) => same(loaded[field], value))) {
        Object.assign(record, structuredClone(args.next_fields || {}));
        record.updated_date = String(Number(record.updated_date) + 1);
        writes++;
      }
      let saved = structuredClone(record);
      if (holdNextSavedRead && writes > 0) {
        const held = holdNextSavedRead;
        holdNextSavedRead = null;
        held.captured.resolve(saved);
        await held.release.promise;
      }
      return { data: { success: true, record: saved } };
    },
  };
  const entity = {};
  const globalSettings = {};
  const authorizedEmail = {};
  const ctx = {
    base44: { functions, entities: { WorkOrder: entity, GlobalSettings: globalSettings } },
    localStorage: { getItem: () => '' },
    WorkOrder: entity,
    AuthorizedEmail: authorizedEmail,
    boardLoadSequenceRef: { current: 0 },
    boardLoadsInFlightRef: { current: 0 },
    boardSaveEpochRef: { current: 0 },
    boardSavesPendingRef: { current: 0 },
    boardRefreshDeferredRef: { current: false },
    quickEditsInFlightRef: { current: new Map() },
    savingRevisitIds: new Set(),
    savingQuickEditKeys: new Set(),
    reopeningWipIds: new Set(),
    reopenedFocusWorkOrderId: null,
    reopeningWipInFlightRef: { current: new Set() },
    today,
    workOrders: [structuredClone(record)],
    users: [],
    boardError: '',
    quickEditError: '',
    isRefreshing: false,
    isLoading: false,
    pendingRevisitClear: null,
    revisitClearFailure: null,
    isClearingRevisit: false,
    console: { error() {} },
    Date,
  };
  ctx.checklistOpened = 0;
  ctx.openChecklist = () => { ctx.checklistOpened++; };
  ctx.setOpenDatePopover = () => {};
  ctx.setPendingRevisitClear = (value) => { ctx.pendingRevisitClear = value; };
  ctx.setRevisitClearFailure = (value) => { ctx.revisitClearFailure = value; };
  ctx.setIsClearingRevisit = (value) => { ctx.isClearingRevisit = value; };
  ctx.setSavingRevisitIds = (updater) => {
    ctx.savingRevisitIds = typeof updater === 'function' ? updater(ctx.savingRevisitIds) : updater;
  };
  ctx.setSavingQuickEditKeys = (updater) => {
    ctx.savingQuickEditKeys = typeof updater === 'function' ? updater(ctx.savingQuickEditKeys) : updater;
  };
  ctx.setReopeningWipIds = (updater) => {
    ctx.reopeningWipIds = typeof updater === 'function' ? updater(ctx.reopeningWipIds) : updater;
  };
  ctx.setReopenedFocusWorkOrderId = (value) => { ctx.reopenedFocusWorkOrderId = value; };
  ctx.loadAllEntityRows = ({ entity: requested }) => {
    if (requested === authorizedEmail) return Promise.resolve([]);
    assert.equal(requested, entity);
    const waiting = deferred();
    const snapshot = [structuredClone(record)];
    reads.push({ ...waiting, snapshot, finish: (rows = snapshot) => waiting.resolve(rows) });
    return waiting.promise;
  };
  ctx.loadSingleGlobalSetting = async ({ settingKey }) =>
    ({ setting_value: { items: settingKey === 'salesTaskDescriptions'
      ? [{ text: 'SIPs stage', page: 'SIPs' }] : [] } });
  for (const prop of [
    'IsRefreshing', 'IsLoading', 'BoardError', 'QuickEditError',
    'ChecklistConfigWarning', 'WipTaskDescriptions', 'DropdownConditions',
    'Users', 'LastUpdated',
  ]) {
    const key = prop[0].toLowerCase() + prop.slice(1);
    ctx['set' + prop] = (value) => { ctx[key] = value; };
  }
  ctx.setWorkOrders = (updater) => {
    ctx.workOrders = typeof updater === 'function' ? updater(ctx.workOrders) : updater;
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return {
    ctx, record, reads, ...ctx.actions,
    get writes() { return writes; },
    holdGet: () => {
      const waiting = deferred();
      holdNextGet = waiting;
      return waiting.resolve;
    },
    holdSavedRead: () => {
      const captured = deferred();
      const release = deferred();
      holdNextSavedRead = { captured, release };
      return { captured: captured.promise, release: release.resolve };
    },
    externalUpdate(fields) {
      Object.assign(record, fields);
      record.updated_date = String(Number(record.updated_date) + 1);
    },
    queue() {
      return ctx.actions.isRevisitFuture(ctx.workOrders[0]) ? 'Revisit Later' : 'Active';
    },
  };
}

let passed = 0;
async function check(label, run) {
  await run();
  console.log('PASS ' + label);
  passed++;
}

await check('newer board refresh wins even if older request finishes last', async () => {
  const h = fixture();
  const first = h.loadWorkOrders(false);
  const second = h.loadWorkOrders(false);
  assert.equal(h.reads.length, 2);
  h.reads[1].finish([{ ...h.record, sip_revisit_date: tomorrow }]);
  await second;
  assert.equal(h.queue(), 'Revisit Later');
  h.reads[0].finish();
  await first;
  assert.equal(h.queue(), 'Revisit Later');
  assert.equal(h.ctx.boardLoadSequenceRef.current, 2);
});

await check('rapid manual Refresh/Retry taps issue one fetch and unlock on completion', async () => {
  const h = fixture();
  const first = h.refreshBoardWhenIdle();
  assert.equal(h.ctx.boardLoadsInFlightRef.current, 1);
  assert.equal(h.ctx.isRefreshing, true);
  const duplicate = h.refreshBoardWhenIdle();
  assert.equal(duplicate, undefined);
  assert.equal(h.reads.length, 1, 'Only one read started before React re-render');
  h.reads[0].finish();
  await first;
  assert.equal(h.ctx.boardLoadsInFlightRef.current, 0);
  assert.equal(h.ctx.isRefreshing, false);
  const retry = h.refreshBoardWhenIdle();
  assert.equal(h.reads.length, 2, 'After completion a new fetch can start');
  h.reads[1].finish();
  await retry;
});

await check('failed manual refresh releases synchronous lock and retains error until retry', async () => {
  const h = fixture();
  const first = h.refreshBoardWhenIdle();
  h.reads[0].reject(new Error('Synthetic offline'));
  await first;
  assert.equal(h.ctx.boardLoadsInFlightRef.current, 0);
  assert.match(h.ctx.boardError, /Synthetic offline/);
  const retry = h.refreshBoardWhenIdle();
  assert.match(h.ctx.boardError, /Synthetic offline/);
  h.reads[1].finish();
  await retry;
  assert.equal(h.ctx.boardError, '');
  assert.equal(h.ctx.boardLoadsInFlightRef.current, 0);
});

await check('60-second refresh skips pending save and in-flight board fetch', async () => {
  const h = fixture();
  const timer = board.match(/const interval = setInterval\(\(\) => \{([\s\S]*?)\}, 60000\);/);
  assert.ok(timer, 'Actual board interval exists');
  const tick = vm.runInNewContext('() => {' + timer[1] + '}', {
    boardSavesPendingRef: h.ctx.boardSavesPendingRef,
    refreshBoardWhenIdle: h.refreshBoardWhenIdle,
  });
  const release = h.holdGet();
  const saving = h.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  tick();
  tick();
  assert.equal(h.reads.length, 0, 'Timer does not fetch while a save is pending');
  release();
  await saving;
  tick();
  assert.equal(h.reads.length, 1);
  tick();
  assert.equal(h.reads.length, 1, 'Timer cannot overlap itself');
  h.reads[0].finish();
  for (let i = 0; i < 10 && h.ctx.boardLoadsInFlightRef.current !== 0; i++) await Promise.resolve();
  assert.equal(h.ctx.boardLoadsInFlightRef.current, 0);
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, tomorrow);
});

await check('mandatory recovery refresh can supersede a pending routine refresh', async () => {
  const h = fixture();
  const routine = h.refreshBoardWhenIdle();
  const recovery = h.loadWorkOrders(false);
  assert.equal(h.reads.length, 2, 'Save/conflict recovery does not use routine refresh guard');
  assert.equal(h.ctx.boardLoadsInFlightRef.current, 2);
  h.reads[1].finish([{ ...h.record, sip_revisit_date: tomorrow }]);
  await recovery;
  h.reads[0].finish();
  await routine;
  assert.equal(h.ctx.boardLoadsInFlightRef.current, 0);
  assert.equal(h.queue(), 'Revisit Later', 'Older fetch cannot overwrite recovery');
});

await check('refresh finishing during pending quick edit cannot undo optimistic queue', async () => {
  const h = fixture();
  const releaseGet = h.holdGet();
  const saving = h.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  assert.equal(h.ctx.boardSavesPendingRef.current, 1);
  assert.equal(h.queue(), 'Revisit Later');
  const refreshing = h.loadWorkOrders(false);
  h.reads[0].finish();
  await refreshing;
  assert.equal(h.queue(), 'Revisit Later');
  releaseGet();
  await saving;
  assert.equal(h.reads.length, 2, 'The discarded refresh automatically retries after saving');
  assert.equal(h.reads[1].snapshot[0].sip_revisit_date, tomorrow);
  h.reads[1].finish();
  for (let i = 0; i < 10 && !h.ctx.lastUpdated; i++) await Promise.resolve();
  assert.ok(h.ctx.lastUpdated, 'Fresh board data was applied');
  assert.equal(h.record.sip_revisit_date, tomorrow);
  assert.equal(h.ctx.boardSavesPendingRef.current, 0);
  assert.equal(h.writes, 1);
});

await check('refresh begun before save cannot replace persisted result after save finishes', async () => {
  const h = fixture();
  const older = h.loadWorkOrders(false);
  await h.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  assert.equal(h.record.sip_revisit_date, tomorrow);
  h.reads[0].finish();
  await older;
  assert.equal(h.reads.length, 2, 'The stale refresh automatically retries after the save');
  h.reads[1].finish();
  for (let i = 0; i < 10 && !h.ctx.lastUpdated; i++) await Promise.resolve();
  assert.ok(h.ctx.lastUpdated, 'Fresh board data was applied');
  assert.equal(h.queue(), 'Revisit Later');
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, tomorrow);
  assert.equal(h.writes, 1);
});

await check('fresh refresh after local save still accepts newer server changes', async () => {
  const h = fixture();
  await h.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  h.externalUpdate({ notes: 'other session note', sip_revisit_date: later });
  const current = h.loadWorkOrders(false);
  h.reads[0].finish();
  await current;
  assert.equal(h.ctx.workOrders[0].notes, 'other session note');
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, later);
  assert.equal(h.queue(), 'Revisit Later');
});

await check('stale refresh failure does not replace newer successful board state', async () => {
  const h = fixture();
  const older = h.loadWorkOrders(false);
  const newer = h.loadWorkOrders(false);
  h.reads[1].finish([{ ...h.record, sip_revisit_date: tomorrow }]);
  await newer;
  h.reads[0].reject(new Error('older request failed'));
  await older;
  assert.equal(h.ctx.boardError, '');
  assert.equal(h.queue(), 'Revisit Later');
});

await check('failed Retry preserves board and checklist warnings until a current refresh succeeds', async () => {
  const h = fixture();
  h.ctx.boardError = 'Earlier network failure';
  h.ctx.checklistConfigWarning = 'Earlier checklist rules failure';
  const failed = h.loadWorkOrders(false);
  assert.equal(h.ctx.isRefreshing, true);
  assert.equal(h.ctx.boardError, 'Earlier network failure', 'Retry does not prematurely hide failure');
  assert.equal(h.ctx.checklistConfigWarning, 'Earlier checklist rules failure');
  h.reads[0].reject(new Error('Retry still offline'));
  await failed;
  assert.equal(h.ctx.boardError, 'Retry still offline');
  assert.equal(h.ctx.checklistConfigWarning, 'Earlier checklist rules failure');
  assert.equal(h.ctx.isRefreshing, false);

  const recovered = h.loadWorkOrders(false);
  assert.equal(h.ctx.boardError, 'Retry still offline', 'Retry keeps last error until verified');
  assert.equal(h.ctx.checklistConfigWarning, 'Earlier checklist rules failure');
  h.reads[1].finish();
  await recovered;
  assert.equal(h.ctx.boardError, '');
  assert.equal(h.ctx.checklistConfigWarning, '');
  assert.equal(h.ctx.isRefreshing, false);
});

await check('checklist rules warning survives a failed retry, then resolves on successful rules load', async () => {
  const h = fixture();
  const originalSettings = h.ctx.loadSingleGlobalSetting;
  h.ctx.loadSingleGlobalSetting = async (options) => {
    if (options.settingKey === 'dropdownConditions') throw new Error('Synthetic rules offline');
    return originalSettings(options);
  };
  const first = h.loadWorkOrders(false);
  h.reads[0].finish();
  await first;
  assert.match(h.ctx.checklistConfigWarning, /could not refresh/);
  assert.equal(h.ctx.boardError, '', 'Work Orders themselves loaded successfully');
  const lastWarning = h.ctx.checklistConfigWarning;

  const second = h.loadWorkOrders(false);
  assert.equal(h.ctx.checklistConfigWarning, lastWarning, 'Warning persists while retry is in flight');
  h.reads[1].finish();
  await second;
  assert.equal(h.ctx.checklistConfigWarning, lastWarning, 'Repeated rules failure remains visible');

  h.ctx.loadSingleGlobalSetting = originalSettings;
  const third = h.loadWorkOrders(false);
  assert.equal(h.ctx.checklistConfigWarning, lastWarning);
  h.reads[2].finish();
  await third;
  assert.equal(h.ctx.checklistConfigWarning, '', 'Verified rules recovery clears warning');
});

await check('Reload latest retains a quick-edit conflict until successful current data arrives', async () => {
  const h = fixture();
  h.ctx.quickEditError = 'A second session changed this Work Order';
  const failed = h.loadWorkOrders(false, { clearQuickEditErrorOnSuccess: true });
  assert.match(h.ctx.quickEditError, /second session/, 'Clicking reload leaves conflict visible');
  h.reads[0].reject(new Error('Still offline'));
  await failed;
  assert.match(h.ctx.quickEditError, /second session/, 'Failed reload cannot dismiss conflict');
  assert.match(h.ctx.boardError, /Still offline/);

  const recovered = h.loadWorkOrders(false, { clearQuickEditErrorOnSuccess: true });
  assert.match(h.ctx.quickEditError, /second session/);
  h.reads[1].finish();
  await recovered;
  assert.equal(h.ctx.quickEditError, '');
  assert.equal(h.ctx.boardError, '');
  assert.ok(board.includes('onClick={() => refreshBoardWhenIdle({ clearQuickEditErrorOnSuccess: true })}'),
    'Reload latest action requests clear only on confirmed success');
});

await check('superseded Reload latest cannot dismiss a conflict after unrelated refresh wins', async () => {
  const h = fixture();
  h.ctx.quickEditError = 'Old conflict needs review';
  const oldReload = h.loadWorkOrders(false, { clearQuickEditErrorOnSuccess: true });
  const newerRefresh = h.loadWorkOrders(false);
  h.reads[1].finish();
  await newerRefresh;
  h.reads[0].finish();
  await oldReload;
  assert.match(h.ctx.quickEditError, /needs review/);
});

await check('conflicted quick edit releases save lock and refreshes latest state', async () => {
  const h = fixture();
  h.externalUpdate({ sip_revisit_date: later });
  const edit = h.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  for (let i = 0; i < 15 && h.reads.length === 0; i++) await Promise.resolve();
  assert.equal(h.reads.length, 1, 'Failed save requests latest board refresh');
  h.reads[0].finish();
  await edit;
  assert.equal(h.ctx.boardSavesPendingRef.current, 0);
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, later);
  assert.match(h.ctx.quickEditError, /changed in another session/);
  assert.equal(h.writes, 0);
});


await check('background refresh cannot resurrect completed WIP after reopen', async () => {
  const h = fixture(tomorrow, { completed: true });
  const stale = h.loadWorkOrders(false);
  assert.equal(h.reads.length, 1);
  await h.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.record.sip_completed, false);
  assert.equal(h.record.sip_revisit_date, '');
  h.reads[0].finish();
  await stale;
  assert.equal(h.ctx.workOrders[0].sip_completed, false);
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, '');
  assert.equal(h.queue(), 'Active');
  assert.equal(h.writes, 1);
});

await check('background refresh cannot restore Revisit after confirmed clear', async () => {
  const h = fixture(tomorrow);
  h.requestClearRevisit(h.ctx.workOrders[0]);
  const stale = h.loadWorkOrders(false);
  assert.equal(h.reads.length, 1);
  await h.confirmClearRevisit();
  assert.equal(h.record.sip_revisit_date, '');
  h.reads[0].finish();
  await stale;
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, '');
  assert.equal(h.queue(), 'Active');
  assert.equal(h.writes, 1);
});

await check('out-of-order quick-edit save responses preserve both local fields', async () => {
  const h = fixture(yesterday);
  const held = h.holdSavedRead();
  const dateSave = h.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  const olderSnapshot = await held.captured;
  assert.equal(olderSnapshot.notes, 'starting note');
  await h.updateWorkOrder(h.record.id, 'notes', 'newer note');
  assert.equal(h.ctx.workOrders[0].notes, 'newer note');
  held.release();
  await dateSave;
  assert.equal(h.record.notes, 'newer note');
  assert.equal(h.ctx.workOrders[0].notes, 'newer note');
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, tomorrow);
  assert.equal(h.ctx.workOrders[0].updated_date, h.record.updated_date);
});

await check('late WIP reopen response does not undo concurrent saved note', async () => {
  const h = fixture(tomorrow, { completed: true });
  const held = h.holdSavedRead();
  const reopening = h.toggleSipCompleted(h.ctx.workOrders[0]);
  await held.captured;
  await h.updateWorkOrder(h.record.id, 'notes', 'newer WIP note');
  held.release();
  await reopening;
  assert.equal(h.record.sip_completed, false);
  assert.equal(h.ctx.workOrders[0].sip_completed, false);
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, '');
  assert.equal(h.ctx.workOrders[0].notes, 'newer WIP note');
  assert.equal(h.ctx.workOrders[0].updated_date, h.record.updated_date);
});

await check('late confirmed clear response does not undo concurrent saved note', async () => {
  const h = fixture(tomorrow);
  h.requestClearRevisit(h.ctx.workOrders[0]);
  const held = h.holdSavedRead();
  const clearing = h.confirmClearRevisit();
  await held.captured;
  await h.updateWorkOrder(h.record.id, 'notes', 'newer clear note');
  held.release();
  await clearing;
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, '');
  assert.equal(h.ctx.workOrders[0].notes, 'newer clear note');
  assert.equal(h.ctx.workOrders[0].updated_date, h.record.updated_date);
});

await check('conflict refresh is deferred until another field finishes saving', async () => {
  const h = fixture(yesterday);
  h.externalUpdate({ sip_revisit_date: later });
  const releaseNoteRead = h.holdGet();
  const noteSave = h.updateWorkOrder(h.record.id, 'notes', 'local note');
  const dateSave = h.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  for (let i = 0; i < 25 && h.reads.length === 0; i++) await Promise.resolve();
  assert.equal(h.reads.length, 1, 'Conflicted date asks to reload while note save is pending');
  h.reads[0].finish();
  await dateSave;
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, tomorrow, 'Optimistic date remains until safe reload');
  releaseNoteRead();
  await noteSave;
  assert.equal(h.reads.length, 2, 'Latest board reload starts once the other save finishes');
  h.reads[1].finish();
  for (let i = 0; i < 10 && h.ctx.workOrders[0].sip_revisit_date !== later; i++) await Promise.resolve();
  assert.equal(h.record.sip_revisit_date, later);
  assert.equal(h.record.notes, 'local note');
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, later, 'Failed date edit is corrected without waiting 60 seconds');
  assert.equal(h.ctx.workOrders[0].notes, 'local note');
  assert.match(h.ctx.quickEditError, /changed in another session/);
});


await check('non-Revisit quick edit locks only its own field and releases after saving', async () => {
  const h = fixture(yesterday);
  const releaseGet = h.holdGet();
  const first = h.updateWorkOrder(h.record.id, 'designer', 'Designer A');
  const designerKey = JSON.stringify([h.record.id, 'designer']);
  const estimatorKey = JSON.stringify([h.record.id, 'estimator']);
  assert.equal(h.ctx.savingQuickEditKeys.has(designerKey), true);
  assert.equal(h.ctx.savingQuickEditKeys.has(estimatorKey), false);
  assert.equal(h.ctx.savingRevisitIds.size, 0);
  assert.equal(h.ctx.workOrders[0].designer, 'Designer A');

  await h.updateWorkOrder(h.record.id, 'designer', 'Designer B');
  assert.match(h.ctx.quickEditError, /still saving/);
  assert.equal(h.ctx.savingQuickEditKeys.size, 1, 'Repeated selection creates no second save');

  await h.updateWorkOrder(h.record.id, 'estimator', 'Estimator A');
  assert.equal(h.record.estimator, 'Estimator A', 'Independent field remains editable');
  assert.equal(h.ctx.savingQuickEditKeys.has(estimatorKey), false);
  assert.equal(h.ctx.savingQuickEditKeys.has(designerKey), true);

  releaseGet();
  await first;
  assert.equal(h.ctx.savingQuickEditKeys.size, 0);
  assert.equal(h.ctx.quickEditsInFlightRef.current.size, 0);
  assert.equal(h.record.designer, 'Designer A');
  assert.equal(h.record.estimator, 'Estimator A');
  assert.equal(h.writes, 2);
});

await check('conflicted non-Revisit edit remains busy through reload, then unlocks', async () => {
  const h = fixture(yesterday);
  h.externalUpdate({ site_survey_date: '2099-11-03' });
  const busyKey = JSON.stringify([h.record.id, 'site_survey_date']);
  const saving = h.updateWorkOrder(h.record.id, 'site_survey_date', '2099-11-04');
  assert.equal(h.ctx.savingQuickEditKeys.has(busyKey), true);
  for (let i = 0; i < 25 && h.reads.length === 0; i++) await Promise.resolve();
  assert.equal(h.reads.length, 1, 'Conflict requests a fresh board');
  assert.equal(h.ctx.savingQuickEditKeys.has(busyKey), true, 'Date stays locked during refresh');
  h.reads[0].finish();
  await saving;
  assert.equal(h.ctx.savingQuickEditKeys.size, 0);
  assert.equal(h.ctx.quickEditsInFlightRef.current.size, 0);
  assert.equal(h.ctx.workOrders[0].site_survey_date, '2099-11-03');
  assert.match(h.ctx.quickEditError, /changed in another session/);
  assert.equal(h.writes, 0);
});

await check('all six desktop non-Revisit quick editors expose per-field busy UI', async () => {
  for (const field of ['current_task_assigned_to', 'designer', 'project_manager', 'estimator']) {
    const start = board.indexOf(`onValueChange={(val) => updateWorkOrder(wo.id, "${field}", val)}`);
    assert.ok(start > 0, `${field} selection handler exists`);
    const editor = board.slice(start, start + 650);
    assert.ok(editor.includes(`disabled={!isRegistered || isQuickEditSaving(wo.id, "${field}")}`),
      `${field} is disabled while saving`);
    assert.ok(editor.includes(`aria-busy={isQuickEditSaving(wo.id, "${field}")}`),
      `${field} reports busy state`);
    assert.ok(editor.includes('animate-spin'), `${field} displays visible saving feedback`);
  }
  for (const field of ['current_task_deadline', 'site_survey_date']) {
    const start = board.indexOf(`selected={parseLocalDate(wo.${field})}`);
    assert.ok(start > 0, `${field} calendar exists`);
    const calendar = board.slice(start, start + 380);
    assert.ok(calendar.includes(`disabled={isQuickEditSaving(wo.id, "${field}")}`),
      `${field} calendar cannot select dates while saving`);
    assert.ok(calendar.includes(`if (isQuickEditSaving(wo.id, "${field}")) return;`),
      `${field} handler also rejects busy selection`);
    const triggerStart = board.lastIndexOf('<PopoverTrigger asChild', start);
    assert.ok(triggerStart > 0, `${field} trigger exists`);
    const trigger = board.slice(triggerStart, start);
    assert.ok(trigger.includes(`aria-busy={isQuickEditSaving(wo.id, "${field}")}`),
      `${field} trigger reports busy state`);
    assert.ok(trigger.includes('Saving…'), `${field} shows saving text`);
  }
});

await check('Revisit quick edit shows pending state until save completes', async () => {
  const h = fixture(yesterday);
  const releaseGet = h.holdGet();
  const saving = h.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  assert.equal(h.ctx.savingRevisitIds.has(h.record.id), true);
  assert.equal(h.ctx.quickEditsInFlightRef.current.size, 1);
  assert.equal(h.queue(), 'Revisit Later');
  releaseGet();
  await saving;
  assert.equal(h.ctx.savingRevisitIds.has(h.record.id), false);
  assert.equal(h.ctx.quickEditsInFlightRef.current.size, 0);
  assert.equal(h.record.sip_revisit_date, tomorrow);
  assert.equal(h.writes, 1);
});

await check('duplicate Revisit selections keep one pending save without duplicate writes', async () => {
  const h = fixture(yesterday);
  const releaseGet = h.holdGet();
  const saving = h.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  await h.updateWorkOrder(h.record.id, 'sip_revisit_date', later);
  assert.equal(h.ctx.savingRevisitIds.has(h.record.id), true);
  assert.match(h.ctx.quickEditError, /still saving/);
  assert.equal(h.queue(), 'Revisit Later');
  releaseGet();
  await saving;
  assert.equal(h.ctx.savingRevisitIds.size, 0);
  assert.equal(h.record.sip_revisit_date, tomorrow);
  assert.equal(h.writes, 1);
});

await check('failed Revisit save stays pending through latest-data reload, then clears state', async () => {
  const h = fixture(yesterday);
  h.externalUpdate({ sip_revisit_date: later });
  const failed = h.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  for (let i = 0; i < 25 && h.reads.length === 0; i++) await Promise.resolve();
  assert.equal(h.reads.length, 1, 'Conflict starts latest-data reload');
  assert.equal(h.ctx.savingRevisitIds.has(h.record.id), true);
  h.reads[0].finish();
  await failed;
  assert.equal(h.ctx.savingRevisitIds.size, 0);
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, later);
  assert.match(h.ctx.quickEditError, /changed in another session/);
  assert.equal(h.writes, 0);
});

await check('a different field remains editable while Revisit shows pending', async () => {
  const h = fixture(yesterday);
  const releaseGet = h.holdGet();
  const saving = h.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  await h.updateWorkOrder(h.record.id, 'notes', 'independent edit');
  assert.equal(h.record.notes, 'independent edit');
  assert.equal(h.ctx.savingRevisitIds.has(h.record.id), true);
  assert.equal(h.ctx.savingRevisitIds.size, 1);
  releaseGet();
  await saving;
  assert.equal(h.ctx.savingRevisitIds.size, 0);
  assert.equal(h.record.sip_revisit_date, tomorrow);
  assert.equal(h.record.notes, 'independent edit');
  assert.equal(h.writes, 2);
});


await check('rapid same-session completed WIP reopening has one pending write', async () => {
  const h = fixture(tomorrow, { completed: true });
  const releaseGet = h.holdGet();
  const first = h.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.ctx.reopeningWipIds.has(h.record.id), true);
  assert.equal(h.ctx.reopeningWipInFlightRef.current.has(h.record.id), true);
  await h.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.ctx.boardSavesPendingRef.current, 1, 'Duplicate reopening did not launch a second request');
  releaseGet();
  await first;
  assert.equal(h.record.sip_completed, false);
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.writes, 1);
  assert.equal(h.ctx.reopeningWipIds.size, 0);
  assert.equal(h.ctx.reopeningWipInFlightRef.current.size, 0);
});

await check('conflicted WIP reopening stays busy through reload and then allows retry', async () => {
  const h = fixture(tomorrow, { completed: true });
  h.externalUpdate({ sip_revisit_date: later });
  const reopening = h.toggleSipCompleted(h.ctx.workOrders[0]);
  for (let i = 0; i < 25 && h.reads.length === 0; i++) await Promise.resolve();
  assert.equal(h.reads.length, 1, 'Conflicted reopening reloads the current board');
  assert.equal(h.ctx.reopeningWipIds.has(h.record.id), true);
  assert.equal(h.ctx.reopeningWipInFlightRef.current.has(h.record.id), true);
  h.reads[0].finish();
  await reopening;
  assert.equal(h.record.sip_completed, true);
  assert.equal(h.record.sip_revisit_date, later);
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, later);
  assert.equal(h.writes, 0);
  assert.match(h.ctx.quickEditError, /changed in another session/);
  assert.equal(h.ctx.reopeningWipIds.size, 0);
  assert.equal(h.ctx.reopeningWipInFlightRef.current.size, 0);
  await h.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.record.sip_completed, false);
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.writes, 1);
});

await check('other fields remain editable while completed WIP is reopening', async () => {
  const h = fixture(tomorrow, { completed: true });
  const releaseGet = h.holdGet();
  const reopening = h.toggleSipCompleted(h.ctx.workOrders[0]);
  await h.updateWorkOrder(h.record.id, 'notes', 'saved during reopening');
  assert.equal(h.record.notes, 'saved during reopening');
  assert.equal(h.ctx.reopeningWipIds.has(h.record.id), true);
  releaseGet();
  await reopening;
  assert.equal(h.record.notes, 'saved during reopening');
  assert.equal(h.record.sip_completed, false);
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.ctx.workOrders[0].notes, 'saved during reopening');
  assert.equal(h.ctx.reopeningWipIds.size, 0);
  assert.equal(h.writes, 2);
});

await check('incomplete WIP opens checklist without starting reopening save', async () => {
  const h = fixture(yesterday);
  await h.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.ctx.checklistOpened, 1);
  assert.equal(h.ctx.reopeningWipIds.size, 0);
  assert.equal(h.ctx.reopeningWipInFlightRef.current.size, 0);
  assert.equal(h.writes, 0);
});

await check('mobile completed WIP Reopen shows busy state and blocks repeat taps', async () => {
  const anchor = board.indexOf('className="min-h-11 px-2.5 shrink-0 text-xs bg-white border-green-200');
  assert.ok(anchor > 0, 'Mobile completed WIP Reopen button exists');
  const markup = board.slice(anchor - 260, anchor + 650);
  assert.match(markup, /disabled=\{!isRegistered \|\| reopeningWipIds\.has\(wo\.id\) \|\| savingRevisitIds\.has\(wo\.id\)\}/);
  assert.match(markup, /aria-busy=\{reopeningWipIds\.has\(wo\.id\)\}/);
  assert.match(markup, /Reopening…/);
  assert.match(markup, /aria-label=/);
});

await check('desktop completed WIP checkbox disables and announces pending reopen', async () => {
  const anchor = board.indexOf('checked={true}\n                        onCheckedChange={() => toggleSipCompleted(wo)}');
  assert.ok(anchor > 0, 'Completed WIP desktop reopening checkbox exists');
  const markup = board.slice(anchor, anchor + 670);
  assert.match(markup, /disabled=\{!isRegistered \|\| reopeningWipIds\.has\(wo\.id\) \|\| savingRevisitIds\.has\(wo\.id\)\}/);
  assert.match(markup, /aria-busy=\{reopeningWipIds\.has\(wo\.id\)\}/);
  assert.match(markup, /aria-label=/);
  assert.match(markup, /Loader2/);
});


await check('Revisit change cannot race a pending completed-WIP reopen on the same job', async () => {
  const h = fixture(tomorrow, { completed: true });
  const releaseReopenRead = h.holdGet();
  const reopening = h.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.ctx.reopeningWipIds.has(h.record.id), true);
  await h.updateWorkOrder(h.record.id, 'sip_revisit_date', later);
  assert.equal(h.record.sip_revisit_date, tomorrow, 'No second same-field write while reopening');
  assert.equal(h.ctx.savingRevisitIds.size, 0, 'Rejected date edit does not leave a busy indicator');
  assert.match(h.ctx.quickEditError, /reopening/);
  releaseReopenRead();
  await reopening;
  assert.equal(h.record.sip_completed, false);
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.writes, 1);
});

await check('completed WIP cannot reopen while the same job Revisit change is saving', async () => {
  const h = fixture(tomorrow, { completed: true });
  const releaseDateRead = h.holdGet();
  const editing = h.updateWorkOrder(h.record.id, 'sip_revisit_date', later);
  const reopening = h.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.ctx.reopeningWipIds.size, 0, 'Reopen does not launch during pending Revisit edit');
  assert.match(h.ctx.quickEditError, /Revisit date.*saving/);
  releaseDateRead();
  await Promise.all([editing, reopening]);
  assert.equal(h.record.sip_completed, true);
  assert.equal(h.record.sip_revisit_date, later);
  assert.equal(h.writes, 1);
  await h.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.record.sip_completed, false);
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.writes, 2);
});

await check('confirmed Revisit clear cannot overlap a pending WIP reopen', async () => {
  const h = fixture(tomorrow, { completed: true });
  h.requestClearRevisit(h.ctx.workOrders[0]);
  const releaseReopenRead = h.holdGet();
  const reopening = h.toggleSipCompleted(h.ctx.workOrders[0]);
  const clearing = h.confirmClearRevisit();
  assert.equal(h.ctx.isClearingRevisit, false, 'Clear confirmation stays idle while reopening');
  assert.match(h.ctx.quickEditError, /reopening/);
  releaseReopenRead();
  await Promise.all([reopening, clearing]);
  assert.equal(h.record.sip_completed, false);
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.writes, 1);
});



await check('pending confirmed clear blocks reopening without interrupting its original save', async () => {
  const h = fixture(tomorrow, { completed: true });
  h.requestClearRevisit(h.ctx.workOrders[0]);
  const releaseClearRead = h.holdGet();
  const clearing = h.confirmClearRevisit();
  assert.equal(h.ctx.savingRevisitIds.has(h.record.id), true);
  const reopening = h.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.ctx.reopeningWipIds.size, 0);
  assert.match(h.ctx.quickEditError, /Revisit date.*saving/);
  releaseClearRead();
  await Promise.all([clearing, reopening]);
  assert.equal(h.record.sip_completed, true);
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.writes, 1);
  assert.equal(h.ctx.savingRevisitIds.size, 0);
  await h.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.record.sip_completed, false);
  assert.equal(h.writes, 2);
});

await check('pending confirmed clear blocks competing date changes but allows independent fields', async () => {
  const h = fixture(tomorrow);
  h.requestClearRevisit(h.ctx.workOrders[0]);
  const releaseClearRead = h.holdGet();
  const clearing = h.confirmClearRevisit();
  await h.updateWorkOrder(h.record.id, 'sip_revisit_date', later);
  assert.match(h.ctx.quickEditError, /still saving/);
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, tomorrow);
  await h.updateWorkOrder(h.record.id, 'notes', 'independent during clear');
  assert.equal(h.record.notes, 'independent during clear');
  releaseClearRead();
  await clearing;
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.record.notes, 'independent during clear');
  assert.equal(h.ctx.workOrders[0].notes, 'independent during clear');
  assert.equal(h.ctx.savingRevisitIds.size, 0);
  assert.equal(h.writes, 2);
});

console.log(passed + '/' + passed + ' SIPS board refresh-ordering checks passed');
