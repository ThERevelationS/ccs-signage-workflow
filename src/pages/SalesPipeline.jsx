import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Filter, Search, Plus, Upload, Download, Settings, Inbox, BriefcaseBusiness, Archive, Database, Trophy, BarChart3, AlertTriangle, CalendarClock } from "lucide-react";
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
  assignedOwnerCount: 0,
  unassignedOwnerCount: 0,
  myOpportunityCount: 0,
  overdueCount: 0,
  dueTodayCount: 0,
  dueCount: 0,
  upcomingCount: 0,
  noNextActionCount: 0,
  nextActionCoverageCount: 0,
  needsAttentionCount: 0,
  placeholderCount: 0,
  placeholderValue: 0,
  quoteAwaitingResponseCount: 0,
  quoteTimingCoverageCount: 0,
  quoteTimingMissingCount: 0,
  quoteNoFollowUpCount: 0,
  quoteScheduledFollowUpCount: 0,
  quoteDueCount: 0,
  quoteAgedCount: 0,
  quoteVeryAgedCount: 0,
  averageQuoteAgeDays: 0,
  oldestQuoteAgeDays: 0,
  quoteAgingBuckets: [],
  quoteOwnerBreakdown: [],
  nearCloseCount: 0,
  overdueCloseCount: 0,
  staleCount: 0,
  trackedActivityCount: 0,
  untrackedActivityCount: 0,
  ratedProbabilityCount: 0,
  unratedProbabilityCount: 0,
  weightedValue: 0,
  sourceCoverageCount: 0,
  sourceMissingCount: 0,
  sourceBreakdown: [],
  stageAgeCoverageCount: 0,
  stageAgeMissingCount: 0,
  stageAgedCount: 0,
  averageStageAgeDays: 0,
  oldestStageAgeDays: 0,
  stageAgingBuckets: [],
  stageBreakdown: [],
  age30PlusCount: 0,
  age90PlusCount: 0,
  averageAgeDays: 0,
  oldestAgeDays: 0,
  agingBuckets: [],
  ownerWorkload: [],
  trackedOutcomeCount: 0,
  totalTrackedOutcomeCount: 0,
  wonCount: 0,
  lostCount: 0,
  wonValue: 0,
  lostValue: 0,
  closedValue: 0,
  trackedWinRate: null,
  closeDateMissingCount: 0,
  lostReasonMissingCount: 0,
  lostReasonBreakdown: [],
  ownerOutcomePerformance: [],
  sourceOutcomePerformance: [],
};

