// Pricing variables registry — global variables + builtin reserved vars for
// pricing formulas (ESTIMATOR_MASTERPLAN F-07). Pure TS, ZERO imports.
//
// The formula engine (base44/shared/formulaEval.ts, F-09) resolves variables
// from a caller-supplied env map by case-sensitive own-property lookup. This
// module owns the registry side: the canonical builtin list, validation of the
// GlobalSettings.pricing_variables custom registry, env construction with a
// documented precedence chain, and a forgiving resolver for UI/reporting code.
//
// Env build precedence (lowest -> highest):
//   1. builtins     — every BUILTIN_VARIABLES name is ALWAYS present, filled
//                     from product/part fields when available, else the
//                     builtin's documented default (Quantity=1, others=0).
//   2. custom globals — normalized GlobalSettings.pricing_variables entries
//                     with status 'active'. Names colliding case-insensitively
//                     with a builtin are reserved: normalize marks them
//                     status:'error' and buildFormulaEnv skips them, so a
//                     global can NEVER shadow a builtin.
//   3. overrides    — explicit caller map, applied last so it wins over both
//                     builtins and globals (e.g. the operator-typed quantity on
//                     an estimate line).
//
// Case normalization: env keys are canonicalized case-insensitively — an
// override {quantity:5} writes env.Quantity; {sqft:3} writes env.SqFt when a
// global 'SqFt' exists. Engine lookup stays case-sensitive on canonical keys.

export interface PricingVariableMeta {
  /** Canonical formula identifier (case-sensitive in evaluateFormula env). */
  name: string;
  /** Operator-facing label. */
  label: string;
  /** What feeds the variable / where it applies. */
  description: string;
  /** Value injected into the env when no product/part field supplies one. */
  default: number;
}

export const BUILTIN_VARIABLES: readonly PricingVariableMeta[] = [
  {
    name: "Quantity",
    label: "Quantity",
    description:
      "Ordered quantity of the product (product.quantity / product_quantity; falls back to part part_qty). Multiplies per-unit pricing in formulas like 'PartRetail * Quantity'.",
    default: 1,
  },
  {
    name: "Width",
    label: "Width",
    description:
      "Finished width dimension of the product/part (inches unless the part's unit basis says otherwise). Feeds area math such as 'Width * Height / 144'.",
    default: 0,
  },
  {
    name: "Height",
    label: "Height",
    description:
      "Finished height dimension of the product/part. Paired with Width for square-foot and girth formulas.",
    default: 0,
  },
  {
    name: "Depth",
    label: "Depth",
    description:
      "Finished depth dimension of the product/part (returns, cabinet depth, letter depth).",
    default: 0,
  },
  {
    name: "PartBaseCost",
    label: "Part Base Cost",
    description:
      "Resolved base material/production cost of the part being priced (part base_cost/unit_cost/frozen_unit_cost). Cost-plus formulas build on this.",
    default: 0,
  },
  {
    name: "PartRetail",
    label: "Part Retail",
    description:
      "Part's retail unit rate (part retail/retail_price/part_price) before tier, markup, and modifier adjustments.",
    default: 0,
  },
  {
    name: "StitchCount",
    label: "Stitch Count",
    description:
      "Embroidery stitch count on the product/part. Typical formula: 'StitchCount / 1000 * rate * Quantity'.",
    default: 0,
  },
];

export const BUILTIN_VARIABLE_NAMES: readonly string[] = BUILTIN_VARIABLES.map(
  (v) => v.name,
);

/** Identifier grammar shared with the formula engine's tokenizer. */
export const PRICING_VARIABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const PRICING_VARIABLE_STATUS_ACTIVE = "active";
export const PRICING_VARIABLE_STATUS_ERROR = "error";

/** Names that can never be registered as custom globals (builtins + literals). */
const RESERVED_LC: ReadonlySet<string> = new Set<string>([
  ...BUILTIN_VARIABLE_NAMES.map((n) => n.toLowerCase()),
  "true", // formula literals resolve before variables — registering them is
  "false", // dead config, so treat as reserved too.
]);

