import { isFulfilledOrder } from "@/shared/smartsheetOrderReceivedState.mjs";

// The spreadsheet keeps real Order indexes stable for keyboard navigation and
// export. Only the virtual display gains one non-data History heading row.
export function orderHistoryLayout(sortedOrders, filterStatus) {
  const split = filterStatus === "all_with_received";
  const openCount = split ? sortedOrders.filter(order => !isFulfilledOrder(order)).length : 0;
  const receivedCount = split ? sortedOrders.length - openCount : 0;
  const historyVirtualIndex = split && receivedCount > 0 ? openCount : null;
  return {
    split,
    openCount,
    receivedCount,
    historyVirtualIndex,
    virtualCount: sortedOrders.length + (historyVirtualIndex === null ? 0 : 1),
    orderIndexAtVirtual: (virtualIndex) =>
      historyVirtualIndex !== null && virtualIndex > historyVirtualIndex
        ? virtualIndex - 1 : virtualIndex,
  };
}
