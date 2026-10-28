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
