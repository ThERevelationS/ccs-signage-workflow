import { useState, useEffect, useMemo } from "react";
import { staffEntities } from "@/components/staff/staffEntities";
import QueueFilterBar from "@/components/queues/QueueFilterBar";
import {
  DEFAULT_QUEUE_FILTERS,
  flattenQueueRows,
  filterQueueRows,
  serializeQueueFilters,
} from "@/components/queues/productQueueModel";
import { OPERATIONAL_STATUS_CUSTOMER_LABELS } from "@/components/estimator/workOrderConversion";
import DragDropList from "../components/workflow/DragDropList";
import StageTasksPanel from "@/components/workflow/StageTasksPanel";
import WorkOrderForm from "../components/workflow/WorkOrderForm";
import { ActivityActions } from "../components/workflow/ActivityLogger";
import { useAuth } from "@/components/auth/EmailGate";
import { useAllWorkOrders, fetchAllWorkOrders } from "@/lib/workOrderCache";
import { createWorkOrderWithRecovery, softDeleteWorkOrderFromLoadedSnapshot, transitionWorkOrderFromLoadedSnapshot, updateWorkOrderFromLoadedSnapshot } from "@/components/workflow/workOrderPersistence";
import { reorderWorkOrdersFromLoadedSnapshot } from "@/components/workflow/workOrderPriorityPersistence";
import { NotificationTriggers } from "@/components/workflow/NotificationService";

const WorkOrder = staffEntities.WorkOrder;

// C-01 — shared CoreBridge queue filter bar on this board. The bar is
// stateless; the page owns the filter object and pushes it through the
// product-queue model. flattenQueueRows only emits product rows, so each
// work order also contributes one order-level "meta" row carrying the
// order fields the bar can still match (ref/company search blob, WO
// designer/assignee, sales rep, entered-by, install-date due). Product-only
// fields stay blank on meta rows so select filters remain product-accurate.
const WO_META_SEARCH_FIELDS = [
  "title", "client_name", "contact_name", "corbridge_invoice_number",
  "work_order_number", "source_estimate_number", "customer_description",
  "description", "estimator_notes", "work_notes", "current_task_description",
];

function woMetaQueueRow(wo) {
  return {
    workOrderId: wo.id,
    ref: wo.corbridge_invoice_number || wo.title || wo.id,
    company: wo.client_name || "",
    productName: WO_META_SEARCH_FIELDS.map((f) => wo?.[f]).filter((v) => String(v || "").trim()).join(" "),
    status: "none",
    substatus: "",
    designer: wo.designer || "",
    assignedTo: wo.assigned_to || "",
    responsibility: "",
    category: "",
    moduleKey: "",
    due: "",
    woDue: wo.project_install_date || "",
    hardDue: false,
    machine: "",
    part: "",
    salesperson: wo.sales_rep || wo.salesperson || wo.salesperson_email || "",
    enteredBy: wo.created_by || wo.entered_by || "",
    rush: wo.is_rush === true || wo.rush === true ||
      String(wo.order_priority || "").trim().toLowerCase() === "rush",
  };
}

// Options are {value,label} lists of the distinct values present in the
// queue rows — the QueueFilterBar contract.
function queueOptionsFromRows(rows) {
  const uniq = (key) =>
    [...new Set((rows || []).map((r) => r[key]).filter((v) => String(v || "").trim()))]
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map((v) => ({ value: v, label: v }));
  return {
    machines: uniq("machine"),
    partCategories: uniq("category"),
    parts: uniq("part"),
    designers: uniq("designer"),
    substatuses: uniq("substatus"),
    responsibilities: uniq("responsibility"),
    assignees: uniq("assignedTo"),
    salespeople: uniq("salesperson"),
    enteredBys: uniq("enteredBy"),
    moduleKeys: uniq("moduleKey"),
    statuses: [...new Set((rows || []).map((r) => r.status).filter((s) => s && s !== "none"))]
      .sort()
      .map((s) => ({ value: s, label: OPERATIONAL_STATUS_CUSTOMER_LABELS[s] || s })),
  };
}

// Non-default filters (beyond page size / include-fulfilled which do not
// change which orders show on a board) disable drag reorder — a filtered
// subset has no meaningful order to persist.
function queueFiltersActive(filters) {
  const ser = serializeQueueFilters({ ...filters, pageSize: DEFAULT_QUEUE_FILTERS.pageSize });
  delete ser.fulfilled;
  return Object.keys(ser).length > 0 ||
    ["machine", "part", "salesperson", "enteredBy"].some((k) => (filters?.[k] ?? "all") !== "all");
}

