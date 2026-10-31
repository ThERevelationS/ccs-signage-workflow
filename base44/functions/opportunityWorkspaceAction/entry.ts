import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import { withEntityRateLimitRetry } from "../../shared/entityRateLimitRetry.ts";
import { processWorkflowTriggerEvent } from "../../shared/workflowTriggerEngine.ts";
import { loadAllEntityRows } from "../../shared/pagedEntityRows.ts";
import {
  createFoundationRecordWithRecovery,
  expectedFoundationFields,
  replaceFoundationFieldsIfUnchanged,
  replaceEstimatingRequestFieldsIfUnchanged,
} from "../../shared/opportunityFoundationPersistence.mjs";

// Emitting an automation event must never break the workspace action itself â€”
// a failed rule evaluation is a missed notification, not a failed save.
async function emitOpportunityAutomation(base44: any, eventType: string, opportunityId: string, actor: string) {
  try {
    await processWorkflowTriggerEvent({
      base44,
      payload: { event_type: eventType, record: { id: opportunityId } },
      changedByOverride: actor,
    });
  } catch (error: any) {
    console.error(`Opportunity automation emit failed for ${eventType}:`, error?.message || error);
  }
}

const clean = (value: any) => String(value ?? "").trim();
const num = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const money = (value: number) => Math.round(value * 100) / 100;

// Row-array coercion shared by EVERY action block. It used to be declared
// inside attention_feed only, so every earlier action that called list()
// (send_digest, bulk_remarkup, export/import_estimate, copy_bom,
// copy_sections) threw a ReferenceError the first time it ran.
const list = (v: any) => (Array.isArray(v) ? v : []);

// Server-side search pushdown (same shape as functions/fleetSearch): escape
// the user term, then $or it across the searchable fields.
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regexOr = (fields: string[], term: string) => ({
  $or: fields.map((field) => ({ [field]: { $regex: escapeRegex(term), $options: "i" } })),
});

// Module-scope row cache for attention_feed — that action reads 12 tables
// per call and every signed-in tab polls it on a timer, which was the
// largest steady drain on the shared service-token entity_list budget.
// Isolates persist across invocations under load, exactly when the extra
// reads hurt most; data freshness stays within ~2 minutes.
let attentionFeedRowsCache: { rows: any[]; expires: number } | null = null;
const ATTENTION_FEED_CACHE_MS = 120_000;

const STAGES = ["new", "qualified", "estimating", "quoted", "follow_up", "on_hold", "won", "lost"];
const CLOSED_STAGES = new Set(["won", "lost"]);
const REQUIREMENT_VALUES = ["unknown", "yes", "no", "maybe", "na"];
const PRIORITIES = ["low", "normal", "high", "rush"];
const SOURCE_TYPES = [
  "manual", "existing_customer", "phone", "email", "website",
  "smartsheet", "repeat_customer", "walk_in", "historical", "integration",
];
const OPEN_REQUEST_STATUSES = new Set(["draft", "ready", "in_progress"]);
const OPP_TO_WO_STAGE: Record<string, string> = {
  new: "lead", qualified: "lead", estimating: "lead",
  quoted: "quoted", follow_up: "follow_up", on_hold: "on_hold",
  won: "won", lost: "lost",
};

const REQUIREMENT_FIELDS = [
  "survey_requirement", "permit_requirement", "installation_requirement",
  "removal_requirement", "electrical_requirement",
];

const EDITABLE_OPPORTUNITY_FIELDS = [
  "title", "job_description", "customer_display_name", "customer_id",
  "contact_id", "location_id",
  "stage", "lost_reason",
  "salesperson", "lead_source", "origination",
  "budget_amount", "budget_note",
  "desired_completion_date", "desired_install_date", "priority",
  ...REQUIREMENT_FIELDS,
  "electrical_details", "property_relationship",
  "next_action", "next_action_due", "next_action_assignee", "notes",
];

// Watch rules may only target workflow-state fields on business records.
// check_watches reads through the service role and returns the raw value, so
// anything outside this allowlist (credentials, tokens, settings) is refused.
const WATCHABLE_FIELDS: Record<string, string[]> = {
  AllInOneEstimate: ["status"],
  Opportunity: ["stage"],
  EstimatingRequest: ["status"],
  WorkOrder: ["current_stage", "sales_status"],
  Order: ["status"],
};
const isWatchable = (entity: any, field: any) =>
  Object.prototype.hasOwnProperty.call(WATCHABLE_FIELDS, entity) &&
  WATCHABLE_FIELDS[entity].includes(field);

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { statusCode: status });

const QUOTE_OUT_STATUSES = new Set(["sent", "approved"]);

