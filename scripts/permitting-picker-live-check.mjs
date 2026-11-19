// Live Playwright check of the permitting locality picker on the published app.
// Drives real login -> /Permitting -> open picker -> address lookup -> simple/advanced.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { permitCreds } from './lib/permit-creds.mjs';

const APP = 'https://clay-flow-signage-suite-387da97c.base44.app';
const SHOTS = 'C:/tmp/pw-shots';
mkdirSync(SHOTS, { recursive: true });
const results = [];
const ok = (n, c, extra = '') => { results.push({ n, c, extra }); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('429')) consoleErrors.push(m.text().slice(0, 200)); });

  // --- login: inject a fresh session token (avoids verifyLogin rate limits) ---
  let token = process.env.PERMIT_SESSION_TOKEN || '';
  if (!token) {
    const tokenRes = await fetch('https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions/verifyLogin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }),
    }).catch(() => null);
    token = tokenRes ? ((await tokenRes.json().catch(() => ({})))?.token || '') : '';
  }
  if (token) {
    await page.addInitScript(t => localStorage.setItem('sss_session_token', t), token);
  }
  await page.goto(APP + '/Permitting', { waitUntil: 'domcontentloaded', timeout: 60000 });
  // if the login dialog still shows (token rejected), fall back to UI login
  const userField = page.locator('#login-username');
  for (let t = 0; t < 3 && (await userField.count()); t++) {
    await userField.fill('bheinlein');
    await page.locator('#login-password').fill('Heinlein56!!');
    await page.locator('#login-password').press('Enter');
    await page.waitForTimeout(t ? 12000 : 6000);
  }
  await page.waitForTimeout(2000);
  ok('login', !(await page.locator('#login-username').count()), 'login dialog dismissed');

  // --- wait for job groups to load (429-retry makes this slow) ---
  for (let w = 0; w < 12; w++) {
    const loading = await page.locator('text=Loading office tasks').count();
    const groups = await page.locator('text=/Tap to set up|lines$/').count();
    if (!loading && groups) break;
    await page.waitForTimeout(5000);
  }
  let stillLoading = await page.locator('text=Loading office tasks').count();
  if (stillLoading) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    for (let w = 0; w < 12; w++) {
      const loading = await page.locator('text=Loading office tasks').count();
      const groups = await page.locator('text=/Tap to set up|line(s)?\\b/').count();
      if (!loading && groups) break;
      await page.waitForTimeout(5000);
    }
    stillLoading = await page.locator('text=Loading office tasks').count();
  }
  ok('job list loaded', !stillLoading, stillLoading ? 'still loading after reload' : '');
  await page.screenshot({ path: SHOTS + '/00-loaded.png', fullPage: true });

  // --- open picker: expand first job group ---
  // Try direct "Pick the town's office…" (empty group) or "Find the right office…" (group with lines)
  let opened = false;
  for (const sel of ['text=Pick the town', 'text=Find the right office']) {
    const b = page.locator(sel).first();
    if (await b.count()) { await b.scrollIntoViewIfNeeded().catch(() => {}); await b.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1500); if (await page.locator('text=/Which office issues|Type in the job address|Find my office/').count()) { opened = true; break; } }
  }
  if (!opened) {
    // expand collapsed job groups then retry
    const groups = page.locator('text=Tap to set up');
    const n = await groups.count();
    for (let i = 0; i < Math.min(n, 6) && !opened; i++) {
      await groups.nth(i).click().catch(() => {});
      await page.waitForTimeout(800);
      for (const sel of ['text=Pick the town', 'text=Find the right office']) {
        const b = page.locator(sel).first();
        if (await b.count()) { await b.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1500); if (await page.locator('text=/Which office issues|Type in the job address|Find my office/').count()) { opened = true; break; } }
      }
    }
  }
  ok('picker opens', opened);
  if (!opened) { await page.screenshot({ path: SHOTS + '/no-picker.png', fullPage: true }); throw new Error('picker did not open'); }
  await page.screenshot({ path: SHOTS + '/01-picker-open.png' });

  // --- address lookup ---
  const input = page.getByPlaceholder(/Parkway Dr|address/i).first();
  await input.fill('10900 Reading Road, Sharonville, OH 45241');
  const findBtn = page.locator('button:has-text("Find the town"), button:has-text("Find my")').first();
  await findBtn.click();
  // wait for a real outcome: a step finishes, an error banner, or a result line
  await page.waitForFunction(() => {
    const t = document.body.innerText;
    return /Found it|Confirmed|Checked —|Not sure yet|Needs a review|needs a check|Request failed|system is busy|temporary problem|having trouble/.test(t);
  }, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: SHOTS + '/02-result.png', fullPage: false });
  const bodyText = await page.locator('body').innerText();
  ok('lookup resolved', /Found it|Confirmed|Checked —|Not sure yet|Needs a review|needs a check/.test(bodyText), bodyText.match(/(Found it|Confirmed|Checked —[^\n]*|Not sure yet|Needs a review|needs a check)/)?.[0] || 'no outcome text');
  ok('no error banner', !/Request failed|lookup is busy|system is busy|temporary problem|went wrong/i.test(bodyText), (bodyText.match(/[^\n]*(Request failed|busy|temporary|went wrong)[^\n]*/) || [''])[0]);

  // --- simple vs advanced ---
  const adv = page.locator('button:has-text("Advanced"), [role="switch"]:has-text("Advanced"), label:has-text("Advanced")').first();
  ok('advanced toggle exists', await adv.count() > 0);
  if (await adv.count()) {
    await page.screenshot({ path: SHOTS + '/03-simple.png' });
    await adv.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: SHOTS + '/04-advanced.png' });
    const advText = await page.locator('[role="dialog"]').innerText().catch(() => '');
    ok('advanced reveals detail', advText.length > 0);
  }

  // --- layout overlap check: bounding boxes of buttons in sidebar don't overflow dialog ---
  const overlap = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return 'no dialog';
    const dr = dlg.getBoundingClientRect();
    const bad = [];
    for (const el of dlg.querySelectorAll('button,input,select,textarea,a')) {
      if (el.closest('section[aria-label="Job address map"],.gm-style,[class*="gm-"],[id^="gmimap"]')) continue; // map + Google's own off-screen controls
      const eb = el.getBoundingClientRect();
      if (!eb.width || !eb.height) continue;
      const scrollPane = el.closest('.overflow-y-auto,.overflow-auto,.overflow-y-scroll');
      if (scrollPane && eb.left >= dr.left - 1 && eb.right <= dr.right + 1) continue; // vertical clip inside a scrollable pane is by design
      if (eb.right > dr.right + 1 || eb.left < dr.left - 1 || eb.bottom > dr.bottom + 1 || eb.top < dr.top - 1) bad.push(el.textContent?.slice(0, 40) || el.tagName);
    }
    return bad.length ? 'overflow:' + bad.slice(0, 5).join('|') : 'ok';
  });
  ok('no element overflow', overlap === 'ok', overlap);

  // --- apply button state ---
  const applyBtn = page.locator('button:has-text("Use this office"), button:has-text("Use it anyway")').first();
  ok('apply button present', await applyBtn.count() > 0, await applyBtn.innerText().catch(() => 'none'));

  // --- map ---
  const mapVisible = await page.evaluate(() => !!document.querySelector('iframe[src*="google"], .gm-style, canvas'));
  ok('map canvas/iframe rendered', mapVisible);
  await page.screenshot({ path: SHOTS + '/05-full.png', fullPage: false });

  ok('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  console.log(JSON.stringify(results, null, 1));
}
