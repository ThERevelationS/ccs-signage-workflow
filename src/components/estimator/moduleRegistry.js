// Registry of estimator modules. Each section of an All-In-One estimate is a
// sub-estimate record living in its module's own entity.
export const ESTIMATOR_MODULES = [
  { key: "foundation", label: "Concrete | Masonry | Poles", entity: "FoundationProject", page: "FoundationEstimator" },
  { key: "channel_letters", label: "Channel & Dimensional Letters", entity: "ChannelLetterInstallation", page: "ChannelLetterEstimator" },
  { key: "vinyl", label: "Vinyl & Graphics", entity: "VinylProject", page: "VinylEstimator" },
  { key: "cnc", label: "CNC Router", entity: "CNCProject", page: "CNCEstimator" },
  { key: "laser", label: "Laser", entity: "LaserProject", page: "LaserEstimator" },
  { key: "metal", label: "Metal Fabrication", entity: "MetalProject", page: "MetalEstimator" },
  { key: "brick_stone", label: "Brick & Stone", entity: "BrickStoneProject", page: "BrickStoneEstimator" },
  { key: "maintenance", label: "Sign Maintenance", entity: "MaintenanceProject", page: "MaintenanceEstimator" },
  { key: "painting", label: "Painting", entity: "Project", page: "PaintingEstimator" },
  { key: "custom_items", label: "Custom line items", entity: "CustomItemsProject", page: "CustomItemsEstimator" },
];

// Field on the sub-estimate record holding its grand total. Foundation projects
// keep their totals split across several fields, so their snapshot is written by
// the Foundation estimator itself and is not refreshed here.
// Modules absent from this map have no single total field. sourceProjectTotal
// handles them explicitly (e.g. painting sums its mask/supplies/labor totals,
// foundation derives its total from grand_total or its known cost fields).
export const MODULE_TOTAL_FIELD = {
  channel_letters: "total_cost",
  vinyl: "total_cost",
  cnc: "total_cost",
  laser: "total_cost",
  metal: "total_cost",
  brick_stone: "total_cost",
  maintenance: "total_cost",
  custom_items: "total_cost",
};

const LEGACY_MODULES = {};

export const getModule = (key) => ESTIMATOR_MODULES.find((m) => m.key === key) || LEGACY_MODULES[key];

export const getModuleLabel = (key) => getModule(key)?.label || key;