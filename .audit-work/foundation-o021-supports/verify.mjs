// O-021 / CMP-B07 verification: rebar_support catalog/admin UI.
// Mounts the REAL FoundationMaterialDialog, FoundationInventory page,
// FoundationCatalog page, MasterSuppliesTab and partCatalog module (candidates
// tree) with esbuild. Only ui primitives / lucide / api / persistence edges
// are stubbed — persistence stubs record the exact payloads our code emits.
import esbuild from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = path.resolve('.');
const WORK = '.audit-work/foundation-o021-supports';
const STAGE = path.resolve(`${WORK}/stage/src`);
const OUT = path.resolve(`${WORK}/build`);
fs.mkdirSync(OUT, { recursive: true });

globalThis.window = { confirm: () => true, location: { search: '' }, history: { replaceState() {} }, addEventListener() {}, removeEventListener() {}, alert: (m) => { globalThis.__ALERTS.push(m); } };
globalThis.location = globalThis.window.location;
globalThis.alert = globalThis.window.alert;
globalThis.__CALLS = [];
globalThis.__ALERTS = [];
globalThis.__ENTITIES = {};

// In-memory entity stub: faithful create/update/get/delete + write capture.
globalThis.__mkEntity = (name, rows) => {
  let seq = 0;
  const e = {
    __name: name, __rows: rows,
    get: async (id) => rows.find((r) => r.id === id) || null,
    create: async (data) => {
      const rec = { id: `${name}-new${++seq}`, created_date: 'd1', updated_date: 'd2', ...data };
      rows.push(rec); globalThis.__CALLS.push({ op: 'entity.create', entity: name, data }); return rec;
    },
    update: async (id, data) => {
      const i = rows.findIndex((r) => r.id === id); if (i < 0) throw new Error('missing');
      rows[i] = { ...rows[i], ...data, updated_date: 'd3' };
      globalThis.__CALLS.push({ op: 'entity.update', entity: name, id, data }); return rows[i];
    },
    delete: async (id) => { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); },
    filter: async () => rows.slice(),
  };
  globalThis.__ENTITIES[name] = e;
  return e;
};

