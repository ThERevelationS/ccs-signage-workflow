import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { NotificationTriggers } from "@/components/workflow/NotificationService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { addDays, format } from "date-fns";
import { Loader2, Link as LinkIcon, ClipboardList, Search, RefreshCw, CalendarClock, CheckCircle2, Settings2, AlertTriangle, X } from "lucide-react";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import ProductChecklistDialog from "@/components/sips/ProductChecklistDialog";
import TemplateBuilder from "@/components/sips/TemplateBuilder";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { usePolling } from "@/lib/usePolling";
import { fetchAllWorkOrders } from "@/lib/workOrderCache";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import { createWorkOrderWithRecovery, replaceWorkOrderFieldsIfUnchanged, softDeleteWorkOrderFromLoadedSnapshot, transitionWorkOrderFromLoadedSnapshot } from "@/components/workflow/workOrderPersistence";
import { staffEntities } from "@/components/staff/staffEntities";

const WorkOrder = staffEntities.WorkOrder;
const AuthorizedEmail = staffEntities.AuthorizedEmail;

// Helper to parse date string as local date
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

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

const MobileDescription = ({ value, fallback = "No description", label = "Job description" }) => {
  const [expanded, setExpanded] = useState(false);
  const text = typeof value === "string" && value.trim() ? value.trim() : fallback;
  const canExpand = text.length > 110;

  return (
    <div className="mt-2 min-w-0">
      <p className={`text-sm leading-relaxed text-gray-600 break-words whitespace-pre-wrap ${canExpand && !expanded ? "line-clamp-2" : ""}`}>
        {text}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="min-h-11 -ml-2 px-2 text-xs font-medium text-blue-700 hover:text-blue-800 underline-offset-2 hover:underline touch-manipulation"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Show full"} ${label.toLowerCase()}`}
        >
          {expanded ? "Show less" : "Show full description"}
        </button>
      )}
    </div>
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
    if (performance.now() - start < 220) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(() => {
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect();
    const drift = r.top + r.height / 2 - beforeCenter;
    if (Math.abs(drift) > 0.5) target.scrollTop += drift;
  }, 240);
};

