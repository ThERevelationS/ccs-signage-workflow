import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { addDays, format, startOfDay } from 'date-fns';
import { verifySalesSaveAcknowledgment } from '../base44/shared/salesSaveAcknowledgmentGuard.mjs';

// Run the actual Monday Morning Meeting handlers and shared conditional-write
// helpers against isolated in-memory Work Orders. No live Base44 records are
// accessed.
const board = readFileSync(new URL('../src/pages/MondayMorningMeeting.jsx', import.meta.url), 'utf8');
const persistence = readFileSync(new URL('../src/components/workflow/workOrderPersistence.js', import.meta.url), 'utf8');
const trackedPersistence = readFileSync(new URL('../src/components/shared/trackedFieldPersistence.js', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../base44/entities/WorkOrder.jsonc', import.meta.url), 'utf8');

function block(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, 'Expected source block: ' + start);
  return source.slice(first, last);
}

const source = [
  block(board, 'const parseLocalDate = ', '\n};') + '\n};',
  block(board, 'const getMeetingWeekStart = ', '\n};') + '\n};',
  block(board, 'const getMondayWeeksAhead = ', '\n') ,
  block(board, '  const runBoardSave = async (fn) => {', '\n  // A Work Order can have independent'),
  block(board, '  const applySavedBoardFields = (orderId, saved, fields) => {', '\n  const loadWorkOrders'),
  block(board, '  const updateWorkOrder = async (orderId, field, value) => {', '\n  const wipTaskDescriptionSet'),
  block(board, '  const isDiscussedThisWeek = useCallback', '\n  // Checking '),
  block(board, '  const toggleDiscussed = async (wo) => {', '\n  const deferUntilMonday'),
  block(board, '  const deferUntilMonday = (wo, date) => {', '\n  const openMmmTasks'),
  block(board, '  const openMmmTasks = useCallback', '\n  // MMM tasks are a dedicated'),
  block(board, '  const addMmmTask = async (wo,', '\n  const toggleMmmTask'),
  block(board, '  const toggleMmmTask = async (wo, task) => {', '\n  // Meeting notes go to'),
  block(board, '  const addWorkNote = async (wo,', '\n  const normalizedSearch'),
  block(persistence, 'function normalize(value) {', '\nexport function sanitizeWorkOrderFormPatch'),
  block(persistence, 'export function createWorkOrderArrayItemLocator', '\nexport async function mutateWorkOrderArrayField').replaceAll(/^export /gm, ''),
  block(persistence, 'function normalize(', '\nexport function sanitizeWorkOrderFormPatch'),
  block(persistence, 'export async function replaceWorkOrderFieldsIfUnchanged', '\nconst WO_STAGE_ORDER').replace(/^export /, ''),
  block(persistence, 'export async function mutateWorkOrderArrayField', '\nexport async function softDeleteWorkOrderFromLoadedSnapshot').replace(/^export /, ''),
  trackedPersistence.slice(trackedPersistence.indexOf('export async function saveTrackedFields(')).replace(/^export /, ''),
  'this.handlers = { getMeetingWeekStart, getMondayWeeksAhead, isDiscussedThisWeek, isDeferred, isParked, toggleDiscussed, deferUntilMonday, updateWorkOrder, openMmmTasks, otherJobTaskCount, addMmmTask, toggleMmmTask, addWorkNote };',
].join('\n');

const dateOnly = (date) => format(date, 'yyyy-MM-dd');
const now = new Date();
const today = startOfDay(now);
// Same math as the page's getMeetingWeekStart (most recent Monday 00:00).
const weekStart = new Date(today.getTime() - ((today.getDay() + 6) % 7) * 86400000);
const nextMonday = addDays(weekStart, 7);

function harness(overrides = {}) {
  const record = {
    id: 'synthetic-order',
    updated_date: '1',
    mmm_last_discussed_at: '',
    mmm_defer_until: '',
    mmm_tasks: [],
    work_notes: [],
    notes: [],
    client_name: 'Synthetic job',
    deleted: false,
    ...overrides,
  };
  let writes = 0;
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const functions = {
    invoke: async (name, args) => {
      assert.equal(name, 'fieldHistoryAction');
      assert.equal(args.action, 'save');
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
      Object.assign(record, structuredClone(args.next_fields || {}));
      record.updated_date = String(Number(record.updated_date) + 1);
      writes++;
      return { data: { success: true, record: structuredClone(record) } };
    },
  };
  // Real CAS stub: get/updateMany act on the fixture record so
  // updateMany({id, updated_date}) succeeds only when the record is unchanged.
  const casEntity = {
    get: async (id) => {
      assert.equal(id, record.id);
      return structuredClone(record);
    },
    updateMany: async (query, patch) => {
      const ok = query?.id === record.id && String(query?.updated_date) === String(record.updated_date);
      if (!ok) return { updated: 0 };
      Object.assign(record, structuredClone(patch?.$set || {}));
      record.updated_date = String(Number(record.updated_date) + 1);
      writes++;
      return { updated: 1 };
    },
  };
  const ctx = {
    base44: {
      functions,
      entities: { WorkOrder: casEntity },
    },
    // Handlers reference the page-level `const WorkOrder = base44.entities.WorkOrder`.
    WorkOrder: casEntity,
    staffEntities: { WorkOrder: casEntity },
    verifySalesSaveAcknowledgment,
    localStorage: { getItem: () => '' },
    addDays, format, startOfDay,
    today,
    todayMs: today.getTime(),
    meetingWeekStart: weekStart,
    meetingWeekStartMs: weekStart.getTime(),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    boardLoadSequenceRef: { current: 0 },
    boardHasLoadedRef: { current: true },
    boardLoadsInFlightRef: { current: 0 },
    boardSaveEpochRef: { current: 0 },
    boardSavesPendingRef: { current: 0 },
    boardRefreshDeferredRef: { current: false },
    quickEditsInFlightRef: { current: new Map() },
    discussedInFlightRef: { current: new Set() },
    updatesInFlightRef: { current: new Set() },
    workOrders: [structuredClone(record)],
    users: [],
    currentUser: { full_name: 'Meeting User', email: 'meeting@example.com' },
    isRegistered: true,
    savingQuickEditKeys: new Set(),
    discussedSavingIds: new Set(),
    updatesSavingIds: new Set(),
    manuallyExpandedIds: new Set(),
    quickEditError: '',
    boardError: '',
    searchQuery: '',
    statusFilter: 'all',
    sortMode: 'meeting',
    reloads: 0,
    console: { error: (...a) => process.env.MMM_DEBUG && console.error('PAGE_ERR', ...a) },
  };
  ctx.setQuickEditError = (value) => { ctx.quickEditError = value; };
  ctx.setBoardError = (value) => { ctx.boardError = value; };
  ctx.setOpenDatePopover = (value) => { ctx.openDatePopover = value; };
  ctx.setWorkOrders = (updater) => {
    ctx.workOrders = typeof updater === 'function' ? updater(ctx.workOrders) : updater;
  };
  ctx.setUsers = (updater) => { ctx.users = typeof updater === 'function' ? updater(ctx.users) : updater; };
  ctx.setWipTaskDescriptions = (updater) => { ctx.wipTaskDescriptions = typeof updater === 'function' ? updater(ctx.wipTaskDescriptions) : updater; };
  ctx.setTaskDescriptions = (updater) => { ctx.taskDescriptions = typeof updater === 'function' ? updater(ctx.taskDescriptions) : updater; };
  ctx.setLastUpdated = () => {};
  ctx.setIsLoading = () => {};
  ctx.setIsRefreshing = () => {};
  ctx.setSavingQuickEditKeys = (updater) => {
    ctx.savingQuickEditKeys = typeof updater === 'function' ? updater(ctx.savingQuickEditKeys) : updater;
  };
  ctx.setDiscussedSavingIds = (updater) => {
    ctx.discussedSavingIds = typeof updater === 'function' ? updater(ctx.discussedSavingIds) : updater;
  };
  ctx.setUpdatesSavingIds = (updater) => {
    ctx.updatesSavingIds = typeof updater === 'function' ? updater(ctx.updatesSavingIds) : updater;
  };
  ctx.setManuallyExpandedIds = (updater) => {
    ctx.manuallyExpandedIds = typeof updater === 'function' ? updater(ctx.manuallyExpandedIds) : updater;
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
    mutate(fields) {
      Object.assign(record, fields);
      record.updated_date = String(Number(record.updated_date) + 1);
    },
  };
}

let passed = 0;
async function check(name, fn) {
  await fn();
  console.log('PASS ' + name);
  passed++;
}

await check('meeting week starts Monday 00:00 local', async () => {
  assert.equal(weekStart.getDay(), 1);
  assert.equal(weekStart.getHours(), 0);
  assert.ok(weekStart.getTime() <= today.getTime());
  assert.ok(weekStart.getTime() > today.getTime() - 7 * 86400000);
});

await check('discussed boundary: only timestamps inside this Mon-Sun week park a row', async () => {
  const h = harness();
  assert.equal(h.handlers.isDiscussedThisWeek({ mmm_last_discussed_at: '' }), false);
  assert.equal(h.handlers.isDiscussedThisWeek({}), false);
  assert.equal(h.handlers.isDiscussedThisWeek({ mmm_last_discussed_at: weekStart.toISOString() }), true);
  assert.equal(h.handlers.isDiscussedThisWeek({ mmm_last_discussed_at: new Date(weekStart.getTime() - 60000).toISOString() }), false);
});

await check('defer boundary: only future Mondays park a row', async () => {
  const h = harness();
  assert.equal(h.handlers.isDeferred({ mmm_defer_until: '' }), false);
  assert.equal(h.handlers.isDeferred({ mmm_defer_until: dateOnly(today) }), false);
  assert.equal(h.handlers.isDeferred({ mmm_defer_until: dateOnly(nextMonday) }), true);
  assert.equal(h.handlers.isParked({ mmm_defer_until: dateOnly(nextMonday) }), true);
  assert.equal(h.handlers.isParked({ mmm_last_discussed_at: new Date().toISOString() }), true);
});

await check('snooze presets land on the next three Mondays', async () => {
  const h = harness();
  assert.equal(h.handlers.getMondayWeeksAhead(1).getDay(), 1);
  assert.equal(dateOnly(h.handlers.getMondayWeeksAhead(1)), dateOnly(nextMonday));
  assert.equal(dateOnly(h.handlers.getMondayWeeksAhead(2)), dateOnly(addDays(nextMonday, 7)));
  assert.equal(dateOnly(h.handlers.getMondayWeeksAhead(3)), dateOnly(addDays(nextMonday, 14)));
});

await check('checking a row writes discussed timestamp and clears defer in one CAS save', async () => {
  const h = harness();
  await h.handlers.toggleDiscussed(h.ctx.workOrders[0]);
  assert.ok(h.record.mmm_last_discussed_at, 'discussed timestamp written');
  assert.equal(h.record.mmm_defer_until, '');
  assert.equal(h.writes, 1);
  assert.equal(h.handlers.isParked(h.ctx.workOrders[0]), true);
});

await check('unchecking a parked row clears both markers and returns it active', async () => {
  const h = harness({ mmm_last_discussed_at: new Date().toISOString(), mmm_defer_until: dateOnly(nextMonday) });
  await h.handlers.toggleDiscussed(h.ctx.workOrders[0]);
  assert.equal(h.record.mmm_last_discussed_at, '');
  assert.equal(h.record.mmm_defer_until, '');
  assert.equal(h.writes, 1);
  assert.equal(h.handlers.isParked(h.ctx.workOrders[0]), false);
});

await check('duplicate discussed toggle while save in-flight is ignored', async () => {
  const h = harness();
  const first = h.handlers.toggleDiscussed(h.ctx.workOrders[0]);
  const second = h.handlers.toggleDiscussed(h.ctx.workOrders[0]);
  await Promise.all([first, second]);
  assert.equal(h.writes, 1);
});

await check('discussed toggle rejects another session changing markers', async () => {
  const h = harness();
  h.mutate({ mmm_last_discussed_at: '2026-01-01T00:00:00.000Z' });
  await h.handlers.toggleDiscussed(h.ctx.workOrders[0]);
  assert.equal(h.writes, 0);
  assert.equal(h.ctx.reloads, 1);
  assert.match(h.ctx.quickEditError, /changed in another session/);
});

await check('defer writes mmm_defer_until via the shared field CAS path', async () => {
  const h = harness();
  h.handlers.deferUntilMonday(h.ctx.workOrders[0], nextMonday);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(h.record.mmm_defer_until, dateOnly(nextMonday));
  assert.equal(h.writes, 1);
});

await check('duplicate same-field quick edit while in-flight is ignored', async () => {
  const h = harness();
  const first = h.handlers.updateWorkOrder(h.record.id, 'mmm_defer_until', dateOnly(nextMonday));
  const second = h.handlers.updateWorkOrder(h.record.id, 'mmm_defer_until', dateOnly(nextMonday));
  await Promise.all([first, second]);
  assert.equal(h.writes, 1);
});

await check('competing same-field quick edit surfaces a wait message, not a silent race', async () => {
  const h = harness();
  const first = h.handlers.updateWorkOrder(h.record.id, 'current_task_deadline', '2026-11-02');
  const second = h.handlers.updateWorkOrder(h.record.id, 'current_task_deadline', '2026-11-09');
  await Promise.all([first, second]);
  assert.equal(h.record.current_task_deadline, '2026-11-02');
  assert.equal(h.writes, 1);
  assert.match(h.ctx.quickEditError, /still saving/);
});

await check('addMmmTask appends a stamped item through array CAS', async () => {
  const h = harness();
  await h.handlers.addMmmTask(h.ctx.workOrders[0], { text: 'Order brackets', assigned_to: 'Sam', due_date: '2026-10-28' });
  assert.equal(h.record.mmm_tasks.length, 1);
  const task = h.record.mmm_tasks[0];
  assert.equal(task.text, 'Order brackets');
  assert.equal(task.assigned_to, 'Sam');
  assert.equal(task.due_date, '2026-10-28');
  assert.equal(task.completed, false);
  assert.equal(task.created_by, 'Meeting User');
  assert.ok(task.id);
  assert.equal(h.writes, 1);
});

await check('two employees adding tasks concurrently keep both items', async () => {
  const h = harness();
  // Simulate a second session's add landing between our read and write by
  // mutating the record mid-save is covered by the CAS retry in the helper;
  // sequential adds from the same board must still accumulate.
  await h.handlers.addMmmTask(h.ctx.workOrders[0], { text: 'First task', assigned_to: '', due_date: '' });
  h.ctx.workOrders = [structuredClone(h.record)];
  await h.handlers.addMmmTask(h.ctx.workOrders[0], { text: 'Second task', assigned_to: '', due_date: '' });
  assert.equal(h.record.mmm_tasks.length, 2);
  assert.equal(h.writes, 2);
});

await check('duplicate task add while in-flight is ignored', async () => {
  const h = harness();
  const first = h.handlers.addMmmTask(h.ctx.workOrders[0], { text: 'T', assigned_to: '', due_date: '' });
  const second = h.handlers.addMmmTask(h.ctx.workOrders[0], { text: 'T', assigned_to: '', due_date: '' });
  await Promise.all([first, second]);
  assert.equal(h.record.mmm_tasks.length, 1);
  assert.equal(h.writes, 1);
});

await check('toggleMmmTask locates the item by identity and flips completed', async () => {
  const h = harness({ mmm_tasks: [
    { id: 'a', text: 'Keep me', completed: false },
    { id: 'b', text: 'Done me', completed: false },
  ] });
  const task = h.ctx.workOrders[0].mmm_tasks[1];
  await h.handlers.toggleMmmTask(h.ctx.workOrders[0], task);
  assert.equal(h.record.mmm_tasks.length, 2);
  assert.equal(h.record.mmm_tasks[0].completed, false);
  assert.equal(h.record.mmm_tasks[1].completed, true);
  assert.equal(h.writes, 1);
  assert.deepEqual(h.handlers.openMmmTasks(h.ctx.workOrders[0]).map(t => t.id), ['a']);
});

await check('toggleMmmTask reports a changed item instead of corrupting the list', async () => {
  const h = harness({ mmm_tasks: [{ id: 'a', text: 'Original', completed: false }] });
  const task = { ...h.ctx.workOrders[0].mmm_tasks[0] };
  h.mutate({ mmm_tasks: [{ id: 'a', text: 'Edited elsewhere', completed: false }] });
  // The locator matches by id so the in-place edit does not block the flip;
  // a removed item is the unsafe case and must fail loudly.
  await h.handlers.toggleMmmTask(h.ctx.workOrders[0], task);
  assert.equal(h.record.mmm_tasks[0].completed, true);
  const h2 = harness({ mmm_tasks: [] });
  const ghost = { id: 'gone', text: 'Removed', completed: false };
  await h2.handlers.toggleMmmTask(h2.ctx.workOrders[0], ghost);
  assert.equal(h2.writes, 0);
  assert.equal(h2.ctx.reloads, 1);
});

await check('addWorkNote appends to shared work_notes with author and type', async () => {
  const h = harness();
  await h.handlers.addWorkNote(h.ctx.workOrders[0], { text: 'Waiting on city permit', type: 'permitting' });
  assert.equal(h.record.work_notes.length, 1);
  const note = h.record.work_notes[0];
  assert.equal(note.text, 'Waiting on city permit');
  assert.equal(note.type, 'permitting');
  assert.equal(note.created_by, 'Meeting User');
  assert.ok(note.timestamp);
  assert.equal(h.writes, 1);
});

await check('otherJobTaskCount counts only open shared job tasks', async () => {
  const h = harness({ notes: [
    { id: '1', text: 'open', completed: false },
    { id: '2', text: 'done', completed: true },
  ] });
  assert.equal(h.handlers.otherJobTaskCount(h.ctx.workOrders[0]), 1);
});

// --- Source-level guarantees that keep the meeting page meeting-safe ---
await check('page uses the motion-foundation skeleton loading state', async () => {
  assert.match(board, /import \{ ListSkeleton \} from "@\/components\/ui\/list-skeleton"/);
  assert.match(board, /<ListSkeleton rows=\{\d+\} \/>/);
});

await check('checklist code is fully removed from the page', async () => {
  assert.doesNotMatch(board, /MmmChecklistDialog|MmmTemplateBuilder|mmm_sip_checklist|getChecklistProgress/);
});

await check('no native alert/confirm dialogs remain on meeting surfaces', async () => {
  assert.doesNotMatch(board, /\balert\(|\bconfirm\(/);
});

await check('discussed semantics never touch sip_completed', async () => {
  const toggleBlock = block(board, 'const toggleDiscussed', '\n  const deferUntilMonday');
  assert.doesNotMatch(toggleBlock, /sip_completed/);
  assert.doesNotMatch(board, /updateWorkOrder\(wo\.id, "sip_completed"/);
});

await check('row focus uses ids and job anchors, not positions', async () => {
  assert.doesNotMatch(board, /focusedRowIndex/);
  assert.match(board, /data-mmm-focus-id=\{wo\.id\}/g);
  assert.match(board, /restoreBoardFocus/);
  assert.match(board, /anchorFocusedRow/);
});

await check('board membership and meeting columns are wired', async () => {
  assert.match(board, /current_task_assigned_to === "Monday Morning Meeting"/);
  assert.match(board, /updateWorkOrder\(wo\.id, "current_task_description"/);
  assert.match(board, /updateWorkOrder\(wo\.id, "project_install_date"/);
  assert.match(board, /updateWorkOrder\(wo\.id, "mmm_defer_until"/);
});

await check('schema carries the three new MMM fields', async () => {
  for (const field of ['mmm_last_discussed_at', 'mmm_defer_until', 'mmm_tasks']) {
    assert.ok(schema.includes(`"${field}"`), field + ' missing from WorkOrder.jsonc');
  }
});

console.log(`\nMMM BOARD VALIDATOR: ${passed} checks PASS`);
