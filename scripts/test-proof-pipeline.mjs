// E-01 contract test — proof upload pipeline: file criteria, upload
// validation, proof_version bump sequence, proof_history[] retention across
// repeated uploads, product vs part patch shape, and stale-approval
// preservation (upload must NOT clear proof_approved_version — the lag vs
// proof_version is the E-05 stale signal).
// Run: node scripts/test-proof-pipeline.mjs
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(here, '.tmp-proof-pipeline-out');

buildSync({
  entryPoints: [resolve(root, 'src/components/jobs/proofPipelineModel.js')],
  bundle: true, format: 'esm', outdir: out, logLevel: 'silent',
});
const M = await import(pathToFileURL(resolve(out, 'proofPipelineModel.js')).href);
const {
  PROOF_FILE_CRITERIA, acceptsProofFile, proofFileKind, validateProofUpload,
  nextProofVersion, proofUploadPatch, proofHistory, currentProofFor,
} = M;

const T1 = '2026-11-10T09:00:00.000Z';
const T2 = '2026-11-11T10:00:00.000Z';
const T3 = '2026-11-12T11:00:00.000Z';
const MB = 1024 * 1024;

// === File criteria ==========================================================
assert.deepEqual([...PROOF_FILE_CRITERIA.extensions].sort(), ['ai', 'eps', 'jpg', 'pdf', 'png', 'svg'],
  'exactly the six accepted extensions');
assert.equal(PROOF_FILE_CRITERIA.max_mb, 50, 'default 50 MB cap');
assert.equal(PROOF_FILE_CRITERIA.accept, '.pdf,.png,.jpg,.svg,.ai,.eps', 'accept string covers all six');
assert.ok(PROOF_FILE_CRITERIA.extensions.every((e) => acceptIncludes(e)), 'accept string lists every ext');
function acceptIncludes(ext) { return PROOF_FILE_CRITERIA.accept.split(',').includes('.' + ext); }

assert.ok(acceptsProofFile('proof.PDF'), 'extension check is case-insensitive');
assert.ok(acceptsProofFile('render.PNG'));
assert.ok(acceptsProofFile('photo.jpg'));
assert.ok(acceptsProofFile('vector.SVG'));
assert.ok(acceptsProofFile('artwork.Ai'));
assert.ok(acceptsProofFile('print.eps'));
assert.ok(!acceptsProofFile('brief.docx'), 'docx rejected');
assert.ok(!acceptsProofFile('photo.jpeg'), 'jpeg not in criteria — jpg only');
assert.ok(!acceptsProofFile('archive.tar.gz'), 'only the last extension counts');
assert.ok(!acceptsProofFile('noextension'), 'extensionless rejected');
assert.ok(!acceptsProofFile(''), 'blank rejected');
assert.ok(!acceptsProofFile('.pdf'), 'bare dotfile has no real name/ext boundary');
assert.ok(!acceptsProofFile('file.'), 'trailing dot rejected');

assert.equal(proofFileKind('a.pdf'), 'document');
assert.equal(proofFileKind('a.png'), 'image');
assert.equal(proofFileKind('a.JPG'), 'image', 'kind lookup is case-insensitive');
assert.equal(proofFileKind('a.svg'), 'vector');
assert.equal(proofFileKind('a.ai'), 'vector');
assert.equal(proofFileKind('a.eps'), 'vector');
assert.equal(proofFileKind('a.txt'), 'other');
assert.equal(proofFileKind(''), 'other');

