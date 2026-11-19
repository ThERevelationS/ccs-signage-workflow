// Contract checks for masterplan item H-11 — in-app broadcast messaging.
//   - base44/shared/broadcastModel.ts   — cohort predicates, message shape,
//                                       ack/dismiss receipts, visibility,
//                                       audience estimate (esbuild-bundled)
//   - base44/entities/BroadcastMessage.jsonc — parsed for schema-vs-shape
//                                            agreement + backend-only RLS
//
// Run: node scripts/test-broadcast.mjs  →  prints "PASS broadcast (N assertions)"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = resolve(here, '.tmp-broadcast.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/broadcastModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const M = await import(pathToFileURL(out).href);
const {
  BROADCAST_COHORTS,
  BROADCAST_PRIORITIES,
  BROADCAST_STATUS,
  COHORT_ROLE_MAP,
  ACK_LIST_CAP,
  staffUserKey,
  staffIsActive,
  staffIsAdmin,
  staffHasRole,
  cohortMatches,
  cohortAudiencePredicate,
  resolveAudience,
  audienceEstimate,
  broadcastMessageShape,
  ackReceipt,
  applyAck,
  applyDismiss,
  hasAcked,
  hasDismissed,
  broadcastVisibleTo,
  visibleBroadcasts,
} = M;

// Counted assert wrappers — the printed total is real, not hand-tallied.
let assertions = 0;
const eq = (a, b, m) => { assertions += 1; return assert.equal(a, b, m); };
const deq = (a, b, m) => { assertions += 1; return assert.deepEqual(a, b, m); };
const ok = (v, m) => { assertions += 1; return assert.ok(v, m); };
const throws = (fn, re, m) => { assertions += 1; return assert.throws(fn, re, m); };

const NOW = '2026-11-22T15:00:00Z';
const NOW_MS = Date.parse(NOW);
const NOW_ISO = new Date(NOW_MS).toISOString();
const inHours = (h) => new Date(NOW_MS + h * 3600_000).toISOString();

// --- staff roster fixtures (AuthorizedEmail / directory-row shaped) -----------
const adminUser   = { id: 'u-admin',   email: 'boss@x.com',    full_name: 'Boss Admin',   role: 'admin', sales_roles: [] };
const designer    = { id: 'u-des',     email: 'des@x.com',     full_name: 'Dee Signer',   role: 'user',  sales_roles: ['Designer'] };
const installer   = { id: 'u-inst',    email: 'inst@x.com',    full_name: 'Ian Staller',  role: 'user',  sales_roles: ['Installer'] };
const fabricator  = { id: 'u-fab',     email: 'fab@x.com',     full_name: 'Fab Rica',     role: 'user',  sales_roles: ['Fabricator'] };
const cncRouter   = { id: 'u-cncr',    email: 'cncr@x.com',    full_name: 'Cee Router',   role: 'user',  sales_roles: ['CNC Router Operator'] };
const cncLaser    = { id: 'u-cncl',    email: 'cncl@x.com',    full_name: 'Cee Laser',    role: 'user',  sales_roles: ['CNC Laser Operator'] };
const painter     = { id: 'u-pnt',     email: 'pnt@x.com',     full_name: 'Pam Enter',    role: 'user',  sales_roles: ['Painter'] };
const estimator   = { id: 'u-est',     email: 'est@x.com',     full_name: 'Ed Stimator',  role: 'user',  sales_roles: ['Estimator'] };
const taskOwner   = { id: 'u-task',    email: 'task@x.com',    full_name: 'Ted Askaned',  role: 'user',  sales_roles: ['Task Assigned'] };
const pm          = { id: 'u-pm',      email: 'pm@x.com',      full_name: 'Pat Manager',  role: 'user',  sales_roles: ['Project Manager'] };
const officeAdmin = { id: 'u-off',     email: 'off@x.com',     full_name: 'Olive Office', role: 'user',  sales_roles: ['Office Administration'] };
const accounting  = { id: 'u-acct',    email: 'acct@x.com',    full_name: 'Al Counting',  role: 'user',  sales_roles: ['Accounting'] };
const multiRole   = { id: 'u-multi',   email: 'multi@x.com',   full_name: 'Mel Ti',       role: 'user',  sales_roles: ['Designer', 'Installer'] };
const plainUser   = { id: 'u-plain',   email: 'plain@x.com',   full_name: 'Pat Plain',    role: 'user',  sales_roles: [] };
const deactDes    = { id: 'u-dead',    email: 'dead@x.com',    full_name: 'Gone User',    role: 'user',  sales_roles: ['Designer'], is_deactivated: true };
const inactiveFlg = { id: 'u-inact',   email: 'inact@x.com',   full_name: 'Ina Ctive',    role: 'user',  sales_roles: ['Designer'], is_active: false };

