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
import {
  Hourglass, Loader2, CheckCircle, AlertCircle, Info, Plus, X, Timer, ClipboardCopy, ClipboardPaste,
} from "lucide-react";
import { TimeTrackerPreview, ACCENT_PRESETS, resolveAccent } from "@/components/timeclock/TimeTracker";

const ACCENT_CHOICES = Object.entries(ACCENT_PRESETS).map(([value, hex]) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
  hex,
}));

const BACKGROUND_CHOICES = [
  { value: "minimal", label: "Blend", hint: "No bubble — blends into the bar" },
  { value: "glass", label: "Glass", hint: "Frosted translucent pill" },
  { value: "solid", label: "Solid", hint: "Soft accent-tinted pill" },
  { value: "outline", label: "Outline", hint: "Transparent with accent border" },
  { value: "soft", label: "Soft", hint: "Barely-there accent wash" },
  { value: "accent", label: "Filled", hint: "Solid accent color, white text" },
  { value: "halo", label: "Halo", hint: "Glowing ring around the tracker" },
  { value: "dotted", label: "Dotted", hint: "Dashed accent border" },
  { value: "striped", label: "Striped", hint: "Diagonal accent stripes" },
  { value: "elevated", label: "Elevated", hint: "Floating card with deep shadow" },
  { value: "inset", label: "Inset", hint: "Pressed-in look" },
  { value: "neon", label: "Neon", hint: "Dark with glowing accent edge" },
  { value: "pearl", label: "Pearl", hint: "Shimmery light gradient" },
  { value: "carbon", label: "Carbon", hint: "Dark weave texture" },
  { value: "mesh", label: "Mesh", hint: "Layered accent glow spots" },
  { value: "aurora", label: "Aurora", hint: "Soft northern-lights gradient" },
  { value: "dusk", label: "Dusk", hint: "Deep indigo night" },
  { value: "forest", label: "Forest", hint: "Deep green" },
  { value: "ocean", label: "Ocean", hint: "Deep blue" },
  { value: "sunset", label: "Sunset", hint: "Warm orange gradient" },
  { value: "berry", label: "Berry", hint: "Deep magenta" },
  { value: "mono", label: "Mono", hint: "Simple dark chip" },
];

const ANIMATION_CHOICES = [
  { value: "smooth", label: "Smooth", hint: "Values transition gently — no idle motion" },
  { value: "pulse", label: "Pulse", hint: "Ripples only when a milestone fires" },
  { value: "glow", label: "Glow", hint: "Soft accent halo breathing" },
  { value: "breathe", label: "Breathe", hint: "Slow brightness rise and fall" },
  { value: "sweep", label: "Sweep", hint: "Light sheen sweeps across" },
  { value: "wave", label: "Wave", hint: "Gentle up-down bob" },
  { value: "sparkle", label: "Sparkle", hint: "Digits shimmer with accent light" },
  { value: "float", label: "Float", hint: "Slow float up and down" },
  { value: "flicker", label: "Flicker", hint: "Subtle neon-style flicker" },
  { value: "rainbow", label: "Rainbow", hint: "Hue cycles through the spectrum" },
  { value: "pop", label: "Pop", hint: "Elastic scale bounce" },
  { value: "wobble", label: "Wobble", hint: "Playful tilt side to side" },
  { value: "ripple", label: "Ripple", hint: "Accent ring pulses outward" },
  { value: "shake", label: "Shake", hint: "Periodic little shake" },
  { value: "gradient", label: "Gradient", hint: "Animated multi-color wash" },
  { value: "none", label: "None", hint: "No motion at all" },
];

