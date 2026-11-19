// Contact roles + statuses model — ESTIMATOR_MASTERPLAN WS-G / item G-04
// (A-11 follow-on). Pure TS, zero imports: safe to esbuild-bundle into Deno
// functions (base44/functions/*), frontend modules, and Node test scripts.
// Integer-safe: all ordering uses timestamps + array index, ids compare as
// strings, no floating point anywhere.
//
// CustomerContact carries role data in four parallel shapes (declared in
// base44/entities/CustomerContact.jsonc):
//
//   • Flag columns   — is_primary / is_billing_contact / is_site_contact
//                      (booleans; the writeable normalized truth for the
//                      three CoreBridge "slot" roles primary/billing/jobsite).
//   • `role` string  — the CoreBridge contact role. Free-text; the entity doc
//                      calls out primary | billing | site. Single-valued, so
//                      it can only name ONE of a multi-role contact's roles.
//                      Convention: `role` names the most recently assigned
//                      slot role (stored spelling 'site', not 'jobsite');
//                      clearing a role repoints it at a still-held role.
//   • authority_role — typed enum backing the decision_maker / ap roles:
//                      unknown, decision_maker, influencer, accounts_payable,
//                      site_contact, tenant, owner_rep, property_manager,
//                      other. Unlike the flags it is a PER-PERSON axis — two
//                      decision-makers on one account is legitimate.
//   • `roles`/`contact_roles` array — NOT yet in the schema (G-04 spec'd it
//                      for the orchestrator): tolerated read-side so imported
//                      rows and a future schema push both resolve.
//
// Canonical role registry (CONTACT_ROLES): primary | billing | jobsite |
// decision_maker | ap.
//
//   Single-assignment slots (CoreBridge): primary, billing, jobsite — each
//   held by at most one active contact per customer at a time. One contact
//   may hold several slots at once.
//   Multi-holder roles: decision_maker, ap — per-person designations, never
//   flagged as duplicates.
//
// Legacy normalization (normalizeContactRole): free-text `role`, `position`,
// `title` and CSV spellings fold into the canonical keys — 'site contact' /
// 'job site' → jobsite, 'owner' / 'ceo' → decision_maker, 'accounts payable' /
// 'bookkeeper' → ap, 'billing contact' → billing, 'main contact' → primary.
// inferContactRole additionally maps position/title-only contacts so legacy
// rows resolve before anyone re-tags them (explicit holds always win).
//
// Lifecycle status (`contact_status`, CoreBridge): active | deactivated |
// do_not_mail | hot_prospect | referral. is_active=false reads as
// deactivated; deactivated + do_not_mail contacts are NOT emailable and a
// deactivated contact never wins role resolution by default.
//
// Email groups (`email_groups[]`): freeform distribution tags — canonical
// vocabulary invoices | statements | proofs | marketing (entity doc). The
// normalizer aliases close spellings into the canonical set and preserves
// unknown tags verbatim (normalized), never dropping membership data.
//
// API:
//   CONTACT_ROLES / CONTACT_ROLE_KEYS / CONTACT_ROLE_LABELS     role registry
//   CONTACT_STATUSES / CONTACT_EMAIL_GROUPS / CONTACT_AUTHORITY_ROLES
//   normalizeContactRole(value)            → canonical role key | ''
//   inferContactRole(contact)              → position/title-derived roles[]
//   normalizeContactStatus(contact)        → canonical lifecycle status
//   resolveContactRoles(contact)           → normalized flags+meta snapshot
//   contactsForRole(contacts, role)        → holder rows, best-first order
//   resolveRoleContact(contacts, role)     → {contact, contact_id, source}
//   validateRoleAssignments(contacts)      → [{code, role?, contact_ids, message}]
//   roleAssignmentPlan({contacts,contact_id,role,assign})
//                                          → {updates:[{contact_id,patch}],
//                                             customer_patch, noop, errors}
//   customerPatchForRole({contact, role})  → Customer-row mirror fields
//   resolveBillingContact({contacts,customer}) → {email,contact,source}
//   contactEmailGroups(contact)            → normalized group list
//   contactInEmailGroup(contact, group)    → membership test
//   contactMailable(contact)               → emailable && has email
//
// resolveRoleContact contract — "the right person, not the first contact":
//   candidates = contacts that are active (is_active !== false AND
//   contact_status ≠ deactivated; opts.includeInactive lifts the filter).
//   Precedence for the requested role R:
//     1. Explicit R holders        — flags + role/roles/contact_roles tokens
//                                    + authority_role mapping. Source 'role'.
//     2. Inferred R holders        — position/title-derived. Source 'inferred'.
//     3. Declared fallback roles   — billing falls back to 'ap' (the AP desk
//                                    IS the billing desk when no billing
//                                    contact is tagged). Source 'fallback_role'.
//     4. Primary holders           — the account catch-all. Source 'primary'.
//     5. Oldest candidate          — created order. Source 'first'.
//   Within a tier: is_primary=true first, then created_date ascending
//   (missing created sorts last), then input order. The winner's `source`
//   tells callers whether the answer is an explicit assignment or a guess —
//   invoicing code should prefer 'role'/'fallback_role' sources.
//
// resolveBillingContact contract (AR recipient for invoices/statements):
//   1. First emailable contact holding the `billing` role with an email.
//   2. First emailable `ap` role/authority contact with an email
//      (AP is the billing desk even before a formal billing flag lands).
//   3. First emailable `primary` role contact with an email.
//   4. Customer-level fields, same order as
//      statementBatchModel.resolveBillingEmail:
//      billing_email → billing_contact_email → email → contact_email →
//      primary_email.
//   Every step requires a value containing '@'. A deactivated/do_not_mail/
//   is_active=false contact is skipped even when flagged — it must never
//   silently absorb AR mail.

