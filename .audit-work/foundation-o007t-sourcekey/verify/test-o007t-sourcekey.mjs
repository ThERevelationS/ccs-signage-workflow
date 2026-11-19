// O-007 (CMP-A07) remainder — ai_engineering_data.source_key template-apply
// provenance stamp. Bundles the CANDIDATE foundationTemplateModel (dep:
// baseline foundationAssemblyModel), the CANDIDATE FoundationTemplateDialog
// (model dep redirected to CANDIDATE), and the real BASELINE
// AiEngineeringAssistant + foundationAiReview producer/consumer chain so the
// stale-label computation exercised is the deployed code, not a replica.
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const UNIT = '.audit-work/foundation-o007t-sourcekey';
const CAND = `${UNIT}/candidates/src/components/estimator/foundation`;
const BASE = `${UNIT}/baseline`;

let passed = 0, failed = 0;
const ok = async (n, fn) => { try { await fn(); passed++; console.log('ok', n); } catch (e) { failed++; console.error('FAIL', n, '-', e.message); } };

const STUBS = {
  '@/api/base44Client': `export const base44={entities:{ProjectTemplate:{get:(id)=>globalThis.__tplGet(id)}},integrations:{Core:{InvokeLLM:async()=>{throw new Error('offline')}}}};`,
  '@/components/ui/dialog': `export const Dialog=(p)=>p?.children??null;export const DialogContent=(p)=>p?.children??null;export const DialogHeader=(p)=>p?.children??null;export const DialogTitle=(p)=>p?.children??null;`,
  'lucide-react': `export const Trash2=()=>null;export const Cpu=()=>null;export const Loader2=()=>null;`,
  'react-markdown': `export default function RM({children}){return children??null;}`,
  '@/components/estimator/products/reusableSaveIdempotency': `export const ensureReusableRecord=(a)=>(globalThis.__tplSave||((x)=>({id:'t1',...x.data})))(a);`,
  '@/components/estimator/builder/builderEntityPersistence': `export const deleteEntityIfUnchanged=async(a)=>{globalThis.__deletes.push(a);return true;};`,
  '@/components/estimator/loadAllEntityRows': `export const loadAllEntityRows=async()=>{if(globalThis.__tplLoad)return globalThis.__tplLoad();if(globalThis.__tplLoadErr)throw globalThis.__tplLoadErr;return globalThis.__tplRows||[];};`,
  '@/components/estimator/idempotentEntityCreate': `let __n=0;export const newCreationRequestKey=(k)=>'k-'+(k||'x')+'-'+(++__n);export const ensureIdempotentEntityCreate=(...a)=>(globalThis.__ensureIdempotent||((x)=>x))(...a);`,
};

const REDIRECT = {
  './foundationAssemblyModel': path.resolve(`${BASE}/foundationAssemblyModel.js`),
  './foundationAssemblyModel.js': path.resolve(`${BASE}/foundationAssemblyModel.js`),
  './foundationTemplateModel': path.resolve(`${CAND}/foundationTemplateModel.js`),
  './foundationTemplateModel.js': path.resolve(`${CAND}/foundationTemplateModel.js`),
  './foundationAiReview': path.resolve(`${BASE}/foundationAiReview.js`),
  './foundationAiReview.js': path.resolve(`${BASE}/foundationAiReview.js`),
  './foundationTemplateService': path.resolve(`${BASE}/foundationTemplateService.js`),
  './foundationTemplateService.js': path.resolve(`${BASE}/foundationTemplateService.js`),
  // foundationAiReview imports the shared model policy four levels up; from the
  // flat baseline dir that path does not resolve — point it at the baseline pull.
  '../../../../base44/shared/estimatorAiModelPolicy.js': path.resolve(`${BASE}/base44/shared/estimatorAiModelPolicy.js`),
};

