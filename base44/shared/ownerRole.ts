// Owner role — the application's top privilege tier, above full admin.
//
// Owner is deliberately NOT a stored `role` value: every backend gate in the
// app checks `role === 'admin'` (90+ call sites), so owner records keep
// `role: 'admin'` and carry `is_owner: true`. The role tier is expressed as a
// capability flag + `role_label`, which means owner accounts pass every
// existing admin check with zero per-function changes.
//
// Bootstrap: the account whose email appears in OWNER_EMAILS is owner even if
// no record fields are set — this anchors the role in code so the app can
// never deadlock (granting full admin requires a full admin, which requires
// an approved access request; owner resolves before all of that).

const normEmail = (v: unknown) => String(v || '').trim().toLowerCase();

const DEFAULT_OWNER_EMAILS = ['brett@cincisigns.com', 'brettheinlein1@gmail.com'];

export function ownerEmails(): string[] {
  try {
    const raw = (typeof Deno !== 'undefined' ? Deno.env.get('APP_OWNER_EMAILS') : '') || '';
    const parsed = raw.split(',').map(normEmail).filter(Boolean);
    return parsed.length ? parsed : DEFAULT_OWNER_EMAILS;
  } catch {
    return DEFAULT_OWNER_EMAILS;
  }
}

export function isOwnerEmail(email: unknown): boolean {
  return ownerEmails().includes(normEmail(email));
}

// True when the record is owner — either granted (is_owner flag) or anchored
// by email (bootstrap list). Anchored owners cannot be revoked through the
// app's own grant paths; remove them from APP_OWNER_EMAILS instead.
export function isOwnerRecord(row: any): boolean {
  if (!row || typeof row !== 'object') return false;
  return row.is_owner === true || isOwnerEmail(row.email);
}

// Normalizes an AuthorizedEmail record into its capability view: owner rows
// surface as admin + the owner flags. Call this on any actor/record before
// role gates so owner inherits every admin permission plus full-admin power.
export function applyOwnerCapabilities<T extends Record<string, any>>(row: T | null | undefined): T | null | undefined {
  if (!isOwnerRecord(row) || !row) return row;
  row.role = 'admin';
  row.is_owner = true;
  row.is_full_admin = true;
  row.role_label = 'Owner';
  return row;
}

// Display label for a record — use in list/read responses so the UI can show
// the real tier without learning the storage convention.
export function roleLabelFor(row: any): string {
  if (isOwnerRecord(row)) return 'Owner';
  return row?.role === 'admin' ? 'Admin' : 'User';
}
