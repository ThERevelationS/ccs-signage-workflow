// Credential, bearer-token, biometric, and session-revocation fields on an
// AuthorizedEmail row. Kept in sync with staffDataRead's FIELD_DENYLIST so a
// profile save never returns more than a staff read of the same row would.
export const OWN_PROFILE_DENIED_FIELDS = Object.freeze([
  'password_hash',
  'password_reset_token',
  'password_reset_token_hash',
  'password_reset_expires',
  'onboarding_token',
  'onboarding_token_hash',
  'onboarding_expires',
  'session_not_before',
  'failed_login_count',
  'login_locked_until',
  'face_descriptors',
]);

export function toOwnProfileView(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const view = { ...record };
  for (const field of OWN_PROFILE_DENIED_FIELDS) delete view[field];
  return view;
}
