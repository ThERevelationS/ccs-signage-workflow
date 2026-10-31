import { useEffect, useMemo, useRef, useState } from "react";
import TimeQuickPick from "@/components/timeclock/TimeQuickPick";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CalendarRange, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Download, FileLock2, History, Loader2, LockKeyhole, RotateCcw, ShieldCheck, ShieldX } from "lucide-react";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { staffEntities } from "@/components/staff/staffEntities";

const TimeClockPayPeriod = staffEntities.TimeClockPayPeriod;
const COMPANY_TIME_ZONE = "America/New_York";

function formatEvidenceTime(value) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: COMPANY_TIME_ZONE, month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }).format(date);
}

function reconcileGenerationEvidence(generation) {
  if (!generation?.shift_evidence_verified || !Array.isArray(generation.shifts)) return null;
  const groups = new Map();
  let totalHours = 0;
  for (const shift of generation.shifts) {
    const email = String(shift?.user_email || "Unknown employee").trim().toLowerCase() || "Unknown employee";
    const hours = Number(shift?.total_hours || 0);
    totalHours += Number.isFinite(hours) ? hours : 0;
    const group = groups.get(email) || { email, totalHours: 0, approvedShiftCount: 0, approvalEvidenceCount: 0, shifts: [] };
    group.totalHours += Number.isFinite(hours) ? hours : 0;
    if (shift?.approval_status === "approved") group.approvedShiftCount += 1;
    const provenanceComplete = Number(generation.snapshot_version || 0) < 4 || (shift?.approval_evidence?.approved_by && shift?.approval_evidence?.approved_at);
    const authorityComplete = Number(generation.snapshot_version || 0) < 5 || (shift?.approval_evidence?.approver_role === "admin" && ["session", "admin_kiosk"].includes(shift?.approval_evidence?.authentication_method));
    const independentComplete = Number(generation.snapshot_version || 0) < 6 || (shift?.approval_evidence?.independent_review === true && String(shift?.approval_evidence?.approved_by || "").toLowerCase() !== email);
    if (shift?.approval_request_id && shift?.approval_evidence?.request_id === shift.approval_request_id && ["confirmed", "recovered"].includes(shift?.approval_evidence?.outcome) && provenanceComplete && authorityComplete && independentComplete) group.approvalEvidenceCount += 1;
    group.shifts.push(shift);
    groups.set(email, group);
  }
  const employees = [...groups.values()].sort((a, b) => a.email.localeCompare(b.email));
  const expectedHours = Number(generation.total_hours || 0);
  const server = generation.employee_reconciliation;
  const serverEmployees = Array.isArray(server?.employees) ? server.employees : [];
  const serverByEmail = new Map(serverEmployees.map((employee) => [String(employee.user_email || "").toLowerCase(), employee]));
  const serverMatchesClient = server?.verified === true
    && Number(server.shift_count || 0) === generation.shifts.length
    && Number(server.employee_count || 0) === employees.length
    && Math.abs(Number(server.total_hours || 0) - totalHours) < 0.005
    && serverEmployees.length === employees.length
    && employees.every((employee) => {
      const authoritative = serverByEmail.get(employee.email);
      return authoritative
        && Number(authoritative.shift_count || 0) === employee.shifts.length
        && Number(authoritative.approved_shift_count || 0) === employee.approvedShiftCount
        && Number(authoritative.approval_evidence_count || 0) === employee.approvalEvidenceCount
        && employee.approvedShiftCount === employee.shifts.length
        && employee.approvalEvidenceCount === employee.shifts.length
        && Math.abs(Number(authoritative.total_hours || 0) - employee.totalHours) < 0.005;
    });
  const reconciled = generation.shifts.length === Number(generation.entry_count || 0)
    && employees.length === Number(generation.employee_count || 0)
    && Math.abs(totalHours - expectedHours) < 0.005
    && serverMatchesClient;
  return { employees, totalHours, reconciled, serverMatchesClient };
}

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-period-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function periodRequestStorageKey(key) {
  return `ccs_timeclock_pay_period_request:${String(key || "").trim()}`;
}

