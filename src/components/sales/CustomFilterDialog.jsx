import { useState, useEffect, useCallback, useReducer, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";

const GlobalSettings = base44.entities.GlobalSettings;
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, Pencil, Copy, Users, X, Undo2, Redo2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { createSalesFilterIfAbsent, createUniqueSalesFilterCopy, deleteSalesFilterIfUnchanged, setSalesFilterSelectionSafely, updateSalesFilterIfUnchanged } from "@/components/sales/salesFilterPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import { SALES_TABLE_COLUMNS, getSalesColumnLayout, normalizeSalesColumnSettings, preserveLegacySalesColumnEntries, getUnavailableSalesColumns } from "@/components/sales/salesColumnCatalog.mjs";
import { newSalesColumnDraft, salesColumnDraftReducer, salesEditorSnapshot, salesEditorHasChanges, salesColumnSettingsEqual, SALES_ESSENTIAL_COLUMN_IDS } from "@/components/sales/salesColumnEditorDraft.mjs";
import { salesPersonUsersForRole } from "@/components/sales/salesPersonIdentity.mjs";

const FILTER_FIELDS = [
  { value: "client_name", label: "Customer", type: "text" },
  { value: "lead_source", label: "Source", type: "localStorage", storageKey: "salesLeadSources" },
  { value: "sales_rep", label: "Salesperson / Owner", type: "user" },
  { value: "current_task_assigned_to", label: "Task Assigned To", type: "user", role: "Task Assigned" },
  { value: "designer", label: "Designer", type: "user", role: "Designer" },
  { value: "project_manager", label: "Project Manager", type: "user", role: "PM" },
  { value: "estimator", label: "Estimator", type: "user", role: "Estimator" },
  { value: "sales_status", label: "Status", type: "select", options: ["lead", "quoted", "follow_up", "won", "lost", "on_hold"] },
  { value: "sales_stage_changed_at", label: "Stage Changed At", type: "date" },
  { value: "project_type", label: "Project Type", type: "localStorage", storageKey: "salesProjectTypes" },
  { value: "estimate_amount", label: "Estimate Amount", type: "number" },
  { value: "title", label: "Notes", type: "text" },
  { value: "current_task_description", label: "Task Description", type: "localStorage", storageKey: "salesTaskDescriptions" },
  { value: "current_task_deadline", label: "Task Deadline", type: "date" },
  { value: "date_initial_contact", label: "Initial Contact Date", type: "date" },
  { value: "site_survey_date", label: "Site Survey Date", type: "date" },
  { value: "date_estimate_sent", label: "Estimate Sent Date", type: "date" },
  { value: "date_order_created", label: "Order Created Date", type: "date" },
  { value: "project_install_date", label: "Install Date", type: "date" },
  { value: "permit_submitted_date", label: "Permit Submitted Date", type: "date" },
  { value: "permit_receipt_confirmed_date", label: "Permit Confirmed Date", type: "date" },
  { value: "permit_number", label: "Permit Number", type: "text" },
  { value: "permit_approved_date", label: "Permit Approved Date", type: "date" },
  { value: "follow_up_date", label: "Follow Up Date", type: "date" },
  { value: "sales_last_follow_up_completed_at", label: "Last Follow Up Completed", type: "date" },
  { value: "sales_last_follow_up_outcome", label: "Last Follow Up Outcome", type: "text" },
  { value: "expected_close_date", label: "Expected Close Date", type: "date" },
  { value: "close_date", label: "Close Date", type: "date" },
  { value: "lost_reason", label: "Lost Reason", type: "text" },
  { value: "start_date", label: "Start Date", type: "date" },
  { value: "est_inv_at", label: "Est/Inv Location", type: "text" },
  { value: "corbridge_invoice_number", label: "Corbridge Invoice #", type: "text" },
  { value: "corbridge_link", label: "Corbridge Link", type: "text" }
];

const OPERATORS = [
  { value: "is", label: "Is" },
  { value: "is_not", label: "Is Not" },
  { value: "is_one_of", label: "Is One Of" },
  { value: "is_not_one_of", label: "Is Not One Of" },
  { value: "equals", label: "Equals" },
  { value: "contains", label: "Contains" },
  { value: "greater_than", label: "Greater Than" },
  { value: "less_than", label: "Less Than" },
  { value: "not_empty", label: "Is Not Empty" },
  { value: "empty", label: "Is Empty" }
];

const ALL_COLUMNS = SALES_TABLE_COLUMNS;

// Static illustration only. Never fetch or display actual customer data in the preset editor.
const SALES_COLUMN_PREVIEW_SAMPLE = Object.freeze({
  client_name: "Example Customer", sales_status: "Lead", stage_age: "8d", sales_rep: "Brett",
  description: "Monument sign", lead_source: "Web", current_task_deadline: "09/29/26",
  current_task_assigned_to: "Carl", designer: "John", project_manager: "Sarah",
  estimator: "Mike", est_inv_at: "14568", estimate_amount: "$5,000",
  current_task_description: "Follow up", date_initial_contact: "09/16/26",
  site_survey_date: "09/17/26", date_estimate_sent: "09/20/26", date_order_created: "—",
  project_install_date: "—", permit_submitted_date: "—", permit_receipt_confirmed_date: "—",
  permit_number: "—", permit_approved_date: "—", days_init_today: "9", days_req_est: "4",
  days_est_ord: "—", days_ord_prm: "—", days_prm_app: "—", days_ord_ins: "—",
  quote_age: "5d", follow_up_date: "09/28/26", expected_close_date: "10/15/26",
  close_date: "—", start_date: "—", project_type: "Signage",
});

const STANDARD_FILTERS = [
  { name: "All Statuses", value: "all", conditions: [] },
  { name: "Lead", value: "lead", conditions: [{ field: "sales_status", operator: "equals", value: "lead" }] },
  { name: "Quoted", value: "quoted", conditions: [{ field: "sales_status", operator: "equals", value: "quoted" }] },
  { name: "Follow Up", value: "follow_up", conditions: [{ field: "sales_status", operator: "equals", value: "follow_up" }] },
  { name: "Won", value: "won", conditions: [{ field: "sales_status", operator: "equals", value: "won" }] },
  { name: "Lost", value: "lost", conditions: [{ field: "sales_status", operator: "equals", value: "lost" }] },
  { name: "On Hold", value: "on_hold", conditions: [{ field: "sales_status", operator: "equals", value: "on_hold" }] }
];

const STANDARD_COLUMN_PRESETS = [
  { name: "Default View", columns: ALL_COLUMNS },
  { name: "Carl's View (All Columns)", columns: ALL_COLUMNS.map(c => ({ ...c, visible: true })) },
  { name: "Normal View (Hide Day Calculations)", columns: ALL_COLUMNS.map(c => ({ 
    ...c, 
    visible: !c.id.startsWith("days_") 
  })) }
];

const AuthorizedEmail = base44.entities.AuthorizedEmail;

export default function CustomFilterDialog({ isOpen, onClose, mode = "filters" }) {
  const { currentUser, sessionToken } = useAuth();
  const [filters, setFilters] = useState([]);
  const [columnPresets, setColumnPresets] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [itemName, setItemName] = useState("");
  const [filterConditions, setFilterConditions] = useState([{ field: "", operator: "equals", value: "" }]);
  const [columnDraft, dispatchColumnDraft] = useReducer(salesColumnDraftReducer, undefined, () => newSalesColumnDraft());
  const columnSettings = columnDraft.present;
  const [editorBaseline, setEditorBaseline] = useState(() => salesEditorSnapshot({ columns: ALL_COLUMNS, conditions: [{ field: "", operator: "equals", value: "" }] }));
  const [unsavedConfirm, setUnsavedConfirm] = useState(false);
  const pendingLeaveRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const copyInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);
  const selectionInFlightRef = useRef(new Set());
  const [selectingIds, setSelectingIds] = useState(() => new Set());
  const [isCopying, setIsCopying] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [activeTab, setActiveTab] = useState(mode);
  const [activeSubTab, setActiveSubTab] = useState("pool");
  const [users, setUsers] = useState([]);
  const [persistenceError, setPersistenceError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadData();
    loadUsers();
  }, []);

  const loadData = async () => {
    const SalesFilter = base44.entities.SalesFilter;
    const all = await loadAllEntityRows({ entity: SalesFilter, sort: null, label: "Sales custom filters" });
    setFilters(all.filter(f => f.type === "filter"));
    setColumnPresets(all.filter(f => f.type === "column_preset"));
  };

  const loadUsers = async () => {
    const usersData = await loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "Sales custom-filter users" });
    setUsers(usersData);
  };

  const getUsersForRole = (role) => salesPersonUsersForRole(users, role || null);

  const [globalOptionsCache, setGlobalOptionsCache] = useState({});

  const loadGlobalOptions = useCallback(async () => {
    try {
      const [leadSourcesSetting, taskDescSetting] = await Promise.all([
        loadSingleGlobalSetting({ entity: GlobalSettings, settingKey: "salesLeadSources", label: "Sales custom-filter lead sources" }),
        loadSingleGlobalSetting({ entity: GlobalSettings, settingKey: "salesTaskDescriptions", label: "Sales custom-filter task descriptions" }),
      ]);
      const cache = {};
      
      cache.salesLeadSources = leadSourcesSetting?.setting_value?.items || ["Walk-in", "Phone", "Email", "Referral", "Website"];
      

      if (taskDescSetting?.setting_value?.items) {
        cache.salesTaskDescriptions = taskDescSetting.setting_value.items.map(item => 
          typeof item === 'string' ? item : item.text
        );
      } else {
        cache.salesTaskDescriptions = [
          "Prospect Initiation (Gather Info, Initial Discuss ...)",
          "Conduct Site Survey",
          "Complete Estimate for Review",
          "WIP - Designing",
          "WIP - Installation",
          "Completed Sale"
        ];
      }
      
      setGlobalOptionsCache(cache);
    } catch (error) {
      console.error("Error loading global options:", error);
    }
  }, []);

  useEffect(() => {
    loadGlobalOptions();
  }, [loadGlobalOptions]);

  const getLocalStorageOptions = (storageKey) => {
    if (globalOptionsCache[storageKey]) {
      return globalOptionsCache[storageKey];
    }
    
    // Fallback defaults
    const defaults = {
      salesLeadSources: ["Walk-in", "Phone", "Email", "Referral", "Website"],
      salesProjectTypes: ["Signage", "Wraps", "Decals", "Banners", "Other"],
      salesTaskDescriptions: ["Prospect Initiation", "Conduct Site Survey", "Completed Sale"]
    };
    
    return defaults[storageKey] || [];
  };

  const addCondition = () => {
    setFilterConditions([...filterConditions, { field: "", operator: "equals", value: "" }]);
  };

  const removeCondition = (index) => {
    setFilterConditions(filterConditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index, key, value) => {
    setFilterConditions((current) => current.map((condition, i) =>
      i === index ? { ...condition, [key]: value } : condition));
  };

  const saveItem = async ({ closeAfterSave = false } = {}) => {
    if (!itemName.trim()) {
      setPersistenceError("Enter a preset or filter name before saving. Your edits are still here.");
      return false;
    }

    if (activeTab === "filters") {
      const fieldIds = new Set(FILTER_FIELDS.map((field) => field.value));
      const operatorIds = new Set(OPERATORS.map((operator) => operator.value));
      const invalidConditionIndex = filterConditions.findIndex((condition) => {
        if (!fieldIds.has(condition?.field) || !operatorIds.has(condition?.operator)) return true;
        if (condition.operator === "empty" || condition.operator === "not_empty") return false;
        return String(condition?.value ?? "").trim() === "";
      });
      if (invalidConditionIndex >= 0) {
        setPersistenceError(`Complete condition ${invalidConditionIndex + 1} before saving. Choose a field, operator, and value.`);
        return false;
      }
    }

    const data = {
      name: itemName,
      type: activeTab === "filters" ? "filter" : "column_preset",
      conditions: activeTab === "filters" ? filterConditions : [],
      column_settings: activeTab === "columns" ? preserveLegacySalesColumnEntries(columnSettings, editingItem?.column_settings) : [],
      is_standard: false,
      created_by_name: currentUser?.full_name || currentUser?.email || "Unknown",
      selected_by: editingItem?.selected_by || []
    };

    if (saveInFlightRef.current) return false;
    saveInFlightRef.current = true;
    setIsSaving(true);
    setPersistenceError("");
    try {
      if (editingItem && !editingItem.is_standard) {
        await updateSalesFilterIfUnchanged({ record: editingItem, nextFields: data, sessionToken, label: `Saved filter ${editingItem.name || editingItem.id}` });
      } else {
        const result = await createSalesFilterIfAbsent({ data, sessionToken, label: `Saved filter ${data.name}` });
        if (result.status === "existing") throw new Error(`A ${data.type === "column_preset" ? "column preset" : "filter"} named "${data.name}" already exists.`);
      }
      await loadData();
      resetForm();
      if (closeAfterSave) onClose();
      return true;
    } catch (error) {
      console.error("Saved filter update blocked:", error);
      setPersistenceError(error?.message || "This saved filter changed in another session. Reload before saving.");
      await loadData().catch(() => {});
      return false;
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const duplicateItem = async (item) => {
    if (copyInFlightRef.current) return false;
    copyInFlightRef.current = true;
    setIsCopying(true);
    setPersistenceError("");
    try {
      await createUniqueSalesFilterCopy({
        source: item,
        sessionToken,
        label: `Saved filter copy ${item.name}`,
      });
      await loadData();
      return true;
    } catch (error) {
      console.error("Saved filter copy blocked:", error);
      setPersistenceError(error?.message || "The saved filter could not be copied safely.");
      await loadData();
      return false;
    } finally {
      copyInFlightRef.current = false;
      setIsCopying(false);
    }
  };

  const editItem = (item) => {
    const nextConditions = item.conditions?.length
      ? item.conditions.map((condition) => ({ ...condition }))
      : [{ field: "", operator: "equals", value: "" }];
    const nextColumns = normalizeSalesColumnSettings(item.column_settings);
    setEditingItem(item);
    setItemName(item.name);
    setFilterConditions(nextConditions);
    dispatchColumnDraft({ type: "reset", columns: nextColumns });
    setEditorBaseline(salesEditorSnapshot({ name: item.name, columns: nextColumns, conditions: nextConditions }));
    setActiveSubTab("create");
  };

  const deleteItem = (item) => {
    setDeleteConfirm(item);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm?.id || deleteInFlightRef.current) return false;
    deleteInFlightRef.current = true;
    setIsSaving(true);
    setPersistenceError("");
    try {
      await deleteSalesFilterIfUnchanged({ record: deleteConfirm, sessionToken, label: `Saved filter ${deleteConfirm.name || deleteConfirm.id} deletion` });
      await loadData();
      setDeleteConfirm(null);
      return true;
    } catch (error) {
      console.error("Saved filter deletion blocked:", error);
      setPersistenceError(error?.message || "This saved filter changed in another session and was not deleted.");
      setDeleteConfirm(null);
      await loadData();
      return false;
    } finally {
      deleteInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    const blankConditions = [{ field: "", operator: "equals", value: "" }];
    setEditingItem(null);
    setItemName("");
    setFilterConditions(blankConditions);
    dispatchColumnDraft({ type: "reset" });
    setEditorBaseline(salesEditorSnapshot({ columns: ALL_COLUMNS, conditions: blankConditions }));
    setActiveSubTab("pool");
  };

  const hasUnsavedEdits = activeSubTab === "create" && salesEditorHasChanges(
    activeTab, editorBaseline, { name: itemName, columns: columnSettings, conditions: filterConditions });
  const requestNavigation = (action) => {
    if (isSaving) return;
    if (hasUnsavedEdits) {
      pendingLeaveRef.current = action;
      setUnsavedConfirm(true);
    } else action();
  };
  const requestClose = () => requestNavigation(onClose);
  const confirmDiscard = () => {
    const action = pendingLeaveRef.current;
    pendingLeaveRef.current = null;
    setUnsavedConfirm(false);
    action?.();
  };

  const toggleSelection = async (item, isStandard = false) => {
    const userEmail = currentUser?.email || "";
    if (!userEmail) return;

    if (isStandard) {
      // For standard items, create a user selection entry in localStorage
      const key = `sales_standard_${item.value || item.name}_selected`;
      const current = localStorage.getItem(key) === "true";
      localStorage.setItem(key, (!current).toString());
      // Force re-render
      setFilters([...filters]);
    } else {
      const recordId = String(item.id || "").trim();
      if (!recordId || selectionInFlightRef.current.has(recordId)) return false;
      selectionInFlightRef.current.add(recordId);
      setSelectingIds((current) => new Set(current).add(recordId));
      const selectedBy = item.selected_by || [];
      const isSelected = selectedBy.includes(userEmail);
      
      try {
        await setSalesFilterSelectionSafely({
          recordId,
          selected: !isSelected,
          sessionToken,
          label: `Saved filter ${item.name || item.id} selection`,
        });
        await loadData();
        return true;
      } catch (error) {
        console.error("Saved filter selection update blocked:", error);
        setPersistenceError(error?.message || "This saved filter changed while your selection was being saved.");
        await loadData();
        return false;
      } finally {
        selectionInFlightRef.current.delete(recordId);
        setSelectingIds((current) => {
          const next = new Set(current);
          next.delete(recordId);
          return next;
        });
      }
    }
  };

  const isSelected = (item, isStandard = false) => {
    const userEmail = currentUser?.email || "";
    if (isStandard) {
      const key = `sales_standard_${item.value || item.name}_selected`;
      return localStorage.getItem(key) === "true";
    }
    return item.selected_by?.includes(userEmail);
  };

  const toggleColumnVisibility = (columnId) => {
    dispatchColumnDraft({ type: "toggle", id: columnId });
  };

  const moveColumn = (index, direction) => {
    const id = columnSettings[index]?.id;
    if (!id) return;
    dispatchColumnDraft({ type: "move", id, direction: direction === "up" ? -1 : 1 });
  };

  const visiblePreviewColumns = columnSettings.filter((column) => column.visible);
  const allColumnsShown = columnSettings.every((column) => column.visible);
  const optionalColumnsHidden = columnSettings.every((column) =>
    column.visible === SALES_ESSENTIAL_COLUMN_IDS.includes(column.id));
  const columnLayoutMatchesBaseline = salesColumnSettingsEqual(columnSettings, editorBaseline.columns);

  const canDelete = (item) => {
    if (item.is_standard) return false;
    // Admins can delete any custom filter, others can only delete their own
    if (currentUser?.role === "admin") return true;
    const currentEmail = String(currentUser?.email || "").toLowerCase();
    return String(item.owner_email || "").toLowerCase() === currentEmail ||
      (String(item.created_by || "").toLowerCase() !== "anonymous" && String(item.created_by || "").toLowerCase() === currentEmail);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) requestClose(); }} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogContent 
          className="clay-card min-w-0 border-none p-3 sm:p-6 [&>button]:hidden"
          style={{ maxWidth: "90vw", width: "1100px", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
        >
          <DialogHeader className="shrink-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <DialogTitle className="min-w-0 flex-1 text-base font-bold leading-tight sm:text-2xl">
                {activeTab === "filters" ? "Manage Custom Information Filters" : "Manage Custom Column Filters"}
              </DialogTitle>
              <Button type="button" onClick={() => hasUnsavedEdits ? saveItem({ closeAfterSave: true }) : requestClose()} className="clay-button min-h-11 shrink-0 border-none px-2 text-xs sm:px-4 sm:text-sm" disabled={isSaving}>
                {hasUnsavedEdits ? <Save className="w-4 h-4 mr-2" /> : <X className="w-4 h-4 mr-2" />}
                {isSaving ? "Saving…" : hasUnsavedEdits ? "Save & Close" : "Close"}
              </Button>
            </div>
          </DialogHeader>

          {persistenceError && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="font-medium">Saved filter update blocked</div>
              <div className="mt-1 text-xs">{persistenceError}</div>
              <Button type="button" size="sm" variant="outline" className="mt-2 h-7 border-red-300 bg-white text-red-800" onClick={async () => { setPersistenceError(""); await loadData(); }}>
                Reload latest
              </Button>
            </div>
          )}

          {/* Sub-tabs */}
          <div className="mb-3 flex shrink-0 flex-wrap gap-2 sm:mb-4">
            <Button
              size="sm"
              variant={activeSubTab === "pool" ? "default" : "outline"}
              className="min-h-11 min-w-0 whitespace-normal text-xs sm:min-h-0 sm:text-sm"
              onClick={() => requestNavigation(resetForm)}
            >
              {activeTab === "filters" ? "Information Filter Pool" : "Preset Pool"}
            </Button>
            <Button
              size="sm"
              variant={activeSubTab === "create" ? "default" : "outline"}
              className="min-h-11 min-w-0 whitespace-normal text-xs sm:min-h-0 sm:text-sm"
              onClick={() => requestNavigation(() => {
                resetForm();
                setActiveSubTab("create");
              })}
            >
              {editingItem ? "Edit" : "Create New"}
            </Button>
          </div>

          {activeSubTab === "pool" && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-2">
              {/* My Presets - Shows selected items */}
              {(() => {
                const standardItems = activeTab === "filters" ? STANDARD_FILTERS : STANDARD_COLUMN_PRESETS;
                const customItems = activeTab === "filters" ? filters : columnPresets;
                const selectedStandard = standardItems.filter(item => isSelected(item, true));
                const selectedCustom = customItems.filter(item => isSelected(item));
                const hasSelected = selectedStandard.length > 0 || selectedCustom.length > 0;
                
                return hasSelected ? (
                  <div className="clay-card p-3 bg-purple-50">
                    <h3 className="font-bold text-sm mb-2 flex items-center gap-2 text-purple-800">
                      ⭐ My Presets
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedStandard.map(item => (
                        <div 
                          key={item.value || item.name} 
                          className="px-2 py-1 bg-purple-200 text-purple-800 rounded text-xs font-medium flex items-center gap-1"
                        >
                          {item.name}
                          <button 
                            type="button"
                            aria-label={`Remove ${item.name} from My Presets`}
                            onClick={() => toggleSelection(item, true)}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded hover:text-purple-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:h-5 sm:w-5"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {selectedCustom.map(item => (
                        <div 
                          key={item.id} 
                          className="px-2 py-1 bg-purple-200 text-purple-800 rounded text-xs font-medium flex items-center gap-1"
                        >
                          {item.name}
                          <button 
                            type="button"
                            aria-label={`Remove ${item.name} from My Presets`}
                            disabled={selectingIds.has(item.id)}
                            onClick={() => toggleSelection(item)}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded hover:text-purple-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:h-5 sm:w-5"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Standard Items - Compact */}
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Standard {activeTab === "filters" ? "Information Filters" : "Column Presets"}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {(activeTab === "filters" ? STANDARD_FILTERS : STANDARD_COLUMN_PRESETS).map(item => (
                    <div 
                      key={item.value || item.name} 
                      className={`max-w-full px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 border transition-colors ${
                        isSelected(item, true) 
                          ? 'bg-blue-100 border-blue-300 text-blue-800' 
                          : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-blue-600 sm:min-h-0">
                        <input
                          type="checkbox"
                          checked={isSelected(item, true)}
                          onChange={() => toggleSelection(item, true)}
                          className="h-3 w-3 shrink-0"
                        />
                        <span className="break-words">{item.name}</span>
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        aria-label={`Duplicate ${item.name}`}
                        title={`Duplicate ${item.name}`}
                        disabled={isCopying}
                        className="h-11 w-11 shrink-0 p-0 sm:h-6 sm:w-6"
                        onClick={() => {
                          duplicateItem({ 
                            ...item, 
                            type: activeTab === "filters" ? "filter" : "column_preset",
                            column_settings: item.columns || []
                          });
                        }}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Items Pool - Compact */}
              <div>
                <h3 className="font-bold text-sm mb-2">
                  Custom {activeTab === "filters" ? "Information Filters" : "Column Presets"}
                </h3>
                {(activeTab === "filters" ? filters : columnPresets).length === 0 ? (
                  <p className="text-gray-500 text-xs">No custom {activeTab === "filters" ? "information filters" : "presets"} yet. Create one!</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(activeTab === "filters" ? filters : columnPresets).map(item => (
                      <div 
                        key={item.id} 
                        className={`max-w-full px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 border transition-colors ${
                          isSelected(item) 
                            ? 'bg-green-100 border-green-300 text-green-800' 
                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                        >
                        <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-blue-600 sm:min-h-0">
                          <input
                            type="checkbox"
                            checked={isSelected(item)}
                            disabled={selectingIds.has(item.id)}
                            onChange={() => toggleSelection(item)}
                            className="h-3 w-3 shrink-0"
                          />
                          <span className="break-words">{item.name}</span>
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          aria-label={`Duplicate ${item.name}`}
                          title={`Duplicate ${item.name}`}
                          disabled={isCopying}
                          className="h-11 w-11 shrink-0 p-0 sm:h-6 sm:w-6"
                          onClick={() => {
                            duplicateItem(item);
                          }}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          aria-label={`Edit ${item.name}`}
                          title={`Edit ${item.name}`}
                          className="h-11 w-11 shrink-0 p-0 sm:h-6 sm:w-6"
                          onClick={() => {
                            requestNavigation(() => editItem(item));
                          }}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        {canDelete(item) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            aria-label={`Delete ${item.name}`}
                            title={`Delete ${item.name}`}
                            className="h-11 w-11 shrink-0 p-0 sm:h-6 sm:w-6"
                            onClick={() => {
                              deleteItem(item);
                            }}
                          >
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSubTab === "create" && activeTab === "filters" && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-2">
              <div className="clay-card min-w-0 space-y-4 p-3 sm:p-4">
                <h3 className="font-bold text-lg">
                  {editingItem ? "Edit Information Filter" : "Create New Information Filter"}
                </h3>

                <div>
                  <Label>Filter Name</Label>
                  <Input
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g., High Priority Leads"
                    disabled={isSaving}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Filter Conditions</Label>
                  {filterConditions.map((condition, index) => {
                    const selectedField = FILTER_FIELDS.find(f => f.value === condition.field);
                    const isUserField = selectedField?.type === "user";
                    const isSelectField = selectedField?.type === "select";
                    const isLocalStorageField = selectedField?.type === "localStorage";
                    const hasDropdownOptions = isUserField || isSelectField || isLocalStorageField;
                    const isMultiOperator = condition.operator === "is_one_of" || condition.operator === "is_not_one_of";
                    
                    // For multi-select, value is stored as comma-separated string
                    const multiValues = isMultiOperator ? (condition.value || "").split(",").filter(Boolean) : [];
                    
                    const getDropdownOptions = () => {
                      if (isUserField) return getUsersForRole(selectedField.role).map(u => ({ value: u.full_name, label: u.full_name }));
                      if (isSelectField) return selectedField.options.map(opt => ({ value: opt, label: opt.charAt(0).toUpperCase() + opt.slice(1).replace(/_/g, ' ') }));
                      if (isLocalStorageField) return getLocalStorageOptions(selectedField.storageKey).map(opt => ({ value: opt, label: opt }));
                      return [];
                    };
                    
                    return (
                      <div key={index} className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-slate-200 bg-white p-2 sm:flex sm:items-start sm:border-0 sm:bg-transparent sm:p-0">
                        <Select
                          value={condition.field}
                          disabled={isSaving}
                          onValueChange={(value) => {
                            updateCondition(index, "field", value);
                            updateCondition(index, "value", ""); // Reset value when field changes
                          }}
                        >
                          <SelectTrigger aria-label={`Filter field for condition ${index + 1}`} className="col-start-1 row-start-1 h-11 w-full min-w-0 text-xs sm:h-9 sm:flex-1">
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent>
                            {FILTER_FIELDS.map(field => (
                              <SelectItem key={field.value} value={field.value}>
                                {field.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={condition.operator}
                          disabled={isSaving}
                          onValueChange={(value) => {
                            updateCondition(index, "operator", value);
                            // Reset value when switching between single/multi operators
                            const wasMulti = condition.operator === "is_one_of" || condition.operator === "is_not_one_of";
                            const nowMulti = value === "is_one_of" || value === "is_not_one_of";
                            if (wasMulti !== nowMulti) updateCondition(index, "value", "");
                          }}
                        >
                          <SelectTrigger aria-label={`Operator for condition ${index + 1}`} className="col-span-2 row-start-2 h-11 w-full min-w-0 text-xs sm:h-9 sm:w-40 sm:flex-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OPERATORS.map(op => (
                              <SelectItem key={op.value} value={op.value}>
                                {op.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {condition.operator !== "empty" && condition.operator !== "not_empty" && (
                          <>
                            {isMultiOperator && hasDropdownOptions ? (
                              <div className="col-span-2 row-start-3 min-w-0 rounded-md border bg-white p-2 sm:flex-1">
                                <div className="flex flex-wrap gap-1 mb-1">
                                  {multiValues.map((val, vi) => (
                                    <span key={vi} className="inline-flex max-w-full min-w-0 items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                                      <span className="min-w-0 break-words">{val}</span>
                                      <button
                                        type="button"
                                        disabled={isSaving}
                                        onClick={() => {
                                          const newVals = multiValues.filter((_, i) => i !== vi);
                                          updateCondition(index, "value", newVals.join(","));
                                        }}
                                        aria-label={`Remove ${val} from condition ${index + 1}`}
                                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded font-bold hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:h-5 sm:w-5"
                                      >×</button>
                                    </span>
                                  ))}
                                </div>
                                <Select
                                  value=""
                                  disabled={isSaving}
                                  onValueChange={(val) => {
                                    if (!multiValues.includes(val)) {
                                      updateCondition(index, "value", [...multiValues, val].join(","));
                                    }
                                  }}
                                >
                                  <SelectTrigger aria-label={`Add value to condition ${index + 1}`} className="h-11 w-full min-w-0 text-xs sm:h-7">
                                    <SelectValue placeholder="Add value..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {getDropdownOptions()
                                      .filter(opt => !multiValues.includes(opt.value))
                                      .map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                      ))
                                    }
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : isMultiOperator && !hasDropdownOptions ? (
                              <Input
                                value={condition.value}
                                onChange={(e) => updateCondition(index, "value", e.target.value)}
                                placeholder="Comma-separated values"
                                disabled={isSaving}
                                aria-label={`Values for condition ${index + 1}`}
                                className="col-span-2 row-start-3 h-11 w-full min-w-0 sm:h-9 sm:flex-1"
                              />
                            ) : hasDropdownOptions ? (
                              <Select
                                value={condition.value}
                                disabled={isSaving}
                                onValueChange={(value) => updateCondition(index, "value", value)}
                              >
                                <SelectTrigger aria-label={`Value for condition ${index + 1}`} className="col-span-2 row-start-3 h-11 w-full min-w-0 text-xs sm:h-9 sm:flex-1">
                                  <SelectValue placeholder={isUserField ? "Select user" : "Select value"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {isUserField && getUsersForRole(selectedField.role).map(u => (
                                    <SelectItem key={u.email} value={u.full_name}>
                                      {u.full_name}
                                    </SelectItem>
                                  ))}
                                  {isSelectField && selectedField.options.map(opt => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt.charAt(0).toUpperCase() + opt.slice(1).replace(/_/g, ' ')}
                                    </SelectItem>
                                  ))}
                                  {isLocalStorageField && getLocalStorageOptions(selectedField.storageKey).map(opt => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                value={condition.value}
                                onChange={(e) => updateCondition(index, "value", e.target.value)}
                                placeholder={selectedField?.type === "date" ? "YYYY-MM-DD" : "Value"}
                                disabled={isSaving}
                                title={selectedField?.type === "date" ? "Use YYYY-MM-DD. Date ranges also accept M/D/YYYY or M/D/YY." : undefined}
                                aria-label={`${selectedField?.label || "Value"} for condition ${index + 1}`}
                                className="col-span-2 row-start-3 h-11 w-full min-w-0 sm:h-9 sm:flex-1"
                                type={selectedField?.type === "number" ? "number" : "text"}
                              />
                            )}
                          </>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          onClick={() => removeCondition(index)}
                          disabled={filterConditions.length === 1 || isSaving}
                          aria-label={`Remove condition ${index + 1}`}
                          className="col-start-2 row-start-1 h-11 w-11 shrink-0 sm:h-9 sm:w-9"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    );
                  })}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addCondition}
                    disabled={isSaving}
                    className="mt-2 min-h-11 sm:min-h-0"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Condition
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => saveItem()} className="clay-button min-h-11 min-w-0 whitespace-normal border-none text-xs sm:min-h-0 sm:text-sm" disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4 shrink-0" />
                    {editingItem ? "Update Information Filter" : "Save Information Filter"}
                  </Button>
                  <Button variant="outline" onClick={() => requestNavigation(resetForm)} disabled={isSaving} className="min-h-11 sm:min-h-0">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === "create" && activeTab === "columns" && (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
              <div className="clay-card p-4 space-y-3">
                <h3 className="font-bold text-lg">
                  {editingItem ? "Edit Column Preset" : "Create New Column Preset"}
                </h3>

                <div>
                  <Label>Preset Name</Label>
                  <Input
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g., My Custom View"
                    disabled={isSaving}
                    className="mt-1"
                  />
                </div>

                <div>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <Label className="block text-sm">Column Settings - Toggle visibility</Label>
                    <div className="flex flex-wrap items-center gap-1">
                      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Column layout shortcuts">
                        <Button type="button" variant="outline" size="sm" className="h-11 px-2 text-xs sm:h-8"
                          disabled={allColumnsShown || isSaving}
                          onClick={() => dispatchColumnDraft({ type: "show_all" })}
                          title="Show all supported columns without changing their order">Show All</Button>
                        <Button type="button" variant="outline" size="sm" className="h-11 px-2 text-xs sm:h-8"
                          disabled={optionalColumnsHidden || isSaving}
                          onClick={() => dispatchColumnDraft({ type: "hide_optional" })}
                          title="Keep Customer, Sales Status, Task Description and Follow Up; you can still change any checkbox">Hide Optional</Button>
                        <Button type="button" variant="outline" size="sm" className="h-11 px-2 text-xs sm:h-8"
                          disabled={columnLayoutMatchesBaseline || isSaving}
                          onClick={() => dispatchColumnDraft({ type: "restore", columns: editorBaseline.columns })}
                          title="Restore the original saved layout and visibility; Undo is available">Reset</Button>
                      </div>
                      <div className="flex items-center gap-1" role="group" aria-label="Column arrangement history">
                      <Button type="button" variant="outline" size="sm" className="h-11 px-2 text-xs sm:h-8"
                        disabled={columnDraft.past.length === 0 || isSaving}
                        onClick={() => dispatchColumnDraft({ type: "undo" })}
                        title="Undo the last column visibility or arrangement change">
                        <Undo2 className="mr-1 h-3.5 w-3.5" />Undo
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-11 px-2 text-xs sm:h-8"
                        disabled={columnDraft.future.length === 0 || isSaving}
                        onClick={() => dispatchColumnDraft({ type: "redo" })}
                        title="Redo the last undone column change">
                        <Redo2 className="mr-1 h-3.5 w-3.5" />Redo
                      </Button>
                      </div>
                    </div>
                  </div>
                  {editingItem && getUnavailableSalesColumns(editingItem.column_settings).length > 0 && (
                    <p role="status" className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                      This older preset includes unavailable columns: {getUnavailableSalesColumns(editingItem.column_settings).map((item) => item.label || item.id).join(", ")}.
                      They are preserved in the saved record for later review but cannot be displayed in the table.
                    </p>
                  )}
                  
                  <div className="flex flex-wrap gap-1">
                    {columnSettings.map((column) => (
                      <label 
                        key={column.id} 
                        className={`min-h-11 px-1.5 py-0.5 rounded border flex items-center gap-1 cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-blue-600 sm:min-h-0 ${
                          column.visible ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-400'
                        }`}
                        style={{ fontSize: '11px' }}
                      >
                        <input
                          type="checkbox"
                          checked={column.visible}
                          disabled={isSaving}
                          onChange={() => toggleColumnVisibility(column.id)}
                          className="w-3 h-3 flex-shrink-0"
                        />
                        <span className={column.visible ? "font-medium" : ""}>
                          {column.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="clay-card min-w-0 p-2 bg-blue-50/50">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                    <Label className="font-bold text-sm">Preview</Label>
                    <span className="text-[11px] font-medium text-blue-900">
                      {visiblePreviewColumns.length} of {SALES_TABLE_COLUMNS.length} data columns visible
                    </span>
                  </div>
                  <p id="sales-column-preview-instructions" className="text-xs text-gray-600 mb-1">
                    Same headers, minimum widths and saved order as the Sales Pipeline table. Use the header arrows to reorder. Scroll horizontally → Keyboard: Tab into the preview and use the arrow keys to scroll.
                  </p>
                  {visiblePreviewColumns.length === 0 && (
                    <p role="status" className="mb-1 text-xs text-amber-800">No data columns selected. Check a column above to add it.</p>
                  )}
                  <div className="max-w-full overflow-x-auto rounded-lg border bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2" role="region" aria-label="Horizontal Sales Pipeline column preview" aria-describedby="sales-column-preview-instructions" tabIndex={0}>
                    <table className="w-full border-collapse" style={{ tableLayout: "auto", minWidth: "max-content", fontSize: "12px" }}>
                      <thead className="bg-gray-100 text-[11px] leading-tight [&_th]:whitespace-nowrap">
                        <tr className="h-7 border-b">
                          <th className="border-r px-2 py-1 text-center font-medium text-gray-700" style={{ width: "32px", minWidth: "32px" }}>#</th>
                          {visiblePreviewColumns.map((column, index) => (
                            <th
                              key={column.id}
                              className="border-r px-2 py-1 text-left font-medium text-gray-700"
                              style={{ minWidth: `${getSalesColumnLayout(column.id).minWidth}px` }}
                              title={column.label}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="min-w-0 truncate">{getSalesColumnLayout(column.id).headerLabel}</span>
                                <div className="flex shrink-0 items-center">
                                  <button
                                    type="button"
                                    aria-label={`Move ${column.label} left`}
                                    title={`Move ${column.label} left`}
                                    onClick={() => moveColumn(columnSettings.indexOf(column), "up")}
                                    disabled={index === 0 || isSaving}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded text-gray-500 hover:bg-blue-100 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-30 sm:h-6 sm:w-5"
                                  >
                                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Move ${column.label} right`}
                                    title={`Move ${column.label} right`}
                                    onClick={() => moveColumn(columnSettings.indexOf(column), "down")}
                                    disabled={index === visiblePreviewColumns.length - 1 || isSaving}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded text-gray-500 hover:bg-blue-100 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-30 sm:h-6 sm:w-5"
                                  >
                                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                  </button>
                                </div>
                              </div>
                            </th>
                          ))}
                          <th className="px-2 py-1 text-left font-medium text-gray-700" style={{ minWidth: "60px" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b bg-white">
                          <td className="border-r px-2 py-1 text-center font-medium text-gray-500">1</td>
                          {visiblePreviewColumns.map((column) => {
                            const sample = SALES_COLUMN_PREVIEW_SAMPLE[column.id];
                            const isEmpty = sample === "—";
                            return (
                              <td
                                key={column.id}
                                className="border-r px-1 py-0.5 whitespace-nowrap"
                                style={{ minWidth: `${getSalesColumnLayout(column.id).minWidth}px` }}
                              >
                                <span className={column.id === "sales_status"
                                  ? "rounded bg-blue-50 px-1 py-0.5 text-blue-700"
                                  : column.id === "client_name" || column.id === "est_inv_at"
                                    ? "text-blue-600"
                                    : column.id === "stage_age" || column.id === "quote_age"
                                      ? "rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-700"
                                      : isEmpty ? "text-gray-400" : "text-gray-700"}>
                                  {sample}
                                </span>
                              </td>
                            );
                          })}
                          <td className="px-2 py-0.5 text-gray-500 whitespace-nowrap">•••</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">Example row only. The editor never changes a WorkOrder.</p>
                </div>

                <div className="flex gap-2">
                  <Button onClick={() => saveItem()} className="clay-button border-none" disabled={isSaving}>
                    <Save className="w-4 h-4 mr-2" />
                    {editingItem ? "Update Preset" : "Save Preset"}
                  </Button>
                  <Button variant="outline" onClick={() => requestNavigation(resetForm)} disabled={isSaving}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={unsavedConfirm} onOpenChange={(open) => {
        if (!open) { setUnsavedConfirm(false); pendingLeaveRef.current = null; }
      }}>
        <AlertDialogContent className="clay-card max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved {activeTab === "columns" ? "column layout" : "filter"} changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Changes to this {activeTab === "columns" ? "column preset" : "information filter"} have not been saved.
              Stay here to save, or discard this draft to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { pendingLeaveRef.current = null; }}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard} className="bg-red-600 text-white" disabled={isSaving}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {activeTab === "filters" ? "Information Filter" : "Preset"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white" disabled={isSaving}>
              {isSaving ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}