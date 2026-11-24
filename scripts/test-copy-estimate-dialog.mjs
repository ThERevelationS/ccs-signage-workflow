import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { act, create } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const directory = mkdtempSync(resolve('.audit-work', 'q05-dialog-test-'));
const out = resolve(directory, 'dialog.mjs');
const stubs = {
  '@/components/ui/dialog': `import React from "react"; export const Dialog=({open,children})=>open?React.createElement("div",null,children):null; export const DialogContent=({children})=>React.createElement("div",null,children); export const DialogHeader=DialogContent; export const DialogTitle=DialogContent; export const DialogDescription=DialogContent;`,
  '@/components/staff/staffEntities': 'export const staffEntities=globalThis.__copyDialog.entities;',
  '@/lib/loadAllEntityRows': 'export const loadAllEntityRows=async ({query})=>globalThis.__copyDialog.parts[query.builder_product_id] || [];',
  '@/components/estimator/moduleRegistry': 'export const getModuleLabel=(key)=>key;',
  '@/components/estimator/builder/builderMutationRecovery': 'export const assertNoPendingLinesForCopy=(lines)=>{if(lines.some((line)=>line.price_acceptance_pending?.key))throw new Error("Pending source");};',
  '@/components/estimator/products/productOperations': 'export const cloneProductInEstimate=(args)=>globalThis.__copyDialog.clone(args);',
  '@/components/estimator/importEstimates': 'export const copyProductBomToProduct=(args)=>globalThis.__copyDialog.bom(args);',
};
const source = { id: 'source', project_name: 'Source', estimate_number: 'EST-00010', status: 'draft', line_items: [
  { line_id: 'l1', builder_product_id: 'b1', client_product_name: 'Sign one', module_key: 'vinyl' },
  { line_id: 'l2', builder_product_id: 'b2', client_product_name: 'Sign two', module_key: 'custom' },
  { line_id: 'l3', client_product_name: 'Legacy' },
] };
const older = { ...source, id: 'old', project_name: 'Old estimate', estimate_number: 'EST-00077' };
const target = { id: 'target', project_name: 'Target', updated_date: 'v1', line_items: [
  { line_id: 't1', builder_product_id: 'target-builder', client_product_name: 'Target product', module_key: 'custom' },
] };
const copyCalls = [], bomCalls = [], filterCalls = [];
let copied, closed;
globalThis.__copyDialog = {
  entities: { AllInOneEstimate: {
    filter: async (query, sort, limit) => { filterCalls.push({ query, sort, limit }); return query.estimate_number === 'EST-00077' ? [older] : query.estimate_number ? [] : [source, target]; },
    get: async (id) => id === 'target' ? target : id === 'old' ? older : source,
  } },
  parts: { b1: [{ is_active: true }, { is_active: false }], b2: [{ is_active: true }] },
  clone: async (args) => { copyCalls.push(args); if (args.line.line_id === 'l2') throw new Error('Synthetic failure'); return { line: args.line }; },
  bom: async (args) => { bomCalls.push(args); return { packages: 2, results: [{ group: { group_name: 'Cabinet' } }, { parts: [{ part_name: 'Face' }] }] }; },
};
const text = (node) => node.children.map((child) => typeof child === 'string' ? child : text(child)).join('');
const button = (tree, label) => tree.root.findAllByType('button').find((node) => text(node).includes(label));
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