const clean = (v: any) => String(v ?? '').trim();
const isObj = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);

// --- Role registry --------------------------------------------------------------

export type ContactRoleDef = {
  key: string; // canonical key used in roles[]/plans/tests
  label: string; // display label for chips/selects
  description: string;
  single: boolean; // single-assignment slot per customer (multi_holder warning)
  flag?: string; // CustomerContact boolean column backing the role
  authority?: string; // authority_role enum value backing the role
  storage: string; // token written to the single-value `role` string
};

export const CONTACT_ROLES: readonly ContactRoleDef[] = Object.freeze([
  {
    key: 'primary',
    label: 'Primary',
    description: 'Primary point of contact for the account — the catch-all person invoices, portal messages and work orders fall back to.',
    single: true,
    flag: 'is_primary',
    storage: 'primary',
  },
  {
    key: 'billing',
    label: 'Billing',
    description: 'Receives invoices, statements and AR correspondence. Falls back to the AP contact, then primary.',
    single: true,
    flag: 'is_billing_contact',
    storage: 'billing',
  },
  {
    key: 'jobsite',
    label: 'Jobsite',
    description: 'On-site contact for the job — install coordination, site access and work-order field questions. Stored as CoreBridge role "site" / is_site_contact.',
    single: true,
    flag: 'is_site_contact',
    authority: 'site_contact',
    storage: 'site',
  },
  {
    key: 'decision_maker',
    label: 'Decision maker',
    description: 'Approves quotes, proofs and change orders — the person who can say yes. Several per account is normal.',
    single: false,
    authority: 'decision_maker',
    storage: 'decision_maker',
  },
  {
    key: 'ap',
    label: 'Accounts payable',
    description: 'The customer AP desk — payments, remittance and invoice-status questions; automatic fallback when no billing contact is tagged.',
    single: false,
    authority: 'accounts_payable',
    storage: 'ap',
  },
]);

export const CONTACT_ROLE_KEYS: readonly string[] = Object.freeze(
  CONTACT_ROLES.map((r) => r.key),
);

export const CONTACT_ROLE_LABELS: Record<string, string> = Object.freeze(
  CONTACT_ROLES.reduce((m: Record<string, string>, r) => {
    m[r.key] = r.label;
    return m;
  }, {}),
);

// Roles that warn when more than one ACTIVE contact holds them.
export const SINGLE_ASSIGNMENT_ROLES: readonly string[] = Object.freeze(
  CONTACT_ROLES.filter((r) => r.single).map((r) => r.key),
);

// Canonical role → its CustomerContact boolean flag column (slot roles only;
// decision_maker/ap persist through authority_role until the spec'd
// contact_roles array lands).
export const CONTACT_ROLE_FLAG: Record<string, string> = Object.freeze(
  CONTACT_ROLES.reduce((m: Record<string, string>, r) => {
    if (r.flag) m[r.key] = r.flag;
    return m;
  }, {}),
);

// Declared per-role fallback chain inside resolveRoleContact (before the
// generic primary→oldest tail): billing reroutes to the AP desk.
export const CONTACT_ROLE_FALLBACKS: Record<string, readonly string[]> = Object.freeze({
  billing: Object.freeze(['ap']),
});

const roleDef = (key: string): ContactRoleDef | undefined =>
  CONTACT_ROLES.find((r) => r.key === key);

// authority_role enum value → canonical role key (per-person roles).
const AUTHORITY_TO_ROLE: Record<string, string> = Object.freeze(
  CONTACT_ROLES.reduce((m: Record<string, string>, r) => {
    if (r.authority) m[r.authority] = r.key;
    return m;
  }, {}),
);

// --- Other vocabularies -----------------------------------------------------------

export const CONTACT_STATUSES = [
  'active',
  'deactivated',
  'do_not_mail',
  'hot_prospect',
  'referral',
];

export const CONTACT_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  deactivated: 'Deactivated',
  do_not_mail: 'Do not mail',
  hot_prospect: 'Hot prospect',
  referral: 'Referral',
};

export const CONTACT_EMAIL_GROUPS = ['invoices', 'statements', 'proofs', 'marketing'];

