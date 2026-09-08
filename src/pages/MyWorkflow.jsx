import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, User, Link as LinkIcon, Plus, X, Check, ChevronDown, ChevronRight, Trash2, Pencil, ClipboardList } from "lucide-react";
import MultiUserSelectInline from "@/components/shared/MultiUserSelectInline";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import {
  createWorkOrderArrayItemLocator,
  findWorkOrderArrayItemIndex,
  mutateLocatedWorkOrderArrayItem,
  mutateWorkOrderArrayField,
} from "@/components/workflow/workOrderPersistence";

const AuthorizedEmail = base44.entities.AuthorizedEmail;

const WorkOrder = base44.entities.WorkOrder;
const GeneralTask = base44.entities.GeneralTask;

const stageColors = {
  estimating: { bg: "#FEF3C7", text: "#92400E" },
  sales: { bg: "#D1FAE5", text: "#065F46" },
  permitting: { bg: "#FED7AA", text: "#9A3412" },
  design: { bg: "#BFDBFE", text: "#1E40AF" },
  production: { bg: "#A7F3D0", text: "#047857" },
  fabrication: { bg: "#FBCFE8", text: "#9D174D" },
  installation: { bg: "#DDD6FE", text: "#5B21B6" },
  completed: { bg: "#A7F3D0", text: "#047857" }
};

const stageDisplayNames = {
  estimating: "Estimating",
  sales: "Sales",
  permitting: "Permitting",
  design: "Design",
  production: "Production",
  fabrication: "Fabrication",
  installation: "Installation"
};

