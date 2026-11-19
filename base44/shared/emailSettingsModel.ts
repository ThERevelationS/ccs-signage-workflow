// Email/domain settings — ESTIMATOR_MASTERPLAN WS-K / item K-02.
// Pure TS, ZERO imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike, same contract as
// delivery.ts / alertSubscriptionsModel / paymentReminderModel.
//
// Storage spec (what hosts these settings):
//   - Shop-wide slice: the `emailDelivery` object on a GlobalSettings row —
//     declared in GlobalSettings.jsonc since A-21
//     ({enabled, default_from, authorized_domains[], from_salesperson_toggle}).
//     K-02 EXTENDS that same block with default_from_name, reply_to,
//     per_user_signature_enabled, bounce_handling and authorized_addresses.
//     GlobalSettings is backend-only RLS, so reads/writes go through a
//     session-authed function; this model only normalizes the slice.
//     Carriers accepted by normalizeEmailSettings (first found wins, then
//     layered in precedence order):
//       * the slice itself          { authorized_domains: [...], ... }
//       * a flat settings row       { emailDelivery: { ... } }
//       * a KV settings row         { setting_key: 'emailDelivery',
//                                    setting_value: { ... } }
//       * a KV blob carrier         { setting_value: { emailDelivery: {...} } }
//       * an alias override block   { emailSettings: { ... } } — same keys,
//                                   layered last so it wins on conflicts
//       (alias keys 'emailSettings' / 'email_settings' / 'email_delivery').
//   - Per-user prefs: AuthorizedEmail.notification_prefs (object). The
//     existing convention is { automation_emails: false } opt-outs honored by
//     workflowTriggerEngine (send_list filter); K-02 adds notify_* boolean
//     keys and a nested `email_signature` object on the same prefs row so no
//     entity-schema change is needed. userEmailPrefsPatch produces the
//     sanitized row — assign it to AuthorizedEmail.notification_prefs.
//
// `enabled` follows delivery.ts semantics: only the literal boolean true
// enables outbound; the same checked paths resolve here (flat block, KV blob,
// `email_delivery_enabled` flat alias, `delivery.emailEnabled` nested alias).
//
// Send-as authorization (isAuthorizedSender): a sender address is authorized
// when its full address matches authorized_addresses, or its domain equals an
// authorized_domains entry (subdomains inherit — 'pos.ccs.com' is covered by
// 'ccs.com'). When BOTH allowlists are empty the shop has configured no
// send-as policy — every address is treated as unrestricted (the same
// fail-open posture the rest of the settings surface uses until configured;
// the `enabled` master switch is the fail-closed gate).
//
// From-resolution precedence (resolveFromAddress):
//   1. user.email_signature.from — only when per_user_signature_enabled
//      AND the address is an authorized sender (signature can live at
//      user.email_signature or user.notification_prefs.email_signature;
//      a bare-string signature is text only, never a from-address).
//   2. location.email (aliases location.from_email / location.from_address)
//      — the location mailbox, same authorization check.
//   3. settings.default_from_address — used literally when it contains '@';
//      otherwise the bare local part is completed with the first authorized
//      domain ('noreply' + 'ccs.com' → 'noreply@ccs.com'). With no authorized
//      domain the bare local part is returned as-is and
//      validateEmailSettings warns that it cannot be completed.
//   reply_to resolves lane-local first (signature.reply_to, location.reply_to)
//   then settings.reply_to; from_name falls back to default_from_name.
//
// Verification is presence-flag only (per scope): there is no DNS/SES check —
// `domainStatus` reports list membership as the `verified_hint`.

const clean = (v: any) => String(v ?? '').trim();
const isObj = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);

// Pragmatic validators — same spirit as sendStaffEmail's EMAIL_SHAPE; domain
// labels are alnum start/end with interior hyphens, TLD alpha >= 2.
const EMAIL_SHAPE = /^[^\s@,;<>]+@[^\s@,;<>]+$/;
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LOCAL_PART_RE = /^[a-z0-9][a-z0-9._%+-]{0,63}$/;
const NOTIFY_PREF_RE = /^notify_[a-z0-9_]{1,48}$/;

