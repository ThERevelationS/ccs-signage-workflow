// Browser-only synthetic Fleet Requests data. No production Base44 client or records.
const clone = (value) => JSON.parse(JSON.stringify(value));
const seedRequests = [
  {
    id: "request-pending", item_name: "Synthetic linked brake pad", item_type: "part",
    part_number: "SYN-PAD-01", manufacturer_brand: "Synthetic", quantity_needed: 2,
    equipment_id: "eq-synthetic", requested_by_person: "Synthetic mechanic",
    requester_email: "synthetic@example.test", justification: "Browser acceptance fixture",
    status: "pending", inventory_item_id: "part-exact", updated_date: "2026-10-01T12:00:00Z",
  },
];
const state = {
  requests: clone(seedRequests),
  parts: [{ id: "part-exact", part_name: "Synthetic brake pad", part_number: "SYN-PAD-01", category: "brakes", quantity_on_hand: 7, minimum_stock: 2, location: "Synthetic shelf A", manufacturer: "Synthetic" }],
  fluids: [{ id: "fluid-exact", fluid_name: "Synthetic coolant", brand: "Synthetic", quantity: 4, unit: "gallons", location: "Synthetic shelf B" }],
  equipment: [{ id: "eq-synthetic", name: "Synthetic Fleet Van", status: "operational" }],
  actions: [],
  notifications: [],
};
window.__fleetRequestsFixture = state;
const pageRows = (rows, limit = 500, skip = 0) => clone(rows.slice(skip, skip + limit));
const listEntity = (key) => ({ list: async (_sort, limit, skip) => pageRows(state[key], limit, skip) });
export const createPageUrl = (name) => "/" + name;
export const base44 = {
  auth: { me: async () => ({ id: "synthetic-admin", email: "synthetic@example.test", role: "admin" }) },
  entities: {
    FleetPartFluidRequest: listEntity("requests"),
    FleetEquipment: listEntity("equipment"),
    FleetPart: listEntity("parts"),
    FleetFluid: listEntity("fluids"),
    AuthorizedEmail: { filter: async () => [] },
  },
  integrations: { Core: { UploadFile: async () => { throw new Error("Photo uploads are disabled in synthetic acceptance"); } } },
  functions: {
    async invoke(name, payload) {
      if (name !== "fleetRequestAction") throw new Error("Unexpected synthetic function: " + name);
      state.actions.push({ name, payload: clone(payload) });
      const now = "2026-10-21T12:00:00Z";
      if (payload.action === "create") {
        const row = {
          ...clone(payload.request), id: "request-created-" + state.actions.length,
          status: "pending", requester_email: "synthetic@example.test",
          updated_date: now, created_date: now,
        };
        state.requests.unshift(row);
        return { data: { success: true, request: clone(row) } };
      }
      const row = state.requests.find((item) => item.id === payload.id);
      if (!row) return { data: { error: "Synthetic request not found" } };
      if (payload.action === "order") {
        Object.assign(row, { status: "ordered", estimated_delivery_date: payload.estimated_delivery_date, unit_cost: payload.unit_cost, updated_date: now });
      } else if (payload.action === "receive") {
        if (row.receipt_applied_at) return { data: { error: "Synthetic durable receipt already applied" } };
        const exact = row.item_type === "part"
          ? state.parts.find((item) => item.id === row.inventory_item_id)
          : state.fluids.find((item) => item.id === row.inventory_item_id);
        if (!exact) return { data: { error: "Synthetic exact Fleet inventory record missing" } };
        const amount = Number(payload.quantity_received);
        if (row.item_type === "part") exact.quantity_on_hand += amount;
        else exact.quantity += amount;
        Object.assign(row, {
          status: "received", quantity_received: amount, received_unit: payload.unit || "units",
          receipt_applied_at: now, received_at: now, updated_date: now,
        });
      } else {
        return { data: { error: "Unsupported synthetic action: " + payload.action } };
      }
      return { data: { success: true, request: clone(row) } };
    },
  },
};
