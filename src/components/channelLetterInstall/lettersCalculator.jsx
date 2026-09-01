// Pricing math + helpers for the Letters Purchase tab.
// All pricing pulls from project settings, with sensible defaults that
// match the user's price sheet (Excel rows 12-19).

export const LETTER_TYPE_LABELS = {
  raceway: "Raceway",
  channel_raceway_mounted: "Raceway Mounted Letters",
  channel_flush_mounted: "Flush Mounted Letters",
  channel_halo_lit: "Channel Letters — Halo-Lit",
  capsule_logo_pillbox: "Capsule / Logo / Pillbox",
  dimensional_letters: "Dimensional Letters (fabricated in-house)",
};

// What "size_value" means for each letter type
export const SIZE_UNITS = {
  raceway: "ft", // linear feet
  channel_raceway_mounted: "in", // vertical inches per letter
  channel_flush_mounted: "in",
  channel_halo_lit: "in",
  capsule_logo_pillbox: "sqft", // square feet
  dimensional_letters: "sqft",
};

// Default pricing (matches the Excel pricing sheet)
const DEFAULTS = {
  letters_raceway_1st_per_ft: 22.53,
  letters_raceway_2nd_per_ft: 23.53,
  letters_raceway_3rd_per_ft: 24.53,
  letters_raceway_4th_per_ft: 25.53,
  letters_channel_raceway_per_inch: 7.10,
  letters_channel_flush_per_inch: 9.03,
  letters_channel_halo_per_inch: 11.75, // ~30% premium over flush
  letters_capsule_logo_per_sqft: 45.37,
  letters_dimensional_per_sqft: 65.00, // placeholder — in-house fab
  letters_default_delivery_fee: 90,
  letters_default_design_fee: 150,
  letters_default_install_supplies_fee: 100,
  letters_default_permitting_fee: 750,
  letters_default_markup_percent: 86.2, // tier 1 markup from the Excel
};

export const getLettersDefault = (key) => DEFAULTS[key];

const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
};

// Generate a stable id for a new set
export const newSetId = () => `set_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// Group purchases visually: returns an ordered array of groups, each either
// { kind: "solo", purchase }   — a normal standalone row
// { kind: "set", parent, children }  — a parent + its children in the same set
// Children that don't yet have a parent are treated as solo (defensive).
export const groupPurchasesBySet = (purchases) => {
  const list = purchases || [];
  const byId = new Map(list.map(p => [p.id, p]));
  const childrenByParent = new Map();
  list.forEach(p => {
    if (p.set_parent_id && byId.has(p.set_parent_id)) {
      const arr = childrenByParent.get(p.set_parent_id) || [];
      arr.push(p);
      childrenByParent.set(p.set_parent_id, arr);
    }
  });
  const seen = new Set();
  const groups = [];
  for (const p of list) {
    if (seen.has(p.id)) continue;
    // Treat as a parent if it has children OR has set_id but no set_parent_id
    if (!p.set_parent_id && childrenByParent.has(p.id)) {
      const children = childrenByParent.get(p.id);
      groups.push({ kind: "set", parent: p, children });
      seen.add(p.id);
      children.forEach(c => seen.add(c.id));
    } else if (!p.set_parent_id) {
      groups.push({ kind: "solo", purchase: p });
      seen.add(p.id);
    }
    // Children whose parent doesn't exist will be picked up at the end as solo (defensive)
  }
  // Defensive: orphan children
  for (const p of list) {
    if (!seen.has(p.id)) {
      groups.push({ kind: "solo", purchase: p });
      seen.add(p.id);
    }
  }
  return groups;
};

export const emptyLetterPurchase = (type = "channel_flush_mounted") => ({
  id: `lp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  letter_type: type,
  description: "",
  raceway_index: 1,
  // Dimensional letters: nothing prefilled — user MUST configure via Build Fab Cost modal
  qty: type === "dimensional_letters" ? 0 : type === "raceway" ? 1 : 5,
  size_value: type === "dimensional_letters" ? 0 : type === "raceway" ? 8 : type.startsWith("channel_") ? 24 : 6,
  // For combined raceway-mounted rows: track the raceway hardware alongside the letters
  raceway_length_feet: type === "channel_raceway_mounted" ? 8 : 0,
  raceway_qty: type === "channel_raceway_mounted" ? 1 : 0,
  unit_cost: 0,
  unit_cost_override: false,
  total_cost: 0,
  create_install_item: type !== "raceway", // raceway is purchase-only by default
  install_height_feet: 12,
  wall_material: "eifs",
  // Backer (dimensional letters only) — disabled by default
  backer_enabled: false,
  backer_material_id: null,
  backer_width_inches: 0,
  backer_height_inches: 0,
  backer_standoff_inventory_id: null,
  backer_standoff_qty: 0,
  backer_fab_config: null,
});

