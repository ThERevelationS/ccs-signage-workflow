// materials14 UI tests: REAL ItemCard/DeliveryPanel/Totals/BOM + real calc/integrity/money.
// Stubs only ui primitives + lucide. Frozen complete-before.json case data (lead-authored).
import esbuild from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const OUT = '.audit-work/foundation-materials14';
fs.mkdirSync(OUT, { recursive: true });
globalThis.window = { confirm: () => true, location: { search: '' }, addEventListener() {}, removeEventListener() {} };
globalThis.location = globalThis.window.location;

const STUBS = {
  '@/components/ui/input': `export const Input=(p)=><input {...p}/>;`,
  'lucide-react': `const I=()=>null;export const Trash2=I,Box=I,Copy=I,AlertTriangle=I,X=I;export default I;`,
};
const plug = { name: 's', setup(b) {
  b.onResolve({ filter: /.*/ }, a => (STUBS[a.path] ? { path: 's://' + a.path, namespace: 's' } : undefined));
  b.onLoad({ filter: /.*/, namespace: 's' }, a => ({ contents: STUBS[a.path.slice(4)], loader: 'jsx', resolveDir: path.resolve('.') }));
}};
const build = async (entry, out) => esbuild.build({
  entryPoints: [entry], bundle: true, format: 'esm', external: ['react', 'react-test-renderer', 'scheduler', 'scheduler/*'],
  plugins: [plug], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic', outfile: out,
  alias: { '@': path.resolve('src') },
});
await build('src/components/estimator/foundation/FoundationItemCard.jsx', `${OUT}/ic.mjs`);
await build('src/components/estimator/foundation/ConcreteDeliveryPanel.jsx', `${OUT}/dp.mjs`);
await build('src/components/estimator/foundation/FoundationTotals.jsx', `${OUT}/tot.mjs`);
await build('src/components/estimator/foundation/FoundationBOM.jsx', `${OUT}/bom.mjs`);
await build('src/components/estimator/foundation/foundationCalc.js', `${OUT}/calc.mjs`);
const ItemCard = (await import(pathToFileURL(path.resolve(`${OUT}/ic.mjs`)))).default;
const DeliveryPanel = (await import(pathToFileURL(path.resolve(`${OUT}/dp.mjs`)))).default;
const Totals = (await import(pathToFileURL(path.resolve(`${OUT}/tot.mjs`)))).default;
const BOM = (await import(pathToFileURL(path.resolve(`${OUT}/bom.mjs`)))).default;
const { calcProject, money, captureConcreteDeliverySnapshot } = await import(pathToFileURL(path.resolve(`${OUT}/calc.mjs`)));
const React = (await import('react')).default;
const { create, act } = await import('react-test-renderer');

