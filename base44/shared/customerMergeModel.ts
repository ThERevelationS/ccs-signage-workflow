// Customer merge model — canonical pure logic (masterplan G-14).
//
// SINGLE SOURCE OF TRUTH for the customer-merge relink sweep. The
// manageCustomerLifecycle Deno function imports this module; the admin dialog
// (src/components/estimator/CustomerMergeDialog.jsx) renders only what the
// function returns. Keep this module dependency-free, IO-free and
// deterministic — it is also bundled into the Node test harness
// (scripts/test-customer-merge.mjs).
//
// ---------------------------------------------------------------------------
// COVERAGE CONTRACT
// ---------------------------------------------------------------------------
// Every entity that declares a top-level `customer_id` (scalar) or
// `customer_ids` (array) property in base44/entities/*.jsonc MUST appear in
// CUSTOMER_RELINK_SPECS. The test harness scans the entity directory and
// fails on drift. Customer-internal references (master_account_id,
// merged_into_customer_id) are covered by the 'customer_ref' spec.
//
// ---------------------------------------------------------------------------
// DECISIONS
// ---------------------------------------------------------------------------
// D1 — SPEC-DRIVEN SWEEP. Relink behavior lives in the CUSTOMER_RELINK_SPECS
//      registry, not in per-entity code. `kind` selects the patch builder:
//        'id'           — scalar id field(s) (always includes customer_id)
//                         rewritten loser -> winner; optional name_fields are
//                         rewritten to the winner's display name.
//        'ids'          — array membership field (customer_ids): loser id is
//                         replaced by the winner id in-place, then deduped.
//        'customer_ref' — Customer rows whose master_account_id /
//                         merged_into_customer_id point at the loser.
//      New customer-keyed entities are added by appending one entry.
// D2 — FROZEN AUDIT LABELS ARE NEVER REWRITTEN. Invoice.customer_display_name,
//      Opportunity.customer_display_name, ChangeOrder.customer_display_name
//      and Order.customer_name are stamped-at-issue / Smartsheet-mirror
//      labels; only their id field is relinked. Live display labels
//      (client_name on estimates / section projects / work orders,
//      CustomerSummary.client_name, CustomerFolderLink.customer_name,
//      CrmSuggestion.customer_name, OpportunityActivity.company_name) DO
//      follow the winner so the UI reads one coherent account.
// D3 — TOMBSTONE, NEVER DELETE. The loser row is kept for audit:
//      merged_into_customer_id = winner, customer_status = 'inactive',
//      merged_at / merged_by stamped, master-account link CLEARED so the
//      tombstone drops out of the master-account tree (D5). Tombstoned
//      customers are excluded from pickers by the existing
//      merged_into_customer_id checks.
// D4 — WINNER'S MASTER ACCOUNT WINS. When both records carry
//      master_account_id, the winner keeps its own parent — the merge never
//      reparents the surviving account. Exception: when the winner's declared
//      master IS the loser (or the winner sits anywhere inside the loser's
//      account subtree), the winner is re-pointed at the loser's own master
//      (grandparent) — leaving it on the loser would dangle onto a tombstone
//      / create a self-parent loop. Rollup fields stay lazy: the master
//      rollup is computed on read by masterAccountModel, so nothing here
//      recomputes totals.
// D5 — CHILDREN RE-PARENT. Customer rows with master_account_id === loser get
//      master_account_id = winner plus the master_account display label.
//      Prior tombstones (merged_into_customer_id === loser) are flattened to
//      point at the final winner — merged_into always resolves to a LIVE
//      record in one hop.
// D6 — RESUME, NOT RESTART. Durable progress rides on the loser row
//      (merge_run{run_key, keep_id, entities{}}). Per-entity completion is
//      stamped as the sweep advances; a retried call with the same run_key
//      skips entities already 'done' and re-runs the rest — per-row filters
//      ({customer_id: loser}) only match rows that still carry the loser id,
//      so re-scanning a finished entity is cheap and never double-applies.
//      The tombstone is written LAST: a merge that stops early leaves the
//      loser live and resumable.
// D7 — EMBEDDED CONTACTS / NOTES / FIELDS STAY ON THE TOMBSTONE. The loser's
//      embedded additional_contacts, notes, addresses etc. are audit history
//      of the retired record — copying them onto the winner would create
//      unreviewed duplicates. First-class contact/location/note ENTITIES are
//      relinked; embedded content is not.
// D8 — CREDIT BALANCE MERGES EAGERLY. Customer.in_store_credit_balance (and
//      its in_store_credit parallel) is the cached authority for store
//      credit, so the winner's cache is raised by the loser's balance —
//      StoreCreditLedger rows are relinked by customer_id like every other
//      entity (the merged account continues under the winner). Per-row
//      balance_after snapshots on moved ledger rows remain the historical
//      record of when credit posted; the derived balance (SUM(amount)) stays
//      correct because it groups by customer_id.
// D9 — LOSER NAME LANDS IN legacy_client_names. The winner keeps its own
//      identity verbatim; the loser's display names are appended to the
//      winner's legacy_client_names so name-matching lookups (imports,
//      Smartsheet reconciliation) still resolve the absorbed account.
// D10 — AUDIT ROW IS RETRY-SAFE. A merge writes ONE OpportunityActivity
//      (standalone CRM event, backend-only, customer_id = winner) with
//      creation_request_key = `custmerge-audit:<run_key>` — a retried merge
//      matches the existing audit row instead of creating a second one.
// ---------------------------------------------------------------------------

