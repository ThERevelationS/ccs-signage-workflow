import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { verifyAdminSettingsCapability } from '../../shared/adminSettingsCapability.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

const MAX_POLICY_JSON = 300_000;
const MAX_TIME_OFF_TYPES = 100;
const MAX_HOLIDAYS = 500;

function normalizeName(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function cleanPolicy(value: any) {
  const data = value && typeof value === 'object' ? value : {};
  const name = String(data.name || '').trim();
  if (!name || name.length > 500) {
    throw Object.assign(new Error('PTO policy requires a valid name.'), { status: 400 });
  }
  if (!Array.isArray(data.time_off_types) || data.time_off_types.length > MAX_TIME_OFF_TYPES) {
    throw Object.assign(new Error('PTO policy time-off types are invalid or too large.'), { status: 400 });
  }
  if (!Array.isArray(data.holidays) || data.holidays.length > MAX_HOLIDAYS) {
    throw Object.assign(new Error('PTO policy holidays are invalid or too large.'), { status: 400 });
  }
  const floatingRaw = Number(data.floating_holidays_per_year ?? 0);
  if (!Number.isFinite(floatingRaw) || floatingRaw < 0 || floatingRaw > 365) {
    throw Object.assign(new Error('Floating holidays per year is invalid.'), { status: 400 });
  }
  const cleaned = {
    name,
    is_template: data.is_template !== false,
    time_off_types: data.time_off_types,
    holidays: data.holidays,
    floating_holidays_per_year: floatingRaw,
  };
  if (JSON.stringify(cleaned).length > MAX_POLICY_JSON) {
    throw Object.assign(new Error('PTO policy is too large.'), { status: 400 });
  }
  return cleaned;
}

function normalize(value: any): any {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out: any, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function fieldsMatch(record: any, desired: Record<string, any>) {
  return Object.entries(desired || {}).every(([key, value]) =>
    JSON.stringify(normalize(record?.[key])) === JSON.stringify(normalize(value))
  );
}

async function listPolicies(Policy: any) {
  return loadAllEntityRows({ entity: Policy, sort: 'created_date', label: 'PTO policies' });
}

function nameMatches(rows: any[], name: string, excludeId = '') {
  const wanted = normalizeName(name);
  return (rows || []).filter((row) => String(row?.id || '') !== excludeId && normalizeName(row?.name) === wanted);
}

async function createPolicy(Policy: any, data: any) {
  const cleaned = cleanPolicy(data);
  const before = nameMatches(await listPolicies(Policy), cleaned.name);
  if (before.length > 1) {
    throw Object.assign(new Error(`PTO policy name “${cleaned.name}” already has duplicate records.`), { status: 409 });
  }
  if (before.length === 1) {
    if (!fieldsMatch(before[0], cleaned)) {
      throw Object.assign(new Error(`PTO policy named “${cleaned.name}” already exists with different settings.`), { status: 409 });
    }
    return { record: before[0], status: 'existing' };
  }

  let created: any = null;
  let createError: any = null;
  try { created = await Policy.create(cleaned); } catch (error) { createError = error; }
  await new Promise((resolve) => setTimeout(resolve, 40));
  const after = nameMatches(await listPolicies(Policy), cleaned.name);
  if (after.length === 1) {
    if (!fieldsMatch(after[0], cleaned)) {
      throw Object.assign(new Error('PTO policy was created concurrently with different settings.'), { status: 409 });
    }
    return { record: after[0], status: created?.id === after[0].id ? 'created' : 'verified_existing' };
  }
  if (after.length > 1) {
    throw Object.assign(new Error('PTO policy was created concurrently more than once. Reload and review duplicates.'), { status: 409 });
  }
  if (createError) throw createError;
  throw new Error('PTO policy create outcome could not be verified.');
}

async function updatePolicy(Policy: any, body: any) {
  const id = String(body?.id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  if (!id || !expectedUpdatedDate) {
    throw Object.assign(new Error('PTO policy version is required.'), { status: 400 });
  }
  const current = await Policy.get(id).catch(() => null);
  if (!current?.id) throw Object.assign(new Error('PTO policy no longer exists.'), { status: 404 });
  if (String(current.updated_date || '') !== expectedUpdatedDate) {
    throw Object.assign(new Error('PTO policy changed in another session. Reload before saving.'), { status: 409 });
  }
  const cleaned = cleanPolicy({ ...current, ...(body?.next_fields || {}) });
  const duplicates = nameMatches(await listPolicies(Policy), cleaned.name, id);
  if (duplicates.length) {
    throw Object.assign(new Error(`Another PTO policy named “${cleaned.name}” already exists.`), { status: 409 });
  }
  const result = await Policy.updateMany({ id, updated_date: expectedUpdatedDate }, { $set: cleaned });
  if (!result || result.updated !== 1) {
    throw Object.assign(new Error('PTO policy changed in another session. Reload before saving.'), { status: 409 });
  }
  const saved = await Policy.get(id).catch(() => null);
  if (!saved?.id || !fieldsMatch(saved, cleaned)) throw new Error('PTO policy update could not be verified.');
  return saved;
}

async function deletePolicy(Policy: any, Balance: any, body: any) {
  const id = String(body?.id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  if (!id || !expectedUpdatedDate) {
    throw Object.assign(new Error('PTO policy version is required.'), { status: 400 });
  }
  const current = await Policy.get(id).catch(() => null);
  if (!current?.id) return { deleted: true, already_deleted: true };
  if (String(current.updated_date || '') !== expectedUpdatedDate) {
    throw Object.assign(new Error('PTO policy changed in another session and was not deleted.'), { status: 409 });
  }
  const assigned = await Balance.filter({ policy_id: id });
  if (!Array.isArray(assigned)) throw new Error('PTO policy assignment lookup could not be verified.');
  if (assigned.length > 0) {
    throw Object.assign(new Error(`PTO policy is assigned to ${assigned.length} employee balance record${assigned.length === 1 ? '' : 's'}. Reassign those employees before deleting it.`), { status: 409 });
  }
  const result = await Policy.deleteMany({ id, updated_date: expectedUpdatedDate, name: current.name });
  if (!result || result.deleted !== 1) {
    throw Object.assign(new Error('PTO policy changed in another session and was not deleted.'), { status: 409 });
  }
  return { deleted: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    await verifyAdminSettingsCapability(base44, body?.admin_capability);

    const action = String(body?.action || '').trim();
    const Policy = base44.asServiceRole.entities.PTOPolicy;
    const Balance = base44.asServiceRole.entities.UserPTOBalance;

    if (action === 'create') return Response.json(await createPolicy(Policy, body?.data));
    if (action === 'update') return Response.json({ record: await updatePolicy(Policy, body) });
    if (action === 'delete') return Response.json(await deletePolicy(Policy, Balance, body));
    return Response.json({ error: 'Invalid PTO configuration action.' }, { status: 400 });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;
    console.error('managePTOConfig error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'PTO configuration could not be changed safely.' : error?.message,
    }, { status: safeStatus });
  }
});
