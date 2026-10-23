import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { verifySalesSaveAcknowledgment } from '../base44/shared/salesSaveAcknowledgmentGuard.mjs';

// Run the actual SIPS handlers and shared conditional-write helper against
// isolated in-memory Work Orders. No live Base44 records are accessed.
const board = readFileSync(new URL('../src/pages/SIPs.jsx', import.meta.url), 'utf8');
const persistence = readFileSync(new URL('../src/components/workflow/workOrderPersistence.js', import.meta.url), 'utf8');
const trackedPersistence = readFileSync(new URL('../src/components/shared/trackedFieldPersistence.js', import.meta.url), 'utf8');

function block(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, 'Expected source block: ' + start);
  return source.slice(first, last);
}

const source = [
  block(board, 'const parseLocalDate = ', '\n};') + '\n};',
  block(board, '  const saveBoardFields = async (options) => {', '\n  // Set document title'),
  block(board, '  const updateWorkOrder = async (orderId, field, value) => {', '\n  // Check if a work order is a WIP item'),
  block(board, '  const isRevisitFuture = useCallback((wo) => {', '\n  // Completion must'),
  block(board, '  const toggleSipCompleted = async (wo) => {', '\n  const requestClearRevisit'),
  block(board, '  const requestClearRevisit = (wo) => {', '\n  // All non-completed active items'),
  trackedPersistence.slice(trackedPersistence.indexOf('export async function saveTrackedFields(')).replace(/^export /, ''),
  block(persistence, 'export async function replaceWorkOrderFieldsIfUnchanged(', '\nexport async function transitionWorkOrderFromLoadedSnapshot').replace(/^export /, ''),
  'this.handlers = { updateWorkOrder, isRevisitFuture, toggleSipCompleted, requestClearRevisit, confirmClearRevisit };',
].join('\n');

