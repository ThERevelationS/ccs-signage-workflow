import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from
"@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle } from
"@/components/ui/alert-dialog";
import {
  X,
  Plus,
  Trash2,
  Edit,
  CheckCircle,
  Calendar,
  User,
  FileText,
  ArrowRight,
  Link as LinkIcon,
  Zap,
  Eye,
  EyeOff,
  Upload,
  Check,
  Pencil } from
"lucide-react";
import { format } from "date-fns";
import { WorkOrder } from "@/entities/WorkOrder";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { UploadFile } from "@/integrations/Core";
import { ActivityActions } from "./ActivityLogger";

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

export default function WorkOrderDetailsDialog({
  isOpen,
  onClose,
  workOrder,
  onEdit,
  onMove,
  onSplit,
  onComplete,
  onRestore,
  onUpdate,
  onDelete
}) {
  const [allWorkOrders, setAllWorkOrders] = useState([]);
  const [riders, setRiders] = useState([]);
  const [parentWorkOrder, setParentWorkOrder] = useState(null);
  const [dependencies, setDependencies] = useState([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCompletedNotes, setShowCompletedNotes] = useState(false);
  const [isEditingDependency, setIsEditingDependency] = useState(false);

  // Edit states
  const [editingField, setEditingField] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [uploading, setUploading] = useState(false);
  const [newDependency, setNewDependency] = useState({
    trigger_type: "stage_change",
    trigger_value: "",
    action_type: "move_stage",
    action_value: "",
    target_work_order_id: ""
  });
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  const [editingTaskIndex, setEditingTaskIndex] = useState(null);
  const [editedTaskText, setEditedTaskText] = useState("");

  useEffect(() => {
    if (isOpen && workOrder) {
      loadRelatedData();
    }
  }, [isOpen, workOrder]);

  const loadRelatedData = async () => {
    const all = await WorkOrder.filter({ completed: false });
    setAllWorkOrders(all);

    // Find riders
    if (!workOrder.is_rider) {
      const foundRiders = all.filter(
        (wo) => wo.parent_work_order_id === workOrder.id && wo.is_rider
      );
      setRiders(foundRiders);
    }

    // Find parent
    if (workOrder.is_rider && workOrder.parent_work_order_id) {
      const parent = all.find((wo) => wo.id === workOrder.parent_work_order_id);
      setParentWorkOrder(parent);
    }

    // Load dependencies (from workOrder data)
    setDependencies(workOrder.dependencies || []);
  };

  const handleAddDependency = async () => {
    if (!newDependency.trigger_value || !newDependency.action_value) return;

    const updatedDeps = [...dependencies, { ...newDependency, id: Date.now() }];
    await WorkOrder.update(workOrder.id, { dependencies: updatedDeps });
    setDependencies(updatedDeps);
    setIsEditingDependency(false);
    setNewDependency({
      trigger_type: "stage_change",
      trigger_value: "",
      action_type: "move_stage",
      action_value: "",
      target_work_order_id: ""
    });
    if (onUpdate) onUpdate();
  };

  const handleDeleteDependency = async (depId) => {
    const updatedDeps = dependencies.filter((d) => d.id !== depId);
    await WorkOrder.update(workOrder.id, { dependencies: updatedDeps });
    setDependencies(updatedDeps);
    if (onUpdate) onUpdate();
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const result = await UploadFile({ file });
    await WorkOrder.update(workOrder.id, { image_url: result.file_url });
    await ActivityActions.imageUploaded(workOrder);
    setUploading(false);
    if (onUpdate) onUpdate();
  };

  const startEdit = (field) => {
    setEditingField(field);
    setEditValues({
      title: workOrder.title,
      client_name: workOrder.client_name,
      description: workOrder.description,
      assigned_to: workOrder.assigned_to,
      due_date: workOrder.due_date,
      start_date: workOrder.start_date
    });
  };

  const saveEdit = async (field) => {
    const oldValue = workOrder[field];
    const newValue = editValues[field];
    await WorkOrder.update(workOrder.id, { [field]: newValue });
    await ActivityActions.fieldUpdated(workOrder, field, oldValue, newValue);
    setEditingField(null);
    if (onUpdate) onUpdate();
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValues({});
  };

  const handleToggleTask = async (taskIndex) => {
    const taskText = tasks[taskIndex].text;
    const wasCompleted = tasks[taskIndex].completed;
    const updatedTasks = [...tasks];
    updatedTasks[taskIndex] = {
      ...updatedTasks[taskIndex],
      completed: !updatedTasks[taskIndex].completed
    };
    await WorkOrder.update(workOrder.id, { notes: updatedTasks });
    if (wasCompleted) {
      await ActivityActions.taskUncompleted(workOrder, taskText);
    } else {
      await ActivityActions.taskCompleted(workOrder, taskText);
    }
    if (onUpdate) onUpdate();
  };

  const handleAddTask = async () => {
    if (!newTaskText.trim()) return;
    const newTask = {
      text: newTaskText,
      timestamp: new Date().toISOString(),
      created_by: "Unknown",
      completed: false
    };
    const updatedTasks = [...tasks, newTask];
    await WorkOrder.update(workOrder.id, { notes: updatedTasks });
    await ActivityActions.taskAdded(workOrder, newTaskText);
    setNewTaskText("");
    setIsAddingTask(false);
    if (onUpdate) onUpdate();
  };

  const handleEditTask = async (taskIndex) => {
    if (!editedTaskText.trim()) return;
    const oldText = tasks[taskIndex].text;
    const updatedTasks = [...tasks];
    updatedTasks[taskIndex] = {
      ...updatedTasks[taskIndex],
      text: editedTaskText
    };
    await WorkOrder.update(workOrder.id, { notes: updatedTasks });
    await ActivityActions.taskEdited(workOrder, oldText, editedTaskText);
    setEditingTaskIndex(null);
    setEditedTaskText("");
    if (onUpdate) onUpdate();
  };

  const handleDeleteTask = async (taskIndex) => {
    const updatedTasks = tasks.filter((_, idx) => idx !== taskIndex);
    await WorkOrder.update(workOrder.id, { notes: updatedTasks });
    await ActivityActions.taskDeleted(workOrder);
    if (onUpdate) onUpdate();
  };

  const handleAddWorkNote = async (noteData) => {
    const newNote = {
      ...noteData,
      timestamp: new Date().toISOString(),
      id: Date.now(),
      sub_tasks: []
    };
    const updatedNotes = [...workNotes, newNote];
    await WorkOrder.update(workOrder.id, { work_notes: updatedNotes });
    await ActivityActions.noteAdded(workOrder, noteData.text, noteData.type);
    if (onUpdate) onUpdate();
  };

  const handleDeleteWorkNote = async (noteId) => {
    const updatedNotes = workNotes.filter((n) => n.id !== noteId);
    await WorkOrder.update(workOrder.id, { work_notes: updatedNotes });
    await ActivityActions.noteDeleted(workOrder);
    if (onUpdate) onUpdate();
  };

  const handleAddSubTask = async (noteId, subTaskText) => {
    const updatedNotes = workNotes.map((note) => {
      if (note.id === noteId) {
        return {
          ...note,
          sub_tasks: [...(note.sub_tasks || []), {
            id: Date.now(),
            text: subTaskText,
            completed: false
          }]
        };
      }
      return note;
    });
    await WorkOrder.update(workOrder.id, { work_notes: updatedNotes });
    await ActivityActions.subNoteAdded(workOrder, subTaskText);
    if (onUpdate) onUpdate();
  };

  const handleToggleSubTask = async (noteId, subTaskId) => {
    const updatedNotes = workNotes.map((note) => {
      if (note.id === noteId) {
        return {
          ...note,
          sub_tasks: (note.sub_tasks || []).map((st) =>
          st.id === subTaskId ? { ...st, completed: !st.completed } : st
          )
        };
      }
      return note;
    });
    await WorkOrder.update(workOrder.id, { work_notes: updatedNotes });
    loadRelatedData();
  };

  const handleDeleteSubTask = async (noteId, subTaskId) => {
    const updatedNotes = workNotes.map((note) => {
      if (note.id === noteId) {
        return {
          ...note,
          sub_tasks: (note.sub_tasks || []).filter((st) => st.id !== subTaskId)
        };
      }
      return note;
    });
    await WorkOrder.update(workOrder.id, { work_notes: updatedNotes });
    await ActivityActions.subNoteDeleted(workOrder);
    if (onUpdate) onUpdate();
  };

  const handleDeleteWorkOrder = async () => {
    if (riders.length > 0) {
      alert("Cannot delete: This work order has active riders. Delete riders first.");
      return;
    }
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (onDelete) {
      await onDelete(workOrder);
    }
    setShowDeleteDialog(false);
    onClose();
  };

  const getPageNameForStage = (stage) => {
    const stagePageMap = {
      'estimating': 'Estimating',
      'sales': 'Sales',
      'permitting': 'Permitting',
      'design': 'Design',
      'production': 'Production',
      'fabrication': 'Fabrication',
      'installation': 'InstallationDeliver'
    };
    return stagePageMap[stage] || 'Estimating';
  };

  // Calculate comprehensive timeline including parent and riders
  const getTimelineData = () => {
    const workOrders = [];

    // Add parent if exists
    if (parentWorkOrder) {
      workOrders.push({ ...parentWorkOrder, type: 'parent' });
    }

    // Add current work order
    workOrders.push({ ...workOrder, type: 'current' });

    // Add riders
    riders.forEach((rider) => {
      workOrders.push({ ...rider, type: 'rider' });
    });

    // Find earliest start and latest end
    const allDates = workOrders.filter((wo) => wo.start_date && wo.due_date);
    if (allDates.length === 0) return null;

    const earliestStart = new Date(Math.min(...allDates.map((wo) => new Date(wo.start_date))));
    const latestEnd = new Date(Math.max(...allDates.map((wo) => new Date(wo.due_date))));
    const totalDays = Math.max((latestEnd - earliestStart) / (1000 * 60 * 60 * 24), 1);

    // Calculate position and width for each work order
    const bars = workOrders.map((wo) => {
      if (!wo.start_date || !wo.due_date) return null;
      const woStart = new Date(wo.start_date);
      const woEnd = new Date(wo.due_date);
      const startOffset = (woStart - earliestStart) / (1000 * 60 * 60 * 24) / totalDays * 100;
      const duration = (woEnd - woStart) / (1000 * 60 * 60 * 24) / totalDays * 100;

      return {
        ...wo,
        startOffset,
        width: duration,
        isCurrent: wo.id === workOrder.id
      };
    }).filter(Boolean);

    return { bars, earliestStart, latestEnd, totalDays };
  };

  const timelineData = getTimelineData();

  const tasks = React.useMemo(() => {
    if (!workOrder?.notes) return [];
    if (Array.isArray(workOrder.notes)) {
      return workOrder.notes.map((note) => ({
        ...note,
        completed: note.completed || false
      }));
    }
    return [];
  }, [workOrder?.notes]);

  const activeTasks = tasks.filter((n) => !n.completed);
  const completedTasks = tasks.filter((n) => n.completed);

  const workNotes = React.useMemo(() => {
    if (!workOrder?.work_notes) return [];
    if (Array.isArray(workOrder.work_notes)) return workOrder.work_notes;
    return [];
  }, [workOrder?.work_notes]);

  if (!workOrder) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="clay-card border-none max-w-[95vw] w-[1400px] max-h-[95vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <div className="px-6 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  {editingField === 'title' ?
                  <div className="flex items-center gap-2 flex-1">
                      <Input
                      value={editValues.title}
                      onChange={(e) => setEditValues({ ...editValues, title: e.target.value })}
                      className="text-2xl font-bold h-10"
                      autoFocus />

                      <Button size="sm" onClick={() => saveEdit('title')} className="h-8">
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-8">
                        <X className="w-4 h-4" />
                      </Button>
                    </div> :

                  <>
                        <h2
                      className="text-2xl font-bold text-gray-800 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                      onClick={() => startEdit('title')}>

                          {workOrder.title}
                          <Pencil className="w-4 h-4 inline ml-2 opacity-0 hover:opacity-100" />
                        </h2>
                        {workOrder.is_rider &&
                    <Badge className="rounded-full" style={{
                      background: 'linear-gradient(135deg, #FFD6E8 0%, #E0D4F7 100%)',
                      color: '#7C3AED'
                    }}>
                            Rider
                          </Badge>
                    }
                        {workOrder.asap &&
                    <Badge className="rounded-full bg-red-600 text-white">ASAP</Badge>
                    }
                      </>
                  }
                </div>
                {editingField === 'client_name' ?
                <div className="flex items-center gap-2">
                    <Input
                    value={editValues.client_name}
                    onChange={(e) => setEditValues({ ...editValues, client_name: e.target.value })}
                    className="h-8"
                    autoFocus />

                    <Button size="sm" onClick={() => saveEdit('client_name')} className="h-7">
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7">
                      <X className="w-3 h-3" />
                    </Button>
                  </div> :

                <p
                  className="text-gray-600 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded inline-block"
                  onClick={() => startEdit('client_name')}>

                    {workOrder.client_name}
                  </p>
                }
              </div>
            </div>
          </div>

          {/* Comprehensive Timeline - Full Width */}
          {timelineData &&
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <Popover>
                <PopoverTrigger asChild>
                  <div className="px-4 cursor-pointer hover:shadow-lg transition-shadow clay-card">
                    <h3 className="font-semibold text-sm mb-3">Project Timeline</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{format(timelineData.earliestStart, "MMM d, yyyy")}</span>
                        <span>{format(timelineData.latestEnd, "MMM d, yyyy")}</span>
                      </div>
                      <div className="relative min-h-[80px] rounded-lg p-2" style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(240,240,240,0.8) 100%)',
                      boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.1)'
                    }}>
                        {timelineData.bars.map((bar) =>
                      <div key={bar.id} className="mb-2">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium" style={{
                            color: bar.type === 'parent' ? '#6B7280' : bar.isCurrent ? '#7C3AED' : '#EC4899'
                          }}>
                                {bar.type === 'parent' ? '↑ Parent' : bar.isCurrent ? '● Current' : '↓ Rider'}: {bar.title}
                              </span>
                              <Badge className="text-xs" style={{ backgroundColor: stageColors[bar.current_stage] }}>
                                {stageDisplayNames[bar.current_stage]}
                              </Badge>
                            </div>
                            <div className="relative h-6 rounded-lg" style={{
                          background: 'rgba(255,255,255,0.5)'
                        }}>
                              <div
                            className="absolute h-full rounded-lg transition-all flex items-center px-2"
                            style={{
                              left: `${bar.startOffset}%`,
                              width: `${bar.width}%`,
                              background: bar.isCurrent ?
                              `linear-gradient(135deg, ${stageColors[bar.current_stage]} 0%, rgba(255,255,255,0.7) 100%)` :
                              bar.type === 'parent' ?
                              'linear-gradient(135deg, rgba(150,150,150,0.5) 0%, rgba(200,200,200,0.5) 100%)' :
                              'linear-gradient(135deg, rgba(255,182,193,0.7) 0%, rgba(221,160,221,0.7) 100%)',
                              border: bar.isCurrent ? '2px solid #7C3AED' : '1px solid rgba(0,0,0,0.2)',
                              boxShadow: bar.isCurrent ? '0 0 12px rgba(124,58,237,0.5)' : '0 2px 4px rgba(0,0,0,0.1)'
                            }}>

                                <span className="text-xs font-medium text-gray-800 truncate">
                                  {format(new Date(bar.start_date), "MMM d")} - {format(new Date(bar.due_date), "MMM d")}
                                </span>
                              </div>
                            </div>
                          </div>
                      )}
                      </div>
                    </div>
                  </div>
                </PopoverTrigger>
                <PopoverContent className="clay-card w-80">
                  <Label>Start Date</Label>
                  <div className="flex gap-2 mt-2 mb-3">
                    <Input
                    type="date"
                    value={editValues.start_date || workOrder.start_date || ''}
                    onChange={(e) => setEditValues({ ...editValues, start_date: e.target.value })} />

                    <Button size="sm" onClick={() => saveEdit('start_date')}>
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                  <Label>Due Date</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                    type="date"
                    value={editValues.due_date || workOrder.due_date || ''}
                    onChange={(e) => setEditValues({ ...editValues, due_date: e.target.value })} />

                    <Button size="sm" onClick={() => saveEdit('due_date')}>
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          }

          {/* Work Notes - Full Width */}
          <div className="px-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-lg">Notes</h3>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-3">
                    <Plus className="w-4 h-4 mr-1" />
                    Add Note
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="clay-card w-96">
                  <div className="space-y-3">
                    <div>
                      <Label>Type</Label>
                      <Select
                        value={editValues.noteType || ""}
                        onValueChange={(val) => setEditValues({ ...editValues, noteType: val })}>

                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Administrative Work</SelectItem>
                          <SelectItem value="fabrication">Sign Shop Fabrication</SelectItem>
                          <SelectItem value="vinyl">Vinyl Production</SelectItem>
                          <SelectItem value="permitting">Permitting Steps</SelectItem>
                          <SelectItem value="design">Design Work</SelectItem>
                          <SelectItem value="installation">Installation</SelectItem>
                          <SelectItem value="client">Client Communication</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Note</Label>
                      <Textarea
                        placeholder="Enter note details..."
                        className="mt-1 min-h-24"
                        value={editValues.noteText || ""}
                        onChange={(e) => setEditValues({ ...editValues, noteText: e.target.value })} />

                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        if (editValues.noteType && editValues.noteText) {
                          handleAddWorkNote({
                            type: editValues.noteType,
                            text: editValues.noteText
                          });
                          setEditValues({});
                        }
                      }}>

                      Add Note
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-3">
              {workNotes.map((note) =>
              <div key={note.id} className="clay-card p-4">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline">
                          {note.type === 'admin' && 'Admin'}
                          {note.type === 'fabrication' && 'Fabrication'}
                          {note.type === 'vinyl' && 'Vinyl'}
                          {note.type === 'permitting' && 'Permitting'}
                          {note.type === 'design' && 'Design'}
                          {note.type === 'installation' && 'Installation'}
                          {note.type === 'client' && 'Client'}
                          {note.type === 'other' && 'Other'}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {format(new Date(note.timestamp), "MMM d, h:mm a")}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{note.text}</p>
                    </div>
                    <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0"
                    onClick={() => handleDeleteWorkNote(note.id)}>

                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>

                  {/* Sub-notes */}
                  {note.sub_tasks && note.sub_tasks.length > 0 &&
                <div className="ml-4 space-y-1 mb-2">
                      {note.sub_tasks.map((subNote) =>
                  <div key={subNote.id} className="flex items-center gap-2 p-2 bg-white/50 rounded">
                          <span className="text-sm flex-1 text-gray-700">
                            • {subNote.text}
                          </span>
                          <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleDeleteSubTask(note.id, subNote.id)}>

                            <X className="w-3 h-3 text-gray-400" />
                          </Button>
                        </div>
                  )}
                    </div>
                }

                  {/* Add Sub-note */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 text-xs ml-4">
                        <Plus className="w-3 h-3 mr-1" />
                        Add Sub-note
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="clay-card w-64">
                      <Label className="text-xs">Sub-note</Label>
                      <Input
                      placeholder="Enter sub-note..."
                      className="mt-2 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          handleAddSubTask(note.id, e.target.value);
                          e.target.value = '';
                        }
                      }} />

                      <p className="text-xs text-gray-400 mt-2">Press Enter to add</p>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              
              {workNotes.length === 0 &&
              <div className="text-center py-8 text-gray-400">
                  <p>No notes yet</p>
                </div>
              }
            </div>
          </div>

          {/* Main Content - Scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-3 gap-6">
              
              {/* Left Column - Core Info */}
              <div className="space-y-4">
                {/* Image - Editable */}
                <Popover>
                  <PopoverTrigger asChild>
                    <div className="rounded-xl overflow-hidden cursor-pointer hover:opacity-80 transition-opacity" style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(240,240,240,0.8) 100%)',
                      boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.1)'
                    }}>
                      {workOrder.image_url ?
                      <img src={workOrder.image_url} alt={workOrder.title} className="w-full h-48 object-contain" /> :

                      <div className="w-full h-48 flex items-center justify-center">
                          <Upload className="w-12 h-12 text-gray-400" />
                        </div>
                      }
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="clay-card w-64">
                    <Label>Upload New Image</Label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="mt-2 text-sm"
                      disabled={uploading} />

                    {uploading && <p className="text-xs text-gray-500 mt-2">Uploading...</p>}
                  </PopoverContent>
                </Popover>

                {/* Basic Info - Editable */}
                <div className="clay-card p-4 space-y-3">
                  <Popover>
                    <PopoverTrigger asChild>
                      <div className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white/50 p-2 rounded transition-colors">
                        <User className="w-4 h-4 text-blue-600" />
                        <span className="font-medium">Assigned:</span>
                        <span className="text-gray-600">{workOrder.assigned_to || 'Unassigned'}</span>
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="clay-card w-64">
                      <Label>Assigned To</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          value={editValues.assigned_to || workOrder.assigned_to || ''}
                          onChange={(e) => setEditValues({ ...editValues, assigned_to: e.target.value })}
                          placeholder="Enter name" />

                        <Button size="sm" onClick={() => saveEdit('assigned_to')}>
                          <Check className="w-4 h-4" />
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <div className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white/50 p-2 rounded transition-colors">
                        <Calendar className="w-4 h-4 text-orange-600" />
                        <span className="font-medium">Due:</span>
                        <span className="text-gray-600">
                          {workOrder.due_date ? format(new Date(workOrder.due_date), "MMM d, yyyy") : 'No due date'}
                        </span>
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="clay-card w-64">
                      <Label>Due Date</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          type="date"
                          value={editValues.due_date || workOrder.due_date || ''}
                          onChange={(e) => setEditValues({ ...editValues, due_date: e.target.value })} />

                        <Button size="sm" onClick={() => saveEdit('due_date')}>
                          <Check className="w-4 h-4" />
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <div className="flex items-center gap-2 text-sm p-2">
                    <FileText className="w-4 h-4 text-purple-600" />
                    <span className="font-medium">Stage:</span>
                    <Badge style={{ backgroundColor: stageColors[workOrder.current_stage] }}>
                      {stageDisplayNames[workOrder.current_stage]}
                    </Badge>
                  </div>
                </div>

                {/* Description - Editable */}
                <Popover>
                  <PopoverTrigger asChild>
                    <div className="clay-card p-4 cursor-pointer hover:shadow-lg transition-shadow">
                      <h3 className="font-semibold text-sm mb-2">Description</h3>
                      <p className="text-sm text-gray-600 leading-relaxed">{workOrder.description || 'Click to add description'}</p>
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="clay-card w-80">
                    <Label>Description</Label>
                    <Textarea
                      value={editValues.description || workOrder.description || ''}
                      onChange={(e) => setEditValues({ ...editValues, description: e.target.value })}
                      className="mt-2 min-h-24" />

                    <Button size="sm" className="mt-2" onClick={() => saveEdit('description')}>
                      Save
                    </Button>
                  </PopoverContent>
                </Popover>

                {/* Relationships */}
                <div className="clay-card p-4">
                  <h3 className="font-semibold text-sm mb-3">Relationships</h3>
                  
                  {parentWorkOrder &&
                  <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">Parent Work Order</p>
                      <Link to={createPageUrl(getPageNameForStage(parentWorkOrder.current_stage))}>
                        <div className="clay-button p-2 rounded-lg flex items-center gap-2 hover:opacity-80 transition-opacity">
                          <LinkIcon className="w-4 h-4 text-blue-600" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{parentWorkOrder.title}</p>
                            <p className="text-xs text-gray-500">{parentWorkOrder.client_name}</p>
                          </div>
                        </div>
                      </Link>
                    </div>
                  }

                  {riders.length > 0 &&
                  <div>
                      <p className="text-xs text-gray-500 mb-1">Riders ({riders.length})</p>
                      <div className="space-y-1">
                        {riders.map((rider) =>
                      <Link key={rider.id} to={createPageUrl(getPageNameForStage(rider.rider_stage || rider.current_stage))}>
                            <div className="clay-button p-2 rounded-lg flex items-center gap-2 hover:opacity-80 transition-opacity">
                              <LinkIcon className="w-4 h-4 text-purple-600" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{rider.title}</p>
                                <p className="text-xs text-gray-500">Stage: {stageDisplayNames[rider.current_stage]}</p>
                              </div>
                            </div>
                          </Link>
                      )}
                      </div>
                    </div>
                  }

                  {!parentWorkOrder && riders.length === 0 &&
                  <p className="text-xs text-gray-400 text-center py-2">No relationships</p>
                  }
                </div>
              </div>

              {/* Middle Column - Tasks & Notes */}
              <div className="space-y-4">
                {/* Tasks (formerly Notes) */}
                                      <div className="clay-card p-4">
                                        <div className="flex items-center justify-between mb-3">
                                          <h3 className="font-semibold text-sm">Tasks</h3>
                                          <div className="flex items-center gap-2">
                                            {completedTasks.length > 0 &&
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCompletedNotes(!showCompletedNotes)}
                        className="h-6 px-2 text-xs">

                                                {showCompletedNotes ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                                                {showCompletedNotes ? 'Hide' : 'Show'} ({completedTasks.length})
                                              </Button>
                      }
                                            <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsAddingTask(true)}
                        className="h-6 px-2 text-xs">

                                              <Plus className="w-3 h-3 mr-1" />
                                              Add
                                            </Button>
                                          </div>
                                        </div>

                                        <div className="space-y-2 max-h-64 overflow-y-auto">
                                          {/* Add Task Form */}
                                          {isAddingTask &&
                    <div className="p-2 bg-blue-50 rounded-lg space-y-2">
                                              <Input
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        placeholder="Enter task..."
                        className="text-sm h-8"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTask();
                          if (e.key === 'Escape') {setIsAddingTask(false);setNewTaskText("");}
                        }} />

                                              <div className="flex gap-1">
                                                <Button size="sm" onClick={handleAddTask} className="h-6 px-2 text-xs bg-green-100 hover:bg-green-200 text-green-800">
                                                  <Check className="w-3 h-3 mr-1" />Save
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => {setIsAddingTask(false);setNewTaskText("");}} className="h-6 px-2 text-xs">
                                                  <X className="w-3 h-3" />
                                                </Button>
                                              </div>
                                            </div>
                    }

                                          {activeTasks.map((task, idx) => {
                      const actualIndex = tasks.findIndex((t) => t === task);
                      return (
                        <div key={idx} className="p-2 bg-white/50 rounded-lg flex items-start gap-2">
                                                <Checkbox
                            checked={false}
                            onCheckedChange={() => handleToggleTask(actualIndex)}
                            className="mt-0.5" />

                                                {editingTaskIndex === actualIndex ?
                          <div className="flex-1 space-y-1">
                                                    <Input
                              value={editedTaskText}
                              onChange={(e) => setEditedTaskText(e.target.value)}
                              className="text-sm h-8"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditTask(actualIndex);
                                if (e.key === 'Escape') {setEditingTaskIndex(null);setEditedTaskText("");}
                              }} />

                                                    <div className="flex gap-1">
                                                      <Button size="sm" onClick={() => handleEditTask(actualIndex)} className="h-6 px-2 text-xs bg-green-100 hover:bg-green-200 text-green-800">
                                                        <Check className="w-3 h-3 mr-1" />Save
                                                      </Button>
                                                      <Button size="sm" variant="ghost" onClick={() => {setEditingTaskIndex(null);setEditedTaskText("");}} className="h-6 px-2 text-xs">
                                                        <X className="w-3 h-3" />
                                                      </Button>
                                                    </div>
                                                  </div> :

                          <>
                                                    <div
                              className="flex-1 cursor-pointer hover:bg-white/70 rounded px-1 transition-colors"
                              onClick={() => {setEditingTaskIndex(actualIndex);setEditedTaskText(task.text);}}>

                                                      <p className="text-sm text-gray-700">{task.text}</p>
                                                      <p className="text-xs text-gray-400 mt-1">
                                                        {format(new Date(task.timestamp), "MMM d, h:mm a")} • {task.created_by?.split('@')[0] || 'Unknown'}
                                                      </p>
                                                    </div>
                                                    <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteTask(actualIndex)}
                              className="h-6 w-6 flex-shrink-0">

                                                      <Trash2 className="w-3 h-3 text-red-600" />
                                                    </Button>
                                                  </>
                          }
                                              </div>);

                    })}

                                          {showCompletedNotes && completedTasks.map((task, idx) => {
                      const actualIndex = tasks.findIndex((t) => t === task);
                      return (
                        <div key={idx} className="p-2 bg-gray-100/50 rounded-lg opacity-60 flex items-start gap-2">
                                                <Checkbox
                            checked={true}
                            onCheckedChange={() => handleToggleTask(actualIndex)}
                            className="mt-0.5" />

                                                {editingTaskIndex === actualIndex ?
                          <div className="flex-1 space-y-1">
                                                    <Input
                              value={editedTaskText}
                              onChange={(e) => setEditedTaskText(e.target.value)}
                              className="text-sm h-8"
                              autoFocus />

                                                    <div className="flex gap-1">
                                                      <Button size="sm" onClick={() => handleEditTask(actualIndex)} className="h-6 px-2 text-xs bg-green-100 hover:bg-green-200 text-green-800">
                                                        <Check className="w-3 h-3 mr-1" />Save
                                                      </Button>
                                                      <Button size="sm" variant="ghost" onClick={() => {setEditingTaskIndex(null);setEditedTaskText("");}} className="h-6 px-2 text-xs">
                                                        <X className="w-3 h-3" />
                                                      </Button>
                                                    </div>
                                                  </div> :

                          <>
                                                    <div
                              className="flex-1 cursor-pointer hover:bg-gray-200/50 rounded px-1 transition-colors"
                              onClick={() => {setEditingTaskIndex(actualIndex);setEditedTaskText(task.text);}}>

                                                      <p className="text-sm text-gray-600 line-through">{task.text}</p>
                                                      <p className="text-xs text-gray-400 mt-1">
                                                        {format(new Date(task.timestamp), "MMM d, h:mm a")} • {task.created_by?.split('@')[0] || 'Unknown'}
                                                      </p>
                                                    </div>
                                                    <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteTask(actualIndex)}
                              className="h-6 w-6 flex-shrink-0">

                                                      <Trash2 className="w-3 h-3 text-red-600" />
                                                    </Button>
                                                  </>
                          }
                                              </div>);

                    })}

                                          {activeTasks.length === 0 && !isAddingTask &&
                    <p className="text-xs text-gray-400 text-center py-2">No active tasks</p>
                    }
                                        </div>
                                      </div>



                {/* Dependencies / Automations */}
                <div className="clay-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-600" />
                      <h3 className="font-semibold text-sm">Automations</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingDependency(!isEditingDependency)}
                      className="h-6 px-2 text-xs">

                      <Plus className="w-3 h-3 mr-1" />
                      Add Rule
                    </Button>
                  </div>

                  {/* Add New Dependency Form */}
                  {isEditingDependency &&
                  <div className="mb-3 p-3 bg-blue-50 rounded-lg space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">When</Label>
                          <Select
                          value={newDependency.trigger_type}
                          onValueChange={(val) => setNewDependency({ ...newDependency, trigger_type: val })}>

                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="stage_change">Stage Changes To</SelectItem>
                              <SelectItem value="note_added">Note Added</SelectItem>
                              <SelectItem value="note_completed">Note Completed</SelectItem>
                              <SelectItem value="date_reached">Date Reached</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-xs">Value</Label>
                          {newDependency.trigger_type === "stage_change" ?
                        <Select
                          value={newDependency.trigger_value}
                          onValueChange={(val) => setNewDependency({ ...newDependency, trigger_value: val })}>

                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select stage" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.keys(stageDisplayNames).map((stage) =>
                            <SelectItem key={stage} value={stage}>{stageDisplayNames[stage]}</SelectItem>
                            )}
                              </SelectContent>
                            </Select> :
                        newDependency.trigger_type === "date_reached" ?
                        <Input
                          type="date"
                          className="h-8 text-xs"
                          value={newDependency.trigger_value}
                          onChange={(e) => setNewDependency({ ...newDependency, trigger_value: e.target.value })} /> :


                        <Input
                          className="h-8 text-xs"
                          placeholder="Enter value"
                          value={newDependency.trigger_value}
                          onChange={(e) => setNewDependency({ ...newDependency, trigger_value: e.target.value })} />

                        }
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Then</Label>
                          <Select
                          value={newDependency.action_type}
                          onValueChange={(val) => setNewDependency({ ...newDependency, action_type: val })}>

                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="move_stage">Move to Stage</SelectItem>
                              <SelectItem value="add_note">Add Note</SelectItem>
                              <SelectItem value="notify">Send Notification</SelectItem>
                              <SelectItem value="complete">Mark Complete</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-xs">Action Value</Label>
                          {newDependency.action_type === "move_stage" ?
                        <Select
                          value={newDependency.action_value}
                          onValueChange={(val) => setNewDependency({ ...newDependency, action_value: val })}>

                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select stage" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.keys(stageDisplayNames).map((stage) =>
                            <SelectItem key={stage} value={stage}>{stageDisplayNames[stage]}</SelectItem>
                            )}
                              </SelectContent>
                            </Select> :

                        <Input
                          className="h-8 text-xs"
                          placeholder="Enter value"
                          value={newDependency.action_value}
                          onChange={(e) => setNewDependency({ ...newDependency, action_value: e.target.value })} />

                        }
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs">Target (Optional)</Label>
                        <Select
                        value={newDependency.target_work_order_id}
                        onValueChange={(val) => setNewDependency({ ...newDependency, target_work_order_id: val })}>

                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="This work order" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={null}>This Work Order</SelectItem>
                            {allWorkOrders.
                          filter((wo) => wo.id !== workOrder.id).
                          map((wo) =>
                          <SelectItem key={wo.id} value={wo.id}>{wo.title}</SelectItem>
                          )
                          }
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-2 justify-end">
                        <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditingDependency(false)}
                        className="h-6 px-2 text-xs">

                          Cancel
                        </Button>
                        <Button
                        size="sm"
                        onClick={handleAddDependency}
                        className="h-6 px-2 text-xs bg-blue-600 text-white">

                          Add Rule
                        </Button>
                      </div>
                    </div>
                  }

                  {/* Existing Dependencies */}
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {dependencies.map((dep) => {
                      const targetWO = allWorkOrders.find((wo) => wo.id === dep.target_work_order_id);
                      return (
                        <div key={dep.id} className="p-2 bg-yellow-50 rounded-lg flex items-start gap-2">
                          <Zap className="w-3 h-3 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs">
                              <span className="font-medium">When</span> {dep.trigger_type.replace('_', ' ')} = {dep.trigger_value}
                            </p>
                            <p className="text-xs">
                              <span className="font-medium">Then</span> {dep.action_type.replace('_', ' ')} = {dep.action_value}
                            </p>
                            {dep.target_work_order_id && targetWO &&
                            <p className="text-xs text-gray-500">Target: {targetWO.title}</p>
                            }
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteDependency(dep.id)}
                            className="h-5 w-5 flex-shrink-0">

                            <Trash2 className="w-3 h-3 text-red-600" />
                          </Button>
                        </div>);

                    })}
                    
                    {dependencies.length === 0 && !isEditingDependency &&
                    <p className="text-xs text-gray-400 text-center py-2">No automation rules</p>
                    }
                  </div>
                </div>
              </div>

              {/* Right Column - Actions */}
              <div className="space-y-4">
                {/* Quick Actions */}
                <div className="clay-card p-4">
                  <h3 className="font-semibold text-sm mb-3">Quick Actions</h3>
                  <div className="space-y-2">
                    {!workOrder.is_rider && onSplit &&
                    <Button
                      className="w-full justify-start clay-button"
                      variant="ghost"
                      onClick={() => {onSplit(workOrder);onClose();}}>

                        <Plus className="w-4 h-4 mr-2" />
                        Create Rider
                      </Button>
                    }

                    {onComplete && !workOrder.completed &&
                    <Button
                      className="w-full justify-start clay-button"
                      variant="ghost"
                      onClick={() => {onComplete(workOrder);onClose();}}>

                        <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                        Mark Complete
                      </Button>
                    }

                    <Button
                      className="w-full justify-start clay-button text-red-600 hover:text-red-700"
                      variant="ghost"
                      onClick={handleDeleteWorkOrder}>

                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete {workOrder.is_rider ? 'Rider' : 'Work Order'}
                    </Button>
                  </div>
                </div>

                {/* Move to Stage */}
                {!workOrder.is_rider && onMove &&
                <div className="clay-card p-4">
                    <h3 className="font-semibold text-sm mb-3">Move to Stage</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.keys(stageDisplayNames).map((stage) =>
                    <Button
                      key={stage}
                      className="clay-button text-xs justify-start"
                      variant="ghost"
                      size="sm"
                      disabled={workOrder.current_stage === stage}
                      onClick={() => {onMove(workOrder, stage);onClose();}}
                      style={{
                        background: workOrder.current_stage === stage ?
                        `linear-gradient(135deg, ${stageColors[stage]} 0%, rgba(255,255,255,0.9) 100%)` :
                        undefined,
                        opacity: workOrder.current_stage === stage ? 0.5 : 1
                      }}>

                          <ArrowRight className="w-3 h-3 mr-1" />
                          {stageDisplayNames[stage]}
                        </Button>
                    )}
                    </div>
                  </div>
                }

                {/* Restore Options (for completed work orders) */}
                {onRestore && workOrder.completed &&
                <div className="clay-card p-4">
                    <h3 className="font-semibold text-sm mb-3">Restore to Stage</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {['permitting', 'design', 'production', 'fabrication', 'installation'].map((stage) =>
                    <Button
                      key={stage}
                      className="clay-button text-xs justify-start"
                      variant="ghost"
                      size="sm"
                      onClick={() => {onRestore(workOrder, stage);onClose();}}>

                          <ArrowRight className="w-3 h-3 mr-1" />
                          {stageDisplayNames[stage]}
                        </Button>
                    )}
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {workOrder.is_rider ? 'Rider' : 'Work Order'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{workOrder.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>);

}