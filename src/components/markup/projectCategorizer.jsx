// Extracts cost lines from each module's project records and tags them
// with the proper category_key for tier-markup application.
//
// Mapping (from user's tier sheet):
//   Channel/Raceway/Capsule letter purchases  -> outsourced_fab
//   Dimensional Letter substrate (material)   -> substrates
//   Dimensional Letter paint materials        -> outsourced_fab
//   Dimensional Letter fab labor (CNC+paint)  -> inhouse_labor
//   Channel Letter install labor              -> inhouse_labor
//   Install materials/supplies (hardware)     -> outsourced_fab
//   Equipment rental (lifts)                  -> outsourced_services
//   Concrete + rebar materials                -> outsourced_fab
//   Foundation labor                          -> inhouse_labor
//   Poles                                     -> outsourced_fab
//   Foundation equipment rental               -> outsourced_services
//   Brick/stone material                      -> outsourced_fab
//   Masonry outsourced labor                  -> outsourced_services
//   Mortar + supplies                         -> outsourced_fab
//   Paint Estimator materials                 -> outsourced_fab
//   Paint Estimator labor                     -> inhouse_labor
//   Laser machine time                        -> machine_time
//   Laser labor                               -> inhouse_labor
//   Laser materials                           -> substrates
//   CNC machine time                          -> machine_time
//   CNC labor                                 -> inhouse_labor
//   CNC materials                             -> substrates
//   Metal Fab material                        -> substrates
//   Metal Fab labor                           -> inhouse_labor

const num = (v) => Number(v) || 0;

export function categorizeChannelLetterProject(p) {
  if (!p) return [];
  const lines = [];

  // 1. Letter purchases - check each letter type
  (p.letter_purchases || []).forEach((lp) => {
    const isDimensional = lp.letter_type === 'dimensional_letters';
    const total = num(lp.total_cost);
    if (total <= 0) return;

    if (isDimensional && lp.fab_config) {
      // Dimensional: split into material vs labor using fab_config if present
      const matCost = num(lp.fab_config.material_cost) + num(lp.fab_config.paint_material_cost);
      const laborCost = num(lp.fab_config.cnc_labor_cost) + num(lp.fab_config.paint_labor_cost);
      if (matCost > 0) {
        lines.push({ module: 'channel_letter', label: `Dimensional Letter Material — ${lp.description || ''}`, cost: matCost, category_key: 'substrates' });
      }
      if (laborCost > 0) {
        lines.push({ module: 'channel_letter', label: `Dimensional Letter Fab Labor — ${lp.description || ''}`, cost: laborCost, category_key: 'inhouse_labor' });
      }
      const remainder = total - matCost - laborCost;
      if (remainder > 0.01) {
        lines.push({ module: 'channel_letter', label: `Dimensional Letter (other) — ${lp.description || ''}`, cost: remainder, category_key: 'substrates' });
      }
    } else if (isDimensional) {
      // Dimensional with no fab_config breakdown — categorize whole as substrates (material side)
      lines.push({ module: 'channel_letter', label: `Dimensional Letters — ${lp.description || ''}`, cost: total, category_key: 'substrates' });
    } else {
      // Channel / Raceway / Capsule / Logo = outsourced fab
      lines.push({ module: 'channel_letter', label: `Letter Purchase — ${lp.description || lp.letter_type}`, cost: total, category_key: 'outsourced_fab' });
    }
  });

  // 1b. Letter-level fees
  // Delivery doesn't apply when every product is dimensional (matches lettersCalculator)
  const onlyDimensional = (p.letter_purchases || []).length > 0 &&
    (p.letter_purchases || []).every(lp => lp.letter_type === 'dimensional_letters');
  const letterFees =
    (onlyDimensional ? 0 : num(p.letters_delivery_fee)) + num(p.letters_design_fee) +
    num(p.letters_install_supplies_fee) + num(p.letters_permitting_fee) +
    num(p.letters_other_fee);
  if (letterFees > 0) {
    lines.push({ module: 'channel_letter', label: 'Letter Fees (delivery/design/permit/etc.)', cost: letterFees, category_key: 'outsourced_fab' });
  }

  // 2. Installation labor — when a crew is assigned, personnel pricing replaces
  // the flat-rate labor (labor_cost_in_subtotal = 0), so labor is never double-counted.
  const baseLabor = p.labor_cost_in_subtotal !== undefined
    ? num(p.labor_cost_in_subtotal)
    : num(p.labor_cost);
  const installLabor = baseLabor + num(p.total_personnel_cost);
  if (installLabor > 0) {
    lines.push({ module: 'channel_letter', label: 'Installation Labor', cost: installLabor, category_key: 'inhouse_labor' });
  }

  // 3. Materials/supplies (hardware, mounting)
  const matCost = num(p.total_materials_cost) + num(p.total_supplies_cost);
  if (matCost > 0) {
    lines.push({ module: 'channel_letter', label: 'Install Materials & Supplies', cost: matCost, category_key: 'outsourced_fab' });
  }

  // 4. Equipment rental
  const eqCost = num(p.total_equipment_cost);
  if (eqCost > 0) {
    lines.push({ module: 'channel_letter', label: 'Equipment Rental', cost: eqCost, category_key: 'outsourced_services' });
  }

  // 5. Travel — was previously missing, so categorized lines didn't sum to the subtotal
  const travelCost = num(p.total_travel_cost);
  if (travelCost > 0) {
    lines.push({ module: 'channel_letter', label: 'Travel & Fuel', cost: travelCost, category_key: 'outsourced_services' });
  }

  return lines;
}