// === validateProofUpload ====================================================
assert.deepEqual(validateProofUpload({ file_name: 'a.pdf' }).ok, true, 'accepted ext passes');
assert.equal(validateProofUpload({ file_name: 'a.pdf' }).kind, 'document', 'ok result carries kind');
assert.equal(validateProofUpload({}).ok, false, 'missing name fails');
assert.equal(validateProofUpload({ file_name: 'a.exe' }).ok, false, 'bad ext fails');
assert.match(validateProofUpload({ file_name: 'a.exe' }).error, /not a supported proof file type/);
assert.equal(validateProofUpload({ file_name: 'a.pdf', file_size: 50 * MB }).ok, true, 'at-limit size passes');
assert.equal(validateProofUpload({ file_name: 'a.pdf', file_size: 50 * MB + 1 }).ok, false, 'over default cap fails');
assert.match(validateProofUpload({ file_name: 'a.pdf', file_size: 51 * MB }).error, /50 MB/);
assert.equal(validateProofUpload({ file_name: 'a.pdf', file_size: 6 * MB, max_mb: 5 }).ok, false, 'custom cap enforced');
assert.equal(validateProofUpload({ file_name: 'a.pdf', file_size: 4 * MB, max_mb: 5 }).ok, true, 'under custom cap passes');
assert.equal(validateProofUpload({ file_name: 'a.pdf' }).ok, true, 'unknown size does not block');
assert.equal(validateProofUpload({ file_name: 'a.pdf', file_size: -3 }).ok, false, 'negative size fails');
assert.equal(validateProofUpload({ file_name: 'a.pdf', file_size: 'not-a-number' }).ok, true, 'non-finite size skipped');

// === nextProofVersion =======================================================
assert.equal(nextProofVersion({}), 1, 'blank record → v1');
assert.equal(nextProofVersion({ proof_version: 0 }), 1);
assert.equal(nextProofVersion({ proof_version: 3 }), 4);
assert.equal(nextProofVersion({ proof_version: '2' }), 3, 'string version coerced');
assert.equal(nextProofVersion({ proof_version: -5 }), 1, 'negative clamps to 0 then +1');
assert.equal(nextProofVersion({ proof_version: 2.9 }), 3, 'fractional floors');
assert.equal(nextProofVersion(null), 1, 'null-safe');
assert.equal(nextProofVersion(undefined), 1, 'undefined-safe');

// === proofUploadPatch — product target ======================================
const P1 = proofUploadPatch({
  product: { id: 'prod-1' },
  file: { url: 'https://files/v1.pdf', name: 'letters-v1.pdf' },
  actor: 'kim@shop', now: T1,
});
assert.equal(P1.proof_file_url, 'https://files/v1.pdf');
assert.equal(P1.proof_file_name, 'letters-v1.pdf');
assert.equal(P1.proof_version, 1, 'first upload → v1');
assert.equal(P1.proof_status, 'draft', 'upload resets proof_status to draft');
assert.equal(P1.proof_submitted_at, T1, 'submission stamped with now');
assert.deepEqual(P1.proof_history, [], 'no prior file → empty history');
assert.ok(!('proof_approved_version' in P1), 'patch never writes proof_approved_version');

// Merge = Object.assign onto the product (caller semantics).
const apply = (prod, patch) => ({ ...prod, ...patch });
const afterV1 = apply({ id: 'prod-1' }, P1);

// Second upload — v1 snapshot retained, version bumps.
const P2 = proofUploadPatch({
  product: afterV1,
  file: { file_url: 'https://files/v2.pdf', file_name: 'letters-v2.pdf' }, // UploadFile-shaped keys
  actor: 'brett', now: T2,
});
assert.equal(P2.proof_version, 2, 'second upload → v2');
assert.equal(P2.proof_status, 'draft');
assert.equal(P2.proof_submitted_at, T2);
assert.equal(P2.proof_history.length, 1, 'one prior version retained');
assert.deepEqual(P2.proof_history[0], {
  proof_file_url: 'https://files/v1.pdf',
  proof_file_name: 'letters-v1.pdf',
  proof_version: 1,
  replaced_at: T2,
  replaced_by: 'brett',
}, 'history row snapshots the REPLACED file with actor+time');

// === History retention across 2 uploads =====================================
const afterV2 = apply(afterV1, P2);
const P3 = proofUploadPatch({
  product: afterV2,
  file: { url: 'https://files/v3.pdf', name: 'letters-v3.pdf' },
  actor: 'kim@shop', now: T3,
});
assert.equal(P3.proof_version, 3, 'third upload → v3');
assert.equal(P3.proof_history.length, 2, 'both priors retained');
assert.equal(P3.proof_history[0].proof_version, 1, 'append order: oldest first');
assert.equal(P3.proof_history[1].proof_version, 2);
assert.equal(P3.proof_history[1].replaced_at, T3, 'each row stamped at its replacement');
assert.equal(P3.proof_history[1].replaced_by, 'kim@shop');

