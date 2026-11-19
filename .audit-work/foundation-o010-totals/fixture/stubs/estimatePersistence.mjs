export function expectedEstimateFields(_estimate, _next) { return {}; }
export async function replaceEstimateFieldsIfUnchanged({ nextFields } = {}) {
  return { ...(nextFields || {}) };
}
