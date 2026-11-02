// Contract checks for masterplan item K-03 — per-user account preferences:
// the account prefs model's normalize / merge / persist-shape, per-user
// write isolation (user A's save can never re-key user B's row),
// defaults-when-empty, timezone validation, and parity of the account
// subscription normalizer against the canonical H-12 shared model.
//
// Bundles userPrefsModel.js (zero imports — Node-clean) plus the canonical
// base44/shared/alertSubscriptionsModel.ts for the parity battery.
//
// Run: node scripts/test-user-prefs.mjs  →  prints "PASS user-prefs"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const outPrefs = resolve(here, '.tmp-user-prefs.mjs');
const outSubs = resolve(here, '.tmp-alert-subs.mjs');
const outWs = resolve(here, '.tmp-ws-prefs.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/account/userPrefsModel.js')],
  bundle: true, format: 'esm', outfile: outPrefs, logLevel: 'silent',
});
buildSync({
  entryPoints: [resolve(here, '../base44/shared/alertSubscriptionsModel.ts')],
  bundle: true, format: 'esm', outfile: outSubs, logLevel: 'silent',
});
buildSync({
  entryPoints: [resolve(here, '../src/components/layout/workspacePrefs.js')],
  bundle: true, format: 'esm', outfile: outWs, logLevel: 'silent',
});
const M = await import(pathToFileURL(outPrefs).href);
const S = await import(pathToFileURL(outSubs).href);
const W = await import(pathToFileURL(outWs).href);
const {
  IANA_TIMEZONE_SUGGESTIONS, ACCOUNT_QUEUE_LENSES, MY_QUEUE_TOKEN,
  ACCOUNT_SUBSCRIPTIONS_MAX, QUEUE_FILTER_INTENT_PARAMS,
  isValidIANATimezone, normalizeTimezone, timezoneFromPrefs, resolveTimezoneChoice,
  defaultQueuePrefs, normalizeQueuePrefs, queuePrefsFromWorkspace, queueDefaultsPatch,
  resolveQueueLens, urlHasQueueFilterIntent, shouldSeedMyQueue,
  NOTIFICATION_PREF_KEYS, notificationPrefsPatch,
  normalizeSubEventKey, normalizeSubDelivery, normalizeSubCriteria,
  normalizeAccountSubscription, accountSubscriptionSignature,
  accountSubscriptionsFor, subscriptionsPayload,
  accountSubscriptionUpsert, accountSubscriptionRemove,
  mergeAccountPrefs, normalizeEmailForPrefs,
  scopedUserWrite, workspacePrefsRowForWrite, applyScopedWrite,
} = M;
const {
  normalizeEventKey, normalizeDelivery, normalizeCriteria,
  normalizeSubscription, subscriptionSignature, subscriptionsForUser,
} = S;

const A = 'alice@shop.test';
const B = 'bob@shop.test';

// --- 1. timezone ---------------------------------------------------------------

{
  assert.equal(isValidIANATimezone('America/Chicago'), true, 'IANA zone valid');
  assert.equal(isValidIANATimezone('UTC'), true, 'UTC valid');
  assert.equal(isValidIANATimezone('  America/Denver '), true, 'surrounding space tolerated');
  assert.equal(isValidIANATimezone('Mars/Olympus_Mons'), false, 'nonsense zone rejected');
  assert.equal(isValidIANATimezone('CST6CDT,EST5EDT'), false, 'POSIX TZ string rejected');
  assert.equal(isValidIANATimezone(''), false, 'blank is not a zone (it means browser-local)');
  assert.equal(isValidIANATimezone(null), false);
  assert.equal(isValidIANATimezone(12345), false, 'non-string rejected');

  assert.equal(normalizeTimezone('America/Los_Angeles'), 'America/Los_Angeles', 'valid kept');
  assert.equal(normalizeTimezone('  America/New_York\t'), 'America/New_York', 'valid trimmed');
  assert.equal(normalizeTimezone('Mars/Olympus_Mons'), '', 'invalid persists as "" — never junk');
  assert.equal(normalizeTimezone(''), '', 'blank stays blank');
  assert.equal(normalizeTimezone(undefined), '');

  assert.equal(timezoneFromPrefs({ locale: { timezone: 'America/Phoenix' } }), 'America/Phoenix');
  assert.equal(timezoneFromPrefs({ locale: { timezone: 'Mars' } }), '', 'invalid stored value reads as unset');
  assert.equal(timezoneFromPrefs({}), '', 'missing locale subtree → ""');
  assert.equal(timezoneFromPrefs(null), '');

  assert.equal(resolveTimezoneChoice({ locale: { timezone: 'America/Anchorage' } }, 'America/Chicago'),
    'America/Anchorage', 'user pick beats company default');
  assert.equal(resolveTimezoneChoice({ locale: {} }, 'America/Chicago'), 'America/Chicago',
    'no user pick → company fallback');
  assert.equal(resolveTimezoneChoice({}, 'Mars/Base'), '', 'invalid company → browser local ("")');
  assert.ok(IANA_TIMEZONE_SUGGESTIONS.length >= 8 && IANA_TIMEZONE_SUGGESTIONS.includes('UTC'),
    'suggestion list populated');
}

