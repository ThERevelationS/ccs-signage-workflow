import { ensureIdempotentEntityCreate, newCreationRequestKey } from "@/components/estimator/idempotentEntityCreate";
import { getSessionToken } from "@/components/auth/EmailGate";
import { invokePortal } from "@/components/portal/PortalPanel";

// Fields that must never be cloned into a new project row — identity and
// server-managed values. The copy keeps every editable payload field while a
// fresh identity and a fresh creation_request_key make it a real new record.
const STRIP_ON_COPY = new Set([
  "id",
  "created_date",
  "updated_date",
  "created_by",
  "created_by_id",
  "is_sample",
  "creation_request_key",
  "idempotency_key",
  // P-11: proposal lifecycle state — a copy is a NEW draft, never a second
  // acceptance. Deleted keys fall back to entity defaults; modules lacking
  // these fields are unaffected (delete on an absent key is a no-op).
  "proposal_accepted",
  "proposal_accepted_by",
  "proposal_accepted_at",
  "pricing_basis_snapshot",
  "prior_acceptance",
  "proposal_reopened_reason",
  "proposal_revision_n",
  "proposal_revisions",
  "proposal_locked_fields",
]);

// Clone a module's save payload into a brand-new project record (#78). The
// caller passes its normal persisted payload; we strip identity/system fields,
// force "(Copy)" onto the name, and create through the same
// signature-stable retry-key + ensureIdempotentEntityCreate flow Foundation
// uses so a double-click or lost response can never produce duplicate copies.
export async function saveModuleProjectCopy({
  entity,
  payload,
  attemptRef,
  keyPrefix,
  nameField = "project_name",
  baseName,
  extraData = {},
  label = "Project copy",
}) {
  const copyData = { ...payload };
  for (const key of STRIP_ON_COPY) delete copyData[key];
  copyData[nameField] = `${baseName || copyData[nameField] || "Estimate"} (Copy)`;
  Object.assign(copyData, extraData);

  const signature = JSON.stringify(copyData);
  if (attemptRef.current.signature !== signature) {
    attemptRef.current = {
      signature,
      key: newCreationRequestKey(keyPrefix),
    };
  }

  const copy = await ensureIdempotentEntityCreate({
    entity,
    keyField: "creation_request_key",
    key: attemptRef.current.key,
    data: copyData,
    label,
  });
  if (!copy?.id) throw new Error(`${label} could not be verified.`);
  return copy;
}

// Create (or reuse) a read-only staff_view portal link for an estimate and
// return its absolute URL (#88). The link is view-only end-to-end: the portal
// bootstrap closes every non-'customer' mutation on that kind server-side.
export async function createEstimateReadOnlyShareLink({ estimateId, label } = {}) {
  const id = String(estimateId || "").trim();
  if (!id) throw new Error("An estimate id is required to share a read-only link.");
  const sessionToken = getSessionToken();
  if (!sessionToken) throw new Error("Sign-in required.");
  const data = await invokePortal(sessionToken, {
    action: "create_link",
    kind: "staff_view",
    estimate_id: id,
    label,
    creation_request_key: crypto.randomUUID(),
  });
  const token = data?.token || data?.link?.token;
  if (!token) throw new Error("The share link could not be verified.");
  return `${window.location.origin}/customerportal?token=${encodeURIComponent(token)}`;
}