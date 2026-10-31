import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { staffEntities } from "@/components/staff/staffEntities";
import { invokeFleet } from "@/components/fleet/fleetInvoke";
import { getSessionToken } from "@/components/auth/EmailGate";

export const ALL_WORK_ORDERS_KEY = ["workOrders", "all"];
export const ALL_ORDERS_KEY = ["orders", "all"];

// Shared row store for the app's biggest tables. Every consumer — board pages,
// spreadsheets, schedulers — reads through boardFeed instead of paging the
// entity API, which keeps the heavy smartsheet/work_notes blobs off the wire
// (~70% smaller) and turns steady-state refreshes into single updated_date
// delta reads instead of full-table re-pages that exhausted the entity_list
// rate budget and surfaced as 500s.
const FEED_ENTITIES = {
  WorkOrder: { queryKey: ALL_WORK_ORDERS_KEY },
  Order: { queryKey: ALL_ORDERS_KEY },
};

const boardState = new Map();
const stateFor = (entity) => {
  if (!boardState.has(entity)) {
    boardState.set(entity, {
      rows: new Map(),
      cursor: "",
      fullSyncAt: 0,
      inFlight: null,
      hydrated: false,
      // True when the last FULL pull hit the backend row cap — the row set is
      // then the first N rows, not the whole table. Boards read this through
      // the meta key/hook below and show an honest "showing first N" notice
      // instead of silently presenting a partial board as complete.
      truncated: false,
    });
  }
  return boardState.get(entity);
};

