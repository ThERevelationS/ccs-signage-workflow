import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, differenceInDays } from "date-fns";
import { Plus, Trash2, Calendar as CalendarIcon, ArrowRight, Loader2, Download, Upload, Pencil, ExternalLink, Link as LinkIcon, Save, ArrowUpDown, ArrowUp, ArrowDown, Strikethrough, Copy } from "lucide-react";

// Helper to parse date string as local date (not UTC)
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import WorkOrderForm from "@/components/workflow/WorkOrderForm";
import * as XLSX from "xlsx";
import { CellContextMenu, useCellHistoryTracker } from "@/components/shared/CellContextMenu";
import { ColumnHeaderContextMenu, useColumnSorting } from "@/components/shared/ColumnHeaderContextMenu";
import { applyRules } from "@/components/admin/TaskAssignmentRules";
import SalesPipelineMobileCards from "@/components/sales/SalesPipelineMobileCards";
import SalesPipelineTableBody from "@/components/sales/SalesPipelineTableBody";
import SalesPipelineDialogsAndEditList from "@/components/sales/SalesPipelineDialogsAndEditList";

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

const SalesPipelineSpreadsheet = React.forwardRef(({ searchTerm = "", filterStatus = "all", showButtonsInline = true, activeColumnPreset = null, customFilters = [] }, ref) => {
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
  const [pendingChanges, setPendingChanges] = useState({});
  const debounceTimers = useRef({});
  const [exportProgress, setExportProgress] = useState({ show: false, progress: 0 });
  const importStateRef = useRef({ paused: false, cancelled: false });
  const cancelCtx = importStateRef; const [importProgress, setImportProgress] = useState(null); const updateProgress = (cur, tot, msg) => setImportProgress({ current: cur, total: tot, message: msg, done: false }); const completeImport = () => { setImportProgress(p => p ? { ...p, done: true, message: 'Import complete!' } : null); setTimeout(() => setImportProgress(null), 5000); };
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
      const settings = await GlobalSettings.filter({ setting_key: "taskAssignmentRules" });
      if (settings.length > 0) {
        setTaskAssignmentRules(settings[0].setting_value?.rules || []);
      }
    } catch {}
  };

  const loadGlobalSettings = async () => {
    try {
      const settings = await GlobalSettings.list();
      
      const leadSourcesSetting = settings.find(s => s.setting_key === 'salesLeadSources');
      if (leadSourcesSetting?.setting_value?.items) {
        setLeadSources(leadSourcesSetting.setting_value.items);
      }
      
      const taskDescSetting = settings.find(s => s.setting_key === 'salesTaskDescriptions');
      if (taskDescSetting?.setting_value?.items) {
        // Migration: ensure all items have required fields
        const items = taskDescSetting.setting_value.items.map(item => ({
          text: item.text || item,
          page: item.page || "",
          color: item.color || "",
          opacity: item.opacity ?? 100,
          markOut: item.markOut ?? false,
          wip: item.wip ?? false
        }));
        setTaskDescriptions(items);
      }
      
      const gradientSetting = settings.find(s => s.setting_key === 'deadlineGradientSettings');
      if (gradientSetting?.setting_value) {
        setDeadlineGradientSettings(gradientSetting.setting_value);
      }

      // Load default sort setting and apply if user has no custom sort
      const defaultSortSetting = settings.find(s => s.setting_key === 'salesPipelineDefaultSort');
      if (defaultSortSetting?.setting_value?.column && !sortConfig.key) {
        handleColumnSort(defaultSortSetting.setting_value.column, defaultSortSetting.setting_value.direction || 'asc');
      }
      
      setGlobalSettingsLoaded(true);
    } catch (error) {
      console.error("Error loading global settings:", error);
      setGlobalSettingsLoaded(true);
    }
  };

  const saveGlobalSetting = async (key, value) => {
    try {
      const settings = await GlobalSettings.filter({ setting_key: key });
      if (settings.length > 0) {
        await GlobalSettings.update(settings[0].id, { setting_value: value });
      } else {
        await GlobalSettings.create({ setting_key: key, setting_value: value });
      }
    } catch (error) {
      console.error("Error saving global setting:", error);
    }
  };

  const loadWorkOrders = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const [orders, usersData] = await Promise.all([
        WorkOrder.filter({ is_rider: false, completed: false, deleted: { $ne: true } }),
        AuthorizedEmail.list()
      ]);
      setWorkOrders(orders.sort((a, b) => (b.created_date || "").localeCompare(a.created_date || "")));
      setUsers(usersData);
    } catch (error) {
      console.error("Error loading work orders:", error);
    }
    setIsLoading(false);
  };

  const calculateDays = (fromDate, toDate) => {
    if (!fromDate) return null;
    // If toDate is not provided or is falsy, use today
    const useToday = toDate === undefined || toDate === null || toDate === '';
    try {
      const from = parseLocalDate(fromDate);
      if (!from || isNaN(from.getTime())) return null;
      
      let to;
      if (useToday) {
        to = new Date();
        to.setHours(0, 0, 0, 0);
      } else {
        to = parseLocalDate(toDate);
        if (!to || isNaN(to.getTime())) return null;
      }
      
      return differenceInDays(to, from);
    } catch {
      return null;
    }
  };

  const addNewRow = () => {
    if (!isRegistered) return;
    setShowForm(true);
  };

  const handleSaveNew = async (workOrderData) => {
    const newOrder = await WorkOrder.create({
      ...workOrderData,
      sales_status: "lead"
    });
    setWorkOrders([newOrder, ...workOrders]);
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
    const oldValue = currentWo ? currentWo[field] : "";
    
    const updatedWo = { ...currentWo, [field]: value };
    // Apply task assignment rules
    const ruleUpdates = applyRules(taskAssignmentRules, updatedWo);
    const mergedUpdates = { [field]: value, ...ruleUpdates };
    
    setWorkOrders(prev => prev.map(wo => wo.id === orderId ? { ...wo, ...mergedUpdates } : wo));
    
    // Track cell history
    if (!skipHistory && oldValue !== value) {
      trackChange(orderId, field, oldValue, value);
    }
    
    setPendingChanges(prev => ({
      ...prev,
      [orderId]: { ...prev[orderId], ...mergedUpdates }
    }));

    if (debounceTimers.current[orderId]) {
      clearTimeout(debounceTimers.current[orderId]);
    }

    debounceTimers.current[orderId] = setTimeout(async () => {
      try {
        const changes = pendingChanges[orderId] || mergedUpdates;
        await WorkOrder.update(orderId, changes);
        setPendingChanges(prev => {
          const updated = { ...prev };
          delete updated[orderId];
          return updated;
        });
        delete debounceTimers.current[orderId];
      } catch (error) {
        if (!error.message?.includes('not found')) {
          console.error("Error updating work order:", error);
        }
        delete debounceTimers.current[orderId];
        setPendingChanges(prev => {
          const updated = { ...prev };
          delete updated[orderId];
          return updated;
        });
      }
    }, 1000);
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
    for (const id of ids) {
      if (debounceTimers.current[id]) {
        clearTimeout(debounceTimers.current[id]);
        delete debounceTimers.current[id];
      }
      await WorkOrder.update(id, {
        deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: currentUser?.email || "unknown"
      });
    }
    setWorkOrders(prev => prev.filter(wo => !ids.includes(wo.id)));
    setSelectedRows(new Set());
    setBulkDeleteConfirm(false);
  };

  const deleteWorkOrder = async (workOrder) => {
    setDeleteConfirm(workOrder);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const orderId = deleteConfirm.id;
    
    if (debounceTimers.current[orderId]) {
      clearTimeout(debounceTimers.current[orderId]);
      delete debounceTimers.current[orderId];
    }
    setPendingChanges(prev => {
      const updated = { ...prev };
      delete updated[orderId];
      return updated;
    });
    
    await WorkOrder.update(orderId, {
      deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: currentUser?.email || "unknown"
    });
    setWorkOrders(workOrders.filter(wo => wo.id !== orderId));
    setDeleteConfirm(null);
  };

  const moveToWorkflow = async (workOrder) => {
    await WorkOrder.update(workOrder.id, { 
      in_pipeline: true,
      current_stage: "permitting",
      start_date: workOrder.start_date || format(new Date(), "yyyy-MM-dd"),
      priority: 0
    });
    setWorkOrders(workOrders.filter(wo => wo.id !== workOrder.id));
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
    setCorbridgeDialog({ open: true, workOrder });
  };

  const saveCorbridgeData = async (invoiceNumber, link) => {
    const updates = {
      corbridge_invoice_number: invoiceNumber,
      est_inv_at: invoiceNumber
    };
    if (link) {
      updates.corbridge_link = link;
    }
    await WorkOrder.update(corbridgeDialog.workOrder.id, updates);
    setCorbridgeDialog({ open: false, workOrder: null });
    loadWorkOrders();
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
      "Customer": str(wo.client_name), "Source": str(wo.lead_source),
      "Current Task Deadline": str(wo.current_task_deadline), "Current Task Assigned to": str(wo.current_task_assigned_to),
      "Designer": str(wo.designer), "Project Manager": str(wo.project_manager), "Estimator": str(wo.estimator),
      "Est/Inv @": str(wo.est_inv_at || wo.corbridge_invoice_number), "Estimate Amount": num(wo.estimate_amount),
      "Current Task Description": str(wo.current_task_description), "Date Est. Requested/Initial Contact": str(wo.date_initial_contact),
      "Site Survey": str(wo.site_survey_date), "Date Estimate Sent to Customer": str(wo.date_estimate_sent),
      "Date Order Created": str(wo.date_order_created), "Project Install Date": str(wo.project_install_date),
      "Permit Submitted": str(wo.permit_submitted_date), "Notes": str(wo.title),
      "Date Permit Receipt Confirmed": str(wo.permit_receipt_confirmed_date), "Permit Number": str(wo.permit_number),
      "Date Permit Approved/Received": str(wo.permit_approved_date),
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
    importStateRef.current = { paused: false, cancelled: false };
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      updateProgress(0, rows.length, "Starting import...");

      // Load all existing work orders for deduplication matching
      let existingOrders = [];
      try {
        existingOrders = await WorkOrder.filter({ is_rider: false, deleted: { $ne: true } });
      } catch {}

      let created = 0, updated = 0;

      for (let i = 0; i < rows.length; i++) {
        if (importStateRef.current.cancelled) break;
        const row = rows[i];
        const clientName = row["Customer"] || row["client_name"] || "";
        if (!clientName) continue;

        const estInvAt = row["Est/Inv @"] || row["est_inv_at"] || "";

        const woData = {
          client_name: clientName,
          lead_source: row["Source"] || row["lead_source"] || "",
          current_task_deadline: row["Current Task Deadline"] || row["current_task_deadline"] || "",
          current_task_assigned_to: row["Current Task Assigned to"] || row["current_task_assigned_to"] || "",
          designer: row["Designer"] || row["designer"] || "",
          project_manager: row["Project Manager"] || row["project_manager"] || "",
          estimator: row["Estimator"] || row["estimator"] || "",
          est_inv_at: estInvAt,
          estimate_amount: parseFloat(row["Estimate Amount"] || row["estimate_amount"]) || null,
          current_task_description: row["Current Task Description"] || row["current_task_description"] || "",
          date_initial_contact: row["Date Est. Requested/Initial Contact"] || row["date_initial_contact"] || "",
          site_survey_date: row["Site Survey"] || row["site_survey_date"] || "",
          date_estimate_sent: row["Date Estimate Sent to Customer"] || row["date_estimate_sent"] || "",
          date_order_created: row["Date Order Created"] || row["date_order_created"] || "",
          project_install_date: row["Project Install Date"] || row["project_install_date"] || "",
          permit_submitted_date: row["Permit Submitted"] || row["permit_submitted_date"] || "",
          title: row["Notes"] || row["title"] || clientName,
          permit_receipt_confirmed_date: row["Date Permit Receipt Confirmed"] || row["permit_receipt_confirmed_date"] || "",
          permit_number: row["Permit Number"] || row["permit_number"] || "",
          permit_approved_date: row["Date Permit Approved/Received"] || row["permit_approved_date"] || "",
          sales_status: row["sales_status"] || "lead",
          in_pipeline: false,
        };

        // Try to find an existing matching record
        let existing = null;
        if (estInvAt) {
          existing = existingOrders.find(wo =>
            (wo.est_inv_at && wo.est_inv_at === estInvAt) ||
            (wo.corbridge_invoice_number && wo.corbridge_invoice_number === estInvAt)
          );
        }
        if (!existing) {
          existing = existingOrders.find(wo =>
            wo.client_name?.toLowerCase().trim() === clientName.toLowerCase().trim()
          );
        }

        try {
          if (existing) {
            await WorkOrder.update(existing.id, woData);
            setWorkOrders(prev => prev.map(wo => wo.id === existing.id ? { ...wo, ...woData } : wo));
            updated++;
          } else {
            const newOrder = await WorkOrder.create(woData);
            setWorkOrders(prev => [newOrder, ...prev]);
            existingOrders.push(newOrder); // prevent duplicates within same import
            created++;
          }
        } catch (err) {
          console.error("Import row error:", err);
        }

        updateProgress(i + 1, rows.length, `Importing ${clientName}... (${created} created, ${updated} updated)`);
      }

      completeImport();
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCreateFromForm = async (data) => {
    const newOrder = await WorkOrder.create({
      ...data,
      sales_status: "lead",
      in_pipeline: false
    });
    setWorkOrders([newOrder, ...workOrders]);
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

  // Pre-compute sort values for faster sorting
  const sortedWorkOrders = useMemo(() => {
    // First filter
    let result = workOrders.filter(wo => {
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
        const searchable = [wo.title, wo.client_name, wo.contact_name, wo.sales_rep].filter(Boolean).join(' ').toLowerCase();
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
  }, [workOrders, filterStatus, searchTerm, sortConfig, customFilters]);

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

  // Mobile card view
  if (isMobile) {
    return (
      <>
        <SalesPipelineMobileCards
          workOrders={filteredWorkOrders}
          onOpenDetails={(wo) => setSelectedWorkOrder(wo)}
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
          <span className="text-xs text-gray-500">{filteredWorkOrders.length} leads</span>
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
            await WorkOrder.update(wo.id, { current_stage: newStage });
            loadWorkOrders();
          }}
          onSplit={async (wo) => {
            // Create a rider work order
            const rider = await WorkOrder.create({
              title: `${wo.title} - Rider`,
              client_name: wo.client_name,
              description: wo.description,
              is_rider: true,
              parent_work_order_id: wo.id,
              current_stage: wo.current_stage,
              rider_stage: wo.current_stage,
              sales_status: wo.sales_status
            });
            loadWorkOrders();
          }}
          onComplete={async (wo) => {
            await WorkOrder.update(wo.id, { completed: true });
            setWorkOrders(workOrders.filter(w => w.id !== wo.id));
          }}
          onDelete={async (wo) => {
            await WorkOrder.update(wo.id, {
              deleted: true,
              deleted_at: new Date().toISOString(),
              deleted_by: currentUser?.email || "unknown"
            });
            setWorkOrders(workOrders.filter(w => w.id !== wo.id));
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

      <Dialog open={corbridgeDialog.open} onOpenChange={(open) => !open && setCorbridgeDialog({ open: false, workOrder: null })}>
        <DialogContent className="clay-card border-none max-w-md">
          <DialogHeader>
            <DialogTitle>Est/Inv # Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Invoice/Estimate Number</label>
              <Input
                defaultValue={corbridgeDialog.workOrder?.corbridge_invoice_number || corbridgeDialog.workOrder?.est_inv_at || ""}
                onChange={(e) => corbridgeDialog.workOrder && (corbridgeDialog.workOrder.corbridge_invoice_number = e.target.value)}
                placeholder="Enter number..."
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Link URL (optional)</label>
              <Input
                defaultValue={corbridgeDialog.workOrder?.corbridge_link || ""}
                onChange={(e) => corbridgeDialog.workOrder && (corbridgeDialog.workOrder.corbridge_link = e.target.value)}
                placeholder="Paste the URL here (optional)..."
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">Optional: Add a link to make the number clickable</p>
            </div>
            <Button
              onClick={() => {
                if (corbridgeDialog.workOrder) {
                  const invoiceNum = corbridgeDialog.workOrder.corbridge_invoice_number?.trim() || "";
                  const link = corbridgeDialog.workOrder.corbridge_link?.trim() || "";
                  saveCorbridgeData(invoiceNum, link);
                }
              }}
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
        importProgress={importProgress}
        deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
        confirmDelete={confirmDelete}
      />
    </div>
  );
});

export default SalesPipelineSpreadsheet;