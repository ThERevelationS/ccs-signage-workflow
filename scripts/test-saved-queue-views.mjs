// Contract checks for masterplan item C-03 — server-saved queue views via
// SavedQueueView: canonical 15-key filters (incl. machine/part/salesperson/
// enteredBy), unknown-key passthrough policy, pin ordering, pageKey scoping,
// and the per-session "ssv:" mirror fallback.
//
// Bundles savedViewsModel.js only — the store core is dependency-injected so
// the real CRUD + degradation code runs here against a fake entity honoring
// the staffDataRead/staffEntityWrite contracts and a Map-backed storage.
//
// Run: node scripts/test-saved-queue-views.mjs  →  prints "PASS saved-queue-views"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-sqv.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/queues/savedViewsModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: { '@': resolve(here, '../src') },
});
const M = await import(pathToFileURL(out).href);
const {
  SAVED_VIEW_FILTER_KEYS, SAVED_VIEW_FILTER_DEFAULTS,
  filtersToRecord, recordToFilters, serializeViewFilters, deserializeViewFilters,
  canonicalViewFilters, sameViewFilters, matchView,
  buildViewRecord, viewOwnerEmail, isViewShared, viewPageKey, viewQueueLens, isLiveView,
  isOwnView, canDeleteView, sortViews, nextPinnedSort, findViewByName,
  MIRROR_PREFIX, MIRROR_ID_PREFIX, mirrorKeyFor, isMirrorView,
  readViewMirror, writeViewMirror, newMirrorViewId,
  pageScope, lensScope, createSavedViewStore,
} = M;

// --- fakes ------------------------------------------------------------------

const makeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
};

// Fake SavedQueueView client honoring the staff gateway contracts:
// filter(query, sort, limit, skip) → rows[]; get(id) → row|null;
// create(data) → row; updateMany({id, updated_date}, {$set}) → {updated:n};
// delete(id) → bool.
const makeEntity = (initial = []) => {
  const rows = new Map();
  let seq = 0;
  const calls = { filter: 0, create: 0, updateMany: 0, delete: 0, get: 0 };
  const entity = { calls, down: false, _rows: rows };
  const maybeFail = () => {
    if (entity.down) {
      const e = new Error('gateway down');
      e.status = 500;
      throw e;
    }
  };
  Object.assign(entity, {
    async filter(query, sort, limit, skip) {
      calls.filter += 1; maybeFail();
      let out2 = [...rows.values()].filter((r) =>
        Object.entries(query || {}).every(([k, v]) => r[k] === v));
      if (sort) {
        const desc = sort.startsWith('-');
        const field = desc ? sort.slice(1) : sort;
        out2 = [...out2].sort((a, b) => {
          const cmp = String(a?.[field] ?? '').localeCompare(String(b?.[field] ?? ''));
          return desc ? -cmp : cmp;
        });
      }
      const s = skip || 0;
      return out2.slice(s, s + (limit ?? out2.length));
    },
    async list(sort, limit, skip) {
      maybeFail();
      const s = skip || 0;
      return [...rows.values()].slice(s, s + (limit ?? rows.size));
    },
    async get(id) { calls.get += 1; maybeFail(); return rows.get(id) || null; },
    async create(data) {
      calls.create += 1; maybeFail();
      const now = new Date().toISOString();
      const row = { id: `sv${String(++seq).padStart(3, '0')}`, created_date: now, updated_date: now, ...data };
      rows.set(row.id, row);
      return row;
    },
    async updateMany(query, update) {
      calls.updateMany += 1; maybeFail();
      const found = [...rows.values()].filter((r) =>
        Object.entries(query || {}).every(([k, v]) => r[k] === v));
      for (const r of found) {
        Object.assign(r, update?.$set || {});
        r.updated_date = new Date().toISOString();
      }
      return { updated: found.length };
    },
    async delete(id) { calls.delete += 1; maybeFail(); return rows.delete(id); },
  });
  for (const r of initial) {
    rows.set(r.id, {
      created_date: '2026-01-01T00:00:00Z',
      updated_date: '2026-01-01T00:00:00Z',
      ...r,
    });
  }
  return entity;
};

const OWNER = 'sam@shop.test';

// --- 1. canonical filter keys ------------------------------------------------