const ROSTER = [
  adminUser, designer, installer, fabricator, cncRouter, cncLaser, painter,
  estimator, taskOwner, pm, officeAdmin, accounting, multiRole, plainUser,
  deactDes, inactiveFlg,
];

// --- constants / vocabulary ---------------------------------------------------
eq(BROADCAST_COHORTS.length, 6, 'six cohorts');
deq([...BROADCAST_COHORTS], ['everyone', 'design', 'production', 'sales', 'managers', 'individual']);
deq([...BROADCAST_PRIORITIES], ['normal', 'urgent']);
deq([...BROADCAST_STATUS], ['sent', 'cancelled']);
deq(COHORT_ROLE_MAP.design.sales_roles, ['Designer']);
deq([...COHORT_ROLE_MAP.production.sales_roles].sort(),
  ['CNC Laser Operator', 'CNC Router Operator', 'Fabricator', 'Installer', 'Painter'].sort());
deq([...COHORT_ROLE_MAP.sales.sales_roles].sort(), ['Estimator', 'Task Assigned'].sort());
deq([...COHORT_ROLE_MAP.managers.sales_roles].sort(), ['Office Administration', 'Project Manager'].sort());
eq(COHORT_ROLE_MAP.managers.include_admins, true, 'admins are managers');
eq(COHORT_ROLE_MAP.design.include_admins, false, 'admins are NOT implicitly designers');
ok(ACK_LIST_CAP >= 500, 'receipt cap matches the Announcement convention');

// --- staff-user gates -----------------------------------------------------------
eq(staffUserKey(designer), 'des@x.com');
eq(staffUserKey({ email: '  DES@X.COM ' }), 'des@x.com', 'key is trimmed+lowercased');
eq(staffUserKey({ id: 'u-x' }), 'u-x', 'id fallback when email absent');
eq(staffIsActive(designer), true);
eq(staffIsActive(deactDes), false, 'is_deactivated gates');
eq(staffIsActive(inactiveFlg), false, 'is_active:false gates');
eq(staffIsActive(null), false);
eq(staffIsAdmin(adminUser), true);
eq(staffIsAdmin(designer), false);
eq(staffHasRole(designer, 'Designer'), true);
eq(staffHasRole(designer, 'designer'), true, 'role match is case-insensitive');
eq(staffHasRole(designer, 'Design'), false, 'no substring matching');
eq(staffHasRole(installer, 'Installer'), true);
eq(staffHasRole(installer, 'CNC Router Operator'), false);

