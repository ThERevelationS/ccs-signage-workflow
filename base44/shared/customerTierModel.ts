// Customer pricing-tier resolution — pure TS, zero entity/io imports. Safe to
// import from Deno functions (base44/functions/*) and from frontend modules.
//
// Model (ESTIMATOR_MASTERPLAN F-22; entity base44/entities/Customer.jsonc
// `pricing_tier` — A-10, type `number` default 1; the spec's string-tier
// conflict is documented there as number-vs-string LEFT):
//
//   A customer's tier is the ASSIGNMENT the admin makes on the Customer record
//   (EstimatorCustomers tier select / NewCustomerDialog). It is stored as the
//   MarkupTier.tier_number (1-8 per MarkupTier.jsonc: "1 = General Public
//   (highest markup), 8 = Friends & Family (lowest)") but tolerates named
//   string keys ('wholesale'), because PricingTierMatrix.customer_tier and
//   GlobalPricingTier.rules[].tier pin MarkupTier.tier_name / tier_number /
//   record id — all matched case-insensitively after normalization.
//
//   The resolved tier KEY is the value callers hand to the shared pricing
//   engine as `customerTier` (base44/shared/pricingEngine.ts resolveTier —
//   tierKeySet at ~line 105 builds the key set, rowPinsTier ~line 123 matches
//   matrix-row `customer_tier` pins). A bare-string key like '2' matches rows
//   pinning the tier_number '2'; when the MarkupTier catalog is loaded, pass
//   the catalog ROW (or a {tier_name, tier_number} object) as `customerTier`
//   instead so the engine's key set also covers tier_name/id pins.
//
//   Within the engine's chart the F-27 legacy specificity order applies:
//   category+tier row (3) > category-only row (2) > tier-only row (1) >
//   blank row (0) — so resolving the right tier key is what promotes a
//   tier-pinned chart row into the `customer_tier` ladder layer.
//
// Known-tier set (isKnownTier / knownTiers): union of
//   - integer tier numbers 1..TIER_NUMBER_MAX (the persisted storage space —
//     Customer.pricing_tier is schema-typed `number`),
//   - PRICING_TIERS (canonical named fallback — no GlobalSettings.pricing_tiers
//     exists, so the spec default list stands in),
//   - configured keys: settings.pricing_tiers (strings or MarkupTier-like
//     objects), opts.tiers / settings.tiers / settings.markup_tiers catalog
//     rows — each row contributes ALL of its keys (tier_number, tier_name,
//     name, id) exactly like the engine's tierKeySet so a matrix pin under
//     any spelling counts as known.
// `settings` may be a flat settings object or a GlobalSettings row
// ({setting_key, setting_value:{...}}) — both levels are probed.
//
// Legacy parity note: resolveCustomerTier skips (and flags) non-blank-but-
// unknown candidates exactly like savedCustomerPricing.js resolveTierNumber,
// which iterates candidates and takes the first one validating against the
// loaded MarkupTier rows before falling back to the shop default.

// Canonical named-tier fallback list (masterplan brief F-22 — used because no
// GlobalSettings `pricing_tiers` convention exists yet). Numeric tiers are
// inherently known via TIER_NUMBER_MIN/MAX; this list covers named keys.
export const PRICING_TIERS: readonly string[] = Object.freeze([
  'retail',
  'wholesale',
  'contract',
  'vip',
]);

export const DEFAULT_TIER = 'retail';

// MarkupTier.jsonc documents tier_number as "Tier number 1-8" and
// Customer.pricing_tier is schema-typed number — integer keys inside this
// range are always valid tier references even with no catalog loaded.
export const TIER_NUMBER_MIN = 1;
export const TIER_NUMBER_MAX = 8;

// Wildcard pin: a pricing row whose tier pin is '*' (or blank) applies to
// every customer tier — same wildcard token machineCosts.ts honors in
// tier_markups maps ('default'/'*').
export const TIER_WILDCARD = '*';