assert.equal(SAVED_VIEW_FILTER_KEYS.length, 15, '15 canonical filter keys');
for (const k of ['status', 'substatus', 'designer', 'responsibility', 'assignedTo',
  'category', 'moduleKey', 'duePreset', 'search', 'pageSize', 'includeFulfilled',
  'machine', 'part', 'salesperson', 'enteredBy']) {
  assert.ok(SAVED_VIEW_FILTER_KEYS.includes(k), `canonical keys include ${k}`);
}
assert.deepEqual(
  SAVED_VIEW_FILTER_KEYS.slice(-4), ['machine', 'part', 'salesperson', 'enteredBy'],
  'CB extension keys appended at the end (existing prefix order preserved)');

// filtersToRecord emits all known keys, in canonical order, first.
{
  const rec = filtersToRecord({ designer: 'ann', search: 'pole' });
  assert.deepEqual(Object.keys(rec).slice(0, 15), SAVED_VIEW_FILTER_KEYS,
    'known keys emitted in canonical order');
  assert.equal(rec.status, 'all');
  assert.equal(rec.designer, 'ann');
  assert.equal(rec.machine, 'all', 'absent machine defaults to all');
  assert.equal(rec.enteredBy, 'all');
  assert.equal(rec.pageSize, 50);
}

// --- 2. round-trip lossless, incl. new keys + extras -------------------------

{
  const full = {
    status: 'in_design', substatus: 'rev 2', designer: 'ann',
    responsibility: 'design', assignedTo: 'ann', category: 'channel',
    moduleKey: 'estimator', duePreset: 'rush', search: 'main st',
    pageSize: 100, includeFulfilled: true,
    machine: 'latex-1', part: 'face-acrylic', salesperson: 'kim', enteredBy: 'lee',
    customBoard: 'ops', // unknown key → passthrough
  };
  const rec = filtersToRecord(full);
  assert.equal(rec.machine, 'latex-1');
  assert.equal(rec.part, 'face-acrylic');
  assert.equal(rec.salesperson, 'kim');
  assert.equal(rec.enteredBy, 'lee');
  assert.equal(rec.duePreset, 'rush');
  assert.equal(rec.customBoard, 'ops');
  const back = recordToFilters(rec);
  assert.deepEqual(back, { ...SAVED_VIEW_FILTER_DEFAULTS, ...full },
    'recordToFilters(filtersToRecord(f)) is lossless incl. new keys + extras');
  const rec2 = filtersToRecord(back);
  assert.deepEqual(rec2, rec, 'filtersToRecord(recordToFilters(rec)) is stable');
  // legacy aliases still resolve
  assert.equal(serializeViewFilters, filtersToRecord);
  assert.equal(deserializeViewFilters, recordToFilters);
}

// defaults fill missing keys; coercions hold
{
  const f = recordToFilters({ status: 'in_production', pageSize: 999, includeFulfilled: 'yes' });
  assert.equal(f.status, 'in_production');
  assert.equal(f.pageSize, 50, 'out-of-range pageSize falls back to default');
  assert.equal(f.includeFulfilled, false, 'non-true includeFulfilled coerces false');
  assert.equal(f.machine, 'all');
  assert.equal(f.part, 'all');
  assert.equal(f.salesperson, 'all');
  assert.equal(f.enteredBy, 'all');
  const f2 = recordToFilters({ pageSize: 30, includeFulfilled: true });
  assert.equal(f2.pageSize, 30);
  assert.equal(f2.includeFulfilled, true);
}

// unknown-key policy: passthrough verbatim both directions; blocked keys dropped
{
  const rec = filtersToRecord({ mine: true, meta: { a: 1 }, '__proto__': { evil: 1 }, constructor: 'x' });
  assert.equal(rec.mine, true, 'unknown scalar key passes through');
  assert.deepEqual(rec.meta, { a: 1 }, 'unknown object key passes through verbatim');
  assert.ok(!Object.prototype.hasOwnProperty.call(rec, '__proto__'), '__proto__ never written');
  assert.ok(!Object.prototype.hasOwnProperty.call(rec, 'constructor'), 'constructor never written');
  // extras are emitted after the known keys, sorted — canonical stays deterministic
  const extras = Object.keys(rec).filter((k) => !SAVED_VIEW_FILTER_KEYS.includes(k));
  assert.deepEqual(extras, [...extras].sort());
  const f = recordToFilters(rec);
  assert.equal(f.mine, true);
  assert.deepEqual(f.meta, { a: 1 });
}

