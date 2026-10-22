import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/pages/FleetTracking.jsx", "utf8").replace(/\r\n/g, "\n");

const slice = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing marker: ${endMarker}`);
  return source.slice(start, end + endMarker.length);
};

const statusBody = slice("const loadStatus = useCallback", "}, [sessionToken]);");
const vehiclesBody = slice("const loadVehicles = useCallback", "}, [sessionToken]);");
const notificationsBody = slice("const loadNotifications = useCallback", "}, [sessionToken]);");

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const harness = (body, { invokeMap }) => {
  const state = { calls: [] };
  const setters = { error: "" };
  const makeSetter = (name) => (value) => {
    setters[name] = typeof value === "function" ? value(setters[name]) : value;
  };
  const ref = (initial) => ({ current: initial });
  const base44 = { functions: { invoke: async (fn, payload) => {
    state.calls.push({ fn, payload });
    return invokeMap(fn, payload, state.calls.length - 1);
  } } };
  const ctx = {
    base44,
    setStatus: makeSetter("status"),
    setVehicles: makeSetter("vehicles"),
    setVehiclesLoading: makeSetter("vehiclesLoading"),
    setNotifications: makeSetter("notifications"),
    setError: makeSetter("error"),
    statusLoadGeneration: ref(0),
    vehicleLoadGeneration: ref(0),
    notificationLoadGeneration: ref(0),
    tripLoadGeneration: ref(0),
    sessionToken: "tok",
    buildWeeklyRanges: () => [{}],
    setTrips: makeSetter("trips"),
    setTripsLoading: makeSetter("tripsLoading"),
    setSelectedTrip: () => {},
    useCallback: (fn) => fn,
  };
  const name = body.match(/const (load\w+) = useCallback/)?.[1];
  assert.ok(name, "could not locate the useCallback declaration name");
  const fn = new Function(
    ...Object.keys(ctx),
    `${body}\nreturn ${name};`,
  )(...Object.values(ctx));
  return { fn, state, setters };
};

test("FleetTracking: a superseded vehicle refresh cannot overwrite a newer vehicle snapshot", async () => {
  const a = deferred(); const b = deferred();
  const calls = [];
  const { fn, setters } = harness(vehiclesBody, {
    invokeMap: () => (calls.push(1) === 1 ? a.promise : b.promise),
  });
  const first = fn(); const second = fn();
  b.resolve({ data: { data: [{ vin: "NEW" }] } });
  await second;
  a.resolve({ data: { data: [{ vin: "STALE" }] } });
  await first;
  assert.deepEqual(setters.vehicles, [{ vin: "NEW" }]);
});

test("FleetTracking: an older vehicle refresh cannot clear a newer loading indicator", async () => {
  const a = deferred(); const b = deferred();
  const calls = [];
  const { fn, setters } = harness(vehiclesBody, {
    invokeMap: () => (calls.push(1) === 1 ? a.promise : b.promise),
  });
  const first = fn(); const second = fn();
  a.resolve({ data: { data: [] } });
  await first;
  assert.equal(setters.vehiclesLoading, true);
  b.resolve({ data: { data: [{ vin: "V" }] } });
  await second;
  assert.equal(setters.vehiclesLoading, false);
});

test("FleetTracking: an older vehicle refresh cannot project its failure over a pending refresh", async () => {
  const a = deferred(); const b = deferred();
  const calls = [];
  const { fn, setters } = harness(vehiclesBody, {
    invokeMap: () => (calls.push(1) === 1 ? a.promise : b.promise),
  });
  const first = fn(); const second = fn();
  a.reject(new Error("poll failed"));
  await first;
  assert.equal(setters.error, "");
  b.resolve({ data: { data: [{ vin: "V" }] } });
  await second;
  assert.equal(setters.error, "");
});

test("FleetTracking: an older status check cannot overwrite a newer status", async () => {
  const a = deferred(); const b = deferred();
  const calls = [];
  const { fn, setters } = harness(statusBody, {
    invokeMap: () => (calls.push(1) === 1 ? a.promise : b.promise),
  });
  const first = fn(); const second = fn();
  b.resolve({ data: { connected: true, needsReconnect: false } });
  await second;
  a.resolve({ data: { connected: false } });
  await first;
  assert.equal(setters.status.connected, true);
});

test("FleetTracking: a superseded status check still returns its fetched data for OAuth-poll decisions", async () => {
  const a = deferred(); const b = deferred();
  const calls = [];
  const { fn, setters } = harness(statusBody, {
    invokeMap: () => (calls.push(1) === 1 ? a.promise : b.promise),
  });
  const first = fn(); const second = fn();
  b.resolve({ data: { connected: false } });
  await second;
  a.resolve({ data: { connected: true } });
  const firstResult = await first;
  assert.equal(firstResult.connected, true, "the poll must still see its own fetched status");
  assert.equal(setters.status.connected, false, "but the stale status must not apply");
});

test("FleetTracking: a superseded notification refresh cannot overwrite a newer notification list", async () => {
  const a = deferred(); const b = deferred();
  const calls = [];
  const { fn, setters } = harness(notificationsBody, {
    invokeMap: () => (calls.push(1) === 1 ? a.promise : b.promise),
  });
  const first = fn(); const second = fn();
  b.resolve({ data: { notifications: [{ id: "n2" }] } });
  await second;
  a.resolve({ data: { notifications: [{ id: "n1" }] } });
  await first;
  assert.deepEqual(setters.notifications, [{ id: "n2" }]);
});

test("FleetTracking: a superseded notification failure stays silent like the current failure", async () => {
  const a = deferred(); const b = deferred();
  const calls = [];
  const { fn } = harness(notificationsBody, {
    invokeMap: () => (calls.push(1) === 1 ? a.promise : b.promise),
  });
  const first = fn(); const second = fn();
  a.reject(new Error("stale failure"));
  await assert.doesNotReject(first);
  b.resolve({ data: { notifications: [] } });
  await assert.doesNotReject(second);
});
