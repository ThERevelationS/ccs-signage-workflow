// Executable hardening test for base44/functions/manageTraining/entry.ts.
//
// Same harness convention as test-automation-behavior.mjs / test-sop-module.mjs:
// entry.ts is transpiled to CommonJS under Node, `npm:@base44/sdk` + shared
// helpers are stubbed through a custom require (pagedEntityRows runs for
// real), the Deno.serve handler is invoked with synthetic Requests, and
// entities are in-memory stores honoring predicates + updated_date CAS.
//
// Coverage per op:
//   bootstrap / my_assignments — staff: own non-cancelled assignments only,
//                                decorate() adds overdue + renewal_due, no
//                                items/assignments/staff keys leak; editor:
//                                items (incl. inactive), all assignments
//                                (incl. cancelled), staff minus deactivated;
//                                default action is bootstrap; 401 unauth.
//   item_create                — editor-only, sop type requires sop_id,
//                                title required, url/file_url cleaned,
//                                valid_months only on certification,
//                                dedupe on creation_request_key, recovery
//                                after lost response.
//   item_update                — CAS, stale -> 409, missing version -> 400.
//   item_delete                — admin-only; assignments exist -> deactivate
//                                (active:false), else real delete; stale
//                                expected version -> 409; no id -> 400.
//   assign                     — editor-only, item must exist + be active,
//                                sop-type item requires a published linked
//                                SOP, existing pending skipped, deactivated
//                                staff skipped, pre-acked assignee created
//                                completed/sop_ack, old-version ack NOT
//                                pre-acked, assign_key dedupe, emails
//                                cleaned/validated, fields copied.
//   complete                   — assignee self ok ('self'), other staff ->
//                                403, editor -> 'manager', cert expiry =
//                                completed + valid_months, already-done ->
//                                early return, CAS guards.
//   cancel / reopen            — editor-only, clears completed_* + expires.
//   report                     — editor-only, by_item grouping + counts.
//   unknown action             — 400.
//
// Run: node scripts/test-training-module.mjs  ->  prints "PASS training-module"
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require2 = createRequire(pathToFileURL(path.resolve(root, 'package.json')));
const ts = require2('typescript');
globalThis.__READ_BUDGET_TELEMETRY = false;

let CASES = 0;
const eq = (a, b, msg) => { CASES += 1; assert.equal(a, b, msg); };
const deq = (a, b, msg) => { CASES += 1; assert.deepEqual(a, b, msg); };
const ok = (v, msg) => { CASES += 1; assert.ok(v, msg); };

