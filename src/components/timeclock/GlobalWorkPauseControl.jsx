import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";

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
  try { sessionStorage.setItem(requestStorageKey(action, email), requestId); } catch {}
}

function clearRequestId(action, email) {
  try { sessionStorage.removeItem(requestStorageKey(action, email)); } catch {}
}

function signalPauseChanged(data = null) {
  try { localStorage.setItem("ccs_work_pause_signal", String(Date.now())); } catch {}
  window.dispatchEvent(new CustomEvent("ccs-timeclock-work-pause-changed", { detail: data }));
}

export default function GlobalWorkPauseControl({ className = "", fullWidth = false, paired = false, compact = false } = {}) {
  const { currentUser, sessionToken } = useAuth();
  const email = String(currentUser?.email || "").trim().toLowerCase();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  const scopeKey = JSON.stringify([email, String(sessionToken || "")]);
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const statusSequenceRef = useRef(0);

  const loadStatus = useCallback(async () => {
    const requestScope = scopeKey;
    const requestSequence = ++statusSequenceRef.current;
    const isCurrent = () => mountedRef.current &&
      requestSequence === statusSequenceRef.current &&
      scopeRef.current === requestScope;
    if (!email || !sessionToken) {
      if (isCurrent()) {
        setStatus(null);
        setError("");
      }
      return null;
    }
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "status",
        session_token: sessionToken,
        target_email: email,
      });
      const data = response?.data || response;
      if (!data?.success) throw new Error(data?.error || "Work Pause status could not be verified.");
      if (!isCurrent()) return null;
      if (data?.status === "clocked_in" && !data?.transition && ["working", "paused"].includes(data?.work_pause_status)) {
        clearRequestId("work_pause_start", email);
        clearRequestId("work_pause_resume", email);
      }
      setStatus(data);
      setError("");
      return data;
    } catch (err) {
      if (!isCurrent()) return null;
      setError(err?.response?.data?.error || err?.message || "Work Pause status could not be verified.");
      return null;
    }
  }, [email, sessionToken, scopeKey]);

  useEffect(() => {
    mountedRef.current = true;
    loadStatus();
    const interval = setInterval(loadStatus, 15000);
    const onFocus = () => loadStatus();
    const onVisibility = () => { if (document.visibilityState === "visible") loadStatus(); };
    const onPauseChanged = (event) => {
      const confirmed = event?.detail;
      if (confirmed?.success && mountedRef.current) {
        const normalized = confirmed?.work_pause_status === "paused" && confirmed?.work_pause?.id
          ? { ...confirmed, active_work_pause: confirmed.work_pause }
          : confirmed;
        setStatus(normalized);
        setError("");
      }
      void loadStatus();
    };
    const onStorage = (event) => { if (event.key === "ccs_work_pause_signal") loadStatus(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("ccs-timeclock-work-pause-changed", onPauseChanged);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mountedRef.current = false;
      statusSequenceRef.current += 1;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("ccs-timeclock-work-pause-changed", onPauseChanged);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
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
    const requestId = storedRequestId(action, email) || newRequestId();
    persistRequestId(action, email, requestId);
    setBusy(true);
    setError("");
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action,
        request_id: requestId,
        session_token: sessionToken,
        target_email: email,
      });
      const data = response?.data || response;
      if (!data?.success) {
        const err = new Error(data?.error || `${paused ? "Resume Work" : "Work Pause"} was not confirmed by the server.`);
        err.retrySameRequest = data?.retry_same_request === true;
        throw err;
      }
      clearRequestId(action, email);
      const confirmedStatus = data?.work_pause_status === "paused" && data?.work_pause?.id
        ? { ...data, active_work_pause: data.work_pause }
        : data;
      if (mountedRef.current) setStatus(confirmedStatus);
      signalPauseChanged(confirmedStatus);
      void loadStatus();
    } catch (err) {
      const responseStatus = Number(err?.response?.status || 0);
      const retrySame = err?.retrySameRequest === true || err?.response?.data?.retry_same_request === true || !err?.response || responseStatus >= 500;
      if (!retrySame) clearRequestId(action, email);
      setError(err?.response?.data?.error || err?.message || `${paused ? "Resume Work" : "Work Pause"} was not confirmed.`);
      await loadStatus();
    } finally {
      setBusy(false);
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
    <button
      data-work-pause-trigger
      type="button"
      onClick={runToggle}
      disabled={busy || unavailable}
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
  );
}
