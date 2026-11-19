const fs = require('fs');
const p = 'scripts/foundation-material-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');

// remove capture helper import — keep money
s = s.replace(
  `const { captureConcreteDeliverySnapshot, money } = await import(pathToFileURL(path.resolve('.audit-work/foundation-materials14/calc-b.mjs')));`,
  `const { money } = await import(pathToFileURL(path.resolve('.audit-work/foundation-materials14/calc-b.mjs')));`
);

// EXPECTED_DELIVERY explicit recipe from frozen CASE
s = s.replace(
  `const FULLSET = () => ({ inv: deep(CASE.inventory), lab: [], set: [{ setting_name: 'wall_labor_rate', setting_value: 25 }] });`,
  `const FULLSET = () => ({ inv: deep(CASE.inventory), lab: [], set: [{ setting_name: 'wall_labor_rate', setting_value: 25 }] });
const _d = CASE.expected.delivery;
const EXPECTED_DELIVERY = {
  version: 1, concrete_total: _d.concreteTotal, rounded_yards: _d.roundedYards,
  rate_per_yard: _d.ratePerYard, additional_stops_cost: _d.additionalStopsCost,
  trucks: _d.trucksList.map(t => ({ yards: t.yards, rounded_yards: t.roundedYards, cost: t.cost, small_order_fee: t.smallOrderFee, fuel_fee: t.fuelFee })),
};
const fmtQty = (n, unit) => n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ' + unit;
const assertSavedMaterials = async (page) => {
  for (const [kind, cost, qtyStr] of [
    ['concrete', EXP_ITEM.concrete_cost, fmtQty(EXP_ITEM.concrete_bags, 'bags')],
    ['rebar', EXP_ITEM.rebar_cost, fmtQty(EXP_ITEM.rebar_feet, 'LF')],
    ['forming', EXP_ITEM.forming_cost, fmtQty(EXP_ITEM.forming_qty, 'units')],
  ]) {
    const row = page.locator('tbody tr', { hasText: 'Foundation f1 (saved) — ' + kind });
    assert.equal(await row.count(), 1, \`one saved \${kind} row\`);
    const cells = row.first().locator('td');
    assert.equal(await cells.nth(1).innerText(), qtyStr, \`saved \${kind} qty\`);
    assert.equal(await cells.nth(2).innerText(), money(cost), \`saved \${kind} cost\`);
  }
  // card footer scoped Rebar/Forming amounts
  for (const [lbl, v] of [['Rebar', EXP_ITEM.rebar_cost], ['Forming', EXP_ITEM.forming_cost]]) {
    const cell = cardOf(page).locator('div').filter({ hasText: new RegExp('^' + lbl + '$') }).first();
    const amtEl = cell.locator('..').locator('div.font-semibold').first();
    assert.equal(await amtEl.innerText(), money(v), \`card \${lbl} == frozen\`);
  }
};`
);
// replace capture-helper deepEqual with EXPECTED_DELIVERY
s = s.replace(
  `assert.deepEqual(arg.data.concrete_delivery_snapshot, captureConcreteDeliverySnapshot(deep(CASE.expected.delivery)), 'delivery snapshot == v1 shape');`,
  `assert.deepEqual(JSON.parse(JSON.stringify(arg.data.concrete_delivery_snapshot)), EXPECTED_DELIVERY, 'delivery snapshot == v1 shape');`
);
// fix projB2/projB3 seed: use EXPECTED_DELIVERY not camel trucks (move AFTER EXPECTED_DELIVERY defined)
s = s.replace(
  `projB2.concrete_delivery_snapshot = { version: 1, concrete_total: CASE.expected.delivery.concreteTotal, rounded_yards: CASE.expected.delivery.roundedYards, rate_per_yard: CASE.expected.delivery.ratePerYard, additional_stops_cost: CASE.expected.delivery.additionalStopsCost, trucks: CASE.expected.delivery.trucksList };`,
  `projB2.concrete_delivery_snapshot = { version: 1, concrete_total: _dd.concreteTotal, rounded_yards: _dd.roundedYards, rate_per_yard: _dd.ratePerYard, additional_stops_cost: _dd.additionalStopsCost, trucks: _dd.trucksList.map(t => ({ yards: t.yards, rounded_yards: t.roundedYards, cost: t.cost, small_order_fee: t.smallOrderFee, fuel_fee: t.fuelFee })) };`
);
s = s.replace(
  `const projB2 = PROJ_A([rawZero]);`,
  `const _dd = CASE.expected.delivery;
const projB2 = PROJ_A([rawZero]);`
);
// B3 first write snapshot deepEqual + description survival + no 'All changes saved'
s = s.replace(
  `  const arg = await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').map(x => x[1]));
  assert.equal(arg.length, 1, 'one source write');
  await page.screenshot({ path: OUT + '/b3-blocked.png' });`,
  `  const arg = await page.evaluate(() => window.__spies.filter(x => x[0] === 'saveSource').map(x => x[1]));
  assert.equal(arg.length, 1, 'one source write');
  assert.deepEqual(JSON.parse(JSON.stringify(arg[0].data.concrete_delivery_snapshot)), EXPECTED_DELIVERY, 'B3 write snapshot == v1 shape');
  assert.equal((await seen(page)).items[0].description, 'pending draft', 'description survives late write');
  assert.ok(!(await page.locator('body').innerText()).includes('All changes saved'), 'no saved claim while blocked');
  await page.screenshot({ path: OUT + '/b3-blocked.png' });`
);
// assertSavedMaterials calls: after #99 (B2), after re-edit (B2), after held write (B3)
s = s.replace(
  `  assert.equal((await seen(page)).items[0].item_total_cost, 0, 'raw cash still 0');
  await page.screenshot({ path: OUT + '/b2-ack-cache.png' });`,
  `  assert.equal((await seen(page)).items[0].item_total_cost, 0, 'raw cash still 0');
  await assertSavedMaterials(page);
  await page.screenshot({ path: OUT + '/b2-ack-cache.png' });`
);
s = s.replace(
  `  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'ack cache == expected after re-edit');
  assert.equal(await spyCount(page, 'saveSource'), 1, 'still one source write');`,
  `  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'ack cache == expected after re-edit');
  await assertSavedMaterials(page);
  assert.equal(await spyCount(page, 'saveSource'), 1, 'still one source write');`
);
s = s.replace(
  `  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'ack cache == expected after late write');`,
  `  assert.equal(await cardTotal(page).innerText(), expectedTotal, 'ack cache == expected after late write');
  await assertSavedMaterials(page);`
);
// B3: 'pending draft' description actually typed — current code does fill before defer; keep.
fs.writeFileSync(p, s);
console.log('fx4 applied');