const C = JSON.parse(fs.readFileSync(`${OUT}/complete-before.json`, 'utf8')).cases[1];
const deep = (o) => JSON.parse(JSON.stringify(o));
const freeze = (o) => { for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') freeze(o[k]); return Object.freeze(o); };
const baseSaved = () => ({
  ...deep(C.project), ...deep(C.expected.totals), items: deep(C.expected.items),
  concrete_delivery_snapshot: captureConcreteDeliverySnapshot(deep(C.expected.delivery)),
});
const M = money;
const mounted = [];
// wrapper ALWAYS records then forwards to caller's callback — no silent no-ops.
const mount = async (Comp, props) => {
  const calls = { changes: [] };
  const wrapped = { ...props };
  wrapped.onChange = (...a) => { calls.changes.push(a); return props.onChange?.(...a); };
  let c;
  await act(async () => { c = create(React.createElement(Comp, wrapped)); for (let i = 0; i < 15; i++) await Promise.resolve(); });
  mounted.push(c);
  return { c, calls };
};
const text = (c) => { const t = []; const walk = (n) => { if (typeof n === 'string' || typeof n === 'number') t.push(n); else if (Array.isArray(n)) n.forEach(walk); else if (n?.children) walk(n.children); }; walk(c.toJSON()); return t.join(' '); };
const elText = (el) => (Array.isArray(el.children) ? el.children : [el.children]).flat(Infinity).map(x => (typeof x === 'string' || typeof x === 'number') ? x : (x && typeof x === 'object' && x.children ? elText(x) : '')).join(' ');
const cells = c => c.root.findAll(el => el.type === 'tr')
  .map(row => row.findAll(el => el.type === 'td').map(el => elText(el).replace(/\u2014/g, '-'))).filter(row => row.length);
const costLine = (c, label) => {
  const row = c.root.findAll(el => el.type === 'div' && el.props.className === 'px-1'
    && el.children[0]?.type === 'div' && elText(el.children[0]) === label);
  assert.equal(row.length, 1, `${label} has one item cost line`);
  return elText(row[0].children[1]);
};
const formatQty = (value, unit) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
const calcWith = (removedId) => {
  const saved = freeze(baseSaved());
  const inv = freeze(deep(C.inventory).filter(i => i.id !== removedId));
  const cur = calcProject(deep(saved), inv, deep(C.settings), { savedProject: saved });
  return { saved, inv, cur };
};
const catalog = (inv) => ({
  concrete: inv.filter(i => ['bagged_concrete', 'concrete_service'].includes(i.material_type)),
  forming: inv.filter(i => i.material_type === 'forming_material'),
});

let passed = 0, failed = 0;
const ok = async (name, fn) => {
  try { await fn(); passed++; console.log('ok', name); }
  catch (e) { failed++; console.log('FAIL', name, '-', String(e?.stack || e)); }
  finally { await act(async () => { for (const c of mounted.splice(0)) c.unmount(); }); }
};

// T1 missing concrete: saved cash + unavailable option + zero callbacks, frozen inputs
await ok('missing concrete: unavailable option + saved cash + zero callbacks', async () => {
  const { inv, cur } = calcWith('bag');
  const item = freeze(deep(cur.items[0]));
  const pricing = freeze(deep(cur.itemPricing[0]));
  const cat = freeze(catalog(inv));
  const { c, calls } = await mount(ItemCard, { item, index: 0, catalog: cat, pricing, onRemove: () => {}, onDuplicate: () => {}, onChange: () => {} });
  const t = text(c);
  assert.ok(t.includes('Saved amounts (not current pricing)'), 'saved banner');
  assert.ok(t.includes('Catalog item unavailable'), 'unavailable option');
  const option = c.root.findAll(el => el.type === 'option' && el.props.value === 'bag');
  assert.equal(option.length, 1);
  assert.equal(option[0].props.disabled, true);
  assert.equal(calls.changes.length, 0, 'zero callbacks on render');
  assert.ok(t.includes(M(C.expected.items[0].item_total_cost)), `saved total ${M(C.expected.items[0].item_total_cost)}`);
});

// T2 scoped line: excavation_cost 0 -> $0.00 on Excavation line; absent -> Not saved
await ok('scoped lines: excavation 0 -> $0.00; absent -> Not saved', async () => {
  const { inv, cur } = calcWith('bag');
  const i0 = cur.items[0];
  const { c } = await mount(ItemCard, { item: { ...i0, excavation_cost: undefined }, index: 0, catalog: catalog(inv), pricing: { available: false, issues: [{ message: 'x' }] }, onChange: () => {} });
  assert.equal(costLine(c, 'Excavation'), 'Not saved');
  const { c: c2 } = await mount(ItemCard, { item: { ...i0, excavation_cost: 0 }, index: 0, catalog: catalog(inv), pricing: { available: false, issues: [] }, onChange: () => {} });
  assert.equal(costLine(c2, 'Excavation'), M(0));
});

// T3 real calcProject: manual override0 + missing bar -> available; inactive-forming unavailable option; missing active form -> blocked
await ok('rebar manual0 bypass via real calc; inactive forming disabled option; missing active form blocked', async () => {
  const saved = freeze(baseSaved());
  const inv = freeze(deep(C.inventory).filter(i => i.id !== 'bar'));
  const proj = deep(saved);
  proj.items = [{ ...proj.items[0], custom_rebar_cost_per_ft: 0 }];
  const cur = calcProject(proj, inv, deep(C.settings), { savedProject: saved });
  assert.equal(cur.itemPricing[0].available, true, 'manual0 bypasses missing bar');
  // inactive forming with missing selected id: still rendered + disabled option, real calc available
  const proj2 = deep(saved);
  proj2.items = [{ ...proj2.items[0], include_rebar: false, include_forming: false, selected_forming_id: 'gone' }];
  const inv2 = freeze(deep(C.inventory).filter(i => i.id !== 'bar'));
  const cur2 = calcProject(proj2, inv2, deep(C.settings), { savedProject: saved });
  assert.equal(cur2.itemPricing[0].available, true, 'inactive missing form does not block');
  const { c } = await mount(ItemCard, { item: cur2.items[0], index: 0, catalog: catalog(inv2), pricing: cur2.itemPricing[0], onChange: () => {} });
  const disabled = c.root.findAll(el => el.type === 'option' && el.props.value === 'gone' && el.props.disabled);
  assert.equal(disabled.length, 1, 'inactive forming unavailable option visible+disabled');
  let current = { ...cur2.items[0], custom_concrete_cost_per_cy: 0 };
  const patches = [];
  const controlled = await mount(ItemCard, {
    item: current, index: 0, catalog: catalog(inv2), pricing: cur2.itemPricing[0],
    onChange: (index, patch) => {
      assert.equal(index, 0);
      patches.push(patch);
      current = { ...current, ...patch };
    },
  });
  const formSelect = controlled.c.root.findAll(el => el.type === 'select' && el.props.value === 'gone');
  assert.equal(formSelect.length, 1);
  await act(async () => formSelect[0].props.onChange({ target: { value: 'form' } }));
  assert.deepEqual(patches, [{ selected_forming_id: 'form' }]);
  assert.equal(current.custom_concrete_cost_per_cy, 0);
  // missing ACTIVE form blocks
  const proj3 = deep(saved);
  proj3.items = [{ ...proj3.items[0], selected_forming_id: 'gone' }];
  const inv3 = freeze(deep(C.inventory).filter(i => i.id !== 'form'));
  const cur3 = calcProject(proj3, inv3, deep(C.settings), { savedProject: saved });
  assert.equal(cur3.itemPricing[0].available, false, 'missing active forming blocks');
});

// T4 controlled override: fire 0 -> immediate 0; '' -> null; Clear -> null; unit labels
await ok('controlled override: 0 applies, empty->null, Clear->null, unit labels', async () => {
  let current = deep(C.expected.items[0]);
  const calls = { changes: [] };
  let c;
  const wrappedOnc = (ii, patch) => {
    calls.changes.push(patch);
    current = { ...current, ...patch };
    c.update(React.createElement(ItemCard, { item: current, index: 0, catalog: catalog(C.inventory), pricing: { available: true, issues: [] }, onChange: wrappedOnc }));
  };
  await act(async () => {
    c = create(React.createElement(ItemCard, { item: current, index: 0, catalog: catalog(freeze(deep(C.inventory))), pricing: { available: true, issues: [] }, onChange: wrappedOnc }));
    for (let i = 0; i < 15; i++) await Promise.resolve();
  });
  mounted.push(c);
  const oInput = () => c.root.findAll(el => el.type === 'label' && elText(el).includes('override'))[0].findAll(el => el.type === 'input')[0];
  assert.ok(text(c).includes('$/bag'), 'bag unit label on valid catalog');
  await act(async () => { oInput().props.onChange({ target: { value: '0' } }); for (let i = 0; i < 10; i++) await Promise.resolve(); });
  assert.deepEqual(calls.changes.at(-1), { custom_concrete_cost_per_cy: 0 }, '0 applied immediately');
  assert.equal(current.custom_concrete_cost_per_cy, 0, 'source 0');
  assert.equal(oInput().props.value, 0, 'input resynced to 0');
  await act(async () => { oInput().props.onChange({ target: { value: '' } }); for (let i = 0; i < 10; i++) await Promise.resolve(); });
  assert.deepEqual(calls.changes.at(-1), { custom_concrete_cost_per_cy: null }, 'empty -> null');
  assert.equal(current.custom_concrete_cost_per_cy, null, 'source null');
  assert.equal(oInput().props.value, '', 'cleared input resyncs');
  await act(async () => { oInput().props.onChange({ target: { value: '0' } }); for (let i = 0; i < 10; i++) await Promise.resolve(); });
  const clr = c.root.findAll(el => el.type === 'button' && elText(el).includes('Clear'))[0];
  await act(async () => { clr.props.onClick(); for (let i = 0; i < 10; i++) await Promise.resolve(); });
  assert.equal(current.custom_concrete_cost_per_cy, null, 'Clear -> null');
  // unknown unit on missing row
  const { inv, cur } = calcWith('bag');
  const { c: cU } = await mount(ItemCard, { item: cur.items[0], index: 0, catalog: catalog(inv), pricing: cur.itemPricing[0], onChange: () => {} });
  assert.ok(text(cU).includes('unknown unit'), 'missing row -> unknown unit label');
  const { c: cReady } = await mount(ItemCard, {
    item: { ...current, selected_concrete_id: 'ready' }, index: 0,
    catalog: catalog(C.inventory), pricing: { available: true, issues: [] },
  });
  assert.ok(text(cReady).includes('$/CY'), 'ready-mix override uses yard units');
});

// T5 delivery saved-mix IDs retained + all controls disabled + nulls Not saved
await ok('delivery unavailable: saved mix/admix IDs visible+disabled, all inputs disabled, nulls Not saved', async () => {
  const del = { pricingUnavailable: true, concreteTotal: undefined, roundedYards: undefined, ratePerYard: undefined, trucksList: [], availableMixes: [], availableAdmixes: [{ id: 'a1', name: 'Accelerator', price: 8, desc: 'x' }] };
  const proj = { project_concrete_type: 'saved-mix-id', project_concrete_admixtures: ['saved-admix-id'] };
  const { c, calls } = await mount(DeliveryPanel, { project: freeze(deep(proj)), delivery: freeze(deep(del)), onChange: () => {} });
  const t = text(c);
  assert.ok(t.includes('Saved amounts (not current pricing)'), 'banner');
  assert.ok(t.includes('saved-mix-id'), 'saved mix id visible');
  assert.ok(t.includes('saved-admix-id'), 'saved admix id visible');
  assert.ok(t.includes('Not saved'), 'null totals -> Not saved');
  const controls = c.root.findAll(el => el.type === 'select' || el.type === 'input');
  assert.equal(controls.length, 2);
  assert.ok(controls.every(el => el.props.disabled === true), 'every price control disabled');
  const savedOption = c.root.findAll(el => el.type === 'option' && el.props.value === 'saved-mix-id');
  assert.equal(savedOption.length, 1);
  assert.equal(savedOption[0].props.disabled, true);
  assert.equal(calls.changes.length, 0, 'zero callbacks on render');
});

// T6 saved truck rows: cost0 shows $0.00, nonzero shown, unknown -> Not saved
await ok('saved trucks: 0 -> $0.00, nonzero shown, unknown -> Not saved', async () => {
  const del = { pricingUnavailable: true, concreteTotal: 100, roundedYards: 3, ratePerYard: 40, trucksList: [{ roundedYards: 2, cost: 0 }, { roundedYards: undefined, cost: 95 }], availableMixes: [], availableAdmixes: [] };
  const { c } = await mount(DeliveryPanel, { project: deep(C.project), delivery: deep(del), onChange: () => {} });
  const t = text(c);
  assert.ok(t.includes(M(0)), 'truck0 -> $0.00');
  assert.ok(t.includes(M(95)), 'nonzero truck cost');
  assert.ok(t.includes('Not saved'), 'unknown truck yards -> Not saved');
});

// T7 frozen free-bag case15: 45 bags / cost0 row; delivery order row labelled (saved)
await ok('frozen free-bag 45/cost0 BOM row + delivery order (saved) row', async () => {
  const freeCase = JSON.parse(fs.readFileSync(`${OUT}/complete-before.json`, 'utf8')).cases.find(c => /free.?bag/i.test(c.name || ''));
  assert.ok(freeCase, 'frozen free-bag case exists');
  const expected = freeCase.expected;
  const items = deep(expected.items);
  const del = { pricingUnavailable: true, concreteTotal: expected.delivery.concreteTotal, roundedYards: expected.delivery.roundedYards };
  const { c } = await mount(BOM, { items, poles: [], walls: [], delivery: del, totals: deep(expected.totals), inventory: deep(freeCase.inventory), itemPricing: items.map(() => ({ available: true, issues: [] })), pricingUnavailable: true });
  const t = text(c);
  assert.deepEqual(cells(c).find(row => row[0] === 'Bagged concrete'),
    ['Bagged concrete', formatQty(expected.items[0].concrete_bags, 'bags'), M(expected.items[0].concrete_cost)]);
  assert.ok(t.includes('delivery/order (saved)'), 'delivery order saved row');
});

// T8 mixed blocked+resolved: every actual row cell asserted, no double-count
await ok('BOM mixed: resolved groups = ONE case1; blocked f1 saved rows; no dup; footer flag', async () => {
  const { cur } = calcWith('bag');
  const exp = C.expected.items[0];
  const resolved = { ...deep(exp), component_id: 'f2' };
  const items = [...cur.items, resolved];
  const pricing = [deep(cur.itemPricing[0]), { available: true, issues: [] }];
  const misleadingCategoryTotals = {
    total_rebar_cost: exp.rebar_cost * 2,
    total_forming_materials_cost: exp.forming_cost * 2,
  };
  const { c } = await mount(BOM, { items, poles: [], walls: [], delivery: { pricingUnavailable: true }, totals: misleadingCategoryTotals, inventory: deep(C.inventory), itemPricing: pricing, pricingUnavailable: true });
  const t = text(c);
  assert.deepEqual(cells(c), [
    ['Concrete delivery/order (saved)', 'Not saved', 'Not saved'],
    ['Bagged concrete', formatQty(exp.concrete_bags, 'bags'), M(exp.concrete_cost)],
    [`Rebar (${formatQty(exp.rebar_weight_lbs, 'lbs')})`, formatQty(exp.rebar_feet, 'LF'), M(exp.rebar_cost)],
    ['Forming material', formatQty(exp.forming_qty, 'units'), M(exp.forming_cost)],
    ['Foundation f1 (saved) - concrete', formatQty(exp.concrete_bags, 'bags'), M(exp.concrete_cost)],
    ['Foundation f1 (saved) - rebar', formatQty(exp.rebar_feet, 'LF'), M(exp.rebar_cost)],
    ['Foundation f1 (saved) - forming', formatQty(exp.forming_qty, 'units'), M(exp.forming_cost)],
  ]);
  assert.ok(t.includes('Pricing unavailable'), 'footer flag');
  assert.ok(t.includes(M(exp.rebar_cost)), `resolved rebar cost ${exp.rebar_cost}`);
});

// T9 empty BOM -> no rows + empty message; all-zero totals -> 0.00/0.0/$0.00; flagged grand
await ok('empty BOM msg + all-zero Totals show real zeros; flagged grand Pricing unavailable', async () => {
  const { c } = await mount(BOM, { items: [], poles: [], walls: [], delivery: undefined, totals: {}, inventory: [], itemPricing: [], pricingUnavailable: false });
  assert.ok(text(c).includes('No materials yet'), 'empty BOM message');
  const zero = { total_concrete_volume_cy: 0, total_excavation_volume_cy: 0, total_labor_hours: 0, grand_total: 0, total_concrete_cost: 0, total_rebar_cost: 0, total_excavation_cost: 0, total_forming_materials_cost: 0, total_labor_cost: 0, total_pole_cost: 0, total_pole_painting_cost: 0, total_brick_cost: 0, total_fill_cost: 0, total_wall_cost: 0, total_wall_cap_cost: 0, total_equipment_cost: 0 };
  const { c: t0 } = await mount(Totals, { totals: zero, pricingUnavailable: false });
  const s = text(t0);
  assert.ok(s.includes('0.00 CY'), 'zero concrete CY');
  assert.ok(s.includes('0.0 hr'), 'zero labor hr');
  assert.ok(s.includes(M(0)), 'zero costs');
  const nulls = { total_concrete_volume_cy: null, total_excavation_volume_cy: null, total_labor_hours: null, grand_total: null, total_wall_cost: 10, total_brick_cost: null, total_fill_cost: 5 };
  const { c: tn } = await mount(Totals, { totals: nulls, pricingUnavailable: true });
  const sn = text(tn);
  assert.ok(sn.includes('Not saved'), 'null -> Not saved');
  assert.ok(sn.includes('Pricing unavailable'), 'flagged grand');
  assert.ok(!sn.includes('0.00 CY'), 'no fake 0 for null');
  const wallRow = tn.root.findAll(el => el.type === 'div' && el.children[0]?.type === 'span'
    && elText(el.children[0]) === 'Wall mortar + labor');
  assert.equal(wallRow.length, 1);
  assert.equal(elText(wallRow[0].children[1]), 'Not saved');
});

await ok('deep-frozen render purity across all four real components', async () => {
  const { cur, inv, saved } = calcWith('bag');
  const cases = [
    [ItemCard, { item: cur.items[0], index: 0, catalog: catalog(inv), pricing: cur.itemPricing[0] }],
    [DeliveryPanel, { project: saved, delivery: cur.delivery }],
    [Totals, { totals: cur.totals, pricingUnavailable: true }],
    [BOM, { items: cur.items, delivery: cur.delivery, totals: cur.totals, inventory: inv, itemPricing: cur.itemPricing, pricingUnavailable: true }],
  ];
  for (const [Comp, input] of cases) {
    const props = freeze(input);
    const before = JSON.stringify(props);
    const { calls } = await mount(Comp, props);
    assert.equal(calls.changes.length, 0);
    assert.equal(JSON.stringify(props), before);
  }
});

console.log(`PASS material-ui passed=${passed} failed=${failed}`);
process.exitCode = failed ? 1 : 0;
