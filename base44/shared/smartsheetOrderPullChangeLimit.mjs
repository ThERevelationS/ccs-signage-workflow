// Order Form only. The downloaded sheet can be much larger than the number of
// linked Base44 Orders that actually need an update. Enforce the configured
// mass-change limit against proposed writes, before performing any.
export function orderPullChangeLimit({ proposedUpdates, configuredLimit } = {}) {
  const limit = Math.max(1, Number(configuredLimit) || 25);
  if (!Number.isSafeInteger(proposedUpdates) || proposedUpdates < 0 || !Number.isFinite(limit)) {
    return { allowed: false, limit, reason: 'The number of planned Order updates could not be verified. No Orders were changed.' };
  }
  return proposedUpdates <= limit
    ? { allowed: true, limit, proposedUpdates }
    : {
      allowed: false,
      limit,
      proposedUpdates,
      reason: `${proposedUpdates} linked Order updates exceed the configured ${limit}-record mass-change limit. No Orders were changed; review or adjust the limit before retrying.`,
    };
}
