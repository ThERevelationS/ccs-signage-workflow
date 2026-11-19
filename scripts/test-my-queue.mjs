// Contract checks for masterplan item C-10 — my-queue personalization:
// the "assigned to me" preset ({assigned:'me'}), per-user identity matching,
// the defaultSavedQueueView precedence chain, URL-wins initial-filter
// resolution, and ownership.
//
// Bundles myQueueModel.js (which imports savedViewsModel's pure readers —
// the dependency chain is all leaf modules, so the bundle stays Node-clean).
//
// Run: node scripts/test-my-queue.mjs  →  prints "PASS my-queue"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-myq.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/queues/myQueueModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: { '@': resolve(here, '../src') },
});
const M = await import(pathToFileURL(out).href);
const {
  MY_QUEUE_TOKEN, MY_QUEUE_PRESET, MY_QUEUE_ROW_FIELDS,
  userIdentity, myQueueFilters, isMyQueueFilters,
  isMyRow, filterMyQueueRows, userOwnsView,
  defaultViewFor, resolveInitialFilters,
} = M;

const ME = 'sam@shop.test';
const USER = { email: 'Sam@Shop.test', display_name: 'Sam Smith' };

// --- 1. preset shape ---------------------------------------------------------

assert.equal(MY_QUEUE_TOKEN, 'me');
assert.deepEqual(MY_QUEUE_PRESET, { assigned: 'me' }, 'canonical preset = {assigned:"me"}');
assert.ok(Object.isFrozen(MY_QUEUE_PRESET), 'preset is frozen');
assert.throws(() => { 'use strict'; MY_QUEUE_PRESET.assigned = 'x'; }, TypeError, 'frozen preset rejects mutation');
assert.deepEqual([...MY_QUEUE_ROW_FIELDS], ['assignedTo', 'assigned_to', 'designer', 'responsibility'],
  'default match fields: flattened + snake_case assignee, designer, responsibility');

// --- 2. userIdentity ----------------------------------------------------------

{
  const s = userIdentity(' Sam@Shop.TEST ');
  assert.equal(s.email, 'sam@shop.test', 'string user normalized to email');
  assert.deepEqual(s.tokens, ['sam@shop.test'], 'string user tokens = email only');
  const o = userIdentity(USER);
  assert.equal(o.email, 'sam@shop.test');
  assert.equal(o.name, 'Sam Smith');
  assert.deepEqual(o.tokens, ['sam@shop.test', 'sam smith'], 'object user tokens = email + display_name');
  const fn = userIdentity({ full_name: 'Sam Smith', email: 'sam@shop.test' });
  assert.ok(fn.tokens.includes('sam smith'), 'full_name alias feeds name token');
  const none = userIdentity(null);
  assert.deepEqual(none.tokens, [], 'anonymous → no tokens');
  const dupe = userIdentity({ email: 'sam@shop.test', display_name: 'sam@shop.test' });
  assert.deepEqual(dupe.tokens, ['sam@shop.test'], 'identical email/name deduped');
}

// --- 3. myQueueFilters / isMyQueueFilters ------------------------------------

{
  const f = myQueueFilters(USER);
  assert.equal(f.assigned, 'me', 'resolved filter carries the marker');
  assert.deepEqual(f.my.fields, [...MY_QUEUE_ROW_FIELDS], 'default fields');
  assert.deepEqual(f.my.match, ['sam@shop.test', 'sam smith'], 'match tokens resolved per user');
  const narrowed = myQueueFilters(USER, { fields: ['assignedTo', 'designer', 'assignedTo', ' '] });
  assert.deepEqual(narrowed.my.fields, ['assignedTo', 'designer'], 'fields option narrows + dedupes');
  assert.deepEqual(myQueueFilters(null).my.match, [], 'anonymous → empty match (fail-closed)');
  assert.ok(isMyQueueFilters(f), 'marker detected in resolved filters');
  assert.ok(isMyQueueFilters({ assigned: ' ME ' }), 'marker compare is case-insensitive');
  assert.equal(isMyQueueFilters({ assigned: 'lee@x' }), false, 'a literal assignee is not the me-marker');
  assert.equal(isMyQueueFilters({ status: 'x' }), false);
}

// --- 4. isMyRow / filterMyQueueRows -------------------------------------------

