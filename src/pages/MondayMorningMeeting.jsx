import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { Loader2, Link as LinkIcon, ClipboardList, Check, X } from "lucide-react";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

// Helper to parse date string as local date
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Default Monday Morning Meeting checklist items
const DEFAULT_MMM_CHECKLIST = [
  { id: 1, text: "Customer Contacted", checked: false },
  { id: 2, text: "Quote Reviewed", checked: false },
  { id: 3, text: "Follow-up Scheduled", checked: false },
  { id: 4, text: "Deposit Received", checked: false },
  { id: 5, text: "Design Requested", checked: false },
  { id: 6, text: "Material Requirements Confirmed", checked: false },
  { id: 7, text: "Timeline Discussed", checked: false },
  { id: 8, text: "Special Instructions Noted", checked: false }
];

export default function MondayMorningMeeting() {
  const { currentUser, isRegistered } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [checklistDialog, setChecklistDialog] = useState({ open: false, workOrder: null });
  const [mmmChecklist, setMmmChecklist] = useState([]);
  const parentRef = useRef(null);

  useEffect(() => {
    loadWorkOrders();
    const interval = setInterval(() => loadWorkOrders(false), 60000);
    return () => clearInterval(interval);
  }, []);

  const loadWorkOrders = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const [orders, usersData] = await Promise.all([
        WorkOrder.filter({ is_rider: false, completed: false, deleted: { $ne: true } }),
        AuthorizedEmail.list()
      ]);
      // Filter for Monday Morning Meeting only - items where current_task_assigned_to is "Monday Morning Meeting"
      const mmmOrders = orders.filter(wo => wo.current_task_assigned_to === "Monday Morning Meeting");
      setWorkOrders(mmmOrders.sort((a, b) => (b.created_date || "").localeCompare(a.created_date || "")));
      setUsers(usersData);
    } catch (error) {
      console.error("Error loading work orders:", error);
    }
    setIsLoading(false);
  };

  const updateWorkOrder = async (orderId, field, value) => {
    setWorkOrders(prev => prev.map(wo => wo.id === orderId ? { ...wo, [field]: value } : wo));
    try {
      await WorkOrder.update(orderId, { [field]: value });
    } catch (error) {
      console.error("Error updating work order:", error);
    }
  };

  const openChecklist = (wo) => {
    // Load existing checklist from work order or use defaults
    const existingChecklist = wo.mmm_checklist || DEFAULT_MMM_CHECKLIST;
    setMmmChecklist(existingChecklist);
    setChecklistDialog({ open: true, workOrder: wo });
  };

  const toggleChecklistItem = (itemId) => {
    setMmmChecklist(prev => 
      prev.map(item => item.id === itemId ? { ...item, checked: !item.checked } : item)
    );
  };

  const saveChecklist = async () => {
    if (checklistDialog.workOrder) {
      await updateWorkOrder(checklistDialog.workOrder.id, "mmm_checklist", mmmChecklist);
      setChecklistDialog({ open: false, workOrder: null });
    }
  };

  const getChecklistProgress = (wo) => {
    const checklist = wo.mmm_checklist || DEFAULT_MMM_CHECKLIST;
    const completed = checklist.filter(item => item.checked).length;
    return { completed, total: checklist.length };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="clay-card p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Monday Morning Meeting</h1>
              <p className="text-gray-500 mt-1">Weekly Planning & Review - {workOrders.length} items</p>
            </div>
          </div>
        </div>

        {/* Spreadsheet */}
        <div className="clay-card p-4 overflow-auto">
          <table className="w-full border-collapse" style={{ fontSize: '16px' }}>
            <thead className="bg-gray-100">
              <tr className="border-b">
                <th className="px-3 py-4 border-r text-center font-bold text-gray-700" style={{ width: '50px' }}>#</th>
                <th className="px-3 py-4 border-r text-center font-bold text-gray-700" style={{ width: '100px' }}>Checklist</th>
                <th className="px-3 py-4 border-r text-left font-bold text-gray-700" style={{ minWidth: '200px' }}>Customer</th>
                <th className="px-3 py-4 border-r text-left font-bold text-gray-700" style={{ minWidth: '120px' }}>Deadline</th>
                <th className="px-3 py-4 border-r text-left font-bold text-gray-700" style={{ minWidth: '140px' }}>Task Assigned</th>
                <th className="px-3 py-4 border-r text-left font-bold text-gray-700" style={{ minWidth: '120px' }}>Designer</th>
                <th className="px-3 py-4 border-r text-left font-bold text-gray-700" style={{ minWidth: '140px' }}>Project Manager</th>
                <th className="px-3 py-4 border-r text-left font-bold text-gray-700" style={{ minWidth: '120px' }}>Estimator</th>
                <th className="px-3 py-4 border-r text-left font-bold text-gray-700" style={{ minWidth: '130px' }}>Est/Inv # Link</th>
                <th className="px-3 py-4 border-r text-left font-bold text-gray-700" style={{ minWidth: '110px' }}>Amount</th>
                <th className="px-3 py-4 text-left font-bold text-gray-700" style={{ minWidth: '120px' }}>Survey</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo, index) => {
                const progress = getChecklistProgress(wo);
                const progressPercent = (progress.completed / progress.total) * 100;
                
                return (
                  <tr 
                    key={wo.id} 
                    className="border-b hover:bg-gray-50"
                    style={{ height: '63px' }} // 50% larger than 42px standard
                  >
                    {/* Row Number */}
                    <td className="px-3 py-3 border-r text-center font-bold text-gray-600 text-lg">
                      {index + 1}
                    </td>

                    {/* Checklist Button */}
                    <td className="px-3 py-3 border-r text-center">
                      <Button
                        variant="outline"
                        onClick={() => openChecklist(wo)}
                        className="h-12 w-full flex flex-col items-center justify-center gap-1 hover:bg-orange-50"
                      >
                        <ClipboardList className="w-5 h-5 text-orange-600" />
                        <span className="text-xs font-medium">
                          {progress.completed}/{progress.total}
                        </span>
                        <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-orange-600 transition-all"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </Button>
                    </td>

                    {/* Customer */}
                    <td className="px-3 py-3 border-r">
                      <button
                        onClick={() => setSelectedWorkOrder(wo)}
                        className="text-base text-left hover:text-blue-600 flex items-center gap-2 font-medium"
                      >
                        <LinkIcon className="w-4 h-4 flex-shrink-0 text-blue-500" />
                        <span className="truncate">{wo.client_name || "Unnamed"}</span>
                      </button>
                    </td>

                    {/* Deadline */}
                    <td className="px-3 py-3 border-r">
                      <Popover 
                        open={openDatePopover === `deadline-${wo.id}`} 
                        onOpenChange={(open) => setOpenDatePopover(open ? `deadline-${wo.id}` : null)}
                      >
                        <PopoverTrigger asChild disabled={!isRegistered}>
                          <button className="h-10 w-full text-base text-left px-2 hover:bg-gray-100 rounded font-medium">
                            {wo.current_task_deadline ? format(parseLocalDate(wo.current_task_deadline), "MM/dd/yy") : "-"}
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
                    <td className="px-3 py-3 border-r">
                      <Select
                        value={wo.current_task_assigned_to || ""}
                        onValueChange={(val) => updateWorkOrder(wo.id, "current_task_assigned_to", val)}
                        disabled={!isRegistered}
                      >
                        <SelectTrigger className="h-10 text-base border-0 bg-transparent px-2 font-medium">
                          <SelectValue placeholder="-">{wo.current_task_assigned_to || "-"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Monday Morning Meeting">Monday Morning Meeting</SelectItem>
                          <SelectItem value="SIPs">SIPs</SelectItem>
                          {users.filter(u => u.sales_roles?.includes("Task Assigned")).map(u => (
                            <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    {/* Designer */}
                    <td className="px-3 py-3 border-r">
                      <Select
                        value={wo.designer || ""}
                        onValueChange={(val) => updateWorkOrder(wo.id, "designer", val)}
                        disabled={!isRegistered}
                      >
                        <SelectTrigger className="h-10 text-base border-0 bg-transparent px-2 font-medium">
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
                    <td className="px-3 py-3 border-r">
                      <Select
                        value={wo.project_manager || ""}
                        onValueChange={(val) => updateWorkOrder(wo.id, "project_manager", val)}
                        disabled={!isRegistered}
                      >
                        <SelectTrigger className="h-10 text-base border-0 bg-transparent px-2 font-medium">
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
                    <td className="px-3 py-3 border-r">
                      <Select
                        value={wo.estimator || ""}
                        onValueChange={(val) => updateWorkOrder(wo.id, "estimator", val)}
                        disabled={!isRegistered}
                      >
                        <SelectTrigger className="h-10 text-base border-0 bg-transparent px-2 font-medium">
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
                    <td className="px-3 py-3 border-r">
                      {wo.corbridge_link ? (
                        <a
                          href={wo.corbridge_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-base text-blue-600 hover:underline font-medium"
                        >
                          {wo.corbridge_invoice_number || wo.est_inv_at || "Link"}
                        </a>
                      ) : (
                        <span className="text-base text-gray-700 font-medium">
                          {wo.est_inv_at || "-"}
                        </span>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="px-3 py-3 border-r">
                      <span className="text-base font-medium">
                        {wo.estimate_amount ? `$${wo.estimate_amount.toLocaleString()}` : "-"}
                      </span>
                    </td>

                    {/* Survey Date */}
                    <td className="px-3 py-3">
                      <Popover 
                        open={openDatePopover === `survey-${wo.id}`} 
                        onOpenChange={(open) => setOpenDatePopover(open ? `survey-${wo.id}` : null)}
                      >
                        <PopoverTrigger asChild disabled={!isRegistered}>
                          <button className="h-10 w-full text-base text-left px-2 hover:bg-gray-100 rounded font-medium">
                            {wo.site_survey_date ? format(parseLocalDate(wo.site_survey_date), "MM/dd/yy") : "-"}
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
                  </tr>
                );
              })}
              {workOrders.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-12 text-center text-gray-500 text-lg">
                    No items assigned to Monday Morning Meeting. Assign "Monday Morning Meeting" to the Task Assigned column on the Sales Pipeline to see items here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Work Order Details Dialog */}
      {selectedWorkOrder && (
        <WorkOrderDetailsDialog
          isOpen={true}
          onClose={() => setSelectedWorkOrder(null)}
          workOrder={selectedWorkOrder}
          onUpdate={() => loadWorkOrders()}
        />
      )}

      {/* Checklist Dialog - Large and Easy to Read */}
      <Dialog open={checklistDialog.open} onOpenChange={(open) => !open && setChecklistDialog({ open: false, workOrder: null })}>
        <DialogContent className="clay-card border-none max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <ClipboardList className="w-7 h-7 text-orange-600" />
              Monday Morning Checklist - {checklistDialog.workOrder?.client_name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Progress</span>
                <span className="font-bold text-lg">
                  {mmmChecklist.filter(i => i.checked).length} / {mmmChecklist.length} Complete
                </span>
              </div>
              <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all duration-300"
                  style={{ width: `${(mmmChecklist.filter(i => i.checked).length / mmmChecklist.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Checklist Items - Large and Easy to Read */}
            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {mmmChecklist.map((item, index) => (
                <div 
                  key={item.id}
                  onClick={() => isRegistered && toggleChecklistItem(item.id)}
                  className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all border-2 ${
                    item.checked 
                      ? 'bg-green-50 border-green-300' 
                      : 'bg-white border-gray-200 hover:border-orange-300 hover:bg-orange-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    item.checked ? 'bg-green-500' : 'bg-gray-200'
                  }`}>
                    {item.checked ? (
                      <Check className="w-5 h-5 text-white" />
                    ) : (
                      <span className="text-gray-500 font-bold">{index + 1}</span>
                    )}
                  </div>
                  <span className={`text-xl font-medium flex-1 ${
                    item.checked ? 'text-green-700 line-through' : 'text-gray-800'
                  }`}>
                    {item.text}
                  </span>
                  {item.checked && (
                    <span className="text-green-600 text-sm font-medium">✓ Done</span>
                  )}
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => setChecklistDialog({ open: false, workOrder: null })}
                className="flex-1 h-12 text-lg"
              >
                <X className="w-5 h-5 mr-2" />
                Cancel
              </Button>
              <Button 
                onClick={saveChecklist}
                className="flex-1 h-12 text-lg bg-orange-600 hover:bg-orange-700"
                disabled={!isRegistered}
              >
                <Check className="w-5 h-5 mr-2" />
                Save Checklist
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}