import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-contact-roles.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/contactRolesModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  CONTACT_ROLES,
  CONTACT_ROLE_KEYS,
  CONTACT_ROLE_LABELS,
  SINGLE_ASSIGNMENT_ROLES,
  CONTACT_STATUSES,
  CONTACT_EMAIL_GROUPS,
  CONTACT_ROLE_FLAG,
  CONTACT_AUTHORITY_ROLES,
  CUSTOMER_BILLING_EMAIL_FIELDS,
  normalizeContactRole,
  inferContactRole,
  normalizeContactStatus,
  resolveContactRoles,
  contactsForRole,
  resolveRoleContact,
  validateRoleAssignments,
  roleAssignmentPlan,
  customerPatchForRole,
  resolveBillingContact,
  contactEmailGroups,
  contactInEmailGroup,
  contactMailable,
} = await import(pathToFileURL(out).href);

// Count every individual assert so the PASS line reports real coverage.
let count = 0;
const eq = (...a) => { count += 1; return assert.equal(...a); };
const deq = (...a) => { count += 1; return assert.deepEqual(...a); };
const ok = (...a) => { count += 1; return assert.ok(...a); };

// --- Registry shape ------------------------------------------------------------
deq(CONTACT_ROLE_KEYS, ['primary', 'billing', 'jobsite', 'decision_maker', 'ap']);
eq(CONTACT_ROLES.length, 5);
for (const def of CONTACT_ROLES) {
  eq(typeof def.key, 'string');
  ok(def.label && typeof def.label === 'string', `${def.key} has a label`);
  ok(def.description && typeof def.description === 'string', `${def.key} has a description`);
  eq(typeof def.single, 'boolean');
  eq(typeof def.storage, 'string');
}
deq(CONTACT_ROLES.map((r) => r.key).sort(), ['ap', 'billing', 'decision_maker', 'jobsite', 'primary']);
eq(CONTACT_ROLE_LABELS.jobsite, 'Jobsite');
eq(CONTACT_ROLE_LABELS.decision_maker, 'Decision maker');
eq(CONTACT_ROLE_LABELS.ap, 'Accounts payable');
deq(SINGLE_ASSIGNMENT_ROLES, ['primary', 'billing', 'jobsite']);
eq(CONTACT_ROLE_FLAG.primary, 'is_primary');
eq(CONTACT_ROLE_FLAG.billing, 'is_billing_contact');
eq(CONTACT_ROLE_FLAG.jobsite, 'is_site_contact');
eq(CONTACT_ROLE_FLAG.decision_maker, undefined, 'dm has no flag column');
eq(CONTACT_ROLE_FLAG.ap, undefined, 'ap has no flag column');
deq(CONTACT_STATUSES, ['active', 'deactivated', 'do_not_mail', 'hot_prospect', 'referral']);
deq(CONTACT_EMAIL_GROUPS, ['invoices', 'statements', 'proofs', 'marketing']);
ok(CONTACT_AUTHORITY_ROLES.includes('accounts_payable'));
ok(CONTACT_AUTHORITY_ROLES.includes('decision_maker'));
deq(CUSTOMER_BILLING_EMAIL_FIELDS, ['billing_email', 'billing_contact_email', 'email', 'contact_email', 'primary_email']);

// --- normalizeContactRole — legacy spellings + titles -----------------------------
eq(normalizeContactRole('primary'), 'primary');
eq(normalizeContactRole('Primary Contact'), 'primary');
eq(normalizeContactRole('main contact'), 'primary');
eq(normalizeContactRole('Billing'), 'billing');
eq(normalizeContactRole(' billing_contact '), 'billing');
eq(normalizeContactRole('Billing Contact'), 'billing');
eq(normalizeContactRole('site'), 'jobsite', 'legacy site spelling → jobsite');
eq(normalizeContactRole('Site Contact'), 'jobsite');
eq(normalizeContactRole('jobsite'), 'jobsite');
eq(normalizeContactRole('job_site'), 'jobsite');
eq(normalizeContactRole('Install Contact'), 'jobsite');
eq(normalizeContactRole('Superintendent'), 'jobsite');
eq(normalizeContactRole('foreman'), 'jobsite');
eq(normalizeContactRole('decision_maker'), 'decision_maker');
eq(normalizeContactRole('Decision Maker'), 'decision_maker');
eq(normalizeContactRole('owner'), 'decision_maker', 'title → dm');
eq(normalizeContactRole('CEO'), 'decision_maker');
eq(normalizeContactRole('President'), 'decision_maker');
eq(normalizeContactRole('General Manager'), 'decision_maker');
eq(normalizeContactRole('Property Manager'), 'decision_maker');
eq(normalizeContactRole('AP'), 'ap');
eq(normalizeContactRole('a/p'), 'ap');
eq(normalizeContactRole('accounts payable'), 'ap');
eq(normalizeContactRole('accounts_payable'), 'ap');
eq(normalizeContactRole('Bookkeeper'), 'ap');
eq(normalizeContactRole('controller'), 'ap');
eq(normalizeContactRole('wizard'), '');
eq(normalizeContactRole(''), '');
eq(normalizeContactRole(null), '');
eq(normalizeContactRole(undefined), '');

