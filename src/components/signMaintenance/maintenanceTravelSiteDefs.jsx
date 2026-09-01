// Maintenance-namespaced clones of the Channel Letter Settings — Travel and Site
// Conditions definitions. Same shape, same defaults, but stored under
// "maintenance_*" setting keys so the two modules stay independent.
//
// Sourced from pages/ChannelLetterInstallationSettings.jsx so the UX is identical.

export const maintenanceTravelDefs = [
  { name: "maintenance_shop_address", type: "text", category: "maintenance_shop_travel", label: "Shop Address", description: "Starting point for all maintenance travel calculations", default: "417 Northland Blvd, Cincinnati, OH 45246" },
  { name: "maintenance_gasoline_price_per_gallon", type: "number", category: "maintenance_shop_travel", label: "Gasoline Price", suffix: "$/gal", description: "Auto-refreshed daily from regional AAA data. Applied to owned vehicles with fuel_type = Gasoline.", default: "3.50" },
  { name: "maintenance_diesel_price_per_gallon", type: "number", category: "maintenance_shop_travel", label: "Diesel Price", suffix: "$/gal", description: "Auto-refreshed daily from regional AAA data. Applied to owned vehicles with fuel_type = Diesel.", default: "4.00" },
  { name: "maintenance_travel_labor_rate", type: "number", category: "maintenance_shop_travel", label: "Travel Labor Rate", suffix: "$/hr", description: "Hourly rate billed for crew travel time (separate from on-site labor)", default: "45" },
  { name: "maintenance_travel_avg_speed_mph", type: "number", category: "maintenance_shop_travel", label: "Average Travel Speed", suffix: "mph", description: "Used to estimate travel time from miles (round-trip)", default: "45" },
  { name: "maintenance_default_truck_mpg", type: "number", category: "maintenance_shop_travel", label: "Default Truck MPG", suffix: "mpg", description: "Fallback MPG if no owned truck is selected on the line item", default: "14" },
  { name: "maintenance_travel_overhead_per_mile", type: "number", category: "maintenance_shop_travel", label: "Vehicle Overhead", suffix: "$/mile", description: "Maintenance / wear allowance per mile (above fuel)", default: "0.25" },
  { name: "maintenance_min_travel_charge", type: "number", category: "maintenance_shop_travel", label: "Minimum Travel Charge", suffix: "$", description: "Floor amount applied if any travel is required", default: "0" },
];

