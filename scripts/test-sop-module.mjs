// Executable hardening test for base44/functions/manageSops/entry.ts.
//
// Follows the test-automation-behavior.mjs convention: the entry is
// transpiled to CommonJS under Node, `npm:@base44/sdk` + the shared helpers
// are stubbed through a custom require, the Deno.serve handler is invoked
// with synthetic Request objects, and entity access is served by in-memory
// stores that honor query predicates + updated_date CAS. No Base44
// credentials, network calls, or production data are touched.
//
// Coverage per op:
//   bootstrap/list/get   — non-editor: drafts+archived hidden, suggestions
//                          stripped, acknowledged_viewers trimmed to own
//                          rows; editor sees everything; 401 unauthenticated.
//   create               — editor-only, dedupe on creation_request_key,
//                          recovery after lost create response, ambiguous
//                          recovery -> 409.
//   update               — CAS conflict -> 409, missing version -> 400,
//                          version bumps ONLY on reader-visible content
//                          (not pinned/category/sort/tags), published SOP
//                          cannot be saved with zero steps, draft content
//                          edits never bump.
//   acknowledge          — appends the viewer row, completes a pending
//                          TrainingAssignment via sop_ack, already-acked at
//                          the current version early-returns, an old-version
//                          ack is NOT an ack, CAS exhaustion -> 409,
//                          CAS retry recovery, non-published -> 404.
//   suggest_edit         — any staff on published, draft -> 404, missing
//                          text -> 400, CAS exhaustion -> 409.
//   resolve_suggestion   — editor resolves/dismisses; staff -> 403.
//   set_status           — transitions work, publish of a 0-step SOP -> 400,
//                          unknown status -> 400, stale version -> 409.
//   delete               — admin-only, CAS-guarded real delete, already
//                          absent -> already_absent, linked sop-type
//                          TrainingItems deactivated.
//   ack_report           — admin-only, deactivated staff excluded from
//                          roster/pending, version-aware pending list, only
//                          published+requires_ack rows reported.
//   save_settings        — admin-only, create path when no record, CAS on
//                          existing record, cleaner dedupes/ensures 'other'.
//   unknown action       — 400.
//
// Run: node scripts/test-sop-module.mjs  ->  prints "PASS sop-module"
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require2 = createRequire(pathToFileURL(path.resolve(root, 'package.json')));
const ts = require2('typescript');
// Keep the shared pagedEntityRows dev-warning quiet under Node — counters
// still accumulate internally, they just don't console.warn per call.
globalThis.__READ_BUDGET_TELEMETRY = false;

let CASES = 0;
const eq = (a, b, msg) => { CASES += 1; assert.equal(a, b, msg); };
const deq = (a, b, msg) => { CASES += 1; assert.deepEqual(a, b, msg); };
const ok = (v, msg) => { CASES += 1; assert.ok(v, msg); };

