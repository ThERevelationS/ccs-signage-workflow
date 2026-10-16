import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { transform } from 'esbuild';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const source = await fs.readFile('src/components/auth/AppErrorBoundary.jsx', 'utf8');
const compiled = (await transform(source, { loader: 'jsx', jsx: 'transform', format: 'cjs' })).code;
const module = { exports: {} };
let reloadCalls = 0;
const browser = { location: { reload: () => { reloadCalls += 1; } } };
new Function('require', 'module', 'exports', 'window', 'console', compiled)(
  name => {
    if (name === 'react') return require(name);
    throw new Error('Unexpected import ' + name);
  },
  module,
  module.exports,
  browser,
  { error() {} },
);
const AppErrorBoundary = module.exports.default;

test('a render failure shows a reload action and does not expose error details', async () => {
  let tree;
  const originalError = console.error;
  console.error = () => {};
  try {
    await act(async () => {
      tree = Renderer.create(
        React.createElement(AppErrorBoundary, null, () => {
          throw new Error('synthetic render failure');
        }),
      );
    });
    assert.equal(tree.root.findByProps({ role: 'alert' }).type, 'main');
    assert.equal(tree.root.findByType('h1').children[0], 'This page didn’t load');
    const button = tree.root.findByType('button');
    assert.equal(button.children.join(''), 'Reload staff browser');
    assert.equal(tree.root.findAllByProps({ children: 'synthetic render failure' }).length, 0);
    await act(async () => button.props.onClick());
    assert.equal(reloadCalls, 1);
  } finally {
    console.error = originalError;
    tree?.unmount();
  }
});
