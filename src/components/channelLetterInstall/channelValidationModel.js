// P-06 (WS-P): deterministic set validation — material/mount/illumination
// compatibility, size/stock availability, access/crew/equipment reach,
// electrical/load assumptions, and missing prices. Every check emits a
// severity-tagged issue; `ready` fails closed on any blocking issue.
// No check invents configuration: missing stock/price/product data is a
// named issue, never a pass.
export const CHANNEL_VALIDATION_VERSION = 1;

const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const LIT = new Set(["front_lit", "halo_lit", "front_and_halo"]);

// Reach rule mirrors equipmentSuggester: max_height_feet >= height + margin (default 2ft).
const liftReaches = (e, heightFt) =>
  (parseFloat(e.max_height_feet) || 0) >= heightFt + (Number.isFinite(parseFloat(e.vertical_reach_safety_margin_feet)) ? parseFloat(e.vertical_reach_safety_margin_feet) : 2);

const materialAppliesTo = (m, installType) => {
  if (!installType) return true;
  if (m.applies_to === "all") return true;
  const list = Array.isArray(m.applies_to_list) && m.applies_to_list.length ? m.applies_to_list : (m.applies_to ? [m.applies_to] : []);
  return list.includes(installType);
};

export function validateChannelSet(spec = {}, takeoff = null, env = {}) {
  const issues = [];
  const add = (kind, field, message, severity) => issues.push({ kind, field, message, severity });
  const lit = LIT.has(spec.illumination);
  const installType = spec.installation_type || spec.letter_type;

  // --- Material/mount/illumination compatibility ---
  for (const m of env.materials || []) {
    if (!materialAppliesTo(m, installType)) {
      add("incompatible_material", m.name || m.item || "material", `Material '${m.name || m.item}' does not apply to install type '${installType}'.`, "blocking");
    }
  }
  if (lit && spec.illumination === "halo_lit" && installType === "flush_mount") {
    add("conflict", "illumination", "Halo-lit illumination requires standoff/backer mounting — flush mount blocks the glow.", "blocking");
  }
  if (!lit && (env.product?.led_modules_per_foot || env.product?.led_watts_per_module)) {
    add("conflict", "illumination", "LED product data supplied for an unlit set.", "warning");
  }
  if (spec.raceway === true && num(spec.raceway_length_feet) === null) {
    add("missing", "raceway_length_feet", "Raceway mount declared without a length.", "blocking");
  }

  // --- Size/stock ---
  const h = num(spec.letter_height_inches);
  const maxH = num(env.product?.max_letter_height_inches) ?? num(env.product?.face_sheet_max_inches);
  if (h !== null && maxH !== null && h > maxH) {
    add("size_exceeds_stock", "letter_height_inches", `Letter height ${h}" exceeds stock limit ${maxH}".`, "blocking");
  }
  const stock = env.stock || {};
  for (const r of takeoff?.rows || []) {
    if (r.qty === null || r.qty === undefined) continue;
    const avail = num(stock[r.item]);
    if (avail === null) {
      add("unverified_stock", r.item, `No stock figure for '${r.item}' — availability unverified.`, "assumption");
    } else if (r.qty > avail) {
      add("stock_shortage", r.item, `Need ${r.qty} ${r.unit} of '${r.item}' — only ${avail} in stock.`, "blocking");
    }
  }

  // --- Access/crew/equipment ---
  const heightFt = num(spec.install_height_feet) ?? (num(spec.install_height_inches) !== null ? num(spec.install_height_inches) / 12 : null);
  if (heightFt !== null) {
    const inventory = env.equipment || [];
    if (!inventory.length) {
      add("unverified_access", "install_height", `Install height ${heightFt}ft with no equipment inventory loaded — access unverified.`, "assumption");
    } else if (!inventory.some((e) => liftReaches(e, heightFt))) {
      add("access_block", "install_height", `No equipment in inventory reaches ${heightFt}ft (incl. safety margin).`, "blocking");
    }
  }
  const reqCrew = num(spec.required_crew); const crew = num(spec.crew_assigned);
  if (reqCrew !== null && (crew === null || crew < reqCrew)) {
    add("crew_shortage", "crew", `Set requires ${reqCrew} crew — ${crew === null ? "none" : crew} assigned.`, "blocking");
  }

  // --- Electrical/load ---
  if (lit) {
    const unresolvedElec = (takeoff?.rows || []).some((r) => r.category === "electrical" && r.qty === null);
    if (unresolvedElec) add("electrical_unresolved", "electrical", "Lit set with unresolved LED/power-supply quantities.", "blocking");
    const loadW = num(env.electrical?.load_watts); const capW = num(env.electrical?.circuit_capacity_watts);
    if (loadW !== null && capW !== null && loadW > capW) {
      add("electrical_overload", "load", `LED load ${loadW}W exceeds circuit capacity ${capW}W.`, "blocking");
    }
    if (!spec.electrical_scope) {
      add("assumption", "electrical_scope", "Lit set without an electrical scope — power source/routing unverified.", "assumption");
    }
  }

  // --- Missing prices ---
  const prices = env.prices || {};
  for (const r of takeoff?.rows || []) {
    if (r.qty === null || r.qty === undefined) continue;
    if (num(prices[r.item]) === null) {
      add("missing_price", r.item, `No unit price for '${r.item}'.`, "warning");
    }
  }

  const blocking = issues.filter((i) => i.severity === "blocking");
  return { version: CHANNEL_VALIDATION_VERSION, ready: blocking.length === 0, blocking_count: blocking.length, issues };
}
