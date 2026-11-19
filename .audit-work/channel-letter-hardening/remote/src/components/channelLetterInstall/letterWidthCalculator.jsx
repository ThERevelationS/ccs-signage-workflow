// Estimates the average letter width (in inches) for a given letter height,
// based on the average advance widths of 10 common signage fonts.
//
// The factor below is the simple average of the lowercase "x" width / cap-height
// for these 10 fonts (uppercase set, since signage typically uses caps):
//   Helvetica, Arial, Futura, Gotham, Univers, Avenir, Frutiger, Trade Gothic,
//   Myriad, Optima.
// Average advance-width / cap-height ratio across the alphabet (A–Z) ≈ 0.72.
// Rounding UP to the next half-inch to match shop practice when ordering
// stock material.
//
// Returns a number in inches (>= 0). Returns 0 for non-positive heights.

export const AVG_WIDTH_TO_HEIGHT_RATIO = 0.72;

/**
 * Auto-estimate the average letter width for a given height.
 * Result is rounded UP to the nearest 0.5".
 */
export const estimateAverageLetterWidth = (heightInches) => {
  const h = parseFloat(heightInches);
  if (!isFinite(h) || h <= 0) return 0;
  const raw = h * AVG_WIDTH_TO_HEIGHT_RATIO;
  // Round up to the next 0.5"
  return Math.ceil(raw * 2) / 2;
};