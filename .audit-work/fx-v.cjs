const fs = require('fs');
const p = 'scripts/foundation-input-validation-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
const R = (a, b) => { if (!s.includes(a)) throw new Error('MISS: ' + a.slice(0, 60)); s = s.replace(a, b); };

// baseline machinery: serve BEFORE page+calc from fresh-validation-baselines via namespace
R(`const CASE = JSON.parse(fs.readFileSync('.audit-work/foundation-materials14/complete-before.json', 'utf8')).cases[1];`,
`const CASE = JSON.parse(fs.readFileSync('.audit-work/foundation-materials14/complete-before.json', 'utf8')).cases[1];
const BASELINES = JSON.parse(fs.readFileSync('.audit-work/foundation-reinforcement16/fresh-validation-baselines.json', 'utf8'));
const baseContent = (path) => BASELINES.files.find(f => f.path === path)?.content;
const BASELINE_MODE = process.env.BASELINE === '1';`);

// plugin: baseline page resolves to namespace 'base'
R(`  b.onResolve({ filter: /^harness$/ }, () => ({ path: 'harness', namespace: 'h' }));`,
`  b.onResolve({ filter: /^harness$/ }, () => ({ path: 'harness', namespace: 'h' }));
  if (BASELINE_MODE) {
    b.onResolve({ filter: /FoundationEstimator$/ }, () => ({ path: 'baseline-page', namespace: 'base' }));
    b.onLoad({ filter: /.*/, namespace: 'base' }, () => ({ contents: baseContent('src/pages/FoundationEstimator.jsx'), loader: 'jsx', resolveDir: path.resolve('src/pages') }));
  }`);

// baseline calc namespace too (page imports @/.../foundationCalc)
R(`  b.onResolve({ filter: /^toolbar-real$/ }, () => ({ path: path.resolve('src/components/estimator/foundation/FoundationToolbar.jsx') }));`,
`    b.onResolve({ filter: /^toolbar-real$/ }, () => ({ path: path.resolve('src/components/estimator/foundation/FoundationToolbar.jsx') }));
    if (BASELINE_MODE) {
      b.onResolve({ filter: /foundationCalc$/ }, () => ({ path: 'baseline-calc', namespace: 'base2' }));
      b.onLoad({ filter: /.*/, namespace: 'base2' }, () => ({ contents: baseContent('src/components/estimator/foundation/foundationCalc.js'), loader: 'jsx', resolveDir: path.resolve('src/components/estimator/foundation') }));
    }`);

// p3 seed: valid spread_foot 36x36x36 qty1 + notes 'n'
R(`  id: 'p3', updated_date: 'v1', project_name: 'NavProj', client_name: 'C', notes: 'n', excavation_method: 'hand_dig',`,
`  id: 'p3', updated_date: 'v1', project_name: 'ValProj', client_name: 'C', notes: 'n', excavation_method: 'hand_dig',`);

// helpers
const helpers = `
const qtyInput = (page) => page.locator('label:has-text("Quantity") input').first();
const inputBanner = (page) => page.getByText('Design input required:', { exact: false });
const threeDNotice = (page) => page.getByText('3D preview hidden', { exact: false });
const savedBanner = (page) => page.getByText('Saved amounts (not current pricing)', { exact: true });
const cardOf = (page) => page.locator('[class*="border-l-amber-500"]');
const cardTotal = (page) => cardOf(page).locator('div.font-bold.text-gray-900');
const savedLine = async (page, re) => (await page.locator('tbody tr, div').filter({ hasText: re }).allInnerTexts()).join('|');
`;
R(`const desc = (page) => page.locator('label:has-text("Description") input').first();`, helpers + `const desc = (page) => page.locator('label:has-text("Description") input').first();`);

