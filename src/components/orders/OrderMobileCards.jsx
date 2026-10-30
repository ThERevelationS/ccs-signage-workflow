import { useState } from "react";
import { format } from "date-fns";
import { Archive, ChevronDown } from "lucide-react";
import { effectiveOrderStatus } from "@/shared/smartsheetOrderReceivedState.mjs";

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-700",
  ordered: "bg-blue-100 text-blue-700",
  received: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export const safeOrderMobileDate = (value) => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

export default function OrderMobileCards({ orders, onOpenDetails, separateHistory = false, openCount = 0 }) {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(50);
  const [visibleLimit, setVisibleLimit] = useState(100);
  const historyCount = orders.length - openCount;
  const renderCards = (items) => items.map((order) => {
        const displayStatus = effectiveOrderStatus(order);
        const statusColor = STATUS_COLORS[displayStatus] || "bg-gray-100 text-gray-700";
        const customerName = typeof order.customer_name === 'string' ? order.customer_name.trim() : '';
        const displayCustomerName = customerName || 'Unnamed customer';
        const dateNeeded = safeOrderMobileDate(order.date_needed);
        const dateNeededOption = typeof order.date_needed_option === 'string' ? order.date_needed_option.trim() : '';
        const dateOrdered = safeOrderMobileDate(order.date_ordered);
        const dateOrderedOption = typeof order.date_ordered_option === 'string' ? order.date_ordered_option.trim() : '';
        const dateReceived = safeOrderMobileDate(order.date_received);
        const dateReceivedOption = typeof order.receipt_option === 'string' ? order.receipt_option.trim() : '';
        return (
          <button type="button"
            key={order.id}
            type="button"
            className="clay-card block w-full p-4 text-left cursor-pointer active:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            style={{ minHeight: '44px', fontSize: '14px' }}
            onClick={() => onOpenDetails && onOpenDetails(order)}
            aria-label={`Open order details for ${displayCustomerName}`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-base truncate">{displayCustomerName}</p>
                {order.request_type && (
                  <p className="text-sm text-purple-600 font-medium">{order.request_type}</p>
                )}
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${statusColor}`}>
                {order.receipt_option || (displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1))}
              </span>
            </div>

            {order.description && (
              <p className="text-sm text-gray-600 mb-2 line-clamp-2">{order.description}</p>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
              {order.quantity && <span>Qty: <span className="text-gray-700">{order.quantity}</span></span>}
              {order.vendor && <span>Vendor: <span className="text-gray-700">{order.vendor}</span></span>}
              {(dateNeededOption || dateNeeded) && (
                <span>Needed: <span className="text-gray-700">{dateNeededOption || format(dateNeeded, 'MMM d, yyyy')}</span></span>
              )}
              {(dateOrderedOption || dateOrdered) && (
                <span>Ordered: <span className="text-gray-700">{dateOrderedOption || format(dateOrdered, 'MMM d, yyyy')}</span></span>
              )}
              {(dateReceivedOption || dateReceived) && (
                <span>Received: <span className="text-gray-700">{dateReceivedOption || format(dateReceived, 'MMM d, yyyy')}</span></span>
              )}
              {order.requestor_name && <span>By: <span className="text-gray-700">{order.requestor_name}</span></span>}
            </div>
          </button>
        );
      });

  return (
    <div className="space-y-3 p-3">
      {separateHistory ? (
        <>
          <section aria-label="Open orders" className="space-y-2">
            <div className="flex items-center gap-1.5 px-1 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" aria-hidden="true" />
              Open <span className="font-semibold tabular-nums text-slate-700">{openCount}</span>
            </div>
            {openCount > 0 ? renderCards(orders.slice(0, openCount)) : (
              <p className="px-1 py-4 text-sm text-slate-500">No open orders</p>
            )}
          </section>
          <section aria-label="Received order history" className="mt-4 border-t-2 border-slate-200 pt-2">
            {historyCount > 0 ? (
              <>
                <button type="button" aria-expanded={historyExpanded} aria-controls="order-history-mobile-items"
                  aria-label={`Received history, ${historyCount} orders. ${historyExpanded ? "Collapse" : "Expand"}`}
                  className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  onClick={() => { setHistoryExpanded(expanded => !expanded); setHistoryLimit(50); }}>
                  <Archive className="h-4 w-4" aria-hidden="true" />
                  <span>History</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 tabular-nums text-slate-500">{historyCount}</span>
                  <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${historyExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                {historyExpanded && (
                  <div id="order-history-mobile-items" className="space-y-3 pt-2">
                    {renderCards(orders.slice(openCount, openCount + historyLimit))}
                    {historyCount > historyLimit && (
                      <button type="button" className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        onClick={() => setHistoryLimit(limit => limit + 50)}>
                        Show next 50 ({historyCount - historyLimit} remaining)
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-400">
                <Archive className="h-4 w-4" aria-hidden="true" /> History <span className="tabular-nums">0</span>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          {renderCards(orders.slice(0, visibleLimit))}
          {orders.length > visibleLimit && (
            <button type="button" className="min-h-11 w-full rounded-lg border border-purple-300 bg-white px-3 text-sm font-semibold text-purple-900"
              onClick={() => setVisibleLimit(limit => limit + 100)}>
              Show next 100 ({orders.length - visibleLimit} remaining)
            </button>
          )}
        </>
      )}
      {!separateHistory && orders.length === 0 && (
        <div className="text-center text-gray-400 py-10 text-sm">No orders found</div>
      )}
    </div>
  );
}