// Stub invoked by fleetEntityLoaders under test. The behavior lives in the
// test file via globalThis.__fleetInvokeMock / __fleetEpoch.
export function invokeFleet(name, payload) {
  return globalThis.__fleetInvokeMock(name, payload);
}

export function getFleetMutationEpoch() {
  return globalThis.__fleetEpoch || 0;
}
