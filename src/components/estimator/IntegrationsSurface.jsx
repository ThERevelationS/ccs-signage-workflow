import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  Clock,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Loader2,
  Mail,
  Plug,
  RefreshCw,
  Zap,
} from "lucide-react";

// ===========================================================================
// IntegrationsSurface — ESTIMATOR_MASTERPLAN K-08 (redispatch w-143r).
// Single admin surface answering "what's connected, what's credential-gated,
// what's broken" across the app's integration points. Pure/read-only: it never
// writes settings and never shows secrets or tokens.
//
// The catalog + status resolver below are deliberately PLAIN JS with zero
// imports so the same module bundles into the Node test harness
// (scripts/test-integrations-surface.mjs) — same contract as the shared pure
// models (delivery.ts / emailSettingsModel.ts / integrationsStatusModel.ts).
//
// EVIDENCE MODEL: statuses resolve OFF GlobalSettings shape only. Settings
// reach this component as a prop (rows in any of the accepted carriers — see
// normalizeSettingsRows) or via a `loadSettings` callback the mount point
// injects (e.g. staffEntities.GlobalSettings + loadSingleGlobalSetting over
// INTEGRATION_SETTINGS_KEYS, the same pattern admin/IntegrationsPanel uses).
// Server-side secrets (SMARTSHEET_API_TOKEN, Intuit tokens, connector grants)
// are intentionally NOT probe-able from here — the detail text says when a
// credential check lives on a backend function instead.
//
// STATE VOCABULARY (5 states, this surface's contract):
//   connected            live/working right now (built-in, or settings prove
//                        an enabled, complete configuration)
//   configured           a settings row exists and is partially set up — the
//                        integration is present but not fully armed/verified
//   blocked-credentials  gated on external credentials that are absent; the
//                        settings row (or lack of one) proves the gap
//   disabled             configured but switched off (kill switch / master
//                        toggle explicitly off, or a retired service)
//   unconfigured         nothing saved — no row, no setup
// ===========================================================================

// ---------------------------------------------------------------------------
// Pure helpers (mirrors the truthy/dotGet conventions in shared/* models:
// non-empty = truthy; false/''/0/null/undefined/[]/{} are all falsy so a
// present-but-empty field never reads as configured)
// ---------------------------------------------------------------------------

const clean = (v) => String(v ?? "").trim();
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

const truthy = (v) => {
  if (v === undefined || v === null || v === false) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v) && v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return Boolean(v);
};

