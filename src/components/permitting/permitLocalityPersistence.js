function normalizeIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

export function permitLocalityIdentityMatches(record, data) {
  return normalizeIdentity(record?.name) === normalizeIdentity(data?.name)
    && normalizeIdentity(record?.state) === normalizeIdentity(data?.state);
}

export async function createPermitLocalityIfAbsent({
  entity,
  data,
  readCurrentLocalities,
  label = "Permit locality create",
  settleMs = 50,
} = {}) {
  const payload = data && typeof data === "object" && !Array.isArray(data) ? data : null;
  const name = String(payload?.name || "").trim();
  if (!payload || !name || typeof entity?.create !== "function" || typeof readCurrentLocalities !== "function") {
    throw new Error(`${label} could not initialize its duplicate-safe create.`);
  }

  const readMatches = async (phase) => {
    const rows = await readCurrentLocalities();
    if (!Array.isArray(rows)) throw new Error(`${label} ${phase} did not return a locality list.`);
    return rows.filter((row) => permitLocalityIdentityMatches(row, payload));
  };

  const before = await readMatches("preflight");
  if (before.length > 1) {
    throw new Error(`${label} found multiple existing localities with this name and state. No new locality was created; review the duplicates first.`);
  }
  if (before.length === 1) return { record: before[0], status: "existing" };

  let created = null;
  let createError = null;
  try {
    created = await entity.create({ ...payload, name });
  } catch (error) {
    createError = error;
  }

  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));
  if (pause) await new Promise((resolve) => setTimeout(resolve, pause));

  let after;
  try {
    after = await readMatches("verification");
  } catch (verificationError) {
    if (created?.id) return { record: created, status: "created_unverified_identity" };
    throw new Error(
      `${label} create response was unavailable and the recovery lookup also failed. ` +
      `Do not retry blindly; reload Permitting Settings first. ${verificationError?.message || ""}`.trim()
    );
  }

  if (after.length === 1) {
    const record = after[0];
    if (created?.id && String(record.id) === String(created.id)) return { record, status: "created" };
    if (created?.id && String(record.id) !== String(created.id)) {
      throw new Error(`${label} returned a create receipt but a different matching locality became visible. No locality was deleted; reload and review before continuing.`);
    }
    return { record, status: "recovered" };
  }
  if (after.length > 1) {
    throw new Error(`${label} detected simultaneous duplicate creation. No locality was deleted automatically; reload and review the matching records before continuing.`);
  }

  if (created?.id) return { record: created, status: "created_unverified_identity" };
  if (createError) {
    throw new Error(
      `${createError?.message || `${label} could not be created.`} No matching locality was visible after recovery. ` +
      `Reload Permitting Settings before retrying.`
    );
  }
  throw new Error(`${label} could not verify whether the locality was created. Reload Permitting Settings before retrying.`);
}
