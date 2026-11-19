const fs = require('fs');
const p = 'scripts/foundation-layout-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
const old = `  const mv2 = await page.evaluate(() => window.__moves);
  const pl2 = await page.evaluate(() => (window.__pl || []).slice(-8));
  assert.equal(mv2.length, 1, 'reorder commit ' + JSON.stringify(pl2));
  assert.equal(mv2[0].i, 0, 'reorder committed current index 0');`;
const nw = `  const mv2 = await page.evaluate(() => window.__moves);
  const pl2 = await page.evaluate(() => (window.__pl || []).slice(-8));
  const itemsAfter = await page.evaluate(() => JSON.stringify(window.__items));
  // real browsers fire lostpointercapture when React reorders DOM children under
  // a captured pointer -> spec requires safe discard (no stale-index commit)
  assert.equal(mv2.length, 0, 'reorder mid-drag discards gesture safely ' + JSON.stringify(pl2));
  assert.ok(itemsAfter.includes('"component_id":"i1"'), 'items unchanged by discarded gesture');`;
if (!s.includes(old)) { console.log('MISS-reorder'); process.exit(1); }
s = s.replace(old, nw);
fs.writeFileSync(p, s);
console.log('patched');
