// D-09 hardening check — work-order print templates.
// Asserts all 5 templates render standalone HTML containing the WO number +
// product names, landscape CSS is present where the template name says so,
// the streamlined variant never leaks internal cost/margin fields, and the
// picker registry lists exactly 5 templates.
// Run: node scripts/test-print-templates.mjs  →  prints PASS print-templates

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-print-templates.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/jobs/printTemplates/index.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  PRINT_TEMPLATES, getPrintTemplate, renderWorkOrderPrint, buildWorkOrderPrintModel,
} = await import(pathToFileURL(out).href);

const WO = {
  id: 'wo-abc-123',
  title: 'Monument sign — Riverfront Plaza',
  client_name: 'Riverfront Properties LLC',
  contact_name: 'Dana Smith',
  contact_phone: '513-555-0142',
  contact_email: 'dana@riverfront.example',
  billing_address: '1200 Main St\nCincinnati, OH 45202',
  install_location: '44 Riverbend Way',
  address_line_2: 'Suite B',
  township_city: 'Cincinnati',
  county: 'Hamilton',
  current_stage: 'production',
  start_date: '2026-11-01',
  due_date: '2026-12-05',
  project_install_date: '2026-12-10',
  sales_rep: 'brett@ccs.example',
  project_manager: 'pm@ccs.example',
  estimate_amount: 15400,
  deposit_required: true,
  deposit_amount: 5000,
  deposit_invoiced: true,
  actual_cost: 3100,
  profit_margin: 22,
  asap: true,
  description: 'Double-face illuminated monument, 8ft x 4ft.',
  products: [
    {
      id: 'p1',
      description: 'Monument sign cabinet',
      customer_description: '8x4 DF illuminated monument',
      product_type: 'Monument',
      quantity: 1,
      quoted_unit_price: 12000,
      quoted_total: 12000,
      unit_cost: 6400,
      operational_status: 'in_production',
      estimator_notes: 'INTERNAL: routed aluminum faces',
      source_estimate_number: 'EST-9001',
    },
    {
      id: 'p2',
      description: 'Vinyl graphics package',
      product_type: 'Vinyl',
      quantity: 2,
      quoted_unit_price: 1700,
      quoted_total: 3400,
      unit_cost: 500,
      operational_status: 'in_design',
    },
  ],
  materials: [
    { part_name: 'Aluminum sheet .080', quantity: 4, unit: 'sheets', unit_cost: 120, extended_cost: 480, section_name: 'Cabinet' },
  ],
  notes: [
    { id: 't1', text: 'Route faces', completed: true, assigned_to: 'shop1' },
    { id: 't2', text: 'Wire LEDs', completed: false, is_milestone: true },
  ],
};

const COMPANY = {
  company_name: 'Clay County Signage',
  company_address: '500 Shop Ln\nFlorence, KY 41042',
  company_phone: '859-555-0100',
  company_logo_url: 'https://cdn.example/logo.png',
};

const opts = { company: COMPANY, autoPrint: false };

// --- registry ---
assert.equal(PRINT_TEMPLATES.length, 5, 'picker list = 5 templates');
assert.equal(new Set(PRINT_TEMPLATES.map((t) => t.id)).size, 5, 'template ids unique');
assert.ok(PRINT_TEMPLATES.every((t) => t.id && t.label && typeof t.renderHtml === 'function'),
  'each template exposes {id,label,renderHtml}');
assert.equal(getPrintTemplate('v2')?.id, 'v2', 'getPrintTemplate finds v2');
assert.equal(getPrintTemplate('bogus')?.id, 'original', 'unknown id falls back to original');
assert.equal(getPrintTemplate()?.id, 'original', 'missing id defaults to original');

// --- render every template ---
const htmlById = {};
for (const t of PRINT_TEMPLATES) {
  const html = renderWorkOrderPrint(WO, { ...opts, templateId: t.id });
  htmlById[t.id] = html;
  assert.ok(typeof html === 'string' && html.length > 1500, `${t.id} renders non-empty html`);
  assert.ok(/^<!doctype html>/i.test(html), `${t.id} is standalone doctype html`);
  assert.ok(html.includes('wo-abc-123') || html.includes('WO-ABC-123'), `${t.id} shows WO number`);
  assert.ok(html.includes('8x4 DF illuminated monument'), `${t.id} shows product name 1`);
  assert.ok(html.includes('Vinyl graphics package'), `${t.id} shows product name 2`);
  assert.ok(/@media print/.test(html), `${t.id} has @media print rules`);
}

