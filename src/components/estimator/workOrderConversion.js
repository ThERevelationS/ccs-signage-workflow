import { getModuleLabel } from "./moduleRegistry";
import { mutateWorkOrderArrayField } from "../workflow/workOrderPersistence";
import { NotificationTriggers } from "@/components/workflow/NotificationService";
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
      proof_file_url: line.proof_file_url || "",
      proof_file_name: line.proof_file_name || "",
      proof_version: num(line.proof_version, 0),
      proof_approved_version: num(line.proof_approved_version, 0),
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

export const PROOF_STATUS_VALUES = ["none", "draft", "sent", "awaiting_approval", "approved", "revision_requested"];

export const FULFILLMENT_STATE_VALUES = [
  "none", "awaiting_pickup", "awaiting_installation", "awaiting_shipping",
  "awaiting_delivery", "picked_up", "installed", "shipped", "delivered",
];

// Operational fields mirrored between WorkOrder.products[] rows and the linked
// BuilderProduct record.
export const PRODUCT_OPERATIONAL_FIELDS = [
  "operational_status", "operational_substatus", "customer_facing_status",
  "fulfillment_state", "design_due_date", "product_due_date", "hard_due_date",
  "designer", "assigned_to", "responsibility", "queue_priority", "proof_status",
  "proof_file_url", "proof_file_name", "proof_version", "proof_approved_version",
  "operational_status_changed_at",
];

export function customerFacingStatusLabel(operationalStatus, explicit = "") {
  if (String(explicit || "").trim()) return String(explicit).trim();
  return OPERATIONAL_STATUS_CUSTOMER_LABELS[norm(operationalStatus)] || "";
}

const requireEnum = (value, allowed, label) => {
  const v = norm(value) || "none";
  if (!allowed.includes(v)) throw new Error(`Unknown ${label} "${String(value).trim()}".`);
  return v;
};

