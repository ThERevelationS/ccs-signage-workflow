// Logic for suggesting equipment based on project line items.
// Pure functions — no React, no entity calls.

// Equipment types that lift workers to a height (used to match install height)
const LIFT_TYPES = ["ladder", "scissor_lift", "boom_lift", "boom_truck", "scaffold"];
const BOOM_TYPES = ["boom_lift", "boom_truck"];

// Vehicles needed to transport crew & gear to the site
const VEHICLE_TYPES = ["truck", "van", "flatbed", "boom_truck"];

// Owned equipment never carries a delivery / pickup fee (it's your own gear).
export function isOwnedEquipment(invOrRow = {}) {
  if (invOrRow.ownership) return invOrRow.ownership === "owned";
  return invOrRow.pricing_mode === "owned_flat" || invOrRow.pricing_mode === "per_project_flat";
}

// Is this inventory record owned (vs rented)?
const invIsOwned = (e) =>
  e.ownership === "owned" || e.pricing_mode === "owned_flat" || e.pricing_mode === "per_project_flat";

const safetyMarginOf = (e) => {
  const m = parseFloat(e.vertical_reach_safety_margin_feet);
  return isNaN(m) ? 2 : m;
};

// Does this lift reach the install height (with its safety margin)?
const liftReaches = (e, height) =>
  (parseFloat(e.max_height_feet) || 0) >= height + safetyMarginOf(e);

/**
 * Pick exactly ONE lift for the job. Selection order:
 *  1. A boom flagged `is_primary_owned` (your go-to owned boom) — used whenever
 *     it can reach the install height. This is the "normal use" default.
 *  2. A boom flagged `is_default_for_height` whose configured range contains
 *     the install height.
 *  3. Otherwise the SMALLEST lift that reaches the height — but OWNED lifts are
 *     always preferred over rented ones when both can reach. Only fall back to
 *     a rented lift when no owned lift is tall enough (install height exceeds
 *     your owned reach).
 * Never returns more than one lift.
 */
function pickLift(active, maxHeight) {
  const lifts = active.filter((e) => LIFT_TYPES.includes(e.equipment_type));
  if (lifts.length === 0) return null;

  // 1) Primary owned boom — your marked go-to, used whenever it reaches.
  const primaryOwned = lifts.find(
    (e) => invIsOwned(e) && e.is_primary_owned && liftReaches(e, maxHeight)
  );
  if (primaryOwned) return primaryOwned;

  // 2) Default-by-height-range boom.
  const defaultByRange = lifts.find((e) => {
    if (!BOOM_TYPES.includes(e.equipment_type)) return false;
    if (!e.is_default_for_height) return false;
    const min = parseFloat(e.default_height_min_feet) || 0;
    const max = parseFloat(e.default_height_max_feet) || 0;
    if (max <= 0) return false;
    return maxHeight >= min && maxHeight <= max;
  });
  if (defaultByRange) return defaultByRange;

  const bySize = (a, b) => (parseFloat(a.max_height_feet) || 0) - (parseFloat(b.max_height_feet) || 0);

  // 3a) Smallest OWNED lift that reaches (owned always preferred).
  const ownedReaching = lifts.filter((e) => invIsOwned(e) && liftReaches(e, maxHeight)).sort(bySize);
  if (ownedReaching.length > 0) return ownedReaching[0];

  // 3b) Install height exceeds owned reach → smallest RENTED lift that reaches.
  const rentedReaching = lifts.filter((e) => !invIsOwned(e) && liftReaches(e, maxHeight)).sort(bySize);
  if (rentedReaching.length > 0) return rentedReaching[0];

  // 3c) Nothing clears the safety margin — pick the tallest lift that at least
  //     physically reaches, preferring owned.
  const anyReaching = lifts
    .filter((e) => (parseFloat(e.max_height_feet) || 0) >= maxHeight)
    .sort((a, b) => {
      const own = (invIsOwned(b) ? 1 : 0) - (invIsOwned(a) ? 1 : 0);
      if (own !== 0) return own;
      return bySize(b, a); // tallest first
    });
  return anyReaching[0] || null;
}

/**
 * Given a list of line items and the equipment inventory, suggest which
 * pieces of equipment should be selected. Returns inventory items.
 * Always returns at most ONE lift + (if needed) ONE transport vehicle.
 */
export function suggestEquipmentForProject(items = [], inventory = []) {
  if (!items.length || !inventory.length) return [];

  const maxHeight = items.reduce(
    (m, it) => Math.max(m, parseFloat(it.installation_height_feet) || 0),
    0
  );

  const active = inventory.filter((e) => e.is_active !== false);
  const suggestions = [];

  // Exactly one lift for the job.
  const lift = pickLift(active, maxHeight);
  if (lift) suggestions.push(lift);

  // Add a transport vehicle (prefer owned) — unless the lift IS a vehicle (boom truck).
  const haveVehicle = suggestions.some((s) => VEHICLE_TYPES.includes(s.equipment_type));
  if (!haveVehicle) {
    const vehicles = active
      .filter((e) => VEHICLE_TYPES.includes(e.equipment_type))
      .sort((a, b) => (invIsOwned(a) ? 0 : 1) - (invIsOwned(b) ? 0 : 1));
    if (vehicles.length > 0) suggestions.push(vehicles[0]);
  }

  return suggestions;
}

/**
 * Build a `selected_equipment` row from an inventory equipment record.
 * Default duration = ON-SITE clock time (labor hours ÷ crew size) mapped to the
 * pricing mode — a 3-person crew burns 24 labor-hours in 8 site hours, so the
 * lift is only rented for 1 day, not 3.
 * For booms, seeds `idle_running_cost_per_hour` and `idle_hours` (defaults to labor hours).
 */
