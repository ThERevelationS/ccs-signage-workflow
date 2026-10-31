// Personal Workspace preference model — defaults, deep-merge, migration and
// DOM side-effect application. The blob lives server-side on
// UserWorkspacePreferences.preferences (backend-only); this module is the
// single source of truth for its shape. Bump PREFS_VERSION and extend
// migratePrefs() when adding fields.

export const PREFS_VERSION = 1;
export const NAV_CATALOG = [
  { url: "/MyWorkflow", title: "My Workflow" },
  { url: "/MainWorkflow", title: "Main Workflow" },
  { url: "/SalesPipeline", title: "Sales Pipeline" },
  { url: "/Opportunities", title: "Opportunities" },
  { url: "/Estimating", title: "Estimating" },
  { url: "/Permitting", title: "Permitting" },
  { url: "/Design", title: "Design" },
  { url: "/Production", title: "Production" },
  { url: "/Fabrication", title: "Fabrication" },
  { url: "/InstallationDeliver", title: "Installation/Delivery" },
  { url: "/SOP", title: "SOP" },
  { url: "/OrderForm", title: "Order Form" },
  { url: "/Estimator", title: "Estimator" },
  { url: "/FleetOverview", title: "Fleet" },
  { url: "/SIPs", title: "SIPs" },
  { url: "/MondayMorningMeeting", title: "Monday Meeting" },
  { url: "/Financials", title: "Financials" },
  { url: "/Invoices", title: "Invoices" },
  { url: "/TimeClock", title: "Time Clock" },
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
    },
    workspace: {
      showWelcomeBanner: true,
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
};

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
  if (nav.landingPage && !NAV_CATALOG.some((i) => i.url === nav.landingPage)) nav.landingPage = "";
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
