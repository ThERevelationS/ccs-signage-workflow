// quoteDefaultsModel — pure model for the company-wide Quote Defaults
// singleton (QuoteDefaults row config_name='default') and everything it feeds:
// the customer-quote print/preview article, the emailed PDF + templates, the
// expiry math, the tax-group source chain, and the portal/queue consumers.
//
// Provenance (every behavior below mirrors a deployed consumer — verified K-10):
//   loader          src/components/estimator/quoteDefaults.js
//                   (QUOTE_DEFAULT_KEYS whitelist, DEFAULT_QUOTE_SETTINGS
//                   factory values, canonicalQuoteDefaults earliest-created row,
//                   quoteDefaultsPayload stamps the whitelist onto estimates)
//   settings UI     src/pages/QuoteSettings.jsx (admin-only save;
//                   createQuoteDefaultsSingletonWithRecovery + CAS replace)
//   apply to est    src/pages/NewAllInOneEstimate.jsx:206-212 (create stamp),
//                   CustomerQuotePanel.jsx:228-246 ("Apply Company Defaults")
//   print article   src/components/estimator/CustomerQuotePanel.jsx:501-587
//                   (#customer-quote-print), quotePdf.js (issue/expiry stamp),
//                   exportEstimates.js:317-417 buildStandaloneQuoteHtml
//   expiry          quoteLifecycle.js quoteExpirationDate /
//                   estimateQuoteExpiration / isQuoteExpired (local-time
//                   YYYY-MM-DD + max(0,floor(days)); expired strictly AFTER the
//                   expiry day) — mirrored server-side by
//                   customerPortalAction.quoteValidUntil and the
//                   EstimateQuoteDelivery snapshot; EstimatorQueues re-stamps
//                   the quote_expired filter flag with expiry < today.
//   tax chain (#486) Step1EstimateDetails.applyCustomer:95-108 —
//                   customer.default_tax_group → defaults.default_tax_group →
//                   TaxGroup.is_default===true; picker patches {tax_group,
//                   tax_percent}; aioPricing tax = taxableBase × percent/100.
//   email           quoteDeliveryService.interpolateEmailTemplate +
//                   defaultQuoteEmailSubject/Message + quoteEmailBodyHtml
//                   signature append.
//
// No I/O anywhere — wiring layers load rows and pass them in.

// ---------------------------------------------------------------------------
// Small coercions (shared-model convention)
// ---------------------------------------------------------------------------

const clean = (v: any): string => String(v ?? '').trim();
const isObj = (v: any): boolean => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const firstText = (...vals: any[]): string => {
  for (const v of vals) { const s = clean(v); if (s) return s; }
  return '';
};
const whole = (v: any, fallback = 0): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
};
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const isDay = (v: any): boolean => DAY_RE.test(clean(v));

// ---------------------------------------------------------------------------
// Canonical key whitelist + factory defaults
// (parity with src/components/estimator/quoteDefaults.js — keep in sync)
// ---------------------------------------------------------------------------

/** Keys quoteDefaultsPayload copies from the singleton onto an estimate. */
export const QUOTE_DEFAULT_KEYS: string[] = [
  'company_name', 'company_phone', 'company_email', 'company_address', 'company_website', 'company_license', 'company_logo_url',
  'quote_title', 'quote_accent_color', 'quote_valid_days', 'payment_terms', 'quote_intro_text', 'quote_footer_text', 'quote_terms_conditions', 'warranty_text', 'lead_time_text', 'email_signature', 'email_subject_template', 'email_message_template', 'estimate_number_format', 'order_number_format', 'doc_number_padding', 'module_number_prefixes', 'display_timezone', 'custom_statuses', 'status_transitions', 'default_tax_group', 'number_reissue_policy',
  'scope_auto_apply', 'hide_section_prices', 'show_company_block', 'show_logo', 'show_contact_block', 'show_estimate_number', 'show_po_number', 'show_site_address', 'show_dates', 'show_category_column', 'show_section_descriptions', 'show_quantity_column', 'show_scope_lists', 'show_subtotal_line', 'show_discount_line', 'show_fees_line', 'show_tax_line', 'show_deposit_lines', 'show_notes_on_quote', 'show_terms_block', 'show_warranty_block', 'show_lead_time_block', 'show_signature_block', 'show_validity_footer', 'round_prices_to_dollar',
];

/** Factory values matching DEFAULT_QUOTE_SETTINGS in quoteDefaults.js. */
export const BUILTIN_QUOTE_DEFAULTS: Record<string, any> = {
  company_name: '',
  company_phone: '',
  company_email: '',
  company_address: '',
  company_website: '',
  company_license: '',
  company_logo_url: '',
  quote_title: 'Project Estimate',
  quote_accent_color: '#4f46e5',
  quote_valid_days: 30,
  email_signature: '',
  estimate_number_format: 'EST-{seq}',
  order_number_format: 'INV-{seq}',
  doc_number_padding: 5,
  module_number_prefixes: '',
  display_timezone: '',
  custom_statuses: '',
  status_transitions: '',
  custom_status_meta: '',
  default_tax_group: '',
  number_reissue_policy: 'never_reuse',
  email_subject_template: '',
  email_message_template: '',
  payment_terms: '',
  quote_intro_text: '',
  quote_footer_text: '',
  quote_terms_conditions: '',
  warranty_text: '',
  lead_time_text: '',
  // Proposed (K-10): not yet in QUOTE_DEFAULT_KEYS or the entity schema —
  // print-signature label override + dedicated footer disclaimer line.
  signature_text: '',
  disclaimer_text: '',
  scope_auto_apply: true,
  hide_section_prices: false,
  show_company_block: true,
  show_logo: false,
  show_contact_block: true,
  show_estimate_number: true,
  show_po_number: true,
  show_site_address: true,
  show_dates: true,
  show_category_column: true,
  show_section_descriptions: true,
  show_quantity_column: false,
  show_scope_lists: true,
  show_subtotal_line: true,
  show_discount_line: true,
  show_fees_line: true,
  show_tax_line: true,
  show_deposit_lines: true,
  show_notes_on_quote: false,
  show_terms_block: true,
  show_warranty_block: true,
  show_lead_time_block: true,
  show_signature_block: true,
  show_validity_footer: true,
  round_prices_to_dollar: false,
};

