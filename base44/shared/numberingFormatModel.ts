// K-09 — Estimate/document numbering formats (ESTIMATOR_BACKLOG items
// 476/484/499): prefix/suffix patterns, per-module formats, reissue policy.
//
// Pure model — zero imports. It composes with the live numbering path:
//   - generateDocNumber (base44/functions/generateDocNumber/entry.ts) renders
//     QuoteDefaults.estimate_number_format / order_number_format by replacing
//     "{seq}" with the padded counter value; module_number_prefixes[module_key]
//     overrides the doc-type format (#499), doc_number_padding pads the seq
//     (3-10, default 5), and number_reissue_policy documents the never-reuse
//     stance (#484). The deployed gate accepts /^[\w\-.{}\[\]#]*$/, len<=40,
//     a single literal "{seq}" — isLegacyGeneratorPattern() reproduces that
//     check so stored formats stay renderable until the renderer adopts this
//     grammar.
//   - allocateDocNumber (base44/shared/docNumberAllocation.ts) allocates
//     per-config_name counters for invoice/purchase_order/change_order/
//     reconciliation — the same counter names nextSequenceRow returns.
//   - DocNumberCounter rows are keyed by config_name; estimates, quotes and
//     orders share the 'default' singleton so EST-/INV- numbers never overlap.
//
// Persistence: numbering settings live on the QuoteDefaults singleton
// (config_name 'default', backend-only RLS — see QUOTE_DEFAULT_KEYS in
// src/components/estimator/quoteDefaults.js and /QuoteSettings). A future
// GlobalSettings row (setting_key 'docNumberFormats', setting_value =
// {padding, reissue_policy, kinds, modules}) extends this with per-kind and
// per-module counters; normalizeNumberSettings accepts either shape.

export const MAX_PATTERN_LENGTH = 64;
export const LEGACY_PATTERN_LENGTH = 40;   // deployed generateDocNumber cap
export const DEFAULT_SEQ_PADDING = 5;
export const MAX_SEQ_PADDING = 10;
export const DEFAULT_COUNTER_NAME = 'default';

// Per-kind defaults. `pattern` uses this model's grammar; `counter` is the
// DocNumberCounter config_name. estimate/quote/order share 'default' (the
// deployed generator allocates both doc types from one sequence so the
// EST-/INV- pools never collide); the dedicated counters mirror the
// allocateDocNumber call sites.
export const NUMBER_FORMAT_DEFAULTS: Record<string, { pattern: string; next_seq: number; padding: number; counter: string }> = {
  estimate:       { pattern: 'EST-{seq5}', next_seq: 1, padding: 5, counter: 'default' },
  quote:          { pattern: 'EST-{seq5}', next_seq: 1, padding: 5, counter: 'default' },
  order:          { pattern: 'INV-{seq5}', next_seq: 1, padding: 5, counter: 'default' },
  invoice:        { pattern: 'INV-{seq5}', next_seq: 1, padding: 5, counter: 'invoice' },
  purchase_order: { pattern: 'PO-{seq5}',  next_seq: 1, padding: 5, counter: 'purchase_order' },
  change_order:   { pattern: 'CO-{seq5}',  next_seq: 1, padding: 5, counter: 'change_order' },
  reconciliation: { pattern: 'REC-{seq5}', next_seq: 1, padding: 5, counter: 'reconciliation' },
};

export const DOC_NUMBER_KINDS: string[] = Object.keys(NUMBER_FORMAT_DEFAULTS);

// Kinds that legitimately share the 'default' counter. Any other counter_name
// claimed by more than one entry is a validation error (dup counter scope).
export const SHARED_COUNTER_KINDS: string[] = ['estimate', 'quote', 'order'];

export const COUNTER_SCOPES: string[] = ['global', 'kind', 'module'];

export const REISSUE_POLICIES: string[] = ['never_reuse'];

// Token grammar (docs for settings UI):
//   {seq}    sequence, padded to the kind/settings padding
//   {seqN}   sequence padded to N digits (1..10), e.g. {seq4} -> '0042'
//   {yy}     2-digit UTC year of `at`          {yyyy}   4-digit year
//   {mm}     2-digit UTC month                 {dd}     2-digit day
//   {module} sanitized uppercase module code (vinyl -> VINYL)
export const NUMBER_FORMAT_TOKENS = ['seq', 'seqN', 'yy', 'yyyy', 'mm', 'dd', 'module'] as const;

