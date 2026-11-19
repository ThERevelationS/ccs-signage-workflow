// base44/shared/estimatorDesignActionWire.ts
var ESTIMATOR_DESIGN_ACTIONS = [
  "reference_analysis",
  "next_questions",
  "propose",
  "revise"
];
var ESTIMATOR_DESIGN_MODULE_KEYS = [
  "foundation",
  "brick_stone",
  "channel",
  "cabinet",
  "monument",
  "pylon",
  "custom"
];
var ESTIMATOR_DESIGN_IMPLEMENTED_MODULES = [
  "foundation"
];
function classifyEstimatorDesignRequest(body) {
  const b = body && typeof body === "object" ? body : {};
  const action = typeof b.action === "string" ? b.action : null;
  if (!action || !ESTIMATOR_DESIGN_ACTIONS.includes(action))
    return { ok: false, error: "unknown_action", known: ESTIMATOR_DESIGN_ACTIONS };
  const moduleKey = typeof b.module_key === "string" ? b.module_key : null;
  if (!moduleKey || !ESTIMATOR_DESIGN_MODULE_KEYS.includes(moduleKey))
    return { ok: false, error: "unknown_module", known: ESTIMATOR_DESIGN_MODULE_KEYS };
  if (!ESTIMATOR_DESIGN_IMPLEMENTED_MODULES.includes(moduleKey))
    return { ok: false, error: "module_not_implemented", known: ESTIMATOR_DESIGN_IMPLEMENTED_MODULES };
  return { ok: true, request: { ...b, action, module_key: moduleKey } };
}
export {
  ESTIMATOR_DESIGN_ACTIONS,
  ESTIMATOR_DESIGN_IMPLEMENTED_MODULES,
  ESTIMATOR_DESIGN_MODULE_KEYS,
  classifyEstimatorDesignRequest
};