// --- Cross-session persistence + cross-tab sharing ----------------------------------
// Every reload used to pay a full boardFeed pull (~3k rows) before painting.
// Snapshots persist to IndexedDB and broadcast to sibling tabs, so a fresh
// load paints from the last snapshot instantly and only delta-syncs upstream.
const IDB_NAME = 'ccs-board-cache';
const IDB_STORE = 'snapshots';
const boardChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ccs-board-sync') : null;
let idbPromise = null;
const idb = () => (idbPromise ||= new Promise((resolve) => {
  try {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  } catch { resolve(null); }
}));
async function idbRead(entity) {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(entity);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}
async function idbWrite(entity, state) {
  const db = await idb();
  if (!db) return;
  try {
    db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE)
      .put({ rows: state.rows, cursor: state.cursor, fullSyncAt: state.fullSyncAt, truncated: state.truncated === true, savedAt: Date.now() }, entity);
  } catch { /* quota or serialization failures are non-fatal */ }
}
const publishSnapshot = (entity, state) => {
  const key = FEED_ENTITIES[entity]?.queryKey;
  if (key) queryClientInstance.setQueryData(key, [...state.rows.values()]);
  // Boards subscribe to this meta key for the honest completeness flag.
  queryClientInstance.setQueryData(boardMetaKey(entity), getBoardFeedMeta(entity));
  try {
    boardChannel?.postMessage({ type: 'snapshot', entity, rows: state.rows, cursor: state.cursor, fullSyncAt: state.fullSyncAt, truncated: state.truncated === true });
  } catch { /* cross-context clone failures are non-fatal */ }
};
async function ensureHydrated(entity) {
  const state = stateFor(entity);
  if (state.hydrated) return;
  state.hydrated = true;
  const snap = await idbRead(entity).catch(() => null);
  if (snap?.rows instanceof Map && snap.rows.size > 0 && state.rows.size === 0) {
    state.rows = snap.rows;
    state.cursor = snap.cursor || '';
    state.fullSyncAt = snap.fullSyncAt || 0;
    state.truncated = snap.truncated === true;
    publishSnapshot(entity, state);
    return;
  }
  if (boardChannel) {
    try {
      boardChannel.postMessage({ type: 'request', entity });
    } catch { /* clone failures are non-fatal */ }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}
if (boardChannel) {
  boardChannel.onmessage = (event) => {
    const msg = event?.data || {};
    if (!FEED_ENTITIES[msg.entity]) return;
    const state = stateFor(msg.entity);
    if (msg.type === 'snapshot' && msg.rows instanceof Map && state.rows.size === 0) {
      state.rows = msg.rows;
      state.cursor = msg.cursor || '';
      state.fullSyncAt = msg.fullSyncAt || 0;
      state.truncated = msg.truncated === true;
      publishSnapshot(msg.entity, state);
    } else if (msg.type === 'request' && state.rows.size > 0) {
      publishSnapshot(msg.entity, state);
    }
  };
}
// A full re-sync on a timer is the safety net for hard deletes and any row a
// delta pass could not surface; delta sync alone cannot observe removals.
// Full resyncs re-pull the entire table (~3.1k rows) and are the dominant
// entity-read volume for warm sessions. 30 minutes keeps the board honest
// while cutting steady-state feed traffic ~3x vs the old 10-minute cadence;
// a truncated delta still forces a resync immediately.
const FULL_RESYNC_MS = 30 * 60 * 1000;

const rowUpdatedDate = (row) => String(row?.updated_date || row?.created_date || "");

async function boardFeed(payload) {
  const res = await invokeFleet("boardFeed", payload);
  const data = res?.data || res;
  if (!data || !Array.isArray(data.rows)) {
    throw new Error("Board data could not be verified completely.");
  }
  return data;
}

async function fetchFeedRows(entity, { forceFull = false, preferSnapshot = false } = {}) {
  const state = stateFor(entity);
  // Guests must never hydrate from the persisted snapshot — that cache holds
  // the last signed-in session's board and would leak it to a signed-out tab
  // on a shared device. Guests get an empty board, same as the gateways give.
  if (!getSessionToken()) return [];
  if (state.inFlight) {
    // A snapshot-first caller joins a running refresh only through hydration;
    // it must not wait out the network pass it did not start.
    if (preferSnapshot && !forceFull) {
      await (state.hydratePromise || Promise.resolve());
      if (state.rows.size > 0) return [...state.rows.values()];
    }
    return state.inFlight;
  }
  state.inFlight = (async () => {
    const hydrate = ensureHydrated(entity);
    state.hydratePromise = hydrate;
    await hydrate;
    const needsFull = forceFull || !state.cursor || Date.now() - state.fullSyncAt > FULL_RESYNC_MS;
    let data = await boardFeed({ entity, sort: "-updated_date", since: needsFull ? null : state.cursor });
    // A delta pull merges onto the current base; only a full pull replaces it
    // and can prove the row set complete again.
    let dataIsFullPull = needsFull;
    if (!needsFull && data.truncated) {
      // More changed than one delta can carry — resync rather than merge a
      // partial change window over stale rows.
      data = await boardFeed({ entity, sort: "-updated_date" });
      state.rows = new Map();
      state.fullSyncAt = Date.now();
      dataIsFullPull = true;
    } else if (needsFull) {
      state.rows = new Map();
      state.fullSyncAt = Date.now();
    }
    if (dataIsFullPull) {
      // "truncated" is the backend's hard row-cap flag and a FULL pull can
      // arrive truncated too — the branch above only catches the delta case.
      // Keep the flag on state so boards can warn "showing first N" instead
      // of silently presenting a clamped feed as the whole table.
      state.truncated = data.truncated === true;
      if (state.truncated) {
        console.warn(`[workOrderCache] ${entity} feed truncated at ${data.rows.length} rows — the board is showing a partial set.`);
      }
    }
    let maxUpdated = state.cursor;
    for (const row of data.rows) {
      if (!row?.id) continue;
      state.rows.set(row.id, row);
      const updated = rowUpdatedDate(row);
      if (updated > maxUpdated) maxUpdated = updated;
    }
    if (maxUpdated) state.cursor = maxUpdated;
    idbWrite(entity, state);
    publishSnapshot(entity, state);
    return [...state.rows.values()];
  })().finally(() => {
    state.inFlight = null;
  });
  // Snapshot-first reads paint the hydrated board immediately while the
  // refresh continues in the background; publishSnapshot still lands the
  // delta for react-query subscribers and sibling tabs when it completes.
  if (preferSnapshot && !forceFull) {
    await (state.hydratePromise || state.inFlight);
    if (state.rows.size > 0) return [...state.rows.values()];
  }
  return state.inFlight;
}

const boardMetaKey = (entity) => ["boardFeedMeta", entity];

export function getBoardFeedMeta(entity) {
  const state = stateFor(entity);
  return { truncated: state.truncated === true, count: state.rows.size };
}

// Boards subscribe here for the honest completeness flag — re-renders when a
// pull publishes fresh meta (including a truncated full pull).
export function useBoardFeedMeta(entity) {
  const query = useQuery({
    queryKey: boardMetaKey(entity),
    queryFn: () => getBoardFeedMeta(entity),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
  return query.data || getBoardFeedMeta(entity);
}

export function fetchAllWorkOrders(options) {
  return fetchFeedRows("WorkOrder", options);
}

export function fetchAllOrders(options) {
  return fetchFeedRows("Order", options);
}

export function refreshAllWorkOrders() {
  return queryClientInstance.refetchQueries({ queryKey: ALL_WORK_ORDERS_KEY });
}

function applyWorkOrderEvent(rows, event) {
  if (!Array.isArray(rows)) return rows;
  const id = String(event?.id || event?.data?.id || "").trim();
  if (!id) return rows;
  if (event?.type === "delete" || event?.data?.deleted === true) {
    return rows.filter((row) => row.id !== id);
  }
  const patch = event?.data && typeof event.data === "object" ? event.data : {};
  const exists = rows.some((row) => row.id === id);
  if (!exists) return [{ ...patch, id }, ...rows];
  return rows.map((row) => (row.id === id ? { ...row, ...patch, id } : row));
}

let subscriptionCount = 0;
let unsubscribeWorkOrders = null;

function retainWorkOrderSubscription() {
  subscriptionCount += 1;
  if (unsubscribeWorkOrders || subscriptionCount > 1) return;
  try {
    unsubscribeWorkOrders = staffEntities.WorkOrder.subscribe((event) => {
      queryClientInstance.setQueryData(ALL_WORK_ORDERS_KEY, (rows) => applyWorkOrderEvent(rows, event));
      const state = stateFor("WorkOrder");
      const id = String(event?.id || event?.data?.id || "").trim();
      if (!id) return;
      if (event?.type === "delete" || event?.data?.deleted === true) {
        state.rows.delete(id);
      } else if (event?.data && typeof event.data === "object") {
        state.rows.set(id, { ...(state.rows.get(id) || {}), ...event.data, id });
      }
    });
  } catch {
    unsubscribeWorkOrders = null;
  }
}

function releaseWorkOrderSubscription() {
  subscriptionCount = Math.max(0, subscriptionCount - 1);
  if (subscriptionCount > 0) return;
  if (typeof unsubscribeWorkOrders === "function") unsubscribeWorkOrders();
  unsubscribeWorkOrders = null;
}

export function useAllWorkOrders({ enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    retainWorkOrderSubscription();
    return () => releaseWorkOrderSubscription();
  }, [enabled]);

  return useQuery({
    queryKey: ALL_WORK_ORDERS_KEY,
    queryFn: () => fetchAllWorkOrders(),
    enabled,
    staleTime: 60000,
    refetchInterval: 120000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}