const TOKEN_RE = /^(seq\d*|yy|yyyy|mm|dd|module)$/;
const DATE_FIELDS = new Set(['yy', 'yyyy', 'mm', 'dd']);
const LEGACY_GENERATOR_RE = /^[\w\-.{}\[\]#]*$/;
const COUNTER_NAME_RE = /^[a-z0-9][a-z0-9_:-]{0,39}$/;

export const normalizeModuleKey = (key: any): string =>
  String(key ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const sanitizeModuleCode = (code: any): string =>
  String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeCounterName = (name: any): string =>
  String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, '_')
    .replace(/^_+|_+$/g, '');

const toDate = (at: any): Date => {
  if (at === undefined || at === null || at === '') return new Date();
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) throw new Error('formatNumber received an invalid "at" value.');
  return d;
};

const clampPad = (value: any): number => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SEQ_PADDING;
  return Math.min(MAX_SEQ_PADDING, n);
};

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// compilePattern — parse a pattern into tokens + errors. Never throws; a
// pattern with errors is unusable (formatNumber refuses to render it).
// Token: {type:'lit',value}|{type:'seq',width:null|1..10}|{type:'date',field}|{type:'module'}
export function compilePattern(pattern: any) {
  const errors: string[] = [];
  const tokens: any[] = [];
  const src = String(pattern ?? '');
  let seqCount = 0;

  if (!src.trim()) {
    return { tokens, errors: ['pattern is empty'], has_seq: false, seq_count: 0 };
  }
  if (src.length > MAX_PATTERN_LENGTH) {
    errors.push(`pattern exceeds ${MAX_PATTERN_LENGTH} characters (${src.length})`);
  }

  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '{') {
      const close = src.indexOf('}', i + 1);
      if (close === -1) {
        errors.push(`unclosed '{' at index ${i}`);
        break;
      }
      const name = src.slice(i + 1, close);
      if (!TOKEN_RE.test(name)) {
        errors.push(`unknown token {${name}} at index ${i}`);
        i = close + 1;
        continue;
      }
      if (name === 'module') {
        tokens.push({ type: 'module' });
      } else if (DATE_FIELDS.has(name)) {
        tokens.push({ type: 'date', field: name });
      } else {
        seqCount += 1;
        const width = name === 'seq' ? null : parseInt(name.slice(3), 10);
        if (width !== null && (width < 1 || width > MAX_SEQ_PADDING)) {
          errors.push(`{${name}} padding must be between 1 and ${MAX_SEQ_PADDING}`);
        }
        tokens.push({ type: 'seq', width });
      }
      i = close + 1;
      continue;
    }
    if (ch === '}') {
      errors.push(`unmatched '}' at index ${i}`);
      i += 1;
      continue;
    }
    let j = i;
    while (j < src.length && src[j] !== '{' && src[j] !== '}') j += 1;
    tokens.push({ type: 'lit', value: src.slice(i, j) });
    i = j;
  }

  if (seqCount === 0) errors.push('pattern must contain a {seq} token');
  if (seqCount > 1) errors.push('pattern must contain at most one sequence token');
  return { tokens, errors, has_seq: seqCount > 0, seq_count: seqCount };
}

// formatNumber — render a pattern (string or compiled {tokens}) with a seq.
// Date tokens resolve in UTC so server and client render identical numbers.
// Throws on an invalid pattern or a non-integer/negative seq — a bad number
// is worse than no number.
export function formatNumber(pattern: any, { seq, module_code = '', at, default_padding = DEFAULT_SEQ_PADDING }: any = {}) {
  const compiled = typeof pattern === 'string' ? compilePattern(pattern) : pattern;
  if (!compiled || !Array.isArray(compiled.tokens)) {
    throw new Error('formatNumber requires a pattern string or compiled tokens.');
  }
  if (Array.isArray(compiled.errors) && compiled.errors.length) {
    throw new Error(`invalid number pattern: ${compiled.errors.join('; ')}`);
  }
  const n = Number(seq);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new Error('formatNumber requires a non-negative integer seq.');
  }
  const when = toDate(at);
  const pad = clampPad(default_padding);
  const mod = sanitizeModuleCode(module_code);

  let out = '';
  for (const t of compiled.tokens) {
    if (t.type === 'lit') out += t.value;
    else if (t.type === 'seq') out += String(n).padStart(t.width || pad, '0');
    else if (t.type === 'module') out += mod;
    else if (t.type === 'date') {
      if (t.field === 'yy') out += String(when.getUTCFullYear() % 100).padStart(2, '0');
      else if (t.field === 'yyyy') out += String(when.getUTCFullYear());
      else if (t.field === 'mm') out += String(when.getUTCMonth() + 1).padStart(2, '0');
      else if (t.field === 'dd') out += String(when.getUTCDate()).padStart(2, '0');
    }
  }
  return out;
}

