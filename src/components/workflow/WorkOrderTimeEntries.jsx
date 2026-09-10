import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Clock, User } from "lucide-react";
import { format } from "date-fns";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const TimeEntry = base44.entities.TimeEntry;

export default function WorkOrderTimeEntries({ workOrderId, workOrderTitle }) {
  const [timeEntries, setTimeEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTimeEntries();
  }, [workOrderId, workOrderTitle]);

  const loadTimeEntries = async () => {
    setIsLoading(true);
    try {
      // Get all completed time entries
      const allEntries = await loadAllEntityRows({
        entity: TimeEntry,
        query: { status: "clocked_out" },
        sort: "-clock_in",
        label: "Completed Time Entries",
      });
      
      // Filter entries that have allocations for this work order
      const relevantEntries = allEntries.filter(entry => {
        if (!entry.job_allocations) return false;
        return entry.job_allocations.some(
          alloc => alloc.work_order_id === workOrderId || 
                   alloc.work_order_title === workOrderTitle
        );
      });

      // Extract allocation details
      const allocations = [];
      relevantEntries.forEach(entry => {
        entry.job_allocations.forEach(alloc => {
          if (alloc.work_order_id === workOrderId || alloc.work_order_title === workOrderTitle) {
            allocations.push({
              id: `${entry.id}-${alloc.work_order_id}`,
              user_name: entry.user_name,
              user_email: entry.user_email,
              date: entry.clock_in,
              hours: alloc.hours,
              is_inhouse: alloc.is_inhouse,
              inhouse_task: alloc.inhouse_task
            });
          }
        });
      });

      // Sort by date descending
      allocations.sort((a, b) => new Date(b.date) - new Date(a.date));
      setTimeEntries(allocations);
    } catch (error) {
      console.error("Error loading time entries:", error);
    }
    setIsLoading(false);
  };

  const totalHours = timeEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);

  if (isLoading) {
    return (
      <div className="text-xs text-gray-400 text-center py-2">
        Loading time entries...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-green-600" />
          Time Logged
        </h3>
        <span className="text-sm font-bold text-green-700">
          {totalHours.toFixed(2)} hrs total
        </span>
      </div>

      {timeEntries.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-3">No time logged for this job</p>
      ) : (
        <div className="border rounded-lg overflow-hidden" style={{ maxHeight: '150px', overflowY: 'auto' }}>
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium text-gray-700">Employee</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-700">Date</th>
                <th className="text-right px-2 py-1.5 font-medium text-gray-700">Hours</th>
              </tr>
            </thead>
            <tbody>
              {timeEntries.map((entry, idx) => (
                <tr key={entry.id} className={`border-b last:border-b-0 hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3 text-gray-400" />
                      <span>{entry.user_name || entry.user_email?.split('@')[0] || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-gray-500">
                    {format(new Date(entry.date), "M/d/yy")}
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium text-green-700">
                    {entry.hours?.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}