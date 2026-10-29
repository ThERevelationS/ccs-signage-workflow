import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Clock, 
  Calendar, 
  History, 
  User,
  Coffee,
  Briefcase,
  Home,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Pencil,
  Save,
  X,
  LogIn,
  LogOut,
  Lock,
  Settings,
  Pause,
  LockKeyhole,
  Ban
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isWithinInterval, parseISO } from "date-fns";
import TimeOffRequestDialog from "@/components/timeclock/TimeOffRequestDialog";
import PTOBalanceView from "@/components/timeclock/PTOBalanceView";
import QuickClockSection from "@/components/timeclock/QuickClockSection";
import { Skeleton } from "@/components/ui/skeleton";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import TimeClockLoginDialog from "@/components/timeclock/TimeClockLoginDialog";
import UserSettingsTab from "@/components/timeclock/UserSettingsTab";
import CorrectionRequestDialog from "@/components/timeclock/CorrectionRequestDialog";
import WorkPauseOverlay from "@/components/timeclock/WorkPauseOverlay";
import EmployeeTodayCard from "@/components/timeclock/EmployeeTodayCard";
import TimeClockHelpCard from "@/components/timeclock/TimeClockHelpCard";
import {
  TIME_CLOCK_IDLE_LOGOUT_MS,
  remainingTimeClockSessionMs,
  classifyTimeClockLoginStatus,
} from "@/components/timeclock/timeClockSessionSecurity";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { staffEntities } from "@/components/staff/staffEntities";

const TimeEntry = staffEntities.TimeEntry;
const TimeOffRequest = staffEntities.TimeOffRequest;
const AuthorizedEmail = staffEntities.AuthorizedEmail;

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-notes-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function notesRequestStorageKey(entryId) {
  return `ccs_timeclock_notes_request:${String(entryId || "").trim()}`;
}