// Display-label overrides for the canonical fallback list (nicer than
// title-cased 'Vip').
const TIER_LABEL_OVERRIDES: Record<string, string> = {
  retail: 'Retail',
  wholesale: 'Wholesale',
  contract: 'Contract',
  vip: 'VIP',
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const normStr = (v: unknown): string => String(v ?? '').trim().toLowerCase();

// Normalized key for ONE tier value, or '' when the value carries no usable
// reference. Numbers collapse to their canonical integer-ish string ('2',
// not '2.0' — Number('2.0') === 2 → '2'; non-finite → ''). MarkupTier-like
// objects resolve to a single canonical key preferring tier_number (the
// Customer.pricing_tier storage convention), then tier_name, name, id, then
// the loose `tier`/`key` aliases tolerated on rule/catalog rows.
export function normalizeTierKey(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number' || typeof v === 'string') {
    const s = normStr(v);
    if (!s) return '';
    // Canonicalize numeric spellings: '02'/'2.0'/2 → '2'. Non-numeric stays.
    const n = Number(s);
    if (s !== '' && Number.isFinite(n) && /^[-+]?\d+(\.\d+)?$/.test(s)) {
      return String(n);
    }
    return s;
  }
  if (typeof v === 'object') {
    const t: any = v;
    for (const f of ['tier_number', 'tier_name', 'name', 'id', 'tier', 'key']) {
      const k = normalizeTierKey(t[f]);
      if (k) return k;
    }
  }
  return '';
}

// All normalized keys a tier value answers to — mirrors the engine's
// tierKeySet (tier_name / tier_number / id / name) plus tolerated 'tier'/'key'
// aliases so callers can test every pin form a matrix row might use. Objects
// contribute each non-blank field key; scalars contribute themselves.
export function tierKeys(v: unknown): string[] {
  const keys = new Set<string>();
  const add = (x: unknown) => {
    if (x == null || typeof x === 'object' || typeof x === 'function') return;
    const k = normStr(x);
    if (k) keys.add(k);
  };
  if (isObj(v)) {
    const t: any = v;
    add(t.tier_number);
    add(t.tier_name);
    add(t.name);
    add(t.id);
    add(t.tier);
    add(t.key);
  } else {
    const k = normalizeTierKey(v);
    if (k) keys.add(k);
  }
  return [...keys];
}

// True when the normalized key is an integer inside the persisted tier_number
// space (MarkupTier.jsonc "Tier number 1-8").
const isNumericTierKey = (k: string): boolean => {
  if (!/^\d+$/.test(k)) return false;
  const n = Number(k);
  return Number.isInteger(n) && n >= TIER_NUMBER_MIN && n <= TIER_NUMBER_MAX;
};

// Read one named field out of a settings-ish object, probing both the top
// level and a GlobalSettings-style {setting_value:{...}} wrapper.
const settingField = (settings: any, names: string[]): any => {
  if (!isObj(settings)) return undefined;
  for (const n of names) {
    if (settings[n] !== undefined && settings[n] !== null) return settings[n];
  }
  const sv = settings.setting_value;
  if (isObj(sv)) {
    for (const n of names) {
      if (sv[n] !== undefined && sv[n] !== null) return sv[n];
    }
  }
  return undefined;
};

// The shop default tier key: settings.default_tier (tolerating camelCase /
// default_pricing_tier spellings, and a GlobalSettings setting_value wrapper)
// when it holds a non-blank value, else DEFAULT_TIER. The configured value is
// used verbatim-after-normalization — it IS the declared default; flag it via
// isKnownTier when drift detection matters.
export function defaultTier(opts: any = {}): string {
  const settings = opts?.settings ?? opts;
  const raw = settingField(settings, [
    'default_tier',
    'defaultTier',
    'default_pricing_tier',
    'defaultPricingTier',
  ]);
  const k = normalizeTierKey(raw);
  return k || DEFAULT_TIER;
}

// Catalog/configured tier rows for known-set construction. Accepts a
// MarkupTier row array via opts.tiers or the settings-level spellings
// settings.tiers / settings.markup_tiers / settings.tier_catalog (probing
// setting_value too).
const catalogRows = (opts: any): any[] => {
  const direct = opts?.tiers;
  const settings = opts?.settings ?? opts;
  const configured = settingField(settings, [
    'tiers',
    'markup_tiers',
    'markupTiers',
    'tier_catalog',
    'tierCatalog',
  ]);
  const out: any[] = [];
  for (const list of [direct, configured]) {
    for (const row of Array.isArray(list) ? list : []) {
      if (row != null) out.push(row);
    }
  }
  return out;
};

// settings.pricing_tiers (or tolerated camelCase/customer_tiers spellings) —
// an explicit named-tier list; entries may be key strings or tier objects.
const configuredTierList = (opts: any): any[] => {
  const settings = opts?.settings ?? opts;
  const list = settingField(settings, [
    'pricing_tiers',
    'pricingTiers',
    'customer_tiers',
    'customerTiers',
  ]);
  return Array.isArray(list) ? list : [];
};

