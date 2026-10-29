import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { NotificationTriggers } from "@/components/workflow/NotificationService";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { addDays, format, startOfDay } from "date-fns";
import { Loader2, Link as LinkIcon, Search, RefreshCw, CalendarClock, AlertTriangle, CheckCircle2, ChevronDown, StickyNote, ListTodo } from "lucide-react";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { usePolling } from "@/lib/usePolling";
import { fetchAllWorkOrders } from "@/lib/workOrderCache";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import { createWorkOrderWithRecovery, replaceWorkOrderFieldsIfUnchanged, softDeleteWorkOrderFromLoadedSnapshot, transitionWorkOrderFromLoadedSnapshot, mutateWorkOrderArrayField, mutateLocatedWorkOrderArrayItem } from "@/components/workflow/workOrderPersistence";
import { staffEntities } from "@/components/staff/staffEntities";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = staffEntities.AuthorizedEmail;

// Helper to parse date string as local date
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// The meeting week runs Monday-Sunday. Rows discussed or parked stay in the
// bottom section and return to the active list on the next Monday.
const getMeetingWeekStart = (now = new Date()) => {
  const today = startOfDay(now);
  const day = today.getDay();
  const daysSinceMonday = (day + 6) % 7;
  return new Date(today.getTime() - daysSinceMonday * 86400000);
};

const getMondayWeeksAhead = (weeks) => addDays(getMeetingWeekStart(), weeks * 7);

const WORK_NOTE_TYPES = ["other", "admin", "fabrication", "vinyl", "permitting", "design", "installation", "client"];