const STUBS = {
  '@/api/base44Client': `
    const api = {
      auth: { me: async () => globalThis.__USER || { role: 'admin' } },
      entities: new Proxy({}, { get: (t, k) => globalThis.__ENTITIES[k] }),
    };
    export const base44 = api; export default api;
  `,
  '@/components/staff/staffEntities': `
    export const staffEntities = new Proxy({}, { get: (t, k) => globalThis.__ENTITIES[k] });
  `,
  '@/components/estimator/loadAllEntityRows': `
    export const loadAllEntityRows = async ({ entity }) => (entity && entity.__rows ? entity.__rows.slice() : []);
    export default loadAllEntityRows;
  `,
  '@/components/estimator/builder/builderEntityPersistence': `
    export const expectedEntityFields = () => ({});
    export const replaceEntityFieldsIfUnchanged = async ({ entity, id, nextFields }) => {
      globalThis.__CALLS.push({ op: 'replaceFields', id, nextFields });
      return entity.update(id, nextFields);
    };
    export const deleteEntityIfUnchanged = async ({ entity, record }) => entity.delete(record.id);
  `,
  '@/components/masterInventory/inventoryPersistence': `
    export const createInventoryRecordWithRecovery = async ({ entity, data }) => {
      globalThis.__CALLS.push({ op: 'createRecord', data });
      return entity.create(data);
    };
  `,
  '@/components/estimator/builder/partSync': `
    export const pricingSnapshot = (row) => ({ cost_per_unit: row?.cost_per_unit ?? null });
  `,
  '@/components/ui/dialog': `
    export const Dialog = ({ open, children }) => (open ? <div data-dialog="1">{children}</div> : null);
    export const DialogContent = ({ children }) => <div>{children}</div>;
    export const DialogHeader = ({ children }) => <div>{children}</div>;
    export const DialogTitle = ({ children }) => <div>{children}</div>;
    export const DialogFooter = ({ children }) => <div>{children}</div>;
  `,
  '@/components/ui/button': `export const Button = ({ children, ...p }) => <button {...p}>{children}</button>;`,
  '@/components/ui/input': `export const Input = (p) => <input {...p} />;`,
  '@/components/ui/label': `export const Label = ({ children, ...p }) => <label {...p}>{children}</label>;`,
  '@/components/ui/badge': `export const Badge = ({ children, ...p }) => <span {...p}>{children}</span>;`,
  '@/components/ui/card': `
    export const Card = ({ children, ...p }) => <div {...p}>{children}</div>;
    export const CardContent = ({ children, ...p }) => <div {...p}>{children}</div>;
    export const CardHeader = ({ children, ...p }) => <div {...p}>{children}</div>;
    export const CardTitle = ({ children, ...p }) => <div {...p}>{children}</div>;
  `,
  '@/components/ui/select': `
    import React from "react";
    export const SelectItem = () => null; SelectItem.__isItem = true;
    export const Select = ({ value, onValueChange, children }) => {
      const items = [];
      const walk = (n) => React.Children.forEach(n, (c) => {
        if (!c || typeof c !== "object" || !c.props) return;
        if (c.type && c.type.__isItem) items.push(c); else walk(c.props.children);
      });
      walk(children);
      return (
        <select data-stub="radix-select" value={value == null ? "" : value}
          onChange={(e) => onValueChange && onValueChange(e.target.value)}>
          {items.map((c, i) => <option key={i} value={c.props.value}>{c.props.children}</option>)}
        </select>
      );
    };
    export const SelectTrigger = () => null;
    export const SelectContent = ({ children }) => <div>{children}</div>;
    export const SelectValue = () => null;
  `,
  '@/components/ui/tabs': `
    export const Tabs = ({ value, children }) => <div data-tabs={value}>{children}</div>;
    export const TabsList = ({ children }) => <div>{children}</div>;
    export const TabsTrigger = ({ value, children, ...p }) => <button data-tab={value} {...p}>{children}</button>;
    export const TabsContent = ({ value, children }) => <div data-tabcontent={value}>{children}</div>;
  `,
  '@/components/ui/switch': `export const Switch = ({ checked, onCheckedChange }) => <button data-switch={String(!!checked)} onClick={() => onCheckedChange && onCheckedChange(!checked)} />;`,
  '@/components/ui/list-skeleton': `export const ListSkeleton = () => null;`,
  '@/components/foundation/EquipmentInventoryTab': `export default () => null;`,
  '@/components/foundation/WallCapsInventoryTab': `export default () => null;`,
  'react-router-dom': `
    export const Link = ({ children, to, ...p }) => <a href={to} {...p}>{children}</a>;
    export const useNavigate = () => () => {};
  `,
  'lucide-react': `
    const I = () => null;
    export const Trash2=I,Plus=I,Edit=I,Package=I,Building2=I,Layers=I,Wrench=I,Square=I,ArrowLeft=I,Pencil=I,Search=I;
    export default I;
  `,
};

const plug = {
  name: 'stage',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => {
      if (STUBS[a.path]) return { path: 's://' + a.path, namespace: 's' };
      if (a.path.startsWith('@/')) {
        const p = path.resolve(STAGE, a.path.slice(2));
        for (const ext of ['.jsx', '.js']) if (fs.existsSync(p + ext)) return { path: p + ext };
        return { path: p };
      }
      if (a.path.startsWith('.')) {
        const abs = path.resolve(path.dirname(a.importer), a.path);
        const rel = path.relative(STAGE, abs).replace(/\\/g, '/');
        if (STUBS['@/' + rel]) return { path: 's://@/' + rel, namespace: 's' };
        for (const ext of ['', '.jsx', '.js']) if (fs.existsSync(abs + ext)) return { path: abs + ext };
        return { path: abs };
      }
      return undefined;
    });
    b.onLoad({ filter: /.*/, namespace: 's' }, (a) => ({ contents: STUBS[a.path.slice(4)], loader: 'jsx', resolveDir: ROOT }));
  },
};
const build = (entry, out) => esbuild.build({
  entryPoints: [path.resolve(STAGE, entry)], bundle: true, format: 'esm',
  external: ['react', 'react-test-renderer', 'scheduler', 'scheduler/*'],
  plugins: [plug], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic', outfile: out,
});