// The 24 print/display toggles in CustomerQuotePanel TOGGLES order — (key,
// factory-default) pairs. Same list as QuoteSettings DISPLAY_OPTIONS.
export const QUOTE_PRINT_TOGGLES: ReadonlyArray<readonly [string, boolean]> = [
  ['hide_section_prices', false],
  ['show_company_block', true],
  ['show_logo', false],
  ['show_contact_block', true],
  ['show_estimate_number', true],
  ['show_po_number', true],
  ['show_site_address', true],
  ['show_dates', true],
  ['show_category_column', true],
  ['show_section_descriptions', true],
  ['show_quantity_column', false],
  ['show_scope_lists', true],
  ['show_subtotal_line', true],
  ['show_discount_line', true],
  ['show_fees_line', true],
  ['show_tax_line', true],
  ['show_deposit_lines', true],
  ['show_notes_on_quote', false],
  ['show_terms_block', true],
  ['show_warranty_block', true],
  ['show_lead_time_block', true],
  ['show_signature_block', true],
  ['show_validity_footer', true],
  ['round_prices_to_dollar', false],
];

// ---------------------------------------------------------------------------
// Singleton selection + normalization
// ---------------------------------------------------------------------------

/**
 * canonicalQuoteDefaultsRow — earliest created row wins; updated_date is the
 * fallback clock and id the tiebreak (parity with canonicalQuoteDefaults()).
 * Note: customerPortalAction takes rows[0] unsorted — a divergence when
 * duplicate singleton rows exist (recorded as a K-10 gap).
 */
export function canonicalQuoteDefaultsRow(rows: any[] = []): any {
  return (Array.isArray(rows) ? rows : []).slice().sort((a: any, b: any) => {
    const aTime = Date.parse(a?.created_date || a?.updated_date || '') || 0;
    const bTime = Date.parse(b?.created_date || b?.updated_date || '') || 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  })[0] || null;
}

export interface ResolvedQuoteDefaults {
  config_name: string;
  company: {
    name: string; phone: string; email: string; website: string;
    address: string; license: string; logo_url: string;
  };
  quote_title: string;
  quote_accent_color: string;
  quote_valid_days: number;
  payment_terms: string;
  quote_intro_text: string;
  quote_footer_text: string;
  quote_terms_conditions: string;
  warranty_text: string;
  lead_time_text: string;
  /** Proposed K-10 field — replaces the hardcoded signature line label when set. */
  signature_text: string;
  /** Proposed K-10 field — dedicated footer disclaimer line after footer text. */
  disclaimer_text: string;
  email_signature: string;
  email_subject_template: string;
  email_message_template: string;
  estimate_number_format: string;
  order_number_format: string;
  doc_number_padding: number;
  module_number_prefixes: string;
  display_timezone: string;
  custom_statuses: string;
  status_transitions: string;
  custom_status_meta: string;
  /** Shop-level TaxGroup group_name used by the #486 chain. */
  default_tax_group: string;
  /**
   * tax-rate source policy. 'auto' = the deployed chain (manual estimate pick →
   * customer default → this shop default → TaxGroup.is_default). Pinned values
   * restrict the chain to one source; 'none' means new estimates start untaxed.
   */
  tax_rate_source: TaxRateSource;
  number_reissue_policy: string;
  scope_auto_apply: boolean;
  /** Resolved print/display toggles (print_options on the normalized shape). */
  print_options: Record<string, boolean>;
  /** Keys present on the raw row that QUOTE_DEFAULT_KEYS does not carry. */
  unmapped_keys: string[];
}

export type TaxRateSource =
  | 'auto'             // deployed implicit chain (default)
  | 'customer_default' // Customer.default_tax_group only
  | 'shop_default'     // QuoteDefaults.default_tax_group only
  | 'group_default'    // TaxGroup.is_default only
  | 'manual'           // per-estimate picker value wins; defaults never seed
  | 'none';            // estimates start untaxed

export const TAX_RATE_SOURCES: TaxRateSource[] = ['auto', 'customer_default', 'shop_default', 'group_default', 'manual', 'none'];

const normalizeTaxSource = (v: any): TaxRateSource => {
  const s = clean(v).toLowerCase().replace(/[\s-]+/g, '_');
  return (TAX_RATE_SOURCES as string[]).includes(s) ? (s as TaxRateSource) : 'auto';
};

/**
 * resolveQuoteDefaults — normalize a raw QuoteDefaults row (or a rows array —
 * canonical pick) into the full settings shape. Missing/blank fields fall back
 * to the built-in defaults; numbers clamp; booleans resolve per-key.
 */
