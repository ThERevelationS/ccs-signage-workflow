import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
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
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/shared/globalSettingsPersistence";
import { staffEntities } from "@/components/staff/staffEntities";
const GlobalSettings = staffEntities.GlobalSettings;
const DEFAULT_OT_SETTINGS = {
  enabled: true,
  weekly_threshold: 40,
  daily_threshold: 0,
  // 0 = disabled
  daily_ot_enabled: false,
  ot_multiplier: 1.5,
  double_time_threshold: 0,
  // 0 = disabled
  double_time_multiplier: 2,
  exclude_pto_from_ot: true,
  // OH law: PTO doesn't count toward OT
  week_starts_on: 0,
  // 0 = Sunday
  flag_enabled: true,
  flag_weekly_hours: 40
  // Needs Attention flags anyone near or over this
};
export default function OvertimeRulesManager() {
  const [settings, setSettings] = useState(DEFAULT_OT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingRecord, setSettingRecord] = useState(null);
  const [settingsError, setSettingsError] = useState("");
  useEffect(() => {
    loadSettings();
  }, []);
  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const record = await loadSingleGlobalSetting({
        entity: GlobalSettings,
        settingKey: "overtimeRules",
        label: "Overtime rules"
      });
      setSettingRecord(record);
      setSettings({ ...DEFAULT_OT_SETTINGS, ...record?.setting_value || {} });
    } catch (err) {
      console.error("Error loading OT settings:", err);
      setSettingsError(err?.message || "Overtime rules could not be loaded safely.");
    } finally {
      setIsLoading(false);
    }
  };
  const handleSave = async () => {
    setIsSaving(true);
    setSettingsError("");
    try {
      const savedRecord = await saveGlobalSettingValueIfUnchanged({
        entity: GlobalSettings,
        loadedRecord: settingRecord,
        settingKey: "overtimeRules",
        nextValue: settings,
        label: "Overtime rules"
      });
      setSettingRecord(savedRecord);
      setSettings({ ...DEFAULT_OT_SETTINGS, ...savedRecord?.setting_value || settings });
      setSaved(true);
      setTimeout(() => setSaved(false), 3e3);
    } catch (err) {
      console.error("Overtime rules save blocked:", err);
      setSettingsError(err?.message || "Overtime rules changed in another session. Reload before saving.");
    } finally {
      setIsSaving(false);
    }
  };
  if (isLoading) {
    return /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center p-12", children: /* @__PURE__ */ jsx(Loader2, { className: "w-6 h-6 animate-spin text-purple-600" }) });
  }
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsx("div", { className: "clay-card p-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsx(Clock, { className: "w-6 h-6 text-purple-600" }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h3", { className: "font-semibold text-gray-800", children: "Overtime Rules" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500", children: "Configure how overtime is calculated for employees" })
      ] })
    ] }) }),
    settingsError && /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "font-medium", children: "Overtime rules update blocked" }),
        /* @__PURE__ */ jsx("div", { className: "mt-1 text-xs", children: settingsError })
      ] }),
      /* @__PURE__ */ jsx(Button, { type: "button", size: "sm", variant: "outline", className: "shrink-0 border-red-300 bg-white text-red-800", onClick: async () => {
        setSettingsError("");
        await loadSettings();
      }, children: "Reload latest" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "clay-card p-5", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(Label, { className: "text-base font-semibold", children: "Enable Overtime Calculation" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mt-1", children: "Turn off to disable all overtime calculations" })
      ] }),
      /* @__PURE__ */ jsx(
        Switch,
        {
          checked: settings.enabled,
          onCheckedChange: (val) => setSettings({ ...settings, enabled: val })
        }
      )
    ] }) }),
    settings.enabled && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "clay-card p-5 space-y-4", children: [
        /* @__PURE__ */ jsxs("h4", { className: "font-semibold text-gray-800 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx("span", { className: "bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs", children: "WEEKLY" }),
          "Weekly Overtime Threshold"
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(Label, { children: "Hours per week before OT" }),
            /* @__PURE__ */ jsx(
              Input,
              {
                type: "number",
                min: "0",
                max: "168",
                value: settings.weekly_threshold,
                onChange: (e) => setSettings({ ...settings, weekly_threshold: parseFloat(e.target.value) || 0 }),
                className: "mt-1"
              }
            ),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500 mt-1", children: "Standard: 40 hours (FLSA)" })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(Label, { children: "Week starts on" }),
            /* @__PURE__ */ jsxs(
              Select,
              {
                value: String(settings.week_starts_on),
                onValueChange: (val) => setSettings({ ...settings, week_starts_on: parseInt(val) }),
                children: [
                  /* @__PURE__ */ jsx(SelectTrigger, { className: "mt-1", children: /* @__PURE__ */ jsx(SelectValue, {}) }),
                  /* @__PURE__ */ jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsx(SelectItem, { value: "0", children: "Sunday" }),
                    /* @__PURE__ */ jsx(SelectItem, { value: "1", children: "Monday" }),
                    /* @__PURE__ */ jsx(SelectItem, { value: "6", children: "Saturday" })
                  ] })
                ]
              }
            )
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "clay-card p-5 space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("h4", { className: "font-semibold text-gray-800 flex items-center gap-2", children: [
              /* @__PURE__ */ jsx("span", { className: "bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs", children: "FLAG" }),
              "Overtime Flag in Needs Attention"
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mt-1", children: "Time Clock Admin lists employees approaching or over this weekly total. Informational only \u2014 it never blocks punches or approvals." })
          ] }),
          /* @__PURE__ */ jsx(
            Switch,
            {
              checked: settings.flag_enabled !== false,
              onCheckedChange: (val) => setSettings({ ...settings, flag_enabled: val })
            }
          )
        ] }),
        settings.flag_enabled !== false && /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx(Label, { children: "Flag employees over (hours/week)" }),
          /* @__PURE__ */ jsx(
            Input,
            {
              type: "number",
              min: "1",
              max: "168",
              value: settings.flag_weekly_hours ?? settings.weekly_threshold,
              onChange: (e) => setSettings({ ...settings, flag_weekly_hours: parseFloat(e.target.value) || 0 }),
              className: "mt-1 w-32"
            }
          ),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500 mt-1", children: "Employees within 4h of this show as approaching; over it shows as over." })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "clay-card p-5 space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("h4", { className: "font-semibold text-gray-800 flex items-center gap-2", children: [
              /* @__PURE__ */ jsx("span", { className: "bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs", children: "DAILY" }),
              "Daily Overtime"
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mt-1", children: "Some states require daily OT (e.g., California)" })
          ] }),
          /* @__PURE__ */ jsx(
            Switch,
            {
              checked: settings.daily_ot_enabled,
              onCheckedChange: (val) => setSettings({ ...settings, daily_ot_enabled: val })
            }
          )
        ] }),
        settings.daily_ot_enabled && /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx(Label, { children: "Hours per day before OT" }),
          /* @__PURE__ */ jsx(
            Input,
            {
              type: "number",
              min: "0",
              max: "24",
              value: settings.daily_threshold,
              onChange: (e) => setSettings({ ...settings, daily_threshold: parseFloat(e.target.value) || 0 }),
              className: "mt-1 w-32"
            }
          ),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500 mt-1", children: "California standard: 8 hours" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "clay-card p-5 space-y-4", children: [
        /* @__PURE__ */ jsxs("h4", { className: "font-semibold text-gray-800 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx("span", { className: "bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs", children: "RATE" }),
          "Overtime Multiplier"
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(Label, { children: "Standard OT multiplier" }),
            /* @__PURE__ */ jsxs(
              Select,
              {
                value: String(settings.ot_multiplier),
                onValueChange: (val) => setSettings({ ...settings, ot_multiplier: parseFloat(val) }),
                children: [
                  /* @__PURE__ */ jsx(SelectTrigger, { className: "mt-1", children: /* @__PURE__ */ jsx(SelectValue, {}) }),
                  /* @__PURE__ */ jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsx(SelectItem, { value: "1.25", children: "1.25x (25% extra)" }),
                    /* @__PURE__ */ jsx(SelectItem, { value: "1.5", children: "1.5x (Time and a half)" }),
                    /* @__PURE__ */ jsx(SelectItem, { value: "1.75", children: "1.75x" }),
                    /* @__PURE__ */ jsx(SelectItem, { value: "2", children: "2x (Double time)" })
                  ] })
                ]
              }
            ),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500 mt-1", children: "Standard: 1.5x" })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(Label, { children: "Double time after (hours/week)" }),
            /* @__PURE__ */ jsx(
              Input,
              {
                type: "number",
                min: "0",
                max: "168",
                placeholder: "0 = disabled",
                value: settings.double_time_threshold || "",
                onChange: (e) => setSettings({ ...settings, double_time_threshold: parseFloat(e.target.value) || 0 }),
                className: "mt-1"
              }
            ),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500 mt-1", children: "Set to 0 to disable double time" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "clay-card p-5", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(Label, { className: "text-base font-semibold", children: "Exclude PTO from OT Calculation" }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mt-1", children: "Only hours actually worked count toward overtime (Ohio law compliant)" })
          ] }),
          /* @__PURE__ */ jsx(
            Switch,
            {
              checked: settings.exclude_pto_from_ot,
              onCheckedChange: (val) => setSettings({ ...settings, exclude_pto_from_ot: val })
            }
          )
        ] }),
        !settings.exclude_pto_from_ot && /* @__PURE__ */ jsxs("div", { className: "mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2", children: [
          /* @__PURE__ */ jsx(AlertTriangle, { className: "w-4 h-4 text-amber-600 mt-0.5" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-amber-700", children: "Warning: Including PTO in overtime calculations may not comply with Ohio labor law. Only hours actually worked should count toward the 40-hour threshold." })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxs(
      Button,
      {
        onClick: handleSave,
        disabled: isSaving,
        className: "clay-button border-none gap-2",
        style: { background: "linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)" },
        children: [
          isSaving ? /* @__PURE__ */ jsx(Loader2, { className: "w-4 h-4 animate-spin" }) : saved ? /* @__PURE__ */ jsx(CheckCircle, { className: "w-4 h-4 text-green-600" }) : /* @__PURE__ */ jsx(Save, { className: "w-4 h-4" }),
          saved ? "Saved!" : "Save Settings"
        ]
      }
    ) })
  ] });
}
