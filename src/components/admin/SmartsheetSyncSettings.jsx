import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Check, Loader2, Play, RefreshCw, Save, ShieldCheck } from "lucide-react";
import {
  loadSingleGlobalSetting,
  saveGlobalSettingValueIfUnchanged,
} from "@/components/shared/globalSettingsPersistence";
import {
  getSmartsheetSyncStatus,
  listSmartsheetSheets,
  testSmartsheetConnection,
  runSmartsheetSync,
  getSmartsheetColumnsForBindings,
} from "@/components/admin/smartsheetSyncPersistence";
import { getMappableFields } from "@/components/admin/smartsheetSyncFields";
import {
  prepareSmartsheetProfileTargetChange,
} from "@/components/admin/smartsheetMappingFreshnessModel";
import {
  enforceSmartsheetBackendSafety,
  smartsheetWriteControlsLocked,
} from "@/components/admin/smartsheetSyncSafetyModel";

const SETTING_KEY = "smartsheetSyncConfig";

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

function mergeConfig(saved = {}, { writeBackendAvailable = false } = {}) {
  return enforceSmartsheetBackendSafety({
    ...DEFAULT_CONFIG,
    ...(saved || {}),
    sales: { ...DEFAULT_CONFIG.sales, ...(saved?.sales || {}), rollout_baseline: null },
    orders: { ...DEFAULT_CONFIG.orders, ...(saved?.orders || {}), rollout_baseline: null },
  }, { writeBackendAvailable });
}

function IntegrationCard({ title, subtitle, value, onChange, dataset, sessionToken, columns, columnsLoading, onLoadColumns }) {
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
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Smartsheet sheet ID</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={value.smartsheet_sheet_id || ""}
              onChange={(e) => patch({ smartsheet_sheet_id: e.target.value.trim() })}
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
          ["push_enabled", "Push Base44 → Smartsheet", "Updates approved mapped fields only."],
          ["create_base44_from_smartsheet", "Create in Base44 from new Smartsheet rows", "Requires client/relationship resolution."],
          ["create_smartsheet_from_base44", "Create in Smartsheet from new Base44 rows", "Creates one linked row per Base44 record."],
        ].map(([key, label, help]) => (
          <div key={key} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
            <div>
              <div className="text-sm font-medium text-gray-800">{label}</div>
              <div className="text-[11px] text-gray-500">{help}</div>
            </div>
            <Switch
              checked={Boolean(value[key])}
              onCheckedChange={(checked) => patch({ [key]: checked })}
              disabled={false}
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
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const writesArmed = useMemo(() => Boolean(
    config.global_enabled &&
    !config.observation_mode &&
    ((config.sales.mirror_enabled && (config.sales.pull_enabled || config.sales.push_enabled)) ||
      (config.orders.mirror_enabled && (config.orders.pull_enabled || config.orders.push_enabled)))
  ), [config]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const loaded = await loadSingleGlobalSetting({
        entity: base44.entities.GlobalSettings,
        settingKey: SETTING_KEY,
        label: "Smartsheet sync configuration",
      });
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

  const loadColumns = async (dataset) => {
    const profile = config?.[dataset];
    const sheetId = profile?.smartsheet_sheet_id;
    if (!sessionToken || !sheetId) return;
    setColumnsLoading(true);
    setApiMessage("");
    try {
      const result = await getSmartsheetColumnsForBindings({ sessionToken, sheetId });
      const cols = Array.isArray(result.columns) ? result.columns : [];
      if (dataset === "orders") setOrderColumns(cols);
      else setSalesColumns(cols);
      setApiMessage(`Loaded ${cols.length} columns from sheet ${sheetId}.`);
    } catch (err) {
      setApiMessage(err?.message || "Could not load Smartsheet columns.");
    } finally {
      setColumnsLoading(false);
    }
  };

  const runSync = async () => {
    if (!sessionToken || syncing) return;
    setSyncing(true);
    setSyncResult(null);
    setError("");
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
      const savedRecord = await saveGlobalSettingValueIfUnchanged({
        entity: base44.entities.GlobalSettings,
        loadedRecord: record,
        settingKey: SETTING_KEY,
        nextValue: normalized,
        label: "Smartsheet sync configuration",
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
            <Button type="button" size="sm" variant="outline" onClick={load} disabled={saving}>
              <RefreshCw className="h-4 w-4 mr-2" />Reload
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={runSync} disabled={syncing || saving || !config.global_enabled || config.observation_mode}>
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Run Sync Now
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : saved ? <Check className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {saved ? "Saved" : "Save Settings"}
            </Button>
          </div>
        </div>

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
        columnsLoading={columnsLoading}
        onLoadColumns={loadColumns}
      />

      <IntegrationCard
        title="Order Form ↔ Order Request"
        subtitle="Order records will map to the Smartsheet Order Request sheet, including controlled customer/work-order relationship setup."
        value={config.orders}
        onChange={(next) => setProfile("orders", next)}
        dataset="orders"
        sessionToken={sessionToken}
        columns={orderColumns}
        columnsLoading={columnsLoading}
        onLoadColumns={loadColumns}
      />

      {syncResult && Array.isArray(syncResult.results) && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <div className="font-semibold text-sm text-gray-900">Sync results</div>
          {syncResult.results.map((r) => (
            <div key={r.dataset} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
              <div className="font-medium capitalize">{r.dataset}</div>
              {r.skipped ? (
                <div className="text-amber-700 mt-1">Skipped: {r.reason}</div>
              ) : (
                <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
                  <span>Examined: <strong>{r.records_examined}</strong></span>
                  <span className="text-green-700">Created: <strong>{r.created}</strong></span>
                  <span className="text-blue-700">Updated: <strong>{r.updated}</strong></span>
                  <span className="text-amber-700">Conflicts: <strong>{r.conflicts}</strong></span>
                  {r.errors > 0 && <span className="text-red-700">Errors: <strong>{r.errors}</strong></span>}
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