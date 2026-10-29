import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '.tmp-quote-lifecycle.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/quoteLifecycle.js')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const { localDateStamp, quoteIssueKey, resolveQuoteIssueMetadata, quoteExpirationDate, isQuoteExpired, formatQuoteIssueDate } =
  await import(pathToFileURL(bundlePath).href);

assert.equal(localDateStamp(new Date(2026, 9, 27)), '2026-10-27', 'date stamp pads month');
assert.equal(localDateStamp('2026-01-05T12:00:00Z').length, 10, 'stamp shape');

assert.equal(quoteIssueKey('abc', 3), 'estimate:abc:quote:v3', 'issue key');
assert.equal(quoteIssueKey('abc', 0), '', 'v0 yields no key');
assert.equal(quoteIssueKey('', 2), '', 'missing id yields no key');

// Version bumps ONLY on transition into sent or completed-while-sent revision.
assert.deepEqual(
  resolveQuoteIssueMetadata({ previousStatus: 'calculated', nextStatus: 'sent', currentVersion: 0, today: '2026-10-27' }),
  { quote_version: 1, quote_issue_date: '2026-10-27' }, 'first send issues v1');
assert.deepEqual(
  resolveQuoteIssueMetadata({ previousStatus: 'sent', nextStatus: 'sent', currentVersion: 2, today: '2026-10-28', completingSentRevision: true }),
  { quote_version: 3, quote_issue_date: '2026-10-28' }, 'completed sent revision re-issues');
assert.deepEqual(
  resolveQuoteIssueMetadata({ previousStatus: 'sent', nextStatus: 'sent', currentVersion: 2, today: '2026-10-28' }),
  {}, 'plain save while sent does NOT re-issue');
assert.deepEqual(
  resolveQuoteIssueMetadata({ previousStatus: 'sent', nextStatus: 'approved', currentVersion: 1 }),
  {}, 'approval does not bump version');
assert.deepEqual(
  resolveQuoteIssueMetadata({ previousStatus: 'draft', nextStatus: 'draft', currentVersion: 0 }),
  {}, 'draft saves never issue');

assert.equal(quoteExpirationDate('2026-10-01', 30), '2026-10-31', 'expiry = issue + valid days');
assert.equal(quoteExpirationDate('2026-12-31', 1), '2027-01-01', 'expiry crosses year boundary');
assert.equal(quoteExpirationDate('not-a-date', 30), '', 'bad date yields empty');
assert.equal(quoteExpirationDate('', 30, new Date(2026, 0, 15)), '2026-02-14', 'fallback date used');

assert.equal(isQuoteExpired('2026-10-01', 30, '2026-11-01'), true, 'day after expiry is expired');
assert.equal(isQuoteExpired('2026-10-01', 30, '2026-10-31'), false, 'on expiry day still valid');
assert.equal(isQuoteExpired('2026-10-01', 30, '2026-10-15'), false, 'mid-window valid');

assert.equal(formatQuoteIssueDate('2026-10-27'), '10/27/2026', 'formats US date');
assert.equal(formatQuoteIssueDate('garbage'), 'garbage', 'non-ISO passes through');
assert.equal(typeof formatQuoteIssueDate(''), 'string', 'blank falls back to today');

console.log('PASS quote lifecycle (17 cases)');
