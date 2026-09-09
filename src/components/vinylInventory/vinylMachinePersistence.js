function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function sameValue(a, b) {
  if (a !== null && a !== undefined && a !== "" && b !== null && b !== undefined && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 0.000001;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function matchesPayload(row = {}, payload = {}) {
  return Object.entries(payload).every(([key, value]) => sameValue(row?.[key], value));
}

export async function createVinylMachineWithRecovery({ entity, data, label = "Vinyl machine" } = {}) {
  const machineType = String(data?.machine_type || "").trim();
  if (!machineType || !String(data?.machine_name || "").trim() || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const readMatches = async () => {
    const rows = await entity.filter({ machine_type: machineType });
    if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
    return rows.filter((row) => matchesPayload(row, data));
  };

  const before = await readMatches();
  const beforeIds = new Set(before.map((row) => row.id));

  let created = null;
  let createError = null;
  try {
    created = await entity.create(data);
  } catch (error) {
    createError = error;
  }

  if (created?.id) {
    const saved = typeof entity.get === "function" ? await entity.get(created.id).catch(() => null) : null;
    return { record: saved?.id ? saved : created, status: "created" };
  }

  const after = await readMatches();
  const newMatches = after.filter((row) => !beforeIds.has(row.id));
  if (newMatches.length === 1) {
    return { record: newMatches[0], status: "recovered" };
  }
  if (newMatches.length > 1) {
    throw new Error(`${label} may have been created more than once while the create response was unavailable. No rows were deleted; reload and review the new matching machines before retrying.`);
  }

  if (createError) throw createError;
  throw new Error(`${label} could not verify whether it was created. Reload before retrying.`);
}
