import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { base44 } from "@/api/base44Client";
import { importSalesPipeline } from "@/functions/importSalesPipeline";
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
import SalesPipelineTableBody from "@/components/sales/SalesPipelineTableBody";
import SalesPipelineDialogsAndEditList from "@/components/sales/SalesPipelineDialogsAndEditList";
import { useMultiImport } from "@/components/shared/MultiImportContext";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { createWorkOrderWithRecovery, replaceWorkOrderFieldsIfUnchanged, softDeleteWorkOrderFromLoadedSnapshot, transitionWorkOrderFromLoadedSnapshot } from "@/components/workflow/workOrderPersistence";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/shared/globalSettingsPersistence";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;
const GlobalSettings = base44.entities.GlobalSettings;

const SALES_STATUSES = [
  { value: "lead", label: "Lead", color: "bg-blue-100" },
  { value: "quoted", label: "Quoted", color: "bg-yellow-100" },
  { value: "follow_up", label: "Follow Up", color: "bg-orange-100" },
  { value: "won", label: "Won", color: "bg-green-100" },
  { value: "lost", label: "Lost", color: "bg-red-100" },
  { value: "on_hold", label: "On Hold", color: "bg-gray-100" }
];

const isLegacyClosedRecord = (workOrder) => {
  if (workOrder?.in_pipeline === true) return false;
  const legacyTask = String(workOrder?.current_task_description || "").trim();
  return /^(lost\b|completed sale\b|closed\b)/i.test(legacyTask);
};

const isOpenOpportunity = (workOrder) => !["won", "lost"].includes(workOrder?.sales_status);

const matchesAttentionFilter = (workOrder, attentionFilter, todayStamp, upcomingStamp, currentUser) => {
  if (!attentionFilter || attentionFilter === "all") return true;
  const followUp = workOrder?.follow_up_date || "";
  const isOperational = isOpenOpportunity(workOrder) && !isLegacyClosedRecord(workOrder);
  if (attentionFilter === "due") return isOperational && followUp && followUp <= todayStamp;
  if (attentionFilter === "overdue") return isOperational && followUp && followUp < todayStamp;
  if (attentionFilter === "today") return isOperational && followUp === todayStamp;
  if (attentionFilter === "upcoming") return isOperational && followUp > todayStamp && followUp <= upcomingStamp;
  if (attentionFilter === "quote_no_followup") {
    return isOperational && !followUp && (workOrder?.sales_status === "quoted" || workOrder?.sales_status === "follow_up" || workOrder?.quote_date || workOrder?.date_estimate_sent);
  }
  if (attentionFilter === "no_next_action") return isOperational && !followUp && !workOrder?.current_task_deadline;
  if (attentionFilter === "mine") {
    const names = [currentUser?.full_name, currentUser?.name, currentUser?.email].filter(Boolean).map((value) => String(value).trim().toLowerCase());
    if (!names.length) return false;
    return isOperational && [workOrder?.sales_rep, workOrder?.current_task_assigned_to, workOrder?.estimator]
      .filter(Boolean)
      .some((value) => names.includes(String(value).trim().toLowerCase()));
  }
  return true;
};

