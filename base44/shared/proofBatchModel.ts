// Multi-product proof batches — approve-all-pending / per-product approve
// planning for WorkOrder.products[] proof approvals (ESTIMATOR_MASTERPLAN
// E-10). Pure TS, zero imports — safe for Deno functions and frontend
// modules, same contract as productStatusModel/proofFollowUpModel.
//
// Actionable rule (portal parity + batch safety):
//   pending    — operational_status 'awaiting_proof_approval'
//                OR proof_status 'sent' | 'awaiting_approval'
//   has file   — proof_file_url non-empty
//   not stale  — the current file version must not differ from the version
//                an approval was recorded against. proof_version ≠
//                proof_approved_version while a versioned approval exists
//                (or proof_status claims 'approved') means the file on the
//                row is newer than the approval covers: it needs review,
//                not a blind batch stamp. Mirrors proofModel.isProofStale
//                and queueCountersModel.isAwaitingProofRow.
//
// Divergence from src/components/portal/productPortalModel.js
// proofActionable — DELIBERATE, and worth stating on the record:
//   * The portal predicate requires operational_status ===
//     'awaiting_proof_approval' only. This model ALSO honors proof_status
//     'sent' | 'awaiting_approval' — the same OR gate
//     queueCountersModel.isAwaitingProofRow (C-04) and
//     proofFollowUpGateStatus (H-06) use for "proof is out with the
//     customer". Canonical sends stamp both fields, but the batch model
//     must surface drifted rows where the customer still owes a decision.
//   * The portal predicate has no version gate — fine there because the
//     portal renders the CURRENT file for the customer to eyeball before
//     clicking approve (a human reviews every row). Batch approval has no
//     per-row human review, so it must not stamp proof_approved_version
//     onto a file no decision was recorded for.
//   * Both accept a projected row (status_key) or a raw product
//     (operational_status) identically.
//
// Patch shape — stored products[] snake_case fields (the caller merges the
// patch into the products[] row; these are NOT the camelCase input keys of
// buildProductOperationalPatch):
//   { proof_status: 'approved',
//     proof_approved_version: <current proof_version>,
//     operational_status: 'proof_approved',
//     proof_approved_at: <iso now>,
//     proof_approved_by: <actor> }
// 'proof_approved' is the canonical post-approval operational status:
// productStatusModel.OPERATIONAL_STATUS_SET lists it and
// proofModel.nextProofPatch 'approve' writes operationalStatus
// 'proof_approved' (B-15/E-02), not 'in_production'. Due-date recalculation
// on approval stays the caller's job — the full single-product path is
// proofModel.nextProofPatch 'approve' (B-07 lead-time engine); a batch
// stamp only moves the proof lifecycle fields.
//
// API:
//   proofActionable(product)              → bool — may this proof be
//                                           approved right now?
//   pendingProofs(workOrder)              → [{index, product, actionable,
//                                           block_reason}] — every product
//                                           carrying a proof state worth
//                                           surfacing, plus why a blocked
//                                           one cannot approve.
//   batchApprovePlan(workOrder, {actor, now, product_ids?})
//                                         → {approve:[{index, patch}],
//                                            skipped:[{index, reason}]} —
//                                           approve only pending+actionable
//                                           rows; everything else lands in
//                                           skipped with a machine reason.
//   batchApproveResult(plan)              → {approved_count, skipped_count}.
//   perProductApprovePatch(product, {actor, now})
//                                         → single-product patch (same
//                                           fields); unconditional — callers
//                                           gate with proofActionable.

// ---------------------------------------------------------------------------
// Normalization helpers (same conventions as productStatusModel/proofModel)
// ---------------------------------------------------------------------------

const norm = (value: any): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const num = (value: any, fallback = 0): number =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const cleanStr = (value: any): string => String(value ?? '').trim();

// Retired operational_status spellings still live on stored rows; fold them
// onto the locked set like productPortalModel.canonicalProductStatus so
// classification reads one vocabulary (nothing maps TO awaiting_proof_
// approval, but 'vended'→'built' etc. keeps reason classification honest).
const LEGACY_STATUS_EQUIVALENTS: Record<string, string> = {
  in_design: 'design_review',
  vended: 'built',
  install_or_removal_only: 'install_removal_only',
};

const canonicalStatus = (value: any): string => {
  const v = norm(value);
  if (!v || v === 'none') return '';
  return LEGACY_STATUS_EQUIVALENTS[v] || v;
};

// proof_status values where the customer owes an approval decision and the
// proof workflow can legally reach 'approved' (proofModel.PROOF_TRANSITIONS:
// sent → approved, awaiting_approval → approved).
export const PROOF_PENDING_PROOF_STATUSES = ['sent', 'awaiting_approval'] as const;

