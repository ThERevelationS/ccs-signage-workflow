// Wall cap pricing - ported from SignEstimate Pro (WallCapsTab.jsx).
// A cut cap piece is always charged at FULL stock price; cuts do not reduce price.
// wallCapInputNumber is the boundary's finite signed basis (CMP-A08).
import { inventoryFiniteNumber as wallCapInputNumber } from "@/components/masterInventory/inventoryNormalization";
export { wallCapInputNumber };
// O-009 tail: catalog lifecycle classification is the single contract â€” a
// resolved-but-inactive/deleted cap row flags catalog_item_inactive /
// catalog_item_deleted instead of silently repricing (the acknowledged
// snapshot holds through the unchanged issues channel). The integrity module
// imports foundationWallCapCatalogIssues back from this file â€” both
// directions are call-time function declarations, so the cycle is eval-safe.
import { foundationCatalogRowAvailability } from "./foundationCatalogIntegrity";
export function wallCapCutLengthValue(cap) {
  if (!cap || typeof cap !== "object" || Array.isArray(cap)) return undefined;
  // Do not replace an explicitly cleared current cut with an old legacy value.
  return Object.prototype.hasOwnProperty.call(cap, "length_inches") ? cap.length_inches : cap.cut_length_inches;
}
// O-051 (CMP-D08) -- the supported cap end-treatment enum, exported so the
// authored domain is documented at the boundary (straight / mitered /
// returned) rather than re-listed in each consumer.
export const WALL_CAP_SUPPORTED_END_TREATMENTS = ["straight", "mitered", "returned"];
const known = value => typeof value === "number" && Number.isFinite(value);
const assigned = id => (typeof id === "string" && id.trim() !== "")
  || (typeof id === "number" && Number.isFinite(id));
const sumKnown = rows => {
  let total = 0;
  for (const row of rows) {
    if (!known(row.cost)) return null;
    total += row.cost;
    if (!Number.isFinite(total)) return null;
  }
  return total;
};

