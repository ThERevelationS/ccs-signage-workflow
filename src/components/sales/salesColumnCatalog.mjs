// Sales Pipeline TABLE columns: one shared catalog for the compact editor and
// visibility controls. Only columns actually rendered by both table header
// and SalesPipelineRow belong here. Dedicated row # and Actions remain fixed.
export const SALES_TABLE_COLUMNS = Object.freeze([
  { id: "client_name", label: "Customer" },
  { id: "sales_status", label: "Sales Status" },
  { id: "stage_age", label: "Stage Age" },
  { id: "sales_rep", label: "Salesperson / Owner" },
  { id: "description", label: "Job Description" },
  { id: "lead_source", label: "Source" },
  { id: "current_task_deadline", label: "Deadline" },
  { id: "current_task_assigned_to", label: "Task Assigned" },
  { id: "designer", label: "Designer" },
  { id: "project_manager", label: "PM" },
  { id: "estimator", label: "Estimator" },
  { id: "est_inv_at", label: "Est / Inv # Link" },
  { id: "estimate_amount", label: "Estimate Amount" },
  { id: "current_task_description", label: "Task Description" },
  { id: "date_initial_contact", label: "Est. Requested" },
  { id: "site_survey_date", label: "Survey" },
  { id: "date_estimate_sent", label: "Est Sent" },
  { id: "date_order_created", label: "Order" },
  { id: "project_install_date", label: "Install" },
  { id: "permit_submitted_date", label: "Permit Sub" },
  { id: "permit_receipt_confirmed_date", label: "Permit Conf" },
  { id: "permit_number", label: "Permit #" },
  { id: "permit_approved_date", label: "Permit App" },
  { id: "days_init_today", label: "Days Init→Today" },
  { id: "days_req_est", label: "Days Req→Est" },
  { id: "days_est_ord", label: "Days Est→Ord" },
  { id: "days_ord_prm", label: "Days Ord→Prm" },
  { id: "days_prm_app", label: "Days Prm→App" },
  { id: "days_ord_ins", label: "Days Ord→Ins" },
  { id: "quote_age", label: "Quote Age" },
  { id: "follow_up_date", label: "Follow Up" },
  { id: "expected_close_date", label: "Expected Close" },
  { id: "close_date", label: "Close" },
  { id: "start_date", label: "Start" },
  { id: "project_type", label: "Project Type" },
].map((column) => Object.freeze({ ...column, visible: true })));

const knownById = new Map(SALES_TABLE_COLUMNS.map((column) => [column.id, column]));

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
