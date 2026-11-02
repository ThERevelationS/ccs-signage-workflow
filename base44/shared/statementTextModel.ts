// Customizable statement text — ESTIMATOR_MASTERPLAN WS-I / item I-11.
// Pure TS, ZERO imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike, same contract as
// statementBatchModel / emailSettingsModel / delivery.
//
// What this model owns: the OPERATOR-EDITABLE wordage on a customer
// statement — the header blurb, footer, terms block, aging note and the
// remit-to address lines — plus the two layout toggles that decide whether
// the payment-detail ledger and the aging bucket strip print at all.
// Everything else on a statement (open items, aging math, roll-forward
// totals) belongs to statementBatchModel / statementModel and never
// passes through here.
//
// Storage spec (I-11 adds this block — GlobalSettings.jsonc declaration is
// orchestrator work):
//   Canonical home: a GlobalSettings KV row
//     { setting_key: 'statementSettings', setting_value: { ...slice... } }
//   mirroring the emailDelivery (A-21) convention. GlobalSettings is
//   backend-only RLS — reads/writes go through a session-authed function
//   (globalSettingSingleton CAS save); this model only normalizes the
//   slice. normalizeStatementSettings accepts every carrier form the
//   codebase already produces (same accept-list as emailSettingsModel):
//     * the slice itself            { header_text: '…', remit_to: [...] }
//     * a flat settings row         { statementSettings: { … } }
//     * a KV settings row           { setting_key: 'statementSettings',
//                                    setting_value: { … } }
//     * a KV blob carrier           { setting_value: { statementSettings: {…} } }
//     * alias blocks                statement_settings / statementText /
//                                   statement_text — layered last, they win.
//
// Canonical slice shape (the `statementSettings` object):
//   header_text          — intro line under the shop block
//   footer_text          — closing line above the remittance stub
//   terms_text           — payment-terms sentence
//   aging_note           — caption printed under the aging buckets
//   remit_to             — string[] remit-to address lines (a string with
//                          newlines/semicolons also normalizes)
//   show_payment_detail  — bool; print the per-payment activity ledger
//   show_aging_buckets   — bool; print the aging strip
//
// Merge precedence (renderStatementText / mergeStatementText):
//   statement-level overrides  >  GlobalSettings slice  >  built-in defaults
//   * Text fields: the first NON-BLANK layer wins; a literal `false`
//     suppresses the block entirely (renders '') — that is the only way to
//     print nothing where a default exists. Blank strings fall through, so
//     clearing the settings textarea restores the default (standard
//     "leave empty for default" settings-UX).
//   * remit_to: the first layer where the key is PRESENT wins (array or
//     string — a present [] is a deliberate "no remit lines"); absent keys
//     fall through. Built-in default is [] (no remit block).
//   * toggles: the first layer carrying a literal boolean wins; anything
//     else falls through. Both default true.
//
// Template tokens — {{token}} with optional inner whitespace. Registered:
//   {{company_name}}  — the ISSUING shop name (company/shop lanes on the
//                       context; see statementTokenValues — a batch
//                       context's top-level company_name is the CUSTOMER
//                       and is never read for this token).
//   {{customer_name}} — the billed customer (explicit lane; batch-context
//                       company_name lands here, not on company_name).
//   {{period_start}} / {{period_end}} / {{period_label}} — 'YYYY-MM-DD' and
//                       'October 2026' from the statement period.
//   {{as_of}}         — as-of date (context.as_of / asOf).
//   {{balance_due}}   — formatted money: strings pass verbatim; numbers in
//                       balance_due/balance are DOLLARS (entity/frontend
//                       convention); numbers in balance_due_cents or
//                       closing_balance are INTEGER CENTS (shared-model
//                       convention, N-05.2).
//   {{remit_to}}      — the resolved remit lines joined with '\n'.
// A registered token with no value renders '' and is recorded in
// missing_tokens. UNREGISTERED {{tokens}} stay literal — statement text is
// authored once and reused inside downstream templates (monthly_statement
// carries {{customer.payment_url}}-style placeholders for the H-03
// renderer); blank-eating them here would corrupt that pipeline. Remit
// lines substitute every token EXCEPT remit_to itself (self-reference
// resolves '').
//
// API:
//   STATEMENT_SETTINGS_KEY / STATEMENT_SETTINGS_ALIAS_KEYS
//   STATEMENT_TEXT_FIELDS / STATEMENT_TOGGLE_FIELDS / STATEMENT_TOKENS
//   STATEMENT_TEXT_DEFAULTS
//   normalizeStatementSettings(raw)            — slice from any carrier
//   mergeStatementText(settings, overrides)    — resolved raw fields + sources
//   statementTokenValues(context, resolved?)   — token map for a context
//   applyStatementTokens(text, tokens)         — {text, missing}
//   renderStatementText(settings, overrides, context)
//                                              — full resolved block set

