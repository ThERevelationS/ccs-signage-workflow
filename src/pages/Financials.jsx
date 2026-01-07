import React, { useState, useRef, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DollarSign, Filter, Search, Download, Settings, ChevronLeft, ChevronRight, Calendar as CalendarIcon, BarChart3, Table, X } from "lucide-react";
import { format } from "date-fns";
import FinancialsSpreadsheet from "@/components/financials/FinancialsSpreadsheet";
import FinancialsDashboard from "@/components/financials/FinancialsDashboard";
import SalesPipelineDashboard from "@/components/financials/SalesPipelineDashboard";
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
  
  const spreadsheetRef = useRef(null);

  useEffect(() => {
    loadActiveFilters();
    loadData();
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('financials_start_month', startMonth.toISOString());
  }, [startMonth]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [orders, usersData] = await Promise.all([
        WorkOrder.filter({ is_rider: false, completed: false, deleted: { $ne: true } }),
        AuthorizedEmail.list()
      ]);
      setWorkOrders(orders);
      setUsers(usersData);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  const loadActiveFilters = async () => {
    const SalesFilter = base44.entities.SalesFilter;
    const allFilters = await SalesFilter.list();
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
        ) : activeTab === "dashboard" ? (
          <FinancialsDashboard 
            workOrders={filteredWorkOrders}
            dateRange={{ start: dateRangeStart, end: dateRangeEnd }}
            reportPeriod={reportPeriod}
          />
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