// Harness stub — wallCalculator's calc-path dependency. The O-094 candidates
// only call foundationWallSegments (pure local math); these exports satisfy
// the module's imports without dragging the inventory chain into the bundle.
export const inventorySettingValue = (v, d) => v ?? d;
export const inventoryNonnegativeNumber = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
export const inventoryPositiveNumber = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
export const inventorySettingNumber = (v) => v ?? null;
export const inventoryPositiveSettingNumber = (v) => v ?? null;
export const canonicalWallMaterialSubtype = () => null;
export const wallMaterialSubtypeRecorded = () => false;
