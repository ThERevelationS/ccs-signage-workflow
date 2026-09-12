import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

const MAX_LIST_ITEMS = 100;
const MAX_TEXT = 500;

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function cleanString(value: unknown, max = MAX_TEXT) {
  return String(value || '').trim().slice(0, max);
}

function cleanStringList(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) {
    throw Object.assign(new Error(`${label} must be a list with at most ${MAX_LIST_ITEMS} items.`), { status: 400 });
  }
  return [...new Set(value.map((item) => cleanString(item)).filter(Boolean))];
}

function cleanCapacityFields(value: any) {
  const source = value && typeof value === 'object' ? value : {};
  const out: any = {};

  if (Object.prototype.hasOwnProperty.call(source, 'user_name')) out.user_name = cleanString(source.user_name);

  if (Object.prototype.hasOwnProperty.call(source, 'weekly_hours_capacity')) {
    const weekly = Number(source.weekly_hours_capacity);
    if (!Number.isFinite(weekly) || weekly < 0 || weekly > 168) {
      throw Object.assign(new Error('Weekly capacity must be between 0 and 168 hours.'), { status: 400 });
    }
    out.weekly_hours_capacity = weekly;
  }

  if (Object.prototype.hasOwnProperty.call(source, 'daily_hours_capacity')) {
    const daily = Number(source.daily_hours_capacity);
    if (!Number.isFinite(daily) || daily < 0 || daily > 24) {
      throw Object.assign(new Error('Daily capacity must be between 0 and 24 hours.'), { status: 400 });
    }
    out.daily_hours_capacity = daily;
  }

  const skills = cleanStringList(source.skills, 'Skills');
  if (skills !== undefined) out.skills = skills;
  const rolePreferences = cleanStringList(source.role_preferences, 'Role preferences');
  if (rolePreferences !== undefined) out.role_preferences = rolePreferences;

  if (Object.prototype.hasOwnProperty.call(source, 'time_off_dates')) {
    if (!Array.isArray(source.time_off_dates) || source.time_off_dates.length > MAX_LIST_ITEMS) {
      throw Object.assign(new Error(`Scheduled time off must contain at most ${MAX_LIST_ITEMS} items.`), { status: 400 });
    }
    out.time_off_dates = source.time_off_dates.map((item: any) => {
      const start = cleanString(item?.start_date, 32);
      const end = cleanString(item?.end_date, 32);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
        throw Object.assign(new Error('Scheduled time off contains an invalid date range.'), { status: 400 });
      }
      return { start_date: start, end_date: end, reason: cleanString(item?.reason, 1000) };
    });
  }

  if (!Object.keys(out).length) {
    throw Object.assign(new Error('No capacity changes were supplied.'), { status: 400 });
  }
  return out;
}

async function uniqueCapacity(Capacity: any, email: string) {
  const rows = await Capacity.filter({ user_email: email });
  if (!Array.isArray(rows)) throw new Error('Capacity lookup did not return a record list.');
  const matches = rows.filter((row: any) => normalizeEmail(row?.user_email) === email);
  if (matches.length > 1) {
    throw Object.assign(new Error(`Multiple capacity records exist for ${email}. Review duplicates before saving.`), { status: 409 });
  }
  return matches[0] || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    if (user?.role !== 'admin' && user?.can_view_resources !== true) {
      return Response.json({ error: 'Resource Planning access is required.' }, { status: 403 });
    }

    const email = normalizeEmail(body?.user_email);
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'A valid employee email is required.' }, { status: 400 });
    }

    const fields = cleanCapacityFields(body?.next_fields);
    const Capacity = base44.asServiceRole.entities.UserCapacity;
    const current = await uniqueCapacity(Capacity, email);

    const expectedId = String(body?.expected_id || '').trim();
    const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();

    if (expectedId) {
      if (!current?.id || String(current.id) !== expectedId) {
        return Response.json({ error: 'Capacity record changed in another session. Reload before saving.' }, { status: 409 });
      }
      if (!expectedUpdatedDate || String(current.updated_date || '') !== expectedUpdatedDate) {
        return Response.json({ error: 'Capacity record changed in another session. Reload before saving.' }, { status: 409 });
      }
      const result = await Capacity.updateMany(
        { id: expectedId, updated_date: expectedUpdatedDate, user_email: current.user_email },
        { $set: fields },
      );
      if (!result || result.updated !== 1) {
        return Response.json({ error: 'Capacity record changed in another session. Reload before saving.' }, { status: 409 });
      }
      const saved = await Capacity.get(expectedId).catch(() => null);
      if (!saved?.id) throw new Error('Saved capacity could not be verified.');
      return Response.json({ success: true, record: saved, status: 'updated' });
    }

    if (current?.id) {
      return Response.json({ error: 'A capacity record was created in another session. Reload before saving.' }, { status: 409 });
    }

    let created: any = null;
    let createError: any = null;
    try {
      created = await Capacity.create({ user_email: email, ...fields });
    } catch (error) {
      createError = error;
    }

    const saved = await uniqueCapacity(Capacity, email);
    if (saved?.id) {
      return Response.json({ success: true, record: saved, status: created?.id === saved.id ? 'created' : 'recovered' });
    }
    if (createError) throw createError;
    throw new Error('Capacity create outcome could not be verified.');
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 409, 503].includes(status) ? status : 500;
    console.error('manageUserCapacity error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Capacity could not be saved safely.' : error?.message,
    }, { status: safeStatus });
  }
});
