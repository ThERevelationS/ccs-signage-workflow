// Pure calculation helpers for Sign Maintenance estimates.
// Mirrors components/channelLetterInstall/installCalculator structurally but
// is driven by the MaintenanceActionRate matrix (sign_type × action × size).

import { sizeAxisFor } from "./constants";
import { computeMonumentRepaint, isMonumentRepaint } from "./repaintCalculator";

const MIN_TO_HR = 1 / 60;

// Map a size id to the MaintenanceActionRate field that stores its minutes.
const SIZE_TO_FIELD = {
  extra_small: "base_minutes_xs",
  small: "base_minutes_s",
  medium: "base_minutes_m",
  large: "base_minutes_l",
  extra_large: "base_minutes_xl",
  extra_extra_large: "base_minutes_xxl",
  cab_small: "base_minutes_cab_s",
  cab_medium: "base_minutes_cab_m",
  cab_large: "base_minutes_cab_l",
  cab_extra_large: "base_minutes_cab_xl",
};

export const emptyServiceItem = () => ({
  description: "",
  sign_type: "flush_channel",
  size: "medium",
  qty: 10,
  installation_height_feet: 12,
  actions: [],   // array of action ids
  materials: [], // array of {inventory_item_id, item_name, quantity, unit_cost, total_cost}
});

// Look up the MaintenanceActionRate row for (sign_type, action) and return base minutes for the chosen size.
const minutesForActionOnSize = (rates, signType, action, size) => {
  const rate = (rates || []).find(r => r.sign_type === signType && r.action === action);
  if (!rate) return 0;
  // Honor the per-sign-type enable toggle. Disabled rate rows contribute 0 minutes.
  if (rate.is_enabled === false) return 0;
  const field = SIZE_TO_FIELD[size];
  if (!field) return parseFloat(rate.base_minutes_flat) || 0;
  return parseFloat(rate[field]) || 0;
};

// Calc one service item: total labor hours + cost for ALL actions performed on it.
export const calcServiceItem = (item, settings, rates, inventory) => {
  const techRate = parseFloat(settings.maintenance_tech_rate) || 65;
  const axis = sizeAxisFor(item.sign_type);
  const qty = parseFloat(item.qty) || 0;

  let totalMinutes = 0;
  (item.actions || []).forEach(actionId => {
    // Monument repaint has its own specialized estimator — skip the rate-matrix
    // contribution for that single action, we add it below.
    if (actionId === "repaint" && isMonumentRepaint(item)) return;
    const perUnit = minutesForActionOnSize(rates, item.sign_type, actionId, item.size);
    // For cabinet axis, qty acts as # cabinets; for letter axis, qty acts as # letters.
    totalMinutes += perUnit * (axis === "cabinet" ? Math.max(qty, 1) : qty);
  });

  let laborHours = totalMinutes * MIN_TO_HR;

  // Specialized contribution: Monument Sign repaint
  let repaintPaintCost = 0;
  const repaint = computeMonumentRepaint(item, settings);
  if (repaint) {
    laborHours += repaint.labor_hours;
    repaintPaintCost = repaint.paint_material_cost;
  }

  const laborCost = laborHours * techRate;

  // Recompute materials based on current item state.
  const materials = (item.materials || []).map(m => {
    const inv = (inventory || []).find(i => i.id === m.inventory_item_id);
    if (!inv) return { ...m, total_cost: (parseFloat(m.unit_cost) || 0) * (parseFloat(m.quantity) || 0) };
    return materialFromInventory(inv, item);
  });
  const materialsCost = materials.reduce((s, m) => s + (parseFloat(m.total_cost) || 0), 0) + repaintPaintCost;

  return {
    ...item,
    materials,
    labor_hours: laborHours,
    labor_cost: laborCost,
    materials_cost: materialsCost,
    repaint_calc: repaint || undefined,
    item_total_cost: laborCost + materialsCost,
  };
};

