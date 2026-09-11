import {
  deleteEntityIfUnchanged,
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const EDITABLE_FIELDS = [
  "name", "state", "type", "website_url", "permitting_url", "cagis_database_url",
  "notes", "ai_summary", "last_updated", "auto_refresh", "activity_log", "documents",
  "contact_info", "permit_requirements", "sqft_width_height_rules", "height_allowances",
  "setback_rules", "lighting_allowances", "parent_county", "_manual_website_url",
  "_manual_permitting_url", "_manual_requirements", "_manual_documents",
];

export function jurisdictionFormPayload(data = {}) {
  return Object.fromEntries(
    EDITABLE_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(data, field))
      .map((field) => [field, data[field]])
  );
}

const normIdentity = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const normalizedJurisdictionType = (row) => normIdentity(row?.type || "county") || "county";
const parentCountyName = (row) => normIdentity(
  typeof row?.parent_county === "string" ? row.parent_county : row?.parent_county?.name
);

function sameNameStateType(row, data) {
  return normIdentity(row?.name) === normIdentity(data?.name) &&
    normIdentity(row?.state) === normIdentity(data?.state) &&
    normalizedJurisdictionType(row) === normalizedJurisdictionType(data);
}

function classifyJurisdictionIdentity(rows, data, excludeId = "") {
  const targetType = normalizedJurisdictionType(data);
  const targetParent = targetType === "county" ? "" : parentCountyName(data);
  const sameBase = (rows || []).filter((row) =>
    String(row?.id || "") !== String(excludeId || "") && sameNameStateType(row, data)
  );

  if (targetType === "county") {
    return { exact: sameBase, ambiguous: [] };
  }

  if (targetParent) {
    return {
      exact: sameBase.filter((row) => parentCountyName(row) === targetParent),
      ambiguous: [],
    };
  }

  const unqualified = sameBase.filter((row) => !parentCountyName(row));
  const qualified = sameBase.filter((row) => !!parentCountyName(row));
  return { exact: unqualified, ambiguous: qualified };
}

async function loadJurisdictionIdentityCatalog(entity, label) {
  return loadAllEntityRows({
    entity,
    sort: null,
    label: `${label} identity catalog`,
  });
}

function identityDescription(data) {
  const type = normalizedJurisdictionType(data);
  const parent = type === "county" ? "" : parentCountyName(data);
  return `${String(data?.name || "").trim()}, ${String(data?.state || "").trim()} (${type}${parent ? ` · ${typeof data?.parent_county === "string" ? data.parent_county : data?.parent_county?.name}` : ""})`;
}

function assertUnambiguousJurisdictionIdentity(classification, data, label) {
  if (classification.ambiguous.length) {
    throw new Error(
      `${label} is ambiguous because ${classification.ambiguous.length} ${String(data?.name || "Jurisdiction").trim()} record${classification.ambiguous.length === 1 ? "" : "s"} already exist with parent-county context. ` +
      `Choose the Parent County before saving so the correct jurisdiction can be identified.`
    );
  }
  if (classification.exact.length > 1) {
    throw new Error(`${label} found multiple stored records for ${identityDescription(data)}. No row was changed; review the duplicate Jurisdictions first.`);
  }
  return classification.exact[0] || null;
}

export async function saveJurisdictionFromLoadedSnapshot({ entity, jurisdiction, formData, label = "Jurisdiction" } = {}) {
  const payload = jurisdictionFormPayload(formData);
  if (!jurisdiction?.id || Object.keys(payload).length === 0) {
    throw new Error(`${label} could not initialize its concurrency-safe save.`);
  }

  const identityData = { ...jurisdiction, ...payload };
  const catalog = await loadJurisdictionIdentityCatalog(entity, label);
  const classification = classifyJurisdictionIdentity(catalog, identityData, jurisdiction.id);
  const collision = assertUnambiguousJurisdictionIdentity(classification, identityData, label);
  if (collision?.id) {
    throw new Error(`${label} cannot use the same jurisdiction identity as another stored record (${identityDescription(identityData)}). No row was changed.`);
  }

  return replaceEntityFieldsIfUnchanged({
    entity,
    id: jurisdiction.id,
    expectedFields: expectedEntityFields(jurisdiction, payload),
    nextFields: payload,
    label,
  });
}

export async function deleteJurisdictionFromLoadedSnapshot({ entity, jurisdiction, label = "Jurisdiction deletion" } = {}) {
  if (!jurisdiction?.id) throw new Error(`${label} could not identify its loaded Jurisdiction.`);
  return deleteEntityIfUnchanged({
    entity,
    record: jurisdiction,
    guardFields: { name: jurisdiction.name, state: jurisdiction.state },
    label,
  });
}