const dateOnly = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const yesterday = dateOnly(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
const todayDate = dateOnly(today);
const tomorrow = dateOnly(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
const later = dateOnly(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4));

function harness(initialDate = tomorrow) {
  const record = {
    id: 'synthetic-order',
    updated_date: '1',
    sip_revisit_date: initialDate,
    sip_completed: false,
    client_name: 'Synthetic job',
    deleted: false,
    notes: 'original',
  };
  let writes = 0;
  let reads = 0;
  let attemptedWrites = 0;
  let beforeCommit = null;
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const functions = {
    invoke: async (name, args) => {
      assert.equal(name, 'fieldHistoryAction');
      assert.equal(args.action, 'save');
      reads++;
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
      if (Object.entries(args.next_fields || {}).every(([field, value]) => same(loaded[field], value))) {
        return { data: { success: true, record: loaded } };
      }
      if (beforeCommit) {
        const mutate = beforeCommit;
        beforeCommit = null;
        mutate(record);
      }
      attemptedWrites++;
      if (record.updated_date !== loaded.updated_date) {
        return { data: { success: false, error: 'This record changed during saving. Reload before retrying; no newer fields were overwritten.' } };
      }
      Object.assign(record, structuredClone(args.next_fields || {}));
      record.updated_date = String(Number(record.updated_date) + 1);
      writes++;
      return { data: { success: true, record: structuredClone(record) } };
    },
  };
  const ctx = {
    base44: { functions },
    localStorage: { getItem: () => '' },
    verifySalesSaveAcknowledgment,
    today,
    todayMs: today.getTime(),
    wipTaskDescriptions: [],
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    boardLoadSequenceRef: { current: 0 },
    boardSaveEpochRef: { current: 0 },
    boardSavesPendingRef: { current: 0 },
    boardRefreshDeferredRef: { current: false },
    quickEditsInFlightRef: { current: new Map() },
    savingRevisitIds: new Set(),
    savingQuickEditKeys: new Set(),
    reopeningWipIds: new Set(),
    reopenedFocusWorkOrderId: null,
    reopeningWipInFlightRef: { current: new Set() },
    pendingRevisitClear: null,
    revisitClearFailure: null,
    isClearingRevisit: false,
    workOrders: [structuredClone(record)],
    quickEditError: '',
    reloads: 0,
    checklistOpened: 0,
    console: { error() {} },
  };
  ctx.openChecklist = () => { ctx.checklistOpened++; };
  ctx.setOpenDatePopover = () => {};
  ctx.setPendingRevisitClear = (value) => { ctx.pendingRevisitClear = value; };
  ctx.setRevisitClearFailure = (value) => { ctx.revisitClearFailure = value; };
  ctx.setIsClearingRevisit = (value) => { ctx.isClearingRevisit = value; };
  ctx.setQuickEditError = (value) => { ctx.quickEditError = value; };
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
  ctx.setWorkOrders = (updater) => {
    ctx.workOrders = typeof updater === 'function' ? updater(ctx.workOrders) : updater;
  };
  ctx.loadWorkOrders = async () => {
    ctx.boardLoadSequenceRef.current++;
    ctx.reloads++;
    ctx.workOrders = [structuredClone(record)];
    return ctx.workOrders;
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return {
    ctx,
    record,
    handlers: ctx.handlers,
    get writes() { return writes; },
    get reads() { return reads; },
    get attemptedWrites() { return attemptedWrites; },
    mutate(fields) {
      Object.assign(record, fields);
      record.updated_date = String(Number(record.updated_date) + 1);
    },
    beforeCommit(mutation) { beforeCommit = mutation; },
    openClear() { ctx.handlers.requestClearRevisit(ctx.workOrders[0]); },
  };
}

let passed = 0;
async function check(name, fn) {
  await fn();
  console.log('PASS ' + name);
  passed++;
}

await check('date-only boundary: today and past active, tomorrow Revisit Later', async () => {
  const h = harness(todayDate);
  assert.equal(h.handlers.isRevisitFuture({ sip_revisit_date: yesterday }), false);
  assert.equal(h.handlers.isRevisitFuture({ sip_revisit_date: todayDate }), false);
  assert.equal(h.handlers.isRevisitFuture({ sip_revisit_date: '' }), false);
  assert.equal(h.handlers.isRevisitFuture({ sip_revisit_date: tomorrow }), true);
});

await check('immediate date quick edit conditionally saves and re-sorts', async () => {
  const h = harness(todayDate);
  await h.handlers.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  assert.equal(h.record.sip_revisit_date, tomorrow);
  assert.equal(h.writes, 1);
  assert.equal(h.handlers.isRevisitFuture(h.ctx.workOrders[0]), true);
});

await check('immediate quick edit rejects another session changing its loaded date', async () => {
  const h = harness(yesterday);
  h.mutate({ sip_revisit_date: later });
  await h.handlers.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  assert.equal(h.record.sip_revisit_date, later);
  assert.equal(h.writes, 0);
  assert.equal(h.ctx.reloads, 1);
  assert.match(h.ctx.quickEditError, /changed in another session/);
});

await check('confirmed clear captures its original date and clears it', async () => {
  const h = harness(tomorrow);
  h.openClear();
  assert.equal(h.ctx.pendingRevisitClear.revisitDate, tomorrow);
  const saving = h.handlers.confirmClearRevisit();
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, tomorrow, 'No optimistic clearing');
  await saving;
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.writes, 1);
  assert.equal(h.ctx.pendingRevisitClear, null);
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, '');
});

await check('confirmed clear protects original date after unrelated board refresh', async () => {
  const h = harness(tomorrow);
  h.openClear();
  h.mutate({ notes: 'concurrent note' });
  h.ctx.workOrders = [structuredClone(h.record)];
  await h.handlers.confirmClearRevisit();
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.record.notes, 'concurrent note');
  assert.equal(h.writes, 1);
  assert.equal(h.ctx.quickEditError, '');
});

await check('confirmed clear refuses newer Revisit after board refresh', async () => {
  const h = harness(tomorrow);
  h.openClear();
  h.mutate({ sip_revisit_date: later });
  h.ctx.workOrders = [structuredClone(h.record)];
  await h.handlers.confirmClearRevisit();
  assert.equal(h.record.sip_revisit_date, later);
  assert.equal(h.writes, 0);
  assert.equal(h.ctx.reloads, 1);
  assert.equal(h.ctx.pendingRevisitClear.revisitDate, tomorrow);
  assert.equal(h.ctx.revisitClearFailure.requiresReview, true);
  assert.match(h.ctx.revisitClearFailure.message, /changed in another session/);
  assert.match(h.ctx.quickEditError, /changed in another session/);
});

await check('confirmed clear refuses concurrent Revisit change during CAS', async () => {
  const h = harness(tomorrow);
  h.openClear();
  h.beforeCommit((record) => {
    record.sip_revisit_date = later;
    record.updated_date = String(Number(record.updated_date) + 1);
  });
  await h.handlers.confirmClearRevisit();
  assert.equal(h.record.sip_revisit_date, later);
  assert.equal(h.writes, 0);
  assert.equal(h.ctx.reloads, 1);
  assert.match(h.ctx.quickEditError, /changed during saving/);
});