function storedPeriodRequest(key) {
  try {
    const raw = sessionStorage.getItem(periodRequestStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const requestId = String(parsed?.request_id || "");
    if (requestId.length < 8 || requestId.length > 128 || !parsed?.payload || typeof parsed.payload !== "object") return null;
    return { request_id: requestId, payload: parsed.payload, submitted: parsed.submitted === true };
  } catch {
    return null;
  }
}

function persistPeriodRequest(key, requestId, payload, submitted = false) {
  try {
    sessionStorage.setItem(periodRequestStorageKey(key), JSON.stringify({ request_id: requestId, payload, submitted }));
  } catch {}
}

function clearStoredPeriodRequestId(key, expectedRequestId = "") {
  try {
    if (expectedRequestId) {
      const stored = storedPeriodRequest(key);
      if (!stored || stored.request_id !== expectedRequestId) return;
    }
    sessionStorage.removeItem(periodRequestStorageKey(key));
  } catch {}
}

function samePeriodPayload(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function submittedPeriodRequests() {
  try {
    const prefix = "ccs_timeclock_pay_period_request:";
    const items = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const storageKey = sessionStorage.key(index);
      if (!storageKey?.startsWith(prefix)) continue;
      const key = storageKey.slice(prefix.length);
      const stored = storedPeriodRequest(key);
      if (stored?.submitted) items.push({ key, ...stored });
    }
    return items;
  } catch {
    return [];
  }
}

function shouldRetainPeriodRequest(err) {
  if (err?.retrySameRequest === true || err?.response?.data?.retry_same_request === true) return true;
  if (err?.confirmedServerResponse === true) return false;
  const status = Number(err?.response?.status || 0);
  return !err?.response || status >= 500;
}

function dateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function statusClass(status) {
  if (status === "finalized") return "bg-green-100 text-green-800 border-green-200";
  if (status === "review") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-blue-100 text-blue-800 border-blue-200";
}

function periodReadiness(period, timeEntries, correctionRequests) {
  const entries = (timeEntries || []).filter((entry) => {
    const key = dateKey(entry.clock_in);
    return key && key >= period.start_date && key <= period.end_date;
  });
  const completed = entries.filter((entry) => entry.status === "clocked_out" && entry.clock_out);
  const activeOverlap = (timeEntries || []).filter((entry) => {
    const key = dateKey(entry.clock_in);
    return ["clocked_in", "needs_resolution"].includes(entry.status) && key && key <= period.end_date;
  });
  const unapproved = completed.filter((entry) => (entry.approval_status || "unreviewed") !== "approved");
  const ids = new Set(entries.map((entry) => entry.id));
  const pendingCorrections = (correctionRequests || []).filter(
    (request) => ["pending", "reviewing"].includes(request.status) && ids.has(request.time_entry_id),
  );
  const lockedElsewhere = completed.filter((entry) => entry.pay_period_id && entry.pay_period_id !== period.id);
  return {
    entries,
    completed,
    activeOverlap,
    unapproved,
    pendingCorrections,
    lockedElsewhere,
    totalHours: completed.reduce((sum, entry) => sum + Number(entry.total_hours || 0), 0),
    ready: activeOverlap.length === 0 && unapproved.length === 0 && pendingCorrections.length === 0 && lockedElsewhere.length === 0,
  };
}

export default function PayPeriodManager({
  sessionToken,
  timeEntries = [],
  correctionRequests = [],
  onEntriesChanged,
  onInvestigateAudit,
}) {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [actionPeriod, setActionPeriod] = useState(null);
  const [actionDecision, setActionDecision] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState(null);
  const [historyResult, setHistoryResult] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedGenerations, setExpandedGenerations] = useState({});
  const recoveryAttemptedRef = useRef(false);

  const loadPeriods = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await loadAllEntityRows({
        entity: TimeClockPayPeriod,
        sort: "-start_date",
        label: "Time Clock pay periods",
      });
      setPeriods(rows);
    } catch (err) {
      setError(err?.message || "Pay periods could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeriods();
  }, []);

  const readinessById = useMemo(() => {
    const map = new Map();
    for (const period of periods) map.set(period.id, periodReadiness(period, timeEntries, correctionRequests));
    return map;
  }, [periods, timeEntries, correctionRequests]);

  const requestIdFor = (key, payload) => {
    const stored = storedPeriodRequest(key);
    if (stored && samePeriodPayload(stored.payload, payload)) return stored.request_id;
    if (stored?.submitted) return null;
    if (stored) clearStoredPeriodRequestId(key, stored.request_id);
    const id = newRequestId();
    persistPeriodRequest(key, id, payload, false);
    return id;
  };

  const markRequestSubmitted = (key, requestId, payload) => {
    persistPeriodRequest(key, requestId, payload, true);
  };

  const clearRequestId = (key, requestId = "") => {
    clearStoredPeriodRequestId(key, requestId);
  };

  const invoke = async (payload) => {
    try {
      const response = await base44.functions.invoke("timeClockAction", payload);
      const data = response?.data || response;
      if (!data?.success) {
        const err = new Error(data?.error || "Pay-period action was not confirmed.");
        err.retrySameRequest = data?.retry_same_request === true;
        err.confirmedServerResponse = true;
        throw err;
      }
      return data;
    } catch (err) {
      if (err?.confirmedServerResponse === true) throw err;
      const data = err?.response?.data || {};
      const status = Number(err?.response?.status || 0);
      const wrapped = new Error(data?.error || err?.message || "Pay-period action was not confirmed.");
      wrapped.retrySameRequest = data?.retry_same_request === true;
      wrapped.confirmedServerResponse = Boolean(err?.response) && status > 0 && status < 500;
      throw wrapped;
    }
  };

  useEffect(() => {
    if (!sessionToken || recoveryAttemptedRef.current) return;
    recoveryAttemptedRef.current = true;
    const recoverSubmittedRequests = async () => {
      const pending = submittedPeriodRequests();
      if (!pending.length) return;
      let changed = false;
      let unresolved = false;
      for (const stored of pending) {
        try {
          await invoke({ ...stored.payload, session_token: sessionToken, request_id: stored.request_id });
          clearRequestId(stored.key, stored.request_id);
          changed = true;
        } catch (err) {
          if (shouldRetainPeriodRequest(err)) {
            unresolved = true;
          } else {
            clearRequestId(stored.key, stored.request_id);
            changed = true;
          }
        }
      }
      if (changed) await Promise.all([loadPeriods(), onEntriesChanged?.()]);
      if (unresolved) setError("A previously submitted pay-period action still needs server confirmation. Its original request is being preserved for a safe retry.");
    };
    recoverSubmittedRequests();
  }, [sessionToken]);

  const createPeriod = async () => {
    if (busy) return;
    if (!sessionToken) {
      setError("Administrator session is unavailable. Sign in again before creating a pay period.");
      return;
    }
    if (label.trim().length < 2 || !startDate || !endDate || startDate > endDate) {
      setError("Enter a label and a valid start/end date.");
      return;
    }
    const key = "create";
    const payload = {
      action: "pay_period_create",
      label: label.trim(),
      start_date: startDate,
      end_date: endDate,
    };
    const requestId = requestIdFor(key, payload);
    if (!requestId) {
      setError("A previously submitted pay-period action still needs server confirmation. Reload before changing it.");
      return;
    }
    markRequestSubmitted(key, requestId, payload);
    setBusy(true);
    setError("");
    try {
      await invoke({ ...payload, session_token: sessionToken, request_id: requestId });
      clearRequestId(key, requestId);
      setShowCreate(false);
      setLabel("");
      setStartDate("");
      setEndDate("");
      await loadPeriods();
    } catch (err) {
      if (!shouldRetainPeriodRequest(err)) clearRequestId(key, requestId);
      setError(err?.message || "Pay period could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (period) => {
    if (!period?.id || historyLoading) return;
    setHistoryPeriod(period); setHistoryResult(null); setExpandedGenerations({}); setHistoryLoading(true);
    try {
      const result = await invoke({ action: "pay_period_history_verify", pay_period_id: period.id, session_token: sessionToken });
      setHistoryResult(result);
    } catch (err) {
      setHistoryResult({ verified: false, error: err?.message || "Payroll history could not be verified.", generations: [] });
    } finally { setHistoryLoading(false); }
  };

  const exportVerifiedHistory = () => {
    if (!historyResult?.verified || !historyResult?.period || !Array.isArray(historyResult.generations)) return;
    const safeLabel = String(historyResult.period.label || "pay-period").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "pay-period";
    const record = {
      record_type: "CCS Time Clock Verified Payroll History",
      verification: { verified: true, verified_at: historyResult.verified_at, pay_period_id: historyResult.pay_period_id },
      pay_period: historyResult.period,
      generations: historyResult.generations,
    };
    const blob = new Blob([JSON.stringify(record, null, 2) + "\n"], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeLabel}-verified-payroll-history.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally { URL.revokeObjectURL(url); }
  };

  const openAction = (period, decision) => {
    const key = `${decision}:${period?.id || ""}`;
    const stored = storedPeriodRequest(key);
    const storedPayload = stored?.payload || {};
    const matchingStoredAction = storedPayload.action === "pay_period_status"
      && storedPayload.pay_period_id === period?.id
      && storedPayload.decision === decision;
    setActionPeriod(period);
    setActionDecision(decision);
    setActionNote(matchingStoredAction ? String(storedPayload.note || "") : "");
    setError("");
  };

  const runStatusAction = async () => {
    if (!actionPeriod?.id || !actionDecision || busy) return;
    if (!sessionToken) {
      setError("Administrator session is unavailable. Sign in again before changing a pay period.");
      return;
    }
    if (actionDecision === "reopen" && actionNote.trim().length < 3) {
      setError("Enter a reason before reopening a finalized pay period.");
      return;
    }
    const key = `${actionDecision}:${actionPeriod.id}`;
    const payload = {
      action: "pay_period_status",
      pay_period_id: actionPeriod.id,
      decision: actionDecision,
      note: actionNote.trim(),
    };
    const requestId = requestIdFor(key, payload);
    if (!requestId) {
      setError("A previously submitted pay-period action still needs server confirmation. Reload before changing it.");
      return;
    }
    markRequestSubmitted(key, requestId, payload);
    setBusy(true);
    setError("");
    try {
      await invoke({ ...payload, session_token: sessionToken, request_id: requestId });
      clearRequestId(key, requestId);
      setActionPeriod(null);
      setActionDecision("");
      setActionNote("");
      await Promise.all([loadPeriods(), onEntriesChanged?.()]);
    } catch (err) {
      if (!shouldRetainPeriodRequest(err)) clearRequestId(key, requestId);
      setError(err?.message || "Pay-period action could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="clay-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-purple-600" />
            Pay Periods
          </h3>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Manual date ranges only. Manager approval and pay-period finalization are separate steps; finalization locks included shifts but does not export payroll.
          </p>
        </div>
        <Button type="button" onClick={() => { setShowCreate(true); setError(""); }} className="bg-purple-600 hover:bg-purple-700">
          New Pay Period
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-purple-600" /></div>
      ) : periods.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-sm text-gray-500">
          No pay periods created yet. Nothing is assumed automatically.
        </div>
      ) : (
        <div className="space-y-3">
          {periods.map((period) => {
            const readiness = readinessById.get(period.id) || periodReadiness(period, timeEntries, correctionRequests);
            return (
              <div key={period.id} className="rounded-xl border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{period.label}</p>
                      <Badge variant="outline" className={statusClass(period.status)}>{period.status === "review" ? "Review" : period.status === "finalized" ? "Finalized" : "Open"}</Badge>
                      {period.status === "finalized" && <LockKeyhole className="w-4 h-4 text-green-700" />}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{period.start_date} through {period.end_date}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {readiness.completed.length} completed shift{readiness.completed.length === 1 ? "" : "s"} ?? {readiness.totalHours.toFixed(2)} tracked hours
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(period.finalized_summary || (period.finalized_summary_history || []).length > 0) && (
                      <Button size="sm" variant="outline" onClick={() => openHistory(period)}><History className="w-4 h-4 mr-1" />Payroll History</Button>
                    )}
                    {period.status === "open" && <Button size="sm" variant="outline" onClick={() => openAction(period, "review")}>Begin Review</Button>}
                    {period.status === "review" && (
                      <Button size="sm" onClick={() => openAction(period, "finalize")} disabled={!readiness.ready} className="bg-green-600 hover:bg-green-700">
                        <FileLock2 className="w-4 h-4 mr-1" />Finalize
                      </Button>
                    )}
                    {period.status === "finalized" && (
                      <Button size="sm" variant="outline" onClick={() => openAction(period, "reopen")}>
                        <RotateCcw className="w-4 h-4 mr-1" />Reopen
                      </Button>
                    )}
                  </div>
                </div>

                {period.status !== "finalized" && (
                  <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                    <div className={`rounded-lg border p-2 ${readiness.activeOverlap.length ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}>
                      Active/unresolved shifts: {readiness.activeOverlap.length}
                    </div>
                    <div className={`rounded-lg border p-2 ${readiness.unapproved.length ? "border-amber-200 bg-amber-50 text-amber-800" : "border-green-200 bg-green-50 text-green-800"}`}>
                      Unapproved: {readiness.unapproved.length}
                    </div>
                    <div className={`rounded-lg border p-2 ${readiness.pendingCorrections.length ? "border-amber-200 bg-amber-50 text-amber-800" : "border-green-200 bg-green-50 text-green-800"}`}>
                      Corrections: {readiness.pendingCorrections.length}
                    </div>
                    <div className={`rounded-lg border p-2 ${readiness.lockedElsewhere.length ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}>
                      Lock conflicts: {readiness.lockedElsewhere.length}
                    </div>
                  </div>
                )}

                {period.status === "review" && !readiness.ready && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Resolve the items above before finalizing. The backend independently repeats these checks.</span>
                  </div>
                )}
                {period.status === "finalized" && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Included shifts are locked against ordinary edits until this period is reopened with an audited reason.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!historyPeriod} onOpenChange={(open) => { if (!open && !historyLoading) { setHistoryPeriod(null); setHistoryResult(null); } }}>
        <DialogContent className="clay-card border-none max-w-2xl">
          <DialogHeader><DialogTitle>Verified Payroll History</DialogTitle></DialogHeader>
          {historyLoading ? (
            <div className="py-10 flex items-center justify-center gap-2 text-sm text-gray-600"><Loader2 className="w-5 h-5 animate-spin" />Verifying payroll snapshot chain???</div>
          ) : historyResult?.verified ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <div className="flex items-start gap-2"><ShieldCheck className="w-5 h-5 shrink-0" /><span>Server verification passed. Every displayed payroll generation is bound to the tamper-evident snapshot chain.</span></div>
                <Button size="sm" variant="outline" onClick={exportVerifiedHistory} className="bg-white text-green-800 border-green-300"><Download className="w-4 h-4 mr-1" />Export Verified Record</Button>
              </div>
              <div className="text-xs text-gray-500">{historyResult.period?.label || historyPeriod?.label} ?? {historyResult.period?.start_date || historyPeriod?.start_date} through {historyResult.period?.end_date || historyPeriod?.end_date} ?? Verified {historyResult.verified_at || "now"}</div>
              <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                {(historyResult.generations || []).map((generation) => (
                  <div key={`${generation.generation}:${generation.request_id}`} className="rounded-lg border bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">Generation {generation.generation}</span><Badge variant="outline" className={generation.state === "active" ? "bg-green-100 text-green-800 border-green-200" : "bg-gray-100 text-gray-700 border-gray-200"}>{generation.state === "active" ? "Current" : "Retired"}</Badge></div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-gray-600"><span>{generation.entry_count} shifts ?? {Number(generation.total_hours || 0).toFixed(2)} hours</span><span>{generation.employee_count} employee{generation.employee_count === 1 ? "" : "s"}</span><span>Finalized by {generation.finalized_by || "Unknown"}</span><span>{formatEvidenceTime(generation.finalized_at)}</span>{Number(generation.snapshot_version || 0) >= 7 && <><span>Approving managers: {(generation.approving_managers || []).join(", ") || "None"}</span><span>{generation.finalizer_approval_overlap ? "Finalizer also approved one or more shifts" : "Finalizer did not approve included shifts"}</span></>}{Number(generation.snapshot_version || 0) >= 8 && generation.supersedes_generation_request_id && <span className="sm:col-span-2">Replacement lineage verified: supersedes {generation.supersedes_generation_request_id} via reopen {generation.authorized_by_reopen_request_id}</span>}{Number(generation.snapshot_version || 0) >= 9 && <span className="sm:col-span-2">Verified payroll changes: {generation.generation_change_count || 0}{generation.generation_reopen_reason ? ` ?? Reopen reason: ${generation.generation_reopen_reason}` : ""}</span>}{Number(generation.snapshot_version || 0) >= 17 && <span className="sm:col-span-2">Generation-wide audit reconciliation: {generation.generation_audit_reconciliation_count || 0} eligible action{generation.generation_audit_reconciliation_count === 1 ? "" : "s"} accounted for</span>}</div>
                    {generation.state === "retired" && <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800">Reopened by {generation.invalidated_by || "Unknown"}{generation.invalidated_at ? ` on ${formatEvidenceTime(generation.invalidated_at)}` : ""}.{generation.invalidated_by_role && <> Authority: {generation.invalidated_by_role}.</>}{generation.invalidation_authentication_method && <> Authentication: {generation.invalidation_authentication_method}.</>}{generation.invalidation_reason ? <> Reason: {generation.invalidation_reason}</> : null}</div>}
                    {Number(generation.snapshot_version || 0) >= 15 && (generation.generation_changes || []).some((change) => (change.causal_chain || []).length > 1) && (
                      <div className="mt-2 rounded border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-900">
                        <div className="font-semibold">Verified ordered causal chains</div>
                        {(generation.generation_changes || []).filter((change) => (change.causal_chain || []).length > 1).map((change) => (
                          <div key={`chain:${change.time_entry_id}`} className="mt-1">
                            Shift {change.time_entry_id}: {(change.causal_chain || []).map((link) => `${link.sequence}. ${link.action}`).join(" ??? ")}
                          </div>
                        ))}
                      </div>
                    )}
                    {Number(generation.snapshot_version || 0) >= 11 && (generation.generation_changes || []).some((change) => change.action_provenance) && (
                      <div className="mt-2 rounded bg-blue-50 p-2 text-xs text-blue-900">
                        <div className="font-semibold">Verified non-correction causes</div>
                        {(generation.generation_changes || []).filter((change) => change.action_provenance).map((change) => (
                          <div key={`${change.time_entry_id}:${change.action_provenance.audit_id}`} className="mt-1">
                            Shift {change.time_entry_id}: {change.change_type} via {change.action_provenance.action}{change.action_provenance.actor_email ? ` by ${change.action_provenance.actor_email}` : ""}{change.action_provenance.reason ? ` ?? ${change.action_provenance.reason}` : ""}
                          </div>
                        ))}
                      </div>
                    )}
                    {Number(generation.snapshot_version || 0) >= 10 && (generation.generation_changes || []).some((change) => change.correction_provenance) && (
                      <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
                        <div className="font-semibold">Verified correction causes</div>
                        {(generation.generation_changes || []).filter((change) => change.correction_provenance).map((change) => (
                          <div key={`${change.time_entry_id}:${change.correction_provenance.correction_request_id}`} className="mt-1">
                            Shift {change.time_entry_id}: {change.correction_provenance.review_decision || "approved correction"} by {change.correction_provenance.reviewed_by || "Unknown"}{change.correction_provenance.reviewer_reason ? ` ?? ${change.correction_provenance.reviewer_reason}` : ""}{change.correction_provenance.employee_reason ? ` ?? Employee reason: ${change.correction_provenance.employee_reason}` : ""}
                          </div>
                        ))}
                      </div>
                    )}
                    {generation.shift_evidence_verified && Array.isArray(generation.shifts) ? (
                      <div className="mt-3">
                        <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setExpandedGenerations((current) => ({ ...current, [generation.generation]: !current[generation.generation] }))}>
                          {expandedGenerations[generation.generation] ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                          {expandedGenerations[generation.generation] ? "Hide" : "Inspect"} {generation.shifts.length} verified shift{generation.shifts.length === 1 ? "" : "s"}
                        </Button>
                        {expandedGenerations[generation.generation] && (() => {
                          const reconciliation = reconcileGenerationEvidence(generation);
                          if (!reconciliation) return null;
                          return (
                            <div className="mt-2 space-y-3">
                              <div className={`rounded-lg border p-2 text-xs ${reconciliation.reconciled ? "border-green-200 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>
                                {reconciliation.reconciled
                                  ? `Evidence reconciled: ${reconciliation.employees.length} employees ?? ${generation.shifts.length} shifts ?? ${reconciliation.totalHours.toFixed(2)} hours.`
                                  : `RECONCILIATION FAILED: displayed shift evidence does not match the verified generation totals. Expected ${generation.employee_count} employees, ${generation.entry_count} shifts, ${Number(generation.total_hours || 0).toFixed(2)} hours; evidence contains ${reconciliation.employees.length} employees, ${generation.shifts.length} shifts, ${reconciliation.totalHours.toFixed(2)} hours.`}
                              </div>
                              {reconciliation.employees.map((employee) => (
                                <div key={employee.email} className="rounded-lg border bg-gray-50 p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-xs">
                                    <span className="font-semibold text-gray-900">{employee.email}</span>
                                    <span className="font-semibold text-gray-700">{employee.shifts.length} shift{employee.shifts.length === 1 ? "" : "s"} ?? {employee.totalHours.toFixed(2)} hours</span>
                                  </div>
                                  <div className="mt-2 space-y-2">
                                    {employee.shifts.map((shift) => (
                                      <div key={shift.id} className="rounded border bg-white p-2 text-xs">
                                        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-gray-500">Shift {shift.id}</span><span className="font-semibold text-gray-700">{Number(shift.total_hours || 0).toFixed(2)} hours</span></div>
                                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 text-gray-600"><span>Clock in: {formatEvidenceTime(shift.clock_in)}</span><span>Clock out: {formatEvidenceTime(shift.clock_out)}</span><span>Approval: {shift.approval_status || "Unknown"}</span><span>Approval evidence: {shift.approval_evidence?.outcome || (shift.approval_request_id ? "Missing" : "Legacy/no request")}</span>{shift.approval_evidence?.approved_by && <span>Approved by: {shift.approval_evidence.approved_by}</span>}{shift.approval_evidence?.approved_at && <span>Approved: {formatEvidenceTime(shift.approval_evidence.approved_at)}</span>}{shift.approval_evidence?.approver_role && <span>Approval authority: {shift.approval_evidence.approver_role}</span>}{shift.approval_evidence?.authentication_method && <span>Authentication: {shift.approval_evidence.authentication_method === "admin_kiosk" ? "Admin kiosk" : shift.approval_evidence.authentication_method}</span>}{shift.approval_evidence?.independent_review === true && <span>Independent review: Verified</span>}</div>
                                        {shift.approval_request_id && <div className="mt-1 font-mono text-[10px] text-gray-400 break-all">Approval request {shift.approval_request_id}</div>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-500">Exact shift-level evidence is not available for this older generation; its aggregate snapshot/provenance remains verified.</div>
                    )}
                    <div className="mt-2 font-mono text-[10px] text-gray-400 break-all">Snapshot {generation.entry_snapshot_hash}</div>
                  </div>
                ))}
                {(historyResult.generations || []).length === 0 && <div className="rounded-lg border bg-gray-50 p-3 text-sm text-gray-600">No finalized payroll generations are recorded for this period.</div>}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <ShieldX className="w-5 h-5 shrink-0" />
                <span>{historyResult?.error || "Payroll history was not verified. No snapshot history is being presented as trusted."}</span>
              </div>
              {historyResult?.conflict?.type === "payroll_membership_evidence_invalid" && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950">
                  <div className="flex items-start gap-2">
                    <ShieldX className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">Payroll evidence integrity failure</div>
                      <p className="mt-1 text-xs text-red-900">
                        The server detected malformed immutable payroll-membership provenance for TimeEntry <span className="font-mono break-all">{historyResult.conflict.time_entry_id || "Unknown"}</span>. No malformed evidence was returned and no payroll generation is being trusted. Administrator investigation is required before finalization can proceed.
                      </p>
                      <div className="mt-2 text-xs text-red-800">Use the Time Clock Audit Trail to review the TimeEntry and its immutable audit records. This integrity failure is intentionally not treated as an ordinary evidence conflict.</div>
                      {historyResult.conflict.time_entry_id && onInvestigateAudit && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-3 bg-white border-red-300 text-red-950"
                          onClick={() => {
                            onInvestigateAudit({
                              time_entry_id: historyResult.conflict.time_entry_id,
                              evidence: [],
                              mode: "integrity",
                            });
                            setHistoryPeriod(null);
                            setHistoryResult(null);
                          }}
                        >
                          <ClipboardList className="w-4 h-4 mr-1" />Inspect authoritative Audit Trail
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {historyResult?.conflict?.type === "payroll_membership_evidence" && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">Administrator investigation required</div>
                      <p className="mt-1 text-xs text-amber-900">
                        Conflicting immutable audit evidence claims different payroll membership for TimeEntry <span className="font-mono break-all">{historyResult.conflict.time_entry_id || "Unknown"}</span>. No generation below is trusted or displayed until the conflict is resolved.
                      </p>
                      {historyResult.conflict.time_entry_id && onInvestigateAudit && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-3 bg-white border-amber-300 text-amber-950"
                          onClick={() => {
                            onInvestigateAudit({
                              time_entry_id: historyResult.conflict.time_entry_id,
                              evidence: Array.isArray(historyResult.conflict.evidence) ? historyResult.conflict.evidence : [],
                            });
                            setHistoryPeriod(null);
                            setHistoryResult(null);
                          }}
                        >
                          <ClipboardList className="w-4 h-4 mr-1" />Investigate in Audit Trail
                        </Button>
                      )}
                      <div className="mt-3 max-h-[38vh] space-y-2 overflow-y-auto pr-1">
                        {(Array.isArray(historyResult.conflict.evidence) ? historyResult.conflict.evidence : []).map((evidence, index) => (
                          <div key={`${evidence.audit_id || "audit"}:${index}`} className="rounded border border-amber-200 bg-white p-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="font-semibold">{evidence.action || "Audit evidence"}</span>
                              <span>{formatEvidenceTime(evidence.server_timestamp)}</span>
                            </div>
                            <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1 text-gray-700">
                              <span>Company date: {evidence.company_date || "Unavailable"}</span>
                              <span>Clock in: {formatEvidenceTime(evidence.clock_in)}</span>
                              <span>Source: {evidence.source || "Unavailable"}</span>
                              <span className="font-mono break-all">Audit: {evidence.audit_id || "Unavailable"}</span>
                            </div>
                            {evidence.request_id && <div className="mt-1 font-mono text-[10px] text-gray-500 break-all">Request: {evidence.request_id}</div>}
                          </div>
                        ))}
                        {(!Array.isArray(historyResult.conflict.evidence) || historyResult.conflict.evidence.length === 0) && (
                          <div className="rounded border border-amber-200 bg-white p-2 text-xs">The server identified a payroll-membership conflict but did not return individual evidence rows.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreate} onOpenChange={(open) => { if (!busy) setShowCreate(open); }}>
        <DialogContent className="clay-card border-none max-w-lg">
          <DialogHeader><DialogTitle>Create Pay Period</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Example: Sept 1???15" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Start date</Label><TimeQuickPick mode="date" value={startDate} onChange={setStartDate} dayOffsets={[0, 1, 7, 14, 15, 30]} inputId="period-start" /></div>
              <div><Label>End date</Label><TimeQuickPick mode="date" value={endDate} onChange={setEndDate} dayOffsets={[0, -1, -7, -14, -15, -30]} inputId="period-end" /></div>
            </div>
            <p className="text-xs text-gray-500">No payroll cadence is assumed. Overlapping periods are rejected by the server.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCreate(false)} disabled={busy}>Cancel</Button>
              <Button onClick={createPeriod} disabled={busy} className="bg-purple-600 hover:bg-purple-700">{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!actionPeriod} onOpenChange={(open) => { if (!open && !busy) setActionPeriod(null); }}>
        <DialogContent className="clay-card border-none max-w-lg">
          <DialogHeader>
            <DialogTitle>{actionDecision === "review" ? "Begin Pay-Period Review" : actionDecision === "finalize" ? "Finalize Pay Period" : "Reopen Finalized Pay Period"}</DialogTitle>
          </DialogHeader>
          {actionPeriod && (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 border p-3">
                <p className="font-medium">{actionPeriod.label}</p>
                <p className="text-sm text-gray-600">{actionPeriod.start_date} through {actionPeriod.end_date}</p>
              </div>
              {actionDecision === "finalize" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Finalization locks all included completed shifts. This is a review/locking control, not a payroll export.
                </div>
              )}
              {actionDecision === "reopen" && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  Reopening unlocks the period???s shifts for correction. The reason is preserved in the audit trail.
                </div>
              )}
              {(actionDecision === "finalize" || actionDecision === "reopen") && (
                <div>
                  <Label>{actionDecision === "reopen" ? "Reopen reason" : "Finalization note (optional)"}</Label>
                  <Textarea value={actionNote} onChange={(e) => setActionNote(e.target.value)} rows={3} placeholder={actionDecision === "reopen" ? "Why does this finalized period need to be reopened?" : "Optional payroll/review note"} />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setActionPeriod(null)} disabled={busy}>Cancel</Button>
                <Button onClick={runStatusAction} disabled={busy} className={actionDecision === "reopen" ? "bg-amber-600 hover:bg-amber-700" : actionDecision === "finalize" ? "bg-green-600 hover:bg-green-700" : "bg-purple-600 hover:bg-purple-700"}>
                  {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {actionDecision === "review" ? "Begin Review" : actionDecision === "finalize" ? "Finalize & Lock" : "Reopen Period"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

