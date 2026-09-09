import {
  deleteEntityIfUnchanged,
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function sameValue(a, b) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function fieldsMatch(record, desired) {
  return Object.entries(desired || {}).every(([field, value]) => sameValue(record?.[field], value));
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
    status: form.status,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

export async function createCalendarEventWithRecovery({ entity, data, label = "Calendar event" } = {}) {
  if (!entity || typeof entity.create !== "function" || typeof entity.filter !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }
  const identity = {
    title: data?.title,
    start_datetime: data?.start_datetime,
  };
  if (!identity.title || !identity.start_datetime) {
    throw new Error(`${label} requires a title and start date before it can be created.`);
  }

  const before = await entity.filter(identity);
  if (!Array.isArray(before)) throw new Error(`${label} preflight did not return a record list.`);
  const beforeIds = new Set(before.map(row => row?.id).filter(Boolean));

  let created = null;
  let createError = null;
  try {
    created = await entity.create(data);
  } catch (error) {
    createError = error;
  }

  if (created?.id) {
    const verified = typeof entity.get === "function" ? await entity.get(created.id).catch(() => null) : created;
    if (verified?.id && fieldsMatch(verified, data)) return { record: verified, status: "created" };
  }

  let after;
  try {
    after = await entity.filter(identity);
  } catch (verifyError) {
    if (createError) throw createError;
    throw verifyError;
  }
  if (!Array.isArray(after)) throw new Error(`${label} final verification did not return a record list.`);
  const candidates = after.filter(row => !beforeIds.has(row.id) && fieldsMatch(row, data));
  if (candidates.length === 1) {
    return { record: candidates[0], status: createError ? "recovered_after_response_loss" : "created_verified" };
  }
  if (candidates.length > 1) {
    throw new Error(`${label} create is ambiguous: multiple identical new events appeared. No event was deleted automatically; reload and review before retrying.`);
  }
  if (createError) throw createError;
  throw new Error(`${label} could not verify whether the event was created. Reload before retrying.`);
}

export async function updateCalendarEventIfUnchanged({ entity, event, nextFields, label = "Calendar event" } = {}) {
  if (!event?.id) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: event.id,
    expectedUpdatedAt: event.updated_date || "",
    expectedFields: expectedEntityFields(event, nextFields),
    nextFields,
    guardFields: {},
    label,
  });
}

export async function deleteCalendarEventIfUnchanged({ entity, event, label = "Calendar event deletion" } = {}) {
  if (!event?.id) throw new Error(`${label} is no longer loaded. Reload before deleting.`);
  return deleteEntityIfUnchanged({
    entity,
    record: event,
    guardFields: {},
    label,
  });
}
