// src/components/estimator/foundation/foundationGeometryInputs.js
var foundationInputNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
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

// src/components/estimator/foundation/foundationReinforcementBasis.js
var FOOT_UNITS = Object.freeze(["ft", "foot", "feet", "lf", "linear ft", "linear foot", "linear feet"]);
var finiteRate = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var positive = (value) => finiteRate(value) && value > 0;
var isRecord = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var numeric = (value) => {
  const parsed = foundationInputNumber(value);
  if (parsed !== null) return parsed;
  return value === null || ["undefined", "number", "string", "boolean"].includes(typeof value) ? value : NaN;
};
var text = (value) => typeof value === "string" ? value.trim() : "";
function resolveFoundationReinforcementBasis({
  material,
  inventory = [],
  settings = {},
  quantityOverride = null,
  rateOverride = null
} = {}) {
  const issues = [];
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const reference = isRecord(material) ? material : {};
  let row = null, source = null, name = "", reason = "", inventoryId = null;
  if (reference.kind === "manual") {
    source = reference;
    name = text(reference.name) || "Manual rebar";
    reason = text(reference.reason);
    if (!reason || reason.length > 1e3) issue(
      "material.reason",
      "reinforcement_manual_basis_reason_required",
      "Explain the manual material/rate basis in 1 to 1000 characters; this is not an engineering approval."
    );
  } else if (reference.kind === "catalog") {
    const id = reference.inventory_id;
    if (typeof id !== "string" || !id || id.trim() !== id || id.length > 128) {
      issue("material.inventory_id", "reinforcement_material_id_required", "Select a stable rebar inventory ID.");
    } else if (!Array.isArray(inventory)) {
      issue("inventory", "reinforcement_inventory_unavailable", "The rebar catalog could not be read; do not assume the material was deleted.");
    } else {
      const matches = inventory.filter((candidate) => candidate?.id === id);
      row = matches.length === 1 ? matches[0] : null;
      if (matches.length > 1) issue("material.inventory_id", "reinforcement_material_id_ambiguous", "Multiple current records have the selected ID; refresh the catalog before pricing.");
      else if (!row) issue("material.inventory_id", "reinforcement_material_unavailable", "The selected rebar catalog record is unavailable.");
      else if (row.material_type !== "rebar") {
        issue("material.inventory_id", "reinforcement_material_type_invalid", "The selected catalog record is not rebar.");
        row = null;
      }
      if (row) {
        inventoryId = id;
        name = text(row.material_name) || "Catalog rebar";
        source = {
          unit: row.unit,
          cost_per_ft: row.cost_per_unit,
          bar_diameter_inches: row.rebar_diameter_inches,
          weight_lb_per_ft: row.rebar_weight_lb_per_ft
        };
      }
    }
  } else issue("material.kind", "reinforcement_material_source_required", "Choose an explicit manual basis or a stable catalog record.");
  const rawUnit = source?.unit;
  const unit = typeof rawUnit === "string" && FOOT_UNITS.includes(rawUnit.trim().toLowerCase()) ? "ft" : void 0;
  if (!unit) issue(
    "material.unit",
    "reinforcement_material_unit_unsupported",
    "Rebar needs a known per-foot pricing unit; each/stick/weight units are not silently converted."
  );
  const diameter = numeric(source?.bar_diameter_inches);
  if (!positive(diameter)) issue(
    "material.bar_diameter_inches",
    "reinforcement_material_diameter_required",
    "Enter a known positive nominal bar diameter; a #size label alone is not diameter metadata."
  );
  const weight = source?.weight_lb_per_ft == null ? null : numeric(source.weight_lb_per_ft);
  if (weight === null) issue(
    "material.weight_lb_per_ft",
    "reinforcement_material_weight_unknown",
    "Material weight per foot is unknown, not zero.",
    "warning"
  );
  else if (!positive(weight)) issue(
    "material.weight_lb_per_ft",
    "reinforcement_material_weight_invalid",
    "Known material weight per foot must be finite and positive."
  );
  const override = rateOverride !== null && rateOverride !== void 0;
  const rate = numeric(override ? rateOverride : source?.cost_per_ft);
  if (!finiteRate(rate)) issue(
    override ? "custom_rebar_cost_per_ft" : "material.cost_per_ft",
    "reinforcement_material_rate_invalid",
    "Use an explicit finite nonnegative per-foot rate; zero is allowed."
  );
  if (reference.kind === "catalog" && !override && rate === 0) {
    issue(
      "material.cost_per_ft",
      "reinforcement_zero_catalog_rate_unconfirmed",
      "A zero catalog price may be unpriced, not free. Use an explicit per-foot override to confirm a zero rate."
    );
  }
  const quantity = quantityOverride == null ? null : numeric(quantityOverride);
  if (quantity !== null && !finiteRate(quantity)) issue(
    "custom_rebar_qty",
    "reinforcement_quantity_override_invalid",
    "Use a finite nonnegative aggregate item quantity; zero is allowed."
  );
  const settingsValid = isRecord(settings);
  if (!settingsValid) issue("settings", "reinforcement_settings_unavailable", "Labor settings are unavailable; do not infer defaults from a failed read.");
  const rateSources = [];
  const setting = (key, fallback) => {
    const missing = settingsValid && (!Object.prototype.hasOwnProperty.call(settings, key) || settings[key] === void 0);
    const value = !settingsValid ? void 0 : missing ? fallback : numeric(settings[key]);
    if (!finiteRate(value)) issue(
      `settings.${key}`,
      "reinforcement_labor_rate_invalid",
      `${key} must be a finite nonnegative number; an explicit malformed value does not use its default.`
    );
    rateSources.push({ key, source: missing ? "legacy_default" : "settings", value });
    return value;
  };
  const basis = {
    unit,
    bar_diameter_inches: diameter,
    weight_lb_per_ft: weight,
    cost_per_ft: rate,
    quantity_override_ft: quantity,
    labor_rate_per_hour: setting("foundation_main_labor_rate", 60),
    labor_hours_per_ft: setting("foundation_rebar_time_linear_ft", 0.02),
    labor_hours_per_connection: setting("foundation_rebar_time_cross_section", 0.05)
  };
  return {
    basis,
    issues,
    rateSources,
    materialSnapshot: {
      kind: reference.kind === "manual" ? "manual" : reference.kind === "catalog" ? "catalog" : null,
      inventory_id: inventoryId,
      inventory_updated_date: typeof row?.updated_date === "string" ? row.updated_date : null,
      name: name || "Unresolved rebar",
      reason: reference.kind === "manual" ? reason : null,
      pricing_unit: unit ?? null,
      original_unit: typeof rawUnit === "string" ? rawUnit : null,
      bar_diameter_inches: diameter,
      weight_lb_per_ft: weight,
      cost_per_ft: rate,
      rate_source: override ? "custom_rebar_cost_per_ft" : reference.kind === "catalog" ? "catalog" : "manual"
    }
  };
}
export {
  resolveFoundationReinforcementBasis
};
