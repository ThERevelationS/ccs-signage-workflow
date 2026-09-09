import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, RefreshCw, Loader2, Plus, X, Mail } from "lucide-react";
import { format } from "date-fns";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/permitting/permitGlobalSettingsPersistence";

export default function JurisdictionMonitoringSettings() {
  const [automations, setAutomations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [monitoringSettings, setMonitoringSettings] = useState({
    enabled: true,
    run_time: "09:00",
    frequency: "daily",
    notification_emails: []
  });
  const [newEmail, setNewEmail] = useState("");
  const [lastRunInfo, setLastRunInfo] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [monitoringSettingRecord, setMonitoringSettingRecord] = useState(null);
  const [settingsSaveError, setSettingsSaveError] = useState("");

  useEffect(() => {
    loadAutomations();
    loadSettings();
    loadAlerts();
  }, []);

  const loadAutomations = async () => {
    try {
      const allAutomations = await base44.entities.AutomationRule?.list?.() || [];
      const monitoringAuto = Array.isArray(allAutomations) ? allAutomations.filter(a => a.function_name === 'monitorJurisdictionChanges') : [];
      setAutomations(monitoringAuto);
      setIsLoading(false);
    } catch (e) {
      console.error("Load automations error:", e);
      setIsLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const saved = await loadSingleGlobalSetting({
        entity: base44.entities.GlobalSettings,
        settingKey: 'jurisdiction_monitoring',
        label: 'Jurisdiction Monitoring settings',
      });
      setMonitoringSettingRecord(saved);
      if (saved?.id) setMonitoringSettings(current => ({ ...current, ...(saved.setting_value || {}) }));
      setSettingsSaveError("");
    } catch (e) {
      console.error("Load settings error:", e);
      setSettingsSaveError(e?.message || "Jurisdiction Monitoring settings could not be loaded safely.");
    }
  };

  const loadAlerts = async () => {
    try {
      const recentAlerts = await base44.entities.RegulationAlert?.list?.("-detected_at", 5) || [];
      setAlerts(Array.isArray(recentAlerts) ? recentAlerts : []);
    } catch (e) {
      console.error("Load alerts error:", e);
    }
  };

  const handleSaveSettings = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSettingsSaveError("");
    try {
      const saved = await saveGlobalSettingValueIfUnchanged({
        entity: base44.entities.GlobalSettings,
        loadedRecord: monitoringSettingRecord,
        settingKey: 'jurisdiction_monitoring',
        nextValue: monitoringSettings,
        label: 'Jurisdiction Monitoring settings',
      });
      setMonitoringSettingRecord(saved);

      // Update automation schedule
      if (automations.length > 0) {
        const automation = automations[0];
        void automation;
        // Note: Would need to call a function to update the automation schedule
        console.log("Automation schedule would be updated via admin API");
      }
    } catch (e) {
      console.error("Save settings error:", e);
      setSettingsSaveError(e?.message || "Jurisdiction Monitoring settings changed in another session. Reload before retrying.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunNow = async () => {
    try {
      const res = await base44.functions.invoke('monitorJurisdictionChanges', {});
      if (res.data) {
        setLastRunInfo({
          ran_at: new Date(),
          alerts_created: res.data.alerts_created || 0,
          success: res.data.success
        });
        await loadAlerts();
      }
    } catch (e) {
      console.error("Run monitoring error:", e);
      setLastRunInfo({
        ran_at: new Date(),
        error: e.message
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Settings Card */}
      <div className="clay-card border-l-4 border-l-blue-400 p-6 space-y-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Jurisdiction Regulation Monitoring</h3>
          <p className="text-sm text-gray-600">
            Automatically monitor all jurisdictions for regulation changes and alert users to significant updates.
          </p>
        </div>

        {settingsSaveError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">Monitoring settings update blocked</div>
              <div className="mt-1 text-xs">{settingsSaveError}</div>
            </div>
            <Button type="button" size="sm" variant="outline" className="shrink-0 border-red-300 bg-white text-red-800" onClick={() => setSettingsSaveError("")}>Dismiss</Button>
          </div>
        )}

        {/* Enable/Disable */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div>
            <Label className="font-semibold text-gray-800">Enable Monitoring</Label>
            <p className="text-xs text-gray-500 mt-1">Turn monitoring on or off</p>
          </div>
          <Switch
            checked={monitoringSettings.enabled}
            onCheckedChange={(checked) => setMonitoringSettings({ ...monitoringSettings, enabled: checked })}
          />
        </div>

        {/* Schedule Settings */}
        {monitoringSettings.enabled && (
          <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-gray-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              Schedule Settings
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-gray-700">Run Time (24-hour format)</Label>
                <Input
                  type="time"
                  value={monitoringSettings.run_time}
                  onChange={(e) => setMonitoringSettings({ ...monitoringSettings, run_time: e.target.value })}
                  className="mt-2"
                />
                <p className="text-xs text-gray-500 mt-1">Daily monitoring runs at this time (Eastern Time)</p>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">Frequency</Label>
                <Select value={monitoringSettings.frequency} onValueChange={(val) => setMonitoringSettings({ ...monitoringSettings, frequency: val })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="every_other_day">Every Other Day</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-3 bg-blue-100 rounded border border-blue-300 text-xs text-blue-800">
              <p className="font-medium mb-1">Next scheduled run:</p>
              <p>Scheduled to run daily at {monitoringSettings.run_time} ET</p>
            </div>
          </div>
        )}

        {/* Notification Emails */}
        <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-800 flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-600" />
            Notification Recipients
          </h4>
          <p className="text-xs text-gray-500">These email addresses will receive alerts when regulation changes are detected.</p>

          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Add email address..."
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newEmail.trim()) {
                  const emails = monitoringSettings.notification_emails || [];
                  if (!emails.includes(newEmail.trim())) {
                    setMonitoringSettings({ ...monitoringSettings, notification_emails: [...emails, newEmail.trim()] });
                  }
                  setNewEmail("");
                }
              }}
              className="flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (newEmail.trim()) {
                  const emails = monitoringSettings.notification_emails || [];
                  if (!emails.includes(newEmail.trim())) {
                    setMonitoringSettings({ ...monitoringSettings, notification_emails: [...emails, newEmail.trim()] });
                  }
                  setNewEmail("");
                }
              }}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(monitoringSettings.notification_emails || []).map(email => (
              <div key={email} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                <span>{email}</span>
                <button
                  onClick={() => setMonitoringSettings({
                    ...monitoringSettings,
                    notification_emails: monitoringSettings.notification_emails.filter(e => e !== email)
                  })}
                  className="hover:text-red-600 ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {(monitoringSettings.notification_emails || []).length === 0 && (
              <p className="text-xs text-gray-400 italic">No recipients added. Only the triggering user will be notified.</p>
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="clay-card p-6">
        <h3 className="font-bold text-gray-900 mb-4">Quick Actions</h3>
        <div className="space-y-3">
          <Button
            onClick={handleRunNow}
            className="w-full bg-green-600 hover:bg-green-700 gap-2 justify-center"
          >
            <RefreshCw className="w-4 h-4" />
            Run Monitoring Now
          </Button>
          <p className="text-xs text-gray-500 text-center">
            Immediately scan all jurisdictions for regulation changes
          </p>
        </div>

        {lastRunInfo && (
          <div className={`mt-4 p-3 rounded border ${lastRunInfo.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <p className={`text-sm font-medium ${lastRunInfo.error ? 'text-red-800' : 'text-green-800'}`}>
              {lastRunInfo.error ? '❌ Error' : '✓ Monitoring Completed'}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {lastRunInfo.ran_at ? format(lastRunInfo.ran_at, 'MMM dd, yyyy h:mm a') : ''}
            </p>
            {lastRunInfo.alerts_created !== undefined && (
              <p className={`text-xs mt-1 ${lastRunInfo.error ? 'text-red-700' : 'text-green-700'}`}>
                {lastRunInfo.alerts_created} new alert{lastRunInfo.alerts_created !== 1 ? 's' : ''} created
              </p>
            )}
            {lastRunInfo.error && (
              <p className="text-xs text-red-700 mt-1">{lastRunInfo.error}</p>
            )}
          </div>
        )}
      </div>

      {/* Automation Status */}
      <div className="clay-card p-6">
        <h3 className="font-bold text-gray-900 mb-4">Automation Status</h3>
        {automations.length > 0 ? (
          <div className="space-y-3">
            {automations.map(auto => (
              <div key={auto.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                <div className="flex-1">
                  <p className="font-medium text-gray-800">{auto.name}</p>
                  <p className="text-xs text-gray-500">Function: {auto.function_name}</p>
                </div>
                <Badge className={auto.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                  {auto.enabled ? '✓ Active' : 'Disabled'}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-yellow-50 rounded border border-yellow-200 flex gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">No automation found</p>
              <p className="text-xs mt-1">The daily monitoring automation hasn't been created yet. It will be created automatically when enabled.</p>
            </div>
          </div>
        )}
      </div>

      {/* Recent Alerts */}
      <div className="clay-card p-6">
        <h3 className="font-bold text-gray-900 mb-4">Recent Alerts</h3>
        {alerts.length > 0 ? (
          <div className="space-y-2">
            {alerts.map(alert => (
              <div key={alert.id} className="p-3 bg-gray-50 rounded border border-gray-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 text-sm">{alert.title}</p>
                    <p className="text-xs text-gray-600 mt-1">{alert.jurisdiction_name}, {alert.jurisdiction_state}</p>
                  </div>
                  <Badge className={
                    alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                    alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                    alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }>
                    {alert.severity}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {format(new Date(alert.detected_at), 'MMM dd, yyyy h:mm a')}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-blue-50 rounded border border-blue-200 text-sm text-blue-800">
            No recent alerts. Regulations are stable.
          </div>
        )}
      </div>
    </div>
  );
}