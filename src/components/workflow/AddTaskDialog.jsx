import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ChevronDown, ChevronRight, Loader2, CheckCircle2, User, Briefcase } from "lucide-react";
import MultiUserSelectInline from "@/components/shared/MultiUserSelectInline";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

export default function AddTaskDialog({ isOpen, onClose }) {
  const [users, setUsers] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Task form state
  const [taskText, setTaskText] = useState("");
  const [assignedTo, setAssignedTo] = useState([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState("");
  const [subTasks, setSubTasks] = useState([]);
  const [expandedSubTasks, setExpandedSubTasks] = useState({});

  useEffect(() => {
    if (isOpen) {
      loadData();
      resetForm();
    }
  }, [isOpen]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [usersData, workOrdersData] = await Promise.all([
        AuthorizedEmail.list(),
        WorkOrder.filter({ completed: false, deleted: { $ne: true } })
      ]);
      setUsers(usersData);
      setWorkOrders(workOrdersData.sort((a, b) => (a.client_name || '').localeCompare(b.client_name || '')));
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  const resetForm = () => {
    setTaskText("");
    setAssignedTo([]);
    setSelectedWorkOrder("");
    setSubTasks([]);
    setExpandedSubTasks({});
    setSaveSuccess(false);
  };

  const addSubTask = () => {
    const newId = `st_${Date.now()}`;
    setSubTasks([...subTasks, { id: newId, text: "", assigned_to: [], details: [] }]);
    setExpandedSubTasks(prev => ({ ...prev, [newId]: true }));
  };

  const updateSubTask = (id, updates) => {
    setSubTasks(subTasks.map(st => st.id === id ? { ...st, ...updates } : st));
  };

  const removeSubTask = (id) => {
    setSubTasks(subTasks.filter(st => st.id !== id));
  };

  const addDetail = (subTaskId) => {
    setSubTasks(subTasks.map(st => {
      if (st.id === subTaskId) {
        return {
          ...st,
          details: [...(st.details || []), { id: `d_${Date.now()}`, text: "", assigned_to: [] }]
        };
      }
      return st;
    }));
  };

  const updateDetail = (subTaskId, detailId, updates) => {
    setSubTasks(subTasks.map(st => {
      if (st.id === subTaskId) {
        return {
          ...st,
          details: st.details.map(d => d.id === detailId ? { ...d, ...updates } : d)
        };
      }
      return st;
    }));
  };

  const removeDetail = (subTaskId, detailId) => {
    setSubTasks(subTasks.map(st => {
      if (st.id === subTaskId) {
        return {
          ...st,
          details: st.details.filter(d => d.id !== detailId)
        };
      }
      return st;
    }));
  };

  const toggleSubTaskExpanded = (id) => {
    setExpandedSubTasks(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSave = async () => {
    if (!taskText.trim() || !selectedWorkOrder) {
      alert("Please enter a task and select a work order.");
      return;
    }

    setIsSaving(true);
    try {
      const wo = workOrders.find(w => w.id === selectedWorkOrder);
      if (!wo) return;

      // Build the new task structure
      const newTask = {
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: taskText.trim(),
        timestamp: new Date().toISOString(),
        completed: false,
        assigned_to: assignedTo || [],
        sub_tasks: subTasks
          .filter(st => st.text.trim())
          .map(st => ({
            text: st.text.trim(),
            completed: false,
            assigned_to: st.assigned_to || [],
            details: (st.details || [])
              .filter(d => d.text.trim())
              .map(d => ({
                text: d.text.trim(),
                completed: false,
                assigned_to: d.assigned_to || []
              }))
          }))
      };

      // Add to work order's notes array
      const updatedNotes = [...(wo.notes || []), newTask];
      await WorkOrder.update(selectedWorkOrder, { notes: updatedNotes });

      setSaveSuccess(true);
      setTimeout(() => {
        resetForm();
        setSaveSuccess(false);
      }, 1500);
    } catch (error) {
      console.error("Error saving task:", error);
      alert("Failed to save task. Please try again.");
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={() => {}} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogContent className="clay-card border-none">
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
      <DialogContent className="clay-card border-none max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" />
            Add New Task
          </DialogTitle>
        </DialogHeader>

        {saveSuccess ? (
          <div className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
            <h3 className="text-lg font-bold text-green-700">Task Added Successfully!</h3>
            <p className="text-gray-500 mt-2">Add another task or close the dialog.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Work Order Selection */}
            <div>
              <Label className="text-sm font-medium mb-2 block flex items-center gap-1">
                <Briefcase className="w-4 h-4" />
                Select Work Order *
              </Label>
              <Select value={selectedWorkOrder} onValueChange={setSelectedWorkOrder}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Choose a work order..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {workOrders.map(wo => (
                    <SelectItem key={wo.id} value={wo.id}>
                      <span className="font-medium">{wo.client_name}</span>
                      {wo.title && <span className="text-gray-500 ml-2">- {wo.title}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Main Task */}
            <div className="clay-card p-4 bg-blue-50/50">
              <Label className="text-sm font-bold mb-2 block text-blue-800">Main Task *</Label>
              <Textarea
                value={taskText}
                onChange={(e) => setTaskText(e.target.value)}
                placeholder="Enter task description..."
                className="min-h-[80px] mb-3"
              />
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" />
                <Label className="text-sm">Assign to:</Label>
                <MultiUserSelectInline
                  users={users}
                  selectedUsers={assignedTo}
                  onSelectionChange={setAssignedTo}
                  placeholder="Select users..."
                  className="h-8 w-48"
                />
              </div>
            </div>

            {/* Sub-Tasks */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-bold">Sub-Tasks</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSubTask}
                  className="h-7 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Sub-Task
                </Button>
              </div>

              <div className="space-y-2">
                {subTasks.map((st, index) => (
                  <div key={st.id} className="clay-card p-3 bg-orange-50/50 border-l-4 border-orange-400">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSubTaskExpanded(st.id)}
                        className="p-1 hover:bg-orange-100 rounded mt-1"
                      >
                        {expandedSubTasks[st.id] ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold text-orange-700 bg-orange-200 px-2 py-0.5 rounded">
                            Sub-Task {index + 1}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSubTask(st.id)}
                            className="h-6 w-6 p-0 text-red-500 ml-auto"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <Input
                          value={st.text}
                          onChange={(e) => updateSubTask(st.id, { text: e.target.value })}
                          placeholder="Sub-task description..."
                          className="mb-2 h-8 text-sm"
                        />
                        <div className="flex items-center gap-2">
                          <User className="w-3 h-3 text-gray-400" />
                          <MultiUserSelectInline
                            users={users}
                            selectedUsers={Array.isArray(st.assigned_to) ? st.assigned_to : (st.assigned_to ? [st.assigned_to] : [])}
                            onSelectionChange={(val) => updateSubTask(st.id, { assigned_to: val })}
                            placeholder="Assign..."
                            className="h-7 w-40"
                          />
                        </div>

                        {/* Details under sub-task */}
                        {expandedSubTasks[st.id] && (
                          <div className="mt-3 ml-4 border-l-2 border-purple-300 pl-3 space-y-2">
                            {st.details?.map((detail, dIndex) => (
                              <div key={detail.id} className="bg-purple-50 p-2 rounded">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium text-purple-700 bg-purple-200 px-1.5 py-0.5 rounded">
                                    Detail {dIndex + 1}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeDetail(st.id, detail.id)}
                                    className="h-5 w-5 p-0 text-red-500 ml-auto"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </Button>
                                </div>
                                <Input
                                  value={detail.text}
                                  onChange={(e) => updateDetail(st.id, detail.id, { text: e.target.value })}
                                  placeholder="Detail description..."
                                  className="h-7 text-xs mb-1"
                                />
                                <MultiUserSelectInline
                                  users={users}
                                  selectedUsers={Array.isArray(detail.assigned_to) ? detail.assigned_to : (detail.assigned_to ? [detail.assigned_to] : [])}
                                  onSelectionChange={(val) => updateDetail(st.id, detail.id, { assigned_to: val })}
                                  placeholder="Assign..."
                                  className="h-6 w-36"
                                />
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => addDetail(st.id)}
                              className="h-6 text-xs text-purple-600"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Add Detail
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {subTasks.length === 0 && (
                  <div className="text-center py-4 text-gray-400 text-sm border-2 border-dashed rounded-lg">
                    No sub-tasks added. Click "Add Sub-Task" to create one.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {!saveSuccess && (
            <Button
              onClick={handleSave}
              disabled={isSaving || !taskText.trim() || !selectedWorkOrder}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add Task
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}