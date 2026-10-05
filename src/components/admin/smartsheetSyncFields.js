// Frontend mirror of the approved Sales/Order Smartsheet sync field vocabulary.
// Sales keys must stay aligned with SALES_SYNC_ALLOWED_FIELDS in
// base44/shared/smartsheetSalesSafety.mjs.

export const SALES_MAPPABLE_FIELDS = [
  { key: "client_name", label: "Client Name" },
  { key: "lead_source", label: "Lead Source" },
  { key: "est_inv_at", label: "Est / Inv #" },
  { key: "estimate_amount", label: "Estimate Amount" },
  { key: "current_task_description", label: "Current Task" },
  { key: "current_task_assigned_to", label: "Current Task Assigned To" },
  { key: "current_task_deadline", label: "Current Task Deadline" },
  { key: "designer", label: "Designer" },
  { key: "project_manager", label: "Project Manager" },
  { key: "estimator", label: "Estimator" },
  { key: "date_initial_contact", label: "Date Initial Contact" },
  { key: "site_survey_date", label: "Site Survey Date" },
  { key: "date_order_created", label: "Date Order Created" },
  { key: "project_install_date", label: "Project Install Date" },
  { key: "permit_receipt_confirmed_date", label: "Permit Receipt Confirmed" },
  { key: "permit_approved_date", label: "Permit Approved" },
  { key: "permit_number", label: "Permit Number" },
  { key: "notes_serialized", label: "Work Notes (serialized)" },
];

export const ORDER_MAPPABLE_FIELDS = [
  { key: "customer_name", label: "Customer Name" },
  { key: "request_type", label: "Request Type" },
  { key: "description", label: "Description" },
  { key: "quantity", label: "Quantity" },
  { key: "date_needed", label: "Date Needed" },
  { key: "date_ordered", label: "Date Ordered" },
  { key: "vendor", label: "Vendor" },
  { key: "date_received", label: "Date Received" },
  { key: "status", label: "Status" },
  { key: "requestor_name", label: "Requestor Name" },
  { key: "requestor_email", label: "Requestor Email" },
];

export function getMappableFields(dataset) {
  return dataset === "orders" ? ORDER_MAPPABLE_FIELDS : SALES_MAPPABLE_FIELDS;
}