// Entities must exist BEFORE bundle import: several modules capture
// `staffEntities.FoundationInventory` at module scope (Proxy resolves once).
globalThis.__mkEntity('FoundationInventory', []);
globalThis.__mkEntity('ChannelLetterInstallInventory', []);
const resetRows = (name, rows) => {
  const e = globalThis.__ENTITIES[name] || globalThis.__mkEntity(name, []);
  e.__rows.splice(0, e.__rows.length, ...rows);
  return e;
};

await build('components/masterInventory/foundationFieldSchema.js', `${OUT}/schema.mjs`);
await build('components/masterInventory/inventoryNormalization.js', `${OUT}/norm.mjs`);
await build('components/masterInventory/FoundationMaterialDialog.jsx', `${OUT}/dialog.mjs`);
await build('pages/FoundationInventory.jsx', `${OUT}/page.mjs`);
await build('pages/FoundationCatalog.jsx', `${OUT}/catalog.mjs`);
await build('components/masterInventory/MasterSuppliesTab.jsx', `${OUT}/supplies.mjs`);
await build('components/estimator/parts/partCatalog.js', `${OUT}/parts.mjs`);

const schema = await import(pathToFileURL(`${OUT}/schema.mjs`));
const norm = await import(pathToFileURL(`${OUT}/norm.mjs`));
const Dialog = (await import(pathToFileURL(`${OUT}/dialog.mjs`))).default;
const Page = (await import(pathToFileURL(`${OUT}/page.mjs`))).default;
const Catalog = (await import(pathToFileURL(`${OUT}/catalog.mjs`))).default;
const Supplies = (await import(pathToFileURL(`${OUT}/supplies.mjs`))).default;
const parts = await import(pathToFileURL(`${OUT}/parts.mjs`));
const React = (await import('react')).default;
const { create, act } = await import('react-test-renderer');
const { MATERIAL_TYPES, fieldsFor, typeLabel, listFieldDraft, listFieldValue } = schema;
const { inventoryNumberInput } = norm;

const mounted = [];
const mount = async (Comp, props) => {
  let c;
  await act(async () => { c = create(React.createElement(Comp, props)); for (let i = 0; i < 20; i++) await Promise.resolve(); });
  mounted.push(c);
  return c;
};
const text = (node) => {
  const t = [];
  const walk = (n) => { if (n == null || typeof n === 'boolean') return; if (typeof n === 'string' || typeof n === 'number') t.push(String(n)); else if (Array.isArray(n)) n.forEach(walk); else if (n.children) walk(n.children); else if (n.props?.children) walk(n.props.children); };
  walk(node && node.toJSON ? node.toJSON() : node);
  return t.join(' ');
};
const inst = (n) => text(n); // test-instance-friendly alias
const squash = (s) => s.replace(/\s+/g, '');
const inputsByName = (c) => {
  const map = {};
  // label elements wrap text + one control; associate label text -> control
  for (const el of c.root.findAll((e) => e.type === 'label' || (e.type === 'div' && e.props?.className?.includes('col-span')))) {
    const control = el.findAll((x) => x.type === 'input' || x.type === 'select')[0];
    if (!control) continue;
    const lbl = text(el.toJSON ? el.toJSON() : el).trim();
    if (lbl) map[lbl] = control;
  }
  return map;
};

let passed = 0, failed = 0;
const ok = async (name, fn) => {
  try { await fn(); passed++; console.log('ok', name); }
  catch (e) { failed++; console.log('FAIL', name, '-', String(e?.stack || e)); }
  finally { globalThis.__CALLS = []; await act(async () => { for (const c of mounted.splice(0)) c.unmount(); }); }
};