// --- 2. queue defaults — normalize + resolution ---------------------------------

{
  assert.deepEqual(defaultQueuePrefs(), { defaultLens: '', myQueueOnly: false }, 'defaults when empty');
  assert.deepEqual(normalizeQueuePrefs(null), { defaultLens: '', myQueueOnly: false }, 'null → defaults');
  assert.deepEqual(normalizeQueuePrefs('junk'), { defaultLens: '', myQueueOnly: false }, 'junk → defaults');
  assert.deepEqual(normalizeQueuePrefs({}), { defaultLens: '', myQueueOnly: false });

  const qp = normalizeQueuePrefs({ defaultLens: 'production', myQueueOnly: true, futureKey: 7 });
  assert.equal(qp.defaultLens, 'production');
  assert.equal(qp.myQueueOnly, true);
  assert.equal(qp.futureKey, 7, 'unknown keys survive load/save (forward-compat)');
  assert.equal(normalizeQueuePrefs({ defaultLens: 'nonsense' }).defaultLens, '', 'bad lens → app default');
  assert.equal(normalizeQueuePrefs({ myQueueOnly: 1 }).myQueueOnly, false, 'strict boolean');
  // Tolerates the whole blob too — the subtree is picked out.
  assert.deepEqual(queuePrefsFromWorkspace({ locale: {}, queues: { defaultLens: 'fulfillment' } }),
    { defaultLens: 'fulfillment', myQueueOnly: false });
  assert.deepEqual(queuePrefsFromWorkspace(null), { defaultLens: '', myQueueOnly: false });

  // Patch is the deep-mergeable {queues:{…}} subtree — siblings can't be clobbered.
  assert.deepEqual(queueDefaultsPatch({ defaultLens: 'all', myQueueOnly: true }),
    { queues: { defaultLens: 'all', myQueueOnly: true } });
  const blob = { queues: { defaultLens: 'design', myQueueOnly: false, futureKey: 1 } };
  const patched = mergeAccountPrefs(blob, queueDefaultsPatch({ defaultLens: 'production' }));
  assert.equal(patched.queues.defaultLens, 'production', 'patch updates the stored subtree');
  assert.equal(patched.queues.futureKey, 1, 'patch merges — stored unknown keys kept');

  // resolveQueueLens: URL > stored pref > page fallback.
  assert.equal(resolveQueueLens({ queuePrefs: qp, urlLens: 'all', fallback: 'design' }), 'all', 'URL wins');
  assert.equal(resolveQueueLens({ queuePrefs: qp, urlLens: '', fallback: 'design' }), 'production', 'stored applies');
  assert.equal(resolveQueueLens({ queuePrefs: qp, urlLens: 'bogus', fallback: 'design' }), 'production',
    'invalid URL param falls to stored pref');
  assert.equal(resolveQueueLens({ queuePrefs: null, urlLens: '', fallback: 'design' }), 'design', 'fallback');
  assert.equal(resolveQueueLens({}), 'design', 'nothing → app default');
  for (const k of ACCOUNT_QUEUE_LENSES) {
    assert.equal(resolveQueueLens({ queuePrefs: { defaultLens: k } }), k, `every lens key resolves (${k})`);
  }

  // URL filter intent — ?queue= is tab selection, NOT intent; ?assigned=me is.
  const map = (o) => new URLSearchParams(Object.entries(o));
  assert.equal(urlHasQueueFilterIntent(map({ queue: 'production' })), false, 'tab param alone is not intent');
  assert.equal(urlHasQueueFilterIntent(map({ assigned: 'me' })), true, 'assigned=me is intent');
  assert.equal(urlHasQueueFilterIntent(map({ designer: 'sam' })), true);
  assert.equal(urlHasQueueFilterIntent(map({ q: 'sign' })), true);
  assert.equal(urlHasQueueFilterIntent(map({ status: 'in_production' })), true);
  assert.equal(urlHasQueueFilterIntent(map({})), false, 'empty params → no intent');
  assert.equal(urlHasQueueFilterIntent({ status: 'x' }), true, 'plain-object params accepted');
  assert.equal(urlHasQueueFilterIntent(null), false);
  for (const k of QUEUE_FILTER_INTENT_PARAMS) {
    assert.equal(urlHasQueueFilterIntent(map({ [k]: 'x' })), true, `intent param covered: ${k}`);
  }

  // shouldSeedMyQueue — the one-shot seed gate.
  assert.equal(shouldSeedMyQueue({ queuePrefs: { myQueueOnly: true }, params: map({}) }), true,
    'enabled + clean URL → seed');
  assert.equal(shouldSeedMyQueue({ queuePrefs: { myQueueOnly: true }, params: map({ status: 'x' }) }), false,
    'filter intent blocks the seed');
  assert.equal(shouldSeedMyQueue({ queuePrefs: { myQueueOnly: true }, params: map({ queue: 'all' }) }), true,
    'tab-only URL still seeds');
  assert.equal(shouldSeedMyQueue({ queuePrefs: { myQueueOnly: true }, params: map({}), seededAlready: true }), false,
    'one-shot: never re-seeds after it applied once');
  assert.equal(shouldSeedMyQueue({ queuePrefs: { myQueueOnly: false }, params: map({}) }), false, 'pref off → never');
  assert.equal(shouldSeedMyQueue({ queuePrefs: null, params: map({}) }), false);
  assert.equal(MY_QUEUE_TOKEN, 'me', 'marker parity with myQueueModel');
}

