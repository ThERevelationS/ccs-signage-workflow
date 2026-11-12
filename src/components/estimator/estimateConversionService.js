import { base44 } from "@/api/base44Client";
import { getModuleLabel } from "./moduleRegistry";
import { acceptedInternalEstimateCost, acceptedCustomerUnitPrice } from "./customerPricing";
import { hasVerifiedEstimateSalesActivity } from "./estimateSalesActivity.mjs";
import { ensureEstimateLifecycleRevision } from "./estimateRevisionService";
import { getPendingEstimatePriceAcceptance } from "./estimateMutationGuard";
import { localDateStamp } from "./quoteLifecycle";
import { loadAllEntityRows } from "./loadAllEntityRows";
import { convergeCreatedEstimateWorkOrder, loadAllCustomers, resolveCustomerForEstimate } from "./customerSync";
import { replaceWorkOrderFieldsIfUnchanged } from "@/components/workflow/workOrderPersistence";
import { createEstimateLinkedWorkOrderWithRecovery, expectedWorkOrderFields } from "./workOrderSyncPersistence";
import { expectedEstimateFields, replaceEstimateFieldsIfUnchanged } from "./estimatePersistence";
import { staffEntities } from "@/components/staff/staffEntities";
import { projectFoundationReinforcementWorkOrderPart } from "./foundation/foundationReinforcementWorkOrderPart";
import {
  buildConvertedWorkOrderFields,
  buildEstimateWorkOrderProducts,
  estimateConvertedAmount,
  mergeWorkOrderProducts,
  selectExistingEstimateWorkOrder,
} from "./workOrderConversion";

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const str = (value) => String(value ?? "").trim();

// Platform-user conversion (EstimateDetail) reads through base44.entities;
// staff-session flows (EstimatorQueues bulk) must go through the staffEntity
// gateways — caller picks, defaults keep the original component's clients.
const defaultEntities = () => ({
  Estimate: base44.entities.AllInOneEstimate,
  WorkOrder: base44.entities.WorkOrder,
});