// ---------------------------------------------------------------------------
// In-memory entity — filter/list/get/create/update/updateMany/delete with
// predicate matching and updated_date CAS semantics (updateMany returns
// {updated: n}; every successful write bumps updated_date).
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
    hooks: {}, // optional: create(data), updateMany(q,u) — override to inject failures
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
// Module loader — transpile entry.ts to CJS, stub sdk + shared imports,
// capture the Deno.serve handler.
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
  new Function('require', 'module', 'exports', 'Deno', transpile('base44/functions/manageSops/entry.ts'))(
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
    const req = new Request('https://sops.synthetic.invalid/', {
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
  editor: { email: 'editor@x.test', full_name: 'Sop Editor', role: 'user' },
  admin: { email: 'admin@x.test', full_name: 'Boss Admin', role: 'admin' },
  other: { email: 'other@x.test', full_name: 'Other Staff', role: 'user' },
};
const SESSIONS = {
  'tok-staff': USERS.staff,
  'tok-editor': USERS.editor,
  'tok-admin': USERS.admin,
  'tok-other': USERS.other,
};

const SOP_FIXTURE = [
  {
    id: 's1', title: 'Router daily checks', status: 'published', version: 2,
    category: 'cnc_router', summary: 'AM checks', cover_image_url: '',
    steps: [{ id: 'st1', title: 'Power on', body: 'do it', images: [], video_url: '', external_video_url: '' }],
    safety_notes: ['PPE'], attachments: [], tags: ['cnc'],
    estimated_minutes: 10, requires_ack: true, pinned: false, sort_order: 1,
    suggestions: [{ id: 'sg1', email: 'staff@x.test', name: 'Staff Person', step_id: '', text: 'clarify step 1', status: 'open', created_at: '2026-01-01T00:00:00Z' }],
    acknowledged_viewers: [
      { email: 'staff@x.test', name: 'Staff Person', version: 2, acknowledged_at: '2026-01-02T00:00:00Z' },
      { email: 'other@x.test', name: 'Other Staff', version: 1, acknowledged_at: '2025-12-01T00:00:00Z' },
      { email: 'ghost@x.test', name: 'Ghost', version: 2, acknowledged_at: '2026-01-03T00:00:00Z' },
    ],
    created_by_email: 'admin@x.test', updated_by_email: 'admin@x.test',
    updated_date: 'sv1', created_date: '2026-01-01T00:00:00Z',
  },
  {
    id: 's2', title: 'Draft SOP', status: 'draft', version: 1, category: 'design',
    steps: [{ id: 'a', title: 'draft step', body: '', images: [], video_url: '', external_video_url: '' }],
    suggestions: [], acknowledged_viewers: [], requires_ack: false,
    updated_date: 'sv2', created_date: '2026-01-02T00:00:00Z',
  },
  {
    id: 's3', title: 'Empty draft', status: 'draft', version: 1, category: 'other',
    steps: [], suggestions: [], acknowledged_viewers: [], requires_ack: false,
    updated_date: 'sv3', created_date: '2026-01-03T00:00:00Z',
  },
  {
    id: 's4', title: 'Archived SOP', status: 'archived', version: 1, category: 'other',
    steps: [{ id: 'z', title: 'old', body: '', images: [] }],
    suggestions: [], acknowledged_viewers: [], requires_ack: false,
    updated_date: 'sv4', created_date: '2026-01-04T00:00:00Z',
  },
];

const fixture = ({
  sops = SOP_FIXTURE,
  settings = { editor_emails: ['editor@x.test'] },
  settingsDate = 'gsv1',
  staff = [],
  assignments = [],
  items = [],
} = {}) => {
  const entities = {
    Sop: makeEntity(sops, 'sop'),
    GlobalSettings: makeEntity(
      settings === null ? [] : [{ id: 'gs1', setting_key: 'sopModuleSettings', setting_value: structuredClone(settings), updated_date: settingsDate }],
      'gs',
    ),
    AuthorizedEmail: makeEntity(staff, 'ae'),
    TrainingAssignment: makeEntity(assignments, 'ta'),
    TrainingItem: makeEntity(items, 'ti'),
  };
  const call = loadEntry({ entities, sessions: SESSIONS });
  return { entities, call };
};

const STAFF_ROSTER = [
  { id: 'ae1', email: 'staff@x.test', full_name: 'Staff Person', is_deactivated: false, updated_date: 'a1' },
  { id: 'ae2', email: 'other@x.test', full_name: 'Other Staff', is_deactivated: false, updated_date: 'a2' },
  { id: 'ae3', email: 'gone@x.test', full_name: 'Gone Person', is_deactivated: true, updated_date: 'a3' },
  { id: 'ae4', email: 'editor@x.test', full_name: 'Sop Editor', is_deactivated: false, updated_date: 'a4' },
  { id: 'ae5', email: 'admin@x.test', full_name: 'Boss Admin', is_deactivated: false, updated_date: 'a5' },
];

// ===========================================================================
// auth gate
// ===========================================================================
{
  const f = fixture();
  eq((await f.call({ action: 'bootstrap' }, 'bogus')).status, 401, 'bad session -> 401');
  eq((await f.call({ action: 'bootstrap' }, null)).status, 401, 'missing session -> 401');
}

// ===========================================================================
// bootstrap
// ===========================================================================
{
  const f = fixture();
  const res = await f.call({ action: 'bootstrap' }, 'tok-staff');
  eq(res.status, 200, 'staff bootstrap 200');
  deq(res.body.sops.map((s) => s.id), ['s1'], 'staff sees only published');
  deq(res.body.sops[0].suggestions, [], 'staff payload strips suggestions');
  deq(res.body.sops[0].acknowledged_viewers.map((v) => v.email), ['staff@x.test'],
    'acknowledged_viewers trimmed to the viewer’s own rows');
  eq(res.body.me.canEdit, false, 'staff me.canEdit false');
  eq(res.body.me.email, 'staff@x.test');
  eq(res.body.me.role, 'user');
  eq(res.body.me.name, 'Staff Person');
  eq(res.body.settings_updated_date, 'gsv1', 'settings version rides the payload');
  ok(Array.isArray(res.body.settings.categories), 'settings.categories present');
  ok(res.body.settings.editor_emails.includes('editor@x.test'), 'settings editor list present');

  const ed = await f.call({ action: 'bootstrap' }, 'tok-editor');
  eq(ed.status, 200);
  deq(ed.body.sops.map((s) => s.id).sort(), ['s1', 's2', 's3', 's4'], 'editor sees drafts + archived too');
  eq(ed.body.sops.find((s) => s.id === 's1').suggestions.length, 1, 'editor sees suggestions');
  eq(ed.body.sops.find((s) => s.id === 's1').acknowledged_viewers.length, 3, 'editor sees every ack row');
  eq(ed.body.me.canEdit, true, 'named editor canEdit');

  const ad = await f.call({ action: 'bootstrap' }, 'tok-admin');
  eq(ad.body.me.canEdit, true, 'admin canEdit via role');
}

// list + get share the same visibility/projection rules
{
  const f = fixture();
  const lst = await f.call({ action: 'list' }, 'tok-staff');
  deq(lst.body.sops.map((s) => s.id), ['s1'], 'staff list = published only');
  eq((await f.call({ action: 'get', id: 's2' }, 'tok-staff')).status, 404, 'staff get draft -> 404');
  eq((await f.call({ action: 'get', id: 'missing' }, 'tok-editor')).status, 404, 'get missing -> 404');
  const got = await f.call({ action: 'get', id: 's1' }, 'tok-staff');
  eq(got.status, 200);
  deq(got.body.sop.acknowledged_viewers.map((v) => v.email), ['staff@x.test'], 'get trims viewers for staff');
}

// ===========================================================================
// create
// ===========================================================================
{
  const f = fixture();
  const data = { title: 'New SOP', category: 'design', steps: [{ title: 'one', body: 'b' }], requires_ack: true };
  const res = await f.call({ action: 'create', data, creation_request_key: 'ck-1' }, 'tok-editor');
  eq(res.status, 200, 'create 200');
  eq(res.body.status, 'created', 'create verified status');
  eq(res.body.record.status, 'draft', 'new SOP starts as draft');
  eq(res.body.record.version, 1);
  eq(res.body.record.created_by_email, 'editor@x.test');
  eq(res.body.record.creation_request_key, 'ck-1');
  deq(res.body.record.acknowledged_viewers, []);
  const count = f.entities.Sop.rows.length;

  const dupe = await f.call({ action: 'create', data, creation_request_key: 'ck-1' }, 'tok-editor');
  eq(dupe.body.status, 'deduplicated', 'same request key dedupes');
  eq(dupe.body.record.id, res.body.record.id, 'dedupe returns the original row');
  eq(f.entities.Sop.rows.length, count, 'no duplicate row written');

  // Lost create response: the row persisted but the SDK reported failure —
  // recovery must find the single new matching row instead of duplicating.
  f.entities.Sop.hooks.create = async (d) => {
    const row = { ...structuredClone(d), id: 'sLost', updated_date: 'svLost', created_date: '2026-02-01T00:00:00Z' };
    f.entities.Sop.rows.push(row);
    throw new Error('synthetic lost response');
  };
  const rec = await f.call({ action: 'create', data: { title: 'Recovered SOP', steps: [{ title: 'x' }] }, creation_request_key: 'ck-2' }, 'tok-editor');
  eq(rec.status, 200, 'recovery returns 200');
  eq(rec.body.status, 'recovered_after_response_loss', 'lost create recovered');
  eq(rec.body.record.id, 'sLost');

  // Two indistinguishable new rows can never be resolved -> hard conflict.
  f.entities.Sop.hooks.create = async (d) => {
    for (const id of ['sAmb1', 'sAmb2']) {
      f.entities.Sop.rows.push({ ...structuredClone(d), id, updated_date: `v-${id}`, created_date: '2026-02-02T00:00:00Z' });
    }
    throw new Error('synthetic lost response');
  };
  const amb = await f.call({ action: 'create', data: { title: 'Ambiguous SOP' }, creation_request_key: 'ck-3' }, 'tok-editor');
  eq(amb.status, 409, 'ambiguous recovery -> 409');
  ok(/ambiguous/i.test(amb.body.error), 'ambiguity explained');

  // Validation + gate.
  eq((await f.call({ action: 'create', data: { title: ' ' } }, 'tok-editor')).status, 400, 'title required');
  eq((await f.call({ action: 'create', data }, 'tok-staff')).status, 403, 'staff create -> 403');
}

// ===========================================================================
// update — CAS + version-bump semantics
// ===========================================================================
{
  const f = fixture();
  const ver = () => f.entities.Sop.rows.find((r) => r.id === 's1').updated_date;

  // Content change on a published SOP bumps the reader version.
  const bump = await f.call({
    action: 'update', id: 's1', expected_updated_date: ver(),
    next_fields: { title: 'Router morning checks' },
  }, 'tok-editor');
  eq(bump.status, 200, 'content update 200');
  eq(bump.body.version_bumped, true, 'content change bumps version');
  eq(bump.body.record.version, 3, 'published version 2 -> 3');
  eq(bump.body.record.updated_by_email, 'editor@x.test');

  // Non-content fields must NOT force staff re-reads.
  for (const nf of [{ pinned: true }, { category: 'installation' }, { sort_order: 9 }, { tags: ['x', 'y'] }]) {
    const cur = ver();
    const res = await f.call({ action: 'update', id: 's1', expected_updated_date: cur, next_fields: nf }, 'tok-editor');
    eq(res.status, 200, `non-content update ${JSON.stringify(nf)}`);
    eq(res.body.version_bumped, false, `no bump for ${JSON.stringify(nf)}`);
    eq(res.body.record.version, 3, 'version holds at 3');
  }

  // Draft content edits never bump.
  const dver = () => f.entities.Sop.rows.find((r) => r.id === 's2').updated_date;
  const draft = await f.call({
    action: 'update', id: 's2', expected_updated_date: dver(),
    next_fields: { title: 'Draft v2', steps: [{ title: 'changed', body: 'x' }] },
  }, 'tok-editor');
  eq(draft.status, 200);
  eq(draft.body.version_bumped, false, 'draft content change does not bump');
  eq(draft.body.record.version, 1);

  // A live SOP can never end up step-less via update.
  const zero = await f.call({
    action: 'update', id: 's1', expected_updated_date: ver(), next_fields: { steps: [] },
  }, 'tok-editor');
  eq(zero.status, 400, 'published SOP cannot save with zero steps');
  ok(/at least one step/i.test(zero.body.error));

  // CAS + version guards.
  eq((await f.call({ action: 'update', id: 's1', expected_updated_date: 'stale', next_fields: { title: 'x' } }, 'tok-editor')).status,
    409, 'stale updated_date -> 409');
  eq((await f.call({ action: 'update', id: 's1', next_fields: { title: 'x' } }, 'tok-editor')).status,
    400, 'missing expected_updated_date -> 400');
  eq((await f.call({ action: 'update', id: 'gone', expected_updated_date: 'x', next_fields: { title: 'x' } }, 'tok-editor')).status,
    404, 'missing SOP -> 404');
  eq((await f.call({ action: 'update', id: 's1', expected_updated_date: ver(), next_fields: { title: 'x' } }, 'tok-staff')).status,
    403, 'staff update -> 403');
}

// ===========================================================================
// acknowledge
// ===========================================================================
{
  const assignments = [
    { id: 'ta1', training_id: 'ti1', sop_id: 's1', assignee_email: 'newbie@x.test', status: 'pending', valid_months: 6, updated_date: 'tav1' },
    { id: 'ta2', training_id: 'ti1', sop_id: 's1', assignee_email: 'newbie@x.test', status: 'cancelled', valid_months: 6, updated_date: 'tav2' },
  ];
  const f = fixture({ assignments });
  const res = await f.call({ action: 'acknowledge', id: 's1' }, 'tok-other');
  eq(res.status, 200, 'ack 200');
  eq(res.body.acknowledged, true);
  eq(res.body.already_acknowledged, undefined, 'fresh ack has no already flag');
  const row = f.entities.Sop.rows.find((r) => r.id === 's1');
  const mine = row.acknowledged_viewers.filter((v) => v.email === 'other@x.test');
  // other@ carried a stale version-1 ack — the new version-2 ack joins it,
  // it does not replace it (history is preserved for the audit trail).
  deq(mine.map((v) => v.version), [1, 2], 'viewer appended once at the current version');
  eq(mine[1].version, 2, 'ack stamped at the current version');
  ok(mine[1].acknowledged_at, 'ack timestamp recorded');
  // staff-facing payload still trims viewers to the acker's own rows
  deq(res.body.sop.acknowledged_viewers.map((v) => v.email), ['other@x.test', 'other@x.test'],
    'ack response trims viewers');

  // already-acked at this version -> early return, no extra row
  const again = await f.call({ action: 'acknowledge', id: 's1' }, 'tok-other');
  eq(again.status, 200);
  eq(again.body.already_acknowledged, true, 'second ack early-returns');
  eq(row.acknowledged_viewers.filter((v) => v.email === 'other@x.test').length, 2, 'no duplicate ack row');

  // staff@x.test acked version 2 already — same early return.
  const staffAck = await f.call({ action: 'acknowledge', id: 's1' }, 'tok-staff');
  eq(staffAck.body.already_acknowledged, true, 'prior version-2 ack honored');
}

// old-version ack does not count — a fresh ack lands
{
  const sops = structuredClone(SOP_FIXTURE);
  sops[0].acknowledged_viewers = [{ email: 'staff@x.test', name: 'S', version: 1, acknowledged_at: 'old' }];
  const f = fixture({ sops });
  const res = await f.call({ action: 'acknowledge', id: 's1' }, 'tok-staff');
  eq(res.body.acknowledged, true);
  eq(res.body.already_acknowledged, undefined, 'version-1 ack is not an ack for version 2');
  eq(f.entities.Sop.rows[0].acknowledged_viewers.length, 2, 'new version ack appended');
}

// pending TrainingAssignment closes via sop_ack (and stays put when cancelled)
{
  const assignments = [
    { id: 'ta1', training_id: 'ti1', sop_id: 's1', assignee_email: 'newbie@x.test', status: 'pending', valid_months: 6, updated_date: 'tav1' },
    { id: 'ta2', training_id: 'ti1', sop_id: 's1', assignee_email: 'newbie@x.test', status: 'cancelled', valid_months: 6, updated_date: 'tav2' },
  ];
  const sops = structuredClone(SOP_FIXTURE);
  sops[0].acknowledged_viewers = [];
  const f = fixture({ sops, assignments });
  const res = await f.call({ action: 'acknowledge', id: 's1' }, 'tok-other');
  // other@x.test has no assignment -> ta1 stays pending
  eq(res.status, 200);
  eq(f.entities.TrainingAssignment.rows.find((r) => r.id === 'ta1').status, 'pending', 'unrelated assignment untouched');

  sops[0].acknowledged_viewers = [];
  const f2 = fixture({ sops, assignments });
  await f2.call({ action: 'acknowledge', id: 's1' }, 'tok-staff');
  const ta1 = f2.entities.TrainingAssignment.rows.find((r) => r.id === 'ta1');
  // staff@x.test != assignee newbie@x.test — still untouched.
  eq(ta1.status, 'pending', 'ack only completes the acker’s own assignment');
}

// acker's own pending assignment completes with sop_ack + expiry
{
  const assignments = [
    { id: 'ta1', training_id: 'ti1', sop_id: 's1', assignee_email: 'staff@x.test', status: 'pending', valid_months: 6, updated_date: 'tav1' },
    { id: 'ta2', training_id: 'ti1', sop_id: 's1', assignee_email: 'staff@x.test', status: 'cancelled', valid_months: 6, updated_date: 'tav2' },
  ];
  const sops = structuredClone(SOP_FIXTURE);
  sops[0].acknowledged_viewers = [];
  const f = fixture({ sops, assignments });
  await f.call({ action: 'acknowledge', id: 's1' }, 'tok-staff');
  const ta1 = f.entities.TrainingAssignment.rows.find((r) => r.id === 'ta1');
  eq(ta1.status, 'completed', 'pending assignment completed by ack');
  eq(ta1.completed_method, 'sop_ack', 'completion stamped sop_ack');
  ok(ta1.completed_at, 'completed_at set');
  ok(ta1.expires_at, 'valid_months produced an expiry');
  ok(new Date(ta1.expires_at) > new Date(), 'expiry is in the future');
  const ta2 = f.entities.TrainingAssignment.rows.find((r) => r.id === 'ta2');
  eq(ta2.status, 'cancelled', 'cancelled sibling is never revived');
}

// ack guards: draft/missing -> 404; CAS exhaustion -> 409; retry recovers.
{
  const f = fixture();
  eq((await f.call({ action: 'acknowledge', id: 's2' }, 'tok-staff')).status, 404, 'draft ack -> 404');
  eq((await f.call({ action: 'acknowledge', id: 'missing' }, 'tok-staff')).status, 404, 'missing ack -> 404');
  eq((await f.call({ action: 'acknowledge' }, 'tok-staff')).status, 400, 'missing id -> 400');

  f.entities.Sop.hooks.updateMany = async () => ({ updated: 0 });
  const blocked = await f.call({ action: 'acknowledge', id: 's1' }, 'tok-other');
  eq(blocked.status, 409, 'all CAS attempts lost -> 409 (client told to retry)');
  ok(/being updated right now/i.test(blocked.body.error));

  let calls = 0;
  f.entities.Sop.hooks.updateMany = async (q, u) => {
    calls += 1;
    if (calls === 1) return { updated: 0 };
    delete f.entities.Sop.hooks.updateMany;
    return f.entities.Sop.updateMany(q, u);
  };
  const retried = await f.call({ action: 'acknowledge', id: 's1' }, 'tok-editor');
  eq(retried.status, 200, 'CAS retry recovers inside the attempt loop');
  eq(retried.body.acknowledged, true);
  eq(calls, 2, 'lost one CAS attempt then landed');
}

// ===========================================================================
// suggest_edit
// ===========================================================================
{
  const f = fixture();
  const res = await f.call({ action: 'suggest_edit', id: 's1', text: 'Step 1 needs a photo', step_id: 'st1' }, 'tok-staff');
  eq(res.status, 200, 'staff suggestion 200');
  eq(res.body.suggested, true);
  eq(res.body.suggestion.email, 'staff@x.test');
  eq(res.body.suggestion.step_id, 'st1');
  eq(res.body.suggestion.status, 'open');
  const row = f.entities.Sop.rows.find((r) => r.id === 's1');
  eq(row.suggestions.length, 2, 'suggestion appended to the row');

  eq((await f.call({ action: 'suggest_edit', id: 's2', text: 'x' }, 'tok-staff')).status, 404, 'draft suggestion -> 404');
  eq((await f.call({ action: 'suggest_edit', id: 's1', text: ' ' }, 'tok-staff')).status, 400, 'empty text -> 400');
  eq((await f.call({ action: 'suggest_edit', id: 's1' }, 'tok-staff')).status, 400, 'missing text -> 400');

  f.entities.Sop.hooks.updateMany = async () => ({ updated: 0 });
  eq((await f.call({ action: 'suggest_edit', id: 's1', text: 'later' }, 'tok-staff')).status, 409, 'suggestion CAS exhaustion -> 409');
}

// ===========================================================================
// resolve_suggestion (editor gate)
// ===========================================================================
{
  const f = fixture();
  const ver = () => f.entities.Sop.rows.find((r) => r.id === 's1').updated_date;
  const res = await f.call({
    action: 'resolve_suggestion', id: 's1', suggestion_id: 'sg1', outcome: 'dismissed', expected_updated_date: ver(),
  }, 'tok-editor');
  eq(res.status, 200, 'resolve 200');
  const sug = res.body.record.suggestions.find((s) => s.id === 'sg1');
  eq(sug.status, 'dismissed', 'outcome applied');
  eq(sug.resolved_by, 'editor@x.test', 'resolver stamped');
  ok(sug.resolved_at, 'resolved_at set');

  eq((await f.call({
    action: 'resolve_suggestion', id: 's1', suggestion_id: 'sg1', expected_updated_date: ver(),
  }, 'tok-staff')).status, 403, 'staff resolve -> 403');
  eq((await f.call({
    action: 'resolve_suggestion', id: 's1', suggestion_id: 'sg1', expected_updated_date: 'stale',
  }, 'tok-editor')).status, 409, 'stale resolve -> 409');
}

// ===========================================================================
// set_status
// ===========================================================================
{
  const f = fixture();
  const ver = (id) => f.entities.Sop.rows.find((r) => r.id === id).updated_date;
  const pub = await f.call({ action: 'set_status', id: 's2', status: 'published', expected_updated_date: ver('s2') }, 'tok-editor');
  eq(pub.status, 200, 'draft -> published');
  eq(pub.body.record.status, 'published');
  eq(pub.body.record.updated_by_email, 'editor@x.test');

  eq((await f.call({ action: 'set_status', id: 's3', status: 'published', expected_updated_date: ver('s3') }, 'tok-editor')).status,
    400, 'zero-step publish blocked at the gateway');
  const arc = await f.call({ action: 'set_status', id: 's1', status: 'archived', expected_updated_date: ver('s1') }, 'tok-editor');
  eq(arc.body.record.status, 'archived', 'published -> archived');
  eq((await f.call({ action: 'set_status', id: 's1', status: 'weird', expected_updated_date: ver('s1') }, 'tok-editor')).status,
    400, 'unknown status -> 400');
  eq((await f.call({ action: 'set_status', id: 's1', status: 'draft', expected_updated_date: 'stale' }, 'tok-editor')).status,
    409, 'stale transition -> 409');
  eq((await f.call({ action: 'set_status', id: 's2', status: 'archived', expected_updated_date: ver('s2') }, 'tok-staff')).status,
    403, 'staff set_status -> 403');
}

// ===========================================================================
// delete — admin-only, CAS-guarded, linked training items deactivated
// ===========================================================================
{
  const items = [
    { id: 'ti1', title: 'SOP training', type: 'sop', sop_id: 's1', active: true, updated_date: 'tiv1' },
    { id: 'ti2', title: 'Other', type: 'video', sop_id: '', active: true, updated_date: 'tiv2' },
  ];
  const f = fixture({ items });
  eq((await f.call({ action: 'delete', id: 's1', expected_updated_date: 'sv1' }, 'tok-editor')).status,
    403, 'named editor (non-admin) delete -> 403');
  eq((await f.call({ action: 'delete', id: 's1', expected_updated_date: 'stale' }, 'tok-admin')).status,
    409, 'stale delete -> 409, nothing removed');
  eq(f.entities.Sop.rows.some((r) => r.id === 's1'), true, 'row survived the stale delete');

  const gone = await f.call({ action: 'delete', id: 'absent', expected_updated_date: 'x' }, 'tok-admin');
  eq(gone.status, 200);
  eq(gone.body.already_absent, true, 'already-absent delete is idempotent');

  const res = await f.call({ action: 'delete', id: 's1', expected_updated_date: 'sv1' }, 'tok-admin');
  eq(res.status, 200, 'admin delete 200');
  eq(res.body.deleted, true);
  eq(f.entities.Sop.rows.some((r) => r.id === 's1'), false, 'row really deleted');
  eq(f.entities.TrainingItem.rows.find((r) => r.id === 'ti1').active, false, 'linked sop item deactivated');
  eq(f.entities.TrainingItem.rows.find((r) => r.id === 'ti2').active, true, 'unlinked item untouched');
}

// ===========================================================================
// ack_report — admin-only, deactivated staff excluded, version-aware
// ===========================================================================
{
  const f = fixture({ staff: STAFF_ROSTER });
  eq((await f.call({ action: 'ack_report' }, 'tok-editor')).status, 403, 'editor (non-admin) report -> 403');
  const res = await f.call({ action: 'ack_report' }, 'tok-admin');
  eq(res.status, 200);
  eq(res.body.report.length, 1, 'only published + requires_ack rows reported');
  const rep = res.body.report[0];
  eq(rep.sop_id, 's1');
  eq(rep.version, 2);
  deq(rep.acknowledged.map((v) => v.email).sort(), ['ghost@x.test', 'staff@x.test'],
    'version-2 acks reported (staff@ + ghost@); old-version ack excluded');
  const pending = rep.pending.map((u) => u.email).sort();
  deq(pending, ['admin@x.test', 'editor@x.test', 'other@x.test'],
    'pending = active roster minus version-2 ackers — gone@ excluded, staff@ already acked');
  eq(res.body.roster_size, 4, 'deactivated staff excluded from roster_size');
}

// ===========================================================================
// save_settings — admin-only, create + CAS paths
// ===========================================================================
{
  // existing record: CAS enforced
  const f = fixture();
  eq((await f.call({ action: 'save_settings', settings: { editor_emails: ['e@x.test'] } }, 'tok-editor')).status,
    403, 'editor save_settings -> 403');
  eq((await f.call({ action: 'save_settings', settings: {}, expected_updated_date: 'gsv1' }, 'tok-staff')).status,
    403, 'staff save_settings -> 403');
  eq((await f.call({ action: 'save_settings', settings: { editor_emails: [] } }, 'tok-admin')).status,
    400, 'missing expected_updated_date -> 400');
  eq((await f.call({ action: 'save_settings', settings: { editor_emails: [] }, expected_updated_date: 'stale' }, 'tok-admin')).status,
    409, 'stale settings version -> 409');

  const saved = await f.call({
    action: 'save_settings', expected_updated_date: 'gsv1',
    settings: {
      categories: [
        { key: 'design', label: 'Design', color: '#60A5FA' },
        { key: 'design', label: 'Dupe', color: 'red' },
        { key: 'paint', label: 'Paint', color: '#FF00AA' },
      ],
      editor_emails: ['editor@x.test', 'editor@x.test', 'not-an-email'],
      require_ack_default: true,
      max_image_upload_mb: 5000,
    },
  }, 'tok-admin');
  eq(saved.status, 200, 'admin settings save 200');
  const cats = saved.body.settings.categories.map((c) => c.key);
  deq(cats, ['design', 'paint', 'other'], 'categories deduped + other ensured');
  deq(saved.body.settings.editor_emails, ['editor@x.test'], 'editor emails cleaned + deduped');
  eq(saved.body.settings.max_image_upload_mb, 100, 'image cap clamped');
  eq(saved.body.settings.require_ack_default, true);
  ok(saved.body.settings_updated_date, 'new settings version returned');

  // no record -> create path
  const f2 = fixture({ settings: null });
  const created = await f2.call({ action: 'save_settings', settings: { editor_emails: ['boss@x.test'] } }, 'tok-admin');
  eq(created.status, 200);
  deq(created.body.settings.editor_emails, ['boss@x.test']);
  eq(f2.entities.GlobalSettings.rows.length, 1, 'settings row created');
  eq(f2.entities.GlobalSettings.rows[0].setting_key, 'sopModuleSettings');
}

// ===========================================================================
// unknown action
// ===========================================================================
{
  const f = fixture();
  eq((await f.call({ action: 'explode' }, 'tok-admin')).status, 400, 'unknown action -> 400');
  eq((await f.call({ action: 'explode' }, 'tok-staff')).status, 403, 'unknown editor-gated action hits the edit gate first');
}

console.log(`PASS sop-module (${CASES} assertions)`);