const plugin = { name: 'stubs', setup(b) {
  b.onResolve({ filter: /.*/ }, a => {
    if (STUBS[a.path]) return { path: a.path, namespace: 'stub' };
    if (REDIRECT[a.path]) return { path: REDIRECT[a.path] };
    return undefined;
  });
  b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: STUBS[a.path], loader: 'js' }));
}};

const mk = async (entry, out) => {
  const r = await esbuild.build({ entryPoints: [path.resolve(entry)], bundle: true, format: 'esm', platform: 'node', write: false, plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, external: ['react', 'react-dom', 'react-test-renderer'] });
  fs.writeFileSync(out, r.outputFiles[0].text);
  return import(pathToFileURL(path.resolve(out)).href);
};

fs.mkdirSync(`${UNIT}/verify`, { recursive: true });
const model = await mk(`${CAND}/foundationTemplateModel.js`, `${UNIT}/verify/model.candidate.bundle.mjs`);
const dlgMod = await mk(`${CAND}/FoundationTemplateDialog.jsx`, `${UNIT}/verify/dlg.candidate.bundle.mjs`);
const review = await mk(`${BASE}/foundationAiReview.js`, `${UNIT}/verify/aiReview.baseline.bundle.mjs`);
const asstMod = await mk(`${BASE}/AiEngineeringAssistant.jsx`, `${UNIT}/verify/assistant.baseline.bundle.mjs`);
const { createFoundationTemplateSnapshot, prepareFoundationTemplatePatch, FOUNDATION_TEMPLATE_FIELDS } = model;
const { prepareFoundationAiReview, foundationAiReviewPatch, FOUNDATION_AI_REVIEW_POLICY } = review;
const Dialog = dlgMod.default;
const Assistant = asstMod.default;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = { confirm: () => true };
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

let idSeq = 0;
const ids = (kind) => `${kind}_${idSeq++}`;
const APPLIED_AT = '2026-11-08T12:00:00.000Z';

// A source project whose AI review was produced by the REAL writer path:
// prepareFoundationAiReview -> foundationAiReviewPatch. Its ai_engineering_data
// is therefore byte-identical to what a live project record holds.
const srcProject = () => ({
  id: 'src-proj-1',
  project_name: 'Source',
  client_name: 'Cust A',
  updated_date: '2026-11-01T00:00:00Z',
  items: [{ component_id: 'it1', foundation_type: 'spread_foot', quantity: 2, length_inches: 36, width_inches: 36, depth_inches: 12 }],
  poles: [{ component_id: 'p1', height_inches: 240, signs: [] }],
  project_concrete_type: '4000psi',
});

const reviewedSource = () => {
  const p = srcProject();
  const { key } = prepareFoundationAiReview(p);
  const patch = foundationAiReviewPatch(
    { recommendation_markdown: 'preliminary findings', information_gaps: ['verify soil'] },
    { sourceKey: key, generatedAt: '2026-11-01T01:00:00Z' });
  return { ...p, ...patch };
};

// ---------- model: provenance stamp on apply ----------

await ok('apply stamps ai_engineering_data: source_key kept verbatim + origin_source_key + template_applied + applied_at', async () => {
  const src = reviewedSource();
  const srcKey = src.ai_engineering_data.source_key;
  const stored = JSON.parse(JSON.stringify(createFoundationTemplateSnapshot(src, { createId: ids })));
  const patch = prepareFoundationTemplatePatch(stored, { createId: ids, appliedAt: APPLIED_AT });
  const d = patch.ai_engineering_data;
  assert.ok(d, 'ai_engineering_data present in patch');
  assert.equal(d.source_key, srcKey, 'source_key preserved verbatim');
  assert.equal(d.origin_source_key, srcKey, 'origin_source_key records the analyzed-design key');
  assert.equal(d.template_applied, true);
  assert.equal(d.template_applied_at, APPLIED_AT);
  // Review fields travel verbatim.
  assert.equal(d.review_status, 'preliminary_only');
  assert.equal(d.engineering_approved, false);
  assert.deepEqual(d.information_gaps, ['verify soil']);
  assert.equal(d.policy_version, FOUNDATION_AI_REVIEW_POLICY);
  assert.equal(d.generated_at, '2026-11-01T01:00:00Z');
  assert.equal(d.model, 'gpt_6_sol');
});

