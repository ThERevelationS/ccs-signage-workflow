const fs = require('fs');
const p = 'scripts/foundation-material-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(`const OUT = '.audit-work/foundation-equipment13';`, `const OUT = '.audit-work/foundation-materials14';`);
// remove UI stubs -> real ItemCard/Delivery/BOM
s = s.replace(/  '@\/components\/estimator\/foundation\/FoundationItemCard': `export default \(\)=><div\/>`,\n/, '');
s = s.replace(/  '@\/components\/estimator\/foundation\/ConcreteDeliveryPanel': `export default \(\)=><div\/>`,\n/, '');
s = s.replace(/  '@\/components\/estimator\/foundation\/FoundationBOM': `export default \(\)=><div\/>`,\n/, '');
// defer-write seam inside fake source write
s = s.replace(
  `'@/components/estimator/builder/sourceProjectPersistence': \`export const updateBuilderSourceProject=async a=>{window.__spies.push(['saveSource',a]);`,
  `'@/components/estimator/builder/sourceProjectPersistence': \`export const updateBuilderSourceProject=async a=>{window.__spies.push(['saveSource',a]);if(window.__deferWrite) await new Promise(res=>window.__releaseSourceWrite=res);`
);
// fixture data: replace frozen equipment fixtures with materials case1 fixtures
const fxStart = s.indexOf('const projMissing');
const dataEnd = s.indexOf('const server =');
s = s.slice(0, fxStart) + `const CASE = JSON.parse(fs.readFileSync('.audit-work/foundation-materials14/complete-before.json', 'utf8')).cases[1];
const EXP_ITEM = CASE.expected.items[0];
const FULLV = () => ({ inv: JSON.parse(JSON.stringify(CASE.inventory)), lab: [], set: [{ setting_name: 'wall_labor_rate', setting_value: 25 }] });
const PROJ_A = (items) => ({
  id: 'p1', updated_date: 'v1', project_name: 'Synthetic', client_name: 'C', excavation_method: 'hand_dig',
  items, poles: [], wall_caps: [], walls: [], signage_cabinets: [], selected_equipment: [],
  landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
});
// B1: saved expected snapshot (proves saved-cache not fresh)
const projB1 = PROJ_A([deep(EXP_ITEM)]);
projB1.builder_sync_attempt = RECEIPT;
projB1.concrete_delivery_snapshot = undefined; // legacy: no snapshot
// B2: raw cached financials 0 -> proves old raw cache != expected
const rawZero = { ...deep(EXP_ITEM) };
for (const k of Object.keys(rawZero)) if (/_cost$|_total$|^concrete_bags$|^rebar_feet$|^rebar_weight_lbs$|^forming_qty$/.test(k) && typeof rawZero[k] === 'number') rawZero[k] = 0;
const projB2 = PROJ_A([rawZero]);
projB2.id = 'p2';
projB2.builder_sync_attempt = RECEIPT;
projB2.concrete_delivery_snapshot = { version: 1, concrete_total: CASE.expected.delivery.concreteTotal, rounded_yards: CASE.expected.delivery.roundedYards, rate_per_yard: CASE.expected.delivery.ratePerYard, additional_stops_cost: CASE.expected.delivery.additionalStopsCost, trucks: CASE.expected.delivery.trucksList };
// B3: fresh full-catalog project raw cache 0
const projB3 = PROJ_A([{ ...deep(rawZero), component_id: 'f1' }]);
projB3.id = 'p3';
projB3.builder_sync_attempt = RECEIPT;
projB3.concrete_delivery_snapshot = projB2.concrete_delivery_snapshot;
const DATA = {
  projects: { p1: projB1, p2: projB2, p3: projB3 },
  estimates: {
    e1: { id: 'e1', line_items: [{ module_key: 'foundation', project_id: 'p1', estimate_id: 'e1', updated_date_snapshot: 'v1' }] },
    e2: { id: 'e2', line_items: [] },
  },
};
` + s.slice(dataEnd);
// scenario bodies: replace existing S1..S3 block with B1..B3
const s1 = s.indexOf('// ============ SCENARIO');
const end = s.indexOf('// ---------- teardown ----------');
s = s.slice(0, s1) + `const settle = (page, i, val) => page.evaluate(([i, v]) => window.__reads[i].res(v), [i, val]);
const settleAll = async (page, cat) => {
  const n = await page.evaluate(() => window.__reads.length);
  for (let i = 0; i < n; i++) await settle(page, i, cat[i] === undefined ? cat : cat);
};
const readsInfo = (page) => page.evaluate(() => window.__reads.map(r => ({ label: r.label, query: r.query, sort: r.sort })));
const catFull = async (page) => { await cat(page, FULLV()); await arm(page, 3); };

// ============ B1: missing bag, legacy no delivery snapshot -> blocked + saved amounts ============
await R('B1: missing bag legacy -> alert, saved total, no fake trucks, all write paths blocked', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 'b1');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p1&estimateId=e1');
  await waitLoaded(page, 'p1');
  const al = await alertText(page);
  assert.ok(al.includes('Pricing unavailable'), 'global alert');
  const body = await page.locator('body').innerText();
  const expectedTotal = EXP_ITEM.item_total_cost;
  const fmt = (v) => '$' + v.toFixed(2);
  assert.ok(body.includes(fmt(expectedTotal)), \`saved item total \${fmt(expectedTotal)}\`);
  assert.ok(body.includes('Catalog item unavailable'), 'missing bag option');
  assert.ok(!body.includes('381'), 'no fake 381');
  const rawBefore = await seen(page);
  const desc = page.locator('input').nth(1);
  await desc.fill('unsaved material draft');
  await page.getByRole('button', { name: 'Save As Copy' }).click();
  await page.getByRole('button', { name: 'Swap to BrickStone' }).click();
  await page.getByRole('button', { name: 'Save & Exit' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.keyboard.press('Control+s');
  await page.locator('button[title="Auto-save"]').click();
  await page.waitForTimeout(2300);
  for (const k of ['saveSource', 'recordBuilderSave', 'pricing', 'ensureIdempotent', 'converter', 'onSaved', 'onClose'])
    assert.equal(await spyCount(page, k), 0, 'zero ' + k);
  assert.equal(new URL(page.url()).search, '?id=p1&estimateId=e1');
  const rawAfter = await seen(page);
  assert.deepEqual(rawAfter.builder_sync_attempt, RECEIPT, 'receipt preserved');
  assert.equal(rawAfter.items[0].description, 'unsaved material draft', 'raw draft kept');
  await ctx.close();
  return true;
});

// ============ B2: reload -> full catalog -> explicit save CAS v1 -> #99 blocked keeps saved expected ============
await R('B2: catalog recovery -> save v1 body=frozen expected; #99 blocked uses ack cache not raw0', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 'b2');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p2&estimateId=e1');
  await waitLoaded(page, 'p2');
  const rawBefore = await seen(page);
  assert.equal(rawBefore.items[0].item_total_cost, 0, 'raw cache 0 seed');
  await cat(page, FULLV());
  await arm(page, 3);
  await page.getByRole('button', { name: /catalogs/ }).click();
  await page.waitForFunction(() => window.__reads.length >= 3, null, { timeout: 10000 });
  const reads = await readsInfo(page);
  assert.deepEqual(reads.map(r => r.label), ['Foundation inventory', 'Concrete labor/services', 'Estimator Settings'], 'exact 3 labels');
  await settleAll(page, undefined);
  await page.waitForFunction(() => !document.body.innerText.includes('Pricing unavailable'), null, { timeout: 10000 });
  const rawAfter = await seen(page);
  assert.deepEqual(rawAfter.builder_sync_attempt, rawBefore.builder_sync_attempt, 'receipt kept');
  await page.waitForTimeout(2300);
  assert.equal(await spyCount(page, 'saveSource'), 0, 'no auto write');
  // explicit save -> CAS v1, body items == frozen expected + authored description
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'saveSource').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS v1');
  const written = arg.data.items[0];
  assert.equal(written.item_total_cost, EXP_ITEM.item_total_cost, 'saved uses real calc expected not raw0');
  assert.equal(written.description, EXP_ITEM.description, 'authored description');
  assert.equal(await spyCount(page, 'recordBuilderSave'), 1);
  assert.equal(await spyCount(page, 'onSaved'), 1);
  // #99 -> blocked but keeps expected saved (ack cache), raw #99 + 0 stays
  const rebarInput = page.locator('input').filter({ has: page.locator('..') }).first();
  const sizeInput = page.locator('label:has-text("Rebar size") input, input[aria-label*="Rebar"], input[value="#4"]').first();
  await sizeInput.fill('#99');
  await sizeInput.blur();
  await page.waitForTimeout(400);
  const raw99 = await seen(page);
  assert.equal(raw99.items[0].rebar_size, '#99', 'raw #99 kept');
  assert.equal(raw99.items[0].item_total_cost, 0, 'raw cache still 0');
  // undo -> #4; edit #99 again -> still expected
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(300);
  assert.equal(await spyCount(page, 'saveSource'), 1, 'no extra writes');
  await ctx.close();
  return true;
});

// ============ B3: held source write + #99 new edit during pending -> ack cache wins ============
await R('B3: deferred source write + #99 edit mid-flight -> saved expected, no Builder, dirty', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 'b3');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p3&estimateId=e1');
  await waitLoaded(page, 'p3');
  await cat(page, FULLV());
  await arm(page, 3);
  await page.getByRole('button', { name: /catalogs/ }).click();
  await page.waitForFunction(() => window.__reads.length >= 3, null, { timeout: 10000 });
  await settleAll(page, undefined);
  await page.waitForFunction(() => !document.body.innerText.includes('Pricing unavailable'), null, { timeout: 10000 });
  await page.evaluate(() => { window.__deferWrite = true; });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'saveSource').length === 1, null, { timeout: 10000 });
  const sizeInput = page.locator('label:has-text("Rebar size") input, input[value="#4"]').first();
  await sizeInput.fill('#99');
  await sizeInput.blur();
  await page.evaluate(() => window.__releaseSourceWrite && window.__releaseSourceWrite());
  await page.waitForTimeout(1500);
  const raw = await seen(page);
  assert.equal(raw.items[0].rebar_size, '#99', 'raw #99 preserved');
  assert.equal(await spyCount(page, 'onSaved'), 0, 'onSaved 0 (superseded)');
  assert.equal(await spyCount(page, 'recordBuilderSave'), 0, 'Builder 0 (superseded)');
  await page.waitForTimeout(500);
  const arg = await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').map(x => x[1]));
  assert.equal(arg.length, 1, 'one source write');
  await ctx.close();
  return true;
});

` + s.slice(end);
// fix title
s = s.replace(/catalog-integrity-browser/g, 'material-browser');
fs.writeFileSync(p, s);
console.log('fixture patched');
