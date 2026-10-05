import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ClipboardList, Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { format, parseISO } from "date-fns";
import { PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION, classifyAuthoritativePayrollAuditIntegrity, payrollMembershipConflictEvidenceIsMalformed, payrollMembershipFromAudit, validatePayrollMembershipConflictEvidence } from "../../../base44/shared/timeClockPayrollMembershipEvidence.mjs";

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

function integrityValidationSummary(validation) {
  const failures = [];
  if (validation?.missing_fields?.length) failures.push(`Missing: ${validation.missing_fields.join(", ")}`);
  if (validation?.invalid_contract_version) failures.push("Unsupported evidence contract version");
  if (validation?.invalid_action) failures.push("Unsupported audit action");
  if (validation?.invalid_source) failures.push("Unsupported evidence source");
  if (validation?.invalid_server_timestamp) failures.push("Invalid server timestamp");
  if (validation?.invalid_clock_in) failures.push("Invalid clock-in timestamp");
  if (validation?.invalid_company_date) failures.push("Invalid company date");
  if (validation?.company_date_clock_in_mismatch) failures.push("Company date does not match clock-in in America/New_York");
  if (validation?.invalid_action_source_pair) failures.push("Invalid action/source combination");
  return failures;
}

function conflictEvidenceMatchesAudit(expected, row) {
  const membership = payrollMembershipFromAudit(row);
  return Number(expected?.contract_version || 0) === PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION
    && String(row?.id || "") === String(expected?.audit_id || "")
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
  const [integrityDiagnostics, setIntegrityDiagnostics] = useState([]);
  const requestSequenceRef = useRef(0);
  const mountedRef = useRef(true);

  const loadRows = async (timeEntryId = "", expectedEvidence = [], integrityMode = false) => {
    if (!mountedRef.current) return;
    const requestSequence = ++requestSequenceRef.current;
    setLoading(true);
    setError("");
    setIntegrityDiagnostics([]);
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
        const requiredEvidence = Array.isArray(expectedEvidence) ? expectedEvidence : [];
        if (integrityMode) {
          const {
            diagnostics: authoritativeIntegrityDiagnostics,
            duplicate_audit_ids: duplicateIntegrityAuditIds,
          } = classifyAuthoritativePayrollAuditIntegrity(loadedRows);
          if (authoritativeIntegrityDiagnostics.length > 0) {
            const malformedCount = authoritativeIntegrityDiagnostics.filter((item) => item.validation).length;
            const duplicateRecordCount = authoritativeIntegrityDiagnostics.filter((item) => item.duplicate_immutable_audit_id).length;
            console.error("Time Clock audit integrity investigation authoritative evidence failure:", {
              requested_time_entry_id: scopedId,
              authoritative_integrity_diagnostics: authoritativeIntegrityDiagnostics,
              duplicate_immutable_audit_ids: duplicateIntegrityAuditIds,
            });
            setIntegrityDiagnostics(authoritativeIntegrityDiagnostics);
            setRows(loadedRows);
            const issueSummary = [
              malformedCount > 0 ? `${malformedCount} malformed provenance record${malformedCount === 1 ? "" : "s"}` : "",
              duplicateRecordCount > 0 ? `${duplicateRecordCount} record${duplicateRecordCount === 1 ? "" : "s"} sharing duplicate immutable Audit IDs` : "",
            ].filter(Boolean).join(" and ");
            setError(`Payroll evidence integrity investigation found ${issueSummary}. The scoped records below are diagnostic only and are not being presented as trusted payroll evidence.`);
            return;
          }
        }
        const missingRequiredAuditIdCount = requiredEvidence.filter((item) => !String(item?.audit_id || "").trim()).length;
        if (missingRequiredAuditIdCount > 0) {
          console.error("Time Clock audit investigation evidence-identity failure:", {
            requested_time_entry_id: scopedId,
            missing_conflict_audit_id_count: missingRequiredAuditIdCount,
          });
          setRows([]);
          setError(`Audit investigation evidence-identity check failed: ${missingRequiredAuditIdCount} expected conflict evidence record${missingRequiredAuditIdCount === 1 ? " has" : "s have"} no immutable audit ID. No scoped audit records are being displayed.`);
          return;
        }
        const malformedRequiredEvidence = requiredEvidence
          .map(validatePayrollMembershipConflictEvidence)
          .filter(payrollMembershipConflictEvidenceIsMalformed);
        if (malformedRequiredEvidence.length > 0) {
          console.error("Time Clock audit investigation evidence-shape failure:", {
            requested_time_entry_id: scopedId,
            malformed_conflict_evidence: malformedRequiredEvidence,
          });
          setRows([]);
          setError(`Audit investigation evidence-shape check failed: ${malformedRequiredEvidence.length} expected conflict evidence record${malformedRequiredEvidence.length === 1 ? " is" : "s are"} missing required immutable provenance fields. No scoped audit records are being displayed.`);
          return;
        }
        const requiredAuditIds = requiredEvidence.map((item) => String(item.audit_id).trim());
        const duplicateRequiredAuditIds = [...new Set(requiredAuditIds.filter((id, index) => requiredAuditIds.indexOf(id) !== index))];
        if (duplicateRequiredAuditIds.length > 0) {
          console.error("Time Clock audit investigation evidence-identity failure:", {
            requested_time_entry_id: scopedId,
            duplicate_conflict_audit_ids: duplicateRequiredAuditIds,
          });
          setRows([]);
          setError(`Audit investigation evidence-identity check failed: ${duplicateRequiredAuditIds.length} conflict audit ID${duplicateRequiredAuditIds.length === 1 ? " is" : "s are"} duplicated in the expected evidence. No scoped audit records are being displayed.`);
          return;
        }
        const returnedAuditIdList = loadedRows.map((row) => String(row?.id || "").trim());
        const missingReturnedAuditIdCount = returnedAuditIdList.filter((id) => !id).length;
        if (missingReturnedAuditIdCount > 0) {
          console.error("Time Clock audit investigation returned-identity failure:", {
            requested_time_entry_id: scopedId,
            missing_returned_audit_id_count: missingReturnedAuditIdCount,
          });
          setRows([]);
          setError(`Audit investigation returned-identity check failed: ${missingReturnedAuditIdCount} returned audit record${missingReturnedAuditIdCount === 1 ? " has" : "s have"} no immutable audit ID. No scoped audit records are being displayed.`);
          return;
        }
        const duplicateReturnedAuditIds = [...new Set(returnedAuditIdList.filter((id, index) => returnedAuditIdList.indexOf(id) !== index))];
        if (duplicateReturnedAuditIds.length > 0) {
          console.error("Time Clock audit investigation returned-identity failure:", {
            requested_time_entry_id: scopedId,
            duplicate_returned_audit_ids: duplicateReturnedAuditIds,
          });
          setRows([]);
          setError(`Audit investigation returned-identity check failed: ${duplicateReturnedAuditIds.length} returned audit ID${duplicateReturnedAuditIds.length === 1 ? " is" : "s are"} duplicated in the scoped result. No scoped audit records are being displayed.`);
          return;
        }
        const returnedAuditIds = new Set(returnedAuditIdList);
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
    const initialIntegrityMode = investigation?.mode === "integrity";
    if (initialTimeEntryId) {
      setActionFilter("all");
      setSearch(initialTimeEntryId);
      loadRows(initialTimeEntryId, initialExpectedEvidence, initialIntegrityMode);
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
    loadRows(timeEntryId, expectedEvidence, investigation?.mode === "integrity");
  }, [investigation?.nonce, investigation?.time_entry_id, investigation?.evidence, investigation?.mode]);

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
  const integrityInvestigation = investigationActive && investigation?.mode === "integrity";
  const integrityDiagnosticByRowIndex = useMemo(() => new Map(integrityDiagnostics.map((item) => [Number(item?.diagnostic_row_index), item])), [integrityDiagnostics]);

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
        <Button type="button" size="sm" variant="outline" onClick={() => loadRows(investigation?.time_entry_id, investigationEvidence, integrityInvestigation)} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </Button>
      </div>

      {investigationActive && (
        <div className={`mb-4 rounded-lg border p-3 text-sm ${integrityInvestigation ? "border-red-300 bg-red-50 text-red-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold">{integrityInvestigation ? "Payroll evidence integrity investigation" : "Payroll membership conflict investigation"}</div>
                <div className="mt-1 text-xs">
                  {integrityInvestigation ? (
                    <>Showing authoritative audit history specifically for TimeEntry <span className="font-mono break-all">{investigation.time_entry_id}</span>. The invalid provenance was not passed into this view or treated as trusted evidence; inspect these authoritative records directly.</>
                  ) : (
                    <>Showing authoritative audit history specifically for TimeEntry <span className="font-mono break-all">{investigation.time_entry_id}</span>. Rows labeled <strong>Conflicting evidence</strong> are the immutable audits that triggered the payroll verification block.</>
                  )}
                </div>
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

      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center p-8 text-gray-500"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading audit history...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg bg-gray-50 p-5 text-sm text-gray-500 text-center">No audit records match the current filters.</div>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {filtered.map((row) => {
            const sourceRowIndex = rows.indexOf(row);
            const isConflictEvidence = conflictAuditIds.has(String(row.id || ""));
            const claimedEvidence = investigationEvidence.find((item) => String(item?.audit_id || "") === String(row.id || ""));
            const integrityDiagnostic = integrityDiagnosticByRowIndex.get(sourceRowIndex);
            return (
              <div key={integrityInvestigation ? `diagnostic-row-${sourceRowIndex}` : (String(row.id || "").trim() || `audit-row-${sourceRowIndex}`)} className={`rounded-xl border p-3 ${integrityDiagnostic ? "border-red-400 bg-red-50 ring-1 ring-red-200" : isConflictEvidence ? "border-amber-400 bg-amber-50 ring-1 ring-amber-200" : "bg-white"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ClipboardList className={`w-4 h-4 shrink-0 ${isConflictEvidence ? "text-amber-700" : "text-purple-600"}`} />
                      <span className="font-medium text-sm">{ACTION_LABELS[row.action] || row.action || "Time Clock action"}</span>
                      <Badge variant="outline" className={outcomeClass(row.outcome)}>{row.outcome || "unknown"}</Badge>
                      {isConflictEvidence && <Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-900">Conflicting evidence</Badge>}
                      {integrityDiagnostic?.validation && <Badge variant="outline" className="border-red-400 bg-red-100 text-red-900">Malformed authoritative provenance</Badge>}
                      {integrityDiagnostic?.duplicate_immutable_audit_id && <Badge variant="outline" className="border-red-400 bg-red-100 text-red-900">Duplicate immutable Audit ID</Badge>}
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
                  {integrityDiagnostic && (
                    <div className="md:col-span-2 mt-1 rounded border border-red-300 bg-white p-2 text-red-950">
                      <div className="font-semibold">Diagnostic only — not trusted payroll evidence</div>
                      <div className="mt-1 text-xs">
                        {integrityDiagnostic.validation ? "This authoritative audit record failed the shared payroll-membership evidence contract. " : ""}
                        {integrityDiagnostic.duplicate_immutable_audit_id ? "This immutable Audit ID is shared by multiple authoritative records, so none of those records can be treated as uniquely identified payroll evidence. " : ""}
                        Audit ID: <span className="font-mono break-all">{row.id || "Missing immutable audit ID"}</span>.
                      </div>
                      {integrityDiagnostic.validation && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {integrityValidationSummary(integrityDiagnostic.validation).map((failure) => (
                            <Badge key={failure} variant="outline" className="border-red-300 bg-red-50 text-red-900">{failure}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
