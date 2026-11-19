const fs = require('fs');
const p = 'scripts/foundation-input-validation-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
const R = (a, b) => { if (!s.includes(a)) throw new Error('MISS: ' + a.slice(0, 70)); s = s.replace(a, b); };

// ---- 1) outputs/metafile separation, real inputValidation.js presence, no SDK/EmailGate-real ----
R(`const OUT = '.audit-work/foundation-reinforcement16';`,
`const OUT = '.audit-work/foundation-reinforcement16';
const RESULTS_FILE = BASELINE_MODE ? `${OUT}/baseline-browser-results.json` : `${OUT}/browser-results.json`;
const META_FILE = BASELINE_MODE ? `${OUT}/baseline-metafile.json` : `${OUT}/browser-metafile.json`;
if (BASELINE_MODE && fs.existsSync(RESULTS_FILE)) { console.error('Baseline results already frozen — refusing to overwrite.'); process.exit(1); }`);
s = s.replace(/browser-results\.json/g, 'browser-results.json'); // keep writer below explicit
R(`fs.writeFileSync(\`${OUT}/browser-results.json\`, JSON.stringify({ synthetic: true, telemetry, results }, null, 1));`,
`fs.writeFileSync(RESULTS_FILE, JSON.stringify({ synthetic: true, telemetry, results }, null, 1));
fs.writeFileSync(META_FILE, JSON.stringify(built.metafile, null, 1));`);
// metafile real-inputs check: add inputValidation requirement in patched mode
R(`const realPaths = ['FoundationItemCard.jsx', 'ConcreteDeliveryPanel.jsx', 'FoundationTotals.jsx', 'FoundationBOM.jsx', 'foundationCalc.js', 'foundationCatalogIntegrity.js', 'foundationEquipmentBindings.js', 'FoundationToolbar.jsx', 'foundationSaveSession.js', 'foundationSyncRecovery.js'];`,
`const realPaths = ['FoundationItemCard.jsx', 'ConcreteDeliveryPanel.jsx', 'FoundationTotals.jsx', 'FoundationBOM.jsx', 'foundationCalc.js', 'foundationInputValidation.js', 'foundationCatalogIntegrity.js', 'foundationEquipmentBindings.js', 'FoundationToolbar.jsx', 'foundationSaveSession.js', 'foundationSyncRecovery.js'];`);
// header
R(`// Navigation15 O-004 unsent-draft loss reproduction. Stubs only SDK/service boundaries + visual leaves. Real BrowserRouter routes.`,
`// O-015 basic input validation acceptance. Stubs only SDK/service boundaries + visual leaves. Real BrowserRouter routes.`);
// scenario count by mode
R(`const scenarioCount = results.filter(r => /^N\\d+/.test(r.case)).length;`,
`const scenarioCount = results.filter(r => (BASELINE_MODE ? /^B/ : /^V/).test(r.case)).length;`);

// ---- 2) Card probe stub ----
R(`  '@/components/estimator/foundation/FoundationToolbar': \`import Real from 'toolbar-real';export default function FoundationToolbarProbe(p){window.__toolbarProps=p;return Real(p);}\`,`,
`  '@/components/estimator/foundation/FoundationToolbar': \`import Real from 'toolbar-real';export default function FoundationToolbarProbe(p){window.__toolbarProps=p;return Real(p);}\`,
  '@/components/estimator/foundation/FoundationItemCard': \`import Real from 'card-real';export default function CardProbe(p){(window.__cardProps ||= {})[p.item?.component_id || 'unknown'] = p;return Real(p);}\`,`);
R(`  b.onResolve({ filter: /^toolbar-real$/ }, () => ({ path: path.resolve('src/components/estimator/foundation/FoundationToolbar.jsx') }));`,
`  b.onResolve({ filter: /^toolbar-real$/ }, () => ({ path: path.resolve('src/components/estimator/foundation/FoundationToolbar.jsx') }));
  b.onResolve({ filter: /^card-real$/ }, () => ({ path: path.resolve('src/components/estimator/foundation/FoundationItemCard.jsx') }));`);
R(`const realPaths = ['FoundationItemCard.jsx'`, `const realPaths = ['FoundationItemCard.jsx'`); // card-real resolves real file -> already counted

