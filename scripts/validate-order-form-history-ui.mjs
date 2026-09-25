import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Bundle only the presentational mobile card component into ignored local cache.
// No Base44 network/API calls, database writes or DOM/browser are involved.
const outfile = resolve('node_modules/.cache/ccs-order-mobile-history-ssr.mjs');
await mkdir(dirname(outfile), { recursive: true });
await build({
  entryPoints: ['src/components/orders/OrderMobileCards.jsx'],
  bundle: true,
  packages: 'external',
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  outfile,
  logLevel: 'silent',
});
const { default: OrderMobileCards } = await import(pathToFileURL(outfile).href);
const open = Array.from({ length: 2 }, (_, index) => ({
  id: 'open-' + index,
  customer_name: 'Open ' + index,
  status: 'pending',
}));
const received = Array.from({ length: 120 }, (_, index) => ({
  id: 'received-' + index,
  customer_name: 'Received ' + index,
  date_received: '2026-09-24',
}));
const render = (orders, split, openCount) =>
  renderToStaticMarkup(React.createElement(OrderMobileCards, {
    orders, separateHistory: split, openCount,
  }));
const countCards = (html) => (html.match(/clay-card p-4/g) || []).length;
const mixed = render([...open, ...received], true, 2);
assert.match(mixed, /All Orders — Not Received/);
assert.match(mixed, /History — Received/);
assert.match(mixed, /Show received history \(120\)/);
assert.equal(countCards(mixed), 2, 'Collapsed History must not render 120 hidden cards');
assert.doesNotMatch(mixed, /Received 119/);
console.log('PASS mobile default displays separate active/history sections and does not render hidden historical cards');

const onlyHistory = render(received, true, 0);
assert.match(onlyHistory, /No outstanding Orders match this view/);
assert.equal(countCards(onlyHistory), 0);
const onlyOpen = render(open, true, 2);
assert.match(onlyOpen, /No received Orders match this view/);
assert.equal(countCards(onlyOpen), 2);
console.log('PASS zero-open and zero-history mobile views have meaningful empty states');

const receivedFilter = render(received, false, 0);
assert.equal(countCards(receivedFilter), 100);
assert.match(receivedFilter, /Show next 100 \(20 remaining\)/);
console.log('PASS unsplit received-only mobile view initially renders at most 100 cards');
