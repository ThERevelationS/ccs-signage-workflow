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

// Helper to parse date string as local date (not UTC)
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};
import { Plus, Trash2, Calendar as CalendarIcon, ArrowRight, Loader2, Download, Upload, Pencil, ExternalLink, Link as LinkIcon, Save, ArrowUpDown, ArrowUp, ArrowDown, Strikethrough } from "lucide-react";
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
  const [importProgress, setImportProgress] = useState({ show: false, current: 0, total: 0, paused: false });
  const [exportProgress, setExportProgress] = useState({ show: false, progress: 0 });
  const importStateRef = useRef({ paused: false, cancelled: false });
  const [showForm, setShowForm] = useState(false);
  const [clearDateConfirm, setClearDateConfirm] = useState(null);
  const [focusedRowId, setFocusedRowId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [headerContextMenu, setHeaderContextMenu] = useState(null);
  const [showGradientDialog, setShowGradientDialog] = useState(false);
  const [deadlineGradientSettings, setDeadlineGradientSettings] = useState({
    enabled: true,
    baseColor: "#ffffff",
    dueColor: "#fecaca",
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
    { text: "Conduct Site Survey", page: "", color: "", opacity: 100, markOut: false },
    { text: "Research Sign Code for Mock-up", page: "", color: "", opacity: 100, markOut: false },
    { text: "Follow up with Customer - Pre-Estimating", page: "", color: "", opacity: 100, markOut: false },
    { text: "Mock up and Send to Customer", page: "", color: "", opacity: 100, markOut: false },
    { text: "Mock up Only", page: "", color: "", opacity: 100, markOut: false },
    { text: "Send Mock up to Customer", page: "", color: "", opacity: 100, markOut: false },
    { text: "Quoting - 3rd Party", page: "", color: "", opacity: 100, markOut: false },
    { text: "Complete Estimate for Review", page: "Estimating", color: "", opacity: 100, markOut: false },
    { text: "Estimate - To Be Reviewed", page: "Estimating", color: "", opacity: 100, markOut: false },
    { text: "Review Complete - Send to Customer", page: "", color: "", opacity: 100, markOut: false },
    { text: "Follow up with Customer - Post-Estimate", page: "", color: "", opacity: 100, markOut: false },
    { text: "On Hold - Follow Up with Customer", page: "", color: "", opacity: 100, markOut: false },
    { text: "Waiting on Deposit", page: "", color: "", opacity: 100, markOut: false },
    { text: "WIP - Waiting for Deposit", page: "", color: "", opacity: 100, markOut: false },
    { text: "WIP - In Final Design Queue", page: "Design", color: "", opacity: 100, markOut: false },
    { text: "WIP - Designing", page: "Design", color: "", opacity: 100, markOut: false },
    { text: "WIP - Prepare/Submit Permit", page: "Permitting", color: "", opacity: 100, markOut: false },
    { text: "WIP - Follow Up On Status of Accepted Permit", page: "Permitting", color: "", opacity: 100, markOut: false },
    { text: "WIP - Permitting Follow-ups", page: "Permitting", color: "", opacity: 100, markOut: false },
    { text: "WIP - Production/Fabrication", page: "Production", color: "", opacity: 100, markOut: false },
    { text: "WIP - Outsourced Fabrication", page: "Fabrication", color: "", opacity: 100, markOut: false },
    { text: "WIP - Maintenance/Service Call", page: "", color: "", opacity: 100, markOut: false },
    { text: "WIP - Installation", page: "Installation", color: "", opacity: 100, markOut: false },
    { text: "WIP - Outsourced Installation", page: "Installation", color: "", opacity: 100, markOut: false },
    { text: "WIP - Follow Up with Customer", page: "", color: "", opacity: 100, markOut: false },
    { text: "WIP - Inspections", page: "", color: "", opacity: 100, markOut: false },
    { text: "Completed Sale - Electrical Inspection", page: "", color: "#f1f5f9", opacity: 60, markOut: true },
    { text: "Completed Sale - Sign Inspection", page: "", color: "#f1f5f9", opacity: 60, markOut: true },
    { text: "Completed Sales - Post Invoice Tasks", page: "", color: "#f1f5f9", opacity: 60, markOut: true },
    { text: "Completed Sale", page: "", color: "#f1f5f9", opacity: 60, markOut: true },
    { text: "Lost", page: "", color: "#fef2f2", opacity: 60, markOut: true },
    { text: "Lost - We took too long", page: "", color: "#fef2f2", opacity: 60, markOut: true },
    { text: "Closed - Attempted Follow-up/No Response", page: "", color: "#f1f5f9", opacity: 60, markOut: true },
    { text: "Closed - Did not Lose", page: "", color: "#f1f5f9", opacity: 60, markOut: true }
  ]);

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

  useEffect(() => {
    loadGlobalSettings();
    loadWorkOrders();
    const interval = setInterval(() => loadWorkOrders(false), 60000); // Reduced frequency
    return () => clearInterval(interval);
  }, []);

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

  const calculateDays = (fromDate, toDate = new Date()) => {
    if (!fromDate) return null;
    try {
      const from = new Date(fromDate);
      const to = typeof toDate === 'string' ? new Date(toDate) : toDate;
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
  };

  const updateWorkOrder = (orderId, field, value, skipHistory = false) => {
    const currentWo = workOrders.find(wo => wo.id === orderId);
    const oldValue = currentWo ? currentWo[field] : "";
    
    setWorkOrders(prev => prev.map(wo => wo.id === orderId ? { ...wo, [field]: value } : wo));
    
    // Track cell history
    if (!skipHistory && oldValue !== value) {
      trackChange(orderId, field, oldValue, value);
    }
    
    setPendingChanges(prev => ({
      ...prev,
      [orderId]: { ...prev[orderId], [field]: value }
    }));

    if (debounceTimers.current[orderId]) {
      clearTimeout(debounceTimers.current[orderId]);
    }

    debounceTimers.current[orderId] = setTimeout(async () => {
      try {
        const changes = pendingChanges[orderId] || { [field]: value };
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

  const deleteWorkOrder = async (workOrder) => {
    setDeleteConfirm(workOrder);
  };

  const confirmDelete = async () => {
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
    
    const daysUntilDue = differenceInDays(deadline, today);
    
    // If past due, use the due color
    if (daysUntilDue <= 0) return deadlineGradientSettings.dueColor;
    
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
    
    const exportData = filteredWorkOrders.map(wo => {
      const daysFromInitial = calculateDays(wo.date_initial_contact);
      const daysEstSent = calculateDays(wo.date_initial_contact, wo.date_estimate_sent);
      const daysEstToOrder = calculateDays(wo.date_estimate_sent, wo.date_order_created);
      const daysOrderToPermit = calculateDays(wo.date_order_created, wo.permit_submitted_date);
      const daysPermitToApproved = calculateDays(wo.permit_submitted_date, wo.permit_approved_date);
      const daysOrderToInstall = calculateDays(wo.date_order_created, wo.project_install_date);
      
      // Helper to ensure clean string values
      const str = (val) => (val == null ? "" : String(val));
      const num = (val) => (typeof val === 'number' && !isNaN(val) ? val : (val == null || val === "" ? null : Number(val) || null));
      
      return {
        "Customer": str(wo.client_name),
        "Source": str(wo.lead_source),
        "Current Task Deadline": str(wo.current_task_deadline),
        "Current Task Assigned to": str(wo.current_task_assigned_to),
        "Designer": str(wo.designer),
        "Project Manager": str(wo.project_manager),
        "Estimator": str(wo.estimator),
        "Est/Inv @": str(wo.est_inv_at || wo.corbridge_invoice_number),
        "Estimate Amount": num(wo.estimate_amount),
        "Current Task Description": str(wo.current_task_description),
        "Date Est. Requested/Initial Contact": str(wo.date_initial_contact),
        "Site Survey": str(wo.site_survey_date),
        "Date Estimate Sent to Customer": str(wo.date_estimate_sent),
        "Date Order Created": str(wo.date_order_created),
        "Project Install Date": str(wo.project_install_date),
        "Permit Submitted": str(wo.permit_submitted_date),
        "Notes": str(wo.title),
        "Date Permit Receipt Confirmed": str(wo.permit_receipt_confirmed_date),
        "Permit Number": str(wo.permit_number),
        "Date Permit Approved/Received": str(wo.permit_approved_date),
        "Days from Initial Request to today": num(daysFromInitial),
        "Days Est. Sent from Date Requested": num(daysEstSent),
        "Days from Est. Sent to Date Order Created": num(daysEstToOrder),
        "Days from Order Created to Permit Submitted": num(daysOrderToPermit),
        "Days from Permit Submitted to Permit Approved": num(daysPermitToApproved),
        "Days from Project Install Date from Order Created": num(daysOrderToInstall)
      };
    });

    await new Promise(resolve => setTimeout(resolve, 300));
    setExportProgress({ show: true, progress: 50 });

    // Create worksheet from data
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths for better readability
    const colWidths = [
      { wch: 25 }, // Customer
      { wch: 12 }, // Source
      { wch: 15 }, // Current Task Deadline
      { wch: 20 }, // Current Task Assigned to
      { wch: 15 }, // Designer
      { wch: 15 }, // Project Manager
      { wch: 15 }, // Estimator
      { wch: 15 }, // Est/Inv @
      { wch: 15 }, // Estimate Amount
      { wch: 30 }, // Current Task Description
      { wch: 15 }, // Date Est. Requested
      { wch: 12 }, // Site Survey
      { wch: 15 }, // Date Estimate Sent
      { wch: 15 }, // Date Order Created
      { wch: 15 }, // Project Install Date
      { wch: 15 }, // Permit Submitted
      { wch: 40 }, // Notes
      { wch: 18 }, // Date Permit Receipt
      { wch: 12 }, // Permit Number
      { wch: 18 }, // Date Permit Approved
      { wch: 18 }, // Days Init->Today
      { wch: 18 }, // Days Req->Est
      { wch: 18 }, // Days Est->Ord
      { wch: 18 }, // Days Ord->Prm
      { wch: 18 }, // Days Prm->App
      { wch: 18 }, // Days Ord->Ins
    ];
    ws['!cols'] = colWidths;

    // Create workbook and add the worksheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Pipeline");
    
    // Write as xlsx with proper bookType
    XLSX.writeFile(wb, `sales_pipeline_${format(new Date(), "yyyy-MM-dd")}.xlsx`, { 
      bookType: 'xlsx',
      type: 'binary'
    });
    
    setExportProgress({ show: true, progress: 100 });
    setTimeout(() => setExportProgress({ show: false, progress: 0 }), 1000);
  };

  const importFromExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    importStateRef.current = { paused: false, cancelled: false };

    const reader = new FileReader();
    reader.onload = async (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      setImportProgress({ show: true, current: 0, total: jsonData.length, paused: false });

      // Track existing work orders to check for duplicates - use client_name as primary key
      const existingWorkOrdersMap = new Map();
      workOrders.forEach(wo => {
        // Key by client_name only to prevent duplicate customers
        if (wo.client_name) {
          const key = wo.client_name.toLowerCase().trim();
          existingWorkOrdersMap.set(key, wo);
        }
      });

      let importedCount = 0;

      for (let i = 0; i < jsonData.length; i++) {
        // Check for cancel
        if (importStateRef.current.cancelled) {
          setImportProgress({ show: false, current: 0, total: 0, paused: false });
          return;
        }

        // Wait while paused
        while (importStateRef.current.paused) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const row = jsonData[i];
        
        // Get customer name with type handling
        let customerRaw = row["Customer"] ?? row["Customer Name"] ?? row["client_name"] ?? "";
        let customer = "";
        if (customerRaw !== undefined && customerRaw !== null) {
          if (typeof customerRaw === 'number') {
            customer = String(customerRaw);
          } else {
            customer = String(customerRaw).trim();
          }
        }
        
        // Skip empty rows - title is the Notes column
        const title = row["Notes"] ?? row["title"] ?? "";
        if (!customer && !title) {
          setImportProgress({ show: true, current: i + 1, total: jsonData.length });
          continue;
        }

        // Check for duplicates by customer name - if found, fill in missing fields instead of creating duplicate
        const uniqueKey = customer.toLowerCase().trim();
        const existingWO = uniqueKey ? existingWorkOrdersMap.get(uniqueKey) : null;
        
        if (existingWO) {
          // Fill in missing information on existing work order
          const updates = {};
          
          // Source column mapping
          if (!existingWO.lead_source && (row["Source"] ?? row["Lead Source"])) {
            updates.lead_source = String(row["Source"] ?? row["Lead Source"]);
          }
          if (!existingWO.current_task_assigned_to && row["Current Task Assigned to"]) {
            updates.current_task_assigned_to = String(row["Current Task Assigned to"]);
          }
          // Designer column mapping
          if (!existingWO.designer && (row["Designer"] ?? row["designer"])) {
            updates.designer = String(row["Designer"] ?? row["designer"]);
          }
          // Project Manager column mapping
          if (!existingWO.project_manager && (row["Project Manager"] ?? row["PM"] ?? row["project_manager"])) {
            updates.project_manager = String(row["Project Manager"] ?? row["PM"] ?? row["project_manager"]);
          }
          // Estimator column mapping
          if (!existingWO.estimator && (row["Estimator"] ?? row["estimator"])) {
            updates.estimator = String(row["Estimator"] ?? row["estimator"]);
          }
          // Est/Inv # column mapping - store in est_inv_at field
          const estInvValue = row["Est/Inv @"] ?? row["Est/Inv #"] ?? row["Est/Inv # Link"] ?? row["corbridge_invoice_number"];
          if (!existingWO.est_inv_at && estInvValue != null && estInvValue !== "") {
            updates.est_inv_at = String(estInvValue);
          }
          if (!existingWO.estimate_amount && row["Estimate Amount"]) {
            updates.estimate_amount = parseFloat(row["Estimate Amount"]) || 0;
          }
          if (!existingWO.current_task_description && row["Current Task Description"]) {
            updates.current_task_description = String(row["Current Task Description"]);
          }
          if (!existingWO.permit_number && row["Permit Number"]) {
            updates.permit_number = String(row["Permit Number"]);
          }
          
          // Parse and fill in dates if missing
          const parseExcelDateForUpdate = (value) => {
            if (!value) return null;
            if (typeof value === 'number') {
              const date = new Date((value - 25569) * 86400 * 1000);
              if (!isNaN(date.getTime())) {
                return format(date, "yyyy-MM-dd");
              }
            }
            if (typeof value === 'string' && value.trim()) {
              const parsed = new Date(value);
              if (!isNaN(parsed.getTime())) {
                return format(parsed, "yyyy-MM-dd");
              }
            }
            return null;
          };
          
          const dateFields = [
            { key: 'current_task_deadline', column: 'Current Task Deadline' },
            { key: 'date_initial_contact', column: 'Date Est. Requested/Initial Contact' },
            { key: 'site_survey_date', column: 'Site Survey' },
            { key: 'date_estimate_sent', column: 'Date Estimate Sent to Customer' },
            { key: 'date_order_created', column: 'Date Order Created' },
            { key: 'project_install_date', column: 'Project Install Date' },
            { key: 'permit_submitted_date', column: 'Permit Submitted' },
            { key: 'permit_receipt_confirmed_date', column: 'Date Permit Receipt Confirmed' },
            { key: 'permit_approved_date', column: 'Date Permit Approved/Received' }
          ];
          
          dateFields.forEach(({ key, column }) => {
            if (!existingWO[key] && row[column]) {
              const parsed = parseExcelDateForUpdate(row[column]);
              if (parsed) updates[key] = parsed;
            }
          });
          
          // Only update if there are changes
          if (Object.keys(updates).length > 0) {
            await WorkOrder.update(existingWO.id, updates);
            setWorkOrders(prev => prev.map(wo => wo.id === existingWO.id ? { ...wo, ...updates } : wo));
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          setImportProgress({ show: true, current: i + 1, total: jsonData.length });
          continue;
        }
        
        // Parse notes into individual entries by date
        const notesRaw = row["Notes"] ?? "";
        const notesText = typeof notesRaw === 'string' ? notesRaw : String(notesRaw);
        const parsedNotes = [];
        
        if (notesText) {
          const datePattern = /(\d{1,2}\/\d{1,2}\/\d{4})/g;
          const parts = notesText.split(datePattern);
          
          let currentNote = "";
          let currentDate = null;
          
          for (let j = 0; j < parts.length; j++) {
            const part = parts[j].trim();
            if (!part) continue;
            
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(part)) {
              if (currentNote && currentDate) {
                parsedNotes.push({
                  text: currentNote.trim(),
                  timestamp: currentDate,
                  created_by: "Import",
                  completed: false,
                  sub_tasks: []
                });
              }
              const [month, day, year] = part.split('/').map(Number);
              currentDate = new Date(year, month - 1, day).toISOString();
              currentNote = "";
            } else {
              currentNote += (currentNote ? " " : "") + part;
            }
          }
          
          if (currentNote && currentDate) {
            parsedNotes.push({
              text: currentNote.trim(),
              timestamp: currentDate,
              created_by: "Import",
              completed: false,
              sub_tasks: []
            });
          }
          
          // If no date pattern found, add the whole text as a single note
          if (parsedNotes.length === 0 && notesText.trim()) {
            parsedNotes.push({
              text: notesText.trim(),
              timestamp: new Date().toISOString(),
              created_by: "Import",
              completed: false,
              sub_tasks: []
            });
          }
        }

        // Parse Excel dates
        const parseExcelDate = (value) => {
          if (!value) return "";
          if (typeof value === 'number') {
            const date = new Date((value - 25569) * 86400 * 1000);
            if (!isNaN(date.getTime())) {
              return format(date, "yyyy-MM-dd");
            }
          }
          if (typeof value === 'string' && value.trim()) {
            const parsed = new Date(value);
            if (!isNaN(parsed.getTime())) {
              return format(parsed, "yyyy-MM-dd");
            }
          }
          return "";
        };
        
        // Also create work_notes from the imported notes text
        const importedWorkNotes = notesText.trim() ? [{
          id: Date.now(),
          type: "other",
          text: notesText.trim(),
          timestamp: new Date().toISOString(),
          created_by: "Import",
          sub_tasks: []
        }] : [];

        const newWO = await WorkOrder.create({
          title: customer || "Unnamed",
          client_name: customer,
          lead_source: String(row["Source"] ?? row["Lead Source"] ?? ""),
          current_task_deadline: parseExcelDate(row["Current Task Deadline"]),
          current_task_assigned_to: String(row["Current Task Assigned to"] || ""),
          designer: String(row["Designer"] ?? row["designer"] ?? ""),
          project_manager: String(row["Project Manager"] ?? row["PM"] ?? row["project_manager"] ?? ""),
          estimator: String(row["Estimator"] ?? row["estimator"] ?? ""),
          est_inv_at: String(row["Est/Inv @"] ?? row["Est/Inv #"] ?? row["Est/Inv # Link"] ?? row["corbridge_invoice_number"] ?? ""),
          estimate_amount: parseFloat(row["Estimate Amount"]) || 0,
          current_task_description: String(row["Current Task Description"] || ""),
          date_initial_contact: parseExcelDate(row["Date Est. Requested/Initial Contact"]),
          site_survey_date: parseExcelDate(row["Site Survey"]),
          date_estimate_sent: parseExcelDate(row["Date Estimate Sent to Customer"]),
          date_order_created: parseExcelDate(row["Date Order Created"]),
          project_install_date: parseExcelDate(row["Project Install Date"]),
          permit_submitted_date: parseExcelDate(row["Permit Submitted"]),
          permit_receipt_confirmed_date: parseExcelDate(row["Date Permit Receipt Confirmed"]),
          permit_number: String(row["Permit Number"] || ""),
          permit_approved_date: parseExcelDate(row["Date Permit Approved/Received"]),
          in_pipeline: false,
          sales_status: "lead",
          notes: [],
          work_notes: importedWorkNotes
        });
        
        if (uniqueKey) {
          existingWorkOrdersMap.set(uniqueKey, newWO);
        }
        setWorkOrders(prev => [newWO, ...prev]);
        
        importedCount++;
        setImportProgress({ show: true, current: i + 1, total: jsonData.length });
        
        await new Promise(resolve => setTimeout(resolve, 250));
      }

      setTimeout(() => setImportProgress({ show: false, current: 0, total: 0 }), 1500);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
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
    
    return conditions.every(condition => {
      const fieldValue = wo[condition.field];
      const condValue = condition.value;
      
      switch (condition.operator) {
        case "is":
          return fieldValue == condValue;
        case "is_not":
          return fieldValue != condValue;
        case "equals":
          return fieldValue == condValue;
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
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
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

  return (
    <div className="overflow-visible" onClick={(e) => { 
      // Don't close menus if clicking inside a dialog/popover
      if (e.target.closest('[role="dialog"]') || e.target.closest('[data-radix-popper-content-wrapper]')) return;
      contextMenu && setContextMenu(null); 
      headerContextMenu && setHeaderContextMenu(null); 
    }}>
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={importFromExcel}
        className="hidden"
        disabled={importProgress.show}
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
                  disabled={importProgress.show}
                  className="clay-button border-none text-gray-700 h-8"
                  style={{ background: 'linear-gradient(135deg, #FFE4D6 0%, #FFD6E8 100%)' }}
                >
                  {importProgress.show ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
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

      {importProgress.show && (
        <div className="mb-3 px-2">
          <div className="clay-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                {importProgress.paused ? 'Import Paused' : 'Importing...'}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{importProgress.current} / {importProgress.total}</span>
                {importProgress.paused ? (
                  <Button 
                    size="sm" 
                    onClick={() => {
                      importStateRef.current.paused = false;
                      setImportProgress(prev => ({ ...prev, paused: false }));
                    }}
                    className="h-6 px-2"
                  >
                    Resume
                  </Button>
                ) : (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      importStateRef.current.paused = true;
                      setImportProgress(prev => ({ ...prev, paused: true }));
                    }}
                    className="h-6 px-2"
                  >
                    Pause
                  </Button>
                )}
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => {
                    importStateRef.current.cancelled = true;
                  }}
                  className="h-6 px-2"
                >
                  Stop
                </Button>
              </div>
            </div>
            <Progress value={(importProgress.current / importProgress.total) * 100} className="h-2" />
          </div>
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

      <div ref={parentRef} className="overflow-auto" style={{ height: 'calc(100vh - 300px)' }}>
        <table className="w-full border-collapse border rounded-lg" style={{ fontSize: '12px', tableLayout: 'auto' }}>
          <thead className="bg-gray-100">
            <tr className="border-b sticky top-0 z-10 bg-gray-100">
              <th className="px-2 py-2 border-r text-center font-medium text-gray-700" style={{ width: '32px', minWidth: '32px' }}>#</th>
              {isColumnVisible("client_name") && <th className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'client_name' ? 'bg-blue-100' : ''}`} style={{ minWidth: '120px' }} onClick={() => handleSort('client_name')} onContextMenu={(e) => handleHeaderContextMenu(e, 'client_name', 'Customer')}>
                <div className="flex items-center gap-1">Customer {getSortIcon('client_name')}</div>
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
              <th className="px-2 py-2 text-left font-medium text-gray-700" style={{ minWidth: '40px' }}></th>
            </tr>
          </thead>

          <tbody>
            {/* Spacer row for virtual scroll offset */}
            <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start || 0}px` }}>
              <td colSpan={100} />
            </tr>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const index = virtualRow.index;
              const wo = filteredWorkOrders[index];
              const daysFromInitial = calculateDays(wo.date_initial_contact);
              const daysEstSent = calculateDays(wo.date_initial_contact, wo.date_estimate_sent);
              const daysEstToOrder = calculateDays(wo.date_estimate_sent, wo.date_order_created);
              const daysOrderToPermit = calculateDays(wo.date_order_created, wo.permit_submitted_date);
              const daysPermitToApproved = calculateDays(wo.permit_submitted_date, wo.permit_approved_date);
              const daysOrderToInstall = calculateDays(wo.date_order_created, wo.project_install_date);
              const isFocused = focusedRowId === wo.id;
              const taskStyle = getTaskDescStyle(wo.current_task_description);

              return (
              <React.Fragment key={wo.id}>
                {isFocused && <tr><td colSpan={100} className="h-3 bg-transparent border-none"></td></tr>}
                <tr 
                  className={`border-b ${!taskStyle.backgroundColor && !isFocused ? 'hover:bg-gray-50' : ''} ${isFocused ? 'ring-2 ring-purple-400 ring-inset bg-purple-50/50' : ''} ${taskStyle.markOut ? 'line-through' : ''}`}
                  style={{ 
                    backgroundColor: !isFocused && taskStyle.backgroundColor ? taskStyle.backgroundColor : undefined
                  }}
                >
                {/* Row Number - Clickable Focus Button */}
                <td className="px-0 py-0 border-r">
                  <button
                    onClick={() => setFocusedRowId(isFocused ? null : wo.id)}
                    className={`w-full h-full px-2 py-1.5 text-center font-medium transition-colors ${
                      isFocused 
                        ? 'bg-purple-500 text-white' 
                        : 'text-gray-500 hover:bg-purple-100 hover:text-purple-700'
                    }`}
                  >
                    {index + 1}
                  </button>
                </td>
                {isColumnVisible("client_name") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "client_name", "Customer", wo.client_name)}
                  >
                    <button
                      onClick={() => setSelectedWorkOrder(wo)}
                      className="h-7 w-full text-xs text-left px-1 hover:bg-blue-50 rounded flex items-center gap-1 text-blue-600"
                    >
                      <LinkIcon className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{wo.client_name || "Unnamed"}</span>
                    </button>
                  </td>
                )}

                {isColumnVisible("lead_source") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "lead_source", "Source", wo.lead_source)}
                  >
                    <Select
                      value={wo.lead_source || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "lead_source", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        {leadSources.map(source => (
                          <SelectItem key={source} value={source}>{source}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                )}

                {isColumnVisible("current_task_deadline") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    style={{ backgroundColor: getDeadlineCellColor(wo.current_task_deadline) }}
                    onContextMenu={(e) => handleContextMenu(e, wo, "current_task_deadline", "Deadline", wo.current_task_deadline)}
                  >
                    <Popover open={openDatePopover === `deadline-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `deadline-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100/50 rounded">
                          {wo.current_task_deadline ? format(parseLocalDate(wo.current_task_deadline), "MM/dd/yy") : "-"}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        {wo.current_task_deadline && (
                          <div className="p-2 border-b">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => {
                                setClearDateConfirm({ woId: wo.id, field: 'current_task_deadline' });
                                setOpenDatePopover(null);
                              }}
                            >
                              Clear Date
                            </Button>
                          </div>
                        )}
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
                )}

                {isColumnVisible("current_task_assigned_to") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "current_task_assigned_to", "Task Assigned", wo.current_task_assigned_to)}
                  >
                    <Select
                      value={wo.current_task_assigned_to || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "current_task_assigned_to", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1">
                        <SelectValue placeholder="-">{wo.current_task_assigned_to || "-"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {/* Show current value if not in user list */}
                        {wo.current_task_assigned_to && !users.some(u => u.full_name === wo.current_task_assigned_to && u.sales_roles?.includes("Task Assigned")) && (
                          <SelectItem key={wo.current_task_assigned_to} value={wo.current_task_assigned_to}>{wo.current_task_assigned_to}</SelectItem>
                        )}
                        {users.filter(u => u.sales_roles?.includes("Task Assigned")).map(u => (
                          <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                )}

                {isColumnVisible("designer") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "designer", "Designer", wo.designer)}
                  >
                    <Select
                      value={wo.designer || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "designer", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1">
                        <SelectValue placeholder="-">{wo.designer || "-"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {/* Show current value if not in user list */}
                        {wo.designer && !users.some(u => u.full_name === wo.designer && u.sales_roles?.includes("Designer")) && (
                          <SelectItem key={wo.designer} value={wo.designer}>{wo.designer}</SelectItem>
                        )}
                        {users.filter(u => u.sales_roles?.includes("Designer")).map(u => (
                          <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                )}

                {isColumnVisible("project_manager") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "project_manager", "Project Manager", wo.project_manager)}
                  >
                    <Select
                      value={wo.project_manager || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "project_manager", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1">
                        <SelectValue placeholder="-">{wo.project_manager || "-"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {/* Show current value if not in user list */}
                        {wo.project_manager && !users.some(u => u.full_name === wo.project_manager && (u.sales_roles?.includes("Project Manager") || u.sales_roles?.includes("PM"))) && (
                          <SelectItem key={wo.project_manager} value={wo.project_manager}>{wo.project_manager}</SelectItem>
                        )}
                        {users.filter(u => u.sales_roles?.includes("Project Manager") || u.sales_roles?.includes("PM")).map(u => (
                          <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                )}

                {isColumnVisible("estimator") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "estimator", "Estimator", wo.estimator)}
                  >
                    <Select
                      value={wo.estimator || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "estimator", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1">
                        <SelectValue placeholder="-">{wo.estimator || "-"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {/* Show current value if not in user list */}
                        {wo.estimator && !users.some(u => u.full_name === wo.estimator && u.sales_roles?.includes("Estimator")) && (
                          <SelectItem key={wo.estimator} value={wo.estimator}>{wo.estimator}</SelectItem>
                        )}
                        {users.filter(u => u.sales_roles?.includes("Estimator")).map(u => (
                          <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                )}

                {isColumnVisible("est_inv_at") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "est_inv_at", "Est/Inv #", wo.est_inv_at)}
                  >
                    <div className="flex items-center gap-1">
                      {wo.corbridge_link ? (
                        <a
                          href={wo.corbridge_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline truncate flex-1"
                        >
                          {wo.corbridge_invoice_number || wo.est_inv_at || "Link"}
                        </a>
                      ) : (
                        <Input
                          value={wo.est_inv_at || ""}
                          onChange={(e) => updateWorkOrder(wo.id, "est_inv_at", e.target.value)}
                          className="h-7 text-xs border-0 bg-transparent px-1 flex-1"
                          placeholder="-"
                          disabled={!isRegistered}
                        />
                      )}
                      {isRegistered && (
                        <button
                          onClick={() => openCorbridgeDialog(wo)}
                          className="flex-shrink-0"
                          title="Add link"
                        >
                          <LinkIcon className="w-2.5 h-2.5 text-gray-400 hover:text-blue-600" />
                        </button>
                      )}
                    </div>
                  </td>
                )}

                {isColumnVisible("estimate_amount") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "estimate_amount", "Estimate Amount", wo.estimate_amount)}
                  >
                    <div className="relative flex items-center">
                      <span className="absolute left-1 text-xs text-gray-500">$</span>
                      <Input
                        type="number"
                        value={wo.estimate_amount || ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          updateWorkOrder(wo.id, "estimate_amount", parseFloat(val) || 0);
                        }}
                        className="h-7 text-xs border-0 bg-transparent pl-3 pr-1"
                        placeholder="0"
                        disabled={!isRegistered}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </td>
                )}

                {isColumnVisible("current_task_description") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "current_task_description", "Task Description", wo.current_task_description)}
                  >
                    <Select
                      value={wo.current_task_description || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "current_task_description", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        {taskDescriptions.map(desc => (
                          <SelectItem key={getTaskDescText(desc)} value={getTaskDescText(desc)}>{getTaskDescText(desc)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                )}

                {isColumnVisible("date_initial_contact") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "date_initial_contact", "Initial Contact", wo.date_initial_contact)}
                  >
                    <Popover open={openDatePopover === `initial-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `initial-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.date_initial_contact ? format(parseLocalDate(wo.date_initial_contact), "MM/dd/yy") : "-"}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        {wo.date_initial_contact && (
                          <div className="p-2 border-b">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => {
                                setClearDateConfirm({ woId: wo.id, field: 'date_initial_contact' });
                                setOpenDatePopover(null);
                              }}
                            >
                              Clear Date
                            </Button>
                          </div>
                        )}
                        <Calendar
                          mode="single"
                          selected={parseLocalDate(wo.date_initial_contact)}
                          onSelect={(date) => {
                            updateWorkOrder(wo.id, "date_initial_contact", date ? format(date, "yyyy-MM-dd") : "");
                            setOpenDatePopover(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </td>
                )}

                {isColumnVisible("site_survey_date") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "site_survey_date", "Site Survey", wo.site_survey_date)}
                  >
                    <Popover open={openDatePopover === `survey-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `survey-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.site_survey_date ? format(parseLocalDate(wo.site_survey_date), "MM/dd/yy") : "-"}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        {wo.site_survey_date && (
                          <div className="p-2 border-b">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => {
                                setClearDateConfirm({ woId: wo.id, field: 'site_survey_date' });
                                setOpenDatePopover(null);
                              }}
                            >
                              Clear Date
                            </Button>
                          </div>
                        )}
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
                )}

                {isColumnVisible("date_estimate_sent") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "date_estimate_sent", "Estimate Sent", wo.date_estimate_sent)}
                  >
                    <Popover open={openDatePopover === `estsent-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `estsent-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.date_estimate_sent ? format(parseLocalDate(wo.date_estimate_sent), "MM/dd/yy") : "-"}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        {wo.date_estimate_sent && (
                          <div className="p-2 border-b">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => {
                                setClearDateConfirm({ woId: wo.id, field: 'date_estimate_sent' });
                                setOpenDatePopover(null);
                              }}
                            >
                              Clear Date
                            </Button>
                          </div>
                        )}
                        <Calendar
                          mode="single"
                          selected={parseLocalDate(wo.date_estimate_sent)}
                          onSelect={(date) => {
                            updateWorkOrder(wo.id, "date_estimate_sent", date ? format(date, "yyyy-MM-dd") : "");
                            setOpenDatePopover(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </td>
                )}

                {isColumnVisible("date_order_created") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "date_order_created", "Order Created", wo.date_order_created)}
                  >
                    <Popover open={openDatePopover === `ordercreated-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `ordercreated-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.date_order_created ? format(parseLocalDate(wo.date_order_created), "MM/dd/yy") : "-"}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        {wo.date_order_created && (
                          <div className="p-2 border-b">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => {
                                setClearDateConfirm({ woId: wo.id, field: 'date_order_created' });
                                setOpenDatePopover(null);
                              }}
                            >
                              Clear Date
                            </Button>
                          </div>
                        )}
                        <Calendar
                          mode="single"
                          selected={parseLocalDate(wo.date_order_created)}
                          onSelect={(date) => {
                            updateWorkOrder(wo.id, "date_order_created", date ? format(date, "yyyy-MM-dd") : "");
                            setOpenDatePopover(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </td>
                )}

                {isColumnVisible("project_install_date") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "project_install_date", "Install Date", wo.project_install_date)}
                  >
                    <Popover open={openDatePopover === `install-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `install-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.project_install_date ? format(parseLocalDate(wo.project_install_date), "MM/dd/yy") : "-"}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        {wo.project_install_date && (
                          <div className="p-2 border-b">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => {
                                setClearDateConfirm({ woId: wo.id, field: 'project_install_date' });
                                setOpenDatePopover(null);
                              }}
                            >
                              Clear Date
                            </Button>
                          </div>
                        )}
                        <Calendar
                          mode="single"
                          selected={parseLocalDate(wo.project_install_date)}
                          onSelect={(date) => {
                            updateWorkOrder(wo.id, "project_install_date", date ? format(date, "yyyy-MM-dd") : "");
                            setOpenDatePopover(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </td>
                )}

                {isColumnVisible("permit_submitted_date") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "permit_submitted_date", "Permit Submitted", wo.permit_submitted_date)}
                  >
                    <Popover open={openDatePopover === `permitsub-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `permitsub-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.permit_submitted_date ? format(parseLocalDate(wo.permit_submitted_date), "MM/dd/yy") : "-"}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        {wo.permit_submitted_date && (
                          <div className="p-2 border-b">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => {
                                setClearDateConfirm({ woId: wo.id, field: 'permit_submitted_date' });
                                setOpenDatePopover(null);
                              }}
                            >
                              Clear Date
                            </Button>
                          </div>
                        )}
                        <Calendar
                          mode="single"
                          selected={parseLocalDate(wo.permit_submitted_date)}
                          onSelect={(date) => {
                            updateWorkOrder(wo.id, "permit_submitted_date", date ? format(date, "yyyy-MM-dd") : "");
                            setOpenDatePopover(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </td>
                )}



                {isColumnVisible("permit_receipt_confirmed_date") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "permit_receipt_confirmed_date", "Permit Confirmed", wo.permit_receipt_confirmed_date)}
                  >
                    <Popover open={openDatePopover === `permitconf-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `permitconf-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.permit_receipt_confirmed_date ? format(parseLocalDate(wo.permit_receipt_confirmed_date), "MM/dd/yy") : "-"}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        {wo.permit_receipt_confirmed_date && (
                          <div className="p-2 border-b">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => {
                                setClearDateConfirm({ woId: wo.id, field: 'permit_receipt_confirmed_date' });
                                setOpenDatePopover(null);
                              }}
                            >
                              Clear Date
                            </Button>
                          </div>
                        )}
                        <Calendar
                          mode="single"
                          selected={parseLocalDate(wo.permit_receipt_confirmed_date)}
                          onSelect={(date) => {
                            updateWorkOrder(wo.id, "permit_receipt_confirmed_date", date ? format(date, "yyyy-MM-dd") : "");
                            setOpenDatePopover(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </td>
                )}

                {isColumnVisible("permit_number") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "permit_number", "Permit Number", wo.permit_number)}
                  >
                    <Input
                      value={wo.permit_number || ""}
                      onChange={(e) => updateWorkOrder(wo.id, "permit_number", e.target.value)}
                      className="h-7 text-xs border-0 bg-transparent px-1"
                      placeholder="-"
                      disabled={!isRegistered}
                    />
                  </td>
                )}

                {isColumnVisible("permit_approved_date") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "permit_approved_date", "Permit Approved", wo.permit_approved_date)}
                  >
                    <Popover open={openDatePopover === `permitappr-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `permitappr-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.permit_approved_date ? format(parseLocalDate(wo.permit_approved_date), "MM/dd/yy") : "-"}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        {wo.permit_approved_date && (
                          <div className="p-2 border-b">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => {
                                setClearDateConfirm({ woId: wo.id, field: 'permit_approved_date' });
                                setOpenDatePopover(null);
                              }}
                            >
                              Clear Date
                            </Button>
                          </div>
                        )}
                        <Calendar
                          mode="single"
                          selected={parseLocalDate(wo.permit_approved_date)}
                          onSelect={(date) => {
                            updateWorkOrder(wo.id, "permit_approved_date", date ? format(date, "yyyy-MM-dd") : "");
                            setOpenDatePopover(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </td>
                )}

                {isColumnVisible("days_init_today") && <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysFromInitial ?? "-"}</td>}
                {isColumnVisible("days_req_est") && <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysEstSent ?? "-"}</td>}
                {isColumnVisible("days_est_ord") && <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysEstToOrder ?? "-"}</td>}
                {isColumnVisible("days_ord_prm") && <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysOrderToPermit ?? "-"}</td>}
                {isColumnVisible("days_prm_app") && <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysPermitToApproved ?? "-"}</td>}
                {isColumnVisible("days_ord_ins") && <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysOrderToInstall ?? "-"}</td>}

                {isColumnVisible("quote_date") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "quote_date", "Quote Date", wo.quote_date)}
                  >
                    <Popover open={openDatePopover === `quote-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `quote-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.quote_date ? format(parseLocalDate(wo.quote_date), "MM/dd/yy") : "-"}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        {wo.quote_date && (
                          <div className="p-2 border-b">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => {
                                setClearDateConfirm({ woId: wo.id, field: 'quote_date' });
                                setOpenDatePopover(null);
                              }}
                            >
                              Clear Date
                            </Button>
                          </div>
                        )}
                        <Calendar
                          mode="single"
                          selected={parseLocalDate(wo.quote_date)}
                          onSelect={(date) => {
                            updateWorkOrder(wo.id, "quote_date", date ? format(date, "yyyy-MM-dd") : "");
                            setOpenDatePopover(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </td>
                )}

                {isColumnVisible("follow_up_date") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "follow_up_date", "Follow Up Date", wo.follow_up_date)}
                  >
                    <Popover open={openDatePopover === `followup-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `followup-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.follow_up_date ? format(parseLocalDate(wo.follow_up_date), "MM/dd/yy") : "-"}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        {wo.follow_up_date && (
                          <div className="p-2 border-b">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => {
                                setClearDateConfirm({ woId: wo.id, field: 'follow_up_date' });
                                setOpenDatePopover(null);
                              }}
                            >
                              Clear Date
                            </Button>
                          </div>
                        )}
                        <Calendar
                          mode="single"
                          selected={parseLocalDate(wo.follow_up_date)}
                          onSelect={(date) => {
                            updateWorkOrder(wo.id, "follow_up_date", date ? format(date, "yyyy-MM-dd") : "");
                            setOpenDatePopover(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </td>
                )}

                {isColumnVisible("close_date") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "close_date", "Close Date", wo.close_date)}
                  >
                    <Popover open={openDatePopover === `close-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `close-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.close_date ? format(parseLocalDate(wo.close_date), "MM/dd/yy") : "-"}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        {wo.close_date && (
                          <div className="p-2 border-b">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => {
                                setClearDateConfirm({ woId: wo.id, field: 'close_date' });
                                setOpenDatePopover(null);
                              }}
                            >
                              Clear Date
                            </Button>
                          </div>
                        )}
                        <Calendar
                          mode="single"
                          selected={parseLocalDate(wo.close_date)}
                          onSelect={(date) => {
                            updateWorkOrder(wo.id, "close_date", date ? format(date, "yyyy-MM-dd") : "");
                            setOpenDatePopover(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </td>
                )}

                {isColumnVisible("probability") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "probability", "Probability", wo.probability)}
                  >
                    <Input
                      type="number"
                      value={wo.probability || ""}
                      onChange={(e) => updateWorkOrder(wo.id, "probability", parseInt(e.target.value) || 0)}
                      className="h-7 text-xs border-0 bg-transparent px-1"
                      placeholder="0"
                      min="0"
                      max="100"
                      disabled={!isRegistered}
                    />
                  </td>
                )}

                {isColumnVisible("start_date") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "start_date", "Start Date", wo.start_date)}
                  >
                    <Popover open={openDatePopover === `start-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `start-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.start_date ? format(parseLocalDate(wo.start_date), "MM/dd/yy") : "-"}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        {wo.start_date && (
                          <div className="p-2 border-b">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => {
                                setClearDateConfirm({ woId: wo.id, field: 'start_date' });
                                setOpenDatePopover(null);
                              }}
                            >
                              Clear Date
                            </Button>
                          </div>
                        )}
                        <Calendar
                          mode="single"
                          selected={parseLocalDate(wo.start_date)}
                          onSelect={(date) => {
                            updateWorkOrder(wo.id, "start_date", date ? format(date, "yyyy-MM-dd") : "");
                            setOpenDatePopover(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </td>
                )}

                {isColumnVisible("project_type") && (
                  <td 
                    className="px-1 py-0.5 border-r"
                    onContextMenu={(e) => handleContextMenu(e, wo, "project_type", "Project Type", wo.project_type)}
                  >
                    <Select
                      value={wo.project_type || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "project_type", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        {projectTypes.map(type => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                )}

                <td className="px-1 py-0.5 text-center">
                  {isRegistered && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteWorkOrder(wo)}
                      className="h-6 w-6"
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  )}
                </td>
              </tr>
              {isFocused && <tr><td colSpan={100} className="h-3 bg-transparent border-none"></td></tr>}
              </React.Fragment>
              );
            })}
            {/* Bottom spacer for virtual scroll */}
            <tr style={{ height: `${rowVirtualizer.getTotalSize() - (rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1]?.end || 0)}px` }}>
              <td colSpan={100} />
            </tr>
          </tbody>
        </table>
      </div>

      {selectedWorkOrder && (
        <WorkOrderDetailsDialog
          isOpen={true}
          onClose={() => setSelectedWorkOrder(null)}
          workOrder={selectedWorkOrder}
          onUpdate={() => loadWorkOrders()}
        />
      )}

      {showForm && (
        <WorkOrderForm
          isOpen={showForm}
          onClose={() => setShowForm(false)}
          onSave={handleSaveNew}
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

      <Dialog open={editDialog.open} onOpenChange={(open) => !open && setEditDialog({ open: false, field: "", items: [], storageKey: "" })}>
        <DialogContent className={`clay-card border-none ${editDialog.storageKey === "salesTaskDescriptions" ? "max-w-4xl" : "max-w-md"} [&>button]:hidden`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-600" />
              Edit {editDialog.field === "lead_source" || editDialog.field === "lead_source2" ? "Lead Sources" : 
                    editDialog.field === "project_type" ? "Project Types" :
                    editDialog.field === "task_description" ? "Task Descriptions" : "Items"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={editInput}
                onChange={(e) => setEditInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addToList()}
                placeholder="Add new item..."
                className="flex-1"
              />
              <Button onClick={addToList} size="sm" className="clay-button">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {editDialog.storageKey === "salesTaskDescriptions" && (
              <>
                <p className="text-xs text-gray-500 mb-2">
                  Assign a page to show on workflow boards. Set color, opacity, and mark out to style rows with this task description.
                </p>
                {/* Header Row */}
                <div className="flex items-center gap-2 p-2 bg-gray-200 rounded font-medium text-xs text-gray-700 sticky top-0">
                  <div className="w-8"></div>
                  <span className="flex-1">Task Description</span>
                  <span className="w-32 text-center">Page</span>
                  <span className="w-20 text-center">Color</span>
                  <span className="w-20 text-center">Opacity</span>
                  <span className="w-10 text-center" title="Mark out row">Mark</span>
                  <span className="w-10 text-center" title="Show on Monday Morning Meeting">WIP</span>
                  <div className="w-6"></div>
                </div>
              </>
            )}
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {editDialog.items.map((item, idx) => {
                const isTaskDesc = editDialog.storageKey === "salesTaskDescriptions";
                const displayText = isTaskDesc ? (item.text || item) : item;
                const itemPage = isTaskDesc ? (item.page || "") : "";
                
                return (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveListItem(idx, 'up')}
                        disabled={idx === 0}
                        className="h-4 w-4 p-0"
                      >
                        <span className="text-xs">▲</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveListItem(idx, 'down')}
                        disabled={idx === editDialog.items.length - 1}
                        className="h-4 w-4 p-0"
                      >
                        <span className="text-xs">▼</span>
                      </Button>
                    </div>
                    {editingItem.index === idx ? (
                      <Input
                        value={editingItem.value}
                        onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                        onBlur={() => {
                          updateListItem(item, editingItem.value);
                          setEditingItem({ index: null, value: "" });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateListItem(item, editingItem.value);
                            setEditingItem({ index: null, value: "" });
                          }
                        }}
                        className="flex-1 h-7 text-sm"
                        autoFocus
                      />
                    ) : (
                      <span 
                        className="text-sm flex-1 cursor-pointer hover:text-blue-600"
                        onClick={() => setEditingItem({ index: idx, value: displayText })}
                      >
                        {displayText}
                      </span>
                    )}
                    {isTaskDesc && (
                      <>
                        <Select
                          value={itemPage || "none"}
                          onValueChange={(val) => updateTaskPage(item, val === "none" ? "" : val)}
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue placeholder="Page" />
                          </SelectTrigger>
                          <SelectContent>
                            {WORKFLOW_PAGES.map(page => (
                              <SelectItem key={page.value} value={page.value}>{page.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button 
                              className="h-7 w-20 text-xs border rounded px-2 flex items-center gap-1 hover:bg-gray-100"
                            >
                              {item.color ? (
                                <>
                                  <div className="w-3 h-3 rounded border" style={{ backgroundColor: item.color }} />
                                  <span className="truncate text-[10px]">{TASK_COLORS.find(c => c.value === item.color)?.label || "Custom"}</span>
                                </>
                              ) : (
                                <span className="text-gray-500">Color</span>
                              )}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-2" align="start">
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-gray-600 mb-1">Preset Colors</div>
                              <div className="grid grid-cols-4 gap-1">
                                {TASK_COLORS.map(c => (
                                  <button
                                    key={c.value}
                                    onClick={() => updateTaskStyle(item, "color", c.value === "none" ? "" : c.value)}
                                    className={`w-8 h-8 rounded border-2 flex items-center justify-center transition-all ${
                                      (item.color || "") === (c.value === "none" ? "" : c.value) 
                                        ? "border-blue-500 ring-2 ring-blue-200" 
                                        : "border-gray-200 hover:border-gray-400"
                                    }`}
                                    style={{ backgroundColor: c.value === "none" ? "#ffffff" : c.value }}
                                    title={c.label}
                                  >
                                    {c.value === "none" && <span className="text-xs text-gray-400">✕</span>}
                                  </button>
                                ))}
                              </div>
                              <div className="border-t pt-2 mt-2">
                                <div className="text-xs font-medium text-gray-600 mb-1">Custom Color</div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={item.color || "#ffffff"}
                                    onChange={(e) => updateTaskStyle(item, "color", e.target.value)}
                                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                                  />
                                  <Input
                                    value={item.color || ""}
                                    onChange={(e) => updateTaskStyle(item, "color", e.target.value)}
                                    placeholder="#hex"
                                    className="h-7 text-xs flex-1"
                                  />
                                </div>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">{item.opacity ?? 100}%</span>
                          <input
                            type="range"
                            min="20"
                            max="100"
                            step="10"
                            value={item.opacity ?? 100}
                            onChange={(e) => updateTaskStyle(item, "opacity", parseInt(e.target.value))}
                            className="w-16 h-4"
                          />
                        </div>
                        <label className="flex items-center justify-center w-10 cursor-pointer" title="Mark out entire row">
                          <Checkbox
                            checked={item.markOut ?? false}
                            onCheckedChange={(checked) => updateTaskStyle(item, "markOut", checked)}
                            className="h-4 w-4"
                          />
                        </label>
                        <label className="flex items-center justify-center w-10 cursor-pointer" title="Show on Monday Morning Meeting">
                          <Checkbox
                            checked={item.wip ?? false}
                            onCheckedChange={(checked) => updateTaskStyle(item, "wip", checked)}
                            className="h-4 w-4"
                          />
                        </label>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFromList(item)}
                      className="h-6 w-6"
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                );
              })}
            </div>
            <Button onClick={() => setEditDialog({ open: false, field: "", items: [], storageKey: "" })} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              Save & Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear Date Confirmation Dialog */}
      <AlertDialog open={!!clearDateConfirm} onOpenChange={() => setClearDateConfirm(null)}>
        <AlertDialogContent className="clay-card border-none max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Date?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear this date?
              <br /><br />
              <span className="font-medium text-orange-600">Note:</span> Email automations may be resent if this field is filled out again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={async () => {
                if (clearDateConfirm) {
                  updateWorkOrder(clearDateConfirm.woId, clearDateConfirm.field, "");
                }
                setClearDateConfirm(null);
              }}
              className="bg-red-600 text-white"
            >
              Clear Date
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Context Menu */}
      {contextMenu && (
        <CellContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          entityType="WorkOrder"
          entityId={contextMenu.workOrder.id}
          fieldName={contextMenu.fieldName}
          fieldLabel={contextMenu.fieldLabel}
          currentValue={contextMenu.currentValue}
          onClear={() => clearCell(contextMenu.workOrder.id, contextMenu.fieldName)}
          isRegistered={isRegistered}
        />
      )}

      {/* Header Context Menu */}
      {headerContextMenu && (
        <ColumnHeaderContextMenu
          position={{ x: headerContextMenu.x, y: headerContextMenu.y }}
          onClose={() => setHeaderContextMenu(null)}
          fieldName={headerContextMenu.fieldName}
          fieldLabel={headerContextMenu.fieldLabel}
          onSort={(key, dir) => handleColumnSort(key, dir)}
          onCustomSort={handleCustomSort}
          onClearSort={clearSort}
          currentSortKey={sortConfig.key}
          currentSortDirection={sortConfig.direction}
          allValues={workOrders}
          isAdmin={currentUser?.role === 'admin'}
          onAction={handleHeaderContextMenuAction}
        />
      )}

      {/* Due Date Gradient Settings Dialog */}
      <Dialog open={showGradientDialog} onOpenChange={setShowGradientDialog}>
        <DialogContent className="clay-card border-none max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-blue-600" />
              Due Date Gradient Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Enable Gradient</label>
              <Checkbox
                checked={deadlineGradientSettings.enabled}
                onCheckedChange={(checked) => saveGradientSettings({ ...deadlineGradientSettings, enabled: checked })}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium block mb-2">Base Color (Far from deadline)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={deadlineGradientSettings.baseColor}
                  onChange={(e) => saveGradientSettings({ ...deadlineGradientSettings, baseColor: e.target.value })}
                  className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                />
                <Input
                  value={deadlineGradientSettings.baseColor}
                  onChange={(e) => saveGradientSettings({ ...deadlineGradientSettings, baseColor: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium block mb-2">Due Date Color (At/past deadline)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={deadlineGradientSettings.dueColor}
                  onChange={(e) => saveGradientSettings({ ...deadlineGradientSettings, dueColor: e.target.value })}
                  className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                />
                <Input
                  value={deadlineGradientSettings.dueColor}
                  onChange={(e) => saveGradientSettings({ ...deadlineGradientSettings, dueColor: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium block mb-2">Gradient Start (days before deadline)</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="60"
                  value={deadlineGradientSettings.gradientDays}
                  onChange={(e) => saveGradientSettings({ ...deadlineGradientSettings, gradientDays: parseInt(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-sm font-medium w-16 text-center">{deadlineGradientSettings.gradientDays} days</span>
              </div>
            </div>
            
            <div className="border-t pt-4">
              <label className="text-sm font-medium block mb-2">Preview</label>
              <div className="flex h-8 rounded overflow-hidden border">
                {[...Array(10)].map((_, i) => {
                  const ratio = i / 9;
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
                  return (
                    <div 
                      key={i} 
                      className="flex-1"
                      style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Due date</span>
                <span>{deadlineGradientSettings.gradientDays}+ days away</span>
              </div>
            </div>
            
            <Button onClick={() => setShowGradientDialog(false)} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              Save & Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.title || deleteConfirm?.client_name}"?
              <br /><br />
              <span className="font-medium text-orange-600">Note:</span> This action moves the item to the Project Trash. Only admins can permanently delete or recover items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

export default SalesPipelineSpreadsheet;