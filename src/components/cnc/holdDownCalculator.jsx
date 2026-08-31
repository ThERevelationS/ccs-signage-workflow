// ============================================================================
// CNC HOLD-DOWN ADVISOR — pure calculation logic (no UI)
//
// Evaluates a CNC item's machining parameters and recommends a hold-down
// strategy. Distinguishes NORMAL hold-down (standard vacuum/clamps) from
// ENHANCED hold-down (tabs, onion skin, adhesive, reduced final pass) for
// high-risk small-detail jobs. Advisory only — does NOT affect cost math.
//
// Mirrored in the Formula Viewer (CNCFormulas → Hold-Down section).
// ============================================================================

// "3/4" → 0.75, "1-1/4" → 1.25, "2" → 2
export const parseThicknessInches = (str) => {
  if (typeof str === "number") return str;
  if (!str) return 0;
  const s = String(str).trim();
  const m = s.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (m) return parseInt(m[1]) + parseInt(m[2]) / parseInt(m[3]);
  const f = s.match(/^(\d+)\/(\d+)$/);
  if (f) return parseInt(f[1]) / parseInt(f[2]);
  return parseFloat(s) || 0;
};

// Material behavior table (heuristic properties for hold-down planning)
export const HOLD_DOWN_MATERIALS = {
  Acrylic:  { onionSkin: 0.030, forceFactor: 1.0, notes: ["Brittle — undersized tabs snap; keep tabs on straight segments."] },
  Wood:     { onionSkin: 0.040, forceFactor: 0.9, notes: [] },
  MDF:      { onionSkin: 0.040, forceFactor: 0.8, notes: ["MDF is porous — vacuum loses ~30-50% holding force. Seal the spoilboard or add gasketing."] },
  Plywood:  { onionSkin: 0.040, forceFactor: 0.9, notes: [] },
  PVC:      { onionSkin: 0.030, forceFactor: 0.7, notes: ["Lightweight — small offcuts lift easily; onion skin strongly preferred over tabs alone."] },
  HDPE:     { onionSkin: 0.035, forceFactor: 0.7, notes: ["Slippery surface — tape adhesion is reduced; prefer vacuum + onion skin."] },
  Aluminum: { onionSkin: 0.020, forceFactor: 1.6, notes: ["Metal onion skins are hard to deburr — prefer tabs plus adhesive backing."] },
  Corian:   { onionSkin: 0.030, forceFactor: 1.2, notes: ["Dense/heavy — cutting forces are high; use full-width tabs."] },
};

