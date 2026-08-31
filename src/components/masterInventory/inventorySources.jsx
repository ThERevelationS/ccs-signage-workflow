// Master Inventory: declarative configuration of every inventory source in the app.
//
// IMPORTANT: tabs here are categorized by WHAT THE ITEMS ARE, not by which
// estimator they belong to. Cross-estimator visibility is controlled per-item
// using show_in_channel_letters / show_in_foundation / show_in_sign_maintenance
// (or the legacy show_in_install_materials / show_in_maintenance_materials etc).
//
// Two tabs are "custom" and rendered by dedicated components (not via this
// schema) because they merge multiple underlying entities:
//   - rental_equipment / owned_equipment  → <MasterEquipmentTab />
//   - supplies                            → <MasterSuppliesTab />
//
// The remaining declarative sources render with the generic InventoryTable +
// InventoryFormModal.
//
// Sheet metals (aluminum sheet, steel sheet, stainless sheet, galvanized
// sheet) belong in SUBSTRATES — not in Sign Parts | Supplies.

import {
  DimensionalLetterMaterial,
  SignLightingInventory,
  SignHardwareInventory,
  LaborServiceInventory,
  SignPartsSuppliesInventory,
} from "@/entities/all";

import {
  Package,
  Truck,
  Type,
  Wrench,
  Droplets,
  Lightbulb,
  Hammer,
  Briefcase,
  Anchor,
  Building2,
} from "lucide-react";

