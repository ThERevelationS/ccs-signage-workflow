const fs = require('fs');
const p = 'scripts/foundation-navigation-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
const R = (a, b) => { if (!s.includes(a)) throw new Error('MISS: ' + a.slice(0, 60)); s = s.replace(a, b); };

// 1) toolbar wrapper stub: captures real props, renders real component
R(`  '@/components/auth/EmailGate':`,
`  '@/components/estimator/foundation/FoundationToolbar': \`import Real from 'toolbar-real';export default function FoundationToolbarProbe(p){window.__toolbarProps=p;return Real(p);}\`,
  '@/components/auth/EmailGate':`);
// plugin: toolbar-real -> real file namespace
R(`  b.onResolve({ filter: /.*/ }, a => (STUBS[a.path] ? { path: 's://' + a.path, namespace: 's' } : undefined));`,
`  b.onResolve({ filter: /^toolbar-real$/ }, () => ({ path: path.resolve('src/components/estimator/foundation/FoundationToolbar.jsx') }));
  b.onResolve({ filter: /.*/ }, a => (STUBS[a.path] ? { path: 's://' + a.path, namespace: 's' } : undefined));`);

// 2) scoped draft key + sentinel-safe draftRaw
R(`const draftRaw = (page) => page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('ccs:foundation-draft')).map(k => sessionStorage.getItem(k))[0] || null);`,
`const DRAFT_KEY = 'ccs:foundation-draft:v1:' + encodeURIComponent(JSON.stringify(['synthetic-staff', 'p3', 'e1']));
const draftKey = (page, owner = 'synthetic-staff') => page.evaluate((k) => sessionStorage.getItem(k), 'ccs:foundation-draft:v1:' + encodeURIComponent(JSON.stringify([owner, 'p3', 'e1'])));
const draftRaw = (page) => draftKey(page);`);

// 3) N1: 'Not yet saved' + cache desc exact
R(`  assert.equal(await desc(page).inputValue(), 'native-back-unsent', 'restored exact description');
  assert.equal((await seen(page)).items[0].component_id, 'f1', 'stable f1');
  assert.equal(await writeSpies(page), 0, 'zero writes');
  assert.ok(await backedUp(page).count() > 0, 'backup claim after restore');`,
`  assert.equal(await desc(page).inputValue(), 'native-back-unsent', 'restored exact description');
  assert.equal((await seen(page)).items[0].component_id, 'f1', 'stable f1');
  assert.equal(await writeSpies(page), 0, 'zero writes');
  assert.ok(await backedUp(page).count() > 0, 'backup claim after restore');
  await page.getByText('Not yet saved', { exact: false }).waitFor();
  const storedEnv = JSON.parse(await draftRaw(page));
  assert.equal(storedEnv.data.items[0].description, 'native-back-unsent', 'cache holds restored desc');`);

// 4) N2: sentinel + strict null on exact key
R(`  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Discard browser draft' }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Unsent browser-tab draft'), null, { timeout: 8000 });
  assert.equal(await desc(page).inputValue(), ORIGINAL_DESC, 'server description kept');
  assert.equal(await writeSpies(page), 0, 'zero writes');`,
`  await page.evaluate((k) => sessionStorage.setItem(k, 'keep-me'), 'ccs:foundation-draft:v1:other-sentinel');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Discard browser draft' }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Unsent browser-tab'), null, { timeout: 8000 });
  assert.equal(await draftRaw(page), null, 'exact draft key removed');
  assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), 'ccs:foundation-draft:v1:other-sentinel'), 'keep-me', 'sentinel retained');
  assert.equal(await desc(page).inputValue(), ORIGINAL_DESC, 'server description kept');
  assert.equal(await writeSpies(page), 0, 'zero writes');`);

// 5) N3: real dialog acceptance; remove dead lines
R(`  assert.equal(await desc(page).inputValue(), 'reload-unsent', 'edits retained');
  await page.evaluate(() => { window.__acceptedReload = true; });
  await page.evaluate(() => { const warn = window.__onbeforeunload; });
  await page.reload();
  await waitLoaded(page, 'p3');`,
`  assert.equal(await desc(page).inputValue(), 'reload-unsent', 'edits retained');
  const dlg = page.waitForEvent('dialog', { timeout: 8000 });
  const rel = page.reload();
  const d = await dlg;
  assert.equal(d.type(), 'beforeunload', 'second dialog also real beforeunload');
  await d.accept();
  await rel;
  await waitLoaded(page, 'p3');`);

// 6) N4: strict asserts
R(`  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS v1');
  assert.equal(await srcVersion(page), 'v2', 'source -> v2');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 1, 'Builder once');
  assert.ok(await draftRaw(page) === null || await draftRaw(page) !== rev, 'exact cache removed');`,
`  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS v1');
  assert.equal(await srcVersion(page), 'v2', 'source -> v2');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'recordBuilderSave').length), 1, 'Builder once');
  assert.equal(await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').length), 1, 'source once');
  assert.equal(await draftRaw(page), null, 'exact cache removed');
  await page.getByText('All changes saved', { exact: true }).waitFor();
  assert.equal(await backedUp(page).count(), 0, 'backup status gone');
  assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true, 'Save disabled when clean');`);