export function resolveQuoteDefaults(raw: any): ResolvedQuoteDefaults {
  const row = Array.isArray(raw) ? (canonicalQuoteDefaultsRow(raw) || {}) : (isObj(raw) ? raw : {});
  const text = (key: string): string => {
    const v = row[key];
    return v === undefined || v === null ? clean(BUILTIN_QUOTE_DEFAULTS[key]) : String(v);
  };
  const bool = (key: string): boolean =>
    row[key] === undefined || row[key] === null ? BUILTIN_QUOTE_DEFAULTS[key] === true : row[key] !== false;
  const validDaysRaw = row.quote_valid_days;
  const quote_valid_days = validDaysRaw === undefined || validDaysRaw === null || !Number.isFinite(Number(validDaysRaw))
    ? BUILTIN_QUOTE_DEFAULTS.quote_valid_days
    : Math.max(0, Math.floor(Number(validDaysRaw)));
  const padRaw = row.doc_number_padding;
  const doc_number_padding = padRaw === undefined || padRaw === null || !Number.isFinite(Number(padRaw))
    ? BUILTIN_QUOTE_DEFAULTS.doc_number_padding
    : Math.max(3, Math.min(10, Math.floor(Number(padRaw))));

  const print_options: Record<string, boolean> = {};
  for (const [key, fallback] of QUOTE_PRINT_TOGGLES) {
    print_options[key] = row[key] === undefined || row[key] === null ? fallback : row[key] !== false;
  }

  const unmapped_keys = Object.keys(row).filter((k) =>
    !QUOTE_DEFAULT_KEYS.includes(k)
    && !['id', 'config_name', 'created_date', 'updated_date', 'created_by', 'custom_status_meta', 'signature_text', 'disclaimer_text', 'tax_rate_source'].includes(k));

  return {
    config_name: clean(row.config_name) || 'default',
    company: {
      name: text('company_name'),
      phone: text('company_phone'),
      email: text('company_email'),
      website: text('company_website'),
      address: text('company_address'),
      license: text('company_license'),
      logo_url: text('company_logo_url'),
    },
    quote_title: text('quote_title') || BUILTIN_QUOTE_DEFAULTS.quote_title,
    quote_accent_color: text('quote_accent_color') || BUILTIN_QUOTE_DEFAULTS.quote_accent_color,
    quote_valid_days,
    payment_terms: text('payment_terms'),
    quote_intro_text: text('quote_intro_text'),
    quote_footer_text: text('quote_footer_text'),
    quote_terms_conditions: text('quote_terms_conditions'),
    warranty_text: text('warranty_text'),
    lead_time_text: text('lead_time_text'),
    signature_text: text('signature_text'),
    disclaimer_text: text('disclaimer_text'),
    email_signature: text('email_signature'),
    email_subject_template: text('email_subject_template'),
    email_message_template: text('email_message_template'),
    estimate_number_format: text('estimate_number_format') || BUILTIN_QUOTE_DEFAULTS.estimate_number_format,
    order_number_format: text('order_number_format') || BUILTIN_QUOTE_DEFAULTS.order_number_format,
    doc_number_padding,
    module_number_prefixes: text('module_number_prefixes'),
    display_timezone: text('display_timezone'),
    custom_statuses: text('custom_statuses'),
    status_transitions: text('status_transitions'),
    custom_status_meta: text('custom_status_meta'),
    default_tax_group: text('default_tax_group'),
    tax_rate_source: normalizeTaxSource(row.tax_rate_source),
    number_reissue_policy: text('number_reissue_policy') || 'never_reuse',
    scope_auto_apply: row.scope_auto_apply === undefined || row.scope_auto_apply === null ? true : row.scope_auto_apply !== false,
    print_options,
    unmapped_keys,
  };
}

/**
 * estimateDefaultsPatch — the quoteDefaultsPayload parity helper: copy every
 * whitelisted key that is non-null on the defaults row. This is what
 * NewAllInOneEstimate stamps on create and "Apply Company Defaults" stamps
 * on an existing estimate. (Proposed fields signature_text/disclaimer_text/
 * tax_rate_source are NOT in the deployed whitelist yet — declared here under
 * PROPOSED_QUOTE_DEFAULT_KEYS so the payload shape is forward-compatible
 * once the schema + whitelist add them.)
 */
export const PROPOSED_QUOTE_DEFAULT_KEYS: string[] = ['signature_text', 'disclaimer_text', 'tax_rate_source', 'custom_status_meta'];

export function estimateDefaultsPatch(raw: any, opts: { include_proposed?: boolean } = {}): Record<string, any> {
  const keys = opts.include_proposed ? QUOTE_DEFAULT_KEYS.concat(PROPOSED_QUOTE_DEFAULT_KEYS) : QUOTE_DEFAULT_KEYS;
  const row = isObj(raw) ? raw : {};
  return keys.reduce((out: Record<string, any>, key) => {
    if (row[key] !== undefined && row[key] !== null) out[key] = row[key];
    return out;
  }, {});
}

// ---------------------------------------------------------------------------
// Quote expiry (issue day + valid days) — parity with quoteLifecycle.js
// ---------------------------------------------------------------------------

export interface QuoteExpiry {
  issue_day: string;          // resolved YYYY-MM-DD anchor ('' when unusable)
  valid_days: number;         // normalized >=0 integer actually applied
  expiration_day: string;     // '' when no expiry can be computed
  source: 'override' | 'computed' | 'none';
  /**
   * A quote is valid THROUGH its expiration day and expires the next day —
   * isQuoteExpired(issue, days, today) is today > expiration. There is no
   * 'never expires' sentinel: valid_days=0 yields expiration_day = issue_day
   * (expires end of issue day). KNOWN DEFECT K-10.D1 — the queue/list badges
   * (Estimator.jsx expiryOf, EstimatorQueues expiryOf) instead treat a falsy
   * valid_days as 'no expiry', so a 0-day quote never gets an EXPIRED badge
   * while the panel/PDF/portal already call it expired on the issue day.
   */
}

/**
 * quoteExpiryFrom — parity with estimateQuoteExpiration() +
 * quoteExpirationDate(): a stored quote_expiration_date override (valid
 * YYYY-MM-DD) wins; otherwise issue_day + max(0, floor(valid_days)).
 * `issueDay` is the quote issue (sent) day — NOT the estimate created day;
 * callers pass quote_issue_date. When issueDay is blank the deployed helper
 * anchors on "today"; pass fallbackDay to control that clock in tests.
 */
export function quoteExpiryFrom(
  issueDay: string,
  input: { valid_days?: any; expiration_override?: any; fallback_day?: any } = {},
): QuoteExpiry {
  const overrideDay = clean(input.expiration_override);
  const validDays = input.valid_days === undefined || input.valid_days === null || !Number.isFinite(Number(input.valid_days))
    ? BUILTIN_QUOTE_DEFAULTS.quote_valid_days
    : Math.max(0, Math.floor(Number(input.valid_days)));
  if (DAY_RE.test(overrideDay)) {
    return { issue_day: isDay(issueDay) ? clean(issueDay) : '', valid_days: validDays, expiration_day: overrideDay, source: 'override' };
  }
  const anchor = clean(issueDay) || clean(input.fallback_day);
  const match = DAY_RE.exec(anchor);
  if (!match) return { issue_day: '', valid_days: validDays, expiration_day: '', source: 'none' };
  // Local-time construction identical to quoteExpirationDate (a bare
  // new Date('YYYY-MM-DD') is UTC and shifts a day in US timezones).
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + validDays);
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { issue_day: anchor, valid_days: validDays, expiration_day: stamp, source: 'computed' };
}