// Full known-tier key set (see header): numeric 1-8 ∪ PRICING_TIERS ∪
// configured pricing_tiers ∪ every key of every catalog row.
export function knownTiers(opts: any = {}): Set<string> {
  const keys = new Set<string>();
  for (let n = TIER_NUMBER_MIN; n <= TIER_NUMBER_MAX; n += 1) keys.add(String(n));
  for (const t of PRICING_TIERS) keys.add(t);
  for (const entry of configuredTierList(opts)) {
    for (const k of tierKeys(entry)) keys.add(k);
  }
  for (const row of catalogRows(opts)) {
    for (const k of tierKeys(row)) keys.add(k);
  }
  return keys;
}

// True when `tier` (string | number | MarkupTier-like) resolves to at least
// one key inside the known set.
export function isKnownTier(tier: unknown, opts: any = {}): boolean {
  const keys = tierKeys(tier);
  if (!keys.length) return false;
  const known = knownTiers(opts);
  return keys.some((k) => known.has(k) || isNumericTierKey(k));
}

export type CustomerTierInfo = {
  tier: string; // final resolved key — feed pricingEngine resolveTier.customerTier
  source: string; // 'pricing_tier' | 'tier' | 'settings_default' | 'hard_default'
  raw: unknown; // raw value that produced the resolution
  known: boolean; // resolved key is inside the known set
  unknown: boolean; // a non-blank customer tier field was skipped as unknown
  unknown_tiers: string[]; // normalized keys of skipped unknown candidates
  default_tier: string; // resolved shop default (audit echo)
};

// Resolve the customer's pricing tier to a normalized key.
//   Chain (first KNOWN non-blank wins):
//     customer.pricing_tier → customer.tier → settings.default_tier → 'retail'
//   Non-blank-but-unknown customer fields are skipped AND flagged
//   (info.unknown / info.unknown_tiers) — legacy resolveTierNumber parity:
//   an unconfigured tier never silently prices. The settings_default slot is
//   the admin-declared default so a non-blank value wins without a known-set
//   veto (known:false flags it in the info result).
export function resolveCustomerTierInfo(customer: any, opts: any = {}): CustomerTierInfo {
  const settings = opts?.settings ?? opts;
  const known = knownTiers(opts);
  const dflt = defaultTier(opts);
  const c = isObj(customer) ? customer : {};
  const skipped: string[] = [];

  const candidates: Array<{ field: string; value: unknown }> = [
    { field: 'pricing_tier', value: (c as any).pricing_tier },
    { field: 'tier', value: (c as any).tier },
  ];
  for (const cand of candidates) {
    const key = normalizeTierKey(cand.value);
    if (!key) continue;
    if (known.has(key) || isNumericTierKey(key)) {
      return {
        tier: key,
        source: cand.field,
        raw: cand.value,
        known: true,
        unknown: skipped.length > 0,
        unknown_tiers: skipped,
        default_tier: dflt,
      };
    }
    skipped.push(key);
  }

  const settingsDefaultRaw = settingField(settings, [
    'default_tier',
    'defaultTier',
    'default_pricing_tier',
    'defaultPricingTier',
  ]);
  const settingsDefaultKey = normalizeTierKey(settingsDefaultRaw);
  if (settingsDefaultKey) {
    return {
      tier: settingsDefaultKey,
      source: 'settings_default',
      raw: settingsDefaultRaw,
      known: known.has(settingsDefaultKey) || isNumericTierKey(settingsDefaultKey),
      unknown: skipped.length > 0,
      unknown_tiers: skipped,
      default_tier: dflt,
    };
  }

  return {
    tier: DEFAULT_TIER,
    source: 'hard_default',
    raw: null,
    known: true, // DEFAULT_TIER is a PRICING_TIERS member — always known
    unknown: skipped.length > 0,
    unknown_tiers: skipped,
    default_tier: dflt,
  };
}

// Bare tier-key string — the drop-in `customerTier` argument for
// base44/shared/pricingEngine.ts resolveTier / pricePart / priceLines.
export function resolveCustomerTier(customer: any, opts: any = {}): string {
  return resolveCustomerTierInfo(customer, opts).tier;
}

// Does a pricing-chart row apply to this tier? The row's pin is read from
// `customer_tier` first (PricingTierMatrix.jsonc field), falling back to
// `tier` (GlobalPricingTier.rules[] field). A blank pin or a '*' pin applies
// to EVERY tier (the engine treats blank customer_tier as the category-wide
// default; '*' is the tolerated explicit wildcard — machineCosts honors the
// same token). Otherwise the row applies when ANY pin matches ANY key of the
// tier value (exact normalized match — mirrors rowPinsTier).
export function tierRowApplies(row: any, tier: unknown): boolean {
  if (!isObj(row)) return false;
  const pins = [normStr(row.customer_tier), normStr(row.tier)].filter((p) => p);
  if (!pins.length) return true;
  if (pins.some((p) => p === TIER_WILDCARD)) return true;
  const keys = new Set(tierKeys(tier));
  return pins.some((p) => keys.has(p));
}

