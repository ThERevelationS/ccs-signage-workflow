import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Plus, Loader2, X, ChevronDown, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";

const AuthorizedEmail = base44.entities.AuthorizedEmail;
const WorkOrder = base44.entities.WorkOrder;

const STAGES = [
  { value: "estimating", label: "Estimating" },
  { value: "sales", label: "Sales" },
  { value: "permitting", label: "Permitting" },
  { value: "design", label: "Design" },
  { value: "production", label: "Production" },
  { value: "fabrication", label: "Fabrication" },
  { value: "installation", label: "Installation" }
];

// Task Item Component
function TaskItem({ task, expanded, onToggleExpand, onRemove, onAddSubTask, onRemoveSubTask, onAddDetail, onRemoveDetail }) {
  const [newSubTaskText, setNewSubTaskText] = useState("");
  const [addingSubTask, setAddingSubTask] = useState(false);
  const [addingDetailFor, setAddingDetailFor] = useState(null);
  const [newDetailText, setNewDetailText] = useState("");

  return (
    <div className="border-b last:border-b-0">
      <div className="flex items-center gap-2 p-2 hover:bg-gray-50">
        <button onClick={onToggleExpand} className="p-0.5">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        <span className="flex-1 text-sm">{task.text}</span>
        <span className="text-xs text-gray-400">
          {task.sub_tasks.length > 0 && `${task.sub_tasks.length} sub`}
        </span>
        <button onClick={onRemove} className="p-1 hover:bg-red-100 rounded">
          <X className="w-3 h-3 text-red-500" />
        </button>
      </div>

      {expanded && (
        <div className="pl-6 pb-2 space-y-1">
          {/* Sub-tasks */}
          {task.sub_tasks.map((subTask) => (
            <div key={subTask.id} className="ml-2">
              <div className="flex items-center gap-2 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                <span className="flex-1 text-xs text-gray-700">{subTask.text}</span>
                <button
                  onClick={() => setAddingDetailFor(addingDetailFor === subTask.id ? null : subTask.id)}
                  className="text-xs text-blue-500 hover:underline"
                >
                  +detail
                </button>
                <button onClick={() => onRemoveSubTask(subTask.id)} className="p-0.5 hover:bg-red-100 rounded">
                  <X className="w-2.5 h-2.5 text-red-500" />
                </button>
              </div>

              {/* Details */}
              {subTask.details && subTask.details.length > 0 && (
                <div className="ml-4 space-y-0.5">
                  {subTask.details.map((detail, idx) => (
                    <div key={idx} className="flex items-center gap-2 py-0.5">
                      <div className="w-1 h-1 rounded-full bg-gray-300" />
                      <span className="flex-1 text-xs text-gray-500">{detail.text}</span>
                      <button onClick={() => onRemoveDetail(subTask.id, idx)} className="p-0.5 hover:bg-red-100 rounded">
                        <X className="w-2 h-2 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Detail Input */}
              {addingDetailFor === subTask.id && (
                <div className="ml-4 flex gap-1 mt-1">
                  <Input
                    value={newDetailText}
                    onChange={(e) => setNewDetailText(e.target.value)}
                    placeholder="Detail..."
                    className="h-6 text-xs flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newDetailText.trim()) {
                        onAddDetail(subTask.id, newDetailText);
                        setNewDetailText("");
                      }
                      if (e.key === 'Escape') {
                        setAddingDetailFor(null);
                        setNewDetailText("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => {
                      if (newDetailText.trim()) {
                        onAddDetail(subTask.id, newDetailText);
                        setNewDetailText("");
                      }
                    }}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}

          {/* Add Sub-task */}
          {addingSubTask ? (
            <div className="flex gap-1 ml-2 mt-1">
              <Input
                value={newSubTaskText}
                onChange={(e) => setNewSubTaskText(e.target.value)}
                placeholder="Sub-task..."
                className="h-6 text-xs flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSubTaskText.trim()) {
                    onAddSubTask(newSubTaskText);
                    setNewSubTaskText("");
                  }
                  if (e.key === 'Escape') {
                    setAddingSubTask(false);
                    setNewSubTaskText("");
                  }
                }}
              />
              <Button
                size="sm"
                className="h-6 px-2"
                onClick={() => {
                  if (newSubTaskText.trim()) {
                    onAddSubTask(newSubTaskText);
                    setNewSubTaskText("");
                  }
                }}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setAddingSubTask(true)}
              className="ml-2 text-xs text-blue-500 hover:underline"
            >
              + Add sub-task
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function CreateRiderDialog({ isOpen, onClose, parentWorkOrder, onCreated }) {
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState(parentWorkOrder?.current_stage || "permitting");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [tasks, setTasks] = useState([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [users, setUsers] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState({});

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      // Reset form
      setTitle(`${parentWorkOrder?.title || ''} - Rider`);
      setStage(parentWorkOrder?.current_stage || "permitting");
      setAssignedTo("");
      setDueDate("");
      setNotes("");
      setTasks([]);
      setNewTaskText("");
      setExpandedTasks({});
    }
  }, [isOpen, parentWorkOrder]);

  const addTask = () => {
    if (!newTaskText.trim()) return;
    setTasks([...tasks, {
      id: Date.now(),
      text: newTaskText.trim(),
      sub_tasks: []
    }]);
    setNewTaskText("");
  };

  const removeTask = (taskId) => {
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  const addSubTask = (taskId, subTaskText) => {
    if (!subTaskText.trim()) return;
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          sub_tasks: [...t.sub_tasks, {
            id: Date.now(),
            text: subTaskText.trim(),
            details: []
          }]
        };
      }
      return t;
    }));
  };

  const removeSubTask = (taskId, subTaskId) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          sub_tasks: t.sub_tasks.filter(st => st.id !== subTaskId)
        };
      }
      return t;
    }));
  };

  const addDetail = (taskId, subTaskId, detailText) => {
    if (!detailText.trim()) return;
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          sub_tasks: t.sub_tasks.map(st => {
            if (st.id === subTaskId) {
              return {
                ...st,
                details: [...(st.details || []), { text: detailText.trim(), completed: false }]
              };
            }
            return st;
          })
        };
      }
      return t;
    }));
  };

  const removeDetail = (taskId, subTaskId, detailIndex) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          sub_tasks: t.sub_tasks.map(st => {
            if (st.id === subTaskId) {
              return {
                ...st,
                details: st.details.filter((_, i) => i !== detailIndex)
              };
            }
            return st;
          })
        };
      }
      return t;
    }));
  };

  const toggleTaskExpanded = (taskId) => {
    setExpandedTasks(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const loadUsers = async () => {
    const usersData = await AuthorizedEmail.list();
    setUsers(usersData);
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    
    setIsCreating(true);
    try {
      // Convert tasks to the notes format expected by WorkOrder
      const formattedNotes = tasks.map(task => ({
        text: task.text,
        timestamp: new Date().toISOString(),
        created_by: "Rider Creation",
        completed: false,
        sub_tasks: task.sub_tasks.map(st => ({
          text: st.text,
          completed: false,
          details: (st.details || []).map(d => ({ text: d.text, completed: false }))
        }))
      }));

      const riderData = {
        title: title.trim(),
        client_name: parentWorkOrder?.client_name || "",
        description: notes || parentWorkOrder?.description || "",
        is_rider: true,
        parent_work_order_id: parentWorkOrder?.id,
        current_stage: stage,
        rider_stage: stage,
        assigned_to: assignedTo || "",
        due_date: dueDate || "",
        notes: formattedNotes
      };

      const rider = await WorkOrder.create(riderData);
      
      if (onCreated) {
        onCreated(rider);
      }
      onClose();
    } catch (error) {
      console.error("Error creating rider:", error);
    }
    setIsCreating(false);
  };

  const parseLocalDate = (dateString) => {
    if (!dateString) return undefined;
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-purple-600" />
            Create Rider
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Title */}
          <div>
            <Label>Rider Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter rider title..."
              className="mt-1"
            />
          </div>

          {/* Parent Info */}
          <div className="bg-gray-50 p-3 rounded-lg text-sm">
            <div className="text-gray-500 text-xs mb-1">Parent Work Order</div>
            <div className="font-medium">{parentWorkOrder?.title}</div>
            <div className="text-gray-600">{parentWorkOrder?.client_name}</div>
          </div>

          {/* Stage */}
          <div>
            <Label>Assign to Page/Stage</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Assigned To */}
          <div>
            <Label>Assign to Person</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select person (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Unassigned</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.full_name || u.email}>
                    {u.full_name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Due Date */}
          <div>
            <Label>Deadline</Label>
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full mt-1 justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dueDate ? format(parseLocalDate(dueDate), "PPP") : "Select date (optional)"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={parseLocalDate(dueDate)}
                  onSelect={(date) => {
                    setDueDate(date ? format(date, "yyyy-MM-dd") : "");
                    setShowDatePicker(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Notes/Description */}
          <div>
            <Label>Description</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add description for this rider (optional)..."
              className="mt-1 min-h-16"
            />
          </div>

          {/* Tasks */}
          <div>
            <Label>Tasks</Label>
            <div className="mt-1 space-y-2">
              {/* Add Task Input */}
              <div className="flex gap-2">
                <Input
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  placeholder="Add a task..."
                  onKeyDown={(e) => e.key === 'Enter' && addTask()}
                  className="flex-1"
                />
                <Button size="sm" onClick={addTask} disabled={!newTaskText.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* Task List */}
              {tasks.length > 0 && (
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {tasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      expanded={expandedTasks[task.id]}
                      onToggleExpand={() => toggleTaskExpanded(task.id)}
                      onRemove={() => removeTask(task.id)}
                      onAddSubTask={(text) => addSubTask(task.id, text)}
                      onRemoveSubTask={(subTaskId) => removeSubTask(task.id, subTaskId)}
                      onAddDetail={(subTaskId, text) => addDetail(task.id, subTaskId, text)}
                      onRemoveDetail={(subTaskId, detailIndex) => removeDetail(task.id, subTaskId, detailIndex)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleCreate}
              disabled={isCreating || !title.trim()}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Rider
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}