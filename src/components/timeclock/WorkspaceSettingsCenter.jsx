import React, { useMemo, useState } from "react";
import { useWorkspacePreferences } from "@/components/layout/WorkspacePreferencesProvider";
import { NAV_CATALOG, ACCENTS, PROFILE_PRESETS } from "@/components/layout/workspacePrefs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Monitor, Sun, Moon, Palette, PanelTop, Star, Eye, EyeOff, RotateCcw,
  Search, LayoutGrid, Bookmark, CheckCircle2, Loader2, AlertCircle,
} from "lucide-react";

const LABEL_MODES = [
  { value: "full", label: "Full labels" },
  { value: "abbreviated", label: "Short labels" },
  { value: "icons", label: "Icons only" },
];
const SIZE_MODES = [
  { value: "auto", label: "Auto" },
  { value: "compact", label: "Compact" },
  { value: "roomy", label: "Roomy" },
];
const DENSITY_MODES = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious", label: "Spacious" },
];
const THEME_MODES = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function Row({ label, hint, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</div>
        {hint && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-0.5 gap-0.5">
      {options.map((o) => {
        const Icon = o.icon;
        const active = value === o.value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${active ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}>
            {Icon && <Icon className="w-3 h-3" />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function WorkspaceSettingsCenter() {
  const wp = useWorkspacePreferences();
  const { prefs, profiles, saving, saveError, loaded } = wp;
  const [query, setQuery] = useState("");
  const [profileName, setProfileName] = useState("");
  const [confirmReset, setConfirmReset] = useState("");

  const nav = prefs.navigation || {};
  const hidden = nav.hidden || [];
  const favorites = nav.favorites || [];

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [
      { id: "appearance", keys: ["theme", "dark", "light", "mode", "accent", "color", "font", "size", "text", "appearance"] },
      { id: "accessibility", keys: ["motion", "contrast", "accessibility", "reduce"] },
      { id: "taskbar", keys: ["taskbar", "nav", "navigation", "buttons", "labels", "icons", "tooltips", "hide", "favorite", "pin", "order", "drag"] },
      { id: "startup", keys: ["landing", "startup", "home", "start", "page"] },
      { id: "pipeline", keys: ["pipeline", "sales", "board", "table", "view", "kanban"] },
      { id: "density", keys: ["density", "compact", "spacious", "spacing", "comfortable"] },
      { id: "profiles", keys: ["profile", "preset", "save", "switch", "workspace"] },
      { id: "reset", keys: ["reset", "restore", "default"] },
    ];
    if (!q) return all;
    return all.filter((s) => s.id.includes(q) || s.keys.some((k) => k.includes(q)));
  }, [query]);

  const shown = (id) => sections.some((s) => s.id === id);

  const toggleList = (list, item, on) =>
    on ? [...list.filter((u) => u !== item), item] : list.filter((u) => u !== item);

  const setHidden = (url, hide) => wp.patchPrefs({ navigation: { hidden: toggleList(hidden, url, hide) } });
  const setFavorite = (url, fav) => {
    // Favorites pin to the front via the order array — same mechanic as a drag.
    const nextFavs = toggleList(favorites, url, fav);
    const order = [...(nav.order || [])];
    const rest = order.filter((u) => u !== url && !nextFavs.includes(u));
    const pinned = nextFavs.filter((u) => NAV_CATALOG.some((c) => c.url === u));
    wp.patchPrefs({ navigation: { favorites: nextFavs, order: [...pinned, ...rest], orderUpdatedAt: new Date().toISOString() } });
  };

  const status = saveError ? { icon: AlertCircle, text: "Save failed — retrying", cls: "text-amber-600" }
    : saving ? { icon: Loader2, text: "Saving…", cls: "text-slate-500", spin: true }
    : { icon: CheckCircle2, text: loaded ? "Saved" : "Loading…", cls: "text-emerald-600" };
  const StatusIcon = status.icon;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 min-w-0">
          <Palette className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Personal Workspace</h3>
          <span className="hidden sm:inline text-xs text-slate-400">— only affects your account, on every device</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a setting…"
              className="h-8 w-44 pl-8 text-xs" />
          </div>
          <span className={`flex items-center gap-1 text-xs font-medium ${status.cls}`}>
            <StatusIcon className={`w-3.5 h-3.5 ${status.spin ? "animate-spin" : ""}`} />{status.text}
          </span>
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800 px-4">
        {shown("appearance") && (
          <section className="py-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Appearance</h4>
            <Row label="Theme" hint="System follows your device setting">
              <Seg options={THEME_MODES} value={prefs.appearance?.mode || "system"} onChange={(v) => wp.updatePrefs("appearance.mode", v)} />
            </Row>
            <Row label="Accent" hint="Used by controls that support a custom accent">
              <div className="flex gap-1.5">
                {Object.entries(ACCENTS).map(([name, hex]) => (
                  <button key={name} type="button" title={name} onClick={() => wp.updatePrefs("appearance.accent", name)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${prefs.appearance?.accent === name ? "border-slate-800 dark:border-white scale-110" : "border-transparent hover:scale-105"}`}
                    style={{ backgroundColor: hex }} />
                ))}
              </div>
            </Row>
            <Row label="Text & control size" hint={`${Math.round((prefs.appearance?.fontScale || 1) * 100)}% — scales the whole interface`}>
              <div className="w-40 flex items-center gap-2">
                <Slider min={90} max={115} step={5} value={[Math.round((prefs.appearance?.fontScale || 1) * 100)]}
                  onValueChange={([v]) => wp.updatePrefs("appearance.fontScale", v / 100)} />
              </div>
            </Row>
          </section>
        )}

        {shown("density") && (
          <section className="py-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Density</h4>
            <Row label="Interface density" hint="Tighter or roomier padding on workspace controls">
              <Seg options={DENSITY_MODES} value={prefs.density || "comfortable"} onChange={(v) => wp.updatePrefs("density", v)} />
            </Row>
          </section>
        )}

        {shown("accessibility") && (
          <section className="py-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Accessibility</h4>
            <Row label="Reduce motion" hint="Minimizes animations and transitions everywhere">
              <Switch checked={!!prefs.appearance?.reducedMotion} onCheckedChange={(v) => wp.updatePrefs("appearance.reducedMotion", v)} />
            </Row>
            <Row label="Higher contrast" hint="Stronger borders and clearer secondary text">
              <Switch checked={!!prefs.appearance?.highContrast} onCheckedChange={(v) => wp.updatePrefs("appearance.highContrast", v)} />
            </Row>
          </section>
        )}

        {shown("taskbar") && (
          <section className="py-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Taskbar & Navigation</h4>
            <Row label="Button labels" hint="Icons only keeps the taskbar narrow; tooltips still identify buttons">
              <Seg options={LABEL_MODES} value={nav.labels || "full"} onChange={(v) => wp.updatePrefs("navigation.labels", v)} />
            </Row>
            <Row label="Button size" hint="Auto follows your compact/roomy view mode">
              <Seg options={SIZE_MODES} value={nav.size || "auto"} onChange={(v) => wp.updatePrefs("navigation.size", v)} />
            </Row>
            <Row label="Tooltips" hint="Hover hints on taskbar buttons">
              <Switch checked={nav.tooltips !== false} onCheckedChange={(v) => wp.updatePrefs("navigation.tooltips", v)} />
            </Row>
            <div className="pt-2">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-0.5">Buttons</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Drag to reorder in the taskbar. Star pins to the front; eye hides from the bar (the page still works).
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {NAV_CATALOG.map((item) => {
                  const isHidden = hidden.includes(item.url);
                  const isFav = favorites.includes(item.url);
                  return (
                    <div key={item.url} className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${isHidden ? "opacity-50" : ""}`}>
                      <button type="button" title={isFav ? "Unpin" : "Pin to front"} onClick={() => setFavorite(item.url, !isFav)}
                        className={`p-1 rounded ${isFav ? "text-amber-500" : "text-slate-300 dark:text-slate-600 hover:text-amber-400"}`}>
                        <Star className="w-3.5 h-3.5" fill={isFav ? "currentColor" : "none"} />
                      </button>
                      <span className="flex-1 text-xs text-slate-700 dark:text-slate-300 truncate">{item.title}</span>
                      <button type="button" title={isHidden ? "Show" : "Hide"} onClick={() => setHidden(item.url, !isHidden)}
                        className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {shown("startup") && (
          <section className="py-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Startup</h4>
            <Row label="Landing page" hint="Where the app opens after sign-in">
              <select value={nav.landingPage || ""} onChange={(e) => wp.updatePrefs("navigation.landingPage", e.target.value)}
                className="h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2 text-slate-800 dark:text-slate-200">
                <option value="">Default (My Workflow)</option>
                {NAV_CATALOG.map((i) => <option key={i.url} value={i.url}>{i.title}</option>)}
              </select>
            </Row>
          </section>
        )}

        {shown("pipeline") && (
          <section className="py-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Sales Pipeline</h4>
            <Row label="Default view" hint="Which pipeline layout opens first — also remembers your last pick">
              <select value={prefs.pipeline?.defaultView || ""} onChange={(e) => wp.updatePrefs("pipeline.defaultView", e.target.value)}
                className="h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2 text-slate-800 dark:text-slate-200">
                <option value="">App default (Table)</option>
                <option value="table">Table</option>
                <option value="board">Board</option>
                <option value="daily">Daily</option>
                <option value="insights">Insights</option>
              </select>
            </Row>
            <p className="text-xs text-slate-400 pb-1">Column presets and saved filters live inside the pipeline itself — they are already per-user.</p>
          </section>
        )}

        {shown("profiles") && (
          <section className="py-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Workspace Profiles</h4>
            <div className="flex flex-wrap gap-2 pb-2">
              {PROFILE_PRESETS.map((p) => (
                <button key={p.key} type="button" title={p.description} onClick={() => wp.patchPrefs(p.prefs)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  {p.name}
                </button>
              ))}
              <span className="text-[11px] text-slate-400 self-center">one-click presets</span>
            </div>
            <div className="flex items-center gap-2 py-1.5">
              <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Profile name (e.g. Field tablet)"
                className="h-8 w-56 text-xs" maxLength={40} />
              <Button size="sm" variant="outline" className="h-8 text-xs"
                disabled={!profileName.trim()}
                onClick={() => { wp.saveProfile(profileName); setProfileName(""); }}>
                Save current
              </Button>
            </div>
            {profiles.length === 0 ? (
              <p className="text-xs text-slate-400 py-1">No saved profiles yet. Profiles snapshot every workspace setting above.</p>
            ) : (
              <div className="space-y-1 py-1">
                {profiles.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex-1 truncate">{p.name}</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => wp.applyProfile(p.name)}>Apply</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-500" onClick={() => wp.deleteProfile(p.name)}>Delete</Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {shown("reset") && (
          <section className="py-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Reset</h4>
            <div className="flex flex-wrap gap-2 pt-1">
              {confirmReset === "nav" ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-slate-600 dark:text-slate-300">Reset taskbar order, hidden buttons and pins?</span>
                  <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { wp.resetSection("navigation"); try { Object.keys(localStorage).filter((k) => k.startsWith("ccsNavOrder")).forEach((k) => localStorage.removeItem(k)); } catch {} window.dispatchEvent(new Event("ccs-nav-order-sync")); setConfirmReset(""); }}>Confirm</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmReset("")}>Cancel</Button>
                </span>
              ) : (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setConfirmReset("nav")}>Reset taskbar…</Button>
              )}
              {confirmReset === "all" ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-slate-600 dark:text-slate-300">Reset ALL workspace settings?</span>
                  <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { wp.resetAll(); setConfirmReset(""); }}>Confirm</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmReset("")}>Cancel</Button>
                </span>
              ) : (
                <Button size="sm" variant="outline" className="h-8 text-xs text-rose-600" onClick={() => setConfirmReset("all")}>Reset everything…</Button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
