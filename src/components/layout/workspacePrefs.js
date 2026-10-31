// Personal Workspace preference model — defaults, deep-merge, migration and
// DOM side-effect application. The blob lives server-side on
// UserWorkspacePreferences.preferences (backend-only); this module is the
// single source of truth for its shape. Bump PREFS_VERSION and extend
// migratePrefs() when adding fields.

export const PREFS_VERSION = 1;
export const NAV_CATALOG = [
  { url: "/myworkflow", title: "My Workflow" },
  { url: "/mainworkflow", title: "Main Workflow" },
  { url: "/salespipeline", title: "Sales Pipeline" },
  { url: "/opportunities", title: "Opportunities" },
  { url: "/estimating", title: "Estimating" },
  { url: "/permitting", title: "Permitting" },
  { url: "/design", title: "Design" },
  { url: "/production", title: "Production" },
  { url: "/fabrication", title: "Fabrication" },
  { url: "/installationdeliver", title: "Installation/Delivery" },
  { url: "/sop", title: "SOP" },
  { url: "/orderform", title: "Order Form" },
  { url: "/estimator", title: "Estimator" },
  { url: "/fleetoverview", title: "Fleet" },
  { url: "/sips", title: "SIPs" },
  { url: "/mondaymorningmeeting", title: "Monday Meeting" },
  { url: "/financials", title: "Financials" },
  { url: "/invoices", title: "Invoices" },
  { url: "/timeclock", title: "Time Clock" },
];

export const ACCENTS = {
  indigo: "#6366F1", sky: "#0EA5E9", emerald: "#10B981",
  amber: "#F59E0B", violet: "#8B5CF6", rose: "#F43F5E",
};

export function defaultPrefs() {
  return {
    version: PREFS_VERSION,
    appearance: {
      mode: "system",            // system | light | dark
      accent: "indigo",
      fontScale: 1,              // 0.9 - 1.15 (rem base scale)
      reducedMotion: false,
      highContrast: false,
    },
    density: "comfortable",      // compact | comfortable | spacious
    navigation: {
      order: [],                 // taskbar urls, server-authoritative
      orderUpdatedAt: null,
      hidden: [],                // urls removed from taskbar (still routable)
      favorites: [],             // pinned to the front of the taskbar
      labels: "full",            // full | abbreviated | icons
      tooltips: true,
      size: "auto",              // auto | compact | roomy
      landingPage: "",           // url opened on login ("" = default)
      collapsedGroups: {},       // side-nav group collapse memory (meetings/reports…)
    },
    workspace: {
      showWelcomeBanner: true,
    },
    pipeline: {
      defaultView: "",        // "" = app default; table | board | daily | insights
    },
    workflow: {
      stageFilter: "all",      // My Workflow stage dropdown — remembers last pick
    },
  };
}

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

export function deepMerge(base, patch) {
  if (!isObj(base)) return isObj(patch) ? deepMerge({}, patch) : patch;
  const out = { ...base };
  if (!isObj(patch)) return out;
  for (const key of Object.keys(patch)) {
    const b = base[key], p = patch[key];
    out[key] = isObj(b) && isObj(p) ? deepMerge(b, p) : p;
  }
  return out;
}

export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split(".");
  const out = { ...obj };
  let node = out;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    node[k] = isObj(node[k]) ? { ...node[k] } : {};
    node = node[k];
  }
  node[keys[keys.length - 1]] = value;
  return out;
}

// SECTION_PATHS maps Settings Center sections to blob subtrees for reset.
export const SECTION_PATHS = {
  appearance: ["appearance", "density"],
  navigation: ["navigation"],
  workspace: ["workspace"],
  pipeline: ["pipeline"],
  workflow: ["workflow"],
};

// Built-in profile presets — applied as one-shot blobs via applyProfilePreset.
export const PROFILE_PRESETS = [
  {
    key: "focus",
    name: "Focus",
    description: "Compact density, short labels, minimal chrome",
    prefs: {
      density: "compact",
      navigation: { labels: "abbreviated", size: "compact", tooltips: true },
    },
  },
  {
    key: "presentation",
    name: "Presentation",
    description: "Spacious density, larger text — for screens and sharing",
    prefs: {
      density: "spacious",
      appearance: { fontScale: 1.1 },
      navigation: { labels: "full", size: "roomy", tooltips: true },
    },
  },
  {
    key: "field",
    name: "Field Tablet",
    description: "Big touch targets, icons only, dark-friendly",
    prefs: {
      density: "comfortable",
      navigation: { labels: "icons", size: "roomy", tooltips: true },
    },
  },
];

