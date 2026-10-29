export const SIGN_TYPES = [
  { value: "flush_channel", label: "Flush Channel Letters", cabinet: false },
  { value: "halo_channel", label: "Halo / Reverse Channel", cabinet: false },
  { value: "raceway_channel", label: "Raceway Channel Letters", cabinet: false },
  { value: "capsule_logo", label: "Capsule / Logo Box", cabinet: true },
  { value: "dimensional_letters", label: "Dimensional Letters", cabinet: false },
  { value: "monument_sign", label: "Monument Sign", cabinet: true },
  { value: "pylon_sign", label: "Pylon Sign", cabinet: true },
  { value: "post_and_panel", label: "Post & Panel", cabinet: true },
];

export const ACTIONS = [
  "clean",
  "repaint",
  "led_retrofit",
  "replace_leds",
  "replace_power_supplies",
  "replace_fluorescent_tubes",
  "fix_electrical",
  "troubleshoot",
  "vinyl_replacement",
  "replace_face",
  "replace_returns",
  "replace_trim_cap",
  "reseal",
  "rewire",
  "replace_ballast",
  "replace_transformer",
  "replace_breaker",
  "replace_photocell",
  "replace_timer",
  "replace_disconnect",
];

export const LETTER_SIZES = [
  { value: "extra_small", label: 'XS (< 12")', minutesKey: "base_minutes_xs", costKey: "cost_extra_small" },
  { value: "small", label: 'S (12–18")', minutesKey: "base_minutes_s", costKey: "cost_small" },
  { value: "medium", label: 'M (18–24")', minutesKey: "base_minutes_m", costKey: "cost_medium" },
  { value: "large", label: 'L (24–36")', minutesKey: "base_minutes_l", costKey: "cost_large" },
  { value: "extra_large", label: 'XL (36–48")', minutesKey: "base_minutes_xl", costKey: "cost_extra_large" },
  {
    value: "extra_extra_large",
    label: 'XXL (48"+)',
    minutesKey: "base_minutes_xxl",
    costKey: "cost_extra_extra_large",
  },
];

export const CABINET_SIZES = [
  { value: "cab_small", label: "Small (≤16 sqft)", minutesKey: "base_minutes_cab_s", costKey: "cost_cab_small" },
  { value: "cab_medium", label: "Medium (16–48 sqft)", minutesKey: "base_minutes_cab_m", costKey: "cost_cab_medium" },
  { value: "cab_large", label: "Large (48–100 sqft)", minutesKey: "base_minutes_cab_l", costKey: "cost_cab_large" },
  {
    value: "cab_extra_large",
    label: "XL (100+ sqft)",
    minutesKey: "base_minutes_cab_xl",
    costKey: "cost_cab_extra_large",
  },
];

export const isCabinetType = (t) => !!SIGN_TYPES.find((s) => s.value === t)?.cabinet;

export const sizesFor = (signType) => (isCabinetType(signType) ? CABINET_SIZES : LETTER_SIZES);

export const sizeMeta = (size) =>
  [...LETTER_SIZES, ...CABINET_SIZES].find((s) => s.value === size) || LETTER_SIZES[2];

export const actionLabel = (a) => a.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const signTypeLabel = (t) => SIGN_TYPES.find((s) => s.value === t)?.label || t;