export const foundationInputNumber = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const foundationPositiveWholeNumber = value => {
  const number = foundationInputNumber(value);
  const whole = typeof value !== "string" || /^[+-]?\d+(?:\.0*)?$/.test(value.trim());
  return whole && Number.isSafeInteger(number) && number > 0;
};

export function foundationGeometryValidation(item, index = 0) {
  const record = item ?? {};
  const issues = [];
  const add = (field, code, message) => issues.push({
    kind: "foundation", index, componentId: record.component_id ?? null, field, code,
    message: `Foundation ${index + 1}: ${message}`,
  });
  const type = record.foundation_type;
  if (type !== "spread_foot" && type !== "pillar") {
    add("foundation_type", "foundation_type_invalid", "select Spread Footing or Pillar / Caisson.");
  }
  const count = record.quantity ?? 1;
  const quantity = foundationInputNumber(count);
  if (!foundationPositiveWholeNumber(count)) {
    add("quantity", "foundation_quantity_invalid", "quantity must be a positive whole number within the supported range.");
  }
  const fields = type === "spread_foot"
    ? [["length_inches", "length"], ["width_inches", "width"], ["depth_inches", "depth"]]
    : type === "pillar" ? [["diameter", "diameter"], ["depth_inches", "depth"]] : [];
  const dimensions = {};
  for (const [field, label] of fields) {
    const value = foundationInputNumber(record[field]);
    dimensions[field] = value;
    if (value === null || value <= 0) {
      add(field, "foundation_dimension_invalid", `${label} (inches) must be a finite positive number.`);
    }
  }
  if (!issues.length) {
    const depth = dimensions.depth_inches / 12;
    const radius = dimensions.diameter / 24;
    const volume = type === "spread_foot"
      ? ((dimensions.length_inches / 12) * (dimensions.width_inches / 12) * depth) / 27 * quantity
      : (Math.PI * radius * radius * depth) / 27 * quantity;
    // This is numeric-range validation, not a structural design or engineering minimum.
    if (!Number.isFinite(volume) || volume <= 0) {
      add("dimensions", "foundation_volume_out_of_range", "dimensions and quantity cannot produce a finite positive volume in the supported calculation range.");
    }
  }
  return { issues, type, quantity, dimensions };
}

export function foundationItemGeometryIssues(item, index = 0) {
  return foundationGeometryValidation(item, index).issues;
}

