import { useState, useEffect, Fragment } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Download, 
  Pencil, 
  Archive, 
  Flag,
  User, 
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Search,
  Save,
  Briefcase,
  Home,
  Loader2,
  AlertTriangle,
  Coffee,
  Clock3,
  Pause,
  CheckCircle2,
  RotateCcw,
  LockKeyhole,
  Eye,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isWithinInterval, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, startOfDay, endOfDay, addDays, subDays } from "date-fns";
import * as XLSX from "xlsx";
import CorrectionRequestAdminPanel from "@/components/timeclock/CorrectionRequestAdminPanel";
import TimeOffApprovalPanel from "@/components/timeclock/TimeOffApprovalPanel";
import TimeClockExceptionCenter from "@/components/timeclock/TimeClockExceptionCenter";
import CorrectionCoordinatorDiagnostics from "@/components/timeclock/CorrectionCoordinatorDiagnostics";
import TimeClockManagementDashboard from "@/components/timeclock/TimeClockManagementDashboard";
import TimeClockPunchExceptionReport from "@/components/timeclock/TimeClockPunchExceptionReport";
import PayPeriodManager from "@/components/timeclock/PayPeriodManager";
import TimeClockAuditTrail from "@/components/timeclock/TimeClockAuditTrail";
import TimeClockShiftDetail from "@/components/timeclock/TimeClockShiftDetail";
import {
  TIME_CLOCK_COMPANY_TIME_LABEL,
  companyDateTimeInputFromIso,
  parseCompanyDateTimeInput,
  shiftDurationSummary,
  formatCompanyDateTime,
} from "@/components/timeclock/timeClockCompanyTime";

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-admin-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function functionData(response) {
  return response?.data || response;
}

function safeFormat(value, pattern) {
  if (!value) return '-';
  const date = value instanceof Date ? value : parseISO(String(value));
  if (!date || Number.isNaN(date.getTime())) return '-';
  try { return format(date, pattern); } catch { return '-'; }
}

function adminRequestStorageKey(action, entryId) {
  return `ccs_timeclock_admin_request:${action}:${String(entryId || "").trim()}`;
}

function storedAdminRequestId(action, entryId) {
  try {
    const value = sessionStorage.getItem(adminRequestStorageKey(action, entryId)) || "";
    return value.length >= 8 && value.length <= 128 ? value : "";
  } catch {
    return "";
  }
}

function persistAdminRequestId(action, entryId, requestId) {
  try { sessionStorage.setItem(adminRequestStorageKey(action, entryId), requestId); } catch {}
}

function clearAdminRequestId(action, entryId, expectedRequestId = "") {
  try {
    if (expectedRequestId &&
        sessionStorage.getItem(adminRequestStorageKey(action, entryId)) !== expectedRequestId) return;
    sessionStorage.removeItem(adminRequestStorageKey(action, entryId));
  } catch {}
}

function approvalRetryStorageKey(decision, entryId) {
  return `${adminRequestStorageKey(approvalRequestStorageAction(decision), entryId)}:payload`;
}

