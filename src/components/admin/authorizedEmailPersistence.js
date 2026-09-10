import {
  deleteEntityIfUnchanged,
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const cleanEmail = value => String(value || "").trim().toLowerCase();
const cleanUsername = value => String(value || "").trim().toLowerCase();

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

async function allUsers(entity) {
  if (typeof entity?.list !== "function") throw new Error("Authorized user records could not be read safely.");
  return loadAllEntityRows({ entity, sort: "email", label: "Authorized user persistence catalog" });
}

export async function assertAuthorizedEmailIdentityAvailable({ entity, recordId = "", email, username } = {}) {
  const rows = await allUsers(entity);
  const id = String(recordId || "");
  const wantedEmail = email === undefined ? null : cleanEmail(email);
  const wantedUsername = username === undefined ? null : cleanUsername(username);

  if (wantedEmail) {
    const duplicate = rows.find(row => row.id !== id && cleanEmail(row.email) === wantedEmail);
    if (duplicate) throw new Error(`The email ${wantedEmail} is already authorized.`);
  }
  if (wantedUsername) {
    const duplicate = rows.find(row => row.id !== id && cleanUsername(row.username) === wantedUsername);
    if (duplicate) throw new Error(`The username ${wantedUsername} is already in use.`);
  }
  return rows;
}

export async function createAuthorizedEmailIfAbsent({ entity, data, label = "Authorized user" } = {}) {
  const email = cleanEmail(data?.email);
  if (!email || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its safe create.`);
  }
  const desired = { ...data, email };
  if (Object.prototype.hasOwnProperty.call(desired, "username")) desired.username = cleanUsername(desired.username);

  const before = await entity.filter({ email });
  if (before.length > 1) throw new Error(`${label} has duplicate email records already. Review them before inviting again.`);
  if (before.length === 1) return { record: before[0], status: "existing" };
  if (desired.username) {
    await assertAuthorizedEmailIdentityAvailable({ entity, username: desired.username });
  }

  let created = null;
  let createError = null;
  try {
    created = await entity.create(desired);
  } catch (error) {
    createError = error;
  }

  const after = await entity.filter({ email }).catch(error => {
    if (createError) throw createError;
    throw error;
  });
  if (after.length === 1) {
    const saved = after[0];
    const critical = ["email", "role", "onboarding_token", "onboarding_complete"].filter(field => Object.prototype.hasOwnProperty.call(desired, field));
    if (critical.every(field => sameValue(saved[field], desired[field]))) {
      return { record: saved, status: created?.id ? "created" : "recovered_after_response_loss" };
    }
    throw new Error(`${label} was created concurrently with different access values. Reload before changing it.`);
  }

  if (after.length > 1) {
    const canonical = [...after].sort((a, b) => {
      const aCreated = Date.parse(a.created_date || "") || 0;
      const bCreated = Date.parse(b.created_date || "") || 0;
      if (aCreated !== bCreated) return aCreated - bCreated;
      return String(a.id || "").localeCompare(String(b.id || ""));
    })[0];
    const ours = created?.id ? after.find(row => row.id === created.id) : null;
    if (ours?.id && canonical?.id !== ours.id) {
      await deleteEntityIfUnchanged({
        entity,
        record: ours,
        guardFields: { email },
        label: `${label} concurrent duplicate cleanup`,
      });
      const verified = await entity.filter({ email });
      if (verified.length === 1 && verified[0].id === canonical.id) {
        return { record: verified[0], status: "concurrent_duplicate_discarded" };
      }
    }
    throw new Error(`${label} create is ambiguous: multiple records now use ${email}. Do not retry blindly; review the duplicates.`);
  }

  if (createError) throw createError;
  throw new Error(`${label} create could not be verified. Reload before retrying.`);
}

export async function updateAuthorizedEmailIfUnchanged({
  entity,
  record,
  nextFields,
  exactVersion = false,
  enforceIdentity = true,
  guardFields = {},
  label = "Authorized user",
} = {}) {
  if (!record?.id) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  const desired = { ...nextFields };
  if (Object.prototype.hasOwnProperty.call(desired, "email")) desired.email = cleanEmail(desired.email);
  if (Object.prototype.hasOwnProperty.call(desired, "username")) desired.username = cleanUsername(desired.username);

  let rows = null;
  if (enforceIdentity && (Object.prototype.hasOwnProperty.call(desired, "email") || Object.prototype.hasOwnProperty.call(desired, "username"))) {
    rows = await assertAuthorizedEmailIdentityAvailable({
      entity,
      recordId: record.id,
      email: Object.prototype.hasOwnProperty.call(desired, "email") ? desired.email : undefined,
      username: Object.prototype.hasOwnProperty.call(desired, "username") ? desired.username : undefined,
    });
  }

  if (record.role === "admin" && desired.role && desired.role !== "admin") {
    rows ||= await allUsers(entity);
    const otherAdmins = rows.filter(row => row.id !== record.id && row.role === "admin");
    if (otherAdmins.length === 0) throw new Error("The final admin account cannot be demoted. Promote another admin first.");
  }

  return replaceEntityFieldsIfUnchanged({
    entity,
    id: record.id,
    expectedUpdatedAt: exactVersion ? (record.updated_date || "") : "",
    expectedFields: expectedEntityFields(record, desired),
    nextFields: desired,
    guardFields: { email: record.email, ...guardFields },
    label,
  });
}

export async function deleteAuthorizedEmailIfUnchanged({ entity, record, label = "Authorized user deletion" } = {}) {
  if (!record?.id) throw new Error("The user is no longer loaded. Reload before deleting it.");
  if (record.role === "admin") {
    const rows = await allUsers(entity);
    const otherAdmins = rows.filter(row => row.id !== record.id && row.role === "admin");
    if (otherAdmins.length === 0) throw new Error("The final admin account cannot be removed. Promote another admin first.");
  }
  return deleteEntityIfUnchanged({
    entity,
    record,
    guardFields: { email: record.email },
    label,
  });
}
