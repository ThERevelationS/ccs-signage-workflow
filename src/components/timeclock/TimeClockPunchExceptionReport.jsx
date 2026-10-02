import { AlertTriangle, Clock3, FileWarning, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

const ACTIONABLE_STATUSES = new Set(["open", "pending_manager_review", "rejected"]);

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDateTime(value) {
  const date = safeDate(value);
  return date ? format(date, "MMM d, yyyy h:mm a") : "—";
}

function typeLabel(type) {
  if (type === "late_clock_in") return "Missed Clock In";
  if (type === "missed_clock_out") return "Missed Clock Out";
  return String(type || "Punch Exception").replaceAll("_", " ");
}

function statusLabel(status) {
  if (status === "pending_manager_review") return "Needs Manager Review";
  if (status === "worked_through") return "Worked Through";
  return String(status || "open").replaceAll("_", " ");
}

function statusClass(status) {
  if (status === "resolved") return "bg-green-100 text-green-800 border-green-200";
  if (status === "worked_through") return "bg-blue-100 text-blue-800 border-blue-200";
  if (status === "cancelled") return "bg-gray-100 text-gray-700 border-gray-200";
  if (status === "rejected") return "bg-red-100 text-red-800 border-red-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
}

function reportDetail(row) {
  if (row.exception_type === "late_clock_in") {
    return row.claimed_clock_in
      ? `Employee reported arrival: ${formatDateTime(row.claimed_clock_in)}. The reconstructed shift remains subject to manager approval.`
      : "Employee reported a missing Clock In. The reconstructed shift remains subject to manager approval.";
  }
  if (row.status === "worked_through") {
    return "Employee confirmed the long-running shift was continuous work. No Clock Out was invented or changed.";
  }
  if (row.claimed_clock_out) {
    return `Employee reported prior Clock Out: ${formatDateTime(row.claimed_clock_out)}. The original shift remains auditable through manager review.`;
  }
  if (row.status === "open" && !row.employee_response && !row.submitted_at) {
    return "The scheduled monitor detected a long-running active shift. No Clock Out was created or changed; confirm with the employee before any correction.";
  }
  return "A missed Clock Out was reported. Review the linked shift and correction history before approval.";
}

export default function TimeClockPunchExceptionReport({
  punchExceptions = [],
  timeEntries = [],
  onReviewEntry,
}) {
  const entryById = new Map(timeEntries.map(entry => [entry.id, entry]));
  const rows = [...punchExceptions].sort((a, b) => {
    const aTime = safeDate(a.submitted_at || a.detected_at || a.created_date)?.getTime() || 0;
    const bTime = safeDate(b.submitted_at || b.detected_at || b.created_date)?.getTime() || 0;
    return bTime - aTime;
  });

  const actionable = rows.filter(row => ACTIONABLE_STATUSES.has(row.status)).length;
  const missedClockIns = rows.filter(row => row.exception_type === "late_clock_in").length;
  const missedClockOuts = rows.filter(row => row.exception_type === "missed_clock_out").length;
  const workedThrough = rows.filter(row => row.status === "worked_through").length;

  return (
    <div className="clay-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-amber-600" />
            Punch Exception Reports
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Employee-attested missed punches and Worked Through confirmations. These records are audit history, not automatic payroll approval.
          </p>
        </div>
        <Badge variant="outline" className={actionable ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-green-100 text-green-800 border-green-200"}>
          {actionable} need review
        </Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <div className={`rounded-lg border p-3 ${actionable ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
          <div className="text-xs text-gray-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Need Review</div>
          <div className="text-2xl font-bold text-gray-900">{actionable}</div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="text-xs text-blue-700 flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" />Missed Clock In</div>
          <div className="text-2xl font-bold text-blue-900">{missedClockIns}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs text-amber-700 flex items-center gap-1"><FileWarning className="w-3.5 h-3.5" />Missed Clock Out</div>
          <div className="text-2xl font-bold text-amber-900">{missedClockOuts}</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs text-emerald-700 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />Worked Through</div>
          <div className="text-2xl font-bold text-emerald-900">{workedThrough}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          No punch exception reports have been recorded.
        </div>
      ) : (
        <div className="mt-4 max-h-[32rem] overflow-y-auto space-y-2 pr-1">
          {rows.map(row => {
            const entry = entryById.get(row.time_entry_id) || null;
            return (
              <div key={row.id || row.case_key} className="rounded-xl border bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">{typeLabel(row.exception_type)}</span>
                      <Badge variant="outline" className={statusClass(row.status)}>{statusLabel(row.status)}</Badge>
                      {entry?.approval_status === "needs_review" && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Shift Needs Review</Badge>
                      )}
                    </div>
                    <p className="text-xs font-medium text-gray-800 mt-1">{row.user_name || row.user_email}</p>
                    <p className="text-xs text-gray-600 mt-1">{reportDetail(row)}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Detected {formatDateTime(row.detected_at)}
                      {row.submitted_at ? ` · Employee response ${formatDateTime(row.submitted_at)}` : ""}
                    </p>
                    {row.resolution_note && <p className="text-[11px] text-gray-500 mt-1">{row.resolution_note}</p>}
                  </div>
                  {entry && typeof onReviewEntry === "function" && (
                    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => onReviewEntry(entry)}>
                      View Shift
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