function jurisdictionCatalogVersions(rows, label) {
  if (!Array.isArray(rows)) {
    throw new Error(`${label} could not verify the complete Jurisdiction catalog.`);
  }
  const versions = new Map();
  for (const row of rows) {
    const id = String(row?.id || "").trim();
    const updatedDate = String(row?.updated_date || "").trim();
    if (!id || !updatedDate) {
      throw new Error(`${label} found a Jurisdiction without identity/version metadata. Nothing was deleted.`);
    }
    if (versions.has(id)) {
      throw new Error(`${label} found a duplicate Jurisdiction id. Nothing was deleted.`);
    }
    versions.set(id, {
      updatedDate,
      name: String(row?.name || ""),
      state: String(row?.state || ""),
    });
  }
  return versions;
}

export function assertJurisdictionCatalogStable({ loaded, verified, label = "Jurisdiction delete-all preflight" } = {}) {
  const loadedVersions = jurisdictionCatalogVersions(loaded, label);
  const verifiedVersions = jurisdictionCatalogVersions(verified, label);
  if (loadedVersions.size !== verifiedVersions.size) {
    throw new Error(`${label} was blocked because the Jurisdiction catalog changed after this page loaded. Nothing was deleted; reload and review the current repository first.`);
  }
  for (const [id, expected] of loadedVersions) {
    const current = verifiedVersions.get(id);
    if (
      !current ||
      current.updatedDate !== expected.updatedDate ||
      current.name !== expected.name ||
      current.state !== expected.state
    ) {
      throw new Error(`${label} was blocked because at least one Jurisdiction changed after this page loaded. Nothing was deleted; reload and review the current repository first.`);
    }
  }
  return true;
}

export async function appendJurisdictionActivitySafely({ entity, jurisdictionId, entry, label = "Jurisdiction activity" } = {}) {
  const id = String(jurisdictionId || "").trim();
  const entryId = String(entry?.id || "").trim();
  if (!id || !entryId || typeof entity?.get !== "function" || typeof entity?.updateMany !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe append.`);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new Error(`${label} could not re-read its Jurisdiction.`);
    const log = Array.isArray(current.activity_log) ? current.activity_log : [];
    if (log.some((row) => String(row?.id || "") === entryId)) return current;
    const desired = [...log, entry];
    const version = String(current.updated_date || "").trim();
    if (!version) throw new Error(`${label} is missing its current Jurisdiction version.`);
    let result;
    try {
      result = await entity.updateMany({ id, updated_date: version }, { $set: { activity_log: desired } });
    } catch (error) {
      const after = await entity.get(id).catch(() => null);
      if (after?.id && Array.isArray(after.activity_log) && after.activity_log.some((row) => String(row?.id || "") === entryId)) return after;
      throw error;
    }
    if (!result || typeof result.updated !== "number") throw new Error(`${label} conditional append result could not be verified.`);
    if (result.updated > 1) throw new Error(`${label} returned an impossible multi-record update count.`);
    if (result.updated === 1) return entity.get(id);
  }
  throw new Error(`${label} changed repeatedly in another session. Reload before retrying.`);
}

function canonical(rows = []) {
  return [...rows].sort((a, b) => {
    const ad = String(a?.created_date || "");
    const bd = String(b?.created_date || "");
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0] || null;
}

export async function createJurisdictionIfAbsent({ entity, data, label = "Jurisdiction create" } = {}) {
  const payload = jurisdictionFormPayload(data);
  const name = String(payload.name || "").trim();
  const state = String(payload.state || "").trim();
  if (!name || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its duplicate-safe create.`);
  }
  const query = { name, state };
  const before = await entity.filter(query);
  if (!Array.isArray(before)) throw new Error(`${label} duplicate preflight did not return a record list.`);
  if (before.length > 1) throw new Error(`${label} found ${before.length} existing records for ${name}, ${state || "(no state)"}. Review duplicates before creating another.`);
  if (before.length === 1) return { record: before[0], status: "existing" };

  let created = null;
  let createError = null;
  try {
    created = await entity.create({ ...payload, name, state });
  } catch (error) {
    createError = error;
  }

  await new Promise((resolve) => setTimeout(resolve, 40));
  let after = await entity.filter(query);
  if (!Array.isArray(after)) throw new Error(`${label} final verification did not return a record list.`);
  if (after.length === 1) return { record: after[0], status: created?.id === after[0].id ? "created" : "recovered" };

  if (after.length > 1 && created?.id) {
    const keep = canonical(after);
    if (keep?.id && keep.id !== created.id) {
      const own = after.find((row) => row.id === created.id);
      if (own?.id) {
        await deleteJurisdictionFromLoadedSnapshot({ entity, jurisdiction: own, label: `${label} race duplicate cleanup` });
        after = await entity.filter(query);
        if (Array.isArray(after) && after.length === 1 && after[0]?.id === keep.id) {
          return { record: after[0], status: "concurrent_duplicate_discarded" };
        }
      }
    }
    throw new Error(`${label} detected simultaneous duplicate creation. No other session's Jurisdiction was deleted; review the ${after.length} records before continuing.`);
  }

  if (createError) throw createError;
  if (created?.id) throw new Error(`${label} returned a create receipt but could not be verified. Reload before retrying.`);
  throw new Error(`${label} could not verify whether the Jurisdiction was created.`);
}
