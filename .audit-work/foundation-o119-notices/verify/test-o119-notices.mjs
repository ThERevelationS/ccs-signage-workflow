// O-119 (CMP-I18) verification — persistent "Preliminary estimating only -
// final engineering required" notice. Bundles the CANDIDATE
// foundationPreliminaryNotice (constant + component), CANDIDATE
// foundationTemplateModel (deps: baseline foundationAssemblyModel + candidate
// notice), CANDIDATE convertToBrickStone (staff/idempotency deps stubbed),
// CANDIDATE FoundationSectionBanner and CANDIDATE FoundationTemplateDialog
// (model dep redirected to CANDIDATE, service to BASELINE) so the exercised
// code is the proposed code, not a replica.
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const UNIT = '.audit-work/foundation-o119-notices';
const CAND = `${UNIT}/candidates/src/components/estimator/foundation`;
const BASE = `${UNIT}/baseline`;
const NOTICE = 'Preliminary estimating only - final engineering required';

let passed = 0, failed = 0;
const ok = async (n, fn) => { try { await fn(); passed++; console.log('ok', n); } catch (e) { failed++; console.error('FAIL', n, '-', e.message); } };

const STUBS = {
  '@/api/base44Client': `export const base44={entities:{ProjectTemplate:{get:(id)=>globalThis.__tplGet(id)}},integrations:{Core:{InvokeLLM:async()=>{throw new Error('offline')}}}};`,
  '@/components/ui/dialog': `export const Dialog=(p)=>p?.children??null;export const DialogContent=(p)=>p?.children??null;export const DialogHeader=(p)=>p?.children??null;export const DialogTitle=(p)=>p?.children??null;`,
  'lucide-react': `export const Trash2=()=>null;export const ChevronUp=()=>null;export const ChevronDown=()=>null;export const Info=()=>null;export const AlertTriangle=()=>null;export const X=()=>null;`,
  '@/components/estimator/products/reusableSaveIdempotency': `export const ensureReusableRecord=(a)=>(globalThis.__tplSave||((x)=>({id:'t1',...x.data})))(a);`,
  '@/components/estimator/builder/builderEntityPersistence': `export const deleteEntityIfUnchanged=async(a)=>{globalThis.__deletes.push(a);return true;};`,
  '@/components/estimator/loadAllEntityRows': `export const loadAllEntityRows=async()=>{if(globalThis.__tplLoad)return globalThis.__tplLoad();if(globalThis.__tplLoadErr)throw globalThis.__tplLoadErr;return globalThis.__tplRows||[];};`,
  '@/components/estimator/idempotentEntityCreate': `let __n=0;export const newCreationRequestKey=(k)=>'k-'+(k||'x')+'-'+(++__n);export const ensureIdempotentEntityCreate=async(a)=>{if(globalThis.__ensureIdempotent)return globalThis.__ensureIdempotent(a);return {id:'created-1',...a.data};};`,
  '@/components/staff/staffEntities': `export const staffEntities={BrickStoneProject:{}};`,
};

