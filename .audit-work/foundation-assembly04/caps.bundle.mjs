// stub:stub
import React3 from "react";

// src/components/estimator/foundation/FoundationWallCapsPanel.jsx
import { useState as useState2 } from "react";

// uistub:@/components/ui/button
import React from "react";
import { jsx } from "react/jsx-runtime";
var strip = ({ className, variant, size, ...r }) => r;
var Button = (p) => /* @__PURE__ */ jsx("button", { ...strip(p) });

// stub:lucide
var Plus = () => null;
var Trash2 = () => null;

// src/components/masterInventory/inventoryNormalization.js
var STRICT_SIGNED_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
var STRICT_UNSIGNED_EXPONENT = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
var strictNumber = (value, { unsignedExponent = false } = {}) => {
  if (typeof value !== "number" && (typeof value !== "string" || !(unsignedExponent ? STRICT_UNSIGNED_EXPONENT : STRICT_SIGNED_DECIMAL).test(value.trim()))) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
var inventoryFiniteNumber = (value) => strictNumber(value);

// src/components/estimator/foundation/wallCapCalculator.js
function wallCapCutLengthValue(cap) {
  if (!cap || typeof cap !== "object" || Array.isArray(cap)) return void 0;
  return Object.prototype.hasOwnProperty.call(cap, "length_inches") ? cap.length_inches : cap.cut_length_inches;
}
var known = (value) => typeof value === "number" && Number.isFinite(value);
var assigned = (id) => typeof id === "string" && id.trim() !== "" || typeof id === "number" && Number.isFinite(id);
var sumKnown = (rows) => {
  let total = 0;
  for (const row of rows) {
    if (!known(row.cost)) return null;
    total += row.cost;
    if (!Number.isFinite(total)) return null;
  }
  return total;
};
function calcWallCaps(wallCaps = [], inventory = [], options = {}) {
  const issues = [];
  const explicitSnapshot = Object.prototype.hasOwnProperty.call(options ?? {}, "savedCaps");
  const currentIds = /* @__PURE__ */ new Map();
  const savedCaps = /* @__PURE__ */ new Map();
  const componentId = (cap) => typeof cap?.component_id === "string" && cap.component_id.trim() !== "" ? cap.component_id : null;
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
  const held = (cap) => {
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
      kind: "wall_cap",
      index,
      componentId: cap.component_id ?? cap.id ?? null,
      field,
      inventoryId: assigned(id) ? id : null,
      code,
      message: `Wall cap ${index + 1}: ${message}`
    });
    const matches = assigned(id) ? inventory.filter((row) => row?.id === id) : [];
    if (matches.length !== 1) {
      issue(
        "cap_inventory_id",
        !assigned(id) ? "catalog_item_unassigned" : matches.length > 1 ? "catalog_item_ambiguous" : "catalog_item_unavailable",
        !assigned(id) ? "select a catalog material." : matches.length > 1 ? "the selected catalog ID is ambiguous; refresh the catalog." : "selected catalog material is unavailable."
      );
      return held(cap);
    }
    const inv = matches[0];
    const SUPPORTED_PROFILES = ["flat", "sloped", "beveled", "rounded"];
    const SUPPORTED_SLOPES = ["flat", "single", "double"];
    const SUPPORTED_END_TREATMENTS = ["straight", "mitered", "returned"];
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
    const availability = foundationCatalogRowAvailability(inv);
    if (availability !== "active") {
      issue(
        "cap_inventory_id",
        availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        availability === "deleted" ? "the selected catalog material is marked deleted \xE2\u20AC\u201D pick a replacement." : "the selected catalog material is inactive \xE2\u20AC\u201D reactivate it or pick a replacement."
      );
      return held(cap);
    }
    const firstIssue = issues.length;
    const rate = inventoryFiniteNumber(inv.cap_stock_price);
    if (rate === null || rate < 0) {
      issue(
        "cap_stock_price",
        "wall_cap_stock_price_unavailable",
        "record a finite nonnegative full-stock price; a missing price is not zero. Saved amounts are retained."
      );
    }
    const stockLength = inventoryFiniteNumber(inv.cap_stock_length_inches);
    const cutLength = inventoryFiniteNumber(wallCapCutLengthValue(cap));
    if (stockLength === null || stockLength <= 0) {
      issue(
        "cap_stock_length_inches",
        "wall_cap_stock_length_unavailable",
        "the selected catalog stock length must be a recorded finite positive number. Saved dimensions are not a current stock specification."
      );
    }
    if (cutLength === null || cutLength <= 0) {
      issue(
        "length_inches",
        "wall_cap_cut_length_invalid",
        "enter a finite positive cut length in inches. An empty or invalid cut is not changed to a default size."
      );
    } else if (stockLength !== null && stockLength > 0 && cutLength > stockLength) {
      issue(
        "length_inches",
        "wall_cap_cut_exceeds_stock",
        `cut length (${cutLength} in) exceeds the selected stock length (${stockLength} in). Choose longer stock or separate pieces; no extra quantity is assumed.`
      );
    }
    if (issues.length !== firstIssue) return held(cap);
    let extras = 0;
    let extrasInvalid = false;
    for (const p of [cap?.supplies_cost, cap?.cut_labor_cost]) {
      if (p == null || p === "") continue;
      const n = Number(p);
      if (!(Number.isFinite(n) && n >= 0)) {
        extrasInvalid = true;
        break;
      }
      extras += n;
    }
    if (extrasInvalid) return held(cap);
    return {
      ...cap,
      cap_name: inv.material_name || "",
      stock_length_inches: stockLength,
      supplies_cost: cap?.supplies_cost != null && cap.supplies_cost !== "" ? Number(cap.supplies_cost) : void 0,
      cut_labor_cost: cap?.cut_labor_cost != null && cap.cut_labor_cost !== "" ? Number(cap.cut_labor_cost) : void 0,
      cost: rate + extras,
      // O-053 (CMP-D10) -- the reusable offcut after the cut: stockLength -
      // cutLength. Informational only -- the priced contract stays full-stock
      // per cut; the offcut surfaces for the reuse alternative, never priced.
      offcut_inches: stockLength !== null && stockLength > 0 && cutLength !== null && cutLength > 0 && cutLength <= stockLength ? stockLength - cutLength : null
    };
  });
  const groups = /* @__PURE__ */ new Map();
  for (const cap of caps) {
    if (!assigned(cap.cap_inventory_id)) continue;
    if (!groups.has(cap.cap_inventory_id)) groups.set(cap.cap_inventory_id, []);
    groups.get(cap.cap_inventory_id).push(cap);
  }
  const byInventory = [...groups].map(([id, rows]) => ({
    id,
    name: rows[0].cap_name,
    qty: rows.length,
    cost: sumKnown(rows)
  }));
  const total = sumKnown(caps);
  if (total === null && caps.every((cap) => known(cap.cost))) {
    issues.push({
      kind: "wall_cap",
      index: 0,
      componentId: caps[0]?.component_id ?? caps[0]?.id ?? null,
      field: "cost",
      inventoryId: null,
      code: "wall_cap_cost_total_invalid",
      message: "Wall cap total is outside the supported numeric range; current pricing is unavailable."
    });
  }
  return { caps, byInventory, total, issues };
}
function foundationWallCapCatalogIssues(wallCaps = [], inventory = []) {
  return calcWallCaps(wallCaps, inventory).issues;
}

