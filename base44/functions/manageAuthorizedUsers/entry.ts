import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { replaceAuthorizedEmailCredentialFieldsIfUnchanged } from '../../shared/authorizedEmailCredentialPersistence.mjs';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { runDeletionImpactChecks } from '../../shared/deletionImpactBoundedChecks.mjs';

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
    can_order_export: row?.role === 'admin' && row?.can_order_export === true,
    can_view_resources: row?.can_view_resources === true,
    can_approve_quotes: row?.can_approve_quotes === true,
    employment_type: row?.employment_type || 'hourly',
    can_work_pause: row?.can_work_pause === true,
    is_full_admin: row?.is_full_admin === true,
    admin_permissions: row?.admin_permissions && typeof row.admin_permissions === 'object' && !Array.isArray(row.admin_permissions) ? row.admin_permissions : {},
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
  if (Object.prototype.hasOwnProperty.call(input, 'can_order_export')) out.can_order_export = input.can_order_export === true;
  if (Object.prototype.hasOwnProperty.call(input, 'can_view_resources')) out.can_view_resources = input.can_view_resources === true;
  if (Object.prototype.hasOwnProperty.call(input, 'can_approve_quotes')) out.can_approve_quotes = input.can_approve_quotes === true;
  if (Object.prototype.hasOwnProperty.call(input, 'employment_type')) {
    const employmentType = String(input.employment_type || '');
    if (!EMPLOYMENT_TYPES.has(employmentType)) throw Object.assign(new Error('Employment type is invalid.'), { status: 400 });
    out.employment_type = employmentType;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'can_work_pause')) out.can_work_pause = input.can_work_pause === true;
  if (Object.prototype.hasOwnProperty.call(input, 'is_full_admin')) out.is_full_admin = input.is_full_admin === true;
  if (Object.prototype.hasOwnProperty.call(input, 'admin_permissions')) {
    const perms = input.admin_permissions;
    if (!perms || typeof perms !== 'object' || Array.isArray(perms) || JSON.stringify(perms).length > 20000) {
      throw Object.assign(new Error('Admin permissions are invalid.'), { status: 400 });
    }
    out.admin_permissions = perms;
  }

  if (!Object.keys(out).length) throw Object.assign(new Error('No supported user fields were supplied.'), { status: 400 });
  if (out.role === 'admin') out.can_view_resources = true;
  if (out.role === 'user') out.can_order_export = false;
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

const DELETION_HISTORY_ENTITIES = [
  'TimeEntry',
  'TimeClockAudit',
  'TimeOffRequest',
  'TimeClockBreak',
  'TimeClockWorkPause',
  'TimeClockCorrectionRequest',
  'TimeClockLaborSegment',
  'ImportJob',
];

const DELETION_ACCOUNT_STATE_ENTITIES = [
  'TimeClockEmployeeState',
  'TimeClockBadge',
  'UserPTOBalance',
  'UserCalendarSettings',
  'UserCapacity',
  'UserCredential',
  'FleetDashboardPreference',
];

const DELETION_OWNER_ENTITIES = [
  'AllInOneEstimate',
  'BuilderProduct',
  'BuilderPart',
  'BuilderPartGroup',
  'QuickProduct',
  'PartTemplate',
  'ProjectTemplate',
  'EstimateClipboardItem',
  'CustomerSummary',
  'FoundationProject',
  'ChannelLetterInstallation',
  'VinylProject',
  'CNCProject',
  'LaserProject',
  'MetalProject',
  'MaintenanceProject',
  'Project',
  'BrickStoneProject',
  'Report',
  'SaveColor',
];

const WORK_ORDER_IDENTITY_KEYS = new Set([
  'assigned_to',
  'current_task_assigned_to',
  'designer',
  'surveyor',
  'project_manager',
  'estimator',
  'sales_rep',
  'created_by',
  'uploaded_by',
]);

function identityValueMatches(value: unknown, identities: Set<string>): boolean {
  if (Array.isArray(value)) return value.some((item) => identityValueMatches(item, identities));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) => identityValueMatches(item, identities));
  }
  const normalized = String(value || '').trim().toLowerCase();
  return normalized ? identities.has(normalized) : false;
}

function recordReferencesIdentity(value: unknown, identities: Set<string>, keys: Set<string>): boolean {
  if (Array.isArray(value)) return value.some((item) => recordReferencesIdentity(item, identities, keys));
  if (!value || typeof value !== 'object') return false;

  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    if (keys.has(key) && identityValueMatches(child, identities)) return true;
    return recordReferencesIdentity(child, identities, keys);
  });
}

