import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
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
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import { createWorkOrderWithRecovery, replaceWorkOrderFieldsIfUnchanged, softDeleteWorkOrderFromLoadedSnapshot, transitionWorkOrderFromLoadedSnapshot } from "@/components/workflow/workOrderPersistence";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

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
  const [lastUpdated, setLastUpdated] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [pendingRevisitClear, setPendingRevisitClear] = useState(null);
  const [isClearingRevisit, setIsClearingRevisit] = useState(false);

  // Set document title
  useEffect(() => {
    document.title = "SIPs - Workflow Manager";
  }, []);

  useEffect(() => {
    loadWorkOrders();
    const interval = setInterval(() => loadWorkOrders(false), 60000);
    return () => clearInterval(interval);
  }, []);

  const loadWorkOrders = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    if (!showLoading) setIsRefreshing(true);
    setBoardError("");
    setChecklistConfigWarning("");
    try {
      const [orders, usersData, taskDescSetting, dropdownsSetting] = await Promise.all([
        loadAllEntityRows({
          entity: WorkOrder,
          query: { is_rider: false, completed: false, deleted: { $ne: true } },
          sort: "created_date",
          label: "SIPs Work Orders",
        }),
        loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "SIPs authorized users" }),
        loadSingleGlobalSetting({
          entity: base44.entities.GlobalSettings,
          settingKey: "salesTaskDescriptions",
          label: "SIPs sales task descriptions",
        }),
        loadSingleGlobalSetting({
          entity: base44.entities.GlobalSettings,
          settingKey: "dropdownConditions",
          label: "SIPs checklist dropdown conditions",
        })
          .then(setting => ({ setting, error: null }))
          .catch(error => ({ setting: null, error }))
      ]);
      
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
      setWipTaskDescriptions(wipDescs);
      if (dropdownsSetting?.error) {
        console.error("Error loading SIPs checklist dropdown conditions:", dropdownsSetting.error);
        setChecklistConfigWarning("Checklist status definitions could not refresh. Work Orders are current, but checklist progress may use the last loaded rules.");
      } else {
        setDropdownConditions(dropdownsSetting?.setting?.setting_value?.items || []);
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
      setWorkOrders(sipOrders.sort((a, b) => (b.created_date || "").localeCompare(a.created_date || "")));
      setUsers(usersData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error loading work orders:", error);
      setBoardError(error?.message || "SIPs could not refresh. The last loaded board is still shown.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const updateWorkOrder = async (orderId, field, value) => {
    const currentWo = workOrders.find((wo) => wo.id === orderId);
    if (!currentWo) return;
    const expectedValue = currentWo[field];
    setQuickEditError("");
    setWorkOrders(prev => prev.map(wo => wo.id === orderId ? { ...wo, [field]: value } : wo));
    try {
      const saved = await replaceWorkOrderFieldsIfUnchanged({
        workOrderId: orderId,
        expectedFields: { [field]: expectedValue },
        nextFields: { [field]: value },
        label: `SIPs ${field}`,
      });
      setWorkOrders((prev) => prev.map((wo) => wo.id === orderId ? { ...wo, ...saved } : wo));
    } catch (error) {
      console.error("Error updating SIPs Work Order field:", error);
      setQuickEditError(error?.message || "This Work Order field changed in another session. The latest value was reloaded.");
      await loadWorkOrders(false);
    }
  };

  // Check if a work order is a WIP item (has WIP task description)
  const isWipItem = (wo) => {
    return wo.current_task_description && wipTaskDescriptions.includes(wo.current_task_description);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isRevisitFuture = (wo) => {
    if (!wo.sip_revisit_date) return false;
    const d = parseLocalDate(wo.sip_revisit_date);
    return d && d > today;
  };

  // Completion must go through the checklist dialog so approvals, statuses,
  // child tasks, and concurrency-safe completion are validated consistently.
  // Reopening a completed WIP item returns it to the active queue. If legacy
  // completed data still carries a future revisit date, clear that stale date
  // atomically so reopening cannot immediately move it into Revisit Later.
  const toggleSipCompleted = async (wo) => {
    if (!wo.sip_completed) {
      openChecklist(wo);
      return;
    }

    if (!isRevisitFuture(wo)) {
      await updateWorkOrder(wo.id, "sip_completed", false);
      return;
    }

    setQuickEditError("");
    setWorkOrders(prev => prev.map(item => item.id === wo.id
      ? { ...item, sip_completed: false, sip_revisit_date: "" }
      : item));
    try {
      const saved = await replaceWorkOrderFieldsIfUnchanged({
        workOrderId: wo.id,
        expectedFields: {
          sip_completed: wo.sip_completed,
          sip_revisit_date: wo.sip_revisit_date,
        },
        nextFields: {
          sip_completed: false,
          sip_revisit_date: "",
        },
        label: "SIPs reopen completed WIP and clear stale revisit",
      });
      setWorkOrders(prev => prev.map(item => item.id === wo.id ? { ...item, ...saved } : item));
    } catch (error) {
      console.error("Error reopening completed SIP WIP item:", error);
      setQuickEditError(error?.message || "This Work Order changed in another session. The latest value was reloaded.");
      await loadWorkOrders(false);
    }
  };

  const requestClearRevisit = (wo) => {
    setOpenDatePopover(null);
    setPendingRevisitClear({
      id: wo.id,
      clientName: wo.client_name || "this Work Order",
      revisitDate: wo.sip_revisit_date,
      returnsToActive: isRevisitFuture(wo),
    });
  };

  const confirmClearRevisit = async () => {
    if (!pendingRevisitClear || isClearingRevisit) return;

    setIsClearingRevisit(true);
    setQuickEditError("");
    try {
      // Guard the date the user actually confirmed, not a newer date from a
      // background board refresh or another session's scheduling change.
      const saved = await replaceWorkOrderFieldsIfUnchanged({
        workOrderId: pendingRevisitClear.id,
        expectedFields: { sip_revisit_date: pendingRevisitClear.revisitDate },
        nextFields: { sip_revisit_date: "" },
        label: "SIPs clear confirmed revisit date",
      });
      setWorkOrders(prev => prev.map(wo => wo.id === pendingRevisitClear.id ? { ...wo, ...saved } : wo));
      setPendingRevisitClear(null);
    } catch (error) {
      console.error("Error clearing confirmed SIPs revisit date:", error);
      setQuickEditError(error?.message || "The revisit date may have changed. No newer date was cleared; review the refreshed board before trying again.");
      setPendingRevisitClear(null);
      await loadWorkOrders(false);
    } finally {
      setIsClearingRevisit(false);
    }
  };

  // All non-completed active items
  const allActive = workOrders.filter(wo => (!isWipItem(wo) || !wo.sip_completed));

  // Jobs with NO revisit date or revisit date <= today go to main active list
  const activeWorkOrders = allActive
    .filter(wo => !isRevisitFuture(wo))
    .sort((a, b) => {
      // No date => top; then sort ascending by revisit date
      if (!a.sip_revisit_date && !b.sip_revisit_date) return 0;
      if (!a.sip_revisit_date) return -1;
      if (!b.sip_revisit_date) return 1;
      return a.sip_revisit_date.localeCompare(b.sip_revisit_date);
    });

  // Jobs with a FUTURE revisit date
  const futureRevisitOrders = allActive
    .filter(wo => isRevisitFuture(wo))
    .sort((a, b) => a.sip_revisit_date.localeCompare(b.sip_revisit_date));
  const nextRevisitDate = futureRevisitOrders[0]?.sip_revisit_date
    ? parseLocalDate(futureRevisitOrders[0].sip_revisit_date)
    : null;

  const completedWipItems = workOrders.filter(wo => isWipItem(wo) && wo.sip_completed);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchesSearch = (wo) => {
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
  };

  const getDeadlineStatus = (dateString) => {
    const deadline = parseLocalDate(dateString);
    if (!deadline || Number.isNaN(deadline.getTime())) return null;
    const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
    if (diffDays < 0) return { bucket: "overdue", label: `${Math.abs(diffDays)}d overdue`, className: "bg-red-100 text-red-700 border-red-200" };
    if (diffDays === 0) return { bucket: "today", label: "Due today", className: "bg-red-100 text-red-700 border-red-200" };
    if (diffDays <= 7) return { bucket: "soon", label: `${diffDays}d left`, className: "bg-amber-100 text-amber-800 border-amber-200" };
    return { bucket: "future", label: null, className: "" };
  };

  const openChecklist = (wo) => {
    setChecklistDialog({ open: true, workOrder: wo });
  };

  const getChecklistProgress = (wo) => {
    const checklist = wo.sip_checklist || [];
    if (checklist.length === 0) return { completed: 0, total: 0 };
    
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
      const condition = dropdownConditions.find(dd => dd.name === item.custom_dropdown_value);
      return !condition || condition.is_completed;
    }).length;
    
    return { 
      completed: mainCompleted, 
      total: mainChecklistItems.length 
    };
  };

  const needsAttention = (wo) => {
    const deadlineStatus = getDeadlineStatus(wo.current_task_deadline);
    return Boolean(
      wo.asap ||
      deadlineStatus?.bucket === "overdue" ||
      ["at_risk", "delayed", "blocked"].includes(wo.project_health)
    );
  };

  const matchesStatusFilter = (wo) => {
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
  };

  const sortOrders = (orders) => [...orders].sort((a, b) => {
    if (sortMode === "deadline") {
      if (!a.current_task_deadline && !b.current_task_deadline) return 0;
      if (!a.current_task_deadline) return 1;
      if (!b.current_task_deadline) return -1;
      return a.current_task_deadline.localeCompare(b.current_task_deadline);
    }
    if (sortMode === "customer") return (a.client_name || "").localeCompare(b.client_name || "");
    if (sortMode === "amount") return Number(b.estimate_amount || 0) - Number(a.estimate_amount || 0);
    return 0;
  });

  const visibleActiveWorkOrders = sortOrders(
    activeWorkOrders.filter(matchesSearch).filter(matchesStatusFilter)
  );
  const visibleFutureRevisitOrders = futureRevisitOrders.filter(matchesSearch);
  const visibleCompletedWipItems = completedWipItems.filter(matchesSearch);
  const overdueCount = activeWorkOrders.filter((wo) => getDeadlineStatus(wo.current_task_deadline)?.bucket === "overdue").length;
  const dueSoonCount = activeWorkOrders.filter((wo) => ["today", "soon"].includes(getDeadlineStatus(wo.current_task_deadline)?.bucket)).length;
  const attentionCount = activeWorkOrders.filter(needsAttention).length;
  const incompleteChecklistCount = activeWorkOrders.filter((wo) => {
    const progress = getChecklistProgress(wo);
    return progress.total === 0 || progress.completed < progress.total;
  }).length;
  const activeValue = activeWorkOrders.reduce((sum, wo) => sum + Number(wo.estimate_amount || 0), 0);
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
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">SIPs Meeting Board</h1>
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
              <Button type="button" variant="outline" size="sm" onClick={() => loadWorkOrders(false)} disabled={isRefreshing} className="h-11 sm:h-8">
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
              onClick={() => loadWorkOrders(false)}
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
              onClick={() => loadWorkOrders(false)}
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
              onClick={async () => { setQuickEditError(""); await loadWorkOrders(false); }}
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
                <div key={wo.id} className={`rounded-xl border p-3 bg-white ${focusedRowId === wo.id ? "ring-2 ring-purple-400" : ""}`}>
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
                      <button onClick={() => setSelectedWorkOrder(wo)} className="min-h-11 font-semibold text-gray-900 hover:text-blue-600 text-left flex items-center gap-1 max-w-full touch-manipulation">
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
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <Button variant="ghost" size="sm" className="w-full min-h-11 mt-2 text-amber-700 hover:bg-amber-50 touch-manipulation">
                        <CalendarClock className="w-4 h-4 mr-2" />
                        {wo.sip_revisit_date ? "Change Revisit Date" : "Set Revisit Date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={parseLocalDate(wo.sip_revisit_date)}
                        disabled={{ before: addDays(today, 1) }}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "sip_revisit_date", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                      {wo.sip_revisit_date && (
                        <div className="p-2 border-t">
                          <button type="button" onClick={() => requestClearRevisit(wo)} className="min-h-11 px-3 text-xs text-red-600 hover:underline w-full text-center touch-manipulation">Clear revisit date</button>
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
                
                return (
                  <React.Fragment key={wo.id}>
                  {focusedRowId === wo.id && <tr><td colSpan={14} className="h-3 bg-transparent border-none"></td></tr>}
                  <tr 
                    className={`border-b ${focusedRowId !== wo.id ? 'hover:bg-gray-50' : ''} ${isWip && focusedRowId !== wo.id ? 'bg-blue-50/30' : ''} ${focusedRowId === wo.id ? 'ring-2 ring-purple-400 ring-inset bg-purple-50/50' : ''}`}
                    style={{ height: '50px' }}
                  >
                    {/* Row Number - Clickable Focus Button */}
                    <td className="px-0 py-0 border-r">
                      <button
                        onClick={() => setFocusedRowId(focusedRowId === wo.id ? null : wo.id)}
                        className={`w-full h-full px-2 py-2 text-center font-bold transition-colors ${
                          focusedRowId === wo.id 
                            ? 'bg-purple-500 text-white' 
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
                       <button
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
                        <PopoverTrigger asChild disabled={!isRegistered}>
                          <button className="min-h-8 w-full text-sm text-left px-1 py-1 hover:bg-gray-100 rounded font-medium flex flex-col items-start justify-center gap-0.5">
                            <span>{wo.current_task_deadline ? (() => { const d = parseLocalDate(wo.current_task_deadline); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}</span>
                            {deadlineStatus?.label && <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${deadlineStatus.className}`}>{deadlineStatus.label}</Badge>}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={parseLocalDate(wo.current_task_deadline)}
                            onSelect={(date) => {
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
                        disabled={!isRegistered}
                      >
                        <SelectTrigger className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
                          <SelectValue placeholder="-">{wo.current_task_assigned_to || "-"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SIPs">SIPs</SelectItem>
                          {users.filter(u => u.sales_roles?.includes("Task Assigned")).map(u => (
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
                        disabled={!isRegistered}
                      >
                        <SelectTrigger className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
                          <SelectValue placeholder="-">{wo.designer || "-"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {users.filter(u => u.sales_roles?.includes("Designer")).map(u => (
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
                        disabled={!isRegistered}
                      >
                        <SelectTrigger className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
                          <SelectValue placeholder="-">{wo.project_manager || "-"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {users.filter(u => u.sales_roles?.includes("Project Manager") || u.sales_roles?.includes("PM")).map(u => (
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
                        disabled={!isRegistered}
                      >
                        <SelectTrigger className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
                          <SelectValue placeholder="-">{wo.estimator || "-"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {users.filter(u => u.sales_roles?.includes("Estimator")).map(u => (
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
                        <PopoverTrigger asChild disabled={!isRegistered}>
                          <button className="h-8 w-full text-sm text-left px-1 hover:bg-gray-100 rounded font-medium">
                            {wo.site_survey_date ? (() => { const d = parseLocalDate(wo.site_survey_date); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={parseLocalDate(wo.site_survey_date)}
                            onSelect={(date) => {
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
                        <PopoverTrigger asChild disabled={!isRegistered}>
                          <button className={`h-8 w-full text-sm text-left px-1 hover:bg-yellow-100 rounded font-medium ${wo.sip_revisit_date ? 'text-amber-700' : 'text-gray-400'}`}>
                            {wo.sip_revisit_date ? (() => { const d = parseLocalDate(wo.sip_revisit_date); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={parseLocalDate(wo.sip_revisit_date)}
                            disabled={{ before: addDays(today, 1) }}
                            onSelect={(date) => {
                              updateWorkOrder(wo.id, "sip_revisit_date", date ? format(date, "yyyy-MM-dd") : "");
                              setOpenDatePopover(null);
                            }}
                          />
                          {wo.sip_revisit_date && (
                            <div className="p-2 border-t">
                              <button
                                onClick={() => requestClearRevisit(wo)}
                                className="text-xs text-red-500 hover:underline w-full text-center"
                              >
                                Clear date
                              </button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </td>
                  </tr>
                  {focusedRowId === wo.id && <tr><td colSpan={14} className="h-3 bg-transparent border-none"></td></tr>}
                  </React.Fragment>
                );
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
                        <button onClick={() => setSelectedWorkOrder(wo)} className="min-h-11 font-semibold text-gray-900 hover:text-blue-600 text-left flex items-center gap-1 max-w-full touch-manipulation">
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
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <Button variant="ghost" size="sm" className="w-full min-h-11 mt-2 text-amber-700 hover:bg-amber-100 touch-manipulation">Change Revisit Date</Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={parseLocalDate(wo.sip_revisit_date)}
                          disabled={{ before: addDays(today, 1) }}
                          onSelect={(date) => {
                            updateWorkOrder(wo.id, "sip_revisit_date", date ? format(date, "yyyy-MM-dd") : "");
                            setOpenDatePopover(null);
                          }}
                        />
                        <div className="p-2 border-t">
                          <button type="button" onClick={() => requestClearRevisit(wo)} className="min-h-11 px-3 text-xs text-red-600 hover:underline w-full text-center touch-manipulation">Clear date & return to active</button>
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
                        <button onClick={() => setSelectedWorkOrder(wo)} className="text-sm text-left hover:text-blue-600 flex items-center gap-1 font-medium w-full truncate">
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
                          <PopoverTrigger asChild disabled={!isRegistered}>
                            <button className="h-8 w-full text-sm text-left px-1 hover:bg-yellow-100 rounded font-bold text-amber-700">
                              {wo.sip_revisit_date ? (() => { const d = parseLocalDate(wo.sip_revisit_date); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={parseLocalDate(wo.sip_revisit_date)}
                              disabled={{ before: addDays(today, 1) }}
                              onSelect={(date) => {
                                updateWorkOrder(wo.id, "sip_revisit_date", date ? format(date, "yyyy-MM-dd") : "");
                                setOpenDatePopover(null);
                              }}
                            />
                            <div className="p-2 border-t">
                              <button onClick={() => requestClearRevisit(wo)} className="text-xs text-red-500 hover:underline w-full text-center">Clear date</button>
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
                      <button onClick={() => setSelectedWorkOrder(wo)} className="min-h-11 font-semibold text-gray-900 hover:text-blue-600 text-left flex items-center gap-1 max-w-full touch-manipulation">
                        <LinkIcon className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                        <span className="truncate">{wo.client_name || "Unnamed"}</span>
                      </button>

                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggleSipCompleted(wo)}
                      disabled={!isRegistered}
                      className="min-h-11 px-2.5 shrink-0 text-xs bg-white border-green-200 text-green-700 hover:bg-green-50 touch-manipulation"
                      aria-label={`Reopen ${wo.client_name || "this Work Order"} in the active SIPs queue`}
                    >
                      Reopen
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
                        disabled={!isRegistered}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-2 py-2 border-r" style={{ maxWidth: '150px' }}>
                      <button
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
          onClose={() => setSelectedWorkOrder(null)}
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
          if (!open && !isClearingRevisit) setPendingRevisitClear(null);
        }}
      >
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {pendingRevisitClear?.returnsToActive ? "Return this item to active SIPs?" : "Clear revisit date?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRevisitClear?.returnsToActive
                ? `Clearing the revisit date for ${pendingRevisitClear.clientName} will move it out of Revisit Later and back into the active SIPs queue.`
                : `This removes the saved revisit date for ${pendingRevisitClear?.clientName || "this Work Order"}. The item will remain in the active SIPs queue.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearingRevisit} className="min-h-11 touch-manipulation">Keep revisit date</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmClearRevisit}
              disabled={isClearingRevisit}
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
          onClose={() => setChecklistDialog({ open: false, workOrder: null })}
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