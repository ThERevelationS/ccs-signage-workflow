// Proof-approval due-date recalculation — the deadlineRules
// .recalc_on_proof_approval behavior wrapped around the B-07 engine for the
// E-02 approval write paths (ESTIMATOR_MASTERPLAN E-04). Pure TS: the ONLY
// import is the sibling pure engine ./dueDateEngine.ts — no entity/io reads,
// safe for Deno functions (base44/functions/*) and frontend modules, same
// contract as proofTransitionModel/proofBatchModel/proofFollowUpModel
// (wrapper models import the pure module they wrap; status vocabulary is
// mirrored locally like the other proof models).
//
// THE RULE (CoreBridge parity): when a proof is approved, the product's due
// date is recalculated from production lead days anchored on the approval
// date — but the recalculation ONLY pushes the date forward (a candidate
// earlier than the stored date is clamped, never pulled earlier) and a
// product flagged `hard_due_date` NEVER moves. The B-08 guard
// (assertDueDateMutable) now exists in the engine and is composed in here as
// a second wall: even a caller that turns respect_hard_dates off still has
// to clear the guard — the approval-triggered recalc runs as a non-manual
// actor ('proof_approval' default), so a hard date holds regardless.
//
// HOLD SEMANTICS — "the approval still proceeds": a held result means ONLY
// the due-date fields are frozen. recalcOnProofApprove returns patch:{} on a
// hold and the caller still writes the E-02 approval stamp
// (proofTransitionModel.approveProofPatch) — the product transitions to
// proof_approved on schedule, its due date just stays where the human put
// it. A hold is a NO-OP on date fields, never a block on the transition.
// hold_reason 'hard_due_date' is the machine string the caller can toast
// ("Due date locked — hard due date was not moved").
//
// LEAD-DAY PRECEDENCE (mirrors the legacy
// recalculateProductDueDateOnProofApproval in workOrderConversion.js):
//   - explicit positive `lead_days` + parts → a numeric tier override
//     applied per part (each part's own min-days floor still wins);
//   - explicit positive `lead_days` + no parts → a synthesized single-part
//     lead so the manual override still lands on unlinked products;
//   - no override → the engine resolves per-part product_lead_days /
//     min/std/add bounds under `tier` (default 'standard');
//   - no parts AND no override → no candidate, the stored date stands.
// `parts` defaults to product.parts / part_list / builder_parts — the same
// embedded shapes the engine reads.
//
// ORDER ROLLUP: orderDueAfterApprove recomputes the WorkOrder-level
// due_date as the MAX of OPEN product due dates — open = not deleted, not
// completed:true, and not a terminal operational_status
// (built/completed/voided, legacy spellings folded). A hard-held product's
// STORED date still counts toward the max: holding it in place is not the
// same as removing it from the rollup. The order due is also forward-only
// (the approval can push the job later, never pull it earlier).
//
// PATCH SHAPES — stored WorkOrder.products[] snake_case fields, merged into
// the row by the caller's write path (array-mutation / entity write). These
// are NOT the camelCase input keys of buildProductOperationalPatch:
//   recalc patch    { product_due_date? } — the changed field only; {} on
//                   hold or no change. The engine envelope also carries a
//                   design_due_date candidate off the same anchor — it is
//                   surfaced on the result as a diagnostic but DELIBERATELY
//                   kept out of the patch: E-04's rule recalculates the
//                   PRODUCTION due date (the design work just finished —
//                   pushing design_due_date at approval would falsify the
//                   design clock's own lateness signal, and the design
//                   clock's own triggers own that field).
//   merged patch    approveProofPatch fields + recalc patch keys, one
//                   object → ONE products[] write, no double-write.
//
// API:
//   recalcOnProofApprove(product, {now, lead_days, actor_type, parts, tier,
//                                  clock, design_clock, respect_hard_dates})
//       → {patch, held, hold_reason, due_date, prior_due_date,
//          computed_due_date, design_due_date, pushed, changed,
//          manual_override, warning, actor_type, trace}
//   orderDueAfterApprove(workOrder, product_id, {lead_days, now, actor_type,
//                                                parts, tier, clock})
//       → {order_due_date?, product_patches:[{product_id, patch, held,
//          hold_reason}], product_found, prior_order_due_date,
//          computed_order_due_date, order_pushed, order_held,
//          binding_product_id, trace}
//   recalcSummary(products, results)
//       → {moved:[], held:[], unchanged:[]} — toast-ready buckets.
//   approvalWithRecalc(product, transition_patch, {lead_days, now,
//                                                  actor_type, parts, tier})
//       → the merged patch (approveProofPatch fields + due-date fields in
//         ONE object). Hold metadata rides along as NON-ENUMERABLE props
//         (.held / .hold_reason / .recalc) so the returned object is a clean
//         stored-field patch under spread/Object.keys/JSON.stringify.
//
// ---------------------------------------------------------------------------

