export function estimateNumberLookups(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/^(?:est-?)?(\d+)$/i);
  if (!match) return [];
  const normalized = `EST-${match[1].replace(/^0+(?=\d)/, "").padStart(5, "0")}`;
  return [...new Set([normalized, raw])];
}

export function copyComparableEstimate(estimate) {
  return {
    ...estimate,
    line_items: (estimate?.line_items || []).map(({ last_price_check_at, ...line }) => line),
  };
}

export async function copyEstimateSections({ sourceEstimateId, estimateId, lines, expectedEstimateUpdatedAt, clone, getEstimate, onProgress }) {
  const copied = [];
  const failures = [];
  let version = expectedEstimateUpdatedAt;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let failed = false;
    onProgress?.({ index: index + 1, total: lines.length, line });
    try {
      const result = await clone({ estimateId, sourceEstimateId, line, expectedEstimateUpdatedAt: version });
      copied.push({ line, result });
    } catch (error) {
      failed = true;
      failures.push({ line, message: error?.message || "The Product could not be copied." });
    }
    if (index < lines.length - 1) {
      try {
        const current = await getEstimate(estimateId);
        if (!current?.updated_date) throw new Error("The target Estimate version could not be verified.");
        if (failed && version && current.updated_date !== version) {
          throw new Error("The estimate changed during the failed copy. Reload and resolve any pending Product before continuing.");
        }
        version = current.updated_date;
      } catch (error) {
        for (const remaining of lines.slice(index + 1)) {
          failures.push({ line: remaining, message: error?.message || "The target Estimate could not be reloaded." });
        }
        break;
      }
    }
  }
  return { copied, failures };
}
