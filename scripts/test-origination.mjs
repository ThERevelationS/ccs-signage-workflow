// Contract checks for the hierarchical origination work (masterplan item G-01):
//  - base44/entities/OriginationNode.jsonc        — tree registry (new, backend-only RLS)
//  - src/components/crm/originationModel.js       — pure tree/path/grouping/resolve model
//
// Run: node scripts/test-origination.mjs  →  prints "PASS origination"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = resolve(here, '.tmp-origination.mjs');
buildSync({
  entryPoints: [resolve(root, 'src/components/crm/originationModel.js')],
  bundle: true,
  format: 'esm',
  outfile: out,
  logLevel: 'silent',
});
const {
  ORIGINATION_PATH_SEPARATOR,
  normalizePathString,
  pathLevels,
  buildOriginationTree,
  fullPathOf,
  groupByLevel,
  resolveOrSuggest,
} = await import(pathToFileURL(out).href);

// ---------- Entity schema (matches CrmEventType conventions) --------------

const ent = JSON.parse(readFileSync(join(root, 'base44/entities/OriginationNode.jsonc'), 'utf8'));
const p = ent.properties || {};
assert.equal(ent.name, 'OriginationNode', 'entity name');
assert.equal(ent.type, 'object', 'entity type is object');
assert.equal(p.name?.type, 'string', 'name is a string');
assert.equal(p.parent_id?.type, 'string', 'parent_id is a string');
assert.equal(p.sort?.type, 'number', 'sort is a number');
assert.equal(p.status?.type, 'string', 'status is a string');
assert.equal(p.full_path?.type, 'string', 'full_path is a string');
assert.ok(!Array.isArray(ent.required) || ent.required.length === 0, 'all fields optional (required empty/absent)');
for (const op of ['create', 'read', 'update', 'delete']) {
  assert.equal(
    ent.rls?.[op]?.user_condition?.role,
    '__originationnode_backend_only__',
    `rls.${op} is backend-only`,
  );
}

// ---------- Fixtures -------------------------------------------------------

const N = (id, name, parent_id = '', extra = {}) => ({ id, name, parent_id, sort: 0, status: 'active', ...extra });
const nodes = [
  N('r-net', 'Networking Group', '', { sort: 2 }),
  N('r-ref', 'Referral', '', { sort: 1 }),
  N('r-web', 'Website', '', { sort: 3 }),
  N('c-bni', 'BNI - Carl', 'r-net', { sort: 1 }),
  N('c-chamber', 'Chamber of Commerce', 'r-net', { sort: 2 }),
  N('g-tier1', 'Tier 1', 'c-bni'),
  N('g-tier2', 'Tier 2', 'c-bni', { status: 'archived' }),
];

// ---------- normalizePathString / pathLevels -------------------------------

assert.equal(ORIGINATION_PATH_SEPARATOR, ' : ', 'canonical separator');
assert.equal(normalizePathString('  Networking Group  ::  BNI - Carl : '), 'Networking Group : BNI - Carl', 'trims, drops empties, rejoins');
assert.equal(normalizePathString('BNI   -   Carl'), 'BNI - Carl', 'inner whitespace collapses');
assert.equal(normalizePathString(''), '', 'empty stays empty');
assert.equal(normalizePathString(null), '', 'null safe');
assert.equal(normalizePathString(':::'), '', 'separator-only input drops every empty segment');
assert.deepEqual(pathLevels('Root : Child : Leaf'), ['Root', 'Child', 'Leaf'], 'segments split');
assert.deepEqual(pathLevels(' : Root :: Leaf '), ['Root', 'Leaf'], 'segments normalize then split');
assert.deepEqual(pathLevels(''), [], 'blank path -> no levels');

// ---------- buildOriginationTree -------------------------------------------

