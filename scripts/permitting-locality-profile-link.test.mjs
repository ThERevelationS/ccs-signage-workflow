import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { transform } from 'esbuild';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const source = await fs.readFile('src/components/permitting/LocalityProfileLinkEditor.jsx', 'utf8');
const compiled = (await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' })).code;
const normalizeAddressState = value => {
  const state = String(value || '').trim().toLowerCase();
  return state === 'ohio' || state === 'oh' ? 'oh' : state === 'kentucky' || state === 'ky' ? 'ky' : state;
};

function harness({ pages = [], exactProfile } = {}) {
  const calls = [], staged = [], module = { exports: {} };
  const Profile = {
    async filter(...args) {
      calls.push(['filter', ...args]);
      return pages[args[3] / 50] || [];
    },
    async get(id) {
      calls.push(['get', id]);
      return typeof exactProfile === 'function' ? exactProfile(id) : exactProfile;
    },
  };
  vm.runInNewContext(compiled, {
    module,
    require: name => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name === '@/api/base44Client') return { base44: { entities: { JurisdictionProfile: Profile } } };
      if (name === '../../shared/permittingAddressState.js') return { normalizeAddressState };
      throw new Error('Unexpected import ' + name);
    },
  });
  let tree;
  const Component = module.exports.default;
  const props = { localityId: 'locality-fixture', localityState: 'Ohio', currentProfileId: '', onLink: id => staged.push(id) };
  return {
    calls, staged,
    async mount() { await act(async () => { tree = Renderer.create(React.createElement(Component, props)); }); },
    async click(label) {
      const button = tree.root.findAllByType('button').find(node =>
        node.children.some(child => typeof child === 'string' && child.trim() === label)
      );
      assert(button, 'button not found: ' + label);
      await act(async () => button.props.onClick());
    },
    async select(id) {
      const select = tree.root.findByType('select');
      await act(async () => select.props.onChange({ target: { value: id } }));
    },
    options() { return tree.root.findAllByType('option').map(node => ({ value: node.props.value, text: node.children.join('') })); },
    json() { return JSON.stringify(tree.toJSON()); },
    async close() { await act(async () => tree?.unmount()); },
  };
}

test('profiles load only after an explicit action and stage only a freshly confirmed exact same-state ID', async () => {
  const h = harness({
    pages: [[
      { id: 'profile-oh-1', name: 'Example City', type: 'city', state: 'OH' },
      { id: 'profile-ky-1', name: 'Example City', type: 'city', state: 'KY' },
      { id: 'profile-oh-2 ', name: 'Malformed ID', state: 'OH' },
    ]],
    exactProfile: { id: 'profile-oh-1', name: 'Example City', type: 'city', state: 'OH' },
  });
  try {
    await h.mount();
    assert.deepEqual(h.calls, []);
    await h.click('Load profiles for OH');
    assert.deepEqual(h.calls[0], ['filter', { state: 'OH' }, 'name', 50, 0]);
    assert.deepEqual(h.options().map(option => option.value), ['', 'profile-oh-1']);
    await h.select('profile-oh-1');
    assert.deepEqual(h.staged, []);
    await h.click('Stage exact profile link');
    assert.deepEqual(h.calls.at(-1), ['get', 'profile-oh-1']);
    assert.deepEqual(h.staged, ['profile-oh-1']);
    assert.match(h.json(), /Save the locality to apply this link/);
  } finally {
    await h.close();
  }
});

test('state-scoped profile pages load incrementally only when requested', async () => {
  const first = Array.from({ length: 50 }, (_, i) => ({ id: 'oh-' + i, name: 'City ' + i, state: 'OH' }));
  const h = harness({ pages: [first, [{ id: 'oh-next', name: 'Next city', state: 'OH' }]] });
  try {
    await h.mount();
    await h.click('Load profiles for OH');
    assert.equal(h.calls.length, 1);
    await h.click('Load next 50 profiles');
    assert.deepEqual(Array.from(h.calls[1]), ['filter', { state: 'OH' }, 'name', 50, 50]);
    assert.equal(h.calls[1][1].state, 'OH');
    assert.equal(h.options().some(option => option.value === 'oh-next'), true);
  } finally {
    await h.close();
  }
});

test('an exact-ID recheck with a mismatched state stages no link', async () => {
  const h = harness({
    pages: [[{ id: 'profile-oh-1', name: 'Example City', state: 'OH' }]],
    exactProfile: { id: 'profile-oh-1', name: 'Example City', state: 'KY' },
  });
  try {
    await h.mount();
    await h.click('Load profiles for OH');
    await h.select('profile-oh-1');
    await h.click('Stage exact profile link');
    assert.deepEqual(h.staged, []);
    assert.match(h.json(), /profile state changed or does not match/);
  } finally {
    await h.close();
  }
});

test('a failed repository read does not stage a profile link', async () => {
  const h = harness({ pages: [[{ id: 'profile-oh-1', name: 'Example City', state: 'OH' }]], exactProfile: null });
  try {
    await h.mount();
    await h.click('Load profiles for OH');
    await h.select('profile-oh-1');
    await h.click('Stage exact profile link');
    assert.deepEqual(h.staged, []);
    assert.match(h.json(), /could not be confirmed/);
  } finally {
    await h.close();
  }
});
