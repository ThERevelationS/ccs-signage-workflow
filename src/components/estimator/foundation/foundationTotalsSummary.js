// Sticky-totals summary model (O-096 / CMP-H05) — pure derivations for
// FoundationTotals: the separate cost/sell/margin trio, the itemized takeoff,
// and the missing-input checklist. No React, no entity access, no imports —
// identical input produces identical output, so the whole surface is
// unit-testable under Node.
//
// Held/acknowledged contract (mirrors calc + BOM surfaces):
//   • A held component keeps its acknowledged snapshot amounts; rows that
//     display them are flagged `held` so the UI can label "(saved)".
//   • A non-finite amount is unavailable — the model returns null and the UI
//     renders "Not saved"/"—"; nothing is laundered to $0 or guessed.
//   • Margin is only produced when BOTH sides are actually known — never a
//     fabricated margin on a held or projected value. When the applied
//     customer_pricing snapshot carries its own internal cost
//     (raw_subtotal), the acknowledged cost-vs-sell pair is exposed too.

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v) =>
  v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const arr = (v) => (Array.isArray(v) ? v : []);
const isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const fmtQty = (n, unit, digits = 2) =>
  fin(n) ? `${n.toLocaleString(undefined, { maximumFractionDigits: digits })} ${unit}` : null;
const joinQty = (parts) => {
  const out = parts.filter((p) => typeof p === "string" && p !== "");
  return out.length ? out.join(" · ") : null;
};

// ─── Persisted split-total partition ─────────────────────────────────────────
// The same 12-field partition O-010 established (FOUNDATION_RECORD_TOTAL_FIELDS
// in builderService.js — kept in sync there; the model test asserts parity).
// total_brick_cost / total_fill_cost are subsets of total_wall_cost and are
// NEVER counted separately. A non-finite partition field is a held bucket:
// the checklist enumerates it instead of pretending the amount exists.
export const FOUNDATION_STICKY_PARTITION_FIELDS = [
  ["total_concrete_cost", "Concrete"],
  ["total_rebar_cost", "Rebar"],
  ["total_excavation_cost", "Excavation"],
  ["total_forming_materials_cost", "Forming materials"],
  ["total_labor_cost", "Labor"],
  ["total_wall_cost", "Walls"],
  ["total_pole_cost", "Poles"],
  ["total_pole_painting_cost", "Pole painting"],
  ["total_equipment_cost", "Equipment"],
  ["total_wall_cap_cost", "Wall caps"],
  ["total_signage_cabinet_cost", "Signage cabinets"],
  ["total_landscape_cost", "Site landscaping"],
];

const FOUNDATION_TYPE_LABEL = {
  spread_foot: "spread footing",
  pillar: "pillar/caisson",
};

// ─── Sticky cost / sell / margin ─────────────────────────────────────────────
//
// Sell precedence mirrors customerPricing.sourceProjectEconomics' foundation
// branch exactly: pricing engine > applied tier snapshot > price override >
// markup %. The engine side is injectable (engineResolver = the
// foundationEngineEconomics seam) so this module stays import-free; callers
// pass the real resolver when a record is wired and null otherwise.
//
// Held-safety rules:
//   • override and applied-tier sell are recorded values — they display even
//     while pricing is paused (they are the acknowledged sell, not a guess).
//   • the manual markup baseline requires the LIVE internal cost — a markup
//     projected over a held amount would fabricate a customer price, so it
//     resolves "none" while only a saved cost remains.
//   • margin requires a known cost AND a known sell; basis labels which cost
//     was compared ("live" vs "saved").

