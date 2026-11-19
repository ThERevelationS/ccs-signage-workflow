import { useMemo } from "react";
import { money, calcSignageCabinetPricing } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
import { PreliminaryNotice } from "./foundationPreliminaryNotice";
import { foundationReinforcementBOMRows } from "./foundationReinforcementBOMRows";
import { foundationWallBomRows } from "./wallCalculator";
import { landscapeSummary } from "./landscapeMaterials";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const qty = (n, unit) => `${num(n).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
const EMPTY_ITEMS = [];
const EMPTY_POLES = [];
const EMPTY_WALLS = [];
const EMPTY_TOTALS = {};
const EMPTY_INVENTORY = [];

export default function FoundationBOM({
  onSelectIssue,
  items = EMPTY_ITEMS,
  poles = EMPTY_POLES,
  walls = EMPTY_WALLS,
  delivery,
  totals = EMPTY_TOTALS,
  inventory = EMPTY_INVENTORY,
  itemPricing = EMPTY_ITEMS,
  polePricing = EMPTY_ITEMS,
  wallPricing = EMPTY_ITEMS,
  cabinets = EMPTY_ITEMS,
  landscape,
  landscapePricing,
  pricingUnavailable = false,
  project = null,
}) {
  const cabinetRows = useMemo(() => calcSignageCabinetPricing(cabinets), [cabinets]);
  const rows = useMemo(() => {
    const out = [];
    // rawQty is the real numeric quantity; displayQty is the formatted label.
    // A row with a positive quantity OR a known cost stays listed (free rows
    // included) â€” the formatted string is never parsed for the drop test.
    // O-097 "why this quantity" — every priced row may carry an honest
    // derivation note; it renders under the row like the reinforcement
    // notes already do. Only real derivation classes, never invented math.
    const add = (material, displayQty, cost, rawQty = num(displayQty), note = null, costClass = "calculated", supplierGroup = null, authorizationGate = null, sensitivityPct = null) => {
      if (num(rawQty) <= 0 && !hasFoundationCostSnapshot(cost)) return;
      // O-115 (CMP-I15) -- cost_class separates published-minimum / calculated /
      // contingency rows so "what changed the price" is honest provenance.
      // Lane E -- supplier_grouping/authorization_gate: the row's supplier
      // group + authorization gate ride the row (never an invented gate;
      // blank = "not recorded").
      // O-117 (CMP-I16) -- sensitivity_pct: a per-line ±% bound rides the row
      // (never an invented sensitivity; blank = "not recorded").
      out.push({ material, quantity: displayQty, cost, cost_class: costClass, ...(note ? { note } : {}),
        supplier_group: supplierGroup, authorization_gate: authorizationGate,
        ...(sensitivityPct != null ? { sensitivity_pct: sensitivityPct } : {}) });
    };
    const nameOf = (id) => inventory.find((i) => i.id === id)?.material_name || "Material";
    const resolved = items.filter((_, i) => itemPricing[i]?.available !== false);
    const blocked = items.filter((_, i) => itemPricing[i]?.available === false);

    if (delivery?.pricingUnavailable) {
      out.push({
        material: "Concrete delivery/order (saved)",
        quantity: Number.isFinite(delivery.roundedYards) ? qty(delivery.roundedYards, "CY") : "Not saved",
        cost: hasFoundationCostSnapshot(delivery.concreteTotal) ? delivery.concreteTotal : "Not saved",
        cost_class: "saved",
        saved: true,
      });
    } else if (num(delivery?.roundedYards) > 0) {
      add("Ready-mix concrete (delivered)", qty(delivery.roundedYards, "CY"), delivery.concreteTotal, delivery.roundedYards, "Volume from item footprints x depth x quantity, rounded to delivery order.");
    }
    const bags = resolved.reduce((s, i) => s + num(i.concrete_bags), 0);
    const baggedCost = resolved.reduce((s, i) => s + num(i.concrete_cost), 0);
    if (bags > 0 || baggedCost > 0) add("Bagged concrete", qty(bags, "bags"), baggedCost, bags, "Item volume converted to bag count at the supplier bag rate.");

    // Version-2 reinforcement (and its supports) lists authored split rows;
    // legacy items keep the unchanged aggregate row byte-for-byte.
    const legacyRebar = resolved.filter((item) => item.reinforcement_calculation_version !== 2);
    const rebarFt = legacyRebar.reduce((s, i) => s + num(i.rebar_feet), 0);
    const rebarLbs = legacyRebar.reduce((s, i) => s + num(i.rebar_weight_lbs), 0);
    const rebarCost = legacyRebar.reduce((s, i) => s + num(i.rebar_cost), 0);
    if (rebarFt > 0) {
      add(`Rebar (${qty(rebarLbs, "lbs")})`, qty(rebarFt, "LF"), rebarCost, rebarFt, "Aggregate authored rebar feet and weight on legacy items.");
    }
    resolved.filter((item) => item.reinforcement_calculation_version === 2).forEach((item) => {
      out.push(...foundationReinforcementBOMRows(item));
    });

    const formingQty = resolved.reduce((s, i) => s + num(i.forming_qty), 0);
    const formingCost = resolved.reduce((s, i) => s + num(i.forming_cost), 0);
    if (formingQty > 0) add("Forming material", qty(formingQty, "units"), formingCost, formingQty, "Form units from item perimeter x depth.");

    // O-116 (CMP-I15) -- a shop/user contingency row separate from the
    // calculated rows: `project.contingency_cost` (a disclosed allowance,
    // never an invented price) surfaces as a "contingency" cost_class row
    // so "what changed the price" names the contingency apart from the
    // published-minimum / calculated baseline.
    const contingency = num(project?.contingency_cost);
    if (contingency > 0) {
      add("Shop/user contingency", qty(1, "allowance"), contingency, 1, "A disclosed shop/user contingency allowance -- not a calculated baseline quantity.", "contingency");
    }

    // O-116 (CMP-I15) -- a published-minimum row separate from the
    // calculated + contingency rows: `project.published_min_cost` (the
    // published engineering minimum's authored amount, never an invented
    // price) surfaces as a "published_minimum" cost_class row so the
    // minimum-vs-baseline-vs-contingency separation is honest.
    const pubMin = num(project?.published_min_cost);
    if (pubMin > 0) {
      add("Published minimum", qty(1, "published"), pubMin, 1, "The published engineering-minimum authored amount -- a minimum bound, not a calculated baseline or a contingency.", "published_minimum");
    }

    // O-116 (CMP-I15) -- a priced-alternative row separate from the
    // calculated/contingency/published-minimum rows: `project.priced_alternative_cost`
    // (an elected alternative's authored amount, never an invented price)
    // surfaces as a "priced_alternative" cost_class row so "what the elected
    // alternative costs" reads apart from the calculated baseline.
    const pricedAlt = num(project?.priced_alternative_cost);
    if (pricedAlt > 0) {
      add("Priced alternative", qty(1, "alternative"), pricedAlt, 1, "An elected alternative's authored amount -- a priced-alternative estimate, not the calculated baseline.", "priced_alternative");
    }

    blocked.forEach((i) => {
      const label = `Foundation ${i.component_id ?? "?"} (saved)`;
      {
        out.push({
          material: `${label} â€” concrete`,
          quantity: Number.isFinite(i.concrete_bags) ? qty(i.concrete_bags, "bags") : "Not saved",
          cost: hasFoundationCostSnapshot(i.concrete_cost) ? i.concrete_cost : "Not saved",
          saved: true,
        });
      }
      if (i.reinforcement_calculation_version === 2) {
        out.push(...foundationReinforcementBOMRows(i, { saved: true }));
      } else if (i.include_rebar) {
        out.push({
          material: `${label} â€” rebar`,
          quantity: Number.isFinite(i.rebar_feet) ? qty(i.rebar_feet, "LF") : "Not saved",
          cost: hasFoundationCostSnapshot(i.rebar_cost) ? i.rebar_cost : "Not saved",
          saved: true,
        });
      }
      if (i.include_forming) {
        out.push({
          material: `${label} â€” forming`,
          quantity: Number.isFinite(i.forming_qty) ? qty(i.forming_qty, "units") : "Not saved",
          cost: hasFoundationCostSnapshot(i.forming_cost) ? i.forming_cost : "Not saved",
          saved: true,
        });
      }
    });

    const poleGroups = {};
    poles.forEach((p, index) => {
      // Held poles list their acknowledged amounts separately, never dropped.
      if (polePricing[index]?.available === false) return;
      if (!p.pole_id) return;
      poleGroups[p.pole_id] = poleGroups[p.pole_id] || { ft: 0, cost: 0 };
      // Billed length is the distinct required-length snapshot (explicit total
      // stock length, or height + embedment); the legacy y_offset_inches
      // spelling of embedment is the fallback for pre-CMP-E02 rows.
      const billedInches = hasFoundationCostSnapshot(p.required_length_inches)
        ? p.required_length_inches
        : num(p.height_inches) + num(p.embedment_inches ?? p.y_offset_inches);
      poleGroups[p.pole_id].ft += billedInches / 12;
      poleGroups[p.pole_id].cost += num(p.pole_cost);
    });
    Object.entries(poleGroups).forEach(([id, g]) => add(nameOf(id), qty(g.ft, "LF"), g.cost, g.ft));

    const polePainting = poles.reduce((s, p, index) =>
      polePricing[index]?.available === false ? s : s + num(p.pole_painting_cost), 0);
    if (polePainting > 0) {
      add("Pole painting", "â€”", polePainting);
    }

    const savedPoleFt = (p) => {
      const req = Number(p.required_length_inches);
      if (Number.isFinite(req) && req > 0) return req / 12;
      const h = Number(p.height_inches), d = Number(p.embedment_inches ?? p.y_offset_inches);
      return Number.isFinite(h) && h > 0 && Number.isFinite(d) && d >= 0 ? (h + d) / 12 : null;
    };
    poles.forEach((p, index) => {
      if (polePricing[index]?.available !== false) return;
      const label = `Pole ${index + 1} (saved)`;
      const ft = savedPoleFt(p);
      out.push({
        material: `${label} â€” pole`,
        quantity: Number.isFinite(ft) ? qty(ft, "LF") : "Not saved",
        cost: hasFoundationCostSnapshot(p.pole_cost) ? p.pole_cost : "Not saved",
        saved: true,
      });
      if (p.include_pole_painting || hasFoundationCostSnapshot(p.pole_painting_cost)) {
        out.push({
          material: `${label} â€” painting`,
          quantity: "â€”",
          cost: hasFoundationCostSnapshot(p.pole_painting_cost) ? p.pole_painting_cost : "Not saved",
          saved: true,
        });
      }
      // O-064 (CMP-E09) -- per-sign BOM rows: each authored sign row lists its
      // own unit_cost + optional hardware/labor/paint/waste, so a multi-sign
      // pole shows every sign (count + placement per sign row).
      (Array.isArray(p.signs) ? p.signs : []).forEach((s, si) => {
        const extras = ["hardware_cost", "labor_cost", "paint_cost", "waste_cost"]
          .map((k) => Number(s?.[k]) || 0)
          .reduce((a, b) => a + b, 0);
        // O-063 (CMP-E08) -- a display_only linked sign lists its row without a
        // billed cost (the linked product carries the fabrication/installation
        // charge elsewhere; this row stays visible, never billed twice).
        const linked = s?.display_only === true;
        out.push({
          material: `${label} — sign ${si + 1}${s?.name ? ` (${s.name})` : ""}`,
          quantity: `1 sign${s?.faces ? ` x ${s.faces} faces` : ""}${linked ? " (linked)" : ""}`,
          cost: linked ? "—" : hasFoundationCostSnapshot(s?.unit_cost) ? Number(s.unit_cost) + extras : "Not saved",
          saved: true,
        });
      });
    });

    out.push(...foundationWallBomRows(walls, inventory, wallPricing));

    (totals.wall_caps_by_material || []).forEach((g) => {
      // O-050 (CMP-D07) -- BOM preview notes: the cap's authored
      // profile/slope/end_treatment/supplies/cut_labor extras surface on the
      // row's note — "what's in the cap" reads honest provenance vs a bare
      // qty x cost row.
      const notes = [g.profile, g.slope, g.end_treatment].filter(Boolean).join(", ");
      const extras = [g.supplies_cost > 0 ? "supplies" : null, g.cut_labor_cost > 0 ? "cut labor" : null].filter(Boolean).join(" + ");
      add(g.name || "Wall cap", qty(g.qty, "pcs"), g.cost, g.qty, [notes, extras].filter(Boolean).join("; ") || null);
    });

    // Signage cabinets â€” a priced row lists at the acknowledged unit cost Ã—
    // quantity; a held row lists its saved state like the blocked foundation
    // items above (never a silently repriced $0 line).
    cabinetRows.forEach((row, index) => {
      const cabinet = cabinets[index] || {};
      const label = cabinet.description || `Signage cabinet ${index + 1}`;
      if (row.available === false) {
        const recordedQty = Number(cabinet.quantity);
        out.push({
          material: `${label} (saved)`,
          quantity: Number.isFinite(recordedQty) ? qty(recordedQty, "pcs") : "Not saved",
          cost: "Not saved",
          saved: true,
        });
        return;
      }
      const quantity = cabinet.quantity === undefined || cabinet.quantity === null || cabinet.quantity === ""
        ? 1
        : Number(cabinet.quantity);
      add(label, qty(quantity, "pcs"), row.cost, quantity);
    });

    // Landscape / site materials â€” a fully priced grid lists one row per
    // material; a held grid keeps the acknowledged section total as a single
    // saved row, exactly like the saved concrete-delivery row above.
    if (landscapePricing && landscapePricing.available === false) {
      out.push({
        material: "Site landscaping (saved)",
        quantity: "â€”",
        cost: hasFoundationCostSnapshot(totals.total_landscape_cost) ? totals.total_landscape_cost : "Not saved",
        saved: true,
      });
    } else {
      landscapeSummary(landscape).lines.forEach((line) => {
        if (line.cost === null || line.sqft === null) {
          out.push({
            material: `Site â€” ${line.label} (saved)`,
            quantity: Number.isFinite(line.sqft) ? qty(line.sqft, "sq ft") : qty(line.cells, "cells"),
            cost: "Not saved",
            saved: true,
          });
          return;
        }
        add(`Site â€” ${line.label}`, qty(line.sqft, "sq ft"), line.cost, line.sqft);
      });
    }

    return out;
  }, [items, poles, walls, delivery, totals, inventory, itemPricing, polePricing, wallPricing, cabinets, cabinetRows, landscape, landscapePricing]);

  const materialTotal = rows.every(r => hasFoundationCostSnapshot(r.cost)) ? rows.reduce((sum, row) => sum + row.cost, 0) : null;
  const listedPricingUnavailable = pricingUnavailable || rows.some((row) => row.basisUnavailable);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 mb-3">Bill of Materials</h3>
      {/* O-119 (CMP-I18) -- preliminary notice on the BOM print block:
          the BOM carries "Preliminary estimating only - final engineering
          required" like every other structural concept surface. */}
      <PreliminaryNotice />
      {listedPricingUnavailable && (
        <div className="mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1">
          <p className="text-[11px] font-semibold text-amber-800">Pricing unavailable â€” saved quantities may be outdated.</p>
          {itemPricing.filter(p => p && p.available === false)
            .concat(polePricing.filter(p => p && p.available === false))
            .concat(cabinetRows.filter(p => p && p.available === false))
            .concat(landscapePricing && landscapePricing.available === false ? [landscapePricing] : [])
            .flatMap((p, k) =>
            (p.issues || []).map((i, j) => (
              <p key={`${k}-${j}`} className="text-[10px] text-amber-700">
                {i.message}
                {/* O-097 -- click-to-fix: the issue's componentId navigates to
                    the problematic object in the scene. */}
                {onSelectIssue && (i.componentId != null || i.index != null) && (
                  <button
                    type="button"
                    onClick={() => onSelectIssue(i)}
                    className="ml-1 text-[9px] text-amber-800 underline hover:text-amber-900"
                    aria-label={`Select ${i.kind || "item"} ${i.index != null ? i.index + 1 : ""}${i.field ? ` field ${i.field}` : ""}`}
                  >(select{i.field ? ` ${i.field}` : ""})</button>
                )}
              </p>
            ))
          )}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No materials yet â€” add a foundation to build the list.</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="py-1.5">Material</th>
                <th className="py-1.5">Quantity</th>
                <th className="py-1.5 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className={`py-1.5 pr-3 text-gray-800${r.note ? " min-w-0 break-words" : ""}`}>
                    {r.material}
                    {/* O-115 (CMP-I15) -- cost-class provenance tag. */}
                    {r.cost_class && r.cost_class !== "calculated" && (
                      <span className="ml-1 rounded-sm bg-gray-100 px-1 text-[9px] uppercase tracking-wide text-gray-500">{r.cost_class.replace(/_/g, " ")}</span>
                    )}
                    {/* O-117 (CMP-I16) -- per-line sensitivity bound. */}
                    {r.sensitivity_pct != null && (
                      <span className="ml-1 rounded-sm bg-blue-50 px-1 text-[9px] text-blue-700" title="Sensitivity bound on this row's cost">±{r.sensitivity_pct}%</span>
                    )}
                    {r.note && <p className="mt-1 text-[11px] leading-snug text-gray-500 break-words">{r.note}</p>}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap text-gray-600">{r.quantity}</td>
                  <td className="py-1.5 pl-3 whitespace-nowrap text-right text-gray-900">{hasFoundationCostSnapshot(r.cost) ? money(r.cost) : "Not saved"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between pt-3 mt-1 border-t border-gray-200 font-bold text-gray-900">
            <span>Listed cost subtotal</span>
            <span>{listedPricingUnavailable ? <span className="text-amber-700">Pricing unavailable</span> : hasFoundationCostSnapshot(materialTotal) ? money(materialTotal) : "Not saved"}</span>
          </div>
        </>
      )}
    </div>
  );
}