// ---- V1 ----
R(`  await qtyInput(page).fill('0');
  await inputBanner(page).waitFor();
  await savedBanner(page).first().waitFor();
  assert.equal(await qtyInput(page).inputValue(), '0', 'raw qty 0 kept');
  await threeDNotice(page).waitFor();
  assert.ok((await cardTotal(page).innerText()).includes('866'), 'saved total shown');
  for (const name of ['Save', 'Save As Copy', 'Swap to BrickStone'])
    await page.evaluate((n) => { for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === n) b.click(); }, name);
  await page.keyboard.press('Control+s');
  assert.equal(await writeSpies(page), 0, 'zero writes while invalid');
  assert.equal((await seen(page)).items[0].notes ?? (await seen(page)).notes, 'n', 'notes retained');
  await page.screenshot({ path: OUT + '/v1-qty0.png' });`,
`  await desc(page).fill('desc-sentinel');
  await backedUp(page).waitFor();
  await qtyInput(page).fill('0');
  await inputBanner(page).waitFor();
  await savedBanner(page).first().waitFor();
  assert.equal(await qtyInput(page).inputValue(), '0', 'raw qty 0 kept');
  assert.equal((await seen(page)).items[0].description, 'desc-sentinel', 'description sentinel kept');
  assert.equal((await seen(page)).notes, 'n', 'notes retained');
  await threeDNotice(page).waitFor();
  assert.equal(await cardTotal(page).innerText(), '$866.55', 'exact saved total');
  const cp = await page.evaluate(() => window.__cardProps?.f1);
  assert.equal(cp?.pricing?.available, false, 'card pricing unavailable');
  assert.equal(cp?.item?.quantity, 0, 'card sees raw qty 0');
  assert.equal(cp?.item?.concrete_volume_cy, 1, 'saved volume 1');
  assert.equal(cp?.item?.rebar_feet, 64, 'saved rebar 64');
  assert.equal(cp?.item?.item_total_cost, 866.55, 'saved total 866.55');
  assert.equal(await page.locator('[data-stub="CustomerPricingTab"]').count(), 0, 'pricing panel not mounted');
  await page.getByText('Estimate handoff paused', { exact: false }).waitFor();
  await page.evaluate(() => { const t = window.__toolbarProps; for (const fn of [t.onSave, t.onSaveAndExit, t.onSaveAsCopy, t.onSwapToBrickStone]) fn && fn(); });
  await page.keyboard.press('Control+s');
  assert.equal(await writeSpies(page), 0, 'zero writes while invalid');
  await page.screenshot({ path: OUT + '/v1-qty0.png' });`);

// ---- V2 ----
R(`  for (const [field, val] of [['Quantity', '-2'], ['Quantity', '1.5'], ['Length (in)', '-36'], ['Depth (in)', '0']]) {
    const inp = page.locator(\`label:has-text("\${field}") input\`).first();
    await inp.fill(val);
    await inputBanner(page).waitFor();
    assert.equal(await writeSpies(page), 0, 'no writes after ' + field);
    if (field !== 'Depth (in)') await inp.fill(field === 'Quantity' ? '1' : '36'); // correct between mutations
  }
  await page.locator('button[title="Auto-save"]').click();
  await page.waitForTimeout(2400);
  assert.equal(await writeSpies(page), 0, 'autosave blocked');`,
`  const fieldKey = { 'Quantity': 'quantity', 'Length (in)': 'length_inches', 'Depth (in)': 'depth_inches' };
  for (const [field, val] of [['Quantity', '-2'], ['Quantity', '1.5'], ['Length (in)', '-36'], ['Depth (in)', '0']]) {
    const inp = page.locator(\`label:has-text("\${field}") input\`).first();
    await inp.fill(val);
    await inputBanner(page).waitFor();
    assert.equal(await inp.inputValue(), val, field + ' raw kept');
    const cached = JSON.parse(await draftRaw(page));
    assert.equal(cached.data.items[0][fieldKey[field]], Number(val), 'cache raw ' + field);
    assert.equal(await page.evaluate(() => window.__cardProps?.f1?.pricing?.available), false, 'unavailable');
    assert.equal(await cardTotal(page).innerText(), '$866.55', 'saved total');
    assert.equal(await writeSpies(page), 0, 'no writes after ' + field);
    if (field !== 'Depth (in)') await inp.fill(field === 'Quantity' ? '1' : '36'); // correct between mutations
  }
  await page.locator('button[title="Auto-save"]').click();
  await page.waitForTimeout(2400); // known 2s debounce window only
  assert.equal(await writeSpies(page), 0, 'autosave blocked');`);

