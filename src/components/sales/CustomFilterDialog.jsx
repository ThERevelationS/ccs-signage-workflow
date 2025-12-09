import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, Pencil, Copy, Users } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";

const FILTER_FIELDS = [
  { value: "client_name", label: "Customer" },
  { value: "lead_source", label: "Source" },
  { value: "current_task_assigned_to", label: "Task Assigned To" },
  { value: "designer", label: "Designer" },
  { value: "project_manager", label: "Project Manager" },
  { value: "estimator", label: "Estimator" },
  { value: "sales_status", label: "Status" },
  { value: "project_type", label: "Project Type" },
  { value: "estimate_amount", label: "Estimate Amount" },
  { value: "probability", label: "Probability" }
];

const OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "contains", label: "Contains" },
  { value: "greater_than", label: "Greater Than" },
  { value: "less_than", label: "Less Than" },
  { value: "not_empty", label: "Is Not Empty" },
  { value: "empty", label: "Is Empty" }
];

const ALL_COLUMNS = [
  { id: "client_name", label: "Customer", visible: true },
  { id: "lead_source", label: "Source", visible: true },
  { id: "current_task_deadline", label: "Deadline", visible: true },
  { id: "current_task_assigned_to", label: "Task Assigned", visible: true },
  { id: "designer", label: "Designer", visible: true },
  { id: "project_manager", label: "PM", visible: true },
  { id: "estimator", label: "Estimator", visible: true },
  { id: "est_inv_at", label: "Estimate/Invoice # Link", visible: true },
  { id: "estimate_amount", label: "Amount", visible: true },
  { id: "current_task_description", label: "Task Description", visible: true },
  { id: "date_initial_contact", label: "Initial", visible: true },
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
  { name: "All Leads", value: "all", conditions: [] },
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const SalesFilter = base44.entities.SalesFilter;
    const all = await SalesFilter.list();
    setFilters(all.filter(f => f.type === "filter"));
    setColumnPresets(all.filter(f => f.type === "column_preset"));
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

    if (editingItem && !editingItem.is_standard) {
      await SalesFilter.update(editingItem.id, data);
    } else {
      await SalesFilter.create(data);
    }

    await loadData();
    resetForm();
  };

  const duplicateItem = async (item) => {
    const SalesFilter = base44.entities.SalesFilter;
    await SalesFilter.create({
      name: `${item.name} (Copy)`,
      type: item.type,
      conditions: item.conditions || [],
      column_settings: item.column_settings || [],
      is_standard: false,
      created_by_name: currentUser?.full_name || currentUser?.email || "Unknown",
      selected_by: []
    });
    await loadData();
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
    await SalesFilter.delete(deleteConfirm.id);
    await loadData();
    setDeleteConfirm(null);
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
      
      await SalesFilter.update(item.id, {
        selected_by: isSelected 
          ? selectedBy.filter(e => e !== userEmail)
          : [...selectedBy, userEmail]
      });
      await loadData();
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
    return !item.is_standard && item.created_by === currentUser?.email;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="clay-card border-none max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl font-bold">
                {activeTab === "filters" ? "Manage Custom Filters" : "Manage Custom Column Filters"}
              </DialogTitle>
              <Button onClick={onClose} className="clay-button border-none">
                <Save className="w-4 h-4 mr-2" />
                Save & Close
              </Button>
            </div>
          </DialogHeader>

          {/* Sub-tabs */}
          <div className="flex gap-2 mb-4">
            <Button
              size="sm"
              variant={activeSubTab === "pool" ? "default" : "outline"}
              onClick={() => setActiveSubTab("pool")}
            >
              {activeTab === "filters" ? "Filter Pool" : "Preset Pool"}
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
            <div className="space-y-6">
              {/* Standard Items */}
              <div>
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Standard {activeTab === "filters" ? "Filters" : "Column Presets"}
                </h3>
                <div className="space-y-2">
                  {(activeTab === "filters" ? STANDARD_FILTERS : STANDARD_COLUMN_PRESETS).map(item => (
                    <div key={item.value || item.name} className="clay-card p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected(item, true)}
                          onChange={() => toggleSelection(item, true)}
                          className="w-4 h-4"
                        />
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-gray-500">System default</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => duplicateItem({ 
                          ...item, 
                          type: activeTab === "filters" ? "filter" : "column_preset",
                          column_settings: item.columns || []
                        })}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Items Pool */}
              <div>
                <h3 className="font-bold text-lg mb-3">
                  Custom {activeTab === "filters" ? "Filters" : "Column Presets"}
                </h3>
                {(activeTab === "filters" ? filters : columnPresets).length === 0 ? (
                  <p className="text-gray-500 text-sm">No custom {activeTab === "filters" ? "filters" : "presets"} yet. Create one!</p>
                ) : (
                  <div className="space-y-2">
                    {(activeTab === "filters" ? filters : columnPresets).map(item => (
                      <div key={item.id} className="clay-card p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <input
                            type="checkbox"
                            checked={isSelected(item)}
                            onChange={() => toggleSelection(item)}
                            className="w-4 h-4"
                          />
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-xs text-gray-500">
                              Created by {item.created_by_name} on {format(new Date(item.created_date), "MMM d, yyyy")}
                              {activeTab === "filters" && ` • ${item.conditions?.length || 0} condition${item.conditions?.length !== 1 ? 's' : ''}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => duplicateItem(item)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => editItem(item)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          {canDelete(item) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteItem(item)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          )}
                        </div>
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
                  {editingItem ? "Edit Filter" : "Create New Filter"}
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
                  {filterConditions.map((condition, index) => (
                    <div key={index} className="flex gap-2 mt-2">
                      <Select
                        value={condition.field}
                        onValueChange={(value) => updateCondition(index, "field", value)}
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
                        onValueChange={(value) => updateCondition(index, "operator", value)}
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
                        <Input
                          value={condition.value}
                          onChange={(e) => updateCondition(index, "value", e.target.value)}
                          placeholder="Value"
                          className="flex-1"
                        />
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCondition(index)}
                        disabled={filterConditions.length === 1}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  
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
                  <Button onClick={saveItem} className="clay-button border-none">
                    <Save className="w-4 h-4 mr-2" />
                    {editingItem ? "Update Filter" : "Save Filter"}
                  </Button>
                  <Button variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === "create" && activeTab === "columns" && (
            <div className="space-y-4">
              <div className="clay-card p-4 space-y-4">
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
                  <Label>Column Settings</Label>
                  <p className="text-sm text-gray-600 mb-3">
                    Customize which columns are visible and their order.
                  </p>
                  
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {columnSettings.map((column, index) => (
                      <div key={column.id} className="clay-card p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={column.visible}
                            onChange={() => toggleColumnVisibility(column.id)}
                            className="w-4 h-4"
                          />
                          <span className={column.visible ? "font-medium" : "text-gray-400"}>
                            {column.label}
                          </span>
                        </div>
                        
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveColumn(index, "up")}
                            disabled={index === 0}
                          >
                            ▲
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveColumn(index, "down")}
                            disabled={index === columnSettings.length - 1}
                          >
                            ▼
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={saveItem} className="clay-button border-none">
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
            <AlertDialogTitle>Delete {activeTab === "filters" ? "Filter" : "Preset"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}