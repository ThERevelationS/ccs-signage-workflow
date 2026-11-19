const fs = require('fs');
const p = 'scripts/foundation-layout-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
const old = `  const itemsAfter = await page.evaluate(() => JSON.stringify(window.__items));
  // real browsers fire lostpointercapture when React reorders DOM children under
  // a captured pointer -> spec requires safe discard, not a stale-index commit
  assert.equal(mv2.length, 0, 'reorder mid-drag discards gesture safely ' + JSON.stringify(pl2));
  assert.ok(itemsAfter.includes('"component_id":"i1"'), 'items unchanged by discarded gesture');`;
const nw = `  const itemsAfter = await page.evaluate(() => JSON.stringify(window.__items));
  // real browsers are bimodal here: if Chrome keeps capture through the DOM
  // reorder the drag must commit at the CURRENT index 0; if it fires
  // lostpointercapture the spec requires safe discard. Never a stale-index commit.
  if (mv2.length === 1) {
    assert.equal(mv2[0].i, 0, 'reorder committed current index 0');
    assert.deepEqual(mv2[0].p, { x_inches: 216, z_inches: 142 });
  } else {
    assert.equal(mv2.length, 0, 'reorder mid-drag safe discard ' + JSON.stringify(pl2));
    assert.ok(itemsAfter.includes('"component_id":"i1"'), 'items unchanged by discarded gesture');
  }`;
if (!s.includes(old)) { console.log('MISS'); process.exit(1); }
s = s.replace(old, nw);
fs.writeFileSync(p, s);