/** estimateQuoteExpiration parity — returns just the expiration day or ''. */
export function estimateExpirationDay(estimate: any, opts: { fallback_day?: any; valid_days_fallback?: any } = {}): string {
  return quoteExpiryFrom(
    clean(estimate?.quote_issue_date) || clean(opts.fallback_day),
    {
      valid_days: estimate?.quote_valid_days ?? opts.valid_days_fallback,
      expiration_override: estimate?.quote_expiration_date,
    },
  ).expiration_day;
}

/** Expired strictly after the expiration day (isQuoteExpired parity). */
export function quoteExpiredOn(expirationDay: string, day: string): boolean {
  const exp = clean(expirationDay);
  const today = clean(day);
  return Boolean(exp && today && today > exp);
}

/**
 * quoteValiditySentence — the footer line each surface prints.
 *   panel/PDF: "This estimate is valid through {label} ({N} days) unless
 *              otherwise stated." — the ({N} days) note is ALWAYS included;
 *              without an expiry it prints "valid for {N} days…".
 *   export:    buildStandaloneQuoteHtml prints "valid through {label} unless
 *              otherwise stated." with NO day-count note, and can only show a
 *              stored override label (KNOWN DEFECT K-10.D3 — the export never
 *              computes issue+days, so exported quotes lose 'Valid through'
 *              unless an explicit override was saved).
 */
export function quoteValiditySentence(
  expiry: QuoteExpiry,
  opts: { surface?: 'panel' | 'export'; format_label?: (day: string) => string } = {},
): string {
  const days = Math.max(0, whole(expiry?.valid_days, BUILTIN_QUOTE_DEFAULTS.quote_valid_days));
  const label = expiry?.expiration_day ? (opts.format_label ? opts.format_label(expiry.expiration_day) : expiry.expiration_day) : '';
  if (label) {
    return opts.surface === 'export'
      ? `This estimate is valid through ${label} unless otherwise stated.`
      : `This estimate is valid through ${label} (${days} days) unless otherwise stated.`;
  }
  return `This estimate is valid for ${days} days unless otherwise stated.`;
}

// ---------------------------------------------------------------------------
// Email subject/message/signature (quoteDeliveryService parity)
// ---------------------------------------------------------------------------

/** Tokens interpolateEmailTemplate supports; unknown tokens pass through. */
export const QUOTE_EMAIL_TOKENS = ['estimate_number', 'project_name', 'client_name', 'contact_name', 'company_name', 'quote_total', 'quote_valid_until'] as const;

export function quoteEmailTemplateValues(estimate: any): Record<string, string> {
  return {
    estimate_number: clean(estimate?.estimate_number),
    project_name: clean(estimate?.project_name),
    client_name: clean(estimate?.client_name),
    contact_name: clean(estimate?.order_contact) || clean(estimate?.contact_name),
    company_name: clean(estimate?.company_name) || 'Cincinnati Custom Signs',
    quote_total: `$${(Number.isFinite(Number(estimate?.quote_total)) ? Number(estimate.quote_total) : 0).toFixed(2)}`,
    quote_valid_until: clean(estimate?.quote_valid_until) || clean(estimate?.quote_expiration_date),
  };
}

export function interpolateQuoteTemplate(template: any, estimate: any = {}): string {
  const values = quoteEmailTemplateValues(estimate);
  return String(template || '').replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
}

/** defaultQuoteEmailSubject parity — template → interpolated → newline-safe. */
export function quoteEmailSubject(estimate: any): string {
  const tpl = clean(estimate?.email_subject_template);
  if (tpl) {
    const out = interpolateQuoteTemplate(tpl, estimate).trim();
    if (out) return out.replace(/[\r\n]+/g, ' ');
  }
  const number = clean(estimate?.estimate_number).replace(/[\r\n]+/g, ' ');
  const project = clean(estimate?.project_name).replace(/[\r\n]+/g, ' ');
  return [number ? `Estimate #${number}` : 'Project Estimate', project].filter(Boolean).join(' — ');
}

/** defaultQuoteEmailMessage parity — template → interpolated → fallback body. */
export function quoteEmailMessage(estimate: any): string {
  const tpl = clean(estimate?.email_message_template);
  if (tpl) {
    const out = interpolateQuoteTemplate(tpl, estimate).trim();
    if (out) return out;
  }
  const contact = clean(estimate?.order_contact) || clean(estimate?.contact_name);
  const greeting = contact ? `Good afternoon ${contact},` : 'Good afternoon,';
  const company = clean(estimate?.company_name) || 'Cincinnati Custom Signs';
  return `${greeting}\n\nPlease find the attached estimate for ${estimate?.project_name || 'your project'}. Please let us know if you have any questions or if there is anything you would like us to review.\n\nThank you,\n${company}`;
}

// ---------------------------------------------------------------------------
// Tax-rate source chain (#486 / #480)
// ---------------------------------------------------------------------------

const groupName = (g: any): string => clean(g?.group_name) || clean(g?.name);

export interface TaxSourceResolution {
  /** 'manual' | 'customer_default' | 'shop_default' | 'group_default' | 'none'. */
  source: string;
  /** The group name the chain asked for (before existence check). */
  wanted_tax_group: string;
  tax_group: string;        // resolved name actually applied ('' = untaxed)
  tax_percent: number;      // percent (7.5 = 7.5%), 0 when unresolved
  resolved: boolean;        // wanted name matched a real group
  warnings: string[];
}

/**
 * resolveTaxRateSource — the Step1EstimateDetails chain exactly:
 *   explicit estimate pick (manual_tax_group) wins; then
 *   Customer.default_tax_group → QuoteDefaults.default_tax_group →
 *   the TaxGroup flagged is_default. The FIRST non-empty NAME wins and is
 *   resolved against the group list by exact group_name match; a name with no
 *   matching group resolves to UNTAXED — the chain does NOT fall through to
 *   the next source (stale customer defaults silence the shop default).
 * tax_rate_source policy pins one source when set to anything but 'auto'
 * ('none' starts untaxed; 'manual' skips default seeding entirely).
 */
