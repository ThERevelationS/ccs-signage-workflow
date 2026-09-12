import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { Loader2, Link as LinkIcon, ClipboardList, Search, RefreshCw, CalendarClock, CheckCircle2, Settings2, AlertTriangle, CircleDollarSign, Focus, X } from "lucide-react";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import ProductChecklistDialog from "@/components/sips/ProductChecklistDialog";
import TemplateBuilder from "@/components/sips/TemplateBuilder";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import { createWorkOrderWithRecovery, replaceWorkOrderFieldsIfUnchanged, softDeleteWorkOrderFromLoadedSnapshot, transitionWorkOrderFromLoadedSnapshot } from "@/components/workflow/workOrderPersistence";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

// Helper to parse date string as local date
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Default SIP checklist items - can be customized per work order
const DEFAULT_SIP_CHECKLIST = [
  { id: 1, text: "Design Approved", checked: false },
  { id: 2, text: "Materials Ordered", checked: false },
  { id: 3, text: "Permit Submitted", checked: false },
  { id: 4, text: "Permit Approved", checked: false },
  { id: 5, text: "Production Started", checked: false },
  { id: 6, text: "Production Complete", checked: false },
  { id: 7, text: "QC Passed", checked: false },
  { id: 8, text: "Ready for Install", checked: false },
  { id: 9, text: "Install Scheduled", checked: false },
  { id: 10, text: "Install Complete", checked: false }
];

