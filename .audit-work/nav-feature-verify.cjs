const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const logs = [];
  page.on('console', m => { if (m.type() === 'error') logs.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await page.goto('https://preview-sandbox--68dfcc5e57bbbc35387da97c.base44.app', { waitUntil: 'networkidle', timeout: 60000 }).catch(()=>{});
  // Login via localStorage creds (same pattern as prior audit)
  await page.evaluate(() => {
    localStorage.setItem('sss_session_token', localStorage.getItem('sss_session_token') || '');
  });
  // check if login form present
  await page.waitForTimeout(2500);
  const hasLogin = await page.locator('input[type="email"], input[name="email"]').count();
  console.log('login-form:', hasLogin);
  if (hasLogin) {
    const creds = require('fs').existsSync('.audit-work/creds.json') ? JSON.parse(require('fs').readFileSync('.audit-work/creds.json')) : null;
    if (creds) {
      await page.fill('input[type="email"], input[name="email"]', creds.email);
      await page.fill('input[type="password"], input[name="password"]', creds.password);
      await page.click('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")');
      await page.waitForTimeout(4000);
    }
  }
  await page.screenshot({ path: '.audit-work/nav-f1.png' });
  // nav entries: folder pills
  const pills = await page.locator('[data-nav-folder="true"]').allTextContents();
  console.log('folder-pills:', JSON.stringify(pills));
  const items = await page.locator('[data-nav-item]').count();
  console.log('bar-items:', items);
  // right-click empty space on links bar
  const bar = page.locator('[data-top-navigation-links]');
  const bb = await bar.boundingBox();
  if (bb) {
    await page.mouse.click(bb.x + bb.width - 4, bb.y + bb.height / 2, { button: 'right' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: '.audit-work/nav-f2-ctx.png' });
    const menuItems = await page.locator('[role="menu"] [role="menuitem"]').allTextContents();
    console.log('bar-ctx-menu:', JSON.stringify(menuItems));
    // click New folder
    const nf = page.locator('[role="menuitem"]:has-text("New folder")');
    if (await nf.count()) {
      await nf.click(); await page.waitForTimeout(600);
      await page.screenshot({ path: '.audit-work/nav-f3-editor.png' });
      console.log('editor-open:', await page.locator('text=New folder').count());
      await page.keyboard.press('Escape');
    } else { await page.keyboard.press('Escape'); }
  }
  // right-click a folder pill
  const pill = page.locator('[data-nav-folder="true"]').first();
  if (await pill.count()) {
    await pill.click({ button: 'right' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '.audit-work/nav-f4-foldermenu.png' });
    console.log('folder-ctx:', JSON.stringify(await page.locator('[role="menu"] [role="menuitem"]').allTextContents()));
    await page.keyboard.press('Escape');
  }
  // right-click a page button
  const pb = page.locator('[data-nav-item]').first();
  if (await pb.count()) {
    await pb.click({ button: 'right' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '.audit-work/nav-f5-pagemenu.png' });
    console.log('page-ctx:', JSON.stringify(await page.locator('[role="menu"] [role="menuitem"]').allTextContents()));
    await page.keyboard.press('Escape');
  }
  console.log('console-errors:', logs.length ? logs.slice(0,6) : 'none');
  await browser.close();
})();
