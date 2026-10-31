import { OpportunityActivity } from "@/api/gatedEntities";
import { ensureIdempotentEntityCreate, newCreationRequestKey } from "@/components/estimator/idempotentEntityCreate";
import { markEventCompletePatch, newCrmEventFields } from "@/components/crm/crmEventsModel";
import { NotificationTriggers } from "@/components/workflow/NotificationService";

// Persistence for typed CRM event rows on OpportunityActivity. Reads route
// through the staffDataRead gateway; writes go through staffEntityWrite —
// create for new queue events, and the single-record conditional
// updateMany({id, updated_date}, {$set}) contract for close-outs so two
// sessions can never both mark the same event complete.

export async function createCrmEvent(fields = {}, { key } = {}) {
  const data = newCrmEventFields(fields);
  return ensureIdempotentEntityCreate({
    entity: OpportunityActivity,
    keyField: "creation_request_key",
    key: key || newCreationRequestKey("crm_event"),
    data,
    label: "CRM event",
  });
}

/**
 * Close one event with an outcome. Anchored on the row's loaded updated_date:
 * if another session completed it first (updated === 0), the record is
 * re-read — an already-closed row is a no-op success, anything else is a
 * conflict the caller must surface.
 */
export async function completeCrmEvent({ activity, outcome = "completed", now } = {}) {
  const id = String(activity?.id || "").trim();
  const version = String(activity?.updated_date || "").trim();
  if (!id || !version) {
    throw new Error("CRM event is missing its current version. Reload before completing.");
  }
  const patch = markEventCompletePatch(outcome, now || new Date());
  const result = await OpportunityActivity.updateMany(
    { id, updated_date: version },
    { $set: patch },
  );
  if (result && typeof result.updated === "number") {
    if (result.updated === 1) {
      const saved = await OpportunityActivity.get(id).catch(() => null);
      const completed = saved || { ...activity, ...patch };
      // Unified alerts: crm_event_completed rides the automation/notify
      // pipeline — fire-and-forget, it never blocks the close.
      try {
        void NotificationTriggers.crmEventCompleted(completed, { outcome: patch.outcome });
      } catch { /* notify is best-effort */ }
      return completed;
    }
    if (result.updated === 0) {
      const current = await OpportunityActivity.get(id).catch(() => null);
      if (current?.completed_at) return current;
      throw new Error("This CRM event changed in another session. Reload before completing.");
    }
    throw new Error("CRM event completion matched more than one record. Reload and review.");
  }
  throw new Error("CRM event completion result could not be verified.");
}
