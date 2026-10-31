// Thin invoke wrapper for the deployed manageMigration function. Every action
// is admin-gated server-side; the caller passes the sign-shop session token
// exactly like WalkInSale/SOP do (`session_token` in the body).
import { base44 } from "@/api/base44Client";

export const MIGRATION_FUNCTION = "manageMigration";

// Pull the most useful message out of an invoke failure. The SDK throws on
// non-2xx with the backend's { error } body under response.data; a 200 with
// success:false reaches us as data instead.
export function migrationErrorMessage(error, fallback = "Migration action failed.") {
  return (
    error?.response?.data?.error ||
    error?.data?.error ||
    error?.error ||
    error?.message ||
    fallback
  );
}

export async function invokeMigration(sessionToken, action, payload = {}) {
  const res = await base44.functions.invoke(MIGRATION_FUNCTION, {
    action,
    session_token: sessionToken || "",
    ...payload,
  });
  const data = res?.data ?? res;
  if (data && data.success === false) {
    const err = new Error(data.error || `Migration action "${action}" failed.`);
    err.data = data;
    throw err;
  }
  return data || {};
}

// The eight manageMigration actions, one named call each so call sites read
// like the backend contract:
//   list_mappers    -> registry introspection (entities, kinds, required fields)
//   list_batches    -> recent batch markers with counts/status
//   start_batch     -> { batch_id, meta } for a new (entity, file) run
//   preview_mapping -> dry-run column -> field proposal (no writes)
//   import_rows     -> chunked row import (dry_run or live)
//   get_batch       -> live counts + recent errors for one batch
//   report          -> per-entity totals + first-200 errors for one batch
//   unimport_batch  -> rollback of created-status rows only
export const migrationActions = {
  listMappers: (sessionToken) =>
    invokeMigration(sessionToken, "list_mappers"),
  listBatches: (sessionToken) =>
    invokeMigration(sessionToken, "list_batches"),
  startBatch: (sessionToken, { source_label, entity, batch_tag } = {}) =>
    invokeMigration(sessionToken, "start_batch", { source_label, entity, batch_tag }),
  previewMapping: (sessionToken, { entity, columns, sample_rows } = {}) =>
    invokeMigration(sessionToken, "preview_mapping", { entity, columns, sample_rows }),
  importRows: (sessionToken, { batch_id, entity, rows, mapping, dry_run, on_duplicate } = {}) =>
    invokeMigration(sessionToken, "import_rows", { batch_id, entity, rows, mapping, dry_run, on_duplicate }),
  getBatch: (sessionToken, batch_id) =>
    invokeMigration(sessionToken, "get_batch", { batch_id }),
  getReport: (sessionToken, batch_id) =>
    invokeMigration(sessionToken, "report", { batch_id }),
  unimportBatch: (sessionToken, batch_id) =>
    invokeMigration(sessionToken, "unimport_batch", { batch_id }),
};