// ---------------------------------------------------------------------------
// shared coercion — same reject set as formulaEval's variable resolution:
// null/undefined/''/object/function/symbol/bigint are not numeric; finite
// numbers, booleans and numeric strings coerce.
// ---------------------------------------------------------------------------

const toFiniteNumber = (v: unknown): number | null => {
  if (
    v === null ||
    v === undefined ||
    v === "" ||
    typeof v === "object" ||
    typeof v === "function" ||
    typeof v === "symbol" ||
    typeof v === "bigint"
  ) {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const asString = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim();

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

// ---------------------------------------------------------------------------
// normalized registry entry — row shape of GlobalSettings.pricing_variables
// ---------------------------------------------------------------------------

export interface PricingVariable {
  name: string;
  label: string;
  description: string;
  default_value: number;
  /** 'active' | operator-supplied status | 'error' for failed validation. */
  status: string;
  /** Diagnostic present only on status:'error' entries. */
  error?: string;
}

const errEntry = (
  name: string,
  label: string,
  description: string,
  defaultValue: number,
  error: string,
): PricingVariable => ({
  name,
  label,
  description,
  default_value: defaultValue,
  status: PRICING_VARIABLE_STATUS_ERROR,
  error,
});

/**
 * Validate/normalize a raw pricing_variables array (from GlobalSettings or a
 * UI draft) into stable {name, label, description, default_value, status}
 * rows. Idempotent — already-normalized rows round-trip unchanged.
 *
 * Rules:
 *  - name must match /^[A-Za-z_][A-Za-z0-9_]*$/             -> error entry
 *  - name colliding case-insensitively with a builtin or a
 *    formula literal (true/false)                           -> error entry
 *  - later case-insensitive duplicates of a kept name        -> error entry
 *    (first occurrence survives — case-insensitive dedupe)
 *  - default_value present but not coercible to a finite
 *    number                                                  -> error entry
 *  - incoming status 'error' is sticky (kept as an error row
 *    even when the row now re-validates) so normalize is
 *    idempotent on already-normalized arrays
 *  - valid rows keep a non-empty incoming status, else 'active'
 *
 * Error rows stay in the output (with .error populated) so admin UIs can
 * render inline feedback; buildFormulaEnv ignores every non-'active' row.
 */
export function normalizePricingVariables(raw: unknown): PricingVariable[] {
  if (!Array.isArray(raw)) return [];
  const out: PricingVariable[] = [];
  const seenLc = new Set<string>();

  for (const item of raw) {
    const rec = isRecord(item) ? item : {};
    const name = asString(rec.name);
    const label = asString(rec.label) || name;
    const description = asString(rec.description);
    const lc = name.toLowerCase();

    if (!PRICING_VARIABLE_NAME_RE.test(name)) {
      out.push(
        errEntry(name, label, description, 0,
          `invalid variable name '${name}' — must match ${PRICING_VARIABLE_NAME_RE.source}`),
      );
      continue;
    }
    if (RESERVED_LC.has(lc)) {
      out.push(
        errEntry(name, label, description, 0,
          `'${name}' collides with a reserved builtin/literal name`),
      );
      continue;
    }
    if (seenLc.has(lc)) {
      out.push(
        errEntry(name, label, description, 0,
          `duplicate of variable '${name}' (case-insensitive)`),
      );
      continue;
    }

    // default_value ?? default ?? value — accept raw drafts and normalized rows.
    const rawDefault =
      rec.default_value !== undefined && rec.default_value !== null
        ? rec.default_value
        : rec.default !== undefined && rec.default !== null
          ? rec.default
          : rec.value;
    const dv = toFiniteNumber(rawDefault);
    if (rawDefault !== undefined && rawDefault !== null && dv === null) {
      out.push(
        errEntry(name, label, description, 0,
          `default_value for '${name}' is not a finite number`),
      );
      continue;
    }

    // status is sticky-error for idempotency: an already-normalized error row
    // re-validates clean (name ok, default now numeric) — keep it an error so
    // normalize(normalize(x)) === normalize(x). Non-empty operator statuses
    // ('archived', 'disabled', …) pass through; everything else -> 'active'.
    const incoming = asString(rec.status);
    if (incoming === PRICING_VARIABLE_STATUS_ERROR) {
      const sticky = errEntry(
        name, label, description, dv ?? 0,
        asString(rec.error) || `previously-flagged variable '${name}'`,
      );
      out.push(sticky);
      seenLc.add(lc); // a stored name still occupies its slot for dedupe
      continue;
    }

    out.push({
      name,
      label,
      description,
      default_value: dv ?? 0,
      status: incoming || PRICING_VARIABLE_STATUS_ACTIVE,
    });
    seenLc.add(lc);
  }
  return out;
}

// ---------------------------------------------------------------------------
// env construction
// ---------------------------------------------------------------------------

/** Mirrors formulaEval's FormulaEnv (declared locally to keep zero imports). */
export interface PricingFormulaEnv {
  [name: string]: unknown;
}

export interface BuildFormulaEnvInput {
  /** Product/order-line record supplying quantity + dims (+ stitch_count). */
  product?: Record<string, unknown> | null;
  /** Part record supplying base cost, retail rate (+ dims/qty fallbacks). */
  part?: Record<string, unknown> | null;
  /**
   * Custom global variables — a raw or normalized pricing_variables array,
   * or a row carrying one under .pricing_variables.
   */
  globals?: unknown;
  /**
   * Explicit env values applied LAST so they win over builtins and globals.
   * Keys canonicalize case-insensitively (quantity -> Quantity); keys that
   * are not valid formula identifiers are skipped.
   */
  builtinOverrides?: Record<string, unknown> | null;
}

interface FieldCandidate {
  from: "product" | "part";
  keys: readonly string[];
}

// Ordered field candidates per builtin — first finite value wins. Product
// fields lead for order-line values (qty/dims), part fields lead for
// part-rate values; each falls through to the other record as a fallback so
// standalone parts and flat product records both resolve.
const BUILTIN_FIELD_CANDIDATES: Record<string, readonly FieldCandidate[]> = {
  Quantity: [
    { from: "product", keys: ["quantity", "product_quantity", "qty"] },
    { from: "part", keys: ["quantity", "part_qty", "qty"] },
  ],
  Width: [
    { from: "product", keys: ["width", "width_in", "width_inches"] },
    { from: "part", keys: ["width", "width_in", "width_inches"] },
  ],
  Height: [
    { from: "product", keys: ["height", "height_in", "height_inches"] },
    { from: "part", keys: ["height", "height_in", "height_inches"] },
  ],
  Depth: [
    { from: "product", keys: ["depth", "depth_in", "depth_inches"] },
    { from: "part", keys: ["depth", "depth_in", "depth_inches"] },
  ],
  PartBaseCost: [
    { from: "part", keys: ["base_cost", "part_base_cost", "unit_cost", "frozen_unit_cost", "cost"] },
    { from: "product", keys: ["base_cost", "part_base_cost", "unit_cost", "cost"] },
  ],
  PartRetail: [
    { from: "part", keys: ["retail", "part_retail", "retail_price", "part_price", "price"] },
    { from: "product", keys: ["retail", "part_retail", "retail_price", "price"] },
  ],
  StitchCount: [
    { from: "product", keys: ["stitch_count", "stitchCount", "stitches"] },
    { from: "part", keys: ["stitch_count", "stitchCount", "stitches"] },
  ],
};

const isBuiltinName = (name: string): boolean =>
  BUILTIN_VARIABLE_NAMES.some((b) => b.toLowerCase() === name.toLowerCase());

/**
 * Canonical env-key casing for `name`: builtin case-insensitive match -> the
 * builtin's canonical name; else a case-insensitive own-key match inside `env`
 * -> that existing key; else the name unchanged.
 */
export function canonicalVariableName(
  name: string,
  env?: PricingFormulaEnv,
): string {
  const lc = name.toLowerCase();
  for (const b of BUILTIN_VARIABLE_NAMES) {
    if (b.toLowerCase() === lc) return b;
  }
  if (env) {
    for (const k of Object.keys(env)) {
      if (k.toLowerCase() === lc) return k;
    }
  }
  return name;
}

const firstFieldValue = (
  builtin: string,
  product: Record<string, unknown> | null,
  part: Record<string, unknown> | null,
): number | null => {
  for (const cand of BUILTIN_FIELD_CANDIDATES[builtin] ?? []) {
    const rec = cand.from === "product" ? product : part;
    if (!rec) continue;
    for (const key of cand.keys) {
      if (!Object.prototype.hasOwnProperty.call(rec, key)) continue;
      const v = toFiniteNumber(rec[key]);
      if (v !== null) return v;
    }
  }
  return null;
};

const unwrapGlobals = (globals: unknown): unknown =>
  Array.isArray(globals)
    ? globals
    : isRecord(globals) && Array.isArray(globals.pricing_variables)
      ? globals.pricing_variables
      : [];

/**
 * Build a formula env for evaluateFormula.
 *
 * Precedence (low -> high):
 *   builtins (product/part fields, else builtin defaults)
 *   < active custom globals (default_value)
 *   < builtinOverrides (explicit caller values — raw passthrough; the engine
 *     coerces numbers/numeric strings and reports anything else as a clean
 *     'not numeric' error, so overrides are never silently dropped).
 */
export function buildFormulaEnv(
  input: BuildFormulaEnvInput = {},
): PricingFormulaEnv {
  const env: PricingFormulaEnv = {};
  const product = isRecord(input.product) ? input.product : null;
  const part = isRecord(input.part) ? input.part : null;

  // 1) builtins — always all seven present so formulas never hit
  //    'unknown variable' on a missing dimension; field value else default.
  for (const meta of BUILTIN_VARIABLES) {
    env[meta.name] = firstFieldValue(meta.name, product, part) ?? meta.default;
  }

  // 2) custom globals — active rows only; normalize() has already stripped
  //    builtin-name collisions to status:'error', and the belt-and-suspenders
  //    isBuiltinName guard below keeps a reserved global from ever writing
  //    over a builtin key.
  for (const g of normalizePricingVariables(unwrapGlobals(input.globals))) {
    if (g.status !== PRICING_VARIABLE_STATUS_ACTIVE) continue;
    if (isBuiltinName(g.name)) continue;
    env[g.name] = g.default_value;
  }

  // 3) explicit overrides win — canonicalize ci-matching keys onto the
  //    builtin/global casing already in env.
  if (isRecord(input.builtinOverrides)) {
    for (const [k, v] of Object.entries(input.builtinOverrides)) {
      if (v === undefined) continue;
      const canon = canonicalVariableName(k, env);
      if (!PRICING_VARIABLE_NAME_RE.test(canon)) continue;
      env[canon] = v;
    }
  }

  return env;
}

// ---------------------------------------------------------------------------
// resolution helper (UI/reporting side — more forgiving than the engine's
// case-sensitive lookup: exact own-prop first, then case-insensitive scan)
// ---------------------------------------------------------------------------

/**
 * Resolve one variable from an env map to a finite number.
 * Returns null when the name is absent or the value is not numeric.
 */
export function resolveVariable(
  name: string,
  env: PricingFormulaEnv | null | undefined,
): number | null {
  if (typeof name !== "string" || env === null || env === undefined) return null;
  const trimmed = name.trim();
  if (!trimmed || !isRecord(env)) return null;
  if (Object.prototype.hasOwnProperty.call(env, trimmed)) {
    return toFiniteNumber(env[trimmed]);
  }
  const lc = trimmed.toLowerCase();
  for (const k of Object.keys(env)) {
    if (k.toLowerCase() === lc) return toFiniteNumber(env[k]);
  }
  return null;
}
