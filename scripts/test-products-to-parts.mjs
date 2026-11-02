import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-p2p.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/jobs/productsToPartsModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  productParts, partsSummary, expandableRows, missingPartRefs,
  bucketForPartType, productRowId, embeddedPartList, catalogRows,
  PART_TYPE_BUCKETS,
} = await import(pathToFileURL(out).href);

const deepFreeze = (o) => {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

// ── snapshot normalization + dollar→cents ──────────────────────────────────
{
  const product = {
    id: 'p1',
    parts: [
      { builder_part_id: 'bp1', part_key: 'k1', part_name: 'ACM Panel', part_type: 'material', quantity: 4, unit: 'sheet', unit_cost: 42.5, extended_cost: 170 },
      { builder_part_id: 'bp2', part_name: 'Install labor', part_type: 'labor', quantity: 2, unit: 'hour', unit_cost: 85, extended_cost: 170 },
    ],
  };
  const rows = productParts(product);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].part_id, 'bp1');
  assert.equal(rows[0].part_key, 'k1');
  assert.equal(rows[0].name, 'ACM Panel');
  assert.equal(rows[0].part_type, 'material');
  assert.equal(rows[0].type_bucket, 'materials');
  assert.equal(rows[0].quantity, 4);
  assert.equal(rows[0].unit, 'sheet');
  assert.equal(rows[0].unit_cost_cents, 4250, 'dollars → integer cents');
  assert.equal(rows[0].extended_cents, 17000);
  assert.equal(rows[0].source, 'snapshot');
  assert.equal(rows[0].enriched, false);
  assert.equal(rows[1].type_bucket, 'labor');
}

// ── embedded precedence: parts > part_list/builder_parts/line_items/materials
{
  const product = {
    id: 'p2',
    parts: [{ part_name: 'FromParts', part_type: 'material', quantity: 1 }],
    line_items: [{ part_name: 'FromLineItems', quantity: 9 }],
    materials: [{ part_name: 'FromMaterials', quantity: 9 }],
    builder_parts: [{ part_name: 'FromBuilderParts', quantity: 9 }],
  };
  const rows = productParts(product);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'FromParts', 'first non-empty embedded list wins');
  assert.equal(embeddedPartList(product).field, 'parts');
}
{
  const product = {
    id: 'p3',
    parts: [],
    line_items: [{ line_id: 'li1', description: 'Sub line', part_type: 'service', qty: 3, unit_price: 10, line_total: 30 }],
  };
  const rows = productParts(product);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'snapshot');
  assert.equal(rows[0].quantity, 3);
  assert.equal(rows[0].extended_cents, 3000);
  assert.equal(embeddedPartList(product).field, 'line_items');
}
{
  const product = {
    id: 'p4',
    builder_snapshot: { parts: [{ part_name: 'SnapPart', part_type: 'equipment', quantity: 1, unit_cost: 500 }] },
  };
  const rows = productParts(product);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'SnapPart');
  assert.equal(embeddedPartList(product).field, 'builder_snapshot.parts');
}
// parts as an id-keyed map (proofPipelineModel shape).
{
  const product = {
    id: 'p5',
    parts: {
      abc: { part_id: 'abc', part_name: 'Mapped Part', part_type: 'material', quantity: 2, unit_cost: 5 },
    },
  };
  const rows = productParts(product);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].part_id, 'abc');
  assert.equal(rows[0].extended_cents, 1000, 'extended derives from unit×qty');
}

// ── derivation legs + direct cents precedence ──────────────────────────────
{
  const [a] = productParts({ id: 'x', parts: [{ part_name: 'A', quantity: 4, unit_cost: 2.5 }] });
  assert.equal(a.extended_cents, 1000, 'extended = unit×qty when no explicit extended');
  const [b] = productParts({ id: 'x', parts: [{ part_name: 'B', quantity: 4, extended_cost: 10 }] });
  assert.equal(b.unit_cost_cents, 250, 'unit derives from extended/qty');
  const [c] = productParts({ id: 'x', parts: [{ part_name: 'C', quantity: 2, unit_cost: 9, unit_cost_cents: 111 }] });
  assert.equal(c.unit_cost_cents, 111, '*_cents field beats dollar field');
  const [d] = productParts({ id: 'x', parts: [{ part_name: 'D', quantity: 0, part_type: 'material' }] });
  assert.equal(d.unit_cost_cents, null, 'absent cost stays null, not 0');
  assert.equal(d.extended_cents, null);
}

