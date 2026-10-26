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

function identityKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function eligibleTaskAssignees(users = []) {
  return (Array.isArray(users) ? users : []).filter((user) =>
    user?.is_active !== false &&
    clean(user?.full_name) &&
    Array.isArray(user?.sales_roles) && user.sales_roles.includes("Task Assigned")
  );
}

// Configured acknowledge list for historical/external assignee labels that
// are real people but not roster users (former employees, vendors). A
// confirmed label resolves to its canonical stored form instead of flagging
// the pull for review forever. Roster matches still win over confirmed labels.
export function canonicalBase44SalesAssignee(value, users = [], confirmedLabels = []) {
  const raw = clean(value);
  if (!raw) return { state: "blank", name: "", candidates: [] };
  const roster = eligibleTaskAssignees(users);
  const requested = identityKey(raw.replace(/\s*<[^<>]+>\s*$/, ""));
  const exact = roster.filter((user) => identityKey(user.full_name) === requested);
  if (exact.length === 1) return { state: "exact", name: clean(exact[0].full_name), candidates: exact };
  if (exact.length > 1) return { state: "ambiguous", name: "", candidates: exact };

  const first = roster.filter((user) => identityKey(smartsheetSalesAssigneeLabel(user.full_name)) === requested);
  if (first.length === 1) return { state: "unique_first_name", name: clean(first[0].full_name), candidates: first };
  if (first.length > 1) return { state: "ambiguous", name: "", candidates: first };

  const confirmed = (Array.isArray(confirmedLabels) ? confirmedLabels : [])
    .map((label) => clean(label)).filter(Boolean);
  const confirmedExact = confirmed.filter((label) => identityKey(label) === requested);
  if (confirmedExact.length === 1) return { state: "confirmed_custom", name: confirmedExact[0], candidates: [] };
  if (confirmedExact.length > 1) return { state: "ambiguous", name: "", candidates: [] };
  const confirmedFirst = confirmed.filter((label) => identityKey(smartsheetSalesAssigneeLabel(label)) === requested);
  if (confirmedFirst.length === 1) return { state: "confirmed_custom", name: confirmedFirst[0], candidates: [] };
  if (confirmedFirst.length > 1) return { state: "ambiguous", name: "", candidates: [] };

  return { state: "unresolved", name: "", candidates: [] };
}
