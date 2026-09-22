import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Check, Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import {
  loadSingleGlobalSetting,
  saveGlobalSettingValueIfUnchanged,
} from "@/components/shared/globalSettingsPersistence";
import {
  getSmartsheetColumns,
  getSmartsheetRows,
  getSmartsheetSyncStatus,
  listSmartsheetSheets,
  testSmartsheetConnection,
} from "@/components/admin/smartsheetSyncPersistence";
import {
  SMARTSHEET_MAPPING_BLUEPRINTS,
  analyzeSmartsheetColumns,
  buildVerifiedSmartsheetBinding,
  mappingDirectionLabel,
  mappingTransformLabel,
} from "@/components/admin/smartsheetMappingModel";
import { SMARTSHEET_CUSTOMER_RESOLUTION_POLICY } from "@/components/admin/smartsheetCustomerResolutionModel";
import { buildSmartsheetDryRunPreview } from "@/components/admin/smartsheetDryRunModel";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const SETTING_KEY = "smartsheetSyncConfig";

const DEFAULT_CONFIG = {
  schema_version: 2,
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
    mirror_enabled: false,
    importer_enabled: false,
    pull_enabled: false,
    push_enabled: false,
    create_base44_from_smartsheet: false,
    create_smartsheet_from_base44: false,
  },
};

function mergeConfig(saved = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...(saved || {}),
    sales: { ...DEFAULT_CONFIG.sales, ...(saved?.sales || {}) },
    orders: { ...DEFAULT_CONFIG.orders, ...(saved?.orders || {}) },
  };
}

