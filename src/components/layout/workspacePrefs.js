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

// Density multiplies the rem root — Tailwind spacing is rem-based, so this
// genuinely tightens/loosens the whole interface, not just a DOM attribute.
const DENSITY_SCALE = { compact: 0.93, comfortable: 1, spacious: 1.07 };

// "#RRGGBB" -> "H S% L%" triplet matching the shadcn CSS-var convention.
function hexToHslTriplet(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return `${h.toFixed(0)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
}

// Light accents (e.g. amber) need dark text on primary surfaces for contrast.
function accentNeedsDarkText(hex) {
  const l = parseFloat((hexToHslTriplet(hex) || "0 0% 0%").split(" ")[2]);
  return l >= 58;
}

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
      folders: null,             // null = built-ins (Meetings/Reports); array = user's folder set
      pageStyles: {},            // url → {name?, color?, style?} page-button overrides
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
    // K-03 account subtrees — owned semantically by
    // account/userPrefsModel.js; mirrored here so migratePrefs keeps them
    // normalized through every save and resetAll restores them.
    locale: {
      timezone: "",            // IANA name; "" = browser local (#488 userDateDisplay)
    },
    queues: {
      defaultLens: "",         // "" = app default (design); else design|production|fulfillment|all
      myQueueOnly: false,      // true → queue pages open filtered to "assigned to me"
    },
  };
}

// Product Queues tab keys (src/pages/ProductQueues.jsx QUEUES) — duplicated
// here because this model stays import-free; keep in sync with
// userPrefsModel.ACCOUNT_QUEUE_LENSES.
const QUEUE_LENS_KEYS = ["design", "production", "fulfillment", "all"];

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
  locale: ["locale"],
  queues: ["queues"],
};

// Built-in profile presets — applied as one-shot blobs via patchPrefs.
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
    nav[key] = nav[key].filter((u) =>
      typeof u === "string" && (u.startsWith("/") || (key === "order" && u.startsWith("folder:"))));
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
  // User nav folders (null = built-ins). Shape: [{id,name,color,style,icon,items[]}].
  if (nav.folders != null && !Array.isArray(nav.folders)) nav.folders = null;
  if (Array.isArray(nav.folders)) {
    nav.folders = nav.folders.filter((f) => f && typeof f.id === "string").map((f) => ({
      id: f.id,
      name: String(f.name || "Folder").slice(0, 30),
      color: typeof f.color === "string" ? f.color : "#8B5CF6",
      style: typeof f.style === "string" ? f.style : "glass",
      icon: typeof f.icon === "string" ? f.icon : "Folder",
      items: Array.isArray(f.items) ? f.items.filter((u) => typeof u === "string" && u.startsWith("/")) : [],
    })).slice(0, 20);
  }
  if (!isObj(nav.pageStyles)) nav.pageStyles = {};
  if (nav.landingPage && !NAV_CATALOG.some((i) => i.url === nav.landingPage)) nav.landingPage = "";
  if (!isObj(merged.pipeline)) merged.pipeline = base.pipeline;
  if (!["", "table", "board", "daily", "insights"].includes(merged.pipeline.defaultView)) merged.pipeline.defaultView = "";
  if (!isObj(merged.workflow)) merged.workflow = base.workflow;
  if (typeof merged.workflow.stageFilter !== "string" || !merged.workflow.stageFilter || merged.workflow.stageFilter.length > 80) merged.workflow.stageFilter = "all";
  // K-03 account subtrees — IANA validity is enforced at read time
  // (account/userPrefsModel.normalizeTimezone + userDateDisplay
  // resolveUserTimeZone); the blob keeps the trimmed string so an unknown
  // zone degrades to browser-local instead of vanishing.
  if (!isObj(merged.locale)) merged.locale = base.locale;
  if (typeof merged.locale.timezone !== "string") merged.locale.timezone = "";
  merged.locale.timezone = merged.locale.timezone.trim().slice(0, 64);
  if (!isObj(merged.queues)) merged.queues = base.queues;
  if (!QUEUE_LENS_KEYS.includes(String(merged.queues.defaultLens || ""))) merged.queues.defaultLens = "";
  merged.queues.myQueueOnly = merged.queues.myQueueOnly === true;
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
  const densScale = DENSITY_SCALE[prefs.density] || 1;
  root.style.fontSize = `${(16 * scale * densScale).toFixed(2)}px`;
  root.dataset.density = prefs.density || "comfortable";
  root.dataset.ccsAccent = a.accent || "indigo";
  const accentHex = ACCENTS[a.accent] || ACCENTS.indigo;
  root.style.setProperty("--ccs-accent", accentHex);
  // Non-default accents re-theme the shared --primary ramp (buttons, switches,
  // checkboxes, badges) so the pick has a real visual effect. Default keeps the
  // base theme by removing the inline override.
  if (a.accent && a.accent !== "indigo" && ACCENTS[a.accent]) {
    root.style.setProperty("--primary", hexToHslTriplet(accentHex));
    root.style.setProperty("--primary-foreground", accentNeedsDarkText(accentHex) ? "0 0% 9%" : "0 0% 98%");
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-foreground");
  }
  root.toggleAttribute("data-reduced-motion", !!a.reducedMotion);
  root.toggleAttribute("data-high-contrast", !!a.highContrast);
}

export function newRequestId() {
  return `uwp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}