// â”€â”€ O-093 (CMP-H02) input-layer schema â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Plain-language labels, contextual help, and suggested-format placeholders for
// every linear-dimension entry surface in the foundation module. Stored values
// stay canonical inches â€” `placeholder` is DISPLAY text only; this map never
// mints stored defaults (explicit-null discipline unchanged: add-row factories
// keep their existing authored init values, blank fields stay blank).
// `ftIn: true` fields accept feet/inches text via foundationDimensionDraftValue
// in ./foundationFtInEntry (canonical inches out, verbatim draft on failure).
// `signed: true` fields legitimately take negative values (offsets); positivity
// for the rest stays with the existing calc validation, not the input layer.
// Sections keyed by surface so same-named fields (length_inches on a footing
// vs a wall cap) never collide.
export const FOUNDATION_DIMENSION_FIELDS = Object.freeze({
  // Foundation item card (spread footing / pillar) â€” consumed by the card-label
  // remainder; recorded here so card + panels share one label source.
  foundation: Object.freeze({
    length_inches: Object.freeze({
      label: "Length (in)",
      help: "Footing length â€” the long side of a rectangular spread footing.",
      placeholder: "4' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    width_inches: Object.freeze({
      label: "Width (in)",
      help: "Footing width â€” the short side of a rectangular spread footing.",
      placeholder: "4' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    depth_inches: Object.freeze({
      label: "Depth (in)",
      help: "Footing or pier depth below grade â€” must reach below the frost line for your area.",
      placeholder: "3' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    diameter: Object.freeze({
      label: "Diameter (in)",
      help: "Round pier diameter measured straight across the top.",
      placeholder: "2' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    grade_offset_inches: Object.freeze({
      label: "Grade offset (in)",
      help: "How far the footing top sits above (+) or below (-) finished grade.",
      placeholder: "0\"",
      unit: "inches", ftIn: true, signed: true,
    }),
  }),
  // Project poles (FoundationPolesPanel).
  pole: Object.freeze({
    height_inches: Object.freeze({
      label: "Height above grade (in)",
      help: "Exposed pole length from finished grade up to the sign mount.",
      placeholder: "10' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    embedment_inches: Object.freeze({
      label: "Embedment below grade (in)",
      help: "Pole length buried in the footing â€” must satisfy frost depth and the pole supplier's embedment guidance.",
      placeholder: "3' 6\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    base_offset_inches: Object.freeze({
      label: "Base offset above grade (in)",
      help: "Lifts the pole bottom above grade for wall or pier mounts â€” the gap still counts toward required stock length.",
      placeholder: "0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    total_length_inches: Object.freeze({
      label: "Total stock length (in)",
      help: "Billed pole length when a full stick is purchased â€” leave blank to price height above grade plus embedment.",
      placeholder: "20' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
  }),
  // Masonry walls (FoundationWallsPanel) â€” camelCase wall record keys.
  wall: Object.freeze({
    heightInches: Object.freeze({
      label: "Wall height (in)",
      help: "Finished masonry height measured from the footing up.",
      placeholder: "2' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    mortarGapInches: Object.freeze({
      label: "Mortar joint (in)",
      help: "Mortar thickness between masonry units â€” 3/8\" is typical.",
      placeholder: "3/8\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    internalWallHeightInches: Object.freeze({
      label: "Fill wall height (in)",
      help: "Internal fill wall height â€” blank follows the outer wall height.",
      placeholder: "2' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    internalMortarGapInches: Object.freeze({
      label: "Fill mortar joint (in)",
      help: "Mortar thickness for the internal fill wall.",
      placeholder: "3/8\"",
      unit: "inches", ftIn: true, signed: false,
    }),
  }),
  // Wall caps (FoundationWallCapsPanel) â€” length_inches is the cap cut, not a
  // footing length; keep it in its own section.
  wallCap: Object.freeze({
    length_inches: Object.freeze({
      label: "Cut length (in)",
      help: "Cap stock cut for this piece â€” the full stock price is charged per cut piece.",
      placeholder: "4' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    overhang_inches: Object.freeze({
      label: "Overhang (in)",
      help: "How far the cap projects past each wall face -- 0 is flush.",
      placeholder: "1\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    height_inches: Object.freeze({
      label: "Cap thickness (in)",
      help: "Vertical thickness of the cap piece sitting on the wall.",
      placeholder: "3\"",
      unit: "inches", ftIn: true, signed: false,
    }),
  }),
  // Pole-mounted signs (FoundationPolesPanel sign sub-list).
  sign: Object.freeze({
    width_inches: Object.freeze({
      label: "W (in)",
      help: "Sign face width across the pole.",
      placeholder: "4' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    height_inches: Object.freeze({
      label: "H (in)",
      help: "Sign face height.",
      placeholder: "2' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    mount_height_inches: Object.freeze({
      label: "Mount ht (in)",
      help: "Height from grade up to the sign's mounting point.",
      placeholder: "8' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
  }),
  // Signage cabinets (SignageCabinetsPanel).
  cabinet: Object.freeze({
    width_inches: Object.freeze({
      label: "Width (in)",
      help: "Cabinet face width â€” horizontal across the sign face.",
      placeholder: "4' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    height_inches: Object.freeze({
      label: "Height (in)",
      help: "Cabinet face height â€” vertical on the sign face.",
      placeholder: "2' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    depth_inches: Object.freeze({
      label: "Depth (in)",
      help: "Cabinet depth front-to-back â€” affects wind load and mounting.",
      placeholder: "8\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    mount_height_inches: Object.freeze({
      label: "Mount height (in)",
      help: "Height from grade up to the cabinet's mounting point.",
      placeholder: "0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
  }),
  // Rectangle outline entry (WallShapeEditor) â€” local draft, applied on click.
  wallOutline: Object.freeze({
    rect_length: Object.freeze({
      label: "Rectangle length (in)",
      help: "Footprint length for a rectangular wall outline.",
      placeholder: "8' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
    rect_width: Object.freeze({
      label: "Rectangle width (in)",
      help: "Footprint width for a rectangular wall outline.",
      placeholder: "4' 0\"",
      unit: "inches", ftIn: true, signed: false,
    }),
  }),
  // Landscape grid (LandscapeDesigner).
  landscape: Object.freeze({
    cell_size_inches: Object.freeze({
      label: "Cell size (in)",
      help: "Edge length of one grid cell â€” 12\" makes each cell 1 sq ft.",
      placeholder: "12\"",
      unit: "inches", ftIn: true, signed: false,
    }),
  }),
});

// Field-metadata resolver â€” fail-closed: unknown section or field â†’ null, so
// callers never render a guessed label for an unmapped field.
export const foundationDimensionFieldMeta = (section, field) => {
  const group = FOUNDATION_DIMENSION_FIELDS[section];
  return group ? group[field] ?? null : null;
};