function storedApprovalRetry(decision, entryId) {
  try {
    const raw = sessionStorage.getItem(approvalRetryStorageKey(decision, entryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.entry_id !== entryId || parsed.decision !== decision || !parsed.request_id || !parsed.expected_updated_date || !parsed.target_email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistApprovalRetry(payload) {
  try {
    sessionStorage.setItem(approvalRetryStorageKey(payload.decision, payload.entry_id), JSON.stringify(payload));
  } catch {}
}

function clearApprovalRetry(decision, entryId, expectedRequestId = "") {
  try {
    if (expectedRequestId && storedApprovalRetry(decision, entryId)?.request_id !== expectedRequestId) return;
    sessionStorage.removeItem(approvalRetryStorageKey(decision, entryId));
  } catch {}
}

function approvalRequestStorageAction(decision) {
  return `admin_set_entry_approval:${decision === "reopen" ? "reopen" : "approve"}`;
}

function adminActionError(data, fallback) {
  const error = new Error(data?.error || fallback);
  error.retrySameRequest = data?.retry_same_request === true;
  error.confirmedServerResponse = true;
  return error;
}

function shouldRetainAdminRequest(err) {
  if (err?.retrySameRequest === true || err?.response?.data?.retry_same_request === true) return true;
  if (err?.confirmedServerResponse === true) return false;
  const status = Number(err?.response?.status || 0);
  return !err?.response || status >= 500;
}

function AdminSection({ title, subtitle, icon: Icon, tone = "gray", defaultOpen = false, count = 0, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const tones = {
    gray: "border-gray-200 bg-white",
    amber: "border-amber-300 bg-amber-50",
    green: "border-green-200 bg-green-50",
    purple: "border-purple-200 bg-purple-50",
  };
  const badgeTones = {
    gray: "bg-gray-100 text-gray-700",
    amber: "bg-amber-200 text-amber-900",
    green: "bg-green-100 text-green-700",
    purple: "bg-purple-100 text-purple-700",
  };
  return (
    <section className={`rounded-xl border ${tones[tone]} overflow-hidden`}>
      <button type="button" onClick={() => setOpen(!open)}
        className="flex w-full min-h-12 items-center justify-between gap-3 px-4 py-3 text-left hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-inset">
        <span className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-gray-500" /> : null}
          <span className="min-w-0">
            <span className="block font-semibold text-gray-900">{title}</span>
            {subtitle ? <span className="block truncate text-xs text-gray-500">{subtitle}</span> : null}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {count > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}>{count}</span>}
          {open ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
        </span>
      </button>
      {open && <div className="border-t border-gray-200 p-3 sm:p-4 space-y-4">{children}</div>}
    </section>
  );
}

export default function TimeClockAdmin() {
  const { sessionToken } = useAuth();
  const [timeEntries, setTimeEntries] = useState([]);
  const [bulkCloseOpen, setBulkCloseOpen] = useState(false);
  const [bulkCloseTime, setBulkCloseTime] = useState("17:00");
  const [bulkCloseReason, setBulkCloseReason] = useState("");
  const [bulkCloseBusy, setBulkCloseBusy] = useState(false);
  const [bulkCloseResults, setBulkCloseResults] = useState(null);
  const [roundMin, setRoundMin] = useState(() => { try { return Number(localStorage.getItem("tc_round_min") || 0); } catch { return 0; } });
  const setRounding = (v) => { const n = Number(v) || 0; setRoundMin(n); try { localStorage.setItem("tc_round_min", String(n)); } catch {} };
  const roundH = (h) => { const m = Number(roundMin) || 0; return m > 0 ? Math.round((h * 60) / m) * m / 60 : h; };
  const [employeeStates, setEmployeeStates] = useState([]);
  const [activeBreaks, setActiveBreaks] = useState([]);
  const [activeWorkPauses, setActiveWorkPauses] = useState([]);
  const [activeLaborSegments, setActiveLaborSegments] = useState([]);
  const [correctionRequests, setCorrectionRequests] = useState([]);
  const [punchExceptions, setPunchExceptions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dataLoadError, setDataLoadError] = useState("");
  const [selectedUser, setSelectedUser] = useState("all");
  const [dateRange, setDateRange] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingEntry, setEditingEntry] = useState(null);
  const [editingEntryBaseline, setEditingEntryBaseline] = useState(null);
  const [editingClockInInput, setEditingClockInInput] = useState("");
  const [editingClockOutInput, setEditingClockOutInput] = useState("");
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionRequestId, setCorrectionRequestId] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveRequestId, setArchiveRequestId] = useState("");
  const [timeEntryError, setTimeEntryError] = useState("");
  const [approvalEntry, setApprovalEntry] = useState(null);
  const [approvalDecision, setApprovalDecision] = useState("approve");
  const [bulkApproveBusy, setBulkApproveBusy] = useState(false);
  const [bulkApproveResult, setBulkApproveResult] = useState("");
  const [retentionYears, setRetentionYears] = useState("2");
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [retentionMsg, setRetentionMsg] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalRequestId, setApprovalRequestId] = useState("");
  const [approvalRetryPayload, setApprovalRetryPayload] = useState(null);
  const [pendingApprovalRecovery, setPendingApprovalRecovery] = useState(null);
  const [approvalError, setApprovalError] = useState("");
  const [detailEntry, setDetailEntry] = useState(null);
  const [expandedEmail, setExpandedEmail] = useState(null);
  const [correctionReviewRequestId, setCorrectionReviewRequestId] = useState("");
  const [auditInvestigation, setAuditInvestigation] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setDataLoadError("");
    try {
      if (!sessionToken) throw new Error("A signed-in administrator session is required.");
      const loadAdminCollection = async (collection) => {
        const rows = [];
        let skip = 0;
        while (skip < 50000) {
          const response = await base44.functions.invoke("timeClockAction", {
            action: "admin_load_data",
            session_token: sessionToken,
            collection,
            skip,
          });
          const data = functionData(response);
          if (!data?.success || !Array.isArray(data.rows) || !Number.isInteger(data.next_skip) ||
              typeof data.has_more !== "boolean") {
            throw adminActionError(data, "Time Clock admin data could not be verified.");
          }
          rows.push(...data.rows);
          if (!data.has_more) return rows;
          if (data.next_skip !== skip + data.rows.length || data.rows.length === 0) {
            throw new Error("Time Clock admin data paging could not be verified.");
          }
          skip = data.next_skip;
        }
        throw new Error("Time Clock admin data exceeds the 50,000-record safety limit.");
      };
      const [entries, states, breaks, workPauses, laborSegments, corrections, punchExceptionRows, deviceRows] = await Promise.all([
        loadAdminCollection("entries"),
        loadAdminCollection("states"),
        loadAdminCollection("breaks"),
        loadAdminCollection("work_pauses"),
        loadAdminCollection("labor_segments"),
        loadAdminCollection("correction_requests"),
        loadAdminCollection("punch_exceptions"),
        loadAdminCollection("devices").catch(() => []),
      ]);
      setTimeEntries(entries);
      setEmployeeStates(states);
      setActiveBreaks(breaks);
      setActiveWorkPauses(workPauses);
      setActiveLaborSegments(laborSegments);
      setCorrectionRequests(corrections);
      setPunchExceptions(punchExceptionRows);
      setDevices(deviceRows || []);
      const recovery = entries.flatMap((entry) => ["approve", "reopen"].map((decision) => storedApprovalRetry(decision, entry.id))).find(Boolean) || null;
      setPendingApprovalRecovery(recovery);
    } catch (err) {
      console.error("Error loading data:", err);
      setDataLoadError("Time Clock data could not be loaded. Shift review is unavailable until the data reloads successfully.");
    }
    setIsLoading(false);
  };

  // Calculate date range
  const getDateRange = () => {
    if (dateRange === "custom" && customStartDate && customEndDate) {
      return {
        start: new Date(customStartDate + "T00:00:00"),
        end: new Date(customEndDate + "T23:59:59")
      };
    } else if (dateRange === "week") {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 })
      };
    } else if (dateRange === "today") {
      return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
    } else {
      return {
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate)
      };
    }
  };

  const { start, end } = getDateRange();

  // Filter entries
  const filteredEntries = timeEntries.filter(entry => {
    const entryDate = parseISO(entry.clock_in);
    
    // For custom range, only filter if both dates are set
    if (dateRange === "custom") {
      if (!customStartDate || !customEndDate) return true; // Show all if dates not set
    }
    
    if (!isWithinInterval(entryDate, { start, end })) return false;
    if (selectedUser !== "all" && entry.user_email !== selectedUser) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const searchable = [entry.user_name, entry.user_email, entry.notes].filter(Boolean).join(' ').toLowerCase();
      if (!searchable.includes(search)) return false;
    }
    return true;
  });

  // Calculate totals
  const totalHours = filteredEntries.reduce((sum, e) => sum + (e.total_hours || 0), 0);
  const completedEntries = filteredEntries.filter(entry => entry.status === "clocked_out" && entry.clock_out);
  const approvedEntries = completedEntries.filter(entry => (entry.approval_status || "unreviewed") === "approved");
  const needsReviewEntries = completedEntries.filter(entry => (entry.approval_status || "unreviewed") === "needs_review");
  const openPunchEntryIds = new Set(punchExceptions.filter(row => ["open", "pending_manager_review"].includes(row.status)).map(row => row.time_entry_id));
  const pendingCorrectionEntryIds = new Set(correctionRequests.filter(row => ["pending", "reviewing"].includes(row.status)).map(row => row.time_entry_id));
  const cleanReviewEntries = needsReviewEntries.filter(entry =>
    !entry.pay_period_id && !openPunchEntryIds.has(entry.id) && !pendingCorrectionEntryIds.has(entry.id));
  const unreviewedEntries = completedEntries.filter(entry => (entry.approval_status || "unreviewed") === "unreviewed");

  const isTransitionalState = (state) => ["clocking_in", "clocking_out"].includes(state.status)
    || ["starting_break", "ending_break"].includes(state.break_status)
    || ["pausing", "resuming"].includes(state.work_pause_status)
    || ["starting", "changing", "stopping"].includes(state.labor_status);
  const clockedInStates = employeeStates.filter(state => state.status === "clocked_in");
  const onBreakStates = clockedInStates.filter(state => state.break_status === "on_break");
  const workPausedStates = clockedInStates.filter(state => state.work_pause_status === "paused");
  const transitionalStates = employeeStates.filter(isTransitionalState);
  const workingStates = clockedInStates.filter(state => (state.break_status || "working") === "working" && (state.work_pause_status || "working") === "working" && !isTransitionalState(state));
  const activeEntryById = new Map(timeEntries.filter(entry => entry.status === "clocked_in").map(entry => [entry.id, entry]));
  const activeBreakById = new Map(activeBreaks.map(breakRow => [breakRow.id, breakRow]));
  const activeWorkPauseById = new Map(activeWorkPauses.map(pauseRow => [pauseRow.id, pauseRow]));
  const activeLaborByEntryId = new Map(activeLaborSegments.map(segment => [segment.time_entry_id, segment]));
  const referencedBreakIds = new Set(employeeStates.map(state => state.active_break_id).filter(Boolean));
  const referencedWorkPauseIds = new Set(employeeStates.map(state => state.active_work_pause_id).filter(Boolean));
  const orphanActiveBreaks = activeBreaks.filter(breakRow => !referencedBreakIds.has(breakRow.id));
  const orphanActiveWorkPauses = activeWorkPauses.filter(pauseRow => !referencedWorkPauseIds.has(pauseRow.id));
  const orphanActiveLaborSegments = activeLaborSegments.filter(segment => {
    const entry = activeEntryById.get(segment.time_entry_id);
    return !entry || entry.user_email !== segment.user_email;
  });

  const statusLabel = (state) => {
    if (state.work_pause_status === "paused") return "Work Paused";
    if (state.work_pause_status === "pausing") return "Pausing work";
    if (state.work_pause_status === "resuming") return "Resuming work";
    if (state.break_status === "on_break") return "On break";
    if (state.break_status === "starting_break") return "Starting break";
    if (state.break_status === "ending_break") return "Ending break";
    if (state.labor_status === "starting") return "Starting Current Work";
    if (state.labor_status === "changing") return "Changing Current Work";
    if (state.labor_status === "stopping") return "Stopping Current Work";
    if (state.status === "clocking_in") return "Clocking in";
    if (state.status === "clocking_out") return "Clocking out";
    return "Working";
  };

  const statusClass = (state) => {
    if (state.work_pause_status === "paused") return "bg-purple-100 text-purple-800 border-purple-200";
    if (state.break_status === "on_break") return "bg-amber-100 text-amber-800 border-amber-200";
    if (isTransitionalState(state)) return "bg-blue-100 text-blue-800 border-blue-200";
    return "bg-green-100 text-green-800 border-green-200";
  };

  const staleActiveEntries = timeEntries.filter(entry => {
    if (entry.status !== "clocked_in" || !entry.clock_in) return false;
    const clockIn = new Date(entry.clock_in);
    return Number.isFinite(clockIn.getTime()) && (Date.now() - clockIn.getTime()) > 24 * 60 * 60 * 1000;
  });

  // Employees holding two or more simultaneously open shifts — a data
  // integrity problem, since only one active entry should exist per person.
  const activeEntryCounts = timeEntries.reduce((acc, entry) => {
    if (entry.status === "clocked_in" && !entry.archived_admin && !entry.archived_test_data && entry.user_email) {
      acc[entry.user_email] = (acc[entry.user_email] || 0) + 1;
    }
    return acc;
  }, {});
  const duplicateActiveEmails = Object.keys(activeEntryCounts).filter(email => activeEntryCounts[email] > 1);
  const duplicateActiveEntries = timeEntries.filter(entry => entry.status === "clocked_in" && duplicateActiveEmails.includes(entry.user_email));
  const missingBreakEntries = completedEntries.filter(entry => (entry.total_hours || 0) >= 5 && !entry.lunch_minutes && !entry.pay_period_id);

  // Overtime pacing — total hours this calendar week per employee; flag
  // anyone at 36h+ (approaching 40) or already over.
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const otByEmail = {};
  for (const e of timeEntries) {
    if (!e.clock_in || new Date(e.clock_in) < weekStart || e.archived_admin || e.archived_test_data) continue;
    const k = e.user_email; if (!k) continue;
    const row = otByEmail[k] = otByEmail[k] || { name: e.user_name || k, hours: 0 };
    row.hours += e.total_hours || 0;
  }
  const otWatch = Object.values(otByEmail).filter(r => r.hours >= 36).sort((a, b) => b.hours - a.hours);
  // Projected week-end hours: current hours + (avg per worked weekday ×
  // remaining weekdays) — rough payroll forecast for the open week.
  const workday = (weekStart.getDay() + 6) % 7; // Mon=0
  const workedDays = {};
  for (const e of timeEntries) {
    if (!e.clock_in || new Date(e.clock_in) < weekStart || e.archived_admin || e.archived_test_data || !e.user_email) continue;
    const d = safeFormat(e.clock_in, "yyyy-MM-dd");
    const key = `${e.user_email}|${d}`;
    if (!workedDays[key]) workedDays[key] = true;
  }
  const otProjected = otWatch.map(r => {
    const email = Object.keys(otByEmail).find(k => otByEmail[k] === r);
    const daysWorked = Object.keys(workedDays).filter(k => k.startsWith(`${email}|`)).length || 1;
    const remaining = Math.max(0, 5 - workday - 1);
    const avg = r.hours / daysWorked;
    return { ...r, projected: r.hours + avg * remaining };
  });

  // Group by user for summary
  const userSummary = filteredEntries.reduce((acc, entry) => {
    const key = entry.user_email;
    if (!acc[key]) {
      acc[key] = { name: entry.user_name, email: key, hours: 0, entries: 0, daily: {} };
    }
    acc[key].hours += entry.total_hours || 0;
    acc[key].entries += 1;
    const dayKey = safeFormat(entry.clock_in, "yyyy-MM-dd");
    if (dayKey !== "-") acc[key].daily[dayKey] = (acc[key].daily[dayKey] || 0) + (entry.total_hours || 0);
    return acc;
  }, {});

  const navigateDate = (direction) => {
    if (dateRange === "week") {
      setCurrentDate(direction > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    } else if (dateRange === "today") {
      setCurrentDate(direction > 0 ? addDays(currentDate, 1) : subDays(currentDate, 1));
    } else {
      setCurrentDate(direction > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    }
  };

  const handleEditEntry = (entry) => {
    setTimeEntryError("");
    setCorrectionReason("");
    const recoveredRequestId = storedAdminRequestId("admin_correct_entry", entry?.id);
    const requestId = recoveredRequestId || newRequestId();
    if (!recoveredRequestId && entry?.id) persistAdminRequestId("admin_correct_entry", entry.id, requestId);
    setCorrectionRequestId(requestId);
    setEditingEntryBaseline(entry);
    setEditingEntry({ ...entry });
    setEditingClockInInput(companyDateTimeInputFromIso(entry?.clock_in));
    setEditingClockOutInput(companyDateTimeInputFromIso(entry?.clock_out));
    setShowEditDialog(true);
  };

  const handleSaveEntry = async () => {
    if (!editingEntryBaseline?.id || !editingEntry?.id || saveBusy) return;
    setTimeEntryError("");
    if (!sessionToken) {
      setTimeEntryError("Your administrator session is not available. Sign in again before correcting time.");
      return;
    }
    if (correctionReason.trim().length < 3) {
      setTimeEntryError("Enter a correction reason before saving.");
      return;
    }
    const parsedClockIn = parseCompanyDateTimeInput(editingClockInInput, editingEntryBaseline.clock_in);
    if (!parsedClockIn.ok) {
      setTimeEntryError(`Clock In: ${parsedClockIn.error}`);
      return;
    }
    let parsedClockOut = null;
    if (editingClockOutInput) {
      parsedClockOut = parseCompanyDateTimeInput(editingClockOutInput, editingEntryBaseline.clock_out);
      if (!parsedClockOut.ok) {
        setTimeEntryError(`Clock Out: ${parsedClockOut.error}`);
        return;
      }
    } else if (editingEntryBaseline.status === "clocked_out") {
      setTimeEntryError("A completed shift must keep a Clock Out. Use a reviewed correction instead of reopening it.");
      return;
    }
    const submittedLunchMinutes = Math.round(Number(editingEntry.lunch_minutes || 0));
    if (!Number.isFinite(submittedLunchMinutes) || submittedLunchMinutes < 0 || submittedLunchMinutes > 240) {
      setTimeEntryError("Lunch minutes must be between 0 and 240.");
      return;
    }
    if (parsedClockOut?.ok) {
      const preview = shiftDurationSummary(parsedClockIn.iso, parsedClockOut.iso, submittedLunchMinutes);
      if (!preview.valid) {
        setTimeEntryError(preview.error || "Corrected punch times are invalid.");
        return;
      }
    }
    const requestId = correctionRequestId || storedAdminRequestId("admin_correct_entry", editingEntryBaseline.id) || newRequestId();
    setSaveBusy(true);
    try {
      if (!correctionRequestId) {
        setCorrectionRequestId(requestId);
        persistAdminRequestId("admin_correct_entry", editingEntryBaseline.id, requestId);
      }
      const response = await base44.functions.invoke("timeClockAction", {
        action: "admin_correct_entry",
        session_token: sessionToken,
        target_email: editingEntryBaseline.user_email,
        request_id: requestId,
        entry_id: editingEntryBaseline.id,
        expected_updated_date: editingEntryBaseline.updated_date,
        reason: correctionReason.trim(),
        correction: {
          clock_in: parsedClockIn.iso,
          clock_out: parsedClockOut?.ok ? parsedClockOut.iso : null,
          lunch_minutes: submittedLunchMinutes,
          notes: editingEntry.notes || "",
          job_allocations: editingEntry.job_allocations || [],
        },
      });
      const data = functionData(response);
      if (!data?.success) throw adminActionError(data, "The correction was not confirmed by the server.");

      clearAdminRequestId("admin_correct_entry", editingEntryBaseline.id, requestId);
      setCorrectionRequestId("");
      setShowEditDialog(false);
      setEditingEntry(null);
      setEditingEntryBaseline(null);
      setEditingClockInInput("");
      setEditingClockOutInput("");
      setCorrectionReason("");
      await loadData();
    } catch (err) {
      console.error("Error saving entry:", err);
      const message = err?.response?.data?.error || err?.message || "This time entry changed in another session. The correction was not applied.";
      const retainRequest = shouldRetainAdminRequest(err);
      setTimeEntryError(message);
      if (!retainRequest && editingEntryBaseline?.id) {
        clearAdminRequestId("admin_correct_entry", editingEntryBaseline.id, requestId);
        setCorrectionRequestId("");
      }
      await loadData();
    } finally {
      setSaveBusy(false);
    }
  };

  const openApprovalDialog = (entry, decision) => {
    if (pendingApprovalRecovery &&
        (pendingApprovalRecovery.entry_id !== entry?.id || pendingApprovalRecovery.decision !== decision)) {
      setTimeEntryError("An interrupted manager shift review is still pending in this session. Resume that exact review before starting another approval or reopen action.");
      return;
    }
    const requestAction = approvalRequestStorageAction(decision);
    const recoveredPayload = storedApprovalRetry(decision, entry?.id);
    const recoveredRequestId = storedAdminRequestId(requestAction, entry?.id);
    if (recoveredPayload?.request_id && recoveredRequestId === recoveredPayload.request_id) {
      setApprovalEntry(recoveredPayload.entry_snapshot || entry);
      setApprovalDecision(decision);
      setApprovalNote(recoveredPayload.note || "");
      setApprovalError("This is an interrupted approval action. Retry uses the exact original shift version, decision, note, and request ID.");
      setApprovalRequestId(recoveredPayload.request_id);
      setApprovalRetryPayload(recoveredPayload);
      return;
    }
    if (recoveredRequestId && !recoveredPayload) {
      clearAdminRequestId(requestAction, entry?.id, recoveredRequestId);
      clearApprovalRetry(decision, entry?.id);
    }
    const requestId = newRequestId();
    if (entry?.id) persistAdminRequestId(requestAction, entry.id, requestId);
    setApprovalEntry(entry);
    setApprovalDecision(decision);
    setApprovalNote("");
    setApprovalError("");
    setApprovalRequestId(requestId);
    setApprovalRetryPayload(null);
  };

  const resumeApprovalRecovery = (payload) => {
    if (!payload?.entry_id || !payload?.request_id || !payload?.decision) return;
    setApprovalEntry(payload.entry_snapshot || timeEntries.find((entry) => entry.id === payload.entry_id) || {
      id: payload.entry_id,
      user_email: payload.target_email,
      updated_date: payload.expected_updated_date,
    });
    setApprovalDecision(payload.decision);
    setApprovalNote(payload.note || "");
    setApprovalRequestId(payload.request_id);
    setApprovalRetryPayload(payload);
    setApprovalError("Retrying the exact interrupted manager approval payload. Values are frozen until the server confirms or rejects this request.");
  };

  const approveAllClean = async () => {
    if (bulkApproveBusy || !sessionToken || !cleanReviewEntries.length) return;
    setBulkApproveBusy(true); setBulkApproveResult("");
    const failed = [];
    for (const entry of cleanReviewEntries) {
      try {
        const response = await base44.functions.invoke("timeClockAction", {
          action: "admin_set_entry_approval",
          session_token: sessionToken,
          target_email: entry.user_email,
          request_id: newRequestId(),
          entry_id: entry.id,
          expected_updated_date: entry.updated_date,
          decision: "approve",
          note: "Bulk approved — no exceptions on this shift.",
        });
        if (!functionData(response)?.success) failed.push(entry.user_name || entry.user_email);
      } catch {
        failed.push(entry.user_name || entry.user_email);
      }
    }
    setBulkApproveResult(failed.length ? `${cleanReviewEntries.length - failed.length} approved, ${failed.length} failed` : `${cleanReviewEntries.length} shifts approved`);
    setBulkApproveBusy(false);
    await loadData();
  };

  const archiveOldEntries = async () => {
    if (retentionBusy || !sessionToken) return;
    const years = Number(retentionYears) || 2;
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - years);
    const old = completedEntries.filter(e => e.clock_in && new Date(e.clock_in) < cutoff && !e.archived_admin && !e.archived_test_data);
    if (!old.length) { setRetentionMsg(`No completed entries older than ${years} years.`); return; }
    if (!window.confirm(`Archive ${old.length} completed entr${old.length === 1 ? "y" : "ies"} older than ${years} years? They will be hidden from the list but kept in history.`)) return;
    setRetentionBusy(true); setRetentionMsg("");
    const reason = `Retention archive — entries older than ${years} years`;
    let failed = 0;
    for (const entry of old) {
      try {
        const response = await base44.functions.invoke("timeClockAction", {
          action: "admin_archive_entry",
          session_token: sessionToken,
          target_email: entry.user_email,
          request_id: newRequestId(),
          entry_id: entry.id,
          expected_updated_date: entry.updated_date,
          reason,
        });
        if (!functionData(response)?.success) failed++;
      } catch { failed++; }
    }
    setRetentionMsg(failed ? `${old.length - failed} archived, ${failed} failed` : `${old.length} old entries archived`);
    setRetentionBusy(false);
    await loadData();
  };

  const handleApproval = async () => {
    if (!approvalEntry?.id || approvalBusy) return;
    if (!sessionToken) {
      setApprovalError("Your administrator session is not available. Sign in again before reviewing time.");
      return;
    }
    if (approvalDecision === "reopen" && approvalNote.trim().length < 3) {
      setApprovalError("Enter a reason before sending this shift back for review.");
      return;
    }
    setApprovalBusy(true);
    setApprovalError("");
    const requestAction = approvalRequestStorageAction(approvalDecision);
    const oppositeDecision = approvalDecision === "approve" ? "reopen" : "approve";
    const oppositeAction = approvalRequestStorageAction(oppositeDecision);
    const oppositeStoredRequestId = storedAdminRequestId(oppositeAction, approvalEntry.id);
    const oppositeRetryRequestId = storedApprovalRetry(oppositeDecision, approvalEntry.id)?.request_id || "";
    const requestId = approvalRequestId || storedAdminRequestId(requestAction, approvalEntry.id) || newRequestId();
    if (!approvalRequestId) {
      setApprovalRequestId(requestId);
      persistAdminRequestId(requestAction, approvalEntry.id, requestId);
    }
    const frozenPayload = approvalRetryPayload?.request_id === requestId ? approvalRetryPayload : {
      request_id: requestId,
      entry_id: approvalEntry.id,
      target_email: approvalEntry.user_email,
      expected_updated_date: approvalEntry.updated_date,
      decision: approvalDecision,
      note: approvalNote.trim(),
      entry_snapshot: {
        id: approvalEntry.id,
        user_email: approvalEntry.user_email,
        user_name: approvalEntry.user_name || "",
        clock_in: approvalEntry.clock_in || null,
        clock_out: approvalEntry.clock_out || null,
        total_hours: Number(approvalEntry.total_hours || 0),
        approval_status: approvalEntry.approval_status || "unreviewed",
        updated_date: approvalEntry.updated_date,
        pay_period_id: approvalEntry.pay_period_id || null,
      },
    };
    persistApprovalRetry(frozenPayload);
    setApprovalRetryPayload(frozenPayload);
    setPendingApprovalRecovery(frozenPayload);
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "admin_set_entry_approval",
        session_token: sessionToken,
        target_email: frozenPayload.target_email,
        request_id: frozenPayload.request_id,
        entry_id: frozenPayload.entry_id,
        expected_updated_date: frozenPayload.expected_updated_date,
        decision: frozenPayload.decision,
        note: frozenPayload.note,
      });
      const data = functionData(response);
      if (!data?.success) throw adminActionError(data, "The approval was not confirmed by the server.");
      clearAdminRequestId(requestAction, approvalEntry.id, frozenPayload.request_id);
      if (oppositeStoredRequestId) clearAdminRequestId(oppositeAction, approvalEntry.id, oppositeStoredRequestId);
      clearApprovalRetry(approvalDecision, approvalEntry.id, frozenPayload.request_id);
      if (oppositeRetryRequestId) clearApprovalRetry(oppositeDecision, approvalEntry.id, oppositeRetryRequestId);
      setApprovalEntry(null);
      setApprovalNote("");
      setApprovalRequestId("");
      setApprovalRetryPayload(null);
      setPendingApprovalRecovery(null);
      await loadData();
    } catch (err) {
      const data = err?.response?.data || {};
      const retainRequest = shouldRetainAdminRequest(err);
      setApprovalError(data?.error || err?.message || "The approval could not be completed safely.");
      if (!retainRequest) {
        const message = data?.error || err?.message || "The approval could not be completed safely.";
        clearAdminRequestId(requestAction, approvalEntry.id, frozenPayload.request_id);
        clearApprovalRetry(approvalDecision, approvalEntry.id, frozenPayload.request_id);
        setApprovalRetryPayload(null);
        setPendingApprovalRecovery(null);
        await loadData();
        setApprovalEntry(null);
        setApprovalNote("");
        setApprovalRequestId("");
        setTimeEntryError(message);
      } else {
        setPendingApprovalRecovery(frozenPayload);
      }
    } finally {
      setApprovalBusy(false);
    }
  };

  const togglePayrollHold = async (entry) => {
    if (!sessionToken || !entry?.id) return;
    const releasing = entry.payroll_hold === true;
    const reason = releasing ? "" : (window.prompt("Payroll hold reason", "Under review") || "").slice(0, 300);
    if (!releasing && !reason) return;
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "toggle_payroll_hold", session_token: sessionToken,
        request_id: newRequestId(), entry_id: entry.id,
        expected_updated_date: entry.updated_date,
        hold: !releasing, reason,
      });
      const data = functionData(response);
      if (data?.success !== true) throw new Error(data?.error || "Hold was not updated.");
      await loadData();
    } catch (err) {
      setTimeEntryError(err?.message || "Payroll hold could not be updated.");
    }
  };

  const openArchiveEntry = (entry) => {
    setTimeEntryError("");
    setArchiveReason("");
    const recoveredRequestId = storedAdminRequestId("admin_archive_entry", entry?.id);
    const requestId = recoveredRequestId || newRequestId();
    if (!recoveredRequestId && entry?.id) persistAdminRequestId("admin_archive_entry", entry.id, requestId);
    setArchiveRequestId(requestId);
    setDeleteConfirm(entry);
  };

  const handleArchiveEntry = async () => {
    const entry = deleteConfirm;
    if (!entry?.id || deleteBusy) return;
    setTimeEntryError("");
    if (!sessionToken) {
      setTimeEntryError("Your administrator session is not available. Sign in again before archiving time.");
      return;
    }
    if (archiveReason.trim().length < 3) {
      setTimeEntryError("Enter an archive reason before continuing.");
      return;
    }
    const requestId = archiveRequestId || storedAdminRequestId("admin_archive_entry", entry.id) || newRequestId();
    setDeleteBusy(true);
    try {
      if (!archiveRequestId) {
        setArchiveRequestId(requestId);
        persistAdminRequestId("admin_archive_entry", entry.id, requestId);
      }
      const response = await base44.functions.invoke("timeClockAction", {
        action: "admin_archive_entry",
        session_token: sessionToken,
        target_email: entry.user_email,
        request_id: requestId,
        entry_id: entry.id,
        expected_updated_date: entry.updated_date,
        reason: archiveReason.trim(),
      });
      const data = functionData(response);
      if (!data?.success) throw adminActionError(data, "The archive was not confirmed by the server.");
      clearAdminRequestId("admin_archive_entry", entry.id, requestId);
      setArchiveRequestId("");
      setDeleteConfirm(null);
      setArchiveReason("");
      await loadData();
    } catch (err) {
      console.error("Error archiving entry:", err);
      const message = err?.response?.data?.error || err?.message || "This time entry changed in another session and was not archived.";
      const retainRequest = shouldRetainAdminRequest(err);
      setTimeEntryError(message);
      if (!retainRequest) {
        clearAdminRequestId("admin_archive_entry", entry.id, requestId);
        setArchiveRequestId("");
        setDeleteConfirm(null);
        setArchiveReason("");
      }
      await loadData();
    } finally {
      setDeleteBusy(false);
    }
  };

  const exportToExcel = () => {
    const exportData = filteredEntries.map(entry => ({
      "Employee": entry.user_name,
      "Email": entry.user_email,
      "Date": safeFormat(entry.clock_in, "yyyy-MM-dd"),
      "Clock In": safeFormat(entry.clock_in, "h:mm a"),
      "Clock Out": entry.clock_out ? safeFormat(entry.clock_out, "h:mm a") : "Active",
      "Clock Source": entry.clock_source || "",
      "Lunch (min)": entry.lunch_minutes || 0,
      "Tracked Break (min)": entry.tracked_break_minutes || 0,
      "Paid Break (min)": entry.tracked_paid_break_minutes || 0,
      "Unpaid Break (min)": entry.tracked_unpaid_break_minutes || 0,
      "Work Pause (min)": entry.tracked_work_pause_minutes || 0,
      "Total Hours": Number(entry.total_hours ?? 0).toFixed(2),
      "Approval Status": entry.approval_status || "unreviewed",
      "Approved At": entry.approved_at ? safeFormat(entry.approved_at, "yyyy-MM-dd h:mm a") : "",
      "Approved By": entry.approved_by || "",
      "Approval Note": entry.approval_note || "",
      "Finalized Period": entry.pay_period_id ? "Yes" : "No",
      "Pay Period ID": entry.pay_period_id || "",
      "Locked At": entry.pay_period_locked_at ? safeFormat(entry.pay_period_locked_at, "yyyy-MM-dd h:mm a") : "",
      "Locked By": entry.pay_period_locked_by || "",
      "Notes": entry.notes || "",
      "Jobs": entry.job_allocations?.map(j => 
        j.is_inhouse ? `${j.inhouse_task}: ${j.hours || (j.minutes ? j.minutes / 60 : 0)}h` : `${j.client_name}: ${j.hours || (j.minutes ? j.minutes / 60 : 0)}h`
      ).join("; ") || ""
    }));

    // Per-employee summary sheet — totals at a glance before the detail rows.
    const byEmployee = new Map();
    for (const entry of filteredEntries) {
      const key = entry.user_email || "unknown";
      const row = byEmployee.get(key) || {
        "Employee": entry.user_name || key,
        "Email": key,
        "Shifts": 0,
        "Total Hours": 0,
        "Lunch (min)": 0,
        "Approved": 0,
        "Needs Review": 0,
        "Unreviewed": 0,
      };
      row["Shifts"] += 1;
      row["Total Hours"] += Number(entry.total_hours || 0);
      row["Lunch (min)"] += Number(entry.lunch_minutes || 0);
      const status = entry.approval_status || "unreviewed";
      if (status === "approved") row["Approved"] += 1;
      else if (status === "needs_review") row["Needs Review"] += 1;
      else row["Unreviewed"] += 1;
      byEmployee.set(key, row);
    }
    const summaryData = [...byEmployee.values()].map(r => ({ ...r, "Total Hours": r["Total Hours"].toFixed(2) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Summary");
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Time Entries");
    
    const fileName = `time_entries_${format(start, "yyyy-MM-dd")}_to_${format(end, "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Payroll-shaped CSV: one row per employee per worked day with a
  // 40h/week regular-vs-OT split, matching common payroll import formats.
  const exportPayrollCsv = async () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    // Prefer the backend export - it carries cost codes, union locals,
    // certified flags, and excludes payroll_hold entries authoritatively.
    try {
      const res = await base44.functions.invoke("timeClockAction", { action: "payroll_export", from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd"), session_token: sessionToken, scope: "admin", request_id: newRequestId() });
      const data = res?.data || res;
      if (data?.success === true && Array.isArray(data.rows)) {
        const rows = ["Employee,Email,Date,Regular Hours,OT Hours,Total Hours,Cost Code,Union Local,Certified,Jobs"];
        for (const r of data.rows) rows.push([r.user_name, r.user_email, r.date, r.regular_hours, r.overtime_hours, r.total_hours, r.cost_code, r.union_local, r.certified_payroll ? "Y" : "", r.jobs].map(esc).join(","));
        const url = URL.createObjectURL(new Blob([rows.join("\r\n")], { type: "text/csv" }));
        const a = document.createElement("a");
        a.href = url; a.download = `payroll_${format(start, "yyyy-MM-dd")}_to_${format(end, "yyyy-MM-dd")}.csv`; a.click();
        URL.revokeObjectURL(url);
        if (data.on_hold > 0) alert(`${data.on_hold} entries on payroll hold were excluded.`);
        return;
      }
    } catch {}
    const byEmp = new Map();
    for (const e of filteredEntries) {
      const k = e.user_email || "unknown";
      if (!byEmp.has(k)) byEmp.set(k, []);
      byEmp.get(k).push(e);
    }
    const rows = ["Employee,Email,Week Start,Date,Regular Hours,OT Hours,Total Hours"];
    for (const [email, entries] of byEmp) {
      entries.sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in));
      const weeklyUsed = {}; // weekStartKey -> hours used toward 40
      for (const e of entries) {
        const ci = new Date(e.clock_in);
        const ws = new Date(ci); ws.setDate(ws.getDate() - ws.getDay()); ws.setHours(0, 0, 0, 0);
        const wsKey = ws.toISOString().slice(0, 10);
        const used = weeklyUsed[wsKey] || 0;
        const hrs = Number(e.total_hours || 0);
        const reg = Math.min(hrs, Math.max(0, 40 - used));
        const ot = Math.max(0, hrs - reg);
        weeklyUsed[wsKey] = used + hrs;
        rows.push([e.user_name || email, email, wsKey, safeFormat(e.clock_in, "yyyy-MM-dd"), reg.toFixed(2), ot.toFixed(2), hrs.toFixed(2)].map(esc).join(","));
      }
    }
    const url = URL.createObjectURL(new Blob([rows.join("\r\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `payroll_${format(start, "yyyy-MM-dd")}_to_${format(end, "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Printable punch card for one employee across the filtered range - used
  // for disputes and payroll verification.
  const printPunchCard = (user) => {
    const rows = filteredEntries
      .filter((e) => e.user_email === user.email)
      .sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in))
      .map((e) => `<tr><td style="padding:8px;border-bottom:1px solid #ddd">${safeFormat(e.clock_in, "yyyy-MM-dd")}</td><td style="padding:8px;border-bottom:1px solid #ddd">${safeFormat(e.clock_in, "h:mm a")}</td><td style="padding:8px;border-bottom:1px solid #ddd">${e.clock_out ? safeFormat(e.clock_out, "h:mm a") : "Active"}</td><td style="padding:8px;border-bottom:1px solid #ddd;text-align:right">${Number(e.total_hours || 0).toFixed(2)}</td><td style="padding:8px;border-bottom:1px solid #ddd">${e.approval_status || "unreviewed"}</td></tr>`)
      .join("");
    const total = filteredEntries.filter((e) => e.user_email === user.email).reduce((s, e) => s + Number(e.total_hours || 0), 0);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Punch Card - ${user.name}</title></head><body style="padding:24px;font-family:sans-serif"><h2>Punch Card - ${user.name}</h2><p style="color:#666;font-size:12px">${format(start, "yyyy-MM-dd")} to ${format(end, "yyyy-MM-dd")} · generated ${new Date().toLocaleString()}</p><table style="border-collapse:collapse;width:100%;font-size:13px"><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #333">Date</th><th style="text-align:left;padding:8px;border-bottom:2px solid #333">In</th><th style="text-align:left;padding:8px;border-bottom:2px solid #333">Out</th><th style="text-align:right;padding:8px;border-bottom:2px solid #333">Hours</th><th style="text-align:left;padding:8px;border-bottom:2px solid #333">Status</th></tr>${rows}</table><p style="margin-top:12px;font-weight:bold">Total: ${total.toFixed(2)} hours</p><script>window.print()</script></body></html>`);
    w.document.close();
  };

  const jobSummary = filteredEntries.reduce((acc, entry) => {
    for (const j of entry.job_allocations || []) {
      const key = j.is_inhouse ? `In-house: ${j.inhouse_task || "task"}` : (j.client_name || "Unknown client");
      const hrs = Number(j.hours) || (Number(j.minutes) ? Number(j.minutes) / 60 : 0);
      acc[key] = (acc[key] || 0) + hrs;
    }
    return acc;
  }, {});
  const jobRows = Object.entries(jobSummary).sort((a, b) => b[1] - a[1]);

  // Punch-channel stats: how punches arrived (kiosk face, QR, manual, correction).
  const channelSummary = filteredEntries.reduce((acc, e) => {
    const key = e.clock_source || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const channelRows = Object.entries(channelSummary).sort((a, b) => b[1] - a[1]);
  const channelTotal = filteredEntries.length || 1;

  // Headcount by clock-in hour - coverage planning at a glance.
  const hourBuckets = new Array(12).fill(0); // 6am-5pm display range
  for (const e of filteredEntries) {
    if (!e.clock_in) continue;
    const h = new Date(e.clock_in).getHours();
    if (h >= 6 && h < 18) hourBuckets[h - 6] += 1;
  }
  const maxHour = Math.max(1, ...hourBuckets);

  // Early-clock-in pattern (before 7am) and late pattern (after 9am).
  const earlyClockIns = filteredEntries.filter((e) => e.clock_in && new Date(e.clock_in).getHours() < 7).length;
  const lateClockIns = filteredEntries.filter((e) => e.clock_in && new Date(e.clock_in).getHours() >= 9 && new Date(e.clock_in).getHours() < 12).length;

  // Per-employee late-arrival leaderboard (clock-ins at/after 9am).
  const lateByEmp = {};
  for (const e of filteredEntries) {
    if (!e.clock_in || new Date(e.clock_in).getHours() < 9 || new Date(e.clock_in).getHours() >= 12) continue;
    const k = e.user_name || e.user_email;
    lateByEmp[k] = (lateByEmp[k] || 0) + 1;
  }
  const lateLeaders = Object.entries(lateByEmp).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Absence leaderboard - fewest worked days in the filtered range.
  const daysByEmp = {};
  for (const e of filteredEntries) {
    if (!e.user_email || !e.clock_in) continue;
    const k = `${e.user_email}|${safeFormat(e.clock_in, "yyyy-MM-dd")}`;
    if (!daysByEmp[k]) daysByEmp[k] = e.user_name || e.user_email;
  }
  const workedDaysByEmp = {};
  for (const k of Object.keys(daysByEmp)) {
    const email = k.split("|")[0];
    if (!workedDaysByEmp[email]) workedDaysByEmp[email] = { name: daysByEmp[k], days: 0 };
    workedDaysByEmp[email].days += 1;
  }
  const fewestDays = Object.values(workedDaysByEmp).sort((a, b) => a.days - b.days).slice(0, 4);

  // Missing punch today - rostered employees with no entry today.
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const punchedToday = new Set(filteredEntries.filter((e) => e.clock_in && safeFormat(e.clock_in, "yyyy-MM-dd") === todayKey).map((e) => e.user_email));
  const missingPunch = uniqueUsers.filter((u) => !punchedToday.has(u.email));

  // Buddy-punch heuristic: same-day punch pairs under 90s apart by different
  // employees sharing a clock source. Not proof - a review flag.
  const punchPairs = [];
  const sorted = [...filteredEntries].filter((e) => e.clock_in).sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (a.user_email === b.user_email) continue;
    const gap = Math.abs(new Date(b.clock_in) - new Date(a.clock_in)) / 1000;
    if (gap <= 90 && (a.clock_source || "") === (b.clock_source || "") && a.clock_source) {
      punchPairs.push({ a, b, gap: Math.round(gap) });
    }
  }

  const uniqueUsers = [...new Set(timeEntries.map(e => e.user_email).filter(Boolean))].map(email => {
    const entry = timeEntries.find(e => e.user_email === email);
    return { email, name: entry?.user_name || email };
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (dataLoadError) {
    return (
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <h2 className="font-semibold">Time Clock data unavailable</h2>
            <p className="mt-1">{dataLoadError}</p>
          </div>
          <Button type="button" variant="outline" className="shrink-0 border-red-300 bg-white text-red-900" onClick={loadData}>
            Reload data
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {timeEntryError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">Time entry update blocked</div>
            <div className="mt-1 text-xs">{timeEntryError}</div>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0 border-red-300 bg-white text-red-800" onClick={async () => { await loadData(); setTimeEntryError(""); }}>Reload latest</Button>
        </div>
      )}

      {pendingApprovalRecovery && !approvalEntry && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="font-semibold">Interrupted manager shift review needs recovery</div>
            <div className="mt-1 text-xs">
              {pendingApprovalRecovery.decision === "approve" ? "Approve Shift" : "Mark Needs Review"} for {pendingApprovalRecovery.entry_snapshot?.user_name || pendingApprovalRecovery.target_email}. Resume the exact saved request before starting another review for this shift.
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0 border-amber-400 bg-white text-amber-900" onClick={() => resumeApprovalRecovery(pendingApprovalRecovery)}>
            Resume interrupted review
          </Button>
        </div>
      )}
      <div className="clay-card p-3 sm:p-4 space-y-4">
      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-gray-500" />
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {uniqueUsers.map(u => (
                <SelectItem key={u.email} value={u.email}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-gray-500" />
          <Select 
            value={dateRange} 
            onValueChange={(val) => {
              setDateRange(val);
              if (val === "custom") {
                // Set default custom dates to current month
                const now = new Date();
                const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                setCustomStartDate(format(firstDay, "yyyy-MM-dd"));
                setCustomEndDate(format(lastDay, "yyyy-MM-dd"));
              }
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {dateRange === "custom" ? (
          <div className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg border border-purple-200">
            <Label className="text-sm text-purple-700 font-medium">From:</Label>
            <Input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="w-40 h-9 bg-white"
            />
            <Label className="text-sm text-purple-700 font-medium">To:</Label>
            <Input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="w-40 h-9 bg-white"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigateDate(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-[200px] text-center">
              {dateRange === "week"
                ? `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`
                : dateRange === "today"
                  ? format(currentDate, "EEEE, MMM d, yyyy")
                  : format(currentDate, "MMMM yyyy")
              }
            </span>
            <Button variant="ghost" size="sm" onClick={() => navigateDate(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDateRange("week");
            setCurrentDate(new Date());
            setCustomStartDate("");
            setCustomEndDate("");
            setSelectedUser("all");
            setSearchTerm("");
          }}
          title="Reset all filters"
        >
          Reset
        </Button>

        <div className="flex items-center gap-1">
          <Select value={retentionYears} onValueChange={setRetentionYears}>
            <SelectTrigger className="h-9 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Older than 1y</SelectItem>
              <SelectItem value="2">Older than 2y</SelectItem>
              <SelectItem value="3">Older than 3y</SelectItem>
              <SelectItem value="5">Older than 5y</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" disabled={retentionBusy || !sessionToken}
            onClick={archiveOldEntries} className="h-9 text-xs"
            title="Archive completed entries older than the selected period">
            {retentionBusy ? "Archiving…" : "Archive old"}
          </Button>
        </div>
        <Button onClick={exportPayrollCsv} variant="outline" className="gap-2" title="CSV shaped for payroll import - per employee per day with reg/OT split">
          <Download className="w-4 h-4" />
          Payroll CSV
        </Button>
        <Button onClick={exportToExcel} className="gap-2">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="clay-card p-4">
          <p className="text-sm text-gray-500">Total Hours</p>
          <p className="text-2xl font-bold text-purple-600">{roundH(totalHours).toFixed(2)}</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] text-gray-400">round</span>
            <Select value={String(roundMin)} onValueChange={setRounding}>
              <SelectTrigger className="h-6 w-20 text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">exact</SelectItem>
                <SelectItem value="5">5 min</SelectItem>
                <SelectItem value="10">10 min</SelectItem>
                <SelectItem value="15">15 min</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="clay-card p-4">
          <p className="text-sm text-gray-500">Total Entries</p>
          <p className="text-2xl font-bold text-blue-600">{filteredEntries.length}</p>
        </div>
        <div className="clay-card p-4">
          <p className="text-sm text-gray-500">Active Users</p>
          <p className="text-2xl font-bold text-green-600">{Object.keys(userSummary).length}</p>
        </div>
        <div className="clay-card p-4">
          <p className="text-sm text-gray-500">Avg Hours/Entry</p>
          <p className="text-2xl font-bold text-orange-600">
            {filteredEntries.length > 0 ? (totalHours / filteredEntries.length).toFixed(2) : "0.00"}
          </p>
        </div>
      </div>

      {/* User Summary */}
      {Object.keys(userSummary).length > 1 && (
        <div className="clay-card p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />
            Hours by Employee
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.values(userSummary).map(user => (
              <div key={user.email} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm">{user.name}</p>
                  <button type="button" onClick={() => printPunchCard(user)}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-white hover:text-indigo-600"
                    title="Print punch card for this employee">Print</button>
                </div>
                <p className="text-lg font-bold text-purple-600">{user.hours.toFixed(2)} hrs</p>
                <p className="text-xs text-gray-500">{user.entries} entries</p>
                {(() => {
                  const points = Object.keys(user.daily).sort().map(d => user.daily[d]);
                  if (points.length < 2) return null;
                  const max = Math.max(...points, 0.01);
                  const w = 96, h = 24;
                  const coords = points.map((v, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 3)).toFixed(1)}`);
                  return (
                    <svg width={w} height={h} className="mt-1" aria-hidden="true">
                      <polyline points={coords.join(" ")} fill="none" stroke="#9333EA" strokeWidth="1.5" />
                    </svg>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      {jobRows.length > 0 && (
        <div className="clay-card p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Hours by Job
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {jobRows.slice(0, 12).map(([name, hrs]) => (
              <div key={name} className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-sm truncate" title={name}>{name}</p>
                <p className="text-lg font-bold text-indigo-600">{hrs.toFixed(2)} hrs</p>
              </div>
            ))}
          </div>
          {jobRows.length > 12 && <p className="mt-2 text-xs text-gray-400">Top 12 of {jobRows.length} jobs</p>}
        </div>
      )}

      {channelRows.length > 0 && (
        <div className="clay-card p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">Punch Channels</h3>
          <div className="flex flex-wrap gap-2">
            {channelRows.map(([channel, count]) => (
              <div key={channel} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="font-medium capitalize">{channel.replace(/_/g, " ")}</span>
                <span className="ml-2 text-slate-500">{count} ({Math.round((count / channelTotal) * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredEntries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="clay-card p-4">
            <h3 className="font-semibold mb-3">Clock-ins by Hour</h3>
            <div className="flex items-end gap-1 h-20">
              {hourBuckets.map((count, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full rounded-t bg-indigo-300" style={{ height: `${(count / maxHour) * 100}%`, minHeight: count ? 3 : 0 }} title={`${6 + i}:00 - ${count} clock-ins`} />
                  <span className="text-[8px] text-slate-400">{6 + i}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="clay-card p-4">
            <h3 className="font-semibold mb-3">Punch Timing</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span className="text-slate-600">Before 7 AM</span><span className="font-bold text-amber-600">{earlyClockIns}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-600">After 9 AM</span><span className="font-bold text-slate-700">{lateClockIns}</span></div>
            </div>
            {lateLeaders.length > 0 && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <p className="text-[10px] font-semibold text-slate-400 mb-1">Most after-9am starts</p>
                {lateLeaders.map(([name, n]) => (
                  <div key={name} className="flex items-center justify-between text-xs"><span className="truncate text-slate-600">{name}</span><span className="font-semibold text-slate-700">{n}</span></div>
                ))}
              </div>
            )}
            {fewestDays.length > 0 && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <p className="text-[10px] font-semibold text-slate-400 mb-1">Fewest days in range</p>
                {fewestDays.map((r) => (
                  <div key={r.name} className="flex items-center justify-between text-xs"><span className="truncate text-slate-600">{r.name}</span><span className="font-semibold text-slate-700">{r.days}d</span></div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] text-slate-400">Early-clock-in patterns drive unauthorized overtime; late patterns flag scheduling issues.</p>
          </div>
          <div className="clay-card p-4">
            <h3 className="font-semibold mb-3">No Punch Today</h3>
            {missingPunch.length === 0 ? (
              <p className="text-sm text-emerald-600">Everyone in the loaded range has punched today.</p>
            ) : (
              <div className="max-h-20 overflow-y-auto space-y-1">
                {missingPunch.slice(0, 8).map((u) => <p key={u.email} className="text-xs text-slate-600 truncate">{u.name}</p>)}
                {missingPunch.length > 8 && <p className="text-[10px] text-slate-400">+{missingPunch.length - 8} more</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {punchPairs.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="font-semibold text-amber-900 mb-2">Possible buddy punches - {punchPairs.length} near-simultaneous pair{punchPairs.length === 1 ? "" : "s"}</div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {punchPairs.slice(0, 10).map((p, i) => (
              <p key={i} className="text-xs text-amber-800">
                {(p.a.user_name || p.a.user_email)} &amp; {(p.b.user_name || p.b.user_email)} - {p.gap}s apart via {String(p.a.clock_source).replace(/_/g, " ")} on {safeFormat(p.a.clock_in, "MMM d")}
              </p>
            ))}
            {punchPairs.length > 10 && <p className="text-[10px] text-amber-700">+{punchPairs.length - 10} more</p>}
          </div>
        </div>
      )}

      {/* Time Entries Table */}
      <div className="clay-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Employee</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Clock In</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Clock Out</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Lunch</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Work Pause</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Total</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Approval</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Notes</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Jobs</th>
                <th className="px-4 py-3 text-center font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan="11" className="px-4 py-8 text-center text-gray-500">
                    No time entries found for this period
                  </td>
                </tr>
              ) : (
                filteredEntries.map(entry => (
                  <Fragment key={entry.id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button type="button"
                            onClick={() => setExpandedEmail(e => e === entry.user_email ? null : entry.user_email)}
                            className="font-medium text-left hover:text-purple-700 hover:underline"
                            title="Show this employee's daily breakdown">
                            {entry.user_name}
                          </button>
                          {entry.pay_period_id && (
                            <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300 gap-1">
                              <LockKeyhole className="w-3 h-3" /> Finalized
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{entry.user_email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">{safeFormat(entry.clock_in, "MMM d, yyyy")}</td>
                    <td className="px-4 py-3">{safeFormat(entry.clock_in, "h:mm a")}</td>
                    <td className="px-4 py-3">
                      {entry.clock_out ? (
                        safeFormat(entry.clock_out, "h:mm a")
                      ) : entry.status === "needs_resolution" ? (
                        <Badge className="bg-amber-100 text-amber-800">Missed punch review</Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-700">Active</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">{entry.lunch_minutes || 0} min</td>
                    <td className="px-4 py-3">
                      {Number(entry.tracked_work_pause_minutes || 0) > 0 ? (
                        <span className="font-medium text-purple-700">{entry.tracked_work_pause_minutes} min</span>
                      ) : (
                        <span className="text-gray-400">0 min</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-purple-600">
                      {roundH(Number(entry.total_hours ?? 0)).toFixed(2)} hrs
                      {roundMin > 0 && <span className="block text-[10px] text-gray-400" title={`Exact: ${Number(entry.total_hours ?? 0).toFixed(2)} hrs`}>rounded {roundMin}m</span>}
                    </td>
                    <td className="px-4 py-3">
                      {entry.status === "needs_resolution" ? (
                        <div className="flex flex-col items-start gap-1.5">
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">Needs Punch Review</Badge>
                          <span className="text-[11px] text-amber-700">Review the linked Missed Clock Out correction before approving this shift.</span>
                        </div>
                      ) : entry.status === "clocked_out" ? (
                        <div className="flex flex-col items-start gap-1.5">
                          <Badge
                            variant="outline"
                            className={
                              (entry.approval_status || "unreviewed") === "approved"
                                ? "bg-green-100 text-green-800 border-green-200"
                                : (entry.approval_status || "unreviewed") === "needs_review"
                                  ? "bg-amber-100 text-amber-800 border-amber-200"
                                  : "bg-gray-100 text-gray-700 border-gray-200"
                            }
                          >
                            {(entry.approval_status || "unreviewed") === "approved" ? "Approved" : (entry.approval_status || "unreviewed") === "needs_review" ? "Needs Review" : "Unreviewed"}
                          </Badge>
                          {entry.pay_period_id ? (
                            <span className="text-[11px] text-slate-500 flex items-center gap-1"><LockKeyhole className="w-3 h-3" />Locked by finalized period</span>
                          ) : (entry.approval_status || "unreviewed") === "approved" ? (
                            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => openApprovalDialog(entry, "reopen")}>
                              <RotateCcw className="w-3 h-3 mr-1" />Reopen
                            </Button>
                          ) : (
                            <Button type="button" variant="ghost" size="sm" className="min-h-10 px-3 text-xs text-green-700" onClick={() => openApprovalDialog(entry, "approve")}>
                              <CheckCircle2 className="w-3 h-3 mr-1" />Approve
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">After clock-out</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {entry.notes ? (
                        <span className="text-xs text-gray-600 line-clamp-2" title={entry.notes}>
                          {entry.notes}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {Array.isArray(entry.job_allocations) && entry.job_allocations.length > 0 ? (
                        <div className="space-y-1">
                          {entry.job_allocations.slice(0, 2).map((job, i) => (
                            <div key={i} className="flex items-center gap-1 text-xs">
                              {job.is_inhouse ? (
                                <Home className="w-3 h-3 text-amber-600" />
                              ) : (
                                <Briefcase className="w-3 h-3 text-purple-600" />
                              )}
                              <span className="truncate max-w-[100px]">
                                {job.is_inhouse ? job.inhouse_task : job.client_name}
                              </span>
                              <span className="text-gray-500">{Number(job.hours ?? (job.minutes ? job.minutes / 60 : 0)).toFixed(2)}h</span>
                            </div>
                          ))}
                          {entry.job_allocations.length > 2 && (
                            <span className="text-xs text-gray-400">+{entry.job_allocations.length - 2} more</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDetailEntry(entry)}
                          className="h-7 w-7"
                          title="View full shift details"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditEntry(entry)}
                          className="h-7 w-7"
                          disabled={Boolean(entry.pay_period_id)}
                          title={entry.pay_period_id ? "Reopen the finalized pay period before editing this shift" : "Edit time entry"}
                        >
                          {entry.pay_period_id ? <LockKeyhole className="w-3 h-3 text-slate-500" /> : <Pencil className="w-3 h-3" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openArchiveEntry(entry)}
                          className="h-7 w-7"
                          disabled={Boolean(entry.pay_period_id)}
                          title={entry.pay_period_id ? "Reopen the finalized pay period before archiving this shift" : "Archive time entry"}
                        >
                          <Archive className={`w-3 h-3 ${entry.pay_period_id ? "text-slate-400" : "text-amber-600"}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => togglePayrollHold(entry)}
                          className="h-7 w-7"
                          title={entry.payroll_hold ? `On payroll hold${entry.payroll_hold_reason ? `: ${entry.payroll_hold_reason}` : ""} - click to release` : "Flag for payroll hold"}
                        >
                          <Flag className={`w-3 h-3 ${entry.payroll_hold ? "text-red-600 fill-red-200" : "text-slate-400"}`} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {expandedEmail === entry.user_email && (
                    <tr className="bg-purple-50/60">
                      <td colSpan="11" className="px-6 py-3">
                        <p className="text-xs font-semibold text-purple-900 mb-2">Daily breakdown for {entry.user_name || entry.user_email} in this period</p>
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            const days = {};
                            for (const e of filteredEntries) {
                              if (e.user_email !== entry.user_email) continue;
                              const d = safeFormat(e.clock_in, "MMM d");
                              days[d] = (days[d] || 0) + (Number(e.total_hours) || 0);
                            }
                            return Object.entries(days).map(([d, h]) => (
                              <span key={d} className="rounded border border-purple-200 bg-white px-2 py-1 text-xs">
                                <span className="font-medium text-gray-700">{d}</span>
                                <span className="ml-1 text-purple-700 font-semibold">{h.toFixed(2)}h</span>
                              </span>
                            ));
                          })()}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {(() => {
        const weekAgo = Date.now() - 7 * 86400000;
        const twoWeeksAgo = Date.now() - 14 * 86400000;
        let cur = 0, prev = 0;
        for (const e of timeEntries || []) {
          const t = new Date(e.clock_in || 0).getTime();
          if (!t) continue;
          if (t >= weekAgo) cur += Number(e.total_hours || 0);
          else if (t >= twoWeeksAgo) prev += Number(e.total_hours || 0);
        }
        if (!cur && !prev) return null;
        const delta = prev ? Math.round(((cur - prev) / prev) * 100) : 0;
        return (
          <div className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-xs text-gray-600" aria-label="Week-over-week hours">
            This week: <b className="text-gray-900">{cur.toFixed(1)}h</b>
            <span className="mx-1.5 text-gray-300">|</span>
            Last week: <b>{prev.toFixed(1)}h</b>
            {prev > 0 && <span className={`ml-1.5 font-medium ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-gray-500"}`}>{delta > 0 ? "+" : ""}{delta}%</span>}
          </div>
        );
      })()}

      <AdminSection title="Needs Attention" icon={AlertTriangle} tone="amber" defaultOpen
        subtitle="Stale shifts, exceptions, reviews and requests that need a manager"
        count={staleActiveEntries.length + duplicateActiveEmails.length + missingBreakEntries.length + needsReviewEntries.length + unreviewedEntries.length + punchExceptions.filter((row) => ["open", "pending_manager_review", "rejected"].includes(row.status)).length}>
      {missingBreakEntries.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900">
                {missingBreakEntries.length} shift{missingBreakEntries.length === 1 ? "" : "s"} over 5 hours with no lunch recorded
              </div>
              <div className="mt-3 space-y-2">
                {missingBreakEntries.slice(0, 10).map(entry => (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 border border-amber-200 px-3 py-2">
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">{entry.user_name || entry.user_email}</span>
                      <span className="text-xs text-gray-600 ml-2">{safeFormat(entry.clock_in, "MMM d")} · {Number(entry.total_hours).toFixed(1)}h</span>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => setDetailEntry(entry)} className="bg-white/80">Review</Button>
                  </div>
                ))}
                {missingBreakEntries.length > 10 && <p className="text-xs text-amber-700">…and {missingBreakEntries.length - 10} more</p>}
              </div>
            </div>
          </div>
        </div>
      )}
      <Dialog open={bulkCloseOpen} onOpenChange={setBulkCloseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Close {staleActiveEntries.length} forgotten clock-out{staleActiveEntries.length === 1 ? "" : "s"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-gray-600">Each entry will be closed at the chosen time <strong>on the day it started</strong>. Entries whose clock-in is after that time are skipped.</p>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Close at</Label>
              <Input type="time" value={bulkCloseTime} onChange={(e) => setBulkCloseTime(e.target.value)} className="w-28" />
            </div>
            <div>
              <Label className="text-xs">Reason (required)</Label>
              <Textarea rows={2} value={bulkCloseReason} onChange={(e) => setBulkCloseReason(e.target.value)} placeholder="e.g. Employee forgot to clock out — closed by admin" className="mt-1" />
            </div>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-gray-600">
              {staleActiveEntries.map(e => <li key={e.id}>{e.user_name || e.user_email} — in {safeFormat(e.clock_in, "MMM d 'at' h:mm a")}</li>)}
            </ul>
            {bulkCloseResults && (
              <p className={`text-xs ${bulkCloseResults.failed.length ? "text-amber-700" : "text-emerald-700"}`}>
                Closed {bulkCloseResults.closed}, skipped {bulkCloseResults.skipped}
                {bulkCloseResults.failed.length ? `, failed ${bulkCloseResults.failed.length}: ${bulkCloseResults.failed.join("; ")}` : ""}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setBulkCloseOpen(false)}>Cancel</Button>
              <Button type="button" size="sm" disabled={bulkCloseBusy || !bulkCloseReason.trim() || !sessionToken || !staleActiveEntries.length}
                onClick={async () => {
                  setBulkCloseBusy(true);
                  const failed = []; let closed = 0, skipped = 0;
                  for (const entry of staleActiveEntries) {
                    const dayInput = `${companyDateTimeInputFromIso(entry.clock_in).slice(0, 10)}T${bulkCloseTime}`;
                    const parsed = parseCompanyDateTimeInput(dayInput, entry.clock_in);
                    if (!parsed?.ok || new Date(parsed.iso).getTime() <= new Date(entry.clock_in).getTime()) { skipped++; continue; }
                    try {
                      const rid = newRequestId();
                      const res = await base44.functions.invoke("timeClockAction", {
                        action: "admin_correct_entry", session_token: sessionToken,
                        target_email: entry.user_email, request_id: rid, entry_id: entry.id,
                        expected_updated_date: entry.updated_date, reason: bulkCloseReason.trim(),
                        correction: {
                          clock_in: entry.clock_in, clock_out: parsed.iso,
                          lunch_minutes: entry.lunch_minutes ?? 0, notes: entry.notes || "",
                          job_allocations: entry.job_allocations || [],
                        },
                      });
                      const data = functionData(res);
                      if (!data?.success) throw adminActionError(data, "not confirmed");
                      closed++;
                    } catch (err) { failed.push(`${entry.user_name || entry.user_email}: ${err?.message || err}`); }
                  }
                  setBulkCloseResults({ closed, skipped, failed });
                  setBulkCloseBusy(false);
                  await loadData();
                }}>
                {bulkCloseBusy ? "Closing…" : "Close entries"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {otWatch.length > 0 && (
        <div className="rounded-xl border border-orange-300 bg-orange-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-orange-900">Overtime watch — {otWatch.length} employee{otWatch.length === 1 ? "" : "s"} near or over 40h this week</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {otWatch.map(r => (
                  <span key={r.name} className={`rounded-full border px-2 py-1 text-xs font-medium ${r.hours >= 40 ? "border-red-400 bg-red-100 text-red-800" : "border-orange-300 bg-white text-orange-800"}`}>
                    {(() => {
                      const p = otProjected.find(x => x.name === r.name);
                      return `${r.name} · ${r.hours.toFixed(1)}h${p ? ` → ~${p.projected.toFixed(0)}h` : ""}`;
                    })()}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {duplicateActiveEmails.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-red-900">
                {duplicateActiveEmails.length} employee{duplicateActiveEmails.length === 1 ? "" : "s"} have overlapping open shifts
              </div>
              <p className="text-sm text-red-800 mt-1">
                Each employee should only ever have one active clock-in. Review and resolve the extra open entr{duplicateActiveEmails.length === 1 ? "y" : "ies"} below.
              </p>
              <div className="mt-3 space-y-2">
                {duplicateActiveEntries.map(entry => (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 border border-red-200 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{entry.user_name || entry.user_email}</div>
                      <div className="text-xs text-gray-600">
                        Clocked in {safeFormat(entry.clock_in, "MMM d, yyyy 'at' h:mm a")}
                      </div>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => setDetailEntry(entry)} className="bg-white/80">
                      Review Shift
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {staleActiveEntries.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900">
                {staleActiveEntries.length} forgotten clock-out{staleActiveEntries.length === 1 ? "" : "s"} need review
              </div>
              <p className="text-sm text-amber-800 mt-1">
                These entries have remained clocked in for more than 24 hours. Nothing was changed automatically.
              </p>
              <div className="mt-2">
                <Button size="sm" variant="outline" className="border-amber-400 text-amber-900"
                  onClick={() => { setBulkCloseResults(null); setBulkCloseOpen(true); }}>
                  Close all at a set time
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {staleActiveEntries.map(entry => (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 border border-amber-200 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{entry.user_name || entry.user_email}</div>
                      <div className="text-xs text-gray-600">
                        Clocked in {safeFormat(entry.clock_in, "MMM d, yyyy 'at' h:mm a")}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleEditEntry(entry)}>
                      Review Entry
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <CorrectionCoordinatorDiagnostics
        sessionToken={sessionToken}
        availableEntryIds={timeEntries.map((entry) => entry.id)}
        onViewShift={(entryId) => {
          const entry = timeEntries.find((item) => item.id === entryId);
          if (entry) setDetailEntry(entry);
        }}
        onInspectAudits={(entryId) => {
          if (!String(entryId || "").trim()) return;
          setAuditInvestigation({
            time_entry_id: entryId, evidence: [], mode: "integrity", nonce: Date.now(),
          });
          window.setTimeout(() => document.getElementById("time-clock-audit-trail")?.scrollIntoView({
            behavior: "smooth", block: "start",
          }), 0);
        }}
      />
      <TimeClockExceptionCenter
        timeEntries={timeEntries}
        employeeStates={employeeStates}
        activeBreaks={activeBreaks}
        activeWorkPauses={activeWorkPauses}
        activeLaborSegments={activeLaborSegments}
        correctionRequests={correctionRequests}
        punchExceptions={punchExceptions}
        onReviewEntry={handleEditEntry}
        onReviewCorrection={(request) => setCorrectionReviewRequestId(request?.id || "")}
        onApproveEntry={(entry) => openApprovalDialog(entry, "approve")}
        onRefresh={loadData}
      />
      <div className="clay-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              Shift Review
            </h3>
            <p className="text-xs text-gray-500 mt-1">Manager review status for completed shifts in the selected period. Approval does not finalize payroll.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-600">Unreviewed</p>
            <p className="text-2xl font-bold text-gray-800">{unreviewedEntries.length}</p>
          </div>
          <div className={`rounded-lg border p-3 ${needsReviewEntries.length ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
            <p className={needsReviewEntries.length ? "text-xs text-amber-700" : "text-xs text-gray-600"}>Needs Review</p>
            <p className={needsReviewEntries.length ? "text-2xl font-bold text-amber-800" : "text-2xl font-bold text-gray-800"}>{needsReviewEntries.length}</p>
            {cleanReviewEntries.length > 0 && (
              <Button type="button" size="sm" variant="outline" disabled={bulkApproveBusy || isLoading}
                onClick={approveAllClean} className="mt-2 min-h-10 w-full text-xs bg-white/80">
                {bulkApproveBusy ? "Approving…" : `Approve ${cleanReviewEntries.length} clean`}
              </Button>
            )}
            {bulkApproveResult && <p className="text-[11px] text-green-700 mt-1">{bulkApproveResult}</p>}
            {retentionMsg && <p className="text-[11px] text-gray-600 mt-1">{retentionMsg}</p>}
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-xs text-green-700">Approved</p>
            <p className="text-2xl font-bold text-green-800">{approvedEntries.length}</p>
          </div>
        </div>
      </div>
      <CorrectionRequestAdminPanel
        sessionToken={sessionToken}
        entries={timeEntries}
        onEntriesChanged={loadData}
        reviewRequestId={correctionReviewRequestId}
        onReviewRequestOpened={() => setCorrectionReviewRequestId("")}
      />
      <TimeOffApprovalPanel sessionToken={sessionToken} />
      <TimeClockPunchExceptionReport
        punchExceptions={punchExceptions}
        timeEntries={timeEntries}
        correctionRequests={correctionRequests}
        onReviewEntry={setDetailEntry}
        onReviewCorrection={(request) => setCorrectionReviewRequestId(request?.id || "")}
        onApproveEntry={(entry) => openApprovalDialog(entry, "approve")}
      />
      </AdminSection>

      <AdminSection title="Live Status" icon={Clock3} tone="green" defaultOpen
        subtitle="Who is working right now">
      <TimeClockManagementDashboard
        timeEntries={timeEntries}
        employeeStates={employeeStates}
        correctionRequests={correctionRequests}
        punchExceptions={punchExceptions}
        activeLaborSegments={activeLaborSegments}
      />
      <div className="clay-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Clock3 className="w-4 h-4 text-purple-600" />
              Live Employee Status
            </h3>
            <p className="text-xs text-gray-500 mt-1">Authoritative server state for employees currently working or transitioning.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={loadData}>Refresh</Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <div className="rounded-lg bg-green-50 border border-green-200 p-3">
            <p className="text-xs text-green-700">Clocked In</p>
            <p className="text-2xl font-bold text-green-800">{clockedInStates.length}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <p className="text-xs text-emerald-700">Working</p>
            <p className="text-2xl font-bold text-emerald-800">{workingStates.length}</p>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs text-amber-700">On Break</p>
            <p className="text-2xl font-bold text-amber-800">{onBreakStates.length}</p>
          </div>
          <div className="rounded-lg bg-purple-50 border border-purple-200 p-3">
            <p className="text-xs text-purple-700">Work Paused</p>
            <p className="text-2xl font-bold text-purple-800">{workPausedStates.length}</p>
          </div>
          <div className={`rounded-lg border p-3 ${transitionalStates.length ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
            <p className={`text-xs ${transitionalStates.length ? "text-blue-700" : "text-gray-500"}`}>In Transition</p>
            <p className={`text-2xl font-bold ${transitionalStates.length ? "text-blue-800" : "text-gray-700"}`}>{transitionalStates.length}</p>
          </div>
        </div>

        {clockedInStates.length === 0 && transitionalStates.length === 0 ? (
          <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No employees are currently clocked in.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[...clockedInStates, ...transitionalStates.filter(state => state.status !== "clocked_in")].map(state => {
              const entry = state.active_entry_id ? activeEntryById.get(state.active_entry_id) : null;
              const breakRow = state.active_break_id ? activeBreakById.get(state.active_break_id) : null;
              const workPauseRow = state.active_work_pause_id ? activeWorkPauseById.get(state.active_work_pause_id) : null;
              const laborRow = entry?.id ? activeLaborByEntryId.get(entry.id) : null;
              const clockIn = entry?.clock_in ? parseISO(entry.clock_in) : null;
              const breakStarted = breakRow?.started_at ? parseISO(breakRow.started_at) : null;
              const workPauseStarted = workPauseRow?.started_at ? parseISO(workPauseRow.started_at) : null;
              const validClockIn = clockIn && !Number.isNaN(clockIn.getTime());
              const validBreakStarted = breakStarted && !Number.isNaN(breakStarted.getTime());
              const validWorkPauseStarted = workPauseStarted && !Number.isNaN(workPauseStarted.getTime());
              return (
                <div key={state.id} className="rounded-lg border bg-white p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{state.user_name || state.user_email}</p>
                    <p className="text-xs text-gray-500 truncate">{state.user_email}</p>
                    {validClockIn && <p className="text-xs text-gray-500 mt-1">Clocked in {format(clockIn, "h:mm a")}</p>}
                    {state.break_status === "on_break" && breakRow && (
                      <p className="text-xs text-amber-700 mt-1">
                        {breakRow.is_paid ? "Paid break" : breakRow.break_type === "lunch" ? "Unpaid lunch" : "Unpaid break"}
                        {validBreakStarted ? ` since ${format(breakStarted, "h:mm a")}` : ""}
                      </p>
                    )}
                    {state.break_status === "on_break" && !breakRow && (
                      <p className="text-xs text-red-600 mt-1">Break state is missing its active break record -- review required.</p>
                    )}
                    {state.work_pause_status === "paused" && workPauseRow && (
                      <p className="text-xs text-purple-700 mt-1">
                        Work Paused{validWorkPauseStarted ? ` since ${format(workPauseStarted, "h:mm a")}` : ""}
                      </p>
                    )}
                    {state.work_pause_status === "paused" && !workPauseRow && (
                      <p className="text-xs text-red-600 mt-1">Work Pause state is missing its active pause record -- review required.</p>
                    )}
                    {laborRow && state.break_status === "working" && state.work_pause_status === "working" && (
                      <p className="text-xs text-blue-700 mt-1 capitalize">
                        Current Work: {String(laborRow.activity_type || "work").replaceAll("_", " ")}
                        {laborRow.work_order_id ? <>{" - "}<a href={`/MainWorkflow?wo=${laborRow.work_order_id}`} className="underline hover:text-blue-900" title="Open this work order">{laborRow.client_name || laborRow.work_order_title || "WorkOrder"}</a></> : ""}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className={`shrink-0 ${statusClass(state)}`}>
                    {state.work_pause_status === "paused" ? <Pause className="w-3 h-3 mr-1" /> : state.break_status === "on_break" ? <Coffee className="w-3 h-3 mr-1" /> : null}
                    {statusLabel(state)}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}

        {transitionalStates.length > 0 && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            A transition is still being finalized for {transitionalStates.length} employee{transitionalStates.length === 1 ? "" : "s"}. If it persists, reload before making an administrative correction.
          </div>
        )}
        {orphanActiveBreaks.length > 0 && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {orphanActiveBreaks.length} active break record{orphanActiveBreaks.length === 1 ? " is" : "s are"} not linked to authoritative employee state. Do not correct or close the affected shift until the mismatch is reviewed.
          </div>
        )}
        {orphanActiveWorkPauses.length > 0 && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {orphanActiveWorkPauses.length} active Work Pause record{orphanActiveWorkPauses.length === 1 ? " is" : "s are"} not linked to authoritative employee state. Resume/reconcile the affected pause before correcting or closing the shift.
          </div>
        )}
        {orphanActiveLaborSegments.length > 0 && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {orphanActiveLaborSegments.length} active labor segment{orphanActiveLaborSegments.length === 1 ? " is" : "s are"} not linked to a matching active TimeEntry. Review the affected shift before making administrative changes.
          </div>
        )}
      </div>
      </AdminSection>

      <AdminSection title="Pay Periods & History" icon={CalendarIcon} tone="purple"
        subtitle="Pay period finalization, audit trail and diagnostics">
      <PayPeriodManager
        sessionToken={sessionToken}
        timeEntries={timeEntries}
        correctionRequests={correctionRequests}
        onEntriesChanged={loadData}
        onInvestigateAudit={({ time_entry_id, evidence = [], mode = "conflict" }) => {
          const normalizedId = String(time_entry_id || "").trim();
          if (!normalizedId) return;
          setAuditInvestigation({
            time_entry_id: normalizedId,
            evidence: Array.isArray(evidence) ? evidence : [],
            mode: mode === "integrity" ? "integrity" : "conflict",
            nonce: Date.now(),
          });
          window.setTimeout(() => document.getElementById("time-clock-audit-trail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
        }}
      />
      <div id="time-clock-audit-trail" className="scroll-mt-4">
        <TimeClockAuditTrail
          investigation={auditInvestigation}
          onExitInvestigation={() => setAuditInvestigation(null)}
        />
      </div>
      </AdminSection>

      {(() => {
        const byJob = {};
        for (const e of entries || []) {
          const key = e.work_order_id ? (e.work_order_title || e.client_name || e.work_order_id) : null;
          if (!key) continue;
          byJob[key] = (byJob[key] || 0) + Number(e.total_hours || 0);
        }
        const jobs = Object.entries(byJob).map(([k, h]) => ({ name: k, hours: h })).sort((a, b) => b.hours - a.hours).slice(0, 10);
        return jobs.length ? (
          <AdminSection title="Hours by Job" icon={Clock3} count={jobs.length}>
            <ul className="space-y-1">
              {jobs.map((j) => (
                <li key={j.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-gray-700">{j.name}</span>
                  <span className="font-medium text-gray-900">{j.hours.toFixed(1)}h</span>
                </li>
              ))}
            </ul>
          </AdminSection>
        ) : null;
      })()}

      {(() => {
        const geoPunches = (timeEntries || []).filter((e) => e.clock_in_geo?.lat || e.clock_out_geo?.lat);
        if (!geoPunches.length) return null;
        const lats = geoPunches.map((e) => (e.clock_in_geo?.lat ?? e.clock_out_geo?.lat)).filter(Number.isFinite).sort((a, b) => a - b);
        const lngs = geoPunches.map((e) => (e.clock_in_geo?.lng ?? e.clock_out_geo?.lng)).filter(Number.isFinite).sort((a, b) => a - b);
        if (!lats.length) return null;
        const midLat = lats[Math.floor(lats.length / 2)], midLng = lngs[Math.floor(lngs.length / 2)];
        const dist = (a, b, c, d) => {
          const dx = (a - c) * 111320, dy = (b - d) * 111320 * Math.cos((c * Math.PI) / 180);
          return Math.sqrt(dx * dx + dy * dy);
        };
        const outliers = geoPunches.filter((e) => {
          const g = e.clock_in_geo?.lat ? e.clock_in_geo : e.clock_out_geo;
          return dist(g.lat, g.lng, midLat, midLng) > 500;
        });
        const noGeo = (timeEntries || []).length - geoPunches.length;
        return (
          <AdminSection title="Punch location review" icon={AlertTriangle} tone={outliers.length ? "amber" : "gray"} count={outliers.length}>
            <p className="text-xs text-gray-500">
              {geoPunches.length} punches carry location data{noGeo > 0 ? `; ${noGeo} have none` : ""}.
              {outliers.length ? ` ${outliers.length} punched >500m from the usual cluster:` : " All punches sit near the usual cluster."}
            </p>
            {outliers.length > 0 && (
              <ul className="mt-1 space-y-1">
                {outliers.slice(0, 10).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-700">{e.user_email || "—"} · {e.clock_in ? new Date(e.clock_in).toLocaleDateString() : ""}</span>
                    <span className="font-medium text-amber-700">{Math.round(dist((e.clock_in_geo?.lat ? e.clock_in_geo : e.clock_out_geo).lat, (e.clock_in_geo?.lat ? e.clock_in_geo : e.clock_out_geo).lng, midLat, midLng))}m off-cluster</span>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>
        );
      })()}

      <AdminSection title="Registered Devices" icon={Clock3} count={devices.length}
        subtitle="Kiosks and tablets that have signed in to the time clock.">
        {devices.length === 0 ? (
          <p className="text-xs text-gray-500">No devices have registered yet.</p>
        ) : (
          <div className="grid gap-1.5 md:grid-cols-2">
            {devices.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white/80 px-3 py-2 text-xs">
                <div>
                  <span className="font-medium text-gray-900">{d.device_name || d.device_key || "Device"}</span>
                  <span className="ml-2 text-gray-500">{d.device_type || ""}{d.location ? ` · ${d.location}` : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${d.status === "active" && d.is_active !== false ? "bg-green-100 text-green-700" : d.status === "offline" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-500"}`}>
                    {d.is_active === false ? "retired" : d.status || "unknown"}
                  </span>
                  <span className="text-gray-400">{d.last_seen_at ? `seen ${String(d.last_seen_at).slice(0, 10)}` : "never seen"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminSection>

      <TimeClockShiftDetail
        entry={detailEntry}
        open={Boolean(detailEntry)}
        onOpenChange={(open) => { if (!open) setDetailEntry(null); }}
      />

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { if (saveBusy) return; setShowEditDialog(open); if (!open) { setEditingEntry(null); setEditingEntryBaseline(null); setEditingClockInInput(""); setEditingClockOutInput(""); setCorrectionReason(""); } }}>
        <DialogContent className="clay-card border-none max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-purple-600" />
              Edit Time Entry
            </DialogTitle>
          </DialogHeader>
          
          {editingEntry && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Employee</Label>
                <p className="text-gray-700">{editingEntry.user_name}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Clock In -- {TIME_CLOCK_COMPANY_TIME_LABEL}</Label>
                  <Input
                    type="datetime-local"
                    value={editingClockInInput}
                    onChange={(e) => { setEditingClockInInput(e.target.value); setTimeEntryError(""); }}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Clock Out -- {TIME_CLOCK_COMPANY_TIME_LABEL}</Label>
                  <Input
                    type="datetime-local"
                    value={editingClockOutInput}
                    onChange={(e) => { setEditingClockOutInput(e.target.value); setTimeEntryError(""); }}
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Lunch Break (minutes)</Label>
                <Input
                  type="number"
                  min="0"
                  value={editingEntry.lunch_minutes || 0}
                  onChange={(e) => setEditingEntry({
                    ...editingEntry,
                    lunch_minutes: parseInt(e.target.value) || 0
                  })}
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Notes</Label>
                <Textarea
                  value={editingEntry.notes || ""}
                  onChange={(e) => setEditingEntry({
                    ...editingEntry,
                    notes: e.target.value
                  })}
                  placeholder="Admin notes..."
                  rows={3}
                />
              </div>

              {editingEntry.job_allocations?.length > 0 && (
                <div>
                  <Label className="text-sm font-medium">Job Allocations</Label>
                  <div className="space-y-2 mt-2">
                    {editingEntry.job_allocations.map((job, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                        {job.is_inhouse ? (
                          <Home className="w-4 h-4 text-amber-600" />
                        ) : (
                          <Briefcase className="w-4 h-4 text-purple-600" />
                        )}
                        <span className="flex-1 text-sm">
                          {job.is_inhouse ? job.inhouse_task : `${job.client_name} - ${job.work_order_title}`}
                        </span>
                        <Input
                          type="number"
                          min="0"
                          step="0.25"
                          value={job.hours}
                          onChange={(e) => {
                            const updated = [...editingEntry.job_allocations];
                            updated[i].hours = parseFloat(e.target.value) || 0;
                            setEditingEntry({ ...editingEntry, job_allocations: updated });
                          }}
                          className="w-20 h-8"
                        />
                        <span className="text-sm text-gray-500">hrs</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Corrections are permanent business-record changes. The original values, corrected values, administrator, server timestamp, and reason are retained in the Time Clock audit history.
              </div>

              <div>
                <Label className="text-sm font-medium">Correction Reason <span className="text-red-600">*</span></Label>
                <Textarea
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Example: Employee forgot to clock out; verified shift end with supervisor."
                  rows={3}
                  maxLength={500}
                  disabled={saveBusy}
                />
                <p className="mt-1 text-xs text-gray-500">Required. This reason is stored with the audit record.</p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  disabled={saveBusy}
                  onClick={() => { setShowEditDialog(false); setEditingEntry(null); setEditingEntryBaseline(null); setEditingClockInInput(""); setEditingClockOutInput(""); setCorrectionReason(""); }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveEntry} disabled={saveBusy || correctionReason.trim().length < 3} className="flex-1 gap-2">
                  {saveBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saveBusy ? "Saving..." : "Save Audited Correction"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!approvalEntry}
        onOpenChange={(open) => {
          if (approvalBusy) return;
          if (!open) {
            setApprovalEntry(null);
            setApprovalNote("");
            setApprovalRequestId("");
            setApprovalRetryPayload(null);
            setApprovalError("");
          }
        }}
      >
        <DialogContent className="clay-card border-none max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {approvalDecision === "approve" ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <RotateCcw className="w-5 h-5 text-amber-600" />}
              {approvalDecision === "approve" ? "Approve Completed Shift" : "Send Shift Back for Review"}
            </DialogTitle>
          </DialogHeader>
          {approvalEntry && (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p className="font-medium">{approvalEntry.user_name || approvalEntry.user_email}</p>
                <p className="text-gray-500 mt-1">
                  {approvalEntry.clock_in ? `${formatCompanyDateTime(approvalEntry.clock_in)} (${TIME_CLOCK_COMPANY_TIME_LABEL})` : "Unknown start"}
                  {approvalEntry.clock_out ? ` - ${formatCompanyDateTime(approvalEntry.clock_out)}` : ""}
                </p>
                <p className="text-gray-600 mt-1">{Number(approvalEntry.total_hours || 0).toFixed(2)} hours</p>
              </div>

              <div className={`rounded-lg border p-3 text-sm ${approvalDecision === "approve" ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                {approvalDecision === "approve"
                  ? "This records manager review of the completed shift. It does not finalize or lock a payroll period. Any later time correction automatically returns the shift to Needs Review."
                  : "This removes the current approval and marks the shift Needs Review. The prior approval remains preserved in the audit history."}
              </div>

              {approvalRetryPayload && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <strong>Exact retry mode.</strong> The original shift version, decision, note, and request ID are frozen. This prevents a reload or second manager change from silently changing an interrupted request.
                </div>
              )}

              <div>
                <Label className="text-sm font-medium">
                  Manager Note {approvalDecision === "reopen" && <span className="text-red-600">*</span>}
                </Label>
                <Textarea
                  value={approvalNote}
                  onChange={(e) => setApprovalNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder={approvalDecision === "approve" ? "Optional review note" : "Explain why this shift needs review again."}
                  disabled={approvalBusy || Boolean(approvalRetryPayload)}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {approvalDecision === "approve" ? "Optional. Approval identity and server timestamp are always audited." : "Required when reopening an approved shift."}
                </p>
              </div>

              {approvalError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{approvalError}</div>
              )}

              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={approvalBusy}
                  onClick={() => {
                    setApprovalEntry(null);
                    setApprovalNote("");
                    setApprovalRequestId("");
                    setApprovalRetryPayload(null);
                    setApprovalError("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleApproval}
                  disabled={approvalBusy || (approvalDecision === "reopen" && approvalNote.trim().length < 3)}
                  className={approvalDecision === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-amber-600 hover:bg-amber-700"}
                >
                  {approvalBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {approvalBusy ? "Saving..." : approvalDecision === "approve" ? "Approve Shift" : "Mark Needs Review"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open && !deleteBusy) { setDeleteConfirm(null); setArchiveReason(""); } }}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Time Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              Archive the {deleteConfirm?.user_name || deleteConfirm?.user_email || "employee"} time entry from {deleteConfirm?.clock_in ? safeFormat(deleteConfirm.clock_in, "MMM d, yyyy 'at' h:mm a") : "this shift"}? It will disappear from normal Time Clock reports and job labor, but the original record and audit trail will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm font-medium">Archive Reason <span className="text-red-600">*</span></Label>
            <Textarea
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="Explain why this record should be removed from normal timekeeping."
              rows={3}
              maxLength={500}
              disabled={deleteBusy}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={handleArchiveEntry}
              className="bg-amber-600 hover:bg-amber-700"
              disabled={deleteBusy || archiveReason.trim().length < 3}
            >
              {deleteBusy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Archiving...</> : "Archive Time Entry"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}