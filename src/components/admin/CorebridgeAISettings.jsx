import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Bot,
  Mail,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  FileText,
  ArrowRight,
  Zap,
  Save,
  Search,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Clock,
  SkipForward,
  XCircle
} from "lucide-react";
import { processCorebridgeEmails } from "@/functions/processCorebridgeEmails";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/shared/globalSettingsPersistence";

const GlobalSettings = base44.entities.GlobalSettings;
const CorebridgeLog = base44.entities.CorebridgeLog;

const STAGES = [
  { value: "estimating", label: "Estimating" },
  { value: "sales", label: "Sales" },
  { value: "permitting", label: "Permitting" },
  { value: "design", label: "Design" },
  { value: "production", label: "Production" },
  { value: "fabrication", label: "Fabrication" },
  { value: "installation", label: "Installation" },
  { value: "completed", label: "Completed" },
];

const SALES_STATUSES = [
  { value: "lead", label: "Lead" },
  { value: "quoted", label: "Quoted" },
  { value: "follow_up", label: "Follow Up" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "on_hold", label: "On Hold" },
];

const DEFAULTS = {
  enabled: true,
  gmail_query: 'subject:"Your Sign Estimate" OR subject:"Your Sign Invoice" is:unread',
  estimate_subject_pattern: "EST",
  invoice_subject_pattern: "INV",
  max_emails_per_run: 20,
  estimate_stage: "sales",
  estimate_sales_status: "quoted",
  invoice_stage: "production",
  invoice_sales_status: "won",
  est_to_inv_stage: "production",
  est_to_inv_sales_status: "won",
  ai_prompt_extra: "",
  title_format: "description", // "description" or "client_docnum"
};