// patternSeqRegex — a matcher that captures the sequence digits out of a
// rendered number ("EST-00042" -> 42). Used to seed a counter above numbers
// already issued under a pattern (allocateDocNumber's seedEntity scan).
export function patternSeqRegex(pattern: any): RegExp {
  const compiled = typeof pattern === 'string' ? compilePattern(pattern) : pattern;
  if (!compiled?.tokens?.length || compiled?.errors?.length) {
    throw new Error('patternSeqRegex requires a valid pattern.');
  }
  const src = compiled.tokens
    .map((t: any) => {
      if (t.type === 'lit') return escapeRegex(t.value);
      if (t.type === 'seq') return '(\\d+)';
      if (t.type === 'module') return '[A-Z0-9_]*';
      return t.field === 'yyyy' ? '\\d{4}' : '\\d{2}';
    })
    .join('');
  return new RegExp(`^${src}$`);
}

// extractSequence — parse the seq back out of a rendered number. Returns
// null when the number was not issued under this pattern.
export function extractSequence(number: any, pattern: any): number | null {
  let rx: RegExp;
  try {
    rx = patternSeqRegex(pattern);
  } catch {
    return null;
  }
  const m = rx.exec(String(number ?? ''));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

// parseModuleFormatMap — parse the module_number_prefixes value (JSON string
// or plain object) into {normalized_module_key: pattern}.
export function parseModuleFormatMap(raw: any) {
  const map: Record<string, string> = {};
  const errors: string[] = [];
  if (raw === undefined || raw === null || raw === '') return { map, errors };

  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      errors.push('module format map is not valid JSON');
      return { map, errors };
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    errors.push('module format map must be an object of module_key to pattern');
    return { map, errors };
  }
  for (const [key, value] of Object.entries(obj)) {
    const k = normalizeModuleKey(key);
    const v = String(value ?? '').trim();
    if (!k) {
      errors.push(`module format key "${key}" is blank after normalization`);
      continue;
    }
    if (!v) {
      errors.push(`module "${k}" has an empty format`);
      continue;
    }
    if (map[k] !== undefined) errors.push(`module "${k}" is defined more than once`);
    map[k] = v;
  }
  return { map, errors };
}

