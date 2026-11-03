import { useQuery } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { base44 } from "@/api/base44Client";
import { invokeFleet } from "@/components/fleet/fleetInvoke";
import { staffEntities } from "@/components/staff/staffEntities";
import { getSessionToken } from "@/components/auth/EmailGate";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import { fetchAllWorkOrders, refreshAllWorkOrders } from "@/lib/workOrderCache";
import { loadSavedQueueViews } from "./savedViewsPersistence";
import { PRODUCT_STAGE_MODE_SETTING_KEY } from "@/components/estimator/productStageSync";
import { OpportunityActivity, Customer } from "@/api/gatedEntities";

// Composed queue feed client (M-03). One invokeFleet("queueFeed") call returns
// a queue page's whole mount read set — projected row table plus its scoped
// extras (saved views, settings, customer datalist, quote defaults) — instead
// of the browser firing N parallel gateway/board reads.
//
// FAIL-OPEN: any invoke failure falls back to the exact reads the page ran
// before — boardFeed via fetchAllWorkOrders for work orders, loadSavedQueueViews
// / loadSingleGlobalSetting for queue extras, loadAllEntityRows for CRM and
// estimate rows. A function that is simply absent (old bundle, undeployed)
// latches `queueFeedDown` for the session so later calls go straight to the
// legacy path instead of paying a guaranteed-failed invoke every mount.
//
// Delta cursors ride along like workOrderCache's: per-scope stores merge
// `items` by id and thread `next_cursor`, so the 120s refetch is a cheap
// updated_date delta, not a table re-pull.

export const QUEUE_FEED_WO_KEY = ["queueFeed", "workOrders"];
export const queueFeedExtrasKey = (lens, ownerEmail) => ["queueFeed", "extras", String(lens || "all"), String(ownerEmail || "")];
export const QUEUE_FEED_ESTIMATE_KEY = ["queueFeed", "estimates"];

const EMPTY_ROWS = [];
const FULL_RESYNC_MS = 30 * 60 * 1000;

// Session latch — a missing function is a fact about the deployment, not a
// transient. Transient failures (429/500/network) only fail that one call.
let queueFeedDown = false;
export function isQueueFeedUnavailableError(err) {
  const status = Number(err?.status ?? err?.response?.status);
  if (status === 404 || status === 501) return true;
  const msg = String(err?.message || err?.data?.error || err?.response?.data?.error || "").toLowerCase();
  return msg.includes("not found") || msg.includes("unknown function") || msg.includes("does not exist") || msg.includes("unavailable");
}

export function markQueueFeedDown() { queueFeedDown = true; }
// Test/debug visibility only.
export function queueFeedIsDown() { return queueFeedDown; }

async function invokeQueueFeed(payload) {
  const res = await invokeFleet("queueFeed", payload);
  const data = res?.data || res;
  if (!data || typeof data !== "object") {
    throw new Error("Queue feed data could not be verified completely.");
  }
  return data;
}

// --- per-scope delta stores ---------------------------------------------------
// key -> { rows: Map<id,row>, cursor, fullSyncAt, inFlight, truncated }
const feedStores = new Map();
const storeFor = (scope) => {
  if (!feedStores.has(scope)) {
    feedStores.set(scope, { rows: new Map(), cursor: "", fullSyncAt: 0, inFlight: null, truncated: false });
  }
  return feedStores.get(scope);
};

const rowUpdated = (row) => String(row?.updated_date || row?.created_date || "");

