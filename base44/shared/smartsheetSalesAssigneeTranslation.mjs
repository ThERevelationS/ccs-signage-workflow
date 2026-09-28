function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

// Smartsheet's Workflow assignee picklist intentionally uses first-name labels.
// Keep this translation at the sync boundary so Base44 may retain canonical
// full names while the sheet receives the established short label.
export function smartsheetSalesAssigneeLabel(value) {
  const raw = clean(value);
  if (!raw) return "";
  const withoutContact = raw.replace(/\s*<[^<>]+>\s*$/, "").trim();
  return withoutContact.split(/\s+/)[0] || "";
}
