// O-119 (CMP-I18) real-browser verification: mounts the CANDIDATE
// FoundationSectionBanner, PreliminaryNotice, and FoundationTemplateDialog
// under esbuild + playwright-core — real React DOM at desktop 1280px and
// mobile 390px. No network beyond the local bundle server; foreign-request
// telemetry asserted empty.
import esbuild from 'esbuild';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UNIT = path.resolve(here, '..');
const OUT = UNIT;
const ORIGIN = 'http://127.0.0.1:5297';
const NOTICE = 'Preliminary estimating only - final engineering required';
const results = [];
const telemetry = { foreign: [], consoleErrors: [], pageErrors: [] };

// ---------- harness entry ----------
const harness = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import FoundationSectionBanner from './fixture-browser/src/components/estimator/foundation/FoundationSectionBanner.jsx';
import FoundationTemplateDialog from './fixture-browser/src/components/estimator/foundation/FoundationTemplateDialog.jsx';
import { PreliminaryNotice } from './fixture-browser/src/components/estimator/foundation/foundationPreliminaryNotice.js';

const mode = new URLSearchParams(location.search).get('case') || 'banner';
const NOTICE = ${JSON.stringify(NOTICE)};

window.__tplRows = [
  { id: 't1', template_name: 'With notes + AI', project_data: { notes: NOTICE + '\\n\\nKept note', ai_engineering_recommendation: 'md', items: [{}] } },
  { id: 't2', template_name: 'Bare', project_data: { items: [{}] } },
];

