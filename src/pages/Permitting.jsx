import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Settings, Link as LinkIcon, Search } from "lucide-react";
import PermitSpreadsheetRow from "@/components/permitting/PermitSpreadsheetRow";
import LocalityInfoPopup from "@/components/permitting/LocalityInfoPopup";
import AddPermitLineDialog from "@/components/permitting/AddPermitLineDialog";
import PermitSettingsDialog from "@/components/permitting/PermitSettingsDialog";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";

const WorkOrder = base44.entities.WorkOrder;
const PermitLineItem = base44.entities.PermitLineItem;
const PermitLocality = base44.entities.PermitLocality;
const GlobalSettings = base44.entities.GlobalSettings;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

export default function Permitting() {
  const { currentUser, isRegistered } = useAuth();
  const [lineItems, setLineItems] = useState([]);
  const [localities, setLocalities] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [officeTypes, setOfficeTypes] = useState(["Zoning", "Building", "Electrical Inspectors"]);
  const [isLoading, setIsLoading] = useState(true);
  const [focusedRowIndex, setFocusedRowIndex] = useState(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [localityInfoId, setLocalityInfoId] = useState(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    document.title = "Permitting - Workflow Manager";
    loadData();
    const interval = setInterval(() => loadData(false), 60000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const [items, locs, wos, usersData, settings] = await Promise.all([
        PermitLineItem.list('-updated_date', 500),
        PermitLocality.list(),
        WorkOrder.filter({ completed: false, deleted: { $ne: true } }),
        AuthorizedEmail.list(),
        GlobalSettings.list()
      ]);
      setLineItems(items);
      setLocalities(locs);
      setWorkOrders(wos);
      setUsers(usersData);
      
      const officeTypesSetting = settings.find(s => s.setting_key === 'permitOfficeTypes');
      if (officeTypesSetting?.setting_value?.items) {
        setOfficeTypes(officeTypesSetting.setting_value.items);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    }
    if (showLoading) setIsLoading(false);
  };

  const updateStep = async (lineItemId, stepId, updates) => {
    setLineItems(prev => prev.map(li => {
      if (li.id !== lineItemId) return li;
      const newSteps = (li.steps || []).map(s => s.id === stepId ? { ...s, ...updates } : s);
      
      // Auto-set next followup date if it's a followup_date type
      const updatedStep = newSteps.find(s => s.id === stepId);
      if (updatedStep?.type === 'followup_date' && updates.value) {
        const interval = updatedStep.followup_interval_days || 14;
        const d = new Date(updates.value);
        d.setDate(d.getDate() + interval);
        updatedStep.next_followup_date = d.toISOString().split('T')[0];
      }
      
      // Calculate next_followup_date and permit_received_date from steps
      let nextFollowup = null;
      let permitReceived = null;
      newSteps.forEach(s => {
        if (s.type === 'followup_date' && s.value) {
          if (!nextFollowup || s.value < nextFollowup) nextFollowup = s.value;
        }
        if (s.type === 'permit_received_date' && s.value) {
          permitReceived = s.value;
        }
      });
      
      const newStatus = permitReceived ? 'completed' : li.status;
      return { ...li, steps: newSteps, next_followup_date: nextFollowup, permit_received_date: permitReceived, status: newStatus };
    }));
    
    // Save to DB
    const item = lineItems.find(li => li.id === lineItemId);
    if (item) {
      const newSteps = (item.steps || []).map(s => s.id === stepId ? { ...s, ...updates } : s);
      const updatedStep = newSteps.find(s => s.id === stepId);
      if (updatedStep?.type === 'followup_date' && updates.value) {
        const interval = updatedStep.followup_interval_days || 14;
        const d = new Date(updates.value);
        d.setDate(d.getDate() + interval);
        updatedStep.next_followup_date = d.toISOString().split('T')[0];
      }
      let nextFollowup = null;
      let permitReceived = null;
      newSteps.forEach(s => {
        if (s.type === 'followup_date' && s.value) {
          if (!nextFollowup || s.value < nextFollowup) nextFollowup = s.value;
        }
        if (s.type === 'permit_received_date' && s.value) permitReceived = s.value;
      });
      const newStatus = permitReceived ? 'completed' : item.status;
      await PermitLineItem.update(lineItemId, { steps: newSteps, next_followup_date: nextFollowup, permit_received_date: permitReceived, status: newStatus });
    }
  };

  const updateField = async (lineItemId, field, value) => {
    setLineItems(prev => prev.map(li => li.id === lineItemId ? { ...li, [field]: value } : li));
    await PermitLineItem.update(lineItemId, { [field]: value });
  };

  const addLineItem = async (data) => {
    const created = await PermitLineItem.create(data);
    setLineItems(prev => [created, ...prev]);
  };

  // Get all unique step columns across all line items
  const stepColumns = useMemo(() => {
    const colMap = new Map();
    lineItems.forEach(li => {
      (li.steps || []).forEach(s => {
        if (!colMap.has(s.id)) {
          colMap.set(s.id, { id: s.id, name: s.name, type: s.type });
        }
      });
    });
    return Array.from(colMap.values());
  }, [lineItems]);

  // Filter and group line items
  const filtered = useMemo(() => {
    let items = lineItems;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      items = items.filter(li =>
        li.work_order_title?.toLowerCase().includes(q) ||
        li.work_order_description?.toLowerCase().includes(q) ||
        li.row_name?.toLowerCase().includes(q) ||
        li.locality_name?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [lineItems, searchTerm]);

  const today = new Date().toISOString().split('T')[0];

  const activeItems = filtered
    .filter(li => li.status === 'active' && (!li.next_followup_date || li.next_followup_date <= today))
    .sort((a, b) => {
      if (!a.next_followup_date && !b.next_followup_date) return 0;
      if (!a.next_followup_date) return -1;
      if (!b.next_followup_date) return 1;
      return a.next_followup_date.localeCompare(b.next_followup_date);
    });

  const waitingItems = filtered
    .filter(li => li.status === 'active' && li.next_followup_date && li.next_followup_date > today)
    .sort((a, b) => a.next_followup_date.localeCompare(b.next_followup_date));

  const completedItems = filtered
    .filter(li => li.status === 'completed')
    .sort((a, b) => (b.permit_received_date || "").localeCompare(a.permit_received_date || ""));

  const localityForInfo = localities.find(l => l.id === localityInfoId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const renderTable = (items, sectionTitle, sectionColor, globalIndexOffset = 0) => (
    <table className="w-full border-collapse" style={{ fontSize: '13px', minWidth: `${600 + stepColumns.length * 90}px`, tableLayout: 'auto' }}>
      <thead className="bg-gray-100 sticky top-0 z-10">
        <tr className="border-b">
          <th className="px-2 py-2 border-r text-center font-bold text-white" style={{ minWidth: '40px', background: sectionColor }}>
            #
          </th>
          <th className="px-1.5 py-2 border-r text-left font-bold text-gray-700" style={{ minWidth: '140px' }}>Client</th>
          <th className="px-1.5 py-2 border-r text-left font-bold text-gray-700" style={{ minWidth: '100px' }}>Row Name</th>
          <th className="px-1.5 py-2 border-r text-left font-bold text-gray-700" style={{ minWidth: '120px' }}>Locality</th>
          <th className="px-1.5 py-2 border-r text-left font-bold text-gray-700" style={{ minWidth: '80px' }}>Assigned</th>
          {stepColumns.map(col => (
            <th key={col.id} className="px-1 py-2 border-r text-center font-bold text-gray-700" style={{ minWidth: col.type === 'checkbox' ? '50px' : '85px' }}>
              <div className="text-xs leading-tight">{col.name}</div>
              <div className="text-[9px] text-gray-400 font-normal">
                {col.type === 'checkbox' ? '☑' : col.type === 'submitted_date' ? '📅' : col.type === 'followup_date' ? '🔔' : col.type === 'permit_received_date' ? '✅' : ''}
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((li, idx) => (
          <PermitSpreadsheetRow
            key={li.id}
            lineItem={li}
            index={globalIndexOffset + idx}
            isFocused={focusedRowIndex === globalIndexOffset + idx}
            onFocus={() => setFocusedRowIndex(focusedRowIndex === globalIndexOffset + idx ? null : globalIndexOffset + idx)}
            onUpdateStep={updateStep}
            onUpdateField={updateField}
            onShowLocalityInfo={setLocalityInfoId}
            isRegistered={isRegistered}
            stepColumns={stepColumns}
          />
        ))}
        {items.length === 0 && (
          <tr>
            <td colSpan={stepColumns.length + 5} className="px-3 py-8 text-center text-gray-500 text-sm">
              No {sectionTitle.toLowerCase()} items
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  return (
    <div className="h-full overflow-auto p-6">
      <div className="w-full">
        {/* Header */}
        <div className="clay-card p-5 mb-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Permitting Tracker</h1>
              <p className="text-sm text-gray-500 mt-0.5">{lineItems.length} total items · {activeItems.length} active · {waitingItems.length} waiting · {completedItems.length} completed</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="h-8 text-sm pl-8 w-48"
                />
              </div>
              {isRegistered && (
                <>
                  <Button onClick={() => setShowAddDialog(true)} size="sm" className="bg-purple-600 hover:bg-purple-700 gap-1">
                    <Plus className="w-4 h-4" /> Add Row
                  </Button>
                  {currentUser?.role === 'admin' && (
                    <Button onClick={() => setShowSettings(true)} size="sm" variant="outline" className="gap-1">
                      <Settings className="w-4 h-4" /> Settings
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Active Section */}
        <div className="clay-card p-4 w-full overflow-x-auto mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            🟢 Active ({activeItems.length})
            <span className="text-xs text-gray-400 font-normal">— needs attention now</span>
          </h3>
          {renderTable(activeItems, "Active", 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', 0)}
        </div>

        {/* Waiting Section */}
        {waitingItems.length > 0 && (
          <div className="clay-card p-4 w-full overflow-x-auto mb-5" style={{ borderLeft: '4px solid #f59e0b' }}>
            <h3 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-2">
              📅 Waiting / Upcoming ({waitingItems.length})
              <span className="text-xs text-gray-400 font-normal">— future follow-up dates</span>
            </h3>
            {renderTable(waitingItems, "Waiting", 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', activeItems.length)}
          </div>
        )}

        {/* Completed Section */}
        {completedItems.length > 0 && (
          <div className="clay-card p-4 w-full overflow-x-auto">
            <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-2">
              ✅ Completed ({completedItems.length})
            </h3>
            {renderTable(completedItems, "Completed", 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)', activeItems.length + waitingItems.length)}
          </div>
        )}
      </div>

      {/* Add Line Dialog */}
      <AddPermitLineDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSave={addLineItem}
        workOrders={workOrders}
        localities={localities}
        officeTypes={officeTypes}
      />

      {/* Locality Info Popup */}
      <LocalityInfoPopup
        locality={localityForInfo}
        isOpen={!!localityInfoId}
        onClose={() => setLocalityInfoId(null)}
      />

      {/* Settings Dialog */}
      {showSettings && (
        <PermitSettingsDialog
          isOpen={showSettings}
          onClose={() => { setShowSettings(false); loadData(false); }}
          localities={localities}
          officeTypes={officeTypes}
        />
      )}

      {/* Work Order Details Dialog */}
      {selectedWorkOrder && (
        <WorkOrderDetailsDialog
          isOpen={true}
          onClose={() => setSelectedWorkOrder(null)}
          workOrder={selectedWorkOrder}
          onUpdate={() => loadData(false)}
        />
      )}
    </div>
  );
}