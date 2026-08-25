import { base44 } from "@/api/base44Client";

const norm = (s) => String(s || "").trim().toLowerCase();

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
export const syncEstimateToPipeline = async (estimate, customer) => {
  const salesStatusByEstimate = { sent: "quoted", approved: "won", archived: "lost" };
  const fields = {
    title: estimate.project_name,
    client_name: estimate.client_name,
    customer_id: customer?.id,
    estimate_id: estimate.id,
    in_pipeline: true,
    sales_status: salesStatusByEstimate[estimate.status] || "lead",
    contact_name: estimate.order_contact,
    contact_email: estimate.contact_email,
    contact_phone: estimate.office_phone,
    representative: estimate.order_contact,
    sales_rep: estimate.salesperson,
    estimator: estimate.salesperson,
    estimate_amount: estimate.quote_total || 0,
    quoted_amount: estimate.quote_total || 0,
    install_location: estimate.site_address,
  };

  const existing = await base44.entities.WorkOrder.filter({ estimate_id: estimate.id });
  if (existing && existing.length) {
    await base44.entities.WorkOrder.update(existing[0].id, fields);
    return { ...existing[0], ...fields };
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
export const syncEstimateEverywhere = async (estimate) => {
  const customers = await base44.entities.Customer.list("company_name", 1000);
  const customer = await upsertCustomerFromEstimate(estimate, customers || []);
  await syncEstimateToPipeline(estimate, customer);
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