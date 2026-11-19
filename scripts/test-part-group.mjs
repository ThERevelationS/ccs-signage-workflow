import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// Vite-style extensionless imports can't be resolved by bare Node — bundle first.
const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '.tmp-part-group.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/partGroupInheritance.ts')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const {
  resolveGroupForPart,
  groupMembers,
  effectivePartDefaults,
  propagateGroupEdit,
  markOverride,
} = await import(pathToFileURL(bundlePath).href);

// ---------------------------------------------------------------- fixtures
const grp = (over = {}) => ({ id: 'g1', name: 'G1', sort: 0, part_ids: [], shared_defaults: {}, ...over });
const part = (id, over = {}) => ({ id, part_name: `P${id}`, ...over });

// ------------------------------------------------- resolveGroupForPart: link modes
{
  const g = grp({ part_ids: ['p1', 'p2'] });
  assert.equal(resolveGroupForPart(part('p1'), [g])?.id, 'g1', 'membership link resolves');
  assert.equal(resolveGroupForPart(part('zz', { part_group_id: 'g1' }), [g])?.id, 'g1',
    'FK link via part_group_id resolves');
  assert.equal(resolveGroupForPart(part('zz', { catalog_part_group_id: 'g1' }), [g])?.id, 'g1',
    'FK link via catalog_part_group_id resolves');
  assert.equal(resolveGroupForPart(part('zz', { group_id: 'g1' }), [g])?.id, 'g1',
    'FK link via group_id resolves');
}
{
  // membership wins over a conflicting FK pointer
  const a = grp({ id: 'gA', part_ids: ['p1'] });
  const b = grp({ id: 'gB' });
  assert.equal(resolveGroupForPart(part('p1', { part_group_id: 'gB' }), [a, b])?.id, 'gA',
    'roster membership beats conflicting FK');
  // no link at all -> null
  assert.equal(resolveGroupForPart(part('p9'), [a, b]), null, 'unlinked part resolves null');
  assert.equal(resolveGroupForPart(part('p9', { part_group_id: 'nope' }), [a, b]), null,
    'dangling FK resolves null');
  assert.equal(resolveGroupForPart(part('p1'), []), null, 'empty groups -> null');
  // double membership (data error) -> lowest sort wins
  const hi = grp({ id: 'gHi', sort: 5, part_ids: ['p1'] });
  const lo = grp({ id: 'gLo', sort: 1, part_ids: ['p1'] });
  assert.equal(resolveGroupForPart(part('p1'), [hi, lo])?.id, 'gLo',
    'double membership picks lowest sort');
  // whitespace/garbage tolerated
  assert.equal(resolveGroupForPart(part('  p1  '), [a])?.id, 'gA', 'id trim tolerated');
  assert.equal(resolveGroupForPart(null, [a]), null, 'null part -> null');
}

// ------------------------------------------------------------- groupMembers
{
  const g = grp({ part_ids: ['p2', 'p1'] });
  const parts = [part('p1'), part('p2'), part('p3', { part_group_id: 'g1' }), part('p4')];
  const ids = groupMembers(g, parts).map((p) => p.id);
  assert.deepEqual(ids, ['p2', 'p1', 'p3'],
    'membership parts in part_ids order, then FK extras in input order');
  // dedupe: part in part_ids AND with FK link appears once, at roster position
  const g2 = grp({ part_ids: ['p1'] });
  const both = groupMembers(g2, [part('p1', { part_group_id: 'g1' }), part('p9', { part_group_id: 'g1' })]);
  assert.deepEqual(both.map((p) => p.id), ['p1', 'p9'], 'dual-linked part deduped');
  // FK to a different group does not join
  assert.deepEqual(groupMembers(g2, [part('p7', { part_group_id: 'gX' })]), [],
    'foreign FK excluded');
  // part_ids referencing ids not in parts are skipped
  assert.deepEqual(groupMembers(grp({ part_ids: ['ghost', 'p1'] }), [part('p1')]).map((p) => p.id),
    ['p1'], 'ghost ids skipped');
  // empty group edge
  assert.deepEqual(groupMembers(grp(), [part('p1'), part('p2')]), [], 'empty group -> no members');
  assert.deepEqual(groupMembers(null, [part('p1')]), [], 'null group -> []');
  assert.deepEqual(groupMembers(grp({ part_ids: ['p1'] }), null), [], 'null parts -> []');
}