const dotGet = (obj, path) => {
  if (!path) return obj;
  let cur = obj;
  for (const part of String(path).split(".")) {
    if (!isObj(cur) && !Array.isArray(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
};

// GlobalSettings arrives as rows in two storage conventions:
//   { setting_key, setting_value }  — canonical KV (qbo, emailDelivery, …)
//   { key, value }                  — time-clock family (timeclockFeatures…)
// and callers may hand us the rows as an array, a Map, or an object map of
// key → row-or-bare-value. normalizeSettingsRows yields key → stored row.
export function normalizeSettingsRows(settings) {
  const out = new Map();
  const put = (k, row) => {
    const kk = clean(k);
    if (kk && row !== undefined && !out.has(kk)) out.set(kk, row);
  };
  const keyOf = (row) => clean(row?.setting_key) || clean(row?.key) || clean(row?.settingKey);
  if (settings instanceof Map) {
    for (const [k, row] of settings.entries()) put(k, row);
  } else if (Array.isArray(settings)) {
    for (const row of settings) {
      if (!isObj(row)) continue;
      put(keyOf(row), row);
    }
  } else if (isObj(settings)) {
    const own = keyOf(settings);
    // A single bare row ({setting_key,setting_value} or {key,value}) passed as
    // the whole object — its own key wins and its fields are NOT a key map.
    const isSingleRow =
      own &&
      (Object.prototype.hasOwnProperty.call(settings, "setting_value") ||
        (Object.prototype.hasOwnProperty.call(settings, "key") &&
          Object.prototype.hasOwnProperty.call(settings, "value")) ||
        !Object.keys(settings).some((k) => k !== "setting_key" && k !== "key" && isObj(settings[k])));
    if (isSingleRow) {
      put(own, settings);
    } else {
      // Object map: keys are setting keys. Values may be entity rows
      // ({setting_key,setting_value}), {key,value} rows, or bare setting values.
      for (const [k, row] of Object.entries(settings)) put(keyOf(row) || k, row);
    }
  }
  return out;
}

// Look a GlobalSettings row up by candidate key across every accepted carrier.
export function lookupSettingRow(settings, key) {
  const map = normalizeSettingsRows(settings);
  return map.get(clean(key));
}

// Unwrap a stored row to the value level field paths resolve against:
// entity row → setting_value; {key,value} row → value; bare value → itself.
export function settingValueFor(row) {
  if (!isObj(row)) return row;
  if (Object.prototype.hasOwnProperty.call(row, "setting_value")) return row.setting_value;
  if (Object.prototype.hasOwnProperty.call(row, "key") && Object.prototype.hasOwnProperty.call(row, "value")) return row.value;
  return row;
}

// ---------------------------------------------------------------------------
// State + category metadata (ordered — the surface renders in this order)
// ---------------------------------------------------------------------------

export const INTEGRATION_STATES = [
  "connected",
  "configured",
  "blocked-credentials",
  "disabled",
  "unconfigured",
];

export const INTEGRATION_STATE_LABELS = {
  connected: "Connected",
  configured: "Configured",
  "blocked-credentials": "Blocked — credentials",
  disabled: "Disabled",
  unconfigured: "Not configured",
};

const DEFAULT_DETAIL = {
  connected: "Connected.",
  configured: "Set up — configuration may be incomplete.",
  "blocked-credentials": "Blocked on missing external credentials.",
  disabled: "Configured but switched off.",
  unconfigured: "Nothing configured.",
};

export const INTEGRATION_CATEGORIES = [
  { id: "sync", label: "Data Sync" },
  { id: "accounting", label: "Accounting" },
  { id: "documents", label: "Documents & Files" },
  { id: "communications", label: "Communications" },
  { id: "automation", label: "Automation & Agents" },
  { id: "operations", label: "Operations" },
];

// ---------------------------------------------------------------------------
// statusResolver spec — a declarative rule list evaluated against the
// descriptor's GlobalSettings row(s). `keys` are candidate setting keys
// (first row found wins). `rules` are checked in order; the first match wins.
//
// `when` forms (all field conditions in one object are AND-ed):
//   'always' | 'row_present' | 'row_absent'            row-level conditions
//   { truthy: 'a.b' }          field non-empty
//   { falsy: 'a.b' }           field empty or absent
//   { all: ['a','b'] }         every field non-empty
//   { any: ['a','b'] }         at least one field non-empty
//   { missing: ['a','b'] }     at least one field empty/absent (the falsy
//                              fields are appended to the detail as
//                              "Missing: a, b")
//   { eq: { 'a.b': <literal> } } every listed field strictly equals
//   { key: '<otherKey>', ... } evaluate the field conditions against ANOTHER
//                              settings row instead of the descriptor's row —
//                              used for cross-integration gates (e.g. the
//                              follow-up sweep's email lane reads
//                              emailDelivery.enabled).
//
// statusResolver may also be a plain function (rare escape hatch):
//   (settings) => { state, detail } | '<state>'
// ---------------------------------------------------------------------------

export const INTEGRATIONS = [
  // ── Data Sync ────────────────────────────────────────────────────────────
  {
    key: "smartsheet",
    name: "Smartsheet sync",
    category: "sync",
    description:
      "Two-way Orders + Sales mirror with pull/push batches, conflict review and scheduled runs.",
    settingsPath: "/AdminSettings?tab=smartsheet",
    docsPath:
      "GlobalSettings 'smartsheetSyncConfig' · SMARTSHEET_API_TOKEN secret (server-side) · functions/smartsheetSyncAction",
    statusResolver: {
      keys: ["smartsheetSyncConfig"],
      rules: [
        {
          when: "row_absent",
          state: "unconfigured",
          detail:
            "No smartsheetSyncConfig row — save sheet bindings in Smartsheet Sync settings. The API token stays a server-side secret.",
        },
        {
          when: { eq: { global_enabled: false } },
          state: "disabled",
          detail: "Global kill switch is OFF — pulls, pushes and scheduled syncs all refuse.",
        },
        // Automatic sync armed = enabled + writes allowed + a dataset mirror on
        // (same gate SmartsheetSyncSettings uses for its 'automatic sync' banner).
        {
          when: {
            truthy: "global_enabled",
            eq: { observation_mode: false },
            any: ["sales.mirror_enabled", "orders.mirror_enabled"],
          },
          state: "connected",
          detail:
            "Mirror sync armed — enabled, writes allowed, at least one dataset mirror on. Token health lives on the function's status action.",
        },
        {
          when: { truthy: "global_enabled", eq: { observation_mode: true } },
          state: "configured",
          detail: "Enabled but observation-only — reads may run; no writes reach Smartsheet.",
        },
        {
          when: { truthy: "global_enabled" },
          state: "configured",
          detail: "Enabled but no dataset mirror is armed — arm sales/orders mirror + pull/push in Smartsheet Sync settings.",
        },
        {
          when: "row_present",
          state: "disabled",
          detail: "Config saved without global_enabled=true — the sync treats missing as OFF.",
        },
      ],
    },
  },
  {
    key: "corebridge_erp",
    name: "CoreBridge ERP (legacy)",
    category: "sync",
    description: "Former shop-management system — kept for migration history only.",
    settingsPath: "/AdminSettings?tab=corebridge",
    docsPath: "functions/corebridgeApiAction · offline CSV export + audit remain",
    statusResolver: {
      keys: [],
      rules: [
        {
          when: "always",
          state: "disabled",
          detail:
            "Retired — the external API answers 410 (api_disabled). Only offline CSV export, audit and backup-verification actions remain.",
        },
      ],
    },
  },

  // ── Accounting ───────────────────────────────────────────────────────────
  {
    key: "quickbooks",
    name: "QuickBooks Online export",
    category: "accounting",
    description:
      "QBO adapter surface: dry-run push/pull payloads and sync receipts for invoices, payments, customers and accounts.",
    docsPath:
      "GlobalSettings 'qbo' row (backend-only, token fields are secret-store refs) · functions/quickbooksExport",
    statusResolver: {
      keys: ["qbo"],
      rules: [
        {
          when: "row_absent",
          state: "blocked-credentials",
          detail:
            "No Intuit app credentials — store {realm_id, refresh_token_ref} on a GlobalSettings 'qbo' row. Push/pull stay in dry-run until then (credential-gated by design).",
        },
        {
          when: { missing: ["realm_id", "refresh_token_ref"] },
          state: "blocked-credentials",
          detail: "The qbo row exists but credential fields are empty — live calls stay credential-gated.",
        },
        {
          when: { truthy: "connected_at" },
          state: "connected",
          detail: "Realm + token refs stored and a connect handshake is stamped.",
        },
        {
          when: "row_present",
          state: "configured",
          detail:
            "Credentials stored — first-connect verification is still pending, so pushes return dry-run envelopes.",
        },
      ],
    },
  },

  // ── Documents & Files ────────────────────────────────────────────────────
  {
    key: "google_drive",
    name: "Google Drive",
    category: "documents",
    description:
      "Per-job folders, portal attachments and the admin data backup ride the platform Drive connector.",
    settingsPath: "/AdminSettings?tab=backend&subtab=backup",
    docsPath:
      "base44/connectors/googledrive · optional GlobalSettings 'driveConfig' jobs-root pin · functions/googleDriveOperations + backupToGoogleDrive",
    statusResolver: {
      keys: ["driveConfig", "googleDriveConfig"],
      rules: [
        {
          when: { any: ["jobs_root_folder_id", "root_folder_id", "drive_jobs_folder_id"] },
          state: "configured",
          detail: "A jobs-root folder is pinned in settings — job files land there instead of the auto root.",
        },
        {
          when: "row_present",
          state: "configured",
          detail: "A driveConfig row exists without a recognized jobs-root pin.",
        },
        {
          when: "row_absent",
          state: "connected",
          detail:
            "Platform 'googledrive' connector is declared for the app — jobs file under the auto-created 'CCS Jobs' root. The connector token itself is platform-managed.",
        },
      ],
    },
  },

  // ── Communications ───────────────────────────────────────────────────────
  {
    key: "email_delivery",
    name: "Email delivery",
    category: "communications",
    description:
      "Outbound staff/customer email lane — delivery.ts routes through SMTP/Gmail only when the master switch is literally true.",
    settingsPath: "/CommsFollowups",
    docsPath:
      "GlobalSettings 'emailDelivery' (+ legacy aliases) · shared/delivery.ts adapter · functions/sendEmail returns 503 by design",
    statusResolver: {
      keys: ["emailDelivery", "emailSettings", "email_settings", "email_delivery"],
      rules: [
        {
          when: "row_absent",
          state: "unconfigured",
          detail:
            "No emailDelivery row — delivery fails closed: outbound resolves to internal notifications + Smartsheet activity rows, and sendEmail answers 503.",
        },
        {
          when: { eq: { enabled: true } },
          state: "connected",
          detail: "Master switch ON — outbound sends through the SMTP → Gmail provider chain.",
        },
        {
          when: { eq: { enabled: false } },
          state: "disabled",
          detail:
            "Master switch OFF — outbound resolves to internal notifications + Smartsheet activity rows (delivery.ts fail-closed).",
        },
        {
          when: "row_present",
          state: "configured",
          detail: "Row exists but enabled is unset — treated as OFF until the switch is a literal true.",
        },
      ],
    },
  },
  {
    key: "broadcast_messaging",
    name: "Broadcast messaging",
    category: "communications",
    description:
      "Staff-composed cohort broadcasts (Everyone/Design/Production/Sales/Managers/Individual) with ack/dismiss receipts.",
    docsPath: "functions/manageBroadcasts · entities/BroadcastMessage · shared/broadcastModel.ts",
    statusResolver: {
      keys: [],
      rules: [
        {
          when: "always",
          state: "connected",
          detail:
            "manageBroadcasts is live — cohort feed, send, ack and dismiss all work; the composer/banner mount is the remaining UI piece.",
        },
      ],
    },
  },
  {
    key: "notification_delivery",
    name: "Notification center delivery",
    category: "communications",
    description:
      "Internal Notification rows powering the notification center — dedupe-keyed, quiet-hours aware.",
    docsPath:
      "functions/notificationAction · components/workflow/NotificationCenter · GlobalSettings 'notificationQuietHours'",
    statusResolver: {
      keys: ["notificationQuietHours"],
      rules: [
        {
          when: { eq: { enabled: true } },
          state: "connected",
          detail: "Notification center live; a quiet-hours window is active for automation-driven sends.",
        },
        {
          when: "row_present",
          state: "connected",
          detail: "Notification center live; a quiet-hours row exists but is not enabled.",
        },
        {
          when: "row_absent",
          state: "connected",
          detail: "Notification center live — no quiet-hours window configured.",
        },
      ],
    },
  },
  {
    key: "customer_portal",
    name: "Customer portal links",
    category: "communications",
    description:
      "Token-link customer portal — estimates, invoices, jobs, messages and file uploads via customerPortalAction.",
    docsPath:
      "functions/customerPortalAction · entities/CustomerPortalLink · pages/CustomerPortal + components/portal/PortalPanel",
    statusResolver: {
      keys: ["emailDelivery"],
      rules: [
        {
          when: { eq: { enabled: true } },
          state: "connected",
          detail: "Token-link portal live — portal notices also reach customers by email.",
        },
        {
          when: "always",
          state: "connected",
          detail:
            "Token-link portal live — notices post as portal messages; customer emails stay off while email delivery is disabled or unset. Pay-online is not wired (Invoice.pay_url is a placeholder).",
        },
      ],
    },
  },

  // ── Automation & Agents ──────────────────────────────────────────────────
  {
    key: "follow_up_sweep",
    name: "Estimate follow-up sweep",
    category: "automation",
    description:
      "Daily sweep over sent estimates — advances the follow-up machine and enqueues due touches through the delivery adapter.",
    settingsPath: "/AdminSettings?tab=automations",
    docsPath:
      "functions/followUpSweepAction · shared/followUpMachine.ts + delivery.ts · email lane follows emailDelivery.enabled",
    statusResolver: {
      keys: ["automations_paused"],
      rules: [
        {
          when: { truthy: "paused" },
          state: "disabled",
          detail:
            "automations_paused kill switch is ON — scheduled sweeps halt until resumed (manual admin runs still work).",
        },
        {
          when: { key: "emailDelivery", eq: { enabled: true } },
          state: "connected",
          detail: "Sweep live — due follow-ups email customers AND post internal notifications.",
        },
        {
          when: "always",
          state: "connected",
          detail:
            "Sweep live — due follow-ups post internal notifications + Smartsheet activity rows (customer email lane off).",
        },
      ],
    },
  },
  {
    key: "scheduled_workflows",
    name: "Scheduled workflows & triggers",
    category: "automation",
    description:
      "Platform schedules plus the internal trigger engine — deadline reminders, sync runs and automation rules.",
    settingsPath: "/AdminSettings?tab=automations",
    docsPath: "GlobalSettings 'automations_paused' kill switch · shared/workflowTriggerEngine.ts",
    statusResolver: {
      keys: ["automations_paused"],
      rules: [
        {
          when: { truthy: "paused" },
          state: "disabled",
          detail: "automations_paused is ON — the trigger engine halts every rule until resumed.",
        },
        {
          when: { eq: { paused: false } },
          state: "connected",
          detail: "Trigger engine armed — the pause row exists but paused=false.",
        },
        {
          when: "row_absent",
          state: "connected",
          detail: "Trigger engine armed — no automations_paused row, nothing is paused.",
        },
        {
          when: "row_present",
          state: "configured",
          detail: "automations_paused row present without a boolean paused flag.",
        },
      ],
    },
  },
  {
    key: "jurisdiction_research",
    name: "Jurisdiction research agent",
    category: "automation",
    description:
      "AI-driven permitting/jurisdiction research (InvokeLLM) plus the scheduled jurisdiction-change monitor.",
    settingsPath: "/AdminSettings?tab=backend&subtab=monitoring",
    docsPath:
      "functions/jurisdictionResearchAgent + jurisdiction_research + monitorJurisdictionChanges · GlobalSettings 'jurisdiction_monitoring'",
    statusResolver: {
      keys: ["jurisdiction_monitoring"],
      rules: [
        {
          when: { truthy: "notification_emails" },
          state: "connected",
          detail: "Research agent live (InvokeLLM); scheduled monitoring alerts route to the configured recipient list.",
        },
        {
          when: "row_present",
          state: "connected",
          detail: "Research agent live; the monitoring row is saved without notification_emails — alerts go to the runner only.",
        },
        {
          when: "row_absent",
          state: "connected",
          detail: "Research agent live on demand; scheduled change monitoring is unconfigured.",
        },
      ],
    },
  },

  // ── Operations ───────────────────────────────────────────────────────────
  {
    key: "time_clock",
    name: "Time clock",
    category: "operations",
    description:
      "Punches, shifts, corrections, PTO and payroll reports via timeClockAction — feature toggles are admin-managed.",
    settingsPath: "/AdminSettings?tab=timeclock",
    docsPath:
      "GlobalSettings {key:'timeclockFeatures'} (key/value convention) + twoStepThresholdMinutes/defaultHourlyRate/timeclockDelegatedApprovers · functions/timeClockAction",
    statusResolver: {
      keys: ["timeclockFeatures"],
      rules: [
        {
          when: "row_present",
          state: "connected",
          detail: "timeClockAction live; feature toggles loaded from the timeclockFeatures row.",
        },
        {
          when: "row_absent",
          state: "connected",
          detail:
            "timeClockAction live — no timeclockFeatures row, so built-in flag defaults apply (experimental off; announcements/shift_templates/dual_ring on).",
        },
      ],
    },
  },
  {
    key: "audit_log",
    name: "Audit log",
    category: "operations",
    description:
      "Cross-record admin timeline — estimate revisions, opportunity activity and admin audit rows in one feed.",
    settingsPath: "/AdminSettings?tab=activity",
    docsPath:
      "components/admin/ActivityFeed · components/estimator/EstimatorAuditPanel · pages/AuditLog · entities/EstimateRevision + OpportunityActivity + AdminAuditLog",
    statusResolver: {
      keys: [],
      rules: [
        {
          when: "always",
          state: "connected",
          detail: "Always recording — revision/activity/admin-audit rows land on every write path.",
        },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

// Field-level `when` evaluation. `target` is the row value the dotted paths
// resolve against. Every declared condition must hold (AND); a `missing`
// clause also reports which listed fields were falsy.
function matchFieldWhen(when, target) {
  const missingFields = [];
  if (when.truthy !== undefined && !truthy(dotGet(target, when.truthy))) return { match: false, missing: [] };
  if (when.falsy !== undefined && truthy(dotGet(target, when.falsy))) return { match: false, missing: [] };
  if (Array.isArray(when.all)) {
    for (const path of when.all) {
      if (!truthy(dotGet(target, path))) return { match: false, missing: [] };
    }
  }
  if (Array.isArray(when.any)) {
    if (!when.any.length || !when.any.some((path) => truthy(dotGet(target, path)))) {
      return { match: false, missing: [] };
    }
  }
  if (Array.isArray(when.missing)) {
    const absent = when.missing.filter((path) => !truthy(dotGet(target, path)));
    if (!absent.length) return { match: false, missing: [] };
    missingFields.push(...absent);
  }
  if (isObj(when.eq)) {
    for (const [path, literal] of Object.entries(when.eq)) {
      if (dotGet(target, path) !== literal) return { match: false, missing: [] };
    }
  }
  return { match: true, missing: missingFields };
}

// One rule's `when` against the resolver context (descriptor row + lookup).
function matchWhen(when, ctx) {
  if (when === undefined || when === null || when === "always") return { match: true, missing: [] };
  if (when === "row_absent") return { match: ctx.row === undefined || ctx.row === null, missing: [] };
  if (when === "row_present") return { match: ctx.row !== undefined && ctx.row !== null, missing: [] };
  if (!isObj(when)) return { match: false, missing: [] };
  // Cross-key condition: field checks run against a DIFFERENT settings row
  // (absent row → every path is undefined, so truthy/eq/all/any fail while
  // falsy/missing pass — the honest read for "that row isn't there").
  const target = when.key !== undefined
    ? settingValueFor(ctx.lookupRow(when.key))
    : ctx.value;
  return matchFieldWhen(when, target);
}

// resolveIntegrationStatus(descriptor, settings) → { key, state, detail,
//   evidence: { settings_row, settings_key, missing } }
// `settings` accepts rows as an array, a Map, an object map, or a single row.
export function resolveIntegrationStatus(descriptor, settings) {
  const key = clean(descriptor?.key);
  const empty = (state, detail) => ({
    key, state, detail,
    evidence: { settings_row: false, settings_key: "", missing: [] },
  });
  if (!descriptor || !isObj(descriptor.statusResolver)) {
    if (typeof descriptor?.statusResolver === "function") {
      // Function-form resolver (escape hatch) — runs with the raw settings
      // carrier plus the helpers above so it can stay shape-agnostic.
      try {
        const out = descriptor.statusResolver(settings, { lookupSettingRow, settingValueFor, truthy, dotGet });
        const state = typeof out === "string" ? out : clean(out?.state);
        const detail = typeof out === "string" ? DEFAULT_DETAIL[out] : clean(out?.detail) || DEFAULT_DETAIL[state] || DEFAULT_DETAIL.unconfigured;
        return { key, state: INTEGRATION_STATES.includes(state) ? state : "unconfigured", detail, evidence: { settings_row: false, settings_key: "", missing: [] } };
      } catch (err) {
        return empty("unconfigured", `Status resolver threw — treated as unconfigured. ${clean(err?.message)}`.trim());
      }
    }
    return empty("unconfigured", "No status resolver declared.");
  }

  const resolver = descriptor.statusResolver;
  const map = normalizeSettingsRows(settings);
  const lookupRow = (k) => map.get(clean(k));

  let row;
  let usedKey = "";
  for (const k of resolver.keys || []) {
    const hit = lookupRow(k);
    if (hit !== undefined && hit !== null) { row = hit; usedKey = clean(k); break; }
  }
  const ctx = { row, value: settingValueFor(row), lookupRow };
  const evidence = (missing) => ({ settings_row: row !== undefined && row !== null, settings_key: usedKey, missing: missing || [] });

  for (const rule of resolver.rules || []) {
    const verdict = matchWhen(rule?.when, ctx);
    if (!verdict.match) continue;
    const state = INTEGRATION_STATES.includes(rule?.state) ? rule.state : "unconfigured";
    const detail = [clean(rule?.detail) || DEFAULT_DETAIL[state], verdict.missing.length ? `Missing: ${verdict.missing.join(", ")}` : ""]
      .filter(Boolean)
      .join(" ");
    return { key, state, detail, evidence: evidence(verdict.missing) };
  }
  return { key, state: "unconfigured", detail: DEFAULT_DETAIL.unconfigured, evidence: evidence([]) };
}

// Resolve every catalog entry — the panel's main collection.
export function resolveAllIntegrations(settings) {
  return INTEGRATIONS.map((descriptor) => ({
    descriptor,
    ...resolveIntegrationStatus(descriptor, settings),
  }));
}

// Stable grouping: category order follows INTEGRATION_CATEGORIES; item order
// inside a group follows INTEGRATIONS. Empty groups are dropped.
export function groupIntegrationsByCategory(resolved) {
  const rows = Array.isArray(resolved) ? resolved : [];
  return INTEGRATION_CATEGORIES.map((category) => ({
    category,
    items: rows.filter((r) => r?.descriptor?.category === category.id),
  })).filter((g) => g.items.length > 0);
}

export function countByState(resolved) {
  const counts = Object.fromEntries(INTEGRATION_STATES.map((s) => [s, 0]));
  for (const r of Array.isArray(resolved) ? resolved : []) {
    if (r && counts[r.state] !== undefined) counts[r.state] += 1;
  }
  return counts;
}

// GlobalSettings keys the loader should read — derived so the catalog stays
// the single source of truth (descriptor keys ∪ cross-key rule references).
export const INTEGRATION_SETTINGS_KEYS = (() => {
  const out = new Set();
  for (const d of INTEGRATIONS) {
    for (const k of d.statusResolver?.keys || []) out.add(k);
    for (const rule of d.statusResolver?.rules || []) {
      if (isObj(rule?.when) && typeof rule.when.key === "string" && rule.when.key.trim()) out.add(rule.when.key.trim());
    }
  }
  return [...out];
})();

// ---------------------------------------------------------------------------
// Surface (React) — grouped cards, state chip per integration, deep-link to
// the owning settings surface where one exists. Pure render + optional
// injected loader; zero service imports so the file bundles standalone.
// ---------------------------------------------------------------------------

const STATE_STYLES = {
  connected: "bg-emerald-100 text-emerald-800 border-emerald-200",
  configured: "bg-sky-100 text-sky-800 border-sky-200",
  "blocked-credentials": "bg-amber-100 text-amber-800 border-amber-200",
  disabled: "bg-slate-200 text-slate-600 border-slate-300",
  unconfigured: "bg-gray-50 text-gray-500 border-gray-200 border-dashed",
};

const CATEGORY_ICONS = {
  sync: GitBranch,
  accounting: Calculator,
  documents: FolderOpen,
  communications: Mail,
  automation: Zap,
  operations: Clock,
};

function StateChip({ state }) {
  return (
    <span
      data-testid={`state-${state}`}
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATE_STYLES[state] || STATE_STYLES.unconfigured}`}
    >
      {INTEGRATION_STATE_LABELS[state] || state}
    </span>
  );
}

function IntegrationCard({ item }) {
  const { descriptor, state, detail, evidence } = item;
  return (
    <li className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h4 className="min-w-0 break-words text-sm font-semibold text-gray-900">{descriptor.name}</h4>
        <StateChip state={state} />
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{descriptor.description}</p>
      <p className="mt-2 text-xs leading-relaxed text-gray-800">{detail}</p>
      {evidence?.missing?.length ? (
        <p className="mt-1.5 text-[11px] font-medium text-amber-700">Missing: {evidence.missing.join(", ")}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        {descriptor.settingsPath ? (
          <a
            href={descriptor.settingsPath}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            Open settings
          </a>
        ) : null}
        {descriptor.docsPath ? (
          <span className="text-[10px] leading-snug text-gray-400" title={descriptor.docsPath}>
            {descriptor.docsPath}
          </span>
        ) : null}
      </div>
    </li>
  );
}

/**
 * IntegrationsSurface — compact admin panel for K-08.
 *
 * Props:
 *   settings      GlobalSettings rows in any accepted carrier (array of
 *                 {setting_key,setting_value} or {key,value} rows, a Map, or
 *                 an object map of key → row/value). Resolved directly.
 *   loadSettings  optional async () => settings — when provided the surface
 *                 loads on mount and the Refresh button re-runs it. The mount
 *                 point supplies the staff-session read (e.g. paged reads of
 *                 staffEntities.GlobalSettings for INTEGRATION_SETTINGS_KEYS).
 *   className     extra wrapper classes.
 */
export default function IntegrationsSurface({ settings, loadSettings, className = "" }) {
  const [loaded, setLoaded] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState(null);

  const canLoad = typeof loadSettings === "function";
  const load = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setLoadError("");
    try {
      const result = await loadSettings();
      setLoaded(result);
      setRefreshedAt(new Date());
    } catch (err) {
      // Degrade honestly: keep whatever was there; cards still resolve from it.
      setLoadError(err?.message || "Settings could not be loaded — cards show the last known state.");
    }
    setLoading(false);
  }, [canLoad, loadSettings]);

  useEffect(() => { void load(); }, [load]);

  const effectiveSettings = loaded !== undefined ? loaded : settings;
  const resolved = useMemo(() => resolveAllIntegrations(effectiveSettings), [effectiveSettings]);
  const grouped = useMemo(() => groupIntegrationsByCategory(resolved), [resolved]);
  const counts = useMemo(() => countByState(resolved), [resolved]);

  return (
    <div className={`space-y-5 ${className}`}>
      <div className="clay-card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-semibold text-gray-800">
              <Plug className="h-4 w-4 text-blue-600" />
              Integrations status
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              What each integration reads from saved settings — connected, partly set up,
              credential-gated, switched off, or absent. Read-only; secrets are never shown.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {refreshedAt ? (
              <span className="text-[11px] text-gray-400">Checked {refreshedAt.toLocaleTimeString()}</span>
            ) : null}
            {canLoad ? (
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Integration status summary">
          {INTEGRATION_STATES.filter((s) => counts[s] > 0).map((s) => (
            <span key={s} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATE_STYLES[s]}`}>
              {INTEGRATION_STATE_LABELS[s]}: {counts[s]}
            </span>
          ))}
        </div>
        {loadError ? (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {loadError}
          </p>
        ) : null}
      </div>

      {grouped.map(({ category, items }) => {
        const Icon = CATEGORY_ICONS[category.id] || Plug;
        return (
          <section key={category.id} aria-label={category.label}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              <Icon className="h-4 w-4 text-gray-400" />
              {category.label}
              <span className="text-[11px] font-normal normal-case text-gray-400">({items.length})</span>
            </h3>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => <IntegrationCard key={item.descriptor.key} item={item} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