import {
  recalcOnProofApproval,
  computeOrderDueDate,
  isHardDue,
  assertDueDateMutable,
  parseDateOnly,
  toLocalDate,
} from './dueDateEngine.ts';

// ---------------------------------------------------------------------------
// Normalization helpers (same conventions as proofTransitionModel /
// proofBatchModel — mirrored, not imported, so this file's only dependency is
// the engine it wraps)
// ---------------------------------------------------------------------------

const norm = (value: any): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const cleanStr = (value: any): string => String(value ?? '').trim();

const finiteNum = (value: any): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const isObject = (value: any): boolean =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// Machine hold vocabulary — the one reason this model can hold.
export const RECALC_HOLD_HARD_DUE = 'hard_due_date';
export const RECALC_HOLD_REASONS = [RECALC_HOLD_HARD_DUE] as const;

// The actor class an approval-triggered recalc runs under. Deliberately NOT
// a member of the engine's DUE_DATE_MANUAL_ACTORS — clicking "approve" is not
// a deliberate date edit, so the B-08 guard reads this as an automatic recalc
// and fails closed on hard dates for any caller that doesn't override it.
export const RECALC_DEFAULT_ACTOR = 'proof_approval';

// Stored products[] field names this model may write (snake_case, the
// products[]-row convention — not the camelCase buildProductOperationalPatch
// input keys). Only product_due_date — the design candidate is a diagnostic
// on the result, never a patch field (see PATCH SHAPES above).
export const RECALC_PATCH_FIELDS = ['product_due_date'] as const;

// Terminal operational_status values — mirrored from the locked
// productStatusModel.TERMINAL_STATUSES (built/completed/voided). Re-declared
// here exactly like proofBatchModel re-declares its status vocabulary so the
// file's single dependency stays the engine. A terminal product's stored due
// date no longer drives the order due date.
const TERMINAL_STATUSES = ['built', 'completed', 'voided'] as const;

// Retired spellings still on stored rows — folded onto the locked set like
// proofBatchModel/proofTransitionModel ('vended' → 'built' keeps legacy
// vended rows out of the open-products rollup).
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
// (operational_status) — the same dual shape the portal/batch models read.
const operationalStatusOf = (product: any): string =>
  canonicalStatus(product?.status_key ?? product?.operational_status);

const productIdOf = (product: any): string =>
  cleanStr(product?.id ?? product?.product_id);

// "Open" for the order-due rollup: alive (not deleted), not flagged
// completed:true (products[] carries its own completed bit — the walk-in
// path flips it when production is done), and not parked in a terminal
// operational status. A blank/unknown status counts as open — older rows
// predate the locked vocabulary and must not silently leave the rollup.
const isOpenProduct = (product: any): boolean =>
  isObject(product) &&
  product.deleted !== true &&
  product.completed !== true &&
  !(TERMINAL_STATUSES as readonly string[]).includes(operationalStatusOf(product));

// Label + id readers for the summary/toast surface.
const productLabelOf = (product: any): string =>
  cleanStr(
    product?.description ??
      product?.client_product_name ??
      product?.customer_description ??
      product?.product_name ??
      product?.product_label,
  );

// Whole-day difference to - from ("YYYY-MM-DD" strings compare and diff at
// day granularity); undefined when either side is unparseable.
const dayDiff = (from: any, to: any): number | undefined => {
  const a = toLocalDate(parseDateOnly(from));
  const b = toLocalDate(parseDateOnly(to));
  if (!a || !b) return undefined;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
};

// ---------------------------------------------------------------------------
// recalcOnProofApprove — the single-product recalc, forward-only, hard-held
// ---------------------------------------------------------------------------

