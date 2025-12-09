import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, differenceInDays } from "date-fns";
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

const SalesPipelineSpreadsheet = React.forwardRef(({ searchTerm = "", filterStatus = "all", showButtonsInline = true }, ref) => {
  const { currentUser, isRegistered } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const fileInputRef = useRef(null);
  const [editDialog, setEditDialog] = useState({ open: false, field: "", items: [] });
  const [editInput, setEditInput] = useState("");
  const [pendingChanges, setPendingChanges] = useState({});
  const debounceTimers = useRef({});
  const [importProgress, setImportProgress] = useState({ show: false, current: 0, total: 0 });
  const [exportProgress, setExportProgress] = useState({ show: false, progress: 0 });
  const [showForm, setShowForm] = useState(false);

  // Predefined list management
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
    return saved ? JSON.parse(saved) : [
      "Waiting on site visit",
      "Waiting on survey",
      "Waiting on client to approve estimate",
      "Waiting on permit approval",
      "Waiting on materials",
      "In progress"
    ];
  });
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

  // Calculate days between dates
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
    // Update UI immediately
    setWorkOrders(prev => prev.map(wo => wo.id === orderId ? { ...wo, [field]: value } : wo));
    
    // Track pending change
    setPendingChanges(prev => ({
      ...prev,
      [orderId]: { ...prev[orderId], [field]: value }
    }));

    // Clear existing timer for this order
    if (debounceTimers.current[orderId]) {
      clearTimeout(debounceTimers.current[orderId]);
    }

    // Set new timer to save after 1 second of inactivity
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
        // Silently ignore errors for deleted work orders
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
    
    // Clear any pending timers and changes for this work order
    if (debounceTimers.current[orderId]) {
      clearTimeout(debounceTimers.current[orderId]);
      delete debounceTimers.current[orderId];
    }
    setPendingChanges(prev => {
      const updated = { ...prev };
      delete updated[orderId];
      return updated;
    });
    
    // Soft delete
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
    const newItems = [...editDialog.items, editInput.trim()];
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
    const newItems = editDialog.items.filter(i => i !== item);
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
      
      return {
        "Customer": wo.client_name || "",
        "Source": wo.lead_source || "",
        "Current Task Deadline": wo.current_task_deadline || "",
        "Current Task Assigned to": wo.current_task_assigned_to || "",
        "Designer": wo.designer || "",
        "Project Manager": wo.project_manager || "",
        "Estimator": wo.estimator || "",
        "Est/Inv @": wo.est_inv_at || "",
        "Estimate Amount": wo.estimate_amount || "",
        "Current Task Description": wo.current_task_description || "",
        "Date Est. Requested/Initial Contact": wo.date_initial_contact || "",
        "Site Survey": wo.site_survey_date || "",
        "Date Estimate Sent to Customer": wo.date_estimate_sent || "",
        "Date Order Created": wo.date_order_created || "",
        "Project Install Date": wo.project_install_date || "",
        "Permit Submitted": wo.permit_submitted_date || "",
        "Notes": wo.title || "",
        "Date Permit Receipt Confirmed": wo.permit_receipt_confirmed_date || "",
        "Permit Number": wo.permit_number || "",
        "Date Permit Approved/Received": wo.permit_approved_date || "",
        "Days from Initial Request to today": daysFromInitial ?? "",
        "Days Est. Sent from Date Requested": daysEstSent ?? "",
        "Days from Est. Sent to Date Order Created": daysEstToOrder ?? "",
        "Days from Order Created to Permit Submitted": daysOrderToPermit ?? "",
        "Days from Permit Submitted to Permit Approved": daysPermitToApproved ?? "",
        "Days from Project Install Date from Order Created": daysOrderToInstall ?? ""
      };
    });

    await new Promise(resolve => setTimeout(resolve, 300));
    setExportProgress({ show: true, progress: 50 });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Pipeline");
    XLSX.writeFile(wb, `sales_pipeline_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    
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
          in_pipeline: false
        });
        setImportProgress({ show: true, current: i + 1, total: jsonData.length });
      }

      await loadWorkOrders();
      setTimeout(() => setImportProgress({ show: false, current: 0, total: 0 }), 1500);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  React.useImperativeHandle(ref, () => ({
    addNewRow,
    exportToExcel,
    importFromExcel: () => fileInputRef.current?.click()
  }));

  const filteredWorkOrders = workOrders.filter(wo => {
    if (filterStatus !== "all" && wo.sales_status !== filterStatus) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const searchable = [wo.title, wo.client_name, wo.contact_name, wo.sales_rep].filter(Boolean).join(' ').toLowerCase();
      if (!searchable.includes(search)) return false;
    }
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="overflow-visible">
      {showButtonsInline && (
        <div className="flex items-center justify-between mb-2 px-2">
          <div className="flex gap-2">
            {isRegistered && (
              <>
                <Button onClick={addNewRow} size="sm" className="clay-button border-none text-gray-700 h-8"
                  style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}>
                  <Plus className="w-4 h-4 mr-1" />
                  New Lead
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={importFromExcel}
                  className="hidden"
                  disabled={importProgress.show}
                />
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

      {/* Import/Export Progress */}
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
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '100px' }}>Customer</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '80px' }}>
                <div className="flex items-center gap-1">
                  Source
                  {isRegistered && <Pencil className="w-2.5 h-2.5 cursor-pointer text-blue-500" onClick={() => openEditDialog("lead_source", leadSources, "salesLeadSources")} />}
                </div>
              </th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Deadline</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '90px' }}>Task Assigned</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '80px' }}>Designer</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>PM</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '80px' }}>Estimator</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Est/Inv</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Amount</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '120px' }}>
                <div className="flex items-center gap-1">
                  Task Desc
                  {isRegistered && <Pencil className="w-2.5 h-2.5 cursor-pointer text-blue-500" onClick={() => openEditDialog("task_description", taskDescriptions, "salesTaskDescriptions")} />}
                </div>
              </th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Initial</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Survey</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Est Sent</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Order</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Install</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Permit Sub</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '90px' }}>Notes</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Permit Conf</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '60px' }}>Permit #</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Permit App</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 bg-yellow-50 text-xs" style={{ minWidth: '45px' }}>D Init</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 bg-yellow-50 text-xs" style={{ minWidth: '45px' }}>D Req</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 bg-yellow-50 text-xs" style={{ minWidth: '45px' }}>D Ord</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 bg-yellow-50 text-xs" style={{ minWidth: '45px' }}>D Prm</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 bg-yellow-50 text-xs" style={{ minWidth: '45px' }}>D App</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 bg-yellow-50 text-xs" style={{ minWidth: '45px' }}>D Ins</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Quote</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Follow Up</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Close</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '50px' }}>Prob</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Next FU</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '70px' }}>Start</th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '80px' }}>
                <div className="flex items-center gap-1">
                  Lead Src
                  {isRegistered && <Pencil className="w-2.5 h-2.5 cursor-pointer text-blue-500" onClick={() => openEditDialog("lead_source2", leadSources, "salesLeadSources")} />}
                </div>
              </th>
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '80px' }}>
                <div className="flex items-center gap-1">
                  Project Type
                  {isRegistered && <Pencil className="w-2.5 h-2.5 cursor-pointer text-blue-500" onClick={() => openEditDialog("project_type", projectTypes, "salesProjectTypes")} />}
                </div>
              </th>
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
                {/* Customer */}
                <td className="px-1 py-0.5 border-r">
                  <button
                    onClick={() => setSelectedWorkOrder(wo)}
                    className="h-6 w-full text-xs text-left px-1 hover:bg-blue-50 rounded flex items-center gap-1 text-blue-600"
                  >
                    <LinkIcon className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{wo.client_name || "Unnamed"}</span>
                  </button>
                </td>

                {/* Source */}
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

                {/* Current Task Deadline */}
                <td className="px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `deadline-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `deadline-${wo.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                        {wo.current_task_deadline ? format(new Date(wo.current_task_deadline), "M/d/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={wo.current_task_deadline ? new Date(wo.current_task_deadline) : undefined}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "current_task_deadline", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </td>

                {/* Current Task Assigned to */}
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

                {/* Designer */}
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

                {/* Project Manager */}
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

                {/* Estimator */}
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

                {/* Est/Inv @ - Corbridge Popup */}
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

                {/* Estimate Amount */}
                <td className="px-1 py-0.5 border-r">
                  <Input
                    type="number"
                    value={wo.estimate_amount || ""}
                    onChange={(e) => updateWorkOrder(wo.id, "estimate_amount", parseFloat(e.target.value) || 0)}
                    className="h-6 text-xs border-0 bg-transparent px-1"
                    placeholder="$0"
                    disabled={!isRegistered}
                  />
                </td>

                {/* Current Task Description - Dropdown */}
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
                        <SelectItem key={desc} value={desc}>{desc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>

                {/* Date Est. Requested/Initial Contact */}
                <td className="px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `initial-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `initial-${wo.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                        {wo.date_initial_contact ? format(new Date(wo.date_initial_contact), "M/d/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={wo.date_initial_contact ? new Date(wo.date_initial_contact) : undefined}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "date_initial_contact", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </td>

                {/* Site Survey */}
                <td className="px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `survey-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `survey-${wo.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                        {wo.site_survey_date ? format(new Date(wo.site_survey_date), "M/d/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={wo.site_survey_date ? new Date(wo.site_survey_date) : undefined}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "site_survey_date", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </td>

                {/* Date Estimate Sent to Customer */}
                <td className="px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `estsent-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `estsent-${wo.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                        {wo.date_estimate_sent ? format(new Date(wo.date_estimate_sent), "M/d/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={wo.date_estimate_sent ? new Date(wo.date_estimate_sent) : undefined}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "date_estimate_sent", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </td>

                {/* Date Order Created */}
                <td className="px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `ordercreated-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `ordercreated-${wo.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                        {wo.date_order_created ? format(new Date(wo.date_order_created), "M/d/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={wo.date_order_created ? new Date(wo.date_order_created) : undefined}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "date_order_created", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </td>

                {/* Project Install Date */}
                <td className="px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `install-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `install-${wo.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                        {wo.project_install_date ? format(new Date(wo.project_install_date), "M/d/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={wo.project_install_date ? new Date(wo.project_install_date) : undefined}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "project_install_date", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </td>

                {/* Permit Submitted */}
                <td className="px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `permitsub-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `permitsub-${wo.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                        {wo.permit_submitted_date ? format(new Date(wo.permit_submitted_date), "M/d/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={wo.permit_submitted_date ? new Date(wo.permit_submitted_date) : undefined}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "permit_submitted_date", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </td>

                {/* Notes (Link to Work Order) */}
                <td className="px-1 py-0.5 border-r">
                  <button
                    onClick={() => setSelectedWorkOrder(wo)}
                    className="h-7 w-full text-xs text-left px-1 hover:bg-blue-50 rounded truncate text-blue-600"
                  >
                    {wo.title || "View Details"}
                  </button>
                </td>

                {/* Date Permit Receipt Confirmed */}
                <td className="px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `permitconf-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `permitconf-${wo.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                        {wo.permit_receipt_confirmed_date ? format(new Date(wo.permit_receipt_confirmed_date), "MM/dd/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={wo.permit_receipt_confirmed_date ? new Date(wo.permit_receipt_confirmed_date) : undefined}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "permit_receipt_confirmed_date", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </td>

                {/* Permit Number */}
                <td className="px-1 py-0.5 border-r">
                  <Input
                    value={wo.permit_number || ""}
                    onChange={(e) => updateWorkOrder(wo.id, "permit_number", e.target.value)}
                    className="h-7 text-xs border-0 bg-transparent px-1"
                    placeholder="-"
                    disabled={!isRegistered}
                  />
                </td>

                {/* Date Permit Approved/Received */}
                <td className="px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `permitappr-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `permitappr-${wo.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                        {wo.permit_approved_date ? format(new Date(wo.permit_approved_date), "MM/dd/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={wo.permit_approved_date ? new Date(wo.permit_approved_date) : undefined}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "permit_approved_date", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </td>

                {/* Calculated Days Columns */}
                <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysFromInitial ?? "-"}</td>
                <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysEstSent ?? "-"}</td>
                <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysEstToOrder ?? "-"}</td>
                <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysOrderToPermit ?? "-"}</td>
                <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysPermitToApproved ?? "-"}</td>
                <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysOrderToInstall ?? "-"}</td>

                <td className="px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `quote-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `quote-${wo.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                        {wo.quote_date ? format(new Date(wo.quote_date), "MM/dd/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={wo.quote_date ? new Date(wo.quote_date) : undefined}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "quote_date", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </td>

                <td className="px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `followup-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `followup-${wo.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                        {wo.follow_up_date ? format(new Date(wo.follow_up_date), "MM/dd/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={wo.follow_up_date ? new Date(wo.follow_up_date) : undefined}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "follow_up_date", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </td>

                <td className="px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `close-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `close-${wo.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                        {wo.close_date ? format(new Date(wo.close_date), "MM/dd/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={wo.close_date ? new Date(wo.close_date) : undefined}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "close_date", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </td>

                <td className="px-1 py-0.5 border-r">
                  <Input
                    type="number"
                    value={wo.probability || ""}
                    onChange={(e) => updateWorkOrder(wo.id, "probability", parseInt(e.target.value) || 0)}
                    className="h-7 text-xs border-0 bg-transparent px-1"
                    placeholder="0%"
                    min="0"
                    max="100"
                    disabled={!isRegistered}
                  />
                </td>

                <td className="px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `followup-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `followup-${wo.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                        {wo.follow_up_date ? format(new Date(wo.follow_up_date), "MM/dd/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={wo.follow_up_date ? new Date(wo.follow_up_date) : undefined}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "follow_up_date", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </td>

                <td className="px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `install-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `install-${wo.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                        {wo.start_date ? format(new Date(wo.start_date), "MM/dd/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={wo.start_date ? new Date(wo.start_date) : undefined}
                        onSelect={(date) => {
                          updateWorkOrder(wo.id, "start_date", date ? format(date, "yyyy-MM-dd") : "");
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </td>

                <td className="px-1 py-0.5 border-r">
                  <Select
                    value={wo.lead_source || ""}
                    onValueChange={(val) => updateWorkOrder(wo.id, "lead_source", val)}
                    disabled={!isRegistered}
                  >
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {leadSources.map(source => (
                        <SelectItem key={source} value={source}>{source}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>

                <td className="px-1 py-0.5 border-r">
                  <Select
                    value={wo.project_type || ""}
                    onValueChange={(val) => updateWorkOrder(wo.id, "project_type", val)}
                    disabled={!isRegistered}
                  >
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projectTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>

                {/* Actions */}
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
          onSave={handleSaveNew}
          onCancel={() => setShowForm(false)}
          requireDueDate={false}
        />
      )}

      {/* Edit Dialog for Dropdown Lists */}
      <Dialog open={editDialog.open} onOpenChange={(open) => !open && setEditDialog({ open: false, field: "", items: [] })}>
        <DialogContent className="clay-card border-none max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-600" />
              Edit {editDialog.field === "lead_source" ? "Lead Sources" : 
                    editDialog.field === "designer" ? "Designers" :
                    editDialog.field === "project_manager" ? "Project Managers" :
                    editDialog.field === "estimator" ? "Estimators" : "Items"}
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
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {editDialog.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-sm">{item}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFromList(item)}
                    className="h-6 w-6"
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
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