const tree = buildOriginationTree(nodes);
assert.ok(tree.byId instanceof Map, 'byId is a Map');
assert.equal(tree.byId.size, 7, 'all nodes indexed');
assert.deepEqual(tree.roots.map((r) => r.id), ['r-ref', 'r-net', 'r-web'], 'roots sorted by sort then name');
assert.deepEqual(tree.childrenOf.get('r-net').map((n) => n.id), ['c-bni', 'c-chamber'], 'children sorted by sort');
assert.equal(tree.childrenOf.get('r-ref'), undefined, 'childless node has no childrenOf entry');
assert.deepEqual(tree.roots.map((r) => r.id), buildOriginationTree(nodes).roots.map((r) => r.id), 'build is deterministic');
assert.deepEqual(buildOriginationTree(null).roots, [], 'null input is safe');

const messy = buildOriginationTree([
  N('a', 'A', 'b'),             // cycle a<->b
  N('b', 'B', 'a'),
  N('c', 'C', 'a'),             // child of a cycle member
  N('orph', 'Orphan', 'gone'),  // parent_id points at a missing node
  N('root', 'Root', ''),
]);
for (const id of ['a', 'b', 'c', 'orph']) {
  assert.ok(messy.roots.some((n) => n.id === id), `unreachable node "${id}" promoted to roots`);
}
assert.ok(messy.roots.some((n) => n.id === 'root'), 'real root still present');
assert.deepEqual(
  messy.childrenOf.get('a').map((n) => n.id).sort(),
  ['b', 'c'],
  'childrenOf mirrors declared links, cycle link included',
);

const dupe = buildOriginationTree([N('x', 'First'), N('x', 'Second'), N('', 'NoId')]);
assert.equal(dupe.byId.get('x').name, 'First', 'duplicate ids keep the first row');
assert.equal(dupe.byId.size, 1, 'id-less rows are dropped');

// ---------- fullPathOf ------------------------------------------------------

assert.equal(fullPathOf(tree.byId.get('g-tier1'), tree.byId), 'Networking Group : BNI - Carl : Tier 1', 'deep path derives');
assert.equal(fullPathOf(tree.byId.get('r-web'), tree.byId), 'Website', 'root path is its name');
assert.equal(fullPathOf(null, tree.byId), '', 'null node safe');
assert.equal(fullPathOf(messy.byId.get('c'), messy.byId), 'B : A : C', 'cycle walk terminates at first revisit');
const plainById = { 'r-net': nodes[0], 'c-bni': nodes[3] };
assert.equal(fullPathOf(plainById['c-bni'], plainById), 'Networking Group : BNI - Carl', 'plain-object byId works');

// ---------- groupByLevel -----------------------------------------------------

const custs = [
  { id: '1', origination_path: 'Networking Group : BNI - Carl : Tier 1' },
  { id: '2', origination_path: 'Networking Group : Chamber of Commerce' },
  { id: '3', origination_path: 'Referral' },
  { id: '4', origination_path: 'Networking Group : BNI - Carl : Tier 2' },
  { id: '5', origination_path: '' },
  { id: '6' },
];
const l0 = groupByLevel(custs, 0);
assert.ok(l0 instanceof Map, 'groupByLevel returns a Map');
assert.deepEqual([...l0.keys()], ['Networking Group', 'Referral', ''], 'level-0 keys alphabetical, "" bucket last');
assert.deepEqual(l0.get('Networking Group').map((r) => r.id), ['1', '2', '4'], 'root segment groups rows');
assert.deepEqual(l0.get('').map((r) => r.id), ['5', '6'], 'blank/missing path buckets under ""');
const l1 = groupByLevel(custs, 1);
assert.deepEqual([...l1.keys()], ['BNI - Carl', 'Chamber of Commerce', ''], 'level-1 keys');
assert.deepEqual(l1.get('BNI - Carl').map((r) => r.id), ['1', '4'], 'second segment groups rows');
assert.deepEqual(l1.get('').map((r) => r.id), ['3', '5', '6'], 'paths shorter than level bucket under ""');
const l2 = groupByLevel(custs, 2);
assert.deepEqual([...l2.keys()], ['Tier 1', 'Tier 2', ''], 'level-2 keys');
assert.deepEqual(l2.get('Tier 1').map((r) => r.id), ['1'], 'leaf segment groups rows');
assert.deepEqual([...groupByLevel(null, 0).keys()], [], 'null rows -> empty map');

