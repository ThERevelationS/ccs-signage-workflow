import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { invokeTimeClockAction } from "@/components/timeclock/timeClockReadCache";
import { useAuth } from "@/components/auth/EmailGate";
import WorkPauseMenu from "@/components/timeclock/WorkPauseMenu";
import { useTimeClockStatus } from "@/components/timeclock/TimeClockStatusContext";

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-global-pause-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function requestStorageKey(action, email) {
  return `ccs_timeclock_request:${action}:${String(email || "").trim().toLowerCase()}`;
}

function storedRequestId(action, email) {
  try {
    const value = sessionStorage.getItem(requestStorageKey(action, email)) || "";
    return value.length >= 8 && value.length <= 128 ? value : "";
  } catch {
    return "";
  }
}

function persistRequestId(action, email, requestId) {
  try {
    const key = requestStorageKey(action, email);
    sessionStorage.setItem(key, requestId);
    return sessionStorage.getItem(key) === requestId;
  } catch {
    return false;
  }
}

function clearRequestId(action, email, expectedRequestId) {
  try {
    const key = requestStorageKey(action, email);
    if (expectedRequestId === undefined || sessionStorage.getItem(key) === expectedRequestId) sessionStorage.removeItem(key);
  } catch {}
}

function signalPauseChanged(data = null) {
  try { localStorage.setItem("ccs_work_pause_signal", String(Date.now())); } catch {}
  window.dispatchEvent(new CustomEvent("ccs-timeclock-work-pause-changed", { detail: data }));
}