await check('confirmed clear fails safely on unrelated concurrent write without losing it', async () => {
  const h = harness(tomorrow);
  h.openClear();
  h.beforeCommit((record) => {
    record.notes = 'parallel note';
    record.updated_date = String(Number(record.updated_date) + 1);
  });
  await h.handlers.confirmClearRevisit();
  assert.equal(h.record.sip_revisit_date, tomorrow);
  assert.equal(h.record.notes, 'parallel note');
  assert.equal(h.writes, 0);
  assert.equal(h.attemptedWrites, 1);
  assert.equal(h.ctx.reloads, 1);
  assert.match(h.ctx.quickEditError, /changed during saving/);
});

await check('already-cleared date is idempotent and not written twice', async () => {
  const h = harness(tomorrow);
  h.openClear();
  h.mutate({ sip_revisit_date: '' });
  await h.handlers.confirmClearRevisit();
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.writes, 0);
  assert.equal(h.ctx.quickEditError, '');
  assert.equal(h.ctx.pendingRevisitClear, null);
});

await check('duplicate confirm while save in-flight is ignored', async () => {
  const h = harness(tomorrow);
  h.openClear();
  const first = h.handlers.confirmClearRevisit();
  const second = h.handlers.confirmClearRevisit();
  await Promise.all([first, second]);
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.writes, 1);
  assert.equal(h.attemptedWrites, 1);
});

await check('deleted Work Order cannot have its confirmed date cleared', async () => {
  const h = harness(tomorrow);
  h.openClear();
  h.mutate({ deleted: true });
  await h.handlers.confirmClearRevisit();
  assert.equal(h.record.sip_revisit_date, tomorrow);
  assert.equal(h.writes, 0);
  assert.equal(h.ctx.reloads, 1);
  assert.match(h.ctx.quickEditError, /Trash/);
});


function completedHarness(date = tomorrow) {
  const h = harness(date);
  h.record.sip_completed = true;
  h.ctx.workOrders = [structuredClone(h.record)];
  return h;
}

await check('completed WIP with no Revisit returns to active queue', async () => {
  const h = completedHarness('');
  const reopening = h.handlers.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.ctx.workOrders[0].sip_completed, true, 'No premature UI success');
  await reopening;
  assert.equal(h.record.sip_completed, false);
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.writes, 1);
});

await check('missing Revisit field reopens safely without a date', async () => {
  const h = completedHarness('');
  delete h.record.sip_revisit_date;
  delete h.ctx.workOrders[0].sip_revisit_date;
  await h.handlers.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.record.sip_completed, false);
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.writes, 1);
});

for (const date of [yesterday, todayDate]) {
  await check('completed WIP preserves ' + (date === todayDate ? 'today' : 'past') + ' Revisit when reopening', async () => {
    const h = completedHarness(date);
    await h.handlers.toggleSipCompleted(h.ctx.workOrders[0]);
    assert.equal(h.record.sip_completed, false);
    assert.equal(h.record.sip_revisit_date, date);
    assert.equal(h.handlers.isRevisitFuture(h.ctx.workOrders[0]), false);
    assert.equal(h.writes, 1);
  });
}

await check('completed WIP with legacy future Revisit clears date atomically', async () => {
  const h = completedHarness(tomorrow);
  await h.handlers.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.record.sip_completed, false);
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.writes, 1);
});

await check('reopen rejects future date added to previously undated WIP', async () => {
  const h = completedHarness('');
  h.mutate({ sip_revisit_date: tomorrow });
  await h.handlers.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.record.sip_completed, true);
  assert.equal(h.record.sip_revisit_date, tomorrow);
  assert.equal(h.writes, 0);
  assert.equal(h.ctx.reloads, 1);
  assert.match(h.ctx.quickEditError, /changed in another session/);
});

await check('reopen rejects future Revisit added mid-save at CAS boundary', async () => {
  const h = completedHarness(todayDate);
  h.beforeCommit((record) => {
    record.sip_revisit_date = tomorrow;
    record.updated_date = String(Number(record.updated_date) + 1);
  });
  await h.handlers.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.record.sip_completed, true);
  assert.equal(h.record.sip_revisit_date, tomorrow);
  assert.equal(h.writes, 0);
  assert.equal(h.ctx.reloads, 1);
  assert.match(h.ctx.quickEditError, /changed during saving/);
});

