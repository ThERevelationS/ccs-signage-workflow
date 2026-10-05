import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ClipboardList, Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { format, parseISO } from "date-fns";

const TimeClockAudit = base44.entities.TimeClockAudit;

const ACTION_LABELS = {
  clock_in: "Clock In",
  clock_out: "Clock Out",
  state_recovery: "State Recovery",
  admin_correction: "Admin Correction",
  admin_archive: "Admin Archive",
  notes_update: "Notes Update",
  reset: "Reset",
  badge_issue: "Badge Issue",
  badge_rotate: "Badge Rotate",
  correction_request: "Correction Request",
  correction_review: "Correction Review",
  break_start: "Break Start",
  break_end: "Break End",
  work_pause_start: "Work Pause Start",
  work_pause_resume: "Work Pause Resume",
  time_approval: "Shift Approval",
  pay_period_create: "Pay Period Created",
  pay_period_status: "Pay Period Status",
};

function outcomeClass(outcome) {
  if (outcome === "confirmed" || outcome === "recovered" || outcome === "reused") {
    return "border-green-200 bg-green-50 text-green-800";
  }
  if (outcome === "blocked") return "border-red-200 bg-red-50 text-red-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function safeTime(value) {
  try {
    const parsed = parseISO(value);
    if (Number.isNaN(parsed.getTime())) return "Unknown time";
    return format(parsed, "MMM d, yyyy h:mm:ss a");
  } catch {
    return "Unknown time";
  }
}

export default function TimeClockAuditTrail({ investigation = null }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const loadRows = async (timeEntryId = "") => {
    setLoading(true);
    setError("");
    try {
      const scopedId = String(timeEntryId || "").trim();
      const loaded = await TimeClockAudit.filter(scopedId ? { time_entry_id: scopedId } : {}, "-server_timestamp", 100);
      setRows(Array.isArray(loaded) ? loaded : []);
    } catch (err) {
      console.error("Time Clock audit load failed:", err);
      setError(err?.message || "Audit history could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  useEffect(() => {
    const timeEntryId = String(investigation?.time_entry_id || "").trim();
    if (!timeEntryId) return;
    setActionFilter("all");
    setSearch(timeEntryId);
    loadRows(timeEntryId);
  }, [investigation?.nonce, investigation?.time_entry_id]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (actionFilter !== "all" && row.action !== actionFilter) return false;
      if (!needle) return true;
      return [
        row.user_email,
        row.user_name,
        row.actor_email,
        row.reason,
        row.request_id,
        row.time_entry_id,
        row.id,
        ACTION_LABELS[row.action] || row.action,
      ].some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [rows, search, actionFilter]);

  const actions = useMemo(() => [...new Set(rows.map((row) => row.action).filter(Boolean))].sort(), [rows]);
  const investigationEvidence = Array.isArray(investigation?.evidence) ? investigation.evidence : [];
  const conflictAuditIds = useMemo(() => new Set(investigationEvidence.map((item) => String(item?.audit_id || "")).filter(Boolean)), [investigationEvidence]);
  const investigationActive = Boolean(String(investigation?.time_entry_id || "").trim());

  return (
    <div className="clay-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-600" />
            Time Clock Audit Trail
          </h3>
          <p className="text-xs text-gray-500 mt-1">Recent authoritative Time Clock actions. This view is read-only.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => loadRows(investigation?.time_entry_id)} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </Button>
      </div>

      {investigationActive && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold">Payroll membership conflict investigation</div>
              <div className="mt-1 text-xs">Showing authoritative audit history specifically for TimeEntry <span className="font-mono break-all">{investigation.time_entry_id}</span>. Rows labeled <strong>Conflicting evidence</strong> are the immutable audits that triggered the payroll verification block.</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee, actor, TimeEntry, audit or request id..." className="pl-9" />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actions.map((action) => <SelectItem key={action} value={action}>{ACTION_LABELS[action] || action}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : loading && rows.length === 0 ? (
        <div className="flex items-center justify-center p-8 text-gray-500"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading audit history...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg bg-gray-50 p-5 text-sm text-gray-500 text-center">No audit records match the current filters.</div>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {filtered.map((row) => (
            <div key={row.id} className="rounded-xl border bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-purple-600 shrink-0" />
                    <span className="font-medium text-sm">{ACTION_LABELS[row.action] || row.action || "Time Clock action"}</span>
                    <Badge variant="outline" className={outcomeClass(row.outcome)}>{row.outcome || "unknown"}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{safeTime(row.server_timestamp)}</p>
                </div>
                {row.time_entry_id && <span className="text-[11px] text-gray-400 font-mono">Entry {row.time_entry_id.slice(0, 8)}</span>}
              </div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <p><span className="text-gray-500">Employee:</span> <span className="text-gray-800">{row.user_name || row.user_email || "—"}</span></p>
                <p><span className="text-gray-500">Actor:</span> <span className="text-gray-800">{row.actor_email || "System"}</span></p>
                {row.reason && <p className="md:col-span-2"><span className="text-gray-500">Reason:</span> <span className="text-gray-800">{row.reason}</span></p>}
                {row.request_id && <p className="md:col-span-2 truncate" title={row.request_id}><span className="text-gray-500">Request:</span> <span className="font-mono text-gray-700">{row.request_id}</span></p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">Showing the 100 most recent audit records.</p>
    </div>
  );
}
