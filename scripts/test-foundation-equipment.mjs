// equipment13 UI tests: REAL FoundationEquipmentTab + real calc/bindings/integrity/money.
// Stubs only ui primitives + lucide. Frozen diagnostic inputs; no re-derivation.
import esbuild from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const OUT = '.audit-work/foundation-equipment13';
fs.mkdirSync(OUT, { recursive: true });
globalThis.window = { confirm: () => true, alert: () => {}, location: { search: '' }, addEventListener() {}, removeEventListener() {} };
globalThis.location = globalThis.window.location;

const STUBS = {
  '@/components/ui/input': `export const Input=(p)=><input {...p}/>;`,
  '@/components/ui/card': `export const Card=(p)=><div {...p}>{p.children}</div>;export const CardContent=(p)=><div {...p}>{p.children}</div>;export const CardHeader=(p)=><div {...p}>{p.children}</div>;export const CardTitle=(p)=><div {...p}>{p.children}</div>;`,
  '@/components/ui/button': `export const Button=(p)=><button type="button" {...p}>{p.children}</button>;`,
  '@/components/ui/label': `export const Label=(p)=><label {...p}>{p.children}</label>;`,
  '@/components/ui/badge': `export const Badge=(p)=><span {...p}>{p.children}</span>;`,
  '@/components/ui/select': `export const Select=(p)=><div>{p.children}</div>;export const SelectTrigger=(p)=><div>{p.children}</div>;export const SelectValue=()=><span/>;export const SelectContent=(p)=><div>{p.children}</div>;export const SelectItem=(p)=><div data-item={p.value} data-disabled={p.disabled}>{p.children}</div>;`,
  '@/components/ui/checkbox': `export const Checkbox=(p)=><input type="checkbox" checked={p.checked} onChange={e=>p.onCheckedChange?.(e.target.checked)}/>`,
  'lucide-react': `const I=()=>null;export const Plus=I,Trash2=I,Wrench=I;export default I;`,
};
const plug = { name: 's', setup(b) {
  b.onResolve({ filter: /.*/ }, a => (STUBS[a.path] ? { path: 's://' + a.path, namespace: 's' } : undefined));
  b.onLoad({ filter: /.*/, namespace: 's' }, a => ({ contents: STUBS[a.path.slice(4)], loader: 'jsx', resolveDir: path.resolve('.') }));
}};
await esbuild.build({
  entryPoints: ['src/components/estimator/foundation/FoundationEquipmentTab.jsx'], bundle: true, format: 'esm',
  external: ['react', 'react-test-renderer', 'scheduler', 'scheduler/*'],
  plugins: [plug], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic',
  outfile: `${OUT}/eqtab.mjs`, alias: { '@': path.resolve('src') },
});
const Tab = (await import(pathToFileURL(path.resolve(`${OUT}/eqtab.mjs`)))).default;
const React = (await import('react')).default;
const { create, act } = await import('react-test-renderer');

let passed = 0, failed = 0;
const ok = async (name, fn) => { try { await fn(); passed++; console.log('ok', name); } catch (e) { failed++; console.log('FAIL', name, '-', String(e?.message || e).slice(0, 400)); } };

// frozen diagnostic fixtures
const EQ = { id: 'eq', material_type: 'excavation_equipment', material_name: 'Excavator', cost_per_day: 100, cost_per_week: 500, pickup_delivery_cost: 20, compatible_attachment_ids: ['att'], is_spread_foot_excavation: true };
const ATT = { id: 'att', material_type: 'attachment', material_name: 'Auger bit', cost_per_day: 15, compatible_sub_attachment_ids: ['sub'] };
const SUB = { id: 'sub', material_type: 'sub_attachment', material_name: 'Rock tip', cost_per_day: 7 };
const INV = [EQ, ATT, SUB];
const deep = (o) => JSON.parse(JSON.stringify(o));
const freeze = (o) => JSON.parse(JSON.stringify(o), (k, v) => (v && typeof v === 'object' ? Object.freeze(v) : v));

