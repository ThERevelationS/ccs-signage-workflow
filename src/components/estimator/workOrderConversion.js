import { getModuleLabel } from "./moduleRegistry";
import { computeOrderDueDate, computeProductDueDate, recalcOnProofApproval } from "../../../base44/shared/dueDateEngine.ts";
import { OPERATIONAL_STATUS_SET, customerFacingLabel } from "../../../base44/shared/productStatusModel.ts";
import { mutateWorkOrderArrayField } from "../workflow/workOrderPersistence";
import { NotificationTriggers } from "@/components/workflow/NotificationService";
import { staffEntities } from "@/components/staff/staffEntities";
import { DEPOSIT_GATED_STATUSES, depositGateApplies, depositGateMessage } from "./depositGate";
import { acceptedCustomerUnitPrice } from "./customerPricing";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const norm = (value) => String(value || "").trim().toLowerCase();
const firstNonBlank = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? "";

// B-14: canonical initial operational status for conversion-seeded products —
// the locked vocabulary's first WIP value ("order_review") per
// base44/shared/productStatusModel.ts. Guarded so a partially-stubbed test
// bundle (shared imports stubbed to {}) still seeds the same value.
export const INITIAL_OPERATIONAL_STATUS =
  (Array.isArray(OPERATIONAL_STATUS_SET) && OPERATIONAL_STATUS_SET[0]) || "order_review";

const asObjectList = (value) =>
  (Array.isArray(value) ? value.filter((row) => row && typeof row === "object") : []);

// B-14: resolve the parts that drive one line's lead-time due dates through
// the estimate's own part refs. Precedence, most direct first: part rows
// embedded on the line (or on its builder snapshot), then the caller-loaded
// BuilderPart pool matched by estimate_line_id/line_id, then by the line's
// builder_product_id link. Inactive parts never contribute lead.
export function resolveEstimateLineParts(line = {}, partsPool = []) {
  const embedded = [
    line?.parts, line?.part_list, line?.builder_parts,
    line?.builder_snapshot?.parts, line?.builder_snapshot?.part_list,
  ].find((list) => Array.isArray(list) && list.length > 0);
  if (embedded) return asObjectList(embedded).filter((part) => part.is_active !== false);
  const pool = asObjectList(partsPool).filter((part) => part.is_active !== false);
  if (!pool.length) return [];
  const lineId = String(line?.line_id || "").trim();
  const builderProductId = String(line?.builder_product_id || "").trim();
  return pool.filter((part) =>
    (lineId && (
      String(part?.estimate_line_id || "").trim() === lineId ||
      String(part?.line_id || "").trim() === lineId
    )) ||
    (builderProductId && String(part?.builder_product_id || "").trim() === builderProductId)
  );
}

