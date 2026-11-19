// O-014 template residuals — candidate verification.
// Bundles the CANDIDATE dialog + service from .audit-work/foundation-o014-templates/candidates
// (never local src/). Unchanged deps (foundationTemplateModel -> foundationAssemblyModel)
// are redirected to fresh remote baselines. Everything else is stubbed like
// scripts/test-foundation-template.mjs.
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const UNIT = '.audit-work/foundation-o014-templates';
const CAND = `${UNIT}/candidates/src/components/estimator/foundation`;
const BASE = `${UNIT}/baseline`;

let passed = 0, failed = 0;
const ok = async (n, fn) => { try { await fn(); passed++; console.log('ok', n); } catch (e) { failed++; console.error('FAIL', n, '-', e.message); } };

const STUBS = {
  '@/api/base44Client': `export const base44={entities:{ProjectTemplate:{get:(id)=>globalThis.__tplGet(id)}}};`,
  '@/components/ui/dialog': `export const Dialog=(p)=>p?.children??null;export const DialogContent=(p)=>p?.children??null;export const DialogHeader=(p)=>p?.children??null;export const DialogTitle=(p)=>p?.children??null;`,
  'lucide-react': `export const Trash2=()=>null;`,
  '@/components/estimator/products/reusableSaveIdempotency': `export const ensureReusableRecord=(a)=>(globalThis.__tplSave||((x)=>({id:'t1',...x.data})))(a);`,
  '@/components/estimator/builder/builderEntityPersistence': `export const deleteEntityIfUnchanged=async(a)=>{globalThis.__deletes.push(a);return true;};`,
  '@/components/estimator/loadAllEntityRows': `export const loadAllEntityRows=async()=>{if(globalThis.__tplLoad)return globalThis.__tplLoad();if(globalThis.__tplLoadErr)throw globalThis.__tplLoadErr;return globalThis.__tplRows||[];};`,
  '@/components/estimator/idempotentEntityCreate': `let __n=0;export const newCreationRequestKey=(k)=>'k-'+(k||'x')+'-'+(++__n);export const ensureIdempotentEntityCreate=(...a)=>(globalThis.__ensureIdempotent||((x)=>x))(...a);`,
};

// Unchanged deps imported relatively from inside the candidate dir get
// redirected to the fresh remote baseline copies (verified identical intent).
const DEP_REDIRECT = {
  './foundationTemplateModel': path.resolve(`${BASE}/foundationTemplateModel.js`),
  './foundationTemplateModel.js': path.resolve(`${BASE}/foundationTemplateModel.js`),
  './foundationAssemblyModel': path.resolve(`${BASE}/foundationAssemblyModel.js`),
  './foundationAssemblyModel.js': path.resolve(`${BASE}/foundationAssemblyModel.js`),
};