// --- inferContactRole — position/title only ----------------------------------------
deq(inferContactRole({ position: 'Owner' }), ['decision_maker']);
deq(inferContactRole({ position: 'Site Foreman' }), ['jobsite']);
deq(inferContactRole({ title: 'Accounts Payable Clerk' }), ['ap']);
deq(inferContactRole({ job_title: 'Billing Contact' }), ['billing']);
// Multi-title strings split on separators: both roles infer.
{
  const r = inferContactRole({ position: 'Owner / President' });
  ok(r.includes('decision_maker'));
}
{
  const r = inferContactRole({ position: 'AP & Office Manager' });
  ok(r.includes('ap'));
  ok(r.includes('decision_maker'));
}
deq(inferContactRole({ position: 'Sales Rep' }), []);
deq(inferContactRole({}), []);
deq(inferContactRole(null), []);

// --- normalizeContactStatus ---------------------------------------------------------
eq(normalizeContactStatus({ contact_status: 'active' }), 'active');
eq(normalizeContactStatus({ contact_status: 'Do Not Mail' }), 'do_not_mail');
eq(normalizeContactStatus({ contact_status: 'deactivated' }), 'deactivated');
eq(normalizeContactStatus({ contact_status: 'inactive' }), 'deactivated');
eq(normalizeContactStatus({ contact_status: 'hot_prospect' }), 'hot_prospect');
eq(normalizeContactStatus({ contact_status: 'referral' }), 'referral');
eq(normalizeContactStatus({ is_active: false }), 'deactivated');
eq(normalizeContactStatus({ is_active: false, contact_status: 'hot_prospect' }), 'hot_prospect');
eq(normalizeContactStatus({}), 'active');
eq(normalizeContactStatus({ contact_status: 'nonsense' }), 'active');