// ── is_active / deleted rows dropped; QuickProduct part_price combo ────────
{
  const product = {
    id: 'p6',
    parts: [
      { part_name: 'Live', quantity: 1, unit_cost: 1 },
      { part_name: 'Dead', quantity: 1, unit_cost: 1, is_active: false },
      { part_name: 'Gone', quantity: 1, unit_cost: 1, deleted: true },
    ],
  };
  assert.equal(productParts(product).length, 1);
  const [qp] = productParts({
    id: 'p7',
    parts: [{ part_label: 'Channel Letters', part_type: 'fabrication', part_qty: 2, part_price: 100, modifier_price: 25 }],
  });
  assert.equal(qp.name, 'Channel Letters');
  assert.equal(qp.extended_cents, 12500, 'QuickProduct part_price+modifier_price = line total');
  assert.equal(qp.type_bucket, 'materials', 'fabrication → materials bucket');
}

// ── catalog enrichment: missing name/cost filled, source stays snapshot ────
{
  const catalog = [
    { id: 'bp10', part_name: 'Catalog Name', part_type: 'material', quantity: 1, unit: 'each', frozen_unit_cost: 7.5, frozen_extended_cost: 7.5 },
  ];
  const product = {
    id: 'p8',
    parts: [
      { builder_part_id: 'bp10', quantity: 4 }, // name + costs all missing
      { part_id: 'nope', quantity: 1 },          // no catalog match
    ],
  };
  const rows = productParts(product, { partsCatalog: catalog });
  assert.equal(rows[0].name, 'Catalog Name', 'name enriched from catalog');
  assert.equal(rows[0].unit_cost_cents, 750, 'cost enriched from catalog');
  assert.equal(rows[0].extended_cents, 750);
  assert.equal(rows[0].source, 'snapshot', 'enriched row still snapshot-sourced');
  assert.equal(rows[0].enriched, true);
  assert.ok(rows[0].enriched_fields.includes('name'));
  assert.equal(rows[1].name, '', 'unmatched snapshot row keeps blanks');
  assert.equal(rows[1].unit_cost_cents, null);
  assert.equal(rows[1].enriched, false);
}

// ── catalog fallback when no embedded list ────────────────────────────────
{
  const catalog = [
    { id: 'bp1', builder_product_id: 'bprod1', part_name: 'Panel', part_type: 'material', quantity: 2, unit: 'sheet', frozen_unit_cost: 40, frozen_extended_cost: 80 },
    { id: 'bp2', builder_product_id: 'bprod1', part_name: 'Torch', part_type: 'equipment', quantity: 1, unit: 'day', frozen_unit_cost: 150, frozen_extended_cost: 150, is_active: false },
    { id: 'bp3', estimate_line_id: 'line9', part_name: 'Crew', part_type: 'labor', quantity: 3, unit: 'hour', frozen_unit_cost: 70, frozen_extended_cost: 210 },
    { id: 'bp4', builder_product_id: 'other', part_name: 'Stray', part_type: 'material', quantity: 1 },
  ];
  const byBp = productParts({ id: 'p9', builder_product_id: 'bprod1' }, { partsCatalog: catalog });
  assert.equal(byBp.length, 1, 'links on builder_product_id; inactive excluded');
  assert.equal(byBp[0].source, 'catalog');
  assert.equal(byBp[0].extended_cents, 8000);
  const byLine = productParts({ id: 'p10', estimate_line_id: 'line9' }, { partsCatalog: catalog });
  assert.equal(byLine.length, 1);
  assert.equal(byLine[0].name, 'Crew');
  // product.id IS the estimate line id (conversion seeds id = builder_product_id || line_id).
  const byId = productParts({ id: 'line9' }, { partsCatalog: catalog });
  assert.equal(byId.length, 1, 'product.id doubles as a link key');
  // WO materials-manifest rows as the catalog (builder_product_id provenance).
  const manifest = [
    { builder_part_id: 'm1', builder_product_id: 'bp-x', part_name: 'Steel', part_type: 'material', quantity: 5, unit_cost: 3, extended_cost: 15, estimate_line_id: 'L1' },
  ];
  const [m] = productParts({ id: 'px', builder_product_id: 'bp-x' }, { partsCatalog: manifest });
  assert.equal(m.part_id, 'm1');
  assert.equal(m.source, 'catalog');
  // Map + id-keyed object catalog forms.
  assert.equal(productParts({ id: 'line9' }, { partsCatalog: new Map(catalog.map((r) => [r.id, r])) }).length, 1);
  assert.equal(catalogRows({ a: { id: 'a' }, b: { id: 'b' } }).length, 2, 'id-keyed object catalog');
  assert.equal(productParts({ id: 'line9' }, { partsCatalog: [] }).length, 0);
}

