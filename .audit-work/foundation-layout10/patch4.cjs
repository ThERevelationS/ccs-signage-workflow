const fs = require('fs');
const p = 'scripts/foundation-layout-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
const waitFn = `    await page.waitForFunction(() => {
      const it = window.__items[1];
      const el = document.querySelector('[aria-label="Move Foundation 2"]');
      if (!it || it.x_inches !== 120 || !el) return false;
      const cv = el.parentElement.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return cv.width > 10 && Math.abs(r.left - (cv.left + 120 * cv.width / 480)) < 2;
    }, null, { timeout: 8000 });`;
// insert after EVERY bare reset that is followed by a boundingBox read
const re = /    await page\.evaluate\(\(\) => \{ window\.__ctl\('reset'\); \}\);\n(    const box = await page\.locator\(')/g;
let n = 0;
s = s.replace(re, (m, b) => { n++; return `    await page.evaluate(() => { window.__ctl('reset'); });\n${waitFn}\n${b}`; });
fs.writeFileSync(p, s);
console.log('inserted', n);