// --- 3. subscription normalize — parity with the canonical H-12 model -----------

{
  const keyCases = ['PO.Created', ' work_order_stage_change ', 'Client change-request', 'PO_CREATED', '', null];
  for (const k of keyCases) {
    assert.equal(normalizeSubEventKey(k), normalizeEventKey(k), `event-key parity: ${JSON.stringify(k)}`);
  }
  const delivCases = ['feed', 'digest', 'both', 'in_app', 'daily', 'all', 'Immediate', 'nonsense', '', null];
  for (const d of delivCases) {
    assert.equal(normalizeSubDelivery(d), normalizeDelivery(d), `delivery parity: ${JSON.stringify(d)}`);
  }
  const critCases = [
    { ' Work Order ': 'WO-1' }, { salesperson: [' Sam ', ''], 'stage.from': 'a' },
    { a: null, b: undefined, c: '', d: 5 }, 'junk', null, [{ k: 1 }],
    { 'customer_id': 42 },
  ];
  for (const c of critCases) {
    assert.deepEqual(normalizeSubCriteria(c), normalizeCriteria(c), `criteria parity: ${JSON.stringify(c)}`);
  }
  const subCases = [
    { event_key: 'po_created', criteria: { vendor_id: 'v1' }, delivery: 'digest', enabled: true },
    { event: 'PO.Created', filters: {}, channel: 'in_app' },
    { kind: 'proof_ready', when: { designer: 'Sam' }, via: 'all', disabled: true },
    { type: 'estimate_ready', active: false },
    { event_key: '' }, { nothing: true }, 'po_created', null, 7,
    { event_key: 'x', created_by: 'a@x', created_at: '2026-01-01T00:00:00Z' },
  ];
  for (const s of subCases) {
    assert.deepEqual(normalizeAccountSubscription(s), normalizeSubscription(s), `sub parity: ${JSON.stringify(s)}`);
    assert.equal(accountSubscriptionSignature(s), subscriptionSignature(s), `signature parity: ${JSON.stringify(s)}`);
  }

  // Read path parity: dedupe last-wins, keyless dropped, order stable.
  const stored = { subscriptions: [
    { event_key: 'po_created', delivery: 'feed' },
    { event: 'po_created', criteria: {}, delivery: 'digest' },   // same signature → replaces slot
    { event_key: 'proof_ready' },
    { event_key: '' },                                          // junk → dropped
    'estimate_ready',                                           // string shorthand
  ] };
  const mine = accountSubscriptionsFor(stored);
  const theirs = subscriptionsForUser(stored);
  assert.deepEqual(mine, theirs, 'accountSubscriptionsFor ≡ subscriptionsForUser');
  assert.equal(mine.length, 3, 'dedupe + junk drop');
  assert.equal(mine[0].delivery, 'digest', 'last write wins inside a signature');
  assert.equal(mine[2].event_key, 'estimate_ready');

  // Persist shape: bounded, normalized, and NEVER identity-bearing —
  // ownership is the server's session scope, not a client field.
  const payload = subscriptionsPayload([
    { event_key: 'proof_ready', delivery: 'both', enabled: true,
      user_email: 'evil@x.test', user: 'bob', owner: 'x', id: 'spoofed' },
    { event_key: 'po_created', criteria: { vendor_id: 'v9' } },
  ]);
  assert.equal(payload.length, 2);
  for (const s of payload) {
    assert.equal('user_email' in s || 'user' in s || 'owner' in s || 'id' in s, false,
      'persist shape carries no client-supplied identity');
    assert.deepEqual(Object.keys(s).sort(),
      ['criteria', 'delivery', 'enabled', 'event_key'].sort(), 'canonical keys only');
  }
  const overCap = Array.from({ length: ACCOUNT_SUBSCRIPTIONS_MAX + 25 }, (_, i) => ({ event_key: `ev_${i}` }));
  assert.equal(subscriptionsPayload(overCap).length, ACCOUNT_SUBSCRIPTIONS_MAX, 'SUBSCRIPTIONS_MAX cap');

  // Upsert/remove semantics the account UI writes with.
  let list = accountSubscriptionUpsert([], { event_key: 'po_created', delivery: 'feed' });
  list = accountSubscriptionUpsert(list, { event_key: 'po_created', delivery: 'both', enabled: true });
  assert.equal(list.length, 1, 'same signature replaces in place');
  assert.equal(list[0].delivery, 'both');
  const stamped = accountSubscriptionUpsert(list.map((s) => ({ ...s, created_by: A, created_at: 't0' })),
    { event_key: 'po_created', delivery: 'digest' });
  assert.equal(stamped[0].created_by, A, 'created_* preserved across replace');
  list = accountSubscriptionUpsert(list, { event_key: 'proof_ready' });
  assert.equal(list.length, 2, 'different event appends');
  assert.equal(accountSubscriptionRemove(list, { event_key: 'po_created' }).length, 1, 'remove by signature');
  assert.equal(accountSubscriptionRemove(list, { event_key: 'nope' }).length, 2, 'remove miss = no-op');
}