// ---- V3 ----
R(`  const page = await openEstimator(ctx, 'v3');
  // seed type before load instead
  await page.evaluate(() => { window.__proj.p3.items[0].foundation_type = 'unsupported'; });
  await page.locator('#shell-away').click();
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await inputBanner(page).waitFor();
  await threeDNotice(page).waitFor();
  const typeSel = page.locator('select').first();
  assert.ok((await typeSel.locator('option').allInnerTexts()).some(t => t.includes('Unsupported type')), 'unavailable option visible');
  await typeSel.selectOption('spread_foot');
  await page.waitForFunction(() => !document.body.innerText.includes('Design input required'), null, { timeout: 8000 });
  assert.ok((await cardTotal(page).innerText()).includes('866'), 'current price 866.55 returns');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  assert.equal((await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1])).expectedUpdatedAt, 'v1', 'CAS v1');
  assert.equal(await srcVersion(page), 'v2', 'v2 after save');
  await page.screenshot({ path: OUT + '/v3-type-repair.png' });`,
`  const page = await ctx.newPage(); guard(page, 'v3');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/away');
  await page.evaluate(() => { window.__proj.p3.items[0].foundation_type = 'unsupported'; });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await inputBanner(page).waitFor();
  await threeDNotice(page).waitFor();
  const typeSel = page.locator('select').first();
  const selVal = await typeSel.inputValue();
  assert.equal(selVal, 'unsupported', 'unsupported selected');
  assert.ok((await typeSel.locator('option').allInnerTexts()).some(t => t.includes('Unsupported type')), 'unavailable option visible');
  assert.equal(await writeSpies(page), 0, 'no writes before choice');
  await typeSel.selectOption('spread_foot');
  await page.waitForFunction(() => !document.body.innerText.includes('Design input required'), null, { timeout: 8000 });
  assert.equal(await cardTotal(page).innerText(), '$866.55', 'current price exact');
  assert.equal(await page.evaluate(() => window.__cardProps?.f1?.pricing?.available), true, 'pricing available');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS v1');
  assert.equal(arg.data.items[0].foundation_type, 'spread_foot', 'source type repaired');
  assert.equal(arg.data.items[0].quantity, 1);
  assert.equal(arg.data.items[0].concrete_volume_cy, 1);
  assert.equal(arg.data.items[0].item_total_cost, 866.55);
  assert.equal(arg.data.notes, 'n');
  assert.equal(await srcVersion(page), 'v2', 'v2 after save');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 1, 'Builder once');
  assert.equal(await draftRaw(page), null, 'cache cleared');
  await page.screenshot({ path: OUT + '/v3-type-repair.png' });`);

// ---- V4 ----
const v4 = s.indexOf("// V4 invalid qty0");
const v5 = s.indexOf("// V5 valid zero");
s = s.slice(0, v4) + `// V4 invalid qty0 -> leave/return -> restore -> still blocked; undo->valid, redo->invalid
await R('V4 draft restore preserves invalid qty0; undo/redo roundtrip', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v4');
  await qtyInput(page).fill('0');
  await inputBanner(page).waitFor();
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('${'${DRAFT_KEY}'}' || '')).data.items[0].quantity === 0, null, { timeout: 8000 });
  assert.equal(await qtyInput(page).inputValue(), '0', 'restored qty 0');
  await inputBanner(page).waitFor();
  assert.equal(await page.evaluate(() => window.__cardProps?.f1?.pricing?.available), false, 'pricing unavailable');
  await page.getByText('Not yet saved', { exact: false }).waitFor();
  assert.equal(await offer(page).count(), 0, 'offer gone');
  assert.equal((await seen(page)).notes, 'n');
  assert.equal(await writeSpies(page), 0, 'no writes');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('${'${DRAFT_KEY}'}' || '')).data.items[0].quantity === 1, null, { timeout: 8000 });
  assert.equal(await qtyInput(page).inputValue(), '1', 'undo qty 1');
  await page.waitForFunction(() => !document.body.innerText.includes('Design input required'), null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => window.__cardProps?.f1?.pricing?.available), true, 'pricing valid again');
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('${'${DRAFT_KEY}'}' || '')).data.items[0].quantity === 0, null, { timeout: 8000 });
  assert.equal(await qtyInput(page).inputValue(), '0', 'redo qty 0');
  await inputBanner(page).waitFor();
  await page.screenshot({ path: OUT + '/v4-restore-invalid.png' });
  await ctx.close();
  return true;
});

` + s.slice(v5);

