import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { Search, Filter, X, Loader2 } from "lucide-react";
import WorkOrderDetailsDialog from "./WorkOrderDetailsDialog";

const WorkOrder = base44.entities.WorkOrder;

const stageOrder = ['estimating', 'sales', 'permitting', 'design', 'production', 'fabrication', 'installation'];

const stageColors = {
  estimating: "#FFF9C4",
  sales: "#B2DFDB",
  permitting: "#FFE4D6",
  design: "#D4E9F7",
  production: "#C8F4E9",
  fabrication: "#FFD6E8",
  installation: "#E0D4F7"
};

const stageNames = {
  estimating: "Estimating",
  sales: "Sales",
  permitting: "Permitting",
  design: "Design",
  production: "Production",
  fabrication: "Fabrication",
  installation: "Installation"
};

export default function GlobalSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  
  const [filterStages, setFilterStages] = useState([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (searchTerm.length >= 2) {
      performSearch();
    } else {
      setResults([]);
      setShowResults(false);
    }
  }, [searchTerm, filterStages, dateFrom, dateTo]);

  const performSearch = async () => {
    setIsSearching(true);
    try {
      const allWorkOrders = await WorkOrder.filter({ completed: false });
      
      let filtered = allWorkOrders;

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

      setResults(filtered.slice(0, 50)); // Limit to 50 results
      setShowResults(true);
    } catch (error) {
      console.error("Search error:", error);
    }
    setIsSearching(false);
  };

  const toggleStageFilter = (stage) => {
    setFilterStages(prev => 
      prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage]
    );
  };

  const clearFilters = () => {
    setFilterStages([]);
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = filterStages.length > 0 || dateFrom || dateTo;

  const handleWorkOrderClick = (workOrder) => {
    setSelectedWorkOrder(workOrder);
    setShowResults(false);
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search work orders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => searchTerm.length >= 2 && setShowResults(true)}
            className="h-7 pl-7 pr-2 w-56 text-xs"
          />
          {isSearching && (
            <Loader2 className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
          )}
        </div>
        
        <Popover open={showFilters} onOpenChange={setShowFilters}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              className={`clay-button border-none h-7 px-3 w-56 ${hasActiveFilters ? 'text-purple-700' : 'text-gray-800'}`}
              style={{ background: hasActiveFilters ? 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' : 'linear-gradient(135deg, #F5F3FF 0%, rgba(255,255,255,0.9) 100%)' }}
            >
              <Filter className="w-3 h-3 mr-1" />
              <span className="text-xs">Filters</span>
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
                      {stageNames[stage]}
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

      {/* Search Results Dialog */}
      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="clay-card border-none max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                <span>Search Results</span>
                <span className="text-sm text-gray-500 font-normal">
                  ({results.length} {results.length === 1 ? 'result' : 'results'})
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResults(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto max-h-[60vh] space-y-2">
            {results.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No work orders found</p>
                <p className="text-sm mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              results.map(wo => (
                <div
                  key={wo.id}
                  onClick={() => handleWorkOrderClick(wo)}
                  className="p-3 rounded-lg clay-card cursor-pointer hover:opacity-80 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-sm text-gray-800 truncate">
                          {wo.title}
                        </h4>
                        {wo.is_rider && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium border border-dashed border-purple-300">
                            Rider
                          </span>
                        )}
                        {wo.asap && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                            ASAP
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mb-2">{wo.client_name}</p>
                      {wo.description && (
                        <p className="text-xs text-gray-500 truncate">{wo.description}</p>
                      )}
                      {wo.assigned_to && (
                        <p className="text-xs text-gray-500 mt-1">Assigned: {wo.assigned_to}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div
                        className="px-2 py-1 rounded-lg text-xs font-medium"
                        style={{
                          background: `linear-gradient(135deg, ${stageColors[wo.current_stage]}ee 0%, ${stageColors[wo.current_stage]}aa 100%)`,
                          color: '#1F2937'
                        }}
                      >
                        {stageNames[wo.current_stage]}
                      </div>
                      {wo.due_date && (
                        <p className="text-xs text-gray-500">
                          Due: {new Date(wo.due_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {selectedWorkOrder && (
        <WorkOrderDetailsDialog
          isOpen={true}
          onClose={() => setSelectedWorkOrder(null)}
          workOrder={selectedWorkOrder}
          onUpdate={() => {
            setSelectedWorkOrder(null);
            if (searchTerm.length >= 2) {
              performSearch();
            }
          }}
        />
      )}
    </>
  );
}