import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { create, act } from 'react-test-renderer';

const here = dirname(fileURLToPath(import.meta.url));
const temp = mkdtempSync(resolve(here, '.tmp-estimator-batch-'));
const calls = [];
globalThis.__estimatorBatchInvoke = async (name, payload) => {
  calls.push({ name, payload });
  return { data: { estimate: { id: 'synthetic-copy' } } };
};
const stubs = {
  '@/api/base44Client': 'export const base44 = { entities: {}, functions: { invoke: (...args) => globalThis.__estimatorBatchInvoke(...args) } };',
  '@/functions/sendGmail': 'export const sendGmail = () => { throw new Error("No real email in unit tests"); };',
  '@/functions/generateDocNumber': 'export const generateDocNumber = async () => ({ data: { number: "EST-T-1" } });',
  '@/components/staff/staffEntities': 'export const staffEntities = new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) });',
  '@/components/estimator/moduleRegistry': 'export const ESTIMATOR_MODULES = []; export const getModuleLabel = () => "Custom";',
  '@/components/estimator/customerPricing': 'export const acceptedCustomerUnitPrice = () => 10;',
  '@/components/estimator/aioPricing': 'export const money = (value) => String(value);',
  '@/components/estimator/productionProductTypes': 'export const loadProductionProductTypes = async () => [];',
  './ProductRow': 'export default function ProductRow() { return null; }',
  './CustomerSearchDialog': 'export default function CustomerSearchDialog() { return null; }',
  './NewCustomerDialog': 'export default function NewCustomerDialog() { return null; }',
};
let bundleNumber = 0;
async function load(relative) {
  const outfile = resolve(temp, `${bundleNumber++}.mjs`);
  await build({
    entryPoints: [resolve(here, '..', relative)],
    bundle: true, format: 'esm', platform: 'node', outfile,
    external: ['react', 'react-test-renderer'],
    jsx: 'automatic', logLevel: 'silent',
    plugins: [{
      name: 'synthetic-estimator-dependencies',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => {
          if (Object.hasOwn(stubs, args.path)) return { path: args.path, namespace: 'synthetic' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, (args) => ({ contents: stubs[args.path], loader: 'js' }));
      },
    }],
  });
  return import(pathToFileURL(outfile).href);
}

