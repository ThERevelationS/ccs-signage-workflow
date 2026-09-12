import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

const SALES_STATUSES = [
  { value: "lead", label: "Lead", color: "bg-blue-100 text-blue-700" },
  { value: "quoted", label: "Quoted", color: "bg-yellow-100 text-yellow-700" },
  { value: "follow_up", label: "Follow Up", color: "bg-orange-100 text-orange-700" },
  { value: "won", label: "Won", color: "bg-green-100 text-green-700" },
  { value: "lost", label: "Lost", color: "bg-red-100 text-red-700" },
  { value: "on_hold", label: "On Hold", color: "bg-gray-100 text-gray-700" },
];

const safeDate = (d) => {
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
};

export default function SalesPipelineMobileCards({ workOrders, onOpenDetails, onUpdateWorkOrder, isRegistered }) {
  return (
    <div className="space-y-3 p-3">
      {workOrders.map((wo) => {
        const status = SALES_STATUSES.find(s => s.value === wo.sales_status);
        const deadline = wo.current_task_deadline ? safeDate(wo.current_task_deadline) : null;
        const followUp = wo.follow_up_date ? safeDate(wo.follow_up_date) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const followUpDue = followUp && followUp <= today && !["won", "lost"].includes(wo.sales_status);
        return (
          <div
            key={wo.id}
            className="clay-card p-4 cursor-pointer active:opacity-80 transition-opacity"
            style={{ minHeight: '44px', fontSize: '14px' }}
            onClick={() => onOpenDetails && onOpenDetails(wo)}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-base truncate">{wo.client_name}</p>
                {wo.title && <p className="text-gray-500 text-sm truncate">{wo.title}</p>}
              </div>
              {status && (
                <div className="flex-shrink-0" onClick={(event) => event.stopPropagation()}>
                  <Select value={wo.sales_status || "lead"} onValueChange={(value) => onUpdateWorkOrder?.(wo.id, "sales_status", value)} disabled={!isRegistered}>
                    <SelectTrigger className={`h-8 w-[112px] border-0 text-xs font-medium ${status.color}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SALES_STATUSES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {wo.current_task_description && (
              <p className="text-sm text-gray-600 mb-2 line-clamp-2">{wo.current_task_description}</p>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
              {wo.sales_rep && <span>Rep: <span className="text-gray-700">{wo.sales_rep}</span></span>}
              {wo.estimate_amount != null && (
                <span>Est: <span className="text-gray-700">${wo.estimate_amount.toLocaleString()}</span></span>
              )}
              {deadline && (
                <span>Task due: <span className="text-gray-700">{format(deadline, 'MMM d, yyyy')}</span></span>
              )}
              {followUp && (
                <span className={followUpDue ? "font-semibold text-red-700" : ""}>
                  Follow-up: <span>{format(followUp, 'MMM d, yyyy')}{followUpDue ? " • due" : ""}</span>
                </span>
              )}
            </div>
          </div>
        );
      })}
      {workOrders.length === 0 && (
        <div className="text-center text-gray-400 py-10 text-sm">No items found</div>
      )}
    </div>
  );
}