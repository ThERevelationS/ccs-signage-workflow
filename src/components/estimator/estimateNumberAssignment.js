export function needsEstimateNumber(estimate) {
  return !!estimate?.id && estimate.deleted !== true
    && String(estimate.status || "").trim().toLowerCase() !== "archived"
    && !String(estimate.estimate_number || "").trim();
}

export async function numberForEstimateAttempt(attempt, issueNumber) {
  if (attempt.estimateNumber) return attempt.estimateNumber;
  if (!attempt.numberPromise) {
    attempt.numberPromise = Promise.resolve().then(issueNumber).then((response) => {
      const number = String(response?.data?.number || response?.number || "").trim();
      if (!number) throw new Error("A new estimate number could not be issued.");
      attempt.estimateNumber = number;
      return number;
    });
  }
  const pending = attempt.numberPromise;
  try {
    return await pending;
  } finally {
    if (attempt.numberPromise === pending) delete attempt.numberPromise;
  }
}

export async function assignMissingEstimateNumber({ entity, estimateId, issueNumber, saveNumber }) {
  const current = await entity.get(estimateId);
  if (!current?.id) throw new Error("Estimate could not be loaded to assign its number.");
  if (!needsEstimateNumber(current)) return current;
  const number = String(await issueNumber() || "").trim();
  if (!number) throw new Error("A new estimate number could not be issued.");
  try {
    return await saveNumber(current, number);
  } catch (error) {
    const latest = await entity.get(estimateId);
    if (!latest?.id) throw error;
    if (!needsEstimateNumber(latest)) return latest;
    error.latestEstimate = latest;
    throw error;
  }
}