// Resolve the unit cost for a purchase row from settings
export const resolveUnitCost = (purchase, settings) => {
  if (purchase.unit_cost_override) return num(purchase.unit_cost);
  switch (purchase.letter_type) {
    case "raceway": {
      // Standalone raceway row: tier driven by purchase.qty (# of raceways) using avg-tier math
      const qty = Math.max(1, Math.min(4, Math.floor(num(purchase.qty, 1))));
      let sum = 0;
      for (let i = 0; i < qty; i++) {
        const k = ["letters_raceway_1st_per_ft", "letters_raceway_2nd_per_ft", "letters_raceway_3rd_per_ft", "letters_raceway_4th_per_ft"][i];
        sum += num(settings[k], DEFAULTS[k]);
      }
      return sum / qty;
    }
    case "channel_raceway_mounted":
      return num(settings.letters_channel_raceway_per_inch, DEFAULTS.letters_channel_raceway_per_inch);
    case "channel_flush_mounted":
      return num(settings.letters_channel_flush_per_inch, DEFAULTS.letters_channel_flush_per_inch);
    case "channel_halo_lit":
      return num(settings.letters_channel_halo_per_inch, DEFAULTS.letters_channel_halo_per_inch);
    case "capsule_logo_pillbox":
      return num(settings.letters_capsule_logo_per_sqft, DEFAULTS.letters_capsule_logo_per_sqft);
    case "dimensional_letters":
      return num(settings.letters_dimensional_per_sqft, DEFAULTS.letters_dimensional_per_sqft);
    default:
      return 0;
  }
};

// Resolve the raceway tier $/ft cost. Tier is now driven by raceway_qty:
// 1 raceway -> tier 1, 2 -> tier 2, ... capped at tier 4. When qty > 1, this
// returns the AVERAGE $/ft across raceways 1..qty so the (avg × length × qty)
// math produces the correct escalating total.
const racewayTierKeys = [
  "letters_raceway_1st_per_ft",
  "letters_raceway_2nd_per_ft",
  "letters_raceway_3rd_per_ft",
  "letters_raceway_4th_per_ft",
];
const resolveRacewayAvgPerFt = (racewayQty, settings) => {
  const q = Math.max(1, Math.min(4, Math.floor(num(racewayQty, 1))));
  let sum = 0;
  for (let i = 0; i < q; i++) {
    sum += num(settings[racewayTierKeys[i]], DEFAULTS[racewayTierKeys[i]]);
  }
  return sum / q;
};

