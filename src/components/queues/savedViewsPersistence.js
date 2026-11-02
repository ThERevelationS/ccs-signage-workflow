import { staffEntities } from "@/components/staff/staffEntities";
import { ensureIdempotentEntityCreate } from "@/components/estimator/idempotentEntityCreate";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { createSavedViewStore } from "./savedViewsModel";

// SavedQueueView persistence — every op routes through the session-
// authenticated staff gateways (staffDataRead reads, staffEntityWrite
// create/updateMany/delete) via the staffEntities facade. The CRUD and
// degraded-session routing core lives in savedViewsModel.createSavedViewStore
// — dependency-injected there so the whole surface is unit-testable under
// Node (scripts/test-saved-queue-views.mjs) without bundling the gateway
// chain; this file is the wiring that binds it to SavedQueueView.
//
// Degraded-session fallback: when a scope's entity read fails, the store
// serves the scope's per-session mirror instead and returns degraded:true;
// writes while degraded (or on clearly-unavailable/transient gateway errors)
// apply to the mirror too — see the "ssv:" section in savedViewsModel.js.
// Explicit deps (also the store defaults): reads page through loadAllEntityRows
// (staffDataRead — paged, rate-limit retried, deduped, fail-closed); creates go
// through ensureIdempotentEntityCreate (creation_request_key, retry-safe);
// updates are single-record updateMany({id, updated_date}, {$set}) CAS.
const store = createSavedViewStore({
  entity: staffEntities.SavedQueueView,
  loadRows: loadAllEntityRows,
  ensureCreate: ensureIdempotentEntityCreate,
});

export {
  SAVED_VIEWS_UNAVAILABLE,
  isSavedViewsUnavailableError,
} from "./savedViewsModel";

// --- C-03 page-keyed API ----------------------------------------------------
// Rows are scoped by the entity's `page` field (the remote schema's alias
// for queue_lens is deliberately disjoint — page views never appear in
// ProductQueue's lens lists and vice versa).

// listViews({pageKey, ownerEmail, includeShared})
//   → { views, degraded, available, error }
//   views = own + shared rows for the page, sorted: own first, pinned before
//   unpinned, `sort` weight asc (unweighted last), then name, created, id.
export const listViews = (opts) => store.listViews(opts);

// saveView({name, pageKey, filters, ownerEmail, existing?, lens?, shared?,
//           pinned?, sort?, isDefault?})
//   → { view, degraded }. `existing` is the same-name row; its updated_date
//   anchors the CAS overwrite. New rows go through the retry-safe
//   idempotent create (creation_request_key).
export const saveView = (opts) => store.saveView(opts);

// renameView({view, name, ownerEmail?, pageKey?}) → { view, degraded }
export const renameView = (opts) => store.renameView(opts);

// pinView({view, pinned?, sort?, views?, ownerEmail?, pageKey?})
//   → { view, degraded }. Pinning assigns the smallest pinned `sort` weight
//   (newest pin floats to the top) unless `sort` is given explicitly.
export const pinView = (opts) => store.pinView(opts);

// setDefaultView({view, views?, isDefault?, ownerEmail?, pageKey?})
//   → { view, degraded, warning? }. Setting a default clears is_default on
//   the other loaded rows (best-effort; failures surface in `warning`).
export const setDefaultView = (opts) => store.setDefaultView(opts);

// deleteView(view, {ownerEmail?, pageKey?}?) → { deleted: true, degraded }
export const deleteView = (view, ctx) => store.deleteView(view, ctx);

// applyView(view) → the row's stored payload as a live filters object
// (recordToFilters — normalized known keys + unknown-key passthrough).
export const applyView = (view) => store.applyView(view);

// isViewsScopeDegraded(scope) — true while the scope's last entity read
// failed; cleared by the next successful listViews/loadSavedQueueViews.
export const isViewsScopeDegraded = (scope) => store.isScopeDegraded(scope);

// --- Legacy lens-axis API (the ProductQueue contract) -----------------------
// Unchanged shapes: loadSavedQueueViews → {views, available, error} (now
// also carries `degraded` + session-mirror fallback), saveSavedQueueView →
// the saved record, deleteSavedQueueView → true or throw.
export const loadSavedQueueViews = (opts) => store.loadLensViews(opts);
export const saveSavedQueueView = (opts) => store.saveLensView(opts);
export const deleteSavedQueueView = async (view = {}, ctx = {}) => {
  await store.deleteView(view, ctx);
  return true;
};
