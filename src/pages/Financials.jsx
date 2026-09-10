import { useState, useRef, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Filter, Search, Download, Settings, ChevronLeft, ChevronRight, Calendar as CalendarIcon, BarChart3, Table, X, Maximize2, Minimize2, TrendingUp, Trophy, FileText, Clock, CheckCircle2, Users, Activity } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format as dateFnsFormat } from "date-fns";
import { format } from "date-fns";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

// Workflow reporting constants
const STAGES = ["estimating", "sales", "permitting", "design", "production", "fabrication", "installation"];
const STAGE_LABEL = {
  estimating: "Estimating", sales: "Sales", permitting: "Permitting",
  design: "Design", production: "Production", fabrication: "Fabrication",
  installation: "Installation", completed: "Completed"
};
const CHART_COLORS = ["#8B5CF6","#3B82F6","#10B981","#F59E0B","#EF4444","#EC4899","#6366F1","#14B8A6"];
const STAGE_COLORS = {
  estimating: "#FFF9C4", sales: "#B2DFDB", permitting: "#FFE4D6",
  design: "#D4E9F7", production: "#C8F4E9", fabrication: "#FFD6E8",
  installation: "#E0D4F7", completed: "#A5D6A7"
};

function WorkflowReportingTab() {
  const [allWorkOrders, setAllWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setReadError("");
    loadAllEntityRows({
      entity: base44.entities.WorkOrder,
      query: { deleted: false },
      sort: "created_date",
      label: "Workflow reporting Work Orders",
    }).then((wos) => {
      if (!active) return;
      setAllWorkOrders(wos || []);
    }).catch((error) => {
      if (!active) return;
      setAllWorkOrders([]);
      setReadError(error?.message || "Workflow reporting Work Orders could not be verified completely.");
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const active = allWorkOrders.filter(wo => !wo.completed && !wo.deleted);
  const completed = allWorkOrders.filter(wo => wo.completed && !wo.deleted);
  const completionRate = allWorkOrders.length > 0
    ? Math.round((completed.length / allWorkOrders.length) * 100) : 0;
  const asapCount = active.filter(wo => wo.asap).length;
  const today = new Date();
  const overdueCount = active.filter(wo => wo.due_date && new Date(wo.due_date) < today).length;

  const stageData = STAGES.map(stage => ({
    name: STAGE_LABEL[stage],
    count: active.filter(wo => wo.current_stage === stage).length,
  })).filter(d => d.count > 0);

  const completionPie = [
    { name: "Active", value: active.length, fill: "#8B5CF6" },
    { name: "Completed", value: completed.length, fill: "#10B981" }
  ];

  const next30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return dateFnsFormat(d, "MMM d");
  });
  const timelineData = next30.map(label => ({
    date: label,
    count: active.filter(wo => wo.due_date && dateFnsFormat(new Date(wo.due_date), "MMM d") === label).length
  })).filter(d => d.count > 0);

  const assigneeCounts = {};
  active.forEach(wo => {
    const name = wo.assigned_to || "Unassigned";
    assigneeCounts[name] = (assigneeCounts[name] || 0) + 1;
  });
  const resourceData = Object.entries(assigneeCounts)
    .map(([name, count]) => ({ name: name.split(" ")[0] || name, count }))
    .sort((a, b) => b.count - a.count).slice(0, 10);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (readError) return <div className="clay-card p-6 text-center"><div className="text-sm font-bold text-red-700">Workflow reporting data could not be verified.</div><div className="mt-1 text-xs text-red-600">{readError}</div></div>;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Active Work Orders", value: active.length, icon: Clock, color: "#8B5CF6", bg: "#EDE9FE" },
          { label: "Completed", value: completed.length, icon: CheckCircle2, color: "#10B981", bg: "#D1FAE5" },
          { label: "Completion Rate", value: `${completionRate}%`, icon: TrendingUp, color: "#3B82F6", bg: "#DBEAFE" },
          { label: "ASAP / Overdue", value: `${asapCount} / ${overdueCount}`, icon: Users, color: "#EF4444", bg: "#FEE2E2" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="clay-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="clay-card p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Stage Distribution</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stageData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Work Orders">
                {stageData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="clay-card p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Work Order Status</h2>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="60%" height={220}>
              <PieChart>
                <Pie data={completionPie} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3}>
                  {completionPie.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {completionPie.map(entry => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: entry.fill }} />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{entry.value}</p>
                    <p className="text-xs text-gray-500">{entry.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="clay-card p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Due Dates — Next 30 Days</h2>
          {timelineData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No due dates in the next 30 days</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={timelineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Due" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="clay-card p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Resource Allocation (Active WOs)</h2>
          {resourceData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={resourceData} layout="vertical" margin={{ top: 4, right: 16, left: 16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={70} />
                <Tooltip />
                <Bar dataKey="count" fill="#10B981" radius={[0, 4, 4, 0]} name="Work Orders">
                  {resourceData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
import FinancialsSpreadsheet from "@/components/financials/FinancialsSpreadsheet";
import FinancialsDashboard from "@/components/financials/FinancialsDashboard";
import SalesPipelineDashboard from "@/components/financials/SalesPipelineDashboard";
import SalesFunnelChart from "@/components/financials/SalesFunnelChart";
import TeamLeaderboard from "@/components/financials/TeamLeaderboard";
import PerformanceSummaryReport from "@/components/financials/PerformanceSummaryReport";
import CustomFilterDialog from "@/components/sales/CustomFilterDialog";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

export default function Financials() {
  const { isRegistered, currentUser } = useAuth();
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showCustomFilterDialog, setShowCustomFilterDialog] = useState(false);
  const [showColumnFilterDialog, setShowColumnFilterDialog] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const [activeColumnPreset, setActiveColumnPreset] = useState(null);
  const [startMonth, setStartMonth] = useState(() => {
    const saved = localStorage.getItem('financials_start_month');
    if (saved) return new Date(saved);
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [activeTab, setActiveTab] = useState("spreadsheet");
  const [reportPeriod, setReportPeriod] = useState("monthly");
  const [monthCount, setMonthCount] = useState(4);
  
  // Advanced filters
  const [dateRangeStart, setDateRangeStart] = useState(null);
  const [dateRangeEnd, setDateRangeEnd] = useState(null);
  const [filterPM, setFilterPM] = useState("all");
  const [filterEstimator, setFilterEstimator] = useState("all");
  
  // Data
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dataReadError, setDataReadError] = useState("");
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  const spreadsheetRef = useRef(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    loadActiveFilters();
    loadData();
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('financials_start_month', startMonth.toISOString());
  }, [startMonth]);

  const loadData = async () => {
    setIsLoading(true);
    setDataReadError("");
    try {
      const [orders, usersData] = await Promise.all([
        loadAllEntityRows({
          entity: WorkOrder,
          query: { is_rider: false, completed: false, deleted: { $ne: true } },
          sort: "created_date",
          label: "Financial Work Orders",
        }),
        loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "Financials authorized users" })
      ]);
      setWorkOrders(orders);
      setUsers(usersData);
    } catch (error) {
      console.error("Error loading data:", error);
      setWorkOrders([]);
      setDataReadError(error?.message || "Financial Work Orders could not be verified completely.");
    }
    setIsLoading(false);
  };

  const loadActiveFilters = async () => {
    const SalesFilter = base44.entities.SalesFilter;
    const allFilters = await loadAllEntityRows({ entity: SalesFilter, sort: null, label: "Financials saved filters" });
    const userEmail = currentUser?.email || "";
    const selected = allFilters.filter(f => f.selected_by?.includes(userEmail));
    setActiveFilters(selected);
    
    const columnPreset = selected.find(f => f.type === "column_preset");
    setActiveColumnPreset(columnPreset || null);
  };

  const isStandardFilterEnabled = (value) => {
    const key = `sales_standard_${value}_selected`;
    return localStorage.getItem(key) === "true";
  };

  const navigateMonths = (direction) => {
    setStartMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + direction);
      return newDate;
    });
  };

  const getMonthLabel = (offset) => {
    const date = new Date(startMonth);
    date.setMonth(date.getMonth() + offset);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  // Get unique estimators for filter
  const estimators = useMemo(() => {
    return users.filter(u => u.sales_roles?.includes("Estimator"));
  }, [users]);

  // Get PMs with sales roles
  const projectManagers = useMemo(() => {
    return users.filter(u => u.sales_roles?.includes("PM"));
  }, [users]);

  // Apply all filters to work orders
  const filteredWorkOrders = useMemo(() => {
    return workOrders.filter(wo => {
      // Status filter
      if (filterStatus !== "all" && !filterStatus.startsWith("custom_")) {
        if (wo.sales_status !== filterStatus) return false;
      }
      
      if (filterStatus.startsWith("custom_")) {
        const filterId = filterStatus.replace("custom_", "");
        const customFilter = activeFilters.find(f => f.id === filterId);
        if (customFilter) {
          const passesFilter = customFilter.conditions?.every(condition => {
            const fieldValue = wo[condition.field];
            const condValue = condition.value;
            switch (condition.operator) {
              case "equals": return fieldValue == condValue;
              case "contains": return fieldValue?.toString().toLowerCase().includes(condValue.toLowerCase());
              case "greater_than": return parseFloat(fieldValue) > parseFloat(condValue);
              case "less_than": return parseFloat(fieldValue) < parseFloat(condValue);
              case "not_empty": return fieldValue != null && fieldValue !== "";
              case "empty": return fieldValue == null || fieldValue === "";
              default: return true;
            }
          });
          if (!passesFilter) return false;
        }
      }
      
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const searchable = [wo.title, wo.client_name, wo.contact_name, wo.sales_rep].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(search)) return false;
      }
      
      // Project Manager filter
      if (filterPM !== "all" && wo.project_manager !== filterPM) return false;
      
      // Estimator filter
      if (filterEstimator !== "all" && wo.estimator !== filterEstimator) return false;
      
      return true;
    });
  }, [workOrders, filterStatus, searchTerm, filterPM, filterEstimator, activeFilters]);

  const clearFilters = () => {
    setDateRangeStart(null);
    setDateRangeEnd(null);
    setFilterPM("all");
    setFilterEstimator("all");
    setSearchTerm("");
    setFilterStatus("all");
  };

  const hasActiveFilters = dateRangeStart || dateRangeEnd || filterPM !== "all" || filterEstimator !== "all" || searchTerm || filterStatus !== "all";

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="w-full max-w-[98%] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="clay-card p-3">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Financials</h1>
              <p className="text-gray-600 text-sm">Track revenue by install date and generate reports</p>
            </div>
          </div>

          {/* View Toggle */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="spreadsheet" className="gap-2">
                <Table className="w-4 h-4" />
                Spreadsheet
              </TabsTrigger>
              <TabsTrigger value="dashboard" className="gap-2">
                <BarChart3 className="w-4 h-4" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="sales" className="gap-2">
                <DollarSign className="w-4 h-4" />
                Sales Pipeline
              </TabsTrigger>
              <TabsTrigger value="funnel" className="gap-2">
                <TrendingUp className="w-4 h-4" />
                Funnel
              </TabsTrigger>
              <TabsTrigger value="team" className="gap-2">
                <Trophy className="w-4 h-4" />
                Team
              </TabsTrigger>
              <TabsTrigger value="reports" className="gap-2">
                <FileText className="w-4 h-4" />
                Reports
              </TabsTrigger>
              <TabsTrigger value="workflow" className="gap-2">
                <Activity className="w-4 h-4" />
                Workflow
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Filters Row */}
        <div className="clay-card p-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Date Range Section */}
            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-500 mb-1">Date Range</span>
              <div className="flex items-center gap-1">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigateMonths(-1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-2 min-w-[140px]">
                      <CalendarIcon className="w-3 h-3" />
                      {format(startMonth, "MMM yy")} - {format(new Date(startMonth.getFullYear(), startMonth.getMonth() + monthCount - 1), "MMM yy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3">
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-gray-500">Start Month</label>
                        <Input
                          type="month"
                          value={format(startMonth, "yyyy-MM")}
                          onChange={(e) => {
                            if (e.target.value) {
                              const [year, month] = e.target.value.split('-').map(Number);
                              setStartMonth(new Date(year, month - 1, 1));
                            }
                          }}
                          className="h-8 mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500">End Month</label>
                        <Input
                          type="month"
                          value={format(new Date(startMonth.getFullYear(), startMonth.getMonth() + monthCount - 1), "yyyy-MM")}
                          onChange={(e) => {
                            if (e.target.value) {
                              const [year, month] = e.target.value.split('-').map(Number);
                              const endDate = new Date(year, month - 1, 1);
                              const months = (endDate.getFullYear() - startMonth.getFullYear()) * 12 + (endDate.getMonth() - startMonth.getMonth()) + 1;
                              setMonthCount(Math.max(1, Math.min(24, months)));
                            }
                          }}
                          className="h-8 mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500"># of Months: {monthCount}</label>
                        <Input
                          type="range"
                          min="1"
                          max="24"
                          value={monthCount}
                          onChange={(e) => setMonthCount(parseInt(e.target.value))}
                          className="h-8 mt-1"
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigateMonths(1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                {activeTab === "dashboard" && (
                  <Select value={reportPeriod} onValueChange={setReportPeriod}>
                    <SelectTrigger className="w-28 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="h-10 w-px bg-gray-300" />

            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-48 h-8"
              />
            </div>

            {/* Project Manager Filter */}
            <Select value={filterPM} onValueChange={setFilterPM}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue placeholder="All PMs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Project Managers</SelectItem>
                {projectManagers.map(pm => (
                  <SelectItem key={pm.email} value={pm.full_name}>{pm.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Estimator Filter */}
            <Select value={filterEstimator} onValueChange={setFilterEstimator}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue placeholder="Estimates Entered By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Estimators</SelectItem>
                {estimators.map(est => (
                  <SelectItem key={est.email} value={est.full_name}>{est.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Information Filters */}
            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-500 mb-1">Information Filters</span>
              <Select value={filterStatus} onValueChange={(value) => {
                if (value === "manage_filters") {
                  setShowCustomFilterDialog(true);
                } else {
                  setFilterStatus(value);
                }
              }}>
                <SelectTrigger className="w-40 h-8">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  {isStandardFilterEnabled("all") && <SelectItem value="all">All Leads</SelectItem>}
                  {isStandardFilterEnabled("lead") && <SelectItem value="lead">Lead</SelectItem>}
                  {isStandardFilterEnabled("quoted") && <SelectItem value="quoted">Quoted</SelectItem>}
                  {isStandardFilterEnabled("follow_up") && <SelectItem value="follow_up">Follow Up</SelectItem>}
                  {isStandardFilterEnabled("won") && <SelectItem value="won">Won</SelectItem>}
                  {isStandardFilterEnabled("lost") && <SelectItem value="lost">Lost</SelectItem>}
                  {isStandardFilterEnabled("on_hold") && <SelectItem value="on_hold">On Hold</SelectItem>}
                  {activeFilters.filter(f => f.type === "filter").map(filter => (
                    <SelectItem key={filter.id} value={`custom_${filter.id}`}>
                      {filter.name}
                    </SelectItem>
                  ))}
                  <div className="h-px bg-gray-300 my-1" />
                  <SelectItem value="manage_filters">
                    <div className="flex items-center gap-2">
                      <Settings className="w-3 h-3" />
                      Manage Filters
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Column Filters (Spreadsheet only) */}
            {activeTab === "spreadsheet" && (
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-500 mb-1">Column Filters</span>
                <Select 
                  value={activeColumnPreset?.id || ""} 
                  onValueChange={(value) => {
                    if (value === "manage_columns") {
                      setShowColumnFilterDialog(true);
                    } else if (value) {
                      const preset = activeFilters.find(f => f.id === value);
                      setActiveColumnPreset(preset || null);
                    } else {
                      setActiveColumnPreset(null);
                    }
                  }}
                >
                  <SelectTrigger className="w-40 h-8">
                    <Settings className="w-3 h-3 mr-1" />
                    <SelectValue placeholder="Columns" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Default Columns</SelectItem>
                    {activeFilters.filter(f => f.type === "column_preset").map(preset => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name}
                      </SelectItem>
                    ))}
                    <div className="h-px bg-gray-300 my-1" />
                    <SelectItem value="manage_columns">
                      <div className="flex items-center gap-2">
                        <Settings className="w-3 h-3" />
                        Manage Columns
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-red-600">
                <X className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}

            <div className="flex-1" />

            {/* Export */}
            <Button 
              onClick={() => spreadsheetRef.current?.exportToExcel()}
              size="sm" 
              className="h-8 gap-2"
              variant="outline"
            >
              <Download className="w-3 h-3" />
              Export
            </Button>

            <Button
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen();
                } else {
                  document.exitFullscreen();
                }
              }}
              size="sm"
              className="clay-button border-none text-gray-800 h-8 px-3"
              style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, rgba(255,255,255,0.9) 100%)' }}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Content */}
        {activeTab === "spreadsheet" ? (
          <div className="clay-card p-4">
            <FinancialsSpreadsheet 
              ref={spreadsheetRef}
              searchTerm={searchTerm} 
              filterStatus={filterStatus}
              activeColumnPreset={activeColumnPreset}
              customFilters={activeFilters.filter(f => f.type === "filter")}
              startMonth={startMonth}
              monthCount={monthCount}
              filterPM={filterPM}
              filterEstimator={filterEstimator}
            />
          </div>
        ) : activeTab === "workflow" ? (
          <WorkflowReportingTab />
        ) : isLoading ? (
          <div className="clay-card p-8 text-center text-sm text-gray-500">Loading verified financial data…</div>
        ) : dataReadError ? (
          <div className="clay-card p-6 text-center">
            <div className="text-sm font-bold text-red-700">Financial data could not be verified.</div>
            <div className="mt-1 text-xs text-red-600">{dataReadError}</div>
            <Button variant="outline" size="sm" className="mt-3" onClick={loadData}>Retry</Button>
          </div>
        ) : activeTab === "dashboard" ? (
          <FinancialsDashboard 
            workOrders={filteredWorkOrders}
            dateRange={{ start: dateRangeStart, end: dateRangeEnd }}
            reportPeriod={reportPeriod}
          />
        ) : activeTab === "funnel" ? (
          <div className="clay-card p-4">
            <SalesFunnelChart workOrders={filteredWorkOrders} />
          </div>
        ) : activeTab === "team" ? (
          <div className="clay-card p-4">
            <TeamLeaderboard workOrders={filteredWorkOrders} users={users} />
          </div>
        ) : activeTab === "reports" ? (
          <div className="clay-card p-4">
            <PerformanceSummaryReport workOrders={filteredWorkOrders} />
          </div>
        ) : (
          <SalesPipelineDashboard workOrders={filteredWorkOrders} />
        )}
      </div>

      {showCustomFilterDialog && (
        <CustomFilterDialog
          isOpen={showCustomFilterDialog}
          mode="filters"
          onClose={() => {
            setShowCustomFilterDialog(false);
            loadActiveFilters();
          }}
        />
      )}

      {showColumnFilterDialog && (
        <CustomFilterDialog
          isOpen={showColumnFilterDialog}
          mode="columns"
          onClose={() => {
            setShowColumnFilterDialog(false);
            loadActiveFilters();
          }}
        />
      )}
    </div>
  );
}