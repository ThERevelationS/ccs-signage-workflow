import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run the actual SIPS handlers and shared conditional-write helper against
// isolated in-memory Work Orders. No live Base44 records are accessed.
const board = readFileSync(new URL('../src/pages/SIPs.jsx', import.meta.url), 'utf8');
const persistence = readFileSync(new URL('../src/components/workflow/workOrderPersistence.js', import.meta.url), 'utf8');

function block(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, 'Expected source block: ' + start);
  return source.slice(first, last);
}

const source = [
  block(board, 'const parseLocalDate = ', '\n};') + '\n};',
  block(board, '  const updateWorkOrder = async (orderId, field, value) => {', '\n  // Check if a work order is a WIP item'),
  block(board, '  const isRevisitFuture = (wo) => {', '\n  // Completion must'),
  block(board, '  const toggleSipCompleted = async (wo) => {', '\n  const requestClearRevisit'),
  block(board, '  const requestClearRevisit = (wo) => {', '\n  // All non-completed active items'),
  block(persistence, 'function normalize(', '\nexport function sanitizeWorkOrderFormPatch'),
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
  const entity = {
    get: async (id) => {
      reads++;
      return id === record.id ? structuredClone(record) : null;
    },
    updateMany: async (query, patch) => {
      attemptedWrites++;
      if (beforeCommit) {
        const mutate = beforeCommit;
        beforeCommit = null;
        mutate(record);
      }
      if (query.id !== record.id || query.updated_date !== record.updated_date) {
        return { updated: 0 };
      }
      Object.assign(record, structuredClone(patch.$set));
      record.updated_date = String(Number(record.updated_date) + 1);
      writes++;
      return { updated: 1 };
    },
  };
  const ctx = {
    base44: { entities: { WorkOrder: entity } },
    today,
    pendingRevisitClear: null,
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
  ctx.setIsClearingRevisit = (value) => { ctx.isClearingRevisit = value; };
  ctx.setQuickEditError = (value) => { ctx.quickEditError = value; };
  ctx.setWorkOrders = (updater) => {
    ctx.workOrders = typeof updater === 'function' ? updater(ctx.workOrders) : updater;
  };
  ctx.loadWorkOrders = async () => {
    ctx.reloads++;
    ctx.workOrders = [structuredClone(record)];
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
  assert.equal(h.ctx.pendingRevisitClear, null);
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
  assert.match(h.ctx.quickEditError, /changed in another session/);
});

await check('confirmed clear retries unrelated concurrent write without losing it', async () => {
  const h = harness(tomorrow);
  h.openClear();
  h.beforeCommit((record) => {
    record.notes = 'parallel note';
    record.updated_date = String(Number(record.updated_date) + 1);
  });
  await h.handlers.confirmClearRevisit();
  assert.equal(h.record.sip_revisit_date, '');
  assert.equal(h.record.notes, 'parallel note');
  assert.equal(h.writes, 1);
  assert.equal(h.attemptedWrites, 2);
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

console.log(passed + '/' + passed + ' SIPS board Revisit regression checks passed');