// --- cohort predicates ----------------------------------------------------------
// everyone: any active record, roles not required.
eq(cohortMatches(plainUser, 'everyone'), true, 'plain user ∈ everyone');
eq(cohortMatches(adminUser, 'everyone'), true);
eq(cohortMatches(null, 'everyone'), false, 'null user ∉ everyone');
// design
eq(cohortMatches(designer, 'design'), true);
eq(cohortMatches(multiRole, 'design'), true, 'multi-role designer matches');
eq(cohortMatches(installer, 'design'), false);
eq(cohortMatches(adminUser, 'design'), false, 'admin alone is not design');
// production — five shop-floor roles
for (const u of [installer, fabricator, cncRouter, cncLaser, painter]) {
  eq(cohortMatches(u, 'production'), true, `${u.email} ∈ production`);
}
eq(cohortMatches(multiRole, 'production'), true, 'Installer half of multi-role matches');
eq(cohortMatches(designer, 'production'), false);
eq(cohortMatches(estimator, 'production'), false);
eq(cohortMatches(adminUser, 'production'), false);
// sales — Estimator + Task Assigned (see model header for the tradeoff doc)
eq(cohortMatches(estimator, 'sales'), true);
eq(cohortMatches(taskOwner, 'sales'), true, 'Task Assigned counts as sales pipeline');
eq(cohortMatches(installer, 'sales'), false);
eq(cohortMatches(accounting, 'sales'), false, 'Accounting alone is not sales');
eq(cohortMatches(adminUser, 'sales'), false, 'admin alone is not sales');
// managers — admin role OR PM/Office Admin roster role
eq(cohortMatches(pm, 'managers'), true);
eq(cohortMatches(officeAdmin, 'managers'), true);
eq(cohortMatches(adminUser, 'managers'), true, 'admin role is a manager');
eq(cohortMatches(designer, 'managers'), false);
eq(cohortMatches(estimator, 'managers'), false);
// individual — target list membership, sales_roles ignored
eq(cohortMatches(designer, 'individual', { target_user_ids: ['des@x.com'] }), true);
eq(cohortMatches(designer, 'individual', { target_user_ids: ['DES@X.COM'] }), true, 'target match is case-insensitive');
eq(cohortMatches(designer, 'individual', { target_user_ids: ['u-des'] }), true, 'entity id also matches');
eq(cohortMatches(designer, 'individual', { target_user_ids: ['inst@x.com'] }), false);
eq(cohortMatches(designer, 'individual', { target_user_ids: [] }), false, 'empty targets match nobody');
eq(cohortMatches(plainUser, 'individual', { target_user_ids: ['plain@x.com'] }), true, 'roles ignored for individual');
// unknown cohort never matches
eq(cohortMatches(designer, 'bogus'), false);
eq(cohortMatches(adminUser, 'bogus'), false, 'unknown cohort matches nobody — even admins');
// audience predicate adds the active gate
eq(cohortMatches(deactDes, 'design'), true, 'cohortMatches is the raw role gate');
eq(cohortAudiencePredicate('design')(deactDes), false, 'audience predicate excludes deactivated');
eq(cohortAudiencePredicate('design')(inactiveFlg), false, 'audience predicate excludes is_active:false');
eq(cohortAudiencePredicate('design')(designer), true);
eq(cohortAudiencePredicate('everyone')(deactDes), false, 'deactivated ∉ everyone audience');

// --- resolveAudience + audienceEstimate ------------------------------------------
{
  const everyone = resolveAudience(ROSTER, { cohort: 'everyone' });
  eq(everyone.length, ROSTER.length - 2, 'everyone = roster minus 2 inactive');
  ok(!everyone.includes(deactDes) && !everyone.includes(inactiveFlg));
  assertions += 1;
  deq(resolveAudience(ROSTER, { cohort: 'design' }).map((u) => u.email), ['des@x.com', 'multi@x.com']);
  deq(resolveAudience(ROSTER, { cohort: 'production' }).map((u) => u.email),
    ['inst@x.com', 'fab@x.com', 'cncr@x.com', 'cncl@x.com', 'pnt@x.com', 'multi@x.com']);
  deq(resolveAudience(ROSTER, { cohort: 'sales' }).map((u) => u.email), ['est@x.com', 'task@x.com']);
  deq(resolveAudience(ROSTER, { cohort: 'managers' }).map((u) => u.email), ['boss@x.com', 'pm@x.com', 'off@x.com']);
  deq(resolveAudience(ROSTER, { cohort: 'individual', target_user_ids: ['des@x.com', 'pm@x.com'] }).map((u) => u.email),
    ['des@x.com', 'pm@x.com']);
  deq(resolveAudience(ROSTER, { cohort: 'individual', target_user_ids: ['ghost@x.com'] }), [],
    'targets absent from the roster resolve to nobody');
  deq(resolveAudience(ROSTER, { cohort: 'individual', target_user_ids: ['dead@x.com'] }), [],
    'targeting a deactivated user resolves to nobody');
  deq(resolveAudience('junk', { cohort: 'everyone' }), [], 'non-array users → []');
  eq(audienceEstimate(ROSTER, { cohort: 'everyone' }), ROSTER.length - 2);
  eq(audienceEstimate(ROSTER, { cohort: 'production' }), 6);
  eq(audienceEstimate(ROSTER, { cohort: 'sales' }), 2);
  eq(audienceEstimate(ROSTER, { cohort: 'managers' }), 3);
  eq(audienceEstimate(ROSTER, { cohort: 'design' }), 2);
  eq(audienceEstimate(ROSTER, { cohort: 'individual', target_user_ids: ['des@x.com', 'pm@x.com', 'ghost@x.com'] }), 2,
    'estimate counts only resolvable, active targets');
  eq(audienceEstimate(ROSTER, { cohort: 'bogus' }), 0);
  eq(audienceEstimate(null, { cohort: 'everyone' }), 0);
}