export function resolveTaxRateSource(input: {
  customer?: any;
  defaults?: any;
  groups?: any[];
  manual_tax_group?: any;
  manual_tax_percent?: any;
} = {}): TaxSourceResolution {
  const groups = Array.isArray(input.groups) ? input.groups : [];
  const warnings: string[] = [];
  const defaults = isObj(input.defaults) ? input.defaults : resolveQuoteDefaults(input.defaults);
  const policy: TaxRateSource = (defaults as ResolvedQuoteDefaults).tax_rate_source ?? normalizeTaxSource((defaults as any).tax_rate_source);

  const manualName = clean(input.manual_tax_group);
  if (policy === 'none') {
    return { source: 'none', wanted_tax_group: '', tax_group: '', tax_percent: 0, resolved: true, warnings };
  }
  if (manualName || policy === 'manual') {
    const g = groups.find((x) => groupName(x) === manualName);
    if (manualName && !g) warnings.push(`manual tax group "${manualName}" is not a known TaxGroup`);
    const pct = g ? Number(g.tax_percent) : (Number.isFinite(Number(input.manual_tax_percent)) ? Number(input.manual_tax_percent) : 0);
    return {
      source: 'manual', wanted_tax_group: manualName, tax_group: manualName,
      tax_percent: Math.max(0, Math.min(100, pct || 0)),
      resolved: Boolean(g || manualName), warnings,
    };
  }

  const chain: Array<[string, string]> = [];
  const customerName = clean(input.customer?.default_tax_group);
  const shopName = clean((defaults as ResolvedQuoteDefaults).default_tax_group ?? (defaults as any).default_tax_group);
  const groupDefaultName = groupName(groups.find((g) => g?.is_default === true));
  if (policy === 'auto' || policy === 'customer_default') chain.push(['customer_default', customerName]);
  if (policy === 'auto' || policy === 'shop_default') chain.push(['shop_default', shopName]);
  if (policy === 'auto' || policy === 'group_default') chain.push(['group_default', groupDefaultName]);

  const [source, wanted] = chain.find(([, name]) => name) || ['none', ''];
  if (source === 'none' || !wanted) {
    return { source: 'none', wanted_tax_group: '', tax_group: '', tax_percent: 0, resolved: true, warnings };
  }
  const match = groups.find((g) => groupName(g) === wanted);
  const pct = Number(match?.tax_percent);
  if (!match) {
    warnings.push(`${source} tax group "${wanted}" matched no TaxGroup — estimate starts untaxed (no fall-through)`);
    return { source, wanted_tax_group: wanted, tax_group: '', tax_percent: 0, resolved: false, warnings };
  }
  if (!(Number.isFinite(pct) && pct >= 0 && pct <= 100)) {
    warnings.push(`${source} tax group "${wanted}" has an out-of-range tax_percent (${match?.tax_percent}) — untaxed`);
    return { source, wanted_tax_group: wanted, tax_group: '', tax_percent: 0, resolved: false, warnings };
  }
  return { source, wanted_tax_group: wanted, tax_group: groupName(match), tax_percent: pct, resolved: true, warnings };
}

// ---------------------------------------------------------------------------
// Customer-quote print model — what CustomerQuotePanel + the HTML export
// render, in render order, with per-part provenance.
// ---------------------------------------------------------------------------

export interface QuotePrintSection {
  slot: string;          // ordered slot key
  title: string;         // printed heading ('' for chrome)
  content: any;          // composed text/rows
  visible: boolean;
  /** Quote-default keys whose value/toggle drives this section's output. */
  drives: string[];
}