const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export default function MyWorkflow() {
  const { currentUser, isRegistered } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [addingSubTaskFor, setAddingSubTaskFor] = useState(null);
  const [newSubTaskText, setNewSubTaskText] = useState("");
  const [newSubTaskAssignedTo, setNewSubTaskAssignedTo] = useState([]);
  const [addingDetailFor, setAddingDetailFor] = useState(null);
  const [newDetailText, setNewDetailText] = useState("");
  const [newDetailAssignedTo, setNewDetailAssignedTo] = useState([]);
  const [editingTask, setEditingTask] = useState(null);
  const [editTaskText, setEditTaskText] = useState("");
  const [editingSipTask, setEditingSipTask] = useState(null);
  const [dropdownConditions, setDropdownConditions] = useState([]);
  const [stageFilter, setStageFilter] = useState("all");

  useEffect(() => {
    document.title = "My Workflow - Workflow Manager";
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadMyWorkOrders();
      loadUsers();
    }
  }, [currentUser]);

  const loadUsers = async () => {
    const users = await AuthorizedEmail.list();
    setAllUsers(users);
    
    // Load dropdown conditions for SIP checklist
    const settings = await base44.entities.GlobalSettings.list();
    const dropdownsSetting = settings.find(s => s.setting_key === 'dropdownConditions');
    setDropdownConditions(dropdownsSetting?.setting_value?.items || []);
  };

  const loadMyWorkOrders = async () => {
    setIsLoading(true);
    try {
      const [allOrders, allGeneralTasks] = await Promise.all([
        loadAllEntityRows({
          entity: WorkOrder,
          query: { completed: false, deleted: { $ne: true } },
          sort: "created_date",
          label: "My Workflow Work Orders",
        }),
        GeneralTask.filter({ completed: false })
      ]);

      const userName = currentUser?.full_name || currentUser?.email;
      
      const isAssignedTo = (assignedTo) => {
        const arr = Array.isArray(assignedTo) ? assignedTo : (assignedTo ? [assignedTo] : []);
        return arr.includes(userName);
      };

      // Find work orders where user has tasks assigned to them (in notes array OR sip_checklist)
      const myOrders = allOrders.filter(wo => {
        // Check notes array (traditional tasks)
        const hasAssignedTask = (wo.notes || []).some(task => isAssignedTo(task.assigned_to) && !task.completed);
        if (hasAssignedTask) return true;
        
        // Check sub-tasks in notes
        const hasAssignedSubTask = (wo.notes || []).some(task => 
          (task.sub_tasks || []).some(st => isAssignedTo(st.assigned_to) && !st.completed)
        );
        if (hasAssignedSubTask) return true;
        
        // Check details in notes
        const hasAssignedDetail = (wo.notes || []).some(task => 
          (task.sub_tasks || []).some(st => 
            (st.details || []).some(d => isAssignedTo(d.assigned_to) && !d.completed)
          )
        );
        if (hasAssignedDetail) return true;
        
        // Check sip_checklist for assigned tasks (from ProductChecklistDialog)
        const hasAssignedSipTask = (wo.sip_checklist || []).some(item => 
          item.assigned_to === userName && !item.approved_by
        );
        if (hasAssignedSipTask) return true;
        
        return false;
      });

      // Map general office tasks (no work order) into pseudo work-order rows so the
      // existing task rendering/editing code can display them alongside client jobs.
      const myGeneralTasks = allGeneralTasks
        .filter(gt => {
          if (isAssignedTo(gt.assigned_to) && !gt.completed) return true;
          const hasAssignedSubTask = (gt.sub_tasks || []).some(st => isAssignedTo(st.assigned_to) && !st.completed);
          if (hasAssignedSubTask) return true;
          const hasAssignedDetail = (gt.sub_tasks || []).some(st =>
            (st.details || []).some(d => isAssignedTo(d.assigned_to) && !d.completed)
          );
          return hasAssignedDetail;
        })
        .map(gt => ({
          id: gt.id,
          _isGeneral: true,
          client_name: "General Office Task",
          current_stage: null,
          _stage: gt.stage || "",
          due_date: gt.due_date,
          notes: [{
            id: gt.id,
            text: gt.text,
            assigned_to: gt.assigned_to || [],
            sub_tasks: gt.sub_tasks || [],
            completed: !!gt.completed,
            timestamp: gt.created_date
          }],
          sip_checklist: []
        }));

      setWorkOrders([...myOrders, ...myGeneralTasks]);
    } catch (error) {
      console.error("Error loading work orders:", error);
    }
    setIsLoading(false);
  };

  // Persist a targeted task change back to the right entity. Work Order tasks use
  // identity-safe optimistic concurrency; GeneralTask keeps its one-task record model.
  const persistTaskMutation = async (wo, task, mutateItem) => {
    if (!wo || !task || typeof mutateItem !== "function") return null;
    if (wo._isGeneral) {
      const updatedTask = mutateItem(task);
      await GeneralTask.update(wo.id, {
        text: updatedTask.text,
        assigned_to: updatedTask.assigned_to || [],
        sub_tasks: updatedTask.sub_tasks || [],
        completed: !!updatedTask.completed
      });
      const updatedNotes = [updatedTask];
      setWorkOrders(prev => prev.map(w => w.id === wo.id ? { ...w, notes: updatedNotes } : w));
      return updatedNotes;
    }

    const saved = await mutateLocatedWorkOrderArrayItem({
      workOrderId: wo.id,
      field: "notes",
      item: task,
      label: "My Workflow task",
      mutateItem,
    });
    const savedNotes = saved.notes || [];
    setWorkOrders(prev => prev.map(w => w.id === wo.id
      ? { ...w, notes: savedNotes, updated_date: saved.updated_date }
      : w));
    return savedNotes;
  };

  const toggleTaskComplete = async (workOrderId, taskIndex) => {
    const wo = workOrders.find(w => w.id === workOrderId);
    const task = wo?.notes?.[taskIndex];
    if (!wo || !task) return;
    const targetCompleted = !task.completed;
    await persistTaskMutation(wo, task, (currentTask) => ({ ...currentTask, completed: targetCompleted }));
  };

  const toggleSubTaskComplete = async (workOrderId, taskIndex, subTaskIndex) => {
    const wo = workOrders.find(w => w.id === workOrderId);
    const task = wo?.notes?.[taskIndex];
    const subTask = task?.sub_tasks?.[subTaskIndex];
    if (!wo || !task || !subTask) return;
    const subTaskLocator = createWorkOrderArrayItemLocator(subTask);
    const targetCompleted = !subTask.completed;
    await persistTaskMutation(wo, task, (currentTask) => {
      const currentSubTasks = currentTask.sub_tasks || [];
      const currentSubTaskIndex = findWorkOrderArrayItemIndex(currentSubTasks, subTaskLocator, "My Workflow subtask");
      return {
        ...currentTask,
        sub_tasks: currentSubTasks.map((currentSubTask, index) => index === currentSubTaskIndex
          ? { ...currentSubTask, completed: targetCompleted }
          : currentSubTask),
      };
    });
  };

  const toggleDetailComplete = async (workOrderId, taskIndex, subTaskIndex, detailIndex) => {
    const wo = workOrders.find(w => w.id === workOrderId);
    const task = wo?.notes?.[taskIndex];
    const subTask = task?.sub_tasks?.[subTaskIndex];
    const detail = subTask?.details?.[detailIndex];
    if (!wo || !task || !subTask || !detail) return;
    const subTaskLocator = createWorkOrderArrayItemLocator(subTask);
    const detailLocator = createWorkOrderArrayItemLocator(detail);
    const targetCompleted = !detail.completed;
    await persistTaskMutation(wo, task, (currentTask) => {
      const currentSubTasks = currentTask.sub_tasks || [];
      const currentSubTaskIndex = findWorkOrderArrayItemIndex(currentSubTasks, subTaskLocator, "My Workflow subtask");
      return {
        ...currentTask,
        sub_tasks: currentSubTasks.map((currentSubTask, index) => {
          if (index !== currentSubTaskIndex) return currentSubTask;
          const currentDetails = currentSubTask.details || [];
          const currentDetailIndex = findWorkOrderArrayItemIndex(currentDetails, detailLocator, "My Workflow detail");
          return {
            ...currentSubTask,
            details: currentDetails.map((currentDetail, currentIndex) => currentIndex === currentDetailIndex
              ? { ...currentDetail, completed: targetCompleted }
              : currentDetail),
          };
        }),
      };
    });
  };

  const handleAddSubTask = async (workOrderId, taskIndex) => {
    if (!newSubTaskText.trim()) return;
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) return;

    const updatedTasks = (wo.notes || []).map((task, idx) => {
      if (idx === taskIndex) {
        return {
          ...task,
          sub_tasks: [...(task.sub_tasks || []), {
            text: newSubTaskText,
            completed: false,
            assigned_to: newSubTaskAssignedTo || "",
            details: []
          }]
        };
      }
      return task;
    });

    setWorkOrders(prev => prev.map(w =>
      w.id === workOrderId ? { ...w, notes: updatedTasks } : w
    ));
    setNewSubTaskText("");
    setNewSubTaskAssignedTo([]);
    setAddingSubTaskFor(null);
    await persistNotes(workOrderId, updatedTasks);
  };

  const handleDeleteSubTask = async (workOrderId, taskIndex, subTaskIndex) => {
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) return;

    const updatedTasks = (wo.notes || []).map((task, idx) => {
      if (idx === taskIndex) {
        return {
          ...task,
          sub_tasks: (task.sub_tasks || []).filter((_, stIdx) => stIdx !== subTaskIndex)
        };
      }
      return task;
    });

    setWorkOrders(prev => prev.map(w =>
      w.id === workOrderId ? { ...w, notes: updatedTasks } : w
    ));
    await persistNotes(workOrderId, updatedTasks);
  };

  const handleAddDetail = async (workOrderId, taskIndex, subTaskIndex) => {
    if (!newDetailText.trim()) return;
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) return;

    const updatedTasks = (wo.notes || []).map((task, idx) => {
      if (idx === taskIndex) {
        const updatedSubTasks = (task.sub_tasks || []).map((st, stIdx) => {
          if (stIdx === subTaskIndex) {
            return {
              ...st,
              details: [...(st.details || []), {
                text: newDetailText,
                completed: false,
                assigned_to: newDetailAssignedTo || ""
              }]
            };
          }
          return st;
        });
        return { ...task, sub_tasks: updatedSubTasks };
      }
      return task;
    });

    setWorkOrders(prev => prev.map(w =>
      w.id === workOrderId ? { ...w, notes: updatedTasks } : w
    ));
    setNewDetailText("");
    setNewDetailAssignedTo([]);
    setAddingDetailFor(null);
    await persistNotes(workOrderId, updatedTasks);
  };

  const handleDeleteDetail = async (workOrderId, taskIndex, subTaskIndex, detailIndex) => {
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) return;

    const updatedTasks = (wo.notes || []).map((task, idx) => {
      if (idx === taskIndex) {
        const updatedSubTasks = (task.sub_tasks || []).map((st, stIdx) => {
          if (stIdx === subTaskIndex) {
            return {
              ...st,
              details: (st.details || []).filter((_, dIdx) => dIdx !== detailIndex)
            };
          }
          return st;
        });
        return { ...task, sub_tasks: updatedSubTasks };
      }
      return task;
    });

    setWorkOrders(prev => prev.map(w =>
      w.id === workOrderId ? { ...w, notes: updatedTasks } : w
    ));
    await persistNotes(workOrderId, updatedTasks);
  };

  const handleEditTask = async (workOrderId, taskIndex, newText) => {
    if (!newText.trim()) return;
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) return;

    const updatedTasks = (wo.notes || []).map((task, idx) => {
      if (idx === taskIndex) {
        return { ...task, text: newText };
      }
      return task;
    });

    setWorkOrders(prev => prev.map(w =>
      w.id === workOrderId ? { ...w, notes: updatedTasks } : w
    ));
    setEditingTask(null);
    setEditTaskText("");
    await persistNotes(workOrderId, updatedTasks);
  };

  const handleEditSubTask = async (workOrderId, taskIndex, subTaskIndex, newText) => {
    if (!newText.trim()) return;
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) return;

    const updatedTasks = (wo.notes || []).map((task, idx) => {
      if (idx === taskIndex) {
        const updatedSubTasks = (task.sub_tasks || []).map((st, stIdx) => {
          if (stIdx === subTaskIndex) {
            return { ...st, text: newText };
          }
          return st;
        });
        return { ...task, sub_tasks: updatedSubTasks };
      }
      return task;
    });

    setWorkOrders(prev => prev.map(w =>
      w.id === workOrderId ? { ...w, notes: updatedTasks } : w
    ));
    setEditingTask(null);
    setEditTaskText("");
    await persistNotes(workOrderId, updatedTasks);
  };

  const toggleSipTaskComplete = async (workOrderId, itemId) => {
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) return;
    
    const updatedChecklist = (wo.sip_checklist || []).map(item =>
      item.id === itemId ? {
        ...item,
        approved_by: item.approved_by ? "" : (currentUser?.full_name || currentUser?.email || "Done")
      } : item
    );
    
    setWorkOrders(prev => prev.map(w => 
      w.id === workOrderId ? { ...w, sip_checklist: updatedChecklist } : w
    ));
    
    await WorkOrder.update(workOrderId, { sip_checklist: updatedChecklist });
  };

  const updateSipChecklistItem = async (workOrderId, itemId, updates) => {
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) return;
    
    const updatedChecklist = (wo.sip_checklist || []).map(item =>
      item.id === itemId ? { ...item, ...updates } : item
    );
    
    setWorkOrders(prev => prev.map(w => 
      w.id === workOrderId ? { ...w, sip_checklist: updatedChecklist } : w
    ));
    
    await WorkOrder.update(workOrderId, { sip_checklist: updatedChecklist });
  };

  const getMyTasksForWorkOrder = (wo) => {
    const userName = currentUser?.full_name || currentUser?.email;
    const myTasks = [];
    
    // Check traditional notes array
    (wo.notes || []).forEach((task, taskIndex) => {
      // Skip completed tasks
      if (task.completed) return;
      
      const isAssignedTo2 = (assignedTo) => {
          const arr = Array.isArray(assignedTo) ? assignedTo : (assignedTo ? [assignedTo] : []);
          return arr.includes(userName);
        };
        // Check if task is assigned to me - main tasks only, not standalone subtasks
      if (isAssignedTo2(task.assigned_to)) {
        myTasks.push({ type: 'task', task, taskIndex, workOrderId: wo.id, source: 'notes' });
      } else {
        // If the main task is NOT assigned to me, but has subtasks assigned to me,
        // show only those subtasks under the parent task context (not as standalone)
        const mySubTasks = (task.sub_tasks || []).filter(st => isAssignedTo2(st.assigned_to) && !st.completed);
        const myDetails = (task.sub_tasks || []).flatMap((st, stIndex) => 
          (st.details || []).filter(d => isAssignedTo2(d.assigned_to) && !d.completed).map((d, dIndex) => ({
            subTask: st, subTaskIndex: stIndex, detail: d, detailIndex: dIndex
          }))
        );
        
        // If I have subtasks or details assigned under this task, show the task as context
        if (mySubTasks.length > 0 || myDetails.length > 0) {
          myTasks.push({ type: 'task_with_my_items', task, taskIndex, workOrderId: wo.id, mySubTasks, myDetails, source: 'notes' });
        }
      }
    });
    
    // Check sip_checklist for assigned tasks (from ProductChecklistDialog)
    (wo.sip_checklist || []).forEach((item, itemIndex) => {
      // Skip completed items (approved_by means completed for sip_checklist)
      if (item.approved_by) return;
      
      // Handle both single user assignment (old) and array assignment (new)
      const assignedUsers = Array.isArray(item.assigned_to) ? item.assigned_to : (item.assigned_to ? [item.assigned_to] : []);
      
      // Only show task-type items that are assigned to me
      if (item.type === 'task' && assignedUsers.includes(userName)) {
        // Find the parent checklist item for this task
        const parentItem = wo.sip_checklist.find(ci => ci.id === item.parent_id);
        
        myTasks.push({ 
          type: 'sip_task', 
          item, 
          parentItem,
          itemIndex, 
          workOrderId: wo.id, 
          source: 'sip_checklist',
          productName: item.product_name
        });
      }
    });
    
    return myTasks;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const userName = currentUser?.full_name || currentUser?.email || "User";

  const visibleWorkOrders = stageFilter === "all" ? workOrders : workOrders.filter(wo => {
    if (stageFilter === "general") return wo._isGeneral && !wo._stage;
    if (wo._isGeneral) return (wo._stage || "") === stageFilter;
    return wo.current_stage === stageFilter || (wo.notes || []).some(t => t.stage === stageFilter);
  });

  return (
    <div className="min-h-screen p-6">
      <div className="w-full">
        {/* Header */}
        <div className="clay-card p-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
              <User className="w-4 h-4 text-purple-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">My Workflow</h1>
              <p className="text-gray-500 text-xs">{userName} - {visibleWorkOrders.length} items</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Label className="text-xs text-gray-500">Stage:</Label>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  <SelectItem value="general">General (no stage)</SelectItem>
                  <SelectItem value="estimating">Estimating</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="permitting">Permitting</SelectItem>
                  <SelectItem value="design">Design</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="fabrication">Fabrication</SelectItem>
                  <SelectItem value="installation">Installation</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Spreadsheet Table */}
        <div className="clay-card p-2 w-full">
          <table className="w-full border-collapse" style={{ fontSize: '13px' }}>
            <thead className="bg-gray-100">
              <tr className="border-b">
                <th className="px-2 py-2 border-r text-center font-bold text-gray-700" style={{ width: '35px' }}>#</th>
                <th className="px-2 py-2 border-r text-left font-bold text-gray-700" style={{ width: '150px' }}>Customer</th>
                <th className="px-2 py-2 border-r text-left font-bold text-gray-700" style={{ width: '90px' }}>Stage</th>
                <th className="px-2 py-2 border-r text-left font-bold text-gray-700" style={{ width: '80px' }}>Due</th>
                <th className="px-2 py-2 text-left font-bold text-gray-700">My Assigned Tasks</th>
              </tr>
            </thead>
            <tbody>
              {visibleWorkOrders.map((wo, index) => {
                const myTasks = getMyTasksForWorkOrder(wo);
                
                return (
                  <tr 
                    key={wo.id} 
                    className="border-b hover:bg-gray-50"
                  >
                    {/* Row Number */}
                    <td className="px-2 py-1 border-r text-center font-medium text-gray-500 text-xs">
                      {index + 1}
                    </td>

                    {/* Customer */}
                    <td className="px-2 py-1 border-r">
                      {wo._isGeneral ? (
                        <span className="text-xs text-left flex items-center gap-1 font-medium text-purple-700">
                          <ClipboardList className="w-3 h-3 flex-shrink-0 text-purple-500" />
                          <span className="truncate">General Office Task</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => setSelectedWorkOrder(wo)}
                          className="text-xs text-left hover:text-blue-600 flex items-center gap-1 font-medium"
                        >
                          <LinkIcon className="w-3 h-3 flex-shrink-0 text-blue-500" />
                          <span className="truncate">{wo.client_name || "Unnamed"}</span>
                        </button>
                      )}
                      {wo.asap && <Badge className="bg-red-600 text-white text-[10px] px-1 py-0">ASAP</Badge>}
                    </td>

                    {/* Stage */}
                    <td className="px-2 py-1 border-r">
                      <Badge 
                        style={{ 
                          backgroundColor: wo._isGeneral ? (wo._stage ? (stageColors[wo._stage]?.bg || '#EDE9FE') : '#EDE9FE') : (stageColors[wo.current_stage]?.bg || '#E5E7EB'), 
                          color: wo._isGeneral ? (wo._stage ? (stageColors[wo._stage]?.text || '#5B21B6') : '#5B21B6') : (stageColors[wo.current_stage]?.text || '#374151') 
                        }} 
                        className="text-[10px] font-semibold px-1.5 py-0.5"
                      >
                        {wo._isGeneral ? (wo._stage ? stageDisplayNames[wo._stage] : 'General') : stageDisplayNames[wo.current_stage]}
                      </Badge>
                    </td>

                    {/* Due Date */}
                    <td className="px-2 py-1 border-r">
                      <span className="text-xs">
                        {wo.due_date ? format(parseLocalDate(wo.due_date), "M/d/yy") : "-"}
                      </span>
                    </td>

                    {/* My Assigned Tasks */}
                    <td className="px-2 py-1">
                      <div className="space-y-1">
                        {myTasks.map((item, idx) => {
                          const taskKey = `${wo.id}-${item.taskIndex}`;
                          const isExpanded = expandedTasks[taskKey] !== false;
                          const isEditingThisTask = editingTask?.woId === wo.id && editingTask?.taskIndex === item.taskIndex && editingTask?.type === 'task';
                          
                          return (
                            <div key={idx} className="group">
                              {/* Task with my subtasks/details - show parent as context */}
                              {item.type === 'task_with_my_items' && (
                                <div className="p-1 rounded border bg-gray-50 border-gray-200">
                                  <div className="flex items-center gap-1 mb-1">
                                    <button onClick={() => setExpandedTasks(prev => ({ ...prev, [taskKey]: !isExpanded }))}>
                                      {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                                    </button>
                                    <p className="text-xs text-gray-500 italic">↳ {item.task.text}</p>
                                  </div>
                                  {isExpanded && (
                                    <div className="ml-4 space-y-0.5">
                                      {/* Show my assigned subtasks */}
                                      {item.mySubTasks?.map((st, stIdx) => {
                                        const actualStIdx = (item.task.sub_tasks || []).indexOf(st);
                                        return (
                                          <div key={stIdx} className={`flex items-center gap-1 p-1 rounded border ${st.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                                            <Checkbox checked={st.completed} onCheckedChange={() => toggleSubTaskComplete(wo.id, item.taskIndex, actualStIdx)} disabled={!isRegistered} className="h-3 w-3" />
                                            <p className={`text-xs ${st.completed ? 'line-through text-gray-500' : 'font-medium'}`}>{st.text}</p>
                                          </div>
                                        );
                                      })}
                                      {/* Show my assigned details */}
                                      {item.myDetails?.map((d, dIdx) => (
                                        <div key={dIdx} className={`flex items-center gap-1 p-1 rounded border ${d.detail.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                                          <Checkbox checked={d.detail.completed} onCheckedChange={() => toggleDetailComplete(wo.id, item.taskIndex, d.subTaskIndex, d.detailIndex)} disabled={!isRegistered} className="h-3 w-3" />
                                          <div className="flex-1 min-w-0">
                                            <p className={`text-xs ${d.detail.completed ? 'line-through text-gray-500' : 'font-medium'}`}>{d.detail.text}</p>
                                            <p className="text-[10px] text-gray-400">↳ {d.subTask.text}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              {item.type === 'task' && (
                                <div className={`p-1 rounded border ${item.task.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => setExpandedTasks(prev => ({ ...prev, [taskKey]: !isExpanded }))}>
                                      {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                                    </button>
                                    <Checkbox
                                      checked={item.task.completed}
                                      onCheckedChange={() => toggleTaskComplete(wo.id, item.taskIndex)}
                                      disabled={!isRegistered}
                                      className="h-3 w-3"
                                    />
                                    <div className="flex-1 min-w-0">
                                      {isEditingThisTask ? (
                                        <div className="flex gap-1">
                                          <Input 
                                            value={editTaskText} 
                                            onChange={(e) => setEditTaskText(e.target.value)} 
                                            className="h-5 text-xs" 
                                            autoFocus
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleEditTask(wo.id, item.taskIndex, editTaskText);
                                              if (e.key === 'Escape') { setEditingTask(null); setEditTaskText(""); }
                                            }}
                                          />
                                          <Button size="sm" onClick={() => handleEditTask(wo.id, item.taskIndex, editTaskText)} className="h-5 px-1"><Check className="w-2.5 h-2.5" /></Button>
                                          <Button size="sm" variant="ghost" onClick={() => { setEditingTask(null); setEditTaskText(""); }} className="h-5 px-1"><X className="w-2.5 h-2.5" /></Button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1 flex-wrap">
                                          <p className={`text-xs ${item.task.completed ? 'line-through text-gray-500' : 'font-medium'}`}>
                                            {item.task.text}
                                          </p>
                                          {item.task.stage && item.task.stage !== wo.current_stage && (
                                            <Badge style={{ backgroundColor: stageColors[item.task.stage]?.bg || '#E5E7EB', color: stageColors[item.task.stage]?.text || '#374151' }} className="text-[9px] font-semibold px-1 py-0">
                                              {stageDisplayNames[item.task.stage]}
                                            </Badge>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {!isEditingThisTask && (
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => { setEditingTask({ woId: wo.id, taskIndex: item.taskIndex, type: 'task' }); setEditTaskText(item.task.text); }}
                                        className="h-4 w-4 opacity-0 group-hover:opacity-100"
                                      >
                                        <Pencil className="w-2.5 h-2.5 text-blue-500" />
                                      </Button>
                                    )}
                                  </div>
                                  
                                  {isExpanded && (
                                    <div className="ml-6 mt-1 space-y-0.5">
                                      {/* Show all sub-tasks */}
                                      {(item.task.sub_tasks || []).map((st, stIdx) => {
                                        const isEditingThisSubTask = editingTask?.woId === wo.id && editingTask?.taskIndex === item.taskIndex && editingTask?.subTaskIndex === stIdx && editingTask?.type === 'subtask';
                                        return (
                                        <div key={stIdx} className="group/subtask">
                                          <div className="flex items-center gap-1 text-[11px] p-0.5 rounded hover:bg-gray-50">
                                            <Checkbox
                                              checked={st.completed}
                                              onCheckedChange={() => toggleSubTaskComplete(wo.id, item.taskIndex, stIdx)}
                                              className="h-2.5 w-2.5"
                                            />
                                            {isEditingThisSubTask ? (
                                              <div className="flex gap-1 flex-1">
                                                <Input 
                                                  value={editTaskText} 
                                                  onChange={(e) => setEditTaskText(e.target.value)} 
                                                  className="h-4 text-[10px]" 
                                                  autoFocus
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleEditSubTask(wo.id, item.taskIndex, stIdx, editTaskText);
                                                    if (e.key === 'Escape') { setEditingTask(null); setEditTaskText(""); }
                                                  }}
                                                />
                                                <Button size="sm" onClick={() => handleEditSubTask(wo.id, item.taskIndex, stIdx, editTaskText)} className="h-4 px-1"><Check className="w-2 h-2" /></Button>
                                              </div>
                                            ) : (
                                              <>
                                                <span className={st.completed ? "line-through text-gray-400" : "text-gray-600"}>{st.text}</span>
                                                {st.assigned_to && (Array.isArray(st.assigned_to) ? st.assigned_to : [st.assigned_to]).length > 0 && <Badge variant="outline" className="text-[9px] text-blue-600 px-0.5 py-0">→ {(Array.isArray(st.assigned_to) ? st.assigned_to : [st.assigned_to]).map(u => u.split(' ')[0]).join(', ')}</Badge>}
                                                <Button 
                                                  variant="ghost" 
                                                  size="icon" 
                                                  onClick={() => { setEditingTask({ woId: wo.id, taskIndex: item.taskIndex, subTaskIndex: stIdx, type: 'subtask' }); setEditTaskText(st.text); }}
                                                  className="h-3 w-3 opacity-0 group-hover/subtask:opacity-100"
                                                >
                                                  <Pencil className="w-2 h-2 text-blue-500" />
                                                </Button>
                                              </>
                                            )}
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteSubTask(wo.id, item.taskIndex, stIdx)} className="h-3 w-3 ml-auto opacity-0 group-hover/subtask:opacity-100">
                                              <Trash2 className="w-2 h-2 text-red-500" />
                                            </Button>
                                          </div>
                                          {/* Details */}
                                          {(st.details || []).map((d, dIdx) => (
                                            <div key={dIdx} className="flex items-center gap-1 ml-4 text-[10px] group/detail">
                                              <Checkbox checked={d.completed} onCheckedChange={() => toggleDetailComplete(wo.id, item.taskIndex, stIdx, dIdx)} className="h-2 w-2" />
                                              <span className={d.completed ? "line-through text-gray-400" : "text-gray-500"}>{d.text}</span>
                                              {d.assigned_to && (Array.isArray(d.assigned_to) ? d.assigned_to : [d.assigned_to]).length > 0 && <Badge variant="outline" className="text-[8px] text-blue-600 px-0.5 py-0">→ {(Array.isArray(d.assigned_to) ? d.assigned_to : [d.assigned_to]).map(u => u.split(' ')[0]).join(', ')}</Badge>}
                                              <Button variant="ghost" size="icon" onClick={() => handleDeleteDetail(wo.id, item.taskIndex, stIdx, dIdx)} className="h-2.5 w-2.5 ml-auto opacity-0 group-hover/detail:opacity-100">
                                                <X className="w-1.5 h-1.5 text-red-500" />
                                              </Button>
                                            </div>
                                          ))}
                                          {/* Add Detail */}
                                          {addingDetailFor?.woId === wo.id && addingDetailFor?.taskIndex === item.taskIndex && addingDetailFor?.subTaskIndex === stIdx ? (
                                            <div className="ml-4 mt-0.5 space-y-0.5">
                                             <Input value={newDetailText} onChange={(e) => setNewDetailText(e.target.value)} placeholder="Detail..." className="h-4 text-[10px]" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleAddDetail(wo.id, item.taskIndex, stIdx); if (e.key === 'Escape') { setAddingDetailFor(null); setNewDetailText(""); setNewDetailAssignedTo([]); }}} />
                                             <MultiUserSelectInline users={allUsers} selectedUsers={newDetailAssignedTo} onSelectionChange={setNewDetailAssignedTo} placeholder="Assign..." className="h-4 w-full" />
                                             <div className="flex gap-1">
                                               <Button size="sm" onClick={() => handleAddDetail(wo.id, item.taskIndex, stIdx)} className="h-4 px-1"><Check className="w-2 h-2" /></Button>
                                               <Button size="sm" variant="ghost" onClick={() => { setAddingDetailFor(null); setNewDetailText(""); setNewDetailAssignedTo([]); }} className="h-4 px-1"><X className="w-2 h-2" /></Button>
                                             </div>
                                            </div>
                                          ) : (
                                            <Button variant="ghost" size="sm" onClick={() => setAddingDetailFor({ woId: wo.id, taskIndex: item.taskIndex, subTaskIndex: stIdx })} className="ml-4 h-3 px-0.5 text-[9px] opacity-0 group-hover/subtask:opacity-100"><Plus className="w-1.5 h-1.5" />Detail</Button>
                                          )}
                                        </div>
                                      )})}
                                      {/* Add Sub-task */}
                                      {addingSubTaskFor?.woId === wo.id && addingSubTaskFor?.taskIndex === item.taskIndex ? (
                                        <div className="mt-0.5 space-y-0.5">
                                         <Input value={newSubTaskText} onChange={(e) => setNewSubTaskText(e.target.value)} placeholder="Sub-task..." className="h-5 text-[10px]" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubTask(wo.id, item.taskIndex); if (e.key === 'Escape') { setAddingSubTaskFor(null); setNewSubTaskText(""); setNewSubTaskAssignedTo([]); }}} />
                                         <MultiUserSelectInline users={allUsers} selectedUsers={newSubTaskAssignedTo} onSelectionChange={setNewSubTaskAssignedTo} placeholder="Assign..." className="h-5 w-full" />
                                         <div className="flex gap-1">
                                           <Button size="sm" onClick={() => handleAddSubTask(wo.id, item.taskIndex)} className="h-4 px-1"><Check className="w-2 h-2" /></Button>
                                           <Button size="sm" variant="ghost" onClick={() => { setAddingSubTaskFor(null); setNewSubTaskText(""); setNewSubTaskAssignedTo([]); }} className="h-4 px-1"><X className="w-2 h-2" /></Button>
                                         </div>
                                        </div>
                                      ) : (
                                        <Button variant="ghost" size="sm" onClick={() => setAddingSubTaskFor({ woId: wo.id, taskIndex: item.taskIndex })} className="h-4 px-1 text-[9px] opacity-0 group-hover:opacity-100"><Plus className="w-2 h-2" />Sub-task</Button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* SIP Checklist tasks */}
                              {item.type === 'sip_task' && (
                                <div className={`p-1 rounded border ${item.item.approved_by ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => setExpandedTasks(prev => ({ ...prev, [taskKey]: !isExpanded }))}>
                                      {item.parentItem && (isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />)}
                                    </button>
                                    <Checkbox
                                      checked={!!item.item.approved_by}
                                      onCheckedChange={() => toggleSipTaskComplete(wo.id, item.item.id)}
                                      disabled={!isRegistered}
                                      className="h-3 w-3"
                                    />
                                    <span className="text-xs px-1 py-0.5 rounded bg-orange-100 text-orange-700">SIP Task</span>
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-xs ${item.item.approved_by ? 'line-through text-gray-500' : 'font-medium'}`}>
                                        {item.item.text}
                                      </p>
                                      {item.productName && (
                                        <p className="text-[10px] text-gray-400">📦 {item.productName}</p>
                                      )}
                                    </div>
                                    <MultiUserSelectInline
                                      users={allUsers}
                                      selectedUsers={item.item.assigned_to ? (Array.isArray(item.item.assigned_to) ? item.item.assigned_to : [item.item.assigned_to]) : []}
                                      onSelectionChange={(val) => updateSipChecklistItem(wo.id, item.item.id, { assigned_to: val })}
                                      disabled={!isRegistered}
                                      className="h-4 min-w-[60px]"
                                    />
                                    {item.parentItem && (
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => setEditingSipTask({ woId: wo.id, item: item.item, parentItem: item.parentItem })}
                                        className="h-4 w-4 opacity-0 group-hover:opacity-100"
                                      >
                                        <Pencil className="w-2.5 h-2.5 text-blue-500" />
                                      </Button>
                                    )}
                                  </div>
                                  
                                  {/* Expanded: Show parent checklist item details */}
                                  {isExpanded && item.parentItem && (
                                    <div className="ml-6 mt-1 p-2 bg-blue-50 rounded border border-blue-200">
                                      <div className="text-[10px] text-blue-700 font-medium mb-1">Parent Checklist Item:</div>
                                      <div className="text-xs font-medium mb-1">{item.parentItem.text}</div>
                                      <div className="flex items-center gap-2 text-[10px]">
                                        <span className="text-gray-600">Approved by:</span>
                                        <span className="font-medium">{item.parentItem.approved_by || "-"}</span>
                                        <span className="text-gray-600 ml-2">Status:</span>
                                        <span className="font-medium">{item.parentItem.custom_dropdown_value || "-"}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {myTasks.length === 0 && (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {workOrders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-gray-500 text-sm">
                    <User className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                    <p className="font-semibold">No tasks assigned to you</p>
                    <p className="text-xs mt-1">When tasks are assigned to you, they'll appear here.</p>
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
          onUpdate={() => loadMyWorkOrders()}
          onMove={async (wo, newStage) => {
            await WorkOrder.update(wo.id, { current_stage: newStage });
            loadMyWorkOrders();
          }}
          onComplete={async (wo) => {
            await WorkOrder.update(wo.id, { completed: true });
            loadMyWorkOrders();
          }}
          onDelete={async (wo) => {
            await WorkOrder.update(wo.id, {
              deleted: true,
              deleted_at: new Date().toISOString(),
              deleted_by: "user"
            });
            loadMyWorkOrders();
          }}
        />
      )}
      
      {/* Edit SIP Checklist Item Dialog */}
      {editingSipTask && (
        <Dialog open={true} onOpenChange={() => setEditingSipTask(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Checklist Item</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Checklist Item</Label>
                <p className="text-sm font-medium mt-1 p-2 bg-gray-100 rounded">{editingSipTask.parentItem.text}</p>
              </div>
              
              <div>
                <Label className="text-sm font-medium">Approved By</Label>
                <Select
                  value={editingSipTask.parentItem.approved_by || ""}
                  onValueChange={async (val) => {
                    await updateSipChecklistItem(editingSipTask.woId, editingSipTask.parentItem.id, { approved_by: val });
                    setEditingSipTask(prev => ({
                      ...prev,
                      parentItem: { ...prev.parentItem, approved_by: val }
                    }));
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select person..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers.map(u => (
                      <SelectItem key={u.email} value={u.full_name || u.email}>
                        {u.full_name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-sm font-medium">Condition</Label>
                <Select
                  value={editingSipTask.parentItem.custom_dropdown_value || "select_value"}
                  onValueChange={async (val) => {
                    if (val !== "select_value") {
                      await updateSipChecklistItem(editingSipTask.woId, editingSipTask.parentItem.id, { custom_dropdown_value: val });
                      setEditingSipTask(prev => ({
                        ...prev,
                        parentItem: { ...prev.parentItem, custom_dropdown_value: val }
                      }));
                    }
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select condition..." />
                  </SelectTrigger>
                  <SelectContent>
                    {dropdownConditions
                      .filter(dd => (editingSipTask.parentItem.dropdown_ids || []).includes(dd.id))
                      .map(dd => (
                        <SelectItem key={dd.id} value={dd.name}>
                          {dd.name} {dd.is_completed ? '(Completed)' : '(Continued)'}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingSipTask(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}