const DISPLAY_CHOICES = [
  { value: "ring", label: "Progress ring", hint: "Circular ring fills toward your goal" },
  { value: "donut", label: "Donut", hint: "Thick ring with the % in the center" },
  { value: "arc", label: "Arc", hint: "Half-arc gauge beside the time" },
  { value: "dual", label: "Dual ring", hint: "Daily inner ring + weekly outer ring" },
  { value: "bar", label: "Gradient bar", hint: "Time over a slim progress bar" },
  { value: "badge", label: "Badge", hint: "Time inside a solid accent chip" },
  { value: "minimal", label: "Minimal digits", hint: "Just the time, no visual" },
  { value: "flip", label: "Flip digits", hint: "Digits flip on every tick" },
  { value: "roll", label: "Roll digits", hint: "Digits roll upward on change" },
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
  animation_target: "all",
  show_label: true,
  show_icon: true,
  show_seconds: true,
  show_percent: false,
  show_only_clocked_in: false,
  progressive_colors: true,
  blink_separator: false,
  hide_when_unfocused: false,
  timeclock_page_only: false,
  goal_celebrate: true,
  weekly_celebrate: true,
  device_scope: "all",
  custom_label: "",
  alert_minutes: [],
  reminders: [],
  time_format: "hh_mm_ss",
  hide_when_idle_minutes: 0,
  daily_goal_overrides: null,
  hide_on_weekend: false,
};