// Compute totals for a single purchase row
export const calcLetterPurchase = (purchase, settings) => {
  const qty = num(purchase.qty);
  const size = num(purchase.size_value);
  const isDimensional = purchase.letter_type === "dimensional_letters";
  const isCombinedRaceway = purchase.letter_type === "channel_raceway_mounted";

  // Dimensional letters always price off the fab_config (per-letter unit cost × qty).
  // Per-letter override (purchase.unit_cost_override) lets the user pin the per-letter cost.
  let unit_cost;
  let letters_total;

  if (isDimensional) {
    const fabUnit = num(purchase.fab_config?.unit_total_cost);
    const perLetter = purchase.unit_cost_override ? num(purchase.unit_cost) : fabUnit;
    letters_total = perLetter * qty;
    unit_cost = perLetter;
  } else {
    // Standard pricing: unit_cost × size × qty
    // letters_total_override pins the total and back-solves unit_cost from qty.
    const autoUnit = resolveUnitCost({ ...purchase, unit_cost_override: false }, settings);
    if (purchase.letters_total_override) {
      letters_total = num(purchase.letters_total);
      // Back-solve unit cost from total when size and qty are non-zero
      unit_cost = (size > 0 && qty > 0) ? letters_total / (size * qty) : 0;
    } else {
      unit_cost = purchase.unit_cost_override ? num(purchase.unit_cost) : autoUnit;
      letters_total = unit_cost * size * qty;
    }
  }

  // Combined raceway: when letter_type is channel_raceway_mounted, also add
  // the raceway hardware cost. Tier is driven by raceway_qty (1=tier1, 2=tier2, ...).
  let raceway_total = 0;
  let raceway_unit_cost = 0;
  if (isCombinedRaceway) {
    const rwLen = num(purchase.raceway_length_feet);
    const rwQty = num(purchase.raceway_qty, 1);
    const avgPerFt = resolveRacewayAvgPerFt(rwQty, settings);
    if (purchase.raceway_total_override) {
      raceway_total = num(purchase.raceway_total);
      // Back-solve $/ft from total / (length × qty)
      raceway_unit_cost = (rwLen > 0 && rwQty > 0) ? raceway_total / (rwLen * rwQty) : 0;
    } else if (purchase.raceway_unit_cost_override) {
      raceway_unit_cost = num(purchase.raceway_unit_cost);
      raceway_total = raceway_unit_cost * rwLen * rwQty;
    } else {
      raceway_unit_cost = avgPerFt;
      raceway_total = avgPerFt * rwLen * rwQty;
    }
  }

  // Backer add-on (dimensional letters only) — total backer fab × qty of letters
  let backer_total = 0;
  if (isDimensional && purchase.backer_enabled && purchase.backer_fab_config?.unit_total_cost) {
    backer_total = num(purchase.backer_fab_config.unit_total_cost) * qty;
  }

  const total_cost = letters_total + raceway_total + backer_total;

  return {
    ...purchase,
    unit_cost,
    letters_total,
    raceway_total,
    backer_total,
    raceway_unit_cost,
    total_cost,
  };
};

// Project-level totals for the Letters tab
export const calcLettersTotals = (project, settings) => {
  const purchases = (project.letter_purchases || []).map(p => calcLetterPurchase(p, settings));
  const purchasesTotal = purchases.reduce((s, p) => s + num(p.total_cost), 0);

  // Delivery / Shipping doesn't apply when EVERY product is dimensional
  // (fabricated in-house). The UI hides the fee in that case — exclude it
  // from the math too so the on-screen rollup matches the total.
  const onlyDimensional = purchases.length > 0 && purchases.every(p => p.letter_type === "dimensional_letters");
  const delivery = onlyDimensional ? 0 : num(project.letters_delivery_fee);
  const design = num(project.letters_design_fee);
  const supplies = num(project.letters_install_supplies_fee);
  const permitting = num(project.letters_permitting_fee);
  const other = num(project.letters_other_fee);

  const letters_subtotal = purchasesTotal + delivery + design + supplies + permitting + other;
  const markupPct = num(project.letters_markup_percent);
  const total_letters_cost = letters_subtotal * (1 + markupPct / 100);

  return {
    letter_purchases: purchases,
    letters_subtotal,
    total_letters_cost,
  };
};

// Map a letter purchase row to an install line item type
const purchaseTypeToInstallType = (letter_type, backerEnabled = false) => {
  switch (letter_type) {
    case "channel_raceway_mounted":
    case "raceway":
      return "raceway";
    case "channel_halo_lit":
      return "halo_lit";
    case "dimensional_letters":
      return backerEnabled ? "dimensional_lettering_with_backer" : "dimensional_lettering";
    case "channel_flush_mounted":
    case "capsule_logo_pillbox":
    default:
      return "flush_mount";
  }
};

// Pick a letter_size enum from vertical inches
const inchesToLetterSize = (inches) => {
  const n = num(inches);
  if (n <= 8) return "extra_small";
  if (n <= 12) return "small";
  if (n <= 24) return "medium";
  if (n <= 48) return "large";
  if (n <= 60) return "extra_large";
  return "extra_extra_large";
};

