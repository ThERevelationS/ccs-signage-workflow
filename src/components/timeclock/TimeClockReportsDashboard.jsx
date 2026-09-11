import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart3,
  Clock,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Download,
  Calendar,
  Briefcase,
  Home,
  Timer,
  Target,
  Loader2
} from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subMonths, parseISO, isWithinInterval, differenceInDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import * as XLSX from "xlsx";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const TimeEntry = base44.entities.TimeEntry;
const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

const COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16'];

export default function TimeClockReportsDashboard() {
  const [timeEntries, setTimeEntries] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [readError, setReadError] = useState("");
  
  // Filters
  const [dateRange, setDateRange] = useState("month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [selectedUser, setSelectedUser] = useState("all");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setReadError("");
    try {
      const [entries, orders, usersData] = await Promise.all([
        loadAllEntityRows({ entity: TimeEntry, query: { archived_test_data: { $ne: true }, archived_admin: { $ne: true } }, sort: "-clock_in", label: "Time Clock entries" }),
        loadAllEntityRows({ entity: WorkOrder, query: { deleted: false }, sort: "created_date", label: "Time Clock Work Orders" }),
        loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "Time Clock reporting authorized users" })
      ]);
      setTimeEntries(entries);
      setWorkOrders(orders);
      setUsers(usersData);
    } catch (err) {
      console.error("Error loading data:", err);
      setTimeEntries([]);
      setWorkOrders([]);
      setReadError(err?.message || "Time Clock reporting data could not be verified completely.");
    }
    setIsLoading(false);
  };

  // Calculate date range
  const getDateRange = () => {
    const now = new Date();
    if (dateRange === "custom" && customStartDate && customEndDate) {
      return {
        start: new Date(customStartDate + "T00:00:00"),
        end: new Date(customEndDate + "T23:59:59")
      };
    } else if (dateRange === "week") {
      return {
        start: startOfWeek(now, { weekStartsOn: 0 }),
        end: endOfWeek(now, { weekStartsOn: 0 })
      };
    } else if (dateRange === "month") {
      return {
        start: startOfMonth(now),
        end: endOfMonth(now)
      };
    } else if (dateRange === "quarter") {
      return {
        start: subMonths(now, 3),
        end: now
      };
    } else if (dateRange === "year") {
      return {
        start: subMonths(now, 12),
        end: now
      };
    }
    return { start: subDays(now, 30), end: now };
  };

  const { start, end } = getDateRange();

  // Filter entries
  const filteredEntries = useMemo(() => {
    return timeEntries.filter(entry => {
      if (!entry.clock_in) return false;
      const entryDate = parseISO(entry.clock_in);
      if (!isWithinInterval(entryDate, { start, end })) return false;
      if (selectedUser !== "all" && entry.user_email !== selectedUser) return false;
      return true;
    });
  }, [timeEntries, start, end, selectedUser]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalHours = filteredEntries.reduce((sum, e) => sum + (e.total_hours || 0), 0);
    const activeUsers = new Set(filteredEntries.map(e => e.user_email)).size;
    const avgHoursPerDay = filteredEntries.length > 0 
      ? totalHours / Math.max(1, differenceInDays(end, start) + 1)
      : 0;

    // Hours by employee
    const hoursByEmployee = {};
    filteredEntries.forEach(entry => {
      const name = entry.user_name || entry.user_email;
      if (!hoursByEmployee[name]) {
        hoursByEmployee[name] = { name, hours: 0, entries: 0, jobHours: 0, inhouseHours: 0 };
      }
      hoursByEmployee[name].hours += entry.total_hours || 0;
      hoursByEmployee[name].entries += 1;
      
      // Count job vs inhouse hours
      (entry.job_allocations || []).forEach(job => {
        const jobHours = job.hours || (job.minutes ? job.minutes / 60 : 0);
        if (job.is_inhouse) {
          hoursByEmployee[name].inhouseHours += jobHours;
        } else {
          hoursByEmployee[name].jobHours += jobHours;
        }
      });
    });

    // Hours by work order
    const hoursByWorkOrder = {};
    filteredEntries.forEach(entry => {
      (entry.job_allocations || []).forEach(job => {
        if (!job.is_inhouse && job.work_order_id) {
          const key = job.work_order_id;
          if (!hoursByWorkOrder[key]) {
            hoursByWorkOrder[key] = { 
              id: job.work_order_id, 
              title: job.work_order_title || 'Unknown', 
              client: job.client_name || 'Unknown',
              hours: 0 
            };
          }
          hoursByWorkOrder[key].hours += job.hours || (job.minutes ? job.minutes / 60 : 0);
        }
      });
    });

    // Inhouse task breakdown
    const inhouseTasks = {};
    filteredEntries.forEach(entry => {
      (entry.job_allocations || []).forEach(job => {
        if (job.is_inhouse && job.inhouse_task) {
          if (!inhouseTasks[job.inhouse_task]) {
            inhouseTasks[job.inhouse_task] = { name: job.inhouse_task, hours: 0 };
          }
          inhouseTasks[job.inhouse_task].hours += job.hours || (job.minutes ? job.minutes / 60 : 0);
        }
      });
    });

    // Daily hours trend
    const dailyHours = {};
    filteredEntries.forEach(entry => {
      const day = format(parseISO(entry.clock_in), "yyyy-MM-dd");
      if (!dailyHours[day]) dailyHours[day] = 0;
      dailyHours[day] += entry.total_hours || 0;
    });

    return {
      totalHours,
      activeUsers,
      avgHoursPerDay,
      totalEntries: filteredEntries.length,
      hoursByEmployee: Object.values(hoursByEmployee).sort((a, b) => b.hours - a.hours),
      hoursByWorkOrder: Object.values(hoursByWorkOrder).sort((a, b) => b.hours - a.hours).slice(0, 10),
      inhouseTasks: Object.values(inhouseTasks).sort((a, b) => b.hours - a.hours),
      dailyHours: Object.entries(dailyHours)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, hours]) => ({ date: format(new Date(date), "MMM d"), hours: parseFloat(hours.toFixed(2)) }))
    };
  }, [filteredEntries, start, end]);

  // Work order metrics
  const workOrderMetrics = useMemo(() => {
    const now = new Date();
    const overdueTasks = workOrders.filter(wo => 
      !wo.completed && wo.due_date && new Date(wo.due_date) < now
    );
    const completedInRange = workOrders.filter(wo => {
      if (!wo.completed) return false;
      const updated = wo.updated_date ? parseISO(wo.updated_date) : null;
      return updated && isWithinInterval(updated, { start, end });
    });

    // Completion rate by stage
    const stageStats = {};
    workOrders.forEach(wo => {
      if (!stageStats[wo.current_stage]) {
        stageStats[wo.current_stage] = { total: 0, completed: 0 };
      }
      stageStats[wo.current_stage].total += 1;
      if (wo.completed) stageStats[wo.current_stage].completed += 1;
    });

    // Average time per work order (from time entries)
    const woHours = {};
    filteredEntries.forEach(entry => {
      (entry.job_allocations || []).forEach(job => {
        if (!job.is_inhouse && job.work_order_id) {
          if (!woHours[job.work_order_id]) woHours[job.work_order_id] = 0;
          woHours[job.work_order_id] += job.hours || (job.minutes ? job.minutes / 60 : 0);
        }
      });
    });
    const woHoursList = Object.values(woHours);
    const avgTimePerWO = woHoursList.length > 0 
      ? woHoursList.reduce((a, b) => a + b, 0) / woHoursList.length 
      : 0;

    return {
      overdueTasks: overdueTasks.length,
      completedInRange: completedInRange.length,
      avgTimePerWO,
      stageStats
    };
  }, [workOrders, filteredEntries, start, end]);

  const exportReport = () => {
    const summaryData = metrics.hoursByEmployee.map(emp => ({
      "Employee": emp.name,
      "Total Hours": emp.hours.toFixed(2),
      "Time Entries": emp.entries,
      "Job Hours": emp.jobHours.toFixed(2),
      "Inhouse Hours": emp.inhouseHours.toFixed(2),
      "Avg Hours/Entry": emp.entries > 0 ? (emp.hours / emp.entries).toFixed(2) : "0.00"
    }));

    const wb = XLSX.utils.book_new();
    
    // Summary sheet
    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, "Employee Summary");

    // Work order hours sheet
    const woData = metrics.hoursByWorkOrder.map(wo => ({
      "Work Order": wo.title,
      "Client": wo.client,
      "Hours": wo.hours.toFixed(2)
    }));
    const ws2 = XLSX.utils.json_to_sheet(woData);
    XLSX.utils.book_append_sheet(wb, ws2, "Work Order Hours");

    // Inhouse tasks sheet
    const taskData = metrics.inhouseTasks.map(t => ({
      "Task": t.name,
      "Hours": t.hours.toFixed(2)
    }));
    const ws3 = XLSX.utils.json_to_sheet(taskData);
    XLSX.utils.book_append_sheet(wb, ws3, "Inhouse Tasks");

    XLSX.writeFile(wb, `time_clock_report_${format(start, "yyyy-MM-dd")}_to_${format(end, "yyyy-MM-dd")}.xlsx`);
  };

  const uniqueUsers = [...new Set(timeEntries.map(e => e.user_email))].map(email => {
    const entry = timeEntries.find(e => e.user_email === email);
    return { email, name: entry?.user_name || email };
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (readError) {
    return (
      <div className="p-6 text-center">
        <div className="text-sm font-bold text-red-700">Time Clock reporting data could not be verified.</div>
        <div className="mt-1 text-xs text-red-600">{readError}</div>
        <Button variant="outline" size="sm" className="mt-3" onClick={loadData}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-purple-600" />
          <h2 className="font-semibold text-lg">Reports Dashboard</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {uniqueUsers.map(u => (
                <SelectItem key={u.email} value={u.email}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">Last 3 Months</SelectItem>
              <SelectItem value="year">Last Year</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {dateRange === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-36"
              />
              <span className="text-gray-400">to</span>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-36"
              />
            </div>
          )}

          <Button onClick={exportReport} variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Date Range Display */}
      <div className="text-sm text-gray-500 flex items-center gap-2">
        <Calendar className="w-4 h-4" />
        Showing data from {format(start, "MMM d, yyyy")} to {format(end, "MMM d, yyyy")}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="clay-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-purple-600" />
            <span className="text-xs text-gray-500">Total Hours</span>
          </div>
          <p className="text-2xl font-bold text-purple-600">{metrics.totalHours.toFixed(1)}</p>
        </div>

        <div className="clay-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-blue-600" />
            <span className="text-xs text-gray-500">Active Users</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">{metrics.activeUsers}</p>
        </div>

        <div className="clay-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <span className="text-xs text-gray-500">Avg Hrs/Day</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{metrics.avgHoursPerDay.toFixed(1)}</p>
        </div>

        <div className="clay-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Timer className="w-4 h-4 text-orange-600" />
            <span className="text-xs text-gray-500">Avg Time/WO</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">{workOrderMetrics.avgTimePerWO.toFixed(1)}h</p>
        </div>

        <div className="clay-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-xs text-gray-500">Overdue Tasks</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{workOrderMetrics.overdueTasks}</p>
        </div>

        <div className="clay-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
            <span className="text-xs text-gray-500">Completed</span>
          </div>
          <p className="text-2xl font-bold text-teal-600">{workOrderMetrics.completedInRange}</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hours by Employee */}
        <div className="clay-card p-4">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-600" />
            Hours by Employee
          </h3>
          {metrics.hoursByEmployee.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={metrics.hoursByEmployee.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val) => `${val.toFixed(2)} hrs`} />
                <Bar dataKey="hours" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-8">No data available</p>
          )}
        </div>

        {/* Daily Hours Trend */}
        <div className="clay-card p-4">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            Daily Hours Trend
          </h3>
          {metrics.dailyHours.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={metrics.dailyHours}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip formatter={(val) => `${val} hrs`} />
                <Line type="monotone" dataKey="hours" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-8">No data available</p>
          )}
        </div>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Work Orders */}
        <div className="clay-card p-4">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-orange-600" />
            Top Work Orders by Hours
          </h3>
          {metrics.hoursByWorkOrder.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {metrics.hoursByWorkOrder.map((wo, i) => (
                <div key={wo.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{wo.title}</p>
                    <p className="text-xs text-gray-500 truncate">{wo.client}</p>
                  </div>
                  <Badge className="ml-2 bg-orange-100 text-orange-700">
                    {wo.hours.toFixed(1)}h
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">No work order data</p>
          )}
        </div>

        {/* Inhouse Tasks Breakdown */}
        <div className="clay-card p-4">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Home className="w-4 h-4 text-amber-600" />
            Inhouse Tasks
          </h3>
          {metrics.inhouseTasks.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={metrics.inhouseTasks}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="hours"
                  nameKey="name"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {metrics.inhouseTasks.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val) => `${val.toFixed(2)} hrs`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-8">No inhouse tasks</p>
          )}
        </div>

        {/* Employee Details */}
        <div className="clay-card p-4">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-green-600" />
            Employee Breakdown
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {metrics.hoursByEmployee.slice(0, 6).map((emp, i) => (
              <div key={emp.name} className="p-2 bg-gray-50 rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{emp.name}</span>
                  <span className="text-sm font-bold text-purple-600">{emp.hours.toFixed(1)}h</span>
                </div>
                <div className="flex gap-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    {emp.jobHours.toFixed(1)}h jobs
                  </span>
                  <span className="flex items-center gap-1">
                    <Home className="w-3 h-3" />
                    {emp.inhouseHours.toFixed(1)}h inhouse
                  </span>
                </div>
                <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 rounded-full"
                    style={{ width: `${(emp.jobHours / (emp.jobHours + emp.inhouseHours || 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}