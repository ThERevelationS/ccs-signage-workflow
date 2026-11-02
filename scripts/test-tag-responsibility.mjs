import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(here, '.tmp-trm.mjs');
buildSync({
  entryPoints: [resolve(root, 'src/components/queues/tagResponsibilityModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  normalizeTag, mergeTagOptions, normalizeResponsibility, responsibilityGroups,
  chipStyle, NO_RESPONSIBILITY, DEFAULT_TAG_COLOR, DEFAULT_RESPONSIBILITY_COLOR,
} = await import(pathToFileURL(out).href);

// Entity schemas parse and declare the required fields + backend-only RLS.
{
  const sub = JSON.parse(readFileSync(resolve(root, 'base44/entities/ProductSubstatus.jsonc'), 'utf8'));
  assert.equal(sub.name, 'ProductSubstatus');
  for (const f of ['name', 'color', 'applies_to', 'sort', 'status']) {
    assert.ok(sub.properties[f], `ProductSubstatus.${f} declared`);
  }
  assert.equal(sub.properties.applies_to.type, 'array');
  assert.equal(sub.properties.applies_to.items.type, 'string');
  assert.match(
    readFileSync(resolve(root, 'base44/entities/ProductSubstatus.jsonc'), 'utf8'),
    /__productsubstatus_backend_only__/, 'ProductSubstatus must be backend-only RLS',
  );
}
{
  const res = JSON.parse(readFileSync(resolve(root, 'base44/entities/Responsibility.jsonc'), 'utf8'));
  assert.equal(res.name, 'Responsibility');
  for (const f of ['name', 'type', 'color', 'member_emails', 'sort', 'status']) {
    assert.ok(res.properties[f], `Responsibility.${f} declared`);
  }
  assert.deepEqual(res.properties.type.enum, ['department', 'person', 'group']);
  assert.equal(res.properties.member_emails.items.type, 'string');
  assert.match(
    readFileSync(resolve(root, 'base44/entities/Responsibility.jsonc'), 'utf8'),
    /__responsibility_backend_only__/, 'Responsibility must be backend-only RLS',
  );
}

// normalizeTag trims, collapses whitespace, and case-folds.
{
  assert.equal(normalizeTag('  Rush  '), 'rush');
  assert.equal(normalizeTag('RUSH'), 'rush');
  assert.equal(normalizeTag('  Waiting   on  Customer '), 'waiting on customer');
  assert.equal(normalizeTag(''), '');
  assert.equal(normalizeTag(null), '');
}

// mergeTagOptions: product quick_tags ∪ registry names, deduped case-
// insensitively, registry casing wins, archived rows contribute nothing.
{
  const products = [
    { quick_tags: ['Rush', 'Rework'] },
    { quick_tags: ['RUSH', 'Fragile'] },
    { quick_tags: [] }, { quick_tags: 'nope' }, {}, null,
  ];
  const registry = [
    { name: 'Waiting on Customer', sort: 1 },
    { name: 'rush', sort: 0 },               // dedupes 'Rush'; registry casing wins
    { name: 'Retired Tag', status: 'archived' }, // offers nothing
    { name: '' }, null,
  ];
  assert.deepEqual(
    mergeTagOptions(products, registry),
    ['Fragile', 'Rework', 'rush', 'Waiting on Customer'],
  );
  // Without a registry, product casing survives and sort is alpha.
  assert.deepEqual(mergeTagOptions(products), ['Fragile', 'Rework', 'Rush']);
  assert.deepEqual(mergeTagOptions(), []);
}

// normalizeResponsibility applies defaults and validates type/color.
{
  assert.deepEqual(
    normalizeResponsibility({ name: ' Install ', type: 'GROUP', color: '#ABC' }),
    { name: 'Install', color: '#abc', type: 'group' },
  );
  assert.deepEqual(
    normalizeResponsibility({ name: 'Ops' }),
    { name: 'Ops', color: DEFAULT_RESPONSIBILITY_COLOR, type: 'department' },
  );
  assert.equal(normalizeResponsibility({ name: 'X', type: 'robot' }).type, 'department');
  assert.equal(normalizeResponsibility({ name: 'X', color: 'bogus' }).color, DEFAULT_RESPONSIBILITY_COLOR);
  assert.equal(normalizeResponsibility(null).name, '');
}

// responsibilityGroups: registry.sort orders headers; unknowns/blanks/
// archived-member rows collapse into a trailing "(no responsibility)" group.
{
  const registry = [
    { name: 'Install', type: 'group', color: '#22c55e', sort: 2 },
    { name: 'Design', type: 'department', color: '#3b82f6', sort: 1 },
    { name: 'Archived Dept', color: '#000000', sort: 0, status: 'archived' },
  ];
  const rows = [
    { id: 'a', responsibility: 'Design' },
    { id: 'b', responsibility: 'Install' },
    { id: 'c', responsibility: ' design ' },        // case-insensitive match
    { id: 'd', responsibility: 'Mystery' },         // unknown -> catch-all
    { id: 'e', responsibility: '' },                // blank -> catch-all
    { id: 'f', responsibility: 'Archived Dept' },   // archived -> catch-all
    { id: 'g' },                                    // missing -> catch-all
  ];
  const groups = responsibilityGroups(rows, registry);
  assert.deepEqual(groups.map((g) => g.name), ['Design', 'Install', NO_RESPONSIBILITY]);
  assert.deepEqual(groups[0].rows.map((r) => r.id), ['a', 'c']);
  assert.equal(groups[0].color, '#3b82f6');
  assert.equal(groups[0].type, 'department');
  assert.equal(groups[0].count, 2);
  assert.equal(groups[1].color, '#22c55e');
  assert.deepEqual(groups[2].rows.map((r) => r.id), ['d', 'e', 'f', 'g']);
  assert.equal(groups[2].count, 4);

  // Empty registry groups are dropped; single-match renders alone.
  assert.deepEqual(
    responsibilityGroups([{ responsibility: 'Install' }], registry).map((g) => g.name),
    ['Install'],
  );
  // No registry at all — everything lands in the catch-all.
  const solo = responsibilityGroups([{ responsibility: 'Solo' }], []);
  assert.equal(solo.length, 1);
  assert.equal(solo[0].name, NO_RESPONSIBILITY);
  // Equal sorts tie-break alphabetically.
  const tied = responsibilityGroups(
    [{ responsibility: 'Zulu' }, { responsibility: 'Alpha' }],
    [{ name: 'Zulu', sort: 0 }, { name: 'Alpha', sort: 0 }],
  );
  assert.deepEqual(tied.map((g) => g.name), ['Alpha', 'Zulu']);
}

// chipStyle picks contrast-safe text by background luminance.
{
  const navy = chipStyle('#1e3a8a');
  assert.equal(navy.color, '#ffffff', 'dark bg -> white text');
  assert.equal(navy.background, '#1e3a8a');
  assert.match(navy.border, /^1px solid #[0-9a-f]{6}$/);
  const yellow = chipStyle('#facc15');
  assert.equal(yellow.color, '#111827', 'light bg -> dark text');
  assert.equal(chipStyle('#ffffff').color, '#111827');
  assert.equal(chipStyle('#000000').color, '#ffffff');
  // Invalid color falls back to the default and still returns a valid style.
  const bad = chipStyle('not-a-color');
  assert.equal(bad.background, DEFAULT_TAG_COLOR);
  assert.ok(['#ffffff', '#111827'].includes(bad.color));
  // 3-digit hex is accepted.
  assert.equal(chipStyle('#fff').color, '#111827');
}

rmSync(out);
console.log('PASS tag-responsibility');
