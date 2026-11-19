const fs = require('fs');
const p = 'scripts/foundation-layout-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
const old = `  // secondary touch while primary continues
  await page.evaluate(() => { window.__ctl('reset'); });
  await page.waitForFunction(() => window.__items[1]?.x_inches === 120, null, { timeout: 5000 });
  const g3 = w2c(144, 98), t3 = w2c(240, 160);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g3.x, y: g3.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g3.x, y: g3.y, id: 1 }, { x: 30, y: 30, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const mv3 = await page.evaluate(() => window.__moves);
  assert.equal(mv3.length, 0, 'secondary touch start does not hijack gesture');`;
const nw = `  // secondary touch while primary continues: primary still commits its target
  await page.evaluate(() => { window.__ctl('reset'); });
  await page.waitForFunction(() => window.__items[1]?.x_inches === 120, null, { timeout: 5000 });
  const g3 = w2c(144, 98), t3 = w2c(240, 160), sec = { x: 40, y: 40 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g3.x, y: g3.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g3.x, y: g3.y, id: 1 }, { x: sec.x, y: sec.y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: t3.x, y: t3.y, id: 1 }, { x: sec.x, y: sec.y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: t3.x, y: t3.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const mv3 = await page.evaluate(() => window.__moves);
  assert.equal(mv3.length, 1, 'primary drag still commits once despite secondary touch');
  assert.deepEqual(mv3[0].p, { x_inches: 216, z_inches: 142 }, 'secondary touch did not alter committed corner');`;
if (!s.includes(old)) console.log('MISS-sec');
s = s.replace(old, nw);
// mobile overflow assert in touch scenario
s = s.replace(
  "  await ctx.close();\n  return { touch: true };",
  `  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'no horizontal overflow at 390px viewport');
  const controls = await page.locator('[aria-label="Zoom layout in"]').isVisible();
  assert.equal(controls, true, 'controls visible at mobile width');
  await ctx.close();
  return { touch: true };`
);
fs.writeFileSync(p, s);
console.log('done');
