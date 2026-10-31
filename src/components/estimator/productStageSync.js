// Product → Work Order stage sync model.
//
// Two status worlds exist side by side on a Work Order: the legacy stage
// board (current_stage, ordered by WO_STAGE_ORDER) and the per-product
// operational_status inside products[]. This module is the bridge between
// them: it rolls the set of product statuses up into the single WO stage
// they imply so UI surfaces can suggest — or, in "auto" mode, apply — a
// forward stage move through transitionWorkOrderFromLoadedSnapshot.
//
// Pure and import-free on purpose: JobWorkspace, ProductQueue and the stage
// boards resolve the GlobalSettings mode themselves and pass plain values in,
// so everything here is deterministic and unit-testable under Node
// (scripts/test-product-stage-sync.mjs).

// Keep in sync with WO_STAGE_ORDER in components/workflow/workOrderPersistence.js.
export const WO_STAGE_ORDER = ["estimating", "sales", "permitting", "design", "production", "fabrication", "installation", "completed"];

export const STAGE_LABELS = {
  estimating: "Estimating", sales: "Sales", permitting: "Permitting",
  design: "Design", production: "Production", fabrication: "Fabrication",
  installation: "Installation", completed: "Completed",
};

// GlobalSettings row: { setting_key: "productStatusDrivesStage",
//   setting_value: "off" | "suggest" | "auto" } — an object { mode: "..." } is
//   also accepted. A missing or unparseable record resolves to the default so
//   the feature ships on-but-manual until an admin opts into "auto" or "off".
export const PRODUCT_STAGE_MODE_SETTING_KEY = "productStatusDrivesStage";
export const PRODUCT_STAGE_MODES = ["off", "suggest", "auto"];
export const DEFAULT_PRODUCT_STAGE_MODE = "suggest";

// The WO stage each product operational_status implies. The rollup follows
// the LEAST-advanced open product — a job's board position is where its
// remaining work is — so a low mapping is always the conservative choice:
//  - order_review / awaiting_customer_action can be true at any point; they
//    map to "sales" and never drag a suggestion forward.
//  - proof_approved means design is finished and the product is released to
//    production.
//  - vended products are produced; terminal fulfillment states
//    (picked_up/installed/shipped/delivered) end the ops journey. Both count
//    as "installation"-phase but are excluded from the open-product vote.
//  - "none" and unknown statuses carry no signal and are ignored entirely.
export const PRODUCT_TO_STAGE = {
  order_review: "sales",
  awaiting_customer_action: "sales",
  site_survey: "design",
  permitting: "permitting",
  awaiting_proof_approval: "design",
  design_review: "design",
  in_design: "design",
  proof_approved: "production",
  in_production: "production",
  quality_control: "fabrication",
  vended: "installation",
  install_or_removal_only: "installation",
  service_repair: "installation",
};

export const TERMINAL_FULFILLMENT_STATES = ["picked_up", "installed", "shipped", "delivered"];
export const TERMINAL_OPERATIONAL_STATUSES = ["vended"];

// Compact status names for one-line chips ("2 in prod · 1 designed · 3 done").
const STATUS_SHORT = {
  order_review: "in review", site_survey: "survey",
  awaiting_customer_action: "awaiting customer", awaiting_proof_approval: "awaiting proof",
  permitting: "permitting", proof_approved: "approved",
  design_review: "design review", in_design: "in design",
  in_production: "in prod", quality_control: "QC",
  install_or_removal_only: "install only", service_repair: "service",
  vended: "vended", none: "unstaged",
};

const norm = (v) => String(v || "").trim().toLowerCase();
const stageRank = (stage) => WO_STAGE_ORDER.indexOf(norm(stage));
const productList = (products) =>
  (Array.isArray(products) ? products : []).filter((p) => p && typeof p === "object");
const statusShortLabel = (status) => STATUS_SHORT[status] || String(status || "").replace(/_/g, " ");

export function isProductFulfilled(product) {
  return TERMINAL_FULFILLMENT_STATES.includes(norm(product?.fulfillment_state));
}

// A product is terminal once its ops journey is over: produced (vended) or
// fully fulfilled. Everything else — including "none"/unstaged — is open.
export function isProductTerminal(product) {
  return isProductFulfilled(product) || TERMINAL_OPERATIONAL_STATUSES.includes(norm(product?.operational_status));
}

