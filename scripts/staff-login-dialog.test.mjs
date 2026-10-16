import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { transform } from 'esbuild';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const source = await fs.readFile('src/components/auth/EmailGate.jsx', 'utf8');
const compiled = (await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' })).code;

function harness({ loginResponse = { data: { success: false, error: 'Invalid username or password' } } } = {}) {
  const module = { exports: {} };
  let dialogProps, dialogContentProps;
  const storage = () => {
    const values = new Map();
    return {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key),
    };
  };
  const localStorage = storage(), sessionStorage = storage();
  const icons = ['Loader2', 'LogIn', 'Eye', 'AlertCircle'].reduce((items, name) => {
    items[name] = () => React.createElement('span', { 'data-icon': name });
    return items;
  }, {});
  const passthrough = name => props => React.createElement('div', { 'data-component': name }, props.children);
  const Button = props => React.createElement('button', {
    type: props.type || 'button', disabled: props.disabled, onClick: props.onClick,
    'aria-label': props['aria-label'],
  }, props.children);
  const Input = props => React.createElement('input', {
    id: props.id, type: props.type || 'text', value: props.value,
    onChange: props.onChange, autoComplete: props.autoComplete,
    required: props.required,
  });
  const Dialog = props => {
    dialogProps = props;
    return props.open ? React.createElement('section', { 'aria-label': 'Staff sign-in dialog' }, props.children) : null;
  };
  const DialogContent = props => {
    dialogContentProps = props;
    return React.createElement('div', null, props.children);
  };
  const base44 = { functions: { invoke: async () => loginResponse } };
  vm.runInNewContext(compiled, {
    module,
    localStorage,
    sessionStorage,
    require: name => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name === '@/api/base44Client') return { base44 };
      if (name === '@/components/ui/dialog') return {
        Dialog, DialogContent, DialogHeader: passthrough('DialogHeader'),
        DialogTitle: passthrough('DialogTitle'), DialogDescription: passthrough('DialogDescription'),
      };
      if (name === '@/components/ui/button') return { Button };
      if (name === '@/components/ui/input') return { Input };
      if (name === '@/components/ui/label') return { Label: passthrough('Label') };
      if (name === 'lucide-react') return icons;
      throw new Error('Unexpected import ' + name);
    },
  });
  let tree;
  return {
    async mount() {
      await act(async () => {
        tree = Renderer.create(React.createElement(module.exports.AuthProvider, { children: React.createElement('main', null, 'Staff app') }));
        await Promise.resolve();
      });
    },
    get dialogProps() { return dialogProps; },
    get dialogContentProps() { return dialogContentProps; },
    tree: () => tree,
    async close() { await act(async () => tree?.unmount()); },
  };
}

test('outside taps and Escape do not dismiss staff sign-in; browse remains explicit', async () => {
  const h = harness();
  try {
    await h.mount();
    assert(h.tree().root.findByProps({ 'aria-label': 'Staff sign-in dialog' }));
    const calls = [];
    h.dialogProps.onOpenChange(false);
    h.dialogContentProps.onInteractOutside({ preventDefault: () => calls.push('outside') });
    h.dialogContentProps.onEscapeKeyDown({ preventDefault: () => calls.push('escape') });
    assert.deepEqual(calls, ['outside', 'escape']);
    assert(h.tree().root.findByProps({ 'aria-label': 'Staff sign-in dialog' }));
    const browse = h.tree().root.findAllByType('button').at(-1);
    await act(async () => browse.props.onClick());
    assert.equal(h.tree().root.findAllByProps({ 'aria-label': 'Staff sign-in dialog' }).length, 0);
  } finally { await h.close(); }
});

test('successful credentials still close the sign-in dialog', async () => {
  const h = harness({ loginResponse: { data: { success: true, token: 'synthetic-token', user: { id: 'staff', username: 'staff' } } } });
  try {
    await h.mount();
    const form = h.tree().root.findByType('form');
    await act(async () => form.props.onSubmit({ preventDefault() {} }));
    assert.equal(h.tree().root.findAllByProps({ 'aria-label': 'Staff sign-in dialog' }).length, 0);
    assert.equal(h.tree().root.findByType('main').children[0], 'Staff app');
  } finally { await h.close(); }
});