const clean = (v: any) => String(v ?? '').trim();
const isObj = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);

export const STATEMENT_SETTINGS_KEY = 'statementSettings';
export const STATEMENT_SETTINGS_ALIAS_KEYS = [
  'statement_settings',
  'statementText',
  'statement_text',
] as const;
const STATEMENT_KEY_SET = new Set<string>([
  STATEMENT_SETTINGS_KEY,
  ...STATEMENT_SETTINGS_ALIAS_KEYS,
]);

// Operator-editable text blocks (header order on the printed statement).
export const STATEMENT_TEXT_FIELDS = [
  'header_text',
  'footer_text',
  'terms_text',
  'aging_note',
] as const;

export const STATEMENT_TOGGLE_FIELDS = [
  'show_payment_detail',
  'show_aging_buckets',
] as const;

// Registered {{tokens}} — see header. remit_to is resolved last and is
// blank inside the remit lines themselves (no self-reference).
export const STATEMENT_TOKENS = [
  'company_name',
  'customer_name',
  'period_start',
  'period_end',
  'period_label',
  'as_of',
  'balance_due',
  'remit_to',
] as const;

export const STATEMENT_TEXT_DEFAULTS = {
  header_text: 'Please review your account activity below.',
  footer_text: 'Thank you for your business.',
  terms_text: 'Payment is due upon receipt unless other terms are noted on the invoice.',
  aging_note: 'Aging shows open balance by days past due as of the statement date.',
  remit_to: [] as string[],
  show_payment_detail: true,
  show_aging_buckets: true,
};

// Bounds — same spirit as emailSettingsModel (MAX_SIGNATURE_BODY 4000,
// MAX_FROM_NAME 120). Authored text is staff input, but a pasted novella
// still can't bloat the statement PDF or the settings row.
export const MAX_STATEMENT_TEXT_LEN = 4000;
export const MAX_REMIT_LINES = 12;
export const MAX_REMIT_LINE_LEN = 200;

// ---------------------------------------------------------------------------
// Slice resolution — find the settings object inside whatever carrier arrived
// ---------------------------------------------------------------------------

const SLICE_VALUE_KEYS = [
  ...STATEMENT_TEXT_FIELDS,
  ...STATEMENT_TOGGLE_FIELDS,
  'remit_to',
] as const;

const isSliceLike = (v: any) =>
  isObj(v) && SLICE_VALUE_KEYS.some((k) => (v as any)[k] !== undefined);

const pickSliceKeys = (v: any, out: any) => {
  if (!isObj(v)) return;
  for (const key of SLICE_VALUE_KEYS) {
    if (v[key] !== undefined) out[key] = v[key];
  }
};

// Layers in precedence order — later candidates overwrite earlier ones
// (same shape as emailSettingsModel.resolveEmailSettingsSource):
//   KV-blob statementSettings block → flat statementSettings block → KV-row
//   value (when setting_key names a statement key, incl. aliases) → bare
//   slice keys on the passed object → alias blocks (KV-blob then flat).
function resolveStatementSettingsSource(raw: any): any {
  const source: any = {};
  if (!isObj(raw)) return source;
  const sv = isObj(raw.setting_value) ? raw.setting_value : {};

  pickSliceKeys(sv[STATEMENT_SETTINGS_KEY], source);
  pickSliceKeys(raw[STATEMENT_SETTINGS_KEY], source);
  if (STATEMENT_KEY_SET.has(clean(raw.setting_key))) pickSliceKeys(sv, source);
  pickSliceKeys(raw, source);
  for (const alias of STATEMENT_SETTINGS_ALIAS_KEYS) {
    pickSliceKeys(sv[alias], source);
    pickSliceKeys(raw[alias], source);
  }
  return source;
}

