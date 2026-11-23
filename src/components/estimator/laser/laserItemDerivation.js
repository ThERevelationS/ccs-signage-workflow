export function deriveLaserItem(item, field, globalSettings) {
  const updated = { ...item };

  // Auto-calculate based on item type
  if (field === 'item_type' || field === 'material_type' || field === 'material_thickness' ||
  field === 'length' || field === 'width' || field === 'letter_height' ||
  field === 'num_letters' || field === 'quantity' || field === 'engrave_area_sqin') {

    const perimFactor = parseFloat(globalSettings.laser_letter_perimeter_factor) || 3.5;

    // Reset total_cut_length_inches first to ensure correct recalculation
    updated.total_cut_length_inches = 0;

    if (updated.item_type === 'panel' || updated.item_type === 'engrave_and_cut') {
      const perimeterInches = 2 * (updated.length + updated.width);
      updated.total_cut_length_inches = perimeterInches * updated.quantity;
    }

    if ((updated.item_type === 'engraving' || updated.item_type === 'engrave_and_cut') && (field === 'length' || field === 'width' || field === 'item_type')) {
      updated.engrave_area_sqin = updated.length * updated.width;
    }

    if (updated.item_type === 'lettering') {
      const perimeterPerLetter = updated.letter_height * perimFactor;
      updated.total_cut_length_inches = perimeterPerLetter * updated.num_letters * updated.quantity;
    }
    // For 'engraving', total_cut_length_inches remains 0.

    // Get cut speed from settings based on thickness
    // (String() guards: absent material/thickness used to throw here —
    // now it resolves a nonexistent setting key → the same `||default`
    // result, and the field is flagged where it's actually consumed.)
    const thicknessKey = `cut_speed_${String(updated.material_thickness ?? "").replace('/', '_')}`;
    const baseSpeed = parseFloat(globalSettings[thicknessKey]) || 20;

    // Apply material multiplier
    const materialMultiplier = parseFloat(globalSettings[`${String(updated.material_type ?? "").toLowerCase()}_cut_multiplier`]) || 1.0;
    updated.cut_speed_ipm = baseSpeed * materialMultiplier;

    // Get engraving speed from settings
    const engraveBaseSpeed = parseFloat(globalSettings.laser_engrave_speed_sqipm) || 5;
    const engraveMultiplier = parseFloat(globalSettings[`${String(updated.material_type ?? "").toLowerCase()}_engrave_multiplier`]) || 1.0;
    updated.engrave_speed_sqipm = engraveBaseSpeed * engraveMultiplier;
  }

  return updated;
}
