// Notification template renderer — safe `{{placeholder}}` substitution for
// comms templates (MASTERPLAN H-03). Pure TS, ZERO imports, NO eval()/
// Function(): a placeholder can only read own properties along a whitelisted
// dot-path and pass the value through a fixed formatter registry.
//
// SUBSTITUTION ONLY, BY DESIGN: there is no `{{#each items}}...{{/each}}`
// block syntax, no conditionals, and no expression language. Comms templates
// are authored by staff and rendered against real records — keeping the
// grammar to "path | formatters" means a template can never execute code,
// loop, or traverse off the caller-supplied context. Callers that need a
// line-item table should compose strings in code and expose them as fields.
//
// Grammar:
//   placeholder := '{{' ws? expression ws? '}}'
//   expression  := dot-path ('|' formatter-spec)*
//   dot-path    := segment ('.' segment)*
//   segment     := ident | array-index
//   ident       := [A-Za-z_$] [A-Za-z0-9_$]*
//   array-index := digits                                    (items.0.name)
//   formatter-spec := ident (':' quoted-string | ':' bare-token)?
//
//   `|` separators inside a quoted formatter argument are literal:
//   {{ order.ref | default:"a|b" }} renders 'a|b' when ref is missing.
//
// Formatters (registry — TEMPLATE_FORMATTERS; names matched case-insensitively):
//   money             -> '$1,234.56' / '-$7.25'; non-numeric input -> ''
//   date              -> locale short date 'M/D/YYYY' (en-US). Accepts ISO
//                        strings, Date instances, finite epoch-ms numbers.
//                        Renders the UTC calendar date — a shared module
//                        cannot know the recipient's timezone, and stored
//                        date fields are UTC-anchored.
//   upper / lower     -> String(value).toUpperCase()/toLowerCase()
//   title             -> word-wise title case ('jOHN doe' -> 'John Doe')
//   default:"fbk"     -> fallback used when the incoming value is
//                        null/undefined/'' — including '' produced by an
//                        earlier formatter, so `{{x|money|default:"n/a"}}`
//                        shows 'n/a' for a missing/non-numeric x.
//   An UNKNOWN or malformed formatter is a render-time no-op (the value
//   passes through) — validateTemplate exists to flag it before send.
//
// Resolution + missing contract — renderTemplate NEVER throws:
//   - Path segments are read via Object.prototype.hasOwnProperty ONLY, so
//     'constructor', '__proto__', 'toString', 'prototype', etc. can never
//     resolve through a prototype chain — a template cannot escape the
//     context object or reach built-ins.
//   - Function values are never called, traversed, or rendered: a segment
//     resolving to a function stops the walk and counts as missing.
//   - A path that fails to resolve, or resolves to a non-scalar terminal
//     (plain object/array — functions/symbols too) renders '' by default
//     and records the path in result.missing (deduped, encounter order;
//     unparseable expressions record the raw inner text). Non-empty
//     output produced by formatters still renders — `default` can recover
//     a missing path without hiding it from result.missing.
//   - opts.strict renders the raw `{{...}}` literally whenever the binding
//     failed AND produced empty output — a preview/debug mode where failed
//     bindings stay visible instead of silently vanishing. A `default`
//     fallback still wins (its output is non-empty).
//   - Malformed braces never throw and are never swallowed: unclosed '{{'
//     or stray '}}' stay literal text. `{{ a {{b}} }}` renders the inner
//     match and leaves the outer braces literal — no nesting.
//   - Renderable scalars: string/number/boolean/bigint (String() coercion);
//     Date instances render as ISO text (use `| date` for the pretty form).
//     No HTML escaping is applied — the caller owns output encoding.
//
// API:
//   renderTemplate(template, context, opts?) -> { text, missing[] }
//   placeholdersIn(template) -> trimmed inner expressions in encounter order
//   validateTemplate(template, sampleContext) -> dry-run render;
//     { ok, missing[], unknownFormatters[] } — unknownFormatters lists every
//     formatter spec (deduped, sorted) whose name is outside the registry.
//
// Bounds: TEMPLATE_MAX_PLACEHOLDERS caps matches processed per render;
// placeholders past the cap stay literal and are recorded in missing.

export const TEMPLATE_FORMATTERS: readonly string[] = [
  "money",
  "date",
  "upper",
  "lower",
  "title",
  "default",
];

export const TEMPLATE_MAX_PLACEHOLDERS = 2_000;

export interface TemplateContext {
  [key: string]: unknown;
}

export interface RenderOptions {
  /** Failed bindings render as the literal `{{...}}` instead of ''. */
  strict?: boolean;
}

