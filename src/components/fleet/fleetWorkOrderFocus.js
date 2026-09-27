// Locate a keyboard destination only in the currently filtered work-order view.
// Board cards are duplicated for mobile/desktop; ignore the hidden copy.
export function findWorkOrderFocusTarget(rows, id, viewMode, root) {
  if (!id || !rows.some((row) => row.id === id)) return null;
  if (viewMode === "list") return root.getElementById(`fleet-work-order-toggle-${id}`);
  return Array.from(root.querySelectorAll("button[data-fleet-board-open]"))
    .find((button) => button.dataset.fleetBoardOpen === id && button.getClientRects().length > 0) || null;
}

// After closing an estimate, prefer its original action if still rendered.
// A saved estimate can refresh away its row; never focus a stale/hidden opener.
export function restoreEstimateFocusAfterChange({ rows, pending, viewMode, root, statusFilter, onNotice, refreshButton }) {
  if (pending.refreshFailed) {
    (refreshButton?.isConnected ? refreshButton : statusFilter)?.focus();
    return "refresh";
  }
  const visible = rows.some((row) => row.id === pending.id);
  const opener = visible ? Array.from(root.querySelectorAll("button[data-fleet-estimate-open]"))
    .find((button) => button.dataset.fleetEstimateOpen === pending.id && button.getClientRects().length > 0) : null;
  const target = opener || findWorkOrderFocusTarget(rows, pending.id, viewMode, root);
  if (target) {
    target.focus();
    return opener ? "estimate-opener" : "work-order";
  }
  statusFilter?.focus();
  onNotice(visible
    ? `Updated the estimate for ${pending.label}. Use the view controls to locate the work order.`
    : `Updated the estimate for ${pending.label}. The work order no longer matches the current filters.`);
  return "filter";
}

export function workOrderSaveFocusNotice({ verb, label, visible }) {
  return visible
    ? `${verb} ${label}. Use the view controls to locate the updated work order.`
    : `${verb} ${label}. It no longer matches the current filters.`;
}

export function restoreWorkOrderFocusAfterSave({ rows, pending, viewMode, root, statusFilter, onNotice, refreshButton }) {
  if (pending.refreshFailed) {
    // The old rows might still be visible but are not authoritative. Focus the
    // recovery action instead of sending the user to a potentially stale row.
    (refreshButton?.isConnected ? refreshButton : statusFilter)?.focus();
    return "refresh";
  }
  const target = findWorkOrderFocusTarget(rows, pending.id, viewMode, root);
  if (target) {
    target.focus();
    return "work-order";
  }
  statusFilter?.focus();
  onNotice(workOrderSaveFocusNotice({
    verb: pending.verb,
    label: pending.label,
    visible: rows.some((row) => row.id === pending.id),
  }));
  return "filter";
}
