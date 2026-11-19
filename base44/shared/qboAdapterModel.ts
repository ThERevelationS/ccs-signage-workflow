// QuickBooks Online adapter model — pure TS, ZERO imports. Safe to bundle
// into Deno functions (base44/functions/*), admin UI, and Node test
// harnesses. No I/O anywhere in this module — the wiring layer
// (the future `quickbooksExport` function) loads Invoice / Payment /
// Customer / IncomeAccount / COGSAccount rows and the GlobalSettings 'qbo'
// singleton, resolves refs through caller-supplied maps, performs the HTTPS
// call, and persists the sync receipts this model computes.
//
// I-09 (ESTIMATOR_MASTERPLAN WS-I): token storage shape + sync action stubs +
// DRY-RUN payload generation. Live OAuth is [BLOCKED-CREDENTIALS] — this
// model produces and validates the exact JSON a QBO v3 create call would
// take so everything except the wire call is testable today.
//
// ===========================================================================
// TOKEN STORAGE SHAPE (GlobalSettings, setting_key='qbo')
// ===========================================================================
// GlobalSettings is a keyed-singleton store ({setting_key, setting_value} —
// see globalSettingSingleton.ts). The QBO connection lives on ONE row:
//   setting_key: 'qbo'   (QBO_SETTINGS_KEY)
//   setting_value: {
//     realm_id          — Intuit company/realm id returned by the OAuth2
//                         callback. Required to form any API URL.
//     refresh_token_ref — REFERENCE to the refresh token in the secret store
//                         (e.g. a Base44 secret/env name like 'QBO_REFRESH_TOKEN'),
//                         NEVER the token itself. Function code resolves the
//                         secret at call time; the entity row stays portable
//                         and safe to export.
//     access_token_ref  — same idea for the short-lived access token cache,
//                         when the wiring layer chooses to persist one.
//     company_name      — QBO company display name shown in settings UI.
//     connected_at      — ISO timestamp of the successful OAuth handshake.
//     last_sync_at      — ISO timestamp of the last completed sync action.
//     environment       — 'sandbox' | 'production' (QBO_ENVIRONMENTS).
//     minorversion      — QBO API minorversion pin (QBO_API_MINOR_VERSION).
//     customer_map      — {local Customer.id → QBO Customer Id} resolution
//                         cache written by push_customer.
//     account_map       — {local GL code → QBO Account Id} written by
//                         pull_accounts / push_account.
//     item_map          — {local line/part key → QBO Item Id} for
//                         SalesItemLineDetail.ItemRef.
//     method_map        — {local Payment.method → QBO PaymentMethod Id}.
//     sync_state        — {entityKey → receipt} push dedupe ledger; entityKey
//                         is '<doc_type>:<local id>', receipt =
//                         {key, qbo_id, synced_at, status}. The wiring layer
//                         re-pushes only when qboSyncKey(record) differs from
//                         the stored receipt key (i.e. updated_date moved).
//   }
// Tokens never touch entity rows, exports, logs, or dry-run envelopes —
// only *_ref names.
//
// ===========================================================================
// SOURCE FIELD CONTRACT (base44/entities/*.jsonc)
// ===========================================================================
// Invoice   — money fields are DOLLARS (number). line_items[]
//             {description, quantity, unit_price, taxable}; fee_lines[]
//             {label, kind: shipping|postage|discount|fee, amount(signed),
//             taxable, income_account_code}; discount_amount flat positive;
//             tax_amount/tax_rate; invoice_number (DocNumber); issue_date
//             (TxnDate, chain invoice_date→issue_date→date→created_date);
//             due_date (DueDate); notes (customer-facing → CustomerMemo);
//             internal_notes NEVER exported (I-08 safe-column rule);
//             deposit_applied/credit_applied/amount_paid/balance_due are
//             payment-application state — NOT part of a create payload (QBO
//             applies money via Payment.LinkedTxn), documented exclusion.
// Payment   — amount SIGNED dollars; method cash|check|card|ach|financing|
//             other|credit_memo; reference_number → PaymentRefNum; paid_date
//             → TxnDate; status recorded|void|refunded; gl_memo is the ONLY
//             export-safe free text (→ PrivateNote); notes never exported;
//             invoice_id → LinkedTxn resolution via opts.invoice_map.
// Customer  — company_name (required) → DisplayName+CompanyName;
//             contact_first/last_name → GivenName/FamilyName; contact_email
//             → PrimaryEmailAddr+BillEmail; contact_office_phone→
//             company_phone → PrimaryPhone; contact_cell_phone → Mobile;
//             company_fax → Fax; billing_* → BillAddr; location_* → ShipAddr
//             (only when location_same_as_billing===false); tax_exempt →
//             inverse of Taxable; is_active → Active; notes never exported
//             unless opts.include_notes.
// GLAccount — there is NO GLAccount entity: the chart is split across
//             IncomeAccount (4000-series) + COGSAccount (5000-series), both
//             {code, name, parent_account, status} (glAccountAdminModel
//             parity). AccountType resolves '4xxx'→'Income', '5xxx'→
//             'Cost of Goods Sold' (opts.kind / entity name override).
//             parent_account is a CODE — resolve to a QBO ParentRef via
//             opts.account_map.
//
// ===========================================================================
// MONEY: inputs are DOLLARS, internal math is INTEGER CENTS (parity with
// accountingExportModel.toCents/fromCents), wire output is dollars rounded
// to the cent. No float arithmetic reaches a payload — every Amount/
// UnitPrice/TotalAmt/TotalTax is emitted via qboDollars(qboToCents(x)).
// ===========================================================================
//
// LINE SEMANTICS: QBO Invoice.Line is 1-based LineNum. Order emitted:
//   line_items (SalesItemLineDetail) → fee_lines non-discount kinds
//   (SalesItemLineDetail, Qty 1) → fee kind 'discount' + flat discount_amount
//   (DiscountLineDetail, positive Amount, PercentBased:false). TaxCodeRef
//   'TAX'/'NON' per line.taxable (US company codes; opts.tax_codes override).
//   ItemRef resolves opts.item_map[line part key] → opts.default_item_ref →
//   omitted (QBO marks ItemRef optional in the schema docs, so its absence
//   is a warning-free pass, not an error). GL account coding lives on the
//   QBO Item, not the line — income_account_code hints resolve through
//   opts.account_item_map first.
//
// IDEMPOTENCY: qboSyncKey(action, record) = 'qbo:<action>:<entity>:<id>:h<fnv>'
// where fnv = FNV-1a(record.id | updated_date-or-created_date) — stable while
// the stored row is untouched, changes on any update. The wiring layer stores
// the key in settings.sync_state['<doc_type>:<id>']; a retry with the same
// key short-circuits as already-synced instead of duplicating the QBO doc.
//
// DRY-RUN ENVELOPE (dryRunEnvelope): {mode:'dry-run', action, doc_type,
// entity, record_id, idempotency_key, endpoint{method,path,url,environment},
// realm_id, would_send, validation, push_blocked, credentials}. `would_send`
// is byte-for-byte the JSON body the live call posts; `validation` is the
// schema-doc gate that must pass before a real send; `push_blocked` carries
// record-level gates (void/draft/not-posted/negative-amount); `credentials`
// carries the BLOCKED-CREDENTIALS marker until OAuth lands.
//
// ===========================================================================

export const QBO_SETTINGS_KEY = 'qbo';
export const QBO_BLOCK_CREDENTIALS = 'BLOCKED-CREDENTIALS';
export const QBO_API_MINOR_VERSION = '75';

/** Doc types this adapter can build create-payloads for. */
export const QBO_DOC_TYPES = ['invoice', 'payment', 'customer', 'account'] as const;
export type QboDocType = (typeof QBO_DOC_TYPES)[number];

/** QBO v3 base URLs per environment (Intuit docs). */
export const QBO_ENVIRONMENTS: Record<string, string> = {
  sandbox: 'https://sandbox-quickbooks.api.intuit.com',
  production: 'https://quickbooks.api.intuit.com',
};

/** Local entity each doc type maps from ('account' spans two entities). */
export const QBO_ENTITY_FOR_DOC: Record<QboDocType, string> = {
  invoice: 'Invoice',
  payment: 'Payment',
  customer: 'Customer',
  account: 'IncomeAccount|COGSAccount',
};

/** Documented QBO create-body limits enforced by validateQboPayload. */
export const QBO_FIELD_LIMITS = {
  doc_number: 21,        // Invoice.DocNumber / Payment.PaymentRefNum
  display_name: 500,     // Customer.DisplayName
  company_name: 50,      // Customer.CompanyName
  account_name: 100,     // Account.Name
  acct_num: 20,          // Account.AcctNum
  free_form_number: 30,  // TelephoneNumber.FreeFormNumber
  postal_code: 30,       // Address.PostalCode
  email_address: 100,    // EmailAddress.Address
  customer_memo: 1000,   // Invoice.CustomerMemo.value
  private_note: 4000,    // *.PrivateNote
  line_description: 4000,// Line.Description
} as const;

