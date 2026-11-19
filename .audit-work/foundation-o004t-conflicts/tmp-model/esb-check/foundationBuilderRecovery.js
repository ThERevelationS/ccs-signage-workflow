import { staffEntities } from "@/components/staff/staffEntities";
import { pendingBuilderMutation } from "@/components/estimator/builder/builderMutationRecovery";
import { assertEstimateProductMutationAllowed } from "@/components/estimator/estimateMutationGuard";
import { assertFoundationBuilderAcknowledgment, classifyFoundationSyncRetry, validateFoundationSyncAttempt } from "./foundationSyncRecovery";
import { recordBuilderSave as defaultRecordBuilderSave } from "@/components/estimator/builder/builderService";
export async function verifyFoundationRecoverySource({ sourceId, expectedSourceVersion }) {
  const saved = await staffEntities.FoundationProject.get(sourceId);
  if (saved?.id !== sourceId || !expectedSourceVersion || saved.updated_date !== expectedSourceVersion) {
    throw new Error("The Foundation project changed in another session. Reload it before recovering this Builder synchronization.");
  }
  return saved;
}
export async function loadFoundationBuilderRecovery({ sourceId, estimateId, expectedSourceVersion }) {
  if (!estimateId) return null;
  const estimate = await staffEntities.AllInOneEstimate.get(estimateId);
  if (estimate?.id !== estimateId) throw new Error("The linked estimate could not be verified before Builder recovery.");
  const line = (estimate.line_items || []).find((item) => item.module_key === "foundation" && item.project_id === sourceId);
  const pending = pendingBuilderMutation(line);
  if (!pending) return null;
  if (!line.builder_product_id || typeof pending.key !== "string" || pending.estimate_id !== estimateId || pending.builder_product_id !== line.builder_product_id || pending.estimate_line_id && (line.line_id || pending.line_patch?.line_id) && pending.estimate_line_id !== (line.line_id || pending.line_patch?.line_id)) {
    throw new Error("The pending Builder operation does not match this Foundation Product. Review it in the linked estimate.");
  }
  await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });
  const sourceProject = await verifyFoundationRecoverySource({ sourceId, expectedSourceVersion });
  const receipt = sourceProject.builder_sync_attempt;
  if (receipt != null && (!validateFoundationSyncAttempt(receipt) || receipt.source_project_id !== sourceId || receipt.estimate_id !== estimateId)) {
    throw new Error("The saved Foundation sync receipt does not match this estimate. Reload and review it before recovery.");
  }
  const operationSourceVersion = pending.line_patch?.updated_date_snapshot || line.updated_date_snapshot;
  if (!operationSourceVersion || operationSourceVersion !== sourceProject.updated_date) {
    throw new Error("This Builder operation belongs to a different Foundation source revision. Reload and review it before recovery.");
  }
  return { sourceProject, pendingKey: pending.key };
}
export async function retryFoundationBuilderSync({
  sourceId,
  estimateId,
  expectedSourceVersion,
  savedProject = null,
  builderCalculation = null,
  liveTotal = void 0,
  expectedPendingKey = void 0,
  deps = {}
} = {}) {
  const getProject = deps.getProject || ((id) => staffEntities.FoundationProject.get(id));
  const getEstimate = deps.getEstimate || ((id) => staffEntities.AllInOneEstimate.get(id));
  const recordSave = deps.recordSave || defaultRecordBuilderSave;
  const warnings = [];
  if (!sourceId || !estimateId) {
    return { status: "invalid", reason: "missing_context", error: "A source project and a linked estimate are both required to retry a Builder sync.", warnings };
  }
  if (typeof expectedSourceVersion !== "string" || !expectedSourceVersion) {
    return { status: "invalid", reason: "missing_source_version", error: "The saved source revision this sync belongs to could not be verified. Reload before retrying.", warnings };
  }
  let fresh;
  try {
    fresh = await getProject(sourceId);
  } catch (error) {
    return { status: "conflict", reason: "source_unreadable", error: `The saved project could not be re-read before retrying: ${error?.message || "read failed"}`, warnings };
  }
  if (fresh?.id !== sourceId || fresh.updated_date !== expectedSourceVersion) {
    return { status: "conflict", reason: "source_moved", error: "The Foundation project changed in another session. Reload it before retrying this Builder synchronization.", warnings };
  }
  let estimate;
  try {
    estimate = await getEstimate(estimateId);
  } catch (error) {
    return { status: "conflict", reason: "estimate_unreadable", error: `The linked estimate could not be verified before retrying: ${error?.message || "read failed"}`, warnings };
  }
  if (estimate?.id !== estimateId) {
    return { status: "conflict", reason: "estimate_unreadable", error: "The linked estimate could not be verified before retrying this Builder synchronization.", warnings };
  }
  const classification = classifyFoundationSyncRetry({ project: fresh, estimateId, estimate });
  if (!classification.retryable) {
    return classification.mode === "none_needed" ? { status: "already_synced", mode: classification.mode, line: classification.line, attempt: classification.attempt, warnings } : { status: "blocked", mode: classification.mode, reason: classification.reason, line: classification.line, attempt: classification.attempt, warnings };
  }
  if (expectedPendingKey !== void 0 && String(expectedPendingKey || "") !== String(classification.pendingKey || "")) {
    return { status: "conflict", reason: "pending_key_changed", error: "The pending Builder operation changed before the retry could run. Reload the estimate before continuing.", line: classification.line, attempt: classification.attempt, warnings };
  }
  const base = savedProject?.id === sourceId ? savedProject : fresh;
  const syncSource = builderCalculation && typeof builderCalculation === "object" && !Array.isArray(builderCalculation) ? { ...base, builder_calculation: builderCalculation } : base;
  if (classification.mode === "resync_unacknowledged" && !builderCalculation) {
    warnings.push("descriptor_basis:record");
  }
  let result;
  try {
    result = await recordSave({
      estimateId,
      line: { project_id: sourceId, module_key: "foundation" },
      sourceProject: syncSource,
      ...liveTotal !== void 0 ? { liveTotal } : {},
      ...expectedPendingKey !== void 0 ? { expectedPendingKey } : {}
    });
  } catch (error) {
    return { status: "failed", mode: classification.mode, error: error?.message || String(error || "Builder sync retry failed."), line: classification.line, attempt: classification.attempt, warnings };
  }
  const ackLine = result?.line || result;
  try {
    assertFoundationBuilderAcknowledgment({ sourceProject: fresh, estimateId, line: ackLine });
  } catch (error) {
    return { status: "pending", mode: classification.mode, error: error?.message || String(error || "Builder sync acknowledgment could not be verified."), line: ackLine, attempt: classification.attempt, warnings };
  }
  return { status: "synced", mode: classification.mode, line: ackLine, sourceVersion: fresh.updated_date, attempt: classification.attempt, warnings };
}