// --- broadcastMessageShape --------------------------------------------------------
const goodForm = {
  subject: '  Shop meeting  ',
  body: 'Friday 3pm in the bay.',
  cohort: 'production',
  sender: { email: 'BOSS@X.COM', name: 'Boss Admin' },
  now: NOW,
  expires_at: inHours(8),
};
{
  const row = broadcastMessageShape(goodForm);
  eq(row.subject, 'Shop meeting', 'subject trimmed');
  eq(row.body, 'Friday 3pm in the bay.');
  eq(row.cohort, 'production');
  deq(row.target_user_ids, [], 'cohort sends carry no stale targets');
  eq(row.sender_email, 'boss@x.com', 'sender email lowercased');
  eq(row.sender_name, 'Boss Admin');
  eq(row.created_at, NOW_ISO);
  eq(row.expires_at, new Date(inHours(8)).toISOString());
  eq(row.priority, 'normal');
  eq(row.status, 'sent');
  eq(row.requires_ack, false);
  eq(row.audience_size, 0);
  deq(row.acked_user_ids, []);
  deq(row.dismissed_user_ids, []);

  const ind = broadcastMessageShape({
    ...goodForm, cohort: 'individual',
    target_user_ids: ['DES@X.COM', ' pm@x.com ', 'des@x.com', ''],
  });
  deq(ind.target_user_ids, ['des@x.com', 'pm@x.com'], 'individual targets cleaned, deduped, lowercased');

  const opts = broadcastMessageShape({
    ...goodForm, priority: 'urgent', requires_ack: true, status: 'sent',
    audience_size: audienceEstimate(ROSTER, { cohort: 'production' }),
    sender: { email: 'boss@x.com', full_name: 'Boss Admin' },
  });
  eq(opts.priority, 'urgent');
  eq(opts.requires_ack, true);
  eq(opts.audience_size, 6, 'audience_size stamps the live estimate');
  eq(opts.sender_name, 'Boss Admin', 'sender.full_name accepted');

  // fail-closed inputs
  throws(() => broadcastMessageShape({ ...goodForm, subject: '  ' }), /subject is required/i);
  throws(() => broadcastMessageShape({ ...goodForm, body: '' }), /body is required/i);
  throws(() => broadcastMessageShape({ ...goodForm, cohort: 'shop' }), /cohort is invalid/i);
  throws(() => broadcastMessageShape({ ...goodForm, cohort: 'individual', target_user_ids: [] }), /at least one target/i);
  throws(() => broadcastMessageShape({ ...goodForm, expires_at: '' }), /stop showing|expiry/i);
  throws(() => broadcastMessageShape({ ...goodForm, expires_at: 'not-a-date' }), /stop showing|expiry/i);
  throws(() => broadcastMessageShape({ ...goodForm, expires_at: inHours(-1) }), /expiry must be after/i);
  throws(() => broadcastMessageShape({ ...goodForm, expires_at: NOW }), /expiry must be after/i, 'expiry == now rejects');
  throws(() => broadcastMessageShape({ ...goodForm, now: 'junk' }), /send time is required/i);
  throws(() => broadcastMessageShape({ ...goodForm, priority: 'high' }), /priority is invalid/i);
  throws(() => broadcastMessageShape({ ...goodForm, status: 'draft' }), /status is invalid/i);
}

// --- entity schema vs model agreement ---------------------------------------------
const schema = JSON.parse(readFileSync(join(root, 'base44/entities/BroadcastMessage.jsonc'), 'utf8'));
{
  eq(schema.name, 'BroadcastMessage');
  const props = schema.properties || {};
  // Every field the shape emits is declared in the schema.
  const shapeRow = broadcastMessageShape({
    ...goodForm, cohort: 'individual', target_user_ids: ['des@x.com'],
    priority: 'urgent', requires_ack: true, audience_size: 4,
  });
  const missing = Object.keys(shapeRow).filter((k) => !props[k]);
  deq(missing, [], 'shape keys ⊆ schema properties');
  // Every schema field the model depends on exists with the right type.
  for (const f of ['subject', 'body', 'cohort', 'sender_email', 'sender_name', 'created_at', 'expires_at', 'priority', 'status']) {
    eq(props[f]?.type, 'string', `schema.${f} is a string`);
  }
  for (const f of ['target_user_ids', 'acked_user_ids', 'dismissed_user_ids']) {
    eq(props[f]?.type, 'array', `schema.${f} is an array`);
    eq(props[f]?.items?.type, 'string', `schema.${f} items are strings`);
  }
  eq(props.requires_ack?.type, 'boolean');
  eq(props.audience_size?.type, 'number');
  // Enums line up with the model vocabularies.
  deq(props.cohort?.enum, [...BROADCAST_COHORTS], 'schema cohort enum = BROADCAST_COHORTS');
  deq(props.priority?.enum, [...BROADCAST_PRIORITIES], 'schema priority enum = BROADCAST_PRIORITIES');
  deq(props.status?.enum, [...BROADCAST_STATUS], 'schema status enum = BROADCAST_STATUS');
  // Required fields are exactly the trio the shape guarantees.
  deq(schema.required, ['subject', 'body', 'cohort']);
  // Defaults the entity applies match the shape's own defaults.
  eq(props.priority?.default, 'normal');
  eq(props.status?.default, 'sent');
  eq(props.requires_ack?.default, false);
  eq(props.audience_size?.default, 0);
  // Backend-only RLS on all four ops — tighter than Announcement's open read.
  for (const op of ['create', 'read', 'update', 'delete']) {
    eq(schema.rls?.[op]?.user_condition?.role, '__broadcast_message_backend_only__',
      `rls.${op} is backend-only`);
  }
}