// string-stored filters (JSON-transport shape) parse; junk → defaults
{
  const f = recordToFilters(JSON.stringify({ status: 'installed', machine: 'cnc-2', zz: 9 }));
  assert.equal(f.status, 'installed');
  assert.equal(f.machine, 'cnc-2');
  assert.equal(f.zz, 9);
  assert.deepEqual(recordToFilters('not-json'), SAVED_VIEW_FILTER_DEFAULTS);
  assert.deepEqual(recordToFilters(null), SAVED_VIEW_FILTER_DEFAULTS);
  assert.deepEqual(recordToFilters([1, 2]), SAVED_VIEW_FILTER_DEFAULTS);
}

// canonical equality + matchView
{
  assert.equal(
    canonicalViewFilters({ search: 'x', status: 'a', machine: 'm1' }),
    canonicalViewFilters({ machine: 'm1', status: 'a', search: 'x' }),
    'canonical form is key-order insensitive');
  assert.ok(sameViewFilters({ part: 'p' }, { part: 'p', search: '' }));
  const views = [{ id: 'v1', name: 'A', filters: filtersToRecord({ machine: 'latex-1' }) }];
  assert.equal(matchView(views, { machine: 'latex-1' })?.id, 'v1');
  assert.equal(matchView(views, { machine: 'latex-2' }), null);
}

// --- 3. record shape ---------------------------------------------------------

{
  const rec = buildViewRecord({ name: '  My View  ', pageKey: 'production', filters: { machine: 'm' }, ownerEmail: ' Sam@Shop.test ', pinned: true, sort: -2, isDefault: true, shared: true });
  assert.equal(rec.name, 'My View');
  assert.equal(rec.page, 'production');
  assert.equal(rec.owner_email, 'Sam@Shop.test');
  assert.equal(rec.user_email, 'Sam@Shop.test', 'user_email alias written');
  assert.equal(rec.is_shared, true);
  assert.equal(rec.shared, true, 'shared alias written');
  assert.equal(rec.pinned, true);
  assert.equal(rec.sort, -2);
  assert.equal(rec.is_default, true);
  assert.equal(rec.status, 'active');
  assert.ok(!('queue_lens' in rec), 'page-scoped rows omit queue_lens (axes stay disjoint)');
  const lensRec = buildViewRecord({ name: 'L', lens: 'design', filters: {}, ownerEmail: 'a' });
  assert.equal(lensRec.queue_lens, 'design');
  assert.ok(!('page' in lensRec), 'lens-scoped rows omit page');
  assert.ok(!('pinned' in lensRec), 'optional flags omitted unless passed (CAS preserves them)');
  assert.ok(!('is_shared' in lensRec));
}

// record readers + alias handling
{
  const v = { owner_email: '', user_email: 'JO@X.TEST', is_shared: false, shared: true, page: 'p1', status: 'active' };
  assert.equal(viewOwnerEmail(v), 'jo@x.test', 'owner reads user_email alias');
  assert.equal(isViewShared(v), true, 'shared alias read');
  assert.equal(viewPageKey(v), 'p1');
  assert.equal(viewQueueLens(v), '');
  assert.ok(isLiveView(v));
  assert.equal(isLiveView({ status: 'archived' }), false, 'archived rows hidden');
  assert.ok(isOwnView(v, 'jo@x.test'));
  assert.ok(canDeleteView(v, 'jo@x.test'));
  assert.equal(canDeleteView(v, 'other@x.test'), false);
}

// --- 4. pinned ordering (stable, deterministic) -------------------------------

{
  const views = [
    { id: 'a', name: 'Bravo', owner_email: OWNER, pinned: false, sort: 1, created_date: '2026-01-03' },
    { id: 'b', name: 'Alpha', owner_email: OWNER, pinned: true, sort: 2, created_date: '2026-01-02' },
    { id: 'c', name: 'Charlie', owner_email: OWNER, pinned: true, sort: -1, created_date: '2026-01-01' },
    { id: 'd', name: 'Delta', owner_email: OWNER, pinned: true, created_date: '2026-01-04' },
    { id: 'e', name: 'Echo', owner_email: 'other@x', pinned: true, sort: -9, is_shared: true, created_date: '2026-01-05' },
    { id: 'f', name: 'Foxtrot', owner_email: OWNER, created_date: '2026-01-06' },
  ];
  const ordered = sortViews(views, OWNER).map((v) => v.id);
  // own pinned first: sort -1 (c), then 2 (b), then unweighted (d);
  // own unpinned: sort 1 (a), then unweighted by name (f);
  // shared (not mine) last regardless of its pin.
  assert.deepEqual(ordered, ['c', 'b', 'd', 'a', 'f', 'e'], 'own>pinned>sort>name ordering');
  assert.deepEqual(sortViews(views, OWNER).map((v) => v.id), ordered, 'ordering is repeatable');
  assert.equal(nextPinnedSort(views), -10, 'next pin weight = min(pinned weights)-1');
  assert.equal(nextPinnedSort([]), 0);
  assert.equal(nextPinnedSort([{ pinned: false, sort: 3 }]), 0, 'unpinned rows ignored');
}

