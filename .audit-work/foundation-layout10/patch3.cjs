const fs = require('fs');
const p = 'scripts/foundation-layout-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
const oldReset = "    await page.evaluate(() => { window.__ctl('reset'); });\n    const box = await page.locator('.aspect-\\[3\\/2\\]').boundingBox();";
const newReset = "    await page.evaluate(() => { window.__ctl('reset'); });\n    await page.waitForFunction(() => {\n      const it = window.__items[1];\n      const el = document.querySelector('[aria-label=\"Move Foundation 2\"]');\n      if (!it || it.x_inches !== 120 || !el) return false;\n      const cv = el.parentElement.getBoundingClientRect();\n      const r = el.getBoundingClientRect();\n      return cv.width > 10 && Math.abs(r.left - (cv.left + 120 * cv.width / 480)) < 2;\n    }, null, { timeout: 8000 });\n    const box = await page.locator('[class*=\"aspect-\"]').boundingBox();";
const n = s.split(oldReset).length - 1;
s = s.replace(oldReset, newReset);
fs.writeFileSync(p, s);
console.log('replaced', n, 'present', s.includes('cv.width > 10'));