const afterV3 = apply(afterV2, P3);
const hist = proofHistory(afterV3);
assert.equal(hist.length, 2);
assert.equal(hist[0].proof_version, 2, 'proofHistory returns newest-first');
assert.equal(hist[1].proof_version, 1);
assert.equal(proofHistory({}).length, 0, 'no history → empty');
assert.equal(proofHistory({ proof_history: ['junk', { proof_file_url: 'u', proof_version: '4' }] })[0].proof_version, 4,
  'history normalizes: junk dropped, version coerced');

// === Stale-approval preservation (E-05 signal) ==============================
const approvedProduct = {
  id: 'prod-2',
  proof_file_url: 'https://files/approved-v1.pdf',
  proof_file_name: 'approved-v1.pdf',
  proof_version: 1,
  proof_status: 'approved',
  proof_approved_version: 1,
  proof_sent_at: '2026-11-01T08:00:00.000Z',
};
const stalePatch = proofUploadPatch({
  product: approvedProduct,
  file: { url: 'https://files/v2.pdf', name: 'v2.pdf' },
  actor: 'design@shop', now: T2,
});
assert.equal(stalePatch.proof_status, 'draft', 'new upload resets approval state');
assert.equal(stalePatch.proof_version, 2);
assert.ok(!('proof_approved_version' in stalePatch),
  'DOCUMENTED: patch does not clear proof_approved_version — v1 pointer survives');
const staleMerged = apply(approvedProduct, stalePatch);
assert.equal(staleMerged.proof_approved_version, 1, 'approved_version still points at old version');
assert.ok(staleMerged.proof_version > staleMerged.proof_approved_version,
  'version lag IS the stale-proof signal E-05 consumes');
assert.equal(staleMerged.proof_history.length, 1, 'approved file still rotates into history');
assert.equal(staleMerged.proof_sent_at, '2026-11-01T08:00:00.000Z', 'sent_at untouched by upload patch');

// === Part target ============================================================
const partProduct = {
  id: 'prod-3',
  proof_version: 4, // product's own proof state must NOT leak into part writes
  proof_file_url: 'https://files/prod.pdf',
  parts: [
    { id: 'pt-1', name: 'Face' },
    { id: 'pt-2', name: 'Return', part_key: 'RK' },
  ],
};
const partPatch = proofUploadPatch({
  product: partProduct,
  file: { url: 'https://files/pt2-v1.svg', name: 'pt2-v1.svg' },
  actor: 'shop', now: T1, target: 'part', part_id: 'pt-2',
});
assert.ok(Array.isArray(partPatch.parts), 'part patch returns rebuilt parts array');
assert.equal(partPatch.parts.length, 2, 'parts length preserved');
assert.equal(partPatch.parts[0].name, 'Face', 'other parts untouched');
assert.ok(!('proof_version' in partPatch.parts[0]), 'untouched part gains no proof fields');
assert.equal(partPatch.parts[1].proof_version, 1, 'part versions independently — product v4 ignored');
assert.equal(partPatch.parts[1].proof_file_url, 'https://files/pt2-v1.svg');
assert.equal(partPatch.parts[1].proof_status, 'draft');
assert.deepEqual(partPatch.parts[1].proof_history, []);
assert.ok(!('proof_file_url' in partPatch) && !('proof_version' in partPatch),
  'part patch carries NO product-level proof_* keys');

// Second part upload → history on the part; other parts still untouched.
const partMerged = apply(partProduct, partPatch);
const partPatch2 = proofUploadPatch({
  product: partMerged,
  file: { url: 'https://files/pt2-v2.svg', name: 'pt2-v2.svg' },
  actor: 'shop', now: T2, target: 'part', part_id: 'pt-2',
});
assert.equal(partPatch2.parts[1].proof_version, 2, 'part v2');
assert.equal(partPatch2.parts[1].proof_history.length, 1, 'part history retained');
assert.equal(partPatch2.parts[1].proof_history[0].proof_version, 1);
assert.equal(partPatch2.parts[1].proof_history[0].proof_file_name, 'pt2-v1.svg');
assert.equal(partPatch2.parts[0].name, 'Face', 'sibling part untouched on repeat');

