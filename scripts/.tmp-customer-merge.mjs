// base44/shared/customerMergeModel.ts
var CUSTOMER_RELINK_SPECS = [
  // -- Estimates + owned section projects -----------------------------------
  { entity: "AllInOneEstimate", label: "All-in-one estimates", kind: "id", match_fields: ["customer_id"], name_fields: ["client_name"] },
  { entity: "BrickStoneProject", label: "Brick & stone sections", kind: "id", match_fields: ["customer_id"], name_fields: ["client_name"] },
  { entity: "CNCProject", label: "CNC sections", kind: "id", match_fields: ["customer_id"], name_fields: ["client_name"] },
  { entity: "ChannelLetterInstallation", label: "Channel-letter sections", kind: "id", match_fields: ["customer_id"], name_fields: ["client_name"] },
  { entity: "CustomItemsProject", label: "Custom-items sections", kind: "id", match_fields: ["customer_id"], name_fields: ["client_name"] },
  { entity: "FoundationProject", label: "Foundation sections", kind: "id", match_fields: ["customer_id"], name_fields: ["client_name"] },
  { entity: "LaserProject", label: "Laser sections", kind: "id", match_fields: ["customer_id"], name_fields: ["client_name"] },
  { entity: "MaintenanceProject", label: "Maintenance sections", kind: "id", match_fields: ["customer_id"], name_fields: ["client_name"] },
  { entity: "MetalProject", label: "Metal sections", kind: "id", match_fields: ["customer_id"], name_fields: ["client_name"] },
  { entity: "Project", label: "Painting sections", kind: "id", match_fields: ["customer_id"], name_fields: ["client_name"] },
  { entity: "VinylProject", label: "Vinyl sections", kind: "id", match_fields: ["customer_id"], name_fields: ["client_name"] },
  // -- Workflow + financial records ------------------------------------------
  { entity: "WorkOrder", label: "Work orders", kind: "id", match_fields: ["customer_id"], name_fields: ["client_name"] },
  { entity: "Order", label: "Orders", kind: "id", match_fields: ["customer_id"], note: "customer_name is the Smartsheet mirror label (D2) \u2014 id only." },
  { entity: "Invoice", label: "Invoices", kind: "id", match_fields: ["customer_id"], note: "customer_display_name is a frozen issue-time audit label (D2) \u2014 id only." },
  { entity: "Payment", label: "Payments", kind: "id", match_fields: ["customer_id"] },
  { entity: "ChangeOrder", label: "Change orders", kind: "id", match_fields: ["customer_id"], note: "customer_display_name frozen (D2) \u2014 id only." },
  { entity: "Opportunity", label: "Opportunities", kind: "id", match_fields: ["customer_id"], note: "customer_display_name is the captured pursuit label (D2) \u2014 id only." },
  { entity: "EstimatingRequest", label: "Estimating requests", kind: "id", match_fields: ["customer_id"] },
  // -- Customer-side records --------------------------------------------------
  { entity: "CustomerContact", label: "Contacts", kind: "id", match_fields: ["customer_id"] },
  { entity: "CustomerLocation", label: "Locations", kind: "id", match_fields: ["customer_id"] },
  { entity: "CustomerNote", label: "Notes & flags", kind: "id", match_fields: ["customer_id"] },
  { entity: "CustomerPortalLink", label: "Portal share links", kind: "id", match_fields: ["customer_id"] },
  { entity: "PortalMessage", label: "Portal messages", kind: "id", match_fields: ["customer_id"] },
  { entity: "CustomerFolderLink", label: "Folder links", kind: "id", match_fields: ["customer_id"], name_fields: ["customer_name"] },
  { entity: "CustomerSummary", label: "Customer summaries", kind: "id", match_fields: ["customer_id"], name_fields: ["client_name"] },
  { entity: "CrmSuggestion", label: "CRM suggestions", kind: "id", match_fields: ["customer_id"], name_fields: ["customer_name"] },
  { entity: "OpportunityActivity", label: "CRM activities", kind: "id", match_fields: ["customer_id"], name_fields: ["company_name"] },
  { entity: "StoreCreditLedger", label: "Store-credit ledger", kind: "id", match_fields: ["customer_id"], note: "Append-only rows move with the account (D8); per-row balance_after stays the historical record." },
  { entity: "Announcement", label: "Announcements", kind: "ids", match_fields: ["customer_ids"] },
  // -- File bridge ------------------------------------------------------------
  { entity: "FileBridgeEvent", label: "File-bridge events", kind: "id", match_fields: ["customer_id"] },
  { entity: "FileBridgeRecent", label: "File-bridge recent feed", kind: "id", match_fields: ["customer_id"] },
  { entity: "FileBridgeUpload", label: "File-bridge uploads", kind: "id", match_fields: ["customer_id"] },
  { entity: "FileIndex", label: "File index", kind: "ids", match_fields: ["customer_ids"] },
  // -- Customer-internal references (D5) — LAST so child re-parenting and
  //    tombstone flattening happen after every external entity is clean.
  { entity: "Customer", label: "Customer account links", kind: "customer_ref", match_fields: ["master_account_id", "merged_into_customer_id"], note: "Children of the loser re-parent to the winner; prior tombstones flatten to the final winner (D5)." }
];
var SKIPPED_CUSTOMER_REFS = [
  { ref: "OpportunityIntake", reason: "Keyed by opportunity_id \u2014 follows the Opportunity relink transitively; no customer_id field is declared." },
  { ref: "PurchaseOrder", reason: "Vendor purchase order \u2014 keyed by vendor_id/work_order_id, no customer_id field exists." },
  { ref: "EstimateAcceptance / EstimateSectionAcceptance / EstimateRevision / EstimateQuoteDelivery", reason: "Keyed by estimate_id \u2014 follow the AllInOneEstimate relink transitively." },
  { ref: "ProductActivity / ActivityLog / FieldAudit", reason: "Keyed by work_order_id / entity refs \u2014 follow the WorkOrder relink transitively." },
  { ref: "PermitLineItem / ChannelLetterInstallEquipment / ChannelLetterInstallInventory / ReconciliationBatch", reason: "Keyed to a parent record (project / invoice / batch) \u2014 follow transitively." },
  { ref: "Notification.meta / delivery-plan context", reason: "customer_id only appears inside free-form JSON payloads, never a queryable field \u2014 not safely relinkable." },
  { ref: "entities.Activity (customerPortalAction notify path)", reason: "Undeclared entity name used only by the portal-reply Smartsheet notify shim \u2014 a likely defect (probably intended OpportunityActivity). Reported separately rather than swept." },
  { ref: "PendingImport / TimeEntry / TimeClockLaborSegment / CustomerInfo", reason: "Carry client/customer NAME snapshots only \u2014 no customer_id to relink; historical labels stay verbatim." },
  { ref: "Customer.additional_contacts / embedded fields", reason: "Embedded content stays on the tombstone as audit history (D7) \u2014 copying it would create unreviewed duplicates." }
];
var MERGE_GUARDS = {
  OK: "ok",
  SAME_CUSTOMER: "same_customer",
  MISSING_KEEP: "missing_winner",
  MISSING_LOSE: "missing_loser",
  KEEP_IS_TOMBSTONE: "winner_is_tombstone",
  LOSE_MERGED_INTO_KEEP: "already_merged",
  LOSE_MERGED_OTHER: "loser_merged_elsewhere",
  CONFLICTING_RUN: "conflicting_merge_run"
};
var clean = (value) => String(value ?? "").trim();
var num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
function customerDisplayName(customer) {
  return clean(customer?.company_name) || clean(customer?.display_name) || clean(customer?.customer_name) || clean(customer?.client_name) || "Unnamed customer";
}
function mergeRunKey(keepId, loseId) {
  return `custmerge:${clean(keepId)}:${clean(loseId)}`;
}
function mergeAuditRequestKey(runKey) {
  return `custmerge-audit:${clean(runKey)}`;
}
function evaluateMergeGuards({ keep, lose, runKey } = {}) {
  const keepId = clean(keep?.id);
  const loseId = clean(lose?.id);
  const fail = (code, reason) => ({
    ok: false,
    already_merged: false,
    code,
    reason
  });
  if (keepId && loseId && keepId === loseId) {
    return fail(MERGE_GUARDS.SAME_CUSTOMER, "A customer cannot be merged into itself.");
  }
  if (!keepId) return fail(MERGE_GUARDS.MISSING_KEEP, "The customer to keep was not found.");
  if (!loseId) return fail(MERGE_GUARDS.MISSING_LOSE, "The customer to merge was not found.");
  if (clean(keep?.merged_into_customer_id)) {
    return fail(MERGE_GUARDS.KEEP_IS_TOMBSTONE, "The customer to keep is itself merged into another record \u2014 merge into that record instead.");
  }
  const mergedInto = clean(lose?.merged_into_customer_id);
  if (mergedInto === keepId) {
    return { ok: false, already_merged: true, code: MERGE_GUARDS.LOSE_MERGED_INTO_KEEP, reason: "This merge already completed." };
  }
  if (mergedInto) {
    return fail(MERGE_GUARDS.LOSE_MERGED_OTHER, "The customer to merge is already merged into a different record.");
  }
  const storedRun = lose?.merge_run;
  if (storedRun && typeof storedRun === "object" && clean(storedRun.status) !== "done") {
    const storedKeep = clean(storedRun.keep_id);
    const storedKey = clean(storedRun.run_key);
    if (storedKey && runKey && storedKey !== clean(runKey)) {
      return fail(
        MERGE_GUARDS.CONFLICTING_RUN,
        `An unfinished merge into ${storedKeep || "another customer"} is recorded on this customer \u2014 resume or clear that run first.`
      );
    }
    if (!storedKey && storedKeep && storedKeep !== keepId) {
      return fail(
        MERGE_GUARDS.CONFLICTING_RUN,
        "An unfinished merge into a different customer is recorded on this customer \u2014 resume or clear that run first."
      );
    }
  }
  return { ok: true, already_merged: false, code: MERGE_GUARDS.OK, reason: "" };
}
function resolveMasterAccountMerge({ keep, lose, customers = [] } = {}) {
  const keepId = clean(keep?.id);
  const loseId = clean(lose?.id);
  const keepMaster = clean(keep?.master_account_id);
  const loseMaster = clean(lose?.master_account_id);
  const byId = /* @__PURE__ */ new Map();
  for (const c of Array.isArray(customers) ? customers : []) {
    const id = clean(c?.id);
    if (id && !byId.has(id)) byId.set(id, c);
  }
  if (keepId && !byId.has(keepId)) byId.set(keepId, keep);
  if (loseId && !byId.has(loseId)) byId.set(loseId, lose);
  let winnerDescendant = false;
  {
    const seen = /* @__PURE__ */ new Set([keepId]);
    let cur = byId.get(keepId);
    while (cur && clean(cur.master_account_id)) {
      const pid = clean(cur.master_account_id);
      if (seen.has(pid)) break;
      if (pid === loseId) {
        winnerDescendant = true;
        break;
      }
      seen.add(pid);
      cur = byId.get(pid);
    }
  }
  let winnerMaster = keepMaster;
  let note = "Winner keeps its own master account.";
  if (winnerDescendant) {
    const inherited = loseMaster && loseMaster !== keepId && loseMaster !== loseId ? loseMaster : "";
    winnerMaster = inherited;
    note = inherited ? "Winner sat under the loser \u2014 re-pointed to the loser's master account." : "Winner sat under the loser \u2014 master link cleared (loser had no master).";
  } else if (keepMaster && keepMaster !== loseId) {
    note = "Winner keeps its own master account (winner's account wins).";
  } else if (!keepMaster && loseMaster) {
    note = "Winner keeps its (root) position \u2014 loser's master account recorded in the merge audit.";
  }
  const winnerMasterLabel = winnerMaster ? customerDisplayName(byId.get(winnerMaster)) : "";
  return {
    winner_master_account_id: winnerMaster,
    winner_master_label: winnerMasterLabel,
    winner_descendant: winnerDescendant,
    reparent_children: true,
    loser_master_account_id: loseMaster,
    keep_master_account_id: keepMaster,
    note
  };
}
function buildRelinkPatch(spec, row, { keepId, keepName, loseId } = {}) {
  if (!spec || !row || typeof row !== "object") return null;
  const keep = clean(keepId);
  const lose = clean(loseId);
  if (!keep || !lose || keep === lose) return null;
  const rowId = clean(row?.id);
  if (spec.kind === "customer_ref") {
    if (rowId === keep || rowId === lose) return null;
    const patch2 = {};
    for (const field of spec.match_fields) {
      if (clean(row?.[field]) !== lose) continue;
      patch2[field] = keep;
      if (field === "master_account_id") {
        patch2.master_account = clean(keepName);
      }
    }
    return Object.keys(patch2).length ? patch2 : null;
  }
  if (spec.kind === "ids") {
    const patch2 = {};
    for (const field of spec.match_fields) {
      const list = Array.isArray(row?.[field]) ? row[field] : null;
      if (!list || !list.length) continue;
      const seen = /* @__PURE__ */ new Set();
      let changed = false;
      const next = [];
      for (const entry of list) {
        const id = clean(entry);
        if (!id) {
          changed = true;
          continue;
        }
        const mapped = id === lose ? keep : id;
        if (mapped !== id) changed = true;
        if (seen.has(mapped)) {
          changed = true;
          continue;
        }
        seen.add(mapped);
        next.push(mapped);
      }
      if (changed || next.length !== list.length) patch2[field] = next;
    }
    return Object.keys(patch2).length ? patch2 : null;
  }
  const patch = {};
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
function buildTombstonePatch({ keep, lose, actor, at, runKey, progress } = {}) {
  const keepId = clean(keep?.id ?? keep);
  const stamp = clean(at) || (/* @__PURE__ */ new Date()).toISOString();
  return {
    merged_into_customer_id: keepId,
    customer_status: "inactive",
    merged_at: stamp,
    merged_by: clean(actor) || "unknown",
    // D3/D5 — the tombstone exits the master-account tree.
    master_account_id: "",
    master_account: "",
    merge_run: {
      run_key: clean(runKey),
      keep_id: keepId,
      status: "done",
      finished_at: stamp,
      actor: clean(actor) || "unknown",
      entities: progress?.entities || {}
    }
  };
}
function buildWinnerPatch({ keep, lose, masterDecision } = {}) {
  const patch = {};
  const keepId = clean(keep?.id);
  const loseName = customerDisplayName(lose);
  if (masterDecision && typeof masterDecision === "object") {
    const target = clean(masterDecision.winner_master_account_id);
    if (clean(keep?.master_account_id) !== target) {
      patch.master_account_id = target;
      patch.master_account = target ? clean(masterDecision.winner_master_label) : "";
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
  const legacy = new Set(
    (Array.isArray(keep?.legacy_client_names) ? keep.legacy_client_names : []).map(clean).filter(Boolean)
  );
  const before = legacy.size;
  for (const n of [
    lose?.company_name,
    lose?.display_name,
    lose?.customer_name,
    lose?.client_name,
    loseName,
    ...Array.isArray(lose?.legacy_client_names) ? lose.legacy_client_names : []
  ]) {
    const v = clean(n);
    if (v && v !== clean(keep?.company_name)) legacy.add(v);
  }
  if (legacy.size > before) patch.legacy_client_names = [...legacy].sort();
  const flags = new Set(
    (Array.isArray(keep?.warning_flags) ? keep.warning_flags : []).map(clean).filter(Boolean)
  );
  const flagsBefore = flags.size;
  for (const f of Array.isArray(lose?.warning_flags) ? lose.warning_flags : []) {
    const v = clean(f);
    if (v) flags.add(v);
  }
  if (flags.size > flagsBefore) {
    patch.warning_flags = [...flags].sort();
    const details = {
      ...keep?.warning_flag_details && typeof keep.warning_flag_details === "object" ? keep.warning_flag_details : {}
    };
    for (const [k, v] of Object.entries(
      lose?.warning_flag_details && typeof lose.warning_flag_details === "object" ? lose.warning_flag_details : {}
    )) {
      if (!(k in details)) details[k] = v;
    }
    patch.warning_flag_details = details;
  }
  void keepId;
  return patch;
}
function buildMergeAuditRow({ keep, lose, actor, runKey, status, entities, masterDecision, at } = {}) {
  const keepId = clean(keep?.id);
  const keepName = customerDisplayName(keep);
  const loseName = customerDisplayName(lose);
  const stamp = clean(at) || (/* @__PURE__ */ new Date()).toISOString();
  const list = Array.isArray(entities) ? entities : [];
  const relinked = list.reduce((s, e) => s + num(e?.relinked), 0);
  const failed = list.reduce((s, e) => s + num(e?.failed_count ?? (Array.isArray(e?.failures) ? e.failures.length : 0)), 0);
  const touched = list.filter((e) => num(e?.scanned) > 0 || num(e?.relinked) > 0);
  return {
    creation_request_key: mergeAuditRequestKey(runKey),
    event_type: "customer_merge",
    customer_id: keepId,
    company_name: keepName,
    subject: `Customer merge: ${loseName} \u2192 ${keepName}`,
    summary: `Merged ${loseName} into ${keepName} \u2014 ${relinked} record${relinked === 1 ? "" : "s"} relinked across ${touched.length} entit${touched.length === 1 ? "y" : "ies"}${failed ? `, ${failed} row failure${failed === 1 ? "" : "s"}` : ""}.`,
    actor: clean(actor) || "unknown",
    outcome: status === "merged" ? "completed" : "partial",
    source: "customer_merge",
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
        note: clean(masterDecision.note)
      } : void 0,
      entities: list.map((e) => ({
        entity: clean(e?.entity),
        label: clean(e?.label),
        status: clean(e?.status),
        scanned: num(e?.scanned),
        relinked: num(e?.relinked),
        skipped: num(e?.skipped),
        failed: num(e?.failed_count ?? (Array.isArray(e?.failures) ? e.failures.length : 0))
      })),
      totals: { relinked, row_failures: failed, entities_touched: touched.length }
    }
  };
}
function initialMergeProgress({ runKey, keepId, actor, at, stored } = {}) {
  const base = {
    run_key: clean(runKey),
    keep_id: clean(keepId),
    status: "in_progress",
    started_at: clean(at) || clean(stored?.started_at) || void 0,
    updated_at: clean(at) || void 0,
    actor: clean(actor) || clean(stored?.actor) || void 0,
    entities: {}
  };
  const storedEntities = stored?.entities;
  if (storedEntities && typeof storedEntities === "object") {
    for (const [entity, entry] of Object.entries(storedEntities)) {
      if (!entry || typeof entry !== "object") continue;
      base.entities[entity] = {
        status: ["done", "failed", "skipped"].includes(entry.status) ? entry.status : "pending",
        scanned: num(entry.scanned),
        relinked: num(entry.relinked),
        skipped: num(entry.skipped),
        failed_count: num(entry.failed_count),
        failures: Array.isArray(entry.failures) ? entry.failures.slice(0, 50) : [],
        finished_at: clean(entry.finished_at) || void 0,
        error: clean(entry.error) || void 0
      };
    }
  }
  return base;
}
function nextEntityStep(progress, specs = CUSTOMER_RELINK_SPECS) {
  const entities = progress?.entities || {};
  for (const spec of specs) {
    const status = entities[spec.entity]?.status;
    if (status === "done" || status === "skipped") continue;
    return spec;
  }
  return null;
}
function recordEntityResult(progress, spec, result, at) {
  const entry = {
    status: result.status || "done",
    scanned: num(result.scanned),
    relinked: num(result.relinked),
    skipped: num(result.skipped),
    failed_count: num(result.failed_count ?? (Array.isArray(result.failures) ? result.failures.length : 0)),
    failures: Array.isArray(result.failures) ? result.failures.slice(0, 50) : [],
    finished_at: clean(at) || (/* @__PURE__ */ new Date()).toISOString(),
    error: clean(result.error) || void 0
  };
  progress.entities[spec.entity] = entry;
  progress.updated_at = entry.finished_at;
  return progress;
}
function mergeCompletionStatus(progress, specs = CUSTOMER_RELINK_SPECS) {
  let sawFailure = false;
  let sawPending = false;
  for (const spec of specs) {
    const status = progress?.entities?.[spec.entity]?.status;
    if (status === "done" || status === "skipped") continue;
    if (status === "failed") {
      if (spec.optional) continue;
      sawFailure = true;
      continue;
    }
    sawPending = true;
  }
  if (sawPending) return "in_progress";
  return sawFailure ? "partial" : "done";
}
function entityResultsForResponse(progress, specs = CUSTOMER_RELINK_SPECS) {
  return specs.map((spec) => {
    const entry = progress?.entities?.[spec.entity];
    return {
      entity: spec.entity,
      label: spec.label,
      kind: spec.kind,
      status: entry?.status || "pending",
      scanned: num(entry?.scanned),
      relinked: num(entry?.relinked),
      skipped: num(entry?.skipped),
      failed_count: num(entry?.failed_count),
      failures: Array.isArray(entry?.failures) ? entry.failures.slice(0, 20) : [],
      optional: spec.optional === true,
      note: spec.note
    };
  });
}
export {
  CUSTOMER_RELINK_SPECS,
  MERGE_GUARDS,
  SKIPPED_CUSTOMER_REFS,
  buildMergeAuditRow,
  buildRelinkPatch,
  buildTombstonePatch,
  buildWinnerPatch,
  customerDisplayName,
  entityResultsForResponse,
  evaluateMergeGuards,
  initialMergeProgress,
  mergeAuditRequestKey,
  mergeCompletionStatus,
  mergeRunKey,
  nextEntityStep,
  recordEntityResult,
  resolveMasterAccountMerge
};
