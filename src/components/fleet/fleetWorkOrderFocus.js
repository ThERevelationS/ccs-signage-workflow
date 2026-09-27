// Locate a keyboard destination only in the currently filtered work-order view.
// Board cards are duplicated for mobile/desktop; ignore the hidden copy.
export function findWorkOrderFocusTarget(rows, id, viewMode, root) {
  if (!id || !rows.some((row) => row.id === id)) return null;
  if (viewMode === "list") return root.getElementById(`fleet-work-order-toggle-${id}`);
  return Array.from(root.querySelectorAll("button[data-fleet-board-open]"))
    .find((button) => button.dataset.fleetBoardOpen === id && button.getClientRects().length > 0) || null;
}

export function workOrderSaveFocusNotice({ verb, label, visible }) {
  return visible
    ? `${verb} ${label}. Use the view controls to locate the updated work order.`
    : `${verb} ${label}. It no longer matches the current filters.`;
}
