import React, { useState, useEffect, useRef } from "react";
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
import { Plus, Trash2, Calendar as CalendarIcon, ArrowRight, Loader2, Download, Upload, Pencil, ExternalLink, Link as LinkIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import WorkOrderForm from "@/components/workflow/WorkOrderForm";
import * as XLSX from "xlsx";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

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
  const [importProgress, setImportProgress] = useState({ show: false, current: 0, total: 0 });
  const [exportProgress, setExportProgress] = useState({ show: false, progress: 0 });
  const [showForm, setShowForm] = useState(false);
  const [clearDateConfirm, setClearDateConfirm] = useState(null);

  const [leadSources, setLeadSources] = useState(() => {
    const saved = localStorage.getItem('salesLeadSources');
    return saved ? JSON.parse(saved) : ["Walk-in", "Phone", "Email", "Referral", "Website"];
  });
  const [projectTypes, setProjectTypes] = useState(() => {
    const saved = localStorage.getItem('salesProjectTypes');
    return saved ? JSON.parse(saved) : ["Signage", "Wraps", "Decals", "Banners", "Other"];
  });
  const [taskDescriptions, setTaskDescriptions] = useState(() => {
    const saved = localStorage.getItem('salesTaskDescriptions');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migration: convert old string format to new object format
      if (parsed.length > 0 && typeof parsed[0] === 'string') {
        return parsed.map(text => ({ text, page: "" }));
      }
      return parsed;
    }
    return [
      { text: "Prospect Initiation (Gather Info, Initial Discuss ...)", page: "" },
      { text: "Conduct Site Survey", page: "" },
      { text: "Research Sign Code for Mock-up", page: "" },
      { text: "Follow up with Customer - Pre-Estimating", page: "" },
      { text: "Mock up and Send to Customer", page: "" },
      { text: "Mock up Only", page: "" },
      { text: "Send Mock up to Customer", page: "" },
      { text: "Quoting - 3rd Party", page: "" },
      { text: "Complete Estimate for Review", page: "Estimating" },
      { text: "Estimate - To Be Reviewed", page: "Estimating" },
      { text: "Review Complete - Send to Customer", page: "" },
      { text: "Follow up with Customer - Post-Estimate", page: "" },
      { text: "On Hold - Follow Up with Customer", page: "" },
      { text: "Waiting on Deposit", page: "" },
      { text: "WIP - Waiting for Deposit", page: "" },
      { text: "WIP - In Final Design Queue", page: "Design" },
      { text: "WIP - Designing", page: "Design" },
      { text: "WIP - Prepare/Submit Permit", page: "Permitting" },
      { text: "WIP - Follow Up On Status of Accepted Permit", page: "Permitting" },
      { text: "WIP - Permitting Follow-ups", page: "Permitting" },
      { text: "WIP - Production/Fabrication", page: "Production" },
      { text: "WIP - Outsourced Fabrication", page: "Fabrication" },
      { text: "WIP - Maintenance/Service Call", page: "" },
      { text: "WIP - Installation", page: "Installation" },
      { text: "WIP - Outsourced Installation", page: "Installation" },
      { text: "WIP - Follow Up with Customer", page: "" },
      { text: "WIP - Inspections", page: "" },
      { text: "Completed Sale - Electrical Inspection", page: "CompletedJobs" },
      { text: "Completed Sale - Sign Inspection", page: "CompletedJobs" },
      { text: "Completed Sales - Post Invoice Tasks", page: "CompletedJobs" },
      { text: "Completed Sale", page: "CompletedJobs" },
      { text: "Lost", page: "" },
      { text: "Lost - We took too long", page: "" },
      { text: "Closed - Attempted Follow-up/No Response", page: "" },
      { text: "Closed - Did not Lose", page: "" }
    ];
  });

  const WORKFLOW_PAGES = [
    { value: "", label: "None" },
    { value: "Estimating", label: "Estimating" },
    { value: "Permitting", label: "Permitting" },
    { value: "Design", label: "Design" },
    { value: "Production", label: "Production" },
    { value: "Fabrication", label: "Fabrication" },
    { value: "Installation", label: "Installation/Delivery" },
    { value: "CompletedJobs", label: "Completed Jobs" }
  ];
  const [corbridgeDialog, setCorbridgeDialog] = useState({ open: false, workOrder: null });

  useEffect(() => {
    loadWorkOrders();
  }, []);

  const loadWorkOrders = async () => {
    setIsLoading(true);
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

  const updateWorkOrder = (orderId, field, value) => {
    setWorkOrders(prev => prev.map(wo => wo.id === orderId ? { ...wo, [field]: value } : wo));
    
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
      newItems = [...editDialog.items, { text: editInput.trim(), page: "" }];
    } else {
      newItems = [...editDialog.items, editInput.trim()];
    }
    if (editDialog.storageKey === "salesLeadSources") {
      setLeadSources(newItems);
    } else if (editDialog.storageKey === "salesProjectTypes") {
      setProjectTypes(newItems);
    } else if (editDialog.storageKey === "salesTaskDescriptions") {
      setTaskDescriptions(newItems);
    }
    localStorage.setItem(editDialog.storageKey, JSON.stringify(newItems));
    setEditDialog({ ...editDialog, items: newItems });
    setEditInput("");
  };

  const removeFromList = (item) => {
    const newItems = editDialog.storageKey === "salesTaskDescriptions"
      ? editDialog.items.filter(i => i.text !== item.text)
      : editDialog.items.filter(i => i !== item);
    if (editDialog.storageKey === "salesLeadSources") {
      setLeadSources(newItems);
    } else if (editDialog.storageKey === "salesProjectTypes") {
      setProjectTypes(newItems);
    } else if (editDialog.storageKey === "salesTaskDescriptions") {
      setTaskDescriptions(newItems);
    }
    localStorage.setItem(editDialog.storageKey, JSON.stringify(newItems));
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
      localStorage.setItem(editDialog.storageKey, JSON.stringify(newItems));
      setEditDialog({ ...editDialog, items: newItems });
    } else {
      if (!newItem.trim()) return;
      const newItems = editDialog.items.map(i => i === oldItem ? newItem.trim() : i);
      if (editDialog.storageKey === "salesLeadSources") {
        setLeadSources(newItems);
      } else if (editDialog.storageKey === "salesProjectTypes") {
        setProjectTypes(newItems);
      }
      localStorage.setItem(editDialog.storageKey, JSON.stringify(newItems));
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
    localStorage.setItem("salesTaskDescriptions", JSON.stringify(newItems));
    setEditDialog({ ...editDialog, items: newItems });
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
    } else if (editDialog.storageKey === "salesProjectTypes") {
      setProjectTypes(newItems);
    } else if (editDialog.storageKey === "salesTaskDescriptions") {
      setTaskDescriptions(newItems);
    }
    localStorage.setItem(editDialog.storageKey, JSON.stringify(newItems));
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
    await WorkOrder.update(corbridgeDialog.workOrder.id, {
      corbridge_invoice_number: invoiceNumber,
      corbridge_link: link
    });
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

    const reader = new FileReader();
    reader.onload = async (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      setImportProgress({ show: true, current: 0, total: jsonData.length });

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        // Parse notes into individual entries by date
        const notesText = row["Notes"] || "";
        const parsedNotes = [];
        
        if (notesText) {
          // Split by date pattern (MM/DD/YYYY or M/D/YYYY)
          const datePattern = /(\d{1,2}\/\d{1,2}\/\d{4})/g;
          const parts = notesText.split(datePattern);
          
          let currentNote = "";
          let currentDate = null;
          
          for (let j = 0; j < parts.length; j++) {
            const part = parts[j].trim();
            if (!part) continue;
            
            // Check if this part is a date
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(part)) {
              // Save previous note if exists
              if (currentNote && currentDate) {
                parsedNotes.push({
                  text: currentNote.trim(),
                  timestamp: currentDate,
                  created_by: "Import",
                  completed: false,
                  sub_tasks: []
                });
              }
              // Convert MM/DD/YYYY to ISO date
              const [month, day, year] = part.split('/').map(Number);
              currentDate = new Date(year, month - 1, day).toISOString();
              currentNote = "";
            } else {
              // Add text to current note
              currentNote += (currentNote ? " " : "") + part;
            }
          }
          
          // Save last note
          if (currentNote && currentDate) {
            parsedNotes.push({
              text: currentNote.trim(),
              timestamp: currentDate,
              created_by: "Import",
              completed: false,
              sub_tasks: []
            });
          }
        }
        
        await WorkOrder.create({
          title: row["Notes"] || row["Customer"] || "",
          client_name: row["Customer"] || "",
          lead_source: row["Source"] || "",
          current_task_deadline: row["Current Task Deadline"] || "",
          current_task_assigned_to: row["Current Task Assigned to"] || "",
          designer: row["Designer"] || "",
          project_manager: row["Project Manager"] || "",
          estimator: row["Estimator"] || "",
          est_inv_at: row["Est/Inv @"] || "",
          estimate_amount: parseFloat(row["Estimate Amount"]) || 0,
          current_task_description: row["Current Task Description"] || "",
          date_initial_contact: row["Date Est. Requested/Initial Contact"] || "",
          site_survey_date: row["Site Survey"] || "",
          date_estimate_sent: row["Date Estimate Sent to Customer"] || "",
          date_order_created: row["Date Order Created"] || "",
          project_install_date: row["Project Install Date"] || "",
          permit_submitted_date: row["Permit Submitted"] || "",
          permit_receipt_confirmed_date: row["Date Permit Receipt Confirmed"] || "",
          permit_number: row["Permit Number"] || "",
          permit_approved_date: row["Date Permit Approved/Received"] || "",
          in_pipeline: false,
          notes: parsedNotes
        });
        setImportProgress({ show: true, current: i + 1, total: jsonData.length });
      }

      await loadWorkOrders();
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

  const filteredWorkOrders = workOrders.filter(wo => {
    if (filterStatus !== "all" && !filterStatus.startsWith("custom_")) {
      if (wo.sales_status !== filterStatus) return false;
    }
    
    if (filterStatus.startsWith("custom_")) {
      const filterId = filterStatus.replace("custom_", "");
      const customFilter = customFilters.find(f => f.id === filterId);
      if (customFilter && !applyCustomFilter(wo, customFilter.conditions)) {
        return false;
      }
    }
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const searchable = [wo.title, wo.client_name, wo.contact_name, wo.sales_rep].filter(Boolean).join(' ').toLowerCase();
      if (!searchable.includes(search)) return false;
    }
    
    return true;
  });

  const isColumnVisible = (columnId) => {
    if (!activeColumnPreset?.column_settings) return true;
    const setting = activeColumnPreset.column_settings.find(c => c.id === columnId);
    return setting?.visible !== false;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="overflow-visible">
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
              <span className="text-sm font-medium">Importing...</span>
              <span className="text-xs text-gray-500">{importProgress.current} / {importProgress.total}</span>
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

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border rounded-lg" style={{ fontSize: '10px', tableLayout: 'auto' }}>
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr className="border-b">
              {isColumnVisible("client_name") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '100px' }}>Customer</th>}
              {isColumnVisible("lead_source") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '80px' }}>
                <div className="flex items-center gap-1">
                  Source
                  {isRegistered && <Pencil className="w-2.5 h-2.5 cursor-pointer text-blue-500" onClick={() => openEditDialog("lead_source", leadSources, "salesLeadSources")} />}
                </div>
              </th>}
              {isColumnVisible("current_task_deadline") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Deadline</th>}
              {isColumnVisible("current_task_assigned_to") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '90px' }}>Task Assigned</th>}
              {isColumnVisible("designer") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '80px' }}>Designer</th>}
              {isColumnVisible("project_manager") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>PM</th>}
              {isColumnVisible("estimator") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '80px' }}>Estimator</th>}
              {isColumnVisible("est_inv_at") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '90px' }}>Estimate/Invoice # Link</th>}
              {isColumnVisible("estimate_amount") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '100px' }}>Amount</th>}
              {isColumnVisible("current_task_description") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '120px' }}>
                <div className="flex items-center gap-1">
                  Task Description
                  {isRegistered && <Pencil className="w-2.5 h-2.5 cursor-pointer text-blue-500" onClick={() => openEditDialog("task_description", taskDescriptions, "salesTaskDescriptions")} />}
                </div>
              </th>}
              {isColumnVisible("date_initial_contact") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Initial</th>}
              {isColumnVisible("site_survey_date") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Survey</th>}
              {isColumnVisible("date_estimate_sent") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Est Sent</th>}
              {isColumnVisible("date_order_created") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Order</th>}
              {isColumnVisible("project_install_date") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Install</th>}
              {isColumnVisible("permit_submitted_date") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Permit Sub</th>}
              {isColumnVisible("title") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '90px' }}>Notes</th>}
              {isColumnVisible("permit_receipt_confirmed_date") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Permit Conf</th>}
              {isColumnVisible("permit_number") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '60px' }}>Permit #</th>}
              {isColumnVisible("permit_approved_date") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Permit App</th>}
              {isColumnVisible("days_init_today") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 bg-yellow-50 text-xs" style={{ minWidth: '80px' }} title="Days from Initial Request to Today's Date">Days Init→Today</th>}
              {isColumnVisible("days_req_est") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 bg-yellow-50 text-xs" style={{ minWidth: '80px' }} title="Days from Date Requested to Estimate Sent">Days Req→Est</th>}
              {isColumnVisible("days_est_ord") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 bg-yellow-50 text-xs" style={{ minWidth: '80px' }} title="Days from Estimate Sent to Date Order Created">Days Est→Ord</th>}
              {isColumnVisible("days_ord_prm") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 bg-yellow-50 text-xs" style={{ minWidth: '80px' }} title="Days from Order Created to Permit Submitted">Days Ord→Prm</th>}
              {isColumnVisible("days_prm_app") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 bg-yellow-50 text-xs" style={{ minWidth: '80px' }} title="Days from Permit Submitted to Permit Approved">Days Prm→App</th>}
              {isColumnVisible("days_ord_ins") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 bg-yellow-50 text-xs" style={{ minWidth: '80px' }} title="Days from Order Created to Project Install Date">Days Ord→Ins</th>}
              {isColumnVisible("quote_date") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Quote</th>}
              {isColumnVisible("follow_up_date") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Follow Up</th>}
              {isColumnVisible("close_date") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Close</th>}
              {isColumnVisible("probability") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '50px' }}>Prob</th>}
              {isColumnVisible("start_date") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Start</th>}
              {isColumnVisible("project_type") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '80px' }}>
                <div className="flex items-center gap-1">
                  Project Type
                  {isRegistered && <Pencil className="w-2.5 h-2.5 cursor-pointer text-blue-500" onClick={() => openEditDialog("project_type", projectTypes, "salesProjectTypes")} />}
                </div>
              </th>}
              <th className="px-1 py-1 text-left font-medium text-gray-700 text-xs" style={{ minWidth: '40px' }}>Act</th>
            </tr>
          </thead>

          <tbody>
            {filteredWorkOrders.map((wo) => {
              const daysFromInitial = calculateDays(wo.date_initial_contact);
              const daysEstSent = calculateDays(wo.date_initial_contact, wo.date_estimate_sent);
              const daysEstToOrder = calculateDays(wo.date_estimate_sent, wo.date_order_created);
              const daysOrderToPermit = calculateDays(wo.date_order_created, wo.permit_submitted_date);
              const daysPermitToApproved = calculateDays(wo.permit_submitted_date, wo.permit_approved_date);
              const daysOrderToInstall = calculateDays(wo.date_order_created, wo.project_install_date);

              return (
              <tr key={wo.id} className="border-b hover:bg-gray-50">
                {isColumnVisible("client_name") && (
                  <td className="px-1 py-0.5 border-r">
                    <button
                      onClick={() => setSelectedWorkOrder(wo)}
                      className="h-6 w-full text-xs text-left px-1 hover:bg-blue-50 rounded flex items-center gap-1 text-blue-600"
                    >
                      <LinkIcon className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{wo.client_name || "Unnamed"}</span>
                    </button>
                  </td>
                )}

                {isColumnVisible("lead_source") && (
                  <td className="px-1 py-0.5 border-r">
                    <Select
                      value={wo.lead_source || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "lead_source", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 px-1">
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
                  <td className="px-1 py-0.5 border-r">
                    <Popover open={openDatePopover === `deadline-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `deadline-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.current_task_deadline ? format(parseLocalDate(wo.current_task_deadline), "M/d/yy") : "-"}
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
                  <td className="px-1 py-0.5 border-r">
                    <Select
                      value={wo.current_task_assigned_to || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "current_task_assigned_to", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 px-1">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.filter(u => u.sales_roles?.includes("Task Assigned")).map(u => (
                          <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                )}

                {isColumnVisible("designer") && (
                  <td className="px-1 py-0.5 border-r">
                    <Select
                      value={wo.designer || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "designer", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 px-1">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.filter(u => u.sales_roles?.includes("Designer")).map(u => (
                          <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                )}

                {isColumnVisible("project_manager") && (
                  <td className="px-1 py-0.5 border-r">
                    <Select
                      value={wo.project_manager || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "project_manager", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 px-1">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.filter(u => u.sales_roles?.includes("PM")).map(u => (
                          <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                )}

                {isColumnVisible("estimator") && (
                  <td className="px-1 py-0.5 border-r">
                    <Select
                      value={wo.estimator || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "estimator", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 px-1">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.filter(u => u.sales_roles?.includes("Estimator")).map(u => (
                          <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                )}

                {isColumnVisible("est_inv_at") && (
                  <td className="px-1 py-0.5 border-r">
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
                        <span className="text-xs truncate flex-1">{wo.corbridge_invoice_number || wo.est_inv_at || "-"}</span>
                      )}
                      {isRegistered && (
                        <button
                          onClick={() => openCorbridgeDialog(wo)}
                          className="flex-shrink-0"
                        >
                          <Pencil className="w-2.5 h-2.5 text-gray-400 hover:text-blue-600" />
                        </button>
                      )}
                    </div>
                  </td>
                )}

                {isColumnVisible("estimate_amount") && (
                  <td className="px-1 py-0.5 border-r">
                    <div className="relative flex items-center">
                      <span className="absolute left-1 text-xs text-gray-500">$</span>
                      <Input
                        type="number"
                        value={wo.estimate_amount || ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          updateWorkOrder(wo.id, "estimate_amount", parseFloat(val) || 0);
                        }}
                        className="h-6 text-xs border-0 bg-transparent pl-3 pr-1"
                        placeholder="0"
                        disabled={!isRegistered}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </td>
                )}

                {isColumnVisible("current_task_description") && (
                  <td className="px-1 py-0.5 border-r">
                    <Select
                      value={wo.current_task_description || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "current_task_description", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 px-1">
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
                  <td className="px-1 py-0.5 border-r">
                    <Popover open={openDatePopover === `initial-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `initial-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.date_initial_contact ? format(parseLocalDate(wo.date_initial_contact), "M/d/yy") : "-"}
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
                  <td className="px-1 py-0.5 border-r">
                    <Popover open={openDatePopover === `survey-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `survey-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.site_survey_date ? format(parseLocalDate(wo.site_survey_date), "M/d/yy") : "-"}
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
                  <td className="px-1 py-0.5 border-r">
                    <Popover open={openDatePopover === `estsent-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `estsent-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.date_estimate_sent ? format(parseLocalDate(wo.date_estimate_sent), "M/d/yy") : "-"}
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
                  <td className="px-1 py-0.5 border-r">
                    <Popover open={openDatePopover === `ordercreated-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `ordercreated-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.date_order_created ? format(parseLocalDate(wo.date_order_created), "M/d/yy") : "-"}
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
                  <td className="px-1 py-0.5 border-r">
                    <Popover open={openDatePopover === `install-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `install-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.project_install_date ? format(parseLocalDate(wo.project_install_date), "M/d/yy") : "-"}
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
                  <td className="px-1 py-0.5 border-r">
                    <Popover open={openDatePopover === `permitsub-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `permitsub-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.permit_submitted_date ? format(parseLocalDate(wo.permit_submitted_date), "M/d/yy") : "-"}
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

                {isColumnVisible("title") && (
                  <td className="px-1 py-0.5 border-r">
                    <button
                      onClick={() => setSelectedWorkOrder(wo)}
                      className="h-7 w-full text-xs text-left px-1 hover:bg-blue-50 rounded truncate text-blue-600"
                    >
                      {wo.title || "View Details"}
                    </button>
                  </td>
                )}

                {isColumnVisible("permit_receipt_confirmed_date") && (
                  <td className="px-1 py-0.5 border-r">
                    <Popover open={openDatePopover === `permitconf-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `permitconf-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.permit_receipt_confirmed_date ? format(parseLocalDate(wo.permit_receipt_confirmed_date), "M/d/yy") : "-"}
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
                  <td className="px-1 py-0.5 border-r">
                    <Input
                      value={wo.permit_number || ""}
                      onChange={(e) => updateWorkOrder(wo.id, "permit_number", e.target.value)}
                      className="h-6 text-xs border-0 bg-transparent px-1"
                      placeholder="-"
                      disabled={!isRegistered}
                    />
                  </td>
                )}

                {isColumnVisible("permit_approved_date") && (
                  <td className="px-1 py-0.5 border-r">
                    <Popover open={openDatePopover === `permitappr-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `permitappr-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.permit_approved_date ? format(parseLocalDate(wo.permit_approved_date), "M/d/yy") : "-"}
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
                  <td className="px-1 py-0.5 border-r">
                    <Popover open={openDatePopover === `quote-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `quote-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.quote_date ? format(parseLocalDate(wo.quote_date), "M/d/yy") : "-"}
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
                  <td className="px-1 py-0.5 border-r">
                    <Popover open={openDatePopover === `followup-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `followup-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.follow_up_date ? format(parseLocalDate(wo.follow_up_date), "M/d/yy") : "-"}
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
                  <td className="px-1 py-0.5 border-r">
                    <Popover open={openDatePopover === `close-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `close-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.close_date ? format(parseLocalDate(wo.close_date), "M/d/yy") : "-"}
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
                  <td className="px-1 py-0.5 border-r">
                    <Input
                      type="number"
                      value={wo.probability || ""}
                      onChange={(e) => updateWorkOrder(wo.id, "probability", parseInt(e.target.value) || 0)}
                      className="h-6 text-xs border-0 bg-transparent px-1"
                      placeholder="0"
                      min="0"
                      max="100"
                      disabled={!isRegistered}
                    />
                  </td>
                )}

                {isColumnVisible("start_date") && (
                  <td className="px-1 py-0.5 border-r">
                    <Popover open={openDatePopover === `start-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `start-${wo.id}` : null)}>
                      <PopoverTrigger asChild disabled={!isRegistered}>
                        <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                          {wo.start_date ? format(parseLocalDate(wo.start_date), "M/d/yy") : "-"}
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
                  <td className="px-1 py-0.5 border-r">
                    <Select
                      value={wo.project_type || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "project_type", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 px-1">
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

                <td className="px-1 py-0.5">
                  <div className="flex gap-1">
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
                  </div>
                </td>
              </tr>
              );
            })}
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
            <DialogTitle>Corbridge Invoice/Estimate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Invoice/Estimate Number <span className="text-red-500">*</span></label>
              <Input
                defaultValue={corbridgeDialog.workOrder?.corbridge_invoice_number || ""}
                onChange={(e) => corbridgeDialog.workOrder && (corbridgeDialog.workOrder.corbridge_invoice_number = e.target.value)}
                placeholder="Enter number..."
                className="w-full"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Corbridge Link <span className="text-red-500">*</span></label>
              <Input
                defaultValue={corbridgeDialog.workOrder?.corbridge_link || ""}
                onChange={(e) => corbridgeDialog.workOrder && (corbridgeDialog.workOrder.corbridge_link = e.target.value)}
                placeholder="Paste the Invoice or Estimate URL here..."
                className="w-full"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Copy the URL from Corbridge and paste it here</p>
            </div>
            <Button
              onClick={() => {
                if (corbridgeDialog.workOrder) {
                  const invoiceNum = corbridgeDialog.workOrder.corbridge_invoice_number?.trim();
                  const link = corbridgeDialog.workOrder.corbridge_link?.trim();
                  if (!invoiceNum || !link) {
                    alert("Both Invoice/Estimate Number and Corbridge Link are required");
                    return;
                  }
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
        <DialogContent className={`clay-card border-none ${editDialog.storageKey === "salesTaskDescriptions" ? "max-w-2xl" : "max-w-md"}`}>
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
              <p className="text-xs text-gray-500">
                Assign a page to show a notification bubble when this task is selected.
              </p>
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
                      <Select
                        value={itemPage}
                        onValueChange={(val) => updateTaskPage(item, val)}
                      >
                        <SelectTrigger className="h-7 w-40 text-xs">
                          <SelectValue placeholder="Select page" />
                        </SelectTrigger>
                        <SelectContent>
                          {WORKFLOW_PAGES.map(page => (
                            <SelectItem key={page.value} value={page.value}>{page.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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