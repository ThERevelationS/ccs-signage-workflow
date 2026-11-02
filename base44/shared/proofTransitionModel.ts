// Proof-decision transitions — the `awaiting_proof_approval` → `proof_approved`
// operational move, exercisable through BOTH actor paths: the customer portal
// approval action and the staff design-review queue action
// (ESTIMATOR_MASTERPLAN E-02). Pure TS, zero imports — safe for Deno functions
// and frontend modules, same contract as productStatusModel/proofBatchModel.
//
// One decision, one stamp — the masterplan verify is "both paths work on a
// test product; audit records actor class". The product patch an approval
// lands is IDENTICAL whether the actor is the customer or a staff reviewer:
// the same stored fields move, to the same values, for the same product. The
// only fields that differ are the two actor stamps — who decided
// (proof_approved_by / actor_id) and which surface class they used
// (proof_approval_actor_type / actor_type). Everything else — the status, the
// version pointer, the timestamp — is actor-blind by design.
//
// Status vocabulary: operational_status values come from the locked
// productStatusModel.OPERATIONAL_STATUS_SET ('awaiting_proof_approval' and
// 'proof_approved' are both members). 'proof_changes_requested' is the proof
// window's changes-requested resting state — the customer-facing "back to
// design" decision (E-03 owns the detail model; this map only legalizes the
// edge so both surfaces validate against one vocabulary). Legacy stored
// spellings fold onto the locked set exactly like
// proofBatchModel.canonicalStatus.
//
// E-01 supersede semantics (proofPipelineModel.js, w-75) are preserved: an
// approval binds the version it was given for and a later upload NEVER
// rewrites proof_approved_version — proof_version > proof_approved_version IS
// the stale-approval signal. This module's approve patch reads the CURRENT
// proof_version at decision time (the file the actor just reviewed) and only
// ever writes it forward; nothing here clears or back-dates the pointer.
//
// Patch shape — stored products[] snake_case fields (same convention as
// proofBatchModel.perProductApprovePatch; callers merge into the products[]
// row via the WO array-mutation / entity write path):
//   { operational_status: 'proof_approved',
//     proof_status: 'approved',               // canonical approval stamp —
//                                             // proofModel.nextProofPatch
//                                             // 'approve' + perProductApprovePatch
//                                             // both write it; leaving
//                                             // proof_status at
//                                             // 'awaiting_approval' after the
//                                             // decision is the drift the
//                                             // batch gate guards against
//     proof_approved_version: <product.proof_version ?? approved_version>,
//     proof_approved_at: <iso now>,
//     proof_approved_by: <actor_id>,
//     proof_approval_actor_type: 'customer' | 'staff' }
// customer_facing_status / operational_status_changed_at are derived fields
// the downstream write path stamps (applyProductOperationalPatch owns them on
// the camelCase path) — this patch stays lifecycle-only like the batch model.
// Due-date recalculation on approval (B-07/E-04) stays the caller's job.
//
// Audit shape — ProductActivity-shaped rows (base44/entities/
// ProductActivity.jsonc). DIVERGENCE FROM THE SPEC FRAGMENT, deliberate and on
// the record: the entity's event_type enum does NOT carry 'proof_approved' /
// 'proof_changes_requested' / 'proof_superseded' — the legal bucket is
// 'proof_event' (productAuditModel stamps it for every proof field diff). The
// fine-grained spec vocabulary is therefore emitted as `proof_event_type`
// (+ details.proof_event_type) under event_type 'proof_event', so a writer can
// persist the row without an enum violation and the feed still reads the
// exact decision. `version`, `created_date`, `actor_id`, and
// `proof_approved_version` are emitted top-level alongside the entity fields
// (occurred_at, actor_label) so both the spec shape and the entity contract
// read in one row.
//
// API:
//   PROOF_TRANSITIONS                       — legal from-status → [to-status]
//                                             map for the proof window.
//   PROOF_AUDIT_EVENT_TYPES                 — the fine-grained audit
//                                             vocabulary.
//   PROOF_ACTOR_TYPES                       — ['customer', 'staff'].
//   approveProofPatch(product, {actor_type, actor_id, approved_version?, now})
//       → the stored-field approval patch; same shape for both actor paths.
//   validateProofTransition(product, to_status, {actor_type})
//       → {ok, error, reason} — status edge + actor-class policy gate.
//   proofAuditEvent(product, transition, {actor_type, actor_id, now, note,
//                                         work_order_id?})
//       → ProductActivity-shaped event row, or null for an unknown
//         transition.
//   portalCanSeeProof(product, {version})   — only the latest version is
//                                             customer-visible.

// ---------------------------------------------------------------------------
// Normalization helpers (same conventions as productStatusModel/proofBatch)
// ---------------------------------------------------------------------------