// --- 4. notificationPrefsPatch — partial-patch contract --------------------------

{
  assert.deepEqual(NOTIFICATION_PREF_KEYS, ['sound_on', 'digest_opt_in', 'subscriptions']);
  const p1 = notificationPrefsPatch({ sound_on: false });
  assert.deepEqual(Object.keys(p1), ['sound_on'], 'only supplied keys emitted — digest/subs untouched server-side');
  const p2 = notificationPrefsPatch({ digest_opt_in: true, sound_on: false });
  assert.deepEqual(p2, { digest_opt_in: true, sound_on: false });
  const p3 = notificationPrefsPatch({ subscriptions: [{ event_key: 'po_created', user_email: B }] });
  assert.equal(p3.subscriptions[0].event_key, 'po_created');
  assert.equal('user_email' in p3.subscriptions[0], false, 'subs patch strips client-supplied identity');
  assert.deepEqual(notificationPrefsPatch({}), {}, 'empty patch emits nothing');
  assert.deepEqual(notificationPrefsPatch({ sound_on: 'yes' }), {},
    'non-boolean sound_on rejected — the row is never written a junk type');
}

// --- 5. merge + persist shape — THE ISOLATION CONTRACT ---------------------------

{
  // mergeAccountPrefs: deep merge, objects merge, scalars replace.
  const base = { a: 1, locale: { timezone: 'America/Chicago' }, queues: { defaultLens: 'design' } };
  const merged = mergeAccountPrefs(base, { queues: { myQueueOnly: true } });
  assert.equal(merged.queues.myQueueOnly, true);
  assert.equal(merged.queues.defaultLens, 'design', 'sibling key survives a subtree patch');
  assert.equal(merged.locale.timezone, 'America/Chicago');
  assert.equal(merged.a, 1);
  assert.equal(base.queues.myQueueOnly, undefined, 'merge does not mutate the input');
  assert.equal(mergeAccountPrefs(null, { x: 1 }).x, 1, 'null base → patch object');
  assert.equal(mergeAccountPrefs({ x: 1 }, 'junk').x, 1, 'non-object patch on object → base kept');

  // scopedUserWrite — the server-side contract in model form.
  const write = scopedUserWrite(A, { preferences: { locale: { timezone: 'UTC' } } });
  assert.equal(write.user_email, A, 'actor owns the row');
  const hostile = scopedUserWrite(A, { user_email: B, preferences: { queues: { myQueueOnly: true } } });
  assert.equal(hostile.user_email, A,
    'a payload claiming another owner is overridden — B can never receive A\'s write');
  assert.throws(() => scopedUserWrite('', {}), /owner email/i, 'no actor → no write');
  assert.throws(() => scopedUserWrite(null, {}), /owner email/i);
  assert.equal(normalizeEmailForPrefs('  ALICE@Shop.Test '), A, 'identity normalized');

  // workspacePrefsRowForWrite — the persisted UserWorkspacePreferences row shape.
  const row = workspacePrefsRowForWrite(A, {
    preferences: { queues: { defaultLens: 'production' } },
    profiles: Array.from({ length: 30 }, (_, i) => ({ name: `p${i}` })),
    requestId: 'req-1',
  });
  assert.equal(row.user_email, A);
  assert.equal(row.schema_version, 1);
  assert.equal(row.preferences.queues.defaultLens, 'production');
  assert.equal(row.profiles.length, 20, 'profiles bounded');
  assert.equal(row.last_request_id, 'req-1', 'request idempotency stamp');
  assert.equal('creation_request_key' in row, false, 'deterministic create key is server-owned, not client-owned');

  // applyScopedWrite — a simulated per-user store proves isolation end to
  // end: A and B save the same field independently; A's subsequent save
  // (even one carrying a forged user_email) touches ONLY A's row.
  const store = new Map();
  applyScopedWrite(store, A, { preferences: { locale: { timezone: 'America/Chicago' }, queues: { myQueueOnly: true } } });
  applyScopedWrite(store, B, { preferences: { locale: { timezone: 'America/New_York' }, queues: { myQueueOnly: false } } });
  applyScopedWrite(store, A, { user_email: B, preferences: { locale: { timezone: 'America/Denver' } } });
  assert.equal(store.get(A).user_email, A);
  assert.equal(store.get(A).preferences.locale.timezone, 'America/Denver', 'A\'s own row updated');
  assert.equal(store.get(B).preferences.locale.timezone, 'America/New_York',
    'B\'s row byte-for-byte untouched by A\'s write — no cross-contamination');
  assert.equal(store.get(B).preferences.queues.myQueueOnly, false);
  assert.equal(store.size, 2, 'one row per user');

  // The notification-path equivalent: the subs payload itself can carry
  // B's *data* (a copied list) but the row it lands on is always the
  // session actor's — ownership is enforced where the write keys, not in
  // the payload.
  const subsRow = scopedUserWrite(B, { subscriptions: subscriptionsPayload([{ event_key: 'po_created' }]) });
  assert.equal(subsRow.user_email, B, 'B\'s own pref row');
  assert.equal(subsRow.subscriptions[0].event_key, 'po_created');
}

