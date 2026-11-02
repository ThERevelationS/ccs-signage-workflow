import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  ClipboardCheck,
  FolderOpen,
  GitBranch,
  Loader2,
  Mail,
  MapPin,
  Plug,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Truck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import {
  INTEGRATION_PROBES,
  INTEGRATION_SETTINGS_KEYS,
  INTEGRATION_STATUS_LABELS,
  countIntegrationsByStatus,
  groupIntegrationsByCategory,
  resolveAllIntegrations,
} from "../../../base44/shared/integrationsStatusModel.ts";

// K-08 — read-only "what's connected vs available" surface. It never writes,
// never displays secrets/tokens, and degrades to 'unknown' rather than
// crashing when a status probe or settings read fails.
//
// Two evidence feeds, both staff-session safe:
//   - GlobalSettings rows via the staffDataRead gateway (staffEntities), read
//     through loadSingleGlobalSetting so one warm table read serves all keys.
//   - Live function status calls (quickbooksExport/status,
//     smartsheetSyncAction/status, checkGmailConnection, bouncieStatus,
//     getGoogleMapsKey) — session-authenticated, admin-gated server-side.
const CATEGORY_ICONS = {
  accounting: Calculator,
  sync: GitBranch,
  documents: FolderOpen,
  maps: MapPin,
  permitting: ClipboardCheck,
  communications: Mail,
  fleet: Truck,
  automation: Zap,
  ai: Sparkles,
};

const STATUS_STYLES = {
  connected: "bg-emerald-100 text-emerald-800 border-emerald-200",
  partial: "bg-amber-100 text-amber-800 border-amber-200",
  not_configured: "bg-gray-100 text-gray-600 border-gray-200",
  native: "bg-sky-100 text-sky-800 border-sky-200",
  unavailable: "bg-gray-50 text-gray-400 border-gray-200 border-dashed",
  unknown: "bg-slate-100 text-slate-500 border-slate-200",
};

const STATUS_ORDER = ["connected", "partial", "not_configured", "native", "unavailable", "unknown"];

const SOURCE_LABELS = {
  configured: "settings",
  credential: "credentials",
  native: "built-in",
  absent: "absent",
};

function StatusBadge({ status }) {
  return (
    <Badge variant="outline" className={`shrink-0 border ${STATUS_STYLES[status] || STATUS_STYLES.unknown}`}>
      {INTEGRATION_STATUS_LABELS[status] || status}
    </Badge>
  );
}

function IntegrationCard({ item }) {
  const { entry, status, detail, evidence } = item;
  return (
    <li className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h4 className="min-w-0 break-words text-sm font-semibold text-gray-900">{entry.label}</h4>
        <StatusBadge status={status} />
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{entry.description}</p>
      <p className="mt-2 text-xs leading-relaxed text-gray-800">{detail}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
          {SOURCE_LABELS[entry.source] || entry.source}
        </span>
        {evidence?.probe === "error" && (
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">probe failed</span>
        )}
        {entry.settings_hint && (
          <span className="text-[10px] leading-snug text-gray-400" title={entry.settings_hint}>
            Where: {entry.settings_hint}
          </span>
        )}
      </div>
    </li>
  );
}

export default function IntegrationsPanel({ sessionToken }) {
  const [settings, setSettings] = useState({});
  const [functionStatuses, setFunctionStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [settingsWarning, setSettingsWarning] = useState("");
  const [refreshedAt, setRefreshedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setSettingsWarning("");
    // Settings rows — one failure must not blank the panel; a failed key reads
    // as absent and the entry degrades to not_configured/unknown on its own.
    const keys = INTEGRATION_SETTINGS_KEYS;
    const rows = await Promise.all(
      keys.map((k) =>
        loadSingleGlobalSetting({ entity: staffEntities.GlobalSettings, settingKey: k, label: `Integration setting ${k}` })
          .then((row) => [k, row, false])
          .catch(() => [k, null, true]),
      ),
    );
    const nextSettings = {};
    let failures = 0;
    for (const [k, row, failed] of rows) {
      nextSettings[k] = row;
      if (failed) failures += 1;
    }
    if (failures > 0) {
      setSettingsWarning(`${failures} of ${keys.length} settings rows could not be read — affected cards show their worst-case status.`);
    }
    setSettings(nextSettings);

    // Live probes — every call is wrapped; a platform hiccup yields an
    // {__error} marker that resolves to 'unknown', never a crash.
    const probeEntries = await Promise.all(
      INTEGRATION_PROBES.map(async (p) => {
        if (!sessionToken) return [p.fn, undefined];
        try {
          const res = await base44.functions.invoke(p.fn, { ...p.payload, session_token: sessionToken });
          return [p.fn, res?.data || res];
        } catch (err) {
          return [p.fn, { __error: err?.response?.data?.error || err?.message || "status probe failed" }];
        }
      }),
    );
    setFunctionStatuses(Object.fromEntries(probeEntries));
    setRefreshedAt(new Date());
    setLoading(false);
  }, [sessionToken]);

  useEffect(() => { void load(); }, [load]);

  const resolved = useMemo(
    () => resolveAllIntegrations({ settings, function_statuses: functionStatuses }),
    [settings, functionStatuses],
  );
  const grouped = useMemo(() => groupIntegrationsByCategory(resolved), [resolved]);
  const counts = useMemo(() => countIntegrationsByStatus(resolved), [resolved]);

  return (
    <div className="space-y-5">
      <div className="clay-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-semibold text-gray-800">
              <Plug className="h-4 w-4 text-blue-600" />
              Integrations &amp; Services
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Presence-only surface: what external services this app touches and whether each
              looks connected, partially set up, or absent. Read-only — no secrets or tokens are shown.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {refreshedAt && (
              <span className="text-[11px] text-gray-400">
                Checked {refreshedAt.toLocaleTimeString()}
              </span>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="min-h-10">
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Integration status summary">
          {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
            <span key={s} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[s]}`}>
              {INTEGRATION_STATUS_LABELS[s]}: {counts[s]}
            </span>
          ))}
          {!loading && resolved.length === 0 && <span className="text-[11px] text-gray-400">No integrations cataloged.</span>}
        </div>
        {settingsWarning && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {settingsWarning}
          </p>
        )}
        {!sessionToken && (
          <p className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            No session token — live service checks were skipped; cards show saved-settings status only.
          </p>
        )}
      </div>

      {loading && resolved.every((r) => r.status === "unknown" || r.status === "native" || r.status === "unavailable") ? (
        <div className="flex items-center gap-2 text-sm text-gray-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking integration status…
        </div>
      ) : null}

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
              {items.map((item) => <IntegrationCard key={item.key} item={item} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
