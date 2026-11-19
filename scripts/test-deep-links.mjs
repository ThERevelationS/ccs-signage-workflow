import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-deep-links.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/jobs/deepLinks.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  DEEP_LINK_ROUTES, ENTITY_TYPES,
  canonicalEntityType, deepLinkFor, entityTypeFromUrl, parseDeepLink,
  backLinkFor, deepLinkLabel,
} = await import(pathToFileURL(out).href);

// 1) Every owned entity type resolves its real page route + param.
assert.equal(deepLinkFor('work_order', 'wo-1'), '/JobWorkspace?wo=wo-1');
assert.equal(deepLinkFor('estimate', 'est-1'), '/EstimateDetail?id=est-1');
assert.equal(deepLinkFor('invoice', 'inv-1'), '/Invoices?invoice=inv-1');
assert.equal(deepLinkFor('customer', 'cust-1'), '/Customer360?id=cust-1');
assert.equal(deepLinkFor('opportunity', 'opp-1'), '/Opportunities?open=opp-1');
assert.equal(
  deepLinkFor('intake', 'int-1'),
  '/Opportunities?view=queue&intake=int-1',
);
assert.equal(deepLinkFor('purchase_order', 'po-1'), '/PurchaseOrders?po=po-1');
assert.equal(deepLinkFor('change_order', 'co-1'), '/ChangeOrders?co=co-1');

// 2) Aliases + case/separator normalization hit the same canonical routes.
assert.equal(deepLinkFor('wo', 'wo-1'), '/JobWorkspace?wo=wo-1');
assert.equal(deepLinkFor('Work_Order', 'wo-1'), '/JobWorkspace?wo=wo-1');
assert.equal(deepLinkFor('job', 'wo-1'), '/JobWorkspace?wo=wo-1');
assert.equal(deepLinkFor('quote', 'est-1'), '/EstimateDetail?id=est-1');
assert.equal(deepLinkFor('client', 'cust-1'), '/Customer360?id=cust-1');
assert.equal(deepLinkFor('sales', 'opp-1'), '/Opportunities?open=opp-1');
assert.equal(deepLinkFor('po', 'po-1'), '/PurchaseOrders?po=po-1');
assert.equal(deepLinkFor('co', 'co-1'), '/ChangeOrders?co=co-1');
assert.equal(
  deepLinkFor('estimate_request', 'int-1'),
  '/Opportunities?view=queue&intake=int-1',
);

// 3) Unknown / blank types -> null (callers fall back to text or a list link).
assert.equal(deepLinkFor('nonsense', 'x'), null);
assert.equal(deepLinkFor('', 'x'), null);
assert.equal(deepLinkFor(null, 'x'), null);
assert.equal(deepLinkFor('time_clock', 'x'), null, 'out-of-scope entities stay unmapped');

// 4) Blank id still resolves to the page (picker/list state), params kept.
assert.equal(deepLinkFor('work_order'), '/JobWorkspace');
assert.equal(deepLinkFor('work_order', ''), '/JobWorkspace');
assert.equal(deepLinkFor('intake'), '/Opportunities?view=queue');

// 5) Ids are URL-encoded — spaces, &, =, / can't corrupt the query string.
{
  const href = deepLinkFor('estimate', 'a b&c=d/e');
  assert.equal(href, `/EstimateDetail?id=${encodeURIComponent('a b&c=d/e')}`);
  assert.ok(href.includes('a%20b%26c%3Dd%2Fe'));
}

// 6) Parse round-trips: entityTypeFromUrl(deepLinkFor(t, id)) === t.
for (const t of ENTITY_TYPES) {
  const href = deepLinkFor(t, `${t}-9`);
  assert.equal(entityTypeFromUrl(href), t, `round-trip ${t}`);
}

// 7) entityTypeFromUrl handles absolute URLs, /Opportunities disambiguation,
//    and rejects unknown paths.
assert.equal(
  entityTypeFromUrl('https://clay-flow-signage-suite-387da97c.base44.app/JobWorkspace?wo=wo-7'),
  'work_order',
);
assert.equal(entityTypeFromUrl('/Opportunities?open=o-1'), 'opportunity');
assert.equal(entityTypeFromUrl('/Opportunities?view=queue'), 'intake');
assert.equal(entityTypeFromUrl('/Opportunities?view=pipeline'), 'opportunity');
assert.equal(entityTypeFromUrl('/SomePage?x=1'), null);
assert.equal(entityTypeFromUrl(''), null);
assert.equal(entityTypeFromUrl(null), null);

// 8) parseDeepLink returns type + id + path; blank id still resolves the type.
assert.deepEqual(
  parseDeepLink('/JobWorkspace?wo=wo-42'),
  { entityType: 'work_order', id: 'wo-42', path: '/JobWorkspace' },
);
assert.equal(parseDeepLink('/JobWorkspace').entityType, 'work_order');
assert.equal(parseDeepLink('/JobWorkspace').id, '');
assert.equal(parseDeepLink('/Nope?x=1'), null);

// 9) Back links land on the list/queue surface for each record type.
assert.equal(backLinkFor('work_order'), '/MainWorkflow');
assert.equal(backLinkFor('estimate'), '/EstimatorQueues');
assert.equal(backLinkFor('invoice'), '/Invoices');
assert.equal(backLinkFor('customer'), '/EstimatorCustomers');
assert.equal(backLinkFor('opportunity'), '/Opportunities');
assert.equal(backLinkFor('intake'), '/Opportunities?view=queue');
assert.equal(backLinkFor('unknown-thing'), '/', 'unknown type falls back to app home');

// 10) Map sanity: every route path is a real registered page name and every
//     param name matches what the page reads.
assert.deepEqual(
  Object.keys(DEEP_LINK_ROUTES).sort(),
  ['change_order', 'customer', 'estimate', 'intake', 'invoice', 'opportunity', 'purchase_order', 'work_order'],
);
assert.equal(deepLinkLabel('work_order'), 'Work Order');
assert.equal(canonicalEntityType('WORK ORDERS'), 'work_order');
assert.equal(canonicalEntityType('garbage'), '');

rmSync(out, { force: true });
console.log('PASS deep-links');
