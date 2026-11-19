import { chromium } from 'playwright-core';
const exe = 'C:/Users/BrettHeinlein/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 400)));
await page.goto('https://feed-the-undead.base44.app', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(6000);
const text = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log('PAGE TEXT:', JSON.stringify(text));
// try to find and click a new-game control
const btns = await page.$$eval('button,[role=button],a', els => els.map(e => (e.innerText || e.textContent || '').trim()).filter(Boolean).slice(0, 30));
console.log('BUTTONS:', JSON.stringify(btns));
const start = await page.$$('button,[role=button]');
for (const b of start) {
  const t = (await b.innerText().catch(() => '')).trim();
  if (/new game|start|play|shift|begin/i.test(t)) { console.log('CLICKING:', t); await b.click().catch(() => {}); break; }
}
await page.waitForTimeout(6000);
const text2 = await page.evaluate(() => document.body.innerText.slice(0, 400));
console.log('AFTER:', JSON.stringify(text2));
console.log('ERRORS:', JSON.stringify(errors.slice(0, 15), null, 1));
await browser.close();