// ---------------------------------------------------------------------------
// Field normalizers
// ---------------------------------------------------------------------------

// remit_to accepts a string[] or a newline/semicolon-joined string;
// entries may also be {line|address|text} objects. Output is cleaned,
// length-capped per line, blank-dropped, capped at MAX_REMIT_LINES.
export function normalizeRemitLines(raw: any): string[] {
  let items: any[] = [];
  if (Array.isArray(raw)) items = raw;
  else if (typeof raw === 'string') items = raw.split(/[\n;]+/);
  else if (raw === undefined || raw === null) items = [];
  else items = [raw];
  const out: string[] = [];
  for (const item of items) {
    if (out.length >= MAX_REMIT_LINES) break;
    const candidate = isObj(item)
      ? (item.line ?? item.address ?? item.text ?? item.value)
      : item;
    const line = clean(candidate).slice(0, MAX_REMIT_LINE_LEN);
    if (line) out.push(line);
  }
  return out;
}

const normalizeTextField = (v: any): string | false | undefined => {
  if (v === undefined || v === null) return undefined;
  if (v === false) return false; // explicit suppression
  const s = clean(v).slice(0, MAX_STATEMENT_TEXT_LEN);
  return s;
};

const normalizeToggle = (v: any): boolean | undefined =>
  typeof v === 'boolean' ? v : undefined;

