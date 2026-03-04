import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Filter, Search, Plus, Upload, Download, Loader2, Settings, Inbox } from "lucide-react";
import SalesPipelineSpreadsheet from "@/components/sales/SalesPipelineSpreadsheet";
import WorkOrderForm from "@/components/workflow/WorkOrderForm";
import CustomFilterDialog from "@/components/sales/CustomFilterDialog";
import PendingImportsPanel from "@/components/sales/PendingImportsPanel";

const AuthorizedEmail = base44.entities.AuthorizedEmail;

export default function SalesPipeline() {
  const { isRegistered, currentUser } = useAuth();
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [showCustomFilterDialog, setShowCustomFilterDialog] = useState(false);
  const [showColumnFilterDialog, setShowColumnFilterDialog] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const [activeColumnPreset, setActiveColumnPreset] = useState(null);
  const [canImportExport, setCanImportExport] = useState(false);
  const [showPendingImports, setShowPendingImports] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const spreadsheetRef = useRef(null);

  useEffect(() => {
    const loadCount = async () => {
      try {
        const res = await base44.entities.PendingImport.filter({ status: 'pending' });
        setPendingCount(Array.isArray(res) ? res.length : 0);
      } catch {}
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
              <span className="text-xs font-medium text-gray-500 mb-1">Search</span>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search leads..."
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
                    Manage Custom Information Filters
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            </div>

            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-500 mb-1">Column Filters</span>
              <Select 
              value={activeColumnPreset?.id || ""} 
              onValueChange={(value) => {
                if (value === "manage_columns") {
                  setShowColumnFilterDialog(true);
                } else if (value) {
                  const preset = activeFilters.find(f => f.id === value);
                  setActiveColumnPreset(preset || null);
                } else {
                  setActiveColumnPreset(null);
                }
              }}
            >
              <SelectTrigger className="w-48 h-9">
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

        {showPendingImports ? (
          <div className="clay-card p-4 overflow-auto" style={{ flex: 1, minHeight: 0 }}>
            <div className="flex items-center gap-2 mb-4">
              <Inbox className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-bold text-gray-800">Pending AI Imports</h2>
              <span className="text-xs text-gray-500">Review and approve or merge Corebridge emails that couldn't be automatically matched.</span>
            </div>
            <PendingImportsPanel onCountChange={setPendingCount} />
          </div>
        ) : (
          <SalesPipelineSpreadsheet 
            ref={spreadsheetRef}
            searchTerm={searchTerm} 
            filterStatus={filterStatus}
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