export function resolveFoundationStickySummary({
  sectionTotal = null,
  savedSectionTotal = null,
  pricingUnavailable = false,
  project = null,
  engineResolver = null,
} = {}) {
  const liveCost = fin(sectionTotal) ? sectionTotal : null;
  const savedCost = fin(savedSectionTotal) ? savedSectionTotal : null;
  const cost = liveCost !== null ? liveCost : savedCost;
  const costSource = liveCost !== null ? "live" : savedCost !== null ? "saved" : "none";

  const projectLinked = project !== null && project !== undefined;
  const markupPercent = numOrNull(project?.customer_markup_percent) ?? 0;
  const override = numOrNull(project?.customer_price_override);
  const cp = isRecord(project?.customer_pricing) ? project.customer_pricing : null;
  const tierTotal = cp?.applied === true && numOrNull(cp?.total) !== null ? numOrNull(cp.total) : null;
  const tierCost = numOrNull(cp?.raw_subtotal);

  // Manual baseline = exactly the panel/economics formula — but only against
  // the live cost AND only when the record is actually wired: with no project
  // prop the recorded markup/override are unknown, so an implicit 0% sell
  // would fabricate a customer price. Held-only cost leaves it unresolved too.
  const manualBaseline = projectLinked && liveCost !== null
    ? (override !== null && override > 0 ? override : liveCost * (1 + markupPercent / 100))
    : null;

  let sell = null;
  let sellSource = "none";
  let sellLabel = "Not recorded";

  // Engine resolution is gated on a live baseline the same way the manual
  // markup is: with the internal cost held, an engine number computed against
  // a forced-zero baseline would be a fabricated sell, not a recorded one.
  if (projectLinked && typeof engineResolver === "function" && manualBaseline !== null) {
    let wired = null;
    try {
      wired = engineResolver(project, {
        baselineSell: manualBaseline,
        internalCost: cost,
        markupPercent,
      });
    } catch {
      wired = null;
    }
    if (wired && fin(wired.customerPrice)) {
      sell = wired.customerPrice;
      sellSource = "engine";
      sellLabel = "Pricing engine";
    }
  }
  if (sell === null && tierTotal !== null) {
    sell = tierTotal;
    sellSource = "tier";
    sellLabel = `Tier ${cp.tier_number ?? "—"} applied`;
  }
  if (sell === null && override !== null && override > 0) {
    sell = override;
    sellSource = "override";
    sellLabel = "Price override";
  }
  if (sell === null && manualBaseline !== null) {
    sell = manualBaseline;
    sellSource = "markup";
    sellLabel = markupPercent > 0 ? `Markup ${markupPercent}%` : "Cost (no markup)";
  }

  const marginAmount = sell !== null && cost !== null ? sell - cost : null;
  const marginPct = marginAmount !== null && sell > 0 ? (marginAmount / sell) * 100 : null;
  const marginBasis = marginAmount !== null ? costSource : "none";

  // Acknowledged pair straight from the snapshot fields: when the applied
  // tier recorded both its sell total and the internal cost it was computed
  // on, that pair is the margin the customer actually accepted — shown as a
  // footnote when it diverges from the cost displayed.
  const acknowledged = sellSource === "tier" && fin(tierCost)
    ? {
        sell: tierTotal,
        cost: tierCost,
        marginAmount: tierTotal - tierCost,
        marginPct: tierTotal > 0 ? ((tierTotal - tierCost) / tierTotal) * 100 : null,
        differs: cost === null || Math.abs(tierCost - cost) > 0.005,
      }
    : null;

  return {
    cost: { value: cost, source: costSource },
    sell: { value: sell, source: sellSource, label: sellLabel },
    margin: { amount: marginAmount, pct: marginPct, basis: marginBasis },
    acknowledged,
    projectLinked,
    pricingUnavailable: pricingUnavailable === true,
  };
}

// ─── Itemized takeoff ────────────────────────────────────────────────────────
//
// Itemized = per-component rows grouped by section, each carrying the
// quantity basis and its own amount. Rows a held component leaves behind are
// flagged `held` (acknowledged snapshot shown) and amountless held rows keep
// `amount: null` → the UI renders "Not saved", never $0.
//
// Data slices are passed in so the module stays import-free; the component
// supplies calc.* (items/walls/poles/caps/equipment/delivery/pricing flags)
// and project-derived rows (cabinets, landscape) when wired.

