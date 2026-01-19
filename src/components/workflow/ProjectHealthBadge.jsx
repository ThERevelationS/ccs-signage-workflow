import React from "react";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Clock,
  TrendingUp,
  TrendingDown
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const healthConfig = {
  on_track: {
    label: "On Track",
    color: "bg-green-100 text-green-800 border-green-300",
    icon: CheckCircle,
    iconColor: "text-green-600"
  },
  at_risk: {
    label: "At Risk",
    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    icon: AlertTriangle,
    iconColor: "text-yellow-600"
  },
  delayed: {
    label: "Delayed",
    color: "bg-red-100 text-red-800 border-red-300",
    icon: XCircle,
    iconColor: "text-red-600"
  },
  blocked: {
    label: "Blocked",
    color: "bg-gray-100 text-gray-800 border-gray-300",
    icon: Clock,
    iconColor: "text-gray-600"
  }
};

// Calculate project health based on tasks, deadlines, and progress
export function calculateProjectHealth(workOrder) {
  const tasks = workOrder.notes || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // If manually overridden, return the override
  if (workOrder.health_override && workOrder.project_health) {
    return {
      status: workOrder.project_health,
      reason: workOrder.health_notes || "Manually set",
      isOverride: true
    };
  }
  
  // Calculate completion percentage
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 1;
  
  // Check for overdue tasks
  const overdueTasks = tasks.filter(t => {
    if (t.completed || !t.due_date) return false;
    const dueDate = new Date(t.due_date);
    return dueDate < today;
  });
  
  // Check for blocked tasks (tasks with incomplete dependencies)
  const blockedTasks = tasks.filter(t => {
    if (t.completed || !t.depends_on?.length) return false;
    return t.depends_on.some(depId => {
      const depTask = tasks.find(dt => dt.id === depId);
      return depTask && !depTask.completed;
    });
  });
  
  // Check project due date
  let daysUntilDue = null;
  if (workOrder.due_date) {
    const dueDate = new Date(workOrder.due_date);
    daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
  }
  
  // Determine health status
  if (blockedTasks.length > 0 && blockedTasks.length >= tasks.length * 0.3) {
    return {
      status: "blocked",
      reason: `${blockedTasks.length} task(s) blocked by dependencies`,
      blockedTasks: blockedTasks.length,
      overdueTasks: overdueTasks.length,
      completionRate
    };
  }
  
  if (overdueTasks.length > 0) {
    return {
      status: "delayed",
      reason: `${overdueTasks.length} overdue task(s)`,
      blockedTasks: blockedTasks.length,
      overdueTasks: overdueTasks.length,
      completionRate
    };
  }
  
  if (daysUntilDue !== null) {
    // If project is due soon and not enough progress
    if (daysUntilDue <= 3 && completionRate < 0.7) {
      return {
        status: "at_risk",
        reason: `Due in ${daysUntilDue} day(s) with only ${Math.round(completionRate * 100)}% complete`,
        blockedTasks: blockedTasks.length,
        overdueTasks: overdueTasks.length,
        completionRate
      };
    }
    
    if (daysUntilDue <= 7 && completionRate < 0.5) {
      return {
        status: "at_risk",
        reason: `Due in ${daysUntilDue} day(s) with only ${Math.round(completionRate * 100)}% complete`,
        blockedTasks: blockedTasks.length,
        overdueTasks: overdueTasks.length,
        completionRate
      };
    }
    
    if (daysUntilDue < 0) {
      return {
        status: "delayed",
        reason: `Project is ${Math.abs(daysUntilDue)} day(s) overdue`,
        blockedTasks: blockedTasks.length,
        overdueTasks: overdueTasks.length,
        completionRate
      };
    }
  }
  
  return {
    status: "on_track",
    reason: `${Math.round(completionRate * 100)}% complete`,
    blockedTasks: blockedTasks.length,
    overdueTasks: overdueTasks.length,
    completionRate
  };
}

export default function ProjectHealthBadge({ workOrder, size = "default", showTooltip = true }) {
  const health = calculateProjectHealth(workOrder);
  const config = healthConfig[health.status] || healthConfig.on_track;
  const Icon = config.icon;
  
  const badge = (
    <Badge 
      variant="outline" 
      className={`${config.color} ${size === "sm" ? "text-xs px-1.5 py-0" : "text-xs px-2 py-0.5"} flex items-center gap-1`}
    >
      <Icon className={`${size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} ${config.iconColor}`} />
      {size !== "sm" && <span>{config.label}</span>}
    </Badge>
  );
  
  if (!showTooltip) return badge;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <p className="font-medium">{config.label}</p>
            <p className="text-gray-500">{health.reason}</p>
            {health.isOverride && (
              <p className="text-blue-500 text-xs">Manually set</p>
            )}
            {health.completionRate !== undefined && (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 rounded-full" 
                    style={{ width: `${health.completionRate * 100}%` }}
                  />
                </div>
                <span>{Math.round(health.completionRate * 100)}%</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}