async function logActivity(Activity: any, args: any) {
  try {
    const key = `act:${args.event_type}:${args.opportunity_id}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    await Activity.create({
      creation_request_key: key,
      opportunity_id: clean(args.opportunity_id),
      event_type: args.event_type,
      summary: clean(args.summary),
      actor: clean(args.actor) || "unknown",
      details: args.details && typeof args.details === "object" ? args.details : {},
    });
  } catch (error: any) {
    console.error("opportunity activity log failed:", error?.message || error);
  }
}

async function reconcileEstimatingRequest({ EstimatingRequest, Estimate, request }: any) {
  if (!OPEN_REQUEST_STATUSES.has(clean(request?.status))) return { request, completed: false };
  const estimateId = clean(request?.estimate_id);
  if (!estimateId) return { request, completed: false };
  const estimate = await Estimate.get(estimateId).catch(() => null);
  // A trashed estimate never closes an open estimating request â€” the request
  // stays open until a live estimate actually goes to the customer.
  if (!estimate?.id || estimate?.deleted === true || !QUOTE_OUT_STATUSES.has(clean(estimate.status))) return { request, completed: false };
  const now = new Date().toISOString();
  const desired = { status: "completed", completed_at: now };
  const saved = await replaceEstimatingRequestFieldsIfUnchanged({
    entity: EstimatingRequest,
    recordId: clean(request.id),
    expectedFields: expectedFoundationFields(request, desired),
    nextFields: desired,
    label: "Estimating request completion",
  });
  return { request: saved, completed: true, estimate_status: clean(estimate.status) };
}

async function syncWorkOrderStage(WorkOrder: any, workOrderId: any, stage: any) {
  const next = OPP_TO_WO_STAGE[clean(stage)];
  const wo = await WorkOrder.get(clean(workOrderId)).catch(() => null);
  if (!next || !wo?.id || clean(wo.sales_status) === next) return "";
  const desired = { sales_status: next };
  await replaceFoundationFieldsIfUnchanged({
    entity: WorkOrder,
    recordId: clean(wo.id),
    expectedFields: expectedFoundationFields(wo, desired),
    nextFields: desired,
    label: "Work order sales status",
  });
  return next;
}

function requireEnum(value: any, allowed: string[], label: string) {
  const v = clean(value);
  if (!v) return "";
  if (!allowed.includes(v)) throw bad(`${label} must be one of ${allowed.join(", ")}.`);
  return v;
}

function pick(source: any, keys: string[]) {
  const out: any = {};
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return out;
}

function expectedFor(baseline: any, current: any, desired: any) {
  const expected: any = {};
  for (const key of Object.keys(desired)) {
    expected[key] = baseline && Object.prototype.hasOwnProperty.call(baseline, key)
      ? baseline[key]
      : current?.[key];
  }
  return expected;
}

async function findByCreationKey(entity: any, key: string) {
  const rows = await entity.filter({ creation_request_key: clean(key) });
  if (!Array.isArray(rows)) throw bad("Creation receipt lookup did not return a record list.", 409);
  return rows;
}

function buildHandoffSnapshot({ opportunity, customer, primaryIntake }: any) {
  const captured = primaryIntake?.captured_fields && typeof primaryIntake.captured_fields === "object"
    ? primaryIntake.captured_fields
    : {};
  return {
    snapshot_version: 1,
    opportunity_id: clean(opportunity?.id),
    customer_id: clean(customer?.id || opportunity?.customer_id),
    customer_display_name: clean(customer?.company_name || opportunity?.customer_display_name),
    customer_verified: Boolean(clean(customer?.id)),
    contact_id: clean(opportunity?.contact_id),
    location_id: clean(opportunity?.location_id),
    title: clean(opportunity?.title),
    job_description: clean(opportunity?.job_description),
    salesperson: clean(opportunity?.salesperson),
    lead_source: clean(opportunity?.lead_source),
    origination: clean(opportunity?.origination),
    budget_amount: opportunity?.budget_amount ?? null,
    budget_note: clean(opportunity?.budget_note),
    desired_completion_date: clean(opportunity?.desired_completion_date),
    desired_install_date: clean(opportunity?.desired_install_date),
    priority: clean(opportunity?.priority) || "normal",
    survey_requirement: clean(opportunity?.survey_requirement) || "unknown",
    permit_requirement: clean(opportunity?.permit_requirement) || "unknown",
    installation_requirement: clean(opportunity?.installation_requirement) || "unknown",
    removal_requirement: clean(opportunity?.removal_requirement) || "unknown",
    electrical_requirement: clean(opportunity?.electrical_requirement) || "unknown",
    electrical_details: clean(opportunity?.electrical_details),
    property_relationship: clean(opportunity?.property_relationship) || "unknown",
    next_action: clean(opportunity?.next_action),
    next_action_due: clean(opportunity?.next_action_due),
    next_action_assignee: clean(opportunity?.next_action_assignee),
    notes: clean(opportunity?.notes),
    captured_contact_name: clean(captured.contact_name),
    captured_contact_email: clean(captured.contact_email),
    captured_contact_phone: clean(captured.contact_phone),
    captured_site_address: clean(captured.site_address || captured.install_location),
    attachment_refs: Array.isArray(opportunity?.attachment_refs) ? opportunity.attachment_refs : [],
    primary_intake_id: clean(primaryIntake?.id || opportunity?.source_primary_intake_id),
    source_type: clean(primaryIntake?.source_type),
    compatibility_work_order_id: clean(opportunity?.compatibility_work_order_id),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || "unknown";
    const action = clean(body?.action);
    if (!action) throw bad("An action is required.");

    const Opportunity = base44.asServiceRole.entities.Opportunity;
    const Intake = base44.asServiceRole.entities.OpportunityIntake;
    const EstimatingRequest = base44.asServiceRole.entities.EstimatingRequest;
    const Customer = base44.asServiceRole.entities.Customer;
    const CustomerContact = base44.asServiceRole.entities.CustomerContact;
    const CustomerLocation = base44.asServiceRole.entities.CustomerLocation;
    const WorkOrder = base44.asServiceRole.entities.WorkOrder;
    const Order = base44.asServiceRole.entities.Order;
    const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
    const Invoice = base44.asServiceRole.entities.Invoice;
    const PurchaseOrder = base44.asServiceRole.entities.PurchaseOrder;
    const ChangeOrder = base44.asServiceRole.entities.ChangeOrder;
    const Payment = base44.asServiceRole.entities.Payment;
    const Inventory = base44.asServiceRole.entities.Inventory;
    const PermitLineItem = base44.asServiceRole.entities.PermitLineItem;
    const BuilderPart = base44.asServiceRole.entities.BuilderPart;
    const Activity = base44.asServiceRole.entities.OpportunityActivity;
    const PortalMessage = base44.asServiceRole.entities.PortalMessage;

    // Full-data backup (#484): every real entity dumped to a JSON bundle.
    // Admin-only — this exposes customer/estimate/inventory/admin records.
    if (action === "full_backup") {
      if (clean(user?.role) !== "admin") throw bad("Only administrators can export a full backup.", 403);
      const SKIP = /^(Nope|Temp|Oops|DO_NOT_USE|__|_noop|_never_use|_CheckpointMistake|_invalid|_do_not)/i;
      const entities = base44.asServiceRole.entities as any;
      const names: string[] = [];
      // Enumerate the entity registry — filter the junk/test entities.
      for (const name of Object.keys(entities)) {
        if (!SKIP.test(name)) names.push(name);
      }
      const bundle: Record<string, any[]> = {};
      const errors: Record<string, string> = {};
      const rowCounts: Record<string, number> = {};
      for (const name of names) {
        try {
          // Full-table paged read — a default filter({}) silently caps at 50
          // rows, which made this "full" backup drop data without any error.
          const rows = await loadAllEntityRows({
            entity: entities[name],
            sort: "created_date",
            maxRows: 250000,
            label: `Backup read for ${name}`,
          });
          bundle[name] = rows;
          rowCounts[name] = rows.length;
        } catch (e: any) {
          errors[name] = e?.message || 'read failed';
        }
      }
      const totalRows = Object.values(rowCounts).reduce((sum, count) => sum + count, 0);
      return Response.json({ success: true, action, exported_at: new Date().toISOString(), entity_count: names.length, entities: bundle, errors, row_counts: rowCounts, total_rows: totalRows });
    }

    // Email digest (#333): compiles the attention-feed buckets for the
    // requester and sends a summary via sendGmail. Opt-in is recorded
    // client-side; a scheduler can invoke this per opted-in user.
    if (action === "send_digest") {
      const email = clean(user?.email);
      if (!email) throw bad("A signed-in user is required for a digest.", 400);
      const today = clean(body?.today) || new Date().toISOString().slice(0, 10);
      // Paged full reads — the digest counts every open/overdue row, so a
      // capped read under-reports the very counts the email exists to send.
      const [requests, invoices, sentEstimates, opps] = await Promise.all([
        loadAllEntityRows({ entity: EstimatingRequest, sort: "-created_date", label: "Digest estimating requests" }).catch(() => []),
        loadAllEntityRows({ entity: Invoice, sort: "-created_date", label: "Digest invoices" }).catch(() => []),
        loadAllEntityRows({ entity: Estimate, query: { status: "sent" }, sort: "-updated_date", label: "Digest sent estimates" }).catch(() => []),
        loadAllEntityRows({ entity: Opportunity, sort: "-created_date", label: "Digest opportunities" }).catch(() => []),
      ]);
      const openRequests = list(requests).filter((r) => OPEN_REQUEST_STATUSES.has(clean(r?.status))).length;
      const overdueInv = list(invoices).filter((i) => num(i?.balance_due) > 0 && ["sent", "partially_paid"].includes(clean(i?.status)) && clean(i?.due_date) && clean(i?.due_date) < today).length;
      const staleSent = list(sentEstimates).filter((e) => clean(e?.status) === "sent" && clean(e?.updated_date) && Math.floor((Date.parse(today) - Date.parse(clean(e?.updated_date))) / 86400000) >= 7).length;
      const overdueFollowUps = list(opps).filter((o) => !CLOSED_STAGES.has(clean(o?.stage)) && clean(o?.next_action_due) && clean(o?.next_action_due) < today).length;
      const unassigned = list(requests).filter((r) => OPEN_REQUEST_STATUSES.has(clean(r?.status)) && !clean(r?.assigned_estimator) && !clean(r?.estimator)).length;
      const rows = [
        ["Open estimating requests", openRequests],
        ["Unassigned requests", unassigned],
        ["Overdue invoices", overdueInv],
        ["Stale sent quotes (7d+)", staleSent],
        ["Overdue follow-ups", overdueFollowUps],
      ];
      const html = `<h2 style="font-family:sans-serif;color:#111">Your daily attention digest</h2><p style="font-family:sans-serif;color:#555">Open items needing attention as of ${today}:</p><ul style="font-family:sans-serif;color:#111">${rows.map(([l, c]) => `<li><strong>${l}:</strong> ${c}</li>`).join("")}</ul><p style="font-family:sans-serif;color:#999;font-size:12px">Open CCS Signage Workflow - attention feed for details.</p>`;
      const sendRes = await base44.asServiceRole.functions.invoke("sendGmail", { to: email, subject: `CCS daily digest - ${today}`, body: html }).catch(() => null);
      return Response.json({ success: true, action, to: email, sent: !!sendRes, counts: Object.fromEntries(rows) });
    }

    // User-defined watch rules (#349): "tell me when X reaches state Y".
    // Rules persist on the GlobalSettings `watch_rules` config keyed by the
    // caller's email; the dispatcher (`check_watches` — called on feed load)
    // returns matching rules so the UI can surface "watch hit" notifications.
    const GlobalSettings = base44.asServiceRole.entities.GlobalSettings;
    const loadWatchConfig = async () => {
      const rows = await GlobalSettings.filter({ config_name: "watch_rules" }).catch(() => []);
      const row = Array.isArray(rows) && rows.length ? rows[0] : null;
      let map: Record<string, any[]> = {};
      try { map = JSON.parse(String(row?.watch_rules || "{}") || "{}"); } catch { map = {}; }
      return { row, map };
    };
    if (action === "set_watch") {
      const { row, map } = await loadWatchConfig();
      const key = clean(user?.email) || actor;
      if (!key) throw bad("A signed-in user is required to watch a record.", 400);
      const rule = {
        entity: clean(body?.entity),
        record_id: clean(body?.record_id),
        field: clean(body?.field),
        equals: body?.value != null ? String(body.value) : null,
        label: clean(body?.label),
      };
      if (!rule.entity || !rule.record_id || !rule.field) throw bad("entity, record_id and field are required to watch a record.", 400);
      if (!isWatchable(rule.entity, rule.field)) throw bad("That field cannot be watched.", 400);
      map[key] = (map[key] || []).filter((w: any) => !(w.entity === rule.entity && w.record_id === rule.record_id && w.field === rule.field));
      map[key].push(rule);
      if (row) await GlobalSettings.update(row.id, { watch_rules: JSON.stringify(map) });
      else await GlobalSettings.create({ config_name: "watch_rules", watch_rules: JSON.stringify(map) });
      return Response.json({ success: true, action, rule, count: map[key].length });
    }
    if (action === "list_watches") {
      const { map } = await loadWatchConfig();
      const key = clean(user?.email) || actor;
      return Response.json({ success: true, action, watches: map[key] || [] });
    }
    if (action === "clear_watch") {
      const { row, map } = await loadWatchConfig();
      const key = clean(user?.email) || actor;
      const idx = Number(body?.index);
      if (!Number.isInteger(idx)) throw bad("A watch index is required.", 400);
      map[key] = (map[key] || []).filter((_: any, i: number) => i !== idx);
      if (row) await GlobalSettings.update(row.id, { watch_rules: JSON.stringify(map) });
      return Response.json({ success: true, action, watches: map[key] });
    }
    // Evaluate the caller's watched records and surface any that match.
    // Call on feed load — cheap because most users have 0 watches.
    if (action === "check_watches") {
      const { map } = await loadWatchConfig();
      const key = clean(user?.email) || actor;
      const hits: any[] = [];
      for (const w of (map[key] || [])) {
        if (!isWatchable(w?.entity, w?.field)) continue;
        try {
          const rec = await (base44.asServiceRole.entities as any)[w.entity]?.filter({ id: w.record_id }).catch(() => []);
          const row0 = Array.isArray(rec) ? rec[0] : rec;
          const cur = row0 ? String(row0[w.field] ?? "") : null;
          if (cur != null && (w.equals == null || cur === w.equals)) hits.push({ ...w, current: cur });
        } catch { /* unreadable entity — skip */ }
      }
      return Response.json({ success: true, action, hits });
    }

    // Bulk re-markup flag (#145): when a pricing tier changes, flag all open
    // estimates on that tier as pricing-stale so they recompute on next open.
    // A true recompute is client-side (applyMarkups) — this propagates the
    // "your tier changed" signal; saving the estimate clears it.
    if (action === "bulk_remarkup") {
      if (clean(user?.role) !== "admin") throw bad("Only administrators can re-markup estimates.", 403);
      const tier = num(body?.tier_number);
      if (!tier) throw bad("tier_number is required.", 400);
      // Paged read of every estimate on the tier — the old 500-row cap
      // silently skipped older estimates that still needed the flag.
      const rows = await loadAllEntityRows({
        entity: Estimate,
        query: { pricing_tier: tier },
        sort: "-updated_date",
        label: "Bulk re-markup estimates",
      }).catch(() => []);
      const openStatuses = new Set(["draft", "calculated", "sent"]);
      let flagged = 0;
      for (const e of list(rows)) {
        if (!openStatuses.has(clean(e?.status))) continue;
        await Estimate.update(clean(e?.id), { pricing_stale: true, pricing_stale_reason: `Pricing tier ${tier} changed — recompute before sending.` }).catch(() => {});
        flagged += 1;
      }
      return Response.json({ success: true, action, tier_number: tier, flagged });
    }

    // Export one estimate as re-importable JSON (#451): the estimate plus its
    // builder tree (products + parts) and audit trail, for a portable bundle.
    if (action === "export_estimate") {
      const id = clean(body?.estimate_id);
      if (!id) throw bad("estimate_id is required.", 400);
      const estimate = await Estimate.get(id).catch(() => null);
      if (!estimate?.id) throw bad("Estimate not found.", 404);
      const [products, parts, revisions, acceptances, deliveries] = await Promise.all([
        base44.asServiceRole.entities.BuilderProduct.filter({ estimate_id: id }, "-created_date", 500).catch(() => []),
        base44.asServiceRole.entities.BuilderPart.filter({ estimate_id: id }, "-created_date", 500).catch(() => []),
        base44.asServiceRole.entities.EstimateRevision.filter({ estimate_id: id }, "-created_date", 500).catch(() => []),
        base44.asServiceRole.entities.EstimateAcceptance.filter({ estimate_id: id }, "-created_date", 500).catch(() => []),
        base44.asServiceRole.entities.EstimateQuoteDelivery.filter({ estimate_id: id }, "-created_date", 500).catch(() => []),
      ]);
      return Response.json({ success: true, action, bundle: { exported_at: new Date().toISOString(), estimate, products: list(products), parts: list(parts), revisions: list(revisions), acceptances: list(acceptances), deliveries: list(deliveries) } });
    }
    // Re-import an exported estimate bundle as a NEW draft — new estimate id,
    // linked to the same customer; products/parts re-pointed at the new id.
    if (action === "import_estimate") {
      if (clean(user?.role) !== "admin" && clean(user?.role) !== "staff") throw bad("Only staff can import an estimate.", 403);
      const b = body?.bundle && typeof body.bundle === "object" ? body.bundle : null;
      const src = b?.estimate;
      if (!src?.project_name) throw bad("bundle.estimate is required.", 400);
      const { id: _oid, created_date: _c, updated_date: _u, created_by_id: _cbi, created_by: _cb, ...fields } = src;
      const created = await Estimate.create({ ...fields, status: "draft", estimate_number: "", pricing_stale: true, pricing_stale_reason: "Imported estimate — recompute + re-save before sending." });
      let importedParts = 0;
      if (created?.id) {
        for (const p of list(b?.products)) {
          const { id: _pi, created_date: _pc, updated_date: _pu, created_by_id: _pbi, created_by: _pb, ...pf } = p || {};
          await base44.asServiceRole.entities.BuilderProduct.create({ ...pf, estimate_id: created.id }).catch(() => null);
        }
        for (const p of list(b?.parts)) {
          const { id: _pi, created_date: _pc, updated_date: _pu, created_by_id: _pbi, created_by: _pb, ...pf } = p || {};
          const r = await base44.asServiceRole.entities.BuilderPart.create({ ...pf, estimate_id: created.id }).catch(() => null);
          if (r?.id) importedParts += 1;
        }
      }
      return Response.json({ success: true, action, estimate_id: created?.id, imported_parts: importedParts });
    }

    // Copy BOM between estimates (#464): clone a source estimate's
    // BuilderProducts + BuilderParts re-pointed at the target estimate.
    if (action === "copy_bom") {
      const fromId = clean(body?.from_estimate_id);
      const toId = clean(body?.to_estimate_id);
      if (!fromId || !toId || fromId === toId) throw bad("Different from/to estimate ids are required.", 400);
      const [src, dst] = await Promise.all([Estimate.get(fromId).catch(() => null), Estimate.get(toId).catch(() => null)]);
      if (!src?.id) throw bad("Source estimate not found.", 404);
      if (!dst?.id) throw bad("Target estimate not found.", 404);
      const [products, parts] = await Promise.all([
        base44.asServiceRole.entities.BuilderProduct.filter({ estimate_id: fromId }, "-created_date", 500).catch(() => []),
        base44.asServiceRole.entities.BuilderPart.filter({ estimate_id: fromId }, "-created_date", 500).catch(() => []),
      ]);
      let copiedProducts = 0, copiedParts = 0;
      for (const p of list(products)) {
        const { id: _pi, created_date: _pc, updated_date: _pu, created_by_id: _pbi, created_by: _pb, ...pf } = p || {};
        const r = await base44.asServiceRole.entities.BuilderProduct.create({ ...pf, estimate_id: toId }).catch(() => null);
        if (r?.id) copiedProducts += 1;
      }
      for (const p of list(parts)) {
        const { id: _pi, created_date: _pc, updated_date: _pu, created_by_id: _pbi, created_by: _pb, ...pf } = p || {};
        const r = await base44.asServiceRole.entities.BuilderPart.create({ ...pf, estimate_id: toId }).catch(() => null);
        if (r?.id) copiedParts += 1;
      }
      await Estimate.update(toId, { pricing_stale: true, pricing_stale_reason: "BOM copied — recompute + re-save before sending." }).catch(() => null);
      return Response.json({ success: true, action, copied_products: copiedProducts, copied_parts: copiedParts });
    }

    // Copy sections between estimates (#467): clone each source line_items
    // entry — its module project record + builder product — appended as new
    // sections on the target estimate.
    if (action === "copy_sections") {
      const fromId = clean(body?.from_estimate_id);
      const toId = clean(body?.to_estimate_id);
      if (!fromId || !toId || fromId === toId) throw bad("Different from/to estimate ids are required.", 400);
      const [src, dst] = await Promise.all([Estimate.get(fromId).catch(() => null), Estimate.get(toId).catch(() => null)]);
      if (!src?.id) throw bad("Source estimate not found.", 404);
      if (!dst?.id) throw bad("Target estimate not found.", 404);
      const MODULE_ENTITIES: Record<string, string> = {
        foundation: "FoundationProject", metal: "MetalProject",
        channel_letters: "ChannelLetterInstallation", vinyl: "VinylProject",
        cnc: "CNCProject", brick_stone: "BrickStoneProject",
        maintenance: "MaintenanceProject", laser: "LaserProject",
        sign_hardware: "SignHardwareProject", digital_print: "DigitalPrintProject",
      };
      const svcEntities = base44.asServiceRole.entities as any;
      const newLines: any[] = [];
      let copied = 0;
      for (const line of list(src?.line_items)) {
        const moduleKey = clean(line?.module_key);
        const entityName = MODULE_ENTITIES[moduleKey];
        if (!entityName || !clean(line?.project_id)) continue;
        let newProjectId = "";
        try {
          const proj = await svcEntities[entityName].get(clean(line.project_id)).catch(() => null);
          if (proj?.id) {
            const { id: _pi, created_date: _pc, updated_date: _pu, created_by_id: _pbi, created_by: _pb, ...pf } = proj;
            const newProj = await svcEntities[entityName].create({ ...pf }).catch(() => null);
            if (newProj?.id) newProjectId = newProj.id;
          }
        } catch { /* project clone failed — still copy the line row */ }
        let newProductId = "";
        if (clean(line?.builder_product_id)) {
          const bp = await base44.asServiceRole.entities.BuilderProduct.get(clean(line.builder_product_id)).catch(() => null);
          if (bp?.id) {
            const { id: _bi, created_date: _bc, updated_date: _bu, created_by_id: _bbi, created_by: _bb, ...bf } = bp;
            const newBp = await base44.asServiceRole.entities.BuilderProduct.create({ ...bf, estimate_id: toId }).catch(() => null);
            if (newBp?.id) newProductId = newBp.id;
          }
        }
        newLines.push({
          ...line,
          line_id: `sec_${Date.now().toString(36)}_${newLines.length}`,
          builder_product_id: newProductId || clean(line?.builder_product_id),
          project_id: newProjectId || clean(line?.project_id),
        });
        copied += 1;
      }
      const merged = [...list(dst?.line_items), ...newLines];
      await Estimate.update(toId, { line_items: merged, pricing_stale: true, pricing_stale_reason: "Sections copied — recompute + re-save before sending." }).catch(() => null);
      return Response.json({ success: true, action, copied_sections: copied });
    }

    // Wrap a standalone module project into an AIO estimate (#455): legacy
    // BOM → new structure. {module_key, project_id} → a new AllInOneEstimate
    // whose line_items point at that module project.
    if (action === "estimate_from_module") {
      const moduleKey = clean(body?.module_key);
      const projectId = clean(body?.project_id);
      const MODULE_ENTITIES: Record<string, string> = {
        foundation: "FoundationProject", metal: "MetalProject",
        channel_letters: "ChannelLetterInstallation", vinyl: "VinylProject",
        cnc: "CNCProject", brick_stone: "BrickStoneProject",
        maintenance: "MaintenanceProject", laser: "LaserProject",
        sign_hardware: "SignHardwareProject", digital_print: "DigitalPrintProject",
      };
      const entityName = MODULE_ENTITIES[moduleKey];
      if (!entityName || !projectId) throw bad("module_key + project_id are required.", 400);
      const proj = await (base44.asServiceRole.entities as any)[entityName].get(projectId).catch(() => null);
      if (!proj?.id) throw bad("Module project not found.", 404);
      const created = await Estimate.create({
        project_name: clean(proj?.project_name) || clean(proj?.name) || `${moduleKey} estimate`,
        client_name: clean(proj?.client_name) || clean(proj?.customer_name) || "",
        status: "draft",
        line_items: [{
          line_id: `sec_${Date.now().toString(36)}_0`,
          module_key: moduleKey,
          project_id: projectId,
          project_name: clean(proj?.project_name) || clean(proj?.name) || "",
          client_name: clean(proj?.client_name) || clean(proj?.customer_name) || "",
          total_snapshot: num(proj?.estimated_total ?? proj?.total ?? 0),
        }],
        pricing_stale: true,
        pricing_stale_reason: "Imported module estimate — recompute + re-save before sending.",
      });
      return Response.json({ success: true, action, estimate_id: created?.id });
    }

    if (action === "status_timeline") {
      // Bounded per-opportunity activity feed — stage/status changes, links,
      // and handoffs from the append-only OpportunityActivity log.
      const opportunityId = clean(body?.opportunity_id);
      if (!opportunityId) throw bad("opportunity_id is required.", 400);
      const rows = await base44.asServiceRole.entities.OpportunityActivity
        .filter({ opportunity_id: opportunityId }, "-created_date", 40)
        .catch(() => []);
      return Response.json({ success: true, timeline: rows || [] });
    }

    if (action === "attention_feed") {
      const today = clean(body?.today) || new Date().toISOString().slice(0, 10);
      const afCached = !!(attentionFeedRowsCache && attentionFeedRowsCache.expires > Date.now());
      let afFailed = false;
      const afFail = () => { afFailed = true; return []; };
      const feedRows: any[] = afCached ? attentionFeedRowsCache!.rows : await Promise.all([
        PortalMessage.filter({ author_side: "customer", read_by_staff: false }, "-created_date", 200).catch(afFail),
        Invoice.filter({}, "-updated_date", 200).catch(afFail),
        PurchaseOrder.filter({}, "-updated_date", 200).catch(afFail),
        ChangeOrder.filter({ status: "proposed" }, "-created_date", 100).catch(afFail),
        Opportunity.filter({}, "-last_activity_at", 300).catch(afFail),
        EstimatingRequest.filter({}, "-created_date", 200).catch(afFail),
        Inventory.filter({}, "-updated_date", 300).catch(afFail),
        WorkOrder.filter({}, "-updated_date", 300).catch(afFail),
        PermitLineItem.filter({}, "-updated_date", 300).catch(afFail),
        Estimate.filter({ status: "sent" }, "-updated_date", 300).catch(afFail),
        Estimate.filter({ pipeline_sync_pending: true }, "-updated_date", 100).catch(afFail),
        BuilderPart.filter({ needs_recalc: true }, "-updated_date", 150).catch(afFail),
      ]);
      if (!afCached && !afFailed) attentionFeedRowsCache = { rows: feedRows, expires: Date.now() + ATTENTION_FEED_CACHE_MS };
      const [messages, invoices, pos, cos, opps, requests, stock, workOrders, permits, sentEstimates, syncPendingRows, needsRecalcRows] = feedRows;
      // Reads stay recency-capped on purpose (12 tables, polled per tab) — but
      // the flags below keep the counts honest when a cap is actually hit.
      const feedTruncated = {
        unread_portal_messages: list(messages).length >= 200,
        overdue_invoices: list(invoices).length >= 200,
        overdue_pos: list(pos).length >= 200,
        proposed_cos: list(cos).length >= 100,
        overdue_follow_ups: list(opps).length >= 300,
        open_estimating_requests: list(requests).length >= 200,
        low_stock: list(stock).length >= 300,
        overdue_jobs: list(workOrders).length >= 300,
        permits: list(permits).length >= 300,
        sent_estimates: list(sentEstimates).length >= 300,
        sync_pending_estimates: list(syncPendingRows).length >= 100,
        needs_recalc_parts: list(needsRecalcRows).length >= 150,
      };

      const unreadMessages = list(messages).map((m: any) => ({
        id: clean(m?.id),
        customer_id: clean(m?.customer_id),
        kind: clean(m?.kind) || "message",
        related_label: clean(m?.related_label),
        excerpt: clean(m?.body).slice(0, 120),
        author_name: clean(m?.author_name),
        created_date: clean(m?.created_date),
      }));

      const overdueInvoices = list(invoices)
        .filter((i: any) => num(i?.balance_due) > 0 && ["sent", "partially_paid"].includes(clean(i?.status)) && clean(i?.due_date) && clean(i?.due_date) < today)
        .map((i: any) => ({
          id: clean(i?.id),
          invoice_number: clean(i?.invoice_number),
          customer_name: clean(i?.customer_display_name || i?.customer_name),
          due_date: clean(i?.due_date),
          balance_due: money(num(i?.balance_due)),
          customer_id: clean(i?.customer_id),
          salesperson_email: clean(i?.salesperson_email) || clean(i?.salesperson),
        }));
      const overdueInvoiceTotal = money(overdueInvoices.reduce((s: number, i: any) => s + i.balance_due, 0));

      const overduePos = list(pos)
        .filter((p: any) => ["sent", "partially_received"].includes(clean(p?.status)) && clean(p?.expected_date) && clean(p?.expected_date) < today)
        .map((p: any) => ({
          id: clean(p?.id),
          po_number: clean(p?.po_number),
          vendor_name: clean(p?.vendor_name),
          expected_date: clean(p?.expected_date),
          status: clean(p?.status),
        }));

      const proposedCos = list(cos).map((c: any) => ({
        id: clean(c?.id),
        change_order_number: clean(c?.change_order_number),
        customer_display_name: clean(c?.customer_display_name),
        amount_delta: money(num(c?.amount_delta)),
        proposed_by: clean(c?.proposed_by),
        created_date: clean(c?.created_date),
      }));

      // Sent estimates aging past 7 days without a response â€” surfaces quotes
      // that aren't opportunity-linked (which list_follow_ups already covers).
      const staleSentEstimates = list(sentEstimates)
        .filter((e: any) => e?.deleted !== true && clean(e?.status) === "sent" && clean(e?.updated_date) && Math.floor((Date.parse(today) - Date.parse(clean(e?.updated_date))) / 86400000) >= 7)
        .map((e: any) => ({
          id: clean(e?.id),
          estimate_number: clean(e?.estimate_number),
          project_name: clean(e?.project_name),
          client_name: clean(e?.client_name),
          quote_total: num(e?.quote_total),
          days_sent: Math.floor((Date.parse(today) - Date.parse(clean(e?.updated_date))) / 86400000),
          updated_date: clean(e?.updated_date),
        }));

      // Forward-looking quote expiry (#346): quotes that hit their
      // expiration date inside the next 7 days, still in 'sent' — notify the
      // responsible salesperson before the quote lapses.
      const sevenDaysOut = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
      const quotesExpiringSoon = list(sentEstimates)
        .filter((e: any) => e?.deleted !== true && clean(e?.status) === "sent" && clean(e?.quote_expiration_date) && clean(e?.quote_expiration_date) >= today && clean(e?.quote_expiration_date) <= sevenDaysOut)
        .map((e: any) => ({
          id: clean(e?.id),
          estimate_number: clean(e?.estimate_number),
          project_name: clean(e?.project_name),
          client_name: clean(e?.client_name),
          quote_total: num(e?.quote_total),
          quote_expiration_date: clean(e?.quote_expiration_date),
          days_until_expiry: Math.floor((Date.parse(clean(e?.quote_expiration_date)) - Date.parse(today)) / 86400000),
          salesperson_email: clean(e?.salesperson_email) || clean(e?.salesperson),
        }));
      // Already past expiry but still 'sent' — the quote lapsed without a
      // customer response or a staff expiry update.
      const quotesExpired = list(sentEstimates)
        .filter((e: any) => e?.deleted !== true && clean(e?.status) === "sent" && (e?.quote_expired === true || (clean(e?.quote_expiration_date) && clean(e?.quote_expiration_date) < today)))
        .map((e: any) => ({
          id: clean(e?.id),
          estimate_number: clean(e?.estimate_number),
          project_name: clean(e?.project_name),
          client_name: clean(e?.client_name),
          quote_total: num(e?.quote_total),
          quote_expiration_date: clean(e?.quote_expiration_date),
          salesperson_email: clean(e?.salesperson_email) || clean(e?.salesperson),
        }));

      const overdueFollowUps = list(opps)
        .filter((o: any) => !CLOSED_STAGES.has(clean(o?.stage)) && clean(o?.next_action_due) && clean(o?.next_action_due) < today)
        .map((o: any) => ({
          id: clean(o?.id),
          title: clean(o?.title),
          customer_display_name: clean(o?.customer_display_name),
          next_action: clean(o?.next_action),
          next_action_due: clean(o?.next_action_due),
          salesperson: clean(o?.salesperson),
        }));

      const openRequests = list(requests)
        .filter((r: any) => OPEN_REQUEST_STATUSES.has(clean(r?.status)))
        .map((r: any) => ({
          id: clean(r?.id),
          request_number: clean(r?.request_number),
          opportunity_id: clean(r?.opportunity_id),
          opportunity_title: clean(r?.opportunity_title) || clean(r?.title),
          status: clean(r?.status),
          assigned_estimator: clean(r?.assigned_estimator) || clean(r?.estimator),
          created_date: clean(r?.created_date),
        }));

      const lowStock = list(stock)
        .filter((it: any) => num(it?.reorder_point) > 0 && num(it?.quantity_on_hand) <= num(it?.reorder_point))
        .map((it: any) => ({
          id: clean(it?.id),
          label: [clean(it?.material_type), clean(it?.product_type), clean(it?.size)].filter(Boolean).join(" Â· ") || "Item",
          quantity_on_hand: num(it?.quantity_on_hand),
          reorder_point: num(it?.reorder_point),
          supplier: clean(it?.vendor) || clean(it?.supplier),
        }));

      return Response.json({
        success: true, action, today,
        ...(afFailed ? { partial: true } : {}),
        truncated: feedTruncated,
        unread_portal_messages: unreadMessages,
        overdue_invoices: overdueInvoices,
        overdue_invoice_total: overdueInvoiceTotal,
        overdue_pos: overduePos,
        proposed_cos: proposedCos,
        overdue_follow_ups: overdueFollowUps,
        stale_sent_estimates: staleSentEstimates,
        quotes_expiring_soon: quotesExpiringSoon,
        quotes_expired: quotesExpired,
        open_estimating_requests: openRequests,
        // Escalation: still-unassigned after 2 days — flagged to managers.
        unassigned_estimating_requests: openRequests
          .filter((r: any) => !r.assigned_estimator && Date.parse(r.created_date) < Date.now() - 2 * 86400000)
          .slice(0, 25),
        low_stock: lowStock,
        needs_recalc_parts: list(needsRecalcRows)
          .slice(0, 25)
          .map((p: any) => ({
            id: clean(p?.id),
            part_name: clean(p?.part_name) || clean(p?.part_key),
            builder_product_id: clean(p?.builder_product_id),
            estimate_id: clean(p?.estimate_id),
          })),
        sync_pending_estimates: list(syncPendingRows)
          .filter((e: any) => Date.parse(clean(e?.updated_date)) < Date.now() - 86400000)
          .slice(0, 25)
          .map((e: any) => ({
            id: clean(e?.id),
            project_name: clean(e?.project_name),
            estimate_number: clean(e?.estimate_number),
            status: clean(e?.status),
            updated_date: clean(e?.updated_date),
          })),
        overdue_jobs: list(workOrders)
          .filter((w: any) => clean(w?.current_stage) !== "completed" && clean(w?.due_date) && clean(w?.due_date) < today)
          .map((w: any) => ({
            id: clean(w?.id),
            title: clean(w?.title),
            client_name: clean(w?.client_name),
            current_stage: clean(w?.current_stage),
            due_date: clean(w?.due_date),
          })),
        expiring_permits: (() => {
          const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
          return list(permits)
            .filter((p: any) => clean(p?.status) !== "completed" && clean(p?.expiration_date) && clean(p?.expiration_date) <= soon)
            .sort((a: any, b: any) => clean(a?.expiration_date).localeCompare(clean(b?.expiration_date)))
            .slice(0, 50)
            .map((p: any) => ({
              id: clean(p?.id),
              row_name: clean(p?.row_name),
              locality_name: clean(p?.locality_name),
              work_order_id: clean(p?.work_order_id),
              work_order_title: clean(p?.work_order_title),
              expiration_date: clean(p?.expiration_date),
              expired: clean(p?.expiration_date) < today,
            }));
        })(),
        permit_fees_due: list(permits)
          .filter((p: any) => clean(p?.status) !== "completed" && clean(p?.jurisdiction_fee_status) === "due")
          .map((p: any) => ({
            id: clean(p?.id),
            row_name: clean(p?.row_name),
            locality_name: clean(p?.locality_name),
            work_order_id: clean(p?.work_order_id),
            work_order_title: clean(p?.work_order_title),
            fee_amount: money(num(p?.jurisdiction_fee_amount)),
          })),
      });
    }

    if (action === "search_customers") {
      const query = clean(body?.query);
      const needle = query.toLowerCase();
      const fields = ["company_name", "contact_first_name", "contact_last_name", "contact_email", "email", "company_phone"];
      const matchesQuery = (row: any) => !needle || fields.some((f) => clean(row?.[f]).toLowerCase().includes(needle));
      // Server-side $regex pushdown (fleetSearch pattern). If the entity
      // rejects $or/$regex, fall back to a full paged scan + client match —
      // the old filter({}) silently searched only the first 50 customers.
      let rows: any = needle
        ? await Customer.filter(regexOr(fields, query), "-updated_date", 500).catch(() => null)
        : null;
      const regexPushdown = Array.isArray(rows);
      if (!regexPushdown) {
        rows = await loadAllEntityRows({ entity: Customer, sort: "-updated_date", label: "Customer search" }).catch(() => null);
      }
      if (!Array.isArray(rows)) throw bad("Customer lookup failed.", 500);
      const matched = rows.filter(matchesQuery);
      const matches = matched
        .slice(0, 25)
        .map((row: any) => ({
          id: clean(row?.id),
          company_name: clean(row?.company_name),
          contact_name: [clean(row?.contact_first_name), clean(row?.contact_last_name)].filter(Boolean).join(" "),
          contact_email: clean(row?.contact_email),
          contact_phone: clean(row?.company_phone),
          customer_status: clean(row?.customer_status),
        }));
      return Response.json({
        success: true, action, customers: matches,
        total_matched: matched.length,
        truncated: matched.length > matches.length || (regexPushdown && rows.length >= 500),
      });
    }

    if (action === "list_opportunities") {
      const includeClosed = body?.include_closed === true;
      const limit = Math.max(1, Math.min(200, Number(body?.limit) || 200));
      const today = clean(body?.today) || new Date().toISOString().slice(0, 10);
      // Full paged read — funnel stats and stage counts must cover every
      // opportunity, not just the first 500 by recency.
      const rows = await loadAllEntityRows({ entity: Opportunity, sort: "-last_activity_at", label: "Opportunity list" }).catch(() => null);
      if (!Array.isArray(rows)) throw bad("Opportunity lookup failed.", 500);
      const matched = rows
        .filter((row: any) => includeClosed || !CLOSED_STAGES.has(clean(row?.stage)));
      const visible = matched.slice(0, limit);
      const stageCounts: any = {};
      let openPipelineValue = 0;
      let wonValue = 0;
      let wonCount = 0;
      let decidedCount = 0;
      for (const row of rows) {
        const stage = clean(row?.stage) || "new";
        stageCounts[stage] = (stageCounts[stage] || 0) + 1;
        const budget = Number(row?.budget_amount) || 0;
        if (!CLOSED_STAGES.has(stage)) openPipelineValue += budget;
        if (stage === "won") { wonValue += budget; wonCount += 1; decidedCount += 1; }
        if (stage === "lost") decidedCount += 1;
      }
      const bySalesperson: any = {};
      for (const row of rows) {
        const rep = clean(row?.salesperson) || "Unassigned";
        const slot = bySalesperson[rep] || (bySalesperson[rep] = { salesperson: rep, open_count: 0, open_value: 0, won_count: 0, won_value: 0, decided_count: 0 });
        const stage = clean(row?.stage) || "new";
        const budget = Number(row?.budget_amount) || 0;
        if (!CLOSED_STAGES.has(stage)) { slot.open_count += 1; slot.open_value += budget; }
        if (stage === "won") { slot.won_count += 1; slot.won_value += budget; slot.decided_count += 1; }
        if (stage === "lost") slot.decided_count += 1;
      }
      const salespeople = Object.values(bySalesperson)
        .map((s: any) => ({
          ...s,
          open_value: Math.round(s.open_value * 100) / 100,
          won_value: Math.round(s.won_value * 100) / 100,
          win_rate: s.decided_count > 0 ? Math.round((s.won_count / s.decided_count) * 1000) / 10 : null,
        }))
        .sort((a: any, b: any) => b.open_value - a.open_value || b.won_value - a.won_value);
      const lostReasonMap: any = {};
      for (const row of rows) {
        if (clean(row?.stage) !== "lost") continue;
        const raw = clean(row?.lost_reason).slice(0, 120);
        const key = raw.toLowerCase() || "no reason given";
        const slot = lostReasonMap[key] || (lostReasonMap[key] = { reason: raw || "No reason given", count: 0, lost_value: 0 });
        slot.count += 1;
        slot.lost_value += Number(row?.budget_amount) || 0;
      }
      const lostReasons = Object.values(lostReasonMap)
        .map((r: any) => ({ ...r, lost_value: Math.round(r.lost_value * 100) / 100 }))
        .sort((a: any, b: any) => b.count - a.count || b.lost_value - a.lost_value)
        .slice(0, 12);
      // Estimate-status funnel â€” the same shape as the opportunity funnel but
      // keyed on the estimate lifecycle (draft -> calculated -> sent -> approved)
      // so the dashboard can show quote-side conversion separately from pipeline.
      const estimateRows = await loadAllEntityRows({ entity: Estimate, sort: "-created_date", label: "Estimate funnel rows" }).catch(() => []);
      const requestRows = await loadAllEntityRows({ entity: EstimatingRequest, sort: "-created_date", label: "Estimating request funnel rows" }).catch(() => []);
      const thirtyDaysAgo = Date.now() - 30 * 86400000;
      const staleRequests = (Array.isArray(requestRows) ? requestRows : []).filter((r: any) => {
        const ts = Date.parse(clean(r?.created_date));
        return Number.isFinite(ts) && ts < thirtyDaysAgo;
      });
      const requestIdsWithEstimate = new Set(
        (Array.isArray(estimateRows) ? estimateRows : [])
          .map((e: any) => clean(e?.estimating_request_id))
          .filter(Boolean)
      );
      const staleConverted = staleRequests.filter((r: any) => requestIdsWithEstimate.has(clean(r?.id)));
      const requestConversion = {
        total_requests_30d: staleRequests.length,
        converted: staleConverted.length,
        conversion_rate: staleRequests.length > 0 ? Math.round((staleConverted.length / staleRequests.length) * 1000) / 10 : null,
      };
      const estimateStatusCounts: any = {};
      let estimateWonCount = 0;
      let estimateDecidedCount = 0;
      let estimateWonValue = 0;
      let estimateDecidedValue = 0;
      let estimateMarginSum = 0;
      let estimateMarginCount = 0;
      let estimateMarginTotal = 0;
      const agingBuckets: any = { expired: 0, expiring_7d: 0, valid_14d: 0, valid_30d: 0, valid_30d_plus: 0 };
      const agingRows: any[] = [];
      const estimateBySalesperson: any = {};
      const estimateLostReasonMap: any = {};
      const markupUsage: any = { discount: 0, none: 0, "0-10%": 0, "10-25%": 0, "25-50%": 0, "50%+": 0 };
      const moduleBreakdown: Record<string, { module: string; count: number; value: number }> = {};
      let partCostRatioSum = 0;
      let partCostRatioCount = 0;
      for (const row of Array.isArray(estimateRows) ? estimateRows : []) {
        if (row?.deleted === true) continue;
        const status = clean(row?.status) || "draft";
        estimateStatusCounts[status] = (estimateStatusCounts[status] || 0) + 1;
        const total = num(row?.quote_total);
        if (status === "approved") { estimateWonCount += 1; estimateDecidedCount += 1; estimateWonValue += total; estimateDecidedValue += total; }
        if (status === "archived" || status === "cancelled") {
          estimateDecidedCount += 1; estimateDecidedValue += total;
          const rawReason = clean(row?.cancel_reason || row?.archived_reason).slice(0, 120) || "No reason given";
          const reasonKey = rawReason.toLowerCase();
          const slot2 = estimateLostReasonMap[reasonKey] || (estimateLostReasonMap[reasonKey] = { reason: rawReason, count: 0, lost_value: 0 });
          slot2.count += 1; slot2.lost_value += total;
        }
        if (status === "sent") {
          const until = clean(row?.quote_valid_until) || clean(row?.quote_expiration_date);
          const days = until ? Math.round((Date.parse(until) - Date.parse(today)) / 86400000) : null;
          const bucket = days == null ? "valid_30d_plus" : days < 0 ? "expired" : days <= 7 ? "expiring_7d" : days <= 14 ? "valid_14d" : days <= 30 ? "valid_30d" : "valid_30d_plus";
          agingBuckets[bucket] += 1;
          if (days != null && days <= 14) agingRows.push({ id: clean(row?.id), estimate_number: clean(row?.estimate_number), project_name: clean(row?.project_name), client_name: clean(row?.client_name), quote_total: total, quote_valid_until: until, days_to_expiry: days, expired: days < 0 });
        }
        let partCost = 0;
        for (const li of Array.isArray(row?.line_items) ? row.line_items : []) {
          const mk = clean(li?.module_key) || "unassigned";
          const mSlot = moduleBreakdown[mk] || (moduleBreakdown[mk] = { module: mk, count: 0, value: 0 });
          mSlot.count += 1;
          mSlot.value += total;
          const adj = num(li?.adjustment_percent);
          const bucket = adj < 0 ? "discount" : adj === 0 ? "none" : adj <= 10 ? "0-10%" : adj <= 25 ? "10-25%" : adj <= 50 ? "25-50%" : "50%+";
          markupUsage[bucket] += 1;
          partCost += num(li?.total_snapshot) * (num(li?.customer_quantity) || 1);
        }
        if (total > 0 && partCost > 0) { partCostRatioSum += partCost / total; partCostRatioCount += 1; }
        const rep = clean(row?.salesperson) || "Unassigned";
        const slot = estimateBySalesperson[rep] || (estimateBySalesperson[rep] = { salesperson: rep, count: 0, quote_value: 0, won_count: 0, decided_count: 0 });
        slot.count += 1;
        slot.quote_value += total;
        if (status === "approved") { slot.won_count += 1; slot.decided_count += 1; }
        if (status === "archived" || status === "cancelled") slot.decided_count += 1;
        const internal = num(row?.total_cost);
        if (total > 0 && internal > 0) {
          estimateMarginSum += (total - internal) / total;
          estimateMarginTotal += total - internal;
          estimateMarginCount += 1;
        }
      }
      const estimateFunnel = {
        status_counts: estimateStatusCounts,
        total: estimateStatusCounts.draft + estimateStatusCounts.calculated + estimateStatusCounts.sent + estimateStatusCounts.approved + estimateStatusCounts.archived + estimateStatusCounts.cancelled,
        won_count: estimateWonCount,
        decided_count: estimateDecidedCount,
        win_rate: estimateDecidedCount > 0 ? Math.round((estimateWonCount / estimateDecidedCount) * 1000) / 10 : null,
        won_value: Math.round(estimateWonValue * 100) / 100,
        decided_value: Math.round(estimateDecidedValue * 100) / 100,
        by_module: Object.values(moduleBreakdown).sort((a: any, b: any) => b.value - a.value).slice(0, 12),
        avg_margin_pct: estimateMarginCount > 0 ? Math.round((estimateMarginSum / estimateMarginCount) * 1000) / 10 : null,
        total_margin: Math.round(estimateMarginTotal * 100) / 100,
        aging_buckets: agingBuckets,
        aging_rows: agingRows.sort((a: any, b: any) => a.days_to_expiry - b.days_to_expiry).slice(0, 15),
        by_salesperson: Object.values(estimateBySalesperson).map((s: any) => ({ ...s, avg_quote_value: s.count > 0 ? Math.round((s.quote_value / s.count) * 100) / 100 : 0, win_rate: s.decided_count > 0 ? Math.round((s.won_count / s.decided_count) * 1000) / 10 : null })).sort((a: any, b: any) => b.quote_value - a.quote_value).slice(0, 12),
        lost_reasons: Object.values(estimateLostReasonMap).map((r: any) => ({ ...r, lost_value: Math.round(r.lost_value * 100) / 100 })).sort((a: any, b: any) => b.count - a.count || b.lost_value - a.lost_value).slice(0, 10),
        markup_usage: markupUsage,
        avg_part_cost_ratio: partCostRatioCount > 0 ? Math.round((partCostRatioSum / partCostRatioCount) * 1000) / 10 : null,
        request_conversion: requestConversion,
      };
      const funnel = {
        estimate_funnel: estimateFunnel,
        stage_counts: stageCounts,
        total: rows.length,
        open_pipeline_value: Math.round(openPipelineValue * 100) / 100,
        won_value: Math.round(wonValue * 100) / 100,
        won_count: wonCount,
        decided_count: decidedCount,
        win_rate: decidedCount > 0 ? Math.round((wonCount / decidedCount) * 1000) / 10 : null,
        by_salesperson: salespeople,
        lost_reasons: lostReasons,
      };
      return Response.json({
        success: true, action, opportunities: visible, total: visible.length,
        matched_total: matched.length, total_loaded: rows.length,
        truncated: matched.length > visible.length,
        funnel,
      });
    }

    if (action === "global_search") {
      const rawQuery = clean(body?.query).slice(0, 100);
      const query = rawQuery.toLowerCase();
      const empty = { opportunities: [], estimates: [], invoices: [], purchase_orders: [], change_orders: [], customers: [], work_orders: [], orders: [] };
      if (query.length < 2) return Response.json({ success: true, action, results: empty });
      // Push the match down to the entity store ($or/$regex over the same
      // fields the client matcher uses). If an entity rejects regex filters,
      // fall back to a full paged scan + the client-side has() check — never
      // back to a bare default-limited read.
      const SEARCH_LIMIT = 500;
      const searchRead = async (entity: any, fields: string[], sort: string, label: string, hardFail: boolean) => {
        try {
          const hit = await entity.filter(regexOr(fields, rawQuery), sort, SEARCH_LIMIT);
          if (Array.isArray(hit)) return hit;
        } catch { /* regex/$or unsupported on this entity — scan instead */ }
        const scanned = await loadAllEntityRows({ entity, sort, label: `${label} search` }).catch(() => null);
        if (Array.isArray(scanned)) return scanned;
        const legacy = await entity.filter({}, sort, SEARCH_LIMIT).catch(() => null);
        if (!Array.isArray(legacy) && hardFail) throw bad(`${label} search failed.`, 500);
        return legacy || [];
      };
      const [opps, estimates, invoices, pos, cos, customers, wos, orders] = await Promise.all([
        searchRead(Opportunity, ["title", "customer_display_name", "salesperson"], "-last_activity_at", "Opportunity", true),
        searchRead(Estimate, ["project_name", "client_name", "estimate_number"], "-created_date", "Estimate", true),
        searchRead(Invoice, ["invoice_number", "customer_display_name"], "-updated_date", "Invoice", true),
        searchRead(PurchaseOrder, ["po_number", "vendor_name"], "-updated_date", "PurchaseOrder", true),
        searchRead(ChangeOrder, ["change_order_number", "title", "customer_display_name"], "-created_date", "ChangeOrder", true),
        searchRead(Customer, ["company_name", "contact_first_name", "contact_last_name", "contact_email", "email"], "-updated_date", "Customer", false),
        searchRead(WorkOrder, ["title", "client_name", "current_task_description"], "-updated_date", "WorkOrder", false),
        searchRead(Order, ["description", "vendor", "requestor_name", "request_type"], "-updated_date", "Order", false),
      ]);
      const has = (row: any, fields: string[]) => fields.some((f) => clean(row?.[f]).toLowerCase().includes(query));
      return Response.json({
        success: true,
        action,
        results: {
          opportunities: opps.filter((r: any) => has(r, ["title", "customer_display_name", "salesperson"])).slice(0, 10)
            .map((r: any) => ({ id: clean(r?.id), title: clean(r?.title), customer_display_name: clean(r?.customer_display_name), stage: clean(r?.stage) })),
          estimates: estimates.filter((r: any) => !r?.deleted && has(r, ["project_name", "client_name", "estimate_number"])).slice(0, 10)
            .map((r: any) => ({ id: clean(r?.id), project_name: clean(r?.project_name), client_name: clean(r?.client_name), estimate_number: clean(r?.estimate_number), status: clean(r?.status) })),
          invoices: invoices.filter((r: any) => has(r, ["invoice_number", "customer_display_name"])).slice(0, 10)
            .map((r: any) => ({ id: clean(r?.id), invoice_number: clean(r?.invoice_number), customer_display_name: clean(r?.customer_display_name), status: clean(r?.status), total: num(r?.total) })),
          purchase_orders: pos.filter((r: any) => has(r, ["po_number", "vendor_name"])).slice(0, 10)
            .map((r: any) => ({ id: clean(r?.id), po_number: clean(r?.po_number), vendor_name: clean(r?.vendor_name), status: clean(r?.status), total: num(r?.total) })),
          change_orders: cos.filter((r: any) => has(r, ["change_order_number", "title", "customer_display_name"])).slice(0, 10)
            .map((r: any) => ({ id: clean(r?.id), change_order_number: clean(r?.change_order_number), title: clean(r?.title), customer_display_name: clean(r?.customer_display_name), status: clean(r?.status) })),
          customers: (Array.isArray(customers) ? customers : [])
            .filter((r: any) => has(r, ["company_name", "contact_first_name", "contact_last_name", "contact_email", "email"]))
            .slice(0, 10)
            .map((r: any) => ({ id: clean(r?.id), company_name: clean(r?.company_name), contact_name: [clean(r?.contact_first_name), clean(r?.contact_last_name)].filter(Boolean).join(" "), customer_status: clean(r?.customer_status) })),
          work_orders: (Array.isArray(wos) ? wos : [])
            .filter((r: any) => !r?.deleted && has(r, ["title", "client_name", "current_task_description"]))
            .slice(0, 10)
            .map((r: any) => ({ id: clean(r?.id), title: clean(r?.title), client_name: clean(r?.client_name), current_stage: clean(r?.current_stage), due_date: clean(r?.due_date) })),
          orders: (Array.isArray(orders) ? orders : [])
            .filter((r: any) => !r?.deleted && has(r, ["description", "vendor", "requestor_name", "request_type"]))
            .slice(0, 10)
            .map((r: any) => ({ id: clean(r?.id), customer_name: clean(r?.customer_name || r?.vendor_name), description: clean(r?.description), vendor: clean(r?.vendor || r?.vendor_name), status: clean(r?.status) })),
        },
        // A group hitting the scan cap means more matches may exist than the
        // 10 surfaced — honest signal for the UI's "see all" affordance.
        truncated: {
          opportunities: opps.length >= SEARCH_LIMIT,
          estimates: estimates.length >= SEARCH_LIMIT,
          invoices: invoices.length >= SEARCH_LIMIT,
          purchase_orders: pos.length >= SEARCH_LIMIT,
          change_orders: cos.length >= SEARCH_LIMIT,
          customers: Array.isArray(customers) && customers.length >= SEARCH_LIMIT,
          work_orders: Array.isArray(wos) && wos.length >= SEARCH_LIMIT,
          orders: Array.isArray(orders) && orders.length >= SEARCH_LIMIT,
        },
      });
    }

    if (action === "get_opportunity") {
      const opportunityId = clean(body?.opportunity_id);
      if (!opportunityId) throw bad("opportunity_id is required.");
      const opportunity = await Opportunity.get(opportunityId).catch(() => null);
      if (!opportunity?.id) throw bad("Opportunity not found.", 404);
      const [intakes, requests, customer, contact, location, workOrder, estimates, invoices, purchaseOrders, changeOrders, activity] = await Promise.all([
        Intake.filter({ opportunity_id: opportunityId }, "-captured_at", 100),
        EstimatingRequest.filter({ opportunity_id: opportunityId }, "-created_date", 100),
        clean(opportunity?.customer_id) ? Customer.get(clean(opportunity.customer_id)).catch(() => null) : null,
        clean(opportunity?.contact_id) ? CustomerContact.get(clean(opportunity.contact_id)).catch(() => null) : null,
        clean(opportunity?.location_id) ? CustomerLocation.get(clean(opportunity.location_id)).catch(() => null) : null,
        clean(opportunity?.compatibility_work_order_id)
          ? WorkOrder.get(clean(opportunity.compatibility_work_order_id)).catch(() => null)
          : null,
        Estimate.filter({ opportunity_id: opportunityId }, "-created_date", 500),
        Invoice.filter({ opportunity_id: opportunityId }, "-created_date", 500),
        PurchaseOrder.filter({ opportunity_id: opportunityId }, "-created_date", 500),
        ChangeOrder.filter({ opportunity_id: opportunityId }, "-created_date", 500),
        Activity.filter({ opportunity_id: opportunityId }, "-created_date", 100).catch(() => []),
      ]);
      const liveInvoices = (Array.isArray(invoices) ? invoices : []).filter((i: any) => clean(i?.status) !== "void");
      const billedTotal = money(liveInvoices.filter((i: any) => clean(i?.status) !== "draft").reduce((s: number, i: any) => s + num(i?.total), 0));
      const collectedTotal = money(liveInvoices.reduce((s: number, i: any) => s + num(i?.amount_paid), 0));
      const committedTotal = money((Array.isArray(purchaseOrders) ? purchaseOrders : [])
        .filter((p: any) => clean(p?.status) !== "cancelled").reduce((s: number, p: any) => s + num(p?.total), 0));
      const coDelta = money((Array.isArray(changeOrders) ? changeOrders : [])
        .filter((c: any) => ["approved", "applied"].includes(clean(c?.status))).reduce((s: number, c: any) => s + num(c?.amount_delta), 0));

      let finalOpportunity = opportunity;
      const reconciledRequests: any[] = [];
      let anyCompleted = false;
      for (const r of Array.isArray(requests) ? requests : []) {
        try {
          const res = await reconcileEstimatingRequest({ EstimatingRequest, Estimate, request: r });
          reconciledRequests.push(res.request);
          if (res.completed) anyCompleted = true;
        } catch {
          reconciledRequests.push(r);
        }
      }
      if (anyCompleted && clean(opportunity.stage) === "estimating") {
        const now = new Date().toISOString();
        const desired = { stage: "quoted", stage_changed_at: now, last_activity_at: now };
        finalOpportunity = await replaceFoundationFieldsIfUnchanged({
          entity: Opportunity,
          recordId: opportunityId,
          expectedFields: expectedFor(opportunity, opportunity, desired),
          nextFields: desired,
          label: "Opportunity stage advance",
        }).catch(() => opportunity);
        try {
          await syncWorkOrderStage(WorkOrder, clean(finalOpportunity?.compatibility_work_order_id), "quoted");
        } catch {}
        await logActivity(Activity, {
          opportunity_id: opportunityId, actor,
          event_type: "reconciled",
          summary: "Stage advanced to quoted â€” linked estimate sent/approved",
          details: { from_stage: clean(opportunity.stage), to_stage: "quoted" },
        });
        if (clean(finalOpportunity?.stage) === "quoted" && clean(opportunity.stage) !== "quoted") {
          await emitOpportunityAutomation(base44, "sales_status_changed", opportunityId, actor);
        }
      }
      return Response.json({
        success: true,
        action,
        opportunity: finalOpportunity,
        customer: customer || null,
        contact: contact || null,
        location: location || null,
        intakes: Array.isArray(intakes) ? intakes : [],
        estimating_requests: reconciledRequests,
        work_order: workOrder || null,
        estimates: (Array.isArray(estimates) ? estimates : []).filter((e: any) => e?.deleted !== true),
        invoices: Array.isArray(invoices) ? invoices : [],
        purchase_orders: Array.isArray(purchaseOrders) ? purchaseOrders : [],
        change_orders: Array.isArray(changeOrders) ? changeOrders : [],
        activity: Array.isArray(activity) ? activity : [],
        financials: {
          invoiced: billedTotal,
          collected: collectedTotal,
          open_ar: money(billedTotal - collectedTotal),
          po_committed: committedTotal,
          co_delta: coDelta,
        },
      });
    }

    if (action === "list_estimating_requests") {
      const includeClosed = body?.include_closed === true;
      // Paged full read — the queue must reconcile and rank every request,
      // not just the first 50.
      let rows = await loadAllEntityRows({ entity: EstimatingRequest, sort: "-created_date", label: "Estimating request list" }).catch(() => null);
      if (!Array.isArray(rows)) throw bad("Estimating request lookup failed.", 500);
      // Close out open requests whose linked estimate has gone to the customer.
      let reconciles = 0;
      for (let i = 0; i < rows.length && reconciles < 60; i += 1) {
        const r = rows[i];
        if (!OPEN_REQUEST_STATUSES.has(clean(r?.status)) || !clean(r?.estimate_id)) continue;
        reconciles += 1;
        try {
          const res = await reconcileEstimatingRequest({ EstimatingRequest, Estimate, request: r });
          rows[i] = res.request;
        } catch {}
      }
      const filtered = rows.filter((r: any) => includeClosed || OPEN_REQUEST_STATUSES.has(clean(r?.status)));
      const opportunityIds = [...new Set(filtered.map((r: any) => clean(r?.opportunity_id)).filter(Boolean))];
      const opportunities = new Map(
        (await Promise.all(opportunityIds.map((id) => Opportunity.get(id).catch(() => null))))
          .filter((o: any) => o?.id)
          .map((o: any) => [clean(o.id), o]),
      );
      const rank: any = { rush: 0, high: 1, normal: 2, low: 3 };
      const requests = filtered
        .sort((a: any, b: any) =>
          (rank[clean(a?.priority)] ?? 2) - (rank[clean(b?.priority)] ?? 2)
          || clean(a?.requested_at || a?.created_date).localeCompare(clean(b?.requested_at || b?.created_date)))
        .slice(0, 250)
        .map((r: any) => {
          const opp = opportunities.get(clean(r?.opportunity_id));
          return {
            id: clean(r?.id),
            opportunity_id: clean(r?.opportunity_id),
            estimate_id: clean(r?.estimate_id),
            status: clean(r?.status),
            priority: clean(r?.priority) || "normal",
            assigned_estimator: clean(r?.assigned_estimator),
            requested_at: clean(r?.requested_at || r?.created_date),
            submitted_at: clean(r?.submitted_at),
            opportunity_title: clean(opp?.title),
            customer_display_name: clean(opp?.customer_display_name),
            opportunity_stage: clean(opp?.stage),
            updated_date: clean(r?.updated_date),
          };
        });
      return Response.json({
        success: true, action, estimating_requests: requests,
        total: requests.length, matched_total: filtered.length,
        truncated: filtered.length > requests.length,
      });
    }

    if (action === "list_follow_ups") {
      // Paged full read — every open opportunity with a next action belongs
      // on the follow-up board, not just the first 50.
      const rows = await loadAllEntityRows({ entity: Opportunity, sort: "-last_activity_at", label: "Follow-up opportunities" }).catch(() => null);
      if (!Array.isArray(rows)) throw bad("Opportunity lookup failed.", 500);
      const today = clean(body?.today) || new Date().toISOString().slice(0, 10);
      const items = rows
        .filter((o: any) => !CLOSED_STAGES.has(clean(o?.stage)) && (clean(o?.next_action) || clean(o?.next_action_due)))
        .map((o: any) => {
          const due = clean(o?.next_action_due);
          return {
            id: clean(o?.id),
            title: clean(o?.title),
            customer_display_name: clean(o?.customer_display_name),
            stage: clean(o?.stage),
            salesperson: clean(o?.salesperson),
            next_action: clean(o?.next_action),
            next_action_due: due,
            next_action_assignee: clean(o?.next_action_assignee),
            overdue: Boolean(due) && due < today,
            stage_changed_at: clean(o?.stage_changed_at),
            last_activity_at: clean(o?.last_activity_at),
          };
        })
        .sort((a: any, b: any) =>
          Number(b.overdue) - Number(a.overdue)
          || (a.next_action_due || "9999").localeCompare(b.next_action_due || "9999"));

      // Stale sent quotes on quoted-stage opportunities become implicit follow-ups:
      // aging after 7 days without a response, "expired" past quote_valid_days.
      const requests = await loadAllEntityRows({ entity: EstimatingRequest, sort: "-created_date", label: "Follow-up estimating requests" }).catch(() => []);
      const estimateIdByOpp = new Map();
      for (const r of Array.isArray(requests) ? requests : []) {
        const oppId = clean(r?.opportunity_id);
        const estId = clean(r?.estimate_id);
        if (oppId && estId && !estimateIdByOpp.has(oppId)) estimateIdByOpp.set(oppId, estId);
      }
      for (const o of rows.filter((x: any) => clean(x?.stage) === "quoted").slice(0, 100)) {
        const estId = estimateIdByOpp.get(clean(o?.id));
        if (!estId) continue;
        const est = await Estimate.get(estId).catch(() => null);
        if (!est || est?.deleted === true || clean(est?.status) !== "sent") continue;
        const issued = clean(est?.quote_issue_date) || clean(est?.updated_date).slice(0, 10);
        const issuedMs = Date.parse(issued);
        if (!Number.isFinite(issuedMs)) continue;
        const ageDays = Math.floor((Date.now() - issuedMs) / 86400000);
        if (ageDays < 7) continue;
        const validDays = num(est?.quote_valid_days, 30);
        const expired = ageDays >= validDays;
        items.push({
          id: clean(o?.id),
          title: clean(o?.title),
          customer_display_name: clean(o?.customer_display_name),
          stage: "quoted",
          salesperson: clean(o?.salesperson),
          next_action: expired
            ? `Quote ${clean(est?.estimate_number) || ""} expired (${validDays}d validity) â€” re-issue or follow up`
            : `Quote ${clean(est?.estimate_number) || ""} sent ${ageDays}d ago â€” no response`,
          next_action_due: new Date(issuedMs + Math.min(validDays, ageDays + 3) * 86400000).toISOString().slice(0, 10),
          next_action_assignee: clean(o?.next_action_assignee),
          overdue: expired,
          stale_quote: true,
          quote_age_days: ageDays,
          quote_expired: expired,
          stage_changed_at: clean(o?.stage_changed_at),
          last_activity_at: clean(o?.last_activity_at),
        });
      }
      items.sort((a: any, b: any) =>
        Number(b.overdue) - Number(a.overdue)
        || (a.next_action_due || "9999").localeCompare(b.next_action_due || "9999"));
      return Response.json({
        success: true, action, follow_ups: items.slice(0, 200), today,
        total: Math.min(items.length, 200), matched_total: items.length,
        truncated: items.length > 200,
      });
    }

    if (action === "assign_estimator") {
      const requestId = clean(body?.estimating_request_id);
      const current = await EstimatingRequest.get(requestId).catch(() => null);
      if (!current?.id) throw bad("Estimating request not found.", 404);
      if (!OPEN_REQUEST_STATUSES.has(clean(current.status))) throw bad("Only open estimating requests can be assigned.", 409);
      const desired: any = {
        assigned_estimator: clean(body?.assigned_estimator),
      };
      if (Object.prototype.hasOwnProperty.call(body || {}, "priority")) {
        desired.priority = requireEnum(body?.priority || "normal", PRIORITIES, "priority") || "normal";
      }
      const baseline = body?.baseline && typeof body.baseline === "object" ? body.baseline : current;
      const expected = expectedFoundationFields({ ...current, ...baseline }, desired);
      const updated = await replaceEstimatingRequestFieldsIfUnchanged({
        entity: EstimatingRequest,
        recordId: requestId,
        expectedFields: expected,
        nextFields: desired,
        label: "Estimating Request assignment",
      });
      await logActivity(Activity, {
        opportunity_id: clean(current.opportunity_id), actor,
        event_type: "estimator_assigned",
        summary: `Estimator assigned: ${clean(desired.assigned_estimator) || "unassigned"} (${clean(desired.priority || current.priority) || "normal"})`,
        details: { estimating_request_id: requestId, assigned_estimator: clean(desired.assigned_estimator), priority: clean(desired.priority) },
      });
      return Response.json({ success: true, action, estimating_request: updated });
    }

    if (action === "capture_intake") {
      const key = clean(body?.creation_request_key);
      if (!key || key.length > 256) throw bad("A valid creation_request_key is required.");
      const sourceType = requireEnum(body?.source_type || "manual", SOURCE_TYPES, "source_type") || "manual";
      const oppKey = `${key}:opportunity`.slice(0, 256);
      const intakeKey = `${key}:intake`.slice(0, 256);

      const existingIntakes = await findByCreationKey(Intake, intakeKey);
      if (existingIntakes.length > 1) {
        throw bad("Multiple intake records share this creation receipt; review before retrying.", 409);
      }
      if (existingIntakes.length === 1) {
        const linkedId = clean(existingIntakes[0]?.opportunity_id);
        const existing = linkedId ? await Opportunity.get(linkedId).catch(() => null) : null;
        if (existing?.id) {
          return Response.json({ success: true, action, opportunity: existing, intake: existingIntakes[0], reused: true });
        }
      }

      const input = body?.fields && typeof body.fields === "object" ? body.fields : {};
      const requirements: any = {};
      for (const field of REQUIREMENT_FIELDS) {
        requirements[field] = requireEnum(input[field] || "unknown", REQUIREMENT_VALUES, field) || "unknown";
      }
      const customerId = clean(input.customer_id);
      let customer: any = null;
      if (customerId) {
        customer = await Customer.get(customerId).catch(() => null);
        if (!customer?.id) throw bad("The selected Customer no longer exists.", 409);
      }
      const displayName = clean(input.customer_display_name) || clean(customer?.company_name);
      const title = clean(input.title) || displayName || "New opportunity";
      if (!title) throw bad("A title or customer name is required.");

      const now = new Date().toISOString();
      const opportunityData: any = {
        creation_request_key: oppKey,
        customer_id: customer ? clean(customer.id) : customerId,
        customer_display_name: displayName || clean(customer?.company_name),
        title,
        job_description: clean(input.job_description),
        stage: "new",
        opened_at: now,
        stage_changed_at: now,
        last_activity_at: now,
        salesperson: clean(input.salesperson),
        lead_source: clean(input.lead_source),
        origination: clean(input.origination),
        budget_note: clean(input.budget_note),
        desired_completion_date: clean(input.desired_completion_date),
        desired_install_date: clean(input.desired_install_date),
        priority: requireEnum(input.priority || "normal", PRIORITIES, "priority") || "normal",
        ...requirements,
        electrical_details: clean(input.electrical_details),
        property_relationship: clean(input.property_relationship) || "unknown",
        next_action: clean(input.next_action),
        next_action_due: clean(input.next_action_due),
        next_action_assignee: clean(input.next_action_assignee),
        notes: clean(input.notes),
        source_summary: { capture_source: sourceType, captured_by: actor, captured_at: now },
      };
      const budgetAmount = Number(input.budget_amount);
      if (Number.isFinite(budgetAmount) && budgetAmount >= 0) opportunityData.budget_amount = budgetAmount;

      const oppResult = await createFoundationRecordWithRecovery({
        entity: Opportunity,
        data: opportunityData,
        readMatches: () => findByCreationKey(Opportunity, oppKey),
        label: "Opportunity intake capture",
      });
      const opportunity = oppResult.record;

      const intakeResult = await createFoundationRecordWithRecovery({
        entity: Intake,
        data: {
          creation_request_key: intakeKey,
          opportunity_id: clean(opportunity.id),
          source_type: sourceType,
          source_system: clean(input.source_system) || "ccs-app",
          source_external_id: clean(input.source_external_id),
          source_received_at: clean(input.source_received_at) || now,
          captured_at: now,
          captured_by: actor,
          captured_fields: input,
          resolution_status: "linked",
          resolution_notes: "Captured and linked through the Opportunities workspace.",
        },
        readMatches: () => findByCreationKey(Intake, intakeKey),
        label: "Opportunity intake event",
      });
      const intake = intakeResult.record;

      if (!clean(opportunity.source_primary_intake_id)) {
        await replaceFoundationFieldsIfUnchanged({
          entity: Opportunity,
          recordId: clean(opportunity.id),
          expectedFields: { source_primary_intake_id: opportunity.source_primary_intake_id ?? "" },
          nextFields: { source_primary_intake_id: clean(intake.id) },
          label: "Opportunity primary intake link",
        }).catch(() => null);
      }

      const fresh = await Opportunity.get(clean(opportunity.id)).catch(() => opportunity);
      await logActivity(Activity, {
        opportunity_id: clean(opportunity.id), actor,
        event_type: "created",
        summary: oppResult.status === "created"
          ? `Opportunity captured (${sourceType})`
          : "Intake resolved against an existing opportunity",
        details: { source_type: sourceType, intake_id: clean(intake?.id), reused: oppResult.status !== "created" },
      });
      if (oppResult.status === "created") {
        await emitOpportunityAutomation(base44, "sales_lead_created", clean(opportunity.id), actor);
      }
      return Response.json({
        success: true,
        action,
        opportunity: fresh || opportunity,
        intake,
        reused: oppResult.status !== "created",
      });
    }

    if (action === "update_opportunity") {
      const opportunityId = clean(body?.opportunity_id);
      if (!opportunityId) throw bad("opportunity_id is required.");
      const baseline = body?.baseline && typeof body.baseline === "object" ? body.baseline : null;
      const input = body?.fields && typeof body.fields === "object" ? body.fields : {};
      const desired: any = pick(input, EDITABLE_OPPORTUNITY_FIELDS);
      if (!Object.keys(desired).length) throw bad("No editable fields were provided.");

      if (Object.prototype.hasOwnProperty.call(desired, "stage")) {
        desired.stage = requireEnum(desired.stage, STAGES, "stage") || "new";
      }
      for (const field of REQUIREMENT_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(desired, field)) {
          desired[field] = requireEnum(desired[field] || "unknown", REQUIREMENT_VALUES, field) || "unknown";
        }
      }
      if (Object.prototype.hasOwnProperty.call(desired, "priority")) {
        desired.priority = requireEnum(desired.priority || "normal", PRIORITIES, "priority") || "normal";
      }
      if (Object.prototype.hasOwnProperty.call(desired, "property_relationship")) {
        const allowed = ["owner", "tenant", "agent", "unknown"];
        desired.property_relationship = requireEnum(desired.property_relationship || "unknown", allowed, "property_relationship") || "unknown";
      }
      if (Object.prototype.hasOwnProperty.call(desired, "customer_id")) {
        const cid = clean(desired.customer_id);
        if (cid) {
          const customer = await Customer.get(cid).catch(() => null);
          if (!customer?.id) throw bad("The selected Customer no longer exists.", 409);
        }
        desired.customer_id = cid;
      }
      if (Object.prototype.hasOwnProperty.call(desired, "contact_id")) {
        const cid = clean(desired.contact_id);
        if (cid) {
          const contact = await CustomerContact.get(cid).catch(() => null);
          if (!contact?.id) throw bad("The selected CustomerContact no longer exists.", 409);
        }
        desired.contact_id = cid;
      }
      if (Object.prototype.hasOwnProperty.call(desired, "location_id")) {
        const lid = clean(desired.location_id);
        if (lid) {
          const location = await CustomerLocation.get(lid).catch(() => null);
          if (!location?.id) throw bad("The selected CustomerLocation no longer exists.", 409);
        }
        desired.location_id = lid;
      }
      if (Object.prototype.hasOwnProperty.call(desired, "budget_amount")) {
        const amount = Number(desired.budget_amount);
        desired.budget_amount = Number.isFinite(amount) && amount >= 0 ? amount : null;
      }
      for (const key of Object.keys(desired)) {
        if (typeof desired[key] === "string") desired[key] = clean(desired[key]);
      }

      const now = new Date().toISOString();
      const current = await Opportunity.get(opportunityId).catch(() => null);
      if (!current?.id) throw bad("Opportunity not found.", 404);
      if (Object.prototype.hasOwnProperty.call(desired, "stage") && desired.stage !== clean(current.stage)) {
        desired.stage_changed_at = now;
        if (CLOSED_STAGES.has(desired.stage)) desired.closed_at = now;
        else if (Object.prototype.hasOwnProperty.call(desired, "closed_at") === false && clean(current.closed_at)) desired.closed_at = "";
      }
      desired.last_activity_at = now;

      const expected = expectedFor(baseline, current, desired);
      const saved = await replaceFoundationFieldsIfUnchanged({
        entity: Opportunity,
        recordId: opportunityId,
        expectedFields: expected,
        nextFields: desired,
        label: "Opportunity fields",
      });
      let syncedStage = "";
      let stageSyncWarning = "";
      if (Object.prototype.hasOwnProperty.call(desired, "stage")) {
        const linkedWoId = clean(saved?.compatibility_work_order_id) || clean(current?.compatibility_work_order_id);
        if (linkedWoId) {
          try {
            syncedStage = await syncWorkOrderStage(WorkOrder, linkedWoId, saved?.stage);
          } catch (e: any) {
            stageSyncWarning = e?.message || "Work order stage sync failed.";
          }
        }
      }
      {
        const changed = Object.keys(desired).filter((k) => !["last_activity_at", "stage_changed_at", "closed_at"].includes(k));
        const stageChanged = changed.includes("stage") && desired.stage !== clean(current.stage);
        await logActivity(Activity, {
          opportunity_id: opportunityId, actor,
          event_type: stageChanged ? "stage_changed" : "updated",
          summary: stageChanged
            ? `Stage ${clean(current.stage) || "new"} â†’ ${desired.stage}`
            : `${changed.length || 1} field${(changed.length || 1) === 1 ? "" : "s"} updated: ${changed.slice(0, 5).join(", ")}${changed.length > 5 ? "â€¦" : ""}`,
          details: { fields: changed, from_stage: clean(current.stage), to_stage: clean(saved?.stage) },
        });
        if (stageChanged) {
          await emitOpportunityAutomation(base44, "sales_status_changed", opportunityId, actor);
          const stageEvent = { won: "sales_status_won", lost: "sales_status_lost", on_hold: "sales_status_on_hold" }[clean(saved?.stage)];
          if (stageEvent) await emitOpportunityAutomation(base44, stageEvent, opportunityId, actor);
        }
        if (changed.includes("salesperson") && clean(desired.salesperson) !== clean(current.salesperson)) {
          await emitOpportunityAutomation(base44, "sales_rep_changed", opportunityId, actor);
        }
      }
      return Response.json({
        success: true, action, opportunity: saved,
        work_order_stage: syncedStage || undefined,
        stage_sync_warning: stageSyncWarning || undefined,
      });
    }

    if (action === "resolve_intake") {
      const intakeId = clean(body?.intake_id);
      const resolutionAction = clean(body?.resolution_action);
      if (!intakeId) throw bad("intake_id is required.");
      if (!["link", "reject"].includes(resolutionAction)) throw bad("resolution_action must be link or reject.");
      const intake = await Intake.get(intakeId).catch(() => null);
      if (!intake?.id) throw bad("Intake record not found.", 404);

      const desired: any = { resolution_notes: clean(body?.resolution_notes) || clean(intake.resolution_notes) };
      if (resolutionAction === "reject") {
        desired.resolution_status = "rejected";
      } else {
        const opportunityId = clean(body?.opportunity_id);
        if (!opportunityId) throw bad("opportunity_id is required to link an intake.");
        const opportunity = await Opportunity.get(opportunityId).catch(() => null);
        if (!opportunity?.id) throw bad("Opportunity not found.", 404);
        desired.resolution_status = "linked";
        desired.opportunity_id = opportunityId;
      }
      const saved = await replaceFoundationFieldsIfUnchanged({
        entity: Intake,
        recordId: intakeId,
        expectedFields: expectedFor(body?.baseline, intake, desired),
        nextFields: desired,
        label: "Opportunity intake resolution",
      });
      return Response.json({ success: true, action, intake: saved });
    }

    if (action === "link_work_order") {
      const opportunityId = clean(body?.opportunity_id);
      const workOrderId = clean(body?.work_order_id);
      const requestId = clean(body?.estimating_request_id);
      if (!opportunityId || !workOrderId) throw bad("opportunity_id and work_order_id are required.");
      const [opportunity, workOrder] = await Promise.all([
        Opportunity.get(opportunityId).catch(() => null),
        WorkOrder.get(workOrderId).catch(() => null),
      ]);
      if (!opportunity?.id) throw bad("Opportunity not found.", 404);
      if (!workOrder?.id) throw bad("WorkOrder not found.", 404);
      if (clean(workOrder.opportunity_id) && clean(workOrder.opportunity_id) !== opportunityId) {
        throw bad("WorkOrder already links a different Opportunity.", 409);
      }
      if (clean(workOrder.estimating_request_id) && requestId && clean(workOrder.estimating_request_id) !== requestId) {
        throw bad("WorkOrder already links a different EstimatingRequest.", 409);
      }
      if (clean(opportunity.compatibility_work_order_id) && clean(opportunity.compatibility_work_order_id) !== workOrderId) {
        throw bad("Opportunity already links a different compatibility WorkOrder.", 409);
      }

      const now = new Date().toISOString();
      const woDesired: any = {};
      if (!clean(workOrder.opportunity_id)) woDesired.opportunity_id = opportunityId;
      if (requestId && !clean(workOrder.estimating_request_id)) woDesired.estimating_request_id = requestId;
      let savedWorkOrder = workOrder;
      if (Object.keys(woDesired).length) {
        savedWorkOrder = await replaceFoundationFieldsIfUnchanged({
          entity: WorkOrder,
          recordId: workOrderId,
          expectedFields: expectedFor(workOrder, workOrder, woDesired),
          nextFields: woDesired,
          label: "WorkOrder opportunity compatibility links",
        });
      }

      let savedOpportunity = opportunity;
      if (!clean(opportunity.compatibility_work_order_id)) {
        savedOpportunity = await replaceFoundationFieldsIfUnchanged({
          entity: Opportunity,
          recordId: opportunityId,
          expectedFields: expectedFor(null, opportunity, {
            compatibility_work_order_id: workOrderId,
            last_activity_at: now,
          }),
          nextFields: { compatibility_work_order_id: workOrderId, last_activity_at: now },
          label: "Opportunity compatibility WorkOrder link",
        });
      }

      let syncedStage = "";
      let stageSyncWarning = "";
      try {
        syncedStage = await syncWorkOrderStage(WorkOrder, workOrderId, savedOpportunity?.stage);
      } catch (e: any) {
        stageSyncWarning = e?.message || "Work order stage sync failed.";
      }

      await logActivity(Activity, {
        opportunity_id: opportunityId, actor,
        event_type: "linked_work_order",
        summary: `Linked compatibility WorkOrder ${clean(savedWorkOrder?.title) || workOrderId}`,
        details: { work_order_id: workOrderId, work_order_stage: syncedStage || clean(savedWorkOrder?.sales_status) },
      });

      return Response.json({
        success: true,
        action,
        opportunity: savedOpportunity,
        work_order: savedWorkOrder,
        work_order_stage: syncedStage || undefined,
        stage_sync_warning: stageSyncWarning || undefined,
        reused: clean(opportunity.compatibility_work_order_id) === workOrderId && !Object.keys(woDesired).length,
      });
    }

    if (action === "request_estimate") {
      const opportunityId = clean(body?.opportunity_id);
      if (!opportunityId) throw bad("opportunity_id is required.");
      const opportunity = await Opportunity.get(opportunityId).catch(() => null);
      if (!opportunity?.id) throw bad("Opportunity not found.", 404);
      if (CLOSED_STAGES.has(clean(opportunity.stage))) {
        throw bad("Closed Opportunities cannot request a new estimate.", 409);
      }

      const key = clean(body?.creation_request_key);
      if (!key || key.length > 240) throw bad("A valid creation_request_key is required.");
      const requestKey = `${key}:request`.slice(0, 256);
      const estimateKey = `${key}:estimate`.slice(0, 256);
      const now = new Date().toISOString();

      const existingRequests = await EstimatingRequest.filter({ opportunity_id: opportunityId }, "-created_date", 100);
      const openRequest = (Array.isArray(existingRequests) ? existingRequests : [])
        .find((row: any) => OPEN_REQUEST_STATUSES.has(clean(row?.status)) && clean(row?.estimate_id));
      if (openRequest) {
        const estimate = await Estimate.get(clean(openRequest.estimate_id)).catch(() => null);
        if (estimate?.id) {
          return Response.json({
            success: true,
            action,
            estimating_request: openRequest,
            estimate,
            reused: true,
          });
        }
      }

      const [customer, primaryIntake] = await Promise.all([
        clean(opportunity.customer_id) ? Customer.get(clean(opportunity.customer_id)).catch(() => null) : null,
        clean(opportunity.source_primary_intake_id)
          ? Intake.get(clean(opportunity.source_primary_intake_id)).catch(() => null)
          : null,
      ]);
      const snapshot = buildHandoffSnapshot({ opportunity, customer, primaryIntake });

      const requestData: any = {
        creation_request_key: requestKey,
        opportunity_id: opportunityId,
        customer_id: clean(customer?.id || opportunity.customer_id),
        contact_id: clean(opportunity.contact_id),
        location_id: clean(opportunity.location_id),
        compatibility_work_order_id: clean(opportunity.compatibility_work_order_id),
        status: "ready",
        requested_at: now,
        requested_by: actor,
        submitted_at: now,
        assigned_estimator: clean(body?.assigned_estimator),
        priority: requireEnum(body?.priority || opportunity.priority || "normal", PRIORITIES, "priority") || "normal",
        desired_completion_date: clean(opportunity.desired_completion_date),
        desired_install_date: clean(opportunity.desired_install_date),
        request_notes: clean(body?.request_notes) || clean(opportunity.notes),
        survey_requirement: clean(opportunity.survey_requirement) || "unknown",
        permit_requirement: clean(opportunity.permit_requirement) || "unknown",
        installation_requirement: clean(opportunity.installation_requirement) || "unknown",
        removal_requirement: clean(opportunity.removal_requirement) || "unknown",
        electrical_requirement: clean(opportunity.electrical_requirement) || "unknown",
        handoff_snapshot_version: 1,
        handoff_snapshot: snapshot,
        attachment_refs: Array.isArray(opportunity.attachment_refs) ? opportunity.attachment_refs : [],
      };

      const requestResult = await createFoundationRecordWithRecovery({
        entity: EstimatingRequest,
        data: requestData,
        readMatches: () => findByCreationKey(EstimatingRequest, requestKey),
        label: "Estimating Request handoff",
      });
      let request = requestResult.record;

      const displayName = clean(customer?.company_name || opportunity.customer_display_name) || "Customer";
      const projectName = clean(opportunity.title) || `${displayName} â€” New estimate`;
      const requirementSummary = [
        ["Survey", snapshot.survey_requirement],
        ["Permit", snapshot.permit_requirement],
        ["Install", snapshot.installation_requirement],
        ["Removal", snapshot.removal_requirement],
        ["Electrical", snapshot.electrical_requirement],
      ]
        .filter(([, v]) => v && v !== "unknown" && v !== "na")
        .map(([k, v]) => `${k}: ${v}`)
        .join(" Â· ");
      const notesText = [
        clean(snapshot.job_description),
        requirementSummary ? `Requirements â€” ${requirementSummary}` : "",
        clean(snapshot.notes),
      ].filter(Boolean).join("\n");
      const estimateData: any = {
        creation_request_key: estimateKey,
        project_name: projectName,
        client_name: displayName,
        customer_id: clean(customer?.id || opportunity.customer_id) || null,
        opportunity_id: opportunityId,
        estimating_request_id: clean(request.id),
        salesperson: clean(opportunity.salesperson),
        site_address: clean(snapshot.captured_site_address),
        contact_name: clean(snapshot.captured_contact_name),
        order_contact: clean(snapshot.captured_contact_name),
        contact_email: clean(snapshot.captured_contact_email),
        contact_phone: clean(snapshot.captured_contact_phone),
        office_phone: clean(snapshot.captured_contact_phone || customer?.company_phone),
        target_install_date: clean(snapshot.desired_install_date || snapshot.desired_completion_date),
        priority: clean(opportunity.priority) || "normal",
        notes: notesText,
        status: "draft",
      };
      const estimateResult = await createFoundationRecordWithRecovery({
        entity: Estimate,
        data: estimateData,
        readMatches: () => findByCreationKey(Estimate, estimateKey),
        label: "Estimating Request estimate",
      });
      const estimate = estimateResult.record;

      if (clean(request.status) !== "in_progress" || clean(request.estimate_id) !== clean(estimate.id)) {
        request = await replaceEstimatingRequestFieldsIfUnchanged({
          entity: EstimatingRequest,
          recordId: clean(request.id),
          expectedFields: { status: request.status, estimate_id: request.estimate_id ?? "" },
          nextFields: { status: "in_progress", estimate_id: clean(estimate.id) },
          label: "Estimating Request estimate link",
        });
      }

      const opportunityDesired: any = {
        primary_estimating_request_id: clean(request.id),
        last_activity_at: now,
      };
      if (!["estimating", "quoted"].includes(clean(opportunity.stage))) {
        opportunityDesired.stage = "estimating";
        opportunityDesired.stage_changed_at = now;
      }
      const freshOpportunity = await replaceFoundationFieldsIfUnchanged({
        entity: Opportunity,
        recordId: opportunityId,
        expectedFields: expectedFoundationFields(opportunity, opportunityDesired),
        nextFields: opportunityDesired,
        label: "Opportunity estimating link",
      }).catch(() => null);

      await logActivity(Activity, {
        opportunity_id: opportunityId, actor,
        event_type: "estimate_requested",
        summary: `Estimate requested â€” ${clean(estimate?.project_name) || clean(estimate?.estimate_number) || clean(estimate?.id)}`,
        details: {
          estimating_request_id: clean(request?.id),
          estimate_id: clean(estimate?.id),
          priority: clean(request?.priority),
          assigned_estimator: clean(request?.assigned_estimator),
          reused: requestResult.status !== "created",
        },
      });
      if (opportunityDesired.stage && clean(freshOpportunity?.stage) === "estimating" && clean(opportunity.stage) !== "estimating") {
        await emitOpportunityAutomation(base44, "sales_status_changed", opportunityId, actor);
      }

      return Response.json({
        success: true,
        action,
        estimating_request: request,
        estimate,
        opportunity: freshOpportunity || opportunity,
        reused: requestResult.status !== "created",
      });
    }

    if (action === "get_customer_360") {
      const customerId = clean(body?.customer_id);
      const customer = await Customer.get(customerId).catch(() => null);
      if (!customer?.id) throw bad("Customer not found.", 404);
      // Scoped paged reads — default-limited filters silently dropped rows
      // past the first 50, which corrupted the summary totals and AR aging.
      const [contacts, locations, opportunities, invoices, workOrders, payments, estimates] = await Promise.all([
        loadAllEntityRows({ entity: CustomerContact, query: { customer_id: customerId }, sort: "-created_date", label: "Customer contacts" }).catch(() => []),
        loadAllEntityRows({ entity: CustomerLocation, query: { customer_id: customerId }, sort: "-created_date", label: "Customer locations" }).catch(() => []),
        loadAllEntityRows({ entity: Opportunity, query: { customer_id: customerId }, sort: "-created_date", label: "Customer opportunities" }).catch(() => []),
        loadAllEntityRows({ entity: Invoice, query: { customer_id: customerId }, sort: "-created_date", label: "Customer invoices" }).catch(() => []),
        loadAllEntityRows({ entity: WorkOrder, query: { customer_id: customerId }, sort: "-created_date", label: "Customer work orders" }).catch(() => []),
        loadAllEntityRows({ entity: Payment, query: { customer_id: customerId }, sort: "-created_date", label: "Customer payments" }).catch(() => []),
        loadAllEntityRows({ entity: Estimate, query: { customer_id: customerId }, sort: "-created_date", label: "Customer estimates" }).catch(() => []),
      ]);
      const custEstimates = (Array.isArray(estimates) ? estimates : []).filter((e: any) => e?.deleted !== true)
        .sort((a: any, b: any) => clean(b?.created_date).localeCompare(clean(a?.created_date)));
      const estimateStatusCounts: any = {};
      for (const e of custEstimates) { const st = clean(e?.status) || "draft"; estimateStatusCounts[st] = (estimateStatusCounts[st] || 0) + 1; }
      const inv = Array.isArray(invoices) ? invoices : [];
      const liveInvoices = inv.filter((i: any) => !["draft", "void"].includes(clean(i?.status)));
      const opps = (Array.isArray(opportunities) ? opportunities : [])
        .sort((a: any, b: any) => clean(b?.created_date).localeCompare(clean(a?.created_date)));
      const jobs = (Array.isArray(workOrders) ? workOrders : [])
        .filter((w: any) => w?.deleted !== true)
        .sort((a: any, b: any) => clean(b?.created_date).localeCompare(clean(a?.created_date)));
      const asOf = new Date().toISOString().slice(0, 10);
      const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
      for (const i of liveInvoices) {
        const balance = num(i?.balance_due);
        if (balance <= 0) continue;
        const due = clean(i?.due_date) || asOf;
        const days = Math.floor((Date.parse(asOf) - Date.parse(due)) / 86400000);
        if (days <= 0) aging.current += balance;
        else if (days <= 30) aging.d1_30 += balance;
        else if (days <= 60) aging.d31_60 += balance;
        else if (days <= 90) aging.d61_90 += balance;
        else aging.d90_plus += balance;
      }
      for (const key of Object.keys(aging)) (aging as any)[key] = money((aging as any)[key]);
      const custPayments = (Array.isArray(payments) ? payments : [])
        .filter((p: any) => clean(p?.status) !== "void")
        .sort((a: any, b: any) => clean(b?.paid_date || b?.created_date).localeCompare(clean(a?.paid_date || a?.created_date)));
      const custContacts = Array.isArray(contacts) ? contacts : [];
      const custLocations = Array.isArray(locations) ? locations : [];
      return Response.json({
        success: true, action,
        customer,
        contacts: custContacts,
        locations: custLocations,
        opportunities: opps.slice(0, 50).map((o: any) => ({
          id: clean(o?.id), title: clean(o?.title), stage: clean(o?.stage),
          budget_amount: num(o?.budget_amount), salesperson: clean(o?.salesperson),
          desired_install_date: clean(o?.desired_install_date), created_date: clean(o?.created_date),
        })),
        jobs: jobs.slice(0, 50).map((w: any) => ({
          id: clean(w?.id), title: clean(w?.title), client_name: clean(w?.client_name),
          current_stage: clean(w?.current_stage), sales_status: clean(w?.sales_status),
          estimate_amount: num(w?.estimate_amount), created_date: clean(w?.created_date),
        })),
        estimates: custEstimates.slice(0, 50).map((e: any) => ({
          id: clean(e?.id), estimate_number: clean(e?.estimate_number), project_name: clean(e?.project_name),
          status: clean(e?.status), quote_total: num(e?.quote_total), quote_version: num(e?.quote_version),
          quote_valid_until: clean(e?.quote_valid_until || e?.quote_expiration_date), created_date: clean(e?.created_date),
        })),
        estimate_funnel: estimateStatusCounts,
        invoices: inv
          .sort((a: any, b: any) => clean(b?.created_date).localeCompare(clean(a?.created_date)))
          .slice(0, 50)
          .map((i: any) => ({
            id: clean(i?.id), invoice_number: clean(i?.invoice_number), status: clean(i?.status),
            billing_type: clean(i?.billing_type), total: num(i?.total),
            amount_paid: num(i?.amount_paid), balance_due: num(i?.balance_due),
            issue_date: clean(i?.issue_date), due_date: clean(i?.due_date), terms: clean(i?.terms),
            created_date: clean(i?.created_date),
            days_overdue: clean(i?.due_date)
              ? Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(clean(i.due_date))) / 86400000))
              : 0,
          })),
        payments: custPayments
          .slice(0, 100)
          .map((p: any) => ({
            id: clean(p?.id), invoice_id: clean(p?.invoice_id), status: clean(p?.status),
            paid_date: clean(p?.paid_date || p?.created_date).slice(0, 10),
            amount: num(p?.amount), method: clean(p?.method), reference_number: clean(p?.reference_number),
          })),
        // Honest coverage: lists above stay display-capped; these report
        // how much was actually loaded vs. returned.
        totals: {
          contacts: custContacts.length,
          locations: custLocations.length,
          opportunities: opps.length,
          jobs: jobs.length,
          estimates: custEstimates.length,
          invoices: inv.length,
          payments: custPayments.length,
        },
        truncated: {
          opportunities: opps.length > 50,
          jobs: jobs.length > 50,
          estimates: custEstimates.length > 50,
          invoices: inv.length > 50,
          payments: custPayments.length > 100,
        },
        summary: {
          open_opportunities: opps.filter((o: any) => !CLOSED_STAGES.has(clean(o?.stage))).length,
          open_pipeline_value: money(opps.filter((o: any) => !CLOSED_STAGES.has(clean(o?.stage))).reduce((s: number, o: any) => s + num(o?.budget_amount), 0)),
          invoiced_total: money(liveInvoices.reduce((s: number, i: any) => s + num(i?.total), 0)),
          collected_total: money(liveInvoices.reduce((s: number, i: any) => s + num(i?.amount_paid), 0)),
          open_ar: money(liveInvoices.reduce((s: number, i: any) => s + num(i?.balance_due), 0)),
          jobs_count: jobs.length,
        },
        ar_aging: { ...aging, as_of: asOf },
      });
    }

    // Customer workspace (360): the same aggregate idea as get_opportunity but
    // keyed on customer_id, so the customer page renders pipeline, quotes, jobs,
    // AR and document history from one call. Entities with a customer_id column
    // filter on it directly; purchase orders and activity rows carry only
    // document links, so they match on the customer's opportunity / estimate /
    // work order ids instead. Each list is capped at LIST_CAP (activities at
    // ACTIVITY_CAP) with per-list truncated flags; totals are computed over
    // every loaded row, capped or not.
    if (action === "customer_workspace") {
      const customerId = clean(body?.customer_id || body?.id);
      if (!customerId) throw bad("customer_id is required.");
      const customer = await Customer.get(customerId).catch(() => null);
      if (!customer?.id) throw bad("Customer not found.", 404);

      const LIST_CAP = 500;
      const ACTIVITY_CAP = 50;
      // Fetch deeper than the display cap so totals reflect more than the
      // first page and a length beyond LIST_CAP reliably marks truncation.
      const FETCH_LIMIT = 1000;
      const rows = (v: any) => (Array.isArray(v) ? v : []);
      const descCreated = (a: any, b: any) => clean(b?.created_date).localeCompare(clean(a?.created_date));

      const [contacts, locations, opportunities, estimates, workOrders, invoices, payments, changeOrders] = await Promise.all([
        CustomerContact.filter({ customer_id: customerId }, "-created_date", FETCH_LIMIT).catch(() => []),
        CustomerLocation.filter({ customer_id: customerId }, "-created_date", FETCH_LIMIT).catch(() => []),
        Opportunity.filter({ customer_id: customerId }, "-created_date", FETCH_LIMIT).catch(() => []),
        Estimate.filter({ customer_id: customerId }, "-created_date", FETCH_LIMIT).catch(() => []),
        WorkOrder.filter({ customer_id: customerId }, "-created_date", FETCH_LIMIT).catch(() => []),
        Invoice.filter({ customer_id: customerId }, "-created_date", FETCH_LIMIT).catch(() => []),
        Payment.filter({ customer_id: customerId }, "-created_date", FETCH_LIMIT).catch(() => []),
        ChangeOrder.filter({ customer_id: customerId }, "-created_date", FETCH_LIMIT).catch(() => []),
      ]);

      const customerOpportunities = rows(opportunities).sort(descCreated);
      const customerEstimates = rows(estimates).filter((e: any) => e?.deleted !== true).sort(descCreated);
      const customerWorkOrders = rows(workOrders).filter((w: any) => w?.deleted !== true).sort(descCreated);
      const customerInvoices = rows(invoices).sort(descCreated);
      const customerPayments = rows(payments).filter((p: any) => clean(p?.status) !== "void").sort(descCreated);
      const customerChangeOrders = rows(changeOrders).sort(descCreated);

      const opportunityIds = new Set(customerOpportunities.map((o: any) => clean(o?.id)).filter(Boolean));
      const estimateIds = new Set(customerEstimates.map((e: any) => clean(e?.id)).filter(Boolean));
      const workOrderIds = new Set(customerWorkOrders.map((w: any) => clean(w?.id)).filter(Boolean));

      const [poScan, activityScan] = await Promise.all([
        // Purchase orders have no customer column — match the rows linked to
        // any of the customer's documents (get_opportunity uses the same
        // opportunity_id / estimate_id / work_order_id linkage for one opp).
        PurchaseOrder.filter({}, "-created_date", 4000).catch(() => []),
        // Activity rows link only by opportunity_id. A per-opp fan-out is
        // exact for small accounts; past a dozen opportunities one scan of
        // the recent activity tail is cheaper than N entity calls.
        opportunityIds.size <= 12
          ? Promise.all([...opportunityIds].map((oppId) =>
              Activity.filter({ opportunity_id: oppId }, "-created_date", ACTIVITY_CAP + 1).catch(() => [])))
              .then((sets: any[]) => sets.flat())
          : Activity.filter({}, "-created_date", 3000).catch(() => []),
      ]);
      const purchaseOrders = rows(poScan)
        .filter((p: any) =>
          opportunityIds.has(clean(p?.opportunity_id))
          || estimateIds.has(clean(p?.estimate_id))
          || workOrderIds.has(clean(p?.work_order_id)))
        .sort(descCreated);
      const activities = rows(activityScan)
        .flat()
        .filter((a: any) => opportunityIds.has(clean(a?.opportunity_id)))
        .sort(descCreated);

      // invoicingAction semantics: live = non-void; invoiced = sum(total),
      // paid = sum(amount_paid), balance = sum(balance_due) over live rows.
      const liveInvoices = customerInvoices.filter((i: any) => clean(i?.status) !== "void");
      const totals = {
        estimate_count: customerEstimates.length,
        estimate_value: money(customerEstimates.reduce((s: number, e: any) => s + num(e?.quote_total), 0)),
        // draft/calculated/sent = still in play (bulk_remarkup open set);
        // approved/archived/cancelled are decided.
        open_estimate_value: money(customerEstimates
          .filter((e: any) => ["draft", "calculated", "sent"].includes(clean(e?.status)))
          .reduce((s: number, e: any) => s + num(e?.quote_total), 0)),
        work_order_count: customerWorkOrders.length,
        invoiced: money(liveInvoices.reduce((s: number, i: any) => s + num(i?.total), 0)),
        paid: money(liveInvoices.reduce((s: number, i: any) => s + num(i?.amount_paid), 0)),
        balance: money(liveInvoices.reduce((s: number, i: any) => s + num(i?.balance_due), 0)),
        // PO_STATUSES: draft/sent/partially_received are open; received and
        // cancelled are done.
        open_po_count: purchaseOrders.filter((p: any) => ["draft", "sent", "partially_received"].includes(clean(p?.status))).length,
        // Pending follow-ups = open-stage opportunities with a next action,
        // the same predicate list_follow_ups uses.
        open_activity_count: customerOpportunities
          .filter((o: any) => !CLOSED_STAGES.has(clean(o?.stage)) && (clean(o?.next_action) || clean(o?.next_action_due)))
          .length,
      };

      const lists: Record<string, any[]> = {
        contacts: rows(contacts).sort(descCreated),
        locations: rows(locations).sort(descCreated),
        opportunities: customerOpportunities,
        estimates: customerEstimates,
        work_orders: customerWorkOrders,
        invoices: customerInvoices,
        payments: customerPayments,
        purchase_orders: purchaseOrders,
        change_orders: customerChangeOrders,
        activities: activities,
      };
      const truncated: Record<string, boolean> = {};
      const capped: Record<string, any[]> = {};
      for (const [key, items] of Object.entries(lists)) {
        const cap = key === "activities" ? ACTIVITY_CAP : LIST_CAP;
        truncated[key] = items.length > cap;
        capped[key] = items.slice(0, cap);
      }
      return Response.json({ success: true, action, customer, ...capped, totals, truncated });
    }

    throw bad(`Unsupported opportunity workspace action: ${action}`);
  } catch (error: any) {
    const status = Number(error?.status || error?.statusCode || 500);
    const safeStatus = [400, 401, 403, 404, 409, 423, 429, 503].includes(status) ? status : 500;
    console.error("opportunityWorkspaceAction error:", error?.message || error);
    return Response.json({
      success: false,
      error: clean(error?.message || "Opportunity workspace action failed."),
    }, { status: safeStatus });
  }
});