export function buildFoundationTakeoff({
  totals = {},
  items = null,
  itemPricing = null,
  walls = null,
  wallPricing = null,
  poles = null,
  polePricing = null,
  wallCaps = null,
  equipment = null,
  equipmentPricing = null,
  delivery = null,
  cabinets = null,
  cabinetRows = null,
  landscapeLines = null,
  landscapePricing = null,
} = {}) {
  const groups = [];
  const addGroup = (key, label, rows) => {
    if (rows.length) groups.push({ key, label, rows });
  };

  // ── Foundations: one row per item + the delivery order row ──
  const foundationRows = [];
  arr(items).forEach((item, index) => {
    const held = arr(itemPricing)[index]?.available === false;
    const typeLabel = FOUNDATION_TYPE_LABEL[item?.foundation_type] || "foundation";
    const qty = joinQty([
      fmtQty(numOrNull(item?.concrete_volume_cy), "CY"),
      numOrNull(item?.rebar_feet) > 0 ? fmtQty(numOrNull(item.rebar_feet), "LF rebar", 1) : null,
      numOrNull(item?.forming_qty) > 0 ? fmtQty(numOrNull(item.forming_qty), "forming", 1) : null,
      numOrNull(item?.excavation_volume_cy) > 0 ? fmtQty(numOrNull(item.excavation_volume_cy), "CY dug") : null,
    ]);
    foundationRows.push({
      key: `item-${index}`,
      label: `Item ${index + 1} — ${typeLabel} ×${numOrNull(item?.quantity) ?? 1}`,
      qty,
      amount: fin(item?.item_total_cost) ? item.item_total_cost : null,
      held,
    });
  });
  const deliveryRows = (() => {
    // Live delivery from calc when wired; otherwise the totals snapshot fields.
    const src = isRecord(delivery) ? delivery : null;
    const yards = src ? numOrNull(src.roundedYards) : numOrNull(totals?.concrete_delivered_yards);
    const trucks = src ? arr(src.trucksList).length : arr(totals?.concrete_trucks).length;
    const amount = src ? numOrNull(src.concreteTotal) : numOrNull(totals?.concrete_delivery_cost);
    const held = src?.pricingUnavailable === true;
    if (yards === null && !trucks && amount === null) return [];
    return [{
      key: "delivery",
      label: "Concrete delivery",
      qty: joinQty([
        yards !== null ? fmtQty(yards, "yd", 1) : null,
        trucks > 0 ? `${trucks} truck${trucks === 1 ? "" : "s"}` : null,
        fin(numOrNull(src?.additionalStopsCost ?? totals?.additional_stops_cost)) && numOrNull(src?.additionalStopsCost ?? totals?.additional_stops_cost) > 0
          ? "+ extra stops" : null,
      ]),
      amount,
      held,
    }];
  })();
  addGroup("foundations", "Foundations", [...foundationRows, ...deliveryRows]);

  // ── Masonry walls: one row per wall, material + labor + internal fill ──
  addGroup("masonry", "Masonry walls", arr(walls).map((wall, index) => {
    const held = arr(wallPricing)[index]?.available === false;
    const cc = isRecord(wall?.calculatedCosts) ? wall.calculatedCosts : {};
    const matUnit = cc.materialQuantityUnit === "cy" ? "CY" : "units";
    const linearFt = numOrNull(cc.totalLinearInches);
    const qty = joinQty([
      numOrNull(cc.totalBricks) !== null ? fmtQty(numOrNull(cc.totalBricks), matUnit, 0) : null,
      linearFt !== null ? fmtQty(linearFt / 12, "LF outline", 1) : null,
      numOrNull(cc.internalTotalBricks) > 0
        ? `+${fmtQty(numOrNull(cc.internalTotalBricks), cc.internalMaterialQuantityUnit === "cy" ? "CY" : "units", 0)} internal`
        : null,
    ]);
    return {
      key: `wall-${index}`,
      label: wall?.name || `Wall ${index + 1}`,
      qty,
      amount: fin(cc.totalCost) ? cc.totalCost : null,
      held,
    };
  }));

  // ── Poles: billed required length + stock count (+ painting flag) ──
  addGroup("poles", "Poles", arr(poles).map((pole, index) => {
    const held = arr(polePricing)[index]?.available === false;
    const billedInches = numOrNull(pole?.required_length_inches)
      ?? (numOrNull(pole?.height_inches) !== null && numOrNull(pole?.embedment_inches ?? pole?.y_offset_inches) !== null
        ? numOrNull(pole.height_inches) + numOrNull(pole.embedment_inches ?? pole?.y_offset_inches)
        : null);
    const qty = joinQty([
      billedInches !== null ? fmtQty(billedInches / 12, "LF billed", 1) : null,
      numOrNull(pole?.stock_pieces) > 0 ? `${numOrNull(pole.stock_pieces)} stock pc${numOrNull(pole.stock_pieces) === 1 ? "" : "s"}` : null,
      numOrNull(pole?.pole_painting_cost) > 0 ? "+ painting" : null,
    ]);
    return {
      key: `pole-${index}`,
      label: pole?.pole_name || `Pole ${index + 1}`,
      qty,
      amount: fin(pole?.total_cost) ? pole.total_cost : null,
      held,
    };
  }));

  // ── Wall caps: per-piece rows when calc is wired; per-material rollup
  //    from the totals snapshot otherwise ──
  const capRows = (() => {
    if (Array.isArray(wallCaps) && wallCaps.length) {
      return wallCaps.map((cap, index) => {
        const cut = numOrNull(cap?.length_inches ?? cap?.cut_length_inches);
        return {
          key: `cap-${index}`,
          label: cap?.cap_name || `Cap ${index + 1}`,
          qty: joinQty([cut !== null ? fmtQty(cut, "in cut", 1) : null]),
          amount: fin(cap?.cost) ? cap.cost : null,
          held: !fin(cap?.cost),
        };
      });
    }
    return arr(totals?.wall_caps_by_material).map((g, index) => ({
      key: `capmat-${index}`,
      label: g?.name || `Wall cap material ${index + 1}`,
      qty: numOrNull(g?.qty) !== null ? `${numOrNull(g.qty)} pcs` : null,
      amount: fin(g?.cost) ? g.cost : null,
      held: !fin(g?.cost),
    }));
  })();
  addGroup("wall_caps", "Wall caps", capRows);

  // ── Equipment rentals: period + duration + delivery flag ──
  addGroup("equipment", "Equipment", arr(equipment).map((entry, index) => {
    const held = arr(equipmentPricing)[index]?.available === false;
    const duration = numOrNull(entry?.custom_qty ?? entry?.rental_duration) ?? 1;
    const period = entry?.rental_period || "day";
    const qty = joinQty([
      fmtQty(duration, period, 1),
      entry?.include_delivery ? "+ delivery" : null,
    ]);
    return {
      key: `equip-${index}`,
      label: `Equipment ${index + 1}`,
      qty,
      amount: fin(entry?.equipment_cost) ? entry.equipment_cost : null,
      held,
    };
  }));

  // ── Signage cabinets (page-level extras; priced rows passed in) ──
  addGroup("cabinets", "Signage cabinets", arr(cabinetRows).map((row, index) => {
    const cabinet = arr(cabinets)[index] || {};
    const quantity = cabinet.quantity === undefined || cabinet.quantity === null || cabinet.quantity === ""
      ? 1 : numOrNull(cabinet.quantity);
    return {
      key: `cabinet-${index}`,
      label: cabinet.description || `Cabinet ${index + 1}`,
      qty: quantity !== null ? `${numOrNull(quantity)} pcs` : null,
      amount: fin(row?.cost) ? row.cost : null,
      held: row?.available === false,
    };
  }));

  // ── Site landscape: one row per recorded material ──
  addGroup("landscape", "Site landscape", arr(landscapeLines).map((line, index) => ({
    key: `land-${index}`,
    label: line?.label || `Material ${index + 1}`,
    qty: fin(line?.sqft) ? fmtQty(line.sqft, "sq ft") : (numOrNull(line?.cells) !== null ? `${numOrNull(line.cells)} cells` : null),
    amount: fin(line?.cost) ? line.cost : null,
    held: landscapePricing?.available === false || !fin(line?.cost),
  })));

  const rowCount = groups.reduce((s, g) => s + g.rows.length, 0);
  return { groups, rowCount };
}

