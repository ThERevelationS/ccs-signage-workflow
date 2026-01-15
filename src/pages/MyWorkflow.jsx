import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, User, Calendar as CalendarIcon, Link as LinkIcon } from "lucide-react";
import { format } from "date-fns";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";

const WorkOrder = base44.entities.WorkOrder;

const stageColors = {
  estimating: "#FFF9C4",
  sales: "#B2DFDB",
  permitting: "#FFE4D6",
  design: "#D4E9F7",
  production: "#C8F4E9",
  fabrication: "#FFD6E8",
  installation: "#E0D4F7",
  completed: "#C8F4E9"
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

  useEffect(() => {
    if (currentUser) {
      loadMyWorkOrders();
    }
  }, [currentUser]);

  const loadMyWorkOrders = async () => {
    setIsLoading(true);
    try {
      const allOrders = await WorkOrder.filter({ completed: false, deleted: { $ne: true } });
      
      const userName = currentUser?.full_name || currentUser?.email;
      
      // Find work orders where:
      // 1. User is assigned to the work order
      // 2. User has tasks assigned to them (in notes array)
      const myOrders = allOrders.filter(wo => {
        // Check if assigned to this work order
        if (wo.assigned_to === userName) return true;
        
        // Check if any task is assigned to this user
        const hasAssignedTask = (wo.notes || []).some(task => task.assigned_to === userName);
        if (hasAssignedTask) return true;
        
        // Check sub-tasks
        const hasAssignedSubTask = (wo.notes || []).some(task => 
          (task.sub_tasks || []).some(st => st.assigned_to === userName)
        );
        if (hasAssignedSubTask) return true;
        
        // Check details
        const hasAssignedDetail = (wo.notes || []).some(task => 
          (task.sub_tasks || []).some(st => 
            (st.details || []).some(d => d.assigned_to === userName)
          )
        );
        if (hasAssignedDetail) return true;
        
        return false;
      });

      setWorkOrders(myOrders);
    } catch (error) {
      console.error("Error loading work orders:", error);
    }
    setIsLoading(false);
  };

  const toggleTaskComplete = async (workOrderId, taskIndex) => {
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) return;
    
    const updatedTasks = [...(wo.notes || [])];
    updatedTasks[taskIndex] = {
      ...updatedTasks[taskIndex],
      completed: !updatedTasks[taskIndex].completed
    };
    
    setWorkOrders(prev => prev.map(w => 
      w.id === workOrderId ? { ...w, notes: updatedTasks } : w
    ));
    
    await WorkOrder.update(workOrderId, { notes: updatedTasks });
  };

  const toggleSubTaskComplete = async (workOrderId, taskIndex, subTaskIndex) => {
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) return;
    
    const updatedTasks = (wo.notes || []).map((task, idx) => {
      if (idx === taskIndex) {
        const updatedSubTasks = (task.sub_tasks || []).map((st, stIdx) => {
          if (stIdx === subTaskIndex) {
            return { ...st, completed: !st.completed };
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
    
    await WorkOrder.update(workOrderId, { notes: updatedTasks });
  };

  const toggleDetailComplete = async (workOrderId, taskIndex, subTaskIndex, detailIndex) => {
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) return;
    
    const updatedTasks = (wo.notes || []).map((task, idx) => {
      if (idx === taskIndex) {
        const updatedSubTasks = (task.sub_tasks || []).map((st, stIdx) => {
          if (stIdx === subTaskIndex) {
            const updatedDetails = (st.details || []).map((d, dIdx) => {
              if (dIdx === detailIndex) {
                return { ...d, completed: !d.completed };
              }
              return d;
            });
            return { ...st, details: updatedDetails };
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
    
    await WorkOrder.update(workOrderId, { notes: updatedTasks });
  };

  const getMyTasksForWorkOrder = (wo) => {
    const userName = currentUser?.full_name || currentUser?.email;
    const myTasks = [];
    
    (wo.notes || []).forEach((task, taskIndex) => {
      // Check if task is assigned to me
      if (task.assigned_to === userName) {
        myTasks.push({ type: 'task', task, taskIndex, workOrderId: wo.id });
      }
      
      // Check sub-tasks
      (task.sub_tasks || []).forEach((st, stIndex) => {
        if (st.assigned_to === userName) {
          myTasks.push({ type: 'subtask', task, taskIndex, subTask: st, subTaskIndex: stIndex, workOrderId: wo.id });
        }
        
        // Check details
        (st.details || []).forEach((d, dIndex) => {
          if (d.assigned_to === userName) {
            myTasks.push({ type: 'detail', task, taskIndex, subTask: st, subTaskIndex: stIndex, detail: d, detailIndex: dIndex, workOrderId: wo.id });
          }
        });
      });
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

  return (
    <div className="min-h-screen p-6">
      <div className="w-full">
        {/* Header */}
        <div className="clay-card p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
              <User className="w-6 h-6 text-purple-700" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">My Workflow</h1>
              <p className="text-gray-500 mt-1">Tasks and jobs assigned to {userName} - {workOrders.length} items</p>
            </div>
          </div>
        </div>

        {/* Spreadsheet Table */}
        <div className="clay-card p-4 w-full">
          <table className="w-full border-collapse" style={{ fontSize: '16px', tableLayout: 'fixed' }}>
            <thead className="bg-gray-100">
              <tr className="border-b">
                <th className="px-3 py-4 border-r text-center font-bold text-gray-700" style={{ width: '50px' }}>#</th>
                <th className="px-3 py-4 border-r text-left font-bold text-gray-700" style={{ width: '200px' }}>Customer</th>
                <th className="px-3 py-4 border-r text-left font-bold text-gray-700" style={{ width: '120px' }}>Stage</th>
                <th className="px-3 py-4 border-r text-left font-bold text-gray-700" style={{ width: '120px' }}>Due Date</th>
                <th className="px-3 py-4 text-left font-bold text-gray-700">My Assigned Tasks</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo, index) => {
                const myTasks = getMyTasksForWorkOrder(wo);
                const isAssignedToJob = wo.assigned_to === userName;
                
                return (
                  <tr 
                    key={wo.id} 
                    className="border-b hover:bg-gray-50"
                  >
                    {/* Row Number */}
                    <td className="px-3 py-3 border-r text-center font-bold text-gray-600 text-lg">
                      {index + 1}
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
                      {wo.title && <p className="text-xs text-gray-500 mt-1 truncate">{wo.title}</p>}
                      {wo.asap && <Badge className="bg-red-600 text-white text-xs mt-1">ASAP</Badge>}
                    </td>

                    {/* Stage */}
                    <td className="px-3 py-3 border-r">
                      <Badge style={{ backgroundColor: stageColors[wo.current_stage] }} className="text-xs font-medium">
                        {stageDisplayNames[wo.current_stage]}
                      </Badge>
                    </td>

                    {/* Due Date */}
                    <td className="px-3 py-3 border-r">
                      <span className="text-base font-medium">
                        {wo.due_date ? format(parseLocalDate(wo.due_date), "MM/dd/yy") : "-"}
                      </span>
                    </td>

                    {/* My Assigned Tasks */}
                    <td className="px-3 py-3">
                      <div className="space-y-2">
                        {isAssignedToJob && (
                          <div className="text-sm text-purple-700 font-medium flex items-center gap-2 bg-purple-50 px-2 py-1 rounded">
                            <User className="w-3 h-3" />
                            Assigned to entire job
                          </div>
                        )}
                        {myTasks.map((item, idx) => (
                          <div 
                            key={idx} 
                            className={`flex items-center gap-2 p-2 rounded border ${
                              (item.type === 'task' && item.task.completed) ||
                              (item.type === 'subtask' && item.subTask.completed) ||
                              (item.type === 'detail' && item.detail.completed)
                                ? 'bg-green-50 border-green-200' 
                                : 'bg-white border-gray-200'
                            }`}
                          >
                            {item.type === 'task' && (
                              <>
                                <Checkbox
                                  checked={item.task.completed}
                                  onCheckedChange={() => toggleTaskComplete(wo.id, item.taskIndex)}
                                  disabled={!isRegistered}
                                  className="h-4 w-4"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm ${item.task.completed ? 'line-through text-gray-500' : 'font-medium'}`}>
                                    {item.task.text}
                                  </p>
                                  <p className="text-xs text-gray-400">Task</p>
                                </div>
                              </>
                            )}
                            {item.type === 'subtask' && (
                              <>
                                <Checkbox
                                  checked={item.subTask.completed}
                                  onCheckedChange={() => toggleSubTaskComplete(wo.id, item.taskIndex, item.subTaskIndex)}
                                  disabled={!isRegistered}
                                  className="h-4 w-4"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm ${item.subTask.completed ? 'line-through text-gray-500' : 'font-medium'}`}>
                                    {item.subTask.text}
                                  </p>
                                  <p className="text-xs text-gray-400">Sub-task of: {item.task.text}</p>
                                </div>
                              </>
                            )}
                            {item.type === 'detail' && (
                              <>
                                <Checkbox
                                  checked={item.detail.completed}
                                  onCheckedChange={() => toggleDetailComplete(wo.id, item.taskIndex, item.subTaskIndex, item.detailIndex)}
                                  disabled={!isRegistered}
                                  className="h-4 w-4"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm ${item.detail.completed ? 'line-through text-gray-500' : 'font-medium'}`}>
                                    {item.detail.text}
                                  </p>
                                  <p className="text-xs text-gray-400">Detail: {item.subTask.text}</p>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                        {!isAssignedToJob && myTasks.length === 0 && (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {workOrders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-12 text-center text-gray-500 text-lg">
                    <User className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                    <p className="font-semibold">No tasks assigned to you</p>
                    <p className="text-sm mt-2">When tasks are assigned to you, they'll appear here.</p>
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
    </div>
  );
}