// ---------------------------------------------------------------------------
// In-memory entity (same CAS semantics as test-sop-module.mjs)
// ---------------------------------------------------------------------------
const makeEntity = (initial = [], prefix = 'e') => {
  const rows = (initial || []).map((r) => structuredClone(r));
  let seq = 0;
  let ver = 0;
  const match = (row, q) => Object.entries(q || {}).every(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && '$gte' in v) return row[k] >= v.$gte;
    return row?.[k] === v;
  });
  const sortRows = (list, sort) => {
    if (!sort) return list;
    const desc = String(sort).startsWith('-');
    const field = desc ? String(sort).slice(1) : String(sort);
    return [...list].sort((a, b) => {
      const av = a?.[field]; const bv = b?.[field];
      if (av === bv) return 0;
      return (av ?? '') < (bv ?? '') ? (desc ? 1 : -1) : (desc ? -1 : 1);
    });
  };
  const entity = {
    rows,
    hooks: {},
    filter: async (q = {}, sort = null, limit = 1000, skip = 0) => {
      const matched = sortRows(rows.filter((r) => match(r, q)), sort);
      const page = limit == null ? matched.slice(skip) : matched.slice(skip, skip + limit);
      return page.map((r) => structuredClone(r));
    },
    list: async (sort = null, limit = 1000, skip = 0) => entity.filter({}, sort, limit, skip),
    get: async (id) => {
      const r = rows.find((x) => x.id === id);
      if (!r) throw Object.assign(new Error('not found'), { status: 404 });
      return structuredClone(r);
    },
    create: async (data) => {
      if (entity.hooks.create) return entity.hooks.create(data);
      const row = {
        ...structuredClone(data),
        id: data?.id || `${prefix}${++seq}`,
        created_date: new Date().toISOString(),
        updated_date: `${prefix}v${++ver}`,
      };
      rows.push(row);
      return structuredClone(row);
    },
    update: async (id, data) => {
      const r = rows.find((x) => x.id === id);
      if (!r) throw Object.assign(new Error('not found'), { status: 404 });
      Object.assign(r, structuredClone(data), { updated_date: `${prefix}v${++ver}` });
      return structuredClone(r);
    },
    updateMany: async (q, u) => {
      if (entity.hooks.updateMany) return entity.hooks.updateMany(q, u);
      const set = u?.$set || {};
      let count = 0;
      for (const r of rows) {
        if (!match(r, q)) continue;
        Object.assign(r, structuredClone(set), { updated_date: `${prefix}v${++ver}` });
        count += 1;
      }
      return { updated: count };
    },
    delete: async (id) => {
      const i = rows.findIndex((x) => x.id === id);
      if (i >= 0) rows.splice(i, 1);
      return { deleted: true };
    },
  };
  return entity;
};