export default function CorebridgeAISettings() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [settingRecord, setSettingRecord] = useState(null);
  const [settingsError, setSettingsError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [expandedLog, setExpandedLog] = useState(null);

  useEffect(() => {
    loadSettings();
    loadLogs();
  }, []);

  const loadSettings = async () => {
    try {
      const record = await loadSingleGlobalSetting({
        entity: GlobalSettings,
        settingKey: "corebridgeAI",
        label: "CoreBridge AI settings",
      });
      setSettingRecord(record);
      setSettings({ ...DEFAULTS, ...(record?.setting_value || {}) });
    } catch (err) {
      console.error("Error loading settings:", err);
      setSettingsError(err?.message || "CoreBridge AI settings could not be loaded safely.");
    }
  };

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSettingsError("");
    try {
      const saved = await saveGlobalSettingValueIfUnchanged({
        entity: GlobalSettings,
        loadedRecord: settingRecord,
        settingKey: "corebridgeAI",
        nextValue: settings,
        label: "CoreBridge AI settings",
      });
      setSettingRecord(saved);
      setSettings({ ...DEFAULTS, ...(saved?.setting_value || settings) });
      setIsDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("CoreBridge AI settings save blocked:", err);
      setSettingsError(err?.message || "CoreBridge AI settings changed in another session. Reload before saving.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULTS);
    setIsDirty(true);
    setSaveSuccess(false);
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const data = await CorebridgeLog.list('-run_at', 50);
      setLogs(data);
    } catch (err) {
      console.error("Error loading logs:", err);
    }
    setLogsLoading(false);
  };

  const handleTestRun = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await processCorebridgeEmails({ manual: true });
      setTestResult({ success: true, data: res.data });
      // Reload logs after run
      setTimeout(() => loadLogs(), 1500);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
      setTimeout(() => loadLogs(), 1500);
    }
    setIsTesting(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="clay-card p-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
            <Bot className="w-6 h-6 text-purple-700" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">CoreBridge AI Email Importer</h2>
            <p className="text-xs text-gray-500">Automatically imports estimates & invoices from CoreBridge emails</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={settings.enabled}
            onCheckedChange={(v) => update("enabled", v)}
          />
          <Badge className={settings.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
            {settings.enabled ? "Active" : "Disabled"}
          </Badge>
        </div>
      </div>

      {settingsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">CoreBridge AI settings update blocked</div>
            <div className="mt-1 text-xs">{settingsError}</div>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0 border-red-300 bg-white text-red-800" onClick={async () => { setSettingsError(""); await loadSettings(); }}>Reload latest</Button>
        </div>
      )}

      {/* Gmail Query Settings */}
      <div className="clay-card p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-500" />
          Gmail Search Settings
        </h3>

        <div>
          <Label className="text-sm font-medium">Gmail Search Query</Label>
          <p className="text-xs text-gray-400 mb-1">The query used to find CoreBridge emails in Gmail</p>
          <Textarea
            value={settings.gmail_query}
            onChange={(e) => update("gmail_query", e.target.value)}
            className="font-mono text-xs"
            rows={2}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-sm font-medium">Estimate Subject Pattern</Label>
            <p className="text-xs text-gray-400 mb-1">Text to identify estimate emails (e.g. EST)</p>
            <Input
              value={settings.estimate_subject_pattern}
              onChange={(e) => update("estimate_subject_pattern", e.target.value)}
              placeholder="EST"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Invoice Subject Pattern</Label>
            <p className="text-xs text-gray-400 mb-1">Text to identify invoice emails (e.g. INV)</p>
            <Input
              value={settings.invoice_subject_pattern}
              onChange={(e) => update("invoice_subject_pattern", e.target.value)}
              placeholder="INV"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Max Emails Per Run</Label>
            <p className="text-xs text-gray-400 mb-1">Max emails to process each time (1–50)</p>
            <Input
              type="number"
              min={1}
              max={50}
              value={settings.max_emails_per_run}
              onChange={(e) => update("max_emails_per_run", parseInt(e.target.value) || 20)}
            />
          </div>
        </div>
      </div>

      {/* Stage Routing */}
      <div className="clay-card p-5 space-y-5">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-purple-500" />
          Stage & Status Routing
        </h3>

        {/* New Estimate */}
        <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/50 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span className="font-medium text-sm text-blue-800">New Estimate (EST-XXXXX)</span>
            <Badge className="bg-blue-100 text-blue-700 text-xs">First time seen</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600">Create in Stage</Label>
              <Select value={settings.estimate_stage} onValueChange={(v) => update("estimate_stage", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600">Sales Status</Label>
              <Select value={settings.estimate_sales_status} onValueChange={(v) => update("estimate_sales_status", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SALES_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* New Invoice */}
        <div className="p-4 rounded-xl border border-orange-100 bg-orange-50/50 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-orange-600" />
            <span className="font-medium text-sm text-orange-800">New Invoice (INV-XXXXX)</span>
            <Badge className="bg-orange-100 text-orange-700 text-xs">Never seen before</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600">Create in Stage</Label>
              <Select value={settings.invoice_stage} onValueChange={(v) => update("invoice_stage", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600">Sales Status</Label>
              <Select value={settings.invoice_sales_status} onValueChange={(v) => update("invoice_sales_status", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SALES_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* EST → INV Conversion */}
        <div className="p-4 rounded-xl border border-green-100 bg-green-50/50 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-green-600" />
            <span className="font-medium text-sm text-green-800">Estimate → Invoice Conversion</span>
            <Badge className="bg-green-100 text-green-700 text-xs">EST exists → INV arrives</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600">Move to Stage</Label>
              <Select value={settings.est_to_inv_stage} onValueChange={(v) => update("est_to_inv_stage", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600">Sales Status</Label>
              <Select value={settings.est_to_inv_sales_status} onValueChange={(v) => update("est_to_inv_sales_status", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SALES_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Work Order Title Format */}
      <div className="clay-card p-5 space-y-3">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          Work Order Title Format
        </h3>
        <p className="text-xs text-gray-500">How should new work orders be named?</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => update("title_format", "description")}
            className={`p-3 rounded-xl border-2 text-left transition-all ${settings.title_format === "description" ? "border-purple-400 bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}
          >
            <div className="font-medium text-sm text-gray-800">Use Description</div>
            <div className="text-xs text-gray-500 mt-1">e.g. "Main St Channel Letters"</div>
          </button>
          <button
            onClick={() => update("title_format", "client_docnum")}
            className={`p-3 rounded-xl border-2 text-left transition-all ${settings.title_format === "client_docnum" ? "border-purple-400 bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}
          >
            <div className="font-medium text-sm text-gray-800">Client + Doc Number</div>
            <div className="text-xs text-gray-500 mt-1">e.g. "Acme Corp - EST-12345"</div>
          </button>
        </div>
      </div>

      {/* AI Prompt Extra Instructions */}
      <div className="clay-card p-5 space-y-3">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Bot className="w-4 h-4 text-purple-500" />
          Extra AI Instructions
        </h3>
        <p className="text-xs text-gray-500">Optional additional instructions appended to the AI extraction prompt. Use this to customize how data is extracted.</p>
        <Textarea
          value={settings.ai_prompt_extra}
          onChange={(e) => update("ai_prompt_extra", e.target.value)}
          placeholder="e.g. If the description mentions 'channel letters', set the product to 'Channel Letters'. Always extract the PO number if present..."
          rows={3}
          className="text-sm"
        />
      </div>

      {/* Save Bar */}
      <div className="clay-card p-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={handleReset} className="text-gray-500 gap-2">
          <RotateCcw className="w-3.5 h-3.5" />
          Reset to Defaults
        </Button>
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <div className="flex items-center gap-1.5 text-green-600 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              Saved!
            </div>
          )}
          <Button
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </Button>
        </div>
      </div>

      {/* Manual Trigger */}
      <div className="clay-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-semibold text-sm text-gray-800">Manual Trigger</h4>
            <p className="text-xs text-gray-500 mt-0.5">Run the importer now to check for unread CoreBridge emails</p>
          </div>
          <Button
            onClick={handleTestRun}
            disabled={isTesting}
            variant="outline"
            className="gap-2"
          >
            {isTesting ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Running...</>
            ) : (
              <><RefreshCw className="w-4 h-4" />Run Now</>
            )}
          </Button>
        </div>

        {testResult && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            {testResult.success ? (
              <div>
                <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Completed — {testResult.data?.processed ?? 0} email(s) processed
                </div>
                {testResult.data?.results?.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {testResult.data.results.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                        {r.action === 'created' && <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Created</span>}
                        {r.action === 'updated' && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Updated</span>}
                        {r.action === 'error' && <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Error</span>}
                        <span>{r.docNumber} — {r.client || r.error}</span>
                        {r.estToInv && <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">→ WIP</span>}
                      </div>
                    ))}
                  </div>
                )}
                {testResult.data?.processed === 0 && (
                  <p className="text-xs text-gray-500">No new unread CoreBridge emails found.</p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-4 h-4" />
                Error: {testResult.error}
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 text-blue-700 text-xs p-2 bg-blue-50 rounded-lg">
          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Runs automatically every <strong>10 minutes</strong> via the "Process CoreBridge Emails" scheduled automation.</span>
        </div>
      </div>

      {/* Activity Log */}
      <div className="clay-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            Run History
          </h3>
          <Button variant="ghost" size="sm" onClick={loadLogs} disabled={logsLoading} className="gap-1 text-xs">
            {logsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </Button>
        </div>

        {logsLoading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No runs recorded yet. Click "Run Now" to start.</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const isExpanded = expandedLog === log.id;
              const statusColor = {
                success: 'bg-green-50 border-green-200',
                partial: 'bg-yellow-50 border-yellow-200',
                error: 'bg-red-50 border-red-200',
                no_emails: 'bg-gray-50 border-gray-200',
              }[log.status] || 'bg-gray-50 border-gray-200';

              const statusIcon = {
                success: <CheckCircle2 className="w-4 h-4 text-green-600" />,
                partial: <AlertTriangle className="w-4 h-4 text-yellow-600" />,
                error: <XCircle className="w-4 h-4 text-red-600" />,
                no_emails: <SkipForward className="w-4 h-4 text-gray-400" />,
              }[log.status];

              const runDate = log.run_at ? new Date(log.run_at) : new Date(log.created_date);

              return (
                <div key={log.id} className={`rounded-xl border ${statusColor} overflow-hidden`}>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 transition-colors"
                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                  >
                    {statusIcon}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800">
                          {runDate.toLocaleString()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          log.trigger === 'manual' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {log.trigger === 'manual' ? 'Manual' : 'Scheduled'}
                        </span>
                        {log.status === 'no_emails' && <span className="text-xs text-gray-500">No emails found</span>}
                        {log.status !== 'no_emails' && (
                          <span className="text-xs text-gray-600">
                            {log.emails_found ?? 0} found · {log.processed ?? 0} processed
                          </span>
                        )}
                        {log.error_message && (
                          <span className="text-xs text-red-600 truncate max-w-xs">{log.error_message}</span>
                        )}
                      </div>
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-2 border-t border-current border-opacity-10">
                      {log.debug_info && (
                        <p className="text-xs text-gray-500 font-mono bg-white/60 rounded p-2 mt-2">{log.debug_info}</p>
                      )}
                      {log.results?.length > 0 ? (
                        <div className="space-y-1 mt-2">
                          {log.results.map((r, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-gray-700 bg-white/60 rounded p-2">
                              <span className={`px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${
                                r.action === 'created' ? 'bg-green-100 text-green-700' :
                                r.action === 'updated' ? 'bg-blue-100 text-blue-700' :
                                r.action === 'skipped' ? 'bg-gray-100 text-gray-600' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {r.action?.toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <div className="font-medium">{r.docNumber || r.messageId || '—'}{r.client ? ` — ${r.client}` : ''}</div>
                                {r.subject && <div className="text-gray-400 truncate">Subject: {r.subject}</div>}
                                {r.stage && <div className="text-gray-500">Stage: {r.stage}</div>}
                                {r.estToInv && <div className="text-orange-600 font-medium">→ Moved to WIP</div>}
                                {r.skipped_reason && <div className="text-yellow-600">{r.skipped_reason}</div>}
                                {r.error && <div className="text-red-600">{r.error}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 mt-2 italic">No per-email results recorded.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}