// part_key also resolves; map-shaped parts storage keeps map shape.
const mapProduct = { parts: { 'pt-a': { part_key: 'K1' }, 'pt-b': { part_key: 'K2' } } };
const mapPatch = proofUploadPatch({
  product: mapProduct, file: { url: 'u', name: 'n.pdf' },
  target: 'part', part_id: 'K2', // resolves via part_key
});
assert.ok(!Array.isArray(mapPatch.parts) && typeof mapPatch.parts === 'object', 'map storage → map patch');
assert.equal(mapPatch.parts['pt-b'].proof_version, 1, 'matched by part_key');
assert.deepEqual(mapPatch.parts['pt-a'], { part_key: 'K1' }, 'map siblings untouched');

// Fail-closed paths.
assert.equal(proofUploadPatch({ product: partProduct, file: { url: 'u', name: 'n' }, target: 'part', part_id: 'nope' }),
  null, 'missing part → null (no-op)');
assert.equal(proofUploadPatch({ product: partProduct, file: { url: 'u', name: 'n' }, target: 'part' }),
  null, 'part target without part_id → null');
assert.equal(proofUploadPatch({ product: partProduct, file: { url: 'u', name: 'n' }, target: 'weird' }),
  null, 'unknown target → null');
assert.equal(proofUploadPatch({ product: partProduct, file: { name: '' } }), null, 'blank file → null');
assert.equal(proofUploadPatch({ product: null, file: { url: 'u' } }), null, 'null product → null');
assert.equal(proofUploadPatch({ file: { url: 'u' } }), null, 'missing product → null');

// === currentProofFor ========================================================
assert.equal(currentProofFor({}), null, 'never uploaded → null');
assert.equal(currentProofFor(null), null, 'null record → null');
assert.deepEqual(currentProofFor(afterV3), {
  url: 'https://files/v3.pdf',
  name: 'letters-v3.pdf',
  version: 3,
  status: 'draft',
  sent_at: '',
}, 'current proof after v3');
assert.equal(currentProofFor(staleMerged).version, 2);
assert.equal(currentProofFor(staleMerged).sent_at, '2026-11-01T08:00:00.000Z', 'sent_at surfaced');
assert.equal(currentProofFor({ proof_status: 'awaiting_approval', proof_version: 2 }).status,
  'awaiting_approval', 'status surfaces; missing file tolerated when version set');
assert.equal(currentProofFor({ proof_file_url: 'u' }).status, 'none', 'status defaults none');

// Part-aware readers.
const partMerged2 = apply(partMerged, partPatch2);
assert.equal(currentProofFor(partMerged2, { part_id: 'pt-2' }).version, 2, 'currentProofFor resolves part');
assert.equal(proofHistory(partMerged2, { part_id: 'pt-2' })[0].proof_version, 1, 'proofHistory resolves part');
assert.equal(currentProofFor(partMerged2, { part_id: 'ghost' }), null, 'ghost part → null');
assert.deepEqual(proofHistory(partMerged2, { part_id: 'ghost' }), [], 'ghost part → empty history');
assert.equal(currentProofFor(partMerged2.parts[1]).version, 2, 'part record readable directly');
assert.equal(proofHistory(partMerged2.parts[1])[0].proof_file_name, 'pt2-v1.svg', 'part history readable directly');

// === No-mutation guarantee ==================================================
const frozen = Object.freeze({ proof_version: 1, proof_file_url: 'u', proof_history: Object.freeze([]) });
const fp = proofUploadPatch({ product: frozen, file: { url: 'v2', name: 'n' }, now: T1 });
assert.equal(fp.proof_version, 2, 'patch computed on frozen input without mutation');
assert.equal(frozen.proof_version, 1, 'input untouched');

rmSync(out, { recursive: true, force: true });
console.log('PASS proof-pipeline');