export type RelinkKind = 'id' | 'ids' | 'customer_ref';

export interface RelinkSpec {
  entity: string;
  label: string;
  kind: RelinkKind;
  /** Fields that may hold the loser id (multi-field specs run one query per field). */
  match_fields: string[];
  /** Denormalized display fields rewritten to the winner's name (D2). */
  name_fields?: string[];
  /** Optional entity — a hard failure is recorded 'skipped', not 'failed', and never blocks the tombstone. */
  optional?: boolean;
  note?: string;
}

// Canonical sweep order. Business records first, customer-side records next,
// file-bridge/index last, Customer-internal refs at the very end (D5/D6 —
// they must land after every other entity so a partial sweep still leaves a
// clean resume state before the tombstone).
export const CUSTOMER_RELINK_SPECS: RelinkSpec[] = [
  // -- Estimates + owned section projects -----------------------------------
  { entity: 'AllInOneEstimate', label: 'All-in-one estimates', kind: 'id', match_fields: ['customer_id'], name_fields: ['client_name'] },
  { entity: 'BrickStoneProject', label: 'Brick & stone sections', kind: 'id', match_fields: ['customer_id'], name_fields: ['client_name'] },
  { entity: 'CNCProject', label: 'CNC sections', kind: 'id', match_fields: ['customer_id'], name_fields: ['client_name'] },
  { entity: 'ChannelLetterInstallation', label: 'Channel-letter sections', kind: 'id', match_fields: ['customer_id'], name_fields: ['client_name'] },
  { entity: 'CustomItemsProject', label: 'Custom-items sections', kind: 'id', match_fields: ['customer_id'], name_fields: ['client_name'] },
  { entity: 'FoundationProject', label: 'Foundation sections', kind: 'id', match_fields: ['customer_id'], name_fields: ['client_name'] },
  { entity: 'LaserProject', label: 'Laser sections', kind: 'id', match_fields: ['customer_id'], name_fields: ['client_name'] },
  { entity: 'MaintenanceProject', label: 'Maintenance sections', kind: 'id', match_fields: ['customer_id'], name_fields: ['client_name'] },
  { entity: 'MetalProject', label: 'Metal sections', kind: 'id', match_fields: ['customer_id'], name_fields: ['client_name'] },
  { entity: 'Project', label: 'Painting sections', kind: 'id', match_fields: ['customer_id'], name_fields: ['client_name'] },
  { entity: 'VinylProject', label: 'Vinyl sections', kind: 'id', match_fields: ['customer_id'], name_fields: ['client_name'] },
  // -- Workflow + financial records ------------------------------------------
  { entity: 'WorkOrder', label: 'Work orders', kind: 'id', match_fields: ['customer_id'], name_fields: ['client_name'] },
  { entity: 'Order', label: 'Orders', kind: 'id', match_fields: ['customer_id'], note: 'customer_name is the Smartsheet mirror label (D2) — id only.' },
  { entity: 'Invoice', label: 'Invoices', kind: 'id', match_fields: ['customer_id'], note: 'customer_display_name is a frozen issue-time audit label (D2) — id only.' },
  { entity: 'Payment', label: 'Payments', kind: 'id', match_fields: ['customer_id'] },
  { entity: 'ChangeOrder', label: 'Change orders', kind: 'id', match_fields: ['customer_id'], note: 'customer_display_name frozen (D2) — id only.' },
  { entity: 'Opportunity', label: 'Opportunities', kind: 'id', match_fields: ['customer_id'], note: 'customer_display_name is the captured pursuit label (D2) — id only.' },
  { entity: 'EstimatingRequest', label: 'Estimating requests', kind: 'id', match_fields: ['customer_id'] },
  // -- Customer-side records --------------------------------------------------
  { entity: 'CustomerContact', label: 'Contacts', kind: 'id', match_fields: ['customer_id'] },
  { entity: 'CustomerLocation', label: 'Locations', kind: 'id', match_fields: ['customer_id'] },
  { entity: 'CustomerNote', label: 'Notes & flags', kind: 'id', match_fields: ['customer_id'] },
  { entity: 'CustomerPortalLink', label: 'Portal share links', kind: 'id', match_fields: ['customer_id'] },
  { entity: 'PortalMessage', label: 'Portal messages', kind: 'id', match_fields: ['customer_id'] },
  { entity: 'CustomerFolderLink', label: 'Folder links', kind: 'id', match_fields: ['customer_id'], name_fields: ['customer_name'] },
  { entity: 'CustomerSummary', label: 'Customer summaries', kind: 'id', match_fields: ['customer_id'], name_fields: ['client_name'] },
  { entity: 'CrmSuggestion', label: 'CRM suggestions', kind: 'id', match_fields: ['customer_id'], name_fields: ['customer_name'] },
  { entity: 'OpportunityActivity', label: 'CRM activities', kind: 'id', match_fields: ['customer_id'], name_fields: ['company_name'] },
  { entity: 'StoreCreditLedger', label: 'Store-credit ledger', kind: 'id', match_fields: ['customer_id'], note: 'Append-only rows move with the account (D8); per-row balance_after stays the historical record.' },
  { entity: 'Announcement', label: 'Announcements', kind: 'ids', match_fields: ['customer_ids'] },
  // -- File bridge ------------------------------------------------------------
  { entity: 'FileBridgeEvent', label: 'File-bridge events', kind: 'id', match_fields: ['customer_id'] },
  { entity: 'FileBridgeRecent', label: 'File-bridge recent feed', kind: 'id', match_fields: ['customer_id'] },
  { entity: 'FileBridgeUpload', label: 'File-bridge uploads', kind: 'id', match_fields: ['customer_id'] },
  { entity: 'FileIndex', label: 'File index', kind: 'ids', match_fields: ['customer_ids'] },
  // -- Customer-internal references (D5) — LAST so child re-parenting and
  //    tombstone flattening happen after every external entity is clean.
  { entity: 'Customer', label: 'Customer account links', kind: 'customer_ref', match_fields: ['master_account_id', 'merged_into_customer_id'], note: 'Children of the loser re-parent to the winner; prior tombstones flatten to the final winner (D5).' },
];

