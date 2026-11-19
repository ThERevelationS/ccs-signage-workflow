import { calculateFoundationReinforcementModel } from "./foundationReinforcementModel";
import { resolveFoundationReinforcementBasis } from "./foundationReinforcementBasis";
import { priceFoundationReinforcementModel } from "./foundationReinforcementCost";

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
  const steel = priceFoundationReinforcementModel(model, resolution?.basis);
  const issues = [
    ...model.issues.map(issue => ({ ...issue, scope: "geometry" })),
    ...(resolution?.issues || []).map(issue => ({ ...issue, scope: "basis" })),
    ...steel.issues.map(issue => ({ ...issue, scope: "pricing" })),
  ];
  return {
    calculationVersion: 2, projectionVersion: 1, engineeringApproved: false,
    model, steel, issues, basis: resolution?.basis ?? null,
    materialSnapshot: resolution?.materialSnapshot ?? null,
    rateSources: resolution?.rateSources ?? [],
    canApplyToEstimate: steel.canApplyToEstimate && !issues.some(issue => issue.severity === "error"),
  };
}