await ok('apply defaults template_applied_at to a valid ISO timestamp when appliedAt not injected', async () => {
  const patch = prepareFoundationTemplatePatch(
    { ai_engineering_data: { source_key: 'k1', policy_version: 'p' } },
    { createId: ids });
  assert.equal(patch.ai_engineering_data.template_applied, true);
  assert.ok(Number.isFinite(Date.parse(patch.ai_engineering_data.template_applied_at)));
});

await ok('absent ai_engineering_data stays absent (target keeps its own); null travels as null', async () => {
  const p1 = prepareFoundationTemplatePatch({ items: [{ component_id: 'a' }] }, { createId: ids });
  assert.ok(!('ai_engineering_data' in p1));
  const p2 = prepareFoundationTemplatePatch({ ai_engineering_data: null }, { createId: ids });
  assert.equal(p2.ai_engineering_data, null);
});

await ok('malformed ai_engineering_data fails closed at apply (string/array/number)', async () => {
  for (const bad of ['text', [1, 2], 42]) {
    assert.throws(() => prepareFoundationTemplatePatch({ ai_engineering_data: bad }, { createId: ids }),
      /ai_engineering_data must be a record/);
  }
});

await ok('record without source_key gets origin_source_key null + template flag (foreign note, no false key)', async () => {
  const patch = prepareFoundationTemplatePatch(
    { ai_engineering_data: { review_status: 'preliminary_only', policy_version: 'p' } },
    { createId: ids, appliedAt: APPLIED_AT });
  assert.equal(patch.ai_engineering_data.origin_source_key, null);
  assert.equal(patch.ai_engineering_data.template_applied, true);
});

await ok('chained templates preserve the EARLIEST origin_source_key; apply time updates', async () => {
  // A project that received a template apply (stamped) is saved as a template
  // and applied again — the original analyzed-design key must survive.
  const onceApplied = {
    ai_engineering_data: {
      source_key: 'K_A', origin_source_key: 'K_A', template_applied: true,
      template_applied_at: '2026-11-05T00:00:00Z', policy_version: 'p',
    },
  };
  const patch = prepareFoundationTemplatePatch(onceApplied, { createId: ids, appliedAt: APPLIED_AT });
  assert.equal(patch.ai_engineering_data.origin_source_key, 'K_A');
  assert.equal(patch.ai_engineering_data.template_applied_at, APPLIED_AT);
  assert.equal(patch.ai_engineering_data.template_applied, true);
});

await ok('snapshot stores ai_engineering_data VERBATIM (no provenance stamp at rest)', async () => {
  const src = reviewedSource();
  const snap = createFoundationTemplateSnapshot(src, { createId: ids });
  assert.deepEqual(snap.ai_engineering_data, src.ai_engineering_data);
  assert.ok(!('template_applied' in snap.ai_engineering_data));
  assert.ok(!('origin_source_key' in snap.ai_engineering_data));
});

// ---------- consumer: baseline assistant renders the stale branch ----------

const findText = (c, s) => c.root.findAll(el => el?.props?.children === s).length > 0;

await ok('baseline assistant on the SOURCE project shows "Preliminary review" (control)', async () => {
  const src = reviewedSource();
  let c;
  await act(async () => { c = TestRenderer.create(React.createElement(Assistant, { project: src, onResult: () => true })); });
  await flush();
  assert.ok(findText(c, 'Preliminary review'), 'control label missing');
  assert.ok(!findText(c, 'Design changed since this note. Run a fresh review.'));
  await act(async () => { c.unmount(); });
});

