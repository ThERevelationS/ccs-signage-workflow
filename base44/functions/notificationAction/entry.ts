import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import { withEntityRateLimitRetry } from "../../shared/entityRateLimitRetry.ts";
import { loadAllEntityRows } from "../../shared/pagedEntityRows.ts";

// Persisted-notification layer for the unified attention feed
// (ESTIMATOR_BACKLOG §14: #326-#350). The live `attention_feed` payload still
// answers "what needs attention right now"; this action persists discrete
// EVENTS — quote approved, estimator assigned, quote expiring, invoice went
// overdue, request unassigned >2d, stale pipeline sync, needs_recalc, watch
// hits, daily digest — as per-recipient Notification rows, plus the
// per-user NotificationPreference row that backs section toggles, sound,
// digest opt-in, and the feed-item handled/snooze overlays.
//
// Everything is staff-session authenticated; both entities are backend-only
// RLS, so ALL access flows through this action with service-role entities.
// No email is ever sent — sendEmail stays disabled by design.

const clean = (v: any) => String(v ?? "").trim();
const num = (v: any, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
const list = (v: any) => (Array.isArray(v) ? v : []);
const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { statusCode: status });

const NOTIF_CATEGORIES = new Set([
  "quote_approved", "estimate_sent", "estimate_assigned", "quote_expiring",
  "invoice_overdue", "unassigned_escalation", "sync_pending", "needs_recalc",
  "watch_hit", "digest", "system",
]);
const SEVERITIES = new Set(["info", "warning", "critical", "celebration"]);

// How long a snooze defaults to, and how far back detectors may look so a
// deploy does not flood recipients with months-old transitions.
const DEFAULT_SNOOZE_HOURS = 4;
const DETECTOR_LOOKBACK_MS = 14 * 86400000;
const UNASSIGNED_ESCALATE_MS = 2 * 86400000;
const SYNC_PENDING_STALE_MS = 86400000;
const QUOTE_EXPIRY_WINDOW_MS = 7 * 86400000;
const EVAL_THROTTLE_MS = 10 * 60 * 1000;
const SCAN_CACHE_MS = 5 * 60 * 1000;
const MAX_CREATES_PER_EVAL = 40;
const DEDUPE_INDEX_ROWS = 800;
const DISMISSED_ITEMS_CAP = 300;

// Module-scope scan cache — evaluate_triggers reads the same tables the
// attention feed does, and every signed-in tab asks for an evaluation. The
// scans are recipient-agnostic, so a 5-minute cache lets one warm isolate
// serve every caller without multiplying entity reads. (Same pattern as
// attentionFeedRowsCache in opportunityWorkspaceAction.)
const scanCache = new Map<string, { rows: any[]; expires: number }>();
async function cachedScan<T>(key: string, loader: () => Promise<T[]>): Promise<T[]> {
  const hit = scanCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.rows as T[];
  const rows = (await loader().catch(() => [] as T[])) as T[];
  scanCache.set(key, { rows: Array.isArray(rows) ? rows : [], expires: Date.now() + SCAN_CACHE_MS });
  return rows;
}

const iso = (d = new Date()) => d.toISOString();

function sortNewest(rows: any[]) {
  return [...list(rows)].sort((a, b) => clean(b?.created_date).localeCompare(clean(a?.created_date)));
}

function activeNotification(n: any, nowMs: number) {
  if (clean(n?.handled_at)) return false;
  const snooze = Date.parse(clean(n?.snoozed_until));
  if (Number.isFinite(snooze) && snooze > nowMs) return false;
  return true;
}

// Resolve a stored "assigned_estimator"/"salesperson" string — it may be an
// email or a display name — to a recipient email using the staff directory.
function resolveStaffEmail(raw: any, directory: any[]) {
  const needle = clean(raw).toLowerCase();
  if (!needle) return "";
  if (needle.includes("@")) return needle;
  const match = directory.find((u) =>
    clean(u?.full_name).toLowerCase() === needle ||
    clean(u?.name).toLowerCase() === needle ||
    clean(u?.username).toLowerCase() === needle);
  return clean(match?.email).toLowerCase();
}

