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
import { WorkOrder } from "@/entities/WorkOrder";
import { User as UserEntity } from "@/entities/User";
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
  const [riders, setRiders] = React.useState([]);
  const [parentWorkOrder, setParentWorkOrder] = React.useState(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showAddTaskMenu, setShowAddTaskMenu] = useState(false);
  const [addingSubTaskFor, setAddingSubTaskFor] = useState(null);
  const [newSubTaskText, setNewSubTaskText] = useState("");

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
  }, []);

  React.useEffect(() => {
    const checkForRidersAndParent = async () => {
      const allWorkOrders = await WorkOrder.filter({ completed: false });
      
      // Check for riders if this is not a rider
      if (!workOrder.is_rider && workOrder.id) {
        const foundRiders = allWorkOrders.filter(
          (wo) => wo.parent_work_order_id === workOrder.id && wo.is_rider
        );
        setRiders(foundRiders);
      }
      
      // Check for parent if this is a rider
      if (workOrder.is_rider && workOrder.parent_work_order_id) {
        const parent = allWorkOrders.find((wo) => wo.id === workOrder.parent_work_order_id);
        setParentWorkOrder(parent);
      }
    };
    checkForRidersAndParent();
  }, [workOrder.id, workOrder.is_rider, workOrder.parent_work_order_id]);

  const loadUser = async () => {
    try {
      const user = await UserEntity.me();
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
      const updateData = {
        image_url: result.file_url,
        notes: notes
      };
      await WorkOrder.update(workOrder.id, updateData);
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
    const updatedNotes = [...notes];
    updatedNotes[index] = {
      ...updatedNotes[index],
      text: editedNoteText
    };
    await WorkOrder.update(workOrder.id, { notes: updatedNotes });
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
    const taskText = notes[actualIndex].text;
    const updatedNotes = [...notes];
    updatedNotes[actualIndex] = {
      ...updatedNotes[actualIndex],
      completed: !updatedNotes[actualIndex].completed
    };
    await WorkOrder.update(workOrder.id, { notes: updatedNotes });
    if (isCompleted) {
      await ActivityActions.taskUncompleted(workOrder, taskText);
    } else {
      await ActivityActions.taskCompleted(workOrder, taskText);
    }
    if (onUpdate) onUpdate();
  };

  const handleAddNote = async () => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    if (!newNoteText.trim()) return;

    const newNote = {
      text: newNoteText,
      timestamp: new Date().toISOString(),
      created_by: currentUser?.email || "Unknown",
      completed: false,
      sub_tasks: []
    };

    const updatedNotes = [...notes, newNote];
    await WorkOrder.update(workOrder.id, { notes: updatedNotes });
    await ActivityActions.taskAdded(workOrder, newNoteText);
    setNewNoteText("");
    setIsAddingNote(false);
    if (onUpdate) onUpdate();
  };

  const handleUseTemplate = async (template) => {
    const newTasks = template.tasks.map(t => ({
      text: t.text,
      timestamp: new Date().toISOString(),
      created_by: currentUser?.email || "Template",
      completed: false,
      sub_tasks: (t.sub_tasks || []).map(st => ({
        text: st,
        completed: false,
        id: Date.now() + Math.random()
      }))
    }));
    const updatedNotes = [...notes, ...newTasks];
    await WorkOrder.update(workOrder.id, { notes: updatedNotes });
    if (onUpdate) onUpdate();
  };

  const handleAddSubTask = async (taskIndex) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    if (!newSubTaskText.trim()) return;
    
    const updatedNotes = notes.map((note, idx) => {
      if (idx === taskIndex) {
        return {
          text: note.text,
          timestamp: note.timestamp,
          created_by: note.created_by,
          completed: note.completed || false,
          sub_tasks: [...(note.sub_tasks || []), { 
            text: newSubTaskText, 
            completed: false
          }]
        };
      }
      return {
        text: note.text,
        timestamp: note.timestamp,
        created_by: note.created_by,
        completed: note.completed || false,
        sub_tasks: note.sub_tasks || []
      };
    });
    
    await WorkOrder.update(workOrder.id, { notes: updatedNotes });
    setNewSubTaskText("");
    setAddingSubTaskFor(null);
    if (onUpdate) await onUpdate();
  };

  const handleDeleteSubTask = async (taskIndex, subTaskIndex) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    
    const updatedNotes = notes.map((note, idx) => {
      if (idx === taskIndex) {
        return {
          text: note.text,
          timestamp: note.timestamp,
          created_by: note.created_by,
          completed: note.completed || false,
          sub_tasks: (note.sub_tasks || []).filter((_, subIdx) => subIdx !== subTaskIndex)
        };
      }
      return {
        text: note.text,
        timestamp: note.timestamp,
        created_by: note.created_by,
        completed: note.completed || false,
        sub_tasks: note.sub_tasks || []
      };
    });
    
    await WorkOrder.update(workOrder.id, { notes: updatedNotes });
    if (onUpdate) await onUpdate();
  };

  const handleToggleSubTask = async (taskIndex, subTaskIndex) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    
    const updatedNotes = notes.map((note, idx) => {
      if (idx === taskIndex) {
        const updatedSubTasks = (note.sub_tasks || []).map((st, stIdx) => {
          if (stIdx === subTaskIndex) {
            return { text: st.text, completed: !st.completed };
          }
          return { text: st.text, completed: st.completed };
        });
        return {
          text: note.text,
          timestamp: note.timestamp,
          created_by: note.created_by,
          completed: note.completed || false,
          sub_tasks: updatedSubTasks
        };
      }
      return {
        text: note.text,
        timestamp: note.timestamp,
        created_by: note.created_by,
        completed: note.completed || false,
        sub_tasks: note.sub_tasks || []
      };
    });
    
    await WorkOrder.update(workOrder.id, { notes: updatedNotes });
    if (onUpdate) await onUpdate();
  };

  const handleToggleAsap = async () => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    const newAsapValue = !isAsap;
    // If toggling ASAP on, set priority to -1 to move to top
    const updateData = { asap: newAsapValue };
    if (newAsapValue) {
      updateData.priority = -1;
    }
    await WorkOrder.update(workOrder.id, updateData);
    await ActivityActions.asapToggled(workOrder, newAsapValue);
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
      // Re-fetch in case 'riders' state is not up-to-date or for safety
      const allWorkOrders = await WorkOrder.filter({ completed: false });
      const attachedRiders = allWorkOrders.filter(
        (wo) => wo.parent_work_order_id === workOrder.id && wo.is_rider
      );

      if (attachedRiders.length > 0) {
        setShowRiderDeleteWarning(true);
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
                    <h3 className="font-bold text-gray-800 text-base leading-tight">{workOrder.title}</h3>
                    <span className="text-sm text-gray-500">•</span>
                    <p className="text-sm text-gray-600 font-medium leading-tight">{workOrder.client_name}</p>
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
              {workOrder.assigned_to &&
              <div className="flex items-center gap-1 text-gray-600">
                  <User className="w-3 h-3 flex-shrink-0 text-blue-600" />
                  <span className="text-xs font-medium">{workOrder.assigned_to.split('@')[0]}</span>
                </div>
              }
              {workOrder.due_date &&
              <div className="flex items-center gap-1 text-gray-600">
                  <Calendar className="w-3 h-3 flex-shrink-0 text-orange-600" />
                  <span className="text-xs font-medium">{format(new Date(workOrder.due_date), "MMM d")}</span>
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
            <p className="text-xs text-gray-600 mb-1 leading-snug line-clamp-1">
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
                        <div key={actualIndex} className="bg-white/50 rounded">
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
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleNoteEdit(index, false);
                                      }}
                                      className="cursor-pointer hover:bg-white/70 rounded px-1 transition-colors">
                                      <p className="text-gray-700 text-xs leading-snug">{note.text}</p>
                                    </div>
                                    {/* Sub-tasks - always show all */}
                                    {note.sub_tasks && note.sub_tasks.length > 0 && (
                                      <div className="ml-3 mt-1 space-y-0.5">
                                        {note.sub_tasks.map((subTask, subIdx) => (
                                          <div key={subIdx} className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                              checked={subTask.completed}
                                              onCheckedChange={() => handleToggleSubTask(actualIndex, subIdx)}
                                              className="h-2.5 w-2.5" />
                                            <span className={`text-xs ${subTask.completed ? "line-through text-gray-400" : "text-gray-600"}`}>{subTask.text}</span>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => handleDeleteSubTask(actualIndex, subIdx)}
                                              className="h-3 w-3 ml-auto p-0">
                                              <X className="w-2 h-2 text-red-500" />
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {/* Add sub-task */}
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
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setAddingSubTaskFor(actualIndex);
                                        }}
                                        className="h-4 px-1 text-xs ml-3 mt-0.5"
                                        style={{ fontSize: '9px' }}>
                                        <Plus className="w-2 h-2 mr-0.5" />
                                        Sub
                                      </Button>
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
    </>);

}