export const CONTACT_EMAIL_GROUP_LABELS: Record<string, string> = {
  invoices: 'Invoices',
  statements: 'Statements',
  proofs: 'Proofs',
  marketing: 'Marketing',
};

// authority_role is an already-declared enum — kept here so callers and tests
// can validate stored rows without re-typing the vocabulary.
export const CONTACT_AUTHORITY_ROLES = [
  'unknown',
  'decision_maker',
  'influencer',
  'accounts_payable',
  'site_contact',
  'tenant',
  'owner_rep',
  'property_manager',
  'other',
];

// Customer-level billing-email fallback order — identical to
// statementBatchModel.resolveBillingEmail (keep the two chains in sync).
export const CUSTOMER_BILLING_EMAIL_FIELDS = [
  'billing_email',
  'billing_contact_email',
  'email',
  'contact_email',
  'primary_email',
];

// --- Role normalization ---------------------------------------------------------

// CoreBridge/CSV spellings + job titles folded into the canonical five-role
// vocabulary. Keys are already lowercased/space-normalized (see
// normalizeContactRole for the exact fold).
const ROLE_ALIASES: Record<string, string> = {
  // --- primary ---
  primary: 'primary',
  'primary contact': 'primary',
  primary_contact: 'primary',
  main: 'primary',
  'main contact': 'primary',
  'key contact': 'primary',
  // --- billing ---
  billing: 'billing',
  'billing contact': 'billing',
  billing_contact: 'billing',
  invoicing: 'billing',
  'invoice contact': 'billing',
  // --- jobsite (stored spelling: 'site') ---
  site: 'jobsite',
  'site contact': 'jobsite',
  site_contact: 'jobsite',
  'job site': 'jobsite',
  job_site: 'jobsite',
  jobsite: 'jobsite',
  'jobsite contact': 'jobsite',
  'site manager': 'jobsite',
  'site supervisor': 'jobsite',
  'site foreman': 'jobsite',
  superintendent: 'jobsite',
  foreman: 'jobsite',
  'field supervisor': 'jobsite',
  'field contact': 'jobsite',
  install: 'jobsite',
  installation: 'jobsite',
  installer: 'jobsite',
  'install contact': 'jobsite',
  'install manager': 'jobsite',
  'installation manager': 'jobsite',
  'lead installer': 'jobsite',
  'project manager': 'jobsite',
  'pm': 'jobsite',
  // --- decision_maker ---
  decision_maker: 'decision_maker',
  'decision maker': 'decision_maker',
  dm: 'decision_maker',
  owner: 'decision_maker',
  'co owner': 'decision_maker',
  'co-owner': 'decision_maker',
  ceo: 'decision_maker',
  'chief executive': 'decision_maker',
  'chief executive officer': 'decision_maker',
  cfo: 'decision_maker',
  coo: 'decision_maker',
  president: 'decision_maker',
  'vice president': 'decision_maker',
  vp: 'decision_maker',
  principal: 'decision_maker',
  partner: 'decision_maker',
  'managing partner': 'decision_maker',
  'managing member': 'decision_maker',
  member: 'decision_maker',
  gm: 'decision_maker',
  'general manager': 'decision_maker',
  director: 'decision_maker',
  'executive director': 'decision_maker',
  'office manager': 'decision_maker',
  'facilities manager': 'decision_maker',
  'facility manager': 'decision_maker',
  'purchasing manager': 'decision_maker',
  'property manager': 'decision_maker',
  // --- ap ---
  ap: 'ap',
  'a/p': 'ap',
  'ap contact': 'ap',
  'ap clerk': 'ap',
  accounts_payable: 'ap',
  'accounts payable': 'ap',
  'accounts payable clerk': 'ap',
  payables: 'ap',
  'payables clerk': 'ap',
  bookkeeper: 'ap',
  'book keeper': 'ap',
  accountant: 'ap',
  accounting: 'ap',
  'accounting clerk': 'ap',
  'accounting department': 'ap',
  controller: 'ap',
  comptroller: 'ap',
  'staff accountant': 'ap',
  'payment contact': 'ap',
};

/**
 * normalizeContactRole — any stored role token → canonical 'primary' |
 * 'billing' | 'jobsite' | 'decision_maker' | 'ap', or '' when unrecognized.
 * Case/space/underscore/dash tolerant; the common CoreBridge spellings and
 * job titles fold in ('Site Contact' → 'jobsite', 'Owner' → 'decision_maker',
 * 'Bookkeeper' → 'ap').
 */
export function normalizeContactRole(value: any): string {
  const s = clean(value).toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  if (!s) return '';
  if (ROLE_ALIASES[s]) return ROLE_ALIASES[s];
  const underscored = s.replace(/ /g, '_');
  return ROLE_ALIASES[underscored] || '';
}