// replace scenario block
const s1 = s.indexOf("// N1:");
const end = s.indexOf('} finally {');
const block = `
if (BASELINE_MODE) {
  await R('B0 baseline: negative qty -2 -> displayed 1, raw -2, payload clamps, Builder/onSaved once', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage(); guard(page, 'b0');
    await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
    await page.goto(ORIGIN + '/away');
    await page.locator('#open-foundation').click();
    await waitLoaded(page, 'p3');
    await qtyInput(page).fill('-2');
    await page.waitForFunction(() => window.__seenProject.items[0].quantity === -2, null, { timeout: 8000 });
    assert.equal(await qtyInput(page).inputValue(), '1', 'baseline displays clamped 1');
    assert.equal((await seen(page)).items[0].quantity, -2, 'raw qty -2 kept');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
    const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
    const it = arg.data.items[0];
    assert.equal(it.quantity, 1, 'payload clamps qty to 1');
    assert.equal(it.concrete_volume_cy, -2);
    assert.equal(it.rebar_feet, -128);
    assert.equal(it.item_total_cost, -1733.1);
    assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 1, 'Builder once');
    await page.screenshot({ path: OUT + '/b0-baseline.png' });
    await ctx.close();
    return true;
  });
} else {
// V1 qty0 -> invalid, blocked, all write paths 0
await R('V1 qty0: invalid -> banner, saved amounts, blocked, zero writes', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v1');
  await qtyInput(page).fill('0');
  await inputBanner(page).waitFor();
  await savedBanner(page).waitFor();
  assert.equal(await qtyInput(page).inputValue(), '0', 'raw qty 0 kept');
  await threeDNotice(page).waitFor();
  assert.ok((await cardTotal(page).innerText()).includes('866'), 'saved total shown');
  for (const name of ['Save', 'Save As Copy', 'Swap to BrickStone'])
    await page.evaluate((n) => { for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === n) b.click(); }, name);
  await page.keyboard.press('Control+s');
  assert.equal(await writeSpies(page), 0, 'zero writes while invalid');
  assert.equal((await seen(page)).items[0].notes ?? (await seen(page)).notes, 'n', 'notes retained');
  await page.screenshot({ path: OUT + '/v1-qty0.png' });
  await ctx.close();
  return true;
});

// V2 qty-2 then 1.5, len-36/depth0 raw kept, autosave no writes
await R('V2 invalid variants: raw kept, errors, autosave zero writes', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v2');
  for (const [field, val] of [['Quantity', '-2'], ['Quantity', '1.5'], ['Length (in)', '-36'], ['Depth (in)', '0']]) {
    const inp = page.locator(\`label:has-text("\${field}") input\`).first();
    await inp.fill(val);
    await inputBanner(page).waitFor();
    assert.equal(await writeSpies(page), 0, 'no writes after ' + field);
    if (field !== 'Depth (in)') await inp.fill(field === 'Quantity' ? '1' : '36'); // correct between mutations
  }
  await page.locator('button[title="Auto-save"]').click();
  await page.waitForTimeout(2400);
  assert.equal(await writeSpies(page), 0, 'autosave blocked');
  await page.screenshot({ path: OUT + '/v2-variants.png' });
  await ctx.close();
  return true;
});

// V3 persisted unsupported type -> choose spread_foot -> valid + save
await R('V3 unsupported type: unavailable option, choose spread_foot -> valid, save CAS v1->v2', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { window.__proj && (window.__proj.p3.items[0].foundation_type = 'unsupported'); });
  const page = await openEstimator(ctx, 'v3');
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
  await page.screenshot({ path: OUT + '/v3-type-repair.png' });
  await ctx.close();
  return true;
});

// V4 invalid qty0 -> leave/return -> restore -> still blocked; undo->valid, redo->invalid
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
  await page.waitForFunction(() => window.__seenProject.items[0].quantity === 0, null, { timeout: 8000 });
  await inputBanner(page).waitFor();
  assert.equal(await writeSpies(page), 0, 'no writes');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].quantity === 1, null, { timeout: 8000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Design input required'), null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].quantity === 0, null, { timeout: 8000 });
  await inputBanner(page).waitFor();
  await page.screenshot({ path: OUT + '/v4-restore-invalid.png' });
  await ctx.close();
  return true;
});

// V5 valid zero concrete override -> save OK
await R('V5 explicit zero concrete override: valid, save CAS v1, cost fields persisted', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v5');
  const override = page.locator('label:has-text("Concrete $/bag override") input, label:has-text("Concrete $/CY override") input, label:has-text("Concrete cost override") input').first();
  await override.fill('0');
  await page.waitForFunction(() => !document.body.innerText.includes('Design input required'), null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1');
  assert.equal(arg.data.items[0].custom_concrete_cost_per_cy, 0, 'override 0 persisted');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 1, 'Builder once');
  await page.screenshot({ path: OUT + '/v5-zero-override.png' });
  await ctx.close();
  return true;
});

// V6 held save + qty0 midflight -> release -> older valid saved, invalid retained, retry v2
await R('V6 held save + qty0 midflight: older saved, invalid retained, retry CAS v2', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v6');
  await desc(page).fill('held-save');
  await page.evaluate(() => { window.__deferWrite = true; });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'saveSource').length === 1, null, { timeout: 8000 });
  await page.waitForFunction(() => typeof window.__releaseSourceWrite === 'function', null, { timeout: 8000 });
  await qtyInput(page).fill('0');
  await page.waitForFunction(() => window.__seenProject.items[0].quantity === 0, null, { timeout: 8000 });
  await page.evaluate(() => { window.__deferWrite = false; window.__releaseSourceWrite(); });
  await page.waitForFunction(() => window.__proj.p3.updated_date === 'v2', null, { timeout: 10000 });
  const firstBody = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(firstBody.data.items[0].quantity, 1, 'older valid payload saved');
  assert.equal(await qtyInput(page).inputValue(), '0', 'invalid raw kept');
  await inputBanner(page).waitFor();
  await qtyInput(page).fill('1');
  await page.waitForFunction(() => !document.body.innerText.includes('Design input required'), null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  assert.equal((await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').map(x => x[1]))).at(-1).expectedUpdatedAt, 'v2', 'retry CAS v2');
  await page.screenshot({ path: OUT + '/v6-held.png' });
  await ctx.close();
  return true;
});

// V7 new foundation + qty0 -> 'Not saved' row, blocked, f1 preserved
await R('V7 new item qty0: Not saved row, blocked, original f1 amount preserved', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v7');
  await page.getByRole('button', { name: 'Add Foundation Item' }).click();
  await page.waitForFunction(() => window.__seenProject.items.length === 2, null, { timeout: 8000 });
  const newCard = page.locator('[class*="border-l-amber-500"]').nth(1);
  await newCard.locator('label:has-text("Quantity") input').first().fill('0');
  await inputBanner(page).waitFor();
  await newCard.getByText('Not saved', { exact: false }).waitFor();
  assert.ok((await cardOf(page).nth(0).innerText()).includes('866'), 'f1 amount preserved');
  assert.equal(await writeSpies(page), 0, 'no writes');
  await page.screenshot({ path: OUT + '/v7-new-item.png' });
  await ctx.close();
  return true;
});

// V8 pillar diameter0 -> error; ignored inactive dims; valid save volume PI/9
await R('V8 pillar diameter0 -> error; ignored inactive dims; valid save volume PI/9', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'v8');
  await page.locator('select').first().selectOption('pillar');
  await page.locator('label:has-text("Diameter") input, label:has-text("diameter") input').first().fill('0');
  await inputBanner(page).waitFor();
  await page.locator('label:has-text("Diameter") input, label:has-text("diameter") input').first().fill('24');
  await page.locator('label:has-text("Depth") input, label:has-text("depth") input').first().fill('36');
  await page.waitForFunction(() => !document.body.innerText.includes('Design input required'), null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const vol = (await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1])).data.items[0].concrete_volume_cy;
  assert.ok(Math.abs(vol - Math.PI / 9) < 1e-12, 'pillar volume PI/9 got ' + vol);
  await page.screenshot({ path: OUT + '/v8-pillar.png' });
  await ctx.close();
  return true;
});
}
`;
s = s.slice(0, s1) + block + s.slice(end);
s = s.replace("navigation-recovery", "input-validation");
fs.writeFileSync(p, s);
console.log('V fixture written');
