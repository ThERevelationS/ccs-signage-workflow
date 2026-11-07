import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive, BarChart3, Bell, Bookmark, Briefcase, Calendar, Camera, Coffee,
  Flag, Folder, FolderOpen, Gift, Globe, Heart, Home, Layers, Music,
  Settings, Star, Tag, Target, Trash2, Users, Wrench, X, Zap, RotateCcw,
} from "lucide-react";
import {
  NAV_COLOR_PALETTE, NAV_FOLDER_ICONS, NAV_STYLE_PRESETS, navButtonStyle,
} from "./navCustomization";

const ICONS = {
  Archive, BarChart3, Bell, Bookmark, Briefcase, Calendar, Camera, Coffee,
  Flag, Folder, FolderOpen, Gift, Globe, Heart, Home, Layers, Music,
  Settings, Star, Tag, Target, Users, Wrench, Zap,
};
export const folderIconFor = (name) => ICONS[name] || Folder;

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

// Rich editor for nav folders and page buttons: live preview, name, accent
// color (palette + custom hex), visual style presets rendered as real buttons,
// and (folders) an icon picker + delete. Portaled modal over the shell.
export default function NavItemEditor({
  mode = "folder",            // "folder" | "page"
  title,
  name,
  color,
  style,
  icon,
  allowDelete = false,
  allowReset = false,
  onSave,
  onDelete,
  onReset,
  onClose,
}) {
  const [draftName, setDraftName] = useState(name || "");
  const [draftColor, setDraftColor] = useState(color || "#8B5CF6");
  const [draftStyle, setDraftStyle] = useState(style || "glass");
  const [draftIcon, setDraftIcon] = useState(icon || "Folder");

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const preview = useMemo(() => navButtonStyle(draftStyle, draftColor), [draftStyle, draftColor]);
  const previewText = preview.textColor || "#f1f5f9";
  const PreviewIcon = mode === "folder" ? folderIconFor(draftIcon) : null;
  const cleanName = draftName.trim();
  const setHex = (raw) => {
    const v = raw.startsWith("#") ? raw : `#${raw}`;
    if (HEX_RE.test(v)) setDraftColor(v.toUpperCase());
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md"
      onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-slate-800/95 to-slate-900/95 text-slate-100 shadow-2xl shadow-violet-950/40">
        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-white/10 bg-white/5 px-5 py-3.5">
          <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${draftColor}, transparent)` }} />
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            {PreviewIcon && <PreviewIcon className="h-4 w-4" style={{ color: draftColor }} />}
            {title}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Live preview — rendered on a bar-like strip */}
          <div className="mb-4 flex items-center justify-center rounded-xl border border-white/10 bg-gradient-to-b from-indigo-100/90 to-slate-200/90 px-3 py-4 dark:from-slate-800 dark:to-slate-900">
            <span
              className={`${preview.glass ? "ccs-glass-nav-item" : "ccs-nav-styled"} inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold`}
              style={{ "--glass-accent-rgb": `${parseInt(draftColor.slice(1,3),16)} ${parseInt(draftColor.slice(3,5),16)} ${parseInt(draftColor.slice(5,7),16)}`, ...preview.style }}
            >
              {PreviewIcon
                ? <PreviewIcon className="h-3.5 w-3.5" style={{ color: previewText === "#f1f5f9" ? draftColor : previewText }} />
                : <FolderOpen className="h-3.5 w-3.5" style={{ color: previewText === "#f1f5f9" ? draftColor : previewText }} />}
              <span style={{ color: previewText, textShadow: preview.style?.textShadow }}>{cleanName || name || "Preview"}</span>
              {mode === "folder" && <span style={{ color: previewText === "#f1f5f9" ? "#9ca3af" : previewText }}>▾</span>}
            </span>
          </div>

          <div className="mb-3.5">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Name</label>
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              maxLength={30}
              placeholder={name}
              className="w-full rounded-xl border border-white/15 bg-slate-950/50 px-3.5 py-2.5 text-sm font-medium text-white outline-none transition-colors placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div className="mb-3.5">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Color</label>
              <div className="flex items-center gap-1.5">
                <span className="h-5 w-5 rounded-md border border-white/20" style={{ background: draftColor }} />
                <input
                  key={draftColor}
                  defaultValue={draftColor}
                  onChange={(event) => setHex(event.target.value)}
                  onBlur={(event) => { if (!HEX_RE.test(event.target.value)) event.target.value = draftColor; }}
                  maxLength={7}
                  className="w-[76px] rounded-md border border-white/15 bg-slate-950/50 px-2 py-0.5 font-mono text-[11px] text-slate-200 outline-none focus:border-violet-400"
                  aria-label="Custom hex color"
                />
              </div>
            </div>
            <div className="grid grid-cols-8 gap-2">
              {NAV_COLOR_PALETTE.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setDraftColor(hex)}
                  aria-label={`Color ${hex}`}
                  title={hex}
                  className={`h-8 w-full rounded-lg transition-all hover:scale-110 hover:shadow-lg ${
                    draftColor.toLowerCase() === hex.toLowerCase() ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900 shadow-md" : "shadow-sm"
                  }`}
                  style={{ background: `linear-gradient(180deg, ${hex}, ${hex}dd)`, border: "1px solid rgba(255,255,255,0.25)" }}
                />
              ))}
            </div>
          </div>

          <div className="mb-3.5">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Button style</label>
            {/* Light backdrop so translucent presets render as they will on the bar */}
            <div className="grid grid-cols-4 gap-2 rounded-xl border border-white/10 bg-gradient-to-b from-indigo-100/90 to-slate-200/90 p-2">
              {NAV_STYLE_PRESETS.map((preset) => {
                const look = navButtonStyle(preset.id, draftColor);
                const sel = draftStyle === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setDraftStyle(preset.id)}
                    title={preset.name}
                    className={`${look.glass ? "ccs-glass-nav-item" : "ccs-nav-styled"} flex h-10 items-center justify-center gap-1 rounded-lg border text-[10px] font-bold transition-transform hover:scale-[1.03] ${
                      sel ? "ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-200" : ""
                    }`}
                    style={{ "--glass-accent-rgb": "139 92 246", ...look.style }}
                  >
                    <span style={{ color: look.textColor || (preset.id === "glass" ? "#334155" : undefined), textShadow: look.style?.textShadow }}>{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {mode === "folder" && (
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Icon</label>
              <div className="grid grid-cols-8 gap-2">
                {NAV_FOLDER_ICONS.map((iconName) => {
                  const Ico = folderIconFor(iconName);
                  return (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setDraftIcon(iconName)}
                      aria-label={iconName}
                      title={iconName}
                      className={`flex h-8 items-center justify-center rounded-lg border transition-all hover:bg-white/10 ${
                        draftIcon === iconName ? "border-violet-400 bg-violet-500/25 ring-1 ring-violet-400" : "border-white/10 bg-white/5"
                      }`}
                    >
                      <Ico className="h-3.5 w-3.5" style={{ color: draftColor }} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 bg-white/5 px-5 py-3.5">
          {allowDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 transition-colors hover:bg-rose-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          {allowReset && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-4 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!cleanName}
            onClick={() => onSave({ name: cleanName, color: draftColor, style: draftStyle, icon: draftIcon })}
            className="rounded-lg bg-gradient-to-b from-violet-500 to-violet-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-violet-900/40 transition-all hover:from-violet-400 hover:to-violet-500 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