const rows = [
  { id: 'r1', assignedTo: 'Sam@Shop.test' },                                    // flattened row, email
  { id: 'r2', assigned_to: 'sam@shop.test' },                                   // raw snake_case
  { id: 'r3', designer: 'SAM SMITH' },                                          // display_name fallback
  { id: 'r4', responsibility: 'sam@shop.test' },                                // person-type responsibility
  { id: 'r5', assignedTo: ['lee@x.test', 'sam@shop.test'] },                    // multi-assignee array
  { id: 'r6', assigned_to: 'lee@x.test; Sam Smith' },                           // ;-separated list
  { id: 'r7', assignedTo: 'lee@x.test', designer: 'Lee' },                      // not mine
  { id: 'r8', responsibility: 'Design Department' },                            // group — no user match
  { id: 'r9', assignedTo: 'samsung@shop.test' },                                // prefix must not match
];

{
  const mine = filterMyQueueRows(rows, USER).map((r) => r.id);
  assert.deepEqual(mine, ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'],
    'email + display_name across all four fields, arrays and ;-lists');
  assert.equal(isMyRow(rows[0], ME), true, 'email-string user works');
  assert.equal(isMyRow(rows[6], USER), false, 'another person’s row is not mine');
  assert.equal(isMyRow(rows[7], USER), false, 'department responsibility is not a user match');
  assert.equal(isMyRow(rows[8], USER), false, 'token compare is exact, not substring');
  assert.equal(isMyRow(rows[0], null), false, 'no identity → fail-closed');
  assert.equal(isMyRow(rows[0], ''), false);
  assert.equal(isMyRow(null, USER), false, 'no row → false');
  assert.equal(isMyRow(rows[2], USER, { fields: ['assignedTo'] }), false,
    'fields option narrows the inspected columns');
  assert.equal(isMyRow(rows[2], USER, { fields: ['designer'] }), true);
  assert.equal(isMyRow({ assigned_to: 'Smith, Sam' }, USER), false,
    'comma-separated cells are not split (Last, First stays one token)');
}

// --- 5. defaultViewFor — the precedence chain ---------------------------------

const V = (over = {}) => ({
  id: over.id || 'v', owner_email: ME, status: 'active',
  created_date: '2026-01-01T00:00:00Z', ...over,
});

{
  // empty / no identity
  assert.equal(defaultViewFor(USER, []), null, 'no views → null');
  assert.equal(defaultViewFor(null, [V()]), null, 'no identity → null');
  assert.equal(defaultViewFor({ display_name: 'Sam' }, [V()]), null, 'name without email → null');

  // archived rows never apply
  assert.equal(defaultViewFor(USER, [V({ status: 'archived', is_default: true })]), null,
    'archived default is skipped');

  // tier 1: default_for_user === me (case-insensitive)
  const claimed = V({ id: 'claimed', default_for_user: 'SAM@SHOP.TEST' });
  const sharedDef = V({ id: 'shared-def', owner_email: 'lead@x', is_shared: true, shared_default: true });
  const myOld = V({ id: 'my-old', created_date: '2026-01-02T00:00:00Z' });
  assert.equal(defaultViewFor(USER, [sharedDef, myOld, claimed])?.id, 'claimed',
    'default_for_user beats shared_default + oldest-own');

  // tier 1b: own is_default is the same personal claim in stored form
  const myFlag = V({ id: 'my-flag', is_default: true, created_date: '2026-01-05T00:00:00Z' });
  assert.equal(defaultViewFor(USER, [sharedDef, myFlag])?.id, 'my-flag',
    'my is_default view is a personal default — beats shared_default');
  // …but default_for_user still outranks it
  assert.equal(defaultViewFor(USER, [myFlag, claimed])?.id, 'claimed',
    'explicit default_for_user outranks own is_default');
  // someone else’s is_default is THEIR personal claim, never mine
  const theirFlag = V({ id: 'their-flag', owner_email: 'lead@x', is_shared: true, is_default: true });
  assert.equal(defaultViewFor(USER, [theirFlag, myOld])?.id, 'my-old',
    'another owner’s is_default is ignored for me');
  // default_for_user aimed at someone else is ignored (owned by a third
  // party so it can't fall back through tier 3 either)
  const alienClaim = V({ id: 'x', owner_email: 'lead@x', is_shared: true, default_for_user: 'other@x' });
  assert.equal(defaultViewFor(USER, [alienClaim, myOld])?.id, 'my-old',
    'default_for_user for a different email is ignored');
  // array-valued default_for_user claims membership
  assert.equal(defaultViewFor(USER, [V({ id: 'arr', default_for_user: ['a@x', ME] })])?.id, 'arr',
    'array default_for_user matches on membership');

  // tier 2: shared_default beats oldest-own
  assert.equal(defaultViewFor(USER, [sharedDef, myOld])?.id, 'shared-def',
    'shared_default beats oldest user-owned');

  // tier 3: oldest owned view — deterministic created_date/id order
  const older = V({ id: 'b', created_date: '2026-01-01T00:00:00Z' });
  const newer = V({ id: 'a', created_date: '2026-01-03T00:00:00Z' });
  assert.equal(defaultViewFor(USER, [newer, older])?.id, 'b', 'oldest own view wins');
  assert.equal(defaultViewFor(USER, [
    V({ id: 'z', created_date: '2026-01-01T00:00:00Z' }),
    V({ id: 'a', created_date: '2026-01-01T00:00:00Z' }),
  ])?.id, 'a', 'same created_date → id tiebreak');
  // other people’s views (not shared, not default-for-me) never apply
  assert.equal(defaultViewFor(USER, [V({ id: 'theirs', owner_email: 'lead@x' })]), null,
    'no own/shared/default rows → null');

  // pageKey scoping — a page-scoped default never applies off-page
  const designView = V({ id: 'dv', page: 'design', is_default: true });
  assert.equal(defaultViewFor(USER, [designView], { pageKey: 'production' }), null,
    'design view excluded on production');
  assert.equal(defaultViewFor(USER, [designView], { pageKey: 'design' })?.id, 'dv',
    'design view applies on design');
}