await check('CAS-losing WIP reopen recognizes matching saved state, restores focus without duplicate write', async () => {
  const h = completedHarness(tomorrow);
  // Another session completes the *same* guarded reopen between read and CAS.
  // The losing response is a conflict, but a verified refresh proves the
  // requested completion and Revisit outcome is already current on the server.
  h.beforeCommit(record => {
    record.sip_completed = false;
    record.sip_revisit_date = '';
    record.updated_date = String(Number(record.updated_date) + 1);
  });
  await h.handlers.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.record.sip_completed, false);
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.writes, 0, 'Losing session never resubmits the reopen');
  assert.equal(h.attemptedWrites, 1, 'Only the first conditional attempt occurs');
  assert.equal(h.ctx.reloads, 1, 'Failed CAS performs a verified board refresh');
  assert.equal(h.ctx.reopenedFocusWorkOrderId, h.record.id, 'Already-reopened item receives pending focus restoration');
  assert.equal(h.ctx.quickEditError, '', 'Already-applied state clears the stale conflict message');
});

await check('CAS-losing reopen with a different Revisit date retains conflict and never redirects focus', async () => {
  const h = completedHarness(tomorrow);
  h.beforeCommit(record => {
    record.sip_completed = false;
    record.sip_revisit_date = later;
    record.updated_date = String(Number(record.updated_date) + 1);
  });
  await h.handlers.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.record.sip_completed, false);
  assert.equal(h.record.sip_revisit_date, later);
  assert.equal(h.writes, 0);
  assert.equal(h.ctx.reloads, 1);
  assert.equal(h.ctx.reopenedFocusWorkOrderId, null, 'Mismatched Revisit outcome cannot hijack keyboard focus');
  assert.match(h.ctx.quickEditError, /changed during saving/, 'A divergent Revisit outcome stays visible as a conflict');
});

await check('reopen fails safely on unrelated concurrent edit without losing it', async () => {
  const h = completedHarness(todayDate);
  h.beforeCommit((record) => {
    record.notes = 'concurrent team note';
    record.updated_date = String(Number(record.updated_date) + 1);
  });
  await h.handlers.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.record.sip_completed, true);
  assert.equal(h.record.sip_revisit_date, todayDate);
  assert.equal(h.record.notes, 'concurrent team note');
  assert.equal(h.writes, 0);
  assert.equal(h.attemptedWrites, 1);
  assert.equal(h.ctx.reloads, 1);
  assert.match(h.ctx.quickEditError, /changed during saving/);
});

await check('incomplete WIP still opens checklist, not direct completion', async () => {
  const h = harness(todayDate);
  await h.handlers.toggleSipCompleted(h.ctx.workOrders[0]);
  assert.equal(h.ctx.checklistOpened, 1);
  assert.equal(h.writes, 0);
});


