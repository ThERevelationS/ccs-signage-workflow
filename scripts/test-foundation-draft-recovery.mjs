// foundationDraftRecovery pure-helper tests: real module, isolated in-memory sessionStorage per store.
import assert from 'node:assert/strict';
import { createFoundationDraftStore, FOUNDATION_DRAFT_FIELDS } from '../src/components/estimator/foundation/foundationDraftRecovery.js';

let passed = 0, failed = 0;
const ok = (name, fn) => { try { fn(); passed++; console.log('ok', name); } catch (e) { failed++; console.log('FAIL', name, '-', String(e?.message || e).slice(0, 300)); } };

const newMem = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), __map: m };
};
const freeze = (o) => { for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') freeze(o[k]); return Object.freeze(o); };
const NOW = '2025-01-01T12:00:00Z';
const keyOf = (ownerId, sourceId, estimateId) => 'ccs:foundation-draft:v1:' + encodeURIComponent(JSON.stringify([ownerId, sourceId, estimateId ?? null]));
const CTX = { ownerId: 'o1', sourceId: 'p1', estimateId: 'e1' };
const KEY = keyOf(CTX.ownerId, CTX.sourceId, CTX.estimateId);

const proj = (over = {}) => ({
  id: 'p1', updated_date: 'v1', project_name: 'Job', notes: 'n',
  items: [{ component_id: 'f1', foundation_type: 'spread_foot', concrete_bags: 3, rebar_size: '#4', item_total_cost: 42, sub: { id: 's1', n: [1, 2] } }],
  walls: [{ component_id: 'w1', foundation_component_id: 'f1', shape: { segments: [{ component_id: 'seg1' }] } }],
  poles: [{ component_id: 'po1', foundation_component_id: 'f1', signage: { component_id: 'sn1' } }],
  wall_caps: [{ component_id: 'c1', wall_component_id: 'w1', segment_component_id: 'seg1' }],
  signage_cabinets: [{ component_id: 'sc1', pole_component_id: 'po1', foundation_component_id: 'f1' }],
  selected_equipment: [{ component_id: 'e1', attachment_counts: { att: 1 } }],
  landscape: { cells: { '0,0': {} }, cell_size_inches: 12 },
  project_concrete_type: '4000_ae', project_concrete_admixtures: ['a1'], excavation_method: 'hand_dig',
  selected_concrete_id: 'bag', assembly_schema_version: 1,
  concrete_cost_per_cy: 150, rebar_cost_per_ft: 0.9,
  customer_pricing: { applied: true }, builder_sync_attempt: { key: 'x' }, customer_id: 'cus1',
  walkthrough_step: 2, walkthrough_video_url: 'https://v.example/x',
  total_concrete_cost: 999, grand_total: 999, creation_request_key: 'k1', status: 'draft',
  concrete_delivery_snapshot: { version: 1 }, ai_engineering_data: { verdict: 'ok' }, ...over,
});
const args = (over = {}) => ({ project: over.project || proj(), baseUpdatedAt: 'v1', token: 'tok1', savedAt: NOW, expectedRevision: null, ...over });
// per-store memory: one fresh backend per STORE creation
const store = (over = {}) => { const mem = newMem(); return { s: createFoundationDraftStore({ getStorage: () => mem, ...CTX, ...over }), mem }; };

ok('roundtrip: allowlist + whole-assembly IDs/refs preserved; frozen input unchanged', () => {
  const p = freeze(proj());
  const { s } = store();
  const w = s.write(args({ project: p }));
  assert.equal(w.status, 'stored');
  const r = s.read();
  assert.equal(r.status, 'found');
  assert.equal(r.revision, w.revision);
  assert.deepEqual(r.draft.items, p.items, 'items deep-equal incl IDs');
  assert.deepEqual(r.draft.walls, p.walls, 'walls deep-equal incl segment component_id');
  assert.deepEqual(r.draft.poles, p.poles, 'poles deep-equal incl foundation_component_id + signage component_id');
  assert.deepEqual(r.draft.wall_caps, p.wall_caps, 'caps deep-equal incl wall/segment refs');
  assert.deepEqual(r.draft.signage_cabinets, p.signage_cabinets, 'cabinets deep-equal incl pole/foundation refs');
  assert.deepEqual(r.draft.selected_equipment, p.selected_equipment, 'equipment deep-equal');
  assert.equal(r.draft.items[0].item_total_cost, 42, 'nested raw cache retained');
  // customer_pricing is deliberately allowlisted (O-007: the applied-tier
  // selection travels with the draft) — assert it round-trips, not excluded.
  assert.deepEqual(r.draft.customer_pricing, p.customer_pricing, 'customer_pricing allowlisted round-trip');
  assert.equal(r.draft.walkthrough_step, 2, 'walkthrough_step allowlisted round-trip');
  assert.equal(r.draft.walkthrough_video_url, 'https://v.example/x', 'walkthrough_video_url allowlisted round-trip');
  for (const ex of ['id', 'updated_date', 'builder_sync_attempt', 'customer_id', 'total_concrete_cost', 'grand_total', 'creation_request_key', 'status', 'concrete_delivery_snapshot'])
    assert.ok(!(ex in r.draft), `excluded ${ex}`);
});

ok('isolation: owner/source/estimate keys distinct in the SAME storage', () => {
  const mem = newMem();
  const mk = (over) => createFoundationDraftStore({ getStorage: () => mem, ...CTX, ...over });
  mk({ ownerId: 'oA' }).write(args());
  assert.equal(mk({ ownerId: 'oA' }).read().status, 'found');
  assert.equal(mk({ ownerId: 'oB' }).read().status, 'empty');
  assert.equal(mk({ sourceId: 'pX' }).read().status, 'empty');
  assert.equal(mk({ estimateId: 'eX' }).read().status, 'empty');
});

ok('identity invalid: empty/whitespace/non-string owner,source,estimate -> unavailable', () => {
  const bad = (over) => createFoundationDraftStore({ getStorage: () => newMem(), ...CTX, ...over }).read();
  for (const over of [{ ownerId: '' }, { ownerId: '   ' }, { sourceId: '' }, { ownerId: null }, { estimateId: 5 }, { estimateId: '' }, { ownerId: 'x'.repeat(257) }])
    assert.equal(bad(over).status, 'unavailable');
});

ok('zero/null/false/empty preserved; undefined own props omitted', () => {
  const p = proj({ rebar_cost_per_ft: 0, project_concrete_admixtures: [], notes: '' });
  p.items[0].flag = false;
  p.landscape.empty = null;
  p.extraUndef = undefined;
  p.items[0].undefField = undefined;
  const r = store().s.write(args({ project: p })).draft;
  assert.equal(r.rebar_cost_per_ft, 0);
  assert.equal(r.notes, '');
  assert.equal(r.items[0].flag, false);
  assert.equal(r.landscape.empty, null);
  assert.deepEqual(r.project_concrete_admixtures, []);
  assert.ok(!('extraUndef' in r), 'undefined root prop omitted');
  assert.ok(!('undefField' in r.items[0]), 'undefined nested prop omitted');
});

ok('write invalids: id mismatch, arrays, version, nonfinite, cycle, nonplain, symbols, undefined-array-entry, bad ids/tokens/dates', () => {
  const { s } = store();
  const w1 = s.write(args());
  const cyc = proj(); cyc.items[0].self = cyc;
  const proto = proj(); proto.items[0].__proto__ = {};
  const bads = [
    args({ project: { ...proj(), id: 'other' } }),
    args({ project: { ...proj(), items: 'nope' } }),
    args({ project: { ...proj(), items: [42] } }),
    args({ project: { ...proj(), assembly_schema_version: 2 } }),
    args({ project: { ...proj(), concrete_cost_per_cy: Infinity } }),
    args({ project: { ...proj(), concrete_cost_per_cy: NaN } }),
    args({ project: { ...proj(), landscape: new Date() } }),
    args({ project: { ...proj(), landscape: new Map() } }),
    args({ project: { ...proj(), notes: () => {} } }),
    args({ project: { ...proj(), notes: Symbol('x') } }),
    args({ project: { ...proj(), items: [undefined] } }),
    args({ project: cyc }),
    args({ project: proto }),
    args({ baseUpdatedAt: '' }), args({ baseUpdatedAt: '  ' }), args({ token: '' }), args({ token: '  ' }),
    args({ savedAt: 'nope' }), args({ savedAt: 0 }), args({ savedAt: null }),
  ];
  for (const c of bads) {
    const r = s.write({ ...c, expectedRevision: w1.revision });
    assert.equal(r.status, 'invalid', `expected invalid: ${r.message}`);
    assert.equal(s.read().revision, w1.revision, 'prior retained after invalid');
  }
});

ok('storage: getter/get/set/remove failures + null provider + unstable provider -> unavailable', () => {
  const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => {}, removeItem: () => {} };
  assert.equal(createFoundationDraftStore({ getStorage: () => denied, ...CTX }).read().status, 'unavailable');
  assert.equal(createFoundationDraftStore({ getStorage: () => { throw new Error('getter denied'); }, ...CTX }).read().status, 'unavailable');
  assert.equal(createFoundationDraftStore({ getStorage: () => null, ...CTX }).read().status, 'unavailable');
  assert.equal(createFoundationDraftStore({ getStorage: () => ({ getItem: 5 }), ...CTX }).read().status, 'unavailable');
  const setBad = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  assert.equal(createFoundationDraftStore({ getStorage: () => setBad, ...CTX }).write(args()).status, 'unavailable');
  const rmBad = { getItem: () => 'rev', setItem: () => {}, removeItem: () => { throw new Error('x'); } };
  assert.equal(createFoundationDraftStore({ getStorage: () => rmBad, ...CTX }).clear('rev').status, 'unavailable');
  // unstable provider: one backend per method — write lands on the first only
  let calls = 0;
  const a = newMem(), b = newMem();
  const unstable = createFoundationDraftStore({ getStorage: () => (++calls % 2 ? a : b), ...CTX });
  const w = unstable.write(args());
  assert.equal(w.status, 'stored');
  assert.equal(calls, 1, 'one storage() call per method');
  assert.equal(a.__map.get(KEY), w.revision, 'write landed on backend A');
  assert.equal(b.__map.size, 0, 'backend B untouched');
});

