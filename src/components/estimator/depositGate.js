// Deposit gating for production work.
//
// A WorkOrder can require a deposit before production (deposit_required +
// deposit_amount); staff flip deposit_invoiced on the Job Workspace once the
// deposit is billed. This module is the shared vocabulary for that flag set:
// which product operational_statuses count as "production", when a status
// move needs a warning, and when the job's financials already cover the
// deposit. Pure and import-light on purpose so it stays unit-testable under
// Node (scripts/test-financial-trio.mjs).

import { PRODUCT_TO_STAGE } from "./productStageSync";
import { recordLinksWorkOrder } from "../jobs/jobWorkspaceModel";

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const norm = (v) => String(v || "").trim().toLowerCase();
const money = (v) => Math.round(num(v, 0) * 100) / 100;
const usd = (n) => `$${money(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// WO board stages that mean "the shop is producing" — production and the
// fabrication floor it feeds. Statuses mapping to either are deposit-gated
// (PRODUCT_TO_STAGE: proof_approved, in_production, quality_control).
const GATED_STAGES = new Set(["production", "fabrication"]);

// Product operational_statuses a deposit-blocked job warns on before entering.
export const DEPOSIT_GATED_STATUSES = new Set(
  Object.entries(PRODUCT_TO_STAGE)
    .filter(([, stage]) => GATED_STAGES.has(stage))
    .map(([status]) => status)
);

// The job wants deposit money and nobody has marked it invoiced yet.
export function depositRequiredUninvoiced(workOrder) {
  return workOrder?.deposit_required === true && workOrder?.deposit_invoiced !== true;
}

// Warn — never hard-block. A product moving INTO a gated production status on
// a deposit-blocked job needs the confirm; re-picking the status it already
// holds (a no-op save) must not nag.
export function depositGateApplies(workOrder, product, nextOperationalStatus) {
  const target = norm(nextOperationalStatus);
  if (!target || !DEPOSIT_GATED_STATUSES.has(target)) return false;
  if (norm(product?.operational_status) === target) return false;
  return depositRequiredUninvoiced(workOrder);
}

// The confirm text. Includes the amount when one is set so the warning is
// about money, not a vague blocker.
export function depositGateMessage(workOrder) {
  const amount = num(workOrder?.deposit_amount);
  const head = amount > 0
    ? `Deposit required ${usd(amount)} — not invoiced.`
    : "Deposit required — not invoiced.";
  return `${head} Move this product into production anyway?`;
}

// Auto-suggest for the Job Workspace financials card. The deposit counts as
// covered once any linked non-draft, non-void invoice is at least the deposit
// amount, or any live payment is already recorded on the job (same link rules
// as the financial summary — work_order_id / estimate_id / invoice_id).
export function depositCoveredByFinancials(workOrder, { invoices = [], payments = [] } = {}) {
  const wo = workOrder || {};
  if (wo.deposit_required !== true || wo.deposit_invoiced === true) {
    return { covered: false, reason: "" };
  }
  const required = num(wo.deposit_amount);
  const linked = (Array.isArray(invoices) ? invoices : [])
    .filter((inv) => recordLinksWorkOrder(inv, wo) && !["void", "draft"].includes(norm(inv?.status)));
  const covering = linked.find((inv) => required <= 0 || num(inv?.total) >= required);
  if (covering) {
    const label = covering.invoice_number || "An invoice";
    return {
      covered: true,
      reason: `${label}${required > 0 ? ` (${usd(covering.total)}) covers the ${usd(required)} deposit` : " covers the deposit"}.`,
    };
  }
  const invoiceIds = new Set(linked.map((inv) => String(inv?.id || "").trim()).filter(Boolean));
  const pay = (Array.isArray(payments) ? payments : []).find((p) => {
    if (!p || p.deleted === true || ["void", "refunded"].includes(norm(p?.status))) return false;
    return recordLinksWorkOrder(p, wo) || invoiceIds.has(String(p?.invoice_id || "").trim());
  });
  if (pay) {
    return { covered: true, reason: `A payment of ${usd(pay.amount)} is already recorded on this job.` };
  }
  return { covered: false, reason: "" };
}

// Header chip descriptor: what the Job Workspace shows next to the stage
// badge. Returns null when the job has no deposit requirement at all.
export function depositChip(workOrder) {
  const wo = workOrder || {};
  if (wo.deposit_required !== true) return null;
  const amount = num(wo.deposit_amount);
  if (wo.deposit_invoiced === true) {
    return { tone: "invoiced", text: amount > 0 ? `Deposit invoiced ${usd(amount)}` : "Deposit invoiced" };
  }
  return { tone: "required", text: amount > 0 ? `Deposit required ${usd(amount)} — not invoiced` : "Deposit required — not invoiced" };
}