// ---------------------------------------------------------------------------
// Module loader
// ---------------------------------------------------------------------------
const transpile = (rel) => ts.transpileModule(readFileSync(path.join(root, rel), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const loadShared = (rel) => {
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', 'Deno', transpile(rel))(
    (spec) => { throw new Error(`Unexpected shared dep: ${spec}`); },
    mod, mod.exports, { serve: () => {}, env: { get: () => '' } },
  );
  return mod.exports;
};
const pagedEntityRows = loadShared('base44/shared/pagedEntityRows.ts');

function loadEntry({ entities, sessions }) {
  const base44 = { asServiceRole: { entities } };
  const deps = {
    'npm:@base44/sdk@0.8.25': { createClientFromRequest: () => base44 },
    '../../shared/signShopSession.ts': {
      authenticateSignShopSession: async (_c, token) => sessions?.[token] || null,
    },
    '../../shared/entityRateLimitRetry.ts': { withEntityRateLimitRetry: (c) => c },
    '../../shared/pagedEntityRows.ts': pagedEntityRows,
  };
  let handler = null;
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', 'Deno', transpile('base44/functions/manageTraining/entry.ts'))(
    (spec) => {
      if (spec in deps) return deps[spec];
      const hit = Object.keys(deps).find((k) => spec.endsWith(k));
      if (hit) return deps[hit];
      throw new Error(`Unexpected dependency: ${spec}`);
    },
    mod, mod.exports,
    { serve: (fn) => { handler = fn; }, env: { get: () => '' } },
  );
  assert.ok(handler, 'Deno.serve handler registered');
  return async (body, token) => {
    const req = new Request('https://training.synthetic.invalid/', {
      method: 'POST',
      body: JSON.stringify({ session_token: token, ...(body || {}) }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await handler(req);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
const USERS = {
  staff: { email: 'staff@x.test', full_name: 'Staff Person', role: 'user' },
  other: { email: 'other@x.test', full_name: 'Other Staff', role: 'user' },
  editor: { email: 'editor@x.test', full_name: 'Sop Editor', role: 'user' },
  admin: { email: 'admin@x.test', full_name: 'Boss Admin', role: 'admin' },
};
const SESSIONS = {
  'tok-staff': USERS.staff,
  'tok-other': USERS.other,
  'tok-editor': USERS.editor,
  'tok-admin': USERS.admin,
};

const STAFF_ROSTER = [
  { id: 'ae1', email: 'staff@x.test', full_name: 'Staff Person', is_deactivated: false, updated_date: 'a1' },
  { id: 'ae2', email: 'other@x.test', full_name: 'Other Staff', is_deactivated: false, updated_date: 'a2' },
  { id: 'ae3', email: 'gone@x.test', full_name: 'Gone Person', is_deactivated: true, updated_date: 'a3' },
  { id: 'ae4', email: 'newbie@x.test', name: 'New Person', is_deactivated: false, updated_date: 'a4' },
  { id: 'ae5', email: 'pre@x.test', full_name: 'Pre Acked', is_deactivated: false, updated_date: 'a5' },
  { id: 'ae6', email: 'old@x.test', full_name: 'Old Ack', is_deactivated: false, updated_date: 'a6' },
];

const ITEMS = [
  { id: 'ti1', title: 'Read the router SOP', type: 'sop', sop_id: 's1', active: true, sort_order: 1, duration_minutes: 10, updated_date: 'tv1' },
  { id: 'ti2', title: 'Safety video', type: 'video', url: 'https://vids.test/safety', active: true, sort_order: 2, duration_minutes: 15, valid_months: 0, updated_date: 'tv2' },
  { id: 'ti3', title: 'Forklift cert', type: 'certification', valid_months: 12, active: true, sort_order: 3, updated_date: 'tv3' },
  { id: 'ti4', title: 'Retired item', type: 'custom', active: false, sort_order: 9, updated_date: 'tv4' },
  { id: 'ti5', title: 'Draft-SOP item', type: 'sop', sop_id: 's2', active: true, sort_order: 4, updated_date: 'tv5' },
];

const SOPS = [
  {
    id: 's1', title: 'Router daily checks', status: 'published', version: 2,
    acknowledged_viewers: [
      { email: 'pre@x.test', name: 'Pre Acked', version: 2, acknowledged_at: '2026-01-02T00:00:00Z' },
      { email: 'old@x.test', name: 'Old Ack', version: 1, acknowledged_at: '2025-12-01T00:00:00Z' },
    ],
    updated_date: 'sv1',
  },
  { id: 's2', title: 'Unpublished', status: 'draft', version: 1, acknowledged_viewers: [], updated_date: 'sv2' },
];

const ASSIGNMENTS = [
  { id: 'ta0', training_id: 'ti1', assignee_email: 'staff@x.test', status: 'pending', due_date: '', valid_months: 0, updated_date: 'tav0' },
  { id: 'ta1', training_id: 'ti2', assignee_email: 'staff@x.test', assignee_name: 'Staff Person', status: 'pending', due_date: '2000-01-01', valid_months: 0, updated_date: 'tav1' },
  { id: 'ta2', training_id: 'ti3', assignee_email: 'staff@x.test', assignee_name: 'Staff Person', status: 'pending', valid_months: 12, updated_date: 'tav2' },
  { id: 'ta3', training_id: 'ti2', assignee_email: 'staff@x.test', status: 'cancelled', valid_months: 0, updated_date: 'tav3' },
  { id: 'ta4', training_id: 'ti2', assignee_email: 'staff@x.test', status: 'completed', completed_at: '2025-01-01T00:00:00Z', expires_at: '2000-01-01T00:00:00Z', completed_method: 'self', valid_months: 0, updated_date: 'tav4' },
  { id: 'ta5', training_id: 'ti2', assignee_email: 'other@x.test', assignee_name: 'Other Staff', status: 'pending', valid_months: 0, updated_date: 'tav5' },
];

const fixture = ({
  items = ITEMS,
  sops = SOPS,
  assignments = ASSIGNMENTS,
  staff = STAFF_ROSTER,
  settings = { editor_emails: ['editor@x.test'] },
} = {}) => {
  const entities = {
    TrainingItem: makeEntity(items, 'ti'),
    TrainingAssignment: makeEntity(assignments, 'ta'),
    Sop: makeEntity(sops, 'sop'),
    AuthorizedEmail: makeEntity(staff, 'ae'),
    GlobalSettings: makeEntity(
      settings === null ? [] : [{ id: 'gs1', setting_key: 'sopModuleSettings', setting_value: structuredClone(settings), updated_date: 'gsv1' }],
      'gs',
    ),
  };
  const call = loadEntry({ entities, sessions: SESSIONS });
  return { entities, call };
};

const verOf = (entity, id) => entity.rows.find((r) => r.id === id).updated_date;

// ===========================================================================
// auth gate + default action
// ===========================================================================
{
  const f = fixture();
  eq((await f.call({ action: 'bootstrap' }, 'bogus')).status, 401, 'bad session -> 401');
  const res = await f.call({}, 'tok-staff');
  eq(res.status, 200, 'no action defaults to bootstrap');
  ok(Array.isArray(res.body.my_assignments), 'default action returns my_assignments');
}

// ===========================================================================
// bootstrap — staff lens
// ===========================================================================
{
  const f = fixture();
  const res = await f.call({ action: 'bootstrap' }, 'tok-staff');
  eq(res.status, 200);
  deq(res.body.me, { email: 'staff@x.test', name: 'Staff Person', role: 'user', canEdit: false }, 'staff me payload');
  eq(res.body.items, undefined, 'staff payload has no items key');
  eq(res.body.assignments, undefined, 'staff payload has no assignments key');
  eq(res.body.staff, undefined, 'staff payload has no staff roster');
  const mine = res.body.my_assignments.map((a) => a.id).sort();
  deq(mine, ['ta0', 'ta1', 'ta2', 'ta4'], 'staff sees own rows minus cancelled');
  eq(res.body.my_assignments.find((a) => a.id === 'ta1').overdue, true, 'past-due pending -> overdue');
  eq(res.body.my_assignments.find((a) => a.id === 'ta0').overdue, false, 'no due date -> not overdue');
  eq(res.body.my_assignments.find((a) => a.id === 'ta4').renewal_due, true, 'expired completed -> renewal_due');
  eq(res.body.my_assignments.find((a) => a.id === 'ta1').renewal_due, false, 'pending row never renewal_due');

  const mine2 = await f.call({ action: 'my_assignments' }, 'tok-other');
  deq(mine2.body.my_assignments.map((a) => a.id), ['ta5'], 'my_assignments alias scopes to the caller');
}

// bootstrap — editor lens
{
  const f = fixture();
  const res = await f.call({ action: 'bootstrap' }, 'tok-editor');
  eq(res.status, 200);
  eq(res.body.me.canEdit, true, 'named editor canEdit');
  deq(res.body.items.map((i) => i.id).sort(), ['ti1', 'ti2', 'ti3', 'ti4', 'ti5'],
    'editor gets every item — including inactive (no `active` filter)');
  const all = res.body.assignments.map((a) => a.id).sort();
  deq(all, ['ta0', 'ta1', 'ta2', 'ta3', 'ta4', 'ta5'], 'editor sees all assignments — cancelled included');
  const staffEmails = res.body.staff.map((s) => s.email).sort();
  deq(staffEmails, ['newbie@x.test', 'old@x.test', 'other@x.test', 'pre@x.test', 'staff@x.test'],
    'staff roster excludes deactivated accounts');
  eq(res.body.staff.find((s) => s.email === 'newbie@x.test').name, 'New Person', 'roster prefers name over full_name');

  const ad = await f.call({ action: 'bootstrap' }, 'tok-admin');
  eq(ad.body.me.canEdit, true, 'admin canEdit via role');
}

// ===========================================================================
// item_create
// ===========================================================================
{
  const f = fixture();
  eq((await f.call({ action: 'item_create', item: { title: 'X', type: 'video' } }, 'tok-staff')).status,
    403, 'staff item_create -> 403');
  eq((await f.call({ action: 'item_create', item: { title: 'SOP link', type: 'sop' } }, 'tok-editor')).status,
    400, 'sop item without sop_id -> 400');
  eq((await f.call({ action: 'item_create', item: { type: 'video' } }, 'tok-editor')).status,
    400, 'missing title -> 400');

  const res = await f.call({
    action: 'item_create', creation_request_key: 'ick-1',
    item: { title: 'New video', type: 'video', url: 'https://vids.test/new', duration_minutes: 5, valid_months: 99 },
  }, 'tok-editor');
  eq(res.status, 200);
  eq(res.body.status, 'created');
  eq(res.body.record.title, 'New video');
  eq(res.body.record.valid_months, 0, 'valid_months zeroed off certification type');
  eq(res.body.record.active, true, 'new items default active');

  const cert = await f.call({
    action: 'item_create',
    item: { title: 'Hazmat cert', type: 'certification', valid_months: 24 },
  }, 'tok-editor');
  eq(cert.body.record.valid_months, 24, 'certification keeps valid_months');

  const dupe = await f.call({
    action: 'item_create', creation_request_key: 'ick-1',
    item: { title: 'New video', type: 'video' },
  }, 'tok-editor');
  eq(dupe.body.status, 'deduplicated', 'same request key dedupes');
  eq(dupe.body.record.id, res.body.record.id);

  const sopItem = await f.call({ action: 'item_create', item: { title: 'SOP item', type: 'sop', sop_id: 's1' } }, 'tok-editor');
  eq(sopItem.status, 200, 'sop item with sop_id validates');
  eq(sopItem.body.record.sop_id, 's1');

  // Lost create response — recovery matches on {title, type}.
  f.entities.TrainingItem.hooks.create = async (d) => {
    f.entities.TrainingItem.rows.push({ ...structuredClone(d), id: 'tiLost', updated_date: 'tvL', created_date: 'x' });
    throw new Error('synthetic lost response');
  };
  const rec = await f.call({ action: 'item_create', item: { title: 'Recovered', type: 'custom' } }, 'tok-editor');
  eq(rec.status, 200);
  eq(rec.body.status, 'recovered_after_response_loss');
  eq(rec.body.record.id, 'tiLost');
}

// ===========================================================================
// item_update — CAS
// ===========================================================================
{
  const f = fixture();
  const res = await f.call({
    action: 'item_update', id: 'ti2', expected_updated_date: 'tv2',
    item: { title: 'Safety video v2', type: 'video', url: 'https://vids.test/v2' },
  }, 'tok-editor');
  eq(res.status, 200);
  eq(res.body.record.title, 'Safety video v2', 'item updated');
  eq((await f.call({
    action: 'item_update', id: 'ti2', expected_updated_date: 'stale',
    item: { title: 'x', type: 'video' },
  }, 'tok-editor')).status, 409, 'stale item version -> 409');
  eq((await f.call({
    action: 'item_update', id: 'ti2', item: { title: 'x', type: 'video' },
  }, 'tok-editor')).status, 400, 'missing version -> 400');
  eq((await f.call({
    action: 'item_update', id: 'gone', expected_updated_date: 'x', item: { title: 'x', type: 'video' },
  }, 'tok-editor')).status, 404, 'missing item -> 404');
  eq((await f.call({
    action: 'item_update', id: 'ti2', expected_updated_date: verOf(f.entities.TrainingItem, 'ti2'),
    item: { title: 'x', type: 'sop' },
  }, 'tok-editor')).status, 400, 'sop update without sop_id -> 400');
}

// ===========================================================================
// assign — the big one
// ===========================================================================
{
  const f = fixture();
  eq((await f.call({ action: 'assign', training_id: 'ti2', emails: ['newbie@x.test'] }, 'tok-staff')).status,
    403, 'staff assign -> 403');
  eq((await f.call({ action: 'assign', training_id: 'gone', emails: ['newbie@x.test'] }, 'tok-editor')).status,
    404, 'missing item -> 404');
  eq((await f.call({ action: 'assign', training_id: 'ti4', emails: ['newbie@x.test'] }, 'tok-editor')).status,
    400, 'inactive item -> 400');
  eq((await f.call({ action: 'assign', training_id: 'ti5', emails: ['newbie@x.test'] }, 'tok-editor')).status,
    400, 'sop item linked to a draft SOP -> 400');
  const badSop = await f.call({ action: 'assign', training_id: 'ti5', emails: ['newbie@x.test'] }, 'tok-editor');
  ok(/not published|missing/i.test(badSop.body.error), 'draft-linked SOP error explained');
  eq((await f.call({ action: 'assign', training_id: 'ti2', emails: [] }, 'tok-editor')).status,
    400, 'no emails -> 400');
  eq((await f.call({ action: 'assign', training_id: 'ti2', emails: ['not-an-email'] }, 'tok-editor')).status,
    400, 'only invalid emails -> 400');

  // Main assign pass over the sop item ti1 (linked s1, published, version 2):
  //  - staff@x.test has pending ta0 -> skipped
  //  - gone@x.test is deactivated -> skipped
  //  - pre@x.test acked version 2 -> created completed/sop_ack
  //  - old@x.test acked version 1 -> created pending (re-read required)
  //  - newbie@x.test -> created pending
  //  - NOT-AN-EMAIL dropped silently
  const res = await f.call({
    action: 'assign', training_id: 'ti1', assign_key: 'k9', due_date: '2026-12-31', notes: 'please read',
    emails: ['staff@x.test', 'gone@x.test', 'pre@x.test', 'old@x.test', 'newbie@x.test', 'NOT-AN-EMAIL', 'newbie@x.test'],
  }, 'tok-editor');
  eq(res.status, 200, 'assign 200');
  deq(res.body.skipped.sort(), ['gone@x.test', 'staff@x.test'],
    'existing pending + deactivated staff skipped');
  eq(res.body.created.length, 3, 'three assignments created');
  const byEmail = Object.fromEntries(res.body.created.map((r) => [r.assignee_email, r]));
  eq(byEmail['pre@x.test'].status, 'completed', 'pre-acked assignee closes immediately');
  eq(byEmail['pre@x.test'].completed_method, 'sop_ack', 'pre-ack method sop_ack');
  ok(byEmail['pre@x.test'].completed_at, 'pre-ack completed_at set');
  eq(byEmail['old@x.test'].status, 'pending', 'old-version ack is not a current ack');
  eq(byEmail['newbie@x.test'].status, 'pending');
  eq(byEmail['newbie@x.test'].assignee_name, 'New Person', 'name resolved from roster');
  eq(byEmail['newbie@x.test'].assigned_by, 'editor@x.test', 'assigner recorded');
  eq(byEmail['newbie@x.test'].due_date, '2026-12-31', 'due date carried');
  eq(byEmail['newbie@x.test'].training_title, 'Read the router SOP', 'item fields copied');
  eq(byEmail['newbie@x.test'].sop_id, 's1');
  eq(byEmail['newbie@x.test'].creation_request_key, 'ti1:newbie@x.test:k9', 'assign_key joins the dedupe key');

  // Retry the identical call: pending rows now skip; the completed pre-ack
  // row dedupes on request key instead of duplicating.
  const rowsBefore = f.entities.TrainingAssignment.rows.length;
  const retry = await f.call({
    action: 'assign', training_id: 'ti1', assign_key: 'k9',
    emails: ['pre@x.test', 'newbie@x.test'],
  }, 'tok-editor');
  eq(retry.status, 200);
  deq(retry.body.skipped, ['newbie@x.test'], 'existing pending now skips');
  eq(retry.body.created.length, 1, 'pre-ack retry dedupes into created');
  eq(retry.body.created[0].id, byEmail['pre@x.test'].id, 'dedupe returns the same completed row');
  eq(f.entities.TrainingAssignment.rows.length, rowsBefore, 'no duplicate assignment written');

  // A different assign_key is a different submission — fresh dedupe scope.
  const again = await f.call({
    action: 'assign', training_id: 'ti3', assign_key: 'round-2', emails: ['newbie@x.test'],
  }, 'tok-admin');
  eq(again.status, 200, 'admin may assign');
  eq(again.body.created[0].creation_request_key, 'ti3:newbie@x.test:round-2');
}

// ===========================================================================
// complete — self / editor / expiry math / guards
// ===========================================================================
{
  const f = fixture();
  // self-complete
  const self = await f.call({ action: 'complete', id: 'ta1', expected_updated_date: 'tav1' }, 'tok-staff');
  eq(self.status, 200, 'assignee completes own row');
  eq(self.body.record.status, 'completed');
  eq(self.body.record.completed_method, 'self');
  eq(self.body.record.expires_at, '', 'no valid_months -> empty expiry');

  // other staff can never complete someone else's row
  eq((await f.call({ action: 'complete', id: 'ta2', expected_updated_date: 'tav2' }, 'tok-other')).status,
    403, 'other staff complete -> 403');

  // editor completes on someone's behalf
  const mgr = await f.call({ action: 'complete', id: 'ta2', expected_updated_date: 'tav2' }, 'tok-editor');
  eq(mgr.status, 200);
  eq(mgr.body.record.completed_method, 'manager', 'editor completion is a manager mark');
  ok(mgr.body.record.expires_at, 'cert item produced an expiry');
  const deltaMs = new Date(mgr.body.record.expires_at) - new Date(mgr.body.record.completed_at);
  const expectedMs = (() => { const d = new Date(mgr.body.record.completed_at); d.setMonth(d.getMonth() + 12); return d - new Date(mgr.body.record.completed_at); })();
  eq(deltaMs, expectedMs, 'expiry = completed_at + valid_months');

  // already-terminal rows return early unchanged
  const done = await f.call({ action: 'complete', id: 'ta4', expected_updated_date: 'whatever' }, 'tok-staff');
  eq(done.status, 200);
  eq(done.body.record.status, 'completed', 'completed row returns as-is');
  eq(done.body.record.completed_at, '2025-01-01T00:00:00Z', 'no rewrite on early return');
  const cancelled = await f.call({ action: 'complete', id: 'ta3', expected_updated_date: 'x' }, 'tok-staff');
  eq(cancelled.body.record.status, 'cancelled', 'cancelled row untouched');

  // guards
  eq((await f.call({ action: 'complete', id: 'missing', expected_updated_date: 'x' }, 'tok-staff')).status,
    404, 'missing assignment -> 404');
  eq((await f.call({ action: 'complete', id: 'ta0', expected_updated_date: 'stale' }, 'tok-staff')).status,
    409, 'stale version -> 409');
  eq((await f.call({ action: 'complete', id: 'ta0' }, 'tok-staff')).status,
    400, 'missing version -> 400');
  eq((await f.call({ action: 'complete', id: 'ta5', expected_updated_date: 'tav5' }, 'tok-staff')).status,
    403, 'staff cannot complete another assignee’s row');
}

// ===========================================================================
// cancel / reopen — completion fields always cleared
// ===========================================================================
{
  const f = fixture();
  eq((await f.call({ action: 'cancel', id: 'ta1', expected_updated_date: 'tav1' }, 'tok-staff')).status,
    403, 'staff cancel -> 403');
  const res = await f.call({ action: 'cancel', id: 'ta4', expected_updated_date: 'tav4' }, 'tok-editor');
  eq(res.status, 200);
  eq(res.body.record.status, 'cancelled');
  eq(res.body.record.completed_at, null, 'cancel clears completed_at');
  eq(res.body.record.completed_method, null, 'cancel clears completed_method');
  eq(res.body.record.expires_at, null, 'cancel clears expires_at');

  const back = await f.call({ action: 'reopen', id: 'ta4', expected_updated_date: verOf(f.entities.TrainingAssignment, 'ta4') }, 'tok-editor');
  eq(back.body.record.status, 'pending', 'reopen restores pending');
  eq(back.body.record.completed_at, null, 'reopen keeps fields cleared');

  eq((await f.call({ action: 'cancel', id: 'gone', expected_updated_date: 'x' }, 'tok-editor')).status,
    404, 'missing assignment -> 404');
  eq((await f.call({ action: 'cancel', id: 'ta1', expected_updated_date: 'stale' }, 'tok-editor')).status,
    409, 'stale version -> 409');
}

// ===========================================================================
// report — by_item grouping
// ===========================================================================
{
  const f = fixture();
  eq((await f.call({ action: 'report' }, 'tok-staff')).status, 403, 'staff report -> 403');
  const res = await f.call({ action: 'report' }, 'tok-editor');
  eq(res.status, 200);
  eq(res.body.total, 6, 'all assignment rows counted');
  const g1 = res.body.by_item.ti1;
  eq(g1.pending, 1, 'ti1 one pending');
  eq(g1.completed, 0);
  eq(g1.item.id, 'ti1', 'group joined to its item');
  const g2 = res.body.by_item.ti2;
  eq(g2.pending, 2, 'ti2 two pending (staff + other)');
  eq(g2.completed, 1, 'ti2 one completed');
  eq(g2.overdue, 1, 'ta1 past-due counts overdue');
  ok(Array.isArray(res.body.items), 'items list rides the report');
}

// ===========================================================================
// item_delete — admin-only; deactivate-with-history vs real delete
// ===========================================================================
{
  const f = fixture();
  eq((await f.call({ action: 'item_delete', id: 'ti2', expected_updated_date: 'tv2' }, 'tok-editor')).status,
    403, 'named editor item_delete -> 403');
  eq((await f.call({ action: 'item_delete' }, 'tok-admin')).status,
    400, 'missing id -> 400');

  // ti2 has assignments -> deactivate, never delete
  const res = await f.call({ action: 'item_delete', id: 'ti2', expected_updated_date: 'tv2' }, 'tok-admin');
  eq(res.status, 200);
  eq(res.body.deactivated, true, 'item with history deactivates');
  eq(res.body.record.active, false);
  eq(f.entities.TrainingItem.rows.some((r) => r.id === 'ti2'), true, 'row retained for history');

  // stale version on the deactivate path still conflicts
  eq((await f.call({ action: 'item_delete', id: 'ti1', expected_updated_date: 'stale' }, 'tok-admin')).status,
    409, 'stale deactivate -> 409');
  eq(f.entities.TrainingItem.rows.find((r) => r.id === 'ti1').active, true, 'stale delete never deactivated');

  // no assignments -> real delete (deleting ti5 requires removing linkage? — ti5
  // has no assignments in the fixture so it deletes outright)
  const gone = await f.call({ action: 'item_delete', id: 'ti5' }, 'tok-admin');
  eq(gone.status, 200);
  eq(gone.body.deleted, true, 'unused item deleted outright');
  eq(gone.body.deactivated, undefined);
  eq(f.entities.TrainingItem.rows.some((r) => r.id === 'ti5'), false, 'row removed');
}

// ===========================================================================
// unknown action
// ===========================================================================
{
  const f = fixture();
  eq((await f.call({ action: 'explode' }, 'tok-editor')).status, 400, 'unknown action -> 400');
  eq((await f.call({ action: 'explode' }, 'tok-staff')).status, 403, 'staff unknown action hits the editor gate');
}

console.log(`PASS training-module (${CASES} assertions)`);
