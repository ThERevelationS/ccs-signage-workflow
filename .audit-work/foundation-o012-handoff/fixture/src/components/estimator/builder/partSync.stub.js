// O-012 harness stub for ./partSync inside builderService bundles — the real
// partSync is exercised separately via its own bundle (extractBuilderParts).
// Test-controlled via globalThis.__ccsPartSync.
const defaultSummary = () => ({
  partCount: 0,
  detachedCount: 0,
  changedCount: 0,
  newPartCount: 0,
  removedPartCount: 0,
  recalcRequired: false,
  recalcReason: "",
  usesDirectLiveReprice: false,
  currentPartsTotal: 0,
  frozenPartsTotal: 0,
  currentMarkupTotal: 0,
  frozenMarkupTotal: 0,
  manualAddonFrozenTotal: 0,
  manualAddonCurrentTotal: 0,
  parts: [],
});

export async function loadVerifiedBuilderPartSyncInputs() {
  return {
    catalogs: globalThis.__ccsPartSync?.catalogs || {},
    existingParts: globalThis.__ccsPartSync?.existingParts || [],
    inventoryRowsOverride: globalThis.__ccsPartSync?.inventoryRowsOverride || new Map(),
  };
}

export async function syncBuilderParts(args = {}) {
  const hooks = globalThis.__ccsPartSync || {};
  if (typeof hooks.onSync === "function") hooks.onSync(args);
  return { ...defaultSummary(), ...(hooks.syncResult || {}) };
}

export async function acceptBuilderPartPrices() {
  const hooks = globalThis.__ccsPartSync || {};
  return hooks.acceptResult || { detachedCount: 0, acceptancePlan: { part_updates: [] }, changedParts: [] };
}

export async function applyBuilderPartPriceAcceptancePlan() {
  return { applied: true };
}
