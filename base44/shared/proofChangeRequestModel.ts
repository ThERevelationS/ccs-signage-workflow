// Proof-change requests — ESTIMATOR_MASTERPLAN WS-E / item E-03.
// Pure TS, ZERO imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike, same contract as
// productStatusModel / readyTriggerModel / proofFollowUpModel.
//
// Flow: a customer (or staff filing on their behalf) hits "request changes"
// on a product sitting in `awaiting_proof_approval`. The product regresses
// out of the customer-decision state back into design work, the reason is
// captured on the product, the assigned designer gets an internal
// notification, and a ProductActivity audit row records who asked and why.
//
// REGRESSION SEMANTICS (deliberate, documented):
//   The patch writes `operational_status: 'proof_changes_requested'` — a
//   single canonical design-regression status, NOT the product's prior
//   design substatus. Rationale: the proof loop restarts deterministically
//   (designer revises → E-01 re-upload bumps proof_version → re-send → back
//   to awaiting_proof_approval), so there is nothing to restore — and a
//   dedicated status keeps "customer rejected the proof, needs rework"
//   distinguishable from `design_review` (design in progress, never sent)
//   on staff queues and in notification targeting. In stage terms it is a
//   'design'-stage WIP state, same slot as awaiting_proof_approval /
//   design_review in productStatusModel.STATUS_STAGE_MAP.
//   `proof_changes_requested` is NOT yet in productStatusModel's locked
//   OPERATIONAL_STATUS_SET or the products[] enum in WorkOrder.jsonc — the
//   model emits the canonical value ahead of schema, the same additive
//   pattern as products[].proof_history (E-01) and products[].notes (B-10).
//
// Companion writes in the same patch (beyond the spec'd change-request
// fields — each justified, none gratuitous):
//   proof_status: 'revision_requested'
//     — the declared proof_status enum value for exactly this event
//       (proofModel.request_revision writes the same). It closes the H-06
//       proof follow-up sequence (revision_requested is in
//       proofFollowUpModel.PROOF_FOLLOW_UP_TERMINAL_STATUSES — without it a
//       customer who already answered keeps getting "please approve"
//       nudges), and the portal maps it to customer-facing
//       'changes_requested' / "Changes requested"
//       (productPortalModel.PROOF_STATUS_TO_STATE).
//   proof_approved_version: 0
//     — mirrors proofModel.request_revision ("a requested revision
//       invalidates the approval"). Clears any stale approved-version
//       pointer the E-01 upload path deliberately preserves.
//   operational_status_changed_at: <now>
//     — the declared stamp every status transition writes
//       (WorkOrder.jsonc products[]; proofFollowUp anchor precedence reads
//       it if the product later re-enters the proof window).
//   Deliberately absent: customer_facing_status — the portal derives
//     proof_state from proof_status, so the stored label column stays the
//     status-label map's job, not this module's.
//
// Event vocabulary: 'proof_changes_requested' is also used as the
// ProductActivity event_type per spec. That value is NOT yet in the
// entity's declared event_type enum — the integration pass declares it (or
// a writer maps to the declared 'proof_event'; the row carries
// details.field 'operational_status' either way).
//
// API:
//   CHANGE_REASON_CODES / CHANGE_REASON_LABELS / CHANGE_REQUEST_ACTOR_TYPES
//   PROOF_CHANGES_REQUESTED_STATUS
//   reasonLabel(code)                          — display label, '' unknown
//   changeRequestDedupeKey(product_ref, count) — 'pcreq:<ref>:<count>'
//   proofChangeCount(product)                  — stored count, int >= 0
//   validateChangeRequest(product, {reason_code, reason_text, actor_type?})
//       → {ok:true} | {ok:false, error}
//   requestProofChangesPatch(product, {reason_code, reason_text,
//       actor_id, actor_type?, now}) → patch | null (fail-closed on
//       invalid input — callers gate with validateChangeRequest for
//       user-facing errors)
//   designerNotificationFor(product, workOrder, {reason_code?, reason_label?,
//       reason_text, index?, count?, settings?}) → internal notification row
//       | null
//   changeRequestAuditEvent(product, {reason_code, reason_text, actor_type,
//       actor_id, now, work_order_id?, from_status?, count?})
//       → ProductActivity row | null