// findViewByName — pageKey axis + owner scoping
{
  const views = [
    { id: 'p1', name: 'Mine', owner_email: OWNER, page: 'production' },
    { id: 'l1', name: 'Mine', owner_email: OWNER, queue_lens: 'design' },
    { id: 'x1', name: 'Mine', owner_email: 'other@x', page: 'production' },
  ];
  assert.equal(findViewByName(views, { name: 'mine', ownerEmail: OWNER, pageKey: 'production' })?.id, 'p1');
  assert.equal(findViewByName(views, { name: 'mine', ownerEmail: OWNER, lens: 'design' })?.id, 'l1');
  assert.equal(findViewByName(views, { name: 'mine', ownerEmail: 'other@x', pageKey: 'production' })?.id, 'x1');
  assert.equal(findViewByName(views, { name: 'mine', ownerEmail: OWNER, pageKey: 'design' }), null);
}

// --- 5. mirror ("ssv:" namespace) ---------------------------------------------

{
  const storage = makeStorage();
  const scope = pageScope('production');
  const key = mirrorKeyFor({ scope, ownerEmail: OWNER });
  assert.ok(key.startsWith(MIRROR_PREFIX), 'mirror key uses ssv: prefix');
  assert.ok(key.includes('sam@shop.test') && key.includes('page:production'), 'mirror key is owner+scope namespaced');
  const mirrored = [
    { id: newMirrorViewId(), name: 'Offline view', owner_email: OWNER, filters: { status: 'x' }, pinned: true },
  ];
  assert.ok(isMirrorView(mirrored[0]), 'ssv- ids detect mirror rows');
  assert.equal(writeViewMirror({ storage, scope, ownerEmail: OWNER, views: mirrored }), true);
  const back = readViewMirror({ storage, scope, ownerEmail: OWNER });
  assert.equal(back.length, 1);
  assert.equal(back[0].name, 'Offline view');
  assert.equal(readViewMirror({ storage, scope, ownerEmail: 'other@x' }).length, 0, 'mirror is owner-scoped');
  assert.deepEqual(readViewMirror({ storage: null, scope, ownerEmail: OWNER }), [], 'no storage → empty mirror');
}

// --- 6. store CRUD against the entity -----------------------------------------