export const INVENTORY_SOURCES = [
  {
    key: "equipment",
    label: "Equipment",
    icon: Truck,
    color: "text-cyan-700",
    bgColor: "bg-cyan-100 text-cyan-800",
    custom: "equipment",
  },
  {
    key: "substrates",
    label: "Substrates",
    icon: Type,
    color: "text-pink-600",
    bgColor: "bg-pink-100 text-pink-700",
    entity: DimensionalLetterMaterial,
    nameField: "material_name",
    fields: [
      { name: "material_name", label: "Name", type: "text", required: true, table: true },
      {
        name: "material_type",
        label: "Type",
        type: "select",
        options: [
          "acrylic", "pvc", "aluminum_composite", "aluminum_solid",
          "aluminum_sheet", "steel_sheet", "stainless_sheet", "galvanized_sheet",
          "polycarbonate", "styrene", "coroplast", "gatorboard",
          "wood", "mdf", "hdu", "foam", "other",
        ],
        table: true,
      },
      { name: "thickness_inches", label: "Thick.", type: "number", table: true },
      { name: "sheet_length_inches", label: "Sheet Length (in)", type: "number" },
      { name: "sheet_width_inches", label: "Sheet Width (in)", type: "number" },
      { name: "cost_per_sheet", label: "$/Sheet", type: "number", table: true },
      { name: "color", label: "Color", type: "text" },
      { name: "supplier", label: "Supplier", type: "text", table: true },
      { name: "show_in_dimensional_letters", label: "Dim. Letters",  type: "boolean", table: true },
      { name: "show_in_lobby_sign_backer",   label: "Lobby Backer",  type: "boolean", table: true },
      { name: "show_in_vinyl_replacement",   label: "Vinyl Repl.",   type: "boolean", table: true },
      { name: "show_in_replace_returns",     label: "Repl. Returns", type: "boolean", table: true },
      { name: "show_in_replace_face",        label: "Repl. Face",    type: "boolean", table: true },
      { name: "is_active", label: "Active", type: "boolean" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "supplies",
    label: "Installation & Maintenance Supplies",
    icon: Wrench,
    color: "text-purple-600",
    bgColor: "bg-purple-100 text-purple-700",
    custom: "supplies",
  },
  {
    key: "vinyl",
    label: "Vinyl",
    icon: Droplets,
    color: "text-blue-600",
    bgColor: "bg-blue-100 text-blue-700",
    custom: "vinyl",
  },
  {
    key: "sign_lighting",
    label: "Sign Lighting",
    icon: Lightbulb,
    color: "text-yellow-600",
    bgColor: "bg-yellow-100 text-yellow-700",
    entity: SignLightingInventory,
    nameField: "item_name",
    fields: [
      { name: "item_name", label: "Name", type: "text", required: true, table: true },
      {
        name: "lighting_type",
        label: "Type",
        type: "select",
        options: ["led_module", "led_strip", "led_neon", "power_supply", "led_driver", "transformer", "ballast", "fluorescent_tube", "neon_tube", "photocell", "timer", "wire", "connector", "other"],
        table: true,
      },
      { name: "manufacturer", label: "Manufacturer", type: "text", table: true },
      { name: "model_number", label: "Model #", type: "text" },
      { name: "color_temperature_k", label: "Color Temp (K)", type: "number" },
      { name: "color_name", label: "Color", type: "text", table: true },
      { name: "voltage", label: "Voltage", type: "text", table: true },
      { name: "wattage", label: "Watts", type: "number", table: true },
      { name: "max_load_watts", label: "Max Load (W)", type: "number" },
      { name: "modules_per_run", label: "Modules/Run", type: "number" },
      { name: "length_feet", label: "Length (ft)", type: "number" },
      {
        name: "pricing_mode",
        label: "Pricing",
        type: "select",
        options: ["per_piece", "per_foot", "per_roll", "per_box"],
        table: true,
      },
      { name: "cost_per_unit", label: "Cost", type: "number", required: true, table: true },
      { name: "units_per_box", label: "Units/Box", type: "number" },
      { name: "supplier", label: "Supplier", type: "text", table: true },
      { name: "supplier_sku", label: "SKU", type: "text" },
      { name: "show_in_channel_letters", label: "Ch. Letters", type: "boolean", table: true },
      { name: "show_in_sign_maintenance", label: "Maint.", type: "boolean", table: true },
      { name: "is_active", label: "Active", type: "boolean" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "sign_hardware",
    label: "Hardware",
    icon: Hammer,
    color: "text-slate-700",
    bgColor: "bg-slate-100 text-slate-800",
    entity: SignHardwareInventory,
    nameField: "item_name",
    fields: [
      { name: "item_name", label: "Name", type: "text", required: true, table: true },
      {
        name: "hardware_type",
        label: "Type",
        type: "select",
        options: ["standoff", "screw", "bolt", "nut", "washer", "anchor", "wedge_anchor", "drop_in_anchor", "toggle_bolt", "lag_screw", "threaded_rod", "bracket", "clip", "z_clip", "french_cleat", "hanger", "spacer", "rivet", "stud", "other"],
        table: true,
      },
      {
        name: "material",
        label: "Material",
        type: "select",
        options: ["stainless_steel", "aluminum", "steel_zinc", "steel_galvanized", "brass", "nylon", "other"],
        table: true,
      },
      {
        name: "finish",
        label: "Finish",
        type: "select",
        options: ["polished", "brushed", "satin", "anodized", "powder_coated", "zinc", "galvanized", "raw", "other"],
      },
      { name: "size", label: "Size", type: "text", table: true },
      { name: "thread_size", label: "Thread", type: "text" },
      { name: "length_inches", label: "Length (in)", type: "number" },
      { name: "diameter_inches", label: "Diam. (in)", type: "number" },
      { name: "load_rating_lbs", label: "Load (lbs)", type: "number" },
      {
        name: "pricing_mode",
        label: "Pricing",
        type: "select",
        options: ["per_piece", "per_box", "per_pack"],
        table: true,
      },
      { name: "cost_per_unit", label: "Cost", type: "number", required: true, table: true },
      { name: "units_per_box", label: "Units/Box", type: "number" },
      { name: "supplier", label: "Supplier", type: "text", table: true },
      { name: "supplier_sku", label: "SKU", type: "text" },
      { name: "show_in_channel_letters", label: "Ch. Letters", type: "boolean", table: true },
      { name: "show_in_sign_maintenance", label: "Maint.", type: "boolean", table: true },
      { name: "show_in_foundation", label: "Found.", type: "boolean", table: true },
      { name: "is_active", label: "Active", type: "boolean" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "labor_services",
    label: "Labor & Services",
    icon: Briefcase,
    color: "text-emerald-700",
    bgColor: "bg-emerald-100 text-emerald-800",
    entity: LaborServiceInventory,
    nameField: "service_name",
    fields: [
      { name: "service_name", label: "Name", type: "text", required: true, table: true },
      {
        name: "service_category",
        label: "Category",
        type: "select",
        options: ["permitting", "engineering", "design_art", "delivery_freight", "subcontractor_labor", "electrical_hookup", "crane_lift_service", "rental_service", "inspection", "consulting", "shop_labor", "field_labor", "concrete_service", "other"],
        table: true,
      },
      {
        name: "pricing_mode",
        label: "Pricing",
        type: "select",
        options: ["per_hour", "per_day", "per_week", "per_month", "per_job", "per_unit", "per_sqft", "per_mile", "per_cy", "per_lb", "per_pallet", "flat"],
        table: true,
      },
      { name: "default_rate", label: "Rate", type: "number", required: true, table: true },
      { name: "minimum_charge", label: "Min Charge", type: "number" },
      { name: "typical_duration_hours", label: "Typ. Hrs", type: "number", showIfNotCategory: "concrete_service" },
      { name: "vendor_name", label: "Vendor", type: "text", table: true },
      { name: "vendor_contact", label: "Contact", type: "text" },
      { name: "vendor_phone", label: "Phone", type: "text" },
      { name: "description", label: "Description", type: "text" },

      // Category-specific fields are injected automatically by InventoryFormModal
      // using LABOR_SERVICE_CATEGORY_FIELDS in laborServiceCategorySchema.js.
      // See that file to edit per-category fields.

      { name: "show_in_channel_letters", label: "Ch. Letters", type: "boolean", table: true },
      { name: "show_in_sign_maintenance", label: "Maint.", type: "boolean", table: true },
      { name: "show_in_foundation", label: "Found.", type: "boolean", table: true },
      { name: "show_in_vinyl_estimator", label: "Vinyl", type: "boolean", table: true },
      { name: "is_active", label: "Active", type: "boolean" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "sign_parts_supplies",
    label: "Sign Parts | Supplies",
    icon: Package,
    color: "text-orange-600",
    bgColor: "bg-orange-100 text-orange-700",
    entity: SignPartsSuppliesInventory,
    nameField: "item_name",
    fields: [
      { name: "item_name", label: "Name", type: "text", required: true, table: true },
      {
        name: "category",
        label: "Category",
        type: "select",
        options: ["trim_cap", "returns", "retainer", "j_bar", "raceway_cover", "edge_trim", "paint_ink", "primer", "adhesive_sealant", "tape", "abrasive_blade", "cleaner_solvent", "ppe_safety", "shop_consumable", "other"],
        table: true,
      },
      { name: "color", label: "Color", type: "text", table: true },
      { name: "size", label: "Size", type: "text", table: true },
      {
        name: "pricing_mode",
        label: "Pricing",
        type: "select",
        options: ["per_piece", "per_foot", "per_roll", "per_box", "per_gallon", "per_quart", "per_pound", "per_sqft"],
        table: true,
      },
      { name: "cost_per_unit", label: "Cost", type: "number", required: true, table: true },
      { name: "units_per_box", label: "Units/Box", type: "number" },
      { name: "supplier", label: "Supplier", type: "text", table: true },
      { name: "supplier_sku", label: "SKU", type: "text" },
      { name: "show_in_channel_letters", label: "Ch. Letters", type: "boolean", table: true },
      { name: "show_in_sign_maintenance", label: "Maint.", type: "boolean", table: true },
      { name: "show_in_vinyl_estimator", label: "Vinyl", type: "boolean", table: true },
      { name: "show_in_foundation", label: "Found.", type: "boolean", table: true },
      { name: "is_active", label: "Active", type: "boolean" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  // Extruded Metals & Poles — replaces the old "Metal (Legacy)" tab. Combines
  // raw extruded metal stock (angle/channel/tube/etc. from the Inventory entity)
  // with sign poles (FoundationInventory rows where material_type='pole').
  {
    key: "extruded_metals_poles",
    label: "Extruded Metals & Poles",
    icon: Package,
    color: "text-slate-700",
    bgColor: "bg-slate-100 text-slate-800",
    custom: "extruded_metals_poles",
  },
  // Concrete & Stone — replaces the standalone Foundation Inventory page.
  // Wraps wall materials, wall fill, wall caps, bagged concrete, rebar, and
  // forming material under one tab.
  {
    key: "concrete_stone",
    label: "Concrete & Stone",
    icon: Building2,
    color: "text-amber-700",
    bgColor: "bg-amber-100 text-amber-800",
    custom: "concrete_stone",
  },
];

export const SOURCE_BY_KEY = Object.fromEntries(
  INVENTORY_SOURCES.map((s) => [s.key, s])
);