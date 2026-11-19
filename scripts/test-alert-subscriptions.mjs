// Unit checks for base44/shared/alertSubscriptionsModel.ts (masterplan H-12):
// per-user alert subscriptions on NotificationPreference.subscriptions[] —
// registry coverage, normalize/match incl. criteria, fan-out deliveries,
// dedupe-by-signature patch.
// esbuild-bundle pattern — same as test-vendor-notify.mjs.
//
// Run: node scripts/test-alert-subscriptions.mjs  →  prints "PASS alert-subscriptions"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-alert-subscriptions-model.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/alertSubscriptionsModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  SUBSCRIBABLE_EVENTS,
  SUBSCRIPTION_DELIVERIES,
  SUBSCRIPTIONS_MAX,
  DEFAULT_DELIVERY,
  eventRegistryEntry,
  subscribableEventKeys,
  normalizeEventKey,
  normalizeDelivery,
  normalizeCriteria,
  normalizeSubscription,
  subscriptionSignature,
  subscriptionsForUser,
  matchesSubscription,
  deliveriesFor,
  subscriptionPatch,
} = await import(pathToFileURL(out).href);

const pref = (user_email, subscriptions) => ({ user_email, subscriptions });

// ---------------------------------------------------------------------------
// registry — spec'd ten + emitter-kind coverage
// ---------------------------------------------------------------------------
const REQUIRED = [
  'client_change_request',
  'client_file_upload',
  'customer_payment',
  'estimate_approved',
  'estimate_declined',
  'proof_ready',
  'po_created',
  'work_order_stage_change',
  'overdue_invoice',
  'estimate_follow_up_due',
];
for (const key of REQUIRED) {
  assert.ok(eventRegistryEntry(key), `registry covers ${key}`);
  assert.equal(eventRegistryEntry(key).key, key, `registry key ${key}`);
}
// Extended coverage — kinds already emitted by sibling WS-H models:
// readyTriggerModel (estimate_ready/proof_ready), vendorNotifyModel
// (po_created/quote_request/feedback_sent/file_uploaded), paymentReminderModel
// (payment_due_5day/payment_past_due).
for (const key of ['estimate_ready', 'quote_request', 'feedback_sent', 'file_uploaded', 'payment_due_5day', 'payment_past_due']) {
  assert.ok(eventRegistryEntry(key), `registry covers emitter kind ${key}`);
}
assert.equal(SUBSCRIBABLE_EVENTS.length, subscribableEventKeys().length, 'keys() mirrors registry');
for (const e of SUBSCRIBABLE_EVENTS) {
  assert.ok(e.label && e.entity, `entry ${e.key} has label+entity`);
  assert.ok(Array.isArray(e.criteria_schema.fields), `entry ${e.key} declares criteria fields`);
}
assert.equal(eventRegistryEntry('nonsense'), null, 'unknown key → null');
assert.equal(eventRegistryEntry('PO.Created').key, 'po_created', 'registry lookup normalizes');
assert.deepEqual([...SUBSCRIPTION_DELIVERIES], ['feed', 'digest', 'both'], 'delivery lanes');
assert.equal(DEFAULT_DELIVERY, 'feed');
assert.ok(SUBSCRIPTIONS_MAX >= 50, 'bounded list cap');

// ---------------------------------------------------------------------------
// normalizeEventKey / normalizeDelivery / normalizeCriteria
// ---------------------------------------------------------------------------
assert.equal(normalizeEventKey('PO.Created'), 'po_created', 'dots collapse');
assert.equal(normalizeEventKey('Client Change-Request'), 'client_change_request', 'space/dash collapse');
assert.equal(normalizeEventKey(''), '');
assert.equal(normalizeEventKey(null), '');

