function loadedSnapshotIdentity(workOrder, label) {
  const id = String(workOrder?.id || "").trim();
  const updatedDate = String(workOrder?.updated_date || "").trim();
  if (!id || !updatedDate) {
    throw new Error(`${label} is missing its loaded Work Order version. Reload before permanently deleting.`);
  }
  return { id, updatedDate };
}

function requireHardDeleteEntity(entity, label) {
  if (typeof entity?.filter !== "function" || typeof entity?.deleteMany !== "function") {
    throw new Error(`${label} could not initialize its conditional permanent delete.`);
  }
}

async function readWorkOrderById(entity, id, label) {
  const rows = await entity.filter({ id }, "created_date", 2, 0);
  if (!Array.isArray(rows)) {
    throw new Error(`${label} could not verify the Work Order safely.`);
  }
  if (rows.length > 1) {
    throw new Error(`${label} found an ambiguous Work Order id. Nothing else was deleted.`);
  }
  return rows[0] || null;
}

async function conditionallyHardDeleteLoadedWorkOrder({
  entity,
  workOrder,
  requireTrash = false,
  label,
}) {
  requireHardDeleteEntity(entity, label);
  const { id, updatedDate } = loadedSnapshotIdentity(workOrder, label);

  if (requireTrash && workOrder?.deleted !== true) {
    throw new Error(`${label} was blocked because the loaded Work Order is no longer a verified trash item.`);
  }

  const current = await readWorkOrderById(entity, id, label);
  if (!current) {
    return { id, status: "already_absent" };
  }
  if (requireTrash && current.deleted !== true) {
    throw new Error(`${label} was blocked because the Work Order is no longer in Project Trash. Nothing was permanently deleted.`);
  }
  if (String(current.updated_date || "").trim() !== updatedDate) {
    throw new Error(`${label} was blocked because the Work Order changed after it was loaded. Reload before permanently deleting. Nothing was permanently deleted.`);
  }

  const query = { id, updated_date: updatedDate };
  if (requireTrash) query.deleted = true;
  else if (typeof workOrder?.deleted === "boolean") query.deleted = workOrder.deleted;

  let result;
  try {
    result = await entity.deleteMany(query);
  } catch (error) {
    let afterError;
    try {
      afterError = await readWorkOrderById(entity, id, label);
    } catch (verificationError) {
      throw new Error(`${label} returned an error and its outcome could not be verified. Stop and reload before doing anything else. ${verificationError?.message || ""}`.trim());
    }
    if (!afterError) {
      return { id, status: "confirmed_absent" };
    }
    throw error;
  }

  if (result?.deleted === 1) {
    return { id, status: "deleted_now" };
  }
  if (result?.deleted > 1) {
    throw new Error(`${label} returned an impossible multi-record delete count. Stop and verify Project Trash before continuing.`);
  }

  const after = await readWorkOrderById(entity, id, label);
  if (!after) {
    return { id, status: "confirmed_absent" };
  }

  throw new Error(`${label} was blocked because the Work Order changed while permanent deletion was being confirmed. Reload before retrying. Nothing newer was deleted.`);
}

export async function permanentlyDeleteTrashWorkOrderFromLoadedSnapshot({
  entity,
  workOrder,
  label = "Project Trash permanent delete",
}) {
  return conditionallyHardDeleteLoadedWorkOrder({
    entity,
    workOrder,
    requireTrash: true,
    label,
  });
}

export async function permanentlyDeleteWorkOrderFromLoadedSnapshot({
  entity,
  workOrder,
  label = "System Reset permanent delete",
}) {
  return conditionallyHardDeleteLoadedWorkOrder({
    entity,
    workOrder,
    requireTrash: false,
    label,
  });
}

function catalogVersions(rows, label) {
  if (!Array.isArray(rows)) {
    throw new Error(`${label} could not verify the complete Work Order catalog.`);
  }
  const versions = new Map();
  for (const workOrder of rows) {
    const { id, updatedDate } = loadedSnapshotIdentity(workOrder, label);
    if (versions.has(id)) {
      throw new Error(`${label} found a duplicate Work Order id. Nothing was permanently deleted.`);
    }
    versions.set(id, {
      updatedDate,
      deleted: workOrder?.deleted === true,
    });
  }
  return versions;
}

export function assertSystemResetCatalogStable({
  loaded,
  verified,
  label = "System Reset preflight",
}) {
  const loadedVersions = catalogVersions(loaded, label);
  const verifiedVersions = catalogVersions(verified, label);

  if (loadedVersions.size !== verifiedVersions.size) {
    throw new Error(`${label} was blocked because the Work Order catalog changed during preflight. Nothing was permanently deleted.`);
  }

  for (const [id, expected] of loadedVersions) {
    const current = verifiedVersions.get(id);
    if (!current || current.updatedDate !== expected.updatedDate || current.deleted !== expected.deleted) {
      throw new Error(`${label} was blocked because at least one Work Order changed during preflight. Nothing was permanently deleted.`);
    }
  }

  return true;
}
