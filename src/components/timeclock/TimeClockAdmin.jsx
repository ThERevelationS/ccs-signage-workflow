import { useState, useEffect } from "react";
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
  Clock3
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isWithinInterval, parseISO, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import * as XLSX from "xlsx";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import CorrectionRequestAdminPanel from "@/components/timeclock/CorrectionRequestAdminPanel";

const TimeEntry = base44.entities.TimeEntry;
const TimeClockEmployeeState = base44.entities.TimeClockEmployeeState;
const TimeClockBreak = base44.entities.TimeClockBreak;

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-admin-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function functionData(response) {
  return response?.data || response;
}

export default function TimeClockAdmin() {
  const { sessionToken } = useAuth();
  const [timeEntries, setTimeEntries] = useState([]);
  const [employeeStates, setEmployeeStates] = useState([]);
  const [activeBreaks, setActiveBreaks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState("all");
  const [dateRange, setDateRange] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingEntry, setEditingEntry] = useState(null);
  const [editingEntryBaseline, setEditingEntryBaseline] = useState(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [timeEntryError, setTimeEntryError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [entries, states, breaks] = await Promise.all([
        loadAllEntityRows({
          entity: TimeEntry,
          query: { archived_test_data: { $ne: true }, archived_admin: { $ne: true } },
          sort: "-clock_in",
          label: "Time Clock admin entries",
        }),
        loadAllEntityRows({
          entity: TimeClockEmployeeState,
          sort: null,
          label: "Time Clock employee states",
        }),
        loadAllEntityRows({
          entity: TimeClockBreak,
          query: { status: "active" },
          sort: "-started_at",
          label: "Time Clock active breaks",
        }),
      ]);
      setTimeEntries(entries);
      setEmployeeStates(states);
      setActiveBreaks(breaks);
    } catch (err) {
      console.error("Error loading data:", err);
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

  const clockedInStates = employeeStates.filter(state => state.status === "clocked_in");
  const onBreakStates = clockedInStates.filter(state => state.break_status === "on_break");
  const workingStates = clockedInStates.filter(state => (state.break_status || "working") === "working");
  const transitionalStates = employeeStates.filter(state => ["clocking_in", "clocking_out"].includes(state.status) || ["starting_break", "ending_break"].includes(state.break_status));
  const activeEntryById = new Map(timeEntries.filter(entry => entry.status === "clocked_in").map(entry => [entry.id, entry]));
  const activeBreakById = new Map(activeBreaks.map(breakRow => [breakRow.id, breakRow]));
  const referencedBreakIds = new Set(employeeStates.map(state => state.active_break_id).filter(Boolean));
  const orphanActiveBreaks = activeBreaks.filter(breakRow => !referencedBreakIds.has(breakRow.id));

  const statusLabel = (state) => {
    if (state.break_status === "on_break") return "On break";
    if (state.break_status === "starting_break") return "Starting break";
    if (state.break_status === "ending_break") return "Ending break";
    if (state.status === "clocking_in") return "Clocking in";
    if (state.status === "clocking_out") return "Clocking out";
    return "Working";
  };

  const statusClass = (state) => {
    if (state.break_status === "on_break") return "bg-amber-100 text-amber-800 border-amber-200";
    if (["clocking_in", "clocking_out"].includes(state.status) || ["starting_break", "ending_break"].includes(state.break_status)) return "bg-blue-100 text-blue-800 border-blue-200";
    return "bg-green-100 text-green-800 border-green-200";
  };

  const staleActiveEntries = timeEntries.filter(entry => {
    if (entry.status !== "clocked_in" || !entry.clock_in) return false;
    const clockIn = new Date(entry.clock_in);
    return Number.isFinite(clockIn.getTime()) && (Date.now() - clockIn.getTime()) > 24 * 60 * 60 * 1000;
  });

  // Group by user for summary
  const userSummary = filteredEntries.reduce((acc, entry) => {
    const key = entry.user_email;
    if (!acc[key]) {
      acc[key] = { name: entry.user_name, email: key, hours: 0, entries: 0 };
    }
    acc[key].hours += entry.total_hours || 0;
    acc[key].entries += 1;
    return acc;
  }, {});

  const navigateDate = (direction) => {
    if (dateRange === "week") {
      setCurrentDate(direction > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    } else {
      setCurrentDate(direction > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    }
  };

  const handleEditEntry = (entry) => {
    setTimeEntryError("");
    setCorrectionReason("");
    setEditingEntryBaseline(entry);
    setEditingEntry({ ...entry });
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
    setSaveBusy(true);
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "admin_correct_entry",
        session_token: sessionToken,
        target_email: editingEntryBaseline.user_email,
        request_id: newRequestId(),
        entry_id: editingEntryBaseline.id,
        expected_updated_date: editingEntryBaseline.updated_date,
        reason: correctionReason.trim(),
        correction: {
          clock_in: editingEntry.clock_in,
          clock_out: editingEntry.clock_out,
          lunch_minutes: editingEntry.lunch_minutes || 0,
          notes: editingEntry.notes || "",
          job_allocations: editingEntry.job_allocations || [],
        },
      });
      const data = functionData(response);
      if (!data?.success) throw new Error(data?.error || "The correction was not confirmed by the server.");

      setShowEditDialog(false);
      setEditingEntry(null);
      setEditingEntryBaseline(null);
      setCorrectionReason("");
      await loadData();
    } catch (err) {
      console.error("Error saving entry:", err);
      setTimeEntryError(err?.response?.data?.error || err?.message || "This time entry changed in another session. The correction was not applied.");
      await loadData();
    } finally {
      setSaveBusy(false);
    }
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
    setDeleteBusy(true);
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "admin_archive_entry",
        session_token: sessionToken,
        target_email: entry.user_email,
        request_id: newRequestId(),
        entry_id: entry.id,
        expected_updated_date: entry.updated_date,
        reason: archiveReason.trim(),
      });
      const data = functionData(response);
      if (!data?.success) throw new Error(data?.error || "The archive was not confirmed by the server.");
      setDeleteConfirm(null);
      setArchiveReason("");
      await loadData();
    } catch (err) {
      console.error("Error archiving entry:", err);
      setTimeEntryError(err?.response?.data?.error || err?.message || "This time entry changed in another session and was not archived.");
      setDeleteConfirm(null);
      setArchiveReason("");
      await loadData();
    } finally {
      setDeleteBusy(false);
    }
  };

  const exportToExcel = () => {
    const exportData = filteredEntries.map(entry => ({
      "Employee": entry.user_name,
      "Email": entry.user_email,
      "Date": format(parseISO(entry.clock_in), "yyyy-MM-dd"),
      "Clock In": format(parseISO(entry.clock_in), "h:mm a"),
      "Clock Out": entry.clock_out ? format(parseISO(entry.clock_out), "h:mm a") : "Active",
      "Lunch (min)": entry.lunch_minutes || 0,
      "Total Hours": entry.total_hours?.toFixed(2) || "0.00",
      "Notes": entry.notes || "",
      "Jobs": entry.job_allocations?.map(j => 
        j.is_inhouse ? `${j.inhouse_task}: ${j.hours}h` : `${j.client_name}: ${j.hours}h`
      ).join("; ") || ""
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Time Entries");
    
    const fileName = `time_entries_${format(start, "yyyy-MM-dd")}_to_${format(end, "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const uniqueUsers = [...new Set(timeEntries.map(e => e.user_email))].map(email => {
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
              <div className="mt-3 space-y-2">
                {staleActiveEntries.map(entry => (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 border border-amber-200 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{entry.user_name || entry.user_email}</div>
                      <div className="text-xs text-gray-600">
                        Clocked in {format(parseISO(entry.clock_in), "MMM d, yyyy 'at' h:mm a")}
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
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
              const clockIn = entry?.clock_in ? parseISO(entry.clock_in) : null;
              const breakStarted = breakRow?.started_at ? parseISO(breakRow.started_at) : null;
              const validClockIn = clockIn && !Number.isNaN(clockIn.getTime());
              const validBreakStarted = breakStarted && !Number.isNaN(breakStarted.getTime());
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
                      <p className="text-xs text-red-600 mt-1">Break state is missing its active break record — review required.</p>
                    )}
                  </div>
                  <Badge variant="outline" className={`shrink-0 ${statusClass(state)}`}>
                    {state.break_status === "on_break" && <Coffee className="w-3 h-3 mr-1" />}
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
      </div>

      <CorrectionRequestAdminPanel sessionToken={sessionToken} onEntriesChanged={loadData} />

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

        <Button onClick={exportToExcel} className="gap-2">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="clay-card p-4">
          <p className="text-sm text-gray-500">Total Hours</p>
          <p className="text-2xl font-bold text-purple-600">{totalHours.toFixed(2)}</p>
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
                <p className="font-medium text-sm">{user.name}</p>
                <p className="text-lg font-bold text-purple-600">{user.hours.toFixed(2)} hrs</p>
                <p className="text-xs text-gray-500">{user.entries} entries</p>
              </div>
            ))}
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
                <th className="px-4 py-3 text-left font-medium text-gray-700">Total</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Notes</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Jobs</th>
                <th className="px-4 py-3 text-center font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-500">
                    No time entries found for this period
                  </td>
                </tr>
              ) : (
                filteredEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{entry.user_name}</p>
                        <p className="text-xs text-gray-500">{entry.user_email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">{format(parseISO(entry.clock_in), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3">{format(parseISO(entry.clock_in), "h:mm a")}</td>
                    <td className="px-4 py-3">
                      {entry.clock_out ? (
                        format(parseISO(entry.clock_out), "h:mm a")
                      ) : (
                        <Badge className="bg-green-100 text-green-700">Active</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">{entry.lunch_minutes || 0} min</td>
                    <td className="px-4 py-3 font-medium text-purple-600">
                      {entry.total_hours?.toFixed(2) || "-"} hrs
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
                      {entry.job_allocations?.length > 0 ? (
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
                              <span className="text-gray-500">{(job.hours || (job.minutes ? job.minutes / 60 : 0)).toFixed(2)}h</span>
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
                        <Button variant="ghost" size="icon" onClick={() => handleEditEntry(entry)} className="h-7 w-7">
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setArchiveReason(""); setDeleteConfirm(entry); }}
                          className="h-7 w-7"
                          title="Archive time entry"
                        >
                          <Archive className="w-3 h-3 text-amber-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { if (saveBusy) return; setShowEditDialog(open); if (!open) { setEditingEntry(null); setEditingEntryBaseline(null); setCorrectionReason(""); } }}>
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
                  <Label className="text-sm font-medium">Clock In</Label>
                  <Input
                    type="datetime-local"
                    value={editingEntry.clock_in ? format(parseISO(editingEntry.clock_in), "yyyy-MM-dd'T'HH:mm") : ""}
                    onChange={(e) => setEditingEntry({
                      ...editingEntry,
                      clock_in: new Date(e.target.value).toISOString()
                    })}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Clock Out</Label>
                  <Input
                    type="datetime-local"
                    value={editingEntry.clock_out ? format(parseISO(editingEntry.clock_out), "yyyy-MM-dd'T'HH:mm") : ""}
                    onChange={(e) => setEditingEntry({
                      ...editingEntry,
                      clock_out: e.target.value ? new Date(e.target.value).toISOString() : null
                    })}
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
                  onClick={() => { setShowEditDialog(false); setEditingEntry(null); setEditingEntryBaseline(null); setCorrectionReason(""); }}
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

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open && !deleteBusy) { setDeleteConfirm(null); setArchiveReason(""); } }}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Time Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              Archive the {deleteConfirm?.user_name || deleteConfirm?.user_email || "employee"} time entry from {deleteConfirm?.clock_in ? format(parseISO(deleteConfirm.clock_in), "MMM d, yyyy 'at' h:mm a") : "this shift"}? It will disappear from normal Time Clock reports and job labor, but the original record and audit trail will be preserved.
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