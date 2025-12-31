import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Filter, Search, Download, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import FinancialsSpreadsheet from "@/components/financials/FinancialsSpreadsheet";
import CustomFilterDialog from "@/components/sales/CustomFilterDialog";

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
  const spreadsheetRef = useRef(null);

  useEffect(() => {
    loadActiveFilters();
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('financials_start_month', startMonth.toISOString());
  }, [startMonth]);

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

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="w-full max-w-[98%] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="clay-card p-3">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Financials</h1>
              <p className="text-gray-600 text-sm">Track revenue by month and project install dates</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Month Navigation */}
            <div className="flex items-center gap-1 mr-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigateMonths(-1)}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-sm font-medium px-2 min-w-[180px] text-center">
                {getMonthLabel(0)} - {getMonthLabel(3)}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigateMonths(1)}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-64"
              />
            </div>

            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-500 mb-1">Information Filters</span>
              <Select value={filterStatus} onValueChange={(value) => {
                if (value === "manage_filters") {
                  setShowCustomFilterDialog(true);
                } else {
                  setFilterStatus(value);
                }
              }}>
                <SelectTrigger className="w-48">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Select filter" />
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
                  <div className="h-px bg-gray-800 my-2 mx-2"></div>
                  <SelectItem value="manage_filters">
                    <div className="flex items-center gap-2 font-bold">
                      <Settings className="w-4 h-4" />
                      Manage Custom Information Filters
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

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
                <SelectTrigger className="w-48">
                  <Settings className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Column Filters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Default View</SelectItem>
                  {activeFilters.filter(f => f.type === "column_preset").map(preset => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                  <div className="h-px bg-gray-800 my-2 mx-2"></div>
                  <SelectItem value="manage_columns">
                    <div className="flex items-center gap-2 font-bold">
                      <Settings className="w-4 h-4" />
                      Manage Custom Column Filters
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={() => spreadsheetRef.current?.exportToExcel()}
              size="sm" 
              className="h-8 px-2"
              variant="ghost"
            >
              <Download className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="clay-card p-4">
          <FinancialsSpreadsheet 
            ref={spreadsheetRef}
            searchTerm={searchTerm} 
            filterStatus={filterStatus}
            activeColumnPreset={activeColumnPreset}
            customFilters={activeFilters.filter(f => f.type === "filter")}
            startMonth={startMonth}
          />
        </div>
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