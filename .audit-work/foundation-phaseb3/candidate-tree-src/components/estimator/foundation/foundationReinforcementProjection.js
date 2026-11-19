import { calculateFoundationReinforcementModel } from "./foundationReinforcementModel";
import { resolveFoundationReinforcementBasis } from "./foundationReinforcementBasis";
import { priceFoundationReinforcementModel } from "./foundationReinforcementCost";
import { resolveFoundationReinforcementSupports } from "./foundationReinforcementSupport";

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
  const steel = priceFoundationReinforcementModel(model, resolution?.basis, supports);
  const issues = [
    ...model.issues.map(issue => ({ ...issue, scope: "geometry" })),
    ...(resolution?.issues || []).map(issue => ({ ...issue, scope: "basis" })),
    ...(supports?.issues || []).map(issue => ({ ...issue, scope: "supports" })),
    ...steel.issues.map(issue => ({ ...issue, scope: "pricing" })),
  ];
  return {
    calculationVersion: 2, projectionVersion: 1, engineeringApproved: false,
    model, steel, issues, basis: resolution?.basis ?? null, supports,
    materialSnapshot: resolution?.materialSnapshot ?? null,
    rateSources: resolution?.rateSources ?? [],
    canApplyToEstimate: steel.canApplyToEstimate && !issues.some(issue => issue.severity === "error"),
  };
}