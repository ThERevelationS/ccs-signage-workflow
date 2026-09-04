import { isEstimateProtected } from "@/components/estimator/estimateLifecycle";
import { getOpenEstimateRevision } from "@/components/estimator/estimateRevisionService";

/**
 * Server-backed gate for Product/Part mutations that can be triggered from
 * long-lived dialogs. The UI's readOnly state is not sufficient because the
 * estimate may have changed lifecycle state in another browser session.
 *
 * draft/calculated: editable normally
 * sent/approved/archived: editable only while an EstimateRevision is open
 * cancelled: permanently locked
 */
export function getPendingEstimatePriceAcceptance(estimate) {
  const line = (estimate?.line_items || []).find((item) => String(item?.price_acceptance_pending?.key || "").trim());
  return line ? { line, pending: line.price_acceptance_pending } : null;
}

export async function assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt = "", allowPriceAcceptanceKey = "" } = {}) {
  if (!estimate?.id) throw new Error("Estimate could not be verified for this change.");
  const expected = String(expectedUpdatedAt || "").trim();
  const current = String(estimate.updated_date || "").trim();
  if (expected && current !== expected) {
    throw new Error("This estimate changed in another session. Reload it before changing Products or Parts.");
  }
  const allowedKey = String(allowPriceAcceptanceKey || "").trim();
  const pendingEntry = getPendingEstimatePriceAcceptance(estimate);
  const pendingKey = String(pendingEntry?.pending?.key || "").trim();
  if (pendingKey && pendingKey !== allowedKey) {
    throw new Error("A Product Update Price action is still being recovered. Resume that price update before changing Products or Parts.");
  }
  const status = String(estimate.status || "draft");
  if (status === "cancelled") {
    throw new Error("This estimate is cancelled and permanently locked. Product or Part changes cannot be added.");
  }
  if (!isEstimateProtected(status)) return null;

  const revision = await getOpenEstimateRevision(estimate.id);
  if (!revision) {
    throw new Error(`This estimate is ${status} and protected. Start an Estimate Revision before adding Products or Parts.`);
  }
  return revision;
}
