export function hasEstimateVersionConflict(knownUpdatedAt, currentUpdatedAt) {
  const known = String(knownUpdatedAt || "").trim();
  const current = String(currentUpdatedAt || "").trim();
  return !!(known && current && known !== current);
}
