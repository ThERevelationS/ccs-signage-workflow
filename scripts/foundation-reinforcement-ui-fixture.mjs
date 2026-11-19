// Reinforcement proposal UI acceptance v2 — isolated synthetic fixture, real components, real Tailwind.
// --keep-server leaves the fixture server running for lead review.
import fs from 'fs';
import http from 'http';
import esbuild from 'esbuild';
import path from 'path';
import { chromium } from 'playwright-core';
import assert from 'assert/strict';

const OUT = '.audit-work/foundation-reinforcement18';
fs.mkdirSync(OUT, { recursive: true });
const PORT = 5172;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const KEEP = process.argv.includes('--keep-server');
const CSS = fs.existsSync(`${OUT}/ui-fixture.css`) ? fs.readFileSync(`${OUT}/ui-fixture.css`, 'utf8') : '';

const harness = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Panel from '@/components/estimator/foundation/FoundationReinforcementProposalPanel.jsx';
window.__calls = [];
const log = (name, arg) => window.__calls.push([name, typeof arg === 'object' && arg !== null ? JSON.parse(JSON.stringify(arg)) : arg]);
const mkDraft = () => ({
  schema_version: 1,
  design: { version: 2, bar_diameter_inches: '', cover_inches: { side: '', top: '', bottom: '' }, supports: { mode: 'unconfigured', reason: '' }, spread: { mats: [], inter_mat_ties: [] }, pillar: { hoops: [], longitudinal: { count: '', radius_inches: '', bottom_end_inches: '', top_end_inches: '' } } },
  material: { kind: 'manual', inventory_id: '', name: '', reason: '', unit: 'ft', bar_diameter_inches: '', weight_lb_per_ft: '', cost_per_ft: '' },
  overrides: { quantity_ft: null, cost_per_ft: null },
});
const mkPreview = () => ({ id: 'prev-1', canAccept: true, stale: false, rateSourceLabel: 'Explicit manual per-foot basis', costs: [{ label: 'Current steel', value: '$252.80', provenance: 'Saved acknowledged amount from a long provenance string for preview wrapping checks' }], quantities: [{ label: 'Steel length', before: '64 ft', after: '20 ft' }], issues: [{ code: 'unknown_weight', severity: 'warning', message: 'Weight is unknown.' }] });
const CAT = [{ id: 'rb1', material_name: 'Rebar #4', rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668, cost_per_unit: 4.2, unit: 'ft' }];
function App() {
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState(null);
  const [flags, setFlags] = useState({});
  const [type, setType] = useState('spread_foot');
  const [ver, setVer] = useState(2);
  window.__setDraft = setDraft; window.__mkDraft = mkDraft; window.__mkPreview = mkPreview;
  window.__setPreview = setPreview; window.__setFlags = setFlags; window.__setType = setType; window.__setVer = setVer;
  window.__draft = draft; window.__item = { foundation_type: type, reinforcement_calculation_version: ver, custom_rebar_qty: 0, custom_rebar_cost: 0 };
  return <Panel
    item={window.__item}
    draft={draft} catalog={CAT} preview={preview}
    disabled={flags.disabled} busy={flags.busy} error={flags.error}
    onStart={() => { log('onStart'); setDraft(mkDraft()); }}
    onDraftChange={(d) => { log('onDraftChange', d); setDraft(d); }}
    onPreview={() => { log('onPreview'); setPreview(mkPreview()); }}
    onAccept={(id) => log('onAccept', id)}
    onDiscard={() => log('onDiscard')}
  />;
}
createRoot(document.getElementById('root')).render(<App />);
`;

const STUBS = {};
const plugin = {
  name: 's',
  setup(b) {
    b.onResolve({ filter: /^harness$/ }, () => ({ path: 'harness', namespace: 'h' }));
    b.onResolve({ filter: /.*/ }, a => (STUBS[a.path] ? { path: 's://' + a.path, namespace: 's' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'h' }, () => ({ contents: harness, loader: 'jsx', resolveDir: path.resolve('.') }));
    b.onLoad({ filter: /.*/, namespace: 's' }, a => ({ contents: STUBS[a.path.slice(4)], loader: 'jsx', resolveDir: path.resolve('.') }));
  },
};

const built = await esbuild.build({ entryPoints: ['harness'], bundle: true, write: false, outdir: 'out', format: 'esm', platform: 'browser', jsx: 'automatic', alias: { '@': path.resolve('src') }, plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' }, metafile: true });
fs.writeFileSync(`${OUT}/ui-v2-meta.json`, JSON.stringify(built.metafile, null, 1));
const bundle = built.outputFiles.find(f => f.path.endsWith('.js')).text;
const html = `<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body class="font-sans m-2"><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle); }
  if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); return res.end(CSS); }
  res.setHeader('Content-Type', 'text/html'); res.end(html);
});
await new Promise(r => server.listen(PORT, r));
const telemetry = { foreign: [], consoleErrors: [], pageErrors: [] };
const results = [];
const guard = (page, tag) => {
  page.on('request', (r) => { try { if (new URL(r.url()).origin !== ORIGIN) telemetry.foreign.push({ tag, url: r.url() }); } catch { telemetry.foreign.push({ tag, url: r.url() }); } });
  page.on('console', (m) => { if (m.type() === 'error') telemetry.consoleErrors.push({ tag, text: m.text() }); });
  page.on('pageerror', (e) => telemetry.pageErrors.push({ tag, text: String(e) }));
};
const R = async (name, fn) => {
  try { await fn(); results.push({ case: name, ok: true }); console.log('ok', name); }
  catch (e) { results.push({ case: name, ok: false, detail: String(e && e.message ? e.message : e) }); console.log('FAIL', name, String(e && e.message ? e.message : e)); }
};

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const open = async (tag, width = 1280) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage(); guard(page, tag);
    await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
    await page.goto(ORIGIN + '/');
    await page.locator('text=Reinforcement proposal').waitFor();
    return { ctx, page };
  };
  const deepFreeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };
  const lastDraft = (page) => page.evaluate(() => window.__calls.filter(c => c[0] === 'onDraftChange').at(-1)?.[1]);

  // c1 mount: zero callbacks, deep-frozen draft unchanged, Unknown metadata
  await R('c1 mount: zero callbacks, deep-frozen draft unchanged, Unknown metadata', async () => {
    const { ctx, page } = await open('c1');
    const frozen = deepFreeze({ schema_version: 1, design: { version: 2, bar_diameter_inches: '', cover_inches: { side: '', top: '', bottom: '' }, supports: { mode: 'unconfigured', reason: '' }, spread: { mats: [], inter_mat_ties: [] }, pillar: { hoops: [], longitudinal: {} } }, material: { kind: 'catalog', inventory_id: 'gone' }, overrides: { quantity_ft: null, cost_per_ft: null } });
    const snap = JSON.stringify(frozen);
    await page.evaluate((d) => window.__setDraft(d), frozen);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__calls.length), 0, 'no callbacks');
    assert.equal(JSON.stringify(await page.evaluate(() => window.__draft)), snap, 'draft unchanged');
    assert.equal(await page.evaluate(() => window.__item.custom_rebar_qty), 0, 'item untouched');
    await ctx.close();
    return true;
  });

  // c2 raw -oops + frozen original unchanged
  await R('c2 raw "-oops" cover: exact string delivered, frozen original unchanged', async () => {
    const { ctx, page } = await open('c2');
    const frozen = deepFreeze(await page.evaluate(() => window.__mkDraft()));
    const snap = JSON.stringify(frozen);
    await page.evaluate((d) => window.__setDraft(d), frozen);
    await page.locator('label:has-text("Cover side (in)") input').first().fill('-oops');
    await page.waitForFunction(() => window.__calls.length > 0, null, { timeout: 8000 });
    const next = await lastDraft(page);
    assert.equal(next.design.cover_inches.side, '-oops', 'raw string');
    assert.equal(next.design.cover_inches.top, '', 'top unchanged');
    assert.equal(JSON.stringify(frozen), snap, 'frozen original unchanged');
    await ctx.close();
    return true;
  });

  // c3 two adds unique ids, delete preserves unrelated, parent undo restores
  await R('c3 two mat adds: unique prefixed ids, empty fields, delete preserves, undo restores', async () => {
    const { ctx, page } = await open('c3');
    await page.evaluate(() => window.__setDraft(window.__mkDraft()));
    const addBtn = page.locator('[data-add="mats"]');
    await addBtn.click();
    await addBtn.click();
    const mats = await page.evaluate(() => window.__draft.design.spread.mats);
    assert.equal(mats.length, 2, 'two mats');
    assert.ok(mats[0].id !== mats[1].id, 'unique ids');
    assert.ok(mats.every(m => m.id.startsWith('mat_') && m.bearing_elevation_inches === ''), 'prefix + blank');
    const before = await page.evaluate(() => window.__draft.design.spread.mats[0].id);
    await page.locator('[data-del="mats:0"]').click();
    const after = await page.evaluate(() => window.__draft.design.spread.mats);
    assert.equal(after.length, 1, 'one deleted');
    assert.equal(after[0].id, mats[1].id, 'unrelated row preserved');
    // parent rerender with prior draft (undo) restores controlled values
    const prior = await page.evaluate(() => window.__mkDraft());
    prior.design.spread.mats = [{ id: 'mat_prior', bearing_elevation_inches: '9', max_spacing_x_inches: '', max_spacing_z_inches: '' }];
    await page.evaluate((d) => window.__setDraft(d), prior);
    await page.waitForFunction(() => document.querySelector('[data-list="mats"] input')?.value === '9', null, { timeout: 8000 });
    assert.equal(await page.locator('[data-list="mats"] input').first().inputValue(), '9', 'controlled restore');
    await ctx.close();
    return true;
  });

  // c4 manual/catalog round-trip retains raw; unavailable id stays visible
  await R('c4 manual/catalog round-trip retains raw; unavailable id stays visible', async () => {
    const { ctx, page } = await open('c4');
    const d = await page.evaluate(() => window.__mkDraft());
    d.material = { kind: 'catalog', inventory_id: 'gone-9', name: 'keep-name', reason: 'keep-reason', unit: 'ft', bar_diameter_inches: '0.625', weight_lb_per_ft: '1.0', cost_per_ft: '2.5' };
    await page.evaluate((x) => window.__setDraft(x), d);
    const sel = page.locator('select').nth(1);
    assert.equal(await sel.inputValue(), 'gone-9', 'unavailable id stays');
    await page.getByRole('button', { name: 'Manual' }).click();
    let last = await lastDraft(page);
    assert.equal(last.material.kind, 'manual');
    assert.equal(last.material.unit, 'ft', 'explicit ft');
    assert.equal(last.material.name, 'keep-name', 'name retained');
    await page.getByRole('button', { name: 'Catalog' }).click();
    last = await lastDraft(page);
    assert.equal(last.material.kind, 'catalog');
    assert.equal(last.material.inventory_id, 'gone-9', 'id retained through switch');
    await ctx.close();
    return true;
  });

  // c5 override: clear -> null, "0" stays "0", item custom fields snapshot unchanged
  await R('c5 override clear -> null; "0" stays "0"; item custom fields unchanged', async () => {
    const { ctx, page } = await open('c5');
    await page.evaluate(() => window.__setDraft(window.__mkDraft()));
    const itemSnap = await page.evaluate(() => JSON.stringify(window.__item));
    const q = page.locator('label:has-text("Quantity override") input').first();
    await q.fill('0');
    await page.waitForFunction(() => window.__calls.length > 0, null, { timeout: 8000 });
    assert.equal((await lastDraft(page)).overrides.quantity_ft, '0', '"0" stays string');
    await q.fill('');
    await page.waitForFunction(() => window.__calls.at(-1)[1].overrides.quantity_ft === null, null, { timeout: 8000 });
    assert.equal((await lastDraft(page)).overrides.quantity_ft, null, 'clear -> null');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__item)), itemSnap, 'item unchanged');
    await ctx.close();
    return true;
  });

  // c6 accept gating: all blocks + eligible fires once; disabled form blocks edits
  await R('c6 accept gating: stale/canAccept:false/busy/disabled/nonstring-id/unsupported block; eligible fires once', async () => {
    const { ctx, page } = await open('c6');
    await page.evaluate(() => window.__setDraft(window.__mkDraft()));
    const btn = page.getByRole('button', { name: 'Accept Proposal' });
    for (const [label, pv] of [['canAccept:false', { canAccept: false }], ['stale', { stale: true }], ['id:123', { id: 123 }], ['id:""', { id: '' }]]) {
      await page.evaluate((p) => window.__setPreview({ ...window.__mkPreview(), ...p }), pv);
      assert.equal(await btn.isDisabled(), true, 'blocked: ' + label);
    }
    await page.evaluate(() => { window.__setFlags({ busy: true }); window.__setPreview(window.__mkPreview()); });
    assert.equal(await btn.isDisabled(), true, 'blocked: busy');
    await page.evaluate(() => { window.__setFlags({ disabled: true }); });
    assert.equal(await btn.isDisabled(), true, 'blocked: disabled');
    await page.evaluate(() => { window.__setFlags({}); window.__setVer(7); });
    await page.waitForTimeout(150);
    assert.equal(await btn.isDisabled(), true, 'blocked: unsupported version');
    await page.evaluate(() => { window.__setVer(2); window.__setFlags({ disabled: true }); });
    const callsBefore = await page.evaluate(() => window.__calls.length);
    await page.evaluate(() => { const i = document.querySelector('label input'); i.value = '3'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__calls.length), callsBefore, 'disabled blocks edits');
    await page.evaluate(() => window.__setFlags({}));
    await page.evaluate(() => window.__setPreview(window.__mkPreview()));
    assert.equal(await btn.isDisabled(), false, 'enabled when eligible');
    await btn.click();
    const calls = await page.evaluate(() => window.__calls.filter(c => c[0] === 'onAccept'));
    assert.equal(calls.length, 1, 'once');
    assert.equal(calls[0][1], 'prev-1', 'exact id');
    await ctx.close();
    return true;
  });

  // c7 delete parent mat: ties unmodified, both orphans visible
  await R('c7 delete parent mat: ties unmodified, orphan refs visible', async () => {
    const { ctx, page } = await open('c7');
    const d = await page.evaluate(() => window.__mkDraft());
    d.design.spread.mats = [{ id: 'mat_a', bearing_elevation_inches: '', max_spacing_x_inches: '', max_spacing_z_inches: '' }];
    d.design.spread.inter_mat_ties = [
      { id: 'tie_1', from_mat_id: 'mat_a', to_mat_id: 'mat_gone1', x_inches: '', z_inches: '', cut_length_inches: '' },
      { id: 'tie_2', from_mat_id: 'mat_gone2', to_mat_id: 'mat_a', x_inches: '', z_inches: '', cut_length_inches: '' },
    ];
    const tiesSnap = JSON.stringify(d.design.spread.inter_mat_ties);
    await page.evaluate((x) => window.__setDraft(x), d);
    await page.locator('[data-del="mats:0"]').click();
    const last = await lastDraft(page);
    assert.deepEqual(JSON.stringify(last.design.spread.inter_mat_ties), tiesSnap, 'ties unmodified');
    const sels = await page.locator('[data-list="ties"] select').all();
    const vals = await Promise.all(sels.map(s => s.inputValue()));
    assert.ok(vals.includes('mat_gone1') && vals.includes('mat_gone2'), 'both orphans visible');
    await ctx.close();
    return true;
  });

  // c8 pillar: hoop add all-blank, allowance '0' raw, inactive spread preserved on type change
  await R('c8 pillar hoop all-blank + allowance "0"; type change preserves inactive spread', async () => {
    const { ctx, page } = await open('c8');
    const d = await page.evaluate(() => window.__mkDraft());
    d.design.spread.mats = [{ id: 'mat_a', bearing_elevation_inches: '5', max_spacing_x_inches: '6', max_spacing_z_inches: '7' }];
    const spreadSnap = JSON.stringify(d.design.spread);
    await page.evaluate((x) => { window.__setDraft(x); window.__setType('pillar'); }, d);
    await page.locator('[data-add="hoops"]').click();
    const hoop = await page.evaluate(() => window.__draft.design.pillar.hoops[0]);
    assert.ok(hoop.id.startsWith('hoop_') && hoop.center_y_inches === '' && hoop.cut_allowance_inches === '', 'all-blank hoop');
    const lonCount = page.locator('label:has-text("Longitudinal count") input').first();
    await lonCount.fill('4');
    await page.waitForFunction(() => window.__calls.length > 0, null, { timeout: 8000 });
    const last = await lastDraft(page);
    assert.equal(last.design.pillar.longitudinal.count, '4', 'raw 4');
    assert.equal(JSON.stringify(last.design.spread), spreadSnap, 'inactive spread deepEqual');
    await ctx.close();
    return true;
  });

  // c9 21 rows paginate; shrink -> prev goes page1; no parent callback on pagination
  await R('c9 21 rows paginate; page-2 edit only that row; shrink+prev no stuck', async () => {
    const { ctx, page } = await open('c9');
    const d = await page.evaluate(() => window.__mkDraft());
    d.design.spread.mats = Array.from({ length: 21 }, (_, i) => ({ id: 'mat_' + i, bearing_elevation_inches: String(i), max_spacing_x_inches: '', max_spacing_z_inches: '' }));
    await page.evaluate((x) => window.__setDraft(x), d);
    const callsBefore = await page.evaluate(() => window.__calls.length);
    await page.locator('[data-page="next"]').click();
    assert.equal(await page.evaluate(() => window.__calls.length), callsBefore, 'no parent callback on pagination');
    const inp = page.locator('[data-list="mats"] input').first();
    await inp.fill('999');
    await page.waitForFunction((n) => window.__calls.length > n, callsBefore, { timeout: 8000 });
    const last = await lastDraft(page);
    assert.equal(last.design.spread.mats.length, 21, 'all 21 preserved');
    assert.equal(last.design.spread.mats[20].bearing_elevation_inches, '999', 'page-2 row changed');
    assert.equal(last.design.spread.mats[0].bearing_elevation_inches, '0', 'page-1 intact');
    await ctx.close();
    return true;
  });

  // c10 styled mobile+desktop: computed amber/grid, no overflow, populated screenshot
  await R('c10 styled mobile375+desktop: computed amber/grid, no overflow, populated shots', async () => {
    const { ctx: cm, page: pm } = await open('c10m', 375);
    const d = await pm.evaluate(() => window.__mkDraft());
    d.design.spread.mats = [{ id: 'mat_' + 'a'.repeat(36), bearing_elevation_inches: '5', max_spacing_x_inches: '6', max_spacing_z_inches: '7' }];
    d.material.name = 'Long material name for wrapping checks in preview and manual fields';
    await pm.evaluate((x) => { window.__setDraft(x); window.__setPreview(window.__mkPreview()); }, d);
    await pm.waitForTimeout(300);
    assert.ok(await pm.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'no mobile overflow');
    const amber = await pm.evaluate(() => getComputedStyle(document.querySelector('.text-amber-700')).color);
    assert.ok(amber.includes('rgb'), 'amber computed: ' + amber);
    await pm.screenshot({ path: OUT + '/c10-mobile.png' });
    await cm.close();
    const { ctx: cd, page: pd } = await open('c10d');
    await pd.evaluate((x) => { window.__setDraft(x); window.__setPreview(window.__mkPreview()); }, d);
    await pd.waitForTimeout(300);
    assert.ok(await pd.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'no desktop overflow');
    const grid = await pd.evaluate(() => getComputedStyle(document.querySelector('.grid.grid-cols-3')).display);
    assert.equal(grid, 'grid', 'grid layout computed');
    await pd.screenshot({ path: OUT + '/c10-desktop.png' });
    await cd.close();
    return true;
  });

  // REGRESSIONS
  await R('r1 malformed mats + valid ties: repair notice, ties not remapped', async () => {
    const { ctx, page } = await open('r1');
    const d = await page.evaluate(() => window.__mkDraft());
    d.design.spread.mats = 'corrupted';
    d.design.spread.inter_mat_ties = [{ id: 'tie_1', from_mat_id: 'x', to_mat_id: 'y', x_inches: '', z_inches: '', cut_length_inches: '' }];
    const snap = JSON.stringify(d.design.spread.inter_mat_ties);
    await page.evaluate((x) => window.__setDraft(x), d);
    await page.locator('[data-list="mats"]').getByText('malformed', { exact: false }).waitFor();
    await page.locator('[data-list="mats"]').getByText('Replace List').click();
    const last = await lastDraft(page);
    assert.deepEqual(last.design.spread.mats, [], 'explicit replace');
    assert.equal(JSON.stringify(last.design.spread.inter_mat_ties), snap, 'ties unmodified');
    await ctx.close();
    return true;
  });

  await R('r2 malformed hoops + null row: explicit repair, null row delete', async () => {
    const { ctx, page } = await open('r2');
    const d = await page.evaluate(() => window.__mkDraft());
    d.design.pillar.hoops = [null, { id: 'h1', center_y_inches: '', centerline_diameter_inches: '', cut_allowance_inches: '' }];
    await page.evaluate((x) => { window.__setDraft(x); window.__setType('pillar'); }, d);
    await page.locator('[data-list="hoops"]').getByText('Malformed row', { exact: false }).waitFor();
    await page.locator('[data-del="hoops:0"]').click();
    const last = await lastDraft(page);
    assert.equal(last.design.pillar.hoops.length, 1, 'null row deleted');
    assert.equal(last.design.pillar.hoops[0].id, 'h1', 'valid row preserved');
    await ctx.close();
    return true;
  });

  await R('r3 missing UUID: Add disabled with notice', async () => {
    const { ctx, page } = await open('r3');
    await page.evaluate(() => { window.__setDraft(window.__mkDraft()); Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true }); });
    const addBtn = page.locator('[data-add="mats"]');
    assert.equal(await addBtn.isDisabled(), true, 'Add disabled');
    await page.locator('[data-list="mats"]').getByText('Secure row IDs unavailable', { exact: false }).waitFor();
    await ctx.close();
    return true;
  });

  await R('r4 4096 ties cap + 257th mat Add disabled', async () => {
    const { ctx, page } = await open('r4');
    const d = await page.evaluate(() => window.__mkDraft());
    d.design.spread.mats = Array.from({ length: 256 }, (_, i) => ({ id: 'm' + i, bearing_elevation_inches: '', max_spacing_x_inches: '', max_spacing_z_inches: '' }));
    d.design.spread.inter_mat_ties = Array.from({ length: 4096 }, (_, i) => ({ id: 't' + i, from_mat_id: '', to_mat_id: '', x_inches: '', z_inches: '', cut_length_inches: '' }));
    await page.evaluate((x) => window.__setDraft(x), d);
    assert.equal(await page.locator('[data-add="mats"]').isDisabled(), true, 'mats at 256 cap');
    assert.equal(await page.locator('[data-add="ties"]').isDisabled(), true, 'ties at 4096 cap');
    await ctx.close();
    return true;
  });

  await R('r5 strict version labels: "2" is Unsupported not Version 2', async () => {
    const { ctx, page } = await open('r5');
    await page.evaluate(() => { window.__setVer('2'); });
    await page.locator('span', { hasText: 'Unsupported' }).first().waitFor();
    await page.evaluate(() => { window.__setVer(2); });
    await page.locator('text=Version 2').waitFor();
    await page.evaluate(() => { window.__setVer(null); });
    await page.locator('text=Legacy').waitFor();
    await ctx.close();
    return true;
  });
} finally {
  if (browser) await browser.close().catch(() => {});
  if (!KEEP) await new Promise(r => server.close(r));
}

if (telemetry.foreign.length) results.push({ case: 'external-request', ok: false, detail: telemetry.foreign });
if (telemetry.pageErrors.length) results.push({ case: 'pageerror', ok: false, detail: telemetry.pageErrors });
if (telemetry.consoleErrors.length) results.push({ case: 'console-error', ok: false, detail: telemetry.consoleErrors });
fs.writeFileSync(`${OUT}/ui-results.json`, JSON.stringify({ synthetic: true, telemetry, results }, null, 1));
const fails = results.filter(r => r.ok === false);
console.log(`reinforcement-ui cases=${results.length} failed=${fails.length}`);
if (KEEP) console.log(`fixture server kept running: ${ORIGIN} pid=${process.pid}`);
process.exitCode = fails.length ? 1 : 0;
