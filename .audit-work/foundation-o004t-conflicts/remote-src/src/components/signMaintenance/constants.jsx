// Sign Maintenance — central constants used across the module.
// Sign types and action types are the two axes of the rate matrix and the
// inventory tagging system. Keep these in sync with the enums in:
//   entities/MaintenanceProject.json  (items[].sign_type / items[].actions[].action)
//   entities/MaintenanceInventory.json (applies_to_*)
//   entities/MaintenanceActionRate.json (sign_type / action)

export const SIGN_TYPES = [
  // Channel-letter family — these use letter sizing
  { id: "flush_channel",      label: "Flush Channel",         family: "letter",  color: "blue",   description: "Channel letters mounted flat to wall" },
  { id: "halo_channel",       label: "Halo Channel",          family: "letter",  color: "amber",  description: "Reverse-lit channel letters" },
  { id: "raceway_channel",    label: "Raceway Channel",       family: "letter",  color: "purple", description: "Letters mounted on a power-feed bar" },
  { id: "capsule_logo",       label: "Capsule / Logo",        family: "letter",  color: "teal",   description: "Capsule, pillbox, or logo elements" },
  { id: "dimensional_letters",label: "Dimensional Letters",   family: "letter",  color: "indigo", description: "Non-illuminated fabricated letters" },
  // Cabinet family — these use cabinet sizing
  { id: "monument_sign",      label: "Monument Sign",         family: "cabinet", color: "stone",  description: "Ground-level monument cabinet" },
  { id: "pylon_sign",         label: "Pylon Sign",            family: "cabinet", color: "slate",  description: "Tall pole-mounted cabinet" },
  { id: "post_and_panel",     label: "Post & Panel",          family: "cabinet", color: "emerald",description: "Panel mounted between posts" },
];

export const SIGN_TYPES_BY_ID = SIGN_TYPES.reduce((acc, t) => { acc[t.id] = t; return acc; }, {});

// Letter sizes — same scheme as channel letter install
export const LETTER_SIZES = [
  { id: "extra_small",       label: "XS",    range: '2"–8"' },
  { id: "small",             label: "Small", range: '8"–12"' },
  { id: "medium",            label: "Medium",range: '12"–24"' },
  { id: "large",             label: "Large", range: '24"–48"' },
  { id: "extra_large",       label: "XL",    range: '48"–60"' },
  { id: "extra_extra_large", label: "XXL",   range: '60"+' },
];

// Cabinet sizes — used for Monument, Pylon, Post & Panel
export const CABINET_SIZES = [
  { id: "cab_small",       label: "Small Cabinet",  range: "≤ 16 sqft   (e.g. 4×4)" },
  { id: "cab_medium",      label: "Medium Cabinet", range: "16–48 sqft  (e.g. 4×8 – 6×8)" },
  { id: "cab_large",       label: "Large Cabinet",  range: "48–100 sqft (e.g. 8×10)" },
  { id: "cab_extra_large", label: "XL Cabinet",     range: "100+ sqft   (large pylons)" },
];

// All maintenance actions, grouped logically for settings UI.
export const ACTIONS = [
  // Cosmetic
  { id: "clean",                     label: "Clean",                       group: "Cosmetic" },
  { id: "repaint",                   label: "Repaint",                     group: "Cosmetic" },
  { id: "vinyl_replacement",         label: "Vinyl Replacement",           group: "Cosmetic" },
  { id: "reseal",                    label: "Reseal / Caulk",              group: "Cosmetic" },
  // LED / Lamp
  { id: "led_retrofit",              label: "LED Retrofit",                group: "LED / Lamp" },
  { id: "replace_leds",              label: "Replace LEDs",                group: "LED / Lamp" },
  { id: "replace_fluorescent_tubes", label: "Replace Fluorescent Tubes",   group: "LED / Lamp" },
  { id: "replace_ballast",           label: "Replace Ballast",             group: "LED / Lamp" },
  // Electrical
  { id: "replace_power_supplies",    label: "Replace Power Supplies",      group: "Electrical" },
  { id: "replace_transformer",       label: "Replace Transformer",         group: "Electrical" },
  { id: "fix_electrical",            label: "Fix Electrical Issues",       group: "Electrical" },
  { id: "rewire",                    label: "Rewire",                      group: "Electrical" },
  { id: "replace_breaker",           label: "Replace Breaker",             group: "Electrical" },
  { id: "replace_photocell",         label: "Replace Photocell",           group: "Electrical" },
  { id: "replace_timer",             label: "Replace Timer",               group: "Electrical" },
  { id: "replace_disconnect",        label: "Replace Disconnect",          group: "Electrical" },
  { id: "troubleshoot",              label: "Troubleshoot",                group: "Electrical" },
  // Structural / Component replacement
  { id: "replace_face",              label: "Replace Face",                group: "Component" },
  { id: "replace_returns",           label: "Replace Returns",             group: "Component" },
  { id: "replace_trim_cap",          label: "Replace Trim Cap",            group: "Component" },
];

export const ACTIONS_BY_ID = ACTIONS.reduce((acc, a) => { acc[a.id] = a; return acc; }, {});

export const ACTION_GROUPS = Array.from(new Set(ACTIONS.map(a => a.group)));

// Which actions are even applicable to a given sign type?
// This drives both the Service Items picker and the Settings grid (we hide
// combos that don't make sense — e.g. you don't "replace returns" on a Monument).
export const ACTIONS_FOR_SIGN_TYPE = {
  flush_channel:       ACTIONS.map(a => a.id),
  halo_channel:        ACTIONS.map(a => a.id),
  raceway_channel:     ACTIONS.map(a => a.id),
  capsule_logo:        ACTIONS.map(a => a.id).filter(id => !["replace_returns", "replace_trim_cap"].includes(id)),
  dimensional_letters: ["clean", "repaint", "vinyl_replacement", "reseal"], // no electrical
  monument_sign:       ACTIONS.map(a => a.id).filter(id => !["replace_returns", "replace_trim_cap"].includes(id)),
  pylon_sign:          ACTIONS.map(a => a.id).filter(id => !["replace_returns", "replace_trim_cap"].includes(id)),
  post_and_panel:      ["clean", "repaint", "vinyl_replacement", "reseal", "replace_face"],
};

// Which size axis applies to a given sign type
export const sizeAxisFor = (signTypeId) => {
  const st = SIGN_TYPES_BY_ID[signTypeId];
  return st?.family === "cabinet" ? "cabinet" : "letter";
};

export const sizeOptionsFor = (signTypeId) =>
  sizeAxisFor(signTypeId) === "cabinet" ? CABINET_SIZES : LETTER_SIZES;