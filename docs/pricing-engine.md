# Pricing engine architecture

Status: decision record + reference for `base44/shared/pricingEngine.ts`.
Scope: how a cost base becomes a customer price — tier resolution, markup,
qty-break charts, minimums, tax — and how that engine composes with the
existing estimator modules.

## 1. Current flow (as built)

The sell-price path today is layered and partly duplicated:

1. **Module cost engines** — `src/components/estimator/{vinyl,channel,paint,metal,brick,maintenance,laser,cnc,foundation}/*Calc.js`.
   Each produces a domain-specific **cost buildup** (roll nesting + waste,
   paint mix ratios and gun-cleaning labor, letter perimeter math, machine
   time) and most also apply a single flat `markup_percent` on top, emitting
   `subtotal` + `markup_amount` = `total_cost` — the project's sell price.
2. **Internal vs customer economics** — `customerPricing.js#sourceProjectEconomics`
   splits `internalCost` (shop cost) from `customerPrice` (sell), honoring a
   saved `record.customer_pricing` snapshot when one exists.
3. **Customer tiers (markup)** — `markup/markupEngine.jsx#applyMarkups` +
   `markup/savedCustomerPricing.js`: a `MarkupTier` record carries a
   `markups[category_key]` multiplier map; tier resolution is
   `requested tier → project snapshot → customer.pricing_tier → 1`. Volume
   discount brackets (Settings `volume_discount_bracket_*`) discount eligible
   categories after markup. Result is persisted on the project as
   `customer_pricing {applied, total, tier_number, lines[]}`.
4. **Estimate waterfall** — `aioPricing.js#computePricing`: accepted unit
   price (`customer_price_snapshot` → `total_snapshot` fallback) × qty →
   per-line + per-category adjustments → discount% → contingency% →
   shipping/permit fees → tax% → optional round → deposit% → balance.
5. **Pricing admin (CoreBridge-parity, newer)** — backend-only entities
   `PricingTierMatrix` / `LaborLevel` / `MachineRate` via
   `pricing/pricingPersistence.js`, priced by the **pure frontend engine**
   `pricing/pricingEngine.js` (matrix specificity category+tier > category >
   tier > blank; qty `per_unit_breaks`; `pricing_mode: 'market'`; formula
   modifiers; labor levels; machine rates; `minimum_charge`). Consumed today
   by `pages/PricingAdmin.jsx` (matrix editor + quote simulator) and
   `components/pricing/MatrixSuggestPanel.jsx` — **not** yet wired into the
   estimator modules or the aio waterfall.
6. **Walk-in** — `walkin/walkInModel.js` keeps its own qty × unit + taxable
   subtotal × tax% roll-up (mirrors `invoicingAction` computeTotals).

## 2. Target CoreBridge model (COREBRIDGE_MAP.md §8)

CoreBridge prices **parts**, not whole projects:

- A part's **pricing chart** is qty breaks × customer tiers — each cell is a
  margin; two chart modes: cost-plus margin and **market-based**
  (retail − discount %, interpolated).
