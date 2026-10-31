import { staffEntities } from "@/components/staff/staffEntities";
import {
  ensureIdempotentEntityCreate,
  newCreationRequestKey,
} from "@/components/estimator/idempotentEntityCreate";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { serializeViewFilters } from "./savedViewsModel";

// SavedQueueView persistence. Reads page through the staffDataRead gateway
// via loadAllEntityRows (paged, rate-limit retried, deduped, fail-closed);
// writes go through staffEntityWrite — create via the retry-safe idempotent
// helper and the single-record conditional updateMany({id, updated_date},
// {$set}) CAS contract for overwrites, exactly like the CRM event
// persistence. Deleting a view uses the plain delete op — the UI only ever
// offers it for rows the session owns.
const SavedQueueView = staffEntities.SavedQueueView;

export const SAVED_VIEWS_UNAVAILABLE = "Saved views unavailable";

// Errors that mean the entity is not (yet) wired into the staff gateways —
// a 403/404 from staffDataRead/staffEntityWrite, or the gateway's
// "record type" rejections. Anything else is a transient/user-visible
// failure, not a permanent unavailable state.
export function isSavedViewsUnavailableError(error) {
  const status = Number(error?.status ?? error?.response?.status);
  if (status === 403 || status === 404) return true;
  const message = String(
    error?.message || error?.response?.data?.error || error?.data?.error || ""
  ).toLowerCase();
  return (
    message.includes("cannot be written") ||
    message.includes("unknown record type") ||
    message.includes("not permitted") ||
    message.includes("not readable") ||
    message.includes("denied")
  );
}

// Loads SavedQueueView rows for the lens and keeps own + shared rows.
// available=false means the gateways rejected the entity — the caller
// collapses the control into a quiet "saved views unavailable" note; an
// available-but-errored result just shows an empty list the user can retry.
export async function loadSavedQueueViews({ lens = "all", ownerEmail = "" } = {}) {
  try {
    const rows = await loadAllEntityRows({
      entity: SavedQueueView,
      query: { queue_lens: String(lens || "all") },
      sort: "created_date",
      maxRows: 2000,
      label: "Saved queue views",
    });
    const me = String(ownerEmail || "").trim().toLowerCase();
    const views = (rows || []).filter(
      (r) => r?.is_shared === true || String(r?.owner_email || "").trim().toLowerCase() === me
    );
    return { views, available: true, error: null };
  } catch (error) {
    return { views: [], available: !isSavedViewsUnavailableError(error), error };
  }
}

// Save (or overwrite) a named view. `existing` is the same-name row loaded
// with the list — its updated_date anchors the conditional update so two
// sessions can never both claim the overwrite.
export async function saveSavedQueueView({
  name,
  lens = "all",
  filters = {},
  ownerEmail = "",
  existing = null,
} = {}) {
  const cleanName = String(name || "").trim().slice(0, 120);
  if (!cleanName) throw new Error("View name is required.");
  const data = {
    name: cleanName,
    queue_lens: String(lens || "all"),
    filters: serializeViewFilters(filters),
    owner_email: String(ownerEmail || "").trim(),
    is_shared: false,
  };
  if (existing?.id) {
    const version = String(existing?.updated_date || "").trim();
    if (!version) {
      throw new Error("Saved view is missing its current version. Reload before saving.");
    }
    const result = await SavedQueueView.updateMany(
      { id: existing.id, updated_date: version },
      { $set: data }
    );
    if (result && typeof result.updated === "number") {
      if (result.updated === 1) {
        const saved = await SavedQueueView.get(existing.id).catch(() => null);
        return saved || { ...existing, ...data };
      }
      if (result.updated === 0) {
        throw new Error("This saved view changed in another session. Reload before saving.");
      }
      throw new Error("Saved view update matched more than one record. Reload and review.");
    }
    throw new Error("Saved view update result could not be verified.");
  }
  return ensureIdempotentEntityCreate({
    entity: SavedQueueView,
    keyField: "creation_request_key",
    key: newCreationRequestKey("saved_queue_view"),
    data,
    label: "Saved queue view",
  });
}

export async function deleteSavedQueueView(view = {}) {
  const id = String(view?.id || "").trim();
  if (!id) throw new Error("Saved view is missing its id.");
  const deleted = await SavedQueueView.delete(id);
  if (deleted !== true) throw new Error("Saved view delete could not be verified.");
  return true;
}
