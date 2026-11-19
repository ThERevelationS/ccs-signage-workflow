const fs = require('fs');
const p = 'scripts/foundation-equipment-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
// real EquipmentTab: remove stub
s = s.replace(/  '@\/components\/estimator\/foundation\/FoundationEquipmentTab': `export default \(\)=><div\/>`,\n/, '');
// fixture data: replace repro/pole+cap+wall fixtures with equipment fixtures
const reproStart = s.indexOf("const IN = JSON.parse");
const stubStart = s.indexOf('// ---------- stubs');
const newFixtures = `const IN = JSON.parse(fs.readFileSync('.audit-work/foundation-catalog-pricing11/calculator-loss-repro.json', 'utf8')).inputs;
await esbuild.build({ entryPoints: ['src/components/estimator/foundation/foundationSyncRecovery.js'], bundle: true, format: 'esm', outfile: '.audit-work/foundation-equipment13/syncrec-b.mjs', alias: { '@': path.resolve('src') }, loader: { '.js': 'jsx', '.jsx': 'jsx' } });
await esbuild.build({ entryPoints: ['src/components/estimator/foundation/foundationCalc.js'], bundle: true, format: 'esm', outfile: '.audit-work/foundation-equipment13/calc-b.mjs', alias: { '@': path.resolve('src') }, loader: { '.js': 'jsx', '.jsx': 'jsx' } });
const { createFoundationSyncAttempt } = await import(pathToFileURL(path.resolve('.audit-work/foundation-equipment13/syncrec-b.mjs')));
const { calcProject, calcEquipmentPricing } = await import(pathToFileURL(path.resolve('.audit-work/foundation-equipment13/calc-b.mjs')));

const RECEIPT = createFoundationSyncAttempt({ sourceId: 'p1', estimateId: 'e1', key: 'key-fx-receipt', requestedAt: '2024-01-01T00:00:00Z' });
const EQROW = { id: 'eq1', material_type: 'excavation_equipment', material_name: 'Rental Excavator', cost_per_day: 100, cost_per_week: 500, pickup_delivery_cost: 20, compatible_attachment_ids: ['att1'], compatible_sub_attachment_ids: ['sub1'] };
const ATTROW = { id: 'att1', material_type: 'attachment', material_name: 'Auger Bit', cost_per_day: 15, compatible_sub_attachment_ids: ['sub1'] };
const SUBROW = { id: 'sub1', material_type: 'sub_attachment', material_name: 'Rock Tip', cost_per_day: 10 };
const PROJ_A = (entry) => ({
  id: 'p1', updated_date: 'v1', project_name: 'EqProj', client_name: 'C', excavation_method: 'hand_dig',
  items: [], poles: [], wall_caps: [], walls: [], signage_cabinets: [],
  selected_equipment: entry ? [entry] : [],
  landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
});
const PROJ_B = () => ({ id: 'b', updated_date: 'vB', project_name: 'RouteB-Proj', items: [], poles: [], walls: [], wall_caps: [], signage_cabinets: [], selected_equipment: [] });
const EMPTY = { inv: [], lab: [], set: [] };
const FULL = () => ({
  inv: [EQROW, ATTROW, SUBROW],
  lab: [],
  set: [{ setting_name: 'wall_labor_rate', setting_value: 25 }],
});
`;
s = s.slice(0, reproStart) + newFixtures + s.slice(stubStart);
// DATA projects: equipment variants
const dataStart = s.indexOf('const projA1');
const serverStart = s.indexOf('const server =');
s = s.slice(0, dataStart) + `const projMissing = PROJ_A({ _id: 'e1', equipment_id: 'eq1', attachment_counts: {}, equipment_cost: 600 });
projMissing.builder_sync_attempt = RECEIPT;
const projQty = PROJ_A({ _id: 'e2', equipment_id: 'eq1', attachments: [{ id: 'att1', qty: 2 }], equipment_cost: 130 });
projQty.id = 'p2';
const projMobile = PROJ_A({ _id: 'e3', equipment_id: 'gone', attachment_counts: {}, equipment_cost: 600 });
projMobile.id = 'p3';
const DATA = {
  projects: { p1: projMissing, p2: projQty, p3: projMobile, b: PROJ_B() },
  estimates: {
    e1: { id: 'e1', line_items: [{ module_key: 'foundation', project_id: 'p1', estimate_id: 'e1', updated_date_snapshot: 'v1' }] },
    e2: { id: 'e2', line_items: [] },
  },
};
` + s.slice(serverStart);
// replace scenario bodies
const s1Start = s.indexOf('// ============ SCENARIO 1');
s = s.slice(0, s1Start) + `const FULLV = FULL();
const settle = (page, i, val) => page.evaluate(([i, v]) => window.__reads[i].res(v), [i, val]);
const reject = (page, i, msg) => page.evaluate(([i, m]) => window.__reads[i].rj(new Error(m)), [i, msg]);
const readsByLabel = (page) => page.evaluate(() => window.__reads.map(r => r.label));
const spyCount = (page, k) => page.evaluate((k) => window.__spies.filter(x => x[0] === k).length, k);
const seen = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__seenProject)));
const cat = (page, c) => page.evaluate((c) => window.__ctl('setCatalog', c), c);
const arm = (page, n) => page.evaluate((n) => window.__ctl('arm', n), n);
const waitLoaded = async (page, id) => page.waitForFunction((id) => window.__seenProject?.id === id, id, { timeout: 10000 });
const alertText = async (page) => (await page.locator('[role=alert]').allTextContents()).join(' ');

// ============ SCENARIO 1: missing-equipment shell, all write paths blocked ============
await R('S1: missing rental parent -> global alert, Saved 600, all save paths blocked', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 's1');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p1&estimateId=e1');
  await waitLoaded(page, 'p1');
  const al = await alertText(page);
  assert.ok(al.includes('Pricing unavailable'), 'global alert');
  assert.ok(/Equipment 1/.test(al), 'equipment issue enumerated');
  const body = await page.locator('body').innerText();
  assert.ok(body.includes('$600.00'), 'saved 600 shown');
  assert.ok(body.includes('Unavailable'), 'unavailable breakdown label');
  const rawBefore = await seen(page);
  const nameInput = page.locator('input').first();
  await nameInput.fill('UserEdited');
  await page.getByRole('button', { name: 'Save As Copy' }).click();
  await page.getByRole('button', { name: 'Swap to BrickStone' }).click();
  await page.getByRole('button', { name: 'Save & Exit' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.keyboard.press('Control+s');
  await page.locator('button[title="Auto-save"]').click();
  await page.waitForTimeout(2300);
  const url = page.url();
  for (const k of ['saveSource', 'recordBuilderSave', 'pricing', 'ensureIdempotent', 'converter', 'onSaved', 'onClose'])
    assert.equal(await spyCount(page, k), 0, 'zero ' + k);
  assert.equal(new URL(url).search, '?id=p1&estimateId=e1');
  const rawAfter = await seen(page);
  assert.deepEqual(rawAfter.builder_sync_attempt, RECEIPT, 'receipt preserved');
  assert.equal(rawAfter.selected_equipment[0].equipment_cost, 600, 'snapshot kept');
  await ctx.close();
  return true;
});

// ============ SCENARIO 2: reload restore -> save CAS v1; qty edit 2->3 == 130->145 ============
await R('S2: reload restores catalog, save CAS v1 writes real body; qty2->3 costs 145', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 's2');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p1&estimateId=e1');
  await waitLoaded(page, 'p1');
  const rawBefore = await seen(page);
  await cat(page, FULLV);
  const reloadBtn = page.getByRole('button', { name: /catalogs/ });
  await reloadBtn.click();
  await page.waitForFunction(() => !document.body.innerText.includes('Pricing unavailable'), null, { timeout: 10000 });
  assert.ok(!(await alertText(page)).includes('Pricing unavailable'), 'alert cleared');
  assert.deepEqual((await seen(page)).builder_sync_attempt, rawBefore.builder_sync_attempt, 'receipt kept');
  await page.waitForTimeout(2300);
  assert.equal(await spyCount(page, 'saveSource'), 0, 'no auto write');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'saveSource').length === 1, null, { timeout: 10000 });
  assert.equal(await spyCount(page, 'recordBuilderSave'), 1);
  assert.equal(await spyCount(page, 'onSaved'), 1);
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS v1');
  const eqBody = arg.data.selected_equipment[0];
  const expected = calcEquipmentPricing([rawBefore.selected_equipment[0]], FULLV.inv)[0];
  assert.equal(eqBody.equipment_cost, expected.pricedEntry.equipment_cost, 'body == real calc');
  // qty edit 2->3 via real panel on p2
  await page.evaluate(() => window.__nav('/?id=p2&estimateId=e1'));
  await waitLoaded(page, 'p2');
  assert.ok((await page.locator('body').innerText()).includes('$130.00'), 'qty2 shows 130');
  const qtyInput = page.locator('input[aria-label*="Attachment qty"]').first();
  await qtyInput.fill('3');
  await qtyInput.blur();
  await page.waitForFunction(() => document.body.innerText.includes('$145.00'), null, { timeout: 10000 });
  await ctx.close();
  return true;
});

// ============ SCENARIO 3: mobile unavailable card ============
await R('S3: mobile 390 unavailable card stays visible with Saved 600', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); guard(page, 's3');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p3&estimateId=e1');
  await waitLoaded(page, 'p3');
  const body = await page.locator('body').innerText();
  assert.ok(body.includes('$600.00'), 'saved 600 on mobile');
  assert.ok(body.includes('Unavailable'), 'unavailable label');
  await page.screenshot({ path: '.audit-work/foundation-equipment13/s3-mobile-unavailable.png' });
  await ctx.close();
  return true;
});

` + s.slice(s.indexOf('// ---------- teardown ----------'));
fs.writeFileSync(p, s);
console.log('fixture rewritten');
