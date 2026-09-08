import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { 
  Check, X, Plus, Trash2, Pencil, Save, 
  ClipboardList, FileText, Copy, Star,
  ChevronDown, ChevronRight, ArrowRight,
  Calendar as CalendarIcon, User, Loader2,
  Link as LinkIcon, ExternalLink
} from "lucide-react";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const SipChecklistTemplate = base44.entities.SipChecklistTemplate;
const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

const STAGES = [
  { value: "estimating", label: "Estimating" },
  { value: "sales", label: "Sales" },
  { value: "permitting", label: "Permitting" },
  { value: "design", label: "Design" },
  { value: "production", label: "Production" },
  { value: "fabrication", label: "Fabrication" },
  { value: "installation", label: "Installation" }
];

// Task creation popup
function TaskCreationPopup({ isOpen, onClose, onApply, workOrder, riders, users, taskTargetContext }) {
  const [taskText, setTaskText] = useState("");
  const [subTasks, setSubTasks] = useState([]);
  const [newSubTaskText, setNewSubTaskText] = useState("");
  const [addingSubTaskFor, setAddingSubTaskFor] = useState(null);
  const [newDetailText, setNewDetailText] = useState("");
  const [applyTo, setApplyTo] = useState("main"); // main, rider-{id}, new-rider
  const [expandedSubTasks, setExpandedSubTasks] = useState({});
  
  // New rider fields
  const [newRiderTitle, setNewRiderTitle] = useState("");
  const [newRiderStage, setNewRiderStage] = useState("permitting");
  const [newRiderAssignedTo, setNewRiderAssignedTo] = useState("");
  const [newRiderDueDate, setNewRiderDueDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTaskText("");
      setTaskAssignedTo("");
      setSubTasks([]);
      setNewSubTaskText("");
      setApplyTo("main");
      setNewRiderTitle(`${workOrder?.title || ''} - Rider`);
      setNewRiderStage("permitting");
      setNewRiderAssignedTo("");
      setNewRiderDueDate("");
    }
  }, [isOpen, workOrder]);

  const [newSubTaskAssignedTo, setNewSubTaskAssignedTo] = useState("");

  const addSubTask = () => {
    if (!newSubTaskText.trim()) return;
    setSubTasks([...subTasks, {
      id: Date.now(),
      text: newSubTaskText.trim(),
      assigned_to: newSubTaskAssignedTo || "",
      details: []
    }]);
    setNewSubTaskText("");
    setNewSubTaskAssignedTo("");
  };

  const removeSubTask = (id) => {
    setSubTasks(subTasks.filter(st => st.id !== id));
  };

  const addDetail = (subTaskId) => {
    if (!newDetailText.trim()) return;
    setSubTasks(subTasks.map(st => {
      if (st.id === subTaskId) {
        return {
          ...st,
          details: [...st.details, { text: newDetailText.trim(), completed: false }]
        };
      }
      return st;
    }));
    setNewDetailText("");
    setAddingSubTaskFor(null);
  };

  const removeDetail = (subTaskId, detailIndex) => {
    setSubTasks(subTasks.map(st => {
      if (st.id === subTaskId) {
        return {
          ...st,
          details: st.details.filter((_, i) => i !== detailIndex)
        };
      }
      return st;
    }));
  };

  const [taskAssignedTo, setTaskAssignedTo] = useState("");

  const handleApply = () => {
    if (!taskText.trim()) return;
    
    // Build checklist context key if applicable
    let checklistContext = null;
    if (taskTargetContext && taskTargetContext.itemId !== null && taskTargetContext.itemId !== undefined) {
      if (taskTargetContext.detailIndex !== null && taskTargetContext.detailIndex !== undefined) {
        checklistContext = `${taskTargetContext.itemId}-detail-${taskTargetContext.detailIndex}`;
      } else {
        checklistContext = `${taskTargetContext.itemId}`;
      }
    }
    
    console.log("TaskCreationPopup - taskTargetContext:", taskTargetContext, "checklistContext:", checklistContext);
    
    const task = {
      text: taskText.trim(),
      timestamp: new Date().toISOString(),
      created_by: "SIP Meeting",
      completed: false,
      assigned_to: taskAssignedTo || "",
      sub_tasks: subTasks.map(st => ({
        text: st.text,
        completed: false,
        assigned_to: st.assigned_to || "",
        details: st.details.map(d => ({
          ...d,
          assigned_to: d.assigned_to || ""
        }))
      })),
      checklist_context: checklistContext // Always include, even if null
    };
    
    console.log("TaskCreationPopup - task being created:", task);

    const newRiderData = applyTo === "new-rider" ? {
      title: newRiderTitle,
      stage: newRiderStage,
      assignedTo: newRiderAssignedTo,
      dueDate: newRiderDueDate
    } : null;

    onApply(task, applyTo, newRiderData);
    onClose();
  };

  const parseLocalDate = (dateString) => {
    if (!dateString) return undefined;
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const selectedRider = applyTo.startsWith("rider-") ? 
    riders.find(r => r.id === applyTo.replace("rider-", "")) : null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" />
            Create Task
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Context indicator */}
          {taskTargetContext && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-2">
              <span className="text-xs text-purple-600">Creating task for: </span>
              <span className="text-sm font-medium text-purple-800">{taskTargetContext.text}</span>
            </div>
          )}

          {/* Task Text */}
          <div>
            <Label>Task</Label>
            <Input
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              placeholder="Enter task description..."
              className="mt-1"
            />
          </div>

          {/* Task Assignment */}
          <div>
            <Label>Assign To (optional)</Label>
            <Select value={taskAssignedTo} onValueChange={setTaskAssignedTo}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select user..." />
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

          {/* Sub-tasks */}
          <div>
            <Label>Sub-tasks</Label>
            <div className="mt-1 space-y-2">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={newSubTaskText}
                    onChange={(e) => setNewSubTaskText(e.target.value)}
                    placeholder="Add a sub-task..."
                    onKeyDown={(e) => e.key === 'Enter' && addSubTask()}
                  />
                  <Button size="sm" onClick={addSubTask} disabled={!newSubTaskText.trim()}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <Select value={newSubTaskAssignedTo} onValueChange={setNewSubTaskAssignedTo}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Assign sub-task to (optional)" />
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

              {subTasks.length > 0 && (
                <div className="border rounded-lg divide-y">
                  {subTasks.map((subTask) => (
                    <div key={subTask.id} className="p-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedSubTasks(prev => ({ ...prev, [subTask.id]: !prev[subTask.id] }))}
                          className="p-0.5"
                        >
                          {expandedSubTasks[subTask.id] ? 
                            <ChevronDown className="w-3 h-3" /> : 
                            <ChevronRight className="w-3 h-3" />
                          }
                        </button>
                        <span className="flex-1 text-sm">{subTask.text}</span>
                        {subTask.assigned_to && (
                          <Badge variant="outline" className="text-xs text-blue-600">→ {subTask.assigned_to}</Badge>
                        )}
                        {subTask.details.length > 0 && (
                          <span className="text-xs text-gray-400">{subTask.details.length} details</span>
                        )}
                        <button onClick={() => removeSubTask(subTask.id)} className="p-1 hover:bg-red-100 rounded">
                          <X className="w-3 h-3 text-red-500" />
                        </button>
                      </div>

                      {expandedSubTasks[subTask.id] && (
                        <div className="ml-6 mt-2 space-y-1">
                          {/* Existing details */}
                          {subTask.details.map((detail, idx) => (
                            <div key={idx} className="flex items-center gap-2 py-0.5">
                              <div className="w-1 h-1 rounded-full bg-gray-400" />
                              <span className="flex-1 text-xs text-gray-600">{detail.text}</span>
                              <button onClick={() => removeDetail(subTask.id, idx)} className="p-0.5 hover:bg-red-100 rounded">
                                <X className="w-2 h-2 text-red-400" />
                              </button>
                            </div>
                          ))}

                          {/* Add detail */}
                          {addingSubTaskFor === subTask.id ? (
                            <div className="flex gap-1">
                              <Input
                                value={newDetailText}
                                onChange={(e) => setNewDetailText(e.target.value)}
                                placeholder="Detail..."
                                className="h-6 text-xs"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') addDetail(subTask.id);
                                  if (e.key === 'Escape') { setAddingSubTaskFor(null); setNewDetailText(""); }
                                }}
                              />
                              <Button size="sm" className="h-6 px-2" onClick={() => addDetail(subTask.id)}>
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAddingSubTaskFor(subTask.id)}
                              className="text-xs text-blue-500 hover:underline"
                            >
                              + Add detail
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Apply To */}
          <div>
            <Label>Apply To</Label>
            <Select value={applyTo} onValueChange={setApplyTo}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    Main Job: {workOrder?.title}
                  </div>
                </SelectItem>
                {riders.map(rider => (
                  <SelectItem key={rider.id} value={`rider-${rider.id}`}>
                    <div className="flex items-center gap-2">
                      <LinkIcon className="w-4 h-4 text-purple-600" />
                      Rider: {rider.title}
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="new-rider">
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-green-600" />
                    Create New Rider
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Selected Rider Details */}
          {selectedRider && (
            <div className="bg-purple-50 p-3 rounded-lg text-sm">
              <div className="font-medium text-purple-800 mb-1">{selectedRider.title}</div>
              <div className="text-purple-600 text-xs space-y-0.5">
                <div>Stage: {STAGES.find(s => s.value === selectedRider.current_stage)?.label || selectedRider.current_stage}</div>
                {selectedRider.assigned_to && <div>Assigned: {selectedRider.assigned_to}</div>}
                {selectedRider.due_date && <div>Due: {format(parseLocalDate(selectedRider.due_date), "MMM d, yyyy")}</div>}
                {selectedRider.notes?.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-purple-200">
                    <div className="font-medium mb-1">Existing Tasks ({selectedRider.notes.length}):</div>
                    {selectedRider.notes.slice(0, 3).map((note, i) => (
                      <div key={i} className="truncate">• {note.text}</div>
                    ))}
                    {selectedRider.notes.length > 3 && <div>+{selectedRider.notes.length - 3} more...</div>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* New Rider Fields */}
          {applyTo === "new-rider" && (
            <div className="bg-green-50 p-3 rounded-lg space-y-3">
              <div className="font-medium text-green-800 text-sm">New Rider Details</div>
              
              <div>
                <Label className="text-xs">Title</Label>
                <Input
                  value={newRiderTitle}
                  onChange={(e) => setNewRiderTitle(e.target.value)}
                  className="mt-1 h-8 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Stage</Label>
                  <Select value={newRiderStage} onValueChange={setNewRiderStage}>
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Assign To</Label>
                  <Select value={newRiderAssignedTo} onValueChange={setNewRiderAssignedTo}>
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue placeholder="Select..." />
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
              </div>

              <div>
                <Label className="text-xs">Due Date</Label>
                <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full mt-1 h-8 text-sm justify-start">
                      <CalendarIcon className="w-3 h-3 mr-2" />
                      {newRiderDueDate ? format(parseLocalDate(newRiderDueDate), "MMM d, yyyy") : "Select date..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={parseLocalDate(newRiderDueDate)}
                      onSelect={(date) => {
                        setNewRiderDueDate(date ? format(date, "yyyy-MM-dd") : "");
                        setShowDatePicker(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleApply} 
              disabled={!taskText.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              Apply Task
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Move task popup
function MoveTaskPopup({ isOpen, onClose, task, workOrder, riders, users, onMove }) {
  const [moveTo, setMoveTo] = useState("main");
  const [newRiderTitle, setNewRiderTitle] = useState("");
  const [newRiderStage, setNewRiderStage] = useState("permitting");
  const [newRiderAssignedTo, setNewRiderAssignedTo] = useState("");
  const [newRiderDueDate, setNewRiderDueDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMoveTo("main");
      setNewRiderTitle(`${workOrder?.title || ''} - Rider`);
      setNewRiderStage("permitting");
      setNewRiderAssignedTo("");
      setNewRiderDueDate("");
    }
  }, [isOpen, workOrder]);

  const parseLocalDate = (dateString) => {
    if (!dateString) return undefined;
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const handleMove = () => {
    const newRiderData = moveTo === "new-rider" ? {
      title: newRiderTitle,
      stage: newRiderStage,
      assignedTo: newRiderAssignedTo,
      dueDate: newRiderDueDate
    } : null;

    onMove(task, moveTo, newRiderData);
    onClose();
  };

  const selectedRider = moveTo.startsWith("rider-") ? 
    riders.find(r => r.id === moveTo.replace("rider-", "")) : null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="w-5 h-5 text-purple-600" />
            Move Task
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Task Preview */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="font-medium text-sm">{task?.text}</div>
            {task?.sub_tasks?.length > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                {task.sub_tasks.length} sub-task(s) will be moved with this task
              </div>
            )}
          </div>

          {/* Move To */}
          <div>
            <Label>Move To</Label>
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    Main Job: {workOrder?.title}
                  </div>
                </SelectItem>
                {riders.map(rider => (
                  <SelectItem key={rider.id} value={`rider-${rider.id}`}>
                    <div className="flex items-center gap-2">
                      <LinkIcon className="w-4 h-4 text-purple-600" />
                      Rider: {rider.title}
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="new-rider">
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-green-600" />
                    Create New Rider
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Selected Rider Details */}
          {selectedRider && (
            <div className="bg-purple-50 p-3 rounded-lg text-sm">
              <div className="font-medium text-purple-800 mb-1">{selectedRider.title}</div>
              <div className="text-purple-600 text-xs">
                Stage: {STAGES.find(s => s.value === selectedRider.current_stage)?.label}
                {selectedRider.assigned_to && ` • ${selectedRider.assigned_to}`}
              </div>
            </div>
          )}

          {/* New Rider Fields */}
          {moveTo === "new-rider" && (
            <div className="bg-green-50 p-3 rounded-lg space-y-3">
              <div className="font-medium text-green-800 text-sm">New Rider Details</div>
              
              <div>
                <Label className="text-xs">Title</Label>
                <Input
                  value={newRiderTitle}
                  onChange={(e) => setNewRiderTitle(e.target.value)}
                  className="mt-1 h-8 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Stage</Label>
                  <Select value={newRiderStage} onValueChange={setNewRiderStage}>
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Assign To</Label>
                  <Select value={newRiderAssignedTo} onValueChange={setNewRiderAssignedTo}>
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue placeholder="Select..." />
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
              </div>

              <div>
                <Label className="text-xs">Due Date</Label>
                <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full mt-1 h-8 text-sm justify-start">
                      <CalendarIcon className="w-3 h-3 mr-2" />
                      {newRiderDueDate ? format(parseLocalDate(newRiderDueDate), "MMM d, yyyy") : "Select date..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={parseLocalDate(newRiderDueDate)}
                      onSelect={(date) => {
                        setNewRiderDueDate(date ? format(date, "yyyy-MM-dd") : "");
                        setShowDatePicker(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleMove}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              Move Task
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function EnhancedSipChecklist({ 
  isOpen, 
  onClose, 
  workOrder, 
  onUpdate,
  isRegistered,
  title = "SIP Checklist",
  checklistField = "sip_checklist",
  accentColor = "blue"
}) {
  const [activeTab, setActiveTab] = useState("checklist");
  const [templates, setTemplates] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [mainTasks, setMainTasks] = useState([]);
  const [riders, setRiders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Popup states
  const [showTaskCreation, setShowTaskCreation] = useState(false);
  const [showMoveTask, setShowMoveTask] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [expandedRiders, setExpandedRiders] = useState({});

  // Checklist editing states
  const [newItemText, setNewItemText] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemText, setEditingItemText] = useState("");
  const [addingDetailFor, setAddingDetailFor] = useState(null);
  const [newDetailText, setNewDetailText] = useState("");
  const [taskTargetContext, setTaskTargetContext] = useState(null); // { itemId, detailIndex?, text }

  // Template states
  const [newTemplateName, setNewTemplateName] = useState("");
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingTemplateName, setEditingTemplateName] = useState("");

  useEffect(() => {
    if (isOpen && workOrder) {
      loadData();
    }
  }, [isOpen, workOrder]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Verify the exact current Work Order plus its complete rider set without scanning
      // the entire Work Order archive every time the checklist opens.
      const [currentRows, workOrderRiders, usersData, templatesData] = await Promise.all([
        WorkOrder.filter({ id: workOrder.id }),
        loadAllEntityRows({
          entity: WorkOrder,
          query: { parent_work_order_id: workOrder.id, is_rider: true, deleted: { $ne: true } },
          sort: "created_date",
          label: "SIP Checklist riders",
        }),
        AuthorizedEmail.list(),
        SipChecklistTemplate.list()
      ]);

      const currentWorkOrder = currentRows[0];
      if (!currentWorkOrder) {
        console.error("Could not find work order:", workOrder.id);
        setIsLoading(false);
        return;
      }
      
      setRiders(workOrderRiders);
      setUsers(usersData);
      setTemplates(templatesData);

      // Load checklist from fresh work order data
      setChecklist(currentWorkOrder[checklistField] || []);
      
      // Load main job tasks (from notes) - use fresh data
      const freshNotes = currentWorkOrder.notes || [];
      setMainTasks(freshNotes);
      
      console.log("loadData - Loaded fresh notes:", JSON.stringify(freshNotes));
      console.log("loadData - Notes with checklist_context:", freshNotes.filter(n => n.checklist_context));
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  const handleApplyTask = async (task, applyTo, newRiderData) => {
    setIsSaving(true);
    try {
      // Build the task object - keep checklist_context if it exists
      const taskToSave = { ...task };
      
      console.log("handleApplyTask - Saving task:", JSON.stringify(taskToSave));
      
      if (applyTo === "main") {
        // Fetch the LATEST work order data first to avoid overwriting
        const freshWorkOrders = await WorkOrder.filter({ id: workOrder.id });
        const freshWorkOrder = freshWorkOrders[0];
        const currentNotes = freshWorkOrder?.notes || [];
        
        // Add to main job tasks - ensure checklist_context is preserved
        const updatedTasks = [...currentNotes, taskToSave];
        
        console.log("handleApplyTask - About to save notes:", JSON.stringify(updatedTasks));
        
        await WorkOrder.update(workOrder.id, { notes: updatedTasks });
        setMainTasks(updatedTasks);
        
        console.log("handleApplyTask - Saved to main - total tasks now:", updatedTasks.length);
      } else if (applyTo.startsWith("rider-")) {
        // Add to existing rider
        const riderId = applyTo.replace("rider-", "");
        
        // Fetch fresh rider data
        const freshRiders = await WorkOrder.filter({ id: riderId });
        const freshRider = freshRiders[0];
        
        if (freshRider) {
          const updatedTasks = [...(freshRider.notes || []), taskToSave];
          await WorkOrder.update(riderId, { notes: updatedTasks });
          setRiders(riders.map(r => r.id === riderId ? { ...r, notes: updatedTasks } : r));
        }
      } else if (applyTo === "new-rider" && newRiderData) {
        // Create new rider with task
        const newRider = await WorkOrder.create({
          title: newRiderData.title,
          client_name: workOrder.client_name,
          description: workOrder.description,
          is_rider: true,
          parent_work_order_id: workOrder.id,
          current_stage: newRiderData.stage,
          rider_stage: newRiderData.stage,
          assigned_to: newRiderData.assignedTo || "",
          due_date: newRiderData.dueDate || "",
          notes: [taskToSave],
          in_pipeline: true
        });
        setRiders([...riders, newRider]);
      }
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error applying task:", error);
    }
    setIsSaving(false);
  };

  const handleMoveTask = async (task, moveTo, newRiderData, sourceType, sourceId) => {
    setIsSaving(true);
    try {
      // Remove from source
      if (sourceType === "main") {
        const updatedTasks = mainTasks.filter(t => t.text !== task.text || t.timestamp !== task.timestamp);
        await WorkOrder.update(workOrder.id, { notes: updatedTasks });
        setMainTasks(updatedTasks);
      } else if (sourceType === "rider") {
        const rider = riders.find(r => r.id === sourceId);
        if (rider) {
          const updatedTasks = (rider.notes || []).filter(t => t.text !== task.text || t.timestamp !== task.timestamp);
          await WorkOrder.update(sourceId, { notes: updatedTasks });
          setRiders(riders.map(r => r.id === sourceId ? { ...r, notes: updatedTasks } : r));
        }
      }

      // Add to destination
      if (moveTo === "main") {
        const updatedTasks = [...mainTasks.filter(t => t.text !== task.text || t.timestamp !== task.timestamp), task];
        await WorkOrder.update(workOrder.id, { notes: updatedTasks });
        setMainTasks(updatedTasks);
      } else if (moveTo.startsWith("rider-")) {
        const riderId = moveTo.replace("rider-", "");
        const rider = riders.find(r => r.id === riderId);
        if (rider) {
          const updatedTasks = [...(rider.notes || []), task];
          await WorkOrder.update(riderId, { notes: updatedTasks });
          setRiders(riders.map(r => r.id === riderId ? { ...r, notes: updatedTasks } : r));
        }
      } else if (moveTo === "new-rider" && newRiderData) {
        const newRider = await WorkOrder.create({
          title: newRiderData.title,
          client_name: workOrder.client_name,
          description: workOrder.description,
          is_rider: true,
          parent_work_order_id: workOrder.id,
          current_stage: newRiderData.stage,
          rider_stage: newRiderData.stage,
          assigned_to: newRiderData.assignedTo || "",
          due_date: newRiderData.dueDate || "",
          notes: [task],
          in_pipeline: true
        });
        setRiders([...riders, newRider]);
      }

      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error moving task:", error);
    }
    setIsSaving(false);
  };

  const toggleTaskComplete = async (taskIndex, sourceType, sourceId) => {
    if (sourceType === "main") {
      const updatedTasks = mainTasks.map((t, i) => 
        i === taskIndex ? { ...t, completed: !t.completed } : t
      );
      setMainTasks(updatedTasks);
      await WorkOrder.update(workOrder.id, { notes: updatedTasks });
    } else {
      const rider = riders.find(r => r.id === sourceId);
      if (rider) {
        const updatedTasks = (rider.notes || []).map((t, i) => 
          i === taskIndex ? { ...t, completed: !t.completed } : t
        );
        setRiders(riders.map(r => r.id === sourceId ? { ...r, notes: updatedTasks } : r));
        await WorkOrder.update(sourceId, { notes: updatedTasks });
      }
    }
  };

  const toggleChecklistItem = (itemId) => {
    setChecklist(prev => 
      prev.map(item => item.id === itemId ? { ...item, checked: !item.checked } : item)
    );
  };

  const addChecklistItem = () => {
    if (!newItemText.trim()) return;
    const newItem = {
      id: Date.now(),
      text: newItemText.trim(),
      checked: false
    };
    setChecklist(prev => [...prev, newItem]);
    setNewItemText("");
  };

  const deleteChecklistItem = (itemId) => {
    setChecklist(prev => prev.filter(item => item.id !== itemId));
  };

  const startEditItem = (item) => {
    setEditingItemId(item.id);
    setEditingItemText(item.text);
  };

  const saveEditItem = () => {
    if (!editingItemText.trim()) return;
    setChecklist(prev => 
      prev.map(item => item.id === editingItemId ? { ...item, text: editingItemText.trim() } : item)
    );
    setEditingItemId(null);
    setEditingItemText("");
  };

  const moveItem = (index, direction) => {
    const newChecklist = [...checklist];
    if (direction === 'up' && index > 0) {
      [newChecklist[index], newChecklist[index - 1]] = [newChecklist[index - 1], newChecklist[index]];
    } else if (direction === 'down' && index < newChecklist.length - 1) {
      [newChecklist[index], newChecklist[index + 1]] = [newChecklist[index + 1], newChecklist[index]];
    }
    setChecklist(newChecklist);
  };

  const addDetail = (itemId) => {
    if (!newDetailText.trim()) return;
    setChecklist(prev => prev.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          details: [...(item.details || []), { text: newDetailText.trim(), checked: false }]
        };
      }
      return item;
    }));
    setNewDetailText("");
    setAddingDetailFor(null);
  };

  const toggleDetail = (itemId, detailIndex) => {
    setChecklist(prev => prev.map(item => {
      if (item.id === itemId) {
        const newDetails = [...(item.details || [])];
        newDetails[detailIndex] = { ...newDetails[detailIndex], checked: !newDetails[detailIndex].checked };
        return { ...item, details: newDetails };
      }
      return item;
    }));
  };

  const deleteDetail = (itemId, detailIndex) => {
    setChecklist(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, details: (item.details || []).filter((_, i) => i !== detailIndex) };
      }
      return item;
    }));
  };

  const openTaskCreationForItem = (itemId, text, detailIndex = null) => {
    setTaskTargetContext({ itemId, detailIndex, text });
    setShowTaskCreation(true);
  };

  // Get ALL tasks (not filtered by context) - show all tasks under each checklist section
  const getAllTasks = () => {
    const allTasks = [];
    
    // Check main tasks
    mainTasks.forEach((task, idx) => {
      allTasks.push({ ...task, sourceType: 'main', sourceId: null, index: idx });
    });
    
    // Check rider tasks
    riders.forEach(rider => {
      (rider.notes || []).forEach((task, idx) => {
        allTasks.push({ ...task, sourceType: 'rider', sourceId: rider.id, index: idx, riderTitle: rider.title });
      });
    });
    
    return allTasks;
  };
  
  // Get tasks for a specific checklist item context
  const getTasksForContext = (itemId, detailIndex = null) => {
    // Build the context key to match
    const contextKey = detailIndex !== null && detailIndex !== undefined
      ? `${itemId}-detail-${detailIndex}` 
      : `${itemId}`;
    
    const matchedTasks = [];
    
    // Check main tasks
    mainTasks.forEach((task, idx) => {
      const taskCtx = task.checklist_context;
      if (taskCtx && String(taskCtx) === contextKey) {
        matchedTasks.push({ ...task, sourceType: 'main', sourceId: null, index: idx });
      }
    });
    
    // Check rider tasks
    riders.forEach(rider => {
      (rider.notes || []).forEach((task, idx) => {
        const taskCtx = task.checklist_context;
        if (taskCtx && String(taskCtx) === contextKey) {
          matchedTasks.push({ ...task, sourceType: 'rider', sourceId: rider.id, index: idx, riderTitle: rider.title });
        }
      });
    });
    
    // Debug logging
    if (matchedTasks.length > 0) {
      console.log(`getTasksForContext(${itemId}, ${detailIndex}) = contextKey: ${contextKey}, found ${matchedTasks.length} tasks`);
    }
    
    return matchedTasks;
  };

  const applyTemplate = (template) => {
    const newChecklist = template.items.map(item => ({
      ...item,
      checked: false
    }));
    setChecklist(newChecklist);
  };

  const saveAsTemplate = async () => {
    if (!newTemplateName.trim()) return;
    try {
      const templateItems = checklist.map(item => ({
        id: item.id,
        text: item.text
      }));
      await SipChecklistTemplate.create({
        name: newTemplateName.trim(),
        items: templateItems,
        is_default: false
      });
      setNewTemplateName("");
      const templatesData = await SipChecklistTemplate.list();
      setTemplates(templatesData);
    } catch (error) {
      console.error("Error saving template:", error);
    }
  };

  const deleteTemplate = async (templateId) => {
    try {
      await SipChecklistTemplate.delete(templateId);
      const templatesData = await SipChecklistTemplate.list();
      setTemplates(templatesData);
    } catch (error) {
      console.error("Error deleting template:", error);
    }
  };

  const setDefaultTemplate = async (template) => {
    try {
      for (const t of templates) {
        if (t.is_default) {
          await SipChecklistTemplate.update(t.id, { is_default: false });
        }
      }
      await SipChecklistTemplate.update(template.id, { is_default: true });
      const templatesData = await SipChecklistTemplate.list();
      setTemplates(templatesData);
    } catch (error) {
      console.error("Error setting default template:", error);
    }
  };

  const updateTemplateItems = async (template) => {
    try {
      const templateItems = checklist.map(item => ({
        id: item.id,
        text: item.text
      }));
      await SipChecklistTemplate.update(template.id, { items: templateItems });
      const templatesData = await SipChecklistTemplate.list();
      setTemplates(templatesData);
    } catch (error) {
      console.error("Error updating template items:", error);
    }
  };

  const saveChecklist = async () => {
    setIsSaving(true);
    try {
      await WorkOrder.update(workOrder.id, { [checklistField]: checklist });
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error("Error saving checklist:", error);
    }
    setIsSaving(false);
  };

  const completedCount = checklist.filter(i => i.checked).length;
  const progressPercent = checklist.length > 0 ? (completedCount / checklist.length) * 100 : 0;

  const colorClasses = {
    blue: { accent: "text-blue-600", bg: "bg-blue-600 hover:bg-blue-700", gradient: "from-blue-500 to-green-500" },
    orange: { accent: "text-orange-600", bg: "bg-orange-600 hover:bg-orange-700", gradient: "from-orange-500 to-yellow-500" }
  };
  const colors = colorClasses[accentColor] || colorClasses.blue;

  const renderTaskItem = (task, index, sourceType, sourceId) => {
    const taskKey = `${sourceType}-${sourceId || 'main'}-${index}`;
    const isExpanded = expandedTasks[taskKey];

    return (
      <div key={taskKey} className={`border rounded-lg ${task.completed ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
        <div className="flex items-center gap-2 p-2">
          <Checkbox
            checked={task.completed}
            onCheckedChange={() => toggleTaskComplete(index, sourceType, sourceId)}
            disabled={!isRegistered}
          />
          <button
            onClick={() => setExpandedTasks(prev => ({ ...prev, [taskKey]: !prev[taskKey] }))}
            className="p-0.5"
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          <span className={`flex-1 text-sm ${task.completed ? 'line-through text-gray-500' : ''}`}>
            {task.text}
          </span>
          {task.sub_tasks?.length > 0 && (
            <Badge variant="outline" className="text-xs">{task.sub_tasks.length}</Badge>
          )}
          {isRegistered && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowMoveTask({ task, sourceType, sourceId })}
              className="h-6 px-2"
            >
              <ArrowRight className="w-3 h-3" />
            </Button>
          )}
        </div>

        {isExpanded && task.sub_tasks?.length > 0 && (
          <div className="px-8 pb-2 space-y-1">
            {task.sub_tasks.map((subTask, stIdx) => (
              <div key={stIdx}>
                <div className="flex items-center gap-2 py-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <span className={`text-xs ${subTask.completed ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                    {subTask.text}
                  </span>
                </div>
                {subTask.details?.length > 0 && (
                  <div className="ml-4 space-y-0.5">
                    {subTask.details.map((detail, dIdx) => (
                      <div key={dIdx} className="flex items-center gap-2 py-0.5">
                        <div className="w-1 h-1 rounded-full bg-gray-300" />
                        <span className={`text-xs ${detail.completed ? 'line-through text-gray-400' : 'text-gray-500'}`}>
                          {detail.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="clay-card border-none">
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="clay-card border-none max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-3">
              <ClipboardList className={`w-6 h-6 ${colors.accent}`} />
              {title} - {workOrder?.client_name}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="checklist">Checklist</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
            </TabsList>

            {/* Checklist Tab */}
            <TabsContent value="checklist" className="flex-1 overflow-hidden flex flex-col mt-4">
              {/* Progress */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Progress</span>
                  <span className="font-bold">{completedCount} / {checklist.length}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full bg-gradient-to-r ${colors.gradient} transition-all`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Add New Item */}
              {isRegistered && (
                <div className="flex gap-2 mb-3">
                  <Input
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    placeholder="Add checklist item..."
                    className="flex-1 h-8 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()}
                  />
                  <Button onClick={addChecklistItem} size="sm" className={`h-8 ${colors.bg}`}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-1">
                {checklist.map((item, index) => (
                  <div 
                    key={item.id}
                    className="group/item [&_.hover-btn]:opacity-0 [&_.hover-btn]:h-0 [&_.hover-btn]:overflow-hidden [&:hover_.hover-btn]:opacity-100 [&:hover_.hover-btn]:h-auto"
                  >
                    <div className={`flex items-center gap-2 p-2 rounded-lg border ${
                      item.checked ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                    }`}>
                      {/* Reorder */}
                      {isRegistered && (
                        <div className="flex flex-col text-[10px] text-gray-400">
                          <button onClick={() => moveItem(index, 'up')} disabled={index === 0} className="hover:text-gray-600 disabled:opacity-30">▲</button>
                          <button onClick={() => moveItem(index, 'down')} disabled={index === checklist.length - 1} className="hover:text-gray-600 disabled:opacity-30">▼</button>
                        </div>
                      )}

                      <Checkbox
                        checked={item.checked}
                        onCheckedChange={() => isRegistered && toggleChecklistItem(item.id)}
                        disabled={!isRegistered}
                        className="h-4 w-4"
                      />

                      {editingItemId === item.id ? (
                        <div className="flex-1 flex gap-1">
                          <Input value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="flex-1 h-6 text-xs" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
                          <Button size="sm" onClick={saveEditItem} className="h-6 px-2"><Check className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingItemId(null)} className="h-6 px-1"><X className="w-3 h-3" /></Button>
                        </div>
                      ) : (
                        <>
                          <span className={`flex-1 text-sm cursor-pointer ${item.checked ? 'text-green-700 line-through' : ''}`} onClick={() => isRegistered && toggleChecklistItem(item.id)}>
                            {item.text}
                          </span>
                          {(item.details?.length > 0) && <span className="text-xs text-gray-400">{item.details.length}</span>}
                          {isRegistered && (
                            <div className="flex gap-0.5">
                              <button onClick={() => startEditItem(item)} className="p-1 hover:bg-gray-100 rounded"><Pencil className="w-3 h-3 text-gray-400" /></button>
                              <button onClick={() => deleteChecklistItem(item.id)} className="p-1 hover:bg-red-100 rounded"><Trash2 className="w-3 h-3 text-red-400" /></button>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Checklist Details */}
                    {item.details?.map((detail, detailIdx) => (
                      <div key={detailIdx} className="ml-6 mt-1 group/detail [&_.hover-btn-detail]:opacity-0 [&_.hover-btn-detail]:h-0 [&_.hover-btn-detail]:overflow-hidden [&:hover_.hover-btn-detail]:opacity-100 [&:hover_.hover-btn-detail]:h-auto">
                        <div className={`flex items-center gap-2 p-1.5 rounded border ${detail.checked ? 'bg-green-50/50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
                          <Checkbox checked={detail.checked} onCheckedChange={() => isRegistered && toggleDetail(item.id, detailIdx)} disabled={!isRegistered} className="h-3 w-3" />
                          <span className={`flex-1 text-xs ${detail.checked ? 'text-green-600 line-through' : 'text-gray-700'}`}>{detail.text}</span>
                          {isRegistered && (
                            <button onClick={() => deleteDetail(item.id, detailIdx)} className="p-0.5 hover:bg-red-100 rounded"><X className="w-2.5 h-2.5 text-red-400" /></button>
                          )}
                        </div>
                        
                        {/* Tasks for this detail */}
                        {(() => {
                          const detailTasks = getTasksForContext(item.id, detailIdx);
                          if (detailTasks.length === 0) return null;
                          return (
                            <div className="ml-4 mt-1 space-y-1">
                              {detailTasks.map((task, tIdx) => (
                                <div key={`detail-task-${item.id}-${detailIdx}-${tIdx}`} className={`flex items-center gap-2 p-1.5 rounded border text-xs ${task.completed ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                                  <Checkbox 
                                    checked={task.completed || false} 
                                    onCheckedChange={() => toggleTaskComplete(task.index, task.sourceType, task.sourceId)} 
                                    disabled={!isRegistered} 
                                    className="h-3 w-3" 
                                  />
                                  <span className={`flex-1 ${task.completed ? 'line-through text-gray-500' : ''}`}>{task.text}</span>
                                  {task.riderTitle && <Badge variant="outline" className="text-[10px] text-purple-600">{task.riderTitle}</Badge>}
                                  {task.sub_tasks?.length > 0 && <Badge variant="outline" className="text-[10px]">{task.sub_tasks.length}</Badge>}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                        
                        {/* Add Tasks for Detail - hover reveal */}
                        {isRegistered && (
                          <div className="hover-btn-detail ml-4 mt-0.5">
                            <button onClick={() => openTaskCreationForItem(item.id, detail.text, detailIdx)} className="text-[10px] text-purple-500 hover:underline">+ Tasks</button>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Tasks for this checklist item (not detail-specific) */}
                    {(() => {
                      // Only get tasks that match THIS item's ID (not detail-specific)
                      const itemTasks = getTasksForContext(item.id, null);
                      if (itemTasks.length === 0) return null;
                      return (
                        <div className="ml-6 mt-1 space-y-1">
                          {itemTasks.map((task, tIdx) => (
                            <div key={`task-${item.id}-${tIdx}`} className={`flex items-center gap-2 p-1.5 rounded border text-xs ${task.completed ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                              <Checkbox 
                                checked={task.completed || false} 
                                onCheckedChange={() => toggleTaskComplete(task.index, task.sourceType, task.sourceId)} 
                                disabled={!isRegistered} 
                                className="h-3 w-3" 
                              />
                              <span className={`flex-1 ${task.completed ? 'line-through text-gray-500' : ''}`}>{task.text}</span>
                              {task.riderTitle && <Badge variant="outline" className="text-[10px] text-purple-600">{task.riderTitle}</Badge>}
                              {task.sub_tasks?.length > 0 && <Badge variant="outline" className="text-[10px]">{task.sub_tasks.length}</Badge>}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Add Detail / Tasks - hover reveal */}
                    {isRegistered && (
                      addingDetailFor === item.id ? (
                        <div className="ml-6 mt-1 flex gap-1">
                          <Input value={newDetailText} onChange={(e) => setNewDetailText(e.target.value)} placeholder="Checklist detail..." className="h-6 text-xs flex-1" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') addDetail(item.id); if (e.key === 'Escape') { setAddingDetailFor(null); setNewDetailText(""); }}} />
                          <Button size="sm" className="h-6 px-2" onClick={() => addDetail(item.id)}><Plus className="w-3 h-3" /></Button>
                        </div>
                      ) : (
                        <div className="hover-btn ml-6 mt-1 flex gap-2">
                          <button onClick={() => setAddingDetailFor(item.id)} className="text-xs text-blue-500 hover:underline">+ Checklist Details</button>
                          <button onClick={() => openTaskCreationForItem(item.id, item.text)} className="text-xs text-purple-500 hover:underline">+ Tasks</button>
                        </div>
                      )
                    )}
                  </div>
                ))}

                {checklist.length === 0 && (
                  <div className="text-center py-6 text-gray-500 text-sm">
                    No checklist items. Add items above or apply a template.
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Templates Tab */}
            <TabsContent value="templates" className="flex-1 overflow-hidden flex flex-col mt-4">
              {/* Save Current as Template */}
              {isRegistered && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    <Save className="w-4 h-4" />
                    Save Current Checklist as Template
                  </h3>
                  <div className="flex gap-2">
                    <Input
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="Template name..."
                      className="flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && saveAsTemplate()}
                    />
                    <Button onClick={saveAsTemplate} size="sm" className={colors.bg}>
                      <Save className="w-4 h-4 mr-1" />
                      Save
                    </Button>
                  </div>
                </div>
              )}

              {/* Template List */}
              <div className="flex-1 overflow-y-auto space-y-2">
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Available Templates
                </h3>

                {templates.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No templates saved yet. Create your first template above.
                  </div>
                )}

                {templates.map(template => (
                  <div 
                    key={template.id}
                    className="p-3 border-2 rounded-lg border-gray-200"
                  >
                    <div className="flex items-center gap-2">
                      {template.is_default && (
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      )}
                      
                      {editingTemplate?.id === template.id ? (
                        <div className="flex-1 flex gap-2">
                          <Input
                            value={editingTemplateName}
                            onChange={(e) => setEditingTemplateName(e.target.value)}
                            className="flex-1 h-8"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                SipChecklistTemplate.update(template.id, { name: editingTemplateName.trim() }).then(() => {
                                  SipChecklistTemplate.list().then(setTemplates);
                                });
                                setEditingTemplate(null);
                              }
                              if (e.key === 'Escape') setEditingTemplate(null);
                            }}
                          />
                          <Button size="sm" onClick={() => {
                            SipChecklistTemplate.update(template.id, { name: editingTemplateName.trim() }).then(() => {
                              SipChecklistTemplate.list().then(setTemplates);
                            });
                            setEditingTemplate(null);
                          }} className="h-8">
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingTemplate(null)} className="h-8">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="font-medium flex-1">{template.name}</span>
                          <span className="text-xs text-gray-500">{template.items?.length || 0} items</span>
                        </>
                      )}

                      {!editingTemplate && isRegistered && (
                        <div className="flex gap-1">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => applyTemplate(template)}
                            className="h-8"
                            title="Apply template"
                          >
                            <Copy className="w-4 h-4 mr-1" />
                            Apply
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => setDefaultTemplate(template)}
                            className="h-8 w-8 p-0"
                            title="Set as default"
                          >
                            <Star className={`w-4 h-4 ${template.is_default ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`} />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => updateTemplateItems(template)}
                            className="h-8 w-8 p-0"
                            title="Update template with current checklist"
                          >
                            <Save className="w-4 h-4 text-blue-500" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => { setEditingTemplate(template); setEditingTemplateName(template.name); }}
                            className="h-8 w-8 p-0"
                            title="Edit name"
                          >
                            <Pencil className="w-4 h-4 text-gray-500" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => deleteTemplate(template.id)}
                            className="h-8 w-8 p-0"
                            title="Delete template"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Preview items */}
                    <div className="mt-2 text-xs text-gray-500">
                      {template.items?.slice(0, 3).map((item, i) => (
                        <span key={item.id}>
                          {i > 0 && " • "}
                          {item.text}
                        </span>
                      ))}
                      {template.items?.length > 3 && ` • +${template.items.length - 3} more`}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t mt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={saveChecklist}
              disabled={isSaving || !isRegistered}
              className={`flex-1 ${colors.bg}`}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save & Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Creation Popup - opens directly when clicking + Tasks */}
      <TaskCreationPopup
        isOpen={showTaskCreation}
        onClose={() => { setShowTaskCreation(false); setTaskTargetContext(null); }}
        onApply={handleApplyTask}
        workOrder={workOrder}
        riders={riders}
        users={users}
        taskTargetContext={taskTargetContext}
      />

      {/* Move Task Popup */}
      {showMoveTask && (
        <MoveTaskPopup
          isOpen={true}
          onClose={() => setShowMoveTask(null)}
          task={showMoveTask.task}
          workOrder={workOrder}
          riders={riders}
          users={users}
          onMove={(task, moveTo, newRiderData) => 
            handleMoveTask(task, moveTo, newRiderData, showMoveTask.sourceType, showMoveTask.sourceId)
          }
        />
      )}
    </>
  );
}

// Tasks Popup Component
function TasksPopup({ isOpen, onClose, workOrder, mainTasks, setMainTasks, riders, setRiders, users, isRegistered, onUpdate, colors, taskTargetContext }) {
  const [showTaskCreation, setShowTaskCreation] = useState(false);
  const [showMoveTask, setShowMoveTask] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [expandedRiders, setExpandedRiders] = useState({});

  const handleApplyTask = async (task, applyTo, newRiderData) => {
    try {
      if (applyTo === "main") {
        const updatedTasks = [...mainTasks, task];
        await WorkOrder.update(workOrder.id, { notes: updatedTasks });
        setMainTasks(updatedTasks);
      } else if (applyTo.startsWith("rider-")) {
        const riderId = applyTo.replace("rider-", "");
        const rider = riders.find(r => r.id === riderId);
        if (rider) {
          const updatedTasks = [...(rider.notes || []), task];
          await WorkOrder.update(riderId, { notes: updatedTasks });
          setRiders(riders.map(r => r.id === riderId ? { ...r, notes: updatedTasks } : r));
        }
      } else if (applyTo === "new-rider" && newRiderData) {
        const newRider = await WorkOrder.create({
          title: newRiderData.title,
          client_name: workOrder.client_name,
          description: workOrder.description,
          is_rider: true,
          parent_work_order_id: workOrder.id,
          current_stage: newRiderData.stage,
          rider_stage: newRiderData.stage,
          assigned_to: newRiderData.assignedTo || "",
          due_date: newRiderData.dueDate || "",
          notes: [task]
        });
        setRiders([...riders, newRider]);
      }
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error applying task:", error);
    }
  };

  const handleMoveTask = async (task, moveTo, newRiderData, sourceType, sourceId) => {
    try {
      // Remove from source
      if (sourceType === "main") {
        const updatedTasks = mainTasks.filter(t => t.text !== task.text || t.timestamp !== task.timestamp);
        await WorkOrder.update(workOrder.id, { notes: updatedTasks });
        setMainTasks(updatedTasks);
      } else if (sourceType === "rider") {
        const rider = riders.find(r => r.id === sourceId);
        if (rider) {
          const updatedTasks = (rider.notes || []).filter(t => t.text !== task.text || t.timestamp !== task.timestamp);
          await WorkOrder.update(sourceId, { notes: updatedTasks });
          setRiders(riders.map(r => r.id === sourceId ? { ...r, notes: updatedTasks } : r));
        }
      }

      // Add to destination
      if (moveTo === "main") {
        const updatedTasks = [...mainTasks.filter(t => t.text !== task.text || t.timestamp !== task.timestamp), task];
        await WorkOrder.update(workOrder.id, { notes: updatedTasks });
        setMainTasks(updatedTasks);
      } else if (moveTo.startsWith("rider-")) {
        const riderId = moveTo.replace("rider-", "");
        const rider = riders.find(r => r.id === riderId);
        if (rider) {
          const updatedTasks = [...(rider.notes || []), task];
          await WorkOrder.update(riderId, { notes: updatedTasks });
          setRiders(riders.map(r => r.id === riderId ? { ...r, notes: updatedTasks } : r));
        }
      } else if (moveTo === "new-rider" && newRiderData) {
        const newRider = await WorkOrder.create({
          title: newRiderData.title,
          client_name: workOrder.client_name,
          description: workOrder.description,
          is_rider: true,
          parent_work_order_id: workOrder.id,
          current_stage: newRiderData.stage,
          rider_stage: newRiderData.stage,
          assigned_to: newRiderData.assignedTo || "",
          due_date: newRiderData.dueDate || "",
          notes: [task],
          in_pipeline: true
        });
        setRiders([...riders, newRider]);
      }
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error moving task:", error);
    }
  };

  const toggleTaskComplete = async (taskIndex, sourceType, sourceId) => {
    if (sourceType === "main") {
      const updatedTasks = mainTasks.map((t, i) => 
        i === taskIndex ? { ...t, completed: !t.completed } : t
      );
      setMainTasks(updatedTasks);
      await WorkOrder.update(workOrder.id, { notes: updatedTasks });
    } else {
      const rider = riders.find(r => r.id === sourceId);
      if (rider) {
        const updatedTasks = (rider.notes || []).map((t, i) => 
          i === taskIndex ? { ...t, completed: !t.completed } : t
        );
        setRiders(riders.map(r => r.id === sourceId ? { ...r, notes: updatedTasks } : r));
        await WorkOrder.update(sourceId, { notes: updatedTasks });
      }
    }
  };

  const renderTaskItem = (task, index, sourceType, sourceId) => {
    const taskKey = `${sourceType}-${sourceId || 'main'}-${index}`;
    const isExpanded = expandedTasks[taskKey];

    return (
      <div key={taskKey} className={`border rounded-lg ${task.completed ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
        <div className="flex items-center gap-2 p-2">
          <Checkbox
            checked={task.completed}
            onCheckedChange={() => toggleTaskComplete(index, sourceType, sourceId)}
            disabled={!isRegistered}
          />
          <button
            onClick={() => setExpandedTasks(prev => ({ ...prev, [taskKey]: !prev[taskKey] }))}
            className="p-0.5"
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          <span className={`flex-1 text-sm ${task.completed ? 'line-through text-gray-500' : ''}`}>
            {task.text}
          </span>
          {task.sub_tasks?.length > 0 && (
            <Badge variant="outline" className="text-xs">{task.sub_tasks.length}</Badge>
          )}
          {isRegistered && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowMoveTask({ task, sourceType, sourceId })}
              className="h-6 px-2"
            >
              <ArrowRight className="w-3 h-3" />
            </Button>
          )}
        </div>

        {isExpanded && task.sub_tasks?.length > 0 && (
          <div className="px-8 pb-2 space-y-1">
            {task.sub_tasks.map((subTask, stIdx) => (
              <div key={stIdx}>
                <div className="flex items-center gap-2 py-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <span className={`text-xs ${subTask.completed ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                    {subTask.text}
                  </span>
                </div>
                {subTask.details?.length > 0 && (
                  <div className="ml-4 space-y-0.5">
                    {subTask.details.map((detail, dIdx) => (
                      <div key={dIdx} className="flex items-center gap-2 py-0.5">
                        <div className="w-1 h-1 rounded-full bg-gray-300" />
                        <span className={`text-xs ${detail.completed ? 'line-through text-gray-400' : 'text-gray-500'}`}>
                          {detail.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="clay-card border-none max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              Tasks - {workOrder?.client_name}
            </DialogTitle>
          </DialogHeader>

          {/* Context indicator */}
          {taskTargetContext && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 mt-2">
              <span className="text-xs text-purple-600">Adding tasks for: </span>
              <span className="text-sm font-medium text-purple-800">{taskTargetContext.text}</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-4 mt-4">
            {/* Add Task Button */}
            {isRegistered && (
              <Button
                onClick={() => setShowTaskCreation(true)}
                className={colors.bg}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Task
              </Button>
            )}

            {/* Main Job Tasks */}
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span className="font-medium">Main Job Tasks</span>
                <Badge variant="outline">{mainTasks.length}</Badge>
              </div>
              <div className="space-y-2">
                {mainTasks.map((task, idx) => renderTaskItem(task, idx, "main", null))}
                {mainTasks.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-2">No tasks</p>
                )}
              </div>
            </div>

            {/* Rider Tasks */}
            {riders.map(rider => (
              <div key={rider.id} className="border rounded-lg p-3 border-purple-200 bg-purple-50/30">
                <div 
                  className="flex items-center gap-2 mb-2 cursor-pointer"
                  onClick={() => setExpandedRiders(prev => ({ ...prev, [rider.id]: !prev[rider.id] }))}
                >
                  {expandedRiders[rider.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <LinkIcon className="w-4 h-4 text-purple-600" />
                  <span className="font-medium text-purple-800">{rider.title}</span>
                  <Badge variant="outline" className="text-purple-600">{rider.notes?.length || 0}</Badge>
                  <span className="text-xs text-purple-500 ml-auto">
                    {STAGES.find(s => s.value === rider.current_stage)?.label}
                    {rider.assigned_to && ` • ${rider.assigned_to}`}
                  </span>
                </div>
                {expandedRiders[rider.id] && (
                  <div className="space-y-2 mt-2">
                    {(rider.notes || []).map((task, idx) => renderTaskItem(task, idx, "rider", rider.id))}
                    {(!rider.notes || rider.notes.length === 0) && (
                      <p className="text-sm text-gray-400 text-center py-2">No tasks</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-4 border-t mt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Creation Popup */}
      <TaskCreationPopup
        isOpen={showTaskCreation}
        onClose={() => setShowTaskCreation(false)}
        onApply={handleApplyTask}
        workOrder={workOrder}
        riders={riders}
        users={users}
      />

      {/* Move Task Popup */}
      {showMoveTask && (
        <MoveTaskPopup
          isOpen={true}
          onClose={() => setShowMoveTask(null)}
          task={showMoveTask.task}
          workOrder={workOrder}
          riders={riders}
          users={users}
          onMove={(task, moveTo, newRiderData) => 
            handleMoveTask(task, moveTo, newRiderData, showMoveTask.sourceType, showMoveTask.sourceId)
          }
        />
      )}
    </>
  );
}