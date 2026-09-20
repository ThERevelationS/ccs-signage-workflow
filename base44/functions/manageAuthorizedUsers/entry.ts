import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { replaceAuthorizedEmailCredentialFieldsIfUnchanged } from '../../shared/authorizedEmailCredentialPersistence.mjs';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

const ROLES = new Set(['user', 'admin']);
const EMPLOYMENT_TYPES = new Set(['hourly', 'salary']);
const SALES_ROLES = new Set([
  'Task Assigned',
  'Designer',
  'Project Manager',
  'Estimator',
  'Installer',
  'Fabricator',
  'CNC Router Operator',
  'CNC Laser Operator',
  'Painter',
  'Office Administration',
  'Accounting',
]);

function cleanText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

function cleanEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function cleanUsername(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalize(value: any): any {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out: Record<string, unknown>, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function jsonSize(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function adminUserView(row: any) {
  return {
    id: row?.id,
    email: row?.email,
    full_name: row?.full_name ?? null,
    username: row?.username ?? null,
    role: row?.role || 'user',
    sales_roles: Array.isArray(row?.sales_roles) ? row.sales_roles : [],
    can_import_export: row?.can_import_export === true,
    can_view_resources: row?.can_view_resources === true,
    employment_type: row?.employment_type || 'hourly',
    can_work_pause: row?.can_work_pause === true,
    hr_data: row?.hr_data && typeof row.hr_data === 'object' && !Array.isArray(row.hr_data) ? row.hr_data : {},
    onboarding_complete: row?.onboarding_complete === true,
    has_face_enrollment: Array.isArray(row?.face_descriptors) && row.face_descriptors.length > 0,
    created_date: row?.created_date,
    updated_date: row?.updated_date,
  };
}

function cleanSalesRoles(value: unknown) {
  if (!Array.isArray(value) || value.length > SALES_ROLES.size) {
    throw Object.assign(new Error('Sales roles are invalid.'), { status: 400 });
  }
  const roles = [...new Set(value.map((item) => cleanText(item, 100)).filter(Boolean))];
  if (roles.some((role) => !SALES_ROLES.has(role))) {
    throw Object.assign(new Error('Sales roles contain an unsupported value.'), { status: 400 });
  }
  return roles;
}

function cleanManagedFields(value: any) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(input, 'full_name')) out.full_name = cleanText(input.full_name, 500);
  if (Object.prototype.hasOwnProperty.call(input, 'username')) {
    const username = cleanUsername(input.username);
    if (username && !/^[a-z0-9]{3,128}$/.test(username)) {
      throw Object.assign(new Error('Username must be 3-128 letters/numbers with no spaces.'), { status: 400 });
    }
    out.username = username;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'role')) {
    const role = String(input.role || '');
    if (!ROLES.has(role)) throw Object.assign(new Error('Role is invalid.'), { status: 400 });
    out.role = role;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'sales_roles')) out.sales_roles = cleanSalesRoles(input.sales_roles);
  if (Object.prototype.hasOwnProperty.call(input, 'can_import_export')) out.can_import_export = input.can_import_export === true;
  if (Object.prototype.hasOwnProperty.call(input, 'can_view_resources')) out.can_view_resources = input.can_view_resources === true;
  if (Object.prototype.hasOwnProperty.call(input, 'employment_type')) {
    const employmentType = String(input.employment_type || '');
    if (!EMPLOYMENT_TYPES.has(employmentType)) throw Object.assign(new Error('Employment type is invalid.'), { status: 400 });
    out.employment_type = employmentType;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'can_work_pause')) out.can_work_pause = input.can_work_pause === true;

  if (!Object.keys(out).length) throw Object.assign(new Error('No supported user fields were supplied.'), { status: 400 });
  if (out.role === 'admin') out.can_view_resources = true;
  return out;
}

async function loadTarget(AuthorizedEmail: any, id: string, email: string) {
  if (!id || !email) throw Object.assign(new Error('User identity is required.'), { status: 400 });
  const current = await AuthorizedEmail.get(id).catch(() => null);
  if (!current?.id || cleanEmail(current.email) !== email) {
    throw Object.assign(new Error('Authorized user no longer matches the loaded record.'), { status: 409 });
  }
  return current;
}

async function ensureUsernameAvailable(AuthorizedEmail: any, username: string, exceptId = '') {
  if (!username) return;
  const rows = await AuthorizedEmail.filter({ username });
  if (!Array.isArray(rows)) throw new Error('Username uniqueness could not be verified.');
  if (rows.some((row: any) => row?.id !== exceptId && cleanUsername(row?.username) === username)) {
    throw Object.assign(new Error('This username is already in use.'), { status: 409 });
  }
}

async function ensureAnotherAdminExists(AuthorizedEmail: any, targetId: string) {
  const admins = await AuthorizedEmail.filter({ role: 'admin' });
  if (!Array.isArray(admins)) throw new Error('Administrator count could not be verified.');
  const others = admins.filter((row: any) => row?.id !== targetId && row?.role === 'admin');
  if (others.length === 0) {
    throw Object.assign(new Error('The final admin account cannot be demoted or removed. Promote another admin first.'), { status: 409 });
  }
}