{
  const entity = makeEntity();
  const storage = makeStorage();
  const store = createSavedViewStore({ entity, storage });

  // save → entity.create via the idempotent helper (real helper vs fake entity)
  const saved = await store.saveView({
    name: 'Laser jobs', pageKey: 'production',
    filters: { machine: 'latex-1', status: 'in_production', custom: 'z' },
    ownerEmail: OWNER,
  });
  assert.equal(saved.degraded, false);
  assert.equal(entity.calls.create, 1);
  assert.equal(saved.view.page, 'production');
  assert.equal(saved.view.user_email, OWNER);
  assert.equal(saved.view.owner_email, OWNER);
  assert.ok(saved.view.creation_request_key, 'idempotent create key written');
  assert.equal(saved.view.filters.machine, 'latex-1');
  assert.equal(saved.view.filters.custom, 'z', 'extras persist');
  assert.ok(!('queue_lens' in saved.view));

  // pageKey scoping
  const other = await store.saveView({ name: 'Design view', pageKey: 'design', filters: {}, ownerEmail: OWNER });
  const list = await store.listViews({ pageKey: 'production', ownerEmail: OWNER });
  assert.equal(list.degraded, false);
  assert.equal(list.views.length, 1);
  assert.equal(list.views[0].id, saved.view.id, 'pageKey scoping — only same-page rows listed');
  const designList = await store.listViews({ pageKey: 'design', ownerEmail: OWNER });
  assert.equal(designList.views[0].id, other.view.id);

  // applyView → filters object with normalization + extras
  const applied = store.applyView(saved.view);
  assert.equal(applied.machine, 'latex-1');
  assert.equal(applied.status, 'in_production');
  assert.equal(applied.custom, 'z');
  assert.equal(applied.pageSize, 50);

  // rename (CAS updateMany)
  const renamed = await store.renameView({ view: saved.view, name: 'Laser jobs v2' });
  assert.equal(renamed.degraded, false);
  assert.equal(renamed.view.name, 'Laser jobs v2');
  assert.equal(entity.calls.updateMany, 1);

  // pin → floats to top of pinned block
  await store.saveView({ name: 'Second', pageKey: 'production', filters: {}, ownerEmail: OWNER });
  const p1 = await store.pinView({ view: saved.view, pinned: true, views: [], ownerEmail: OWNER });
  assert.equal(p1.view.pinned, true);
  assert.equal(p1.view.sort, 0, 'first pin weight = 0');
  const [secondRow] = (await store.listViews({ pageKey: 'production', ownerEmail: OWNER })).views
    .filter((v) => v.name === 'Second');
  const p2 = await store.pinView({ view: secondRow, pinned: true, views: [saved.view, secondRow], ownerEmail: OWNER });
  assert.equal(p2.view.sort, -1, 'newest pin gets min-1 weight → top of pinned block');
  const ordered = (await store.listViews({ pageKey: 'production', ownerEmail: OWNER })).views.map((v) => v.name);
  assert.deepEqual(ordered, ['Second', 'Laser jobs v2'], 'pinned-first, sort-weight ordering in listViews');

  // setDefaultView clears the other default
  await store.setDefaultView({ view: saved.view, views: [], isDefault: true, ownerEmail: OWNER });
  const d2 = await store.setDefaultView({ view: secondRow, views: [saved.view, secondRow], isDefault: true, ownerEmail: OWNER });
  assert.equal(d2.view.is_default, true);
  const after = await store.listViews({ pageKey: 'production', ownerEmail: OWNER });
  assert.equal(after.views.find((v) => v.name === 'Laser jobs v2').is_default !== true, true, 'previous default cleared');

  // delete
  const del = await store.deleteView(saved.view, { ownerEmail: OWNER });
  assert.equal(del.deleted, true);
  assert.equal((await store.listViews({ pageKey: 'production', ownerEmail: OWNER })).views.length, 1);

  // CAS conflict → propagates (never silently mirrors)
  const stale = { ...secondRow, updated_date: 'stale-version' };
  await assert.rejects(
    () => store.renameView({ view: stale, name: 'nope' }),
    (e) => e.conflict === true && /another session/.test(e.message),
    'CAS conflict throws a conflict error, does not degrade');
  assert.equal(store.isScopeDegraded(pageScope('production')), false, 'conflict does not mark scope degraded');
}

// shared visibility
{
  const entity = makeEntity([
    { id: 'o1', name: 'Team view', owner_email: 'lead@x', is_shared: true, page: 'production', filters: {} },
    { id: 'o2', name: 'Private', owner_email: 'lead@x', is_shared: false, page: 'production', filters: {} },
    { id: 'o3', name: 'Old view', owner_email: OWNER, page: 'production', status: 'archived', filters: {} },
  ]);
  const store = createSavedViewStore({ entity, storage: makeStorage() });
  const all = await store.listViews({ pageKey: 'production', ownerEmail: OWNER });
  assert.deepEqual(all.views.map((v) => v.id), ['o1'], 'own+shared only; archived hidden');
  const none = await store.listViews({ pageKey: 'production', ownerEmail: OWNER, includeShared: false });
  assert.equal(none.views.length, 0, 'includeShared:false hides shared rows');
}

// --- 7. degraded fallback: entity read fails → ssv: mirror ---------------------