ok('size cap retains prior record', () => {
  const { s } = store();
  const w1 = s.write(args());
  const big = proj({ notes: 'x'.repeat(1_000_001) });
  const r = s.write({ ...args({ project: big }), expectedRevision: w1.revision });
  assert.equal(r.status, 'invalid');
  assert.equal(s.read().revision, w1.revision);
});

ok('read invalids on same key: malformed JSON, wrong version, context mismatch, array data, unsupported version, numeric savedAt, oversize', () => {
  const { s, mem } = store();
  const w1 = s.write(args());
  const base = JSON.parse(w1.revision);
  const cases = [
    'not-json',
    JSON.stringify({ ...base, version: 9 }),
    JSON.stringify({ ...base, ownerId: 'oX' }),
    JSON.stringify({ ...base, sourceId: 'pX' }),
    JSON.stringify({ ...base, estimateId: 'eX' }),
    JSON.stringify({ ...base, data: [] }),
    JSON.stringify({ ...base, data: { ...base.data, items: 'x' } }),
    JSON.stringify({ ...base, data: { ...base.data, assembly_schema_version: 2 } }),
    JSON.stringify({ ...base, savedAt: 123 }),
    'x'.repeat(1_000_001),
  ];
  for (const raw of cases) {
    mem.__map.set(KEY, raw);
    const r = s.read();
    assert.equal(r.status, 'invalid', `expected invalid for ${raw.slice(0, 40)}`);
    assert.equal(r.revision, raw, 'raw revision retained');
  }
  mem.__map.set(KEY, w1.revision);
  assert.equal(s.read().status, 'found');
});