function adminDeletionRequestView(row: any) {
  return {
    id: row?.id,
    authorized_email_id: row?.authorized_email_id,
    user_email: row?.user_email,
    user_name: row?.user_name ?? null,
    status: row?.status || 'pending',
    requested_at: row?.requested_at ?? null,
    processed_at: row?.processed_at ?? null,
    processed_by: row?.processed_by ?? null,
    admin_notes: row?.admin_notes ?? '',
    created_date: row?.created_date,
    updated_date: row?.updated_date,
  };
}

async function resolveDeletionRequest(Request: any, actor: any, body: any) {
  const id = String(body?.request_id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  const resolution = String(body?.resolution || '').trim().toLowerCase();
  const adminNotes = cleanText(body?.admin_notes, 2000);

  if (!id || !expectedUpdatedDate) {
    throw Object.assign(new Error('Deletion request version is required.'), { status: 400 });
  }
  if (!['processed', 'cancelled'].includes(resolution)) {
    throw Object.assign(new Error('Deletion request resolution is invalid.'), { status: 400 });
  }

  const current = await Request.get(id).catch(() => null);
  if (!current?.id) throw Object.assign(new Error('Deletion request no longer exists.'), { status: 404 });

  const actorEmail = cleanEmail(actor?.email);
  if (
    current.status === resolution &&
    cleanEmail(current.processed_by) === actorEmail &&
    String(current.admin_notes || '') === adminNotes
  ) {
    return { record: adminDeletionRequestView(current), reused: true };
  }

  if (String(current.status || '') !== 'pending') {
    throw Object.assign(new Error('Deletion request was already resolved. Reload before changing it.'), { status: 409 });
  }
  if (String(current.updated_date || '') !== expectedUpdatedDate) {
    throw Object.assign(new Error('Deletion request changed in another session. Reload before resolving it.'), { status: 409 });
  }

  const patch = {
    status: resolution,
    processed_at: new Date().toISOString(),
    processed_by: actorEmail,
    admin_notes: adminNotes,
  };
  const result = await Request.updateMany(
    { id, updated_date: expectedUpdatedDate, status: 'pending' },
    { $set: patch },
  );
  if (!result || result.updated !== 1) {
    throw Object.assign(new Error('Deletion request changed while it was being resolved. Reload before retrying.'), { status: 409 });
  }

  const saved = await Request.get(id).catch(() => null);
  if (
    !saved?.id ||
    saved.status !== resolution ||
    cleanEmail(saved.processed_by) !== actorEmail ||
    String(saved.admin_notes || '') !== adminNotes
  ) {
    throw new Error('Deletion request resolution could not be verified.');
  }
  return { record: adminDeletionRequestView(saved), reused: false };
}

async function createUser(AuthorizedEmail: any, input: any) {
  const email = cleanEmail(input?.email);
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('A valid email address is required.'), { status: 400 });
  }

  const existing = await AuthorizedEmail.filter({ email });
  if (!Array.isArray(existing)) throw new Error('Authorized user uniqueness could not be verified.');
  const exactExisting = existing.filter((row: any) => cleanEmail(row?.email) === email);
  if (exactExisting.length > 1) throw Object.assign(new Error('Multiple authorized users already use this email.'), { status: 409 });
  if (exactExisting.length === 1) return { record: adminUserView(exactExisting[0]), status: 'existing' };

  const role = ROLES.has(String(input?.role || 'user')) ? String(input.role || 'user') : 'user';
  const payload = {
    email,
    full_name: cleanText(input?.full_name, 500) || null,
    role,
    sales_roles: Array.isArray(input?.sales_roles) ? cleanSalesRoles(input.sales_roles) : ['Task Assigned'],
    can_import_export: input?.can_import_export === true,
    can_view_resources: role === 'admin' ? true : input?.can_view_resources === true,
    employment_type: EMPLOYMENT_TYPES.has(String(input?.employment_type || 'hourly')) ? String(input.employment_type || 'hourly') : 'hourly',
    can_work_pause: input?.can_work_pause === true,
    onboarding_complete: false,
  };

  let created: any = null;
  let createError: any = null;
  try {
    created = await AuthorizedEmail.create(payload);
  } catch (error) {
    createError = error;
  }

  const after = await AuthorizedEmail.filter({ email }).catch((error: any) => {
    if (createError) throw createError;
    throw error;
  });
  if (!Array.isArray(after)) throw new Error('Authorized user create verification did not return a record list.');
  const exactAfter = after.filter((row: any) => cleanEmail(row?.email) === email);
  if (exactAfter.length === 1) {
    const saved = exactAfter[0];
    const matches = Object.entries(payload).every(([key, value]) => sameValue(saved?.[key], value));
    if (!matches) throw Object.assign(new Error('Authorized user was created concurrently with different access values.'), { status: 409 });
    return { record: adminUserView(saved), status: created?.id === saved.id ? 'created' : 'recovered_after_response_loss' };
  }
  if (exactAfter.length > 1) throw Object.assign(new Error('Authorized user creation is ambiguous. Review duplicate records before retrying.'), { status: 409 });
  if (createError) throw createError;
  throw new Error('Authorized user create could not be verified.');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    if (actor?.role !== 'admin') {
      return Response.json({ error: 'Admin access is required.' }, { status: 403 });
    }

    const AuthorizedEmail = base44.asServiceRole.entities.AuthorizedEmail;
    const action = String(body?.action || '').trim();

    if (action === 'list') {
      const rows = await loadAllEntityRows({ entity: AuthorizedEmail, sort: 'email', label: 'Authorized user administration' });
      return Response.json({ users: rows.map(adminUserView) });
    }

    if (action === 'list_deletion_requests') {
      const Request = base44.asServiceRole.entities.AccountDeletionRequest;
      const rows = await loadAllEntityRows({
        entity: Request,
        sort: '-requested_at',
        label: 'Account deletion request administration',
      });
      return Response.json({ deletion_requests: rows.map(adminDeletionRequestView) });
    }

    if (action === 'resolve_deletion_request') {
      const Request = base44.asServiceRole.entities.AccountDeletionRequest;
      const result = await resolveDeletionRequest(Request, actor, body);
      return Response.json({ success: true, ...result });
    }

    if (action === 'create') {
      const result = await createUser(AuthorizedEmail, body?.data);
      return Response.json({ success: true, ...result });
    }

    const id = String(body?.id || '').trim();
    const email = cleanEmail(body?.email);
    const current = await loadTarget(AuthorizedEmail, id, email);

    if (action === 'update') {
      const desired = cleanManagedFields(body?.next_fields);
      const expectedInput = body?.expected_fields && typeof body.expected_fields === 'object' && !Array.isArray(body.expected_fields)
        ? body.expected_fields
        : {};
      const expected: Record<string, unknown> = {};
      for (const field of Object.keys(desired)) {
        expected[field] = expectedInput[field];
        if (!sameValue(current?.[field], expected[field]) && !sameValue(current?.[field], desired[field])) {
          return Response.json({ error: `Authorized user changed in another session (${field}). Reload before saving.` }, { status: 409 });
        }
      }

      if (Object.prototype.hasOwnProperty.call(desired, 'username')) {
        await ensureUsernameAvailable(AuthorizedEmail, String(desired.username || ''), id);
      }
      if (current.role === 'admin' && desired.role && desired.role !== 'admin') {
        await ensureAnotherAdminExists(AuthorizedEmail, id);
      }

      const saved = await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
        entity: AuthorizedEmail,
        user: { id, ...expected },
        nextFields: desired,
        guardFields: { email: current.email },
        label: `Authorized user ${email}`,
      });
      return Response.json({ success: true, record: adminUserView(saved) });
    }

    if (action === 'update_hr') {
      const hrData = body?.hr_data;
      if (!hrData || typeof hrData !== 'object' || Array.isArray(hrData)) {
        return Response.json({ error: 'HR data must be an object.' }, { status: 400 });
      }
      if (jsonSize(hrData) > 100_000) return Response.json({ error: 'HR data exceeds the allowed size.' }, { status: 400 });

      const expectedHrData = body?.expected_hr_data;
      if (!sameValue(current.hr_data ?? {}, expectedHrData ?? {})) {
        return Response.json({ error: 'HR data changed in another session. Reload before saving.' }, { status: 409 });
      }

      const saved = await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
        entity: AuthorizedEmail,
        user: { id, hr_data: current.hr_data },
        nextFields: { hr_data: hrData },
        guardFields: { email: current.email },
        label: `HR data for ${email}`,
      });
      return Response.json({ success: true, record: adminUserView(saved) });
    }

    if (action === 'delete') {
      const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
      if (!expectedUpdatedDate || String(current.updated_date || '') !== expectedUpdatedDate) {
        return Response.json({ error: 'Authorized user changed in another session and was not removed.' }, { status: 409 });
      }
      if (current.role === 'admin') await ensureAnotherAdminExists(AuthorizedEmail, id);

      const result = await AuthorizedEmail.deleteMany({ id, email: current.email, updated_date: expectedUpdatedDate });
      if (!result || result.deleted !== 1) {
        return Response.json({ error: 'Authorized user changed in another session and was not removed.' }, { status: 409 });
      }
      const after = await AuthorizedEmail.get(id).catch(() => null);
      if (after?.id) throw new Error('Authorized user deletion could not be verified.');
      return Response.json({ success: true, deleted: true });
    }

    return Response.json({ error: 'Invalid user administration action.' }, { status: 400 });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;
    console.error('manageAuthorizedUsers error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Authorized user administration could not be completed safely.' : error?.message,
    }, { status: safeStatus });
  }
});
