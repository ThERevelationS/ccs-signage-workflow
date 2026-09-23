const DATASET_KEYS = Object.freeze(["sales", "orders"]);

const WRITE_INTENT_FLAGS = Object.freeze([
  "mirror_enabled",
  "pull_enabled",
  "push_enabled",
  "create_base44_from_smartsheet",
  "create_smartsheet_from_base44",
]);

export function enforceSmartsheetBackendSafety(config = {}, { writeBackendAvailable = false } = {}) {
  const next = {
    ...(config || {}),
    sales: { ...(config?.sales || {}) },
    orders: { ...(config?.orders || {}) },
  };

  if (writeBackendAvailable) return next;

  next.global_enabled = false;
  next.observation_mode = true;

  for (const dataset of DATASET_KEYS) {
    for (const flag of WRITE_INTENT_FLAGS) {
      next[dataset][flag] = false;
    }
  }

  return next;
}

export function smartsheetWriteControlsLocked(apiStatus) {
  return apiStatus?.write_actions_available !== true;
}