export interface RenderResult {
  text: string;
  /** Deduped paths (or raw inner text for unparseable placeholders) that
   *  failed to bind to a rendered scalar, in encounter order. */
  missing: string[];
}

export interface TemplateValidation {
  ok: boolean;
  missing: string[];
  unknownFormatters: string[];
}

// ---------------------------------------------------------------------------
// placeholder scanning — a match is `{{` + any brace-free inner + `}}`.
// Unclosed '{{' never matches (stays literal); `{{{x}}}` leaves the outer
// braces literal around an inner `{{x}}` match.
// ---------------------------------------------------------------------------

const PLACEHOLDER_RE = /\{\{([^{}]*)\}\}/g;

// ---------------------------------------------------------------------------
// expression parsing
// ---------------------------------------------------------------------------

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const INDEX_RE = /^\d+$/;
const FORMATTER_SPEC_RE = /^([A-Za-z][A-Za-z0-9_]*)\s*(?::([\s\S]*))?$/;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface FormatterSpec {
  /** Raw spec text trimmed (for unknownFormatters reporting). */
  raw: string;
  /** Lowercased formatter name; '' when the spec is malformed. */
  name: string;
  /** Formatter argument (quotes stripped) — only `default` uses one. */
  arg: string | undefined;
  /** False when the spec text isn't a legal formatter call. */
  ok: boolean;
}

interface ParsedPlaceholder {
  ok: boolean;
  /** Normalized dot-path (segments joined with '.'). */
  path: string;
  segments: string[];
  formatters: FormatterSpec[];
}

// split on '|' that sits outside quote chars — quoted pipes stay inside the
// argument ({{x|default:"a|b"}} is ONE formatter, not two).
function splitPipes(inner: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote !== "") {
      cur += ch;
      if (ch === quote && inner[i - 1] !== "\\") quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === "|") {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

// strip matching surrounding quotes + collapse \" \' \\ escapes; an
// unterminated quote is tolerated (leading quote char dropped).
function unquoteArg(raw: string): string {
  const s = raw.trim();
  if (s.length === 0) return "";
  const q = s[0];
  if (q !== '"' && q !== "'") return s;
  const closed = s.length > 1 && s[s.length - 1] === q;
  const body = s.slice(1, closed ? -1 : undefined);
  return body.replace(/\\(["'\\])/g, "$1");
}

function parseFormatterSpec(text: string): FormatterSpec {
  const raw = text.trim();
  const m = FORMATTER_SPEC_RE.exec(raw);
  if (!m) return { raw, name: "", arg: undefined, ok: false };
  return {
    raw,
    name: m[1].toLowerCase(),
    arg: m[2] === undefined ? undefined : unquoteArg(m[2]),
    ok: true,
  };
}

function parsePlaceholder(inner: string): ParsedPlaceholder {
  const parts = splitPipes(inner);
  const path = (parts[0] ?? "").trim();
  const formatters = parts.slice(1).map(parseFormatterSpec);
  if (path === "") return { ok: false, path, segments: [], formatters };
  const segments = path.split(".");
  for (const seg of segments) {
    if (!IDENT_RE.test(seg) && !INDEX_RE.test(seg)) {
      return { ok: false, path, segments: [], formatters };
    }
  }
  return { ok: true, path: segments.join("."), segments, formatters };
}

// ---------------------------------------------------------------------------
// path resolution — own-property walk only; nothing traverses a prototype
// chain and nothing calls a function value.
// ---------------------------------------------------------------------------

const MISS = { found: false as const, value: undefined as unknown };
type PathResult = { found: boolean; value: unknown };

function resolvePath(context: unknown, segments: string[]): PathResult {
  let cur = context;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return MISS;
    const t = typeof cur;
    if (t === "function") return MISS; // never read props off a function
    // hasOwnProperty.call auto-boxes primitives: "abc".length and "abc".0
    // are own props (harmless reads); number/bool have none -> missing.
    if (!Object.prototype.hasOwnProperty.call(cur, seg)) return MISS;
    cur = (cur as Record<string, unknown>)[seg];
  }
  if (typeof cur === "function") return MISS; // never render a function
  return { found: true, value: cur };
}

// ---------------------------------------------------------------------------
// scalarization — what a terminal value may render as
// ---------------------------------------------------------------------------

const nonScalar = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  const t = typeof v;
  return t === "object" || t === "function" || t === "symbol";
};

// Date is the one structured terminal worth rendering — ISO keeps it honest;
// `| date` exists for the pretty form.
const scalarText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    return Number.isFinite(v.getTime()) ? v.toISOString() : "";
  }
  const t = typeof v;
  if (t === "string") return v as string;
  if (t === "number" || t === "boolean" || t === "bigint") return String(v);
  return ""; // object | function | symbol | undefined
};

