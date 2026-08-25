// Registry of estimator modules. Each section of an All-In-One estimate is a
// sub-estimate record living in its module's own entity.
export const ESTIMATOR_MODULES = [
  { key: "foundation", label: "Concrete | Masonry | Poles", entity: "FoundationProject", page: "FoundationEstimator" },
  { key: "channel_letters", label: "Channel & Dimensional Letters", entity: "ChannelLetterInstallation" },
  { key: "vinyl", label: "Vinyl & Graphics", entity: "VinylProject", page: "VinylEstimator" },
  { key: "cnc", label: "CNC Router", entity: "CNCProject" },
  { key: "laser", label: "Laser", entity: "LaserProject" },
  { key: "metal", label: "Metal Fabrication", entity: "MetalProject" },
  { key: "brick_stone", label: "Brick & Stone", entity: "BrickStoneProject" },
  { key: "maintenance", label: "Sign Maintenance", entity: "MaintenanceProject" },
];

export const getModule = (key) => ESTIMATOR_MODULES.find((m) => m.key === key);

export const getModuleLabel = (key) => getModule(key)?.label || key;