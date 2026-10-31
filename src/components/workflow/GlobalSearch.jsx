import { useState, useEffect } from "react";
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
import { Search, Filter, X, Loader2, ChevronDown, GitBranch, Receipt, Package, FileDiff, Calculator } from "lucide-react";
import { Label } from "@/components/ui/label";
import WorkOrderDetailsDialog from "./WorkOrderDetailsDialog";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { useAuth } from "@/components/auth/EmailGate";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import { CcsDateField } from "@/components/ui/ccs-date-field";

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

export default function GlobalSearch({ className = "", compact = false, shellGlass = false }) {
  const { sessionToken } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState([]);
  const [recordResults, setRecordResults] = useState({ opportunities: [], estimates: [], invoices: [], purchase_orders: [], change_orders: [] });
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
      const allWorkOrders = await loadAllEntityRows({
        entity: WorkOrder,
        query: { completed: false },
        sort: "created_date",
        label: "Global Search Work Orders",
      });
      
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

    if (sessionToken && searchTerm.trim().length >= 2) {
      try {
        const r = await base44.functions.invoke("opportunityWorkspaceAction", {
          action: "global_search",
          session_token: sessionToken,
          query: searchTerm,
        });
        const data = r?.data || r;
        if (data?.success && data.results) setRecordResults(data.results);
      } catch (error) {
        console.error("Record search error:", error);
        setRecordResults({ opportunities: [], estimates: [], invoices: [], purchase_orders: [], change_orders: [] });
      }
    } else {
      setRecordResults({ opportunities: [], estimates: [], invoices: [], purchase_orders: [], change_orders: [] });
    }
    setIsSearching(false);
  };

  const recordTotal = Object.values(recordResults).reduce((s, list) => s + (list?.length || 0), 0);
  const goToRecord = (path) => {
    setShowResults(false);
    navigate(path);
  };
  const recordSections = [
    ["opportunities", "Opportunities", GitBranch, (r) => `${r.customer_display_name || "—"} · ${r.stage || "—"}`, (r) => `/Opportunities?open=${r.id}`],
    ["estimates", "Estimates", Calculator, (r) => `${r.client_name || "—"} · ${r.estimate_number || r.status || "—"}`, (r) => `/EstimateDetail?id=${r.id}`],
    ["invoices", "Invoices", Receipt, (r) => `${r.customer_display_name || "—"} · ${r.status || "—"} · $${Number(r.total || 0).toFixed(2)}`, (r) => `/Invoices?invoice=${r.id}`],
    ["purchase_orders", "Purchase Orders", Package, (r) => `${r.vendor_name || "—"} · ${r.status || "—"}`, (r) => `/PurchaseOrders?po=${r.id}`],
    ["change_orders", "Change Orders", FileDiff, (r) => `${r.title || r.customer_display_name || "—"} · ${r.status || "—"}`, (r) => `/ChangeOrders?co=${r.id}`],
  ];

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
        className={`${shellGlass ? `ccs-glass-control ${hasActiveFilters ? "ccs-glass-purple text-violet-100" : "ccs-glass-neutral text-slate-100"}` : "clay-button border-2"} ${compact ? "h-7 px-2 py-1" : "px-4 py-2"} rounded-xl ${shellGlass ? "" : (hasActiveFilters ? "text-purple-700 border-purple-300" : "text-gray-800 border-gray-200")} ${className}`}
        style={shellGlass ? undefined : { background: hasActiveFilters ? 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' : 'linear-gradient(135deg, #F5F3FF 0%, rgba(255,255,255,0.9) 100%)' }}
      >
        <Search className={`${compact ? "mr-1 h-3.5 w-3.5" : "mr-2 h-4 w-4"}`} />
        <span className={`${compact ? "text-xs" : "text-sm"} font-bold`}>Search</span>
        {hasActiveFilters && (
          <span className="ml-2 bg-purple-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {(filterStages.length > 0 ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
          </span>
        )}
      </Button>

      {/* Search Dialog */}
      <Dialog open={showResults} onOpenChange={setShowResults} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogContent className="clay-card border-none max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Search className="w-5 h-5 text-purple-600" />
              Search
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
                        <button type="button"
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
                      <CcsDateField
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">To Date</Label>
                      <CcsDateField
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
                {results.length + recordTotal} {results.length + recordTotal === 1 ? 'result' : 'results'} found
              </div>
            )}

            {/* Results Container */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1">
            {searchTerm.length < 2 ? (
              <div className="text-center py-8 text-gray-500">
                <Search className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Type at least 2 characters to search</p>
              </div>
            ) : results.length === 0 && recordTotal === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No results found</p>
                <p className="text-sm mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <>
              {recordSections.map(([key, label, Icon, subline, target]) => {
                const list = recordResults[key] || [];
                if (list.length === 0) return null;
                return (
                  <div key={key}>
                    <div className="px-1 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5" />{label}
                    </div>
                    {list.map((r) => (
                      <div
                        key={r.id}
                        onClick={() => goToRecord(target(r))}
                        className="p-3 mb-2 rounded-lg clay-card cursor-pointer hover:opacity-80 transition-all"
                      >
                        <h4 className="font-semibold text-sm text-gray-800 truncate">
                          {r.title || r.project_name || r.invoice_number || r.po_number || r.change_order_number}
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">{subline(r)}{r.legacy_source_id ? ` · CB #${r.legacy_source_id}` : ""}</p>
                      </div>
                    ))}
                  </div>
                );
              })}
              {results.length > 0 && (
                <div className="px-1 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-gray-400">Work Orders</div>
              )}
              {results.map(wo => (
                <div
                  key={wo.id}
                  onClick={() => handleWorkOrderClick(wo)}
                  className={`p-3 rounded-lg clay-card cursor-pointer hover:opacity-80 transition-all ${wo.is_rider ? 'border-l-4 border-purple-400 bg-purple-50/50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {wo.is_rider && (
                          <span className="px-2 py-0.5 bg-purple-200 text-purple-800 text-xs rounded font-bold border border-purple-400">
                            RIDER
                          </span>
                        )}
                        <h4 className={`font-semibold text-sm truncate ${wo.is_rider ? 'text-purple-800' : 'text-gray-800'}`}>
                          {wo.title}
                        </h4>
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
              ))}
              </>
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