// Two independent SIPS component instances sharing one isolated, versioned
// Work Order. Tests exercise the real handlers and conditional-write logic,
// not browser rendering or a live Base44 record.
function twoSessionHarness({ date = todayDate, completed = false } = {}) {
  const live = {
    id: 'synthetic-two-session',
    updated_date: '1',
    sip_revisit_date: date,
    sip_completed: completed,
    deleted: false,
    client_name: 'Synthetic acceptance job',
    notes: 'original',
  };
  let writes = 0;
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const functions = {
    invoke: async (name, args) => {
      assert.equal(name, 'fieldHistoryAction');
      assert.equal(args.action, 'save');
      const loaded = structuredClone(live);
      if (loaded.deleted === true) {
        return { data: { success: false, error: 'This record is in Trash. Restore it first.' } };
      }
      for (const [field, nextValue] of Object.entries(args.next_fields || {})) {
        const expected = args.expected_fields?.[field] ?? null;
        if (!same(loaded[field], expected) && !same(loaded[field], nextValue)) {
          return { data: { success: false, error: `This field changed in another session: ${field}. Reload before saving.` } };
        }
      }
      if (Object.entries(args.next_fields || {}).every(([field, value]) => same(loaded[field], value))) {
        return { data: { success: true, record: loaded } };
      }
      Object.assign(live, structuredClone(args.next_fields || {}));
      live.updated_date = String(Number(live.updated_date) + 1);
      writes++;
      return { data: { success: true, record: structuredClone(live) } };
    },
  };
  function createSession() {
    const ctx = {
      base44: { functions },
      localStorage: { getItem: () => '' },
      verifySalesSaveAcknowledgment,
      today,
      todayMs: today.getTime(),
      wipTaskDescriptions: [],
      useMemo: (fn) => fn(),
      useCallback: (fn) => fn,
      boardLoadSequenceRef: { current: 0 },
      boardSaveEpochRef: { current: 0 },
      boardSavesPendingRef: { current: 0 },
      boardRefreshDeferredRef: { current: false },
      quickEditsInFlightRef: { current: new Map() },
      savingRevisitIds: new Set(),
      reopeningWipIds: new Set(),
      reopeningWipInFlightRef: { current: new Set() },
      workOrders: [structuredClone(live)],
      pendingRevisitClear: null,
      revisitClearFailure: null,
      isClearingRevisit: false,
      quickEditError: '',
      reloads: 0,
      checklistOpened: 0,
      console: { error() {} },
    };
    ctx.openChecklist = () => { ctx.checklistOpened++; };
    ctx.setOpenDatePopover = () => {};
    ctx.setPendingRevisitClear = (value) => { ctx.pendingRevisitClear = value; };
    ctx.setRevisitClearFailure = (value) => { ctx.revisitClearFailure = value; };
    ctx.setIsClearingRevisit = (value) => { ctx.isClearingRevisit = value; };
    ctx.setQuickEditError = (value) => { ctx.quickEditError = value; };
    ctx.setSavingRevisitIds = (updater) => {
      ctx.savingRevisitIds = typeof updater === 'function' ? updater(ctx.savingRevisitIds) : updater;
    };
    ctx.setReopeningWipIds = (updater) => {
      ctx.reopeningWipIds = typeof updater === 'function' ? updater(ctx.reopeningWipIds) : updater;
    };
    ctx.setReopenedFocusWorkOrderId = (value) => { ctx.reopenedFocusWorkOrderId = value; };
    ctx.setWorkOrders = (updater) => {
      ctx.workOrders = typeof updater === 'function' ? updater(ctx.workOrders) : updater;
    };
    ctx.loadWorkOrders = async () => {
      ctx.boardLoadSequenceRef.current++;
      ctx.reloads++;
      ctx.workOrders = [structuredClone(live)];
      return ctx.workOrders;
    };
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    return {
      ctx,
      ...ctx.handlers,
      refresh: ctx.loadWorkOrders,
      queue: () => {
        const wo = ctx.workOrders[0];
        return wo.sip_completed ? 'Completed WIP' :
          ctx.handlers.isRevisitFuture(wo) ? 'Revisit Later' : 'Active';
      },
      clear: () => ctx.handlers.requestClearRevisit(ctx.workOrders[0]),
      reopen: () => ctx.handlers.toggleSipCompleted(ctx.workOrders[0]),
      editRevisit: (dateValue) =>
        ctx.handlers.updateWorkOrder(live.id, 'sip_revisit_date', dateValue),
    };
  }
  const A = createSession();
  const B = createSession();
  return {
    live, A, B,
    get writes() { return writes; },
    mutate(fields) {
      Object.assign(live, fields);
      live.updated_date = String(Number(live.updated_date) + 1);
    },
  };
}

await check('two sessions classify no-date, today, and future Revisit consistently', async () => {
  const h = twoSessionHarness({ date: '' });
  assert.equal(h.A.queue(), 'Active');
  assert.equal(h.B.queue(), 'Active');
  await h.A.editRevisit(todayDate);
  await h.B.refresh();
  assert.equal(h.A.queue(), 'Active');
  assert.equal(h.B.queue(), 'Active');
  await h.B.editRevisit(tomorrow);
  await h.A.refresh();
  assert.equal(h.A.queue(), 'Revisit Later');
  assert.equal(h.B.queue(), 'Revisit Later');
  assert.equal(h.writes, 2);
});

await check('stale second-session date edit cannot overwrite new future Revisit', async () => {
  const h = twoSessionHarness({ date: todayDate });
  await h.A.editRevisit(tomorrow);
  await h.B.editRevisit(later);
  assert.equal(h.live.sip_revisit_date, tomorrow);
  assert.equal(h.writes, 1);
  assert.equal(h.B.queue(), 'Revisit Later');
  assert.equal(h.B.ctx.reloads, 1);
  assert.match(h.B.ctx.quickEditError, /changed in another session/);
});

await check('simultaneous conflicting Revisit quick edits produce one winner', async () => {
  const h = twoSessionHarness({ date: todayDate });
  await Promise.all([h.A.editRevisit(tomorrow), h.B.editRevisit(later)]);
  assert.ok([tomorrow, later].includes(h.live.sip_revisit_date));
  assert.equal(h.writes, 1);
  assert.equal(h.A.queue(), 'Revisit Later');
  assert.equal(h.B.queue(), 'Revisit Later');
  assert.equal(Number(Boolean(h.A.ctx.quickEditError)) + Number(Boolean(h.B.ctx.quickEditError)), 1);
});

