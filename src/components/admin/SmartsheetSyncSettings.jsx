import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Check, Loader2, Play, RefreshCw, Save, ShieldCheck } from "lucide-react";
import {
  getSmartsheetSyncStatus,
  getSmartsheetSyncConfig,
  saveSmartsheetSyncConfig,
  listSmartsheetSheets,
  testSmartsheetConnection,
  runSmartsheetSync,
  getSmartsheetColumnsForBindings,
} from "@/components/admin/smartsheetSyncPersistence";
import { getMappableFields } from "@/components/admin/smartsheetSyncFields";
import SmartsheetSalesSnapshotReview from "@/components/admin/SmartsheetSalesSnapshotReview";
import OrderReviewTools from "@/components/orders/OrderReviewTools";
import {
  prepareSmartsheetProfileTargetChange,
  smartsheetProfileTargetLocked,
} from "@/components/admin/smartsheetMappingFreshnessModel";
import {
  enforceSmartsheetBackendSafety,
  smartsheetWriteControlsLocked,
} from "@/components/admin/smartsheetSyncSafetyModel";
import { stableConfigString } from "@/components/admin/smartsheetConfigState.mjs";
import { enforceOrderBackgroundSyncPolicy } from "../../../base44/shared/smartsheetOrderBackgroundPolicy.mjs";

