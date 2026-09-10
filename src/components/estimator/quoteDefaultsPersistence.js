import { deleteEntityIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";
import { canonicalQuoteDefaults } from "@/components/estimator/quoteDefaults";

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

async function readDefaultRows(entity, label) {
  const rows = await entity.filter({ config_name: "default" });
  if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a Quote Defaults list.`);
  return rows;
}

export async function createQuoteDefaultsSingletonWithRecovery({
  entity,
  data,
  label = "Quote Defaults",
  settleMs = 50,
} = {}) {
  const payload = data && typeof data === "object" && !Array.isArray(data)
    ? { ...data, config_name: "default" }
    : null;
  if (!payload || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its singleton create.`);
  }

  const before = await readDefaultRows(entity, `${label} preflight`);
  if (before.length > 1) {
    throw new Error(`${label} found ${before.length} existing default records. No new default was created; review the duplicate singleton records first.`);
  }
  if (before.length === 1) return { record: before[0], status: "existing" };

  let created = null;
  let createError = null;
  try {
    created = await entity.create(payload);
  } catch (error) {
    createError = error;
  }

  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));
  if (pause) await new Promise((resolve) => setTimeout(resolve, pause));

  let after;
  try {
    after = await readDefaultRows(entity, `${label} verification`);
  } catch (verificationError) {
    if (created?.id) return { record: created, status: "created_unverified_identity" };
    throw new Error(
      `${label} create response was unavailable and its recovery lookup also failed. ` +
      `Do not retry blindly; reload Quote Defaults first. ${verificationError?.message || ""}`.trim()
    );
  }

  if (after.length === 0) {
    if (created?.id) return { record: created, status: "created_unverified_identity" };
    if (createError) {
      throw new Error(
        `${createError?.message || `${label} could not be created.`} No default record was visible after recovery. ` +
        `Reload Quote Defaults before retrying.`
      );
    }
    throw new Error(`${label} could not verify whether the default record was created. Reload before retrying.`);
  }

  if (after.length === 1) {
    const only = after[0];
    if (created?.id) {
      if (String(only.id) === String(created.id)) return { record: only, status: "created" };
      throw new Error(`${label} returned a create receipt, but a different default record became authoritative. No record was deleted; reload and review before saving again.`);
    }
    if (payloadMatches(only, payload)) return { record: only, status: "recovered" };
    return { record: only, status: "existing" };
  }

  const canonical = canonicalQuoteDefaults(after);
  if (!canonical?.id) {
    throw new Error(`${label} found multiple default records but could not determine the existing canonical record safely.`);
  }

  if (!created?.id) {
    throw new Error(
      `${label} create response was unavailable and ${after.length} default records are now visible. ` +
      `No record was deleted because this request's row cannot be identified safely; review the duplicates before retrying.`
    );
  }

  if (String(canonical.id) === String(created.id)) {
    throw new Error(
      `${label} detected simultaneous singleton creation and this request's record is canonical. ` +
      `The other session's record was not deleted; review the duplicate defaults before continuing.`
    );
  }

  const own = after.find((row) => String(row?.id || "") === String(created.id));
  if (!own?.id || !payloadMatches(own, payload)) {
    throw new Error(
      `${label} detected simultaneous singleton creation, but this request's created row could not be verified safely. ` +
      `No record was deleted; review the duplicates before continuing.`
    );
  }

  await deleteEntityIfUnchanged({
    entity,
    record: own,
    guardFields: { config_name: "default" },
    label: `${label} losing concurrent duplicate cleanup`,
  });

  const verified = await readDefaultRows(entity, `${label} post-cleanup verification`);
  if (verified.length === 1 && String(verified[0]?.id || "") === String(canonical.id)) {
    return { record: verified[0], status: "concurrent_existing_won" };
  }

  throw new Error(
    `${label} safely removed this request's losing duplicate, but the singleton catalog is still not unambiguous. ` +
    `Reload and review the remaining default records before saving again.`
  );
}
