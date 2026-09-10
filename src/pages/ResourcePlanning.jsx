import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";


import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format, startOfWeek, endOfWeek, addWeeks, eachDayOfInterval } from "date-fns";
import { 
  Users, 
  Clock, 
  AlertTriangle, 
  ChevronLeft,
  ChevronRight,
  Calendar,
  TrendingUp,
  XCircle,
  Loader2,
  Settings,
  Save
} from "lucide-react";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { loadSingleUserCapacity, saveUserCapacityIfUnchanged } from "@/components/resourcePlanning/userCapacityPersistence";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;
const UserCapacity = base44.entities.UserCapacity;

export default function ResourcePlanning() {
  const { currentUser, isRegistered } = useAuth();
  const [users, setUsers] = useState([]);
  const [userCapacities, setUserCapacities] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [isLoading, setIsLoading] = useState(true);
  const [editingCapacity, setEditingCapacity] = useState(null);
  const [capacityForm, setCapacityForm] = useState({ weekly_hours_capacity: 40, daily_hours_capacity: 8 });
  const [capacityRecord, setCapacityRecord] = useState(null);
  const [capacityError, setCapacityError] = useState("");
  const [capacitySaving, setCapacitySaving] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  
  useEffect(() => {
    checkAccess();
  }, [currentUser]);
  
  const checkAccess = async () => {
    if (!currentUser?.email) {
      setAccessChecked(true);
      return;
    }
    
    try {
      const users = await AuthorizedEmail.filter({ email: currentUser.email });
      const user = users[0];
      // Admin always has access, or if can_view_resources is true
      if (user?.role === 'admin' || user?.can_view_resources) {
        setHasAccess(true);
        loadData();
      }
    } catch (error) {
      console.error("Error checking access:", error);
    }
    setAccessChecked(true);
  };
  
  useEffect(() => {
    if (hasAccess) {
      loadData();
    }
  }, [hasAccess]);
  
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [usersData, capacitiesData, ordersData] = await Promise.all([
        loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "Resource Planning authorized users" }),
        loadAllEntityRows({ entity: UserCapacity, sort: null, label: "Resource Planning user capacities" }),
        loadAllEntityRows({
          entity: WorkOrder,
          query: { completed: false, deleted: { $ne: true } },
          sort: "created_date",
          label: "Resource Planning Work Orders",
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
              const hours = task.estimated_hours || 2;
              totalHours += hours;
              assignedTasks.push({
                workOrderId: wo.id,
                workOrderTitle: wo.title,
                clientName: wo.client_name,
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
        isUnderutilized: utilizationPercent < 50 && totalHours > 0
      };
    });
  }, [users, userCapacities, workOrders, selectedWeek]);
  
  // Summary stats
  const summaryStats = useMemo(() => {
    const totalCapacity = userAllocations.reduce((acc, a) => acc + a.capacity.adjusted, 0);
    const totalAllocated = userAllocations.reduce((acc, a) => acc + a.allocated, 0);
    const overallocatedCount = userAllocations.filter(a => a.isOverallocated).length;
    const underutilizedCount = userAllocations.filter(a => a.isUnderutilized).length;
    
    return {
      totalCapacity,
      totalAllocated,
      totalAvailable: totalCapacity - totalAllocated,
      utilizationPercent: totalCapacity > 0 ? (totalAllocated / totalCapacity) * 100 : 0,
      overallocatedCount,
      underutilizedCount
    };
  }, [userAllocations]);
  
  const getUtilizationColor = (percent) => {
    if (percent > 100) return "bg-red-500";
    if (percent > 85) return "bg-orange-500";
    if (percent > 50) return "bg-green-500";
    return "bg-blue-500";
  };
  
  const navigateWeek = (direction) => {
    setSelectedWeek(prev => addWeeks(prev, direction));
  };
  
  const handleSaveCapacity = async () => {
    if (!editingCapacity || capacitySaving) return;
    setCapacitySaving(true);
    setCapacityError("");
    try {
      const saved = await saveUserCapacityIfUnchanged({
        entity: UserCapacity,
        loadedRecord: capacityRecord,
        userEmail: editingCapacity.email,
        nextFields: {
          user_name: editingCapacity.full_name || editingCapacity.email,
          ...capacityForm,
        },
        label: `Capacity for ${editingCapacity.full_name || editingCapacity.email}`,
      });
      setCapacityRecord(saved);
      await loadData();
      setEditingCapacity(null);
    } catch (error) {
      console.error("Capacity save blocked:", error);
      setCapacityError(error?.message || "This employee capacity changed in another session. Reload before saving.");
      const latest = await loadSingleUserCapacity({ entity: UserCapacity, userEmail: editingCapacity.email, label: "Employee capacity" }).catch(() => null);
      setCapacityRecord(latest);
      if (latest) {
        setCapacityForm({
          weekly_hours_capacity: latest.weekly_hours_capacity || 40,
          daily_hours_capacity: latest.daily_hours_capacity || 8,
        });
      }
    } finally {
      setCapacitySaving(false);
    }
  };
  
  if (!accessChecked || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }
  
  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="clay-card p-8 text-center max-w-md">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Access Restricted</h2>
          <p className="text-gray-600">
            You don't have permission to view this page. Please contact an administrator to request access.
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Resource Planning</h1>
          <p className="text-gray-500">Manage team capacity and workload</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 clay-card px-4 py-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateWeek(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-[180px] text-center">
              {format(selectedWeek, "MMM d")} - {format(endOfWeek(selectedWeek, { weekStartsOn: 1 }), "MMM d, yyyy")}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateWeek(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="clay-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Total Capacity</p>
                <p className="text-2xl font-bold">{summaryStats.totalCapacity}h</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="clay-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Allocated</p>
                <p className="text-2xl font-bold">{summaryStats.totalAllocated.toFixed(1)}h</p>
              </div>
              <Clock className="w-8 h-8 text-purple-500" />
            </div>
            <Progress 
              value={Math.min(summaryStats.utilizationPercent, 100)} 
              className="h-2 mt-2"
            />
            <p className="text-xs text-gray-500 mt-1">{Math.round(summaryStats.utilizationPercent)}% utilized</p>
          </CardContent>
        </Card>
        
        <Card className={`clay-card ${summaryStats.overallocatedCount > 0 ? 'border-red-300' : ''}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Overallocated</p>
                <p className="text-2xl font-bold">{summaryStats.overallocatedCount}</p>
              </div>
              <AlertTriangle className={`w-8 h-8 ${summaryStats.overallocatedCount > 0 ? 'text-red-500' : 'text-gray-300'}`} />
            </div>
          </CardContent>
        </Card>
        
        <Card className="clay-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Available</p>
                <p className="text-2xl font-bold">{Math.max(0, summaryStats.totalAvailable).toFixed(1)}h</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Team Members */}
      <div className="clay-card p-4">
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-600" />
          Team Workload
        </h2>
        
        <div className="space-y-4">
          {userAllocations.map(allocation => (
            <div 
              key={allocation.user.id}
              className={`p-4 rounded-xl border ${
                allocation.isOverallocated 
                  ? 'bg-red-50 border-red-200' 
                  : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold">
                    {(allocation.user.full_name || allocation.user.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <span className="font-medium">
                      {allocation.user.full_name || allocation.user.email}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
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
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {allocation.allocated.toFixed(1)}h / {allocation.capacity.adjusted}h
                    </div>
                    <div className="text-xs text-gray-500">
                      {Math.round(allocation.utilizationPercent)}% utilized
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const cap = userCapacities.find(c => c.user_email === allocation.user.email) || null;
                      setCapacityRecord(cap);
                      setCapacityError("");
                      setCapacityForm({
                        weekly_hours_capacity: cap?.weekly_hours_capacity || 40,
                        daily_hours_capacity: cap?.daily_hours_capacity || 8
                      });
                      setEditingCapacity(allocation.user);
                    }}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <Progress 
                value={Math.min(allocation.utilizationPercent, 100)} 
                className={`h-3 ${allocation.isOverallocated ? '[&>div]:bg-red-500' : ''}`}
              />
              
              {allocation.tasks.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="text-xs text-gray-500 mb-2">{allocation.tasks.length} assigned tasks:</div>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                    {allocation.tasks.map((task, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs p-2 bg-gray-50 rounded">
                        <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{task.taskText}</div>
                          <div className="truncate text-gray-400">{task.workOrderTitle}</div>
                        </div>
                        <span className="text-gray-500 flex-shrink-0">{task.hours}h</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Capacity Edit Dialog */}
      <Dialog open={!!editingCapacity} onOpenChange={() => setEditingCapacity(null)}>
        <DialogContent className="clay-card border-none max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-purple-600" />
              Edit Capacity - {editingCapacity?.full_name || editingCapacity?.email}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {capacityError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <div className="font-medium">Capacity update blocked</div>
                <div className="mt-1 text-xs">{capacityError}</div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Weekly Hours Capacity</label>
              <Input
                type="number"
                value={capacityForm.weekly_hours_capacity}
                onChange={(e) => setCapacityForm({ ...capacityForm, weekly_hours_capacity: parseInt(e.target.value) || 40 })}
                className="mt-1"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Daily Hours Capacity</label>
              <Input
                type="number"
                value={capacityForm.daily_hours_capacity}
                onChange={(e) => setCapacityForm({ ...capacityForm, daily_hours_capacity: parseInt(e.target.value) || 8 })}
                className="mt-1"
              />
            </div>
            
            <Button onClick={handleSaveCapacity} className="w-full" disabled={capacitySaving}>
              <Save className="w-4 h-4 mr-2" />
              Save Capacity
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}