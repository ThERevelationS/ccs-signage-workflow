import { getModuleLabel } from "./moduleRegistry";
import { mutateWorkOrderArrayField } from "../workflow/workOrderPersistence";
import { staffEntities } from "@/components/staff/staffEntities";
import { acceptedCustomerUnitPrice } from "./customerPricing";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const norm = (value) => String(value || "").trim().toLowerCase();
const firstNonBlank = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? "";

export function buildEstimateWorkOrderProducts(estimate = {}, pricing = {}) {
  const pricedByLine = new Map(
    (pricing.sections || [])
      .filter((section) => section?.line_id)
      .map((section) => [section.line_id, section])
  );

  return (estimate.line_items || []).map((line, index) => {
    const priced = pricedByLine.get(line.line_id) || line;
    const quantity = Math.max(0, num(priced.quantity, num(line.customer_quantity, 1)));
    const unitPrice = num(priced.unitRaw, acceptedCustomerUnitPrice(line));
    const adjustedTotal = Number.isFinite(Number(priced.adjusted))
      ? Number(priced.adjusted)
      : unitPrice * quantity * (1 + num(line.adjustment_percent) / 100);
    const productName = line.client_product_name || line.project_name || getModuleLabel(line.module_key) || `Product ${index + 1}`;

    return {
      id: line.builder_product_id || line.line_id || line.project_id || `estimate-product-${index + 1}`,
      description: productName,
      // SIP/production Product Type is an explicit classification selected on
      // the estimator Product. Builder/module names are not interchangeable
      // with the production taxonomy, so never guess a fallback here.
      product_type: line.production_product_type || "",
      estimate_line_id: line.line_id || "",
      builder_product_id: line.builder_product_id || "",
      source_project_id: line.project_id || "",
      module_key: line.module_key || "",
      quantity,
      quoted_unit_price: unitPrice,
      quoted_total: adjustedTotal,
      category: line.product_category || "",
      customer_description: line.customer_description || "",
      estimator_notes: line.product_notes || "",
      operational_status: line.operational_status || "order_review",
      operational_substatus: line.operational_substatus || "",
      customer_facing_status: line.customer_facing_status || "",
      fulfillment_state: line.fulfillment_state || "none",
      design_due_date: line.design_due_date || "",
      product_due_date: line.product_due_date || "",
      hard_due_date: Boolean(line.hard_due_date),
      designer: line.designer || "",
      assigned_to: line.assigned_to || "",
      responsibility: line.responsibility || "",
      queue_priority: num(line.queue_priority, 0),
      proof_status: line.proof_status || "none",
    };
  });
}


// CoreBridge-style customer-facing labels: internal operational_status values are
// never shown to the customer directly; each maps to a safe display label.
export const OPERATIONAL_STATUS_CUSTOMER_LABELS = {
  order_review: "Prepping Your Order",
  site_survey: "Site Survey",
  awaiting_customer_action: "Customer Action Needed",
  awaiting_proof_approval: "Requires Proof Approval",
  permitting: "Permitting",
  proof_approved: "Proof Approved",
  design_review: "In Design",
  in_design: "In Design",
  in_production: "In Production",
  quality_control: "Quality Control",
  service_repair: "Service/Repair",
  install_or_removal_only: "Install or Removal Only",
  vended: "In Production",
  none: "",
};

export const OPERATIONAL_STATUS_VALUES = Object.keys(OPERATIONAL_STATUS_CUSTOMER_LABELS);

export function customerFacingStatusLabel(operationalStatus, explicit = "") {
  if (String(explicit || "").trim()) return String(explicit).trim();
  return OPERATIONAL_STATUS_CUSTOMER_LABELS[norm(operationalStatus)] || "";
}

export function buildProductOperationalPatch({ operationalStatus, operationalSubstatus, proofStatus, fulfillmentState } = {}) {
  const patch = {};
  if (operationalStatus !== undefined) {
    const status = norm(operationalStatus) || "none";
    patch.operational_status = status;
    patch.customer_facing_status = customerFacingStatusLabel(status);
  }
  if (operationalSubstatus !== undefined) patch.operational_substatus = String(operationalSubstatus || "").trim();
  if (proofStatus !== undefined) patch.proof_status = norm(proofStatus) || "none";
  if (fulfillmentState !== undefined) patch.fulfillment_state = norm(fulfillmentState) || "none";
  return patch;
}

// CoreBridge rule mirrored: when every product on an estimate converts to an
// approved operational state, the order itself may advance. Keep this as a
// pure predicate so the work-order stage change stays an explicit caller step.
export function allProductsOperationallyApproved(products = []) {
  const list = (products || []).filter((product) => product && product.id);
  if (!list.length) return false;
  return list.every((product) => norm(product.operational_status) === "proof_approved" || norm(product.proof_status) === "approved");
}

const productKey = (product = {}) => {
  if (product.id) return `id:${product.id}`;
  return `name:${norm(product.description)}|type:${norm(product.product_type)}`;
};

// WorkOrder products may already have been edited by Sales/Production. Preserve
// those rows exactly and append only estimate Products that are not represented.
export function mergeWorkOrderProducts(existingProducts = [], estimateProducts = []) {
  const merged = [...(existingProducts || [])];
  const keys = new Set(merged.map(productKey));
  for (const product of estimateProducts || []) {
    const key = productKey(product);
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(product);
  }
  return merged;
}