export function categorizeFoundationProject(p) {
  if (!p) return [];
  const lines = [];
  const concrete = num(p.total_concrete_cost) + num(p.total_rebar_cost) + num(p.total_forming_materials_cost) + num(p.total_fill_cost);
  if (concrete > 0) lines.push({ module: 'foundation', label: 'Concrete / Rebar / Forming Materials', cost: concrete, category_key: 'outsourced_fab' });
  const fLabor = num(p.total_labor_cost) + num(p.total_excavation_cost);
  if (fLabor > 0) lines.push({ module: 'foundation', label: 'Foundation Labor', cost: fLabor, category_key: 'inhouse_labor' });
  const poles = num(p.total_pole_cost) + num(p.total_pole_painting_cost);
  if (poles > 0) lines.push({ module: 'foundation', label: 'Poles & Pole Painting', cost: poles, category_key: 'outsourced_fab' });
  const eq = num(p.total_equipment_cost);
  if (eq > 0) lines.push({ module: 'foundation', label: 'Foundation Equipment Rental', cost: eq, category_key: 'outsourced_services' });
  const brick = num(p.total_brick_cost) + num(p.total_wall_cost);
  if (brick > 0) lines.push({ module: 'foundation', label: 'Brick / Wall Materials', cost: brick, category_key: 'outsourced_fab' });
  return lines;
}

export function categorizePaintProject(p) {
  if (!p) return [];
  const lines = [];
  const mats = num(p.total_paint_mask_cost) + num(p.total_liquid_paint_and_supplies_cost);
  if (mats > 0) lines.push({ module: 'paint', label: 'Paint Materials & Supplies', cost: mats, category_key: 'outsourced_fab' });
  const labor = num(p.total_labor_cost);
  if (labor > 0) lines.push({ module: 'paint', label: 'Paint Labor', cost: labor, category_key: 'inhouse_labor' });
  return lines;
}

export function categorizeLaserProject(p) {
  if (!p) return [];
  const lines = [];
  const machine = num(p.total_machine_cost);
  if (machine > 0) lines.push({ module: 'laser', label: 'Laser Machine Time', cost: machine, category_key: 'machine_time' });
  const labor = num(p.total_labor_cost);
  if (labor > 0) lines.push({ module: 'laser', label: 'Laser Labor', cost: labor, category_key: 'inhouse_labor' });
  const supplies = num(p.total_supplies_cost);
  if (supplies > 0) lines.push({ module: 'laser', label: 'Laser Materials', cost: supplies, category_key: 'substrates' });
  return lines;
}

export function categorizeCNCProject(p) {
  if (!p) return [];
  const lines = [];
  const machine = num(p.total_machine_cost);
  if (machine > 0) lines.push({ module: 'cnc', label: 'CNC Machine Time', cost: machine, category_key: 'machine_time' });
  const labor = num(p.total_labor_cost);
  if (labor > 0) lines.push({ module: 'cnc', label: 'CNC Labor', cost: labor, category_key: 'inhouse_labor' });
  return lines;
}

export function categorizeMetalProject(p) {
  if (!p) return [];
  const lines = [];
  const mat = num(p.total_material_cost) + num(p.total_supplies_cost);
  if (mat > 0) lines.push({ module: 'metal', label: 'Metal Fab Material', cost: mat, category_key: 'substrates' });
  const labor = num(p.total_fabrication_cost) + num(p.total_welding_cost) + num(p.total_finishing_cost);
  if (labor > 0) lines.push({ module: 'metal', label: 'Metal Fab Labor', cost: labor, category_key: 'inhouse_labor' });
  return lines;
}

// Vinyl Estimator:
//   Vinyl + Laminate + Transfer Tape rolls + Ink + Blade → substrates
//   Machine time (printer / cutter / laminator amortized $/hr) → machine_time
//   Operator + Designer + Installer labor → inhouse_labor
//   Install equipment rental (lifts) → outsourced_services
//   Travel → outsourced_services
export function categorizeVinylProject(p) {
  if (!p) return [];
  const lines = [];
  const materials =
    num(p.total_vinyl_cost) + num(p.total_laminate_cost) +
    num(p.total_ink_cost) + num(p.total_blade_cost) +
    num(p.total_supplies_cost);
  if (materials > 0) lines.push({ module: 'vinyl', label: 'Vinyl, Laminate, Tape, Ink & Supplies', cost: materials, category_key: 'substrates' });

  const machine = num(p.total_machine_cost);
  if (machine > 0) lines.push({ module: 'vinyl', label: 'Printer / Cutter / Laminator Time', cost: machine, category_key: 'machine_time' });

  const labor = num(p.labor_cost) + num(p.total_personnel_cost);
  if (labor > 0) lines.push({ module: 'vinyl', label: 'Production & Install Labor', cost: labor, category_key: 'inhouse_labor' });

  const equip = num(p.total_equipment_cost);
  if (equip > 0) lines.push({ module: 'vinyl', label: 'Install Equipment', cost: equip, category_key: 'outsourced_services' });

  const travel = num(p.total_travel_cost);
  if (travel > 0) lines.push({ module: 'vinyl', label: 'Travel', cost: travel, category_key: 'outsourced_services' });

  return lines;
}

export const MODULE_CATEGORIZERS = {
  channel_letter_installation: categorizeChannelLetterProject,
  foundation: categorizeFoundationProject,
  paint: categorizePaintProject,
  laser: categorizeLaserProject,
  cnc: categorizeCNCProject,
  metal_fabrication: categorizeMetalProject,
  vinyl_estimator: categorizeVinylProject,
};