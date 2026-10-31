export const MAX_EMAIL_SUBJECT_LENGTH = 200;

// Strips CR/LF and other control/line-separator characters so record-derived
// text cannot inject email headers, then caps the length.
export function sanitizeEmailSubject(value, maxLength = MAX_EMAIL_SUBJECT_LENGTH) {
  const flattened = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(flattened);
  return chars.length > maxLength ? chars.slice(0, maxLength).join('').trimEnd() : flattened;
}