// ── never mutate input ────────────────────────────────────────────────────
{
  const product = deepFreeze({
    id: 'p11',
    parts: [{ part_id: 'bp10', quantity: 2 }],
    part_ids: ['z1'],
  });
  const catalog = deepFreeze([{ id: 'bp10', part_name: 'X', frozen_unit_cost: 1 }]);
  const rows = productParts(product, { partsCatalog: catalog });
  assert.equal(rows[0].enriched, true, 'frozen input still resolves');
  expandableRows([product], { expanded_ids: true, partsCatalog: catalog });
  missingPartRefs(product, catalog);
  assert.equal(product.parts[0].name, undefined, 'input object untouched');
}

// ── manual_cost_override wins on catalog rows ─────────────────────────────
{
  const catalog = [{ id: 'bp20', part_name: 'Override', part_type: 'material', quantity: 1, frozen_unit_cost: 10, manual_cost_override: true, manual_cost: 33 }];
  const [r] = productParts({ id: 'x', parts: [{ builder_part_id: 'bp20', quantity: 1 }] }, { partsCatalog: catalog });
  assert.equal(r.unit_cost_cents, 3300, 'manual override outranks frozen');
}

// ── bucketForPartType ─────────────────────────────────────────────────────
{
  assert.equal(bucketForPartType('material'), 'materials');
  assert.equal(bucketForPartType('Fabrication'), 'materials');
  assert.equal(bucketForPartType('labor'), 'labor');
  assert.equal(bucketForPartType('service'), 'labor');
  assert.equal(bucketForPartType('installation'), 'labor');
  assert.equal(bucketForPartType('design_production'), 'labor');
  assert.equal(bucketForPartType('equipment'), 'equipment');
  assert.equal(bucketForPartType('permit'), 'other');
  assert.equal(bucketForPartType(''), 'other');
  assert.equal(bucketForPartType('weird_thing'), 'other');
  assert.deepEqual(PART_TYPE_BUCKETS, ['materials', 'labor', 'equipment', 'other']);
}

// ── partsSummary ──────────────────────────────────────────────────────────
{
  const product = {
    id: 'p12',
    parts: [
      { part_name: 'A', part_type: 'material', quantity: 2, unit_cost: 10 },   // 2000
      { part_name: 'B', part_type: 'equipment', quantity: 1, unit_cost: 50 },  // 5000
      { part_name: 'C', part_type: 'labor', quantity: 1, extended_cost: 30 },  // 3000
      { part_name: 'D', part_type: 'permit', quantity: 1 },                    // uncosted
    ],
  };
  const parts = productParts(product);
  const s = partsSummary(product, parts);
  assert.equal(s.total_parts, 4);
  assert.equal(s.total_quantity, 5);
  assert.equal(s.total_cost_cents, 10000);
  assert.equal(s.uncosted_parts, 1);
  assert.equal(s.by_type.materials.count, 1);
  assert.equal(s.by_type.materials.cost_cents, 2000);
  assert.equal(s.by_type.equipment.cost_cents, 5000);
  assert.equal(s.by_type.labor.cost_cents, 3000);
  assert.equal(s.by_type.other.count, 1);
  // Omitting `parts` resolves from the product; raw rows get normalized.
  assert.equal(partsSummary(product).total_cost_cents, 10000);
  assert.equal(partsSummary(null).total_parts, 0);
  const empty = partsSummary({});
  assert.equal(empty.total_cost_cents, 0);
  assert.equal(empty.by_type.materials.count, 0);
}