const norm = (value: any): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const cleanStr = (value: any): string => String(value ?? '').trim();

const num = (value: any, fallback = 0): number =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const intAtLeast0 = (value: any): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

// Retired operational_status spellings still live on stored rows; fold them
// onto the locked set like proofBatchModel/productPortalModel so the gate
// reads one vocabulary ('in_design' → 'design_review' keeps the staff send
// edge reachable on legacy rows).
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

// Accepts a projected portal row (status_key) or a raw products[] row
// (operational_status) — same dual shape as the portal/batch models.
const operationalStatusOf = (product: any): string =>
  canonicalStatus(product?.status_key ?? product?.operational_status);

const proofVersionOf = (product: any): number => intAtLeast0(product?.proof_version);
const approvedVersionOf = (product: any): number =>
  intAtLeast0(product?.proof_approved_version);

// now → ISO stamp. Date | epoch ms | parseable string; falls back to the real
// clock so a missing `now` never produces a blank approval stamp.
const nowIso = (now: any): string => {
  const t =
    now instanceof Date
      ? now.getTime()
      : typeof now === 'number'
        ? now
        : Date.parse(String(now ?? ''));
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
};

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

// The statuses the proof window operates on (locked-set members plus the
// changes-requested resting state E-03 details).
export const PROOF_AWAITING_STATUS = 'awaiting_proof_approval';
export const PROOF_APPROVED_STATUS = 'proof_approved';
export const PROOF_CHANGES_REQUESTED_STATUS = 'proof_changes_requested';

// The actor classes allowed to take a proof decision. ProductActivity's
// actor_type enum already carries both ('customer' | 'staff' — vendor/system
// never decide a proof: a vendor file is a staff upload and an automated
// stamp is not a customer decision).
export const PROOF_ACTOR_TYPES = ['customer', 'staff'] as const;

// The fine-grained audit vocabulary. Emitted on proofAuditEvent rows as
// proof_event_type under the entity-legal event_type 'proof_event'.
export const PROOF_AUDIT_EVENT_TYPES = [
  'proof_approved',
  'proof_changes_requested',
  'proof_superseded',
] as const;

// Legal transitions inside the proof window — the actor-agnostic edge set;
// validateProofTransition applies the per-actor policy on top:
//   design_review           → awaiting_proof_approval  staff sends the proof
//   awaiting_proof_approval → proof_approved           either actor approves
//   awaiting_proof_approval → proof_changes_requested  either actor records
//                                                      the customer's answer
//   proof_changes_requested → awaiting_proof_approval  staff resends the
//                                                      revised proof
//   proof_changes_requested → proof_approved           staff re-approves
//                                                      after revision
//   proof_approved          → []                       terminal inside this
//                                                      window — downstream
//                                                      moves (in_production,
//                                                      …) are ordinary status
//                                                      transitions, not
//                                                      proof decisions.
// (Spec fragment preserved verbatim on the awaiting_proof_approval and
// proof_approved rows.)
export const PROOF_TRANSITIONS: Record<string, readonly string[]> = {
  design_review: [PROOF_AWAITING_STATUS],
  awaiting_proof_approval: [PROOF_APPROVED_STATUS, PROOF_CHANGES_REQUESTED_STATUS],
  proof_changes_requested: [PROOF_AWAITING_STATUS, PROOF_APPROVED_STATUS],
  proof_approved: [],
};

// Every to-status this map can legalize (the proof window's closed target
// vocabulary) — validation rejects anything outside it before edge checks.
export const PROOF_TRANSITION_TARGETS: readonly string[] = [
  ...new Set(Object.values(PROOF_TRANSITIONS).flat()),
];

// Machine-readable rejection reasons on validateProofTransition — '' when
// ok. The error string stays human-readable for toasts; reason is for tests
// and branch logging.
export const PROOF_TRANSITION_REJECTIONS = [
  'invalid_product',   // product is not an object / is an array
  'deleted',           // product.deleted === true
  'not_in_proof_window', // from-status carries no proof-window edges
  'unknown_target',    // to_status is not a proof-window target at all
  'illegal_transition',// the (from → to) edge is not in PROOF_TRANSITIONS
  'actor_forbidden',   // the edge exists but this actor class may not take it
] as const;

// ---------------------------------------------------------------------------
// Transition validation
// ---------------------------------------------------------------------------

// The customer surface is the narrow one: from awaiting_proof_approval only,
// and only the two decisions the portal renders (approve / request changes).
// A customer can NEVER self-approve a product parked at
// proof_changes_requested — a revision must come back through staff (or a
// resend) before a fresh approval is real.
const CUSTOMER_ALLOWED: Record<string, readonly string[]> = {
  awaiting_proof_approval: [PROOF_APPROVED_STATUS, PROOF_CHANGES_REQUESTED_STATUS],
};

