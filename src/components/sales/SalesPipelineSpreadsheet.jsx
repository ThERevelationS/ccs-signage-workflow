import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Plus, Trash2, Calendar as CalendarIcon, ArrowRight, Loader2, Download, Upload, Pencil, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import * as XLSX from "xlsx";

const WorkOrder = base44.entities.WorkOrder;

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
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const fileInputRef = useRef(null);
  const [editDialog, setEditDialog] = useState({ open: false, field: "", items: [] });
  const [editInput, setEditInput] = useState("");
  const [pendingChanges, setPendingChanges] = useState({});
  const debounceTimers = useRef({});

  // Predefined list management
  const [salesReps, setSalesReps] = useState(["Carl", "Twyla", "Brett", "Kyle", "Joe"]);
  const [leadSources, setLeadSources] = useState(["Website", "Referral", "Cold Call", "Trade Show", "Social Media"]);
  const [projectTypes, setProjectTypes] = useState(["Signage", "Vehicle Wrap", "Banners", "Building Graphics"]);

  useEffect(() => {
    loadWorkOrders();
  }, []);

  const loadWorkOrders = async () => {
    setIsLoading(true);
    try {
      const orders = await WorkOrder.filter({ in_pipeline: false, completed: false });
      setWorkOrders(orders.sort((a, b) => (b.created_date || "").localeCompare(a.created_date || "")));
    } catch (error) {
      console.error("Error loading work orders:", error);
    }
    setIsLoading(false);
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
      const changes = pendingChanges[orderId] || { [field]: value };
      try {
        await WorkOrder.update(orderId, changes);
        setPendingChanges(prev => {
          const updated = { ...prev };
          delete updated[orderId];
          return updated;
        });
      } catch (error) {
        console.error("Error updating work order:", error);
      }
    }, 1000);
  };

  const deleteWorkOrder = async (orderId) => {
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

  const openEditDialog = (field, items) => {
    setEditDialog({ open: true, field, items });
    setEditInput("");
  };

  const addToList = () => {
    if (!editInput.trim()) return;
    const newItems = [...editDialog.items, editInput.trim()];
    if (editDialog.field === "sales_rep") setSalesReps(newItems);
    else if (editDialog.field === "lead_source") setLeadSources(newItems);
    else if (editDialog.field === "project_type") setProjectTypes(newItems);
    setEditInput("");
  };

  const removeFromList = (item) => {
    const newItems = editDialog.items.filter(i => i !== item);
    if (editDialog.field === "sales_rep") setSalesReps(newItems);
    else if (editDialog.field === "lead_source") setLeadSources(newItems);
    else if (editDialog.field === "project_type") setProjectTypes(newItems);
    setEditDialog({ ...editDialog, items: newItems });
  };

  const getRowColor = (status) => {
    const statusObj = SALES_STATUSES.find(s => s.value === status);
    return statusObj?.color || "bg-white";
  };

  const exportToExcel = () => {
    const exportData = filteredWorkOrders.map(wo => ({
      "Project Name": wo.title || "",
      "Client": wo.client_name || "",
      "Status": wo.sales_status || "",
      "Description": wo.description || "",
      "Contact": wo.contact_name || "",
      "Phone": wo.contact_phone || "",
      "Quote Amount": wo.quoted_amount || "",
      "Probability": wo.probability || "",
      "Quote Date": wo.quote_date || "",
      "Follow Up": wo.follow_up_date || "",
      "Close Date": wo.close_date || "",
      "Sales Rep": wo.sales_rep || "",
      "Lead Source": wo.lead_source || "",
      "Location": wo.install_location || ""
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Pipeline");
    XLSX.writeFile(wb, `sales_pipeline_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
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

      for (const row of jsonData) {
        await WorkOrder.create({
          title: row["Project Name"] || "",
          client_name: row["Client"] || "",
          sales_status: row["Status"] || "lead",
          description: row["Description"] || "",
          contact_name: row["Contact"] || "",
          contact_phone: row["Phone"] || "",
          quoted_amount: parseFloat(row["Quote Amount"]) || 0,
          probability: parseInt(row["Probability"]) || 0,
          quote_date: row["Quote Date"] || "",
          follow_up_date: row["Follow Up"] || "",
          close_date: row["Close Date"] || "",
          sales_rep: row["Sales Rep"] || "",
          lead_source: row["Lead Source"] || "",
          install_location: row["Location"] || "",
          in_pipeline: false
        });
      }

      await loadWorkOrders();
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