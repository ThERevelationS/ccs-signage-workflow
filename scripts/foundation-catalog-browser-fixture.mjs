// Contained synthetic fixture for O-009 catalog-empty visibility.
// Real FoundationPolesPanel + FoundationWallCapsPanel. No SDK/network.
// 127.0.0.1:5172 only; fails on pageerror or any non-local request.
import esbuild from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const OUT = '.audit-work/foundation-catalog06';
fs.mkdirSync(OUT, { recursive: true });

const STUBS = {
  '@/components/ui/button': `import React from 'react';export const Button=(p)=>React.createElement('button',p,p.children);`,
  '@/components/ui/input': `import React from 'react';export const Input=(p)=>React.createElement('input',p);`,
  'lucide-react': `export const Trash2=()=>null;export const Plus=()=>null;export const PenLine=()=>null;export const Undo2=()=>null;export const Square=()=>null;`,
  './WallShapeEditor': `export default function WallShapeEditor(){return null;}`,
};

const harness = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FoundationPolesPanel from '@/components/estimator/foundation/FoundationPolesPanel';
import FoundationWallCapsPanel from '@/components/estimator/foundation/FoundationWallCapsPanel';

function App(){
  const [poles,setPoles]=useState([{component_id:'po1',pole_id:'pole_X',foundation_component_id:'f1',pole_cost:42,pole_painting_cost:3,total_cost:45,height_inches:120}]);
  const [caps,setCaps]=useState([{component_id:'cp1',cap_inventory_id:'cap_X',wall_component_id:'w1',segment_component_id:'s0',cost:17}]);
  const [opts,setOpts]=useState({pole:[],cap:[]});
  window.__poles=poles; window.__caps=caps;
  window.__loadCatalog=()=>setOpts({pole:[{id:'pole_X',material_name:'Steel pole X'}],cap:[{id:'cap_X',material_name:'Cap X'}]});
  return React.createElement('div',{},
    React.createElement('h1',{id:'fx'},'SYNTHETIC catalog-empty fixture - not Base44'),
    React.createElement('div',{id:'poles'},React.createElement(FoundationPolesPanel,{poles,options:opts.pole,items:[{component_id:'f1'},{component_id:'f2'}],onChange:setPoles})),
    React.createElement('div',{id:'caps'},React.createElement(FoundationWallCapsPanel,{caps,walls:[{component_id:'w1',shape:{segments:[{component_id:'s0'}]}}],options:opts.cap,onChange:setCaps})));
}
createRoot(document.getElementById('root')).render(React.createElement(App));
`;

const plugin = { name: 's', setup(b) {
  b.onResolve({ filter: /^harness$/ }, () => ({ path: 'harness', namespace: 'h' }));
  b.onResolve({ filter: /.*/ }, a => (STUBS[a.path] ? { path: path.resolve('s-' + a.path.replace(/[^a-z0-9]/gi, '_')), namespace: 's' } : undefined));
  b.onLoad({ filter: /.*/, namespace: 'h' }, () => ({ contents: harness, loader: 'jsx', resolveDir: path.resolve('.') }));
  b.onLoad({ filter: /.*/, namespace: 's' }, a => { const key = Object.keys(STUBS).find(k => path.resolve('s-' + k.replace(/[^a-z0-9]/gi, '_')) === a.path); return { contents: STUBS[key], loader: 'js', resolveDir: path.resolve('.') }; });
}};
const built = await esbuild.build({ entryPoints: ['harness'], bundle: true, format: 'iife', platform: 'browser', write: false, plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic', alias: { '@': path.resolve('src') }, metafile: true });
const sdkReal = Object.keys(built.metafile.inputs).filter(i => /node_modules.*base44|@base44|api\/base44Client/i.test(i));
fs.writeFileSync(`${OUT}/metafile.json`, JSON.stringify({ inputs: Object.keys(built.metafile.inputs) }, null, 1));
if (sdkReal.length) { console.error('BASE44 SDK IN BUNDLE:', sdkReal); process.exit(1); }

const server = http.createServer((req, res) => {
  if (req.url !== '/') { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><meta charset=utf-8><title>SYNTHETIC fixture</title><body><div id=root></div><script>${built.outputFiles[0].text}</script>`);
});
await new Promise(r => server.listen(5172, '127.0.0.1', r));

const results = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const foreign = [];
page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1:5172')) foreign.push(r.url()); });
page.on('pageerror', (e) => results.push({ case: 'pageerror', ok: false, error: String(e) }));
await page.route('**/*', (r) => { if (r.request().url().startsWith('http://127.0.0.1:5172')) r.continue(); else r.abort(); });
await page.goto('http://127.0.0.1:5172/');
await page.waitForTimeout(700);

const S = async (name, fn) => { try { const out = await fn() || {}; results.push({ case: name, ok: true, ...out }); } catch (e) { results.push({ case: name, ok: false, error: String(e) }); } };

