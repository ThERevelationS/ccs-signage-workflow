import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Hourglass, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { TimeTrackerPreview } from "@/components/timeclock/TimeTracker";

const ACCENT_CHOICES = [
  { value: "indigo", label: "Indigo", swatch: "bg-indigo-500" },
  { value: "emerald", label: "Emerald", swatch: "bg-emerald-500" },
  { value: "amber", label: "Amber", swatch: "bg-amber-500" },
  { value: "violet", label: "Violet", swatch: "bg-violet-500" },
  { value: "rose", label: "Rose", swatch: "bg-rose-500" },
  { value: "sky", label: "Sky", swatch: "bg-sky-500" },
];

const DEFAULT_PREFS = {
  tracker_enabled: false,
  daily_goal_minutes: 480,
  weekly_goal_minutes: 2400,
  show_week_strip: true,
  display_style: "ring",
  count_mode: "paid",
  direction: "up",
  milestones_mode: "goal",
  milestone_behavior: "pulse",
  milestone_thresholds: [0.5, 0.75, 1],
  overtime_warning: false,
  milestone_sound: "chime",
  show_overtime: true,
  show_projected_finish: true,
  show_pace: true,
  accent_color: "indigo",
  privacy_blur: false,
  size: "expanded",
  location: "both",
  scale: 1,
  opacity: 1,
  font: "default",
  background_style: "minimal",
  update_interval_seconds: 60,
  animation_style: "smooth",
  time_format: "hh_mm_ss",
};

