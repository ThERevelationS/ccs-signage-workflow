import { constantTimeEqual } from './constantTime.ts';
import { hashBearerToken } from './bearerTokenHash.ts';

function asEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function b64urlDecode(str: string) {
  let value = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (value.length % 4) value += '=';
  return atob(value);
}

// Single TIMECLOCK2 badge verifier shared by timeClockAction and
// issueAdminSettingsAccess. A badge payload is email|version|token checked
// against the active badge record's stored hash - identical semantics to the
// kiosk's badge clock-in credential.
export async function verifyBadgeCredential(code: string, badgeEntity: any, authorized: any) {
  const parts = String(code || '').trim().split(':');
  if (parts.length !== 4 || parts[0] !== 'TIMECLOCK2') return null;

  let email = '';
  try {
    email = asEmail(b64urlDecode(parts[1]));
  } catch {
    return null;
  }
  const version = Number(parts[2]);
  const rawToken = String(parts[3] || '').trim().toLowerCase();
  if (!email || !Number.isInteger(version) || version < 1 || !/^[a-f0-9]{64}$/.test(rawToken)) return null;

  const targetRows = await authorized.filter({ email });
  if (!Array.isArray(targetRows) || targetRows.length !== 1) return null;
  const badgeRows = await badgeEntity.filter({ user_email: email });
  if (!Array.isArray(badgeRows)) return null;
  const activeBadges = badgeRows.filter((row: any) => !row?.revoked_at);
  if (activeBadges.length !== 1) return null;
  const badge = activeBadges[0];
  if (Number(badge.badge_version) !== version) return null;

  const expectedHash = await hashBearerToken(`${email}|${version}|${rawToken}`);
  if (!constantTimeEqual(String(badge.token_hash || ''), expectedHash)) return null;

  badgeEntity.updateMany(
    { id: badge.id, updated_date: badge.updated_date, user_email: email, badge_version: version },
    { $set: { last_used_at: new Date().toISOString() } },
  ).catch((error: any) => console.error('Time Clock badge last-used update failed:', error?.message || error));

  return { target: targetRows[0], badge };
}
