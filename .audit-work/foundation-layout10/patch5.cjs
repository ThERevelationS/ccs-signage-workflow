const fs = require('fs');
const p = 'scripts/foundation-layout-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
const needle = "    await page.evaluate(() => { window.__ctl('reset'); });";
const waitFn = `    await page.waitForFunction(() => {
      const it = window.__items[1];
      const el = document.querySelector('[aria-label="Move Foundation 2"]');
      if (!it || it.x_inches !== 120 || !el) return false;
      const cv = el.parentElement.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return cv.width > 10 && Math.abs(r.left - (cv.left + 120 * cv.width / 480)) < 2;
    }, null, { timeout: 8000 });`;
// insert wait after every reset that is NOT already followed by a waitForFunction
let n = 0;
const parts = s.split(needle);
s = parts.map((part, i) => {
  if (i === 0) return part;
  if (part.trimStart().startsWith('await page.waitForFunction')) return needle + part;
  n++;
  return needle + '\n' + waitFn + part;
}).join('');
fs.writeFileSync(p, s);
console.log('inserted', n, 'total waits', (s.match(/cv\.width > 10/g) || []).length);
