import { base44 } from "@/api/base44Client";
import { resolvePipelineLifecycleDates, resolvePipelineSalesStatus } from "./pipelineStatus";
import { hasVerifiedEstimateSalesActivity } from "./estimateSalesActivity.mjs";
import { localDateStamp } from "./quoteLifecycle";
import { loadAllEntityRows } from "./loadAllEntityRows";
import { fetchAllWorkOrders } from "@/lib/workOrderCache";
import { replaceWorkOrderFieldsIfUnchanged } from "@/components/workflow/workOrderPersistence";
import { createEstimateLinkedWorkOrderWithRecovery, deleteCreatedDuplicateWorkOrderIfUnchanged, expectedWorkOrderFields } from "./workOrderSyncPersistence";
import { expectedCustomerFields, replaceCustomerFieldsIfUnchanged } from "./customerPersistence";
import { staffEntities } from "@/components/staff/staffEntities";

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
    const page = await staffEntities.Customer.list("created_date", pageSize, skip);
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

export const convergeCreatedEstimateWorkOrder = async ({ estimateId, created, fields = {}, sessionToken = "", duplicateLabel = "Work Order" } = {}) => {
  if (!estimateId || !created?.id) return created || null;
  await new Promise((resolve) => setTimeout(resolve, 50));
  const canonical = canonicalEstimateWorkOrder(
    (await staffEntities.WorkOrder.filter({ estimate_id: estimateId })).filter((row) => row?.deleted !== true)
  ) || created;

  if (canonical?.id && canonical.id !== created.id) {
    try {
      await deleteCreatedDuplicateWorkOrderIfUnchanged({
        entity: staffEntities.WorkOrder,
        created,
        sessionToken,
        label: `Duplicate ${duplicateLabel}`,
      });
    } catch (error) {
      if (!sessionToken) {
        // The backend delete needs a session; without one the duplicate is
        // left for reconciliation rather than failing the whole pipeline sync.
        console.warn(`${duplicateLabel} duplicate cleanup skipped — no session token; reconciliation will repair the duplicate. (${error?.message || "unknown"})`);
      } else {
        throw new Error(`A duplicate ${duplicateLabel} was detected for this estimate and the losing duplicate could not be removed safely: ${error?.message || "unknown error"}`);
      }
    }
    if (Object.keys(fields || {}).length) {
      // Convergence is dedupe, not a content sync: only force linkage fields
      // onto the canonical row so user-edited titles/fields are never
      // overwritten by estimate defaults here.
      const linkFields = Object.fromEntries(
        Object.entries(fields).filter(([k]) => ["estimate_id", "opportunity_id", "estimating_request_id", "in_pipeline"].includes(k)),
      );
      if (!Object.keys(linkFields).length) return canonical;
      return replaceWorkOrderFieldsIfUnchanged({
        workOrderId: canonical.id,
        expectedFields: expectedWorkOrderFields(canonical, linkFields),
        nextFields: linkFields,
        label: `${duplicateLabel} convergence`,
      });
    }
    return canonical;
  }

  return canonical;
};