async function getOwnPrefRow(Pref: any, me: string) {
  const rows = await Pref.filter({ user_email: me }, "-created_date", 3).catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function ensureOwnPrefRow(Pref: any, me: string) {
  const existing = await getOwnPrefRow(Pref, me);
  if (existing?.id) return existing;
  const payload = {
    user_email: me,
    schema_version: 1,
    hidden_sections: [],
    section_snoozed_until: {},
    dismissed_feed_items: [],
    sound_on: true,
    digest_opt_in: false,
    creation_request_key: `notifpref:${me}`.slice(0, 256),
  };
  try {
    return await Pref.create(payload);
  } catch {
    // Concurrent first-write — re-read the winner.
    const raced = await getOwnPrefRow(Pref, me).catch(() => null);
    return raced || null;
  }
}

function normalizeDismissedItems(value: any) {
  const out: any[] = [];
  const seen = new Set<string>();
  for (const raw of list(value)) {
    const id = clean(raw?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      handled_at: clean(raw?.handled_at) || undefined,
      snoozed_until: clean(raw?.snoozed_until) || undefined,
    });
  }
  return out.slice(-DISMISSED_ITEMS_CAP);
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const me = clean(user?.email).toLowerCase() || clean(user?.id).toLowerCase();
    if (!me) throw bad("A signed-in user is required.", 401);
    const actorName = clean(user?.full_name) || clean(user?.name) || me;
    const action = clean(body?.action);
    if (!action) throw bad("An action is required.");

    const Notification = base44.asServiceRole.entities.Notification;
    const Pref = base44.asServiceRole.entities.NotificationPreference;
    const nowMs = Date.now();

    // ---- Reads ---------------------------------------------------------------

    if (action === "list_mine") {
      const limit = Math.min(Math.max(num(body?.limit, 60) || 60, 1), 200);
      const includeHandled = body?.include_handled === true;
      const includeSnoozed = body?.include_snoozed === true;
      const rows = await Notification.filter({ recipient_email: me }, "-created_date", Math.min(limit * 3, 300)).catch(() => []);
      const now = nowMs;
      const mine = sortNewest(rows).filter((n: any) => {
        if (!includeHandled && clean(n?.handled_at)) return false;
        if (!includeSnoozed) {
          const s = Date.parse(clean(n?.snoozed_until));
          if (Number.isFinite(s) && s > now) return false;
        }
        return true;
      });
      const visible = mine.slice(0, limit);
      const unread = mine.filter((n: any) => !clean(n?.read_at)).length;
      return Response.json({ success: true, action, notifications: visible, unread_count: unread, total: mine.length });
    }

    if (action === "unread_count") {
      const rows = await Notification.filter({ recipient_email: me }, "-created_date", 200).catch(() => []);
      const now = nowMs;
      const count = list(rows).filter((n: any) => activeNotification(n, now) && !clean(n?.read_at)).length;
      return Response.json({ success: true, action, unread_count: count });
    }

    if (action === "history") {
      // Notification history log (#350): the entity IS the log — this is a
      // filtered read over the caller's rows, including read/snoozed/handled.
      const limit = Math.min(Math.max(num(body?.limit, 200) || 200, 1), 400);
      const rows = await Notification.filter({ recipient_email: me }, "-created_date", Math.min(limit * 2, 400)).catch(() => []);
      const category = clean(body?.category).toLowerCase();
      const q = clean(body?.q).toLowerCase();
      const includeHandled = body?.include_handled !== false;
      const sinceDays = Math.min(Math.max(num(body?.since_days, 0), 0), 365);
      const sinceMs = sinceDays > 0 ? nowMs - sinceDays * 86400000 : 0;
      const items = sortNewest(rows).filter((n: any) => {
        if (!includeHandled && clean(n?.handled_at)) return false;
        if (category && clean(n?.category).toLowerCase() !== category) return false;
        if (sinceMs && Date.parse(clean(n?.created_date)) < sinceMs) return false;
        if (q) {
          const hay = `${clean(n?.title)} ${clean(n?.body)} ${clean(n?.deep_link)}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }).slice(0, limit);
      return Response.json({ success: true, action, notifications: items, total: items.length });
    }

    // ---- Per-notification transitions -----------------------------------------

    const loadOwnNotification = async () => {
      const id = clean(body?.id);
      if (!id) throw bad("A notification id is required.");
      const row = await Notification.get(id).catch(() => null);
      if (!row?.id) throw bad("Notification not found.", 404);
      if (clean(row?.recipient_email).toLowerCase() !== me) throw bad("That notification belongs to someone else.", 403);
      return row;
    };

    if (action === "mark_read") {
      const row = await loadOwnNotification();
      if (!clean(row?.read_at)) await Notification.update(row.id, { read_at: iso() });
      return Response.json({ success: true, action, id: row.id });
    }

    if (action === "mark_all_read") {
      const category = clean(body?.category).toLowerCase();
      const rows = await Notification.filter({ recipient_email: me }, "-created_date", 500).catch(() => []);
      const targets = list(rows).filter((n: any) =>
        !clean(n?.read_at) && (!category || clean(n?.category).toLowerCase() === category));
      let marked = 0;
      let markReadWarning = "";
      for (const n of targets.slice(0, 500)) {
        await Notification.update(n.id, { read_at: iso() }).then(() => { marked += 1; }).catch((e: any) => { markReadWarning = String(e?.message || e); });
      }
      return Response.json({ success: true, action, marked, unread_total: targets.length, mark_read_warning: markReadWarning || undefined });
    }

    if (action === "snooze") {
      const row = await loadOwnNotification();
      const until = clean(body?.until);
      const hours = num(body?.hours, DEFAULT_SNOOZE_HOURS) || DEFAULT_SNOOZE_HOURS;
      const snoozedUntil = Number.isFinite(Date.parse(until))
        ? new Date(Date.parse(until)).toISOString()
        : new Date(nowMs + Math.min(Math.max(hours, 0.25), 24 * 30) * 3600000).toISOString();
      await Notification.update(row.id, { snoozed_until: snoozedUntil });
      return Response.json({ success: true, action, id: row.id, snoozed_until: snoozedUntil });
    }

    if (action === "unsnooze") {
      const row = await loadOwnNotification();
      await Notification.update(row.id, { snoozed_until: null });
      return Response.json({ success: true, action, id: row.id });
    }

    if (action === "mark_handled") {
      const row = await loadOwnNotification();
      const patch: any = { handled_at: iso(), handled_by: me };
      if (!clean(row?.read_at)) patch.read_at = iso();
      await Notification.update(row.id, patch);
      return Response.json({ success: true, action, id: row.id });
    }

    if (action === "unhandle") {
      const row = await loadOwnNotification();
      await Notification.update(row.id, { handled_at: null, handled_by: null });
      return Response.json({ success: true, action, id: row.id });
    }

    // ---- Writes ---------------------------------------------------------------

    // record — for internal/system event writes from staff sessions (#329,
    // #335, #346, #347 supplement paths). dedupe_key makes each logical event
    // notify at most once per recipient.
    if (action === "record") {
      const recipient = clean(body?.recipient_email).toLowerCase() || me;
      const category = clean(body?.category).toLowerCase();
      const title = clean(body?.title);
      if (!NOTIF_CATEGORIES.has(category)) throw bad(`category must be one of ${[...NOTIF_CATEGORIES].join(", ")}.`);
      if (!title) throw bad("A title is required.");
      if (recipient !== me) {
        // Cross-recipient writes must target a real staff account — keeps a
        // mistyped address from silently dropping the notification.
        const dir = await cachedScan("staff_directory", () =>
          loadAllEntityRows({ entity: base44.asServiceRole.entities.AuthorizedEmail, label: "Notification staff directory" }));
        const found = dir.find((u: any) => clean(u?.email).toLowerCase() === recipient && u?.is_deactivated !== true);
        if (!found) throw bad("recipient_email is not an active staff account.", 400);
      }
      const dedupeBase = clean(body?.dedupe_key);
      const dedupeKey = dedupeBase ? `${recipient}:${dedupeBase}`.slice(0, 256) : "";
      if (dedupeKey) {
        const dupes = await Notification.filter({ dedupe_key: dedupeKey }, "-created_date", 1).catch(() => []);
        if (Array.isArray(dupes) && dupes.length) {
          return Response.json({ success: true, action, notification: dupes[0], reused: true });
        }
      }
      const data: any = {
        recipient_email: recipient,
        category,
        severity: SEVERITIES.has(clean(body?.severity).toLowerCase()) ? clean(body?.severity).toLowerCase() : "info",
        title: title.slice(0, 300),
        body: clean(body?.body).slice(0, 1000),
        deep_link: clean(body?.deep_link).slice(0, 500),
        source_event: clean(body?.source_event) || "record",
        source_id: clean(body?.source_id),
        meta: body?.meta && typeof body.meta === "object" && !Array.isArray(body.meta) ? body.meta : {},
        created_by: me,
      };
      if (dedupeKey) {
        data.dedupe_key = dedupeKey;
        data.creation_request_key = `notif:${dedupeKey}`.slice(0, 256);
      } else {
        data.creation_request_key = `notif:${me}:${nowMs}:${Math.random().toString(36).slice(2, 10)}`.slice(0, 256);
      }
      const created = await Notification.create(data);
      return Response.json({ success: true, action, notification: created, reused: false });
    }

    // ---- Preferences ----------------------------------------------------------

    if (action === "get_preferences") {
      const row = await getOwnPrefRow(Pref, me);
      return Response.json({
        success: true,
        action,
        preferences: row ? {
          hidden_sections: list(row.hidden_sections).map(clean).filter(Boolean),
          section_snoozed_until: row.section_snoozed_until && typeof row.section_snoozed_until === "object" ? row.section_snoozed_until : {},
          dismissed_feed_items: normalizeDismissedItems(row.dismissed_feed_items),
          sound_on: row.sound_on !== false,
          digest_opt_in: row.digest_opt_in === true,
          last_digest_date: clean(row.last_digest_date),
        } : {
          hidden_sections: [], section_snoozed_until: {}, dismissed_feed_items: [],
          sound_on: true, digest_opt_in: false, last_digest_date: "",
        },
        exists: !!row,
      });
    }

    if (action === "save_preferences") {
      const requestId = clean(body?.request_id);
      const row = await ensureOwnPrefRow(Pref, me);
      if (!row?.id) throw bad("Could not load notification preferences.", 503);
      if (requestId && clean(row.last_request_id) === requestId) {
        return Response.json({ success: true, action, reused: true });
      }
      const patch: any = {};
      if (Array.isArray(body?.hidden_sections)) {
        patch.hidden_sections = body.hidden_sections.map(clean).filter(Boolean).slice(0, 60);
      }
      if (body?.section_snoozed_until && typeof body.section_snoozed_until === "object" && !Array.isArray(body.section_snoozed_until)) {
        const pruned: Record<string, number> = {};
        for (const [k, v] of Object.entries(body.section_snoozed_until)) {
          const t = num(v);
          if (t > nowMs - 86400000) pruned[clean(k)] = t; // drop already-expired snoozes
        }
        patch.section_snoozed_until = pruned;
      }
      if (typeof body?.sound_on === "boolean") patch.sound_on = body.sound_on;
      if (typeof body?.digest_opt_in === "boolean") patch.digest_opt_in = body.digest_opt_in;
      if (clean(body?.last_digest_date)) patch.last_digest_date = clean(body.last_digest_date).slice(0, 10);
      if (requestId) patch.last_request_id = requestId.slice(0, 128);
      patch.schema_version = 1;
      if (Object.keys(patch).length > 1 || requestId) await Pref.update(row.id, patch);
      return Response.json({ success: true, action, saved: Object.keys(patch) });
    }

    // Feed-item overlay (#332/#340): handled/snooze per feed item, persisted
    // per user on the preference row so it follows the account across devices.
    if (action === "dismiss_feed_item") {
      const ids = list(body?.item_ids).map(clean).filter(Boolean);
      const single = clean(body?.item_id);
      if (single) ids.push(single);
      if (!ids.length) throw bad("item_id or item_ids is required.");
      const mode = clean(body?.mode) || "handled";
      if (!["handled", "snooze"].includes(mode)) throw bad("mode must be handled or snooze.");
      const row = await ensureOwnPrefRow(Pref, me);
      if (!row?.id) throw bad("Could not load notification preferences.", 503);
      const items = normalizeDismissedItems(row.dismissed_feed_items);
      const byId = new Map(items.map((i) => [i.id, i]));
      const hours = num(body?.hours, DEFAULT_SNOOZE_HOURS) || DEFAULT_SNOOZE_HOURS;
      for (const id of ids.slice(0, 100)) {
        const entry = byId.get(id) || { id };
        if (mode === "handled") entry.handled_at = iso();
        else entry.snoozed_until = new Date(nowMs + Math.min(Math.max(hours, 0.25), 24 * 30) * 3600000).toISOString();
        byId.set(id, entry);
      }
      await Pref.update(row.id, { dismissed_feed_items: [...byId.values()].slice(-DISMISSED_ITEMS_CAP) });
      return Response.json({ success: true, action, dismissed: Math.min(ids.length, 100) });
    }

    if (action === "clear_feed_item") {
      const id = clean(body?.item_id);
      if (!id) throw bad("item_id is required.");
      const row = await getOwnPrefRow(Pref, me);
      if (!row?.id) return Response.json({ success: true, action, cleared: 0 });
      const items = normalizeDismissedItems(row.dismissed_feed_items).filter((i) => i.id !== id);
      await Pref.update(row.id, { dismissed_feed_items: items });
      return Response.json({ success: true, action, cleared: 1 });
    }

    // ---- Daily digest (#333) ---------------------------------------------------
    // In-app only — no email. The caller already holds the attention_feed
    // payload, so it passes the section counts; we persist one deduped digest
    // Notification per user per local day.
    if (action === "daily_digest") {
      const today = clean(body?.today) || new Date().toISOString().slice(0, 10);
      const row = await ensureOwnPrefRow(Pref, me);
      if (!row?.id) throw bad("Could not load notification preferences.", 503);
      if (clean(row.last_digest_date) === today) {
        return Response.json({ success: true, action, reused: true, date: today });
      }
      const counts = body?.counts && typeof body.counts === "object" && !Array.isArray(body.counts) ? body.counts : {};
      const entries = Object.entries(counts)
        .map(([k, v]) => [clean(k), num(v)] as const)
        .filter(([k, v]) => k && v > 0)
        .sort((a, b) => b[1] - a[1]);
      const total = entries.reduce((s, [, v]) => s + v, 0);
      const dedupeKey = `${me}:digest:${today}`;
      const dupes = await Notification.filter({ dedupe_key: dedupeKey }, "-created_date", 1).catch(() => []);
      let notification = Array.isArray(dupes) && dupes.length ? dupes[0] : null;
      if (!notification) {
        notification = await Notification.create({
          recipient_email: me,
          category: "digest",
          severity: total > 0 ? "info" : "info",
          title: `Daily digest — ${today}`,
          body: total
            ? `${total} item${total === 1 ? "" : "s"} need attention: ${entries.slice(0, 8).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(" · ")}${entries.length > 8 ? ` · +${entries.length - 8} more sections` : ""}`
            : "Nothing needs attention right now.",
          deep_link: "/MainWorkflow",
          source_event: "daily_digest",
          dedupe_key: dedupeKey.slice(0, 256),
          creation_request_key: `notif:${dedupeKey}`.slice(0, 256),
          meta: { counts: Object.fromEntries(entries), total },
          created_by: "daily_digest",
        });
      }
      let digestStampWarning = "";
      await Pref.update(row.id, { last_digest_date: today }).catch((e: any) => { digestStampWarning = String(e?.message || e); });
      return Response.json({ success: true, action, notification, reused: false, date: today, digest_warning: digestStampWarning || undefined });
    }

    // ---- Trigger evaluation ----------------------------------------------------
    // evaluate_triggers (#329/#335/#342/#343/#344/#346/#347/#349): converts
    // recently-observed STATE into once-per-recipient persisted notifications.
    // Dedupe keys are deterministic (<type>:<source>:<recipient>) so a
    // transition notifies exactly once; throttled per caller because the
    // detectors do real scans.
    if (action === "evaluate_triggers") {
      const prefRow = await ensureOwnPrefRow(Pref, me);
      const lastEval = Date.parse(clean(prefRow?.last_evaluated_at));
      const force = body?.force === true;
      if (!force && Number.isFinite(lastEval) && nowMs - lastEval < EVAL_THROTTLE_MS) {
        return Response.json({ success: true, action, throttled: true, next_eval_in_ms: EVAL_THROTTLE_MS - (nowMs - lastEval) });
      }

      const today = clean(body?.today) || new Date().toISOString().slice(0, 10);
      const entities = base44.asServiceRole.entities as any;
      const Estimate = entities.AllInOneEstimate;
      const EstimatingRequest = entities.EstimatingRequest;
      const Invoice = entities.Invoice;
      const BuilderPart = entities.BuilderPart;
      const Activity = entities.OpportunityActivity;
      const GlobalSettings = entities.GlobalSettings;

      const directory = await cachedScan("staff_directory", () =>
        loadAllEntityRows({ entity: entities.AuthorizedEmail, label: "Notification staff directory" }));
      const activeStaff = directory.filter((u: any) => clean(u?.email) && u?.is_deactivated !== true);
      const adminEmails = activeStaff
        .filter((u: any) => clean(u?.role) === "admin")
        .map((u: any) => clean(u.email).toLowerCase())
        .slice(0, 10);

      // Recent-source scans (module-cached — recipient-agnostic).
      const [assignedActivity, approvedEstimates, sentEstimates, openRequests, syncPending, recalcParts, openInvoices] = await Promise.all([
        cachedScan("act_assigned", () => Activity.filter({ event_type: "estimator_assigned" }, "-created_date", 60)),
        cachedScan("est_approved", () => Estimate.filter({ status: "approved" }, "-updated_date", 60)),
        cachedScan("est_sent", () => Estimate.filter({ status: "sent" }, "-updated_date", 120)),
        cachedScan("req_open", () => EstimatingRequest.list("-created_date", 120)),
        cachedScan("est_syncpend", () => Estimate.filter({ pipeline_sync_pending: true }, "-updated_date", 60)),
        cachedScan("parts_recalc", () => BuilderPart.filter({ needs_recalc: true }, "-updated_date", 40)),
        cachedScan("inv_open", () => Invoice.filter({ status: "sent" }, "-updated_date", 120)),
      ]);
      const partialInvoices = await cachedScan("inv_partial", () => Invoice.filter({ status: "partially_paid" }, "-updated_date", 120));

      // One global dedupe index read covers every recipient: dedupe keys
      // embed the recipient email, so the set lookup is exact.
      const recentNotifs = await Notification.list("-created_date", DEDUPE_INDEX_ROWS).catch(() => []);
      const seenKeys = new Set(list(recentNotifs).map((n: any) => clean(n?.dedupe_key)).filter(Boolean));

      const candidates: any[] = [];
      const push = (c: any) => {
        if (!c?.recipient || !c?.title || !c?.dedupe) return;
        const dedupe_key = `${c.recipient}:${c.dedupe}`.slice(0, 256);
        if (seenKeys.has(dedupe_key)) return;
        seenKeys.add(dedupe_key); // also dedupes within this batch
        candidates.push({
          recipient_email: c.recipient,
          category: NOTIF_CATEGORIES.has(c.category) ? c.category : "system",
          severity: SEVERITIES.has(c.severity) ? c.severity : "info",
          title: String(c.title).slice(0, 300),
          body: String(c.body || "").slice(0, 1000),
          deep_link: String(c.deep_link || "").slice(0, 500),
          source_event: clean(c.source_event),
          source_id: clean(c.source_id),
          dedupe_key,
          creation_request_key: `notif:${dedupe_key}`.slice(0, 256),
          meta: c.meta && typeof c.meta === "object" ? c.meta : {},
          created_by: "evaluate_triggers",
        });
      };
      const recipients = (emailish: any, fallbackAdmins = false) => {
        const r = resolveStaffEmail(emailish, activeStaff);
        if (r) return [r];
        return fallbackAdmins ? adminEmails : [];
      };

      // #335 — estimator_assigned activity → notify the assignee. The
      // activity id is the dedupe anchor so each assignment notifies once.
      for (const a of list(assignedActivity)) {
        const createdMs = Date.parse(clean(a?.created_date));
        if (Number.isFinite(createdMs) && nowMs - createdMs > DETECTOR_LOOKBACK_MS) continue;
        const assigneeRaw = clean(a?.details?.assigned_estimator);
        const recipient = resolveStaffEmail(assigneeRaw, activeStaff);
        if (!recipient) continue;
        push({
          recipient, category: "estimate_assigned", severity: "info",
          title: `Estimate request assigned to you`,
          body: `${clean(a?.summary) || `Request ${clean(a?.details?.estimating_request_id)}`} — assigned by ${clean(a?.actor) || "system"}`,
          deep_link: a?.opportunity_id ? `/Opportunities?open=${clean(a.opportunity_id)}` : "/EstimatorQueues",
          source_event: "estimator_assigned", source_id: clean(a?.details?.estimating_request_id) || clean(a?.id),
          dedupe: `est_assigned:${clean(a?.id)}`,
          meta: { activity_id: clean(a?.id), assignee_raw: assigneeRaw },
        });
      }

      // #329/#336 — estimate status transitions → the salesperson. Approved
      // quotes get the celebration treatment the EstimatorQueues toast reads.
      for (const e of list(approvedEstimates)) {
        const updMs = Date.parse(clean(e?.updated_date));
        if (!Number.isFinite(updMs) || nowMs - updMs > DETECTOR_LOOKBACK_MS) continue;
        if (e?.deleted === true) continue;
        for (const recipient of recipients(e?.salesperson_email || e?.salesperson, true)) {
          push({
            recipient, category: "quote_approved", severity: "celebration",
            title: `Quote approved — ${clean(e?.project_name) || clean(e?.client_name) || "Estimate"}${clean(e?.estimate_number) ? ` #${clean(e.estimate_number)}` : ""}`,
            body: `${clean(e?.client_name)}${num(e?.quote_total) ? ` · $${num(e.quote_total).toLocaleString()}` : ""}`,
            deep_link: `/EstimateDetail?id=${clean(e?.id)}`,
            source_event: "estimate_status_approved", source_id: clean(e?.id),
            dedupe: `est_status:${clean(e?.id)}:approved`,
            meta: { estimate_number: clean(e?.estimate_number), status: "approved" },
          });
        }
      }
      for (const e of list(sentEstimates)) {
        const updMs = Date.parse(clean(e?.updated_date));
        if (!Number.isFinite(updMs) || nowMs - updMs > DETECTOR_LOOKBACK_MS) continue;
        if (e?.deleted === true) continue;
        for (const recipient of recipients(e?.salesperson_email || e?.salesperson, false)) {
          push({
            recipient, category: "estimate_sent", severity: "info",
            title: `Quote sent — ${clean(e?.project_name) || clean(e?.client_name) || "Estimate"}${clean(e?.estimate_number) ? ` #${clean(e.estimate_number)}` : ""}`,
            body: `${clean(e?.client_name)}${num(e?.quote_total) ? ` · $${num(e.quote_total).toLocaleString()}` : ""}`,
            deep_link: `/EstimateDetail?id=${clean(e?.id)}`,
            source_event: "estimate_status_sent", source_id: clean(e?.id),
            dedupe: `est_status:${clean(e?.id)}:sent`,
            meta: { estimate_number: clean(e?.estimate_number), status: "sent" },
          });
        }
      }

      // #346 — quotes expiring inside 7 days → the salesperson, once.
      const expiryWindowEnd = nowMs + QUOTE_EXPIRY_WINDOW_MS;
      for (const e of list(sentEstimates)) {
        if (e?.deleted === true) continue;
        const expMs = Date.parse(clean(e?.quote_expiration_date));
        if (!Number.isFinite(expMs) || expMs < Date.parse(today) || expMs > expiryWindowEnd) continue;
        for (const recipient of recipients(e?.salesperson_email || e?.salesperson, false)) {
          const days = Math.max(0, Math.round((expMs - nowMs) / 86400000));
          push({
            recipient, category: "quote_expiring", severity: "warning",
            title: `Quote expires in ${days}d — ${clean(e?.project_name) || clean(e?.client_name) || "Estimate"}${clean(e?.estimate_number) ? ` #${clean(e.estimate_number)}` : ""}`,
            body: `${clean(e?.client_name)} · expires ${clean(e?.quote_expiration_date)}`,
            deep_link: `/EstimateDetail?id=${clean(e?.id)}`,
            source_event: "quote_expiring_7d", source_id: clean(e?.id),
            dedupe: `qexp7:${clean(e?.id)}`,
            meta: { quote_expiration_date: clean(e?.quote_expiration_date) },
          });
        }
      }

      // #347 — overdue invoices → the salesperson (admins when none is
      // recorded, which is the closest thing to a customer-service queue).
      for (const i of [...list(openInvoices), ...list(partialInvoices)]) {
        if (!(num(i?.balance_due) > 0)) continue;
        const due = clean(i?.due_date);
        if (!due || due >= today) continue;
        for (const recipient of recipients(i?.salesperson_email || i?.salesperson, true)) {
          push({
            recipient, category: "invoice_overdue", severity: "critical",
            title: `Invoice overdue — ${clean(i?.invoice_number) || "Invoice"}${clean(i?.customer_display_name || i?.customer_name) ? ` · ${clean(i?.customer_display_name || i?.customer_name)}` : ""}`,
            body: `due ${due} · $${num(i?.balance_due).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} open`,
            deep_link: `/Invoices?invoice=${clean(i?.id)}`,
            source_event: "invoice_overdue", source_id: clean(i?.id),
            dedupe: `invod:${clean(i?.id)}`,
            meta: { invoice_number: clean(i?.invoice_number), balance_due: num(i?.balance_due) },
          });
        }
      }

      // #342 — unassigned >2d escalation → every admin/manager, once per request.
      for (const r of list(openRequests)) {
        if (!["draft", "ready", "in_progress"].includes(clean(r?.status))) continue;
        if (clean(r?.assigned_estimator) || clean(r?.estimator)) continue;
        const createdMs = Date.parse(clean(r?.created_date));
        if (!Number.isFinite(createdMs) || nowMs - createdMs < UNASSIGNED_ESCALATE_MS) continue;
        if (nowMs - createdMs > 30 * 86400000) continue; // ancient requests stay feed-only
        for (const admin of adminEmails) {
          push({
            recipient: admin, category: "unassigned_escalation", severity: "critical",
            title: `Unassigned estimate request — ${clean(r?.request_number) || "Request"}${clean(r?.opportunity_title) ? ` · ${clean(r.opportunity_title)}` : ""}`,
            body: `Open ${Math.floor((nowMs - createdMs) / 86400000)}d with no estimator`,
            deep_link: "/EstimatingQueues",
            source_event: "unassigned_escalation", source_id: clean(r?.id),
            dedupe: `unassigned2d:${clean(r?.id)}`,
            meta: { request_number: clean(r?.request_number) },
          });
        }
      }

      // #343 — pipeline_sync_pending unresolved >24h.
      for (const e of list(syncPending)) {
        const updMs = Date.parse(clean(e?.updated_date));
        if (!Number.isFinite(updMs) || nowMs - updMs < SYNC_PENDING_STALE_MS) continue;
        if (e?.deleted === true) continue;
        for (const recipient of recipients(e?.salesperson_email || e?.salesperson, true)) {
          push({
            recipient, category: "sync_pending", severity: "warning",
            title: `Pipeline sync pending >24h — ${clean(e?.project_name) || clean(e?.estimate_number) || "Estimate"}`,
            body: `${clean(e?.estimate_number) ? `#${clean(e.estimate_number)} · ` : ""}status ${clean(e?.status) || "unknown"} · flagged ${clean(e?.updated_date).slice(0, 10)}`,
            deep_link: `/EstimateDetail?id=${clean(e?.id)}`,
            source_event: "sync_pending_stale", source_id: clean(e?.id),
            dedupe: `syncpend:${clean(e?.id)}`,
            meta: { estimate_number: clean(e?.estimate_number) },
          });
        }
      }

      // #344 — BuilderPart needs_recalc → the owning estimate's salesperson.
      const recalcEstimateIds = [...new Set(list(recalcParts).map((p: any) => clean(p?.estimate_id)).filter(Boolean))].slice(0, 8);
      const recalcEstimateOwners = new Map<string, any>();
      for (const estId of recalcEstimateIds) {
        recalcEstimateOwners.set(estId, await Estimate.get(estId).catch(() => null));
      }
      for (const p of list(recalcParts)) {
        const est = recalcEstimateOwners.get(clean(p?.estimate_id));
        const ownerRaw = est?.salesperson_email || est?.salesperson;
        const targetRecipients = recipients(ownerRaw, false);
        const partsTargets = targetRecipients.length ? targetRecipients : adminEmails;
        for (const recipient of partsTargets.slice(0, 5)) {
          push({
            recipient, category: "needs_recalc", severity: "warning",
            title: `Part needs recalc — ${clean(p?.part_name) || clean(p?.part_key) || "Part"}`,
            body: `${est?.project_name ? `${clean(est.project_name)} · ` : ""}flagged needs_recalc — price may be stale`,
            deep_link: p?.estimate_id ? `/EstimateDetail?id=${clean(p.estimate_id)}` : "/EstimatorQueues",
            source_event: "needs_recalc", source_id: clean(p?.id),
            dedupe: `recalc:${clean(p?.id)}`,
            meta: { estimate_id: clean(p?.estimate_id) },
          });
        }
      }

      // #349 — custom watch rules → persisted hit notifications for the
      // caller (the live check_watches banner stays the instant surface).
      const watchRows = await GlobalSettings.filter({ config_name: "watch_rules" }).catch(() => []);
      let watchMap: Record<string, any[]> = {};
      try { watchMap = JSON.parse(String(watchRows?.[0]?.watch_rules || "{}") || "{}"); } catch { watchMap = {}; }
      for (const w of (watchMap[me] || watchMap[clean(user?.email)] || [])) {
        try {
          const rec = await entities[w.entity]?.filter({ id: w.record_id }).catch(() => []);
          const row0 = Array.isArray(rec) ? rec[0] : rec;
          const cur = row0 ? String(row0[w.field] ?? "") : null;
          if (cur == null || (w.equals != null && cur !== w.equals)) continue;
          push({
            recipient: me, category: "watch_hit", severity: "info",
            title: `Watch hit — ${clean(w?.label) || clean(w?.record_id)}`,
            body: `${clean(w?.entity)} ${clean(w?.field)} is now "${cur}"`,
            deep_link: "/MainWorkflow",
            source_event: "watch_hit", source_id: clean(w?.record_id),
            dedupe: `watch:${clean(w?.entity)}:${clean(w?.record_id)}:${clean(w?.field)}:${cur}`,
            meta: { watch: w, current: cur },
          });
        } catch { /* unreadable entity — skip */ }
      }

      let created = 0;
      const errors: string[] = [];
      for (const c of candidates.slice(0, MAX_CREATES_PER_EVAL)) {
        const saved = await Notification.create(c).then(() => true).catch((e: any) => {
          errors.push(e?.message || "create failed");
          return false;
        });
        if (saved) created += 1;
      }
      let evalStampWarning = "";
      if (prefRow?.id) await Pref.update(prefRow.id, { last_evaluated_at: iso() }).catch((e: any) => { evalStampWarning = String(e?.message || e); });
      return Response.json({
        success: true, action, throttled: false, created,
        candidates: candidates.length, deferred: Math.max(0, candidates.length - MAX_CREATES_PER_EVAL),
        errors: errors.slice(0, 5), evaluated_at: iso(),
        eval_stamp_warning: evalStampWarning || undefined,
      });
    }

    throw bad(`Unsupported notification action: ${action}`);
  } catch (error: any) {
    const status = Number(error?.status || error?.statusCode || 500);
    const safeStatus = [400, 401, 403, 404, 409, 423, 503].includes(status) ? status : 500;
    console.error("notificationAction error:", error?.message || error);
    return Response.json({
      success: false,
      error: clean(error?.message || "Notification action failed."),
    }, { status: safeStatus });
  }
});