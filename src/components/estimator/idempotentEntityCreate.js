const canonicalRecord = (rows = []) => [...rows].sort((a, b) => {
  const aStamp = String(a?.created_date || "");
  const bStamp = String(b?.created_date || "");
  if (aStamp !== bStamp) return aStamp.localeCompare(bStamp);
  return String(a?.id || "").localeCompare(String(b?.id || ""));
})[0] || null;

export function newCreationRequestKey(prefix = "create") {
  const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${String(prefix || "create").trim()}:${token}`;
}

export async function ensureIdempotentEntityCreate({
  entity,
  keyField = "idempotency_key",
  key,
  data,
  label = "Record",
} = {}) {
  const cleanField = String(keyField || "").trim();
  const cleanKey = String(key || "").trim();
  if (!entity?.filter || !entity?.create || !cleanField || !cleanKey) {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const load = async () => {
    const rows = await entity.filter({ [cleanField]: cleanKey });
    if (!Array.isArray(rows)) throw new Error(`${label} retry state could not be verified.`);
    return rows;
  };

  const converge = async (rows) => {
    const keep = canonicalRecord(rows);
    if (!keep?.id) return keep;
    if (rows.length < 2) return keep;
    if (!entity.delete) throw new Error(`${label} duplicate recovery could not remove a losing create.`);

    for (const row of rows) {
      if (!row?.id || row.id === keep.id) continue;
      try {
        await entity.delete(row.id);
      } catch {
        // Verify below. A lost delete response is safe if the row is actually gone.
      }
    }

    const after = await load();
    if (after.length !== 1 || after[0]?.id !== keep.id) {
      throw new Error(`${label} duplicate recovery could not converge to one verified record.`);
    }
    return after[0];
  };

  const existing = await load();
  if (existing.length) return converge(existing);

  let created = null;
  let createError = null;
  try {
    created = await entity.create({ ...data, [cleanField]: cleanKey });
  } catch (error) {
    createError = error;
  }

  let afterCreate;
  try {
    afterCreate = await load();
  } catch (verifyError) {
    if (createError) throw createError;
    throw verifyError;
  }

  if (afterCreate.length) return converge(afterCreate);
  if (createError) throw createError;
  if (created?.id) return created;
  throw new Error(`${label} was created but could not be verified. Retry to recover it safely.`);
}