// 7) N5: recovery text + notes literal + live asserts
R(`  await page.evaluate(() => { window.__deferWrite = false; window.__releaseSourceWrite(); });
  await page.waitForFunction(() => window.__proj.p3.updated_date === 'v2', null, { timeout: 10000 });`,
`  await page.evaluate(() => { window.__deferWrite = false; window.__releaseSourceWrite(); });
  await page.getByText('Source saved; estimate/Builder sync incomplete', { exact: false }).waitFor();
  await page.waitForFunction(() => window.__proj.p3.updated_date === 'v2', null, { timeout: 10000 });
  assert.equal(await desc(page).inputValue(), 'newer-edit', 'live desc still newer');
  await page.getByText('Not yet saved', { exact: false }).waitFor();
  assert.equal(JSON.parse(await draftRaw(page)).data.items[0].description, 'newer-edit', 'raw cache is newer');
  const firstBody = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(firstBody.data.items[0].description, 'older-save', 'source body was older');
  assert.equal(firstBody.data.notes, 'n', 'notes literal in saved body');`);

// 8) N6: restore exact for A on return
R(`  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  await page.screenshot({ path: OUT + '/n6-owner-isolation.png' });`,
`  await page.locator('#open-foundation').click();
  await waitLoaded(page, 'p3');
  await offer(page).waitFor();
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'owner-a-unsent', null, { timeout: 8000 });
  assert.equal(await writeSpies(page), 0, 'zero writes on A restore');
  await page.screenshot({ path: OUT + '/n6-owner-isolation.png' });`);

// 9) N7: fresh metadata seed + cancel-first + deepEqual asserts
R(`  // simulate a newer source save + tamper the draft with forbidden fields
  await page.evaluate(() => { window.__proj.p3.updated_date = 'v9'; window.__proj.p3.items[0].description = 'server-newer'; });
  await page.evaluate(() => {
    const k = Object.keys(sessionStorage).find(k => k.startsWith('ccs:foundation-draft'));
    const env = JSON.parse(sessionStorage.getItem(k));
    env.data.id = 'forged'; env.data.updated_date = 'v9'; env.data.customer_pricing = { applied: true }; env.data.builder_sync_attempt = { key: 'x' };
    sessionStorage.setItem(k, JSON.stringify(env));
  });`,
`  // simulate a newer source save + tamper the draft with DISTINCT forbidden values
  await page.evaluate(() => { window.__proj.p3.updated_date = 'v9'; window.__proj.p3.items[0].description = 'server-newer'; window.__proj.p3.customer_pricing = { applied: false, tier_number: 7, marker: 'server-current' }; window.__proj.p3.customer_id = 'server-customer-v9'; window.__proj.p3.client_name = 'Server V9'; });
  await page.evaluate((k) => {
    const env = JSON.parse(sessionStorage.getItem(k));
    env.data.id = 'forged'; env.data.updated_date = 'forged-version'; env.data.customer_pricing = { applied: true, tier_number: 99 }; env.data.builder_sync_attempt = { key: 'forged' };
    sessionStorage.setItem(k, JSON.stringify(env));
  }, DRAFT_KEY);`);
R(`  await offer(page).waitFor();
  await page.getByText('Saved project changed since these edits', { exact: false }).waitFor();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Restore browser draft' }).click();`,
`  await offer(page).waitFor();
  await page.getByText('Saved project changed since these edits', { exact: false }).waitFor();
  page.once('dialog', d => d.dismiss());
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  assert.equal(await desc(page).inputValue(), 'server-newer', 'cancel keeps server value');
  assert.equal(JSON.parse(await draftRaw(page)).data.id, 'forged', 'cancel leaves raw cache');
  await offer(page).waitFor();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Restore browser draft' }).click();`);
R(`  const raw = await seen(page);
  assert.equal(raw.id, 'p3', 'fresh id kept');
  assert.equal(raw.updated_date, 'v9', 'fresh version kept');
  assert.equal(raw.items[0].component_id, 'f1');
  assert.ok(!raw.customer_pricing?.applied || raw.customer_pricing.applied !== true || raw.customer_pricing !== undefined, 'customer field not forged');
  assert.deepEqual(raw.builder_sync_attempt, RECEIPT, 'receipt kept');`,
`  const raw = await seen(page);
  assert.equal(raw.id, 'p3', 'fresh id kept');
  assert.equal(raw.updated_date, 'v9', 'fresh version kept');
  assert.equal(raw.items[0].component_id, 'f1');
  assert.deepEqual(raw.customer_pricing, { applied: false, tier_number: 7, marker: 'server-current' }, 'fresh pricing metadata kept');
  assert.equal(raw.customer_id, 'server-customer-v9', 'fresh customer kept');
  assert.equal(raw.client_name, 'Server V9', 'fresh client kept');
  assert.deepEqual(raw.builder_sync_attempt, RECEIPT, 'receipt kept');`);