// operational_status value send_proof stamps while the product waits on the
// customer (the portal predicate keys on exactly this).
export const PROOF_PENDING_OPERATIONAL_STATUS = 'awaiting_proof_approval';

// Canonical post-approval operational status (B-15/E-02 — see header).
export const PROOF_APPROVED_OPERATIONAL_STATUS = 'proof_approved';

// Machine-readable block reasons emitted in pendingProofs.block_reason and
// batchApprovePlan.skipped[].reason. 'actionable' rows carry '' instead.
export const PROOF_BLOCK_REASONS = [
  'not_selected',    // product_ids filter excluded this row
  'invalid_product', // products[] entry is not an object
  'deleted',         // product.deleted === true
  'internal_status', // operational_status is internal-only (voided)
  'no_proof_state',  // no proof signal at all — nothing to approve
  'not_pending',     // proof exists but is not awaiting approval
  'no_proof_file',   // pending but proof_file_url is empty
  'stale_version',   // current file version ≠ recorded approved version
] as const;

// ---------------------------------------------------------------------------
// Field readers
// ---------------------------------------------------------------------------

const proofVersionOf = (product: any): number => num(product?.proof_version, 0);
const approvedVersionOf = (product: any): number => num(product?.proof_approved_version, 0);

const hasProofFile = (product: any): boolean =>
  Boolean(cleanStr(product?.proof_file_url));

// The status a product operationally sits in — accepts a projected portal row
// (status_key) or a raw products[] row (operational_status), same as the
// portal predicate.
const operationalStatusOf = (product: any): string =>
  canonicalStatus(product?.status_key ?? product?.operational_status);

const proofStatusOf = (product: any): string => norm(product?.proof_status) || 'none';

// ---------------------------------------------------------------------------
// Predicate pieces
// ---------------------------------------------------------------------------

// Is a real approval decision pending on this product? Two physical fields
// carry the state (send_proof stamps both; drifted rows may carry only one):
//   operational_status 'awaiting_proof_approval'
//   OR proof_status 'sent' | 'awaiting_approval'
export function proofAwaitingApproval(product: any): boolean {
  const p = product ?? {};
  if (operationalStatusOf(p) === PROOF_PENDING_OPERATIONAL_STATUS) return true;
  return (PROOF_PENDING_PROOF_STATUSES as readonly string[]).includes(proofStatusOf(p));
}

// Stale = a file exists whose version differs from the recorded approved
// version while a versioned approval exists or the row claims 'approved' —
// i.e. the file on the row is NOT the file an approval covered. It needs a
// fresh review, not a batch stamp. Mirrors proofModel.isProofStale and the
// stale arm of queueCountersModel.isAwaitingProofRow.
export function isProofVersionStale(product: any): boolean {
  const version = proofVersionOf(product);
  const approved = approvedVersionOf(product);
  if (!version || version === approved) return false;
  return approved > 0 || proofStatusOf(product) === 'approved';
}

// Why a surfaced product cannot be approved right now — '' when it can.
// Check order: pending → file → stale (the reason a customer sees is the
// earliest unmet requirement).
export function proofBlockReason(product: any): string {
  const p = product ?? {};
  if (!proofAwaitingApproval(p)) return 'not_pending';
  if (!hasProofFile(p)) return 'no_proof_file';
  if (isProofVersionStale(p)) return 'stale_version';
  return '';
}

// Can this proof be approved right now? Awaiting approval + a current proof
// file + not stale. Accepts a projected portal row (status_key) or a raw
// products[] row (operational_status) — same dual shape as the portal model.
export function proofActionable(product: any): boolean {
  const p = product ?? {};
  return proofAwaitingApproval(p) && hasProofFile(p) && !isProofVersionStale(p);
}

// Does the product carry any proof state worth surfacing on the staff-side
// per-product view? Any non-'none' proof_status, a proof-bound operational
// status, or a stored proof file/version counts. Internal-only (voided) and
// deleted products are handled by the caller's row filter, same as the
// portal's visibleProducts.
export function hasProofState(product: any): boolean {
  const p = product ?? {};
  const proof = proofStatusOf(p);
  const status = operationalStatusOf(p);
  return (
    (proof !== 'none' && proof !== '') ||
    status === PROOF_PENDING_OPERATIONAL_STATUS ||
    status === PROOF_APPROVED_OPERATIONAL_STATUS ||
    hasProofFile(p) ||
    proofVersionOf(p) > 0 ||
    approvedVersionOf(p) > 0
  );
}

const isInternalProduct = (product: any): boolean =>
  operationalStatusOf(product) === 'voided';

// ---------------------------------------------------------------------------
// Clock / actor
// ---------------------------------------------------------------------------

// now → ISO stamp. Accepts Date | epoch ms | parseable string; falls back to
// the real clock so a missing `now` never produces a blank approval stamp.
const nowIso = (now: any): string => {
  const t =
    now instanceof Date
      ? now.getTime()
      : typeof now === 'number'
        ? now
        : Date.parse(String(now ?? ''));
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
};