const clean = (v: any): string => String(v ?? '').trim();
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const norm = (v: any): string =>
  clean(v).toLowerCase().replace(/[\s-]+/g, '_');
const intAtLeast0 = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

// The canonical regression status — see the header block. Exported so
// writers/tests compare against the constant instead of a string literal.
export const PROOF_CHANGES_REQUESTED_STATUS = 'proof_changes_requested';

// Only one source status is legal: awaiting_proof_approval. The spec
// explicitly rules OUT a post-approval window (proof_approved is rejected —
// changes on an approved proof take the revision-order path, not this one).
export const CHANGE_REQUEST_SOURCE_STATUS = 'awaiting_proof_approval';

// Coded reasons the portal/staff UI offers. 'other' requires free text.
export const CHANGE_REASON_CODES = [
  'text_correction',
  'color_change',
  'size_change',
  'layout_change',
  'other',
] as const;

export type ChangeReasonCode = (typeof CHANGE_REASON_CODES)[number];

export const CHANGE_REASON_LABELS: Record<ChangeReasonCode, string> = {
  text_correction: 'Text correction',
  color_change: 'Color change',
  size_change: 'Size change',
  layout_change: 'Layout change',
  other: 'Other',
};

// Who may file. The flow is customer-initiated; 'staff' is allowed so the
// shop can record a phone/email request on the customer's behalf (the
// ProductActivity actor_type enum has room for vendor/system, but this
// action does not — spec).
export const CHANGE_REQUEST_ACTOR_TYPES = ['customer', 'staff'] as const;

// Display label for a reason code — '' for anything outside the declared
// set so callers detect the miss (never guess a label for an unknown code).
export function reasonLabel(code: any): string {
  const v = norm(code);
  return (CHANGE_REASON_CODES as readonly string[]).includes(v)
    ? CHANGE_REASON_LABELS[v as ChangeReasonCode]
    : '';
}

const isReasonCode = (code: any): code is ChangeReasonCode =>
  (CHANGE_REASON_CODES as readonly string[]).includes(norm(code));

// Actor normalizer shared by the patch/audit helpers: 'staff' passes
// through; everything else (blank, 'customer', odd spellings) resolves to
// 'customer' — the fail-safe default for a customer-initiated flow.
const actorTypeFor = (v: any): 'customer' | 'staff' =>
  norm(v) === 'staff' ? 'staff' : 'customer';

// Stored proof_change_count, coerced to an int >= 0.
export function proofChangeCount(product: any): number {
  return intAtLeast0(product?.proof_change_count);
}

// Dedupe identity for one change-request notification:
//   pcreq:<product_ref>:<request_ordinal>
// The ordinal rides the key so EVERY request notifies — requests #1 and #2
// are distinct events, not duplicates (same version-aware scheme as
// readyTriggerModel.triggerDedupeKey). Writers may namespace per recipient
// before persisting (followUpSweep convention).
export function changeRequestDedupeKey(product_ref: any, count: any): string {
  const ref = clean(product_ref) || 'unknown';
  const n = intAtLeast0(count) || 1;
  return `pcreq:${ref}:${n}`;
}

// Request ordinal for keys/details: explicit override wins, then the
// product's stored count (post-patch view), then 1. max(1, stored) is
// correct on both sides of the patch — a pre-patch first request stores 0
// (→ 1) and a post-patch view already holds the request's number. A second
// request can only exist after the first patch landed, so a real pre-patch
// product can never legitimately carry a stale 0 into request #2.
const requestOrdinal = (product: any, arg: any): number => {
  const explicit = intAtLeast0(arg?.count ?? arg?.change_count);
  return explicit || proofChangeCount(product) || 1;
};

// The '<name>' in titles/messages — same fallback chain as
// readyTriggerModel.productReadyLabel / proofFollowUpModel.productLabel,
// index-aware.
export function proofChangeProductLabel(product: any, index?: any): string {
  const label =
    clean(product?.description) ||
    clean(product?.client_product_name) ||
    clean(product?.customer_description) ||
    clean(product?.product_type);
  if (label) return label;
  const n = Number(index);
  return Number.isFinite(n) && n >= 0 ? `Product ${Math.floor(n) + 1}` : 'Product';
}