// ---------------------------------------------------------------------------
// formatter registry — each maps (value, arg) -> unknown; unknown/malformed
// specs are skipped as no-ops at render time.
// ---------------------------------------------------------------------------

type FormatterFn = (value: unknown, arg: string | undefined) => unknown;

const money: FormatterFn = (v) => {
  const s = scalarText(v).trim();
  if (s === "") return "";
  const n = Number(s);
  if (!Number.isFinite(n)) return "";
  const body = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (n < 0 ? "-$" : "$") + body;
};

const toMs = (v: unknown): number => {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = scalarText(v).trim();
  if (s === "") return NaN;
  const m = DATE_ONLY_RE.exec(s);
  // 'YYYY-MM-DD' is pinned to UTC midnight so the rendered date cannot shift
  // a day backwards in western timezones.
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
};

const date: FormatterFn = (v) => {
  const t = toMs(v);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("en-US", { timeZone: "UTC" });
};

const upper: FormatterFn = (v) => scalarText(v).toUpperCase();
const lower: FormatterFn = (v) => scalarText(v).toLowerCase();
const title: FormatterFn = (v) =>
  scalarText(v).replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
const dflt: FormatterFn = (v, arg) =>
  v === null || v === undefined || v === "" ? (arg ?? "") : v;

const FORMATTER_IMPL: Record<string, FormatterFn> = {
  money,
  date,
  upper,
  lower,
  title,
  default: dflt,
};

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

const asTemplateString = (template: unknown): string =>
  typeof template === "string" ? template : template == null ? "" : String(template);

export function renderTemplate(
  template: unknown,
  context: unknown,
  opts?: RenderOptions | null,
): RenderResult {
  const src = asTemplateString(template);
  const ctx = context !== null && typeof context === "object" ? context : {};
  const strict = !!opts && opts.strict === true;
  const missing: string[] = [];
  const seen = new Set<string>();
  const recordMissing = (key: string): void => {
    if (!seen.has(key)) {
      seen.add(key);
      missing.push(key);
    }
  };

  let count = 0;
  const text = src.replace(PLACEHOLDER_RE, (match, inner: string) => {
    if (count >= TEMPLATE_MAX_PLACEHOLDERS) {
      recordMissing(inner.trim());
      return match; // over cap -> literal
    }
    count += 1;

    const parsed = parsePlaceholder(inner);
    if (!parsed.ok) {
      recordMissing(inner.trim());
      return strict ? match : "";
    }

    const res = resolvePath(ctx, parsed.segments);
    let value: unknown = res.value;
    for (const f of parsed.formatters) {
      const impl = f.ok ? FORMATTER_IMPL[f.name] : undefined;
      if (impl) value = impl(value, f.arg); // unknown/malformed -> no-op
    }

    const rendered = scalarText(value);
    const unbound = !res.found;
    const unrenderable = res.found && nonScalar(value) && rendered === "";
    if (unbound || unrenderable) recordMissing(parsed.path);
    if (rendered !== "") return rendered;
    return strict && (unbound || unrenderable) ? match : "";
  });

  return { text, missing };
}

// ---------------------------------------------------------------------------
// placeholdersIn — every {{...}} expression in encounter order (inner text,
// trimmed). Malformed braces simply never produce entries.
// ---------------------------------------------------------------------------

export function placeholdersIn(template: unknown): string[] {
  const src = asTemplateString(template);
  const out: string[] = [];
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1].trim());
  return out;
}

// ---------------------------------------------------------------------------
// validateTemplate — dry-run against a sample context. ok = every placeholder
// bound to a rendered scalar AND every formatter spec names a registry entry.
// ---------------------------------------------------------------------------

export function validateTemplate(
  template: unknown,
  sampleContext: unknown,
): TemplateValidation {
  const { missing } = renderTemplate(template, sampleContext);
  const unknown = new Set<string>();
  for (const expr of placeholdersIn(template)) {
    const parsed = parsePlaceholder(expr);
    for (const f of parsed.formatters) {
      if (!f.ok) {
        unknown.add(f.raw === "" ? "(empty formatter)" : f.raw);
      } else if (!(f.name in FORMATTER_IMPL)) {
        unknown.add(f.raw);
      }
    }
  }
  const unknownFormatters = [...unknown].sort();
  return { ok: missing.length === 0 && unknownFormatters.length === 0, missing, unknownFormatters };
}