export function selectExistingEstimateWorkOrder(rows = [], linkedWorkOrderId = "") {
  const activeRows = (rows || []).filter((row) => row?.deleted !== true);
  if (linkedWorkOrderId) {
    const linked = activeRows.find((row) => row.id === linkedWorkOrderId);
    if (linked) return linked;
  }
  return activeRows.slice().sort((a, b) => {
    const aTime = Date.parse(a?.created_date || a?.updated_date || "") || 0;
    const bTime = Date.parse(b?.created_date || b?.updated_date || "") || 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0] || null;
}

export function convertedWorkOrderStage(existingStage) {
  // Do not move a WorkOrder backward if operations has already advanced it.
  if (existingStage && !["estimating", "sales"].includes(existingStage)) return existingStage;
  return "sales";
}

export function buildConvertedWorkOrderFields({ estimate = {}, pricing = {}, existing = null, products = [], generatedDescription = "", conversionDate = "", verifiedCustomerId = "" } = {}) {
  return {
    title: firstNonBlank(estimate.project_name, existing?.title),
    client_name: firstNonBlank(estimate.client_name, existing?.client_name),
    // Conversion must not revive a stale estimate.customer_id. The caller passes
    // only a Customer ID verified against the live Customer entity.
    customer_id: verifiedCustomerId || "",
    estimate_id: estimate.id || existing?.estimate_id || "",
    // Preserve richer sales/production notes already entered on the pipeline lead.
    description: firstNonBlank(existing?.description, generatedDescription),
    current_stage: convertedWorkOrderStage(existing?.current_stage),
    sales_status: "won",
    install_location: firstNonBlank(estimate.site_address, existing?.install_location),
    contact_name: firstNonBlank(estimate.contact_name, estimate.order_contact, existing?.contact_name),
    contact_email: firstNonBlank(estimate.contact_email, existing?.contact_email),
    contact_phone: firstNonBlank(estimate.contact_phone, estimate.office_phone, existing?.contact_phone),
    representative: firstNonBlank(estimate.order_contact, existing?.representative),
    sales_rep: firstNonBlank(estimate.salesperson, existing?.sales_rep),
    estimator: firstNonBlank(estimate.salesperson, existing?.estimator),
    estimate_amount: num(pricing.quoteTotal),
    date_order_created: firstNonBlank(existing?.date_order_created, conversionDate),
    corbridge_invoice_number: firstNonBlank(estimate.estimate_number, existing?.corbridge_invoice_number),
    project_install_date: firstNonBlank(estimate.target_install_date, existing?.project_install_date),
    in_pipeline: true,
    products,
  };
}

// Apply an operational-status patch to a single product inside WorkOrder.products
// through the CAS-backed array mutation helper. Returns the saved WorkOrder.
export async function transitionProductOperationalStatus({ workOrderId, productId, patch = {}, label = "Product status" } = {}) {
  const apply = buildProductOperationalPatch(patch);
  if (!Object.keys(apply).length) throw new Error();
  const targetId = String(productId || "").trim();
  if (!targetId) throw new Error();
  return mutateWorkOrderArrayField({
    workOrderId,
    field: "products",
    label,
    mutate: (products) => products.map((product) =>
      String(product?.id || "") === targetId ? { ...product, ...apply } : product
    ),
  });
}

// CoreBridge due-date rule mirrored: when a product reaches proof approval its
// due date may be recalculated from part lead times, but a hard due date is
// never moved. Returns the next due-date ISO string, or the existing one when
// no recalculation is permitted.
export function recalculateProductDueDateOnProofApproval({ product = {}, leadTimeDays = 0, fromDate = new Date() } = {}) {
  if (product.hard_due_date === true) return product.product_due_date || "";
  const days = Math.max(0, num(leadTimeDays, 0));
  const base = new Date(fromDate);
  if (Number.isNaN(base.getTime())) return product.product_due_date || "";
  base.setDate(base.getDate() + days);
  return base.toISOString();
}

// Sync an operational-status patch back to the linked BuilderProduct so the
// estimator-side record stays truthful. CAS on updated_date; a sync failure
// returns synced:false rather than throwing so the WorkOrder transition is
// never rolled back by a builder-record write issue.
export async function syncBuilderProductOperationalStatus({ builderProductId, patch = {}, expectedUpdatedDate = "" } = {}) {
  const apply = buildProductOperationalPatch(patch);
  const id = String(builderProductId || "").trim();
  if (!id || !Object.keys(apply).length) return { synced: false, reason: "nothing_to_apply" };
  const entity = staffEntities?.BuilderProduct;
  if (!entity?.updateMany) return { synced: false, reason: "unavailable" };
  const live = await entity.get(id).catch(() => null);
  if (!live?.id) return { synced: false, reason: "not_found" };
  if (expectedUpdatedDate && String(live.updated_date || "") !== String(expectedUpdatedDate)) {
    return { synced: false, reason: "stale" };
  }
  const result = await entity.updateMany({ id, updated_date: live.updated_date }, { $set: apply }).catch(() => null);
  if (!result || (typeof result.updated === "number" && result.updated < 1)) return { synced: false, reason: "write_failed" };
  return { synced: true };
}

// Transition a work-order product and best-effort sync the same patch to the
// linked BuilderProduct in one call.
export async function transitionProductAndBuilderStatus({ workOrderId, product, patch = {}, label = "Product status" } = {}) {
  const saved = await transitionProductOperationalStatus({ workOrderId, productId: product?.id, patch, label });
  const builderId = product?.builder_product_id || product?.id;
  const sync = await syncBuilderProductOperationalStatus({ builderProductId: builderId, patch }).catch(() => ({ synced: false, reason: "error" }));
  return { workOrder: saved, builderSynced: sync.synced === true };
}