export function migratePrefs(raw) {
  const base = defaultPrefs();
  if (!isObj(raw)) return base;
  const merged = deepMerge(base, raw);
  merged.version = PREFS_VERSION;
  const nav = merged.navigation;
  for (const key of ["order", "hidden", "favorites"]) {
    if (!Array.isArray(nav[key])) nav[key] = [];
    nav[key] = nav[key].filter((u) => typeof u === "string" && u.startsWith("/"));
  }
  // Favorites always stay visible and cannot duplicate the hidden list.
  nav.hidden = nav.hidden.filter((u) => !nav.favorites.includes(u));
  if (!["full", "abbreviated", "icons"].includes(nav.labels)) nav.labels = "full";
  if (!["auto", "compact", "roomy"].includes(nav.size)) nav.size = "auto";
  if (!["system", "light", "dark"].includes(merged.appearance.mode)) merged.appearance.mode = "system";
  merged.appearance.fontScale = Math.min(1.15, Math.max(0.9, Number(merged.appearance.fontScale) || 1));
  if (!ACCENTS[merged.appearance.accent]) merged.appearance.accent = "indigo";
  if (!["compact", "comfortable", "spacious"].includes(merged.density)) merged.density = "comfortable";
  if (!isObj(nav.collapsedGroups)) nav.collapsedGroups = {};
  if (nav.landingPage && !NAV_CATALOG.some((i) => i.url === nav.landingPage)) nav.landingPage = "";
  if (!isObj(merged.pipeline)) merged.pipeline = base.pipeline;
  if (!["", "table", "board", "daily", "insights"].includes(merged.pipeline.defaultView)) merged.pipeline.defaultView = "";
  if (!isObj(merged.workflow)) merged.workflow = base.workflow;
  if (typeof merged.workflow.stageFilter !== "string" || !merged.workflow.stageFilter || merged.workflow.stageFilter.length > 80) merged.workflow.stageFilter = "all";
  return merged;
}

const LS_KEY = (email) => `ccsWorkspacePrefs:${String(email || "").toLowerCase()}`;
const LS_ORDER_AT = (email) => `ccsNavOrderAt:${String(email || "").toLowerCase()}`;

export function localLoadPrefs(email) {
  try {
    const raw = localStorage.getItem(LS_KEY(email));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function localSavePrefs(email, prefs, profiles) {
  try {
    localStorage.setItem(LS_KEY(email), JSON.stringify({ prefs, profiles, at: Date.now() }));
  } catch { /* storage full/blocked — server still wins on next load */ }
}

export function localOrderStamp(email) {
  try { return localStorage.getItem(LS_ORDER_AT(email)) || ""; } catch { return ""; }
}
export function saveOrderStamp(email, iso) {
  try { localStorage.setItem(LS_ORDER_AT(email), iso); } catch {}
}

// Apply visual prefs to the document. Called on every prefs change — cheap
// DOM writes only; React state stays the source of truth for everything else.
let mediaListenerBound = false;
export function applyAppearance(prefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const a = prefs.appearance || {};
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const dark = a.mode === "dark" || (a.mode !== "light" && prefersDark);
  root.classList.toggle("dark", dark);
  try { localStorage.setItem("darkMode", dark ? "true" : "false"); } catch {}
  if (!mediaListenerBound && window.matchMedia) {
    mediaListenerBound = true;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      try {
        const mode = JSON.parse(localStorage.getItem("ccsWorkspacePrefs:__mode__") || '"system"');
        if (mode === "system") {
          const d = window.matchMedia("(prefers-color-scheme: dark)").matches;
          root.classList.toggle("dark", d);
          localStorage.setItem("darkMode", d ? "true" : "false");
        }
      } catch {}
    });
  }
  try { localStorage.setItem("ccsWorkspacePrefs:__mode__", JSON.stringify(a.mode || "system")); } catch {}
  const scale = Math.min(1.15, Math.max(0.9, Number(a.fontScale) || 1));
  root.style.fontSize = `${(16 * scale).toFixed(2)}px`;
  root.dataset.density = prefs.density || "comfortable";
  root.dataset.ccsAccent = a.accent || "indigo";
  root.style.setProperty("--ccs-accent", ACCENTS[a.accent] || ACCENTS.indigo);
  root.toggleAttribute("data-reduced-motion", !!a.reducedMotion);
  root.toggleAttribute("data-high-contrast", !!a.highContrast);
}

export function newRequestId() {
  return `uwp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