let el;
if (mode === 'banner') {
  el = React.createElement(FoundationSectionBanner, { sectionName: 'Front Sign Concept' });
} else if (mode === 'notice-dismissible') {
  el = React.createElement(PreliminaryNotice, { dismissible: true });
} else if (mode === 'dialog-load') {
  el = React.createElement(FoundationTemplateDialog, { open: true, mode: 'load', onClose: () => {}, project: { id: 'p', items: [] }, onApply: () => true });
} else if (mode === 'dialog-save') {
  el = React.createElement(FoundationTemplateDialog, { open: true, mode: 'save', onClose: () => {}, project: { id: 'p', items: [] }, onApply: () => true });
} else if (mode === 'page-stack') {
  // Simulates the page mount: banner + notice exactly as FoundationEstimator
  // renders them, inside the same max-width content column.
  el = React.createElement('div', { className: 'max-w-[1500px] mx-auto p-4' },
    React.createElement(FoundationSectionBanner, { sectionName: 'Front Sign Concept' }));
}
window.__M = { mode };
createRoot(document.getElementById('root')).render(el);
`;

const plugin = { name: 'h', setup(b) {
  b.onResolve({ filter: /^harness$/ }, () => ({ path: 'harness', namespace: 'h' }));
  b.onLoad({ filter: /.*/, namespace: 'h' }, () => ({ contents: harness, loader: 'jsx', resolveDir: UNIT }));
}};
const built = await esbuild.build({
  entryPoints: ['harness'], bundle: true, format: 'iife', platform: 'browser', write: false,
  plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic',
  metafile: true, alias: { '@': path.resolve(`${UNIT}/fixture-browser/src`) },
});
fs.writeFileSync(`${OUT}/verify/o119-browser-metafile.json`, JSON.stringify({ inputs: Object.keys(built.metafile.inputs) }, null, 1));
const bad = Object.keys(built.metafile.inputs).filter(i => /AuthContext|staffEntities|integrations/i.test(i));
if (bad.length) { console.error('AUTH/SDK IN BUNDLE:', bad); process.exit(1); }
const bundle = built.outputFiles[0].text;

const CSS = `
  *,*::before,*::after{box-sizing:border-box}
  body{font-family:system-ui,sans-serif;margin:8px}
  .border{border:1px solid #e5e7eb}.rounded-sm{border-radius:2px}.rounded{border-radius:4px}
  .border-amber-300{border-color:#fcd34d}.bg-amber-50{background:#fffbeb}.bg-amber-100{background:#fef3c7}
  .border-violet-300{border-color:#c4b5fd}.bg-violet-100{background:#ede9fe}
  .border-gray-300{border-color:#d1d5db}.border-gray-200{border-color:#e5e7eb}.bg-white{background:#fff}
  .border-red-200{border-color:#fecaca}.bg-red-50{background:#fef2f2}
  .px-2{padding-left:8px;padding-right:8px}.px-3{padding-left:12px;padding-right:12px}
  .px-1\\.5{padding-left:6px;padding-right:6px}
  .py-1{padding-top:4px;padding-bottom:4px}.py-1\\.5{padding-top:6px;padding-bottom:6px}
  .py-2{padding-top:8px;padding-bottom:8px}.py-4{padding-top:16px;padding-bottom:16px}
  .mb-3{margin-bottom:12px}.-mt-2{margin-top:-8px}.mt-1{margin-top:4px}.mt-2{margin-top:8px}
  .p-4{padding:16px}.mx-auto{margin-left:auto;margin-right:auto}
  .flex{display:flex}.items-center{align-items:center}.gap-2{gap:8px}.gap-1{gap:4px}
  .flex-1{flex:1}.flex-shrink-0{flex-shrink:0}.justify-end{justify-content:flex-end}
  .text-\\[10px\\]{font-size:10px}.text-\\[11px\\]{font-size:11px}.text-\\[12px\\]{font-size:12px}.text-\\[15px\\]{font-size:15px}
  .font-medium{font-weight:500}.font-semibold{font-weight:600}.font-bold{font-weight:700}
  .text-amber-600{color:#d97706}.text-amber-700{color:#b45309}.text-amber-800{color:#92400e}.text-amber-900{color:#78350f}
  .text-violet-600{color:#7c3aed}.text-violet-800{color:#5b21b6}.text-violet-900{color:#4c1d95}
  .text-gray-800{color:#1f2937}.text-gray-700{color:#374151}.text-gray-500{color:#6b7280}.text-gray-400{color:#9ca3af}
  .text-red-700{color:#b91c1c}.text-red-600{color:#dc2626}
  .w-3{width:12px}.h-3{height:12px}.w-3\\.5{width:14px}.h-3\\.5{height:14px}.w-4{width:16px}.h-4{height:16px}
  .h-\\[22px\\]{height:22px}.h-\\[24px\\]{height:24px}.h-\\[26px\\]{height:26px}.h-\\[30px\\]{height:30px}
  .max-w-\\[1500px\\]{max-width:1500px}.max-w-\\[520px\\]{max-width:520px}
  .max-h-\\[320px\\]{max-height:320px}.overflow-y-auto{overflow-y:auto}
  .divide-y>*+*{border-top:1px solid #e5e7eb}.divide-gray-200>*+*{border-color:#e5e7eb}
  .space-y-2>*+*{margin-top:8px}.space-y-3>*+*{margin-top:12px}
  .w-full{width:100%}.block{display:block}.py-2{padding-top:8px;padding-bottom:8px}
  .bg-lime-300{background:#bef264}.border-lime-400{border-color:#a3e635}
  .disabled\\:opacity-60:disabled{opacity:.6}.hover\\:bg-amber-100:hover{background:#fef3c7}.hover\\:text-red-600:hover{color:#dc2626}
  button{cursor:pointer;background:#fff}
  .focus\\:outline-none:focus{outline:none}
`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><meta charset=utf-8><meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><div id="root"></div><script>${bundle}</script>`);
});
await new Promise(r => server.listen(5297, '127.0.0.1', r));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const R = async (name, fn) => {
  try { await fn(); results.push({ case: name, ok: true }); console.log('ok  -', name); }
  catch (e) { results.push({ case: name, ok: false, error: String(e.message || e) }); console.log('FAIL-', name, ':', String(e.message || e).slice(0, 500)); }
};
const open = async (width, mode) => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  page.on('request', (r) => { try { if (new URL(r.url()).origin !== ORIGIN) telemetry.foreign.push({ mode, url: r.url() }); } catch {} });
  page.on('pageerror', (e) => telemetry.pageErrors.push({ mode, error: String(e) }));
  page.on('console', (m) => { if (m.type() === 'error') telemetry.consoleErrors.push({ mode, text: m.text().slice(0, 200) }); });
  await page.goto(`${ORIGIN}/?case=${mode}`);
  await page.waitForSelector('#root > *', { timeout: 10000 });
  return { context, page };
};
const statusEls = (page) => page.$$eval('[role="status"]', ds => ds.map(d => ({ text: d.textContent.trim(), visible: !!(d.offsetWidth || d.offsetHeight) })));
const alertEls = (page) => page.$$eval('[role="alert"]', ds => ds.length);

for (const width of [1280, 390]) {
  const tag = width === 1280 ? 'desktop' : 'mobile';
  await R(`banner ${tag}: role=status notice visible with exact sentence`, async () => {
    const { context, page } = await open(width, 'page-stack');
    const s = await statusEls(page);
    assert.equal(s.length, 1, JSON.stringify(s));
    assert.equal(s[0].text, NOTICE);
    assert.ok(s[0].visible);
    assert.equal(await alertEls(page), 0, 'notice must not use role=alert');
    const body = await page.textContent('#root');
    assert.ok(body.includes('All-In-One section:'), 'banner explainer present');
    await page.screenshot({ path: `${OUT}/notice-stack-${width}.png`, fullPage: true });
    await context.close();
  });

  await R(`banner ${tag}: collapse keeps the notice visible`, async () => {
    const { context, page } = await open(width, 'page-stack');
    await page.click('text=Collapse Section');
    const s = await statusEls(page);
    assert.equal(s.length, 1);
    assert.equal(s[0].text, NOTICE, 'notice must survive collapse');
    const body = await page.textContent('#root');
    assert.ok(!body.includes('save here and the total flows'), 'explainer collapsed');
    await page.screenshot({ path: `${OUT}/notice-collapsed-${width}.png`, fullPage: true });
    await context.close();
  });
}

await R('dismissible notice: per-view dismiss hides then remount restores', async () => {
  const { context, page } = await open(1280, 'notice-dismissible');
  let s = await statusEls(page);
  assert.equal(s.length, 1);
  await page.click('[aria-label="Dismiss preliminary notice"]');
  s = await statusEls(page);
  assert.equal(s.length, 0, 'dismissed view must render nothing');
  await page.reload();
  await page.waitForSelector('#root > *');
  s = await statusEls(page);
  assert.equal(s.length, 1, 'remount restores the notice');
  await context.close();
});

await R('dialog save mode: notes-preamble disclosure renders', async () => {
  const { context, page } = await open(1280, 'dialog-save');
  const body = await page.textContent('#root');
  assert.ok(body.includes('Saved template notes lead with'), 'disclosure line missing');
  assert.ok(body.includes(NOTICE), 'disclosure must quote the sentence');
  await page.screenshot({ path: `${OUT}/dialog-save-1280.png`, fullPage: true });
  await context.close();
});

await R('dialog load mode mobile: carried-notes + stale-review indicators render once each', async () => {
  const { context, page } = await open(390, 'dialog-load');
  await page.waitForSelector('text=With notes + AI', { timeout: 10000 });
  const body = await page.textContent('#root');
  assert.equal((body.match(/Includes project notes/g) || []).length, 1, JSON.stringify(body.slice(0, 1500)));
  assert.equal((body.match(/Includes an AI review note/g) || []).length, 1);
  await page.screenshot({ path: `${OUT}/dialog-load-390.png`, fullPage: true });
  await context.close();
});

await R('zero foreign requests / console errors / page errors', async () => {
  assert.deepEqual(telemetry.foreign, [], JSON.stringify(telemetry.foreign));
  assert.deepEqual(telemetry.consoleErrors, [], JSON.stringify(telemetry.consoleErrors));
  assert.deepEqual(telemetry.pageErrors, [], JSON.stringify(telemetry.pageErrors));
});

fs.writeFileSync(`${OUT}/verify/o119-browser-verification.json`, JSON.stringify({ results, telemetry }, null, 1));
await browser.close();
server.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${failed.length ? 'FAIL' : 'PASS'} o119-browser (${results.length - failed.length}/${results.length} cases)`);
process.exit(failed.length ? 1 : 0);
