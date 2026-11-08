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
  const line = (estimate.line_items || []).find(item => item.module_key === "foundation" && item.project_id === sourceId);
  const pending = pendingBuilderMutation(line);
  if (!pending) return null;
  if (
    !line.builder_product_id || typeof pending.key !== "string" ||
    pending.estimate_id !== estimateId || pending.builder_product_id !== line.builder_product_id ||
    (pending.estimate_line_id && (line.line_id || pending.line_patch?.line_id) &&
      pending.estimate_line_id !== (line.line_id || pending.line_patch?.line_id))
  ) {
    throw new Error("The pending Builder operation does not match this Foundation Product. Review it in the linked estimate.");
  }
  await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });
  const sourceProject = await verifyFoundationRecoverySource({ sourceId, expectedSourceVersion });
  const receipt = sourceProject.builder_sync_attempt;
  if (receipt != null && (
    !validateFoundationSyncAttempt(receipt) || receipt.source_project_id !== sourceId || receipt.estimate_id !== estimateId
  )) {
    throw new Error("The saved Foundation sync receipt does not match this estimate. Reload and review it before recovery.");
  }
  const operationSourceVersion = pending.line_patch?.updated_date_snapshot || line.updated_date_snapshot;
  if (!operationSourceVersion || operationSourceVersion !== sourceProject.updated_date) {
    throw new Error("This Builder operation belongs to a different Foundation source revision. Reload and review it before recovery.");
  }
  return { sourceProject, pendingKey: pending.key };
}

// ---------------------------------------------------------------------------
// Partial Builder-sync retry (CMP-A04 tail).
//
// Replays ONLY the un-synced estimate-side portion of a save whose source
// write already landed — never the source CAS write itself. Inputs anchor the
// replay to the exact saved revision the failed attempt targeted:
//   * expectedSourceVersion — the acknowledged saved updated_date. Verified
//     against a fresh point read before anything else; a moved record returns
//     'conflict' and nothing is written.
//   * savedProject — the acknowledged saved snapshot (the record as saved).
//     Optional: when absent the fresh point read is used.
//   * builderCalculation — the transient calc capture ({ totals, delivery,
//     cabinet_cost, landscape_cost, section_total }) when the caller still
//     holds it (same-session retry). With it the part descriptors are
//     byte-identical to the original attempt's; without it the persisted
//     record's aggregate fallbacks drive extraction — coarser part keys that
//     converge safely (partSync deactivates or pending-removes stale keys; it
//     never duplicates by part_key).
//   * expectedPendingKey — pins resumption to the pending marker key seen when
//     the caller classified the retry; a different live marker = conflict.
//
// Idempotency (no duplicate parts): the replay goes through recordBuilderSave,
// whose chain is end-to-end convergent — BuilderProduct resolve-or-create by
// identity (findBuilderProduct / createBuilderProductWithRecovery), Builder
// Parts keyed by deterministic part_key (byKey update-in-place CAS or
// createBuilderPartWithRecovery's (product,key)-unique verify), stale keys
// deactivated or pending-removal flagged, and a durable
// price_acceptance_pending marker whose stored plan is resumed verbatim
// (every step verify-before-write; missing delete targets = already-applied).
//
// Outcome statuses:
//   synced          — replay returned and the acknowledgment gate passed
//   already_synced  — classifier found nothing to retry (no writes)
//   pending         — the replay ran but the line is still not acknowledged
//                     for this revision (a further retry or review is needed)
//   blocked         — classifier refused (mismatch/unsupported/no-estimate)
//   conflict        — the saved revision moved, the pending marker changed, or
//                     the estimate could not be verified — nothing written
//   invalid         — required anchors missing — nothing written
//   failed          — the replay threw; the error is surfaced, marker retained
// ---------------------------------------------------------------------------

export async function retryFoundationBuilderSync({
  sourceId,
  estimateId,
  expectedSourceVersion,
  savedProject = null,
  builderCalculation = null,
  liveTotal = undefined,
  expectedPendingKey = undefined,
  deps = {},
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

  // Anchor first: the record must still be at the revision the failed attempt
  // targeted. A moved record means a newer save owns the sync — retrying would
  // acknowledge a stale revision, so this reports 'conflict' and writes nothing.
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
    return classification.mode === "none_needed"
      ? { status: "already_synced", mode: classification.mode, line: classification.line, attempt: classification.attempt, warnings }
      : { status: "blocked", mode: classification.mode, reason: classification.reason, line: classification.line, attempt: classification.attempt, warnings };
  }
  if (
    expectedPendingKey !== undefined &&
    String(expectedPendingKey || "") !== String(classification.pendingKey || "")
  ) {
    return { status: "conflict", reason: "pending_key_changed", error: "The pending Builder operation changed before the retry could run. Reload the estimate before continuing.", line: classification.line, attempt: classification.attempt, warnings };
  }

  // The sync source is the SAVED revision — never the live editor state. The
  // persisted record already carries calc-priced items/walls/poles/caps and the
  // split totals; the optional builder_calculation overlay restores the
  // transient delivery/cabinet/landscape detail the original attempt used.
  const base = savedProject?.id === sourceId ? savedProject : fresh;
  const syncSource = builderCalculation && typeof builderCalculation === "object" && !Array.isArray(builderCalculation)
    ? { ...base, builder_calculation: builderCalculation }
    : base;
  if (classification.mode === "resync_unacknowledged" && !builderCalculation) {
    warnings.push("descriptor_basis:record");
  }

  let result;
  try {
    result = await recordSave({
      estimateId,
      line: { project_id: sourceId, module_key: "foundation" },
      sourceProject: syncSource,
      ...(liveTotal !== undefined ? { liveTotal } : {}),
      ...(expectedPendingKey !== undefined ? { expectedPendingKey } : {}),
    });
  } catch (error) {
    return { status: "failed", mode: classification.mode, error: error?.message || String(error || "Builder sync retry failed."), line: classification.line, attempt: classification.attempt, warnings };
  }

  const ackLine = result?.line || result;
  try {
    assertFoundationBuilderAcknowledgment({ sourceProject: fresh, estimateId, line: ackLine });
  } catch (error) {
    // The replay landed (or partially landed) but the acknowledgment gate did
    // not pass — the un-synced portion may still remain. Report 'pending' so
    // the caller keeps the retry surface instead of claiming completion.
    return { status: "pending", mode: classification.mode, error: error?.message || String(error || "Builder sync acknowledgment could not be verified."), line: ackLine, attempt: classification.attempt, warnings };
  }
  return { status: "synced", mode: classification.mode, line: ackLine, sourceVersion: fresh.updated_date, attempt: classification.attempt, warnings };
}