// --- resolveContactRoles — every stored shape ----------------------------------------
{
  const r = resolveContactRoles({ id: 'a', is_primary: true });
  eq(r.is_primary, true); deq(r.roles, ['primary']);
}
{
  const r = resolveContactRoles({ id: 'b', is_billing_contact: true });
  eq(r.is_billing, true); deq(r.roles, ['billing']);
}
{
  const r = resolveContactRoles({ id: 'c', is_site_contact: true });
  eq(r.is_site, true); deq(r.roles, ['jobsite']);
}
{
  const r = resolveContactRoles({ id: 'd', is_billing: true, is_site: true });
  deq(r.roles, ['billing', 'jobsite']);
}
{
  const r = resolveContactRoles({ id: 'e', role: 'billing' });
  deq(r.roles, ['billing']); eq(r.is_billing, true);
}
{
  const r = resolveContactRoles({ id: 'f', role: 'Billing' });
  deq(r.roles, ['billing']);
}
{
  const r = resolveContactRoles({ id: 'g', contact_role: 'site' });
  deq(r.roles, ['jobsite']);
}
{
  const r = resolveContactRoles({ id: 'h', roles: ['primary', 'site'] });
  deq(r.roles, ['primary', 'jobsite']);
}
{
  const r = resolveContactRoles({ id: 'h2', contact_roles: ['decision_maker', 'ap'] });
  deq(r.roles, ['decision_maker', 'ap'], 'spec roles array resolves');
}
{
  const r = resolveContactRoles({ id: 'i', role: 'primary,billing' });
  deq(r.roles, ['primary', 'billing']);
}
{
  // Union: flag-derived + string-derived merge deduped in canonical order.
  const r = resolveContactRoles({ id: 'j', is_billing_contact: true, role: 'primary' });
  deq(r.roles, ['primary', 'billing']);
}
{
  const r = resolveContactRoles({ id: 'k', roles: 'junk; billing' });
  deq(r.roles, ['billing']);
}
{
  const r = resolveContactRoles({ id: 'l' });
  deq(r.roles, []); eq(r.is_primary, false); eq(r.is_billing, false); eq(r.is_site, false);
}
{
  // Authority axis contributes the per-person roles.
  const r = resolveContactRoles({ authority_role: 'Accounts_Payable' });
  eq(r.authority_role, 'accounts_payable'); deq(r.roles, ['ap']);
}
{
  const r = resolveContactRoles({ authority_role: 'decision_maker' });
  deq(r.roles, ['decision_maker']);
}
{
  const r = resolveContactRoles({ authority_role: 'site_contact' });
  deq(r.roles, ['jobsite'], 'site_contact authority backs the jobsite role');
}
{
  const r = resolveContactRoles({ authority_role: 'bogus' });
  eq(r.authority_role, 'unknown'); deq(r.roles, []);
}
{
  // Multi-role contact: flag + authority + token all union.
  const r = resolveContactRoles({ is_billing_contact: true, authority_role: 'decision_maker', roles: ['jobsite'] });
  deq(r.roles, ['billing', 'jobsite', 'decision_maker']);
}
{
  // Inferred roles surface separately — never merged into explicit holds.
  const r = resolveContactRoles({ position: 'Owner' });
  deq(r.roles, []); deq(r.inferred_roles, ['decision_maker']);
}
{
  const r = resolveContactRoles({ position: 'Owner', authority_role: 'decision_maker' });
  deq(r.roles, ['decision_maker']); deq(r.inferred_roles, [], 'already held — not inferred twice');
}
{
  const r = resolveContactRoles({ email: '  AP@Acme.TEST ', display_name: 'Ann' });
  eq(r.email, 'ap@acme.test'); eq(r.display_name, 'Ann');
}
{
  const r = resolveContactRoles({ first_name: 'Bo', last_name: 'Jangles' });
  eq(r.display_name, 'Bo Jangles');
}
{
  const r = resolveContactRoles({ email: 'x@y.test' });
  eq(r.display_name, 'x@y.test');
}
eq(resolveContactRoles({ is_active: false }).emailable, false);
eq(resolveContactRoles({ contact_status: 'do_not_mail' }).emailable, false);
eq(resolveContactRoles({ contact_status: 'deactivated' }).emailable, false);
eq(resolveContactRoles({ contact_status: 'hot_prospect' }).emailable, true);
eq(contactMailable({ email: 'a@b.test' }), true);
eq(contactMailable({ email: 'a@b.test', contact_status: 'do_not_mail' }), false);
eq(contactMailable({ email: '' }), false);
eq(contactMailable({ email: 'not-an-email' }), false);

// --- contactEmailGroups --------------------------------------------------------------
deq(contactEmailGroups({ email_groups: ['invoices', 'proofs'] }), ['invoices', 'proofs']);
deq(contactEmailGroups({ email_groups: 'invoices,statements' }), ['invoices', 'statements']);
deq(contactEmailGroups({ email_groups: ['proofs', 'invoices', 'invoices'] }), ['invoices', 'proofs']);
deq(contactEmailGroups({ email_groups: ['invoice', 'statement', 'Proof'] }), ['invoices', 'statements', 'proofs']);
deq(contactEmailGroups({ email_groups: ['newsletter', 'vip'] }), ['marketing', 'vip']);
deq(contactEmailGroups({}), []);
deq(contactEmailGroups({ email_group: 'statements' }), ['statements']);
deq(contactEmailGroups({ email_groups: ['marketing', 'invoices', 'newsletter'] }), ['invoices', 'marketing']);
eq(contactInEmailGroup({ email_groups: ['invoices'] }, 'invoice'), true);
eq(contactInEmailGroup({ email_groups: ['proofs'] }, 'invoices'), false);

// --- contactsForRole — holders in best-first order --------------------------------------
const C = (id, over = {}) => ({ id, ...over });

