// Per-category field schemas for Labor & Services.
//
// Each Labor & Services row has a `service_category`. Many of those categories
// need their own pricing / spec fields beyond the generic (rate, vendor, etc).
// This file declares those fields per category. The form modal reads
// `showIfCategory` on each common field, but for category-specific fields we
// also expose them here so we can render them grouped under a labelled section.
//
// All fields here are OPTIONAL and only render when the row's category matches.

export const LABOR_SERVICE_CATEGORY_FIELDS = {
  permitting: {
    label: "Permitting Details",
    fields: [
      { name: "permit_jurisdiction",       label: "Jurisdiction / Authority",     type: "text" },
      { name: "permit_type",               label: "Permit Type",                   type: "select",
        options: ["zoning", "building", "sign", "electrical", "encroachment", "variance", "demolition", "other"] },
      { name: "permit_application_fee",    label: "Application Fee ($)",           type: "number" },
      { name: "permit_review_fee",         label: "Plan Review Fee ($)",           type: "number" },
      { name: "permit_inspection_fee",     label: "Inspection Fee ($)",            type: "number" },
      { name: "permit_expediting_fee",     label: "Expediting / Rush Fee ($)",     type: "number" },
      { name: "permit_estimated_days",     label: "Typical Turnaround (days)",     type: "number" },
      { name: "permit_requires_drawings",  label: "Requires Sealed Drawings",      type: "boolean" },
      { name: "permit_renewal_period_months", label: "Renewal Period (months)",    type: "number" },
    ],
  },

  engineering: {
    label: "Engineering Stamp Details",
    fields: [
      { name: "engineer_license_states",   label: "Licensed States (comma-sep)",   type: "text" },
      { name: "engineer_specialty",        label: "Specialty",                     type: "select",
        options: ["structural", "civil", "electrical", "geotechnical", "wind_load", "seismic", "other"] },
      { name: "engineer_stamp_fee",        label: "Stamp Fee per Sheet ($)",       type: "number" },
      { name: "engineer_calc_package_fee", label: "Calc Package Fee ($)",          type: "number" },
      { name: "engineer_revision_fee",     label: "Revision Fee ($)",              type: "number" },
      { name: "engineer_typical_turnaround_days", label: "Turnaround (days)",      type: "number" },
      { name: "engineer_rush_multiplier",  label: "Rush Multiplier (×)",           type: "number" },
    ],
  },

  design_art: {
    label: "Design / Art Details",
    fields: [
      { name: "design_type",               label: "Design Type",                   type: "select",
        options: ["logo", "layout", "rendering_2d", "rendering_3d", "elevation", "site_plan", "vector_redraw", "color_match", "other"] },
      { name: "design_rate_per_hour",      label: "Rate per Hour ($)",             type: "number" },
      { name: "design_rate_per_revision",  label: "Rate per Revision ($)",         type: "number" },
      { name: "design_included_revisions", label: "Included Revisions",            type: "number" },
      { name: "design_flat_rate",          label: "Flat Project Rate ($)",         type: "number" },
      { name: "design_deliverable_format", label: "Deliverable Format",            type: "select",
        options: ["ai_eps_pdf", "ai_only", "pdf_only", "jpg_png", "dwg_dxf", "psd", "other"] },
      { name: "design_typical_hours",      label: "Typical Hours per Job",         type: "number" },
    ],
  },

  delivery_freight: {
    label: "Delivery / Freight Details",
    fields: [
      { name: "freight_mode",              label: "Freight Mode",                  type: "select",
        options: ["ltl_truck", "ftl_truck", "white_glove", "courier", "parcel", "flatbed", "own_truck", "other"] },
      { name: "freight_base_charge",       label: "Base Charge ($)",               type: "number" },
      { name: "freight_per_mile",          label: "Rate per Mile ($)",             type: "number" },
      { name: "freight_per_lb",            label: "Rate per Lb ($)",               type: "number" },
      { name: "freight_per_pallet",        label: "Rate per Pallet ($)",           type: "number" },
      { name: "freight_fuel_surcharge_pct", label: "Fuel Surcharge (%)",           type: "number" },
      { name: "freight_lift_gate_fee",     label: "Lift Gate Fee ($)",             type: "number" },
      { name: "freight_residential_fee",   label: "Residential Delivery Fee ($)",  type: "number" },
      { name: "freight_inside_delivery_fee", label: "Inside Delivery Fee ($)",     type: "number" },
      { name: "freight_max_weight_lbs",    label: "Max Weight (lbs)",              type: "number" },
      { name: "freight_max_length_ft",     label: "Max Length (ft)",               type: "number" },
    ],
  },

  subcontractor_labor: {
    label: "Subcontractor Crew Details",
    fields: [
      { name: "sub_trade",                 label: "Trade",                         type: "select",
        options: ["installer", "electrician", "welder", "painter", "mason", "carpenter", "concrete", "vinyl_installer", "general", "other"] },
      { name: "sub_crew_size",             label: "Default Crew Size",             type: "number" },
      { name: "sub_rate_per_hour",         label: "Crew Rate per Hour ($)",        type: "number" },
      { name: "sub_rate_per_day",          label: "Crew Rate per Day ($)",         type: "number" },
      { name: "sub_overtime_multiplier",   label: "Overtime Multiplier (×)",       type: "number" },
      { name: "sub_weekend_multiplier",    label: "Weekend Multiplier (×)",        type: "number" },
      { name: "sub_min_callout_hours",     label: "Minimum Call-Out (hrs)",        type: "number" },
      { name: "sub_travel_rate_per_hour",  label: "Travel Rate per Hour ($)",      type: "number" },
      { name: "sub_per_diem",              label: "Per Diem ($/day)",              type: "number" },
      { name: "sub_insured",               label: "Insured / Bonded",              type: "boolean" },
    ],
  },

  electrical_hookup: {
    label: "Electrical Hookup Details",
    fields: [
      { name: "elec_service_type",         label: "Service Type",                  type: "select",
        options: ["120v_single_phase", "240v_single_phase", "208v_three_phase", "480v_three_phase", "low_voltage", "other"] },
      { name: "elec_amp_rating",           label: "Amp Rating",                    type: "number" },
      { name: "elec_base_charge",          label: "Base Charge ($)",               type: "number" },
      { name: "elec_rate_per_hour",        label: "Electrician Rate ($/hr)",       type: "number" },
      { name: "elec_per_circuit_fee",      label: "Per Circuit Fee ($)",           type: "number" },
      { name: "elec_per_disconnect_fee",   label: "Per Disconnect Fee ($)",        type: "number" },
      { name: "elec_includes_inspection",  label: "Includes Inspection",           type: "boolean" },
      { name: "elec_includes_permit",      label: "Includes Permit Pull",          type: "boolean" },
      { name: "elec_typical_hours",        label: "Typical Hours per Hookup",      type: "number" },
    ],
  },

  crane_lift_service: {
    label: "Crane / Lift Service Details",
    fields: [
      { name: "crane_equipment_type",      label: "Equipment Type",                type: "select",
        options: ["boom_truck", "crane", "scissor_lift", "boom_lift", "telehandler", "forklift", "spider_lift", "other"] },
      { name: "crane_capacity_tons",       label: "Capacity (tons)",               type: "number" },
      { name: "crane_max_reach_feet",      label: "Max Reach (ft)",                type: "number" },
      { name: "crane_max_height_feet",     label: "Max Height (ft)",               type: "number" },
      { name: "crane_min_billable_hours",  label: "Minimum Billable (hrs)",        type: "number" },
      { name: "crane_rate_per_hour",       label: "Rate per Hour ($)",             type: "number" },
      { name: "crane_rate_per_day",        label: "Rate per Day ($)",              type: "number" },
      { name: "crane_mobilization_fee",    label: "Mobilization Fee ($)",          type: "number" },
      { name: "crane_demobilization_fee",  label: "Demobilization Fee ($)",        type: "number" },
      { name: "crane_operator_included",   label: "Operator Included",             type: "boolean" },
      { name: "crane_operator_rate_per_hour", label: "Operator Rate ($/hr)",       type: "number" },
      { name: "crane_signal_person_fee",   label: "Signal Person Fee ($/hr)",      type: "number" },
      { name: "crane_overtime_multiplier", label: "Overtime Multiplier (×)",       type: "number" },
    ],
  },

  rental_service: {
    label: "Rental Service Details",
    fields: [
      { name: "rental_equipment_type",     label: "Equipment Type",                type: "text" },
      { name: "rental_rate_per_hour",      label: "Rate per Hour ($)",             type: "number" },
      { name: "rental_rate_per_day",       label: "Rate per Day ($)",              type: "number" },
      { name: "rental_rate_per_week",      label: "Rate per Week ($)",             type: "number" },
      { name: "rental_rate_per_month",     label: "Rate per Month ($)",            type: "number" },
      { name: "rental_delivery_fee",       label: "Delivery Fee ($)",              type: "number" },
      { name: "rental_pickup_fee",         label: "Pickup Fee ($)",                type: "number" },
      { name: "rental_damage_waiver_pct",  label: "Damage Waiver (%)",             type: "number" },
      { name: "rental_fuel_charge_per_day", label: "Fuel Charge per Day ($)",      type: "number" },
      { name: "rental_cleaning_fee",       label: "Cleaning Fee ($)",              type: "number" },
      { name: "rental_minimum_period",     label: "Minimum Rental Period",         type: "select",
        options: ["hour", "half_day", "day", "week", "month"] },
    ],
  },

  inspection: {
    label: "Inspection Details",
    fields: [
      { name: "inspection_type",           label: "Inspection Type",               type: "select",
        options: ["sign_final", "electrical", "footing", "structural", "code_compliance", "fire_marshal", "third_party", "other"] },
      { name: "inspection_base_fee",       label: "Base Fee ($)",                  type: "number" },
      { name: "inspection_re_inspection_fee", label: "Re-Inspection Fee ($)",      type: "number" },
      { name: "inspection_travel_fee",     label: "Travel Fee ($)",                type: "number" },
      { name: "inspection_report_fee",     label: "Report / Documentation Fee ($)", type: "number" },
      { name: "inspection_typical_days",   label: "Lead Time (days)",              type: "number" },
    ],
  },

  consulting: {
    label: "Consulting Details",
    fields: [
      { name: "consult_specialty",         label: "Specialty",                     type: "select",
        options: ["code", "permitting", "engineering", "estimating", "project_mgmt", "design_review", "wind_load", "lighting", "other"] },
      { name: "consult_rate_per_hour",     label: "Rate per Hour ($)",             type: "number" },
      { name: "consult_rate_per_day",      label: "Rate per Day ($)",              type: "number" },
      { name: "consult_minimum_charge",    label: "Minimum Charge ($)",            type: "number" },
      { name: "consult_retainer",          label: "Retainer ($)",                  type: "number" },
      { name: "consult_phone_rate_per_15min", label: "Phone Rate per 15 min ($)",  type: "number" },
    ],
  },

  shop_labor: {
    label: "Shop Labor Details",
    fields: [
      { name: "shop_role",                 label: "Role",                          type: "select",
        options: ["fabricator", "welder", "painter", "finisher", "assembler", "graphics_op", "cnc_op", "laser_op", "general", "other"] },
      { name: "shop_skill_level",          label: "Skill Level",                   type: "select",
        options: ["apprentice", "journeyman", "senior", "lead", "supervisor"] },
      { name: "shop_rate_per_hour",        label: "Burdened Rate ($/hr)",          type: "number" },
      { name: "shop_overtime_multiplier",  label: "Overtime Multiplier (×)",       type: "number" },
      { name: "shop_doubletime_multiplier", label: "Doubletime Multiplier (×)",    type: "number" },
      { name: "shop_efficiency_factor",    label: "Efficiency Factor (0–1)",       type: "number" },
    ],
  },

  field_labor: {
    label: "Field Labor Details",
    fields: [
      { name: "field_role",                label: "Role",                          type: "select",
        options: ["installer", "lead_installer", "helper", "service_tech", "electrician_apprentice", "driver", "other"] },
      { name: "field_skill_level",         label: "Skill Level",                   type: "select",
        options: ["apprentice", "journeyman", "senior", "lead", "supervisor"] },
      { name: "field_rate_per_hour",       label: "Burdened Rate ($/hr)",          type: "number" },
      { name: "field_travel_rate_per_hour", label: "Travel Rate ($/hr)",           type: "number" },
      { name: "field_per_diem",            label: "Per Diem ($/day)",              type: "number" },
      { name: "field_overtime_multiplier", label: "Overtime Multiplier (×)",       type: "number" },
      { name: "field_min_callout_hours",   label: "Minimum Call-Out (hrs)",        type: "number" },
      { name: "field_truck_charge_per_day", label: "Truck Charge per Day ($)",     type: "number" },
    ],
  },

  concrete_service: {
    label: "Concrete Supplier Pricing",
    fields: [
      { name: "minimum_order_yards",            label: "Min Order (CY)",         type: "number" },
      { name: "below_minimum_cost_per_cy",      label: "Below-Min $/CY",         type: "number" },
      { name: "mix_3500_price",                 label: "Mix 3500 AE ($/CY)",     type: "number" },
      { name: "mix_4000_price",                 label: "Mix 4000 AE ($/CY)",     type: "number" },
      { name: "mix_4500_price",                 label: "Mix 4500 AE ($/CY)",     type: "number" },
      { name: "mix_5000_price",                 label: "Mix 5000 AE ($/CY)",     type: "number" },
      { name: "mix_fast_set_price",             label: "Mix Fast Set ($/CY)",    type: "number" },
      { name: "admix_calcium_chloride_price",   label: "Admix: Calcium Chl.",    type: "number" },
      { name: "admix_set_retarding_price",      label: "Admix: Set Retarding",   type: "number" },
      { name: "admix_water_reducing_price",     label: "Admix: Water Reducing",  type: "number" },
      { name: "admix_fibers_price",             label: "Admix: Fibers",          type: "number" },
      { name: "admix_winter_service_price",     label: "Admix: Winter Service",  type: "number" },
      { name: "small_load_fee_1_1_75",          label: "Small Load 1–1.75 CY",   type: "number" },
      { name: "small_load_fee_2_2_75",          label: "Small Load 2–2.75 CY",   type: "number" },
      { name: "small_load_fee_3_3_75",          label: "Small Load 3–3.75 CY",   type: "number" },
      { name: "small_load_fee_4_4_25",          label: "Small Load 4–4.25 CY",   type: "number" },
      { name: "small_load_fee_4_5_4_75",        label: "Small Load 4.5–4.75 CY", type: "number" },
      { name: "fuel_surcharge",                 label: "Fuel Surcharge ($)",     type: "number" },
    ],
  },

  other: {
    label: "Other / Custom",
    fields: [
      { name: "other_unit_of_measure",     label: "Unit of Measure",               type: "text" },
      { name: "other_typical_quantity",    label: "Typical Quantity",              type: "number" },
    ],
  },
};

// Flat list of every category-specific field name — used when building the
// entity payload so we know which keys are "owned" by the category schema.
export const LABOR_SERVICE_CATEGORY_FIELD_NAMES = Array.from(
  new Set(
    Object.values(LABOR_SERVICE_CATEGORY_FIELDS).flatMap((c) =>
      c.fields.map((f) => f.name)
    )
  )
);