import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { useWorkspacePreferences } from "@/components/layout/WorkspacePreferencesProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuGroup, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { DollarSign, Filter, Search, Plus, Upload, Download, History, Settings, Inbox, BriefcaseBusiness, Archive, Database, Trophy, BarChart3, AlertTriangle, CalendarClock, Wrench, ChevronDown, SlidersHorizontal, Check, X, Save, Loader2 } from "lucide-react";
import SalesPipelineSpreadsheet from "@/components/sales/SalesPipelineSpreadsheet";
import WorkOrderForm from "@/components/workflow/WorkOrderForm";
import CustomFilterDialog from "@/components/sales/CustomFilterDialog";
import BulkDuplicateCleanup from "@/components/sales/BulkDuplicateCleanup";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { SALES_PRIMARY_ATTENTION, salesAttentionOption, salesMoreAttentionSelected, salesAttentionCount, visibleSalesMoreAttentionGroups } from "@/components/sales/salesAttentionMenu.mjs";
import { loadSalesPipelinePreferencesSafely, saveSalesPipelinePreferencesSafely } from "@/components/sales/salesFilterPersistence";
import { resolveRestoredSalesFilterModes } from "@/components/sales/salesFilterPreferenceRestore.mjs";
import { hasRetiredSalesStageCondition } from "@/components/sales/salesStageTrust.mjs";

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
  taskStatusReviewCount: 0,
  legacyTaskContextCount: 0,
  taskAuditLoadedCount: 0,
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
  visibleRowCount: 0,
  loadedWorkspaceRowCount: 0,
};

