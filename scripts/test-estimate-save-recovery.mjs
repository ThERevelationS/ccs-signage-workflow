import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-estimate-save-recovery.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/estimator/estimateSaveRecovery.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { estimateSaveComparableState, estimateServerMatchesIntendedSave, estimateSaveLifecycleBaseline, intendedQuoteIssueMetadata } =
  await import(pathToFileURL(out).href);

// Comparable state strips system fields + undefined, sorts keys, normalizes.
{
  const state = estimateSaveComparableState({ id: 'x', updated_date: 'v', z: 1, a: undefined, b: '2' });
  assert.deepEqual(Object.keys(state), ['b', 'z'], 'sorted, systems excluded, undefined dropped');
}
assert.equal(
  estimateServerMatchesIntendedSave({ id: 'a', updated_date: '1', name: 'X' }, { name: 'X', extra_undefined: undefined }),
  true, 'system/undefined diffs ignored');
assert.equal(
  estimateServerMatchesIntendedSave({ name: 'X' }, { name: 'Y' }),
  false, 'real drift detected');

// Baseline precedence: revision snapshot > pending transition > server record.
{
  const rev = { estimate_snapshot_before: { status: 'sent' } };
  const pend = { estimateBefore: { status: 'draft' } };
  const srv = { status: 'archived' };
  assert.equal(estimateSaveLifecycleBaseline({ serverRecord: srv, openRevision: rev }).status, 'sent', 'revision wins');
  assert.equal(estimateSaveLifecycleBaseline({ serverRecord: srv, pendingTransition: pend }).status, 'draft', 'pending next');
  assert.equal(estimateSaveLifecycleBaseline({ serverRecord: srv }).status, 'archived', 'server fallback');
}

// intendedQuoteIssueMetadata: pending metadata short-circuits resolution.
{
  const resolver = (args) => ({ quote_version: 9, quote_issue_date: 'X', _args: args });
  const meta = intendedQuoteIssueMetadata({
    resolveQuoteIssueMetadata: resolver,
    pendingTransition: { quoteIssueMetadata: { quote_version: 3, quote_issue_date: '2026-10-01' } },
  });
  assert.equal(meta.quote_version, 3, 'persisted pending metadata kept verbatim');
}
{
  const resolver = ({ previousStatus, nextStatus, currentVersion }) =>
    previousStatus !== 'sent' && nextStatus === 'sent' ? { quote_version: currentVersion + 1 } : {};
  const meta = intendedQuoteIssueMetadata({
    resolveQuoteIssueMetadata: resolver,
    serverRecord: { status: 'calculated', quote_version: 0 },
    localEstimate: { status: 'sent' },
  });
  assert.equal(meta.quote_version, 1, 'transition resolved against baseline');
}

console.log('PASS estimate save recovery (11 cases)');