// src/components/estimator/foundation/foundationCatalogIntegrity.js
function foundationCatalogRowAvailability(row) {
  if (!row) return "unavailable";
  if (row.deleted === true) return "deleted";
  if (row.show_in_foundation === false) return "inactive";
  return "active";
}
function hasFoundationCostSnapshot(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// src/components/estimator/foundation/poleCalculator.js
var FOUNDATION_METHOD_DOMAIN = Object.freeze({
  // The documented embedment domain: embedment is a third of the exposed pole
  // height (engineering guidance minimum, never a universal claim) and the
  // shaft diameter clears twice the pole diameter (a shop-assumption clearance,
  // not a code number).
  embedment_min_ratio: 1 / 3,
  shaft_diameter_min_ratio: 2,
  domain: "sign-pole embedment inside engineering guidance; shop-assumption diameter clearance"
});
var FOUNDATION_TYPE_METHOD_DOMAIN = Object.freeze({
  spread_foot_depth_min_inches: 12,
  wall_height_min_inches: 6,
  domain: "shop-assumption minimum dims (spread_foot depth / wall height); inside the documented domain"
});
var FOUNDATION_METHOD_WORKED_EXAMPLES = Object.freeze([
  {
    domain: "pole embedment",
    inputs: { height_inches: 120, pole_diameter_inches: 8 },
    derivation: "embedment = ceil(height * embedment_min_ratio); shaft_diameter = ceil(pole_dia * shaft_diameter_min_ratio)",
    output: { embedment_inches: 42, shaft_diameter_inches: 10 },
    note: "the domain's ratios applied to the authored height/diameter -- inside the documented domain, never an unexplained multiplier"
  },
  {
    domain: "spread_foot depth",
    inputs: { foundation_type: "spread_foot" },
    derivation: "depth_inches = spread_foot_depth_min_inches (shop-assumption minimum)",
    output: { depth_inches: 12 },
    note: "the domain's minimum depth -- a shop-assumption floor, not a structural calc"
  },
  {
    domain: "wall height",
    inputs: { foundation_type: "wall" },
    derivation: "height_inches = wall_height_min_inches (shop-assumption minimum)",
    output: { height_inches: 6 },
    note: "the domain's minimum height -- a shop-assumption floor, not a structural calc"
  }
]);

// src/components/estimator/foundation/landscapeMaterials.js
var LANDSCAPE_MATERIALS = [
  { key: "dirt", label: "Dirt (Eraser)", color: "#a1866f", cost_per_sqft: 0 },
  { key: "grass", label: "Grass", color: "#4ade80", cost_per_sqft: 0.75 },
  { key: "concrete", label: "Concrete", color: "#cbd5e1", cost_per_sqft: 8 },
  { key: "asphalt", label: "Asphalt", color: "#475569", cost_per_sqft: 5 },
  { key: "gravel", label: "Gravel", color: "#94a3b8", cost_per_sqft: 2.25 },
  { key: "sand", label: "Sand", color: "#fcd34d", cost_per_sqft: 1.75 },
  { key: "mulch", label: "Mulch", color: "#92400e", cost_per_sqft: 1.25 },
  { key: "wood_decking", label: "Wood Decking", color: "#d97706", cost_per_sqft: 14 },
  { key: "water", label: "Water", color: "#38bdf8", cost_per_sqft: 6 },
  // O-069 (CMP-F02) -- additional sqft-priced site materials. These bill by
  // coverage like the base set; per-count objects (trees, lights, boulders)
  // need a count-priced model -- they are intentionally absent rather than
  // billed per square foot.
  { key: "pavers", label: "Pavers", color: "#a8a29e", cost_per_sqft: 12 },
  { key: "flagstone", label: "Flagstone", color: "#b45309", cost_per_sqft: 16, pattern: "stone" },
  { key: "river_rock", label: "River Rock", color: "#78716c", cost_per_sqft: 3.5, pattern: "pebble" },
  { key: "sod", label: "Sod (installed)", color: "#16a34a", cost_per_sqft: 1.5, pattern: "grass" },
  { key: "artificial_turf", label: "Artificial Turf", color: "#059669", cost_per_sqft: 11, pattern: "turf" },
  { key: "ground_cover", label: "Ground Cover", color: "#65a30d", cost_per_sqft: 4, pattern: "foliage" },
  { key: "planting_bed", label: "Planting Bed", color: "#7c3f00", cost_per_sqft: 6, pattern: "soil" }
];
var LANDSCAPE_VISUAL_OBJECTS = [
  { key: "tree", label: "Tree", color: "#166534", height_inches: 96, radius_inches: 24 },
  { key: "shrub", label: "Shrub", color: "#15803d", height_inches: 18, radius_inches: 12 },
  { key: "light", label: "Light", color: "#f59e0b", height_inches: 72, radius_inches: 2 },
  { key: "boulder", label: "Boulder", color: "#57534e", height_inches: 30, radius_inches: 18 }
];
var LANDSCAPE_ASSET_MANIFEST = Object.freeze({
  license_policy: "CC0 or shop-licensed, individually curated per object type -- no blanket packs",
  source_kind: "procedural shop-authored primitives",
  materials: LANDSCAPE_MATERIALS.map((m) => ({
    key: m.key,
    label: m.label,
    kind: "billable material",
    source: "shop-authored color tile",
    license: "shop-authored",
    // O-075 (CMP-F08) -- manifest metadata: author/provenance, original scale,
    // preview, optimized-file hash, bounds/pivot, and a fallback representation.
    // Shop-authored primitives carry the primitive itself as the fallback.
    author: "shop",
    original_scale_inches: null,
    preview: null,
    file_hash: null,
    bounds_inches: null,
    pivot: "center-bottom",
    fallback: "color tile",
    // O-077 (CMP-F10) -- asset-verification checklist: procedural primitives
    // have no textures/CORS/foliage (not_applicable) but scale comes from the
    // authored material coverage (verified). Re-check when real assets land.
    verification: {
      transparent_foliage: "not_applicable",
      shadows: "procedural",
      scale: "verified",
      thumbnail: "procedural",
      cors: "not_applicable",
      unavailable_asset: "not_applicable",
      low_power_fallback: "procedural-fallback"
    }
  })),
  visual_objects: LANDSCAPE_VISUAL_OBJECTS.map((o) => ({
    key: o.key,
    label: o.label,
    kind: "decorative object",
    source: "shop-authored primitive shape",
    license: "shop-authored",
    author: "shop",
    original_scale_inches: o.height_inches ?? null,
    preview: null,
    file_hash: null,
    bounds_inches: o.height_inches != null && o.radius_inches != null ? { h: o.height_inches, r: o.radius_inches } : null,
    pivot: "center-bottom",
    fallback: "primitive shape",
    verification: {
      transparent_foliage: "not_applicable",
      shadows: "procedural",
      scale: "verified",
      thumbnail: "procedural",
      cors: "not_applicable",
      unavailable_asset: "not_applicable",
      low_power_fallback: "procedural-fallback"
    }
  }))
});

// src/components/estimator/foundation/foundationGeometryInputs.js
var FOUNDATION_DIMENSION_FIELDS = Object.freeze({
  // Foundation item card (spread footing / pillar)  -  -  -  consumed by the card-label
  // remainder; recorded here so card + panels share one label source.
  foundation: Object.freeze({
    length_inches: Object.freeze({
      label: "Length (in)",
      help: "Footing length  -  -  -  the long side of a rectangular spread footing.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    width_inches: Object.freeze({
      label: "Width (in)",
      help: "Footing width  -  -  -  the short side of a rectangular spread footing.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    depth_inches: Object.freeze({
      label: "Depth (in)",
      help: "Footing or pier depth below grade  -  -  -  must reach below the frost line for your area.",
      placeholder: `3' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    diameter: Object.freeze({
      label: "Diameter (in)",
      help: "Round pier diameter measured straight across the top.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    grade_offset_inches: Object.freeze({
      label: "Grade offset (in)",
      help: "How far the footing top sits above (+) or below (-) finished grade.",
      placeholder: '0"',
      unit: "inches",
      ftIn: true,
      signed: true
    })
  }),
  // Project poles (FoundationPolesPanel).
  pole: Object.freeze({
    height_inches: Object.freeze({
      label: "Height above grade (in)",
      help: "Exposed pole length from finished grade up to the sign mount.",
      placeholder: `10' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    embedment_inches: Object.freeze({
      label: "Embedment below grade (in)",
      help: "Pole length buried in the footing  -  -  -  must satisfy frost depth and the pole supplier's embedment guidance.",
      placeholder: `3' 6"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    base_offset_inches: Object.freeze({
      label: "Base offset above grade (in)",
      help: "Lifts the pole bottom above grade for wall or pier mounts  -  -  -  the gap still counts toward required stock length.",
      placeholder: '0"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    total_length_inches: Object.freeze({
      label: "Total stock length (in)",
      help: "Billed pole length when a full stick is purchased  -  -  -  leave blank to price height above grade plus embedment.",
      placeholder: `20' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    })
  }),
  // Masonry walls (FoundationWallsPanel)  -  -  -  camelCase wall record keys.
  wall: Object.freeze({
    heightInches: Object.freeze({
      label: "Wall height (in)",
      help: "Finished masonry height measured from the footing up.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    mortarGapInches: Object.freeze({
      label: "Mortar joint (in)",
      help: 'Mortar thickness between masonry units  -  -  -  3/8" is typical.',
      placeholder: '3/8"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    wasteFraction: Object.freeze({
      label: "Waste (0-1)",
      help: "Waste/cut factor on brick+mortar+labor quantities (0.1 = +10%).",
      placeholder: "0.1",
      unit: "fraction",
      ftIn: false,
      signed: false
    }),
    internalWallHeightInches: Object.freeze({
      label: "Fill wall height (in)",
      help: "Internal fill wall height  -  -  -  blank follows the outer wall height.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    internalMortarGapInches: Object.freeze({
      label: "Fill mortar joint (in)",
      help: "Mortar thickness for the internal fill wall.",
      placeholder: '3/8"',
      unit: "inches",
      ftIn: true,
      signed: false
    })
  }),
  // Wall caps (FoundationWallCapsPanel)  -  -  -  length_inches is the cap cut, not a
  // footing length; keep it in its own section.
  wallCap: Object.freeze({
    length_inches: Object.freeze({
      label: "Cut length (in)",
      help: "Cap stock cut for this piece  -  -  -  the full stock price is charged per cut piece.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    overhang_inches: Object.freeze({
      label: "Overhang (in)",
      help: "How far the cap projects past each wall face -- 0 is flush.",
      placeholder: '1"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    height_inches: Object.freeze({
      label: "Cap thickness (in)",
      help: "Vertical thickness of the cap piece sitting on the wall.",
      placeholder: '3"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    // O-050 (CMP-D07) -- cap profile / width / elevation / joints / slope /
    // end-treatment metadata. Optional authored fields; blank = "not recorded",
    // never a silent default on the cap's geometry or finish.
    width_inches: Object.freeze({
      label: "Cap width (in)",
      help: "How wide the cap spans the wall top  -  0 is flush with the wall face.",
      placeholder: '8"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    elevation_inches: Object.freeze({
      label: "Cap elevation (in)",
      help: "Height of the cap's top surface above the slab.",
      placeholder: '24"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    joint_spacing_inches: Object.freeze({
      label: "Joint spacing (in)",
      help: "Distance between cap joints along the wall run.",
      placeholder: '48"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    profile: Object.freeze({
      label: "Cap profile",
      help: "The cap's edge profile (flat, sloped, beveled, rounded).",
      placeholder: "flat",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    slope: Object.freeze({
      label: "Cap slope",
      help: "Whether the cap top sheds water (flat, single-slope, double-slope).",
      placeholder: "flat",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    end_treatment: Object.freeze({
      label: "End treatment",
      help: "How the cap terminates at wall ends (straight, mitered, returned).",
      placeholder: "straight",
      unit: "text",
      ftIn: false,
      signed: false
    })
  }),
  // Pole-mounted signs (FoundationPolesPanel sign sub-list).
  sign: Object.freeze({
    width_inches: Object.freeze({
      label: "W (in)",
      help: "Sign face width across the pole.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    height_inches: Object.freeze({
      label: "H (in)",
      help: "Sign face height.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    mount_height_inches: Object.freeze({
      label: "Mount ht (in)",
      help: "Height from grade up to the sign's mounting point.",
      placeholder: `8' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    depth_inches: Object.freeze({
      label: "D (in)",
      help: "Sign face depth (thickness) in plan view.",
      placeholder: '8"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    horizontal_offset_inches: Object.freeze({
      label: "Offset (in)",
      help: "Horizontal offset from the pole center in plan view (+ = one side, - = other).",
      placeholder: '0"',
      unit: "inches",
      ftIn: true,
      signed: true
    }),
    // O-060 (CMP-E05) -- panel-shape/trim/body-color/envelope metadata.
    // Optional authored fields; blank = "not recorded", never a silent default.
    panel_shape: Object.freeze({
      label: "Panel shape",
      help: "Sign panel shape: cabinet / panel / letters.",
      placeholder: "cabinet",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    trim_color: Object.freeze({
      label: "Trim color",
      help: "Sign trim / frame color.",
      placeholder: "bronze",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    body_color: Object.freeze({
      label: "Body color",
      help: "Sign body / cabinet color.",
      placeholder: "white",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    envelope: Object.freeze({
      label: "Envelope",
      help: "Physical envelope note (overall bounding box / projection).",
      placeholder: `e.g. 4'x2'x8"`,
      unit: "text",
      ftIn: false,
      signed: false
    }),
    orientation: Object.freeze({
      label: "Orient (deg)",
      help: "Sign face rotation on the pole (0 = facing the plan's +x direction).",
      placeholder: "0",
      unit: "degrees",
      ftIn: false,
      signed: true
    })
  }),
  // Signage cabinets (SignageCabinetsPanel).
  cabinet: Object.freeze({
    width_inches: Object.freeze({
      label: "Width (in)",
      help: "Cabinet face width  -  -  -  horizontal across the sign face.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    height_inches: Object.freeze({
      label: "Height (in)",
      help: "Cabinet face height  -  -  -  vertical on the sign face.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    depth_inches: Object.freeze({
      label: "Depth (in)",
      help: "Cabinet depth front-to-back  -  -  -  affects wind load and mounting.",
      placeholder: '8"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    mount_height_inches: Object.freeze({
      label: "Mount height (in)",
      help: "Height from grade up to the cabinet's mounting point.",
      placeholder: '0"',
      unit: "inches",
      ftIn: true,
      signed: false
    })
  }),
  // Rectangle outline entry (WallShapeEditor)  -  -  -  local draft, applied on click.
  wallOutline: Object.freeze({
    rect_length: Object.freeze({
      label: "Rectangle length (in)",
      help: "Footprint length for a rectangular wall outline.",
      placeholder: `8' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    rect_width: Object.freeze({
      label: "Rectangle width (in)",
      help: "Footprint width for a rectangular wall outline.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    })
  }),
  // Landscape grid (LandscapeDesigner).
  landscape: Object.freeze({
    cell_size_inches: Object.freeze({
      label: "Cell size (in)",
      help: 'Edge length of one grid cell  -  -  -  12" makes each cell 1 sq ft.',
      placeholder: '12"',
      unit: "inches",
      ftIn: true,
      signed: false
    })
  })
});
var foundationDimensionFieldMeta = (section, field) => {
  const group = FOUNDATION_DIMENSION_FIELDS[section];
  return group ? group[field] ?? null : null;
};

// src/components/estimator/foundation/foundationRuleRegistry.js
var FOUNDATION_SOURCE_LICENSE_POLICY = Object.freeze({
  paid_standards_citation_only: true,
  paid_standards_no_content_reproduction: true,
  paid_standards_list: ["ACI 315", "ACI 318", "ACI 301", "CRSI MSP", "CRSI PRB", "CRSI RB4.1", "ASTM", "AASHTO"],
  candidate_source_cannot_gate: true,
  public_sources_verified_vs_candidate: true,
  policy_version: "1.0.0"
});
var RULE_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
var DOMAIN_ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;
var SEMVER = /^\d+\.\d+\.\d+$/;
var REGISTER_ID = /^[A-Z]{2,}(?:-[A-Z0-9]+)*-\d{3,}$/;
var STATUSES = /* @__PURE__ */ new Set(["active", "held"]);
var VERIFIED_VALUES = /* @__PURE__ */ new Set([true, false, "candidate"]);
var GATED_PREFIXES = ["max_", "min_", "equals_"];
var APPLICABILITY_LIST_KEYS = /* @__PURE__ */ new Set([
  "usages",
  "member_types",
  "support_classes",
  "bearing_modes",
  "substrates",
  "bar_coatings",
  "bar_sizes",
  "products",
  "mat_layers",
  "exposures"
]);
var isRecord = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var text = (value) => typeof value === "string" && value.trim() ? value.trim() : "";
var finite = (value) => typeof value === "number" && Number.isFinite(value);
function deepFreeze(value, seen = /* @__PURE__ */ new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) value.forEach((entry) => deepFreeze(entry, seen));
  else for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}
var FOUNDATION_SOURCE_TOPIC_INDEX = Object.freeze({
  "support.placement.spacing": "spacing/count ceilings per bearing mode",
  "support.density": "density/count caps (never a universal entitlement)",
  "support.compatibility": "member-type vs support-kind compatibility (pillar/base-plate/drilled-shaft)",
  "support.catalog": "per-SKU catalog-row modeling rules",
  "support.placement": "placement rules (bracing, plates, coatings)",
  "authority": "citation/authority markers (paid standards, licensed-only)"
});
var FOUNDATION_RULE_SOURCES = deepFreeze({
  "CMP-SUP-001": {
    authority: "Dayton Superior, manufacturer",
    title: "HC Rebar High Chair / Individual High Chair product page",
    edition: null,
    url: "https://www.daytonsuperior.com/products/accessories?name=hc",
    verified: true
    // product text inspected; SKU/load/installation depth not verified
  },
  "CMP-SUP-002": {
    authority: "Dayton Superior, manufacturer",
    title: "HCP Individual High Chair With Plates product page",
    edition: null,
    url: "https://www.daytonsuperior.com/products/accessories?name=hcp",
    verified: false
    // unresolved manufacturer-internal height conflict on the page
  },
  "CMP-SUP-003": {
    authority: "Dayton Superior, manufacturer",
    title: '"Bar Support" handbook, document code DS98',
    edition: "DS98 REV. 04/24; footers also carry 10/26 and REV. 09/23",
    url: "https://www.daytonsuperior.com/docs/default-source/handbooks/bar-support-handbook.pdf?sfvrsn=6dffd560_132",
    verified: true
  },
  "CMP-SUP-004": {
    authority: "Dayton Superior, manufacturer",
    title: "SB - SLAB BOLSTER Bar Supports, Technical Data Sheet",
    edition: null,
    url: "https://www.daytonsuperior.com/docs/default-source/tech-data-sheets/sb_slab_bolster.pdf?sfvrsn=d61db060_12",
    verified: true
  },
  "CMP-SUP-005": {
    authority: "Dayton Superior, manufacturer",
    title: "SBU - SLAB BOLSTER UPPER Rebar Supports, Technical Data Sheet",
    edition: null,
    url: "https://www.daytonsuperior.com/docs/default-source/tech-data-sheets/sbuslabbolsterupper.pdf",
    verified: true
  },
  "CMP-SUP-006": {
    authority: "Dayton Superior, manufacturer",
    title: "BB - BEAM BOLSTER Bar Support, Technical Data Sheet",
    edition: "file date 5/18/2022 on sheet",
    url: "https://www.daytonsuperior.com/docs/default-source/tech-data-sheets/bb-beam-bolster-bar-support-tech-data-sheet.pdf?sfvrsn=4719b060_16",
    verified: true
  },
  "CMP-SUP-007": {
    authority: "Dayton Superior, manufacturer",
    title: "BBP - BEAM BOLSTER WITH PLATE, Technical Data Sheet",
    edition: null,
    url: "https://www.daytonsuperior.com/docs/default-source/tech-data-sheets/bbp-beam-bolster-with-plate-tech-data-sheet.pdf?sfvrsn=68f8b260_11",
    verified: true
  },
  "CMP-SUP-008": {
    authority: "Dayton Superior, manufacturer",
    title: "CHC - CONTINUOUS HIGH CHAIR, Technical Data Sheet",
    edition: null,
    url: "https://www.daytonsuperior.com/docs/default-source/tech-data-sheets/chc---continuous-high-chair-(us)-tech-data-sheet.pdf?sfvrsn=2229b460_6",
    verified: true
  },
  "CMP-SUP-009": {
    authority: "Dayton Superior, manufacturer",
    title: "HC - INDIVIDUAL HIGH CHAIR, Technical Data Sheet",
    edition: null,
    url: "https://www.daytonsuperior.com/docs/default-source/tech-data-sheets/hcindividualhighchair.pdf?sfvrsn=4ca7af60_20",
    verified: true
  },
  "CMP-SUP-010": {
    authority: "Meadow Burke / Leviat, manufacturer",
    title: "Technical Manual - Reinforcing (Supporting and Spacing Rebar spec sheets)",
    edition: null,
    url: "https://www.tpacaz.com/wp-content/uploads/sites/11/2025/02/Meadow-Burke-technical-manual-reinforcing-compressed.pdf",
    verified: true
  },
  "CMP-SUP-011": {
    authority: "SureBuilt, manufacturer/distributor",
    title: '"Bar Support" guide with Bar Support Wire Size table',
    edition: "footer dated 02/25",
    url: "https://surebuilt-usa.com/docs/Rebar-Support.pdf",
    verified: true
  },
  "CMP-SUP-012": {
    authority: "Dayton Superior (Aztec line), manufacturer",
    title: "PSBB - Aztec StrongBack Slab / Beam Bolster, Technical Data Sheet",
    edition: null,
    url: "https://www.daytonsuperior.com/docs/default-source/tech-data-sheets/psbbaztecstrongbackslabbeambolster.pdf",
    verified: true
  },
  "CMP-SUP-013": {
    authority: "Iowa Department of Transportation, public agency",
    title: "Standard Specifications Section 2404, Reinforcement",
    edition: "spec book revision 10/20/2026 as displayed",
    url: "https://ia.iowadot.gov/erl/current/GS/content/2404.htm",
    verified: true
  },
  "CMP-SUP-014": {
    authority: "Iowa Department of Transportation, public agency",
    title: "Construction Manual Chapter 11, sections 11.40 Reinforcement and 11.41 Placement and Checking (Bridge Floors)",
    edition: null,
    url: "https://www.iowadot.gov/erl/current/CM/content/CM%2011.40.htm",
    verified: true
  },
  "CMP-SUP-015": {
    authority: "Florida Department of Transportation, public agency",
    title: "Section 415, Reinforcing Steel (Standard Specifications for Road and Bridge Construction review copy)",
    edition: "July 2016 FHWA review",
    url: "https://fdotwww.blob.core.windows.net/sitefinity/docs/default-source/specifications/by-year/2016/july-2016/review/fhwa/4150000.fhwa.pdf?sfvrsn=d440ed72_0",
    verified: true
  },
  "CMP-SUP-016": {
    authority: "Utah DFCM adopted APWA Manual of Standard Specifications, public agency standard",
    title: "Section 03 20 00, Concrete Reinforcing",
    edition: "2025 APWA Specifications - DFCM Adopted Standards",
    url: "https://dfcm.utah.gov/wp-content/uploads/2025-APWA-Specifications-DFCM-Adopted-Standards.pdf",
    verified: true
  },
  "CMP-SUP-017": {
    authority: "U.S. Navy Education and Training (NAVEDTRA), U.S. government",
    title: 'Steelworker 14251C, Chapter 7 "Placing and Tying Reinforcing Steel" (tpub.com mirror)',
    edition: "14251C; dated military manual",
    url: "https://www.tpub.com/steelworker2/78.htm",
    verified: true
  },
  "CMP-SUP-018": {
    authority: "Concrete Reinforcing Steel Institute (CRSI), industry institute",
    title: "Placing Reinforcing Bars, 10th Edition - Table of Contents",
    edition: "10th edition TOC; book content is paid",
    url: "https://www.crsi.org/wp-content/uploads/CRSI-Placing_Reinforcing_Bars_10th-TOC.pdf",
    verified: "candidate"
    // TOC verified; any numeric rule attributed to the book is candidate
  },
  "CMP-SUP-019": {
    authority: "Concrete Construction / Aberdeen group, trade press (via SEF India forum mirror)",
    title: '"Supports and Ties" trade article quoting CRSI documents',
    edition: null,
    url: "https://www.sefindia.org/forum/download.php?id=489",
    verified: "candidate"
    // search-extracted fragments; full article not inspected
  },
  "CMP-SUP-020": {
    authority: "Whitacre Rebar, regional rebar fabricator/supplier",
    title: '"Reinforcing Bar Supports" product page',
    edition: null,
    url: "https://www.whitacrerebar.com/products/reinforcing-bar-supports/",
    verified: "candidate"
    // public page text captured via search index; no data-sheet depth
  },
  "CMP-SUP-021": {
    authority: "Lotel (Baton Rouge, LA), manufacturer of plastic support chairs",
    title: "Rebar-ups / Mesh-ups product pages and published spacing & sizing charts",
    edition: null,
    url: "https://lotel.com/rebar-ups",
    verified: true
    // pages + charts verified; the "how many" sq-ft text is candidate
  },
  "CMP-SUP-022": {
    authority: "Castle NZ, manufacturer (New Zealand)",
    title: "Ground Chairs - Optimal Chair Spacing (AS/NZS context)",
    edition: "2019",
    url: "https://castlenz.com/wp-content/uploads/2019/04/Ground-Chair-Optimal-Spacings.pdf",
    verified: true
    // verified manufacturer chart; foreign standard, not a US code basis
  },
  "CMP-SUP-023": {
    authority: "ACI 318 (paid standard) as publicly quoted by government/educational sources",
    title: 'LA County DPW "2023 Retaining Wall Plan Review" quoting ACI 20.5.1.3.1 (corroborated by iRebar.com table + NAVEDTRA CMP-SUP-017)',
    edition: "2023 code version",
    url: "https://dpw.lacounty.gov/bsd/lib/fp/Building/Structural%20and%20Technical/2023%20Code%20Version/2023%20Retaining%20Wall%20Plan%20Review%20v1.0%20(completed%202-24-23).pdf",
    verified: true
    // consistent multi-source public quotation; ACI 318 itself uninspected
  },
  "CMP-SUP-024": {
    authority: "ACI, CRSI, ASTM, AASHTO standards bodies",
    title: "Paid/restricted standards register markers (MSP, PRB, ACI 315/318/301, RB4.1, ASTM/AASHTO specs)",
    edition: null,
    url: null,
    verified: "candidate"
    // authority markers only; contents not retrieved, no paywall bypassed
  },
  // O-103 (CMP-I02) -- shop_assumptions source: the shop's estimating-
  // assumption corpus (the method-domain constants / shop-authored defaults
  // the estimator carries). `verified: "candidate"` -- a shop assumption is
  // never an external code or a verified engineering source.
  "CMP-SUP-025": {
    authority: "CCS shop estimating assumptions",
    title: "Shop-authored estimating assumptions (method-domain constants, shop defaults)",
    edition: "shop-authored",
    url: null,
    verified: "candidate"
    // a shop assumption -- never an external code or verified engineering source
  }
});
var FOUNDATION_SOURCE_CLASSES = deepFreeze({
  local_code: "adopted local code / amendments",
  structural_standard: "referenced structural standard",
  engineering_guidance: "engineering guidance",
  manufacturer_instructions: "manufacturer instructions",
  shop_assumptions: "shop estimating assumptions"
});
var SOURCE_AUTHORITY_CLASS = deepFreeze({
  "CMP-SUP-001": "manufacturer_instructions",
  "CMP-SUP-002": "manufacturer_instructions",
  "CMP-SUP-003": "manufacturer_instructions",
  "CMP-SUP-004": "manufacturer_instructions",
  "CMP-SUP-005": "manufacturer_instructions",
  "CMP-SUP-006": "manufacturer_instructions",
  "CMP-SUP-007": "manufacturer_instructions",
  "CMP-SUP-008": "manufacturer_instructions",
  "CMP-SUP-009": "manufacturer_instructions",
  "CMP-SUP-010": "manufacturer_instructions",
  "CMP-SUP-011": "manufacturer_instructions",
  "CMP-SUP-012": "manufacturer_instructions",
  "CMP-SUP-013": "structural_standard",
  "CMP-SUP-014": "structural_standard",
  "CMP-SUP-015": "structural_standard",
  "CMP-SUP-016": "local_code",
  "CMP-SUP-017": "engineering_guidance",
  "CMP-SUP-018": "engineering_guidance",
  "CMP-SUP-019": "engineering_guidance",
  "CMP-SUP-020": "manufacturer_instructions",
  "CMP-SUP-021": "manufacturer_instructions",
  "CMP-SUP-022": "manufacturer_instructions",
  "CMP-SUP-023": "structural_standard",
  "CMP-SUP-024": "structural_standard",
  "CMP-SUP-025": "shop_assumptions"
});
var src = (register_id, section, verified) => {
  const base = FOUNDATION_RULE_SOURCES[register_id];
  return {
    register_id,
    authority: base.authority,
    authority_class: SOURCE_AUTHORITY_CLASS[register_id] ?? null,
    title: base.title,
    edition: base.edition ?? null,
    section: section ?? null,
    url: base.url ?? null,
    verified: verified === void 0 ? base.verified : verified
  };
};
var FOUNDATION_RULE_SEEDS = deepFreeze([
  // ===== support.placement.spacing — count ceilings (all ceilings, not densities) =====
  {
    rule_id: "SUP-SPACING-CONTINUOUS-IOWA-MAX",
    domain: "support.placement.spacing",
    statement: "Bolsters or continuous high chairs spaced not more than 4 feet in each direction; the agency cap applies on top of manufacturer recommendation or CRSI Manual of Standard Practice spacing.",
    params: { max_spacing_inches_each_way: 48 },
    units: "inches",
    logic: "ceiling on authored spacing; consumer grid count stays ceil(span/spacing)+1 per axis at or under this cap",
    source_ref: src("CMP-SUP-013", "2404.03 E"),
    corroborating_register_ids: [],
    applicability: { support_classes: ["continuous"] },
    limits: [
      "public-agency ceiling for highway work, not a building code; a stricter project spec or CRSI MSP rule may govern",
      "a ceiling, not an entitlement to 48-inch spacing"
    ],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SPACING-CHAIR-IOWA-MAX",
    domain: "support.placement.spacing",
    statement: "Individual bar chairs (individual high chairs) spaced not more than 3 feet in each direction under the same agency-cap structure as bolsters.",
    params: { max_spacing_inches_each_way: 36 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-013", "2404.03 E"),
    corroborating_register_ids: ["CMP-SUP-014"],
    applicability: { support_classes: ["individual"] },
    limits: [
      "public-agency ceiling for highway work; CRSI MSP or a stricter project spec may govern",
      "a ceiling, not an entitlement to 36-inch spacing"
    ],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SPACING-FLATSLAB-UTAH-MAX",
    domain: "support.placement.spacing",
    statement: "In flat slab work, support chairs and bolsters spaced not more than five (5) feet on centers in each direction (placing clause).",
    params: { max_spacing_inches_each_way: 60 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-016", "placing - flat slab work"),
    corroborating_register_ids: [],
    applicability: { member_types: ["flat_slab"], support_classes: ["individual", "continuous"] },
    limits: ["public-agency spec clause; 'unless specified otherwise' acceptance language governs", "ceiling, not a density"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SPACING-CHAIR-UTAH-LE5-MAX",
    domain: "support.placement.spacing",
    statement: "Flat-slab support chairs spaced 3 feet maximum for No. 5 and smaller bars (acceptance clause).",
    params: { max_spacing_inches_each_way: 36 },
    units: "inches",
    logic: "bar_size_class le_#5 = #5 and smaller",
    source_ref: src("CMP-SUP-016", "acceptance clause - flat slab work"),
    corroborating_register_ids: [],
    applicability: { member_types: ["flat_slab"], support_classes: ["individual"], bar_size_class: "le_#5" },
    limits: ["acceptance-clause default when the spec does not state otherwise", "ceiling, not a density"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SPACING-CHAIR-UTAH-GT5-MAX",
    domain: "support.placement.spacing",
    statement: "Flat-slab support chairs spaced 5 feet maximum for bars larger than No. 5 (acceptance clause).",
    params: { max_spacing_inches_each_way: 60 },
    units: "inches",
    logic: "bar_size_class gt_#5 = larger than #5",
    source_ref: src("CMP-SUP-016", "acceptance clause - flat slab work"),
    corroborating_register_ids: [],
    applicability: { member_types: ["flat_slab"], support_classes: ["individual"], bar_size_class: "gt_#5" },
    limits: ["acceptance-clause default when the spec does not state otherwise", "ceiling, not a density"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SPACING-BEAM-BOLSTER-FDOT-MAX",
    domain: "support.placement.spacing",
    statement: "Beam bottom clearance carried on approved heavy beam bolsters; spacing begins not more than 2 feet from the beam end and continues at not more than 4 feet.",
    params: { max_first_bolster_from_end_inches: 24, max_spacing_inches_along_beam: 48 },
    units: "inches",
    logic: "linear-run spacing rule: first bolster <= 24 in from beam end, subsequent <= 48 in",
    source_ref: src("CMP-SUP-015", "415 - beams and caps"),
    corroborating_register_ids: [],
    applicability: { member_types: ["beam", "grade_beam", "stem_wall"], support_classes: ["continuous"] },
    limits: ["highway-agency spec; formed beam/stem members, not mat grids"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SPACING-HIGHCHAIR-TRADE-EXAMPLE-HELD",
    domain: "support.placement.spacing",
    statement: 'Trade-press example: one-way solid slab with #5 temperature-shrinkage bars uses high chairs at 4 feet on center; #4 bars would need 3 feet on center "to prevent sagging."',
    params: { example_spacing_inches_for_no5_bars: 48, example_spacing_inches_for_no4_bars: 36 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-019", "spacing example, quoted from search-extracted article text"),
    corroborating_register_ids: [],
    applicability: { member_types: ["flat_slab"], support_classes: ["individual"] },
    limits: [
      "HELD: secondary trade-press fragment not inspected in full; demonstrates bar-size-dependent spacing, not an adoptable ceiling",
      "cannot gate counts or pricing until corroborated by a public spec or licensed standard"
    ],
    unsupported: ["unverified secondary source \u2014 documentation of the evidence gap only"],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "SUP-SPACING-CASTLE-NZ-CHART-HELD",
    domain: "support.placement.spacing",
    statement: "Foreign manufacturer example proving spacing is a function of bar diameter AND bar spacing AND expected traffic: Y12@200 mm gets 0.7 m centers, Y25@200 mm drops to 0.25-0.3 m; basis is one 80 kg workman per square metre.",
    params: { spacing_function_inputs: ["bar_diameter", "bar_spacing", "construction_traffic"] },
    units: "mixed",
    logic: null,
    source_ref: src("CMP-SUP-022", "Ground Chairs - Optimal Chair Spacing chart"),
    corroborating_register_ids: [],
    applicability: { member_types: ["slab_on_grade"], support_classes: ["individual"], products: ["castle_ground_chairs"] },
    limits: [
      "HELD: AS/NZS foreign-manufacturer chart, not a US code basis \u2014 records the input shape a real spacing rule needs",
      "values are metric and load-basis-specific; do not convert into a US ceiling"
    ],
    unsupported: ["foreign standard basis \u2014 documentation only"],
    rule_version: "1.0.0",
    status: "held"
  },
  // ===== support.density — count philosophy + product-specific densities =====
  {
    rule_id: "SUP-DENSITY-NO-UNIVERSAL",
    domain: "support.density",
    statement: "No universal support density exists. Public agency spacing is a ceiling deferred to manufacturer recommendation or CRSI MSP; manufacturer density is product-specific; spacing depends on bar size, bar spacing and allowed deflection.",
    params: {},
    units: null,
    logic: "the model must be able to answer 'density unverified - manual review' instead of minting a number",
    source_ref: src("CMP-SUP-013", "2404.03 E.5 spacing basis"),
    corroborating_register_ids: ["CMP-SUP-014", "CMP-SUP-021", "CMP-SUP-019"],
    applicability: {},
    limits: ["documentation rule \u2014 carries no assertable params"],
    unsupported: ["a count claimed without a governing source is unsupported \u2014 route to off/manual/review"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-DENSITY-TOLERANCE-DRIVEN",
    domain: "support.density",
    statement: '"Contractors must provide an adequate number of bolsters and/or bar chairs of suitable height and strength to maintain clearance" within tolerance \u2014 the required count is whatever holds placement tolerance; no fixed density is granted.',
    params: {},
    units: null,
    logic: "count = area coverage at max spacing, flagged unverified-density; the real requirement is maintaining clearance under construction loads",
    source_ref: src("CMP-SUP-014", "11.41 placement and checking"),
    corroborating_register_ids: ["CMP-SUP-013"],
    applicability: {},
    limits: ["inspector guidance, not a numeric grant"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-DENSITY-REBARUPS-AREA",
    domain: "support.density",
    statement: 'Lotel Rebar-ups manufacturer spacing chart: "1 Rebar-up PER 2 SQ. FT. (Suggested)"; a lighter "1 PER 3 SQ. FT." pattern is also published. A product-specific area-density suggestion, not a universal rule.',
    params: { suggested_area_sqft_per_support: 2, suggested_area_sqft_per_support_light_traffic: 3 },
    units: "sqft",
    logic: "count = ceil(mat_area / suggested_area_sqft_per_support) for this product family only",
    source_ref: src("CMP-SUP-021", "Rebar-ups spacing chart B (verified image)"),
    corroborating_register_ids: [],
    applicability: { support_classes: ["snap_on"], products: ["lotel_rebar_ups"], member_types: ["slab_on_grade"] },
    limits: ["manufacturer suggestion for this product on slab-on-grade bar/mesh work \u2014 not a footing-mat density", "add a chair at heavy-traffic crossings per mfr"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-DENSITY-MESHUPS-AREA-HELD",
    domain: "support.density",
    statement: 'Lotel Mesh-ups "sq ft / 2" quantity rule \u2014 captured only through search extraction; the page text was not fully inspected.',
    params: { suggested_area_sqft_per_support: 2 },
    units: "sqft",
    logic: null,
    source_ref: src("CMP-SUP-021", 'Mesh-ups "how many" page (search-extracted)', "candidate"),
    corroborating_register_ids: [],
    applicability: { support_classes: ["snap_on"], products: ["lotel_mesh_ups"], member_types: ["slab_on_grade"] },
    limits: ["HELD: the quantity text was not directly inspected"],
    unsupported: ["unverified fragment \u2014 documents the gap"],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "SUP-DENSITY-DOBIE-CRSI-QUOTE-HELD",
    domain: "support.density",
    statement: "CRSI-derived rule as quoted in trade press: footing mats commonly use precast concrete block supports (dobies), not less than 4 blocks per footing mat spaced about 5 feet on center each way.",
    params: { min_blocks_per_footing_mat: 4, suggested_spacing_inches_each_way: 60 },
    units: "mixed",
    logic: null,
    source_ref: src("CMP-SUP-019", "footing dobie rule as quoted from CRSI Placing Reinforcing Bars"),
    corroborating_register_ids: ["CMP-SUP-018"],
    applicability: { member_types: ["footing_mat"], support_classes: ["dobie"] },
    limits: [
      "HELD: CRSI PRB is a paid standard not inspected (O-120); this is a secondary quotation",
      "consistent with the FDOT 4x4 block rule but density stays candidate until PRB is licensed"
    ],
    unsupported: ["paid-source content unverified \u2014 documents the licensing gap"],
    rule_version: "1.0.0",
    status: "held"
  },
  // ===== support.placement.mat — multi-mat rules =====
  {
    rule_id: "SUP-MAT-INDEPENDENT-SUPPORT",
    domain: "support.placement.mat",
    statement: "When two or more separate mats are required, each mat must be supported independently with an approved support system \u2014 an upper mat may not implicitly rest through the lower mat to the base.",
    params: {},
    units: null,
    logic: "per-layer support targets; an upper mat whose inter-layer gap cannot take a real support reports an issue, never an overlapping object",
    source_ref: src("CMP-SUP-013", "2404.03 E"),
    corroborating_register_ids: ["CMP-SUP-014"],
    applicability: { mat_layers: ["upper", "bottom"] },
    limits: [],
    unsupported: ["multi-mat (>2 layers) needs per-layer support rows"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-MAT-UPPER-OVER-LOWER-FDOT",
    domain: "support.placement.mat",
    statement: "Additional longitudinal beam layers are carried on heavy upper-beam bolsters placed directly over the low supports \u2014 a stacking alignment rule for multi-layer cages.",
    params: {},
    units: null,
    logic: "upper support column must align vertically over the lower support it bears on",
    source_ref: src("CMP-SUP-015", "415 - beams and caps"),
    corroborating_register_ids: [],
    applicability: { member_types: ["beam", "grade_beam"], mat_layers: ["upper"] },
    limits: ["beam/cap context"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== support.bearing_mode — bearing semantics =====
  {
    rule_id: "SUP-UPPER-NO-BASE-REACH",
    domain: "support.bearing_mode",
    statement: '"Upper" support types (SBU/BBU/CHCU/PSBU/UJC) rest on the lower steel mat or on soft material; their height is the clear inter-layer gap. They do not reach the pour bottom.',
    params: {},
    units: null,
    logic: "bearing_mode on_lower_mat: required support height = upper-mat underside - lower-mat top, NOT cover",
    source_ref: src("CMP-SUP-005", "SBU allowed use and limits"),
    corroborating_register_ids: ["CMP-SUP-003"],
    applicability: { bearing_modes: ["on_lower_mat"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-UPPER-ORIENTATION-PERPENDICULAR",
    domain: "support.bearing_mode",
    statement: "Upper-type bolsters install with runner wires perpendicular to the lower rebar and the supported upper rebar perpendicular across the top supporting wire \u2014 an orthogonal mat direction is required for correct bearing.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-005", "SBU installation"),
    corroborating_register_ids: [],
    applicability: { bearing_modes: ["on_lower_mat"], support_classes: ["continuous"] },
    limits: [],
    unsupported: ["parallel-bar layouts cannot take an upper bolster in this orientation"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-BEARING-CHCP-NO-STRADDLE",
    domain: "support.bearing_mode",
    statement: "CHCP (continuous high chair with plates) will NOT straddle lower steel \u2014 its continuous bearing plates prevent legs passing around a lower mat.",
    params: {},
    units: null,
    logic: "plate-bearing supports cannot be modeled as straddle mode",
    source_ref: src("CMP-SUP-003", "CHCP product facts"),
    corroborating_register_ids: [],
    applicability: { products: ["chcp"] },
    limits: [],
    unsupported: ["a plate chair asked to straddle a lower mat is incompatible, not resizable"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-CARRIER-BAR-SEPARATE-LINE",
    domain: "support.bearing_mode",
    statement: "HC individual high chairs support upper steel directly or by means of a carrier bar \u2014 a separate span piece the chairs hold up, which then carries the mat. CHC exists to eliminate carrier bars. A modeled carrier bar is its own BOM line.",
    params: {},
    units: null,
    logic: "carrier bar = separate span element; never folded silently into chair quantity",
    source_ref: src("CMP-SUP-009", "HC TDS inspected facts"),
    corroborating_register_ids: ["CMP-SUP-008"],
    applicability: {},
    limits: ["concept verified by manufacturer data; a public-spec spacing basis for carrier/support bars is still unlicensed"],
    unsupported: ["carrier-bar spacing rules seen only in a private-document fragment \u2014 no public-spec analogue registered"],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== support.geometry — height semantics and tall-support constraints =====
  {
    rule_id: "SUP-GEOMETRY-HEIGHT-DEFINITION",
    domain: "support.geometry",
    statement: "A support's working height is the clearance it maintains between its bearing surface and the underside of the supported bar. For a bottom mat on a flat base, required support height equals the specified bottom cover.",
    params: {},
    units: "inches",
    logic: "support_height = bearing_face to underside-of-bar clearance",
    source_ref: src("CMP-SUP-005", "SBU height semantics"),
    corroborating_register_ids: ["CMP-SUP-003", "CMP-SUP-021"],
    applicability: {},
    limits: ["catalog heights are nominal values"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-GEOMETRY-STAND-HEIGHT",
    domain: "support.geometry",
    statement: "Needed stand height = target mat underside elevation minus support bearing-surface elevation. Top-mat target underside = slab top - top cover - bar diameter; bearing surface = pour base (base-resting) or lower-mat top (upper types).",
    params: {},
    units: "inches",
    logic: "needed_stand_height = target_underside_inches - bearing_surface_elevation_inches",
    source_ref: src("CMP-SUP-009", "HC duty pattern - upper steel held above base"),
    corroborating_register_ids: ["CMP-SUP-005", "CMP-SUP-003"],
    applicability: {},
    limits: ["derivation rule for the O-024 model contract; the catalog row still must prove the height fits"],
    unsupported: ["a target more than the catalog max above the bearing surface = incompatible, not a stretched chair"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-GEOMETRY-TALL-CHAIR-BRACING",
    domain: "support.geometry",
    statement: "Individual high chairs over 12 inches require cross bracing or lacing of legs \u2014 a hard catalog constraint, confirmed on the manufacturer technical data sheet.",
    params: { max_unbraced_height_inches: 12 },
    units: "inches",
    logic: "required_height_inches > max_unbraced_height_inches => braced/laced support or a different system, never a plain tall chair",
    source_ref: src("CMP-SUP-009", "HC TDS - chairs over 12 inches require cross bracing or lacing"),
    corroborating_register_ids: ["CMP-SUP-001"],
    applicability: { support_classes: ["individual"], products: ["hc", "hcp", "individual_high_chair"] },
    limits: ["bracing/lacing and its labor are separate cost items \u2014 they cannot disappear from the BOM"],
    unsupported: ["mat target >12 in above bearing with an unbraced plain chair"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-GEOMETRY-TALL-CHAIR-LEG-ANGLE",
    domain: "support.geometry",
    statement: "SureBuilt wire-size table: high-chair legs are held at 20 degrees or less of lean-in when the chair height exceeds 12 inches; wire diameter steps up with height (HC .162 -> .312 across the range).",
    params: { max_leg_angle_degrees: 20, applies_above_height_inches: 12 },
    units: "deg",
    logic: null,
    source_ref: src("CMP-SUP-011", "Bar Support Wire Size table - HC row"),
    corroborating_register_ids: ["CMP-SUP-009"],
    applicability: { support_classes: ["individual"], products: ["hc"] },
    limits: ["wire-diameter-by-height is catalog data; do not derive a capacity in pounds from wire diameter"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-GEOMETRY-VARIABLE-DEPTH",
    domain: "support.geometry",
    statement: "Variable-depth (haunched or crowned) slabs need variable-height chairs to hold the top-mat position \u2014 a non-constant mat elevation breaks a single-height stand grid.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-014", "11.41 placement and checking"),
    corroborating_register_ids: [],
    applicability: { member_types: ["flat_slab", "deck"] },
    limits: [],
    unsupported: ["variable-depth slab with single-height support grid"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-GEOMETRY-LEG-UPTURN-MIN",
    domain: "support.geometry",
    statement: "All support legs are turned up a minimum of 1/8 inch; Iowa additionally requires upturned legs or a welded horizontal base bar, with legs cross-tied or nailed if needed to prevent spreading.",
    params: { min_leg_upturn_inches: 0.125 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-003", "handbook general notes"),
    corroborating_register_ids: ["CMP-SUP-013"],
    applicability: { support_classes: ["individual", "continuous"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== support.substrate — base-condition rules =====
  {
    rule_id: "SUP-SUBSTRATE-LOOSE-PLATE",
    domain: "support.substrate",
    statement: "Loosely compacted soil, rock, sand, carton forms or uneven bases require plate-bearing supports \u2014 the manufacturer pattern is a plate variant (HCP/SBP/BBP/CHCP) or an attached sand plate (R28, PSP, PTCSP); plates keep the support at elevation on loose substrate.",
    params: {},
    units: null,
    logic: "substrate class (firm form vs loose soil/sand/fill) is a support-selection input, not a height tweak",
    source_ref: src("CMP-SUP-007", "BBP allowed use and limits"),
    corroborating_register_ids: ["CMP-SUP-003", "CMP-SUP-002"],
    applicability: { substrates: ["loose_soil", "sand", "fill", "carton_form", "uneven"] },
    limits: ["a chair touching the bottom is not proof it will maintain mat elevation on a soft base"],
    unsupported: ["non-plate support on loose substrate"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SUBSTRATE-PROHIBITED-EMBEDS",
    domain: "support.substrate",
    statement: "No concrete block inserts, bricks, stones, wood blocks, wood stakes or similar embedded materials may be used as bar supports.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-013", "2404.03 E.4"),
    corroborating_register_ids: [],
    applicability: {},
    limits: [],
    unsupported: ["improvised embeddable scraps as supports"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SUBSTRATE-NONOXIDIZING-FLATSLAB",
    domain: "support.substrate",
    statement: "Formed flat slabs are supported with plastic chairs, precast concrete blocks, or other non-oxidizing slab bolsters sized to position the steel exactly \u2014 a durability/staining requirement.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-016", "flat slab work - placing"),
    corroborating_register_ids: [],
    applicability: { member_types: ["flat_slab"] },
    limits: ["bright-basic wire chairs at a formed exposed face risk oxidation staining"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SUBSTRATE-MEMBRANE",
    domain: "support.substrate",
    statement: "On membrane or vapor-barrier bases, wide-base or ring-base plastic chairs reduce puncture risk \u2014 treat membrane protection as a substrate input.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-021", "Rebar-ups base ring fact"),
    corroborating_register_ids: ["CMP-SUP-003"],
    applicability: { substrates: ["membrane", "vapor_barrier", "insulating_foam"] },
    limits: [],
    unsupported: ["point-load wire feet on puncture-sensitive membrane"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SUBSTRATE-SUSPENDED-ALT",
    domain: "support.substrate",
    statement: "In footings without piling (e.g., culvert floors), reinforcement may be suspended from cross wales, supported on steel stakes driven into the subgrade, or supported on chairs \u2014 a codified alternative to bearing supports.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-013", "2404.03 E"),
    corroborating_register_ids: [],
    applicability: { member_types: ["footing_mat"], usages: ["spread_foot"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-DOBIE-FOOTING-BLOCK-FDOT",
    domain: "support.substrate",
    statement: "Footing mat steel is supported on precast concrete blocks not greater than 4 in x 4 in x plan clearance, fastened by cast-in wires; block strength equal to or greater than the surrounding concrete, moist-cured at least three days, with certification of concrete class/batch.",
    params: { max_block_face_inches: 4, min_moist_cure_days: 3, block_height_basis: "plan_clearance_inches" },
    units: "mixed",
    logic: "earth-bearing footing bottom mats: dobie block footprint <= 4x4, block height = plan bottom clearance",
    source_ref: src("CMP-SUP-015", "415 - footings"),
    corroborating_register_ids: ["CMP-SUP-003"],
    applicability: { member_types: ["footing_mat"], support_classes: ["dobie"], substrates: ["earth", "loose_soil"] },
    limits: ["public-agency footing precedent \u2014 the codified earth-bearing answer"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-DOBIE-COLUMN-WALL-BLOCK-FDOT",
    domain: "support.substrate",
    statement: "Column and wall side spacing is maintained by precast blocks not exceeding 2 in x 2 in x required clearance, wired to the steel.",
    params: { max_block_face_inches: 2 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-015", "415 - columns and walls"),
    corroborating_register_ids: [],
    applicability: { member_types: ["column", "wall"], support_classes: ["dobie"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== support.compatibility — selection constraints =====
  {
    rule_id: "SUP-EPOXY-BARS-COATED-SUPPORTS",
    domain: "support.compatibility",
    statement: "Epoxy-coated bars require epoxy-coated steel or plastic bar supports and epoxy- or plastic-coated tie wires; epoxy wire can slide or break, so double-tie or use stronger ties where needed.",
    params: {},
    units: null,
    logic: "bar_coating epoxy => support finish must be coated/plastic and tie wire coated",
    source_ref: src("CMP-SUP-013", "2404.03 E"),
    corroborating_register_ids: ["CMP-SUP-014", "CMP-SUP-010"],
    applicability: { bar_coatings: ["epoxy"] },
    limits: [],
    unsupported: ["bare bright-basic supports or uncoated wire on epoxy bars"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-COMPAT-BARSIZE-PER-SKU",
    domain: "support.compatibility",
    statement: "Supported-bar size range is a per-catalog-row fact (PCC/PTC/PBC fit up to #8; Lotel chairs take #3-#5; PEZS takes #3-#10; foundation wheels take #7-#11). A bar outside the authored range is incompatible \u2014 it must not be clamped into the cradle list.",
    params: {},
    units: null,
    logic: "catalog row rebar_support_compatible_bar_sizes is authoritative per SKU",
    source_ref: src("CMP-SUP-003", "product bar-size fits"),
    corroborating_register_ids: ["CMP-SUP-021"],
    applicability: {},
    limits: [],
    unsupported: ["bar size outside the catalog compatibility list"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-COMPAT-DECK-PROFILE",
    domain: "support.compatibility",
    statement: "Metal-deck supports (HCM/CHCM/HCMD families) require the deck profile dimensions to order \u2014 support compatibility can depend on the bearing-surface profile, not just height.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-010", "HCMD ordering note"),
    corroborating_register_ids: ["CMP-SUP-003"],
    applicability: { substrates: ["metal_deck"], products: ["hcm", "chcm", "hcmd"] },
    limits: [],
    unsupported: ["deck-profile support selected without deck profile dimensions"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-COMPAT-SUBFREEZING-SNAPON",
    domain: "support.compatibility",
    statement: "Lotel snap-on supports are not recommended for installation in subfreezing temperature \u2014 a placement-condition constraint on clip-on products.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-021", "Rebar-ups installation note"),
    corroborating_register_ids: [],
    applicability: { support_classes: ["snap_on"], products: ["lotel_rebar_ups", "lotel_mesh_ups"] },
    limits: [],
    unsupported: ["subfreezing installation of snap-on chairs"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-COMPAT-DRILLED-SHAFT-POSITIONER",
    domain: "support.compatibility",
    statement: "Drilled-shaft (caisson/pier) cages are positioned by cage wheels or centralizers engineered for #7-#11 bars, not by mat chairs \u2014 the support kind differs wholesale.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-003", "BarTender wheel and Paragon centralizer facts"),
    corroborating_register_ids: [],
    applicability: { member_types: ["drilled_shaft", "pillar_cage"], support_classes: ["positioner"] },
    limits: [],
    unsupported: ["chair/bolster selection for a drilled-shaft cage"],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== support.compatibility — pillar-bar / base-plate entries (O-111) =====
  {
    rule_id: "SUP-COMPAT-PILLAR-BAR-LONGITUDINAL",
    domain: "support.compatibility",
    statement: "A pillar/column cage's longitudinal bars run vertically through the shaft \u2014 the pillar bar is the cage's vertical member carried on the cage's own stand, not a slab-chair/bolster selection. The pillar bar's support kind is the drilled-shaft/cage class, never a flat-slab chair.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-003", "cage vs slab support taxonomy \u2014 drilled-shaft cages are positioned by wheels/centralizers, not mat chairs"),
    corroborating_register_ids: ["CMP-SUP-003", "CMP-SUP-010"],
    applicability: { member_types: ["pillar", "pillar_cage", "drilled_shaft"], support_classes: ["positioner", "cage_stand"] },
    limits: [],
    unsupported: ["a pillar bar's vertical bar size/count is a structural design input, not a register constant \u2014 the entry records the support kind only"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-COMPAT-BASE-PLATE-ON-SHAFT",
    member_types: ["base_plate"],
    usages: ["sign_pole", "shaft_mount"],
    statement: "A base plate mounts the sign pole on the drilled shaft's top \u2014 the plate's support kind is the shaft-mount class, not a flat-slab chair. The base plate's support is the shaft's top bearing, never a mat support.",
    usage_note: "base_plate member_types + sign_pole/shaft_mount usages record the support-kind distinction",
    source_ref: src("CMP-SUP-024", "base-plate mounting via manufacturer catalog", "candidate"),
    rule_version: "1.0.0",
    status: "active",
    unsupported: ["base-plate anchor bolt sizing is a structural design input, not a register constant \u2014 the entry records the support kind only"]
  },
  {
    rule_id: "SUP-PLACE-PILLAR-CAGE-STAND",
    domain: "support.placement",
    member_types: ["pillar", "pillar_cage", "drilled_shaft"],
    usages: ["cage_stand"],
    statement: "The pillar cage's cage_stand is a separate support from the footing mat \u2014 each mat is independently supported (corpus: 'each mat independently supported'). The cage_stand carries the cage's longitudinal bars; it never doubles as the mat's chair.",
    usage_note: "cage_stand usages on pillar/drilled-shaft member types record the independent-support rule",
    source_ref: src("CMP-SUP-013", "each mat independently supported (Iowa DOT 2404 / Utah APWA spacing ceilings)"),
    rule_version: "1.0.0",
    status: "active",
    unsupported: ["cage-stand count/spacing is a structural design input, not a register constant \u2014 the entry records the independent-support rule only"]
  },
  {
    rule_id: "SUP-PLACE-BASE-PLATE-LOOSE-SOIL",
    domain: "support.placement",
    member_types: ["base_plate"],
    usages: ["shaft_mount"],
    statement: "A base plate on loose soil requires a bearing plate \u2014 'plates required on loose soil' (corpus critical rule). A base plate on undisturbed/competent soil carries the shaft mount directly; loose soil holds the plate requirement, never a silent default.",
    usage_note: "base_plate member_types + shaft_mount usages record the loose-soil plate requirement",
    source_ref: src("CMP-SUP-013", "plates required on loose soil (manufacturer placement guidance)"),
    rule_version: "1.0.0",
    status: "active",
    unsupported: ["plate sizing is a structural design input, not a register constant \u2014 the entry records the loose-soil requirement only"]
  },
  // ===== support.catalog — catalog-row modeling rules =====
  {
    rule_id: "SUP-CATALOG-PER-SKU-RANGES",
    domain: "support.catalog",
    statement: "Height ranges and increments are per-manufacturer per-SKU facts \u2014 Dayton HC runs 2-15 in, Meadow Burke HC 2-40 in, Dayton SB 3/4-3 in while SureBuilt SB runs 3/4-7 in. Catalog data lives on the SKU row, never as a global type constant.",
    params: {},
    units: "inches",
    logic: "store height_min/height_max/increment per inventory row",
    source_ref: src("CMP-SUP-010", "cross-manufacturer range comparison"),
    corroborating_register_ids: ["CMP-SUP-003", "CMP-SUP-011"],
    applicability: {},
    limits: [],
    unsupported: ["required height outside the selected product's verified range = incompatibility, not a stretched value"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-CATALOG-BELOWGRADE-TAGGING",
    domain: "support.catalog",
    statement: "The manufacturer application matrix tags foundation/below-grade use for cementitious dobies, plastic chairs, foundation wheels/centralizers and side-form spacers \u2014 Dayton metal wire chair/bolster families are NOT tagged for foundation/below-grade. An untagged wire chair on an earth-bearing footing bottom mat gets flagged for review, not silently selected.",
    params: {},
    units: null,
    logic: "foundation_usage tagging is a manufacturer-stated applicability boundary",
    source_ref: src("CMP-SUP-003", "product application matrix"),
    corroborating_register_ids: [],
    applicability: { usages: ["spread_foot"], substrates: ["earth", "loose_soil"] },
    limits: ["a manufacturer application claim, not a structural adequacy proof"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-CATALOG-HCP-HEIGHT-CONFLICT-HELD",
    domain: "support.catalog",
    statement: "Dayton HCP product page is internally inconsistent: Cover Height section says 2-12 in in 1/4-in increments while the Features section claims 1/2-15 in. Neither interval is authoritative from this page alone.",
    params: { page_cover_height_min_inches: 2, page_cover_height_max_inches: 12, page_features_height_min_inches: 0.5, page_features_height_max_inches: 15 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-002", "inspected product facts and conflict", false),
    corroborating_register_ids: [],
    applicability: { products: ["hcp"] },
    limits: ["HELD: unresolved manufacturer-internal inconsistency; cannot authorize an automatic 0.5-15 in range"],
    unsupported: ["any automatic height-range claim for HCP until the TDS is inspected"],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "SUP-CATALOG-SBU-RANGE-DISPUTED-HELD",
    domain: "support.catalog",
    statement: "SBU product-specification height is 3/4-5 in on the Dayton TDS while the Dayton handbook body text says 3/4-3 in \u2014 an unresolved manufacturer-internal discrepancy; do not assume the deeper range without SKU-level confirmation.",
    params: { tds_height_max_inches: 5, handbook_height_max_inches: 3, documented_height_min_inches: 0.75 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-005", "product specification vs handbook discrepancy"),
    corroborating_register_ids: ["CMP-SUP-003"],
    applicability: { products: ["sbu"] },
    limits: ["HELD: verified sources conflict; the deeper range stays unconfirmed at SKU level"],
    unsupported: ["assuming the 5-inch top end without SKU-level confirmation"],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "SUP-CATALOG-UNIT-LENGTHS",
    domain: "support.catalog",
    statement: "Continuous-support unit length is a per-row fact: wire bolsters run 5 ft standard, Aztec PSBB is 30-in interlocking sections (5 ft/10 ft packs), Meadow Burke composite bolsters are true 60 in, and CS continuous support has a 7 ft usable span billed as 8 ft.",
    params: { standard_wire_unit_length_inches: 60 },
    units: "inches",
    logic: "linear-feet quantity = ceil(run_length / unit_length) per row; pack arithmetic differs across families",
    source_ref: src("CMP-SUP-003", "product unit lengths"),
    corroborating_register_ids: ["CMP-SUP-010", "CMP-SUP-012"],
    applicability: { support_classes: ["continuous"] },
    limits: ["ordering increments and pack basis still require live inventory data; no cost basis established by these facts"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-CATALOG-LOAD-RATING-FIELD",
    domain: "support.catalog",
    statement: '"CRSI Load Category" marks (SB/SBU 200 lb, PSBB 400 lb) and point ratings (BB 2-inch = 180 lb point / 270 plf, PHC <= 500 lb) are manufacturer-declared rating classes \u2014 store as a catalog rating field, never as a structural-adequacy proof for a given mat.',
    params: {},
    units: "lb",
    logic: null,
    source_ref: src("CMP-SUP-012", "CRSI Load Category 400 lb mark"),
    corroborating_register_ids: ["CMP-SUP-004", "CMP-SUP-005", "CMP-SUP-006"],
    applicability: {},
    limits: ["the defining documents (CRSI RB4.1) were not inspected \u2014 O-120"],
    unsupported: ["converting a declared rating into a per-mat adequacy claim"],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== support.finish — corrosion class rules =====
  {
    rule_id: "SUP-FINISH-CLASS-SYSTEM",
    domain: "support.finish",
    statement: "CRSI support finish classes: Class 1 plastic-protected (severe exposure / grinding or sandblasting required); Class 1A epoxy/vinyl/plastic-coated (moderate-to-maximum exposure, no grinding \u2014 typical with epoxy bars); Class 2A/2B stainless-protected (moderate exposure + light grinding under 1/16 in; non-stainless wire setback 1/4 in (2A) / 3/4 in (2B) from the face); Class 3 bright basic (no protection, no exposed-surface contact).",
    params: { class_2a_setback_inches: 0.25, class_2b_setback_inches: 0.75 },
    units: "inches",
    logic: "coating class is a catalog attribute driven by bar coating + exposure surface + ground contact",
    source_ref: src("CMP-SUP-003", "Rust Prevention / support classes"),
    corroborating_register_ids: ["CMP-SUP-010"],
    applicability: {},
    limits: ["class system per manufacturer-declared compliance; defining CRSI documents uninspected"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-FINISH-EPOXY-BARS-CLASS-1A",
    domain: "support.finish",
    statement: "Class 1A epoxy/vinyl/plastic-coated bright-basic wire is the standard support finish for epoxy-coated bars (moderate to maximum exposure where no grinding or sandblasting is required).",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-003", "support classes"),
    corroborating_register_ids: ["CMP-SUP-010", "CMP-SUP-013"],
    applicability: { bar_coatings: ["epoxy"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-FINISH-PLASTIC-ALL-CLASSES",
    domain: "support.finish",
    statement: "Plastic (all-plastic/composite) supports are permitted for all corrosion-resistance classifications \u2014 they sidestep the wire-finish class question.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-003", "Rust Prevention note"),
    corroborating_register_ids: [],
    applicability: {},
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== tie.pattern — where ties are required =====
  {
    rule_id: "TIE-INTERSECTIONS-ALL-OR-ALTERNATE",
    domain: "tie.pattern",
    statement: "Tie reinforcing bars at all intersections; where bar spacing is less than 12 inches in each direction, tie alternate intersections instead (Iowa and Utah APWA adopt the same pattern).",
    params: { alternate_tie_bar_spacing_lt_inches: 12 },
    units: "inches",
    logic: "bar_spacing < 12 in each direction => alternate intersections; otherwise tie all",
    source_ref: src("CMP-SUP-013", "2404.03 D"),
    corroborating_register_ids: ["CMP-SUP-016"],
    applicability: {},
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-TOPMAT-DOWN-MAX",
    domain: "tie.pattern",
    statement: "Top mat tied down at not greater than 4 ft spacing in each direction with at least 50% of bar contacts tied, concentrated near ends and curbs (bridge-floor practice).",
    params: { max_tiedown_spacing_inches_each_way: 48, min_tied_contact_fraction: 0.5 },
    units: "mixed",
    logic: null,
    source_ref: src("CMP-SUP-014", "11.41 bridge floors"),
    corroborating_register_ids: [],
    applicability: { mat_layers: ["upper"] },
    limits: ["bridge-deck inspector guidance \u2014 heavier-duty than light sign work but a valid public ceiling"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-FOOTING-PATTERN-FDOT",
    domain: "tie.pattern",
    statement: "Footing mats are tied with a double-strand single tie at all periphery intersections and alternate intersections within the mat.",
    params: {},
    units: null,
    logic: "periphery all-tied double-strand + interior alternate",
    source_ref: src("CMP-SUP-015", "415 - footings"),
    corroborating_register_ids: [],
    applicability: { member_types: ["footing_mat"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-WALL-COLUMN-PATTERNS-FDOT",
    domain: "tie.pattern",
    statement: "Retaining-wall steel is tied cross/figure-8 at every periphery intersection and every third interior intersection (more if the mat is used as a ladder); columns get a cross or figure-8 tie at every hoop intersection.",
    params: { wall_interior_tie_every_nth: 3 },
    units: "count",
    logic: null,
    source_ref: src("CMP-SUP-015", "415 - walls and columns"),
    corroborating_register_ids: [],
    applicability: { member_types: ["wall", "column"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-STAINLESS-FRP-WIRE",
    domain: "tie.pattern",
    statement: "Stainless bars use plastic/polymer/nylon-coated or ASTM A276 UNS S31600 stainless tie wire; FRP reinforcement uses coated wire.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-015", "415 - tie wire"),
    corroborating_register_ids: [],
    applicability: { bar_coatings: ["stainless", "frp"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-EPOXY-WIRE-DOUBLE",
    domain: "tie.pattern",
    statement: "Epoxy-coated tie wire can slide or break on epoxy bars \u2014 double-tie or use stronger ties where needed.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-014", "epoxy-coated bar note"),
    corroborating_register_ids: ["CMP-SUP-013"],
    applicability: { bar_coatings: ["epoxy"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== tie.wire — material rules =====
  {
    rule_id: "TIE-WIRE-GAUGE-MIN",
    domain: "tie.wire",
    statement: "Tie wire minimum 16-gage annealed type or an acceptable patented system; heavily reinforced work steps to 15- or 14-gauge (or double-strand).",
    params: { max_tie_wire_gauge_awg: 16, heavy_work_gauge_awg: [15, 14] },
    units: "awg",
    logic: "minimum 16-gage means the AWG NUMBER must be <= 16 (heavier wire = smaller number); patented mechanical systems are an allowed alternative",
    source_ref: src("CMP-SUP-016", "accessory materials"),
    corroborating_register_ids: ["CMP-SUP-017"],
    applicability: {},
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-WIRE-WEIGHT-PER-TON",
    domain: "tie.wire",
    statement: "About 12 pounds of tie wire per average ton of bars \u2014 an estimating quantity basis, not a structural value.",
    params: { approx_tie_wire_lb_per_ton_bars: 12 },
    units: "lb_per_ton",
    logic: "tie_wire_lb = approx_tie_wire_lb_per_ton_bars * bar_weight_tons",
    source_ref: src("CMP-SUP-017", "placing and tying"),
    corroborating_register_ids: [],
    applicability: {},
    limits: ["dated military-manual average; corroborating estimate basis, not a spec value"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-WIRE-NO-STRENGTH",
    domain: "tie.wire",
    statement: "Tie wire adds NOTHING to structural strength \u2014 it only holds bar position during placement.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-017", "placing and tying"),
    corroborating_register_ids: [],
    applicability: {},
    limits: [],
    unsupported: ["crediting tie wire with structural capacity"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-TYPES-TAXONOMY",
    domain: "tie.wire",
    statement: "Six tie types with stated uses: snap/simple tie (floor slabs), wall tie (light vertical mats), double-strand single tie (heavy work), saddle/U tie (special locations e.g. walls), saddle tie with twist (mats crane-lifted), cross/figure-8 tie (little or no bar twist; columns, retaining walls).",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-017", "tie types"),
    corroborating_register_ids: ["CMP-SUP-015"],
    applicability: {},
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== clearance.cover — cover floors (verified-as-quoted ACI values) =====
  {
    rule_id: "CLR-COVER-EARTH-CAST-FOOTING",
    domain: "clearance.cover",
    statement: "Concrete cast against and permanently exposed to earth (footing bottoms and sides): minimum cover 3 inches. A sign footing poured against earth is a 3-inch class.",
    params: { min_cover_inches: 3 },
    units: "inches",
    logic: "earth-cast footing support height = 3 in bottom cover at the bearing face",
    source_ref: src("CMP-SUP-023", "ACI 20.5.1.3.1 values via public quotation"),
    corroborating_register_ids: ["CMP-SUP-017"],
    applicability: { exposures: ["cast_against_earth"], member_types: ["footing_mat", "grade_beam"] },
    limits: ["value via public quotation of a paid standard; ACI 318 itself uninspected (O-120)"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "CLR-COVER-FORMED-EXPOSED-GT5",
    domain: "clearance.cover",
    statement: "Formed cast-in-place concrete exposed to earth or weather: minimum cover 2 inches for #6 through #18 bars.",
    params: { min_cover_inches: 2 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-023", "ACI 20.5.1.3.1 values via public quotation"),
    corroborating_register_ids: ["CMP-SUP-017"],
    applicability: { exposures: ["formed_earth_or_weather"], bar_size_class: "gt_#5" },
    limits: ["verified-as-quoted, not inspected at source"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "CLR-COVER-FORMED-EXPOSED-LE5",
    domain: "clearance.cover",
    statement: "Formed cast-in-place concrete exposed to earth or weather: minimum cover 1-1/2 inches for #5 and smaller bars.",
    params: { min_cover_inches: 1.5 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-023", "ACI 20.5.1.3.1 values via public quotation"),
    corroborating_register_ids: ["CMP-SUP-017"],
    applicability: { exposures: ["formed_earth_or_weather"], bar_size_class: "le_#5" },
    limits: ["verified-as-quoted, not inspected at source"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "CLR-COVER-INTERIOR",
    domain: "clearance.cover",
    statement: "Not-exposed interior members: slabs/walls/joists 3/4 inch for #11 and smaller (1-1/2 in for #14/#18); beams and columns primary reinforcement plus ties 1-1/2 inches; shells 3/4 in (#6+) / 1/2 in (#5 and smaller).",
    params: { interior_slabs_le11_inches: 0.75, interior_beams_columns_inches: 1.5, interior_shells_gt5_inches: 0.75, interior_shells_le5_inches: 0.5 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-023", "interior exposure rows via public quotation"),
    corroborating_register_ids: ["CMP-SUP-017"],
    applicability: { exposures: ["interior"] },
    limits: ["verified-as-quoted, not inspected at source"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== clearance.tolerance — placement tolerances =====
  {
    rule_id: "CLR-TOL-FDOT-PLACEMENT",
    domain: "clearance.tolerance",
    statement: "FDOT placement tolerances: bar spacing +/-1 inch from plan; concrete cover -1/4 to +1/2 inch from plan.",
    params: { bar_spacing_tol_inches: 1, cover_tol_minus_inches: 0.25, cover_tol_plus_inches: 0.5 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-015", "415 - tolerances"),
    corroborating_register_ids: [],
    applicability: {},
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "CLR-TOL-FDOT-FOOTING-MAT",
    domain: "clearance.tolerance",
    statement: "Footing mat placed within 1/2 inch vertically of plan bottom clearance and within 1 inch of plan side clearance.",
    params: { vertical_position_tol_inches: 0.5, side_clearance_tol_inches: 1 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-015", "415 - footings"),
    corroborating_register_ids: [],
    applicability: { member_types: ["footing_mat"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "CLR-TOL-IOWA-PLACEMENT",
    domain: "clearance.tolerance",
    statement: "Iowa inspector tolerances: bar spacing within 1/2 inch of specified; edge and end clearances plan value minus zero / plus 1/2 inch; deck bottom clearance -1/8/+1/4 inch; top-mat depth held within -1/4 inch; slab thickness -0/+3/4 inch; cover over top mat nominal minus 1/8 inch.",
    params: { bar_spacing_tol_inches: 0.5, edge_end_clearance_plus_inches: 0.5, bottom_clearance_minus_inches: 0.125, bottom_clearance_plus_inches: 0.25, top_mat_depth_minus_inches: 0.25, slab_thickness_plus_inches: 0.75 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-014", "11.40-11.41 tolerances"),
    corroborating_register_ids: [],
    applicability: {},
    limits: ["bridge-work inspector guidance"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "CLR-CATALOG-NOMINAL-TOLERANCE",
    domain: "clearance.tolerance",
    statement: "Catalog support heights are nominal \u2014 placement tolerances mean a minus-1/8-inch working tolerance exists in practice; a support at its exact nominal limit has no margin.",
    params: { nominal_height_minus_inches: 0.125 },
    units: "inches",
    logic: "flag when required height sits within tolerance band of the catalog limit",
    source_ref: src("CMP-SUP-014", "clearance tolerance basis"),
    corroborating_register_ids: ["CMP-SUP-015"],
    applicability: {},
    limits: ["inference from stated placement tolerances, not a catalog print spec"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== stock.* — reinforcement stock rules =====
  {
    rule_id: "STOCK-LAP-SPLICE-DEFAULT",
    domain: "stock.splice",
    statement: "Where lap splices are not dimensioned on the plans, lap not less than 30 bar diameters nor less than 12 inches.",
    params: { min_lap_bar_diameters: 30, min_lap_inches: 12 },
    units: "mixed",
    logic: "lap_length = max(30 * bar_diameter, 12 in)",
    source_ref: src("CMP-SUP-017", "default lap splice guidance"),
    corroborating_register_ids: [],
    applicability: {},
    limits: ["dated military manual; a dimensioned plan or governing spec supersedes"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "STOCK-MESH-LAP-PATTERN",
    domain: "stock.splice",
    statement: "Welded-wire mesh: end-lap tied at 1 ft 6 in centers with a snap tie; side-lap tied at 3 ft with a snap tie.",
    params: { mesh_end_lap_tie_spacing_inches: 18, mesh_side_lap_tie_spacing_inches: 36 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-017", "wire-mesh lap guidance"),
    corroborating_register_ids: [],
    applicability: { member_types: ["slab_on_grade"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "STOCK-DOWEL-TEMPLATE-FDOT",
    domain: "stock.placement",
    statement: "Dowel bars projecting into columns or walls are positioned by a rigid template BEFORE the footing pour \u2014 never inserted into plastic concrete.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-015", "415 - dowel bars"),
    corroborating_register_ids: [],
    applicability: { member_types: ["footing_mat", "column", "wall"] },
    limits: [],
    unsupported: ["dowels pushed into plastic concrete"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "STOCK-STORAGE-ABOVE-GROUND",
    domain: "stock.placement",
    statement: "Reinforcement is stored above ground on platforms or skids; thin tight rust is acceptable but section loss is a rejection cause; no field welding or flame cutting without approval.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-015", "415 - storage"),
    corroborating_register_ids: [],
    applicability: {},
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== authority.marker — paid-standard citation markers (O-120) =====
  {
    rule_id: "AUTH-CRSI-MSP-HELD",
    domain: "authority.marker",
    statement: "CRSI Manual of Standard Practice (referenced as 28th/29th edition by manufacturers) is the industry-standard bar-support and placing authority that Iowa DOT, FDOT, Utah APWA and every manufacturer catalog defer to by name. Contents are paid and were not inspected.",
    params: {},
    units: null,
    logic: "any rule phrased 'per CRSI MSP' in output is a citation of this marker, not verified content",
    source_ref: src("CMP-SUP-024", "CRSI Manual of Standard Practice marker", "candidate"),
    corroborating_register_ids: ["CMP-SUP-013", "CMP-SUP-015", "CMP-SUP-016"],
    applicability: {},
    limits: ["HELD: paid standard \u2014 citation marker only (O-120); no content reproduced"],
    unsupported: ["licensed MSP copy required before MSP-specific values can gate"],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "AUTH-CRSI-PRB-HELD",
    domain: "authority.marker",
    statement: 'CRSI "Placing Reinforcing Bars" (9th/10th ed) is cited by spec writers as the definitive jobsite placement resource; its Chapter 10 covers bar supports and Chapter 12 footings. Only the free TOC was inspected; content is paid.',
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-018", "PRB 10th-edition TOC + 2011 press release", "candidate"),
    corroborating_register_ids: ["CMP-SUP-024"],
    applicability: {},
    limits: ["HELD: TOC verified, numeric content candidate until licensed"],
    unsupported: ["the footing dobie 4-per-mat rule stays held until PRB is licensed"],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "AUTH-ACI-315-HELD",
    domain: "authority.marker",
    statement: 'ACI 315 / ACI 315R "Details and Detailing of Concrete Reinforcement" is repeatedly named as the installation basis on manufacturer data sheets ("Per ACI 315-99"). Not inspected \u2014 citation marker only.',
    params: {},
    units: null,
    logic: "estimator output must not claim 'per ACI 315' until the standard is licensed and read",
    source_ref: src("CMP-SUP-024", "ACI 315 marker", "candidate"),
    corroborating_register_ids: ["CMP-SUP-004", "CMP-SUP-008"],
    applicability: {},
    limits: ["HELD: paid standard \u2014 citation marker only (O-120)"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "AUTH-ACI-318-HELD",
    domain: "authority.marker",
    statement: 'ACI 318 "Building Code Requirements for Structural Concrete" holds the cover table whose values appear in CLR-COVER-* via public quotation (CMP-SUP-023). The standard itself was not inspected.',
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-024", "ACI 318 marker", "candidate"),
    corroborating_register_ids: ["CMP-SUP-023"],
    applicability: {},
    limits: ["HELD: paid standard \u2014 citation marker only (O-120)"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "AUTH-ACI-301-HELD",
    domain: "authority.marker",
    statement: 'ACI 301 "Specifications for Structural Concrete" is the typical building-spec source of the chair/bolster spacing clauses seen in public agency specs. Not inspected \u2014 citation marker only.',
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-024", "ACI 301 marker", "candidate"),
    corroborating_register_ids: ["CMP-SUP-016"],
    applicability: {},
    limits: ["HELD: paid standard \u2014 citation marker only (O-120)"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "AUTH-CRSI-RB41-HELD",
    domain: "authority.marker",
    statement: 'CRSI RB4.1-2022 (bar-support product standard) and the "CRSI Load Category" ratings (200/400 lb) are manufacturer-declared compliance marks; the defining documents were not inspected.',
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-024", "CRSI RB4.1 marker", "candidate"),
    corroborating_register_ids: ["CMP-SUP-003", "CMP-SUP-012"],
    applicability: {},
    limits: ["HELD: paid standard \u2014 citation marker only (O-120)"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "AUTH-ASTM-AASHTO-MATERIAL-HELD",
    domain: "authority.marker",
    statement: "Material spec markers referenced by the corpus: ASTM A1064 (support wire), A615/A706 (bars), A184/A185 (welded wire), A775 (epoxy), A493 (stainless wire), AASHTO M254 (bar supports). Not inspected \u2014 citation markers only.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-024", "ASTM/AASHTO spec list", "candidate"),
    corroborating_register_ids: [],
    applicability: {},
    limits: ["HELD: paid/restricted standards \u2014 citation markers only (O-120)"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "AUTH-WHITACRE-TAXONOMY-HELD",
    domain: "authority.marker",
    statement: "Whitacre Rebar product line corroborates the support-type taxonomy breadth (composite/high chairs, sand plates, mesh and paving chairs, double-mat extensions, shims, side-form spacers, tie wire) \u2014 captured via search-index extraction only.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-020", "product page via search-index text", "candidate"),
    corroborating_register_ids: [],
    applicability: {},
    limits: ["HELD: page captured without data-sheet depth; taxonomy corroboration only"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "held"
  },
  // ===== method.* — O-113 skeleton encoding (registered-but-unencoded method
  // rules; status "held" until a real cited method lands). =====
  {
    rule_id: "METHOD-SIGN-WIND-HELD",
    domain: "method.sign_wind",
    statement: "Sign wind load basis is held pending a real cited sign-wind method; no invented force/area/eccentricity formula is encoded.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no sign-wind method is encoded; the authored sign_wind design-basis field carries the operator's basis"],
    unsupported: ["wind force/area/height/eccentricity method; solid-vs-open sign treatment; single/twin support"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "METHOD-FOOTING-BEARING-HELD",
    domain: "method.footing",
    statement: "Spread-footing bearing/overturning/sliding/uplift basis is held pending a real cited footing method; no invented 'adequate' flag is encoded.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no footing check is encoded; the authored footing_basis field carries the operator's basis"],
    unsupported: ["bearing/overturning/sliding/uplift/frost as distinct checks"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "METHOD-SHAFT-HELD",
    domain: "method.shaft",
    statement: "Drilled-shaft/embedded-pole basis is held pending a real cited shaft method; lateral soil pressure vs vertical bearing is not encoded.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no shaft method is encoded; the authored shaft_basis field carries the operator's basis"],
    unsupported: ["constrained/nonconstrained; depth/soil limits; lateral soil pressure vs vertical bearing"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "METHOD-PILLAR-BAR-HELD",
    domain: "method.pillar_bar",
    statement: "Pillar longitudinal-bar sizing/placement basis is held pending a real cited method; the design-basis field carries the operator's entry.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no pillar-bar method is encoded; the authored pillar_bar field carries the operator's basis"],
    unsupported: ["pillar-bar sizing; base-plate connection detailing"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "METHOD-BASE-PLATE-HELD",
    domain: "method.base_plate",
    statement: "Base-plate sizing/anchor basis is held pending a real cited method; the design-basis field carries the operator's entry.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no base-plate method is encoded; the authored base_plate field carries the operator's basis"],
    unsupported: ["base-plate sizing; anchor layout"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "METHOD-LATERAL-HELD",
    domain: "method.lateral",
    statement: "Lateral-load/footing-lateral basis is held pending a real cited method; the design-basis field carries the operator's entry.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no lateral-load method is encoded; the authored lateral field carries the operator's basis"],
    unsupported: ["lateral-load sizing; footing lateral resistance"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "METHOD-FROST-HELD",
    domain: "method.frost_depth",
    statement: "Frost-depth/footing-depth basis is held pending a real cited method; the design-basis field carries the operator's entry.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no frost-depth method is encoded; the authored frost_depth field carries the operator's basis"],
    unsupported: ["frost-depth sizing; footing embedment"],
    rule_version: "0.0.0",
    status: "held"
  }
]);
function gatedChecks(params) {
  const checks = [];
  for (const key of Object.keys(params)) {
    const prefix = GATED_PREFIXES.find((p) => key.startsWith(p));
    if (!prefix) {
      checks.push({ key, gated: false, param: key, comparator: "informational", limit: params[key] });
      continue;
    }
    const comparator = prefix.slice(0, -1);
    checks.push({ key, gated: true, param: key.slice(prefix.length), comparator, limit: params[key] });
  }
  return checks;
}
function normalizeRule(rule) {
  const errors = [];
  const warnings = [];
  if (!isRecord(rule)) return { ok: false, errors: ["rule must be a plain record"], warnings };
  const rule_id = text(rule.rule_id);
  if (!rule_id || !RULE_ID.test(rule_id)) errors.push("rule_id must be an UPPER-KEBAB stable identifier");
  const domain = text(rule.domain);
  if (!domain || !DOMAIN_ID.test(domain)) errors.push("domain must be a lowercase dotted identifier");
  const statement = text(rule.statement);
  if (!statement || statement.length > 4e3) errors.push("statement must be 1-4000 characters");
  const params = rule.params === void 0 ? {} : rule.params;
  if (!isRecord(params)) errors.push("params must be a plain record when present");
  else {
    for (const [key, value] of Object.entries(params)) {
      if (!text(key)) errors.push("params keys must be nonempty strings");
      if (typeof value === "number" && !Number.isFinite(value)) errors.push(`params.${key} must be finite`);
      if (![null, "number", "string", "boolean"].includes(value === null ? null : typeof value) && !Array.isArray(value)) {
        errors.push(`params.${key} has an unsupported value type`);
      }
    }
  }
  const sref = rule.source_ref;
  if (!isRecord(sref)) {
    errors.push("source_ref is required for every registry rule");
  } else {
    if (!text(sref.register_id) || !REGISTER_ID.test(sref.register_id)) {
      errors.push("source_ref.register_id must match the CMP-SUP-### register-id shape");
    }
    if (!text(sref.authority)) errors.push("source_ref.authority is required");
    if (!text(sref.title)) errors.push("source_ref.title is required");
    if (!VERIFIED_VALUES.has(sref.verified)) {
      errors.push("source_ref.verified must be true, false or 'candidate'");
    }
    if (sref.edition !== void 0 && sref.edition !== null && typeof sref.edition !== "string") {
      errors.push("source_ref.edition must be a string or null");
    }
    if (sref.section !== void 0 && sref.section !== null && typeof sref.section !== "string") {
      errors.push("source_ref.section must be a string or null");
    }
    if (sref.url !== void 0 && sref.url !== null && typeof sref.url !== "string") {
      errors.push("source_ref.url must be a string or null");
    }
  }
  let status = text(rule.status) || "active";
  if (!STATUSES.has(status)) {
    errors.push("status must be 'active' or 'held'");
    status = "held";
  }
  if (isRecord(sref) && sref.verified !== true && status === "active") {
    warnings.push(`rule ${rule_id} declared active with source verified=${String(sref.verified)}; coerced to held`);
    status = "held";
  }
  const rule_version = text(rule.rule_version);
  if (!rule_version || !SEMVER.test(rule_version)) errors.push("rule_version must be semver (x.y.z)");
  const applicability = rule.applicability === void 0 ? {} : rule.applicability;
  if (!isRecord(applicability)) {
    errors.push("applicability must be a plain record when present");
  } else {
    for (const [key, value] of Object.entries(applicability)) {
      if (APPLICABILITY_LIST_KEYS.has(key)) {
        if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
          errors.push(`applicability.${key} must be an array of nonempty strings`);
        }
      } else if (key === "bar_size_class") {
        if (!["le_#5", "gt_#5", null, void 0].includes(value)) {
          errors.push("applicability.bar_size_class must be 'le_#5', 'gt_#5' or null");
        }
      } else {
        warnings.push(`applicability key '${key}' is not a registered filter dimension; it is kept as documentation`);
      }
    }
  }
  for (const listKey of ["limits", "unsupported", "corroborating_register_ids"]) {
    const list = rule[listKey];
    if (list !== void 0 && (!Array.isArray(list) || list.some((entry) => typeof entry !== "string" || !entry.trim()))) {
      errors.push(`${listKey} must be an array of strings when present`);
    }
  }
  if (Array.isArray(rule.corroborating_register_ids)) {
    for (const id of rule.corroborating_register_ids) {
      if (!REGISTER_ID.test(id)) errors.push(`corroborating_register_ids entry '${id}' is not a register-id shape`);
    }
  }
  if (rule.units !== void 0 && rule.units !== null && typeof rule.units !== "string") {
    errors.push("units must be a string or null");
  }
  if (rule.logic !== void 0 && rule.logic !== null && typeof rule.logic !== "string") {
    errors.push("logic must be a string or null");
  }
  if (errors.length) return { ok: false, errors, warnings };
  const normalized = deepFreeze({
    rule_id,
    domain,
    statement,
    params: { ...params },
    units: rule.units ?? null,
    logic: rule.logic ?? null,
    source_ref: {
      register_id: sref.register_id.trim(),
      authority: sref.authority.trim(),
      title: sref.title.trim(),
      edition: sref.edition ?? null,
      section: sref.section ?? null,
      url: sref.url ?? null,
      verified: sref.verified
    },
    corroborating_register_ids: Array.isArray(rule.corroborating_register_ids) ? [...rule.corroborating_register_ids] : [],
    applicability: { ...applicability },
    limits: Array.isArray(rule.limits) ? [...rule.limits] : [],
    unsupported: Array.isArray(rule.unsupported) ? [...rule.unsupported] : [],
    rule_version,
    status
  });
  return { ok: true, rule: normalized, errors: [], warnings };
}
function foundationBarSizeClass(barSize) {
  const raw = typeof barSize === "string" ? barSize.trim() : "";
  const match = raw.match(/^#?(\d+)$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 2 || n > 18) return null;
  return n <= 5 ? "le_#5" : "gt_#5";
}
function ruleAppliesTo(rule, context) {
  const a = rule.applicability || {};
  const check = (list, value) => {
    if (!Array.isArray(list) || !list.length || value === void 0 || value === null || value === "") return true;
    return list.includes(value);
  };
  if (!check(a.usages, context.usage)) return false;
  if (!check(a.member_types, context.member_type)) return false;
  if (!check(a.support_classes, context.support_class)) return false;
  if (!check(a.bearing_modes, context.bearing_mode)) return false;
  if (!check(a.substrates, context.substrate)) return false;
  if (!check(a.bar_coatings, context.bar_coating)) return false;
  if (!check(a.bar_sizes, context.bar_size)) return false;
  if (!check(a.products, context.product)) return false;
  if (!check(a.mat_layers, context.mat_layer)) return false;
  if (!check(a.exposures, context.exposure)) return false;
  if (typeof a.bar_size_class === "string") {
    const have = context.bar_size_class ?? foundationBarSizeClass(context.bar_size);
    if (have !== null && have !== void 0 && have !== a.bar_size_class) return false;
  }
  return true;
}
var byRuleId = (a, b) => a.rule_id.localeCompare(b.rule_id);
function createFoundationRuleRegistry(seedRules = FOUNDATION_RULE_SEEDS) {
  const byId = /* @__PURE__ */ new Map();
  const errors = [];
  function registerRule(candidate) {
    const verdict = normalizeRule(candidate);
    if (!verdict.ok) return { ok: false, errors: verdict.errors, warnings: verdict.warnings };
    const rule = verdict.rule;
    if (byId.has(rule.rule_id)) {
      return { ok: false, errors: [`duplicate rule_id '${rule.rule_id}'`], warnings: verdict.warnings };
    }
    byId.set(rule.rule_id, rule);
    return { ok: true, rule, errors: [], warnings: verdict.warnings };
  }
  for (const seed of Array.isArray(seedRules) ? seedRules : []) {
    const verdict = registerRule(seed);
    if (!verdict.ok) errors.push({ rule_id: isRecord(seed) ? seed.rule_id ?? null : null, errors: verdict.errors });
  }
  function lookupRule(rule_id) {
    return byId.get(rule_id) ?? null;
  }
  function allRules({ includeHeld = true } = {}) {
    return [...byId.values()].filter((rule) => includeHeld || rule.status === "active").sort(byRuleId);
  }
  function rulesForDomain(domain, context = {}, { includeHeld = false } = {}) {
    const want = text(domain);
    const ctx = isRecord(context) ? context : {};
    return [...byId.values()].filter((rule) => includeHeld || rule.status === "active").filter((rule) => !want || want === "*" || rule.domain === want || rule.domain.startsWith(want + ".")).filter((rule) => ruleAppliesTo(rule, ctx)).sort(byRuleId);
  }
  function assertParamsAgainstRule(ruleOrId, actualParams = {}) {
    const rule = isRecord(ruleOrId) ? ruleOrId : lookupRule(ruleOrId);
    if (!rule) {
      return { ok: false, verdict: "rule_not_found", rule_id: isRecord(ruleOrId) ? ruleOrId.rule_id ?? null : ruleOrId ?? null, checks: [], violations: [{ code: "rule_not_found" }] };
    }
    if (rule.status !== "active") {
      return { ok: false, verdict: "rule_not_active", rule_id: rule.rule_id, status: rule.status, checks: [], violations: [{ code: "rule_not_active", status: rule.status }] };
    }
    if (!isRecord(actualParams)) {
      return { ok: false, verdict: "invalid_input", rule_id: rule.rule_id, checks: [], violations: [{ code: "actual_params_invalid" }] };
    }
    const checks = gatedChecks(rule.params).map((check) => {
      if (!check.gated) {
        return { ...check, actual: null, verdict: "informational" };
      }
      const actual = actualParams[check.param];
      if (check.comparator === "equals") {
        if (actual === check.limit) return { ...check, actual, verdict: "pass" };
        if (actual === void 0 || actual === null) return { ...check, actual: null, verdict: "unverified" };
        return { ...check, actual, verdict: "fail" };
      }
      if (!finite(check.limit) || !finite(actual)) {
        return { ...check, actual: finite(actual) ? actual : null, verdict: "unverified" };
      }
      const pass = check.comparator === "max" ? actual <= check.limit : actual >= check.limit;
      return { ...check, actual, verdict: pass ? "pass" : "fail" };
    });
    const gated = checks.filter((check) => check.gated);
    if (!gated.length) {
      return { ok: false, verdict: "unverified", rule_id: rule.rule_id, status: rule.status, checks, violations: [{ code: "no_gated_params" }] };
    }
    const violations = checks.filter((check) => check.verdict === "fail" || check.verdict === "unverified");
    return {
      ok: violations.length === 0,
      verdict: violations.length ? "fail" : "pass",
      rule_id: rule.rule_id,
      status: rule.status,
      checks,
      violations
    };
  }
  function stats() {
    const by_domain = {};
    let active = 0, held = 0;
    for (const rule of byId.values()) {
      if (rule.status === "active") active += 1;
      else held += 1;
      by_domain[rule.domain] = (by_domain[rule.domain] ?? 0) + 1;
    }
    return { total: byId.size, active, held, seed_errors: errors.length, by_domain };
  }
  return deepFreeze({
    registerRule,
    lookupRule,
    allRules,
    rulesForDomain,
    assertParamsAgainstRule,
    stats,
    errors,
    get size() {
      return byId.size;
    }
  });
}
var FOUNDATION_RULE_REGISTRY = createFoundationRuleRegistry();
var FOUNDATION_SOURCE_CLASS_LABELS = Object.freeze({
  local_code: "Adopted local code",
  structural_standard: "Referenced structural standard",
  engineering_guidance: "Engineering guidance",
  manufacturer_instructions: "Manufacturer instructions",
  shop_assumptions: "Shop estimating assumption"
});
var FOUNDATION_SOURCE_INDEX = Object.freeze(
  Object.entries(SOURCE_AUTHORITY_CLASS).map(([rule_id, authority_class]) => ({
    rule_id,
    authority_class
  }))
);
var FOUNDATION_METHOD_DOMAIN2 = Object.freeze([
  "method.sign_wind",
  "method.footing_bearing",
  "method.shaft",
  "method.lateral",
  "method.frost_depth",
  "method.pillar_bar",
  "method.base_plate"
]);

// src/components/estimator/foundation/foundationReinforcementBasis.js
var FOOT_UNITS = Object.freeze(["ft", "foot", "feet", "lf", "linear ft", "linear foot", "linear feet"]);

// src/components/estimator/foundation/foundationReinforcementCost.js
var STEEL_ROLES = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);

// src/components/estimator/foundation/foundationReinforcementCutSchedule.js
var STEEL_ROLES2 = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);
var ROLE_SHAPES = Object.freeze({
  horizontal: "straight",
  longitudinal: "straight",
  hoop: "hoop",
  inter_mat_tie: "as_authored"
});

// src/components/estimator/foundation/foundationCalc.js
var num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
var money = (n) => `$${num(n).toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// src/components/estimator/foundation/foundationFtInEntry.js
import { createElement as h, useId, useState } from "react";

// uistub:@/components/ui/input
import React2 from "react";
import { jsx as jsx2 } from "react/jsx-runtime";
var strip2 = ({ className, variant, size, ...r }) => r;
var Input = (p) => /* @__PURE__ */ jsx2("input", { ...strip2(p) });

// src/components/estimator/foundation/foundationFtInEntry.js
var FT_MARKS = /['′’‘`´]/g;
var IN_MARKS = /["″”]/g;
var DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
var dimensionNumberToken = (text2) => {
  const t = String(text2).trim();
  if (t === "") return null;
  if (DECIMAL.test(t)) {
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  }
  const frac = t.match(/^(\d+(?:\.\d*)?|\.\d+)\s*\/\s*(\d+(?:\.\d*)?|\.\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (!Number.isFinite(den) || den === 0) return null;
    const v = Number(frac[1]) / den;
    return Number.isFinite(v) ? v : null;
  }
  const mixed = t.match(/^(\d+(?:\.\d*)?|\.\d+)\s+(\d+(?:\.\d*)?|\.\d+)\s*\/\s*(\d+(?:\.\d*)?|\.\d+)$/);
  if (mixed) {
    const den = Number(mixed[3]);
    if (!Number.isFinite(den) || den === 0) return null;
    const v = Number(mixed[1]) + Number(mixed[2]) / den;
    return Number.isFinite(v) ? v : null;
  }
  return null;
};
var dashPair = (body) => {
  const i = body.indexOf("-");
  if (i < 0) return null;
  const left = body.slice(0, i);
  const right = body.slice(i + 1);
  if (left === "" || right === "" || right.includes("-")) return null;
  const a = dimensionNumberToken(left);
  const b = dimensionNumberToken(right);
  if (a === null || b === null) return null;
  return right.includes("/") ? [0, a + b] : [a, b];
};
var spacePair = (body) => {
  const parts = body.split(" ").filter((p) => p !== "");
  if (parts.length !== 2 || parts[1].includes("/")) return null;
  const a = dimensionNumberToken(parts[0]);
  const b = dimensionNumberToken(parts[1]);
  return a === null || b === null ? null : [a, b];
};
function parseFoundationDimension(text2) {
  if (typeof text2 === "number") {
    return Number.isFinite(text2) ? { ok: true, inches: text2 } : { ok: false, reason: "not_finite" };
  }
  if (typeof text2 !== "string") return { ok: false, reason: "not_text" };
  let s = text2.trim();
  if (s === "") return { ok: false, reason: "blank" };
  s = s.replace(FT_MARKS, "'").replace(IN_MARKS, '"').replace(/\s+/g, " ");
  let sign = 1;
  const leading = s.match(/^[+-]\s*/);
  if (leading) {
    if (leading[0][0] === "-") sign = -1;
    s = s.slice(leading[0].length);
  }
  if (s === "") return { ok: false, reason: "blank" };
  const total = (feet, inches) => {
    const v = sign * (feet * 12 + inches);
    return Number.isFinite(v) ? { ok: true, inches: v } : { ok: false, reason: "not_finite" };
  };
  if (s.includes("'")) {
    const parts = s.split("'");
    if (parts.length !== 2) return { ok: false, reason: "bad_marks" };
    const feet = dimensionNumberToken(parts[0]);
    if (feet === null) return { ok: false, reason: "feet" };
    let rest = parts[1].trim();
    const separator = rest.match(/^[+-]\s*/);
    if (separator) rest = rest.slice(separator[0].length).trim();
    if (rest.endsWith('"')) rest = rest.slice(0, -1).trim();
    if (rest.includes('"') || rest.includes("'")) return { ok: false, reason: "bad_marks" };
    const inches = rest === "" ? 0 : dimensionNumberToken(rest);
    if (inches === null) return { ok: false, reason: "inches" };
    return total(feet, inches);
  }
  if (s.includes('"')) {
    if (!s.endsWith('"')) return { ok: false, reason: "bad_marks" };
    const body = s.slice(0, -1).trim();
    if (body === "" || body.includes('"') || body.includes("'")) {
      return { ok: false, reason: "bad_marks" };
    }
    const direct = dimensionNumberToken(body);
    if (direct !== null) return { ok: true, inches: sign * direct };
    const pair = dashPair(body) ?? spacePair(body);
    if (pair) return total(pair[0], pair[1]);
    return { ok: false, reason: "inches" };
  }
  const tokens = s.split(" ");
  if (tokens.length === 1) {
    const v = dimensionNumberToken(tokens[0]);
    return v === null ? { ok: false, reason: "inches" } : { ok: true, inches: sign * v };
  }
  if (tokens.length === 2) {
    if (tokens[1].includes("/")) {
      const v = dimensionNumberToken(`${tokens[0]} ${tokens[1]}`);
      return v === null ? { ok: false, reason: "inches" } : { ok: true, inches: sign * v };
    }
    const feet = dimensionNumberToken(tokens[0]);
    const inches = dimensionNumberToken(tokens[1]);
    if (feet === null || inches === null) return { ok: false, reason: "pair" };
    return total(feet, inches);
  }
  if (tokens.length === 3) {
    const feet = dimensionNumberToken(tokens[0]);
    const inches = dimensionNumberToken(`${tokens[1]} ${tokens[2]}`);
    if (feet === null || inches === null) return { ok: false, reason: "pair" };
    return total(feet, inches);
  }
  return { ok: false, reason: "tokens" };
}
function formatFoundationDimension(inches) {
  if (!Number.isFinite(inches)) return "";
  const sign = inches < 0 ? "-" : "";
  const magnitude = Math.abs(inches);
  const feet = Math.floor(magnitude / 12);
  const rest = Math.round((magnitude - feet * 12) * 1e4) / 1e4;
  if (feet === 0) return `${sign}${rest}"`;
  if (rest === 0) return `${sign}${feet}'`;
  return `${sign}${feet}' ${rest}"`;
}
var foundationDimensionDraftValue = (text2) => {
  if (typeof text2 !== "string") return text2;
  if (text2.trim() === "") return "";
  const parsed = parseFoundationDimension(text2);
  return parsed.ok ? parsed.inches : text2;
};
var foundationDimensionStoredText = (value) => typeof value === "number" && Number.isFinite(value) ? formatFoundationDimension(value) : value === null || value === void 0 ? "" : String(value);
var FOUNDATION_DIMENSION_FORMAT_HELP = `inches (150) or feet/inches like 12' 6", 12.5', 12 6, or 3/8"`;
var foundationDimensionInputIssue = (value) => typeof value === "string" && value.trim() !== "" ? `Not a recognized measurement \u2014 enter ${FOUNDATION_DIMENSION_FORMAT_HELP}.` : null;
function FoundationDimensionInput({
  label,
  help,
  value,
  onCommit,
  placeholder,
  invalid,
  describedBy,
  ariaLabel,
  id,
  disabled,
  labelClassName,
  inputClassName
}) {
  const [editing, setEditing] = useState(null);
  const autoId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const base = id ?? `dim-${autoId}`;
  const hint = foundationDimensionInputIssue(value);
  const hintId = `${base}-dimhint`;
  const helpId = `${base}-dimhelp`;
  const described = [
    describedBy,
    hint ? hintId : null,
    editing !== null && help ? helpId : null
  ].filter(Boolean).join(" ") || void 0;
  return h(
    "label",
    { className: labelClassName ?? "text-xs text-gray-500" },
    label,
    h(Input, {
      id,
      type: "text",
      // full keyboard: the ft/in marks ( ' " - space / ) are the feature —
      // decimal/numeric pads would lock them out on mobile.
      inputMode: "text",
      disabled,
      className: inputClassName,
      value: editing !== null ? editing : foundationDimensionStoredText(value),
      placeholder,
      title: help,
      "aria-label": ariaLabel ?? (typeof label === "string" ? label : void 0),
      "aria-invalid": invalid || !!hint || void 0,
      "aria-describedby": described,
      onFocus: () => setEditing(foundationDimensionStoredText(value)),
      onChange: (e) => {
        setEditing(e.target.value);
        onCommit(foundationDimensionDraftValue(e.target.value));
      },
      onBlur: () => setEditing(null)
    }),
    hint ? h("span", {
      id: hintId,
      role: "status",
      className: "block text-[10px] text-amber-700 mt-0.5"
    }, hint) : null,
    editing !== null && help ? h("span", {
      id: helpId,
      className: "block text-[10px] text-gray-400 mt-0.5"
    }, help) : null
  );
}

// src/components/estimator/foundation/FoundationWallCapsPanel.jsx
import { Fragment, jsx as jsx3, jsxs } from "react/jsx-runtime";
var capDimMeta = (field) => foundationDimensionFieldMeta("wallCap", field);
function FoundationWallCapsPanel({ caps = [], walls = [], options = [], onChange }) {
  const [capWallId, setCapWallId] = useState2("");
  const [selectedWallIds, setSelectedWallIds] = useState2(() => /* @__PURE__ */ new Set());
  const toggleWall = (id) => setSelectedWallIds((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const patchCap = (index, changes) => onChange(caps.map((c, i) => i === index ? { ...c, ...changes } : c));
  const capWalls = (wallIds) => {
    const inv = options[0];
    const stockLength = inventoryFiniteNumber(inv?.cap_stock_length_inches);
    const capped = new Set(caps.filter((c) => c?.locked !== false).map((c) => c.segment_component_id).filter(Boolean));
    const made = [];
    wallIds.forEach((wallId) => {
      const wi = walls.findIndex((w) => w.component_id === wallId);
      const wall = walls[wi];
      (wall?.shape?.segments || []).forEach((sg, si) => {
        if (sg?.component_id && capped.has(sg.component_id)) return;
        const len = inventoryFiniteNumber(sg?.length);
        made.push({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          cap_inventory_id: inv?.id || "",
          wall_component_id: wallId,
          wall_index: wi < 0 ? void 0 : wi,
          segment_component_id: sg?.component_id || "",
          segment_index: si,
          position_along_segment_inches: 0,
          length_inches: len !== null && len > 0 ? len : stockLength !== null && stockLength > 0 ? stockLength : "",
          rotation_offset_degrees: 0,
          lateral_offset_inches: 0
        });
        if (sg?.component_id) capped.add(sg.component_id);
      });
    });
    if (made.length) onChange([...caps, ...made]);
  };
  const capFit = (wallId) => {
    const inv = options[0];
    const stockLength = inventoryFiniteNumber(inv?.cap_stock_length_inches);
    const wall = walls.find((w) => w.component_id === wallId);
    if (!wall || !Number.isFinite(stockLength) || stockLength <= 0) return;
    const capped = new Set(caps.filter((c) => c?.locked !== false).map((c) => c.segment_component_id).filter(Boolean));
    const made = [];
    const wi = walls.indexOf(wall);
    (wall?.shape?.segments || []).forEach((sg, si) => {
      if (sg?.component_id && capped.has(sg.component_id)) return;
      const len = inventoryFiniteNumber(sg?.length);
      if (!Number.isFinite(len) || len <= 0) return;
      let pos = 0, n = 0;
      while (pos + stockLength <= len && n < 200) {
        made.push({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          cap_inventory_id: inv?.id || "",
          wall_component_id: wallId,
          wall_index: wi < 0 ? void 0 : wi,
          segment_component_id: sg?.component_id || "",
          segment_index: si,
          position_along_segment_inches: Math.round(pos * 100) / 100,
          length_inches: stockLength,
          rotation_offset_degrees: 0,
          lateral_offset_inches: 0
        });
        pos += stockLength;
        n += 1;
      }
      if (len - pos > 0.01) {
        made.push({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          cap_inventory_id: inv?.id || "",
          wall_component_id: wallId,
          wall_index: wi < 0 ? void 0 : wi,
          segment_component_id: sg?.component_id || "",
          segment_index: si,
          position_along_segment_inches: Math.round(pos * 100) / 100,
          length_inches: "",
          // remainder tail -- authored entry (held-closed)
          rotation_offset_degrees: 0,
          lateral_offset_inches: 0
        });
      }
      if (sg?.component_id) capped.add(sg.component_id);
    });
    if (made.length) onChange([...caps, ...made]);
  };
  const capCorners = (wallId) => {
    const inv = options[0];
    const wall = walls.find((w) => w.component_id === wallId);
    const pts = wall?.shape?.points || [];
    const closed = wall?.shape?.closed === true;
    if (pts.length < 2) return;
    const cross = (a, b, c) => (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    const n = pts.length;
    const cornerIdx = [];
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) continue;
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      if (Math.abs(cross(a, b, c)) > 0.01) cornerIdx.push(i);
    }
    const made = cornerIdx.map((vi) => ({
      id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      cap_inventory_id: inv?.id || "",
      wall_component_id: wallId,
      wall_index: walls.findIndex((w) => w.component_id === wallId),
      end_treatment: "mitered",
      length_inches: "",
      position_along_segment_inches: 0,
      rotation_offset_degrees: 0,
      lateral_offset_inches: 0,
      corner_vertex_index: vi
    }));
    if (!closed) {
      [0, n - 1].forEach((ei) => {
        made.push({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          cap_inventory_id: inv?.id || "",
          wall_component_id: wallId,
          wall_index: walls.findIndex((w) => w.component_id === wallId),
          end_treatment: "straight",
          length_inches: "",
          position_along_segment_inches: 0,
          rotation_offset_degrees: 0,
          lateral_offset_inches: 0,
          end_vertex_index: ei
        });
      });
    }
    if (made.length) onChange([...caps, ...made]);
  };
  const removeCap = (index) => {
    if (!window.confirm(`Remove cap ${index + 1}?`)) return;
    onChange(caps.filter((_, i) => i !== index));
  };
  const addCap = () => {
    const inv = options[0];
    const stockLength = inventoryFiniteNumber(inv?.cap_stock_length_inches);
    onChange([
      ...caps,
      {
        id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        cap_inventory_id: inv?.id || "",
        wall_component_id: walls[0]?.component_id || "",
        wall_index: walls.length ? 0 : void 0,
        segment_component_id: walls[0]?.shape?.segments?.[0]?.component_id || "",
        segment_index: walls[0]?.shape?.segments?.length ? 0 : void 0,
        position_along_segment_inches: 0,
        length_inches: stockLength !== null && stockLength > 0 ? stockLength : "",
        rotation_offset_degrees: 0,
        lateral_offset_inches: 0
      }
    ]);
  };
  const cutList = [];
  walls.forEach((wall, wi) => {
    (wall?.shape?.segments || []).forEach((sg, si) => {
      const segLen = inventoryFiniteNumber(sg?.length);
      const segCaps = caps.map((c, ci) => ({ c, ci })).filter(({ c }) => c.segment_component_id && c.segment_component_id === sg?.component_id).map(({ c, ci }) => {
        const cut = inventoryFiniteNumber(wallCapCutLengthValue(c));
        const pos = inventoryFiniteNumber(c.position_along_segment_inches);
        return { ci, cut, pos: pos !== null ? pos : 0 };
      }).sort((a, b) => a.pos - b.pos);
      if (!segCaps.length) return;
      const pieces = [];
      let cursor = 0;
      segCaps.forEach(({ ci, cut, pos }) => {
        const start = Math.max(0, pos);
        if (segLen !== null && start > cursor) {
          pieces.push({ gap: start - cursor });
        }
        const overlap = cursor > start ? cursor - start : 0;
        if (cut !== null && cut > 0) {
          pieces.push({ ci, start, end: start + cut, over: segLen !== null && start + cut > segLen, overlap });
          cursor = Math.max(cursor, start + cut);
        } else {
          pieces.push({ ci, start, end: null, uncut: true });
        }
      });
      if (segLen !== null && cursor < segLen) pieces.push({ gap: segLen - cursor });
      cutList.push({
        wall: wall?.name || `Wall ${wi + 1}`,
        seg: si + 1,
        segLen,
        pieces
      });
    });
  });
  const splitCap = (index) => {
    const cap = caps[index];
    const inv = options.find((o) => o.id === cap?.cap_inventory_id);
    const stock = inventoryFiniteNumber(inv?.cap_stock_length_inches);
    const cut = inventoryFiniteNumber(wallCapCutLengthValue(cap));
    if (!cap || stock === null || stock <= 0 || cut === null || cut <= stock) return;
    const pos = inventoryFiniteNumber(cap.position_along_segment_inches) ?? 0;
    const next = [...caps];
    next.splice(
      index,
      1,
      { ...cap, length_inches: stock },
      {
        ...cap,
        id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        component_id: void 0,
        length_inches: cut - stock,
        position_along_segment_inches: pos + stock
      }
    );
    onChange(next);
  };
  const capIssues = foundationWallCapCatalogIssues(caps, options);
  const unavailableCaps = new Set(capIssues.filter((issue) => issue.code !== "wall_cap_cost_total_invalid").map((issue) => issue.index));
  const geometryIssues = (index) => capIssues.filter((issue) => issue.index === index && ["length_inches", "cap_stock_length_inches"].includes(issue.field));
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx3("h2", { className: "font-semibold text-gray-900", children: "Wall Caps" }),
        /* @__PURE__ */ jsx3("p", { className: "text-xs text-gray-500", children: "Full stock price is charged per cut piece." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 flex-wrap justify-end", children: [
        /* @__PURE__ */ jsxs(
          "select",
          {
            className: "h-8 rounded-md border border-input bg-transparent px-2 text-xs",
            value: capWallId,
            "aria-label": "Wall to cap",
            onChange: (e) => setCapWallId(e.target.value),
            children: [
              /* @__PURE__ */ jsx3("option", { value: "", children: "This wall\u2026" }),
              walls.map((w, i) => /* @__PURE__ */ jsx3("option", { value: w.component_id || "", children: w.name || `Wall ${i + 1}` }, w.component_id || i))
            ]
          }
        ),
        /* @__PURE__ */ jsx3(
          Button,
          {
            variant: "outline",
            size: "sm",
            disabled: options.length === 0 || !capWallId,
            onClick: () => capWalls([capWallId]),
            children: "Cap wall"
          }
        ),
        /* @__PURE__ */ jsx3(
          Button,
          {
            variant: "outline",
            size: "sm",
            disabled: options.length === 0 || !capWallId,
            onClick: () => capFit(capWallId),
            children: "Fit caps"
          }
        ),
        /* @__PURE__ */ jsx3(
          Button,
          {
            variant: "outline",
            size: "sm",
            disabled: options.length === 0 || walls.length === 0,
            onClick: () => capWalls(walls.map((w) => w.component_id)),
            children: "Cap all walls"
          }
        ),
        (() => {
          const dangling = caps.filter((c) => {
            const w = walls.find((x) => x.component_id === c?.wall_component_id);
            const segs = w?.shape?.segments || [];
            return c?.segment_component_id && !segs.some((s) => s?.component_id === c.segment_component_id);
          });
          return dangling.length > 0 && /* @__PURE__ */ jsxs(
            Button,
            {
              variant: "outline",
              size: "sm",
              title: `Re-anchor ${dangling.length} dangling cap${dangling.length === 1 ? "" : "s"} to their wall's first available segment`,
              onClick: () => onChange(caps.map((c) => {
                const w = walls.find((x) => x.component_id === c?.wall_component_id);
                const segs = w?.shape?.segments || [];
                if (c?.segment_component_id && !segs.some((s) => s?.component_id === c.segment_component_id)) {
                  return { ...c, segment_component_id: segs[0]?.component_id || c.segment_component_id, segment_index: 0 };
                }
                return c;
              })),
              children: [
                "Re-anchor ",
                dangling.length
              ]
            }
          );
        })(),
        caps.length > 0 && (() => {
          const lockedCount = caps.filter((c) => c?.locked !== false).length;
          const freeCount = caps.length - lockedCount;
          return /* @__PURE__ */ jsxs("span", { className: "text-[10px] text-gray-500", title: "Caps that hold their segment vs free for regeneration", children: [
            lockedCount,
            " locked hold",
            lockedCount === 1 ? "" : "s",
            " \xB7 ",
            freeCount,
            " free to regenerate"
          ] });
        })(),
        walls.length > 1 && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx3("div", { className: "flex items-center gap-1 flex-wrap", role: "group", "aria-label": "Walls to cap", children: walls.map((w, i) => {
            const id = w.component_id || "";
            const checked = selectedWallIds.has(id);
            return /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1 text-[11px] text-gray-600 border rounded px-1.5 h-7", children: [
              /* @__PURE__ */ jsx3(
                "input",
                {
                  type: "checkbox",
                  checked,
                  onChange: () => toggleWall(id),
                  "aria-label": `Select ${w.name || `wall ${i + 1}`} for capping`
                }
              ),
              w.name || `Wall ${i + 1}`
            ] }, id || i);
          }) }),
          /* @__PURE__ */ jsx3(
            Button,
            {
              variant: "outline",
              size: "sm",
              disabled: options.length === 0 || selectedWallIds.size === 0,
              onClick: () => capWalls([...selectedWallIds]),
              children: "Cap selected"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs(Button, { variant: "outline", size: "sm", onClick: addCap, disabled: options.length === 0, children: [
          /* @__PURE__ */ jsx3(Plus, { className: "w-4 h-4", "aria-hidden": "true" }),
          " Cap"
        ] }),
        /* @__PURE__ */ jsx3(
          Button,
          {
            variant: "outline",
            size: "sm",
            disabled: options.length === 0 || !capWallId,
            onClick: () => capCorners(capWallId),
            title: "Mint a mitered cap at each wall vertex plus end-pieces on open runs",
            children: "Corner pieces"
          }
        )
      ] })
    ] }),
    options.length === 0 && /* @__PURE__ */ jsx3("div", { className: "text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5", children: "Wall cap catalog unavailable \xE2\u20AC\u201D existing rows remain editable; new caps cannot be added." }),
    cutList.length > 0 && /* @__PURE__ */ jsxs("details", { className: "bg-slate-50 border border-slate-200 rounded-lg px-3 py-2", children: [
      /* @__PURE__ */ jsxs("summary", { className: "text-[11px] font-semibold text-gray-700 cursor-pointer select-none", children: [
        "Cut list \u2014 ",
        cutList.reduce((s, r) => s + r.pieces.filter((p) => p.ci !== void 0).length, 0),
        " piece",
        cutList.reduce((s, r) => s + r.pieces.filter((p) => p.ci !== void 0).length, 0) === 1 ? "" : "s",
        " on ",
        cutList.length,
        " segment",
        cutList.length === 1 ? "" : "s"
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "mt-2 space-y-1.5 text-[11px] text-gray-700", children: cutList.map((row) => /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("span", { className: "font-medium text-gray-800", children: [
          row.wall,
          " \xB7 Segment ",
          row.seg
        ] }),
        row.segLen !== null && /* @__PURE__ */ jsxs("span", { className: "text-gray-500", children: [
          " (",
          Math.round(row.segLen),
          " in)"
        ] }),
        /* @__PURE__ */ jsxs("span", { className: "text-gray-500", children: [
          " \u2014 ",
          row.pieces.map((p, pi) => {
            if (p.gap !== void 0) return /* @__PURE__ */ jsxs("span", { className: "text-amber-700", children: [
              "gap ",
              Math.round(p.gap),
              "\u2033"
            ] }, pi);
            if (p.uncut) return /* @__PURE__ */ jsxs("span", { children: [
              "cap ",
              p.ci + 1,
              " @ ",
              Math.round(p.start),
              "\u2033 (no cut length)"
            ] }, pi);
            return /* @__PURE__ */ jsxs("span", { className: p.over ? "text-red-600 font-medium" : void 0, children: [
              "cap ",
              p.ci + 1,
              " @ ",
              Math.round(p.start),
              "\u2033\u2013",
              Math.round(p.end),
              "\u2033",
              p.over ? " (overruns segment)" : "",
              p.overlap ? ` (miter overlap ${Math.round(p.overlap)}\u2033)` : ""
            ] }, pi);
          }).reduce((acc, el, i) => i === 0 ? [el] : [...acc, ", ", el], [])
        ] })
      ] }, `${row.wall}:${row.seg}`)) })
    ] }),
    caps.length === 0 ? /* @__PURE__ */ jsx3("div", { className: "text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm", children: "No caps on this section." }) : caps.map((cap, index) => /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 p-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-2 items-end", children: [
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500 md:col-span-2", children: [
          "Cap material",
          /* @__PURE__ */ jsxs(
            "select",
            {
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              value: cap.cap_inventory_id || "",
              "aria-label": "Cap material",
              onChange: (e) => {
                patchCap(index, {
                  cap_inventory_id: e.target.value
                });
              },
              children: [
                /* @__PURE__ */ jsx3("option", { value: "", children: "Select cap\xE2\u20AC\xA6" }),
                cap.cap_inventory_id && !options.some((o) => o.id === cap.cap_inventory_id) && /* @__PURE__ */ jsx3("option", { value: cap.cap_inventory_id, disabled: true, children: `Catalog cap unavailable (${cap.cap_inventory_id})` }),
                options.map((o) => /* @__PURE__ */ jsx3("option", { value: o.id, children: o.material_name }, o.id))
              ]
            }
          ),
          cap.cap_inventory_id && !options.some((o) => o.id === cap.cap_inventory_id) && /* @__PURE__ */ jsx3("span", { className: "block text-[10px] text-amber-700 mt-1", children: "Catalog cap unavailable; current pricing needs review." })
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
          "Wall",
          /* @__PURE__ */ jsxs(
            "select",
            {
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              value: cap.wall_component_id ?? "",
              "aria-label": "Cap wall",
              onChange: (e) => {
                const id = e.target.value;
                const i = walls.findIndex((w) => w.component_id === id);
                patchCap(index, {
                  wall_component_id: id,
                  wall_index: id === "" || i < 0 ? void 0 : i,
                  segment_component_id: "",
                  segment_index: void 0
                });
              },
              children: [
                /* @__PURE__ */ jsx3("option", { value: "", children: "Unassigned" }),
                cap.wall_component_id && !walls.some((w) => w.component_id === cap.wall_component_id) && /* @__PURE__ */ jsx3("option", { value: cap.wall_component_id, disabled: true, children: `Missing wall (${String(cap.wall_component_id).slice(0, 18)}\xE2\u20AC\xA6)` }),
                walls.map((w, i) => /* @__PURE__ */ jsx3("option", { value: w.component_id || "", children: w.name || `Wall ${i + 1}` }, w.component_id || i))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
          "Segment",
          /* @__PURE__ */ jsxs(
            "select",
            {
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              value: cap.segment_component_id ?? "",
              "aria-label": "Cap segment",
              onChange: (e) => {
                const id = e.target.value;
                const wall = walls.find((w) => w.component_id === cap.wall_component_id);
                const segs = wall?.shape?.segments || [];
                const i = segs.findIndex((sg) => sg.component_id === id);
                patchCap(index, {
                  segment_component_id: id,
                  segment_index: id === "" || i < 0 ? void 0 : i
                });
              },
              children: [
                /* @__PURE__ */ jsx3("option", { value: "", children: "Unassigned" }),
                cap.segment_component_id && !(walls.find((w) => w.component_id === cap.wall_component_id)?.shape?.segments || []).some((sg) => sg.component_id === cap.segment_component_id) && /* @__PURE__ */ jsx3("option", { value: cap.segment_component_id, disabled: true, children: `Missing segment (${String(cap.segment_component_id).slice(0, 18)}\xE2\u20AC\xA6)` }),
                (walls.find((w) => w.component_id === cap.wall_component_id)?.shape?.segments || []).map((sg, i) => /* @__PURE__ */ jsx3("option", { value: sg.component_id || "", children: `Segment ${i + 1}` }, sg.component_id || i))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx3(
          FoundationDimensionInput,
          {
            ...capDimMeta("length_inches"),
            value: wallCapCutLengthValue(cap),
            onCommit: (v) => patchCap(index, { length_inches: v }),
            ariaLabel: `Cap ${index + 1} cut length (inches)`,
            invalid: geometryIssues(index).some((i) => i.field === "length_inches") || void 0,
            describedBy: geometryIssues(index).length ? `wall-cap-${index}-geometry` : void 0
          }
        ),
        /* @__PURE__ */ jsx3(
          FoundationDimensionInput,
          {
            ...capDimMeta("overhang_inches"),
            value: cap.overhang_inches,
            onCommit: (v) => patchCap(index, { overhang_inches: v }),
            ariaLabel: `Cap ${index + 1} overhang (inches)`
          }
        ),
        /* @__PURE__ */ jsx3(
          FoundationDimensionInput,
          {
            ...capDimMeta("height_inches"),
            value: cap.height_inches,
            onCommit: (v) => patchCap(index, { height_inches: v }),
            ariaLabel: `Cap ${index + 1} thickness (inches)`
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-6 gap-2 mt-2", children: [
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
          "Profile",
          /* @__PURE__ */ jsx3(
            "input",
            {
              type: "text",
              value: cap.profile ?? "",
              placeholder: capDimMeta("profile")?.placeholder ?? "flat",
              onChange: (e) => patchCap(index, { profile: e.target.value === "" ? void 0 : e.target.value }),
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              "aria-label": `Cap ${index + 1} profile`
            }
          )
        ] }),
        /* @__PURE__ */ jsx3(
          FoundationDimensionInput,
          {
            ...capDimMeta("width_inches"),
            value: cap.width_inches,
            onCommit: (v) => patchCap(index, { width_inches: v }),
            ariaLabel: `Cap ${index + 1} width (inches)`
          }
        ),
        /* @__PURE__ */ jsx3(
          FoundationDimensionInput,
          {
            ...capDimMeta("elevation_inches"),
            value: cap.elevation_inches,
            onCommit: (v) => patchCap(index, { elevation_inches: v }),
            ariaLabel: `Cap ${index + 1} elevation (inches)`
          }
        ),
        /* @__PURE__ */ jsx3(
          FoundationDimensionInput,
          {
            ...capDimMeta("joint_spacing_inches"),
            value: cap.joint_spacing_inches,
            onCommit: (v) => patchCap(index, { joint_spacing_inches: v }),
            ariaLabel: `Cap ${index + 1} joint spacing (inches)`
          }
        ),
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
          "Slope",
          /* @__PURE__ */ jsxs(
            "select",
            {
              value: cap.slope ?? "",
              onChange: (e) => patchCap(index, { slope: e.target.value === "" ? void 0 : e.target.value }),
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              "aria-label": `Cap ${index + 1} slope`,
              children: [
                /* @__PURE__ */ jsx3("option", { value: "", children: "Not recorded" }),
                /* @__PURE__ */ jsx3("option", { value: "flat", children: "Flat" }),
                /* @__PURE__ */ jsx3("option", { value: "single", children: "Single-slope" }),
                /* @__PURE__ */ jsx3("option", { value: "double", children: "Double-slope" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
          "End treatment",
          /* @__PURE__ */ jsxs(
            "select",
            {
              value: cap.end_treatment ?? "",
              onChange: (e) => patchCap(index, { end_treatment: e.target.value === "" ? void 0 : e.target.value }),
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              "aria-label": `Cap ${index + 1} end treatment`,
              children: [
                /* @__PURE__ */ jsx3("option", { value: "", children: "Not recorded" }),
                /* @__PURE__ */ jsx3("option", { value: "straight", children: "Straight" }),
                /* @__PURE__ */ jsx3("option", { value: "mitered", children: "Mitered" }),
                /* @__PURE__ */ jsx3("option", { value: "returned", children: "Returned" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
          "Supplies $",
          /* @__PURE__ */ jsx3(
            "input",
            {
              type: "number",
              min: "0",
              step: "0.01",
              placeholder: "0",
              value: cap.supplies_cost ?? "",
              onChange: (e) => patchCap(index, { supplies_cost: e.target.value === "" ? void 0 : Number(e.target.value) }),
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              "aria-label": `Cap ${index + 1} supplies cost`
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
          "Cut labor $",
          /* @__PURE__ */ jsx3(
            "input",
            {
              type: "number",
              min: "0",
              step: "0.01",
              placeholder: "0",
              value: cap.cut_labor_cost ?? "",
              onChange: (e) => patchCap(index, { cut_labor_cost: e.target.value === "" ? void 0 : Number(e.target.value) }),
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              "aria-label": `Cap ${index + 1} cut labor cost`
            }
          )
        ] })
      ] }),
      geometryIssues(index).length > 0 && /* @__PURE__ */ jsxs("div", { id: `wall-cap-${index}-geometry`, className: "mt-1 text-[11px] text-amber-700 space-y-0.5", children: [
        geometryIssues(index).map((issue) => /* @__PURE__ */ jsx3("p", { children: issue.message }, issue.code)),
        geometryIssues(index).some((i) => i.code === "wall_cap_cut_exceeds_stock") && /* @__PURE__ */ jsx3(Button, { variant: "outline", size: "sm", className: "mt-1", onClick: () => splitCap(index), children: "Split at stock length" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-2 text-xs text-gray-600", children: [
        /* @__PURE__ */ jsxs("span", { children: [
          unavailableCaps.has(index) ? "Saved stock length: " : "Stock length: ",
          /* @__PURE__ */ jsx3("span", { className: "font-semibold text-gray-900", children: hasFoundationCostSnapshot(cap.stock_length_inches) && cap.stock_length_inches > 0 ? cap.stock_length_inches + String.fromCharCode(34) : "Not saved" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "ml-auto flex items-center gap-3", children: [
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1 text-[10px] text-gray-500", title: "Locked caps keep their segment covered; unlock to regenerate", children: [
            /* @__PURE__ */ jsx3(
              "input",
              {
                type: "checkbox",
                checked: cap.locked !== false,
                onChange: (e) => patchCap(index, { locked: e.target.checked ? void 0 : false }),
                "aria-label": `Cap ${index + 1} locked`
              }
            ),
            "Locked"
          ] }),
          /* @__PURE__ */ jsx3("span", { className: "font-bold text-gray-900", children: hasFoundationCostSnapshot(cap.cost) ? money(cap.cost) : "Not saved" }),
          unavailableCaps.has(index) && /* @__PURE__ */ jsx3("span", { className: "text-[10px] text-amber-700", children: "Saved amounts (not current pricing)" }),
          /* @__PURE__ */ jsx3(Button, { variant: "ghost", size: "icon", onClick: () => removeCap(index), children: /* @__PURE__ */ jsx3(Trash2, { className: "w-4 h-4 text-red-500", "aria-hidden": "true" }) })
        ] })
      ] })
    ] }, cap.component_id || cap.id || index)),
    (() => {
      const offcuts = (caps || []).map((c) => {
        const inv = options.find((o) => o.id === c?.cap_inventory_id);
        const stock = inventoryFiniteNumber(inv?.cap_stock_length_inches);
        const cut = inventoryFiniteNumber(wallCapCutLengthValue(c));
        return stock !== null && stock > 0 && cut !== null && cut > 0 && cut <= stock ? stock - cut : null;
      }).filter((n) => n !== null && n > 0);
      if (!offcuts.length) return null;
      const total = offcuts.reduce((a, b) => a + b, 0);
      const purchased = (caps || []).length;
      const labor = (caps || []).reduce((a, c) => a + (inventoryFiniteNumber(c?.cut_labor_cost) || 0), 0);
      return /* @__PURE__ */ jsxs("details", { className: "text-[11px] text-gray-500 mt-1", children: [
        /* @__PURE__ */ jsxs("summary", { className: "cursor-pointer hover:text-gray-700", children: [
          "Offcuts: ",
          offcuts.length,
          " piece",
          offcuts.length === 1 ? "" : "s",
          " totaling ",
          Math.round(total),
          '" reusable -- not billed (full-stock pricing already charged).'
        ] }),
        /* @__PURE__ */ jsxs("ul", { className: "mt-0.5 list-disc pl-4", children: [
          /* @__PURE__ */ jsxs("li", { children: [
            "Purchased pieces: ",
            purchased,
            " (one stock row per cut piece)"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            "Waste: ",
            Math.round(total),
            '" reusable offcut across ',
            offcuts.length,
            " piece",
            offcuts.length === 1 ? "" : "s"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            "Cut labor: ",
            labor > 0 ? `$${labor.toFixed(2)}` : "not recorded"
          ] }),
          /* @__PURE__ */ jsx3("li", { children: "Price delta: $0 -- offcut reuse is informational; full-stock pricing already charged" })
        ] })
      ] });
    })()
  ] });
}

// stub:stub
import { jsx as jsx4 } from "react/jsx-runtime";
function Harness() {
  const walls = [{ component_id: "w_0", name: "W0", shape: { segments: [{ component_id: "s_0" }] } }];
  const caps = [{ component_id: "cap_0", cap_inventory_id: "cap_inv", wall_component_id: "gone_w", segment_component_id: "gone_s" }];
  return /* @__PURE__ */ jsx4(FoundationWallCapsPanel, { caps, walls, options: [{ id: "cap_inv", material_name: "Cap" }], onChange: (arr) => {
    globalThis.__capPatch = arr;
  } });
}
export {
  Harness as default
};
