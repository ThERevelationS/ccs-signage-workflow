import { base44 } from "@/api/base44Client";

function requireAdminCapability(adminCapability, label) {
  const token = String(adminCapability || "").trim();
  if (!token) throw new Error(`${label} requires an active Admin Settings authorization.`);
  return token;
}

async function invokeCalendarEvent(payload) {
  try {
    const response = await base44.functions.invoke("manageCalendarEvents", payload);
    return response?.data || response;
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.message || "Calendar event could not be changed safely.");
  }
}

export function calendarEventFieldsFromForm(form = {}) {
  const fields = {
    title: form.title,
    description: form.description,
    start_datetime: form.start_datetime,
    end_datetime: form.end_datetime,
    all_day: form.all_day,
    event_type: form.event_type,
    color: form.color,
    location: form.location,
    assigned_to: form.assigned_to,
    work_order_id: form.work_order_id,
    work_order_title: form.work_order_title,
    is_universal: form.is_universal,
    recurrence: form.recurrence,
    recurrence_end_date: form.recurrence_end_date,
    external_id: form.external_id,
    external_source: form.external_source,
    reminder_minutes: form.reminder_minutes,
    travel_buffer_minutes: form.travel_buffer_minutes,
    status: form.status,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

export async function createCalendarEventWithRecovery({ data, adminCapability, label = "Calendar event" } = {}) {
  const result = await invokeCalendarEvent({
    action: "create",
    data,
    admin_capability: requireAdminCapability(adminCapability, label),
  });
  if (!result?.record?.id) throw new Error(`${label} create could not be verified.`);
  return result;
}

export async function updateCalendarEventIfUnchanged({ event, nextFields, adminCapability, label = "Calendar event" } = {}) {
  if (!event?.id || !event?.updated_date) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  const result = await invokeCalendarEvent({
    action: "update",
    id: event.id,
    expected_updated_date: event.updated_date,
    next_fields: nextFields,
    admin_capability: requireAdminCapability(adminCapability, label),
  });
  if (!result?.record?.id) throw new Error(`${label} update could not be verified.`);
  return result.record;
}

export async function deleteCalendarEventIfUnchanged({ event, adminCapability, label = "Calendar event deletion" } = {}) {
  if (!event?.id || !event?.updated_date) throw new Error(`${label} is no longer loaded. Reload before deleting.`);
  return invokeCalendarEvent({
    action: "delete",
    id: event.id,
    expected_updated_date: event.updated_date,
    admin_capability: requireAdminCapability(adminCapability, label),
  });
}