// Raw role tokens off a contact row: `role`, `contact_role`, `roles`,
// `contact_roles` may each be a string (single or comma/semicolon/pipe/slash
// separated) or an array.
function contactRoleTokens(contact: any): string[] {
  const out: string[] = [];
  const push = (v: any) => {
    if (Array.isArray(v)) { v.forEach(push); return; }
    for (const token of clean(v).split(/[,;/|]+/)) {
      const t = clean(token);
      if (t) out.push(t);
    }
  };
  push(contact?.role);
  push(contact?.contact_role);
  push(contact?.roles);
  push(contact?.contact_roles);
  return out;
}

/**
 * inferContactRole — position/title-derived roles for legacy contacts that
 * were never explicitly tagged. Reads `position`, `title` and
 * `job_title` through the same alias table; never invents a slot-role
 * assignment — callers keep explicit holds ranked above inferred ones.
 */
export function inferContactRole(contact: any): string[] {
  const c = isObj(contact) ? contact : {};
  const raw = [c.position, c.title, c.job_title].map(clean).filter(Boolean);
  const held = new Set<string>();
  for (const text of raw) {
    const direct = normalizeContactRole(text);
    if (direct) held.add(direct);
    // Word-level scan so 'Owner / President' or 'AP & Office Manager' still hit.
    for (const token of text.split(/[/,;&|]+/)) {
      const r = normalizeContactRole(token);
      if (r) held.add(r);
    }
  }
  return CONTACT_ROLE_KEYS.filter((r) => held.has(r));
}

// --- Status / group normalization -----------------------------------------------

const STATUS_ALIASES: Record<string, string> = {
  active: 'active',
  inactive: 'deactivated',
  deactivated: 'deactivated',
  disabled: 'deactivated',
  do_not_mail: 'do_not_mail',
  donotmail: 'do_not_mail',
  'do not mail': 'do_not_mail',
  no_mail: 'do_not_mail',
  nomail: 'do_not_mail',
  hot_prospect: 'hot_prospect',
  'hot prospect': 'hot_prospect',
  hot: 'hot_prospect',
  referral: 'referral',
  referred: 'referral',
};

/**
 * normalizeContactStatus — stored `contact_status` (+ is_active=false back-
 * stop) → canonical lifecycle status. An explicit recognized status always
 * wins; a bare is_active=false row reads 'deactivated'; anything else is
 * 'active'. Unrecognized strings fall back to 'active' so junk never mutes a
 * contact.
 */
export function normalizeContactStatus(contact: any): string {
  const raw = clean(contact?.contact_status ?? contact?.status).toLowerCase().replace(/[\s-]+/g, '_');
  const aliased = STATUS_ALIASES[raw];
  if (aliased && CONTACT_STATUSES.includes(aliased)) return aliased;
  if (contact?.is_active === false) return 'deactivated';
  return 'active';
}

const GROUP_ALIASES: Record<string, string> = {
  invoice: 'invoices',
  invoices: 'invoices',
  billing: 'invoices',
  statement: 'statements',
  statements: 'statements',
  ar: 'statements',
  accounts_receivable: 'statements',
  proof: 'proofs',
  proofs: 'proofs',
  artwork: 'proofs',
  art: 'proofs',
  marketing: 'marketing',
  newsletter: 'marketing',
  newsletters: 'marketing',
  promo: 'marketing',
  promos: 'marketing',
  promotions: 'marketing',
};

function normalizeGroupToken(token: any): string {
  const s = clean(token).toLowerCase().replace(/[\s-]+/g, '_');
  if (!s) return '';
  return GROUP_ALIASES[s] || s;
}

/**
 * contactEmailGroups — `email_groups` (array or delimited string; `email_group`
 * tolerated as a single-value alias) → a deduped normalized list. Canonical
 * groups come first in CONTACT_EMAIL_GROUPS order; unrecognized tags follow in
 * stored order (normalized) — membership data is never dropped.
 */
export function contactEmailGroups(contact: any): string[] {
  const raw: string[] = [];
  const push = (v: any) => {
    if (Array.isArray(v)) { v.forEach(push); return; }
    for (const token of clean(v).split(/[,;|]+/)) {
      const t = clean(token);
      if (t) raw.push(t);
    }
  };
  push(contact?.email_groups);
  push(contact?.email_group);
  const seen = new Set<string>();
  const canonical: string[] = [];
  const extras: string[] = [];
  for (const token of raw) {
    const g = normalizeGroupToken(token);
    if (!g || seen.has(g)) continue;
    seen.add(g);
    if (CONTACT_EMAIL_GROUPS.includes(g)) canonical.push(g);
    else extras.push(g);
  }
  canonical.sort((a, b) => CONTACT_EMAIL_GROUPS.indexOf(a) - CONTACT_EMAIL_GROUPS.indexOf(b));
  return [...canonical, ...extras];
}

/** contactInEmailGroup — alias-tolerant membership test. */
export function contactInEmailGroup(contact: any, group: any): boolean {
  const want = normalizeGroupToken(group);
  return Boolean(want) && contactEmailGroups(contact).includes(want);
}

