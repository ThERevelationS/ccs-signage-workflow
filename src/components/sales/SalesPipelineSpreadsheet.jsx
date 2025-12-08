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
import { Progress } from "@/components/ui/progress";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
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

export default function SalesPipelineSpreadsheet({ searchTerm = "", filterStatus = "all" }) {
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

  // Predefined list management
  const [leadSources, setLeadSources] = useState(() => {
    const saved = localStorage.getItem('salesLeadSources');
    return saved ? JSON.parse(saved) : ["Walk-in", "Phone", "Email", "Referral", "Website"];
  });
  const [designers, setDesigners] = useState(() => {
    const saved = localStorage.getItem('salesDesigners');
    return saved ? JSON.parse(saved) : ["Designer 1", "Designer 2", "Designer 3"];
  });
  const [projectManagers, setProjectManagers] = useState(() => {
    const saved = localStorage.getItem('salesPMs');
    return saved ? JSON.parse(saved) : ["PM 1", "PM 2", "PM 3"];
  });
  const [estimators, setEstimators] = useState(() => {
    const saved = localStorage.getItem('salesEstimators');
    return saved ? JSON.parse(saved) : ["Estimator 1", "Estimator 2"];
  });

  useEffect(() => {
    loadWorkOrders();
  }, []);

  const loadWorkOrders = async () => {
    setIsLoading(true);
    try {
      const [orders, usersData] = await Promise.all([
        WorkOrder.filter({ in_pipeline: false, completed: false }),
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

  const addNewRow = async () => {
    if (!isRegistered) return;
    const newOrder = await WorkOrder.create({
      title: "",
      client_name: "",
      description: "",
      in_pipeline: false,
      sales_status: "lead",
      sales_rep: currentUser?.full_name || currentUser?.email || ""
    });
    setWorkOrders([newOrder, ...workOrders]);
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

  const deleteWorkOrder = async (orderId) => {
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
    
    await WorkOrder.delete(orderId);
    setWorkOrders(workOrders.filter(wo => wo.id !== orderId));
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
    if (editDialog.field === "lead_source") {
      setLeadSources(newItems);
      localStorage.setItem('salesLeadSources', JSON.stringify(newItems));
    } else if (editDialog.field === "designer") {
      setDesigners(newItems);
      localStorage.setItem('salesDesigners', JSON.stringify(newItems));
    } else if (editDialog.field === "project_manager") {
      setProjectManagers(newItems);
      localStorage.setItem('salesPMs', JSON.stringify(newItems));
    } else if (editDialog.field === "estimator") {
      setEstimators(newItems);
      localStorage.setItem('salesEstimators', JSON.stringify(newItems));
    }
    setEditInput("");
  };

  const removeFromList = (item) => {
    const newItems = editDialog.items.filter(i => i !== item);
    if (editDialog.field === "lead_source") {
      setLeadSources(newItems);
      localStorage.setItem('salesLeadSources', JSON.stringify(newItems));
    } else if (editDialog.field === "designer") {
      setDesigners(newItems);
      localStorage.setItem('salesDesigners', JSON.stringify(newItems));
    } else if (editDialog.field === "project_manager") {
      setProjectManagers(newItems);
      localStorage.setItem('salesPMs', JSON.stringify(newItems));
    } else if (editDialog.field === "estimator") {
      setEstimators(newItems);
      localStorage.setItem('salesEstimators', JSON.stringify(newItems));
    }
    setEditDialog({ ...editDialog, items: newItems });
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
              />
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
          <Button onClick={exportToExcel} size="sm" className="clay-button border-none text-gray-700 h-8"
            style={{ background: 'linear-gradient(135deg, #D4E9F7 0%, #E0D4F7 100%)' }}>
            <Download className="w-4 h-4 mr-1" />
            Export
          </Button>
        </div>
        <span className="text-xs text-gray-500">{filteredWorkOrders.length} leads</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border rounded-lg" style={{ fontSize: '11px', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '180px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '200px' }} />
            <col style={{ width: '80px' }} />
          </colgroup>

          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr className="border-b">
              <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Project Name</th>
              <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Contact</th>
              <th className="px-2 py-2 border-r text-left font-medium text-gray-700 flex items-center gap-1">
                Sales Rep
                {isRegistered && <Pencil className="w-3 h-3 cursor-pointer text-blue-500" onClick={() => openEditDialog("sales_rep", salesReps)} />}
              </th>
              <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Status</th>
              <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Budget</th>
              <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Quote Date</th>
              <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Close Date</th>
              <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Probability</th>
              <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Follow Up</th>
              <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Install Date</th>
              <th className="px-2 py-2 border-r text-left font-medium text-gray-700 flex items-center gap-1">
                Lead Source
                {isRegistered && <Pencil className="w-3 h-3 cursor-pointer text-blue-500" onClick={() => openEditDialog("lead_source", leadSources)} />}
              </th>
              <th className="px-2 py-2 border-r text-left font-medium text-gray-700 flex items-center gap-1">
                Project Type
                {isRegistered && <Pencil className="w-3 h-3 cursor-pointer text-blue-500" onClick={() => openEditDialog("project_type", projectTypes)} />}
              </th>
              <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Additional Notes</th>
              <th className="px-2 py-2 text-left font-medium text-gray-700">Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredWorkOrders.map((wo) => (
              <tr key={wo.id} className={`border-b hover:bg-gray-50 ${getRowColor(wo.sales_status)}`}>
                <td className="px-1 py-0.5 border-r">
                  <button
                    onClick={() => setSelectedWorkOrder(wo)}
                    className="h-7 w-full text-xs text-left px-1 hover:bg-blue-50 rounded flex items-center gap-1 text-blue-600 font-medium"
                  >
                    {wo.title || "Untitled"}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </td>

                <td className="px-1 py-0.5 border-r">
                  <button
                    onClick={() => setSelectedWorkOrder(wo)}
                    className="h-7 w-full text-xs text-left px-1 hover:bg-blue-50 rounded flex items-center gap-1 text-blue-600"
                  >
                    {wo.contact_name || "-"}
                  </button>
                </td>

                <td className="px-1 py-0.5 border-r">
                  <Select
                    value={wo.sales_rep || ""}
                    onValueChange={(val) => updateWorkOrder(wo.id, "sales_rep", val)}
                    disabled={!isRegistered}
                  >
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {salesReps.map(rep => (
                        <SelectItem key={rep} value={rep}>{rep}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>

                <td className="px-1 py-0.5 border-r">
                  <Select
                    value={wo.sales_status || "lead"}
                    onValueChange={(val) => updateWorkOrder(wo.id, "sales_status", val)}
                    disabled={!isRegistered}
                  >
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SALES_STATUSES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>

                <td className="px-1 py-0.5 border-r">
                  <Input
                    type="number"
                    value={wo.quoted_amount || ""}
                    onChange={(e) => updateWorkOrder(wo.id, "quoted_amount", parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs border-0 bg-transparent px-1"
                    placeholder="$0"
                    disabled={!isRegistered}
                  />
                </td>

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

                <td className="px-1 py-0.5 border-r">
                  <Input
                    value={wo.description || ""}
                    onChange={(e) => updateWorkOrder(wo.id, "description", e.target.value)}
                    className="h-7 text-xs border-0 bg-transparent px-1"
                    placeholder="Notes..."
                    disabled={!isRegistered}
                  />
                </td>

                <td className="px-1 py-0.5">
                  <div className="flex gap-1">
                    {isRegistered && wo.sales_status === "won" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveToWorkflow(wo)}
                        className="h-6 w-6"
                        title="Move to workflow"
                      >
                        <ArrowRight className="w-3 h-3 text-green-600" />
                      </Button>
                    )}
                    {isRegistered && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteWorkOrder(wo.id)}
                        className="h-6 w-6"
                      >
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
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

      {/* Edit Dialog for Dropdown Lists */}
      <Dialog open={editDialog.open} onOpenChange={(open) => !open && setEditDialog({ open: false, field: "", items: [] })}>
        <DialogContent className="clay-card border-none max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-600" />
              Edit {editDialog.field === "sales_rep" ? "Sales Reps" : editDialog.field === "lead_source" ? "Lead Sources" : "Project Types"}
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
    </div>
  );
}