// Per-module WO task templates: each estimate section contributes its
// module's prep tasks ahead of the section line itself. Mirrors the seed
// list customerSync.syncEstimateToPipeline uses for brand-new jobs — kept
// here so conversion paths share the same checklist shape.
export const ESTIMATE_SECTION_TASK_TEMPLATES = {
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

export function buildEstimateWorkOrderSeedTasks(estimate, { idPrefix = "" } = {}) {
  return (Array.isArray(estimate?.line_items) ? estimate.line_items : [])
    .flatMap((line) => {
      const moduleKey = str(line?.module_key);
      const template = (ESTIMATE_SECTION_TASK_TEMPLATES[moduleKey] || []).map((text, i) => ({
        id: `${idPrefix}tpl_${moduleKey}_${line?.line_id || i}_${i}`,
        text,
        completed: false,
      }));
      const sectionTask = {
        id: `${idPrefix}sec_${line?.line_id || Math.random().toString(36).slice(2, 10)}`,
        text: `Estimate section: ${line?.client_product_name || line?.builder_name || moduleKey || "Product"}`,
        completed: false,
      };
      return sectionTask.text !== "Estimate section: Product" ? [...template, sectionTask] : template;
    });
}

// Union task lists by task id, then by text — a live WO checklist is never
// overwritten; combined conversion appends only the new estimate's seeds.
export function mergeWorkOrderTasks(existing = [], incoming = []) {
  const merged = [...(Array.isArray(existing) ? existing : [])];
  const ids = new Set(merged.map((t) => str(t?.id)).filter(Boolean));
  const texts = new Set(merged.map((t) => str(t?.text)).filter(Boolean));
  for (const task of incoming || []) {
    const id = str(task?.id);
    const text = str(task?.text);
    if ((id && ids.has(id)) || (text && texts.has(text))) continue;
    if (id) ids.add(id);
    if (text) texts.add(text);
    merged.push(task);
  }
  return merged;
}

// WO.materials manifest — FLATTENED shape (not per-section nested): the WO
// detail/production views consume materials as a flat pick/cost list, and
// every row keeps its full provenance (source_estimate_id,
// source_estimate_number, estimate_line_id, builder_product_id, module_key,
// section_name) so section-level pricing origin survives the merge onto the
// WorkOrder. Costs come from the BuilderPart frozen snapshots — the prices
// the customer actually approved.
export async function buildEstimateMaterialsManifest(estimate, { parts = null } = {}) {
  const estimateId = str(estimate?.id);
  if (!estimateId) return [];
  if (parts != null && !Array.isArray(parts)) {
    throw new Error("Parts must be an array when provided for material conversion.");
  }
  const lines = Array.isArray(estimate?.line_items) ? estimate.line_items : [];
  const lineByProduct = new Map();
  for (const line of lines) {
    const bpid = str(line?.builder_product_id);
    if (bpid) lineByProduct.set(bpid, line);
  }
  let allParts = parts;
  if (!Array.isArray(allParts)) {
    allParts = [];
    const seen = new Set();
    // Primary path: parts stamped with estimate_id (partSync writes it).
    const byEstimate = await loadAllEntityRows({
      entity: staffEntities.BuilderPart,
      query: { estimate_id: estimateId },
      sort: "created_date",
      label: "Conversion materials manifest",
    });
    for (const p of byEstimate) {
      const id = str(p?.id);
      if (id && !seen.has(id)) { seen.add(id); allParts.push(p); }
    }
    // A Product can mix stamped and older Parts. Read every linked Product,
    // paging legacy rows too, rather than treating one stamped Part as complete.
    for (const bpid of lineByProduct.keys()) {
      const rows = await loadAllEntityRows({
        entity: staffEntities.BuilderPart,
        query: { builder_product_id: bpid },
        sort: "created_date",
        label: "Conversion Product materials manifest",
      });
      for (const p of rows) {
        const id = str(p?.id);
        if (id && !seen.has(id)) { seen.add(id); allParts.push(p); }
      }
    }
  }
  return allParts
    .filter((p) => p && p.is_active !== false)
    .map((p) => {
      const line = lineByProduct.get(str(p?.builder_product_id)) || null;
      return {
        builder_part_id: str(p?.id),
        part_key: str(p?.part_key),
        part_name: str(p?.part_name) || str(p?.client_label) || str(p?.inventory_item_name) || "Part",
        part_type: str(p?.part_type),
        part_subtype: str(p?.part_subtype),
        quantity: num(p?.quantity, 1),
        unit: str(p?.unit),
        unit_cost: num(p?.frozen_unit_cost),
        extended_cost: num(p?.frozen_extended_cost),
        inventory_item_id: str(p?.inventory_item_id),
        inventory_item_name: str(p?.inventory_item_name),
        source: "estimate_conversion",
        source_estimate_id: estimateId,
        source_estimate_number: str(estimate?.estimate_number),
        estimate_line_id: str(line?.line_id),
        builder_product_id: str(p?.builder_product_id),
        module_key: str(line?.module_key) || str(p?.source_module_key),
        section_name: str(line?.client_product_name || line?.project_name),
        ...projectFoundationReinforcementWorkOrderPart(p),
      };
    })
    .sort((a, b) => a.part_name.localeCompare(b.part_name));
}

// Merge materials onto an existing WO manifest. Existing rows win by
// identity (builder_part_id + source_estimate_id) so a re-conversion or a
// combined merge never duplicates a material line already on the job.
export function mergeWorkOrderMaterials(existing = [], incoming = []) {
  const merged = [...(Array.isArray(existing) ? existing : [])];
  const keys = new Set(merged.map((m) => `${str(m?.builder_part_id)}|${str(m?.source_estimate_id)}`));
  for (const row of incoming || []) {
    const key = `${str(row?.builder_part_id)}|${str(row?.source_estimate_id)}`;
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(row);
  }
  return merged;
}

// Validate the caller's loaded estimate against live state and resolve the
// WorkOrder it would convert onto (existing or none) plus the verified
// shared Customer link. Pure reads — throws with the user-facing reason.
export async function prepareEstimateConversion({
  estimate,
  expectedUpdatedDate = undefined,
  entities = null,
  sharedWorkOrder = undefined,
} = {}) {
  const { Estimate, WorkOrder } = entities || defaultEntities();
  const estimateBefore = await Estimate.get(str(estimate?.id));
  const pendingPrice = getPendingEstimatePriceAcceptance(estimateBefore);
  if (pendingPrice) {
    const name = pendingPrice.line?.client_product_name || pendingPrice.line?.project_name || "Product";
    const resumeLabel = pendingPrice.pending?.kind === "builder_initial_freeze"
      ? "Resume Initial Price"
      : pendingPrice.pending?.kind === "builder_detach_override"
        ? "Resume Part Detach"
        : pendingPrice.pending?.kind === "builder_detached_override_update"
          ? "Resume Part Change"
          : pendingPrice.pending?.kind === "builder_reattach_parts"
            ? "Resume Reattach"
            : pendingPrice.pending?.kind === "builder_manual_part_add"
              ? "Resume Part Add"
              : pendingPrice.pending?.kind === "builder_manual_part_edit"
                ? "Resume Part Edit"
                : pendingPrice.pending?.kind === "builder_manual_part_switch"
                  ? "Resume Part Switch"
                  : pendingPrice.pending?.kind === "builder_manual_part_remove"
                    ? "Resume Part Remove"
                    : pendingPrice.pending?.kind === "builder_part_package_add"
                      ? "Resume Part Insert"
                      : pendingPrice.pending?.kind === "builder_manual_product_price"
                        ? "Resume Product Price"
                        : pendingPrice.pending?.kind === "builder_part_group_clone"
                          ? "Resume Group Clone"
                          : pendingPrice.pending?.kind === "builder_part_group_move"
                            ? "Resume Group Move"
                            : pendingPrice.pending?.kind === "builder_part_group_create"
                              ? "Resume Group Create"
                              : pendingPrice.pending?.kind === "builder_part_group_dissolve"
                                ? "Resume Group Dissolve"
                                : pendingPrice.pending?.kind === "builder_blank_product_insert"
                                  ? "Resume Product Add"
                                  : pendingPrice.pending?.kind === "builder_product_remove"
                                    ? "Resume Product Remove"
                                    : pendingPrice.pending?.kind === "builder_quick_product_insert"
                                      ? pendingPrice.pending?.source_type === "product_clone" ? "Resume Product Clone" : "Resume Quick Product"
                                      : "Resume Price Update";
    throw new Error(`"${name}" has a Builder mutation recovery pending. Use ${resumeLabel} before converting this estimate to a Work Order.`);
  }
  if (estimateBefore.status !== "approved") {
    throw new Error("Only an Approved estimate can be converted to a Work Order. Record customer acceptance or approve the estimate first.");
  }
  if (estimateBefore.pipeline_sync_pending) {
    throw new Error("Sales Pipeline synchronization is still pending. Retry that synchronization from Finalize Estimate before converting this estimate to a Work Order.");
  }
  const anchor = expectedUpdatedDate === undefined ? estimate?.updated_date : expectedUpdatedDate;
  if (anchor && estimateBefore.updated_date && anchor !== estimateBefore.updated_date) {
    throw new Error("This estimate changed in another session. Reload before converting so newer approved pricing/details are not overwritten.");
  }

  let existing = null;
  if (sharedWorkOrder !== undefined) {
    // Combined path: the caller pre-resolved the canonical job (a create the
    // caller already committed, or a live WO one of the estimates links).
    existing = sharedWorkOrder;
  } else {
    const matches = await WorkOrder.filter({ estimate_id: estimate.id });
    const activeMatches = (matches || []).filter((row) => row?.deleted !== true);
    existing = selectExistingEstimateWorkOrder(activeMatches, estimateBefore.work_order_id || estimate.work_order_id);
    if (!existing && (matches || []).some((row) => row?.deleted === true)) {
      throw new Error("This estimate's linked Work Order is in Trash. Restore that Work Order from Project Trash before converting the estimate again.");
    }
    const linkedId = str(estimateBefore.work_order_id || estimate.work_order_id);
    if (!existing && linkedId) {
      // work_order_id is set but no estimate_id-linked WO matched — the link
      // may point at a WO created by the combined path (estimate_ids only).
      // O-014 -- fail-closed: a transient WorkOrder.get failure propagates
      // rather than silently reading the link as absent (a not-found returns
      // null through the get contract; an error is a real failure).
      const linked = await WorkOrder.get(linkedId);
      if (linked?.id && linked.deleted !== true) existing = linked;
    }
  }

  const customers = await loadAllCustomers();
  const resolvedCustomer = await resolveCustomerForEstimate(
    { ...estimateBefore, customer_id: existing?.customer_id || estimateBefore.customer_id || "" },
    customers || [],
  );
  const verifiedCustomerId = resolvedCustomer?.id || "";
  return { estimateBefore, existing, resolvedCustomer, verifiedCustomerId };
}

// Credit gate — CoreBridge semantics. `decide` resolves interactive prompts;
// without it the gate blocks non-admin holds/overages honestly (bulk path).
// Returns { outcome: "ok" } or { outcome: "blocked", reason } / "aborted".
export async function checkEstimateConversionCredit({
  resolvedCustomer,
  estimate,
  pricing = {},
  currentUser = null,
  sessionToken = "",
  decide = null,
} = {}) {
  if (!resolvedCustomer?.id) return { outcome: "ok" };
  const isAdmin = String(currentUser?.role || "").toLowerCase() === "admin";
  const customerName = resolvedCustomer?.company_name || "This customer";
  const decideOrBlock = async (kind, message) => {
    if (typeof decide === "function") {
      const answer = await decide({ kind, message, isAdmin });
      if (answer === "blocked") return { outcome: "blocked", reason: message };
      return answer ? { outcome: "ok" } : { outcome: "aborted", reason: message };
    }
    return isAdmin ? { outcome: "blocked", reason: `${message} (admin may override interactively)` } : { outcome: "blocked", reason: message };
  };
  if (resolvedCustomer?.credit_hold === true) {
    return decideOrBlock("credit_hold", `${customerName} is on CREDIT HOLD — new work orders are blocked. An administrator can clear the hold on the customer record.`);
  }
  if (Number(resolvedCustomer?.credit_limit) > 0) {
    const limit = Number(resolvedCustomer.credit_limit);
    const estimateTotal = Number.isFinite(num(pricing.quoteTotal, NaN))
      ? num(pricing.quoteTotal)
      : (estimate?.line_items || []).reduce(
          (sum, l) => sum + acceptedCustomerUnitPrice(l) * Math.max(1, Number(l?.customer_quantity) || 1),
          0,
        );
    let openAr = null;
    if (sessionToken) {
      try {
        const r = await base44.functions.invoke("invoicingAction", {
          session_token: sessionToken,
          action: "list_invoices",
          limit: 500,
        });
        const data = r?.data || r;
        if (data?.success) {
          openAr = (data.invoices || []).reduce(
            (sum, inv) => (inv?.customer_id === resolvedCustomer.id && inv?.status !== "void" ? sum + (Number(inv?.balance_due) || 0) : sum),
            0,
          );
        }
      } catch { /* openAr stays null — handled below, never silently counted as 0 */ }
    }
    // Unverifiable AR means exposure cannot be computed — gate it like any
    // other credit decision rather than passing with a fabricated 0.
    if (openAr == null) {
      return decideOrBlock("credit_limit", `${customerName} has a credit limit ${limit.toFixed(2)} but open AR could not be loaded — credit exposure cannot be verified.`);
    }
    const exposure = openAr + estimateTotal;
    if (exposure > limit + 0.005) {
      const arNote = `open AR ${openAr.toFixed(2)}`;
      return decideOrBlock("credit_limit", `${customerName} would exceed its credit limit — ${arNote} + this estimate ${estimateTotal.toFixed(2)} = ${exposure.toFixed(2)} vs limit ${limit.toFixed(2)}.`);
    }
  }
  return { outcome: "ok" };
}

// Write the WO (create or CAS-update), CAS-link the estimate, write the
// lifecycle revision. Returns { workOrder, estimateSaved }.
export async function commitEstimateConversion({
  estimate,
  estimateBefore,
  existing,
  verifiedCustomerId,
  pricing = {},
  sessionToken = "",
  entities = null,
  extraWorkOrderFields = {},
  idempotencyPrefix = "work_order_conversion",
  reason = "Converted approved estimate to Work Order",

} = {}) {
  const { Estimate, WorkOrder } = entities || defaultEntities();
  const src = estimateBefore || estimate;
  const sections = (src.line_items || [])
    .map((l) => `• ${getModuleLabel(l.module_key)} — ${l.project_name}`)
    .join("\n");

  const estimateProducts = buildEstimateWorkOrderProducts(src, pricing)
    .map((product) => ({
      ...product,
      source_estimate_id: src.id || "",
      source_estimate_number: src.estimate_number || "",
    }));
  const products = mergeWorkOrderProducts(existing?.products || [], estimateProducts);
  const generatedDescription = [src.notes, sections].filter(Boolean).join("\n\n");
  const materials = mergeWorkOrderMaterials(
    existing?.materials || [],
    await buildEstimateMaterialsManifest(src),
  );
  const convertedFields = buildConvertedWorkOrderFields({
    estimate: src,
    pricing,
    existing,
    products,
    generatedDescription,
    conversionDate: localDateStamp(),
    verifiedCustomerId,
  });
  const hasConversionSalesActivity = !existing || hasVerifiedEstimateSalesActivity(existing, convertedFields, {
    includeProducts: true,
  });
  const conversionActivityStamp = new Date().toISOString();
  const workOrderFields = {
    ...convertedFields,
    materials,
    ...extraWorkOrderFields,
    ...(hasConversionSalesActivity ? { sales_last_activity_at: conversionActivityStamp } : {}),
    ...(existing?.sales_status !== "won" ? { sales_stage_changed_at: conversionActivityStamp } : {}),
  };

  let workOrder;
  if (existing?.id) {
    workOrder = await replaceWorkOrderFieldsIfUnchanged({
      workOrderId: existing.id,
      expectedFields: expectedWorkOrderFields(existing, workOrderFields),
      nextFields: workOrderFields,
      label: "Approved estimate Work Order conversion",
    });
  } else {
    const seedTasks = buildEstimateWorkOrderSeedTasks(src);
    const createFields = {
      ...workOrderFields,
      ...(seedTasks.length ? { tasks: seedTasks } : {}),
    };
    workOrder = await createEstimateLinkedWorkOrderWithRecovery({
      entity: WorkOrder,
      estimateId: src.id,
      data: createFields,
      label: "Approved estimate Work Order conversion",
      convergeCreated: (created) => convergeCreatedEstimateWorkOrder({
        estimateId: src.id,
        created,
        fields: createFields,
        sessionToken,
        duplicateLabel: "Work Order during simultaneous conversion",
      }),
    });
  }

  const internalCost = acceptedInternalEstimateCost(src.line_items || []);
  const { id: _id, created_date: _created_date, updated_date: _updated_date, created_by_id: _created_by_id, created_by: _created_by, ...estimateData } = src;
  const conversionEstimateFields = {
    ...estimateData,
    work_order_id: workOrder.id,
    status: "approved",
    edit_reason: "",
    total_cost: internalCost,
    quote_total: num(pricing.quoteTotal, num(src.quote_total)),
    sales_stage: "won",
    sales_stage_changed_at: new Date().toISOString(),
  };
  const estimateAfter = {
    ...src,
    ...conversionEstimateFields,
  };
  const estimateSaved = await replaceEstimateFieldsIfUnchanged({
    entity: Estimate,
    estimateId: src.id,
    expectedFields: expectedEstimateFields(src, conversionEstimateFields),
    guardFields: { updated_date: src.updated_date },
    nextFields: conversionEstimateFields,
    label: "Approved Estimate Work Order conversion link",
  });
  await ensureEstimateLifecycleRevision({
    idempotencyKey: `${idempotencyPrefix}:${workOrder.id}`,
    sessionToken,
    estimateBefore: src,
    estimateAfter,
    reason,
    revisionType: "conversion",
    quoteTotalBefore: src.quote_total,
    quoteTotalAfter: conversionEstimateFields.quote_total,
    internalCostBefore: src.total_cost,
    internalCostAfter: internalCost,
    workOrderId: workOrder.id,
  });
  return { workOrder, estimateSaved };
}

/**
 * Convert ONE approved estimate to a Work Order. Extracted from
 * ConvertToWorkOrder.jsx so the component and queue bulk actions share the
 * same guarded pipeline. UI hooks:
 *   hooks.confirmBeforeCommit(prepared) -> truthy to continue (preview gate)
 *   hooks.decideCredit({kind,message,isAdmin}) -> true to proceed, false to
 *     abort, "blocked" to record a hard block (omitted = non-interactive)
 */
export async function convertEstimateToWorkOrder({
  estimate,
  pricing = {},
  sessionToken = "",
  currentUser = null,
  expectedUpdatedDate = undefined,
  entities = null,
  hooks = {},
} = {}) {
  const prepared = await prepareEstimateConversion({ estimate, expectedUpdatedDate, entities });
  const credit = await checkEstimateConversionCredit({
    resolvedCustomer: prepared.resolvedCustomer,
    estimate: prepared.estimateBefore,
    pricing,
    currentUser,
    sessionToken,
    decide: hooks.decideCredit,
  });
  if (credit.outcome === "blocked") {
    return { status: "blocked", reason: credit.reason, prepared };
  }
  if (credit.outcome === "aborted") {
    return { status: "aborted", reason: credit.reason, prepared };
  }
  if (typeof hooks.confirmBeforeCommit === "function") {
    const proceed = await hooks.confirmBeforeCommit(prepared);
    if (!proceed) return { status: "aborted", prepared };
  }
  const result = await commitEstimateConversion({
    estimate,
    estimateBefore: prepared.estimateBefore,
    existing: prepared.existing,
    verifiedCustomerId: prepared.verifiedCustomerId,
    pricing,
    sessionToken,
    entities,
  });
  return { status: "converted", ...result };
}

/**
 * (#180) Combine multiple approved estimates into ONE canonical Work Order.
 * The earliest-created estimate keeps WO.estimate_id (single-link
 * compatibility); every estimate id lands in WO.estimate_ids and each
 * estimate's work_order_id links the shared job. Merged line_items (products
 * carry source_estimate_id provenance), tasks and materials are unioned onto
 * the WO. Each estimate transition is CAS-guarded on its own updated_date —
 * a concurrent edit aborts only that estimate's link, reported per row.
 */
export async function convertEstimatesToSharedWorkOrder({
  estimates = [],
  sessionToken = "",
  currentUser = null,
  entities = null,
  hooks = {},
} = {}) {
  const ent = entities || defaultEntities();
  const { WorkOrder } = ent;
  const rows = (Array.isArray(estimates) ? estimates : []).filter((e) => e && e.id);
  if (rows.length < 2) throw new Error("Select at least two approved estimates to combine into one Work Order.");

  // Load fresh rows and validate each up front — invalid estimates are
  // reported and excluded; conversion proceeds over the valid remainder.
  const prepared = [];
  const rejected = [];
  for (const row of rows) {
    try {
      prepared.push(await prepareEstimateConversion({ estimate: row, entities: ent, sharedWorkOrder: null }));
    } catch (error) {
      rejected.push({ estimate_id: row.id, estimate_number: row.estimate_number || "", reason: error?.message || "Not convertible." });
    }
  }
  if (prepared.length < 2) {
    return { status: "nothing_to_convert", rejected, results: [] };
  }
  prepared.sort((a, b) => str(a.estimateBefore?.created_date).localeCompare(str(b.estimateBefore?.created_date)) || str(a.estimateBefore?.id).localeCompare(str(b.estimateBefore?.id)));

  // Canonical job: a live WO any estimate already links wins (merge-into);
  // otherwise the WO gets created on the first commit below.
  const linkedIds = [...new Set(prepared.map((p) => str(p.estimateBefore?.work_order_id)).filter(Boolean))];
  let sharedWo = null;
  for (const woId of linkedIds) {
    const wo = await WorkOrder.get(woId);
    if (wo?.id && wo.deleted !== true) { sharedWo = wo; break; }
    if (wo?.deleted === true) {
      rejected.push({ estimate_id: "", estimate_number: "", reason: `Linked Work Order ${woId} is in Trash — restore it before combining.` });
    }
  }
  if (linkedIds.length > 1) {
    const liveIds = [];
    for (const woId of linkedIds) {
      const wo = await WorkOrder.get(woId);
      if (wo?.id && wo.deleted !== true) liveIds.push(woId);
    }
    if (liveIds.length > 1) {
      throw new Error(`These estimates already link to different Work Orders (${liveIds.length} live jobs). Unlink or convert them separately.`);
    }
  }

  // Credit gate on the combined exposure, resolved against the shared
  // customer (all estimates must name the same customer to combine — mixed
  // customers produce separate jobs, which this action is not for).
  const customerIds = new Set(prepared.map((p) => str(p.verifiedCustomerId)).filter(Boolean));
  if (customerIds.size > 1) {
    return { status: "mixed_customers", reason: "Selected estimates resolve to different customers — combined conversion requires one shared customer.", rejected, results: [] };
  }
  const combinedTotal = prepared.reduce((s, p) => s + estimateConvertedAmount(p.estimateBefore, {}), 0);
  const primary = prepared[0];
  const credit = await checkEstimateConversionCredit({
    resolvedCustomer: primary.resolvedCustomer,
    estimate: primary.estimateBefore,
    pricing: { quoteTotal: combinedTotal },
    currentUser,
    sessionToken,
    decide: hooks.decideCredit,
  });
  if (credit.outcome !== "ok") {
    return { status: credit.outcome, reason: credit.reason, rejected, results: [] };
  }

  const estimateIds = prepared.map((p) => str(p.estimateBefore?.id)).filter(Boolean);
  const estimateNumbers = prepared.map((p) => str(p.estimateBefore?.estimate_number || p.estimateBefore?.id));
  const results = [];
  let workOrder = sharedWo;
  const primaryEstimateId = str(primary.estimateBefore?.id);
  for (const p of prepared) {
    const src = p.estimateBefore;
    try {
      const committed = await commitEstimateConversion({
        estimate: src,
        estimateBefore: src,
        existing: workOrder,
        verifiedCustomerId: p.verifiedCustomerId,
        pricing: { quoteTotal: combinedTotal },
        sessionToken,
        entities: ent,
        extraWorkOrderFields: {
          estimate_ids: estimateIds,
          // WO.estimate_id stays on the EARLIEST-created estimate for
          // single-link compatibility; every id lands in estimate_ids.
          estimate_id: primaryEstimateId,
          // Combined-job estimate_amount is the FULL combined total — each
          // commit rewrites it to the same merged value.
          estimate_amount: combinedTotal,
          tasks: mergeWorkOrderTasks(
            workOrder?.tasks || [],
            buildEstimateWorkOrderSeedTasks(src, { idPrefix: `${str(src.id).slice(0, 8)}_` }),
          ),
        },
        idempotencyPrefix: `combined_work_order_conversion:${src.id}`,
        reason: `Combined ${prepared.length} approved estimates (${estimateNumbers.join(", ")}) into one Work Order`,
      });
      workOrder = committed.workOrder;
      results.push({ estimate_id: src.id, estimate_number: src.estimate_number || "", status: "linked", work_order_id: workOrder.id });
    } catch (error) {
      results.push({ estimate_id: src.id, estimate_number: src.estimate_number || "", status: "failed", reason: error?.message || "Conversion failed." });
    }
  }
  return { status: "converted", work_order_id: workOrder?.id || "", workOrder, results, rejected };
}