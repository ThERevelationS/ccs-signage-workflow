import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ChevronDown, ChevronRight, User, Calendar, ClipboardList, Link as LinkIcon } from "lucide-react";
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
  const [expandedCards, setExpandedCards] = useState({});

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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="clay-card p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
              <User className="w-6 h-6 text-purple-700" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">My Workflow</h1>
              <p className="text-gray-500 mt-1">Tasks and jobs assigned to {userName}</p>
            </div>
          </div>
        </div>

        {/* Work Orders with My Tasks */}
        <div className="space-y-4">
          {workOrders.map(wo => {
            const myTasks = getMyTasksForWorkOrder(wo);
            const isExpanded = expandedCards[wo.id] !== false; // Default to expanded
            const isAssignedToJob = wo.assigned_to === userName;
            
            return (
              <div key={wo.id} className="clay-card overflow-hidden">
                {/* Header */}
                <div 
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedCards(prev => ({ ...prev, [wo.id]: !isExpanded }))}
                  style={{ background: `linear-gradient(135deg, ${stageColors[wo.current_stage]}40 0%, white 100%)` }}
                >
                  <button className="p-1">
                    {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  </button>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-lg">{wo.client_name}</h3>
                      {wo.is_rider && (
                        <Badge className="rounded-full text-xs" style={{ background: 'linear-gradient(135deg, #FFD6E8 0%, #E0D4F7 100%)', color: '#7C3AED' }}>
                          Rider
                        </Badge>
                      )}
                      {wo.asap && <Badge className="bg-red-600 text-white text-xs">ASAP</Badge>}
                    </div>
                    <p className="text-sm text-gray-600">{wo.title}</p>
                  </div>
                  
                  <Badge style={{ backgroundColor: stageColors[wo.current_stage] }} className="text-xs">
                    {stageDisplayNames[wo.current_stage]}
                  </Badge>
                  
                  {wo.due_date && (
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      {format(parseLocalDate(wo.due_date), "MMM d")}
                    </div>
                  )}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setSelectedWorkOrder(wo); }}
                    className="flex items-center gap-1"
                  >
                    <LinkIcon className="w-4 h-4" />
                    Details
                  </Button>
                </div>
                
                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-6 pb-4 border-t">
                    {isAssignedToJob && (
                      <div className="mt-3 mb-2 text-sm text-purple-700 font-medium flex items-center gap-2">
                        <User className="w-4 h-4" />
                        You are assigned to this job
                      </div>
                    )}
                    
                    {myTasks.length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <ClipboardList className="w-4 h-4" />
                          My Tasks ({myTasks.length})
                        </h4>
                        <div className="space-y-2">
                          {myTasks.map((item, idx) => (
                            <div 
                              key={idx} 
                              className={`p-3 rounded-lg border ${
                                item.type === 'task' && item.task.completed ? 'bg-green-50 border-green-200' :
                                item.type === 'subtask' && item.subTask.completed ? 'bg-green-50 border-green-200' :
                                item.type === 'detail' && item.detail.completed ? 'bg-green-50 border-green-200' :
                                'bg-white border-gray-200'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {item.type === 'task' && (
                                  <>
                                    <Checkbox
                                      checked={item.task.completed}
                                      onCheckedChange={() => toggleTaskComplete(wo.id, item.taskIndex)}
                                      disabled={!isRegistered}
                                    />
                                    <div className="flex-1">
                                      <p className={`font-medium ${item.task.completed ? 'line-through text-gray-500' : ''}`}>
                                        {item.task.text}
                                      </p>
                                      <p className="text-xs text-gray-400">
                                        Task • {format(new Date(item.task.timestamp), "MMM d")}
                                      </p>
                                    </div>
                                  </>
                                )}
                                
                                {item.type === 'subtask' && (
                                  <>
                                    <Checkbox
                                      checked={item.subTask.completed}
                                      onCheckedChange={() => toggleSubTaskComplete(wo.id, item.taskIndex, item.subTaskIndex)}
                                      disabled={!isRegistered}
                                    />
                                    <div className="flex-1">
                                      <p className={`font-medium ${item.subTask.completed ? 'line-through text-gray-500' : ''}`}>
                                        {item.subTask.text}
                                      </p>
                                      <p className="text-xs text-gray-400">
                                        Sub-task of: {item.task.text}
                                      </p>
                                    </div>
                                  </>
                                )}
                                
                                {item.type === 'detail' && (
                                  <>
                                    <Checkbox
                                      checked={item.detail.completed}
                                      onCheckedChange={() => toggleDetailComplete(wo.id, item.taskIndex, item.subTaskIndex, item.detailIndex)}
                                      disabled={!isRegistered}
                                    />
                                    <div className="flex-1">
                                      <p className={`font-medium ${item.detail.completed ? 'line-through text-gray-500' : ''}`}>
                                        {item.detail.text}
                                      </p>
                                      <p className="text-xs text-gray-400">
                                        Detail of: {item.subTask.text} → {item.task.text}
                                      </p>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {!isAssignedToJob && myTasks.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-4">
                        No specific tasks assigned
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          
          {workOrders.length === 0 && (
            <div className="clay-card p-12 text-center">
              <User className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-600">No tasks assigned to you</h3>
              <p className="text-gray-400 mt-2">When tasks are assigned to you, they'll appear here.</p>
            </div>
          )}
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