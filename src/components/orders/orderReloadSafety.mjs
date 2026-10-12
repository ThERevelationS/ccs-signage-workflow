// Order Form only. A delayed refresh must not replace a newer snapshot, and
// an unrelated refresh may not commit during a manual Smartsheet pull.
export function canCommitOrderReload({
  requestGeneration,
  latestGeneration,
  manualPullInFlight = false,
  manualPullReload = false,
  startedEditGeneration = 0,
  latestEditGeneration = 0,
  localEditInProgress = false,
} = {}) {
  return Number.isSafeInteger(requestGeneration) &&
    Number.isSafeInteger(latestGeneration) &&
    requestGeneration === latestGeneration &&
    Number.isSafeInteger(startedEditGeneration) &&
    Number.isSafeInteger(latestEditGeneration) &&
    startedEditGeneration === latestEditGeneration &&
    !localEditInProgress &&
    (!manualPullInFlight || manualPullReload);
}
