// Contract + model checks for the persisted-notification layer
// (ESTIMATOR_BACKLOG §14): dedupe semantics, read/snooze/handled
// transitions, preference filtering, feed-item overlays, digest counts, and
// the backend-action surface. Runs fully offline — the pure model is
// esbuild-bundled, everything else is file-shape assertions.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../src');
const out = resolve(here, '.tmp-notification-model.mjs');
buildSync({
  entryPoints: [resolve(src, 'components/workflow/notificationModel.mjs')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: { '@': src },
});
const model = await import(pathToFileURL(out).href);
const {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PREF_DEFAULTS,
  applyMarkHandled,
  applyMarkRead,
  applySnooze,
  applyUnhandle,
  buildDigestCounts,
  feedItemDismissed,
  filterVisibleFeedItems,
  isNotificationActive,
  isNotificationUnread,
  normalizeDismissedFeedItems,
  normalizeNotificationPrefs,
  notificationDedupeKey,
  persistedNotificationState,
  publishAttentionFeed,
  publishPersistedNotifications,
  latestAttentionFeed,
  sectionSnoozedByPrefs,
  sectionVisibleByPrefs,
  snoozeUntilForHours,
  sortNotificationsForPanel,
  unreadNotificationCount,
  upsertDismissedFeedItem,
} = model;

// --- Category registry ---------------------------------------------------------
const keys = NOTIFICATION_CATEGORIES.map((c) => c.key);
for (const k of ['quote_approved', 'estimate_sent', 'estimate_assigned', 'quote_expiring',
  'invoice_overdue', 'unassigned_escalation', 'sync_pending', 'needs_recalc',
  'watch_hit', 'digest', 'system']) {
  assert.ok(keys.includes(k), `category ${k} registered`);
}
assert.equal(NOTIFICATION_CATEGORIES.find((c) => c.key === 'quote_approved').severity, 'celebration',
  'quote-approved carries the celebration severity the toast styles on');

// --- dedupe_key prevents double-notify (#329/#335/etc.) -------------------------
// The backend stores `${recipient}:${base}` — the same logical event must
// produce the same key for the same recipient and a different key otherwise.
assert.equal(notificationDedupeKey('est_status:e1:approved', 'Brett@Shop.test'), 'brett@shop.test:est_status:e1:approved');
assert.equal(notificationDedupeKey('est_status:e1:approved', 'brett@shop.test'), 'brett@shop.test:est_status:e1:approved');
assert.notEqual(
  notificationDedupeKey('est_status:e1:approved', 'a@x.test'),
  notificationDedupeKey('est_status:e1:approved', 'b@x.test'),
  'dedupe keys are recipient-scoped',
);
assert.notEqual(
  notificationDedupeKey('est_status:e1:approved', 'a@x.test'),
  notificationDedupeKey('est_status:e1:sent', 'a@x.test'),
  'each transition notifies once per status',
);
// Simulate the backend dedupe set: second identical candidate is refused.
const seen = new Set();
const pushCandidate = (c) => {
  const k = notificationDedupeKey(c.dedupe, c.recipient);
  if (seen.has(k)) return null;
  seen.add(k);
  return k;
};
assert.ok(pushCandidate({ recipient: 'a@x.test', dedupe: 'invod:i1' }), 'first invoice-overdue notification creates');
assert.equal(pushCandidate({ recipient: 'a@x.test', dedupe: 'invod:i1' }), null, 'same dedupe is refused — no double notify');
assert.ok(pushCandidate({ recipient: 'b@x.test', dedupe: 'invod:i1' }), 'same event still notifies the other recipient');

// --- Row transitions ------------------------------------------------------------
const now = Date.now();
const n0 = { id: 'n1', title: 'T', created_date: new Date(now - 1000).toISOString() };
assert.ok(isNotificationUnread(n0), 'fresh row is unread');
assert.ok(isNotificationActive(n0), 'fresh row is active');

const nRead = applyMarkRead(n0, '2026-01-01T00:00:00Z');
assert.equal(nRead.read_at, '2026-01-01T00:00:00Z');
assert.ok(!isNotificationUnread(nRead), 'read rows are not unread');
assert.ok(isNotificationActive(nRead), 'read rows stay in the active list');
assert.equal(applyMarkRead(nRead, '2026-02-02T00:00:00Z').read_at, '2026-01-01T00:00:00Z', 'mark_read never moves read_at backwards');

const nSnoozed = applySnooze(n0, new Date(now + 3600000).toISOString());
assert.ok(!isNotificationActive(nSnoozed, now), 'snoozed rows hide until due');
assert.ok(isNotificationActive(nSnoozed, now + 3700000), 'snoozed rows return after the deadline');
assert.ok(!isNotificationUnread(nSnoozed, now), 'snoozed rows do not count unread');

const nHandled = applyMarkHandled(n0, '2026-01-02T00:00:00Z', 'me@x.test');
assert.equal(nHandled.handled_at, '2026-01-02T00:00:00Z');
assert.equal(nHandled.handled_by, 'me@x.test');
assert.ok(nHandled.read_at, 'handled implies read');
assert.ok(!isNotificationActive(nHandled), 'handled rows leave the active list');
const nReopened = applyUnhandle(nHandled);
assert.ok(!nReopened.handled_at && !nReopened.handled_by, 'unhandle clears handled state');
assert.ok(isNotificationActive(nReopened), 'reopened rows are active again');

const until = snoozeUntilForHours(4, now);
assert.ok(Math.abs(Date.parse(until) - (now + 4 * 3600000)) < 1000, 'snoozeUntilForHours computes +4h');
assert.ok(Date.parse(snoozeUntilForHours(99999, now)) - now <= 31 * 86400000, 'snooze caps at ~30d');

// --- Panel sort: unread first, newest inside each group ---------------------------
const rows = [
  { id: 'a', read_at: 'x', created_date: '2026-01-05T00:00:00Z' },
  { id: 'b', created_date: '2026-01-03T00:00:00Z' },
  { id: 'c', read_at: 'x', created_date: '2026-01-04T00:00:00Z' },
];
assert.deepEqual(sortNotificationsForPanel(rows).map((r) => r.id), ['b', 'a', 'c'], 'unread first then newest');
assert.equal(unreadNotificationCount(rows), 1);
assert.equal(unreadNotificationCount([...rows, { id: 'd', handled_at: 'x', created_date: '2026-01-06' }]), 1, 'handled excluded from unread');

// --- Preferences ---------------------------------------------------------------
const defaults = normalizeNotificationPrefs(null);
assert.deepEqual(defaults, { ...NOTIFICATION_PREF_DEFAULTS, dismissed_feed_items: [], section_snoozed_until: {} });
assert.equal(defaults.sound_on, true, 'sound defaults on (#339)');
assert.equal(defaults.digest_opt_in, false, 'digest defaults off (#333)');

const prefs = normalizeNotificationPrefs({
  hidden_sections: ['invoices', 'invoices', ' pos '],
  section_snoozed_until: { jobs: now + 60000, stale: 'junk' },
  sound_on: false,
  digest_opt_in: true,
});
assert.deepEqual(prefs.hidden_sections, ['invoices', 'pos'], 'hidden sections dedupe + trim');
assert.ok(!sectionVisibleByPrefs(prefs, 'invoices', now), 'hidden section filtered');
assert.ok(sectionSnoozedByPrefs(prefs, 'jobs', now), 'snoozed section filtered');
assert.ok(sectionVisibleByPrefs(prefs, 'jobs', now + 61000), 'section returns after snooze');
assert.ok(!('stale' in prefs.section_snoozed_until), 'junk snooze entries drop');
assert.equal(prefs.sound_on, false);
assert.equal(prefs.digest_opt_in, true);

// --- Feed-item overlays (#332/#340) ----------------------------------------------
let dismissed = [];
dismissed = upsertDismissedFeedItem(dismissed, { id: 'i1', handled_at: '2026-01-01T00:00:00Z' });
dismissed = upsertDismissedFeedItem(dismissed, { id: 'i2', snoozed_until: new Date(now + 60000).toISOString() });
assert.ok(feedItemDismissed(dismissed, 'i1', now), 'handled feed item hidden');
assert.ok(feedItemDismissed(dismissed, 'i2', now), 'snoozed feed item hidden');
assert.ok(!feedItemDismissed(dismissed, 'i2', now + 61000), 'snoozed feed item returns');
assert.ok(!feedItemDismissed(dismissed, 'nope', now), 'unknown ids stay visible');
dismissed = upsertDismissedFeedItem(dismissed, { id: 'i1', snoozed_until: new Date(now + 60000).toISOString() });
assert.equal(dismissed.filter((d) => d.id === 'i1').length, 1, 'upsert replaces, never duplicates');
const items = [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }];
assert.deepEqual(filterVisibleFeedItems(items, dismissed, now).map((i) => i.id), ['i3'], 'overlay filters handled + snoozed');
for (let i = 0; i < 400; i++) dismissed = upsertDismissedFeedItem(dismissed, { id: `x${i}`, handled_at: 'y' });
assert.ok(dismissed.length <= 300, 'dismissed list stays bounded');
assert.ok(normalizeDismissedFeedItems('junk').length === 0, 'junk dismissal blobs normalize empty');