// ---------- resolveOrSuggest --------------------------------------------------

const hit = resolveOrSuggest({ origination_path: 'networking group : bni - carl' }, nodes);
assert.equal(hit.matched, true, 'case-insensitive exact match resolves');
assert.equal(hit.unmatched, false);
assert.equal(hit.node.id, 'c-bni');
assert.equal(hit.path, 'Networking Group : BNI - Carl', 'returns canonical derived path');
assert.equal(hit.suggestion, null, 'matched result carries no suggestion');
assert.equal(resolveOrSuggest({ origination_path: 'Networking Group : BNI - Carl : Tier 1' }, nodes).node.id, 'g-tier1', 'deep node resolves');
assert.equal(resolveOrSuggest({ origination_path: 'Networking Group' }, nodes).node.id, 'r-net', 'root node resolves');

const miss = resolveOrSuggest({ origination_path: 'Networking Group : BNI - Carl : Tier 9' }, nodes);
assert.equal(miss.matched, false, 'unknown leaf does not match');
assert.equal(miss.unmatched, true, 'unmatched flag set');
assert.equal(miss.node, null, 'unmatched carries no node');
assert.equal(miss.path, 'Networking Group : BNI - Carl : Tier 9', 'unmatched path echoes normalized input');
assert.equal(miss.suggestion.node.id, 'c-bni', 'suggests nearest existing ancestor');
assert.equal(miss.suggestion.path, 'Networking Group : BNI - Carl');
assert.equal(miss.suggestion.sharedSegments, 2, 'suggestion reports shared segment count');

const midMiss = resolveOrSuggest({ origination_path: 'Networking Group : Unknown Child' }, nodes);
assert.equal(midMiss.suggestion.node.id, 'r-net', 'falls back to the deepest shared prefix');

const none = resolveOrSuggest({ origination_path: 'Radio Ad' }, nodes);
assert.equal(none.matched, false);
assert.equal(none.suggestion, null, 'zero shared segments -> no suggestion');

const blank = resolveOrSuggest({ origination_path: '  ' }, nodes);
assert.equal(blank.unmatched, true, 'blank input is unmatched');
assert.equal(blank.suggestion, null, 'blank input has no suggestion');
assert.equal(blank.input, '', 'blank input normalizes to ""');

const arch = resolveOrSuggest({ origination_path: 'Networking Group : BNI - Carl : Tier 2' }, nodes);
assert.equal(arch.matched, true, 'archived node still resolves an exact path');
assert.equal(arch.node.id, 'g-tier2');
const missArch = resolveOrSuggest({ origination_path: 'Networking Group : BNI - Carl : Tier 2 : Sub' }, nodes);
assert.equal(missArch.suggestion.node.id, 'c-bni', 'suggestions skip archived nodes and land on the active ancestor');

const viaTree = resolveOrSuggest({ origination_path: 'Referral' }, tree);
assert.equal(viaTree.node.id, 'r-ref', 'accepts a prebuilt {byId} tree');

const stale = resolveOrSuggest(
  { origination_path: 'Old Stored : Path' },
  [N('s1', 'Renamed', '', { full_path: 'Old Stored : Path' })],
);
assert.equal(stale.matched, true, 'stored full_path falls back when derived path differs');
assert.equal(stale.node.id, 's1');

console.log('PASS origination (entity schema, normalize/pathLevels, cycle-safe tree build, fullPathOf, groupByLevel, resolveOrSuggest)');