const actorOf = (actor: any): string => cleanStr(actor);

// ---------------------------------------------------------------------------
// Approval patch
// ---------------------------------------------------------------------------

// The stored-field approval patch for one product — SAME shape whether the
// approval came from a batch plan or a per-product click:
//   proof_status           'approved'
//   proof_approved_version  current proof_version (approval binds the exact
//                           file version — proofModel/nextProofPatch parity)
//   operational_status     'proof_approved' (canonical post-approval status)
//   proof_approved_at      ISO timestamp of the decision
//   proof_approved_by      normalized actor string ('' when unknown)
// Unconditional by design — this builds a patch, it does not judge whether
// the product SHOULD be approved. Callers gate with proofActionable (portal,
// batch) or their own staff policy (a staff review MAY legitimately approve
// a stale row after eyeballing the file).
export function perProductApprovePatch(product: any, { actor, now }: any = {}) {
  const p = product ?? {};
  return {
    proof_status: 'approved',
    proof_approved_version: proofVersionOf(p),
    operational_status: PROOF_APPROVED_OPERATIONAL_STATUS,
    proof_approved_at: nowIso(now),
    proof_approved_by: actorOf(actor),
  };
}

// ---------------------------------------------------------------------------
// Batch planning
// ---------------------------------------------------------------------------

// One skip decision per products[] entry, in declaration order. The earliest
// disqualifier wins so the reported reason matches what a human would check
// first (selected? alive? has a proof? is it pending? is there a file? is it
// the file that was approved?).
const batchSkipReason = (product: any, filter: Set<string> | null): string => {
  if (!product || typeof product !== 'object' || Array.isArray(product)) return 'invalid_product';
  if (filter && !filter.has(cleanStr(product.id))) return 'not_selected';
  if (product.deleted === true) return 'deleted';
  if (isInternalProduct(product)) return 'internal_status';
  if (!hasProofState(product)) return 'no_proof_state';
  return proofBlockReason(product);
};

// Plan a batch approval over workOrder.products[]:
//   { approve: [{index, patch}], skipped: [{index, reason}] }
// Only pending+actionable products land in approve — batch approve updates
// ONLY pending products (E-10 verify). `product_ids` (array or scalar)
// restricts the plan to matching product.id values; every other row is
// reported in skipped with 'not_selected' so the staff side can render
// honest per-product state. Row order follows products[] order (index keys
// the merge).
export function batchApprovePlan(workOrder: any, { actor, now, product_ids }: any = {}) {
  const approve: any[] = [];
  const skipped: any[] = [];
  const products = Array.isArray(workOrder?.products) ? workOrder.products : [];
  const filter =
    product_ids == null
      ? null
      : new Set<string>(
          (Array.isArray(product_ids) ? product_ids : [product_ids])
            .map((v: any) => cleanStr(v))
            .filter(Boolean),
        );
  const at = nowIso(now);
  const by = actorOf(actor);
  products.forEach((product: any, index: number) => {
    const reason = batchSkipReason(product, filter);
    if (reason) {
      skipped.push({ index, reason });
      return;
    }
    approve.push({ index, patch: perProductApprovePatch(product, { actor: by, now: at }) });
  });
  return { approve, skipped };
}

// Rollup for the plan (or any {approve, skipped}-shaped result); a bare
// approve-entry array also reads honestly.
export function batchApproveResult(plan: any) {
  const approve = Array.isArray(plan?.approve) ? plan.approve : Array.isArray(plan) ? plan : [];
  const skipped = Array.isArray(plan?.skipped) ? plan.skipped : [];
  return { approved_count: approve.length, skipped_count: skipped.length };
}

// ---------------------------------------------------------------------------
// Staff-side per-product state
// ---------------------------------------------------------------------------

// Every product carrying a proof state worth surfacing — deleted products
// and internal-only statuses are filtered out entirely (same row filter the
// portal applies), so a voided/deleted product's proof bookkeeping never
// renders as customer-relevant state.
//   → [{index, product, actionable, block_reason}]
// block_reason is '' for actionable rows; otherwise the machine reason from
// proofBlockReason ('not_pending' | 'no_proof_file' | 'stale_version').
export function pendingProofs(workOrder: any) {
  const products = Array.isArray(workOrder?.products) ? workOrder.products : [];
  const rows: any[] = [];
  products.forEach((product: any, index: number) => {
    if (!product || typeof product !== 'object' || Array.isArray(product)) return;
    if (product.deleted === true || isInternalProduct(product)) return;
    if (!hasProofState(product)) return;
    const block_reason = proofBlockReason(product);
    rows.push({ index, product, actionable: block_reason === '', block_reason });
  });
  return rows;
}