// Dedupe entity ref: product.id first, then '<wo_id>:<index>' for id-less
// embedded rows, then the order id — proofEntityRef convention.
const productRefFor = (product: any, workOrder: any, index?: any): string => {
  const pid = clean(product?.id) || clean(product?.product_id);
  if (pid) return pid;
  const woId = clean(workOrder?.id);
  const n = Number(index);
  if (woId && Number.isFinite(n) && n >= 0) return `${woId}:${Math.floor(n)}`;
  return woId || 'unknown';
};

const orderNumberFor = (workOrder: any): string =>
  clean(workOrder?.corbridge_invoice_number) ||
  clean(workOrder?.work_order_number) ||
  clean(workOrder?.order_number) ||
  clean(workOrder?.est_inv_at) ||
  clean(workOrder?.id);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Gate for one change request.
 * @param product  WorkOrder.products[] row (operational_status is the gate).
 * @param arg.reason_code   One of CHANGE_REASON_CODES (normalized).
 * @param arg.reason_text   Free text — REQUIRED when reason_code is 'other'.
 * @param arg.actor_type    Optional: 'customer' (default) or 'staff'. Any
 *                          other provided value is rejected — vendor/system
 *                          cannot file this action.
 * @returns {ok:true} | {ok:false, error:<human sentence>}
 */
export function validateChangeRequest(product: any, arg: any = {}) {
  if (!isObj(product)) {
    return { ok: false, error: 'A product is required to request proof changes.' };
  }
  const status = norm(product.operational_status);
  if (status === PROOF_CHANGES_REQUESTED_STATUS) {
    return {
      ok: false,
      error: 'Changes were already requested for this product — the designer is already on it.',
    };
  }
  if (status === 'proof_approved') {
    return {
      ok: false,
      error: 'This proof is already approved — further changes need a revision order, not a change request.',
    };
  }
  if (status !== CHANGE_REQUEST_SOURCE_STATUS) {
    return {
      ok: false,
      error: 'Changes can only be requested while the product is awaiting proof approval.',
    };
  }
  const code = norm(arg?.reason_code ?? arg?.reasonCode);
  if (!code) {
    return { ok: false, error: 'Pick a reason for the requested changes.' };
  }
  if (!isReasonCode(code)) {
    return {
      ok: false,
      error: `"${clean(arg?.reason_code ?? arg?.reasonCode)}" is not a valid change-request reason.`,
    };
  }
  const text = clean(arg?.reason_text ?? arg?.reasonText);
  if (code === 'other' && !text) {
    return { ok: false, error: 'Describe the changes you need — a note is required for "Other".' };
  }
  const actorRaw = clean(arg?.actor_type ?? arg?.actorType);
  if (actorRaw && !(CHANGE_REQUEST_ACTOR_TYPES as readonly string[]).includes(norm(actorRaw))) {
    return { ok: false, error: `"${actorRaw}" cannot file a proof-change request.` };
  }
  return { ok: true, reason_code: code as ChangeReasonCode, reason_text: text };
}

// ---------------------------------------------------------------------------
// Patch
// ---------------------------------------------------------------------------

/**
 * Build the storage-field patch for a validated change request.
 *
 * @param product             The products[] row being regressed.
 * @param arg.reason_code     CHANGE_REASON_CODES value (normalized on write).
 * @param arg.reason_text     Free-text detail; required for 'other',
 *                            optional-but-stored for coded reasons.
 * @param arg.actor_id        Who filed — stamped on
 *                            proof_change_requested_by.
 * @param arg.actor_type      Optional 'customer'|'staff'; validated when
 *                            supplied, not stored (the audit event owns the
 *                            actor class).
 * @param arg.now             ISO timestamp (tests pin it; default = now).
 * @returns patch | null — null on any invalid input (wrong status, bad or
 *          missing reason code, 'other' without text, bad actor_type).
 *          Callers that need the error message run validateChangeRequest
 *          first; the patch helper fails closed instead of throwing.
 *
 * Patch shape (all snake_case storage fields):
 *   operational_status            — 'proof_changes_requested' (see header)
 *   proof_status                  — 'revision_requested'
 *   proof_approved_version        — 0 (request invalidates any approval)
 *   operational_status_changed_at — <now>
 *   proof_change_reason_code      — normalized code
 *   proof_change_reason           — cleaned free text ('' when absent)
 *   proof_change_requested_at     — <now>
 *   proof_change_requested_by     — cleaned actor_id
 *   proof_change_count            — stored count + 1 (min 1)
 */