const CondensedDescription = ({ value, label = "Job description" }) => {
  const text = typeof value === "string" && value.trim() ? value.trim() : "-";
  const hasDescription = text !== "-";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={hasDescription ? 0 : -1}
            className="block w-full min-w-0 truncate rounded-sm text-sm text-gray-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
            aria-label={`${label}: ${text}`}
          >
            {text}
          </span>
        </TooltipTrigger>
        {hasDescription && (
          <TooltipContent
            side="top"
            align="start"
            sideOffset={6}
            className="max-w-[min(36rem,calc(100vw-2rem))] whitespace-normal break-words p-3 text-sm leading-relaxed"
          >
            {text}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
};

// Keep the clicked row pinned under the pointer while the focus gaps and
// cell growth animate around it: re-anchor the clicked element's center on
// screen every frame through the nearest vertical scroller.
const anchorFocusedRow = (el) => {
  if (!el?.isConnected) return;
  let scroller = el.parentElement;
  while (scroller && (!/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) || scroller.scrollHeight <= scroller.clientHeight)) {
    scroller = scroller.parentElement;
  }
  const target = scroller || document.scrollingElement;
  if (!target) return;
  const beforeRect = el.getBoundingClientRect();
  const beforeCenter = beforeRect.top + beforeRect.height / 2;
  const start = performance.now();
  const tick = () => {
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect();
    const drift = r.top + r.height / 2 - beforeCenter;
    if (Math.abs(drift) > 0.5) target.scrollTop += drift;
    if (performance.now() - start < 450) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(() => {
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect();
    const drift = r.top + r.height / 2 - beforeCenter;
    if (Math.abs(drift) > 0.5) target.scrollTop += drift;
  }, 500);
};

// Second line under a board row: the MMM-only task list (open items stay
// visible and vanish when completed) plus a quick meeting-note box that
// writes to the shared Work Order notes feed.
const MmmRowUpdates = React.memo(function MmmRowUpdates({ wo, users, isRegistered, saving, otherTaskCount, onToggleTask, onAddTask, onAddNote, onOpenDetails }) {
  const [taskText, setTaskText] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskDueOpen, setTaskDueOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("other");

  const openTasks = (wo.mmm_tasks || []).filter(t => t && !t.completed);
  const workNotes = wo.work_notes || [];
  const recentNotes = [...workNotes].slice(-3).reverse();
  const assignableUsers = users.filter(u => u.full_name);

  const submitTask = () => {
    const text = taskText.trim();
    if (!text || !isRegistered || saving) return;
    onAddTask(wo, { text, assigned_to: taskAssignee, due_date: taskDueDate });
    setTaskText("");
    setTaskAssignee("");
    setTaskDueDate("");
  };

  const submitNote = () => {
    const text = noteText.trim();
    if (!text || !isRegistered || saving) return;
    onAddNote(wo, { text, type: noteType });
    setNoteText("");
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1">
          <ListTodo className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
          Meeting tasks
          {otherTaskCount > 0 && (
            <button type="button" onClick={onOpenDetails} className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100">
              +{otherTaskCount} job task{otherTaskCount === 1 ? "" : "s"} in details
            </button>
          )}
        </div>
        {openTasks.length > 0 && (
          <ul className="space-y-1 mb-2">
            {openTasks.map(task => (
              <li key={task.id || task.text} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={false}
                  onCheckedChange={() => onToggleTask(wo, task)}
                  disabled={!isRegistered || saving}
                  className="h-4 w-4"
                  aria-label={`Complete meeting task: ${task.text}`}
                />
                <span className="truncate text-gray-800">{task.text}</span>
                {task.assigned_to && <span className="shrink-0 text-xs text-blue-700">→ {task.assigned_to}</span>}
                {task.due_date && (() => { const d = parseLocalDate(task.due_date); return d && !isNaN(d) ? <span className="shrink-0 text-xs text-gray-500">due {format(d, "M/d")}</span> : null; })()}
              </li>
            ))}
          </ul>
        )}
        {isRegistered && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitTask(); }}
              placeholder="Add a meeting task…"
              className="h-8 flex-1 min-w-[160px] bg-white text-sm"
              disabled={saving}
            />
            <Select value={taskAssignee} onValueChange={setTaskAssignee} disabled={saving}>
              <SelectTrigger className="h-8 w-[130px] text-xs bg-white"><SelectValue placeholder="Assignee" /></SelectTrigger>
              <SelectContent>
                {assignableUsers.map(u => <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Popover open={taskDueOpen} onOpenChange={setTaskDueOpen}>
              <PopoverTrigger asChild>
                <button type="button" className="h-8 rounded border border-gray-200 bg-white px-2 text-xs text-gray-600 hover:bg-gray-50" disabled={saving}>
                  {taskDueDate ? `Due ${format(parseLocalDate(taskDueDate), "M/d")}` : "Due date"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={parseLocalDate(taskDueDate)}
                  onSelect={(date) => { setTaskDueDate(date ? format(date, "yyyy-MM-dd") : ""); setTaskDueOpen(false); }}
                />
              </PopoverContent>
            </Popover>
            <Button type="button" size="sm" onClick={submitTask} disabled={!taskText.trim() || saving} className="h-8 bg-orange-600 hover:bg-orange-700">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
            </Button>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 lg:max-w-md">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1">
          <StickyNote className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
          Job updates / notes
        </div>
        {recentNotes.length > 0 && (
          <ul className="space-y-1 mb-2">
            {recentNotes.map(note => (
              <li key={note.id || `${note.timestamp}-${note.text}`} className="text-xs text-gray-600">
                <span className="font-medium text-gray-700">{note.created_by || "—"}</span>
                {note.type ? <span className="text-gray-400"> ({note.type})</span> : null}
                {note.timestamp ? <span className="text-gray-400"> · {format(new Date(note.timestamp), "M/d")}</span> : null}
                <span className="block truncate text-gray-700">{note.text}</span>
              </li>
            ))}
          </ul>
        )}
        {isRegistered && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitNote(); }}
              placeholder="Record a meeting update…"
              className="h-8 flex-1 min-w-[160px] bg-white text-sm"
              disabled={saving}
            />
            <Select value={noteType} onValueChange={setNoteType} disabled={saving}>
              <SelectTrigger className="h-8 w-[110px] text-xs bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WORK_NOTE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" onClick={submitNote} disabled={!noteText.trim() || saving} className="h-8">
              Add note
            </Button>
          </div>
        )}
      </div>
    </div>
  );
});

export default function MondayMorningMeeting() {
  const { currentUser, isRegistered } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [wipTaskDescriptions, setWipTaskDescriptions] = useState([]);
  const [taskDescriptions, setTaskDescriptions] = useState([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [focusedRowId, setFocusedRowId] = useState(null);
  const [quickEditError, setQuickEditError] = useState("");
  const [boardError, setBoardError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortMode, setSortMode] = useState("meeting");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savingQuickEditKeys, setSavingQuickEditKeys] = useState(() => new Set());
  const [discussedSavingIds, setDiscussedSavingIds] = useState(() => new Set());
  const [updatesSavingIds, setUpdatesSavingIds] = useState(() => new Set());
  const [manuallyExpandedIds, setManuallyExpandedIds] = useState(() => new Set());
  const [lastUpdated, setLastUpdated] = useState(null);
  const boardLoadSequenceRef = useRef(0);
  const boardHasLoadedRef = useRef(false);
  const boardLoadsInFlightRef = useRef(0);
  const boardSaveEpochRef = useRef(0);
  const boardSavesPendingRef = useRef(0);
  const boardRefreshDeferredRef = useRef(false);
  const quickEditsInFlightRef = useRef(new Map());
  const discussedInFlightRef = useRef(new Set());
  const updatesInFlightRef = useRef(new Set());
  const boardHeadingRef = useRef(null);

  // Set document title
  useEffect(() => {
    document.title = "Monday Morning Meeting - Workflow Manager";
  }, []);

  useEffect(() => {
    loadWorkOrders();
  }, []);

  // A timer tick must not compete with an in-flight load or local save.
  // Save/conflict recovery still invokes loadWorkOrders directly.
  usePolling(() => {
    if (boardSavesPendingRef.current === 0) void refreshBoardWhenIdle();
  }, 60000, { runOnMount: false });

  // Track every board write (field saves and task/note array saves) so a
  // slower background refresh cannot replace a newer optimistic edit.
  const runBoardSave = async (fn) => {
    boardSaveEpochRef.current += 1;
    boardSavesPendingRef.current += 1;
    try {
      return await fn();
    } finally {
      boardSavesPendingRef.current -= 1;
      boardSaveEpochRef.current += 1;
      if (boardSavesPendingRef.current === 0 && boardRefreshDeferredRef.current) {
        // A refresh dropped during a save must retry once all local writes
        // settle, including when one of those writes encountered a conflict.
        boardRefreshDeferredRef.current = false;
        void loadWorkOrders(false);
      }
    }
  };

  const saveBoardFields = (options) => runBoardSave(() => replaceWorkOrderFieldsIfUnchanged(options));

  // A Work Order can have independent board fields saving concurrently. A
  // slower full-record response must not revert a newer optimistic/saved field.
  const applySavedBoardFields = (orderId, saved, fields) => {
    setWorkOrders(prev => prev.map(wo => {
      if (wo.id !== orderId) return wo;
      const next = { ...wo };
      fields.forEach(field => { next[field] = saved[field]; });
      if (saved.updated_date && String(saved.updated_date) > String(wo.updated_date || "")) {
        next.updated_date = saved.updated_date;
      }
      return next;
    }));
  };

  const loadWorkOrders = async (showLoading = true, { clearQuickEditErrorOnSuccess = false } = {}) => {
    boardLoadsInFlightRef.current += 1;
    const loadSequence = ++boardLoadSequenceRef.current;
    const saveEpochAtStart = boardSaveEpochRef.current;
    const isCurrentBoardSnapshot = () => loadSequence === boardLoadSequenceRef.current &&
      saveEpochAtStart === boardSaveEpochRef.current && boardSavesPendingRef.current === 0;
    if (showLoading && !boardHasLoadedRef.current) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const [orders, usersData, taskDescSetting] = await Promise.all([
        fetchAllWorkOrders().then((rows) =>
          (rows || [])
            .filter((wo) => wo.is_rider !== true && wo.completed !== true && wo.deleted !== true)
            .sort((a, b) => (a.created_date || "").localeCompare(b.created_date || ""))),
        loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "Monday Morning Meeting authorized users" }),
        loadSingleGlobalSetting({
          entity: base44.entities.GlobalSettings,
          settingKey: "salesTaskDescriptions",
          label: "Monday Morning Meeting sales task descriptions",
        })
      ]);
      // Never display a snapshot captured during a local save or superseded
      // by a later save. If this is still the latest refresh, retry after
      // active saves settle rather than leaving a failed optimistic edit shown.
      if (!isCurrentBoardSnapshot()) {
        if (loadSequence === boardLoadSequenceRef.current &&
            (saveEpochAtStart !== boardSaveEpochRef.current || boardSavesPendingRef.current > 0)) {
          if (boardSavesPendingRef.current > 0) {
            boardRefreshDeferredRef.current = true;
          } else {
            void loadWorkOrders(false);
          }
        }
        return;
      }

      // Task descriptions flagged for this page OR flagged WIP bring a job
      // onto the board — WIP items remain listed after SIPs marks them
      // completed ("post-WIP"), matching the meeting's weekly walkthrough.
      const mmmTaskDescriptions = [];
      const wipDescs = [];
      const allTaskDescs = [];
      if (taskDescSetting?.setting_value?.items) {
        taskDescSetting.setting_value.items.forEach(item => {
          if (item?.text) allTaskDescs.push(item.text);
          if (item.page === "MondayMorningMeeting") {
            mmmTaskDescriptions.push(item.text);
          }
          if (item.wip) {
            wipDescs.push(item.text);
          }
        });
      }

      const mmmOrders = orders.filter(wo =>
        wo.current_task_assigned_to === "Monday Morning Meeting" ||
        (wo.current_task_description && mmmTaskDescriptions.includes(wo.current_task_description)) ||
        (wo.current_task_description && wipDescs.includes(wo.current_task_description))
      );
      boardHasLoadedRef.current = true;
      const sameData = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      // Functional updaters read the latest committed state at dispatch time,
      // so identical refreshes keep array identities (memos/focus survive)
      // even when the polling hook captured a first-render closure.
      setWorkOrders(prev => {
        const next = mmmOrders.sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));
        return sameData(next, prev) ? prev : next;
      });
      setUsers(prev => sameData(usersData, prev) ? prev : usersData);
      setWipTaskDescriptions(prev => sameData(wipDescs, prev) ? prev : wipDescs);
      setTaskDescriptions(prev => sameData(allTaskDescs, prev) ? prev : allTaskDescs);
      setLastUpdated(new Date());
      setBoardError("");
      if (clearQuickEditErrorOnSuccess) setQuickEditError("");
      // Callers reconciling a rejected write may use only this verified,
      // current snapshot, never a stale or failed board refresh.
      return mmmOrders;
    } catch (error) {
      if (isCurrentBoardSnapshot()) {
        console.error("Error loading work orders:", error);
        setBoardError(error?.message || "Monday Morning Meeting could not refresh. The last loaded board is still shown.");
      }
    } finally {
      boardLoadsInFlightRef.current -= 1;
      if (loadSequence === boardLoadSequenceRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  // Synchronous guard for timer and visible Refresh/Retry controls. These
  // may not start duplicate reads before React paints the disabled state.
  const refreshBoardWhenIdle = (options = {}) => {
    if (boardLoadsInFlightRef.current > 0) return;
    return loadWorkOrders(false, options);
  };

  // Mirror the synchronous per-field save lock in UI state so only the editor
  // being saved is disabled; other jobs and fields stay usable.
  const isQuickEditSaving = (orderId, field) => savingQuickEditKeys.has(JSON.stringify([orderId, field]));

  const updateWorkOrder = async (orderId, field, value) => {
    const currentWo = workOrders.find((wo) => wo.id === orderId);
    if (!currentWo) return;
    const editKey = JSON.stringify([orderId, field]);
    // A rapid second selection must not silently race the first save. Other
    // fields and other Work Orders remain independently editable.
    if (quickEditsInFlightRef.current.has(editKey)) {
      if (quickEditsInFlightRef.current.get(editKey) !== value) {
        setQuickEditError("This field is still saving. Wait for the current change to finish before choosing another value.");
      }
      return;
    }
    quickEditsInFlightRef.current.set(editKey, value);
    setSavingQuickEditKeys(prev => new Set(prev).add(editKey));
    const expectedValue = currentWo[field];
    setQuickEditError("");
    setWorkOrders(prev => prev.map(wo => wo.id === orderId ? { ...wo, [field]: value } : wo));
    try {
      const saved = await saveBoardFields({
        workOrderId: orderId,
        expectedFields: { [field]: expectedValue },
        nextFields: { [field]: value },
        label: `Monday Morning Meeting ${field}`,
      });
      applySavedBoardFields(orderId, saved, [field]);
    } catch (error) {
      console.error("Error updating Monday Morning Meeting Work Order field:", error);
      setQuickEditError(error?.message || "This Work Order field changed in another session. The latest value was reloaded.");
      await loadWorkOrders(false);
    } finally {
      quickEditsInFlightRef.current.delete(editKey);
      setSavingQuickEditKeys(prev => {
        const next = new Set(prev);
        next.delete(editKey);
        return next;
      });
    }
  };

  const wipTaskDescriptionSet = useMemo(() => new Set(wipTaskDescriptions), [wipTaskDescriptions]);

  const isWipItem = useCallback((wo) => {
    return wo.current_task_description && wipTaskDescriptionSet.has(wo.current_task_description);
  }, [wipTaskDescriptionSet]);

  const today = startOfDay(new Date());
  const todayMs = today.getTime();
  const meetingWeekStart = useMemo(() => getMeetingWeekStart(), []);
  const meetingWeekStartMs = meetingWeekStart.getTime();

  // "Discussed" is a weekly marker, not SIPS completion: rows return to the
  // active list next Monday. A future defer date also parks the row.
  const isDiscussedThisWeek = useCallback((wo) => {
    if (!wo.mmm_last_discussed_at) return false;
    const t = new Date(wo.mmm_last_discussed_at).getTime();
    return !Number.isNaN(t) && t >= meetingWeekStartMs;
  }, [meetingWeekStartMs]);

  const isDeferred = useCallback((wo) => {
    const d = parseLocalDate(wo.mmm_defer_until);
    return Boolean(d && !Number.isNaN(d.getTime()) && d.getTime() > todayMs);
  }, [todayMs]);

  const isParked = useCallback((wo) => isDiscussedThisWeek(wo) || isDeferred(wo), [isDiscussedThisWeek, isDeferred]);

  // Checking ✓ marks the job discussed this week; unchecking a parked row
  // clears both markers and returns it to the active list. The two fields are
  // always written together so a deferred row can never half-unpark.
  const toggleDiscussed = async (wo) => {
    if (discussedInFlightRef.current.has(wo.id)) return;
    const nextDiscussed = isParked(wo) ? "" : new Date().toISOString();
    const nextDefer = "";
    discussedInFlightRef.current.add(wo.id);
    setDiscussedSavingIds(prev => new Set(prev).add(wo.id));
    setQuickEditError("");
    setWorkOrders(prev => prev.map(w => w.id === wo.id
      ? { ...w, mmm_last_discussed_at: nextDiscussed, mmm_defer_until: nextDefer }
      : w));
    try {
      const saved = await saveBoardFields({
        workOrderId: wo.id,
        expectedFields: {
          mmm_last_discussed_at: wo.mmm_last_discussed_at ?? "",
          mmm_defer_until: wo.mmm_defer_until ?? "",
        },
        nextFields: {
          mmm_last_discussed_at: nextDiscussed,
          mmm_defer_until: nextDefer,
        },
        label: "Monday Morning Meeting discussed toggle",
      });
      applySavedBoardFields(wo.id, saved, ["mmm_last_discussed_at", "mmm_defer_until"]);
    } catch (error) {
      console.error("Error toggling Monday Morning Meeting discussed:", error);
      setQuickEditError(error?.message || "This Work Order changed in another session. The latest value was reloaded.");
      await loadWorkOrders(false);
    } finally {
      discussedInFlightRef.current.delete(wo.id);
      setDiscussedSavingIds(prev => {
        const next = new Set(prev);
        next.delete(wo.id);
        return next;
      });
    }
  };

  const deferUntilMonday = (wo, date) => {
    if (!date) return;
    updateWorkOrder(wo.id, "mmm_defer_until", format(date, "yyyy-MM-dd"));
    setOpenDatePopover(null);
  };

  const openMmmTasks = useCallback((wo) => (wo.mmm_tasks || []).filter(t => t && !t.completed), []);
  const otherJobTaskCount = useCallback((wo) => (wo.notes || []).filter(t => t && !t.completed).length, []);

  // MMM tasks are a dedicated per-job list: items added here stay visible
  // under the row until checked off; tasks created elsewhere stay in the
  // details dialog (surfaced as the "+N job tasks" indicator).
  const addMmmTask = async (wo, { text, assigned_to, due_date }) => {
    if (updatesInFlightRef.current.has(wo.id)) return;
    updatesInFlightRef.current.add(wo.id);
    setUpdatesSavingIds(prev => new Set(prev).add(wo.id));
    const newTask = {
      id: `mmm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text,
      assigned_to: assigned_to || "",
      due_date: due_date || "",
      completed: false,
      created_by: currentUser?.full_name || currentUser?.email || "Unknown",
      timestamp: new Date().toISOString(),
    };
    setQuickEditError("");
    try {
      const saved = await runBoardSave(() => mutateWorkOrderArrayField({
        workOrderId: wo.id,
        field: "mmm_tasks",
        label: "Monday Morning Meeting task",
        mutate: (currentItems) => currentItems.some(item => item?.id === newTask.id)
          ? currentItems
          : [...currentItems, newTask],
      }));
      setWorkOrders(prev => prev.map(w => w.id === wo.id ? { ...w, mmm_tasks: saved.mmm_tasks || [] } : w));
    } catch (error) {
      console.error("Error adding Monday Morning Meeting task:", error);
      setQuickEditError(error?.message || "The task could not be saved. The latest Work Order was reloaded.");
      await loadWorkOrders(false);
    } finally {
      updatesInFlightRef.current.delete(wo.id);
      setUpdatesSavingIds(prev => {
        const next = new Set(prev);
        next.delete(wo.id);
        return next;
      });
    }
  };

  const toggleMmmTask = async (wo, task) => {
    if (updatesInFlightRef.current.has(wo.id)) return;
    updatesInFlightRef.current.add(wo.id);
    setUpdatesSavingIds(prev => new Set(prev).add(wo.id));
    const targetCompleted = !task.completed;
    setQuickEditError("");
    // Optimistically flip the item so a completed task leaves the row at once.
    setWorkOrders(prev => prev.map(w => w.id === wo.id
      ? { ...w, mmm_tasks: (w.mmm_tasks || []).map(item => item === task ? { ...item, completed: targetCompleted } : item) }
      : w));
    try {
      const saved = await runBoardSave(() => mutateLocatedWorkOrderArrayItem({
        workOrderId: wo.id,
        field: "mmm_tasks",
        item: task,
        label: "Monday Morning Meeting task",
        mutateItem: (current) => ({ ...current, completed: targetCompleted }),
      }));
      setWorkOrders(prev => prev.map(w => w.id === wo.id ? { ...w, mmm_tasks: saved.mmm_tasks || [] } : w));
      if (targetCompleted && saved?.id) {
        void NotificationTriggers.mmmItemCompleted(saved, task?.text, currentUser?.email).catch(() => {});
      }
    } catch (error) {
      console.error("Error updating Monday Morning Meeting task:", error);
      setQuickEditError(error?.message || "The task could not be updated. The latest Work Order was reloaded.");
      await loadWorkOrders(false);
    } finally {
      updatesInFlightRef.current.delete(wo.id);
      setUpdatesSavingIds(prev => {
        const next = new Set(prev);
        next.delete(wo.id);
        return next;
      });
    }
  };

  // Meeting notes go to the shared work_notes feed so the same update is
  // visible on the Work Order everywhere else in the app.
  const addWorkNote = async (wo, { text, type }) => {
    if (updatesInFlightRef.current.has(wo.id)) return;
    updatesInFlightRef.current.add(wo.id);
    setUpdatesSavingIds(prev => new Set(prev).add(wo.id));
    const newNote = {
      id: Date.now(),
      type: type || "other",
      text,
      timestamp: new Date().toISOString(),
      created_by: currentUser?.full_name || currentUser?.email || "Unknown",
      sub_tasks: [],
    };
    setQuickEditError("");
    try {
      const saved = await runBoardSave(() => mutateWorkOrderArrayField({
        workOrderId: wo.id,
        field: "work_notes",
        label: "Monday Morning Meeting note",
        mutate: (currentNotes) => currentNotes.some(note => note?.id === newNote.id)
          ? currentNotes
          : [...currentNotes, newNote],
      }));
      setWorkOrders(prev => prev.map(w => w.id === wo.id ? { ...w, work_notes: saved.work_notes || [] } : w));
    } catch (error) {
      console.error("Error adding Monday Morning Meeting note:", error);
      setQuickEditError(error?.message || "The note could not be saved. The latest Work Order was reloaded.");
      await loadWorkOrders(false);
    } finally {
      updatesInFlightRef.current.delete(wo.id);
      setUpdatesSavingIds(prev => {
        const next = new Set(prev);
        next.delete(wo.id);
        return next;
      });
    }
  };

  const normalizedSearch = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);
  const matchesSearch = useCallback((wo) => {
    if (!normalizedSearch) return true;
    return [
      wo.client_name,
      wo.description,
      wo.current_task_description,
      wo.current_task_assigned_to,
      wo.designer,
      wo.project_manager,
      wo.estimator,
      wo.est_inv_at,
      wo.corbridge_invoice_number,
    ].some(value => String(value || "").toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch]);

  const getDeadlineStatus = useCallback((dateString) => {
    const deadline = parseLocalDate(dateString);
    if (!deadline || Number.isNaN(deadline.getTime())) return null;
    const diffDays = Math.ceil((deadline.getTime() - todayMs) / 86400000);
    if (diffDays < 0) return { bucket: "overdue", label: `${Math.abs(diffDays)}d overdue`, className: "bg-red-100 text-red-700 border-red-200" };
    if (diffDays === 0) return { bucket: "today", label: "Due today", className: "bg-red-100 text-red-700 border-red-200" };
    if (diffDays <= 7) return { bucket: "soon", label: `${diffDays}d left`, className: "bg-amber-100 text-amber-800 border-amber-200" };
    return { bucket: "future", label: null, className: "" };
  }, [todayMs]);

  const needsAttention = useCallback((wo) => {
    const deadlineStatus = getDeadlineStatus(wo.current_task_deadline);
    return Boolean(
      wo.asap ||
      deadlineStatus?.bucket === "overdue" ||
      ["at_risk", "delayed", "blocked"].includes(wo.project_health)
    );
  }, [getDeadlineStatus]);

  const matchesStatusFilter = useCallback((wo) => {
    if (statusFilter === "all") return true;
    const deadlineStatus = getDeadlineStatus(wo.current_task_deadline);
    if (statusFilter === "attention") return needsAttention(wo);
    if (statusFilter === "overdue") return deadlineStatus?.bucket === "overdue";
    if (statusFilter === "due_soon") return ["today", "soon"].includes(deadlineStatus?.bucket);
    return true;
  }, [statusFilter, getDeadlineStatus, needsAttention]);

  const sortOrders = useCallback((orders) => [...orders].sort((a, b) => {
    if (sortMode === "deadline") {
      if (!a.current_task_deadline && !b.current_task_deadline) return 0;
      if (!a.current_task_deadline) return 1;
      if (!b.current_task_deadline) return -1;
      return a.current_task_deadline.localeCompare(b.current_task_deadline);
    }
    if (sortMode === "customer") return (a.client_name || "").localeCompare(b.client_name || "");
    return 0;
  }), [sortMode]);

  const toDiscussOrders = useMemo(() => workOrders.filter(wo => !isParked(wo)), [workOrders, isParked]);
  const visibleToDiscuss = useMemo(() => sortOrders(toDiscussOrders.filter(wo => matchesSearch(wo) && matchesStatusFilter(wo))), [toDiscussOrders, matchesSearch, matchesStatusFilter, sortOrders]);
  const parkedOrders = useMemo(() => workOrders
    .filter(wo => isParked(wo) && matchesSearch(wo))
    .sort((a, b) => {
      const aDefer = a.mmm_defer_until || "";
      const bDefer = b.mmm_defer_until || "";
      if (aDefer !== bDefer) return aDefer.localeCompare(bDefer);
      return String(b.mmm_last_discussed_at || "").localeCompare(String(a.mmm_last_discussed_at || ""));
    }), [workOrders, isParked, matchesSearch]);

  const attentionCount = useMemo(() => toDiscussOrders.filter(needsAttention).length, [toDiscussOrders, needsAttention]);
  const overdueCount = useMemo(() => toDiscussOrders.filter(wo => getDeadlineStatus(wo.current_task_deadline)?.bucket === "overdue").length, [toDiscussOrders, getDeadlineStatus]);
  const dueSoonCount = useMemo(() => toDiscussOrders.filter(wo => ["today", "soon"].includes(getDeadlineStatus(wo.current_task_deadline)?.bucket)).length, [toDiscussOrders, getDeadlineStatus]);
  const activeValue = useMemo(() => toDiscussOrders.reduce((sum, wo) => sum + (Number(wo.estimate_amount) || 0), 0), [toDiscussOrders]);

  const taskAssignedUsers = useMemo(() => users.filter(u => u.sales_roles?.includes("Task Assigned")), [users]);
  const designerUsers = useMemo(() => users.filter(u => u.sales_roles?.includes("Designer")), [users]);
  const projectManagerUsers = useMemo(() => users.filter(u => u.sales_roles?.includes("Project Manager") || u.sales_roles?.includes("PM")), [users]);
  const estimatorUsers = useMemo(() => users.filter(u => u.sales_roles?.includes("Estimator")), [users]);
  const hasBoardViewFilters = Boolean(searchQuery || statusFilter !== "all" || sortMode !== "meeting");
  const resetBoardView = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setSortMode("meeting");
  };
  const jumpToParked = () => {
    if (parkedOrders.length === 0) return;
    if (searchQuery) setSearchQuery("");
    setTimeout(() => {
      document.getElementById("mmm-parked")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  // Radix restores focus to the original opener only while that element
  // stays mounted; a save can move the row between sections or filter it
  // out. Give keyboard users a stable landing spot per job instead.
  const restoreBoardFocus = (workOrderId) => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const button = Array.from(document.querySelectorAll("[data-mmm-focus-id]"))
      .find(node => node.dataset.mmmFocusId === workOrderId && node.getClientRects().length > 0);
    (button || boardHeadingRef.current)?.focus();
  };
  const closeDetailsDialog = (wo) => {
    const workOrderId = wo?.id;
    setSelectedWorkOrder(null);
    requestAnimationFrame(() => restoreBoardFocus(workOrderId));
  };

  const snoozeOptions = [
    { label: "Next Monday", date: getMondayWeeksAhead(1) },
    { label: "In 2 weeks", date: getMondayWeeksAhead(2) },
    { label: "In 3 weeks", date: getMondayWeeksAhead(3) },
  ];

  const COLUMN_COUNT = 17;

  if (isLoading) {
    return (
      <div className="h-full overflow-auto p-6">
        <div className="mb-6 space-y-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <ListSkeleton rows={8} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="w-full">
        {/* Header */}
        <div className="clay-card p-6 mb-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 ref={boardHeadingRef} tabIndex={-1} className="text-3xl font-bold text-gray-800 rounded-sm focus:outline-2 focus:outline-offset-2 focus:outline-blue-600">Monday Morning Meeting</h1>
                <Badge variant="outline" className="bg-white">{toDiscussOrders.length} to discuss</Badge>
              </div>
              <p className="text-gray-500 mt-1">
                Weekly Planning & Review — every WIP and post-WIP job
                {lastUpdated && <span className="ml-2 text-xs">• refreshed {format(lastUpdated, "h:mm a")}</span>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => refreshBoardWhenIdle()} disabled={isRefreshing} className="h-11 sm:h-8">
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />Refresh
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 mt-4">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              aria-pressed={statusFilter === "all"}
              className={`rounded-lg border bg-white/70 p-3 text-left hover:bg-white transition-colors ${statusFilter === "all" ? "ring-2 ring-gray-400 border-gray-300" : ""}`}
            >
              <div className="text-xs text-gray-500">To discuss</div>
              <div className="text-xl font-bold text-gray-800">{toDiscussOrders.length}</div>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("attention")}
              aria-pressed={statusFilter === "attention"}
              className={`rounded-lg border bg-orange-50/80 p-3 text-left hover:bg-orange-100 transition-colors ${statusFilter === "attention" ? "ring-2 ring-orange-400 border-orange-300" : ""}`}
            >
              <div className="text-xs text-orange-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Needs attention</div>
              <div className="text-xl font-bold text-orange-800">{attentionCount}</div>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("overdue")}
              aria-pressed={statusFilter === "overdue"}
              className={`rounded-lg border bg-red-50/80 p-3 text-left hover:bg-red-100 transition-colors ${statusFilter === "overdue" ? "ring-2 ring-red-400 border-red-300" : ""}`}
            >
              <div className="text-xs text-red-700">Overdue</div>
              <div className="text-xl font-bold text-red-800">{overdueCount}</div>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("due_soon")}
              aria-pressed={statusFilter === "due_soon"}
              className={`rounded-lg border bg-amber-50/80 p-3 text-left hover:bg-amber-100 transition-colors ${statusFilter === "due_soon" ? "ring-2 ring-amber-400 border-amber-300" : ""}`}
            >
              <div className="text-xs text-amber-700 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />Due within 7 days</div>
              <div className="text-xl font-bold text-amber-800">{dueSoonCount}</div>
            </button>
            <button
              type="button"
              onClick={jumpToParked}
              disabled={parkedOrders.length === 0}
              className="rounded-lg border bg-green-50/80 p-3 text-left hover:bg-green-100 transition-colors disabled:cursor-default disabled:opacity-60"
              title={parkedOrders.length > 0 ? "Jump to discussed & scheduled items" : "Nothing discussed or scheduled yet"}
            >
              <div className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Discussed & scheduled</div>
              <div className="text-xl font-bold text-green-800">{parkedOrders.length}</div>
            </button>
            <div className="rounded-lg border bg-blue-50/80 p-3">
              <div className="text-xs text-blue-700">Active value</div>
              <div className="text-lg font-bold text-blue-800">${activeValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[minmax(260px,1fr)_190px_180px_auto] gap-2 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search customer, job, task, employee, estimate or invoice…" className="h-11 min-w-0 pl-9 bg-white md:h-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 bg-white md:h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All to discuss</SelectItem>
                <SelectItem value="attention">Needs attention</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="due_soon">Due within 7 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortMode} onValueChange={setSortMode}>
              <SelectTrigger className="h-11 bg-white md:h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="meeting">Meeting order</SelectItem>
                <SelectItem value="deadline">Deadline</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
              </SelectContent>
            </Select>
            {hasBoardViewFilters && (
              <Button type="button" variant="ghost" size="sm" onClick={resetBoardView} className="h-11 md:h-9 text-gray-600">
                Reset view
              </Button>
            )}
          </div>
        </div>

        {boardError && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">Monday Morning Meeting could not refresh</div>
              <div className="mt-1 text-xs">{boardError}</div>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => refreshBoardWhenIdle()} disabled={isRefreshing} className="shrink-0 border-amber-300 bg-white text-amber-900">
              Retry
            </Button>
          </div>
        )}

        {quickEditError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">Monday Morning Meeting update blocked</div>
              <div className="mt-1 text-xs">{quickEditError}</div>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={async () => { setQuickEditError(""); await loadWorkOrders(false); }} className="shrink-0 border-red-300 bg-white text-red-800">
              Reload latest
            </Button>
          </div>
        )}

        {/* To Discuss table */}
        <div className="clay-card p-4 w-full overflow-x-auto">
          <table className="w-full border-collapse" style={{ fontSize: '14px', minWidth: '1560px', tableLayout: 'auto' }}>
            <thead className="bg-gray-100">
              <tr className="border-b">
                <th
                  className="px-2 py-3 border-r text-center font-bold text-white"
                  style={{
                    minWidth: '50px',
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    fontSize: '14px'
                  }}
                >
                  #
                </th>
                <th className="px-2 py-3 border-r text-center font-bold text-gray-700" style={{ minWidth: '70px' }} title="Mark this job as discussed this week">Discussed</th>
                <th className="px-2 py-3 border-r text-center font-bold text-gray-700" style={{ minWidth: '60px' }} title="Schedule this job to return on a future Monday">Snooze</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '150px' }}>Customer</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '170px' }}>Job</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '150px' }}>Task (next step)</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '95px' }}>Install</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '110px' }}>Deadline</th>
                <th className="px-2 py-3 border-r text-center font-bold text-gray-700" style={{ minWidth: '70px' }} title="Automatic flags: ASAP, overdue deadline, or at-risk health">Flags</th>
                <th className="px-2 py-3 border-r text-center font-bold text-gray-700" style={{ minWidth: '95px' }} title="Meeting tasks and job updates">Updates</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '125px' }}>Task Assigned</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '115px' }}>Designer</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '115px' }}>PM</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '115px' }}>Estimator</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '95px' }}>Est/Inv #</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '95px' }}>Amount</th>
                <th className="px-2 py-3 text-left font-bold text-gray-700" style={{ minWidth: '95px' }}>Survey</th>
              </tr>
            </thead>
            <tbody>
              {visibleToDiscuss.map((wo, index) => {
                const isWip = isWipItem(wo);
                const isPostWip = isWip && wo.sip_completed;
                const deadlineStatus = getDeadlineStatus(wo.current_task_deadline);
                const openTasks = openMmmTasks(wo);
                const otherTasks = otherJobTaskCount(wo);
                const isExpanded = manuallyExpandedIds.has(wo.id) || openTasks.length > 0;
                const updatesSaving = updatesSavingIds.has(wo.id);

                return (
                  <React.Fragment key={wo.id}>
                    {focusedRowId === wo.id && <tr className="mmm-focus-gap" aria-hidden="true"><td colSpan={COLUMN_COUNT}><div className="mmm-focus-gap-inner" /></td></tr>}
                    <tr
                      className={`mmm-board-row border-b ${focusedRowId !== wo.id ? 'hover:bg-gray-50' : ''} ${isWip && focusedRowId !== wo.id ? 'bg-blue-50/30' : ''} ${focusedRowId === wo.id ? 'mmm-focus-row' : ''}`}
                      style={{ height: '50px' }}
                    >
                      {/* Row Number - Clickable Focus Button */}
                      <td className="px-0 py-0 border-r">
                        <button
                          onClick={(e) => { anchorFocusedRow(e.currentTarget); setFocusedRowId(focusedRowId === wo.id ? null : wo.id); }}
                          className={`w-full h-full px-2 py-2 text-center font-bold transition-colors ${
                            focusedRowId === wo.id
                              ? 'mmm-focus-num text-white'
                              : 'text-white hover:opacity-80'
                          }`}
                          style={focusedRowId !== wo.id ? {
                            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                            color: 'white'
                          } : undefined}
                        >
                          {index + 1}
                        </button>
                      </td>

                      {/* Discussed this week */}
                      <td className="px-2 py-2 border-r text-center">
                        <Checkbox
                          checked={false}
                          onCheckedChange={() => toggleDiscussed(wo)}
                          disabled={!isRegistered || discussedSavingIds.has(wo.id)}
                          className="h-5 w-5"
                          aria-label={`Mark ${wo.client_name || "this job"} as discussed this week`}
                        />
                        {discussedSavingIds.has(wo.id) && <div className="text-[10px] text-orange-700 mt-0.5">Saving…</div>}
                      </td>

                      {/* Snooze to a future Monday */}
                      <td className="px-1 py-2 border-r text-center">
                        <Popover
                          open={openDatePopover === `defer-${wo.id}`}
                          onOpenChange={(open) => setOpenDatePopover(open ? `defer-${wo.id}` : null)}
                        >
                          <PopoverTrigger asChild disabled={!isRegistered || isQuickEditSaving(wo.id, "mmm_defer_until")}>
                            <button
                              type="button"
                              className="h-8 w-8 rounded text-orange-600 hover:bg-orange-50 flex items-center justify-center disabled:opacity-40"
                              title="Schedule to return on a future Monday"
                              aria-label={`Schedule ${wo.client_name || "this job"} to return on a future Monday`}
                            >
                              <CalendarClock className="w-4 h-4" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-3">
                            <div className="text-xs font-semibold text-gray-700 mb-2">Bring back on…</div>
                            <div className="grid grid-cols-1 gap-1.5 mb-2">
                              {snoozeOptions.map(option => (
                                <Button
                                  key={option.label}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deferUntilMonday(wo, option.date)}
                                  disabled={isQuickEditSaving(wo.id, "mmm_defer_until")}
                                  className="justify-start"
                                >
                                  {option.label} <span className="ml-auto text-gray-400">{format(option.date, "M/d")}</span>
                                </Button>
                              ))}
                            </div>
                            <div className="text-xs font-medium text-gray-600 mb-1">Or pick a Monday</div>
                            <Calendar
                              mode="single"
                              selected={parseLocalDate(wo.mmm_defer_until)}
                              disabled={(date) => date.getDay() !== 1 || date <= today}
                              onSelect={(date) => deferUntilMonday(wo, date)}
                            />
                          </PopoverContent>
                        </Popover>
                      </td>

                      {/* Customer */}
                      <td className="px-2 py-2 border-r">
                        <button
                          data-mmm-focus-id={wo.id}
                          onClick={() => setSelectedWorkOrder(wo)}
                          className="text-sm text-left hover:text-blue-600 flex items-center gap-1 font-medium w-full truncate"
                        >
                          <LinkIcon className="w-3 h-3 flex-shrink-0 text-blue-500" />
                          <span className="truncate">{wo.client_name || "Unnamed"}</span>
                          {isPostWip && <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0 bg-blue-50 text-blue-700 border-blue-200">Post-WIP</Badge>}
                        </button>
                      </td>

                      {/* Job Description */}
                      <td className="px-2 py-2 border-r min-w-0">
                        <CondensedDescription value={wo.description} />
                      </td>

                      {/* Task / next step */}
                      <td className="px-2 py-2 border-r">
                        <Select
                          value={wo.current_task_description || ""}
                          onValueChange={(val) => updateWorkOrder(wo.id, "current_task_description", val)}
                          disabled={!isRegistered || isQuickEditSaving(wo.id, "current_task_description")}
                        >
                          <SelectTrigger aria-busy={isQuickEditSaving(wo.id, "current_task_description")} className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
                            <SelectValue placeholder="-">{wo.current_task_description || "-"}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {wo.current_task_description && !taskDescriptions.includes(wo.current_task_description) && (
                              <SelectItem value={wo.current_task_description}>{wo.current_task_description} (current)</SelectItem>
                            )}
                            {taskDescriptions.map(text => (
                              <SelectItem key={text} value={text}>{text}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Install date */}
                      <td className="px-2 py-2 border-r">
                        <Popover
                          open={openDatePopover === `install-${wo.id}`}
                          onOpenChange={(open) => setOpenDatePopover(open ? `install-${wo.id}` : null)}
                        >
                          <PopoverTrigger asChild disabled={!isRegistered || isQuickEditSaving(wo.id, "project_install_date")}>
                            <button type="button" disabled={isQuickEditSaving(wo.id, "project_install_date")} className="h-8 w-full text-sm text-left px-1 hover:bg-gray-100 rounded font-medium disabled:opacity-60">
                              {wo.project_install_date ? (() => { const d = parseLocalDate(wo.project_install_date); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={parseLocalDate(wo.project_install_date)}
                              disabled={isQuickEditSaving(wo.id, "project_install_date")}
                              onSelect={(date) => {
                                updateWorkOrder(wo.id, "project_install_date", date ? format(date, "yyyy-MM-dd") : "");
                                setOpenDatePopover(null);
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                      </td>

                      {/* Deadline */}
                      <td className="px-2 py-2 border-r">
                        <Popover
                          open={openDatePopover === `deadline-${wo.id}`}
                          onOpenChange={(open) => setOpenDatePopover(open ? `deadline-${wo.id}` : null)}
                        >
                          <PopoverTrigger asChild disabled={!isRegistered || isQuickEditSaving(wo.id, "current_task_deadline")}>
                            <button type="button" disabled={isQuickEditSaving(wo.id, "current_task_deadline")} className="min-h-8 w-full text-sm text-left px-1 py-1 hover:bg-gray-100 rounded font-medium flex flex-col items-start justify-center gap-0.5 disabled:opacity-60">
                              <span>{wo.current_task_deadline ? (() => { const d = parseLocalDate(wo.current_task_deadline); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}</span>
                              {deadlineStatus?.label && <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${deadlineStatus.className}`}>{deadlineStatus.label}</Badge>}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={parseLocalDate(wo.current_task_deadline)}
                              disabled={isQuickEditSaving(wo.id, "current_task_deadline")}
                              onSelect={(date) => {
                                updateWorkOrder(wo.id, "current_task_deadline", date ? format(date, "yyyy-MM-dd") : "");
                                setOpenDatePopover(null);
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                      </td>

                      {/* Automatic attention flags */}
                      <td className="px-2 py-2 border-r text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          {wo.asap && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border-red-200">ASAP</Badge>}
                          {["at_risk", "delayed", "blocked"].includes(wo.project_health) && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-800 border-orange-200">
                              {wo.project_health === "at_risk" ? "At risk" : wo.project_health === "delayed" ? "Delayed" : "Blocked"}
                            </Badge>
                          )}
                          {deadlineStatus?.bucket === "overdue" && <AlertTriangle className="w-3.5 h-3.5 text-red-600" aria-label="Deadline overdue" />}
                        </div>
                      </td>

                      {/* Updates: tasks + notes expander */}
                      <td className="px-2 py-2 border-r text-center">
                        <button
                          type="button"
                          onClick={() => setManuallyExpandedIds(prev => {
                            const next = new Set(prev);
                            if (next.has(wo.id)) next.delete(wo.id); else next.add(wo.id);
                            return next;
                          })}
                          className="h-8 px-2 rounded text-xs font-medium text-gray-700 hover:bg-orange-50 border border-transparent hover:border-orange-200 flex items-center gap-1 mx-auto"
                          aria-expanded={isExpanded}
                          aria-label={`Show meeting tasks and notes for ${wo.client_name || "this job"}`}
                        >
                          <ListTodo className="w-3.5 h-3.5 text-orange-600" />
                          {openTasks.length > 0 ? openTasks.length : "+"}
                          {otherTasks > 0 && <span className="text-blue-600" title={`${otherTasks} other open job task(s) in details`}>+{otherTasks}</span>}
                          <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                      </td>

                      {/* Task Assigned */}
                      <td className="px-2 py-2 border-r">
                        <Select
                          value={wo.current_task_assigned_to || ""}
                          onValueChange={(val) => updateWorkOrder(wo.id, "current_task_assigned_to", val)}
                          disabled={!isRegistered || isQuickEditSaving(wo.id, "current_task_assigned_to")}
                        >
                          <SelectTrigger className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
                            <SelectValue placeholder="-">{wo.current_task_assigned_to || "-"}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Monday Morning Meeting">Monday Morning Meeting</SelectItem>
                            <SelectItem value="SIPs">SIPs</SelectItem>
                            {taskAssignedUsers.map(u => (
                              <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Designer */}
                      <td className="px-2 py-2 border-r">
                        <Select
                          value={wo.designer || ""}
                          onValueChange={(val) => updateWorkOrder(wo.id, "designer", val)}
                          disabled={!isRegistered || isQuickEditSaving(wo.id, "designer")}
                        >
                          <SelectTrigger className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
                            <SelectValue placeholder="-">{wo.designer || "-"}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {designerUsers.map(u => (
                              <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Project Manager */}
                      <td className="px-2 py-2 border-r">
                        <Select
                          value={wo.project_manager || ""}
                          onValueChange={(val) => updateWorkOrder(wo.id, "project_manager", val)}
                          disabled={!isRegistered || isQuickEditSaving(wo.id, "project_manager")}
                        >
                          <SelectTrigger className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
                            <SelectValue placeholder="-">{wo.project_manager || "-"}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {projectManagerUsers.map(u => (
                              <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Estimator */}
                      <td className="px-2 py-2 border-r">
                        <Select
                          value={wo.estimator || ""}
                          onValueChange={(val) => updateWorkOrder(wo.id, "estimator", val)}
                          disabled={!isRegistered || isQuickEditSaving(wo.id, "estimator")}
                        >
                          <SelectTrigger className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
                            <SelectValue placeholder="-">{wo.estimator || "-"}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {estimatorUsers.map(u => (
                              <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Est/Inv # Link */}
                      <td className="px-2 py-2 border-r">
                        {wo.corbridge_link ? (
                          <a
                            href={wo.corbridge_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline font-medium truncate block"
                          >
                            {wo.corbridge_invoice_number || wo.est_inv_at || "Link"}
                          </a>
                        ) : (
                          <span className="text-sm text-gray-700 font-medium truncate block">
                            {wo.est_inv_at || "-"}
                          </span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="px-2 py-2 border-r">
                        <span className="text-sm font-medium">
                          {wo.estimate_amount ? `$${wo.estimate_amount.toLocaleString()}` : "-"}
                        </span>
                      </td>

                      {/* Survey Date */}
                      <td className="px-2 py-2">
                        <Popover
                          open={openDatePopover === `survey-${wo.id}`}
                          onOpenChange={(open) => setOpenDatePopover(open ? `survey-${wo.id}` : null)}
                        >
                          <PopoverTrigger asChild disabled={!isRegistered || isQuickEditSaving(wo.id, "site_survey_date")}>
                            <button type="button" disabled={isQuickEditSaving(wo.id, "site_survey_date")} className="h-8 w-full text-sm text-left px-1 hover:bg-gray-100 rounded font-medium disabled:opacity-60">
                              {wo.site_survey_date ? (() => { const d = parseLocalDate(wo.site_survey_date); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={parseLocalDate(wo.site_survey_date)}
                              disabled={isQuickEditSaving(wo.id, "site_survey_date")}
                              onSelect={(date) => {
                                updateWorkOrder(wo.id, "site_survey_date", date ? format(date, "yyyy-MM-dd") : "");
                                setOpenDatePopover(null);
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b bg-orange-50/40">
                        <td colSpan={COLUMN_COUNT} className="px-6 py-3">
                          <MmmRowUpdates
                            wo={wo}
                            users={users}
                            isRegistered={isRegistered}
                            saving={updatesSaving}
                            otherTaskCount={otherTasks}
                            onToggleTask={toggleMmmTask}
                            onAddTask={addMmmTask}
                            onAddNote={addWorkNote}
                            onOpenDetails={() => setSelectedWorkOrder(wo)}
                          />
                        </td>
                      </tr>
                    )}
                    {focusedRowId === wo.id && <tr className="mmm-focus-gap" aria-hidden="true"><td colSpan={COLUMN_COUNT}><div className="mmm-focus-gap-inner" /></td></tr>}
                  </React.Fragment>
                );
              })}
              {visibleToDiscuss.length === 0 && (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="px-3 py-12 text-center text-gray-500 text-base">
                    <div>{hasBoardViewFilters ? "No jobs match the current search or filter." : parkedOrders.length > 0 ? "Everything on the board is discussed or scheduled — nothing left to cover." : "No jobs on the board yet. WIP and post-WIP jobs, jobs assigned to Monday Morning Meeting, and jobs with MMM task descriptions appear here automatically."}</div>
                    {hasBoardViewFilters && (
                      <Button type="button" variant="outline" size="sm" onClick={resetBoardView} className="mt-3">
                        Clear search & filters
                      </Button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Discussed & Scheduled section */}
        {parkedOrders.length > 0 && (
          <div id="mmm-parked" className="clay-card p-4 w-full mt-6 overflow-x-auto">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">Discussed &amp; Scheduled ({parkedOrders.length}) — returns to the list next Monday</h3>
            <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed', minWidth: '760px' }}>
              <thead className="bg-gray-50">
                <tr className="border-b">
                  <th className="px-2 py-2 border-r text-center font-medium text-gray-600" style={{ width: '60px' }}>Return</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-gray-600" style={{ width: '22%' }}>Customer</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-gray-600" style={{ width: '22%' }}>Task</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-gray-600" style={{ width: '130px' }}>Status</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-gray-600" style={{ width: '90px' }}>Deadline</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-gray-600" style={{ width: '15%' }}>Designer</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600" style={{ width: '90px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {parkedOrders.map((wo) => {
                  const deferred = isDeferred(wo);
                  const deferDate = deferred ? parseLocalDate(wo.mmm_defer_until) : null;
                  const discussedAt = isDiscussedThisWeek(wo) ? new Date(wo.mmm_last_discussed_at) : null;
                  return (
                    <tr key={wo.id} className={`border-b hover:bg-gray-50 ${deferred ? "bg-purple-50/30" : "bg-green-50/30"}`}>
                      <td className="px-2 py-2 border-r text-center" title="Send back to To Discuss">
                        <Checkbox
                          checked={true}
                          onCheckedChange={() => toggleDiscussed(wo)}
                          disabled={!isRegistered || discussedSavingIds.has(wo.id)}
                          className="h-4 w-4"
                          aria-label={`Return ${wo.client_name || "this job"} to the To Discuss list`}
                        />
                      </td>
                      <td className="px-2 py-2 border-r" style={{ maxWidth: '150px' }}>
                        <button
                          data-mmm-focus-id={wo.id}
                          onClick={() => setSelectedWorkOrder(wo)}
                          className="text-xs text-left hover:text-blue-600 flex items-center gap-1 font-medium w-full"
                        >
                          <LinkIcon className="w-3 h-3 flex-shrink-0 text-blue-500" />
                          <span className="truncate block">{wo.client_name || "Unnamed"}</span>
                        </button>
                      </td>
                      <td className="px-2 py-2 border-r text-xs" style={{ maxWidth: '150px' }}><span className="truncate block">{wo.current_task_description || "-"}</span></td>
                      <td className="px-2 py-2 border-r text-xs">
                        {deferred && deferDate ? (
                          <span className="inline-flex items-center gap-1 text-purple-700 font-medium"><CalendarClock className="w-3 h-3" />returns {format(deferDate, "M/d")}</span>
                        ) : discussedAt && !Number.isNaN(discussedAt.getTime()) ? (
                          <span className="inline-flex items-center gap-1 text-green-700 font-medium"><CheckCircle2 className="w-3 h-3" />discussed {format(discussedAt, "EEE")}</span>
                        ) : "-"}
                      </td>
                      <td className="px-2 py-2 border-r text-xs">
                        {wo.current_task_deadline ? (() => { const d = parseLocalDate(wo.current_task_deadline); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}
                      </td>
                      <td className="px-2 py-2 border-r text-xs truncate">{wo.designer || "-"}</td>
                      <td className="px-2 py-2 text-xs">
                        {wo.estimate_amount ? `$${wo.estimate_amount.toLocaleString()}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Work Order Details Dialog */}
      {selectedWorkOrder && (
        <WorkOrderDetailsDialog
          isOpen={true}
          onClose={() => closeDetailsDialog(selectedWorkOrder)}
          workOrder={selectedWorkOrder}
          onUpdate={() => loadWorkOrders()}
          onMove={async (wo, newStage) => {
            try {
              await transitionWorkOrderFromLoadedSnapshot({
                workOrder: wo,
                newStage,
                label: "Monday Morning Meeting details stage transition",
              });
            } catch (error) {
              console.error("Error moving Monday Morning Meeting Work Order:", error);
              setQuickEditError(error?.message || "This Work Order changed in another session. Reload and try the transition again.");
            }
            loadWorkOrders();
          }}
          onSplit={async (wo) => {
            await createWorkOrderWithRecovery({
              data: {
                title: `${wo.title} - Rider`,
                client_name: wo.client_name,
                description: wo.description,
                is_rider: true,
                parent_work_order_id: wo.id,
                current_stage: wo.current_stage,
                rider_stage: wo.current_stage
              },
              label: "Monday Morning Meeting rider Work Order",
            });
            loadWorkOrders();
          }}
          onComplete={async (wo) => {
            try {
              await transitionWorkOrderFromLoadedSnapshot({
                workOrder: wo,
                newStage: wo.current_stage,
                completed: true,
                label: "Monday Morning Meeting details completion",
              });
            } catch (error) {
              console.error("Error completing Monday Morning Meeting Work Order:", error);
              setQuickEditError(error?.message || "This Work Order changed in another session. Reload and try completion again.");
            }
            loadWorkOrders();
          }}
          onDelete={async (wo) => {
            try {
              const deleted = await softDeleteWorkOrderFromLoadedSnapshot({
                workOrder: wo,
                deletedBy: currentUser?.email || "unknown",
                label: "Monday Morning Meeting details Work Order delete",
              });
              Object.assign(wo, deleted);
            } catch (error) {
              console.error("Error deleting Monday Morning Meeting Work Order:", error);
              setQuickEditError(error?.message || "This Work Order changed in another session. Reload before deleting it.");
            }
            loadWorkOrders();
          }}
        />
      )}
    </div>
  );
}
