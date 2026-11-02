import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mod = await import(
  pathToFileURL(resolve(here, '../base44/shared/opportunityFoundationPersistence.mjs')).href
);
const {
  sameFoundationValue,
  expectedFoundationFields,
  replaceFoundationFieldsIfUnchanged,
} = mod;

// ---------------------------------------------------------------------------
// L-03: undefined / null / "" are ONE empty class inside sameFoundationValue.
// Storage persists unset fields as null (or omits the key); CAS baselines and
// clean()ed payloads carry ""/undefined for the same unset value. Strict
// representation compare caused real FIELD_CONFLICT failures on back-stamps.
// ---------------------------------------------------------------------------

// --- the empty class: every pairing of the three representations is equal
assert.equal(sameFoundationValue(undefined, null), true, 'undefined ~ null');
assert.equal(sameFoundationValue(null, undefined), true, 'null ~ undefined');
assert.equal(sameFoundationValue(null, ''), true, 'null ~ ""');
assert.equal(sameFoundationValue('', null), true, '"" ~ null');
assert.equal(sameFoundationValue(undefined, ''), true, 'undefined ~ ""');
assert.equal(sameFoundationValue('', undefined), true, '"" ~ undefined');
assert.equal(sameFoundationValue('', ''), true, '"" ~ ""');
assert.equal(sameFoundationValue(null, null), true, 'null ~ null');
assert.equal(sameFoundationValue(undefined, undefined), true, 'undefined ~ undefined');

// --- real values never enter the empty class
assert.equal(sameFoundationValue('a', ''), false, '"a" != ""');
assert.equal(sameFoundationValue('', 'a'), false, '"" != "a"');
assert.equal(sameFoundationValue('a', null), false, '"a" != null');
assert.equal(sameFoundationValue('a', undefined), false, '"a" != undefined');
assert.equal(sameFoundationValue(0, ''), false, '0 != "" (zero is a real value)');
assert.equal(sameFoundationValue(0, null), false, '0 != null');
assert.equal(sameFoundationValue(0, undefined), false, '0 != undefined');
assert.equal(sameFoundationValue('0', ''), false, '"0" != ""');
assert.equal(sameFoundationValue(false, null), false, 'false != null');
assert.equal(sameFoundationValue(false, ''), false, 'false != ""');
assert.equal(sameFoundationValue(false, undefined), false, 'false != undefined');
assert.equal(sameFoundationValue({ a: 1 }, null), false, '{a:1} != null');
assert.equal(sameFoundationValue({ a: 1 }, ''), false, '{a:1} != ""');
assert.equal(sameFoundationValue({}, null), false, '{} is a stored payload, not unset');
assert.equal(sameFoundationValue([], null), false, '[] is a stored value, not unset');
assert.equal(sameFoundationValue([], ''), false, '[] != ""');
assert.equal(sameFoundationValue(' ', null), false, 'whitespace-only string is not in the empty class');

// --- arrays: order/length semantics preserved
assert.equal(sameFoundationValue([1, 2], [1, 2]), true, 'same arrays equal');
assert.equal(sameFoundationValue([1, 2], [2, 1]), false, 'array order matters');
assert.equal(sameFoundationValue(['a'], ['a', 'b']), false, 'array length matters');
assert.equal(sameFoundationValue([], []), true, 'empty arrays equal');
assert.equal(sameFoundationValue(['x'], []), false, 'non-empty array != empty array');
// NB: [null] ~ [] via Number() coercion (0 ~ 0) — a pre-existing numeric-branch
// quirk, deliberately unchanged by L-03.
assert.equal(sameFoundationValue({ a: null }, { a: '' }), false, 'nested empties stay strict');
assert.equal(sameFoundationValue({ a: null }, {}), false, 'nested null != absent key');

// --- numeric tolerance still applies to non-empty numeric pairs
assert.equal(sameFoundationValue('1.0000000001', 1), true, 'numeric tolerance ~1e-10');
assert.equal(sameFoundationValue(2, '2'), true, '"2" ~ 2');
assert.equal(sameFoundationValue(1, 2), false, '1 != 2');
assert.equal(sameFoundationValue(1.000001, 1), true, 'within epsilon');
assert.equal(sameFoundationValue(1.00001, 1), false, 'outside epsilon');

// --- deep-value semantics preserved for non-empty objects
assert.equal(sameFoundationValue('abc', 'abc'), true);
assert.equal(sameFoundationValue('abc', 'abd'), false);
assert.equal(sameFoundationValue({ b: 1, a: 2 }, { a: 2, b: 1 }), true, 'key order normalized');
assert.equal(sameFoundationValue({ a: 1 }, { a: 2 }), false);

