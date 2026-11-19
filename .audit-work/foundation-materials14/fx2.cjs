const fs = require('fs');
const p = 'scripts/foundation-material-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  `const settle = (page, i, val) => page.evaluate(([i, v]) => window.__reads[i].res(v), [i, val]);
const settleAll = async (page, cat) => {
  const n = await page.evaluate(() => window.__reads.length);
  for (let i = 0; i < n; i++) await settle(page, i, cat[i] === undefined ? cat : cat);
};`,
  `const settleAll = async (page) => {
  await page.evaluate(() => {
    for (const r of window.__reads) r.res(r.entity === window.__entInv ? window.__cat.inv : r.entity === window.__entLab ? window.__cat.lab : window.__cat.set);
    window.__reads = [];
  });
};`
);
s = s.replace(
  `  const desc = page.locator('input').nth(1);
  await desc.fill('unsaved material draft');`,
  `  const desc = page.locator('label:has-text("Description") input').first();
  await desc.fill('unsaved material draft');`
);
s = s.replace('await settleAll(page, undefined);', 'await settleAll(page);');
fs.writeFileSync(p, s);
console.log('patched');