export function calcWallCaps(wallCaps = [], inventory = [], options = {}) {
  const issues = [];
  const explicitSnapshot = Object.prototype.hasOwnProperty.call(options ?? {}, "savedCaps");
  const currentIds = new Map();
  const savedCaps = new Map();
  const componentId = cap => typeof cap?.component_id === "string" && cap.component_id.trim() !== ""
    ? cap.component_id : null;
  if (explicitSnapshot) {
    for (const cap of wallCaps || []) {
      const id = componentId(cap);
      if (id !== null) currentIds.set(id, (currentIds.get(id) || 0) + 1);
    }
    for (const cap of Array.isArray(options.savedCaps) ? options.savedCaps : []) {
      const id = componentId(cap);
      if (id !== null) savedCaps.set(id, savedCaps.has(id) ? null : cap);
    }
  }
  // Edited rows can contain preview prices; they are not acknowledged history.
  const held = cap => {
    const result = { ...cap };
    if (!explicitSnapshot) return result;
    const id = componentId(cap);
    const saved = id !== null && currentIds.get(id) === 1 ? savedCaps.get(id) : null;
    for (const field of ["cost", "cap_name", "stock_length_inches"]) {
      if (saved && Object.prototype.hasOwnProperty.call(saved, field)) result[field] = saved[field];
      else delete result[field];
    }
    return result;
  };
  const caps = (wallCaps || []).map((cap, index) => {
    const id = cap.cap_inventory_id;
    const issue = (field, code, message) => issues.push({
      kind: "wall_cap", index, componentId: cap.component_id ?? cap.id ?? null,
      field, inventoryId: assigned(id) ? id : null, code,
      message: `Wall cap ${index + 1}: ${message}`,
    });
    const matches = assigned(id) ? inventory.filter(row => row?.id === id) : [];
    if (matches.length !== 1) {
      issue("cap_inventory_id", !assigned(id) ? "catalog_item_unassigned"
        : matches.length > 1 ? "catalog_item_ambiguous" : "catalog_item_unavailable",
      !assigned(id) ? "select a catalog material." : matches.length > 1
        ? "the selected catalog ID is ambiguous; refresh the catalog." : "selected catalog material is unavailable.");
      return held(cap);
    }
    const inv = matches[0];
    // O-050 (CMP-D07) -- supported-profile validation: authored profile/slope/
    // end_treatment must be in the supported set; anything else surfaces an
    // advisory issue (never held -- the profile is metadata, not geometry).
    const SUPPORTED_PROFILES = ["flat", "sloped", "beveled", "rounded"];
    const SUPPORTED_SLOPES = ["flat", "single", "double"];
    const SUPPORTED_END_TREATMENTS = WALL_CAP_SUPPORTED_END_TREATMENTS;
    if (cap?.profile != null && cap.profile !== "" && !SUPPORTED_PROFILES.includes(cap.profile)) {
      issue("profile", "wall_cap_profile_unsupported", `profile ${JSON.stringify(cap.profile)} is not a supported cap profile (${SUPPORTED_PROFILES.join(", ")}).`);
    }
    if (cap?.slope != null && cap.slope !== "" && !SUPPORTED_SLOPES.includes(cap.slope)) {
      issue("slope", "wall_cap_slope_unsupported", `slope ${JSON.stringify(cap.slope)} is not a supported cap slope (${SUPPORTED_SLOPES.join(", ")}).`);
    }
    if (cap?.end_treatment != null && cap.end_treatment !== "" && !SUPPORTED_END_TREATMENTS.includes(cap.end_treatment)) {
      issue("end_treatment", "wall_cap_end_treatment_unsupported", `end treatment ${JSON.stringify(cap.end_treatment)} is not a supported cap end treatment (${SUPPORTED_END_TREATMENTS.join(", ")}).`);
    }
    if (inv.material_type !== "wall_cap") {
      issue("cap_inventory_id", "catalog_item_type_mismatch", "the selected catalog material is not a wall cap.");
      return held(cap);
    }
    // O-009 tail: existence -> type -> lifecycle -> consumed basis, the item
    // scan's precedence. A resolved-but-inactive/deleted cap row held a
    // silent full-stock price; flagging keeps the acknowledged snapshot.
    const availability = foundationCatalogRowAvailability(inv);
    if (availability !== "active") {
      issue("cap_inventory_id",
        availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        availability === "deleted"
          ? "the selected catalog material is marked deleted â€” pick a replacement."
          : "the selected catalog material is inactive â€” reactivate it or pick a replacement.");
      return held(cap);
    }
    const firstIssue = issues.length;
    const rate = wallCapInputNumber(inv.cap_stock_price);
    if (rate === null || rate < 0) {
      issue("cap_stock_price", "wall_cap_stock_price_unavailable",
        "record a finite nonnegative full-stock price; a missing price is not zero. Saved amounts are retained.");
    }
    const stockLength = wallCapInputNumber(inv.cap_stock_length_inches);
    const cutLength = wallCapInputNumber(wallCapCutLengthValue(cap));
    if (stockLength === null || stockLength <= 0) {
      issue("cap_stock_length_inches", "wall_cap_stock_length_unavailable",
        "the selected catalog stock length must be a recorded finite positive number. Saved dimensions are not a current stock specification.");
    }
    if (cutLength === null || cutLength <= 0) {
      issue("length_inches", "wall_cap_cut_length_invalid",
        "enter a finite positive cut length in inches. An empty or invalid cut is not changed to a default size.");
    } else if (stockLength !== null && stockLength > 0 && cutLength > stockLength) {
      issue("length_inches", "wall_cap_cut_exceeds_stock",
        `cut length (${cutLength} in) exceeds the selected stock length (${stockLength} in). Choose longer stock or separate pieces; no extra quantity is assumed.`);
    }
    if (issues.length !== firstIssue) return held(cap);
    // O-055 (CMP-D12) -- optional authored installation-supplies + cut-labor
    // cost lines on the cap. Absent = $0 (a cap may have no extras); any
    // authored value must be finite nonnegative or the whole cap's cost holds.
    let extras = 0;
    let extrasInvalid = false;
    for (const p of [cap?.supplies_cost, cap?.cut_labor_cost]) {
      if (p == null || p === "") continue;
      const n = Number(p);
      if (!(Number.isFinite(n) && n >= 0)) { extrasInvalid = true; break; }
      extras += n;
    }
    if (extrasInvalid) return held(cap);
    return {
      ...cap,
      cap_name: inv.material_name || "",
      stock_length_inches: stockLength,
      supplies_cost: cap?.supplies_cost != null && cap.supplies_cost !== "" ? Number(cap.supplies_cost) : undefined,
      cut_labor_cost: cap?.cut_labor_cost != null && cap.cut_labor_cost !== "" ? Number(cap.cut_labor_cost) : undefined,
      cost: rate + extras,
      // O-053 (CMP-D10) -- the reusable offcut after the cut: stockLength -
      // cutLength. Informational only -- the priced contract stays full-stock
      // per cut; the offcut surfaces for the reuse alternative, never priced.
      offcut_inches:
        stockLength !== null && stockLength > 0 && cutLength !== null && cutLength > 0 && cutLength <= stockLength
          ? stockLength - cutLength
          : null,
    };
  });

  const groups = new Map();
  for (const cap of caps) {
    if (!assigned(cap.cap_inventory_id)) continue;
    if (!groups.has(cap.cap_inventory_id)) groups.set(cap.cap_inventory_id, []);
    groups.get(cap.cap_inventory_id).push(cap);
  }
  const byInventory = [...groups].map(([id, rows]) => ({
    id, name: rows[0].cap_name, qty: rows.length, cost: sumKnown(rows),
  }));
  const total = sumKnown(caps);
  if (total === null && caps.every(cap => known(cap.cost))) {
    issues.push({
      kind: "wall_cap", index: 0, componentId: caps[0]?.component_id ?? caps[0]?.id ?? null,
      field: "cost", inventoryId: null, code: "wall_cap_cost_total_invalid",
      message: "Wall cap total is outside the supported numeric range; current pricing is unavailable.",
    });
  }
  return { caps, byInventory, total, issues };
}

export function foundationWallCapCatalogIssues(wallCaps = [], inventory = []) {
  return calcWallCaps(wallCaps, inventory).issues;
}