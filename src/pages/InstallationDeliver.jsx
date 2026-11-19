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

// Route sheet: upcoming installs from this board grouped by project_install_date
// day (ascending; undated jobs land in "Unscheduled"). Each row links to plain
// Google Maps directions — no API key. window.print() prints it fine.
function InstallRouteSheet({ workOrders }) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const byDay = new Map();
    for (const wo of workOrders || []) {
      const day = String(wo?.project_install_date || "").trim();
      const key = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(wo);
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0])))
      .map(([day, rows]) => ({ day, rows }));
  }, [workOrders]);
  const count = (workOrders || []).length;
  const timeWindow = (wo) =>
    String(wo?.install_time_window || wo?.install_window || wo?.install_time || wo?.arrival_window || "").trim();
  const address = (wo) =>
    [wo?.install_location, wo?.address_line_2].filter((v) => String(v || "").trim()).join(", ");
  const woNumber = (wo) =>
    String(wo?.est_inv_at || wo?.corbridge_invoice_number || wo?.work_order_number || "").trim();
  return (
    <div className="clay-card mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen(!open)} className="text-left">
          <h2 className="text-lg font-bold text-gray-800">Route sheet {open ? "▾" : "▸"}</h2>
          <p className="text-xs text-gray-500">Upcoming installs grouped by install date · {count} job{count === 1 ? "" : "s"} on this board</p>
        </button>
        <button type="button" onClick={() => window.print()} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
          Print route sheet
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-4">
          {count === 0 && <p className="text-sm text-gray-400">No installation jobs on this board yet.</p>}
          {groups.map((g) => (
            <div key={g.day || "unscheduled"}>
              <p className="border-b border-gray-200 pb-1 text-sm font-bold text-gray-700">
                {g.day
                  ? new Date(`${g.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
                  : "Unscheduled"}
              </p>
              <ul className="divide-y divide-gray-100">
                {g.rows.map((wo) => {
                  const addr = address(wo);
                  const window_ = timeWindow(wo);
                  return (
                    <li key={wo.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800">
                          {woNumber(wo) && <span className="mr-2 text-gray-500">{woNumber(wo)}</span>}
                          {wo.title || "Work order"}
                          {wo.client_name && wo.client_name !== wo.title ? ` — ${wo.client_name}` : ""}
                        </p>
                        <p className="text-xs text-gray-500">
                          {addr || "No install address on file"}
                          {window_ ? ` · ${window_}` : ""}
                        </p>
                      </div>
                      {addr ? (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded border border-blue-300 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          Directions
                        </a>
                      ) : (
                        <span className="shrink-0 text-xs text-gray-300">No address</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InstallationDeliver() {
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
    document.title = "Installation - Workflow Manager";
  }, []);

  const { data: cachedWorkOrders = [], isFetched: workOrdersFetched } = useAllWorkOrders();

  useEffect(() => {
    const taskDescriptions = getInstallationTaskDescriptions();
    setWorkOrders((cachedWorkOrders || []).filter(wo =>
      wo.completed !== true && wo.deleted !== true &&
      ((wo.current_task_description && taskDescriptions.some(desc =>
        wo.current_task_description.includes(desc)
      )) || (wo.is_rider && wo.rider_stage === 'installation' && wo.in_pipeline !== false))
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

  // Get task descriptions mapped to Installation page from localStorage
  const getInstallationTaskDescriptions = () => {
    try {
      const saved = localStorage.getItem('salesTaskDescriptions');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed
          .filter(item => item.page === "Installation")
          .map(item => item.text || item);
      }
    } catch {}
    return ["WIP - Installation", "WIP - Outsourced Installation"];
  };

  const fetchWorkOrders = async () => {
    const allWorkOrders = await fetchAllWorkOrders();
    const taskDescriptions = getInstallationTaskDescriptions();
    return allWorkOrders.filter(wo =>
      wo.completed !== true && wo.deleted !== true &&
      ((wo.current_task_description && taskDescriptions.some(desc =>
        wo.current_task_description.includes(desc)
      )) || (wo.is_rider && wo.rider_stage === 'installation' && wo.in_pipeline !== false))
    ).sort((a, b) => (a.priority || 0) - (b.priority || 0));
  };

  const loadWorkOrders = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      setWorkOrders(await fetchWorkOrders());
    } catch (error) {
      console.error("Error loading work orders:", error);
    } finally {
      if (showLoading) setIsLoading(false);
    }
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
        label: "Installation priority reorder",
      });
      setWorkOrders(result.items);
      NotificationTriggers.workOrderPriorityReordered(loadedItems, reorderedItems, currentUser?.full_name || currentUser?.email)
        .catch((e) => console.error("Priority-change notification failed:", e));
    } catch (error) {
      console.error("Error reordering work orders:", error);
      alert(error?.message || "The Installation priority order changed in another session. Reload and try the reorder again.");
      await loadWorkOrders();
    } finally {
      setIsReordering(false);
    }
  };

  const handleSave = async (formData) => {
    if (!isRegistered) { promptForEmail(); return; }
    try {
      if (editingWorkOrder) {
        await updateWorkOrderFromLoadedSnapshot({ workOrder: editingWorkOrder, formData, label: "Installation Work Order" });
      } else {
        const maxPriority = workOrders.length > 0
          ? Math.max(...workOrders.map(wo => wo.priority || 0))
          : -1;
        const { record: created } = await createWorkOrderWithRecovery({
          data: { ...formData, priority: maxPriority + 1 },
          label: riderConfig ? "Installation rider Work Order" : "Installation Work Order",
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
      console.error("Error saving work order:", error);
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
        label: "Installation stage transition",
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
    setRiderConfig({ parentWorkOrder: workOrder, stage: 'installation' });
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
        label: "Installation completion",
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
        label: "Installation Work Order delete",
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
        <StageTasksPanel stage="installation" />

        <QueueFilterBar
          className="mb-3"
          filters={queueFilters}
          onChange={setQueueFilters}
          options={queueOptions}
          pageSize={queueFilters.pageSize}
          onPageSizeChange={(n) => setQueueFilters((f) => ({ ...f, pageSize: n }))}
        />

        <InstallRouteSheet workOrders={visibleWorkOrders} />

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