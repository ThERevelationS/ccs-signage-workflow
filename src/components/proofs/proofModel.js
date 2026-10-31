// Pure per-product proof-workflow model. React-free so it is unit-testable
// under Node. Mirrors COREBRIDGE_MAP §6: proofs are versioned, an approval is
// tied to the exact proof version it was given for, and a newer version
// invalidates stale approvals.
import { recalculateProductDueDateOnProofApproval } from "../estimator/workOrderConversion";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const norm = (value) => String(value || "").trim().toLowerCase();

// Legal proof_status successors. The value `draft` is reachable from every
// state through `supersede` (a new file version always returns the proof to
// draft), and `awaiting_approval` from `revision_requested`/`none`/`draft` via
// `send_proof`.
export const PROOF_TRANSITIONS = {
  none: ["draft", "awaiting_approval"],
  draft: ["sent", "awaiting_approval"],
  sent: ["awaiting_approval", "approved", "revision_requested", "draft"],
  awaiting_approval: ["approved", "revision_requested", "draft"],
  approved: ["draft", "revision_requested"],
  revision_requested: ["draft", "sent", "awaiting_approval"],
};

export const PROOF_ACTIONS = ["send_proof", "approve", "request_revision", "supersede"];

// status_history fields that belong to the proof audit trail.
export const PROOF_HISTORY_FIELDS = [
  "proof_status", "proof_file_url", "proof_file_name", "proof_version", "proof_approved_version",
];

export const proofVersionOf = (product) => num(product?.proof_version, 0);
export const approvedVersionOf = (product) => num(product?.proof_approved_version, 0);

const hasProofFile = (product) =>
  Boolean(String(product?.proof_file_url || "").trim()) || proofVersionOf(product) > 0;

const canReach = (status, target) => (PROOF_TRANSITIONS[status] || []).includes(target);

// A proof can only be requested/sent for approval when a file exists and the
// current status has an awaiting_approval transition.
export function canRequestApproval(product) {
  const status = norm(product?.proof_status) || "none";
  return canReach(status, "awaiting_approval") && hasProofFile(product);
}

export function canApproveProof(product) {
  const status = norm(product?.proof_status) || "none";
  return canReach(status, "approved") && hasProofFile(product);
}

export function canRequestRevision(product) {
  const status = norm(product?.proof_status) || "none";
  return canReach(status, "revision_requested");
}

// The approval applies to an exact file version. Stale = a file exists and its
// version differs from the approved version while an approval was (or claims
// to be) in force — i.e. a newer version needs a fresh approval.
export function isProofStale(product, fileVersion) {
  const current = fileVersion !== undefined ? num(fileVersion, 0) : proofVersionOf(product);
  const approved = approvedVersionOf(product);
  if (!current || current === approved) return false;
  return approved > 0 || norm(product?.proof_status) === "approved";
}

// Compact badge descriptor used by ProofPanel and queue rows.
export function proofBadge(product) {
  const status = norm(product?.proof_status) || "none";
  const version = proofVersionOf(product);
  if (isProofStale(product)) {
    return { key: "stale", label: `Stale — v${version} needs approval`, tone: "blocked" };
  }
  if (status === "approved") {
    const approved = approvedVersionOf(product) || version;
    return { key: "approved", label: approved ? `Approved v${approved}` : "Approved", tone: "done" };
  }
  if (status === "awaiting_approval" || status === "sent") {
    return { key: "awaiting", label: `Awaiting v${version || 1}`, tone: "wip" };
  }
  if (status === "revision_requested") {
    return { key: "revision", label: "Revision requested", tone: "blocked" };
  }
  if (status === "draft") {
    return { key: "draft", label: `Draft v${version || 1}`, tone: "muted" };
  }
  return { key: "none", label: "No proof", tone: "muted" };
}

// Proof-related entries from the product's status_history audit trail,
// oldest-first, in the same shape applyProductOperationalPatch writes.
export function proofHistory(product) {
  const history = Array.isArray(product?.status_history) ? product.status_history : [];
  return history
    .filter((entry) => entry && PROOF_HISTORY_FIELDS.includes(entry.field))
    .map((entry) => ({
      at: String(entry.at || ""),
      field: String(entry.field || ""),
      from: entry.from ?? "",
      to: entry.to ?? "",
      by: String(entry.by || ""),
    }));
}

// Build the operational patch for a proof action. The returned object uses the
// camelCase input keys of buildProductOperationalPatch so it can be passed
// straight to transitionProductAndBuilderStatus({ patch }).
export function nextProofPatch(product, action, { fileVersion, fileUrl, fileName, leadTimeDays, now } = {}) {
  const status = norm(product?.proof_status) || "none";
  const name = norm(action);

  if (name === "send_proof") {
    if (!canReach(status, "awaiting_approval")) {
      throw new Error(`A proof cannot be sent for approval while its status is "${status || "none"}".`);
    }
    const url = fileUrl !== undefined ? String(fileUrl || "").trim() : String(product?.proof_file_url || "").trim();
    if (!url && !hasProofFile(product)) {
      throw new Error("Upload a proof file before sending it for approval.");
    }
    const version = num(fileVersion, 0) || proofVersionOf(product) || 1;
    const patch = {
      proofStatus: "awaiting_approval",
      // CoreBridge parity: the product visibly waits on the customer.
      operationalStatus: "awaiting_proof_approval",
      proofVersion: version,
    };
    if (url) patch.proofFileUrl = url;
    const resolvedName = fileName !== undefined
      ? String(fileName || "").trim()
      : String(product?.proof_file_name || "").trim();
    if (resolvedName) patch.proofFileName = resolvedName;
    return patch;
  }

  if (name === "approve") {
    if (!canApproveProof(product)) {
      throw new Error(hasProofFile(product)
        ? `A proof cannot be approved while its status is "${status || "none"}".`
        : "There is no proof file to approve.");
    }
    const version = num(fileVersion, 0) || proofVersionOf(product);
    return {
      proofStatus: "approved",
      operationalStatus: "proof_approved",
      // Due-date recalc honors hard_due_date inside the helper.
      productDueDate: recalculateProductDueDateOnProofApproval({
        product: product || {},
        leadTimeDays,
        fromDate: now || new Date(),
      }),
      proofApprovedVersion: version,
    };
  }

  if (name === "request_revision") {
    if (!canReach(status, "revision_requested")) {
      throw new Error(`A revision cannot be requested while the proof status is "${status || "none"}".`);
    }
    return {
      proofStatus: "revision_requested",
      proofApprovedVersion: 0, // a requested revision invalidates the approval
    };
  }

  if (name === "supersede") {
    const url = String(fileUrl || "").trim();
    if (!url) {
      throw new Error("A new proof file is required to supersede the current version.");
    }
    return {
      proofStatus: "draft",
      proofFileUrl: url,
      proofFileName: String(fileName || "").trim(),
      proofVersion: num(fileVersion, 0) || proofVersionOf(product) + 1,
      proofApprovedVersion: 0, // new version invalidates any prior approval
      // A product that was approved/waiting returns to design for rework.
      ...(["proof_approved", "awaiting_proof_approval"].includes(norm(product?.operational_status))
        ? { operationalStatus: "in_design" }
        : {}),
    };
  }

  throw new Error(`Unknown proof action "${String(action)}".`);
}
