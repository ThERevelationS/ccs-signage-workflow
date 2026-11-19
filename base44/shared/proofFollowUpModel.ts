// Proof follow-ups — the H-04 two-stage follow-up machine applied to
// WorkOrder.products[] rows stuck in `awaiting_proof_approval`
// (ESTIMATOR_MASTERPLAN H-06). Pure TS, zero entity/io imports — safe for
// Deno functions and frontend modules, same contract as followUpMachine.
//
// Per-product state: the machine's `follow_up_state` lives on the product
// object as `proof_follow_up_state` — deliberately NOT `follow_up_state`, so
// a product row can never collide with an estimate-level sequence if a whole
// estimate-shaped object is ever evaluated. Every nextStage() call runs on a
// scratch "view" of the product that maps proof_follow_up_state →
// follow_up_state and strips the flat legacy twins (follow_up_stage,
// follow_up_last_sent_at, …) so stray estimate-style fields on the product
// are invisible to the machine.
//
// Status gate (two physical fields → one synthesized `_proof_gate_status`):
//   nextStage() reads exactly one status field, but "proof sent, customer
//   hasn't acted" is an OR across two columns, so each evaluation injects a
//   normalized gate value into the view:
//     sent set     — proof_status 'sent' | 'awaiting_approval'
//                    OR operational_status 'awaiting_proof_approval'
//     terminal set — proof_status 'approved' | 'revision_requested' (the
//                    customer answered; approval or a revision request ends
//                    the sequence) plus every operational_status downstream
//                    of the proof decision (proof_approved → in_production →
//                    … → built/completed/voided, incl. legacy vended /
//                    install_or_removal_only / cancelled spellings).
//   Precedence: any terminal candidate beats any sent candidate — an
//   approved product never fires even if a stale operational_status still
//   says awaiting_proof_approval — and any sent candidate beats an inert
//   one. Everything else (draft/none proof, order_review/site_survey/
//   design_review/in_design/awaiting_customer_action operational states) is
//   a status_gate 'none': the sequence pauses rather than closes, so a proof
//   pulled back to draft and re-sent resumes the same sequence instead of
//   being permanently closed out.
//
// Anchor ("when the proof went to the customer") — resolved per product into
// the synthesized `_proof_anchor_at` view field, in order:
//     proof_sent_at → proof_submitted_at → awaiting_proof_approval_since
//     → operational_status_changed_at → updated_date
//   The first two are the dedicated send stamps this module is built for;
//   awaiting_proof_approval_since / operational_status_changed_at cover rows
//   that entered the window before those stamps existed; updated_date is the
//   spec'd last resort. FU1 freezes the resolved anchor into
//   proof_follow_up_state.anchor_at, so FU2 scheduling stays deterministic
//   even if the product's date fields later move.
//
// Reserved cfg plumbing: productsNeedingProofFollowUp / proofFollowUpBatch
// always set status_field = '_proof_gate_status' and anchor_field =
// '_proof_anchor_at' — caller cfg may override delays and the sent/terminal
// lists, but not those two field names (they are the view's wiring).
//
// API:
//   PROOF_FOLLOW_UP_CFG                       — cfg preset for the machine.
//   productsNeedingProofFollowUp(workOrder, {now, cfg})
//       → [{product, index, decision}] for every product whose nextStage
//         action is not 'none' (send_fu1/send_fu2/close). `decision` is the
//         machine's full result {action, patch, reason, state, due_at?}.
//   proofFollowUpBatch(workOrders, {now, cfg})
//       → flat sweeper rows {work_order_id, product_id, product_label,
//         action, patch, reason} across every order.
//   applyProofFollowUpPatch(product, patch)
//       → product copy with proof_follow_up_state merged in (patch keys
//         win; unknown stored keys preserved). Null patch = no-op copy.
//   proofFollowUpState(product)               — normalized stored state.
//   proofFollowUpGateStatus(product, cfg?)    — the synthesized gate value.

import {
  nextStage,
  followUpState,
  resolveFollowUpConfig,
  FOLLOW_UP_STAGES,
} from './followUpMachine.ts';

