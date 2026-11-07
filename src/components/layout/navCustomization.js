// Per-user nav customization model: folders, page styling, top-level ordering.
// State shape = { order: [...], folders: [...] } where order entries are page
// urls ("/Name") or folder tokens ("folder:<id>"). Persisted per user inside
// prefs.navigation (workspacePrefs blob) + the existing ccsNavOrder localStorage
// bridge for order only.

export const FOLDER_TOKEN_PREFIX = "folder:";
export const folderToken = (id) => `${FOLDER_TOKEN_PREFIX}${id}`;
export const isFolderToken = (entry) => typeof entry === "string" && entry.startsWith(FOLDER_TOKEN_PREFIX);
export const tokenFolderId = (entry) => (isFolderToken(entry) ? entry.slice(FOLDER_TOKEN_PREFIX.length) : null);

export function sanitizeFolders(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const f of raw) {
    if (!f || typeof f.id !== "string" || !f.id) continue;
    out.push({
      id: f.id,
      name: String(f.name || "Folder").slice(0, 30),
      color: typeof f.color === "string" ? f.color : "#8B5CF6",
      style: NAV_STYLE_IDS.includes(f.style) ? f.style : "glass",
      icon: typeof f.icon === "string" ? f.icon : "Folder",
      items: Array.isArray(f.items) ? f.items.filter((u) => typeof u === "string" && u.startsWith("/")) : [],
    });
    if (out.length >= 20) break;
  }
  return out;
}

export function sanitizePageStyles(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [url, s] of Object.entries(raw)) {
    if (typeof url !== "string" || !url.startsWith("/") || !s || typeof s !== "object") continue;
    const next = {};
    if (typeof s.name === "string" && s.name.trim()) next.name = s.name.trim().slice(0, 30);
    if (typeof s.color === "string" && /^#[0-9a-fA-F]{6}$/.test(s.color)) next.color = s.color;
    if (NAV_STYLE_IDS.includes(s.style)) next.style = s.style;
    if (Object.keys(next).length) out[url] = next;
  }
  return out;
}

// Ordered top-level entries: [{type:'page',url} | {type:'folder',id,folder}]
// Saved order ranks first; new pages append, then unknown/new folders append.
export function resolveTopLevel(order, folders, allPageUrls) {
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const seen = new Set();
  const entries = [];
  const saved = Array.isArray(order) ? order : [];
  for (const entry of saved) {
    if (isFolderToken(entry)) {
      const id = tokenFolderId(entry);
      const folder = folderById.get(id);
      if (folder && !seen.has(entry)) { entries.push({ type: "folder", id, folder }); seen.add(entry); }
    } else if (allPageUrls.has(entry) && !seen.has(entry)) {
      entries.push({ type: "page", url: entry });
      seen.add(entry);
    }
  }
  for (const url of allPageUrls) {
    if (!seen.has(url)) { entries.push({ type: "page", url }); seen.add(url); }
  }
  for (const f of folders) {
    const token = folderToken(f.id);
    if (!seen.has(token)) { entries.push({ type: "folder", id: f.id, folder: f }); seen.add(token); }
  }
  return entries;
}

export const entriesToOrder = (entries) =>
  entries.map((e) => (e.type === "folder" ? folderToken(e.id) : e.url));

const removeFromFolders = (folders, url) =>
  folders.map((f) => (f.items.includes(url) ? { ...f, items: f.items.filter((u) => u !== url) } : f));

export function removeUrlEverywhere(order, folders, url) {
  return {
    order: order.filter((e) => e !== url),
    folders: removeFromFolders(folders, url),
  };
}

export function movePageToFolder(state, url, folderId, index = null) {
  const { order, folders } = removeUrlEverywhere(state.order, state.folders, url);
  return {
    order,
    folders: folders.map((f) => {
      if (f.id !== folderId) return f;
      const items = [...f.items];
      items.splice(index == null ? items.length : index, 0, url);
      return { ...f, items };
    }),
  };
}

export function movePageToTop(state, url, index) {
  const { order, folders } = removeUrlEverywhere(state.order, state.folders, url);
  const next = [...order];
  next.splice(index == null ? next.length : index, 0, url);
  return { order: next, folders };
}

export function createFolder(state, folder) {
  return { order: [...state.order, folderToken(folder.id)], folders: [...state.folders, folder] };
}

export function patchFolder(state, id, patch) {
  return { order: state.order, folders: state.folders.map((f) => (f.id === id ? { ...f, ...patch, id } : f)) };
}

