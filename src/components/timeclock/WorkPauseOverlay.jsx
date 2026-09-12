import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Clock3, Loader2, Pause, Play } from "lucide-react";
import { format } from "date-fns";

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
  disabled = false,
} = {}) {
  const { currentUser: shellUser, sessionToken: shellSessionToken } = useAuth();
  const currentUser = userOverride || shellUser;
  const sessionToken = sessionTokenOverride || shellSessionToken;
  const [pauseState, setPauseState] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [error, setError] = useState("");
  const resumeRequestRef = useRef("");
  const mountedRef = useRef(true);

  const loadStatus = useCallback(async ({ preservePausedOnError = true } = {}) => {
    if (disabled || !currentUser?.email || !sessionToken) {
      if (mountedRef.current) setPauseState(null);
      return null;
    }
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "status",
        session_token: sessionToken,
        target_email: currentUser.email,
      });
      const data = response?.data || response;
      if (!data?.success) throw new Error(data?.error || "Work Pause status could not be verified.");
      if (!mountedRef.current) return data;
      if (data.status === "clocked_in" && data.work_pause_status === "paused" && data.active_work_pause?.id) {
        setPauseState(data);
      } else {
        setPauseState(null);
        setShowResumePrompt(false);
        setError("");
        resumeRequestRef.current = "";
      }
      return data;
    } catch (err) {
      if (!mountedRef.current) return null;
      if (!preservePausedOnError) setPauseState(null);
      if (pauseState) setError(err?.response?.data?.error || err?.message || "Paused status could not be refreshed. The timer remains treated as paused until confirmed otherwise.");
      return null;
    }
  }, [currentUser?.email, sessionToken, pauseState, disabled]);

  useEffect(() => {
    mountedRef.current = true;
    loadStatus({ preservePausedOnError: false });
    const interval = setInterval(() => loadStatus(), 15000);
    const onFocus = () => loadStatus();
    const onVisibility = () => { if (document.visibilityState === "visible") loadStatus(); };
    const onPauseChanged = () => loadStatus();
    const onStorage = (event) => { if (event.key === "ccs_work_pause_signal") loadStatus(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("ccs-timeclock-work-pause-changed", onPauseChanged);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mountedRef.current = false;
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

  const resumeWork = async () => {
    if (!pauseState?.active_work_pause?.id || !currentUser?.email || !sessionToken || resumeBusy) return;
    const requestId = resumeRequestRef.current || newRequestId();
    resumeRequestRef.current = requestId;
    setResumeBusy(true);
    setError("");
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "work_pause_resume",
        session_token: sessionToken,
        target_email: currentUser.email,
        request_id: requestId,
      });
      const data = response?.data || response;
      if (!data?.success) {
        const err = new Error(data?.error || "Resume Work was not confirmed by the server.");
        err.retrySameRequest = data?.retry_same_request === true;
        throw err;
      }
      resumeRequestRef.current = "";
      setShowResumePrompt(false);
      setPauseState(null);
      try { localStorage.setItem("ccs_work_pause_signal", String(Date.now())); } catch {}
      window.dispatchEvent(new CustomEvent("ccs-timeclock-work-pause-changed"));
      await loadStatus({ preservePausedOnError: true });
    } catch (err) {
      const data = err?.response?.data || {};
      const retrySame = err?.retrySameRequest === true || data?.retry_same_request === true;
      if (!retrySame) resumeRequestRef.current = "";
      setError(data?.error || err?.message || "Resume Work was not confirmed. Your work timer remains paused.");
      setShowResumePrompt(false);
    } finally {
      setResumeBusy(false);
    }
  };

  if (disabled || !pauseState?.active_work_pause?.started_at) return null;

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
    <>
      <div
        className="fixed inset-0 z-[100] flex cursor-pointer items-center justify-center overflow-y-auto p-4 sm:p-6"
        style={{
          background: "radial-gradient(circle at top, rgba(91,33,182,0.97), rgba(30,27,75,0.99) 55%, rgba(15,23,42,1))",
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
        onClick={() => { if (!resumeBusy) setShowResumePrompt(true); }}
        role="presentation"
      >
        <div className="w-full max-w-xl rounded-[28px] border border-white/20 bg-white/95 p-6 shadow-2xl sm:p-9 text-center">
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

          <Button
            type="button"
            onClick={() => setShowResumePrompt(true)}
            disabled={resumeBusy}
            className="mt-6 min-h-[56px] w-full bg-green-600 text-lg font-bold text-white hover:bg-green-700"
          >
            {resumeBusy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
            Resume Work
          </Button>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Clock3 className="h-3.5 w-3.5" />
            <span>Refreshing from authoritative Time Clock state automatically</span>
          </div>
        </div>
      </div>

      <AlertDialog open={showResumePrompt} onOpenChange={(open) => { if (!resumeBusy) setShowResumePrompt(open); }}>
        <AlertDialogContent className="clay-card border-none z-[120]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-green-600" />
              Resume work?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are currently Work Paused. If you are returning to CCS work, resume now so your counted work time starts again. Nothing resumes automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resumeBusy}>Stay Paused</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); resumeWork(); }}
              disabled={resumeBusy}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {resumeBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Resuming...</> : "Resume Work"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
