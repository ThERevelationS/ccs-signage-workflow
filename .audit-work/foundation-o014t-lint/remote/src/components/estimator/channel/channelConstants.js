export const INSTALL_TYPES = [
  { value: "flush_mount", label: "Flush Mount Channel" },
  { value: "halo_lit", label: "Halo / Reverse Lit" },
  { value: "raceway", label: "Raceway Mounted" },
  { value: "dimensional_lettering", label: "Dimensional Lettering" },
  { value: "backer", label: "Backer Panel" },
];

// Default install minutes per letter by size tier, before difficulty factors.
export const LETTER_SIZES = [
  { value: "extra_small", label: 'XS (< 12")', minutes: 12, costKey: "cost_extra_small" },
  { value: "small", label: 'S (12–18")', minutes: 15, costKey: "cost_small" },
  { value: "medium", label: 'M (18–24")', minutes: 20, costKey: "cost_medium" },
  { value: "large", label: 'L (24–36")', minutes: 28, costKey: "cost_large" },
  { value: "extra_large", label: 'XL (36–48")', minutes: 38, costKey: "cost_extra_large" },
  { value: "extra_extra_large", label: 'XXL (48"+)', minutes: 50, costKey: "cost_extra_extra_large" },
];

export const sizeMeta = (v) => LETTER_SIZES.find((s) => s.value === v) || LETTER_SIZES[2];

export const installTypeLabel = (v) => INSTALL_TYPES.find((t) => t.value === v)?.label || v;

// Difficulty adders applied as multipliers on install labor.
export const DIFFICULTY_FACTORS = [
  { key: "thick_hollow_walls", label: "Thick / hollow walls", factor: 0.2 },
  { key: "parapet", label: "Parapet access", factor: 0.15 },
  { key: "poor_electrical_access", label: "Poor electrical access", factor: 0.25 },
];

export const EQUIPMENT_DURATION_FIELD = {
  owned_flat: { label: "flat", costKey: "cost_flat", scales: false },
  per_hour: { label: "hours", costKey: "cost_per_hour", scales: true },
  per_day: { label: "days", costKey: "cost_per_day", scales: true },
  per_week: { label: "weeks", costKey: "cost_per_week", scales: true },
  per_month: { label: "months", costKey: "cost_per_month", scales: true },
  per_project_flat: { label: "flat", costKey: "cost_flat", scales: false },
};