deq(
  contactsForRole([C('ct1', { is_billing_contact: true }), C('ct2'), C('ct3', { role: 'billing' })], 'billing').map((c) => c.id),
  ['ct1', 'ct3'],
  'flag + token holders, input order when no primary/created',
);
{
  // is_primary holder beats earlier-created non-primary holder.
  const rows = contactsForRole([
    C('ct1', { is_billing_contact: true, created_date: '2020-01-01' }),
    C('ct2', { is_billing_contact: true, is_primary: true, created_date: '2024-01-01' }),
  ], 'billing');
  deq(rows.map((c) => c.id), ['ct2', 'ct1'], 'primary holder first');
}
{
  // Created order: oldest created wins among same-tier holders.
  const rows = contactsForRole([
    C('ct1', { is_billing_contact: true, created_date: '2024-05-01' }),
    C('ct2', { is_billing_contact: true, created_date: '2021-02-03' }),
    C('ct3', { is_billing_contact: true }),
  ], 'billing');
  deq(rows.map((c) => c.id), ['ct2', 'ct1', 'ct3'], 'created asc, missing created last');
}
deq(contactsForRole([C('ct1', { authority_role: 'accounts_payable' })], 'ap').map((c) => c.id), ['ct1']);
deq(contactsForRole([C('ct1', { contact_roles: ['jobsite', 'ap'] })], 'ap').map((c) => c.id), ['ct1']);
deq(contactsForRole([C('ct1', { is_site_contact: true })], 'jobsite').map((c) => c.id), ['ct1']);
deq(contactsForRole([C('ct1', { is_site_contact: true })], 'site').map((c) => c.id), ['ct1'], 'legacy spelling resolves');
deq(contactsForRole([C('ct1')], 'bogus'), []);
deq(contactsForRole(null, 'billing'), []);
{
  // Inactive holders ARE returned (assignment truth) — routing filters them.
  const rows = contactsForRole([C('ct1', { is_billing_contact: true, is_active: false })], 'billing');
  eq(rows.length, 1);
}
{
  // opts.inferred appends title-derived holders after explicit ones.
  const rows = contactsForRole(
    [C('ct1', { is_billing_contact: true }), C('ct2', { position: 'Billing Contact' })],
    'billing',
    { inferred: true },
  );
  deq(rows.map((c) => c.id), ['ct1', 'ct2']);
}

// --- resolveRoleContact — role > primary > created order ---------------------------------
{
  // Exact role holder wins over a primary contact that lacks the role.
  const r = resolveRoleContact(
    [C('ct1', { is_primary: true }), C('ct2', { is_billing_contact: true })],
    'billing',
  );
  eq(r.contact_id, 'ct2'); eq(r.source, 'role'); eq(r.role, 'billing');
}
{
  // Among holders: is_primary beats older created.
  const r = resolveRoleContact(
    [
      C('ct1', { is_billing_contact: true, created_date: '2020-01-01' }),
      C('ct2', { is_billing_contact: true, is_primary: true, created_date: '2024-01-01' }),
    ],
    'billing',
  );
  eq(r.contact_id, 'ct2');
}
{
  // Among holders: older created wins when nobody is primary.
  const r = resolveRoleContact(
    [
      C('ct1', { is_billing_contact: true, created_date: '2024-01-01' }),
      C('ct2', { is_billing_contact: true, created_date: '2020-01-01' }),
    ],
    'billing',
  );
  eq(r.contact_id, 'ct2');
}
{
  // No holder → primary contact fallback.
  const r = resolveRoleContact(
    [C('ct1'), C('ct2', { is_primary: true, created_date: '2024-01-01' })],
    'decision_maker',
  );
  eq(r.contact_id, 'ct2'); eq(r.source, 'primary');
}
{
  // No holder, no primary → oldest contact.
  const r = resolveRoleContact(
    [C('ct1', { created_date: '2024-01-01' }), C('ct2', { created_date: '2020-06-01' })],
    'ap',
  );
  eq(r.contact_id, 'ct2'); eq(r.source, 'first');
}
{
  // Billing's declared fallback: an AP contact outranks a non-role primary?
  // Fallback tier runs BEFORE primary: AP desk is the billing desk.
  const r = resolveRoleContact(
    [C('ct1', { is_primary: true }), C('ct2', { authority_role: 'accounts_payable' })],
    'billing',
  );
  eq(r.contact_id, 'ct2'); eq(r.source, 'fallback_role'); eq(r.via_role, 'ap');
}
{
  // Deactivated holder is skipped; the live primary wins.
  const r = resolveRoleContact(
    [
      C('ct1', { is_billing_contact: true, contact_status: 'deactivated' }),
      C('ct2', { is_primary: true }),
    ],
    'billing',
  );
  eq(r.contact_id, 'ct2'); eq(r.source, 'primary');
}
{
  // includeInactive lifts the live-row filter.
  const r = resolveRoleContact(
    [C('ct1', { is_billing_contact: true, is_active: false }), C('ct2', { is_primary: true })],
    'billing',
    { includeInactive: true },
  );
  eq(r.contact_id, 'ct1'); eq(r.source, 'role');
}
{
  // Title-inferred holder beats the generic primary fallback.
  const r = resolveRoleContact(
    [C('ct1', { is_primary: true }), C('ct2', { position: 'Owner' })],
    'decision_maker',
  );
  eq(r.contact_id, 'ct2'); eq(r.source, 'inferred');
}
{
  // inferred:false disables title inference.
  const r = resolveRoleContact(
    [C('ct1', { is_primary: true }), C('ct2', { position: 'Owner' })],
    'decision_maker',
    { inferred: false },
  );
  eq(r.contact_id, 'ct1'); eq(r.source, 'primary');
}
{
  const r = resolveRoleContact([C('ct1')], 'wizard');
  eq(r.contact, null); eq(r.source, ''); eq(r.role, '');
}
{
  const r = resolveRoleContact([], 'billing');
  eq(r.contact, null); eq(r.source, '');
}
{
  const r = resolveRoleContact(null, 'billing');
  eq(r.contact, null);
}
{
  // Multi-role contact resolves for each of its roles.
  const shared = C('ct1', { is_billing_contact: true, authority_role: 'decision_maker' });
  eq(resolveRoleContact([shared, C('ct2')], 'billing').contact_id, 'ct1');
  eq(resolveRoleContact([shared, C('ct2')], 'decision_maker').contact_id, 'ct1');
  // No ap holder and nobody marked primary → oldest eligible contact.
  const r = resolveRoleContact([shared, C('ct2')], 'ap');
  eq(r.source, 'first'); eq(r.contact_id, 'ct1');
}