const textLines = (v: any): string[] => String(v || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/**
 * Effective quote field: the estimate's own stored copy wins when set
 * (defaults were stamped at create / Apply-Defaults and may since have been
 * customized); otherwise the resolved default. Mirrors `estimate.x ?? d.x`
 * fallback usage across the panel fields.
 */
const eff = (estimate: any, key: string, resolved: ResolvedQuoteDefaults): any => {
  const v = estimate?.[key];
  if (v !== undefined && v !== null && v !== '') return v;
  switch (key) {
    case 'company_name': return resolved.company.name;
    case 'company_phone': return resolved.company.phone;
    case 'company_email': return resolved.company.email;
    case 'company_website': return resolved.company.website;
    case 'company_address': return resolved.company.address;
    case 'company_license': return resolved.company.license;
    case 'company_logo_url': return resolved.company.logo_url;
    default: return (resolved as any)[key];
  }
};

const defaultBool = (estimate: any, resolved: ResolvedQuoteDefaults, key: string, fallback = true): boolean => {
  if (estimate?.[key] !== undefined && estimate?.[key] !== null) return estimate[key] !== false;
  const p = resolved.print_options[key];
  return p === undefined ? fallback : p;
};

/**
 * quotePrintModel — the ordered composition of the customer-quote article.
 * Each entry's `drives` names the default keys that decide presence/content —
 * the "does this default drive output" proof used by the audit map below.
 * `estimate` fields win over `defaults` (per-estimate customization).
 */
export function quotePrintModel(estimate: any = {}, defaults: any = null): { sections: QuotePrintSection[]; footer_lines: QuotePrintSection[]; expiry: QuoteExpiry } {
  const resolved = isObj(defaults) && (defaults as ResolvedQuoteDefaults).print_options
    ? (defaults as ResolvedQuoteDefaults)
    : resolveQuoteDefaults(defaults);

  // Real anchor: quote_issue_date (first transition into 'sent'); the deployed
  // estimateQuoteExpiration falls back to TODAY when it's blank — pass
  // estimate.fallback_day to pin that clock in tests.
  const expiry = quoteExpiryFrom(
    clean(estimate?.quote_issue_date),
    {
      // estimate copy wins; the resolved default fills when the estimate was
      // never stamped (defaults are copied on create / Apply-Defaults).
      valid_days: estimate?.quote_valid_days ?? resolved.quote_valid_days,
      expiration_override: estimate?.quote_expiration_date,
      fallback_day: clean(estimate?.fallback_day),
    },
  );

  const sections: QuotePrintSection[] = [];

  // Header chrome -----------------------------------------------------------
  sections.push({
    slot: 'header.company_block',
    title: '',
    content: {
      logo_url: defaultBool(estimate, resolved, 'show_logo', false) ? eff(estimate, 'company_logo_url', resolved) : '',
      name: eff(estimate, 'company_name', resolved) || 'Company Name',
      address: eff(estimate, 'company_address', resolved),
      contact_line: [eff(estimate, 'company_phone', resolved), eff(estimate, 'company_email', resolved), eff(estimate, 'company_website', resolved)].filter(Boolean).join(' · '),
      license: eff(estimate, 'company_license', resolved),
    },
    visible: defaultBool(estimate, resolved, 'show_company_block'),
    drives: ['show_company_block', 'show_logo', 'company_name', 'company_logo_url', 'company_address', 'company_phone', 'company_email', 'company_website', 'company_license'],
  });
  sections.push({
    slot: 'header.title_block',
    title: eff(estimate, 'quote_title', resolved) || 'Project Estimate',
    content: {
      estimate_number: defaultBool(estimate, resolved, 'show_estimate_number') ? clean(estimate?.estimate_number) : '',
      po_number: defaultBool(estimate, resolved, 'show_po_number') ? clean(estimate?.po_number) : '',
      issued: defaultBool(estimate, resolved, 'show_dates') ? clean(estimate?.quote_issue_date) : '',
      valid_through: defaultBool(estimate, resolved, 'show_dates') ? expiry.expiration_day : '',
      quote_version: Math.max(0, whole(estimate?.quote_version)),
    },
    visible: true,
    drives: ['quote_title', 'show_estimate_number', 'show_po_number', 'show_dates', 'quote_valid_days'],
  });
  sections.push({
    slot: 'header.parties',
    title: '',
    content: {
      prepared_for: clean(estimate?.client_name) || 'Customer',
      contact_line: defaultBool(estimate, resolved, 'show_contact_block')
        ? [clean(estimate?.order_contact) || clean(estimate?.contact_name), clean(estimate?.contact_email), clean(estimate?.office_phone) || clean(estimate?.contact_phone)].filter(Boolean).join(' · ')
        : '',
      project_name: clean(estimate?.project_name) || 'Project',
      site_address: defaultBool(estimate, resolved, 'show_site_address') ? clean(estimate?.site_address) : '',
    },
    visible: true,
    drives: ['show_contact_block', 'show_site_address'],
  });

  // Body --------------------------------------------------------------------
  sections.push({
    slot: 'body.intro',
    title: '',
    content: eff(estimate, 'quote_intro_text', resolved),
    visible: Boolean(clean(eff(estimate, 'quote_intro_text', resolved))),
    drives: ['quote_intro_text'],
  });
  sections.push({
    slot: 'body.items_table',
    title: '',
    content: {
      columns: [
        'product_scope',
        ...(defaultBool(estimate, resolved, 'show_category_column') ? ['category'] : []),
        ...(defaultBool(estimate, resolved, 'show_quantity_column', false) ? ['quantity'] : []),
        'price',
      ],
      show_descriptions: defaultBool(estimate, resolved, 'show_section_descriptions'),
      bundled: estimate?.hide_section_prices === true,
      round: estimate?.round_prices_to_dollar === true || resolved.print_options.round_prices_to_dollar === true,
    },
    visible: true,
    drives: ['hide_section_prices', 'show_category_column', 'show_quantity_column', 'show_section_descriptions', 'round_prices_to_dollar'],
  });
  // Amount gate mirrors the panel: discount/fees/tax/contingency rows render
  // only when |amount| > 0.005; subtotal/total/deposit render unconditionally
  // behind their toggle.
  const totals: Array<{ key: string; label: string; visible: boolean; amount_gate: boolean }> = [
    { key: 'subtotal', label: 'Subtotal', visible: defaultBool(estimate, resolved, 'show_subtotal_line'), amount_gate: false },
    { key: 'discount', label: `Discount (${Number(estimate?.discount_percent || 0)}%)`, visible: defaultBool(estimate, resolved, 'show_discount_line'), amount_gate: true },
    { key: 'contingency', label: `Contingency (${Number(estimate?.contingency_percent || 0)}%)`, visible: true, amount_gate: true },
    { key: 'fees', label: 'Shipping / permits / fees', visible: defaultBool(estimate, resolved, 'show_fees_line'), amount_gate: true },
    { key: 'tax', label: `Tax (${Number(estimate?.tax_percent || 0)}%)`, visible: defaultBool(estimate, resolved, 'show_tax_line'), amount_gate: true },
    { key: 'deposit', label: `Deposit (${Number(estimate?.deposit_percent || 0)}%)`, visible: defaultBool(estimate, resolved, 'show_deposit_lines'), amount_gate: false },
    { key: 'balance', label: 'Balance', visible: defaultBool(estimate, resolved, 'show_deposit_lines'), amount_gate: false },
  ];
  sections.push({
    slot: 'body.totals',
    title: '',
    content: totals,
    visible: true,
    drives: ['show_subtotal_line', 'show_discount_line', 'show_fees_line', 'show_tax_line', 'show_deposit_lines', 'default_tax_group'],
  });
  const included = textLines(estimate?.scope_inclusions);
  const excluded = textLines(estimate?.scope_exclusions);
  sections.push({
    slot: 'body.scope_lists',
    title: '',
    content: { included, excluded },
    visible: defaultBool(estimate, resolved, 'show_scope_lists') && (included.length > 0 || excluded.length > 0),
    drives: ['show_scope_lists', 'scope_auto_apply'],
  });

  // Ordered text blocks (panel render order: lead time → warranty → notes →
  // terms). The printed terms text is payment_terms + \n\n + quote_terms_
  // conditions exactly as CustomerQuotePanel:574 composes it. estimate.terms
  // (customer credit terms) only seeds the edit FIELD value, never the render.
  const paymentTerms = clean(estimate?.payment_terms) || clean(resolved.payment_terms);
  const termsText = [paymentTerms, clean(eff(estimate, 'quote_terms_conditions', resolved))].filter(Boolean).join('\n\n');
  const blocks: Array<[string, string, string, boolean, string[]]> = [
    ['text.lead_time', 'Lead Time', clean(eff(estimate, 'lead_time_text', resolved)), defaultBool(estimate, resolved, 'show_lead_time_block'), ['lead_time_text', 'show_lead_time_block']],
    ['text.warranty', 'Warranty', clean(eff(estimate, 'warranty_text', resolved)), defaultBool(estimate, resolved, 'show_warranty_block'), ['warranty_text', 'show_warranty_block']],
    ['text.notes', 'Notes', clean(estimate?.notes), defaultBool(estimate, resolved, 'show_notes_on_quote', false), ['show_notes_on_quote']],
    ['text.terms', 'Terms & Conditions', termsText, defaultBool(estimate, resolved, 'show_terms_block'), ['payment_terms', 'quote_terms_conditions', 'show_terms_block']],
  ];
  for (const [slot, title, text, toggle, drives] of blocks) {
    sections.push({ slot, title, content: text, visible: toggle && Boolean(text), drives });
  }

  // Signature block — hardcoded today; signature_text (proposed) overrides the
  // acceptance-line label once the field is declared.
  const sigText = clean(eff(estimate, 'signature_text', resolved));
  sections.push({
    slot: 'signature',
    title: '',
    content: {
      lines: [sigText || 'Customer acceptance / signature', 'Date'],
      uses_default_text: !sigText,
    },
    visible: defaultBool(estimate, resolved, 'show_signature_block'),
    drives: ['show_signature_block', 'signature_text'],
  });

  // Footer (render order: footer_text → disclaimer (proposed) → validity)
  const footer_lines: QuotePrintSection[] = [
    {
      slot: 'footer.quote_footer_text',
      title: '',
      content: eff(estimate, 'quote_footer_text', resolved),
      visible: Boolean(clean(eff(estimate, 'quote_footer_text', resolved))),
      drives: ['quote_footer_text'],
    },
    {
      slot: 'footer.disclaimer',
      title: '',
      content: clean(eff(estimate, 'disclaimer_text', resolved)),
      visible: Boolean(clean(eff(estimate, 'disclaimer_text', resolved))),
      drives: ['disclaimer_text'],
    },
    {
      slot: 'footer.validity',
      title: '',
      content: quoteValiditySentence(expiry),
      visible: defaultBool(estimate, resolved, 'show_validity_footer'),
      drives: ['show_validity_footer', 'quote_valid_days'],
    },
  ];

  return { sections, footer_lines, expiry };
}

// ---------------------------------------------------------------------------
// Default → output proof map (the audit registry)
// ---------------------------------------------------------------------------

export interface QuoteDefaultOutputProof {
  key: string;
  /** Declared on QuoteDefaults.jsonc / AllInOneEstimate.jsonc today. */
  declared_on_defaults: boolean;
  declared_on_estimate: boolean;
  /** In the deployed QUOTE_DEFAULT_KEYS copy whitelist. */
  copied_to_estimate: boolean;
  /** Where the value reaches output. */
  outputs: Array<{ surface: string; detail: string }>;
  /**
   * 'drives_output' — a value/toggle that visibly drives a rendered surface;
   * 'drives_process' — drives a non-render path (numbering, timezone, status);
   * 'stored_not_rendered' — persisted + copied but no consumer reads it;
   * 'proposed' — field does not exist yet (K-10 schema gap).
   */
  status: 'drives_output' | 'drives_process' | 'stored_not_rendered' | 'proposed';
}

export const QUOTE_DEFAULT_OUTPUT_PROOF: QuoteDefaultOutputProof[] = [
  { key: 'company_name', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'quote header', detail: 'CustomerQuotePanel:507 company block name' },
    { surface: 'portal', detail: 'customerPortalAction companyBranding.name (fallback "CCS Signage")' },
    { surface: 'email', detail: '{company_name} token / message footer' },
    { surface: 'other', detail: 'workOrderPrintModel company block; WalkInReceipt header; notifySend context' }] },
  { key: 'company_logo_url', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'quote header', detail: 'logo <img> when show_logo' },
    { surface: 'portal', detail: 'companyBranding.logo_url' }] },
  { key: 'company_phone', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'quote header', detail: 'contact line phone · email · website' }] },
  { key: 'company_email', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'quote header', detail: 'contact line' }] },
  { key: 'company_website', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'quote header', detail: 'contact line' }] },
  { key: 'company_address', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'quote header', detail: 'address block (pre-line)' }] },
  { key: 'company_license', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'quote header', detail: 'license/registration line' }] },
  { key: 'quote_title', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'quote header', detail: 'headline + HTML export <title>; portal quote_title' }] },
  { key: 'quote_accent_color', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'stored_not_rendered', outputs: [
    { surface: 'none', detail: 'K-10.G1 — declared & copied to every estimate but no render consumer reads it' }] },
  { key: 'quote_valid_days', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'quote header', detail: '"Valid through {issue+days}"' },
    { surface: 'quote footer', detail: 'validity sentence + (N days) note' },
    { surface: 'delivery audit', detail: 'EstimateQuoteDelivery quote_valid_days/quote_expiration_date snapshot' },
    { surface: 'portal', detail: '"Valid N days" / "valid until" badge; customerPortalAction quoteValidUntil' },
    { surface: 'queues', detail: 'Estimator/EstimatorQueues EXPIRED badge + quote_expired flag sweep' }] },
  { key: 'payment_terms', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'terms block', detail: 'first half of Terms & Conditions text (before quote_terms_conditions); panel field falls back to estimate.terms' }] },
  { key: 'quote_intro_text', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'body.intro', detail: 'paragraph above the pricing table' }] },
  { key: 'quote_footer_text', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'footer', detail: 'centered footer line 1 (pre-line)' }] },
  { key: 'quote_terms_conditions', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'terms block', detail: 'second half of Terms & Conditions text' }] },
  { key: 'warranty_text', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'text block', detail: '"Warranty" block (after Lead Time, before Notes)' }] },
  { key: 'lead_time_text', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'text block', detail: '"Lead Time" block (first text block)' }] },
  { key: 'signature_text', declared_on_defaults: false, declared_on_estimate: false, copied_to_estimate: false, status: 'proposed', outputs: [
    { surface: 'signature block', detail: 'PROPOSED — replaces hardcoded "Customer acceptance / signature" line label' }] },
  { key: 'disclaimer_text', declared_on_defaults: false, declared_on_estimate: false, copied_to_estimate: false, status: 'proposed', outputs: [
    { surface: 'footer', detail: 'PROPOSED — dedicated disclaimer line between quote_footer_text and the validity line' }] },
  { key: 'tax_rate_source', declared_on_defaults: false, declared_on_estimate: false, copied_to_estimate: false, status: 'proposed', outputs: [
    { surface: 'tax chain', detail: 'PROPOSED — pins the #486 source chain (auto/customer_default/shop_default/group_default/manual/none)' }] },
  { key: 'email_signature', declared_on_defaults: false, declared_on_estimate: false, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'email', detail: 'appended signature block in quoteEmailBodyHtml at send (#479)' }] },
  { key: 'email_subject_template', declared_on_defaults: false, declared_on_estimate: false, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'email', detail: 'defaultQuoteEmailSubject template (+7 tokens)' }] },
  { key: 'email_message_template', declared_on_defaults: false, declared_on_estimate: false, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'email', detail: 'defaultQuoteEmailMessage template' }] },
  { key: 'default_tax_group', declared_on_defaults: false, declared_on_estimate: false, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'tax chain', detail: '#486 shop-level middle source; resolves TaxGroup.tax_percent → estimate.tax_percent → "Tax (N%)" line + waterfall tax' }] },
  { key: 'estimate_number_format', declared_on_defaults: false, declared_on_estimate: false, copied_to_estimate: true, status: 'drives_process', outputs: [
    { surface: 'generateDocNumber', detail: 'estimate doc-number mask' }] },
  { key: 'order_number_format', declared_on_defaults: false, declared_on_estimate: false, copied_to_estimate: true, status: 'drives_process', outputs: [
    { surface: 'generateDocNumber', detail: 'order/invoice doc-number mask' }] },
  { key: 'doc_number_padding', declared_on_defaults: false, declared_on_estimate: false, copied_to_estimate: true, status: 'drives_process', outputs: [
    { surface: 'generateDocNumber', detail: '{seq} zero padding (3-10)' }] },
  { key: 'module_number_prefixes', declared_on_defaults: false, declared_on_estimate: false, copied_to_estimate: true, status: 'drives_process', outputs: [
    { surface: 'generateDocNumber', detail: 'JSON per-module format overrides' }] },
  { key: 'number_reissue_policy', declared_on_defaults: false, declared_on_estimate: false, copied_to_estimate: true, status: 'drives_process', outputs: [
    { surface: 'generateDocNumber', detail: 'never_reuse documentation flag (#484)' }] },
  { key: 'display_timezone', declared_on_defaults: false, declared_on_estimate: false, copied_to_estimate: true, status: 'drives_process', outputs: [
    { surface: 'date display', detail: 'formatInCompanyTz in queues/audit (#488); userDefaultsModel shop-tier tz' }] },
  { key: 'custom_statuses', declared_on_defaults: true, declared_on_estimate: false, copied_to_estimate: true, status: 'drives_process', outputs: [
    { surface: 'status picker', detail: 'customStatusModel vocabulary (#493/K-11)' }] },
  { key: 'status_transitions', declared_on_defaults: true, declared_on_estimate: false, copied_to_estimate: true, status: 'drives_process', outputs: [
    { surface: 'status picker', detail: 'customStatusModel transition override map' }] },
  { key: 'custom_status_meta', declared_on_defaults: true, declared_on_estimate: false, copied_to_estimate: false, status: 'drives_process', outputs: [
    { surface: 'status picker', detail: 'customStatusModel rich meta — shop-global, deliberately not copied to estimates' }] },
  { key: 'scope_auto_apply', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'stored_not_rendered', outputs: [
    { surface: 'none', detail: 'K-10.G2 — declared & copied; QuoteScopeLine auto-apply machinery is never invoked by any consumer' }] },
  { key: 'hide_section_prices', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'items table', detail: 'bundles all products into one "Project scope" line (buildCustomerQuoteRows)' }] },
  { key: 'round_prices_to_dollar', declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true, status: 'drives_output', outputs: [
    { surface: 'items+totals', detail: 'display-only rounding of every printed price' }] },
];

