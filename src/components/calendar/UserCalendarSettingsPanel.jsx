import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, Calendar, Settings, Eye, Link, Unlink } from "lucide-react";

const STAGES = [
  { value: "estimating", label: "Estimating" },
  { value: "sales", label: "Sales" },
  { value: "permitting", label: "Permitting" },
  { value: "design", label: "Design" },
  { value: "production", label: "Production" },
  { value: "fabrication", label: "Fabrication" },
  { value: "installation", label: "Installation" },
];

export default function UserCalendarSettingsPanel({ userEmail, onSettingsChange }) {
  const [settings, setSettings] = useState(null);
  const [settingsId, setSettingsId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (userEmail) load();
  }, [userEmail]);

  const load = async () => {
    setLoading(true);
    const all = await base44.entities.UserCalendarSettings.filter({ user_email: userEmail });
    if (all?.length > 0) {
      setSettings(all[0]);
      setSettingsId(all[0].id);
    } else {
      setSettings({
        user_email: userEmail,
        show_universal: true,
        show_work_orders: true,
        show_site_surveys: true,
        show_installs: true,
        show_personal: true,
        default_view: "month",
        work_order_stages: [],
        outlook_connected: false,
        google_connected: false,
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    if (settingsId) {
      await base44.entities.UserCalendarSettings.update(settingsId, settings);
    } else {
      const created = await base44.entities.UserCalendarSettings.create(settings);
      setSettingsId(created.id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSettingsChange?.(settings);
  };

  const update = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const toggleStage = (stage) => {
    const current = settings.work_order_stages || [];
    update("work_order_stages", 
      current.includes(stage) ? current.filter(s => s !== stage) : [...current, stage]
    );
  };

  if (loading) {
    return <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-purple-600" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Default View */}
      <div className="clay-card p-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-purple-600" />
          Default View
        </h3>
        <Select value={settings.default_view} onValueChange={v => update("default_view", v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Month</SelectItem>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="day">Day</SelectItem>
            <SelectItem value="agenda">Agenda</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Calendar Sources */}
      <div className="clay-card p-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Eye className="w-4 h-4 text-purple-600" />
          Calendar Sources
        </h3>
        <div className="space-y-3">
          {[
            { key: "show_universal", label: "Company Universal Calendar", desc: "Company-wide events for everyone" },
            { key: "show_work_orders", label: "Work Order Due Dates", desc: "Show work order deadlines" },
            { key: "show_site_surveys", label: "Site Survey Dates", desc: "Show scheduled site surveys" },
            { key: "show_installs", label: "Install Dates", desc: "Show scheduled installations" },
            { key: "show_personal", label: "My Personal Events", desc: "Events you created just for yourself" },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
              <Switch checked={settings[item.key]} onCheckedChange={v => update(item.key, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* Work Order Stage Filter */}
      {settings.show_work_orders && (
        <div className="clay-card p-4">
          <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
            <Settings className="w-4 h-4 text-purple-600" />
            Work Order Stage Filter
          </h3>
          <p className="text-xs text-gray-500 mb-3">Select which stages to show (empty = show all)</p>
          <div className="flex flex-wrap gap-2">
            {STAGES.map(s => {
              const active = (settings.work_order_stages || []).includes(s.value);
              return (
                <button
                  key={s.value}
                  onClick={() => toggleStage(s.value)}
                  className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                  style={{
                    background: active ? "#7C3AED" : "white",
                    color: active ? "white" : "#374151",
                    borderColor: active ? "#7C3AED" : "#D1D5DB"
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* External Calendars */}
      <div className="clay-card p-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Link className="w-4 h-4 text-purple-600" />
          External Calendars
        </h3>
        <div className="space-y-3">
          {/* Outlook */}
          <div className="flex items-center justify-between p-3 rounded-xl border"
            style={{ borderColor: settings.outlook_connected ? "#0078D4" : "#E5E7EB", background: settings.outlook_connected ? "#EFF6FF" : "#F9FAFB" }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                style={{ background: "#0078D4" }}>O</div>
              <div>
                <p className="text-sm font-medium text-gray-800">Microsoft Outlook</p>
                <p className="text-xs text-gray-500">
                  {settings.outlook_connected ? "Connected — sync active" : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {settings.outlook_connected ? (
                <Button size="sm" variant="outline" onClick={() => update("outlook_connected", false)}
                  className="text-red-600 border-red-200 hover:bg-red-50 gap-1">
                  <Unlink className="w-3 h-3" />
                  Disconnect
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="gap-1 opacity-50 cursor-not-allowed" disabled title="Coming soon — requires admin OAuth setup">
                  <Link className="w-3 h-3" />
                  Connect (Coming Soon)
                </Button>
              )}
            </div>
          </div>

          {/* Google Calendar */}
          <div className="flex items-center justify-between p-3 rounded-xl border"
            style={{ borderColor: settings.google_connected ? "#4285F4" : "#E5E7EB", background: settings.google_connected ? "#EFF6FF" : "#F9FAFB" }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                style={{ background: "linear-gradient(135deg, #4285F4, #34A853)" }}>G</div>
              <div>
                <p className="text-sm font-medium text-gray-800">Google Calendar</p>
                <p className="text-xs text-gray-500">
                  {settings.google_connected ? "Connected — sync active" : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {settings.google_connected ? (
                <Button size="sm" variant="outline" onClick={() => update("google_connected", false)}
                  className="text-red-600 border-red-200 hover:bg-red-50 gap-1">
                  <Unlink className="w-3 h-3" />
                  Disconnect
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="gap-1 opacity-50 cursor-not-allowed" disabled title="Coming soon — requires admin OAuth setup">
                  <Link className="w-3 h-3" />
                  Connect (Coming Soon)
                </Button>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          External calendar connections require admin OAuth setup in Admin Settings → Calendar.
        </p>
      </div>

      {/* Save */}
      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full clay-button border-none"
        style={{ background: "linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)" }}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : saved ? <Check className="w-4 h-4 mr-2 text-green-600" /> : null}
        {saved ? "Saved!" : "Save Calendar Settings"}
      </Button>
    </div>
  );
}