// Customer-keyed references the sweep deliberately does NOT rewrite — each
// with the reason. The completeness test asserts every skip is documented.
export const SKIPPED_CUSTOMER_REFS: { ref: string; reason: string }[] = [
  { ref: 'OpportunityIntake', reason: 'Keyed by opportunity_id — follows the Opportunity relink transitively; no customer_id field is declared.' },
  { ref: 'PurchaseOrder', reason: 'Vendor purchase order — keyed by vendor_id/work_order_id, no customer_id field exists.' },
  { ref: 'EstimateAcceptance / EstimateSectionAcceptance / EstimateRevision / EstimateQuoteDelivery', reason: 'Keyed by estimate_id — follow the AllInOneEstimate relink transitively.' },
  { ref: 'ProductActivity / ActivityLog / FieldAudit', reason: 'Keyed by work_order_id / entity refs — follow the WorkOrder relink transitively.' },
  { ref: 'PermitLineItem / ChannelLetterInstallEquipment / ChannelLetterInstallInventory / ReconciliationBatch', reason: 'Keyed to a parent record (project / invoice / batch) — follow transitively.' },
  { ref: 'Notification.meta / delivery-plan context', reason: 'customer_id only appears inside free-form JSON payloads, never a queryable field — not safely relinkable.' },
  { ref: 'entities.Activity (customerPortalAction notify path)', reason: 'Undeclared entity name used only by the portal-reply Smartsheet notify shim — a likely defect (probably intended OpportunityActivity). Reported separately rather than swept.' },
  { ref: 'PendingImport / TimeEntry / TimeClockLaborSegment / CustomerInfo', reason: 'Carry client/customer NAME snapshots only — no customer_id to relink; historical labels stay verbatim.' },
  { ref: 'Customer.additional_contacts / embedded fields', reason: 'Embedded content stays on the tombstone as audit history (D7) — copying it would create unreviewed duplicates.' },
];

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export const MERGE_GUARDS = {
  OK: 'ok',
  SAME_CUSTOMER: 'same_customer',
  MISSING_KEEP: 'missing_winner',
  MISSING_LOSE: 'missing_loser',
  KEEP_IS_TOMBSTONE: 'winner_is_tombstone',
  LOSE_MERGED_INTO_KEEP: 'already_merged',
  LOSE_MERGED_OTHER: 'loser_merged_elsewhere',
  CONFLICTING_RUN: 'conflicting_merge_run',
} as const;