// B-14: gather the estimate's BuilderPart rows for due-date seeding — the
// same two paths buildEstimateMaterialsManifest uses (estimate_id stamp
// first, builder_product_id fallback for legacy parts) — so conversion
// callers can hand the pool to buildEstimateWorkOrderProducts via
// options.parts / pricing.parts. Pure read; failures return [].
export async function loadEstimateConversionParts(estimate = {}, { entity = null } = {}) {
  const Part = entity || staffEntities?.BuilderPart;
  if (typeof Part?.filter !== "function") return [];
  const estimateId = String(estimate?.id || "").trim();
  const lines = Array.isArray(estimate?.line_items) ? estimate.line_items : [];
  const builderProductIds = [...new Set(lines.map((l) => String(l?.builder_product_id || "").trim()).filter(Boolean))];
  const seen = new Set();
  const parts = [];
  const push = (row) => {
    const id = String(row?.id || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    parts.push(row);
  };
  if (estimateId) {
    (await Part.filter({ estimate_id: estimateId }, "created_date", 500))
      .forEach(push);
  }
  for (const bpid of builderProductIds) {
    if (parts.some((p) => String(p?.builder_product_id || "").trim() === bpid)) continue;
    (await Part.filter({ builder_product_id: bpid }, "created_date", 500))
      .forEach(push);
  }
  return parts;
}

// B-14: seed WorkOrder products[] from estimate line_items. Each seeded row
// carries the canonical initial operational_status (blank/"none" line states
// fold to order_review; a real line status is preserved), dual due dates
// computed from resolved part leads through the shared engine (design parts
// use design_lead_days, production uses product_lead_days — max across the
// line's parts, anchored at the conversion moment), responsibility from the
// line then the estimate's defaults, and name/qty/price from the priced line.
// ADD-only: every pre-existing field w-8/w-32 put on the row still emits.
export function buildEstimateWorkOrderProducts(estimate = {}, pricing = {}, options = {}) {
  const pricedByLine = new Map(
    (pricing.sections || [])
      .filter((section) => section?.line_id)
      .map((section) => [section.line_id, section])
  );

  // Part pool for lead resolution: explicit options.parts wins, then
  // pricing.parts, then an estimate.parts payload — each line slices out its
  // own refs via resolveEstimateLineParts.
  const partsPool = asObjectList(options?.parts ?? pricing?.parts ?? estimate?.parts);
  // Leads anchor at the conversion moment by default (options.anchor_date /
  // conversionDate / now, or a pricing-level anchor) so seeded deadlines run
  // from order creation — the same rule recalcOnProofApproval applies later.
  const anchorDate =
    firstNonBlank(options?.anchor_date, options?.conversionDate, options?.now, pricing?.anchor_date) ||
    new Date();
  const dueOptions = {
    clock: options?.clock ?? pricing?.clock ?? null,
    design_clock: options?.design_clock ?? pricing?.design_clock ?? null,
    tier: options?.tier ?? pricing?.lead_tier ?? "standard",
    respect_hard_dates: true,
    push_forward_only: false,
    label: "estimate_conversion",
  };

  return (estimate.line_items || []).map((line, index) => {
    const priced = pricedByLine.get(line.line_id) || line;
    const quantity = Math.max(0, num(priced.quantity, num(line.customer_quantity, 1)));
    const unitPrice = num(priced.unitRaw, acceptedCustomerUnitPrice(line));
    const adjustedTotal = Number.isFinite(Number(priced.adjusted))
      ? Number(priced.adjusted)
      : unitPrice * quantity * (1 + num(line.adjustment_percent) / 100);
    const productName = line.client_product_name || line.project_name || getModuleLabel(line.module_key) || `Product ${index + 1}`;

    // Dual dates: computeProductDueDate echoes the carried (w-32-imported)
    // dates when the line resolves no parts, so nothing regresses for
    // part-less lines — and a hard_due_date row with a stored date holds it.
    const lineParts = resolveEstimateLineParts(line, partsPool);
    const due = typeof computeProductDueDate === "function"
      ? computeProductDueDate({
          parts: lineParts,
          anchor_date: anchorDate,
          hard_due_date: Boolean(line.hard_due_date),
          product_due_date: firstNonBlank(line.product_due_date, priced.product_due_date),
          design_due_date: firstNonBlank(line.design_due_date, priced.design_due_date),
          ...dueOptions,
        })
      : { due_date: line.product_due_date || "", design_due_date: line.design_due_date || "" };

    const explicitStatus = String(line.operational_status || "").trim();
    const seededStatus = explicitStatus && norm(explicitStatus) !== "none"
      ? explicitStatus
      : INITIAL_OPERATIONAL_STATUS;

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
      operational_status: seededStatus,
      operational_substatus: line.operational_substatus || "",
      // Seeded products get the canonical customer-facing label for their
      // initial status (locked vocabulary first, legacy alias map second);
      // an explicit line value always wins.
      customer_facing_status: firstNonBlank(
        line.customer_facing_status,
        typeof customerFacingLabel === "function" ? customerFacingLabel(seededStatus) : "",
        customerFacingStatusLabel(seededStatus),
      ),
      fulfillment_state: line.fulfillment_state || "none",
      design_due_date: due.design_due_date || "",
      product_due_date: due.due_date || "",
      hard_due_date: Boolean(line.hard_due_date),
      designer: line.designer || "",
      assigned_to: line.assigned_to || "",
      // Responsibility seeds per-line first, then whatever estimate-level
      // default the estimate carries (default_responsibility /
      // sales_responsibility / responsibility), then a caller override.
      responsibility: firstNonBlank(
        line.responsibility,
        estimate.default_responsibility,
        estimate.sales_responsibility,
        estimate.responsibility,
        options?.default_responsibility,
        pricing?.default_responsibility,
      ),
      responsibility_color: firstNonBlank(line.responsibility_color, options?.responsibility_color),
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

// --- D-06: conversion history events -----------------------------------------
// ProductActivity-shaped rows (base44/entities/ProductActivity.jsonc) emitted
// onto the WorkOrder payload as conversion_events[]. The frontend build path
// can't write backend-only entities itself, so the rows ride the payload and
// a backend/portal write path persists them later as the job's audit trail.
// `label` duplicates `note` — the order-history feed renders row.label first.

const CONVERSION_ACTOR_TYPES = ["staff", "customer", "vendor", "system"];

const conversionActorParts = (actor) => {
  if (actor && typeof actor === "object") {
    const type = CONVERSION_ACTOR_TYPES.includes(norm(actor.type)) ? norm(actor.type) : "staff";
    return { type, label: firstNonBlank(actor.label, actor.name, actor.email, actor.display_name) };
  }
  return { type: "staff", label: String(actor ?? "").trim() };
};

// One typed conversion event. `product` is optional — omit it for the
// order-level row emitted when no estimate-seeded product matched.
export function buildConversionEvent({ estimate = {}, workOrder = null, product = null, actor = "", now = "" } = {}) {
  const parsedNow = now ? new Date(now) : null;
  const occurred_at = (parsedNow && !Number.isNaN(parsedNow.getTime()) ? parsedNow : new Date()).toISOString();
  const status = String(estimate?.status || "approved").trim().toUpperCase() || "APPROVED";
  const label = `Estimate Converted to Order - via product status (${status})`;
  const who = conversionActorParts(actor);
  const estimateId = String(estimate?.id || "").trim();
  const workOrderId = String(workOrder?.id || "").trim();
  const productId = String(product?.id || "").trim();
  return {
    schema_version: 1,
    // Stable retry-safe receipt — rebuilding the same conversion regenerates
    // the same key, so a persist path honoring creation_request_key and the
    // merge helper below never double-write history.
    creation_request_key: `estimate_conversion:${estimateId || "unknown"}:${workOrderId || "new"}:${productId || "order"}`,
    work_order_id: workOrderId,
    product_id: productId,
    product_label: firstNonBlank(product?.description, product?.client_product_name, product?.product_name),
    event_type: "conversion",
    label,
    actor_type: who.type,
    actor_label: who.label,
    from_value: firstNonBlank(estimate?.estimate_number, estimateId),
    to_value: firstNonBlank(workOrder?.title, workOrderId),
    note: label,
    occurred_at,
    details: {
      source: "estimate_conversion",
      estimate_id: estimateId,
      estimate_number: String(estimate?.estimate_number || ""),
      conversion_status: status,
      estimate_line_id: String(product?.estimate_line_id || ""),
      builder_product_id: String(product?.builder_product_id || ""),
    },
  };
}

// One conversion event per product THIS estimate seeded — matched by
// source_estimate_id or the estimate's own line/product refs, so pre-existing
// products a merged WO carries from other estimates are excluded. When no
// product matches, one order-level row still lands so every conversion is
// audible in history.
export function buildConversionEvents({ estimate = {}, workOrder = null, products = [], actor = "", now = "" } = {}) {
  const estimateId = String(estimate?.id || "").trim();
  const lineIds = new Set();
  const builderProductIds = new Set();
  for (const line of estimate?.line_items || []) {
    const lineId = String(line?.line_id || "").trim();
    const builderProductId = String(line?.builder_product_id || "").trim();
    if (lineId) lineIds.add(lineId);
    if (builderProductId) builderProductIds.add(builderProductId);
  }
  const mine = (Array.isArray(products) ? products : []).filter((product) => {
    if (!product || typeof product !== "object") return false;
    if (estimateId && String(product?.source_estimate_id || "").trim() === estimateId) return true;
    if (lineIds.has(String(product?.estimate_line_id || "").trim())) return true;
    if (builderProductIds.has(String(product?.builder_product_id || "").trim())) return true;
    return false;
  });
  if (!mine.length) return [buildConversionEvent({ estimate, workOrder, actor, now })];
  return mine.map((product) => buildConversionEvent({ estimate, workOrder, product, actor, now }));
}

// Append-only merge keyed on creation_request_key — rebuilding the same
// conversion never duplicates a history row already on the job.
export function mergeConversionEvents(existing = [], incoming = []) {
  const merged = [...(Array.isArray(existing) ? existing : [])];
  const keys = new Set(merged.map((evt) => String(evt?.creation_request_key || "")).filter(Boolean));
  for (const evt of Array.isArray(incoming) ? incoming : []) {
    if (!evt || typeof evt !== "object") continue;
    const key = String(evt?.creation_request_key || "");
    if (key && keys.has(key)) continue;
    if (key) keys.add(key);
    merged.push(evt);
  }
  return merged;
}

// L-10: converted WO estimate_amount falls back quoteTotal → estimate.quote_total
// → accepted line-item sum (same math as the conversion credit check), so a WO
// never lands at $0 just because the caller omitted pricing.quoteTotal.
export function estimateConvertedAmount(estimate = {}, pricing = {}) {
  const priced = num(pricing?.quoteTotal, NaN);
  if (Number.isFinite(priced)) return priced;
  const quoted = num(estimate?.quote_total, NaN);
  if (Number.isFinite(quoted) && quoted > 0) return quoted;
  return (estimate?.line_items || []).reduce(
    (sum, l) => sum + acceptedCustomerUnitPrice(l) * Math.max(1, Number(l?.customer_quantity) || 1),
    0,
  );
}

export function buildConvertedWorkOrderFields({ estimate = {}, pricing = {}, existing = null, products = [], generatedDescription = "", conversionDate = "", verifiedCustomerId = "", actor = "", now = "" } = {}) {
  return {
    title: firstNonBlank(estimate.project_name, existing?.title),
    client_name: firstNonBlank(estimate.client_name, existing?.client_name),
    // Conversion must not revive a stale estimate.customer_id. The caller passes
    // only a Customer ID verified against the live Customer entity.
    customer_id: verifiedCustomerId || "",
    estimate_id: estimate.id || existing?.estimate_id || "",
    // Upstream chain links: the Opportunity workspace and invoice creation
    // aggregate Work Orders by opportunity_id/estimating_request_id — an
    // existing WO keeps its original links when estimates merge into it.
    opportunity_id: firstNonBlank(existing?.opportunity_id, estimate.opportunity_id),
    estimating_request_id: firstNonBlank(existing?.estimating_request_id, estimate.estimating_request_id),
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
    estimate_amount: estimateConvertedAmount(estimate, pricing),
    date_order_created: firstNonBlank(existing?.date_order_created, conversionDate),
    corbridge_invoice_number: firstNonBlank(estimate.estimate_number, existing?.corbridge_invoice_number),
    project_install_date: firstNonBlank(estimate.target_install_date, existing?.project_install_date),
    in_pipeline: true,
    // B-14: order due = max product due date (engine rollup). push_forward_only
    // over the existing date means a merge can push the job later but never
    // pulls it earlier; no product dates echoes the existing date unchanged.
    due_date: (typeof computeOrderDueDate === "function"
      ? computeOrderDueDate({
          products,
          existing_due_date: existing?.due_date || "",
          hard_due_date: existing?.hard_due_date === true,
          push_forward_only: true,
          label: "estimate_conversion",
        }).due_date
      : existing?.due_date) || "",
    products,
    // D-06: conversion history events ride the WO payload — ProductActivity-
    // shaped rows a backend/portal write path can persist as the audit trail.
    conversion_events: mergeConversionEvents(
      existing?.conversion_events,
      buildConversionEvents({ estimate, workOrder: existing, products, actor, now }),
    ),
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
// due date is recalculated from part lead times, a hard due date is never
// moved, and the recalculation only pushes the date forward — all enforced by
// the shared engine in base44/shared/dueDateEngine.ts. This wrapper keeps the
// legacy name/signature and returns the "YYYY-MM-DD" date string the
// operational patch consumes.
//
// Lead-day precedence: an explicit positive `leadTimeDays` (ProofPanel's
// "Lead days" input) becomes a numeric tier override applied per part — each
// part keeps its own min-days floor. When the product carries no parts at all
// the explicit days form a synthesized single-part lead so the manual override
// still lands on unlinked products. With no override the engine's per-part
// min/std/add resolution decides; no parts and no override leaves the existing
// due date unchanged. An explicit `tier` ("standard"|"minimum"|"additional"|
// number) outranks `leadTimeDays`. `parts` defaults to the product's embedded
// part_list/builder_parts/parts when the caller didn't load BuilderPart rows.
export function recalculateProductDueDateOnProofApproval({ product = {}, leadTimeDays = 0, parts, tier, fromDate = new Date() } = {}) {
  const explicit = num(leadTimeDays, 0);
  const hasOverride = explicit > 0;
  const embedded = parts !== undefined
    ? parts
    : product?.parts ?? product?.part_list ?? product?.builder_parts;
  const hasParts = Array.isArray(embedded) && embedded.length > 0;
  const result = recalcOnProofApproval({
    product,
    approval_date: fromDate,
    parts: hasParts ? embedded : (hasOverride ? [{ product_lead_days: explicit }] : []),
    tier: tier !== undefined ? tier : (hasOverride && hasParts ? explicit : "standard"),
  });
  return result.due_date || product?.product_due_date || "";
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
export async function transitionProductAndBuilderStatus({ workOrderId, product, patch = {}, actor = "", overrideHardDue = false, label = "Product status", workOrder = null } = {}) {
  // Deposit gate (warn-only, never a hard block): a product moving INTO a
  // production status on a job whose deposit is required but not yet invoiced
  // asks once â€” "Deposit required $X â€” proceed anyway?" Callers holding the
  // Work Order pass it via `workOrder`; otherwise the live record is fetched.
  // The extra read only happens for production-bound moves, so ordinary
  // status edits never pay for it, and re-picking the held status no-ops.
  // The effective target is the explicit status, or the auto-advance to
  // proof_approved that applyProductOperationalPatch performs when a proof is
  // approved while the product awaits approval (the proof-approval path
  // releases the product to production, so it is gated the same way).
  let targetStatus = norm(patch?.operationalStatus);
  if (!targetStatus && norm(patch?.proofStatus) === "approved" && norm(product?.operational_status) === "awaiting_proof_approval") {
    targetStatus = "proof_approved";
  }
  if (targetStatus && DEPOSIT_GATED_STATUSES.has(targetStatus) && targetStatus !== norm(product?.operational_status)) {
    const woSnapshot = workOrder && typeof workOrder === "object"
      ? workOrder
      : await staffEntities.WorkOrder.get(String(workOrderId || "").trim()).catch(() => null);
    if (
      depositGateApplies(woSnapshot, product, targetStatus)
      && typeof window !== "undefined" && typeof window.confirm === "function"
      && !window.confirm(depositGateMessage(woSnapshot))
    ) {
      throw Object.assign(new Error("Deposit required â€” the move into production was not applied."), { depositCancelled: true });
    }
  }
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