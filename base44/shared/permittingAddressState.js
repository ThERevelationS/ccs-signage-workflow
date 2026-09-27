/** Normalize OH/KY Google administrative-area long names to tracker state codes.
 * Keep unknown states unchanged rather than guessing the address jurisdiction.
 */
export function normalizeAddressState(value) {
  const state = String(value || '').trim().toLowerCase();
  if (state === 'ohio' || state === 'oh') return 'oh';
  if (state === 'kentucky' || state === 'ky') return 'ky';
  return state;
}
