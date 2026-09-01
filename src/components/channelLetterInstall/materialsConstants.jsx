// Shared constants & labels for the Channel Letter Install Materials inventory.
// Materials are grouped by "Applies To" (installation type), not by a separate category.

export const APPLIES_TO_GROUPS = [
  { value: "flush_mount", label: "Flush Mount", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "halo_lit", label: "Halo-Lit", color: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "raceway", label: "Raceway", color: "bg-purple-100 text-purple-800 border-purple-200" },
  { value: "dimensional_lettering", label: "Dimensional Lettering", color: "bg-teal-100 text-teal-800 border-teal-200" },
  { value: "backer", label: "Backer (Standoffs & Hardware)", color: "bg-orange-100 text-orange-800 border-orange-200" },
];

// All concrete installation type values used for grouping.
export const ALL_INSTALL_TYPES = APPLIES_TO_GROUPS.map(g => g.value);

export const APPLIES_TO_MAP = APPLIES_TO_GROUPS.reduce((acc, g) => {
  acc[g.value] = g;
  return acc;
}, {});

// `icon` is a Lucide icon name string; resolved in components that render badges.
export const CRITERIA_OPTIONS = [
  { value: "per_letter_flat", label: "Per Letter (Flat)", short: "Per Letter", icon: "Type", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { value: "per_letter_by_size", label: "Per Letter (By Size)", short: "By Size", icon: "Ruler", color: "bg-violet-100 text-violet-700 border-violet-200" },
  { value: "per_raceway_foot", label: "Per Raceway (Per Foot)", short: "Per Foot", icon: "MoveHorizontal", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { value: "per_project_flat", label: "Per Sign (Flat)", short: "Per Sign", icon: "Hash", color: "bg-rose-100 text-rose-700 border-rose-200" },
];

export const CRITERIA_MAP = CRITERIA_OPTIONS.reduce((acc, c) => {
  acc[c.value] = c;
  return acc;
}, {});

export const APPLIES_TO_LABEL = {
  flush_mount: "Flush Mount",
  halo_lit: "Halo-Lit",
  raceway: "Raceway",
  dimensional_lettering: "Dimensional Lettering",
  backer: "Backer (Standoffs & Hardware)",
};

export const emptyMaterialItem = () => ({
  item_name: "",
  applies_to: "all",
  applies_to_list: [],
  pricing_mode: "per_letter_flat",
  cost_per_letter: 0,
  cost_extra_small: 0,
  cost_small: 0,
  cost_medium: 0,
  cost_large: 0,
  cost_extra_large: 0,
  cost_extra_extra_large: 0,
  cost_per_foot: 0,
  cost_flat: 0,
  quantity_tiers: [],
  price_history: [],
  unit: "ea",
  supplier: "",
  notes: "",
  is_default: true,
  sort_order: 0,
});

// Headline cost shown in collapsed card view
export const summarizeCost = (item) => {
  switch (item.pricing_mode) {
    case "per_letter_flat":
      return `$${(parseFloat(item.cost_per_letter) || 0).toFixed(2)} / letter`;
    case "per_letter_by_size": {
      const vals = [
        item.cost_extra_small, item.cost_small, item.cost_medium,
        item.cost_large, item.cost_extra_large, item.cost_extra_extra_large,
      ].map(v => parseFloat(v) || 0).filter(v => v > 0);
      if (vals.length === 0) return "By size — not set";
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return min === max ? `$${min.toFixed(2)} / letter` : `$${min.toFixed(2)} – $${max.toFixed(2)} / letter`;
    }
    case "per_raceway_foot":
      return `$${(parseFloat(item.cost_per_foot) || 0).toFixed(2)} / ft`;
    case "per_project_flat":
      return `$${(parseFloat(item.cost_flat) || 0).toFixed(2)} / sign`;
    default:
      return "";
  }
};