import { base44 } from "@/api/base44Client";
import {
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";

const PendingImport = base44.entities.PendingImport;

export async function assertPendingImportSnapshotCurrent({
  item,
  label = "Pending Import",
} = {}) {
  const id = String(item?.id || "").trim();
  const expectedUpdatedAt = String(item?.updated_date || "").trim();
  if (!id || !expectedUpdatedAt || typeof PendingImport?.get !== "function") {
    throw new Error(`${label} could not verify its loaded version.`);
  }

  const current = await PendingImport.get(id).catch(() => null);
  if (!current?.id) throw new Error(`${label} no longer exists. Refresh Pending Imports.`);
  if (current.status !== "pending") {
    throw new Error(`${label} was already resolved in another session (${current.status || "unknown"}). Refresh Pending Imports.`);
  }
  if (String(current.updated_date || "") !== expectedUpdatedAt) {
    throw new Error(`${label} changed after it was loaded. Refresh Pending Imports before resolving it.`);
  }
  return current;
}

export async function resolvePendingImportFromLoadedSnapshot({
  item,
  status,
  mergedIntoId,
  label = "Pending Import resolution",
} = {}) {
  const id = String(item?.id || "").trim();
  const expectedUpdatedAt = String(item?.updated_date || "").trim();
  const nextStatus = String(status || "").trim();
  if (!id || !expectedUpdatedAt || !nextStatus) {
    throw new Error(`${label} could not initialize its concurrency-safe resolution.`);
  }

  const nextFields = { status: nextStatus };
  if (mergedIntoId !== undefined) nextFields.merged_into_id = mergedIntoId || "";

  return replaceEntityFieldsIfUnchanged({
    entity: PendingImport,
    id,
    expectedUpdatedAt,
    expectedFields: expectedEntityFields(item, nextFields),
    nextFields,
    label,
  });
}