/** Full QBO AccountType enum (v3 schema docs) for Account validation. */
export const QBO_ACCOUNT_TYPES = [
  'Bank', 'Other Current Asset', 'Fixed Asset', 'Other Asset',
  'Accounts Receivable', 'Equity', 'Expense', 'Other Expense',
  'Cost of Goods Sold', 'Accounts Payable', 'Credit Card',
  'Long Term Liability', 'Other Current Liability', 'Liability',
  'Income', 'Other Income',
] as const;

/** US-company TaxCodeRef values on SalesItemLineDetail lines. */
export const QBO_US_TAX_CODES = { taxable: 'TAX', exempt: 'NON' } as const;

/** GL code series → QBO AccountType (glAccountAdminModel series parity). */
export const QBO_ACCOUNT_TYPE_BY_SERIES: Record<string, string> = {
  '4': 'Income',
  '5': 'Cost of Goods Sold',
};

/**
 * Function-action specification for the future `quickbooksExport` function.
 * direction: 'push' (local → QBO create), 'pull' (QBO query → local rows),
 * 'oauth' (Intuit OAuth2 handshake), 'local' (no QBO call). `credentials:
 * 'required'` actions return BLOCKED-CREDENTIALS until realm_id +
// refresh_token_ref exist. The orchestrator decides whether/when the
// function dir is created — this array is the spec it should implement.
 */
export const QBO_ACTION_SPEC: ReadonlyArray<{
  name: string;
  direction: 'push' | 'pull' | 'oauth' | 'local';
  doc_type: '' | QboDocType;
  entity: string;
  idempotent: boolean;
  credentials: 'required' | 'none';
  notes: string;
}> = [
  { name: 'status', direction: 'local', doc_type: '', entity: '', idempotent: true, credentials: 'none',
    notes: 'Connection + sync-ledger summary from settings — always works, no OAuth needed.' },
  { name: 'connect', direction: 'oauth', doc_type: '', entity: '', idempotent: false, credentials: 'required',
    notes: 'Intuit OAuth2 authorize/token exchange — writes realm_id + refresh_token_ref + connected_at. BLOCKED-CREDENTIALS today.' },
  { name: 'disconnect', direction: 'local', doc_type: '', entity: '', idempotent: true, credentials: 'none',
    notes: 'Clears realm_id/token refs/company fields; preserves sync_state for audit.' },
  { name: 'push_invoice', direction: 'push', doc_type: 'invoice', entity: 'Invoice', idempotent: true, credentials: 'required',
    notes: 'POST /invoice. Gate: status in posted set; void → record-level block. Dedupe by qboSyncKey.' },
  { name: 'push_customer', direction: 'push', doc_type: 'customer', entity: 'Customer', idempotent: true, credentials: 'required',
    notes: 'POST /customer. Dependency of invoice/payment CustomerRef — receipts land in customer_map.' },
  { name: 'push_payment', direction: 'push', doc_type: 'payment', entity: 'Payment', idempotent: true, credentials: 'required',
    notes: 'POST /payment w/ LinkedTxn → QBO invoice. Gate: recorded + positive amount; void/refunded/credit_memo blocked.' },
  { name: 'push_account', direction: 'push', doc_type: 'account', entity: 'IncomeAccount|COGSAccount', idempotent: true, credentials: 'required',
    notes: 'POST /account. Optional — normally accounts arrive via pull_accounts after a manual QBO-side setup.' },
  { name: 'pull_accounts', direction: 'pull', doc_type: 'account', entity: 'IncomeAccount|COGSAccount', idempotent: true, credentials: 'required',
    notes: 'GET /query select * from Account — fromQboAccount maps to local {code,name,parent_account,status}; receipts land in account_map.' },
  { name: 'dry_run', direction: 'local', doc_type: '' as '' | QboDocType, entity: 'any', idempotent: true, credentials: 'none',
    notes: 'dryRunEnvelope for any doc_type — produces + validates would_send without a wire call. Works unconnected.' },
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const clean = (v: unknown): string =>
  v === undefined || v === null ? '' : String(v).trim();

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const firstStr = (row: unknown, keys: string[]): string => {
  if (!isObj(row)) return '';
  for (const key of keys) {
    const v = clean(row[key]);
    if (v) return v;
  }
  return '';
};

// Loose numeric parse: accepts numbers and plain/decorated numeric strings;
// rejects letter-laden strings (accountingExportModel.looseNum parity).
const MONEYISH = /^\s*\$?\s*-?[\d,]*\.?\d+\s*%?\s*$/;
const looseNum = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = clean(v);
  if (!s || !MONEYISH.test(s)) return NaN;
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

const numOr = (v: unknown, fallback = 0): number => {
  const n = looseNum(v);
  return Number.isFinite(n) ? n : fallback;
};

// 'YYYY-MM-DD' — leading date prefix wins so ISO timestamps never shift days
// (same rule as accountingExportModel/taxLiabilityModel).
const toDay = (value: unknown): string => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  const s = clean(value);
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
};

const isDay = (v: unknown): boolean => /^\d{4}-\d{2}-\d{2}$/.test(clean(v));