export default function SalesPipeline() {
  const { isRegistered, currentUser, sessionToken } = useAuth();
  const { prefs: workspacePrefs, updatePrefs: updateWorkspacePrefs, loaded: workspacePrefsLoaded } = useWorkspacePreferences();
  const [filterStatus, setFilterStatus] = useState("all");
  const [recordScope, setRecordScope] = useState("current");
  // Personal default view — local seed applies instantly; the server value
  // lands once preferences hydrate (applied once via the loaded flag).
  const [viewMode, setViewMode] = useState(() => workspacePrefs.pipeline?.defaultView || "table");
  const viewHydratedRef = useRef(false);
  useEffect(() => {
    if (viewHydratedRef.current || !workspacePrefsLoaded) return;
    viewHydratedRef.current = true;
    const serverView = workspacePrefs.pipeline?.defaultView;
    if (serverView && serverView !== viewMode) setViewMode(serverView);
  }, [workspacePrefsLoaded, workspacePrefs.pipeline?.defaultView, viewMode]);
  const [attentionFilter, setAttentionFilter] = useState("all");
  const [outcomePeriod, setOutcomePeriod] = useState("all");
  const [pipelineSummary, setPipelineSummary] = useState(EMPTY_PIPELINE_SUMMARY);
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [showCustomFilterDialog, setShowCustomFilterDialog] = useState(false);
  const [showColumnFilterDialog, setShowColumnFilterDialog] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const [activeColumnPreset, setActiveColumnPreset] = useState(null);
  const [columnHeaderFilter, setColumnHeaderFilter] = useState(null);
  const [filterReconciliationNotice, setFilterReconciliationNotice] = useState("");
  const canImportExport = currentUser?.role === "admin" || currentUser?.can_import_export === true;
  const [showDuplicateCleanup, setShowDuplicateCleanup] = useState(false);
  const [showMoreMetrics, setShowMoreMetrics] = useState(false);
  const spreadsheetRef = useRef(null);
  const activeFiltersLoadRef = useRef(0);
  const loadActiveFiltersRef = useRef(() => Promise.resolve());
  const activeSavedDefinitionRef = useRef({ information: null, column: null });
  const preferenceSaveChainRef = useRef(Promise.resolve());
  const preferenceIdentityRef = useRef("");
  const [saveSyncState, setSaveSyncState] = useState({ busy: false, ok: null, message: "" });

  useEffect(() => {
    document.title = "Sales Pipeline - Workflow Manager";
  }, []);

  useEffect(() => {
    // Saved-filter selections and active filter preferences are user-specific.
    // Fail closed while identity/session changes so a previous user's state
    // cannot remain visible in a newly authenticated session.
    activeFiltersLoadRef.current += 1;
    preferenceIdentityRef.current = `${String(currentUser?.email || "").trim().toLowerCase()}|${String(sessionToken || "").trim()}`;
    setActiveFilters([]);
    setActiveColumnPreset(null);
    setFilterStatus("all");
    setAttentionFilter("all");
    activeSavedDefinitionRef.current = { information: null, column: null };
    setFilterReconciliationNotice("");
    setSaveSyncState({ busy: false, ok: null, message: "" });
    loadActiveFilters();
  }, [currentUser?.email, sessionToken]);

  const runSaveAndSync = async () => {
    if (saveSyncState.busy) return;
    const action = spreadsheetRef.current?.saveAndSync;
    if (typeof action !== "function") {
      setSaveSyncState({ busy: false, ok: false, message: "Sales table is not ready to save and sync yet." });
      return;
    }
    setSaveSyncState({ busy: true, ok: null, message: "" });
    try {
      const result = await action();
      setSaveSyncState({
        busy: false,
        ok: result?.ok === true,
        message: result?.message || (result?.ok ? "Sales changes are synchronized." : "Sales sync could not be verified."),
      });
    } catch (error) {
      setSaveSyncState({ busy: false, ok: false, message: error?.message || "Sales Save & Sync could not be completed." });
    }
  };

  const loadActiveFilters = async () => {
    const requestId = ++activeFiltersLoadRef.current;
    const userEmail = currentUser?.email?.toLowerCase() || "";
    if (!userEmail || !sessionToken) {
      setActiveFilters([]);
      setActiveColumnPreset(null);
      setFilterStatus("all");
      setAttentionFilter("all");
      return;
    }
    const SalesFilter = base44.entities.SalesFilter;
    let allFilters;
    let preferences;
    try {
      [allFilters, preferences] = await Promise.all([
        loadAllEntityRows({ entity: SalesFilter, sort: null, label: "Sales Pipeline saved filters" }),
        loadSalesPipelinePreferencesSafely({ sessionToken, label: "Sales Pipeline filter preferences" }),
      ]);
    } catch (error) {
      if (requestId === activeFiltersLoadRef.current) {
        console.warn("Could not refresh Sales Pipeline saved filters; keeping the current visible state:", error);
      }
      return;
    }
    if (requestId !== activeFiltersLoadRef.current) return;
    const selected = allFilters.filter(f => f.selected_by?.some(email => email?.toLowerCase() === userEmail));
    // Keep obsolete saved definitions available for editing, not as active filters.
    const availableSelected = selected.filter(f => f.type !== "filter" || !hasRetiredSalesStageCondition(f.conditions));
    setActiveFilters(availableSelected);

    const savedInformation = String(preferences?.information_filter || "all");
    const savedCustomFilterId = savedInformation.startsWith("custom_")
      ? savedInformation.slice("custom_".length)
      : "";
    const savedCustomFilter = savedCustomFilterId
      ? availableSelected.find((filter) => filter.type === "filter" && filter.id === savedCustomFilterId) || null
      : null;
    const missingInformationReference = Boolean(savedCustomFilterId && !savedCustomFilter);
    const retiredInformationPreference = savedInformation === "needs_stage" ||
      Boolean(savedCustomFilterId && selected.some((filter) => filter.id === savedCustomFilterId && hasRetiredSalesStageCondition(filter.conditions)));
    const restoredInformation = savedCustomFilterId
      ? (savedCustomFilter ? savedInformation : "all")
      : (["all", "lead", "quoted", "follow_up", "on_hold"].includes(savedInformation) ? savedInformation : "all");
    const savedAttention = String(preferences?.attention_filter || "all");
    const restoredAttention = salesAttentionOption(savedAttention) ? savedAttention : "all";
    const savedColumnId = String(preferences?.column_preset_id || "default");
    const restoredColumn = savedColumnId === "default"
      ? null
      : selected.find((filter) => filter.type === "column_preset" && filter.id === savedColumnId) || null;
    const missingColumnReference = savedColumnId !== "default" && !restoredColumn;

    const previousDefinitions = activeSavedDefinitionRef.current;
    const nextInformationDefinition = savedCustomFilter
      ? {
          id: savedCustomFilter.id,
          name: String(savedCustomFilter.name || ""),
          conditions: JSON.stringify(savedCustomFilter.conditions || []),
        }
      : null;
    const nextColumnDefinition = restoredColumn
      ? {
          id: restoredColumn.id,
          name: String(restoredColumn.name || ""),
          layout: JSON.stringify(restoredColumn.column_settings || []),
        }
      : null;
    let liveDefinitionNotice = "";
    if (
      previousDefinitions.information?.id &&
      previousDefinitions.information.id === nextInformationDefinition?.id
    ) {
      if (previousDefinitions.information.conditions !== nextInformationDefinition.conditions) {
        liveDefinitionNotice = "The active saved Information Filter was updated. Rows were re-evaluated.";
      } else if (previousDefinitions.information.name !== nextInformationDefinition.name) {
        liveDefinitionNotice = `The active saved Information Filter was renamed to “${nextInformationDefinition.name}”.`;
      }
    }
    if (
      previousDefinitions.column?.id &&
      previousDefinitions.column.id === nextColumnDefinition?.id
    ) {
      const columnNotice = previousDefinitions.column.layout !== nextColumnDefinition.layout
        ? "The active saved Column Filter was updated. The table layout was refreshed."
        : (previousDefinitions.column.name !== nextColumnDefinition.name
          ? `The active saved Column Filter was renamed to “${nextColumnDefinition.name}”.`
          : "");
      if (columnNotice) liveDefinitionNotice = liveDefinitionNotice
        ? `${liveDefinitionNotice} ${columnNotice}`
        : columnNotice;
    }
    activeSavedDefinitionRef.current = {
      information: nextInformationDefinition,
      column: nextColumnDefinition,
    };

    // Before Information/Attention became mutually exclusive, Attention saves
    // always wrote Information=all, while Information saves could leave the
    // previous Attention value behind. Therefore, a legacy record where both
    // validated modes are active means the Information choice is newer and the
    // Attention value is stale.
    const restoredModes = resolveRestoredSalesFilterModes(restoredInformation, restoredAttention);
    const hasLegacyFilterConflict = restoredModes.hadConflict;

    setFilterStatus(restoredModes.informationFilter);
    setAttentionFilter(restoredModes.attentionFilter);
    setActiveColumnPreset(restoredColumn);
    if (retiredInformationPreference) {
      setFilterReconciliationNotice("A retired Sales stage filter was reset to All Statuses. Custom filter definitions remain available in Manage Filters for editing.");
    } else if (missingInformationReference && missingColumnReference) {
      setFilterReconciliationNotice("A saved Information Filter and Column Filter are no longer available. Both were reset.");
    } else if (missingInformationReference) {
      setFilterReconciliationNotice("The active saved Information Filter is no longer available. Showing All Statuses.");
    } else if (missingColumnReference) {
      setFilterReconciliationNotice("The active saved Column Filter is no longer available. Showing Default View.");
    } else if (liveDefinitionNotice) {
      setFilterReconciliationNotice(liveDefinitionNotice);
    }

    if (hasLegacyFilterConflict || missingInformationReference || missingColumnReference || retiredInformationPreference) {
      const repairIdentity = preferenceIdentityRef.current;
      const repairSessionToken = sessionToken;
      const expectedPreferences = {
        information_filter: savedInformation,
        attention_filter: savedAttention,
        column_preset_id: savedColumnId,
      };
      const repairedPreferences = {
        information_filter: restoredModes.informationFilter,
        attention_filter: restoredModes.attentionFilter,
        column_preset_id: restoredColumn?.id || "default",
      };
      preferenceSaveChainRef.current = preferenceSaveChainRef.current
        .catch(() => undefined)
        .then(() => {
          if (preferenceIdentityRef.current !== repairIdentity) return undefined;
          return saveSalesPipelinePreferencesSafely({
            sessionToken: repairSessionToken,
            preferences: repairedPreferences,
            expectedPreferences,
            label: "Sales Pipeline filter preference repair",
          });
        })
        .catch((error) => {
          if (preferenceIdentityRef.current === repairIdentity) {
            console.warn("Could not safely repair Sales Pipeline filter preferences:", error);
          }
        });
    }
  };

  loadActiveFiltersRef.current = loadActiveFilters;

  useEffect(() => {
    if (!currentUser?.email || !sessionToken) return undefined;
    const SalesFilter = base44.entities.SalesFilter;
    let disposed = false;
    let refreshTimer = null;

    let unsubscribe = null;
    try {
      unsubscribe = SalesFilter.subscribe(() => {
        if (disposed || refreshTimer !== null) return;
        refreshTimer = window.setTimeout(() => {
          refreshTimer = null;
          if (disposed) return;
          Promise.resolve(loadActiveFiltersRef.current()).catch((error) => {
            console.warn("Could not refresh Sales saved filters after a live change:", error);
          });
        }, 75);
      });
    } catch (error) {
      console.warn("Could not subscribe to live Sales saved-filter changes:", error);
    }

    return () => {
      disposed = true;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [currentUser?.email, sessionToken]);

  const persistFilterPreferences = ({
    informationFilter = filterStatus,
    attention = attentionFilter,
    columnPresetId = activeColumnPreset?.id || "default",
  } = {}) => {
    if (!sessionToken || !currentUser?.email) return;
    const preferences = {
      information_filter: informationFilter,
      attention_filter: attention,
      column_preset_id: columnPresetId,
    };
    const queuedIdentity = `${String(currentUser.email).trim().toLowerCase()}|${String(sessionToken).trim()}`;
    const queuedSessionToken = sessionToken;
    preferenceSaveChainRef.current = preferenceSaveChainRef.current
      .catch(() => undefined)
      .then(() => {
        if (preferenceIdentityRef.current !== queuedIdentity) return undefined;
        return saveSalesPipelinePreferencesSafely({
          sessionToken: queuedSessionToken,
          preferences,
          label: "Sales Pipeline filter preferences",
        });
      })
      .catch((error) => {
        console.error("Could not save Sales Pipeline filter preferences:", error);
      });
  };

  const isStandardFilterEnabled = (value) => {
    const key = `sales_standard_${value}_selected`;
    const stored = localStorage.getItem(key);
    return stored === null ? true : stored === "true";
  };

  const applyAttentionFilter = (value) => {
    setFilterReconciliationNotice("");
    setAttentionFilter(value);
    setFilterStatus("all");
    persistFilterPreferences({ informationFilter: "all", attention: value });
  };

  const applyInformationFilter = (value) => {
    setFilterReconciliationNotice("");
    setFilterStatus(value);
    setAttentionFilter("all");
    persistFilterPreferences({ informationFilter: value, attention: "all" });
  };

  const resetMetricDrilldownCriteria = () => {
    setSearchTerm("");
    setColumnHeaderFilter(null);
    spreadsheetRef.current?.clearColumnHeaderFilter?.();
  };

  const applyMetricAttentionFilter = (value) => {
    resetMetricDrilldownCriteria();
    applyAttentionFilter(value);
  };

  const applyOutcomeMetricFilter = (status) => {
    resetMetricDrilldownCriteria();
    setAttentionFilter("all");
    setFilterStatus(status);
    persistFilterPreferences({ informationFilter: status, attention: "all" });
  };

  const clearActiveFilters = () => {
    setFilterReconciliationNotice("");
    setSearchTerm("");
    setAttentionFilter("all");
    setFilterStatus("all");
    spreadsheetRef.current?.clearColumnHeaderFilter?.();
    persistFilterPreferences({ informationFilter: "all", attention: "all" });
  };

  const chooseView = (nextView) => {
    // Board is an alternate visualization of the same working set, so it keeps
    // the current row filters. Daily/Insights are specialized views and must
    // not inherit stale Table search criteria. Daily also must not inherit a
    // table-header-only filter that can hide operational follow-up work.
    if (nextView === "daily" || nextView === "insights") setSearchTerm("");
    if (nextView === "daily") spreadsheetRef.current?.clearColumnHeaderFilter?.();
    setViewMode(nextView);
    updateWorkspacePrefs("pipeline.defaultView", nextView);
    if (nextView === "daily" || nextView === "insights") {
      setAttentionFilter("all");
      setFilterStatus("all");
    }
  };

  const formatPipelineValue = (value) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);

  const quickAttentionVisible = !showDuplicateCleanup && !["insights", "daily"].includes(viewMode) &&
    (recordScope === "current" || recordScope === "all");
  const moreAttentionSelected = salesMoreAttentionSelected(attentionFilter);
  const selectedMoreAttention = moreAttentionSelected ? salesAttentionOption(attentionFilter) : null;
  const hasActiveFilters = Boolean(searchTerm.trim()) || attentionFilter !== "all" || filterStatus !== "all" || Boolean(columnHeaderFilter);
  const secondaryMetricLabel = ["quote_no_followup", "no_next_action", "near_close", "stale"].includes(attentionFilter)
    ? salesAttentionOption(attentionFilter)?.label : null;

  return (
    <div className="flex flex-col p-2 sm:p-3" style={{ height: '100%', overflow: 'hidden' }}>
      <div className="w-full max-w-[99%] mx-auto flex flex-col min-h-0" style={{ flex: 1, minHeight: 0 }}>
        <section aria-label="Sales Pipeline navigation" className="mb-2 rounded-lg border border-slate-200 bg-white/90 p-2 shadow-sm">
          <div className="grid min-w-0 grid-cols-12 items-center gap-2 sm:flex sm:flex-wrap">
            <div className={`order-1 flex min-w-0 items-center gap-1.5 sm:mr-1 sm:shrink-0 ${isRegistered || showDuplicateCleanup ? "col-span-7" : "col-span-12"}`}>
              <DollarSign className="h-4 w-4 shrink-0 text-green-600 sm:h-5 sm:w-5" aria-hidden="true" />
              <h1 className="min-w-0 truncate text-sm font-bold text-gray-800 sm:text-lg" title="Sales Pipeline">Sales Pipeline</h1>
            </div>
            <div className={`order-3 flex min-w-0 items-center sm:order-2 ${recordScope === "history" ? "col-span-12" : "col-span-7"}`}>
              <span className="sr-only">Workspace</span>
              <Select value={recordScope} onValueChange={(value) => {
                setRecordScope(value);
                setFilterReconciliationNotice("");
                setSearchTerm("");
                setAttentionFilter("all");
                setFilterStatus("all");
                setColumnHeaderFilter(null);
                if (value === "history" || value === "outcomes" || (value !== "current" && ["insights", "daily"].includes(viewMode))) setViewMode("table");
              }}>
                <SelectTrigger aria-label="Workspace" className="h-11 w-full min-w-0 text-xs sm:h-9 sm:w-[156px]">
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
              <div className="order-4 hidden shrink-0 items-center sm:order-3 sm:flex">
                <span className="sr-only">View</span>
                <div role="group" aria-label="View" className="flex h-9 overflow-hidden rounded-md border border-gray-200 bg-white">
                  <button type="button" onClick={() => chooseView("table")} aria-pressed={viewMode === "table"} className={`px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${viewMode === "table" ? "bg-slate-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}>Table</button>
                  <button type="button" onClick={() => chooseView("board")} aria-pressed={viewMode === "board"} className={`border-l border-gray-200 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${viewMode === "board" ? "bg-slate-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}>Board</button>
                  {recordScope === "current" && <button type="button" onClick={() => chooseView("daily")} aria-pressed={viewMode === "daily"} className={`border-l border-gray-200 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${viewMode === "daily" ? "bg-slate-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}><span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />Daily</span></button>}
                  {recordScope === "current" && <button type="button" onClick={() => chooseView("insights")} aria-pressed={viewMode === "insights"} className={`border-l border-gray-200 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${viewMode === "insights" ? "bg-slate-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}><span className="flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" />Insights</span></button>}
                </div>
              </div>
            )}

            {recordScope !== "history" && recordScope !== "outcomes" && (
              <Select value={viewMode} onValueChange={chooseView}>
                <SelectTrigger aria-label="Pipeline view" className="order-4 col-span-5 h-11 w-full min-w-0 text-xs sm:hidden">
                  <SelectValue placeholder="View" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="table">Table</SelectItem>
                  <SelectItem value="board">Board</SelectItem>
                  {recordScope === "current" && <SelectItem value="daily">Daily</SelectItem>}
                  {recordScope === "current" && <SelectItem value="insights">Insights</SelectItem>}
                </SelectContent>
              </Select>
            )}

            {recordScope === "outcomes" && (
              <div className="order-4 col-span-5 flex min-w-0 items-center sm:order-3">
                <span className="sr-only">Outcome Period</span>
                <Select value={outcomePeriod} onValueChange={setOutcomePeriod}>
                  <SelectTrigger aria-label="Outcome Period" className="h-11 w-full min-w-0 text-xs sm:h-9 sm:w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tracked</SelectItem>
                    <SelectItem value="30">Last 30 Days</SelectItem>
                    <SelectItem value="90">Last 90 Days</SelectItem>
                    <SelectItem value="365">Last 12 Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="order-5 col-span-8 flex min-w-0 items-center sm:order-4 sm:min-w-[220px] sm:flex-1">
              <span className="sr-only">Search</span>
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Customer, contact, estimate, address..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search sales pipeline"
                  className="h-11 w-full pl-9 text-xs sm:h-9"
                />
              </div>
            </div>

            {isRegistered && !showDuplicateCleanup && (
              <Button
                type="button"
                onClick={runSaveAndSync}
                disabled={saveSyncState.busy}
                className="order-2 col-span-3 h-11 min-w-0 shrink-0 whitespace-nowrap px-2 text-xs sm:order-5 sm:h-9 sm:w-auto sm:px-3"
                variant="outline"
                title="Save pending Sales edits in Base44, then sync those exact WorkOrders to Smartsheet now"
              >
                {saveSyncState.busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                <span className="sm:hidden">{saveSyncState.busy ? "Syncing" : "Save"}</span>
                <span className="hidden sm:inline">{saveSyncState.busy ? "Saving & Syncing..." : "Save & Sync"}</span>
              </Button>
            )}

            {isRegistered && !showDuplicateCleanup && (
              <Button
                type="button"
                onClick={() => setShowNewClientForm(true)}
                className="clay-button order-2 col-span-5 h-11 min-w-0 shrink-0 whitespace-nowrap border-none px-2 text-xs text-gray-800 sm:order-6 sm:h-9 sm:w-auto sm:px-3"
                style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
              >
                <Plus className="mr-1.5 h-4 w-4" /> New Client
              </Button>
            )}
            {showDuplicateCleanup && (
              <Button type="button" variant="outline" className="order-2 col-span-5 h-11 min-w-0 border-green-300 bg-green-50 px-2 text-xs text-green-900 sm:order-6 sm:h-9"
                onClick={() => setShowDuplicateCleanup(false)}>
                Return to Pipeline
              </Button>
            )}
            <div className="order-6 col-span-4 flex min-w-0 justify-end sm:order-7">
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="h-11 shrink-0 gap-1 px-1.5 text-xs sm:h-9 sm:gap-1.5 sm:px-3" aria-label="Sales Pipeline tools" title="Sales Pipeline tools">
                  <Wrench className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" /> <span>Tools</span> <ChevronDown className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {canImportExport && !showDuplicateCleanup && (
                  <>
                    <DropdownMenuItem onSelect={() => spreadsheetRef.current?.importFromExcel()}>
                      <Upload className="h-4 w-4" /> Import Sales Pipeline
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => spreadsheetRef.current?.exportToExcel()}>
                      <Download className="h-4 w-4" /> Export Sales Pipeline
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => spreadsheetRef.current?.openImportHistory()}>
                      <History className="h-4 w-4" /> Import History
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onSelect={() => setShowDuplicateCleanup((open) => !open)}>
                  <Inbox className="h-4 w-4" /> {showDuplicateCleanup ? "Return to Pipeline" : "Duplicate Cleanup"}
                </DropdownMenuItem>
              </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="mt-2 grid min-w-0 grid-cols-2 items-start gap-2 border-t border-slate-100 pt-2 sm:flex sm:flex-wrap sm:items-center" aria-label="Sales Pipeline filters and column layouts">
            {quickAttentionVisible && (
              <div className="col-span-2 grid min-w-0 grid-cols-2 items-stretch gap-1.5 sm:flex sm:flex-wrap sm:items-center" role="group" aria-label="Quick Sales attention filters">
                {SALES_PRIMARY_ATTENTION.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={attentionFilter === option.key}
                    onClick={() => applyAttentionFilter(option.key)}
                    className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-9 sm:justify-start sm:px-2.5 ${
                      attentionFilter === option.key
                        ? "border-slate-700 bg-slate-800 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {option.key === "needs_attention" && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                    {option.label}
                    {option.key !== "all" && salesAttentionCount(pipelineSummary, option.key) > 0 && (
                      <span className={`rounded px-1 text-[10px] tabular-nums ${attentionFilter === option.key ? "bg-slate-600 text-white" : "bg-slate-100 text-slate-700"}`}>
                        {salesAttentionCount(pipelineSummary, option.key)}
                      </span>
                    )}
                  </button>
                ))}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline"
                      aria-label={selectedMoreAttention ? `More filters, selected: ${selectedMoreAttention.label}` : "More Sales attention filters"}
                      title={selectedMoreAttention?.label || "All other Sales attention filters"}
                      className={`h-11 min-w-0 max-w-full justify-center gap-1.5 px-2 text-xs sm:h-9 sm:justify-start sm:px-2.5 ${moreAttentionSelected ? "border-blue-400 bg-blue-50 text-blue-800" : "border-slate-200"}`}>
                      <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="max-w-[160px] truncate">{selectedMoreAttention ? `More: ${selectedMoreAttention.label}` : "More Filters"}</span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-[65vh] w-[min(92vw,280px)] overflow-y-auto">
                    {visibleSalesMoreAttentionGroups(pipelineSummary, attentionFilter).map((group, index) => (
                      <DropdownMenuGroup key={group.label}>
                        {index > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{group.label}</DropdownMenuLabel>
                        {group.items.map((option) => (
                          <DropdownMenuItem key={option.key}
                            onSelect={() => applyAttentionFilter(option.key)}
                            aria-current={attentionFilter === option.key ? "true" : undefined}
                            className={attentionFilter === option.key ? "bg-blue-50 text-blue-800" : ""}>
                            <span className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="w-3.5 shrink-0">{attentionFilter === option.key && <Check className="h-3.5 w-3.5" aria-hidden="true" />}</span>
                              <span className="min-w-0 flex-1">{option.label}</span>
                              <span className="ml-auto text-xs tabular-nums text-slate-500">{salesAttentionCount(pipelineSummary, option.key)}</span>
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {hasActiveFilters && (
                  <button type="button" onClick={clearActiveFilters}
                    className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-9 sm:justify-start"
                    aria-label="Clear active Sales search, information, attention, and table column filters">
                    <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters
                  </button>
                )}
              </div>
            )}
            <div className="min-w-0">
              <span className="sr-only">Information Filters</span>
              <Select value={filterStatus} onValueChange={(value) => {
                if (value === "manage_filters") {
                  setShowCustomFilterDialog(true);
                } else {
                  applyInformationFilter(value);
                }
              }}>
                <SelectTrigger aria-label="Information Filters" className="h-11 w-full min-w-0 text-xs sm:h-9 sm:w-40">
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

            <div className="min-w-0">
              <span className="sr-only">Column Filters</span>
              <Select 
              value={activeColumnPreset?.id || "default"} 
              onValueChange={(value) => {
                if (value === "manage_columns") {
                  setShowColumnFilterDialog(true);
                } else if (value === "default") {
                  setFilterReconciliationNotice("");
                  setActiveColumnPreset(null);
                  persistFilterPreferences({ columnPresetId: "default" });
                } else if (value) {
                  const preset = activeFilters.find(f => f.id === value);
                  setFilterReconciliationNotice("");
                  setActiveColumnPreset(preset || null);
                  if (preset?.type === "column_preset") persistFilterPreferences({ columnPresetId: preset.id });
                }
              }}
            >
              <SelectTrigger aria-label="Column Filters" className="h-11 w-full min-w-0 text-xs sm:h-9 sm:w-40">
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

            {columnHeaderFilter && (
              <button
                type="button"
                onClick={() => spreadsheetRef.current?.clearColumnHeaderFilter?.()}
                title={`Active table column filter: ${columnHeaderFilter.label} · ${columnHeaderFilter.detail}. Click to clear this filter without changing the sort.`}
                aria-label={`Clear table column filter on ${columnHeaderFilter.label}: ${columnHeaderFilter.detail}`}
                className="col-span-2 inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-900 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:col-span-1 sm:min-h-9 sm:max-w-[260px] sm:justify-start"
              >
                <Filter className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">Table: {columnHeaderFilter.label} · {columnHeaderFilter.detail}</span>
                <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </button>
            )}
            
          </div>
          {filterReconciliationNotice && !showDuplicateCleanup && (
            <div
              role="status"
              aria-label="Sales saved filter changed"
              className="mt-2 flex min-h-10 items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900"
            >
              <span className="min-w-0">{filterReconciliationNotice}</span>
              <button
                type="button"
                onClick={() => setFilterReconciliationNotice("")}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                aria-label="Dismiss saved filter change notice"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
          {saveSyncState.message && !showDuplicateCleanup && (
            <div
              role={saveSyncState.ok === false ? "alert" : "status"}
              className={`mt-2 rounded-md border px-2.5 py-1.5 text-xs ${saveSyncState.ok === false ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
            >
              {saveSyncState.message}
            </div>
          )}
        </section>

        {!showDuplicateCleanup && !["insights", "daily"].includes(viewMode) && (
          <div
            role="status"
            aria-label="Sales Pipeline visible row count"
            className="mb-1 flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-slate-50/80 px-2.5 py-1 text-[11px] text-slate-600"
          >
            <span className="font-semibold text-slate-700">
              Rows: {pipelineSummary.visibleRowCount} shown · {pipelineSummary.loadedWorkspaceRowCount} loaded
            </span>
            {(recordScope === "current" || recordScope === "all" || recordScope === "outcomes") && (
              <span>Metrics use workspace totals · metric clicks start a fresh row drill-down.</span>
            )}
          </div>
        )}

        {!showDuplicateCleanup && !["insights", "daily"].includes(viewMode) && (recordScope === "current" || recordScope === "all") && (
          <section aria-label="Sales Pipeline overview" className="mb-1 space-y-1">
            <div className="flex min-h-7 items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Workspace pipeline metrics</span>
              <button type="button" id="sales-more-metrics-toggle"
                aria-expanded={showMoreMetrics}
                aria-controls="sales-secondary-metrics"
                onClick={() => setShowMoreMetrics((open) => !open)}
                className={`inline-flex min-h-10 max-w-[65%] items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-8 ${secondaryMetricLabel ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                <span className="truncate">{showMoreMetrics ? "Fewer Metrics" : secondaryMetricLabel ? `More Metrics · ${secondaryMetricLabel}` : "More Metrics"}</span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${showMoreMetrics ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-1.5 pb-0.5 md:grid-cols-4" title="Four primary Sales metrics displayed together, including on phones.">
              <button type="button" title={`${Math.max(0, pipelineSummary.openCount - pipelineSummary.placeholderCount)} non-test · ${pipelineSummary.placeholderCount} test · ${pipelineSummary.assignedOwnerCount} owned · ${pipelineSummary.unassignedOwnerCount} unassigned`} onClick={() => applyMetricAttentionFilter("all")} className="min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-left shadow-sm transition hover:border-slate-300 hover:shadow">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">Open Opportunities</span>
                  <span className="shrink-0 text-base font-bold leading-none text-slate-900">{pipelineSummary.openCount}</span>
                </div>
              </button>
              <button type="button" title={`Estimate Amount total. ${formatPipelineValue(Math.max(0, pipelineSummary.openValue - pipelineSummary.placeholderValue))} non-test · ${formatPipelineValue(pipelineSummary.placeholderValue)} test.`} onClick={() => applyMetricAttentionFilter("all")} className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1 text-left shadow-sm transition hover:border-emerald-300">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Open Pipeline Value</span>
                  <span className="shrink-0 text-base font-bold leading-none text-emerald-900">{formatPipelineValue(pipelineSummary.openValue)}</span>
                </div>
              </button>
              <button type="button" title={`${pipelineSummary.overdueCount} overdue · ${pipelineSummary.dueTodayCount} due today`} onClick={() => applyMetricAttentionFilter("due")} className={`min-w-0 rounded-md border px-2 py-1 text-left shadow-sm transition ${attentionFilter === "due" ? "border-red-400 bg-red-50" : "border-red-200 bg-white hover:border-red-300"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-red-600">Follow-ups Due</span>
                  <span className="shrink-0 text-base font-bold leading-none text-red-800">{pipelineSummary.dueCount}</span>
                </div>
              </button>
              <button type="button"
                title={`${pipelineSummary.needsAttentionCount} of ${pipelineSummary.openCount} active opportunities need attention, using existing Sales attention rules.`}
                aria-pressed={attentionFilter === "needs_attention"}
                onClick={() => applyMetricAttentionFilter("needs_attention")}
                className={`min-w-0 rounded-md border px-2 py-1 text-left shadow-sm transition ${attentionFilter === "needs_attention" ? "border-amber-400 bg-amber-50" : "border-amber-200 bg-white hover:border-amber-300"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-amber-700">Needs Attention</span>
                  <span className="shrink-0 text-base font-bold leading-none text-amber-900">{pipelineSummary.needsAttentionCount}</span>
                </div>
              </button>
            </div>
            <div id="sales-secondary-metrics" aria-labelledby="sales-more-metrics-toggle"
              className={showMoreMetrics ? "grid min-w-0 grid-cols-2 gap-1.5 pb-0.5 md:grid-cols-4" : "hidden"}>
              <button type="button" title={`${pipelineSummary.quoteAwaitingResponseCount} awaiting response · ${pipelineSummary.quoteTimingMissingCount} missing trusted quote timing`} onClick={() => applyMetricAttentionFilter("quote_no_followup")} className={`min-w-0 rounded-md border px-2 py-1 text-left shadow-sm transition ${attentionFilter === "quote_no_followup" ? "border-amber-400 bg-amber-50" : "border-amber-200 bg-white hover:border-amber-300"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-amber-700">Quotes Need Follow-up</span>
                  <span className="shrink-0 text-base font-bold leading-none text-amber-900">{pipelineSummary.quoteNoFollowUpCount}</span>
                </div>
              </button>
              <button type="button" title={`${pipelineSummary.noNextActionCount} opportunities missing a next action${pipelineSummary.noNextActionCount > 0 ? " · click to review" : ""}.`} onClick={() => applyMetricAttentionFilter(pipelineSummary.noNextActionCount > 0 ? "no_next_action" : "all")} className={`min-w-0 rounded-md border px-2 py-1 text-left shadow-sm transition ${attentionFilter === "no_next_action" ? "border-violet-400 bg-violet-50" : "border-violet-200 bg-white hover:border-violet-300"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-violet-700">Next Action Coverage</span>
                  <span className="shrink-0 text-base font-bold leading-none text-violet-900">{pipelineSummary.nextActionCoverageCount}/{pipelineSummary.openCount}</span>
                </div>
              </button>
              <button type="button" title="Based only on explicit expected close dates." onClick={() => applyMetricAttentionFilter("near_close")} className={`min-w-0 rounded-md border px-2 py-1 text-left shadow-sm transition ${attentionFilter === "near_close" ? "border-cyan-400 bg-cyan-50" : "border-cyan-200 bg-white hover:border-cyan-300"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-cyan-700">Closing Next 14 Days</span>
                  <span className="shrink-0 text-base font-bold leading-none text-cyan-900">{pipelineSummary.nearCloseCount}</span>
                </div>
              </button>
              <button type="button" title="Staleness uses verified sales-specific activity only." onClick={() => applyMetricAttentionFilter("stale")} className={`min-w-0 rounded-md border px-2 py-1 text-left shadow-sm transition ${attentionFilter === "stale" ? "border-rose-400 bg-rose-50" : "border-rose-200 bg-white hover:border-rose-300"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-rose-700">Stale 14+ Days</span>
                  <span className="shrink-0 text-base font-bold leading-none text-rose-900">{pipelineSummary.staleCount}</span>
                </div>
              </button>
            </div>
          </section>
        )}

        {!showDuplicateCleanup && recordScope === "outcomes" && (
          <div className="mb-3 space-y-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              <button type="button" onClick={() => applyOutcomeMetricFilter("all")} className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow">
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Tracked Outcomes</div>
                <div className="mt-0.5 text-xl font-bold leading-tight text-slate-900">{pipelineSummary.trackedOutcomeCount}</div>
                <div className="mt-1 text-xs text-slate-500">{outcomePeriod === "all" ? "All authoritative modern outcomes" : `${pipelineSummary.totalTrackedOutcomeCount} tracked across all dates`}</div>
              </button>
              <button type="button" onClick={() => applyOutcomeMetricFilter("won")} className={`rounded-xl border p-3 text-left shadow-sm transition ${filterStatus === "won" ? "border-emerald-400 bg-emerald-50" : "border-emerald-200 bg-white hover:border-emerald-300"}`}>
                <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-700">Won</div>
                <div className="mt-0.5 text-xl font-bold leading-tight text-emerald-900">{pipelineSummary.wonCount}</div>
                <div className="mt-1 text-xs text-emerald-700/80">{formatPipelineValue(pipelineSummary.wonValue)} won value</div>
              </button>
              <button type="button" onClick={() => applyOutcomeMetricFilter("lost")} className={`rounded-xl border p-3 text-left shadow-sm transition ${filterStatus === "lost" ? "border-red-400 bg-red-50" : "border-red-200 bg-white hover:border-red-300"}`}>
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

        {showDuplicateCleanup ? (
          <div className="clay-card p-4 overflow-auto flex flex-col" style={{ flex: 1, minHeight: 0 }}>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <Inbox className="w-5 h-5 text-orange-600 flex-shrink-0" />
              <h2 className="text-lg font-bold text-gray-800">Bulk Duplicate Cleanup</h2>
            </div>
            <BulkDuplicateCleanup />
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
            onColumnHeaderFilterChange={setColumnHeaderFilter}
            showButtonsInline={false}
            activeColumnPreset={activeColumnPreset}
            customFilters={activeFilters.filter(f => f.type === "filter")}
            canImportExport={canImportExport}
          />
        )}
      </div>

      {showNewClientForm && (
        <WorkOrderForm
          isOpen={showNewClientForm}
          onClose={() => setShowNewClientForm(false)}
          onSave={async (data) => {
            // Duplicate Cleanup unmounts the spreadsheet. Never silently close
            // a completed form when the destination has become unavailable.
            const spreadsheet = spreadsheetRef.current;
            if (typeof spreadsheet?.handleCreateFromForm !== "function") {
              throw new Error("Return to the Sales Pipeline before saving this client. Your form entries have been kept.");
            }
            await spreadsheet.handleCreateFromForm(data);
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