// --- Normalized snapshot -----------------------------------------------------------

/**
 * resolveContactRoles — one contact row → its normalized role/status snapshot.
 * Tolerates every stored shape: flag columns (is_primary / is_primary_contact,
 * is_billing_contact / is_billing, is_site_contact / is_site), the `role`/
 * `contact_role`/`roles`/`contact_roles` strings-or-arrays, and the
 * authority_role enum (decision_maker → 'decision_maker', accounts_payable →
 * 'ap', site_contact → 'jobsite').
 *
 * `roles` is the union of flag-, string- and authority-derived roles in
 * CONTACT_ROLES order — a role held by any representation counts once.
 * `explicit_roles` is the same union; `inferred_roles` lists position/title-
 * derived roles NOT already held — display hints, never assignment truth.
 */
export function resolveContactRoles(contact: any) {
  const c = isObj(contact) ? contact : {};
  const held = new Set<string>();
  if (c.is_primary === true || c.is_primary_contact === true) held.add('primary');
  if (c.is_billing_contact === true || c.is_billing === true) held.add('billing');
  if (c.is_site_contact === true || c.is_site === true) held.add('jobsite');
  for (const token of contactRoleTokens(c)) {
    const r = normalizeContactRole(token);
    if (r) held.add(r);
  }
  const authorityRaw = clean(c.authority_role).toLowerCase().replace(/[\s-]+/g, '_');
  const authority_role = CONTACT_AUTHORITY_ROLES.includes(authorityRaw) ? authorityRaw : 'unknown';
  const viaAuthority = AUTHORITY_TO_ROLE[authority_role];
  if (viaAuthority) held.add(viaAuthority);

  const roles = CONTACT_ROLE_KEYS.filter((r) => held.has(r));
  const inferred_roles = inferContactRole(c).filter((r) => !held.has(r));

  const status = normalizeContactStatus(c);
  const is_active = c.is_active !== false;
  // Emailable: the row is live AND its lifecycle status allows AR mail.
  const emailable = is_active && status !== 'deactivated' && status !== 'do_not_mail';

  return {
    contact_id: clean(c.id),
    roles,
    explicit_roles: roles,
    inferred_roles,
    is_primary: held.has('primary'),
    is_billing: held.has('billing'),
    is_site: held.has('jobsite'),
    authority_role,
    status,
    is_active,
    emailable,
    email: clean(c.email).toLowerCase(),
    display_name: clean(c.display_name) ||
      [clean(c.first_name), clean(c.last_name)].filter(Boolean).join(' ') ||
      clean(c.name) || clean(c.email),
    email_groups: contactEmailGroups(c),
  };
}

/** contactMailable — a contact that can actually receive mail right now. */
export function contactMailable(contact: any): boolean {
  const r = resolveContactRoles(contact);
  return r.emailable && r.email.includes('@');
}

// --- Role-holder resolution ---------------------------------------------------------

// Created-order timestamp for a contact row; missing/unparseable sorts last.
const createdTs = (c: any): number => {
  const raw = clean(c?.created_date) || clean(c?.created_at) || clean(c?.created);
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
};

// Best-first ordering inside one holder tier: is_primary first, then created
// ascending, then original array order (stable, integer-only comparisons).
const holderOrder = (rows: any[]): any[] =>
  rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const ap = a.row?.is_primary === true ? 0 : 1;
      const bp = b.row?.is_primary === true ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const at = createdTs(a.row);
      const bt = createdTs(b.row);
      if (at !== bt) return at - bt;
      return a.index - b.index;
    })
    .map((x) => x.row);

const normalizeContacts = (contacts: any): any[] =>
  (Array.isArray(contacts) ? contacts : []).filter(isObj);

// A candidate is resolution-eligible while the row is live — deactivated rows
// never absorb routing even when they still carry the flag.
const isResolvable = (contact: any): boolean => {
  const info = resolveContactRoles(contact);
  return info.is_active && info.status !== 'deactivated';
};

/**
 * contactsForRole — every contact row explicitly holding `role` (flags,
 * role/roles/contact_roles tokens, authority_role mapping), in best-first
 * order: is_primary first, then created_date ascending, then input order.
 * Pass {inferred: true} to also append position/title-derived holders after
 * the explicit ones. Inactive/deactivated rows are INCLUDED — assignment
 * truth doesn't hide them (validateRoleAssignments needs to see them);
 * resolveRoleContact applies the live-row filter for routing.
 */
export function contactsForRole(contacts: any, role: any, opts: any = {}): any[] {
  const r = normalizeContactRole(role);
  if (!r) return [];
  const rows = normalizeContacts(contacts);
  const explicit = rows.filter((c) => resolveContactRoles(c).roles.includes(r));
  const out = holderOrder(explicit);
  if (opts?.inferred) {
    const explicitSet = new Set(explicit);
    const inferred = rows.filter(
      (c) => !explicitSet.has(c) && inferContactRole(c).includes(r),
    );
    out.push(...holderOrder(inferred));
  }
  return out;
}

