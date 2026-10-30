import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Clock3, Loader2, Pause, Play, X } from "lucide-react";
import { format } from "date-fns";
import { isFleetCoolingDown } from "@/components/fleet/fleetInvoke";

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-pause-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function formatDuration(totalMinutes) {
  const minutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours <= 0) return `${remainder}m`;
  return `${hours}h ${remainder}m`;
}

export default function WorkPauseOverlay({
  userOverride = null,
  sessionTokenOverride = "",
  credentialOverride = null,
  disabled = false,
  onResumed = null,
} = {}) {
  const { currentUser: shellUser, sessionToken: shellSessionToken } = useAuth();
  const currentUser = userOverride || shellUser;
  const sessionToken = sessionTokenOverride || shellSessionToken;
  const credentialPayload = credentialOverride?.badgeCode
    ? { badge_code: credentialOverride.badgeCode }
    : {
        session_token: credentialOverride?.sessionToken || sessionToken,
        target_email: currentUser?.email,
      };
  const hasCredential = Boolean(credentialPayload.badge_code || credentialPayload.session_token);
  // Bind every status result to its employee and signed credential, not just
  // whether the component is still mounted when a request returns.
  const scopeKey = JSON.stringify([
    String(currentUser?.email || "").trim().toLowerCase(),
    credentialPayload.badge_code || "",
    credentialPayload.session_token || "",
    Boolean(disabled),
  ]);
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const statusSequenceRef = useRef(0);
  const resumeSequenceRef = useRef(0);
  const resumeInFlightRef = useRef(false);
  const [pauseStateScope, setPauseStateScope] = useState("");
  const [pauseState, setPauseState] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [error, setError] = useState("");
  const resumeRequestRef = useRef("");
  const deferredInvalidationRef = useRef(false);
  const mountedRef = useRef(true);
  const pauseStateRef = useRef(null);
  const pauseIdRef = useRef("");
  const dismissedAtRef = useRef(0);
  const lastActivityAtRef = useRef(Date.now());
  const lastPollAtRef = useRef(0);

  const loadStatus = useCallback(async ({ preservePausedOnError = true } = {}) => {
    if (resumeInFlightRef.current) return null;
    const sequence = ++statusSequenceRef.current;
    const isCurrent = () => mountedRef.current &&
      sequence === statusSequenceRef.current && scopeRef.current === scopeKey;
    if (disabled || !currentUser?.email || !hasCredential) {
      pauseStateRef.current = null;
      if (mountedRef.current) {
        setPauseState(null);
        setPauseStateScope("");
        setShowResumePrompt(false);
      }
      return null;
    }
    try {
      lastPollAtRef.current = Date.now();
      const response = await base44.functions.invoke("timeClockAction", {
        action: "status",
        ...credentialPayload,
      });
      const data = response?.data || response;
      if (!data?.success) throw new Error(data?.error || "Work Pause status could not be verified.");
      if (!isCurrent()) return null;
      if (data.status === "clocked_in" && data.work_pause_status === "paused" && data.active_work_pause?.id) {
        const pauseId = String(data.active_work_pause.id);
        pauseStateRef.current = data;
        setPauseState(data);
        setPauseStateScope(scopeKey);
        if (pauseIdRef.current !== pauseId) {
          pauseIdRef.current = pauseId;
          dismissedAtRef.current = 0;
          lastActivityAtRef.current = Date.now();
          setShowResumePrompt(true);
        }
      } else if (data.status === "clocked_in" && data.work_pause_status === "resuming" && pauseStateRef.current) {
        setPauseState(pauseStateRef.current);
        setPauseStateScope(scopeKey);
        setShowResumePrompt(true);
        setError("Resume Work is still being finalized by the server. Your timer remains treated as paused until working state is confirmed.");
      } else {
        pauseStateRef.current = null;
        setPauseState(null);
        setPauseStateScope("");
        setShowResumePrompt(false);
        setError("");
        resumeRequestRef.current = "";
        pauseIdRef.current = "";
        dismissedAtRef.current = 0;
      }
      return data;
    } catch (err) {
      if (!isCurrent()) return null;
      if (!preservePausedOnError) {
        pauseStateRef.current = null;
        setPauseState(null);
        setPauseStateScope("");
      }
      if (pauseStateRef.current) setError(err?.response?.data?.error || err?.message || "Paused status could not be refreshed. The timer remains treated as paused until confirmed otherwise.");
      return null;
    }
  }, [currentUser?.email, hasCredential, credentialPayload.badge_code, credentialPayload.session_token, disabled, scopeKey]);

  useEffect(() => {
    mountedRef.current = true;
    statusSequenceRef.current += 1;
    resumeSequenceRef.current += 1;
    resumeInFlightRef.current = false;
    setResumeBusy(false);
    pauseStateRef.current = null;
    pauseIdRef.current = "";
    resumeRequestRef.current = "";
    setPauseState(null);
    setPauseStateScope("");
    setShowResumePrompt(false);
    setError("");
    loadStatus({ preservePausedOnError: false });
    // Hidden tabs and an open 429 breaker skip the poll; the visibility
    // handler refreshes on return.
    const interval = setInterval(() => { if (!document.hidden && !isFleetCoolingDown()) loadStatus(); }, 60000);
    const onFocus = () => { if (Date.now() - lastPollAtRef.current > 45000) loadStatus(); };
    const onVisibility = () => { if (document.visibilityState === "visible" && Date.now() - lastPollAtRef.current > 45000) loadStatus(); };
    const onPauseChanged = (event) => {
      const confirmed = event?.detail;
      const confirmedEmail = String(confirmed?.user?.email || confirmed?.entry?.user_email || "").trim().toLowerCase();
      const matchesEmployee = confirmedEmail &&
        confirmedEmail === String(currentUser?.email || "").trim().toLowerCase();
      // A broadcast "working" payload may be stale — while a Resume request is in
      // flight only its own response may clear the paused overlay.
      if (matchesEmployee && confirmed?.status === "clocked_in" && confirmed?.work_pause_status === "working" && !resumeInFlightRef.current) {
        statusSequenceRef.current += 1;
        pauseStateRef.current = null;
        setPauseState(null);
        setPauseStateScope("");
        setShowResumePrompt(false);
        setError("");
        resumeRequestRef.current = "";
        pauseIdRef.current = "";
        dismissedAtRef.current = 0;
      } else if (matchesEmployee && confirmed?.status === "clocked_in" && confirmed?.work_pause_status === "paused") {
        // A paused payload is an invalidation signal only — it may not fabricate
        // the guard by itself. The deferred/normal status read below applies the
        // authoritative paused state.
      }
      // An event landing while Resume is in flight is an invalidation we must
      // defer — loadStatus early-returns during the request, so record the
      // signal and let the settled Resume drain it with a fresh status read.
      if (resumeInFlightRef.current) {
        deferredInvalidationRef.current = true;
      } else {
        void loadStatus();
      }
    };
    const onStorage = (event) => { if (event.key === "ccs_work_pause_signal") loadStatus(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("ccs-timeclock-work-pause-changed", onPauseChanged);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mountedRef.current = false;
      statusSequenceRef.current += 1;
      resumeSequenceRef.current += 1;
      resumeInFlightRef.current = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("ccs-timeclock-work-pause-changed", onPauseChanged);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadStatus]);

  useEffect(() => {
    if (!pauseState) return undefined;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [pauseState]);

  useEffect(() => {
    if (!pauseState) return undefined;

    const recordActivity = () => {
      const nowMs = Date.now();
      lastActivityAtRef.current = nowMs;
      if (!showResumePrompt && dismissedAtRef.current > 0 && nowMs - dismissedAtRef.current >= 2 * 60 * 1000) {
        setShowResumePrompt(true);
      }
    };

    const reminderCheck = setInterval(() => {
      if (showResumePrompt || document.visibilityState !== "visible" || dismissedAtRef.current <= 0) return;
      const nowMs = Date.now();
      const recentlyActive = nowMs - lastActivityAtRef.current <= 30 * 1000;
      if (recentlyActive && nowMs - dismissedAtRef.current >= 2 * 60 * 1000) {
        setShowResumePrompt(true);
      }
    }, 5000);

    const recordPointerMovement = () => {
      const nowMs = Date.now();
      if (nowMs - lastActivityAtRef.current >= 5000) recordActivity();
    };

    window.addEventListener("pointerdown", recordActivity);
    window.addEventListener("pointermove", recordPointerMovement);
    window.addEventListener("keydown", recordActivity);
    window.addEventListener("touchstart", recordActivity, { passive: true });
    window.addEventListener("wheel", recordActivity, { passive: true });
    return () => {
      clearInterval(reminderCheck);
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("pointermove", recordPointerMovement);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("touchstart", recordActivity);
      window.removeEventListener("wheel", recordActivity);
    };
  }, [pauseState, showResumePrompt]);

  const dismissReminder = () => {
    if (resumeBusy) return;
    const nowMs = Date.now();
    dismissedAtRef.current = nowMs;
    lastActivityAtRef.current = nowMs;
    setShowResumePrompt(false);
  };

  const resumeWork = async () => {
    if (!pauseState?.active_work_pause?.id || !currentUser?.email || !hasCredential || resumeBusy) return;
    const requestId = resumeRequestRef.current || newRequestId();
    const resumeSequence = ++resumeSequenceRef.current;
    const expectedPauseId = String(pauseState.active_work_pause.id);
    const isCurrentScope = () => mountedRef.current &&
      resumeSequence === resumeSequenceRef.current && scopeRef.current === scopeKey;
    const isCurrentResume = () => isCurrentScope() &&
      pauseIdRef.current === expectedPauseId;
    let refreshAfterResume = false;
    resumeRequestRef.current = requestId;
    resumeInFlightRef.current = true;
    statusSequenceRef.current += 1;
    setResumeBusy(true);
    setError("");
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "work_pause_resume",
        request_id: requestId,
        ...credentialPayload,
      });
      if (!isCurrentResume()) return;
      const data = response?.data || response;
      if (!data?.success) {
        const err = new Error(data?.error || "Resume Work was not confirmed by the server.");
        err.retrySameRequest = data?.retry_same_request === true;
        throw err;
      }
      resumeRequestRef.current = "";
      setShowResumePrompt(false);
      pauseStateRef.current = null;
      setPauseState(null);
      setPauseStateScope("");
      pauseIdRef.current = "";
      dismissedAtRef.current = 0;
      if (typeof onResumed === "function") onResumed(data);
      try { localStorage.setItem("ccs_work_pause_signal", String(Date.now())); } catch {}
      window.dispatchEvent(new CustomEvent("ccs-timeclock-work-pause-changed", { detail: data }));
      refreshAfterResume = true;
    } catch (err) {
      if (!isCurrentResume()) return;
      const data = err?.response?.data || {};
      const responseStatus = Number(err?.response?.status || 0);
      const retrySame = err?.retrySameRequest === true || data?.retry_same_request === true ||
        !err?.response || responseStatus >= 500;
      if (!retrySame) resumeRequestRef.current = "";
      setError(data?.error || err?.message || "Resume Work was not confirmed. Your work timer remains paused.");
      setShowResumePrompt(true);
    } finally {
      if (isCurrentScope()) {
        resumeInFlightRef.current = false;
        setResumeBusy(false);
        if (deferredInvalidationRef.current) {
          deferredInvalidationRef.current = false;
          refreshAfterResume = true;
        }
        if (refreshAfterResume) void loadStatus({ preservePausedOnError: true });
      }
    }
  };

  if (disabled || pauseStateScope !== scopeKey || !pauseState?.active_work_pause?.started_at || !showResumePrompt) return null;

  const pauseStarted = new Date(pauseState.active_work_pause.started_at);
  const pauseElapsedMinutes = Number.isFinite(pauseStarted.getTime())
    ? Math.max(0, Math.floor((now.getTime() - pauseStarted.getTime()) / 60000))
    : 0;
  const priorPauseMinutes = Math.max(0, Number(pauseState.work_pause_summary?.total_minutes || 0));
  const unpaidBreakMinutes = Math.max(0, Number(pauseState.break_summary?.unpaid_minutes || 0));
  const clockIn = pauseState.entry?.clock_in ? new Date(pauseState.entry.clock_in) : null;
  const shiftSpanMinutes = clockIn && Number.isFinite(clockIn.getTime())
    ? Math.max(0, Math.floor((now.getTime() - clockIn.getTime()) / 60000))
    : 0;
  const countedWorkMinutes = Math.max(0, shiftSpanMinutes - unpaidBreakMinutes - priorPauseMinutes - pauseElapsedMinutes);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px] sm:p-6"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismissReminder();
      }}
      role="presentation"
    >
      <div
        className="relative w-full max-w-xl rounded-[28px] border border-purple-200 bg-white p-6 text-center shadow-2xl sm:p-9"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={dismissReminder}
          disabled={resumeBusy}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50"
          aria-label="Ignore Work Pause reminder for now"
          title="Ignore for now"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-100 shadow-inner">
          <Pause className="h-8 w-8 text-purple-700" />
        </div>
        <p className="text-xs font-bold tracking-[0.24em] text-purple-600">TIME CLOCK</p>
        <h1 className="mt-2 text-3xl font-black text-slate-900 sm:text-4xl">WORK PAUSED</h1>
        <p className="mt-3 text-sm text-slate-600">
          Your counted work timer is stopped. Resume when you return to work.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-purple-600">Paused For</p>
            <p className="mt-1 text-3xl font-black text-purple-800">{formatDuration(pauseElapsedMinutes)}</p>
            {Number.isFinite(pauseStarted.getTime()) && <p className="mt-1 text-xs text-purple-600">Since {format(pauseStarted, "h:mm a")}</p>}
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Counted Work This Shift</p>
            <p className="mt-1 text-3xl font-black text-emerald-800">{formatDuration(countedWorkMinutes)}</p>
            <p className="mt-1 text-xs text-emerald-700">Paused time is excluded</p>
          </div>
        </div>

        {priorPauseMinutes > 0 && (
          <p className="mt-3 text-xs text-slate-500">Earlier Work Pauses this shift: {formatDuration(priorPauseMinutes)}</p>
        )}

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-left text-sm text-red-800">
            <div className="font-semibold">Work timer is still paused</div>
            <div className="mt-1 text-xs">{error}</div>
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            onClick={dismissReminder}
            disabled={resumeBusy}
            variant="outline"
            className="min-h-[54px] border-slate-300 bg-white text-base font-semibold text-slate-700 hover:bg-slate-50"
          >
            Ignore for now
          </Button>
          <Button
            type="button"
            onClick={resumeWork}
            disabled={resumeBusy}
            className="min-h-[54px] bg-green-600 text-base font-bold text-white hover:bg-green-700"
          >
            {resumeBusy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
            Resume Work
          </Button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
          <Clock3 className="h-3.5 w-3.5" />
          <span>If you ignore this reminder and keep using the app, it returns in 2 minutes.</span>
        </div>
      </div>
    </div>
  );
}