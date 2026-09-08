import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MoreVertical,
  User,
  Calendar,
  FileText,
  Ruler,
  Package,
  Plus,
  Check,
  X,
  Upload,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff } from
"lucide-react";
import { useAuth } from "@/components/auth/EmailGate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger } from
"@/components/ui/dropdown-menu";
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
import { format } from "date-fns";

// Helper to parse date string as local date (not UTC)
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};
import { UploadFile } from "@/integrations/Core";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import WorkOrderDetailsDialog from "./WorkOrderDetailsDialog";
import { ActivityActions } from "./ActivityLogger";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import TaskTemplateDialog from "./TaskTemplateDialog";
import ProjectHealthBadge from "./ProjectHealthBadge";
import MultiUserSelectInline from "@/components/shared/MultiUserSelectInline";
import {
  createWorkOrderArrayItemLocator,
  findWorkOrderArrayItemIndex,
  mutateLocatedWorkOrderArrayItem,
  mutateWorkOrderArrayField,
  replaceWorkOrderFieldsIfUnchanged,
} from "@/components/workflow/workOrderPersistence";

const WorkOrder = base44.entities.WorkOrder;

const stageColors = {
  estimating: "#FFF9C4", // Added Estimating color
  sales: "#B2DFDB", // Added Sales color
  permitting: "#FFE4D6",
  design: "#D4E9F7",
  production: "#C8F4E9",
  fabrication: "#FFD6E8",
  installation: "#E0D4F7",
  completed: "#C8F4E9"
};