// normalizeNumberSettings — accept either persistence shape and produce the
// canonical settings object. Idempotent: normalizing an already-normalized
// value returns an equivalent result.
//   QuoteDefaults row: {estimate_number_format, order_number_format,
//     doc_number_padding, module_number_prefixes, number_reissue_policy}
//   GlobalSettings 'docNumberFormats' setting_value / structured blob:
//     {padding, reissue_policy, kinds:{kind:{pattern,counter_name,counter_scope,
//     next_seq}}, modules:{key:{pattern,counter_scope}}}
export function normalizeNumberSettings(raw: any = {}) {
  let s: any = raw && typeof raw === 'object' ? raw : {};
  if (s.setting_value && typeof s.setting_value === 'object') s = s.setting_value; // GlobalSettings row
  const errors: string[] = [];

  const rawPad = s.padding ?? s.doc_number_padding ?? s.number_padding;
  let padding = DEFAULT_SEQ_PADDING;
  if (rawPad !== undefined && rawPad !== null && rawPad !== '') {
    const p = Math.floor(Number(rawPad));
    if (Number.isFinite(p)) padding = p;
    else errors.push(`padding "${rawPad}" is not a number`);
  }

  const reissue_policy = String(s.reissue_policy ?? s.number_reissue_policy ?? 'never_reuse').trim() || 'never_reuse';

  const kinds: Record<string, any> = {};
  for (const kind of DOC_NUMBER_KINDS) {
    const dflt = NUMBER_FORMAT_DEFAULTS[kind];
    let pattern = String(s[`${kind}_number_format`] ?? '').trim();
    let counter_name = dflt.counter;
    let counter_scope: string = dflt.counter === DEFAULT_COUNTER_NAME ? 'global' : 'kind';
    let next_seq = dflt.next_seq;

    const structured = (s.kinds && s.kinds[kind]) || (s.formats && s.formats[kind]);
    if (structured && typeof structured === 'object') {
      if (structured.pattern !== undefined) pattern = String(structured.pattern ?? '').trim();
      if (structured.counter_name !== undefined && String(structured.counter_name).trim()) {
        counter_name = normalizeCounterName(structured.counter_name) || counter_name;
      }
      if (structured.counter_scope !== undefined && String(structured.counter_scope).trim()) {
        counter_scope = String(structured.counter_scope).trim();
      }
      if (structured.next_seq !== undefined) {
        next_seq = Math.max(1, Math.floor(Number(structured.next_seq) || 1));
      }
    }
    if (counter_scope !== 'module' && counter_name === DEFAULT_COUNTER_NAME) counter_scope = 'global';
    // `configured` distinguishes "operator set a format" from "unset": an
    // unset kind still carries the built-in default pattern (source
    // 'default'), matching the deployed blank-fallback semantics — blank
    // is not a stored value.
    kinds[kind] = { pattern: pattern || dflt.pattern, configured: Boolean(pattern), counter_name, counter_scope, next_seq };
  }

  const modules: Record<string, any> = {};
  const parsed = parseModuleFormatMap(s.module_number_prefixes ?? s.module_formats);
  errors.push(...parsed.errors);
  for (const [k, v] of Object.entries(parsed.map)) {
    modules[k] = { pattern: v, counter_scope: 'global' };
  }
  const structuredMods = s.modules;
  if (structuredMods && typeof structuredMods === 'object' && !Array.isArray(structuredMods)) {
    for (const [key, entry] of Object.entries<any>(structuredMods)) {
      const k = normalizeModuleKey(key);
      if (!k) {
        errors.push(`module format key "${key}" is blank after normalization`);
        continue;
      }
      const e: any = typeof entry === 'string' ? { pattern: entry } : entry || {};
      modules[k] = {
        pattern: String(e.pattern ?? modules[k]?.pattern ?? '').trim(),
        counter_scope: String(e.counter_scope ?? modules[k]?.counter_scope ?? 'global').trim() || 'global',
      };
    }
  }

  return { padding, reissue_policy, kinds, modules, errors };
}

const kindCounterName = (settings: any, kind: string): string =>
  normalizeCounterName(settings?.kinds?.[kind]?.counter_name) || NUMBER_FORMAT_DEFAULTS[kind]?.counter || DEFAULT_COUNTER_NAME;

// resolveFormatFor — the override chain: module-specific format -> kind
// format -> built-in default. Invalid configured patterns fall through to the
// next level (mirrors the deployed fail-safe of falling back to EST-/INV-).
// Returns {pattern, padding, counter_scope, counter_name, source, module_id,
// next_seq}. counter_scope: 'global' shares the 'default' counter, 'kind' a
// dedicated per-kind counter, 'module' a dedicated `module:<key>` counter.
export function resolveFormatFor(module_id: any, settings: any = {}, kind = 'estimate') {
  const s = normalizeNumberSettings(settings);
  const dflt = NUMBER_FORMAT_DEFAULTS[kind];
  if (!dflt) throw new Error(`unknown document kind "${kind}"`);
  const mod = normalizeModuleKey(module_id);

  const result = (pattern: string, scope: string, cname: string, source: string, next_seq: number) => ({
    pattern,
    padding: s.padding,
    counter_scope: scope,
    counter_name: cname,
    source,
    module_id: mod,
    next_seq,
  });

  if (mod && s.modules[mod]?.pattern) {
    const compiled = compilePattern(s.modules[mod].pattern);
    if (!compiled.errors.length) {
      const scope = s.modules[mod].counter_scope === 'module' ? 'module' : 'global';
      const cname = scope === 'module' ? `module:${mod}` : kindCounterName(s, kind);
      return result(s.modules[mod].pattern, scope, cname, 'module', 1);
    }
    // An unusable module pattern never blocks numbering — drop to the kind.
  }

  const k = s.kinds[kind];
  if (k?.configured && k.pattern && !compilePattern(k.pattern).errors.length) {
    const scope = k.counter_scope === 'module' ? 'module' : k.counter_name === DEFAULT_COUNTER_NAME ? 'global' : k.counter_scope === 'global' ? 'global' : 'kind';
    return result(k.pattern, scope, k.counter_name, 'kind', k.next_seq ?? 1);
  }

  return result(dflt.pattern, dflt.counter === DEFAULT_COUNTER_NAME ? 'global' : 'kind', dflt.counter, 'default', dflt.next_seq);
}

