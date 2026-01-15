import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, User, Link as LinkIcon, Plus, X, Check, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { format } from "date-fns";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";

const AuthorizedEmail = base44.entities.AuthorizedEmail;

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
  const [allUsers, setAllUsers] = useState([]);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [addingSubTaskFor, setAddingSubTaskFor] = useState(null);
  const [newSubTaskText, setNewSubTaskText] = useState("");
  const [newSubTaskAssignedTo, setNewSubTaskAssignedTo] = useState("");
  const [addingDetailFor, setAddingDetailFor] = useState(null);
  const [newDetailText, setNewDetailText] = useState("");
  const [newDetailAssignedTo, setNewDetailAssignedTo] = useState("");

  useEffect(() => {
    if (currentUser) {
      loadMyWorkOrders();
      loadUsers();
    }
  }, [currentUser]);

  const loadUsers = async () => {
    const users = await AuthorizedEmail.list();
    setAllUsers(users);
  };

  const loadMyWorkOrders = async () => {
    setIsLoading(true);
    try {
      const allOrders = await WorkOrder.filter({ completed: false, deleted: { $ne: true } });
      
      const userName = currentUser?.full_name || currentUser?.email;
      
      // Find work orders where user has tasks assigned to them (in notes array)
      const myOrders = allOrders.filter(wo => {
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
    setNewSubTaskAssignedTo("");
    setAddingSubTaskFor(null);
    await WorkOrder.update(workOrderId, { notes: updatedTasks });
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
    await WorkOrder.update(workOrderId, { notes: updatedTasks });
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
    setNewDetailAssignedTo("");
    setAddingDetailFor(null);
    await WorkOrder.update(workOrderId, { notes: updatedTasks });
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
          <table className="w-full border-collapse" style={{ fontSize: '16px' }}>
            <thead className="bg-gray-100">
              <tr className="border-b">
                <th className="px-3 py-4 border-r text-center font-bold text-gray-700" style={{ width: '50px' }}>#</th>
                <th className="px-3 py-4 border-r text-left font-bold text-gray-700">Customer</th>
                <th className="px-3 py-4 border-r text-left font-bold text-gray-700" style={{ width: '120px' }}>Stage</th>
                <th className="px-3 py-4 border-r text-left font-bold text-gray-700" style={{ width: '120px' }}>Due Date</th>
                <th className="px-3 py-4 text-left font-bold text-gray-700">My Assigned Tasks</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo, index) => {
                const myTasks = getMyTasksForWorkOrder(wo);
                
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
                        {myTasks.map((item, idx) => {
                          const taskKey = `${wo.id}-${item.taskIndex}`;
                          const isExpanded = expandedTasks[taskKey] !== false;
                          
                          return (
                            <div key={idx} className="group">
                              {item.type === 'task' && (
                                <div className={`p-2 rounded border ${item.task.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => setExpandedTasks(prev => ({ ...prev, [taskKey]: !isExpanded }))}>
                                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    </button>
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
                                    </div>
                                  </div>
                                  
                                  {isExpanded && (
                                    <div className="ml-8 mt-2 space-y-1">
                                      {/* Show all sub-tasks */}
                                      {(item.task.sub_tasks || []).map((st, stIdx) => (
                                        <div key={stIdx} className="group/subtask">
                                          <div className="flex items-center gap-2 text-xs p-1 rounded hover:bg-gray-50">
                                            <Checkbox
                                              checked={st.completed}
                                              onCheckedChange={() => toggleSubTaskComplete(wo.id, item.taskIndex, stIdx)}
                                              className="h-3 w-3"
                                            />
                                            <span className={st.completed ? "line-through text-gray-400" : "text-gray-600"}>{st.text}</span>
                                            {st.assigned_to && <Badge variant="outline" className="text-[10px] text-blue-600 px-1 py-0">→ {st.assigned_to}</Badge>}
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteSubTask(wo.id, item.taskIndex, stIdx)} className="h-4 w-4 ml-auto opacity-0 group-hover/subtask:opacity-100">
                                              <Trash2 className="w-2 h-2 text-red-500" />
                                            </Button>
                                          </div>
                                          {/* Details */}
                                          {(st.details || []).map((d, dIdx) => (
                                            <div key={dIdx} className="flex items-center gap-2 ml-5 text-xs group/detail">
                                              <Checkbox checked={d.completed} onCheckedChange={() => toggleDetailComplete(wo.id, item.taskIndex, stIdx, dIdx)} className="h-2.5 w-2.5" />
                                              <span className={d.completed ? "line-through text-gray-400" : "text-gray-500"}>{d.text}</span>
                                              {d.assigned_to && <Badge variant="outline" className="text-[9px] text-blue-600 px-1 py-0">→ {d.assigned_to}</Badge>}
                                              <Button variant="ghost" size="icon" onClick={() => handleDeleteDetail(wo.id, item.taskIndex, stIdx, dIdx)} className="h-3 w-3 ml-auto opacity-0 group-hover/detail:opacity-100">
                                                <X className="w-2 h-2 text-red-500" />
                                              </Button>
                                            </div>
                                          ))}
                                          {/* Add Detail */}
                                          {addingDetailFor?.woId === wo.id && addingDetailFor?.taskIndex === item.taskIndex && addingDetailFor?.subTaskIndex === stIdx ? (
                                            <div className="ml-5 mt-1 space-y-1">
                                              <Input value={newDetailText} onChange={(e) => setNewDetailText(e.target.value)} placeholder="Detail..." className="h-5 text-xs" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleAddDetail(wo.id, item.taskIndex, stIdx); if (e.key === 'Escape') { setAddingDetailFor(null); setNewDetailText(""); }}} />
                                              <Select value={newDetailAssignedTo} onValueChange={setNewDetailAssignedTo}>
                                                <SelectTrigger className="h-5 text-xs"><SelectValue placeholder="Assign to..." /></SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value={null}>Unassigned</SelectItem>
                                                  {allUsers.map(u => <SelectItem key={u.id} value={u.full_name || u.email}>{u.full_name || u.email}</SelectItem>)}
                                                </SelectContent>
                                              </Select>
                                              <div className="flex gap-1">
                                                <Button size="sm" onClick={() => handleAddDetail(wo.id, item.taskIndex, stIdx)} className="h-5 px-2"><Check className="w-3 h-3" /></Button>
                                                <Button size="sm" variant="ghost" onClick={() => { setAddingDetailFor(null); setNewDetailText(""); }} className="h-5 px-2"><X className="w-3 h-3" /></Button>
                                              </div>
                                            </div>
                                          ) : (
                                            <Button variant="ghost" size="sm" onClick={() => setAddingDetailFor({ woId: wo.id, taskIndex: item.taskIndex, subTaskIndex: stIdx })} className="ml-5 h-4 px-1 text-xs opacity-0 group-hover/subtask:opacity-100"><Plus className="w-2 h-2 mr-0.5" />Detail</Button>
                                          )}
                                        </div>
                                      ))}
                                      {/* Add Sub-task */}
                                      {addingSubTaskFor?.woId === wo.id && addingSubTaskFor?.taskIndex === item.taskIndex ? (
                                        <div className="mt-1 space-y-1">
                                          <Input value={newSubTaskText} onChange={(e) => setNewSubTaskText(e.target.value)} placeholder="Sub-task..." className="h-6 text-xs" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubTask(wo.id, item.taskIndex); if (e.key === 'Escape') { setAddingSubTaskFor(null); setNewSubTaskText(""); }}} />
                                          <Select value={newSubTaskAssignedTo} onValueChange={setNewSubTaskAssignedTo}>
                                            <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="Assign to..." /></SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value={null}>Unassigned</SelectItem>
                                              {allUsers.map(u => <SelectItem key={u.id} value={u.full_name || u.email}>{u.full_name || u.email}</SelectItem>)}
                                            </SelectContent>
                                          </Select>
                                          <div className="flex gap-1">
                                            <Button size="sm" onClick={() => handleAddSubTask(wo.id, item.taskIndex)} className="h-6 px-2"><Check className="w-3 h-3" /></Button>
                                            <Button size="sm" variant="ghost" onClick={() => { setAddingSubTaskFor(null); setNewSubTaskText(""); }} className="h-6 px-2"><X className="w-3 h-3" /></Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <Button variant="ghost" size="sm" onClick={() => setAddingSubTaskFor({ woId: wo.id, taskIndex: item.taskIndex })} className="h-5 px-2 text-xs opacity-0 group-hover:opacity-100"><Plus className="w-2 h-2 mr-1" />Sub-task</Button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              {item.type === 'subtask' && (
                                <div className={`flex items-center gap-2 p-2 rounded border ${item.subTask.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                                  <Checkbox checked={item.subTask.completed} onCheckedChange={() => toggleSubTaskComplete(wo.id, item.taskIndex, item.subTaskIndex)} disabled={!isRegistered} className="h-4 w-4" />
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm ${item.subTask.completed ? 'line-through text-gray-500' : 'font-medium'}`}>{item.subTask.text}</p>
                                    <p className="text-xs text-gray-400">Sub-task of: {item.task.text}</p>
                                  </div>
                                </div>
                              )}
                              {item.type === 'detail' && (
                                <div className={`flex items-center gap-2 p-2 rounded border ${item.detail.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                                  <Checkbox checked={item.detail.completed} onCheckedChange={() => toggleDetailComplete(wo.id, item.taskIndex, item.subTaskIndex, item.detailIndex)} disabled={!isRegistered} className="h-4 w-4" />
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm ${item.detail.completed ? 'line-through text-gray-500' : 'font-medium'}`}>{item.detail.text}</p>
                                    <p className="text-xs text-gray-400">Detail: {item.subTask.text}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {myTasks.length === 0 && (
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