export function requestProofChangesPatch(product: any, arg: any = {}) {
  const check = validateChangeRequest(product, arg);
  if (!check.ok) return null;

  const stamp = clean(arg?.now) || new Date().toISOString();
  const patch: any = {
    operational_status: PROOF_CHANGES_REQUESTED_STATUS,
    proof_status: 'revision_requested',
    proof_approved_version: 0,
    operational_status_changed_at: stamp,
    proof_change_reason_code: check.reason_code,
    proof_change_reason: check.reason_text,
    proof_change_requested_at: stamp,
    proof_change_requested_by: clean(arg?.actor_id ?? arg?.actorId),
    proof_change_count: proofChangeCount(product) + 1,
  };
  return patch;
}

// ---------------------------------------------------------------------------
// Designer notification
// ---------------------------------------------------------------------------

// Recipient chain: product.designer → workOrder.assigned_to (spec'd), then
// the optional settings.default_designer tail — the same fallback
// readyTriggerModel.resolveDesignerRecipient uses, so a caller holding
// settings gets the same recipient either model would pick. Values are
// cleaned, not email-validated (a stored display name still resolves; the
// wiring layer maps names → directory emails).
const designerRecipientFor = (product: any, workOrder: any, settings: any): string => {
  const direct = clean(product?.designer) || clean(workOrder?.assigned_to);
  if (direct) return direct;
  const s = isObj(settings) ? settings : {};
  const dig = (root: any, path: string) => {
    let cur = root;
    for (const key of path.split('.')) {
      if (!isObj(cur)) return undefined;
      cur = cur[key];
    }
    return cur;
  };
  return (
    clean(dig(s, 'default_designer')) ||
    clean(dig(s, 'notifications.default_designer')) ||
    clean(dig(s, 'setting_value.default_designer')) ||
    clean(dig(s, 'setting_value.notifications.default_designer'))
  );
};

// D-12 staff deep link — byte-identical to deepLinks.js deepLinkFor /
// readyTriggerModel.jobWorkspaceDeepLink.
const jobWorkspaceLink = (id: any): string => {
  const v = clean(id);
  return v ? `/JobWorkspace?wo=${encodeURIComponent(v)}` : '/JobWorkspace';
};

/**
 * Compose the internal designer notification for one filed change request.
 * Row shape matches the readyTriggerModel/delivery.ts internalRow
 * vocabulary the writer maps into Notification{recipient_email,title,body,
 * deep_link}: {audience:'internal', type:'notification',
 * kind:'proof_changes_requested', recipient_email, title, message, link,
 * entity_type:'work_order', entity_id, product_id, dedupe_key,
 * missing_recipient}.
 *
 * @param arg.reason_label / arg.reason_code — display reason for the
 *        message (label wins; code resolves through reasonLabel; 'Other'
 *        when neither resolves).
 * @param arg.reason_text — the free-text detail, quoted in the message.
 * @param arg.index / product_index — product position for label/id fallback.
 * @param arg.count / change_count — explicit request ordinal for the
 *        dedupe key (pass the patch's proof_change_count when known).
 * @param arg.settings — optional; feeds the default_designer tail.
 * @returns row | null — null when product/workOrder are not objects or the
 *          work order has no id (the deep link cannot be built).
 */
