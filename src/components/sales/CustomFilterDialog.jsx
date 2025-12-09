import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, Pencil } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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

const COLUMN_FIELDS = [
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
  { id: "days_calculations", label: "Days Calculations", visible: true },
  { id: "quote_date", label: "Quote", visible: true },
  { id: "follow_up_date", label: "Follow Up", visible: true },
  { id: "close_date", label: "Close", visible: true },
  { id: "probability", label: "Prob", visible: true },
  { id: "start_date", label: "Start", visible: true },
  { id: "project_type", label: "Project Type", visible: true }
];

export default function CustomFilterDialog({ isOpen, onClose }) {
  const [filters, setFilters] = useState([]);
  const [editingFilter, setEditingFilter] = useState(null);
  const [filterName, setFilterName] = useState("");
  const [filterConditions, setFilterConditions] = useState([{ field: "", operator: "equals", value: "" }]);
  const [columnSettings, setColumnSettings] = useState(COLUMN_FIELDS);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [activeTab, setActiveTab] = useState("filters"); // "filters" or "columns"

  useEffect(() => {
    loadFilters();
  }, []);

  const loadFilters = async () => {
    // Load custom filters from localStorage for now
    const saved = localStorage.getItem("salesCustomFilters");
    if (saved) {
      setFilters(JSON.parse(saved));
    }
  };

  const saveFilters = (newFilters) => {
    localStorage.setItem("salesCustomFilters", JSON.stringify(newFilters));
    setFilters(newFilters);
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

  const saveFilter = () => {
    if (!filterName.trim()) {
      alert("Please enter a filter name");
      return;
    }

    const newFilter = {
      id: editingFilter?.id || Date.now().toString(),
      name: filterName,
      conditions: filterConditions,
      columnSettings: columnSettings
    };

    let updatedFilters;
    if (editingFilter) {
      updatedFilters = filters.map(f => f.id === editingFilter.id ? newFilter : f);
    } else {
      updatedFilters = [...filters, newFilter];
    }

    saveFilters(updatedFilters);
    resetForm();
  };

  const editFilter = (filter) => {
    setEditingFilter(filter);
    setFilterName(filter.name);
    setFilterConditions(filter.conditions);
    setColumnSettings(filter.columnSettings || COLUMN_FIELDS);
    setActiveTab("filters");
  };

  const deleteFilter = (filter) => {
    setDeleteConfirm(filter);
  };

  const confirmDelete = () => {
    const updatedFilters = filters.filter(f => f.id !== deleteConfirm.id);
    saveFilters(updatedFilters);
    setDeleteConfirm(null);
  };

  const resetForm = () => {
    setEditingFilter(null);
    setFilterName("");
    setFilterConditions([{ field: "", operator: "equals", value: "" }]);
    setColumnSettings(COLUMN_FIELDS);
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

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="clay-card border-none max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Custom Filters & Column Settings</DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-2 border-b pb-2 mb-4">
            <Button
              variant={activeTab === "filters" ? "default" : "ghost"}
              onClick={() => setActiveTab("filters")}
              className={activeTab === "filters" ? "clay-button border-none" : ""}
            >
              Filters
            </Button>
            <Button
              variant={activeTab === "columns" ? "default" : "ghost"}
              onClick={() => setActiveTab("columns")}
              className={activeTab === "columns" ? "clay-button border-none" : ""}
            >
              Column Settings
            </Button>
          </div>

          {activeTab === "filters" && (
            <div className="space-y-6">
              {/* Create/Edit Filter Form */}
              <div className="clay-card p-4 space-y-4">
                <h3 className="font-bold text-lg">
                  {editingFilter ? "Edit Filter" : "Create New Filter"}
                </h3>

                <div>
                  <Label>Filter Name</Label>
                  <Input
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
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
                  <Button onClick={saveFilter} className="clay-button border-none">
                    <Save className="w-4 h-4 mr-2" />
                    {editingFilter ? "Update Filter" : "Save Filter"}
                  </Button>
                  {editingFilter && (
                    <Button variant="outline" onClick={resetForm}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>

              {/* Saved Filters List */}
              <div>
                <h3 className="font-bold text-lg mb-3">Saved Filters</h3>
                {filters.length === 0 ? (
                  <p className="text-gray-500 text-sm">No custom filters yet. Create one above!</p>
                ) : (
                  <div className="space-y-2">
                    {filters.map(filter => (
                      <div key={filter.id} className="clay-card p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{filter.name}</p>
                          <p className="text-xs text-gray-500">
                            {filter.conditions.length} condition{filter.conditions.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => editFilter(filter)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteFilter(filter)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "columns" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Customize which columns are visible and their order in the sales pipeline spreadsheet.
              </p>
              
              <div className="space-y-2">
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

              <Button
                onClick={() => {
                  // Save column settings to the current filter
                  if (editingFilter) {
                    const updated = filters.map(f => 
                      f.id === editingFilter.id ? { ...f, columnSettings } : f
                    );
                    saveFilters(updated);
                  }
                  alert("Column settings saved!");
                }}
                className="clay-button border-none"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Column Settings
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Filter?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the filter "{deleteConfirm?.name}"? This action cannot be undone.
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