// --- validateRoleAssignments --------------------------------------------------------------
{
  // Clean list → no warnings.
  const w = validateRoleAssignments([
    C('ct1', { is_primary: true, email: 'p@x.test' }),
    C('ct2', { is_billing_contact: true, email: 'b@x.test' }),
  ]);
  deq(w, []);
}
{
  // Two ACTIVE billing contacts → multiple_holders.
  const w = validateRoleAssignments([
    C('ct1', { is_primary: true, email: 'p@x.test' }),
    C('ct2', { is_billing_contact: true, email: 'b@x.test' }),
    C('ct3', { is_billing_contact: true, email: 'b2@x.test' }),
  ]);
  const dup = w.find((x) => x.code === 'multiple_holders' && x.role === 'billing');
  ok(dup, 'multiple_holders warning present');
  deq(dup.contact_ids, ['ct2', 'ct3']);
}
{
  // Two decision-makers is legitimate — no warning.
  const w = validateRoleAssignments([
    C('ct1', { is_primary: true, email: 'p@x.test' }),
    C('ct2', { authority_role: 'decision_maker' }),
    C('ct3', { authority_role: 'decision_maker' }),
  ]);
  eq(w.filter((x) => x.code === 'multiple_holders').length, 0);
}
{
  // Nobody primary → no_primary warning.
  const w = validateRoleAssignments([C('ct1', { is_billing_contact: true, email: 'b@x.test' })]);
  ok(w.some((x) => x.code === 'no_primary'));
}
{
  // Deactivated slot holder → inactive_holder (and no multiple/dup on that role).
  const w = validateRoleAssignments([
    C('ct1', { is_primary: true, email: 'p@x.test' }),
    C('ct2', { is_billing_contact: true, is_active: false, email: 'b@x.test' }),
    C('ct3', { is_billing_contact: true, email: 'b2@x.test' }),
  ]);
  const ih = w.find((x) => x.code === 'inactive_holder');
  ok(ih); eq(ih.role, 'billing'); deq(ih.contact_ids, ['ct2']);
  eq(w.filter((x) => x.code === 'multiple_holders').length, 0, 'one ACTIVE billing holder — no dup');
}
{
  // Unrecognized stored role token → unknown_role.
  const w = validateRoleAssignments([
    C('ct1', { is_primary: true, email: 'p@x.test', role: 'wizard' }),
  ]);
  const ur = w.find((x) => x.code === 'unknown_role');
  ok(ur); deq(ur.contact_ids, ['ct1']); ok(ur.message.includes('wizard'));
}
{
  // Slot holder without email → holder_no_email.
  const w = validateRoleAssignments([
    C('ct1', { is_primary: true, email: 'p@x.test' }),
    C('ct2', { is_billing_contact: true }),
  ]);
  const ne = w.find((x) => x.code === 'holder_no_email');
  ok(ne); eq(ne.role, 'billing'); deq(ne.contact_ids, ['ct2']);
}
deq(validateRoleAssignments([]), []);
deq(validateRoleAssignments(null), []);