const MAX_SIGNATURE_BODY = 4000;
const MAX_FROM_NAME = 120;
const MAX_PREF_KEYS = 40;

// Canonical GlobalSettings block key (schema-declared A-21) plus the alias
// block/setting_key names normalizeEmailSettings also accepts.
export const EMAIL_SETTINGS_KEY = 'emailDelivery';
export const EMAIL_SETTINGS_ALIAS_KEYS = ['emailSettings', 'email_settings', 'email_delivery'];
const EMAIL_KEY_SET = new Set([EMAIL_SETTINGS_KEY, ...EMAIL_SETTINGS_ALIAS_KEYS]);

export const BOUNCE_HANDLING_MODES = ['flag_only', 'suppress', 'ignore'];

// Canonical per-user boolean pref keys — `automation_emails` is the
// pre-existing convention (workflowTriggerEngine + manageAuthorizedUsers);
// the rest are the notify_* family this item introduces. The PATCH layer also
// accepts any key matching /^notify_[a-z0-9_]{1,48}$/ (the allowlist pattern),
// so this list documents the canonical keys rather than hard-gating them.
export const USER_NOTIFICATION_PREF_KEYS = [
  'automation_emails',
  'notify_assignments',
  'notify_mentions',
  'notify_stage_changes',
  'notify_follow_ups',
  'notify_digests',
  'notify_bounces',
  'notify_proof_ready',
  'notify_payment_reminders',
];

export const EMAIL_SETTINGS_DEFAULTS = {
  authorized_domains: [] as string[],
  default_from_address: 'noreply',
  default_from_name: '',
  reply_to: '',
  per_user_signature_enabled: true,
  bounce_handling: 'flag_only',
};

// ---------------------------------------------------------------------------
// Entry sanitizers
// ---------------------------------------------------------------------------

