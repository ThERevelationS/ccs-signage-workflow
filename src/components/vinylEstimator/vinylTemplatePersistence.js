import { deleteEntityIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function sameValue(a, b) {
  const leftEmpty = a === null || a === undefined || a === "";
  const rightEmpty = b === null || b === undefined || b === "";
  if (leftEmpty && rightEmpty) return true;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function payloadMatches(record, payload) {
  return Boolean(record?.id) && Object.entries(payload || {}).every(([field, value]) => sameValue(record?.[field], value));
}

export async function createVinylTemplateWithRecovery({ entity, data, label = "Vinyl template", settleMs = 50 } = {}) {
  const payload = data && typeof data === "object" && !Array.isArray(data) ? data : null;
  const name = String(payload?.name || "").trim();
  if (!payload || !name || typeof entity?.create !== "function" || typeof entity?.filter !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const before = await entity.filter({ name });
  if (!Array.isArray(before)) throw new Error(`${label} preflight did not return a template list.`);
  const beforeIds = new Set(before.filter((row) => payloadMatches(row, payload)).map((row) => row.id));

  let created = null;
  let createError = null;
  try {
    created = await entity.create({ ...payload, name });
  } catch (error) {
    createError = error;
  }

  if (created?.id) {
    const verified = typeof entity.get === "function" ? await entity.get(created.id).catch(() => null) : null;
    return { record: verified?.id ? verified : created, status: "created" };
  }

  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));
  if (pause) await new Promise((resolve) => setTimeout(resolve, pause));

  let after;
  try {
    after = await entity.filter({ name });
  } catch (verificationError) {
    throw new Error(
      `${label} create response was unavailable and its recovery lookup also failed. ` +
      `Do not retry blindly; reload the template library first. ${verificationError?.message || ""}`.trim()
    );
  }
  if (!Array.isArray(after)) throw new Error(`${label} recovery did not return a template list.`);

  const newMatches = after.filter((row) => payloadMatches(row, payload) && !beforeIds.has(row.id));
  if (newMatches.length === 1) return { record: newMatches[0], status: "recovered" };
  if (newMatches.length > 1) {
    throw new Error(`${label} may have been created more than once while its create response was unavailable. No template was deleted automatically; reload and review before retrying.`);
  }
  if (createError) {
    throw new Error(`${createError?.message || `${label} could not be created.`} No matching new template was visible after recovery. Reload before retrying.`);
  }
  throw new Error(`${label} could not verify whether it was created. Reload before retrying.`);
}

export async function deleteVinylTemplateIfUnchanged({ entity, template, label = "Vinyl template deletion" } = {}) {
  if (!template?.id) throw new Error(`${label} could not find its loaded template. Reload before deleting.`);
  return deleteEntityIfUnchanged({
    entity,
    record: template,
    guardFields: { name: template.name },
    label,
  });
}