// Deleting a folder returns its pages to the bar (appended to the order tail).
export function deleteFolder(state, id) {
  const folder = state.folders.find((f) => f.id === id);
  if (!folder) return state;
  const orphanUrls = new Set(folder.items);
  const nextFolders = state.folders
    .filter((f) => f.id !== id)
    .map((f) => ({ ...f, items: f.items.filter((u) => !orphanUrls.has(u) || u === f.id) }));
  const order = state.order.filter((e) => e !== folderToken(id) && !orphanUrls.has(e));
  return { order: [...order, ...folder.items], folders: nextFolders };
}

export const newFolderId = () => `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// ---- Visual style registry ----

const shade = (hex, amt) => {
  const n = Number.parseInt(String(hex).replace("#", ""), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, "0")}`;
};

const luminance = (hex) => {
  const n = Number.parseInt(String(hex).replace("#", ""), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

export const readableText = (hex) => (luminance(hex) > 0.55 ? "#0f172a" : "#f8fafc");

const a = (hex, alpha) => `${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;

// Inline style overrides keyed on the accent color. "glass" = the stock shell
// look (no override); the rest give each button a distinct personality.
export const NAV_STYLE_PRESETS = [
  { id: "glass", name: "Glass", make: (c) => ({ style: {}, textColor: null }) },
  { id: "solid", name: "Solid", make: (c) => ({ style: { background: c, borderColor: shade(c, -30), boxShadow: `0 2px 10px ${a(c, 0.45)}` }, textColor: readableText(c) }) },
  { id: "soft", name: "Soft", make: (c) => ({ style: { background: a(c, 0.16), borderColor: a(c, 0.45) }, textColor: c }) },
  { id: "outline", name: "Outline", make: (c) => ({ style: { background: "transparent", borderColor: c, borderWidth: 1.5 } , textColor: c }) },
  { id: "glow", name: "Glow", make: (c) => ({ style: { background: a(c, 0.12), borderColor: a(c, 0.7), boxShadow: `0 0 12px ${a(c, 0.55)}, inset 0 0 8px ${a(c, 0.25)}` }, textColor: c }) },
  { id: "gradient", name: "Gradient", make: (c) => ({ style: { background: `linear-gradient(135deg, ${shade(c, 30)}, ${shade(c, -35)})`, borderColor: shade(c, -50), boxShadow: `0 2px 10px ${a(c, 0.4)}` }, textColor: readableText(shade(c, -20)) }) },
  { id: "flat", name: "Flat", make: (c) => ({ style: { background: a(c, 0.22), borderColor: "transparent" }, textColor: c }) },
  { id: "neon", name: "Neon", make: (c) => ({ style: { background: "#0b0e1a", borderColor: c, boxShadow: `0 0 14px ${a(c, 0.6)}, inset 0 0 6px ${a(c, 0.3)}` }, textColor: c }) },
  { id: "pill", name: "Pill", make: (c) => ({ style: { background: a(c, 0.18), borderColor: a(c, 0.5), borderRadius: 999 }, textColor: c }) },
  { id: "carbon", name: "Carbon", make: (c) => ({ style: { background: "linear-gradient(180deg,#334155,#0f172a)", borderColor: a(c, 0.6), boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 8px ${a(c, 0.3)}` }, textColor: c }) },
  { id: "underline", name: "Underline", make: (c) => ({ style: { background: "transparent", borderColor: "transparent", borderBottomColor: c, borderBottomWidth: 2, borderRadius: 4 }, textColor: c }) },
  { id: "frost", name: "Frost", make: (c) => ({ style: { background: `linear-gradient(135deg, ${a(c, 0.3)}, rgba(255,255,255,0.06))`, borderColor: a(c, 0.35), backdropFilter: "blur(6px)" }, textColor: c }) },
];

export const NAV_STYLE_IDS = NAV_STYLE_PRESETS.map((p) => p.id);
export const presetFor = (id) => NAV_STYLE_PRESETS.find((p) => p.id === id) || NAV_STYLE_PRESETS[0];

// Returns { style, textColor } to merge onto the nav button.
export function navButtonStyle(styleId, color) {
  return presetFor(styleId).make(color || "#94A3B8");
}

export const NAV_COLOR_PALETTE = [
  "#F87171", "#FB7185", "#F472B6", "#E879F9", "#C084FC", "#A78BFA",
  "#818CF8", "#60A5FA", "#38BDF8", "#22D3EE", "#2DD4BF", "#34D399",
  "#4ADE80", "#A3E635", "#FACC15", "#FBBF24", "#FB923C", "#F97316",
  "#94A3B8", "#CBD5E1", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6",
];

// Icon choices for folders — components imported by the editor/pill.
export const NAV_FOLDER_ICONS = [
  "Folder", "FolderOpen", "Star", "Bookmark", "Calendar", "BarChart3", "Zap",
  "Archive", "Briefcase", "Flag", "Layers", "Tag", "Target", "Users", "Wrench",
  "Globe", "Camera", "Coffee", "Heart", "Home", "Music", "Settings", "Gift", "Bell",
];