// --- landscape @page where named ---
assert.match(htmlById.streamlined, /@page\s*\{[^}]*size:\s*landscape/, 'streamlined landscape @page css');
assert.match(htmlById['landscape-spanish'], /@page\s*\{[^}]*size:\s*landscape/, 'spanish landscape @page css');
assert.doesNotMatch(htmlById.original, /size:\s*landscape/, 'original is not landscape');
assert.doesNotMatch(htmlById.v2, /size:\s*landscape/, 'v2 is not landscape');

// --- streamlined hides internal fields ---
// (case-sensitive label checks — lowercase "cost"/"margin" appear in CSS)
const sl = htmlById.streamlined;
assert.doesNotMatch(sl, /cost/i, 'streamlined lacks cost strings');
assert.doesNotMatch(sl, /Margin|margin_pct|profit_margin/, 'streamlined lacks margin labels');
assert.ok(!sl.includes('$6,400.00'), 'streamlined hides internal unit cost value');
assert.ok(!sl.includes('$7,400.00'), 'streamlined hides internal total cost value');
assert.ok(!sl.includes('EST-9001'), 'streamlined hides source estimate provenance');
assert.ok(!sl.includes('INTERNAL: routed aluminum'), 'streamlined hides estimator notes');
assert.ok(sl.includes('$12,000.00') && sl.includes('$3,400.00'), 'streamlined still prints customer prices');

// --- original shows internal columns ---
const og = htmlById.original;
assert.match(og, /unit cost/i, 'original shows cost columns');
assert.match(og, /margin/i, 'original shows margin columns');
assert.ok(og.includes('$6,400.00'), 'original prints internal unit cost value');
assert.ok(og.includes('Aluminum sheet .080'), 'original prints materials manifest');
assert.ok(og.includes('Route faces'), 'original prints checklist tasks');

// --- spanish translations (labels translated, data as-is) ---
const es = htmlById['landscape-spanish'];
assert.ok(es.includes('Orden de Trabajo'), 'spanish has translated title');
assert.ok(es.includes('Cantidad') && es.includes('Precio Unitario'), 'spanish table headers translated');
assert.ok(es.includes('Riverfront Properties LLC'), 'spanish keeps field data verbatim');
assert.ok(es.includes('In Production'), 'spanish keeps status data verbatim');
assert.match(es, /Fecha de Entrega/, 'spanish meta labels translated');

// --- v2 + invoice shapes ---
assert.match(htmlById['invoice-styled'], /Balance Due/, 'invoice-styled totals waterfall (balance due)');
assert.match(htmlById['invoice-styled'], /Subtotal/, 'invoice-styled totals waterfall (subtotal)');
assert.match(htmlById['invoice-styled'], /Less Deposit/, 'invoice-styled deposit waterfall line');
assert.match(htmlById.v2, /border-radius:8px/, 'v2 card sections');

// --- model shape ---
const model = buildWorkOrderPrintModel(WO, opts);
assert.equal(model.rows.length, 2, 'model normalizes product rows');
assert.equal(model.order_number, 'wo-abc-123', 'model order number from id fallback');
assert.equal(model.totals.subtotal, 15400, 'model subtotal sums ext prices');
assert.equal(model.rows[0].internal.unit_cost, 6400, 'model keeps internal unit cost separate');
assert.equal(model.rows[0].unit_price, 12000, 'model keeps customer unit price');
assert.equal(model.company.name, 'Clay County Signage', 'model maps quote-defaults company name');
assert.equal(model.company.logo_url, 'https://cdn.example/logo.png', 'model maps company_logo_url');
assert.equal(model.totals.internal.total_cost, 7400, 'model internal total cost');
assert.equal(model.task_counts.done, 1, 'model counts completed tasks');

rmSync(out, { force: true });
console.log('PASS print-templates');