await check('second-session confirmation cannot clear newer date after first-session edit', async () => {
  const h = twoSessionHarness({ date: tomorrow });
  h.B.clear();
  assert.equal(h.B.ctx.pendingRevisitClear.revisitDate, tomorrow);
  await h.A.editRevisit(later);
  await h.B.confirmClearRevisit();
  assert.equal(h.live.sip_revisit_date, later);
  assert.equal(h.writes, 1);
  assert.equal(h.B.queue(), 'Revisit Later');
  assert.equal(h.B.ctx.pendingRevisitClear.revisitDate, tomorrow);
  assert.equal(h.B.ctx.revisitClearFailure.requiresReview, true);
  assert.match(h.B.ctx.revisitClearFailure.message, /changed in another session/);
  assert.match(h.B.ctx.quickEditError, /changed in another session/);
});

await check('stale future edit cannot reschedule after another session clears Revisit', async () => {
  const h = twoSessionHarness({ date: tomorrow });
  h.A.clear();
  await h.A.confirmClearRevisit();
  await h.B.editRevisit(later);
  assert.equal(h.live.sip_revisit_date, '');
  assert.equal(h.writes, 1);
  assert.equal(h.A.queue(), 'Active');
  assert.equal(h.B.queue(), 'Active');
  assert.match(h.B.ctx.quickEditError, /changed in another session/);
});

await check('future Revisit clears into Active in both sessions after reload', async () => {
  const h = twoSessionHarness({ date: tomorrow });
  assert.equal(h.A.queue(), 'Revisit Later');
  h.A.clear();
  await h.A.confirmClearRevisit();
  await h.B.refresh();
  assert.equal(h.A.queue(), 'Active');
  assert.equal(h.B.queue(), 'Active');
  assert.equal(h.writes, 1);
});

await check('completed WIP cannot reopen stale no-date snapshot after future scheduling', async () => {
  const h = twoSessionHarness({ date: '', completed: true });
  assert.equal(h.A.queue(), 'Completed WIP');
  await h.B.editRevisit(tomorrow);
  await h.A.reopen();
  assert.equal(h.live.sip_completed, true);
  assert.equal(h.live.sip_revisit_date, tomorrow);
  assert.equal(h.writes, 1);
  assert.equal(h.A.queue(), 'Completed WIP');
  assert.match(h.A.ctx.quickEditError, /changed in another session/);
});

await check('reopening legacy future WIP prevents stale other-session reschedule', async () => {
  const h = twoSessionHarness({ date: tomorrow, completed: true });
  await h.A.reopen();
  assert.equal(h.A.queue(), 'Active');
  await h.B.editRevisit(later);
  assert.equal(h.live.sip_completed, false);
  assert.equal(h.live.sip_revisit_date, '');
  assert.equal(h.writes, 1);
  assert.equal(h.B.queue(), 'Active');
  assert.match(h.B.ctx.quickEditError, /changed in another session/);
});

await check('simultaneous reopening is idempotent and leaves one active WIP item', async () => {
  const h = twoSessionHarness({ date: tomorrow, completed: true });
  await Promise.all([h.A.reopen(), h.B.reopen()]);
  assert.equal(h.live.sip_completed, false);
  assert.equal(h.live.sip_revisit_date, '');
  assert.equal(h.writes, 1);
  assert.equal(h.A.queue(), 'Active');
  assert.equal(h.B.queue(), 'Active');
  assert.equal(h.A.ctx.quickEditError, '');
  assert.equal(h.B.ctx.quickEditError, '');
});

await check('reopening today-dated WIP preserves date across both sessions', async () => {
  const h = twoSessionHarness({ date: todayDate, completed: true });
  await h.A.reopen();
  await h.B.refresh();
  assert.equal(h.live.sip_completed, false);
  assert.equal(h.live.sip_revisit_date, todayDate);
  assert.equal(h.A.queue(), 'Active');
  assert.equal(h.B.queue(), 'Active');
  assert.equal(h.writes, 1);
});

await check('other-session unrelated note update does not block WIP reopening', async () => {
  const h = twoSessionHarness({ date: yesterday, completed: true });
  h.mutate({ notes: 'other editor retained' });
  await h.A.reopen();
  assert.equal(h.live.sip_completed, false);
  assert.equal(h.live.sip_revisit_date, yesterday);
  assert.equal(h.live.notes, 'other editor retained');
  assert.equal(h.writes, 1);
});