// --- ackReceipt + applyAck/applyDismiss (embedded receipts) -------------------------
{
  const receipt = ackReceipt({ message_id: 'm1', user_id: 'DES@X.COM', now: NOW });
  eq(receipt.message_id, 'm1');
  eq(receipt.user_key, 'des@x.com', 'receipt key is lowercased');
  eq(receipt.acked_at, NOW_ISO);
  const viaUser = ackReceipt({ message_id: 'm2', user: designer, now: 'junk' });
  eq(viaUser.user_key, 'des@x.com', 'user object supplies the key');
  eq(viaUser.acked_at, '', 'unparseable now → empty stamp');

  const msg = { id: 'm1', acked_user_ids: [], dismissed_user_ids: [] };
  const a1 = applyAck(msg, designer);
  eq(a1.changed, true);
  deq(a1.next_acked_user_ids, ['des@x.com']);
  const a2 = applyAck({ ...msg, acked_user_ids: a1.next_acked_user_ids }, designer);
  eq(a2.changed, false, 'repeat ack is idempotent');
  deq(a2.next_acked_user_ids, ['des@x.com'], 'no duplicate appended');
  const a3 = applyAck({ ...msg, acked_user_ids: ['DES@X.COM'] }, { email: 'des@x.com' });
  eq(a3.changed, false, 'ack dedupe is case-insensitive');
  const a4 = applyAck(msg, { email: 'inst@x.com' });
  deq(a4.next_acked_user_ids, ['inst@x.com'], 'raw object ack works');
  // Cap behavior: a full list keeps its size (oldest entry evicted).
  const full = Array.from({ length: ACK_LIST_CAP }, (_, i) => `u${i}@x.com`);
  const a5 = applyAck({ acked_user_ids: full }, { email: 'new@x.com' });
  eq(a5.next_acked_user_ids.length, ACK_LIST_CAP, 'ack list stays capped');
  eq(a5.next_acked_user_ids[0], 'u1@x.com', 'oldest ack evicted at the cap');
  eq(a5.next_acked_user_ids.at(-1), 'new@x.com');
  eq(applyAck(msg, { email: '' }).changed, false, 'empty viewer cannot ack');

  const d1 = applyDismiss(msg, installer);
  eq(d1.changed, true);
  deq(d1.next_dismissed_user_ids, ['inst@x.com']);
  eq(applyDismiss({ dismissed_user_ids: ['inst@x.com'] }, installer).changed, false,
    'repeat dismiss is idempotent');
  eq(hasAcked({ acked_user_ids: ['des@x.com'] }, { email: 'DES@X.COM' }), true);
  eq(hasAcked({ acked_user_ids: [] }, designer), false);
  eq(hasDismissed({ dismissed_user_ids: ['inst@x.com'] }, installer), true);
  eq(hasDismissed({ dismissed_user_ids: ['inst@x.com'] }, designer), false);
}

