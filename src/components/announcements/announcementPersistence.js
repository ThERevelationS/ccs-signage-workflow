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
  return Object.keys(desired || {}).every((field) => sameValue(record?.[field], desired[field]));
}

function publicationRank(record) {
  const persistedAt = Date.parse(record?.updated_date || "") || Date.parse(record?.sent_at || "") || 0;
  return [persistedAt, String(record?.id || "")];
}

function comparePublication(a, b) {
  const [aTime, aId] = publicationRank(a);
  const [bTime, bId] = publicationRank(b);
  if (aTime !== bTime) return bTime - aTime;
  return bId.localeCompare(aId);
}

async function listAll(entity) {
  if (typeof entity?.list !== "function") throw new Error("Announcement persistence could not read announcements.");
  return entity.list("-updated_date", 500);
}

export async function createAnnouncementWithRecovery({ entity, data, label = "Announcement" } = {}) {
  if (!entity || typeof entity.create !== "function") throw new Error(`${label} could not initialize its safe create.`);
  const before = await listAll(entity);
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

  const after = await listAll(entity).catch(error => {
    if (createError) throw createError;
    throw error;
  });
  const candidates = after.filter(row => !beforeIds.has(row.id) && fieldsMatch(row, data));
  if (candidates.length === 1) {
    return { record: candidates[0], status: createError ? "recovered_after_response_loss" : "created_verified" };
  }
  if (candidates.length > 1) {
    throw new Error(`${label} create is ambiguous: multiple matching rows appeared. Do not retry blindly; reload and review.`);
  }
  if (createError) throw createError;
  throw new Error(`${label} create could not be verified. Reload before retrying.`);
}

export async function updateAnnouncementIfUnchanged({ entity, record, nextFields, exactVersion = true, label = "Announcement" } = {}) {
  if (!record?.id) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: record.id,
    expectedUpdatedAt: exactVersion ? (record.updated_date || "") : "",
    expectedFields: expectedEntityFields(record, nextFields),
    nextFields,
    guardFields: {},
    label,
  });
}

export async function deleteAnnouncementIfUnchanged({ entity, record, label = "Announcement deletion" } = {}) {
  return deleteEntityIfUnchanged({
    entity,
    record,
    guardFields: {},
    label,
  });
}

async function deactivateIfStillLive({ entity, record, label }) {
  if (!record?.id || record.is_active !== true) return record;
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: record.id,
    expectedUpdatedAt: record.updated_date || "",
    expectedFields: { is_active: true },
    nextFields: { is_active: false },
    guardFields: {},
    label,
  });
}

export async function convergeToSingleLiveAnnouncement({ entity, maxPasses = 4 } = {}) {
  const passes = Math.max(1, Math.min(6, Number(maxPasses) || 4));
  for (let pass = 0; pass < passes; pass += 1) {
    const rows = await listAll(entity);
    const active = rows.filter(row => row?.is_active === true).sort(comparePublication);
    if (active.length <= 1) return { winner: active[0] || null, activeCount: active.length };

    const winner = active[0];
    for (const loser of active.slice(1)) {
      try {
        await deactivateIfStillLive({ entity, record: loser, label: `Announcement ${loser.title || loser.id} live-state convergence` });
      } catch (error) {
        const latest = typeof entity.get === "function" ? await entity.get(loser.id).catch(() => null) : null;
        if (latest?.is_active === true) throw error;
      }
    }
  }

  const finalRows = await listAll(entity);
  const finalActive = finalRows.filter(row => row?.is_active === true).sort(comparePublication);
  if (finalActive.length > 1) {
    throw new Error("Announcement live-state changed repeatedly. Multiple live announcements remain; reload before broadcasting again.");
  }
  return { winner: finalActive[0] || null, activeCount: finalActive.length };
}

export async function publishAnnouncementSafely({
  entity,
  loadedRecord = null,
  form,
  sentBy,
  sentAt = new Date().toISOString(),
  label = "Announcement broadcast",
} = {}) {
  const payload = {
    ...form,
    is_active: true,
    sent_at: sentAt,
    sent_by: sentBy || "admin",
  };

  let published;
  let createStatus = null;
  if (loadedRecord?.id) {
    published = await updateAnnouncementIfUnchanged({
      entity,
      record: loadedRecord,
      nextFields: payload,
      exactVersion: true,
      label,
    });
  } else {
    const created = await createAnnouncementWithRecovery({ entity, data: payload, label });
    published = created.record;
    createStatus = created.status;
  }

  const converged = await convergeToSingleLiveAnnouncement({ entity });
  const winner = converged.winner;
  if (!winner?.id) {
    throw new Error(`${label} could not verify a live announcement after publishing.`);
  }
  return {
    published,
    winner,
    won: winner.id === published.id,
    createStatus,
  };
}

export async function stopAnnouncementIfUnchanged({ entity, record, label = "Stop live announcement" } = {}) {
  if (!record?.id) throw new Error("The live announcement is no longer loaded. Reload before stopping it.");
  if (record.is_active !== true) return record;
  return updateAnnouncementIfUnchanged({
    entity,
    record,
    nextFields: { is_active: false },
    exactVersion: true,
    label,
  });
}