ok('read sanitizes tampered envelope fields: excluded data keys dropped', () => {
  const { s, mem } = store();
  const w1 = s.write(args());
  const env = JSON.parse(w1.revision);
  env.data.id = 'tampered'; env.data.updated_date = 'v9'; env.data.total_concrete_cost = 77777; env.data.builder_sync_attempt = { key: 'x' };
  mem.__map.set(KEY, JSON.stringify(env));
  const r = s.read();
  assert.equal(r.status, 'found');
  for (const ex of ['id', 'updated_date', 'total_concrete_cost', 'builder_sync_attempt'])
    assert.ok(!(ex in r.draft), `tampered ${ex} dropped`);
});

ok('CAS write conflict retains prior', () => {
  const { s } = store();
  const w1 = s.write(args());
  assert.equal(s.write({ ...args(), expectedRevision: 'stale' }).status, 'conflict');
  assert.equal(s.read().revision, w1.revision);
  assert.equal(s.write({ ...args(), expectedRevision: w1.revision }).status, 'stored');
});

ok('exact-revision clear: stale revision retained, exact removes', () => {
  const { s } = store();
  const w1 = s.write(args());
  const w2 = s.write({ ...args({ project: proj({ notes: 'newer edit' }), token: 'tok2' }), expectedRevision: w1.revision });
  assert.notEqual(w2.revision, w1.revision, 'distinct revisions');
  assert.equal(s.clear(w1.revision).status, 'retained', 'old rev cannot clear new edit');
  assert.equal(s.read().revision, w2.revision);
  assert.equal(s.clear(w2.revision).status, 'removed');
  assert.equal(s.read().status, 'empty');
});

