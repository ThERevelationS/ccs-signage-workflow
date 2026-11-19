// O-014 template residuals — real-DOM browser render check for CANDIDATE dialog.
// Real dialog bundled from candidates; stub entities only. No Base44 SDK/network.
// 127.0.0.1:5173 only; fails on any non-local request.
import esbuild from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const UNIT = '.audit-work/foundation-o014-templates';
const CAND = `${UNIT}/candidates/src/components/estimator/foundation`;
const BASE = `${UNIT}/baseline`;

const STUBS = {
  '@/api/base44Client': `export const base44={entities:{ProjectTemplate:{get:(id)=>window.__api.get(id)}}};`,
  '@/components/ui/dialog': `import React from 'react';export const Dialog=(p)=>p.open?React.createElement('div',{'data-dialog':'1'},p.children):null;export const DialogContent=(p)=>React.createElement('div',{},p.children);export const DialogHeader=(p)=>React.createElement('div',{},p.children);export const DialogTitle=(p)=>React.createElement('h2',{},p.children);`,
  'lucide-react': `export const Trash2=()=>null;`,
  '@/components/estimator/products/reusableSaveIdempotency': `export const ensureReusableRecord=(a)=>window.__api.save(a);`,
  '@/components/estimator/builder/builderEntityPersistence': `export const deleteEntityIfUnchanged=async(a)=>{window.__calls.push(['delete',a.record.id]);return true;};`,
  '@/components/estimator/loadAllEntityRows': `export const loadAllEntityRows=async()=>{if(window.__loadErr)throw window.__loadErr;return window.__tplRows||[];};`,
  '@/components/estimator/idempotentEntityCreate': `let __n=0;export const newCreationRequestKey=(k)=>'k-'+(k||'x')+'-'+(++__n);`,
};

const DEP_REDIRECT = {
  './foundationTemplateModel': path.resolve(`${BASE}/foundationTemplateModel.js`),
  './foundationTemplateModel.js': path.resolve(`${BASE}/foundationTemplateModel.js`),
  './foundationAssemblyModel': path.resolve(`${BASE}/foundationAssemblyModel.js`),
  './foundationAssemblyModel.js': path.resolve(`${BASE}/foundationAssemblyModel.js`),
};

const harness = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FoundationTemplateDialog from '${path.resolve(`${CAND}/FoundationTemplateDialog.jsx`).replace(/\\/g, '/')}';

const project = { id: 'p1', items: [{ id: 'i0', description: 'F' }], walls: [], poles: [], wall_caps: [], signage_cabinets: [], notes: 'n' };

function App() {
  const [dlg, setDlg] = useState({ open: false, mode: 'load', saveDisabled: false, saveDisabledReason: '' });
  window.__openSave = (gate) => setDlg({ open: true, mode: 'save', saveDisabled: !!(gate && gate.disabled), saveDisabledReason: (gate && gate.reason) || '' });
  window.__openLoad = () => setDlg({ open: true, mode: 'load', saveDisabled: false, saveDisabledReason: '' });
  return React.createElement('div', {},
    React.createElement('h1', { id: 'fx' }, 'SYNTHETIC O-014 FIXTURE - not Base44'),
    React.createElement(FoundationTemplateDialog, {
      open: dlg.open, mode: dlg.mode, project,
      saveDisabled: dlg.saveDisabled, saveDisabledReason: dlg.saveDisabledReason,
      onClose: () => { window.__closed = (window.__closed || 0) + 1; setDlg({ open: false, mode: dlg.mode, saveDisabled: false, saveDisabledReason: '' }); },
      onApply: () => true,
    }));
}
createRoot(document.getElementById('root')).render(React.createElement(App));
`;

const plugin = { name: 's', setup(b) {
  b.onResolve({ filter: /^harness$/ }, () => ({ path: 'harness', namespace: 'h' }));
  b.onResolve({ filter: /.*/ }, a => {
    if (STUBS[a.path]) return { path: path.resolve('stub-' + a.path.replace(/[^a-z0-9]/gi, '_')), namespace: 's' };
    if (DEP_REDIRECT[a.path]) return { path: DEP_REDIRECT[a.path] };
    return undefined;
  });
  b.onLoad({ filter: /.*/, namespace: 'h' }, () => ({ contents: harness, loader: 'jsx', resolveDir: path.resolve('.') }));
  b.onLoad({ filter: /.*/, namespace: 's' }, a => { const key = Object.keys(STUBS).find(k => path.resolve('stub-' + k.replace(/[^a-z0-9]/gi, '_')) === a.path); return { contents: STUBS[key], loader: 'js', resolveDir: path.resolve('.') }; });
}};

const built = await esbuild.build({ entryPoints: ['harness'], bundle: true, format: 'iife', platform: 'browser', write: false, plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic', metafile: true });
const sdkReal = Object.keys(built.metafile.inputs).filter(i => /node_modules.*base44|@base44|api\/base44Client\.(js|ts)/i.test(i));
fs.writeFileSync(`${UNIT}/verify/metafile.json`, JSON.stringify({ inputs: Object.keys(built.metafile.inputs) }, null, 1));
if (sdkReal.length) { console.error('BUNDLE CONTAINS BASE44 SDK:', sdkReal); process.exit(1); }

const server = http.createServer((req, res) => {
  if (req.url !== '/') { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><meta charset=utf-8><title>SYNTHETIC non-Base44 fixture</title><body><div id=root></div><script>${built.outputFiles[0].text}</script>`);
});
await new Promise(r => server.listen(5173, '127.0.0.1', r));

