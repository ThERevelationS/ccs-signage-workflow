import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { Loader2, Link as LinkIcon, ClipboardList } from "lucide-react";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import MmmChecklistDialog from "@/components/mmm/MmmChecklistDialog";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;
const GlobalSettings = base44.entities.GlobalSettings;

// Helper to parse date string as local date
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export default function MondayMorningMeeting() {
  const { currentUser, isRegistered } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [wipTaskDescriptions, setWipTaskDescriptions] = useState([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [checklistDialog, setChecklistDialog] = useState({ open: false, workOrder: null });
  const [focusedRowId, setFocusedRowId] = useState(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(null);
  const parentRef = useRef(null);

  useEffect(() => {
    document.title = "Monday Morning Meeting - Workflow Manager";
  }, []);

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

      const taskDescSetting = settings.find(s => s.setting_key === 'salesTaskDescriptions');
      const mmmTaskDescriptions = [];
      const wipDescs = [];
      if (taskDescSetting?.setting_value?.items) {
        taskDescSetting.setting_value.items.forEach(item => {
          if (item.page === "MondayMorningMeeting") {
            mmmTaskDescriptions.push(item.text);
          }
          if (item.wip) {
            wipDescs.push(item.text);
          }
        });
      }
      setWipTaskDescriptions(wipDescs);

      const mmmOrders = orders.filter(wo =>
        wo.current_task_assigned_to === "Monday Morning Meeting" ||
        (wo.current_task_description && mmmTaskDescriptions.includes(wo.current_task_description)) ||
        (wo.current_task_description && wipDescs.includes(wo.current_task_description))
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

  const isWipItem = (wo) => {
    return wo.current_task_description && wipTaskDescriptions.includes(wo.current_task_description);
  };

  const toggleSipCompleted = async (wo) => {
    const newValue = !wo.sip_completed;
    setWorkOrders(prev => prev.map(w => w.id === wo.id ? { ...w, sip_completed: newValue } : w));
    try {
      await WorkOrder.update(wo.id, { sip_completed: newValue });
    } catch (error) {
      console.error("Error updating work order:", error);
    }
  };

  const activeWorkOrders = workOrders.filter(wo => !isWipItem(wo) || !wo.sip_completed);
  const completedWipItems = workOrders.filter(wo => isWipItem(wo) && wo.sip_completed);

  const openChecklist = (wo) => {
    setChecklistDialog({ open: true, workOrder: wo });
  };

  const getChecklistProgress = (wo) => {
    const checklist = wo.mmm_sip_checklist || [];
    if (checklist.length === 0) return { completed: 0, total: 0 };

    const mainChecklistItems = checklist.filter(item =>
      (!item.type || item.type === 'checklist') && !item.parent_id
    );

    if (mainChecklistItems.length === 0) return { completed: 0, total: 0 };

    const mainCompleted = mainChecklistItems.filter(item => item.approved_by && item.custom_dropdown_value).length;

    return {
      completed: mainCompleted,
      total: mainChecklistItems.length
    };
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
          <table className="w-full border-collapse" style={{ fontSize: '14px', minWidth: '1200px', tableLayout: 'auto' }}>
            <thead className="bg-gray-100">
              <tr className="border-b">
                <th
                  className="px-2 py-3 border-r text-center font-bold text-white"
                  style={{
                    minWidth: '50px',
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    fontSize: '14px'
                  }}
                >
                  #
                </th>
                <th className="px-2 py-3 border-r text-center font-bold text-gray-700" style={{ minWidth: '50px' }}>✓</th>
                <th className="px-2 py-3 border-r text-center font-bold text-gray-700" style={{ minWidth: '80px' }}>Checklist</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '160px' }}>Customer</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '180px' }}>Job Description</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '100px' }}>Deadline</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '130px' }}>Task Assigned</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '120px' }}>Designer</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '120px' }}>PM</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '120px' }}>Estimator</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '100px' }}>Est/Inv #</th>
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '100px' }}>Amount</th>
                <th className="px-2 py-3 text-left font-bold text-gray-700" style={{ minWidth: '100px' }}>Survey</th>
              </tr>
            </thead>
            <tbody>
              {activeWorkOrders.map((wo, index) => {
                const progress = getChecklistProgress(wo);
                const progressPercent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
                const isWip = isWipItem(wo);

                return (
                  <React.Fragment key={wo.id}>
                    {focusedRowIndex === index && <tr><td colSpan={12} className="h-3 bg-transparent border-none"></td></tr>}
                    <tr
                      className={`border-b ${focusedRowIndex !== index ? 'hover:bg-gray-50' : ''} ${isWip && focusedRowIndex !== index ? 'bg-blue-50/30' : ''} ${focusedRowIndex === index ? 'ring-2 ring-orange-400 ring-inset bg-orange-50/50' : ''}`}
                      style={{ height: '50px' }}
                    >
                      {/* Row Number - Clickable Focus Button */}
                      <td className="px-0 py-0 border-r">
                        <button
                          onClick={() => {
                            if (focusedRowIndex === index) {
                              setFocusedRowId(null);
                              setFocusedRowIndex(null);
                            } else {
                              setFocusedRowId(wo.id);
                              setFocusedRowIndex(index);
                            }
                          }}
                          className={`w-full h-full px-2 py-2 text-center font-bold transition-colors ${
                            focusedRowIndex === index
                              ? 'bg-orange-500 text-white'
                              : 'text-white hover:opacity-80'
                          }`}
                          style={focusedRowIndex !== index ? {
                            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                            color: 'white'
                          } : undefined}
                        >
                          {index + 1}
                        </button>
                      </td>

                      {/* Completed Checkbox */}
                      <td className="px-2 py-2 border-r text-center">
                        <Checkbox
                          checked={wo.sip_completed || false}
                          onCheckedChange={() => toggleSipCompleted(wo)}
                          disabled={!isRegistered}
                          className="h-5 w-5"
                        />
                      </td>

                      {/* Checklist Button */}
                      <td className="px-2 py-2 border-r text-center">
                        <Button
                          variant="outline"
                          onClick={() => openChecklist(wo)}
                          className="h-10 w-full flex flex-col items-center justify-center gap-0.5 hover:bg-orange-50 p-1"
                        >
                          <ClipboardList className="w-4 h-4 text-orange-600" />
                          <span className="text-xs font-medium">
                            {progress.completed}/{progress.total}
                          </span>
                        </Button>
                      </td>

                      {/* Customer */}
                      <td className="px-2 py-2 border-r">
                        <button
                          onClick={() => setSelectedWorkOrder(wo)}
                          className="text-sm text-left hover:text-blue-600 flex items-center gap-1 font-medium w-full truncate"
                        >
                          <LinkIcon className="w-3 h-3 flex-shrink-0 text-blue-500" />
                          <span className="truncate">{wo.client_name || "Unnamed"}</span>
                        </button>
                      </td>

                      {/* Job Description */}
                      <td className="px-2 py-2 border-r">
                        <span className="text-sm text-gray-700 truncate block">{wo.description || "-"}</span>
                      </td>

                      {/* Deadline */}
                      <td className="px-2 py-2 border-r">
                        <Popover
                          open={openDatePopover === `deadline-${wo.id}`}
                          onOpenChange={(open) => setOpenDatePopover(open ? `deadline-${wo.id}` : null)}
                        >
                          <PopoverTrigger asChild disabled={!isRegistered}>
                            <button className="h-8 w-full text-sm text-left px-1 hover:bg-gray-100 rounded font-medium">
                              {wo.current_task_deadline ? (() => { const d = parseLocalDate(wo.current_task_deadline); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}
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
                      <td className="px-2 py-2 border-r">
                        <Select
                          value={wo.current_task_assigned_to || ""}
                          onValueChange={(val) => updateWorkOrder(wo.id, "current_task_assigned_to", val)}
                          disabled={!isRegistered}
                        >
                          <SelectTrigger className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
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
                      <td className="px-2 py-2 border-r">
                        <Select
                          value={wo.designer || ""}
                          onValueChange={(val) => updateWorkOrder(wo.id, "designer", val)}
                          disabled={!isRegistered}
                        >
                          <SelectTrigger className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
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
                      <td className="px-2 py-2 border-r">
                        <Select
                          value={wo.project_manager || ""}
                          onValueChange={(val) => updateWorkOrder(wo.id, "project_manager", val)}
                          disabled={!isRegistered}
                        >
                          <SelectTrigger className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
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
                      <td className="px-2 py-2 border-r">
                        <Select
                          value={wo.estimator || ""}
                          onValueChange={(val) => updateWorkOrder(wo.id, "estimator", val)}
                          disabled={!isRegistered}
                        >
                          <SelectTrigger className="h-8 text-sm border-0 bg-transparent px-1 font-medium">
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
                      <td className="px-2 py-2 border-r">
                        {wo.corbridge_link ? (
                          <a
                            href={wo.corbridge_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline font-medium truncate block"
                          >
                            {wo.corbridge_invoice_number || wo.est_inv_at || "Link"}
                          </a>
                        ) : (
                          <span className="text-sm text-gray-700 font-medium truncate block">
                            {wo.est_inv_at || "-"}
                          </span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="px-2 py-2 border-r">
                        <span className="text-sm font-medium">
                          {wo.estimate_amount ? `$${wo.estimate_amount.toLocaleString()}` : "-"}
                        </span>
                      </td>

                      {/* Survey Date */}
                      <td className="px-2 py-2">
                        <Popover
                          open={openDatePopover === `survey-${wo.id}`}
                          onOpenChange={(open) => setOpenDatePopover(open ? `survey-${wo.id}` : null)}
                        >
                          <PopoverTrigger asChild disabled={!isRegistered}>
                            <button className="h-8 w-full text-sm text-left px-1 hover:bg-gray-100 rounded font-medium">
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
                    {focusedRowIndex === index && <tr><td colSpan={12} className="h-3 bg-transparent border-none"></td></tr>}
                  </React.Fragment>
                );
              })}
              {activeWorkOrders.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-3 py-12 text-center text-gray-500 text-base">
                    No items assigned to Monday Morning Meeting. Assign "Monday Morning Meeting" to the Task Assigned column on the Sales Pipeline to see items here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Completed WIP Items Section */}
        {completedWipItems.length > 0 && (
          <div className="clay-card p-4 w-full mt-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">Completed WIP Items ({completedWipItems.length})</h3>
            <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
              <thead className="bg-gray-50">
                <tr className="border-b">
                  <th className="px-2 py-2 border-r text-center font-medium text-gray-600" style={{ width: '50px' }}>Completed</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-gray-600" style={{ width: '20%' }}>Customer</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-gray-600" style={{ width: '20%' }}>Task Description</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-gray-600" style={{ width: '80px' }}>Deadline</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-gray-600" style={{ width: '15%' }}>Designer</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-gray-600" style={{ width: '15%' }}>PM</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600" style={{ width: '80px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {completedWipItems.map((wo) => (
                  <tr key={wo.id} className="border-b hover:bg-gray-50 bg-green-50/30">
                    <td className="px-2 py-2 border-r text-center">
                      <Checkbox
                        checked={true}
                        onCheckedChange={() => toggleSipCompleted(wo)}
                        disabled={!isRegistered}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-2 py-2 border-r" style={{ maxWidth: '150px' }}>
                      <button
                        onClick={() => setSelectedWorkOrder(wo)}
                        className="text-xs text-left hover:text-blue-600 flex items-center gap-1 font-medium w-full"
                      >
                        <LinkIcon className="w-3 h-3 flex-shrink-0 text-blue-500" />
                        <span className="truncate block">{wo.client_name || "Unnamed"}</span>
                      </button>
                    </td>
                    <td className="px-2 py-2 border-r text-xs" style={{ maxWidth: '150px' }}><span className="truncate block">{wo.current_task_description || "-"}</span></td>
                    <td className="px-2 py-2 border-r text-xs">
                      {wo.current_task_deadline ? format(parseLocalDate(wo.current_task_deadline), "MM/dd/yy") : "-"}
                    </td>
                    <td className="px-2 py-2 border-r text-xs truncate">{wo.designer || "-"}</td>
                    <td className="px-2 py-2 border-r text-xs truncate">{wo.project_manager || "-"}</td>
                    <td className="px-2 py-2 text-xs">
                      {wo.estimate_amount ? `$${wo.estimate_amount.toLocaleString()}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
            await WorkOrder.create({
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

      {/* MMM Checklist Dialog */}
      {checklistDialog.open && checklistDialog.workOrder && (
        <MmmChecklistDialog
          isOpen={checklistDialog.open}
          onClose={() => setChecklistDialog({ open: false, workOrder: null })}
          workOrder={checklistDialog.workOrder}
          onUpdate={() => loadWorkOrders(false)}
          isRegistered={isRegistered}
          isAdmin={currentUser?.role === 'admin'}
        />
      )}
    </div>
  );
}