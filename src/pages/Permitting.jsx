import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Settings, Search } from "lucide-react";
import PermitClientGroup from "@/components/permitting/PermitClientGroup";
import LocalityInfoPopup from "@/components/permitting/LocalityInfoPopup";
import PermitSettingsDialog from "@/components/permitting/PermitSettingsDialog";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import StageTasksPanel from "@/components/workflow/StageTasksPanel";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import { mutateWorkOrderArrayField, replaceWorkOrderFieldsIfUnchanged } from "@/components/workflow/workOrderPersistence";
import { deleteEntityIfUnchanged, expectedEntityFields, replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

const WorkOrder = base44.entities.WorkOrder;
const PermitLineItem = base44.entities.PermitLineItem;
const PermitLocality = base44.entities.PermitLocality;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

export default function Permitting() {
  const { currentUser, sessionToken, isRegistered } = useAuth();
  const [lineItems, setLineItems] = useState([]);
  const [localities, setLocalities] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [officeTypes, setOfficeTypes] = useState(["Zoning", "Building", "Electrical Inspectors"]);
  const [taskDescriptions, setTaskDescriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [localityInfoId, setLocalityInfoId] = useState(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [workOrderEditError, setWorkOrderEditError] = useState("");
  const [permitLineEditError, setPermitLineEditError] = useState("");
  const lineItemBaselinesRef = useRef(new Map());
  const lineItemMutationQueuesRef = useRef(new Map());
  const lineItemMutationCountRef = useRef(0);
  const localityCreateInFlightRef = useRef(new Set());

  useEffect(() => {
    document.title = "Permitting - Workflow Manager";
    loadData();
    const interval = setInterval(() => loadData(false), 60000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async (showLoading = true) => {
    if (!showLoading && lineItemMutationCountRef.current > 0) return;
    if (showLoading) setIsLoading(true);
    try {
      const [items, locs, wos, usersData, officeTypesSetting, taskDescSetting] = await Promise.all([
        loadAllEntityRows({ entity: PermitLineItem, sort: '-updated_date', label: "Permitting line items" }),
        loadAllEntityRows({ entity: PermitLocality, sort: null, label: "Permitting localities" }),
        loadAllEntityRows({
          entity: WorkOrder,
          query: { completed: false, deleted: { $ne: true } },
          sort: "created_date",
          label: "Permitting Work Orders",
        }),
        loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "Permitting authorized users" }),
        loadSingleGlobalSetting({
          entity: base44.entities.GlobalSettings,
          settingKey: "permitOfficeTypes",
          label: "Permitting office types",
        }),
        loadSingleGlobalSetting({
          entity: base44.entities.GlobalSettings,
          settingKey: "salesTaskDescriptions",
          label: "Permitting sales task descriptions",
        })
      ]);
      setLocalities(locs);
      setUsers(usersData);

      const currentOfficeTypes = officeTypesSetting?.setting_value?.items || ["Zoning", "Building", "Electrical Inspectors"];
      setOfficeTypes(currentOfficeTypes);

      // Get task descriptions assigned to Permitting page
      const permittingTaskDescs = [];
      const allTaskDescs = [];
      if (taskDescSetting?.setting_value?.items) {
        taskDescSetting.setting_value.items.forEach(item => {
          if (item.page === "Permitting") permittingTaskDescs.push(item.text);
          if (item.text) allTaskDescs.push(item.text);
        });
      }
      setTaskDescriptions(allTaskDescs);

      // Work orders on the Permitting page
      const permittingWOs = wos.filter(wo =>
        wo.current_task_description && permittingTaskDescs.includes(wo.current_task_description)
      );

      // Only keep line items whose work order is still in permitting
      const permittingWOIds = new Set(permittingWOs.map(wo => wo.id));
      const visibleItems = items.filter(li => permittingWOIds.has(li.work_order_id));

      // Store only permitting WOs (so the "no lines" group only shows real permitting WOs)
      setWorkOrders(permittingWOs);
      lineItemBaselinesRef.current = new Map(visibleItems.map((item) => [item.id, item]));
      setLineItems(visibleItems);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    if (showLoading) setIsLoading(false);
  };

  const persistPermitLineItemFields = useCallback((lineItemId, nextFields, label = "Permit line update") => {
    const id = String(lineItemId || "").trim();
    if (!id || !nextFields || Object.keys(nextFields).length === 0) return Promise.resolve(null);

    lineItemMutationCountRef.current += 1;
    const previous = lineItemMutationQueuesRef.current.get(id) || Promise.resolve();

    let tracked;
    const operation = previous.catch(() => null).then(async () => {
      const baseline = lineItemBaselinesRef.current.get(id);
      if (!baseline?.id) {
        setPermitLineEditError(`${label} could not find its loaded Permit line. Reload latest data before retrying.`);
        return null;
      }

      try {
        const saved = await replaceEntityFieldsIfUnchanged({
          entity: PermitLineItem,
          id,
          expectedFields: expectedEntityFields(baseline, nextFields),
          nextFields,
          label,
        });
        lineItemBaselinesRef.current.set(id, saved);
        setLineItems(prev => prev.map(li => li.id === id ? { ...li, ...nextFields, updated_date: saved.updated_date } : li));
        setPermitLineEditError("");
        return saved;
      } catch (error) {
        console.error(`${label} blocked:`, error);
        const latest = await PermitLineItem.get(id).catch(() => null);
        if (latest?.id) {
          lineItemBaselinesRef.current.set(id, latest);
          setLineItems(prev => prev.map(li => li.id === id ? latest : li));
        }
        setPermitLineEditError(error?.message || `${label} changed in another session. Reload latest data before retrying.`);
        return null;
      }
    });

    tracked = operation.finally(() => {
      lineItemMutationCountRef.current = Math.max(0, lineItemMutationCountRef.current - 1);
      if (lineItemMutationQueuesRef.current.get(id) === tracked) {
        lineItemMutationQueuesRef.current.delete(id);
      }
    });
    lineItemMutationQueuesRef.current.set(id, tracked);
    return tracked;
  }, []);

  const deletePermitLineItemSafely = useCallback(async (lineItemId) => {
    const id = String(lineItemId || "").trim();
    if (!id) return false;

    const queued = lineItemMutationQueuesRef.current.get(id);
    if (queued) await queued.catch(() => null);

    const baseline = lineItemBaselinesRef.current.get(id);
    if (!baseline?.id) {
      setPermitLineEditError("Permit line deletion could not find its loaded record. Reload latest data before retrying.");
      return false;
    }

    lineItemMutationCountRef.current += 1;
    try {
      await deleteEntityIfUnchanged({
        entity: PermitLineItem,
        record: baseline,
        guardFields: { work_order_id: baseline.work_order_id },
        label: "Permit line deletion",
      });
      lineItemBaselinesRef.current.delete(id);
      setLineItems(prev => prev.filter(li => li.id !== id));
      setPermitLineEditError("");
      return true;
    } catch (error) {
      console.error("Permit line deletion blocked:", error);
      const latest = await PermitLineItem.get(id).catch(() => null);
      if (latest?.id) {
        lineItemBaselinesRef.current.set(id, latest);
        setLineItems(prev => prev.map(li => li.id === id ? latest : li));
      }
      setPermitLineEditError(error?.message || "Permit line changed in another session. Reload latest data before deleting it.");
      return false;
    } finally {
      lineItemMutationCountRef.current = Math.max(0, lineItemMutationCountRef.current - 1);
    }
  }, []);

  // Work orders on permitting that don't have any line items yet — these show as "unassigned" groups
  const permittingWorkOrdersWithoutLines = useMemo(() => {
    const withLineIds = new Set(lineItems.map(li => li.work_order_id));
    return workOrders.filter(wo => {
      if (withLineIds.has(wo.id)) return false;
      // Only include WOs that are actually visible on permitting (based on task description)
      // We already filtered lineItems to permitting WOs, so any WO in workOrders not in lineItems and matching search is candidate
      return true;
    });
  }, [workOrders, lineItems]);

  const updateStep = useCallback(async (lineItemId, stepId, updates) => {
    const item = lineItems.find(li => li.id === lineItemId);
    if (!item) return;

    const newSteps = (item.steps || []).map(s => s.id === stepId ? { ...s, ...updates } : s);
    const updatedStep = newSteps.find(s => s.id === stepId);

    if (updatedStep?.type === 'checkbox' && updates.checked === true) {
      updatedStep.checked_date = new Date().toISOString().split('T')[0];
    }
    if (updatedStep?.type === 'checkbox' && updates.checked === false) {
      updatedStep.checked_date = null;
    }
    if (updatedStep?.type === 'followup_date') {
      if (updates.value) {
        const interval = updatedStep.followup_interval_days || 14;
        const d = new Date(`${updates.value}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + interval);
        updatedStep.next_followup_date = d.toISOString().split('T')[0];
      } else if (Object.prototype.hasOwnProperty.call(updates, 'value')) {
        updatedStep.next_followup_date = null;
      }
    }

    let nextFollowup = null;
    let submittedDate = null;
    let permitReceived = null;
    newSteps.forEach(s => {
      if (s.type === 'followup_date' && s.value) {
        const scheduledFollowup = s.next_followup_date || s.value;
        if (!nextFollowup || scheduledFollowup < nextFollowup) nextFollowup = scheduledFollowup;
      }
      if (s.type === 'submitted_date' && s.value) {
        if (!submittedDate || s.value < submittedDate) submittedDate = s.value;
      }
      if (s.type === 'permit_received_date' && s.value) permitReceived = s.value;
    });
    const newStatus = permitReceived ? 'completed' : 'active';

    const lineUpdate = { steps: newSteps, next_followup_date: nextFollowup, permit_received_date: permitReceived, submitted_date: submittedDate, status: newStatus };
    setLineItems(prev => prev.map(li => li.id === lineItemId ? { ...li, ...lineUpdate } : li));
    const savedLine = await persistPermitLineItemFields(lineItemId, lineUpdate, "Permit workflow step update");
    if (!savedLine) return;

    // ── Fire permit automations only after the PermitLineItem update is durable. ──
    // The server authenticates the Sign Shop session and rereads both the PermitLineItem
    // and WorkOrder, so browser-supplied WorkOrder state cannot forge automation context.
    const fireTrigger = async (event_type) => {
      try {
        await base44.functions.invoke('processWorkflowTriggers', {
          event_type,
          permit_line_item_id: savedLine.id,
          session_token: sessionToken,
        });
      } catch (e) {
        console.warn('Permit trigger failed:', e);
      }
    };

    // Submitted Date newly set
    if (updatedStep?.type === 'submitted_date' && updates.value && !item.submitted_date) {
      fireTrigger('permit_submitted');
    }
    // Permit Received newly set
    if (updatedStep?.type === 'permit_received_date' && updates.value && !item.permit_received_date) {
      fireTrigger('permit_received');
    }
  }, [lineItems, sessionToken, persistPermitLineItemFields]);

  const updateField = useCallback(async (lineItemId, field, value) => {
    setLineItems(prev => prev.map(li => li.id === lineItemId ? { ...li, [field]: value } : li));
    await persistPermitLineItemFields(lineItemId, { [field]: value }, `Permit ${field} update`);
  }, [persistPermitLineItemFields]);

  // Notes sync to work order's work_notes
  const updateNotesAndSync = useCallback(async (lineItemId, notesText) => {
    const item = lineItems.find(li => li.id === lineItemId);
    if (!item) return;

    setLineItems(prev => prev.map(li => li.id === lineItemId ? { ...li, notes: notesText } : li));
    const savedLine = await persistPermitLineItemFields(lineItemId, { notes: notesText }, "Permit notes update");
    if (!savedLine) return;

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
        const saved = await mutateWorkOrderArrayField({
          workOrderId: wo.id,
          field: "work_notes",
          label: "Permitting Work Order notes",
          mutate: (currentNotes) => currentNotes.some((note) => note?.id === newNote.id)
            ? currentNotes
            : [...currentNotes, newNote],
        });
        setWorkOrders(prev => prev.map((row) => row.id === wo.id
          ? { ...row, work_notes: saved.work_notes || [], updated_date: saved.updated_date }
          : row));
        setSelectedWorkOrder(prev => prev?.id === wo.id
          ? { ...prev, work_notes: saved.work_notes || [], updated_date: saved.updated_date }
          : prev);
      }
    }
  }, [lineItems, workOrders, currentUser, persistPermitLineItemFields]);

  // When a locality is selected on a work order with no line items yet,
  // create one line item per OFFICE configured in that locality's settings.
  // Each office has its own workflow_steps.
  const selectLocalityForWorkOrder = useCallback(async (workOrderId, localityId, opts = {}) => {
    const { excludeElectrical = false } = opts;
    const locality = localities.find(l => l.id === localityId);
    if (!locality) return;
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) return;

    // Prefer new offices[] model; fall back to legacy workflow_steps/categories
    // Each office can have multiple office_types (new) or a single office_type (legacy)
    const normalizeTypes = (o) => {
      if (Array.isArray(o?.office_types) && o.office_types.length) return o.office_types;
      if (o?.office_type) return [o.office_type];
      return [];
    };

    const isElectrical = (types) => types.some(t => /electrical/i.test(t));

    let officesToCreate = [];
    if (locality.offices && locality.offices.length > 0) {
      officesToCreate = locality.offices.map(o => {
        const types = normalizeTypes(o);
        return {
          name: o.name || types[0] || "Office",
          office_types: types,
          office_type: types[0] || "",
          office_id: o.id,
          steps: (o.workflow_steps || []).map(s => ({ ...s, value: "", checked: false }))
        };
      });
      if (excludeElectrical) {
        officesToCreate = officesToCreate.filter(o => !isElectrical(o.office_types));
      }
    } else if (locality.workflow_steps?.length > 0) {
      // Legacy data
      const cats = locality.categories?.length > 0 ? locality.categories : [locality.office_type || "General"];
      officesToCreate = cats.map(cat => ({
        name: cat,
        office_types: [cat],
        office_type: cat,
        steps: (locality.workflow_steps || []).map(s => ({ ...s, value: "", checked: false }))
      }));
    } else {
      officesToCreate = [{
        name: locality.name || "Office",
        office_types: locality.office_type ? [locality.office_type] : [],
        office_type: locality.office_type || "",
        steps: []
      }];
    }

    if (localityCreateInFlightRef.current.has(workOrderId)) return;
    localityCreateInFlightRef.current.add(workOrderId);
    setPermitLineEditError("");

    try {
      const existingLines = await loadAllEntityRows({
        entity: PermitLineItem,
        query: { work_order_id: wo.id },
        sort: "created_date",
        label: `Permit lines for ${wo.title || wo.client_name || wo.id}`,
      });
      if (existingLines.length > 0) {
        for (const existingLine of existingLines) lineItemBaselinesRef.current.set(existingLine.id, existingLine);
        setLineItems(prev => {
          const byId = new Map(prev.map(line => [line.id, line]));
          existingLines.forEach(line => byId.set(line.id, line));
          return [...byId.values()];
        });
        setPermitLineEditError("Permit lines already exist for this Work Order, likely from another session or an earlier partial create. The existing lines were loaded instead of creating duplicates.");
        return;
      }

      for (const office of officesToCreate) {
        const newItem = await PermitLineItem.create({
          work_order_id: wo.id,
          work_order_title: wo.client_name || "",
          work_order_description: wo.description || "",
          row_name: office.name,
          office_type: office.office_type,
          office_types: office.office_types,
          locality_id: locality.id,
          locality_name: locality.name || "",
          status: "active",
          steps: office.steps,
          priority: 0
        });
        lineItemBaselinesRef.current.set(newItem.id, newItem);
        setLineItems(prev => prev.some(line => line.id === newItem.id) ? prev : [...prev, newItem]);
      }

      const verifiedLines = await loadAllEntityRows({
        entity: PermitLineItem,
        query: { work_order_id: wo.id },
        sort: "created_date",
        label: `Permit line create verification for ${wo.title || wo.client_name || wo.id}`,
      });
      verifiedLines.forEach(line => lineItemBaselinesRef.current.set(line.id, line));
      setLineItems(prev => {
        const byId = new Map(prev.map(line => [line.id, line]));
        verifiedLines.forEach(line => byId.set(line.id, line));
        return [...byId.values()];
      });

      const identityCounts = new Map();
      for (const line of verifiedLines) {
        const key = [line.locality_id || "", line.row_name || "", line.office_type || ""].join("|");
        identityCounts.set(key, (identityCounts.get(key) || 0) + 1);
      }
      const duplicateIdentities = [...identityCounts.values()].filter(count => count > 1).length;
      if (duplicateIdentities > 0) {
        setPermitLineEditError(`Final verification found ${duplicateIdentities} duplicate Permit office line${duplicateIdentities === 1 ? "" : "s"}, likely from simultaneous creation in another session. No line was deleted automatically; review the duplicates before continuing.`);
      }
    } catch (error) {
      console.error("Permit locality line creation failed:", error);
      const latestLines = await loadAllEntityRows({
        entity: PermitLineItem,
        query: { work_order_id: wo.id },
        sort: "created_date",
        label: `Permit line create recovery for ${wo.title || wo.client_name || wo.id}`,
      }).catch(() => null);
      if (Array.isArray(latestLines) && latestLines.length > 0) {
        latestLines.forEach(line => lineItemBaselinesRef.current.set(line.id, line));
        setLineItems(prev => {
          const byId = new Map(prev.map(line => [line.id, line]));
          latestLines.forEach(line => byId.set(line.id, line));
          return [...byId.values()];
        });
        setPermitLineEditError(`${error?.message || "Permit lines could not all be created."} ${latestLines.length} Permit line${latestLines.length === 1 ? " now exists" : "s now exist"} for this Work Order. Reload and review them before retrying so a partial or response-loss create is not duplicated.`);
      } else {
        setPermitLineEditError(error?.message || "Permit lines could not be created. Reload latest data before retrying.");
      }
    } finally {
      localityCreateInFlightRef.current.delete(workOrderId);
    }
  }, [localities, workOrders]);

  // Update locality on an existing line — replaces steps using the office this line represents
  const updateLocality = useCallback(async (lineItemId, localityId) => {
    const locality = localities.find(l => l.id === localityId);
    const updates = {
      locality_id: localityId || "",
      locality_name: locality?.name || "",
    };
    if (locality) {
      // Try to match an office by office_type on the existing line
      const item = lineItems.find(li => li.id === lineItemId);
      const matchingOffice = locality.offices?.find(o => o.office_type === item?.office_type)
        || locality.offices?.[0];
      if (matchingOffice) {
        updates.steps = (matchingOffice.workflow_steps || []).map(s => ({ ...s, value: "", checked: false }));
      } else if (locality.workflow_steps?.length > 0) {
        updates.steps = locality.workflow_steps.map(s => ({ ...s, value: "", checked: false }));
      }
    }
    setLineItems(prev => prev.map(li => li.id === lineItemId ? { ...li, ...updates } : li));
    await persistPermitLineItemFields(lineItemId, updates, "Permit locality update");
  }, [localities, lineItems, persistPermitLineItemFields]);

  const deleteLineItem = useCallback(async (lineItemId) => {
    await deletePermitLineItemSafely(lineItemId);
  }, [deletePermitLineItemSafely]);

  // Update a field on the underlying WorkOrder (used by the client group header)
  const updateWorkOrderField = useCallback(async (workOrderId, field, value) => {
    const currentWo = workOrders.find((w) => w.id === workOrderId);
    if (!currentWo) return;
    const expectedValue = currentWo[field];
    setWorkOrderEditError("");
    setWorkOrders(prev => prev.map(w => w.id === workOrderId ? { ...w, [field]: value } : w));
    try {
      const saved = await replaceWorkOrderFieldsIfUnchanged({
        workOrderId,
        expectedFields: { [field]: expectedValue },
        nextFields: { [field]: value },
        label: `Permitting ${field}`,
      });
      setWorkOrders(prev => prev.map(w => w.id === workOrderId ? { ...w, ...saved } : w));
      setSelectedWorkOrder(prev => prev?.id === workOrderId ? { ...prev, ...saved } : prev);
    } catch (error) {
      console.error("Could not update Permitting Work Order field:", error);
      setWorkOrderEditError(error?.message || "This Work Order field changed in another session. The latest value was reloaded.");
      await loadData(false);
      if (selectedWorkOrder?.id === workOrderId) {
        const latest = await WorkOrder.get(workOrderId).catch(() => null);
        if (latest?.id) setSelectedWorkOrder(latest);
      }
    }
  }, [workOrders, selectedWorkOrder]);

  const openWorkOrder = (workOrderId) => {
    const wo = workOrders.find(w => w.id === workOrderId);
    if (wo) setSelectedWorkOrder(wo);
  };

  // Group by work order
  const today = new Date().toISOString().split('T')[0];

  const allGroups = useMemo(() => {
    const map = new Map();

    // Groups from line items
    lineItems.forEach(li => {
      if (!map.has(li.work_order_id)) {
        const wo = workOrders.find(w => w.id === li.work_order_id);
        map.set(li.work_order_id, {
          work_order_id: li.work_order_id,
          work_order: wo,
          lines: []
        });
      }
      map.get(li.work_order_id).lines.push(li);
    });

    // Groups for WOs on permitting without any lines yet
    permittingWorkOrdersWithoutLines.forEach(wo => {
      // Only include if on permitting page (workOrders already filtered in loadData via lineItems match);
      // here we additionally need to check the WO is on permitting — we derive this by checking if any
      // filter logic applies. Since loadData only kept items whose WOs are in permitting, an "empty" WO
      // could be any active WO. We need to filter to only permitting WOs:
      // This was already handled via task desc in loadData.
      if (!map.has(wo.id)) {
        map.set(wo.id, {
          work_order_id: wo.id,
          work_order: wo,
          lines: []
        });
      }
    });

    return Array.from(map.values());
  }, [lineItems, workOrders, permittingWorkOrdersWithoutLines]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!searchTerm) return allGroups;
    const q = searchTerm.toLowerCase();
    return allGroups.filter(g => {
      const wo = g.work_order;
      if (wo?.client_name?.toLowerCase().includes(q)) return true;
      if (wo?.description?.toLowerCase().includes(q)) return true;
      if (wo?.title?.toLowerCase().includes(q)) return true;
      if (g.lines.some(li =>
        li.locality_name?.toLowerCase().includes(q) ||
        li.office_type?.toLowerCase().includes(q) ||
        li.notes?.toLowerCase().includes(q)
      )) return true;
      return false;
    });
  }, [allGroups, searchTerm]);

  // A group is "completed" only if it has lines AND ALL lines are completed
  // A group is "active" if it has any line needing attention now OR has no lines (fresh WO awaiting locality)
  // A group is "waiting" if all lines have future follow-up dates
  const { activeGroups, waitingGroups, completedGroups } = useMemo(() => {
    const active = [];
    const waiting = [];
    const completed = [];

    filteredGroups.forEach(g => {
      if (g.lines.length === 0) {
        // Fresh WO, no lines yet → active (awaiting locality selection)
        active.push(g);
        return;
      }

      const allCompleted = g.lines.every(li => li.status === 'completed');
      if (allCompleted) {
        completed.push(g);
        return;
      }

      // Has at least one non-completed line
      const hasActiveNow = g.lines.some(li =>
        li.status !== 'completed' && (!li.next_followup_date || li.next_followup_date <= today)
      );
      if (hasActiveNow) {
        active.push(g);
      } else {
        waiting.push(g);
      }
    });

    return { activeGroups: active, waitingGroups: waiting, completedGroups: completed };
  }, [filteredGroups, today]);

  const localityForInfo = localities.find(l => l.id === localityInfoId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const totalLines = lineItems.length;
  const activeLinesCount = lineItems.filter(li => li.status !== 'completed').length;
  const completedLinesCount = lineItems.filter(li => li.status === 'completed').length;

  const renderSection = (groups, sectionTitle, emoji, accentColor) => (
    <div className="clay-card p-4 w-full mb-5" style={sectionTitle === 'Waiting' ? { borderLeft: '4px solid #f59e0b' } : {}}>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: accentColor }}>
        {emoji} {sectionTitle} ({groups.length} client{groups.length === 1 ? '' : 's'})
        {sectionTitle === 'Active' && <span className="text-xs text-gray-400 font-normal">— needs attention now</span>}
        {sectionTitle === 'Waiting' && <span className="text-xs text-gray-400 font-normal">— future follow-up dates</span>}
      </h3>

      {groups.length === 0 && (
        <div className="px-3 py-6 text-center text-gray-400 text-xs">
          No {sectionTitle.toLowerCase()} items
        </div>
      )}

      <div className="space-y-3">
        {groups.map(group => (
          <PermitClientGroup
            key={group.work_order_id}
            group={group}
            onUpdateStep={updateStep}
            onUpdateField={updateField}
            onUpdateNotes={updateNotesAndSync}
            onUpdateLocality={updateLocality}
            onSelectLocalityForWorkOrder={selectLocalityForWorkOrder}
            onOpenWorkOrder={openWorkOrder}
            onShowLocalityInfo={setLocalityInfoId}
            onDeleteLine={deleteLineItem}
            onUpdateWorkOrderField={updateWorkOrderField}
            onWorkNotesChanged={() => loadData(false)}
            currentUser={currentUser}
            isRegistered={isRegistered}
            localities={localities}
            users={users}
            taskDescriptions={taskDescriptions}
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
                {totalLines} total lines · {activeLinesCount} active · {completedLinesCount} completed
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
              {isRegistered && currentUser?.role === 'admin' && (
                <Button onClick={() => setShowSettings(true)} size="sm" variant="outline" className="gap-1">
                  <Settings className="w-4 h-4" /> Settings
                </Button>
              )}
            </div>
          </div>
        </div>

        {permitLineEditError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">Permit line update blocked</div>
              <div className="mt-1 text-xs">{permitLineEditError}</div>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={async () => { setPermitLineEditError(""); await loadData(true); }} className="shrink-0 border-red-300 bg-white text-red-800">
              Reload latest
            </Button>
          </div>
        )}

        {workOrderEditError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">Permitting Work Order update blocked</div>
              <div className="mt-1 text-xs">{workOrderEditError}</div>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={async () => { setWorkOrderEditError(""); await loadData(false); }} className="shrink-0 border-red-300 bg-white text-red-800">
              Reload latest
            </Button>
          </div>
        )}

        <StageTasksPanel stage="permitting" />

        {/* Active */}
        {renderSection(activeGroups, "Active", '🟢', '#16a34a')}

        {/* Waiting */}
        {waitingGroups.length > 0 && renderSection(waitingGroups, "Waiting", '📅', '#d97706')}

        {/* Completed */}
        {completedGroups.length > 0 && renderSection(completedGroups, "Completed", '✅', '#6b7280')}
      </div>

      <LocalityInfoPopup
        locality={localityForInfo}
        isOpen={!!localityInfoId}
        onClose={() => setLocalityInfoId(null)}
      />

      {showSettings && (
        <PermitSettingsDialog
          isOpen={showSettings}
          onClose={() => { setShowSettings(false); loadData(false); }}
          localities={localities}
          officeTypes={officeTypes}
        />
      )}

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