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
  Pencil,
  FolderOpen,
  ExternalLink,
  Copy
} from "lucide-react";
import { format } from "date-fns";

// Helper to parse date string as local date (not UTC)
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { UploadFile } from "@/integrations/Core";
import { ActivityActions } from "./ActivityLogger";
import WorkOrderOrders from "../orders/WorkOrderOrders";
import GoogleDriveFileBrowser from "./GoogleDriveFileBrowser";
import EmbeddedDriveFiles from "./EmbeddedDriveFiles";

import { base44 } from "@/api/base44Client";
import { List } from "lucide-react";
import TaskTemplateDialog from "./TaskTemplateDialog";
import WorkOrderTimeEntries from "./WorkOrderTimeEntries";
import ClientInfoSection from "./ClientInfoSection";
import SipChecklistSection from "./SipChecklistSection";
import CreateRiderDialog from "./CreateRiderDialog";
import WorkOrderForm from "./WorkOrderForm";
import WorkOrderFiles from "./WorkOrderFiles";
import EstimatorProjectsPanel from "./EstimatorProjectsPanel";
import { useAuth } from "@/components/auth/EmailGate";
import ProjectHealthBadge, { calculateProjectHealth } from "./ProjectHealthBadge";
import TaskDependencyManager from "./TaskDependencyManager";
import MilestoneManager from "./MilestoneManager";
import MultiUserSelect from "@/components/shared/MultiUserSelect";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

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
  const { currentUser } = useAuth();
  const [allWorkOrders, setAllWorkOrders] = useState([]);
  const [riders, setRiders] = useState([]);
  const [parentWorkOrder, setParentWorkOrder] = useState(null);
  const [dependencies, setDependencies] = useState([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showCompletedNotes, setShowCompletedNotes] = useState(false);
  const [isEditingDependency, setIsEditingDependency] = useState(false);
  const [allUsers, setAllUsers] = useState([]);

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
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState("");
  const [newTaskAdditionalAssignees, setNewTaskAdditionalAssignees] = useState([]);
  const [editingTaskIndex, setEditingTaskIndex] = useState(null);
  const [editedTaskText, setEditedTaskText] = useState("");
  const [editedTaskAssignedTo, setEditedTaskAssignedTo] = useState("");
  const [editedTaskAdditionalAssignees, setEditedTaskAdditionalAssignees] = useState([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [addingSubTaskFor, setAddingSubTaskFor] = useState(null);
  const [newSubTaskText, setNewSubTaskText] = useState("");
  const [showDriveBrowser, setShowDriveBrowser] = useState(false);
  const [addingDetailFor, setAddingDetailFor] = useState(null); // { taskIndex, subTaskIndex }
  const [newDetailText, setNewDetailText] = useState("");
  const [showCreateRiderDialog, setShowCreateRiderDialog] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [duplicateData, setDuplicateData] = useState(null);

  useEffect(() => {
    if (isOpen && workOrder) {
      loadRelatedData();
      loadUsers();
    }
  }, [isOpen, workOrder]);

  const loadUsers = async () => {
    const users = await AuthorizedEmail.list();
    setAllUsers(users);
  };

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
      start_date: workOrder.start_date,
      google_drive_folder_url: workOrder.google_drive_folder_url
    });
  };

  const saveEdit = async (field) => {
    const oldValue = workOrder[field];
    const newValue = editValues[field];
    await WorkOrder.update(workOrder.id, { [field]: newValue });
    await ActivityActions.fieldUpdated(workOrder, field, oldValue, newValue);
    
    // Update the local workOrder object immediately
    Object.assign(workOrder, { [field]: newValue });
    
    setEditingField(null);
    
    // Don't refresh the entire page for google drive URL changes
    if (field !== 'google_drive_folder_url') {
      if (onUpdate) await onUpdate();
      await loadRelatedData();
    }
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
    // Optimistic update - update UI immediately
    Object.assign(workOrder, { notes: updatedTasks });
    if (onUpdate) onUpdate();
    // Then persist to database
    await WorkOrder.update(workOrder.id, { notes: updatedTasks });
    if (wasCompleted) {
      await ActivityActions.taskUncompleted(workOrder, taskText);
    } else {
      await ActivityActions.taskCompleted(workOrder, taskText);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskText.trim()) return;
    const newTask = {
      id: Date.now().toString(),
      text: newTaskText,
      timestamp: new Date().toISOString(),
      created_by: currentUser?.full_name || currentUser?.email || "Unknown",
      assigned_to: newTaskAssignedTo || "",
      additional_assignees: newTaskAdditionalAssignees || [],
      completed: false,
      sub_tasks: [],
      depends_on: [],
      estimated_hours: 0,
      is_milestone: false
    };
    const updatedTasks = [...tasks, newTask];
    // Optimistic update - update UI immediately
    Object.assign(workOrder, { notes: updatedTasks });
    setNewTaskText("");
    setNewTaskAssignedTo("");
    setNewTaskAdditionalAssignees([]);
    setIsAddingTask(false);
    if (onUpdate) onUpdate();
    // Then persist to database
    await WorkOrder.update(workOrder.id, { notes: updatedTasks });
    await ActivityActions.taskAdded(workOrder, newTaskText);
  };

  const [newSubTaskAssignedTo, setNewSubTaskAssignedTo] = useState("");
  const [newSubTaskAdditionalAssignees, setNewSubTaskAdditionalAssignees] = useState([]);
  const [newDetailAssignedTo, setNewDetailAssignedTo] = useState("");
  const [newDetailAdditionalAssignees, setNewDetailAdditionalAssignees] = useState([]);

  const handleAddTaskSubTask = async (taskIndex) => {
    if (!newSubTaskText.trim()) return;
    
    const updatedTasks = tasks.map((task, idx) => {
      if (idx === taskIndex) {
        return {
          text: task.text,
          timestamp: task.timestamp,
          created_by: task.created_by,
          completed: task.completed || false,
          assigned_to: task.assigned_to,
          additional_assignees: task.additional_assignees || [],
          sub_tasks: [...(task.sub_tasks || []), { 
            text: newSubTaskText, 
            completed: false,
            assigned_to: newSubTaskAssignedTo || "",
            additional_assignees: newSubTaskAdditionalAssignees || []
          }]
        };
      }
      return {
        text: task.text,
        timestamp: task.timestamp,
        created_by: task.created_by,
        completed: task.completed || false,
        assigned_to: task.assigned_to,
        additional_assignees: task.additional_assignees || [],
        sub_tasks: task.sub_tasks || []
      };
    });
    // Optimistic update - update UI immediately
    Object.assign(workOrder, { notes: updatedTasks });
    setNewSubTaskText("");
    setNewSubTaskAssignedTo("");
    setNewSubTaskAdditionalAssignees([]);
    setAddingSubTaskFor(null);
    if (onUpdate) onUpdate();
    // Then persist to database
    await WorkOrder.update(workOrder.id, { notes: updatedTasks });
  };

  const handleToggleTaskSubTask = async (taskIndex, subTaskIndex) => {
    const updatedTasks = tasks.map((task, idx) => {
      if (idx === taskIndex) {
        const updatedSubTasks = (task.sub_tasks || []).map((st, stIdx) => {
          if (stIdx === subTaskIndex) {
            return { ...st, text: st.text, completed: !st.completed, details: st.details || [] };
          }
          return { ...st, text: st.text, completed: st.completed, details: st.details || [] };
        });
        return {
          text: task.text,
          timestamp: task.timestamp,
          created_by: task.created_by,
          completed: task.completed || false,
          sub_tasks: updatedSubTasks
        };
      }
      return {
        text: task.text,
        timestamp: task.timestamp,
        created_by: task.created_by,
        completed: task.completed || false,
        sub_tasks: task.sub_tasks || []
      };
    });
    // Optimistic update - update UI immediately
    Object.assign(workOrder, { notes: updatedTasks });
    if (onUpdate) onUpdate();
    // Then persist to database
    await WorkOrder.update(workOrder.id, { notes: updatedTasks });
  };

  const handleAddTaskDetail = async (taskIndex, subTaskIndex) => {
    if (!newDetailText.trim()) return;
    
    const updatedTasks = tasks.map((task, idx) => {
      if (idx === taskIndex) {
        const updatedSubTasks = (task.sub_tasks || []).map((st, stIdx) => {
          if (stIdx === subTaskIndex) {
            return {
              ...st,
              details: [...(st.details || []), { 
                text: newDetailText, 
                completed: false, 
                assigned_to: newDetailAssignedTo || "",
                additional_assignees: newDetailAdditionalAssignees || []
              }]
            };
          }
          return st;
        });
        return { ...task, sub_tasks: updatedSubTasks };
      }
      return task;
    });
    
    Object.assign(workOrder, { notes: updatedTasks });
    setNewDetailText("");
    setNewDetailAssignedTo("");
    setNewDetailAdditionalAssignees([]);
    setAddingDetailFor(null);
    if (onUpdate) onUpdate();
    await WorkOrder.update(workOrder.id, { notes: updatedTasks });
  };

  const handleToggleTaskDetail = async (taskIndex, subTaskIndex, detailIndex) => {
    const updatedTasks = tasks.map((task, idx) => {
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
    
    Object.assign(workOrder, { notes: updatedTasks });
    if (onUpdate) onUpdate();
    await WorkOrder.update(workOrder.id, { notes: updatedTasks });
  };

  const handleDeleteTaskDetail = async (taskIndex, subTaskIndex, detailIndex) => {
    const updatedTasks = tasks.map((task, idx) => {
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
    
    Object.assign(workOrder, { notes: updatedTasks });
    if (onUpdate) onUpdate();
    await WorkOrder.update(workOrder.id, { notes: updatedTasks });
  };

  const handleDeleteTaskSubTask = async (taskIndex, subTaskIndex) => {
    const updatedTasks = tasks.map((task, idx) => {
      if (idx === taskIndex) {
        return {
          text: task.text,
          timestamp: task.timestamp,
          created_by: task.created_by,
          completed: task.completed || false,
          sub_tasks: (task.sub_tasks || []).filter((_, stIdx) => stIdx !== subTaskIndex)
        };
      }
      return {
        text: task.text,
        timestamp: task.timestamp,
        created_by: task.created_by,
        completed: task.completed || false,
        sub_tasks: task.sub_tasks || []
      };
    });
    // Optimistic update - update UI immediately
    Object.assign(workOrder, { notes: updatedTasks });
    if (onUpdate) onUpdate();
    // Then persist to database
    await WorkOrder.update(workOrder.id, { notes: updatedTasks });
  };

  const handleEditTask = async (taskIndex) => {
    if (!editedTaskText.trim()) return;
    const oldText = tasks[taskIndex].text;
    const updatedTasks = [...tasks];
    updatedTasks[taskIndex] = {
      ...updatedTasks[taskIndex],
      text: editedTaskText,
      assigned_to: editedTaskAssignedTo,
      additional_assignees: editedTaskAdditionalAssignees
    };
    // Optimistic update - update UI immediately
    Object.assign(workOrder, { notes: updatedTasks });
    setEditingTaskIndex(null);
    setEditedTaskText("");
    setEditedTaskAssignedTo("");
    setEditedTaskAdditionalAssignees([]);
    if (onUpdate) onUpdate();
    // Then persist to database
    await WorkOrder.update(workOrder.id, { notes: updatedTasks });
    await ActivityActions.taskEdited(workOrder, oldText, editedTaskText);
  };

  const handleDeleteTask = async (taskIndex) => {
    const updatedTasks = tasks.filter((_, idx) => idx !== taskIndex);
    // Optimistic update - update UI immediately
    Object.assign(workOrder, { notes: updatedTasks });
    if (onUpdate) onUpdate();
    // Then persist to database
    await WorkOrder.update(workOrder.id, { notes: updatedTasks });
    await ActivityActions.taskDeleted(workOrder);
  };

  const handleAddWorkNote = async (noteData) => {
    const newNote = {
      ...noteData,
      timestamp: new Date().toISOString(),
      id: Date.now(),
      created_by: currentUser?.full_name || currentUser?.email || "Unknown",
      sub_tasks: []
    };
    const updatedNotes = [...workNotes, newNote];
    await WorkOrder.update(workOrder.id, { work_notes: updatedNotes });
    await ActivityActions.noteAdded(workOrder, noteData.text, noteData.type);
    Object.assign(workOrder, { work_notes: updatedNotes });
    await loadRelatedData();
  };

  // Local state to force re-render when notes change
  const [localNotesVersion, setLocalNotesVersion] = useState(0);

  const handleDeleteWorkNote = async (noteId) => {
    const updatedNotes = workNotes.filter((n) => n.id !== noteId);
    // Optimistic update - update UI immediately by modifying workOrder directly
    Object.assign(workOrder, { work_notes: updatedNotes });
    // Force re-render by incrementing version
    setLocalNotesVersion(v => v + 1);
    // Then persist to database
    await WorkOrder.update(workOrder.id, { work_notes: updatedNotes });
    await ActivityActions.noteDeleted(workOrder);
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
        completed: note.completed || false,
        sub_tasks: note.sub_tasks || []
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
      <Dialog open={isOpen} onOpenChange={onClose} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogContent className="clay-card border-none max-w-[95vw] w-[1400px] max-h-[95vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <div className="px-6 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  {editingField === 'client_name' ?
                  <div className="flex items-center gap-2 flex-1">
                      <Input
                      value={editValues.client_name}
                      onChange={(e) => setEditValues({ ...editValues, client_name: e.target.value })}
                      className="text-2xl font-bold h-10"
                      autoFocus />

                      <Button size="sm" onClick={() => saveEdit('client_name')} className="h-8">
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-8">
                        <X className="w-4 h-4" />
                      </Button>
                    </div> :

                  <>
                        <h2
                      className="text-2xl font-bold text-gray-800 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                      onClick={() => startEdit('client_name')}>

                          {workOrder.client_name}
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
                        <ProjectHealthBadge workOrder={workOrder} />
                      </>
                  }
                </div>
              </div>
            </div>
          </div>

          {/* Work Notes - Spreadsheet Style, Full Width */}
          <div className="px-6 py-3 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Notes</h3>
              <Popover open={editingField === 'addNote'} onOpenChange={(open) => open ? setEditingField('addNote') : setEditingField(null)} modal={true}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-3 text-xs">
                    <Plus className="w-3 h-3 mr-1" />
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
                      onClick={async () => {
                        if (editValues.noteType && editValues.noteText) {
                          await handleAddWorkNote({
                            type: editValues.noteType,
                            text: editValues.noteText
                          });
                          setEditValues({});
                          setEditingField(null);
                        }
                      }}>
                      Add Note
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Spreadsheet-style notes table */}
            <div className="border rounded-lg overflow-hidden" style={{ maxHeight: '120px', overflowY: 'auto' }}>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-700" style={{ width: '80px' }}>Type</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-700" style={{ width: '70px' }}>Date</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-700" style={{ width: '80px' }}>By</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-700">Note</th>
                    <th className="text-center px-2 py-1.5 font-medium text-gray-700" style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {workNotes.map((note, idx) => (
                    <tr key={note.id} className={`border-b last:border-b-0 hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-2 py-1.5">
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {note.type === 'admin' && 'Admin'}
                          {note.type === 'fabrication' && 'Fab'}
                          {note.type === 'vinyl' && 'Vinyl'}
                          {note.type === 'permitting' && 'Permit'}
                          {note.type === 'design' && 'Design'}
                          {note.type === 'installation' && 'Install'}
                          {note.type === 'client' && 'Client'}
                          {note.type === 'other' && 'Other'}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 text-gray-500">
                        {format(new Date(note.timestamp), "M/d/yy")}
                      </td>
                      <td className="px-2 py-1.5 text-gray-600 text-xs">
                        {note.created_by?.split(' ')[0] || '-'}
                      </td>
                      <td className="px-2 py-1.5 text-gray-700">
                        {note.text}
                        {note.sub_tasks && note.sub_tasks.length > 0 && (
                          <span className="text-gray-400 ml-2">({note.sub_tasks.length} sub-tasks)</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => handleDeleteWorkNote(note.id)}>
                          <X className="w-3 h-3 text-gray-400 hover:text-red-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {workNotes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-center text-gray-400">
                        No notes yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Main Content - Scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Client Information Section - Collapsible */}
            <div className="mb-6">
              <ClientInfoSection 
                workOrder={workOrder} 
                onUpdate={onUpdate} 
              />
            </div>

            {/* SIP Checklist Section - Collapsible */}
            <div className="mb-6">
              <SipChecklistSection 
                workOrder={workOrder} 
                onUpdate={onUpdate} 
              />
            </div>

            {/* Tasks - Full Width */}
            <div className="clay-card p-4 mb-6">
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
                    onClick={() => setShowTemplateDialog(true)}
                    className="h-6 px-2 text-xs">
                    <List className="w-3 h-3 mr-1" />
                    Templates
                  </Button>
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
                        if (e.key === 'Escape') {setIsAddingTask(false);setNewTaskText("");setNewTaskAssignedTo("");setNewTaskAdditionalAssignees([]);}
                      }} />
                    <div className="flex gap-2">
                      <Select value={newTaskAssignedTo} onValueChange={setNewTaskAssignedTo}>
                        <SelectTrigger className="h-8 text-sm flex-1">
                          <SelectValue placeholder="Primary assignee" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={null}>Unassigned</SelectItem>
                          {allUsers.map(user => (
                            <SelectItem key={user.id} value={user.full_name || user.email}>
                              {user.full_name || user.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <MultiUserSelect
                        users={allUsers}
                        selectedUsers={newTaskAdditionalAssignees}
                        onSelectionChange={setNewTaskAdditionalAssignees}
                        excludeUser={newTaskAssignedTo}
                        compact
                      />
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={handleAddTask} className="h-6 px-2 text-xs bg-green-100 hover:bg-green-200 text-green-800">
                        <Check className="w-3 h-3 mr-1" />Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => {setIsAddingTask(false);setNewTaskText("");setNewTaskAssignedTo("");setNewTaskAdditionalAssignees([]);}} className="h-6 px-2 text-xs">
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                }

                {activeTasks.map((task, idx) => {
                  const actualIndex = tasks.findIndex((t) => t === task);
                  return (
                    <div key={idx} className="bg-white/50 rounded-lg group/task [&_.hover-btn]:opacity-0 [&_.hover-btn]:h-0 [&_.hover-btn]:overflow-hidden [&:hover_.hover-btn]:opacity-100 [&:hover_.hover-btn]:h-auto [&_.hover-btn]:transition-all [&_.hover-btn]:duration-200 [&_.hover-btn]:delay-75">
                      <div className="p-2 flex items-start gap-2">
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
                                if (e.key === 'Escape') {setEditingTaskIndex(null);setEditedTaskText("");setEditedTaskAssignedTo("");setEditedTaskAdditionalAssignees([]);}
                              }} />
                            <div className="flex gap-2">
                              <Select value={editedTaskAssignedTo} onValueChange={setEditedTaskAssignedTo}>
                                <SelectTrigger className="h-8 text-sm flex-1">
                                  <SelectValue placeholder="Primary assignee" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={null}>Unassigned</SelectItem>
                                  {allUsers.map(user => (
                                    <SelectItem key={user.id} value={user.full_name || user.email}>
                                      {user.full_name || user.email}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <MultiUserSelect
                                users={allUsers}
                                selectedUsers={editedTaskAdditionalAssignees}
                                onSelectionChange={setEditedTaskAdditionalAssignees}
                                excludeUser={editedTaskAssignedTo}
                                compact
                              />
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" onClick={() => handleEditTask(actualIndex)} className="h-6 px-2 text-xs bg-green-100 hover:bg-green-200 text-green-800">
                                <Check className="w-3 h-3 mr-1" />Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => {setEditingTaskIndex(null);setEditedTaskText("");setEditedTaskAssignedTo("");setEditedTaskAdditionalAssignees([]);}} className="h-6 px-2 text-xs">
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div> :
                          <>
                            <div className="flex-1">
                              <div
                              className="cursor-pointer hover:bg-white/70 rounded px-1 transition-colors"
                              onClick={() => {setEditingTaskIndex(actualIndex);setEditedTaskText(task.text);setEditedTaskAssignedTo(task.assigned_to || "");setEditedTaskAdditionalAssignees(task.additional_assignees || []);}}>
                              <p className="text-sm text-gray-700">{task.text}</p>
                              <p className="text-xs text-gray-400 mt-1">
                                {format(new Date(task.timestamp), "MMM d, h:mm a")} • {task.created_by?.split('@')[0] || 'Unknown'}
                                {task.assigned_to && <span className="ml-2 text-blue-600">→ {task.assigned_to}</span>}
                                {task.additional_assignees?.length > 0 && (
                                  <span className="ml-1 text-purple-600">+{task.additional_assignees.length}</span>
                                )}
                                {task.estimated_hours > 0 && <span className="ml-2 text-purple-600">({task.estimated_hours}h)</span>}
                              </p>
                                {/* Task Dependencies */}
                                {tasks.length > 1 && (
                                  <div className="mt-1">
                                    <TaskDependencyManager
                                      tasks={tasks}
                                      currentTaskId={task.id}
                                      currentTaskIndex={actualIndex}
                                      onUpdateDependencies={async (newDeps) => {
                                        const updatedTasks = [...tasks];
                                        updatedTasks[actualIndex] = { ...updatedTasks[actualIndex], depends_on: newDeps };
                                        Object.assign(workOrder, { notes: updatedTasks });
                                        if (onUpdate) onUpdate();
                                        await WorkOrder.update(workOrder.id, { notes: updatedTasks });
                                      }}
                                      compact
                                    />
                                  </div>
                                )}
                              </div>
                              {/* Sub-tasks - always show all */}
                              {task.sub_tasks && task.sub_tasks.length > 0 && (
                                <div className="ml-4 mt-2 space-y-1">
                                  {task.sub_tasks.map((subTask, subIdx) => (
                                    <div key={subIdx} className="group/subtask [&_.hover-btn-detail]:opacity-0 [&_.hover-btn-detail]:h-0 [&_.hover-btn-detail]:overflow-hidden [&:hover_.hover-btn-detail]:opacity-100 [&:hover_.hover-btn-detail]:h-auto [&_.hover-btn-detail]:transition-all [&_.hover-btn-detail]:duration-200 [&_.hover-btn-detail]:delay-75">
                                      <div className="flex items-center gap-2 text-xs">
                                        <Checkbox
                                          checked={subTask.completed}
                                          onCheckedChange={() => handleToggleTaskSubTask(actualIndex, subIdx)}
                                          className="h-3 w-3" />
                                        <span className={subTask.completed ? "line-through text-gray-400" : "text-gray-600"}>{subTask.text}</span>
                                        {subTask.assigned_to && (
                                          <Badge variant="outline" className="text-[10px] text-blue-600 px-1 py-0">
                                            → {subTask.assigned_to}
                                          </Badge>
                                        )}
                                        {subTask.additional_assignees?.length > 0 && (
                                          <Badge variant="outline" className="text-[10px] text-purple-600 px-1 py-0">
                                            +{subTask.additional_assignees.length}
                                          </Badge>
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleDeleteTaskSubTask(actualIndex, subIdx)}
                                          className="h-4 w-4 ml-auto">
                                          <X className="w-2 h-2 text-red-500" />
                                        </Button>
                                      </div>
                                      {/* Subtask Details */}
                                      {subTask.details && subTask.details.length > 0 && (
                                        <div className="ml-6 mt-1 space-y-1">
                                          {subTask.details.map((detail, detailIdx) => (
                                            <div key={detailIdx} className="flex items-center gap-2 text-xs">
                                              <Checkbox
                                                checked={detail.completed}
                                                onCheckedChange={() => handleToggleTaskDetail(actualIndex, subIdx, detailIdx)}
                                                className="h-2.5 w-2.5" />
                                              <span className={`${detail.completed ? "line-through text-gray-400" : "text-gray-500"}`} style={{ fontSize: '11px' }}>{detail.text}</span>
                                              {detail.assigned_to && (
                                                <Badge variant="outline" className="text-[9px] text-blue-600 px-1 py-0">
                                                  → {detail.assigned_to}
                                                </Badge>
                                              )}
                                              {detail.additional_assignees?.length > 0 && (
                                                <Badge variant="outline" className="text-[9px] text-purple-600 px-1 py-0">
                                                  +{detail.additional_assignees.length}
                                                </Badge>
                                              )}
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDeleteTaskDetail(actualIndex, subIdx, detailIdx)}
                                                className="h-3 w-3 ml-auto">
                                                <X className="w-2 h-2 text-red-500" />
                                              </Button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {/* Add Detail - hover reveal */}
                                      {addingDetailFor?.taskIndex === actualIndex && addingDetailFor?.subTaskIndex === subIdx ? (
                                        <div className="ml-6 mt-1 space-y-1">
                                          <Input
                                            value={newDetailText}
                                            onChange={(e) => setNewDetailText(e.target.value)}
                                            placeholder="Detail..."
                                            className="h-5 text-xs"
                                            autoFocus
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleAddTaskDetail(actualIndex, subIdx);
                                              if (e.key === 'Escape') {setAddingDetailFor(null);setNewDetailText("");setNewDetailAssignedTo("");setNewDetailAdditionalAssignees([]);}
                                            }} />
                                          <div className="flex gap-2">
                                            <Select value={newDetailAssignedTo} onValueChange={setNewDetailAssignedTo}>
                                              <SelectTrigger className="h-5 text-xs flex-1">
                                                <SelectValue placeholder="Primary assignee" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value={null}>Unassigned</SelectItem>
                                                {allUsers.map(user => (
                                                  <SelectItem key={user.id} value={user.full_name || user.email}>
                                                    {user.full_name || user.email}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                            <MultiUserSelect
                                              users={allUsers}
                                              selectedUsers={newDetailAdditionalAssignees}
                                              onSelectionChange={setNewDetailAdditionalAssignees}
                                              excludeUser={newDetailAssignedTo}
                                              compact
                                            />
                                          </div>
                                          <div className="flex gap-1">
                                            <Button size="sm" onClick={() => handleAddTaskDetail(actualIndex, subIdx)} className="h-5 px-2">
                                              <Check className="w-3 h-3" />
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => {setAddingDetailFor(null);setNewDetailText("");setNewDetailAssignedTo("");setNewDetailAdditionalAssignees([]);}} className="h-5 px-2">
                                              <X className="w-3 h-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="ml-6 mt-0.5 hover-btn-detail">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setAddingDetailFor({ taskIndex: actualIndex, subTaskIndex: subIdx })}
                                            className="h-4 px-1 text-xs"
                                            style={{ fontSize: '10px' }}>
                                            <Plus className="w-2 h-2 mr-0.5" />
                                            Detail
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* Add sub-task - hover reveal */}
                              {addingSubTaskFor === actualIndex ? (
                                <div className="ml-4 mt-2 space-y-1">
                                  <Input
                                    value={newSubTaskText}
                                    onChange={(e) => setNewSubTaskText(e.target.value)}
                                    placeholder="Sub-task..."
                                    className="h-6 text-xs"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleAddTaskSubTask(actualIndex);
                                      if (e.key === 'Escape') {setAddingSubTaskFor(null);setNewSubTaskText("");setNewSubTaskAssignedTo("");setNewSubTaskAdditionalAssignees([]);}
                                    }} />
                                  <div className="flex gap-2">
                                    <Select value={newSubTaskAssignedTo} onValueChange={setNewSubTaskAssignedTo}>
                                      <SelectTrigger className="h-6 text-xs flex-1">
                                        <SelectValue placeholder="Primary assignee" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value={null}>Unassigned</SelectItem>
                                        {allUsers.map(user => (
                                          <SelectItem key={user.id} value={user.full_name || user.email}>
                                            {user.full_name || user.email}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <MultiUserSelect
                                      users={allUsers}
                                      selectedUsers={newSubTaskAdditionalAssignees}
                                      onSelectionChange={setNewSubTaskAdditionalAssignees}
                                      excludeUser={newSubTaskAssignedTo}
                                      compact
                                    />
                                  </div>
                                  <div className="flex gap-1">
                                    <Button size="sm" onClick={() => handleAddTaskSubTask(actualIndex)} className="h-6 px-2">
                                      <Check className="w-3 h-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => {setAddingSubTaskFor(null);setNewSubTaskText("");setNewSubTaskAssignedTo("");setNewSubTaskAdditionalAssignees([]);}} className="h-6 px-2">
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="ml-4 mt-1 hover-btn">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setAddingSubTaskFor(actualIndex)}
                                    className="h-5 px-2 text-xs">
                                    <Plus className="w-2 h-2 mr-1" />
                                    Sub-task
                                  </Button>
                                </div>
                              )}
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
                      </div>
                    </div>
                  );
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
                            onClick={() => {setEditingTaskIndex(actualIndex);setEditedTaskText(task.text);setEditedTaskAssignedTo(task.assigned_to || "");}}>
                            <p className="text-sm text-gray-600 line-through">{task.text}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {format(new Date(task.timestamp), "MMM d, h:mm a")} • {task.created_by?.split('@')[0] || 'Unknown'}
                              {task.assigned_to && <span className="ml-2 text-blue-600">→ {task.assigned_to}</span>}
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
                    </div>
                  );
                })}

                {activeTasks.length === 0 && !isAddingTask &&
                  <p className="text-xs text-gray-400 text-center py-2">No active tasks</p>
                }
              </div>
            </div>

            {/* Material Orders - Full Width Section */}
            <div className="clay-card p-4 mb-6">
              <h3 className="font-semibold text-lg mb-3">Material Orders</h3>
              <WorkOrderOrders 
                workOrderId={workOrder.id} 
                workOrderTitle={workOrder.title}
                clientName={workOrder.client_name}
              />
            </div>

            {/* Timeline inside scrollable area */}
            {timelineData && (
              <div className="mb-4 clay-card p-4">
                <h3 className="font-semibold text-sm mb-3">Project Timeline</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-2">
                    <span>{format(timelineData.earliestStart, "MMM d, yyyy")}</span>
                    <span>{format(timelineData.latestEnd, "MMM d, yyyy")}</span>
                  </div>
                  
                  {timelineData.bars.map((bar) => (
                    <div key={bar.id} className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium" style={{
                            color: bar.type === 'parent' ? '#6B7280' : bar.isCurrent ? '#7C3AED' : '#EC4899'
                          }}>
                            {bar.type === 'parent' ? '↑ Parent' : bar.isCurrent ? '● Current' : '↓ Rider'}: {bar.title}
                          </span>
                        </div>
                        <Badge className="text-xs" style={{ backgroundColor: stageColors[bar.current_stage] }}>
                          {stageDisplayNames[bar.current_stage]}
                        </Badge>
                      </div>
                      
                      <div className="relative h-10 rounded-lg bg-gray-100">
                        <div
                          className="absolute h-full rounded-lg transition-all flex items-center justify-center"
                          style={{
                            left: `${bar.startOffset}%`,
                            width: `${bar.width}%`,
                            background: bar.isCurrent ?
                              `linear-gradient(135deg, ${stageColors[bar.current_stage]} 0%, rgba(255,255,255,0.7) 100%)` :
                              bar.type === 'parent' ?
                              'linear-gradient(135deg, rgba(150,150,150,0.6) 0%, rgba(200,200,200,0.6) 100%)' :
                              'linear-gradient(135deg, rgba(255,182,193,0.8) 0%, rgba(221,160,221,0.8) 100%)',
                            border: bar.isCurrent ? '2px solid #7C3AED' : '1px solid rgba(0,0,0,0.3)',
                            boxShadow: bar.isCurrent ? '0 0 12px rgba(124,58,237,0.5)' : '0 2px 4px rgba(0,0,0,0.1)'
                          }}
                        >
                          <span className="text-xs font-medium text-gray-800">
                            {format(new Date(bar.start_date), "MMM d")} - {format(new Date(bar.due_date), "MMM d")}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full mt-3">
                      <Calendar className="w-3 h-3 mr-2" />
                      Edit Dates
                    </Button>
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
            )}
            {/* Three column layout */}
            <div className="grid grid-cols-3 gap-6 mb-6">

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
                        <Calendar className="w-4 h-4 text-orange-600" />
                        <span className="font-medium">Due:</span>
                        <span className="text-gray-600">
                          {workOrder.due_date ? format(parseLocalDate(workOrder.due_date), "MMM d, yyyy") : 'No due date'}
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

                {/* Milestones */}
                <div className="clay-card p-4">
                  <MilestoneManager
                    milestones={workOrder.milestones || []}
                    tasks={tasks}
                    onUpdate={async (newMilestones) => {
                      await WorkOrder.update(workOrder.id, { milestones: newMilestones });
                      Object.assign(workOrder, { milestones: newMilestones });
                      if (onUpdate) onUpdate();
                    }}
                    compact
                  />
                </div>

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

              {/* Middle Column - Description and Google Drive */}
              <div className="space-y-4">
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

                {/* Uploaded Files */}
                <WorkOrderFiles workOrder={workOrder} onUpdate={onUpdate} />

                {/* Google Drive - Compact */}
                <div className="clay-card p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-green-600" />
                      Google Drive
                    </h3>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => startEdit('google_drive_folder_url')}
                      className="h-6 px-2 text-xs"
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      {workOrder.google_drive_folder_url ? 'Edit' : 'Link'}
                    </Button>
                  </div>
                  {editingField === 'google_drive_folder_url' ? (
                    <div className="space-y-2 mt-2">
                      <Input
                        value={editValues.google_drive_folder_url || ''}
                        onChange={(e) => setEditValues({ ...editValues, google_drive_folder_url: e.target.value })}
                        placeholder="https://drive.google.com/drive/folders/..."
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit('google_drive_folder_url')}>
                          <Check className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : workOrder.google_drive_folder_url ? (
                    <Button
                      onClick={() => window.open(workOrder.google_drive_folder_url, '_blank')}
                      className="w-full mt-2 gap-2"
                      size="sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open in Drive
                    </Button>
                  ) : (
                    <p className="text-xs text-gray-400 mt-2 text-center">No folder linked</p>
                  )}
                </div>
              </div>

              {/* Right Column - Actions */}
              <div className="space-y-4">
                <div className="clay-card p-4">
                  <h3 className="font-semibold text-sm mb-2">Actions</h3>
                  <div className="space-y-2">
                    {!workOrder.is_rider && (
                    <Button
                      className="w-full justify-start clay-button"
                      variant="ghost"
                      onClick={() => setShowCreateRiderDialog(true)}>

                        <Plus className="w-4 h-4 mr-2" />
                        Create Rider
                      </Button>
                    )}

                    {onComplete && !workOrder.completed &&
                    <Button
                      className="w-full justify-start clay-button"
                      variant="ghost"
                      onClick={() => setShowCompleteConfirm(true)}>

                        <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                        Mark Complete
                      </Button>
                    }

                    <Button
                      className="w-full justify-start clay-button"
                      variant="ghost"
                      onClick={() => {
                        // Copy all fields from current work order for duplicating
                        const { id, created_date, updated_date, created_by, notes, work_notes, follow_up, ...dataWithoutId } = workOrder;
                        setDuplicateData({
                          ...dataWithoutId,
                          title: "", // Clear title so user must enter new one
                          description: "", // Clear description
                          notes: [],
                          work_notes: [],
                          follow_up: [],
                          current_stage: "estimating"
                        });
                        setShowDuplicateForm(true);
                      }}>
                      <Copy className="w-4 h-4 mr-2 text-blue-600" />
                      Duplicate Client
                    </Button>

                    <Button
                      className="w-full justify-start clay-button text-red-600 hover:text-red-700"
                      variant="ghost"
                      onClick={handleDeleteWorkOrder}>

                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete {workOrder.is_rider ? 'Rider' : 'Work Order'}
                    </Button>
                  </div>
                </div>

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

              {/* Foundation Estimates */}
              <div className="clay-card p-4">
                <EstimatorProjectsPanel 
                  workOrderId={workOrder.id}
                  clientName={workOrder.client_name}
                />
              </div>

              </div>
              </div>

            {/* Time Entries Section - Full Width at Bottom */}
            <div className="clay-card p-4 mb-6">
              <WorkOrderTimeEntries 
                workOrderId={workOrder.id}
                workOrderTitle={workOrder.title}
              />
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

      {/* Complete Confirmation Dialog */}
      <AlertDialog open={showCompleteConfirm} onOpenChange={setShowCompleteConfirm}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Complete?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark "{workOrder.title}" as complete?
              <br /><br />
              This will send an email notification to the team.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (onComplete) onComplete(workOrder);
                setShowCompleteConfirm(false);
                onClose();
              }} 
              className="bg-green-600 text-white hover:bg-green-700">
              Mark Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task Template Dialog */}
      <TaskTemplateDialog
        isOpen={showTemplateDialog}
        onClose={() => setShowTemplateDialog(false)}
        onUseTemplate={async (template) => {
          const newTasks = template.tasks.map(t => ({
            text: t.text,
            timestamp: new Date().toISOString(),
            created_by: "Template",
            completed: false,
            sub_tasks: (t.sub_tasks || []).map(st => ({
              text: typeof st === 'string' ? st : (st.text || ''),
              completed: false,
              details: (typeof st === 'object' && st.details) ? st.details.map(d => ({ text: d, completed: false })) : []
            }))
          }));
          const updatedTasks = [...tasks, ...newTasks];
          // Optimistic update - update UI immediately without full refresh
          Object.assign(workOrder, { notes: updatedTasks });
          setShowTemplateDialog(false);
          // Then persist to database (don't call onUpdate to avoid page refresh)
          await WorkOrder.update(workOrder.id, { notes: updatedTasks });
        }}
      />

      {/* Create Rider Dialog */}
      <CreateRiderDialog
        isOpen={showCreateRiderDialog}
        onClose={() => setShowCreateRiderDialog(false)}
        parentWorkOrder={workOrder}
        onCreated={(rider) => {
          if (onUpdate) onUpdate();
          loadRelatedData();
        }}
      />

      {/* Duplicate Client - Full Form */}
      {showDuplicateForm && (
        <WorkOrderForm
          key={workOrder.id + '-duplicate'}
          isOpen={showDuplicateForm}
          onClose={() => { setShowDuplicateForm(false); setDuplicateData(null); }}
          onSave={async (data) => {
            await WorkOrder.create(data);
            setShowDuplicateForm(false);
            setDuplicateData(null);
            if (onUpdate) onUpdate();
          }}
          initialData={duplicateData}
          existingWorkOrders={allWorkOrders}
        />
      )}

      {/* Google Drive File Browser */}
      <GoogleDriveFileBrowser
        isOpen={showDriveBrowser}
        onClose={() => setShowDriveBrowser(false)}
        folderUrl={workOrder.google_drive_folder_url}
        workOrderTitle={workOrder.title}
        onFileIdsUpdate={async (fileId) => {
          const currentIds = workOrder.google_drive_file_ids || [];
          if (!currentIds.includes(fileId)) {
            await WorkOrder.update(workOrder.id, {
              google_drive_file_ids: [...currentIds, fileId]
            });
          }
        }}
      />
    </>);

}