const SalesPipelineSpreadsheet = React.forwardRef(({ searchTerm = "", filterStatus = "all", recordScope = "current", attentionFilter = "all", viewMode = "table", onSummaryChange, showButtonsInline = true, activeColumnPreset = null, customFilters = [] }, ref) => {
  const { currentUser, isRegistered } = useAuth();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const fileInputRef = useRef(null);
  const [editDialog, setEditDialog] = useState({ open: false, field: "", items: [] });
  const [editInput, setEditInput] = useState("");
  const [editingItem, setEditingItem] = useState({ index: null, value: "" });
  const pendingChangesRef = useRef({});
  const pendingBaselinesRef = useRef({});
  const debounceTimers = useRef({});
  const [quickEditError, setQuickEditError] = useState("");
  const [destructiveActionError, setDestructiveActionError] = useState("");
  const [exportProgress, setExportProgress] = useState({ show: false, progress: 0 });
  const importStateRef = useRef({ paused: false, cancelled: false });
  const { startImport: startMultiImport, updateImport, finishImport } = useMultiImport();
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

  // Use the column sorting hook with user-specific storage
  const { 
    sortConfig, 
    handleSort: handleColumnSort, 
    handleCustomSort, 
    clearSort 
  } = useColumnSorting('salesPipeline', currentUser?.email);

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
    loadWorkOrders();
    loadTaskAssignmentRules();
    const interval = setInterval(() => loadWorkOrders(false), 60000); // Reduced frequency
    return () => clearInterval(interval);
  }, []);

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

  const loadWorkOrders = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const [orders, usersData] = await Promise.all([
        loadAllEntityRows({
          entity: WorkOrder,
          query: { is_rider: false, completed: false, deleted: { $ne: true } },
          sort: "created_date",
          label: "Sales Pipeline Work Orders",
        }),
        loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "Sales Pipeline authorized users" })
      ]);
      setWorkOrders(orders.map((order) => ({
        ...order,
        ...(pendingChangesRef.current[order.id] || {}),
      })).sort((a, b) => (b.created_date || "").localeCompare(a.created_date || "")));
      setUsers(usersData);
    } catch (error) {
      console.error("Error loading work orders:", error);
    }
    setIsLoading(false);
  };

  const calculateDays = (fromDate, toDate) => {
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
  };

  const addNewRow = () => {
    if (!isRegistered) return;
    setShowForm(true);
  };

  const handleSaveNew = async (workOrderData) => {
    const { record: newOrder } = await createWorkOrderWithRecovery({
      data: {
        ...workOrderData,
        current_stage: "sales",
        sales_status: "lead",
        in_pipeline: true,
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

  const updateWorkOrder = (orderId, field, value, skipHistory = false) => {
    const currentWo = workOrders.find(wo => wo.id === orderId);
    if (!currentWo) return;
    const oldValue = currentWo[field];
    
    const updatedWo = { ...currentWo, [field]: value };
    // Apply task assignment rules
    const ruleUpdates = applyRules(taskAssignmentRules, updatedWo);
    const mergedUpdates = { [field]: value, ...ruleUpdates };
    
    setWorkOrders(prev => prev.map(wo => wo.id === orderId ? { ...wo, ...mergedUpdates } : wo));
    
    // Track cell history
    if (!skipHistory && oldValue !== value) {
      trackChange(orderId, field, oldValue, value);
    }
    
    const baselines = { ...(pendingBaselinesRef.current[orderId] || {}) };
    Object.keys(mergedUpdates).forEach((changedField) => {
      if (!Object.prototype.hasOwnProperty.call(baselines, changedField)) {
        baselines[changedField] = currentWo[changedField];
      }
    });
    pendingBaselinesRef.current[orderId] = baselines;
    pendingChangesRef.current[orderId] = {
      ...(pendingChangesRef.current[orderId] || {}),
      ...mergedUpdates,
    };
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
        const remaining = { ...(pendingChangesRef.current[orderId] || {}) };
        const remainingBaselines = { ...(pendingBaselinesRef.current[orderId] || {}) };
        Object.entries(changes).forEach(([changedField, savedValue]) => {
          if (JSON.stringify(remaining[changedField]) === JSON.stringify(savedValue)) {
            delete remaining[changedField];
            delete remainingBaselines[changedField];
          } else if (Object.prototype.hasOwnProperty.call(remaining, changedField)) {
            remainingBaselines[changedField] = saved[changedField];
          }
        });
        if (Object.keys(remaining).length > 0) {
          pendingChangesRef.current[orderId] = remaining;
          pendingBaselinesRef.current[orderId] = remainingBaselines;
        } else {
          delete pendingChangesRef.current[orderId];
          delete pendingBaselinesRef.current[orderId];
        }
        setQuickEditError("");
      } catch (error) {
        if (!error.message?.includes('not found')) {
          console.error("Error updating work order:", error);
        }
        setQuickEditError(error?.message || "A Sales Pipeline quick edit could not be saved. Reload the latest data and try again.");
        // Keep the queued values and original baselines so no stale value is silently written.
      } finally {
        if (debounceTimers.current[orderId] === timerId) delete debounceTimers.current[orderId];
      }
    }, 1000);
    debounceTimers.current[orderId] = timerId;
  };

  const discardPendingQuickEdits = async () => {
    Object.values(debounceTimers.current).forEach((timer) => clearTimeout(timer));
    debounceTimers.current = {};
    pendingChangesRef.current = {};
    pendingBaselinesRef.current = {};
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
      invoiceNumber: workOrder.corbridge_invoice_number || workOrder.est_inv_at || "",
      link: workOrder.corbridge_link || "",
    });
    setCorbridgeBaselines({
      corbridge_invoice_number: workOrder.corbridge_invoice_number,
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
        invoiceNumber: latest.corbridge_invoice_number || latest.est_inv_at || "",
        link: latest.corbridge_link || "",
      });
      setCorbridgeBaselines({
        corbridge_invoice_number: latest.corbridge_invoice_number,
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
      corbridge_invoice_number: invoiceNumber,
      est_inv_at: invoiceNumber
    };
    const expectedFields = {
      corbridge_invoice_number: corbridgeBaselines.corbridge_invoice_number,
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
        label: "Corebridge link fields",
      });
      setWorkOrders((current) => current.map((row) => row.id === saved.id ? { ...row, ...saved } : row));
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
      "Current Task Deadline": str(wo.current_task_deadline), "Current Task Assigned to": str(wo.current_task_assigned_to),
      "Designer": str(wo.designer), "Project Manager": str(wo.project_manager), "Estimator": str(wo.estimator),
      "Est/Inv @": str(wo.est_inv_at || wo.corbridge_invoice_number), "Estimate Amount": num(wo.estimate_amount),
      "Current Task Description": str(wo.current_task_description), "Date Est. Requested/Initial Contact": str(wo.date_initial_contact),
      "Site Survey": str(wo.site_survey_date), "Date Estimate Sent to Customer": str(wo.date_estimate_sent),
      "Date Order Created": str(wo.date_order_created), "Project Install Date": str(wo.project_install_date),
      "Permit Submitted": str(wo.permit_submitted_date), "Notes": str(wo.title),
      "Date Permit Receipt Confirmed": str(wo.permit_receipt_confirmed_date), "Permit Number": str(wo.permit_number),
      "Date Permit Approved/Received": str(wo.permit_approved_date),
      "Quote Date": str(wo.quote_date), "Follow Up Date": str(wo.follow_up_date), "Close Date": str(wo.close_date),
      "Probability": num(wo.probability), "Project Type": str(wo.project_type),
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

  const importFromExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const importId = startMultiImport(file.name);
    const processingTimeout = setTimeout(() => {
      updateImport(importId, { message: 'Processing rows on server...' });
    }, 1500);

    try {
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(btoa(e.target.result));
        reader.onerror = reject;
        reader.readAsBinaryString(file);
      });
      const res = await importSalesPipeline({ fileData });
      clearTimeout(processingTimeout);
      const result = res.data;
      finishImport(importId, `${result.created} created, ${result.updated} updated${result.failed ? `, ${result.failed} failed` : ''}`);
      await loadWorkOrders(false);
    } catch (err) {
      clearTimeout(processingTimeout);
      console.error("Import failed:", err);
      finishImport(importId, 'Import failed. Please try again.', true);
    }
  };

  const handleCreateFromForm = async (data) => {
    const { record: newOrder } = await createWorkOrderWithRecovery({
      data: {
        ...data,
        current_stage: "sales",
        sales_status: "lead",
        in_pipeline: true,
      },
      label: "Sales Pipeline form Work Order",
    });
    setWorkOrders(prev => [newOrder, ...prev.filter(wo => wo.id !== newOrder.id)]);
  };

  React.useImperativeHandle(ref, () => ({
    addNewRow,
    exportToExcel,
    importFromExcel: () => fileInputRef.current?.click(),
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
      // If ANY of the values match, this field passes
      const fieldPasses = values.some(val => fieldValue == val);
      if (!fieldPasses) return false;
    }
    
    // Check other conditions with AND logic
    return otherConditions.every(condition => {
      const fieldValue = wo[condition.field];
      const condValue = condition.value;
      
      switch (condition.operator) {
        case "is_not":
          return fieldValue != condValue;
        case "is_one_of": {
          const vals = (condValue || "").split(",").filter(Boolean).map(v => v.trim());
          if (vals.length === 0) return true;
          const fv = fieldValue != null ? String(fieldValue) : "";
          return vals.some(v => fv == v);
        }
        case "is_not_one_of": {
          const vals = (condValue || "").split(",").filter(Boolean).map(v => v.trim());
          if (vals.length === 0) return true;
          const fv = fieldValue != null ? String(fieldValue) : "";
          return !vals.some(v => fv == v);
        }
        case "contains":
          return fieldValue?.toString().toLowerCase().includes(condValue.toLowerCase());
        case "greater_than":
          return parseFloat(fieldValue) > parseFloat(condValue);
        case "less_than":
          return parseFloat(fieldValue) < parseFloat(condValue);
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

  const scopedWorkOrders = useMemo(() => workOrders.filter((wo) => {
    const legacyClosed = isLegacyClosedRecord(wo);
    if (recordScope === "current" && legacyClosed) return false;
    if (recordScope === "history" && !legacyClosed) return false;
    return true;
  }), [workOrders, recordScope]);

  const pipelineSummary = useMemo(() => {
    const operational = scopedWorkOrders.filter((wo) => isOpenOpportunity(wo) && !isLegacyClosedRecord(wo));
    return operational.reduce((summary, wo) => {
      const followUp = wo.follow_up_date || "";
      const value = Number(wo.quoted_amount ?? wo.estimate_amount ?? 0) || 0;
      summary.openCount += 1;
      summary.openValue += value;
      if (followUp && followUp < todayStamp) summary.overdueCount += 1;
      if (followUp === todayStamp) summary.dueTodayCount += 1;
      if (followUp && followUp <= todayStamp) summary.dueCount += 1;
      if (followUp > todayStamp && followUp <= upcomingStamp) summary.upcomingCount += 1;
      if (!followUp && !wo.current_task_deadline) summary.noNextActionCount += 1;
      if (!followUp && (wo.sales_status === "quoted" || wo.sales_status === "follow_up" || wo.quote_date || wo.date_estimate_sent)) summary.quoteNoFollowUpCount += 1;
      if (typeof wo.probability === "number") summary.ratedProbabilityCount += 1;
      return summary;
    }, {
      openCount: 0,
      openValue: 0,
      overdueCount: 0,
      dueTodayCount: 0,
      dueCount: 0,
      upcomingCount: 0,
      noNextActionCount: 0,
      quoteNoFollowUpCount: 0,
      ratedProbabilityCount: 0,
    });
  }, [scopedWorkOrders, todayStamp, upcomingStamp]);

  useEffect(() => {
    onSummaryChange?.(pipelineSummary);
  }, [pipelineSummary, onSummaryChange]);

  // Pre-compute sort values for faster sorting
  const sortedWorkOrders = useMemo(() => {
    // First filter
    let result = scopedWorkOrders.filter(wo => {
      if (!matchesAttentionFilter(wo, attentionFilter, todayStamp, upcomingStamp, currentUser)) return false;

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
          wo.sales_rep,
          wo.estimator,
          wo.project_manager,
          wo.current_task_assigned_to,
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
          return value != null && filter.selectedValues.includes(String(value));
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

    if (!sortConfig.key) return result;
    
    // Pre-compute sort keys for performance
    const key = sortConfig.key;
    const isDateField = key.includes('date') || key === 'current_task_deadline';
    const isNumberField = key === 'estimate_amount' || key === 'probability';
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    
    return result.sort((a, b) => {
      let aVal = a[key] ?? '';
      let bVal = b[key] ?? '';
      
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
  }, [scopedWorkOrders, filterStatus, attentionFilter, todayStamp, upcomingStamp, currentUser, searchTerm, sortConfig, customFilters]);

  const filteredWorkOrders = sortedWorkOrders;

  // Virtual scrolling setup
  const parentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredWorkOrders.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 15,
  });

  const isColumnVisible = (columnId) => {
    if (!activeColumnPreset?.column_settings) return true;
    const setting = activeColumnPreset.column_settings.find(c => c.id === columnId);
    return setting?.visible !== false;
  };

  const handleContextMenu = (e, wo, fieldName, fieldLabel, currentValue) => {
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
  };

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

  // Mobile card view
  if (isMobile && viewMode !== "board") {
    return (
      <>
        {quickEditWarning}
        {destructiveActionWarning}
        {globalSettingsWarning}
        <SalesPipelineMobileCards
          workOrders={filteredWorkOrders}
          onOpenDetails={(wo) => setSelectedWorkOrder(wo)}
          onUpdateWorkOrder={updateWorkOrder}
          isRegistered={isRegistered}
        />
        {selectedWorkOrder && (
          <WorkOrderDetailsDialog
            workOrder={selectedWorkOrder}
            onClose={() => setSelectedWorkOrder(null)}
            onUpdate={(updated) => {
              setWorkOrders(prev => prev.map(w => w.id === updated.id ? updated : w));
              setSelectedWorkOrder(null);
            }}
          />
        )}
      </>
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
              <>
                <Button onClick={addNewRow} className="clay-button border-none text-gray-800"
                  style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Client
                </Button>
                <Button 
                  onClick={() => fileInputRef.current?.click()} 
                  size="sm"
                  className="clay-button border-none text-gray-700 h-8"
                  style={{ background: 'linear-gradient(135deg, #FFE4D6 0%, #FFD6E8 100%)' }}
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Import
                </Button>
              </>
            )}
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
          <thead className="bg-gray-100">
            <tr className="border-b sticky top-0 z-10 bg-gray-100">
              <th className="px-2 py-2 border-r text-center font-medium text-gray-700" style={{ width: '32px', minWidth: '32px' }}>#</th>
              {isColumnVisible("client_name") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'client_name' ? 'bg-blue-100' : ''}`} style={{ minWidth: '120px' }} onClick={() => handleSort('client_name')} onContextMenu={(e) => handleHeaderContextMenu(e, 'client_name', 'Customer')}>
                <div className="flex items-center gap-1">Customer {getSortIcon('client_name')}</div>
              </th>}
              {isColumnVisible("sales_status") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'sales_status' ? 'bg-blue-100' : ''}`} style={{ minWidth: '95px' }} onClick={() => handleSort('sales_status')} onContextMenu={(e) => handleHeaderContextMenu(e, 'sales_status', 'Sales Status')}>
                <div className="flex items-center gap-1">Status {getSortIcon('sales_status')}</div>
              </th>}
              {isColumnVisible("sales_rep") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'sales_rep' ? 'bg-blue-100' : ''}`} style={{ minWidth: '115px' }} onClick={() => handleSort('sales_rep')} onContextMenu={(e) => handleHeaderContextMenu(e, 'sales_rep', 'Salesperson / Owner')}>
                <div className="flex items-center gap-1">Sales Owner {getSortIcon('sales_rep')}</div>
              </th>}
              {isColumnVisible("description") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'description' ? 'bg-blue-100' : ''}`} style={{ minWidth: '150px' }} onClick={() => handleSort('description')} onContextMenu={(e) => handleHeaderContextMenu(e, 'description', 'Job Description')}>
                <div className="flex items-center gap-1">Job Description {getSortIcon('description')}</div>
              </th>}
              {isColumnVisible("lead_source") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'lead_source' ? 'bg-blue-100' : ''}`} style={{ minWidth: '90px' }} onClick={() => handleSort('lead_source')} onContextMenu={(e) => handleHeaderContextMenu(e, 'lead_source', 'Source')}>
                <div className="flex items-center gap-1">
                  Source {getSortIcon('lead_source')}
                </div>
              </th>}
              {isColumnVisible("current_task_deadline") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'current_task_deadline' ? 'bg-blue-100' : ''}`} style={{ minWidth: '80px' }} onClick={() => handleSort('current_task_deadline')} onContextMenu={(e) => handleHeaderContextMenu(e, 'current_task_deadline', 'Deadline')}>
                <div className="flex items-center gap-1">Deadline {getSortIcon('current_task_deadline')}</div>
              </th>}
              {isColumnVisible("current_task_assigned_to") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'current_task_assigned_to' ? 'bg-blue-100' : ''}`} style={{ minWidth: '100px' }} onClick={() => handleSort('current_task_assigned_to')} onContextMenu={(e) => handleHeaderContextMenu(e, 'current_task_assigned_to', 'Task Assigned')}>
                <div className="flex items-center gap-1">Task Assigned {getSortIcon('current_task_assigned_to')}</div>
              </th>}
              {isColumnVisible("designer") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'designer' ? 'bg-blue-100' : ''}`} style={{ minWidth: '90px' }} onClick={() => handleSort('designer')} onContextMenu={(e) => handleHeaderContextMenu(e, 'designer', 'Designer')}>
                <div className="flex items-center gap-1">Designer {getSortIcon('designer')}</div>
              </th>}
              {isColumnVisible("project_manager") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'project_manager' ? 'bg-blue-100' : ''}`} style={{ minWidth: '100px' }} onClick={() => handleSort('project_manager')} onContextMenu={(e) => handleHeaderContextMenu(e, 'project_manager', 'Project Manager')}>
                <div className="flex items-center gap-1">Project Manager {getSortIcon('project_manager')}</div>
              </th>}
              {isColumnVisible("estimator") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'estimator' ? 'bg-blue-100' : ''}`} style={{ minWidth: '90px' }} onClick={() => handleSort('estimator')} onContextMenu={(e) => handleHeaderContextMenu(e, 'estimator', 'Estimator')}>
                <div className="flex items-center gap-1">Estimator {getSortIcon('estimator')}</div>
              </th>}
              {isColumnVisible("est_inv_at") && <th className="px-2 py-2 border-r text-left font-medium text-gray-700" style={{ minWidth: '100px' }}>Est/Inv # Link</th>}
              {isColumnVisible("estimate_amount") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'estimate_amount' ? 'bg-blue-100' : ''}`} style={{ minWidth: '90px' }} onClick={() => handleSort('estimate_amount')} onContextMenu={(e) => handleHeaderContextMenu(e, 'estimate_amount', 'Estimate Amount')}>
                <div className="flex items-center gap-1">Amount {getSortIcon('estimate_amount')}</div>
              </th>}
              {isColumnVisible("current_task_description") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'current_task_description' ? 'bg-blue-100' : ''}`} style={{ minWidth: '140px' }} onClick={() => handleSort('current_task_description')} onContextMenu={(e) => handleHeaderContextMenu(e, 'current_task_description', 'Task Description')}>
                <div className="flex items-center gap-1">
                  Task Description {getSortIcon('current_task_description')}
                </div>
              </th>}
              {isColumnVisible("date_initial_contact") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'date_initial_contact' ? 'bg-blue-100' : ''}`} style={{ minWidth: '80px' }} onClick={() => handleSort('date_initial_contact')} onContextMenu={(e) => handleHeaderContextMenu(e, 'date_initial_contact', 'Est. Requested')}>
                <div className="flex items-center gap-1">Est. Req. {getSortIcon('date_initial_contact')}</div>
              </th>}
              {isColumnVisible("site_survey_date") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'site_survey_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: '80px' }} onClick={() => handleSort('site_survey_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'site_survey_date', 'Site Survey')}>
                <div className="flex items-center gap-1">Survey {getSortIcon('site_survey_date')}</div>
              </th>}
              {isColumnVisible("date_estimate_sent") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'date_estimate_sent' ? 'bg-blue-100' : ''}`} style={{ minWidth: '120px' }} onClick={() => handleSort('date_estimate_sent')} onContextMenu={(e) => handleHeaderContextMenu(e, 'date_estimate_sent', 'Estimate Sent')}>
                <div className="flex items-center gap-1">Date Estimate Sent to Customer {getSortIcon('date_estimate_sent')}</div>
              </th>}
              {isColumnVisible("date_order_created") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'date_order_created' ? 'bg-blue-100' : ''}`} style={{ minWidth: '80px' }} onClick={() => handleSort('date_order_created')} onContextMenu={(e) => handleHeaderContextMenu(e, 'date_order_created', 'Order Created')}>
                <div className="flex items-center gap-1">Order {getSortIcon('date_order_created')}</div>
              </th>}
              {isColumnVisible("project_install_date") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'project_install_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: '80px' }} onClick={() => handleSort('project_install_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'project_install_date', 'Install Date')}>
                <div className="flex items-center gap-1">Install {getSortIcon('project_install_date')}</div>
              </th>}
              {isColumnVisible("permit_submitted_date") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'permit_submitted_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: '80px' }} onClick={() => handleSort('permit_submitted_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'permit_submitted_date', 'Permit Submitted')}>
                <div className="flex items-center gap-1">Permit Sub {getSortIcon('permit_submitted_date')}</div>
              </th>}

              {isColumnVisible("permit_receipt_confirmed_date") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'permit_receipt_confirmed_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: '80px' }} onClick={() => handleSort('permit_receipt_confirmed_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'permit_receipt_confirmed_date', 'Permit Confirmed')}>
                <div className="flex items-center gap-1">Permit Conf {getSortIcon('permit_receipt_confirmed_date')}</div>
              </th>}
              {isColumnVisible("permit_number") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'permit_number' ? 'bg-blue-100' : ''}`} style={{ minWidth: '70px' }} onClick={() => handleSort('permit_number')} onContextMenu={(e) => handleHeaderContextMenu(e, 'permit_number', 'Permit Number')}>
                <div className="flex items-center gap-1">Permit # {getSortIcon('permit_number')}</div>
              </th>}
              {isColumnVisible("permit_approved_date") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'permit_approved_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: '80px' }} onClick={() => handleSort('permit_approved_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'permit_approved_date', 'Permit Approved')}>
                <div className="flex items-center gap-1">Permit App {getSortIcon('permit_approved_date')}</div>
              </th>}
              {isColumnVisible("days_init_today") && <th className="px-2 py-2 border-r text-left font-medium text-gray-700 bg-yellow-50" style={{ minWidth: '90px' }} title="Days from Initial Request to Today's Date">Days Init→Today</th>}
              {isColumnVisible("days_req_est") && <th className="px-2 py-2 border-r text-left font-medium text-gray-700 bg-yellow-50" style={{ minWidth: '90px' }} title="Days from Date Requested to Estimate Sent">Days Req→Est</th>}
              {isColumnVisible("days_est_ord") && <th className="px-2 py-2 border-r text-left font-medium text-gray-700 bg-yellow-50" style={{ minWidth: '90px' }} title="Days from Estimate Sent to Date Order Created">Days Est→Ord</th>}
              {isColumnVisible("days_ord_prm") && <th className="px-2 py-2 border-r text-left font-medium text-gray-700 bg-yellow-50" style={{ minWidth: '90px' }} title="Days from Order Created to Permit Submitted">Days Ord→Prm</th>}
              {isColumnVisible("days_prm_app") && <th className="px-2 py-2 border-r text-left font-medium text-gray-700 bg-yellow-50" style={{ minWidth: '90px' }} title="Days from Permit Submitted to Permit Approved">Days Prm→App</th>}
              {isColumnVisible("days_ord_ins") && <th className="px-2 py-2 border-r text-left font-medium text-gray-700 bg-yellow-50" style={{ minWidth: '90px' }} title="Days from Order Created to Project Install Date">Days Ord→Ins</th>}
              {isColumnVisible("quote_date") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'quote_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: '80px' }} onClick={() => handleSort('quote_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'quote_date', 'Quote Date')}>
                <div className="flex items-center gap-1">Quote {getSortIcon('quote_date')}</div>
              </th>}
              {isColumnVisible("follow_up_date") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'follow_up_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: '80px' }} onClick={() => handleSort('follow_up_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'follow_up_date', 'Follow Up Date')}>
                <div className="flex items-center gap-1">Follow Up {getSortIcon('follow_up_date')}</div>
              </th>}
              {isColumnVisible("close_date") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'close_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: '80px' }} onClick={() => handleSort('close_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'close_date', 'Close Date')}>
                <div className="flex items-center gap-1">Close {getSortIcon('close_date')}</div>
              </th>}
              {isColumnVisible("probability") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'probability' ? 'bg-blue-100' : ''}`} style={{ minWidth: '60px' }} onClick={() => handleSort('probability')} onContextMenu={(e) => handleHeaderContextMenu(e, 'probability', 'Probability')}>
                <div className="flex items-center gap-1">Prob {getSortIcon('probability')}</div>
              </th>}
              {isColumnVisible("start_date") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'start_date' ? 'bg-blue-100' : ''}`} style={{ minWidth: '80px' }} onClick={() => handleSort('start_date')} onContextMenu={(e) => handleHeaderContextMenu(e, 'start_date', 'Start Date')}>
                <div className="flex items-center gap-1">Start {getSortIcon('start_date')}</div>
              </th>}
              {isColumnVisible("project_type") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'project_type' ? 'bg-blue-100' : ''}`} style={{ minWidth: '90px' }} onClick={() => handleSort('project_type')} onContextMenu={(e) => handleHeaderContextMenu(e, 'project_type', 'Project Type')}>
                <div className="flex items-center gap-1">
                  Project Type {getSortIcon('project_type')}
                  {isRegistered && <Pencil className="w-3 h-3 cursor-pointer text-blue-500" onClick={(e) => { e.stopPropagation(); openEditDialog("project_type", projectTypes, "salesProjectTypes"); }} />}
                </div>
              </th>}
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

          <SalesPipelineTableBody virtualItems={rowVirtualizer.getVirtualItems()} filteredWorkOrders={filteredWorkOrders} isColumnVisible={isColumnVisible} focusedRowId={focusedRowId} setFocusedRowId={setFocusedRowId} setFocusedRowIndex={setFocusedRowIndex} getTaskDescStyle={getTaskDescStyle} getDeadlineCellColor={getDeadlineCellColor} calculateDays={calculateDays} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} isAdmin={isAdmin} selectedRows={selectedRows} toggleRowSelection={toggleRowSelection} handleContextMenu={handleContextMenu} setSelectedWorkOrder={setSelectedWorkOrder} openCorbridgeDialog={openCorbridgeDialog} handleDuplicateClient={handleDuplicateClient} deleteWorkOrder={deleteWorkOrder} leadSources={leadSources} users={users} taskDescriptions={taskDescriptions} projectTypes={projectTypes} rowVirtualizer={rowVirtualizer} />
          </table>
          </div>

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
                label: "Sales Pipeline details stage transition",
              });
            } catch (error) {
              console.error("Error moving Sales Pipeline Work Order:", error);
              alert(error?.message || "This Work Order changed in another session. Reload and try the transition again.");
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
                rider_stage: wo.current_stage,
                sales_status: wo.sales_status
              },
              label: "Sales Pipeline rider Work Order",
            });
            loadWorkOrders();
          }}
          onComplete={async (wo) => {
            try {
              await transitionWorkOrderFromLoadedSnapshot({
                workOrder: wo,
                newStage: wo.current_stage,
                completed: true,
                label: "Sales Pipeline details completion",
              });
              setWorkOrders(workOrders.filter(w => w.id !== wo.id));
            } catch (error) {
              console.error("Error completing Sales Pipeline Work Order:", error);
              alert(error?.message || "This Work Order changed in another session. Reload and try completion again.");
              loadWorkOrders();
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
              setWorkOrders((current) => current.filter((workOrder) => workOrder.id !== wo.id));
            } catch (error) {
              console.error("Sales Pipeline details Work Order delete blocked:", error);
              setDestructiveActionError(error?.message || "This Work Order changed after the Sales Pipeline was loaded. Reload before deleting it.");
              await loadWorkOrders(false);
              throw error;
            }
          }}
        />
      )}

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