export default function GlobalWorkPauseControl({ className = "", fullWidth = false, paired = false, compact = false } = {}) {
  const { currentUser, sessionToken } = useAuth();
  const timeClockStatus = useTimeClockStatus();
  const refreshTimeClockStatus = timeClockStatus.refresh;
  const email = String(currentUser?.email || "").trim().toLowerCase();
  const scopeKey = JSON.stringify([email, String(sessionToken || "")]);
  const previousScopeKeyRef = useRef(scopeKey);
  const scopeGenerationRef = useRef(0);
  if (previousScopeKeyRef.current !== scopeKey) {
    previousScopeKeyRef.current = scopeKey;
    scopeGenerationRef.current += 1;
  }
  const scopeInstanceKey = `${scopeGenerationRef.current}:${scopeKey}`;
  const [statusRecord, setStatusRecord] = useState({ scope: scopeInstanceKey, data: null });
  const statusRecordRef = useRef(statusRecord);
  statusRecordRef.current = statusRecord;
  const status = statusRecord.scope === scopeInstanceKey ? statusRecord.data : null;
  const [busyRecord, setBusyRecord] = useState({ scope: scopeInstanceKey, value: false });
  const busy = busyRecord.scope === scopeInstanceKey && busyRecord.value;
  const setBusy = (value) => setBusyRecord({ scope: scopeInstanceKey, value });
  const [errorRecord, setErrorRecord] = useState({ scope: scopeInstanceKey, value: "" });
  const error = errorRecord.scope === scopeInstanceKey ? errorRecord.value : "";
  const setError = (value) => setErrorRecord({ scope: scopeInstanceKey, value });
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportBusyRecord, setReportBusyRecord] = useState({ scope: scopeInstanceKey, value: false });
  const reportBusy = reportBusyRecord.scope === scopeInstanceKey && reportBusyRecord.value;
  const setReportBusy = (value) => setReportBusyRecord({ scope: scopeInstanceKey, value });
  const [reportErrorRecord, setReportErrorRecord] = useState({ scope: scopeInstanceKey, value: "" });
  const reportError = reportErrorRecord.scope === scopeInstanceKey ? reportErrorRecord.value : "";
  const setReportError = (value) => setReportErrorRecord({ scope: scopeInstanceKey, value });
  const [reportedMinutesRecord, setReportedMinutesRecord] = useState({ scope: scopeInstanceKey, value: 0 });
  const reportedMinutes = reportedMinutesRecord.scope === scopeInstanceKey ? reportedMinutesRecord.value : 0;
  const setReportedMinutes = (value) => setReportedMinutesRecord({ scope: scopeInstanceKey, value });
  const mountedRef = useRef(true);
  const scopeRef = useRef(scopeInstanceKey);
  scopeRef.current = scopeInstanceKey;
  const statusSequenceRef = useRef(0);
  const transitionSequenceRef = useRef(0);

  const loadStatus = useCallback(async ({ force = false } = {}) => {
    const requestScope = scopeInstanceKey;
    const requestSequence = ++statusSequenceRef.current;
    const requestTransition = ++transitionSequenceRef.current;
    const isCurrent = () => mountedRef.current &&
      requestSequence === statusSequenceRef.current &&
      requestTransition === transitionSequenceRef.current &&
      scopeRef.current === requestScope;
    if (!email || !sessionToken) {
      if (isCurrent()) {
        setStatusRecord({ scope: requestScope, data: null });
        setError("");
      }
      return null;
    }
    try {
      const data = await refreshTimeClockStatus({ force });
      if (!isCurrent()) return null;
      const responseEmail = String(data?.user?.email || "").trim().toLowerCase();
      if (!responseEmail || responseEmail !== email) {
        setStatusRecord({ scope: requestScope, data: null });
        throw new Error("Work Pause status did not match the signed-in employee.");
      }
      if (data?.status === "clocked_in" && !data?.transition && ["working", "paused"].includes(data?.work_pause_status)) {
        clearRequestId("work_pause_start", email);
        clearRequestId("work_pause_resume", email);
      }
      setStatusRecord({ scope: requestScope, data });
      setError("");
      return data;
    } catch (err) {
      if (!isCurrent()) return null;
      setError(err?.response?.data?.error || err?.message || "Work Pause status could not be verified.");
      return null;
    }
  }, [email, sessionToken, scopeInstanceKey, refreshTimeClockStatus]);

  useEffect(() => {
    void loadStatus();
  }, [timeClockStatus.version, loadStatus]);

  useEffect(() => {
    mountedRef.current = true;
    loadStatus();
    // Change events can originate from another employee session or arrive late.
    // Treat them only as invalidation signals; signed-session status is authoritative.
    const onPauseChanged = () => {
      void loadStatus({ force: true });
    };
    const onStorage = (event) => { if (event.key === "ccs_work_pause_signal") loadStatus({ force: true }); };
    window.addEventListener("ccs-timeclock-work-pause-changed", onPauseChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      mountedRef.current = false;
      statusSequenceRef.current += 1;
      window.removeEventListener("ccs-timeclock-work-pause-changed", onPauseChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [loadStatus]);

  if (!email || !sessionToken || !status) return null;

  const paused = status.status === "clocked_in" && status.work_pause_status === "paused" && Boolean(status.active_work_pause?.id);
  const canPause = status.status === "clocked_in" && status.work_pause_allowed === true;
  const transition = Boolean(status.transition) || ["clocking_in", "clocking_out"].includes(status.status) || ["pausing", "resuming"].includes(status.work_pause_status);
  const onBreak = status.break_status !== "working" || Boolean(status.active_break?.id);
  const unavailable = !paused && (!canPause || onBreak || transition);

  if (!paused && !canPause) return null;

  const runToggle = async () => {
    if (busy || transition || unavailable) return;
    const action = paused ? "work_pause_resume" : "work_pause_start";
    const existingRequestId = storedRequestId(action, email);
    const requestId = existingRequestId || newRequestId();
    if (!existingRequestId && !persistRequestId(action, email, requestId)) {
      setError("Work Pause was not sent because this tab could not retain the exact retry request. Enable session storage and try again.");
      return;
    }
    const actionTransition = ++transitionSequenceRef.current;
    statusSequenceRef.current += 1;
    const isCurrentAction = () => mountedRef.current &&
      scopeRef.current === scopeInstanceKey &&
      transitionSequenceRef.current === actionTransition;
    setBusy(true);
    setError("");
    try {
      const data = await invokeTimeClockAction({
        action,
        payload: { request_id: requestId, session_token: sessionToken, target_email: email },
      });
      if (!data?.success) {
        const err = new Error(data?.error || `${paused ? "Resume Work" : "Work Pause"} was not confirmed by the server.`);
        err.retrySameRequest = data?.retry_same_request === true;
        throw err;
      }
      if (!isCurrentAction()) {
        // A later signed-session status read or transition superseded this
        // acknowledgement. Keep its exact retry ID until status reconciles it.
        signalPauseChanged();
        return;
      }
      const acknowledgedEmail = String(data?.user?.email || "").trim().toLowerCase();
      if (!acknowledgedEmail || acknowledgedEmail !== email) {
        const message = "Work Pause confirmation did not match the signed-in employee.";
        if (isCurrentAction()) {
          const latestRecord = statusRecordRef.current;
          if (latestRecord.scope === scopeInstanceKey && latestRecord.data) {
            const guardedRecord = {
              scope: scopeInstanceKey,
              data: { ...latestRecord.data, transition: action },
            };
            statusRecordRef.current = guardedRecord;
            setStatusRecord(guardedRecord);
          }
          setError(message);
        }
        // Do not trust or broadcast an identity-mismatched action response. Retain
        // its request ID and let each signed session verify its own authoritative state.
        signalPauseChanged();
        return;
      }
      clearRequestId(action, email, requestId);
      const confirmedStatus = data?.work_pause_status === "paused" && data?.work_pause?.id
        ? { ...data, active_work_pause: data.work_pause }
        : data;
      if (mountedRef.current) setStatusRecord({ scope: scopeInstanceKey, data: confirmedStatus });
      signalPauseChanged(confirmedStatus);
    } catch (err) {
      if (!isCurrentAction()) return;
      const responseStatus = Number(err?.response?.status || 0);
      const retrySame = err?.retrySameRequest === true || err?.response?.data?.retry_same_request === true || !err?.response || responseStatus >= 500;
      if (!retrySame) clearRequestId(action, email, requestId);
      setError(err?.response?.data?.error || err?.message || `${paused ? "Resume Work" : "Work Pause"} was not confirmed.`);
      await loadStatus({ force: true });
    } finally {
      setBusy(false);
    }
  };

  const reportMissedPause = async ({ started_at, resumed_at, note }) => {
    const action = "work_pause_report_missed";
    const existingRequestId = storedRequestId(action, email);
    const requestId = existingRequestId || newRequestId();
    if (!existingRequestId && !persistRequestId(action, email, requestId)) {
      const message = "The missed Work Pause was not sent because this tab could not retain the exact retry request. Enable session storage and try again.";
      setReportError(message);
      throw new Error(message);
    }
    const actionTransition = ++transitionSequenceRef.current;
    statusSequenceRef.current += 1;
    const isCurrentAction = () => mountedRef.current &&
      scopeRef.current === scopeInstanceKey &&
      transitionSequenceRef.current === actionTransition;
    setReportBusy(true);
    setReportError("");
    try {
      const data = await invokeTimeClockAction({
        action,
        payload: { request_id: requestId, session_token: sessionToken, target_email: email, started_at, resumed_at, note },
      });
      if (!data?.success) {
        const err = new Error(data?.error || "The missed Work Pause was not confirmed by the server.");
        err.retrySameRequest = data?.retry_same_request === true;
        throw err;
      }
      if (!isCurrentAction()) {
        signalPauseChanged();
        return;
      }
      const acknowledgedEmail = String(data?.user?.email || "").trim().toLowerCase();
      if (!acknowledgedEmail || acknowledgedEmail !== email) {
        setReportError("The missed Work Pause confirmation did not match the signed-in employee.");
        signalPauseChanged();
        return;
      }
      clearRequestId(action, email, requestId);
      const latestRecord = statusRecordRef.current;
      if (latestRecord.scope === scopeInstanceKey && latestRecord.data) {
        const merged = {
          scope: scopeInstanceKey,
          data: {
            ...latestRecord.data,
            work_pause_summary: data.work_pause_summary || latestRecord.data.work_pause_summary,
            entry: data.entry || latestRecord.data.entry,
          },
        };
        statusRecordRef.current = merged;
        setStatusRecord(merged);
      }
      setReportedMinutes(Math.max(0, Number(data?.work_pause?.duration_minutes || 0)));
      signalPauseChanged(data);
    } catch (err) {
      if (!isCurrentAction()) return;
      const responseStatus = Number(err?.response?.status || 0);
      const retrySame = err?.retrySameRequest === true || err?.response?.data?.retry_same_request === true || !err?.response || responseStatus >= 500;
      if (!retrySame) clearRequestId(action, email, requestId);
      const message = err?.response?.data?.error || err?.message || "The missed Work Pause was not confirmed.";
      setReportError(message);
      throw err;
    } finally {
      if (isCurrentAction()) setReportBusy(false);
    }
  };

  const title = error
    ? error
    : paused
      ? "Resume counted work time"
      : onBreak
        ? "End the active break before using Work Pause"
        : transition
          ? "A Time Clock action is still being finalized"
          : "Pause counted work time";

  const pairedClassName = paired
    ? `ccs-pause-segment relative z-[1] flex items-center justify-center border-0 font-bold outline-none transition-[background-color,color,transform] duration-150 focus-visible:z-[2] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-400 disabled:opacity-45 disabled:cursor-not-allowed ${compact ? "min-h-[26px] gap-1 px-1.5 py-0.5 text-[11px]" : "min-h-[32px] gap-1.5 px-2.5 py-1 text-sm"}`
    : `${fullWidth ? "w-full justify-center" : ""} px-3 py-1.5 rounded-xl transition-all duration-200 flex items-center gap-2 border-2 disabled:opacity-50 disabled:cursor-not-allowed ${paused
      ? "border-green-300 bg-green-50 hover:bg-green-100 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60"
      : "border-purple-300 bg-purple-50 hover:bg-purple-100 dark:border-violet-500/40 dark:bg-violet-950/50 dark:hover:bg-violet-900/60"}`;

  return (
    <>
    <button type="button"
      data-work-pause-trigger
      type="button"
      onClick={() => setMenuOpen(true)}
      disabled={busy || transition || unavailable}
      aria-pressed={paused}
      title={title}
      className={`${pairedClassName} ${className}`}
    >
      {busy ? (
        <Loader2 className={`w-4 h-4 animate-spin ${paused ? "text-emerald-300" : "text-violet-300"}`} />
      ) : paused ? (
        <Play className="w-4 h-4 text-emerald-300" />
      ) : (
        <Pause className="w-4 h-4 text-violet-300" />
      )}
      <span className={`font-bold ${paired && compact ? "text-[11px]" : "text-sm"} ${paused ? "text-emerald-200" : "text-violet-200"}`}>
        {paused ? "Resume Work" : "Pause Work"}
      </span>
    </button>
    <WorkPauseMenu
      open={menuOpen}
      onClose={() => setMenuOpen(false)}
      userName={currentUser?.full_name || currentUser?.email}
      paused={paused}
      pausedSince={status?.active_work_pause?.started_at || ""}
      totalPausedMinutes={status?.work_pause_summary?.total_minutes || 0}
      canReportMissed={canPause && !paused && !onBreak && !transition}
      toggleDisabled={busy || transition || unavailable}
      toggleBusy={busy}
      toggleError={error}
      reportBusy={reportBusy}
      reportError={reportError}
      reportedMinutes={reportedMinutes}
      onToggle={() => { void runToggle(); }}
      onReportMissed={reportMissedPause}
    />
    </>
  );
}