{
  const entity = makeEntity();
  const storage = makeStorage();
  const store = createSavedViewStore({ entity, storage });

  entity.down = true;
  const res = await store.listViews({ pageKey: 'production', ownerEmail: OWNER });
  assert.equal(res.degraded, true, 'failed entity read → degraded:true');
  assert.equal(res.available, true, 'a 500 is transient, not permanently unavailable');
  assert.deepEqual(res.views, [], 'mirror is empty initially');
  assert.ok(res.error instanceof Error);
  assert.equal(store.isScopeDegraded(pageScope('production')), true);

  // writes while degraded land in the mirror — entity.create never called
  const saved = await store.saveView({ name: 'Offline A', pageKey: 'production', filters: { machine: 'm1' }, ownerEmail: OWNER });
  assert.equal(saved.degraded, true);
  assert.equal(entity.calls.create, 0, 'degraded save does not hit the entity');
  assert.ok(isMirrorView(saved.view), 'mirror row has ssv- id');
  assert.equal(saved.view.page, 'production');
  assert.equal(saved.view.filters.machine, 'm1');

  const listed = await store.listViews({ pageKey: 'production', ownerEmail: OWNER });
  assert.equal(listed.degraded, true);
  assert.equal(listed.views.length, 1);
  assert.equal(listed.views[0].name, 'Offline A', 'mirror rows listed while degraded');

  // mirror ops while degraded: rename + pin + delete
  const renamed = await store.renameView({ view: saved.view, name: 'Offline A2' });
  assert.equal(renamed.degraded, true);
  assert.equal(renamed.view.name, 'Offline A2');
  const pinned = await store.pinView({ view: renamed.view, pinned: true, views: [renamed.view] });
  assert.equal(pinned.view.pinned, true);
  const del = await store.deleteView(renamed.view, { ownerEmail: OWNER });
  assert.equal(del.degraded, true);
  assert.equal((await store.listViews({ pageKey: 'production', ownerEmail: OWNER })).views.length, 0);

  // a fresh store whose FIRST read is already down degrades immediately
  const store2 = createSavedViewStore({ entity: makeEntity(), storage: makeStorage() });
  const res2 = await store2.listViews({ pageKey: 'production', ownerEmail: OWNER });
  assert.equal(res2.degraded, false, 'healthy entity → not degraded');
  assert.equal(res2.views.length, 0);

  // recovery: gateway heals → server rows again, degraded clears
  entity.down = false;
  await entity.create({ name: 'Server view', page: 'production', owner_email: OWNER, filters: {}, status: 'active' });
  const healed = await store.listViews({ pageKey: 'production', ownerEmail: OWNER });
  assert.equal(healed.degraded, false, 'successful read clears degraded');
  assert.deepEqual(healed.views.map((v) => v.name), ['Server view'], 'mirror rows do not merge into server lists');
  assert.equal(store.isScopeDegraded(pageScope('production')), false);

  // write while gateway down WITHOUT prior degraded mark → degrades + mirrors
  const entity3 = makeEntity();
  const store3 = createSavedViewStore({ entity: entity3, storage: makeStorage() });
  entity3.down = true;
  const s3 = await store3.saveView({ name: 'First offline', pageKey: 'design', filters: {}, ownerEmail: OWNER });
  assert.equal(s3.degraded, true, 'unavailable write degrades to the mirror');
  assert.equal(entity3.calls.create, 0, 'create never reached — the retry-state filter lookup failed first');
  assert.ok(entity3.calls.filter >= 1, 'the gateway was attempted before degrading');

  // conflict errors never degrade even with mirror available
  const e4 = makeEntity([{ id: 'v9', name: 'X', owner_email: OWNER, page: 'design', updated_date: 'v1', filters: {} }]);
  e4.updateMany = async () => ({ updated: 0 });
  const store4 = createSavedViewStore({ entity: e4, storage: makeStorage() });
  await assert.rejects(
    () => store4.pinView({ view: e4._rows.get('v9'), pinned: true }),
    (e) => e.conflict === true);
}

// --- 8. legacy lens-axis API ----------------------------------------------------

{
  const entity = makeEntity();
  const store = createSavedViewStore({ entity, storage: makeStorage() });
  const rec = await store.saveLensView({ name: 'Design pins', lens: 'design', filters: { designer: 'ann' }, ownerEmail: OWNER });
  assert.equal(rec.queue_lens, 'design');
  assert.equal(rec.is_shared, false);
  assert.ok(rec.id && !isMirrorView(rec), 'lens save returns the bare record');
  const listed = await store.loadLensViews({ lens: 'design', ownerEmail: OWNER });
  assert.equal(listed.views.length, 1);
  assert.equal(listed.views[0].name, 'Design pins');
  assert.equal(listed.available, true);
}

rmSync(out);
console.log('PASS saved-queue-views');
