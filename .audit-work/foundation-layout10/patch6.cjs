const fs = require('fs');
const p = 'scripts/foundation-layout-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "await page.evaluate(() => { window.__ctl('reorder'); });",
  "await page.evaluate(() => { window.__ctl('reorder'); });\n  await page.waitForFunction(() => window.__items[0]?.component_id === 'i1', null, { timeout: 5000 });"
);
s = s.replace(
  "await page.evaluate(() => { window.__ctl('delete'); });",
  "await page.evaluate(() => { window.__ctl('delete'); });\n  await page.waitForFunction(() => window.__items.length === 1, null, { timeout: 5000 });"
);
fs.writeFileSync(p, s);
console.log('waits added');