try {
  await build({
    entryPoints: ['src/components/estimator/aio/CopyFromEstimateDialog.jsx'], bundle: true, platform: 'node', format: 'esm',
    outfile: out, external: ['react'], jsx: 'automatic', logLevel: 'silent',
    plugins: [{ name: 'copy-dialog-stubs', setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'stub' } : undefined);
      build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({ contents: stubs[args.path], loader: 'js' }));
    } }],
  });
  const { default: Dialog } = await import(pathToFileURL(out).href);
  let tree;
  const mount = async (props = {}) => {
    copied = null; closed = false;
    await act(async () => { tree = create(React.createElement(Dialog, {
      open: true, mode: 'sections', estimate: target, expectedEstimateUpdatedAt: 'v1',
      onClose: () => { closed = true; }, onCopied: (value) => { copied = value; }, ...props,
    })); });
    await flush();
  };
  await mount();
  assert.equal(filterCalls[0].limit, 500);
  assert.equal(filterCalls[0].sort, '-updated_date');
  await act(async () => { tree.root.findByProps({ 'aria-label': 'Search estimates' }).props.onChange({ target: { value: '77' } }); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 340)); });
  assert.ok(button(tree, 'Old estimate'), 'exact-number lookup finds an older estimate');
  assert.ok(filterCalls.some((call) => call.query.estimate_number === 'EST-00077'));
  await act(async () => { tree.root.findByProps({ 'aria-label': 'Search estimates' }).props.onChange({ target: { value: '' } }); });
  await act(async () => { await button(tree, 'Source').props.onClick(); });
  const boxes = tree.root.findAllByType('input').filter((node) => node.props.type === 'checkbox');
  assert.equal(boxes.length, 4);
  assert.equal(boxes[3].props.disabled, true, 'legacy line cannot be selected');
  await act(async () => { boxes[0].props.onChange({ target: { checked: true } }); });
  await act(async () => { await button(tree, 'Copy 2 products').props.onClick(); });
  assert.equal(copyCalls.length, 2);
  assert.equal(copyCalls[0].sourceEstimateId, 'source');
  assert.equal(copyCalls[0].estimateId, 'target');
  assert.ok(tree.root.findAllByProps({ role: 'alert' }).some((node) => text(node).includes('Synthetic failure')));
  assert.equal(copied, null, 'result stays visible before the parent refresh');
  await act(async () => { await button(tree, 'Done').props.onClick(); });
  assert.equal(copied.copied.length, 1);
  assert.equal(copied.failures[0].message, 'Synthetic failure');
  assert.equal(closed, true);
  await act(async () => { tree.unmount(); });

  await mount({ mode: 'bom' });
  await act(async () => { await button(tree, 'Source').props.onClick(); });
  const radios = tree.root.findAllByType('input').filter((node) => node.props.type === 'radio');
  await act(async () => { radios[0].props.onChange({ target: { checked: true } }); });
  await act(async () => { button(tree, 'Choose target').props.onClick(); });
  const targetRadio = tree.root.findAllByType('input').find((node) => node.props.name === 'target-product');
  await act(async () => { targetRadio.props.onChange(); });
  await act(async () => { await button(tree, 'Copy BOM').props.onClick(); });
  assert.equal(bomCalls[0].sourceBuilderProductId, 'b1');
  assert.equal(bomCalls[0].targetBuilderProductId, 'target-builder');
  assert.ok(text(tree.root).includes('Cabinet') && text(tree.root).includes('Face'), 'BOM result identifies copied packages');
  await act(async () => { await button(tree, 'Done').props.onClick(); });
  assert.equal(copied.packages, 2);
  await act(async () => { tree.unmount(); });

  await mount({ mode: 'bom', targetBuilderProductId: 'target-builder' });
  await act(async () => { await button(tree, 'Source').props.onClick(); });
  const sourceRadio = tree.root.findAllByType('input').find((node) => node.props.name === 'source-product');
  await act(async () => { sourceRadio.props.onChange({ target: { checked: true } }); });
  assert.ok(button(tree, 'Copy BOM'), 'preset target skips target selection');
  await act(async () => { await button(tree, 'Copy BOM').props.onClick(); });
  assert.equal(bomCalls[1].targetBuilderProductId, 'target-builder');
  await act(async () => { tree.unmount(); });
  console.log('PASS copy estimate dialog: search, sections, partial failure, BOM target and preset');
} finally {
  rmSync(directory, { recursive: true, force: true });
  delete globalThis.__copyDialog;
}