// Same clock as H-04: products get the CoreBridge default 7-day FU1 / 14-day
// FU2 schedule unless a caller overrides the delay knobs.
export const PROOF_FOLLOW_UP_SENT_STATUSES = [
  'sent',
  'awaiting_approval',
  'awaiting_proof_approval',
];

// Statuses that close the sequence on the next evaluation. Covers both the
// proof_status vocabulary (approved / revision_requested — an answered
// customer) and every operational_status that means "no longer waiting on
// the customer for this proof", plus defensive legacy/cancel spellings.
export const PROOF_FOLLOW_UP_TERMINAL_STATUSES = [
  'approved',
  'proof_approved',
  'revision_requested',
  'declined',
  'rejected',
  'permitting',
  'in_production',
  'quality_control',
  'service_repair',
  'install_removal_only',
  'install_or_removal_only',
  'vended',
  'built',
  'completed',
  'voided',
  'cancelled',
  'canceled',
];

// Anchor precedence, first parseable wins. See the header comment.
export const PROOF_FOLLOW_UP_ANCHOR_FIELDS = [
  'proof_sent_at',
  'proof_submitted_at',
  'awaiting_proof_approval_since',
  'operational_status_changed_at',
  'updated_date',
];

// Synthesized view fields the machine gates/anchors on. Prefixed so they can
// never collide with a real product column.
const GATE_FIELD = '_proof_gate_status';
const ANCHOR_FIELD = '_proof_anchor_at';

// cfg preset for nextStage — the proof-flavored resolveFollowUpConfig input.
// status_field / anchor_field are view wiring; delays mirror FOLLOW_UP_DEFAULTS.
export const PROOF_FOLLOW_UP_CFG = {
  status_field: GATE_FIELD,
  anchor_field: ANCHOR_FIELD,
  sent_statuses: PROOF_FOLLOW_UP_SENT_STATUSES,
  terminal_statuses: PROOF_FOLLOW_UP_TERMINAL_STATUSES,
  fu1_delay_days: 7,
  fu2_delay_days: 14,
  fu2_after_fu1_days: 7,
};

// Flat legacy keys the machine's followUpState() would otherwise read off
// the product itself — stripped from the view so per-product and
// estimate-level sequences stay isolated.
const LEGACY_STATE_KEYS = [
  'follow_up_stage',
  'follow_up_last_sent_at',
  'follow_up_next_due_at',
  'follow_up_anchor_at',
  'follow_up_fu1_sent_at',
  'follow_up_fu2_sent_at',
  'follow_up_answered_at',
  'follow_up_closed_reason',
];

// Status normalization stronger than the machine's (folds spaces/hyphens to
// underscores) — the synthesized gate value must land inside the lowercase
// cfg sets under the machine's plain trim/lowercase compare.
const normStatus = (value: any): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const toInstant = (value: any): number | null => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const v = String(value ?? '').trim();
  if (!v) return null;
  // Date-only parses as local midnight — repo convention (followUpMachine,
  // dueDateEngine).
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
};

const toIso = (t: number): string => new Date(t).toISOString();

// Resolved cfg = PROOF_FOLLOW_UP_CFG + caller overrides, with the two view
// field names pinned last (overriding them would silently detach the
// gate/anchor wiring).
const resolveProofCfg = (cfg: any = {}) => ({
  ...PROOF_FOLLOW_UP_CFG,
  ...cfg,
  status_field: GATE_FIELD,
  anchor_field: ANCHOR_FIELD,
});

// The two-field OR gate collapsed into the single status value the machine
// reads. Terminal beats sent beats first-non-empty raw — see header.
export function proofFollowUpGateStatus(product: any = {}, cfg: any = {}) {
  const resolved = resolveFollowUpConfig(resolveProofCfg(cfg));
  const candidates = [normStatus(product?.proof_status), normStatus(product?.operational_status)];
  for (const c of candidates) {
    if (c && resolved.terminal_statuses.includes(c)) return c;
  }
  for (const c of candidates) {
    if (c && resolved.sent_statuses.includes(c)) return c;
  }
  return candidates.find(Boolean) ?? '';
}

