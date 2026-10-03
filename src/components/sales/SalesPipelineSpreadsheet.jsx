import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format, differenceInDays } from "date-fns";
import * as XLSX from "xlsx";
import { Plus, Trash2, Loader2, Download, Upload, Pencil, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

// Helper to parse date string as local date (not UTC)
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  if (dateString instanceof Date) return isNaN(dateString.getTime()) ? undefined : dateString;
  if (typeof dateString !== 'string') return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import WorkOrderForm from "@/components/workflow/WorkOrderForm";
import { useCellHistoryTracker } from "@/components/shared/CellContextMenu";
import { useColumnSorting } from "@/components/shared/ColumnHeaderContextMenu";
import { applyRules } from "@/components/admin/TaskAssignmentRules";
import SalesPipelineMobileCards from "@/components/sales/SalesPipelineMobileCards";
import SalesPipelineKanban from "@/components/sales/SalesPipelineKanban";
import SalesPipelineInsights from "@/components/sales/SalesPipelineInsights";
import SalesDailyQueue from "@/components/sales/SalesDailyQueue";
import { getStageAgeDays, isStageAgedOpportunity, STAGE_AGING_DAYS } from "@/components/sales/salesStageAging";
import { getQuoteAgeDays, getQuoteAgingState, isQuoteAwaitingResponse, QUOTE_REVIEW_DAYS } from "@/components/sales/salesQuoteAging";
import { getSalesAttentionScore, hasSalesAttention } from "@/components/sales/salesAttention";
import { isCurrentPipelineOpportunity, isLegacyClosedSalesRecord, isTrustedSalesOutcome } from "@/components/sales/salesRecordScopes";
import { isLikelySalesPlaceholder } from "@/components/sales/salesPlaceholder";
import SalesOpportunityDialog from "@/components/sales/SalesOpportunityDialog";
import SalesStatusTransitionDialog from "@/components/sales/SalesStatusTransitionDialog";
import SalesFollowUpCompleteDialog from "@/components/sales/SalesFollowUpCompleteDialog";
import SalesPipelineTableBody from "@/components/sales/SalesPipelineTableBody";
import { getVisibleSalesColumnIds, getSalesColumnLayout } from "@/components/sales/salesColumnCatalog.mjs";
import { isSalesDateFilterField, salesDateFilterEquals, compareSalesDateFilterRange } from "@/components/sales/salesDateFilterRange.mjs";
import { personValuesReferToSameUser } from "@/components/admin/smartsheetTranslationModel.js";
import { buildSalesPersonSelectModel, salesPersonSearchText, salesPersonUsersForRole } from "@/components/sales/salesPersonIdentity.mjs";
import SalesPipelineDialogsAndEditList from "@/components/sales/SalesPipelineDialogsAndEditList";
import SalesImportPreviewDialog from "@/components/sales/SalesImportPreviewDialog";
import SalesImportHistoryDialog from "@/components/sales/SalesImportHistoryDialog";
import { useImportProgress } from "@/components/shared/ImportProgressContext";
import { loadAllEntityRows, withRateLimitRetry } from "@/components/estimator/loadAllEntityRows";
import { createWorkOrderWithRecovery, replaceWorkOrderFieldsIfUnchanged, softDeleteWorkOrderFromLoadedSnapshot, transitionWorkOrderFromLoadedSnapshot } from "@/components/workflow/workOrderPersistence";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/shared/globalSettingsPersistence";
import { loadSalesPersonRosterSafely } from "@/components/sales/salesFilterPersistence";
import { pushSavedSalesToSmartsheet, summarizeSavedSalesSync } from "@/components/sales/salesSaveSync";
import {
  createOrExtendSalesLiveEditPin,
  projectSalesRowForLiveView,
  reconcileSalesLiveEditPinWithRemote,
  salesLiveEditPinChanged,
} from "@/components/sales/salesLiveEditView.mjs";

const WorkOrder = base44.entities.WorkOrder;
const GlobalSettings = base44.entities.GlobalSettings;

const SALES_STATUSES = [
  { value: "lead", label: "Lead", color: "bg-blue-100" },
  { value: "quoted", label: "Quoted", color: "bg-yellow-100" },
  { value: "follow_up", label: "Follow Up", color: "bg-orange-100" },
  { value: "won", label: "Won", color: "bg-green-100" },
  { value: "lost", label: "Lost", color: "bg-red-100" },
  { value: "on_hold", label: "On Hold", color: "bg-gray-100" }
];

const SALES_ACTIVITY_FIELDS = new Set([
  "sales_status",
  "sales_rep",
  "lead_source",
  "estimate_amount",
  "date_estimate_sent",
  "follow_up_date",
  "sales_last_follow_up_completed_at",
  "sales_last_follow_up_outcome",
  "close_date",
  "expected_close_date",
  "lost_reason",
  "current_task_description",
  "current_task_deadline",
  "current_task_assigned_to",
  "in_pipeline",
]);
const INTERNAL_SALES_TRACKING_FIELDS = new Set(["sales_last_activity_at", "sales_stage_changed_at"]);
const CLOSEOUT_HISTORICAL_FIELDS = new Set([
  "date_estimate_sent",
  "follow_up_date",
  "expected_close_date",
  "close_date",
  "lost_reason",
  "current_task_description",
  "current_task_deadline",
  "current_task_assigned_to",
]);
const STALE_ACTIVITY_DAYS = 14;
const NEAR_CLOSE_DAYS = 14;
const ARCHIVE_PAGE_SIZE = 250;
const LEGACY_CLOSED_QUERY = {
  is_rider: false,
  in_pipeline: { $ne: true },
  current_task_description: { $regex: "^(lost\\b|completed sale\\b|closed\\b)", $options: "i" },
  deleted: { $ne: true },
};
const ALL_RECORDS_ACTIVE_QUERY = { is_rider: false, completed: false, deleted: { $ne: true } };
const SALES_USER_FILTER_ROLES = Object.freeze({
  sales_rep: null,
  current_task_assigned_to: "Task Assigned",
  designer: "Designer",
  project_manager: "PM",
  estimator: "Estimator",
});

const salesFilterUsersForField = (field, users = []) => {
  if (!Object.prototype.hasOwnProperty.call(SALES_USER_FILTER_ROLES, field)) return [];
  return salesPersonUsersForRole(users, SALES_USER_FILTER_ROLES[field]);
};

const isSalesUserFilterField = (field) => Object.prototype.hasOwnProperty.call(SALES_USER_FILTER_ROLES, field);

const salesRecordBelongsToLoadedScope = (workOrder, scope) => {
  if (!workOrder || workOrder.deleted === true || workOrder.is_rider === true) return false;
  if (scope === "current") return workOrder.completed !== true && isCurrentPipelineOpportunity(workOrder);
  if (scope === "outcomes") return isTrustedSalesOutcome(workOrder);
  if (scope === "history") return isLegacyClosedSalesRecord(workOrder);
  return workOrder.completed === false || isTrustedSalesOutcome(workOrder) ||
    (workOrder.completed === true && isLegacyClosedSalesRecord(workOrder));
};

const getSalesActivityTime = (workOrder) => {
  const parsed = Date.parse(workOrder?.sales_last_activity_at || "");
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeOwnerIdentity = (value) => String(value || "").trim().toLowerCase();
const getOpportunityAgeDays = (workOrder, todayStamp) => {
  const createdStamp = String(workOrder?.created_date || "").slice(0, 10);
  const created = parseLocalDate(createdStamp);
  const today = parseLocalDate(todayStamp);
  if (!created || !today || isNaN(created.getTime()) || isNaN(today.getTime())) return null;
  return Math.max(0, differenceInDays(today, created));
};

const matchesAttentionFilter = (workOrder, attentionFilter, todayStamp, upcomingStamp, nearCloseStamp, staleCutoffTime, currentOwnerIdentities) => {
  if (!attentionFilter || attentionFilter === "all") return true;
  const followUp = workOrder?.follow_up_date || "";
  const isOperational = isCurrentPipelineOpportunity(workOrder);
  if (attentionFilter === "due") return isOperational && followUp && followUp <= todayStamp;
  if (attentionFilter === "overdue") return isOperational && followUp && followUp < todayStamp;
  if (attentionFilter === "today") return isOperational && followUp === todayStamp;
  if (attentionFilter === "upcoming") return isOperational && followUp > todayStamp && followUp <= upcomingStamp;
  if (attentionFilter === "quote_no_followup") {
    return isOperational && !followUp && isQuoteAwaitingResponse(workOrder);
  }
  if (attentionFilter === "quote_aged") {
    const quoteAge = getQuoteAgeDays(workOrder, parseLocalDate(todayStamp));
    return isOperational && quoteAge !== null && quoteAge >= QUOTE_REVIEW_DAYS;
  }
  if (attentionFilter === "quote_timing_missing") {
    return isOperational && isQuoteAwaitingResponse(workOrder) && getQuoteAgeDays(workOrder, parseLocalDate(todayStamp)) === null;
  }
  if (attentionFilter === "needs_attention") return isOperational && hasSalesAttention(workOrder, parseLocalDate(todayStamp));
  if (attentionFilter === "placeholder") return isOperational && isLikelySalesPlaceholder(workOrder);
  if (attentionFilter === "no_next_action") return isOperational && !followUp && !workOrder?.current_task_deadline;
  if (attentionFilter === "near_close") return isOperational && workOrder?.expected_close_date >= todayStamp && workOrder?.expected_close_date <= nearCloseStamp;
  if (attentionFilter === "close_overdue") return isOperational && workOrder?.expected_close_date && workOrder.expected_close_date < todayStamp;
  if (attentionFilter === "stale") {
    const activityTime = getSalesActivityTime(workOrder);
    return isOperational && activityTime !== null && activityTime <= staleCutoffTime;
  }
  if (attentionFilter === "activity_untracked") return isOperational && getSalesActivityTime(workOrder) === null;
  if (attentionFilter === "stage_aged") return isOperational && isStageAgedOpportunity(workOrder, parseLocalDate(todayStamp));
  if (attentionFilter === "stage_untracked") return isOperational && getStageAgeDays(workOrder, parseLocalDate(todayStamp)) === null;
  if (attentionFilter === "owner_unassigned") return isOperational && !normalizeOwnerIdentity(workOrder?.sales_rep);
  if (attentionFilter === "source_missing") return isOperational && !String(workOrder?.lead_source || "").trim();
  if (attentionFilter === "age_90_plus") {
    const ageDays = getOpportunityAgeDays(workOrder, todayStamp);
    return isOperational && ageDays !== null && ageDays >= 90;
  }
  if (attentionFilter === "mine") {
    const owner = normalizeOwnerIdentity(workOrder?.sales_rep);
    return isOperational && Boolean(owner) && currentOwnerIdentities.has(owner);
  }
  return true;
};

const SalesPipelineSpreadsheet = React.forwardRef(({ searchTerm = "", filterStatus = "all", recordScope = "current", attentionFilter = "all", outcomePeriod = "all", viewMode = "table", onSummaryChange, showButtonsInline = true, activeColumnPreset = null, customFilters = [], canImportExport = false }, ref) => {
  const { currentUser, sessionToken, isRegistered } = useAuth();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [archiveHasMore, setArchiveHasMore] = useState(false);
  const [archiveLoadingMore, setArchiveLoadingMore] = useState(false);
  const archiveSkipRef = useRef(0);
  const loadRequestRef = useRef(0);
  const activeRecordScopeRef = useRef(recordScope);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const selectedQueueIndexRef = useRef(null);
  const [showFullWorkOrderDetails, setShowFullWorkOrderDetails] = useState(false);
  const [statusTransition, setStatusTransition] = useState(null);
  const [followUpCompletion, setFollowUpCompletion] = useState(null);
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const fileInputRef = useRef(null);
  const [editDialog, setEditDialog] = useState({ open: false, field: "", items: [] });
  const [editInput, setEditInput] = useState("");
  const [editingItem, setEditingItem] = useState({ index: null, value: "" });
  const pendingChangesRef = useRef({});
  const pendingBaselinesRef = useRef({});
  const pendingHistoryFieldsRef = useRef({});
  const pendingRecordScopesRef = useRef({});
  const debounceTimers = useRef({});
  const liveEditPinsRef = useRef({});
  const [liveEditPinVersion, setLiveEditPinVersion] = useState(0);
  const pendingSyncIdsRef = useRef(new Set());
  const pendingSyncVersionRef = useRef(new Map());
  const syncInFlightRef = useRef(false);
  const [quickEditError, setQuickEditError] = useState("");
  const [destructiveActionError, setDestructiveActionError] = useState("");
  const [exportProgress, setExportProgress] = useState({ show: false, progress: 0 });
  const [importPreview, setImportPreview] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importPreflightBusy, setImportPreflightBusy] = useState(false);
  const [importApplyBusy, setImportApplyBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [showImportHistory, setShowImportHistory] = useState(false);
  const { startImport: startTrackedImport, completeImport: refreshTrackedImport } = useImportProgress();
  const [showForm, setShowForm] = useState(false);
  const [duplicateData, setDuplicateData] = useState(null); // For duplicating a client
  const [clearDateConfirm, setClearDateConfirm] = useState(null);
  const [focusedRowId, setFocusedRowId] = useState(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [headerContextMenu, setHeaderContextMenu] = useState(null);
  const [showGradientDialog, setShowGradientDialog] = useState(false);
  const [deadlineGradientSettings, setDeadlineGradientSettings] = useState({
    enabled: true,
    baseColor: "#ffffff",
    dueColor: "#fecaca",
    overdueColor: "#ef4444",
    gradientDays: 14
  });
  const [globalSettingsLoaded, setGlobalSettingsLoaded] = useState(false);
  const [globalSettingsError, setGlobalSettingsError] = useState("");
  const globalSettingsBaselinesRef = useRef({});
  const globalSettingsSaveQueuesRef = useRef({});
  const globalSettingsSaveBlockedRef = useRef({});

  const releaseLiveEditPins = useCallback(() => {
    if (Object.keys(liveEditPinsRef.current).length === 0) return;
    liveEditPinsRef.current = {};
    setLiveEditPinVersion((version) => version + 1);
  }, []);

  // Use the column sorting hook with user-specific storage
  const { 
    sortConfig, 
    handleSort: handleColumnSort, 
    handleCustomSort, 
    clearSort 
  } = useColumnSorting('salesPipeline', currentUser?.email);

  const activeCustomFilterForSession = filterStatus.startsWith("custom_")
    ? customFilters.find((filter) => filter.id === filterStatus.replace("custom_", "")) || null
    : null;
  const liveViewSessionKey = JSON.stringify({
    recordScope,
    viewMode,
    filterStatus,
    attentionFilter,
    outcomePeriod,
    searchTerm,
    customConditions: activeCustomFilterForSession?.conditions || null,
    columnFilter: sortConfig.customFilter?.filterType && sortConfig.customFilter.filterType !== "all"
      ? { key: sortConfig.key || "", filter: sortConfig.customFilter }
      : null,
  });
  const liveViewSessionKeyRef = useRef(liveViewSessionKey);
  useEffect(() => {
    if (liveViewSessionKeyRef.current === liveViewSessionKey) return;
    liveViewSessionKeyRef.current = liveViewSessionKey;
    releaseLiveEditPins();
  }, [liveViewSessionKey, releaseLiveEditPins]);

  const { trackChange } = useCellHistoryTracker("WorkOrder", currentUser);

  const [leadSources, setLeadSources] = useState(["Walk-in", "Phone", "Email", "Referral", "Website"]);
  const [projectTypes, setProjectTypes] = useState(["Signage", "Wraps", "Decals", "Banners", "Other"]);
  const [taskDescriptions, setTaskDescriptions] = useState([
    { text: "Prospect Initiation (Gather Info, Initial Discuss ...)", page: "", color: "", opacity: 100, markOut: false },
    { text: "Complete Estimate for Review", page: "Estimating", color: "", opacity: 100, markOut: false },
    { text: "WIP - Prepare/Submit Permit", page: "Permitting", color: "", opacity: 100, markOut: false },
    { text: "WIP - Production/Fabrication", page: "Production", color: "", opacity: 100, markOut: false },
    { text: "Completed Sale", page: "", color: "#f1f5f9", opacity: 60, markOut: true },
    { text: "Lost", page: "", color: "#fef2f2", opacity: 60, markOut: true },
  ]); // Note: Full list is loaded from GlobalSettings on mount

  const WORKFLOW_PAGES = [
    { value: "none", label: "None" },
    { value: "Estimating", label: "Estimating" },
    { value: "Permitting", label: "Permitting" },
    { value: "Design", label: "Design" },
    { value: "Production", label: "Production" },
    { value: "Fabrication", label: "Fabrication" },
    { value: "Installation", label: "Installation/Delivery" },
    { value: "SIPs", label: "SIPs" },
    { value: "MondayMorningMeeting", label: "Monday Morning Meeting" }
  ];

  const TASK_COLORS = [
    { value: "none", label: "None" },
    { value: "#fef2f2", label: "Red" },
    { value: "#fef9c3", label: "Yellow" },
    { value: "#dcfce7", label: "Green" },
    { value: "#dbeafe", label: "Blue" },
    { value: "#f3e8ff", label: "Purple" },
    { value: "#ffedd5", label: "Orange" },
    { value: "#f1f5f9", label: "Gray" }
  ];
  const [corbridgeDialog, setCorbridgeDialog] = useState({ open: false, workOrder: null });
  const [corbridgeDraft, setCorbridgeDraft] = useState({ invoiceNumber: "", link: "" });
  const [corbridgeBaselines, setCorbridgeBaselines] = useState({});
  const [corbridgeSaveError, setCorbridgeSaveError] = useState("");
  const [taskAssignmentRules, setTaskAssignmentRules] = useState([]);

  useEffect(() => {
    loadGlobalSettings();
    loadTaskAssignmentRules();
  }, []);

  useEffect(() => {
    // Invalidate the previous workspace immediately. Without this, a slow
    // request from the old scope can briefly repopulate the new workspace.
    const scopeChanged = activeRecordScopeRef.current !== recordScope;
    if (scopeChanged) releaseLiveEditPins();
    activeRecordScopeRef.current = recordScope;
    loadRequestRef.current += 1;
    // A pending quick edit belongs to the row/workspace where it was made.
    // Keep its conflict-safe save alive, but remove its optimistic overlay
    // from the next workspace load so old-scope values cannot bleed into it.
    setSelectedWorkOrder(null);
    setShowFullWorkOrderDetails(false);
    // Row-bound dialogs must not survive a workspace change. Otherwise a
    // confirmation opened in Current Pipeline can act on that old row after
    // the user has already moved to Outcomes, History, or All Records.
    setStatusTransition(null);
    setFollowUpCompletion(null);
    setCorbridgeDialog({ open: false, workOrder: null });
    setCorbridgeDraft({ invoiceNumber: "", link: "" });
    setCorbridgeSaveError("");
    archiveSkipRef.current = 0;
    setArchiveHasMore(false);
    setArchiveLoadingMore(false);
    loadWorkOrders(true, recordScope);
    const interval = ["current", "outcomes"].includes(recordScope)
      ? setInterval(() => loadWorkOrders(false, recordScope), 60000)
      : null;
    return () => interval && clearInterval(interval);
  }, [recordScope, sessionToken]);

  useEffect(() => {
    if (!["insights", "daily"].includes(viewMode)) return;
    // Insights and Daily are task/report surfaces rather than the row-detail
    // queue that opened these dialogs. Do not carry a row-bound action over
    // a view transition where its originating row is no longer visible.
    setSelectedWorkOrder(null);
    setShowFullWorkOrderDetails(false);
    setStatusTransition(null);
    setFollowUpCompletion(null);
    setCorbridgeDialog({ open: false, workOrder: null });
    setCorbridgeDraft({ invoiceNumber: "", link: "" });
    setCorbridgeSaveError("");
    selectedQueueIndexRef.current = null;
  }, [viewMode]);

  const loadTaskAssignmentRules = async () => {
    try {
      const setting = await loadSingleGlobalSetting({
        entity: GlobalSettings,
        settingKey: "taskAssignmentRules",
        label: "Sales Pipeline task assignment rules",
      });
      setTaskAssignmentRules(setting?.setting_value?.rules || []);
    } catch {}
  };

  const normalizeTaskDescriptionItems = (items = []) => items.map(item => ({
    text: item.text || item,
    page: item.page || "",
    color: item.color || "",
    opacity: item.opacity ?? 100,
    markOut: item.markOut ?? false,
    wip: item.wip ?? false
  }));

  const loadGlobalSettings = async () => {
    try {
      const [leadSourcesSetting, taskDescSetting, gradientSetting, defaultSortSetting] = await Promise.all([
        loadSingleGlobalSetting({ entity: GlobalSettings, settingKey: 'salesLeadSources', label: 'Sales lead sources' }),
        loadSingleGlobalSetting({ entity: GlobalSettings, settingKey: 'salesTaskDescriptions', label: 'Sales task descriptions' }),
        loadSingleGlobalSetting({ entity: GlobalSettings, settingKey: 'deadlineGradientSettings', label: 'Deadline gradient settings' }),
        loadSingleGlobalSetting({ entity: GlobalSettings, settingKey: 'salesPipelineDefaultSort', label: 'Sales Pipeline default sort' }),
      ]);

      globalSettingsBaselinesRef.current = {
        salesLeadSources: leadSourcesSetting,
        salesTaskDescriptions: taskDescSetting,
        deadlineGradientSettings: gradientSetting,
      };
      globalSettingsSaveBlockedRef.current = {};

      const loadedLeadSources = leadSourcesSetting?.setting_value?.items || ["Walk-in", "Phone", "Email", "Referral", "Website"];
      setLeadSources(loadedLeadSources);

      const loadedTaskDescriptions = taskDescSetting?.setting_value?.items
        ? normalizeTaskDescriptionItems(taskDescSetting.setting_value.items)
        : [
          { text: "Prospect Initiation (Gather Info, Initial Discuss ...)", page: "", color: "", opacity: 100, markOut: false },
          { text: "Complete Estimate for Review", page: "Estimating", color: "", opacity: 100, markOut: false },
          { text: "WIP - Prepare/Submit Permit", page: "Permitting", color: "", opacity: 100, markOut: false },
          { text: "WIP - Production/Fabrication", page: "Production", color: "", opacity: 100, markOut: false },
          { text: "Completed Sale", page: "", color: "#f1f5f9", opacity: 60, markOut: true },
          { text: "Lost", page: "", color: "#fef2f2", opacity: 60, markOut: true },
        ];
      setTaskDescriptions(loadedTaskDescriptions);

      const loadedGradient = gradientSetting?.setting_value || {
        enabled: true,
        baseColor: "#ffffff",
        dueColor: "#fecaca",
        overdueColor: "#ef4444",
        gradientDays: 14
      };
      setDeadlineGradientSettings(loadedGradient);

      setEditDialog(prev => {
        if (!prev.open) return prev;
        if (prev.storageKey === 'salesLeadSources') return { ...prev, items: loadedLeadSources };
        if (prev.storageKey === 'salesTaskDescriptions') return { ...prev, items: loadedTaskDescriptions };
        return prev;
      });

      // Load default sort setting and apply if user has no custom sort
      if (defaultSortSetting?.setting_value?.column && !sortConfig.key) {
        handleColumnSort(defaultSortSetting.setting_value.column, defaultSortSetting.setting_value.direction || 'asc');
      }
      setGlobalSettingsLoaded(true);
      return true;
    } catch (error) {
      console.error("Error loading global settings:", error);
      setGlobalSettingsError(error?.message || "Sales Pipeline settings could not be loaded safely.");
      setGlobalSettingsLoaded(true);
      return false;
    }
  };

  const saveGlobalSetting = (key, value) => {
    const previous = globalSettingsSaveQueuesRef.current[key] || Promise.resolve();
    const operation = previous.then(async () => {
      if (globalSettingsSaveBlockedRef.current[key]) return null;
      try {
        const saved = await saveGlobalSettingValueIfUnchanged({
          entity: GlobalSettings,
          loadedRecord: globalSettingsBaselinesRef.current[key] || null,
          settingKey: key,
          nextValue: value,
          label: key === 'salesLeadSources'
            ? 'Sales lead sources'
            : key === 'salesTaskDescriptions'
              ? 'Sales task descriptions'
              : 'Deadline gradient settings',
        });
        globalSettingsBaselinesRef.current[key] = saved;
        const savedValue = saved?.setting_value || value;
        if (key === 'salesLeadSources') setLeadSources(savedValue.items || []);
        if (key === 'salesTaskDescriptions') setTaskDescriptions(normalizeTaskDescriptionItems(savedValue.items || []));
        if (key === 'deadlineGradientSettings') setDeadlineGradientSettings(savedValue);
        return saved;
      } catch (error) {
        globalSettingsSaveBlockedRef.current[key] = true;
        console.error("Sales Pipeline global setting save blocked:", key, error);
        setGlobalSettingsError(error?.message || "A Sales Pipeline setting changed in another session. Reload latest before saving again.");
        return null;
      }
    });
    globalSettingsSaveQueuesRef.current[key] = operation;
    return operation;
  };

  const readArchivePage = async (query, skip = 0) => {
    const page = await withRateLimitRetry(() => WorkOrder.filter(query, "-created_date", ARCHIVE_PAGE_SIZE, skip));
    if (!Array.isArray(page)) throw new Error("Sales archive page could not be verified.");
    return page;
  };

  const mergeLoadedRows = (rows, scope = activeRecordScopeRef.current) => [...new Map(rows.map((order) => [order.id, order])).values()]
    .map((order) => ({
      ...order,
      ...(pendingRecordScopesRef.current[order.id] === scope ? (pendingChangesRef.current[order.id] || {}) : {}),
    }))
    .sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));

  const loadWorkOrders = async (showLoading = true, scope = recordScope) => {
    const requestId = ++loadRequestRef.current;
    const scopeAtStart = scope;
    if (showLoading) setIsLoading(true);
    try {
      const usersPromise = loadSalesPersonRosterSafely({ sessionToken, label: "Sales Pipeline authorized users" });
      let rows = [];
      let pagedCount = 0;
      let hasMore = false;

      if (scope === "current") {
        rows = await loadAllEntityRows({
          entity: WorkOrder,
          query: { is_rider: false, completed: false, in_pipeline: true, sales_status: { $nin: ["won", "lost"] }, deleted: { $ne: true } },
          sort: "-created_date",
          label: "Sales Pipeline current opportunities",
        });
      } else if (scope === "outcomes") {
        rows = await loadAllEntityRows({
          entity: WorkOrder,
          query: { is_rider: false, in_pipeline: true, sales_status: { $in: ["won", "lost"] }, deleted: { $ne: true } },
          sort: "-close_date",
          label: "Sales Pipeline modern outcomes",
        });
      } else if (scope === "history") {
        const page = await readArchivePage(LEGACY_CLOSED_QUERY, 0);
        rows = page;
        pagedCount = page.length;
        hasMore = page.length === ARCHIVE_PAGE_SIZE;
      } else {
        const [activePage, modernOutcomes, completedLegacy] = await Promise.all([
          readArchivePage(ALL_RECORDS_ACTIVE_QUERY, 0),
          loadAllEntityRows({
            entity: WorkOrder,
            query: { is_rider: false, in_pipeline: true, sales_status: { $in: ["won", "lost"] }, deleted: { $ne: true } },
            sort: "-close_date",
            label: "Sales Pipeline modern outcomes",
          }),
          loadAllEntityRows({
            entity: WorkOrder,
            query: { ...LEGACY_CLOSED_QUERY, completed: true },
            sort: "-created_date",
            label: "Sales Pipeline completed legacy history",
          }),
        ]);
        rows = [...activePage, ...modernOutcomes, ...completedLegacy];
        pagedCount = activePage.length;
        hasMore = activePage.length === ARCHIVE_PAGE_SIZE;
      }

      const usersData = await usersPromise;
      if (requestId !== loadRequestRef.current || scopeAtStart !== activeRecordScopeRef.current) return;
      archiveSkipRef.current = pagedCount;
      setArchiveHasMore(hasMore);
      setWorkOrders(mergeLoadedRows(rows, scopeAtStart));
      setUsers(usersData);
    } catch (error) {
      if (requestId === loadRequestRef.current) console.error("Error loading work orders:", error);
    } finally {
      if (requestId === loadRequestRef.current) setIsLoading(false);
    }
  };

  const loadMoreArchive = async () => {
    if (archiveLoadingMore || !archiveHasMore || !["history", "all"].includes(recordScope)) return;
    const scopeAtStart = recordScope;
    const requestId = loadRequestRef.current;
    setArchiveLoadingMore(true);
    try {
      const query = scopeAtStart === "history" ? LEGACY_CLOSED_QUERY : ALL_RECORDS_ACTIVE_QUERY;
      const page = await readArchivePage(query, archiveSkipRef.current);
      if (requestId !== loadRequestRef.current) return;
      archiveSkipRef.current += page.length;
      setArchiveHasMore(page.length === ARCHIVE_PAGE_SIZE);
      setWorkOrders((current) => mergeLoadedRows([...current, ...page]));
    } catch (error) {
      if (requestId === loadRequestRef.current) console.error("Error loading older Sales Pipeline archive rows:", error);
    } finally {
      if (requestId === loadRequestRef.current) setArchiveLoadingMore(false);
    }
  };

  const calculateDays = useCallback((fromDate, toDate) => {
    // Guard against falsy values
    if (!fromDate || fromDate === '' || fromDate === null || fromDate === undefined) return null;
    
    try {
      const from = parseLocalDate(fromDate);
      if (!from || isNaN(from.getTime())) return null;
      
      // If toDate is not provided or is falsy, use today
      const useToday = toDate === undefined || toDate === null || toDate === '';
      let to;
      
      if (useToday) {
        to = new Date();
        to.setHours(0, 0, 0, 0);
      } else {
        to = parseLocalDate(toDate);
        if (!to || isNaN(to.getTime())) return null;
      }
      
      const result = differenceInDays(to, from);
      return isNaN(result) ? null : result;
    } catch (error) {
      return null;
    }
  }, []);

  const addNewRow = () => {
    if (!isRegistered) return;
    setShowForm(true);
  };

  const handleSaveNew = async (workOrderData) => {
    const activityStamp = new Date().toISOString();
    const { record: newOrder } = await createWorkOrderWithRecovery({
      data: {
        ...workOrderData,
        current_stage: "sales",
        sales_status: "lead",
        in_pipeline: true,
        sales_last_activity_at: activityStamp,
        sales_stage_changed_at: activityStamp,
      },
      label: "Sales Pipeline Work Order",
    });
    setWorkOrders(prev => [newOrder, ...prev.filter(wo => wo.id !== newOrder.id)]);
    setShowForm(false);
    setDuplicateData(null);
  };

  const handleDuplicateClient = (wo) => {
    // Clone all data for prefilling
    setDuplicateData({ ...wo });
    setShowForm(true);
  };

  const markWorkOrderNeedsSync = useCallback((workOrderId) => {
    const id = String(workOrderId || "").trim();
    if (!id) return;
    pendingSyncIdsRef.current.add(id);
    pendingSyncVersionRef.current.set(id, (pendingSyncVersionRef.current.get(id) || 0) + 1);
  }, []);

  const clearSyncedWorkOrderIds = useCallback((targets) => {
    for (const target of targets || []) {
      const id = String(target?.id || "").trim();
      if (!id || pendingSyncVersionRef.current.get(id) !== target?.version) continue;
      pendingSyncIdsRef.current.delete(id);
      pendingSyncVersionRef.current.delete(id);
    }
  }, []);

  const waitForPendingSalesSaves = async () => {
    for (let attempt = 0; attempt < 70; attempt += 1) {
      const pendingCount = Object.keys(pendingChangesRef.current).length;
      const timerCount = Object.keys(debounceTimers.current).length;
      if (pendingCount === 0 && timerCount === 0) return;
      if (pendingCount > 0 && timerCount === 0) {
        throw new Error("A Sales quick edit is still unsaved. Resolve the save warning or reload latest before syncing.");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Sales changes are still waiting to save. Resolve the save warning or reload latest before syncing.");
  };

  const saveAndSync = async () => {
    if (syncInFlightRef.current) return { ok: false, message: "Sales sync is already running." };
    try {
      await waitForPendingSalesSaves();
    } catch (error) {
      return { ok: false, message: error?.message || "Sales changes could not be saved before sync." };
    }

    const syncTargets = [...pendingSyncIdsRef.current].map((id) => ({
      id,
      version: pendingSyncVersionRef.current.get(id) || 0,
    }));
    const workOrderIds = syncTargets.map((target) => target.id);
    if (workOrderIds.length === 0) {
      return { ok: true, message: "No new Sales changes need Smartsheet sync." };
    }

    syncInFlightRef.current = true;
    try {
      const result = await pushSavedSalesToSmartsheet({ sessionToken, workOrderIds });
      const summary = summarizeSavedSalesSync(result);
      if (!summary.ok) return summary;
      clearSyncedWorkOrderIds(syncTargets);
      return summary;
    } catch (error) {
      return { ok: false, message: error?.message || "Saved in Base44, but Smartsheet sync could not be verified." };
    } finally {
      syncInFlightRef.current = false;
    }
  };

  const updateWorkOrderFields = (orderId, nextChanges, skipHistory = false) => {
    const currentWo = workOrders.find(wo => wo.id === orderId);
    if (!currentWo || !nextChanges || Object.keys(nextChanges).length === 0) return;

    const updatedWo = { ...currentWo, ...nextChanges };
    // Apply task assignment rules once against the complete proposed record.
    const ruleUpdates = applyRules(taskAssignmentRules, updatedWo);
    const proposedUpdates = { ...nextChanges, ...ruleUpdates };

    const currentSalesStatus = currentWo.sales_status ?? "lead";
    const resultingSalesStatus = proposedUpdates.sales_status ?? currentSalesStatus;
    const currentIsTerminal = ["won", "lost"].includes(currentSalesStatus);
    const resultingIsTerminal = ["won", "lost"].includes(resultingSalesStatus);
    const salesStatusChanged = Object.prototype.hasOwnProperty.call(proposedUpdates, "sales_status")
      && currentSalesStatus !== resultingSalesStatus;
    if (currentIsTerminal && resultingIsTerminal && !salesStatusChanged) {
      const changedHistoricalField = Array.from(CLOSEOUT_HISTORICAL_FIELDS).find((fieldName) =>
        Object.prototype.hasOwnProperty.call(proposedUpdates, fieldName)
        && JSON.stringify(currentWo[fieldName]) !== JSON.stringify(proposedUpdates[fieldName])
      );
      if (changedHistoricalField) {
        setQuickEditError("Closed Won/Lost opportunities keep quote timing, follow-up, expected-close, closeout, and task-planning values as historical context. Reopen or change the outcome before editing those fields.");
        return;
      }
    }
    if (!salesStatusChanged && !resultingIsTerminal && Object.prototype.hasOwnProperty.call(proposedUpdates, "close_date")) {
      const nextCloseDate = String(proposedUpdates.close_date || "").trim();
      if (nextCloseDate) {
        setQuickEditError("Close date is outcome data and can only be set by marking the opportunity Won or Lost.");
        return;
      }
    }
    if (!salesStatusChanged && resultingSalesStatus !== "lost" && Object.prototype.hasOwnProperty.call(proposedUpdates, "lost_reason")) {
      const nextLostReason = String(proposedUpdates.lost_reason || "").trim();
      if (nextLostReason) {
        setQuickEditError("Lost reason can only be set when marking the opportunity Lost.");
        return;
      }
    }

    const todayStamp = format(new Date(), "yyyy-MM-dd");
    const protectedDateFields = [
      ["date_estimate_sent", "Quote sent date"],
      ["close_date", "Close date"],
    ];
    for (const [fieldName, fieldLabel] of protectedDateFields) {
      if (!Object.prototype.hasOwnProperty.call(proposedUpdates, fieldName)) continue;
      const nextDate = String(proposedUpdates[fieldName] || "").slice(0, 10);
      if (nextDate && nextDate > todayStamp) {
        setQuickEditError(`${fieldLabel} cannot be in the future.`);
        return;
      }
    }
    if (
      resultingIsTerminal
      && Object.prototype.hasOwnProperty.call(proposedUpdates, "close_date")
      && !String(proposedUpdates.close_date || "").trim()
    ) {
      setQuickEditError("Won/Lost opportunities must keep a close date. Reopen the opportunity to clear it.");
      return;
    }
    if (
      resultingSalesStatus === "lost"
      && Object.prototype.hasOwnProperty.call(proposedUpdates, "lost_reason")
      && !String(proposedUpdates.lost_reason || "").trim()
    ) {
      setQuickEditError("Lost opportunities must keep a lost reason. Reopen or change the outcome instead of clearing it.");
      return;
    }

    const salesActivityChanged = Object.keys(proposedUpdates).some((changedField) =>
      SALES_ACTIVITY_FIELDS.has(changedField) && JSON.stringify(currentWo[changedField]) !== JSON.stringify(proposedUpdates[changedField])
    );
    const activityStamp = salesActivityChanged ? new Date().toISOString() : "";
    const trackingUpdates = salesActivityChanged ? {
      sales_last_activity_at: activityStamp,
      ...(Object.prototype.hasOwnProperty.call(proposedUpdates, "sales_status") && currentWo.sales_status !== proposedUpdates.sales_status
        ? { sales_stage_changed_at: activityStamp }
        : {}),
    } : {};
    const mergedUpdates = { ...proposedUpdates, ...trackingUpdates };
    const changedFields = Object.keys(mergedUpdates).filter((changedField) =>
      JSON.stringify(currentWo[changedField]) !== JSON.stringify(mergedUpdates[changedField])
    );
    if (changedFields.length === 0) return;

    setWorkOrders(prev => prev.map(wo => wo.id === orderId ? { ...wo, ...mergedUpdates } : wo));
    setSelectedWorkOrder((selected) => selected?.id === orderId ? { ...selected, ...mergedUpdates } : selected);

    const baselines = { ...(pendingBaselinesRef.current[orderId] || {}) };
    changedFields.forEach((changedField) => {
      if (!Object.prototype.hasOwnProperty.call(baselines, changedField)) {
        baselines[changedField] = currentWo[changedField];
      }
    });
    pendingBaselinesRef.current[orderId] = baselines;
    pendingRecordScopesRef.current[orderId] = activeRecordScopeRef.current;
    pendingChangesRef.current[orderId] = {
      ...(pendingChangesRef.current[orderId] || {}),
      ...mergedUpdates,
    };

    if (!skipHistory) {
      const trackedFields = new Set(pendingHistoryFieldsRef.current[orderId] || []);
      changedFields.filter((changedField) => !INTERNAL_SALES_TRACKING_FIELDS.has(changedField)).forEach((changedField) => trackedFields.add(changedField));
      pendingHistoryFieldsRef.current[orderId] = trackedFields;
    }
    setQuickEditError("");

    if (debounceTimers.current[orderId]) {
      clearTimeout(debounceTimers.current[orderId]);
    }

    const timerId = setTimeout(async () => {
      const queued = pendingChangesRef.current[orderId];
      const changes = queued ? { ...queued } : null;
      if (!changes || Object.keys(changes).length === 0) {
        if (debounceTimers.current[orderId] === timerId) delete debounceTimers.current[orderId];
        return;
      }
      try {
        const baselineSource = pendingBaselinesRef.current[orderId] || {};
        const historyFieldsAtSave = new Set(pendingHistoryFieldsRef.current[orderId] || []);
        const expectedFields = Object.keys(changes).reduce((out, changedField) => {
          if (!Object.prototype.hasOwnProperty.call(baselineSource, changedField)) {
            throw new Error(`Sales Pipeline quick edit is missing its baseline for ${changedField}. Reload before saving.`);
          }
          out[changedField] = baselineSource[changedField];
          return out;
        }, {});
        const saved = await replaceWorkOrderFieldsIfUnchanged({
          workOrderId: orderId,
          expectedFields,
          nextFields: changes,
          label: "Sales Pipeline quick edit",
        });

        // History is written only after the conflict-safe business save succeeds.
        await Promise.all(Object.keys(changes)
          .filter((changedField) => historyFieldsAtSave.has(changedField))
          .map((changedField) => trackChange(orderId, changedField, baselineSource[changedField], saved[changedField])));

        const remaining = { ...(pendingChangesRef.current[orderId] || {}) };
        const remainingBaselines = { ...(pendingBaselinesRef.current[orderId] || {}) };
        const remainingHistoryFields = new Set(pendingHistoryFieldsRef.current[orderId] || []);
        Object.entries(changes).forEach(([changedField, requestedValue]) => {
          if (JSON.stringify(remaining[changedField]) === JSON.stringify(requestedValue)) {
            delete remaining[changedField];
            delete remainingBaselines[changedField];
            remainingHistoryFields.delete(changedField);
          } else if (Object.prototype.hasOwnProperty.call(remaining, changedField)) {
            remainingBaselines[changedField] = saved[changedField];
          }
        });
        if (Object.keys(remaining).length > 0) {
          pendingChangesRef.current[orderId] = remaining;
          pendingBaselinesRef.current[orderId] = remainingBaselines;
          pendingHistoryFieldsRef.current[orderId] = remainingHistoryFields;
        } else {
          delete pendingChangesRef.current[orderId];
          delete pendingBaselinesRef.current[orderId];
          delete pendingHistoryFieldsRef.current[orderId];
          delete pendingRecordScopesRef.current[orderId];
        }
        setWorkOrders((current) => current.map((row) => row.id === orderId ? { ...row, updated_date: saved.updated_date } : row));
        setSelectedWorkOrder((selected) => selected?.id === orderId ? { ...selected, updated_date: saved.updated_date } : selected);
        markWorkOrderNeedsSync(orderId);
        setQuickEditError("");
      } catch (error) {
        if (!error.message?.includes('not found')) {
          console.error("Error updating work order:", error);
        }
        setQuickEditError(error?.message || "A Sales Pipeline quick edit could not be saved. Reload the latest data and try again.");
        // Keep the queued values, history intent, and original baselines so no stale value is silently written.
      } finally {
        if (debounceTimers.current[orderId] === timerId) delete debounceTimers.current[orderId];
      }
    }, 1000);
    debounceTimers.current[orderId] = timerId;
  };

  const updateWorkOrder = (orderId, field, value, skipHistory = false) => {
    updateWorkOrderFields(orderId, { [field]: value }, skipHistory);
  };

  const openOpportunityDetails = (workOrder) => {
    setSelectedWorkOrder(workOrder);
    setShowFullWorkOrderDetails(false);
  };

  const requestSalesStatusChange = (workOrder, nextStatus) => {
    if (!isRegistered || !workOrder?.id || !nextStatus || workOrder.sales_status === nextStatus) return;
    const currentStatus = workOrder.sales_status || "lead";
    const terminalChange = ["won", "lost"].includes(nextStatus);
    const reopening = ["won", "lost"].includes(currentStatus) && !terminalChange;
    if (terminalChange || reopening) {
      setStatusTransition({ workOrder, nextStatus });
      return;
    }
    updateWorkOrderFields(workOrder.id, { sales_status: nextStatus });
  };

  const requestFollowUpCompletion = (workOrder) => {
    if (!isRegistered || !workOrder?.id || ["won", "lost"].includes(workOrder.sales_status)) return;
    setFollowUpCompletion(workOrder);
  };

  const confirmFollowUpCompletion = ({ outcome = "", nextFollowUpDate = "", nextAction = "" } = {}) => {
    if (!followUpCompletion?.id || !String(outcome).trim()) return;
    const current = workOrders.find((row) => row.id === followUpCompletion.id) || followUpCompletion;
    const changes = {
      sales_last_follow_up_completed_at: new Date().toISOString(),
      sales_last_follow_up_outcome: String(outcome).trim(),
      follow_up_date: nextFollowUpDate || "",
    };
    if (nextAction !== String(current.current_task_description || "").trim()) {
      changes.current_task_description = nextAction;
    }
    updateWorkOrderFields(current.id, changes);
    setFollowUpCompletion(null);
  };

  const confirmSalesStatusTransition = ({ lostReason = "" } = {}) => {
    if (!statusTransition?.workOrder?.id) return;
    const current = workOrders.find((row) => row.id === statusTransition.workOrder.id) || statusTransition.workOrder;
    const nextStatus = statusTransition.nextStatus;
    const today = format(new Date(), "yyyy-MM-dd");
    const closing = ["won", "lost"].includes(nextStatus);
    const reopening = ["won", "lost"].includes(current.sales_status) && !closing;
    let changes = { sales_status: nextStatus };

    if (closing) {
      changes = {
        ...changes,
        close_date: today,
        follow_up_date: "",
        lost_reason: nextStatus === "lost" ? lostReason : "",
      };
    } else if (reopening) {
      changes = {
        ...changes,
        close_date: "",
        lost_reason: "",
      };
    }

    updateWorkOrderFields(current.id, changes);
    setStatusTransition(null);
  };

  const discardPendingQuickEdits = async () => {
    Object.values(debounceTimers.current).forEach((timer) => clearTimeout(timer));
    debounceTimers.current = {};
    pendingChangesRef.current = {};
    pendingBaselinesRef.current = {};
    pendingHistoryFieldsRef.current = {};
    pendingRecordScopesRef.current = {};
    setQuickEditError("");
    await loadWorkOrders(false);
  };

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const toggleRowSelection = (id) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === filteredWorkOrders.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredWorkOrders.map(wo => wo.id)));
    }
  };

  const confirmBulkDelete = async () => {
    const ids = [...selectedRows];
    const targets = ids.map((id) => workOrders.find((workOrder) => workOrder.id === id)).filter(Boolean);
    if (targets.length !== ids.length) {
      setDestructiveActionError("One or more selected Work Orders are no longer available in the loaded Sales Pipeline. Reload before deleting.");
      setBulkDeleteConfirm(false);
      return;
    }

    setDestructiveActionError("");
    const deletedIds = [];
    try {
      // Preflight every selected record before deleting any of them. Base44 does not
      // provide a multi-record transaction, so this minimizes partial bulk deletes.
      for (const target of targets) {
        const latest = await WorkOrder.get(target.id);
        if (!latest?.id || latest.deleted === true || latest.updated_date !== target.updated_date) {
          throw new Error(`Bulk delete was blocked because ${target.client_name || target.title || target.id} changed after the Sales Pipeline was loaded.`);
        }
      }

      for (const target of targets) {
        const id = target.id;
        if (debounceTimers.current[id]) {
          clearTimeout(debounceTimers.current[id]);
          delete debounceTimers.current[id];
        }
        delete pendingChangesRef.current[id];
        delete pendingBaselinesRef.current[id];
        delete pendingHistoryFieldsRef.current[id];
        delete pendingRecordScopesRef.current[id];
        await softDeleteWorkOrderFromLoadedSnapshot({
          workOrder: target,
          deletedBy: currentUser?.email || "unknown",
          label: "Sales Pipeline bulk delete",
        });
        deletedIds.push(id);
      }
    } catch (error) {
      console.error("Sales Pipeline bulk delete stopped:", error);
      const progressNote = deletedIds.length > 0
        ? ` ${deletedIds.length} Work Order${deletedIds.length === 1 ? " was" : "s were"} already moved to Project Trash before the operation stopped.`
        : " No Work Orders were deleted.";
      setDestructiveActionError(`${error?.message || "Bulk delete could not be completed."}${progressNote} No further Work Orders were deleted; anything already in Project Trash can be recovered there.`);
    } finally {
      setSelectedRows(new Set());
      setBulkDeleteConfirm(false);
      await loadWorkOrders(false);
    }
  };

  const deleteWorkOrder = async (workOrder) => {
    setDeleteConfirm(workOrder);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const orderId = deleteConfirm.id;
    setDestructiveActionError("");
    
    if (debounceTimers.current[orderId]) {
      clearTimeout(debounceTimers.current[orderId]);
      delete debounceTimers.current[orderId];
    }
    delete pendingChangesRef.current[orderId];
    delete pendingBaselinesRef.current[orderId];
    delete pendingHistoryFieldsRef.current[orderId];
    delete pendingRecordScopesRef.current[orderId];
    
    try {
      await softDeleteWorkOrderFromLoadedSnapshot({
        workOrder: deleteConfirm,
        deletedBy: currentUser?.email || "unknown",
        label: "Sales Pipeline Work Order delete",
      });
      setWorkOrders((current) => current.filter((workOrder) => workOrder.id !== orderId));
    } catch (error) {
      console.error("Sales Pipeline Work Order delete blocked:", error);
      setDestructiveActionError(error?.message || "This Work Order changed after the Sales Pipeline was loaded. Reload before deleting it.");
      await loadWorkOrders(false);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const moveToWorkflow = async (workOrder) => {
    setQuickEditError("");
    try {
      const saved = await replaceWorkOrderFieldsIfUnchanged({
        workOrderId: workOrder.id,
        expectedFields: {
          in_pipeline: workOrder.in_pipeline,
          current_stage: workOrder.current_stage,
          start_date: workOrder.start_date,
          priority: workOrder.priority,
        },
        nextFields: {
          in_pipeline: true,
          current_stage: "permitting",
          start_date: workOrder.start_date || format(new Date(), "yyyy-MM-dd"),
          priority: 0,
        },
        label: "Sales Pipeline move to workflow",
      });
      Object.assign(workOrder, {
        in_pipeline: saved.in_pipeline,
        current_stage: saved.current_stage,
        start_date: saved.start_date,
        priority: saved.priority,
        updated_date: saved.updated_date,
      });
      setWorkOrders((current) => current.filter((wo) => wo.id !== workOrder.id));
    } catch (error) {
      console.error("Could not move Sales Pipeline Work Order safely:", error);
      setQuickEditError(error?.message || "This Work Order changed in another session. Reload before moving it into workflow.");
      await loadWorkOrders(false);
    }
  };

  const openEditDialog = (field, items, storageKey) => {
    setEditDialog({ open: true, field, items, storageKey });
    setEditInput("");
  };

  const addToList = () => {
    if (!editInput.trim()) return;
    let newItems;
    if (editDialog.storageKey === "salesTaskDescriptions") {
      newItems = [...editDialog.items, { text: editInput.trim(), page: "", color: "", opacity: 100, markOut: false, wip: false }];
    } else {
      newItems = [...editDialog.items, editInput.trim()];
    }
    if (editDialog.storageKey === "salesLeadSources") {
      setLeadSources(newItems);
      saveGlobalSetting('salesLeadSources', { items: newItems });
    } else if (editDialog.storageKey === "salesProjectTypes") {
      setProjectTypes(newItems);
    } else if (editDialog.storageKey === "salesTaskDescriptions") {
      setTaskDescriptions(newItems);
      saveGlobalSetting('salesTaskDescriptions', { items: newItems });
    }
    setEditDialog({ ...editDialog, items: newItems });
    setEditInput("");
  };

  const removeFromList = (item) => {
    const newItems = editDialog.storageKey === "salesTaskDescriptions"
      ? editDialog.items.filter(i => i.text !== item.text)
      : editDialog.items.filter(i => i !== item);
    if (editDialog.storageKey === "salesLeadSources") {
      setLeadSources(newItems);
      saveGlobalSetting('salesLeadSources', { items: newItems });
    } else if (editDialog.storageKey === "salesProjectTypes") {
      setProjectTypes(newItems);
    } else if (editDialog.storageKey === "salesTaskDescriptions") {
      setTaskDescriptions(newItems);
      saveGlobalSetting('salesTaskDescriptions', { items: newItems });
    }
    setEditDialog({ ...editDialog, items: newItems });
  };

  const updateListItem = (oldItem, newItem) => {
    if (editDialog.storageKey === "salesTaskDescriptions") {
      if (typeof newItem === 'string' && !newItem.trim()) return;
      const newItems = editDialog.items.map(i => {
        if (i.text === oldItem.text) {
          return typeof newItem === 'string' ? { ...i, text: newItem.trim() } : newItem;
        }
        return i;
      });
      setTaskDescriptions(newItems);
      saveGlobalSetting('salesTaskDescriptions', { items: newItems });
      setEditDialog({ ...editDialog, items: newItems });
    } else {
      if (!newItem.trim()) return;
      const newItems = editDialog.items.map(i => i === oldItem ? newItem.trim() : i);
      if (editDialog.storageKey === "salesLeadSources") {
        setLeadSources(newItems);
        saveGlobalSetting('salesLeadSources', { items: newItems });
      } else if (editDialog.storageKey === "salesProjectTypes") {
        setProjectTypes(newItems);
      }
      setEditDialog({ ...editDialog, items: newItems });
    }
  };

  const updateTaskPage = (item, page) => {
    const newItems = editDialog.items.map(i => {
      if (i.text === item.text) {
        return { ...i, page };
      }
      return i;
    });
    setTaskDescriptions(newItems);
    saveGlobalSetting('salesTaskDescriptions', { items: newItems });
    setEditDialog({ ...editDialog, items: newItems });
  };

  const updateTaskStyle = (item, field, value) => {
    const newItems = editDialog.items.map(i => {
      if (i.text === item.text) {
        return { ...i, [field]: value };
      }
      return i;
    });
    setTaskDescriptions(newItems);
    saveGlobalSetting('salesTaskDescriptions', { items: newItems });
    setEditDialog({ ...editDialog, items: newItems });
  };

  // Convert hex color to rgba with opacity
  const hexToRgba = (hex, opacity) => {
    if (!hex) return '';
    // Remove # if present
    hex = hex.replace('#', '');
    // Handle shorthand hex
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return hex; // Return original if not valid hex
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  // Get task description styling for a work order
  const getTaskDescStyle = useCallback((taskDescText) => {
    if (!taskDescText) return { backgroundColor: '', markOut: false };
    const taskDesc = taskDescriptions.find(td => td.text === taskDescText);
    if (!taskDesc) return { backgroundColor: '', markOut: false };
    const opacity = (taskDesc.opacity ?? 100) / 100;
    const bgColor = taskDesc.color ? hexToRgba(taskDesc.color, opacity) : '';
    return {
      backgroundColor: bgColor,
      markOut: taskDesc.markOut ?? false
    };
  }, [taskDescriptions]);

  // Get deadline cell color based on gradient settings
  const getDeadlineCellColor = useCallback((deadlineDate) => {
    if (!deadlineGradientSettings.enabled || !deadlineDate) return '';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = parseLocalDate(deadlineDate);
    if (!deadline) return '';
    deadline.setHours(0, 0, 0, 0);
    
    const daysUntilDue = differenceInDays(deadline, today);
    
    // If past due (negative days), use the overdue color
    if (daysUntilDue < 0) return deadlineGradientSettings.overdueColor || '#ef4444';
    
    // If due today, use the due color
    if (daysUntilDue === 0) return deadlineGradientSettings.dueColor;
    
    // If beyond gradient range, use base color
    if (daysUntilDue >= deadlineGradientSettings.gradientDays) return deadlineGradientSettings.baseColor;
    
    // Calculate gradient position (0 = due date, 1 = base)
    const ratio = daysUntilDue / deadlineGradientSettings.gradientDays;
    
    // Interpolate between dueColor and baseColor
    const parseHex = (hex) => {
      hex = hex.replace('#', '');
      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
      };
    };
    
    const base = parseHex(deadlineGradientSettings.baseColor);
    const due = parseHex(deadlineGradientSettings.dueColor);
    
    const r = Math.round(due.r + (base.r - due.r) * ratio);
    const g = Math.round(due.g + (base.g - due.g) * ratio);
    const b = Math.round(due.b + (base.b - due.b) * ratio);
    
    return `rgb(${r}, ${g}, ${b})`;
  }, [deadlineGradientSettings]);

  const saveGradientSettings = (settings) => {
    setDeadlineGradientSettings(settings);
    saveGlobalSetting('deadlineGradientSettings', settings);
  };

  const moveListItem = (index, direction) => {
    const newItems = [...editDialog.items];
    if (direction === 'up' && index > 0) {
      [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
    } else if (direction === 'down' && index < newItems.length - 1) {
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    } else {
      return;
    }
    if (editDialog.storageKey === "salesLeadSources") {
      setLeadSources(newItems);
      saveGlobalSetting('salesLeadSources', { items: newItems });
    } else if (editDialog.storageKey === "salesProjectTypes") {
      setProjectTypes(newItems);
    } else if (editDialog.storageKey === "salesTaskDescriptions") {
      setTaskDescriptions(newItems);
      saveGlobalSetting('salesTaskDescriptions', { items: newItems });
    }
    setEditDialog({ ...editDialog, items: newItems });
  };

  // Helper to get display text from task description
  const getTaskDescText = (item) => {
    if (typeof item === 'string') return item;
    return item?.text || '';
  };

  const openCorbridgeDialog = (workOrder) => {
    if (!workOrder) return;
    setCorbridgeDialog({ open: true, workOrder });
    setCorbridgeDraft({
      invoiceNumber: workOrder.est_inv_at || "",
      link: workOrder.corbridge_link || "",
    });
    setCorbridgeBaselines({
      est_inv_at: workOrder.est_inv_at,
      corbridge_link: workOrder.corbridge_link,
    });
    setCorbridgeSaveError("");
  };

  const closeCorbridgeDialog = () => {
    setCorbridgeDialog({ open: false, workOrder: null });
    setCorbridgeDraft({ invoiceNumber: "", link: "" });
    setCorbridgeBaselines({});
    setCorbridgeSaveError("");
  };

  const reloadCorbridgeLatest = async () => {
    const id = corbridgeDialog.workOrder?.id;
    if (!id) return;
    try {
      const latest = await WorkOrder.get(id);
      if (!latest?.id) throw new Error("The latest Work Order could not be found.");
      setWorkOrders((current) => current.map((workOrder) => workOrder.id === id ? latest : workOrder));
      setCorbridgeDialog({ open: true, workOrder: latest });
      setCorbridgeDraft({
        invoiceNumber: latest.est_inv_at || "",
        link: latest.corbridge_link || "",
      });
      setCorbridgeBaselines({
        est_inv_at: latest.est_inv_at,
        corbridge_link: latest.corbridge_link,
      });
      setCorbridgeSaveError("");
    } catch (error) {
      console.error("Could not reload latest Corebridge fields:", error);
      setCorbridgeSaveError(error?.message || "The latest Corebridge fields could not be loaded.");
    }
  };

  const saveCorbridgeData = async (invoiceNumber, link) => {
    const workOrder = corbridgeDialog.workOrder;
    if (!workOrder?.id) return;
    const updates = {
      est_inv_at: invoiceNumber
    };
    const expectedFields = {
      est_inv_at: corbridgeBaselines.est_inv_at,
    };
    if (link) {
      updates.corbridge_link = link;
      expectedFields.corbridge_link = corbridgeBaselines.corbridge_link;
    }
    setCorbridgeSaveError("");
    try {
      const saved = await replaceWorkOrderFieldsIfUnchanged({
        workOrderId: workOrder.id,
        expectedFields,
        nextFields: updates,
        label: "Estimate/invoice number and Base44 link",
      });
      setWorkOrders((current) => current.map((row) => row.id === saved.id ? { ...row, ...saved } : row));
      markWorkOrderNeedsSync(saved.id);
      closeCorbridgeDialog();
    } catch (error) {
      console.error("Could not save Corebridge fields:", error);
      setCorbridgeSaveError(error?.message || "These Corebridge fields changed in another session. Reload the latest values before saving.");
    }
  };

  const getRowColor = (status) => {
    const statusObj = SALES_STATUSES.find(s => s.value === status);
    return statusObj?.color || "bg-white";
  };

  const exportToExcel = async () => {
    setExportProgress({ show: true, progress: 0 });
    const str = (val) => (val == null ? "" : String(val));
    const num = (val) => (typeof val === 'number' && !isNaN(val) ? val : (val == null || val === "" ? null : Number(val) || null));
    const exportData = filteredWorkOrders.map(wo => ({
      "Customer": str(wo.client_name), "Sales Status": str(wo.sales_status), "Source": str(wo.lead_source),
      "Smartsheet Row ID": str(wo.sales_import_source_id), "Sales Rep": str(wo.sales_rep),
      "Current Task Deadline": str(wo.current_task_deadline), "Current Task Assigned to": str(wo.current_task_assigned_to),
      "Designer": str(wo.designer), "Project Manager": str(wo.project_manager), "Estimator": str(wo.estimator),
      "Est/Inv @": str(wo.est_inv_at), "Estimate Amount": num(wo.estimate_amount),
      "Current Task Description": str(wo.current_task_description), "Date Est. Requested/Initial Contact": str(wo.date_initial_contact),
      "Site Survey": str(wo.site_survey_date), "Date Estimate Sent to Customer": str(wo.date_estimate_sent),
      "Date Order Created": str(wo.date_order_created), "Project Install Date": str(wo.project_install_date),
      "Permit Submitted": str(wo.permit_submitted_date), "Notes": str(wo.title),
      "Date Permit Receipt Confirmed": str(wo.permit_receipt_confirmed_date), "Permit Number": str(wo.permit_number),
      "Date Permit Approved/Received": str(wo.permit_approved_date),
      "Follow Up Date": str(wo.follow_up_date), "Last Follow Up Completed": str(wo.sales_last_follow_up_completed_at),
      "Last Follow Up Outcome": str(wo.sales_last_follow_up_outcome), "Stage Changed At": str(wo.sales_stage_changed_at),
      "Stage Age Days": num(getStageAgeDays(wo, new Date())), "Quote Age Days": num(getQuoteAgeDays(wo, new Date())),
      "Expected Close Date": str(wo.expected_close_date), "Close Date": str(wo.close_date),
      "Lost Reason": str(wo.lost_reason), "Project Type": str(wo.project_type),
      "Days from Initial Request to today": num(calculateDays(wo.date_initial_contact)),
      "Days Est. Sent from Date Requested": num(calculateDays(wo.date_initial_contact, wo.date_estimate_sent)),
      "Days from Est. Sent to Date Order Created": num(calculateDays(wo.date_estimate_sent, wo.date_order_created)),
      "Days from Order Created to Permit Submitted": num(calculateDays(wo.date_order_created, wo.permit_submitted_date)),
      "Days from Permit Submitted to Permit Approved": num(calculateDays(wo.permit_submitted_date, wo.permit_approved_date)),
      "Days from Project Install Date from Order Created": num(calculateDays(wo.date_order_created, wo.project_install_date)),
    }));
    await new Promise(resolve => setTimeout(resolve, 300));
    setExportProgress({ show: true, progress: 50 });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Pipeline");
    XLSX.writeFile(wb, `sales_pipeline_${format(new Date(), "yyyy-MM-dd")}.xlsx`, { bookType: 'xlsx', type: 'binary' });
    setExportProgress({ show: true, progress: 100 });
    setTimeout(() => setExportProgress({ show: false, progress: 0 }), 1000);
  };

  const invokeSalesImport = async (file, mode, importJobId = "") => {
    const response = await base44.functions.invoke("importSalesPipeline", {
      file,
      session_token: sessionToken,
      mode,
      import_job_id: importJobId,
    });
    return response?.data || {};
  };

  const importFromExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportFile(file);
    setImportPreview(null);
    setImportError("");
    setImportPreflightBusy(true);

    try {
      const preview = await invokeSalesImport(file, "preview");
      setImportPreview(preview);
    } catch (err) {
      console.error("Import preflight failed:", err);
      setImportError(err?.response?.data?.error || err?.message || "The spreadsheet could not be analyzed safely.");
    } finally {
      setImportPreflightBusy(false);
    }
  };

  const closeImportPreview = () => {
    if (importApplyBusy) return;
    setImportPreview(null);
    setImportFile(null);
    setImportError("");
  };

  const applyImportPreview = async () => {
    if (!importFile || !importPreview?.summary || importApplyBusy) return;
    setImportApplyBusy(true);
    setImportError("");

    try {
      const tracker = await startTrackedImport(
        Number(importPreview.summary.total || 0),
        currentUser?.email,
        "sales_pipeline",
        {
          fileName: importFile.name,
          fileHash: importPreview.file_hash || "",
          fileSizeBytes: importFile.size || 0,
        },
      );
      if (!tracker?.importJobId) throw new Error("The import progress job could not be created.");

      const result = await invokeSalesImport(importFile, "apply", tracker.importJobId);
      await refreshTrackedImport();
      if (!result?.cancelled) {
        if (result?.changed_records_complete && Array.isArray(result.changed_records)) {
          setWorkOrders((current) => {
            const byId = new Map(current.map((row) => [row.id, row]));
            result.changed_records.forEach((row) => {
              if (row?.id) byId.set(row.id, row);
            });
            return Array.from(byId.values());
          });
        } else {
          await loadWorkOrders(false);
        }
      }
      setImportPreview({ ...importPreview, appliedResult: result });
      setImportFile(null);
      if (!result?.cancelled) {
        const reviewCount = Number(result?.conflicts || 0) + Number(result?.ambiguous || 0) + Number(result?.invalid || 0) + Number(result?.failed || 0);
        if (reviewCount === 0) {
          setTimeout(() => {
            setImportPreview(null);
            setImportError("");
          }, 1200);
        }
      }
    } catch (err) {
      console.error("Import failed:", err);
      setImportError(err?.response?.data?.error || err?.message || "Import failed. No unsafe retry was attempted.");
      await refreshTrackedImport().catch(() => null);
    } finally {
      setImportApplyBusy(false);
    }
  };

  const downloadImportIssues = () => {
    const issues = importPreview?.appliedResult?.issues || importPreview?.issues || [];
    if (!issues.length) return;
    const rows = issues.map((issue) => ({
      "Spreadsheet Row": issue.row ?? "",
      "Customer": issue.customer || "",
      "Est/Inv": issue.est_inv_at || "",
      "Type": issue.type || "",
      "Reason": issue.message || "",
      "Fields": Array.isArray(issue.fields) ? issue.fields.join(", ") : "",
      "Matching WorkOrder IDs": Array.isArray(issue.match_ids) ? issue.match_ids.join(", ") : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import Issues");
    const stamp = format(new Date(), "yyyy-MM-dd_HHmm");
    XLSX.writeFile(wb, `sales_import_issues_${stamp}.xlsx`);
  };

  const handleCreateFromForm = async (data) => {
    const activityStamp = new Date().toISOString();
    const { record: newOrder } = await createWorkOrderWithRecovery({
      data: {
        ...data,
        current_stage: "sales",
        sales_status: "lead",
        in_pipeline: true,
        sales_last_activity_at: activityStamp,
        sales_stage_changed_at: activityStamp,
      },
      label: "Sales Pipeline form Work Order",
    });
    setWorkOrders(prev => [newOrder, ...prev.filter(wo => wo.id !== newOrder.id)]);
    markWorkOrderNeedsSync(newOrder.id);
  };

  React.useImperativeHandle(ref, () => ({
    addNewRow,
    exportToExcel,
    importFromExcel: () => fileInputRef.current?.click(),
    openImportHistory: () => setShowImportHistory(true),
    saveAndSync,
    handleCreateFromForm
  }));

  const applyCustomFilter = (wo, conditions) => {
    if (!conditions || conditions.length === 0) return true;
    
    // Group conditions by field for "is" operator - multiple "is" on same field = OR
    const conditionsByField = {};
    const otherConditions = [];
    
    conditions.forEach(condition => {
      if (condition.operator === "is" || condition.operator === "equals") {
        const key = condition.field;
        if (!conditionsByField[key]) {
          conditionsByField[key] = [];
        }
        conditionsByField[key].push(condition.value);
      } else {
        otherConditions.push(condition);
      }
    });
    
    // Check grouped "is" conditions - ANY value matching = pass (OR logic within same field)
    for (const [field, values] of Object.entries(conditionsByField)) {
      const fieldValue = wo[field];
      // If ANY of the values match, this field passes. Date-typed filters
      // compare calendar days so timestamp-backed fields can match date-only cutoffs.
      const fieldPasses = isSalesDateFilterField(field)
        ? values.some((val) => salesDateFilterEquals(fieldValue, val))
        : isSalesUserFilterField(field)
          ? values.some((val) => personValuesReferToSameUser(fieldValue, val, salesFilterUsersForField(field, users)))
          : values.some((val) => fieldValue == val);
      if (!fieldPasses) return false;
    }
    
    // Check other conditions with AND logic
    return otherConditions.every(condition => {
      const fieldValue = wo[condition.field];
      const condValue = condition.value;
      
      switch (condition.operator) {
        case "is_not":
          return isSalesDateFilterField(condition.field)
            ? !salesDateFilterEquals(fieldValue, condValue)
            : isSalesUserFilterField(condition.field)
              ? !personValuesReferToSameUser(fieldValue, condValue, salesFilterUsersForField(condition.field, users))
              : fieldValue != condValue;
        case "is_one_of": {
          const vals = (condValue || "").split(",").filter(Boolean).map(v => v.trim());
          if (vals.length === 0) return true;
          const fv = fieldValue != null ? String(fieldValue) : "";
          return isSalesDateFilterField(condition.field)
            ? vals.some((value) => salesDateFilterEquals(fieldValue, value))
            : isSalesUserFilterField(condition.field)
              ? vals.some((value) => personValuesReferToSameUser(fieldValue, value, salesFilterUsersForField(condition.field, users)))
              : vals.some((value) => fv == value);
        }
        case "is_not_one_of": {
          const vals = (condValue || "").split(",").filter(Boolean).map(v => v.trim());
          if (vals.length === 0) return true;
          const fv = fieldValue != null ? String(fieldValue) : "";
          return isSalesDateFilterField(condition.field)
            ? !vals.some((value) => salesDateFilterEquals(fieldValue, value))
            : isSalesUserFilterField(condition.field)
              ? !vals.some((value) => personValuesReferToSameUser(fieldValue, value, salesFilterUsersForField(condition.field, users)))
              : !vals.some((value) => fv == value);
        }
        case "contains":
          return fieldValue?.toString().toLowerCase().includes(condValue.toLowerCase());
        case "greater_than":
          return isSalesDateFilterField(condition.field)
            ? compareSalesDateFilterRange(fieldValue, condValue, condition.operator)
            : parseFloat(fieldValue) > parseFloat(condValue);
        case "less_than":
          return isSalesDateFilterField(condition.field)
            ? compareSalesDateFilterRange(fieldValue, condValue, condition.operator)
            : parseFloat(fieldValue) < parseFloat(condValue);
        case "not_empty":
          return fieldValue != null && fieldValue !== "";
        case "empty":
          return fieldValue == null || fieldValue === "";
        default:
          return true;
      }
    });
  };

  const handleSort = useCallback((key) => {
    const newDirection = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    handleColumnSort(key, newDirection);
  }, [sortConfig, handleColumnSort]);

  const getSortIcon = useCallback((key) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="w-3 h-3 text-gray-400" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-blue-600" />
      : <ArrowDown className="w-3 h-3 text-blue-600" />;
  }, [sortConfig]);

  const handleHeaderContextMenu = (e, fieldName, fieldLabel) => {
    e.preventDefault();
    e.stopPropagation();
    setHeaderContextMenu({
      x: e.clientX,
      y: e.clientY,
      fieldName,
      fieldLabel
    });
  };

  const handleHeaderContextMenuAction = (action) => {
    if (action === 'edit_lead_sources') {
      openEditDialog("lead_source", leadSources, "salesLeadSources");
    } else if (action === 'edit_task_descriptions') {
      openEditDialog("task_description", taskDescriptions, "salesTaskDescriptions");
    } else if (action === 'due_date_gradient') {
      setShowGradientDialog(true);
    }
    setHeaderContextMenu(null);
  };

  const todayStamp = format(new Date(), "yyyy-MM-dd");
  const upcomingDate = new Date();
  upcomingDate.setDate(upcomingDate.getDate() + 7);
  const upcomingStamp = format(upcomingDate, "yyyy-MM-dd");
  const nearCloseDate = parseLocalDate(todayStamp);
  nearCloseDate.setDate(nearCloseDate.getDate() + NEAR_CLOSE_DAYS);
  const nearCloseStamp = format(nearCloseDate, "yyyy-MM-dd");
  const staleCutoffDate = parseLocalDate(todayStamp);
  staleCutoffDate.setDate(staleCutoffDate.getDate() - STALE_ACTIVITY_DAYS);
  const staleCutoffTime = staleCutoffDate.getTime();
  const outcomeCutoffStamp = useMemo(() => {
    if (outcomePeriod === "all") return "";
    const days = Number(outcomePeriod);
    if (!Number.isFinite(days) || days <= 0) return "";
    const cutoff = parseLocalDate(todayStamp);
    cutoff.setDate(cutoff.getDate() - days);
    return format(cutoff, "yyyy-MM-dd");
  }, [outcomePeriod, todayStamp]);

  const currentOwnerIdentities = useMemo(() => {
    const direct = [currentUser?.full_name, currentUser?.name, currentUser?.email]
      .map(normalizeOwnerIdentity)
      .filter(Boolean);
    const directSet = new Set(direct);
    const matchedAuthorizedUsers = users.filter((user) => {
      const identities = [user?.full_name, user?.email].map(normalizeOwnerIdentity).filter(Boolean);
      return identities.some((identity) => directSet.has(identity));
    });
    matchedAuthorizedUsers.forEach((user) => {
      [user?.full_name, user?.email].map(normalizeOwnerIdentity).filter(Boolean).forEach((identity) => directSet.add(identity));
    });
    return directSet;
  }, [currentUser, users]);

  const currentSalesOwnerLabel = useMemo(() => {
    const currentEmail = normalizeOwnerIdentity(currentUser?.email);
    const currentNames = [currentUser?.full_name, currentUser?.name].map(normalizeOwnerIdentity).filter(Boolean);
    const match = users.find((user) => {
      const userEmail = normalizeOwnerIdentity(user?.email);
      const userName = normalizeOwnerIdentity(user?.full_name);
      return (currentEmail && userEmail === currentEmail) || (userName && currentNames.includes(userName));
    });
    return String(match?.full_name || currentUser?.full_name || currentUser?.name || "").trim();
  }, [currentUser, users]);

  const scopedWorkOrders = useMemo(() => workOrders.filter((wo) => {
    const legacyClosed = isLegacyClosedSalesRecord(wo);
    const trustedOutcome = isTrustedSalesOutcome(wo);
    if (recordScope === "current") return isCurrentPipelineOpportunity(wo);
    if (recordScope === "outcomes") {
      if (!trustedOutcome) return false;
      if (!outcomeCutoffStamp) return true;
      return Boolean(wo.close_date) && wo.close_date >= outcomeCutoffStamp && wo.close_date <= todayStamp;
    }
    if (recordScope === "history") return legacyClosed;
    return true;
  }), [workOrders, recordScope, outcomeCutoffStamp, todayStamp]);

  const pipelineSummary = useMemo(() => {
    const operational = scopedWorkOrders.filter(isCurrentPipelineOpportunity);
    const summary = operational.reduce((summary, wo) => {
      const followUp = wo.follow_up_date || "";
      const value = Number(wo.estimate_amount ?? 0) || 0;
      summary.openCount += 1;
      summary.openValue += value;
      const source = String(wo.lead_source || "").trim();
      if (source) summary.sourceCoverageCount += 1;
      else summary.sourceMissingCount += 1;
      const stageAgeDays = getStageAgeDays(wo, parseLocalDate(todayStamp));
      if (stageAgeDays !== null) {
        summary.stageAgeCoverageCount += 1;
        summary.stageAgeDaysTotal += stageAgeDays;
        summary.stageAgeDaysCount += 1;
        summary.oldestStageAgeDays = Math.max(summary.oldestStageAgeDays, stageAgeDays);
        if (isStageAgedOpportunity(wo, parseLocalDate(todayStamp))) summary.stageAgedCount += 1;
        const stageBucket = stageAgeDays >= 30
          ? summary.stageAgingBuckets[3]
          : stageAgeDays >= STAGE_AGING_DAYS
            ? summary.stageAgingBuckets[2]
            : stageAgeDays >= 7
              ? summary.stageAgingBuckets[1]
              : summary.stageAgingBuckets[0];
        stageBucket.count += 1;
        stageBucket.value += value;
      } else {
        summary.stageAgeMissingCount += 1;
      }
      const ageDays = getOpportunityAgeDays(wo, todayStamp);
      if (ageDays !== null) {
        summary.ageDaysTotal += ageDays;
        summary.ageDaysCount += 1;
        summary.oldestAgeDays = Math.max(summary.oldestAgeDays, ageDays);
        if (ageDays >= 30) summary.age30PlusCount += 1;
        if (ageDays >= 90) summary.age90PlusCount += 1;
        const bucket = ageDays >= 90
          ? summary.agingBuckets[3]
          : ageDays >= 60
            ? summary.agingBuckets[2]
            : ageDays >= 30
              ? summary.agingBuckets[1]
              : summary.agingBuckets[0];
        bucket.count += 1;
        bucket.value += value;
      }
      const owner = normalizeOwnerIdentity(wo.sales_rep);
      if (owner) {
        summary.assignedOwnerCount += 1;
        if (currentOwnerIdentities.has(owner)) summary.myOpportunityCount += 1;
      } else {
        summary.unassignedOwnerCount += 1;
      }
      if (followUp && followUp < todayStamp) summary.overdueCount += 1;
      if (followUp === todayStamp) summary.dueTodayCount += 1;
      if (followUp && followUp <= todayStamp) summary.dueCount += 1;
      if (followUp > todayStamp && followUp <= upcomingStamp) summary.upcomingCount += 1;
      if (!followUp && !wo.current_task_deadline) summary.noNextActionCount += 1;
      else summary.nextActionCoverageCount += 1;
      if (hasSalesAttention(wo, parseLocalDate(todayStamp))) summary.needsAttentionCount += 1;
      if (isLikelySalesPlaceholder(wo)) {
        summary.placeholderCount += 1;
        summary.placeholderValue += value;
      }
      const quoteAging = getQuoteAgingState(wo, parseLocalDate(todayStamp));
      if (quoteAging.awaitingResponse) {
        summary.quoteAwaitingResponseCount += 1;
        if (!followUp) summary.quoteNoFollowUpCount += 1;
        else {
          summary.quoteScheduledFollowUpCount += 1;
          if (followUp <= todayStamp) summary.quoteDueCount += 1;
        }
        if (quoteAging.tracked) {
          summary.quoteTimingCoverageCount += 1;
          summary.quoteAgeDaysTotal += quoteAging.ageDays;
          summary.quoteAgeDaysCount += 1;
          summary.oldestQuoteAgeDays = Math.max(summary.oldestQuoteAgeDays, quoteAging.ageDays);
          if (quoteAging.aged) summary.quoteAgedCount += 1;
          if (quoteAging.veryAged) summary.quoteVeryAgedCount += 1;
          const quoteBucket = quoteAging.ageDays >= 30
            ? summary.quoteAgingBuckets[3]
            : quoteAging.ageDays >= QUOTE_REVIEW_DAYS
              ? summary.quoteAgingBuckets[2]
              : quoteAging.ageDays >= 7
                ? summary.quoteAgingBuckets[1]
                : summary.quoteAgingBuckets[0];
          quoteBucket.count += 1;
          quoteBucket.value += value;
        } else {
          summary.quoteTimingMissingCount += 1;
        }
      }
      if (wo.expected_close_date >= todayStamp && wo.expected_close_date <= nearCloseStamp) summary.nearCloseCount += 1;
      if (wo.expected_close_date && wo.expected_close_date < todayStamp) summary.overdueCloseCount += 1;
      const activityTime = getSalesActivityTime(wo);
      if (activityTime === null) {
        summary.untrackedActivityCount += 1;
      } else {
        summary.trackedActivityCount += 1;
        if (activityTime <= staleCutoffTime) summary.staleCount += 1;
      }
      return summary;
    }, {
      openCount: 0,
      openValue: 0,
      assignedOwnerCount: 0,
      unassignedOwnerCount: 0,
      myOpportunityCount: 0,
      overdueCount: 0,
      dueTodayCount: 0,
      dueCount: 0,
      upcomingCount: 0,
      noNextActionCount: 0,
      nextActionCoverageCount: 0,
      needsAttentionCount: 0,
      placeholderCount: 0,
      placeholderValue: 0,
      quoteAwaitingResponseCount: 0,
      quoteTimingCoverageCount: 0,
      quoteTimingMissingCount: 0,
      quoteNoFollowUpCount: 0,
      quoteScheduledFollowUpCount: 0,
      quoteDueCount: 0,
      quoteAgedCount: 0,
      quoteVeryAgedCount: 0,
      quoteAgeDaysTotal: 0,
      quoteAgeDaysCount: 0,
      averageQuoteAgeDays: 0,
      oldestQuoteAgeDays: 0,
      quoteAgingBuckets: [
        { key: "quote_under_7", label: "0–6 days", count: 0, value: 0 },
        { key: "quote_7_13", label: "7–13 days", count: 0, value: 0 },
        { key: "quote_14_29", label: "14–29 days", count: 0, value: 0 },
        { key: "quote_30_plus", label: "30+ days", count: 0, value: 0 },
      ],
      quoteOwnerBreakdown: [],
      nearCloseCount: 0,
      overdueCloseCount: 0,
      staleCount: 0,
      trackedActivityCount: 0,
      untrackedActivityCount: 0,
      sourceCoverageCount: 0,
      sourceMissingCount: 0,
      sourceBreakdown: [],
      stageAgeCoverageCount: 0,
      stageAgeMissingCount: 0,
      stageAgedCount: 0,
      stageAgeDaysTotal: 0,
      stageAgeDaysCount: 0,
      averageStageAgeDays: 0,
      oldestStageAgeDays: 0,
      stageAgingBuckets: [
        { key: "stage_under_7", label: "0–6 days", count: 0, value: 0 },
        { key: "stage_7_13", label: "7–13 days", count: 0, value: 0 },
        { key: "stage_14_29", label: "14–29 days", count: 0, value: 0 },
        { key: "stage_30_plus", label: "30+ days", count: 0, value: 0 },
      ],
      stageBreakdown: [],
      age30PlusCount: 0,
      age90PlusCount: 0,
      ageDaysTotal: 0,
      ageDaysCount: 0,
      averageAgeDays: 0,
      oldestAgeDays: 0,
      agingBuckets: [
        { key: "under_30", label: "0–29 days", count: 0, value: 0 },
        { key: "30_59", label: "30–59 days", count: 0, value: 0 },
        { key: "60_89", label: "60–89 days", count: 0, value: 0 },
        { key: "90_plus", label: "90+ days", count: 0, value: 0 },
      ],
      ownerWorkload: [],
      trackedOutcomeCount: 0,
      totalTrackedOutcomeCount: 0,
      wonCount: 0,
      lostCount: 0,
      wonValue: 0,
      lostValue: 0,
      closedValue: 0,
      trackedWinRate: null,
      closeDateMissingCount: 0,
      lostReasonMissingCount: 0,
      lostReasonBreakdown: [],
      ownerOutcomePerformance: [],
      sourceOutcomePerformance: [],
    });

    summary.averageAgeDays = summary.ageDaysCount > 0 ? Math.round(summary.ageDaysTotal / summary.ageDaysCount) : 0;
    summary.averageStageAgeDays = summary.stageAgeDaysCount > 0 ? Math.round(summary.stageAgeDaysTotal / summary.stageAgeDaysCount) : 0;
    summary.averageQuoteAgeDays = summary.quoteAgeDaysCount > 0 ? Math.round(summary.quoteAgeDaysTotal / summary.quoteAgeDaysCount) : 0;
    const ownerWorkload = new Map();
    const sourceMix = new Map();
    const stageMix = new Map();
    const quoteOwnerMix = new Map();
    operational.forEach((wo) => {
      const value = Number(wo.estimate_amount ?? 0) || 0;
      const followUp = wo.follow_up_date || "";
      const ownerLabel = buildSalesPersonSelectModel(wo.sales_rep, users).canonical || "Unassigned";
      const ownerKey = normalizeOwnerIdentity(ownerLabel) || "__unassigned__";
      const ownerRow = ownerWorkload.get(ownerKey) || { owner: ownerLabel, count: 0, value: 0, dueCount: 0, age90Count: 0 };
      ownerRow.count += 1;
      ownerRow.value += value;
      if (followUp && followUp <= todayStamp) ownerRow.dueCount += 1;
      const ageDays = getOpportunityAgeDays(wo, todayStamp);
      if (ageDays !== null && ageDays >= 90) ownerRow.age90Count += 1;
      ownerWorkload.set(ownerKey, ownerRow);

      const source = String(wo.lead_source || "").trim();
      if (source) {
        const sourceKey = source.toLowerCase();
        const sourceRow = sourceMix.get(sourceKey) || { source, count: 0, value: 0 };
        sourceRow.count += 1;
        sourceRow.value += value;
        sourceMix.set(sourceKey, sourceRow);
      }

      if (isQuoteAwaitingResponse(wo)) {
        const quoteOwnerLabel = buildSalesPersonSelectModel(wo.sales_rep, users).canonical || "Unassigned";
        const quoteOwnerKey = normalizeOwnerIdentity(quoteOwnerLabel) || "__unassigned__";
        const quoteRow = quoteOwnerMix.get(quoteOwnerKey) || { owner: quoteOwnerLabel, count: 0, value: 0, trackedCount: 0, missingCount: 0, agedCount: 0, veryAgedCount: 0, noFollowUpCount: 0 };
        quoteRow.count += 1;
        quoteRow.value += value;
        if (!followUp) quoteRow.noFollowUpCount += 1;
        const quoteAging = getQuoteAgingState(wo, parseLocalDate(todayStamp));
        if (quoteAging.tracked) {
          quoteRow.trackedCount += 1;
          if (quoteAging.aged) quoteRow.agedCount += 1;
          if (quoteAging.veryAged) quoteRow.veryAgedCount += 1;
        } else {
          quoteRow.missingCount += 1;
        }
        quoteOwnerMix.set(quoteOwnerKey, quoteRow);
      }

      const stageKey = wo.sales_status || "lead";
      const stageLabel = SALES_STATUSES.find((status) => status.value === stageKey)?.label || stageKey;
      const stageRow = stageMix.get(stageKey) || { stage: stageKey, label: stageLabel, count: 0, value: 0, trackedCount: 0, ageDaysTotal: 0, agedCount: 0 };
      stageRow.count += 1;
      stageRow.value += value;
      const stageAgeDays = getStageAgeDays(wo, parseLocalDate(todayStamp));
      if (stageAgeDays !== null) {
        stageRow.trackedCount += 1;
        stageRow.ageDaysTotal += stageAgeDays;
        if (isStageAgedOpportunity(wo, parseLocalDate(todayStamp))) stageRow.agedCount += 1;
      }
      stageMix.set(stageKey, stageRow);
    });
    summary.ownerWorkload = [...ownerWorkload.values()].sort((a, b) => {
      if (a.owner === "Unassigned") return 1;
      if (b.owner === "Unassigned") return -1;
      return b.value - a.value || b.count - a.count || a.owner.localeCompare(b.owner);
    });
    summary.sourceBreakdown = [...sourceMix.values()].sort((a, b) => b.count - a.count || b.value - a.value || a.source.localeCompare(b.source));
    summary.quoteOwnerBreakdown = [...quoteOwnerMix.values()].sort((a, b) => b.agedCount - a.agedCount || b.noFollowUpCount - a.noFollowUpCount || b.value - a.value || a.owner.localeCompare(b.owner));
    summary.stageBreakdown = [...stageMix.values()].map((row) => ({
      ...row,
      averageDays: row.trackedCount > 0 ? Math.round(row.ageDaysTotal / row.trackedCount) : null,
    })).sort((a, b) => SALES_STATUSES.findIndex((status) => status.value === a.stage) - SALES_STATUSES.findIndex((status) => status.value === b.stage));

    const allTrustedOutcomes = workOrders.filter(isTrustedSalesOutcome);
    // Outcome Period is a control of the dedicated Outcomes workspace only.
    // Do not let a previously selected period silently narrow Current → Insights,
    // where there is no visible period control and reporting is intentionally all-time.
    const reportingOutcomeCutoffStamp = recordScope === "outcomes" ? outcomeCutoffStamp : "";
    const reportingOutcomes = allTrustedOutcomes.filter((wo) => {
      if (!reportingOutcomeCutoffStamp) return true;
      return Boolean(wo.close_date) && wo.close_date >= reportingOutcomeCutoffStamp && wo.close_date <= todayStamp;
    });
    summary.totalTrackedOutcomeCount = allTrustedOutcomes.length;
    summary.trackedOutcomeCount = reportingOutcomes.length;
    summary.closeDateMissingCount = allTrustedOutcomes.filter((wo) => !wo.close_date).length;
    summary.lostReasonMissingCount = allTrustedOutcomes.filter((wo) => wo.sales_status === "lost" && !String(wo.lost_reason || "").trim()).length;

    const lostReasons = new Map();
    reportingOutcomes.forEach((wo) => {
      const value = Number(wo.estimate_amount ?? 0) || 0;
      summary.closedValue += value;
      if (wo.sales_status === "won") {
        summary.wonCount += 1;
        summary.wonValue += value;
      } else if (wo.sales_status === "lost") {
        summary.lostCount += 1;
        summary.lostValue += value;
        const reason = String(wo.lost_reason || "").trim();
        if (reason) lostReasons.set(reason, (lostReasons.get(reason) || 0) + 1);
      }
    });
    summary.trackedWinRate = summary.trackedOutcomeCount > 0
      ? (summary.wonCount / summary.trackedOutcomeCount) * 100
      : null;
    summary.lostReasonBreakdown = [...lostReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

    const buildOutcomePerformance = (field, fallbackLabel) => {
      const grouped = new Map();
      reportingOutcomes.forEach((wo) => {
        const rawLabel = String(wo[field] || "").trim();
        const label = field === "sales_rep"
          ? (buildSalesPersonSelectModel(rawLabel, users).canonical || fallbackLabel)
          : (rawLabel || fallbackLabel);
        const key = label.toLowerCase();
        const row = grouped.get(key) || { label, total: 0, won: 0, lost: 0, closedValue: 0, wonValue: 0, winRate: null };
        const value = Number(wo.estimate_amount ?? 0) || 0;
        row.total += 1;
        row.closedValue += value;
        if (wo.sales_status === "won") {
          row.won += 1;
          row.wonValue += value;
        } else if (wo.sales_status === "lost") {
          row.lost += 1;
        }
        grouped.set(key, row);
      });
      return [...grouped.values()].map((row) => ({
        ...row,
        winRate: row.total > 0 ? (row.won / row.total) * 100 : null,
      })).sort((a, b) => b.total - a.total || b.closedValue - a.closedValue || a.label.localeCompare(b.label));
    };
    summary.ownerOutcomePerformance = buildOutcomePerformance("sales_rep", "Unassigned");
    summary.sourceOutcomePerformance = buildOutcomePerformance("lead_source", "Unspecified");
    return summary;
  }, [scopedWorkOrders, workOrders, recordScope, todayStamp, upcomingStamp, nearCloseStamp, staleCutoffTime, currentOwnerIdentities, outcomeCutoffStamp, users]);

  useEffect(() => {
    onSummaryChange?.(pipelineSummary);
  }, [pipelineSummary, onSummaryChange]);

  // Pre-compute sort values for faster sorting
  const sortedWorkOrders = useMemo(() => {
    // First filter
    let result = scopedWorkOrders.filter(wo => {
      if (!matchesAttentionFilter(wo, attentionFilter, todayStamp, upcomingStamp, nearCloseStamp, staleCutoffTime, currentOwnerIdentities)) return false;

      if (filterStatus !== "all" && !filterStatus.startsWith("custom_")) {
        if (wo.sales_status !== filterStatus) return false;
      }
      
      if (filterStatus.startsWith("custom_")) {
        const filterId = filterStatus.replace("custom_", "");
        const customFilter = customFilters.find(f => f.id === filterId);
        if (customFilter && !applyCustomFilter(wo, customFilter.conditions)) return false;
      }
      
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const searchable = [
          wo.title,
          wo.client_name,
          wo.contact_name,
          wo.contact_email,
          wo.contact_phone,
          salesPersonSearchText(wo.sales_rep, users),
          salesPersonSearchText(wo.estimator, users, "Estimator"),
          salesPersonSearchText(wo.project_manager, users, "PM"),
          salesPersonSearchText(wo.designer, users, "Designer"),
          salesPersonSearchText(wo.current_task_assigned_to, users, "Task Assigned"),
          wo.current_task_description,
          wo.description,
          wo.est_inv_at,
          wo.corbridge_invoice_number,
          wo.install_location,
          wo.billing_address,
          wo.township_city,
          wo.county,
          wo.project_type,
          wo.lead_source,
          wo.expected_close_date,
          wo.sales_last_follow_up_outcome,
          wo.lost_reason,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(search)) return false;
      }
      
      return true;
    });

    // Apply custom filter from column sorting
    if (sortConfig.customFilter && sortConfig.customFilter.filterType !== 'all') {
      const filter = sortConfig.customFilter;
      
      if (filter.filterType === 'selected' && filter.selectedValues?.length > 0) {
        result = result.filter(item => {
          const value = item[sortConfig.key];
          if (value == null) return false;
          if (isSalesUserFilterField(sortConfig.key)) {
            const roleUsers = salesFilterUsersForField(sortConfig.key, users);
            return filter.selectedValues.some((selectedValue) =>
              personValuesReferToSameUser(value, selectedValue, roleUsers)
            );
          }
          return filter.selectedValues.includes(String(value));
        });
      }
      
      if (filter.filterType === 'range' && filter.dateRange) {
        const { from, to } = filter.dateRange;
        result = result.filter(item => {
          const value = item[sortConfig.key];
          if (!value) return false;
          const date = new Date(value);
          if (isNaN(date.getTime())) return false;
          if (from && date < new Date(from)) return false;
          if (to && date > new Date(to)) return false;
          return true;
        });
      }
      
      if (filter.filterType === 'range' && filter.numberRange) {
        const { from, to } = filter.numberRange;
        result = result.filter(item => {
          const value = parseFloat(item[sortConfig.key]);
          if (isNaN(value)) return false;
          if (from !== null && value < from) return false;
          if (to !== null && value > to) return false;
          return true;
        });
      }
    }

    if (!sortConfig.key) {
      if (attentionFilter === "needs_attention") {
        return [...result].sort((a, b) => {
          const scoreDiff = getSalesAttentionScore(b, parseLocalDate(todayStamp)) - getSalesAttentionScore(a, parseLocalDate(todayStamp));
          if (scoreDiff !== 0) return scoreDiff;
          const aValue = Number(a.estimate_amount ?? 0) || 0;
          const bValue = Number(b.estimate_amount ?? 0) || 0;
          return bValue - aValue;
        });
      }
      return result;
    }
    
    // Pre-compute sort keys for performance
    const key = sortConfig.key;
    const isDateField = key.includes('date') || key === 'current_task_deadline';
    const isNumberField = key === 'estimate_amount';
    const personRoleByField = {
      sales_rep: null,
      current_task_assigned_to: "Task Assigned",
      designer: "Designer",
      project_manager: "PM",
      estimator: "Estimator",
    };
    const isPersonField = Object.prototype.hasOwnProperty.call(personRoleByField, key);
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    
    return result.sort((a, b) => {
      let aVal = a[key] ?? '';
      let bVal = b[key] ?? '';

      if (isPersonField) {
        const role = personRoleByField[key];
        aVal = buildSalesPersonSelectModel(aVal, users, role).canonical;
        bVal = buildSalesPersonSelectModel(bVal, users, role).canonical;
      }
      
      if (isDateField) {
        const aDate = aVal ? new Date(aVal) : null;
        const bDate = bVal ? new Date(bVal) : null;
        aVal = aDate && !isNaN(aDate.getTime()) ? aDate.getTime() : 0;
        bVal = bDate && !isNaN(bDate.getTime()) ? bDate.getTime() : 0;
      } else if (isNumberField) {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }
      
      return aVal < bVal ? -dir : aVal > bVal ? dir : 0;
    });
  }, [scopedWorkOrders, filterStatus, attentionFilter, todayStamp, upcomingStamp, nearCloseStamp, staleCutoffTime, currentOwnerIdentities, searchTerm, sortConfig, customFilters, users]);

  const filteredWorkOrders = sortedWorkOrders;
  const filteredWorkOrdersRef = useRef(filteredWorkOrders);

  useEffect(() => {
    filteredWorkOrdersRef.current = filteredWorkOrders;
  }, [filteredWorkOrders]);

  useEffect(() => {
    if (!selectedWorkOrder?.id) {
      selectedQueueIndexRef.current = null;
      return;
    }
    const currentIndex = filteredWorkOrders.findIndex((row) => row.id === selectedWorkOrder.id);
    if (currentIndex >= 0) {
      selectedQueueIndexRef.current = currentIndex;
      return;
    }

    // Filters/search can remove the row that owns an open details/action dialog.
    // Close that row-bound surface rather than leaving a hidden, no-longer-visible
    // opportunity actionable against the newly filtered queue.
    setSelectedWorkOrder(null);
    setShowFullWorkOrderDetails(false);
    setStatusTransition(null);
    setFollowUpCompletion(null);
    setCorbridgeDialog({ open: false, workOrder: null });
    setCorbridgeDraft({ invoiceNumber: "", link: "" });
    setCorbridgeSaveError("");
    selectedQueueIndexRef.current = null;
  }, [selectedWorkOrder?.id, filteredWorkOrders]);

  const selectedQueueIndex = selectedWorkOrder?.id
    ? filteredWorkOrders.findIndex((row) => row.id === selectedWorkOrder.id)
    : -1;
  const selectedQueueAnchor = selectedQueueIndex >= 0
    ? selectedQueueIndex
    : Number.isInteger(selectedQueueIndexRef.current)
      ? selectedQueueIndexRef.current
      : 0;
  const canNavigatePrevious = Boolean(selectedWorkOrder) && filteredWorkOrders.length > 0 && (
    selectedQueueIndex >= 0 ? selectedQueueIndex > 0 : selectedQueueAnchor > 0
  );
  const canNavigateNext = Boolean(selectedWorkOrder) && filteredWorkOrders.length > 0 && (
    selectedQueueIndex >= 0 ? selectedQueueIndex < filteredWorkOrders.length - 1 : selectedQueueAnchor < filteredWorkOrders.length
  );
  const navigateSelectedOpportunity = (direction) => {
    if (!selectedWorkOrder || filteredWorkOrders.length === 0) return;
    const currentIndex = filteredWorkOrders.findIndex((row) => row.id === selectedWorkOrder.id);
    const anchor = currentIndex >= 0
      ? currentIndex
      : Number.isInteger(selectedQueueIndexRef.current)
        ? selectedQueueIndexRef.current
        : 0;
    const targetIndex = currentIndex >= 0
      ? currentIndex + direction
      : direction > 0
        ? anchor
        : anchor - 1;
    if (targetIndex < 0 || targetIndex >= filteredWorkOrders.length) return;
    selectedQueueIndexRef.current = targetIndex;
    setSelectedWorkOrder(filteredWorkOrders[targetIndex]);
    setShowFullWorkOrderDetails(false);
  };

  const waitForPendingSalesSave = async (orderId) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (!pendingChangesRef.current[orderId] && !debounceTimers.current[orderId]) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("This opportunity still has a Sales quick edit waiting to save. Resolve the save warning or reload latest before removing it from Current Pipeline.");
  };

  const removeFromCurrentPipeline = async (workOrder, { advance = false } = {}) => {
    if (!isRegistered || !workOrder?.id || workOrder.in_pipeline !== true || !isLikelySalesPlaceholder(workOrder)) {
      return { ok: false, message: "Only explicitly flagged test/placeholder opportunities can use this cleanup action." };
    }
    setQuickEditError("");
    try {
      await waitForPendingSalesSave(workOrder.id);
      const queueBeforeRemoval = filteredWorkOrdersRef.current;
      const queueIndex = queueBeforeRemoval.findIndex((row) => row.id === workOrder.id);
      const nextOpportunity = advance && queueIndex >= 0 ? queueBeforeRemoval[queueIndex + 1] || null : null;
      const latest = await WorkOrder.get(workOrder.id);
      if (!latest?.id) throw new Error("The WorkOrder could not be reloaded before cleanup.");
      if (!isLikelySalesPlaceholder(latest)) {
        throw new Error("This WorkOrder no longer matches the explicit test/placeholder rule. Cleanup was blocked rather than removing a potentially valid opportunity.");
      }
      if (latest.in_pipeline !== true) {
        setWorkOrders((current) => current.map((row) => row.id === latest.id ? { ...row, ...latest } : row));
        if (advance) {
          if (nextOpportunity) {
            selectedQueueIndexRef.current = queueIndex;
            setSelectedWorkOrder(nextOpportunity);
            setShowFullWorkOrderDetails(false);
          } else {
            selectedQueueIndexRef.current = null;
            setSelectedWorkOrder(null);
            setShowFullWorkOrderDetails(false);
          }
        } else {
          setSelectedWorkOrder((selected) => selected?.id === latest.id ? { ...selected, ...latest } : selected);
        }
        return { ok: true, alreadyRemoved: true };
      }
      const activityStamp = new Date().toISOString();
      const saved = await replaceWorkOrderFieldsIfUnchanged({
        workOrderId: latest.id,
        expectedFields: {
          in_pipeline: latest.in_pipeline,
          sales_last_activity_at: latest.sales_last_activity_at,
        },
        nextFields: {
          in_pipeline: false,
          sales_last_activity_at: activityStamp,
        },
        label: "Sales Pipeline membership removal",
      });

      await trackChange(latest.id, "in_pipeline", latest.in_pipeline, saved.in_pipeline);
      setWorkOrders((current) => current.map((row) => row.id === saved.id ? { ...row, ...saved } : row));
      if (advance) {
        if (nextOpportunity) {
          selectedQueueIndexRef.current = queueIndex;
          setSelectedWorkOrder(nextOpportunity);
          setShowFullWorkOrderDetails(false);
        } else {
          selectedQueueIndexRef.current = null;
          setSelectedWorkOrder(null);
          setShowFullWorkOrderDetails(false);
        }
      } else {
        setSelectedWorkOrder((selected) => selected?.id === saved.id ? { ...selected, ...saved } : selected);
      }
      return { ok: true };
    } catch (error) {
      console.error("Could not remove Sales Pipeline membership safely:", error);
      const message = error?.message || "This opportunity could not be removed from Current Pipeline safely.";
      setQuickEditError(message);
      return { ok: false, message };
    }
  };

  // Virtual scrolling setup
  const parentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredWorkOrders.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 5,
  });

  const visibleColumnIds = useMemo(
    () => getVisibleSalesColumnIds(activeColumnPreset),
    [activeColumnPreset],
  );

  const handleContextMenu = useCallback((e, wo, fieldName, fieldLabel, currentValue) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      workOrder: wo,
      fieldName,
      fieldLabel,
      currentValue
    });
  }, []);

  const clearCell = (woId, fieldName) => {
    updateWorkOrder(woId, fieldName, "");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const quickEditWarning = quickEditError ? (
    <div className="mx-2 mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
      <div className="font-medium">Sales Pipeline quick edit save blocked</div>
      <div className="mt-1">{quickEditError}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span>Reloading discards unsaved quick edits and keeps the newer saved Work Order values.</span>
        <Button type="button" size="sm" variant="outline" onClick={discardPendingQuickEdits} className="h-7 shrink-0 border-red-300 bg-white text-red-800">
          Reload latest
        </Button>
      </div>
    </div>
  ) : null;

  const destructiveActionWarning = destructiveActionError ? (
    <div className="mx-2 mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
      <div className="font-medium">Sales Pipeline delete action blocked or stopped</div>
      <div className="mt-1">{destructiveActionError}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span>Reload the verified Sales Pipeline before attempting another delete.</span>
        <Button type="button" size="sm" variant="outline" onClick={async () => { setDestructiveActionError(""); await loadWorkOrders(false); }} className="h-7 shrink-0 border-red-300 bg-white text-red-800">
          Reload latest
        </Button>
      </div>
    </div>
  ) : null;

  const globalSettingsWarning = globalSettingsError ? (
    <div className="mx-2 mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
      <div className="font-medium">Sales Pipeline settings update blocked</div>
      <div className="mt-1">{globalSettingsError}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span>No additional list or deadline-setting saves will run until the latest settings are reloaded.</span>
        <Button type="button" size="sm" variant="outline" onClick={async () => { setGlobalSettingsError(""); await loadGlobalSettings(); }} className="h-7 shrink-0 border-red-300 bg-white text-red-800">
          Reload latest
        </Button>
      </div>
    </div>
  ) : null;

  const archivePagingNotice = archiveHasMore && ["history", "all"].includes(recordScope) ? (
    <div className="mx-2 mb-2 flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700 sm:flex-row sm:items-center sm:justify-between">
      <span>
        {recordScope === "history"
          ? `Showing the newest ${archiveSkipRef.current.toLocaleString()} legacy Sales history records. Older history is available on demand.`
          : `Showing the newest ${archiveSkipRef.current.toLocaleString()} active inspection records plus authoritative modern outcomes. Older active records are available on demand.`}
      </span>
      <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 bg-white" onClick={loadMoreArchive} disabled={archiveLoadingMore}>
        {archiveLoadingMore ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Loading older…</> : "Load older records"}
      </Button>
    </div>
  ) : null;

  const refreshSelectedWorkOrder = async () => {
    if (!selectedWorkOrder?.id) return;
    try {
      const latest = await WorkOrder.get(selectedWorkOrder.id);
      if (!latest?.id) return;
      setWorkOrders((current) => current.map((row) => row.id === latest.id ? latest : row));
      setSelectedWorkOrder(latest);
    } catch (error) {
      console.error("Could not refresh selected Sales Pipeline Work Order:", error);
      await loadWorkOrders(false);
    }
  };

  const renderOpportunityDialogs = () => (
    <>
      {selectedWorkOrder && !showFullWorkOrderDetails && (
        <SalesOpportunityDialog
          workOrder={selectedWorkOrder}
          users={users}
          leadSources={leadSources}
          isRegistered={isRegistered}
          onClose={() => setSelectedWorkOrder(null)}
          onUpdateFields={updateWorkOrderFields}
          onRemoveFromCurrentPipeline={removeFromCurrentPipeline}
          onRequestStatusChange={requestSalesStatusChange}
          onCompleteFollowUp={requestFollowUpCompletion}
          onOpenFullDetails={() => setShowFullWorkOrderDetails(true)}
          currentSalesOwnerLabel={currentSalesOwnerLabel}
          queueNavigation={{
            total: filteredWorkOrders.length,
            index: selectedQueueIndex,
            canPrevious: canNavigatePrevious,
            canNext: canNavigateNext,
            onPrevious: () => navigateSelectedOpportunity(-1),
            onNext: () => navigateSelectedOpportunity(1),
          }}
        />
      )}
      {selectedWorkOrder && showFullWorkOrderDetails && (
        <WorkOrderDetailsDialog
          isOpen={true}
          workOrder={selectedWorkOrder}
          onClose={() => setShowFullWorkOrderDetails(false)}
          onUpdate={async () => {
            markWorkOrderNeedsSync(selectedWorkOrder.id);
            await refreshSelectedWorkOrder();
          }}
          onMove={async (wo, newStage) => {
            try {
              await transitionWorkOrderFromLoadedSnapshot({ workOrder: wo, newStage, label: "Sales Pipeline details stage transition" });
              await refreshSelectedWorkOrder();
            } catch (error) {
              console.error("Error moving Sales Pipeline Work Order:", error);
              alert(error?.message || "This Work Order changed in another session. Reload and try the transition again.");
              await refreshSelectedWorkOrder();
            }
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
                rider_stage: wo.current_stage,
                sales_status: wo.sales_status,
              },
              label: "Sales Pipeline rider Work Order",
            });
            await loadWorkOrders(false);
          }}
          onComplete={async (wo) => {
            try {
              await transitionWorkOrderFromLoadedSnapshot({ workOrder: wo, newStage: wo.current_stage, completed: true, label: "Sales Pipeline details completion" });
              setWorkOrders((current) => current.filter((row) => row.id !== wo.id));
              setSelectedWorkOrder(null);
              setShowFullWorkOrderDetails(false);
            } catch (error) {
              console.error("Error completing Sales Pipeline Work Order:", error);
              alert(error?.message || "This Work Order changed in another session. Reload and try completion again.");
              await loadWorkOrders(false);
            }
          }}
          onDelete={async (wo) => {
            setDestructiveActionError("");
            try {
              await softDeleteWorkOrderFromLoadedSnapshot({
                workOrder: wo,
                deletedBy: currentUser?.email || "unknown",
                label: "Sales Pipeline details Work Order delete",
              });
              setWorkOrders((current) => current.filter((row) => row.id !== wo.id));
              setSelectedWorkOrder(null);
              setShowFullWorkOrderDetails(false);
            } catch (error) {
              console.error("Sales Pipeline details Work Order delete blocked:", error);
              setDestructiveActionError(error?.message || "This Work Order changed after the Sales Pipeline was loaded. Reload before deleting it.");
              await loadWorkOrders(false);
              throw error;
            }
          }}
        />
      )}
      <SalesStatusTransitionDialog
        transition={statusTransition}
        onClose={() => setStatusTransition(null)}
        onConfirm={confirmSalesStatusTransition}
      />
      <SalesFollowUpCompleteDialog
        workOrder={followUpCompletion}
        onClose={() => setFollowUpCompletion(null)}
        onConfirm={confirmFollowUpCompletion}
      />
    </>
  );

  if (viewMode === "insights" && recordScope === "current") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {quickEditWarning}
        {destructiveActionWarning}
        {globalSettingsWarning}
        {archivePagingNotice}
        <div className="min-h-0 flex-1">
          <SalesPipelineInsights summary={pipelineSummary} />
        </div>
        {renderOpportunityDialogs()}
      </div>
    );
  }

  if (viewMode === "daily" && recordScope === "current") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {quickEditWarning}
        {destructiveActionWarning}
        {globalSettingsWarning}
        <div className="min-h-0 flex-1">
          <SalesDailyQueue
            workOrders={filteredWorkOrders}
            onOpenDetails={openOpportunityDetails}
            onUpdateWorkOrder={updateWorkOrder}
            onCompleteFollowUp={requestFollowUpCompletion}
            isRegistered={isRegistered}
            currentSalesOwnerLabel={currentSalesOwnerLabel}
            users={users}
          />
        </div>
        {renderOpportunityDialogs()}
      </div>
    );
  }

  // Mobile card view
  if (isMobile && viewMode !== "board") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {quickEditWarning}
        {destructiveActionWarning}
        {globalSettingsWarning}
        {archivePagingNotice}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <SalesPipelineMobileCards users={users}
            workOrders={filteredWorkOrders}
            onOpenDetails={openOpportunityDetails}
            onUpdateWorkOrder={updateWorkOrder}
            onRequestStatusChange={requestSalesStatusChange}
            onCompleteFollowUp={requestFollowUpCompletion}
            isRegistered={isRegistered}
            currentSalesOwnerLabel={currentSalesOwnerLabel}
            leadSources={leadSources}
          />
        </div>
        {renderOpportunityDialogs()}
      </div>
    );
  }

  if (viewMode === "board") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {quickEditWarning}
        {destructiveActionWarning}
        {globalSettingsWarning}
        {archivePagingNotice}
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={importFromExcel} className="hidden" />
        <div className="min-h-0 flex-1">
          <SalesPipelineKanban
            users={users}
            workOrders={filteredWorkOrders}
            onUpdateWorkOrder={updateWorkOrder}
            onRequestStatusChange={requestSalesStatusChange}
            onCompleteFollowUp={requestFollowUpCompletion}
            onOpenDetails={openOpportunityDetails}
            isRegistered={isRegistered}
            currentSalesOwnerLabel={currentSalesOwnerLabel}
            leadSources={leadSources}
          />
        </div>
        {renderOpportunityDialogs()}
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col min-h-0 h-full overflow-visible" 
      tabIndex={0}
      onKeyDown={(e) => {
        if (focusedRowIndex !== null && filteredWorkOrders.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const newIndex = Math.min(focusedRowIndex + 1, filteredWorkOrders.length - 1);
            setFocusedRowIndex(newIndex);
            setFocusedRowId(filteredWorkOrders[newIndex].id);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const newIndex = Math.max(focusedRowIndex - 1, 0);
            setFocusedRowIndex(newIndex);
            setFocusedRowId(filteredWorkOrders[newIndex].id);
          } else if (e.key === 'Escape') {
            setFocusedRowId(null);
            setFocusedRowIndex(null);
          } else if (e.key === 'Enter') {
            const wo = filteredWorkOrders[focusedRowIndex];
            if (wo) setSelectedWorkOrder(wo);
          }
        }
      }}
      onClick={(e) => { 
        // Don't close menus if clicking inside a dialog/popover
        if (e.target.closest('[role="dialog"]') || e.target.closest('[data-radix-popper-content-wrapper]')) return;
        contextMenu && setContextMenu(null); 
        headerContextMenu && setHeaderContextMenu(null); 
      }}
    >
      {quickEditWarning}
      {destructiveActionWarning}
      {globalSettingsWarning}
      {archivePagingNotice}
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={importFromExcel}
        className="hidden"
        />

      {showButtonsInline && (
        <div className="flex items-center justify-between mb-2 px-2">
          <div className="flex gap-2">
            {isRegistered && (
              <Button onClick={addNewRow} className="clay-button border-none text-gray-800"
                style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}>
                <Plus className="w-4 h-4 mr-2" />
                New Client
              </Button>
            )}
            {canImportExport && (
              <>
                <Button 
                  onClick={() => fileInputRef.current?.click()} 
                  size="sm"
                  className="clay-button border-none text-gray-700 h-8"
                  style={{ background: 'linear-gradient(135deg, #FFE4D6 0%, #FFD6E8 100%)' }}
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Import
                </Button>
                <Button 
                  onClick={exportToExcel}
                  disabled={exportProgress.show}
                  size="sm" 
                  className="clay-button border-none text-gray-700 h-8"
                  style={{ background: 'linear-gradient(135deg, #D4E9F7 0%, #E0D4F7 100%)' }}
                >
                  {exportProgress.show ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                  Export
                </Button>
              </>
            )}

          </div>
          <span className="text-xs text-gray-500">{filteredWorkOrders.length} opportunities</span>
        </div>
      )}

      {exportProgress.show && (
        <div className="mb-3 px-2">
          <div className="clay-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Exporting...</span>
              <span className="text-xs text-gray-500">{exportProgress.progress}%</span>
            </div>
            <Progress value={exportProgress.progress} className="h-2" />
          </div>
        </div>
      )}

      {isAdmin && selectedRows.size > 0 && (
        <div className="mb-2 px-2">
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <span className="text-sm font-medium text-red-700">{selectedRows.size} row{selectedRows.size > 1 ? 's' : ''} selected</span>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setBulkDeleteConfirm(true)}
              className="h-7 px-2 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Delete Selected
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedRows(new Set())}
              className="h-7 px-2"
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      <div ref={parentRef} className="overflow-auto" style={{ flex: 1, minHeight: 0, height: 0 }}>
        <table className="w-full border-collapse border rounded-lg" style={{ fontSize: '12px', tableLayout: 'auto' }}>
          <thead className="sticky top-0 z-10 bg-gray-100 text-[11px] leading-tight [&_th]:whitespace-nowrap [&_th]:py-1">
            <tr className="h-7 border-b bg-gray-100">
              <th className="px-2 py-2 border-r text-center font-medium text-gray-700" style={{ width: '32px', minWidth: '32px' }}>#</th>
              {visibleColumnIds.map((columnId) => {
                  switch (columnId) {
                    case "client_name": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'client_name' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('client_name')} onContextMenu={(e) => handleHeaderContextMenu(e, 'client_name', 'Customer')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('client_name')}</div>
              </th>
                    );
                    case "sales_status": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'sales_status' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('sales_status')} onContextMenu={(e) => handleHeaderContextMenu(e, 'sales_status', 'Sales Status')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('sales_status')}</div>
              </th>
                    );
                    case "stage_age": return (
                      <th key={columnId} className="px-2 py-2 border-r text-center font-medium text-gray-700" style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} title="Days since the last verified Sales Pipeline stage change. On Hold is tracked but not flagged as stalled.">{getSalesColumnLayout(columnId).headerLabel}</th>
                    );
                    case "sales_rep": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'sales_rep' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('sales_rep')} onContextMenu={(e) => handleHeaderContextMenu(e, 'sales_rep', 'Salesperson / Owner')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('sales_rep')}</div>
              </th>
                    );
                    case "description": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'description' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('description')} onContextMenu={(e) => handleHeaderContextMenu(e, 'description', 'Job Description')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('description')}</div>
              </th>
                    );
                    case "lead_source": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'lead_source' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('lead_source')} onContextMenu={(e) => handleHeaderContextMenu(e, 'lead_source', 'Source')}>
                <div className="flex items-center gap-1">
                  {getSalesColumnLayout(columnId).headerLabel} {getSortIcon('lead_source')}
                </div>
              </th>
                    );
                    case "current_task_deadline": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'current_task_deadline' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('current_task_deadline')} onContextMenu={(e) => handleHeaderContextMenu(e, 'current_task_deadline', 'Deadline')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('current_task_deadline')}</div>
              </th>
                    );
                    case "current_task_assigned_to": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'current_task_assigned_to' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('current_task_assigned_to')} onContextMenu={(e) => handleHeaderContextMenu(e, 'current_task_assigned_to', 'Task Assigned')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('current_task_assigned_to')}</div>
              </th>
                    );
                    case "designer": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'designer' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('designer')} onContextMenu={(e) => handleHeaderContextMenu(e, 'designer', 'Designer')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('designer')}</div>
              </th>
                    );
                    case "project_manager": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'project_manager' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('project_manager')} onContextMenu={(e) => handleHeaderContextMenu(e, 'project_manager', 'Project Manager')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('project_manager')}</div>
              </th>
                    );
                    case "estimator": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'estimator' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('estimator')} onContextMenu={(e) => handleHeaderContextMenu(e, 'estimator', 'Estimator')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('estimator')}</div>
              </th>
                    );
                    case "est_inv_at": return (
                      <th key={columnId} className="px-2 py-2 border-r text-left font-medium text-gray-700" style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }}>{getSalesColumnLayout(columnId).headerLabel}</th>
                    );
                    case "estimate_amount": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'estimate_amount' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('estimate_amount')} onContextMenu={(e) => handleHeaderContextMenu(e, 'estimate_amount', 'Estimate Amount')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('estimate_amount')}</div>
              </th>
                    );
                    case "current_task_description": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'current_task_description' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('current_task_description')} onContextMenu={(e) => handleHeaderContextMenu(e, 'current_task_description', 'Task Description')}>
                <div className="flex items-center gap-1">
                  {getSalesColumnLayout(columnId).headerLabel} {getSortIcon('current_task_description')}
                </div>
              </th>
                    );
                    case "date_initial_contact": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'date_initial_contact' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('date_initial_contact')} onContextMenu={(e) => handleHeaderContextMenu(e, 'date_initial_contact', 'Est. Requested')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('date_initial_contact')}</div>
              </th>
                    );
                    case "site_survey_date": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'site_survey_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('site_survey_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'site_survey_date', 'Site Survey')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('site_survey_date')}</div>
              </th>
                    );
                    case "date_estimate_sent": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'date_estimate_sent' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('date_estimate_sent')} onContextMenu={(e) => handleHeaderContextMenu(e, 'date_estimate_sent', 'Estimate Sent')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('date_estimate_sent')}</div>
              </th>
                    );
                    case "date_order_created": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'date_order_created' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('date_order_created')} onContextMenu={(e) => handleHeaderContextMenu(e, 'date_order_created', 'Order Created')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('date_order_created')}</div>
              </th>
                    );
                    case "project_install_date": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'project_install_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('project_install_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'project_install_date', 'Install Date')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('project_install_date')}</div>
              </th>
                    );
                    case "permit_submitted_date": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'permit_submitted_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('permit_submitted_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'permit_submitted_date', 'Permit Submitted')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('permit_submitted_date')}</div>
              </th>
                    );
                    case "permit_receipt_confirmed_date": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'permit_receipt_confirmed_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('permit_receipt_confirmed_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'permit_receipt_confirmed_date', 'Permit Confirmed')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('permit_receipt_confirmed_date')}</div>
              </th>
                    );
                    case "permit_number": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'permit_number' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('permit_number')} onContextMenu={(e) => handleHeaderContextMenu(e, 'permit_number', 'Permit Number')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('permit_number')}</div>
              </th>
                    );
                    case "permit_approved_date": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'permit_approved_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('permit_approved_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'permit_approved_date', 'Permit Approved')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('permit_approved_date')}</div>
              </th>
                    );
                    case "days_init_today": return (
                      <th key={columnId} className="px-2 py-2 border-r text-left font-medium text-gray-700 bg-yellow-50" style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} title="Days from Initial Request to Today's Date">{getSalesColumnLayout(columnId).headerLabel}</th>
                    );
                    case "days_req_est": return (
                      <th key={columnId} className="px-2 py-2 border-r text-left font-medium text-gray-700 bg-yellow-50" style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} title="Days from Date Requested to Estimate Sent">{getSalesColumnLayout(columnId).headerLabel}</th>
                    );
                    case "days_est_ord": return (
                      <th key={columnId} className="px-2 py-2 border-r text-left font-medium text-gray-700 bg-yellow-50" style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} title="Days from Estimate Sent to Date Order Created">{getSalesColumnLayout(columnId).headerLabel}</th>
                    );
                    case "days_ord_prm": return (
                      <th key={columnId} className="px-2 py-2 border-r text-left font-medium text-gray-700 bg-yellow-50" style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} title="Days from Order Created to Permit Submitted">{getSalesColumnLayout(columnId).headerLabel}</th>
                    );
                    case "days_prm_app": return (
                      <th key={columnId} className="px-2 py-2 border-r text-left font-medium text-gray-700 bg-yellow-50" style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} title="Days from Permit Submitted to Permit Approved">{getSalesColumnLayout(columnId).headerLabel}</th>
                    );
                    case "days_ord_ins": return (
                      <th key={columnId} className="px-2 py-2 border-r text-left font-medium text-gray-700 bg-yellow-50" style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} title="Days from Order Created to Project Install Date">{getSalesColumnLayout(columnId).headerLabel}</th>
                    );
                    case "quote_age": return (
                      <th key={columnId} className="px-2 py-2 border-r text-center font-medium text-gray-700" style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} title="Days since the explicit estimate-sent date. Missing means no trustworthy sent date is available.">{getSalesColumnLayout(columnId).headerLabel}</th>
                    );
                    case "follow_up_date": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'follow_up_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('follow_up_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'follow_up_date', 'Follow Up Date')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('follow_up_date')}</div>
              </th>
                    );
                    case "expected_close_date": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'expected_close_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('expected_close_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'expected_close_date', 'Expected Close Date')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('expected_close_date')}</div>
              </th>
                    );
                    case "close_date": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'close_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('close_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'close_date', 'Close Date')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('close_date')}</div>
              </th>
                    );
                    case "start_date": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'start_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('start_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'start_date', 'Start Date')}>
                <div className="flex items-center gap-1">{getSalesColumnLayout(columnId).headerLabel} {getSortIcon('start_date')}</div>
              </th>
                    );
                    case "project_type": return (
                      <th key={columnId} className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'project_type' ? 'bg-blue-100' : ''}`} style={{ minWidth: `${getSalesColumnLayout(columnId).minWidth}px` }} onClick={() => handleSort('project_type')} onContextMenu={(e) => handleHeaderContextMenu(e, 'project_type', 'Project Type')}>
                <div className="flex items-center gap-1">
                  {getSalesColumnLayout(columnId).headerLabel} {getSortIcon('project_type')}
                  {isRegistered && <Pencil className="w-3 h-3 cursor-pointer text-blue-500" onClick={(e) => { e.stopPropagation(); openEditDialog("project_type", projectTypes, "salesProjectTypes"); }} />}
                </div>
              </th>
                    );
                    default: return null;
                  }
                })}
              <th className="px-2 py-2 text-left font-medium text-gray-700" style={{ minWidth: '60px' }}>
                {isAdmin && (
                  <Checkbox
                    checked={filteredWorkOrders.length > 0 && selectedRows.size === filteredWorkOrders.length}
                    onCheckedChange={toggleSelectAll}
                    className="h-3.5 w-3.5"
                  />
                )}
              </th>
            </tr>
          </thead>

          <SalesPipelineTableBody virtualItems={rowVirtualizer.getVirtualItems()} filteredWorkOrders={filteredWorkOrders} visibleColumnIds={visibleColumnIds} focusedRowId={focusedRowId} setFocusedRowId={setFocusedRowId} setFocusedRowIndex={setFocusedRowIndex} getTaskDescStyle={getTaskDescStyle} getDeadlineCellColor={getDeadlineCellColor} calculateDays={calculateDays} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} isAdmin={isAdmin} selectedRows={selectedRows} toggleRowSelection={toggleRowSelection} handleContextMenu={handleContextMenu} setSelectedWorkOrder={openOpportunityDetails} onRequestStatusChange={requestSalesStatusChange} onCompleteFollowUp={requestFollowUpCompletion} openCorbridgeDialog={openCorbridgeDialog} handleDuplicateClient={handleDuplicateClient} deleteWorkOrder={deleteWorkOrder} leadSources={leadSources} users={users} taskDescriptions={taskDescriptions} projectTypes={projectTypes} rowVirtualizer={rowVirtualizer} />
          </table>
          </div>

      {renderOpportunityDialogs()}

      <SalesImportHistoryDialog open={showImportHistory} onClose={() => setShowImportHistory(false)} />

      <SalesImportPreviewDialog
        open={Boolean(importFile || importPreview || importError || importPreflightBusy)}
        preview={importPreview}
        file={importFile}
        analyzing={importPreflightBusy}
        applying={importApplyBusy}
        error={importError}
        onClose={closeImportPreview}
        onApply={applyImportPreview}
        onDownloadIssues={downloadImportIssues}
      />

      {showForm && (
        <WorkOrderForm
          key={duplicateData?.id || 'new'}
          isOpen={showForm}
          onClose={() => { setShowForm(false); setDuplicateData(null); }}
          onSave={handleSaveNew}
          initialData={duplicateData}
          existingWorkOrders={workOrders}
        />
      )}

      <Dialog open={corbridgeDialog.open} onOpenChange={(open) => !open && closeCorbridgeDialog()}>
        <DialogContent className="clay-card border-none max-w-md">
          <DialogHeader>
            <DialogTitle>Est/Inv # Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Invoice/Estimate Number</label>
              <Input
                value={corbridgeDraft.invoiceNumber}
                onChange={(e) => setCorbridgeDraft((current) => ({ ...current, invoiceNumber: e.target.value }))}
                placeholder="Enter number..."
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Link URL (optional)</label>
              <Input
                value={corbridgeDraft.link}
                onChange={(e) => setCorbridgeDraft((current) => ({ ...current, link: e.target.value }))}
                placeholder="Paste the URL here (optional)..."
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">Optional: Add a link to make the number clickable</p>
            </div>
            {corbridgeSaveError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                <div className="font-medium">Corebridge field save blocked</div>
                <div className="mt-1">{corbridgeSaveError}</div>
                <Button type="button" size="sm" variant="outline" onClick={reloadCorbridgeLatest} className="mt-2 h-7 border-red-300 bg-white text-red-800">
                  Reload latest
                </Button>
              </div>
            )}
            <Button
              onClick={() => saveCorbridgeData(corbridgeDraft.invoiceNumber.trim(), corbridgeDraft.link.trim())}
              className="w-full"
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SalesPipelineDialogsAndEditList
        editDialog={editDialog} setEditDialog={setEditDialog}
        editInput={editInput} setEditInput={setEditInput}
        addToList={addToList} editingItem={editingItem} setEditingItem={setEditingItem}
        updateListItem={updateListItem} moveListItem={moveListItem} removeFromList={removeFromList}
        updateTaskPage={updateTaskPage} updateTaskStyle={updateTaskStyle}
        WORKFLOW_PAGES={WORKFLOW_PAGES} TASK_COLORS={TASK_COLORS}
        bulkDeleteConfirm={bulkDeleteConfirm} setBulkDeleteConfirm={setBulkDeleteConfirm}
        selectedRows={selectedRows} confirmBulkDelete={confirmBulkDelete}
        clearDateConfirm={clearDateConfirm} setClearDateConfirm={setClearDateConfirm}
        updateWorkOrder={updateWorkOrder}
        contextMenu={contextMenu} setContextMenu={setContextMenu}
        clearCell={clearCell} isRegistered={isRegistered}
        headerContextMenu={headerContextMenu} setHeaderContextMenu={setHeaderContextMenu}
        handleColumnSort={handleColumnSort} handleCustomSort={handleCustomSort}
        clearSort={clearSort} sortConfig={sortConfig}
        workOrders={workOrders} currentUser={currentUser}
        handleHeaderContextMenuAction={handleHeaderContextMenuAction}
        showGradientDialog={showGradientDialog} setShowGradientDialog={setShowGradientDialog}
        deadlineGradientSettings={deadlineGradientSettings} saveGradientSettings={saveGradientSettings}
        deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
        confirmDelete={confirmDelete}
      />
    </div>
  );
});

export default SalesPipelineSpreadsheet;