// May `actor_type` take this product to `to_status`? → {ok, error, reason}.
//   customer — only approve / request-changes on products in
//              awaiting_proof_approval.
//   staff    — any mapped proof-window edge: the design-review queue is the
//              trusted surface (send, record a phoned-in change request,
//              approve, re-approve after revision, resend). "Everything else"
//              — unmapped edges, non-proof statuses, unknown actor classes —
//              is rejected.
// Actionability (file present, version not stale) is deliberately NOT gated
// here — that is proofBatchModel.proofActionable's job; this validates the
// transition itself so both actor paths share one legality source.
export function validateProofTransition(
  product: any,
  to_status: any,
  { actor_type }: any = {},
) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    return { ok: false, reason: 'invalid_product', error: 'This product is no longer available.' };
  }
  if (product.deleted === true) {
    return { ok: false, reason: 'deleted', error: 'This product has been removed from the order.' };
  }
  const from = operationalStatusOf(product);
  const to = canonicalStatus(to_status);
  const actor = norm(actor_type);
  const edges = PROOF_TRANSITIONS[from];
  if (!edges || !edges.length) {
    return {
      ok: false,
      reason: 'not_in_proof_window',
      error: `This product is ${from || 'not in a proof state'} — no proof decision is pending.`,
    };
  }
  if (!to || !PROOF_TRANSITION_TARGETS.includes(to)) {
    return {
      ok: false,
      reason: 'unknown_target',
      error: `"${cleanStr(to_status) || 'blank'}" is not a proof decision.`,
    };
  }
  if (!edges.includes(to)) {
    return {
      ok: false,
      reason: 'illegal_transition',
      error: `A proof cannot move from ${from} to ${to}.`,
    };
  }
  if (actor === 'customer') {
    const allowed = CUSTOMER_ALLOWED[from] || [];
    if (allowed.includes(to)) return { ok: true, reason: '', error: '' };
    return {
      ok: false,
      reason: 'actor_forbidden',
      error: 'Customers can only approve or request changes while a proof is awaiting their approval.',
    };
  }
  if (actor === 'staff') return { ok: true, reason: '', error: '' };
  return {
    ok: false,
    reason: 'actor_forbidden',
    error: `Actor type "${cleanStr(actor_type) || 'unknown'}" cannot decide a proof.`,
  };
}

// ---------------------------------------------------------------------------
// Approval patch — one stamp for both actor paths
// ---------------------------------------------------------------------------

// The stored-field approval patch for one product. SAME field set, same
// values, same precedence regardless of which actor path called — the
// masterplan verify ("both write the same proof_approved_version + audit")
// holds because the only inputs that vary are the actor stamps.
//
//   actor_type       'customer' | 'staff' — stamped verbatim onto
//                    proof_approval_actor_type; callers gate with
//                    validateProofTransition (builder is unconditional,
//                    mirroring perProductApprovePatch).
//   actor_id         who decided — portal contact email or staff identity;
//                    stamped as proof_approved_by ('' when unknown).
//   approved_version explicit version override — the FALLBACK when the
//                    product carries no proof_version (spec: proof_version
//                    ?? approved_version). The current file version always
//                    wins: the approval binds the file the actor reviewed.
//   now              ISO stamp (Date | ms | parseable string).
export function approveProofPatch(
  product: any,
  { actor_type, actor_id, approved_version, now }: any = {},
) {
  const p = product && typeof product === 'object' ? product : {};
  const hasStoredVersion =
    p.proof_version !== undefined &&
    p.proof_version !== null &&
    cleanStr(p.proof_version) !== '';
  return {
    operational_status: PROOF_APPROVED_STATUS,
    proof_status: 'approved',
    proof_approved_version: hasStoredVersion
      ? intAtLeast0(p.proof_version)
      : intAtLeast0(approved_version),
    proof_approved_at: nowIso(now),
    proof_approved_by: cleanStr(actor_id),
    proof_approval_actor_type: norm(actor_type),
  };
}

// ---------------------------------------------------------------------------
// Audit event — ProductActivity-shaped proof_decision row
// ---------------------------------------------------------------------------

const productLabelOf = (product: any): string =>
  cleanStr(
    product?.description ??
      product?.client_product_name ??
      product?.customer_description ??
      product?.product_name ??
      product?.product_label,
  );

const productIdOf = (product: any): string =>
  cleanStr(product?.id ?? product?.product_id);