export function selectedEquipmentFromInventory(inv, projectLaborHours = 0, crewSize = 1) {
  const laborHours = parseFloat(projectLaborHours) || 0;
  // Equipment is rented for ON-SITE (clock) time, not man-hours.
  const crew = Math.max(1, parseInt(crewSize) || 1);
  const clockHours = laborHours / crew;
  const clockDays = Math.max(1, Math.ceil(clockHours / 8));

  let duration = 1;
  let unitCost = 0;

  switch (inv.pricing_mode) {
    case "per_hour":
      duration = Math.max(1, Math.ceil(clockHours));
      unitCost = parseFloat(inv.cost_per_hour) || 0;
      break;
    case "per_day":
      duration = clockDays;
      unitCost = parseFloat(inv.cost_per_day) || 0;
      break;
    case "per_week":
      duration = Math.max(1, Math.ceil(clockDays / 5));
      unitCost = parseFloat(inv.cost_per_week) || 0;
      break;
    case "per_month":
      duration = 1;
      unitCost = parseFloat(inv.cost_per_month) || 0;
      break;
    case "owned_flat":
    case "per_project_flat":
      duration = 1;
      unitCost = parseFloat(inv.cost_flat) || 0;
      break;
    default:
      duration = 1;
      unitCost = 0;
  }

  // Idle-running fields apply to booms only
  const isBoom = BOOM_TYPES.includes(inv.equipment_type);
  const idleRate = isBoom ? (parseFloat(inv.idle_running_cost_per_hour) || 0) : 0;
  // Default idle to on-site clock hours rounded up — most installs run the boom continuously
  const idleHours = isBoom && idleRate > 0 ? Math.max(0, Math.ceil(clockHours)) : 0;

  // Owned equipment never has a delivery / pickup fee.
  const owned = isOwnedEquipment(inv);

  return {
    equipment_id: inv.id,
    equipment_name: inv.equipment_name,
    equipment_type: inv.equipment_type,
    pricing_mode: inv.pricing_mode,
    ownership: owned ? "owned" : (inv.ownership || "rented"),
    duration,
    include_delivery: false,
    delivery_pickup_cost: owned ? 0 : (parseFloat(inv.delivery_pickup_cost) || 0),
    unit_cost: unitCost,
    idle_running_cost_per_hour: idleRate,
    idle_hours: idleHours,
    idle_cost: idleRate * idleHours,
    total_cost: unitCost * duration + (idleRate * idleHours),
    notes: "",
  };
}

/**
 * Recalculate the total cost of a selected equipment row.
 */
export function recalcEquipmentRow(row) {
  const duration = parseFloat(row.duration) || 0;
  const unitCost = parseFloat(row.unit_cost) || 0;
  // Owned equipment never bills a delivery / pickup fee.
  const delivery = (!isOwnedEquipment(row) && row.include_delivery)
    ? parseFloat(row.delivery_pickup_cost) || 0
    : 0;
  const idleHours = parseFloat(row.idle_hours) || 0;
  const idleRate = parseFloat(row.idle_running_cost_per_hour) || 0;
  const idle_cost = idleHours * idleRate;
  return {
    ...row,
    idle_cost,
    total_cost: unitCost * duration + delivery + idle_cost,
  };
}

/**
 * Recalculate a personnel row's total cost.
 */
export function recalcPersonnelRow(row) {
  const rate = parseFloat(row.hourly_rate) || 0;
  const hours = parseFloat(row.hours) || 0;
  return { ...row, total_cost: rate * hours };
}

/**
 * Display label for a pricing mode's duration unit.
 */
export function durationUnitLabel(pricing_mode) {
  switch (pricing_mode) {
    case "per_hour": return "hours";
    case "per_day": return "days";
    case "per_week": return "weeks";
    case "per_month": return "months";
    case "owned_flat":
    case "per_project_flat":
      return "flat";
    default: return "units";
  }
}

/**
 * Suggested crew size for a project:
 *   - 3 people when max install height >= 40 ft OR 30+ total letters
 *   - otherwise 2 (Crew Lead + Installer)
 * Shared by the personnel suggester AND the equipment duration math so
 * on-site time assumptions stay consistent.
 */
export function suggestCrewSize(items = []) {
  const maxHeight = items.reduce(
    (m, it) => Math.max(m, parseFloat(it.installation_height_feet) || 0),
    0
  );
  const totalLetters = items.reduce(
    (s, it) => s + (parseFloat(it.qty_letters) || 0),
    0
  );
  return (maxHeight >= 40 || totalLetters >= 30) ? 3 : 2;
}

/**
 * Suggest an appropriate crew (Crew Lead / Installer / Helper) for a project.
 * Crew size comes from suggestCrewSize(); total crew hours = project labor
 * hours, divided evenly per person.
 */
export function suggestPersonnelForProject(items = [], projectLaborHours = 0, rateForRole = () => 0) {
  const crewSize = suggestCrewSize(items);

  const perPersonHours = projectLaborHours && crewSize > 0
    ? +(projectLaborHours / crewSize).toFixed(2)
    : 0;

  const roles = ["Crew Lead", "Installer", "Helper"];
  return Array.from({ length: crewSize }, (_, i) => {
    const role = roles[i] || "Installer";
    return recalcPersonnelRow({
      name: "",
      role,
      hourly_rate: rateForRole(role),
      hours: perPersonHours,
      total_cost: 0,
    });
  });
}