const roots = [];
const mount = async (entry, inventory = INV, items = [{ foundation_type: 'spread_foot' }]) => {
  const calls = { updates: [], dirty: 0 };
  let c, restore;
  function Harness() {
    const [rows, setRows] = React.useState([entry]);
    restore = next => setRows([next]);
    return React.createElement(Tab, {
      foundationItems: items, inventory, selectedEquipmentList: rows,
      onUpdate: arr => { calls.updates.push(arr); setRows(arr); },
      markDirty: () => calls.dirty++,
    });
  }
  await act(async () => {
    c = create(React.createElement(Harness));
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
  roots.push(c);
  return { c, calls, restore: async next => { await act(async () => restore(next)); } };
};
const text = (c) => {
  const t = [];
  const walk = (n) => { if (typeof n === 'string') t.push(n); else if (Array.isArray(n)) n.forEach(walk); else if (n?.children) walk(n.children); };
  walk(c.toJSON());
  return t.join(' ');
};
const qtyInput = (c, name) => c.root.findAll(el => el.type === 'input' && String(el.props['aria-label'] || '').includes(name))[0];
const applyQty = async (c, name, value) => {
  const inp = qtyInput(c, name);
  assert.ok(inp, `qty input ${name}`);
  await act(async () => { inp.props.onChange({ target: { value: String(value) } }); });
  assert.equal(qtyInput(c, name)?.props.onBlur, undefined, 'no private blur-only commit');
};
const elText = (el) => (Array.isArray(el.children) ? el.children : [el.children]).flat(Infinity).map(x => (typeof x === 'string' || typeof x === 'number') ? x : (x && typeof x === 'object' && x.children ? elText(x) : '')).join(' ');
const click = async (c, label) => {
  const b = c.root.findAll(el => (el.type === 'button') && elText(el).includes(label))[0];
  assert.ok(b, `button ${label}`);
  await act(async () => { b.props.onClick(); for (let i = 0; i < 10; i++) await Promise.resolve(); });
};
const totals = c => c.root.findAll(el => el.type === 'span' && elText(el).startsWith('Total:')).map(elText);
const choose = async (c, placeholder, value) => {
  const select = c.root.findAll(el => typeof el.props.onValueChange === 'function'
    && el.findAll(n => typeof n.type === 'function' && n.props.placeholder === placeholder).length > 0);
  assert.equal(select.length, 1, `unique selector ${placeholder}`);
  assert.equal(select[0].findAll(n => n.type === 'div' && n.props['data-item'] === value && !n.props['data-disabled']).length, 1, 'choice must actually be available');
  await act(async () => select[0].props.onValueChange(value));
};

// 1) render purity: empty counts{} + legacy ids -> no mutation, total 100 not 115
await ok('render purity: empty counts + legacy ids -> no mutation, total $100.00', async () => {
  const entry = freeze({ _id: 'selected-eq', equipment_id: 'eq', rental_period: 'day', rental_duration: 1, include_delivery: false, attachment_counts: {}, attachment_ids: ['att'], equipment_cost: 100 });
  const inv = freeze(deep(INV));
  const before = JSON.stringify(entry);
  const { c, calls } = await mount(entry, inv);
  const t = text(c);
  assert.deepEqual(totals(c), ['Total:  $100.00'], 'exact card total, not migrated 115');
  assert.ok(!t.includes('$115.00'));
  assert.equal(calls.updates.length, 0, 'zero onUpdate');
  assert.equal(calls.dirty, 0, 'zero markDirty');
  assert.equal(JSON.stringify(entry), before, 'entry untouched (no counts migration)');
  assert.deepEqual(entry.attachment_counts, {}, 'counts still empty');
});

// orphan visible even with empty inventory
await ok('unknown/orphan row visible with empty inventory', async () => {
  const entry = { _id: 'e1', equipment_id: 'ghost', attachment_counts: {}, equipment_cost: 600 };
  const { c } = await mount(entry, []);
  const t = text(c);
  assert.ok(t.includes('Equipment 1'), 'row renders without parent');
  assert.ok(t.includes('$600.00'), 'saved snapshot shown');
  assert.ok(t.includes('Unavailable'), 'unavailable flagged');
});

// 2) normalized qty/costs + edits through adapter
await ok('normalized qty2 -> 130; input 3 -> one update + 145; remove -> 100', async () => {
  const entry = { _id: 'e', equipment_id: 'eq', rental_period: 'day', rental_duration: 1, include_delivery: false, attachments: [{ id: 'att', qty: 2 }], equipment_cost: 100 };
  const { c, calls, restore } = await mount(deep(entry));
  assert.ok(text(c).includes('$130.00'), 'normalized qty2 priced 130');
  await applyQty(c, 'Attachment qty', '3');
  assert.equal(calls.updates.length, 1, 'one update');
  assert.equal(calls.dirty, 1, 'one dirty');
  const updated = calls.updates[0][0];
  assert.ok(Array.isArray(updated.attachments) && updated.attachments[0].qty === 3, 'adapter normalized qty3');
  assert.deepEqual(updated.attachment_counts ?? {}, {}, 'shadow counts cleared');
  assert.deepEqual(updated.attachment_ids ?? [], [], 'shadow ids cleared');
  assert.deepEqual(totals(c), ['Total:  $145.00']);
  assert.equal(qtyInput(c, 'Attachment qty').props.value, 3);
  await restore(deep(entry));
  assert.deepEqual(totals(c), ['Total:  $130.00']);
  assert.equal(qtyInput(c, 'Attachment qty').props.value, 2);
  assert.equal(qtyInput(c, 'Attachment qty').props.onBlur, undefined);
  assert.equal(calls.updates.length, 1, 'Undo followed by blur must not replay a draft');
  await applyQty(c, 'Attachment qty', '');
  assert.equal(qtyInput(c, 'Attachment qty').props.value, 2);
  assert.equal(calls.updates.length, 1, 'empty blur does not edit');
  // remove qty0: controlled component -> assert the emitted update, not re-render
  const { c: c2, calls: calls2 } = await mount(deep(entry));
  await applyQty(c2, 'Attachment qty', '0');
  assert.equal(calls2.updates.length, 1, 'remove emits one update');
  const rem = calls2.updates[0][0];
  assert.equal((rem.attachments || []).length, 0, 'qty0 removes the normalized row');
  const { c: c3 } = await mount(rem);
  assert.equal(qtyInput(c3, 'Attachment qty'), undefined, 'row gone after update applied');
  assert.ok(text(c3).includes('$100.00'), 'total back to 100');
});

await ok('normalized qty0 -> explicit zero bills nothing ($100); legacy dup ids x2 -> 130 -> input 3 -> 145', async () => {
  const { c } = await mount({ _id: 'e', equipment_id: 'eq', attachments: [{ id: 'att', qty: 0 }], equipment_cost: 100 });
  assert.ok(text(c).includes('$100.00'), 'normalized qty0 stays zero, not silently repriced to 1');
  assert.ok(!text(c).includes('$115.00'), 'no phantom attachment charge');
  const dup = { _id: 'e', equipment_id: 'eq', attachment_ids: ['att', 'att'], equipment_cost: 100 };
  const { c: c2, calls } = await mount(dup);
  assert.ok(text(c2).includes('$130.00'), 'legacy dup x2 priced 130');
  await applyQty(c2, 'Attachment qty', '3');
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0][0].attachment_counts?.att ?? calls.updates[0][0].attachments?.[0]?.qty, 3, 'counts/id set to 3');
  assert.deepEqual(totals(c2), ['Total:  $145.00']);
});