export const maintenanceSiteConditionDefs = [
  // Parapet — Electrical ON ROOF
  { name: "maintenance_parapet_roof_extra_per_letter",  type: "number", category: "maintenance_parapet_roof",  label: "Extra Time per Letter",  suffix: "+min/letter",  description: "Electrical runs along the rooftop — extra minutes per letter for parapet edge work", default: "10" },
  { name: "maintenance_parapet_roof_extra_per_raceway", type: "number", category: "maintenance_parapet_roof",  label: "Extra Time per Raceway", suffix: "+min/raceway", description: "Electrical runs along the rooftop — extra minutes per raceway line item for parapet edge work", default: "40" },
  // Parapet — Electrical DROPS INSIDE parapet
  { name: "maintenance_parapet_drop_extra_per_letter",  type: "number", category: "maintenance_parapet_drop",  label: "Extra Time per Letter",  suffix: "+min/letter",  description: "Electrical drops down inside the parapet cavity — extra minutes per letter (typically harder)", default: "18" },
  { name: "maintenance_parapet_drop_extra_per_raceway", type: "number", category: "maintenance_parapet_drop",  label: "Extra Time per Raceway", suffix: "+min/raceway", description: "Electrical drops down inside the parapet cavity — extra minutes per raceway line item", default: "65" },
  // Thick / Hollow Walls
  { name: "maintenance_thick_walls_extra_per_letter",   type: "number", category: "maintenance_thick_walls",   label: "Extra Time per Letter",  suffix: "+min/letter",  description: "Additional minutes added per letter when working on brick veneer, masonry, or hollow-cavity walls", default: "8" },
  { name: "maintenance_thick_walls_extra_per_raceway",  type: "number", category: "maintenance_thick_walls",   label: "Extra Time per Raceway", suffix: "+min/raceway", description: "Additional minutes added per raceway line item when working on thick or hollow walls", default: "30" },

  // Site condition Multipliers
  { name: "maintenance_escort_multiplier",       type: "number", category: "maintenance_site_conditions", label: "Escort Required",       suffix: "×", description: "Must be escorted on-site at all times", default: "1.15" },
  { name: "maintenance_badging_multiplier",      type: "number", category: "maintenance_site_conditions", label: "Badging / Check-in",    suffix: "×", description: "Security badge or sign-in required", default: "1.1" },
  { name: "maintenance_after_hours_multiplier",  type: "number", category: "maintenance_site_conditions", label: "After-Hours / Weekend", suffix: "×", description: "Night, early morning, or weekend service call", default: "1.5" },
  { name: "maintenance_set_hours_multiplier",    type: "number", category: "maintenance_site_conditions", label: "Set-Hours Service",     suffix: "×", description: "Fixed time window / scheduled appointment", default: "1.15" },

  // Poor Electrical Access — 10 severity levels (additive minutes)
  ...[3, 6, 10, 15, 20, 28, 38, 50, 65, 90].map((m, i) => ({
    name: `maintenance_poor_electrical_level_${i+1}`, type: "number", category: "maintenance_electrical_severity",
    label: `Level ${i+1}`, suffix: "+min/letter",
    description: "Extra minutes per letter added to electrical hookup", default: String(m),
  })),
  // Editable labels for the Electrical Severity slider
  ...["A Bit Harder","Mildly Annoying","Inconvenient","Real Pain","Frustrating","Seriously?","Nightmare Fuel","Who Designed This?","Total Disaster","What the Heck is Wrong With These People!?"].map((name, i) => ({
    name: `maintenance_poor_electrical_label_${i+1}`, type: "text", category: "maintenance_electrical_severity_labels",
    label: `Level ${i+1} Name`,
    description: `Display name for Poor Electrical Access severity level ${i+1}`, default: name,
  })),

  // Poor Site Access — 10 severity levels (additive minutes)
  ...[3, 6, 10, 15, 20, 28, 38, 50, 65, 90].map((m, i) => ({
    name: `maintenance_site_access_level_${i+1}`, type: "number", category: "maintenance_site_access_severity",
    label: `Level ${i+1}`, suffix: "+min/letter",
    description: "Extra minutes per letter for tight working space", default: String(m),
  })),
  ...["Mildly Cramped","Slightly Awkward","Squeeze Play","Tight Quarters","Obstacle Course","Where Does the Lift Go?","Sketchy Footing","Hold My Coffee","Mission Impossible","Did a Sign Even Belong Here?"].map((name, i) => ({
    name: `maintenance_site_access_label_${i+1}`, type: "text", category: "maintenance_site_access_severity_labels",
    label: `Level ${i+1} Name`,
    description: `Display name for Poor Site Access severity level ${i+1}`, default: name,
  })),
];

// Site Conditions sub-tab definitions
export const SITE_CONDITION_SUBTABS = [
  { key: "multipliers",  label: "Multipliers",                  category: "maintenance_site_conditions",        description: "Per-condition labor multipliers. 1.0 = no impact, 1.5 = 50% more time." },
  { key: "electrical",   label: "Electrical Severity",          category: "maintenance_electrical_severity",    labelsCategory: "maintenance_electrical_severity_labels", description: "10 severity levels for Poor Electrical Access. The selected level's minutes are ADDED to each letter's Electrical Hookup baseline. You can also rename each level." },
  { key: "site_access",  label: "Site Access Severity",         category: "maintenance_site_access_severity",   labelsCategory: "maintenance_site_access_severity_labels", description: "10 severity levels for Poor Site Access. The selected level's minutes are ADDED to each letter on top of the base time. You can also rename each level." },
  { key: "parapet_roof", label: "Parapet — Electrical on Roof", category: "maintenance_parapet_roof",           description: "Parapet job where electrical runs along the rooftop (typically easier). Additive minutes per letter and per raceway." },
  { key: "parapet_drop", label: "Parapet — Drops Inside",       category: "maintenance_parapet_drop",           description: "Parapet job where electrical drops down inside the parapet cavity (typically harder). Additive minutes per letter and per raceway." },
  { key: "thick_walls",  label: "Thick / Hollow Walls",         category: "maintenance_thick_walls",            description: "Additive minutes for brick veneer, masonry, or hollow-cavity walls — applied per letter and per raceway." },
];