// --- roleAssignmentPlan — exclusivity -------------------------------------------------------

{
  // Assign billing to ct2 while ct1 holds billing → ct1 cleared, ct2 set.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { is_billing_contact: true, role: 'billing' }), C('ct2')],
    contact_id: 'ct2', role: 'billing',
  });
  eq(plan.errors.length, 0); eq(plan.noop, false);
  deq(plan.updates.map((u) => u.contact_id), ['ct1', 'ct2']);
  deq(plan.updates[0].patch, { is_billing_contact: false, role: '' });
  eq(plan.updates[0].reason, 'clear_previous');
  deq(plan.updates[1].patch, { is_billing_contact: true, role: 'billing' });
  eq(plan.updates[1].reason, 'assign');
}
{
  // Single-assignment per role only: a primary contact elsewhere is untouched.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { is_primary: true, role: 'primary' }), C('ct2')],
    contact_id: 'ct2', role: 'billing',
  });
  deq(plan.updates.map((u) => u.contact_id), ['ct2']);
}
{
  // Multi-role contact keeps its other roles; clearing billing repoints `role`
  // at a still-held role's STORAGE token ('site', not 'jobsite').
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { is_billing_contact: true, is_site_contact: true, role: 'billing' }), C('ct2')],
    contact_id: 'ct2', role: 'billing',
  });
  deq(plan.updates[0].patch, { is_billing_contact: false, role: 'site' });
}
{
  // Clearing a flag whose `role` string names a DIFFERENT role leaves it alone.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { is_billing_contact: true, role: 'primary' }), C('ct2')],
    contact_id: 'ct2', role: 'billing',
  });
  deq(plan.updates[0].patch, { is_billing_contact: false });
}
{
  // Assign to the sole existing holder, role string already correct → noop.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { is_billing_contact: true, role: 'billing' })],
    contact_id: 'ct1', role: 'billing',
  });
  eq(plan.noop, true); eq(plan.updates.length, 0);
}
{
  // Holder by flag but missing role string → patch sets flag true + storage token.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { is_billing_contact: true })],
    contact_id: 'ct1', role: 'billing',
  });
  eq(plan.noop, false);
  deq(plan.updates[0].patch, { is_billing_contact: true, role: 'billing' });
}
{
  // Clear path: assign=false clears target only, no reassignment elsewhere.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { is_primary: true, role: 'primary' }), C('ct2')],
    contact_id: 'ct1', role: 'primary', assign: false,
  });
  deq(plan.updates, [{ contact_id: 'ct1', patch: { is_primary: false, role: '' }, reason: 'clear' }]);
  eq(plan.customer_patch, null);
}
{
  // Clearing a role the contact never held → noop.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1')], contact_id: 'ct1', role: 'jobsite', assign: false,
  });
  eq(plan.noop, true);
}
eq(roleAssignmentPlan({ contacts: [C('ct1')], contact_id: 'nope', role: 'billing' }).errors[0], 'contact_not_found');
eq(roleAssignmentPlan({ contacts: [C('ct1')], contact_id: 'ct1', role: 'wizard' }).errors[0], 'unknown_role');
{
  // Jobsite uses the is_site_contact flag and STORES 'site' in the role string.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1'), C('ct2', { is_site_contact: true, role: 'site' })],
    contact_id: 'ct1', role: 'jobsite',
  });
  eq(plan.role, 'jobsite');
  deq(plan.updates[0].patch, { is_site_contact: false, role: '' });
  deq(plan.updates[1].patch, { is_site_contact: true, role: 'site' });
}
{
  // Legacy 'site' input normalizes to the same plan.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1'), C('ct2', { is_site_contact: true, role: 'site' })],
    contact_id: 'ct1', role: 'site',
  });
  eq(plan.role, 'jobsite');
  deq(plan.updates[1].patch, { is_site_contact: true, role: 'site' });
}
{
  // decision_maker assignment writes authority_role; other holders stay put.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { authority_role: 'decision_maker' }), C('ct2')],
    contact_id: 'ct2', role: 'decision_maker',
  });
  deq(plan.updates, [{ contact_id: 'ct2', patch: { authority_role: 'decision_maker' }, reason: 'assign' }]);
  eq(plan.customer_patch, null);
}
{
  // Clearing an authority-backed role drops the enum back to 'unknown'.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { authority_role: 'accounts_payable' })],
    contact_id: 'ct1', role: 'ap', assign: false,
  });
  deq(plan.updates, [{ contact_id: 'ct1', patch: { authority_role: 'unknown' }, reason: 'clear' }]);
}
{
  // Assign dm to a contact already holding it → noop.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { authority_role: 'decision_maker' })],
    contact_id: 'ct1', role: 'decision_maker',
  });
  eq(plan.noop, true);
}
{
  // Assign ap when the row already carries a contact_roles array → appended.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { contact_roles: ['jobsite'] })],
    contact_id: 'ct1', role: 'ap',
  });
  deq(plan.updates[0].patch, { authority_role: 'accounts_payable', contact_roles: ['jobsite', 'ap'] });
}
{
  // Clearing a role held ONLY inside a roles array scrubs the array.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { roles: ['decision_maker'] })],
    contact_id: 'ct1', role: 'decision_maker', assign: false,
  });
  deq(plan.updates, [{ contact_id: 'ct1', patch: { roles: [] }, reason: 'clear' }]);
}
{
  // Clearing a flag role also scrubs a stored roles array.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { is_billing_contact: true, roles: ['billing'] })],
    contact_id: 'ct1', role: 'billing', assign: false,
  });
  deq(plan.updates, [{ contact_id: 'ct1', patch: { roles: [], is_billing_contact: false }, reason: 'clear' }]);
}
{
  // A flag-holder via array only still gets the flag repaired on assign.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { roles: ['billing'] })],
    contact_id: 'ct1', role: 'billing',
  });
  deq(plan.updates[0].patch, { is_billing_contact: true, role: 'billing' });
}
{
  // Two contacts BOTH flagged billing both clear (dedup safety).
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { is_billing_contact: true }), C('ct2', { is_billing_contact: true, role: 'billing' }), C('ct3')],
    contact_id: 'ct3', role: 'billing',
  });
  const clears = plan.updates.filter((u) => u.reason === 'clear_previous');
  eq(clears.length, 2);
  deq(plan.updates[2].patch, { is_billing_contact: true, role: 'billing' });
}

