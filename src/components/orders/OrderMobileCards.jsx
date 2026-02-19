import React from "react";
import { format } from "date-fns";

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-700",
  ordered: "bg-blue-100 text-blue-700",
  received: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const safeDate = (d) => {
  if (!d) return null;
  try {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  } catch { return null; }
};

export default function OrderMobileCards({ orders, onOpenDetails }) {
  return (
    <div className="space-y-3 p-3">
      {orders.map((order) => {
        const statusColor = STATUS_COLORS[order.status] || "bg-gray-100 text-gray-700";
        const dateNeeded = safeDate(order.date_needed);
        return (
          <div
            key={order.id}
            className="clay-card p-4 cursor-pointer active:opacity-80 transition-opacity"
            style={{ minHeight: '44px', fontSize: '14px' }}
            onClick={() => onOpenDetails && onOpenDetails(order)}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-base truncate">{order.customer_name}</p>
                {order.request_type && (
                  <p className="text-sm text-purple-600 font-medium">{order.request_type}</p>
                )}
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${statusColor}`}>
                {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
              </span>
            </div>

            {order.description && (
              <p className="text-sm text-gray-600 mb-2 line-clamp-2">{order.description}</p>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
              {order.quantity && <span>Qty: <span className="text-gray-700">{order.quantity}</span></span>}
              {order.vendor && <span>Vendor: <span className="text-gray-700">{order.vendor}</span></span>}
              {dateNeeded && (
                <span>Needed: <span className="text-gray-700">{format(dateNeeded, 'MMM d, yyyy')}</span></span>
              )}
              {order.requestor_name && <span>By: <span className="text-gray-700">{order.requestor_name}</span></span>}
            </div>
          </div>
        );
      })}
      {orders.length === 0 && (
        <div className="text-center text-gray-400 py-10 text-sm">No orders found</div>
      )}
    </div>
  );
}