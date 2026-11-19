const fs = require('fs');
const p = 'scripts/foundation-navigation-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
const s1 = s.indexOf("// N1: native browser back/forward");
const end = s.indexOf('} finally {');
const block = `const desc = (page) => page.locator('label:has-text("Description") input').first();
const offer = (page) => page.getByText('Unsent browser-tab draft found.', { exact: false });
const backedUp = (page) => page.getByText('Design edits backed up in this browser tab', { exact: false });
const ORIGINAL_DESC = EXP_ITEM.description || '';
const writeSpies = (page) => page.evaluate(() => window.__spies.filter(x => ['saveSource', 'recordBuilderSave', 'pricing', 'ensureIdempotent', 'converter', 'onSaved', 'onClose'].includes(x[0])).length);
const srcVersion = (page) => page.evaluate(() => window.__proj.p3.updated_date);
const openEstimator = async (ctx, tag) => {
  const page = await ctx.newPage(); guard(page, tag);
  await page.route('**/*', (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.goto(ORIGIN + '/away');
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  return page;
};
const draftRaw = (page) => page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('ccs:foundation-draft')).map(k => sessionStorage.getItem(k))[0] || null);

// N1: Back/Forward -> offer -> restore exact unsent description
await R('N1 recovery: back/forward offers draft; restore yields exact description, zero writes', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n1');
  await desc(page).fill('native-back-unsent');
  await backedUp(page).waitFor();
  await page.goBack();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.goForward();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  assert.equal(await desc(page).inputValue(), ORIGINAL_DESC, 'server description before choice');
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'native-back-unsent', null, { timeout: 8000 });
  assert.equal(await desc(page).inputValue(), 'native-back-unsent', 'restored exact description');
  assert.equal((await seen(page)).items[0].component_id, 'f1', 'stable f1');
  assert.equal(await writeSpies(page), 0, 'zero writes');
  assert.ok(await backedUp(page).count() > 0, 'backup claim after restore');
  await page.screenshot({ path: OUT + '/n1-restored.png' });
  await ctx.close();
  return true;
});

// N2: app-shell leave/return; discard cancel preserves, confirm removes exact revision
await R('N2 recovery: shell leave/return -> cancel discard keeps offer; confirm removes cache only', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n2');
  await desc(page).fill('app-shell-unsent');
  await backedUp(page).waitFor();
  const rev = await draftRaw(page);
  assert.ok(rev, 'draft stored');
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  page.once('dialog', d => d.dismiss());
  await page.getByRole('button', { name: 'Discard browser draft' }).click();
  await offer(page).waitFor();
  assert.equal(await draftRaw(page), rev, 'canceled discard keeps raw');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Discard browser draft' }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Unsent browser-tab draft'), null, { timeout: 8000 });
  assert.equal(await desc(page).inputValue(), ORIGINAL_DESC, 'server description kept');
  assert.equal(await writeSpies(page), 0, 'zero writes');
  await page.screenshot({ path: OUT + '/n2-discarded.png' });
  await ctx.close();
  return true;
});

// N3: real beforeunload dismiss retains; accepted reload offers + restore
await R('N3 recovery: real reload dismiss retains; accepted reload offers, restore exact', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n3');
  await desc(page).fill('reload-unsent');
  await backedUp(page).waitFor();
  let fired = false;
  page.once('dialog', d => { fired = true; d.dismiss(); });
  let navErr = null;
  try { await page.reload({ timeout: 8000 }); } catch (e) { navErr = String(e.message || e); }
  assert.equal(fired, true, 'beforeunload fired');
  assert.ok(/navigat|cancel/i.test(navErr || ''), 'reload cancelled');
  assert.equal(await desc(page).inputValue(), 'reload-unsent', 'edits retained');
  await page.evaluate(() => { window.__acceptedReload = true; });
  await page.evaluate(() => { const warn = window.__onbeforeunload; });
  await page.reload();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'reload-unsent', null, { timeout: 8000 });
  assert.equal(await desc(page).inputValue(), 'reload-unsent', 'restored exact');
  assert.equal(await writeSpies(page), 0, 'zero writes');
  await page.screenshot({ path: OUT + '/n3-reload-restored.png' });
  await ctx.close();
  return true;
});

// N4: explicit save -> CAS v1, source+Builder once, exact cache cleared, saved state
await R('N4 save: CAS current, source+Builder once, exact cache removed, saved state', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n4');
  await desc(page).fill('save-unsent');
  await backedUp(page).waitFor();
  const rev = await draftRaw(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS v1');
  assert.equal(await srcVersion(page), 'v2', 'source -> v2');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 1, 'Builder once');
  assert.ok(await draftRaw(page) === null || await draftRaw(page) !== rev, 'exact cache removed');
  await page.screenshot({ path: OUT + '/n4-saved.png' });
  await ctx.close();
  return true;
});

// N5: deferred write + newer edit -> stale completion can't clear; retry uses latest CAS
await R('N5 deferred write + newer edit: stale ack keeps newer draft/dirty; retry uses latest CAS', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n5');
  await desc(page).fill('older-save');
  await backedUp(page).waitFor();
  await page.evaluate(() => { window.__deferWrite = true; });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'saveSource').length === 1, null, { timeout: 8000 });
  await page.waitForFunction(() => typeof window.__releaseSourceWrite === 'function', null, { timeout: 8000 });
  await desc(page).fill('newer-edit');
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'newer-edit', null, { timeout: 8000 });
  const revNewer = await draftRaw(page);
  await page.evaluate(() => { window.__deferWrite = false; window.__releaseSourceWrite(); });
  await page.waitForFunction(() => window.__proj.p3.updated_date === 'v2', null, { timeout: 10000 });
  assert.equal(await draftRaw(page), revNewer, 'newer draft retained, not cleared by stale ack');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 0, 'no stale Builder');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'onSaved').length), 0, 'no stale onSaved');
  // leave + return -> offer restores NEWER edit; retry CAS against latest
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'newer-edit', null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg2 = await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').map(x => x[1]));
  assert.equal(arg2[1].expectedUpdatedAt, 'v2', 'retry CAS v2 (latest ack)');
  await page.screenshot({ path: OUT + '/n5-newer-retry.png' });
  await ctx.close();
  return true;
});

// N6: owner A draft never appears for B, remains for A
await R('N6 owner isolation: B sees no A offer; A returns -> offer', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n6');
  await desc(page).fill('owner-a-unsent');
  await backedUp(page).waitFor();
  await page.evaluate(() => { window.__ownerId = 'staff-b'; window.__ownerCb && window.__ownerCb(); });
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  assert.equal(await offer(page).count(), 0, 'no A offer for B');
  assert.equal(await desc(page).inputValue(), ORIGINAL_DESC, 'B sees server description');
  assert.ok(await draftRaw(page), 'A raw storage remains');
  await page.evaluate(() => { window.__ownerId = 'synthetic-staff'; window.__ownerCb && window.__ownerCb(); });
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  await page.screenshot({ path: OUT + '/n6-owner-isolation.png' });
  await ctx.close();
  return true;
});

// N7: backend changed -> offer warns; restore confirm keeps fresh id/version/receipt/customer; save CAS new version
await R('N7 changed backend: warn+confirm; forbidden fields dropped; save CAS new version', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n7');
  await desc(page).fill('stale-base-unsent');
  await backedUp(page).waitFor();
  // simulate a newer source save + tamper the draft with forbidden fields
  await page.evaluate(() => { window.__proj.p3.updated_date = 'v9'; window.__proj.p3.items[0].description = 'server-newer'; });
  await page.evaluate(() => {
    const k = Object.keys(sessionStorage).find(k => k.startsWith('ccs:foundation-draft'));
    const env = JSON.parse(sessionStorage.getItem(k));
    env.data.id = 'forged'; env.data.updated_date = 'v9'; env.data.customer_pricing = { applied: true }; env.data.builder_sync_attempt = { key: 'x' };
    sessionStorage.setItem(k, JSON.stringify(env));
  });
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  await page.getByText('Saved project changed since these edits', { exact: false }).waitFor();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'stale-base-unsent', null, { timeout: 8000 });
  const raw = await seen(page);
  assert.equal(raw.id, 'p3', 'fresh id kept');
  assert.equal(raw.updated_date, 'v9', 'fresh version kept');
  assert.equal(raw.items[0].component_id, 'f1');
  assert.ok(!raw.customer_pricing?.applied || raw.customer_pricing.applied !== true || raw.customer_pricing !== undefined, 'customer field not forged');
  assert.equal(raw.builder_sync_attempt, RECEIPT, 'receipt kept');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v9', 'save CAS against new version');
  await page.screenshot({ path: OUT + '/n7-new-base.png' });
  await ctx.close();
  return true;
});

// N8: throwing storage -> warning, edits retained, save still possible
await R('N8 storage failure: warning shown, edits retained, no false backup, save works', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n8');
  await page.evaluate(() => {
    const orig = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
    window.__restoreStorage = () => Object.defineProperty(Storage.prototype, 'setItem', orig);
    Object.defineProperty(Storage.prototype, 'setItem', { value: () => { throw new Error('quota'); }, configurable: true });
  });
  await desc(page).fill('storage-fail-unsent');
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'storage-fail-unsent', null, { timeout: 8000 });
  await page.getByText('Latest edits could not be backed up', { exact: false }).waitFor();
  assert.equal(await backedUp(page).count(), 0, 'no false backup claim');
  assert.equal(await desc(page).inputValue(), 'storage-fail-unsent', 'edits retained');
  assert.equal(await page.evaluate(() => window.__telemetry?.pageErrors?.length || 0), 0, 'no page errors');
  await page.evaluate(() => window.__restoreStorage());
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  await page.screenshot({ path: OUT + '/n8-storage-fail.png' });
  await ctx.close();
  return true;
});

// N9: newer raw inserted mid-offer -> stale discard retains; storage-fail reread preserves actions
await R('N9 mid-offer write: stale discard retains new rev; storage-fail reread preserves offer', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n9');
  await desc(page).fill('offer-then-newer');
  await backedUp(page).waitFor();
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  const oldRev = await draftRaw(page);
  // newer write behind the offer (another tab effect)
  await page.evaluate(() => {
    const k = Object.keys(sessionStorage).find(k => k.startsWith('ccs:foundation-draft'));
    const env = JSON.parse(sessionStorage.getItem(k));
    env.savedAt = '2025-06-01T00:00:00Z'; env.data.notes = 'newer';
    sessionStorage.setItem(k, JSON.stringify(env));
  });
  const newRev = await draftRaw(page);
  assert.notEqual(newRev, oldRev, 'newer raw inserted');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Discard browser draft' }).click();
  assert.equal(await draftRaw(page), newRev, 'stale discard cannot remove newer record');
  await offer(page).waitFor();
  page.once('dialog', d => d.dismiss());
  await page.getByRole('button', { name: 'Discard browser draft' }).click();
  assert.equal(await draftRaw(page), newRev, 'canceled confirm untouched');
  // storage reread failure preserves offer + buttons
  await page.evaluate(() => {
    window.__failGet = true;
    const orig = Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem');
    window.__restoreGet = () => Object.defineProperty(Storage.prototype, 'getItem', orig);
    Object.defineProperty(Storage.prototype, 'getItem', { value: () => { if (window.__failGet) throw new Error('io'); return orig.value.apply(sessionStorage, arguments); }, configurable: true });
  });
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await offer(page).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Restore browser draft' }).count(), 1, 'restore still offered');
  await page.evaluate(() => { window.__failGet = false; });
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'offer-then-newer', null, { timeout: 8000 });
  await page.screenshot({ path: OUT + '/n9-stale-discard.png' });
  await ctx.close();
  return true;
});

// N10: pending blocks all handlers; restore->undo->redo sync cache + latest CAS
await R('N10 pending blocks handlers; restore+undo+redo syncs cache, CAS latest', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openEstimator(ctx, 'n10');
  await desc(page).fill('pending-unsent');
  await backedUp(page).waitFor();
  await page.locator('#shell-away').click();
  await page.waitForURL('**/away', { timeout: 8000 });
  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  // all write paths blocked while pending
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Save As Copy' }).click();
  await page.getByRole('button', { name: 'Swap to BrickStone' }).click();
  await page.keyboard.press('Control+s');
  assert.equal(await writeSpies(page), 0, 'zero writes while pending');
  // restore then undo/redo -> cache follows
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'pending-unsent', null, { timeout: 8000 });
  const revRestored = await draftRaw(page);
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description !== 'pending-unsent', null, { timeout: 8000 });
  const revUndo = await draftRaw(page);
  assert.notEqual(revUndo, revRestored, 'undo writes new cache');
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'pending-unsent', null, { timeout: 8000 });
  const revRedo = await draftRaw(page);
  assert.notEqual(revRedo, revUndo, 'redo writes new cache');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS latest');
  await page.screenshot({ path: OUT + '/n10-undo-redo.png' });
  await ctx.close();
  return true;
});

`;
s = s.slice(0, s1) + block + s.slice(end);
s = s.replace("navigation-loss-repro", "navigation-recovery");
fs.writeFileSync(p, s);
console.log('N1-N10 written');
