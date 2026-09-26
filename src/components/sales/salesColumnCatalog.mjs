// Sales Pipeline TABLE columns: one shared catalog for the compact editor and
// visibility controls. Only columns actually rendered by both table header
// and SalesPipelineRow belong here. Dedicated row # and Actions remain fixed.
export const SALES_TABLE_COLUMNS = Object.freeze([
  { id: "client_name", label: "Customer", headerLabel: "Customer", minWidth: 120 },
  { id: "sales_status", label: "Sales Status", headerLabel: "Status", minWidth: 95 },
  { id: "stage_age", label: "Stage Age", headerLabel: "Stage Age", minWidth: 72 },
  { id: "sales_rep", label: "Salesperson / Owner", headerLabel: "Sales Owner", minWidth: 115 },
  { id: "description", label: "Job Description", headerLabel: "Job Description", minWidth: 150 },
  { id: "lead_source", label: "Source", headerLabel: "Source", minWidth: 90 },
  { id: "current_task_deadline", label: "Deadline", headerLabel: "Deadline", minWidth: 80 },
  { id: "current_task_assigned_to", label: "Task Assigned", headerLabel: "Task Assigned", minWidth: 100 },
  { id: "designer", label: "Designer", headerLabel: "Designer", minWidth: 90 },
  { id: "project_manager", label: "PM", headerLabel: "Project Manager", minWidth: 100 },
  { id: "estimator", label: "Estimator", headerLabel: "Estimator", minWidth: 90 },
  { id: "est_inv_at", label: "Est / Inv # Link", headerLabel: "Est/Inv # Link", minWidth: 100 },
  { id: "estimate_amount", label: "Estimate Amount", headerLabel: "Amount", minWidth: 90 },
  { id: "current_task_description", label: "Task Description", headerLabel: "Task Description", minWidth: 140 },
  { id: "date_initial_contact", label: "Est. Requested", headerLabel: "Est. Req.", minWidth: 80 },
  { id: "site_survey_date", label: "Survey", headerLabel: "Survey", minWidth: 80 },
  { id: "date_estimate_sent", label: "Est Sent", headerLabel: "Date Estimate Sent to Customer", minWidth: 120 },
  { id: "date_order_created", label: "Order", headerLabel: "Order", minWidth: 80 },
  { id: "project_install_date", label: "Install", headerLabel: "Install", minWidth: 80 },
  { id: "permit_submitted_date", label: "Permit Sub", headerLabel: "Permit Sub", minWidth: 80 },
  { id: "permit_receipt_confirmed_date", label: "Permit Conf", headerLabel: "Permit Conf", minWidth: 80 },
  { id: "permit_number", label: "Permit #", headerLabel: "Permit #", minWidth: 70 },
  { id: "permit_approved_date", label: "Permit App", headerLabel: "Permit App", minWidth: 80 },
  { id: "days_init_today", label: "Days Init→Today", headerLabel: "Days Init→Today", minWidth: 90 },
  { id: "days_req_est", label: "Days Req→Est", headerLabel: "Days Req→Est", minWidth: 90 },
  { id: "days_est_ord", label: "Days Est→Ord", headerLabel: "Days Est→Ord", minWidth: 90 },
  { id: "days_ord_prm", label: "Days Ord→Prm", headerLabel: "Days Ord→Prm", minWidth: 90 },
  { id: "days_prm_app", label: "Days Prm→App", headerLabel: "Days Prm→App", minWidth: 90 },
  { id: "days_ord_ins", label: "Days Ord→Ins", headerLabel: "Days Ord→Ins", minWidth: 90 },
  { id: "quote_age", label: "Quote Age", headerLabel: "Quote Age", minWidth: 72 },
  { id: "follow_up_date", label: "Follow Up", headerLabel: "Follow Up", minWidth: 80 },
  { id: "expected_close_date", label: "Expected Close", headerLabel: "Expected Close", minWidth: 92 },
  { id: "close_date", label: "Close", headerLabel: "Close", minWidth: 80 },
  { id: "start_date", label: "Start", headerLabel: "Start", minWidth: 80 },
  { id: "project_type", label: "Project Type", headerLabel: "Project Type", minWidth: 90 },
].map((column) => Object.freeze({ ...column, visible: true })));

const knownById = new Map(SALES_TABLE_COLUMNS.map((column) => [column.id, column]));

// The live table header and the horizontal preset preview share these exact
// labels and minimum widths. Checkbox labels may remain more descriptive.
export function getSalesColumnLayout(id) {
  return knownById.get(id) ?? null;
}

// Existing presets are historical data. Do not assume newly implemented
// columns were selected by a user or silently reinterpret retired column IDs.
export function normalizeSalesColumnSettings(savedSettings) {
  if (!Array.isArray(savedSettings) || savedSettings.length === 0) {
    return SALES_TABLE_COLUMNS.map((column) => ({ ...column }));
  }
  const seen = new Set();
  const known = [];
  for (const saved of savedSettings) {
    const id = String(saved?.id ?? "");
    const canonical = knownById.get(id);
    if (!canonical || seen.has(id)) continue;
    seen.add(id);
    known.push({ ...canonical, visible: saved.visible !== false });
  }
  for (const column of SALES_TABLE_COLUMNS) {
    if (!seen.has(column.id)) known.push({ ...column, visible: false });
  }
  return known;
}

// Save only explicitly edited supported columns while preserving any retired
// fields in the original record for later reviewed migration/recovery.
export function preserveLegacySalesColumnEntries(editedSettings, originalSettings) {
  const known = normalizeSalesColumnSettings(editedSettings);
  const legacy = Array.isArray(originalSettings)
    ? originalSettings.filter((saved) => saved?.id && !knownById.has(saved.id))
    : [];
  return [...known, ...legacy];
}

export function getUnavailableSalesColumns(savedSettings) {
  if (!Array.isArray(savedSettings)) return [];
  return savedSettings.filter((saved) => saved?.id && !knownById.has(saved.id));
}

export function salesPresetColumnVisible(preset, id) {
  if (!preset) return knownById.has(id);
  const settings = preset.column_settings;
  if (!Array.isArray(settings) || settings.length === 0) return false;
  // A field omitted from a saved preset was never explicitly selected.
  return knownById.has(id) && settings.some((column) => column?.id === id && column.visible !== false);
}

// The editor's visible horizontal preview and the actual table use this same
// persisted order. Unknown/retired fields are preserved in storage but never
// become a table column. A saved preset with no columns renders no data cells.
export function getVisibleSalesColumnIds(preset) {
  if (!preset) return SALES_TABLE_COLUMNS.map((column) => column.id);
  if (!Array.isArray(preset.column_settings) || !preset.column_settings.length) return [];
  return normalizeSalesColumnSettings(preset.column_settings)
    .filter((column) => column.visible)
    .map((column) => column.id);
}

// Move between VISIBLE preview neighbors; hidden checkboxes retain their
// positions. These same updated settings are persisted by the preset editor.
export function moveVisibleSalesColumn(settings, id, direction) {
  if (!Array.isArray(settings) || ![-1, 1].includes(direction)) return settings;
  const visibleIndices = settings.flatMap((column, index) => column?.visible ? [index] : []);
  const from = settings.findIndex((column) => column?.id === id);
  const visiblePosition = visibleIndices.indexOf(from);
  const destination = visibleIndices[visiblePosition + direction];
  if (visiblePosition < 0 || destination === undefined) return settings;
  const next = [...settings];
  [next[from], next[destination]] = [next[destination], next[from]];
  return next;
}