await ok('round-trip: snapshot -> stored -> apply -> merge -> assistant shows stale banner, never "Preliminary review"', async () => {
  const src = reviewedSource();
  const stored = JSON.parse(JSON.stringify(createFoundationTemplateSnapshot(src, { createId: ids })));
  const patch = prepareFoundationTemplatePatch(stored, { createId: ids, appliedAt: APPLIED_AT });
  const target = {
    id: 'dst-proj-9', project_name: 'Target', client_name: 'Cust B',
    updated_date: '2026-11-07T00:00:00Z',
    items: [], poles: [], walls: [], wall_caps: [], signage_cabinets: [],
  };
  const merged = { ...target, ...patch };
  // Merged record carries the stamp on a DIFFERENT project id.
  assert.equal(merged.id, 'dst-proj-9');
  assert.equal(merged.ai_engineering_data.template_applied, true);
  assert.equal(merged.ai_engineering_data.origin_source_key, merged.ai_engineering_data.source_key);
  let c;
  await act(async () => { c = TestRenderer.create(React.createElement(Assistant, { project: merged, onResult: () => true })); });
  await flush();
  assert.ok(findText(c, 'Design changed since this note. Run a fresh review.'),
    'stale banner label not rendered');
  assert.ok(!findText(c, 'Preliminary review'), 'carried note must never claim current review');
  // Recommendation markdown still rendered under the banner.
  assert.ok(findText(c, 'preliminary findings'), 'carried markdown missing');
  await act(async () => { c.unmount(); });
});

await ok('stamp fields alone never flip the consumer to a non-stale label', async () => {
  // Even if template_applied/origin_source_key are present, the label is
  // decided by policy_version + source_key vs live key — assert the carried
  // record cannot masquerade as current on any prepared target.
  const src = reviewedSource();
  const stored = JSON.parse(JSON.stringify(createFoundationTemplateSnapshot(src, { createId: ids })));
  const patch = prepareFoundationTemplatePatch(stored, { createId: ids });
  const target = { id: 'dst-2', items: [{ component_id: 'x', foundation_type: 'drilled_pier', quantity: 1, depth_inches: 48, diameter_inches: 12 }] };
  const merged = { ...target, ...patch };
  const liveKey = prepareFoundationAiReview(merged).key;
  assert.notEqual(merged.ai_engineering_data.source_key, liveKey,
    'carried source_key must differ from the target live design key');
});

// ---------- dialog candidate: staleness indicator ----------

const mountDlg = async (props = {}) => {
  globalThis.__tplRows = props.rows ?? []; globalThis.__tplLoadErr = null; globalThis.__tplSave = null;
  globalThis.__deletes = []; globalThis.__tplLoad = null; globalThis.__tplGet = async (id) => ({ id });
  let c;
  await act(async () => {
    c = TestRenderer.create(React.createElement(Dialog, {
      open: true, mode: 'load', onClose: () => {},
      project: { id: 'p', items: [] },
      onApply: () => true,
      ...props,
    }));
  });
  await flush();
  return c;
};

await ok('template row shows "Includes an AI review note" indicator only when the stored template carries one', async () => {
  const src = reviewedSource();
  const withNote = { id: 't1', template_name: 'With AI', project_data: createFoundationTemplateSnapshot(src, { createId: ids }) };
  const bare = { id: 't2', template_name: 'Bare', project_data: { items: [{ component_id: 'a' }] } };
  const c = await mountDlg({ rows: [withNote, bare] });
  const rows = c.root.findAll(el => el?.props?.className?.includes?.('divide-y'));
  assert.ok(findText(c, 'Includes an AI review note — stale on this project'),
    'indicator missing for template carrying a review');
  // Exactly one indicator across two rows (bare template must not flag).
  const count = c.root.findAll(el => el?.props?.children === 'Includes an AI review note — stale on this project').length;
  assert.equal(count, 1);
  await act(async () => { c.unmount(); });
});

console.log(`\n${failed ? 'FAIL' : 'PASS'} o007t-sourcekey (${passed} passed, ${failed} failed)`);
process.exit(failed ? 1 : 0);