// Recalculate one product's due date for a proof approval.
//   product    a WorkOrder.products[] row (or compatible shape — engine
//              fields: product_due_date / design_due_date / hard_due_date /
//              parts|part_list|builder_parts)
//   now        the approval instant — the recalc anchor (Date | ms |
//              parseable string; defaults to the real clock)
//   lead_days  optional explicit override — see the header's precedence rules
//   actor_type who approved ('customer'|'staff'|…) — passed to the B-08
//              guard verbatim. Defaults to 'proof_approval', a NON-manual
//              actor class: the recalc is automatic, so a hard date holds no
//              matter which surface the approval came from. A caller that
//              deliberately wants the manual-override lane passes a manual
//              actor AND respect_hard_dates:false — the guard then allows
//              the move flagged manual_override (its warning is surfaced for
//              the caller's audit note).
//
// Returns the envelope documented in the header. `patch` carries ONLY
// changed fields: a same-date compute and a hold both return {}.
export function recalcOnProofApprove(product: any, {
  now,
  lead_days,
  actor_type = RECALC_DEFAULT_ACTOR,
  parts,
  tier,
  clock = null,
  design_clock = null,
  respect_hard_dates = true,
}: any = {}) {
  const p = isObject(product) ? product : {};
  const actor = norm(actor_type) || RECALC_DEFAULT_ACTOR;
  const priorProduct = parseDateOnly(p.product_due_date ?? p.due_date);
  const priorDesign = parseDateOnly(p.design_due_date);
  const anchor = now ?? new Date();

  const heldResult = (hold_reason: string, extra: any = {}) => ({
    patch: {},
    held: true,
    hold_reason,
    product_id: productIdOf(p),
    due_date: priorProduct,
    design_due_date: priorDesign,
    prior_due_date: priorProduct,
    computed_due_date: '',
    pushed: false,
    changed: false,
    manual_override: false,
    warning: '',
    actor_type: actor,
    ...extra,
  });

  // 1. THE RULE: a hard_due_date product NEVER moves on an approval recalc.
  //    Held even when the row carries no stored date — writing the first
  //    date is still a move (B-08: blank→date is a move, non-manual actors
  //    fail closed). The approval itself is NOT blocked — patch:{} merges
  //    into the transition patch untouched.
  if (isHardDue(p) && respect_hard_dates !== false) {
    return heldResult(RECALC_HOLD_HARD_DUE, {
      trace: [{ kind: 'hard_date', held: true, due_date: priorProduct, trigger: 'proof_approval' }],
    });
  }

  // 2. Engine compute. Lead-day precedence mirrors the legacy wrapper:
  //    explicit positive lead_days is a numeric tier per part (floors still
  //    win); with no parts it synthesizes a single-part lead; with neither it
  //    resolves per-part bounds under `tier`. push_forward_only is the rule —
  //    always on for the approval trigger.
  const explicit = finiteNum(lead_days);
  const hasOverride = explicit !== undefined && explicit > 0;
  const embedded = parts !== undefined
    ? parts
    : p.parts ?? p.part_list ?? p.builder_parts;
  const hasParts = Array.isArray(embedded) && embedded.length > 0;
  const engine = recalcOnProofApproval({
    product: p,
    approval_date: anchor,
    parts: hasParts ? embedded : hasOverride ? [{ product_lead_days: explicit }] : [],
    clock,
    design_clock,
    tier: tier !== undefined ? tier : hasOverride && hasParts ? explicit : 'standard',
    respect_hard_dates,
    push_forward_only: true,
  });

  // 3. B-08 second wall. Reached only for soft products, or hard products a
  //    caller deliberately un-respected — the guard still fails closed for
  //    non-manual actors and flags manual overrides for audit.
  const verdict = assertDueDateMutable(p, engine.due_date, { actor_type: actor });
  if (!verdict.ok) {
    return heldResult(RECALC_HOLD_HARD_DUE, {
      computed_due_date: engine.computed_due_date,
      warning: verdict.error,
      trace: [...(Array.isArray(engine.trace) ? engine.trace : []), { kind: 'guard', held: true, actor_type: actor }],
    });
  }

  // 4. Changed fields only — a same-date forward-clamp leaves patch empty.
  //    product_due_date is the only field this rule writes (see header); the
  //    engine's design candidate rides the result as a diagnostic.
  const patch: Record<string, string> = {};
  if (engine.due_date && engine.due_date !== priorProduct) patch.product_due_date = engine.due_date;

  return {
    patch,
    held: false,
    hold_reason: '',
    product_id: productIdOf(p),
    due_date: engine.due_date,
    design_due_date: engine.design_due_date,
    prior_due_date: priorProduct,
    computed_due_date: engine.computed_due_date,
    pushed: engine.pushed === true,
    changed: Object.keys(patch).length > 0,
    manual_override: verdict.manual_override === true,
    warning: verdict.warning || '',
    actor_type: actor,
    trace: engine.trace,
  };
}

// ---------------------------------------------------------------------------
// orderDueAfterApprove — order rollup = max of OPEN product due dates
// ---------------------------------------------------------------------------

