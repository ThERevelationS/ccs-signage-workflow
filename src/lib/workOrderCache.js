import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { queryClientInstance } from "@/lib/query-client";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

export const ALL_WORK_ORDERS_KEY = ["workOrders", "all"];

export function fetchAllWorkOrders() {
  return loadAllEntityRows({
    entity: base44.entities.WorkOrder,
    sort: "-updated_date",
    label: "Work Orders",
  });
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
    unsubscribeWorkOrders = base44.entities.WorkOrder.subscribe((event) => {
      queryClientInstance.setQueryData(ALL_WORK_ORDERS_KEY, (rows) => applyWorkOrderEvent(rows, event));
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
    queryFn: fetchAllWorkOrders,
    enabled,
    staleTime: 60000,
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}
