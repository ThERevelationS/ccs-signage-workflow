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
const countCards = (html) => (html.match(/class="[^"]*clay-card[^"]*"/g) || []).length;
const mixed = render([...open, ...received], true, 2);
assert.match(mixed, /aria-label="Open orders"/);
assert.match(mixed, /aria-label="Received order history"/);
assert.match(mixed, /Received history, 120 orders\. Expand/);
assert.doesNotMatch(mixed, /All Orders — Not Received|History — Received/);
assert.equal(countCards(mixed), 2, 'Collapsed History must not render 120 hidden cards');
assert.doesNotMatch(mixed, /Received 119/);
console.log('PASS mobile default displays separate active/history sections and does not render hidden historical cards');

const onlyHistory = render(received, true, 0);
assert.match(onlyHistory, /No open orders/);
assert.equal(countCards(onlyHistory), 0);
const onlyOpen = render(open, true, 2);
assert.match(onlyOpen, /aria-label="Received order history"/);
assert.doesNotMatch(onlyOpen, /aria-controls="order-history-mobile-items"/);
assert.equal(countCards(onlyOpen), 2);
console.log('PASS zero-open and zero-history mobile views have meaningful empty states');

const receivedFilter = render(received, false, 0);
assert.equal(countCards(receivedFilter), 100);
assert.match(receivedFilter, /Show next 100 \(20 remaining\)/);
console.log('PASS unsplit received-only mobile view initially renders at most 100 cards');

const translatedNeeded = render([{ id: 'translated-needed', customer_name: 'Translated Needed', status: 'pending', date_needed_option: 'ASAP' }], false, 0);
assert.match(translatedNeeded, /Needed: <span class="text-gray-700">ASAP<\/span>/);
const translatedNeededWins = render([{ id: 'translated-needed-wins', customer_name: 'Translated Needed Wins', status: 'pending', date_needed: '2026-10-01', date_needed_option: 'In Stock' }], false, 0);
assert.match(translatedNeededWins, /Needed: <span class="text-gray-700">In Stock<\/span>/);
assert.doesNotMatch(translatedNeededWins, /Oct 1, 2026/);
console.log('PASS mobile cards display translated Date Needed choices and prefer them over stale paired dates');

const unnamedCustomer = render([{ id: 'unnamed-customer', customer_name: '', status: 'pending' }], false, 0);
assert.match(unnamedCustomer, />Unnamed customer<\/p>/,
  'mobile cards should visibly identify orders whose customer name is blank');
assert.match(unnamedCustomer, /aria-label="Open order details for unnamed customer"/,
  'unnamed-customer fallback should remain aligned with the card action label');
console.log('PASS mobile cards visibly identify blank customer names instead of rendering an empty heading');
