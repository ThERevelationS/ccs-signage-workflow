export function reconcileActiveSalesColumnPreset(currentPreset, selectedRows) {
  const currentId = String(currentPreset?.id || "").trim();
  if (!currentId || !Array.isArray(selectedRows)) return null;
  return selectedRows.find((row) => row?.type === "column_preset" && row?.id === currentId) || null;
}
