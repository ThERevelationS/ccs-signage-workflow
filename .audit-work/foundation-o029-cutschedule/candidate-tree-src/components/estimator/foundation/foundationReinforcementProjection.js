import { calculateFoundationReinforcementModel } from "./foundationReinforcementModel";
import { resolveFoundationReinforcementBasis } from "./foundationReinforcementBasis";
import { priceFoundationReinforcementModel } from "./foundationReinforcementCost";
import { resolveFoundationReinforcementSupports } from "./foundationReinforcementSupport";
import { calculateFoundationReinforcementCutSchedule } from "./foundationReinforcementCutSchedule";

// Always calculate from current raw inputs, never a stored geometry/cost result.
// Readiness here is internal steel pricing only, not source/quote authorization.
export function calculateFoundationReinforcementProjection({
  item, design, material, inventory = [], settings = {},
  quantityOverride = null, rateOverride = null, geometryLimit = 0,
} = {}) {
  const record = item && typeof item === "object" && !Array.isArray(item) ? item : {};
  const model = calculateFoundationReinforcementModel(record, design, { geometryLimit });
  const resolution = model.status === "off" ? null : resolveFoundationReinforcementBasis({
    material, inventory, settings, quantityOverride, rateOverride,
  });
  // Support catalog economics resolve only from the fresh modeled geometry and
  // the current catalog — never a stored pick or count.
  const supports = model.status === "valid"
    ? resolveFoundationReinforcementSupports({
      item: record, design, model,
      material: resolution?.materialSnapshot ?? null, inventory, basis: resolution?.basis ?? {},
    })
    : null;
  // Cut/stock schedule (O-029): derived from the fresh model runs against the
  // stock lengths on the actually-configured rebar catalog row. It never
  // reprices steel; unresolvable stock stays a structured gap, a proven
  // cut-longer-than-stock is an error that holds the item like any other.
  const cutSchedule = ["valid", "off"].includes(model.status)
    ? calculateFoundationReinforcementCutSchedule({
      item: record, design, model,
      material: resolution?.materialSnapshot ?? null, inventory,
    })
    : null;
  const steel = priceFoundationReinforcementModel(model, resolution?.basis, supports);
  const issues = [
    ...model.issues.map(issue => ({ ...issue, scope: "geometry" })),
    ...(resolution?.issues || []).map(issue => ({ ...issue, scope: "basis" })),
    ...(supports?.issues || []).map(issue => ({ ...issue, scope: "supports" })),
    ...(cutSchedule?.issues || []).map(issue => ({ ...issue, scope: "cut_schedule" })),
    ...steel.issues.map(issue => ({ ...issue, scope: "pricing" })),
  ];
  return {
    calculationVersion: 2, projectionVersion: 1, engineeringApproved: false,
    model, steel, issues, basis: resolution?.basis ?? null, supports, cutSchedule,
    materialSnapshot: resolution?.materialSnapshot ?? null,
    rateSources: resolution?.rateSources ?? [],
    canApplyToEstimate: steel.canApplyToEstimate && !issues.some(issue => issue.severity === "error"),
  };
}