await S('empty catalog: authored pole+cap rows, selects, costs, warnings, add disabled', async () => {
  assert.ok(await page.locator('#poles select[aria-label="Pole material"]').count() === 1, 'pole material select visible');
  assert.ok(await page.locator('#poles select[aria-label="Pole foundation"]').count() === 1, 'parent select visible');
  assert.ok(await page.locator('#caps select[aria-label="Cap material"]').count() === 1, 'cap material select visible');
  const poleWarn = await page.locator('#poles :text("current pricing needs review")').count();
  const capWarn = await page.locator('#caps :text("current pricing needs review")').count();
  assert.ok(poleWarn === 1 && capWarn === 1, `warnings ${poleWarn}/${capWarn}`);
  const missing = await page.locator('#poles option:disabled').allTextContents();
  assert.ok(missing.some(t => /pole_X/.test(t)), 'missing pole id visible as disabled option');
  const polesText = await page.locator('#poles').innerText();
  for (const t of ['$42.00', '$3.00', '$45.00']) assert.ok(polesText.includes(t), `pole rendered cost ${t}`);
  const capsText = await page.locator('#caps').innerText();
  assert.ok(capsText.includes('$17.00'), 'cap rendered cost $17.00');
  const poleAdd = page.locator('#poles button', { hasText: 'Pole' }).first();
  const capAdd = page.locator('#caps button', { hasText: 'Cap' }).first();
  assert.ok(await poleAdd.isDisabled(), 'pole Add disabled');
  assert.ok(await capAdd.isDisabled(), 'cap Add disabled');
  await page.screenshot({ path: `${OUT}/fixture-empty-catalog.png` });
  return { rowsVisible: true, warnings: [poleWarn, capWarn] };
});

await S('parent reassign with empty catalog: emits onChange, material+cost unchanged', async () => {
  await page.locator('#poles select[aria-label="Pole foundation"]').selectOption('f2');
  await page.waitForTimeout(150);
  const pole = await page.evaluate(() => window.__poles[0]);
  assert.equal(pole.foundation_component_id, 'f2');
  assert.equal(pole.component_id, 'po1', 'component id preserved');
  assert.equal(pole.pole_id, 'pole_X', 'material id untouched');
  assert.equal(pole.pole_cost, 42);
  assert.equal(pole.pole_painting_cost, 3);
  assert.equal(pole.total_cost, 45);
  const txt = await page.locator('#poles').innerText();
  for (const t of ['$42.00', '$3.00', '$45.00']) assert.ok(txt.includes(t), `cost text after reassign ${t}`);
  return { reassigned: true };
});

await S('catalog reload: labels resolve, warnings gone, zero data mutation', async () => {
  const before = await page.evaluate(() => JSON.stringify({ p: window.__poles, c: window.__caps }));
  await page.evaluate(() => window.__loadCatalog());
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#poles :text("current pricing needs review")').count(), 0, 'pole warning gone');
  assert.equal(await page.locator('#caps :text("current pricing needs review")').count(), 0, 'cap warning gone');
  const poleLabel = await page.locator('#poles select[aria-label="Pole material"]').evaluate(s => s.options[s.selectedIndex]?.textContent);
  const capLabel = await page.locator('#caps select[aria-label="Cap material"]').evaluate(s => s.options[s.selectedIndex]?.textContent);
  assert.ok(/Steel pole X/.test(String(poleLabel)), `resolved pole label: ${poleLabel}`);
  assert.ok(/Cap X/.test(String(capLabel)), `resolved cap label: ${capLabel}`);
  assert.ok(!(await page.locator('#poles button', { hasText: 'Pole' }).first().isDisabled()), 'pole Add enabled after restore');
  assert.ok(!(await page.locator('#caps button', { hasText: 'Cap' }).first().isDisabled()), 'cap Add enabled after restore');
  const capsTxt2 = await page.locator('#caps').innerText();
  assert.ok(capsTxt2.includes('$17.00'), 'cap cost still rendered after restore');
  const after = await page.evaluate(() => JSON.stringify({ p: window.__poles, c: window.__caps }));
  assert.equal(after, before, 'no data mutation from catalog reload render');
  await page.screenshot({ path: `${OUT}/fixture-catalog-restored.png` });
  return { resolved: true };
});

if (foreign.length) results.push({ case: 'external-requests-blocked', ok: false, error: foreign.join(',') });
else results.push({ case: 'external-requests-blocked', ok: true });

fs.writeFileSync(`${OUT}/browser-results.json`, JSON.stringify({ synthetic: true, note: 'no Base44 SDK/services/records; UI stubs only', results }, null, 1));
await browser.close();
server.close();
const fails = results.filter(r => r.ok === false);
console.log(`catalog-browser cases=${results.length} failed=${fails.length}`);
results.forEach(r => console.log(r.ok === false ? 'FAIL' : 'ok', r.case));
process.exit(fails.length ? 1 : 0);
