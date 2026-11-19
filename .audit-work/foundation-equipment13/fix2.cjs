const fs = require('fs');
const p = 'scripts/test-foundation-equipment.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  `  // remove qty0
  const c2 = (await mount(deep(entry))).c;
  await applyQty(c2, 'Attachment qty', '0');
  const removed = (await Promise.resolve()) && null;
  const t2 = text(c2);
  assert.ok(!t2.includes('Auger'), 'qty0 removes row');
  assert.ok(t2.includes('$100.00'), 'total back to 100');`,
  `  // remove qty0: controlled component -> assert the emitted update, not re-render
  const { c: c2, calls: calls2 } = await mount(deep(entry));
  await applyQty(c2, 'Attachment qty', '0');
  assert.equal(calls2.updates.length, 1, 'remove emits one update');
  const rem = calls2.updates[0][0];
  assert.equal((rem.attachments || []).length, 0, 'qty0 removes the normalized row');
  const { c: c3 } = await mount(rem);
  assert.ok(!text(c3).includes('Auger'), 'row gone after update applied');
  assert.ok(text(c3).includes('$100.00'), 'total back to 100');`
);
fs.writeFileSync(p, s);
console.log('ok');