// nextSequenceRow — which DocNumberCounter row a kind/module allocation must
// increment. `config_name` matches the rows allocateDocNumber and
// generateDocNumber already use ('default' shared, 'invoice',
// 'purchase_order', 'change_order', 'reconciliation'); 'module:<key>' is the
// reserved namespace for per-module counters.
export function nextSequenceRow({ kind = 'estimate', module_id = '', settings = {} }: any = {}) {
  const resolved = resolveFormatFor(module_id, settings, kind);
  return {
    config_name: resolved.counter_name,
    scope: resolved.counter_scope,
    kind,
    module_id: resolved.module_id,
    pattern: resolved.pattern,
    seed_next_seq: resolved.next_seq,
  };
}

// Reissue policy spec (#484) — matches CoreBridge semantics and the deployed
// never_reuse stance: a number that reached a customer (sent/voided) or a
// deleted record is never reissued; a deleted row's seq is archived so the
// gap is auditable; only unsent drafts may reuse their own allocation.
const REISSUE_SPEC = Object.freeze({
  policy: 'never_reuse',
  voided: 'never_reissue',
  draft: 'may_reuse_until_sent',
  sent: 'never_reissue',
  deleted: 'archive_seq',
});

export function reissuePolicy() {
  return { ...REISSUE_SPEC };
}

const REISSUE_VOID_STATES = new Set(['voided', 'void', 'cancelled', 'canceled']);
const REISSUE_DELETED_STATES = new Set(['deleted', 'archived', 'archived_seq']);
const REISSUE_DRAFT_STATES = new Set(['', 'draft', 'pending', 'unsent', 'new']);

// canReissueNumber — may this number be stamped onto a record again? Derived
// from the number row + a lifecycle context; fail-closed on anything that is
// not provably an unsent draft.
export function canReissueNumber(number_row: any = {}, context: any = {}) {
  const row = number_row || {};
  const ctx = context || {};
  if (
    ctx.deleted === true ||
    row.deleted === true ||
    row.deleted_at ||
    row.archived_seq === true ||
    row.number_archived === true ||
    row.reissued === true
  ) {
    return false;
  }
  const state = String(ctx.state ?? ctx.status ?? row.state ?? row.status ?? row.lifecycle_state ?? '')
    .trim()
    .toLowerCase();
  const sent =
    ctx.sent === true ||
    Boolean(String(row.sent_at ?? ctx.sent_at ?? '').trim()) ||
    Boolean(String(row.sent_to_email ?? ctx.sent_to_email ?? '').trim());

  if (REISSUE_VOID_STATES.has(state)) return false;
  if (REISSUE_DELETED_STATES.has(state)) return false;
  if (sent) return false;
  if (REISSUE_DRAFT_STATES.has(state)) return true;
  return false; // sent/issued/converted/accepted/unknown — never reissue.
}

// previewFormats — {kind: rendered} map for the settings UI, rendered with a
// sample seq/module/date. Module entries appear under `module:<key>` with the
// module's own code so {module} previews honestly. Unrenderable entries -> null.
export function previewFormats(settings: any = {}, { seq = 42, module_code = 'sign', at }: any = {}) {
  const s = normalizeNumberSettings(settings);
  const out: Record<string, string | null> = {};
  for (const kind of DOC_NUMBER_KINDS) {
    try {
      const r = resolveFormatFor('', s, kind);
      out[kind] = formatNumber(r.pattern, { seq, module_code, at, default_padding: s.padding });
    } catch {
      out[kind] = null;
    }
  }
  for (const mod of Object.keys(s.modules)) {
    try {
      const r = resolveFormatFor(mod, s);
      out[`module:${mod}`] = formatNumber(r.pattern, { seq, module_code: mod, at, default_padding: s.padding });
    } catch {
      out[`module:${mod}`] = null;
    }
  }
  return out;
}

