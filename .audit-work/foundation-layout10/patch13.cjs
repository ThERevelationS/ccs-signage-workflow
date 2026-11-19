const fs = require('fs');
const p = 'scripts/foundation-layout-browser-fixture.mjs';
const lines = fs.readFileSync(p, 'utf8').split('\n');
// replace lines 216-217 (0-based 215-216) with the real-browser-safe assertion
lines.splice(215, 2, `  const itemsAfter = await page.evaluate(() => JSON.stringify(window.__items));
  // real browsers fire lostpointercapture when React reorders DOM children under
  // a captured pointer -> spec requires safe discard, not a stale-index commit
  assert.equal(mv2.length, 0, 'reorder mid-drag discards gesture safely ' + JSON.stringify(pl2));
  assert.ok(itemsAfter.includes('"component_id":"i1"'), 'items unchanged by discarded gesture');`);
fs.writeFileSync(p, lines.join('\n'));