function normalizeForMatch(value) {
  return String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const FIELD_ALIASES = {
  title: ["title", "project", "project name", "job", "job name", "job title", "opportunity name", "deal name"],
  client_name: ["client", "client name", "customer", "customer name", "company", "company name", "account", "account name", "business", "business name"],
  sales_status: ["sales status", "status", "stage", "pipeline stage", "sales stage", "deal stage", "opportunity stage"],
  lead_source: ["lead source", "source", "lead", "origination", "origin", "referral source", "channel"],
  estimate_amount: ["estimate amount", "estimate", "amount", "value", "budget", "deal value", "opportunity value", "estimated value", "quote amount", "price"],
  contact_name: ["contact name", "contact", "name", "primary contact", "contact person"],
  contact_email: ["contact email", "email", "e mail", "email address"],
  contact_phone: ["contact phone", "phone", "tel", "telephone", "phone number", "mobile", "cell"],
  sales_rep: ["sales rep", "rep", "salesperson", "sales person", "sales representative", "owner", "sales owner", "deal owner", "assigned rep"],
  project_type: ["project type", "type", "category", "project category", "job type", "sign type"],
  install_location: ["install location", "location", "site", "site location", "install address", "installation location"],
  township_city: ["township city", "city", "township", "town", "municipality"],
  county: ["county"],
  due_date: ["due date", "due", "deadline", "target date"],
  close_date: ["close date", "close", "closed date", "closing date", "date closed"],
  expected_close_date: ["expected close date", "expected close", "forecast close", "expected closing date"],
  date_initial_contact: ["date initial contact", "initial contact", "first contact", "date first contact"],
  date_estimate_sent: ["date estimate sent", "estimate sent", "estimate sent date", "quote sent", "quote sent date"],
  date_order_created: ["date order created", "order created", "order date", "date order"],
  project_install_date: ["project install date", "install date", "installation date", "installation", "install"],
  permit_submitted_date: ["permit submitted", "permit submitted date", "date permit submitted", "permit filed", "permit filed date"],
  permit_approved_date: ["permit approved", "permit approved date", "date permit approved", "permit received", "permit received date"],
  permit_number: ["permit number", "permit", "permit id", "permit no"],
  permitting: ["permitting", "permit required", "permits needed", "permitting required"],
  estimator: ["estimator", "estimate by", "estimated by"],
  designer: ["designer", "design by", "designed by"],
  surveyor: ["surveyor", "survey by", "surveyed by", "site surveyor"],
  project_manager: ["project manager", "pm", "manager", "project mgmt", "project management"],
  current_task_description: ["current task", "task", "current task description", "current step", "active task", "next task"],
  current_task_assigned_to: ["current task assigned to", "assigned to", "assigned", "task assigned to", "owner assigned"],
  current_task_deadline: ["current task deadline", "task deadline", "task due date", "current task due"],
  lost_reason: ["lost reason", "reason lost", "loss reason", "close reason lost"],
  notes_serialized: ["work notes", "notes", "work notes serialized", "job notes", "project notes"],
  customer_name: ["customer name", "customer", "client", "client name", "company", "company name"],
  request_type: ["request type", "type", "order type", "request category"],
  description: ["description", "desc", "details", "item description", "order description"],
  quantity: ["quantity", "qty", "quant", "amount needed"],
  date_needed: ["date needed", "needed by", "needed date", "date required", "required date"],
  date_ordered: ["date ordered", "ordered date", "order date", "date order placed", "placed date"],
  vendor: ["vendor", "supplier", "vendor name", "supplier name", "source"],
  date_received: ["date received", "received date", "date recv", "recv date"],
  status: ["status", "order status", "request status", "fulfillment status"],
  requestor_name: ["requestor name", "requestor", "requester", "requester name", "requested by", "requested by name"],
  requestor_email: ["requestor email", "requester email", "requestor e mail", "request email", "requested by email"],
};

const DEFAULT_CONFIG = {
  schema_version: 3,
  global_enabled: false,
  observation_mode: true,
  backup_before_write: true,
  mass_change_limit_count: 25,
  mass_change_limit_percent: 10,
  sales: {
    label: "Sales Pipeline",
    smartsheet_sheet_name: "Workflow",
    smartsheet_sheet_id: "",
    column_bindings: {},
    bindings_verified_at: "",
    rollout_baseline: null,
    mirror_enabled: false,
    importer_enabled: false,
    pull_enabled: false,
    push_enabled: false,
    create_base44_from_smartsheet: false,
    create_smartsheet_from_base44: false,
  },
  orders: {
    label: "Order Form",
    smartsheet_sheet_name: "Order Request",
    smartsheet_sheet_id: "",
    column_bindings: {},
    bindings_verified_at: "",
    rollout_baseline: null,
    mirror_enabled: false,
    importer_enabled: false,
    pull_enabled: false,
    push_enabled: false,
    create_base44_from_smartsheet: false,
    create_smartsheet_from_base44: false,
  },
};

function normalizeBindings(bindings = {}) {
  const out = {};
  for (const [key, val] of Object.entries(bindings || {})) {
    if (val && typeof val === "object" && val.column_id) {
      out[key] = String(val.column_id);
    } else if (typeof val === "string" && val.trim()) {
      out[key] = val.trim();
    } else if (val !== null && val !== undefined && val !== "") {
      out[key] = String(val);
    }
  }
  return out;
}

function mergeConfig(saved = {}, { writeBackendAvailable = false } = {}) {
  const merged = {
    ...DEFAULT_CONFIG,
    ...(saved || {}),
    sales: { ...DEFAULT_CONFIG.sales, ...(saved?.sales || {}) },
    orders: { ...DEFAULT_CONFIG.orders, ...(saved?.orders || {}) },
  };
  if (merged.sales) merged.sales.column_bindings = normalizeBindings(merged.sales.column_bindings);
  if (merged.orders) {
    merged.orders.column_bindings = normalizeBindings(merged.orders.column_bindings);
    merged.orders = enforceOrderBackgroundSyncPolicy(merged.orders);
  }
  return enforceSmartsheetBackendSafety(merged, { writeBackendAvailable });
}

function IntegrationCard({ title, subtitle, value, onChange, dataset, sessionToken, columns, columnsLoading, columnsMessage, onLoadColumns }) {
  const targetLocked = smartsheetProfileTargetLocked(value);
  const patch = (next) => onChange({ ...value, ...next });
  const fields = dataset ? getMappableFields(dataset) : [];
  const bindings = value.column_bindings || {};
  const setBinding = (fieldKey, columnId) => {
    const next = { ...bindings };
    if (columnId) next[fieldKey] = columnId;
    else delete next[fieldKey];
    patch({ column_bindings: next });
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white/70 p-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge className={value.mirror_enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
            {value.mirror_enabled ? "Mirror armed" : "Mirror off"}
          </Badge>
          <Badge variant="outline">{Object.keys(bindings).length} column IDs bound</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Smartsheet sheet name</Label>
          <Input
            value={value.smartsheet_sheet_name || ""}
            onChange={(e) => patch({ smartsheet_sheet_name: e.target.value })}
            disabled={targetLocked}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Smartsheet sheet ID</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={value.smartsheet_sheet_id || ""}
              onChange={(e) => patch({ smartsheet_sheet_id: e.target.value.trim() })}
              disabled={targetLocked}
              placeholder="Numeric sheet ID"
              className="flex-1"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onLoadColumns(dataset)}
              disabled={!sessionToken || !value.smartsheet_sheet_id || columnsLoading}
            >
              {columnsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-1">Load columns</span>
            </Button>
          </div>
          {columnsMessage && (
            <div className={`text-[11px] mt-1 ${columnsMessage.includes("Loaded") ? "text-green-700" : "text-red-600"}`}>{columnsMessage}</div>
          )}
          {targetLocked && (
            <div className="mt-1 text-[11px] font-medium text-amber-700">
              Target locked by the captured rollout baseline. Column bindings and sync switches remain editable.
            </div>
          )}
        </div>
      </div>

      {fields.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-700">Column bindings (Base44 field → Smartsheet column)</div>
            {columns.length > 0 && <Badge variant="outline">{columns.length} columns discovered</Badge>}
          </div>
          {columns.length === 0 && (
            <div className="text-[11px] text-gray-500">Enter the sheet ID and click "Load columns" to discover available Smartsheet columns, then bind each field.</div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 max-h-72 overflow-y-auto">
            {fields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1">
                <Label className="text-[11px] text-gray-600">{field.label}</Label>
                <select
                  value={bindings[field.key] || ""}
                  onChange={(e) => setBinding(field.key, e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs"
                >
                  <option value="">— not bound —</option>
                  {columns.map((col) => (
                    <option key={col.id} value={col.id}>{col.title} ({col.type})</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[
          ["mirror_enabled", "Enable mirror", "Master switch for this dataset."],
          ["importer_enabled", "Enable manual importer", "Admin-only spreadsheet fallback."],
          ["pull_enabled", "Pull Smartsheet → Base44", "Updates approved mapped fields only."],
          ["push_enabled", "Push Base44 → Smartsheet", dataset === "orders" ? "Order Form background push is locked OFF. Use Save & Sync for explicit writes." : "Updates approved mapped fields only."],
          ["create_base44_from_smartsheet", "Create in Base44 from new Smartsheet rows", dataset === "orders" ? "Order Form automatic creation is locked OFF; unlinked rows are flagged for review." : "Requires client/relationship resolution."],
          ["create_smartsheet_from_base44", "Create in Smartsheet from new Base44 rows", dataset === "orders" ? "Order Form automatic creation is locked OFF. Save & Sync can explicitly create a row for a new Order." : "Creates one linked row per Base44 record."],
        ].map(([key, label, help]) => (
          <div key={key} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
            <div>
              <div className="text-sm font-medium text-gray-800">{label}</div>
              <div className="text-[11px] text-gray-500">{help}</div>
            </div>
            <Switch
              checked={Boolean(value[key])}
              onCheckedChange={(checked) => patch({ [key]: checked })}
              disabled={dataset === "orders" && ["push_enabled", "create_base44_from_smartsheet", "create_smartsheet_from_base44"].includes(key)}
            />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Permanent rule:</strong> missing or deleted Smartsheet rows will never delete Base44 records. Base44-only rows remain in Base44 and may be excluded from the mirror.
      </div>
    </div>
  );
}

export default function SmartsheetSyncSettings({ sessionToken }) {
  const [record, setRecord] = useState(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [apiStatus, setApiStatus] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiMessage, setApiMessage] = useState("");
  const [availableSheets, setAvailableSheets] = useState([]);
  const [salesColumns, setSalesColumns] = useState([]);
  const [orderColumns, setOrderColumns] = useState([]);
  const [columnsLoading, setColumnsLoading] = useState({ sales: false, orders: false });
  const [columnsMessage, setColumnsMessage] = useState({ sales: "", orders: "" });
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncStartedAt, setSyncStartedAt] = useState(null);

  const writesArmed = useMemo(() => Boolean(
    config.global_enabled &&
    !config.observation_mode &&
    ((config.sales.mirror_enabled && (config.sales.pull_enabled || config.sales.push_enabled)) ||
      (config.orders.mirror_enabled && (config.orders.pull_enabled || config.orders.push_enabled)))
  ), [config]);

  const dirty = useMemo(() => {
    const saved = record?.setting_value;
    if (!saved) return true;
    const savedStr = stableConfigString(mergeConfig(saved));
    const currentStr = stableConfigString(mergeConfig(config));
    return savedStr !== currentStr;
  }, [record, config]);

  const load = async () => {
    setLoading(true);
    setError("");
    if (!sessionToken) {
      setRecord(null);
      setConfig(DEFAULT_CONFIG);
      setLoading(false);
      return;
    }
    try {
      const loaded = await getSmartsheetSyncConfig({ sessionToken });
      setRecord(loaded);
      setConfig(mergeConfig(loaded?.setting_value));
    } catch (err) {
      console.error("Smartsheet sync settings could not be loaded:", err);
      setError(err?.message || "Smartsheet sync settings could not be loaded safely.");
    } finally {
      setLoading(false);
    }
  };

  const loadApiStatus = async () => {
    if (!sessionToken) return;
    setApiLoading(true);
    setApiMessage("");
    try {
      const status = await getSmartsheetSyncStatus({ sessionToken });
      setApiStatus(status);
    } catch (err) {
      setApiMessage(err?.message || "Smartsheet API status could not be loaded.");
    } finally {
      setApiLoading(false);
    }
  };

  const testApi = async () => {
    if (!sessionToken || apiLoading) return;
    setApiLoading(true);
    setApiMessage("");
    try {
      const result = await testSmartsheetConnection({ sessionToken });
      setApiMessage(`Read-only connection verified. ${Number(result.total_accessible_sheets || 0).toLocaleString()} accessible sheet${Number(result.total_accessible_sheets || 0) === 1 ? "" : "s"}.`);
      await loadApiStatus();
    } catch (err) {
      setApiMessage(err?.message || "Smartsheet connection test failed.");
    } finally {
      setApiLoading(false);
    }
  };

  const discoverSheets = async () => {
    if (!sessionToken || apiLoading) return;
    setApiLoading(true);
    setApiMessage("");
    try {
      const result = await listSmartsheetSheets({ sessionToken });
      setAvailableSheets(Array.isArray(result.sheets) ? result.sheets : []);
      setApiMessage(`Discovered ${Number(result.total_accessible_sheets || 0).toLocaleString()} accessible Smartsheet sheet${Number(result.total_accessible_sheets || 0) === 1 ? "" : "s"}. No data was changed.`);
    } catch (err) {
      setApiMessage(err?.message || "Smartsheet sheet discovery failed.");
    } finally {
      setApiLoading(false);
    }
  };

  const autoMatchBindings = (dataset, cols) => {
    const fields = getMappableFields(dataset);
    const existing = config?.[dataset]?.column_bindings || {};
    const used = new Set(Object.values(existing));
    const next = { ...existing };
    let matched = 0;
    for (const field of fields) {
      if (next[field.key] && used.has(next[field.key])) continue;
      const normLabel = normalizeForMatch(field.label);
      const normKey = normalizeForMatch(field.key);
      const aliases = (FIELD_ALIASES[field.key] || []).map(normalizeForMatch);
      let bestCol = null;
      // Pass 1: exact match on label, key, or alias
      for (const col of cols) {
        if (used.has(col.id)) continue;
        const normTitle = normalizeForMatch(col.title);
        if (normTitle === normLabel || normTitle === normKey || aliases.includes(normTitle)) { bestCol = col; break; }
      }
      // Pass 2: partial/contains match on label, key, or alias
      if (!bestCol) {
        for (const col of cols) {
          if (used.has(col.id)) continue;
          const normTitle = normalizeForMatch(col.title);
          if (normTitle.includes(normLabel) || normLabel.includes(normTitle) || normTitle.includes(normKey) ||
              aliases.some((a) => normTitle.includes(a) || a.includes(normTitle))) { bestCol = col; break; }
        }
      }
      if (bestCol) {
        next[field.key] = bestCol.id;
        used.add(bestCol.id);
        matched++;
      }
    }
    return { bindings: next, matched, total: fields.length };
  };

  // Fetch columns only (for display) without auto-binding — used on page load
  // so saved bindings are visible immediately without marking the form dirty.
  const fetchColumnsOnly = async (dataset) => {
    const profile = config?.[dataset];
    const sheetId = profile?.smartsheet_sheet_id;
    if (!sessionToken || !sheetId) return;
    setColumnsLoading((s) => ({ ...s, [dataset]: true }));
    try {
      const result = await getSmartsheetColumnsForBindings({ sessionToken, sheetId });
      const cols = Array.isArray(result.columns) ? result.columns : [];
      if (dataset === "orders") setOrderColumns(cols);
      else setSalesColumns(cols);
    } catch {
      // silent — columns just won't show in dropdowns
    } finally {
      setColumnsLoading((s) => ({ ...s, [dataset]: false }));
    }
  };

  const loadColumns = async (dataset) => {
    const profile = config?.[dataset];
    const sheetId = profile?.smartsheet_sheet_id;
    if (!sessionToken) {
      setColumnsMessage((m) => ({ ...m, [dataset]: "Sign in required to load columns." }));
      return;
    }
    if (!sheetId) {
      setColumnsMessage((m) => ({ ...m, [dataset]: "Enter a sheet ID first." }));
      return;
    }
    setColumnsLoading((s) => ({ ...s, [dataset]: true }));
    setColumnsMessage((m) => ({ ...m, [dataset]: "" }));
    try {
      const result = await getSmartsheetColumnsForBindings({ sessionToken, sheetId });
      const cols = Array.isArray(result.columns) ? result.columns : [];
      if (dataset === "orders") setOrderColumns(cols);
      else setSalesColumns(cols);
      const { bindings, matched, total } = autoMatchBindings(dataset, cols);
      setConfig((c) => ({
        ...c,
        [dataset]: {
          ...c[dataset],
          column_bindings: bindings,
          bindings_verified_at: matched > 0 ? new Date().toISOString() : (c[dataset]?.bindings_verified_at || ""),
        },
      }));
      setColumnsMessage((m) => ({
        ...m,
        [dataset]: `Loaded ${cols.length} column${cols.length === 1 ? "" : "s"}; auto-bound ${matched} of ${total} field${matched === 1 ? "" : "s"}. Click "Save Settings" above to keep these bindings.`,
      }));
    } catch (err) {
      setColumnsMessage((m) => ({ ...m, [dataset]: err?.message || "Could not load Smartsheet columns." }));
    } finally {
      setColumnsLoading((s) => ({ ...s, [dataset]: false }));
    }
  };

  const runSync = async () => {
    if (!sessionToken || syncing) return;
    setSyncing(true);
    setSyncResult(null);
    setError("");
    setSyncStartedAt(new Date());
    try {
      const result = await runSmartsheetSync({ sessionToken });
      setSyncResult(result);
    } catch (err) {
      setError(err?.message || "Smartsheet sync could not run.");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    load();
    loadApiStatus();
  }, [sessionToken]);

  // Auto-load column lists when the page loads and a sheet ID is already
  // configured, so saved bindings are visible in the dropdowns immediately.
  const [autoLoaded, setAutoLoaded] = useState(false);
  useEffect(() => {
    if (loading || !sessionToken || autoLoaded) return;
    if (config.sales?.smartsheet_sheet_id) fetchColumnsOnly("sales");
    if (config.orders?.smartsheet_sheet_id) fetchColumnsOnly("orders");
    setAutoLoaded(true);
  }, [loading, sessionToken, autoLoaded]);

  const setProfile = (key, next) => {
    const currentProfile = config?.[key] || {};
    const prepared = prepareSmartsheetProfileTargetChange(currentProfile, next);
    setConfig((current) => ({ ...current, [key]: prepared.profile }));
    if (prepared.targetChanged) {
      setApiMessage("Target sheet changed. Previous saved bindings were cleared.");
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const normalized = mergeConfig(config, {
        writeBackendAvailable: apiStatus?.write_actions_available === true,
      });
      const savedRecord = await saveSmartsheetSyncConfig({
        sessionToken,
        loadedRecord: record,
        settingValue: normalized,
      });
      setRecord(savedRecord);
      setConfig(mergeConfig(savedRecord?.setting_value));
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      console.error("Smartsheet sync settings save blocked:", err);
      setError(err?.message || "Smartsheet sync settings changed elsewhere. Reload before saving.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="clay-card p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                Smartsheet Sync
              </h2>
              <Badge className={config.global_enabled ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}>
                {config.global_enabled ? "Globally enabled" : "Global kill switch OFF"}
              </Badge>
              <Badge className={config.observation_mode ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}>
                {config.observation_mode ? "Observation only" : "Writes allowed by mode"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              One controlled bridge for Sales Pipeline ↔ Workflow and Order Form ↔ Order Request. Row/column position is never used as identity.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={load} disabled={saving || syncing}>
              <RefreshCw className="h-4 w-4 mr-2" />Reload
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={runSync} disabled={syncing || saving || !config.global_enabled || config.observation_mode}>
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Run Sync Now
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={saving || !dirty}
              className={dirty && !saved ? "ring-2 ring-amber-400 ring-offset-1" : ""}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : saved ? <Check className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {saving ? "Saving…" : saved ? "Saved" : dirty ? "Save Settings *" : "Save Settings"}
            </Button>
          </div>
        </div>

        {dirty && !saving && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span><strong>Unsaved changes.</strong> Column bindings and settings you loaded or toggled are not persisted yet. Click <strong>Save Settings</strong> to keep them.</span>
          </div>
        )}

        {syncing && (
          <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
            <span><strong>Sync is running…</strong> Started {syncStartedAt ? new Date(syncStartedAt).toLocaleTimeString() : ""}. Do not close this page until it finishes.</span>
          </div>
        )}

        {!syncing && syncResult && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex items-center gap-2">
            <Check className="h-4 w-4 flex-shrink-0" />
            <span><strong>Sync completed.</strong> Results shown below.</span>
          </div>
        )}

        {!syncing && !syncResult && !config.global_enabled && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            <strong>Run Sync Now is disabled</strong> because the global kill switch is OFF. Turn on <strong>Global sync</strong> below to enable manual sync runs.
          </div>
        )}

        {!syncing && !syncResult && config.global_enabled && config.observation_mode && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            <strong>Run Sync Now is disabled</strong> because observation mode is ON. Turn off <strong>Observation mode</strong> below to enable manual sync runs.
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold">Smartsheet API connection</div>
              <div className="mt-1 text-xs">
                Credential: {apiStatus?.configured ? "configured securely on the server" : "not configured"}.
                {" "}The token is never stored in this settings record or returned to the browser.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={loadApiStatus} disabled={apiLoading || !sessionToken}>
                {apiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-2">API Status</span>
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={testApi} disabled={apiLoading || !apiStatus?.configured}>
                Test Read Only
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={discoverSheets} disabled={apiLoading || !apiStatus?.configured}>
                Discover Sheets
              </Button>
            </div>
          </div>

          {!apiStatus?.configured && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              Add the rotated token as the Base44 app secret <code className="font-mono">SMARTSHEET_API_TOKEN</code>. Do not place it in source code or GlobalSettings.
            </div>
          )}

          {apiStatus && smartsheetWriteControlsLocked(apiStatus) && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
              The deployed Smartsheet backend is read-only. You can configure settings below, but no sync writes will run until a write-capable backend is deployed.
            </div>
          )}

          {apiMessage && <div className="text-xs">{apiMessage}</div>}

          {availableSheets.length > 0 && (
            <div className="rounded-md border border-blue-200 bg-white/70 p-2">
              <div className="text-xs font-semibold mb-2">Accessible sheets — review only</div>
              <div className="max-h-52 overflow-y-auto divide-y">
                {availableSheets.map((sheet) => (
                  <div key={sheet.id} className="flex flex-col gap-1 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{sheet.name}</div>
                      <div className="text-gray-500">ID {sheet.id}{sheet.access_level ? ` • ${sheet.access_level}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex items-start gap-2">
          <RefreshCw className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Automatic sync is active.</strong> The sync runs automatically every 15 minutes, server-side — it continues even when no one has the app open, and does not use integration credits (Smartsheet API calls use your Smartsheet token directly). Both directions (pull and push) run for every dataset that has them enabled. A live status indicator appears at the bottom-right corner of every page.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
            <div>
              <div className="text-sm font-medium">Global sync</div>
              <div className="text-[11px] text-gray-500">Emergency kill switch.</div>
            </div>
            <Switch
            checked={config.global_enabled}
            onCheckedChange={(checked) => setConfig((c) => ({ ...c, global_enabled: checked }))}
            />
          </div>
          <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
            <div>
              <div className="text-sm font-medium">Observation mode</div>
              <div className="text-[11px] text-gray-500">Preview changes; perform no sync writes.</div>
            </div>
            <Switch
            checked={config.observation_mode}
            onCheckedChange={(checked) => setConfig((c) => ({ ...c, observation_mode: checked }))}
            />
          </div>
          <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
            <div>
              <div className="text-sm font-medium">Backup before writes</div>
              <div className="text-[11px] text-gray-500">Required safety gate for future writes.</div>
            </div>
            <Switch checked={config.backup_before_write} onCheckedChange={(checked) => setConfig((c) => ({ ...c, backup_before_write: checked }))} />
          </div>
          <div className={`rounded-lg border p-3 text-xs ${writesArmed ? "border-red-300 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}>
            <div className="font-semibold">{writesArmed ? "Write-capable configuration" : "No live sync writes armed"}</div>
            <div className="mt-1">A later backend gate will independently enforce these settings.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Mass-change hard stop (records)</Label>
            <Input
              type="number"
              min="1"
              max="1000"
              value={config.mass_change_limit_count}
              onChange={(e) => setConfig((c) => ({ ...c, mass_change_limit_count: Math.max(1, Number(e.target.value) || 1) }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Mass-change hard stop (% of linked records)</Label>
            <Input
              type="number"
              min="1"
              max="100"
              value={config.mass_change_limit_percent}
              onChange={(e) => setConfig((c) => ({ ...c, mass_change_limit_percent: Math.min(100, Math.max(1, Number(e.target.value) || 1)) }))}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <IntegrationCard
        title="Sales Pipeline ↔ Workflow"
        subtitle="WorkOrder Sales records will map to the Smartsheet Workflow sheet by stable IDs and approved field translations."
        value={config.sales}
        onChange={(next) => setProfile("sales", next)}
        dataset="sales"
        sessionToken={sessionToken}
        columns={salesColumns}
        columnsLoading={columnsLoading.sales}
        columnsMessage={columnsMessage.sales}
        onLoadColumns={loadColumns}
      />

      <SmartsheetSalesSnapshotReview
        sessionToken={sessionToken}
        savedSales={record?.setting_value?.sales}
        draftSales={config.sales}
      />

      <IntegrationCard
        title="Order Form ↔ Order Request"
        subtitle="Order records will map to the Smartsheet Order Request sheet, including controlled customer/work-order relationship setup."
        value={config.orders}
        onChange={(next) => setProfile("orders", next)}
        dataset="orders"
        sessionToken={sessionToken}
        columns={orderColumns}
        columnsLoading={columnsLoading.orders}
        columnsMessage={columnsMessage.orders}
        onLoadColumns={loadColumns}
      />

      <OrderReviewTools sessionToken={sessionToken} />

      {syncResult && Array.isArray(syncResult.results) && (
        <div className={`rounded-xl border bg-white p-4 space-y-3 ${syncResult.needs_review ? "border-amber-300" : "border-emerald-200"}`}>
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm text-gray-900 flex items-center gap-2">
              {syncResult.needs_review ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <Check className="h-4 w-4 text-emerald-600" />}
              {syncResult.needs_review ? "Sync needs review" : "Sync results"}
            </div>
            <span className="text-xs text-gray-500">Finished {new Date().toLocaleTimeString()}</span>
          </div>
          {syncResult.needs_review && (
            <p role="alert" className="text-xs text-amber-800">
              A requested sync stage was blocked or reported errors, conflicts or incomplete verification. The run finished processing, but synchronization is not fully complete.
            </p>
          )}
          {syncResult.results.map((r, i) => (
            <div key={`${r.dataset}-${r.direction || i}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
              <div className="font-medium capitalize">
                {r.dataset}
                {r.direction && <span className="ml-2 text-gray-500">({r.direction === "pull" ? "Smartsheet → Base44" : "Base44 → Smartsheet"})</span>}
              </div>
              {r.skipped ? (
                <div className="text-amber-700 mt-1">Skipped: {r.reason}</div>
              ) : (
                <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
                  <span>{r.direction === "pull" ? "Rows: " : "Examined: "}<strong>{r.direction === "pull" ? (r.rows_examined ?? r.records_examined) : r.records_examined}</strong></span>
                  <span className="text-green-700">Created: <strong>{r.created}</strong></span>
                  <span className="text-blue-700">Updated: <strong>{r.updated}</strong></span>
                  {r.direction !== "pull" && <span className="text-amber-700">Conflicts: <strong>{r.conflicts}</strong></span>}
                  {r.errors > 0 && <span className="text-red-700">Errors: <strong>{r.errors}</strong></span>}
                </div>
              )}
              {r.dataset === "orders" && Number(r.unlinked_smartsheet_rows_flagged_for_review) > 0 && (
                <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-900" role="alert">
                  <strong>{r.unlinked_smartsheet_rows_flagged_for_review} Smartsheet rows have no confirmed Base44 Order link.</strong>
                  <p>Existing linked Orders may have been updated. Review these permanent row IDs before enabling record creation; no unmatched rows were deleted.</p>
                  {r.unlinked_row_ids?.length > 0 && <p className="mt-1 break-words font-mono">Row IDs: {r.unlinked_row_ids.join(', ')}</p>}
                </div>
              )}
              {r.error_details?.length > 0 && (
                <div className="mt-2 text-red-700 space-y-0.5">
                  {r.error_details.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Safety rules locked into the design</div>
        <div className="mt-2 text-xs leading-relaxed">
          Smartsheet never deletes Base44 records. Base44-only records may remain unmirrored. New external rows must resolve/create the correct Base44 Customer and relationships. Ambiguous matches stop for review. Sorting or rearranging rows/columns never changes identity.
        </div>
      </div>
    </div>
  );
}