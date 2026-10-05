import { useEffect, useMemo, useRef, useState } from "react";
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

const COMPANY_TIME_ZONE = "America/New_York";

function companyDateForInstant(value) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: COMPANY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month && values.day ? `${values.year}-${values.month}-${values.day}` : "";
}

function payrollMembershipFromAudit(row) {
  const details = row?.details || {};
  const action = String(row?.action || "");
  const envelope = details.payroll_membership;
  if (envelope) {
    const clockIn = String(envelope.clock_in || "");
    const companyDate = companyDateForInstant(clockIn);
    const semanticClockIn = action === "clock_in" ? String(details.employee_attested_clock_in || row?.server_timestamp || "")
      : action === "clock_out" ? String(details.result_clock_in || "")
        : action === "admin_correction" ? String(details.corrected?.clock_in || "")
          : action === "admin_archive" ? String(details.archived_entry?.clock_in || details.original?.clock_in || "") : "";
    if (Number(envelope.version || 0) !== 1 || String(envelope.time_zone || "") !== COMPANY_TIME_ZONE || !clockIn || !companyDate || companyDate !== String(envelope.company_date || "") || semanticClockIn !== clockIn) return null;
    return { company_date: companyDate, clock_in: clockIn, source: "verified_normalized_audit_envelope" };
  }
  const candidates = [details.payroll_clock_in, details.original?.clock_in, details.corrected?.clock_in, details.employee_attested_clock_in, details.detected_clock_in, details.claimed_clock_in, action === "clock_in" ? row?.server_timestamp : ""].filter(Boolean);
  for (const value of candidates) {
    const companyDate = companyDateForInstant(value);
    if (companyDate) return { company_date: companyDate, clock_in: String(value), source: "immutable_audit" };
  }
  return null;
}

function conflictEvidenceMatchesAudit(expected, row) {
  const membership = payrollMembershipFromAudit(row);
  return String(row?.id || "") === String(expected?.audit_id || "")
    && String(row?.action || "") === String(expected?.action || "")
    && String(row?.request_id || "") === String(expected?.request_id || "")
    && String(row?.server_timestamp || "") === String(expected?.server_timestamp || "")
    && String(membership?.company_date || "") === String(expected?.company_date || "")
    && String(membership?.clock_in || "") === String(expected?.clock_in || "")
    && String(membership?.source || "") === String(expected?.source || "");
}