/**
 * resolveRoleContact — the best contact for `role` (see header contract).
 * Returns {contact, contact_id, role, source} where source is 'role' |
 * 'inferred' | 'fallback_role' | 'primary' | 'first' | ''. `contact` is the
 * raw row so callers can read any field.
 */
export function resolveRoleContact(contacts: any, role: any, opts: any = {}) {
  const r = normalizeContactRole(role);
  const empty = { contact: null, contact_id: '', role: r, source: '' };
  if (!r) return empty;
  const all = normalizeContacts(contacts);
  const eligible = all.filter((c) => (opts?.includeInactive ? true : isResolvable(c)));
  if (!eligible.length) return empty;

  const explicit = holderOrder(eligible.filter((c) => resolveContactRoles(c).roles.includes(r)));
  if (explicit.length) {
    const c = explicit[0];
    return { contact: c, contact_id: clean(c.id), role: r, source: 'role' };
  }

  if (opts?.inferred !== false) {
    const inferred = holderOrder(eligible.filter((c) => inferContactRole(c).includes(r)));
    if (inferred.length) {
      const c = inferred[0];
      return { contact: c, contact_id: clean(c.id), role: r, source: 'inferred' };
    }
  }

  for (const fb of CONTACT_ROLE_FALLBACKS[r] || []) {
    const fbRows = holderOrder(eligible.filter((c) => resolveContactRoles(c).roles.includes(fb)));
    if (fbRows.length) {
      const c = fbRows[0];
      return { contact: c, contact_id: clean(c.id), role: r, source: 'fallback_role', via_role: fb };
    }
  }

  const primaries = holderOrder(eligible.filter((c) => resolveContactRoles(c).roles.includes('primary')));
  if (primaries.length) {
    const c = primaries[0];
    return { contact: c, contact_id: clean(c.id), role: r, source: 'primary' };
  }

  const oldest = holderOrder(eligible)[0];
  if (oldest) return { contact: oldest, contact_id: clean(oldest.id), role: r, source: 'first' };
  return empty;
}

// --- Assignment validation -----------------------------------------------------------

export type RoleAssignmentWarning = {
  code: string; // 'multiple_holders' | 'no_primary' | 'inactive_holder' | 'unknown_role' | 'holder_no_email'
  role?: string;
  contact_ids: string[];
  message: string;
};

/**
 * validateRoleAssignments — audit a customer's contact list for role
 * hygiene. Warnings (non-fatal, UI-copy-ready):
 *   multiple_holders  two+ ACTIVE contacts hold a single-assignment role
 *   inactive_holder   a deactivated/inactive contact still carries a slot role
 *   no_primary        no active contact holds the primary role
 *   unknown_role      a stored role token no normalizer recognizes
 *   holder_no_email   an active slot-role holder has no usable email —
 *                     billing especially: invoices would fall through to the
 *                     generic customer fields.
 */
export function validateRoleAssignments(contacts: any): RoleAssignmentWarning[] {
  const rows = normalizeContacts(contacts);
  const warnings: RoleAssignmentWarning[] = [];
  if (!rows.length) return warnings;

  const snap = rows.map((row) => ({ row, info: resolveContactRoles(row) }));
  const live = snap.filter((x) => x.info.is_active && x.info.status !== 'deactivated');

  for (const role of SINGLE_ASSIGNMENT_ROLES) {
    const holders = live.filter((x) => x.info.roles.includes(role));
    if (holders.length > 1) {
      const ordered = holderOrder(holders.map((x) => x.row));
      warnings.push({
        code: 'multiple_holders',
        role,
        contact_ids: ordered.map((x) => clean(x.id)),
        message: `${holders.length} contacts hold the ${CONTACT_ROLE_LABELS[role] || role} role — only one ${role === 'primary' ? 'primary contact' : `${CONTACT_ROLE_LABELS[role] || role} contact`} should be assigned.`,
      });
    }
  }

  for (const x of snap) {
    if (x.info.is_active && x.info.status !== 'deactivated') continue;
    for (const role of SINGLE_ASSIGNMENT_ROLES) {
      if (!x.info.roles.includes(role)) continue;
      warnings.push({
        code: 'inactive_holder',
        role,
        contact_ids: [x.info.contact_id],
        message: `${x.info.display_name || 'A contact'} holds the ${CONTACT_ROLE_LABELS[role] || role} role but is ${x.info.is_active ? 'deactivated' : 'inactive'} — reassign it so routing stays live.`,
      });
    }
  }

  const primaryLive = live.some((x) => x.info.roles.includes('primary'));
  if (!primaryLive) {
    warnings.push({
      code: 'no_primary',
      contact_ids: [],
      message: 'No active contact is marked primary — invoices, portal messages and work orders will fall back to the first contact.',
    });
  }

  for (const x of snap) {
    const unknownTokens = contactRoleTokens(x.row).filter((t) => !normalizeContactRole(t));
    for (const token of unknownTokens) {
      warnings.push({
        code: 'unknown_role',
        contact_ids: [x.info.contact_id],
        message: `${x.info.display_name || 'A contact'} has an unrecognized role "${token}".`,
      });
    }
  }

  for (const x of live) {
    if (!SINGLE_ASSIGNMENT_ROLES.some((r) => x.info.roles.includes(r))) continue;
    if (x.info.email.includes('@')) continue;
    const role = SINGLE_ASSIGNMENT_ROLES.find((r) => x.info.roles.includes(r));
    warnings.push({
      code: 'holder_no_email',
      role,
      contact_ids: [x.info.contact_id],
      message: `${x.info.display_name || 'A contact'} holds the ${CONTACT_ROLE_LABELS[role!] || role} role but has no email — documents resolved to them cannot be sent.`,
    });
  }

  return warnings;
}

