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
  return Object.entries(payload).every(([field, value]) => sameValue(row?.[field], value));
}

export async function createQuickPriceProjectWithRecovery({ entity, data, label = "Quick Price project" } = {}) {
  const projectName = String(data?.project_name || "").trim();
  const clientName = String(data?.client_name || "").trim();
  if (!projectName || !clientName || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const readMatches = async () => {
    const rows = await entity.filter({ project_name: projectName, client_name: clientName, status: data.status || "draft" });
    if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
    return rows.filter((row) => matchesPayload(row, data));
  };

  const before = await readMatches();
  const beforeIds = new Set(before.map((row) => row?.id).filter(Boolean));

  let created = null;
  let createError = null;
  try {
    created = await entity.create(data);
  } catch (error) {
    createError = error;
  }

  if (created?.id) {
    const verified = typeof entity.get === "function" ? await entity.get(created.id).catch(() => null) : null;
    if (verified?.id && !matchesPayload(verified, data)) {
      throw new Error(`${label} was created but its stored identity no longer matches this request. Reload before retrying.`);
    }
    return { record: verified?.id ? verified : created, status: "created" };
  }

  const after = await readMatches();
  const newMatches = after.filter((row) => !beforeIds.has(row?.id));
  if (newMatches.length === 1) return { record: newMatches[0], status: "recovered" };
  if (newMatches.length > 1) {
    throw new Error(`${label} may have been created more than once while the response was unavailable. No project records were deleted; review the matching drafts before retrying.`);
  }

  if (createError) throw createError;
  throw new Error(`${label} could not verify whether it was created. Review the matching drafts before retrying.`);
}
