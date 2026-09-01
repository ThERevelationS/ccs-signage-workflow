// Shared catalog of common exterior wall materials for channel letter installations.
// Each entry has a settings key for the multiplier and a sensible default.

export const WALL_MATERIALS = [
  { id: "eifs", label: "EIFS / Stucco Synthetic", description: "Synthetic stucco over foam", settingKey: "install_wall_eifs_multiplier", default: 1.0 },
  { id: "brick", label: "Brick Veneer", description: "Standard brick facade", settingKey: "install_wall_brick_multiplier", default: 1.2 },
  { id: "cmu", label: "CMU / Cinder Block", description: "Concrete masonry units", settingKey: "install_wall_cmu_multiplier", default: 1.15 },
  { id: "poured_concrete", label: "Concrete", description: "Solid concrete wall / tilt-up", settingKey: "install_wall_concrete_multiplier", default: 1.3 },
  { id: "metal_panel", label: "Metal Panel", description: "Insulated or single-skin metal", settingKey: "install_wall_metal_panel_multiplier", default: 1.0 },
  { id: "acm", label: "ACM / Composite Panel", description: "Aluminum composite cladding", settingKey: "install_wall_acm_multiplier", default: 1.05 },
  { id: "wood_siding", label: "Wood Siding", description: "Lap, shake, or board siding", settingKey: "install_wall_wood_multiplier", default: 0.95 },
  { id: "vinyl_siding", label: "Vinyl Siding", description: "PVC lap siding", settingKey: "install_wall_vinyl_multiplier", default: 0.95 },
  { id: "stone_veneer", label: "Stone Veneer", description: "Natural or manufactured stone", settingKey: "install_wall_stone_multiplier", default: 1.3 },
  { id: "drywall_interior", label: "Drywall (Interior)", description: "Interior gypsum board", settingKey: "install_wall_drywall_multiplier", default: 0.9 },
  { id: "plywood_substrate", label: "Plywood / OSB", description: "Wood sheathing substrate", settingKey: "install_wall_plywood_multiplier", default: 0.95 },
  { id: "other", label: "Other / Unknown", description: "Custom or unspecified surface", settingKey: "install_wall_other_multiplier", default: 1.1 },
];

export const WALL_MATERIAL_MAP = WALL_MATERIALS.reduce((acc, m) => {
  acc[m.id] = m;
  return acc;
}, {});

export const getWallMaterialMultiplier = (wallMaterialId, settings) => {
  if (!wallMaterialId) return 1.0;
  const def = WALL_MATERIAL_MAP[wallMaterialId];
  if (!def) return 1.0;
  const v = parseFloat(settings?.[def.settingKey]);
  return isNaN(v) ? def.default : v;
};