// Toggle keys share one proof shape — emitted programmatically so the map
// stays in sync with QUOTE_PRINT_TOGGLES.
const TOGGLE_SLOT: Record<string, string> = {
  show_company_block: 'header.company_block', show_logo: 'header.company_block (logo)',
  show_contact_block: 'header.parties', show_estimate_number: 'header.title_block',
  show_po_number: 'header.title_block', show_site_address: 'header.parties',
  show_dates: 'header.title_block (issued + valid-through)', show_category_column: 'items table column',
  show_section_descriptions: 'items table rows', show_quantity_column: 'items table column',
  show_scope_lists: 'body.scope_lists', show_subtotal_line: 'body.totals',
  show_discount_line: 'body.totals', show_fees_line: 'body.totals',
  show_tax_line: 'body.totals', show_deposit_lines: 'body.totals',
  show_notes_on_quote: 'text.notes block', show_terms_block: 'text.terms block',
  show_warranty_block: 'text.warranty block', show_lead_time_block: 'text.lead_time block',
  show_signature_block: 'signature block', show_validity_footer: 'footer.validity line',
};

for (const [key] of QUOTE_PRINT_TOGGLES) {
  if (key === 'hide_section_prices' || key === 'round_prices_to_dollar') continue;
  QUOTE_DEFAULT_OUTPUT_PROOF.push({
    key, declared_on_defaults: true, declared_on_estimate: true, copied_to_estimate: true,
    status: 'drives_output',
    outputs: [{ surface: TOGGLE_SLOT[key] || 'print article', detail: `visibility toggle for ${TOGGLE_SLOT[key] || key}` }],
  });
}