// --- customerPatchForRole ---------------------------------------------------------------------
{
  const patch = customerPatchForRole({
    contact: { display_name: 'Betty Books', email: 'bb@acme.test', phone: '555-1' }, role: 'billing',
  });
  deq(patch, {
    billing_contact_same: false,
    billing_contact_name: 'Betty Books',
    billing_contact_email: 'bb@acme.test',
    billing_contact_phone: '555-1',
  });
}
{
  const patch = customerPatchForRole({
    contact: { first_name: 'Pat', last_name: 'Site', position: 'PM', email: 'p@s.test', phone: '1', phone_ext: '9', mobile_phone: '2' },
    role: 'primary',
  });
  eq(patch.contact_first_name, 'Pat');
  eq(patch.contact_email, 'p@s.test');
  eq(patch.contact_office_ext, '9');
  eq(patch.contact_cell_phone, '2');
}
eq(customerPatchForRole({ contact: { display_name: 'X' }, role: 'jobsite' }), null);
eq(customerPatchForRole({ contact: { display_name: 'X' }, role: 'decision_maker' }), null);
eq(customerPatchForRole({ contact: { display_name: 'X' }, role: 'ap' }), null);
{
  // roleAssignmentPlan embeds the customer mirror on assign.
  const plan = roleAssignmentPlan({
    contacts: [C('ct1', { display_name: 'Betty', email: 'b@x.test' })],
    contact_id: 'ct1', role: 'billing',
  });
  eq(plan.customer_patch.billing_contact_email, 'b@x.test');
}

// --- resolveBillingContact ---------------------------------------------------------------------
const cust = (over = {}) => ({ id: 'c1', ...over });