// 3) explicit zero overrides honored + clear works
await ok('custom rate0/qty2/delivery0 -> 0; clear rate -> 200', async () => {
  const entry = { _id: 'e', equipment_id: 'eq', rental_period: 'day', rental_duration: 1, include_delivery: true, attachment_counts: {}, equipment_cost: 100, custom_rate: 0, custom_qty: 2, custom_delivery_charge: 0 };
  const { c, calls } = await mount(deep(entry));
  const t = text(c);
  assert.deepEqual(totals(c), ['Total:  $0.00'], 'explicit zeros -> exact card total 0');
  assert.ok(t.includes('Custom rate'), 'override chip visible');
  assert.ok(t.includes('Custom qty :  2'), 'quantity override is not currency');
  await click(c, 'Clear');
  const upd = calls.updates[0][0];
  assert.equal(upd.custom_rate, null, 'clear sets null');
  assert.deepEqual(totals(c), ['Total:  $200.00'], 'clear applies through controlled props');
});

// 4) missing refs preserve whole snapshot / Not saved / explicit0
await ok('missing parent -> Saved 600; unknown -> Not saved; explicit0 -> $0.00; missing child keeps whole', async () => {
  const { c } = await mount({ _id: 'e', equipment_id: 'gone', attachment_counts: {}, equipment_cost: 600 }, []);
  const t = text(c);
  assert.ok(t.includes('$600.00'), 'saved 600 shown');
  assert.ok(t.includes('Unavailable'), 'breakdown unavailable');
  const { c: c2 } = await mount({ _id: 'e', equipment_id: 'gone', attachment_counts: {} }, []);
  assert.ok(text(c2).includes('Not saved'), 'unknown snapshot -> Not saved');
  const { c: c3 } = await mount({ _id: 'e', equipment_id: 'gone', attachment_counts: {}, equipment_cost: 0 }, []);
  assert.ok(text(c3).includes('$0.00'), 'explicit 0 -> $0.00');
  const { c: c4 } = await mount({ _id: 'e', equipment_id: 'eq', attachment_counts: { ghostAtt: 2 }, equipment_cost: 115 }, INV);
  const t4 = text(c4);
  assert.ok(t4.includes('$115.00'), 'missing child keeps whole saved 115, not fresh 100');
  assert.ok(t4.includes('Unavailable'), 'no fresh breakdown for missing child');
  const { c: c5 } = await mount({ _id: 'e', equipment_id: 'eq', attachment_counts: {}, sub_attachment_counts: { ghostSub: 2 }, equipment_cost: 160 }, INV);
  const t5 = text(c5);
  assert.ok(t5.includes('$160.00'), 'missing sub keeps saved 160');
});

