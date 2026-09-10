import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";


import { format, startOfWeek, endOfWeek, addWeeks, eachDayOfInterval } from "date-fns";
import { 
  Users, 
  Clock, 
  AlertTriangle, 
  ChevronLeft,
  ChevronRight,
  Calendar
} from "lucide-react";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;
const UserCapacity = base44.entities.UserCapacity;

export default function ResourceAllocationView({ compact = false }) {
  const [users, setUsers] = useState([]);
  const [userCapacities, setUserCapacities] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [usersData, capacitiesData, ordersData] = await Promise.all([
        loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "Resource Allocation authorized users" }),
        loadAllEntityRows({ entity: UserCapacity, sort: null, label: "Resource Allocation user capacities" }),
        loadAllEntityRows({
          entity: WorkOrder,
          query: { completed: false, deleted: { $ne: true } },
          sort: "created_date",
          label: "Resource Allocation Work Orders",
        })
      ]);
      setUsers(usersData);
      setUserCapacities(capacitiesData);
      setWorkOrders(ordersData);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };
  
  // Calculate allocations for each user
  const userAllocations = useMemo(() => {
    const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: selectedWeek, end: weekEnd });
    
    return users.map(user => {
      const capacity = userCapacities.find(c => c.user_email === user.email);
      const weeklyCapacity = capacity?.weekly_hours_capacity || 40;
      const dailyCapacity = capacity?.daily_hours_capacity || 8;
      
      // Find all tasks assigned to this user
      let totalHours = 0;
      const assignedTasks = [];
      
      workOrders.forEach(wo => {
        const tasks = wo.notes || [];
        tasks.forEach(task => {
          if (task.assigned_to === user.full_name || task.assigned_to === user.email) {
            if (!task.completed) {
              const hours = task.estimated_hours || 2; // Default 2 hours if not specified
              totalHours += hours;
              assignedTasks.push({
                workOrderId: wo.id,
                workOrderTitle: wo.title,
                taskText: task.text,
                hours,
                dueDate: task.due_date || wo.due_date
              });
            }
          }
        });
      });
      
      // Check for time off this week
      const timeOff = capacity?.time_off_dates?.filter(to => {
        const start = new Date(to.start_date);
        const end = new Date(to.end_date);
        return weekDays.some(d => d >= start && d <= end);
      }) || [];
      
      const timeOffDays = timeOff.reduce((acc, to) => {
        const start = new Date(to.start_date);
        const end = new Date(to.end_date);
        return acc + weekDays.filter(d => d >= start && d <= end).length;
      }, 0);
      
      const adjustedCapacity = weeklyCapacity - (timeOffDays * dailyCapacity);
      const utilizationPercent = adjustedCapacity > 0 ? (totalHours / adjustedCapacity) * 100 : 0;
      
      return {
        user,
        capacity: {
          weekly: weeklyCapacity,
          daily: dailyCapacity,
          adjusted: adjustedCapacity
        },
        allocated: totalHours,
        available: Math.max(0, adjustedCapacity - totalHours),
        utilizationPercent,
        tasks: assignedTasks,
        timeOff,
        isOverallocated: totalHours > adjustedCapacity,
        isUnderutilized: utilizationPercent < 50
      };
    });
  }, [users, userCapacities, workOrders, selectedWeek]);
  
  const getUtilizationColor = (percent) => {
    if (percent > 100) return "bg-red-500";
    if (percent > 85) return "bg-orange-500";
    if (percent > 50) return "bg-green-500";
    return "bg-blue-500";
  };
  
  const navigateWeek = (direction) => {
    setSelectedWeek(prev => addWeeks(prev, direction));
  };
  
  if (compact) {
    const overallocated = userAllocations.filter(a => a.isOverallocated);
    const underutilized = userAllocations.filter(a => a.isUnderutilized && a.allocated > 0);
    
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
            <Users className="w-3 h-3" />
            Resource Allocation
          </span>
        </div>
        
        {overallocated.length > 0 && (
          <div className="p-2 bg-red-50 rounded text-xs text-red-700">
            <div className="flex items-center gap-1 font-medium">
              <AlertTriangle className="w-3 h-3" />
              {overallocated.length} overallocated
            </div>
            <div className="mt-1 text-red-600">
              {overallocated.map(a => a.user.full_name || a.user.email).join(", ")}
            </div>
          </div>
        )}
        
        {underutilized.length > 0 && overallocated.length === 0 && (
          <div className="p-2 bg-blue-50 rounded text-xs text-blue-700">
            {underutilized.length} with capacity available
          </div>
        )}
        
        {overallocated.length === 0 && underutilized.length === 0 && (
          <div className="text-xs text-gray-400">Resources balanced</div>
        )}
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" />
          Resource Allocation
        </h3>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateWeek(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs font-medium">
            {format(selectedWeek, "MMM d")} - {format(endOfWeek(selectedWeek, { weekStartsOn: 1 }), "MMM d, yyyy")}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateWeek(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-3">
          {userAllocations.map(allocation => (
            <div 
              key={allocation.user.id}
              className={`p-3 rounded-lg border ${
                allocation.isOverallocated 
                  ? 'bg-red-50 border-red-200' 
                  : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {allocation.user.full_name || allocation.user.email}
                  </span>
                  {allocation.isOverallocated && (
                    <Badge variant="outline" className="text-xs text-red-600 border-red-300">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Overallocated
                    </Badge>
                  )}
                  {allocation.timeOff.length > 0 && (
                    <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">
                      <Calendar className="w-3 h-3 mr-1" />
                      Time Off
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {allocation.allocated.toFixed(1)}h / {allocation.capacity.adjusted}h
                </div>
              </div>
              
              <div className="mb-2">
                <Progress 
                  value={Math.min(allocation.utilizationPercent, 100)} 
                  className="h-2"
                />
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">
                  {Math.round(allocation.utilizationPercent)}% utilized
                </span>
                <span className={allocation.available > 0 ? 'text-green-600' : 'text-red-600'}>
                  {allocation.available > 0 
                    ? `${allocation.available.toFixed(1)}h available`
                    : `${Math.abs(allocation.available).toFixed(1)}h over`
                  }
                </span>
              </div>
              
              {allocation.tasks.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <div className="text-xs text-gray-500 mb-1">{allocation.tasks.length} assigned tasks:</div>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {allocation.tasks.slice(0, 5).map((task, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span className="truncate flex-1">{task.taskText}</span>
                        <span className="text-gray-400">{task.hours}h</span>
                      </div>
                    ))}
                    {allocation.tasks.length > 5 && (
                      <div className="text-xs text-gray-400">
                        +{allocation.tasks.length - 5} more tasks
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}