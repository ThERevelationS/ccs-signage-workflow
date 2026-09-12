import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

const VALID_VIEWS = new Set(['month', 'week', 'day', 'agenda']);
const VALID_COLOR_SCHEMES = new Set(['default', 'colorblind', 'dark']);
const MAX_STAGES = 50;

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function cleanString(value: unknown, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function cleanSettings(value: any) {
  const source = value && typeof value === 'object' ? value : {};
  const out: any = {};
  for (const field of ['show_universal', 'show_work_orders', 'show_site_surveys', 'show_installs', 'show_personal', 'outlook_connected', 'google_connected']) {
    if (Object.prototype.hasOwnProperty.call(source, field)) out[field] = source[field] === true;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'default_view')) {
    const view = cleanString(source.default_view, 32);
    if (!VALID_VIEWS.has(view)) throw Object.assign(new Error('Invalid calendar default view.'), { status: 400 });
    out.default_view = view;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'color_scheme')) {
    const scheme = cleanString(source.color_scheme, 32);
    if (!VALID_COLOR_SCHEMES.has(scheme)) throw Object.assign(new Error('Invalid calendar color scheme.'), { status: 400 });
    out.color_scheme = scheme;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'work_order_stages')) {
    if (!Array.isArray(source.work_order_stages) || source.work_order_stages.length > MAX_STAGES) {
      throw Object.assign(new Error(`Work order stage filters must contain at most ${MAX_STAGES} items.`), { status: 400 });
    }
    out.work_order_stages = [...new Set(source.work_order_stages.map((item: unknown) => cleanString(item, 100)).filter(Boolean))];
  }
  if (Object.prototype.hasOwnProperty.call(source, 'outlook_calendar_id')) out.outlook_calendar_id = cleanString(source.outlook_calendar_id, 500);
  if (Object.prototype.hasOwnProperty.call(source, 'google_calendar_id')) out.google_calendar_id = cleanString(source.google_calendar_id, 500);
  if (!Object.keys(out).length) throw Object.assign(new Error('No calendar setting changes were supplied.'), { status: 400 });
  return out;
}

async function loadUnique(Settings: any, email: string) {
  const rows = await Settings.filter({ user_email: email });
  if (!Array.isArray(rows)) throw new Error('Calendar settings lookup did not return a record list.');
  const matches = rows.filter((row: any) => normalizeEmail(row?.user_email) === email);
  if (matches.length > 1) {
    throw Object.assign(new Error('Multiple calendar settings records exist for this user. Review duplicates before saving.'), { status: 409 });
  }
  return matches[0] || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const email = normalizeEmail(user?.email);
    if (!email) return Response.json({ error: 'Authentication required.' }, { status: 401 });

    const Settings = base44.asServiceRole.entities.UserCalendarSettings;
    const action = String(body?.action || 'load').trim();

    if (action === 'load') {
      const record = await loadUnique(Settings, email);
      return Response.json({ success: true, record });
    }

    if (action !== 'save') {
      return Response.json({ error: 'Invalid calendar settings action.' }, { status: 400 });
    }

    const fields = cleanSettings(body?.next_settings);
    const current = await loadUnique(Settings, email);
    const expectedId = String(body?.expected_id || '').trim();
    const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();

    if (expectedId) {
      if (!current?.id || String(current.id) !== expectedId || !expectedUpdatedDate || String(current.updated_date || '') !== expectedUpdatedDate) {
        return Response.json({ error: 'Your calendar settings changed in another session. Reload before saving.' }, { status: 409 });
      }
      const result = await Settings.updateMany(
        { id: expectedId, user_email: current.user_email, updated_date: expectedUpdatedDate },
        { $set: fields },
      );
      if (!result || result.updated !== 1) {
        return Response.json({ error: 'Your calendar settings changed in another session. Reload before saving.' }, { status: 409 });
      }
      const saved = await Settings.get(expectedId).catch(() => null);
      if (!saved?.id) throw new Error('Saved calendar settings could not be verified.');
      return Response.json({ success: true, record: saved, status: 'updated' });
    }

    if (current?.id) {
      return Response.json({ error: 'Your calendar settings were created in another session. Reload before saving.' }, { status: 409 });
    }

    let created: any = null;
    let createError: any = null;
    try {
      created = await Settings.create({ user_email: email, ...fields });
    } catch (error) {
      createError = error;
    }

    const saved = await loadUnique(Settings, email);
    if (saved?.id) {
      return Response.json({ success: true, record: saved, status: created?.id === saved.id ? 'created' : 'recovered' });
    }
    if (createError) throw createError;
    throw new Error('Calendar settings create outcome could not be verified.');
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 409, 503].includes(status) ? status : 500;
    console.error('manageUserCalendarSettings error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Calendar settings could not be handled safely.' : error?.message,
    }, { status: safeStatus });
  }
});