export default function SIPs() {
  const { currentUser, isRegistered } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [checklistDialog, setChecklistDialog] = useState({ open: false, workOrder: null });
  const [wipTaskDescriptions, setWipTaskDescriptions] = useState([]);
  const [focusedRowId, setFocusedRowId] = useState(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(null);
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [quickEditError, setQuickEditError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortMode, setSortMode] = useState("meeting");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const parentRef = useRef(null);

  // Set document title
  useEffect(() => {
    document.title = "SIPs - Workflow Manager";
  }, []);

  useEffect(() => {
    loadWorkOrders();
    const interval = setInterval(() => loadWorkOrders(false), 60000);
    return () => clearInterval(interval);
  }, []);

  const loadWorkOrders = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    if (!showLoading) setIsRefreshing(true);
    try {
      const [orders, usersData, taskDescSetting] = await Promise.all([
        loadAllEntityRows({
          entity: WorkOrder,
          query: { is_rider: false, completed: false, deleted: { $ne: true } },
          sort: "created_date",
          label: "SIPs Work Orders",
        }),
        loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "SIPs authorized users" }),
        loadSingleGlobalSetting({
          entity: base44.entities.GlobalSettings,
          settingKey: "salesTaskDescriptions",
          label: "SIPs sales task descriptions",
        })
      ]);
      
      // Get task descriptions that have SIPs page assigned OR have WIP flag
      const sipTaskDescriptions = [];
      const wipDescs = [];
      if (taskDescSetting?.setting_value?.items) {
        taskDescSetting.setting_value.items.forEach(item => {
          if (item.page === "SIPs") {
            sipTaskDescriptions.push(item.text);
          }
          if (item.wip) {
            wipDescs.push(item.text);
          }
        });
      }
      setWipTaskDescriptions(wipDescs);
      
      // Filter for SIPs - items where:
      // 1. current_task_assigned_to is "SIPs", OR
      // 2. current_task_description has SIPs page assigned in settings, OR
      // 3. current_task_description has WIP flag checked in settings
      const sipOrders = orders.filter(wo => 
        wo.current_task_assigned_to === "SIPs" ||
        (wo.current_task_description && sipTaskDescriptions.includes(wo.current_task_description)) ||
        (wo.current_task_description && wipDescs.includes(wo.current_task_description))
      );
      setWorkOrders(sipOrders.sort((a, b) => (b.created_date || "").localeCompare(a.created_date || "")));
      setUsers(usersData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error loading work orders:", error);
      setQuickEditError(error?.message || "SIPs could not refresh. The last loaded board is still shown.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const updateWorkOrder = async (orderId, field, value) => {
    const currentWo = workOrders.find((wo) => wo.id === orderId);
    if (!currentWo) return;
    const expectedValue = currentWo[field];
    setQuickEditError("");
    setWorkOrders(prev => prev.map(wo => wo.id === orderId ? { ...wo, [field]: value } : wo));
    try {
      const saved = await replaceWorkOrderFieldsIfUnchanged({
        workOrderId: orderId,
        expectedFields: { [field]: expectedValue },
        nextFields: { [field]: value },
        label: `SIPs ${field}`,
      });
      setWorkOrders((prev) => prev.map((wo) => wo.id === orderId ? { ...wo, ...saved } : wo));
    } catch (error) {
      console.error("Error updating SIPs Work Order field:", error);
      setQuickEditError(error?.message || "This Work Order field changed in another session. The latest value was reloaded.");
      await loadWorkOrders(false);
    }
  };

  // Check if a work order is a WIP item (has WIP task description)
  const isWipItem = (wo) => {
    return wo.current_task_description && wipTaskDescriptions.includes(wo.current_task_description);
  };

  // Toggle sip_completed flag on work order
  const toggleSipCompleted = async (wo) => {
    await updateWorkOrder(wo.id, "sip_completed", !wo.sip_completed);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isRevisitFuture = (wo) => {
    if (!wo.sip_revisit_date) return false;
    const d = parseLocalDate(wo.sip_revisit_date);
    return d && d > today;
  };

  // All non-completed active items
  const allActive = workOrders.filter(wo => (!isWipItem(wo) || !wo.sip_completed));

  // Jobs with NO revisit date or revisit date <= today go to main active list
  const activeWorkOrders = allActive
    .filter(wo => !isRevisitFuture(wo))
    .sort((a, b) => {
      // No date => top; then sort ascending by revisit date
      if (!a.sip_revisit_date && !b.sip_revisit_date) return 0;
      if (!a.sip_revisit_date) return -1;
      if (!b.sip_revisit_date) return 1;
      return a.sip_revisit_date.localeCompare(b.sip_revisit_date);
    });

  // Jobs with a FUTURE revisit date
  const futureRevisitOrders = allActive
    .filter(wo => isRevisitFuture(wo))
    .sort((a, b) => a.sip_revisit_date.localeCompare(b.sip_revisit_date));

  const completedWipItems = workOrders.filter(wo => isWipItem(wo) && wo.sip_completed);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchesSearch = (wo) => {
    if (!normalizedSearch) return true;
    return [
      wo.client_name,
      wo.description,
      wo.current_task_description,
      wo.current_task_assigned_to,
      wo.designer,
      wo.project_manager,
      wo.estimator,
      wo.est_inv_at,
      wo.corbridge_invoice_number,
    ].some(value => String(value || "").toLowerCase().includes(normalizedSearch));
  };

  const getDeadlineStatus = (dateString) => {
    const deadline = parseLocalDate(dateString);
    if (!deadline || Number.isNaN(deadline.getTime())) return null;
    const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
    if (diffDays < 0) return { bucket: "overdue", label: `${Math.abs(diffDays)}d overdue`, className: "bg-red-100 text-red-700 border-red-200" };
    if (diffDays === 0) return { bucket: "today", label: "Due today", className: "bg-red-100 text-red-700 border-red-200" };
    if (diffDays <= 7) return { bucket: "soon", label: `${diffDays}d left`, className: "bg-amber-100 text-amber-800 border-amber-200" };
    return { bucket: "future", label: null, className: "" };
  };

  const openChecklist = (wo) => {
    setChecklistDialog({ open: true, workOrder: wo });
  };

  const getChecklistProgress = (wo) => {
    const checklist = wo.sip_checklist || [];
    if (checklist.length === 0) return { completed: 0, total: 0 };
    
    // Only count main checklist items (type === 'checklist' or no type AND no parent_id)
    const mainChecklistItems = checklist.filter(item => 
      (!item.type || item.type === 'checklist') && !item.parent_id
    );
    
    if (mainChecklistItems.length === 0) return { completed: 0, total: 0 };
    
    // Count completed main items (have approved_by AND custom_dropdown_value)
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
              <h1 className="text-3xl font-bold text-gray-800">SIPs Meeting Board</h1>
              <p className="text-gray-500 mt-1">Production & Installation Planning - {workOrders.length} items</p>
            </div>

          </div>
        </div>

        {quickEditError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">SIPs Work Order update blocked</div>
              <div className="mt-1 text-xs">{quickEditError}</div>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={async () => { setQuickEditError(""); await loadWorkOrders(false); }} className="shrink-0 border-red-300 bg-white text-red-800">
              Reload latest
            </Button>
          </div>
        )}

        {/* Spreadsheet */}
        <div className="clay-card p-4 w-full overflow-x-auto">
          <table className="w-full border-collapse" style={{ fontSize: '14px', minWidth: '1200px', tableLayout: 'auto' }}>
            <thead className="bg-gray-100">
              <tr className="border-b">
                <th 
                  className="px-2 py-3 border-r text-center font-bold text-white" 
                  style={{ 
                    minWidth: '50px',
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
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
                <th className="px-2 py-3 border-r text-left font-bold text-gray-700" style={{ minWidth: '100px' }}>Survey</th>
                <th className="px-2 py-3 text-left font-bold text-gray-700" style={{ minWidth: '110px', background: '#fef3c7' }}>📅 Revisit</th>
              </tr>
            </thead>
            <tbody>
              {activeWorkOrders.map((wo, index) => {
                const progress = getChecklistProgress(wo);
                const progressPercent = (progress.completed / progress.total) * 100;
                
                const isWip = isWipItem(wo);
                
                return (
                  <React.Fragment key={wo.id}>
                  {focusedRowIndex === index && <tr><td colSpan={14} className="h-3 bg-transparent border-none"></td></tr>}
                  <tr 
                    className={`border-b ${focusedRowIndex !== index ? 'hover:bg-gray-50' : ''} ${isWip && focusedRowIndex !== index ? 'bg-blue-50/30' : ''} ${focusedRowIndex === index ? 'ring-2 ring-purple-400 ring-inset bg-purple-50/50' : ''}`}
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
                            ? 'bg-purple-500 text-white' 
                            : 'text-gray-500 hover:bg-purple-100 hover:text-purple-700'
                        }`}
                        style={focusedRowIndex !== index ? { 
                          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
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
                        className="h-10 w-full flex flex-col items-center justify-center gap-0.5 hover:bg-blue-50 p-1"
                      >
                        <ClipboardList className="w-4 h-4 text-blue-600" />
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
                    <td className="px-2 py-2 border-r">
                      <Popover 
                        open={openDatePopover === `survey-${wo.id}`} 
                        onOpenChange={(open) => setOpenDatePopover(open ? `survey-${wo.id}` : null)}
                      >
                        <PopoverTrigger asChild disabled={!isRegistered}>
                          <button className="h-8 w-full text-sm text-left px-1 hover:bg-gray-100 rounded font-medium">
                            {wo.site_survey_date ? (() => { const d = parseLocalDate(wo.site_survey_date); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}
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

                    {/* Revisit Date */}
                    <td className="px-2 py-2" style={{ background: wo.sip_revisit_date ? '#fef9c3' : 'transparent' }}>
                      <Popover
                        open={openDatePopover === `revisit-${wo.id}`}
                        onOpenChange={(open) => setOpenDatePopover(open ? `revisit-${wo.id}` : null)}
                      >
                        <PopoverTrigger asChild disabled={!isRegistered}>
                          <button className={`h-8 w-full text-sm text-left px-1 hover:bg-yellow-100 rounded font-medium ${wo.sip_revisit_date ? 'text-amber-700' : 'text-gray-400'}`}>
                            {wo.sip_revisit_date ? (() => { const d = parseLocalDate(wo.sip_revisit_date); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={parseLocalDate(wo.sip_revisit_date)}
                            onSelect={(date) => {
                              updateWorkOrder(wo.id, "sip_revisit_date", date ? format(date, "yyyy-MM-dd") : "");
                              setOpenDatePopover(null);
                            }}
                          />
                          {wo.sip_revisit_date && (
                            <div className="p-2 border-t">
                              <button
                                onClick={() => { updateWorkOrder(wo.id, "sip_revisit_date", ""); setOpenDatePopover(null); }}
                                className="text-xs text-red-500 hover:underline w-full text-center"
                              >
                                Clear date
                              </button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </td>
                  </tr>
                  {focusedRowIndex === index && <tr><td colSpan={14} className="h-3 bg-transparent border-none"></td></tr>}
                  </React.Fragment>
                );
              })}
              {activeWorkOrders.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-3 py-12 text-center text-gray-500 text-base">
                    No items assigned to SIPs. Assign "SIPs" to the Task Assigned column or check WIP/SIP on a task description to see items here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Future Revisit Section */}
        {futureRevisitOrders.length > 0 && (
          <div className="clay-card p-4 w-full mt-6 overflow-x-auto" style={{ borderLeft: '4px solid #f59e0b' }}>
            <h3 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2">
              📅 Revisit Later ({futureRevisitOrders.length})
              <span className="text-xs text-gray-400 font-normal">— future revisit date set, not in active queue</span>
            </h3>
            <table className="w-full border-collapse text-sm" style={{ tableLayout: 'auto', minWidth: '900px' }}>
              <thead className="bg-amber-50">
                <tr className="border-b">
                  <th className="px-2 py-2 border-r text-center font-medium text-amber-700" style={{ minWidth: '50px' }}>✓</th>
                  <th className="px-2 py-2 border-r text-center font-medium text-amber-700" style={{ minWidth: '80px' }}>Checklist</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-amber-700" style={{ minWidth: '160px' }}>Customer</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-amber-700" style={{ minWidth: '180px' }}>Job Description</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-amber-700" style={{ minWidth: '100px' }}>Deadline</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-amber-700" style={{ minWidth: '120px' }}>PM</th>
                  <th className="px-2 py-2 border-r text-left font-medium text-amber-700" style={{ minWidth: '100px' }}>Amount</th>
                  <th className="px-2 py-2 text-left font-bold text-amber-700" style={{ minWidth: '110px', background: '#fef3c7' }}>📅 Revisit</th>
                </tr>
              </thead>
              <tbody>
                {futureRevisitOrders.map((wo) => {
                  const progress = getChecklistProgress(wo);
                  return (
                    <tr key={wo.id} className="border-b hover:bg-amber-50/50 bg-yellow-50/30">
                      <td className="px-2 py-2 border-r text-center">
                        <Checkbox checked={wo.sip_completed || false} onCheckedChange={() => toggleSipCompleted(wo)} disabled={!isRegistered} className="h-5 w-5" />
                      </td>
                      <td className="px-2 py-2 border-r text-center">
                        <Button variant="outline" onClick={() => openChecklist(wo)} className="h-8 w-full flex flex-col items-center justify-center gap-0.5 hover:bg-blue-50 p-1">
                          <ClipboardList className="w-3.5 h-3.5 text-blue-600" />
                          <span className="text-xs">{progress.completed}/{progress.total}</span>
                        </Button>
                      </td>
                      <td className="px-2 py-2 border-r">
                        <button onClick={() => setSelectedWorkOrder(wo)} className="text-sm text-left hover:text-blue-600 flex items-center gap-1 font-medium w-full truncate">
                          <LinkIcon className="w-3 h-3 flex-shrink-0 text-blue-500" />
                          <span className="truncate">{wo.client_name || "Unnamed"}</span>
                        </button>
                      </td>
                      <td className="px-2 py-2 border-r"><span className="text-sm text-gray-700 truncate block">{wo.description || "-"}</span></td>
                      <td className="px-2 py-2 border-r text-sm">{wo.current_task_deadline ? format(parseLocalDate(wo.current_task_deadline), "MM/dd/yy") : "-"}</td>
                      <td className="px-2 py-2 border-r text-sm truncate">{wo.project_manager || "-"}</td>
                      <td className="px-2 py-2 border-r text-sm">{wo.estimate_amount ? `$${wo.estimate_amount.toLocaleString()}` : "-"}</td>
                      <td className="px-2 py-2" style={{ background: '#fef9c3' }}>
                        <Popover
                          open={openDatePopover === `revisit-future-${wo.id}`}
                          onOpenChange={(open) => setOpenDatePopover(open ? `revisit-future-${wo.id}` : null)}
                        >
                          <PopoverTrigger asChild disabled={!isRegistered}>
                            <button className="h-8 w-full text-sm text-left px-1 hover:bg-yellow-100 rounded font-bold text-amber-700">
                              {wo.sip_revisit_date ? (() => { const d = parseLocalDate(wo.sip_revisit_date); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={parseLocalDate(wo.sip_revisit_date)}
                              onSelect={(date) => {
                                updateWorkOrder(wo.id, "sip_revisit_date", date ? format(date, "yyyy-MM-dd") : "");
                                setOpenDatePopover(null);
                              }}
                            />
                            <div className="p-2 border-t">
                              <button onClick={() => { updateWorkOrder(wo.id, "sip_revisit_date", ""); setOpenDatePopover(null); }} className="text-xs text-red-500 hover:underline w-full text-center">Clear date</button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

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
                      {wo.current_task_deadline ? (() => { const d = parseLocalDate(wo.current_task_deadline); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "-"; })() : "-"}
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
            try {
              await transitionWorkOrderFromLoadedSnapshot({
                workOrder: wo,
                newStage,
                label: "SIPs details stage transition",
              });
            } catch (error) {
              console.error("Error moving SIPs Work Order:", error);
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
                rider_stage: wo.current_stage
              },
              label: "SIPs rider Work Order",
            });
            loadWorkOrders();
          }}
          onComplete={async (wo) => {
            try {
              await transitionWorkOrderFromLoadedSnapshot({
                workOrder: wo,
                newStage: wo.current_stage,
                completed: true,
                label: "SIPs details completion",
              });
            } catch (error) {
              console.error("Error completing SIPs Work Order:", error);
              alert(error?.message || "This Work Order changed in another session. Reload and try completion again.");
            }
            loadWorkOrders();
          }}
          onDelete={async (wo) => {
            try {
              const deleted = await softDeleteWorkOrderFromLoadedSnapshot({
                workOrder: wo,
                deletedBy: currentUser?.email || "unknown",
                label: "SIPs details Work Order delete",
              });
              Object.assign(wo, deleted);
            } catch (error) {
              console.error("Error deleting SIPs Work Order:", error);
              alert(error?.message || "This Work Order changed in another session. Reload before deleting it.");
            }
            loadWorkOrders();
          }}
        />
      )}

      {/* Product Checklist Dialog */}
      {checklistDialog.open && checklistDialog.workOrder && (
        <ProductChecklistDialog
          isOpen={checklistDialog.open}
          onClose={() => setChecklistDialog({ open: false, workOrder: null })}
          workOrder={checklistDialog.workOrder}
          onUpdate={() => loadWorkOrders(false)}
          isRegistered={isRegistered}
          isAdmin={currentUser?.role === 'admin'}
        />
      )}

      {/* Template Builder */}
      {showTemplateBuilder && (
        <TemplateBuilder
          isOpen={showTemplateBuilder}
          onClose={() => setShowTemplateBuilder(false)}
        />
      )}
    </div>
  );
}