function newRequestId() {
  try { return crypto.randomUUID(); } catch {}
  return `trk-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function TimeTrackerSettings({ currentUser, sessionToken = "" }) {
  const email = String(currentUser?.email || "").trim().toLowerCase();
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [error, setError] = useState("");
  const saveRequestRef = useRef({ id: "", fingerprint: "" });
  const prefsRef = useRef(null);
  prefsRef.current = prefs;

  const load = useCallback(async () => {
    if (!sessionToken || !email) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "time_tracker_prefs_get",
        session_token: sessionToken,
        target_email: email,
      });
      const data = response?.data || response;
      if (!data?.success) throw new Error(data?.error || "Time Tracker settings could not be loaded.");
      setPrefs({ ...DEFAULT_PREFS, ...(data.prefs || {}) });
    } catch (err) {
      setError(err?.message || "Time Tracker settings could not be loaded.");
      setPrefs({ ...DEFAULT_PREFS });
    } finally {
      setLoading(false);
    }
  }, [sessionToken, email]);

  useEffect(() => { load(); }, [load]);

  const update = (key, value) => {
    setSavedAt(0);
    setPrefs((prev) => ({ ...(prev || DEFAULT_PREFS), [key]: value }));
  };

  const save = async () => {
    const current = prefsRef.current;
    if (!current || !sessionToken || !email) return;
    const fingerprint = JSON.stringify(current);
    if (saveRequestRef.current.fingerprint !== fingerprint) {
      saveRequestRef.current = { id: newRequestId(), fingerprint };
    }
    const requestId = saveRequestRef.current.id;
    setSaving(true);
    setError("");
    setSavedAt(0);
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "time_tracker_prefs_update",
        session_token: sessionToken,
        target_email: email,
        request_id: requestId,
        prefs: current,
      });
      const data = response?.data || response;
      if (!data?.success) throw new Error(data?.error || "Time Tracker settings were not saved.");
      setPrefs({ ...DEFAULT_PREFS, ...(data.prefs || {}) });
      saveRequestRef.current = { id: "", fingerprint: "" };
      setSavedAt(Date.now());
      try { window.dispatchEvent(new Event("ccs:timeTrackerRefresh")); } catch {}
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Time Tracker settings were not saved.");
    } finally {
      setSaving(false);
    }
  };

  const p = prefs || DEFAULT_PREFS;
  const set = (key) => (value) => update(key, value);
  const dailyHours = Math.round(p.daily_goal_minutes / 60 * 10) / 10;
  const weeklyHours = Math.round(p.weekly_goal_minutes / 60 * 10) / 10;

  return (
    <div className="clay-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold flex items-center gap-2">
          <Hourglass className="w-5 h-5 text-indigo-600" />
          Time Tracker
        </h3>
        <Switch
          checked={p.tracker_enabled === true}
          onCheckedChange={set("tracker_enabled")}
          disabled={loading || saving}
          aria-label="Enable Time Tracker"
        />
      </div>
      <p className="text-sm text-gray-600 mb-4">
        A live count-up timer on your top and side navigation bars showing today's time against your daily goal.
      </p>

      {!loading && (
        <div className="mb-5">
          <Label className="text-xs font-semibold text-gray-500">Live preview</Label>
          <div className="mt-2 flex min-h-[52px] items-center rounded-lg border border-dashed border-gray-300 bg-white/60 px-3 py-2 overflow-hidden">
            <TimeTrackerPreview prefs={p} />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading settings…
        </div>
      ) : (
        <div className={`space-y-5 ${p.tracker_enabled ? "" : "opacity-60 pointer-events-none"}`}>
          {/* Goals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold">Daily goal — {dailyHours}h</Label>
              <Slider
                value={[dailyHours]}
                min={4} max={14} step={0.5}
                onValueChange={([v]) => update("daily_goal_minutes", Math.round(v * 60))}
                disabled={saving}
                className="mt-2"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Weekly goal — {weeklyHours}h</Label>
              <Slider
                value={[weeklyHours]}
                min={8} max={70} step={1}
                onValueChange={([v]) => update("weekly_goal_minutes", Math.round(v * 60))}
                disabled={saving}
                className="mt-2"
              />
            </div>
          </div>

          {/* Display */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-semibold">Display style</Label>
              <Select value={p.display_style} onValueChange={set("display_style")} disabled={saving}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ring">Progress ring</SelectItem>
                  <SelectItem value="bar">Gradient bar</SelectItem>
                  <SelectItem value="minimal">Minimal digits</SelectItem>
                  <SelectItem value="flip">Flip-clock digits</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Counts</Label>
              <Select value={p.count_mode} onValueChange={set("count_mode")} disabled={saving}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid time only</SelectItem>
                  <SelectItem value="elapsed">Raw elapsed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Direction</Label>
              <Select value={p.direction} onValueChange={set("direction")} disabled={saving}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="up">Count up</SelectItem>
                  <SelectItem value="down">Count down to goal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Time format</Label>
              <Select value={p.time_format} onValueChange={set("time_format")} disabled={saving}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hh_mm_ss">7:42:18</SelectItem>
                  <SelectItem value="hours_minutes">7h 42m</SelectItem>
                  <SelectItem value="decimal">7.71h</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Font</Label>
              <Select value={p.font} onValueChange={set("font")} disabled={saving}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="mono">Monospace</SelectItem>
                  <SelectItem value="rounded">Wide</SelectItem>
                  <SelectItem value="serif">Serif</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Background</Label>
              <Select value={p.background_style} onValueChange={set("background_style")} disabled={saving}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minimal">Blend (no bubble)</SelectItem>
                  <SelectItem value="glass">Glass</SelectItem>
                  <SelectItem value="solid">Solid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Accent color */}
          <div>
            <Label className="text-xs font-semibold">Accent color</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ACCENT_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => update("accent_color", choice.value)}
                  disabled={saving}
                  aria-pressed={p.accent_color === choice.value}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-shadow ${p.accent_color === choice.value ? "border-slate-700 shadow-md" : "border-slate-300"}`}
                >
                  <span className={`h-3 w-3 rounded-full ${choice.swatch}`} />
                  {choice.label}
                </button>
              ))}
            </div>
          </div>

          {/* Milestones */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-semibold">Milestones</Label>
              <Select value={p.milestones_mode} onValueChange={set("milestones_mode")} disabled={saving}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="goal">Goal only</SelectItem>
                  <SelectItem value="custom">Custom thresholds</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Milestone alert</Label>
              <Select value={p.milestone_behavior} onValueChange={set("milestone_behavior")} disabled={saving}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="silent">Silent</SelectItem>
                  <SelectItem value="pulse">Badge pulse</SelectItem>
                  <SelectItem value="toast">Toast</SelectItem>
                  <SelectItem value="toast_sound">Toast + sound</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Sound</Label>
              <Select value={p.milestone_sound} onValueChange={set("milestone_sound")} disabled={saving}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="chime">Chime</SelectItem>
                  <SelectItem value="bell">Bell</SelectItem>
                  <SelectItem value="ding">Ding</SelectItem>
                  <SelectItem value="fanfare">Fanfare</SelectItem>
                  <SelectItem value="alert">Alert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {p.milestones_mode === "custom" && (
            <div>
              <Label className="text-xs font-semibold">Custom thresholds (% of goal, comma separated)</Label>
              <Input
                className="mt-1"
                defaultValue={(p.milestone_thresholds || []).map((t) => Math.round(t * 100)).join(", ")}
                onBlur={(e) => {
                  const parsed = e.target.value.split(/[,\s]+/).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0 && v <= 150).map((v) => v / 100);
                  update("milestone_thresholds", parsed.length ? parsed : [0.5, 0.75, 1]);
                }}
                placeholder="50, 75, 100"
                disabled={saving}
              />
            </div>
          )}

          {/* Toggles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            {[
              ["show_overtime", "Overtime counter"],
              ["overtime_warning", "Overtime warning"],
              ["show_projected_finish", "Projected finish"],
              ["show_pace", "Pace indicator"],
              ["show_week_strip", "Week strip"],
              ["privacy_blur", "Privacy blur"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-2 text-sm">
                <span>{label}</span>
                <Switch checked={p[key] === true} onCheckedChange={set(key)} disabled={saving} />
              </label>
            ))}
          </div>

          {/* Placement + sizing */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs font-semibold">Show in</Label>
              <Select value={p.location} onValueChange={set("location")} disabled={saving}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Top + side bars</SelectItem>
                  <SelectItem value="top">Top bar only</SelectItem>
                  <SelectItem value="side">Side bar only</SelectItem>
                  <SelectItem value="hidden">Hidden</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Size</Label>
              <Select value={p.size} onValueChange={set("size")} disabled={saving}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="expanded">Expanded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Animation</Label>
              <Select value={p.animation_style} onValueChange={set("animation_style")} disabled={saving}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="smooth">Smooth</SelectItem>
                  <SelectItem value="pulse">Pulse</SelectItem>
                  <SelectItem value="glow">Glow</SelectItem>
                  <SelectItem value="breathe">Breathe</SelectItem>
                  <SelectItem value="sweep">Sweep</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Refresh — {p.update_interval_seconds}s</Label>
              <Slider
                value={[Number(p.update_interval_seconds) || 60]}
                min={15} max={300} step={15}
                onValueChange={([v]) => update("update_interval_seconds", v)}
                disabled={saving}
                className="mt-2"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Scale — {Math.round((p.scale || 1) * 100)}%</Label>
              <Slider
                value={[Math.round((p.scale || 1) * 100)]}
                min={50} max={200} step={5}
                onValueChange={([v]) => update("scale", v / 100)}
                disabled={saving}
                className="mt-2"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Opacity — {Math.round((p.opacity || 1) * 100)}%</Label>
              <Slider
                value={[Math.round((p.opacity || 1) * 100)]}
                min={40} max={100} step={5}
                onValueChange={([v]) => update("opacity", v / 100)}
                disabled={saving}
                className="mt-2"
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={loading || saving || !sessionToken} className="bg-indigo-600 hover:bg-indigo-700">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : savedAt ? <CheckCircle className="w-4 h-4 mr-2" /> : null}
          {saving ? "Saving…" : "Save Time Tracker settings"}
        </Button>
        {savedAt > 0 && <span className="text-sm text-emerald-600">Saved</span>}
      </div>
    </div>
  );
}