// Resolve the GlobalSettings record (or a bare value) into a mode. Unknown
// values fall back to the default rather than disabling the feature.
export function productStageModeFromSetting(record) {
  let raw = record;
  if (raw && typeof raw === "object") raw = raw.setting_value !== undefined ? raw.setting_value : raw.mode;
  if (raw && typeof raw === "object") raw = raw.mode ?? raw.value;
  const v = norm(raw);
  return PRODUCT_STAGE_MODES.includes(v) ? v : DEFAULT_PRODUCT_STAGE_MODE;
}

// Counts by product operational status for badges/chips. Terminal products
// roll up under `fulfilled` instead of a status bucket.
export function productStatusRollup(products) {
  const list = productList(products);
  const counts = {};
  const openProducts = [];
  let fulfilled = 0;
  for (const p of list) {
    if (isProductTerminal(p)) { fulfilled += 1; continue; }
    const s = norm(p.operational_status) || "none";
    counts[s] = (counts[s] || 0) + 1;
    openProducts.push(p);
  }
  return { total: list.length, open: openProducts.length, fulfilled, counts, openProducts };
}

// One-line chip text: open buckets ordered by their implied stage, then a
// trailing "N done" for terminal products. Empty string when no products.
export function productStatusRollupLabel(rollup) {
  if (!rollup || !rollup.total) return "";
  const parts = Object.entries(rollup.counts || {})
    .map(([status, count]) => ({
      status,
      count,
      rank: stageRank(PRODUCT_TO_STAGE[status] || "estimating"),
    }))
    .sort((a, b) => (a.rank - b.rank) || a.status.localeCompare(b.status))
    .map(({ status, count }) => `${count} ${statusShortLabel(status)}`);
  if (rollup.fulfilled) parts.push(`${rollup.fulfilled} done`);
  return parts.join(" · ");
}

// Suggest the WO stage implied by the product statuses.
//
// Weakest-link rollup: the board stage follows the least-advanced OPEN
// product, so a job never reports being past a stage it still has work in
// (a delivered product beside one still in design still suggests design).
// Terminal products do not hold the job back; when every contributing
// product is terminal the suggestion is "installation", or "completed" once
// all of them reached a terminal fulfillment state.
//
// Returns { suggested, reason } or null. Never suggests a stage at or before
// currentStage (no regressions, no no-ops), and never suggests when the
// current stage is a non-empty value outside WO_STAGE_ORDER — a stage the
// model cannot rank cannot be proven to be a forward move.
export function suggestStageForProducts(products, currentStage) {
  const list = productList(products);
  if (!list.length) return null;

  const current = norm(currentStage);
  if (current && stageRank(current) < 0) return null;
  const currentRank = current ? stageRank(current) : -1;

  const contributions = [];
  for (const p of list) {
    if (isProductTerminal(p)) {
      contributions.push({ terminal: true, fulfilled: isProductFulfilled(p) });
      continue;
    }
    const status = norm(p.operational_status) || "none";
    const stage = PRODUCT_TO_STAGE[status];
    if (!stage) continue; // no signal — ignored entirely
    contributions.push({ terminal: false, stage, status });
  }
  if (!contributions.length) return null;

  let suggested;
  let reason;
  if (contributions.every((c) => c.terminal)) {
    if (contributions.every((c) => c.fulfilled)) {
      suggested = "completed";
      reason = "all products fulfilled";
    } else {
      suggested = "installation";
      reason = "all products produced";
    }
  } else {
    const open = contributions.filter((c) => !c.terminal);
    const minRank = Math.min(...open.map((c) => stageRank(c.stage)));
    suggested = WO_STAGE_ORDER[minRank];
    const binding = [...new Set(
      open.filter((c) => stageRank(c.stage) === minRank).map((c) => c.status)
    )].map(statusShortLabel).join(", ");
    reason = `${open.length} open product${open.length === 1 ? "" : "s"} at ${binding}`;
  }
  if (stageRank(suggested) <= currentRank) return null;
  return { suggested, reason };
}

// Products still in a non-terminal operational state, shaped for the
// completion-confirm warning so a job with open product work is never closed
// silently. Warn-only: callers list these, they do not block.
export function openProductsBlockingCompletion(products) {
  return productList(products)
    .filter((p) => !isProductTerminal(p))
    .map((p, idx) => ({
      id: String(p.id || ""),
      name: String(p.description || p.client_product_name || "").trim() || `Product ${idx + 1}`,
      status: norm(p.operational_status) || "none",
    }));
}
