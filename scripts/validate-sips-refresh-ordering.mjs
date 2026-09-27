import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual SIPS board load, quick edit, save wrapper and shared
// conditional persistence with deferred synthetic reads. No app API calls.
const board = readFileSync(new URL('../src/pages/SIPs.jsx', import.meta.url), 'utf8');
const persistence = readFileSync(new URL('../src/components/workflow/workOrderPersistence.js', import.meta.url), 'utf8');
function block(source, begin, end) {
  const start = source.indexOf(begin);
  const stop = source.indexOf(end, start);
  assert.ok(start >= 0 && stop > start, 'Expected source block: ' + begin);
  return source.slice(start, stop);
}
const source = [
  block(board, 'const parseLocalDate = ', '\n};') + '\n};',
  block(board, '  const saveBoardFields = async (options) => {', '\n  // Set document title'),
  block(board, '  const loadWorkOrders = async (showLoading = true) => {', '\n  const updateWorkOrder'),
  block(board, '  const updateWorkOrder = async (orderId, field, value) => {', '\n  // Check if a work order is a WIP item'),
  block(board, '  const isRevisitFuture = (wo) => {', '\n  // Completion must'),
  block(board, '  const toggleSipCompleted = async (wo) => {', '\n  const requestClearRevisit'),
  block(board, '  const requestClearRevisit = (wo) => {', '\n  // All non-completed active items'),
  block(persistence, 'function normalize(', '\nexport function sanitizeWorkOrderFormPatch'),
  block(persistence, 'export async function replaceWorkOrderFieldsIfUnchanged(', '\nexport async function transitionWorkOrderFromLoadedSnapshot').replace(/^export /, ''),
  'this.actions = { loadWorkOrders, updateWorkOrder, isRevisitFuture, toggleSipCompleted, requestClearRevisit, confirmClearRevisit };',
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
  const entity = {
    get: async (id) => {
      if (holdNextSavedRead && writes > 0) {
        const held = holdNextSavedRead;
        holdNextSavedRead = null;
        const snapshot = id === record.id ? structuredClone(record) : null;
        held.captured.resolve(snapshot);
        await held.release.promise;
        return snapshot;
      }
      if (holdNextGet) {
        const held = holdNextGet;
        holdNextGet = null;
        await held.promise;
      }
      return id === record.id ? structuredClone(record) : null;
    },
    updateMany: async (query, patch) => {
      if (query.id !== record.id || query.updated_date !== record.updated_date || record.deleted) {
        return { updated: 0 };
      }
      Object.assign(record, structuredClone(patch.$set));
      record.updated_date = String(Number(record.updated_date) + 1);
      writes++;
      return { updated: 1 };
    },
  };
  const globalSettings = {};
  const authorizedEmail = {};
  const ctx = {
    base44: { entities: { WorkOrder: entity, GlobalSettings: globalSettings } },
    WorkOrder: entity,
    AuthorizedEmail: authorizedEmail,
    boardLoadSequenceRef: { current: 0 },
    boardSaveEpochRef: { current: 0 },
    boardSavesPendingRef: { current: 0 },
    quickEditsInFlightRef: { current: new Map() },
    today,
    workOrders: [structuredClone(record)],
    users: [],
    boardError: '',
    quickEditError: '',
    isRefreshing: false,
    isLoading: false,
    pendingRevisitClear: null,
    isClearingRevisit: false,
    console: { error() {} },
    Date,
  };
  ctx.openChecklist = () => {};
  ctx.setOpenDatePopover = () => {};
  ctx.setPendingRevisitClear = (value) => { ctx.pendingRevisitClear = value; };
  ctx.setIsClearingRevisit = (value) => { ctx.isClearingRevisit = value; };
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
  assert.equal(h.record.sip_revisit_date, later);
  assert.equal(h.record.notes, 'local note');
  assert.equal(h.ctx.workOrders[0].sip_revisit_date, later, 'Failed date edit is corrected without waiting 60 seconds');
  assert.equal(h.ctx.workOrders[0].notes, 'local note');
  assert.match(h.ctx.quickEditError, /changed in another session/);
});

console.log(passed + '/' + passed + ' SIPS board refresh-ordering checks passed');