export default function TimeClockAuditTrail({ investigation = null, onExitInvestigation }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const requestSequenceRef = useRef(0);
  const mountedRef = useRef(true);

  const loadRows = async (timeEntryId = "", expectedEvidence = []) => {
    if (!mountedRef.current) return;
    const requestSequence = ++requestSequenceRef.current;
    setLoading(true);
    setError("");
    try {
      const scopedId = String(timeEntryId || "").trim();
      const loaded = await TimeClockAudit.filter(scopedId ? { time_entry_id: scopedId } : {}, "-server_timestamp", 100);
      if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return;
      const loadedRows = Array.isArray(loaded) ? loaded : [];
      if (scopedId) {
        const mismatchedRows = loadedRows.filter((row) => String(row?.time_entry_id || "").trim() !== scopedId);
        if (mismatchedRows.length > 0) {
          console.error("Time Clock audit investigation integrity failure:", {
            requested_time_entry_id: scopedId,
            mismatched_audit_ids: mismatchedRows.map((row) => row?.id).filter(Boolean),
          });
          setRows([]);
          setError(`Audit investigation integrity check failed: ${mismatchedRows.length} returned record${mismatchedRows.length === 1 ? " does" : "s do"} not belong to TimeEntry ${scopedId}. No scoped audit records are being displayed.`);
          return;
        }
        const requiredEvidence = (Array.isArray(expectedEvidence) ? expectedEvidence : []).filter((item) => String(item?.audit_id || "").trim());
        const requiredAuditIds = [...new Set(requiredEvidence.map((item) => String(item.audit_id).trim()))];
        const returnedAuditIds = new Set(loadedRows.map((row) => String(row?.id || "").trim()).filter(Boolean));
        const missingAuditIds = requiredAuditIds.filter((id) => !returnedAuditIds.has(id));
        if (missingAuditIds.length > 0) {
          console.error("Time Clock audit investigation completeness failure:", {
            requested_time_entry_id: scopedId,
            missing_conflict_audit_ids: missingAuditIds,
            returned_audit_count: loadedRows.length,
          });
          setRows([]);
          setError(`Audit investigation completeness check failed: ${missingAuditIds.length} expected conflict audit record${missingAuditIds.length === 1 ? " is" : "s are"} missing from the scoped result. No scoped audit records are being displayed.`);
          return;
        }
        const rowsByAuditId = new Map(loadedRows.map((row) => [String(row?.id || "").trim(), row]));
        const contradictoryEvidence = requiredEvidence.filter((expected) => !conflictEvidenceMatchesAudit(expected, rowsByAuditId.get(String(expected.audit_id).trim())));
        if (contradictoryEvidence.length > 0) {
          console.error("Time Clock audit investigation evidence-content failure:", {
            requested_time_entry_id: scopedId,
            contradictory_conflict_audit_ids: contradictoryEvidence.map((item) => item.audit_id),
          });
          setRows([]);
          setError(`Audit investigation evidence-content check failed: ${contradictoryEvidence.length} expected conflict audit record${contradictoryEvidence.length === 1 ? " does" : "s do"} not match the immutable evidence returned by Payroll History. No scoped audit records are being displayed.`);
          return;
        }
      }
      setRows(loadedRows);
    } catch (err) {
      if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return;
      console.error("Time Clock audit load failed:", err);
      setError(err?.message || "Audit history could not be loaded.");
    } finally {
      if (mountedRef.current && requestSequence === requestSequenceRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const initialTimeEntryId = String(investigation?.time_entry_id || "").trim();
    const initialExpectedEvidence = Array.isArray(investigation?.evidence) ? investigation.evidence : [];
    if (initialTimeEntryId) {
      setActionFilter("all");
      setSearch(initialTimeEntryId);
      loadRows(initialTimeEntryId, initialExpectedEvidence);
    } else {
      loadRows();
    }
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
    };
  }, []);

  const previousInvestigationRef = useRef({
    nonce: investigation?.nonce,
    time_entry_id: String(investigation?.time_entry_id || "").trim(),
  });

  useEffect(() => {
    const timeEntryId = String(investigation?.time_entry_id || "").trim();
    const previous = previousInvestigationRef.current;
    const changed = previous.nonce !== investigation?.nonce || previous.time_entry_id !== timeEntryId;
    previousInvestigationRef.current = { nonce: investigation?.nonce, time_entry_id: timeEntryId };
    if (!changed || !timeEntryId) return;
    setActionFilter("all");
    setSearch(timeEntryId);
    const expectedEvidence = Array.isArray(investigation?.evidence) ? investigation.evidence : [];
    loadRows(timeEntryId, expectedEvidence);
  }, [investigation?.nonce, investigation?.time_entry_id, investigation?.evidence]);

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
        <Button type="button" size="sm" variant="outline" onClick={() => loadRows(investigation?.time_entry_id, investigationEvidence)} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </Button>
      </div>

      {investigationActive && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold">Payroll membership conflict investigation</div>
                <div className="mt-1 text-xs">Showing authoritative audit history specifically for TimeEntry <span className="font-mono break-all">{investigation.time_entry_id}</span>. Rows labeled <strong>Conflicting evidence</strong> are the immutable audits that triggered the payroll verification block.</div>
              </div>
            </div>
            {onExitInvestigation && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading}
                className="shrink-0 bg-white border-amber-300 text-amber-950"
                onClick={() => {
                  setSearch("");
                  setActionFilter("all");
                  onExitInvestigation();
                  loadRows();
                }}
              >
                Show Recent Audit History
              </Button>
            )}
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
          {filtered.map((row) => {
            const isConflictEvidence = conflictAuditIds.has(String(row.id || ""));
            const claimedEvidence = investigationEvidence.find((item) => String(item?.audit_id || "") === String(row.id || ""));
            return (
              <div key={row.id} className={`rounded-xl border p-3 ${isConflictEvidence ? "border-amber-400 bg-amber-50 ring-1 ring-amber-200" : "bg-white"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ClipboardList className={`w-4 h-4 shrink-0 ${isConflictEvidence ? "text-amber-700" : "text-purple-600"}`} />
                      <span className="font-medium text-sm">{ACTION_LABELS[row.action] || row.action || "Time Clock action"}</span>
                      <Badge variant="outline" className={outcomeClass(row.outcome)}>{row.outcome || "unknown"}</Badge>
                      {isConflictEvidence && <Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-900">Conflicting evidence</Badge>}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{safeTime(row.server_timestamp)}</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <p><span className="text-gray-500">Employee:</span> <span className="text-gray-800">{row.user_name || row.user_email || "—"}</span></p>
                  <p><span className="text-gray-500">Actor:</span> <span className="text-gray-800">{row.actor_email || "System"}</span></p>
                  {row.reason && <p className="md:col-span-2"><span className="text-gray-500">Reason:</span> <span className="text-gray-800">{row.reason}</span></p>}
                  {row.time_entry_id && <p className="md:col-span-2 break-all"><span className="text-gray-500">TimeEntry:</span> <span className="font-mono text-gray-700">{row.time_entry_id}</span></p>}
                  {row.id && <p className="md:col-span-2 break-all"><span className="text-gray-500">Audit:</span> <span className="font-mono text-gray-700">{row.id}</span></p>}
                  {row.request_id && <p className="md:col-span-2 break-all"><span className="text-gray-500">Request:</span> <span className="font-mono text-gray-700">{row.request_id}</span></p>}
                  {isConflictEvidence && claimedEvidence && (
                    <div className="md:col-span-2 mt-1 rounded border border-amber-200 bg-white p-2 text-amber-950">
                      <div className="font-semibold">Payroll membership claimed by this audit</div>
                      <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-1">
                        <span>Company date: {claimedEvidence.company_date || "Unavailable"}</span>
                        <span>Clock in: {safeTime(claimedEvidence.clock_in)}</span>
                        <span>Source: {claimedEvidence.source || "Unavailable"}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">Showing the 100 most recent audit records.</p>
    </div>
  );
}