export default function Production() {
  const [workOrders, setWorkOrders] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [riderConfig, setRiderConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReordering, setIsReordering] = useState(false);
  const { currentUser, isRegistered, promptForEmail } = useAuth();
  const [queueFilters, setQueueFilters] = useState(() => ({ ...DEFAULT_QUEUE_FILTERS }));

  // Queue-row universe for the filter bar: product rows (flatten honors
  // includeFulfilled) + one order-level meta row per work order.
  const queueRows = useMemo(() => {
    const rows = flattenQueueRows(workOrders, { includeFulfilled: queueFilters.includeFulfilled });
    for (const wo of workOrders) if (wo?.id) rows.push(woMetaQueueRow(wo));
    return rows;
  }, [workOrders, queueFilters.includeFulfilled]);

  const queueOptions = useMemo(() => queueOptionsFromRows(queueRows), [queueRows]);
  const filtersActive = useMemo(() => queueFiltersActive(queueFilters), [queueFilters]);

  const visibleWorkOrders = useMemo(() => {
    const ids = new Set(filterQueueRows(queueRows, queueFilters).map((r) => r.workOrderId));
    return workOrders.filter((wo) => ids.has(wo.id));
  }, [workOrders, queueRows, queueFilters]);

  useEffect(() => {
    document.title = "Production - Workflow Manager";
  }, []);

  const { data: cachedWorkOrders = [], isFetched: workOrdersFetched } = useAllWorkOrders();

  useEffect(() => {
    const taskDescriptions = getProductionTaskDescriptions();
    setWorkOrders((cachedWorkOrders || []).filter(wo =>
      wo.completed !== true && wo.deleted !== true &&
      ((wo.current_task_description && taskDescriptions.some(desc =>
        wo.current_task_description.includes(desc)
      )) || (wo.is_rider && wo.rider_stage === 'production' && wo.in_pipeline !== false))
    ).sort((a, b) => (a.priority || 0) - (b.priority || 0)));
  }, [cachedWorkOrders]);

  useEffect(() => {
    if (workOrdersFetched) setIsLoading(false);
  }, [workOrdersFetched]);

  useEffect(() => {
    loadWorkOrders(true);

    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Get task descriptions mapped to Production page from localStorage
  const getProductionTaskDescriptions = () => {
    try {
      const saved = localStorage.getItem('salesTaskDescriptions');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed
          .filter(item => item.page === "Production")
          .map(item => item.text || item);
      }
    } catch {}
    return ["WIP - Production/Fabrication"];
  };

  const fetchWorkOrders = async () => {
    const allWorkOrders = await fetchAllWorkOrders();
    const taskDescriptions = getProductionTaskDescriptions();
    return allWorkOrders.filter(wo =>
      wo.completed !== true && wo.deleted !== true &&
      ((wo.current_task_description && taskDescriptions.some(desc =>
        wo.current_task_description.includes(desc)
      )) || (wo.is_rider && wo.rider_stage === 'production' && wo.in_pipeline !== false))
    ).sort((a, b) => (a.priority || 0) - (b.priority || 0));
  };

  const loadWorkOrders = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      setWorkOrders(await fetchWorkOrders());
    } catch (error) {
      console.error("Error loading:", error);
    }
    if (showLoading) setIsLoading(false);
  };

  const handleReorder = async (reorderedItems) => {
    if (!isRegistered) { promptForEmail(); return; }
    if (isReordering) return;

    const loadedItems = workOrders;
    setWorkOrders(reorderedItems);
    setIsReordering(true);
    try {
      const result = await reorderWorkOrdersFromLoadedSnapshot({
        entity: WorkOrder,
        loadedItems,
        reorderedItems,
        readCurrentItems: fetchWorkOrders,
        label: "Production priority reorder",
      });
      setWorkOrders(result.items);
      NotificationTriggers.workOrderPriorityReordered(loadedItems, reorderedItems, currentUser?.full_name || currentUser?.email)
        .catch((e) => console.error("Priority-change notification failed:", e));
    } catch (error) {
      console.error("Error reordering:", error);
      alert(error?.message || "The Production priority order changed in another session. Reload and try the reorder again.");
      await loadWorkOrders();
    } finally {
      setIsReordering(false);
    }
  };

  const handleSave = async (formData) => {
    if (!isRegistered) { promptForEmail(); return; }
    try {
      if (editingWorkOrder) {
        await updateWorkOrderFromLoadedSnapshot({ workOrder: editingWorkOrder, formData, label: "Production Work Order" });
      } else {
        const maxPriority = workOrders.length > 0 
          ? Math.max(...workOrders.map(wo => wo.priority || 0)) 
          : -1;
        const { record: created } = await createWorkOrderWithRecovery({
          data: { ...formData, priority: maxPriority + 1 },
          label: riderConfig ? "Production rider Work Order" : "Production Work Order",
        });
        try {
          if (riderConfig) {
            await ActivityActions.riderCreated(created, riderConfig.parentWorkOrder.title);
          } else {
            await ActivityActions.workOrderCreated(created);
          }
        } catch (activityError) {
          console.error("Work Order was saved but its activity notification failed:", activityError);
          alert("The Work Order was saved successfully, but its activity notification could not be completed. Do not create the Work Order again; reload to see the saved job.");
        }
      }
      setEditingWorkOrder(null);
      setRiderConfig(null);
      loadWorkOrders();
    } catch (error) {
      console.error("Error saving:", error);
      throw error;
    }
  };

  const handleMove = async (workOrder, newStage) => {
    if (!isRegistered) { promptForEmail(); return; }
    try {
      const oldStage = workOrder.current_stage;
      await transitionWorkOrderFromLoadedSnapshot({
        workOrder,
        newStage,
        normalizeLegacyNotes: true,
        label: "Production stage transition",
      });
      await ActivityActions.stageChanged(workOrder, oldStage, newStage);
      loadWorkOrders();
    } catch (error) {
      console.error("Error moving:", error);
      alert(error?.message || "This Work Order changed in another session. Reload and try the transition again.");
      loadWorkOrders();
    }
  };

  const handleEdit = (workOrder) => {
    if (!isRegistered) { promptForEmail(); return; }
    setEditingWorkOrder(workOrder);
    setRiderConfig(null);
    setIsFormOpen(true);
  };

  const handleSplit = (workOrder) => {
    if (!isRegistered) { promptForEmail(); return; }
    setRiderConfig({ parentWorkOrder: workOrder, stage: 'production' });
    setEditingWorkOrder(null);
    setIsFormOpen(true);
  };

  const handleComplete = async (workOrder) => {
    if (!isRegistered) { promptForEmail(); return; }
    try {
      await transitionWorkOrderFromLoadedSnapshot({
        workOrder,
        newStage: "completed",
        completed: true,
        normalizeLegacyNotes: true,
        label: "Production completion",
      });
      await ActivityActions.workOrderCompleted(workOrder);
      loadWorkOrders();
    } catch (error) {
      console.error("Error completing work order:", error);
      alert(error?.message || "This Work Order changed in another session. Reload and try the transition again.");
      loadWorkOrders();
    }
  };
  const handleDelete = async (workOrder) => {
    if (!isRegistered) { promptForEmail(); return; }
    try {
      const deleted = await softDeleteWorkOrderFromLoadedSnapshot({
        workOrder,
        deletedBy: currentUser?.email || "unknown",
        label: "Production Work Order delete",
      });
      Object.assign(workOrder, deleted);
      await ActivityActions.workOrderDeleted(workOrder);
      loadWorkOrders();
    } catch (error) {
      console.error("Error deleting work order:", error);
      alert(error?.message || "This Work Order changed in another session. Reload before deleting it.");
      loadWorkOrders();
    }
  };

  const handleDoubleClick = (e) => {
    if (isFullScreen && e.target.closest('.clay-card') === null) {
      document.exitFullscreen();
    }
  };

  return (
    <div className="min-h-screen p-4" onDoubleClick={handleDoubleClick}>
      {isFullScreen && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-sm z-50 pointer-events-none">
          To exit press ESC
        </div>
      )}
      <div className="w-full max-w-[95vw] mx-auto">
        <StageTasksPanel stage="production" />

        <QueueFilterBar
          className="mb-3"
          filters={queueFilters}
          onChange={setQueueFilters}
          options={queueOptions}
          pageSize={queueFilters.pageSize}
          onPageSizeChange={(n) => setQueueFilters((f) => ({ ...f, pageSize: n }))}
        />

        <div className="clay-card">
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Loading...</p>
            </div>
          ) : (
            <DragDropList
              workOrders={visibleWorkOrders}
              onReorder={handleReorder}
              reorderDisabled={isReordering || filtersActive}
              onEdit={handleEdit}
              onMove={handleMove}
              onSplit={handleSplit}
              onComplete={handleComplete}
              onUpdate={loadWorkOrders}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>

      <WorkOrderForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingWorkOrder(null);
          setRiderConfig(null);
        }}
        onSave={handleSave}
        workOrder={editingWorkOrder}
        isRider={!!riderConfig}
        parentWorkOrder={riderConfig?.parentWorkOrder}
        lockedStage={riderConfig?.stage}
      />
    </div>
  );
}