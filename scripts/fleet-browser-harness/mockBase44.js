// Synthetic, browser-only Fleet data. Never imports a live Base44 client.
import { makeFleetDataRead, verifySyntheticSession } from "./mockFleetDataRead.js";

const fixture = [
  {
    id: "wo-open", work_order_number: "WO-SYNTH-OPEN", title: "Synthetic open job",
    description: "Browser acceptance fixture", type: "repair", status: "open",
    priority: "medium", equipment_id: "eq-synthetic", created_date: "2026-09-01T12:00:00Z",
    updated_date: "2026-09-01T12:00:00Z", assigned_to: "", started_date: "",
    parts_used: [], fluids_used: [], before_photos: [], problem_photos: [], after_photos: [],
  },
  {
    id: "wo-done", work_order_number: "WO-SYNTH-DONE", title: "Synthetic completed job",
    description: "", type: "repair", status: "completed", priority: "low",
    equipment_id: "eq-synthetic", created_date: "2026-08-01T12:00:00Z",
    updated_date: "2026-09-02T12:00:00Z", assigned_to: "Synthetic technician",
    corrective_action: "Synthetic resolution", completed_date: "2026-09-02",
    parts_used: [], fluids_used: [], before_photos: [], problem_photos: [], after_photos: [],
  },
];

const clone = (value) => JSON.parse(JSON.stringify(value));
const state = {
  orders: clone(fixture),
  equipment: [{ id: "eq-synthetic", name: "Synthetic Fleet Van", status: "operational" }],
  tasks: [],
  parts: [],
  fluids: [],
  actions: [],
  failNextWorkOrderList: false,
  asyncLatencyMs: 0,
  deferNextWorkOrderList: false,
  workOrderListStarted: 0,
  workOrderListCompleted: 0,
  pendingWorkOrderListResolvers: [],
  releaseNextWorkOrderList() {
    const resolve = state.pendingWorkOrderListResolvers.shift();
    if (!resolve) throw new Error("No deferred synthetic work-order list is pending");
    resolve();
  },
};
window.__fleetBrowserFixture = state;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fleet reads now arrive via functions.invoke("fleetDataRead") — the work-order
// counters/failure/defer hooks the suites rely on run inside that read path.
const fleetDataRead = makeFleetDataRead(
  {
    FleetMaintenanceWorkOrder: state.orders,
    FleetEquipment: state.equipment,
    FleetMaintenanceTask: state.tasks,
    FleetPart: state.parts,
    FleetFluid: state.fluids,
  },
  {
    async onRead(entity) {
      if (entity !== "FleetMaintenanceWorkOrder") return;
      state.workOrderListStarted += 1;
      if (state.failNextWorkOrderList) {
        state.failNextWorkOrderList = false;
        throw new Error("Synthetic Fleet refresh failed");
      }
      if (state.deferNextWorkOrderList) {
        state.deferNextWorkOrderList = false;
        await new Promise((resolve) => state.pendingWorkOrderListResolvers.push(resolve));
      }
      if (state.asyncLatencyMs) await sleep(state.asyncLatencyMs);
      state.workOrderListCompleted += 1;
    },
  },
);

export const createPageUrl = (name) => "/" + name;
export const base44 = {
  auth: { me: async () => ({ id: "synthetic-user", role: "admin" }) },
  entities: {},
  integrations: { Core: { UploadFile: async () => { throw new Error("Photo uploads are not permitted in browser acceptance"); } } },
  functions: {
    async invoke(name, payload) {
      if (name === "verifySession") return verifySyntheticSession(payload || {});
      if (name === "fleetDataRead") return fleetDataRead(payload || {});
      if (name !== "fleetWorkOrderAction") throw new Error("Unexpected synthetic function: " + name);
      state.actions.push({ name, payload: clone(payload) });
      const { action } = payload;
      if (action === "create") {
        const created = {
          ...clone(payload.work_order),
          id: "wo-created-" + state.actions.length,
          work_order_number: "WO-SYNTH-NEW-" + state.actions.length,
          created_date: "2026-09-27T12:00:00Z",
          updated_date: "2026-09-27T12:00:00Z",
        };
        state.orders.unshift(created);
        return { data: { success: true, work_order: clone(created) } };
      }
      const existing = state.orders.find((row) => row.id === payload.id);
      if (!existing) throw new Error("Synthetic work order not found");
      if (action === "update") Object.assign(existing, clone(payload.work_order));
      else if (action === "complete") Object.assign(existing, clone(payload.work_order), { status: "completed" });
      else if (action === "reopen") existing.status = "in_progress";
      else throw new Error("Unsupported synthetic action: " + action);
      existing.updated_date = "2026-09-27T13:00:00Z";
      return { data: { success: true, work_order: clone(existing) } };
    },
  },
};
