// Deterministic, browser-only Bouncie responses for FleetTracking race acceptance.
import { makeFleetDataRead } from "./mockFleetDataRead.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const state = {
  vehicles: [
    { vin: "VIN-SYNTH-A", imei: "IMEI-SYNTH-A", nickName: "Synthetic Van A", model: { name: "Van A" }, stats: { location: { lat: 39.1, lon: -84.5 } } },
    { vin: "VIN-SYNTH-B", imei: "IMEI-SYNTH-B", nickName: "Synthetic Truck B", model: { name: "Truck B" }, stats: { location: { lat: 39.2, lon: -84.6 } } },
  ],
  tripRequests: [],
  completedTripRequests: [],
  pendingTripResolvers: [],
  deferNextTripImei: "",
};
window.__fleetTrackingFixture = state;
const fleetDataRead = makeFleetDataRead({
  FleetEquipment: [],
  FleetMaintenanceWorkOrder: [],
  FleetMaintenanceTask: [],
  FleetEquipmentLog: [],
});
export const base44 = {
  entities: {},
  functions: {
    async invoke(name, payload) {
      if (name === "fleetDataRead") return fleetDataRead(payload || {});
      if (name === "bouncieStatus") return { data: { connected: true, needsReconnect: false, connectedEmail: "synthetic@example.test" } };
      if (name === "fleetBouncieNotificationAction") return { data: { notifications: [] } };
      if (name === "bouncieSyncNotifications") return { data: { success: true } };
      if (name !== "bouncieApi") throw new Error("Unexpected synthetic function: " + name);
      if (payload.path === "/v1/vehicles") return { data: { data: clone(state.vehicles) } };
      if (payload.path !== "/v1/trips") throw new Error("Unexpected synthetic Bouncie path: " + payload.path);
      const query = clone(payload.query);
      state.tripRequests.push(query);
      if (state.deferNextTripImei === query.imei) {
        state.deferNextTripImei = "";
        await new Promise((resolve) => state.pendingTripResolvers.push({ imei: query.imei, resolve }));
      }
      state.completedTripRequests.push(query);
      return { data: { data: [{
        transactionId: "trip-" + query.imei + "-" + query["starts-after"],
        startTime: query["starts-after"],
        endTime: query["ends-before"],
        gps: { type: "LineString", coordinates: [[-84.5, 39.1], [-84.6, 39.2]] },
      }] } };
    },
  },
};
