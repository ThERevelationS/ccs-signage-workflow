import { base44 } from "@/api/base44Client";
import { resolvePipelineLifecycleDates, resolvePipelineSalesStatus } from "./pipelineStatus";
import { localDateStamp } from "./quoteLifecycle";
import { loadAllEntityRows } from "./loadAllEntityRows";
import { replaceWorkOrderFieldsIfUnchanged } from "@/components/workflow/workOrderPersistence";
import { deleteCreatedDuplicateWorkOrderIfUnchanged, expectedWorkOrderFields } from "./workOrderSyncPersistence";

const norm = (s) => String(s || "").trim().toLowerCase();
const firstNonBlank = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? "";
const CUSTOMER_SYNC_KEYS = ["client_name", "office_phone", "order_contact", "contact_email", "office_phone_ext", "salesperson", "sales_center", "tax_group", "terms", "site_address"];
const CUSTOMER_PAGE_SIZE = 500;
const CUSTOMER_CATALOG_LIMIT = 50000;

export const loadAllCustomers = async ({ pageSize = CUSTOMER_PAGE_SIZE, maxRows = CUSTOMER_CATALOG_LIMIT } = {}) => {
  const rows = [];
  const seen = new Set();
  let skip = 0;
  while (skip < maxRows) {
    const page = await base44.entities.Customer.list("created_date", pageSize, skip);
    if (!Array.isArray(page)) throw new Error("The Customer catalog could not be loaded safely.");
    for (const customer of page) {
      if (!customer?.id || seen.has(customer.id)) continue;
      seen.add(customer.id);
      rows.push(customer);
    }
    if (page.length < pageSize) {
      return rows.sort((a, b) => String(a.company_name || "").localeCompare(String(b.company_name || "")));
    }
    skip += pageSize;
  }
  throw new Error(`The Customer catalog has reached the ${maxRows.toLocaleString()}-record safety limit.`);
};

export const estimateCustomerChangedKeys = (before = {}, after = {}) =>
  CUSTOMER_SYNC_KEYS.filter((key) => String(before?.[key] ?? "") !== String(after?.[key] ?? ""));

export const estimateCustomerFieldsChanged = (before = {}, after = {}) =>
  estimateCustomerChangedKeys(before, after).length > 0;

export const canonicalEstimateWorkOrder = (rows = []) => (rows || []).slice().sort((a, b) => {
  const aTime = Date.parse(a?.created_date || a?.updated_date || "") || 0;
  const bTime = Date.parse(b?.created_date || b?.updated_date || "") || 0;
  if (aTime !== bTime) return aTime - bTime;
  return String(a?.id || "").localeCompare(String(b?.id || ""));
})[0] || null;

export const convergeCreatedEstimateWorkOrder = async ({ estimateId, created, fields = {}, duplicateLabel = "Work Order" } = {}) => {
  if (!estimateId || !created?.id) return created || null;
  await new Promise((resolve) => setTimeout(resolve, 50));
  const canonical = canonicalEstimateWorkOrder(
    await base44.entities.WorkOrder.filter({ estimate_id: estimateId })
  ) || created;

  if (canonical?.id && canonical.id !== created.id) {
    try {
      await deleteCreatedDuplicateWorkOrderIfUnchanged({
        entity: base44.entities.WorkOrder,
        created,
        label: `Duplicate ${duplicateLabel}`,
      });
    } catch (error) {
      throw new Error(`A duplicate ${duplicateLabel} was detected for this estimate and the losing duplicate could not be removed safely: ${error?.message || "unknown error"}`);
    }
    if (Object.keys(fields || {}).length) {
      return replaceWorkOrderFieldsIfUnchanged({
        workOrderId: canonical.id,
        expectedFields: expectedWorkOrderFields(canonical, fields),
        nextFields: fields,
        label: `${duplicateLabel} convergence`,
      });
    }
    return canonical;
  }

  return canonical;
};

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

/** Map estimate Step-1 values onto Customer fields. Full/new-estimate sync ignores blanks; explicit changed-key sync may intentionally clear a changed field. */
const customerFieldsFromEstimate = (form, changedKeys = null) => {
  const allowed = changedKeys ? new Set(changedKeys) : null;
  const include = (sourceKey) => !allowed || allowed.has(sourceKey);
  const [first, ...rest] = String(form.order_contact || "").trim().split(" ");
  const fields = {
    ...(include("office_phone") ? { company_phone: form.office_phone, contact_office_phone: form.office_phone } : {}),
    ...(include("order_contact") ? { contact_first_name: first, contact_last_name: rest.join(" ") } : {}),
    ...(include("contact_email") ? { contact_email: form.contact_email } : {}),
    ...(include("office_phone_ext") ? { contact_office_ext: form.office_phone_ext } : {}),
    ...(include("salesperson") ? { salesperson: form.salesperson } : {}),
    ...(include("sales_center") ? { location: form.sales_center } : {}),
    ...(include("tax_group") ? { default_tax_group: form.tax_group } : {}),
    ...(include("terms") ? { terms: form.terms } : {}),
    ...(include("site_address") ? { location_address_1: form.site_address } : {}),
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && (changedKeys ? true : v !== ""))
  );
};

