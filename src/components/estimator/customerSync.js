import { base44 } from "@/api/base44Client";
import { resolvePipelineLifecycleDates, resolvePipelineSalesStatus } from "./pipelineStatus";
import { localDateStamp } from "./quoteLifecycle";

const norm = (s) => String(s || "").trim().toLowerCase();
const firstNonBlank = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? "";

/** Find a Customer by company name (or legacy workflow client name). */
export const findCustomerByName = (customers, name) => {
  const n = norm(name);
  if (!n) return null;
  return (
    customers.find((c) => norm(c.company_name) === n) ||
    customers.find((c) => (c.legacy_client_names || []).some((l) => norm(l) === n)) ||
    null
  );
};

/** Map estimate Step-1 form values onto Customer fields (only non-empty values). */
const customerFieldsFromEstimate = (form) => {
  const [first, ...rest] = String(form.order_contact || "").trim().split(" ");
  const fields = {
    company_phone: form.office_phone,
    contact_first_name: first,
    contact_last_name: rest.join(" "),
    contact_email: form.contact_email,
    contact_office_phone: form.office_phone,
    contact_office_ext: form.office_phone_ext,
    salesperson: form.salesperson,
    location: form.sales_center,
    default_tax_group: form.tax_group,
    terms: form.terms,
    location_address_1: form.site_address,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
};

/**
 * Create or update the shared Customer record from an estimate's Step 1 form.
 * Returns the Customer record.
 */
export const upsertCustomerFromEstimate = async (form, customers = []) => {
  const name = String(form.client_name || "").trim();
  const fields = customerFieldsFromEstimate(form);
  const existing = findCustomerByName(customers, name);
  if (existing) {
    if (Object.keys(fields).length) await base44.entities.Customer.update(existing.id, fields);
    return { ...existing, ...fields };
  }
  return base44.entities.Customer.create({
    company_name: name,
    customer_status: "prospect",
    ...fields,
  });
};

/**
 * Put the estimate's client into the Sales Pipeline as a lead work order,
 * carrying over every piece of contact/project info we have.
 */
export const syncEstimateToPipeline = async (estimate, customer, { previousEstimateStatus = "" } = {}) => {
  const existingRows = await base44.entities.WorkOrder.filter({ estimate_id: estimate.id });
  const existing = existingRows?.[0] || null;
  const lifecycleDates = resolvePipelineLifecycleDates({
    estimateStatus: estimate.status,
    previousEstimateStatus,
    existingDateEstimateSent: existing?.date_estimate_sent,
    today: localDateStamp(),
  });
  const fields = {
    title: firstNonBlank(estimate.project_name, existing?.title),
    client_name: firstNonBlank(estimate.client_name, existing?.client_name),
    customer_id: firstNonBlank(customer?.id, estimate.customer_id, existing?.customer_id),
    estimate_id: estimate.id,
    in_pipeline: true,
    sales_status: resolvePipelineSalesStatus(estimate.status, existing?.sales_status),
    contact_name: firstNonBlank(estimate.order_contact, estimate.contact_name, existing?.contact_name),
    contact_email: firstNonBlank(estimate.contact_email, existing?.contact_email),
    contact_phone: firstNonBlank(estimate.office_phone, estimate.contact_phone, existing?.contact_phone),
    representative: firstNonBlank(estimate.order_contact, existing?.representative),
    sales_rep: firstNonBlank(estimate.salesperson, existing?.sales_rep),
    estimator: firstNonBlank(estimate.salesperson, existing?.estimator),
    estimate_amount: estimate.quote_total || 0,
    quoted_amount: estimate.quote_total || 0,
    quote_date: firstNonBlank(estimate.quote_issue_date, existing?.quote_date),
    install_location: firstNonBlank(estimate.site_address, existing?.install_location),
    ...lifecycleDates,
  };

  if (existing) {
    await base44.entities.WorkOrder.update(existing.id, fields);
    return { ...existing, ...fields };
  }

  return base44.entities.WorkOrder.create({
    ...fields,
    current_stage: "estimating",
    date_initial_contact: new Date().toISOString().slice(0, 10),
  });
};

/**
 * One call used when an estimate is saved: keep the shared Customer record and the
 * Sales Pipeline lead in step with the estimate.
 */
export const syncEstimateEverywhere = async (estimate, { previousEstimateStatus = "" } = {}) => {
  const customers = await base44.entities.Customer.list("company_name", 1000);
  const customer = await upsertCustomerFromEstimate(estimate, customers || []);
  await syncEstimateToPipeline(estimate, customer, { previousEstimateStatus });
  return customer;
};

/**
 * Make sure every client that exists in the Sales Pipeline / workflow also has
 * a shared Customer record, seeded with whatever contact info the work order has.
 * Returns the (possibly extended) customer list.
 */
export const backfillCustomersFromWorkOrders = async (customers) => {
  const workOrders = await base44.entities.WorkOrder.list("-created_date", 1000);
  const known = new Set();
  customers.forEach((c) => {
    known.add(norm(c.company_name));
    (c.legacy_client_names || []).forEach((l) => known.add(norm(l)));
  });

  const toCreate = [];
  (workOrders || []).forEach((wo) => {
    const n = norm(wo.client_name);
    if (!n || known.has(n) || wo.deleted) return;
    known.add(n);
    toCreate.push({
      company_name: wo.client_name.trim(),
      customer_status: "prospect",
      contact_email: wo.contact_email || "",
      company_phone: wo.contact_phone || "",
      contact_office_phone: wo.contact_phone || "",
      salesperson: wo.sales_rep || "",
      location_address_1: wo.install_location || "",
      billing_address_1: wo.billing_address || "",
      notes: wo.origination ? `Lead source: ${wo.origination}` : "",
      legacy_client_names: [wo.client_name.trim()],
    });
  });

  if (!toCreate.length) return customers;
  const created = await base44.entities.Customer.bulkCreate(toCreate);
  return [...customers, ...(created || [])];
};