function storedNotesRequest(entryId) {
  try {
    const raw = sessionStorage.getItem(notesRequestStorageKey(entryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const requestId = String(parsed?.request_id || "");
    return requestId.length >= 8 && requestId.length <= 128 && parsed?.payload
      ? { request_id: requestId, payload: parsed.payload }
      : null;
  } catch {
    return null;
  }
}

function persistNotesRequest(entryId, requestId, payload) {
  try { sessionStorage.setItem(notesRequestStorageKey(entryId), JSON.stringify({ request_id: requestId, payload })); } catch {}
}

function clearNotesRequest(entryId, expectedRequestId = "") {
  try {
    if (expectedRequestId && storedNotesRequest(entryId)?.request_id !== expectedRequestId) return;
    sessionStorage.removeItem(notesRequestStorageKey(entryId));
  } catch {}
}

function shouldRetainNotesRequest(err) {
  if (err?.retrySameRequest === true || err?.response?.data?.retry_same_request === true) return true;
  if (err?.confirmedServerResponse === true) return false;
  const status = Number(err?.response?.status || 0);
  return !err?.response || status >= 500;
}

function officialPunchLabel(value) {
  if (!value) return "an unknown time";
  try {
    const parsed = parseISO(value);
    if (!Number.isFinite(parsed.getTime())) return "an unknown time";
    return format(parsed, "MMM d 'at' h:mm a");
  } catch {
    return "an unknown time";
  }
}

function loginStatusNotice(status) {
  const report = classifyTimeClockLoginStatus(status);
  if (report.kind === "punch_resolution") {
    return {
      tone: "warning",
      title: "Previous shift needs punch confirmation",
      message: `The server still has you clocked in from ${officialPunchLabel(report.clockIn)}. Use the missed-punch window below before starting another shift. Logging in did not change your recorded time.`,
    };
  }
  if (report.kind === "clocked_in") {
    return {
      tone: "info",
      title: "You are still clocked in",
      message: `The server restored your active shift from ${officialPunchLabel(report.clockIn)}. Signing back in did not create a new Clock In or change the existing shift.`,
    };
  }
  if (report.kind === "pending_punch_review") {
    const countText = report.count === 1 ? "one previous punch report" : `${report.count} previous punch reports`;
    const currentState = report.status === "clocked_in"
      ? "Your current shift is still Clocked In and is separate from that prior review."
      : report.status === "clocked_out"
        ? "You are currently Clocked Out and can still start a new shift normally."
        : "Your current Time Clock state is being restored separately.";
    if (report.hasIntegrityIssue) {
      return {
        tone: "warning",
        title: "Previous punch report needs manager investigation",
        message: `The server found ${countText}, and at least one linked review record does not reconcile cleanly. ${currentState} A manager must investigate the unresolved prior shift; logging in did not change it.`,
      };
    }
    if (report.hasRejectedItem) {
      return {
        tone: "warning",
        title: "Previous punch report needs follow-up",
        message: `The server found ${countText}, including a manager-rejected item that remains unresolved. ${currentState} Contact a manager before assuming that prior shift is settled.`,
      };
    }
    return {
      tone: "warning",
      title: "Previous punch report is awaiting manager review",
      message: `The server found ${countText} still awaiting manager review. ${currentState} Your reported prior time remains preserved and auditable until the review is completed.`,
    };
  }
  if (report.kind === "pending_shift_review") {
    const currentState = report.status === "clocked_in"
      ? "Your current shift is still Clocked In and is separate from that review."
      : report.status === "clocked_out"
        ? "You are currently Clocked Out."
        : "Your current Time Clock state is being restored separately.";
    const missedClockInOnly = report.missedClockInCount > 0 && report.correctedShiftCount === 0 && report.directAdminCorrectionCount === 0;
    const correctedOnly = report.correctedShiftCount > 0 && report.missedClockInCount === 0 && report.directAdminCorrectionCount === 0;
    const directAdminOnly = report.directAdminCorrectionCount > 0 && report.missedClockInCount === 0 && report.correctedShiftCount === 0;
    const subject = report.count === 1 ? "one shift" : `${report.count} shifts`;
    if (report.hasIntegrityIssue) {
      return {
        tone: "warning",
        title: "Shift review needs manager investigation",
        message: `${subject} awaiting final approval cannot be tied cleanly to its supporting correction or missed-punch evidence. ${currentState} A manager must investigate before payroll finalization.`,
      };
    }
    if (missedClockInOnly) {
      return {
        tone: "warning",
        title: "Missed Clock In recorded — shift still needs approval",
        message: `Your employee-reported Clock In is recorded on the completed shift, but ${subject} still needs the separate manager shift-approval step before pay-period finalization. ${currentState}`,
      };
    }
    if (correctedOnly) {
      return {
        tone: "warning",
        title: "Punch correction applied — shift still needs approval",
        message: `The missed-punch correction is complete, but ${subject} still needs the separate manager shift-approval step before pay-period finalization. ${currentState}`,
      };
    }
    if (directAdminOnly) {
      return {
        tone: "warning",
        title: "Manager correction applied — shift still needs approval",
        message: `A manager corrected ${subject}, but the correction does not count as final shift approval. A separate manager approval is still required before pay-period finalization. ${currentState}`,
      };
    }
    return {
      tone: "warning",
      title: "Time review complete — shift approval still pending",
      message: `${subject} still needs final manager shift approval before pay-period finalization. ${currentState}`,
    };
  }
  if (report.kind === "transition") {
    return {
      tone: "warning",
      title: "A Time Clock action is still finishing",
      message: "The server reports an in-progress Time Clock transition. Conflicting actions stay blocked until authoritative state recovery finishes.",
    };
  }
  if (report.kind === "clocked_out") {
    return {
      tone: "success",
      title: "Server status: clocked out",
      message: "Your authoritative Time Clock state is currently Clocked Out. Signing in only restored personal access; it did not create a punch.",
    };
  }
  return {
    tone: "warning",
    title: "Time Clock status needs a refresh",
    message: "Personal access was restored, but authoritative punch status could not be confirmed. Refresh Time Clock status before making a punch decision.",
  };
}

export default function TimeClock() {
  const { currentUser: shellUser, sessionToken: shellSessionToken } = useAuth();
  const [allUsers, setAllUsers] = useState([]);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [timeClockSessionToken, setTimeClockSessionToken] = useState("");
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  
  const [timeEntries, setTimeEntries] = useState([]);
  const [timeOffRequests, setTimeOffRequests] = useState([]);
  const [correctionRequests, setCorrectionRequests] = useState([]);
  const [correctionEntry, setCorrectionEntry] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showTimeOffRequest, setShowTimeOffRequest] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [activeTab, setActiveTab] = useState("clock");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [editingNotes, setEditingNotes] = useState(null);
  const [editNotesText, setEditNotesText] = useState("");
  const [savingNotesId, setSavingNotesId] = useState(null);
  const [editingTimeOff, setEditingTimeOff] = useState(null);
  const [cancellingTimeOffId, setCancellingTimeOffId] = useState("");
  const [timeEntryError, setTimeEntryError] = useState("");
  const [sessionNotice, setSessionNotice] = useState(null);
  const idleTimerRef = useRef(null);
  const lastActivityAtRef = useRef(0);
  const loginReportRunRef = useRef(0);
  const dataSeqRef = useRef(0);
  const dataScopeRef = useRef("");
  // Update the data scope during render so a stale employee-session read that
  // resolves between a session-switch render and the effect cannot apply.
  const dataScope = `${timeClockSessionToken}|${String(loggedInUser?.email || "").toLowerCase()}`;
  if (dataScopeRef.current !== dataScope) {
    dataScopeRef.current = dataScope;
    dataSeqRef.current += 1;
  }

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadAllUsers();
  }, []);

  useEffect(() => {
    if (loggedInUser?.email) {
      loadData();
    }
  }, [loggedInUser, timeClockSessionToken]);

  const loadAllUsers = async () => {
    setIsLoading(true);
    try {
      const users = await loadAllEntityRows({
        entity: AuthorizedEmail,
        sort: null,
        label: "Time Clock authorized users",
      });
      setAllUsers(users);
    } catch (err) {
      console.error("Error loading users:", err);
    }
    setIsLoading(false);
  };

  const loadData = async () => {
    const requestEmail = String(loggedInUser?.email || "").toLowerCase();
    const requestToken = timeClockSessionToken;
    const requestScope = `${requestToken}|${requestEmail}`;
    const requestSeq = ++dataSeqRef.current;
    const current = () =>
      requestSeq === dataSeqRef.current && dataScopeRef.current === requestScope;
    if (!requestEmail) return;

    setIsLoading(true);
    try {
      const [entries, requests] = await Promise.all([
        loadAllEntityRows({
          entity: TimeEntry,
          query: { user_email: loggedInUser.email, archived_test_data: { $ne: true }, archived_admin: { $ne: true } },
          sort: null,
          label: `Time entries for ${loggedInUser.email}`,
        }),
        loadAllEntityRows({
          entity: TimeOffRequest,
          query: { user_email: loggedInUser.email, archived_test_data: { $ne: true } },
          sort: null,
          label: `Time off requests for ${loggedInUser.email}`,
        })
      ]);

      if (!current()) return;

      entries.sort((a, b) => new Date(b.clock_in) - new Date(a.clock_in));
      requests.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      
      setTimeEntries(entries);
      setTimeOffRequests(requests);

      if (requestToken) {
        try {
          const correctionResponse = await base44.functions.invoke("timeClockAction", {
            action: "list_correction_requests",
            session_token: requestToken,
            target_email: loggedInUser.email,
            request_id: newRequestId(),
          });
          if (!current()) return;
          const correctionData = correctionResponse?.data || correctionResponse;
          setCorrectionRequests(correctionData?.success && Array.isArray(correctionData.requests) ? correctionData.requests : []);
        } catch (correctionError) {
          console.error("Error loading correction requests:", correctionError);
          if (current()) setCorrectionRequests([]);
        }
      } else {
        setCorrectionRequests([]);
      }
      
      const activeEntries = entries.filter(e => e.status === "clocked_in");
      if (current() && activeEntries.length > 1) {
        setTimeEntryError(`Multiple active time entries were found for ${loggedInUser.email}. No clock-out row was selected automatically; an admin must review the duplicates.`);
      }
    } catch (err) {
      console.error("Error loading data:", err);
    }
    if (current()) setIsLoading(false);
  };

  const cancelTimeOffRequest = async (request) => {
    if (!request?.id || !timeClockSessionToken || cancellingTimeOffId) return;
    if (!window.confirm(`Cancel your ${request.request_type?.replace("_", " ")} request (${request.start_date}${request.end_date !== request.start_date ? ` – ${request.end_date}` : ""})?`)) return;
    setCancellingTimeOffId(request.id);
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "time_off_decision",
        session_token: timeClockSessionToken,
        target_email: loggedInUser.email,
        request_id: newRequestId(),
        time_off_request_id: request.id,
        expected_updated_date: request.updated_date,
        decision: "cancelled",
      });
      const data = response?.data || response;
      if (!data?.success) throw new Error(data?.error || "The request could not be cancelled.");
      await loadData();
    } catch (err) {
      setTimeEntryError(err?.response?.data?.error || err?.message || "The time-off request could not be cancelled. Reload and try again.");
      await loadData();
    } finally {
      setCancellingTimeOffId("");
    }
  };

  const clearEmployeeSession = useCallback(({ reason = "manual" } = {}) => {
    loginReportRunRef.current += 1;
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    lastActivityAtRef.current = 0;
    setLoggedInUser(null);
    setTimeClockSessionToken("");
    setTimeEntries([]);
    setTimeOffRequests([]);
    setCorrectionRequests([]);
    setCorrectionEntry(null);
    setShowTimeOffRequest(false);
    setEditingTimeOff(null);
    setEditingNotes(null);
    setEditNotesText("");
    setSavingNotesId(null);
    setActiveTab("clock");
    setTimeEntryError("");
    if (reason === "idle") {
      setSessionNotice({
        tone: "warning",
        title: "Full Access locked for inactivity",
        message: `Your personal Time Clock view automatically locked after ${Math.round(TIME_CLOCK_IDLE_LOGOUT_MS / 60000)} minutes without activity. This did not Clock Out, end a break, resume Work Pause, or change any recorded time. Sign in again to restore your authoritative status.`,
      });
    } else {
      setSessionNotice(null);
    }
  }, []);

  const handleLogin = async (user, token = "") => {
    const email = String(user?.email || "").trim().toLowerCase();
    const runId = ++loginReportRunRef.current;
    setLoggedInUser(user);
    setTimeClockSessionToken(token);
    setShowLoginDialog(false);
    setTimeEntryError("");
    setSessionNotice({
      tone: "info",
      title: "Checking official Time Clock status",
      message: "Your personal access is restored. The server is confirming whether you are Clocked In, Clocked Out, or need punch review.",
    });

    if (!email || !token) {
      if (runId === loginReportRunRef.current) setSessionNotice(loginStatusNotice(null));
      return;
    }

    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "status",
        session_token: token,
        target_email: email,
      });
      const status = response?.data || response;
      if (runId !== loginReportRunRef.current) return;
      setSessionNotice(loginStatusNotice(status));
    } catch (err) {
      if (runId !== loginReportRunRef.current) return;
      setSessionNotice({
        tone: "warning",
        title: "Time Clock status could not be confirmed",
        message: err?.response?.data?.error || err?.message || "Personal access is restored, but the server status check failed. Refresh before making a punch decision.",
      });
    }
  };

  const handleLogout = () => clearEmployeeSession({ reason: "manual" });

  useEffect(() => {
    if (!loggedInUser?.email || !timeClockSessionToken) return undefined;

    const clearTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    };
    const checkIdle = () => {
      clearTimer();
      const remaining = remainingTimeClockSessionMs(lastActivityAtRef.current, Date.now());
      if (remaining <= 0) {
        clearEmployeeSession({ reason: "idle" });
        return;
      }
      idleTimerRef.current = setTimeout(checkIdle, remaining);
    };
    const markActivity = () => {
      lastActivityAtRef.current = Date.now();
      checkIdle();
    };
    const checkOnReturn = () => {
      if (document.visibilityState === "visible") checkIdle();
    };

    lastActivityAtRef.current = Date.now();
    checkIdle();
    const activityEvents = ["pointerdown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));
    window.addEventListener("focus", checkIdle);
    document.addEventListener("visibilitychange", checkOnReturn);

    return () => {
      clearTimer();
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      window.removeEventListener("focus", checkIdle);
      document.removeEventListener("visibilitychange", checkOnReturn);
    };
  }, [clearEmployeeSession, loggedInUser?.email, timeClockSessionToken]);

  // Calculate weekly hours
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 0 });

  const weeklyEntries = timeEntries.filter(entry => {
    const entryDate = parseISO(entry.clock_in);
    return isWithinInterval(entryDate, { start: weekStart, end: weekEnd });
  });

  const weeklyHours = weeklyEntries.reduce((sum, entry) => sum + (entry.total_hours || 0), 0);
  const isSalaryEmployee = loggedInUser?.employment_type === "salary";

  // Preserve the existing hourly display behavior. Salary employees use tracked
  // operational work time only and are not shown a payroll/overtime breakdown.
  const regularHours = Math.min(weeklyHours, 40);
  const overtimeHours = Math.max(0, weeklyHours - 40);

  const handleSaveNotes = async (entryId) => {
    const loadedEntry = timeEntries.find(entry => entry.id === entryId);
    if (!loadedEntry?.id || savingNotesId) return;
    if (!timeClockSessionToken || !loggedInUser?.email) {
      setTimeEntryError("Your signed Time Clock session is no longer available. Sign in again before editing notes.");
      return;
    }
    const stored = storedNotesRequest(entryId);
    const payload = stored?.payload || {
      action: "update_notes",
      target_email: loggedInUser.email,
      entry_id: loadedEntry.id,
      expected_updated_date: loadedEntry.updated_date,
      notes: editNotesText,
    };
    if (stored && String(payload.notes || "") !== editNotesText) {
      setTimeEntryError("A previous notes update may already be saved. Retry the preserved update before changing the note again.");
      return;
    }
    const requestId = stored?.request_id || newRequestId();
    persistNotesRequest(entryId, requestId, payload);

    setTimeEntryError("");
    setSavingNotesId(entryId);
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        ...payload,
        session_token: timeClockSessionToken,
        request_id: requestId,
      });
      const data = response?.data || response;
      if (!data?.success) {
        const error = new Error(data?.error || "The notes update was not confirmed by the server.");
        error.retrySameRequest = data?.retry_same_request === true;
        error.confirmedServerResponse = true;
        throw error;
      }
      clearNotesRequest(entryId, requestId);
      setEditingNotes(null);
      setEditNotesText("");
      await loadData();
    } catch (err) {
      console.error("Error saving notes:", err);
      if (!shouldRetainNotesRequest(err)) clearNotesRequest(entryId, requestId);
      setTimeEntryError(err?.response?.data?.error || err?.message || "The notes changed in another session. Latest data was reloaded.");
      await loadData();
    } finally {
      setSavingNotesId(null);
    }
  };

  const startEditingNotes = (entry) => {
    const stored = storedNotesRequest(entry.id);
    setEditingNotes(entry.id);
    setEditNotesText(stored?.payload?.notes ?? entry.notes ?? "");
  };

  if (isLoading && allUsers.length === 0) {
    return (
      <div className="min-h-screen p-4 sm:p-6 ambient-mesh">
        <div className="max-w-4xl mx-auto">
          <div className="relative mb-6 flex items-center justify-between overflow-hidden rounded-2xl px-3 py-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
            <Skeleton className="h-9 w-36" />
          </div>
          <Skeleton className="mb-4 h-64 w-full rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const shellAlreadyGuardsThisEmployee = Boolean(
    shellSessionToken &&
    shellUser?.email &&
    loggedInUser?.email &&
    shellUser.email.toLowerCase() === loggedInUser.email.toLowerCase()
  );

  return (
    <>
      <WorkPauseOverlay
        userOverride={loggedInUser}
        sessionTokenOverride={timeClockSessionToken}
        disabled={!loggedInUser || !timeClockSessionToken || shellAlreadyGuardsThisEmployee}
      />
      <PullToRefresh onRefresh={loadData}>
    <div className="min-h-screen p-4 sm:p-6 ambient-mesh">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="clay-card p-3">
              <Clock className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Time Clock</h1>
              <p className="text-gray-600 text-sm">Track your work hours</p>
            </div>
          </div>
          
          {loggedInUser ? (
            <div className="flex items-center gap-3">
              <Button onClick={() => setShowTimeOffRequest(true)} variant="outline" className="gap-2">
                <Calendar className="w-4 h-4" />
                Request Time Off
              </Button>
              <Button onClick={handleLogout} variant="outline" className="gap-2">
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          ) : (
            <Button onClick={() => setShowLoginDialog(true)} className="gap-2 bg-purple-600 hover:bg-purple-700">
              <LogIn className="w-4 h-4" />
              Login for Full Access
            </Button>
          )}
        </div>

        {sessionNotice && (
          <div className={`mb-4 rounded-xl border p-3 text-sm ${
            sessionNotice.tone === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : sessionNotice.tone === "info"
                ? "border-blue-200 bg-blue-50 text-blue-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
          }`}>
            <div className="font-semibold">{sessionNotice.title}</div>
            <div className="mt-1 text-xs leading-relaxed">{sessionNotice.message}</div>
          </div>
        )}

        {timeEntryError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">Time entry update blocked</div>
              <div className="mt-1 text-xs">{timeEntryError}</div>
            </div>
            <Button type="button" size="sm" variant="outline" className="shrink-0 border-red-300 bg-white text-red-800" onClick={async () => { await loadData(); setTimeEntryError(""); }}>Reload latest</Button>
          </div>
        )}

        {/* Current Time Display */}
        <div className="clay-card p-6 mb-6 text-center">
          <p className="text-sm text-gray-500 mb-1">{format(currentTime, "EEEE, MMMM d, yyyy")}</p>
          <p className="text-4xl font-bold text-gray-800">{format(currentTime, "h:mm:ss a")}</p>
        </div>

        {/* Quick Clock In/Out Section - Always Visible */}
        <QuickClockSection
          key={`${loggedInUser?.email || "guest"}:${timeClockSessionToken ? "employee-session" : "shared-session"}`}
          allUsers={allUsers}
          employeeSessionToken={timeClockSessionToken}
          employeeSessionUser={loggedInUser}
        />

        {loggedInUser && timeClockSessionToken && (
          <EmployeeTodayCard
            user={loggedInUser}
            sessionToken={timeClockSessionToken}
            timeEntries={timeEntries}
            correctionRequests={correctionRequests}
            onRefresh={loadData}
          />
        )}

        {/* Login Required Section */}
        {!loggedInUser ? (
          <div className="clay-card p-8 text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold mb-2">Login Required</h3>
            <p className="text-gray-500 mb-2">
              Login to view your time history, time off requests, and PTO balance
            </p>
            <p className="text-xs text-gray-400 mb-4">
              Full Access automatically locks after {Math.round(TIME_CLOCK_IDLE_LOGOUT_MS / 60000)} minutes without activity. Auto-lock never clocks you out or changes your recorded time.
            </p>
            <Button onClick={() => setShowLoginDialog(true)} className="gap-2 bg-purple-600 hover:bg-purple-700">
              <LogIn className="w-4 h-4" />
              Login
            </Button>
          </div>
        ) : (
          <>
            {/* Logged In User Info */}
            <div className="clay-card p-4 mb-6">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-purple-600" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{loggedInUser.full_name || loggedInUser.email}</p>
                    {isSalaryEmployee && <Badge className="bg-purple-100 text-purple-700">Salary</Badge>}
                  </div>
                  <p className="text-sm text-gray-500">@{loggedInUser.username}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Full Access auto-locks after {Math.round(TIME_CLOCK_IDLE_LOGOUT_MS / 60000)} idle minutes without changing punch state.
                  </p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="clock" className="gap-2">
                  <History className="w-4 h-4" />
                  Time History
                </TabsTrigger>
                <TabsTrigger value="timeoff" className="gap-2">
                  <Calendar className="w-4 h-4" />
                  Time Off Requests
                </TabsTrigger>
                <TabsTrigger value="balance" className="gap-2">
                  <Briefcase className="w-4 h-4" />
                  My PTO Balance
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-2">
                  <Settings className="w-4 h-4" />
                  Settings
                </TabsTrigger>
              </TabsList>

              <TabsContent value="clock">
                {/* Weekly Summary */}
                <div className="clay-card p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <Button variant="ghost" size="sm" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <h3 className="font-semibold">
                      Week of {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
                    </h3>
                    <Button variant="ghost" size="sm" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-purple-600">{weeklyHours.toFixed(2)} hrs</p>
                    <p className="text-sm text-gray-500">{isSalaryEmployee ? "Tracked work this week" : "Total this week"}</p>
                    {!isSalaryEmployee && overtimeHours > 0 && (
                      <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-full">
                        <span className="text-sm font-semibold">🕐 {overtimeHours.toFixed(2)} hrs overtime</span>
                      </div>
                    )}
                    {weeklyHours > 0 && !isSalaryEmployee && (
                      <p className="text-xs text-gray-400 mt-1">
                        Regular: {regularHours.toFixed(2)} hrs
                        {overtimeHours > 0 && ` | OT: ${overtimeHours.toFixed(2)} hrs`}
                      </p>
                    )}
                    {isSalaryEmployee && (
                      <p className="text-xs text-purple-600 mt-2">
                        Salary tracking records actual work time for operations and reporting; it does not determine pay or overtime.
                      </p>
                    )}
                  </div>
                </div>

                {/* Time Entries List */}
                <Stagger className="space-y-3">
                  {weeklyEntries.length === 0 ? (
                    <div className="clay-card p-6 text-center text-gray-500">
                      <Clock className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p>No time entries for this week</p>
                    </div>
                  ) : (
                    weeklyEntries.map((entry, index) => {
                      const correctionRequest = correctionRequests.find(request => request.time_entry_id === entry.id);
                      // Calculate running total up to this entry to determine OT
                      const entriesUpToThis = weeklyEntries.slice(index);
                      const hoursBeforeThis = entriesUpToThis.slice(1).reduce((sum, e) => sum + (e.total_hours || 0), 0);
                      const entryHours = entry.total_hours || 0;
                      const entryRegular = Math.min(entryHours, Math.max(0, 40 - hoursBeforeThis));
                      const entryOT = Math.max(0, entryHours - entryRegular);
                      
                      return (
                      <StaggerItem key={entry.id} className="clay-card p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{format(parseISO(entry.clock_in), "EEEE, MMM d")}</p>
                              {entry.pay_period_id && (
                                <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300 gap-1">
                                  <LockKeyhole className="w-3 h-3" /> Finalized
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">
                              {format(parseISO(entry.clock_in), "h:mm a")}
                              {entry.clock_out && ` - ${format(parseISO(entry.clock_out), "h:mm a")}`}
                              {entry.status === "needs_resolution" && correctionRequest?.requested_changes?.clock_out && (
                                <> · reported out {format(parseISO(correctionRequest.requested_changes.clock_out), "h:mm a")} pending manager review</>
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            {entry.status === "clocked_in" ? (
                              <Badge className="bg-green-100 text-green-700">Active</Badge>
                            ) : entry.status === "needs_resolution" ? (
                              <Badge className="bg-amber-100 text-amber-800">Missed punch · review pending</Badge>
                            ) : (
                              <div className="flex flex-col items-end gap-1">
                                <p className="text-lg font-bold text-purple-600">{entryHours.toFixed(2)} hrs</p>
                                {!isSalaryEmployee && entryOT > 0 && (
                                  <p className="text-xs text-amber-600 font-medium">({entryOT.toFixed(2)} OT)</p>
                                )}
                                {entry.approval_status === "needs_review" && (
                                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Shift Needs Review</Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {entry.lunch_minutes > 0 && (
                          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <Coffee className="w-3 h-3" />
                            Lunch: {entry.lunch_minutes} min
                          </div>
                        )}

                        {Number(entry.tracked_work_pause_minutes || 0) > 0 && (
                          <div className="flex items-center gap-2 text-sm text-purple-700 mb-2">
                            <Pause className="w-3 h-3" />
                            Work Paused: {entry.tracked_work_pause_minutes} min excluded from worked time
                          </div>
                        )}

                        {entry.job_allocations && entry.job_allocations.length > 0 && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs font-medium text-gray-500 mb-2">Job Allocations:</p>
                            <div className="space-y-1">
                              {entry.job_allocations.map((job, i) => (
                                <div key={i} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                                  <div className="flex items-center gap-2">
                                    {job.is_inhouse ? (
                                      <>
                                        <Home className="w-3 h-3 text-amber-600" />
                                        <span>{job.inhouse_task}</span>
                                      </>
                                    ) : (
                                      <>
                                        <Briefcase className="w-3 h-3 text-purple-600" />
                                        <span>{job.client_name}</span>
                                      </>
                                    )}
                                  </div>
                                  <span className="font-medium">{job.hours?.toFixed(2)} hrs</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Notes Section */}
                        <div className="mt-3 pt-3 border-t">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <FileText className="w-3 h-3" />
                              Notes:
                            </div>
                            {entry.status === "clocked_out" && editingNotes !== entry.id && !entry.pay_period_id && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 px-2 text-xs"
                                onClick={() => startEditingNotes(entry)}
                              >
                                <Pencil className="w-3 h-3 mr-1" />
                                {entry.notes ? "Edit" : "Add"}
                              </Button>
                            )}
                            {entry.pay_period_id && (
                              <span className="text-[11px] text-slate-500 flex items-center gap-1"><LockKeyhole className="w-3 h-3" />Locked</span>
                            )}
                          </div>
                          {editingNotes === entry.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editNotesText}
                                onChange={(e) => setEditNotesText(e.target.value)}
                                placeholder="Add notes about this time entry..."
                                className="text-sm min-h-[60px]"
                              />
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  className="h-7 px-3 bg-green-600 hover:bg-green-700"
                                  onClick={() => handleSaveNotes(entry.id)}
                                  disabled={savingNotesId === entry.id}
                                >
                                  {savingNotesId === entry.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                                  {savingNotesId === entry.id ? "Saving..." : "Save"}
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="h-7 px-3"
                                  disabled={savingNotesId === entry.id}
                                  onClick={() => { setEditingNotes(null); setEditNotesText(""); }}
                                >
                                  <X className="w-3 h-3 mr-1" />
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : entry.notes ? (
                            <p className="text-sm text-gray-600">{entry.notes}</p>
                          ) : (
                            <p className="text-sm text-gray-400 italic">No notes</p>
                          )}
                        </div>

                        {["clocked_out", "needs_resolution"].includes(entry.status) && (
                          <div className="mt-3 pt-3 border-t flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-medium text-gray-500">Correction</p>
                              {correctionRequest ? (
                                <Badge className={
                                  correctionRequest.status === "approved" || correctionRequest.status === "approved_modified"
                                    ? "bg-green-100 text-green-700"
                                    : correctionRequest.status === "rejected"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-amber-100 text-amber-700"
                                }>
                                  {correctionRequest.status === "approved_modified" ? "Approved with changes" : correctionRequest.status.replace("_", " ")}
                                </Badge>
                              ) : (
                                <p className="text-xs text-gray-400">No correction requested</p>
                              )}
                            </div>
                            {entry.status === "needs_resolution" ? (
                              <span className="text-xs font-medium text-amber-700">Manager review required before this prior shift is complete</span>
                            ) : entry.approval_status === "needs_review" && correctionRequest && ["approved", "approved_modified"].includes(correctionRequest.status) ? (
                              <span className="text-xs font-medium text-amber-700">Correction applied · separate manager shift approval still required</span>
                            ) : entry.pay_period_id ? (
                              <span className="text-xs text-slate-600 flex items-center gap-1"><LockKeyhole className="w-3 h-3" />Finalized period — contact a manager to reopen before requesting a correction</span>
                            ) : !correctionRequest || ["approved", "approved_modified", "rejected", "cancelled"].includes(correctionRequest.status) ? (
                              <Button variant="outline" size="sm" onClick={() => setCorrectionEntry(entry)}>
                                Request Correction
                              </Button>
                            ) : (
                              <span className="text-xs text-amber-700">Manager review pending</span>
                            )}
                          </div>
                        )}
                      </StaggerItem>
                    );})
                  )}
                </Stagger>
              </TabsContent>

              <TabsContent value="timeoff">
                <Stagger className="space-y-3">
                  {timeOffRequests.length === 0 ? (
                    <div className="clay-card p-6 text-center text-gray-500">
                      <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p>No time off requests</p>
                      <Button 
                        onClick={() => setShowTimeOffRequest(true)} 
                        variant="outline" 
                        className="mt-4"
                      >
                        Request Time Off
                      </Button>
                    </div>
                  ) : (
                    timeOffRequests.map(request => (
                      <StaggerItem key={request.id} className="clay-card p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold capitalize">{request.request_type.replace("_", " ")}</p>
                            <p className="text-sm text-gray-500">
                              {format(parseISO(request.start_date), "MMM d, yyyy")}
                              {request.end_date !== request.start_date && 
                                ` - ${format(parseISO(request.end_date), "MMM d, yyyy")}`
                              }
                            </p>
                            <p className="text-sm text-gray-600 mt-1">{request.hours_requested} hours</p>
                            {request.reason && (
                              <p className="text-sm text-gray-500 mt-1">{request.reason}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {request.status === "pending" && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 px-2"
                                onClick={() => setEditingTimeOff(request)}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            )}
                            {["pending", "approved"].includes(request.status) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-red-600 hover:bg-red-50"
                                disabled={cancellingTimeOffId === request.id}
                                onClick={() => cancelTimeOffRequest(request)}
                              >
                                {cancellingTimeOffId === request.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <Ban className="w-3 h-3" />}
                              </Button>
                            )}
                            <Badge className={
                              request.status === "approved" ? "bg-green-100 text-green-700" :
                              request.status === "denied" ? "bg-red-100 text-red-700" :
                              "bg-yellow-100 text-yellow-700"
                            }>
                              {request.status === "approved" && <CheckCircle className="w-3 h-3 mr-1" />}
                              {request.status === "denied" && <XCircle className="w-3 h-3 mr-1" />}
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </Badge>
                          </div>
                        </div>
                        {request.admin_notes && (
                          <p className="text-sm text-gray-500 mt-2 italic">Admin: {request.admin_notes}</p>
                        )}
                      </StaggerItem>
                    ))
                  )}
                </Stagger>
              </TabsContent>

              <TabsContent value="balance">
                <PTOBalanceView currentUser={loggedInUser} />
              </TabsContent>

              <TabsContent value="settings">
                <UserSettingsTab 
                  currentUser={loggedInUser}
                  sessionToken={timeClockSessionToken}
                  onUserUpdated={async () => {
                    const users = await loadAllEntityRows({
                      entity: AuthorizedEmail,
                      sort: null,
                      label: "Time Clock authorized users refresh",
                    });
                    setAllUsers(users);
                    const updated = users.find(u => u.id === loggedInUser.id);
                    if (updated) setLoggedInUser(updated);
                  }} 
                />
              </TabsContent>
            </Tabs>
            <div className="mt-6">
              <TimeClockHelpCard />
            </div>
          </>
        )}
      </div>

      {/* Dialogs */}
      {showTimeOffRequest && loggedInUser && (
        <TimeOffRequestDialog
          isOpen={showTimeOffRequest}
          onClose={() => setShowTimeOffRequest(false)}
          currentUser={loggedInUser}
          sessionToken={timeClockSessionToken}
          onSubmit={loadData}
        />
      )}

      {editingTimeOff && (
        <TimeOffRequestDialog
          isOpen={!!editingTimeOff}
          onClose={() => setEditingTimeOff(null)}
          currentUser={loggedInUser}
          sessionToken={timeClockSessionToken}
          onSubmit={loadData}
          existingRequest={editingTimeOff}
        />
      )}

      <TimeClockLoginDialog
        isOpen={showLoginDialog}
        onClose={() => setShowLoginDialog(false)}
        onLogin={handleLogin}
        allUsers={allUsers}
      />

      <CorrectionRequestDialog
        open={!!correctionEntry}
        onOpenChange={(open) => { if (!open) setCorrectionEntry(null); }}
        entry={correctionEntry}
        sessionToken={timeClockSessionToken}
        onSubmitted={loadData}
      />
    </div>
    </PullToRefresh>
    </>
  );
}