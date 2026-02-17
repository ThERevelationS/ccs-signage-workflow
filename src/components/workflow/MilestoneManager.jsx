import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, differenceInDays } from "date-fns";
import { 
  Flag, 
  Plus, 
  Trash2, 
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
  AlertTriangle
} from "lucide-react";

export default function MilestoneManager({ 
  milestones = [], 
  tasks = [],
  onUpdate,
  compact = false 
}) {
  const [showDialog, setShowDialog] = useState(false);
  const [newMilestone, setNewMilestone] = useState({
    name: "",
    due_date: "",
    description: "",
    linked_task_ids: []
  });
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const getMilestoneStatus = (milestone) => {
    if (milestone.completed) return { status: "complete", color: "text-green-600" };
    
    const linkedTasks = tasks.filter(t => milestone.linked_task_ids?.includes(t.id));
    const completedLinked = linkedTasks.filter(t => t.completed).length;
    const progress = linkedTasks.length > 0 ? completedLinked / linkedTasks.length : 0;
    
    if (milestone.due_date) {
      const dueDate = new Date(milestone.due_date);
      const daysUntil = differenceInDays(dueDate, today);
      
      if (daysUntil < 0) return { status: "overdue", color: "text-red-600" };
      if (daysUntil <= 3 && progress < 0.7) return { status: "at_risk", color: "text-orange-600" };
    }
    
    return { status: "pending", color: "text-blue-600" };
  };
  
  const handleAddMilestone = () => {
    if (!newMilestone.name) return;
    
    const milestone = {
      id: Date.now().toString(),
      ...newMilestone,
      completed: false
    };
    
    onUpdate([...milestones, milestone]);
    setNewMilestone({ name: "", due_date: "", description: "", linked_task_ids: [] });
    setShowDialog(false);
  };
  
  const handleToggleMilestone = (milestoneId) => {
    const updated = milestones.map(m => {
      if (m.id === milestoneId) {
        return {
          ...m,
          completed: !m.completed,
          completed_date: !m.completed ? format(new Date(), "yyyy-MM-dd") : null
        };
      }
      return m;
    });
    onUpdate(updated);
  };
  
  const handleDeleteMilestone = (milestoneId) => {
    onUpdate(milestones.filter(m => m.id !== milestoneId));
  };
  
  const sortedMilestones = [...milestones].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date) - new Date(b.due_date);
  });
  
  if (compact) {
    const upcoming = milestones.filter(m => !m.completed).slice(0, 2);
    
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
            <Flag className="w-3 h-3" />
            Milestones
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-5 px-1.5 text-xs"
            onClick={() => setShowDialog(true)}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        
        {upcoming.length > 0 ? (
          <div className="space-y-1">
            {upcoming.map(m => {
              const status = getMilestoneStatus(m);
              return (
                <div key={m.id} className="flex items-center gap-2 text-xs">
                  <Flag className={`w-3 h-3 ${status.color}`} />
                  <span className="truncate flex-1">{m.name}</span>
                  {m.due_date && (
                    <span className="text-gray-400">
                      {format(new Date(m.due_date), "M/d")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-400">No milestones</p>
        )}
        
        <MilestoneDialog 
          open={showDialog}
          onOpenChange={setShowDialog}
          milestone={newMilestone}
          setMilestone={setNewMilestone}
          tasks={tasks}
          onSave={handleAddMilestone}
        />
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Flag className="w-4 h-4 text-purple-600" />
          Milestones
        </h3>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 px-2 text-xs"
          onClick={() => setShowDialog(true)}
        >
          <Plus className="w-3 h-3 mr-1" />
          Add
        </Button>
      </div>
      
      {sortedMilestones.length > 0 ? (
        <div className="space-y-2">
          {sortedMilestones.map(milestone => {
            const status = getMilestoneStatus(milestone);
            const linkedTasks = tasks.filter(t => milestone.linked_task_ids?.includes(t.id));
            const completedLinked = linkedTasks.filter(t => t.completed).length;
            
            return (
              <div 
                key={milestone.id}
                className={`p-3 rounded-lg border ${
                  milestone.completed ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={milestone.completed}
                    onCheckedChange={() => handleToggleMilestone(milestone.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium text-sm ${milestone.completed ? 'line-through text-gray-400' : ''}`}>
                        {milestone.name}
                      </span>
                      {status.status === "overdue" && !milestone.completed && (
                        <Badge variant="outline" className="text-xs text-red-600 border-red-300">
                          Overdue
                        </Badge>
                      )}
                      {status.status === "at_risk" && !milestone.completed && (
                        <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                          At Risk
                        </Badge>
                      )}
                    </div>
                    
                    {milestone.description && (
                      <p className="text-xs text-gray-500 mt-1">{milestone.description}</p>
                    )}
                    
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      {milestone.due_date && (
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3" />
                          {format(new Date(milestone.due_date), "MMM d, yyyy")}
                        </span>
                      )}
                      {linkedTasks.length > 0 && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {completedLinked}/{linkedTasks.length} tasks
                        </span>
                      )}
                    </div>
                    
                    {linkedTasks.length > 0 && (
                      <div className="mt-2">
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${(completedLinked / linkedTasks.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleDeleteMilestone(milestone.id)}
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center py-4">No milestones set</p>
      )}
      
      <MilestoneDialog 
        open={showDialog}
        onOpenChange={setShowDialog}
        milestone={newMilestone}
        setMilestone={setNewMilestone}
        tasks={tasks}
        onSave={handleAddMilestone}
      />
    </div>
  );
}

function MilestoneDialog({ open, onOpenChange, milestone, setMilestone, tasks, onSave }) {
  return (
    <Dialog open={open} onOpenChange={() => {}} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
      <DialogContent className="clay-card border-none max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-purple-600" />
            Add Milestone
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input
              value={milestone.name}
              onChange={(e) => setMilestone({ ...milestone, name: e.target.value })}
              placeholder="e.g., Design Approval"
              className="mt-1"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Due Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full mt-1 justify-start">
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {milestone.due_date 
                    ? format(new Date(milestone.due_date), "MMM d, yyyy")
                    : "Select date"
                  }
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={milestone.due_date ? new Date(milestone.due_date) : undefined}
                  onSelect={(date) => setMilestone({ 
                    ...milestone, 
                    due_date: date ? format(date, "yyyy-MM-dd") : "" 
                  })}
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div>
            <label className="text-sm font-medium">Description (optional)</label>
            <Input
              value={milestone.description}
              onChange={(e) => setMilestone({ ...milestone, description: e.target.value })}
              placeholder="Brief description..."
              className="mt-1"
            />
          </div>
          
          {tasks.length > 0 && (
            <div>
              <label className="text-sm font-medium">Link Tasks</label>
              <div className="mt-1 max-h-32 overflow-y-auto space-y-1 border rounded p-2">
                {tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={milestone.linked_task_ids?.includes(task.id)}
                      onCheckedChange={(checked) => {
                        const ids = milestone.linked_task_ids || [];
                        setMilestone({
                          ...milestone,
                          linked_task_ids: checked
                            ? [...ids, task.id]
                            : ids.filter(id => id !== task.id)
                        });
                      }}
                    />
                    <span className={task.completed ? 'line-through text-gray-400' : ''}>
                      {task.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <Button onClick={onSave} className="w-full" disabled={!milestone.name}>
            Add Milestone
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}