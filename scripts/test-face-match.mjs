import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
buildSync({
  entryPoints: [resolve(here, '../base44/shared/faceMatch.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outdir: resolve(here, '.tmp-face-match'),
  outExtension: { '.js': '.mjs' },
  logLevel: 'silent',
});
const {
  FACE_MATCH,
  cleanDescriptor,
  cleanDescriptorBatch,
  storedTemplates,
  faceDistance,
  matchFaceFrames,
  mergeFaceTemplates,
} = await import(pathToFileURL(resolve(here, '.tmp-face-match/faceMatch.mjs')).href);

// Deterministic synthetic descriptors. perturb() shifts one dimension by a
// known amount so distances are exact.
const desc = (seed) => Array.from({ length: 128 }, (_, i) => Math.sin(seed * (i + 1)) * 0.5);
const perturb = (base, delta, idx = 0) => {
  const d = base.slice();
  d[idx] += delta;
  return d;
};

const personA = desc(1);
const personB = desc(7);
const probe = (d) => perturb(d, 0.0001); // negligible jitter, distinct frame

// --- cleanDescriptor ---
assert.equal(cleanDescriptor(personA).length, 128, 'valid descriptor accepted');
assert.equal(cleanDescriptor(personA.slice(0, 127)), null, 'length 127 rejected');
assert.equal(cleanDescriptor([...personA.slice(0, 127), NaN]), null, 'NaN rejected');
assert.equal(cleanDescriptor(perturb(personA, 20)), null, '|n| > 10 rejected');
assert.equal(cleanDescriptor('nope'), null, 'non-array rejected');

// --- cleanDescriptorBatch ---
assert.equal(cleanDescriptorBatch(personA).length, 1, 'single descriptor accepted as batch of 1');
{
  const batch = cleanDescriptorBatch([personA, [1, 2, 3], personB, null]);
  assert.equal(batch.length, 2, 'invalid entries dropped');
  assert.deepEqual(batch[0], personA.map(Number));
}
assert.equal(
  cleanDescriptorBatch([personA, personB, desc(3), desc(4), desc(5), desc(6)], 4).length,
  4, 'batch capped at max');
assert.equal(cleanDescriptorBatch([]).length, 0, 'empty batch');
assert.equal(cleanDescriptorBatch(undefined).length, 0, 'missing batch');

// --- storedTemplates ---
{
  const u = { face_descriptors: [personA, [1, 2], personB] };
  assert.equal(storedTemplates(u).length, 2, 'malformed stored entries dropped');
  assert.equal(storedTemplates({}).length, 0, 'no descriptors');
}

// --- faceDistance ---
assert.equal(faceDistance(personA, perturb(personA, 0.4)), 0.4, 'single-axis distance is exact');
assert.equal(faceDistance(personA, personA), 0, 'identical = 0');
assert.equal(faceDistance(personA, [1, 2]), Infinity, 'length mismatch = Infinity');

// --- matchFaceFrames ---
const cand = (id, templates) => ({ id, email: `${id}@x`, face_descriptors: templates });

// Same person (template + ~0.3 noise) matches.
{
  const m = matchFaceFrames([cand('a', [personA])], [perturb(personA, 0.3)]);
  assert.equal(m?.user?.id, 'a', 'same person matches');
  assert.ok(Math.abs(m.distance - 0.3) < 1e-9, 'distance ~0.3');
}

// Distinct person (>0.9) rejected.
assert.equal(
  matchFaceFrames([cand('a', [personA])], [personB]),
  null, 'distinct person rejected');
assert.ok(faceDistance(personA, personB) > 0.9, 'synthetic distinctness assumption holds');

// Distance 0.55 is over maxDistance 0.5 - rejected.
assert.equal(
  matchFaceFrames([cand('a', [personA])], [perturb(personA, 0.55)]),
  null, 'distance 0.55 rejected');

// Single candidate has no runner-up -> clear at threshold.
{
  const m = matchFaceFrames([cand('a', [personA])], [perturb(personA, 0.5)]);
  assert.equal(m?.user?.id, 'a', 'single candidate accepted at threshold');
  assert.equal(m.secondDistance, Infinity, 'secondDistance Infinity with one candidate');
}

// Two candidates at 0.40 and 0.43 - ambiguous, rejected.
{
  const frame = desc(11);
  const m = matchFaceFrames(
    [cand('near', [perturb(frame, 0.40)]), cand('far', [perturb(frame, 0.43, 1)])],
    [frame]);
  assert.equal(m, null, 'ambiguous 0.40 vs 0.43 rejected');
}

// 0.40 vs 0.70 - clearly separated, accepted.
{
  const frame = desc(11);
  const m = matchFaceFrames(
    [cand('near', [perturb(frame, 0.40)]), cand('far', [perturb(frame, 0.70, 1)])],
    [frame]);
  assert.equal(m?.user?.id, 'near', 'clear separation accepts best');
}

// Median over 3 frames tolerates one bad frame.
{
  const m = matchFaceFrames(
    [cand('a', [personA])],
    [perturb(personA, 0.3), perturb(personA, 0.3, 1), perturb(personA, 9, 2)]);
  assert.equal(m?.user?.id, 'a', 'median tolerates one bad frame');
  assert.ok(Math.abs(m.distance - 0.3) < 1e-9, 'median distance is the good frames');
}

// Candidates without templates are skipped.
{
  const m = matchFaceFrames([cand('a', []), cand('b', [personA])], [probe(personA)]);
  assert.equal(m?.user?.id, 'b', 'template-less candidate skipped');
}

// --- mergeFaceTemplates ---
{
  const stored = [personA];
  const r = mergeFaceTemplates(stored, [perturb(personA, 0.05), perturb(personA, 0.3, 1)]);
  assert.equal(r.added, 1, 'near-duplicate < 0.10 skipped');
  assert.equal(r.stored, 1, 'stored count is pre-merge valid count');
  assert.equal(r.merged.length, 2);
}
{
  // Cap at templateMax: 40 stored spaced 0.11 apart + 1 new = 41 -> oldest dropped.
  const stored = Array.from({ length: 40 }, (_, i) => perturb(personA, 0.11 * (i + 1)));
  const extra = perturb(personA, 0.11 * 41);
  const r = mergeFaceTemplates(stored, [extra]);
  assert.equal(r.added, 1, 'new distinct template added');
  assert.equal(r.dropped, 1, 'cap drops oldest');
  assert.equal(r.merged.length, FACE_MATCH.templateMax);
  assert.deepEqual(r.merged[r.merged.length - 1], extra, 'newest kept');
  assert.deepEqual(r.merged[0], stored[1], 'oldest rolled off');
}
{
  // Malformed stored entries dropped before merge.
  const r = mergeFaceTemplates([personA, [9, 9]], [perturb(personA, 0.05)]);
  assert.equal(r.stored, 1, 'malformed stored dropped');
  assert.equal(r.added, 0, 'batch deduped against kept stored');
}

console.log('PASS face-match');
