import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { verifyAdminSettingsCapability } from '../../shared/adminSettingsCapability.ts';

const EVENT_TYPES = new Set(['company', 'install', 'survey', 'meeting', 'deadline', 'holiday', 'personal', 'other']);
const RECURRENCES = new Set(['none', 'daily', 'weekly', 'monthly', 'yearly']);
const SOURCES = new Set(['manual', 'outlook', 'google']);
const STATUSES = new Set(['confirmed', 'tentative', 'cancelled']);

function cleanText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

function cleanDateTime(value: unknown, field: string, required = false) {
  const text = cleanText(value, 100);
  if (!text) {
    if (required) throw Object.assign(new Error(`${field} is required.`), { status: 400 });
    return '';
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) throw Object.assign(new Error(`${field} is invalid.`), { status: 400 });
  return new Date(parsed).toISOString();
}

function cleanDate(value: unknown, field: string) {
  const text = cleanText(value, 20);
  if (!text) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw Object.assign(new Error(`${field} is invalid.`), { status: 400 });
  return text;
}

function cleanEmails(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => cleanText(item, 320).toLowerCase())
    .filter(Boolean))]
    .slice(0, 500);
}

function cleanEvent(value: any) {
  const data = value && typeof value === 'object' ? value : {};
  const title = cleanText(data.title, 500);
  const start = cleanDateTime(data.start_datetime, 'Event start', true);
  const end = cleanDateTime(data.end_datetime || start, 'Event end', true);
  const eventType = EVENT_TYPES.has(String(data.event_type || 'company')) ? String(data.event_type || 'company') : 'company';
  const recurrence = RECURRENCES.has(String(data.recurrence || 'none')) ? String(data.recurrence || 'none') : 'none';
  const source = SOURCES.has(String(data.external_source || 'manual')) ? String(data.external_source || 'manual') : 'manual';
  const status = STATUSES.has(String(data.status || 'confirmed')) ? String(data.status || 'confirmed') : 'confirmed';
  const reminderRaw = Number(data.reminder_minutes);
  return {
    title,
    description: cleanText(data.description, 20_000),
    start_datetime: start,
    end_datetime: end,
    all_day: Boolean(data.all_day),
    event_type: eventType,
    color: cleanText(data.color, 32) || '#7C3AED',
    location: cleanText(data.location, 1000),
    assigned_to: cleanEmails(data.assigned_to),
    work_order_id: cleanText(data.work_order_id, 200),
    work_order_title: cleanText(data.work_order_title, 1000),
    is_universal: data.is_universal !== false,
    recurrence,
    recurrence_end_date: cleanDate(data.recurrence_end_date, 'Recurrence end date'),
    external_id: cleanText(data.external_id, 1000),
    external_source: source,
    reminder_minutes: Number.isFinite(reminderRaw) ? Math.max(0, Math.min(10080, Math.round(reminderRaw))) : 30,
    status,
  };
}

function normalize(value: any): any {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out: any, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function fieldsMatch(row: any, desired: Record<string, any>) {
  return Object.entries(desired).every(([key, value]) => JSON.stringify(normalize(row?.[key])) === JSON.stringify(normalize(value)));
}

async function createWithRecovery(CalendarEvent: any, data: any) {
  if (!data.title || !data.start_datetime) throw Object.assign(new Error('Event title and start are required.'), { status: 400 });
  const identity = { title: data.title, start_datetime: data.start_datetime };
  const before = await CalendarEvent.filter(identity);
  if (!Array.isArray(before)) throw new Error('Calendar event preflight did not return a record list.');
  const beforeIds = new Set(before.map((row: any) => row?.id).filter(Boolean));

  let created: any = null;
  let createError: any = null;
  try { created = await CalendarEvent.create(data); } catch (error) { createError = error; }

  if (created?.id) {
    const verified = await CalendarEvent.get(created.id).catch(() => null);
    if (verified?.id && fieldsMatch(verified, data)) return { record: verified, status: 'created' };
  }

  const after = await CalendarEvent.filter(identity).catch((error: any) => {
    if (createError) throw createError;
    throw error;
  });
  if (!Array.isArray(after)) throw new Error('Calendar event create verification did not return a record list.');
  const candidates = after.filter((row: any) => !beforeIds.has(row.id) && fieldsMatch(row, data));
  if (candidates.length === 1) return { record: candidates[0], status: createError ? 'recovered_after_response_loss' : 'created_verified' };
  if (candidates.length > 1) throw Object.assign(new Error('Calendar event creation is ambiguous. Reload and review before retrying.'), { status: 409 });
  if (createError) throw createError;
  throw new Error('Calendar event create outcome could not be verified.');
}

async function updateExact(CalendarEvent: any, body: any) {
  const id = cleanText(body?.id, 200);
  const expected = cleanText(body?.expected_updated_date, 200);
  if (!id || !expected) throw Object.assign(new Error('Calendar event version is required.'), { status: 400 });
  const current = await CalendarEvent.get(id).catch(() => null);
  if (!current?.id) throw Object.assign(new Error('Calendar event no longer exists.'), { status: 404 });
  if (String(current.updated_date || '') !== expected) throw Object.assign(new Error('Calendar event changed in another session. Reload before saving.'), { status: 409 });
  const next = cleanEvent({ ...current, ...(body?.next_fields || {}) });
  const result = await CalendarEvent.updateMany({ id, updated_date: expected }, { $set: next });
  if (!result || result.updated !== 1) throw Object.assign(new Error('Calendar event changed in another session. Reload before saving.'), { status: 409 });
  const saved = await CalendarEvent.get(id).catch(() => null);
  if (!saved?.id || !fieldsMatch(saved, next)) throw new Error('Calendar event update could not be verified.');
  return saved;
}

async function deleteExact(CalendarEvent: any, body: any) {
  const id = cleanText(body?.id, 200);
  const expected = cleanText(body?.expected_updated_date, 200);
  if (!id || !expected) throw Object.assign(new Error('Calendar event version is required.'), { status: 400 });
  const current = await CalendarEvent.get(id).catch(() => null);
  if (!current?.id) return { deleted: true, already_deleted: true };
  if (String(current.updated_date || '') !== expected) throw Object.assign(new Error('Calendar event changed in another session and was not deleted.'), { status: 409 });
  const result = await CalendarEvent.deleteMany({ id, updated_date: expected });
  if (!result || result.deleted !== 1) throw Object.assign(new Error('Calendar event changed in another session and was not deleted.'), { status: 409 });
  return { deleted: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    await verifyAdminSettingsCapability(base44, body?.admin_capability);
    const action = String(body?.action || '').trim();
    const CalendarEvent = base44.asServiceRole.entities.CalendarEvent;

    if (action === 'create') return Response.json(await createWithRecovery(CalendarEvent, cleanEvent(body?.data)));
    if (action === 'update') return Response.json({ record: await updateExact(CalendarEvent, body) });
    if (action === 'delete') return Response.json(await deleteExact(CalendarEvent, body));
    return Response.json({ error: 'Invalid calendar event action.' }, { status: 400 });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;
    console.error('manageCalendarEvents error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Calendar event could not be changed safely.' : error?.message,
    }, { status: safeStatus });
  }
});