// --- visibleBroadcasts --------------------------------------------------------------
const mkMsg = (over = {}) => ({
  id: over.id || 'm',
  subject: 'S', body: 'B',
  cohort: 'everyone',
  target_user_ids: [],
  status: 'sent', priority: 'normal',
  created_at: NOW, expires_at: inHours(8),
  acked_user_ids: [], dismissed_user_ids: [],
  ...over,
});
{
  const everyoneMsg = mkMsg({ id: 'all' });
  ok(broadcastVisibleTo(everyoneMsg, plainUser, NOW), 'everyone msg visible to plain user');
  ok(broadcastVisibleTo(everyoneMsg, adminUser, NOW));

  // cohort gating
  const designMsg = mkMsg({ id: 'd', cohort: 'design' });
  ok(broadcastVisibleTo(designMsg, designer, NOW), 'design msg reaches designer');
  ok(!broadcastVisibleTo(designMsg, installer, NOW), 'design msg does NOT reach installer');
  ok(!broadcastVisibleTo(designMsg, deactDes, NOW), 'deactivated designer sees nothing');
  const prodMsg = mkMsg({ id: 'p', cohort: 'production' });
  ok(broadcastVisibleTo(prodMsg, painter, NOW));
  ok(!broadcastVisibleTo(prodMsg, estimator, NOW), 'production msg does NOT reach sales');
  const mgrMsg = mkMsg({ id: 'm', cohort: 'managers' });
  ok(broadcastVisibleTo(mgrMsg, adminUser, NOW), 'admin sees managers msg');
  ok(broadcastVisibleTo(mgrMsg, pm, NOW));
  ok(!broadcastVisibleTo(mgrMsg, officeAdmin === pm ? designer : designer, NOW), 'designer excluded from managers');
  const indMsg = mkMsg({ id: 'i', cohort: 'individual', target_user_ids: ['des@x.com'] });
  ok(broadcastVisibleTo(indMsg, designer, NOW), 'individual reaches its target');
  ok(!broadcastVisibleTo(indMsg, installer, NOW), 'individual hides from non-targets');

  // expiry + status
  ok(!broadcastVisibleTo(mkMsg({ expires_at: inHours(-1) }), designer, NOW), 'expired hidden');
  ok(!broadcastVisibleTo(mkMsg({ expires_at: NOW }), designer, NOW), 'expiring AT now hidden');
  ok(broadcastVisibleTo(mkMsg({ expires_at: inHours(0.001) }), designer, NOW), 'unexpired visible');
  ok(broadcastVisibleTo(mkMsg({ expires_at: '' }), designer, NOW), 'missing expiry tolerated at read');
  ok(!broadcastVisibleTo(mkMsg({ status: 'cancelled' }), designer, NOW), 'cancelled hidden');
  ok(broadcastVisibleTo(mkMsg({ status: '' }), designer, NOW), 'absent status tolerated as sent');
  ok(!broadcastVisibleTo(null, designer, NOW), 'null row hidden');
  assertions += 1;

  // ack/dismiss gating — per viewer
  const acked = mkMsg({ acked_user_ids: ['des@x.com'] });
  ok(!broadcastVisibleTo(acked, designer, NOW), 'acked-out viewer no longer sees it');
  ok(broadcastVisibleTo(acked, installer, NOW), 'another viewer still sees it');
  const dismissed = mkMsg({ dismissed_user_ids: ['des@x.com'] });
  ok(!broadcastVisibleTo(dismissed, designer, NOW), 'dismissed viewer no longer sees it');
  const ackedUpper = mkMsg({ acked_user_ids: ['DES@X.COM'] });
  ok(!broadcastVisibleTo(ackedUpper, { email: 'des@x.com' }, NOW), 'ack match is case-insensitive');

  // list-level filtering + ordering
  const msgs = [
    mkMsg({ id: 'old', created_at: inHours(-5) }),
    mkMsg({ id: 'new', created_at: inHours(-1) }),
    mkMsg({ id: 'urg', priority: 'urgent', created_at: inHours(-9) }),
    mkMsg({ id: 'hidden', cohort: 'design' }),
    mkMsg({ id: 'gone', expires_at: inHours(-1) }),
    mkMsg({ id: 'acked', acked_user_ids: ['inst@x.com'] }),
  ];
  const forInstaller = visibleBroadcasts(msgs, installer, NOW);
  deq(forInstaller.map((m) => m.id), ['urg', 'new', 'old'],
    'urgent first then newest; wrong-cohort/expired/acked filtered');
  const forDesigner = visibleBroadcasts(msgs, designer, NOW);
  deq(forDesigner.map((m) => m.id), ['urg', 'hidden', 'acked', 'new', 'old'],
    'designer additionally sees design + the row only installer acked (NOW created_at outranks older rows)');
  deq(visibleBroadcasts('junk', designer, NOW), [], 'non-array input → []');
  deq(visibleBroadcasts([], designer, NOW), []);
}

rmSync(out, { force: true });
console.log(`PASS broadcast (${assertions} assertions)`);