ok("'__proto__' own JSON key cloned as data (no pollution); sparse array rejected; inherited root prop dropped", () => {
  // JSON '__proto__' own key must survive as data, not invoke the setter
  const p = JSON.parse('{"id":"p1","project_name":"X","items":[{"component_id":"f1","__proto__":{"evil":1}}]}');
  const { s } = store();
  const r = s.write(args({ project: p }));
  assert.equal(r.status, 'stored');
  const got = s.read().draft;
  assert.equal(Object.getPrototypeOf(got.items[0]), Object.prototype, 'plain proto preserved');
  assert.equal(Object.prototype.evil, undefined, 'no prototype pollution');
  assert.equal(got.items[0].__proto__.evil, 1, 'own __proto__ data kept');
  // sparse array rejected (holes -> undefined entries)
  const sparse = proj(); sparse.items[0].hole = new Array(3); // [empty x3]
  assert.equal(store().s.write(args({ project: sparse })).status, 'invalid');
  // a project with an altered prototype is non-plain -> invalid before pickDraft
  const inh = proj();
  Object.setPrototypeOf(inh, { project_name: 'inherited!', notes: 'leak' });
  assert.equal(store().s.write(args({ project: inh })).status, 'invalid', 'inherited-prop root rejected non-plain');
});

ok('non-plain record rejected; non-allowlist own root prop dropped', () => {
  const proto = proj();
  Object.setPrototypeOf(proto.items[0], { sneaky: 1 });
  assert.equal(store().s.write(args({ project: proto })).status, 'invalid', 'altered-prototype record invalid');
  const p = proj();
  p.sneakyRoot = 'x';
  const r = store().s.write(args({ project: p }));
  assert.equal(r.status, 'stored');
  assert.ok(!('sneakyRoot' in r.draft), 'non-allowlist root dropped');
});

console.log(`PASS draft-recovery passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