// requestFor(since|null) builds the invoke payload; since === null means
// "full pull". Returns the raw feed payload; merges items into the scope
// store. A truncated delta forces a full resync — a partial change window
// must never merge over stale rows.
async function pullFeedItems(scope, requestFor) {
  const st = storeFor(scope);
  if (st.inFlight) return st.inFlight;
  st.inFlight = (async () => {
    const needsFull = !st.cursor || Date.now() - st.fullSyncAt > FULL_RESYNC_MS;
    let data = await invokeQueueFeed(requestFor(needsFull ? null : st.cursor));
    if (!needsFull && data.truncated === true) {
      data = await invokeQueueFeed(requestFor(null));
      st.rows = new Map();
      st.fullSyncAt = Date.now();
    } else if (needsFull) {
      st.rows = new Map();
      st.fullSyncAt = Date.now();
    }
    st.truncated = data.truncated === true;
    let maxUpdated = st.cursor;
    for (const row of Array.isArray(data.items) ? data.items : []) {
      if (!row?.id) continue;
      st.rows.set(row.id, row);
      const u = rowUpdated(row);
      if (u > maxUpdated) maxUpdated = u;
    }
    // The server's cursor is the max updated_date it scanned — a delta that
    // touched rows the projection dropped still advances safely.
    const next = String(data.next_cursor || "");
    if (next && next > maxUpdated) maxUpdated = next;
    if (maxUpdated) st.cursor = maxUpdated;
    return { ...data, scope: st };
  })().finally(() => { st.inFlight = null; });
  return st.inFlight;
}

// --- Work orders (product queue) ----------------------------------------------

export async function fetchQueueWorkOrders() {
  const st = storeFor("workOrders");
  if (!getSessionToken()) return { rows: EMPTY_ROWS, composed: false };
  if (queueFeedDown) {
    return { rows: await fetchAllWorkOrders(), composed: false, truncated: false };
  }
  try {
    const data = await pullFeedItems("workOrders", (since) => ({
      feed: "product_queue",
      include: [],
      ...(since ? { since } : {}),
    }));
    return { rows: [...st.rows.values()], composed: true, truncated: data.truncated === true };
  } catch (err) {
    if (isQueueFeedUnavailableError(err)) markQueueFeedDown();
    // Fail-open: the board-feed path returns a superset of the same rows.
    const rows = await fetchAllWorkOrders();
    return { rows, composed: false, error: err };
  }
}