await check('rapid duplicate Revisit selection makes only one write', async () => {
  const h = harness(todayDate);
  const first = h.handlers.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  const duplicate = h.handlers.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  await Promise.all([first, duplicate]);
  assert.equal(h.record.sip_revisit_date, tomorrow);
  assert.equal(h.writes, 1);
  assert.equal(h.ctx.quickEditError, '');
  assert.equal(h.ctx.quickEditsInFlightRef.current.size, 0);
});

await check('rapid different Revisit selection is blocked visibly, then retry succeeds', async () => {
  const h = harness(todayDate);
  const first = h.handlers.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  const competing = h.handlers.updateWorkOrder(h.record.id, 'sip_revisit_date', later);
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, tomorrow);
  assert.match(h.ctx.quickEditError, /still saving/);
  await Promise.all([first, competing]);
  assert.equal(h.record.sip_revisit_date, tomorrow);
  assert.equal(h.writes, 1);
  assert.equal(h.ctx.quickEditsInFlightRef.current.size, 0);
  await h.handlers.updateWorkOrder(h.record.id, 'sip_revisit_date', later);
  assert.equal(h.record.sip_revisit_date, later);
  assert.equal(h.writes, 2);
  assert.equal(h.ctx.quickEditError, '');
});

await check('different Work Order fields can save concurrently without losing data', async () => {
  const h = harness(todayDate);
  await Promise.all([
    h.handlers.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow),
    h.handlers.updateWorkOrder(h.record.id, 'notes', 'independent edit'),
  ]);
  assert.equal(h.record.sip_revisit_date, tomorrow);
  assert.equal(h.record.notes, 'independent edit');
  assert.equal(h.writes, 2);
  assert.equal(h.ctx.quickEditsInFlightRef.current.size, 0);
});

await check('failed stale quick edit releases field so retry after refresh works', async () => {
  const h = harness(todayDate);
  h.mutate({ sip_revisit_date: later });
  await h.handlers.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  assert.equal(h.writes, 0);
  assert.equal(h.ctx.reloads, 1);
  assert.equal(h.ctx.quickEditsInFlightRef.current.size, 0);
  await h.handlers.updateWorkOrder(h.record.id, 'sip_revisit_date', tomorrow);
  assert.equal(h.record.sip_revisit_date, tomorrow);
  assert.equal(h.writes, 1);
  assert.equal(h.ctx.quickEditError, '');
});


await check('failed clear stays visible in dialog and cannot retry a stale confirmation', async () => {
  const h = harness(tomorrow);
  h.openClear();
  h.mutate({ sip_revisit_date: later });
  await h.handlers.confirmClearRevisit();
  assert.equal(h.record.sip_revisit_date, later);
  assert.equal(h.ctx.pendingRevisitClear.revisitDate, tomorrow, 'Dialog remains visible with confirmed date');
  assert.match(h.ctx.revisitClearFailure.message, /changed in another session/);
  assert.equal(h.ctx.revisitClearFailure.requiresReview, true);
  const writesBeforeRetry = h.attemptedWrites;
  await h.handlers.confirmClearRevisit();
  assert.equal(h.attemptedWrites, writesBeforeRetry, 'A stale confirmation cannot submit twice');
  assert.equal(h.record.sip_revisit_date, later);
});

await check('new clear confirmation resets old conflict after reviewing refreshed date', async () => {
  const h = harness(tomorrow);
  h.openClear();
  h.mutate({ sip_revisit_date: later });
  await h.handlers.confirmClearRevisit();
  assert.equal(h.ctx.revisitClearFailure.requiresReview, true);
  h.openClear();
  assert.equal(h.ctx.pendingRevisitClear.revisitDate, later);
  assert.equal(h.ctx.revisitClearFailure, null);
  await h.handlers.confirmClearRevisit();
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.ctx.pendingRevisitClear, null);
  assert.equal(h.ctx.revisitClearFailure, null);
  assert.equal(h.writes, 1);
});

await check('clear confirmation renders inline accessible failure and requires review after conflict', async () => {
  const start = board.indexOf('open={!!pendingRevisitClear}');
  const end = board.indexOf('open={!!actionError}', start);
  assert.ok(start > 0 && end > start, 'Clear Revisit dialog can be inspected');
  const dialog = board.slice(start, end);
  assert.match(dialog, /revisitClearFailure &&/);
  assert.match(dialog, /role="alert"/);
  assert.match(dialog, /\{revisitClearFailure.message\}/);
  assert.match(dialog, /revisitClearFailure\?\.requiresReview \? "Close & review board"/);
  assert.match(dialog, /disabled=\{isClearingRevisit \|\| revisitClearFailure\?\.requiresReview\}/);
  assert.match(dialog, /setRevisitClearFailure\(null\)/);
});