// Admin-assignment patch (F-22 — admin UI assigns tier). Validates the tier
// against the known set (numeric 1-8 ∪ PRICING_TIERS ∪ configured/catalog
// keys) and returns the Customer update:
//   { pricing_tier, pricing_tier_set_by, pricing_tier_set_at }
// `pricing_tier` writes back as a NUMBER when the tier is an integer inside
// the persisted 1-8 space (Customer.jsonc schema type), else as the
// normalized string key (named-tier path — same spelling a matrix row pins).
// Throws on blank or unknown tiers — callers surface the message.
export function tierAssignmentPatch(
  customer: any,
  tier: unknown,
  opts: any = {},
): { pricing_tier: number | string; pricing_tier_set_by: unknown; pricing_tier_set_at: string } {
  const key = normalizeTierKey(tier);
  if (!key) {
    throw new Error('pricing tier is required — pass a tier number (1-8) or a known tier name');
  }
  if (!isKnownTier(key, opts)) {
    throw new Error(`unknown pricing tier "${key}" — not in the configured tier list or numeric range ${TIER_NUMBER_MIN}-${TIER_NUMBER_MAX}`);
  }
  // `customer` is accepted for call-site symmetry with sibling patch models
  // and future CAS anchoring; the assignment itself is unconditional.
  const now = opts?.now;
  const at = now instanceof Date
    ? now.toISOString()
    : now != null && now !== ''
      ? String(now)
      : new Date().toISOString();
  return {
    pricing_tier: isNumericTierKey(key) ? Number(key) : key,
    pricing_tier_set_by: opts?.actor_id ?? opts?.actor ?? null,
    pricing_tier_set_at: at,
  };
}

export type EffectiveTierInfo = {
  tier: string; // effective tier key for the quote
  source: string; // 'estimate' | 'customer' | ... (delegates to customer info)
  via: string; // 'estimate.pricing_tier' or the winning customer-chain slot
  estimate_tier: string | null; // normalized estimate override, when present
  estimate_known: boolean; // override inside the known set (false → flag for UI)
  customer: CustomerTierInfo; // customer-level resolution (fallback + audit)
};

// Effective tier for a quote/estimate: estimate.pricing_tier is the explicit
// per-quote override and wins WHENEVER it carries a non-blank value
// (tolerated aliases: estimate.tier, estimate.customer_pricing_tier —
// VinylProject-style spellings). Blank → the customer's resolved tier. The
// info variant flags a non-blank-but-unknown override so admin UIs can warn;
// the key itself is still honored — a matrix row may pin it before the tier
// catalog is configured.
export function effectiveTierForQuoteInfo(
  customer: any,
  opts: any = {},
): EffectiveTierInfo {
  const estimate = isObj(opts?.estimate) ? opts.estimate : {};
  const estRaw =
    (estimate as any).pricing_tier ??
    (estimate as any).tier ??
    (estimate as any).customer_pricing_tier;
  const estKey = normalizeTierKey(estRaw);
  const customerInfo = resolveCustomerTierInfo(customer, opts);
  if (estKey) {
    return {
      tier: estKey,
      source: 'estimate',
      via: 'estimate.pricing_tier',
      estimate_tier: estKey,
      estimate_known: isKnownTier(estKey, opts),
      customer: customerInfo,
    };
  }
  return {
    tier: customerInfo.tier,
    source: 'customer',
    via: customerInfo.source,
    estimate_tier: null,
    estimate_known: false,
    customer: customerInfo,
  };
}

// Bare effective tier-key string — feed pricingEngine resolveTier.customerTier.
export function effectiveTierForQuote(customer: any, opts: any = {}): string {
  return effectiveTierForQuoteInfo(customer, opts).tier;
}

// Display label for admin pickers/badges. Catalog rows contribute their
// tier_name when a key matches (tier_number 2 → 'Wholesale'); numeric keys
// with no catalog row label as 'Tier 2'; named keys title-case with
// PRICING_TIERS overrides (vip → 'VIP').
export function tierLabel(tier: unknown, opts: any = {}): string {
  const key = normalizeTierKey(tier);
  if (!key) return '';
  for (const row of catalogRows(opts)) {
    if (!isObj(row)) continue;
    const rowKeys = tierKeys(row);
    if (!rowKeys.includes(key)) continue;
    const label = String((row as any).tier_name ?? (row as any).name ?? '').trim();
    if (label) return label;
  }
  if (TIER_LABEL_OVERRIDES[key]) return TIER_LABEL_OVERRIDES[key];
  if (isNumericTierKey(key)) return `Tier ${key}`;
  return key
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