// --- Digest counts (#333) ----------------------------------------------------------
const counts = buildDigestCounts({
  unread_portal_messages: [{ id: 1 }, { id: 2 }],
  overdue_invoices: [{ id: 3 }],
  matched_totals: { overdue_invoices: 7, overdue_pos: 4 },
  low_stock: [],
});
assert.equal(counts.unread_portal_messages, 2);
assert.equal(counts.overdue_invoices, 7, 'matched_totals win over display rows');
assert.equal(counts.overdue_pos, 4, 'matched-only sections still counted');
assert.ok(!('low_stock' in counts), 'empty sections are omitted');
assert.ok(!('bogus' in counts));

// --- Publish/subscribe snapshots -------------------------------------------------
publishPersistedNotifications([{ id: 'n1' }, { id: 'n2', read_at: 'x' }], 1);
assert.equal(persistedNotificationState().unread_count, 1);
assert.equal(persistedNotificationState().notifications.length, 2);
publishAttentionFeed({ success: true, overdue_jobs: [{ id: 'w1' }] });
assert.equal(latestAttentionFeed().overdue_jobs.length, 1, 'bell + dropdown share one feed fetch');

// --- File contracts ---------------------------------------------------------------
const entry = readFileSync('base44/functions/notificationAction/entry.ts', 'utf8');
for (const action of [
  'list_mine', 'unread_count', 'mark_read', 'mark_all_read', 'snooze', 'unsnooze',
  'mark_handled', 'unhandle', 'record', 'get_preferences', 'save_preferences',
  'dismiss_feed_item', 'clear_feed_item', 'daily_digest', 'history', 'evaluate_triggers',
]) {
  assert.ok(entry.includes(`action === "${action}"`), `notificationAction must handle ${action}`);
}
assert.match(entry, /authenticateSignShopSession/, 'entry must session-authenticate');
assert.match(entry, /asServiceRole\.entities\.Notification/, 'entry must use service-role Notification');
assert.match(entry, /dedupe_key/, 'entry must persist dedupe_key');
assert.match(entry, /last_evaluated_at/, 'entry must throttle evaluate_triggers');
assert.ok(!/functions\.invoke\(\s*["']send/.test(entry), 'entry must never invoke an email sender — in-app only');

for (const entity of ['Notification', 'NotificationPreference']) {
  const schema = readFileSync(`base44/entities/${entity}.jsonc`, 'utf8');
  assert.match(schema, /timeclock_backend_only/, `${entity} must be backend-only RLS`);
  assert.match(schema, new RegExp(`"name": "${entity}"`), `${entity} schema must name itself`);
}
for (const field of ['recipient_email', 'dedupe_key', 'read_at', 'snoozed_until', 'handled_at', 'deep_link', 'category']) {
  assert.ok(readFileSync('base44/entities/Notification.jsonc', 'utf8').includes(`"${field}"`), `Notification.${field} declared`);
}
for (const field of ['user_email', 'hidden_sections', 'dismissed_feed_items', 'sound_on', 'digest_opt_in', 'last_evaluated_at', 'last_digest_date']) {
  assert.ok(readFileSync('base44/entities/NotificationPreference.jsonc', 'utf8').includes(`"${field}"`), `NotificationPreference.${field} declared`);
}

assert.ok(existsSync('base44/functions/notificationAction/function.jsonc'), 'function.jsonc exists');
const fc = JSON.parse(readFileSync('base44/functions/notificationAction/function.jsonc', 'utf8'));
assert.equal(fc.name, 'notificationAction');
assert.equal(fc.entry, 'entry.ts', 'entry path must be relative — absolute paths break checkpoint builds');

for (const f of [
  'src/components/workflow/NotificationCenter.jsx',
  'src/components/workflow/NotificationHistory.jsx',
  'src/components/workflow/notificationClient.js',
  'src/components/workflow/notificationModel.mjs',
  'src/components/workflow/attentionFeedCategories.js',
]) {
  assert.ok(existsSync(f), `${f} exists`);
}

const bell = readFileSync('src/components/workflow/AttentionBell.jsx', 'utf8');
assert.match(bell, /usePolling\(load, 60000/, 'bell polls every 60s (#330)');
assert.match(bell, /NotificationCenter/, 'bell opens the notification center (#326)');
assert.match(bell, /playNotificationBeep/, 'bell sounds on new notifications (#339)');
assert.match(bell, /quote_approved/, 'bell toasts quote approvals (#336)');
assert.match(bell, /evaluateNotificationTriggers/, 'bell rides trigger evaluation');
assert.match(bell, /requestDailyDigest/, 'bell can persist the daily digest (#333)');
assert.match(bell, /publishPersistedNotifications/, 'bell publishes the persisted snapshot');

const feedSrc = readFileSync('src/components/workflow/AttentionFeed.jsx', 'utf8');
assert.match(feedSrc, /dismissFeedItems/, 'feed persists item overlays (#332/#340)');
assert.match(feedSrc, /markAllNotificationsRead/, 'feed can mark all notifications read (#327)');
assert.match(feedSrc, /saveNotificationPrefs/, 'feed persists prefs to the account (#328)');
assert.match(feedSrc, /listMyNotifications/, 'feed merges persisted notifications');

const center = readFileSync('src/components/workflow/NotificationCenter.jsx', 'utf8');
assert.match(center, /markAllRead/, 'center offers global mark-all-read (#327)');
assert.match(center, /NotificationHistory/, 'center opens the history view (#350)');
assert.match(center, /latestAttentionFeed/, 'center reuses the polled feed — no extra fetch');
assert.match(center, /snoozeNotification|handleSnooze/, 'center snoozes persisted rows (#332)');

const history = readFileSync('src/components/workflow/NotificationHistory.jsx', 'utf8');
assert.match(history, /fetchNotificationHistory/, 'history reads through notificationAction (#350)');
assert.match(history, /include_handled/, 'history filters handled rows');
assert.match(history, /unhandleNotification/, 'history can reopen handled rows');

const client = readFileSync('src/components/workflow/notificationClient.js', 'utf8');
assert.match(client, /notificationAction/, 'client invokes notificationAction');
assert.ok(!client.includes('sendEmail') && !client.includes('sendGmail'), 'client never touches email — in-app only');

console.log('PASS notification-center (dedupe, transitions, prefs, overlays, digest, contracts)');
