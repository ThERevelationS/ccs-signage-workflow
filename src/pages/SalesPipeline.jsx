import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Filter, Search, Plus, Upload, Download, Settings, Inbox, BriefcaseBusiness, Archive, Database } from "lucide-react";
import SalesPipelineSpreadsheet from "@/components/sales/SalesPipelineSpreadsheet";
import WorkOrderForm from "@/components/workflow/WorkOrderForm";
import CustomFilterDialog from "@/components/sales/CustomFilterDialog";
import PendingImportsPanel, { fetchPendingImportCount } from "@/components/sales/PendingImportsPanel";
import BulkDuplicateCleanup from "@/components/sales/BulkDuplicateCleanup";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const AuthorizedEmail = base44.entities.AuthorizedEmail;
const EMPTY_PIPELINE_SUMMARY = {
  openCount: 0,
  openValue: 0,
  overdueCount: 0,
  dueTodayCount: 0,
  dueCount: 0,
  upcomingCount: 0,
  noNextActionCount: 0,
  quoteNoFollowUpCount: 0,
  ratedProbabilityCount: 0,
};

export default function SalesPipeline() {
  const { isRegistered, currentUser } = useAuth();
  const [filterStatus, setFilterStatus] = useState("all");
  const [recordScope, setRecordScope] = useState("current");
  const [viewMode, setViewMode] = useState("table");
  const [attentionFilter, setAttentionFilter] = useState("all");
  const [pipelineSummary, setPipelineSummary] = useState(EMPTY_PIPELINE_SUMMARY);
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [showCustomFilterDialog, setShowCustomFilterDialog] = useState(false);
  const [showColumnFilterDialog, setShowColumnFilterDialog] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const [activeColumnPreset, setActiveColumnPreset] = useState(null);
  const [canImportExport, setCanImportExport] = useState(false);
  const [showPendingImports, setShowPendingImports] = useState(false);
  const [pendingTab, setPendingTab] = useState("imports"); // "imports" | "duplicates"
  const [pendingCount, setPendingCount] = useState(0);
  const spreadsheetRef = useRef(null);

  useEffect(() => {
    const loadCount = async () => {
      setPendingCount(await fetchPendingImportCount());
    };
    loadCount();
  }, []);

  useEffect(() => {
    document.title = "Sales Pipeline - Workflow Manager";
  }, []);

  useEffect(() => {
    loadActiveFilters();
  }, [currentUser]);

  useEffect(() => {
    const checkImportExportPermission = async () => {
      if (currentUser?.role === "admin") {
        setCanImportExport(true);
        return;
      }
      if (currentUser?.email) {
        try {
          const users = await AuthorizedEmail.filter({ email: currentUser.email.toLowerCase() });
          if (users.length > 0 && users[0].can_import_export) {
            setCanImportExport(true);
          }
        } catch (e) {
          // ignore
        }
      }
    };
    checkImportExportPermission();
  }, [currentUser]);

  const loadActiveFilters = async () => {
    const SalesFilter = base44.entities.SalesFilter;
    const allFilters = await loadAllEntityRows({ entity: SalesFilter, sort: null, label: "Sales Pipeline saved filters" });
    const userEmail = currentUser?.email || "";
    const selected = allFilters.filter(f => f.selected_by?.includes(userEmail));
    setActiveFilters(selected);
    
    // Load active column preset
    const columnPreset = selected.find(f => f.type === "column_preset");
    setActiveColumnPreset(columnPreset || null);
  };

  const isStandardFilterEnabled = (value) => {
    const key = `sales_standard_${value}_selected`;
    const stored = localStorage.getItem(key);
    return stored === null ? true : stored === "true";
  };

  const applyAttentionFilter = (value) => {
    setAttentionFilter(value);
    setFilterStatus("all");
  };

  const formatPipelineValue = (value) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);

  const attentionChipClass = (value) => `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
    attentionFilter === value
      ? "border-blue-500 bg-blue-50 text-blue-800"
      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
  }`;

  return (
    <div className="flex flex-col p-4 sm:p-6" style={{ height: '100%', overflow: 'hidden' }}>
      <div className="w-full max-w-[98%] mx-auto flex flex-col min-h-0" style={{ flex: 1, minHeight: 0 }}>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="clay-card p-3 flex-shrink-0">
            <DollarSign className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-shrink-0">
            <h1 className="text-2xl font-bold text-gray-800">Sales Pipeline</h1>
            <p className="text-gray-600 text-sm hidden sm:block">Manage leads and opportunities</p>
          </div>
          {/* Pending Imports tab */}
          <button
            onClick={() => setShowPendingImports(!showPendingImports)}
            className={`relative flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 text-sm font-medium transition-all flex-shrink-0 ${showPendingImports ? 'border-green-400 bg-green-50 text-green-800' : 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50'}`}
          >
            <Inbox className="w-4 h-4" />
            {showPendingImports ? '← Return' : 'Pending Imports / Duplicates'}
            {!showPendingImports && pendingCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {pendingCount}
              </span>
            )}
          </button>

          <div className="flex-1" />

          <div className="flex flex-wrap items-end gap-2">
            {isRegistered && (
              <Button 
                onClick={() => setShowNewClientForm(true)}
                className="clay-button border-none text-gray-800 h-9"
                style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Client
              </Button>
            )}

            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-500 mb-1">Workspace</span>
              <Select value={recordScope} onValueChange={(value) => {
                setRecordScope(value);
                setAttentionFilter("all");
                if (value === "history") setViewMode("table");
              }}>
                <SelectTrigger className="w-44 h-9">
                  {recordScope === "current" ? <BriefcaseBusiness className="w-4 h-4 mr-2" /> : recordScope === "history" ? <Archive className="w-4 h-4 mr-2" /> : <Database className="w-4 h-4 mr-2" />}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current Pipeline</SelectItem>
                  <SelectItem value="history">Legacy History</SelectItem>
                  <SelectItem value="all">All Records</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-500 mb-1">Search</span>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Customer, contact, estimate, address..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64 h-9"
                />
              </div>
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
                <SelectTrigger className="w-48 h-9">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Select filter" />
                </SelectTrigger>
              <SelectContent>
                {isStandardFilterEnabled("all") && <SelectItem value="all">All Statuses</SelectItem>}
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
              value={activeColumnPreset?.id || "default"} 
              onValueChange={(value) => {
                if (value === "manage_columns") {
                  setShowColumnFilterDialog(true);
                } else if (value === "default") {
                  setActiveColumnPreset(null);
                } else if (value) {
                  const preset = activeFilters.find(f => f.id === value);
                  setActiveColumnPreset(preset || null);
                }
              }}
            >
              <SelectTrigger className="w-48 h-9">
                <Settings className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Column Filters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default View</SelectItem>
                {activeFilters.filter(f => f.type === "column_preset").map(preset => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
                {currentUser?.role === "admin" && (
                  <>
                    <div className="h-px bg-gray-800 my-2 mx-2"></div>
                    <SelectItem value="manage_columns">
                      <div className="flex items-center gap-2 font-bold">
                        <Settings className="w-4 h-4" />
                        Manage Custom Column Filters
                      </div>
                    </SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            </div>
            
            {canImportExport && (
              <div className="flex items-center gap-1 h-9">
                <Button 
                  onClick={() => spreadsheetRef.current?.importFromExcel()}
                  size="sm" 
                  className="h-9 px-2"
                  variant="ghost"
                >
                  <Upload className="w-3 h-3" />
                </Button>
                <Button 
                  onClick={() => spreadsheetRef.current?.exportToExcel()}
                  size="sm" 
                  className="h-9 px-2"
                  variant="ghost"
                >
                  <Download className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {!showPendingImports && recordScope !== "history" && (
          <div className="mb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
              <button type="button" onClick={() => applyAttentionFilter("all")} className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Open Opportunities</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{pipelineSummary.openCount}</div>
                <div className="mt-1 text-xs text-slate-500">Current operational records</div>
              </button>
              <button type="button" onClick={() => applyAttentionFilter("all")} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-left shadow-sm transition hover:border-emerald-300">
                <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Open Pipeline Value</div>
                <div className="mt-1 text-2xl font-bold text-emerald-900">{formatPipelineValue(pipelineSummary.openValue)}</div>
                <div className="mt-1 text-xs text-emerald-700/80">Quoted value when available, otherwise estimate</div>
              </button>
              <button type="button" onClick={() => applyAttentionFilter("due")} className={`rounded-xl border p-3 text-left shadow-sm transition ${attentionFilter === "due" ? "border-red-400 bg-red-50" : "border-red-200 bg-white hover:border-red-300"}`}>
                <div className="text-xs font-medium uppercase tracking-wide text-red-600">Follow-ups Due</div>
                <div className="mt-1 text-2xl font-bold text-red-800">{pipelineSummary.dueCount}</div>
                <div className="mt-1 text-xs text-red-600">{pipelineSummary.overdueCount} overdue · {pipelineSummary.dueTodayCount} today</div>
              </button>
              <button type="button" onClick={() => applyAttentionFilter("quote_no_followup")} className={`rounded-xl border p-3 text-left shadow-sm transition ${attentionFilter === "quote_no_followup" ? "border-amber-400 bg-amber-50" : "border-amber-200 bg-white hover:border-amber-300"}`}>
                <div className="text-xs font-medium uppercase tracking-wide text-amber-700">Quotes Need Follow-up</div>
                <div className="mt-1 text-2xl font-bold text-amber-900">{pipelineSummary.quoteNoFollowUpCount}</div>
                <div className="mt-1 text-xs text-amber-700/80">Quoted/sent with no follow-up date</div>
              </button>
              <button type="button" onClick={() => applyAttentionFilter("no_next_action")} className={`rounded-xl border p-3 text-left shadow-sm transition ${attentionFilter === "no_next_action" ? "border-violet-400 bg-violet-50" : "border-violet-200 bg-white hover:border-violet-300"}`}>
                <div className="text-xs font-medium uppercase tracking-wide text-violet-700">No Next Action</div>
                <div className="mt-1 text-2xl font-bold text-violet-900">{pipelineSummary.noNextActionCount}</div>
                <div className="mt-1 text-xs text-violet-700/80">No follow-up or task deadline</div>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
              <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Attention</span>
              <button type="button" onClick={() => applyAttentionFilter("all")} className={attentionChipClass("all")}>All</button>
              <button type="button" onClick={() => applyAttentionFilter("overdue")} className={attentionChipClass("overdue")}>Overdue {pipelineSummary.overdueCount > 0 ? `(${pipelineSummary.overdueCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("today")} className={attentionChipClass("today")}>Today {pipelineSummary.dueTodayCount > 0 ? `(${pipelineSummary.dueTodayCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("upcoming")} className={attentionChipClass("upcoming")}>Next 7 Days {pipelineSummary.upcomingCount > 0 ? `(${pipelineSummary.upcomingCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("mine")} className={attentionChipClass("mine")}>My Opportunities</button>
              {pipelineSummary.ratedProbabilityCount === 0 && (
                <span className="ml-auto text-xs text-gray-500">Weighted value is hidden until probability is actually being used.</span>
              )}
            </div>
          </div>
        )}

        {showPendingImports ? (
          <div className="clay-card p-4 overflow-auto flex flex-col" style={{ flex: 1, minHeight: 0 }}>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <Inbox className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <h2 className="text-lg font-bold text-gray-800">Pending Imports / Duplicates</h2>
              <div className="flex gap-1 ml-auto">
                <button
                  onClick={() => setPendingTab("imports")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${pendingTab === "imports" ? "bg-amber-100 text-amber-800 border border-amber-300" : "text-gray-500 hover:bg-gray-100"}`}
                >
                  Corebridge Imports
                  {pendingCount > 0 && <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5">{pendingCount}</span>}
                </button>
                <button
                  onClick={() => setPendingTab("duplicates")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${pendingTab === "duplicates" ? "bg-orange-100 text-orange-800 border border-orange-300" : "text-gray-500 hover:bg-gray-100"}`}
                >
                  🧹 Bulk Duplicate Cleanup
                </button>
              </div>
            </div>
            {pendingTab === "imports" ? (
              <PendingImportsPanel onCountChange={setPendingCount} />
            ) : (
              <BulkDuplicateCleanup />
            )}
          </div>
        ) : (
          <SalesPipelineSpreadsheet 
            ref={spreadsheetRef}
            searchTerm={searchTerm} 
            filterStatus={filterStatus}
            recordScope={recordScope}
            attentionFilter={attentionFilter}
            onSummaryChange={setPipelineSummary}
            showButtonsInline={false}
            activeColumnPreset={activeColumnPreset}
            customFilters={activeFilters.filter(f => f.type === "filter")}
          />
        )}
      </div>

      {showNewClientForm && (
        <WorkOrderForm
          isOpen={showNewClientForm}
          onClose={() => setShowNewClientForm(false)}
          onSave={async (data) => {
            await spreadsheetRef.current?.handleCreateFromForm(data);
            setShowNewClientForm(false);
          }}
        />
      )}

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