async function countEntityRows(base44: any, entityName: string, query: Record<string, unknown>) {
  const entity = base44.asServiceRole.entities[entityName];
  if (!entity) throw new Error(`${entityName} is unavailable for deletion impact review.`);
  const rows = await loadAllEntityRows({
    entity,
    query,
    sort: null,
    label: `${entityName} deletion impact review`,
  });
  return rows.length;
}

async function countIdentityReferences(base44: any, entityName: string, identities: Set<string>, keys: Set<string>) {
  const entity = base44.asServiceRole.entities[entityName];
  if (!entity) throw new Error(`${entityName} is unavailable for deletion impact review.`);
  const rows = await loadAllEntityRows({
    entity,
    sort: null,
    label: `${entityName} identity reference review`,
  });
  return rows.filter((row: any) => recordReferencesIdentity(row, identities, keys)).length;
}

async function deletionImpactReport(base44: any, Request: any, requestId: string, directTarget: any = null) {
  let request: any = null;
  if (requestId) {
    request = await Request.get(requestId).catch(() => null);
    if (!request?.id) throw Object.assign(new Error('Deletion request no longer exists.'), { status: 404 });
  }

  const email = cleanEmail(request?.user_email || directTarget?.email);
  const authorizedId = String(request?.authorized_email_id || directTarget?.authorized_id || '').trim();
  if (!email || !authorizedId) {
    throw Object.assign(new Error('Deletion target identity is incomplete.'), { status: 409 });
  }

  const authorized = await base44.asServiceRole.entities.AuthorizedEmail.get(authorizedId).catch(() => null);
  const authorizedMatches = !!authorized?.id && cleanEmail(authorized.email) === email;
  const displayName = cleanText(authorized?.full_name || request?.user_name || directTarget?.name, 500);
  const identities = new Set([email, displayName.toLowerCase()].filter(Boolean));

  const base44UsersRaw = await base44.asServiceRole.entities.User.filter({ email });
  if (!Array.isArray(base44UsersRaw)) throw new Error('Base44 user identity lookup could not be verified.');
  const base44Users = base44UsersRaw.filter((row: any) => cleanEmail(row?.email) === email);
  const base44UserIds = [...new Set(base44Users.map((row: any) => String(row?.id || '').trim()).filter(Boolean))];

  // Run independent read-only count operations together, but limit in-flight
  // entity queries. This avoids large ownership fan-outs and preserves every
  // category's order and all-or-nothing report semantics.
  const checks = [
    ...DELETION_HISTORY_ENTITIES.map(entity => async () => ({
      group: 'history', entity,
      count: await countEntityRows(base44, entity, { user_email: email }),
    })),
    ...DELETION_ACCOUNT_STATE_ENTITIES.map(entity => async () => ({
      group: 'account_state', entity,
      count: await countEntityRows(base44, entity, { user_email: email }),
    })),
    ...DELETION_OWNER_ENTITIES.map(entity => async () => ({
      group: 'ownership', entity,
      count: base44UserIds.length
        ? await countEntityRows(base44, entity, { created_by_id: { $in: base44UserIds } })
        : 0,
    })),
    async () => ({
      group: 'assignments', entity: 'WorkOrder',
      count: await countIdentityReferences(base44, 'WorkOrder', identities, new Set(WORK_ORDER_IDENTITY_KEYS)),
    }),
    async () => ({
      group: 'assignments', entity: 'GeneralTask',
      count: await countIdentityReferences(base44, 'GeneralTask', identities, new Set(['assigned_to', 'created_by_name'])),
    }),
    async () => ({
      group: 'assignments', entity: 'CalendarEvent',
      count: await countIdentityReferences(base44, 'CalendarEvent', identities, new Set(['assigned_to', 'created_by'])),
    }),
  ];
  const completed = await runDeletionImpactChecks(checks, 5);
  const reportRows = (group: string) => completed
    .filter((item) => item.group === group)
    .map(({ entity, count }) => ({ entity, count }));
  const history = reportRows('history');
  const accountState = reportRows('account_state');
  const ownership = reportRows('ownership');
  const [workOrders, generalTasks, calendarEvents] =
    reportRows('assignments').map((item) => item.count);

  const blockers: string[] = [];
  if (!authorizedMatches) blockers.push('The AuthorizedEmail record no longer matches this request.');
  if (base44Users.length > 1) blockers.push('Multiple Base44 User records share this email and must be reconciled before any identity removal.');
  if (history.some((item) => item.count > 0)) blockers.push('Payroll/timekeeping history exists and must be preserved.');
  if (ownership.some((item) => item.count > 0)) blockers.push('Base44-owned estimator records exist and must be preserved or explicitly transferred.');
  if (workOrders + generalTasks + calendarEvents > 0) blockers.push('Live workflow/task/calendar references exist and need reassignment or archival treatment.');

  return {
    request: request ? adminDeletionRequestView(request) : null,
    target: {
      authorized_email_id: authorizedId,
      authorized_email_exists: authorizedMatches,
      email,
      full_name: displayName || null,
      base44_user_count: base44Users.length,
      base44_user_ids: base44UserIds,
    },
    history,
    account_state: accountState,
    ownership,
    assignments: {
      WorkOrder: workOrders,
      GeneralTask: generalTasks,
      CalendarEvent: calendarEvents,
    },
    blockers,
    read_only: true,
  };
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
    resolution_source_updated_date: row?.resolution_source_updated_date ?? null,
    admin_notes: row?.admin_notes ?? '',
    created_date: row?.created_date,
    updated_date: row?.updated_date,
  };
}