// ── Fixtures ────────────────────────────────────────────────────────────────
const SUPPORT = {
  id: 'sup1', material_name: 'BB-5 Bar Chair', material_type: 'rebar_support',
  material_description: '5in bar chair', supplier: 'Dayton', unit: 'each',
  cost_per_unit: 0.42,
  rebar_support_kind: 'chair', rebar_support_height_inches: 5,
  rebar_support_height_min_inches: null, rebar_support_height_max_inches: null,
  rebar_support_footprint_length_inches: 4.5, rebar_support_footprint_width_inches: 3,
  rebar_support_material: 'plastic', rebar_support_pack_size: 100,
  rebar_support_compatible_bar_sizes: ['#3', '#4'],
  rebar_support_placement_notes: 'not for on-grade slabs',
  notes: 'keep', show_in_foundation: true,
  created_date: 'd0', updated_date: 'd1',
};
const REBAR = { id: 'rb1', material_name: '#4 Rebar 20ft', material_type: 'rebar', rebar_size: '#4', cost_per_unit: 9.5, unit: 'lf', created_date: 'd0', updated_date: 'd1' };

// ═══ A. Model layer ═══
await ok('A1 MATERIAL_TYPES exposes rebar_support next to rebar; typeLabel resolves', async () => {
  const idx = MATERIAL_TYPES.findIndex((t) => t.value === 'rebar_support');
  assert.ok(idx === MATERIAL_TYPES.findIndex((t) => t.value === 'rebar') + 1, 'rebar_support immediately follows rebar');
  assert.equal(typeLabel('rebar_support'), 'Rebar Support');
});

await ok('A2 fieldsFor(rebar_support) covers every rebar_support_* entity field + COMMON', async () => {
  const entitySchema = fs.readFileSync(`${WORK}/remote/FoundationInventory.jsonc`, 'utf8');
  const entityKeys = [...entitySchema.matchAll(/"(rebar_support_[a-z_]+)":/g)].map((m) => m[1]);
  assert.equal(entityKeys.length, 10, `entity has 10 rebar_support_* fields (found ${entityKeys.length})`);
  const keys = fieldsFor('rebar_support').map((f) => f.key);
  for (const k of entityKeys) assert.ok(keys.includes(k), `field schema missing ${k}`);
  for (const k of ['material_name', 'material_description', 'supplier', 'unit', 'cost_per_unit']) assert.ok(keys.includes(k), `common field ${k}`);
  const kind = fieldsFor('rebar_support').find((f) => f.key === 'rebar_support_kind');
  assert.equal(kind.type, 'select');
  assert.deepEqual(kind.options.map((o) => o.value), ['chair', 'stand', 'bolster']);
  const list = fieldsFor('rebar_support').find((f) => f.key === 'rebar_support_compatible_bar_sizes');
  assert.equal(list.type, 'list');
});

await ok('A3 listFieldDraft/listFieldValue boundary semantics', async () => {
  assert.equal(listFieldDraft(['#3', '#4']), '#3, #4');
  assert.equal(listFieldDraft(null), '');
  assert.equal(listFieldDraft(undefined), '');
  assert.equal(listFieldDraft('raw'), 'raw');
  assert.equal(listFieldDraft(42), 42);
  assert.deepEqual(listFieldValue('#3, #4'), ['#3', '#4']);
  assert.deepEqual(listFieldValue(''), []);
  assert.deepEqual(listFieldValue('  ,  '), []);
  const arr = ['#5']; assert.equal(listFieldValue(arr), arr);
  assert.equal(listFieldValue(42), 42, 'malformed stored value stays verbatim');
  assert.equal(listFieldValue(undefined), undefined);
  // inventoryNumberInput reuse: blank->null, numeric->Number, malformed->verbatim, 0 honored
  assert.equal(inventoryNumberInput(''), null);
  assert.equal(inventoryNumberInput('4.5'), 4.5);
  assert.equal(inventoryNumberInput('abc'), 'abc');
  assert.equal(inventoryNumberInput('0'), 0);
});