// ---------------------------------------------------------------------------
// normalizeStatementSettings — the settings LAYER, present keys only.
// Absent keys stay absent so mergeStatementText can tell "unset" apart
// from "explicitly blank/false"; every present value is canonical.
// ---------------------------------------------------------------------------
export function normalizeStatementSettings(raw: any) {
  const src = resolveStatementSettingsSource(raw);
  const out: any = {};
  for (const field of STATEMENT_TEXT_FIELDS) {
    const v = normalizeTextField(src[field]);
    if (v !== undefined) out[field] = v;
  }
  if (src.remit_to !== undefined) out.remit_to = normalizeRemitLines(src.remit_to);
  for (const field of STATEMENT_TOGGLE_FIELDS) {
    const v = normalizeToggle(src[field]);
    if (v !== undefined) out[field] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// mergeStatementText — precedence resolution, PRE-token.
// Returns the raw resolved field set plus a `sources` map reporting which
// layer supplied each value ('override' | 'settings' | 'default' |
// 'suppressed') — the settings UI shows the badge, senders ignore it.
// ---------------------------------------------------------------------------

const pickText = (override: any, setting: any, dflt: string) => {
  // First NON-BLANK wins; literal false anywhere suppresses at that layer.
  for (const [v, src] of [
    [override, 'override'],
    [setting, 'settings'],
  ] as const) {
    if (v === false) return { value: '', source: 'suppressed' };
    const s = clean(v);
    if (s) return { value: s.slice(0, MAX_STATEMENT_TEXT_LEN), source: src };
  }
  return { value: dflt, source: 'default' };
};

export function mergeStatementText(settings: any, overrides: any) {
  const s = isObj(settings) ? settings : {};
  const o = isObj(overrides) ? overrides : {};
  const sources: Record<string, string> = {};
  const out: any = {};

  for (const field of STATEMENT_TEXT_FIELDS) {
    const picked = pickText(o[field], s[field], (STATEMENT_TEXT_DEFAULTS as any)[field]);
    out[field] = picked.value;
    sources[field] = picked.source;
  }

  // remit_to — first layer where the key EXISTS wins (present [] is a
  // deliberate "no remit block"); default [] when no layer carries it.
  if (o.remit_to !== undefined) {
    out.remit_to = o.remit_to === false ? [] : normalizeRemitLines(o.remit_to);
    sources.remit_to = 'override';
  } else if (s.remit_to !== undefined) {
    out.remit_to = s.remit_to === false ? [] : normalizeRemitLines(s.remit_to);
    sources.remit_to = 'settings';
  } else {
    out.remit_to = [...(STATEMENT_TEXT_DEFAULTS.remit_to as string[])];
    sources.remit_to = 'default';
  }

  for (const field of STATEMENT_TOGGLE_FIELDS) {
    if (typeof o[field] === 'boolean') {
      out[field] = o[field];
      sources[field] = 'override';
    } else if (typeof s[field] === 'boolean') {
      out[field] = s[field];
      sources[field] = 'settings';
    } else {
      out[field] = (STATEMENT_TEXT_DEFAULTS as any)[field];
      sources[field] = 'default';
    }
  }

  out.sources = sources;
  return out;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const TOKEN_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const REGISTERED_TOKENS = new Set<string>(STATEMENT_TOKENS);

// Integer cents → '$1,234.56' (negative → '-$1,234.56'). Parity copy of
// statementBatchModel.centsToMoney — the shared-model contract keeps this
// file import-free.
const centsToMoney = (cents: any): string => {
  const c = Math.round(Number(cents) || 0);
  const sign = c < 0 ? '-' : '';
  const dollars = Math.abs(c) / 100;
  return `${sign}$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// Dollars → '$1,234.56' for entity/frontend-shaped numbers.
const dollarsToMoney = (v: any): string => centsToMoney(Number(v) * 100);

// Is this a statement CONTEXT (batch or frontend build) rather than a flat
// caller-supplied token map? Context shapes carry ledger fields; flat maps
// are just {token: value}.
const isStatementContext = (v: any) =>
  isObj(v) &&
  (v.line_items !== undefined ||
    v.openItems !== undefined ||
    v.opening_balance !== undefined ||
    v.closing_balance !== undefined ||
    v.customer !== undefined ||
    v.statement !== undefined);

// Money resolution — explicit keys first (caller intent), then the two
// context families. Units are per-field, per the repo conventions:
//   balance_due (number)   → DOLLARS  (Invoice.balance_due entity field)
//   balance_due (string)   → verbatim ('$1,234.56' already formatted)
//   balance_due_cents      → CENTS
//   closing_balance        → CENTS    (statementBatchModel context)
//   balance                → DOLLARS  (statementModel.buildStatement)
//   open_total / total_due → DOLLARS  (email_statement response shape)
const moneyTokenValue = (ctx: any): string => {
  if (typeof ctx.balance_due === 'string' && clean(ctx.balance_due)) return clean(ctx.balance_due);
  if (typeof ctx.balance_due === 'number' && Number.isFinite(ctx.balance_due)) {
    return dollarsToMoney(ctx.balance_due);
  }
  if (Number.isFinite(Number(ctx.balance_due_cents)) && ctx.balance_due_cents !== undefined && ctx.balance_due_cents !== '') {
    return centsToMoney(ctx.balance_due_cents);
  }
  if (typeof ctx.closing_balance === 'number' && Number.isFinite(ctx.closing_balance)) {
    return centsToMoney(ctx.closing_balance);
  }
  if (typeof ctx.balance === 'number' && Number.isFinite(ctx.balance)) {
    return dollarsToMoney(ctx.balance);
  }
  for (const k of ['open_total', 'total_due', 'amount_due']) {
    if (typeof ctx[k] === 'string' && clean(ctx[k])) return clean(ctx[k]);
    if (typeof ctx[k] === 'number' && Number.isFinite(ctx[k])) return dollarsToMoney(ctx[k]);
  }
  return '';
};

// statementTokenValues — the token map for a statement context (or a flat
// map — every listed key then passes through verbatim). `resolved` is the
// mergeStatementText output whose remit lines feed {{remit_to}}; when
// absent, context.remit_to/context.remit_to_text are used directly.
export function statementTokenValues(context: any, resolved: any) {
  const ctx = isObj(context) ? context : {};
  const res = isObj(resolved) ? resolved : {};
  const ctxIsStatement = isStatementContext(ctx);
  const companyBlock = isObj(ctx.company) ? ctx.company : isObj(ctx.shop) ? ctx.shop : {};

  // Issuer vs customer lanes — see header: on a statement context the
  // top-level company_name belongs to the CUSTOMER; the issuer name lives
  // on the company/shop block or the QuoteDefaults-style company_* fields.
  const shopName =
    clean(companyBlock.company_name) ||
    clean(companyBlock.name) ||
    clean(ctx.shop_name) ||
    clean(ctx.companyName) ||
    (ctxIsStatement ? '' : clean(ctx.company_name));

  const customerName =
    clean(ctx.customer?.company_name) ||
    clean(ctx.customer?.name) ||
    clean(ctx.customer_name) ||
    (ctxIsStatement ? clean(ctx.company_name) : '');

  const remitLines = normalizeRemitLines(
    res.remit_to !== undefined ? res.remit_to : (ctx.remit_to ?? ctx.remit_to_text)
  );

  return {
    company_name: shopName,
    customer_name: customerName,
    period_start: clean(ctx.period_start ?? ctx.periodStart),
    period_end: clean(ctx.period_end ?? ctx.periodEnd),
    period_label: clean(ctx.period_label ?? ctx.label ?? ctx.period),
    as_of: clean(ctx.as_of ?? ctx.asOf ?? ctx.as_of_date),
    balance_due: moneyTokenValue(ctx),
    // remit lines substitute other tokens but never remit_to itself.
    remit_to: remitLines.join('\n'),
    __remit_lines: remitLines,
  };
}

// applyStatementTokens — substitute REGISTERED {{tokens}} only; everything
// else stays literal (see header: downstream template engines own their
// placeholders). Returns {text, missing} — missing lists registered tokens
// that resolved to '' (deduped, encounter order).
export function applyStatementTokens(text: any, tokens: any) {
  const src = String(text ?? '');
  const map = isObj(tokens) ? tokens : {};
  const missing: string[] = [];
  const seen = new Set<string>();
  const out = src.replace(TOKEN_RE, (match, name: string) => {
    if (!REGISTERED_TOKENS.has(name)) return match; // foreign placeholder — leave it
    const value = map[name];
    const s = value === undefined || value === null ? '' : String(value);
    if (s === '' && !seen.has(name)) {
      seen.add(name);
      missing.push(name);
    }
    return s;
  });
  return { text: out, missing };
}

// ---------------------------------------------------------------------------
// renderStatementText — the resolved, token-substituted block set a
// statement renderer (StatementView sheet, batch PDF, email body) consumes.
//   settings  — GlobalSettings carrier OR normalized slice OR undefined.
//   overrides — per-statement layer (batch run / one-off email options).
//   context   — statement context (batch or buildStatement) or flat tokens.
// ---------------------------------------------------------------------------
export function renderStatementText(settings: any, overrides: any, context: any) {
  const normalized = normalizeStatementSettings(settings);
  const merged = mergeStatementText(normalized, overrides);

  // First pass: token map needs the remit lines WITH their own tokens
  // applied (remit_to self-reference renders '').
  const seedTokens = statementTokenValues(context, merged);
  const remitLines: string[] = [];
  const missing: string[] = [];
  const seenMissing = new Set<string>();
  const recordMissing = (names: string[]) => {
    for (const name of names) {
      if (!seenMissing.has(name)) {
        seenMissing.add(name);
        missing.push(name);
      }
    }
  };

  const remitSeed = { ...seedTokens, remit_to: '' };
  for (const line of seedTokens.__remit_lines as string[]) {
    const applied = applyStatementTokens(line, remitSeed);
    recordMissing(applied.missing.filter((m) => m !== 'remit_to'));
    if (clean(applied.text)) remitLines.push(applied.text);
  }
  const tokens = { ...seedTokens, remit_to: remitLines.join('\n') };

  const out: any = {};
  for (const field of STATEMENT_TEXT_FIELDS) {
    const applied = applyStatementTokens(merged[field], tokens);
    recordMissing(applied.missing);
    out[field] = applied.text;
  }

  return {
    ...out,
    remit_to: remitLines,
    remit_to_text: remitLines.join('\n'),
    show_payment_detail: merged.show_payment_detail === true,
    show_aging_buckets: merged.show_aging_buckets === true,
    tokens,
    sources: merged.sources,
    missing_tokens: missing,
  };
}

// isStatementSettingsCarrier — cheap guard for callers routing a settings
// row: does this object plausibly carry a statementSettings slice?
export function isStatementSettingsCarrier(raw: any): boolean {
  if (!isObj(raw)) return false;
  if (STATEMENT_KEY_SET.has(clean(raw.setting_key))) return true;
  if (isSliceLike(raw)) return true;
  const sv = isObj(raw.setting_value) ? raw.setting_value : {};
  if (isSliceLike(sv)) return true;
  for (const k of STATEMENT_KEY_SET) {
    if (isObj(raw[k]) || isObj(sv[k])) return true;
  }
  return false;
}