{
  // Billing-role contact beats every customer-level field.
  const r = resolveBillingContact({
    contacts: [C('ct1', { is_billing_contact: true, email: 'ap@acme.test' })],
    customer: cust({ billing_email: 'cb@acme.test', email: 'gen@acme.test' }),
  });
  eq(r.email, 'ap@acme.test'); eq(r.source, 'billing_contact'); eq(r.contact_id, 'ct1');
}
{
  // `role` string alone (no flag) still counts.
  const r = resolveBillingContact({
    contacts: [C('ct1', { role: 'billing', email: 'ap@acme.test' })],
    customer: cust({ billing_email: 'cb@acme.test' }),
  });
  eq(r.email, 'ap@acme.test');
}
{
  // AP-authority contact is the billing fallback before primary.
  const r = resolveBillingContact({
    contacts: [
      C('ct1', { authority_role: 'accounts_payable', email: 'ap@acme.test' }),
      C('ct2', { is_primary: true, email: 'main@acme.test' }),
    ],
    customer: cust({ billing_email: 'cb@acme.test' }),
  });
  eq(r.email, 'ap@acme.test'); eq(r.source, 'accounts_payable_contact');
}
{
  // `contact_roles: ['ap']` counts as the AP fallback too.
  const r = resolveBillingContact({
    contacts: [C('ct1', { contact_roles: ['ap'], email: 'ap@acme.test' })],
    customer: cust({ billing_email: 'cb@acme.test' }),
  });
  eq(r.email, 'ap@acme.test'); eq(r.source, 'accounts_payable_contact');
}
{
  // Primary contact beats customer-level fields.
  const r = resolveBillingContact({
    contacts: [C('ct1', { is_primary: true, email: 'main@acme.test' })],
    customer: cust({ billing_email: 'cb@acme.test', email: 'gen@acme.test' }),
  });
  eq(r.email, 'main@acme.test'); eq(r.source, 'primary_contact');
}
{
  // Customer-level chain: billing_email before generic email.
  const r = resolveBillingContact({
    contacts: [],
    customer: cust({ billing_email: 'cb@acme.test', email: 'gen@acme.test' }),
  });
  eq(r.email, 'cb@acme.test'); eq(r.source, 'customer_billing');
}
{
  const r = resolveBillingContact({
    contacts: [],
    customer: cust({ email: 'gen@acme.test', contact_email: 'c@acme.test' }),
  });
  eq(r.email, 'gen@acme.test'); eq(r.source, 'customer');
}
{
  const r = resolveBillingContact({
    contacts: [C('ct1', { is_primary: true })], // no email → falls through
    customer: cust({ billing_contact_email: 'cb@acme.test' }),
  });
  eq(r.email, 'cb@acme.test'); eq(r.source, 'customer_billing');
}
{
  // Deactivated / do_not_mail / inactive billing contacts are skipped.
  for (const bad of [
    { is_billing_contact: true, email: 'ap@x.test', contact_status: 'deactivated' },
    { is_billing_contact: true, email: 'ap@x.test', contact_status: 'do_not_mail' },
    { is_billing_contact: true, email: 'ap@x.test', is_active: false },
  ]) {
    const r = resolveBillingContact({ contacts: [C('ct1', bad)], customer: cust({ email: 'g@x.test' }) });
    eq(r.email, 'g@x.test');
  }
}
{
  // First emailable billing contact wins (array order preserved within tier).
  const r = resolveBillingContact({
    contacts: [
      C('ct1', { is_billing_contact: true, email: '' }),
      C('ct2', { is_billing_contact: true, email: 'ap2@x.test' }),
    ],
    customer: cust({}),
  });
  eq(r.email, 'ap2@x.test'); eq(r.contact_id, 'ct2');
}
{
  const r = resolveBillingContact({ contacts: [], customer: cust({}) });
  eq(r.email, ''); eq(r.source, ''); eq(r.contact, null);
}
{
  // Missing args are safe.
  const r = resolveBillingContact();
  eq(r.email, '');
}
{
  // billing_contact_email outranks generic email at the customer tier.
  const r = resolveBillingContact({
    contacts: [],
    customer: cust({ email: 'gen@x.test', billing_contact_email: 'bill@x.test' }),
  });
  eq(r.email, 'bill@x.test'); eq(r.source, 'customer_billing');
}

rmSync(out, { force: true });
console.log(`PASS contact-roles (${count} asserts)`);