// --- Assignment planning -----------------------------------------------------------

/**
 * customerPatchForRole — the Customer-row mirror fields a staff write path
 * CAN persist (Customer.updateMany is staff-allowed; CustomerContact flag
 * writes are backend-only). Assigning 'billing' stamps billing_contact_*
 * + billing_contact_same:false; 'primary' stamps the flat contact_* fields;
 * jobsite/decision_maker/ap have no customer-level counterpart → null.
 */
export function customerPatchForRole({ contact, role }: any = {}) {
  const c = isObj(contact) ? contact : {};
  const r = normalizeContactRole(role);
  if (!r || r === 'jobsite' || r === 'decision_maker' || r === 'ap') return null;
  const name = clean(c.display_name) ||
    [clean(c.first_name), clean(c.last_name)].filter(Boolean).join(' ') ||
    clean(c.email);
  if (r === 'billing') {
    return {
      billing_contact_same: false,
      billing_contact_name: name,
      billing_contact_email: clean(c.email).toLowerCase(),
      billing_contact_phone: clean(c.phone) || clean(c.mobile_phone),
    };
  }
  return {
    contact_first_name: clean(c.first_name),
    contact_last_name: clean(c.last_name),
    contact_position: clean(c.position),
    contact_email: clean(c.email).toLowerCase(),
    contact_office_phone: clean(c.phone),
    contact_office_ext: clean(c.phone_ext),
    contact_cell_phone: clean(c.mobile_phone),
    contact_status: clean(c.contact_status),
  };
}

// When a role is cleared off a contact whose `role` string NAMES that role,
// repoint the string at a still-held explicit role's storage token (or ''
// when none remain). A `role` string naming a different role is left
// untouched — it may be the only field carrying that other role.
function roleStringAfterClear(contact: any, clearedRole: string): string | undefined {
  if (normalizeContactRole(contact?.role) !== clearedRole) return undefined;
  const remaining = resolveContactRoles(contact).roles.filter((r) => r !== clearedRole);
  const next = remaining[0] ? roleDef(remaining[0])?.storage : undefined;
  return next !== undefined ? next : '';
}

// Array-valued role containers the row already carries (the spec'd
// `contact_roles` field plus the tolerated `roles` spelling). Returns patch
// entries appending the role's storage token (add=true) or scrubbing every
// token that normalizes to it (add=false). Only fields the row actually has
// are patched — the plan never invents an array column.
function roleArrayPatches(contact: any, role: string, add: boolean): Record<string, string[]> {
  const patch: Record<string, string[]> = {};
  for (const field of ['roles', 'contact_roles']) {
    const raw = contact?.[field];
    if (!Array.isArray(raw)) continue;
    const tokens = raw.map((t: any) => clean(t)).filter(Boolean);
    const heldKeys = new Set(tokens.map((t) => normalizeContactRole(t)).filter(Boolean));
    if (add && !heldKeys.has(role)) {
      patch[field] = [...tokens, roleDef(role)?.storage || role];
    }
    if (!add && heldKeys.has(role)) {
      patch[field] = tokens.filter((t) => normalizeContactRole(t) !== role);
    }
  }
  return patch;
}

/**
 * roleAssignmentPlan — pure plan for "Set as <role>" / "Clear <role>" on one
 * contact. Single-assignment roles (primary/billing/jobsite) enforce
 * one-holder-per-customer; decision_maker/ap are per-person and never clear
 * other holders.
 *
 * assign (default true):
 *   • slot roles: every OTHER contact currently holding the role gets a clear
 *     patch — {flag:false} plus a `role` repoint when its role string named
 *     this role; the target gets {flag:true, role:<storage token>} unless it
 *     already holds the role AND its role string already names it.
 *   • authority roles (decision_maker/ap): the target gets
 *     {authority_role:<enum>} — no other contact is touched.
 * assign=false: clears the role on the target only — flag roles drop the
 * boolean; authority roles drop authority_role back to 'unknown' when the
 * hold came from that field. Removing a role never reassigns it elsewhere.
 *
 * @returns {role, contact_id, assign, noop, updates:[{contact_id, patch,
 *          reason}], customer_patch, errors}. updates is executor-ready:
 *          apply each patch to that CustomerContact row (backend only).
 *          customer_patch is the Customer-row mirror (billing/primary) a
 *          staff updateMany CAN persist — null for other roles and clears.
 */
