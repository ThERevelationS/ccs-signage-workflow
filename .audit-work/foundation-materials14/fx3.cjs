const fs = require('fs');
const p = 'scripts/foundation-material-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');

// 1) import money from real core
s = s.replace(
  `const { calcProject, captureConcreteDeliverySnapshot } = await import(pathToFileURL(path.resolve('.audit-work/foundation-materials14/calc-b.mjs')));`,
  `const { captureConcreteDeliverySnapshot, money } = await import(pathToFileURL(path.resolve('.audit-work/foundation-materials14/calc-b.mjs')));`
);

// 2) catalogs per project id in DATA; harness seeds __cat by URL id BEFORE render
s = s.replace(
  `const DATA = {
  projects: { p1: projB1, p2: projB2, p3: projB3 },`,
  `const minusBag = () => CASE.inventory.filter(i => i.id !== 'bag').map(deep);
const DATA = {
  catalogs: {
    p1: { inv: minusBag(), lab: [], set: [] },
    p2: { inv: minusBag(), lab: [], set: [] },
    p3: { inv: deep(CASE.inventory), lab: [], set: [{ setting_name: 'wall_labor_rate', setting_value: 25 }] },
  },
  projects: { p1: projB1, p2: projB2, p3: projB3 },`
);
s = s.replace(
  `window.__cat = { inv: [], lab: [], set: [] };`,
  `window.__cat = (window.__DATA.catalogs && window.__DATA.catalogs[new URLSearchParams(location.search).get('id')]) || { inv: [], lab: [], set: [] };`
);