export type MergeGuardCode = (typeof MERGE_GUARDS)[keyof typeof MERGE_GUARDS];

export interface MergeGuardVerdict {
  ok: boolean;
  already_merged: boolean;
  code: MergeGuardCode;
  reason: string;
}

const clean = (value: unknown): string => String(value ?? '').trim();
const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// Display-name chain — mirrors the dialog/customerName() convention used
// across customer360 surfaces (company_name first, then looser labels).
export function customerDisplayName(customer: any): string {
  return (
    clean(customer?.company_name) ||
    clean(customer?.display_name) ||
    clean(customer?.customer_name) ||
    clean(customer?.client_name) ||
    'Unnamed customer'
  );
}

// Deterministic run identity for one (winner, loser) pair. Retries of the
// same merge reuse the same key, which is what makes the loser's stored
// merge_run resumable and the audit row idempotent (D6/D10).
export function mergeRunKey(keepId: unknown, loseId: unknown): string {
  return `custmerge:${clean(keepId)}:${clean(loseId)}`;
}

export function mergeAuditRequestKey(runKey: unknown): string {
  return `custmerge-audit:${clean(runKey)}`;
}

// evaluateMergeGuards({keep, lose, runKey}) → verdict. Pure guard matrix —
// the function wires statuses (400/404/409) onto these codes.
//   same_customer            — keep.id === lose.id (also catches a single
//                              blank pair resolving equal)
//   missing_winner / missing_loser — row not loaded / no id
//   winner_is_tombstone      — keep is already merged into something else
//   already_merged           — lose.merged_into_customer_id === keep.id → the
//                              merge previously completed; call is a no-op
//   loser_merged_elsewhere   — lose tombstoned into a DIFFERENT customer
//   conflicting_merge_run    — lose.merge_run names a different target than
//                              this run (an abandoned/in-flight merge into a
//                              different winner; resume that run instead)
export function evaluateMergeGuards({ keep, lose, runKey }: any = {}): MergeGuardVerdict {
  const keepId = clean(keep?.id);
  const loseId = clean(lose?.id);
  const fail = (code: MergeGuardCode, reason: string): MergeGuardVerdict => ({
    ok: false, already_merged: false, code, reason,
  });
  if (keepId && loseId && keepId === loseId) {
    return fail(MERGE_GUARDS.SAME_CUSTOMER, 'A customer cannot be merged into itself.');
  }
  if (!keepId) return fail(MERGE_GUARDS.MISSING_KEEP, 'The customer to keep was not found.');
  if (!loseId) return fail(MERGE_GUARDS.MISSING_LOSE, 'The customer to merge was not found.');
  if (clean(keep?.merged_into_customer_id)) {
    return fail(MERGE_GUARDS.KEEP_IS_TOMBSTONE, 'The customer to keep is itself merged into another record — merge into that record instead.');
  }
  const mergedInto = clean(lose?.merged_into_customer_id);
  if (mergedInto === keepId) {
    return { ok: false, already_merged: true, code: MERGE_GUARDS.LOSE_MERGED_INTO_KEEP, reason: 'This merge already completed.' };
  }
  if (mergedInto) {
    return fail(MERGE_GUARDS.LOSE_MERGED_OTHER, 'The customer to merge is already merged into a different record.');
  }
  const storedRun = lose?.merge_run;
  if (storedRun && typeof storedRun === 'object' && clean(storedRun.status) !== 'done') {
    const storedKeep = clean(storedRun.keep_id);
    const storedKey = clean(storedRun.run_key);
    if (storedKey && runKey && storedKey !== clean(runKey)) {
      return fail(
        MERGE_GUARDS.CONFLICTING_RUN,
        `An unfinished merge into ${storedKeep || 'another customer'} is recorded on this customer — resume or clear that run first.`,
      );
    }
    if (!storedKey && storedKeep && storedKeep !== keepId) {
      return fail(
        MERGE_GUARDS.CONFLICTING_RUN,
        'An unfinished merge into a different customer is recorded on this customer — resume or clear that run first.',
      );
    }
  }
  return { ok: true, already_merged: false, code: MERGE_GUARDS.OK, reason: '' };
}

