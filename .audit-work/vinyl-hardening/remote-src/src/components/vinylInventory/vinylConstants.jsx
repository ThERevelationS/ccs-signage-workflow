// Central constants for the Vinyl Inventory UI — option lists, label maps,
// and visibility / cost helpers shared across the master view and the
// per-estimator tabs.

export const VINYL_CATEGORIES = [
  { id: "cast",                label: "Cast" },
  { id: "calendered",          label: "Calendered" },
  { id: "intermediate",        label: "Intermediate" },
  { id: "translucent",         label: "Translucent" },
  { id: "reflective",          label: "Reflective" },
  { id: "perforated_window",   label: "Perforated Window" },
  { id: "etched_glass",        label: "Etched / Frosted Glass" },
  { id: "fluorescent",         label: "Fluorescent" },
  { id: "metallic",            label: "Metallic" },
  { id: "carbon_fiber",        label: "Carbon Fiber" },
  { id: "chrome",              label: "Chrome" },
  { id: "magnetic",            label: "Magnetic" },
  { id: "wrap_film",           label: "Wrap Film" },
  { id: "print_media",         label: "Print Media" },
  { id: "laminate",            label: "Laminate (Overlam)" },
  { id: "transfer_tape",       label: "Transfer / Application Tape" },
  { id: "application_tape",    label: "Application Tape" },
  { id: "specialty",           label: "Specialty" },
];

export const VINYL_USE_CASES = [
  { id: "cut_graphics",         label: "Cut Graphics" },
  { id: "printed_graphics",     label: "Printed Graphics" },
  { id: "wrap",                 label: "Vehicle / Wall Wrap" },
  { id: "window_graphics",      label: "Window Graphics" },
  { id: "translucent_face",     label: "Translucent (Lightbox Face)" },
  { id: "reflective_traffic",   label: "Reflective (Traffic / Safety)" },
  { id: "floor_graphic",        label: "Floor Graphic" },
  { id: "wall_graphic",         label: "Wall Graphic" },
  { id: "vehicle_lettering",    label: "Vehicle Lettering" },
  { id: "channel_letter_face",  label: "Channel Letter Face" },
  { id: "monument_panel",       label: "Monument Panel" },
  { id: "general_signage",      label: "General Signage" },
];

export const VINYL_FINISHES = [
  "gloss", "matte", "satin", "metallic", "reflective",
  "transparent", "translucent", "frosted", "carbon_fiber", "brushed",
];

// Display labels for finishes — capitalized & spaced
export const VINYL_FINISH_LABELS = {
  gloss: "Gloss",
  matte: "Matte",
  satin: "Satin",
  metallic: "Metallic",
  reflective: "Reflective",
  transparent: "Transparent",
  translucent: "Translucent",
  frosted: "Frosted",
  carbon_fiber: "Carbon Fiber",
  brushed: "Brushed",
};

export const VINYL_ADHESIVES = [
  "permanent", "removable", "repositionable", "high_tack",
  "low_tack", "air_release", "controltac",
];

// Display labels for adhesive types — capitalized & spaced
export const VINYL_ADHESIVE_LABELS = {
  permanent: "Permanent",
  removable: "Removable",
  repositionable: "Repositionable",
  high_tack: "High Tack",
  low_tack: "Low Tack",
  air_release: "Air Release",
  controltac: "Controltac",
};

// Display labels for weeding difficulty — capitalized & spaced
export const WEEDING_DIFFICULTY_LABELS = {
  very_easy: "Very Easy",
  easy: "Easy",
  moderate: "Moderate",
  hard: "Hard",
  very_hard: "Very Hard",
};

export const APPLICATION_SURFACES = [
  "flat", "curved", "compound_curves", "rivets", "corrugated",
  "glass", "concrete", "painted_metal", "polished_metal", "plastic",
  "wood", "floor",
];

export const PRINTER_CHEMISTRIES = ["solvent", "eco_solvent", "latex", "uv", "aqueous"];

export const PRICING_MODES = [
  { id: "per_roll",         label: "Per Roll" },
  { id: "per_sqft",         label: "Per Sq Ft" },
  { id: "per_linear_foot",  label: "Per Linear Foot" },
];

export const WEEDING_DIFFICULTY = ["very_easy", "easy", "moderate", "hard", "very_hard"];

// Default extra labor minutes PER PART by weeding difficulty. "moderate" is the
// default selection (a.k.a. "Normal"). These are tweakable from the workflow UI.
export const WEEDING_LABOR_MINUTES_PER_PART = {
  very_easy: 0.1,
  easy:      0.3,
  moderate:  0.6,
  hard:      1.2,
  very_hard: 2.5,
};

// Print-quality tiers. High Quality is the DEFAULT.
export const PRINT_QUALITY_TIERS = [
  { id: "draft",         label: "Draft" },
  { id: "production",    label: "Production" },
  { id: "high_quality",  label: "High Quality" },
];

// Pick the right $/sqin for a printer + quality. Falls back to legacy
// `print_cost_per_sqin` if the tiered fields aren't populated.
export const inkCostPerSqIn = (printer, quality = "high_quality") => {
  if (!printer) return 0;
  const map = {
    draft:        parseFloat(printer.print_cost_per_sqin_draft),
    production:   parseFloat(printer.print_cost_per_sqin_production),
    high_quality: parseFloat(printer.print_cost_per_sqin_high_quality),
  };
  const tiered = map[quality];
  if (Number.isFinite(tiered) && tiered > 0) return tiered;
  return parseFloat(printer.print_cost_per_sqin) || 0;
};

// Compute the unit cost the estimator should use, in $/sqft, regardless of
// how the vinyl is priced.
export const vinylCostPerSqft = (v) => {
  if (!v) return 0;
  const w = parseFloat(v.roll_width_inches) || 0;
  const lYd = parseFloat(v.roll_length_yards) || 0;
  const rollSqFt = (w / 12) * (lYd * 3); // width(ft) × length(ft)
  switch (v.pricing_mode) {
    case "per_sqft":
      return parseFloat(v.cost_per_sqft) || 0;
    case "per_linear_foot": {
      const widthFt = w / 12;
      return widthFt > 0 ? (parseFloat(v.cost_per_linear_foot) || 0) / widthFt : 0;
    }
    case "per_roll":
    default:
      return rollSqFt > 0 ? (parseFloat(v.cost_per_roll) || 0) / rollSqFt : 0;
  }
};

// Filter helper — applies the same "scope" logic used by other estimator
// inventory tabs (substrates, equipment).
export const filterVinylForScope = (items, scope) => {
  if (!Array.isArray(items)) return [];
  return items.filter((v) => {
    if (v.is_active === false) return false;
    if (v.show_in_master_only) return scope === "master";
    if (scope === "channel_letters") return v.show_in_channel_letters !== false;
    if (scope === "sign_maintenance") return v.show_in_sign_maintenance !== false;
    return true; // master
  });
};