export function roleAssignmentPlan({ contacts, contact_id, role, assign = true }: any = {}) {
  const r = normalizeContactRole(role);
  const base = {
    role: r, contact_id: clean(contact_id), assign: assign !== false,
    noop: true, updates: [] as any[], customer_patch: null as any, errors: [] as string[],
  };
  if (!r) {
    base.errors.push('unknown_role');
    return base;
  }
  const rows = (Array.isArray(contacts) ? contacts : []).filter((c: any) => isObj(c) && clean(c.id));
  const target = rows.find((c: any) => clean(c.id) === clean(contact_id));
  if (!target) {
    base.errors.push('contact_not_found');
    return base;
  }

  const def = roleDef(r)!;
  const flag = def.flag;
  const holds = (c: any) => resolveContactRoles(c).roles.includes(r);
  const updates: any[] = [];

  if (assign !== false) {
    if (def.single && flag) {
      for (const other of rows) {
        if (other === target || !holds(other)) continue;
        const patch: any = { [flag]: false };
        const repoint = roleStringAfterClear(other, r);
        if (repoint !== undefined) patch.role = repoint;
        updates.push({ contact_id: clean(other.id), patch, reason: 'clear_previous' });
      }
      if (!holds(target) || target[flag] !== true || normalizeContactRole(target.role) !== r) {
        updates.push({
          contact_id: clean(target.id),
          patch: { [flag]: true, role: def.storage, ...roleArrayPatches(target, r, true) },
          reason: 'assign',
        });
      }
    } else {
      // Per-person roles persist through authority_role — no exclusivity.
      if (!holds(target) || clean(target.authority_role).toLowerCase().replace(/[\s-]+/g, '_') !== def.authority) {
        updates.push({
          contact_id: clean(target.id),
          patch: { authority_role: def.authority, ...roleArrayPatches(target, r, true) },
          reason: 'assign',
        });
      }
    }
  } else if (holds(target)) {
    const patch: any = { ...roleArrayPatches(target, r, false) };
    if (flag) patch[flag] = false;
    const authorityRaw = clean(target.authority_role).toLowerCase().replace(/[\s-]+/g, '_');
    if (def.authority && authorityRaw === def.authority) patch.authority_role = 'unknown';
    const repoint = roleStringAfterClear(target, r);
    if (repoint !== undefined) patch.role = repoint;
    if (Object.keys(patch).length) {
      updates.push({ contact_id: clean(target.id), patch, reason: 'clear' });
    }
  }

  base.updates = updates;
  base.noop = updates.length === 0;
  base.customer_patch = assign !== false ? customerPatchForRole({ contact: target, role: r }) : null;
  return base;
}

// --- Billing recipient resolution ---------------------------------------------------

/**
 * resolveBillingContact — the contact-level extension of
 * statementBatchModel.resolveBillingEmail. See the header for the precedence
 * contract; returns {email, contact, contact_id, source} where source is
 * 'billing_contact' | 'accounts_payable_contact' | 'primary_contact' |
 * 'customer_billing' | 'customer' | ''.
 */
export function resolveBillingContact({ contacts, customer }: any = {}) {
  const rows = normalizeContacts(contacts);
  const emailable = rows
    .map((row: any) => ({ row, info: resolveContactRoles(row) }))
    .filter((x: any) => x.info.emailable && x.info.email.includes('@'));
  const ordered = holderOrder(emailable.map((x: any) => x.row));
  const infoByRow = new Map(emailable.map((x: any) => [x.row, x.info]));

  const pick = (pred: (info: any) => boolean, source: string) => {
    const hit = ordered.find((row) => {
      const info = infoByRow.get(row);
      return info ? pred(info) : false;
    });
    const info = hit ? infoByRow.get(hit) : null;
    return hit && info
      ? { email: info.email, contact: hit, contact_id: info.contact_id, source }
      : null;
  };

  const billing = pick((info: any) => info.roles.includes('billing'), 'billing_contact');
  if (billing) return billing;
  const ap = pick(
    (info: any) => info.roles.includes('ap') || info.authority_role === 'accounts_payable',
    'accounts_payable_contact',
  );
  if (ap) return ap;
  const primary = pick((info: any) => info.roles.includes('primary'), 'primary_contact');
  if (primary) return primary;

  const cust = isObj(customer) ? customer : {};
  for (const key of CUSTOMER_BILLING_EMAIL_FIELDS) {
    const v = clean(cust[key]).toLowerCase();
    if (v.includes('@')) {
      return {
        email: v,
        contact: null,
        contact_id: '',
        source: key.startsWith('billing') ? 'customer_billing' : 'customer',
      };
    }
  }
  return { email: '', contact: null, contact_id: '', source: '' };
}
