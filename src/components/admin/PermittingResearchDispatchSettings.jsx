import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle, Coins, Loader2, Play, Save, ShieldAlert } from "lucide-react";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/shared/globalSettingsPersistence";

const CONFIG_KEY = "permitting_research_dispatch_config";
const STATE_KEY = "permitting_research_dispatch_state";
const DEFAULTS = {
  enabled: true,
  interval_minutes: 15,
  max_dispatch_per_cycle: 5,
  max_in_flight: 20,
  daily_dispatch_limit: 40,
  retry_limit: 3,
};

const clampInt = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

export default function PermittingResearchDispatchSettings() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loadedRecord, setLoadedRecord] = useState(null);
  const [stateInfo, setStateInfo] = useState(null);
  const [queueCounts, setQueueCounts] = useState({ backlog: null, sourceDiscovery: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [configRecord, stateRecord, backlog, sourceDiscovery] = await Promise.all([
        loadSingleGlobalSetting({ entity: base44.entities.GlobalSettings, settingKey: CONFIG_KEY, label: "Permitting research dispatch settings" }),
        loadSingleGlobalSetting({ entity: base44.entities.GlobalSettings, settingKey: STATE_KEY, label: "Permitting research dispatch state" }),
        base44.entities.SourceCollectionQueue.count({ state: { $in: ["OH", "KY"] }, status: "not_started" }),
        base44.entities.SourceCollectionQueue.count({ state: { $in: ["OH", "KY"] }, status: "source_discovery" }),
      ]);
      setLoadedRecord(configRecord);
      setSettings({ ...DEFAULTS, ...(configRecord?.setting_value || {}) });
      setStateInfo(stateRecord?.setting_value || null);
      setQueueCounts({ backlog: Number(backlog) || 0, sourceDiscovery: Number(sourceDiscovery) || 0 });
      setMessage(null);
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "Research settings could not be loaded safely." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const normalized = {
        enabled: settings.enabled !== false,
        interval_minutes: clampInt(settings.interval_minutes, 15, 15, 1440),
        max_dispatch_per_cycle: clampInt(settings.max_dispatch_per_cycle, 5, 1, 100),
        max_in_flight: clampInt(settings.max_in_flight, 20, 1, 500),
        daily_dispatch_limit: clampInt(settings.daily_dispatch_limit, 40, 1, 5000),
        retry_limit: clampInt(settings.retry_limit, 3, 1, 10),
      };
      const saved = await saveGlobalSettingValueIfUnchanged({
        entity: base44.entities.GlobalSettings,
        loadedRecord,
        settingKey: CONFIG_KEY,
        nextValue: normalized,
        label: "Permitting research dispatch settings",
      });
      setLoadedRecord(saved);
      setSettings(normalized);
      setMessage({ type: "success", text: "Research credit controls saved." });
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "Settings changed elsewhere. Reload before saving." });
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    if (running) return;
    setRunning(true);
    setMessage(null);
    try {
      const response = await base44.functions.invoke("permittingResearchBacklogDispatch", { manual: true });
      const data = response?.data || response;
      if (data?.error) throw new Error(data.error);
      setMessage({
        type: data?.success === false ? "error" : "success",
        text: data?.skipped
          ? "No dispatch: " + data.reason + "."
          : "Cycle complete: " + (data.dispatched || 0) + " jurisdiction(s) released to research.",
      });
      await load();
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "Research cycle could not be run safely." });
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5" />Permitting Research Credit Controls</CardTitle>
          <CardDescription>
            Queue as many OH/KY jurisdictions as needed. These controls limit how quickly the backlog is released into LLM-backed research.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border bg-gray-50 p-4">
            <div>
              <Label className="font-semibold">Enable automatic research</Label>
              <p className="mt-1 text-xs text-gray-500">Pause this to keep the backlog queued without releasing new LLM research jobs.</p>
            </div>
            <Switch checked={settings.enabled} onCheckedChange={(checked) => setSettings((current) => ({ ...current, enabled: checked }))} />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">Backlog size is unlimited by these controls.</div>
                <div className="mt-1 text-xs">Credit protection applies only when jurisdictions are released from the CCS backlog into Base44 Permitting Research.</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Research interval</Label>
              <Select value={String(settings.interval_minutes)} onValueChange={(value) => setSettings((current) => ({ ...current, interval_minutes: Number(value) }))}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">Every 15 minutes</SelectItem>
                  <SelectItem value="30">Every 30 minutes</SelectItem>
                  <SelectItem value="60">Every hour</SelectItem>
                  <SelectItem value="120">Every 2 hours</SelectItem>
                  <SelectItem value="240">Every 4 hours</SelectItem>
                  <SelectItem value="720">Every 12 hours</SelectItem>
                  <SelectItem value="1440">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Jurisdictions released per cycle</Label>
              <Input className="mt-2" type="number" min="1" max="100" value={settings.max_dispatch_per_cycle}
                onChange={(event) => setSettings((current) => ({ ...current, max_dispatch_per_cycle: event.target.value }))} />
              <p className="mt-1 text-xs text-gray-500">Default: 5 every 15 minutes.</p>
            </div>

            <div>
              <Label>Maximum active research requests</Label>
              <Input className="mt-2" type="number" min="1" max="500" value={settings.max_in_flight}
                onChange={(event) => setSettings((current) => ({ ...current, max_in_flight: event.target.value }))} />
            </div>

            <div>
              <Label>Daily jurisdiction release limit</Label>
              <Input className="mt-2" type="number" min="1" max="5000" value={settings.daily_dispatch_limit}
                onChange={(event) => setSettings((current) => ({ ...current, daily_dispatch_limit: event.target.value }))} />
              <p className="mt-1 text-xs text-gray-500">A hard safety cap; resets each Eastern calendar day.</p>
            </div>

            <div>
              <Label>Retry limit</Label>
              <Input className="mt-2" type="number" min="1" max="10" value={settings.retry_limit}
                onChange={(event) => setSettings((current) => ({ ...current, retry_limit: event.target.value }))} />
              <p className="mt-1 text-xs text-gray-500">Repeated failures are blocked instead of consuming credits forever.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3"><div className="text-xs text-gray-500">Queued backlog</div><div className="text-xl font-semibold">{queueCounts.backlog ?? "—"}</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-gray-500">Source discovery</div><div className="text-xl font-semibold">{queueCounts.sourceDiscovery ?? "—"}</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-gray-500">Released today</div><div className="text-xl font-semibold">{stateInfo?.dispatched_today ?? 0}</div></div>
          </div>

          {stateInfo?.last_cycle_at && <p className="text-xs text-gray-500">Last controlled cycle: {new Date(stateInfo.last_cycle_at).toLocaleString()}</p>}

          {message && (
            <div className={"flex items-start gap-2 rounded-lg border p-3 text-sm " + (message.type === "success" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800")}>
              {message.type === "success" ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{message.text}</span>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={load} disabled={saving || running}>Reload</Button>
            <Button variant="outline" onClick={runNow} disabled={saving || running || !settings.enabled}>
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Run one controlled cycle
            </Button>
            <Button onClick={save} disabled={saving || running}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save research settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