// ---- V5 ----
R(`  assert.equal(arg.expectedUpdatedAt, 'v1');
  assert.equal(arg.data.items[0].custom_concrete_cost_per_cy, 0, 'override 0 persisted');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 1, 'Builder once');`,
`  assert.equal(arg.expectedUpdatedAt, 'v1');
  assert.equal(arg.data.items[0].custom_concrete_cost_per_cy, 0, 'override 0 persisted');
  assert.equal(arg.data.items[0].concrete_cost, 0, 'concrete cost 0');
  assert.equal(arg.data.items[0].concrete_volume_cy, 1, 'volume still 1');
  assert.equal(arg.data.items[0].quantity, 1);
  assert.equal(await srcVersion(page), 'v2', 'source v2');
  assert.equal(await draftRaw(page), null, 'cache cleared');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 1, 'Builder once');`);

// ---- V6 ----
const v6 = s.indexOf("// V6 held save");
const v7 = s.indexOf("// V7 new foundation");
s = s.slice(0, v6) + `// V6 held save + qty0 midflight -> release -> older valid saved, invalid retained, retry v2
await R('V6 held save + qty0 midflight: older saved, invalid retained, retry CAS v2', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v6');
  await desc(page).fill('held-save');
  await page.evaluate(() => { window.__deferWrite = true; });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'saveSource').length === 1, null, { timeout: 8000 });
  await page.waitForFunction(() => typeof window.__releaseSourceWrite === 'function', null, { timeout: 8000 });
  await qtyInput(page).fill('0');
  await inputBanner(page).waitFor();
  const revNewer = await draftRaw(page);
  assert.ok(revNewer && JSON.parse(revNewer).data.items[0].quantity === 0, 'invalid raw cache kept');
  await page.evaluate(() => { window.__deferWrite = false; window.__releaseSourceWrite(); });
  await page.getByText('Source saved; estimate/Builder sync incomplete', { exact: false }).waitFor();
  await page.getByText('Not yet saved', { exact: false }).waitFor();
  assert.equal(await draftRaw(page), revNewer, 'newer draft retained');
  const firstBody = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(firstBody.data.items[0].quantity, 1, 'older valid payload');
  assert.equal(firstBody.data.items[0].concrete_volume_cy, 1);
  assert.equal(firstBody.data.items[0].item_total_cost, 866.55);
  assert.equal(firstBody.data.items[0].description, 'held-save');
  assert.equal(firstBody.data.notes, 'n');
  assert.equal(await qtyInput(page).inputValue(), '0', 'invalid live qty kept');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 0, 'no stale Builder');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'onSaved').length), 0, 'no stale onSaved');
  await qtyInput(page).fill('1');
  await page.waitForFunction(() => !document.body.innerText.includes('Design input required'), null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const args2 = await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').map(x => x[1]));
  assert.equal(args2[1].expectedUpdatedAt, 'v2', 'retry CAS v2');
  assert.equal(args2.length, 2, 'two source calls total');
  assert.equal(await srcVersion(page), 'v3', 'source v3');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 1, 'Builder once');
  assert.equal(await draftRaw(page), null, 'matching cache cleared');
  await page.getByText('All changes saved', { exact: false }).waitFor();
  await page.screenshot({ path: OUT + '/v6-held.png' });
  await ctx.close();
  return true;
});

` + s.slice(v7);