const text = (node) => node.children.map((child) => typeof child === 'string' ? child : text(child)).join('');
const button = (tree, label) => tree.root.findAllByType('button').find((node) => text(node).includes(label));
const checkboxes = (tree) => tree.root.findAllByType('input').filter((node) => node.props.type === 'checkbox');
const failures = [];
let passed = 0;
async function test(name, run) {
  try {
    await run();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

try {
  const email = await load('src/components/estimator/quoteDeliveryService.js');
  await test('email placeholders expand once and preserve unknown placeholders', () => {
    assert.equal(email.defaultQuoteEmailMessage({
      email_message_template: '{project_name} | {company_name} | {unknown} | {toString}',
      project_name: '{company_name}', company_name: 'Synthetic Signs',
    }), '{company_name} | Synthetic Signs | {unknown} | {toString}');
  });
  await test('email subjects stay on one line', () => {
    assert.equal(email.defaultQuoteEmailSubject({
      email_subject_template: '{project_name}', project_name: 'Sign\r\nBcc: injected',
    }), 'Sign Bcc: injected');
    assert.ok(!/[\r\n]/.test(email.defaultQuoteEmailSubject({ project_name: 'A\nB', estimate_number: '1\r2' })));
  });
  await test('email template totals handle zero and non-finite input', () => {
    for (const value of [0, NaN, Infinity, 'invalid']) {
      assert.equal(email.defaultQuoteEmailMessage({ email_message_template: '{quote_total}', quote_total: value }), '$0.00');
    }
    assert.equal(email.defaultQuoteEmailMessage({ email_message_template: '{quote_total}', quote_total: 123.45 }), '$123.45');
  });
  await test('email body and signature escape HTML', () => {
    const html = email.quoteEmailBodyHtml('<script>alert("x")</script>', '<img src=x onerror=alert(1)>');
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&lt;img'));
  });

  const creation = await load('src/components/estimator/estimateCreationService.js');
  await test('copy services preserve caller creation keys across retry', async () => {
    const source = { id: 'synthetic-source', line_items: [{ line_id: 'one' }] };
    calls.length = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      await creation.splitEstimate({ source, lineItemIds: ['one'], sessionToken: 'synthetic', creationKey: 'split-retry' });
      await creation.duplicateEstimate({ source, sessionToken: 'synthetic', creationKey: 'duplicate-retry' });
    }
    assert.deepEqual(calls.map(({ payload }) => payload.creation_key), ['split-retry', 'duplicate-retry', 'split-retry', 'duplicate-retry']);
    assert.ok(calls.every(({ name }) => name === 'ensureNewEstimate'));
  });

  const { default: Products } = await load('src/components/estimator/aio/EstimateProductsList.jsx');
  const lines = [{ line_id: 'one', description: 'First product' }, { line_id: 'two', description: 'Second product' }];
  await test('split blocks repeat clicks, retains failed selections, and clears on success', async () => {
    let finish;
    let attempts = 0;
    const onSplit = () => {
      attempts++;
      return new Promise((resolvePromise, rejectPromise) => { finish = { resolvePromise, rejectPromise }; });
    };
    let tree;
    await act(async () => { tree = create(React.createElement(Products, { lines, onSplit })); });
    try {
      await act(async () => { button(tree, 'Split').props.onClick(); });
      await act(async () => { checkboxes(tree)[0].props.onChange(); });
      const click = button(tree, 'to new draft').props.onClick;
      let pending;
      await act(async () => { pending = click(); click(); });
      assert.equal(attempts, 1);
      assert.equal(button(tree, 'Creating draft').props.disabled, true);
      assert.equal(button(tree, 'Cancel').props.disabled, true);
      await act(async () => { finish.rejectPromise(new Error('Synthetic create failed')); await pending; });
      assert.equal(checkboxes(tree)[0].props.checked, true);
      assert.equal(text(tree.root.findByProps({ role: 'alert' })), 'Synthetic create failed');
      await act(async () => { pending = button(tree, 'to new draft').props.onClick(); });
      await act(async () => { finish.resolvePromise(true); await pending; });
      assert.equal(checkboxes(tree).length, 0);
      assert.ok(button(tree, 'Split'));
    } finally {
      await act(async () => { tree.unmount(); });
    }
  });
  await test('split invalidates selection after source changes and hides read-only controls', async () => {
    let tree;
    const props = { lines, onSplit: async () => false };
    await act(async () => { tree = create(React.createElement(Products, props)); });
    try {
      await act(async () => { button(tree, 'Split').props.onClick(); checkboxes(tree); });
      await act(async () => { checkboxes(tree)[0].props.onChange(); });
      await act(async () => { await button(tree, 'to new draft').props.onClick(); });
      assert.equal(checkboxes(tree)[0].props.checked, true, 'blocked create keeps selection');
      await act(async () => { tree.update(React.createElement(Products, { ...props, lines: [...lines].reverse() })); });
      assert.ok(checkboxes(tree).every((node) => !node.props.checked));
      await act(async () => { tree.update(React.createElement(Products, { ...props, readOnly: true })); });
      assert.equal(checkboxes(tree).length, 0);
      assert.equal(button(tree, 'Split'), undefined);
    } finally {
      await act(async () => { tree.unmount(); });
    }
  });
  await test('split retains hidden selections when filtering products', async () => {
    let received;
    let tree;
    await act(async () => { tree = create(React.createElement(Products, {
      lines: [{ ...lines[0], client_product_name: 'First' }, { ...lines[1], client_product_name: 'Second' }],
      onSplit: async (ids) => { received = ids; return false; },
    })); });
    try {
      await act(async () => { button(tree, 'Split').props.onClick(); });
      await act(async () => { checkboxes(tree)[0].props.onChange(); });
      await act(async () => {
        tree.root.findByProps({ placeholder: 'Search products...' }).props.onChange({ target: { value: 'Second' } });
      });
      assert.equal(checkboxes(tree).length, 1);
      await act(async () => { await button(tree, 'to new draft').props.onClick(); });
      assert.deepEqual(received, ['one']);
    } finally {
      await act(async () => { tree.unmount(); });
    }
  });

  const { default: Details } = await load('src/components/estimator/aio/Step1EstimateDetails.jsx');
  await test('recent customer chips reapply the customer and record the selection', async () => {
    let patch;
    let selected;
    let tree;
    const customer = { id: 'recent-a', company_name: 'Synthetic A', contact_email: 'a@example.test' };
    await act(async () => { tree = create(React.createElement(Details, {
      form: { client_name: '', tax_group: '', tax_percent: 0 },
      patch: (value) => { patch = value; },
      customers: [customer],
      recentCustomers: [customer],
      onCustomerSelected: (value) => { selected = value; },
      taxGroups: [], users: [], termsOptions: [], salesCenters: [],
    })); });
    try {
      const chip = tree.root.findByProps({ 'aria-label': 'Use recent customer Synthetic A' });
      await act(async () => { chip.props.onClick(); });
      assert.equal(patch.customer_id, 'recent-a');
      assert.equal(patch.client_name, 'Synthetic A');
      assert.equal(selected, customer);
    } finally {
      await act(async () => { tree.unmount(); });
    }
  });
  await test('customer-location persistence requires an explicit Step 1 opt-in', async () => {
    let optedIn;
    let tree;
    await act(async () => { tree = create(React.createElement(Details, {
      form: { client_name: 'Synthetic A', customer_id: 'recent-a', site_address: '123 Synthetic Way' },
      patch: () => {},
      customers: [],
      recentCustomers: [],
      taxGroups: [], users: [], termsOptions: [], salesCenters: [],
      saveSiteAsLocation: false,
      onSaveSiteAsLocationChange: (value) => { optedIn = value; },
    })); });
    try {
      const checkbox = tree.root.findAllByType('input').find((input) => input.props.type === 'checkbox');
      assert.ok(checkbox, 'opt-in is visible only with a linked customer and site address');
      assert.equal(checkbox.props.checked, false);
      await act(async () => { checkbox.props.onChange({ target: { checked: true } }); });
      assert.equal(optedIn, true);
    } finally {
      await act(async () => { tree.unmount(); });
    }
  });
  await test('new estimate screen wires a bounded local recent-customer preference', () => {
    const page = readFileSync(resolve(here, '../src/pages/NewAllInOneEstimate.jsx'), 'utf8');
    assert.match(page, /loadRecentCustomerIds/);
    assert.match(page, /saveRecentCustomerIds\(next\)/);
    assert.match(page, /recentCustomers=\{recentCustomers\}/);
    assert.match(page, /onCustomerSelected=\{rememberCustomer\}/);
    assert.match(page, /saveSiteAsLocation && customer\?\.id/);
    assert.match(page, /ensureEstimateCustomerLocation/);
  });
  for (const [name, group, expected] of [
    ['standard', { name: 'Standard', tax_percent: 7.25 }, { tax_group: 'Standard', tax_percent: 7.25 }],
    ['tax-exempt', { name: 'Standard', tax_percent: 0 }, { tax_group: 'Standard', tax_percent: 0 }],
    ['missing', null, {}],
    ['invalid', { name: 'Standard', tax_percent: 'invalid' }, {}],
  ]) {
    await test(`customer ${name} tax default keeps group and rate consistent`, async () => {
      let patch;
      let tree;
      await act(async () => { tree = create(React.createElement(Details, {
        form: { client_name: '', tax_group: 'Previous', tax_percent: 5 },
        patch: (value) => { patch = value; },
        customers: [], taxGroups: group ? [group] : [], users: [], termsOptions: [], salesCenters: [],
      })); });
      try {
        const search = tree.root.find((node) => typeof node.type === 'function' && node.type.name === 'CustomerSearchDialog');
        await act(async () => { search.props.onSelect({ id: 'synthetic-customer', company_name: 'Synthetic', default_tax_group: 'Standard' }); });
        for (const key of ['tax_group', 'tax_percent']) assert.equal(patch[key], expected[key]);
      } finally {
        await act(async () => { tree.unmount(); });
      }
    });
  }
  await test('detail copy guards and email live-total wiring stay present', () => {
    const detail = readFileSync(resolve(here, '../src/pages/EstimateDetail.jsx'), 'utf8');
    assert.match(detail, /copyingRef\.current \|\| saving \|\| trashing/);
    assert.match(detail, /openRevision\) throw new Error\("Save the open estimate revision before splitting/);
    assert.match(detail, /creationKey: copyCreationKey\("split", lineIds\)/);
    const panel = readFileSync(resolve(here, '../src/components/estimator/CustomerQuotePanel.jsx'), 'utf8');
    assert.match(panel, /emailEstimate = \{ \.\.\.estimate, quote_total: quoteTotalNow \}/);
  });
  await test('reprice-all-products action is guarded and wired to refreshProducts', () => {
    const detail = readFileSync(resolve(here, '../src/pages/EstimateDetail.jsx'), 'utf8');
    assert.match(detail, /const repriceAllProducts = async \(\) => \{/, 'manual reprice handler exists');
    assert.match(detail, /if \(readOnly \|\| saving \|\| trashing \|\| duplicating \|\| copyingRef\.current \|\| refreshing\) return;/, 'reprice blocks during read-only and estimate operations');
    assert.match(detail, /await refreshProducts\(\);/, 'reprice runs the full product pricing refresh');
    assert.match(detail, /onClick=\{repriceAllProducts\}/, 'toolbar button triggers the reprice');
    assert.match(detail, /aria-label="Reprice all products against current Master Inventory"/, 'button has an accessible label');
    assert.match(detail, /disabled=\{readOnly \|\| saving \|\| trashing \|\| duplicating \|\| refreshing\}/, 'button disables while busy');
    assert.match(detail, /refreshing \? "animate-spin"/, 'button shows progress');
  });
  await test('builder parts panel search filters visible parts', () => {
    const panel = readFileSync(resolve(here, '../src/components/estimator/aio/BuilderPartsPanel.jsx'), 'utf8');
    assert.match(panel, /parts\.length > 10 && \(/, 'search only renders for long part lists');
    assert.match(panel, /partSearch\.trim\(\)\.toLowerCase\(\)/, 'search normalizes case and whitespace');
    assert.match(panel, /part\.part_name, part\.client_label, part\.inventory_item_name/, 'search matches name, label, and inventory link');
    assert.match(panel, /visibleParts\.forEach/, 'filtered parts drive grouped and ungrouped renders');
    assert.match(panel, /aria-label="Search parts in this product"/, 'search input is accessible');
    assert.match(panel, /No Parts match/, 'empty match state is shown');
  });
  await test('detached-override audit shows who detached and when', () => {
    const partSync = readFileSync(resolve(here, '../src/components/estimator/builder/partSync.js'), 'utf8');
    const panel = readFileSync(resolve(here, '../src/components/estimator/aio/BuilderPartsPanel.jsx'), 'utf8');
    const schema = readFileSync(resolve(here, '../base44/entities/BuilderPart.jsonc'), 'utf8');
    assert.match(schema, /"builder_detached_by"/, 'BuilderPart stores who detached it');
    assert.match(partSync, /builder_detached_by: detachedBy/, 'detach writes the acting user');
    assert.match(partSync, /builder_detached_by: "",/, 'reattach clears the detached-by audit');
    assert.match(panel, /Detached \{new Date\(part\.builder_detached_at\)\.toLocaleString\(\)\}/, 'part row renders the detach timestamp');
    assert.match(panel, /by \$\{part\.builder_detached_by\}/, 'part row renders who detached');
    assert.match(panel, /part\.builder_detached_reason/, 'part row renders the detach reason');
  });
  await test('manual part cost override captures a reason', () => {
    const schema = readFileSync(resolve(here, '../base44/entities/BuilderPart.jsonc'), 'utf8');
    const partSync = readFileSync(resolve(here, '../src/components/estimator/builder/partSync.js'), 'utf8');
    const custom = readFileSync(resolve(here, '../src/components/estimator/parts/customProductService.js'), 'utf8');
    const modal = readFileSync(resolve(here, '../src/components/estimator/aio/DetachedPartOverrideModal.jsx'), 'utf8');
    assert.match(schema, /"manual_cost_override_reason"/, 'BuilderPart stores the override reason');
    assert.match(partSync, /manual_cost_override_reason: changes\.manual_cost_override_reason/, 'detached override update persists the reason');
    assert.match(custom, /manual_cost_override_reason: changes\.manual_cost_override_reason/, 'manual part update persists the reason');
    assert.match(partSync, /changes\.manual_cost_override_reason !== undefined[\s\S]{0,120}return false/, 'detached already-applied check compares the reason');
    assert.match(custom, /changes\.manual_cost_override_reason !== undefined[\s\S]{0,120}return false/, 'manual already-applied check compares the reason');
    assert.match(modal, /COST OVERRIDE REASON/, 'override editor exposes the reason input');
    assert.match(modal, /manual_cost_override_reason/, 'modal submits the reason');
  });
  await test('stale pending builder mutations surface on the product row', () => {
    const row = readFileSync(resolve(here, '../src/components/estimator/aio/ProductRow.jsx'), 'utf8');
    const recovery = readFileSync(resolve(here, '../src/components/estimator/builder/builderMutationRecovery.js'), 'utf8');
    assert.match(recovery, /STALE_PENDING_BUILDER_MUTATION_MS = 24 \* 60 \* 60 \* 1000/, 'stale threshold is 24 hours');
    assert.match(recovery, /pendingBuilderMutationAge/, 'age helper exists');
    assert.match(recovery, /pendingBuilderMutationIsStale/, 'stale check exists');
    assert.match(row, /pendingBuilderMutationIsStale\(line\)/, 'product row evaluates staleness');
    assert.match(row, /pendingStale \? " · stale >24h"/, 'stale pendings are labelled');
    assert.match(row, /border-red-300 bg-red-50 text-red-800/, 'stale pendings are visually distinct');
  });
  await test('part picker warns when requested quantity exceeds on-hand stock', () => {
    const picker = readFileSync(resolve(here, '../src/components/estimator/parts/MasterPartPickerModal.jsx'), 'utf8');
    assert.match(picker, /quantity_on_hand/, 'picker reads the inventory on-hand field');
    assert.match(picker, /requestedQty > onHand/, 'shortfall compares requested quantity to stock');
    assert.match(picker, /mode !== "select"/, 'resource-select mode skips the stock warning');
    assert.match(picker, /purchasing must cover the difference/, 'warning explains the shortfall consequence');
  });
  await test('bulk delete removes only independent parts in selection mode', () => {
    const panel = readFileSync(resolve(here, '../src/components/estimator/aio/BuilderPartsPanel.jsx'), 'utf8');
    assert.match(panel, /removableSelected = parts\.filter/, 'bulk delete filters the selection');
    assert.match(panel, /\["manual", "manual_addon"\]\.includes\(part\.builder_sync_state\)/, 'only manual/manual_addon parts are removable');
    assert.match(panel, /Builder-linked Part.*will be kept/, 'skipped builder-linked parts are explained');
    assert.match(panel, /bulkRemoveSelected/, 'bulk remove handler is wired');
    assert.match(panel, /removeManualProductPart\(part\.id/, 'per-part removal uses the recovery-aware service');
    assert.match(panel, /Delete Selected/, 'toolbar exposes the bulk delete');
  });
  await test('bulk detach detaches only Builder-linked parts in selection mode', () => {
    const panel = readFileSync(resolve(here, '../src/components/estimator/aio/BuilderPartsPanel.jsx'), 'utf8');
    assert.match(panel, /detachableSelected = parts\.filter/, 'bulk detach filters the selection');
    assert.match(panel, /part\.builder_sync_state === "linked"/, 'only Builder-linked parts are detachable');
    assert.match(panel, /bulkDetachSelected/, 'bulk detach handler is wired');
    assert.match(panel, /detachBuilderPartOverride\(part\.id/, 'per-part detach uses the recovery-aware service');
    assert.match(panel, /Detach Selected/, 'toolbar exposes the bulk detach');
  });
  await test('product row cost trend sparkline loads revisions lazily on hover', () => {
    const row = readFileSync(resolve(here, '../src/components/estimator/aio/ProductRow.jsx'), 'utf8');
    assert.match(row, /BuilderPriceRevision/, 'trend reads price revisions');
    assert.match(row, /onMouseEnter=\{loadCostTrend\}/, 'trend loads lazily on hover');
    assert.match(row, /costTrend !== null \|\| !line\.builder_product_id/, 'trend fetch is guarded and deduplicated');
    assert.match(row, /polyline points=\{sparkPoints\}/, 'sparkline renders revision points');
    assert.match(row, /aria-label=\{`Part cost history/, 'sparkline is accessible');
  });
} finally {
  delete globalThis.__estimatorBatchInvoke;
  rmSync(temp, { recursive: true, force: true });
}
if (failures.length) {
  console.error(`${failures.length} estimator workflow regression groups failed`);
  process.exitCode = 1;
} else {
  console.log(`PASS estimator workflow batch (${passed} regression groups)`);
}