// ------------------------------------------- effectivePartDefaults: precedence
{
  const g = grp({ shared_defaults: { margin: 40, vendor: 'V1', waste: 0.1, mode: 'sqft' } });
  // (1) absent part fields inherit
  const r1 = effectivePartDefaults({ part: part('p1'), group: g });
  assert.equal(r1.merged.margin, 40, 'absent field inherits group default');
  assert.equal(r1.merged.part_name, 'Pp1', 'merged keeps part fields');
  assert.deepEqual(r1.inherited_keys, ['margin', 'mode', 'vendor', 'waste'],
    'inherited_keys sorted');
  assert.deepEqual(r1.overridden_keys, [], 'nothing overridden');
  // (2) explicit part value beats group default
  const r2 = effectivePartDefaults({ part: part('p2', { margin: 55 }), group: g });
  assert.equal(r2.merged.margin, 55, 'explicit part value wins');
  assert.deepEqual(r2.overridden_keys, ['margin'], 'explicit-value key is overridden');
  assert.deepEqual(r2.inherited_keys, ['mode', 'vendor', 'waste'], 'rest still inherited');
  // (3) overridden_fields suppresses group default
  const r3 = effectivePartDefaults({ part: part('p3', { overridden_fields: ['vendor'] }), group: g });
  assert.equal(r3.merged.vendor, undefined, 'overridden_fields suppresses group default');
  assert.deepEqual(r3.suppressed_keys, ['vendor'], 'suppressed key reported');
  assert.deepEqual(r3.overridden_keys, ['vendor'], 'suppressed counts as overridden');
  // (4) precedence chain: explicit value beats overridden_fields listing
  const r4 = effectivePartDefaults({
    part: part('p4', { margin: 99, overridden_fields: ['margin'] }), group: g,
  });
  assert.equal(r4.merged.margin, 99, 'explicit value beats overridden_fields exclusion');
  assert.deepEqual(r4.suppressed_keys, [], 'not suppressed when explicit value exists');
  // (5) empty-string part field is a hole -> group fills it
  const r5 = effectivePartDefaults({ part: part('p5', { vendor: '' }), group: g });
  assert.equal(r5.merged.vendor, 'V1', 'empty string field inherits group default');
  // (6) false / 0 / [] are explicit values, NOT holes
  const g6 = grp({ shared_defaults: { taxable: true, min_charge: 5, parent_sizes: ['A'] } });
  const r6 = effectivePartDefaults({
    part: part('p6', { taxable: false, min_charge: 0, parent_sizes: [] }), group: g6,
  });
  assert.equal(r6.merged.taxable, false, 'false is an explicit value');
  assert.equal(r6.merged.min_charge, 0, '0 is an explicit value');
  assert.deepEqual(r6.merged.parent_sizes, [], 'empty array is an explicit value');
  assert.deepEqual(r6.inherited_keys, [], 'all three treated as overrides');
  // (7) empty group edge: no shared_defaults -> merged = part verbatim
  const r7 = effectivePartDefaults({ part: part('p7', { margin: 1 }), group: grp() });
  assert.equal(r7.merged.margin, 1, 'empty group leaves part fields');
  assert.deepEqual(r7.inherited_keys, [], 'empty group inherits nothing');
  assert.deepEqual(r7.overridden_keys, [], 'empty group overrides nothing');
  const r8 = effectivePartDefaults({ part: part('p8'), group: null });
  assert.deepEqual(r8.inherited_keys, [], 'null group inherits nothing');
}

