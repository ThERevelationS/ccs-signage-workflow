import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { replaceAuthorizedEmailCredentialFieldsIfUnchanged } from '../../shared/authorizedEmailCredentialPersistence.mjs';
import { toOwnProfileView } from '../../shared/ownProfileView.mjs';

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function cleanUsername(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function jsonSize(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function normalizeStructured(value: any): any {
  if (Array.isArray(value)) return value.map(normalizeStructured);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out: Record<string, unknown>, key) => {
    out[key] = normalizeStructured(value[key]);
    return out;
  }, {});
}

function sameStructured(a: unknown, b: unknown) {
  return JSON.stringify(normalizeStructured(a ?? {})) === JSON.stringify(normalizeStructured(b ?? {}));
}

async function loadExactOwnRecord(AuthorizedEmail: any, email: string) {
  const rows = await AuthorizedEmail.filter({ email });
  if (!Array.isArray(rows)) throw new Error('User profile lookup did not return a record list.');
  const exact = rows.filter((row: any) => normalizeEmail(row?.email) === email);
  if (exact.length !== 1) {
    throw Object.assign(
      new Error(exact.length === 0 ? 'Your authorized user profile was not found.' : 'Your authorized user profile is ambiguous.'),
      { status: exact.length === 0 ? 404 : 409 },
    );
  }
  return exact[0];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    const actorEmail = normalizeEmail(actor?.email);
    if (!actorEmail) return Response.json({ error: 'Authenticated user email is required.' }, { status: 401 });

    const AuthorizedEmail = base44.asServiceRole.entities.AuthorizedEmail;
    const user = await loadExactOwnRecord(AuthorizedEmail, actorEmail);
    const action = String(body?.action || '').trim();

    if (action === 'update_username') {
      const username = cleanUsername(body?.username);
      if (!/^[a-z0-9]{3,}$/.test(username)) {
        return Response.json({ error: 'Username must be at least 3 letters/numbers with no spaces.' }, { status: 400 });
      }

      const matches = await AuthorizedEmail.filter({ username });
      if (!Array.isArray(matches)) throw new Error('Username uniqueness could not be verified.');
      if (matches.some((row: any) => row?.id !== user.id && cleanUsername(row?.username) === username)) {
        return Response.json({ error: 'This username is already taken.' }, { status: 409 });
      }

      const expectedUsername = body?.expected_username === undefined ? cleanUsername(user.username) : cleanUsername(body.expected_username);
      if (cleanUsername(user.username) !== expectedUsername) {
        return Response.json({ error: 'Your username changed in another session. Reload before saving.' }, { status: 409 });
      }
      const saved = await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
        entity: AuthorizedEmail,
        user,
        nextFields: { username },
        guardFields: { email: user.email },
        label: `Username for ${actorEmail}`,
      });
      return Response.json({ success: true, record: toOwnProfileView(saved) });
    }

    if (action === 'update_order_form_filter') {
      const allowedFilters = new Set(['all_with_received', 'open_only', 'pending', 'ordered', 'received', 'overdue', 'duplicates']);
      const orderFormFilter = String(body?.order_form_filter || '').trim();
      if (!allowedFilters.has(orderFormFilter)) {
        return Response.json({ error: 'Invalid Order Form filter.' }, { status: 400 });
      }
      const saved = await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
        entity: AuthorizedEmail,
        user,
        nextFields: { order_form_filter: orderFormFilter },
        guardFields: { email: user.email },
        label: `Order Form filter for ${actorEmail}`,
      });
      return Response.json({ success: true, order_form_filter: saved?.order_form_filter });
    }

    if (action === 'update_hr') {
      const hrData = body?.hr_data;
      if (!hrData || typeof hrData !== 'object' || Array.isArray(hrData)) {
        return Response.json({ error: 'HR data must be an object.' }, { status: 400 });
      }
      if (jsonSize(hrData) > 100_000) {
        return Response.json({ error: 'HR data exceeds the allowed size.' }, { status: 400 });
      }

      const expectedHrData = body?.expected_hr_data === undefined ? user.hr_data : body.expected_hr_data;
      if (!sameStructured(user.hr_data, expectedHrData)) {
        return Response.json({ error: 'Your HR profile changed in another session. Reload before saving.' }, { status: 409 });
      }
      const saved = await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
        entity: AuthorizedEmail,
        user,
        nextFields: { hr_data: hrData },
        guardFields: { email: user.email },
        label: `HR profile for ${actorEmail}`,
      });
      return Response.json({ success: true, record: toOwnProfileView(saved) });
    }

    return Response.json({ error: 'Invalid profile action.' }, { status: 400 });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;
    console.error('manageOwnProfile error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Your profile could not be saved safely.' : error?.message,
    }, { status: safeStatus });
  }
});
