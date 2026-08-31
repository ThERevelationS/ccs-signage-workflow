// Workflow presets — one click toggles the right machine passes + bleed
// defaults for common vinyl jobs (cut-only decals, printed banners, wraps, etc.)
// Feature #5.

export const WORKFLOW_PRESETS = [
  {
    key: "cut_only",
    label: "Cut Only",
    description: "Solid color cut vinyl (e.g. one-color logos, vehicle lettering).",
    apply_print: false,
    apply_cut: true,
    apply_laminate: false,
    bleed_inches: 0,
  },
  {
    key: "print_only",
    label: "Print Only",
    description: "Printed graphics trimmed by hand or guillotine (banners, posters).",
    apply_print: true,
    apply_cut: false,
    apply_laminate: false,
    bleed_inches: 0.125,
  },
  {
    key: "print_and_cut",
    label: "Print + Contour Cut",
    description: "Printed + contour-cut decals.",
    apply_print: true,
    apply_cut: true,
    apply_laminate: false,
    bleed_inches: 0.125,
  },
  {
    key: "wrap",
    label: "Vehicle / Wall Wrap",
    description: "Printed + laminated wrap film (cast vinyl).",
    apply_print: true,
    apply_cut: false,
    apply_laminate: true,
    bleed_inches: 0.25,
  },
  {
    key: "laminated_decal",
    label: "Laminated Decal",
    description: "Print + cut + overlam — outdoor stickers, badges.",
    apply_print: true,
    apply_cut: true,
    apply_laminate: true,
    bleed_inches: 0.125,
  },
];

// Apply a preset to a workflow (returns patch only — caller merges).
export const applyPresetToWorkflow = (preset) => ({
  apply_print: preset.apply_print,
  apply_cut: preset.apply_cut,
  apply_laminate: preset.apply_laminate,
  preset_key: preset.key,
});