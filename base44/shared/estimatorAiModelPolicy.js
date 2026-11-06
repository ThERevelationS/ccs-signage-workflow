export const ESTIMATOR_AI_MODEL = "gpt_6_sol";
export const ESTIMATOR_AI_TRANSPORT = "base44.integrations.Core.InvokeLLM";
export const ESTIMATOR_AI_POLICY_VERSION = "2026-11-06.sol.v1";
export const ESTIMATOR_AI_MODULE_KEYS = Object.freeze([
  "foundation", "channel_letters", "maintenance", "painting", "laser", "cnc", "metal", "vinyl",
]);

export function estimatorAiModelFor(moduleKey) {
  if (!ESTIMATOR_AI_MODULE_KEYS.includes(moduleKey)) {
    throw new Error("Unsupported estimator AI module.");
  }
  return ESTIMATOR_AI_MODEL;
}