- **Tier precedence** (stated as "customer tier → part-specific tier/fixed →
  machine override"): the customer's assigned tier is the base column; a
  part-specific tier or fixed price overrides it; a machine-level override
  wins last. With no configured layer the shop global default applies.
- Supporting machinery: setup fees, `minimum_charge` floors, taxable flags,
  labor levels with rates, per-machine cost/override profiles, formula
  modifiers with reserved vars, GL income/COGS mapping.

## 3. The shared engine — `base44/shared/pricingEngine.ts`

Pure TypeScript. **Zero imports** — no `node:*`, no `npm:*`, no entity/io —
so the same file runs inside Deno-style `base44/functions` and in the Vite
frontend (esbuild/Vite strip the types). Deterministic: identical inputs →
identical output, money rounded to cents (`round2`), unit prices to 4 dp
(`round4`).

### Exports

| Export | Purpose |
|---|---|
| `TIER_PRECEDENCE` | `['global_default','customer_tier','part_tier','part_fixed','machine_override']` — weakest→strongest |
| `resolveTier(context)` | Picks the winning pricing layer; returns `{source, rule, matchedRow, trace[]}` |
| `pricePart(input)` | Full pipeline: cost base → tier → unit price → modifiers → extension → minimum → setup fee → tax → total |
| `priceLines({lines, ...shared})` | `pricePart` over a line array with shared context; sums extended/subtotal/tax/total + `minimumsApplied` |
| `pickUnitBreak(breaks, qty)` | Highest qualifying `{qty, unit_price}` bracket |
| `applyFormulaModifiers(unitPrice, mods)` | Ordered `add_pct`/`mul`/`add_flat`/`min`/`max` with audit trail |
| `rowIsEffective(row, now)` | `effective_from`/`effective_to` window check |
| `round2`, `round4` | Money/unit rounding |

### Precedence semantics (F-03)

`resolveTier` walks the ladder **base → override**; each layer that produces
a rule replaces the previous winner, so the *most specific configured layer
wins*:

```
machine_override  (fixed_price > tier_ref > per_unit_breaks > market > markup_pct)
part_fixed        (part.fixed_price / price_override — explicit sell price)
part_tier         (part.tier_ref → chart row; part.per_unit_breaks chart;
                   part market fields; part.markup_pct)
customer_tier     (chart row pinning the customer's tier: category+tier beats
                   tier-only; tier keys match name/number/id)
global_default    (non-tier chart row: category row beats blank row;
                   else implicit {markup_pct: defaultMarkupPct})
```

Rules and edge cases:

- **Tier-key matching**: a `customer_tier` cell may store a tier name,
  number, or record id; `tierKeySet` matches any of them.
- **Chart rows** are `PricingTierMatrix`-shaped: `status` inactive and
  out-of-window (`effective_from`/`effective_to`) rows never compete.
  In-layer ties break by latest `effective_from` → latest `updated_date` →
  lowest id (fully deterministic).
- **Chart-layer competition (F-27 parity)**: the winner across the
  `customer_tier`/`global_default` chart layers is chosen by specificity
  score, matching legacy `resolveMatrixRow.matchSpecificity` — a
  category+tier row (score 3) beats a category-only row (2), which beats a
  bare `customer_tier` row (1), which beats blank (0). Within each layer the
  shared tie-break still applies (scoped > unscoped → effective_from →
  updated_date → lowest id). Part/machine descriptor layers still override
  chart layers in ladder order.
- **Dangling `tier_ref`** still claims its layer (kind `markup`, pct 0) and
  reports `danglingTierRef` — a misconfigured override must not silently
  fall through to a cheaper/weaker layer.
- **Rule kinds**: `fixed` (unit price, breaks ignored) · `markup`
  (cost × (1+pct/100); a qualifying break beats it outright) · `market`
  (retail × (1−disc/100); a break only wins when it undercuts market) ·
  `breaks` (chart only; no qualifying bracket → descriptor's markup or cost).
- **Minimums**: `max(rule.minimum_charge, input.minimumCharge)` floors the
  extension, never fires on a zero/empty line; setup fee is added *after*
  the floor so a minimum can't eat it.
- **Tax**: `taxable !== false` lines pay `(extended + setupFee) × taxPercent`;
  exempt lines pay 0. Returns a full `trace[]` (`hit`/`won` per layer) for
  admin UI and audit.

## 4. Decision: compose — inject the engine underneath, keep the estimators

**DECISION: keep every CCS module estimator intact; inject the shared engine
underneath them as the sell-price stage.** Not a rewrite.

Why this is right:

1. **The modules' value is cost fidelity, not pricing policy.** Roll
   nesting/waste, paint mix ratios, letter perimeter + color-change labor,
   machine runtimes — that domain math is the hard-won part and CoreBridge
   has no equivalent to copy. Replacing it would *lose* accuracy.
2. **What's actually duplicated is the tail**: flat `markup_percent` per
   module, the MarkupTier multiplier pass, the aio waterfall's
   discount/tax/deposit, walkInModel's tax roll-up. That tail is exactly
   what the engine standardizes.
3. **CB precedent is compositional**: CoreBridge itself treats cost buildup
   (machines, labor levels, material) as inputs to the pricing chart — the
   chart doesn't do costing. Our calcs = CB's cost side; the engine = the
   chart side.
4. **A pure shared module is the only shape that reaches every consumer**:
   estimators (live repricing), `aioPricing` waterfall, walk-in, AND Deno
   functions (invoice/quote parity server-side) — one import path, one
   semantics, no entity access needed at the math layer.
5. **Incremental adoption, no big-bang**: modules keep emitting
   `total_cost`; adoption = each module (or the aio line-rollup) handing
   `unitCost` + context to `pricePart` and writing the breakdown back into
   `customer_price_snapshot` / `customer_pricing`. The existing
   `pricingEngine.js` frontend consumers (PricingAdmin simulator,
   MatrixSuggestPanel) can re-point at the shared file or keep their flat
   matrix semantics during transition — the shared engine deliberately
   keeps identical money semantics (`markup_pct` = percent over cost,
   `per_unit_breaks`, `minimum_charge`, market mode, formula modifiers) so
   chart data is interchangeable.

The main deliberate difference from the frontend engine — tier-pinning rows
outranking non-tier category rows — is required by the §8 precedence order
and is documented in §3 so admins aren't surprised when both engines are on
screen during migration.
