import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Settings, Search, Plus } from "lucide-react";
import PermitClientGroup from "@/components/permitting/PermitClientGroup";
import LocalityInfoPopup from "@/components/permitting/LocalityInfoPopup";
import PermitSettingsDialog from "@/components/permitting/PermitSettingsDialog";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import AddPermitLineDialog from "@/components/permitting/AddPermitLineDialog";

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
  const [showSettings, setShowSettings] = useState(false);
  const [showAddLine, setShowAddLine] = useState(false);
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
      setLocalities(locs);
      setWorkOrders(wos);
      setUsers(usersData);
      
      const officeTypesSetting = settings.find(s => s.setting_key === 'permitOfficeTypes');
      const currentOfficeTypes = officeTypesSetting?.setting_value?.items || ["Zoning", "Building", "Electrical Inspectors"];
      setOfficeTypes(currentOfficeTypes);

      // Get task descriptions assigned to Permitting page
      const taskDescSetting = settings.find(s => s.setting_key === 'salesTaskDescriptions');
      const permittingTaskDescs = [];
      if (taskDescSetting?.setting_value?.items) {
        taskDescSetting.setting_value.items.forEach(item => {
          if (item.page === "Permitting") permittingTaskDescs.push(item.text);
        });
      }

      // Filter work orders that belong on Permitting page
      const permittingWOs = wos.filter(wo =>
        wo.current_task_description && permittingTaskDescs.includes(wo.current_task_description)
      );

      // Auto-create PermitLineItems for work orders that don't have ANY rows yet
      // Create one row per office type for each new work order
      const existingWOIds = new Set(items.map(li => li.work_order_id));
      const newItems = [];
      for (const wo of permittingWOs) {
        if (!existingWOIds.has(wo.id)) {
          for (const officeType of currentOfficeTypes) {
            // Find locality template for this office type if applicable
            const localityForWO = locs.find(l => l.categories?.includes(officeType));
            const steps = localityForWO?.workflow_steps?.map(s => ({
              ...s, value: "", checked: false
            })) || [];
            
            const created = await PermitLineItem.create({
              work_order_id: wo.id,
              work_order_title: wo.client_name || "",
              work_order_description: wo.description || "",
              row_name: "",
              office_type: officeType,
              locality_id: localityForWO?.id || "",
              locality_name: localityForWO?.name || "",
              status: "active",
              steps,
              priority: 0
            });
            newItems.push(created);
          }
        }
      }

      // Only show line items whose work order is still in permitting task descriptions
      const permittingWOIds = new Set(permittingWOs.map(wo => wo.id));
      const allItems = [...items, ...newItems];
      const visibleItems = allItems.filter(li => permittingWOIds.has(li.work_order_id) || li.status === 'completed');
      
      setLineItems(visibleItems);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    if (showLoading) setIsLoading(false);
  };

  const updateStep = useCallback(async (lineItemId, stepId, updates) => {
    let workOrderId = null;
    
    setLineItems(prev => prev.map(li => {
      if (li.id !== lineItemId) return li;
      workOrderId = li.work_order_id;
      const newSteps = (li.steps || []).map(s => s.id === stepId ? { ...s, ...updates } : s);
      
      // If a checkbox is being checked, mark associated date/text steps as completed
      const updatedStep = newSteps.find(s => s.id === stepId);
      if (updatedStep?.type === 'checkbox' && updates.checked === true) {
        // When checkbox is checked, timestamp it
        updatedStep.checked_date = new Date().toISOString().split('T')[0];
      }
      if (updatedStep?.type === 'checkbox' && updates.checked === false) {
        updatedStep.checked_date = null;
      }
      
      // Auto-set next followup date if it's a followup_date type
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
      if (updatedStep?.type === 'checkbox' && updates.checked === true) {
        updatedStep.checked_date = new Date().toISOString().split('T')[0];
      }
      if (updatedStep?.type === 'checkbox' && updates.checked === false) {
        updatedStep.checked_date = null;
      }
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
  }, [lineItems]);

  const updateField = useCallback(async (lineItemId, field, value) => {
    setLineItems(prev => prev.map(li => li.id === lineItemId ? { ...li, [field]: value } : li));
    await PermitLineItem.update(lineItemId, { [field]: value });
  }, []);

  // When notes are saved on a permit line item, also add to the work order's work_notes
  const updateNotesAndSync = useCallback(async (lineItemId, notesText) => {
    const item = lineItems.find(li => li.id === lineItemId);
    if (!item) return;
    
    // Save to line item
    setLineItems(prev => prev.map(li => li.id === lineItemId ? { ...li, notes: notesText } : li));
    await PermitLineItem.update(lineItemId, { notes: notesText });
    
    // Also add to work order's work_notes if there's text
    if (notesText && notesText.trim()) {
      const wo = workOrders.find(w => w.id === item.work_order_id);
      if (wo) {
        const officeLabel = item.office_type || "Permitting";
        const newNote = {
          id: Date.now(),
          type: "permitting",
          text: `[${officeLabel}] ${notesText}`,
          timestamp: new Date().toISOString(),
          created_by: currentUser?.full_name || currentUser?.email || "System",
          sub_tasks: []
        };
        const existingNotes = wo.work_notes || [];
        await WorkOrder.update(wo.id, { work_notes: [...existingNotes, newNote] });
      }
    }
  }, [lineItems, workOrders, currentUser]);

  const updateLocality = useCallback(async (lineItemId, localityId) => {
    const locality = localities.find(l => l.id === localityId);
    const updates = {
      locality_id: localityId || "",
      locality_name: locality?.name || "",
    };
    if (locality?.workflow_steps?.length > 0) {
      const item = lineItems.find(li => li.id === lineItemId);
      const existingStepIds = new Set((item?.steps || []).map(s => s.id));
      const newSteps = [...(item?.steps || [])];
      locality.workflow_steps.forEach(tmplStep => {
        if (!existingStepIds.has(tmplStep.id)) {
          newSteps.push({ ...tmplStep, value: "", checked: false });
        }
      });
      updates.steps = newSteps;
    }
    setLineItems(prev => prev.map(li => li.id === lineItemId ? { ...li, ...updates } : li));
    await PermitLineItem.update(lineItemId, updates);
  }, [localities, lineItems]);

  const addLineItem = useCallback(async (data) => {
    const created = await PermitLineItem.create(data);
    setLineItems(prev => [...prev, created]);
  }, []);

  const deleteLineItem = useCallback(async (lineItemId) => {
    await PermitLineItem.delete(lineItemId);
    setLineItems(prev => prev.filter(li => li.id !== lineItemId));
  }, []);

  const openWorkOrder = (workOrderId) => {
    const wo = workOrders.find(w => w.id === workOrderId);
    if (wo) setSelectedWorkOrder(wo);
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

  // Filter items
  const filtered = useMemo(() => {
    let items = lineItems;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      items = items.filter(li =>
        li.work_order_title?.toLowerCase().includes(q) ||
        li.work_order_description?.toLowerCase().includes(q) ||
        li.row_name?.toLowerCase().includes(q) ||
        li.locality_name?.toLowerCase().includes(q) ||
        li.office_type?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [lineItems, searchTerm]);

  // Group by work order for multilayered display
  const today = new Date().toISOString().split('T')[0];

  const groupItemsByWorkOrder = (items) => {
    const groups = {};
    items.forEach(li => {
      const key = li.work_order_id;
      if (!groups[key]) {
        groups[key] = {
          work_order_id: li.work_order_id,
          work_order_title: li.work_order_title,
          work_order_description: li.work_order_description,
          lines: []
        };
      }
      groups[key].lines.push(li);
    });
    return Object.values(groups);
  };

  // Determine status of a group based on its lines
  const getGroupStatus = (group) => {
    const allCompleted = group.lines.every(li => li.status === 'completed');
    if (allCompleted && group.lines.length > 0) return 'completed';
    
    const hasActiveNow = group.lines.some(li => 
      li.status === 'active' && (!li.next_followup_date || li.next_followup_date <= today)
    );
    if (hasActiveNow) return 'active';
    
    return 'waiting';
  };

  const activeGroups = groupItemsByWorkOrder(
    filtered.filter(li => li.status === 'active' && (!li.next_followup_date || li.next_followup_date <= today))
  );
  const waitingGroups = groupItemsByWorkOrder(
    filtered.filter(li => li.status === 'active' && li.next_followup_date && li.next_followup_date > today)
  );
  const completedGroups = groupItemsByWorkOrder(
    filtered.filter(li => li.status === 'completed')
  );

  const localityForInfo = localities.find(l => l.id === localityInfoId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const renderSection = (groups, sectionTitle, sectionColor, emoji) => (
    <div className="clay-card p-4 w-full overflow-x-auto mb-5" style={sectionTitle === 'Waiting' ? { borderLeft: '4px solid #f59e0b' } : {}}>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: sectionTitle === 'Active' ? '#16a34a' : sectionTitle === 'Waiting' ? '#d97706' : '#6b7280' }}>
        {emoji} {sectionTitle} ({groups.reduce((sum, g) => sum + g.lines.length, 0)} lines across {groups.length} clients)
        {sectionTitle === 'Active' && <span className="text-xs text-gray-400 font-normal">— needs attention now</span>}
        {sectionTitle === 'Waiting' && <span className="text-xs text-gray-400 font-normal">— future follow-up dates</span>}
      </h3>
      
      <div style={{ minWidth: `${600 + stepColumns.length * 90}px` }}>
        {/* Column Headers */}
        <div className="flex items-end border-b bg-gray-100 sticky top-0 z-10" style={{ fontSize: '12px' }}>
          <div className="px-2 py-2 font-bold text-white text-center flex-shrink-0" style={{ width: '150px', background: sectionColor }}>#</div>
          <div className="px-1.5 py-2 font-bold text-gray-700 flex-shrink-0" style={{ width: '90px' }}>Office Type</div>
          <div className="px-1.5 py-2 font-bold text-gray-700 flex-shrink-0" style={{ width: '120px' }}>Locality</div>
          <div className="px-1.5 py-2 font-bold text-gray-700 flex-shrink-0" style={{ width: '80px' }}>Assigned</div>
          <div className="px-1.5 py-2 font-bold text-gray-700 flex-shrink-0" style={{ width: '100px' }}>Notes</div>
          {stepColumns.map(col => (
            <div key={col.id} className="px-1 py-2 text-center font-bold text-gray-700 flex-shrink-0" style={{ width: col.type === 'checkbox' ? '50px' : '85px' }}>
              <div className="text-xs leading-tight">{col.name}</div>
              <div className="text-[9px] text-gray-400 font-normal">
                {col.type === 'checkbox' ? '☑' : col.type === 'submitted_date' ? '📅' : col.type === 'followup_date' ? '🔔' : col.type === 'permit_received_date' ? '✅' : '📝'}
              </div>
            </div>
          ))}
        </div>
        
        {groups.length === 0 && (
          <div className="px-3 py-8 text-center text-gray-500 text-sm">
            No {sectionTitle.toLowerCase()} items
          </div>
        )}
        
        {groups.map(group => (
          <PermitClientGroup
            key={group.work_order_id}
            group={group}
            onUpdateStep={updateStep}
            onUpdateField={updateField}
            onUpdateNotes={updateNotesAndSync}
            onUpdateLocality={updateLocality}
            onOpenWorkOrder={openWorkOrder}
            onShowLocalityInfo={setLocalityInfoId}
            onDeleteLine={deleteLineItem}
            onAddLine={addLineItem}
            isRegistered={isRegistered}
            stepColumns={stepColumns}
            localities={localities}
            officeTypes={officeTypes}
            today={today}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-auto p-6">
      <div className="w-full">
        {/* Header */}
        <div className="clay-card p-5 mb-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Permitting Tracker</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {lineItems.length} total lines · {filtered.filter(li => li.status === 'active').length} active · {filtered.filter(li => li.status === 'completed').length} completed
              </p>
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
                <Button onClick={() => setShowAddLine(true)} size="sm" variant="outline" className="gap-1">
                  <Plus className="w-4 h-4" /> Add Line
                </Button>
              )}
              {isRegistered && currentUser?.role === 'admin' && (
                <Button onClick={() => setShowSettings(true)} size="sm" variant="outline" className="gap-1">
                  <Settings className="w-4 h-4" /> Settings
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Active Section */}
        {renderSection(activeGroups, "Active", 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', '🟢')}

        {/* Waiting Section */}
        {waitingGroups.length > 0 && renderSection(waitingGroups, "Waiting", 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', '📅')}

        {/* Completed Section */}
        {completedGroups.length > 0 && renderSection(completedGroups, "Completed", 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)', '✅')}
      </div>

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

      {/* Add Line Dialog */}
      {showAddLine && (
        <AddPermitLineDialog
          isOpen={showAddLine}
          onClose={() => setShowAddLine(false)}
          onSave={addLineItem}
          workOrders={workOrders}
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