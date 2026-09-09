import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertTriangle, CheckCircle, Bot, Clock, RefreshCw, Trash2, Eye } from "lucide-react";
import { format } from "date-fns";
import { deleteEntityIfUnchanged, expectedEntityFields, replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

const SEVERITY_COLORS = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-blue-100 text-blue-800 border-blue-200"
};

export default function JurisdictionAccuracyAudit() {
  const [settings, setSettings] = useState({
    enabled: false,
    frequency: "weekly",
    batchSize: 5,
    checkUrls: true,
    checkRequirements: true,
    checkContact: true
  });
  const [auditAlerts, setAuditAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastRunResult, setLastRunResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [alertActionError, setAlertActionError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load saved settings
      const stored = await base44.entities.GlobalSettings.filter({ setting_key: 'jurisdiction_accuracy_audit' });
      if (stored && stored.length > 0) {
        setSettings(prev => ({ ...prev, ...stored[0].setting_value }));
      }

      // Load audit alerts (flagged by accuracy audit)
      const alerts = await base44.entities.RegulationAlert.list('-detected_at', 50);
      const auditOnly = Array.isArray(alerts) ? alerts.filter(a => a.title?.includes('[Accuracy Audit]')) : [];
      setAuditAlerts(auditOnly);
    } catch (e) {
      console.error("Load error:", e);
    }
    setLoading(false);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const existing = await base44.entities.GlobalSettings.filter({ setting_key: 'jurisdiction_accuracy_audit' });
      if (existing && existing.length > 0) {
        await base44.entities.GlobalSettings.update(existing[0].id, { setting_value: settings });
      } else {
        await base44.entities.GlobalSettings.create({ setting_key: 'jurisdiction_accuracy_audit', setting_value: settings });
      }
    } catch (e) {
      console.error("Save error:", e);
    }
    setSaving(false);
  };

  const handleRunNow = async () => {
    setRunning(true);
    setLastRunResult(null);
    try {
      const res = await base44.functions.invoke('auditJurisdictionAccuracy', {
        batchSize: settings.batchSize,
        auditOptions: {
          checkUrls: settings.checkUrls,
          checkRequirements: settings.checkRequirements,
          checkContact: settings.checkContact
        }
      });

      const data = res?.data || res;
      setLastRunResult({
        success: data?.success !== false,
        audited: data?.audited || 0,
        flagged: data?.flagged || 0,
        ran_at: new Date()
      });
      await loadData();
    } catch (e) {
      setLastRunResult({ success: false, error: e.message, ran_at: new Date() });
    }
    setRunning(false);
  };

  const handleMarkRead = async (alertId) => {
    const loaded = auditAlerts.find((alert) => alert.id === alertId);
    if (!loaded?.id) {
      setAlertActionError("This alert is no longer loaded. Reload the audit before changing it.");
      return;
    }

    const nextFields = { is_read: true, read_at: new Date().toISOString() };
    setAlertActionError("");
    try {
      await replaceEntityFieldsIfUnchanged({
        entity: base44.entities.RegulationAlert,
        id: loaded.id,
        expectedFields: expectedEntityFields(loaded, nextFields),
        nextFields,
        guardFields: { jurisdiction_id: loaded.jurisdiction_id },
        label: `Regulation Alert ${loaded.title || loaded.id} mark read`,
      });
      setAuditAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (e) {
      console.error("Mark read error:", e);
      setAlertActionError(e?.message || "This alert changed in another session. The latest alerts were reloaded.");
      await loadData();
    }
  };

  const handleDeleteAlert = async (alertId) => {
    const loaded = auditAlerts.find((alert) => alert.id === alertId);
    if (!loaded?.id) {
      setAlertActionError("This alert is no longer loaded. Reload the audit before deleting it.");
      return;
    }

    setAlertActionError("");
    try {
      await deleteEntityIfUnchanged({
        entity: base44.entities.RegulationAlert,
        record: loaded,
        guardFields: { jurisdiction_id: loaded.jurisdiction_id },
        label: `Regulation Alert ${loaded.title || loaded.id} deletion`,
      });
      setAuditAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (e) {
      console.error("Delete error:", e);
      setAlertActionError(e?.message || "This alert changed in another session and was not deleted. The latest alerts were reloaded.");
      await loadData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const unreadCount = auditAlerts.filter(a => !a.is_read).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
          <Bot className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-lg">AI Accuracy Auditor</h3>
          <p className="text-sm text-gray-500">Periodically cross-references jurisdiction data with official government sources</p>
        </div>
        {unreadCount > 0 && (
          <Badge className="ml-auto bg-red-100 text-red-800 border-red-200">{unreadCount} new flag{unreadCount !== 1 ? 's' : ''}</Badge>
        )}
      </div>

      {alertActionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">Regulation Alert action blocked</div>
            <div className="mt-1 text-xs">{alertActionError}</div>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0 border-red-300 bg-white text-red-800" onClick={() => setAlertActionError("")}>Dismiss</Button>
        </div>
      )}

      {/* Settings Panel */}
      <div className="p-5 bg-amber-50 rounded-xl border border-amber-200 space-y-5">
        <h4 className="font-semibold text-gray-800">Audit Settings</h4>

        {/* Enable */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="font-medium text-gray-800">Enable Scheduled Audits</Label>
            <p className="text-xs text-gray-500 mt-0.5">AI will automatically flag potential inaccuracies</p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(v) => setSettings(prev => ({ ...prev, enabled: v }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm text-gray-700 mb-1 block">Run Frequency</Label>
            <Select value={settings.frequency} onValueChange={(v) => setSettings(prev => ({ ...prev, frequency: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm text-gray-700 mb-1 block">Jurisdictions per Run</Label>
            <Select value={String(settings.batchSize)} onValueChange={(v) => setSettings(prev => ({ ...prev, batchSize: parseInt(v) }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 (fastest)</SelectItem>
                <SelectItem value="5">5 (default)</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Check Options */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">What to Audit</p>
          <div className="space-y-2">
            {[
              { key: 'checkUrls', label: 'Website & Permitting URLs', desc: 'Verify links are still valid and correct' },
              { key: 'checkRequirements', label: 'Permit Requirements', desc: 'Cross-check height, area, fee limits with official sources' },
              { key: 'checkContact', label: 'Contact Information', desc: 'Verify department name, phone, and email' }
            ].map(item => (
              <label key={item.key} className="flex items-start gap-3 cursor-pointer p-2 hover:bg-amber-100 rounded-lg">
                <Checkbox
                  checked={settings[item.key]}
                  onCheckedChange={(v) => setSettings(prev => ({ ...prev, [item.key]: v }))}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t border-amber-200">
          <Button
            onClick={handleSaveSettings}
            disabled={saving}
            className="bg-amber-600 hover:bg-amber-700 gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Save Settings
          </Button>
          <Button
            onClick={handleRunNow}
            disabled={running}
            variant="outline"
            className="gap-2 border-amber-300 hover:bg-amber-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {running ? 'Auditing...' : 'Run Audit Now'}
          </Button>
        </div>
      </div>

      {/* Last Run Result */}
      {lastRunResult && (
        <div className={`p-4 rounded-lg border flex items-start gap-3 ${lastRunResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          {lastRunResult.success
            ? <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            : <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          }
          <div>
            <p className={`text-sm font-medium ${lastRunResult.success ? 'text-green-800' : 'text-red-800'}`}>
              {lastRunResult.success
                ? `Audit complete — ${lastRunResult.audited} jurisdiction${lastRunResult.audited !== 1 ? 's' : ''} reviewed, ${lastRunResult.flagged} issue${lastRunResult.flagged !== 1 ? 's' : ''} flagged`
                : 'Audit failed'}
            </p>
            {lastRunResult.error && <p className="text-xs text-red-700 mt-1">{lastRunResult.error}</p>}
            <p className="text-xs text-gray-500 mt-1">{format(lastRunResult.ran_at, 'MMM dd h:mm a')}</p>
          </div>
        </div>
      )}

      {/* Flagged Issues */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Flagged Issues ({auditAlerts.length})
          </h4>
          {auditAlerts.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={async () => {
                for (const a of auditAlerts) await handleMarkRead(a.id);
              }}
            >
              Mark All Read
            </Button>
          )}
        </div>

        {auditAlerts.length === 0 ? (
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
            <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No accuracy issues flagged yet.</p>
            <p className="text-xs text-gray-400 mt-1">Run an audit to cross-check your data against official sources.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {auditAlerts.map(alert => (
              <div key={alert.id} className={`p-4 rounded-lg border ${!alert.is_read ? 'bg-white border-amber-200' : 'bg-gray-50 border-gray-200 opacity-70'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge className={`text-xs ${SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.medium}`}>
                        {alert.severity}
                      </Badge>
                      <span className="text-xs font-semibold text-gray-700">{alert.jurisdiction_name}, {alert.jurisdiction_state}</span>
                      {!alert.is_read && <span className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0" />}
                    </div>
                    <p className="text-sm font-medium text-gray-900">{alert.title?.replace('[Accuracy Audit] ', '')}</p>
                    <p className="text-xs text-gray-600 mt-1">{alert.description}</p>

                    {(alert.previous_value || alert.new_value) && (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        {alert.previous_value && (
                          <div className="p-2 bg-red-50 rounded border border-red-100">
                            <p className="font-semibold text-red-700 mb-0.5">Stored</p>
                            <p className="text-gray-700">{alert.previous_value}</p>
                          </div>
                        )}
                        {alert.new_value && (
                          <div className="p-2 bg-green-50 rounded border border-green-100">
                            <p className="font-semibold text-green-700 mb-0.5">Suggested</p>
                            <p className="text-gray-700">{alert.new_value}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {alert.impact_summary && (
                      <p className="text-xs text-amber-700 mt-2 italic">⚠ {alert.impact_summary}</p>
                    )}

                    <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {alert.detected_at ? format(new Date(alert.detected_at), 'MMM dd, yyyy h:mm a') : ''}
                    </p>
                  </div>

                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {!alert.is_read && (
                      <Button size="icon" variant="outline" className="h-7 w-7" title="Mark as reviewed" onClick={() => handleMarkRead(alert.id)}>
                        <Eye className="w-3 h-3" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" title="Delete" onClick={() => handleDeleteAlert(alert.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}