// 10) N8: remove tautological telemetry check (aggregate covers)
R(`  assert.equal(await page.evaluate(() => window.__telemetry?.pageErrors?.length || 0), 0, 'no page errors');
`, ``);

// 11) N9: full post-restore + save proof
R(`  await page.evaluate(() => { window.__failGet = false; });
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'offer-then-newer', null, { timeout: 8000 });
  await page.screenshot({ path: OUT + '/n9-stale-discard.png' });`,
`  await page.evaluate(() => { window.__failGet = false; });
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'offer-then-newer', null, { timeout: 8000 });
  // post-restore editor state: notes from newer raw, no pending lock, Save enabled
  assert.equal(JSON.parse(await draftRaw(page)).data.notes, 'newer', 'raw notes newer');
  assert.equal(await offer(page).count(), 0, 'offer dismissed');
  assert.equal(await backedUp(page).count(), 1, 'backed-up status');
  assert.equal(await desc(page).isEnabled(), true, 'editor enabled');
  assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isEnabled(), true, 'Save enabled');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  assert.equal((await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').map(x => x[1]))).at(-1).expectedUpdatedAt, 'v1', 'CAS v1');
  assert.equal(await draftRaw(page), null, 'matching cache cleared');
  await page.screenshot({ path: OUT + '/n9-stale-discard.png' });`);

// 12) N10: programmatic handlers via captured props + actual cached asserts + CAS v2 cycle
R(`  // restore then undo/redo -> cache follows
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
  await page.screenshot({ path: OUT + '/n10-undo-redo.png' });`,
`  // programmatic handler invocations through real captured props: all blocked while pending
  await page.evaluate(() => {
    const t = window.__toolbarProps;
    for (const fn of [t.onSave, t.onSaveAndExit, t.onSaveAsCopy, t.onSwapToBrickStone, t.onTemplates, t.onSaveAsTemplate, t.onShareLink, t.onToggleAutoSave, t.onUndo, t.onRedo]) { try { fn && fn(); } catch (e) {} }
  });
  assert.equal(await writeSpies(page), 0, 'programmatic handlers zero writes');
  assert.equal(await page.evaluate(() => document.querySelector('[role="dialog"]') !== null), false, 'no template dialog');
  // restore then undo/redo -> cache follows with real content
  await page.getByRole('button', { name: 'Restore browser draft' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'pending-unsent', null, { timeout: 8000 });
  const revRestored = await draftRaw(page);
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description !== 'pending-unsent', null, { timeout: 8000 });
  const revUndo = JSON.parse(await draftRaw(page));
  assert.equal(revUndo.data.items[0].description, ORIGINAL_DESC, 'undo cache holds original desc');
  assert.equal(revUndo.baseUpdatedAt, 'v1', 'undo cache base v1');
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'pending-unsent', null, { timeout: 8000 });
  const revRedo = JSON.parse(await draftRaw(page));
  assert.equal(revRedo.data.items[0].description, 'pending-unsent', 'redo cache holds draft desc');
  assert.notEqual(JSON.stringify(revRedo), revRestored, 'redo revision differs');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 1, null, { timeout: 10000 });
  const arg = await page.evaluate(() => window.__spies.find(x => x[0] === 'saveSource')[1]);
  assert.equal(arg.expectedUpdatedAt, 'v1', 'CAS latest');
  // second cycle proves undo keeps latest acknowledgment (v2)
  await desc(page).fill('post-save-edit');
  await backedUp(page).waitFor();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description !== 'post-save-edit', null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.waitForFunction(() => window.__seenProject.items[0].description === 'post-save-edit', null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__spies.filter(x => x[0] === 'onSaved').length === 2, null, { timeout: 10000 });
  const arg2 = await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').map(x => x[1]));
  assert.equal(arg2[1].expectedUpdatedAt, 'v2', 'second save CAS v2 after undo/redo');
  await page.screenshot({ path: OUT + '/n10-undo-redo.png' });`);

// 13) scenario count computed + launch inside try/finally
R(`const browser = await chromium.launch({ channel: 'chrome', headless: true });`,
`let browser;
try {
browser = await chromium.launch({ channel: 'chrome', headless: true });`);
// close the try block before } finally {
const fi = s.lastIndexOf('} finally {');
s = s.slice(0, fi) + s.slice(fi).replace(`} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}`, `} finally {
  if (browser) await browser.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}`);
R(`console.log(\`navigation-recovery scenarios=3 failed=\${fails.length}\`);`,
`const scenarioCount = results.filter(r => /^N\\d+/.test(r.case)).length;
console.log(\`navigation-recovery scenarios=\${scenarioCount} failed=\${fails.length}\`);`);

fs.writeFileSync(p, s);
console.log('N-case fixes applied');