// Fuzzy comparison for near-duplicate names — strips punctuation and common
// company suffixes so "Acme Signs, LLC" still matches "Acme Signs".
const fuzzyNorm = (s) =>
  norm(s)
    .replace(/[.,'"&()-]/g, " ")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|group|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Find a Customer by company name (or legacy workflow client name). */
export const findCustomerByName = (customers, name) => {
  const n = norm(name);
  if (!n) return null;
  const exact =
    customers.find((c) => norm(c.company_name) === n) ||
    customers.find((c) => (c.legacy_client_names || []).some((l) => norm(l) === n)) ||
    null;
  if (exact) return exact;
  const f = fuzzyNorm(name);
  if (!f) return null;
  return (
    customers.find((c) => fuzzyNorm(c.company_name) === f) ||
    customers.find((c) => (c.legacy_client_names || []).some((l) => fuzzyNorm(l) === f)) ||
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
    const fetched = await staffEntities.Customer.get(linkedId).catch(() => null);
    if (fetched) return fetched;
  }
  return findCustomerByName(customers, form?.client_name);
};

export const upsertCustomerFromEstimate = async (form, customers = [], { changedKeys = null, sessionToken = "" } = {}) => {
  const name = String(form.client_name || "").trim();
  if (!name) return null;
  const fields = customerFieldsFromEstimate(form, changedKeys);
  const existing = await resolveCustomerForEstimate(form, customers);
  if (existing) {
    if (Object.keys(fields).length) {
      return replaceCustomerFieldsIfUnchanged({
        entity: staffEntities.Customer,
        customerId: existing.id,
        expectedFields: expectedCustomerFields(existing, fields),
        nextFields: fields,
        label: "Estimate Customer synchronization",
      });
    }
    return existing;
  }
  const response = await base44.functions.invoke("ensureEstimateCustomer", {
    company_name: name,
    fields,
    session_token: sessionToken,
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
export const syncEstimateToPipeline = async (estimate, customer, { previousEstimateStatus = "", sessionToken = "" } = {}) => {
  const existingRows = await staffEntities.WorkOrder.filter({ estimate_id: estimate.id });
  const activeExistingRows = (existingRows || []).filter((row) => row?.deleted !== true);
  let existing = canonicalEstimateWorkOrder(activeExistingRows);
  if (!existing && (existingRows || []).some((row) => row?.deleted === true)) {
    throw new Error("This estimate's linked Sales Pipeline Work Order is in Trash. Restore that Work Order before synchronizing the estimate again.");
  }
  // Converge on the compatibility WorkOrder through stable Opportunity /
  // EstimatingRequest links before any create. A WorkOrder that already names
  // a different estimate is evidence of a conflicting link, not a candidate.
  const estimateOpportunityId = String(estimate.opportunity_id || "").trim();
  const estimateRequestId = String(estimate.estimating_request_id || "").trim();
  if (!existing && (estimateOpportunityId || estimateRequestId)) {
    const [byRequest, byOpportunity] = await Promise.all([
      estimateRequestId ? staffEntities.WorkOrder.filter({ estimating_request_id: estimateRequestId }) : Promise.resolve([]),
      estimateOpportunityId ? staffEntities.WorkOrder.filter({ opportunity_id: estimateOpportunityId }) : Promise.resolve([]),
    ]);
    const seen = new Set();
    const candidates = [...(byRequest || []), ...(byOpportunity || [])]
      .filter((row) => row?.id && row?.deleted !== true)
      .filter((row) => !seen.has(row.id) && seen.add(row.id))
      .filter((row) => !String(row?.estimate_id || "").trim() || String(row.estimate_id) === String(estimate.id));
    existing = canonicalEstimateWorkOrder(candidates);
  }
  const lifecycleDates = resolvePipelineLifecycleDates({
    estimateStatus: estimate.status,
    previousEstimateStatus,
    existingDateEstimateSent: existing?.date_estimate_sent,
    existingQuoteSentVerifiedAt: existing?.sales_quote_sent_verified_at,
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
    opportunity_id: firstNonBlank(estimateOpportunityId, existing?.opportunity_id),
    estimating_request_id: firstNonBlank(estimateRequestId, existing?.estimating_request_id),
    in_pipeline: true,
    sales_status: resolvePipelineSalesStatus(estimate.status, existing?.sales_status),
    contact_name: firstNonBlank(estimate.order_contact, estimate.contact_name, existing?.contact_name),
    contact_email: firstNonBlank(estimate.contact_email, existing?.contact_email),
    contact_phone: firstNonBlank(estimate.office_phone, estimate.contact_phone, existing?.contact_phone),
    representative: firstNonBlank(estimate.order_contact, existing?.representative),
    sales_rep: firstNonBlank(estimate.salesperson, existing?.sales_rep),
    estimator: firstNonBlank(estimate.salesperson, existing?.estimator),
    estimate_amount: estimate.quote_total || 0,
    // Attachment carry-over: handoff refs on the estimate follow the job into
    // the pipeline; an existing WO list is preserved when the estimate has none.
    attachment_refs: Array.isArray(estimate.attachment_refs) && estimate.attachment_refs.length
      ? estimate.attachment_refs
      : existing?.attachment_refs || [],
    install_location: firstNonBlank(estimate.site_address, existing?.install_location),
    // Estimate approval advances the job into production — but only from the
    // estimating stage so a manual later-stage move is never rewound.
    ...(estimate.status === "approved" && String(existing?.current_stage || "estimating").trim() === "estimating"
      ? { current_stage: "production" } : {}),
    // Quote changed after conversion: flag the job for re-review. The flag is
    // sticky — once set it is only cleared by a human, not by later syncs.
    ...(Number(existing?.estimate_amount || 0) > 0 && Number(existing.estimate_amount) !== Number(estimate.quote_total || 0)
      ? { estimate_revision_required: true } : {}),
    // Due-date prefill: the estimate's target install date is the pipeline's
    // commitment date. An existing WO due date is preserved when the estimate
    // doesn't carry one; it is never cleared by a sync.
    due_date: firstNonBlank(estimate.target_install_date, existing?.due_date),
    ...lifecycleDates,
  };

  // An estimator contact/title/site refresh is not Sales activity. Confirming
  // an already-stored quote date IS activity when the estimator has verified
  // issuance evidence, even if the customer-facing date does not change.
  const quoteDateVerificationRequested = Boolean(existing &&
    lifecycleDates.date_estimate_sent &&
    lifecycleDates.date_estimate_sent === existing.date_estimate_sent &&
    !existing.sales_quote_sent_verified_at);
  const salesActivityChanged = !existing || hasVerifiedEstimateSalesActivity(existing, fields, {
    quoteDateVerificationRequested,
  });
  if (salesActivityChanged) {
    const activityStamp = new Date().toISOString();
    fields.sales_last_activity_at = activityStamp;
    if (!existing || existing.sales_status !== fields.sales_status) {
      fields.sales_stage_changed_at = activityStamp;
    }
  }

  let workOrder;
  if (existing) {
    workOrder = await replaceWorkOrderFieldsIfUnchanged({
      workOrderId: existing.id,
      expectedFields: expectedWorkOrderFields(existing, fields),
      nextFields: fields,
      label: "Sales Pipeline estimate synchronization",
    });
  } else {
    // Per-module WO task templates: each estimate section contributes its
    // module's prep tasks ahead of the section line itself.
    const MODULE_TASK_TEMPLATES = {
      channel_letters: ["Verify letter pattern & depth before production", "Confirm raceway/wireway routing with site"],
      foundation: ["Confirm footing depth/diameter with site conditions", "Order concrete & schedule pour window"],
      vinyl: ["Confirm surface prep & temperature window", "Order vinyl media and laminate"],
      cnc: ["Approve cut file/toolpath before material pull", "Verify sheet stock on hand"],
      laser: ["Approve cut file before material pull", "Verify sheet stock thickness on hand"],
      metal: ["Confirm weld/finish spec with drawings", "Order metal stock & consumables"],
      brick_stone: ["Confirm substrate/masonry anchoring spec", "Stage stone/material before install"],
      maintenance: ["Schedule service window with customer", "Stage replacement parts/lamps"],
      painting: ["Confirm color/sheen approval with customer", "Mask & prep surfaces before spray"],
    };
    const seededTasks = (Array.isArray(estimate.line_items) ? estimate.line_items : [])
      .flatMap((line) => {
        const moduleKey = String(line?.module_key || "").trim();
        const template = (MODULE_TASK_TEMPLATES[moduleKey] || []).map((text, i) => ({
          id: `tpl_${moduleKey}_${line?.line_id || i}_${i}`,
          text,
          completed: false,
        }));
        const sectionTask = {
          id: `sec_${line?.line_id || Math.random().toString(36).slice(2, 10)}`,
          text: `Estimate section: ${line?.client_product_name || line?.builder_name || moduleKey || "Product"}`,
          completed: false,
        };
        return sectionTask.text !== "Estimate section: Product" ? [...template, sectionTask] : template;
      });

    const createFields = {
      ...fields,
      ...(fields.date_estimate_sent ? { sales_quote_sent_verified_at: new Date().toISOString() } : {}),
      // Checklist seeded from the estimate's sections — create-time only, so a
      // live WO checklist is never overwritten by later syncs.
      ...(seededTasks.length ? { tasks: seededTasks } : {}),
      current_stage: estimate.status === "approved" ? "production" : "estimating",
      date_initial_contact: new Date().toISOString().slice(0, 10),
    };

    // Preserve the existing estimate-ID convergence behavior, but also recover a
    // durable create whose response was lost before the convergence step could run.
    workOrder = await createEstimateLinkedWorkOrderWithRecovery({
      entity: staffEntities.WorkOrder,
      estimateId: estimate.id,
      data: createFields,
      label: "Sales Pipeline estimate synchronization",
      convergeCreated: (created) => convergeCreatedEstimateWorkOrder({
        estimateId: estimate.id,
        created,
        fields,
        sessionToken,
        duplicateLabel: "Sales Pipeline record",
      }),
    });
  }

  // Permit line auto-seed: a brand-new job with a site address gets one open
  // PermitLineItem so permitting work has a tracked home; jurisdiction
  // resolution stays in the review tools. Never blocks the sync.
  if (workOrder?.id && !existing && String(estimate.site_address || "").trim()) {
    try {
      const parts = String(estimate.site_address).split(",").map((s) => s.trim()).filter(Boolean);
      const city = parts.length >= 2 ? parts[parts.length - 2] : parts[0] || "";
      await staffEntities.PermitLineItem.create({
        work_order_id: workOrder.id,
        work_order_title: workOrder.title || fields.title,
        row_name: `Site permit — ${city || "site"}`,
        locality_name: city,
        status: "active",
      });
    } catch (e) {
      console.warn("Permit line auto-seed skipped:", e?.message || e);
    }
  }

  // The canonical Opportunity is backend-only; keep its compatibility link in
  // step through the workspace function. Failure leaves a held (not duplicated)
  // bridge row that reconciliation can repair, so never fail the pipeline sync.
  if (estimateOpportunityId && workOrder?.id && sessionToken) {
    try {
      await base44.functions.invoke("opportunityWorkspaceAction", {
        session_token: sessionToken,
        action: "link_work_order",
        opportunity_id: estimateOpportunityId,
        work_order_id: workOrder.id,
        estimating_request_id: estimateRequestId,
      });
    } catch (linkError) {
      console.warn("Opportunity compatibility WorkOrder link could not be saved:", linkError?.message || linkError);
    }
  }
  return workOrder;
};

/**
 * One call used when an estimate is saved: keep the shared Customer record and the
 * Sales Pipeline lead in step with the estimate.
 */
export const syncEstimateEverywhere = async (estimate, { previousEstimateStatus = "", syncCustomer = false, customerChangedKeys = null, sessionToken = "" } = {}) => {
  const customers = await loadAllCustomers();
  const customer = syncCustomer
    ? await upsertCustomerFromEstimate(estimate, customers || [], { changedKeys: customerChangedKeys, sessionToken })
    : await resolveCustomerForEstimate(estimate, customers || []);
  await syncEstimateToPipeline(estimate, customer, { previousEstimateStatus, sessionToken });
  return customer;
};

/**
 * Make sure every client that exists in the Sales Pipeline / workflow also has
 * a shared Customer record, seeded with whatever contact info the work order has.
 * Returns the (possibly extended) customer list.
 */
export const backfillCustomersFromWorkOrders = async (customers, { sessionToken = "" } = {}) => {
  const workOrders = (await fetchAllWorkOrders())
    .sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));
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
      session_token: sessionToken,
    });
    const result = response?.data || response;
    if (result?.error) throw new Error(result.error);
    if (!result?.customer?.id) {
      throw new Error(`Workflow Customer â€œ${company_name}â€� could not be verified after creation.`);
    }
    if (!knownIds.has(result.customer.id)) {
      knownIds.add(result.customer.id);
      merged.push(result.customer);
    }
  }
  return merged;
};