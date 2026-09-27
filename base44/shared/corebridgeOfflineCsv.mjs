// API-free export of existing CCS WorkOrder records. Never includes internal costs.
export const JOB_REGISTER_COLUMNS = [
  ["id", "CCS Work Order ID"],
  ["corbridge_invoice_number", "Estimate / Invoice Number"],
  ["client_name", "Client"],
  ["title", "Job Title"],
  ["description", "Job Description"],
  ["current_stage", "Workflow Stage"],
  ["sales_status", "Sales Status"],
  ["estimate_amount", "Customer Estimate Amount"],
  ["contact_name", "Contact"],
  ["contact_email", "Contact Email"],
  ["contact_phone", "Contact Phone"],
  ["date_estimate_sent", "Estimate Sent"],
  ["date_order_created", "Order Created"],
  ["project_install_date", "Install Date"],
  ["close_date", "Closed Date"],
  ["corbridge_link", "Historical CoreBridge Link"],
  ["created_date", "CCS Created"],
  ["updated_date", "CCS Updated"],
];

export function isCompletedJob(job) {
  return job?.completed === true || job?.current_stage === "completed";
}

export function selectJobRegisterRows(jobs, scope = "all") {
  if (!["all", "incomplete", "completed"].includes(scope)) {
    throw new Error("Invalid job register filter.");
  }
  return jobs.filter((job) => job?.deleted !== true &&
    (scope === "all" ||
      (scope === "completed" ? isCompletedJob(job) : !isCompletedJob(job))));
}

export function csvCell(value) {
  let text = value == null ? "" : String(value);
  // Guard spreadsheet formula injection, including leading spaces and controls.
  if (/^[\x00-\x20]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function buildJobRegisterCsv(jobs, scope = "all") {
  const rows = selectJobRegisterRows(jobs, scope);
  const header = JOB_REGISTER_COLUMNS.map(([, label]) => csvCell(label)).join(",");
  const lines = rows.map((job) =>
    JOB_REGISTER_COLUMNS.map(([key]) => csvCell(job[key])).join(",")
  );
  return { csv: "\uFEFF" + [header, ...lines].join("\r\n") + "\r\n", count: rows.length };
}
