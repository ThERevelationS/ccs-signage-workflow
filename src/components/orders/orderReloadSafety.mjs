// Order Form only. A delayed refresh must not replace a newer snapshot, and
// an unrelated refresh may not commit during a manual Smartsheet pull.
export function canCommitOrderReload({
  requestGeneration,
  latestGeneration,
  manualPullInFlight = false,
  manualPullReload = false,
} = {}) {
  return Number.isSafeInteger(requestGeneration) &&
    Number.isSafeInteger(latestGeneration) &&
    requestGeneration === latestGeneration &&
    (!manualPullInFlight || manualPullReload);
}
