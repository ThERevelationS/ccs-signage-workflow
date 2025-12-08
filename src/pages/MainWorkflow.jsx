import React, { useState, useEffect } from "react";
import { WorkOrder } from "@/entities/WorkOrder";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Maximize2, Minimize2, RefreshCw, ArrowUpDown, Search, Filter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import GanttChart from "../components/workflow/GanttChart";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";

const stageOrder = ['estimating', 'sales', 'permitting', 'design', 'production', 'fabrication', 'installation'];

export default function MainWorkflow() {
  const [workOrders, setWorkOrders] = useState([]);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState("due_date");
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStages, setFilterStages] = useState([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadWorkOrders(true);
    const interval = setInterval(() => loadWorkOrders(false), 3000);
    
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const loadWorkOrders = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    const allWorkOrders = await WorkOrder.filter({ completed: false }, "-priority");
    const withDates = allWorkOrders.filter(wo => wo.start_date && wo.due_date);
    
    // Separate parent work orders and riders
    // A work order is considered a rider if its `is_rider` property is true.
    // Otherwise, it's considered a parent.
    const parents = withDates.filter(wo => !wo.is_rider);
    const riders = withDates.filter(wo => wo.is_rider);
    
    // Attach riders to their parent work orders
    const groupedWorkOrders = parents.map(parent => ({
      ...parent,
      riders: riders.filter(rider => rider.parent_work_order_id === parent.id)
    }));
    
    setWorkOrders(groupedWorkOrders);
    if (showLoading) setIsLoading(false);
  };

  const getFilteredAndSortedWorkOrders = () => {
    let filtered = [...workOrders];

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(wo => {
        const searchable = [
          wo.title,
          wo.client_name,
          wo.description,
          wo.assigned_to
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(search);
      });
    }

    // Stage filter
    if (filterStages.length > 0) {
      filtered = filtered.filter(wo => filterStages.includes(wo.current_stage));
    }

    // Date range filter
    if (dateFrom) {
      filtered = filtered.filter(wo => wo.start_date && new Date(wo.start_date) >= new Date(dateFrom));
    }
    if (dateTo) {
      filtered = filtered.filter(wo => wo.due_date && new Date(wo.due_date) <= new Date(dateTo));
    }

    // Sort
    switch (sortBy) {
      case "name":
        filtered.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        break;
      case "due_date":
        filtered.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
        break;
      case "stage":
        filtered.sort((a, b) => stageOrder.indexOf(a.current_stage) - stageOrder.indexOf(b.current_stage));
        break;
      default:
        break;
    }
    return filtered;
  };

  const toggleStageFilter = (stage) => {
    setFilterStages(prev => 
      prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage]
    );
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterStages([]);
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = searchTerm || filterStages.length > 0 || dateFrom || dateTo;

  const toggleFullScreen = () => {
    if (!isFullScreen) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    setIsFullScreen(!isFullScreen);
  };

  return (
    <div className="min-h-screen p-4">
      {isFullScreen && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-sm z-50 pointer-events-none">
          To exit press ESC
        </div>
      )}
      <div className="w-full max-w-[95vw] mx-auto">
        <div className="flex justify-between items-center gap-2 mb-2">
          {/* Left side - Sort and actions */}
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 text-gray-500" />
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-28 h-8 clay-button border-none text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="clay-card border-none">
                  <SelectItem value="due_date">Due Date</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="stage">Stage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={loadWorkOrders}
              size="sm"
              className="clay-button border-none text-gray-800 h-8 px-3"
              style={{ background: 'linear-gradient(135deg, #D4E9F7 0%, rgba(255,255,255,0.9) 100%)' }}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              <span className="text-sm">Refresh</span>
            </Button>
            <Button
              onClick={toggleFullScreen}
              size="sm"
              className="clay-button border-none text-gray-800 h-8 px-3"
              style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, rgba(255,255,255,0.9) 100%)' }}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>

          {/* Right side - Search and filters */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search work orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-7 pr-2 w-56 text-xs"
              />
            </div>
            
            <Popover open={showFilters} onOpenChange={setShowFilters}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  className={`clay-button border-none h-8 px-3 ${hasActiveFilters ? 'text-purple-700' : 'text-gray-800'}`}
                  style={{ background: hasActiveFilters ? 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' : 'linear-gradient(135deg, #F5F3FF 0%, rgba(255,255,255,0.9) 100%)' }}
                >
                  <Filter className="w-4 h-4 mr-1" />
                  <span className="text-sm">Filters</span>
                  {hasActiveFilters && (
                    <span className="ml-1 bg-purple-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                      {(filterStages.length > 0 ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="clay-card border-none w-80">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Filters</h3>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="h-6 px-2 text-xs"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Clear All
                      </Button>
                    )}
                  </div>

                  {/* Stage filters */}
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-2 block">Stages</label>
                    <div className="flex flex-wrap gap-2">
                      {stageOrder.map(stage => (
                        <button
                          key={stage}
                          onClick={() => toggleStageFilter(stage)}
                          className={`px-2 py-1 text-xs rounded-lg transition-all ${
                            filterStages.includes(stage)
                              ? 'bg-purple-100 text-purple-700 font-medium'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {stage.charAt(0).toUpperCase() + stage.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Date range */}
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-2 block">Date Range</label>
                    <div className="space-y-2">
                      <Input
                        type="date"
                        placeholder="From"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Input
                        type="date"
                        placeholder="To"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="clay-card p-4">
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Loading timeline...</p>
            </div>
          ) : workOrders.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No work orders with dates available</p>
              <p className="text-gray-400 text-sm mt-2">Add start and due dates to work orders to see them here</p>
            </div>
          ) : (
            <GanttChart workOrders={getFilteredAndSortedWorkOrders()} onWorkOrderClick={setSelectedWorkOrder} />
          )}
        </div>
      </div>

      {selectedWorkOrder && (
        <WorkOrderDetailsDialog
          isOpen={true}
          onClose={() => setSelectedWorkOrder(null)}
          workOrder={selectedWorkOrder}
          onUpdate={() => loadWorkOrders(false)}
        />
      )}
    </div>
  );
}