// ─── Missing-input checklist ─────────────────────────────────────────────────
//
// Enumerates the held/unavailable inputs the surface already knows about.
// Blocking channels (design inputs, catalog & settings) are the same lists
// the page's pricingBlocked gate reads; advisory channels (placement,
// construction checks) never block; the held-amounts channel enumerates
// partition buckets whose amount is currently unavailable — it catches held
// components even when the upstream issue list misses them (e.g. wall-cap
// holds, whose issues do not reach the calc channels).
//
// `channelsKnown` distinguishes "issues were checked and none exist" from
// "no issue channel was wired to this panel" — the complete/empty state must
// only be claimed when the channels were actually consulted.

export function buildFoundationInputChecklist({
  totals = {},
  pricingUnavailable = false,
  calc = null,
  issues = null,
  assemblyIssues = null,
} = {}) {
  const src = isRecord(issues) ? issues : isRecord(calc) ? calc : {};
  const channelsKnown = isRecord(issues) || isRecord(calc);
  const catalogIssues = arr(src.catalogIssues);
  const inputIssues = arr(src.inputIssues);
  const constructionWarnings = arr(src.constructionWarnings);
  const placements = arr(assemblyIssues);

  const seen = new Set();
  const items = (list) => arr(list).filter((issue) => {
    const key = `${issue?.code ?? ""}|${issue?.kind ?? ""}|${issue?.index ?? ""}|${issue?.componentId ?? ""}|${issue?.field ?? ""}|${issue?.message ?? issue ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((issue, i) => ({
    key: `${issue?.code ?? "issue"}-${issue?.kind ?? ""}-${issue?.index ?? i}-${issue?.field ?? ""}-${i}`,
    message: String(issue?.message ?? issue),
    code: issue?.code ?? null,
    field: issue?.field ?? null,
  }));

  const heldItems = [];
  for (const [field, label] of FOUNDATION_STICKY_PARTITION_FIELDS) {
    if (!fin(totals?.[field])) {
      heldItems.push({
        key: `held-${field}`,
        message: `${label} — amount unavailable (saved amount shown where recorded)`,
        code: "held_amount",
        field,
      });
    }
  }
  if (isRecord(calc?.delivery) && calc.delivery.pricingUnavailable === true) {
    heldItems.push({
      key: "held-delivery",
      message: "Concrete delivery — held at the saved order snapshot",
      code: "held_amount",
      field: "delivery",
    });
  }
  // Catch-all: pricing paused but no enumerated reason (defensive — the
  // blocked gate should always have a reason, but never render an empty
  // checklist under an unavailable banner).
  if (pricingUnavailable === true && inputIssues.length === 0 && catalogIssues.length === 0 && heldItems.length === 0) {
    heldItems.push({
      key: "held-pricing",
      message: "Pricing is paused — review highlighted inputs and catalog selections",
      code: "pricing_paused",
      field: null,
    });
  }

  const groups = [
    { key: "inputs", label: "Design inputs", severity: "blocking", items: items(inputIssues) },
    { key: "catalog", label: "Catalog & settings", severity: "blocking", items: items(catalogIssues) },
    { key: "assembly", label: "Placement", severity: "advisory", items: items(placements) },
    { key: "checks", label: "Construction checks", severity: "advisory", items: items(constructionWarnings) },
    { key: "held", label: "Held amounts", severity: "held", items: heldItems },
  ].filter((g) => g.items.length > 0);

  const blockingCount = groups.filter((g) => g.severity === "blocking").reduce((s, g) => s + g.items.length, 0);
  const advisoryCount = groups.filter((g) => g.severity === "advisory").reduce((s, g) => s + g.items.length, 0);
  const heldCount = heldItems.length;
  const totalCount = groups.reduce((s, g) => s + g.items.length, 0);

  return {
    groups,
    blockingCount,
    advisoryCount,
    heldCount,
    totalCount,
    channelsKnown,
    // "Complete" is only claimed when the issue channels were actually
    // consulted and nothing is outstanding — never assumed on an unwired panel.
    complete: channelsKnown && totalCount === 0,
  };
}
