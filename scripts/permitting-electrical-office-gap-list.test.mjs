import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { transform } from 'esbuild';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const source = await fs.readFile('src/components/permitting/ElectricalOfficeGapList.jsx', 'utf8');
const compiled = (await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' })).code;
const fixtures = [
  { id: 'oh-alpha', name: 'Alpha City', state: 'OH', roles: { electrical_permit: 'staff_verified', electrical_inspection: 'needs_review' } },
  { id: 'oh-beta', name: 'Beta Village', state: 'OH', roles: { electrical_permit: 'missing', electrical_inspection: 'staff_verified' } },
  { id: 'ky-gamma', name: 'Gamma Town', state: 'KY', roles: { electrical_permit: 'staff_verified', electrical_inspection: 'missing' } },
];

function harness({ canReview = true } = {}) {
  const module = { exports: {} }, opened = [];
  vm.runInNewContext(compiled, {
    module,
    require: name => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      throw new Error('Unexpected import ' + name);
    },
  });
  let tree;
  return {
    opened,
    async mount() { await act(async () => { tree = Renderer.create(React.createElement(module.exports.default, { gaps: fixtures, canReview, onReview: id => opened.push(id) })); }); },
    async select(index, value) { const controls = tree.root.findAllByType('select'); await act(async () => controls[index].props.onChange({ target: { value } })); },
    async search(value) { const input = tree.root.findByProps({ 'aria-label': 'Search electrical gap localities' }); await act(async () => input.props.onChange({ target: { value } })); },
    json() { return JSON.stringify(tree.toJSON()); },
    async review(name) { const button = tree.root.findByProps({ 'aria-label': 'Review office setup for ' + name }); await act(async () => button.props.onClick()); },
    async close() { await act(async () => tree?.unmount()); },
  };
}

test('state and electrical responsibility filters keep issuer and inspection gaps separate', async () => {
  const h = harness();
  try {
    await h.mount();
    assert.match(h.json(), /Alpha City/);
    assert.match(h.json(), /Beta Village/);
    assert.match(h.json(), /Gamma Town/);
    await h.select(0, 'OH');
    await h.select(1, 'electrical_inspection');
    const view = h.json();
    assert.match(view, /Alpha City/);
    assert.doesNotMatch(view, /Beta Village/);
    assert.doesNotMatch(view, /Gamma Town/);
    assert.match(view, /Electrical inspection provider/);
    assert.match(view, /Configured; staff review remains open/);
  } finally { await h.close(); }
});

test('locality search narrows the list and routes only the selected locality to settings', async () => {
  const h = harness();
  try {
    await h.mount();
    await h.select(0, 'KY');
    await h.search('gamma');
    const view = h.json();
    assert.match(view, /Gamma Town/);
    assert.doesNotMatch(view, /Alpha City|Beta Village/);
    await h.review('Gamma Town');
    assert.deepEqual(h.opened, ['ky-gamma']);
  } finally { await h.close(); }
});

test('read-only viewers can use the filters without seeing a settings action', async () => {
  const h = harness({ canReview: false });
  try {
    await h.mount();
    assert.doesNotMatch(h.json(), /Review locality office setup/);
  } finally { await h.close(); }
});