// --- 6. resolveInitialFilters — URL always wins --------------------------------

const savedDefault = V({
  id: 'def', is_default: true,
  filters: JSON.stringify({ status: 'in_design', machine: 'latex-1', assigned: 'me' }),
});

{
  // URL present → verbatim win (deep link beats the stored default)
  const urlF = { status: 'installed', search: 'main st' };
  assert.deepEqual(resolveInitialFilters({ user: USER, savedViews: [savedDefault], urlFilters: urlF }),
    urlF, 'URL filters win over the default view, verbatim');

  // URLSearchParams accepted; any entry counts as link intent
  const sp = new URLSearchParams('status=all');
  assert.deepEqual(resolveInitialFilters({ user: USER, savedViews: [savedDefault], urlFilters: sp }),
    { status: 'all' }, 'URLSearchParams deep link wins');

  // empty URL object → falls through to the default view
  const got = resolveInitialFilters({ user: USER, savedViews: [savedDefault], urlFilters: {} });
  assert.equal(got.status, 'in_design', 'empty urlFilters → default view applies');
  assert.equal(got.machine, 'latex-1', 'default view filters normalized');
  assert.equal(got.pageSize, 50, 'recordToFilters fills canonical defaults');
  assert.equal(got.assigned, 'me', 'unknown assigned:"me" key passes through verbatim');

  // null urlFilters → same default-view path
  assert.equal(resolveInitialFilters({ user: USER, savedViews: [savedDefault] }).status, 'in_design');

  // pageKey narrows the view pool
  const prodView = V({ id: 'pv', page: 'production', is_default: true, filters: { status: 'cutting' } });
  assert.equal(
    resolveInitialFilters({ user: USER, savedViews: [savedDefault, prodView], pageKey: 'production' }).status,
    'cutting', 'pageKey picks the page-scoped default');
  assert.equal(
    resolveInitialFilters({ user: USER, savedViews: [prodView], pageKey: 'design' }).status,
    undefined, 'wrong page → no default → {}');
  assert.deepEqual(
    resolveInitialFilters({ user: USER, savedViews: [prodView], pageKey: 'design' }),
    {}, 'no applicable view → {}');

  // nothing at all → {}
  assert.deepEqual(resolveInitialFilters({ user: USER }), {}, 'no views, no URL → {}');
}

// --- 7. userOwnsView ------------------------------------------------------------

{
  assert.equal(userOwnsView(V(), USER), true, 'owner_email match');
  assert.equal(userOwnsView(V(), ME), true, 'string user works');
  assert.equal(userOwnsView(V({ owner_email: '', user_email: 'SAM@SHOP.TEST' }), USER), true,
    'user_email alias + case-insensitive');
  assert.equal(userOwnsView(V({ owner_email: 'lead@x' }), USER), false, 'not mine');
  assert.equal(userOwnsView(V(), null), false, 'no user → false');
  assert.equal(userOwnsView(V(), { display_name: 'Sam Smith' }), false, 'name alone cannot own');
}

rmSync(out, { force: true });
console.log('PASS my-queue');
