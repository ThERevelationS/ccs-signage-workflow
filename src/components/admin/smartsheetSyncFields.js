// Frontend mirror of the mappable field vocabulary in base44/shared/smartsheetSyncFields.ts.
// Used by the column-bindings editor. Keys must match the backend exactly.

export const SALES_MAPPABLE_FIELDS = [
  { key: "title", label: "Project Title" },
  { key: "client_name", label: "Client Name" },
  { key: "sales_status", label: "Sales Status" },
  { key: "lead_source", label: "Lead Source" },
  { key: "estimate_amount", label: "Estimate Amount" },
  { key: "est_inv_at", label: "Est / Inv #" },
  { key: "contact_name", label: "Contact Name" },
  { key: "contact_email", label: "Contact Email" },
  { key: "contact_phone", label: "Contact Phone" },
  { key: "sales_rep", label: "Sales Rep" },
  { key: "project_type", label: "Project Type" },
  { key: "install_location", label: "Install Location" },
  { key: "township_city", label: "Township/City" },
  { key: "county", label: "County" },
  { key: "due_date", label: "Due Date" },
  { key: "close_date", label: "Close Date" },
  { key: "expected_close_date", label: "Expected Close Date" },
  { key: "date_initial_contact", label: "Date Initial Contact" },
  { key: "date_order_created", label: "Date Order Created" },
  { key: "project_install_date", label: "Project Install Date" },
  { key: "permit_submitted_date", label: "Permit Submitted" },
  { key: "permit_approved_date", label: "Permit Approved" },
  { key: "permit_number", label: "Permit Number" },
  { key: "permitting", label: "Permitting" },
  { key: "estimator", label: "Estimator" },
  { key: "designer", label: "Designer" },
  { key: "surveyor", label: "Surveyor" },
  { key: "site_survey_date", label: "Site Survey Date" },
  { key: "permit_receipt_confirmed_date", label: "Permit Receipt Confirmed" },
  { key: "project_manager", label: "Project Manager" },
  { key: "current_task_description", label: "Current Task" },
  { key: "current_task_assigned_to", label: "Current Task Assigned To" },
  { key: "current_task_deadline", label: "Current Task Deadline" },
  { key: "lost_reason", label: "Lost Reason" },
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