// ---------------------------------------------------------------------------
// Master-account resolution (D4/D5)
// ---------------------------------------------------------------------------

export interface MasterAccountDecision {
  winner_master_account_id: string;   // master_account_id the winner ends with ('' = root)
  winner_master_label: string;        // display label for that master
  winner_descendant: boolean;         // winner sat inside the loser's subtree
  reparent_children: boolean;         // always true — children of loser re-parent
  loser_master_account_id: string;    // loser's declared master (audit detail)
  keep_master_account_id: string;     // winner's declared master (audit detail)
  note: string;
}

// resolveMasterAccountMerge({keep, lose, customers}) → decision.
// `customers` is every live customer row (or at least the keep/lose ancestor
// chains) — used only to detect whether the winner sits inside the loser's
// account subtree. The walk is seen-set bounded so cyclic data can never hang.
export function resolveMasterAccountMerge({ keep, lose, customers = [] }: any = {}): MasterAccountDecision {
  const keepId = clean(keep?.id);
  const loseId = clean(lose?.id);
  const keepMaster = clean(keep?.master_account_id);
  const loseMaster = clean(lose?.master_account_id);
  const byId = new Map<string, any>();
  for (const c of Array.isArray(customers) ? customers : []) {
    const id = clean(c?.id);
    if (id && !byId.has(id)) byId.set(id, c);
  }
  if (keepId && !byId.has(keepId)) byId.set(keepId, keep);
  if (loseId && !byId.has(loseId)) byId.set(loseId, lose);

  // Walk the winner's ancestor chain; true when it reaches the loser —
  // i.e. the winner is a sub-account of the record being retired.
  let winnerDescendant = false;
  {
    const seen = new Set<string>([keepId]);
    let cur = byId.get(keepId);
    while (cur && clean(cur.master_account_id)) {
      const pid = clean(cur.master_account_id);
      if (seen.has(pid)) break;              // cyclic ancestry — treat as not-descendant
      if (pid === loseId) { winnerDescendant = true; break; }
      seen.add(pid);
      cur = byId.get(pid);
    }
  }

  let winnerMaster = keepMaster;
  let note = "Winner keeps its own master account.";
  if (winnerDescendant) {
    // D4 exception: the winner's parent (or a higher ancestor) is the loser —
    // inheriting the loser's parent preserves the hierarchy without
    // dangling onto the tombstone or creating a self-parent loop.
    const inherited = loseMaster && loseMaster !== keepId && loseMaster !== loseId ? loseMaster : '';
    winnerMaster = inherited;
    note = inherited
      ? 'Winner sat under the loser — re-pointed to the loser\'s master account.'
      : 'Winner sat under the loser — master link cleared (loser had no master).';
  } else if (keepMaster && keepMaster !== loseId) {
    note = 'Winner keeps its own master account (winner\'s account wins).';
  } else if (!keepMaster && loseMaster) {
    // Documented choice: the winner's (empty) account still wins — the merge
    // never reparents the surviving record; the loser's master is surfaced
    // in the audit so staff can re-link deliberately.
    note = 'Winner keeps its (root) position — loser\'s master account recorded in the merge audit.';
  }

  const winnerMasterLabel = winnerMaster
    ? customerDisplayName(byId.get(winnerMaster))
    : '';
  return {
    winner_master_account_id: winnerMaster,
    winner_master_label: winnerMasterLabel,
    winner_descendant: winnerDescendant,
    reparent_children: true,
    loser_master_account_id: loseMaster,
    keep_master_account_id: keepMaster,
    note,
  };
}

// ---------------------------------------------------------------------------
// Per-row relink patches
// ---------------------------------------------------------------------------