// isLegacyGeneratorPattern — does the deployed generateDocNumber render this
// pattern as stored? It requires a literal "{seq}", the [\w\-.{}\[\]#] charset
// and <=40 chars. Extended tokens ({seqN}, {yy}, {module}, …) need the new
// renderer on the allocation path.
export function isLegacyGeneratorPattern(pattern: any): boolean {
  const p = String(pattern ?? '');
  if (!(p.length > 0 && p.length <= LEGACY_PATTERN_LENGTH && LEGACY_GENERATOR_RE.test(p) && p.includes('{seq}'))) return false;
  // The deployed generator knows only a literal "{seq}" — any other brace
  // token alongside it ({seqN}, {yy}, {module}, …) is not renderable by it.
  return !/\{(?!seq\})[^{}]*\}/.test(p);
}

// validateNumberSettings — errors[] for a settings blob (either shape).
// Covers: unparsable module maps, empty/invalid patterns, padding out of
// 1..10, unsupported reissue policy, invalid counter scopes/names, and
// duplicate counter claims (only SHARED_COUNTER_KINDS may share 'default').
// Pass {legacy_generator_compat: true} to also require every pattern to be
// renderable by the currently deployed generateDocNumber.
export function validateNumberSettings(settings: any = {}, { legacy_generator_compat = false }: any = {}) {
  const s = normalizeNumberSettings(settings);
  const errors: string[] = [...(s.errors || [])];

  if (!Number.isInteger(s.padding) || s.padding < 1 || s.padding > MAX_SEQ_PADDING) {
    errors.push(`padding must be an integer between 1 and ${MAX_SEQ_PADDING} (got ${s.padding})`);
  }
  if (!REISSUE_POLICIES.includes(s.reissue_policy)) {
    errors.push(`reissue policy "${s.reissue_policy}" is not supported (supported: ${REISSUE_POLICIES.join(', ')})`);
  }

  const counterClaims: Record<string, string[]> = {};
  const claim = (cname: string, who: string) => {
    if (!cname) return;
    (counterClaims[cname] = counterClaims[cname] || []).push(who);
  };

  for (const kind of DOC_NUMBER_KINDS) {
    const k = s.kinds[kind];
    claim(k.counter_name, kind);
    // Only configured patterns are validated — an unset kind renders the
    // built-in default, which is always valid (deployed blank-fallback).
    const compiled = k.configured ? compilePattern(k.pattern) : { errors: [] };
    for (const e of compiled.errors) errors.push(`kinds.${kind}: ${e}`);
    if (!COUNTER_SCOPES.includes(k.counter_scope)) {
      errors.push(`kinds.${kind}.counter_scope "${k.counter_scope}" is invalid (use ${COUNTER_SCOPES.join('|')})`);
    }
    if (k.counter_scope === 'module') {
      errors.push(`kinds.${kind} cannot claim a module counter scope; module counters belong to module entries`);
    }
    if (!COUNTER_NAME_RE.test(k.counter_name)) {
      errors.push(`kinds.${kind}.counter_name "${k.counter_name}" is invalid`);
    }
    if (!Number.isInteger(k.next_seq) || k.next_seq < 1) {
      errors.push(`kinds.${kind}.next_seq must be a positive integer`);
    }
    if (legacy_generator_compat && k.configured && !isLegacyGeneratorPattern(k.pattern)) {
      errors.push(`kinds.${kind}: pattern "${k.pattern}" is not renderable by the deployed generator (needs a single {seq}, charset [\\w\\-.{}\\[\]#], <=${LEGACY_PATTERN_LENGTH} chars)`);
    }
  }

  for (const [mod, m] of Object.entries<any>(s.modules)) {
    const compiled = compilePattern(m.pattern);
    for (const e of compiled.errors) errors.push(`modules.${mod}: ${e}`);
    if (!['global', 'module'].includes(m.counter_scope)) {
      errors.push(`modules.${mod}.counter_scope "${m.counter_scope}" is invalid (use global|module)`);
    }
    if (m.counter_scope === 'module') claim(`module:${mod}`, `module:${mod}`);
    if (legacy_generator_compat && !isLegacyGeneratorPattern(m.pattern)) {
      errors.push(`modules.${mod}: pattern "${m.pattern}" is not renderable by the deployed generator`);
    }
  }

  for (const [cname, claimants] of Object.entries(counterClaims)) {
    const sharedOk = cname === DEFAULT_COUNTER_NAME && claimants.every((c) => SHARED_COUNTER_KINDS.includes(c));
    if (claimants.length > 1 && !sharedOk) {
      errors.push(`counter "${cname}" is claimed by ${claimants.join(', ')} — counters are dedicated unless kinds share the '${DEFAULT_COUNTER_NAME}' sequence`);
    }
  }

  return errors;
}