// ---- V7 ----
const v8 = s.indexOf("// V8 pillar");
s = s.slice(0, s.indexOf("// V7 new foundation")) + `// V7 new foundation + qty0 -> 'Not saved' row, blocked, f1 preserved
await R('V7 new item qty0: Not saved row, blocked, original f1 amount preserved', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v7');
  await page.getByRole('button', { name: 'Add Foundation Item' }).click();
  await page.waitForFunction(() => window.__seenProject.items.length === 2, null, { timeout: 8000 });
  const newCard = page.locator('[class*="border-l-amber-500"]').nth(1);
  await newCard.locator('label:has-text("Quantity") input').first().fill('0');
  await inputBanner(page).waitFor();
  const f1 = await page.evaluate(() => window.__cardProps?.f1);
  assert.equal(f1?.item?.item_total_cost, 866.55, 'f1 saved amount preserved');
  const newId = await page.evaluate(() => Object.keys(window.__cardProps || {}).find(k => k !== 'f1'));
  assert.ok(newId && newId !== 'f1', 'unique new component id');
  const nc = await page.evaluate((id) => window.__cardProps[id], newId);
  assert.equal(nc?.item?.quantity, 0, 'new qty 0');
  assert.equal(nc?.pricing?.available, false, 'new pricing unavailable');
  for (const f of ['concrete_volume_cy', 'concrete_bags', 'concrete_cost', 'rebar_feet', 'rebar_cost', 'forming_cost', 'excavation_cost', 'labor_cost', 'item_total_cost', 'total_hours', 'forming_qty', 'concrete_delivery_yards', 'misc_cost', 'equipment_cost', 'subtotal', 'tax', 'total_cost'])
    assert.equal(nc?.item?.[f], undefined, 'snapshot field ' + f + ' absent');
  await newCard.locator('div.font-bold.text-gray-900', { hasText: 'Not saved' }).first().waitFor();
  await page.evaluate(() => { const t = window.__toolbarProps; for (const fn of [t.onSave, t.onSaveAsCopy]) fn && fn(); });
  assert.equal(await writeSpies(page), 0, 'explicit save/copy attempts zero writes');
  await page.screenshot({ path: OUT + '/v7-new-item.png' });
  await ctx.close();
  return true;
});

` + s.slice(v8);

// ---- V8 ----
const tail = s.indexOf("await ctx.close();\n  return true;\n});\n}", s.indexOf("// V8 pillar"));
s = s.slice(0, s.indexOf("// V8 pillar")) + `// V8 pillar diameter0 -> error; ignored inactive dims; valid save volume PI/9
await R('V8 pillar diameter0 -> error; ignored inactive dims; valid save volume PI/9', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); guard(page, 'v8');
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/away');
  await page.evaluate(() => {
    const it = window.__proj.p3.items[0];
    it.foundation_type = 'pillar'; it.diameter = 0; it.depth_inches = 36; it.quantity = 1;
    it.length_inches = -10; it.width_inches = null; // inactive dims must not error
  });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await inputBanner(page).waitFor();
  const banner = await inputBanner(page).locator('..').innerText();
  assert.ok(/diameter/i.test(banner), 'diameter issue listed');
  assert.ok(!/length/i.test(banner) && !/width/i.test(banner), 'inactive dims ignored');
  await page.locator('label:has-text("Diameter") input, label:has-text("diameter") input').first().fill('24');
  await page.waitForFunction(() => !document.body.innerText.includes('Design input required'), null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS v1');
  const it = arg.data.items[0];
  assert.equal(it.foundation_type, 'pillar');
  assert.equal(it.diameter, 24);
  assert.equal(it.depth_inches, 36);
  assert.equal(it.quantity, 1);
  assert.equal(it.length_inches, -10, 'inactive len untouched');
  assert.ok(Math.abs(it.concrete_volume_cy - Math.PI / 9) < 1e-12, 'pillar volume PI/9 got ' + it.concrete_volume_cy);
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 1, 'Builder once');
  assert.equal(await draftRaw(page), null, 'cache cleared');
  await page.screenshot({ path: OUT + '/v8-pillar.png' });
  await ctx.close();
  return true;
});
` + s.slice(tail);

fs.writeFileSync(p, s);
console.log('V rework applied');