// Map a caller's `transition` onto the fine-grained audit vocabulary.
// Accepts the event name itself, a to-status string, or a {to?, from?,
// event_type?|proof_event_type?} descriptor — portal passes the decision,
// staff passes the transition it validated, upload passes 'proof_superseded'.
const auditEventTypeOf = (transition: any): string => {
  const direct = (v: any): string =>
    (PROOF_AUDIT_EVENT_TYPES as readonly string[]).includes(norm(v)) ? norm(v) : '';
  if (typeof transition === 'string') {
    if (direct(transition)) return norm(transition);
    const to = canonicalStatus(transition);
    return to === PROOF_APPROVED_STATUS
      ? 'proof_approved'
      : to === PROOF_CHANGES_REQUESTED_STATUS
        ? 'proof_changes_requested'
        : '';
  }
  if (transition && typeof transition === 'object') {
    return (
      direct(transition.proof_event_type) ||
      direct(transition.event_type) ||
      auditEventTypeOf(transition.to ?? transition.to_status)
    );
  }
  return '';
};

const EVENT_LABEL: Record<string, string> = {
  proof_approved: 'Proof approved',
  proof_changes_requested: 'Proof changes requested',
  proof_superseded: 'Proof superseded',
};

// Build the ProductActivity-shaped audit row for one proof transition.
// Entity-legal: event_type 'proof_event' + proof_event_type carrying the
// spec vocabulary (see header). `created_date` mirrors occurred_at — the
// entity's own created_date is the system stamp; the duplicate top-level
// field keeps the spec'd read shape honest.
//
// `transition` — 'proof_approved' | 'proof_changes_requested' |
//                'proof_superseded', a to-status, or {from,to[,event_type]}.
// Returns null for anything outside the vocabulary (fail closed like
// productAuditModel.makeProductAuditEvent).
export function proofAuditEvent(
  product: any,
  transition: any,
  { actor_type, actor_id, now, note, work_order_id }: any = {},
) {
  const event = auditEventTypeOf(transition);
  if (!event) return null;
  const p = product && typeof product === 'object' ? product : {};
  // Stamped verbatim (callers gate with validateProofTransition); a blank
  // actor class records as staff, matching ProductActivity's default.
  const actorType = norm(actor_type) || 'staff';
  const at = nowIso(now);
  const version = proofVersionOf(p);
  const approved = approvedVersionOf(p);
  const fromStatus = operationalStatusOf(p);
  const toStatus =
    event === 'proof_approved'
      ? PROOF_APPROVED_STATUS
      : event === 'proof_changes_requested'
        ? PROOF_CHANGES_REQUESTED_STATUS
        : fromStatus; // superseded is a version event — the product does not move
  const versionNote =
    event === 'proof_superseded' && approved > 0 && approved !== version
      ? `approved v${approved}, file v${version}`
      : version > 0
        ? `v${version}`
        : '';
  const productId = productIdOf(p);
  const workOrderId = cleanStr(work_order_id) || cleanStr(p.work_order_id);
  const actorId = cleanStr(actor_id);
  return {
    schema_version: 1,
    // Retry-stable receipt: identical inputs regenerate the identical key, so
    // a persist path honoring creation_request_key never double-writes the
    // audit row (same contract as buildConversionEvent).
    creation_request_key: `proof:${event}:${productId}:${version}:${actorType}:${at}`,
    work_order_id: workOrderId,
    product_id: productId,
    product_label: productLabelOf(p),
    event_type: 'proof_event',
    proof_event_type: event,
    label: `${EVENT_LABEL[event]}${versionNote ? ` — ${versionNote}` : ''}`,
    actor_type: actorType,
    actor_id: actorId,
    actor_label: actorId,
    from_value: fromStatus,
    to_value: toStatus,
    version,
    proof_approved_version: event === 'proof_approved' ? version || approved : approved,
    note: cleanStr(note),
    occurred_at: at,
    created_date: at,
    details: {
      proof_event_type: event,
      transition: { from: fromStatus, to: toStatus },
      proof_version: version,
      proof_approved_version: event === 'proof_approved' ? version || approved : approved,
      actor_id: actorId,
    },
  };
}

// ---------------------------------------------------------------------------
// Portal visibility — latest version only
// ---------------------------------------------------------------------------

// May the customer see this proof version in the portal? The portal renders
// exactly one file: the CURRENT one. A historical proof_history[] row is
// never customer-visible (the customer approves what they can see — showing
// an old file approves nothing real), and a version ahead of the stored
// pointer does not exist yet.
//   version omitted → "may the portal show the current proof at all" — true
//     once a versioned file exists.
//   version given   → true only when it IS the current proof_version.
export function portalCanSeeProof(product: any, { version }: any = {}) {
  const current = proofVersionOf(product);
  if (current <= 0) return false; // nothing uploaded — nothing visible
  if (version === undefined || version === null || cleanStr(version) === '') {
    return true;
  }
  return intAtLeast0(version) === current;
}