const REDIRECT = {
  './foundationAssemblyModel': path.resolve(`${BASE}/foundationAssemblyModel.js`),
  './foundationAssemblyModel.js': path.resolve(`${BASE}/foundationAssemblyModel.js`),
  './foundationTemplateModel': path.resolve(`${CAND}/foundationTemplateModel.js`),
  './foundationTemplateModel.js': path.resolve(`${CAND}/foundationTemplateModel.js`),
  './foundationPreliminaryNotice': path.resolve(`${CAND}/foundationPreliminaryNotice.js`),
  './foundationPreliminaryNotice.js': path.resolve(`${CAND}/foundationPreliminaryNotice.js`),
  './foundationTemplateService': path.resolve(`${BASE}/foundationTemplateService.js`),
  './foundationTemplateService.js': path.resolve(`${BASE}/foundationTemplateService.js`),
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
const notice = await mk(`${CAND}/foundationPreliminaryNotice.js`, `${UNIT}/verify/notice.candidate.bundle.mjs`);
const model = await mk(`${CAND}/foundationTemplateModel.js`, `${UNIT}/verify/model.candidate.bundle.mjs`);
const conv = await mk(`${CAND}/convertToBrickStone.js`, `${UNIT}/verify/convert.candidate.bundle.mjs`);
const dlgMod = await mk(`${CAND}/FoundationTemplateDialog.jsx`, `${UNIT}/verify/dlg.candidate.bundle.mjs`);
const bannerMod = await mk(`${CAND}/FoundationSectionBanner.jsx`, `${UNIT}/verify/banner.candidate.bundle.mjs`);

const { PRELIMINARY_NOTICE_TEXT, hasPreliminaryNotice, ensurePreliminaryNotice, PreliminaryNotice } = notice;
const { createFoundationTemplateSnapshot, prepareFoundationTemplatePatch } = model;
const { convertFoundationToBrickStone } = conv;
const Dialog = dlgMod.default;
const Banner = bannerMod.default;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = { confirm: () => true };
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const findText = (c, s) => c.root.findAll(el => el?.props?.children === s).length > 0;
const containsText = (c, s) => c.root.findAll(el => {
  const ch = el?.props?.children;
  if (typeof ch === 'string') return ch.includes(s);
  if (Array.isArray(ch)) return ch.filter(x => typeof x === 'string').join('').includes(s);
  return false;
}).length > 0;
const statuses = (c) => c.root.findAll(el => el?.props?.role === 'status');
const alerts = (c) => c.root.findAll(el => el?.props?.role === 'alert');

let idSeq = 0;
const ids = (kind) => `${kind}_${idSeq++}`;

// ---------- constant + pure helpers ----------

await ok('PRELIMINARY_NOTICE_TEXT is the verbatim O-119 acceptance sentence', async () => {
  assert.equal(PRELIMINARY_NOTICE_TEXT, 'Preliminary estimating only - final engineering required');
});

await ok('ensurePreliminaryNotice prepends the notice once (empty, plain, stamped, idempotent)', async () => {
  assert.equal(ensurePreliminaryNotice(''), NOTICE);
  assert.equal(ensurePreliminaryNotice('   '), NOTICE);
  assert.equal(ensurePreliminaryNotice('Call before you dig.'), `${NOTICE}\n\nCall before you dig.`);
  const stamped = ensurePreliminaryNotice('Call before you dig.');
  assert.equal(ensurePreliminaryNotice(stamped), stamped, 'double-stamp must be verbatim');
  assert.equal(ensurePreliminaryNotice(`${NOTICE}\n\nLegacy note`), `${NOTICE}\n\nLegacy note`);
  assert.equal(ensurePreliminaryNotice(`mid ${NOTICE} note`), `mid ${NOTICE} note`, 'mid-text sentence counts as carried');
});

await ok('ensurePreliminaryNotice: null/undefined -> notice alone; non-string fails closed', async () => {
  assert.equal(ensurePreliminaryNotice(undefined), NOTICE);
  assert.equal(ensurePreliminaryNotice(null), NOTICE);
  for (const bad of [42, { a: 1 }, ['x']]) {
    assert.throws(() => ensurePreliminaryNotice(bad), /string notes/);
  }
});

await ok('hasPreliminaryNotice detects only the canonical sentence', async () => {
  assert.equal(hasPreliminaryNotice(`${NOTICE}\n\nx`), true);
  assert.equal(hasPreliminaryNotice('preliminary only'), false);
  assert.equal(hasPreliminaryNotice(''), false);
  assert.equal(hasPreliminaryNotice(null), false);
  assert.equal(hasPreliminaryNotice(42), false);
});

// ---------- template model: snapshot stamp ----------

const srcProject = (over = {}) => ({
  id: 'src-proj-1',
  project_name: 'Source',
  client_name: 'Cust A',
  updated_date: '2026-11-01T00:00:00Z',
  items: [{ component_id: 'it1', foundation_type: 'spread_foot', quantity: 2, length_inches: 36, width_inches: 36, depth_inches: 12 }],
  poles: [],
  project_concrete_type: '4000psi',
  ...over,
});

await ok('snapshot stamps notes preamble: stored template leads with the notice', async () => {
  const snap = createFoundationTemplateSnapshot(srcProject({ notes: 'Call before you dig.' }), { createId: ids });
  assert.equal(snap.notes, `${NOTICE}\n\nCall before you dig.`);
});

await ok('snapshot: absent notes stays absent; null travels; blank becomes the notice', async () => {
  const bare = createFoundationTemplateSnapshot(srcProject(), { createId: ids });
  assert.ok(!('notes' in bare), 'absent notes must not materialize on snapshot');
  const nulled = createFoundationTemplateSnapshot(srcProject({ notes: null }), { createId: ids });
  assert.equal(nulled.notes, null);
  const blank = createFoundationTemplateSnapshot(srcProject({ notes: '  ' }), { createId: ids });
  assert.equal(blank.notes, NOTICE);
});

await ok('snapshot: already-stamped notes verbatim; malformed notes fails closed; source not mutated', async () => {
  const stampedNotes = `${NOTICE}\n\nKept`;
  const p = srcProject({ notes: stampedNotes });
  const snap = createFoundationTemplateSnapshot(p, { createId: ids });
  assert.equal(snap.notes, stampedNotes);
  assert.equal(p.notes, stampedNotes, 'source project.notes must not be mutated');
  assert.throws(() => createFoundationTemplateSnapshot(srcProject({ notes: 42 }), { createId: ids }),
    /notes must be a string/);
});

// ---------- template model: apply stamp ----------

await ok('apply stamps a pre-change (unstamped) stored template note; stamped stays verbatim', async () => {
  const legacy = { notes: 'Legacy note text', items: [{ component_id: 'a' }] };
  const patch1 = prepareFoundationTemplatePatch(legacy, { createId: ids });
  assert.equal(patch1.notes, `${NOTICE}\n\nLegacy note text`);
  const stamped = { notes: `${NOTICE}\n\nKept`, items: [{ component_id: 'a' }] };
  const patch2 = prepareFoundationTemplatePatch(stamped, { createId: ids });
  assert.equal(patch2.notes, `${NOTICE}\n\nKept`, 'no double-stamp on apply');
});

await ok('apply: absent notes absent (target preserved); null -> null; malformed throws', async () => {
  const p1 = prepareFoundationTemplatePatch({ items: [{ component_id: 'a' }] }, { createId: ids });
  assert.ok(!('notes' in p1), 'absent template notes must not clobber target notes');
  const p2 = prepareFoundationTemplatePatch({ notes: null }, { createId: ids });
  assert.equal(p2.notes, null);
  for (const bad of [42, { t: 'x' }, ['n']]) {
    assert.throws(() => prepareFoundationTemplatePatch({ notes: bad }, { createId: ids }),
      /notes must be a string/);
  }
});

await ok('chained save -> apply -> merge -> re-save keeps exactly one notice', async () => {
  const snap = createFoundationTemplateSnapshot(srcProject({ notes: 'Original note.' }), { createId: ids });
  const stored = JSON.parse(JSON.stringify(snap));
  const patch = prepareFoundationTemplatePatch(stored, { createId: ids });
  const merged = { ...srcProject({ id: 'dst-9' }), ...patch };
  assert.equal((merged.notes.match(/final engineering required/g) || []).length, 1);
  const resnap = createFoundationTemplateSnapshot(merged, { createId: ids });
  assert.equal((resnap.notes.match(/final engineering required/g) || []).length, 1);
  assert.equal(resnap.notes, `${NOTICE}\n\nOriginal note.`);
});

await ok('apply keeps the O-007t ai stamp + assembly cloning intact alongside the notes stamp', async () => {
  const data = {
    notes: 'n',
    ai_engineering_data: { source_key: 'K', policy_version: 'p' },
    items: [{ component_id: 'it1', foundation_type: 'spread_foot' }],
  };
  const patch = prepareFoundationTemplatePatch(data, { createId: ids, appliedAt: '2026-11-08T12:00:00Z' });
  assert.equal(patch.ai_engineering_data.template_applied, true);
  assert.equal(patch.ai_engineering_data.origin_source_key, 'K');
  assert.notEqual(patch.items[0].component_id, 'it1', 'assembly ids must be re-minted');
  assert.equal(patch.notes, `${NOTICE}\n\nn`);
});

// ---------- convertToBrickStone: authored notes carry the notice ----------

await ok('convertFoundationToBrickStone authors notes leading with the notice', async () => {
  let seen;
  globalThis.__ensureIdempotent = async (a) => { seen = a.data; return { id: 'bs-1', ...a.data }; };
  const draft = await convertFoundationToBrickStone({
    project: { id: 'f-1', project_name: 'Front Sign', client_name: 'Cust' },
  });
  assert.equal(draft.id, 'bs-1');
  assert.ok(seen.notes.startsWith(`${NOTICE}\n\n`), `notes must lead with notice: ${seen.notes}`);
  assert.ok(seen.notes.includes('Converted from Foundation project "Front Sign" (f-1).'), 'original note text preserved');
  globalThis.__ensureIdempotent = null;
});

// ---------- component: PreliminaryNotice ----------

await ok('PreliminaryNotice renders role="status" (never role="alert") with the canonical sentence', async () => {
  let c;
  await act(async () => { c = TestRenderer.create(React.createElement(PreliminaryNotice)); });
  assert.equal(statuses(c).length, 1);
  assert.equal(alerts(c).length, 0);
  assert.ok(findText(c, NOTICE));
  // non-dismissible default: no dismiss control
  assert.equal(c.root.findAll(el => el?.props?.['aria-label'] === 'Dismiss preliminary notice').length, 0);
  await act(async () => { c.unmount(); });
});

await ok('PreliminaryNotice dismissible=true hides for that view only', async () => {
  let c;
  await act(async () => { c = TestRenderer.create(React.createElement(PreliminaryNotice, { dismissible: true })); });
  assert.equal(statuses(c).length, 1);
  const btn = c.root.find(el => el?.props?.['aria-label'] === 'Dismiss preliminary notice');
  await act(async () => { btn.props.onClick(); });
  assert.equal(statuses(c).length, 0, 'dismissed view must render nothing');
  // remount restores — per-view dismissal only
  await act(async () => { c.unmount(); });
  await act(async () => { c = TestRenderer.create(React.createElement(PreliminaryNotice, { dismissible: true })); });
  assert.equal(statuses(c).length, 1, 'remount restores the notice');
  await act(async () => { c.unmount(); });
});

// ---------- component: FoundationSectionBanner mount ----------

await ok('FoundationSectionBanner mounts the notice persistent — visible expanded AND collapsed', async () => {
  let c;
  await act(async () => { c = TestRenderer.create(React.createElement(Banner, { sectionName: 'Front Sign' })); });
  assert.equal(statuses(c).length, 1, 'notice missing on expanded banner');
  assert.ok(findText(c, NOTICE));
  // Collapse the section explainer; the notice (a sibling, not a child of the
  // collapsible span) must remain — persistent per concept.
  const toggle = c.root.find(el => typeof el?.props?.onClick === 'function' && el?.props?.className?.includes?.('bg-white'));
  await act(async () => { toggle.props.onClick(); });
  assert.equal(statuses(c).length, 1, 'notice must survive banner collapse');
  assert.ok(findText(c, NOTICE));
  assert.ok(!containsText(c, 'save here and the total flows'), 'explainer text must be collapsed');
  await act(async () => { c.unmount(); });
});

// ---------- component: FoundationTemplateDialog disclosure + row indicator ----------

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

await ok('dialog save mode discloses the notes preamble stamp', async () => {
  const c = await mountDlg({ mode: 'save', project: { id: 'p', items: [], notes: 'x' } });
  assert.ok(containsText(c, 'Saved template notes lead with'), 'save-mode disclosure missing');
  assert.ok(containsText(c, NOTICE), 'disclosure must quote the canonical sentence');
  await act(async () => { c.unmount(); });
});

await ok('dialog load rows flag carried project notes (one carrying + one bare row)', async () => {
  const withNotes = { id: 't1', template_name: 'With notes', project_data: { notes: `${NOTICE}\n\nKept`, items: [{ component_id: 'a' }] } };
  const bare = { id: 't2', template_name: 'Bare', project_data: { items: [{ component_id: 'a' }] } };
  const c = await mountDlg({ rows: [withNotes, bare] });
  const count = c.root.findAll(el => el?.props?.children === 'Includes project notes').length;
  assert.equal(count, 1, 'exactly one carried-notes indicator expected');
  await act(async () => { c.unmount(); });
});

console.log(`\n${failed ? 'FAIL' : 'PASS'} o119-notices (${passed} passed, ${failed} failed)`);
process.exit(failed ? 1 : 0);
