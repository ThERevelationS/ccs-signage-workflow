// Product-driven Work Order stage derivation (B-13).
//
// The WO board stage follows its products' operational statuses worst-first:
// the LEAST-advanced contributing product wins, so a job never reports being
// past a stage it still has product work in. Status → stage mapping comes
// from the canonical locked vocabulary in base44/shared/productStatusModel.ts
// (OPERATIONAL_STATUS_SET order + STATUS_STAGE_MAP hints) — not the retired
// legacy maps (in_design / vended / none / install_or_removal_only).
//
// Pure and IO-free: esbuild-bundled + unit-tested under Node by
// scripts/test-product-audit-stage.mjs.

import {
  OPERATIONAL_STATUS_SET,
  WORK_ORDER_STAGE_SET,
  STATUS_STAGE_MAP,
  stageHintForStatus,
  isOperationalStatus,
} from "../../../base44/shared/productStatusModel.ts";

// The canonical stage order — same eight values WorkOrder.current_stage
// declares; index = rank (least→most advanced).
export const WO_STAGE_ORDER = [...WORK_ORDER_STAGE_SET];

// Fulfillment takes over once a product is `built`: a product that reached a
// terminal fulfillment state no longer has open ops work and contributes
// "completed" to the rollup (mirrors the legacy model's vended+fulfilled rule).
export const TERMINAL_FULFILLMENT_STATES = ["picked_up", "installed", "shipped", "delivered"];

// Manual-override marker. WorkOrder.jsonc does not declare this field yet —
// when a human drags a job to a stage the writers stamp
// `manual_stage_override: true` (and emit a ProductActivity `override` row);
// derivation callers skip the WO until the flag is cleared. The helper also
// honors the alternate spellings other pipelines may land on.
export const MANUAL_STAGE_OVERRIDE_FIELD = "manual_stage_override";
export const MANUAL_STAGE_OVERRIDE_FIELDS = [
  "manual_stage_override",
  "stage_override",
  "stage_locked",
];

const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const productList = (products) =>
  (Array.isArray(products) ? products : []).filter((p) => p && typeof p === "object");
const stageRank = (stage) => WO_STAGE_ORDER.indexOf(norm(stage));

// True when a human owns the WO stage: any known override flag set, or a
// stage-source stamp saying the last move was manual.
export function hasManualStageOverride(workOrder) {
  if (!workOrder || typeof workOrder !== "object") return false;
  for (const field of MANUAL_STAGE_OVERRIDE_FIELDS) {
    if (workOrder[field] === true) return true;
  }
  return norm(workOrder.stage_source) === "manual" || norm(workOrder.current_stage_source) === "manual";
}

// Stage a single product contributes to the rollup.
//  - terminal fulfillment (picked_up/installed/shipped/delivered) → completed
//  - else the canonical STATUS_STAGE_MAP hint for operational_status
//  - "" = no signal: unknown/retired statuses are ignored entirely (they can
//    neither drag the stage back nor push it forward)
export function productStageContribution(product) {
  if (!product || typeof product !== "object") return "";
  if (TERMINAL_FULFILLMENT_STATES.includes(norm(product.fulfillment_state))) {
    return "completed";
  }
  return stageHintForStatus(product.operational_status) || "";
}

// Worst-first rollup: the WO stage is the LEAST-advanced stage hint across
// contributing products. Terminal statuses map high (built→installation,
// completed/voided→completed) so they never hold a job back; the straggler
// still in design_review pins the board at "design".
//
// Returns the stage string, or null when no product carries status signal
// (empty list, or every product unknown/blank) — callers treat null as
// "keep whatever stage logic they had", never as a regression to a default.
export function deriveWorkOrderStage(products) {
  const list = productList(products);
  if (!list.length) return null;
  let best = null;
  for (const p of list) {
    const stage = productStageContribution(p);
    if (!stage) continue;
    if (best === null || stageRank(stage) < stageRank(best)) best = stage;
  }
  return best;
}

// Richer result for callers that write audit notes / tooltips:
//   { stage, reason, total, contributing, open, bindingStatuses }
// `stage`/`reason` are null/"" under the same no-signal rule as
// deriveWorkOrderStage; `contributing` counts products that voted.
export function describeWorkOrderStageDerivation(products) {
  const list = productList(products);
  const contributions = [];
  for (const p of list) {
    const stage = productStageContribution(p);
    if (!stage) continue;
    contributions.push({
      stage,
      status: isOperationalStatus(p.operational_status) ? norm(p.operational_status) : "",
      fulfilled: TERMINAL_FULFILLMENT_STATES.includes(norm(p.fulfillment_state)),
    });
  }
  const stage = deriveWorkOrderStage(list);
  const result = {
    stage,
    reason: "",
    total: list.length,
    contributing: contributions.length,
    open: contributions.filter((c) => stageRank(c.stage) < stageRank("completed")).length,
    bindingStatuses: [],
  };
  if (!stage) return result;
  const minRank = stageRank(stage);
  result.bindingStatuses = [...new Set(
    contributions
      .filter((c) => stageRank(c.stage) === minRank)
      .map((c) => c.status || "fulfilled")
      .filter(Boolean),
  )];
  result.reason = contributions.every((c) => stageRank(c.stage) === stageRank("completed"))
    ? "all products done"
    : `${result.open || contributions.length} product${(result.open || contributions.length) === 1 ? "" : "s"} at ${result.bindingStatuses.join(", ") || stage}`;
  return result;
}

// Re-export the canonical pieces the callers need so this module is the one
// import for product→stage work in the jobs surface.
export { OPERATIONAL_STATUS_SET, WORK_ORDER_STAGE_SET, STATUS_STAGE_MAP, stageHintForStatus };