// Recompute the WorkOrder-level due_date after a product's proof approval.
// The target product is recalculated (recalcOnProofApprove) and contributes
// its POST-recalc date to the rollup; every other OPEN product contributes
// its stored date. A hard-held product's stored date still counts toward
// the max — frozen ≠ absent. The order date itself is forward-only and an
// order-level hard_due_date holds it the same way.
//
//   workOrder   the WO row ({products: [...], due_date?, hard_due_date?});
//               also accepts a bare products[] array.
//   product_id  the products[] id of the product that was just approved.
//   opts        lead_days / now / actor_type / parts / tier / clock /
//               design_clock pass through to recalcOnProofApprove for the
//               target product only.
//
// `order_due_date` is emitted ONLY when the rollup changes the stored
// WorkOrder.due_date — undefined means "nothing to write". `product_patches`
// carries one entry per recalculated product (today: the approved product;
// patch may be {} on a hold/no-op — callers skip empty patches).
export function orderDueAfterApprove(workOrder: any, product_id: any, {
  lead_days,
  now,
  actor_type = RECALC_DEFAULT_ACTOR,
  parts,
  tier,
  clock = null,
  design_clock = null,
  respect_hard_dates = true,
}: any = {}) {
  const wo = isObject(workOrder) ? workOrder : {};
  const products = Array.isArray(wo.products)
    ? wo.products
    : Array.isArray(workOrder)
      ? workOrder
      : [];
  const targetId = cleanStr(product_id);

  // Recalc the approved product; capture its effective (post-recalc) date —
  // the patch value when it moved, the stored date otherwise (held or
  // unchanged both contribute the stored date to the max).
  const product_patches: any[] = [];
  let product_found = false;
  const effective = products.map((product: any, index: number) => {
    if (!isObject(product)) return product;
    const id = productIdOf(product) || `#${index}`;
    if (!targetId || id !== targetId) return product;
    product_found = true;
    const recalc = recalcOnProofApprove(product, {
      now, lead_days, actor_type, parts, tier, clock, design_clock, respect_hard_dates,
    });
    product_patches.push({
      product_id: id,
      index,
      patch: recalc.patch,
      held: recalc.held,
      hold_reason: recalc.hold_reason,
      due_date: recalc.due_date,
      prior_due_date: recalc.prior_due_date,
      computed_due_date: recalc.computed_due_date,
      manual_override: recalc.manual_override,
      warning: recalc.warning,
    });
    if (recalc.patch.product_due_date) {
      return { ...product, product_due_date: recalc.patch.product_due_date };
    }
    return product;
  });

  // Max of OPEN product due dates — terminal/deleted/completed rows do not
  // drive the job date. The order compute is forward-only: an approval can
  // push the job later, never pull it earlier (E-04 verify).
  const existingOrder = parseDateOnly(wo.due_date ?? wo.order_due_date);
  const rollup = computeOrderDueDate({
    products: effective.filter(isOpenProduct),
    existing_due_date: existingOrder,
    hard_due_date: wo.hard_due_date === true,
    respect_hard_dates,
    push_forward_only: true,
    label: 'proof_approval_order_rollup',
  });

  // B-08 second wall on the ORDER date — the same assertDueDateMutable guard
  // the product path applies (N-03.2): a caller passing
  // respect_hard_dates:false cannot un-hold a hard order date under a
  // non-manual actor; manual actors still move it flagged for audit.
  const orderActor = norm(actor_type) || RECALC_DEFAULT_ACTOR;
  const orderVerdict = assertDueDateMutable(
    { hard_due_date: wo.hard_due_date === true, due_date: existingOrder },
    rollup.due_date,
    { actor_type: orderActor },
  );
  const orderBlocked = rollup.changed === true && orderVerdict.ok !== true;

  return {
    order_due_date: rollup.changed && !orderBlocked ? rollup.due_date : undefined,
    product_patches,
    product_found,
    prior_order_due_date: existingOrder,
    computed_order_due_date: rollup.computed_due_date,
    order_pushed: rollup.pushed === true && !orderBlocked,
    order_held: rollup.held_by_hard_date === true || orderBlocked,
    order_manual_override: orderVerdict.manual_override === true,
    order_warning: cleanStr(orderVerdict.warning),
    binding_product_id: rollup.binding_product_id || '',
    trace: [...(Array.isArray(rollup.trace) ? rollup.trace : []),
      { kind: 'guard', held: orderBlocked, actor_type: orderActor }],
  };
}

// ---------------------------------------------------------------------------
// recalcSummary — toast-ready moved / held / unchanged buckets
// ---------------------------------------------------------------------------