async function resolveDeletionRequest(Request: any, actor: any, body: any) {
  const id = String(body?.request_id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  const expectedEmail = cleanEmail(body?.expected_user_email);
  const expectedAuthorizedId = String(body?.expected_authorized_email_id || '').trim();
  const resolution = String(body?.resolution || '').trim().toLowerCase();
  const adminNotes = cleanText(body?.admin_notes, 2000);

  if (!id || !expectedUpdatedDate || !expectedEmail || !expectedAuthorizedId) {
    throw Object.assign(new Error('Deletion request identity and version are required.'), { status: 400 });
  }
  if (!['processed', 'cancelled'].includes(resolution)) {
    throw Object.assign(new Error('Deletion request resolution is invalid.'), { status: 400 });
  }

  const current = await Request.get(id).catch(() => null);
  if (!current?.id) throw Object.assign(new Error('Deletion request no longer exists.'), { status: 404 });
  if (cleanEmail(current.user_email) !== expectedEmail ||
      String(current.authorized_email_id || '').trim() !== expectedAuthorizedId) {
    throw Object.assign(new Error('Deletion request identity changed. Reload before resolving it.'), { status: 409 });
  }

  const actorEmail = cleanEmail(actor?.email);
  if (!actorEmail) {
    throw Object.assign(new Error('Administrator identity could not be verified.'), { status: 403 });
  }
  const isSameDecision = (row: any) =>
    row?.status === resolution &&
    cleanEmail(row?.user_email) === expectedEmail &&
    String(row?.authorized_email_id || '').trim() === expectedAuthorizedId &&
    String(row?.resolution_source_updated_date || '') === expectedUpdatedDate &&
    cleanEmail(row?.processed_by) === actorEmail &&
    String(row?.admin_notes || '') === adminNotes;

  if (isSameDecision(current)) {
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
    resolution_source_updated_date: expectedUpdatedDate,
    admin_notes: adminNotes,
  };
  const result = await Request.updateMany(
    {
      id, updated_date: expectedUpdatedDate, status: 'pending',
      user_email: current.user_email,
      authorized_email_id: current.authorized_email_id,
    },
    { $set: patch },
  );
  if (!result || result.updated !== 1) {
    // Two identical submissions can race after reading the same pending row.
    // Recover only the exact decision from that original pending version.
    const afterConflict = await Request.get(id).catch(() => null);
    if (isSameDecision(afterConflict)) {
      return { record: adminDeletionRequestView(afterConflict), reused: true };
    }
    throw Object.assign(new Error('Deletion request changed while it was being resolved. Reload before retrying.'), { status: 409 });
  }

  const saved = await Request.get(id).catch(() => null);
  if (
    !saved?.id ||
    saved.status !== resolution ||
    cleanEmail(saved.user_email) !== expectedEmail ||
    String(saved.authorized_email_id || '').trim() !== expectedAuthorizedId ||
    String(saved.resolution_source_updated_date || '') !== expectedUpdatedDate ||
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
    can_order_export: role === 'admin' && input?.can_order_export === true,
    can_view_resources: role === 'admin' ? true : input?.can_view_resources === true,
    employment_type: EMPLOYMENT_TYPES.has(String(input?.employment_type || 'hourly')) ? String(input.employment_type || 'hourly') : 'hourly',
    can_work_pause: input?.can_work_pause === true,
    can_approve_quotes: input?.can_approve_quotes === true,
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

    if (action === 'deletion_impact') {
      const Request = base44.asServiceRole.entities.AccountDeletionRequest;
      const requestId = String(body?.request_id || '').trim();
      if (!requestId) {
        // Direct pre-delete check: the Remove User dialog verifies impact
        // without requiring an employee-initiated deletion request.
        const email = cleanEmail(body?.user_email);
        const authorizedId = String(body?.authorized_email_id || '').trim();
        if (!email || !authorizedId) {
          return Response.json({ error: 'Deletion impact requires a request_id or a user identity.' }, { status: 400 });
        }
        const impact = await deletionImpactReport(base44, Request, '', { email, authorized_id: authorizedId, name: body?.user_name });
        return Response.json({ success: true, impact });
      }
      const impact = await deletionImpactReport(base44, Request, requestId);
      return Response.json({ success: true, impact });
    }

    if (action === 'resolve_deletion_request') {
      const Request = base44.asServiceRole.entities.AccountDeletionRequest;
      const result = await resolveDeletionRequest(Request, actor, body);
      return Response.json({ success: true, ...result });
    }

    if (action === 'create') {
      const createWantsAdmin = String(body?.data?.role || '') === 'admin' || body?.data?.is_full_admin === true || Object.prototype.hasOwnProperty.call(body?.data || {}, 'admin_permissions');
      if (createWantsAdmin && actor?.is_full_admin !== true) {
        return Response.json({ error: 'Only a full admin can create administrator accounts.' }, { status: 403 });
      }
      const result = await createUser(AuthorizedEmail, body?.data);
      return Response.json({ success: true, ...result });
    }

    const id = String(body?.id || '').trim();
    const email = cleanEmail(body?.email);
    const current = await loadTarget(AuthorizedEmail, id, email);

    if (action === 'update') {
      const desired = cleanManagedFields(body?.next_fields);
      const touchesPrivilege = Object.prototype.hasOwnProperty.call(desired, 'role') ||
        Object.prototype.hasOwnProperty.call(desired, 'is_full_admin') ||
        Object.prototype.hasOwnProperty.call(desired, 'admin_permissions');
      if (touchesPrivilege && actor?.is_full_admin !== true) {
        return Response.json({ error: 'Only a full admin can change roles or admin privileges.' }, { status: 403 });
      }
      const roleBoundPermission = Object.prototype.hasOwnProperty.call(desired, 'can_order_export') ||
        Object.prototype.hasOwnProperty.call(desired, 'can_view_resources');
      // Existing clients may not supply expected_role. They still receive a
      // conditional role guard from the loaded record at persistence time.
      const expectedRole = String(body?.expected_role || '').trim();
      if (roleBoundPermission && expectedRole && expectedRole !== current.role) {
        return Response.json({ error: 'Authorized user changed in another session (role). Reload before saving.' }, { status: 409 });
      }
      // Changing only a permission must not disable Resources for admins.
      if ((desired.role || current.role) === 'admin' && desired.can_view_resources === false) {
        return Response.json({ error: 'Administrator Resources access cannot be disabled.' }, { status: 403 });
      }
      // The Order Form export grant is separate from broad import/export.
      // Role demotion revokes it, and no non-admin may retain or request it.
      if (desired.can_order_export === true && (desired.role || current.role) !== 'admin') {
        return Response.json({ error: 'Order Form export requires an admin account.' }, { status: 403 });
      }
      if (desired.role === 'user') desired.can_order_export = false;
      const expectedInput = body?.expected_fields && typeof body.expected_fields === 'object' && !Array.isArray(body.expected_fields)
        ? body.expected_fields
        : {};
      const expected: Record<string, unknown> = {};
      for (const field of Object.keys(desired)) {
        // Existing users predate the Order Export field. Its absent stored
        // value means false, but the conditional write must retain the actual
        // absent baseline rather than falsely treating it as a conflict.
        const legacyUnsetOrderExport = field === 'can_order_export' && current?.[field] == null;
        const currentValue = legacyUnsetOrderExport ? false : current?.[field];
        if (!sameValue(currentValue, expectedInput[field]) && !sameValue(currentValue, desired[field])) {
          return Response.json({ error: `Authorized user changed in another session (${field}). Reload before saving.` }, { status: 409 });
        }
        expected[field] = legacyUnsetOrderExport ? current?.[field] : expectedInput[field];
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
        guardFields: {
          email: current.email,
          ...(roleBoundPermission ? { role: expectedRole || current.role } : {})
        },
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
    // The bounded read-only impact scanner has a known, non-sensitive timeout.
    // Surface only this exact deadline failure to coordinate safe UI retries.
    const impactTimedOut = error?.message === 'Deletion impact scan deadline exceeded; no report was verified.';
    const status = Number(error?.status || 500);
    const safeStatus = impactTimedOut ? 503 : [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;
    console.error('manageAuthorizedUsers error:', error?.message || error);
    return Response.json({
      error: impactTimedOut
        ? 'Account deletion impact scan timed out. No report was verified.'
        : safeStatus === 500 ? 'Authorized user administration could not be completed safely.' : error?.message,
    }, { status: safeStatus });
  }
});