export const materialFromInventory = (inv, item) => {
  const m = {
    inventory_item_id: inv.id,
    item_name: inv.item_name,
    pricing_mode: inv.pricing_mode,
    unit_cost: 0, quantity: 0, total_cost: 0,
  };
  const sizeKey = `cost_${item.size}`;
  if (inv.pricing_mode === "per_letter_flat") {
    m.unit_cost = parseFloat(inv.cost_per_letter) || 0;
    m.quantity = parseFloat(item.qty) || 0;
  } else if (inv.pricing_mode === "per_letter_by_size" || inv.pricing_mode === "per_cabinet_by_size") {
    m.unit_cost = parseFloat(inv[sizeKey]) || 0;
    m.quantity = parseFloat(item.qty) || 0;
  } else if (inv.pricing_mode === "per_cabinet_flat") {
    m.unit_cost = parseFloat(inv.cost_per_cabinet) || 0;
    m.quantity = parseFloat(item.qty) || 0;
  } else if (inv.pricing_mode === "per_linear_foot") {
    m.unit_cost = parseFloat(inv.cost_per_foot) || 0;
    m.quantity = parseFloat(item.linear_feet) || 0;
  } else if (inv.pricing_mode === "per_sqft") {
    m.unit_cost = parseFloat(inv.cost_per_sqft) || 0;
    m.quantity = parseFloat(item.face_sqft) || 0;
  } else if (inv.pricing_mode === "per_project_flat") {
    m.unit_cost = parseFloat(inv.cost_flat) || 0;
    m.quantity = 1;
  }
  m.total_cost = m.unit_cost * m.quantity;
  return m;
};

// Pull default materials for a service item based on multi-axis tagging.
export const defaultMaterialsForItem = (item, inventory) => {
  return (inventory || [])
    .filter(inv => {
      if (!inv.is_default) return false;
      const types = inv.applies_to_item_types || [];
      const sizes = inv.applies_to_sizes || [];
      const actions = inv.applies_to_actions || [];
      if (types.length > 0 && !types.includes(item.sign_type)) return false;
      if (sizes.length > 0 && !sizes.includes(item.size)) return false;
      if (actions.length > 0) {
        const itemActions = item.actions || [];
        // Only attach if at least one of this material's actions is being performed.
        if (!actions.some(a => itemActions.includes(a))) return false;
      }
      return true;
    })
    .map(inv => materialFromInventory(inv, item));
};

// Project rollup
export const calcProjectTotals = (project) => {
  const items = project.items || [];
  const total_materials_cost = items.reduce((s, it) => s + (parseFloat(it.materials_cost) || 0), 0);
  const labor_cost = items.reduce((s, it) => s + (parseFloat(it.labor_cost) || 0), 0);
  const labor_hours = items.reduce((s, it) => s + (parseFloat(it.labor_hours) || 0), 0);

  const total_equipment_cost = (project.selected_equipment || []).reduce((s, e) => s + (parseFloat(e.total_cost) || 0), 0);
  const total_personnel_cost = (project.personnel || []).reduce((s, p) => s + (parseFloat(p.total_cost) || 0), 0);

  const pct = parseFloat(project.supplies_percent_of_materials);
  const suppliesPct = isNaN(pct) ? 10 : pct;
  const extra = parseFloat(project.extra_supplies_cost) || 0;
  const total_supplies_cost = total_materials_cost * (suppliesPct / 100) + extra;

  const total_travel_cost = parseFloat(project.total_travel_cost) || 0;

  const subtotal = labor_cost + total_materials_cost + total_supplies_cost + total_equipment_cost + total_personnel_cost + total_travel_cost;
  const markupPct = parseFloat(project.markup_percent) || 0;
  const markup_amount = subtotal * (markupPct / 100);
  const total_cost = subtotal + markup_amount;

  return {
    labor_hours, labor_cost, total_materials_cost, total_supplies_cost,
    total_equipment_cost, total_personnel_cost, total_travel_cost,
    subtotal, markup_amount, total_cost,
  };
};