await check('an open checklist cannot be replaced by another Work Order', async () => {
  const handler = block(board, '  const openChecklist = (wo) => {', '\n  const dropdownConditionByName');
  const makeOpen = new Function('checklistDialog', 'setChecklistDialog', 'setActionError',
    handler + '\nreturn openChecklist;');
  let current = { open: false, workOrder: null };
  const notices = [];
  const update = value => { current = typeof value === 'function' ? value(current) : value; };
  const warn = value => notices.push(value);
  const first = { id: 'A', client_name: 'First', sip_checklist: [{ id: 'draft-row' }] };
  const other = { id: 'B', client_name: 'Second' };
  makeOpen(current, update, warn)(first);
  assert.strictEqual(current.workOrder, first);
  const stillMounted = current;
  makeOpen(current, update, warn)(other);
  assert.strictEqual(current, stillMounted);
  assert.strictEqual(current.workOrder, first);
  assert.equal(notices.length, 1);
  assert.match(notices[0].message, /Save & Revisit/);
  assert.match(notices[0].message, /Cancel/);
  makeOpen(current, update, warn)(first);
  assert.strictEqual(current, stillMounted);
  assert.equal(notices.length, 1, 'reopening the same checklist is a no-op');

  // React batches state updates: stale render closures must not replace
  // a first request that has already been queued by a different trigger.
  current = { open: false, workOrder: null };
  const staleClosure = makeOpen(current, update, warn);
  staleClosure(first);
  staleClosure(other);
  assert.strictEqual(current.workOrder, first);
  assert.equal(current.open, true);

  // Normal close, including its unsaved-edit confirmation, remains authoritative.
  current = { open: false, workOrder: null };
  makeOpen(current, update, warn)(other);
  assert.strictEqual(current.workOrder, other);
  makeOpen(current, update, warn)(null);
  assert.strictEqual(current.workOrder, other);
  assert.match(board, /onClose=\{\(\) => closeChecklistDialog\(checklistDialog\.workOrder\)\}/);
  assert.match(board, /<ProductChecklistDialog[\s\S]*?workOrder=\{checklistDialog\.workOrder\}/);
});

await check('checklist close returns focus to the job or the board heading when the opener is gone', async () => {
  const handler = block(board, '  const openChecklist = (wo) => {', '\n  const dropdownConditionByName');
  const makeClose = new Function('setChecklistDialog', 'document', 'requestAnimationFrame', 'revisitClearBoardRef',
    handler + '\nreturn closeChecklistDialog;');
  const wo = { id: 'W1' };

  // Radix restored focus to the still-mounted opener: leave it alone.
  const connected = { isConnected: true, focus() { this.focused = true; } };
  let closedWith = null;
  const calls = [];
  const docRestored = {
    activeElement: connected,
    body: {},
    querySelectorAll: () => [],
  };
  makeClose((v) => { closedWith = v; }, docRestored, (fn) => calls.push(fn), { current: null })(wo);
  assert.deepEqual(closedWith, { open: false, workOrder: null });
  calls.shift()();
  assert.equal(connected.focused, undefined, 'a successful Radix restore must not be overridden');

  // Opener detached after the row moved sections: focus the job's visible control.
  const visible = {
    isConnected: true,
    dataset: { sipsActiveFocusId: 'W1' },
    getClientRects: () => [1],
    focus() { this.focused = true; },
  };
  const hidden = {
    isConnected: true,
    dataset: { sipsActiveFocusId: 'W2' },
    getClientRects: () => [1],
    focus() { this.focused = true; },
  };
  const docDetached = {
    activeElement: { isConnected: false },
    body: {},
    querySelectorAll: (sel) => sel === '[data-sips-active-focus-id]' ? [hidden, visible] : [],
  };
  const calls2 = [];
  makeClose(() => {}, docDetached, (fn) => calls2.push(fn), { current: null })(wo);
  calls2.shift()();
  assert.equal(visible.focused, true);
  assert.equal(hidden.focused, undefined);

  // Job filtered out everywhere: the board heading is the safe fallback.
  const heading = { focus() { this.focused = true; } };
  const docGone = {
    activeElement: null,
    body: {},
    querySelectorAll: () => [],
  };
  const calls3 = [];
  makeClose(() => {}, docGone, (fn) => calls3.push(fn), { current: heading })(wo);
  calls3.shift()();
  assert.equal(heading.focused, true);
});

console.log(passed + '/' + passed + ' SIPS board Revisit regression checks passed');