// Domain entries arrive as 'ccs.com', 'HTTPS://CCS.COM/path', 'mail.ccs.com.',
// object rows {domain:'x.com', ...}, or comma-joined strings. A full email
// address is NOT a domain entry — it returns '' (it belongs in
// authorized_addresses). Returns the lowercase normalized domain or ''.
export function normalizeDomain(raw: any): string {
  let d = clean(raw).toLowerCase();
  if (!d) return '';
  d = d.replace(/^https?:\/\//, '').replace(/^mailto:/, '');
  d = d.split(/[/?#]/)[0];
  d = d.replace(/:\d+$/, '');
  d = d.replace(/^\.+|\.+$/g, '');
  if (!d || d.includes('@')) return '';
  return DOMAIN_RE.test(d) ? d : '';
}

// Bare address cleanup: 'Display Name <a@b.c>' → 'a@b.c', strips mailto:,
// whitespace and list separators, lowercases (codebase convention — see
// delivery.ts internalRow.recipient_email).
function normalizeAddress(raw: any): string {
  let a = clean(raw).toLowerCase();
  if (!a) return '';
  const angle = a.match(/<([^<>]+)>/);
  if (angle) a = clean(angle[1]);
  a = a.replace(/^mailto:/, '');
  a = a.replace(/[\s,;]+/g, '');
  return a;
}

const addressDomain = (addr: string) => {
  const at = addr.lastIndexOf('@');
  return at < 0 ? '' : addr.slice(at + 1);
};

const isValidAddress = (addr: string) =>
  EMAIL_SHAPE.test(addr) && normalizeDomain(addressDomain(addr)) !== '';

// A raw list may be an array, a comma/semicolon-joined string, or a single
// value. Items may be strings or {domain|address|email: 'x'} objects. Returns
// {valid, invalid, duplicates} — order-preserving, deduped on the cleaned key.
function collectList(raw: any, cleanEntry: (v: any) => string) {
  let items: any[] = [];
  if (Array.isArray(raw)) items = raw;
  else if (typeof raw === 'string') items = raw.split(/[;,]/);
  else if (raw !== undefined && raw !== null) items = [raw];

  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  for (const item of items) {
    const candidate = isObj(item) ? (item.domain ?? item.address ?? item.email ?? item.value) : item;
    const value = cleanEntry(candidate);
    if (!value) {
      const shown = clean(isObj(item) ? JSON.stringify(item).slice(0, 80) : item);
      if (shown) invalid.push(shown);
      continue;
    }
    if (seen.has(value)) {
      duplicates.push(value);
      continue;
    }
    seen.add(value);
    valid.push(value);
  }
  return { valid, invalid, duplicates };
}

const collectDomains = (raw: any) => collectList(raw, normalizeDomain);
const collectAddresses = (raw: any) =>
  collectList(raw, (v) => {
    const a = normalizeAddress(v);
    return isValidAddress(a) ? a : '';
  });

// ---------------------------------------------------------------------------
// Slice resolution — find the settings object inside whatever carrier arrived
// ---------------------------------------------------------------------------

// Known top-level keys that mark an object as a settings slice (or carrier of
// legacy aliases). Unknown keys are ignored when merging.
const SLICE_VALUE_KEYS = [
  'enabled', 'email_delivery_enabled', 'delivery',
  'authorized_domains', 'authorized_addresses',
  'default_from_address', 'default_from', 'default_from_name', 'from_name',
  'reply_to', 'per_user_signature_enabled', 'from_salesperson_toggle',
  'bounce_handling',
];

const isSliceLike = (v: any) => isObj(v) && SLICE_VALUE_KEYS.some((k) => v[k] !== undefined);

const pickSliceKeys = (v: any, out: any) => {
  if (!isObj(v)) return;
  for (const key of SLICE_VALUE_KEYS) {
    if (v[key] !== undefined) out[key] = v[key];
  }
};

// Layers in precedence order — later candidates overwrite earlier ones:
//   KV-blob delivery block → flat delivery block → KV-row value → bare keys
//   on the passed object → KV-blob emailSettings alias → flat emailSettings
//   alias (namesake override block wins conflicts).
function resolveEmailSettingsSource(raw: any): any {
  const source: any = {};
  if (!isObj(raw)) return source;
  const sv = isObj(raw.setting_value) ? raw.setting_value : {};

  pickSliceKeys(sv[EMAIL_SETTINGS_KEY], source);
  pickSliceKeys(raw[EMAIL_SETTINGS_KEY], source);
  if (EMAIL_KEY_SET.has(clean(raw.setting_key))) pickSliceKeys(sv, source);
  pickSliceKeys(raw, source);
  for (const alias of EMAIL_SETTINGS_ALIAS_KEYS) {
    pickSliceKeys(sv[alias], source);
    pickSliceKeys(raw[alias], source);
  }
  return source;
}

// ---------------------------------------------------------------------------
// normalizeEmailSettings
// ---------------------------------------------------------------------------

// Merge a stored GlobalSettings slice (any carrier) over EMAIL_SETTINGS_DEFAULTS.
// Output is the canonical K-02 shape — always complete, always clean:
//   { enabled, authorized_domains, authorized_addresses, default_from_address,
//     default_from_name, reply_to, per_user_signature_enabled, bounce_handling,
//     invalid_domains, invalid_addresses, duplicate_domains,
//     duplicate_addresses }
// The invalid_/duplicate_ lists are diagnostics for the settings UI —
// validation/reporting surfaces them; senders ignore them.
export function normalizeEmailSettings(raw: any) {
  const src = resolveEmailSettingsSource(raw);

  const domains = collectDomains(src.authorized_domains);
  const addresses = collectAddresses(src.authorized_addresses);

  // `enabled` — literal-true only, same fail-closed posture as delivery.ts.
  // First defined path decides: block key → flat alias → nested alias.
  let enabled = false;
  for (const v of [src.enabled, src.email_delivery_enabled, isObj(src.delivery) ? src.delivery.emailEnabled : undefined]) {
    if (v === undefined || v === null) continue;
    enabled = v === true;
    break;
  }

  // Legacy A-21 field names map onto the canonical K-02 keys.
  const defaultFrom =
    normalizeAddress(src.default_from_address) ||
    normalizeAddress(src.default_from) ||
    EMAIL_SETTINGS_DEFAULTS.default_from_address;

  const fromName = clean(src.default_from_name ?? src.from_name).slice(0, MAX_FROM_NAME);

  const replyTo = normalizeAddress(src.reply_to);

  const signatureToggle =
    src.per_user_signature_enabled !== undefined
      ? src.per_user_signature_enabled
      : src.from_salesperson_toggle;
  const perUserSignatureEnabled = typeof signatureToggle === 'boolean' ? signatureToggle : EMAIL_SETTINGS_DEFAULTS.per_user_signature_enabled;

  const bounceHandling = BOUNCE_HANDLING_MODES.includes(clean(src.bounce_handling))
    ? clean(src.bounce_handling)
    : EMAIL_SETTINGS_DEFAULTS.bounce_handling;

  return {
    enabled,
    authorized_domains: domains.valid,
    authorized_addresses: addresses.valid,
    default_from_address: defaultFrom,
    default_from_name: fromName,
    reply_to: replyTo,
    per_user_signature_enabled: perUserSignatureEnabled,
    bounce_handling: bounceHandling,
    invalid_domains: domains.invalid,
    invalid_addresses: addresses.invalid,
    duplicate_domains: domains.duplicates,
    duplicate_addresses: addresses.duplicates,
  };
}

// ---------------------------------------------------------------------------
// isAuthorizedSender
// ---------------------------------------------------------------------------

const domainMatchesList = (dom: string, list: string[]) =>
  list.some((d) => dom === d || dom.endsWith(`.${d}`));

// Is `email` an address we may send AS? Full-address allowlist beats domain
// membership; subdomains of an authorized domain inherit. Empty allowlists
// mean the shop configured no send-as policy → unrestricted (true).
export function isAuthorizedSender(email: any, settings: any): boolean {
  const s = normalizeEmailSettings(settings);
  const addr = normalizeAddress(email);
  if (!addr || !addr.includes('@')) return false;
  if (s.authorized_addresses.includes(addr)) return true;
  if (!s.authorized_domains.length && !s.authorized_addresses.length) return true;
  return domainMatchesList(addressDomain(addr), s.authorized_domains);
}

// ---------------------------------------------------------------------------
// resolveFromAddress
// ---------------------------------------------------------------------------

const signatureOf = (user: any) => {
  const sig = user?.email_signature ?? user?.notification_prefs?.email_signature;
  return isObj(sig) ? sig : {}; // a bare-string signature is text, not a send-as
};

// From-address resolution: user signature → location mailbox → shop default.
// Every candidate must clear isAuthorizedSender before it is used — an
// unauthorized signature/location from falls through to the next lane instead
// of being stamped on outbound mail.
export function resolveFromAddress({ location, user, settings }: any = {}) {
  const s = normalizeEmailSettings(settings);

  if (s.per_user_signature_enabled) {
    const sig = signatureOf(user);
    const from = normalizeAddress(sig.from);
    if (from && isAuthorizedSender(from, s)) {
      return {
        from_address: from,
        from_name:
          clean(sig.from_name ?? sig.name).slice(0, MAX_FROM_NAME) ||
          clean(user?.full_name).slice(0, MAX_FROM_NAME) ||
          s.default_from_name,
        reply_to: normalizeAddress(sig.reply_to) || s.reply_to,
      };
    }
  }

  const locationEmail = normalizeAddress(
    location?.email ?? location?.from_email ?? location?.from_address,
  );
  if (locationEmail && isAuthorizedSender(locationEmail, s)) {
    return {
      from_address: locationEmail,
      from_name:
        clean(location?.from_name ?? location?.name).slice(0, MAX_FROM_NAME) ||
        s.default_from_name,
      reply_to: normalizeAddress(location?.reply_to) || s.reply_to,
    };
  }

  const def = s.default_from_address;
  const fallback = def.includes('@')
    ? def
    : s.authorized_domains.length
      ? `${def}@${s.authorized_domains[0]}`
      : def;
  return {
    from_address: fallback,
    from_name: s.default_from_name,
    reply_to: s.reply_to,
  };
}

// ---------------------------------------------------------------------------
// userEmailPrefsPatch
// ---------------------------------------------------------------------------

// Sanitize one signature object (or bare-string body) for storage inside
// notification_prefs.email_signature. Unknown keys are dropped; invalid
// addresses are dropped; the body is length-capped. '' → no signature.
function sanitizeEmailSignature(raw: any) {
  const out: any = {};
  if (typeof raw === 'string') {
    const body = clean(raw).slice(0, MAX_SIGNATURE_BODY);
    if (body) out.body = body;
    return out;
  }
  if (!isObj(raw)) return out;
  const from = normalizeAddress(raw.from);
  if (from && isValidAddress(from)) out.from = from;
  const fromName = clean(raw.from_name ?? raw.name).slice(0, MAX_FROM_NAME);
  if (fromName) out.from_name = fromName;
  const replyTo = normalizeAddress(raw.reply_to);
  if (replyTo && isValidAddress(replyTo)) out.reply_to = replyTo;
  const body = clean(raw.body ?? raw.text ?? raw.signature).slice(0, MAX_SIGNATURE_BODY);
  if (body) out.body = body;
  return out;
}

const isAllowedPrefKey = (key: string) =>
  USER_NOTIFICATION_PREF_KEYS.includes(key) || NOTIFY_PREF_RE.test(key);

// Build the sanitized per-user prefs row for AuthorizedEmail.notification_prefs.
//   user     — the AuthorizedEmail row (existing notification_prefs preserved
//              for allowed keys; unrecognized stored keys are dropped).
//   settings — optional; reserved for policy gates (signature is stored even
//              when per_user_signature_enabled is false — resolveFromAddress
//              is the enforcement point, so data survives a toggle round-trip).
//   patch    — requested changes; bare keys or a {notification_prefs:{...}}
//              wrapper are both accepted. email_signature is an object (or
//              bare-string body); every notify_* / automation_emails key must
//              carry a literal boolean or it is ignored. Non-allowlisted keys
//              are dropped.
// Returns the prefs-row OBJECT — assign it to AuthorizedEmail.notification_prefs:
//   { automation_emails: true, notify_digests: false, email_signature: {...} }
export function userEmailPrefsPatch({ user, settings, patch }: any = {}) {
  void settings;
  const existing = isObj(user?.notification_prefs) ? user.notification_prefs : {};
  const incoming = isObj(patch?.notification_prefs) ? patch.notification_prefs : isObj(patch) ? patch : {};

  const out: any = {};
  // Preserve stored allowed keys (normalized to strict booleans).
  for (const key of Object.keys(existing)) {
    if (!isAllowedPrefKey(key)) continue;
    if (typeof existing[key] === 'boolean') out[key] = existing[key];
  }
  if (isObj(existing.email_signature)) {
    const sig = sanitizeEmailSignature(existing.email_signature);
    if (Object.keys(sig).length) out.email_signature = sig;
  }

  // Apply the patch — strict booleans only for pref keys.
  let count = 0;
  for (const key of Object.keys(incoming)) {
    if (key === 'email_signature') {
      const sig = sanitizeEmailSignature(incoming.email_signature);
      if (Object.keys(sig).length) out.email_signature = sig;
      else delete out.email_signature;
      continue;
    }
    if (!isAllowedPrefKey(key)) continue;
    if (count >= MAX_PREF_KEYS) break;
    if (typeof incoming[key] === 'boolean') {
      out[key] = incoming[key];
      count += 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// domainStatus
// ---------------------------------------------------------------------------

// {domain, authorized, verified_hint} for one domain against the settings.
// verified is presence-flag only (per scope) — no DNS/provider check exists;
// 'listed_unverified' means "in authorized_domains, nothing else confirmed".
export function domainStatus(domain: any, settings: any) {
  const d = normalizeDomain(domain);
  const s = normalizeEmailSettings(settings);
  if (!d) return { domain: '', authorized: false, verified_hint: 'invalid_domain' };
  const authorized = domainMatchesList(d, s.authorized_domains);
  return {
    domain: d,
    authorized,
    verified_hint: authorized
      ? 'listed_unverified'
      : s.authorized_domains.length
        ? 'not_listed'
        : 'no_domains_configured',
  };
}

// ---------------------------------------------------------------------------
// validateEmailSettings
// ---------------------------------------------------------------------------

// Report settings health: errors block a confident save/send, warnings are
// advisory. Accepts any carrier normalizeEmailSettings accepts.
export function validateEmailSettings(settings: any) {
  const s = normalizeEmailSettings(settings);
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const bad of s.invalid_domains) {
    errors.push(`authorized_domains entry "${bad}" is not a valid domain.`);
  }
  for (const bad of s.invalid_addresses) {
    errors.push(`authorized_addresses entry "${bad}" is not a valid email address.`);
  }
  for (const dup of s.duplicate_domains) {
    warnings.push(`authorized_domains lists "${dup}" more than once.`);
  }
  for (const dup of s.duplicate_addresses) {
    warnings.push(`authorized_addresses lists "${dup}" more than once.`);
  }

  // An explicitly-provided but unusable default (whitespace, wrong type) is an
  // error even though normalization backfills 'noreply' — the stored value is
  // what an operator typed, and it will never send.
  const src = resolveEmailSettingsSource(settings);
  const rawDef = src.default_from_address !== undefined ? src.default_from_address : src.default_from;
  if (rawDef !== undefined && !normalizeAddress(rawDef)) {
    errors.push('default_from_address is empty or unusable — a sender address or local part (e.g. "noreply") is required.');
  }

  const def = s.default_from_address;
  if (!def) {
    errors.push('default_from_address is required.');
  } else if (def.includes('@')) {
    if (!isValidAddress(def)) errors.push(`default_from_address "${def}" is not a valid email address.`);
    else if (s.authorized_domains.length && !domainMatchesList(addressDomain(def), s.authorized_domains)) {
      warnings.push(`default_from_address "${def}" is not on an authorized domain.`);
    } else if (!s.authorized_domains.length) {
      warnings.push('authorized_domains is empty — the default sender domain is not anchored.');
    }
  } else if (!LOCAL_PART_RE.test(def)) {
    errors.push(`default_from_address "${def}" is neither an email address nor a valid local part (e.g. "noreply").`);
  } else if (!s.authorized_domains.length) {
    warnings.push(`default_from_address "${def}" has no authorized domain to complete it (resolves as "${def}@<first-domain>").`);
  }

  if (s.reply_to && !isValidAddress(s.reply_to)) {
    errors.push(`reply_to "${s.reply_to}" is not a valid email address.`);
  } else if (
    s.reply_to &&
    s.authorized_domains.length &&
    !domainMatchesList(addressDomain(s.reply_to), s.authorized_domains)
  ) {
    warnings.push(`reply_to "${s.reply_to}" is not on an authorized domain.`);
  }

  if (s.enabled !== true) {
    warnings.push('Outbound email is disabled (emailDelivery.enabled is not true) — sends stay on the internal/smartsheet lane.');
  }
  if (s.per_user_signature_enabled && !s.authorized_domains.length && !s.authorized_addresses.length) {
    warnings.push('per_user_signature_enabled with no authorized_domains/authorized_addresses — per-user send-as is unrestricted.');
  }

  return { errors, warnings };
}