export const WORKHOLDING_OPTIONS = [
  { value: "vacuum_full", label: "Full-bed vacuum", score: -2 },
  { value: "vacuum_zoned", label: "Zoned/pod vacuum", score: -1 },
  { value: "tape_glue", label: "Tape / glue-down", score: -1 },
  { value: "screws", label: "Screws to spoilboard", score: 0 },
  { value: "clamps", label: "Edge clamps only", score: 1 },
  { value: "none", label: "None / unsure", score: 3 },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Evaluate hold-down strategy for one CNC item.
 *
 * @param {object} input
 *   item_type: 'panel' | 'lettering' | '3d_carving'
 *   material_type, material_thickness (fraction string or number)
 *   length, width           (panel, inches)
 *   letter_height, num_letters (lettering)
 *   carve_area_sqin, carve_depth (3d_carving)
 *   cutter_diameter_in      (required)
 *   smallest_detail_in      (narrowest stroke/feature; required for lettering & carving)
 *   workholding_method      (required — one of WORKHOLDING_OPTIONS values)
 *   creates_loose_pieces    (boolean)
 *   force_enhanced          (user override — always show enhanced plan)
 *   letter_perimeter_factor (optional, defaults 3.5 — same as estimator)
 *
 * @returns {{ missing: string[] }} when inputs are insufficient, otherwise
 *   { missing: [], strategy, riskLevel, riskScore, reasons, plan, warnings }
 */
export function evaluateHoldDown(input) {
  const thickness = parseThicknessInches(input.material_thickness);
  const cutter = Number(input.cutter_diameter_in) || 0;
  const detail = Number(input.smallest_detail_in) || 0;
  const type = input.item_type || "panel";

  // ---- 1. Identify missing inputs (never invent values) --------------------
  const missing = [];
  if (!input.material_type || !HOLD_DOWN_MATERIALS[input.material_type]) missing.push("Material type");
  if (!(thickness > 0)) missing.push("Material thickness");
  if (!(cutter > 0)) missing.push("Cutter diameter");
  if (!input.workholding_method) missing.push("Workholding method");
  if (type === "panel" && (!(Number(input.length) > 0) || !(Number(input.width) > 0))) missing.push("Panel length & width");
  if (type === "lettering" && !(Number(input.letter_height) > 0)) missing.push("Letter height");
  if ((type === "lettering" || type === "3d_carving") && !(detail > 0)) missing.push("Smallest detail width");
  if (type === "3d_carving" && !(Number(input.carve_area_sqin) > 0)) missing.push("Carve area");
  if (missing.length) return { missing };

  const mat = HOLD_DOWN_MATERIALS[input.material_type];
  const workholding = WORKHOLDING_OPTIONS.find((w) => w.value === input.workholding_method);

  // ---- 2. Geometry proxies --------------------------------------------------
  // Footprint of the smallest individual piece the cut produces (sq in)
  let holdArea, perimeter, partLabel;
  const perimFactor = Number(input.letter_perimeter_factor) || 3.5;
  if (type === "lettering") {
    const h = Number(input.letter_height);
    holdArea = h * h * 0.5;               // avg letter footprint ≈ ½ h²
    perimeter = h * perimFactor;          // per letter — same factor as the estimator
    partLabel = "letter";
  } else if (type === "3d_carving") {
    const a = Number(input.carve_area_sqin);
    holdArea = a;
    perimeter = 4 * Math.sqrt(a);
    partLabel = "carving";
  } else {
    const L = Number(input.length), W = Number(input.width);
    holdArea = L * W;
    perimeter = 2 * (L + W);
    partLabel = "part";
  }
  const cutDepth = type === "3d_carving" ? (Number(input.carve_depth) || thickness) : thickness;
  const loosePieces = type === "lettering" ? true : !!input.creates_loose_pieces;
  // Cutting-force proxy: engagement area × material factor
  const forceProxy = cutter * cutDepth * mat.forceFactor;

  // ---- 3. Risk scoring -------------------------------------------------------
  let score = 0;
  const reasons = [];

  if (holdArea < 4) { score += 3; reasons.push(`Very small ${partLabel} footprint (~${r3(holdArea)} in²) — too little surface for vacuum/friction alone.`); }
  else if (holdArea < 12) { score += 2; reasons.push(`Small ${partLabel} footprint (~${r3(holdArea)} in²) — marginal holding surface.`); }
  else if (holdArea < 36) { score += 1; reasons.push(`Moderate ${partLabel} footprint (~${r3(holdArea)} in²).`); }

  if (detail > 0) {
    if (detail < cutter) { score += 3; reasons.push(`Smallest detail (${detail}") is narrower than the cutter (${cutter}") — the cutter cannot form it and detail slivers will break free.`); }
    else if (detail < 2 * cutter) { score += 2; reasons.push(`Smallest detail (${detail}") is under 2× cutter diameter — thin webs may vibrate or shift.`); }
  }

  if (loosePieces) { score += 2; reasons.push("Cut releases individual loose pieces at cut-through."); }
  if (thickness < 0.25) { score += 1; reasons.push(`Thin stock (${r3(thickness)}") flexes and lifts under upcut spirals.`); }
  if (forceProxy > 2) { score += 2; reasons.push(`High cutting force (cutter ${cutter}" × depth ${r3(cutDepth)}" in ${input.material_type}).`); }
  else if (forceProxy > 1) { score += 1; reasons.push(`Elevated cutting force for ${input.material_type} at this depth.`); }

  score += workholding.score;
  if (workholding.score > 0) reasons.push(`Weak base workholding (${workholding.label}).`);
  else if (workholding.score < 0) reasons.push(`Good base workholding (${workholding.label}) reduces risk.`);

  const riskLevel = score >= 6 ? "high" : score >= 3 ? "elevated" : "normal";
  const enhanced = !!input.force_enhanced || riskLevel !== "normal";

  // ---- 4. Build the plan -----------------------------------------------------
  const warnings = [...mat.notes];
  if (input.workholding_method === "vacuum_full" && input.material_type === "MDF") {
    // covered by material note
  }
  if (input.workholding_method === "clamps" && loosePieces) {
    warnings.push("Edge clamps cannot hold interior loose pieces — they only secure the sheet.");
  }

  if (!enhanced) {
    return {
      missing: [],
      strategy: "normal",
      riskLevel,
      riskScore: score,
      reasons,
      warnings,
      plan: {
        summary: `Standard hold-down is sufficient: ${workholding.label.toLowerCase()} holds this ${partLabel} securely.`,
        items: [
          { label: "Hold-down method", value: workholding.label },
          { label: "Tabs", value: "Not required" },
          { label: "Onion skin", value: "Not required" },
          { label: "Final pass", value: "Cut through at normal feed with a clean spoilboard skim (~0.01\") into the waste board" },
        ],
      },
    };
  }

  // Enhanced plan ---------------------------------------------------------------
  const tabThickness = r3(clamp(thickness * 0.4, 0.04, 0.12));
  const tabWidth = r3(clamp(cutter * 1.5, 0.1875, 0.5));
  const spacingTarget = riskLevel === "high" ? 4 : 6;
  const tabsPerPart = clamp(Math.ceil(perimeter / spacingTarget), riskLevel === "high" ? 3 : 2, 8);
  const tabSpacing = r3(perimeter / tabsPerPart);
  const onionSkin = mat.onionSkin;
  // A part is "too small to tab" when its perimeter can't fit even 2 usable tabs
  const tooSmallToTab = holdArea < 2 || (detail > 0 && detail < 1.5 * cutter) || perimeter < 4 * tabWidth;

  const items = [];
  if (tooSmallToTab) {
    items.push(
      { label: "Tabs", value: "NOT viable — the geometry is smaller than a usable tab. Use adhesive + onion skin instead." },
      { label: "Adhesive", value: input.material_type === "HDPE" ? "High-tack transfer tape has poor grip on HDPE — use vacuum + onion skin, or glue-down with a sacrificial backer" : "High-tack transfer tape or blue-tape + CA glue under the full detail area" },
      { label: "Onion skin", value: input.material_type === "Aluminum" ? `${onionSkin}" skin is hard to deburr in aluminum — leave ${onionSkin}" only if a backer/adhesive is impossible` : `Leave ${onionSkin}" skin over the whole profile; separate parts by hand/razor after unloading` },
    );
  } else {
    items.push(
      { label: "Tabs per " + partLabel, value: `${tabsPerPart}` },
      { label: "Minimum tab size", value: `${tabWidth}" wide × ${tabThickness}" thick` },
      { label: "Tab spacing", value: `≈ every ${tabSpacing}" of profile` },
      { label: "Tab placement", value: "On straight segments, away from corners and fine details; distribute on opposing sides so the part can't pivot" },
      { label: "Onion skin", value: riskLevel === "high" ? `Also leave a ${onionSkin}" skin on the final profile pass (tabs + skin for high risk)` : "Optional — tabs alone are adequate at this risk level" },
    );
  }
  items.push({
    label: "Final-pass strategy",
    value: `Reduce feed to ${riskLevel === "high" ? "50%" : "60%"} on the last ${r3(Math.min(cutDepth, onionSkin * 3))}" of depth; finish with a conventional-milling (not climb) pass so cutter forces push the ${partLabel} into the material`,
  });
  const extraHold = [];
  if (input.workholding_method === "none" || input.workholding_method === "clamps") extraHold.push("add vacuum or full-area tape/glue-down — current workholding does not secure loose pieces");
  if (loosePieces && !tooSmallToTab && riskLevel === "high") extraHold.push("tape over completed letters/parts before the final pass");
  items.push({
    label: "Additional workholding",
    value: extraHold.length ? extraHold.join("; ") : "Not required beyond the plan above",
  });

  return {
    missing: [],
    strategy: "enhanced",
    riskLevel,
    riskScore: score,
    reasons,
    warnings,
    plan: {
      summary: tooSmallToTab
        ? `Enhanced hold-down required (${riskLevel} risk): geometry is too small/detailed for tabs — hold with adhesive and an onion skin, then separate off-machine.`
        : `Enhanced hold-down required (${riskLevel} risk): tab the ${partLabel}s and slow the final pass to prevent movement at cut-through.`,
      items,
    },
  };
}