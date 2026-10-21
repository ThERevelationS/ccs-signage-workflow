import React from "react";
export function useAuth() {
  return { currentUser: { id: "synthetic-admin", email: "synthetic@example.test", role: "admin" }, sessionToken: "synthetic-session" };
}
export default function MockFleetTrackingComponent(props) {
  if (Array.isArray(props.vehicles) && Object.hasOwn(props, "totalCount")) {
    return <nav aria-label="Synthetic vehicle picker">{props.vehicles.map(vehicle =>
      <button key={vehicle.vin} type="button" onClick={() => props.onSelectVehicle(vehicle.vin)}>Select {vehicle.vin}</button>)}</nav>;
  }
  if (Array.isArray(props.vehicles) && Object.hasOwn(props, "selectedTrip")) {
    return <div data-testid="synthetic-map-trip">{props.selectedTrip?.transactionId || "no selected route"}</div>;
  }
  if (props.vehicle && Array.isArray(props.trips)) {
    return <section aria-label="Synthetic vehicle panel">
      <div data-testid="selected-vehicle">{props.vehicle.vin}</div>
      <div data-testid="trip-load-state">{props.tripsLoading ? "loading" : "ready"}</div>
      <div data-testid="selected-trip">{props.selectedTripId || "none"}</div>
      <select aria-label="Trip history range" value={props.daysBack} onChange={event => props.onDaysBackChange(Number(event.target.value))}>
        <option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option>
      </select>
      <div data-testid="trip-list">{props.trips.map(trip =>
        <button key={trip.transactionId} type="button" onClick={() => props.onSelectTrip(trip)}>{trip.transactionId}</button>)}</div>
    </section>;
  }
  return null;
}