// First parseable anchor per PROOF_FOLLOW_UP_ANCHOR_FIELDS → ISO or null.
export function proofFollowUpAnchor(product: any = {}): string | null {
  for (const field of PROOF_FOLLOW_UP_ANCHOR_FIELDS) {
    const ms = toInstant(product?.[field]);
    if (ms !== null) return toIso(ms);
  }
  return null;
}

// Normalized stored sequence state for one product (follow_up_state shape;
// stage vocabulary is FOLLOW_UP_STAGES).
export function proofFollowUpState(product: any = {}) {
  return followUpState({ follow_up_state: product?.proof_follow_up_state });
}

// Scratch record the machine actually sees: the product's fields, with the
// per-product state mapped into follow_up_state, estimate-style flat state
// keys removed, and the synthesized gate/anchor injected.
const machineView = (product: any, resolved: any) => {
  const view: any = { ...(product ?? {}) };
  for (const key of LEGACY_STATE_KEYS) delete view[key];
  view.follow_up_state = product?.proof_follow_up_state ?? null;
  view[GATE_FIELD] = proofFollowUpGateStatus(product, resolved);
  const anchor = proofFollowUpAnchor(product);
  if (anchor !== null) view[ANCHOR_FIELD] = anchor;
  else delete view[ANCHOR_FIELD];
  return view;
};

// One machine evaluation for one product. Returns the full nextStage result.
export function proofFollowUpDecision(product: any, { now, cfg }: any = {}) {
  const resolved = resolveProofCfg(cfg);
  return nextStage({ record: machineView(product, resolved), now, cfg: resolved });
}

// Every product in the order whose machine action is not 'none' —
// {product, index, decision}. 'close' rows are included: the sweeper must
// persist them so terminal products stop evaluating. Orders that are gone
// (deleted) or finished (completed) produce no rows at all.
export function productsNeedingProofFollowUp(workOrder: any, { now, cfg }: any = {}) {
  if (!workOrder || workOrder.deleted === true || workOrder.completed === true) return [];
  const resolved = resolveProofCfg(cfg);
  const products = Array.isArray(workOrder.products) ? workOrder.products : [];
  const rows: any[] = [];
  products.forEach((product: any, index: number) => {
    if (!product || typeof product !== 'object' || Array.isArray(product)) return;
    const decision = nextStage({ record: machineView(product, resolved), now, cfg: resolved });
    if (decision.action !== 'none') rows.push({ product, index, decision });
  });
  return rows;
}

const productLabel = (product: any, index: number): string => {
  const label =
    product?.description ??
    product?.client_product_name ??
    product?.customer_description ??
    product?.product_type;
  const v = String(label ?? '').trim();
  return v || `Product ${index + 1}`;
};

// Flat sweeper batch across orders — one row per actionable product:
// {work_order_id, product_id, product_label, action, patch, reason}.
export function proofFollowUpBatch(workOrders: any, { now, cfg }: any = {}) {
  const orders = Array.isArray(workOrders) ? workOrders : workOrders ? [workOrders] : [];
  const rows: any[] = [];
  for (const wo of orders) {
    for (const { product, index, decision } of productsNeedingProofFollowUp(wo, { now, cfg })) {
      rows.push({
        work_order_id: wo?.id ?? null,
        product_id: String(product?.id ?? `${wo?.id ?? 'unknown'}:${index}`),
        product_label: productLabel(product, index),
        action: decision.action,
        patch: decision.patch,
        reason: decision.reason,
      });
    }
  }
  return rows;
}

// Persist shape — merges patch over existing proof_follow_up_state (patch
// keys win; unknown stored keys survive; every normalized key is explicitly
// set by the machine, nulls included). Null patch is a no-op copy so the
// sweeper can apply unconditionally.
export function applyProofFollowUpPatch(product: any, patch: any) {
  if (!product || typeof product !== 'object') return product;
  if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) return { ...product };
  const existing =
    product.proof_follow_up_state && typeof product.proof_follow_up_state === 'object' && !Array.isArray(product.proof_follow_up_state)
      ? product.proof_follow_up_state
      : {};
  return { ...product, proof_follow_up_state: { ...existing, ...patch } };
}

export { FOLLOW_UP_STAGES };