const results = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const foreignReqs = [];
page.on('dialog', (d) => { d.accept(); });
page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1:5173')) foreignReqs.push(r.url()); });
page.on('pageerror', (e) => results.push({ case: 'pageerror', ok: false, error: String(e) }));
page.on('console', (m) => { if (m.type() === 'error') results.push({ case: 'console.error', ok: false, error: m.text() }); });
await page.route('**/*', (r) => { if (r.request().url().startsWith('http://127.0.0.1:5173')) r.continue(); else r.abort(); });
await page.goto('http://127.0.0.1:5173/');
await page.waitForTimeout(600);

const S = async (name, fn) => {
  try { const out = await fn() || {}; results.push({ case: name, ok: true, ...out }); }
  catch (e) { results.push({ case: name, ok: false, error: String(e) }); }
};

await S('load failure: real DOM shows could-not-load + alert + Retry; no fake empty', async () => {
  await page.evaluate(() => { window.__loadErr = new Error('net dead'); window.__openLoad(); });
  await page.waitForTimeout(400);
  const html = await page.locator('[data-dialog]').innerText();
  assert.ok(html.includes('Templates could not be loaded.'), 'load failure copy in DOM');
  assert.ok(!html.includes('No foundation templates saved yet.'), 'fake empty absent');
  assert.equal(await page.locator('[role=alert]').count(), 1, 'alert rendered');
  assert.equal(await page.locator('button:has-text("Retry")').count(), 1);
  await page.screenshot({ path: `${UNIT}/verify/browser-load-fail.png` });
  await page.evaluate(() => { window.__loadErr = null; });
});

await S('save rejection: alert in real DOM, dialog stays open', async () => {
  await page.evaluate(() => {
    window.__closed = 0;
    window.__api = { get: async () => { const e = new Error('nf'); e.status = 404; throw e; }, save: async () => { throw new Error('save exploded'); } };
    window.__openSave();
  });
  await page.waitForTimeout(300);
  await page.locator('input').first().fill('T');
  await page.locator('button:has-text("Save Template")').click();
  await page.waitForTimeout(400);
  const alert = await page.locator('[role=alert]').innerText();
  assert.ok(alert.includes('save exploded'), 'save error surfaced: ' + alert);
  assert.equal(await page.evaluate(() => window.__closed), 0, 'open');
  await page.screenshot({ path: `${UNIT}/verify/browser-save-fail.png` });
});

await S('delete transient get failure: row kept + alert', async () => {
  await page.evaluate(() => {
    window.__calls = []; window.__tplRows = [{ id: 't1', template_name: 'A', project_data: { items: [] } }];
    window.__api = { get: async () => { const e = new Error('server'); e.status = 500; throw e; }, save: async () => ({}) };
    window.__openLoad();
  });
  await page.waitForTimeout(400);
  assert.equal(await page.locator('button:has-text("Apply")').count(), 1);
  await page.locator('[data-dialog] button.text-gray-400, [data-dialog] button[class*="text-gray-400"]').first().click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('button:has-text("Apply")').count(), 1, 'row kept');
  assert.equal(await page.locator('[role=alert]').count(), 1, 'alert');
  assert.equal(await page.evaluate(() => window.__calls.length), 0, 'no delete attempted');
  await page.screenshot({ path: `${UNIT}/verify/browser-delete-fail.png` });
});

await S('saveDisabled gate: disabled button + explanatory note in real DOM', async () => {
  await page.evaluate(() => window.__openSave({ disabled: true, reason: 'Template saving is paused until pricing is available.' }));
  await page.waitForTimeout(300);
  const btn = page.locator('button:has-text("Save Template")');
  assert.equal(await btn.isDisabled(), true, 'disabled');
  const html = await page.locator('[data-dialog]').innerText();
  assert.ok(html.includes('paused until pricing is available'), 'reason note');
  await page.screenshot({ path: `${UNIT}/verify/browser-gated.png` });
  await page.evaluate(() => window.__openSave({ disabled: false }));
  await page.waitForTimeout(300);
  assert.equal(await page.locator('button:has-text("Save Template")').isDisabled(), false, 'ungated re-enabled');
});

if (foreignReqs.length) results.push({ case: 'external-requests-blocked', ok: false, error: `non-local: ${foreignReqs.join(',')}` });
else results.push({ case: 'external-requests-blocked', ok: true });

fs.writeFileSync(`${UNIT}/verify/browser-results.json`, JSON.stringify({ synthetic: true, note: 'no Base44 SDK/services/records; stub entity fakes only', results }, null, 1));
await browser.close();
server.close();
const fails = results.filter(r => r.ok === false);
console.log(`browser-fixture cases=${results.length} failed=${fails.length}`);
results.forEach(r => console.log(r.ok === false ? 'FAIL' : 'ok', r.case));
process.exit(fails.length ? 1 : 0);