function newRequestId() {
  try { return crypto.randomUUID(); } catch {}
  return `trk-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function InfoDot({ text }) {
  return (
    <span
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-200 text-slate-500 cursor-help align-middle"
      title={text}
      aria-label={text}
    >
      <Info className="h-2.5 w-2.5" />
    </span>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 flex items-center gap-1.5 mb-3">
        {title}
        {hint && <InfoDot text={hint} />}
      </h4>
      {children}
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <Label className="text-xs font-semibold flex items-center gap-1.5">
        {label}
        {hint && <InfoDot text={hint} />}
      </Label>
      {children}
    </div>
  );
}

export default function TimeTrackerSettings({ currentUser, sessionToken = "" }) {
  const email = String(currentUser?.email || "").trim().toLowerCase();
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [importNotice, setImportNotice] = useState("");
  const [error, setError] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState("");
  const [reminderLabel, setReminderLabel] = useState("");
  const [hexInput, setHexInput] = useState("");
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
      const next = { ...DEFAULT_PREFS, ...(data.prefs || {}) };
      setPrefs(next);
      saveRequestRef.current = { id: "", fingerprint: "" };
      setSavedAt(Date.now());
      try { window.dispatchEvent(new CustomEvent("ccs:timeTrackerRefresh", { detail: { prefs: next } })); } catch {}
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
  const isHexAccent = /^#[0-9a-fA-F]{6}$/.test(p.accent_color || "");
  const reminders = Array.isArray(p.reminders) ? p.reminders : [];

  const addReminder = () => {
    const minutes = Math.round(Number(reminderMinutes));
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) return;
    if (reminders.some((r) => Number(r.minutes) === minutes)) return;
    const label = reminderLabel.trim().slice(0, 60);
    update("reminders", [...reminders, { minutes, label }].sort((a, b) => a.minutes - b.minutes));
    setReminderMinutes("");
    setReminderLabel("");
  };
  const removeReminder = (minutes) => {
    update("reminders", reminders.filter((r) => Number(r.minutes) !== Number(minutes)));
  };

  // Presets: role defaults + 3 localStorage save slots per device (#101/#119).
  const ROLE_PRESETS = {
    shop: { label: "Shop default", patch: { display_style: "bar", count_mode: "paid", accent_color: "orange", animation_style: "none", privacy_blur: false, daily_goal_minutes: 480, milestone_sound: "ding" } },
    office: { label: "Office default", patch: { display_style: "ring", count_mode: "paid", accent_color: "indigo", animation_style: "pulse", privacy_blur: true, daily_goal_minutes: 480, milestone_sound: "chime" } },
    field: { label: "Field default", patch: { display_style: "dual", count_mode: "elapsed", accent_color: "green", animation_style: "none", privacy_blur: false, low_data_mode: true, milestone_sound: "bell" } },
  };
  const SOUND_THEMES = {
    celebration: { label: "Celebration", patch: { milestone_sound: "fanfare", animation_style: "pulse", accent_color: "gold" } },
    calm: { label: "Calm", patch: { milestone_sound: "none", animation_style: "none", accent_color: "teal" } },
    focus: { label: "Focus", patch: { milestone_sound: "ding", animation_style: "sweep", accent_color: "violet" } },
  };
  const PRESET_SLOT_KEY = "ccs_tracker_presets";
  const readSlots = () => { try { return JSON.parse(localStorage.getItem(PRESET_SLOT_KEY) || "{}"); } catch { return {}; } };
  const [presetSlots, setPresetSlots] = useState(readSlots);
  const applyPatch = (patch) => { setPrefs((cur) => ({ ...cur, ...patch })); setImportNotice("Preset applied - review and Save to keep it."); };
  const saveSlot = (i) => {
    const next = { ...readSlots(), [i]: { name: p.custom_label || `Preset ${i}`, patch: { ...p }, at: Date.now() } };
    try { localStorage.setItem(PRESET_SLOT_KEY, JSON.stringify(next)); } catch {}
    setPresetSlots(next); setImportNotice(`Saved as preset ${i} on this device.`);
  };
  const applySlot = (i) => { const s = readSlots()[i]; if (s?.patch) { setPrefs({ ...DEFAULT_PREFS, ...s.patch }); setImportNotice(`Loaded preset ${i} - Save to keep it.`); } };

  const exportPrefs = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(p, null, 2));
      setImportNotice("Settings copied - paste them on another machine to import.");
    } catch {
      setImportNotice("Clipboard copy failed - select and copy the text manually.");
    }
  };
  const importPrefs = async () => {
    try {
      const raw = await navigator.clipboard.readText();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad json");
      setPrefs({ ...DEFAULT_PREFS, ...parsed });
      setImportNotice("Settings imported - review and Save to keep them.");
    } catch {
      setImportNotice("No valid settings JSON found on the clipboard.");
    }
  };

  return (
    <div className="clay-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold flex items-center gap-2">
          <Hourglass className="w-5 h-5 text-indigo-600" />
          Time Tracker
        </h3>
        <div className="mt-2 mb-1 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Presets</span>
          {Object.entries(ROLE_PRESETS).map(([k, r]) => (
            <button key={k} type="button" onClick={() => applyPatch(r.patch)} className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50" title={r.label}>{r.label}</button>
          ))}
          {Object.entries(SOUND_THEMES).map(([k, t]) => (
            <button key={k} type="button" onClick={() => applyPatch(t.patch)} className="rounded-full border border-indigo-200 px-2 py-0.5 text-[10px] font-medium text-indigo-600 hover:bg-indigo-50" title={`${t.label} theme`}>{t.label}</button>
          ))}
          {[1, 2, 3].map((i) => (
            <span key={i} className="inline-flex gap-0.5">
              <button type="button" onClick={() => applySlot(i)} className="rounded-l-full border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50" title={presetSlots[i]?.name || `Empty slot ${i}`}>{presetSlots[i] ? `P${i}` : `P${i}·`}</button>
              <button type="button" onClick={() => saveSlot(i)} className="rounded-r-full border-y border-r border-emerald-200 px-1.5 py-0.5 text-[10px] text-emerald-500 hover:bg-emerald-50" title={`Save current as preset ${i}`}>+</button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={exportPrefs} disabled={saving}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Copy settings JSON to clipboard">
            <ClipboardCopy className="h-4 w-4" />
          </button>
          <button type="button" onClick={importPrefs} disabled={saving}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Import settings JSON from clipboard">
            <ClipboardPaste className="h-4 w-4" />
          </button>
          <Switch
            checked={p.tracker_enabled === true}
            onCheckedChange={set("tracker_enabled")}
            disabled={loading || saving}
            aria-label="Enable Time Tracker"
        />
        </div>
      </div>
      {importNotice && <p className="mb-2 text-[11px] font-medium text-indigo-600">{importNotice}</p>}
      <p className="text-sm text-gray-600 mb-4">
        A live count-up timer on your navigation bars showing today's time against your daily goal.
      </p>

      {!loading && (
        <div className="mb-5">
          <Label className="text-xs font-semibold text-gray-500">Live preview — every change shows here instantly</Label>
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
        <div className={`space-y-4 ${p.tracker_enabled ? "" : "opacity-60 pointer-events-none"}`}>

          {/* ---------------- BASICS ---------------- */}
          <Section title="Basics" hint="What the tracker counts and how the time reads">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={`Daily goal — ${dailyHours}h`} hint="Paid work time the tracker counts toward each day">
                <Slider
                  value={[dailyHours]} min={4} max={14} step={0.5}
                  onValueChange={([v]) => update("daily_goal_minutes", Math.round(v * 60))}
                  disabled={saving} className="mt-2"
                />
              </Field>
              <Field label={`Weekly goal — ${weeklyHours}h`} hint="Used by the week strip and the weekly celebration">
                <Slider
                  value={[weeklyHours]} min={8} max={70} step={1}
                  onValueChange={([v]) => update("weekly_goal_minutes", Math.round(v * 60))}
                  disabled={saving} className="mt-2"
                />
              </Field>
            </div>
            <Field label="Per-day goal overrides (hours)" hint="Blank days use the daily goal above — e.g. set Friday to 6 for a short day" info>
              <div className="grid grid-cols-7 gap-1.5 mt-2">
                {["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => (
                  <div key={d} className="text-center">
                    <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">{d}</div>
                    <input
                      type="number" min={0} max={14} step={0.5}
                      value={Number(p.daily_goal_overrides?.[d]) ? p.daily_goal_overrides[d] / 60 : ""}
                      placeholder="-"
                      onChange={(e) => {
                        const hours = e.target.value === "" ? null : Number(e.target.value);
                        const next = { ...(p.daily_goal_overrides || {}) };
                        if (Number.isFinite(hours) && hours > 0) next[d] = Math.round(hours * 60);
                        else delete next[d];
                        update("daily_goal_overrides", Object.keys(next).length ? next : null);
                      }}
                      disabled={saving}
                      className="w-full rounded-md border border-slate-200 px-1 py-1 text-center text-xs"
                    />
                  </div>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
              <Field label="Rounding" hint="Display only - rounds the shown minutes; the raw punch time is never changed">
                <Select value={p.display_rounding || "0"} onValueChange={set("display_rounding")} disabled={saving}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Exact (no rounding)</SelectItem>
                    <SelectItem value="5">Nearest 5 minutes</SelectItem>
                    <SelectItem value="10">Nearest 10 minutes</SelectItem>
                    <SelectItem value="15">Nearest 15 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Counts" hint="Paid time excludes unpaid breaks and work pauses; elapsed is raw wall-clock">
                <Select value={p.count_mode} onValueChange={set("count_mode")} disabled={saving}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid time only</SelectItem>
                    <SelectItem value="elapsed">Raw elapsed</SelectItem>
                    <SelectItem value="pomodoro">Pomodoro cycles (25m)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Direction" hint="Count up from zero, or count down the time remaining to goal">
                <Select value={p.direction} onValueChange={set("direction")} disabled={saving}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="up">Count up</SelectItem>
                    <SelectItem value="down">Count down to goal</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Time format" hint="How the time reads on the bar">
                <Select value={p.time_format} onValueChange={set("time_format")} disabled={saving}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hh_mm_ss">7:42:18</SelectItem>
                    <SelectItem value="hours_minutes">7h 42m</SelectItem>
                    <SelectItem value="decimal">7.71h</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Custom label" hint="Replaces the 'Today'/'Remaining' label — leave blank for default">
                <Input
                  value={p.custom_label || ""}
                  onChange={(e) => update("custom_label", e.target.value.slice(0, 24))}
                  placeholder='e.g. "On the clock"'
                  className="mt-1"
                  disabled={saving}
                />
              </Field>
            </div>
          </Section>

          {/* ---------------- APPEARANCE ---------------- */}
          <Section title="Appearance" hint="Display style, background, accent color and typography">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Display style" hint="The progress visual next to the time">
                <Select value={p.display_style} onValueChange={set("display_style")} disabled={saving}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DISPLAY_CHOICES.map((d) => (
                      <SelectItem key={d.value} value={d.value} title={d.hint}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Font" hint="Typeface for the digits">
                <Select value={p.font} onValueChange={set("font")} disabled={saving}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="mono">Monospace</SelectItem>
                    <SelectItem value="rounded">Wide</SelectItem>
                    <SelectItem value="serif">Serif</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="heavy">Heavy</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Size" hint="Compact or expanded base size — scale slider multiplies on top">
                <Select value={p.size} onValueChange={set("size")} disabled={saving}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="expanded">Expanded</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="mt-4">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                Background
                <InfoDot text="The surface behind the tracker — each preview below uses your accent color" />
              </Label>
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {BACKGROUND_CHOICES.map((bg) => (
                  <button type="button"
                    key={bg.value}
                    type="button"
                    onClick={() => update("background_style", bg.value)}
                    disabled={saving}
                    title={bg.hint}
                    aria-pressed={p.background_style === bg.value}
                    className={`rounded-lg px-1 py-2 text-[10px] font-semibold transition-shadow ${bg.value === "minimal" ? "border border-dashed border-slate-300 text-slate-600" : `tracker-bg-${bg.value}`} ${p.background_style === bg.value ? "ring-2 ring-indigo-500 ring-offset-1" : ""}`}
                    style={{
                      "--tracker-accent": resolveAccent(p.accent_color).ring,
                      "--tracker-accent-soft": resolveAccent(p.accent_color).soft,
                      "--tracker-accent-text": resolveAccent(p.accent_color).text,
                    }}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                Accent color
                <InfoDot text="Drives the ring, bars and accents — pick a swatch, use the wheel, or enter a hex code" />
              </Label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ACCENT_CHOICES.map((choice) => (
                  <button type="button"
                    key={choice.value}
                    type="button"
                    onClick={() => { update("accent_color", choice.value); setHexInput(""); }}
                    disabled={saving}
                    aria-pressed={p.accent_color === choice.value}
                    title={choice.label}
                    className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${p.accent_color === choice.value ? "border-slate-800 scale-110" : "border-transparent"}`}
                    style={{ background: choice.hex }}
                  />
                ))}
                <span className="flex items-center gap-1.5 ml-1">
                  <input
                    type="color"
                    value={isHexAccent ? p.accent_color : "#6366f1"}
                    onChange={(e) => { update("accent_color", e.target.value); setHexInput(e.target.value); }}
                    disabled={saving}
                    title="Pick any color"
                    aria-label="Custom color wheel"
                    className="h-7 w-9 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                  />
                  <Input
                    value={isHexAccent ? p.accent_color : hexInput}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setHexInput(v);
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) update("accent_color", v.toLowerCase());
                    }}
                    placeholder="#hex"
                    className="h-7 w-20 text-[10px] px-1.5"
                    disabled={saving}
                    title="Hex color code, e.g. #8b5cf6"
                  />
                </span>
              </div>
              {isHexAccent && (
                <p className="mt-1.5 text-[10px] text-slate-500">
                  Custom color {p.accent_color} — shades for the ring, bars and pill are derived automatically.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <Field label={`Scale — ${Math.round((p.scale || 1) * 100)}%`} hint="Grows or shrinks the whole tracker — layout reflows around it">
                <Slider
                  value={[Math.round((p.scale || 1) * 100)]}
                  min={50} max={200} step={5}
                  onValueChange={([v]) => update("scale", v / 100)}
                  disabled={saving} className="mt-2"
                />
              </Field>
              <Field label={`Opacity — ${Math.round((p.opacity || 1) * 100)}%`} hint="Fades the whole tracker — useful for subtle presence">
                <Slider
                  value={[Math.round((p.opacity || 1) * 100)]}
                  min={40} max={100} step={5}
                  onValueChange={([v]) => update("opacity", v / 100)}
                  disabled={saving} className="mt-2"
                />
              </Field>
            </div>
          </Section>

          {/* ---------------- MOTION ---------------- */}
          <Section title="Motion" hint="Idle animation for the tracker and what it applies to">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Animation" hint="Continuous effect — Smooth means gentle transitions only">
                <Select value={p.animation_style} onValueChange={set("animation_style")} disabled={saving}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ANIMATION_CHOICES.map((a) => (
                      <SelectItem key={a.value} value={a.value} title={a.hint}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Apply to" hint="Which part of the tracker animates">
                <Select value={p.animation_target} onValueChange={set("animation_target")} disabled={saving}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Whole tracker</SelectItem>
                    <SelectItem value="digits">Digits only</SelectItem>
                    <SelectItem value="ring">Progress visual only</SelectItem>
                    <SelectItem value="icon">Icon only</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex flex-col justify-end gap-2">
                {[
                  ["blink_separator", "Blinking separator", "Time pulses softly like a blinking colon"],
                  ["goal_celebrate", "Celebrate goal", "Shimmer sweep when you hit the daily goal"],
                  ["weekly_celebrate", "Celebrate week", "Alert + pulse when the weekly goal is reached"],
                ].map(([key, label, hint]) => (
                  <label key={key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5">{label}<InfoDot text={hint} /></span>
                    <Switch checked={p[key] === true} onCheckedChange={set(key)} disabled={saving} />
                  </label>
                ))}
              </div>
            </div>
          </Section>

          {/* ---------------- MILESTONES ---------------- */}
          <Section title="Milestones" hint="Alerts as you cross progress thresholds toward the daily goal">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Milestones" hint="Goal only fires at 100%; custom uses your own thresholds">
                <Select value={p.milestones_mode} onValueChange={set("milestones_mode")} disabled={saving}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Off</SelectItem>
                    <SelectItem value="goal">Goal only</SelectItem>
                    <SelectItem value="custom">Custom thresholds</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Alert style" hint="How a milestone announces itself">
                <Select value={p.milestone_behavior} onValueChange={set("milestone_behavior")} disabled={saving}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="silent">Silent</SelectItem>
                    <SelectItem value="pulse">Badge pulse</SelectItem>
                    <SelectItem value="toast">Toast</SelectItem>
                    <SelectItem value="toast_sound">Toast + sound</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Sound" hint="Plays with 'Toast + sound' alerts">
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
              </Field>
            </div>
            {p.milestones_mode === "custom" && (
              <div className="mt-3">
                <Field label="Custom thresholds" hint="Comma-separated percent marks of the daily goal — e.g. 25, 50, 75, 100">
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
                </Field>
              </div>
            )}
          </Section>

          {/* ---------------- REMINDERS ---------------- */}
          <Section title="Reminders" hint="One toast each time the clock passes a mark — e.g. a 'take lunch' reminder at 240 minutes">
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-28">
                <Label className="text-xs font-semibold">After (min)</Label>
                <Input
                  type="number" min={1} max={1440}
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(e.target.value)}
                  placeholder="240"
                  className="mt-1"
                  disabled={saving}
                />
              </div>
              <div className="flex-1 min-w-40">
                <Label className="text-xs font-semibold">Message (optional)</Label>
                <Input
                  value={reminderLabel}
                  onChange={(e) => setReminderLabel(e.target.value.slice(0, 60))}
                  placeholder="Take lunch"
                  className="mt-1"
                  disabled={saving}
                  onKeyDown={(e) => { if (e.key === "Enter") addReminder(); }}
                />
              </div>
              <Button
                type="button" variant="outline" size="sm"
                onClick={addReminder}
                disabled={saving || !reminderMinutes.trim()}
                className="h-9"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
            {reminders.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {reminders.map((r) => (
                  <span
                    key={r.minutes}
                    className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 pl-2.5 pr-1 py-1 text-[11px] font-semibold text-indigo-800"
                  >
                    <Timer className="h-3 w-3" />
                    {r.label || `${r.minutes}m`}
                    <span className="opacity-60">{r.minutes}m</span>
                    <button
                      type="button"
                      onClick={() => removeReminder(r.minutes)}
                      disabled={saving}
                      className="rounded-full p-0.5 hover:bg-indigo-200"
                      aria-label={`Remove reminder at ${r.minutes} minutes`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-slate-400">No reminders — add one above.</p>
            )}
          </Section>

          {/* ---------------- PLACEMENT & VISIBILITY ---------------- */}
          <Section title="Placement & visibility" hint="Where and when the tracker shows up">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Show in" hint="Which navigation bars carry the tracker — falls back if a bar isn't present">
                <Select value={p.location} onValueChange={set("location")} disabled={saving}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Top + side bars</SelectItem>
                    <SelectItem value="top">Top bar only</SelectItem>
                    <SelectItem value="side">Side bar only</SelectItem>
                    <SelectItem value="hidden">Hidden</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Show on" hint="Limit the tracker to desktop or mobile">
                <Select value={p.device_scope} onValueChange={set("device_scope")} disabled={saving}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All devices</SelectItem>
                    <SelectItem value="desktop_only">Desktop only</SelectItem>
                    <SelectItem value="mobile_only">Mobile only</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={`Refresh — ${p.update_interval_seconds}s`} hint="How often the tracker re-syncs with the server">
                <Slider
                  value={[Number(p.update_interval_seconds) || 60]}
                  min={15} max={300} step={15}
                  onValueChange={([v]) => update("update_interval_seconds", v)}
                  disabled={saving} className="mt-2"
                />
              </Field>
              <Field label="Low-data mode" hint="Polls at 2-minute minimum and skips secondary lookups on metered connections">
                <Switch checked={p.low_data_mode === true} onCheckedChange={set("low_data_mode")} />
              </Field>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-x-4 gap-y-3 mt-3">
              {[
                ["show_only_clocked_in", "Only when clocked in", "Hides the tracker completely while clocked out"],
                ["hide_when_unfocused", "Hide when unfocused", "Tracker fades when the window loses focus"],
                ["timeclock_page_only", "Time Clock page only", "Shows only on Time Clock routes"],
                ["privacy_blur", "Privacy blur", "Digits blur until hover — for shared screens"],
                ["hide_on_weekend", "Hide on weekends", "Tracker stays hidden on Saturday and Sunday"],
              ].map(([key, label, hint]) => (
                <label key={key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5">{label}<InfoDot text={hint} /></span>
                  <Switch checked={p[key] === true} onCheckedChange={set(key)} disabled={saving} />
                </label>
              ))}
            </div>
            <Field label={`Hide when idle — ${Number(p.hide_when_idle_minutes) > 0 ? `${p.hide_when_idle_minutes}m` : "off"}`} hint="Tracker disappears after this much mouse/keyboard inactivity (0 = never hide)" info>
              <Slider
                value={[Number(p.hide_when_idle_minutes) || 0]} min={0} max={120} step={5}
                onValueChange={([v]) => update("hide_when_idle_minutes", v)}
                disabled={saving} className="mt-2"
              />
            </Field>
          </Section>

          {/* ---------------- DETAILS ---------------- */}
          <Section title="Extras" hint="Extra info the tracker and its popover show">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              {[
                ["show_label", "Label", "The 'Today'/'Remaining' text before the time"],
                ["show_icon", "Icon", "Timer/pause glyph beside the time"],
                ["show_seconds", "Seconds", "Include seconds in hh:mm:ss"],
                ["show_percent", "% badge", "Percent-of-goal chip after the time"],
                ["progressive_colors", "Progressive colors", "Ring shifts green→amber→red by pace"],
                ["show_overtime", "Overtime counter", "+OT line under the time past goal"],
                ["overtime_warning", "Overtime warning", "Alert when you pass the daily goal"],
                ["show_projected_finish", "Projected finish", "Estimated clock-out time in the popover"],
                ["show_pace", "Pace indicator", "Ahead/behind pace in the popover"],
                ["show_week_strip", "Week strip", "Mini bar chart of the week in the popover"],
              ].map(([key, label, hint]) => (
                <label key={key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5">{label}<InfoDot text={hint} /></span>
                  <Switch checked={p[key] === true} onCheckedChange={set(key)} disabled={saving} />
                </label>
              ))}
            </div>
          </Section>
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
        {savedAt > 0 && <span className="text-sm text-emerald-600">Saved — tracker updated in place</span>}
      </div>
    </div>
  );
}
