const DATASET_KEYS = Object.freeze(["sales", "orders"]);

const WRITE_INTENT_FLAGS = Object.freeze([
  "mirror_enabled",
  "pull_enabled",
  "push_enabled",
  "create_base44_from_smartsheet",
  "create_smartsheet_from_base44",
]);

export function enforceSmartsheetBackendSafety(config = {}, { writeBackendAvailable = false } = {}) {
  // Configuration is persisted as the admin enters it. The deployed backend
  // independently enforces write safety at runtime, so we do NOT strip toggle
  // values here — doing so silently reverted the admin's saved settings.
  return {
    ...(config || {}),
    sales: { ...(config?.sales || {}) },
    orders: { ...(config?.orders || {}) },
  };
}

export function smartsheetWriteControlsLocked(apiStatus) {
  return apiStatus?.write_actions_available !== true;
}