// Drop-in for useAllWorkOrders on queue surfaces: same {data, isFetched}
// contract, backed by the projected queue feed. The fallback composes to the
// identical row set (board rows are a superset of the queue projection).
export function useQueueWorkOrders({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: QUEUE_FEED_WO_KEY,
    queryFn: () => fetchQueueWorkOrders().then((r) => r.rows),
    enabled,
    staleTime: 60000,
    refetchInterval: 120000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  return { ...query, data: query.data ?? EMPTY_ROWS };
}

// After-write refresh for queue surfaces: invalidate the queue feed (next
// pull is a cheap delta) and keep the shared board cache warm for any board
// page that is mounted alongside.
export function refreshQueueWorkOrders() {
  queryClientInstance.invalidateQueries({ queryKey: QUEUE_FEED_WO_KEY });
  return refreshAllWorkOrders();
}

// --- Queue extras (saved views + stage-mode setting) --------------------------

// Returns { savedViews, viewsAvailable, viewsError, stageModeRecord, composed }.
// Each extra degrades independently: when the composed call answers a slice
// with an error, only that slice falls back to its gateway read.
export async function fetchQueueExtras({ lens = "all", ownerEmail = "" } = {}) {
  const loadViewsLegacy = () =>
    loadSavedQueueViews({ lens, ownerEmail })
      .then((res) => ({ savedViews: res?.views || [], viewsAvailable: res?.available !== false, viewsError: res?.error || "" }))
      .catch(() => ({ savedViews: [], viewsAvailable: true, viewsError: "Saved views could not be loaded." }));
  const loadSettingLegacy = () =>
    loadSingleGlobalSetting({
      entity: staffEntities.GlobalSettings,
      settingKey: PRODUCT_STAGE_MODE_SETTING_KEY,
      label: "Product status stage sync",
    }).catch(() => null);

  if (!getSessionToken() || !ownerEmail) {
    // The stage-mode setting is global — load it even before the session
    // user resolves (old behavior). Views need an owner; the UI hides the
    // picker until actor is known, so skip that read entirely.
    const [views, stageModeRecord] = await Promise.all([
      ownerEmail
        ? loadViewsLegacy()
        : Promise.resolve({ savedViews: [], viewsAvailable: true, viewsError: "" }),
      loadSettingLegacy(),
    ]);
    return { ...views, stageModeRecord, composed: false };
  }
  if (!queueFeedDown) {
    try {
      const res = await invokeQueueFeed({
        feed: "product_queue",
        items: false,
        include: ["saved_views", "settings"],
        queue_lens: lens,
        owner_email: ownerEmail,
      });
      const errors = res?.extras_errors || {};
      // Per-slice fallback — only the failed extra pays a gateway read.
      const views = Array.isArray(res?.saved_views)
        ? { savedViews: res.saved_views, viewsAvailable: true, viewsError: "" }
        : await loadViewsLegacy();
      const stageModeRecord = res?.settings && !errors.settings
        ? (res.settings.product_stage_mode ?? null)
        : await loadSettingLegacy();
      return { ...views, stageModeRecord, composed: true };
    } catch (err) {
      if (isQueueFeedUnavailableError(err)) markQueueFeedDown();
      // fall through to the legacy pair
    }
  }
  const [views, stageModeRecord] = await Promise.all([loadViewsLegacy(), loadSettingLegacy()]);
  return { ...views, stageModeRecord, composed: false };
}

export function useQueueExtras({ lens = "all", ownerEmail = "", enabled = true } = {}) {
  return useQuery({
    queryKey: queueFeedExtrasKey(lens, ownerEmail),
    queryFn: () => fetchQueueExtras({ lens, ownerEmail }),
    enabled,
    staleTime: 30000,
    refetchInterval: 120000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}

// Saved-view writes (save/delete/rename/pin) invalidate the extras slice so
// the dropdown reflects the mutation on the next tick — plus the caller's
// local reload bump covers the immediate window.
export function invalidateQueueExtras(lens, ownerEmail) {
  return queryClientInstance.invalidateQueries({ queryKey: queueFeedExtrasKey(lens, ownerEmail) });
}

// --- CRM events ---------------------------------------------------------------

// One call returns activities + the customer datalist. The legacy path was
// two independent loadAllEntityRows paged reads; the bundle keeps that shape
// ({activities, customers}) so consumers swap the queryFn without changing.
export async function fetchCrmEventsBundle() {
  const st = storeFor("crm_events");
  if (!getSessionToken()) return { activities: EMPTY_ROWS, customers: EMPTY_ROWS, composed: false };
  if (!queueFeedDown) {
    try {
      const data = await pullFeedItems("crm_events", (since) => ({
        feed: "crm_events",
        include: ["customers"],
        ...(since ? { since } : {}),
      }));
      // Per-slice fail-open: a customers extra that errored server-side
      // (payload.customers === null + extras_errors) pays the legacy read so
      // the datalist never silently empties.
      const customers = Array.isArray(data.customers)
        ? data.customers
        : await loadAllEntityRows({ entity: Customer, sort: "company_name", label: "CRM event customers", cacheTtlMs: 30000 });
      return {
        activities: [...st.rows.values()],
        customers,
        composed: true,
      };
    } catch (err) {
      if (isQueueFeedUnavailableError(err)) markQueueFeedDown();
      // fall through to the legacy pair
    }
  }
  const [activities, customers] = await Promise.all([
    loadAllEntityRows({ entity: OpportunityActivity, sort: "-updated_date", label: "CRM events" }),
    loadAllEntityRows({ entity: Customer, sort: "company_name", label: "CRM event customers", cacheTtlMs: 30000 }),
  ]);
  return { activities, customers, composed: false };
}

// --- Estimate queue -----------------------------------------------------------

export async function fetchEstimateQueueBundle() {
  const st = storeFor("estimate_queue");
  if (!getSessionToken()) return { estimates: EMPTY_ROWS, quoteDefaults: null, composed: false };
  if (!queueFeedDown) {
    try {
      const data = await pullFeedItems("estimate_queue", (since) => ({
        feed: "estimate_queue",
        include: ["quote_defaults"],
        ...(since ? { since } : {}),
      }));
      // Per-slice fail-open: extras_errors.quote_defaults means the defaults
      // read failed server-side — pay the legacy filter instead of treating
      // the absent row as "no config". A clean null really is no config row.
      let quoteDefaults = data.quote_defaults ?? null;
      if (data?.extras_errors?.quote_defaults) {
        quoteDefaults = await staffEntities.QuoteDefaults.filter({ config_name: "default" }, undefined, 1)
          .then((rows) => (Array.isArray(rows) ? rows[0] || null : null))
          .catch(() => null);
      }
      return {
        estimates: [...st.rows.values()],
        quoteDefaults,
        composed: true,
      };
    } catch (err) {
      if (isQueueFeedUnavailableError(err)) markQueueFeedDown();
      // fall through to the legacy pair
    }
  }
  const [estimates, qdRows] = await Promise.all([
    loadAllEntityRows({ entity: staffEntities.AllInOneEstimate, sort: "-created_date", label: "Estimate queues" }),
    staffEntities.QuoteDefaults.filter({ config_name: "default" }, undefined, 1).catch(() => []),
  ]);
  return { estimates, quoteDefaults: Array.isArray(qdRows) ? qdRows[0] || null : null, composed: false };
}

// Mutating queue actions (duplicate/convert/trash/restore) need the FULL
// estimate document — projected feed rows carry only the queue columns.
// One targeted read per action keeps writes byte-identical to the old flow.
export async function loadFullEstimateRow(row) {
  const id = String(row?.id || "").trim();
  if (!id) return row;
  const live = await staffEntities.AllInOneEstimate.get(id).catch(() => null);
  return live?.id ? live : row;
}

// --- My Workflow ---------------------------------------------------------------
// One call returns the open GeneralTask rows plus the page's mount extras:
// the AuthorizedEmail assignee roster and the two GlobalSettings records it
// reads (dropdown conditions, sales task descriptions). The work-order half
// still comes from the shared board snapshot — folding it in would duplicate
// boardFeed's whole-table pull for heavy fields the queue projection strips
// (notes trees, sip_checklist).
//
// Items are ALWAYS a full pull and bypass the delta store: the page's set is
// "open tasks" and a since-delta can never observe a task flipping completed
// (the query excludes it), so a merged store would hold stale open rows until
// the resync window. The table is small and the 30s server cache collapses
// mount bursts, so delta plumbing buys nothing here.
//
// A deployed runtime that predates this feed answers 400 ("This feed cannot
// be read here") — not a 404 — so this feed latches its own down flag rather
// than tripping queueFeedDown and forcing the other pages' feeds to legacy.
let myWorkflowFeedDown = false;
export function myWorkflowFeedIsDown() { return myWorkflowFeedDown; } // test/debug only

const isMissingMyWorkflowFeed = (err) => {
  if (isQueueFeedUnavailableError(err)) return true;
  return Number(err?.status ?? err?.response?.status) === 400;
};

// Identical concurrent calls (StrictMode double-mount, a reload racing the
// mount call) share one invoke. queueFeed is not governor-deduped, so the
// latch lives here keyed by the full payload.
const myWorkflowFlights = new Map();
function invokeMyWorkflow(payload) {
  const key = JSON.stringify(payload);
  const existing = myWorkflowFlights.get(key);
  if (existing) return existing;
  const p = invokeQueueFeed(payload).finally(() => {
    if (myWorkflowFlights.get(key) === p) myWorkflowFlights.delete(key);
  });
  myWorkflowFlights.set(key, p);
  return p;
}

// The legacy reads reproduce exactly what MyWorkflow mounted before the feed,
// transports included: tasks + both settings rode the platform SDK
// (base44.entities) while the roster rode the staffDataRead gateway
// (staffEntities). That mix matters in the failure path — a feed outage that
// coexists with a staffDataRead outage still leaves the SDK reads alive, and
// the fallback pays the same per-caller entity_list pressure the page paid
// before. Users/settings failures were never fatal on the page (console-only
// / silent), so those legacy paths resolve to []/null instead of throwing —
// the task pull stays load-bearing and still throws like the old
// Promise.all did.
const loadGeneralTasksLegacy = () =>
  loadAllEntityRows({ entity: base44.entities.GeneralTask, query: { completed: false }, sort: "created_date", label: "My Workflow general tasks" });
const loadWorkflowUsersLegacy = () =>
  loadAllEntityRows({ entity: staffEntities.AuthorizedEmail, sort: null, cacheTtlMs: 30000, label: "My Workflow authorized users" })
    .catch((err) => { console.error("Error loading authorized users:", err); return EMPTY_ROWS; });
const loadDropdownConditionsLegacy = () =>
  loadSingleGlobalSetting({ entity: base44.entities.GlobalSettings, settingKey: "dropdownConditions", label: "My Workflow dropdown conditions" })
    .catch((err) => { console.error("Error loading authorized users:", err); return null; });
const loadTaskDescriptionsLegacy = () =>
  loadSingleGlobalSetting({ entity: base44.entities.GlobalSettings, settingKey: "salesTaskDescriptions", label: "Sales task descriptions" })
    .catch(() => null);

// Mount bundle: {generalTasks, users, dropdownConditions, taskDescriptions,
// tasksError, composed}. Each extra degrades independently — a composed slice
// that errored server-side pays exactly that slice's legacy read. The task
// read is the only load-bearing slice; its failure is REPORTED via tasksError
// rather than thrown, so the roster/settings still land like they did when
// loadUsers ran independently of the work-order pull.
export async function fetchMyWorkflowBundle() {
  const empty = { generalTasks: EMPTY_ROWS, users: EMPTY_ROWS, dropdownConditions: null, taskDescriptions: null, tasksError: null, composed: false };
  if (!getSessionToken()) return empty;
  if (!queueFeedDown && !myWorkflowFeedDown) {
    let data = null;
    try {
      data = await invokeMyWorkflow({
        feed: "my_workflow",
        include: ["users", "dropdown_conditions", "task_descriptions"],
      });
    } catch (err) {
      if (isMissingMyWorkflowFeed(err)) myWorkflowFeedDown = true;
      // fall through to the legacy reads
    }
    if (data) {
      const errors = data?.extras_errors || {};
      let tasksError = null;
      const [generalTasks, users, dropdownConditions, taskDescriptions] = await Promise.all([
        (Array.isArray(data.items) ? Promise.resolve(data.items) : loadGeneralTasksLegacy())
          .catch((err) => { tasksError = err; return EMPTY_ROWS; }),
        Array.isArray(data.users) ? Promise.resolve(data.users) : loadWorkflowUsersLegacy(),
        errors.dropdown_conditions || data.dropdown_conditions === undefined
          ? loadDropdownConditionsLegacy()
          : Promise.resolve(data.dropdown_conditions ?? null),
        errors.task_descriptions || data.task_descriptions === undefined
          ? loadTaskDescriptionsLegacy()
          : Promise.resolve(data.task_descriptions ?? null),
      ]);
      return { generalTasks, users, dropdownConditions, taskDescriptions, tasksError, composed: true };
    }
  }
  const [tasksSettled, users, dropdownConditions, taskDescriptions] = await Promise.all([
    loadGeneralTasksLegacy().then((rows) => ({ rows, err: null }), (err) => ({ rows: EMPTY_ROWS, err })),
    loadWorkflowUsersLegacy(),
    loadDropdownConditionsLegacy(),
    loadTaskDescriptionsLegacy(),
  ]);
  return { ...empty, generalTasks: tasksSettled.rows, users, dropdownConditions, taskDescriptions, tasksError: tasksSettled.err };
}

// Reload path (mutation conflicts, dialog closes, banner retry): the task set
// refreshes alone — the page never re-pulled users/settings on reloads.
export async function fetchMyWorkflowTasks() {
  if (!getSessionToken()) return { generalTasks: EMPTY_ROWS, composed: false };
  if (!queueFeedDown && !myWorkflowFeedDown) {
    try {
      const data = await invokeMyWorkflow({ feed: "my_workflow", include: [] });
      return {
        generalTasks: Array.isArray(data.items) ? data.items : await loadGeneralTasksLegacy(),
        composed: true,
      };
    } catch (err) {
      if (isMissingMyWorkflowFeed(err)) myWorkflowFeedDown = true;
      // fall through to the legacy read
    }
  }
  return { generalTasks: await loadGeneralTasksLegacy(), composed: false };
}