// buildRelinkPatch(spec, row, {keepId, keepName, loseId}) → patch object or
// null when the row needs no write (no field currently holds the loser id /
// already points at the winner / is one of the merge parties for
// customer_ref specs). Only fields whose CURRENT value is exactly the loser
// id are rewritten — a multi-field spec never clobbers an unrelated ref.
export function buildRelinkPatch(spec: RelinkSpec, row: any, { keepId, keepName, loseId }: any = {}): Record<string, any> | null {
  if (!spec || !row || typeof row !== 'object') return null;
  const keep = clean(keepId);
  const lose = clean(loseId);
  if (!keep || !lose || keep === lose) return null;
  const rowId = clean(row?.id);

  if (spec.kind === 'customer_ref') {
    // The merge parties are handled by buildWinnerPatch / buildTombstonePatch —
    // rewriting keep.master_account_id here would create a self-parent, and
    // the loser's own master link is cleared by the tombstone (D3/D4).
    if (rowId === keep || rowId === lose) return null;
    const patch: Record<string, any> = {};
    for (const field of spec.match_fields) {
      if (clean(row?.[field]) !== lose) continue;
      patch[field] = keep;
      if (field === 'master_account_id') {
        patch.master_account = clean(keepName);
      }
    }
    return Object.keys(patch).length ? patch : null;
  }

  if (spec.kind === 'ids') {
    const patch: Record<string, any> = {};
    for (const field of spec.match_fields) {
      const list = Array.isArray(row?.[field]) ? row[field] : null;
      if (!list || !list.length) continue;
      const seen = new Set<string>();
      let changed = false;
      const next: string[] = [];
      for (const entry of list) {
        const id = clean(entry);
        if (!id) { changed = true; continue; }
        const mapped = id === lose ? keep : id;
        if (mapped !== id) changed = true;
        if (seen.has(mapped)) { changed = true; continue; }
        seen.add(mapped);
        next.push(mapped);
      }
      if (changed || next.length !== list.length) patch[field] = next;
    }
    return Object.keys(patch).length ? patch : null;
  }

  // kind 'id' — scalar fields.
  const patch: Record<string, any> = {};
  for (const field of spec.match_fields) {
    if (clean(row?.[field]) !== lose) continue;
    patch[field] = keep;
  }
  if (!Object.keys(patch).length) return null;
  for (const field of spec.name_fields || []) {
    const target = clean(keepName);
    if (target && clean(row?.[field]) && clean(row?.[field]) !== target) {
      patch[field] = target;
    }
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Tombstone / winner / audit payloads (D3/D8/D9/D10)
// ---------------------------------------------------------------------------

// Tombstone patch for the loser — written LAST by the sweep (D6).
export function buildTombstonePatch({ keep, lose, actor, at, runKey, progress }: any = {}): Record<string, any> {
  const keepId = clean(keep?.id ?? keep);
  const stamp = clean(at) || new Date().toISOString();
  return {
    merged_into_customer_id: keepId,
    customer_status: 'inactive',
    merged_at: stamp,
    merged_by: clean(actor) || 'unknown',
    // D3/D5 — the tombstone exits the master-account tree.
    master_account_id: '',
    master_account: '',
    merge_run: {
      run_key: clean(runKey),
      keep_id: keepId,
      status: 'done',
      finished_at: stamp,
      actor: clean(actor) || 'unknown',
      entities: progress?.entities || {},
    },
  };
}

// Winner patch — only fields that actually change are included. Carries the
// master-account decision (D4), the merged credit balance (D8) and the
// loser's names folded into legacy_client_names (D9).
export function buildWinnerPatch({ keep, lose, masterDecision }: any = {}): Record<string, any> {
  const patch: Record<string, any> = {};
  const keepId = clean(keep?.id);
  const loseName = customerDisplayName(lose);

  if (masterDecision && typeof masterDecision === 'object') {
    const target = clean(masterDecision.winner_master_account_id);
    if (clean(keep?.master_account_id) !== target) {
      patch.master_account_id = target;
      patch.master_account = target ? clean(masterDecision.winner_master_label) : '';
    }
  }

  const loseCredit = num(lose?.in_store_credit_balance) || num(lose?.in_store_credit);
  if (loseCredit !== 0) {
    const keepBalance = num(keep?.in_store_credit_balance);
    const keepLegacy = num(keep?.in_store_credit);
    const merged = Math.round((keepBalance + loseCredit) * 100) / 100;
    if (merged !== keepBalance) patch.in_store_credit_balance = merged;
    const mergedLegacy = Math.round((keepLegacy + loseCredit) * 100) / 100;
    if (mergedLegacy !== keepLegacy) patch.in_store_credit = mergedLegacy;
  }

  const legacy = new Set<string>(
    (Array.isArray(keep?.legacy_client_names) ? keep.legacy_client_names : [])
      .map(clean).filter(Boolean),
  );
  const before = legacy.size;
  for (const n of [
    lose?.company_name, lose?.display_name, lose?.customer_name, lose?.client_name, loseName,
    ...(Array.isArray(lose?.legacy_client_names) ? lose.legacy_client_names : []),
  ]) {
    const v = clean(n);
    if (v && v !== clean(keep?.company_name)) legacy.add(v);
  }
  if (legacy.size > before) patch.legacy_client_names = [...legacy].sort();

  // Warning flags (N-07.5b residual): union the loser's badges onto the
  // winner and absorb its per-flag audit details for flags the winner lacks.
  const flags = new Set<string>(
    (Array.isArray(keep?.warning_flags) ? keep.warning_flags : [])
      .map(clean).filter(Boolean),
  );
  const flagsBefore = flags.size;
  for (const f of Array.isArray(lose?.warning_flags) ? lose.warning_flags : []) {
    const v = clean(f);
    if (v) flags.add(v);
  }
  if (flags.size > flagsBefore) {
    patch.warning_flags = [...flags].sort();
    const details: Record<string, any> = {
      ...(keep?.warning_flag_details && typeof keep.warning_flag_details === 'object' ? keep.warning_flag_details : {}),
    };
    for (const [k, v] of Object.entries(
      lose?.warning_flag_details && typeof lose.warning_flag_details === 'object' ? lose.warning_flag_details : {},
    )) {
      if (!(k in details)) details[k] = v;
    }
    patch.warning_flag_details = details;
  }
  void keepId;
  return patch;
}

// Audit row (OpportunityActivity, D10) — standalone CRM event on the winner.
export function buildMergeAuditRow({ keep, lose, actor, runKey, status, entities, masterDecision, at }: any = {}): Record<string, any> {
  const keepId = clean(keep?.id);
  const keepName = customerDisplayName(keep);
  const loseName = customerDisplayName(lose);
  const stamp = clean(at) || new Date().toISOString();
  const list = Array.isArray(entities) ? entities : [];
  const relinked = list.reduce((s, e) => s + num(e?.relinked), 0);
  const failed = list.reduce((s, e) => s + num(e?.failed_count ?? (Array.isArray(e?.failures) ? e.failures.length : 0)), 0);
  const touched = list.filter((e) => num(e?.scanned) > 0 || num(e?.relinked) > 0);
  return {
    creation_request_key: mergeAuditRequestKey(runKey),
    event_type: 'customer_merge',
    customer_id: keepId,
    company_name: keepName,
    subject: `Customer merge: ${loseName} → ${keepName}`,
    summary: `Merged ${loseName} into ${keepName} — ${relinked} record${relinked === 1 ? '' : 's'} relinked across ${touched.length} entit${touched.length === 1 ? 'y' : 'ies'}${failed ? `, ${failed} row failure${failed === 1 ? '' : 's'}` : ''}.`,
    actor: clean(actor) || 'unknown',
    outcome: status === 'merged' ? 'completed' : 'partial',
    source: 'customer_merge',
    completed_at: stamp,
    details: {
      run_key: clean(runKey),
      status: clean(status),
      winner: { id: keepId, name: keepName },
      loser: { id: clean(lose?.id), name: loseName },
      master_account: masterDecision ? {
        winner_master_account_id: clean(masterDecision.winner_master_account_id),
        keep_master_account_id: clean(masterDecision.keep_master_account_id),
        loser_master_account_id: clean(masterDecision.loser_master_account_id),
        winner_descendant: masterDecision.winner_descendant === true,
        note: clean(masterDecision.note),
      } : undefined,
      entities: list.map((e) => ({
        entity: clean(e?.entity),
        label: clean(e?.label),
        status: clean(e?.status),
        scanned: num(e?.scanned),
        relinked: num(e?.relinked),
        skipped: num(e?.skipped),
        failed: num(e?.failed_count ?? (Array.isArray(e?.failures) ? e.failures.length : 0)),
      })),
      totals: { relinked, row_failures: failed, entities_touched: touched.length },
    },
  };
}

// ---------------------------------------------------------------------------
// Durable merge progress (D6)
// ---------------------------------------------------------------------------

export type EntityMergeStatus = 'pending' | 'done' | 'failed' | 'skipped';

export interface EntityMergeProgress {
  status: EntityMergeStatus;
  scanned: number;
  relinked: number;
  skipped: number;
  failed_count: number;
  failures: { id: string; error: string }[];
  finished_at?: string;
  error?: string;
}

export interface MergeProgress {
  run_key: string;
  keep_id: string;
  status: 'in_progress' | 'done' | 'partial';
  started_at?: string;
  updated_at?: string;
  actor?: string;
  entities: Record<string, EntityMergeProgress>;
}

// Fresh progress state — or normalization of a stored merge_run blob so a
// resumed run starts from trustworthy shapes only.
export function initialMergeProgress({ runKey, keepId, actor, at, stored }: any = {}): MergeProgress {
  const base: MergeProgress = {
    run_key: clean(runKey),
    keep_id: clean(keepId),
    status: 'in_progress',
    started_at: clean(at) || clean(stored?.started_at) || undefined,
    updated_at: clean(at) || undefined,
    actor: clean(actor) || clean(stored?.actor) || undefined,
    entities: {},
  };
  const storedEntities = stored?.entities;
  if (storedEntities && typeof storedEntities === 'object') {
    for (const [entity, entry] of Object.entries<any>(storedEntities)) {
      if (!entry || typeof entry !== 'object') continue;
      base.entities[entity] = {
        status: (['done', 'failed', 'skipped'] as EntityMergeStatus[]).includes(entry.status) ? entry.status : 'pending',
        scanned: num(entry.scanned),
        relinked: num(entry.relinked),
        skipped: num(entry.skipped),
        failed_count: num(entry.failed_count),
        failures: Array.isArray(entry.failures) ? entry.failures.slice(0, 50) : [],
        finished_at: clean(entry.finished_at) || undefined,
        error: clean(entry.error) || undefined,
      };
    }
  }
  return base;
}

// Next spec to process under the canonical order — skips entities already
// 'done' (or 'skipped') in stored progress. Deterministic: same progress +
// same registry → same next step. Returns null when nothing remains.
export function nextEntityStep(progress: MergeProgress, specs: RelinkSpec[] = CUSTOMER_RELINK_SPECS): RelinkSpec | null {
  const entities = progress?.entities || {};
  for (const spec of specs) {
    const status = entities[spec.entity]?.status;
    if (status === 'done' || status === 'skipped') continue;
    return spec;
  }
  return null;
}

export function recordEntityResult(progress: MergeProgress, spec: RelinkSpec, result: Partial<EntityMergeProgress>, at?: unknown): MergeProgress {
  const entry: EntityMergeProgress = {
    status: (result.status as EntityMergeStatus) || 'done',
    scanned: num(result.scanned),
    relinked: num(result.relinked),
    skipped: num(result.skipped),
    failed_count: num(result.failed_count ?? (Array.isArray(result.failures) ? result.failures.length : 0)),
    failures: Array.isArray(result.failures) ? result.failures.slice(0, 50) : [],
    finished_at: clean(at) || new Date().toISOString(),
    error: clean(result.error) || undefined,
  };
  progress.entities[spec.entity] = entry;
  progress.updated_at = entry.finished_at;
  return progress;
}

// Overall completion: 'done' when every REQUIRED spec is done/skipped;
// 'partial' when at least one required entity finished 'failed'; otherwise
// 'in_progress'.
export function mergeCompletionStatus(progress: MergeProgress, specs: RelinkSpec[] = CUSTOMER_RELINK_SPECS): 'done' | 'partial' | 'in_progress' {
  let sawFailure = false;
  let sawPending = false;
  for (const spec of specs) {
    const status = progress?.entities?.[spec.entity]?.status;
    if (status === 'done' || status === 'skipped') continue;
    if (status === 'failed') {
      if (spec.optional) continue;
      sawFailure = true;
      continue;
    }
    sawPending = true;
  }
  if (sawPending) return 'in_progress';
  return sawFailure ? 'partial' : 'done';
}

// Public per-entity result row for the response/dialog — one entry per spec,
// always in canonical order.
export function entityResultsForResponse(progress: MergeProgress, specs: RelinkSpec[] = CUSTOMER_RELINK_SPECS): any[] {
  return specs.map((spec) => {
    const entry = progress?.entities?.[spec.entity];
    return {
      entity: spec.entity,
      label: spec.label,
      kind: spec.kind,
      status: entry?.status || 'pending',
      scanned: num(entry?.scanned),
      relinked: num(entry?.relinked),
      skipped: num(entry?.skipped),
      failed_count: num(entry?.failed_count),
      failures: Array.isArray(entry?.failures) ? entry.failures.slice(0, 20) : [],
      optional: spec.optional === true,
      note: spec.note,
    };
  });
}