export default function SIPs() {
  const { currentUser, isRegistered } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [checklistDialog, setChecklistDialog] = useState({ open: false, workOrder: null });
  const [wipTaskDescriptions, setWipTaskDescriptions] = useState([]);
  const [dropdownConditions, setDropdownConditions] = useState([]);
  const [focusedRowId, setFocusedRowId] = useState(null);
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [quickEditError, setQuickEditError] = useState("");
  const [boardError, setBoardError] = useState("");
  const [checklistConfigWarning, setChecklistConfigWarning] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortMode, setSortMode] = useState("meeting");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savingRevisitIds, setSavingRevisitIds] = useState(() => new Set());
  const [savingQuickEditKeys, setSavingQuickEditKeys] = useState(() => new Set());
  const [reopeningWipIds, setReopeningWipIds] = useState(() => new Set());
  const [reopenedFocusWorkOrderId, setReopenedFocusWorkOrderId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [pendingRevisitClear, setPendingRevisitClear] = useState(null);
  const [revisitClearFailure, setRevisitClearFailure] = useState(null);
  const [isClearingRevisit, setIsClearingRevisit] = useState(false);
  const boardLoadSequenceRef = useRef(0);
  // After the first successful load, keep mounted dialogs and local drafts intact
  // while full Work Order Details updates refresh the board.
  const boardHasLoadedRef = useRef(false);
  const boardLoadsInFlightRef = useRef(0);
  const boardSaveEpochRef = useRef(0);
  const boardSavesPendingRef = useRef(0);
  const boardRefreshDeferredRef = useRef(false);
  const quickEditsInFlightRef = useRef(new Map());
  const reopeningWipInFlightRef = useRef(new Set());
  const revisitClearCancelRef = useRef(null);
  const revisitClearBoardRef = useRef(null);

  // A failed clear disables the confirmation button; move keyboard focus to
  // the enabled review action only after the in-flight save finishes.
  useEffect(() => {
    if (pendingRevisitClear && revisitClearFailure?.requiresReview && !isClearingRevisit) {
      revisitClearCancelRef.current?.focus();
    }
  }, [pendingRevisitClear, revisitClearFailure, isClearingRevisit]);

  // Reopen removes its original completed-WIP control from the DOM. Once the
  // successful save reaches the board, focus the same Work Order in Active.
  // Search/filter may hide it; the board heading is then the safe fallback.
  useEffect(() => {
    if (!reopenedFocusWorkOrderId) return;
    const reopened = workOrders.find(wo => wo.id === reopenedFocusWorkOrderId);
    if (reopened?.sip_completed) return; // Wait for the saved board snapshot.
    // Another control may have received focus during the asynchronous save.
    // Respect that intentional navigation instead of stealing focus back.
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected) {
      setReopenedFocusWorkOrderId(null);
      return;
    }
    const activeButton = Array.from(document.querySelectorAll("[data-sips-active-focus-id]"))
      .find(node => node.dataset.sipsActiveFocusId === reopenedFocusWorkOrderId && node.getClientRects().length > 0);
    (activeButton || revisitClearBoardRef.current)?.focus();
    setReopenedFocusWorkOrderId(null);
  }, [reopenedFocusWorkOrderId, workOrders, searchQuery, statusFilter]);

  // Track the three quick board-save paths so a slower background refresh
  // cannot replace a newer optimistic edit or a freshly confirmed save.
  const saveBoardFields = async (options) => {
    boardSaveEpochRef.current += 1;
    boardSavesPendingRef.current += 1;
    try {
      return await replaceWorkOrderFieldsIfUnchanged(options);
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

  // A Work Order can have independent board fields saving concurrently. A
  // slower full-record response must not revert a newer optimistic/saved field
  // or replace the newer revision used by the next checklist action.
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

  // Set document title
  useEffect(() => {
    document.title = "SIPs - Workflow Manager";
  }, []);

  usePolling(() => {
    // A timer tick should not compete with an in-flight load or local save.
    // Save/conflict recovery still invokes loadWorkOrders directly.
    if (boardSavesPendingRef.current === 0) void refreshBoardWhenIdle();
  }, 60000, { runOnMount: false });

  useEffect(() => {
    loadWorkOrders();
  }, []);

  const loadWorkOrders = async (showLoading = true, { clearQuickEditErrorOnSuccess = false } = {}) => {
    boardLoadsInFlightRef.current += 1;
    const loadSequence = ++boardLoadSequenceRef.current;
    const saveEpochAtStart = boardSaveEpochRef.current;
    const isCurrentBoardSnapshot = () => loadSequence === boardLoadSequenceRef.current &&
      saveEpochAtStart === boardSaveEpochRef.current && boardSavesPendingRef.current === 0;
    if (showLoading && !boardHasLoadedRef.current) setIsLoading(true);
    else setIsRefreshing(true);
    // Leave existing failure messages visible while Retry is pending. Only
    // a successful, current snapshot proves that the issue has recovered.
    try {
      const [orders, usersData, taskDescSetting, dropdownsSetting] = await Promise.all([
        fetchAllWorkOrders().then((rows) =>
          (rows || [])
            .filter((wo) => wo.is_rider !== true && wo.completed !== true && wo.deleted !== true)
            .sort((a, b) => (a.created_date || "").localeCompare(b.created_date || ""))),
        loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "SIPs authorized users" }),
        loadSingleGlobalSetting({
          entity: staffEntities.GlobalSettings,
          settingKey: "salesTaskDescriptions",
          label: "SIPs sales task descriptions",
        }),
        loadSingleGlobalSetting({
          entity: staffEntities.GlobalSettings,
          settingKey: "dropdownConditions",
          label: "SIPs checklist dropdown conditions",
        })
          .then(setting => ({ setting, error: null }))
          .catch(error => ({ setting: null, error }))
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

      // Get task descriptions that have SIPs page assigned OR have WIP flag
      const sipTaskDescriptions = [];
      const wipDescs = [];
      if (taskDescSetting?.setting_value?.items) {
        taskDescSetting.setting_value.items.forEach(item => {
          if (item.page === "SIPs") {
            sipTaskDescriptions.push(item.text);
          }
          if (item.wip) {
            wipDescs.push(item.text);
          }
        });
      }
      // A refresh that returns identical data must keep the existing array
      // identities — replacing them would invalidate the memoized board
      // sections, the checklist-progress cache, and the role pick lists on
      // every timer tick. These states are only ever written here, and the
      // snapshot guard above already discarded superseded loads. Functional
      // updaters are required: the 60s interval captured this function's
      // first-render closure, so comparing against rendered state would
      // measure stale initial values and replace every input on every tick.
      const sameData = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      setWipTaskDescriptions(prev => sameData(wipDescs, prev) ? prev : wipDescs);
      setBoardError("");
      if (clearQuickEditErrorOnSuccess) setQuickEditError("");
      if (dropdownsSetting?.error) {
        console.error("Error loading SIPs checklist dropdown conditions:", dropdownsSetting.error);
        setChecklistConfigWarning("Checklist status definitions could not refresh. Work Orders are current, but checklist progress may use the last loaded rules.");
      } else {
        setChecklistConfigWarning("");
        const nextConditions = dropdownsSetting?.setting?.setting_value?.items || [];
        setDropdownConditions(prev => sameData(nextConditions, prev) ? prev : nextConditions);
      }
      
      // Filter for SIPs - items where:
      // 1. current_task_assigned_to is "SIPs", OR
      // 2. current_task_description has SIPs page assigned in settings, OR
      // 3. current_task_description has WIP flag checked in settings
      const sipOrders = orders.filter(wo => 
        wo.current_task_assigned_to === "SIPs" ||
        (wo.current_task_description && sipTaskDescriptions.includes(wo.current_task_description)) ||
        (wo.current_task_description && wipDescs.includes(wo.current_task_description))
      );
      boardHasLoadedRef.current = true;
      setWorkOrders(sipOrders.sort((a, b) => (b.created_date || "").localeCompare(a.created_date || "")));
      setUsers(prev => sameData(usersData, prev) ? prev : usersData);
      setLastUpdated(new Date());
      // Callers reconciling a rejected write may use only this verified,
      // current snapshot, never a stale or failed board refresh.
      return sipOrders;
    } catch (error) {
      if (isCurrentBoardSnapshot()) {
        console.error("Error loading work orders:", error);
        setBoardError(error?.message || "SIPs could not refresh. The last loaded board is still shown.");
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
  // Mandatory post-save and conflict refreshes intentionally bypass it.
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
    // Reopen also changes Revisit; a same-job date edit must wait for it.
    if (field === "sip_revisit_date" && reopeningWipInFlightRef.current.has(orderId)) {
      setQuickEditError("This WIP item is reopening. Wait for it to finish before changing Revisit.");
      return;
    }
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
    if (field === "sip_revisit_date") {
      setSavingRevisitIds(prev => new Set(prev).add(orderId));
    } else {
      setSavingQuickEditKeys(prev => new Set(prev).add(editKey));
    }
    const expectedValue = currentWo[field];
    setQuickEditError("");
    setWorkOrders(prev => prev.map(wo => wo.id === orderId ? { ...wo, [field]: value } : wo));
    try {
      const saved = await saveBoardFields({
        workOrderId: orderId,
        expectedFields: { [field]: expectedValue },
        nextFields: { [field]: value },
        label: `SIPs ${field}`,
      });
      applySavedBoardFields(orderId, saved, [field]);
      if (field === "sip_revisit_date" && value && saved?.id) {
        void NotificationTriggers.sipItemRevisitSet(saved, currentUser?.email).catch(() => {});
      }
    } catch (error) {
      console.error("Error updating SIPs Work Order field:", error);
      setQuickEditError(error?.message || "This Work Order field changed in another session. The latest value was reloaded.");
      await loadWorkOrders(false);
    } finally {
      quickEditsInFlightRef.current.delete(editKey);
      if (field === "sip_revisit_date") {
        setSavingRevisitIds(prev => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      } else {
        setSavingQuickEditKeys(prev => {
          const next = new Set(prev);
          next.delete(editKey);
          return next;
        });
      }
    }
  };

  // The WIP description list becomes a Set once per data change instead of a
  // linear includes() scan for every row on every render.
  const wipTaskDescriptionSet = useMemo(() => new Set(wipTaskDescriptions), [wipTaskDescriptions]);

  // Check if a work order is a WIP item (has WIP task description)
  const isWipItem = useCallback((wo) => {
    return wo.current_task_description && wipTaskDescriptionSet.has(wo.current_task_description);
  }, [wipTaskDescriptionSet]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const isRevisitFuture = useCallback((wo) => {
    if (!wo.sip_revisit_date) return false;
    const d = parseLocalDate(wo.sip_revisit_date);
    return d && d.getTime() > todayMs;
  }, [todayMs]);

  // Completion must go through the checklist dialog so approvals, statuses,
  // child tasks, and concurrency-safe completion are validated consistently.
  // Reopening a completed WIP item returns it to the active queue. Protect
  // the loaded Revisit date even when it is absent, today, or past: another
  // session must not schedule a future revisit while this item is reopening.
  // Clear a legacy future date atomically with reopening; preserve other dates.
  const toggleSipCompleted = async (wo) => {
    if (!wo.sip_completed) {
      openChecklist(wo);
      return;
    }

    // Prevent a second click from issuing a duplicate request before React
    // has rendered the disabled control; leave other jobs independently usable.
    if (reopeningWipInFlightRef.current.has(wo.id)) return;
    if (quickEditsInFlightRef.current.has(JSON.stringify([wo.id, "sip_revisit_date"]))) {
      setQuickEditError("The Revisit date is still saving. Wait for it to finish before reopening this WIP item.");
      return;
    }
    reopeningWipInFlightRef.current.add(wo.id);
    setReopeningWipIds(prev => new Set(prev).add(wo.id));
    const reopenedRevisitDate = isRevisitFuture(wo) ? "" : (wo.sip_revisit_date ?? "");
    setQuickEditError("");
    try {
      const saved = await saveBoardFields({
        workOrderId: wo.id,
        expectedFields: {
          sip_completed: wo.sip_completed,
          sip_revisit_date: wo.sip_revisit_date,
        },
        nextFields: {
          sip_completed: false,
          sip_revisit_date: reopenedRevisitDate,
        },
        label: "SIPs reopen completed WIP",
      });
      applySavedBoardFields(wo.id, saved, ["sip_completed", "sip_revisit_date"]);
      setReopenedFocusWorkOrderId(wo.id);
    } catch (error) {
      console.error("Error reopening completed SIP WIP item:", error);
      setQuickEditError(error?.message || "This Work Order changed in another session. The latest value was reloaded.");
      const beforeRecoveryRead = boardLoadSequenceRef.current;
      let refreshedOrders = await loadWorkOrders(false);
      // A background/explicit refresh can supersede this recovery read. Its
      // result is intentionally discarded by loadWorkOrders; perform at most
      // one new read-only verification after that race, never another write.
      // Failed reads or concurrent saves cannot silently resolve conflicts.
      if (!refreshedOrders && boardLoadSequenceRef.current > beforeRecoveryRead + 1 &&
          boardSavesPendingRef.current === 0) {
        refreshedOrders = await loadWorkOrders(false);
      }
      // Two employees may reopen the same completed WIP simultaneously.
      // If our conditional write lost but the verified server record already
      // has precisely the intended completion AND Revisit date, restore focus
      // to the moved item without resubmitting or claiming a stale edit saved.
      const alreadyReopened = refreshedOrders?.some(current => current.id === wo.id &&
        current.sip_completed === false &&
        (current.sip_revisit_date || "") === (reopenedRevisitDate || ""));
      if (alreadyReopened) {
        setQuickEditError("");
        setReopenedFocusWorkOrderId(wo.id);
      }
    } finally {
      reopeningWipInFlightRef.current.delete(wo.id);
      setReopeningWipIds(prev => {
        const next = new Set(prev);
        next.delete(wo.id);
        return next;
      });
    }
  };

  const requestClearRevisit = (wo) => {
    setOpenDatePopover(null);
    setRevisitClearFailure(null);
    if (reopeningWipInFlightRef.current.has(wo.id)) {
      setQuickEditError("This WIP item is reopening. Wait for it to finish before clearing Revisit.");
      return;
    }
    setPendingRevisitClear({
      id: wo.id,
      clientName: wo.client_name || "this Work Order",
      revisitDate: wo.sip_revisit_date,
      returnsToActive: isRevisitFuture(wo),
    });
  };

  const confirmClearRevisit = async () => {
    if (!pendingRevisitClear || isClearingRevisit || revisitClearFailure?.requiresReview) return;
    const clearingRequest = pendingRevisitClear;
    const editKey = JSON.stringify([clearingRequest.id, "sip_revisit_date"]);
    if (reopeningWipInFlightRef.current.has(clearingRequest.id)) {
      const message = "This WIP item is reopening. Wait for it to finish before clearing Revisit.";
      setQuickEditError(message);
      setRevisitClearFailure({ message, requiresReview: false });
      return;
    }
    if (quickEditsInFlightRef.current.has(editKey)) {
      if (quickEditsInFlightRef.current.get(editKey) !== "") {
        const message = "The Revisit date is still saving. Wait for it to finish before clearing it.";
        setQuickEditError(message);
        setRevisitClearFailure({ message, requiresReview: false });
      }
      return;
    }
    // Share the date-edit guard with calendar saves. The confirmation keeps
    // its original expected date so a later session cannot be cleared.
    quickEditsInFlightRef.current.set(editKey, "");
    setSavingRevisitIds(prev => new Set(prev).add(clearingRequest.id));
    setIsClearingRevisit(true);
    setRevisitClearFailure(null);
    setQuickEditError("");
    try {
      // Guard the date the user actually confirmed, not a newer date from a
      // background board refresh or another session's scheduling change.
      const saved = await saveBoardFields({
        workOrderId: clearingRequest.id,
        expectedFields: { sip_revisit_date: clearingRequest.revisitDate },
        nextFields: { sip_revisit_date: "" },
        label: "SIPs clear confirmed revisit date",
      });
      applySavedBoardFields(clearingRequest.id, saved, ["sip_revisit_date"]);
      setRevisitClearFailure(null);
      setPendingRevisitClear(null);
    } catch (error) {
      console.error("Error clearing confirmed SIPs revisit date:", error);
      const message = error?.message || "The revisit date may have changed. No newer date was cleared; review the refreshed board before trying again.";
      setQuickEditError(message);
      // Keep the dialog visible so its error is readable. Never permit a
      // second clear against the confirmed, potentially stale date.
      setRevisitClearFailure({ message, requiresReview: true });
      await loadWorkOrders(false);
    } finally {
      quickEditsInFlightRef.current.delete(editKey);
      setSavingRevisitIds(prev => {
        const next = new Set(prev);
        next.delete(clearingRequest.id);
        return next;
      });
      setIsClearingRevisit(false);
    }
  };

  // All non-completed active items
  const allActive = useMemo(() => workOrders.filter(wo => (!isWipItem(wo) || !wo.sip_completed)), [workOrders, isWipItem]);

  // Jobs with NO revisit date or revisit date <= today go to main active list
  const activeWorkOrders = useMemo(() => allActive
    .filter(wo => !isRevisitFuture(wo))
    .sort((a, b) => {
      // No date => top; then sort ascending by revisit date
      if (!a.sip_revisit_date && !b.sip_revisit_date) return 0;
      if (!a.sip_revisit_date) return -1;
      if (!b.sip_revisit_date) return 1;
      return a.sip_revisit_date.localeCompare(b.sip_revisit_date);
    }), [allActive, isRevisitFuture]);

  // Jobs with a FUTURE revisit date
  const futureRevisitOrders = useMemo(() => allActive
    .filter(wo => isRevisitFuture(wo))
    .sort((a, b) => a.sip_revisit_date.localeCompare(b.sip_revisit_date)), [allActive, isRevisitFuture]);
  const nextRevisitDate = futureRevisitOrders[0]?.sip_revisit_date
    ? parseLocalDate(futureRevisitOrders[0].sip_revisit_date)
    : null;

  const completedWipItems = useMemo(() => workOrders.filter(wo => isWipItem(wo) && wo.sip_completed), [workOrders, isWipItem]);

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

  const openChecklist = (wo) => {
    if (!wo?.id) return;
    if (checklistDialog.open && checklistDialog.workOrder?.id === wo.id) return;
    if (checklistDialog.open && checklistDialog.workOrder?.id !== wo.id) {
      setActionError({
        title: "Finish the open SIPS checklist first",
        message: "Another Work Order cannot replace the checklist you are editing. Save & Revisit (including its date confirmation), or use Cancel and review the unsaved-changes warning. Then open the other Work Order.",
      });
    }
    // A second same-tick request must not bypass the open-dialog guard.
    // Keep the mounted checklist and its local drafts intact until it closes.
    setChecklistDialog(current => current.open ? current : { open: true, workOrder: wo });
  };

  // Radix restores focus to the original opener only while that element
  // stays mounted; a save can move the row between sections or filter it
  // out. Give keyboard users the same landing spot the WIP-reopen path uses.
  const restoreBoardFocus = (workOrderId) => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const button = Array.from(document.querySelectorAll("[data-sips-active-focus-id],[data-sips-job-focus-id]"))
      .find(node => (node.dataset.sipsActiveFocusId || node.dataset.sipsJobFocusId) === workOrderId && node.getClientRects().length > 0);
    (button || revisitClearBoardRef.current)?.focus();
  };
  const closeChecklistDialog = (wo) => {
    const workOrderId = wo?.id;
    setChecklistDialog({ open: false, workOrder: null });
    requestAnimationFrame(() => restoreBoardFocus(workOrderId));
  };
  const closeDetailsDialog = (wo) => {
    const workOrderId = wo?.id;
    setSelectedWorkOrder(null);
    requestAnimationFrame(() => restoreBoardFocus(workOrderId));
  };

  const dropdownConditionByName = useMemo(
    () => new Map(dropdownConditions.map(condition => [condition.name, condition])),
    [dropdownConditions]
  );

  // Progress is evaluated for every row on every board render. Cache the
  // result per Work Order object — board refreshes deliver fresh objects, so
  // a stale result cannot survive a real data change — and look conditions up
  // by name instead of scanning the whole list for each checklist item.
  const checklistProgressCacheRef = useRef({ conditions: null, results: new WeakMap() });
  const getChecklistProgress = useCallback((wo) => {
    const cache = checklistProgressCacheRef.current;
    if (cache.conditions !== dropdownConditionByName) {
      cache.conditions = dropdownConditionByName;
      cache.results = new WeakMap();
    }
    // WorkOrderDetailsDialog patches the loaded row in place via
    // Object.assign, so the same object can gain a different checklist array.
    // The cache is only valid while the stored checklist identity matches.
    const cached = cache.results.get(wo);
    if (cached && cached.checklist === wo.sip_checklist) return cached.result;
    const checklist = wo.sip_checklist || [];

    // Only count main checklist items (type === 'checklist' or no type AND no parent_id)
    const mainChecklistItems = checklist.filter(item =>
      (!item.type || item.type === 'checklist') && !item.parent_id
    );

    if (mainChecklistItems.length === 0) return { completed: 0, total: 0 };

    // Match ProductChecklistDialog completion semantics exactly:
    // an approver + status is required, configured Continued statuses stay open,
    // and legacy/custom statuses that are no longer configured remain complete.
    const mainCompleted = mainChecklistItems.filter(item => {
      if (!item.approved_by || !item.custom_dropdown_value) return false;
      const condition = dropdownConditionByName.get(item.custom_dropdown_value);
      return !condition || condition.is_completed;
    }).length;

    const result = {
      completed: mainCompleted,
      total: mainChecklistItems.length
    };
    cache.results.set(wo, { checklist: wo.sip_checklist, result });
    return result;
  }, [dropdownConditionByName]);

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
    if (statusFilter === "incomplete") {
      const progress = getChecklistProgress(wo);
      return progress.total === 0 || progress.completed < progress.total;
    }
    return true;
  }, [statusFilter, getDeadlineStatus, needsAttention, getChecklistProgress]);

  const sortOrders = useCallback((orders) => [...orders].sort((a, b) => {
    if (sortMode === "deadline") {
      if (!a.current_task_deadline && !b.current_task_deadline) return 0;
      if (!a.current_task_deadline) return 1;
      if (!b.current_task_deadline) return -1;
      return a.current_task_deadline.localeCompare(b.current_task_deadline);
    }
    if (sortMode === "customer") return (a.client_name || "").localeCompare(b.client_name || "");
    if (sortMode === "amount") return Number(b.estimate_amount || 0) - Number(a.estimate_amount || 0);
    return 0;
  }), [sortMode]);

  // Derive the visible sections and badge counts once per input change; an
  // unrelated render (dialog flag, in-flight marker) no longer refilters and
  // resorts every row.
  const visibleActiveWorkOrders = useMemo(() => sortOrders(
    activeWorkOrders.filter(matchesSearch).filter(matchesStatusFilter)
  ), [activeWorkOrders, matchesSearch, matchesStatusFilter, sortOrders]);
  const visibleFutureRevisitOrders = useMemo(() => futureRevisitOrders.filter(matchesSearch), [futureRevisitOrders, matchesSearch]);
  const visibleCompletedWipItems = useMemo(() => completedWipItems.filter(matchesSearch), [completedWipItems, matchesSearch]);
  const overdueCount = useMemo(() => activeWorkOrders.filter((wo) => getDeadlineStatus(wo.current_task_deadline)?.bucket === "overdue").length, [activeWorkOrders, getDeadlineStatus]);
  const dueSoonCount = useMemo(() => activeWorkOrders.filter((wo) => ["today", "soon"].includes(getDeadlineStatus(wo.current_task_deadline)?.bucket)).length, [activeWorkOrders, getDeadlineStatus]);
  const attentionCount = useMemo(() => activeWorkOrders.filter(needsAttention).length, [activeWorkOrders, needsAttention]);
  const incompleteChecklistCount = useMemo(() => activeWorkOrders.filter((wo) => {
    const progress = getChecklistProgress(wo);
    return progress.total === 0 || progress.completed < progress.total;
  }).length, [activeWorkOrders, getChecklistProgress]);
  const activeValue = useMemo(() => activeWorkOrders.reduce((sum, wo) => sum + Number(wo.estimate_amount || 0), 0), [activeWorkOrders]);

  // Role-filtered pick lists are shared by every row; build them once.
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
  const jumpToRevisitLater = () => {
    if (futureRevisitOrders.length === 0) return;
    if (searchQuery) setSearchQuery("");
    setTimeout(() => {
      document.getElementById("sips-revisit-later")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden p-3 sm:p-6">
      <div className="w-full">
        {/* Header */}
        <div className="clay-card p-4 sm:p-6 mb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 ref={revisitClearBoardRef} tabIndex={-1} className="text-2xl sm:text-3xl font-bold text-gray-800 rounded-sm focus:outline-2 focus:outline-offset-2 focus:outline-blue-600">SIPs Meeting Board</h1>
                <Badge variant="outline" className="bg-white">{workOrders.length} total</Badge>
              </div>
              <p className="text-gray-500 mt-1">
                Production & Installation Planning
                {lastUpdated && <span className="ml-2 text-xs">• refreshed {format(lastUpdated, "h:mm a")}</span>}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {currentUser?.role === "admin" && (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowTemplateBuilder(true)} className="h-11 sm:h-8">
                  <Settings2 className="w-4 h-4 mr-2" />Manage Templates
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => refreshBoardWhenIdle()} disabled={isRefreshing} className="h-11 sm:h-8">
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />Refresh
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-2 mt-4">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              aria-pressed={statusFilter === "all"}
              className={`rounded-lg border bg-white/70 p-3 text-left hover:bg-white transition-colors ${statusFilter === "all" ? "ring-2 ring-gray-400 border-gray-300" : ""}`}
            >
              <div className="text-xs text-gray-500">Active queue</div>
              <div className="text-xl font-bold text-gray-800">{activeWorkOrders.length}</div>
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
              onClick={() => setStatusFilter("incomplete")}
              aria-pressed={statusFilter === "incomplete"}
              className={`rounded-lg border bg-blue-50/80 p-3 text-left hover:bg-blue-100 transition-colors ${statusFilter === "incomplete" ? "ring-2 ring-blue-400 border-blue-300" : ""}`}
            >
              <div className="text-xs text-blue-700 flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" />Incomplete checklists</div>
              <div className="text-xl font-bold text-blue-800">{incompleteChecklistCount}</div>
            </button>
            <button
              type="button"
              onClick={jumpToRevisitLater}
              disabled={futureRevisitOrders.length === 0}
              className="rounded-lg border bg-purple-50/80 p-3 text-left hover:bg-purple-100 transition-colors disabled:cursor-default disabled:opacity-60"
              title={futureRevisitOrders.length > 0 ? "Jump to Revisit Later" : "No items are waiting for a revisit date"}
            >
              <div className="text-xs text-purple-700 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />Revisit Later</div>
              <div className="text-xl font-bold text-purple-800">{futureRevisitOrders.length}</div>
              <div className="text-[10px] text-purple-600 mt-0.5">
                {nextRevisitDate && !Number.isNaN(nextRevisitDate.getTime()) ? `Next ${format(nextRevisitDate, "MMM d")}` : "No future revisits"}
              </div>
            </button>
            <div className="rounded-lg border bg-green-50/80 p-3">
              <div className="text-xs text-green-700">Active value</div>
              <div className="text-lg font-bold text-green-800">${activeValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
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
                <SelectItem value="all">All active items</SelectItem>
                <SelectItem value="attention">Needs attention</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="due_soon">Due within 7 days</SelectItem>
                <SelectItem value="incomplete">Incomplete checklist</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortMode} onValueChange={setSortMode}>
              <SelectTrigger className="h-11 bg-white md:h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="meeting">Meeting order</SelectItem>
                <SelectItem value="deadline">Deadline</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="amount">Amount</SelectItem>
              </SelectContent>
            </Select>
            {hasBoardViewFilters && (
              <Button type="button" variant="ghost" onClick={resetBoardView} className="h-11 w-full justify-center md:h-9 md:w-auto md:justify-self-auto">
                <X className="w-4 h-4 mr-2" />Clear
              </Button>
            )}
          </div>
          <div className={`mt-2 text-xs ${visibleActiveWorkOrders.length !== activeWorkOrders.length ? "text-blue-700 font-medium" : "text-gray-500"}`} aria-live="polite">
            Showing {visibleActiveWorkOrders.length} of {activeWorkOrders.length} active item{activeWorkOrders.length === 1 ? "" : "s"}
          </div>
        </div>

        {checklistConfigWarning && (
          <div
            className="mb-4 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
            role="status"
          >
            <div className="min-w-0">
              <div className="font-medium">Checklist progress rules could not refresh</div>
              <div className="mt-1 text-xs">{checklistConfigWarning}</div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => refreshBoardWhenIdle()}
              disabled={isRefreshing}
              className="h-11 w-full shrink-0 border-amber-300 bg-white text-amber-900 touch-manipulation sm:h-8 sm:w-auto"
            >
              {isRefreshing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Retry
            </Button>
          </div>
        )}

        {boardError && (
          <div
            className="mb-4 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <div className="min-w-0">
              <div className="font-medium">SIPs refresh issue</div>
              <div className="mt-1 text-xs">{boardError}</div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => refreshBoardWhenIdle()}
              disabled={isRefreshing}
              className="h-11 w-full shrink-0 border-amber-300 bg-white text-amber-900 touch-manipulation sm:h-8 sm:w-auto"
            >
              {isRefreshing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Retry
            </Button>
          </div>
        )}

        {quickEditError && (
          <div
            className="mb-4 flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <div className="min-w-0">
              <div className="font-medium">SIPs Work Order update blocked</div>
              <div className="mt-1 text-xs">{quickEditError}</div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => refreshBoardWhenIdle({ clearQuickEditErrorOnSuccess: true })}
              disabled={isRefreshing}
              className="h-11 w-full shrink-0 border-red-300 bg-white text-red-800 touch-manipulation sm:h-8 sm:w-auto"
            >
              {isRefreshing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reload latest
            </Button>
          </div>
        )}

        {/* Active queue */}
        <div className="clay-card p-3 sm:p-4 w-full">
          <div className="lg:hidden space-y-3">
            {visibleActiveWorkOrders.map((wo, index) => {
              const progress = getChecklistProgress(wo);
              const deadlineStatus = getDeadlineStatus(wo.current_task_deadline);
              const isWip = isWipItem(wo);
              return (
                <div key={wo.id} className={`rounded-xl border p-3 bg-white transition-all duration-300 ${focusedRowId === wo.id ? "ring-2 ring-purple-400 scale-[1.02] shadow-lg shadow-purple-300/50" : ""}`}>
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setFocusedRowId(focusedRowId === wo.id ? null : wo.id)}
                      className="w-11 h-11 rounded-lg text-white font-bold text-sm shrink-0 touch-manipulation"
                      style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
                      aria-label={`${focusedRowId === wo.id ? "Remove focus from" : "Focus"} ${wo.client_name || "this Work Order"}`}
                      aria-pressed={focusedRowId === wo.id}
                    >
                      {index + 1}
                    </button>
                    <div className="min-w-0 flex-1">
                      <button type="button" data-sips-active-focus-id={wo.id} onClick={() => setSelectedWorkOrder(wo)} className="min-h-11 font-semibold text-gray-900 hover:text-blue-600 text-left flex items-center gap-1 max-w-full touch-manipulation">
                        <LinkIcon className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                        <span className="truncate">{wo.client_name || "Unnamed"}</span>
                      </button>

                    </div>
                  </div>

                  <MobileDescription value={wo.description || wo.current_task_description} />

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {isWip && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">WIP</Badge>}
                    {deadlineStatus?.label && <Badge variant="outline" className={deadlineStatus.className}>{deadlineStatus.label}</Badge>}
                    {wo.current_task_assigned_to && <Badge variant="outline">{wo.current_task_assigned_to}</Badge>}
                    {wo.asap && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">ASAP</Badge>}
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-xs">
                    <div><span className="text-gray-400 block">Deadline</span><span className="font-medium text-gray-700">{wo.current_task_deadline ? format(parseLocalDate(wo.current_task_deadline), "MM/dd/yy") : "—"}</span></div>
                    <div><span className="text-gray-400 block">PM</span><span className="font-medium text-gray-700 truncate block">{wo.project_manager || "—"}</span></div>
                    <div><span className="text-gray-400 block">Amount</span><span className="font-medium text-gray-700">{wo.estimate_amount ? `$${wo.estimate_amount.toLocaleString()}` : "—"}</span></div>
                    <div><span className="text-gray-400 block">Revisit</span><span className="font-medium text-amber-700">{wo.sip_revisit_date ? format(parseLocalDate(wo.sip_revisit_date), "MM/dd/yy") : "—"}</span></div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t">
                    <Button variant="outline" size="sm" onClick={() => openChecklist(wo)} className="min-h-11 justify-center touch-manipulation">
                      <ClipboardList className="w-4 h-4 mr-2 text-blue-600" />Checklist {progress.completed}/{progress.total}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedWorkOrder(wo)} className="min-h-11 justify-center touch-manipulation">Open Work Order</Button>
                  </div>
                  <Popover
                    open={openDatePopover === `revisit-active-mobile-${wo.id}`}
                    onOpenChange={(open) => setOpenDatePopover(open ? `revisit-active-mobile-${wo.id}` : null)}
                  >
                    <PopoverTrigger asChild disabled={!isRegistered || savingRevisitIds.has(wo.id)}>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={savingRevisitIds.has(wo.id)}
                        aria-busy={savingRevisitIds.has(wo.id)}
                        className="w-full min-h-11 mt-2 text-amber-700 hover:bg-amber-50 touch-manipulation"
                      >
                        {savingRevisitIds.has(wo.id) ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving revisit date…</>
                        ) : (
                          <><CalendarClock className="w-4 h-4 mr-2" />{wo.sip_revisit_date ? "Change Revisit Date" : "Set Revisit Date"}</>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        required
                        selected={parseLocalDate(wo.sip_revisit_date)}
                        disabled={savingRevisitIds.has(wo.id) || reopeningWipIds.has(wo.id) ? true : { before: addDays(today, 1) }}
                        onSelect={(date) => {
                          if (!date) return;
                          updateWorkOrder(wo.id, "sip_revisit_date", format(date, "yyyy-MM-dd"));
                          setOpenDatePopover(null);
                        }}
                      />
                      {wo.sip_revisit_date && (
                        <div className="p-2 border-t">
                          <button type="button" disabled={!isRegistered || savingRevisitIds.has(wo.id) || reopeningWipIds.has(wo.id)} onClick={() => requestClearRevisit(wo)} className="min-h-11 px-3 text-xs text-red-600 hover:underline w-full text-center touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed">Clear revisit date</button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              );
            })}
            {visibleActiveWorkOrders.length === 0 && (
              <div className="py-10 px-4 text-center text-sm text-gray-500">
                <div>{searchQuery || statusFilter !== "all" ? "No active SIPs items match the current search or filter." : "No items assigned to SIPs."}</div>
                {(searchQuery || statusFilter !== "all") && (
                  <Button type="button" variant="outline" size="sm" onClick={resetBoardView} className="mt-3 bg-white">
                    <X className="w-4 h-4 mr-2" />Clear search & filters
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="hidden lg:block overflow-x-hidden">
          <table className="w-full table-fixed border-collapse" style={{ fontSize: '14px' }}>
            <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '3%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '7%' }} />
            </colgroup>
            <thead className="bg-gray-100 sticky top-0 z-20 shadow-sm">
              <tr className="border-b">
                <th 
                  className="px-2 py-3 border-r text-center font-bold text-white" 
                  style={{ 
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    fontSize: '14px'
                  }}
                >
                  #
                </th>
                <th className="px-1 py-3 border-r text-center font-bold text-gray-700">✓</th>
                <th className="px-1 py-3 border-r text-center font-bold text-gray-700">Checklist</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700">Customer</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700">Job Description</th>
                <th className="px-1 py-3 border-r text-left font-bold text-gray-700">Deadline</th>
                <th className="px-1 py-3 border-r text-left font-bold text-gray-700">Task Assigned</th>
                <th className="px-1 py-3 border-r text-left font-bold text-gray-700">Designer</th>
                <th className="px-1 py-3 border-r text-left font-bold text-gray-700">PM</th>
                <th className="px-1 py-3 border-r text-left font-bold text-gray-700">Estimator</th>
                <th className="px-1 py-3 border-r text-left font-bold text-gray-700">Est/Inv #</th>
                <th className="px-1 py-3 border-r text-left font-bold text-gray-700">Amount</th>
                <th className="px-1 py-3 border-r text-left font-bold text-gray-700">Survey</th>
                <th className="px-1 py-3 text-left font-bold text-gray-700" style={{ background: '#fef3c7' }}>📅 Revisit</th>
              </tr>
            </thead>
            <tbody>
              {visibleActiveWorkOrders.map((wo, index) => {
                const progress = getChecklistProgress(wo);
                const isWip = isWipItem(wo);
                const deadlineStatus = getDeadlineStatus(wo.current_task_deadline);
                
                return [
                  focusedRowId === wo.id && <tr key="focus-gap-top" className="sips-focus-gap" aria-hidden="true"><td colSpan={14}><div className="sips-focus-gap-inner" /></td></tr>,
                  <tr key="row"
                    className={`sips-board-row border-b ${focusedRowId !== wo.id ? 'hover:bg-gray-50' : ''} ${isWip && focusedRowId !== wo.id ? 'bg-blue-50/30' : ''} ${focusedRowId === wo.id ? 'sips-focus-row' : ''}`}
                    style={{ height: focusedRowId === wo.id ? '62px' : '50px' }}
                  >
                    {/* Row Number - Clickable Focus Button */}
                    <td className="px-0 py-0 border-r">
                      <button type="button"
                        onClick={(e) => { anchorFocusedRow(e.currentTarget); setFocusedRowId(focusedRowId === wo.id ? null : wo.id); }}
                        className={`w-full h-full px-2 py-2 text-center font-bold transition-colors ${
                          focusedRowId === wo.id 
                            ? 'sips-focus-num text-white'
                            : 'text-gray-500 hover:bg-purple-100 hover:text-purple-700'
                        }`}
                        style={focusedRowId !== wo.id ? { 
                          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                          color: 'white'
                        } : undefined}
                      >
                        {index + 1}
                      </button>
                    </td>

                    {/* Completed Checkbox */}
                    <td className="px-2 py-2 border-r text-center">
                      <Checkbox
                        checked={wo.sip_completed || false}
                        onCheckedChange={() => toggleSipCompleted(wo)}
                        disabled={!isRegistered}
                        className="h-5 w-5"
                      />
                    </td>

                    {/* Checklist Button */}
                    <td className="px-2 py-2 border-r text-center">
                      <Button
                        variant="outline"
                        onClick={() => openChecklist(wo)}
                        className="h-10 w-full flex flex-col items-center justify-center gap-0.5 hover:bg-blue-50 p-1"
                      >
                        <ClipboardList className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-medium">
                          {progress.completed}/{progress.total}
                        </span>
                      </Button>
                    </td>

                    {/* Customer */}
                     <td className="px-2 py-2 border-r">
                       <button type="button"
                         data-sips-active-focus-id={wo.id}
                         onClick={() => setSelectedWorkOrder(wo)}
                         className="text-sm text-left hover:text-blue-600 flex items-center gap-1 font-medium w-full truncate"
                       >
                         <LinkIcon className="w-3 h-3 flex-shrink-0 text-blue-500" />
                         <span className="truncate">{wo.client_name || "Unnamed"}</span>
                       </button>
                     </td>

                     {/* Job Description */}
                     <td className="px-2 py-2 border-r min-w-0">
                       <CondensedDescription value={wo.description} />
                     </td>

                     {/* Deadline */}
                    <td className="px-2 py-2 border-r">
                      <Popover 
                        open={openDatePopover === `deadline-${wo.id}`} 
                        onOpenChange={(open) => setOpenDatePopover(open ? `deadline-${wo.id}` : null)}
                      >
                        <PopoverTrigger asChild disabled={!isRegistered || isQuickEditSaving(wo.id, "current_task_deadline")}>
                          <button type="button" disabled={isQuickEditSaving(wo.id, "current_task_deadline")} aria-busy={isQuickEditSaving(wo.id, "current_task_deadline")} className="min-h-8 w-full text-sm text-left px-1 py-1 hover:bg-gray-100 rounded font-medium flex flex-col items-start justify-center gap-0.5 disabled:opacity-60">
                            <span>{wo.current_task_deadline ? (() => { const d = parseLocalDate(wo.current_task_deadline); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}</span>
                            {deadlineStatus?.label && <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${deadlineStatus.className}`}>{deadlineStatus.label}</Badge>}
                            {isQuickEditSaving(wo.id, "current_task_deadline") && <span className="text-[10px] text-blue-700">Saving…</span>}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={parseLocalDate(wo.current_task_deadline)}
                            disabled={isQuickEditSaving(wo.id, "current_task_deadline")}
                            onSelect={(date) => {
                              if (isQuickEditSaving(wo.id, "current_task_deadline")) return;
                              updateWorkOrder(wo.id, "current_task_deadline", date ? format(date, "yyyy-MM-dd") : "");
                              setOpenDatePopover(null);
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </td>

                    {/* Task Assigned */}
                    <td className="px-2 py-2 border-r">
                      <Select
                        value={wo.current_task_assigned_to || ""}
                        onValueChange={(val) => updateWorkOrder(wo.id, "current_task_assigned_to", val)}
                        disabled={!isRegistered || isQuickEditSaving(wo.id, "current_task_assigned_to")}
                      >
                        <SelectTrigger aria-busy={isQuickEditSaving(wo.id, "current_task_assigned_to")} aria-label={isQuickEditSaving(wo.id, "current_task_assigned_to") ? "Saving task assigned…" : undefined} className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
                          {isQuickEditSaving(wo.id, "current_task_assigned_to") && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-600" aria-hidden="true" />}
                          <SelectValue placeholder="-">{wo.current_task_assigned_to || "-"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
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
                        <SelectTrigger aria-busy={isQuickEditSaving(wo.id, "designer")} aria-label={isQuickEditSaving(wo.id, "designer") ? "Saving designer…" : undefined} className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
                          {isQuickEditSaving(wo.id, "designer") && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-600" aria-hidden="true" />}
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
                        <SelectTrigger aria-busy={isQuickEditSaving(wo.id, "project_manager")} aria-label={isQuickEditSaving(wo.id, "project_manager") ? "Saving project manager…" : undefined} className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
                          {isQuickEditSaving(wo.id, "project_manager") && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-600" aria-hidden="true" />}
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
                        <SelectTrigger aria-busy={isQuickEditSaving(wo.id, "estimator")} aria-label={isQuickEditSaving(wo.id, "estimator") ? "Saving estimator…" : undefined} className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
                          {isQuickEditSaving(wo.id, "estimator") && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-600" aria-hidden="true" />}
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
                    <td className="px-2 py-2 border-r">
                      <Popover 
                        open={openDatePopover === `survey-${wo.id}`} 
                        onOpenChange={(open) => setOpenDatePopover(open ? `survey-${wo.id}` : null)}
                      >
                        <PopoverTrigger asChild disabled={!isRegistered || isQuickEditSaving(wo.id, "site_survey_date")}>
                          <button type="button" disabled={isQuickEditSaving(wo.id, "site_survey_date")} aria-busy={isQuickEditSaving(wo.id, "site_survey_date")} className="h-8 w-full text-sm text-left px-1 hover:bg-gray-100 rounded font-medium disabled:opacity-60">
                            {isQuickEditSaving(wo.id, "site_survey_date") ? "Saving…" : (wo.site_survey_date ? (() => { const d = parseLocalDate(wo.site_survey_date); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-")}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={parseLocalDate(wo.site_survey_date)}
                            disabled={isQuickEditSaving(wo.id, "site_survey_date")}
                            onSelect={(date) => {
                              if (isQuickEditSaving(wo.id, "site_survey_date")) return;
                              updateWorkOrder(wo.id, "site_survey_date", date ? format(date, "yyyy-MM-dd") : "");
                              setOpenDatePopover(null);
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </td>

                    {/* Revisit Date */}
                    <td className="px-2 py-2" style={{ background: wo.sip_revisit_date ? '#fef9c3' : 'transparent' }}>
                      <Popover
                        open={openDatePopover === `revisit-${wo.id}`}
                        onOpenChange={(open) => setOpenDatePopover(open ? `revisit-${wo.id}` : null)}
                      >
                        <PopoverTrigger asChild disabled={!isRegistered || savingRevisitIds.has(wo.id)}>
                          <button type="button" disabled={savingRevisitIds.has(wo.id)} aria-busy={savingRevisitIds.has(wo.id)} className={`h-8 w-full text-sm text-left px-1 hover:bg-yellow-100 rounded font-medium disabled:opacity-60 ${wo.sip_revisit_date ? 'text-amber-700' : 'text-gray-400'}`}>
                            {savingRevisitIds.has(wo.id) ? "Saving…" : (wo.sip_revisit_date ? (() => { const d = parseLocalDate(wo.sip_revisit_date); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-")}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            required
                            selected={parseLocalDate(wo.sip_revisit_date)}
                            disabled={savingRevisitIds.has(wo.id) || reopeningWipIds.has(wo.id) ? true : { before: addDays(today, 1) }}
                            onSelect={(date) => {
                              if (!date) return;
                              updateWorkOrder(wo.id, "sip_revisit_date", format(date, "yyyy-MM-dd"));
                              setOpenDatePopover(null);
                            }}
                          />
                          {wo.sip_revisit_date && (
                            <div className="p-2 border-t">
                              <button
                                type="button"
                                disabled={!isRegistered || savingRevisitIds.has(wo.id) || reopeningWipIds.has(wo.id)}
                                onClick={() => requestClearRevisit(wo)}
                                className="text-xs text-red-500 hover:underline w-full text-center disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Clear date
                              </button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </td>
                  </tr>,
                  focusedRowId === wo.id && <tr key="focus-gap-bottom" className="sips-focus-gap" aria-hidden="true"><td colSpan={14}><div className="sips-focus-gap-inner" /></td></tr>
                ];
              })}
              {visibleActiveWorkOrders.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-3 py-12 text-center text-gray-500 text-base">
                    <div>
                      {searchQuery || statusFilter !== "all"
                        ? "No active SIPs items match the current search or filter."
                        : "No items assigned to SIPs. Assign \"SIPs\" to the Task Assigned column or check WIP/SIP on a task description to see items here."}
                    </div>
                    {(searchQuery || statusFilter !== "all") && (
                      <Button type="button" variant="outline" size="sm" onClick={resetBoardView} className="mt-3 bg-white">
                        <X className="w-4 h-4 mr-2" />Clear search & filters
                      </Button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Future Revisit Section */}
        {visibleFutureRevisitOrders.length > 0 && (
          <div id="sips-revisit-later" className="clay-card p-3 sm:p-4 w-full mt-6 scroll-mt-4" style={{ borderLeft: '4px solid #f59e0b' }}>
            <h3 className="text-sm font-semibold text-amber-700 mb-3 flex flex-wrap items-center gap-2">
              <CalendarClock className="w-4 h-4" /> Revisit Later ({visibleFutureRevisitOrders.length})
              <span className="text-xs text-gray-400 font-normal">— future revisit date set, not in active queue</span>
            </h3>

            <div className="lg:hidden space-y-3">
              {visibleFutureRevisitOrders.map((wo) => {
                const progress = getChecklistProgress(wo);
                const revisitDate = parseLocalDate(wo.sip_revisit_date);
                return (
                  <div key={wo.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <CalendarClock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <button type="button" data-sips-job-focus-id={wo.id} onClick={() => setSelectedWorkOrder(wo)} className="min-h-11 font-semibold text-gray-900 hover:text-blue-600 text-left flex items-center gap-1 max-w-full touch-manipulation">
                          <LinkIcon className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                          <span className="truncate">{wo.client_name || "Unnamed"}</span>
                        </button>
  
                      </div>
                    </div>

                    <MobileDescription value={wo.description || wo.current_task_description} />

                    <div className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-amber-600 font-medium">Returns to active SIPs</div>
                      <div className="text-base font-bold text-amber-800 mt-0.5">{revisitDate && !isNaN(revisitDate) ? format(revisitDate, "MMM d, yyyy") : "Date unavailable"}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-xs">
                      <div><span className="text-gray-400 block">Deadline</span><span className="font-medium text-gray-700">{wo.current_task_deadline ? format(parseLocalDate(wo.current_task_deadline), "MM/dd/yy") : "—"}</span></div>
                      <div><span className="text-gray-400 block">PM</span><span className="font-medium text-gray-700 truncate block">{wo.project_manager || "—"}</span></div>
                      <div><span className="text-gray-400 block">Amount</span><span className="font-medium text-gray-700">{wo.estimate_amount ? `$${wo.estimate_amount.toLocaleString()}` : "—"}</span></div>
                      <div><span className="text-gray-400 block">Checklist</span><span className="font-medium text-gray-700">{progress.completed}/{progress.total}</span></div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-amber-100">
                      <Button variant="outline" size="sm" onClick={() => openChecklist(wo)} className="min-h-11 justify-center bg-white touch-manipulation">
                        <ClipboardList className="w-4 h-4 mr-2 text-blue-600" />Checklist {progress.completed}/{progress.total}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSelectedWorkOrder(wo)} className="min-h-11 justify-center bg-white touch-manipulation">Open Work Order</Button>
                    </div>

                    <Popover
                      open={openDatePopover === `revisit-future-mobile-${wo.id}`}
                      onOpenChange={(open) => setOpenDatePopover(open ? `revisit-future-mobile-${wo.id}` : null)}
                    >
                      <PopoverTrigger asChild disabled={!isRegistered || savingRevisitIds.has(wo.id)}>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={savingRevisitIds.has(wo.id)}
                          aria-busy={savingRevisitIds.has(wo.id)}
                          className="w-full min-h-11 mt-2 text-amber-700 hover:bg-amber-100 touch-manipulation"
                        >
                          {savingRevisitIds.has(wo.id) ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving revisit date…</>
                          ) : "Change Revisit Date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          required
                          selected={parseLocalDate(wo.sip_revisit_date)}
                          disabled={savingRevisitIds.has(wo.id) || reopeningWipIds.has(wo.id) ? true : { before: addDays(today, 1) }}
                          onSelect={(date) => {
                            if (!date) return;
                            updateWorkOrder(wo.id, "sip_revisit_date", format(date, "yyyy-MM-dd"));
                            setOpenDatePopover(null);
                          }}
                        />
                        <div className="p-2 border-t">
                          <button type="button" disabled={!isRegistered || savingRevisitIds.has(wo.id) || reopeningWipIds.has(wo.id)} onClick={() => requestClearRevisit(wo)} className="min-h-11 px-3 text-xs text-red-600 hover:underline w-full text-center touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed">Clear date & return to active</button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                );
              })}
            </div>

            <div className="hidden lg:block overflow-x-hidden">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col style={{ width: '6%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead className="bg-amber-50">
                <tr className="border-b">
                  <th className="px-1 py-2 border-r text-center font-medium text-amber-700">✓</th>
                  <th className="px-1 py-2 border-r text-center font-medium text-amber-700">Checklist</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-amber-700">Customer</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-amber-700">Job Description</th>
                  <th className="px-1 py-2 border-r text-left font-medium text-amber-700">Deadline</th>
                  <th className="px-1 py-2 border-r text-left font-medium text-amber-700">PM</th>
                  <th className="px-1 py-2 border-r text-left font-medium text-amber-700">Amount</th>
                  <th className="px-1 py-2 text-left font-bold text-amber-700" style={{ background: '#fef3c7' }}>📅 Revisit</th>
                </tr>
              </thead>
              <tbody>
                {visibleFutureRevisitOrders.map((wo) => {
                  const progress = getChecklistProgress(wo);
                  return (
                    <tr key={wo.id} className="border-b hover:bg-amber-50/50 bg-yellow-50/30">
                      <td className="px-2 py-2 border-r text-center">
                        <Checkbox checked={wo.sip_completed || false} onCheckedChange={() => toggleSipCompleted(wo)} disabled={!isRegistered} className="h-5 w-5" />
                      </td>
                      <td className="px-2 py-2 border-r text-center">
                        <Button variant="outline" onClick={() => openChecklist(wo)} className="h-8 w-full flex flex-col items-center justify-center gap-0.5 hover:bg-blue-50 p-1">
                          <ClipboardList className="w-3.5 h-3.5 text-blue-600" />
                          <span className="text-xs">{progress.completed}/{progress.total}</span>
                        </Button>
                      </td>
                      <td className="px-2 py-2 border-r">
                        <button type="button" data-sips-job-focus-id={wo.id} onClick={() => setSelectedWorkOrder(wo)} className="text-sm text-left hover:text-blue-600 flex items-center gap-1 font-medium w-full truncate">
                          <LinkIcon className="w-3 h-3 flex-shrink-0 text-blue-500" />
                          <span className="truncate">{wo.client_name || "Unnamed"}</span>
                        </button>
                      </td>
                      <td className="px-2 py-2 border-r min-w-0"><CondensedDescription value={wo.description} /></td>
                      <td className="px-2 py-2 border-r text-sm">{wo.current_task_deadline ? format(parseLocalDate(wo.current_task_deadline), "MM/dd/yy") : "-"}</td>
                      <td className="px-2 py-2 border-r text-sm truncate">{wo.project_manager || "-"}</td>
                      <td className="px-2 py-2 border-r text-sm">{wo.estimate_amount ? `$${wo.estimate_amount.toLocaleString()}` : "-"}</td>
                      <td className="px-2 py-2" style={{ background: '#fef9c3' }}>
                        <Popover
                          open={openDatePopover === `revisit-future-${wo.id}`}
                          onOpenChange={(open) => setOpenDatePopover(open ? `revisit-future-${wo.id}` : null)}
                        >
                          <PopoverTrigger asChild disabled={!isRegistered || savingRevisitIds.has(wo.id)}>
                            <button type="button" disabled={savingRevisitIds.has(wo.id)} aria-busy={savingRevisitIds.has(wo.id)} className="h-8 w-full text-sm text-left px-1 hover:bg-yellow-100 rounded font-bold text-amber-700 disabled:opacity-60">
                              {savingRevisitIds.has(wo.id) ? "Saving…" : (wo.sip_revisit_date ? (() => { const d = parseLocalDate(wo.sip_revisit_date); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-")}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              required
                              selected={parseLocalDate(wo.sip_revisit_date)}
                              disabled={savingRevisitIds.has(wo.id) || reopeningWipIds.has(wo.id) ? true : { before: addDays(today, 1) }}
                              onSelect={(date) => {
                                if (!date) return;
                                updateWorkOrder(wo.id, "sip_revisit_date", format(date, "yyyy-MM-dd"));
                                setOpenDatePopover(null);
                              }}
                            />
                            <div className="p-2 border-t">
                              <button type="button" disabled={!isRegistered || savingRevisitIds.has(wo.id) || reopeningWipIds.has(wo.id)} onClick={() => requestClearRevisit(wo)} className="text-xs text-red-500 hover:underline w-full text-center disabled:opacity-50 disabled:cursor-not-allowed">Clear date</button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* Completed WIP Items Section */}
        {visibleCompletedWipItems.length > 0 && (
          <div className="clay-card p-3 sm:p-4 w-full mt-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" />Completed WIP Items ({visibleCompletedWipItems.length})</h3>

            <div className="lg:hidden space-y-3">
              {visibleCompletedWipItems.map((wo) => {
                const progress = getChecklistProgress(wo);
                return (
                <div key={wo.id} className="rounded-xl border border-green-200 bg-green-50/40 p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-green-100 text-green-700 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <button type="button" data-sips-job-focus-id={wo.id} onClick={() => setSelectedWorkOrder(wo)} className="min-h-11 font-semibold text-gray-900 hover:text-blue-600 text-left flex items-center gap-1 max-w-full touch-manipulation">
                        <LinkIcon className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                        <span className="truncate">{wo.client_name || "Unnamed"}</span>
                      </button>

                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggleSipCompleted(wo)}
                      disabled={!isRegistered || reopeningWipIds.has(wo.id) || savingRevisitIds.has(wo.id)}
                      aria-busy={reopeningWipIds.has(wo.id)}
                      className="min-h-11 px-2.5 shrink-0 text-xs bg-white border-green-200 text-green-700 hover:bg-green-50 touch-manipulation"
                      aria-label={`${reopeningWipIds.has(wo.id) ? "Reopening" : "Reopen"} ${wo.client_name || "this Work Order"} in the active SIPs queue`}
                    >
                      {reopeningWipIds.has(wo.id) ? (
                        <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Reopening…</>
                      ) : "Reopen"}
                    </Button>
                  </div>

                  <MobileDescription
                    value={wo.current_task_description || wo.description}
                    fallback="No task description"
                    label="Task description"
                  />

                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-100 bg-white px-3 py-2 text-xs">
                    <ClipboardList className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                    <span className="text-gray-500">Checklist</span>
                    <span className="font-semibold text-gray-700">
                      {progress.total > 0 ? `${progress.completed}/${progress.total} completed` : "No checklist items"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-xs">
                    <div><span className="text-gray-400 block">Deadline</span><span className="font-medium text-gray-700">{wo.current_task_deadline ? format(parseLocalDate(wo.current_task_deadline), "MM/dd/yy") : "—"}</span></div>
                    <div><span className="text-gray-400 block">PM</span><span className="font-medium text-gray-700 truncate block">{wo.project_manager || "—"}</span></div>
                    <div><span className="text-gray-400 block">Designer</span><span className="font-medium text-gray-700 truncate block">{wo.designer || "—"}</span></div>
                    <div><span className="text-gray-400 block">Amount</span><span className="font-medium text-gray-700">{wo.estimate_amount ? `$${wo.estimate_amount.toLocaleString()}` : "—"}</span></div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-green-100">
                    <Button variant="outline" size="sm" onClick={() => setSelectedWorkOrder(wo)} className="w-full min-h-11 justify-center bg-white touch-manipulation">Open Work Order</Button>
                  </div>
                  {isRegistered && <p className="text-[11px] text-gray-500 text-center mt-2">Reopen returns this WIP item to the active queue.</p>}
                </div>
                );
              })}
            </div>

            <div className="hidden lg:block overflow-x-hidden">
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col style={{ width: '7%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '7%' }} />
              </colgroup>
              <thead className="bg-gray-50">
                <tr className="border-b">
                  <th className="px-1 py-2 border-r text-center font-medium text-gray-600">Completed</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-gray-600">Customer</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-gray-600">Task Description</th>
                  <th className="px-1 py-2 border-r text-left font-medium text-gray-600">Deadline</th>
                  <th className="px-1 py-2 border-r text-left font-medium text-gray-600">Designer</th>
                  <th className="px-1 py-2 border-r text-left font-medium text-gray-600">PM</th>
                  <th className="px-1 py-2 text-left font-medium text-gray-600">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visibleCompletedWipItems.map((wo) => (
                  <tr key={wo.id} className="border-b hover:bg-gray-50 bg-green-50/30">
                    <td className="px-2 py-2 border-r text-center">
                      <Checkbox
                        checked={true}
                        onCheckedChange={() => toggleSipCompleted(wo)}
                        disabled={!isRegistered || reopeningWipIds.has(wo.id) || savingRevisitIds.has(wo.id)}
                        aria-busy={reopeningWipIds.has(wo.id)}
                        aria-label={`${reopeningWipIds.has(wo.id) ? "Reopening" : "Reopen"} ${wo.client_name || "this Work Order"} in active SIPs`}
                        className="h-4 w-4"
                      />
                      {reopeningWipIds.has(wo.id) && <Loader2 className="w-3.5 h-3.5 mx-auto mt-1 animate-spin text-green-700" aria-hidden="true" />}
                    </td>
                    <td className="px-2 py-2 border-r" style={{ maxWidth: '150px' }}>
                      <button type="button"
                        data-sips-job-focus-id={wo.id}
                        onClick={() => setSelectedWorkOrder(wo)}
                        className="text-xs text-left hover:text-blue-600 flex items-center gap-1 font-medium w-full"
                      >
                        <LinkIcon className="w-3 h-3 flex-shrink-0 text-blue-500" />
                        <span className="truncate block">{wo.client_name || "Unnamed"}</span>
                      </button>
                    </td>
                    <td className="px-2 py-2 border-r text-xs" style={{ maxWidth: '150px' }}><span className="truncate block">{wo.current_task_description || "-"}</span></td>
                    <td className="px-2 py-2 border-r text-xs">
                      {wo.current_task_deadline ? (() => { const d = parseLocalDate(wo.current_task_deadline); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}
                    </td>
                    <td className="px-2 py-2 border-r text-xs truncate">{wo.designer || "-"}</td>
                    <td className="px-2 py-2 border-r text-xs truncate">{wo.project_manager || "-"}</td>
                    <td className="px-2 py-2 text-xs">
                      {wo.estimate_amount ? `$${wo.estimate_amount.toLocaleString()}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
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
                label: "SIPs details stage transition",
              });
            } catch (error) {
              console.error("Error moving SIPs Work Order:", error);
              setActionError({
                title: "Could not move Work Order",
                message: error?.message || "This Work Order changed in another session. Reload and try the transition again."
              });
            }
            loadWorkOrders();
          }}
          onSplit={async (wo) => {
            try {
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
                label: "SIPs rider Work Order",
              });
            } catch (error) {
              console.error("Error creating SIPs rider Work Order:", error);
              setActionError({
                title: "Could not create rider",
                message: error?.message || "The rider Work Order could not be created. Reload the latest Work Order and try again."
              });
            }
            loadWorkOrders();
          }}
          onComplete={async (wo) => {
            try {
              await transitionWorkOrderFromLoadedSnapshot({
                workOrder: wo,
                newStage: wo.current_stage,
                completed: true,
                label: "SIPs details completion",
              });
            } catch (error) {
              console.error("Error completing SIPs Work Order:", error);
              setActionError({
                title: "Could not complete Work Order",
                message: error?.message || "This Work Order changed in another session. Reload and try completion again."
              });
            }
            loadWorkOrders();
          }}
          onDelete={async (wo) => {
            try {
              const deleted = await softDeleteWorkOrderFromLoadedSnapshot({
                workOrder: wo,
                deletedBy: currentUser?.email || "unknown",
                label: "SIPs details Work Order delete",
              });
              Object.assign(wo, deleted);
            } catch (error) {
              console.error("Error deleting SIPs Work Order:", error);
              setActionError({
                title: "Could not delete Work Order",
                message: error?.message || "This Work Order changed in another session. Reload before deleting it."
              });
            }
            loadWorkOrders();
          }}
        />
      )}

      <AlertDialog
        open={!!pendingRevisitClear}
        onOpenChange={(open) => {
          if (!open && !isClearingRevisit) {
            setPendingRevisitClear(null);
            setRevisitClearFailure(null);
          }
        }}
      >
        <AlertDialogContent
          className="clay-card w-[calc(100vw-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto border-none p-4 sm:p-6"
          onCloseAutoFocus={(event) => {
            // There is no Radix AlertDialogTrigger: the request came from a
            // calendar popover that closes before this dialog. Return keyboard
            // users to a stable, visible board heading after dismissal.
            event.preventDefault();
            revisitClearBoardRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="flex min-w-0 items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
              {pendingRevisitClear?.returnsToActive ? "Return this item to active SIPs?" : "Clear revisit date?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {pendingRevisitClear?.returnsToActive
                ? `Clearing the revisit date for ${pendingRevisitClear.clientName} will move it out of Revisit Later and back into the active SIPs queue.`
                : `This removes the saved revisit date for ${pendingRevisitClear?.clientName || "this Work Order"}. The item will remain in the active SIPs queue.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revisitClearFailure && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <p className="font-semibold">{revisitClearFailure.requiresReview ? "Revisit date could not be cleared" : "Clear Revisit is temporarily blocked"}</p>
              <p className="mt-1 break-words">{revisitClearFailure.message}</p>
              {revisitClearFailure.requiresReview && (
                <p className="mt-2 text-xs font-medium">No newer date was cleared. Close this dialog and review the refreshed board before confirming a new change.</p>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel ref={revisitClearCancelRef} disabled={isClearingRevisit} className="min-h-11 touch-manipulation">
              {revisitClearFailure?.requiresReview ? "Close & review board" : "Keep revisit date"}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmClearRevisit}
              disabled={isClearingRevisit || revisitClearFailure?.requiresReview}
              className="min-h-11 touch-manipulation"
            >
              {isClearingRevisit && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {pendingRevisitClear?.returnsToActive ? "Clear & return to active" : "Clear revisit date"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!actionError} onOpenChange={(open) => { if (!open) setActionError(null); }}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {actionError?.title || "SIPs action could not be completed"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionError?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setActionError(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Product Checklist Dialog */}
      {checklistDialog.open && checklistDialog.workOrder && (
        <ProductChecklistDialog
          isOpen={checklistDialog.open}
          onClose={() => closeChecklistDialog(checklistDialog.workOrder)}
          workOrder={checklistDialog.workOrder}
          onUpdate={() => loadWorkOrders(false)}
          isRegistered={isRegistered}
          isAdmin={currentUser?.role === 'admin'}
        />
      )}

      {/* Template Builder */}
      {showTemplateBuilder && (
        <TemplateBuilder
          isOpen={showTemplateBuilder}
          onClose={() => setShowTemplateBuilder(false)}
          isAdmin={currentUser?.role === "admin"}
        />
      )}
    </div>
  );
}