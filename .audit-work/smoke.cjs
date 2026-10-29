const { chromium } = require('C:/Users/BrettHeinlein/AppData/Local/npm-cache/_npx/381cec31605a419a/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Users/BrettHeinlein/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe' });
  const page = await browser.newPage();
  const errors = [], failedReq = [];
  page.on('console', m => { if (['error','warning'].includes(m.type())) errors.push(m.type()+': '+m.text().slice(0,300)); });
  page.on('pageerror', e => errors.push('PAGEERROR: '+String(e).slice(0,300)));
  page.on('requestfailed', r => failedReq.push(r.url().slice(0,120)+' :: '+(r.failure()||{}).errorText));
  const urls = process.argv.slice(2);
  for (const url of urls) {
    errors.length = 0; failedReq.length = 0;
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(3000);
      const title = await page.title();
      const bodyText = (await page.evaluate(() => document.body ? document.body.innerText.slice(0,400) : 'NO BODY')).replace(/\n+/g,' | ');
      console.log('\n===== ' + url);
      console.log('STATUS:', resp && resp.status(), '| TITLE:', title);
      console.log('BODY:', bodyText.slice(0,350));
      console.log('CONSOLE_ERRORS(' + errors.length + '):'); errors.slice(0,12).forEach(e => console.log('  ', e));
      console.log('FAILED_REQ(' + failedReq.length + '):'); failedReq.slice(0,10).forEach(e => console.log('  ', e));
    } catch (e) { console.log('\n===== ' + url + '\nNAV_ERROR: ' + e.message.slice(0,300)); }
  }
  await browser.close();
})();
