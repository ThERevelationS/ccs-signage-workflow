import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { staffEntities } from "@/components/staff/staffEntities";
import { invokeFleet } from "@/components/fleet/fleetInvoke";

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
    });
  }
  return boardState.get(entity);
};

// A full re-sync on a timer is the safety net for hard deletes and any row a
// delta pass could not surface; delta sync alone cannot observe removals.
const FULL_RESYNC_MS = 10 * 60 * 1000;

const rowUpdatedDate = (row) => String(row?.updated_date || row?.created_date || "");

async function boardFeed(payload) {
  const res = await invokeFleet("boardFeed", payload);
  const data = res?.data || res;
  if (!data || !Array.isArray(data.rows)) {
    throw new Error("Board data could not be verified completely.");
  }
  return data;
}

async function fetchFeedRows(entity, { forceFull = false } = {}) {
  const state = stateFor(entity);
  if (state.inFlight) return state.inFlight;
  state.inFlight = (async () => {
    const needsFull = forceFull || !state.cursor || Date.now() - state.fullSyncAt > FULL_RESYNC_MS;
    let data = await boardFeed({ entity, sort: "-updated_date", since: needsFull ? null : state.cursor });
    if (!needsFull && data.truncated) {
      // More changed than one delta can carry — resync rather than merge a
      // partial change window over stale rows.
      data = await boardFeed({ entity, sort: "-updated_date" });
      state.rows = new Map();
      state.fullSyncAt = Date.now();
    } else if (needsFull) {
      state.rows = new Map();
      state.fullSyncAt = Date.now();
    }
    let maxUpdated = state.cursor;
    for (const row of data.rows) {
      if (!row?.id) continue;
      state.rows.set(row.id, row);
      const updated = rowUpdatedDate(row);
      if (updated > maxUpdated) maxUpdated = updated;
    }
    if (maxUpdated) state.cursor = maxUpdated;
    const arr = [...state.rows.values()];
    const key = FEED_ENTITIES[entity]?.queryKey;
    if (key) queryClientInstance.setQueryData(key, arr);
    return arr;
  })().finally(() => {
    state.inFlight = null;
  });
  return state.inFlight;
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
