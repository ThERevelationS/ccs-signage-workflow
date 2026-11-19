// Unit checks for base44/shared/digestBatchModel.ts (masterplan H-13):
// per-user digest batching over H-12 alert subscriptions — lane split
// (feed/digest/both), per-user grouping, dedupe keys, alreadyDigested,
// composeDigest shape, and parity with alertSubscriptionsModel.deliveriesFor.
// esbuild-bundle pattern — same as test-alert-subscriptions.mjs.
//
// Run: node scripts/test-digest-batch.mjs  →  prints "PASS digest-batch"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-digest-batch-model.mjs');
const outSubs = resolve(here, '.tmp-digest-batch-subs.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/digestBatchModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
buildSync({
  entryPoints: [resolve(here, '../base44/shared/alertSubscriptionsModel.ts')],
  bundle: true, format: 'esm', outfile: outSubs, logLevel: 'silent',
});
const {
  DIGEST_KIND,
  DIGEST_CATEGORY,
  DIGEST_SOURCE_EVENT,
  DIGEST_DEEP_LINK,
  DIGEST_KIND_LABELS,
  normalizeDay,
  userKeyFor,
  digestDedupeKey,
  eventDedupeKey,
  digestItemFor,
  eventLanes,
  immediateCandidates,
  digestCandidates,
  composeDigest,
  alreadyDigested,
} = await import(pathToFileURL(out).href);
const { deliveriesFor } = await import(pathToFileURL(outSubs).href);

const pref = (user_email, subscriptions, extra = {}) => ({ user_email, subscriptions, ...extra });
const DAY = '2026-11-02';
const NOW = { now: '2026-11-02T15:04:00Z' };

// ---------------------------------------------------------------------------
// constants / normalizeDay / userKeyFor
// ---------------------------------------------------------------------------
assert.equal(DIGEST_KIND, 'daily_digest');
assert.equal(DIGEST_CATEGORY, 'digest');
assert.equal(DIGEST_SOURCE_EVENT, 'daily_digest');
assert.equal(DIGEST_DEEP_LINK, '/MainWorkflow');
assert.equal(DIGEST_KIND_LABELS.po_created, 'Purchase order created', 'kind label parity with H-12 registry');

assert.equal(normalizeDay(DAY), DAY, 'YYYY-MM-DD passes verbatim');
assert.equal(normalizeDay('2026-11-02T23:59:00Z').length, 10, 'ISO datetime → day');
assert.equal(normalizeDay('2026-11-02T15:04:00Z'), '2026-11-02', 'ISO datetime → its day');
assert.equal(normalizeDay(''), '', 'blank → empty');
assert.equal(normalizeDay(null), '', 'null → empty');

assert.equal(userKeyFor(pref('Alice@Shop.com', [])), 'alice@shop.com', 'user_email lowercased');
assert.equal(userKeyFor({ user_id: 'Bob@Shop.com' }), 'bob@shop.com', 'user_id fallback');
assert.equal(userKeyFor('Carol@Shop.com'), 'carol@shop.com', 'bare string user');
assert.equal(userKeyFor({}), '', 'no identity → empty');

// ---------------------------------------------------------------------------
// digestDedupeKey / eventDedupeKey
// ---------------------------------------------------------------------------
assert.equal(
  digestDedupeKey('alice@shop.com', DAY),
  'digest:alice@shop.com:2026-11-02',
  'canonical dedupe key shape',
);
assert.equal(
  digestDedupeKey('Alice@Shop.com', DAY),
  'digest:alice@shop.com:2026-11-02',
  'user normalized in key',
);
assert.equal(digestDedupeKey('a@b.co', '2026-11-02T05:00:00Z'), 'digest:a@b.co:2026-11-02', 'datetime day normalized');
assert.notEqual(
  digestDedupeKey('a@b.co', '2026-11-02'),
  digestDedupeKey('a@b.co', '2026-11-03'),
  'different day → different key',
);
assert.equal(
  eventDedupeKey('a@b.co', { kind: 'po_created', id: 'po1' }),
  'alert:a@b.co:po_created:po1',
  'immediate dedupe key embeds ref',
);
assert.equal(
  eventDedupeKey('a@b.co', { kind: 'po_created', id: 'po1' }),
  eventDedupeKey('a@b.co', { kind: 'PO.Created', id: 'po1' }),
  'kind normalized in event key',
);
assert.notEqual(
  eventDedupeKey('a@b.co', { kind: 'po_created', id: 'po1' }),
  eventDedupeKey('b@b.co', { kind: 'po_created', id: 'po1' }),
  'per-user keys differ',
);
assert.equal(
  eventDedupeKey('a@b.co', { kind: 'po_created', title: 'X' }),
  eventDedupeKey('a@b.co', { kind: 'po_created', title: 'X' }),
  'id-less event → stable content hash',
);

// ---------------------------------------------------------------------------
// eventLanes — feed / digest / both split
// ---------------------------------------------------------------------------
{
  const prefs = [
    pref('feed@shop.com', [{ event_key: 'po_created', delivery: 'feed' }]),
    pref('dig@shop.com', [{ event_key: 'po_created', delivery: 'digest' }]),
    pref('both@shop.com', [{ event_key: 'po_created', delivery: 'both' }]),
    pref('split@shop.com', [
      { event_key: 'po_created', criteria: { vendor_id: 'v1' }, delivery: 'feed' },
      { event_key: 'po_created', delivery: 'digest' }, // match-all digest sub
    ]),
    pref('off@shop.com', [{ event_key: 'po_created', delivery: 'digest', enabled: false }]),
    pref('other@shop.com', [{ event_key: 'proof_ready', delivery: 'both' }]),
    pref('', [{ event_key: 'po_created', delivery: 'both' }]), // no identity
  ];
  const lanes = eventLanes({ kind: 'po_created', vendor_id: 'v1' }, prefs);
  assert.deepEqual(lanes.feed_users, ['both@shop.com', 'feed@shop.com', 'split@shop.com'], 'feed lane = feed + both subs');
  assert.deepEqual(lanes.digest_users, ['both@shop.com', 'dig@shop.com', 'split@shop.com'], 'digest lane = digest + both subs');
  assert.deepEqual(lanes.overlap, ['both@shop.com', 'split@shop.com'], 'both-lane and merged feed+digest → overlap');
}
{
  // 'both' via two separate subs — they need distinct criteria signatures to
  // coexist (identical subs dedupe last-wins inside subscriptionsForUser)
  const lanes = eventLanes({ kind: 'po_created', vendor_id: 'v2' }, [
    pref('u@shop.com', [
      { event_key: 'po_created', criteria: { vendor_id: 'v2' }, delivery: 'feed' },
      { event_key: 'po_created', delivery: 'digest' }, // different signature — match-all
    ]),
  ]);
  assert.deepEqual(lanes.overlap, ['u@shop.com'], 'feed+digest subs merge into both lanes');
  // identical subs collapse last-wins — a stored feed+identical-digest pair
  // normalizes to digest-only, same as H-12 deliveriesFor
  const collapsed = eventLanes({ kind: 'po_created' }, [
    pref('w@shop.com', [
      { event_key: 'po_created', delivery: 'feed' },
      { event_key: 'po_created', delivery: 'digest' },
    ]),
  ]);
  assert.deepEqual(collapsed.digest_users, ['w@shop.com'], 'same-signature subs dedupe to last (digest)');
  assert.deepEqual(collapsed.feed_users, [], 'deduped feed sub does not survive');
}
{
  assert.deepEqual(eventLanes({ kind: 'po_created' }, null), { digest_users: [], feed_users: [], overlap: [] }, 'null prefs → empty lanes');
  assert.deepEqual(eventLanes({}, [pref('a@b.co', ['po_created'])]), { digest_users: [], feed_users: [], overlap: [] }, 'keyless event fails closed');
}

// ---------------------------------------------------------------------------
// immediateCandidates — feed lane owns the per-event send
// ---------------------------------------------------------------------------
{
  const prefs = [
    pref('feed@shop.com', [{ event_key: 'po_created' }]),                    // default feed
    pref('dig@shop.com', [{ event_key: 'po_created', delivery: 'digest' }]),
    pref('both@shop.com', [{ event_key: 'po_created', delivery: 'both' }]),
    pref('nomatch@shop.com', [{ event_key: 'proof_ready' }]),
  ];
  const out = immediateCandidates([{ kind: 'po_created', id: 'po1' }], prefs);
  assert.equal(out.length, 2, 'feed-only + both → 2 immediate sends');
  assert.deepEqual(out.map((c) => c.user), ['both@shop.com', 'feed@shop.com'], 'sorted by user; digest-only excluded');
  assert.equal(out[0].user_id, out[0].user, 'user_id mirrors user');
  assert.equal(out[0].user_email, out[0].user, 'user_email mirrors user');
  assert.equal(out[0].event_key, 'po_created', 'event_key normalized');
  assert.equal(out[0].dedupe_key, 'alert:both@shop.com:po_created:po1', 'per-user-event dedupe key');
  assert.equal(out[0].event.id, 'po1', 'raw event carried');
}
{
  // one NOTIFICATION row per user per event — a 'both' user gets ONE row
  const out = immediateCandidates(
    [{ kind: 'po_created', id: 'po9' }],
    [pref('both@shop.com', [{ event_key: 'po_created', delivery: 'both' }])],
  );
  assert.equal(out.length, 1, 'both → exactly one immediate row, not two');
}

// ---------------------------------------------------------------------------
// digestCandidates — per-user grouping
// ---------------------------------------------------------------------------
{
  const prefs = [
    pref('dig@shop.com', [{ event_key: 'po_created', delivery: 'digest' }, { event_key: 'proof_ready', delivery: 'digest' }], { digest_opt_in: true }),
    pref('both@shop.com', [{ event_key: 'po_created', delivery: 'both' }]),
    pref('feed@shop.com', [{ event_key: 'po_created' }]),                    // feed only → never digest
  ];
  const events = [
    { kind: 'po_created', id: 'po1' },
    { kind: 'proof_ready', id: 'pr1', title: 'Proof ready — monument sign' },
    { kind: 'po_created', id: 'po1' }, // duplicate event → collapses per user
  ];
  const out = digestCandidates(events, prefs, NOW);
  assert.equal(out.length, 2, 'digest-lane users only');
  assert.equal(out[0].user, 'both@shop.com', 'sorted by user');
  assert.equal(out[1].user, 'dig@shop.com');
  assert.deepEqual(out[0].events.map((e) => e.id), ['po1'], 'both-user: matching po only, dup collapsed');
  assert.deepEqual(out[1].events.map((e) => e.id), ['po1', 'pr1'], 'dig-user: both kinds grouped, input order');
  assert.equal(out[1].items.length, 2, 'items mirror events');
  assert.equal(out[1].items[1].title, 'Proof ready — monument sign', 'event title carried into item');
  assert.equal(out[1].day, DAY, 'day stamped from now');
  assert.equal(out[1].dedupe_key, 'digest:dig@shop.com:2026-11-02', 'dedupe key stamped');
  assert.equal(out[1].opted_in, true, 'digest_opt_in surfaced');
  assert.equal(out[0].opted_in, false, 'missing digest_opt_in → opted_in false');
}
{
  // require_opt_in filters to opted-in users only
  const prefs = [
    pref('in@shop.com', [{ event_key: 'po_created', delivery: 'digest' }], { digest_opt_in: true }),
    pref('out@shop.com', [{ event_key: 'po_created', delivery: 'digest' }], { digest_opt_in: false }),
    pref('unset@shop.com', [{ event_key: 'po_created', delivery: 'digest' }]),
  ];
  const all = digestCandidates([{ kind: 'po_created', id: 'p1' }], prefs, NOW);
  assert.equal(all.length, 3, 'default: delivery decides, opt-in surfaced not enforced');
  const gated = digestCandidates([{ kind: 'po_created', id: 'p1' }], prefs, { ...NOW, require_opt_in: true });
  assert.deepEqual(gated.map((c) => c.user), ['in@shop.com'], 'require_opt_in keeps opted-in only');
  const lastDate = digestCandidates([{ kind: 'po_created', id: 'p1' }],
    [pref('u@shop.com', [{ event_key: 'po_created', delivery: 'digest' }], { last_digest_date: '2026-11-01' })], NOW);
  assert.equal(lastDate[0].last_digest_date, '2026-11-01', 'last_digest_date surfaced for the writer');
}
{
  // feed-only subs never produce digest candidates (immediate lane owns them)
  const out = digestCandidates([{ kind: 'po_created', id: 'p1' }], [pref('f@shop.com', [{ event_key: 'po_created' }])], NOW);
  assert.deepEqual(out, [], 'feed-only → no digest candidate');
  assert.deepEqual(digestCandidates([{ kind: 'po_created' }], null, NOW), [], 'null prefs → []');
}

// ---------------------------------------------------------------------------
// digestItemFor — {title, deep_link, kind}
// ---------------------------------------------------------------------------
{
  assert.deepEqual(
    digestItemFor({ kind: 'po_created', title: 'PO 1042 to FastSigns', deep_link: '/PurchaseOrders?po=po1' }),
    { title: 'PO 1042 to FastSigns', deep_link: '/PurchaseOrders?po=po1', kind: 'po_created' },
    'item shape',
  );
  assert.equal(digestItemFor({ kind: 'po_created' }).title, 'Purchase order created', 'registry label fallback');
  assert.equal(digestItemFor({ kind: 'future_kind' }).title, 'Future kind', 'unknown kind humanized');
  assert.equal(digestItemFor({ link: '/X' }).deep_link, '/X', 'link alias');
  assert.equal(digestItemFor({ url: '/Y' }).deep_link, '/Y', 'url alias');
  assert.equal(digestItemFor(null).title, 'Notification', 'junk → fallback title');
}

// ---------------------------------------------------------------------------
// composeDigest — subject/body/items/context/notification_row
// ---------------------------------------------------------------------------
{
  const d = composeDigest('Dig@Shop.com', [
    { kind: 'po_created', id: 'po1', title: 'PO 1042 issued', deep_link: '/PurchaseOrders?po=po1' },
    { kind: 'proof_ready', id: 'pr1' },
    { kind: 'po_created', id: 'po1', title: 'PO 1042 issued' }, // dup collapses
  ], NOW);
  assert.equal(d.subject, 'Daily digest — 2 items', 'subject counts deduped items');
  assert.equal(d.items.length, 2, 'items deduped');
  assert.deepEqual(d.items[0], { title: 'PO 1042 issued', deep_link: '/PurchaseOrders?po=po1', kind: 'po_created' }, 'item shape');
  assert.equal(d.items[1].title, 'Proof ready for customer', 'label fallback in digest');
  assert.ok(d.body.includes('PO 1042 issued'), 'body lists item title');
  assert.ok(d.body.includes('2 items'), 'body counts items');
  assert.equal(d.day, DAY, 'day stamped');
  assert.equal(d.dedupe_key, 'digest:dig@shop.com:2026-11-02', 'top-level dedupe key');
  // templateRender context — {items, user, date}
  assert.equal(d.context.date, DAY, 'context.date');
  assert.equal(d.context.user.email, 'dig@shop.com', 'context.user.email');
  assert.equal(d.context.user.user_id, 'dig@shop.com', 'context.user.user_id');
  assert.equal(d.context.count, 2, 'context.count');
  assert.equal(d.context.items.length, 2, 'context.items');
  // notification_row — Notification entity shape parity
  const row = d.notification_row;
  assert.equal(row.kind, 'daily_digest', 'spec: kind daily_digest');
  assert.equal(row.category, 'digest', 'NOTIF_CATEGORIES parity');
  assert.equal(row.recipient_email, 'dig@shop.com', 'recipient lowercased');
  assert.equal(row.title, d.subject, 'title = subject');
  assert.equal(row.body, d.body, 'body = body');
  assert.equal(row.deep_link, '/MainWorkflow', 'deployed parity');
  assert.equal(row.source_event, 'daily_digest', 'deployed parity');
  assert.equal(row.dedupe_key, 'digest:dig@shop.com:2026-11-02', 'row dedupe key');
  assert.equal(row.creation_request_key, 'notif:digest:dig@shop.com:2026-11-02', 'creation key mirrors dedupe');
  assert.equal(row.meta.total, 2, 'meta.total');
  assert.deepEqual(row.meta.counts, { po_created: 1, proof_ready: 1 }, 'meta.counts by kind');
  assert.equal(row.meta.day, DAY, 'meta.day');
  assert.equal(row.created_by, 'daily_digest', 'created_by parity');
  assert.equal(row.severity, 'info', 'severity info');
}
{
  const single = composeDigest('a@b.co', [{ kind: 'po_created', id: 'p1' }], NOW);
  assert.equal(single.subject, 'Daily digest — 1 item', 'singular item');
  assert.ok(single.body.startsWith('1 item needs attention'), 'singular grammar');
  const empty = composeDigest('a@b.co', [], NOW);
  assert.equal(empty.subject, 'Daily digest — 0 items', 'empty digest');
  assert.ok(empty.body.includes('Nothing new'), 'empty body');
}

// ---------------------------------------------------------------------------
// alreadyDigested — one digest per user per day
// ---------------------------------------------------------------------------
{
  const day = DAY;
  const rowFor = (over = {}) => ({ recipient_email: 'u@shop.com', category: 'digest', ...over });
  // canonical key
  assert.equal(alreadyDigested([rowFor({ dedupe_key: 'digest:u@shop.com:2026-11-02' })], 'u@shop.com', day), true, 'canonical key match');
  // deployed daily_digest writer key '<user>:digest:<day>'
  assert.equal(alreadyDigested([rowFor({ dedupe_key: 'u@shop.com:digest:2026-11-02', source_event: 'daily_digest' })], 'u@shop.com', day), true, 'deployed writer key match');
  // record()-prefixed canonical key '<user>:digest:<user>:<day>'
  assert.equal(alreadyDigested([rowFor({ dedupe_key: 'u@shop.com:digest:u@shop.com:2026-11-02' })], 'u@shop.com', day), true, 'record-prefixed key match');
  // marker + meta.day fallback (a differently-keyed digest row)
  assert.equal(alreadyDigested([rowFor({ dedupe_key: 'notif:random', meta: { day } })], 'u@shop.com', day), true, 'meta.day fallback');
  // marker + created day fallback
  assert.equal(alreadyDigested([rowFor({ source_event: 'daily_digest', created_date: '2026-11-02T08:00:00Z' })], 'u@shop.com', day), true, 'created-day fallback');
  // another user's digest does not suppress
  assert.equal(alreadyDigested([{ recipient_email: 'other@shop.com', dedupe_key: 'digest:other@shop.com:2026-11-02' }], 'u@shop.com', day), false, 'other user ignored');
  // a different day's digest does not suppress
  assert.equal(alreadyDigested([rowFor({ dedupe_key: 'digest:u@shop.com:2026-11-01' })], 'u@shop.com', day), false, 'prior day ignored');
  // non-digest rows on the same day do not count
  assert.equal(alreadyDigested([{ recipient_email: 'u@shop.com', category: 'quote_approved', created_date: '2026-11-02T01:00:00Z', dedupe_key: 'x' }], 'u@shop.com', day), false, 'non-digest row ignored');
  assert.equal(alreadyDigested([], 'u@shop.com', day), false, 'no rows → false');
  assert.equal(alreadyDigested(null, 'u@shop.com', day), false, 'null rows → false');
  assert.equal(alreadyDigested([rowFor({ dedupe_key: 'digest:u@shop.com:2026-11-02' })], '', day), false, 'blank user → false');
  assert.equal(alreadyDigested([rowFor({ dedupe_key: 'digest:u@shop.com:2026-11-02' })], 'u@shop.com', ''), false, 'blank day → false');
}

// ---------------------------------------------------------------------------
// parity vs alertSubscriptionsModel.deliveriesFor — lane membership must be
// identical to the H-12 fan-out on the same fixtures.
// ---------------------------------------------------------------------------
{
  const prefs = [
    pref('a@shop.com', [{ event_key: 'po_created', delivery: 'feed' }]),
    pref('b@shop.com', [{ event_key: 'po_created', delivery: 'digest' }]),
    pref('c@shop.com', [{ event_key: 'po_created', delivery: 'both' }]),
    pref('d@shop.com', [
      { event_key: 'po_created', criteria: { vendor_id: 'v1' }, delivery: 'feed' },
      { event_key: 'po_created', delivery: 'digest' },
    ]),
    pref('e@shop.com', [{ event_key: 'proof_ready' }]),
  ];
  const event = { kind: 'po_created', vendor_id: 'v1', id: 'poX' };
  const lanes = eventLanes(event, prefs);
  const merged = Object.fromEntries(deliveriesFor(event, prefs).map((r) => [r.user_id, r.delivery]));
  for (const [user, delivery] of Object.entries(merged)) {
    const inFeed = lanes.feed_users.includes(user);
    const inDigest = lanes.digest_users.includes(user);
    const wantFeed = delivery === 'feed' || delivery === 'both';
    const wantDigest = delivery === 'digest' || delivery === 'both';
    assert.equal(inFeed, wantFeed, `parity: ${user} feed lane (${delivery})`);
    assert.equal(inDigest, wantDigest, `parity: ${user} digest lane (${delivery})`);
    assert.equal(lanes.overlap.includes(user), delivery === 'both', `parity: ${user} overlap (${delivery})`);
  }
}

// ---------------------------------------------------------------------------
// end-to-end invariant — dedupe vs individual sends: an event feeds digest
// OR immediate per pref; 'both' users get one feed row + a digest ITEM (not
// a second send); the digest row itself is one row per user per day.
// ---------------------------------------------------------------------------
{
  const prefs = [
    pref('feed@shop.com', [{ event_key: 'po_created' }]),
    pref('dig@shop.com', [{ event_key: 'po_created', delivery: 'digest' }], { digest_opt_in: true }),
    pref('both@shop.com', [{ event_key: 'po_created', delivery: 'both' }]),
  ];
  const events = [{ kind: 'po_created', id: 'po7' }];
  const imm = immediateCandidates(events, prefs);
  const dig = digestCandidates(events, prefs, NOW);
  const immUsers = imm.map((c) => c.user).sort();
  const digUsers = dig.map((c) => c.user).sort();
  assert.deepEqual(immUsers, ['both@shop.com', 'feed@shop.com'], 'immediate = feed + both');
  assert.deepEqual(digUsers, ['both@shop.com', 'dig@shop.com'], 'digest = digest + both');
  // 'both' user: exactly one feed row + one digest item — never two sends
  assert.equal(imm.filter((c) => c.user === 'both@shop.com').length, 1, 'both → one feed row');
  const bothDigest = composeDigest(dig.find((c) => c.user === 'both@shop.com').user, dig.find((c) => c.user === 'both@shop.com').events, NOW);
  assert.equal(bothDigest.items.length, 1, 'both → event appears once in digest items');
  // digest-only user has NO feed row
  assert.equal(imm.some((c) => c.user === 'dig@shop.com'), false, 'digest-only → no immediate send');
  // feed-only user is NOT a digest candidate
  assert.equal(dig.some((c) => c.user === 'feed@shop.com'), false, 'feed-only → not in digest');
  // already-written digest row suppresses a second digest for the day
  assert.equal(alreadyDigested([bothDigest.notification_row], 'both@shop.com', DAY), true, 'composed row suppresses resend');
}

rmSync(out);
rmSync(outSubs);
console.log('PASS digest-batch');