// 3) rewrite scenario block with exact spec
const s1 = s.indexOf('// ============ B1');
const end = s.indexOf('} finally {');
s = s.slice(0, s1) + `const cardOf = (page) => page.locator('[class*="border-l-amber-500"]');
const cardTotal = (page) => cardOf(page).locator('div.font-bold.text-gray-900');
const expectedTotal = money(EXP_ITEM.item_total_cost);
const FULLSET = () => ({ inv: deep(CASE.inventory), lab: [], set: [{ setting_name: 'wall_labor_rate', setting_value: 25 }] });
const READS_EXPECTED = [
  { label: 'Foundation inventory', query: { show_in_foundation: true }, sort: 'material_name' },
  { label: 'Concrete labor/services', query: { service_category: 'concrete_service', is_active: true }, sort: 'service_name' },
  { label: 'Estimator Settings', query: null, sort: 'created_date' },
];

// ============ B1: missing bag, legacy no delivery snapshot -> blocked + saved amounts ============
await R('B1: missing bag legacy -> alert, saved total, unavailable option, zero write paths', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 'b1');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p1&estimateId=e1');
  await waitLoaded(page, 'p1');
  const al = await alertText(page);
  assert.ok(al.includes('Pricing unavailable'), 'global alert');
  assert.ok(/Foundation/.test(al), 'foundation issue enumerated');
  await cardOf(page).first().waitFor();
  assert.equal(await cardOf(page).count(), 1, 'one item card');
  await cardOf(page).getByText('Saved amounts (not current pricing)', { exact: true }).waitFor();
  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'card total == frozen expected');
  const bagOpt = cardOf(page).locator('select option[value="bag"]');
  assert.equal(await bagOpt.count() >= 1 ? await bagOpt.first().isDisabled() : false, true, 'bag option disabled');
  const deliveryPanel = page.getByText('Ready-Mix Concrete Order').locator('..').locator('..');
  const dpText = await deliveryPanel.innerText();
  assert.ok(dpText.includes('Not saved'), 'delivery totals Not saved');
  assert.ok(!dpText.includes('Truck 1'), 'no fabricated truck rows');
  const rawBefore = await seen(page);
  await page.locator('label:has-text("Description") input').first().fill('unsaved material draft');
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
  // mobile 390: card + saved cash visible
  await page.setViewportSize({ width: 390, height: 844 });
  await cardTotal(page).waitFor({ state: 'visible' });
  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'mobile saved cash visible');
  await page.screenshot({ path: OUT + '/b1-mobile.png' });
  await ctx.close();
  return true;
});

// ============ B2: reload -> save CAS v1 -> #99/Undo/#99 ack-cache wins ============
await R('B2: catalog recovery -> CAS v1 body=frozen expected+snapshot; #99 uses ack cache', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 'b2');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p2&estimateId=e1');
  await waitLoaded(page, 'p2');
  await cardOf(page).first().waitFor();
  assert.equal((await seen(page)).items[0].item_total_cost, 0, 'raw cache 0 seed');
  await page.locator('label:has-text("Description") input').first().fill('recovered draft');
  await page.locator('button[title="Auto-save"]').click();
  const rawBefore = await seen(page);
  await cat(page, FULLSET());
  await arm(page, 3);
  const reloadBtn = page.getByRole('button', { name: 'Reload catalogs' });
  await reloadBtn.click();
  await page.waitForFunction(() => window.__reads.length >= 3, null, { timeout: 8000 });
  const busy = await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /Reloading catalogs/.test(x.textContent))?.disabled === true || [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Reload catalogs')?.disabled === true);
  assert.equal(busy, true, 'reload busy/disabled while pending');
  const reads = await page.evaluate(() => window.__reads.map(r => ({ label: r.label, query: r.query, sort: r.sort })));
  assert.deepEqual(reads, READS_EXPECTED, 'exact 3 reads label/query/sort');
  assert.deepEqual(await seen(page), rawBefore, 'raw project untouched while pending');
  await page.evaluate(() => {
    const cat = window.__cat;
    for (const r of window.__reads) r.res(r.entity === window.__entInv ? cat.inv : r.entity === window.__entLab ? cat.lab : cat.set);
    window.__reads = [];
  });
  await page.waitForFunction(() => !document.body.innerText.includes('Pricing unavailable'), null, { timeout: 8000 });
  assert.deepEqual(await seen(page), rawBefore, 'raw project deep-equal after reload');
  const autoOff = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.title === 'Auto-save');
    return b?.classList.contains('bg-gray-300') || b?.getAttribute('aria-pressed') === 'false' || !b?.classList.contains('bg-indigo-600');
  });
  assert.equal(autoOff, true, 'autosave OFF after reload');
  await page.waitForTimeout(2300);
  assert.equal(await spyCount(page, 'saveSource'), 0, 'no auto write');
  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'card total == expected (not raw0)');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS v1');
  assert.deepEqual(arg.data.items, [{ ...deep(EXP_ITEM), description: 'recovered draft' }], 'save body == frozen expected + description');
  assert.deepEqual(arg.data.concrete_delivery_snapshot, captureConcreteDeliverySnapshot(deep(CASE.expected.delivery)), 'delivery snapshot == v1 shape');
  fs.writeFileSync(OUT + '/b2-save-body.json', JSON.stringify(arg.data, null, 1));
  // #99 -> blocked, ack cache keeps expected cash (not raw0)
  const sizeInput = page.locator('label:has-text("Rebar size") input').first();
  await sizeInput.fill('#99');
  await page.waitForFunction(() => window.__seenProject.items[0].rebar_size === '#99', null, { timeout: 8000 });
  await cardOf(page).getByText('Saved amounts (not current pricing)', { exact: true }).waitFor();
  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'ack cache == expected after #99');
  assert.equal((await seen(page)).items[0].item_total_cost, 0, 'raw cash still 0');
  await page.screenshot({ path: OUT + '/b2-ack-cache.png' });
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].rebar_size === '#4', null, { timeout: 8000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Pricing unavailable'), null, { timeout: 8000 });
  await sizeInput.fill('#99');
  await page.waitForFunction(() => window.__seenProject.items[0].rebar_size === '#99', null, { timeout: 8000 });
  await cardOf(page).getByText('Saved amounts (not current pricing)', { exact: true }).waitFor();
  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'ack cache == expected after re-edit');
  assert.equal(await spyCount(page, 'saveSource'), 1, 'still one source write');
  await ctx.close();
  return true;
});

// ============ B3: deferred source write + #99 mid-flight -> ack cache wins, CAS v2 ============
await R('B3: held source write + #99 mid-flight -> saved expected, superseded Builder, CAS v2', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 'b3');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/?id=p3&estimateId=e1');
  await waitLoaded(page, 'p3');
  await cardOf(page).first().waitFor();
  await page.locator('label:has-text("Description") input').first().fill('pending draft');
  await page.evaluate(() => { window.__deferWrite = true; });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'saveSource').length === 1, null, { timeout: 10000 });
  await page.waitForFunction(() => typeof window.__releaseSourceWrite === 'function', null, { timeout: 8000 });
  const sizeInput = page.locator('label:has-text("Rebar size") input').first();
  await sizeInput.fill('#99');
  await page.waitForFunction(() => window.__seenProject.items[0].rebar_size === '#99', null, { timeout: 8000 });
  await page.evaluate(() => { window.__deferWrite = false; window.__releaseSourceWrite(); });
  await page.waitForFunction(() => document.body.innerText.includes('Source saved'), null, { timeout: 10000 });
  await cardOf(page).getByText('Saved amounts (not current pricing)', { exact: true }).waitFor();
  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'ack cache == expected after late write');
  const raw = await seen(page);
  assert.equal(raw.items[0].rebar_size, '#99', 'raw #99 preserved');
  assert.equal(raw.items[0].item_total_cost, 0, 'raw cache 0 preserved');
  const projV = await page.evaluate(() => window.__proj.p3.updated_date);
  assert.equal(projV, 'v2', 'source ack v2 installed');
  assert.equal(await spyCount(page, 'onSaved'), 0, 'onSaved 0 (superseded by newer edit)');
  assert.equal(await spyCount(page, 'recordBuilderSave'), 0, 'Builder 0 (superseded)');
  assert.equal(await spyCount(page, 'saveSource'), 1, 'one source write');
  await page.screenshot({ path: OUT + '/b3-blocked.png' });
  // optional CAS: #4 then Save -> expectedUpdatedAt v2
  await sizeInput.fill('#4');
  await page.waitForFunction(() => window.__seenProject.items[0].rebar_size === '#4', null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg2 = await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').map(x => x[1]));
  assert.equal(arg2[1].expectedUpdatedAt, 'v2', 'second save CAS v2');
  assert.equal(await spyCount(page, 'recordBuilderSave'), 1, 'Builder 1 on second save');
  await ctx.close();
  return true;
});

` + s.slice(end);
// title
s = s.replace('equipment-integrity-browser', 'material-integrity-browser');
// metafile explicit asserts
s = s.replace(
  `if (bad.length) { console.error('SDK/AUTH IN BUNDLE:', bad); process.exit(1); }`,
  `if (bad.length) { console.error('SDK/AUTH IN BUNDLE:', bad); process.exit(1); }
const realPaths = ['FoundationItemCard.jsx', 'ConcreteDeliveryPanel.jsx', 'FoundationTotals.jsx', 'FoundationBOM.jsx', 'foundationCalc.js', 'foundationCatalogIntegrity.js', 'foundationEquipmentBindings.js', 'FoundationToolbar.jsx', 'foundationSaveSession.js', 'foundationSyncRecovery.js'];
const inputs = Object.keys(built.metafile.inputs);
for (const rp of realPaths) if (!inputs.some(i => i.endsWith('/' + rp) || i.endsWith(rp))) { console.error('MISSING real source in bundle:', rp); process.exit(1); }`
);
fs.writeFileSync(p, s);
console.log('fixture reworked');
