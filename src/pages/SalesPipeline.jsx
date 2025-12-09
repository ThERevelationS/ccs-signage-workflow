import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Filter, Search, Plus, Upload, Download, Loader2, Settings } from "lucide-react";
import SalesPipelineSpreadsheet from "@/components/sales/SalesPipelineSpreadsheet";
import WorkOrderForm from "@/components/workflow/WorkOrderForm";
import CustomFilterDialog from "@/components/sales/CustomFilterDialog";

export default function SalesPipeline() {
  const { isRegistered, currentUser } = useAuth();
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [showCustomFilterDialog, setShowCustomFilterDialog] = useState(false);
  const [showColumnFilterDialog, setShowColumnFilterDialog] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const [activeColumnPreset, setActiveColumnPreset] = useState(null);
  const spreadsheetRef = useRef(null);

  useEffect(() => {
    loadActiveFilters();
  }, [currentUser]);

  const loadActiveFilters = async () => {
    const SalesFilter = base44.entities.SalesFilter;
    const allFilters = await SalesFilter.list();
    const userEmail = currentUser?.email || "";
    const selected = allFilters.filter(f => f.selected_by?.includes(userEmail));
    setActiveFilters(selected);
    
    // Load active column preset
    const columnPreset = selected.find(f => f.type === "column_preset");
    setActiveColumnPreset(columnPreset || null);
  };

  const isStandardFilterEnabled = (value) => {
    const key = `sales_standard_${value}_selected`;
    return localStorage.getItem(key) === "true";
  };

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="w-full max-w-[98%] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="clay-card p-3">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Sales Pipeline</h1>
              <p className="text-gray-600 text-sm">Manage leads and opportunities before they enter the workflow</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRegistered && (
              <Button 
                onClick={() => setShowNewClientForm(true)}
                className="clay-button border-none text-gray-800"
                style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Client
              </Button>
            )}

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search leads..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-64"
              />
            </div>

            <Select value={filterStatus} onValueChange={(value) => {
              if (value === "manage_filters") {
                setShowCustomFilterDialog(true);
              } else {
                setFilterStatus(value);
              }
            }}>
              <SelectTrigger className="w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isStandardFilterEnabled("all") && <SelectItem value="all">All Leads</SelectItem>}
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
                    Manage Filters & Columns
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <Select 
              value={activeColumnPreset?.id || ""} 
              onValueChange={(value) => {
                if (value === "manage_filters") {
                  setShowCustomFilterDialog(true);
                } else if (value) {
                  const preset = activeFilters.find(f => f.id === value);
                  setActiveColumnPreset(preset || null);
                } else {
                  setActiveColumnPreset(null);
                }
              }}
            >
              <SelectTrigger className="w-48">
                <Settings className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Column Filters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Default View</SelectItem>
                {activeFilters.filter(f => f.type === "column_preset").map(preset => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
                <div className="h-px bg-gray-800 my-2 mx-2"></div>
                <SelectItem value="manage_filters">
                  <div className="flex items-center gap-2 font-bold">
                    <Settings className="w-4 h-4" />
                    Manage Filters & Columns
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            
            {isRegistered && (
              <Button 
                onClick={() => spreadsheetRef.current?.importFromExcel()}
                size="sm" 
                className="h-8 px-2"
                variant="ghost"
              >
                <Upload className="w-3 h-3" />
              </Button>
            )}

            <Button 
              onClick={() => spreadsheetRef.current?.exportToExcel()}
              size="sm" 
              className="h-8 px-2"
              variant="ghost"
            >
              <Download className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="clay-card p-4">
          <SalesPipelineSpreadsheet 
            ref={spreadsheetRef}
            searchTerm={searchTerm} 
            filterStatus={filterStatus}
            showButtonsInline={false}
            activeColumnPreset={activeColumnPreset}
            customFilters={activeFilters.filter(f => f.type === "filter")}
          />
        </div>
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