// ── expandableRows ────────────────────────────────────────────────────────
{
  const products = [
    { id: 'pa', description: 'Sign A', parts: [{ part_name: 'a1', quantity: 1, unit_cost: 1 }] },
    { id: 'pb', description: 'Sign B', parts: [
      { part_name: 'b1', part_type: 'material', quantity: 1, unit_cost: 2 },
      { part_name: 'b2', part_type: 'labor', quantity: 1, unit_cost: 3 },
    ] },
    { description: 'No id' }, // synthetic id
  ];
  // Collapsed: one product row each.
  const flat = expandableRows(products);
  assert.equal(flat.length, 3);
  assert.ok(flat.every((r) => r.type === 'product'));
  assert.equal(flat[2].product_id, 'product-2', 'synthetic id for id-less product');
  assert.equal(flat[0].summary.total_parts, 1);
  // Expanded via Set.
  const ex = expandableRows(products, { expanded_ids: new Set(['pb']) });
  assert.deepEqual(ex.map((r) => r.type), ['product', 'product', 'part', 'part', 'product']);
  assert.equal(ex[2].parent_product_id, 'pb');
  assert.equal(ex[2].part_index, 0);
  assert.equal(ex[3].part.name, 'b2');
  assert.equal(ex[1].expanded, true);
  // expanded_ids accepts array / map / true.
  assert.equal(expandableRows(products, { expanded_ids: ['pa'] }).filter((r) => r.type === 'part').length, 1);
  assert.equal(expandableRows(products, { expanded_ids: { pa: true } }).filter((r) => r.type === 'part').length, 1);
  assert.equal(expandableRows(products, { expanded_ids: true }).filter((r) => r.type === 'part').length, 3);
  // work_order_id prefixes synthetic ids.
  const w = expandableRows([{ description: 'x' }], { work_order_id: 'wo7' });
  assert.equal(w[0].product_id, 'wo7-0');
  // partsCatalog flows through for the no-embedded path.
  const cat = [{ id: 'c1', builder_product_id: 'bpp', part_name: 'Cat Part', quantity: 1, frozen_unit_cost: 4 }];
  const withCat = expandableRows([{ id: 'pp', builder_product_id: 'bpp' }], { expanded_ids: true, partsCatalog: cat });
  assert.equal(withCat[1].type, 'part');
  assert.equal(withCat[1].part.source, 'catalog');
  assert.deepEqual(expandableRows(null), []);
  assert.equal(productRowId({ builder_product_id: 'bp' }, 3), 'bp');
}

// ── missingPartRefs ───────────────────────────────────────────────────────
{
  const catalog = [{ id: 'bp1' }, { part_key: 'k2' }];
  const product = {
    id: 'p13',
    parts: [
      { builder_part_id: 'bp1', part_name: 'Known' },     // resolved by id
      { part_key: 'k2', part_name: 'KeyKnown' },          // resolved by key
      { builder_part_id: 'ghost', part_name: 'Ghost' },   // dangling
      { part_name: 'NoRef' },                             // no identifier — skipped
    ],
    part_ids: ['bp1', 'lost1'],
    part_refs: ['lost2'],
  };
  const missing = missingPartRefs(product, catalog);
  assert.equal(missing.length, 3);
  assert.deepEqual(missing.map((m) => m.ref).sort(), ['ghost', 'lost1', 'lost2']);
  assert.equal(missing.find((m) => m.ref === 'ghost').name, 'Ghost');
  assert.equal(missing.find((m) => m.ref === 'lost1').field, 'part_ids');
  // Empty catalog → every carried ref flags.
  assert.equal(missingPartRefs({ id: 'x', parts: [{ part_id: 'a' }] }, []).length, 1);
  // No refs at all → clean.
  assert.deepEqual(missingPartRefs({ id: 'x', parts: [{ part_name: 'nope' }] }, catalog), []);
  assert.deepEqual(missingPartRefs(null, catalog), []);
}

rmSync(out);
console.log('PASS products-to-parts');