// Deterministic FNV-1a (32-bit) → base36 — parity copy of
// digestBatchModel.stableHash / savedReportRunsModel.fnv1a. No crypto import:
// crypto.subtle is async; this is stable and sync everywhere.
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Dollars-ish → integer cents (round-half-away at the penny). */
export const qboToCents = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = looseNum(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Integer cents → clean wire dollars (exactly the number QBO expects). */
export const qboDollars = (cents: unknown): number => {
  const n = Number(cents);
  return Math.round(Number.isFinite(n) ? n : 0) / 100;
};

/** Dollar field → wire dollars, cent-exact (the ONLY money emitter). */
const wireDollars = (v: unknown): number => qboDollars(qboToCents(v));

// ---------------------------------------------------------------------------
// Reference resolution — all maps accept bare QBO id strings, {value|Id|id}
// objects, or local rows carrying a synced qbo id.
// ---------------------------------------------------------------------------

const refValue = (v: unknown): string => {
  if (typeof v === 'string' || typeof v === 'number') return clean(v);
  if (!isObj(v)) return '';
  return firstStr(v, ['value', 'Id', 'id', 'qbo_id', 'qboId', 'qbo_txn_id', 'txn_id']);
};

// QBO id on a LOCAL row — deliberately excludes plain 'id' (the local entity
// id is not a QBO Id). Reads only QBO-marked fields: qbo_id/qbo_txn_id (our
// sync receipts), Id/value (QBO-native rows).
const qboIdOf = (v: unknown): string => {
  if (!isObj(v)) return '';
  return firstStr(v, ['qbo_id', 'qboId', 'qbo_txn_id', 'txn_id', 'value', 'Id']);
};

const refName = (v: unknown): string => {
  if (!isObj(v)) return '';
  return firstStr(v, ['name', 'Name', 'display_name', 'DisplayName', 'company_name', 'label']);
};

/** Build a {value,name?} ref — value may be '' so validation can flag it. */
const ref = (value: unknown, name = ''): Record<string, unknown> => {
  const out: Record<string, unknown> = { value: clean(value) };
  const n = clean(name);
  if (n) out.name = n;
  return out;
};

/** Look a key up in a map (plain object, Map, or array of keyed rows). */
const mapGet = (map: unknown, key: unknown): unknown => {
  const k = clean(key);
  if (!k) return undefined;
  if (map instanceof Map) return map.get(k);
  if (Array.isArray(map)) {
    return map.find((r) => isObj(r) && (
      clean(r.id) === k || clean(r.key) === k || clean(r.code) === k || clean(r.local_id) === k
    ));
  }
  if (isObj(map)) return map[k];
  return undefined;
};

/** Resolve a QBO ref for a local id through opts maps + fallbacks. */
function resolveRef(opts: Record<string, unknown>, mapKeys: string[], localId: unknown, extra: unknown[] = []): { value: string; name: string } {
  for (const mk of mapKeys) {
    const hit = mapGet(opts[mk], localId);
    const v = refValue(hit);
    if (v) return { value: v, name: refName(hit) };
  }
  for (const candidate of extra) {
    const v = refValue(candidate);
    if (v) return { value: v, name: refName(candidate) };
  }
  return { value: '', name: '' };
}

// ---------------------------------------------------------------------------
// Settings — GlobalSettings 'qbo' singleton shape + connection gate.
// ---------------------------------------------------------------------------

export interface QboSettingsValue {
  realm_id: string;
  refresh_token_ref: string;
  access_token_ref: string;
  company_name: string;
  connected_at: string;
  last_sync_at: string;
  environment: 'sandbox' | 'production';
  minorversion: string;
  customer_map: Record<string, unknown>;
  account_map: Record<string, unknown>;
  item_map: Record<string, unknown>;
  method_map: Record<string, unknown>;
  sync_state: Record<string, unknown>;
}

/** Default (disconnected) setting_value. */
export function defaultQboSettings(): QboSettingsValue {
  return {
    realm_id: '',
    refresh_token_ref: '',
    access_token_ref: '',
    company_name: '',
    connected_at: '',
    last_sync_at: '',
    environment: 'sandbox',
    minorversion: QBO_API_MINOR_VERSION,
    customer_map: {},
    account_map: {},
    item_map: {},
    method_map: {},
    sync_state: {},
  };
}

/**
 * Documented storage shape — the row the function reads/writes via
 * globalSettingSingleton. field_docs describes each setting_value member so
 * settings UI and docs can render the contract without code.
 */
export function qboSettingsShape(): {
  setting_key: string;
  setting_value: QboSettingsValue;
  field_docs: Record<string, string>;
} {
  return {
    setting_key: QBO_SETTINGS_KEY,
    setting_value: defaultQboSettings(),
    field_docs: {
      realm_id: 'Intuit company/realm id from the OAuth2 callback — required to form any /v3/company/{realm} URL.',
      refresh_token_ref: 'REFERENCE (secret/env name) to the OAuth2 refresh token in the secret store — never the token itself.',
      access_token_ref: 'REFERENCE to a cached short-lived access token, when the wiring layer persists one.',
      company_name: 'QBO company display name for settings UI.',
      connected_at: 'ISO timestamp of the successful OAuth handshake.',
      last_sync_at: 'ISO timestamp of the last completed sync action.',
      environment: "'sandbox' | 'production' — selects QBO_ENVIRONMENTS base URL.",
      minorversion: 'QBO API minorversion pin sent as ?minorversion=.',
      customer_map: 'local Customer.id → QBO Customer Id (written by push_customer).',
      account_map: 'local GL code → QBO Account Id (written by pull_accounts / push_account).',
      item_map: 'local line/part key → QBO Item Id (SalesItemLineDetail.ItemRef).',
      method_map: 'local Payment.method → QBO PaymentMethod Id.',
      sync_state: "'<doc_type>:<local id>' → {key, qbo_id, synced_at, status} — push dedupe ledger keyed on qboSyncKey.",
    },
  };
}

/** Accepts a GlobalSettings row ({setting_value}), a bare value, or null. */
export function normalizeQboSettings(raw: unknown): QboSettingsValue {
  const base = defaultQboSettings();
  const v = isObj(raw) && isObj(raw.setting_value) ? raw.setting_value : (isObj(raw) ? raw : {});
  const env = clean(v.environment).toLowerCase();
  const map = (x: unknown): Record<string, unknown> => (isObj(x) ? { ...x } : {});
  return {
    ...base,
    realm_id: clean(v.realm_id),
    refresh_token_ref: clean(v.refresh_token_ref),
    access_token_ref: clean(v.access_token_ref),
    company_name: clean(v.company_name),
    connected_at: clean(v.connected_at),
    last_sync_at: clean(v.last_sync_at),
    environment: env === 'production' ? 'production' : 'sandbox',
    minorversion: clean(v.minorversion) || base.minorversion,
    customer_map: map(v.customer_map),
    account_map: map(v.account_map),
    item_map: map(v.item_map),
    method_map: map(v.method_map),
    sync_state: map(v.sync_state),
  };
}

export interface QboConnectionStatus {
  /** realm_id AND refresh_token_ref both present. */
  connected: boolean;
  environment: 'sandbox' | 'production';
  /** Missing setting fields blocking a live call. */
  missing: string[];
  /** True whenever a live call cannot run (the masterplan's [BLOCKED-CREDENTIALS]). */
  blocked: boolean;
  /** '' | 'BLOCKED-CREDENTIALS'. */
  blocked_reason: string;
  company_name: string;
  realm_id: string;
}

/** Connection gate — the ONLY place the credentials block is decided. */
export function qboConnectionStatus(settings: unknown): QboConnectionStatus {
  const s = normalizeQboSettings(settings);
  const missing: string[] = [];
  if (!s.realm_id) missing.push('realm_id');
  if (!s.refresh_token_ref) missing.push('refresh_token_ref');
  return {
    connected: missing.length === 0,
    environment: s.environment,
    missing,
    blocked: missing.length > 0,
    blocked_reason: missing.length > 0 ? QBO_BLOCK_CREDENTIALS : '',
    company_name: s.company_name,
    realm_id: s.realm_id,
  };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

const baseUrlFor = (environment: unknown): string =>
  QBO_ENVIRONMENTS[clean(environment).toLowerCase()] || QBO_ENVIRONMENTS.sandbox;

/**
 * Create-call endpoint for a doc type: POST /v3/company/{realm}/{doc}.
 * realmId may be a string or a settings object/row (resolved via normalize).
 */
export function qboEndpointFor(
  docType: unknown,
  realmId: unknown,
  opts: { environment?: unknown } = {},
): { method: string; path: string; url: string; environment: string } {
  const doc = clean(docType).toLowerCase();
  const realm = clean(isObj(realmId) ? normalizeQboSettings(realmId).realm_id : realmId);
  const env = clean(opts.environment).toLowerCase()
    || (isObj(realmId) ? normalizeQboSettings(realmId).environment : '')
    || 'sandbox';
  const path = `/v3/company/${realm || '<realm_id>'}/${doc}`;
  return {
    method: 'POST',
    path,
    url: `${baseUrlFor(env)}${path}`,
    environment: QBO_ENVIRONMENTS[env] ? env : 'sandbox',
  };
}

/**
 * pull_accounts endpoint: GET /v3/company/{realm}/query?query=...&minorversion=.
 * URL is encoded exactly as the wiring layer would issue it.
 */
export function qboPullAccountsEndpoint(
  realmId: unknown,
  opts: { environment?: unknown; minorversion?: unknown } = {},
): { method: string; path: string; url: string; environment: string } {
  const realm = clean(isObj(realmId) ? normalizeQboSettings(realmId).realm_id : realmId);
  const env = clean(opts.environment).toLowerCase()
    || (isObj(realmId) ? normalizeQboSettings(realmId).environment : '')
    || 'sandbox';
  const mv = clean(opts.minorversion) || QBO_API_MINOR_VERSION;
  const query = 'select * from Account';
  const path = `/v3/company/${realm || '<realm_id>'}/query`;
  return {
    method: 'GET',
    path,
    url: `${baseUrlFor(env)}${path}?query=${encodeURIComponent(query)}&minorversion=${encodeURIComponent(mv)}`,
    environment: QBO_ENVIRONMENTS[env] ? env : 'sandbox',
  };
}

// ---------------------------------------------------------------------------
// Address mapper — local billing_*/location_* → QBO *Addr (sparse emit).
// ---------------------------------------------------------------------------

function qboAddress(src: unknown, prefix: string): Record<string, unknown> | undefined {
  const s = isObj(src) ? src : {};
  const pick = (...keys: string[]) => firstStr(s, keys);
  const out: Record<string, unknown> = {};
  const set = (k: string, v: string) => { if (v) out[k] = v; };
  set('Line1', pick(`${prefix}address_1`, `${prefix}addr1`, `${prefix}line1`));
  set('Line2', pick(`${prefix}address_2`, `${prefix}addr2`, `${prefix}line2`));
  set('City', pick(`${prefix}city`));
  set('CountrySubDivisionCode', pick(`${prefix}state`, `${prefix}province`, `${prefix}region`));
  const zip = [pick(`${prefix}postal_code`, `${prefix}zip`), pick(`${prefix}postal_ext`, `${prefix}zip_ext`)]
    .filter(Boolean).join('-');
  set('PostalCode', zip);
  set('Country', pick(`${prefix}country`));
  return Object.keys(out).length ? out : undefined;
}

// ---------------------------------------------------------------------------
// Mappers — local entity row → QBO create body.
// ---------------------------------------------------------------------------

/** Invoice date chain: invoice_date → issue_date → date → created_date. */
export function qboInvoiceTxnDate(invoice: unknown): string {
  const inv = isObj(invoice) ? invoice : {};
  return toDay(firstStr(inv, ['invoice_date', 'issue_date', 'date', 'created_date']));
}

/** Payment date chain: paid_date → payment_date → date → created_date. */
export function qboPaymentTxnDate(payment: unknown): string {
  const p = isObj(payment) ? payment : {};
  return toDay(firstStr(p, ['paid_date', 'payment_date', 'date', 'created_date']));
}

const isTaxableLine = (line: unknown): boolean =>
  !(isObj(line) && (line.taxable === false || line.taxable === 'false' || line.taxable === 0));

const taxCodeRef = (taxable: boolean, opts: Record<string, unknown>): Record<string, unknown> => {
  const codes = isObj(opts.tax_codes) ? opts.tax_codes : {};
  const on = clean(codes.taxable) || QBO_US_TAX_CODES.taxable;
  const off = clean(codes.exempt) || QBO_US_TAX_CODES.exempt;
  return { value: taxable ? on : off };
};

/**
 * Resolve the ItemRef for one line. Chain: line's explicit item ref
 * (item_ref/qbo_item_id) → opts.account_item_map[income_account_code] →
 * opts.item_map[part key] → opts.default_item_ref → undefined (omitted —
 * QBO marks SalesItemLineDetail.ItemRef optional).
 */
function lineItemRef(line: unknown, opts: Record<string, unknown>): Record<string, unknown> | undefined {
  const l = isObj(line) ? line : {};
  const direct = refValue(l.item_ref ?? l.qbo_item_id ?? l.ItemRef);
  if (direct) return ref(direct, refName(l.item_ref ?? l.ItemRef));
  const acct = clean(l.income_account_code);
  if (acct) {
    const hit = mapGet(opts.account_item_map, acct);
    const v = refValue(hit);
    if (v) return ref(v, refName(hit));
  }
  for (const key of [l.part_key, l.part_id, l.partId, l.builder_part_id, l.catalog_part_id, l.part, l.sku, l.item_key, l.name]) {
    const k = clean(key);
    if (!k) continue;
    const hit = mapGet(opts.item_map, k);
    const v = refValue(hit);
    if (v) return ref(v, refName(hit));
  }
  const dflt = opts.default_item_ref;
  const dv = refValue(dflt);
  if (dv) return ref(dv, refName(dflt));
  return undefined;
}

/** One SalesItemLineDetail line for the wire (LineNum assigned by caller). */
function salesLine(amountCents: number, description: string, qty: number, unitPriceCents: number, taxable: boolean, opts: Record<string, unknown>, itemRef?: Record<string, unknown>): Record<string, unknown> {
  const detail: Record<string, unknown> = {
    Qty: qty,
    UnitPrice: qboDollars(unitPriceCents),
    TaxCodeRef: taxCodeRef(taxable, opts),
  };
  if (itemRef) detail.ItemRef = itemRef;
  const out: Record<string, unknown> = {
    Amount: qboDollars(amountCents),
    DetailType: 'SalesItemLineDetail',
    SalesItemLineDetail: detail,
  };
  if (description) out.Description = description;
  return out;
}

/** One DiscountLineDetail line (positive Amount, PercentBased:false). */
function discountLine(amountCents: number, opts: Record<string, unknown>, description = 'Discount', accountCode = ''): Record<string, unknown> {
  const detail: Record<string, unknown> = {
    PercentBased: false,
    Amount: qboDollars(Math.abs(amountCents)),
  };
  // DiscountAccountRef: the fee's own income_account_code → discount_account_map,
  // else the generic 'discount' slot, else the explicit ref.
  const acct = resolveRef(opts, ['discount_account_map'], accountCode || 'discount', [opts.discount_account_ref]);
  if (acct.value) detail.DiscountAccountRef = ref(acct.value, acct.name);
  const out: Record<string, unknown> = {
    Amount: qboDollars(Math.abs(amountCents)),
    DetailType: 'DiscountLineDetail',
    DiscountLineDetail: detail,
  };
  if (description) out.Description = description;
  return out;
}

export interface ToQboInvoiceOpts {
  /** {value|Id} ref or bare id — explicit CustomerRef wins the whole chain. */
  customer_ref?: unknown;
  /** local Customer.id → QBO Customer Id ({id:{value}} map, Map, or rows). */
  customer_map?: unknown;
  /** The local Customer row — enriches CustomerRef.name + BillAddr + BillEmail. */
  customer?: unknown;
  /** local part/line key → QBO Item Id. */
  item_map?: unknown;
  /** GL income code → QBO Item Id (higher priority than item_map). */
  account_item_map?: unknown;
  /** Fallback ItemRef ({value,name}) when nothing resolves. */
  default_item_ref?: unknown;
  /** {taxable:'TAX', exempt:'NON'} overrides. */
  tax_codes?: { taxable?: string; exempt?: string };
  /** {value|Id} SalesTermRef (terms is a label locally — only a ref emits). */
  sales_term_ref?: unknown;
  /** discount GL → QBO account id for DiscountAccountRef. */
  discount_account_map?: unknown;
  discount_account_ref?: unknown;
}

/**
 * Invoice → QBO Invoice create body (POST /v3/company/{realm}/invoice).
 * Emits DocNumber, TxnDate, DueDate, CustomerRef, Line[] (numbered 1..n),
 * CustomerMemo (from customer-facing `notes`), TxnTaxDetail {TotalTax},
 * BillAddr/BillEmail (when opts.customer supplied), GlobalTaxCalculation.
 * NEVER emits internal_notes or payment-application aggregates.
 */
export function toQboInvoice(invoice: unknown, opts: ToQboInvoiceOpts = {}): Record<string, unknown> {
  const inv = isObj(invoice) ? invoice : {};
  const o = opts as Record<string, unknown>;

  // CustomerRef: explicit → customer_map[customer_id] → opts.customer qbo_* fields.
  const cust = resolveRef(o, ['customer_map'], inv.customer_id, [
    o.customer_ref,
    { value: qboIdOf(o.customer), name: refName(o.customer) },
  ]);
  const custName = cust.name || firstStr(inv, ['customer_display_name', 'customer_name']);
  const payload: Record<string, unknown> = {
    CustomerRef: ref(cust.value, custName),
  };

  const docNumber = firstStr(inv, ['invoice_number', 'doc_number', 'number']);
  if (docNumber) payload.DocNumber = docNumber;
  const txn = qboInvoiceTxnDate(inv);
  if (txn) payload.TxnDate = txn;
  const due = toDay(inv.due_date);
  if (due) payload.DueDate = due;

  const note = clean(inv.notes); // customer-facing only — internal_notes never exported
  if (note) payload.CustomerMemo = { value: note.slice(0, QBO_FIELD_LIMITS.customer_memo) };
  payload.GlobalTaxCalculation = 'TaxExcluded';

  const term = refValue(o.sales_term_ref);
  if (term) payload.SalesTermRef = ref(term, refName(o.sales_term_ref));

  // --- Lines: line_items → non-discount fee_lines → discount lines --------
  const lines: Record<string, unknown>[] = [];
  const pushLine = (l: Record<string, unknown>) => {
    l.LineNum = lines.length + 1;
    lines.push(l);
  };

  const rawLines = Array.isArray(inv.line_items) ? inv.line_items : [];
  for (const row of rawLines) {
    if (!isObj(row)) continue;
    const qty = numOr(row.quantity, 0);
    const unitCents = qboToCents(row.unit_price ?? row.price ?? row.unit_cost);
    const amountCents = Math.round(qty * unitCents);
    const desc = firstStr(row, ['description', 'label', 'name', 'title']);
    pushLine(salesLine(amountCents, desc, qty, unitCents, isTaxableLine(row), o, lineItemRef(row, o)));
  }

  const fees = Array.isArray(inv.fee_lines) ? inv.fee_lines : [];
  for (const row of fees) {
    if (!isObj(row)) continue;
    if (clean(row.kind).toLowerCase() === 'discount') continue; // handled below
    const amountCents = qboToCents(row.amount);
    const desc = firstStr(row, ['label', 'description', 'name']) || 'Fee';
    const unitCents = amountCents; // Qty 1 fee line
    pushLine(salesLine(amountCents, desc, 1, unitCents, isTaxableLine(row), o, lineItemRef(row, o)));
  }
  for (const row of fees) {
    if (!isObj(row)) continue;
    if (clean(row.kind).toLowerCase() !== 'discount') continue;
    const amountCents = qboToCents(row.amount);
    if (!amountCents) continue;
    pushLine(discountLine(amountCents, o, firstStr(row, ['label', 'description']) || 'Discount', clean(row.income_account_code)));
  }
  const flatDiscount = qboToCents(inv.discount_amount);
  if (flatDiscount) pushLine(discountLine(flatDiscount, o));

  payload.Line = lines;

  const taxCents = qboToCents(inv.tax_amount);
  if (taxCents) {
    payload.TxnTaxDetail = { TotalTax: qboDollars(taxCents) };
  }

  // Enrichment from the local customer row (never required).
  const customer = isObj(o.customer) ? o.customer : undefined;
  if (customer) {
    const bill = qboAddress(customer, 'billing_');
    if (bill) payload.BillAddr = bill;
    const email = firstStr(customer, ['contact_email', 'email', 'billing_contact_email']);
    if (email) payload.BillEmail = { Address: email };
  }

  return payload;
}

export interface ToQboPaymentOpts {
  /** local Invoice.id → QBO invoice txn id ({value|Id} map or rows). */
  invoice_map?: unknown;
  /** Explicit invoice ref — wins the chain. */
  invoice_ref?: unknown;
  /** The local Invoice row (uses its synced qbo id fields if present). */
  invoice?: unknown;
  customer_ref?: unknown;
  customer_map?: unknown;
  customer?: unknown;
  /** local Payment.method → QBO PaymentMethod Id. */
  method_map?: unknown;
  /** Explicit deposit destination — wins over undeposited-funds default. */
  deposit_account_ref?: unknown;
  deposit_account_map?: unknown;
}

/**
 * Payment → QBO Payment create body (POST /v3/company/{realm}/payment).
 * Emits TotalAmt (cent-exact dollars), CustomerRef, TxnDate, PaymentRefNum
 * (reference_number), PrivateNote (gl_memo ONLY — notes never exported),
 * Line[0].LinkedTxn → {TxnId, TxnType:'Invoice'}, optional PaymentMethodRef
 * + DepositToAccountRef.
 */
export function toQboPayment(payment: unknown, opts: ToQboPaymentOpts = {}): Record<string, unknown> {
  const p = isObj(payment) ? payment : {};
  const o = opts as Record<string, unknown>;

  const cust = resolveRef(o, ['customer_map'], p.customer_id, [
    o.customer_ref,
    { value: qboIdOf(o.customer), name: refName(o.customer) },
  ]);
  const custName = cust.name || firstStr(isObj(o.invoice) ? o.invoice : {}, ['customer_display_name', 'customer_name']);
  const totalCents = qboToCents(p.amount);

  // LinkedTxn resolution order: invoice_map[invoice_id] → sync_state-style
  // 'invoice:<id>' key → explicit invoice_ref → local invoice row's qbo_*.
  let invRef = resolveRef(o, ['invoice_map'], p.invoice_id);
  if (!invRef.value) {
    const hit = mapGet(o.invoice_map, `invoice:${clean(p.invoice_id)}`);
    if (refValue(hit)) invRef = { value: refValue(hit), name: refName(hit) };
  }
  if (!invRef.value) {
    invRef = resolveRef(o, [], '', [
      o.invoice_ref,
      { value: qboIdOf(o.invoice), name: refName(o.invoice) },
    ]);
  }

  const payload: Record<string, unknown> = {
    TotalAmt: qboDollars(totalCents),
    CustomerRef: ref(cust.value, custName),
    Line: [
      {
        Amount: qboDollars(totalCents),
        LineNum: 1,
        LinkedTxn: [{ TxnId: invRef.value, TxnType: 'Invoice' }],
      },
    ],
  };

  const txn = qboPaymentTxnDate(p);
  if (txn) payload.TxnDate = txn;
  const refNum = firstStr(p, ['reference_number', 'reference', 'check_number', 'ref_number']);
  if (refNum) payload.PaymentRefNum = refNum.slice(0, QBO_FIELD_LIMITS.doc_number);
  const memo = clean(p.gl_memo); // the ONLY export-safe free text on Payment
  if (memo) payload.PrivateNote = memo.slice(0, QBO_FIELD_LIMITS.private_note);

  const method = clean(p.method).toLowerCase();
  if (method) {
    const hit = mapGet(o.method_map, method);
    const v = refValue(hit);
    if (v) payload.PaymentMethodRef = ref(v, refName(hit) || method);
  }
  const dep = resolveRef(o, ['deposit_account_map', 'account_map'], method || 'bank', [o.deposit_account_ref]);
  if (dep.value) payload.DepositToAccountRef = ref(dep.value, dep.name);

  return payload;
}

export interface ToQboCustomerOpts {
  /** Export the internal `notes` field into QBO Notes — default OFF (safe-column parity). */
  include_notes?: boolean;
  /** {value|Id} ParentRef for master-account sub-customers. */
  parent_ref?: unknown;
  /** {value|Id} SalesTermRef. */
  sales_term_ref?: unknown;
  /** {value|Id} PaymentMethodRef default. */
  payment_method_ref?: unknown;
}

/**
 * Customer → QBO Customer create body (POST /v3/company/{realm}/customer).
 * DisplayName is REQUIRED by QBO — emitted from company_name (the local
 * required field). BillAddr ← billing_*; ShipAddr ← location_* ONLY when
 * location_same_as_billing===false. Taxable = !tax_exempt.
 */
export function toQboCustomer(customer: unknown, opts: ToQboCustomerOpts = {}): Record<string, unknown> {
  const c = isObj(customer) ? customer : {};
  const o = opts as Record<string, unknown>;
  const display = firstStr(c, ['company_name', 'display_name', 'name']);

  const payload: Record<string, unknown> = {
    DisplayName: display,
  };
  if (display) payload.CompanyName = display.slice(0, QBO_FIELD_LIMITS.company_name);

  const given = firstStr(c, ['contact_first_name', 'first_name']);
  const family = firstStr(c, ['contact_last_name', 'last_name']);
  if (given) payload.GivenName = given;
  if (family) payload.FamilyName = family;

  const email = firstStr(c, ['contact_email', 'billing_contact_email', 'email']);
  if (email) payload.PrimaryEmailAddr = { Address: email.slice(0, QBO_FIELD_LIMITS.email_address) };
  const phone = firstStr(c, ['contact_office_phone', 'company_phone', 'phone']);
  if (phone) payload.PrimaryPhone = { FreeFormNumber: phone.slice(0, QBO_FIELD_LIMITS.free_form_number) };
  const mobile = firstStr(c, ['contact_cell_phone', 'cell_phone']);
  if (mobile) payload.Mobile = { FreeFormNumber: mobile.slice(0, QBO_FIELD_LIMITS.free_form_number) };
  const fax = firstStr(c, ['company_fax', 'fax']);
  if (fax) payload.Fax = { FreeFormNumber: fax.slice(0, QBO_FIELD_LIMITS.free_form_number) };
  const web = firstStr(c, ['website', 'web_site', 'url']);
  if (web) payload.WebAddr = { URI: web };

  const bill = qboAddress(c, 'billing_');
  if (bill) payload.BillAddr = bill;
  if (c.location_same_as_billing === false) {
    const ship = qboAddress(c, 'location_');
    if (ship) payload.ShipAddr = ship;
  }

  payload.Taxable = !(c.tax_exempt === true || clean(c.tax_exempt).toLowerCase() === 'true');
  payload.Active = c.is_active !== false;
  payload.Job = false;

  if (o.include_notes === true) {
    const notes = clean(c.notes);
    if (notes) payload.Notes = notes;
  }
  const parent = refValue(o.parent_ref);
  if (parent) {
    payload.ParentRef = ref(parent, refName(o.parent_ref));
    payload.Job = true; // QBO sub-customer = job under the parent
  }
  const term = refValue(o.sales_term_ref);
  if (term) payload.SalesTermRef = ref(term, refName(o.sales_term_ref));
  const pmt = refValue(o.payment_method_ref);
  if (pmt) payload.PaymentMethodRef = ref(pmt, refName(o.payment_method_ref));

  return payload;
}

export interface ToQboAccountOpts {
  /** 'income' | 'cogs' override — else resolved from entity name or code series. */
  kind?: unknown;
  /** Entity name the row came from ('IncomeAccount'|'COGSAccount'). */
  entity?: unknown;
  /** local GL code → QBO Account Id (for ParentRef). */
  account_map?: unknown;
  /** Explicit AccountType override (wins kind/series). */
  account_type?: unknown;
  /** AccountSubType passthrough (docs: e.g. 'SalesOfProductIncome'). */
  account_sub_type?: unknown;
}

/** GL kind → QBO AccountType ('income'→'Income', 'cogs'→'Cost of Goods Sold'). */
export function qboAccountTypeFor(input: unknown): string {
  const s = clean(input).toLowerCase();
  if (s === 'income' || s === 'incomeaccount') return 'Income';
  if (s === 'cogs' || s === 'cogsaccount' || s === 'cost of goods sold') return 'Cost of Goods Sold';
  const digit = clean(input)[0];
  return QBO_ACCOUNT_TYPE_BY_SERIES[digit] || '';
}

/**
 * IncomeAccount/COGSAccount row → QBO Account create body.
 * Name ← account.name (fallback: code); AcctNum ← code; AccountType ←
 * kind/entity/4-5 series; Active ← status!=='inactive'; ParentRef resolves
 * the stored parent_account CODE through opts.account_map.
 */
export function toQboAccount(account: unknown, opts: ToQboAccountOpts = {}): Record<string, unknown> {
  const a = isObj(account) ? account : {};
  const o = opts as Record<string, unknown>;
  const code = firstStr(a, ['code', 'account_number', 'account_code', 'gl_account_code', 'number']);
  const name = firstStr(a, ['name', 'account_name', 'display_name', 'label']) || code;

  const type = clean(o.account_type)
    || qboAccountTypeFor(o.kind)
    || qboAccountTypeFor(o.entity)
    || qboAccountTypeFor(code);

  const payload: Record<string, unknown> = {
    Name: name.slice(0, QBO_FIELD_LIMITS.account_name),
    AccountType: type,
  };
  if (code) payload.AcctNum = code.slice(0, QBO_FIELD_LIMITS.acct_num);
  const sub = clean(o.account_sub_type ?? a.account_sub_type);
  if (sub) payload.AccountSubType = sub;
  payload.Active = clean(a.status).toLowerCase() !== 'inactive';

  const parentCode = firstStr(a, ['parent_account', 'parent_code', 'parent_account_code']);
  if (parentCode) {
    const hit = mapGet(o.account_map, parentCode);
    const v = refValue(hit);
    if (v) payload.ParentRef = ref(v, refName(hit));
  }
  const desc = firstStr(a, ['description']);
  if (desc) payload.Description = desc;
  return payload;
}

/**
 * QBO Account entity → local chart row (pull_accounts direction).
 * Returns {code, name, parent_account, status, kind, qbo_id, sync_token}.
 * ParentRef resolves back to a local code via opts.accountsById
 * ({qbo_id → local row|code}).
 */
export function fromQboAccount(qbo: unknown, opts: { accountsById?: unknown } = {}): Record<string, unknown> {
  const q = isObj(qbo) ? qbo : {};
  const code = firstStr(q, ['AcctNum', 'acct_num']);
  const name = firstStr(q, ['Name', 'name']);
  const type = firstStr(q, ['AccountType', 'account_type']);
  const kind = type === 'Income' || type === 'Other Income'
    ? 'income'
    : (type === 'Cost of Goods Sold' ? 'cogs' : '');
  let parentAccount = '';
  const parentRef = isObj(q.ParentRef) ? q.ParentRef : undefined;
  if (parentRef) {
    const pid = refValue(parentRef);
    const hit = mapGet(opts.accountsById, pid);
    parentAccount = firstStr(hit, ['code', 'AcctNum']) || clean(hit);
  }
  return {
    code,
    name,
    parent_account: parentAccount,
    status: q.Active === false ? 'inactive' : 'active',
    kind,
    qbo_id: refValue(q.Id || q.id),
    sync_token: clean(q.SyncToken),
    account_type: type,
    account_sub_type: firstStr(q, ['AccountSubType']),
  };
}

// ---------------------------------------------------------------------------
// buildQboPayload — doc-type dispatcher.
// ---------------------------------------------------------------------------

/**
 * buildQboPayload(docType, record, opts) → the exact JSON body the QBO
 * create call would take (or null for an unknown doc type).
 */
export function buildQboPayload(
  docType: unknown,
  record: unknown,
  opts: Record<string, unknown> = {},
): Record<string, unknown> | null {
  const doc = clean(docType).toLowerCase();
  switch (doc) {
    case 'invoice': return toQboInvoice(record, opts);
    case 'payment': return toQboPayment(record, opts);
    case 'customer': return toQboCustomer(record, opts);
    case 'account': return toQboAccount(record, opts);
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// validateQboPayload — QBO schema-doc gate.
// ---------------------------------------------------------------------------

export interface QboValidationError {
  /** Dotted field path, e.g. 'CustomerRef.value' or 'Line[2].Amount'. */
  field: string;
  /** 'required' | 'type' | 'format' | 'too_long' | 'enum' | 'range' | 'duplicate' | 'total_mismatch' | 'doc_type'. */
  code: string;
  message: string;
}

export interface QboValidationResult {
  ok: boolean;
  doc_type: string;
  errors: QboValidationError[];
}

const verr = (field: string, code: string, message: string): QboValidationError =>
  ({ field, code, message });

const finite = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
const intGe1 = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 1;

function validateRef(errors: QboValidationError[], field: string, r: unknown, { requireValue = true } = {}): void {
  if (!isObj(r)) {
    errors.push(verr(field, 'required', `${field} must be an object {value, name?}.`));
    return;
  }
  if (requireValue && !clean(r.value)) {
    errors.push(verr(`${field}.value`, 'required', `${field}.value is required (the QBO Id).`));
  }
  if (r.value !== undefined && typeof r.value !== 'string' && typeof r.value !== 'number') {
    errors.push(verr(`${field}.value`, 'type', `${field}.value must be a string/number.`));
  }
}

function maxLen(errors: QboValidationError[], field: string, v: unknown, max: number, required = false): void {
  const s = clean(v);
  if (!s) {
    if (required) errors.push(verr(field, 'required', `${field} is required.`));
    return;
  }
  if (s.length > max) {
    errors.push(verr(field, 'too_long', `${field} is ${s.length} chars — QBO limit is ${max}.`));
  }
}

function dayField(errors: QboValidationError[], field: string, v: unknown): void {
  if (v === undefined || v === null || v === '') return;
  if (!isDay(v)) errors.push(verr(field, 'format', `${field} must be 'YYYY-MM-DD'.`));
}

function validateLines(errors: QboValidationError[], payload: Record<string, unknown>): void {
  const lines = payload.Line;
  if (!Array.isArray(lines) || lines.length === 0) {
    errors.push(verr('Line', 'required', 'Line must be a non-empty array.'));
    return;
  }
  const seenNums = new Set<number>();
  lines.forEach((l, i) => {
    const f = `Line[${i}]`;
    if (!isObj(l)) {
      errors.push(verr(f, 'type', `${f} must be an object.`));
      return;
    }
    if (!finite(l.Amount)) {
      errors.push(verr(`${f}.Amount`, 'required', `${f}.Amount must be a finite number (dollars).`));
    }
    const dt = clean(l.DetailType);
    if (!dt) {
      errors.push(verr(`${f}.DetailType`, 'required', `${f}.DetailType is required.`));
    } else if (dt === 'SalesItemLineDetail') {
      const d = l.SalesItemLineDetail;
      if (!isObj(d)) {
        errors.push(verr(`${f}.SalesItemLineDetail`, 'required', `${f}.SalesItemLineDetail is required for DetailType 'SalesItemLineDetail'.`));
      } else {
        if (!finite(d.Qty)) errors.push(verr(`${f}.SalesItemLineDetail.Qty`, 'required', `${f}.SalesItemLineDetail.Qty must be a finite number.`));
        if (!finite(d.UnitPrice)) errors.push(verr(`${f}.SalesItemLineDetail.UnitPrice`, 'required', `${f}.SalesItemLineDetail.UnitPrice must be a finite number.`));
        if (d.ItemRef !== undefined) validateRef(errors, `${f}.SalesItemLineDetail.ItemRef`, d.ItemRef);
        if (d.TaxCodeRef !== undefined) validateRef(errors, `${f}.SalesItemLineDetail.TaxCodeRef`, d.TaxCodeRef);
      }
    } else if (dt === 'DiscountLineDetail') {
      const d = l.DiscountLineDetail;
      if (!isObj(d)) {
        errors.push(verr(`${f}.DiscountLineDetail`, 'required', `${f}.DiscountLineDetail is required for DetailType 'DiscountLineDetail'.`));
      } else {
        if (!finite(d.Amount) || (d.Amount as number) <= 0) {
          errors.push(verr(`${f}.DiscountLineDetail.Amount`, 'range', 'Discount Amount must be a positive number.'));
        }
      }
    } else if (dt === 'SubTotalLineDetail') {
      // legal grouping line — nothing required
    } else {
      errors.push(verr(`${f}.DetailType`, 'enum', `${f}.DetailType '${dt}' is not a documented invoice line type.`));
    }
    if (l.LineNum !== undefined) {
      if (!intGe1(l.LineNum)) {
        errors.push(verr(`${f}.LineNum`, 'type', `${f}.LineNum must be an integer ≥ 1.`));
      } else if (seenNums.has(l.LineNum as number)) {
        errors.push(verr(`${f}.LineNum`, 'duplicate', `${f}.LineNum ${l.LineNum} is duplicated.`));
      } else {
        seenNums.add(l.LineNum as number);
      }
    }
    maxLen(errors, `${f}.Description`, l.Description, QBO_FIELD_LIMITS.line_description);
  });
}

function validateInvoice(errors: QboValidationError[], p: Record<string, unknown>): void {
  validateRef(errors, 'CustomerRef', p.CustomerRef);
  validateLines(errors, p);
  maxLen(errors, 'DocNumber', p.DocNumber, QBO_FIELD_LIMITS.doc_number);
  dayField(errors, 'TxnDate', p.TxnDate);
  dayField(errors, 'DueDate', p.DueDate);
  if (p.TxnTaxDetail !== undefined) {
    if (!isObj(p.TxnTaxDetail)) {
      errors.push(verr('TxnTaxDetail', 'type', 'TxnTaxDetail must be an object.'));
    } else if (!finite(p.TxnTaxDetail.TotalTax) || (p.TxnTaxDetail.TotalTax as number) < 0) {
      errors.push(verr('TxnTaxDetail.TotalTax', 'range', 'TxnTaxDetail.TotalTax must be a finite number ≥ 0.'));
    }
  }
  if (p.CustomerMemo !== undefined) {
    if (!isObj(p.CustomerMemo)) errors.push(verr('CustomerMemo', 'type', 'CustomerMemo must be {value}.'));
    else maxLen(errors, 'CustomerMemo.value', p.CustomerMemo.value, QBO_FIELD_LIMITS.customer_memo);
  }
  maxLen(errors, 'PrivateNote', p.PrivateNote, QBO_FIELD_LIMITS.private_note);
  if (p.BillAddr !== undefined && !isObj(p.BillAddr)) {
    errors.push(verr('BillAddr', 'type', 'BillAddr must be an object.'));
  }
}

function validatePayment(errors: QboValidationError[], p: Record<string, unknown>): void {
  if (!finite(p.TotalAmt) || (p.TotalAmt as number) <= 0) {
    errors.push(verr('TotalAmt', 'required', 'TotalAmt is required and must be > 0 (refunds/credit memos are different QBO docs).'));
  }
  validateRef(errors, 'CustomerRef', p.CustomerRef);
  dayField(errors, 'TxnDate', p.TxnDate);
  maxLen(errors, 'PaymentRefNum', p.PaymentRefNum, QBO_FIELD_LIMITS.doc_number);
  maxLen(errors, 'PrivateNote', p.PrivateNote, QBO_FIELD_LIMITS.private_note);

  const lines = p.Line;
  if (!Array.isArray(lines) || lines.length === 0) {
    errors.push(verr('Line', 'required', 'Line must be a non-empty array of linked-txn rows.'));
  } else {
    let sum = 0;
    lines.forEach((l, i) => {
      const f = `Line[${i}]`;
      if (!isObj(l)) {
        errors.push(verr(f, 'type', `${f} must be an object.`));
        return;
      }
      if (!finite(l.Amount) || (l.Amount as number) <= 0) {
        errors.push(verr(`${f}.Amount`, 'range', `${f}.Amount must be a positive number.`));
      } else {
        sum += l.Amount as number;
      }
      const linked = l.LinkedTxn;
      if (!Array.isArray(linked) || linked.length === 0) {
        errors.push(verr(`${f}.LinkedTxn`, 'required', `${f}.LinkedTxn must be a non-empty array.`));
      } else {
        linked.forEach((t, j) => {
          const tf = `${f}.LinkedTxn[${j}]`;
          if (!isObj(t)) {
            errors.push(verr(tf, 'type', `${tf} must be an object.`));
            return;
          }
          if (!clean(t.TxnId)) errors.push(verr(`${tf}.TxnId`, 'required', `${tf}.TxnId is required (the QBO invoice Id).`));
          if (clean(t.TxnType) !== 'Invoice') errors.push(verr(`${tf}.TxnType`, 'enum', `${tf}.TxnType must be 'Invoice'.`));
        });
      }
    });
    if (finite(p.TotalAmt) && Math.round(sum * 100) !== Math.round((p.TotalAmt as number) * 100)) {
      errors.push(verr('TotalAmt', 'total_mismatch', `Σ Line.Amount (${qboDollars(Math.round(sum * 100))}) must equal TotalAmt (${p.TotalAmt}).`));
    }
  }
  if (p.DepositToAccountRef !== undefined) validateRef(errors, 'DepositToAccountRef', p.DepositToAccountRef);
  if (p.PaymentMethodRef !== undefined) validateRef(errors, 'PaymentMethodRef', p.PaymentMethodRef);
}

function validateCustomer(errors: QboValidationError[], p: Record<string, unknown>): void {
  maxLen(errors, 'DisplayName', p.DisplayName, QBO_FIELD_LIMITS.display_name, true);
  maxLen(errors, 'CompanyName', p.CompanyName, QBO_FIELD_LIMITS.company_name);
  if (p.PrimaryEmailAddr !== undefined) {
    if (!isObj(p.PrimaryEmailAddr)) {
      errors.push(verr('PrimaryEmailAddr', 'type', 'PrimaryEmailAddr must be {Address}.'));
    } else {
      maxLen(errors, 'PrimaryEmailAddr.Address', p.PrimaryEmailAddr.Address, QBO_FIELD_LIMITS.email_address);
    }
  }
  for (const f of ['PrimaryPhone', 'Mobile', 'Fax'] as const) {
    if (p[f] !== undefined) {
      if (!isObj(p[f])) errors.push(verr(f, 'type', `${f} must be {FreeFormNumber}.`));
      else maxLen(errors, `${f}.FreeFormNumber`, (p[f] as Record<string, unknown>).FreeFormNumber, QBO_FIELD_LIMITS.free_form_number);
    }
  }
  for (const f of ['BillAddr', 'ShipAddr'] as const) {
    if (p[f] !== undefined) {
      if (!isObj(p[f])) errors.push(verr(f, 'type', `${f} must be an object.`));
      else maxLen(errors, `${f}.PostalCode`, (p[f] as Record<string, unknown>).PostalCode, QBO_FIELD_LIMITS.postal_code);
    }
  }
  if (p.Taxable !== undefined && typeof p.Taxable !== 'boolean') {
    errors.push(verr('Taxable', 'type', 'Taxable must be a boolean.'));
  }
  if (p.Active !== undefined && typeof p.Active !== 'boolean') {
    errors.push(verr('Active', 'type', 'Active must be a boolean.'));
  }
  if (p.ParentRef !== undefined) validateRef(errors, 'ParentRef', p.ParentRef);
}

function validateAccount(errors: QboValidationError[], p: Record<string, unknown>): void {
  maxLen(errors, 'Name', p.Name, QBO_FIELD_LIMITS.account_name, true);
  const t = clean(p.AccountType);
  if (!t) {
    errors.push(verr('AccountType', 'required', 'AccountType is required.'));
  } else if (!(QBO_ACCOUNT_TYPES as readonly string[]).includes(t)) {
    errors.push(verr('AccountType', 'enum', `AccountType '${t}' is not a documented QBO account type.`));
  }
  maxLen(errors, 'AcctNum', p.AcctNum, QBO_FIELD_LIMITS.acct_num);
  if (p.Active !== undefined && typeof p.Active !== 'boolean') {
    errors.push(verr('Active', 'type', 'Active must be a boolean.'));
  }
  if (p.ParentRef !== undefined) validateRef(errors, 'ParentRef', p.ParentRef);
}

/**
 * validateQboPayload(docType, payload) — the schema-doc gate the wiring
 * layer MUST pass before a live send. Checks required fields, types,
 * formats, documented length caps, and line-level invariants.
 */
export function validateQboPayload(docType: unknown, payload: unknown): QboValidationResult {
  const doc = clean(docType).toLowerCase();
  const errors: QboValidationError[] = [];
  if (!(QBO_DOC_TYPES as readonly string[]).includes(doc)) {
    return { ok: false, doc_type: doc, errors: [verr('doc_type', 'doc_type', `Unknown QBO doc type '${doc}'.`)] };
  }
  if (!isObj(payload)) {
    return { ok: false, doc_type: doc, errors: [verr('payload', 'type', 'Payload must be an object.')] };
  }
  if (doc === 'invoice') validateInvoice(errors, payload);
  else if (doc === 'payment') validatePayment(errors, payload);
  else if (doc === 'customer') validateCustomer(errors, payload);
  else if (doc === 'account') validateAccount(errors, payload);
  return { ok: errors.length === 0, doc_type: doc, errors };
}

// ---------------------------------------------------------------------------
// Idempotency — record-stamp hash + sync keys + receipts.
// ---------------------------------------------------------------------------

const recordId = (record: unknown): string =>
  firstStr(record, ['id', '_id', 'record_id', 'entity_id']);

const recordStamp = (record: unknown): string =>
  firstStr(record, ['updated_date', 'modified_date', 'last_modified', 'created_date', 'created_at']);

/** FNV-1a hash of '<id>|<updated_date-or-created_date>' — the change token. */
export function qboRecordHash(record: unknown): string {
  const r = isObj(record) ? record : {};
  return fnv1a(`${recordId(r)}|${recordStamp(r)}`);
}

/**
 * qboSyncKey(action, record) — stable dedupe key:
 *   'qbo:<action>:<doc_type>:<record id>:h<fnv(id|updated_date)>'
 * Same stored row → same key (retries short-circuit). Any update moves
 * updated_date → new key → re-push. Keyed on record id + updated_date hash
 * per the I-09 spec.
 */
export function qboSyncKey(action: unknown, record: unknown, opts: { doc_type?: unknown } = {}): string {
  const a = clean(action).toLowerCase();
  const doc = clean(opts.doc_type).toLowerCase()
    || a.replace(/^(push|pull)_/, '').replace(/s$/, '') // push_invoice→invoice, pull_accounts→account
    || 'record';
  const id = recordId(record) || 'noid';
  return `qbo:${a}:${doc}:${id}:h${qboRecordHash(record)}`;
}

/** sync_state ledger key for one record: '<doc_type>:<local id>'. */
export function qboSyncStateKey(docType: unknown, record: unknown): string {
  return `${clean(docType).toLowerCase()}:${recordId(record) || 'noid'}`;
}

/**
 * Read the stored sync receipt for a record (settings may be a row or bare
 * value). Returns {key, qbo_id, synced_at, status} or null.
 */
export function qboSyncReceipt(settings: unknown, docType: unknown, record: unknown): Record<string, unknown> | null {
  const s = normalizeQboSettings(settings);
  const hit = mapGet(s.sync_state, qboSyncStateKey(docType, record));
  return isObj(hit) ? hit : null;
}

/**
 * alreadySynced(settings, action, docType, record) — true when the stored
 * receipt key equals the record's CURRENT sync key (row untouched since the
 * last push). The wiring layer's dedupe gate.
 */
export function qboAlreadySynced(settings: unknown, action: unknown, docType: unknown, record: unknown): boolean {
  const receipt = qboSyncReceipt(settings, docType, record);
  if (!receipt) return false;
  return clean(receipt.key) === qboSyncKey(action, record, { doc_type: docType });
}

/**
 * Build the sync_state receipt a successful push stores:
 * {key, qbo_id, synced_at, status:'synced'}.
 */
export function qboSyncReceiptFor(
  action: unknown,
  docType: unknown,
  record: unknown,
  opts: { qbo_id?: unknown; synced_at?: unknown; status?: unknown } = {},
): Record<string, unknown> {
  return {
    key: qboSyncKey(action, record, { doc_type: docType }),
    qbo_id: clean(opts.qbo_id),
    synced_at: clean(opts.synced_at),
    status: clean(opts.status) || 'synced',
  };
}

// ---------------------------------------------------------------------------
// Record-level push gates (independent of payload validation).
// ---------------------------------------------------------------------------

const POSTED_INVOICE = new Set(['sent', 'partially_paid', 'paid', 'partial', 'issued']);

/**
 * pushBlockReason(docType, record) → '' when the record is pushable, else a
 * machine reason. Record-level gate: complements payload validation (which
 * checks WIRE shape; this checks BUSINESS state).
 *   invoice — 'not_posted' (draft/unknown), 'status_void' (void needs a
 *             QBO void/delete call, not create)
 *   payment — 'status_void' | 'status_refunded' | 'non_positive_amount'
 *             (negative rows + credit memos are QBO RefundReceipt/CreditMemo
 *             docs — out of scope) | 'missing_invoice_id'
 *   customer — 'missing_display_name' | 'merged' (merged_into_customer_id)
 *   account — 'missing_code' | 'missing_name' | 'unmapped_account_type'
 */
export function pushBlockReason(docType: unknown, record: unknown): string {
  const doc = clean(docType).toLowerCase();
  const r = isObj(record) ? record : {};
  if (doc === 'invoice') {
    const status = clean(r.status).toLowerCase();
    if (status === 'void') return 'status_void';
    if (!POSTED_INVOICE.has(status)) return 'not_posted';
    return '';
  }
  if (doc === 'payment') {
    const status = clean(r.status).toLowerCase();
    if (status === 'void') return 'status_void';
    if (status === 'refunded') return 'status_refunded';
    if (clean(r.method).toLowerCase() === 'credit_memo') return 'credit_memo_doc';
    if (qboToCents(r.amount) <= 0) return 'non_positive_amount';
    if (!clean(r.invoice_id)) return 'missing_invoice_id';
    return '';
  }
  if (doc === 'customer') {
    if (clean(r.merged_into_customer_id)) return 'merged';
    if (!firstStr(r, ['company_name', 'display_name', 'name'])) return 'missing_display_name';
    return '';
  }
  if (doc === 'account') {
    if (!firstStr(r, ['code', 'account_number', 'account_code', 'gl_account_code', 'number'])) return 'missing_code';
    if (!firstStr(r, ['name', 'account_name', 'display_name', 'label', 'code'])) return 'missing_name';
    if (!qboAccountTypeFor(r.code)) return 'unmapped_account_type';
    return '';
  }
  return 'unknown_doc_type';
}

// ---------------------------------------------------------------------------
// Dry-run envelope — the masterplan's testable core.
// ---------------------------------------------------------------------------

export interface QboDryRunEnvelope {
  mode: 'dry-run';
  action: string;
  doc_type: string;
  entity: string;
  record_id: string;
  idempotency_key: string;
  endpoint: { method: string; path: string; url: string; environment: string };
  realm_id: string;
  /** The exact JSON body a live create call would post. */
  would_send: Record<string, unknown> | null;
  /** validateQboPayload result for would_send. */
  validation: QboValidationResult;
  /** Record-level push gate ('' = clear). */
  push_blocked: string;
  /** Credentials gate — {blocked:true, reason:'BLOCKED-CREDENTIALS'} until OAuth. */
  credentials: { blocked: boolean; reason: string; missing: string[] };
  /** True only when the record could go live NOW (valid + unblocked + connected). */
  sendable: boolean;
}

/**
 * dryRunEnvelope(docType, record, opts) — builds the payload a live call
 * WOULD send, validates it, and wraps it with endpoint + idempotency +
 * credential status. Never performs I/O. opts:
 *   settings   — GlobalSettings row/value (realm_id, environment, maps —
 *                  customer_map/item_map/account_map/method_map feed the
 *                  mappers; sync_state doubles as invoice_map for LinkedTxn)
 *   action     — override the push action name (default 'push_<docType>')
 *   maps…      — every mapper option passthrough (explicit opts win over
 *                  the settings maps, per key)
 */
export function dryRunEnvelope(
  docType: unknown,
  record: unknown,
  opts: Record<string, unknown> = {},
): QboDryRunEnvelope {
  const doc = clean(docType).toLowerCase() as QboDocType;
  const settings = normalizeQboSettings(opts.settings);
  const action = clean(opts.action).toLowerCase() || `push_${doc}`;

  // Mapper opts merge: explicit opts win per key, else fall back to the
  // settings maps. invoice_map defaults to sync_state — stored push receipts
  // carry qbo_id, so a pushed invoice resolves its own LinkedTxn.
  const merged: Record<string, unknown> = {
    customer_map: settings.customer_map,
    item_map: settings.item_map,
    account_item_map: undefined,
    account_map: settings.account_map,
    method_map: settings.method_map,
    invoice_map: settings.sync_state,
    ...opts,
  };
  const payload = buildQboPayload(doc, record, merged);

  // Mapper opts merge: explicit opts win, else fall back to settings maps.
  const validation = validateQboPayload(doc, payload);
  const blocked = pushBlockReason(doc, record);
  const conn = qboConnectionStatus(settings);
  const endpoint = doc === 'account' && action === 'pull_accounts'
    ? qboPullAccountsEndpoint(settings, opts)
    : qboEndpointFor(doc, settings, opts);

  return {
    mode: 'dry-run',
    action,
    doc_type: doc,
    entity: QBO_ENTITY_FOR_DOC[doc] || '',
    record_id: recordId(record),
    idempotency_key: qboSyncKey(action, record, { doc_type: doc }),
    endpoint,
    realm_id: settings.realm_id,
    would_send: payload,
    validation,
    push_blocked: blocked,
    credentials: { blocked: conn.blocked, reason: conn.blocked_reason, missing: conn.missing },
    sendable: validation.ok && !blocked && !conn.blocked,
  };
}