await ok('counts qty0 missing does NOT block; normalized qty0 missing DOES block', async () => {
  const { c } = await mount({ _id: 'e', equipment_id: 'eq', attachment_counts: { gone: 0 }, equipment_cost: 100 }, INV);
  assert.ok(!text(c).includes('Unavailable'), 'counts0 no issue');
  const { c: c2 } = await mount({ _id: 'e', equipment_id: 'eq', attachments: [{ id: 'gone', qty: 0 }], equipment_cost: 100 }, INV);
  assert.ok(text(c2).includes('Unavailable'), 'normalized0 requires ref');
});

// 5) duplicates + corrupt input
await ok('normalized dup rows visible, qty edit disabled, Remove all clears shadows; corrupt input -> inline error', async () => {
  const entry = { _id: 'e', equipment_id: 'eq', attachments: [{ id: 'att', qty: 1 }, { id: 'att', qty: 1 }], attachment_counts: {}, attachment_ids: [], equipment_cost: 100 };
  const { c, calls } = await mount(deep(entry));
  const t = text(c);
  assert.ok(t.includes('Duplicate rows'), 'dup ambiguity flagged');
  await click(c, 'Remove all duplicates');
  assert.equal(calls.updates.length, 1);
  const upd = calls.updates[0][0];
  assert.equal((upd.attachments || []).length, 0, 'duplicates removed');
  assert.deepEqual(upd.attachment_counts ?? {}, {}, 'shadow counts cleared');
  const { c: c2 } = await mount({ _id: 'e', equipment_id: 'eq', attachment_counts: { att: 1 }, equipment_cost: 100 }, INV);
  await applyQty(c2, 'Attachment qty', '0.5');
  assert.ok(text(c2).includes('whole number'), 'fraction rejected with inline error');
  assert.deepEqual(totals(c2), ['Total:  $115.00'], 'invalid draft does not reprice');
});