assert.equal(normalizeDelivery('digest'), 'digest');
assert.equal(normalizeDelivery('BOTH'), 'both');
assert.equal(normalizeDelivery('in_app'), 'feed', 'alias → feed');
assert.equal(normalizeDelivery('daily'), 'digest', 'alias → digest');
assert.equal(normalizeDelivery('email-whatever'), 'feed', 'unknown → feed default (fail-visible)');
assert.equal(normalizeDelivery(undefined), 'feed', 'missing → default');

assert.deepEqual(normalizeCriteria({ vendor_id: ' v1 ', stage: 'sent' }), { vendor_id: 'v1', stage: 'sent' }, 'values trimmed');
assert.deepEqual(normalizeCriteria({ 'Vendor ID': 'v1' }), { vendor_id: 'v1' }, 'keys normalized');
assert.deepEqual(normalizeCriteria({ a: '', b: null, c: 'x' }), { c: 'x' }, 'empty values dropped');
assert.deepEqual(normalizeCriteria({ who: [' a ', '', 'b'] }), { who: ['a', 'b'] }, 'any-of arrays cleaned');
assert.deepEqual(normalizeCriteria('nope'), {}, 'non-object → {}');
assert.deepEqual(normalizeCriteria(undefined), {});

// ---------------------------------------------------------------------------
// normalizeSubscription — legacy shapes
// ---------------------------------------------------------------------------
assert.deepEqual(
  normalizeSubscription({ event_key: 'po_created', criteria: { vendor_id: 'v1' }, delivery: 'digest' }),
  { event_key: 'po_created', criteria: { vendor_id: 'v1' }, delivery: 'digest', enabled: true },
  'canonical form round-trips',
);
assert.equal(normalizeSubscription('po_created').event_key, 'po_created', 'bare string sub');
assert.equal(normalizeSubscription('po_created').delivery, 'feed', 'bare string → feed');
assert.equal(normalizeSubscription({ event: 'proof_ready' }).event_key, 'proof_ready', 'legacy {event}');
assert.equal(normalizeSubscription({ kind: 'proof_ready' }).event_key, 'proof_ready', 'legacy {kind}');
assert.equal(normalizeSubscription({ type: 'proof_ready' }).event_key, 'proof_ready', 'legacy {type}');
assert.deepEqual(
  normalizeSubscription({ event_key: 'po_created', filters: { vendor_id: 'v1' } }).criteria,
  { vendor_id: 'v1' },
  'legacy {filters} → criteria',
);
assert.equal(normalizeSubscription({ event_key: 'po_created', channel: 'digest' }).delivery, 'digest', 'legacy {channel}');
assert.equal(normalizeSubscription({ event_key: 'po_created', enabled: false }).enabled, false, 'enabled:false honored');
assert.equal(normalizeSubscription({ event_key: 'po_created', disabled: true }).enabled, false, 'legacy {disabled:true}');
assert.equal(normalizeSubscription({ event_key: 'po_created' }).enabled, true, 'default enabled');
assert.equal(
  normalizeSubscription({ event_key: 'po_created', created_by: 'a@b.co', created_at: '2026-01-01T00:00:00Z' }).created_by,
  'a@b.co',
  'audit fields carried',
);
assert.equal(normalizeSubscription(null).event_key, '', 'null → keyless');
assert.equal(normalizeSubscription(42).event_key, '', 'numeric → keyless');

// ---------------------------------------------------------------------------
// subscriptionsForUser — normalization + dedupe by signature
// ---------------------------------------------------------------------------
{
  const row = pref('a@shop.com', [
    'po_created',
    { event_key: 'po_created' },                       // identical → dedupes
    { event_key: 'po_created', criteria: { vendor_id: 'v1' } }, // different criteria → kept
    { event_key: 'proof_ready', enabled: false },
    {},                                                // keyless junk → dropped
  ]);
  const subs = subscriptionsForUser(row);
  assert.equal(subs.length, 3, 'dedupe identical subs, keep distinct criteria');
  assert.equal(subs[2].enabled, false, 'disabled sub kept (UI needs it)');
  assert.equal(subs[0].event_key, 'po_created', 'insertion order stable');
}
assert.deepEqual(subscriptionsForUser(null), [], 'null pref → []');
assert.deepEqual(subscriptionsForUser({}), [], 'no subs field → []');
assert.equal(subscriptionsForUser(['proof_ready']).length, 1, 'bare array tolerated');
assert.equal(
  subscriptionsForUser({ user_email: 'x@y.co', alert_subscriptions: ['po_created'] }).length,
  1,
  'legacy alert_subscriptions field read',
);

