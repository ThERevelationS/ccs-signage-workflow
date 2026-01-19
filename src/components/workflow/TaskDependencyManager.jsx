import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  Link2, 
  Unlink, 
  AlertCircle, 
  CheckCircle2,
  ArrowRight,
  GitBranch
} from "lucide-react";

export default function TaskDependencyManager({ 
  tasks, 
  currentTaskId, 
  currentTaskIndex,
  onUpdateDependencies,
  compact = false 
}) {
  const [isOpen, setIsOpen] = useState(false);
  
  const currentTask = tasks.find(t => t.id === currentTaskId) || tasks[currentTaskIndex];
  const currentDeps = currentTask?.depends_on || [];
  
  // Get available tasks (all except current)
  const availableTasks = useMemo(() => {
    return tasks.filter((t, idx) => {
      if (currentTaskId) return t.id !== currentTaskId;
      return idx !== currentTaskIndex;
    });
  }, [tasks, currentTaskId, currentTaskIndex]);
  
  // Check if adding a dependency would create a cycle
  const wouldCreateCycle = (taskId) => {
    const visited = new Set();
    const stack = [taskId];
    
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === currentTaskId || current === currentTaskIndex?.toString()) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      
      const task = tasks.find(t => t.id === current);
      if (task?.depends_on) {
        stack.push(...task.depends_on);
      }
    }
    return false;
  };
  
  // Get dependency status for each task
  const getDependencyStatus = (depId) => {
    const depTask = tasks.find(t => t.id === depId);
    if (!depTask) return { status: "missing", label: "Not found" };
    if (depTask.completed) return { status: "complete", label: "Complete" };
    return { status: "pending", label: "Pending" };
  };
  
  const toggleDependency = (taskId) => {
    const newDeps = currentDeps.includes(taskId)
      ? currentDeps.filter(id => id !== taskId)
      : [...currentDeps, taskId];
    onUpdateDependencies(newDeps);
  };
  
  const isBlocked = useMemo(() => {
    return currentDeps.some(depId => {
      const depTask = tasks.find(t => t.id === depId);
      return depTask && !depTask.completed;
    });
  }, [currentDeps, tasks]);
  
  if (compact) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className={`h-5 px-1.5 text-xs ${isBlocked ? 'text-orange-600' : 'text-gray-500'}`}
          >
            <GitBranch className="w-3 h-3 mr-0.5" />
            {currentDeps.length > 0 && (
              <span className="ml-0.5">{currentDeps.length}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2">
          <div className="text-xs font-medium mb-2">Dependencies</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {availableTasks.map((task, idx) => {
              const taskId = task.id || idx.toString();
              const isDependent = currentDeps.includes(taskId);
              const status = getDependencyStatus(taskId);
              const willCycle = !isDependent && wouldCreateCycle(taskId);
              
              return (
                <div 
                  key={taskId}
                  className={`flex items-center gap-2 p-1.5 rounded text-xs ${
                    willCycle ? 'opacity-50' : 'hover:bg-gray-100'
                  }`}
                >
                  <Checkbox
                    checked={isDependent}
                    onCheckedChange={() => !willCycle && toggleDependency(taskId)}
                    disabled={willCycle}
                    className="h-3 w-3"
                  />
                  <span className={`flex-1 truncate ${task.completed ? 'line-through text-gray-400' : ''}`}>
                    {task.text}
                  </span>
                  {isDependent && (
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] px-1 py-0 ${
                        status.status === 'complete' ? 'text-green-600' : 'text-orange-600'
                      }`}
                    >
                      {status.label}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
          {isBlocked && (
            <div className="mt-2 p-1.5 bg-orange-50 rounded text-xs text-orange-700 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Blocked by incomplete dependencies
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  }
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Dependencies</span>
        {isBlocked && (
          <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
            <AlertCircle className="w-3 h-3 mr-1" />
            Blocked
          </Badge>
        )}
      </div>
      
      {currentDeps.length > 0 ? (
        <div className="space-y-1">
          {currentDeps.map(depId => {
            const depTask = tasks.find(t => t.id === depId);
            const status = getDependencyStatus(depId);
            
            return (
              <div 
                key={depId}
                className="flex items-center gap-2 p-2 bg-gray-50 rounded text-xs"
              >
                {status.status === 'complete' ? (
                  <CheckCircle2 className="w-3 h-3 text-green-600" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-orange-500" />
                )}
                <span className={`flex-1 truncate ${depTask?.completed ? 'line-through text-gray-400' : ''}`}>
                  {depTask?.text || 'Unknown task'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => toggleDependency(depId)}
                >
                  <Unlink className="w-3 h-3 text-red-500" />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-400">No dependencies</p>
      )}
      
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full text-xs h-7">
            <Link2 className="w-3 h-3 mr-1" />
            Add Dependency
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2">
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {availableTasks.filter(t => !currentDeps.includes(t.id)).map((task, idx) => {
              const taskId = task.id || idx.toString();
              const willCycle = wouldCreateCycle(taskId);
              
              return (
                <button
                  key={taskId}
                  className={`w-full text-left p-2 rounded text-xs hover:bg-gray-100 flex items-center gap-2 ${
                    willCycle ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  onClick={() => !willCycle && toggleDependency(taskId)}
                  disabled={willCycle}
                >
                  <ArrowRight className="w-3 h-3 text-gray-400" />
                  <span className={task.completed ? 'line-through text-gray-400' : ''}>
                    {task.text}
                  </span>
                  {willCycle && (
                    <span className="text-red-500 text-[10px]">Cycle</span>
                  )}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}