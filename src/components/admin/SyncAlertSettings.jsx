import React, { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Bell, Check, Loader2, Mail, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function SyncAlertSettings() {
  const [config, setConfig] = useState({ enabled: false, recipient_email: "brettheinlein1@gmail.com" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("smartsheetSyncAction", { action: "sync_alert_get" });
      if (res?.config) setConfig(res.config);
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await base44.functions.invoke("smartsheetSyncAction", {
        action: "sync_alert_save",
        enabled: config.enabled,
        recipient_email: config.recipient_email,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await base44.functions.invoke("smartsheetSyncAction", { action: "sync_alert_test" });
      setTestResult({ success: true, recipient: res?.recipient });
    } catch (err) {
      setTestResult({ success: false, error: err?.message || "Failed to send test email" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="clay-card p-5 flex items-center gap-2 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading alert settings…
      </div>
    );
  }

  return (
    <div className="clay-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-600" />
            Sync Error Email Alerts
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Automatically email a recipient when a Smartsheet sync run fails, times out, gets stuck, or leaves open conflicts.
          </p>
        </div>
        <Badge className={config.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}>
          {config.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <div>
          <Label htmlFor="alert-enabled" className="text-sm font-medium text-gray-800">Enable email alerts</Label>
          <p className="text-xs text-gray-500 mt-0.5">Triggers on: failed runs, timed-out runs, stuck/stale runs, and runs with open conflicts.</p>
        </div>
        <Switch
          id="alert-enabled"
          checked={config.enabled}
          onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="alert-recipient" className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-gray-500" /> Recipient email
        </Label>
        <Input
          id="alert-recipient"
          type="email"
          value={config.recipient_email || ""}
          onChange={(e) => setConfig((c) => ({ ...c, recipient_email: e.target.value }))}
          placeholder="alerts@example.com"
          className="max-w-md"
        />
        <p className="text-xs text-gray-400">The email address that receives sync failure notifications.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : saved ? <Check className="h-4 w-4 mr-2" /> : null}
          {saved ? "Saved" : "Save Alert Settings"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={sendTest} disabled={testing || !config.enabled}>
          {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Send Test Email
        </Button>
        {testResult?.success && (
          <span className="text-xs text-green-700">Test email sent to {testResult.recipient} (captured in test mode).</span>
        )}
        {testResult?.success === false && (
          <span className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{testResult.error}</span>
        )}
      </div>
    </div>
  );
}