// ---------------------------------------------------------------------------
// subscriptionSignature — event_key + canonical criteria
// ---------------------------------------------------------------------------
assert.equal(subscriptionSignature('po_created'), 'po_created|');
assert.equal(
  subscriptionSignature({ event_key: 'po_created', criteria: { b: '2', a: '1' } }),
  subscriptionSignature({ event_key: 'po_created', criteria: { a: '1', b: '2' } }),
  'criteria key order irrelevant',
);
assert.notEqual(
  subscriptionSignature({ event_key: 'po_created', criteria: { vendor_id: 'v1' } }),
  subscriptionSignature({ event_key: 'po_created', criteria: { vendor_id: 'v2' } }),
  'different criteria → different signature',
);
assert.notEqual(
  subscriptionSignature({ event_key: 'po_created' }),
  subscriptionSignature({ event_key: 'proof_ready' }),
  'different kind → different signature',
);

// ---------------------------------------------------------------------------
// matchesSubscription — kind + criteria
// ---------------------------------------------------------------------------
assert.equal(matchesSubscription('po_created', { kind: 'po_created' }), true, 'kind match, empty criteria = match all');
assert.equal(matchesSubscription('po_created', { kind: 'proof_ready' }), false, 'kind mismatch');
assert.equal(matchesSubscription({ event_key: 'po_created', enabled: false }, { kind: 'po_created' }), false, 'disabled never fires');
assert.equal(matchesSubscription({ event_key: '' }, { kind: 'po_created' }), false, 'keyless sub fails closed');
assert.equal(matchesSubscription('po_created', {}), false, 'keyless event fails closed');
assert.equal(
  matchesSubscription({ event_key: 'po_created', criteria: { vendor_id: 'v1' } }, { kind: 'po_created', vendor_id: 'v1' }),
  true,
  'criteria field equal → match',
);
assert.equal(
  matchesSubscription({ event_key: 'po_created', criteria: { vendor_id: 'v1' } }, { kind: 'po_created', vendor_id: 'v2' }),
  false,
  'criteria field unequal → no match',
);
assert.equal(
  matchesSubscription({ event_key: 'po_created', criteria: { vendor_id: 'v1' } }, { kind: 'po_created' }),
  false,
  'missing event field fails closed',
);
assert.equal(
  matchesSubscription(
    { event_key: 'po_created', criteria: { vendor_id: 'v1', created_by: 'b@shop.com' } },
    { kind: 'po_created', vendor_id: 'v1', created_by: 'b@shop.com' },
  ),
  true,
  'every criterion must match — all do',
);
assert.equal(
  matchesSubscription(
    { event_key: 'po_created', criteria: { vendor_id: 'v1', created_by: 'b@shop.com' } },
    { kind: 'po_created', vendor_id: 'v1', created_by: 'c@shop.com' },
  ),
  false,
  'every criterion must match — one fails',
);
assert.equal(
  matchesSubscription({ event_key: 'po_created', criteria: { vendor_id: 'V1' } }, { kind: 'po_created', vendor_id: 'v1' }),
  true,
  'normalized equality is case-insensitive',
);
assert.equal(
  matchesSubscription({ event_key: 'work_order_stage_change', criteria: { to_stage: 'Installation' } }, { kind: 'work_order_stage_change', to_stage: 'installation' }),
  true,
  'stage criteria normalized',
);
assert.equal(
  matchesSubscription({ event_key: 'po_created', criteria: { vendor_id: ['v1', 'v2'] } }, { kind: 'po_created', vendor_id: 'v2' }),
  true,
  'any-of array criterion',
);
assert.equal(
  matchesSubscription({ event_key: 'client_file_upload', criteria: { file_kind: 'artwork' } }, { kind: 'client_file_upload', file_kind: ['artwork', 'brief'] }),
  true,
  'event array field contains criterion',
);
assert.equal(
  matchesSubscription({ event_key: 'x', criteria: { 'customer.id': 'c1' } }, { kind: 'x', customer: { id: 'c1' } }),
  true,
  'dotted criteria path walks event',
);
// bare-string event arg + {type|event} spellings
assert.equal(matchesSubscription('proof_ready', 'proof_ready'), true, 'bare-string event kind');
assert.equal(matchesSubscription('proof_ready', { type: 'proof_ready' }), true, '{type} kind spelling');
assert.equal(matchesSubscription('proof_ready', { event: 'proof_ready' }), true, '{event} kind spelling');
// unknown-but-consistent keys still match (forward compatibility — registry
// does not gate matching)
assert.equal(matchesSubscription({ event_key: 'future_kind' }, { kind: 'future_kind' }), true, 'unknown-kind sub matches same-kind event');

