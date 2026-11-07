import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive, BarChart3, Bell, Bookmark, Briefcase, Calendar, Camera, Coffee,
  Flag, Folder, FolderOpen, Gift, Globe, Heart, Home, Layers, Music,
  Settings, Star, Tag, Target, Trash2, Users, Wrench, X, Zap,
} from "lucide-react";
import {
  NAV_COLOR_PALETTE, NAV_FOLDER_ICONS, NAV_STYLE_PRESETS, navButtonStyle, readableText,
} from "./navCustomization";

const ICONS = {
  Archive, BarChart3, Bell, Bookmark, Briefcase, Calendar, Camera, Coffee,
  Flag, Folder, FolderOpen, Gift, Globe, Heart, Home, Layers, Music,
  Settings, Star, Tag, Target, Users, Wrench, Zap,
};
export const folderIconFor = (name) => ICONS[name] || Folder;

// Rich editor for nav folders and page buttons: name, accent color, visual
// style preset, (folders) icon + delete. Portaled modal over the shell.
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
  const PreviewIcon = mode === "folder" ? folderIconFor(draftIcon) : null;
  const cleanName = draftName.trim();

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="ccs-glass-panel w-full max-w-md rounded-2xl border border-white/10 p-4 text-slate-100 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Live preview */}
        <div className="mb-3 flex items-center justify-center rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3">
          <span
            className="ccs-glass-nav-item inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium"
            style={{ ...preview.style, color: preview.textColor || undefined }}
          >
            {PreviewIcon
              ? <PreviewIcon className="h-3.5 w-3.5" style={{ color: preview.textColor || draftColor }} />
              : <FolderOpen className="h-3.5 w-3.5" style={{ color: preview.textColor || draftColor }} />}
            <span style={{ color: preview.textColor || undefined }}>{cleanName || name || "Preview"}</span>
          </span>
        </div>

        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Name</label>
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          maxLength={30}
          placeholder={name}
          className="mb-3 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
        />

        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Color</label>
        <div className="mb-3 grid grid-cols-8 gap-1.5">
          {NAV_COLOR_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => setDraftColor(hex)}
              aria-label={`Color ${hex}`}
              className={`h-7 w-full rounded-md border transition-transform hover:scale-110 ${
                draftColor.toLowerCase() === hex.toLowerCase() ? "ring-2 ring-white ring-offset-1 ring-offset-slate-900" : ""
              }`}
              style={{ background: hex, borderColor: "rgba(255,255,255,0.25)" }}
            />
          ))}
        </div>

        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Button style</label>
        <div className="mb-3 grid grid-cols-4 gap-1.5">
          {NAV_STYLE_PRESETS.map((preset) => {
            const look = navButtonStyle(preset.id, draftColor);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setDraftStyle(preset.id)}
                title={preset.name}
                className={`ccs-glass-nav-item flex h-8 items-center justify-center rounded-lg border text-[10px] font-bold ${
                  draftStyle === preset.id ? "ring-2 ring-white ring-offset-1 ring-offset-slate-900" : ""
                }`}
                style={{ ...look.style, color: look.textColor || "#e2e8f0" }}
              >
                {preset.name}
              </button>
            );
          })}
        </div>

        {mode === "folder" && (
          <>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Icon</label>
            <div className="mb-3 grid grid-cols-8 gap-1.5">
              {NAV_FOLDER_ICONS.map((iconName) => {
                const Ico = folderIconFor(iconName);
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setDraftIcon(iconName)}
                    aria-label={iconName}
                    title={iconName}
                    className={`flex h-7 items-center justify-center rounded-md border transition-colors hover:bg-white/10 ${
                      draftIcon === iconName ? "border-violet-400 bg-violet-500/20" : "border-white/10"
                    }`}
                  >
                    <Ico className="h-3.5 w-3.5" style={{ color: draftColor }} />
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-4 flex items-center gap-2">
          {allowDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          {allowReset && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/10"
            >
              Reset
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!cleanName}
            onClick={() => onSave({ name: cleanName, color: draftColor, style: draftStyle, icon: draftIcon })}
            className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-bold text-white hover:bg-violet-400 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