const requireDateString = (value, label = "due date") => {
  const v = String(value || "").trim();
  if (!v) return "";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid ${label} "${v}".`);
  return v;
};

export function buildProductOperationalPatch({
  operationalStatus, operationalSubstatus, proofStatus, fulfillmentState,
  designer, assignedTo, responsibility, queuePriority,
  designDueDate, productDueDate, hardDueDate,
  proofFileUrl, proofFileName, proofVersion, proofApprovedVersion, now,
} = {}) {
  const patch = {};
  if (operationalStatus !== undefined) {
    const status = requireEnum(operationalStatus, OPERATIONAL_STATUS_VALUES, "product status");
    patch.operational_status = status;
    patch.customer_facing_status = customerFacingStatusLabel(status);
    patch.operational_status_changed_at = (now ? new Date(now) : new Date()).toISOString();
  }
  if (operationalSubstatus !== undefined) patch.operational_substatus = String(operationalSubstatus || "").trim();
  if (proofStatus !== undefined) patch.proof_status = requireEnum(proofStatus, PROOF_STATUS_VALUES, "proof status");
  if (fulfillmentState !== undefined) patch.fulfillment_state = requireEnum(fulfillmentState, FULFILLMENT_STATE_VALUES, "fulfillment state");
  if (designer !== undefined) patch.designer = String(designer || "").trim();
  if (assignedTo !== undefined) patch.assigned_to = String(assignedTo || "").trim();
  if (responsibility !== undefined) patch.responsibility = String(responsibility || "").trim();
  if (queuePriority !== undefined) {
    const n = Number(queuePriority);
    patch.queue_priority = Math.max(0, Math.min(99, Math.round(Number.isFinite(n) ? n : 0)));
  }
  if (designDueDate !== undefined) patch.design_due_date = requireDateString(designDueDate);
  if (productDueDate !== undefined) patch.product_due_date = requireDateString(productDueDate);
  if (hardDueDate !== undefined) patch.hard_due_date = Boolean(hardDueDate);
  // Proof file/version fields: version 0 means "none" (no file / no approval).
  if (proofFileUrl !== undefined) patch.proof_file_url = String(proofFileUrl || "").trim();
  if (proofFileName !== undefined) patch.proof_file_name = String(proofFileName || "").trim();
  if (proofVersion !== undefined) {
    const n = Number(proofVersion);
    patch.proof_version = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
  }
  if (proofApprovedVersion !== undefined) {
    const n = Number(proofApprovedVersion);
    patch.proof_approved_version = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
  }
  return patch;
}

const sameField = (a, b) => {
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return String(a ?? "") === String(b ?? "");
};

// Pure patch application: validates input, enforces the hard-due-date rule,
// auto-advances proof_approved when a proof is approved, and appends a capped
// status_history audit trail. Returns the SAME product object when nothing
// changes so callers can no-op.
export function applyProductOperationalPatch(product, patchInput, { now, actor = "", overrideHardDue = false } = {}) {
  const patch = buildProductOperationalPatch({ ...(patchInput || {}), now });
  const nowIso = (now ? new Date(now) : new Date()).toISOString();

  if (
    product?.hard_due_date === true &&
    typeof patch.product_due_date === "string" && patch.product_due_date &&
    String(product?.product_due_date || "") &&
    new Date(requireDateString(patch.product_due_date)).getTime() > new Date(requireDateString(product.product_due_date)).getTime() &&
    patch.hard_due_date !== false &&
    !overrideHardDue
  ) {
    throw new Error("This product has a hard due date; moving it later requires an explicit override.");
  }

  // Approving a proof while the product waits on that approval advances the
  // operational status automatically.
  if (
    patch.proof_status === "approved" &&
    patch.operational_status === undefined &&
    norm(product?.operational_status) === "awaiting_proof_approval"
  ) {
    patch.operational_status = "proof_approved";
    patch.customer_facing_status = customerFacingStatusLabel("proof_approved");
    patch.operational_status_changed_at = nowIso;
  }

  const trackable = [
    "operational_status", "operational_substatus", "customer_facing_status",
    "proof_status", "fulfillment_state", "design_due_date", "product_due_date",
    "hard_due_date", "designer", "assigned_to", "responsibility", "queue_priority",
    "proof_file_url", "proof_file_name", "proof_version", "proof_approved_version",
  ];
  const changed = {};
  for (const field of trackable) {
    if (patch[field] !== undefined && !sameField(product?.[field], patch[field])) changed[field] = patch[field];
  }
  if (!Object.keys(changed).length) return product;

  const entries = Object.keys(changed)
    .filter((field) => field !== "customer_facing_status")
    .map((field) => ({ at: nowIso, field, from: product?.[field] ?? "", to: changed[field], by: actor }));
  if (changed.operational_status !== undefined) changed.operational_status_changed_at = patch.operational_status_changed_at || nowIso;

  return {
    ...product,
    ...changed,
    status_history: [
      ...(Array.isArray(product?.status_history) ? product.status_history : []),
      ...entries,
    ].slice(-50),
  };
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
export async function transitionProductOperationalStatus({ workOrderId, productId, patch = {}, actor = "", overrideHardDue = false, label = "Product status" } = {}) {
  const targetId = String(productId || "").trim();
  if (!targetId) throw new Error(`${label}: this product has no id. Reopen the Work Order to repair it.`);
  return mutateWorkOrderArrayField({
    workOrderId,
    field: "products",
    label,
    mutate: (products) => {
      const index = products.findIndex((product) => String(product?.id || "") === targetId);
      if (index < 0) throw new Error(`${label}: this product is no longer on the Work Order. Reload and try again.`);
      const next = applyProductOperationalPatch(products[index], patch, { actor, overrideHardDue });
      if (next === products[index]) return products;
      const nextProducts = [...products];
      nextProducts[index] = next;
      return nextProducts;
    },
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
export async function syncBuilderProductOperationalStatus({ builderProductId, fields = null, patch = {}, expectedUpdatedDate = "" } = {}) {
  let apply;
  if (fields && typeof fields === "object") {
    apply = {};
    for (const field of PRODUCT_OPERATIONAL_FIELDS) {
      if (fields[field] !== undefined) apply[field] = fields[field];
    }
  } else {
    apply = buildProductOperationalPatch(patch);
  }
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
export async function transitionProductAndBuilderStatus({ workOrderId, product, patch = {}, actor = "", overrideHardDue = false, label = "Product status" } = {}) {
  const saved = await transitionProductOperationalStatus({ workOrderId, productId: product?.id, patch, actor, overrideHardDue, label });
  const savedProducts = Array.isArray(saved?.products) ? saved.products : [];
  const savedProduct = savedProducts.find((row) => String(row?.id || "") === String(product?.id || "")) || null;
  let sync = { synced: false, reason: "no_builder_link" };
  if (product?.builder_product_id) {
    sync = await syncBuilderProductOperationalStatus({
      builderProductId: product.builder_product_id,
      fields: savedProduct || {},
    }).catch(() => ({ synced: false, reason: "error" }));
  }
  // Unified alerts: one product_transition event per actual status change —
  // emitting here in the shared helper covers every caller (product queues,
  // proof panel, job workspace). Fire-and-forget; a notify failure never
  // blocks the transition.
  const previousStatus = String(product?.operational_status || "none").trim() || "none";
  const nextStatus = String(savedProduct?.operational_status || previousStatus).trim() || previousStatus;
  if (saved?.id && savedProduct && previousStatus !== nextStatus) {
    try {
      void NotificationTriggers.productTransition(saved, {
        productId: savedProduct.id || product?.id,
        productDescription: savedProduct.description || product?.description,
        previousStatus,
        newStatus: nextStatus,
        changedBy: actor,
      });
    } catch { /* notify is best-effort */ }
  }
  return { workOrder: saved, product: savedProduct, builderSynced: sync.synced === true };
}
