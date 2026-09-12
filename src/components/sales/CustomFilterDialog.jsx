import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";

const GlobalSettings = base44.entities.GlobalSettings;
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, Pencil, Copy, Users } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { createSalesFilterIfAbsent, createUniqueSalesFilterCopy, deleteSalesFilterIfUnchanged, setSalesFilterSelectionSafely, updateSalesFilterIfUnchanged } from "@/components/sales/salesFilterPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";

const FILTER_FIELDS = [
  { value: "client_name", label: "Customer", type: "text" },
  { value: "lead_source", label: "Source", type: "localStorage", storageKey: "salesLeadSources" },
  { value: "current_task_assigned_to", label: "Task Assigned To", type: "user", role: "Task Assigned" },
  { value: "designer", label: "Designer", type: "user", role: "Designer" },
  { value: "project_manager", label: "Project Manager", type: "user", role: "PM" },
  { value: "estimator", label: "Estimator", type: "user", role: "Estimator" },
  { value: "sales_status", label: "Status", type: "select", options: ["lead", "quoted", "follow_up", "won", "lost", "on_hold"] },
  { value: "project_type", label: "Project Type", type: "localStorage", storageKey: "salesProjectTypes" },
  { value: "estimate_amount", label: "Estimate Amount", type: "number" },
  { value: "probability", label: "Probability", type: "number" },
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
  { value: "quote_date", label: "Quote Date", type: "date" },
  { value: "follow_up_date", label: "Follow Up Date", type: "date" },
  { value: "close_date", label: "Close Date", type: "date" },
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

const ALL_COLUMNS = [
  { id: "client_name", label: "Customer", visible: true },
  { id: "sales_status", label: "Sales Status", visible: true },
  { id: "description", label: "Job Description", visible: true },
  { id: "lead_source", label: "Source", visible: true },
  { id: "current_task_deadline", label: "Deadline", visible: true },
  { id: "current_task_assigned_to", label: "Task Assigned", visible: true },
  { id: "designer", label: "Designer", visible: true },
  { id: "project_manager", label: "PM", visible: true },
  { id: "estimator", label: "Estimator", visible: true },
  { id: "est_inv_at", label: "Estimate/Invoice # Link", visible: true },
  { id: "estimate_amount", label: "Amount", visible: true },
  { id: "current_task_description", label: "Task Description", visible: true },
  { id: "date_initial_contact", label: "Est. Requested", visible: true },
  { id: "site_survey_date", label: "Survey", visible: true },
  { id: "date_estimate_sent", label: "Est Sent", visible: true },
  { id: "date_order_created", label: "Order", visible: true },
  { id: "project_install_date", label: "Install", visible: true },
  { id: "permit_submitted_date", label: "Permit Sub", visible: true },
  { id: "title", label: "Notes", visible: true },
  { id: "permit_receipt_confirmed_date", label: "Permit Conf", visible: true },
  { id: "permit_number", label: "Permit #", visible: true },
  { id: "permit_approved_date", label: "Permit App", visible: true },
  { id: "days_init_today", label: "Days Init→Today", visible: true },
  { id: "days_req_est", label: "Days Req→Est", visible: true },
  { id: "days_est_ord", label: "Days Est→Ord", visible: true },
  { id: "days_ord_prm", label: "Days Ord→Prm", visible: true },
  { id: "days_prm_app", label: "Days Prm→App", visible: true },
  { id: "days_ord_ins", label: "Days Ord→Ins", visible: true },
  { id: "quote_date", label: "Quote", visible: true },
  { id: "follow_up_date", label: "Follow Up", visible: true },
  { id: "close_date", label: "Close", visible: true },
  { id: "probability", label: "Prob", visible: true },
  { id: "start_date", label: "Start", visible: true },
  { id: "project_type", label: "Project Type", visible: true }
];

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
  const { currentUser } = useAuth();
  const [filters, setFilters] = useState([]);
  const [columnPresets, setColumnPresets] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [itemName, setItemName] = useState("");
  const [filterConditions, setFilterConditions] = useState([{ field: "", operator: "equals", value: "" }]);
  const [columnSettings, setColumnSettings] = useState(ALL_COLUMNS);
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

  const getUsersForRole = (role) => {
    return users.filter(u => u.sales_roles?.includes(role));
  };

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
    const updated = [...filterConditions];
    updated[index][key] = value;
    setFilterConditions(updated);
  };

  const saveItem = async () => {
    if (!itemName.trim()) {
      alert("Please enter a name");
      return;
    }

    const SalesFilter = base44.entities.SalesFilter;
    const data = {
      name: itemName,
      type: activeTab === "filters" ? "filter" : "column_preset",
      conditions: activeTab === "filters" ? filterConditions : [],
      column_settings: activeTab === "columns" ? columnSettings : [],
      is_standard: false,
      created_by_name: currentUser?.full_name || currentUser?.email || "Unknown",
      selected_by: editingItem?.selected_by || []
    };

    if (isSaving) return;
    setIsSaving(true);
    setPersistenceError("");
    try {
      if (editingItem && !editingItem.is_standard) {
        await updateSalesFilterIfUnchanged({ entity: SalesFilter, record: editingItem, nextFields: data, label: `Saved filter ${editingItem.name || editingItem.id}` });
      } else {
        const result = await createSalesFilterIfAbsent({ entity: SalesFilter, data, label: `Saved filter ${data.name}` });
        if (result.status === "existing") throw new Error(`A ${data.type === "column_preset" ? "column preset" : "filter"} named "${data.name}" already exists.`);
      }
      await loadData();
      resetForm();
    } catch (error) {
      console.error("Saved filter update blocked:", error);
      setPersistenceError(error?.message || "This saved filter changed in another session. Reload before saving.");
      await loadData();
    } finally {
      setIsSaving(false);
    }
  };

  const duplicateItem = async (item) => {
    const SalesFilter = base44.entities.SalesFilter;
    setPersistenceError("");
    try {
      await createUniqueSalesFilterCopy({
        entity: SalesFilter,
        source: item,
        createdByName: currentUser?.full_name || currentUser?.email || "Unknown",
        label: `Saved filter copy ${item.name}`,
      });
      await loadData();
    } catch (error) {
      console.error("Saved filter copy blocked:", error);
      setPersistenceError(error?.message || "The saved filter could not be copied safely.");
      await loadData();
    }
  };

  const editItem = (item) => {
    setEditingItem(item);
    setItemName(item.name);
    setFilterConditions(item.conditions?.length ? item.conditions : [{ field: "", operator: "equals", value: "" }]);
    setColumnSettings(item.column_settings?.length ? item.column_settings : ALL_COLUMNS);
    setActiveSubTab("create");
  };

  const deleteItem = (item) => {
    setDeleteConfirm(item);
  };

  const confirmDelete = async () => {
    const SalesFilter = base44.entities.SalesFilter;
    if (!deleteConfirm?.id || isSaving) return;
    setIsSaving(true);
    setPersistenceError("");
    try {
      await deleteSalesFilterIfUnchanged({ entity: SalesFilter, record: deleteConfirm, label: `Saved filter ${deleteConfirm.name || deleteConfirm.id} deletion` });
      await loadData();
      setDeleteConfirm(null);
    } catch (error) {
      console.error("Saved filter deletion blocked:", error);
      setPersistenceError(error?.message || "This saved filter changed in another session and was not deleted.");
      setDeleteConfirm(null);
      await loadData();
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setEditingItem(null);
    setItemName("");
    setFilterConditions([{ field: "", operator: "equals", value: "" }]);
    setColumnSettings(ALL_COLUMNS);
    setActiveSubTab("pool");
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
      const SalesFilter = base44.entities.SalesFilter;
      const selectedBy = item.selected_by || [];
      const isSelected = selectedBy.includes(userEmail);
      
      try {
        await setSalesFilterSelectionSafely({
          entity: SalesFilter,
          recordId: item.id,
          userEmail,
          selected: !isSelected,
          label: `Saved filter ${item.name || item.id} selection`,
        });
        await loadData();
      } catch (error) {
        console.error("Saved filter selection update blocked:", error);
        setPersistenceError(error?.message || "This saved filter changed while your selection was being saved.");
        await loadData();
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
    setColumnSettings(columnSettings.map(col => 
      col.id === columnId ? { ...col, visible: !col.visible } : col
    ));
  };

  const moveColumn = (index, direction) => {
    const newSettings = [...columnSettings];
    if (direction === "up" && index > 0) {
      [newSettings[index], newSettings[index - 1]] = [newSettings[index - 1], newSettings[index]];
    } else if (direction === "down" && index < newSettings.length - 1) {
      [newSettings[index], newSettings[index + 1]] = [newSettings[index + 1], newSettings[index]];
    }
    setColumnSettings(newSettings);
  };

  const canDelete = (item) => {
    if (item.is_standard) return false;
    // Admins can delete any custom filter, others can only delete their own
    if (currentUser?.role === "admin") return true;
    return item.created_by === currentUser?.email;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogContent 
          className="clay-card border-none [&>button]:hidden" 
          style={{ maxWidth: "90vw", width: "1100px", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
        >
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl font-bold">
                {activeTab === "filters" ? "Manage Custom Information Filters" : "Manage Custom Column Filters"}
              </DialogTitle>
              <Button onClick={onClose} className="clay-button border-none">
                <Save className="w-4 h-4 mr-2" />
                Save & Close
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
          <div className="flex gap-2 mb-4">
            <Button
              size="sm"
              variant={activeSubTab === "pool" ? "default" : "outline"}
              onClick={() => setActiveSubTab("pool")}
            >
              {activeTab === "filters" ? "Information Filter Pool" : "Preset Pool"}
            </Button>
            <Button
              size="sm"
              variant={activeSubTab === "create" ? "default" : "outline"}
              onClick={() => {
                resetForm();
                setActiveSubTab("create");
              }}
            >
              {editingItem ? "Edit" : "Create New"}
            </Button>
          </div>

          {activeSubTab === "pool" && (
            <div className="space-y-4">
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
                            onClick={() => toggleSelection(item, true)}
                            className="hover:text-purple-600"
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
                            onClick={() => toggleSelection(item)}
                            className="hover:text-purple-600"
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
                      className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 cursor-pointer border transition-colors ${
                        isSelected(item, true) 
                          ? 'bg-blue-100 border-blue-300 text-blue-800' 
                          : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                      onClick={() => toggleSelection(item, true)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected(item, true)}
                        onChange={() => {}}
                        className="w-3 h-3"
                      />
                      {item.name}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 ml-0.5"
                        onClick={(e) => {
                          e.stopPropagation();
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
                        className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 cursor-pointer border transition-colors ${
                          isSelected(item) 
                            ? 'bg-green-100 border-green-300 text-green-800' 
                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                        onClick={() => toggleSelection(item)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected(item)}
                          onChange={() => {}}
                          className="w-3 h-3"
                        />
                        {item.name}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateItem(item);
                          }}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            editItem(item);
                          }}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        {canDelete(item) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
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
            <div className="space-y-4">
              <div className="clay-card p-4 space-y-4">
                <h3 className="font-bold text-lg">
                  {editingItem ? "Edit Information Filter" : "Create New Information Filter"}
                </h3>

                <div>
                  <Label>Filter Name</Label>
                  <Input
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g., High Priority Leads"
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
                      <div key={index} className="flex gap-2 mt-2 items-start">
                        <Select
                          value={condition.field}
                          onValueChange={(value) => {
                            updateCondition(index, "field", value);
                            updateCondition(index, "value", ""); // Reset value when field changes
                          }}
                        >
                          <SelectTrigger className="flex-1">
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
                          onValueChange={(value) => {
                            updateCondition(index, "operator", value);
                            // Reset value when switching between single/multi operators
                            const wasMulti = condition.operator === "is_one_of" || condition.operator === "is_not_one_of";
                            const nowMulti = value === "is_one_of" || value === "is_not_one_of";
                            if (wasMulti !== nowMulti) updateCondition(index, "value", "");
                          }}
                        >
                          <SelectTrigger className="w-40">
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
                              <div className="flex-1 border rounded-md p-2 bg-white min-h-[36px]">
                                <div className="flex flex-wrap gap-1 mb-1">
                                  {multiValues.map((val, vi) => (
                                    <span key={vi} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                                      {val}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newVals = multiValues.filter((_, i) => i !== vi);
                                          updateCondition(index, "value", newVals.join(","));
                                        }}
                                        className="hover:text-blue-600 font-bold"
                                      >×</button>
                                    </span>
                                  ))}
                                </div>
                                <Select
                                  value=""
                                  onValueChange={(val) => {
                                    if (!multiValues.includes(val)) {
                                      updateCondition(index, "value", [...multiValues, val].join(","));
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-7 text-xs">
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
                                className="flex-1"
                              />
                            ) : hasDropdownOptions ? (
                              <Select
                                value={condition.value}
                                onValueChange={(value) => updateCondition(index, "value", value)}
                              >
                                <SelectTrigger className="flex-1">
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
                                placeholder="Value"
                                className="flex-1"
                                type={selectedField?.type === "number" ? "number" : "text"}
                              />
                            )}
                          </>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCondition(index)}
                          disabled={filterConditions.length === 1}
                          className="flex-shrink-0"
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
                    className="mt-2"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Condition
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button onClick={saveItem} className="clay-button border-none" disabled={isSaving}>
                    <Save className="w-4 h-4 mr-2" />
                    {editingItem ? "Update Information Filter" : "Save Information Filter"}
                  </Button>
                  <Button variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === "create" && activeTab === "columns" && (
            <div className="space-y-3 overflow-y-auto flex-1">
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
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="mb-1 block text-sm">Column Settings - Toggle visibility</Label>
                  
                  <div className="flex flex-wrap gap-1">
                    {columnSettings.map((column) => (
                      <label 
                        key={column.id} 
                        className={`px-1.5 py-0.5 rounded border flex items-center gap-1 cursor-pointer ${
                          column.visible ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-400'
                        }`}
                        style={{ fontSize: '11px' }}
                      >
                        <input
                          type="checkbox"
                          checked={column.visible}
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

                <div className="clay-card p-2 bg-blue-50/50">
                  <Label className="mb-1 block font-bold text-sm">Preview</Label>
                  <p className="text-xs text-gray-500 mb-1">Arrows reorder columns. Scroll horizontally →</p>
                  <div className="border rounded-lg bg-white overflow-x-auto" style={{ maxHeight: '100px' }}>
                    <table className="border-collapse" style={{ fontSize: '10px', minWidth: 'max-content' }}>
                      <thead className="bg-gray-100">
                        <tr className="border-b">
                          {columnSettings.filter(c => c.visible).map((column, index) => (
                            <th key={column.id} className="px-1.5 py-1 border-r text-left font-medium text-gray-700 whitespace-nowrap">
                              <div className="flex items-center gap-0.5">
                                <span>{column.label}</span>
                                <div className="flex items-center">
                                  <button 
                                    onClick={() => moveColumn(columnSettings.indexOf(column), "up")}
                                    disabled={index === 0}
                                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                  </button>
                                  <button 
                                    onClick={() => moveColumn(columnSettings.indexOf(column), "down")}
                                    disabled={index === columnSettings.filter(c => c.visible).length - 1}
                                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                  </button>
                                </div>
                              </div>
                            </th>
                          ))}
                          <th className="px-1.5 py-1 text-left font-medium text-gray-700 whitespace-nowrap">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b hover:bg-gray-50 bg-white">
                          {columnSettings.filter(c => c.visible).map(column => (
                            <td key={column.id} className="px-1.5 py-1 border-r text-gray-700 whitespace-nowrap">
                              {column.id === "client_name" ? "Test" : 
                               column.id === "lead_source" ? "Web" :
                               column.id === "designer" ? "John" :
                               column.id === "project_manager" ? "Sarah" :
                               column.id === "estimator" ? "Mike" :
                               column.id === "current_task_assigned_to" ? "Carl" :
                               column.id === "current_task_description" ? "Follow up" :
                               column.id === "title" ? "Notes" :
                               column.id === "project_type" ? "Sign" :
                               column.id === "est_inv_at" ? "Loc A" :
                               column.id === "permit_number" ? "P-123" :
                               column.id.includes("date") && !column.id.includes("days") ? "1/1" : 
                               column.id.includes("amount") ? "$5k" : 
                               column.id.includes("days") ? "7" : 
                               column.id === "probability" ? "75%" :
                               "-"}
                            </td>
                          ))}
                          <td className="px-1.5 py-1 text-gray-500 whitespace-nowrap">•••</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={saveItem} className="clay-button border-none" disabled={isSaving}>
                    <Save className="w-4 h-4 mr-2" />
                    {editingItem ? "Update Preset" : "Save Preset"}
                  </Button>
                  <Button variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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