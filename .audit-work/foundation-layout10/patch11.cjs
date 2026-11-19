const fs = require('fs');
const p = 'scripts/foundation-layout-browser-fixture.mjs';
const lines = fs.readFileSync(p, 'utf8').split('\n');
// lines 178-182 (0-based 177-181): the weak secondary-touch gesture
lines.splice(177, 5, `  const sec = { x: 40, y: 40 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g3.x, y: g3.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g3.x, y: g3.y, id: 1 }, { x: sec.x, y: sec.y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: t3.x, y: t3.y, id: 1 }, { x: sec.x, y: sec.y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: t3.x, y: t3.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const mv3 = await page.evaluate(() => window.__moves);
  assert.equal(mv3.length, 1, 'primary drag commits once despite secondary touch');
  assert.deepEqual(mv3[0].p, { x_inches: 216, z_inches: 142 }, 'secondary touch did not alter committed corner');`);
fs.writeFileSync(p, lines.join('\n'));
console.log(lines.slice(176, 190).join('\n').slice(0, 300));