// Build (or update) install line items from the letter_purchases array.
// Items linked via source_letter_purchase_id are kept in sync;
// items the user added by hand on the Installation tab are left untouched.
export const syncInstallItemsFromPurchases = (existingItems, purchases, emptyLineItemFn, inventory = []) => {
  // Inline default-materials selection (kept here to avoid a circular import with installCalculator)
  const defaultMaterialsForItem = (item) => (inventory || [])
      .filter(inv => {
        if (!inv.is_default) return false;
        if (inv.pricing_mode === "per_raceway_foot") return false; // raceway priced on Letters tab only
        const list = Array.isArray(inv.applies_to_list) ? inv.applies_to_list : [];
        if (list.length > 0) return list.includes(item.installation_type);
        if (!inv.applies_to || inv.applies_to === "all") return true;
        return inv.applies_to === item.installation_type;
      })
      .map(inv => {
        const m = {
          inventory_item_id: inv.id,
          item_name: inv.item_name,
          pricing_mode: inv.pricing_mode,
          unit_cost: 0,
          quantity: 0,
          total_cost: 0,
        };
        if (inv.pricing_mode === "per_letter_flat") {
          m.unit_cost = parseFloat(inv.cost_per_letter) || 0;
          m.quantity = parseFloat(item.qty_letters) || 0;
        } else if (inv.pricing_mode === "per_letter_by_size") {
          const sizeKey = `cost_${item.letter_size}`;
          m.unit_cost = parseFloat(inv[sizeKey]) || 0;
          m.quantity = parseFloat(item.qty_letters) || 0;
        } else if (inv.pricing_mode === "per_raceway_foot") {
          m.unit_cost = parseFloat(inv.cost_per_foot) || 0;
          m.quantity = parseFloat(item.raceway_length_feet) || 0;
        } else if (inv.pricing_mode === "per_project_flat") {
          m.unit_cost = parseFloat(inv.cost_flat) || 0;
          m.quantity = 1;
        }
        m.total_cost = m.unit_cost * m.quantity;
        return m;
      });

  const items = [...(existingItems || [])];
  const byPurchaseId = new Map();
  items.forEach((it, idx) => {
    if (it.source_letter_purchase_id) byPurchaseId.set(it.source_letter_purchase_id, idx);
  });

  const validPurchaseIds = new Set();

  // Build a lookup of purchases by id so children can inherit from their parent
  const purchasesById = new Map((purchases || []).map(p => [p.id, p]));

  for (const p of (purchases || [])) {
    if (!p.create_install_item) continue;
    if (p.letter_type === "raceway") continue; // raceway is a hardware purchase, not an install line

    validPurchaseIds.add(p.id);

    const installType = purchaseTypeToInstallType(p.letter_type, !!p.backer_enabled);
    const sizeUnit = SIZE_UNITS[p.letter_type];

    // Map sizing fields based on what the purchase row means
    const letter_height_inches = sizeUnit === "in" ? num(p.size_value, 24) : 24;
    const letter_size = sizeUnit === "in" ? inchesToLetterSize(p.size_value) : "medium";
    // For combined raceway-mounted rows, carry raceway length onto the install item
    const raceway_length_feet = p.letter_type === "channel_raceway_mounted"
      ? num(p.raceway_length_feet)
      : 0;

    // Letter set inheritance: if this purchase is a child of a set, inherit
    // install_height_feet and wall_material from the parent purchase.
    const parent = p.set_parent_id ? purchasesById.get(p.set_parent_id) : null;
    const inheritedInstallHeight = parent ? num(parent.install_height_feet, 12) : num(p.install_height_feet, 12);
    const inheritedWallMaterial = parent ? (parent.wall_material || "eifs") : (p.wall_material || "eifs");

    const patch = {
      description: p.description || LETTER_TYPE_LABELS[p.letter_type],
      installation_type: installType,
      qty_letters: num(p.qty),
      letter_size,
      letter_height_inches,
      installation_height_feet: inheritedInstallHeight,
      raceway_length_feet,
      wall_material: inheritedWallMaterial,
      source_letter_purchase_id: p.id,
      set_id: p.set_id || undefined,
      set_parent_id: p.set_parent_id || undefined,
      // Backer fields propagate to the install item for install-time pricing
      backer_width_inches: p.backer_enabled ? num(p.backer_width_inches) : 0,
      backer_height_inches: p.backer_enabled ? num(p.backer_height_inches) : 0,
      backer_standoff_qty: p.backer_enabled ? num(p.backer_standoff_qty) : 0,
    };

    if (byPurchaseId.has(p.id)) {
      const idx = byPurchaseId.get(p.id);
      // Preserve existing materials when re-syncing
      items[idx] = { ...items[idx], ...patch };
    } else {
      // Create a fresh item using the project's empty template, then apply the patch
      const fresh = emptyLineItemFn();
      const newItem = { ...fresh, ...patch };
      newItem.materials = defaultMaterialsForItem(newItem);
      items.push(newItem);
    }
  }

  // Remove auto-linked items whose purchase row was deleted
  return items.filter(it => !it.source_letter_purchase_id || validPurchaseIds.has(it.source_letter_purchase_id));
};