// ═══ B. Real FoundationMaterialDialog (FoundationCatalog host) ═══
await ok('B1 dialog create: all 10 support fields render labeled; round-trip on save', async () => {
  resetRows('FoundationInventory', []);
  const saved = [];
  const c = await mount(Dialog, { open: true, record: null, defaultType: 'rebar_support', onClose: () => {}, onSaved: () => saved.push(1) });
  const t = text(c);
  for (const lbl of ['Kind', 'Height (in)', 'Height min', 'Height max', 'Footprint length', 'Footprint width', 'Material (steel', 'Pack size', 'Compatible bar sizes', 'Placement notes']) {
    assert.ok(t.includes(lbl), `label "${lbl}" rendered`);
  }
  const byLabel = inputsByName(c);
  const set = (lbl, v) => { const el = byLabel[lbl] || Object.entries(byLabel).find(([k]) => k.includes(lbl))?.[1]; assert.ok(el, `control for ${lbl}`); el.props.onChange({ target: { value: v } }); };
  await act(async () => {
    set('Name', 'BB-5 Bar Chair');
    const kindSel = c.root.findAll((e) => e.type === 'select').find((s) => (s.props.value === '' || s.props.value === null) && s.findAll((e2) => e2.type === 'option' && e2.props.value === 'chair').length);
    assert.ok(kindSel, 'kind select rendered');
    kindSel.props.onChange({ target: { value: 'chair' } });
    set('Height (in)', '5');
    set('Pack size', '100');
    set('Cost per unit', '0.42');
    set('Compatible bar sizes', '#3, #4');
    set('Material (steel', 'plastic');
    set('Placement notes', 'not for on-grade');
  });
  await act(async () => {
    const saveBtn = c.root.findAll((e) => e.type === 'button').find((b) => text(b.toJSON ? b.toJSON() : b).includes('Save'));
    saveBtn.props.onClick();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  const create = globalThis.__CALLS.find((x) => x.op === 'createRecord' || x.op === 'entity.create');
  assert.ok(create, 'create payload recorded');
  const d = create.data;
  assert.equal(d.material_type, 'rebar_support');
  assert.equal(d.material_name, 'BB-5 Bar Chair');
  assert.equal(d.rebar_support_kind, 'chair');
  assert.equal(d.rebar_support_height_inches, 5);
  assert.equal(d.rebar_support_pack_size, 100);
  assert.equal(d.cost_per_unit, 0.42);
  assert.deepEqual(d.rebar_support_compatible_bar_sizes, ['#3', '#4']);
  assert.equal(d.rebar_support_material, 'plastic');
  assert.equal(d.rebar_support_placement_notes, 'not for on-grade');
  assert.equal(d.show_in_foundation, true);
  assert.ok(saved.length === 1, 'onSaved fired');
});

await ok('B2 dialog edit: stored values render; untouched fields round-trip verbatim', async () => {
  const rows = [JSON.parse(JSON.stringify(SUPPORT))];
  resetRows('FoundationInventory', rows);
  const c = await mount(Dialog, { open: true, record: rows[0], defaultType: 'rebar_support', onClose: () => {}, onSaved: () => {} });
  const byLabel = inputsByName(c);
  const val = (lbl) => (Object.entries(byLabel).find(([k]) => k.includes(lbl)) || [])[1]?.props.value;
  assert.equal(Number(val('Height (in)')), 5);
  assert.equal(val('Compatible bar sizes'), '#3, #4', 'stored array renders as comma draft');
  const kindSel = c.root.findAll((e) => e.type === 'select').find((s) => s.props.value === 'chair');
  assert.ok(kindSel, 'kind select shows stored chair');
  // change only pack size, save
  await act(async () => {
    const pack = Object.entries(byLabel).find(([k]) => k.includes('Pack size'))[1];
    pack.props.onChange({ target: { value: '250' } });
  });
  await act(async () => {
    c.root.findAll((e) => e.type === 'button').find((b) => text(b.toJSON ? b.toJSON() : b).includes('Save')).props.onClick();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  const rep = globalThis.__CALLS.find((x) => x.op === 'replaceFields');
  assert.ok(rep, 'edit path goes through replaceEntityFieldsIfUnchanged');
  const d = rep.nextFields;
  assert.equal(d.rebar_support_pack_size, 250);
  assert.equal(d.rebar_support_kind, 'chair');
  assert.equal(d.rebar_support_height_inches, 5);
  assert.deepEqual(d.rebar_support_compatible_bar_sizes, ['#3', '#4'], 'untouched list stays array');
  assert.equal(d.rebar_support_placement_notes, 'not for on-grade slabs');
});

await ok('B3 dialog fail-closed: malformed numeric stays verbatim; blank -> null; explicit 0 honored', async () => {
  const rows = [JSON.parse(JSON.stringify(SUPPORT))];
  resetRows('FoundationInventory', rows);
  const c = await mount(Dialog, { open: true, record: rows[0], defaultType: 'rebar_support', onClose: () => {}, onSaved: () => {} });
  const byLabel = inputsByName(c);
  const set = (lbl, v) => { const el = Object.entries(byLabel).find(([k]) => k.includes(lbl))?.[1]; assert.ok(el, lbl); el.props.onChange({ target: { value: v } }); };
  await act(async () => {
    set('Height (in)', 'abc');            // malformed -> verbatim
    set('Footprint length', '');          // blank -> null
    set('Cost per unit', '0');            // explicit free price honored
    set('Compatible bar sizes', '');      // blank list -> []
  });
  await act(async () => {
    c.root.findAll((e) => e.type === 'button').find((b) => text(b.toJSON ? b.toJSON() : b).includes('Save')).props.onClick();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  const d = globalThis.__CALLS.find((x) => x.op === 'replaceFields').nextFields;
  assert.equal(d.rebar_support_height_inches, 'abc', 'malformed verbatim (not NaN/0)');
  assert.equal(d.rebar_support_footprint_length_inches, null, 'blank clears to null');
  assert.equal(d.cost_per_unit, 0, 'explicit 0 honored');
  assert.deepEqual(d.rebar_support_compatible_bar_sizes, [], 'blank list -> []');
});

await ok('B4 dialog verbatim: stored malformed list + unknown kind are not remapped', async () => {
  const weird = { ...SUPPORT, rebar_support_compatible_bar_sizes: 42, rebar_support_kind: 'wedge' };
  const rows = [JSON.parse(JSON.stringify(weird))];
  resetRows('FoundationInventory', rows);
  const c = await mount(Dialog, { open: true, record: rows[0], defaultType: 'rebar_support', onClose: () => {}, onSaved: () => {} });
  const byLabel = inputsByName(c);
  assert.equal(Object.entries(byLabel).find(([k]) => k.includes('Compatible'))?.[1]?.props.value, 42, 'malformed stored list renders verbatim');
  const kindSel = c.root.findAll((e) => e.type === 'select').find((s) => s.props.value === 'wedge');
  assert.ok(kindSel, 'unknown stored kind shown verbatim (not remapped to chair)');
  await act(async () => {
    c.root.findAll((e) => e.type === 'button').find((b) => text(b.toJSON ? b.toJSON() : b).includes('Save')).props.onClick();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  const d = globalThis.__CALLS.find((x) => x.op === 'replaceFields').nextFields;
  assert.equal(d.rebar_support_compatible_bar_sizes, 42, 'untouched malformed list stays verbatim');
  assert.equal(d.rebar_support_kind, 'wedge', 'untouched unknown kind stays verbatim');
});

// ═══ C. Real FoundationCatalog page (chips + dialog host) ═══
await ok('C1 catalog page: rebar_support chip with count; list shows priced row', async () => {
  const rows = [JSON.parse(JSON.stringify(SUPPORT)), { ...REBAR }];
  resetRows('FoundationInventory', rows);
  const c = await mount(Catalog, {});
  const t = text(c);
  assert.ok(squash(t).includes('RebarSupport(1)'), `chip label + count in "${t.slice(0, 200)}"`);
  const chip = c.root.findAll((e) => e.type === 'button' && e.props.role === 'tab').find((b) => squash(text(b)).includes('RebarSupport'));
  assert.ok(chip, 'chip button');
  await act(async () => { chip.props.onClick(); });
  const t2 = text(c);
  assert.ok(t2.includes('BB-5 Bar Chair'), 'support row visible under its chip');
  assert.ok(!t2.includes('#4 Rebar 20ft'), 'rebar rows not mixed in');
});

// ═══ D. Real FoundationInventory page (tabs + GenericItemForm) ═══
await ok('D1 page: Supports tab lists support rows only, shows kind/height/cost', async () => {
  const rows = [JSON.parse(JSON.stringify(SUPPORT)), { ...REBAR }];
  resetRows('FoundationInventory', rows);
  globalThis.__USER = { role: 'admin' };
  const c = await mount(Page, { embedded: true });
  const supportsPane = c.root.findAll((e) => e.props && e.props['data-tabcontent'] === 'supports')[0];
  assert.ok(supportsPane, 'supports tab content rendered');
  const st = inst(supportsPane);
  assert.ok(st.includes('BB-5 Bar Chair'), 'support row listed');
  assert.ok(!st.includes('#4 Rebar 20ft'), 'rebar row not in supports tab');
  assert.ok(st.toLowerCase().includes('chair'), 'kind shown');
  assert.ok(st.includes('5'), 'height shown');
  const rebarPane = c.root.findAll((e) => e.props && e.props['data-tabcontent'] === 'rebar')[0];
  assert.ok(!inst(rebarPane).includes('BB-5 Bar Chair'), 'support row not under rebar');
});

await ok('D2 page edit form: stored values render; list draft + optional select; save round-trips', async () => {
  const rows = [JSON.parse(JSON.stringify(SUPPORT))];
  resetRows('FoundationInventory', rows);
  const c = await mount(Page, { embedded: true });
  const supportsPane = c.root.findAll((e) => e.props && e.props['data-tabcontent'] === 'supports')[0];
  const editBtn = supportsPane.findAll((e) => e.type === 'button').find((b) => b.props.onClick && !inst(b).trim());
  await act(async () => { editBtn.props.onClick(); });
  const dialog = c.root.findAll((e) => e.props && e.props['data-dialog'] === '1')[0];
  assert.ok(dialog, 'edit dialog opened');
  const dt = inst(dialog);
  assert.ok(dt.includes('Edit Rebar Support'), 'dialog titled for support type');
  const inputs = dialog.findAll((e) => e.type === 'input');
  const byVal = (v) => inputs.find((i) => i.props.value === v);
  assert.ok(byVal('BB-5 Bar Chair'), 'name prefilled');
  const listInput = inputs.find((i) => i.props.value === '#3, #4');
  assert.ok(listInput, 'stored array renders as comma draft');
  const kindSel = dialog.findAll((e) => e.type === 'select').find((s) => s.props.value === 'chair');
  assert.ok(kindSel, 'kind select shows chair');
  const sentinel = kindSel.findAll((e) => e.type === 'option').find((o) => o.props.value === '__unspecified__');
  assert.ok(sentinel, 'optional select exposes not-specified sentinel');
  // flip kind to bolster + rewrite list
  await act(async () => {
    kindSel.props.onChange({ target: { value: 'bolster' } });
    listInput.props.onChange({ target: { value: '#4, #5' } });
  });
  await act(async () => {
    dialog.findAll((e) => e.type === 'button').find((b) => inst(b) === 'Save').props.onClick();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  const d = globalThis.__CALLS.find((x) => x.op === 'replaceFields').nextFields;
  assert.equal(d.rebar_support_kind, 'bolster');
  assert.deepEqual(d.rebar_support_compatible_bar_sizes, ['#4', '#5']);
  assert.equal(d.rebar_support_height_inches, 5, 'untouched numbers round-trip');
  assert.equal(d.material_type, 'rebar_support');
});

await ok('D3 page add form: metadata defaults null (not 0); kind untyped; save shape', async () => {
  resetRows('FoundationInventory', []);
  const c = await mount(Page, { embedded: true });
  const supportsPane = c.root.findAll((e) => e.props && e.props['data-tabcontent'] === 'supports')[0];
  const addBtn = supportsPane.findAll((e) => e.type === 'button').find((b) => inst(b).replace(/\s+/g, ' ').includes('Add Rebar Support'));
  assert.ok(addBtn, 'Add Rebar Support button');
  await act(async () => { addBtn.props.onClick(); });
  const dialog = c.root.findAll((e) => e.props && e.props['data-dialog'] === '1')[0];
  const kindSel = dialog.findAll((e) => e.type === 'select').find((s) => s.props.value === '__unspecified__');
  assert.ok(kindSel, 'new support kind defaults to not-specified');
  await act(async () => {
    const inputs = dialog.findAll((e) => e.type === 'input');
    inputs.find((i) => i.props.value === '').props.onChange({ target: { value: 'Slab Bolster 2in' } });
  });
  await act(async () => {
    dialog.findAll((e) => e.type === 'button').find((b) => inst(b) === 'Save').props.onClick();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  const d = globalThis.__CALLS.find((x) => x.op === 'createRecord' || x.op === 'entity.create').data;
  assert.equal(d.material_type, 'rebar_support');
  assert.equal(d.material_name, 'Slab Bolster 2in');
  assert.equal(d.rebar_support_kind, null, 'untyped kind stays null (never a guessed chair)');
  assert.equal(d.rebar_support_height_inches, null, 'metadata defaults null, not fabricated 0');
  assert.equal(d.rebar_support_pack_size, null);
  assert.deepEqual(d.rebar_support_compatible_bar_sizes, [], 'untouched list -> []');
});

// ═══ E. Real MasterSuppliesTab ═══
await ok('E1 supplies tab: rebar_support row visible; edit round-trips ALL metadata', async () => {
  resetRows('ChannelLetterInstallInventory', []);
  const rows = [JSON.parse(JSON.stringify(SUPPORT)), { ...REBAR }];
  resetRows('FoundationInventory', rows);
  const c = await mount(Supplies, { isAdmin: true });
  const t = text(c);
  assert.ok(t.includes('BB-5 Bar Chair'), 'support row listed in supplies');
  assert.ok(t.includes('rebar support'), 'subtype badge shows rebar support');
  // open edit on the support row
  const row = c.root.findAll((e) => e.type === 'tr').find((r) => inst(r).includes('BB-5'));
  const editBtn = row.findAll((e) => e.type === 'button').find((b) => b.props.variant === 'ghost');
  await act(async () => { editBtn.props.onClick(); });
  const dialog = c.root.findAll((e) => e.props && e.props['data-dialog'] === '1')[0];
  assert.ok(dialog, 'edit supply dialog opened');
  await act(async () => {
    dialog.findAll((e) => e.type === 'button').find((b) => inst(b) === 'Save').props.onClick();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  const d = globalThis.__CALLS.find((x) => x.op === 'replaceFields').nextFields;
  for (const k of ['rebar_support_kind', 'rebar_support_height_inches', 'rebar_support_footprint_length_inches',
    'rebar_support_footprint_width_inches', 'rebar_support_material', 'rebar_support_pack_size',
    'rebar_support_compatible_bar_sizes', 'rebar_support_placement_notes']) {
    assert.ok(k in d, `passThrough retains ${k} (was data-loss path)`);
    assert.deepEqual(d[k], SUPPORT[k], `${k} unchanged`);
  }
});

// ═══ F. partCatalog (master part picker lists) ═══
await ok('F1 part catalog: rebar_support rows enter supplies + concrete_stone', async () => {
  resetRows('FoundationInventory', [JSON.parse(JSON.stringify(SUPPORT)), { ...REBAR }]);
  for (const n of ['DimensionalLetterMaterial', 'ChannelLetterInstallEquipment', 'VinylInventory', 'SignLightingInventory', 'SignHardwareInventory', 'LaborServiceInventory', 'SignPartsSuppliesInventory', 'Inventory']) resetRows(n, []);
  resetRows('ChannelLetterInstallInventory', []);
  const list = await parts.loadMasterPartCatalog();
  const sup = list.find((i) => i.inventoryId === 'sup1');
  assert.ok(sup, 'support row present in master part catalog');
  assert.deepEqual(sup.categories.map((x) => x.key).sort(), ['concrete_stone', 'supplies']);
  assert.equal(sup.unitCost, 0.42, 'unit cost from cost_per_unit (no guess)');
  const details = parts.typeDetails('FoundationInventory', SUPPORT);
  const dl = details.map((d) => d.label);
  assert.ok(dl.includes('Support'), 'kind shown in type details');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