export default function WorkOrderCard({
  workOrder,
  onEdit,
  onMove,
  onSplit,
  onComplete,
  onRestore,
  onUpdate,
  onDelete,
  showMoveOptions = true,
  priorityNumber,
  dragHandleProps = null
}) {
  const stageColor = stageColors[workOrder.current_stage] || "#E0D4F7";
  const isTopPriority = priorityNumber === 1;
  const isAsap = workOrder.asap || false;
  
  const { isRegistered, promptForEmail } = useAuth();
  
  const requireAuth = (callback) => {
    return (e) => {
      if (!isRegistered) {
        e?.preventDefault();
        e?.stopPropagation();
        promptForEmail();
        return;
      }
      callback(e);
    };
  };

  // Calculate yellow shade based on priority (fades from bright to light)
  const getYellowShade = (priority) => {
    if (priority === 1) return { border: '#FFD700', shadow: 'rgba(255, 215, 0, 0.4)' };
    if (priority === 2) return { border: '#FFE44D', shadow: 'rgba(255, 228, 77, 0.3)' };
    if (priority === 3) return { border: '#FFEB7A', shadow: 'rgba(255, 235, 122, 0.25)' };
    if (priority === 4) return { border: '#FFF0A0', shadow: 'rgba(255, 240, 160, 0.2)' };
    if (priority === 5) return { border: '#FFF5C0', shadow: 'rgba(255, 245, 192, 0.15)' };
    return { border: '#FFFAE0', shadow: 'rgba(255, 250, 224, 0.1)' };
  };

  const yellowShade = getYellowShade(priorityNumber);

  // ASAP red highlight
  const asapHighlight = { border: '#DC2626', shadow: 'rgba(220, 38, 38, 0.5)' };

  // Use ASAP red if toggled, otherwise use yellow gradient
  const highlight = isAsap ? asapHighlight : yellowShade;

  const [editingNoteIndex, setEditingNoteIndex] = useState(null);
  const [editedNoteText, setEditedNoteText] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showRiderWarning, setShowRiderWarning] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);

  // Added state for delete functionality
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRiderDeleteWarning, setShowRiderDeleteWarning] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  // Check if this work order has any riders and store them
  const [riders, setRiders] = React.useState(workOrder._riders || []);
  const [parentWorkOrder, setParentWorkOrder] = React.useState(workOrder._parent || null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showAddTaskMenu, setShowAddTaskMenu] = useState(false);
  const [addingSubTaskFor, setAddingSubTaskFor] = useState(null);
  const [newSubTaskText, setNewSubTaskText] = useState("");
  const [showIncompleteSubtasksDialog, setShowIncompleteSubtasksDialog] = useState(false);
  const [incompleteSubtasksData, setIncompleteSubtasksData] = useState(null);
  const [addingDetailFor, setAddingDetailFor] = useState(null); // { taskIndex, subTaskIndex }
  const [newDetailText, setNewDetailText] = useState("");
  const [allUsers, setAllUsers] = useState([]);

  const notes = React.useMemo(() => {
    if (!workOrder.notes) return [];
    if (Array.isArray(workOrder.notes)) {
      return workOrder.notes.map((note) => ({
        ...note,
        completed: note.completed || false,
        sub_tasks: note.sub_tasks || []
      }));
    }
    if (typeof workOrder.notes === 'string' && workOrder.notes.trim()) {
      return [{
        text: workOrder.notes,
        timestamp: workOrder.created_date || new Date().toISOString(),
        created_by: workOrder.created_by || "Unknown",
        completed: false,
        sub_tasks: []
      }];
    }
    return [];
  }, [workOrder.notes, workOrder.created_date, workOrder.created_by]);

  const activeNotes = notes.filter((note) => !note.completed);
  const completedNotes = notes.filter((note) => note.completed);

  React.useEffect(() => {
    loadUser();
    loadAllUsers();
  }, []);

  const loadAllUsers = async () => {
    try {
      const users = await base44.entities.AuthorizedEmail.list();
      setAllUsers(users);
    } catch (error) {
      console.error("Error loading users:", error);
    }
  };

  // Riders and parent are passed in via workOrder._riders / workOrder._parent by the parent page
  // to avoid N+1 API calls per card. Only fetch if not already provided.
  React.useEffect(() => {
    if (workOrder._riders !== undefined || workOrder._parent !== undefined) return; // already provided
    const checkForRidersAndParent = async () => {
      if (!workOrder.is_rider && workOrder.id) {
        const attachedRiders = await WorkOrder.filter({
          parent_work_order_id: workOrder.id,
          is_rider: true,
          completed: false
        });
        setRiders(attachedRiders);
      }
      if (workOrder.is_rider && workOrder.parent_work_order_id) {
        const parentMatches = await WorkOrder.filter({
          id: workOrder.parent_work_order_id,
          completed: false
        });
        setParentWorkOrder(parentMatches[0] || null);
      }
    };
    checkForRidersAndParent();
  }, [workOrder.id, workOrder.is_rider, workOrder.parent_work_order_id]);

  const loadUser = async () => {
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const handleImageUpload = async (e) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await UploadFile({ file });
      await WorkOrder.update(workOrder.id, { image_url: result.file_url });
      await ActivityActions.imageUploaded(workOrder);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error uploading image:", error);
    }
    setUploading(false);
  };

  const handleNoteEdit = (index, isCompleted = false) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    const notesList = isCompleted ? completedNotes : activeNotes;
    const actualIndex = notes.findIndex((n) => n === notesList[index]);
    setEditingNoteIndex(actualIndex);
    setEditedNoteText(notes[actualIndex].text);
  };

  const handleNoteSave = async (index) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    const task = notes[index];
    if (!task) return;
    const saved = await mutateLocatedWorkOrderArrayItem({
      workOrderId: workOrder.id,
      field: "notes",
      item: task,
      label: "Work Order task",
      mutateItem: (currentTask) => ({ ...currentTask, text: editedNoteText }),
    });
    Object.assign(workOrder, { notes: saved.notes || [], updated_date: saved.updated_date });
    setEditingNoteIndex(null);
    if (onUpdate) onUpdate();
  };

  const handleNoteCancel = () => {
    setEditingNoteIndex(null);
    setEditedNoteText("");
  };

  const handleToggleComplete = async (index, isCompleted = false) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    const notesList = isCompleted ? completedNotes : activeNotes;
    const actualIndex = notes.findIndex((n) => n === notesList[index]);
    const task = notes[actualIndex];
    
    // If trying to complete, check if all subtasks are completed
    if (!isCompleted && task.sub_tasks && task.sub_tasks.length > 0) {
      const hasIncomplete = task.sub_tasks.some(st => !st.completed);
      if (hasIncomplete) {
        // Show dialog with subtasks
        setIncompleteSubtasksData({ taskIndex: actualIndex, task });
        setShowIncompleteSubtasksDialog(true);
        return;
      }
    }
    
    const taskText = task.text;
    const targetCompleted = !task.completed;
    const saved = await mutateLocatedWorkOrderArrayItem({
      workOrderId: workOrder.id,
      field: "notes",
      item: task,
      label: "Work Order task",
      mutateItem: (currentTask) => ({ ...currentTask, completed: targetCompleted }),
    });
    Object.assign(workOrder, { notes: saved.notes || [], updated_date: saved.updated_date });
    if (onUpdate) onUpdate();
    if (isCompleted) {
      await ActivityActions.taskUncompleted(workOrder, taskText);
    } else {
      await ActivityActions.taskCompleted(workOrder, taskText);
    }
  };

  const handleMarkAllSubtasksComplete = async () => {
    if (!incompleteSubtasksData?.task) return;
    const task = incompleteSubtasksData.task;
    const saved = await mutateLocatedWorkOrderArrayItem({
      workOrderId: workOrder.id,
      field: "notes",
      item: task,
      label: "Work Order task",
      mutateItem: (currentTask) => ({
        ...currentTask,
        sub_tasks: (currentTask.sub_tasks || []).map((subTask) => ({ ...subTask, completed: true })),
        completed: true,
      }),
    });
    Object.assign(workOrder, { notes: saved.notes || [], updated_date: saved.updated_date });
    await ActivityActions.taskCompleted(workOrder, task.text);
    setShowIncompleteSubtasksDialog(false);
    setIncompleteSubtasksData(null);
    if (onUpdate) onUpdate();
  };

  const handleToggleSubTaskInDialog = async (subTaskIndex) => {
    const task = incompleteSubtasksData?.task;
    const subTask = task?.sub_tasks?.[subTaskIndex];
    if (!task || !subTask) return;
    const taskLocator = createWorkOrderArrayItemLocator(task);
    const subTaskLocator = createWorkOrderArrayItemLocator(subTask);
    const targetCompleted = !subTask.completed;
    const saved = await mutateLocatedWorkOrderArrayItem({
      workOrderId: workOrder.id,
      field: "notes",
      item: task,
      label: "Work Order task",
      mutateItem: (currentTask) => {
        const currentSubTasks = currentTask.sub_tasks || [];
        const currentSubTaskIndex = findWorkOrderArrayItemIndex(currentSubTasks, subTaskLocator, "Work Order subtask");
        return {
          ...currentTask,
          sub_tasks: currentSubTasks.map((currentSubTask, index) => index === currentSubTaskIndex
            ? { ...currentSubTask, completed: targetCompleted }
            : currentSubTask),
        };
      },
    });
    Object.assign(workOrder, { notes: saved.notes || [], updated_date: saved.updated_date });
    const savedTaskIndex = findWorkOrderArrayItemIndex(saved.notes || [], taskLocator, "Work Order task");
    setIncompleteSubtasksData({ taskIndex: savedTaskIndex, task: saved.notes[savedTaskIndex] });
  };

  const handleAddNote = async () => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    if (!newNoteText.trim()) return;

    const newNote = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      text: newNoteText,
      timestamp: new Date().toISOString(),
      created_by: currentUser?.email || "Unknown",
      completed: false,
      sub_tasks: []
    };

    const saved = await mutateWorkOrderArrayField({
      workOrderId: workOrder.id,
      field: "notes",
      label: "Work Order tasks",
      mutate: (currentNotes) => currentNotes.some((note) => note?.id === newNote.id)
        ? currentNotes
        : [...currentNotes, newNote],
    });
    Object.assign(workOrder, { notes: saved.notes || [], updated_date: saved.updated_date });
    await ActivityActions.taskAdded(workOrder, newNoteText);
    setNewNoteText("");
    setIsAddingNote(false);
    if (onUpdate) onUpdate();
  };

  const handleUseTemplate = async (template) => {
    const templateBatchId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newTasks = template.tasks.map((t, taskIndex) => ({
      id: `template_${templateBatchId}_${taskIndex}`,
      text: t.text,
      timestamp: new Date().toISOString(),
      created_by: currentUser?.email || "Template",
      completed: false,
      sub_tasks: (t.sub_tasks || []).map(st => {
        const subTaskText = typeof st === 'string' ? st : st.text;
        const subTaskDetails = typeof st === 'string' ? [] : (st.details || []);
        return {
          text: subTaskText,
          completed: false,
          details: subTaskDetails.map(d => ({
            text: typeof d === 'string' ? d : d.text,
            completed: false
          }))
        };
      })
    }));
    const saved = await mutateWorkOrderArrayField({
      workOrderId: workOrder.id,
      field: "notes",
      label: "Work Order template tasks",
      mutate: (currentNotes) => {
        const existingIds = new Set(currentNotes.map((note) => note?.id).filter(Boolean));
        const missing = newTasks.filter((task) => !existingIds.has(task.id));
        return missing.length > 0 ? [...currentNotes, ...missing] : currentNotes;
      },
    });
    Object.assign(workOrder, { notes: saved.notes || [], updated_date: saved.updated_date });
    if (onUpdate) onUpdate();
  };

  const handleAddSubTask = async (taskIndex) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    if (!newSubTaskText.trim()) return;
    const task = notes[taskIndex];
    if (!task) return;
    try {
      const newSubTask = { text: newSubTaskText, completed: false, assigned_to: [] };
      const saved = await mutateLocatedWorkOrderArrayItem({
        workOrderId: workOrder.id,
        field: "notes",
        item: task,
        label: "Work Order task",
        mutateItem: (currentTask) => ({
          ...currentTask,
          sub_tasks: [...(currentTask.sub_tasks || []), newSubTask],
        }),
      });
      Object.assign(workOrder, { notes: saved.notes || [], updated_date: saved.updated_date });
      setNewSubTaskText("");
      setAddingSubTaskFor(null);
    } catch (error) {
      console.error('Error adding subtask:', error);
      alert('Failed to add subtask: ' + error.message);
    }
  };

  const handleUpdateTaskAssignment = async (taskIndex, assignedUsers) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    const task = notes[taskIndex];
    if (!task) return;
    const saved = await mutateLocatedWorkOrderArrayItem({
      workOrderId: workOrder.id,
      field: "notes",
      item: task,
      label: "Work Order task",
      mutateItem: (currentTask) => ({ ...currentTask, assigned_to: assignedUsers }),
    });
    Object.assign(workOrder, { notes: saved.notes || [], updated_date: saved.updated_date });
    if (onUpdate) onUpdate();
  };

  const handleUpdateSubTaskAssignment = async (taskIndex, subTaskIndex, assignedUsers) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    const task = notes[taskIndex];
    const subTask = task?.sub_tasks?.[subTaskIndex];
    if (!task || !subTask) return;
    const subTaskLocator = createWorkOrderArrayItemLocator(subTask);
    const saved = await mutateLocatedWorkOrderArrayItem({
      workOrderId: workOrder.id,
      field: "notes",
      item: task,
      label: "Work Order task",
      mutateItem: (currentTask) => {
        const currentSubTasks = currentTask.sub_tasks || [];
        const currentSubTaskIndex = findWorkOrderArrayItemIndex(currentSubTasks, subTaskLocator, "Work Order subtask");
        return {
          ...currentTask,
          sub_tasks: currentSubTasks.map((currentSubTask, index) => index === currentSubTaskIndex
            ? { ...currentSubTask, assigned_to: assignedUsers }
            : currentSubTask),
        };
      },
    });
    Object.assign(workOrder, { notes: saved.notes || [], updated_date: saved.updated_date });
    if (onUpdate) onUpdate();
  };

  const handleDeleteSubTask = async (taskIndex, subTaskIndex) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    const task = notes[taskIndex];
    const subTask = task?.sub_tasks?.[subTaskIndex];
    if (!task || !subTask) return;
    const subTaskLocator = createWorkOrderArrayItemLocator(subTask);
    const saved = await mutateLocatedWorkOrderArrayItem({
      workOrderId: workOrder.id,
      field: "notes",
      item: task,
      label: "Work Order task",
      mutateItem: (currentTask) => {
        const currentSubTasks = currentTask.sub_tasks || [];
        const currentSubTaskIndex = findWorkOrderArrayItemIndex(currentSubTasks, subTaskLocator, "Work Order subtask");
        return { ...currentTask, sub_tasks: currentSubTasks.filter((_, index) => index !== currentSubTaskIndex) };
      },
    });
    Object.assign(workOrder, { notes: saved.notes || [], updated_date: saved.updated_date });
  };

  const handleToggleSubTask = async (taskIndex, subTaskIndex) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    const task = notes[taskIndex];
    const subTask = task?.sub_tasks?.[subTaskIndex];
    if (!task || !subTask) return;
    const subTaskLocator = createWorkOrderArrayItemLocator(subTask);
    const targetCompleted = !subTask.completed;
    const saved = await mutateLocatedWorkOrderArrayItem({
      workOrderId: workOrder.id,
      field: "notes",
      item: task,
      label: "Work Order task",
      mutateItem: (currentTask) => {
        const currentSubTasks = currentTask.sub_tasks || [];
        const currentSubTaskIndex = findWorkOrderArrayItemIndex(currentSubTasks, subTaskLocator, "Work Order subtask");
        return {
          ...currentTask,
          sub_tasks: currentSubTasks.map((currentSubTask, index) => index === currentSubTaskIndex
            ? { ...currentSubTask, completed: targetCompleted }
            : currentSubTask),
        };
      },
    });
    Object.assign(workOrder, { notes: saved.notes || [], updated_date: saved.updated_date });
    if (onUpdate) onUpdate();
  };

  const handleAddDetail = async (taskIndex, subTaskIndex) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    if (!newDetailText.trim()) return;
    const task = notes[taskIndex];
    const subTask = task?.sub_tasks?.[subTaskIndex];
    if (!task || !subTask) return;
    const subTaskLocator = createWorkOrderArrayItemLocator(subTask);
    const newDetail = { text: newDetailText, completed: false };
    const saved = await mutateLocatedWorkOrderArrayItem({
      workOrderId: workOrder.id,
      field: "notes",
      item: task,
      label: "Work Order task",
      mutateItem: (currentTask) => {
        const currentSubTasks = currentTask.sub_tasks || [];
        const currentSubTaskIndex = findWorkOrderArrayItemIndex(currentSubTasks, subTaskLocator, "Work Order subtask");
        return {
          ...currentTask,
          sub_tasks: currentSubTasks.map((currentSubTask, index) => index === currentSubTaskIndex
            ? { ...currentSubTask, details: [...(currentSubTask.details || []), newDetail] }
            : currentSubTask),
        };
      },
    });
    Object.assign(workOrder, { notes: saved.notes || [], updated_date: saved.updated_date });
    setNewDetailText("");
    setAddingDetailFor(null);
    if (onUpdate) onUpdate();
  };

  const handleToggleDetail = async (taskIndex, subTaskIndex, detailIndex) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    const task = notes[taskIndex];
    const subTask = task?.sub_tasks?.[subTaskIndex];
    const detail = subTask?.details?.[detailIndex];
    if (!task || !subTask || !detail) return;
    const subTaskLocator = createWorkOrderArrayItemLocator(subTask);
    const detailLocator = createWorkOrderArrayItemLocator(detail);
    const targetCompleted = !detail.completed;
    const saved = await mutateLocatedWorkOrderArrayItem({
      workOrderId: workOrder.id,
      field: "notes",
      item: task,
      label: "Work Order task",
      mutateItem: (currentTask) => {
        const currentSubTasks = currentTask.sub_tasks || [];
        const currentSubTaskIndex = findWorkOrderArrayItemIndex(currentSubTasks, subTaskLocator, "Work Order subtask");
        return {
          ...currentTask,
          sub_tasks: currentSubTasks.map((currentSubTask, index) => {
            if (index !== currentSubTaskIndex) return currentSubTask;
            const currentDetails = currentSubTask.details || [];
            const currentDetailIndex = findWorkOrderArrayItemIndex(currentDetails, detailLocator, "Work Order task detail");
            return {
              ...currentSubTask,
              details: currentDetails.map((currentDetail, currentIndex) => currentIndex === currentDetailIndex
                ? { ...currentDetail, completed: targetCompleted }
                : currentDetail),
            };
          }),
        };
      },
    });
    Object.assign(workOrder, { notes: saved.notes || [], updated_date: saved.updated_date });
    if (onUpdate) onUpdate();
  };

  const handleDeleteDetail = async (taskIndex, subTaskIndex, detailIndex) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    const task = notes[taskIndex];
    const subTask = task?.sub_tasks?.[subTaskIndex];
    const detail = subTask?.details?.[detailIndex];
    if (!task || !subTask || !detail) return;
    const subTaskLocator = createWorkOrderArrayItemLocator(subTask);
    const detailLocator = createWorkOrderArrayItemLocator(detail);
    const saved = await mutateLocatedWorkOrderArrayItem({
      workOrderId: workOrder.id,
      field: "notes",
      item: task,
      label: "Work Order task",
      mutateItem: (currentTask) => {
        const currentSubTasks = currentTask.sub_tasks || [];
        const currentSubTaskIndex = findWorkOrderArrayItemIndex(currentSubTasks, subTaskLocator, "Work Order subtask");
        return {
          ...currentTask,
          sub_tasks: currentSubTasks.map((currentSubTask, index) => {
            if (index !== currentSubTaskIndex) return currentSubTask;
            const currentDetails = currentSubTask.details || [];
            const currentDetailIndex = findWorkOrderArrayItemIndex(currentDetails, detailLocator, "Work Order task detail");
            return { ...currentSubTask, details: currentDetails.filter((_, currentIndex) => currentIndex !== currentDetailIndex) };
          }),
        };
      },
    });
    Object.assign(workOrder, { notes: saved.notes || [], updated_date: saved.updated_date });
    if (onUpdate) onUpdate();
  };

  const handleToggleAsap = async () => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    const newAsapValue = !isAsap;
    const expectedFields = { asap: workOrder.asap };
    const nextFields = { asap: newAsapValue };
    // If toggling ASAP on, set priority to -1 to move to top. Protect the
    // loaded priority too so an older card cannot overwrite a newer reorder.
    if (newAsapValue) {
      expectedFields.priority = workOrder.priority;
      nextFields.priority = -1;
    }
    try {
      const saved = await replaceWorkOrderFieldsIfUnchanged({
        workOrderId: workOrder.id,
        expectedFields,
        nextFields,
        label: "Work Order ASAP toggle",
      });
      Object.assign(workOrder, {
        asap: saved.asap,
        priority: saved.priority,
        updated_date: saved.updated_date,
      });
      await ActivityActions.asapToggled(workOrder, newAsapValue);
    } catch (error) {
      console.error("Could not toggle Work Order ASAP state:", error);
      alert(error?.message || "This Work Order changed in another session. Reload and try the ASAP change again.");
    }
    if (onUpdate) onUpdate();
  };

  const handleCompleteClick = async () => {
    // Check if this work order has incomplete riders
    if (!workOrder.is_rider && onComplete) {
      if (riders.length > 0) {
        setShowRiderWarning(true);
        return;
      }
    }

    // Show confirmation dialog
    setShowCompleteConfirm(true);
  };

  const confirmComplete = async () => {
    if (onComplete) {
      onComplete(workOrder);
    }
    setShowCompleteConfirm(false);
  };

  // Added delete functionality handlers
  const handleDeleteClick = async () => {
    // Check if this work order has riders before deleting
    if (!workOrder.is_rider) {
      // Re-fetch the exact relationship in case local rider state is stale.
      // This intentionally avoids relying on a truncated broad Work Order read.
      try {
        const attachedRiders = await WorkOrder.filter({
          parent_work_order_id: workOrder.id,
          is_rider: true,
          completed: false
        });

        if (attachedRiders.length > 0) {
          setShowRiderDeleteWarning(true);
          return;
        }
      } catch (error) {
        console.error("Could not verify attached riders before delete:", error);
        window.alert("Attached riders could not be verified. Delete was not opened. Please retry.");
        return;
      }
    }
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (onDelete) {
      await onDelete(workOrder);
    }
    setShowDeleteDialog(false);
  };

  const getPageNameForStage = (stage) => {
    const stagePageMap = {
      'estimating': 'Estimating', // Added Estimating page
      'sales': 'Sales', // Added Sales page
      'permitting': 'Permitting',
      'design': 'Design',
      'production': 'Production',
      'fabrication': 'Fabrication',
      'installation': 'InstallationDeliver'
    };
    return stagePageMap[stage] || 'Estimating'; // Default to 'Estimating'
  };

  return (
    <>
      <div 
        className="clay-card relative transition-all hover:shadow-2xl cursor-pointer"
        onClick={() => {
          // If this is a rider and has a parent, show parent details instead
          if (workOrder.is_rider && parentWorkOrder) {
            setShowDetailsDialog(parentWorkOrder);
          } else {
            setShowDetailsDialog(workOrder);
          }
        }}
        style={{
          background: `linear-gradient(145deg, ${stageColor}dd, rgba(255,255,255,0.95))`,
          width: '100%',
          minWidth: '100%',
          border: `3px solid ${highlight.border}`,
          boxShadow: `0 0 ${isAsap ? '24px' : isTopPriority ? '20px' : '12px'} ${highlight.shadow}, 8px 8px 20px rgba(0, 0, 0, 0.08), -8px -8px 20px rgba(255, 255, 255, 0.9)`
        }}
      >
        {/* Drag handle edges */}
        {dragHandleProps && (
          <>
            <div 
              {...dragHandleProps}
              className="absolute top-0 left-0 right-0 h-3 cursor-grab active:cursor-grabbing rounded-t-[17px] hover:bg-black/5 transition-colors z-10"
            />
            <div 
              {...dragHandleProps}
              className="absolute bottom-0 left-0 right-0 h-3 cursor-grab active:cursor-grabbing rounded-b-[17px] hover:bg-black/5 transition-colors z-10"
            />
            <div 
              {...dragHandleProps}
              className="absolute top-0 bottom-0 left-0 w-3 cursor-grab active:cursor-grabbing rounded-l-[17px] hover:bg-black/5 transition-colors z-10"
            />
            <div 
              {...dragHandleProps}
              className="absolute top-0 bottom-0 right-0 w-3 cursor-grab active:cursor-grabbing rounded-r-[17px] hover:bg-black/5 transition-colors z-10"
            />
          </>
        )}

        <div className="p-3">
          {/* Priority Number Badge */}
        <div
          className="absolute -top-2 -left-2 rounded-full flex items-center justify-center font-bold z-10"
          style={{
            width: '32px',
            height: '32px',
            background: isTopPriority ?
            'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)' :
            'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)',
            color: isTopPriority ? '#000' : '#6B46C1',
            fontSize: '14px',
            boxShadow: '3px 3px 8px rgba(0,0,0,0.2), -2px -2px 6px rgba(255,255,255,0.8)'
          }}>

          #{priorityNumber}
        </div>

        <div className="space-y-3">
          {/* Top Section: Image and Details */}
          <div className="flex gap-4 items-start">
            {/* Image Section */}
            {workOrder.image_url ?
            <div
              className="flex-shrink-0 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                setShowImageDialog(true);
              }}
              style={{
                width: '180px',
                height: '120px',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(240,240,240,0.8) 100%)',
                boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.1), inset -1px -1px 3px rgba(255,255,255,0.8)'
              }}>

                <img
                src={workOrder.image_url}
                alt={workOrder.title}
                className="w-full h-full object-contain" />

              </div> :

            <div className="flex-shrink-0">
                <label onClick={(e) => e.stopPropagation()}>
                  <div
                  className="w-16 h-16 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(240,240,240,0.8) 100%)',
                    boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.1), inset -1px -1px 3px rgba(255,255,255,0.8)'
                  }}>

                    <Upload className="w-5 h-5 text-gray-400 mb-1" />
                    <span className="text-xs text-gray-500 text-center px-1 leading-tight font-medium">
                      {uploading ? "..." : "Add"}
                    </span>
                  </div>
                  <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploading} />

                </label>
              </div>
            }

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between mb-2">
                <div 
                  className="flex-1 min-w-0"
                >
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h3 className="font-bold text-gray-800 text-base leading-tight">{workOrder.client_name}</h3>
                  {workOrder.is_rider &&
                  <Badge
                    className="rounded-full px-3 py-1 leading-none flex-shrink-0 font-bold uppercase tracking-wide"
                    style={{
                      background: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      boxShadow: '0 2px 8px rgba(124, 58, 237, 0.4), inset 1px 1px 2px rgba(255,255,255,0.3)'
                    }}>

                      RIDER
                    </Badge>
                  }
                  <ProjectHealthBadge workOrder={workOrder} size="sm" />
                </div>
              </div>

              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleAsap();
                }}
                size="sm"
                className={`h-5 px-2 text-xs font-bold rounded-full transition-all ${
                isAsap ?
                'bg-red-600 hover:bg-red-700 text-white' :
                'bg-transparent hover:bg-gray-100 text-gray-400'}`
                }
                style={isAsap ? {
                  fontSize: '10px',
                  boxShadow: '0 0 8px rgba(220, 38, 38, 0.4), inset 0 1px 2px rgba(255,255,255,0.3)'
                } : {
                  fontSize: '10px',
                  opacity: 0.4
                }}
              >
                <span className={!isAsap ? 'line-through' : ''}>ASAP</span>
              </Button>
            </div>

            <div className="flex gap-2 mb-1 flex-wrap">
              {(workOrder.current_task_assigned_to || workOrder.assigned_to) &&
              <div className="flex items-center gap-1 text-gray-600">
                  <User className="w-3 h-3 flex-shrink-0 text-blue-600" />
                  <span className="text-xs font-medium">{(workOrder.current_task_assigned_to || workOrder.assigned_to).split('@')[0]}</span>
                </div>
              }
              {workOrder.due_date &&
              <div className="flex items-center gap-1 text-gray-600">
                  <Calendar className="w-3 h-3 flex-shrink-0 text-orange-600" />
                  <span className="text-xs font-medium">{format(parseLocalDate(workOrder.due_date), "MMM d")}</span>
                </div>
              }
              {riders.length > 0 && !workOrder.is_rider &&
              <div className="flex gap-1 flex-wrap">
                  {riders.map((rider, index) =>
                <Link
                  key={rider.id}
                  to={createPageUrl(getPageNameForStage(rider.rider_stage || rider.current_stage))}>

                      <Badge
                    className="rounded-full text-xs px-1.5 py-0 leading-none flex items-center gap-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                    style={{
                      background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                      color: '#92400E',
                      fontSize: '10px',
                      boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.1)'
                    }}>

                        R{riders.length > 1 ? index + 1 : ''}
                      </Badge>
                    </Link>
                )}
                </div>
              }
              </div>

            {workOrder.description &&
            <p className="text-xs text-gray-600 mb-1 leading-snug line-clamp-2">
              {workOrder.description}
            </p>
            }
            </div>
            </div>

          {/* Tasks Section - Full Width */}
          <div
            className="rounded-lg"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.7) 100%)',
              boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.08), inset -1px -1px 3px rgba(255,255,255,0.9)'
            }}>

            <div className="flex gap-1 p-1.5">
                {/* Tasks Content Area */}
                <div className="flex-1 min-w-0">
                  {completedNotes.length > 0 &&
                  <div className="mb-0.5">
                      <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCompleted(!showCompleted);
                      }}
                      className="h-5 px-1.5 text-xs hover:bg-gray-100 rounded font-medium flex items-center gap-0.5"
                      style={{ fontSize: '10px' }}>

                        {showCompleted ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                        ({completedNotes.length})
                      </Button>
                    </div>
                  }

                  {/* Active Tasks */}
                  {activeNotes.length > 0 &&
                  <div className="space-y-0.5">
                      {activeNotes.map((note, index) => {
                      const actualIndex = notes.findIndex((n) => n === note);
                      return (
                        <div key={actualIndex} className="bg-white/50 rounded group/task [&_.hover-btn]:opacity-0 [&_.hover-btn]:h-0 [&_.hover-btn]:overflow-hidden [&:hover_.hover-btn]:opacity-100 [&:hover_.hover-btn]:h-auto [&_.hover-btn]:transition-all [&_.hover-btn]:duration-200 [&_.hover-btn]:delay-75">
                          <div className="p-1 flex items-start gap-1">
                            {editingNoteIndex === actualIndex ?
                            <div className="flex-1 space-y-1" onClick={(e) => e.stopPropagation()}>
                                  <Input
                                value={editedNoteText}
                                onChange={(e) => setEditedNoteText(e.target.value)}
                                className="text-sm h-8 border-gray-300"
                                autoFocus />

                                  <div className="flex gap-1">
                                    <Button
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNoteSave(actualIndex);
                                  }}
                                  className="h-6 px-2 text-xs bg-green-100 hover:bg-green-200 text-green-800">

                                      <Check className="w-3 h-3 mr-1" />
                                      Save
                                    </Button>
                                    <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNoteCancel();
                                  }}
                                  className="h-6 px-2 text-xs">

                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div> :

                            <>
                                  <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleComplete(index, false);
                                }}
                                className="h-4 w-4 rounded-full flex-shrink-0 hover:bg-green-100 p-0">

                                    <Circle className="w-3 h-3 text-gray-400" />
                                  </Button>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-1">
                                      <div
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleNoteEdit(index, false);
                                        }}
                                        className="cursor-pointer hover:bg-white/70 rounded px-1 transition-colors flex-1">
                                        <p className="text-gray-700 text-xs leading-snug">{note.text}</p>
                                      </div>
                                      <div onClick={(e) => e.stopPropagation()}>
                                        <MultiUserSelectInline
                                          users={allUsers}
                                          selectedUsers={note.assigned_to ? (Array.isArray(note.assigned_to) ? note.assigned_to : [note.assigned_to]) : []}
                                          onSelectionChange={(users) => handleUpdateTaskAssignment(actualIndex, users)}
                                          disabled={!isRegistered}
                                          className="h-5"
                                        />
                                      </div>
                                    </div>
                                    {/* Sub-tasks - always show all */}
                                    {note.sub_tasks && note.sub_tasks.length > 0 && (
                                    <div className="ml-3 mt-1 space-y-0.5">
                                    {note.sub_tasks.map((subTask, subIdx) => (
                                      <div key={subIdx} className="group/subtask [&_.hover-btn-detail]:opacity-0 [&_.hover-btn-detail]:h-0 [&_.hover-btn-detail]:overflow-hidden [&:hover_.hover-btn-detail]:opacity-100 [&:hover_.hover-btn-detail]:h-auto [&_.hover-btn-detail]:transition-all [&_.hover-btn-detail]:duration-200 [&_.hover-btn-detail]:delay-75" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center gap-1">
                                          <Checkbox
                                            checked={subTask.completed}
                                            onCheckedChange={() => handleToggleSubTask(actualIndex, subIdx)}
                                            className="h-3 w-3 [&_svg]:h-2 [&_svg]:w-2" />
                                          <span className={`text-xs flex-1 ${subTask.completed ? "line-through text-gray-400" : "text-gray-600"}`}>{subTask.text}</span>
                                          <MultiUserSelectInline
                                            users={allUsers}
                                            selectedUsers={subTask.assigned_to ? (Array.isArray(subTask.assigned_to) ? subTask.assigned_to : [subTask.assigned_to]) : []}
                                            onSelectionChange={(users) => handleUpdateSubTaskAssignment(actualIndex, subIdx, users)}
                                            disabled={!isRegistered}
                                            className="h-4"
                                          />
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDeleteSubTask(actualIndex, subIdx)}
                                            className="h-3 w-3 p-0">
                                            <X className="w-2 h-2 text-red-500" />
                                          </Button>
                                        </div>
                                        {/* Subtask Details */}
                                        {subTask.details && subTask.details.length > 0 && (
                                          <div className="ml-5 mt-0.5 space-y-0.5">
                                            {subTask.details.map((detail, detailIdx) => (
                                              <div key={detailIdx} className="flex items-center gap-1">
                                                <Checkbox
                                                  checked={detail.completed}
                                                  onCheckedChange={() => handleToggleDetail(actualIndex, subIdx, detailIdx)}
                                                  className="h-2.5 w-2.5 [&_svg]:h-1.5 [&_svg]:w-1.5" />
                                                <span className={`text-xs ${detail.completed ? "line-through text-gray-400" : "text-gray-500"}`} style={{ fontSize: '10px' }}>{detail.text}</span>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  onClick={() => handleDeleteDetail(actualIndex, subIdx, detailIdx)}
                                                  className="h-2.5 w-2.5 ml-auto p-0">
                                                  <X className="w-1.5 h-1.5 text-red-500" />
                                                </Button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {/* Add Detail - hover reveal */}
                                        {addingDetailFor?.taskIndex === actualIndex && addingDetailFor?.subTaskIndex === subIdx ? (
                                          <div className="ml-5 mt-0.5 flex gap-1">
                                            <Input
                                              value={newDetailText}
                                              onChange={(e) => setNewDetailText(e.target.value)}
                                              placeholder="Detail..."
                                              className="h-4 text-xs"
                                              style={{ fontSize: '10px' }}
                                              autoFocus
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleAddDetail(actualIndex, subIdx);
                                                if (e.key === 'Escape') {setAddingDetailFor(null);setNewDetailText("");}
                                              }} />
                                            <Button size="sm" onClick={() => handleAddDetail(actualIndex, subIdx)} className="h-4 px-1">
                                              <Check className="w-2 h-2" />
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => {setAddingDetailFor(null);setNewDetailText("");}} className="h-4 px-1">
                                              <X className="w-2 h-2" />
                                            </Button>
                                          </div>
                                        ) : (
                                          <div className="ml-5 mt-0.5 hover-btn-detail">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => setAddingDetailFor({ taskIndex: actualIndex, subTaskIndex: subIdx })}
                                              className="h-3 px-1"
                                              style={{ fontSize: '8px' }}>
                                              <Plus className="w-1.5 h-1.5 mr-0.5" />
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
                                      <div className="ml-3 mt-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                                        <Input
                                          value={newSubTaskText}
                                          onChange={(e) => setNewSubTaskText(e.target.value)}
                                          placeholder="Sub-task..."
                                          className="h-5 text-xs"
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleAddSubTask(actualIndex);
                                            if (e.key === 'Escape') {setAddingSubTaskFor(null);setNewSubTaskText("");}
                                          }} />
                                        <Button size="sm" onClick={() => handleAddSubTask(actualIndex)} className="h-5 px-1">
                                          <Check className="w-2.5 h-2.5" />
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => {setAddingSubTaskFor(null);setNewSubTaskText("");}} className="h-5 px-1">
                                          <X className="w-2.5 h-2.5" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="ml-3 mt-0.5 hover-btn" onClick={(e) => e.stopPropagation()}>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setAddingSubTaskFor(actualIndex)}
                                          className="h-4 px-1 text-xs"
                                          style={{ fontSize: '9px' }}>
                                          <Plus className="w-2 h-2 mr-0.5" />
                                          Sub
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </>
                            }
                          </div>
                        </div>);

                    })}
                    </div>
                  }

                  {/* Completed Tasks */}
                  {showCompleted && completedNotes.length > 0 &&
                  <div className="space-y-0.5 mt-0.5 border-t pt-0.5">
                      {completedNotes.map((note, index) => {
                      const actualIndex = notes.findIndex((n) => n === note);
                      return (
                        <div key={actualIndex} className="p-1 bg-gray-100/50 rounded flex items-start gap-1 opacity-60">
                            {editingNoteIndex === actualIndex ?
                          <div className="flex-1 space-y-1" onClick={(e) => e.stopPropagation()}>
                                <Input
                              value={editedNoteText}
                              onChange={(e) => setEditedNoteText(e.target.value)}
                              className="text-sm h-8 border-gray-300"
                              autoFocus />

                                <div className="flex gap-1">
                                  <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNoteSave(actualIndex);
                                }}
                                className="h-6 px-2 text-xs bg-green-100 hover:bg-green-200 text-green-800">

                                    <Check className="w-3 h-3 mr-1" />
                                    Save
                                  </Button>
                                  <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNoteCancel();
                                }}
                                className="h-6 px-2 text-xs">

                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div> :

                          <>
                                <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleComplete(index, true);
                              }}
                              className="h-4 w-4 rounded-full flex-shrink-0 hover:bg-gray-200 p-0">

                                  <CheckCircle2 className="w-3 h-3 text-green-600" />
                                </Button>
                                <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNoteEdit(index, true);
                              }}
                              className="flex-1 cursor-pointer hover:bg-gray-200/50 rounded px-1 transition-colors">

                                  <p className="text-gray-600 text-xs leading-snug line-through">{note.text}</p>
                                </div>
                              </>
                          }
                          </div>);

                    })}
                    </div>
                  }

                  {/* Add Note Form */}
                  {isAddingNote &&
                  <div className="space-y-1 p-1.5 bg-white/50 rounded-lg mt-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="Type your task..."
                      className="text-sm h-8 border-gray-300"
                      autoFocus />

                      <div className="flex gap-1">
                        <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddNote();
                        }}
                        className="h-6 px-2 text-xs bg-blue-100 hover:bg-blue-200 text-blue-800">

                          <Check className="w-3 h-3 mr-1" />
                          Save
                        </Button>
                        <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsAddingNote(false);
                          setNewNoteText("");
                        }}
                        className="h-6 px-2 text-xs">

                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  }

                  {activeNotes.length === 0 && !isAddingNote &&
                    <p className="text-gray-400 text-center" style={{ fontSize: '10px' }}>No tasks</p>
                  }
                </div>

                {/* Vertical Add Task Button */}
                <div className="flex-shrink-0 flex items-stretch">
                  <DropdownMenu open={showAddTaskMenu} onOpenChange={setShowAddTaskMenu}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isRegistered) {
                            promptForEmail();
                            return;
                          }
                          setShowAddTaskMenu(true);
                        }}
                        className="px-0.5 hover:bg-gray-100 rounded font-medium flex items-center justify-center"
                        style={{ writingMode: 'vertical-rl', textOrientation: 'upright', fontSize: '10px' }}>
                        +
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAddTaskMenu(false);
                          setIsAddingNote(true);
                        }}>
                        <Plus className="w-4 h-4 mr-2" />
                        New Task
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAddTaskMenu(false);
                          setShowTemplateDialog(true);
                        }}>
                        <FileText className="w-4 h-4 mr-2" />
                        Use Template
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Image Preview Dialog */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-2 bg-black/90 border-none">
          <img
            src={workOrder.image_url}
            alt={workOrder.title}
            className="w-full h-full object-contain max-h-[85vh]"
          />
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <WorkOrderDetailsDialog
        isOpen={!!showDetailsDialog}
        onClose={() => setShowDetailsDialog(false)}
        workOrder={showDetailsDialog || workOrder}
        onEdit={onEdit}
        onMove={onMove}
        onSplit={onSplit}
        onComplete={onComplete}
        onRestore={onRestore}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent
          className="clay-card border-none"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto'
          }}
          onPointerEnter={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}>

          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-gray-800">
              Delete {workOrder.is_rider ? 'Rider' : 'Work Order'}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 text-base">
              Are you sure you want to delete "{workOrder.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="clay-button border-none text-gray-800"
              style={{
                background: 'linear-gradient(135deg, #E5E7EB 0%, #F3F4F6 100%)'
              }}>

              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="border-none text-white"
              style={{
                background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)'
              }}>

              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rider Delete Warning Dialog */}
      <AlertDialog open={showRiderDeleteWarning} onOpenChange={setShowRiderDeleteWarning}>
        <AlertDialogContent
          className="clay-card border-none"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto'
          }}
          onPointerEnter={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}>

          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-gray-800">
              Cannot Delete Work Order
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 text-base">
              This work order has active riders attached to it.
              Please delete all riders first before deleting this work order.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setShowRiderDeleteWarning(false)}
              className="clay-button border-none text-gray-800"
              style={{
                background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)'
              }}>

              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Incomplete Rider Warning Dialog */}
      <AlertDialog open={showRiderWarning} onOpenChange={setShowRiderWarning}>
        <AlertDialogContent
          className="clay-card border-none"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto'
          }}
          onPointerEnter={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}>

          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-gray-800">
              Incomplete Rider Tasks
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 text-base">
              This work order has incomplete rider tasks assigned to it.
              Please complete or remove all riders before marking this work order as complete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setShowRiderWarning(false)}
              className="clay-button border-none text-gray-800"
              style={{
                background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)'
              }}>

              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Complete Confirmation Dialog */}
      <AlertDialog open={showCompleteConfirm} onOpenChange={setShowCompleteConfirm}>
        <AlertDialogContent
          className="clay-card border-none"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto'
          }}
          onPointerEnter={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}>

          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-gray-800">
              Mark as Complete?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 text-base">
              Are you sure you want to mark "{workOrder.title}" as complete?
              <br /><br />
              This will send an email notification to the team.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="clay-button border-none text-gray-800"
              style={{
                background: 'linear-gradient(135deg, #E5E7EB 0%, #F3F4F6 100%)'
              }}>

              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmComplete}
              className="border-none text-white"
              style={{
                background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)'
              }}>

              Mark Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task Template Dialog */}
      <TaskTemplateDialog
        isOpen={showTemplateDialog}
        onClose={() => setShowTemplateDialog(false)}
        onUseTemplate={handleUseTemplate}
      />

      {/* Incomplete Subtasks Dialog */}
      <AlertDialog open={showIncompleteSubtasksDialog} onOpenChange={setShowIncompleteSubtasksDialog}>
        <AlertDialogContent
          className="clay-card border-none max-w-md"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto'
          }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-gray-800">
              Subtasks Not Completed
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 text-sm">
              Please complete all subtasks before marking this task as complete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {incompleteSubtasksData && (
            <div className="space-y-3 my-4">
              <p className="font-semibold text-gray-700 text-sm">{incompleteSubtasksData.task.text}</p>
              
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {incompleteSubtasksData.task.sub_tasks?.map((subTask, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-white/70 rounded">
                    <Checkbox
                      checked={subTask.completed}
                      onCheckedChange={() => handleToggleSubTaskInDialog(idx)}
                      className="h-4 w-4"
                    />
                    <span className={`text-sm flex-1 ${subTask.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {subTask.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <AlertDialogFooter className="flex gap-2">
            <Button
              onClick={handleMarkAllSubtasksComplete}
              className="flex-1 border-none text-white"
              style={{
                background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)'
              }}>
              Mark All Complete
            </Button>
            <AlertDialogCancel
              className="flex-1 clay-button border-none text-gray-800"
              onClick={() => {
                setShowIncompleteSubtasksDialog(false);
                setIncompleteSubtasksData(null);
              }}
              style={{
                background: 'linear-gradient(135deg, #E5E7EB 0%, #F3F4F6 100%)'
              }}>
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>);

}