/**
 * Create or update the shared Customer record from an estimate's Step 1 form.
 * Returns the Customer record.
 */
export const resolveCustomerForEstimate = async (form, customers = []) => {
  const linkedId = String(form?.customer_id || "").trim();
  if (linkedId) {
    const linked = customers.find((customer) => customer.id === linkedId);
    if (linked) return linked;
    const fetched = await base44.entities.Customer.get(linkedId).catch(() => null);
    if (fetched) return fetched;
  }
  return findCustomerByName(customers, form?.client_name);
};

export const upsertCustomerFromEstimate = async (form, customers = [], { changedKeys = null } = {}) => {
  const name = String(form.client_name || "").trim();
  const fields = customerFieldsFromEstimate(form, changedKeys);
  const existing = await resolveCustomerForEstimate(form, customers);
  if (existing) {
    if (Object.keys(fields).length) await base44.entities.Customer.update(existing.id, fields);
    return { ...existing, ...fields };
  }
  const response = await base44.functions.invoke("ensureEstimateCustomer", {
    company_name: name,
    fields,
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.customer?.id) throw new Error("The new Customer could not be verified after creation.");
  return result.customer;
};

/**
 * Put the estimate's client into the Sales Pipeline as a lead work order,
 * carrying over every piece of contact/project info we have.
 */
export const syncEstimateToPipeline = async (estimate, customer, { previousEstimateStatus = "" } = {}) => {
  const existingRows = await base44.entities.WorkOrder.filter({ estimate_id: estimate.id });
  const existing = canonicalEstimateWorkOrder(existingRows || []);
  const lifecycleDates = resolvePipelineLifecycleDates({
    estimateStatus: estimate.status,
    previousEstimateStatus,
    existingDateEstimateSent: existing?.date_estimate_sent,
    today: localDateStamp(),
    issuedQuoteDate: estimate.quote_issue_date || "",
    issuedQuoteVersion: estimate.quote_version || 0,
  });
  const fields = {
    title: firstNonBlank(estimate.project_name, existing?.title),
    client_name: firstNonBlank(estimate.client_name, existing?.client_name),
    // Only propagate a Customer ID that was resolved from the live Customer entity,
    // or preserve an existing WorkOrder link. Never copy an unverified/stale
    // estimate.customer_id into a new pipeline record.
    customer_id: firstNonBlank(customer?.id, existing?.customer_id),
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
    return replaceWorkOrderFieldsIfUnchanged({
      workOrderId: existing.id,
      expectedFields: expectedWorkOrderFields(existing, fields),
      nextFields: fields,
      label: "Sales Pipeline estimate synchronization",
    });
  }

  const created = await base44.entities.WorkOrder.create({
    ...fields,
    current_stage: "estimating",
    date_initial_contact: new Date().toISOString().slice(0, 10),
  });

  // Collapse only the practical two-session create race for this exact estimate.
  // Never delete/merge a WorkOrder that existed before this request. If another
  // session won, discard only this request's newly-created losing row and apply
  // the latest estimator fields to the canonical pipeline record.
  return convergeCreatedEstimateWorkOrder({
    estimateId: estimate.id,
    created,
    fields,
    duplicateLabel: "Sales Pipeline record",
  });
};

/**
 * One call used when an estimate is saved: keep the shared Customer record and the
 * Sales Pipeline lead in step with the estimate.
 */
export const syncEstimateEverywhere = async (estimate, { previousEstimateStatus = "", syncCustomer = false, customerChangedKeys = null } = {}) => {
  const customers = await loadAllCustomers();
  const customer = syncCustomer
    ? await upsertCustomerFromEstimate(estimate, customers || [], { changedKeys: customerChangedKeys })
    : await resolveCustomerForEstimate(estimate, customers || []);
  await syncEstimateToPipeline(estimate, customer, { previousEstimateStatus });
  return customer;
};

/**
 * Make sure every client that exists in the Sales Pipeline / workflow also has
 * a shared Customer record, seeded with whatever contact info the work order has.
 * Returns the (possibly extended) customer list.
 */
export const backfillCustomersFromWorkOrders = async (customers) => {
  const workOrders = await loadAllEntityRows({
    entity: base44.entities.WorkOrder,
    sort: "-created_date",
    label: "Workflow Work Orders",
  });
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

  // Use the same server-side Customer convergence path as Estimate creation,
  // but never update an existing match from this maintenance backfill. This
  // keeps the UI promise that existing Customers are not merged/overwritten,
  // while simultaneous admin syncs or lost create responses cannot duplicate a
  // missing workflow Customer.
  const merged = [...customers];
  const knownIds = new Set(merged.map((customer) => customer.id).filter(Boolean));
  for (const candidate of toCreate) {
    const { company_name, customer_status: _customerStatus, ...fields } = candidate;
    const response = await base44.functions.invoke("ensureEstimateCustomer", {
      company_name,
      fields,
      update_existing: false,
    });
    const result = response?.data || response;
    if (result?.error) throw new Error(result.error);
    if (!result?.customer?.id) {
      throw new Error(`Workflow Customer “${company_name}” could not be verified after creation.`);
    }
    if (!knownIds.has(result.customer.id)) {
      knownIds.add(result.customer.id);
      merged.push(result.customer);
    }
  }
  return merged;
};