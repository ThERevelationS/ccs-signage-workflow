import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Clock, 
  Save, 
  Loader2,
  AlertTriangle,
  CheckCircle
} from "lucide-react";

const GlobalSettings = base44.entities.GlobalSettings;

const DEFAULT_OT_SETTINGS = {
  enabled: true,
  weekly_threshold: 40,
  daily_threshold: 0, // 0 = disabled
  daily_ot_enabled: false,
  ot_multiplier: 1.5,
  double_time_threshold: 0, // 0 = disabled
  double_time_multiplier: 2.0,
  exclude_pto_from_ot: true, // OH law: PTO doesn't count toward OT
  week_starts_on: 0 // 0 = Sunday
};

export default function OvertimeRulesManager() {
  const [settings, setSettings] = useState(DEFAULT_OT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const allSettings = await GlobalSettings.filter({ setting_key: "overtimeRules" });
      if (allSettings.length > 0 && allSettings[0].setting_value) {
        setSettings({ ...DEFAULT_OT_SETTINGS, ...allSettings[0].setting_value });
      }
    } catch (err) {
      console.error("Error loading OT settings:", err);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const existing = await GlobalSettings.filter({ setting_key: "overtimeRules" });
      if (existing.length > 0) {
        await GlobalSettings.update(existing[0].id, { setting_value: settings });
      } else {
        await GlobalSettings.create({ setting_key: "overtimeRules", setting_value: settings });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Error saving OT settings:", err);
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="clay-card p-4">
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 text-purple-600" />
          <div>
            <h3 className="font-semibold text-gray-800">Overtime Rules</h3>
            <p className="text-sm text-gray-500">Configure how overtime is calculated for employees</p>
          </div>
        </div>
      </div>

      {/* Main Toggle */}
      <div className="clay-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-semibold">Enable Overtime Calculation</Label>
            <p className="text-sm text-gray-500 mt-1">Turn off to disable all overtime calculations</p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(val) => setSettings({ ...settings, enabled: val })}
          />
        </div>
      </div>

      {settings.enabled && (
        <>
          {/* Weekly OT */}
          <div className="clay-card p-5 space-y-4">
            <h4 className="font-semibold text-gray-800 flex items-center gap-2">
              <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs">WEEKLY</span>
              Weekly Overtime Threshold
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Hours per week before OT</Label>
                <Input
                  type="number"
                  min="0"
                  max="168"
                  value={settings.weekly_threshold}
                  onChange={(e) => setSettings({ ...settings, weekly_threshold: parseFloat(e.target.value) || 0 })}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">Standard: 40 hours (FLSA)</p>
              </div>
              <div>
                <Label>Week starts on</Label>
                <Select
                  value={String(settings.week_starts_on)}
                  onValueChange={(val) => setSettings({ ...settings, week_starts_on: parseInt(val) })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sunday</SelectItem>
                    <SelectItem value="1">Monday</SelectItem>
                    <SelectItem value="6">Saturday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Daily OT */}
          <div className="clay-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">DAILY</span>
                  Daily Overtime
                </h4>
                <p className="text-sm text-gray-500 mt-1">Some states require daily OT (e.g., California)</p>
              </div>
              <Switch
                checked={settings.daily_ot_enabled}
                onCheckedChange={(val) => setSettings({ ...settings, daily_ot_enabled: val })}
              />
            </div>

            {settings.daily_ot_enabled && (
              <div>
                <Label>Hours per day before OT</Label>
                <Input
                  type="number"
                  min="0"
                  max="24"
                  value={settings.daily_threshold}
                  onChange={(e) => setSettings({ ...settings, daily_threshold: parseFloat(e.target.value) || 0 })}
                  className="mt-1 w-32"
                />
                <p className="text-xs text-gray-500 mt-1">California standard: 8 hours</p>
              </div>
            )}
          </div>

          {/* OT Rate */}
          <div className="clay-card p-5 space-y-4">
            <h4 className="font-semibold text-gray-800 flex items-center gap-2">
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">RATE</span>
              Overtime Multiplier
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Standard OT multiplier</Label>
                <Select
                  value={String(settings.ot_multiplier)}
                  onValueChange={(val) => setSettings({ ...settings, ot_multiplier: parseFloat(val) })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1.25">1.25x (25% extra)</SelectItem>
                    <SelectItem value="1.5">1.5x (Time and a half)</SelectItem>
                    <SelectItem value="1.75">1.75x</SelectItem>
                    <SelectItem value="2">2x (Double time)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">Standard: 1.5x</p>
              </div>

              <div>
                <Label>Double time after (hours/week)</Label>
                <Input
                  type="number"
                  min="0"
                  max="168"
                  placeholder="0 = disabled"
                  value={settings.double_time_threshold || ""}
                  onChange={(e) => setSettings({ ...settings, double_time_threshold: parseFloat(e.target.value) || 0 })}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">Set to 0 to disable double time</p>
              </div>
            </div>
          </div>

          {/* PTO Exclusion */}
          <div className="clay-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Exclude PTO from OT Calculation</Label>
                <p className="text-sm text-gray-500 mt-1">
                  Only hours actually worked count toward overtime (Ohio law compliant)
                </p>
              </div>
              <Switch
                checked={settings.exclude_pto_from_ot}
                onCheckedChange={(val) => setSettings({ ...settings, exclude_pto_from_ot: val })}
              />
            </div>
            {!settings.exclude_pto_from_ot && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Warning: Including PTO in overtime calculations may not comply with Ohio labor law. 
                  Only hours actually worked should count toward the 40-hour threshold.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="clay-button border-none gap-2"
          style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <CheckCircle className="w-4 h-4 text-green-600" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saved ? "Saved!" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}