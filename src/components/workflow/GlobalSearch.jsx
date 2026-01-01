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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { Search, Filter, X, Loader2, ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import WorkOrderDetailsDialog from "./WorkOrderDetailsDialog";

const WorkOrder = base44.entities.WorkOrder;

const stageOrder = ['permitting', 'design', 'production', 'fabrication', 'installation'];

const stageColors = {
  permitting: "#FFE4D6",
  design: "#D4E9F7",
  production: "#C8F4E9",
  fabrication: "#FFD6E8",
  installation: "#E0D4F7"
};

const stageNames = {
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
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (showResults && searchTerm.length >= 2) {
      performSearch();
    }
  }, [searchTerm, filterStages, dateFrom, dateTo, showResults]);

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
      <Button
        size="sm"
        onClick={() => setShowResults(true)}
        className={`clay-button border-2 h-9 px-4 ${hasActiveFilters ? 'text-purple-700 border-purple-300' : 'text-gray-800 border-gray-200'}`}
        style={{ background: hasActiveFilters ? 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' : 'linear-gradient(135deg, #F5F3FF 0%, rgba(255,255,255,0.9) 100%)' }}
      >
        <Search className="w-4 h-4 mr-2" />
        <span className="text-sm font-bold">Search</span>
        {hasActiveFilters && (
          <span className="ml-2 bg-purple-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {(filterStages.length > 0 ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
          </span>
        )}
      </Button>

      {/* Search Dialog */}
      <Dialog open={showResults} onOpenChange={(open) => { if (open) setShowResults(true); }}>
        <DialogContent className="clay-card border-none max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Search className="w-5 h-5 text-purple-600" />
              Search Work Orders
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Type to search work orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
                className="h-10 pl-10 pr-4"
              />
              {isSearching && (
                <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
              )}
            </div>

            {/* Collapsible Filters */}
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between clay-button border-none h-9"
                  style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, rgba(255,255,255,0.9) 100%)' }}
                >
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    <span className="font-semibold">Filters</span>
                    {hasActiveFilters && (
                      <span className="bg-purple-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {(filterStages.length > 0 ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
                  {hasActiveFilters && (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="h-6 px-2 text-xs"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Clear All
                      </Button>
                    </div>
                  )}

                  {/* Stage filters */}
                  <div>
                    <Label className="text-xs mb-2 block">Stages</Label>
                    <div className="flex flex-wrap gap-1">
                      {stageOrder.map(stage => (
                        <button
                          key={stage}
                          onClick={() => toggleStageFilter(stage)}
                          className={`px-2 py-1 text-xs rounded-lg transition-all ${
                            filterStages.includes(stage)
                              ? 'bg-purple-100 text-purple-700 font-medium border border-purple-300'
                              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                          }`}
                        >
                          {stageNames[stage]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Date Range */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs mb-1 block">From Date</Label>
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">To Date</Label>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Results count */}
            {searchTerm.length >= 2 && (
              <div className="text-sm text-gray-500">
                {results.length} {results.length === 1 ? 'result' : 'results'} found
              </div>
            )}

            {/* Results Container */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1">
            {searchTerm.length < 2 ? (
              <div className="text-center py-8 text-gray-500">
                <Search className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Type at least 2 characters to search</p>
              </div>
            ) : results.length === 0 ? (
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