// Fold recalc results into the three UX buckets. `results` accepts
// recalcOnProofApprove envelopes, orderDueAfterApprove product_patches
// entries, or a bare array of either (a lone envelope is wrapped). Each row
// gets {product_id, label} plus bucket-specific fields:
//   moved      {…, from, to, days}       — product_due_date actually moved
//   held       {…, due_date, hold_reason}— the hard-date no-op to narrate
//   unchanged  {…, due_date}             — computed but equal to stored
// `products` (products[] array, a WO-like {products:[]}, or an id→product
// map) supplies labels and the pre-patch stored date when a result row
// doesn't carry prior_due_date itself.
export function recalcSummary(products: any, results: any) {
  const list: any[] = (() => {
    if (Array.isArray(results)) return results;
    if (isObject(results) && Array.isArray(results.product_patches)) return results.product_patches;
    if (results) return [results];
    return [];
  })();

  const source: any[] = Array.isArray(products)
    ? products
    : Array.isArray(products?.products)
      ? products.products
      : isObject(products)
        ? Object.values(products)
        : [];
  const byId = new Map<string, any>();
  for (const row of source) {
    if (!isObject(row)) continue;
    const id = productIdOf(row);
    if (id) byId.set(id, row);
  }

  const moved: any[] = [];
  const held: any[] = [];
  const unchanged: any[] = [];

  list.forEach((result: any, index: number) => {
    const r = isObject(result) ? result : {};
    const patch = isObject(r.patch) ? r.patch : {};
    const product = byId.get(cleanStr(r.product_id)) || (isObject(r.product) ? r.product : null);
    const product_id = cleanStr(r.product_id) || (product ? productIdOf(product) : '') || `#${index}`;
    const label = cleanStr(r.label) || productLabelOf(product);
    const to = cleanStr(patch.product_due_date) || parseDateOnly(r.due_date);
    const from = parseDateOnly(r.prior_due_date ?? product?.product_due_date ?? product?.due_date);
    if (r.held === true) {
      held.push({
        product_id,
        label,
        due_date: to || from,
        hold_reason: cleanStr(r.hold_reason) || RECALC_HOLD_HARD_DUE,
      });
      return;
    }
    if (Object.keys(patch).length > 0) {
      moved.push({ product_id, label, from, to, days: dayDiff(from, to) });
      return;
    }
    unchanged.push({ product_id, label, due_date: to || from });
  });

  return { moved, held, unchanged };
}

// ---------------------------------------------------------------------------
// approvalWithRecalc — the E-02 approval stamp + due-date fields, ONE write
// ---------------------------------------------------------------------------

// Merge a proofTransitionModel.approveProofPatch output with the approval
// recalc into a single products[] patch — the two concerns land in ONE write
// so the approve path never writes the row twice (no read-modify-write gap
// for the CAS path either).
//
//   product          the products[] row being approved
//   transition_patch the stored-field patch the caller already built (E-02's
//                    approveProofPatch output, or any equivalent approval
//                    stamp — keys are spread verbatim and ALWAYS win over
//                    recalc fields, though the two write disjoint key sets)
//   opts             same recalc opts as recalcOnProofApprove
//
// The RETURN VALUE IS THE MERGED PATCH — a plain object containing only
// stored-field keys. Hold/diagnostic metadata is attached as NON-ENUMERABLE
// properties so spread, Object.keys, JSON.stringify and entity writes see a
// clean patch:
//   .held         boolean — the hard-date hold fired (date fields frozen)
//   .hold_reason  'hard_due_date' | ''
//   .recalc       the full recalcOnProofApprove envelope (trace included)
// Callers that don't care can spread/write the patch blindly; callers that
// toast read .held (or feed .recalc to recalcSummary).
export function approvalWithRecalc(product: any, transition_patch: any, {
  lead_days,
  now,
  actor_type = RECALC_DEFAULT_ACTOR,
  parts,
  tier,
  clock = null,
  design_clock = null,
  respect_hard_dates = true,
}: any = {}) {
  const recalc = recalcOnProofApprove(product, {
    now, lead_days, actor_type, parts, tier, clock, design_clock, respect_hard_dates,
  });
  const merged: Record<string, any> = {
    ...recalc.patch,
    // The caller's transition patch is spread LAST so an explicitly staged
    // key always beats a computed one (the two write disjoint key sets in
    // practice — approveProofPatch carries no due-date fields).
    ...(isObject(transition_patch) ? transition_patch : {}),
  };
  Object.defineProperties(merged, {
    held: { value: recalc.held, enumerable: false },
    hold_reason: { value: recalc.hold_reason, enumerable: false },
    recalc: { value: recalc, enumerable: false },
  });
  return merged;
}