// ---------------------------------------------------------------------------
// deliveriesFor — fan-out across pref rows
// ---------------------------------------------------------------------------
{
  const prefs = [
    pref('alice@shop.com', [{ event_key: 'po_created' }]),
    pref('bob@shop.com', [{ event_key: 'po_created', delivery: 'digest' }]),
    pref('carol@shop.com', [{ event_key: 'proof_ready' }]),
    pref('dan@shop.com', [
      { event_key: 'po_created', criteria: { vendor_id: 'v1' }, delivery: 'feed' },
      { event_key: 'po_created', delivery: 'digest' }, // different signature — match-all digest sub
    ]),
    pref('erin@shop.com', [{ event_key: 'po_created', enabled: false }]),
    pref('', [{ event_key: 'po_created' }]),            // no identity → skipped
    { subscriptions: [{ event_key: 'po_created' }] },   // no identity → skipped
  ];
  const out = deliveriesFor({ kind: 'po_created', vendor_id: 'v1' }, prefs);
  assert.equal(out.length, 3, 'fan-out: matching users only (disabled skipped, identity-less skipped)');
  const byUser = Object.fromEntries(out.map((d) => [d.user_id, d.delivery]));
  assert.equal(byUser['alice@shop.com'], 'feed', 'alice → feed');
  assert.equal(byUser['bob@shop.com'], 'digest', 'bob → digest');
  assert.equal(byUser['dan@shop.com'], 'both', 'dan feed+digest subs merge → both');
  assert.equal(out[0].user_id <= out[1].user_id && out[1].user_id <= out[2].user_id, true, 'sorted by user_id');
  assert.equal(out[0].user_email, out[0].user_id, 'user_email mirrors user_id');
}
{
  // criteria narrows fan-out: only the sub whose criteria the event satisfies fires
  const prefs = [
    pref('alice@shop.com', [{ event_key: 'po_created', criteria: { vendor_id: 'v9' } }]),
    pref('bob@shop.com', [{ event_key: 'po_created', criteria: { vendor_id: 'v1' } }]),
  ];
  const out = deliveriesFor({ kind: 'po_created', vendor_id: 'v1' }, prefs);
  assert.deepEqual(out.map((d) => d.user_id), ['bob@shop.com'], 'criteria mismatch excludes user');
}
{
  assert.deepEqual(deliveriesFor({ kind: 'po_created' }, null), [], 'null prefs → []');
  assert.deepEqual(deliveriesFor(null, [pref('a@b.co', ['po_created'])]), [], 'keyless event → []');
  // 'both' single-lane sub stays 'both'
  const out = deliveriesFor({ kind: 'proof_ready' }, [pref('a@b.co', [{ event_key: 'proof_ready', delivery: 'both' }])]);
  assert.equal(out[0].delivery, 'both', 'both-lane sub → both');
}