// ---------------------------------------------------------------------------
// Mini CAS scenario: replaceFoundationFieldsIfUnchanged with an in-memory
// entity. Proves the ?? "" vs null defect family is fixed at the root:
// a baseline captured as null/"" no longer conflicts when storage holds the
// field absent (undefined) — and vice versa — while a genuinely divergent
// stored value still conflicts.
// ---------------------------------------------------------------------------
const makeEntity = (initial) => {
  const record = { id: 'rec-1', updated_date: 'v1', ...initial };
  return {
    record,
    entity: {
      get: async () => ({ ...record }),
      updateMany: async (query, update) => {
        if (query?.id !== record.id || query?.updated_date !== record.updated_date) return { updated: 0 };
        Object.assign(record, update?.$set || {});
        record.updated_date = 'v2';
        return { updated: 1 };
      },
    },
  };
};

{
  // Stored: estimate_id key ABSENT (record.get -> undefined). Baseline:
  // expected null (the `?? null` representation). Previously: guaranteed
  // FIELD_CONFLICT on every back-stamp attempt. Now: write proceeds.
  const { entity, record } = makeEntity({ name: 'Acme' });
  assert.equal('estimate_id' in record, false, 'field absent in storage');
  const desired = { estimate_id: 'est-9' };
  const expected = expectedFoundationFields({ estimate_id: null }, desired);
  assert.deepEqual(expected, { estimate_id: null });
  const saved = await replaceFoundationFieldsIfUnchanged({
    entity, recordId: 'rec-1', expectedFields: expected, nextFields: desired,
    label: 'mini CAS (stored-missing vs expected-null)', maxAttempts: 1,
  });
  assert.equal(saved.estimate_id, 'est-9', 'CAS write lands');
  assert.equal(record.estimate_id, 'est-9', 'stored value updated');
}

{
  // Inverse: stored null, baseline "" (clean() output from a stale UI).
  const { entity, record } = makeEntity({ estimate_id: null });
  const saved = await replaceFoundationFieldsIfUnchanged({
    entity, recordId: 'rec-1',
    expectedFields: { estimate_id: '' },
    nextFields: { estimate_id: 'est-10' },
    label: 'mini CAS (stored-null vs expected-"")', maxAttempts: 1,
  });
  assert.equal(saved.estimate_id, 'est-10', 'baseline "" matches stored null');
  assert.equal(record.estimate_id, 'est-10');
}

{
  // Desired-empty vs stored-absent: alreadyDesired short-circuits, no write.
  const { entity, record } = makeEntity({ name: 'Acme' });
  const saved = await replaceFoundationFieldsIfUnchanged({
    entity, recordId: 'rec-1',
    expectedFields: { note: null },
    nextFields: { note: '' },
    label: 'mini CAS (desired-empty vs stored-absent)', maxAttempts: 1,
  });
  assert.equal(saved.note, undefined, 'returns current, field stays absent');
  assert.equal('note' in record, false, 'no write churned an absent field');
  assert.equal(record.updated_date, 'v1', 'no version bump on no-op');
}

{
  // A genuinely divergent stored value STILL conflicts — the empty class only
  // merges the three empty representations, it does not weaken real CAS.
  const { entity } = makeEntity({ estimate_id: 'est-other' });
  await assert.rejects(
    replaceFoundationFieldsIfUnchanged({
      entity, recordId: 'rec-1',
      expectedFields: { estimate_id: null },
      nextFields: { estimate_id: 'est-9' },
      label: 'mini CAS (real divergence)', maxAttempts: 1,
    }),
    (err) => err?.code === 'OPPORTUNITY_FOUNDATION_FIELD_CONFLICT'
      && /changed in another session/.test(err?.message || ''),
    'real concurrent write still raises FIELD_CONFLICT',
  );
}

{
  // alreadyDesired on a real match returns current untouched.
  const { entity, record } = makeEntity({ estimate_id: 'est-9' });
  const saved = await replaceFoundationFieldsIfUnchanged({
    entity, recordId: 'rec-1',
    expectedFields: { estimate_id: '' },
    nextFields: { estimate_id: 'est-9' },
    label: 'mini CAS (already desired)', maxAttempts: 1,
  });
  assert.equal(saved.estimate_id, 'est-9');
  assert.equal(record.updated_date, 'v1', 'no write when already desired');
}

console.log('PASS samevalue-emptyclass (55 cases)');
