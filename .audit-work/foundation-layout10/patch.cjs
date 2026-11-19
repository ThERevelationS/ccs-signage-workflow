const fs = require('fs');
const p = 'scripts/foundation-layout-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.split(".aspect-\\[3\\/2\\]").join('[class*="aspect-"]');
const oldReset = `    await page.evaluate(() => { window.__ctl('reset'); });
    await page.waitForFunction(() => window.__items[1]?.x_inches === 120 && window.__items[1]?.z_inches === 80, null, { timeout: 5000 });
    const box = await page.locator('[class*="aspect-"]').boundingBox();`;
const newReset = `    await page.evaluate(() => { window.__ctl('reset'); });
    await page.waitForFunction(() => {
      const it = window.__items[1];
      const el = document.querySelector('[aria-label="Move Foundation 2"]');
      if (!it || it.x_inches !== 120 || !el) return false;
      const cv = el.parentElement.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return cv.width > 10 && Math.abs(r.left - (cv.left + 120 * cv.width / 480)) < 2;
    }, null, { timeout: 8000 });
    const box = await page.locator('[class*="aspect-"]').boundingBox();`;
if (s.includes(oldReset)) { s = s.replace(oldReset, newReset); }
fs.writeFileSync(p, s);
console.log('patched', s.includes('cv.width > 10'));
