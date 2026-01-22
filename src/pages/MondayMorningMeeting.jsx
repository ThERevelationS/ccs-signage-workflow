import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Loader2, Link as LinkIcon, ClipboardList } from "lucide-react";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import EnhancedSipChecklist from "@/components/workflow/EnhancedSipChecklist";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;
const GlobalSettings = base44.entities.GlobalSettings;

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
  const [wipTaskDescriptions, setWipTaskDescriptions] = useState([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [checklistDialog, setChecklistDialog] = useState({ open: false, workOrder: null });
  const parentRef = useRef(null);

  useEffect(() => {
    loadWorkOrders();
    const interval = setInterval(() => loadWorkOrders(false), 60000);
    return () => clearInterval(interval);
  }, []);

  const loadWorkOrders = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const [orders, usersData, settings] = await Promise.all([
        WorkOrder.filter({ is_rider: false, completed: false, deleted: { $ne: true } }),
        AuthorizedEmail.list(),
        GlobalSettings.list()
      ]);
      
      // Get WIP task descriptions from settings
      const taskDescSetting = settings.find(s => s.setting_key === 'salesTaskDescriptions');
      const wipDescriptions = [];
      if (taskDescSetting?.setting_value?.items) {
        taskDescSetting.setting_value.items.forEach(item => {
          if (item.wip) {
            wipDescriptions.push(item.text);
          }
        });
      }
      setWipTaskDescriptions(wipDescriptions);
      
      // Filter for Monday Morning Meeting - items where:
      // 1. current_task_assigned_to is "Monday Morning Meeting", OR
      // 2. current_task_description has WIP checked in settings
      const mmmOrders = orders.filter(wo => 
        wo.current_task_assigned_to === "Monday Morning Meeting" ||
        (wo.current_task_description && wipDescriptions.includes(wo.current_task_description))
      );
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
    setChecklistDialog({ open: true, workOrder: wo });
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
    <div className="h-full overflow-auto p-6">
      <div className="w-full">
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
        <div className="clay-card p-4 w-full overflow-x-auto">
          <table className="w-full border-collapse" style={{ fontSize: '16px', minWidth: '100%', tableLayout: 'auto' }}>
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
          onMove={async (wo, newStage) => {
            await WorkOrder.update(wo.id, { current_stage: newStage });
            loadWorkOrders();
          }}
          onSplit={async (wo) => {
            const rider = await WorkOrder.create({
              title: `${wo.title} - Rider`,
              client_name: wo.client_name,
              description: wo.description,
              is_rider: true,
              parent_work_order_id: wo.id,
              current_stage: wo.current_stage,
              rider_stage: wo.current_stage
            });
            loadWorkOrders();
          }}
          onComplete={async (wo) => {
            await WorkOrder.update(wo.id, { completed: true });
            loadWorkOrders();
          }}
          onDelete={async (wo) => {
            await WorkOrder.update(wo.id, {
              deleted: true,
              deleted_at: new Date().toISOString(),
              deleted_by: "user"
            });
            loadWorkOrders();
          }}
        />
      )}

      {/* Enhanced Checklist Dialog */}
      <EnhancedSipChecklist
        isOpen={checklistDialog.open}
        onClose={() => setChecklistDialog({ open: false, workOrder: null })}
        workOrder={checklistDialog.workOrder}
        onUpdate={() => loadWorkOrders(false)}
        isRegistered={isRegistered}
        title="Monday Morning Checklist"
        checklistField="mmm_checklist"
        accentColor="orange"
      />
    </div>
  );
}