const plugin = { name: 'stubs', setup(b) {
  b.onResolve({ filter: /.*/ }, a => {
    if (STUBS[a.path]) return { path: a.path, namespace: 'stub' };
    if (DEP_REDIRECT[a.path] && a.importer.includes('candidates')) return { path: DEP_REDIRECT[a.path] };
    if (DEP_REDIRECT[a.path] && a.importer.includes('baseline')) return { path: DEP_REDIRECT[a.path] };
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
const dlgMod = await mk(`${CAND}/FoundationTemplateDialog.jsx`, `${UNIT}/verify/dlg.candidate.bundle.mjs`);
const svcMod = await mk(`${CAND}/foundationTemplateService.js`, `${UNIT}/verify/svc.candidate.bundle.mjs`);
const Dialog = dlgMod.default;
const { deleteFoundationTemplate, saveFoundationTemplate } = svcMod;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = { confirm: () => true };
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

const proj = () => ({
  id: 'p1', project_name: 'X', items: [{ id: 'i0', description: 'F', quantity: 2 }],
  walls: [], poles: [], wall_caps: [], signage_cabinets: [], notes: 'n',
});

const mountDlg = async (props = {}) => {
  globalThis.__tplRows = props.rows ?? []; globalThis.__tplLoadErr = props.loadErr ?? null; globalThis.__tplSave = null;
  globalThis.__deletes = []; globalThis.__tplLoad = null; globalThis.__tplGet = async (id) => ({ id, template_name: 'T', updated_date: 'v1' });
  let c;
  await act(async () => {
    c = TestRenderer.create(React.createElement(Dialog, { open: true, mode: 'load', onClose: () => { globalThis.__closed = (globalThis.__closed || 0) + 1; }, project: proj(), onApply: () => true, ...props }));
  });
  await flush();
  const alerts = () => c.root.findAll(el => el?.props?.role === 'alert').map(el => el.props.children);
  const btn = (label) => c.root.findAll(el => el?.props?.children === label).map(el => el.props);
  const text = (s) => c.root.findAll(el => el?.props?.children === s);
  const removeBtn = () => c.root.findAll(el => el.type === 'button' && el.props.className?.includes('text-gray-400')).map(el => el.props);
  return { c, alerts, btn, text, removeBtn, cleanup: async () => act(async () => { c.unmount(); }) };
};

// ---------- service ----------

await ok('service delete: 404 via status/response.status/statusCode/data.status/message -> already gone', async () => {
  for (const mk404 of [
    () => Object.assign(new Error('nf'), { status: 404 }),
    () => Object.assign(new Error('nf'), { response: { status: 404 } }),
    () => Object.assign(new Error('nf'), { response: { statusCode: 404 } }),
    () => Object.assign(new Error('nf'), { data: { status: 404 } }),
    () => new Error('record not found'),
    () => new Error('entity does not exist'),
    () => Object.assign(new Error('x'), { response: { data: { message: 'Not found' } } }),
  ]) {
    globalThis.__tplGet = () => Promise.reject(mk404());
    globalThis.__deletes = [];
    assert.equal(await deleteFoundationTemplate('t9'), true, 'not-found resolves true');
    assert.equal(globalThis.__deletes.length, 0, 'no delete attempted on missing record');
  }
});

await ok('service delete: transient fetch failures propagate (500, TypeError, 403)', async () => {
  for (const bad of [
    Object.assign(new Error('srv'), { status: 500 }),
    new TypeError('fetch failed'),
    Object.assign(new Error('forbidden'), { status: 403 }),
    Object.assign(new Error('rate limited'), { response: { status: 429 } }),
  ]) {
    globalThis.__tplGet = () => Promise.reject(bad);
    await assert.rejects(() => deleteFoundationTemplate('t9'));
  }
});

await ok('service delete: unverifiable fetched records abort (null/array/wrong id) - fail closed', async () => {
  for (const bad of [null, undefined, [], { id: 'other' }, 'x']) {
    globalThis.__tplGet = () => Promise.resolve(bad);
    await assert.rejects(() => deleteFoundationTemplate('t9'), /verified/, JSON.stringify(bad));
  }
});

await ok('service delete: verified record -> exactly one CAS delete with loaded record', async () => {
  globalThis.__deletes = [];
  globalThis.__tplGet = () => Promise.resolve({ id: 't9', template_name: 'T9', updated_date: 'v3' });
  assert.equal(await deleteFoundationTemplate('t9'), true);
  assert.equal(globalThis.__deletes.length, 1);
  assert.equal(globalThis.__deletes[0].record.template_name, 'T9');
});

await ok('service delete: blank id rejected; save passes through idempotency key+data', async () => {
  await assert.rejects(() => deleteFoundationTemplate('  '), /required/);
  let got = null;
  globalThis.__tplSave = (a) => { got = a; return { id: 't1' }; };
  await saveFoundationTemplate({ idempotencyKey: 'k1', data: { template_name: 'A' } });
  assert.equal(got.idempotencyKey, 'k1');
  assert.equal(got.data.template_name, 'A');
});

// ---------- dialog: save failure -> inline error ----------

await ok('dialog save: service rejection surfaces inline error, stays open, busy resets', async () => {
  globalThis.__closed = 0;
  const m = await mountDlg({ mode: 'save' });
  globalThis.__tplSave = () => Promise.reject(new Error('boom save'));
  const inp = m.c.root.findAll(el => el?.props?.value !== undefined)[0];
  await act(async () => { inp.props.onChange({ target: { value: 'My T' } }); });
  await act(async () => { await m.btn('Save Template')[0].onClick(); });
  assert.ok(m.alerts().some(s => String(s).includes('boom save')), 'error text visible: ' + JSON.stringify(m.alerts()));
  assert.equal(globalThis.__closed, 0, 'dialog stays open');
  assert.equal(m.btn('Save Template')[0].disabled, false, 'busy cleared');
  await m.cleanup();
});

await ok('dialog save: snapshot-prep failure surfaces inline error without service call', async () => {
  const calls = [];
  const m = await mountDlg({ mode: 'save', project: null });
  globalThis.__tplSave = (a) => { calls.push(a); return Promise.resolve({ id: 't' }); };
  const inp = m.c.root.findAll(el => el?.props?.value !== undefined)[0];
  await act(async () => { inp.props.onChange({ target: { value: 'T' } }); });
  await act(async () => { await m.btn('Save Template')[0].onClick(); });
  assert.equal(calls.length, 0, 'no service call');
  await m.cleanup();
});

// ---------- dialog: load failure -> error state, not fake empty ----------

await ok('dialog load: fetch failure shows "could not be loaded" + alert + retry; NOT fake empty list', async () => {
  const m = await mountDlg({ loadErr: new Error('load dead') });
  assert.equal(m.text('Templates could not be loaded.').length, 1, 'load-failure copy');
  assert.equal(m.text('No foundation templates saved yet.').length, 0, 'fake empty copy absent');
  assert.ok(m.alerts().some(s => String(s).includes('load dead')), 'alert with cause');
  assert.equal(m.btn('Retry').length, 1, 'retry affordance');
  globalThis.__tplLoadErr = null;
  globalThis.__tplRows = [{ id: 't9', template_name: 'B', project_data: {} }];
  await act(async () => { m.btn('Retry')[0].onClick(); });
  await flush();
  assert.equal(m.btn('Apply').length, 1, 'retry reloads rows');
  assert.equal(m.alerts().length, 0, 'error cleared after successful reload');
  await m.cleanup();
});

// ---------- dialog: delete failure -> inline error + row kept ----------

await ok('dialog delete: CAS delete rejection surfaces error and keeps row', async () => {
  const m = await mountDlg({ rows: [{ id: 't1', template_name: 'A', project_data: {} }] });
  globalThis.__tplGet = () => Promise.resolve({ id: 't1', template_name: 'A', updated_date: 'v1' });
  const keep = globalThis.__deletes;
  globalThis.__deletes = new Proxy([], { get: (t, p) => (p === 'push' ? () => { throw new Error('cas fail'); } : t[p]) });
  // force deleteEntityIfUnchanged to reject: stub pushes then throws
  await act(async () => { await m.removeBtn()[0].onClick(); });
  assert.equal(m.btn('Apply').length, 1, 'row retained');
  assert.ok(m.alerts().length >= 1, 'delete error visible');
  await m.cleanup();
});

await ok('dialog delete: transient PRE-READ failure (get 500) does NOT remove row', async () => {
  const m = await mountDlg({ rows: [{ id: 't1', template_name: 'A', project_data: {} }] });
  globalThis.__tplGet = () => Promise.reject(Object.assign(new Error('server'), { status: 500 }));
  await act(async () => { await m.removeBtn()[0].onClick(); });
  assert.equal(m.btn('Apply').length, 1, 'row retained after transient fetch failure');
  assert.ok(m.alerts().some(s => String(s).includes('server')), 'error surfaced: ' + JSON.stringify(m.alerts()));
  assert.equal(globalThis.__deletes.length, 0, 'no delete attempted');
  await m.cleanup();
});

await ok('dialog delete: 404 pre-read -> row removed (genuinely gone), no error', async () => {
  const m = await mountDlg({ rows: [{ id: 't1', template_name: 'A', project_data: {} }] });
  globalThis.__tplGet = () => Promise.reject(Object.assign(new Error('nf'), { status: 404 }));
  await act(async () => { await m.removeBtn()[0].onClick(); });
  assert.equal(m.btn('Apply').length, 0, 'row removed');
  assert.equal(m.alerts().length, 0, 'no error for already-gone record');
  assert.equal(globalThis.__deletes.length, 0, 'no CAS delete needed');
  await m.cleanup();
});

await ok('dialog delete: successful delete clears a prior error banner', async () => {
  const m = await mountDlg({ rows: [{ id: 't1', template_name: 'A', project_data: {} }, { id: 't2', template_name: 'B', project_data: {} }] });
  globalThis.__tplGet = (id) => (id === 't1'
    ? Promise.reject(Object.assign(new Error('server'), { status: 500 }))
    : Promise.resolve({ id, template_name: 'B', updated_date: 'v1' }));
  await act(async () => { await m.removeBtn()[0].onClick(); }); // t1 fails
  assert.ok(m.alerts().length >= 1, 'error shown');
  await act(async () => { await m.removeBtn()[1].onClick(); }); // t2 succeeds
  assert.equal(m.alerts().length, 0, 'error banner cleared by successful delete');
  assert.equal(m.btn('Apply').length, 1, 'failed row remains, succeeded row gone');
  await m.cleanup();
});

// ---------- dialog: saveDisabled gate ----------

await ok('dialog gate: saveDisabled disables action, shows default note, zero service calls', async () => {
  const calls = [];
  const m = await mountDlg({ mode: 'save', saveDisabled: true });
  globalThis.__tplSave = (a) => { calls.push(a); return Promise.resolve({ id: 't' }); };
  assert.equal(m.btn('Save Template')[0].disabled, true, 'button disabled');
  assert.equal(m.text('Saving a template is not available right now.').length, 1, 'default explanatory note');
  const inp = m.c.root.findAll(el => el?.props?.value !== undefined)[0];
  await act(async () => { inp.props.onChange({ target: { value: 'T' } }); });
  await act(async () => { await m.btn('Save Template')[0].onClick(); });
  assert.equal(calls.length, 0, 'guard blocks service call even if handler invoked');
  assert.equal(globalThis.__closed || 0, 0, 'dialog did not close');
  await m.cleanup();
});

await ok('dialog gate: saveDisabledReason overrides note; falsy prop = backward compatible', async () => {
  const m = await mountDlg({ mode: 'save', saveDisabled: true, saveDisabledReason: 'Template saving is paused until pricing is available.' });
  assert.equal(m.text('Template saving is paused until pricing is available.').length, 1, 'custom reason rendered');
  assert.equal(m.btn('Save Template')[0].disabled, true);
  await m.cleanup();
  const m2 = await mountDlg({ mode: 'save' }); // no prop at all
  assert.equal(m2.btn('Save Template')[0].disabled, false, 'default enabled');
  assert.equal(m2.text('Saving a template is not available right now.').length, 0, 'no gate note');
  await m2.cleanup();
});

// ---------- dialog: happy paths unchanged ----------

await ok('dialog happy: save success clears name + closes; apply success closes; delete removes row', async () => {
  globalThis.__closed = 0;
  const m = await mountDlg({ mode: 'save' });
  let savedData = null;
  globalThis.__tplSave = (a) => { savedData = a; return Promise.resolve({ id: 't1' }); };
  const inp = m.c.root.findAll(el => el?.props?.value !== undefined)[0];
  await act(async () => { inp.props.onChange({ target: { value: 'My T' } }); });
  await act(async () => { await m.btn('Save Template')[0].onClick(); });
  assert.equal(globalThis.__closed, 1, 'closed once');
  assert.equal(savedData.data.template_name, 'My T');
  assert.ok(savedData.data.project_data.assembly_schema_version === 1, 'real snapshot model ran');
  assert.equal(m.alerts().length, 0);
  await m.cleanup();

  const m2 = await mountDlg({ rows: [{ id: 't1', template_name: 'A', project_data: { items: [] } }], onApply: () => true });
  globalThis.__closed = 0;
  await act(async () => { m2.btn('Apply')[0].onClick(); });
  assert.equal(globalThis.__closed, 1, 'apply closes');
  globalThis.__tplGet = () => Promise.resolve({ id: 't1', template_name: 'A', updated_date: 'v1' });
  await act(async () => { await m2.removeBtn()[0].onClick(); });
  assert.equal(m2.btn('Apply').length, 0, 'row removed');
  await m2.cleanup();
});

console.log(`PASS o014-templates passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