export function designerNotificationFor(product: any, workOrder: any, arg: any = {}) {
  if (!isObj(product) || !isObj(workOrder)) return null;
  const woId = clean(workOrder.id);
  if (!woId) return null;

  const index = arg?.index ?? arg?.product_index;
  const label = proofChangeProductLabel(product, index);
  const reasonText = clean(arg?.reason_text ?? arg?.reasonText);
  const labelText =
    clean(arg?.reason_label ?? arg?.reasonLabel) ||
    reasonLabel(arg?.reason_code ?? arg?.reasonCode) ||
    'Other';
  const ordinal = requestOrdinal(product, arg);
  const productRef = productRefFor(product, workOrder, index);
  const recipient = designerRecipientFor(product, workOrder, arg?.settings);
  const orderNumber = orderNumberFor(workOrder);
  const version = intAtLeast0(product?.proof_version);
  const versionText = version > 0 ? ` v${version}` : '';

  const message =
    `Changes requested on "${label}"${versionText} for order ${orderNumber}: ` +
    `${labelText}${reasonText ? ` — "${reasonText}"` : ''}. ` +
    'The proof is back with design for revision — upload a new version when ready.';

  return {
    audience: 'internal',
    type: 'notification',
    kind: PROOF_CHANGES_REQUESTED_STATUS,
    // Same casing rule as readyTriggerModel's internalRow — lowercase the
    // resolved recipient (the writer lowercases emails; display names pass
    // through the directory map regardless).
    recipient_email: recipient.toLowerCase(),
    title: `Proof changes requested — ${label}`,
    message,
    link: jobWorkspaceLink(woId),
    entity_type: 'work_order',
    entity_id: woId,
    product_id: productRef,
    dedupe_key: changeRequestDedupeKey(productRef, ordinal),
    missing_recipient: !recipient,
  };
}

// ---------------------------------------------------------------------------
// ProductActivity audit event
// ---------------------------------------------------------------------------

/**
 * Compose the ProductActivity row for one filed change request
 * (event_type 'proof_changes_requested' — see the header note on the
 * declared enum; actor classes limited to customer|staff per spec).
 *
 * Unlike validateChangeRequest this does NOT gate on operational_status —
 * callers may build the row from either the pre-patch product (from_value
 * reads 'awaiting_proof_approval') or the post-patch view. Pass
 * arg.from_status to pin the pre-change status explicitly.
 *
 * @param arg.work_order_id — parent link; falls back to
 *        product.work_order_id.
 * @param arg.from_status   — pre-change operational_status for from_value.
 * @param arg.count / change_count — request ordinal for details/dedupe
 *        parity with the notification row.
 * @returns ProductActivity-shaped row | null — null when product is not an
 *          object or the reason is invalid (same reason gate as the patch).
 */
export function changeRequestAuditEvent(product: any, arg: any = {}) {
  if (!isObj(product)) return null;
  const code = norm(arg?.reason_code ?? arg?.reasonCode);
  if (!isReasonCode(code)) return null;
  const text = clean(arg?.reason_text ?? arg?.reasonText);
  if (code === 'other' && !text) return null;

  const stamp = clean(arg?.now) || new Date().toISOString();
  const label = reasonLabel(code);
  const ordinal = requestOrdinal(product, arg);
  const fromStatus =
    clean(arg?.from_status ?? arg?.fromStatus) || clean(product.operational_status);
  const productId = clean(product.id) || clean(product.product_id);
  const note = text ? `${label} — "${text}"` : label;

  return {
    schema_version: 1,
    work_order_id: clean(arg?.work_order_id ?? arg?.workOrderId) || clean(product.work_order_id),
    product_id: productId,
    product_label: proofChangeProductLabel(product, arg?.index ?? arg?.product_index),
    event_type: PROOF_CHANGES_REQUESTED_STATUS,
    actor_type: actorTypeFor(arg?.actor_type ?? arg?.actorType),
    actor_label: clean(arg?.actor_id ?? arg?.actorId ?? arg?.actor_label ?? arg?.actorLabel),
    from_value: fromStatus,
    to_value: PROOF_CHANGES_REQUESTED_STATUS,
    note,
    occurred_at: stamp,
    details: {
      field: 'operational_status',
      field_label: 'Status',
      reason_code: code,
      reason_label: label,
      proof_change_count: ordinal,
      proof_version: intAtLeast0(product.proof_version),
    },
  };
}