await ok('zero keys re-add via real attachment-to-sub compatibility', async () => {
  const source = freeze({ _id: 'e', equipment_id: 'eq', attachment_counts: { att: 0 }, sub_attachment_counts: { sub: 0 } });
  const { c, calls } = await mount(source, freeze(deep(INV)));
  assert.equal(qtyInput(c, 'Attachment qty'), undefined);
  await choose(c, 'Add attachment\u2026', 'att');
  assert.deepEqual(totals(c), ['Total:  $115.00']);
  await choose(c, 'Add sub-attachment\u2026', 'sub');
  assert.deepEqual(totals(c), ['Total:  $122.00']);
  assert.equal(calls.updates.length, 2);
  assert.equal(calls.dirty, 2);
  assert.deepEqual(source.attachment_counts, { att: 0 });
});

await ok('unselected catalog parent does not link a selected sub', async () => {
  const { c } = await mount({ _id: 'e', equipment_id: 'eq', attachment_counts: {}, sub_attachment_counts: { sub: 1 } });
  assert.ok(text(c).includes('No selected parent attachment links this item.'));
  assert.ok(qtyInput(c, 'Sub attachment qty'));
  assert.equal(c.root.findAll(el => typeof el.type === 'function' && el.props.placeholder === 'Add sub-attachment\u2026').length, 0);
});

await ok('real equipment flags control eligible add options', async () => {
  const inventory = [
    { ...EQ, id: 'pillar', material_name: 'Pillar machine', is_spread_foot_excavation: false, is_pillar_excavation: true, sort_order: 1 },
    { ...EQ, id: 'spread', material_name: 'Spread machine', sort_order: 2 },
    { ...EQ, id: 'non', material_name: 'Non excavation', is_non_excavation_equipment: true },
  ];
  const { c } = await mount({ _id: 'e', equipment_id: 'spread' }, inventory);
  const options = c.root.findAll(el => el.type === 'div' && el.props['data-item']).map(el => el.props['data-item']);
  assert.equal(options.filter(id => id === 'pillar').length, 1, 'pillar only in reassign selector');
  assert.equal(options.filter(id => id === 'spread').length, 2, 'spread eligible plus reassign');
  assert.equal(options.filter(id => id === 'non').length, 2, 'non-excavation plus reassign');
});

await ok('zero-rate and unknown periods; duration preserves quantity override', async () => {
  const { c, calls } = await mount({ _id: 'e', equipment_id: 'eq', rental_period: 'hour', custom_qty: 2 }, [{ ...EQ, cost_per_day: 0 }]);
  assert.ok(text(c).includes('Daily ($0.00/day)'));
  assert.ok(text(c).includes('Review (hour)'));
  const duration = qtyInput(c, 'Rental duration');
  await act(async () => duration.props.onChange({ target: { value: '3' } }));
  assert.equal(calls.updates[0][0].custom_qty, 2);
});

await ok('valid typing reaches shared source and dirty state before blur or keyboard save', async () => {
  const original = freeze({ _id: 'e', equipment_id: 'eq', attachments: [{ id: 'att', qty: 2 }] });
  const { c, calls } = await mount(original);
  await act(async () => qtyInput(c, 'Attachment qty').props.onChange({ target: { value: '3' } }));
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.dirty, 1);
  assert.equal(calls.updates[0][0].attachments[0].qty, 3);
  assert.equal(qtyInput(c, 'Attachment qty').props.value, 3);
  assert.deepEqual(totals(c), ['Total:  $145.00']);
  assert.equal(original.attachments[0].qty, 2, 'original immutable snapshot retained');
});

for (const c of roots) await act(async () => c.unmount());
console.log(`PASS equipment-ui passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
