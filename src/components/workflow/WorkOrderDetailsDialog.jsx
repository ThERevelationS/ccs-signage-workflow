import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  EyeOff
} from "lucide-react";
import { format } from "date-fns";
import { WorkOrder } from "@/entities/WorkOrder";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

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
  const [newDependency, setNewDependency] = useState({
    trigger_type: "stage_change",
    trigger_value: "",
    action_type: "move_stage",
    action_value: "",
    target_work_order_id: ""
  });

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
        wo => wo.parent_work_order_id === workOrder.id && wo.is_rider
      );
      setRiders(foundRiders);
    }

    // Find parent
    if (workOrder.is_rider && workOrder.parent_work_order_id) {
      const parent = all.find(wo => wo.id === workOrder.parent_work_order_id);
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
    const updatedDeps = dependencies.filter(d => d.id !== depId);
    await WorkOrder.update(workOrder.id, { dependencies: updatedDeps });
    setDependencies(updatedDeps);
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

  // Calculate Gantt chart dimensions
  const getGanttData = () => {
    if (!workOrder.start_date || !workOrder.due_date) return null;
    
    const start = new Date(workOrder.start_date);
    const end = new Date(workOrder.due_date);
    const today = new Date();
    
    const totalDays = Math.max((end - start) / (1000 * 60 * 60 * 24), 1);
    const daysElapsed = Math.max((today - start) / (1000 * 60 * 60 * 24), 0);
    const progress = Math.min((daysElapsed / totalDays) * 100, 100);
    
    return { start, end, totalDays, progress };
  };

  const ganttData = getGanttData();

  const notes = React.useMemo(() => {
    if (!workOrder?.notes) return [];
    if (Array.isArray(workOrder.notes)) {
      return workOrder.notes.map((note) => ({
        ...note,
        completed: note.completed || false
      }));
    }
    return [];
  }, [workOrder?.notes]);

  const activeNotes = notes.filter(n => !n.completed);
  const completedNotes = notes.filter(n => n.completed);

  if (!workOrder) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="clay-card border-none max-w-[95vw] w-[1400px] max-h-[95vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-gray-800">{workOrder.title}</h2>
                  {workOrder.is_rider && (
                    <Badge className="rounded-full" style={{
                      background: 'linear-gradient(135deg, #FFD6E8 0%, #E0D4F7 100%)',
                      color: '#7C3AED'
                    }}>
                      Rider
                    </Badge>
                  )}
                  {workOrder.asap && (
                    <Badge className="rounded-full bg-red-600 text-white">ASAP</Badge>
                  )}
                </div>
                <p className="text-gray-600">{workOrder.client_name}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Main Content - Scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-3 gap-6">
              
              {/* Left Column - Core Info */}
              <div className="space-y-4">
                {/* Image */}
                {workOrder.image_url && (
                  <div className="rounded-xl overflow-hidden" style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(240,240,240,0.8) 100%)',
                    boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.1)'
                  }}>
                    <img src={workOrder.image_url} alt={workOrder.title} className="w-full h-48 object-contain" />
                  </div>
                )}

                {/* Basic Info */}
                <div className="clay-card p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-blue-600" />
                    <span className="font-medium">Assigned:</span>
                    <span className="text-gray-600">{workOrder.assigned_to || 'Unassigned'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-orange-600" />
                    <span className="font-medium">Due:</span>
                    <span className="text-gray-600">
                      {workOrder.due_date ? format(new Date(workOrder.due_date), "MMM d, yyyy") : 'No due date'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-purple-600" />
                    <span className="font-medium">Stage:</span>
                    <Badge style={{ backgroundColor: stageColors[workOrder.current_stage] }}>
                      {stageDisplayNames[workOrder.current_stage]}
                    </Badge>
                  </div>
                </div>

                {/* Description */}
                {workOrder.description && (
                  <div className="clay-card p-4">
                    <h3 className="font-semibold text-sm mb-2">Description</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{workOrder.description}</p>
                  </div>
                )}

                {/* Gantt Chart */}
                {ganttData && (
                  <div className="clay-card p-4">
                    <h3 className="font-semibold text-sm mb-3">Timeline</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{format(ganttData.start, "MMM d")}</span>
                        <span>{format(ganttData.end, "MMM d")}</span>
                      </div>
                      <div className="h-8 rounded-full overflow-hidden" style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(240,240,240,0.8) 100%)',
                        boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.1)'
                      }}>
                        <div 
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${ganttData.progress}%`,
                            background: `linear-gradient(135deg, ${stageColors[workOrder.current_stage]} 0%, rgba(255,255,255,0.7) 100%)`
                          }}
                        />
                      </div>
                      <p className="text-xs text-center text-gray-500">
                        {Math.round(ganttData.progress)}% Complete • {Math.max(0, Math.ceil(ganttData.totalDays - (ganttData.totalDays * ganttData.progress / 100)))} days remaining
                      </p>
                    </div>
                  </div>
                )}

                {/* Relationships */}
                <div className="clay-card p-4">
                  <h3 className="font-semibold text-sm mb-3">Relationships</h3>
                  
                  {parentWorkOrder && (
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
                  )}

                  {riders.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Riders ({riders.length})</p>
                      <div className="space-y-1">
                        {riders.map(rider => (
                          <Link key={rider.id} to={createPageUrl(getPageNameForStage(rider.rider_stage || rider.current_stage))}>
                            <div className="clay-button p-2 rounded-lg flex items-center gap-2 hover:opacity-80 transition-opacity">
                              <LinkIcon className="w-4 h-4 text-purple-600" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{rider.title}</p>
                                <p className="text-xs text-gray-500">Stage: {stageDisplayNames[rider.current_stage]}</p>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {!parentWorkOrder && riders.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">No relationships</p>
                  )}
                </div>
              </div>

              {/* Middle Column - Notes & Dependencies */}
              <div className="space-y-4">
                {/* Notes */}
                <div className="clay-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">Notes</h3>
                    {completedNotes.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCompletedNotes(!showCompletedNotes)}
                        className="h-6 px-2 text-xs"
                      >
                        {showCompletedNotes ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                        {showCompletedNotes ? 'Hide' : 'Show'} ({completedNotes.length})
                      </Button>
                    )}
                  </div>
                  
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {activeNotes.map((note, idx) => (
                      <div key={idx} className="p-2 bg-white/50 rounded-lg">
                        <p className="text-sm text-gray-700">{note.text}</p>
                      </div>
                    ))}
                    
                    {showCompletedNotes && completedNotes.map((note, idx) => (
                      <div key={idx} className="p-2 bg-gray-100/50 rounded-lg opacity-60">
                        <p className="text-sm text-gray-600 line-through">{note.text}</p>
                      </div>
                    ))}
                    
                    {activeNotes.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">No active notes</p>
                    )}
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
                      className="h-6 px-2 text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Rule
                    </Button>
                  </div>

                  {/* Add New Dependency Form */}
                  {isEditingDependency && (
                    <div className="mb-3 p-3 bg-blue-50 rounded-lg space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">When</Label>
                          <Select
                            value={newDependency.trigger_type}
                            onValueChange={(val) => setNewDependency({...newDependency, trigger_type: val})}
                          >
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
                          {newDependency.trigger_type === "stage_change" ? (
                            <Select
                              value={newDependency.trigger_value}
                              onValueChange={(val) => setNewDependency({...newDependency, trigger_value: val})}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select stage" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.keys(stageDisplayNames).map(stage => (
                                  <SelectItem key={stage} value={stage}>{stageDisplayNames[stage]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : newDependency.trigger_type === "date_reached" ? (
                            <Input
                              type="date"
                              className="h-8 text-xs"
                              value={newDependency.trigger_value}
                              onChange={(e) => setNewDependency({...newDependency, trigger_value: e.target.value})}
                            />
                          ) : (
                            <Input
                              className="h-8 text-xs"
                              placeholder="Enter value"
                              value={newDependency.trigger_value}
                              onChange={(e) => setNewDependency({...newDependency, trigger_value: e.target.value})}
                            />
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Then</Label>
                          <Select
                            value={newDependency.action_type}
                            onValueChange={(val) => setNewDependency({...newDependency, action_type: val})}
                          >
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
                          {newDependency.action_type === "move_stage" ? (
                            <Select
                              value={newDependency.action_value}
                              onValueChange={(val) => setNewDependency({...newDependency, action_value: val})}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select stage" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.keys(stageDisplayNames).map(stage => (
                                  <SelectItem key={stage} value={stage}>{stageDisplayNames[stage]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              className="h-8 text-xs"
                              placeholder="Enter value"
                              value={newDependency.action_value}
                              onChange={(e) => setNewDependency({...newDependency, action_value: e.target.value})}
                            />
                          )}
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs">Target (Optional)</Label>
                        <Select
                          value={newDependency.target_work_order_id}
                          onValueChange={(val) => setNewDependency({...newDependency, target_work_order_id: val})}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="This work order" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={null}>This Work Order</SelectItem>
                            {allWorkOrders
                              .filter(wo => wo.id !== workOrder.id)
                              .map(wo => (
                                <SelectItem key={wo.id} value={wo.id}>{wo.title}</SelectItem>
                              ))
                            }
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsEditingDependency(false)}
                          className="h-6 px-2 text-xs"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleAddDependency}
                          className="h-6 px-2 text-xs bg-blue-600 text-white"
                        >
                          Add Rule
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Existing Dependencies */}
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {dependencies.map((dep) => {
                      const targetWO = allWorkOrders.find(wo => wo.id === dep.target_work_order_id);
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
                            {dep.target_work_order_id && targetWO && (
                              <p className="text-xs text-gray-500">Target: {targetWO.title}</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteDependency(dep.id)}
                            className="h-5 w-5 flex-shrink-0"
                          >
                            <Trash2 className="w-3 h-3 text-red-600" />
                          </Button>
                        </div>
                      );
                    })}
                    
                    {dependencies.length === 0 && !isEditingDependency && (
                      <p className="text-xs text-gray-400 text-center py-2">No automation rules</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column - Actions */}
              <div className="space-y-4">
                {/* Quick Actions */}
                <div className="clay-card p-4">
                  <h3 className="font-semibold text-sm mb-3">Quick Actions</h3>
                  <div className="space-y-2">
                    <Button
                      className="w-full justify-start clay-button"
                      variant="ghost"
                      onClick={() => { onEdit(workOrder); onClose(); }}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Details
                    </Button>

                    {!workOrder.is_rider && onSplit && (
                      <Button
                        className="w-full justify-start clay-button"
                        variant="ghost"
                        onClick={() => { onSplit(workOrder); onClose(); }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Rider
                      </Button>
                    )}

                    {onComplete && !workOrder.completed && (
                      <Button
                        className="w-full justify-start clay-button"
                        variant="ghost"
                        onClick={() => { onComplete(workOrder); onClose(); }}
                      >
                        <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                        Mark Complete
                      </Button>
                    )}

                    <Button
                      className="w-full justify-start clay-button text-red-600 hover:text-red-700"
                      variant="ghost"
                      onClick={handleDeleteWorkOrder}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete {workOrder.is_rider ? 'Rider' : 'Work Order'}
                    </Button>
                  </div>
                </div>

                {/* Move to Stage */}
                {!workOrder.is_rider && onMove && (
                  <div className="clay-card p-4">
                    <h3 className="font-semibold text-sm mb-3">Move to Stage</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.keys(stageDisplayNames).map(stage => (
                        <Button
                          key={stage}
                          className="clay-button text-xs justify-start"
                          variant="ghost"
                          size="sm"
                          disabled={workOrder.current_stage === stage}
                          onClick={() => { onMove(workOrder, stage); onClose(); }}
                          style={{
                            background: workOrder.current_stage === stage 
                              ? `linear-gradient(135deg, ${stageColors[stage]} 0%, rgba(255,255,255,0.9) 100%)`
                              : undefined,
                            opacity: workOrder.current_stage === stage ? 0.5 : 1
                          }}
                        >
                          <ArrowRight className="w-3 h-3 mr-1" />
                          {stageDisplayNames[stage]}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Restore Options (for completed work orders) */}
                {onRestore && workOrder.completed && (
                  <div className="clay-card p-4">
                    <h3 className="font-semibold text-sm mb-3">Restore to Stage</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {['permitting', 'design', 'production', 'fabrication', 'installation'].map(stage => (
                        <Button
                          key={stage}
                          className="clay-button text-xs justify-start"
                          variant="ghost"
                          size="sm"
                          onClick={() => { onRestore(workOrder, stage); onClose(); }}
                        >
                          <ArrowRight className="w-3 h-3 mr-1" />
                          {stageDisplayNames[stage]}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
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
    </>
  );
}