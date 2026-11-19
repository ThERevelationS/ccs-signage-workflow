// Pure tag + responsibility helpers for the product queues. Kept React-free
// so the logic is unit-testable under Node.
//
// ProductSubstatus registry rows feed the substatus tag picklist; products
// carry applied tags on products[].quick_tags[]. Responsibility registry rows
// feed the responsibility picker and queue group headers; products carry
// products[].responsibility plus a denormalized responsibility_color.

export const NO_RESPONSIBILITY = "(no responsibility)";
export const DEFAULT_TAG_COLOR = "#64748b"; // slate-500
export const DEFAULT_RESPONSIBILITY_COLOR = "#475569"; // slate-600
export const RESPONSIBILITY_TYPES = ["department", "person", "group"];

const RESPONSIBILITY_TYPE_SET = new Set(RESPONSIBILITY_TYPES);
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const collapseWs = (v) => String(v || "").trim().replace(/\s+/g, " ");

// Canonical compare/dedupe key for a tag: trimmed, whitespace-collapsed,
// case-folded. Display labels keep their own casing.
export function normalizeTag(name) {
  return collapseWs(name).toLowerCase();
}

// Validate a hex color; accepts #rgb / #rrggbb, returns lowercase or fallback.
export function normalizeHex(color, fallback = DEFAULT_TAG_COLOR) {
  const c = collapseWs(color);
  return HEX_RE.test(c) ? c.toLowerCase() : fallback;
}

// Sorted unique tag list for the picklist: product quick_tags ∪ registry
// names, deduped by normalizeTag. Registry rows are seen first so managed
// casing wins over stray product casing; archived rows offer nothing.
export function mergeTagOptions(products = [], registryRows = []) {
  const byKey = new Map();
  for (const row of registryRows || []) {
    if (!row || String(row.status || "active").toLowerCase() === "archived") continue;
    const key = normalizeTag(row.name);
    if (key && !byKey.has(key)) byKey.set(key, collapseWs(row.name));
  }
  for (const p of products || []) {
    const tags = Array.isArray(p?.quick_tags) ? p.quick_tags : [];
    for (const t of tags) {
      const key = normalizeTag(t);
      if (key && !byKey.has(key)) byKey.set(key, collapseWs(t));
    }
  }
  return [...byKey.values()].sort(
    (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b),
  );
}

// Normalize a Responsibility registry row (or bare {name}) for pickers/chips.
export function normalizeResponsibility(row) {
  const r = row || {};
  const rawType = String(r.type || "").toLowerCase();
  return {
    name: collapseWs(r.name),
    color: normalizeHex(r.color, DEFAULT_RESPONSIBILITY_COLOR),
    type: RESPONSIBILITY_TYPE_SET.has(rawType) ? rawType : "department",
  };
}

// Ordered group list for queue headers. Active registry rows form named
// groups ordered by registry.sort (ties alphabetical). Rows whose
// responsibility is blank or matches no ACTIVE registry row fall into a
// trailing "(no responsibility)" catch-all. Groups with no member rows are
// dropped — headers only render where work exists.
export function responsibilityGroups(rows = [], registryRows = []) {
  const groups = new Map(); // normalized name -> group
  (registryRows || [])
    .filter((r) => r && String(r.status || "active").toLowerCase() !== "archived")
    .forEach((r, idx) => {
      const norm = normalizeResponsibility(r);
      const key = norm.name.toLowerCase();
      if (key && !groups.has(key)) {
        const sort = Number.isFinite(Number(r.sort)) ? Number(r.sort) : 0;
        groups.set(key, { key, name: norm.name, color: norm.color, type: norm.type, sort, index: idx, rows: [] });
      }
    });
  const unassigned = {
    key: "", name: NO_RESPONSIBILITY, color: DEFAULT_RESPONSIBILITY_COLOR,
    type: "none", sort: Number.MAX_SAFE_INTEGER, rows: [],
  };
  for (const row of rows || []) {
    const key = collapseWs(row?.responsibility).toLowerCase();
    (groups.get(key) || unassigned).rows.push(row);
  }
  const named = [...groups.values()]
    .filter((g) => g.rows.length > 0)
    .sort((a, b) =>
      (a.sort - b.sort) ||
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
      (a.index - b.index));
  const out = named.map((g) => ({
    key: g.key, name: g.name, color: g.color, type: g.type,
    sort: g.sort, count: g.rows.length, rows: g.rows,
  }));
  if (unassigned.rows.length > 0) {
    out.push({
      key: unassigned.key, name: unassigned.name, color: unassigned.color,
      type: unassigned.type, sort: unassigned.sort,
      count: unassigned.rows.length, rows: unassigned.rows,
    });
  }
  return out;
}

// --- contrast-safe chip colors -------------------------------------------

function hexToRgb(hex) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// sRGB relative luminance (WCAG) — 0 black, 1 white.
function relativeLuminance({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function shade(hex, factor) {
  const rgb = hexToRgb(hex);
  const c = (k) => Math.max(0, Math.min(255, Math.round(rgb[k] * factor)));
  const to2 = (v) => v.toString(16).padStart(2, "0");
  return `#${to2(c("r"))}${to2(c("g"))}${to2(c("b"))}`;
}

const CHIP_TEXT_LIGHT = "#ffffff";
const CHIP_TEXT_DARK = "#111827"; // gray-900
const DARK_TEXT_LUM = relativeLuminance(hexToRgb(CHIP_TEXT_DARK));

// Chip style for a tag/responsibility color: solid background, text picked
// by whichever of white/dark gives the better WCAG contrast ratio against
// the background luminance, border = 25% darkened shade of the background.
export function chipStyle(color) {
  const hex = normalizeHex(color);
  const lum = relativeLuminance(hexToRgb(hex));
  const whiteContrast = 1.05 / (lum + 0.05);
  const darkContrast = (lum + 0.05) / (DARK_TEXT_LUM + 0.05);
  return {
    background: hex,
    color: whiteContrast >= darkContrast ? CHIP_TEXT_LIGHT : CHIP_TEXT_DARK,
    border: `1px solid ${shade(hex, 0.75)}`,
  };
}