// --------------------------------------------------------- propagateGroupEdit
{
  const g = grp({
    part_ids: ['p1', 'p2', 'p3', 'p4'],
    shared_defaults: { margin: 50, vendor: 'V2', mode: 'sqft' },
  });
  const prev = { margin: 40, vendor: 'V2', obsolete: 'x' };
  const parts = [
    part('p1'),                                            // clean member
    part('p2', { overridden_fields: ['margin'] }),         // opts out of margin
    part('p3', { margin: 75 }),                            // explicit value on changed key
    part('p4', { overridden_fields: ['margin', 'mode'] }), // opts out of both changed keys
    part('p5'),                                            // NOT a member
  ];
  const plan = propagateGroupEdit({ group: g, prevDefaults: prev, parts });
  assert.equal(plan.group_id, 'g1', 'plan carries group id');
  assert.deepEqual(plan.changed_keys, ['margin', 'mode'],
    'changed keys = new + value-diff keys (vendor unchanged, dropped)');
  assert.deepEqual(plan.removed_keys, ['obsolete'], 'dropped default reported as removed');
  assert.equal(plan.parts.length, 4, 'one plan row per member; non-member excluded');
  assert.deepEqual(plan.parts[0], { part_id: 'p1', updates: { margin: 50, mode: 'sqft' }, skipped_keys: [] },
    'clean member gets full update set');
  assert.deepEqual(plan.parts[1].updates, { mode: 'sqft' },
    'overridden_fields member skips opted key');
  assert.deepEqual(plan.parts[1].skipped_keys, ['margin'], 'skipped key reported');
  assert.deepEqual(plan.parts[2].updates, { mode: 'sqft' },
    'explicit-value member not clobbered on that key');
  assert.deepEqual(plan.parts[3].updates, {}, 'fully-overridden member gets empty updates');
  assert.deepEqual(plan.parts[3].skipped_keys, ['margin', 'mode'], 'all skipped keys listed');
  assert.ok(!plan.parts.some((r) => r.part_id === 'p5'), 'non-member not in plan');
  // no-change edit -> empty updates everywhere
  const idle = propagateGroupEdit({ group: g, prevDefaults: g.shared_defaults, parts });
  assert.deepEqual(idle.changed_keys, [], 'identical defaults -> nothing changed');
  assert.ok(idle.parts.every((r) => Object.keys(r.updates).length === 0),
    'identical defaults -> zero writes');
  // deep-equal comparison: identical nested bag is NOT a change
  const gDeep = grp({ part_ids: ['p1'], shared_defaults: { tiers: [{ at: 1, v: 2 }] } });
  const deepIdle = propagateGroupEdit({ group: gDeep, prevDefaults: { tiers: [{ at: 1, v: 2 }] }, parts: [part('p1')] });
  assert.deepEqual(deepIdle.changed_keys, [], 'deep-equal values not a change');
  const deepChanged = propagateGroupEdit({ group: gDeep, prevDefaults: { tiers: [{ at: 1, v: 3 }] }, parts: [part('p1')] });
  assert.deepEqual(deepChanged.changed_keys, ['tiers'], 'deep-diff detected');
  assert.deepEqual(deepChanged.parts[0].updates, { tiers: [{ at: 1, v: 2 }] },
    'deep-diff writes new object value');
  // empty-group edge: no members, empty defaults
  const emptyPlan = propagateGroupEdit({ group: grp(), prevDefaults: null, parts: [part('p1')] });
  assert.deepEqual(emptyPlan.parts, [], 'empty group -> empty plan');
  assert.deepEqual(emptyPlan.changed_keys, [], 'empty defaults -> nothing changed');
  assert.deepEqual(emptyPlan.removed_keys, [], 'null prev -> nothing removed');
}

// ---------------------------------------------------------------- markOverride
{
  const p = part('p1', { overridden_fields: ['vendor', 'margin'] });
  const out = markOverride(p, 'waste');
  assert.deepEqual(out, ['margin', 'vendor', 'waste'], 'adds key, sorted');
  assert.deepEqual(markOverride(p, 'vendor'), ['margin', 'vendor'], 'dedupes existing key');
  assert.deepEqual(markOverride(p, '  '), ['margin', 'vendor'], 'blank key ignored');
  assert.deepEqual(markOverride(part('p2'), 'x'), ['x'], 'missing list -> singleton');
  assert.deepEqual(markOverride(part('p3', { overridden_fields: 'junk' }), 'x'), ['x'],
    'non-array overridden_fields tolerated');
  assert.deepEqual(markOverride(part('p4', { overridden_fields: ['b', 'a', 'b', ' '] }), 'c'),
    ['a', 'b', 'c'], 'existing list normalized: trimmed/deduped/sorted');
  assert.deepEqual(p.overridden_fields, ['vendor', 'margin'], 'input part not mutated');
}

console.log('PASS part-group inheritance (65 asserts: both link modes, membership-wins, precedence chain, propagate plan/skip/removed/deep-diff, markOverride dedupe, empty-group edges)');