function MappingPlan({ title, rows }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-xs text-gray-500">Blueprint only. Actual Smartsheet column IDs are not bound until the live sheets are inspected.</p>
        </div>
        <Badge variant="outline" className="shrink-0">{rows.length} fields</Badge>
      </div>
      <div className="mt-3 max-h-80 overflow-y-auto divide-y rounded-lg border bg-white">
        {rows.map((row) => (
          <div key={row.field} className="grid grid-cols-1 gap-2 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
            <div className="min-w-0">
              <div className="font-medium text-gray-800">{row.label}</div>
              <div className="font-mono text-[10px] text-gray-500">{row.field}</div>
              {row.suggestedNames?.length > 0 && (
                <div className="mt-1 text-[10px] text-gray-500">Likely Smartsheet labels: {row.suggestedNames.join(", ")}</div>
              )}
            </div>
            <Badge variant="outline" className="w-fit">{mappingDirectionLabel(row.direction)}</Badge>
            <Badge variant="outline" className="w-fit">{mappingTransformLabel(row.transform)}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveMappingAnalysisCard({ title, result }) {
  if (!result) return null;

  if (result.status !== "ready") {
    const message = result.status === "ambiguous_sheet"
      ? `Multiple accessible sheets match "${result.expectedName}". Review them before choosing one.`
      : `No accessible sheet exactly matches "${result.expectedName}".`;
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <div className="font-semibold">{title}</div>
        <div className="mt-1">{message}</div>
        {result.sheetMatches?.length > 0 && (
          <div className="mt-2 space-y-1">
            {result.sheetMatches.map((sheet) => <div key={sheet.id}>{sheet.name} — ID {sheet.id}</div>)}
          </div>
        )}
      </div>
    );
  }

  const { sheet, analysis } = result;
  return (
    <div className="rounded-lg border border-blue-200 bg-white/80 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="mt-1 text-[11px] text-gray-500">{sheet.name} • Sheet ID {sheet.id}</div>
        </div>
        <div className="flex flex-wrap gap-1 text-[11px]">
          <Badge className="bg-green-100 text-green-700">{analysis.counts.matched} matched</Badge>
          <Badge className="bg-amber-100 text-amber-800">{analysis.counts.missing} missing</Badge>
          <Badge className="bg-red-100 text-red-700">{analysis.counts.conflict} conflicts</Badge>
          <Badge variant="outline">{analysis.counts.protected} protected</Badge>
        </div>
      </div>

      <div className="mt-3 max-h-96 overflow-y-auto divide-y rounded-md border bg-white">
        {analysis.fields.map((field) => {
          const column = field.matches?.[0];
          const statusClass = field.status === "matched"
            ? "bg-green-100 text-green-700"
            : field.status === "conflict"
              ? "bg-red-100 text-red-700"
              : field.status === "missing"
                ? "bg-amber-100 text-amber-800"
                : "bg-gray-100 text-gray-700";
          return (
            <div key={field.field} className="grid grid-cols-1 gap-2 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="font-medium text-gray-800">{field.label}</div>
                <div className="font-mono text-[10px] text-gray-500">{field.field}</div>
              </div>
              <div className="min-w-0 text-gray-600">
                {field.status === "matched" && column ? (
                  <>
                    <div className="font-medium truncate">{column.title}</div>
                    <div className="text-[10px]">Column ID {column.id} • {column.type || "UNKNOWN"}</div>
                  </>
                ) : field.status === "conflict" ? (
                  <div>{field.matches.map((match) => `${match.title} (ID ${match.id})`).join(", ")}</div>
                ) : field.status === "protected" ? (
                  <div>Base44 only — no Smartsheet binding</div>
                ) : (
                  <div>No exact approved column-name match</div>
                )}
              </div>
              <Badge className={statusClass}>{field.status}</Badge>
            </div>
          );
        })}
      </div>

      {analysis.unmappedColumns.length > 0 && (
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-2 text-[11px] text-gray-600">
          <span className="font-semibold">Unmapped Smartsheet columns:</span>{" "}
          {analysis.unmappedColumns.map((column) => `${column.title} (ID ${column.id})`).join(", ")}
        </div>
      )}
    </div>
  );
}

function IntegrationCard({ title, subtitle, value, onChange }) {
  const patch = (next) => onChange({ ...value, ...next });
  return (
    <div className="rounded-xl border border-gray-200 bg-white/70 p-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>
        <Badge className={value.mirror_enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
          {value.mirror_enabled ? "Mirror armed" : "Mirror off"}
        </Badge>
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
          <Input
            value={value.smartsheet_sheet_id || ""}
            onChange={(e) => patch({ smartsheet_sheet_id: e.target.value.trim() })}
            placeholder="Discovered from API later"
            className="mt-1"
          />
        </div>
      </div>

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
            <Switch checked={Boolean(value[key])} onCheckedChange={(checked) => patch({ [key]: checked })} />
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
  const [columnPreview, setColumnPreview] = useState(null);
  const [liveMappingAnalysis, setLiveMappingAnalysis] = useState(null);

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

  const analyzeLiveMappings = async () => {
    if (!sessionToken || apiLoading) return;
    setApiLoading(true);
    setApiMessage("");
    setLiveMappingAnalysis(null);
    try {
      await testSmartsheetConnection({ sessionToken });
      const discovery = await listSmartsheetSheets({ sessionToken });
      const sheets = Array.isArray(discovery.sheets) ? discovery.sheets : [];
      setAvailableSheets(sheets);

      const profiles = [
        {
          key: "sales",
          title: "Sales Pipeline ↔ Workflow",
          expectedName: config.sales.smartsheet_sheet_name || "Workflow",
          expectedId: String(config.sales.smartsheet_sheet_id || "").trim(),
          blueprint: SMARTSHEET_MAPPING_BLUEPRINTS.sales,
        },
        {
          key: "orders",
          title: "Order Form ↔ Order Request",
          expectedName: config.orders.smartsheet_sheet_name || "Order Request",
          expectedId: String(config.orders.smartsheet_sheet_id || "").trim(),
          blueprint: SMARTSHEET_MAPPING_BLUEPRINTS.orders,
        },
      ];

      const results = {};
      for (const profile of profiles) {
        const normalizedExpectedName = String(profile.expectedName || "").trim().toLowerCase();
        const sheetMatches = profile.expectedId
          ? sheets.filter((sheet) => String(sheet.id) === profile.expectedId)
          : sheets.filter((sheet) => String(sheet.name || "").trim().toLowerCase() === normalizedExpectedName);

        if (sheetMatches.length !== 1) {
          results[profile.key] = {
            status: sheetMatches.length > 1 ? "ambiguous_sheet" : "missing_sheet",
            expectedName: profile.expectedName,
            expectedId: profile.expectedId,
            sheetMatches,
          };
          continue;
        }

        const sheet = sheetMatches[0];
        const columnsResult = await getSmartsheetColumns({ sessionToken, sheetId: sheet.id });
        const columns = Array.isArray(columnsResult.columns) ? columnsResult.columns : [];
        results[profile.key] = {
          status: "ready",
          title: profile.title,
          sheet,
          analysis: analyzeSmartsheetColumns(profile.blueprint, columns),
        };
      }

      setLiveMappingAnalysis(results);
      const readyResults = Object.values(results).filter((result) => result.status === "ready");
      const matched = readyResults.reduce((sum, result) => sum + result.analysis.counts.matched, 0);
      const missing = readyResults.reduce((sum, result) => sum + result.analysis.counts.missing, 0);
      const conflicts = readyResults.reduce((sum, result) => sum + result.analysis.counts.conflict, 0);
      const unresolvedSheets = Object.values(results).length - readyResults.length;
      setApiMessage(
        `Read-only live mapping analysis complete: ${matched} exact field matches, ${missing} missing field matches, ${conflicts} field conflicts, ${unresolvedSheets} unresolved target sheet${unresolvedSheets === 1 ? "" : "s"}. No settings or business data were changed.`
      );
    } catch (err) {
      setApiMessage(err?.message || "Smartsheet live mapping analysis failed.");
    } finally {
      setApiLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadApiStatus();
  }, [sessionToken]);

  const inspectSheetColumns = async (sheet) => {
    if (!sessionToken || apiLoading || !sheet?.id) return;
    setApiLoading(true);
    setApiMessage("");
    try {
      const result = await getSmartsheetColumns({ sessionToken, sheetId: sheet.id });
      setColumnPreview({
        sheetId: String(sheet.id),
        sheetName: sheet.name || String(sheet.id),
        columns: Array.isArray(result.columns) ? result.columns : [],
      });
      setApiMessage(`Loaded ${Number(result.columns?.length || 0).toLocaleString()} columns from ${sheet.name || sheet.id}. Read only; no data changed.`);
    } catch (err) {
      setApiMessage(err?.message || "Smartsheet column discovery failed.");
    } finally {
      setApiLoading(false);
    }
  };

  const assignSheet = (profileKey, sheet) => {
    if (!sheet?.id) return;
    setConfig((current) => ({
      ...current,
      [profileKey]: {
        ...current[profileKey],
        smartsheet_sheet_id: String(sheet.id),
        smartsheet_sheet_name: sheet.name || current[profileKey]?.smartsheet_sheet_name || "",
      },
    }));
    setApiMessage(`${sheet.name || sheet.id} selected for ${profileKey === "sales" ? "Sales Pipeline" : "Order Form"}. Save Settings to persist this assignment.`);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const normalized = mergeConfig(config);
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

  const setProfile = (key, next) => setConfig((current) => ({ ...current, [key]: next }));

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
              <Button type="button" size="sm" variant="outline" onClick={analyzeLiveMappings} disabled={apiLoading || !apiStatus?.configured}>
                Analyze Live Mapping
              </Button>
            </div>
          </div>

          {!apiStatus?.configured && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              Add the rotated token as the Base44 app secret <code className="font-mono">SMARTSHEET_API_TOKEN</code>. Do not place it in source code or GlobalSettings.
            </div>
          )}

          {apiMessage && <div className="text-xs">{apiMessage}</div>}

          {availableSheets.length > 0 && (
            <div className="rounded-md border border-blue-200 bg-white/70 p-2">
              <div className="text-xs font-semibold mb-2">Accessible sheets — review only</div>
              <div className="max-h-52 overflow-y-auto divide-y">
                {availableSheets.map((sheet) => {
                  const isWorkflow = sheet.name === "Workflow";
                  const isOrderRequest = sheet.name === "Order Request";
                  return (
                    <div key={sheet.id} className="flex flex-col gap-2 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{sheet.name}</div>
                        <div className="text-gray-500">ID {sheet.id}{sheet.access_level ? ` • ${sheet.access_level}` : ""}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(isWorkflow || isOrderRequest) && (
                          <Badge className="bg-green-100 text-green-700 shrink-0">Expected sheet</Badge>
                        )}
                        <Button type="button" size="sm" variant="outline" onClick={() => inspectSheetColumns(sheet)} disabled={apiLoading}>
                          Inspect columns
                        </Button>
                        {isWorkflow && (
                          <Button type="button" size="sm" variant="outline" onClick={() => assignSheet("sales", sheet)}>
                            Use for Sales
                          </Button>
                        )}
                        {isOrderRequest && (
                          <Button type="button" size="sm" variant="outline" onClick={() => assignSheet("orders", sheet)}>
                            Use for Orders
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {columnPreview && (
            <div className="rounded-md border border-blue-200 bg-white/70 p-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold">
                  {columnPreview.sheetName} columns
                </div>
                <div className="text-[11px] text-gray-500">Sheet ID {columnPreview.sheetId}</div>
              </div>
              <div className="mt-2 max-h-64 overflow-y-auto divide-y">
                {columnPreview.columns.length === 0 ? (
                  <div className="py-3 text-xs text-gray-500">No columns returned.</div>
                ) : columnPreview.columns.map((column) => (
                  <div key={column.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{column.title}</div>
                      <div className="text-gray-500">
                        Column ID {column.id}{column.primary ? " • Primary" : ""}{column.system_column_type ? ` • ${column.system_column_type}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0">{column.type || "UNKNOWN"}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {liveMappingAnalysis && (
            <div className="space-y-3">
              <div className="text-xs font-semibold">Live mapping proposal — read only</div>
              <LiveMappingAnalysisCard title="Sales Pipeline ↔ Workflow" result={liveMappingAnalysis.sales} />
              <LiveMappingAnalysisCard title="Order Form ↔ Order Request" result={liveMappingAnalysis.orders} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
            <div>
              <div className="text-sm font-medium">Global sync</div>
              <div className="text-[11px] text-gray-500">Emergency kill switch.</div>
            </div>
            <Switch checked={config.global_enabled} onCheckedChange={(checked) => setConfig((c) => ({ ...c, global_enabled: checked }))} />
          </div>
          <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
            <div>
              <div className="text-sm font-medium">Observation mode</div>
              <div className="text-[11px] text-gray-500">Preview changes; perform no sync writes.</div>
            </div>
            <Switch checked={config.observation_mode} onCheckedChange={(checked) => setConfig((c) => ({ ...c, observation_mode: checked }))} />
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
      />

      <IntegrationCard
        title="Order Form ↔ Order Request"
        subtitle="Order records will map to the Smartsheet Order Request sheet, including controlled customer/work-order relationship setup."
        value={config.orders}
        onChange={(next) => setProfile("orders", next)}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <MappingPlan title="Sales Pipeline mapping blueprint" rows={SMARTSHEET_MAPPING_BLUEPRINTS.sales} />
        <MappingPlan title="Order Form mapping blueprint" rows={SMARTSHEET_MAPPING_BLUEPRINTS.orders} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Client resolution policy</h3>
            <p className="mt-1 text-xs text-gray-500">Recommendations only in the current build. No Customer is linked, renamed, or created automatically.</p>
          </div>
          <Badge variant="outline">Review first</Badge>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {SMARTSHEET_CUSTOMER_RESOLUTION_POLICY.map((rule) => (
            <div key={rule.key} className="rounded-lg border bg-white p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-gray-800">{rule.label}</div>
                <Badge variant="outline" className="shrink-0">{rule.outcome}</Badge>
              </div>
              <div className="mt-1 text-gray-500">{rule.behavior}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          Once you confirm that differently named records are the same company, the approved Smartsheet name can be preserved in the existing Base44 <code className="font-mono">legacy_client_names</code> alias list. That translates future rows without forcing either system to rename the customer.
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Client resolution policy</h3>
            <p className="mt-1 text-xs text-gray-500">Recommendations only in the current build. No Customer is linked, renamed, or created automatically.</p>
          </div>
          <Badge variant="outline">Review first</Badge>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {SMARTSHEET_CUSTOMER_RESOLUTION_POLICY.map((rule) => (
            <div key={rule.key} className="rounded-lg border bg-white p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-gray-800">{rule.label}</div>
                <Badge variant="outline" className="shrink-0">{rule.outcome}</Badge>
              </div>
              <div className="mt-1 text-gray-500">{rule.behavior}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          Once you confirm that differently named records are the same company, the approved Smartsheet name can be preserved in the existing Base44 <code className="font-mono">legacy_client_names</code> alias list. That translates future rows without forcing either system to rename the customer.
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Safety rules locked into the design</div>
        <div className="mt-2 text-xs leading-relaxed">
          Smartsheet never deletes Base44 records. Base44-only records may remain unmirrored. New external rows must resolve/create the correct Base44 Customer and relationships. Ambiguous matches stop for review. Sorting or rearranging rows/columns never changes identity.
        </div>
      </div>
    </div>
  );
}