export default function SalesPipeline() {
  const { isRegistered, currentUser } = useAuth();
  const [filterStatus, setFilterStatus] = useState("all");
  const [recordScope, setRecordScope] = useState("current");
  const [viewMode, setViewMode] = useState("table");
  const [attentionFilter, setAttentionFilter] = useState("all");
  const [outcomePeriod, setOutcomePeriod] = useState("all");
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

  const attentionChipClass = (value) => `shrink-0 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-medium leading-none transition-colors ${
    attentionFilter === value
      ? "border-blue-500 bg-blue-50 text-blue-800"
      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
  }`;

  return (
    <div className="flex flex-col p-2 sm:p-3" style={{ height: '100%', overflow: 'hidden' }}>
      <div className="w-full max-w-[99%] mx-auto flex flex-col min-h-0" style={{ flex: 1, minHeight: 0 }}>
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <div className="clay-card p-2 flex-shrink-0">
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-shrink-0 leading-tight">
            <h1 className="text-xl font-bold text-gray-800">Sales Pipeline</h1>
            <p className="hidden text-[10px] text-gray-500 xl:block">Manage leads and opportunities</p>
          </div>
          {/* Pending Imports tab */}
          <button
            onClick={() => setShowPendingImports(!showPendingImports)}
            className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all flex-shrink-0 ${showPendingImports ? 'border-green-400 bg-green-50 text-green-800' : 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50'}`}
          >
            <Inbox className="w-4 h-4" />
            {showPendingImports ? '← Return' : 'Pending Imports / Duplicates'}
            {!showPendingImports && pendingCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>

          <div className="flex-1" />

          <div className="flex flex-wrap items-end gap-2">
            {isRegistered && (
              <Button 
                onClick={() => setShowNewClientForm(true)}
                className="clay-button h-8 border-none px-2.5 text-xs text-gray-800"
                style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Client
              </Button>
            )}

            <div className="flex flex-col">
              <span className="mb-0.5 text-[9px] font-medium leading-none text-gray-500">Workspace</span>
              <Select value={recordScope} onValueChange={(value) => {
                setRecordScope(value);
                setAttentionFilter("all");
                setFilterStatus("all");
                if (value === "history" || value === "outcomes" || (value !== "current" && ["insights", "daily"].includes(viewMode))) setViewMode("table");
              }}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  {recordScope === "current" ? <BriefcaseBusiness className="w-4 h-4 mr-2" /> : recordScope === "outcomes" ? <Trophy className="w-4 h-4 mr-2" /> : recordScope === "history" ? <Archive className="w-4 h-4 mr-2" /> : <Database className="w-4 h-4 mr-2" />}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current Pipeline</SelectItem>
                  <SelectItem value="outcomes">Won / Lost Outcomes</SelectItem>
                  <SelectItem value="history">Legacy History</SelectItem>
                  <SelectItem value="all">All Records</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {recordScope !== "history" && recordScope !== "outcomes" && (
              <div className="flex flex-col">
                <span className="mb-0.5 text-[9px] font-medium leading-none text-gray-500">View</span>
                <div className="flex h-8 overflow-hidden rounded-md border border-gray-200 bg-white">
                  <button type="button" onClick={() => setViewMode("table")} className={`px-3 text-xs font-medium transition-colors ${viewMode === "table" ? "bg-slate-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}>Table</button>
                  <button type="button" onClick={() => setViewMode("board")} className={`border-l border-gray-200 px-3 text-xs font-medium transition-colors ${viewMode === "board" ? "bg-slate-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}>Board</button>
                  {recordScope === "current" && <button type="button" onClick={() => { setViewMode("daily"); setAttentionFilter("all"); setFilterStatus("all"); }} className={`border-l border-gray-200 px-3 text-xs font-medium transition-colors ${viewMode === "daily" ? "bg-slate-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}><span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />Daily</span></button>}
                  {recordScope === "current" && <button type="button" onClick={() => { setViewMode("insights"); setAttentionFilter("all"); setFilterStatus("all"); }} className={`border-l border-gray-200 px-3 text-xs font-medium transition-colors ${viewMode === "insights" ? "bg-slate-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}><span className="flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" />Insights</span></button>}
                </div>
              </div>
            )}

            {recordScope === "outcomes" && (
              <div className="flex flex-col">
                <span className="mb-0.5 text-[9px] font-medium leading-none text-gray-500">Outcome Period</span>
                <Select value={outcomePeriod} onValueChange={setOutcomePeriod}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tracked</SelectItem>
                    <SelectItem value="30">Last 30 Days</SelectItem>
                    <SelectItem value="90">Last 90 Days</SelectItem>
                    <SelectItem value="365">Last 12 Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col">
              <span className="mb-0.5 text-[9px] font-medium leading-none text-gray-500">Search</span>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Customer, contact, estimate, address..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 w-56 pl-9 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col">
              <span className="mb-0.5 text-[9px] font-medium leading-none text-gray-500">Information Filters</span>
              <Select value={filterStatus} onValueChange={(value) => {
                if (value === "manage_filters") {
                  setShowCustomFilterDialog(true);
                } else {
                  setFilterStatus(value);
                }
              }}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Select filter" />
                </SelectTrigger>
              <SelectContent>
                {isStandardFilterEnabled("all") && <SelectItem value="all">{recordScope === "outcomes" ? "All Outcomes" : "All Statuses"}</SelectItem>}
                {recordScope !== "outcomes" && isStandardFilterEnabled("lead") && <SelectItem value="lead">Lead</SelectItem>}
                {recordScope !== "outcomes" && isStandardFilterEnabled("quoted") && <SelectItem value="quoted">Quoted</SelectItem>}
                {recordScope !== "outcomes" && isStandardFilterEnabled("follow_up") && <SelectItem value="follow_up">Follow Up</SelectItem>}
                {recordScope !== "current" && isStandardFilterEnabled("won") && <SelectItem value="won">Won</SelectItem>}
                {recordScope !== "current" && isStandardFilterEnabled("lost") && <SelectItem value="lost">Lost</SelectItem>}
                {recordScope !== "outcomes" && isStandardFilterEnabled("on_hold") && <SelectItem value="on_hold">On Hold</SelectItem>}
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
              <span className="mb-0.5 text-[9px] font-medium leading-none text-gray-500">Column Filters</span>
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
              <SelectTrigger className="h-8 w-40 text-xs">
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
              <div className="flex h-8 items-center gap-0.5">
                <Button 
                  onClick={() => spreadsheetRef.current?.importFromExcel()}
                  size="sm" 
                  className="h-8 px-2"
                  variant="ghost"
                >
                  <Upload className="w-3 h-3" />
                </Button>
                <Button 
                  onClick={() => spreadsheetRef.current?.exportToExcel()}
                  size="sm" 
                  className="h-8 px-2"
                  variant="ghost"
                >
                  <Download className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {!showPendingImports && !["insights", "daily"].includes(viewMode) && (recordScope === "current" || recordScope === "all") && (
          <div className="mb-2 space-y-1.5">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" title="Pipeline summary. Swipe or scroll horizontally on smaller screens.">
              <button type="button" onClick={() => applyAttentionFilter("all")} className="min-w-[180px] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm transition hover:border-slate-300 hover:shadow">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Open Opportunities</div>
                    <div className="mt-0.5 truncate text-[10px] leading-tight text-slate-500">{Math.max(0, pipelineSummary.openCount - pipelineSummary.placeholderCount)} not test · {pipelineSummary.placeholderCount} test · {pipelineSummary.assignedOwnerCount} owned · {pipelineSummary.unassignedOwnerCount} unassigned</div>
                  </div>
                  <div className="shrink-0 text-lg font-bold leading-none text-slate-900">{pipelineSummary.openCount}</div>
                </div>
              </button>
              <button type="button" title="Quoted value when available, otherwise estimate" onClick={() => applyAttentionFilter("all")} className="min-w-[180px] flex-1 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2 py-1.5 text-left shadow-sm transition hover:border-emerald-300">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700">Open Pipeline Value</div>
                    <div className="mt-0.5 truncate text-[10px] leading-tight text-emerald-700/80">{formatPipelineValue(Math.max(0, pipelineSummary.openValue - pipelineSummary.placeholderValue))} not test · {formatPipelineValue(pipelineSummary.placeholderValue)} test</div>
                  </div>
                  <div className="shrink-0 text-lg font-bold leading-none text-emerald-900">{formatPipelineValue(pipelineSummary.openValue)}</div>
                </div>
              </button>
              <button type="button" onClick={() => applyAttentionFilter(pipelineSummary.unratedProbabilityCount > 0 ? "probability_missing" : "all")} className={`min-w-[180px] flex-1 rounded-lg border px-2 py-1.5 text-left shadow-sm transition ${attentionFilter === "probability_missing" ? "border-sky-400 bg-sky-50" : "border-sky-200 bg-white hover:border-sky-300"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-sky-700">Weighted Pipeline</div>
                    <div className="mt-0.5 truncate text-[10px] leading-tight text-sky-700/80">{pipelineSummary.ratedProbabilityCount}/{pipelineSummary.openCount} rated{pipelineSummary.unratedProbabilityCount > 0 ? " · click to complete" : ""}</div>
                  </div>
                  <div className="shrink-0 text-lg font-bold leading-none text-sky-900">{formatPipelineValue(pipelineSummary.weightedValue)}</div>
                </div>
              </button>
              <button type="button" onClick={() => applyAttentionFilter("due")} className={`min-w-[180px] flex-1 rounded-lg border px-2 py-1.5 text-left shadow-sm transition ${attentionFilter === "due" ? "border-red-400 bg-red-50" : "border-red-200 bg-white hover:border-red-300"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-red-600">Follow-ups Due</div>
                    <div className="mt-0.5 truncate text-[10px] leading-tight text-red-600">{pipelineSummary.overdueCount} overdue · {pipelineSummary.dueTodayCount} today</div>
                  </div>
                  <div className="shrink-0 text-lg font-bold leading-none text-red-800">{pipelineSummary.dueCount}</div>
                </div>
              </button>
              <button type="button" onClick={() => applyAttentionFilter("quote_no_followup")} className={`min-w-[180px] flex-1 rounded-lg border px-2 py-1.5 text-left shadow-sm transition ${attentionFilter === "quote_no_followup" ? "border-amber-400 bg-amber-50" : "border-amber-200 bg-white hover:border-amber-300"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-amber-700">Quotes Need Follow-up</div>
                    <div className="mt-0.5 truncate text-[10px] leading-tight text-amber-700/80">{pipelineSummary.quoteAwaitingResponseCount} awaiting · {pipelineSummary.quoteTimingMissingCount} timing missing</div>
                  </div>
                  <div className="shrink-0 text-lg font-bold leading-none text-amber-900">{pipelineSummary.quoteNoFollowUpCount}</div>
                </div>
              </button>
              <button type="button" onClick={() => applyAttentionFilter(pipelineSummary.noNextActionCount > 0 ? "no_next_action" : "all")} className={`min-w-[180px] flex-1 rounded-lg border px-2 py-1.5 text-left shadow-sm transition ${attentionFilter === "no_next_action" ? "border-violet-400 bg-violet-50" : "border-violet-200 bg-white hover:border-violet-300"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-violet-700">Next Action Coverage</div>
                    <div className="mt-0.5 truncate text-[10px] leading-tight text-violet-700/80">{pipelineSummary.noNextActionCount} missing{pipelineSummary.noNextActionCount > 0 ? " · click to review" : ""}</div>
                  </div>
                  <div className="shrink-0 text-lg font-bold leading-none text-violet-900">{pipelineSummary.nextActionCoverageCount}/{pipelineSummary.openCount}</div>
                </div>
              </button>
              <button type="button" title="Based on explicit expected close date" onClick={() => applyAttentionFilter("near_close")} className={`min-w-[180px] flex-1 rounded-lg border px-2 py-1.5 text-left shadow-sm transition ${attentionFilter === "near_close" ? "border-cyan-400 bg-cyan-50" : "border-cyan-200 bg-white hover:border-cyan-300"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-cyan-700">Closing Next 14 Days</div>
                    <div className="mt-0.5 truncate text-[10px] leading-tight text-cyan-700/80">Expected close date</div>
                  </div>
                  <div className="shrink-0 text-lg font-bold leading-none text-cyan-900">{pipelineSummary.nearCloseCount}</div>
                </div>
              </button>
              <button type="button" title="Staleness uses verified sales-specific activity only" onClick={() => applyAttentionFilter("stale")} className={`min-w-[180px] flex-1 rounded-lg border px-2 py-1.5 text-left shadow-sm transition ${attentionFilter === "stale" ? "border-rose-400 bg-rose-50" : "border-rose-200 bg-white hover:border-rose-300"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-rose-700">Stale 14+ Days</div>
                    <div className="mt-0.5 truncate text-[10px] leading-tight text-rose-700/80">Verified sales activity</div>
                  </div>
                  <div className="shrink-0 text-lg font-bold leading-none text-rose-900">{pipelineSummary.staleCount}</div>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white/80 px-2 py-1.5" title="Sales attention filters. Swipe or scroll horizontally to see every filter.">
              <button type="button" onClick={() => applyAttentionFilter("needs_attention")} className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 text-left transition-colors ${attentionFilter === "needs_attention" ? "bg-amber-200/70" : "hover:bg-amber-100"}`}>
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-700" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">Needs Attention</span>
                <span className="text-[10px] text-amber-700">{pipelineSummary.needsAttentionCount}/{pipelineSummary.openCount}</span>
              </button>
              <button type="button" onClick={() => applyAttentionFilter("no_next_action")} className={attentionChipClass("no_next_action")}>Next Action {pipelineSummary.noNextActionCount > 0 ? `(${pipelineSummary.noNextActionCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("owner_unassigned")} className={attentionChipClass("owner_unassigned")}>Owner {pipelineSummary.unassignedOwnerCount > 0 ? `(${pipelineSummary.unassignedOwnerCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("probability_missing")} className={attentionChipClass("probability_missing")}>Probability {pipelineSummary.unratedProbabilityCount > 0 ? `(${pipelineSummary.unratedProbabilityCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("source_missing")} className={attentionChipClass("source_missing")}>Source {pipelineSummary.sourceMissingCount > 0 ? `(${pipelineSummary.sourceMissingCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("quote_timing_missing")} className={attentionChipClass("quote_timing_missing")}>Quote Timing {pipelineSummary.quoteTimingMissingCount > 0 ? `(${pipelineSummary.quoteTimingMissingCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("stage_untracked")} className={attentionChipClass("stage_untracked")}>Stage Timing {pipelineSummary.stageAgeMissingCount > 0 ? `(${pipelineSummary.stageAgeMissingCount})` : ""}</button>
              {pipelineSummary.placeholderCount > 0 && (
                <button
                  type="button"
                  title={`${pipelineSummary.placeholderCount}/${pipelineSummary.openCount} exact-name test placeholders (Test/asdf), representing ${formatPipelineValue(pipelineSummary.placeholderValue)} of ${formatPipelineValue(pipelineSummary.openValue)} raw pipeline value. Raw totals include them until explicitly removed from Current Pipeline.`}
                  onClick={() => applyAttentionFilter("placeholder")}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-semibold leading-none transition-colors ${attentionFilter === "placeholder" ? "border-rose-400 bg-rose-100 text-rose-900" : "border-rose-300 bg-white text-rose-800 hover:bg-rose-100"}`}
                >
                  Test Records {pipelineSummary.placeholderCount > 0 ? `(${pipelineSummary.placeholderCount})` : ""} · {formatPipelineValue(pipelineSummary.placeholderValue)}
                </button>
              )}
              <span className="ml-1 shrink-0 whitespace-nowrap border-l border-gray-200 pl-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Operational</span>
              <button type="button" onClick={() => applyAttentionFilter("all")} className={attentionChipClass("all")}>All</button>
              <button type="button" onClick={() => applyAttentionFilter("overdue")} className={attentionChipClass("overdue")}>Overdue {pipelineSummary.overdueCount > 0 ? `(${pipelineSummary.overdueCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("today")} className={attentionChipClass("today")}>Today {pipelineSummary.dueTodayCount > 0 ? `(${pipelineSummary.dueTodayCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("upcoming")} className={attentionChipClass("upcoming")}>Next 7 Days {pipelineSummary.upcomingCount > 0 ? `(${pipelineSummary.upcomingCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("quote_aged")} className={attentionChipClass("quote_aged")}>Quote Aged 14+ Days {pipelineSummary.quoteAgedCount > 0 ? `(${pipelineSummary.quoteAgedCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("near_close")} className={attentionChipClass("near_close")}>Closing ≤14 Days {pipelineSummary.nearCloseCount > 0 ? `(${pipelineSummary.nearCloseCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("close_overdue")} className={attentionChipClass("close_overdue")}>Expected Close Overdue {pipelineSummary.overdueCloseCount > 0 ? `(${pipelineSummary.overdueCloseCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("stale")} className={attentionChipClass("stale")}>Stale 14+ Days {pipelineSummary.staleCount > 0 ? `(${pipelineSummary.staleCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("activity_untracked")} className={attentionChipClass("activity_untracked")}>Activity Baseline Missing {pipelineSummary.untrackedActivityCount > 0 ? `(${pipelineSummary.untrackedActivityCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("stage_aged")} className={attentionChipClass("stage_aged")}>Stage Aged 14+ Days {pipelineSummary.stageAgedCount > 0 ? `(${pipelineSummary.stageAgedCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("mine")} className={attentionChipClass("mine")}>My Opportunities {pipelineSummary.myOpportunityCount > 0 ? `(${pipelineSummary.myOpportunityCount})` : ""}</button>
              <button type="button" onClick={() => applyAttentionFilter("age_90_plus")} className={attentionChipClass("age_90_plus")}>Age 90+ Days {pipelineSummary.age90PlusCount > 0 ? `(${pipelineSummary.age90PlusCount})` : ""}</button>
            </div>
          </div>
        )}

        {!showPendingImports && recordScope === "outcomes" && (
          <div className="mb-3 space-y-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              <button type="button" onClick={() => { setAttentionFilter("all"); setFilterStatus("all"); }} className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow">
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Tracked Outcomes</div>
                <div className="mt-0.5 text-xl font-bold leading-tight text-slate-900">{pipelineSummary.trackedOutcomeCount}</div>
                <div className="mt-1 text-xs text-slate-500">{outcomePeriod === "all" ? "All authoritative modern outcomes" : `${pipelineSummary.totalTrackedOutcomeCount} tracked across all dates`}</div>
              </button>
              <button type="button" onClick={() => { setAttentionFilter("all"); setFilterStatus("won"); }} className={`rounded-xl border p-3 text-left shadow-sm transition ${filterStatus === "won" ? "border-emerald-400 bg-emerald-50" : "border-emerald-200 bg-white hover:border-emerald-300"}`}>
                <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-700">Won</div>
                <div className="mt-0.5 text-xl font-bold leading-tight text-emerald-900">{pipelineSummary.wonCount}</div>
                <div className="mt-1 text-xs text-emerald-700/80">{formatPipelineValue(pipelineSummary.wonValue)} won value</div>
              </button>
              <button type="button" onClick={() => { setAttentionFilter("all"); setFilterStatus("lost"); }} className={`rounded-xl border p-3 text-left shadow-sm transition ${filterStatus === "lost" ? "border-red-400 bg-red-50" : "border-red-200 bg-white hover:border-red-300"}`}>
                <div className="text-[10px] font-medium uppercase tracking-wide text-red-700">Lost</div>
                <div className="mt-0.5 text-xl font-bold leading-tight text-red-900">{pipelineSummary.lostCount}</div>
                <div className="mt-1 text-xs text-red-700/80">{formatPipelineValue(pipelineSummary.lostValue)} lost value</div>
              </button>
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 shadow-sm">
                <div className="text-[10px] font-medium uppercase tracking-wide text-indigo-700">Closed Value</div>
                <div className="mt-0.5 text-xl font-bold leading-tight text-indigo-900">{formatPipelineValue(pipelineSummary.closedValue)}</div>
                <div className="mt-1 text-xs text-indigo-700/80">Won + lost tracked value</div>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 shadow-sm">
                <div className="text-[10px] font-medium uppercase tracking-wide text-blue-700">Tracked Win Rate</div>
                <div className="mt-0.5 text-xl font-bold leading-tight text-blue-900">{pipelineSummary.trackedWinRate == null ? "—" : `${pipelineSummary.trackedWinRate.toFixed(1)}%`}</div>
                <div className="mt-1 text-xs text-blue-700/80">Won ÷ explicit Won/Lost outcomes</div>
              </div>
              <div className={`rounded-xl border p-3 shadow-sm ${(pipelineSummary.closeDateMissingCount + pipelineSummary.lostReasonMissingCount) > 0 ? "border-amber-300 bg-amber-50" : "border-teal-200 bg-teal-50/60"}`}>
                <div className={`text-[10px] font-medium uppercase tracking-wide ${(pipelineSummary.closeDateMissingCount + pipelineSummary.lostReasonMissingCount) > 0 ? "text-amber-700" : "text-teal-700"}`}>Closeout QA</div>
                <div className={`mt-0.5 text-xl font-bold leading-tight ${(pipelineSummary.closeDateMissingCount + pipelineSummary.lostReasonMissingCount) > 0 ? "text-amber-900" : "text-teal-900"}`}>{pipelineSummary.closeDateMissingCount + pipelineSummary.lostReasonMissingCount}</div>
                <div className="mt-1 text-xs text-gray-600">{pipelineSummary.closeDateMissingCount} missing date · {pipelineSummary.lostReasonMissingCount} lost reason</div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-gray-800">Lost Reason Breakdown</div>
                <p className="mt-1 text-xs text-gray-500">Only explicit modern Lost outcomes in the selected period.</p>
                <div className="mt-3 space-y-2">
                  {pipelineSummary.lostReasonBreakdown.length === 0 ? (
                    <div className="rounded-lg bg-gray-50 px-3 py-4 text-sm text-gray-500">No tracked lost reasons in this period yet.</div>
                  ) : pipelineSummary.lostReasonBreakdown.slice(0, 8).map((item) => (
                    <div key={item.reason} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span className="truncate text-gray-700">{item.reason}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 shadow-sm">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-800">Reporting Integrity</div>
                <p className="mt-2 text-sm text-slate-600">These metrics intentionally use only WorkOrders explicitly closed as Won or Lost in the modern Sales Pipeline. Legacy rows whose task text says “Completed Sale,” “Lost,” or “Closed” stay in Legacy History and are excluded from win-rate reporting.</p>
                <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">Closeout now requires an actual close date, Lost requires a reason, and future close dates are blocked.</div>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-gray-800">Salesperson Outcomes</div>
                <p className="mt-1 text-xs text-gray-500">Performance appears only from authoritative modern Won/Lost outcomes in the selected period.</p>
                {pipelineSummary.ownerOutcomePerformance.length === 0 ? (
                  <div className="mt-3 rounded-lg bg-gray-50 px-3 py-4 text-sm text-gray-500">No tracked salesperson outcomes yet. Current owner workload is available in the Current Pipeline → Insights view.</div>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b text-gray-400"><th className="pb-2 text-left font-medium">Salesperson</th><th className="pb-2 text-right font-medium">Closed</th><th className="pb-2 text-right font-medium">Won</th><th className="pb-2 text-right font-medium">Win rate</th><th className="pb-2 text-right font-medium">Won value</th></tr></thead>
                      <tbody>{pipelineSummary.ownerOutcomePerformance.map((row) => (
                        <tr key={row.label} className="border-b border-gray-100 last:border-0"><td className="py-2.5 font-medium text-gray-800">{row.label}</td><td className="py-2.5 text-right text-gray-600">{row.total}</td><td className="py-2.5 text-right text-emerald-700">{row.won}</td><td className="py-2.5 text-right text-gray-700">{row.winRate == null ? "—" : `${row.winRate.toFixed(1)}%`}</td><td className="py-2.5 text-right text-gray-700">{formatPipelineValue(row.wonValue)}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-gray-800">Lead Source Outcomes</div>
                <p className="mt-1 text-xs text-gray-500">Unspecified source remains visible rather than being silently excluded from conversion reporting.</p>
                {pipelineSummary.sourceOutcomePerformance.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-800">No tracked source outcomes yet. Lead source coverage is currently incomplete, so source rankings remain unavailable.</div>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b text-gray-400"><th className="pb-2 text-left font-medium">Source</th><th className="pb-2 text-right font-medium">Closed</th><th className="pb-2 text-right font-medium">Won</th><th className="pb-2 text-right font-medium">Win rate</th><th className="pb-2 text-right font-medium">Closed value</th></tr></thead>
                      <tbody>{pipelineSummary.sourceOutcomePerformance.map((row) => (
                        <tr key={row.label} className="border-b border-gray-100 last:border-0"><td className="py-2.5 font-medium text-gray-800">{row.label}</td><td className="py-2.5 text-right text-gray-600">{row.total}</td><td className="py-2.5 text-right text-emerald-700">{row.won}</td><td className="py-2.5 text-right text-gray-700">{row.winRate == null ? "—" : `${row.winRate.toFixed(1)}%`}</td><td className="py-2.5 text-right text-gray-700">{formatPipelineValue(row.closedValue)}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
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
            outcomePeriod={outcomePeriod}
            viewMode={viewMode}
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