// --- 6. workspace-prefs blob carrier — the K-03 subtrees survive the pipeline ---

{
  const { defaultPrefs, migratePrefs, SECTION_PATHS } = W;
  const d = defaultPrefs();
  assert.deepEqual(d.locale, { timezone: '' }, 'default blob carries locale.timezone');
  assert.deepEqual(d.queues, { defaultLens: '', myQueueOnly: false }, 'default blob carries queues');

  // migrate of a stored blob: account subtrees normalized, rest untouched.
  const m = migratePrefs({
    locale: { timezone: '  America/Chicago ' },
    queues: { defaultLens: 'production', myQueueOnly: true },
    appearance: { mode: 'dark' },
  });
  assert.equal(m.locale.timezone, 'America/Chicago', 'stored tz trimmed');
  assert.equal(m.queues.defaultLens, 'production');
  assert.equal(m.queues.myQueueOnly, true);
  assert.equal(m.appearance.mode, 'dark', 'unrelated subtree untouched');

  // junk → defaults-when-empty for the new subtrees too.
  const j = migratePrefs({ locale: 42, queues: { defaultLens: 'mars', myQueueOnly: 'yes' } });
  assert.equal(j.locale.timezone, '', 'non-string tz → ""');
  assert.equal(j.queues.defaultLens, '', 'unknown lens → app default');
  assert.equal(j.queues.myQueueOnly, false, 'strict boolean');
  const e = migratePrefs(null);
  assert.deepEqual(e.queues, { defaultLens: '', myQueueOnly: false }, 'empty row → queue defaults');
  assert.equal(e.locale.timezone, '', 'empty row → browser local');

  // Reset surface coverage — the two new sections are resettable like the rest.
  assert.deepEqual(SECTION_PATHS.locale, ['locale']);
  assert.deepEqual(SECTION_PATHS.queues, ['queues']);
}

rmSync(outPrefs, { force: true });
rmSync(outSubs, { force: true });
rmSync(outWs, { force: true });
console.log('PASS user-prefs');