// ---------------------------------------------------------------------------
// subscriptionPatch — add/replace by signature, audit stamps, bound
// ---------------------------------------------------------------------------
{
  const row = pref('a@shop.com', []);
  const p1 = subscriptionPatch(row, { event_key: 'po_created' }, { actor_id: 'admin@shop.com', now: '2026-11-02T12:00:00Z' });
  assert.equal(p1.subscriptions.length, 1, 'add appends');
  assert.equal(p1.subscriptions[0].created_by, 'admin@shop.com', 'created_by stamped');
  assert.equal(p1.subscriptions[0].updated_by, 'admin@shop.com', 'updated_by stamped');
  assert.equal(p1.subscriptions[0].created_at, '2026-11-02T12:00:00Z', 'created_at stamped');
  assert.equal(p1.subscriptions[0].updated_at, '2026-11-02T12:00:00Z', 'updated_at stamped');
  assert.equal(row.subscriptions.length, 0, 'input row not mutated');

  // identical sub (same signature) → replace in place, not a second entry
  const p2 = subscriptionPatch(
    { subscriptions: p1.subscriptions },
    { event_key: 'po_created', delivery: 'digest' },
    { actor_id: 'admin@shop.com', now: '2026-11-02T13:00:00Z' },
  );
  assert.equal(p2.subscriptions.length, 1, 'identical signature replaces — no dup');
  assert.equal(p2.subscriptions[0].delivery, 'digest', 'replace refreshes delivery');
  assert.equal(p2.subscriptions[0].created_at, '2026-11-02T12:00:00Z', 'replace preserves created_at');
  assert.equal(p2.subscriptions[0].updated_at, '2026-11-02T13:00:00Z', 'replace refreshes updated_at');

  // same event, different criteria → a second sub
  const p3 = subscriptionPatch(
    { subscriptions: p2.subscriptions },
    { event_key: 'po_created', criteria: { vendor_id: 'v1' } },
    { now: '2026-11-02T14:00:00Z' },
  );
  assert.equal(p3.subscriptions.length, 2, 'distinct criteria coexists');
}
{
  // legacy mess on the row normalizes through the patch
  const row = { subscriptions: ['proof_ready', { event: 'po_created', filters: { vendor_id: 'v1' } }] };
  const p = subscriptionPatch(row, { event_key: 'proof_ready', delivery: 'digest' }, { now: 1762128000000 });
  assert.equal(p.subscriptions.length, 2, 'legacy entries normalized + deduped through patch');
  assert.equal(p.subscriptions[0].delivery, 'digest', 'replaced legacy string sub');
  assert.equal(typeof p.subscriptions[0].created_at, 'string', 'epoch-ms now → ISO stamp');
}
{
  // cap: over SUBSCRIPTIONS_MAX the oldest entries drop FIFO
  const many = Array.from({ length: SUBSCRIPTIONS_MAX }, (_, i) => ({
    event_key: 'po_created',
    criteria: { n: `n${i}` },
  }));
  const p = subscriptionPatch({ subscriptions: many }, { event_key: 'proof_ready' }, {});
  assert.equal(p.subscriptions.length, SUBSCRIPTIONS_MAX, 'list bounded at SUBSCRIPTIONS_MAX');
  assert.equal(p.subscriptions[0].criteria.n, 'n1', 'oldest dropped FIFO');
  assert.equal(p.subscriptions[SUBSCRIPTIONS_MAX - 1].event_key, 'proof_ready', 'new sub lands');
}

rmSync(out);
console.log('PASS alert-subscriptions');
