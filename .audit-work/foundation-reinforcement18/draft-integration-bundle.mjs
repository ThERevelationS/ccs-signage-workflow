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

// src/components/estimator/foundation/foundationReinforcementDraft.js
var isRecord = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var scalar = (value) => value === null || ["undefined", "string", "number", "boolean"].includes(typeof value) ? value : NaN;
var numeric = (value) => {
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = foundationInputNumber(value);
  return parsed !== null ? parsed : scalar(value);
};
function createFoundationReinforcementDraft(item = {}) {
  const accepted = item?.reinforcement_calculation_version === 2;
  const design = accepted && isRecord(item.reinforcement_design) ? structuredClone(item.reinforcement_design) : {
    version: 2,
    bar_diameter_inches: "",
    cover_inches: { side: "", top: "", bottom: "" },
    supports: {
      mode: "unconfigured",
      reason: "",
      spacing_inches: "",
      catalog_id: "",
      mats: [],
      placements: []
    },
    spread: { mats: [], inter_mat_ties: [] },
    pillar: { hoops: [], longitudinal: { count: "", radius_inches: "", bottom_end_inches: "", top_end_inches: "" } }
  };
  return {
    schema_version: 1,
    design,
    material: accepted && isRecord(item.reinforcement_material) ? structuredClone(item.reinforcement_material) : { kind: "" },
    overrides: { quantity_ft: item?.custom_rebar_qty ?? null, cost_per_ft: item?.custom_rebar_cost_per_ft ?? null }
  };
}
function prepareFoundationReinforcementDraft(draft) {
  const issues = [];
  const issue = (field, message) => issues.push({ field, code: "reinforcement_draft_invalid", severity: "error", message });
  if (!isRecord(draft) || draft.schema_version !== 1) {
    issue("schema_version", "A supported version-1 reinforcement proposal is required.");
    return { prepared: null, issues };
  }
  const raw = draft.design;
  if (!isRecord(raw)) {
    issue("design", "The proposal needs a reinforcement design object.");
    return { prepared: null, issues };
  }
  const numbers = (record, fields) => Object.fromEntries(fields.map((field) => [field, numeric(record?.[field])]));
  const reference = (value) => typeof value === "string" ? value : scalar(value);
  const list = (value, field, maximum, map) => {
    if (value == null) return value;
    if (!Array.isArray(value) || value.length > maximum) {
      issue(field, `Use an explicit list of at most ${maximum} records.`);
      return null;
    }
    return value.map((record, index) => {
      if (!isRecord(record)) {
        issue(`${field}.${index}`, "Each proposal row must be an object.");
        return null;
      }
      return map(record);
    });
  };
  const design = {
    version: scalar(raw.version),
    bar_diameter_inches: numeric(raw.bar_diameter_inches),
    cover_inches: numbers(raw.cover_inches, ["side", "top", "bottom"]),
    supports: {
      mode: scalar(raw.supports?.mode),
      reason: scalar(raw.supports?.reason),
      spacing_inches: numeric(raw.supports?.spacing_inches),
      catalog_id: reference(raw.supports?.catalog_id),
      mats: list(raw.supports?.mats, "design.supports.mats", 256, (record) => ({
        mat_id: reference(record.mat_id),
        count: numeric(record.count)
      })),
      placements: list(raw.supports?.placements, "design.supports.placements", 4096, (record) => ({
        mat_id: reference(record.mat_id),
        x_inches: numeric(record.x_inches),
        z_inches: numeric(record.z_inches)
      }))
    },
    spread: {
      mats: list(raw.spread?.mats, "design.spread.mats", 256, (record) => ({
        id: reference(record.id),
        ...numbers(record, ["bearing_elevation_inches", "max_spacing_x_inches", "max_spacing_z_inches"])
      })),
      inter_mat_ties: list(raw.spread?.inter_mat_ties, "design.spread.inter_mat_ties", 4096, (record) => ({
        id: reference(record.id),
        from_mat_id: reference(record.from_mat_id),
        to_mat_id: reference(record.to_mat_id),
        ...numbers(record, ["x_inches", "z_inches", "cut_length_inches"])
      }))
    },
    pillar: {
      hoops: list(raw.pillar?.hoops, "design.pillar.hoops", 256, (record) => ({
        id: reference(record.id),
        ...numbers(record, ["center_y_inches", "centerline_diameter_inches", "cut_allowance_inches"])
      })),
      longitudinal: numbers(raw.pillar?.longitudinal, ["count", "radius_inches", "bottom_end_inches", "top_end_inches"])
    }
  };
  const source = isRecord(draft.material) ? draft.material : {};
  const material = {
    kind: scalar(source.kind),
    inventory_id: reference(source.inventory_id),
    name: scalar(source.name),
    reason: scalar(source.reason),
    unit: scalar(source.unit),
    ...numbers(source, ["bar_diameter_inches", "weight_lb_per_ft", "cost_per_ft"])
  };
  const overrides = isRecord(draft.overrides) ? draft.overrides : {};
  if (draft.overrides != null && !isRecord(draft.overrides)) issue("overrides", "Proposal overrides must be an object.");
  return {
    prepared: {
      schema_version: 1,
      design,
      material,
      overrides: { quantity_ft: numeric(overrides.quantity_ft ?? null), cost_per_ft: numeric(overrides.cost_per_ft ?? null) }
    },
    issues
  };
}
export {
  createFoundationReinforcementDraft,
  prepareFoundationReinforcementDraft
};
