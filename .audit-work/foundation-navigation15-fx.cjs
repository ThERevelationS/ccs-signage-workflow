const fs = require('fs');
const p = 'scripts/foundation-navigation-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(`const OUT = '.audit-work/foundation-materials14';`, `const OUT = '.audit-work/foundation-navigation15';`);
// harness: real Routes + app-shell Link outside the page
s = s.replace(`import { BrowserRouter, useNavigate } from 'react-router-dom';`, `import { BrowserRouter, useNavigate, Routes, Route, Link } from 'react-router-dom';`);
s = s.replace(
  `createRoot(document.getElementById('root')).render(
  React.createElement(BrowserRouter, null,
    React.createElement(NavSpy),
    React.createElement(Page, {
      onSaved: () => window.__spies.push(['onSaved']),
      onClose: () => window.__spies.push(['onClose']),
    })));`,
  `function Away(){ return React.createElement('div', null,
    React.createElement(Link, { to: '/FoundationEstimator?id=p3&estimateId=e1', id: 'open-foundation' }, 'Open foundation estimator')); }
const pageEl = React.createElement(Page, {
  onSaved: () => window.__spies.push(['onSaved']),
  onClose: () => window.__spies.push(['onClose']),
});
createRoot(document.getElementById('root')).render(
  React.createElement(BrowserRouter, null,
    React.createElement(NavSpy),
    React.createElement(Link, { to: '/away', id: 'shell-away' }, 'Shell back to workflow'),
    React.createElement(Routes, null,
      React.createElement(Route, { path: '/away', element: React.createElement(Away) }),
      React.createElement(Route, { path: '*', element: pageEl }))));`
);
// DATA: single p3 full-catalog project + p3-keyed receipt + e1 line aligned p3/v1
const dStart = s.indexOf('const CASE =');
const dEnd = s.indexOf('const server =');
s = s.slice(0, dStart) + `const CASE = JSON.parse(fs.readFileSync('.audit-work/foundation-materials14/complete-before.json', 'utf8')).cases[1];
const EXP_ITEM = CASE.expected.items[0];
const RECEIPT = createFoundationSyncAttempt({ sourceId: 'p3', estimateId: 'e1', key: 'key-nav-receipt-p3', requestedAt: '2024-01-01T00:00:00Z' });
const projB3 = {
  id: 'p3', updated_date: 'v1', project_name: 'NavProj', client_name: 'C', excavation_method: 'hand_dig',
  items: [deep(EXP_ITEM)], poles: [], wall_caps: [], walls: [], signage_cabinets: [], selected_equipment: [],
  landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
};
projB3.builder_sync_attempt = RECEIPT;
const _dd = CASE.expected.delivery;
projB3.concrete_delivery_snapshot = { version: 1, concrete_total: _dd.concreteTotal, rounded_yards: _dd.roundedYards, rate_per_yard: _dd.ratePerYard, additional_stops_cost: _dd.additionalStopsCost, trucks: _dd.trucksList.map(t => ({ yards: t.yards, rounded_yards: t.roundedYards, cost: t.cost, small_order_fee: t.smallOrderFee, fuel_fee: t.fuelFee })) };
const DATA = {
  catalogs: { p3: { inv: deep(CASE.inventory), lab: [], set: [{ setting_name: 'wall_labor_rate', setting_value: 25 }] } },
  projects: { p3: projB3 },
  estimates: { e1: { id: 'e1', line_items: [{ module_key: 'foundation', project_id: 'p3', estimate_id: 'e1', updated_date_snapshot: 'v1' }] } },
};
` + s.slice(dEnd);
// scenarios
const s1 = s.indexOf('// ============ B1');
const end = s.indexOf('} finally {');
const resultsIdx = s.indexOf('const results = [];');
s = s.replace(`const results = [];`, `const results = []; // baseline_reproduction / data_loss_reproduced`);
s = s.slice(0, s1) + `const desc = (page) => page.locator('label:has-text("Description") input').first();
const ORIGINAL_DESC = EXP_ITEM.description || '';
const writeSpies = (page) => page.evaluate(() => window.__spies.filter(x => ['saveSource', 'recordBuilderSave', 'pricing', 'ensureIdempotent', 'converter', 'onSaved', 'onClose'].includes(x[0])).length);

// N1: native browser back/forward — unsent draft loss reproduction
await R('N1 data_loss_reproduced: browser back/forward returns saved description, draft lost, zero writes', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 'n1');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/away');
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await desc(page).fill('native-back-unsent');
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'native-back-unsent', null, { timeout: 8000 });
  await page.goBack();
  await page.waitForURL('**/away', { timeout: 8000 });
  assert.equal(await page.locator('#open-foundation').count(), 1, 'arrived /away');
  await page.goForward();
  await waitLoaded(page, 'p3');
  const value = await desc(page).inputValue();
  assert.equal(value, ORIGINAL_DESC, 'OBSERVED LOSS: saved description returned');
  assert.equal(await writeSpies(page), 0, 'no source/Builder/pricing writes');
  await page.screenshot({ path: OUT + '/n1-lost-after-forward.png' });
  await ctx.close();
  return true;
});

// N2: app-shell Link away then back — same loss via in-app navigation
await R('N2 data_loss_reproduced: app-shell link away/back returns saved description, draft lost', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page2 = await ctx.newPage();
  guard(page2, 'n2');
  await page2.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page2.goto(ORIGIN + '/away');
  await page2.locator('#open-foundation').click();
  await waitLoaded(page2, 'p3');
  await desc(page2).fill('app-shell-unsent');
  await page2.waitForFunction(() => window.__seenProject.items[0].description === 'app-shell-unsent', null, { timeout: 8000 });
  await page2.locator('#shell-away').click();
  await page2.waitForURL('**/away', { timeout: 8000 });
  await page2.locator('#open-foundation').click();
  await waitLoaded(page2, 'p3');
  const value = await desc(page2).inputValue();
  assert.equal(value, ORIGINAL_DESC, 'OBSERVED LOSS: saved description returned');
  assert.equal(await writeSpies(page2), 0, 'no source/Builder/pricing writes');
  await page2.screenshot({ path: OUT + '/n2-lost-after-shell.png' });
  await ctx.close();
  return true;
});

// N3: real beforeunload — dismiss cancels reload, draft retained
await R('N3 baseline_reproduction: real beforeunload dialog dismiss retains unsent draft', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 'n3');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/away');
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await desc(page).fill('reload-warn-unsent');
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'reload-warn-unsent', null, { timeout: 8000 });
  let dialogSeen = null;
  page.once('dialog', (d) => { dialogSeen = { type: d.type(), message: d.message() }; d.dismiss(); });
  let navError = null;
  try { await page.reload({ timeout: 10000 }); } catch (e) { navError = String(e.message || e); }
  assert.ok(dialogSeen && dialogSeen.type === 'beforeunload', 'real beforeunload dialog fired');
  assert.ok(/navigat|cancel/i.test(navError || ''), 'navigation cancelled by dismissal');
  assert.equal(await desc(page).inputValue(), 'reload-warn-unsent', 'draft retained after cancelled reload');
  assert.equal(await writeSpies(page), 0, 'no writes');
  await page.screenshot({ path: OUT + '/n3-dialog-retained.png' });
  await ctx.close();
  return true;
});

` + s.slice(end);
s = s.replace('material-integrity-browser', 'navigation-loss-repro');
fs.writeFileSync(p, s);
console.log('nav fixture written');
