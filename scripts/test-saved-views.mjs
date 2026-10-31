import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-sv.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/queues/savedViewsModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  SAVED_VIEW_FILTER_KEYS,
  serializeViewFilters, deserializeViewFilters, canonicalViewFilters,
  sameViewFilters, matchView, sortViews, findViewByName,
  isOwnView, isViewVisible, canDeleteView,
} = await import(pathToFileURL(out).href);

const DEFAULTS = {
  status: 'all', substatus: '', designer: 'all', responsibility: 'all',
  assignedTo: 'all', category: 'all', moduleKey: 'all', duePreset: 'all',
  search: '', pageSize: 50, includeFulfilled: false,
};

// Serialize emits every key in the fixed order, with defaults filled in.
{
  const s = serializeViewFilters({ status: 'in_design', designer: 'ann' });
  assert.deepEqual(Object.keys(s), SAVED_VIEW_FILTER_KEYS);
  assert.deepEqual(s, { ...DEFAULTS, status: 'in_design', designer: 'ann' });
  // Key order is stable regardless of caller object ordering.
  const a = serializeViewFilters({ designer: 'ann', status: 'in_design' });
  const b = serializeViewFilters({ status: 'in_design', designer: 'ann' });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  // A bogus pageSize falls back to the default, just like URL parsing.
  assert.equal(serializeViewFilters({ pageSize: 12 }).pageSize, 50);
  assert.equal(serializeViewFilters({ pageSize: 30 }).pageSize, 30);
}

// Deserialize → filter state: unknown keys dropped, missing keys defaulted.
{
  const f = deserializeViewFilters({
    status: 'in_production', search: 'channel', pageSize: 100,
    includeFulfilled: true, bogus: 'x', future_field: { nested: 1 },
  });
  assert.deepEqual(f, {
    ...DEFAULTS,
    status: 'in_production', search: 'channel', pageSize: 100, includeFulfilled: true,
  });
  assert.equal('bogus' in f, false);
  assert.equal('future_field' in f, false);
  // Non-object payloads and bad types degrade to defaults.
  assert.deepEqual(deserializeViewFilters(null), DEFAULTS);
  assert.deepEqual(deserializeViewFilters('junk'), DEFAULTS);
  assert.equal(deserializeViewFilters({ pageSize: 'oops' }).pageSize, 50);
}

// Full roundtrip: serialize → deserialize reproduces the filter state.
{
  const filters = {
    status: 'in_design', substatus: 'awaiting', designer: 'ann',
    responsibility: 'fab', assignedTo: 'bob', category: 'channel_letters',
    moduleKey: 'cl-1', duePreset: 'past_due', search: 'acme',
    pageSize: 100, includeFulfilled: true,
  };
  assert.deepEqual(deserializeViewFilters(serializeViewFilters(filters)), filters);
  assert.deepEqual(deserializeViewFilters(serializeViewFilters(DEFAULTS)), DEFAULTS);
  // Re-serializing a deserialized payload is idempotent (stable stored form).
  assert.equal(
    canonicalViewFilters(deserializeViewFilters(serializeViewFilters(filters))),
    canonicalViewFilters(filters)
  );
}

// Dedupe matching: matchView finds the view whose stored filters equal the
// current state; field-order differences in stored payloads still match.
{
  const view = {
    id: 'v1', name: 'Ann design', queue_lens: 'design', owner_email: 'ann@x.com',
    filters: { designer: 'ann', status: 'in_design', search: '', substatus: '', responsibility: 'all', assignedTo: 'all', category: 'all', moduleKey: 'all', duePreset: 'all', pageSize: 50, includeFulfilled: false },
  };
  const other = { id: 'v2', name: 'Other', queue_lens: 'design', owner_email: 'ann@x.com', filters: serializeViewFilters({ status: 'in_production' }) };
  const views = [view, other];
  assert.equal(matchView(views, { ...DEFAULTS, status: 'in_design', designer: 'ann' })?.id, 'v1');
  assert.equal(matchView(views, { ...DEFAULTS, status: 'in_design' }), null);
  assert.equal(matchView([], filters0()), null);
  assert.equal(sameViewFilters({ status: 'in_design', designer: 'ann' }, view.filters), true);
  assert.equal(sameViewFilters({ status: 'in_design' }, view.filters), false);
}
function filters0() { return { ...DEFAULTS }; }

// Sort: own views first, then shared, alphabetical inside each group.
{
  const views = [
    { id: '1', name: 'Zulu', owner_email: 'other@x.com', is_shared: true },
    { id: '2', name: 'bravo', owner_email: 'me@x.com', is_shared: false },
    { id: '3', name: 'Alpha', owner_email: 'other@x.com', is_shared: true },
    { id: '4', name: 'alpha-mine', owner_email: 'me@x.com', is_shared: false },
    { id: '5', name: 'Hidden', owner_email: 'other@x.com', is_shared: false },
  ];
  const sorted = sortViews(views, 'me@x.com');
  assert.deepEqual(sorted.map((v) => v.id), ['4', '2', '3', '5', '1'],
    'mine alpha first, then non-mine alpha');
  // A shared view owned by me still counts as mine.
  const mineShared = sortViews([{ id: 's', name: 'A', owner_email: 'me@x.com', is_shared: true }, { id: 'o', name: 'B', owner_email: 'you@x.com', is_shared: true }], 'me@x.com');
  assert.equal(mineShared[0].id, 's');
  // Case-insensitive owner matching.
  assert.equal(isOwnView({ owner_email: 'Me@X.com ' }, 'me@x.com'), true);
  assert.equal(isOwnView({ owner_email: 'you@x.com' }, 'me@x.com'), false);
  assert.equal(isOwnView({ owner_email: 'x@x.com' }, ''), false);
}

// Visibility and delete rules: own + shared visible, delete-own only.
{
  const mine = { owner_email: 'me@x.com', is_shared: false };
  const shared = { owner_email: 'you@x.com', is_shared: true };
  const hidden = { owner_email: 'you@x.com', is_shared: false };
  assert.equal(isViewVisible(mine, 'me@x.com'), true);
  assert.equal(isViewVisible(shared, 'me@x.com'), true);
  assert.equal(isViewVisible(hidden, 'me@x.com'), false);
  assert.equal(canDeleteView(mine, 'me@x.com'), true);
  assert.equal(canDeleteView(shared, 'me@x.com'), false);
}

// findViewByName: same owner + lens + name, case-insensitive.
{
  const views = [
    { id: 'a', name: 'Morning', owner_email: 'me@x.com', queue_lens: 'design' },
    { id: 'b', name: 'morning', owner_email: 'you@x.com', queue_lens: 'design' },
    { id: 'c', name: 'Morning', owner_email: 'me@x.com', queue_lens: 'production' },
  ];
  assert.equal(findViewByName(views, { name: ' MORNING ', ownerEmail: 'me@x.com', lens: 'design' })?.id, 'a');
  assert.equal(findViewByName(views, { name: 'morning', ownerEmail: 'me@x.com', lens: 'production' })?.id, 'c');
  assert.equal(findViewByName(views, { name: 'morning', ownerEmail: 'me@x.com', lens: 'all' }), null);
  assert.equal(findViewByName(views, { name: '', ownerEmail: 'me@x.com', lens: 'design' }), null);
}

rmSync(out);
console.log('PASS saved-views');
