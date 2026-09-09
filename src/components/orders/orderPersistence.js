import {
  deleteEntityIfUnchanged,
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "../estimator/builder/builderEntityPersistence.js";

function requireLoadedOrderVersion(order, label) {
  const id = String(order?.id || "").trim();
  const updatedDate = String(order?.updated_date || "").trim();
  if (!id || !updatedDate) {
    throw new Error(`${label} is missing its loaded Order version. Reload before continuing.`);
  }
  return { id, updatedDate };
}

export function expectedOrderFields(order = {}, nextFields = {}) {
  return expectedEntityFields(order, nextFields);
}

export async function replaceOrderFieldsIfUnchanged({
  entity,
  order,
  id,
  expectedFields,
  nextFields,
  guardFields = {},
  fullVersion = false,
  label = "Order",
} = {}) {
  const recordId = String(id || order?.id || "").trim();
  if (!recordId) throw new Error(`${label} is missing its Order id.`);
  if (fullVersion) requireLoadedOrderVersion(order, label);

  return replaceEntityFieldsIfUnchanged({
    entity,
    id: recordId,
    expectedUpdatedAt: fullVersion ? order.updated_date : "",
    expectedFields: expectedFields || expectedOrderFields(order, nextFields),
    nextFields,
    guardFields,
    label,
  });
}

export async function softDeleteOrderFromLoadedSnapshot({
  entity,
  order,
  deletedBy,
  label = "Order delete",
} = {}) {
  requireLoadedOrderVersion(order, label);
  const actor = String(deletedBy || "unknown").trim() || "unknown";
  return replaceOrderFieldsIfUnchanged({
    entity,
    order,
    expectedFields: expectedOrderFields(order, {
      deleted: true,
      deleted_at: "",
      deleted_by: actor,
    }),
    nextFields: {
      deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: actor,
    },
    fullVersion: true,
    label,
  });
}

export async function restoreOrderFromLoadedTrashSnapshot({
  entity,
  order,
  label = "Order recovery",
} = {}) {
  requireLoadedOrderVersion(order, label);
  if (order?.deleted !== true) {
    throw new Error(`${label} was blocked because the loaded Order is no longer a verified trash item.`);
  }
  return replaceOrderFieldsIfUnchanged({
    entity,
    order,
    expectedFields: expectedOrderFields(order, {
      deleted: false,
      deleted_at: null,
      deleted_by: null,
    }),
    nextFields: {
      deleted: false,
      deleted_at: null,
      deleted_by: null,
    },
    guardFields: { deleted: true },
    fullVersion: true,
    label,
  });
}

function mapDeleteResult(result = {}) {
  if (result?.alreadyDeleted || result?.convergedAfterResponseLoss) {
    return { status: "confirmed_absent", ...result };
  }
  return { status: "deleted_now", ...result };
}

export async function permanentlyDeleteTrashOrderFromLoadedSnapshot({
  entity,
  order,
  label = "Order Trash permanent delete",
} = {}) {
  requireLoadedOrderVersion(order, label);
  if (order?.deleted !== true) {
    throw new Error(`${label} was blocked because the loaded Order is no longer a verified trash item.`);
  }
  const result = await deleteEntityIfUnchanged({
    entity,
    record: order,
    guardFields: { deleted: true },
    label,
  });
  return mapDeleteResult(result);
}

export async function permanentlyDeleteOrderFromLoadedSnapshot({
  entity,
  order,
  label = "Order System Reset permanent delete",
} = {}) {
  requireLoadedOrderVersion(order, label);
  const guardFields = typeof order?.deleted === "boolean" ? { deleted: order.deleted } : {};
  const result = await deleteEntityIfUnchanged({
    entity,
    record: order,
    guardFields,
    label,
  });
  return mapDeleteResult(result);
}

function catalogVersions(rows, label) {
  if (!Array.isArray(rows)) {
    throw new Error(`${label} could not verify the complete Order catalog.`);
  }
  const versions = new Map();
  for (const order of rows) {
    const { id, updatedDate } = requireLoadedOrderVersion(order, label);
    if (versions.has(id)) {
      throw new Error(`${label} found a duplicate Order id. Nothing was permanently deleted.`);
    }
    versions.set(id, {
      updatedDate,
      deleted: order?.deleted === true,
    });
  }
  return versions;
}

export function assertOrderSystemResetCatalogStable({
  loaded,
  verified,
  label = "Order System Reset preflight",
} = {}) {
  const loadedVersions = catalogVersions(loaded, label);
  const verifiedVersions = catalogVersions(verified, label);
  if (loadedVersions.size !== verifiedVersions.size) {
    throw new Error(`${label} was blocked because the Order catalog changed during preflight. Nothing was permanently deleted.`);
  }
  for (const [id, expected] of loadedVersions) {
    const current = verifiedVersions.get(id);
    if (!current || current.updatedDate !== expected.updatedDate || current.deleted !== expected.deleted) {
      throw new Error(`${label} was blocked because at least one Order changed during preflight. Nothing was permanently deleted.`);
    }
  }
  return true;
}

export async function deleteVerifiedOrderSnapshots({
  entity,
  orders,
  label = "Order System Reset",
  onProgress,
  delayMs = 0,
} = {}) {
  if (!Array.isArray(orders)) throw new Error(`${label} is missing its verified Order snapshot.`);
  let confirmedAbsent = 0;
  let deletedNow = 0;
  let convergedAbsent = 0;

  try {
    for (let index = 0; index < orders.length; index += 1) {
      const result = await permanentlyDeleteOrderFromLoadedSnapshot({
        entity,
        order: orders[index],
        label: `${label} Order ${index + 1} of ${orders.length}`,
      });
      confirmedAbsent += 1;
      if (result.status === "deleted_now") deletedNow += 1;
      else convergedAbsent += 1;
      if (typeof onProgress === "function") {
        onProgress({ confirmedAbsent, deletedNow, convergedAbsent, total: orders.length });
      }
      if (delayMs > 0 && index < orders.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  } catch (error) {
    error.orderResetProgress = {
      confirmedAbsent,
      deletedNow,
      convergedAbsent,
      total: orders.length,
    };
    throw error;
  }

  return { confirmedAbsent, deletedNow, convergedAbsent, total: orders.length };
}

export function assertOrderSystemResetComplete({
  remaining,
  label = "Order System Reset final verification",
} = {}) {
  if (!Array.isArray(remaining)) {
    throw new Error(`${label} could not verify the final Order catalog.`);
  }
  if (remaining.length > 0) {
    throw new Error(
      `${label} found ${remaining.length} Order${remaining.length === 1 ? "" : "s"} that were not part of the verified deletion outcome. Review the current catalog before running another reset.`
    );
  }
  return true;
}
