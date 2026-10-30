import { useEffect, useState, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import FleetSidebar from "@/components/fleet/FleetSidebar";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetMap from "@/components/fleet/FleetMap";
import VehiclePanel from "@/components/fleet/VehiclePanel";
import AlertSettingsModal from "@/components/fleet/AlertSettingsModal";
import { buildWeeklyRanges } from "@/components/fleet/fleetHelpers";
import { useAuth } from "@/components/auth/EmailGate";
import { filterAllFleetRows, listAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import { Loader2, LinkIcon, AlertCircle, RefreshCw, LogOut, ExternalLink, ChevronDown, ChevronUp, Gauge, GripHorizontal, Maximize2, Minimize2, X } from "lucide-react";
import { invokeFleet, isFleetCoolingDown } from "@/components/fleet/fleetInvoke";

const normalizeVin = (value) => String(value || "").trim().toUpperCase();
const normalizeImei = (value) => String(value || "").trim();

function vehiclePickerLabel(vehicle) {
  const stats = vehicle?.stats || {};
  const rawSpeed = typeof stats.speed === "number" ? stats.speed : stats.location?.speed;
  const speed = Number.isFinite(Number(rawSpeed)) ? Math.max(0, Math.round(Number(rawSpeed))) : null;
  const driving = !!stats.isRunning || (speed != null && speed > 0);
  const name = vehicle?.nickName || vehicle?.model?.name || vehicle?.vin || "Vehicle";
  const state = driving ? (speed != null ? `${speed} mph` : "Driving") : "Parked";
  return `${name} · ${state}`;
}

function resolveFleetEquipmentLink(vehicle, equipmentRows = []) {
  if (!vehicle) return { equipment: null, basis: null };
  const vin = normalizeVin(vehicle.vin);
  if (vin) {
    const vinMatches = equipmentRows.filter((eq) => normalizeVin(eq.vin) === vin);
    if (vinMatches.length === 1) return { equipment: vinMatches[0], basis: "vin" };
    if (vinMatches.length > 1) return { equipment: null, basis: "vin_conflict" };
  }
  const imei = normalizeImei(vehicle.imei);
  if (imei) {
    const imeiMatches = equipmentRows.filter((eq) => normalizeImei(eq.bouncie_imei) === imei && ["matched", "manual"].includes(eq.bouncie_link_status));
    if (imeiMatches.length === 1) {
      const candidate = imeiMatches[0];
      const candidateVin = normalizeVin(candidate.vin);
      // IMEI may fill in missing identity, but it must never override contradictory
      // non-empty VIN evidence. This prevents a moved/reassigned Bouncie device from
      // attaching another vehicle's maintenance record merely because the IMEI matches.
      if (vin && candidateVin && vin !== candidateVin) return { equipment: null, basis: "imei_vin_conflict" };
      return { equipment: candidate, basis: "imei" };
    }
    if (imeiMatches.length > 1) return { equipment: null, basis: "imei_conflict" };
  }
  return { equipment: null, basis: null };
}

export default function FleetTracking() {
  const { currentUser, sessionToken } = useAuth();
  const [status, setStatus] = useState(null); // {connected, user, ...}
  const [statusLoading, setStatusLoading] = useState(true);
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [fleetEquipment, setFleetEquipment] = useState([]);
  const [fleetWorkOrders, setFleetWorkOrders] = useState([]);
  const [fleetMaintenanceTasks, setFleetMaintenanceTasks] = useState([]);
  const [fleetEquipmentLogs, setFleetEquipmentLogs] = useState([]);
  const [fleetMaintenanceLoading, setFleetMaintenanceLoading] = useState(false);
  const [selectedVin, setSelectedVin] = useState(() => new URLSearchParams(window.location.search).get("vin") || null);
  const requestedImeiRef = useRef(new URLSearchParams(window.location.search).get("imei") || "");
  const deepLinkResolvedRef = useRef(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobileSheetState, setMobileSheetState] = useState("peek");
  const [trips, setTrips] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [daysBack, setDaysBack] = useState(7);
  const [avgBy, setAvgBy] = useState("trip");
  const [alertSettingsOpen, setAlertSettingsOpen] = useState(false);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const refreshTimer = useRef(null);
  const tripLoadGeneration = useRef(0);
  const statusLoadGeneration = useRef(0);
  const vehicleLoadGeneration = useRef(0);
  const notificationLoadGeneration = useRef(0);

  const loadStatus = useCallback(async () => {
    const loadId = ++statusLoadGeneration.current;
    try {
      const { data } = await base44.functions.invoke("bouncieStatus", { session_token: sessionToken });
      if (loadId === statusLoadGeneration.current) setStatus(data);
      return data;
    } catch (e) {
      const fallback = { connected: false, error: e.message };
      if (loadId === statusLoadGeneration.current) setStatus(fallback);
      return fallback;
    }
  }, [sessionToken]);

  const loadVehicles = useCallback(async () => {
    const loadId = ++vehicleLoadGeneration.current;
    try {
      setVehiclesLoading(true);
      const { data } = await base44.functions.invoke("bouncieApi", {
        session_token: sessionToken,
        method: "GET", path: "/v1/vehicles", query: {}
      });
      if (loadId !== vehicleLoadGeneration.current) return;
      setVehicles(data?.data || []);
      setError("");
    } catch (e) {
      if (loadId === vehicleLoadGeneration.current) setError(e.message || "Failed to load vehicles");
    } finally {
      if (loadId === vehicleLoadGeneration.current) setVehiclesLoading(false);
    }
  }, [sessionToken]);

  const loadNotifications = useCallback(async () => {
    const loadId = ++notificationLoadGeneration.current;
    try {
      const { data } = await invokeFleet("fleetBouncieNotificationAction", { action: "list", session_token: sessionToken });
      if (data?.error) throw new Error(data.error);
      if (loadId === notificationLoadGeneration.current) setNotifications(data?.notifications || []);
    } catch {
      // Keep the map usable if notification history is temporarily unavailable.
    }
  }, [sessionToken]);

  const syncNotifications = useCallback(async () => {
    try {
      await invokeFleet("bouncieSyncNotifications", {});
      loadNotifications();
    } catch {
      // silent
    }
  }, [loadNotifications]);

  const loadTrips = useCallback(async (imei, days) => {
    const loadId = ++tripLoadGeneration.current;
    if (!imei) {
      setTrips([]);
      setTripsLoading(false);
      return;
    }
    setTripsLoading(true);
    try {
      const ranges = buildWeeklyRanges(days);
      const results = await Promise.all(
        ranges.map(r => base44.functions.invoke("bouncieApi", {
          session_token: sessionToken,
          method: "GET", path: "/v1/trips",
          query: { imei, "starts-after": r["starts-after"], "ends-before": r["ends-before"], "gps-format": "geojson" }
        }))
      );
      if (loadId !== tripLoadGeneration.current) return;
      const all = results.flatMap(r => r?.data?.data || []);
      all.sort((a, b) => (Date.parse(b?.startTime || "") || 0) - (Date.parse(a?.startTime || "") || 0));
      setTrips(all);
    } catch {
      if (loadId === tripLoadGeneration.current) setTrips([]);
    } finally {
      if (loadId === tripLoadGeneration.current) setTripsLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      listAllFleetRows("FleetEquipment", "name", { label: "Fleet equipment" }),
      filterAllFleetRows("FleetMaintenanceWorkOrder", { status: { $in: ["open", "assigned", "in_progress"] } }, "-created_date", { label: "Active Fleet work orders" }),
    ]).then(([equipmentRows, activeRows]) => {
      if (!mounted) return;
      setFleetEquipment(equipmentRows || []);
      setFleetWorkOrders(activeRows || []);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Initial load + auth
  useEffect(() => {
    (async () => {
      const s = await loadStatus();
      setStatusLoading(false);
      if (s?.connected) {
        loadNotifications();
        if (!s?.needsReconnect) {
          loadVehicles();
          if (currentUser?.role === "admin") syncNotifications();
        } else {
          setVehiclesLoading(false);
        }
      }
    })();
  }, [currentUser?.role, loadNotifications, loadStatus, loadVehicles, syncNotifications]);

  // Refresh the visible map/notification feed every minute. CCS-local alert evaluation
  // runs independently in the scheduled Fleet Bouncie Alert Sync workflow.
  useEffect(() => {
    if (!status?.connected || status?.needsReconnect) return;
    refreshTimer.current = setInterval(() => {
      if (document.hidden || isFleetCoolingDown()) return;
      loadVehicles();
      loadNotifications();
    }, 60000);
    return () => clearInterval(refreshTimer.current);
  }, [status?.connected, status?.needsReconnect, loadVehicles, loadNotifications]);

  // Resolve FleetEquipment deep links safely. VIN remains primary. IMEI may only
  // recover a vehicle when it does not contradict a non-empty requested Fleet VIN.
  useEffect(() => {
    if (deepLinkResolvedRef.current || vehiclesLoading || vehicles.length === 0) return;
    deepLinkResolvedRef.current = true;
    if (selectedVin && vehicles.some((vehicle) => normalizeVin(vehicle.vin) === normalizeVin(selectedVin))) return;
    const requestedImei = normalizeImei(requestedImeiRef.current);
    if (!requestedImei) return;
    const matches = vehicles.filter((vehicle) => normalizeImei(vehicle.imei) === requestedImei);
    if (matches.length !== 1) return;
    const matchedVin = normalizeVin(matches[0].vin);
    const requestedVin = normalizeVin(selectedVin);
    if (requestedVin && matchedVin && requestedVin !== matchedVin) return;
    setSelectedVin(matches[0].vin || null);
  }, [vehicles, vehiclesLoading, selectedVin]);

  // Load trips when selection / range changes
  useEffect(() => {
    setSelectedTrip(null);
    if (!selectedVin) {
      loadTrips("", daysBack);
      return;
    }
    const v = vehicles.find(v => v.vin === selectedVin);
    loadTrips(v?.imei || "", daysBack);
  }, [selectedVin, daysBack, vehicles, loadTrips]);

  const handleConnect = async () => {
    // Open a blank tab synchronously so popup blockers allow it, then navigate
    // it once we have the auth URL. Bouncie's SSO page sets X-Frame-Options,
    // so the flow must run at the top level, not inside the builder iframe.
    const popup = window.open("", "_blank");
    setConnecting(true);
    try {
      const { data } = await base44.functions.invoke("bouncieAuthInitiate", { session_token: sessionToken });
      if (data?.authUrl) {
        if (popup) {
          popup.location.href = data.authUrl;
        } else {
          // Popup was blocked — fall back to navigating this tab directly.
          window.location.href = data.authUrl;
        }
        // Poll for connection so this tab refreshes once the popup completes.
        const started = Date.now();
        const poll = setInterval(async () => {
          if (document.hidden || isFleetCoolingDown()) return;
          const s = await loadStatus();
          if (s?.connected && !s?.needsReconnect) {
            clearInterval(poll);
            setConnecting(false);
            loadVehicles();
            loadNotifications();
            syncNotifications();
          } else if (Date.now() - started > 5 * 60 * 1000) {
            clearInterval(poll);
            setConnecting(false);
          }
        }, 4000);
      } else {
        if (popup) popup.close();
        setError(data?.error || "Failed to start Bouncie connection");
        setConnecting(false);
      }
    } catch (e) {
      if (popup) popup.close();
      setError(e.message || "Failed to connect");
      setConnecting(false);
    }
  };

  const handleMarkRead = async (id) => {
    setNotifications(n => n.map(x => x.id === id ? { ...x, is_read: true } : x));
    try {
      const { data } = await invokeFleet("fleetBouncieNotificationAction", { action: "mark_read", id, session_token: sessionToken });
      if (data?.error) throw new Error(data.error);
    } catch (e) {
      setError(e?.message || "Unable to mark Bouncie notification read.");
      loadNotifications();
    }
  };

  const selectTrackingVehicle = (vin) => {
    setSelectedVin(vin || null);
    setPanelOpen(!!vin);
    if (vin) setMobileSheetState("peek");
  };

  const selectedVehicle = vehicles.find(v => normalizeVin(v.vin) === normalizeVin(selectedVin));
  const selectedFleetLink = resolveFleetEquipmentLink(selectedVehicle, fleetEquipment);
  const selectedFleetEquipment = selectedFleetLink.equipment;
  const selectedNotificationVins = [...new Set([
    normalizeVin(selectedVehicle?.vin),
    normalizeVin(selectedFleetEquipment?.vin),
  ].filter(Boolean))];

  const handleClearNotifications = async () => {
    if (!selectedNotificationVins.length) return;
    try {
      const results = await Promise.all(selectedNotificationVins.map((vin) => invokeFleet("fleetBouncieNotificationAction", { action: "mark_vehicle_read", vehicle_vin: vin, session_token: sessionToken })));
      const failed = results.find((result) => result?.data?.error);
      if (failed?.data?.error) throw new Error(failed.data.error);
      const selectedSet = new Set(selectedNotificationVins);
      setNotifications(n => n.map(x => selectedSet.has(normalizeVin(x.vehicle_vin)) ? { ...x, is_read: true } : x));
      loadNotifications();
    } catch (e) {
      setError(e?.message || "Unable to mark this vehicle's Bouncie notifications read.");
    }
  };

  const selectedFleetOpenWorkOrders = selectedFleetEquipment
    ? fleetWorkOrders.filter(wo => wo.equipment_id === selectedFleetEquipment.id && !["completed", "cancelled"].includes(wo.status))
    : [];

  useEffect(() => {
    let mounted = true;
    const equipmentId = selectedFleetEquipment?.id || "";
    if (!equipmentId) {
      setFleetMaintenanceTasks([]);
      setFleetEquipmentLogs([]);
      setFleetMaintenanceLoading(false);
      return () => { mounted = false; };
    }

    setFleetMaintenanceLoading(true);
    Promise.all([
      filterAllFleetRows("FleetMaintenanceTask", { equipment_id: equipmentId }, "start_date", { label: "Selected Fleet equipment maintenance schedules" }),
      filterAllFleetRows("FleetEquipmentLog", { equipment_id: equipmentId }, "-created_date", { label: "Selected Fleet equipment usage history" }),
    ]).then(([taskRows, logRows]) => {
      if (!mounted) return;
      setFleetMaintenanceTasks(taskRows || []);
      setFleetEquipmentLogs(logRows || []);
    }).catch(() => {
      if (!mounted) return;
      setFleetMaintenanceTasks([]);
      setFleetEquipmentLogs([]);
    }).finally(() => {
      if (mounted) setFleetMaintenanceLoading(false);
    });

    return () => { mounted = false; };
  }, [selectedFleetEquipment?.id]);

  // Loading state
  if (statusLoading) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-950">
        <FleetModuleNav />
        <div className="flex-1 min-h-0 flex items-center justify-center" style={{ background: "#1b2029" }}>
          <Loader2 className="w-8 h-8 animate-spin text-white" />
        </div>
      </div>
    );
  }

  // Not connected
  if (!status?.connected) {
    const isAdmin = currentUser?.role === "admin";
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-950">
        <FleetModuleNav />
        <div className="flex-1 min-h-0 flex items-center justify-center" style={{ background: "#1b2029" }}>
          <div className="bg-white dark:bg-slate-900 dark:border dark:border-slate-700 rounded-xl shadow-2xl p-6 sm:p-8 max-w-md mx-4 text-center">
          <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4" style={{ background: "#a80000" }}>
            <span className="text-white font-bold text-2xl">B</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">Bouncie Fleet Tracking</h1>
          <p className="text-gray-500 dark:text-slate-400 mb-6 text-sm">
            Connect your Bouncie account to view your fleet on the map, track trips, monitor vehicle health, and receive real-time notifications.
          </p>
          {isAdmin ? (
            <>
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="w-full py-3 rounded-lg text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: "#2b73ff" }}
              >
                {connecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <LinkIcon className="w-5 h-5" />}
                {connecting ? "Connecting..." : "Connect to Bouncie"}
              </button>
              {error && (
                <div className="mt-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 p-3 rounded">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-4">
                You'll be redirected to Bouncie to authorize access. Register this app's redirect URI in the Bouncie Developer Portal first.
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500 dark:text-slate-400">An admin needs to connect the Bouncie account before fleet tracking is available.</p>
          )}
          </div>
        </div>
      </div>
    );
  }

  if (status?.connected && status?.needsReconnect) {
    const isAdmin = currentUser?.role === "admin";
    return (
      <div className="min-h-full bg-gray-50 dark:bg-slate-950">
        <FleetModuleNav />
        <div className="max-w-3xl mx-auto p-4 sm:p-6">
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h1 className="text-lg font-bold text-amber-900 dark:text-amber-100">Bouncie REST reconnect required</h1>
                <p className="text-sm text-amber-800 dark:text-amber-200 mt-2">
                  Bouncie rejected the stored refresh credential, so vehicles and trip history cannot be refreshed through the REST API until an administrator reconnects the account.
                </p>
                <div className="mt-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                  <div>Webhook: {status.webhookActive ? "active" : "not active"}{status.lastWebhookEvent ? ` · last event ${status.lastWebhookEvent}` : ""}</div>
                  <div>Last webhook: {status.lastWebhookAt ? new Date(status.lastWebhookAt).toLocaleString() : "unknown"}</div>
                  <div>Last REST sync: {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : "unknown"}</div>
                </div>
                {isAdmin ? (
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-700 text-white font-semibold hover:bg-amber-800 disabled:opacity-50"
                  >
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                    {connecting ? "Opening Bouncie..." : "Reconnect Bouncie"}
                  </button>
                ) : (
                  <p className="mt-4 text-sm font-medium text-amber-900 dark:text-amber-100">An administrator must reconnect Bouncie.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Connected — dispatch-style tracking dashboard. Bouncie continues to own
  // tracking/telemetry; FleetEquipment linkage remains fail-closed above.
  const selectedNotifications = notifications.filter(note => selectedNotificationVins.includes(normalizeVin(note.vehicle_vin)));
  const handleSelectTrip = (trip) => {
    const deselecting = selectedTrip?.transactionId === trip.transactionId;
    setSelectedTrip(deselecting ? null : trip);
    if (!deselecting && window.matchMedia?.("(max-width: 1023px)")?.matches) setMobileSheetState("peek");
  };
  const vehiclePanelProps = {
    vehicle: selectedVehicle,
    fleetEquipment: selectedFleetEquipment,
    fleetLinkBasis: selectedFleetLink.basis,
    fleetOpenWorkOrders: selectedFleetOpenWorkOrders,
    fleetMaintenanceTasks,
    fleetEquipmentLogs,
    fleetMaintenanceLoading,
    trips,
    tripsLoading,
    selectedTripId: selectedTrip?.transactionId,
    onSelectTrip: handleSelectTrip,
    notifications: selectedNotifications,
    onClearNotifications: handleClearNotifications,
    onMarkNotificationRead: handleMarkRead,
    onOpenAlertSettings: () => setAlertSettingsOpen(true),
    canManageAlerts: currentUser?.role === "admin",
    onClose: () => setPanelOpen(false),
    daysBack,
    onDaysBackChange: setDaysBack,
    avgBy,
    onAvgByChange: setAvgBy,
    onTripsRefresh: () => selectedVehicle?.imei && loadTrips(selectedVehicle.imei, daysBack),
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-950">
      <FleetModuleNav />
      <div className="flex-1 min-h-0 flex overflow-hidden" style={{ background: "#1b2029" }}>
        {/* Large-screen dispatch list. Phones/tablets keep the map full-width and use the top selector. */}
        <div className="hidden lg:block h-full shrink-0">
          <FleetSidebar
            vehicles={vehicles}
            selectedVin={selectedVin}
            onSelectVehicle={selectTrackingVehicle}
            onAddVehicle={() => window.open("https://www.bouncie.com/app", "_blank")}
            totalCount={vehicles.length}
          />
        </div>

        {/* Center dispatch map. */}
        <main className="flex-1 min-w-0 relative">
          {vehiclesLoading && vehicles.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
          ) : (
            <FleetMap
              vehicles={vehicles}
              selectedVin={selectedVin}
              selectedTrip={selectedTrip}
              onSelectVehicle={selectTrackingVehicle}
              sessionToken={sessionToken}
            />
          )}

          <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between gap-2 px-2 sm:px-4 py-2" style={{ background: "#1b1c21" }}>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="hidden sm:block min-w-0"><div className="text-white font-bold text-sm sm:text-base tracking-tight">Fleet Tracking</div><div className="hidden xl:block text-[10px] uppercase tracking-wide text-gray-500">Live Bouncie dispatch map</div></div>
              <select
                value={selectedVin || ""}
                onChange={(e) => selectTrackingVehicle(e.target.value || null)}
                className="lg:hidden min-h-11 min-w-0 max-w-[320px] flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 text-xs font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                aria-label="Select Bouncie vehicle"
              >
                <option value="">Select vehicle…</option>
                {vehicles.map((vehicle) => <option key={vehicle.vin} value={vehicle.vin}>{vehiclePickerLabel(vehicle)}</option>)}
              </select>
              {status?.connectedEmail && <span className="text-xs text-gray-400 ml-2 hidden 2xl:inline truncate">Bouncie: {status.connectedEmail}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <button type="button" onClick={() => { loadVehicles(); loadNotifications(); if (currentUser?.role === "admin") syncNotifications(); }} className="min-h-11 min-w-11 p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" title="Refresh Bouncie tracking" aria-label="Refresh Bouncie tracking"><RefreshCw className="w-4 h-4 mx-auto" /></button>
              {currentUser?.role === "admin" && <button type="button" onClick={handleConnect} className="min-h-11 min-w-11 p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" title="Reconnect Bouncie" aria-label="Reconnect Bouncie"><LogOut className="w-4 h-4 mx-auto" /></button>}
              <a href="https://www.bouncie.com/app" target="_blank" rel="noreferrer" className="min-h-11 min-w-11 p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" title="Open Bouncie App" aria-label="Open Bouncie App"><ExternalLink className="w-4 h-4" /></a>
            </div>
          </div>

          {/* Mobile/tablet selected vehicle details use a map-first bottom sheet. */}
          <div className="lg:hidden">
            {panelOpen && selectedVehicle && <MobileVehicleSheet vehicle={selectedVehicle} selectedTrip={selectedTrip} state={mobileSheetState} setState={setMobileSheetState} onClose={() => setPanelOpen(false)}>
              <VehiclePanel {...vehiclePanelProps} embedded />
            </MobileVehicleSheet>}
          </div>

          {!selectedVehicle && !vehiclesLoading && vehicles.length > 0 && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-white/95 dark:bg-slate-900/95 rounded-lg shadow-lg px-6 py-4 text-center"><p className="text-gray-600 dark:text-slate-300 text-sm">Select a vehicle to view live tracking, trips, maintenance, alerts, and details.</p></div>}

          {error && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-red-600 text-white px-4 py-2 rounded-lg text-sm shadow-lg">{error}</div>}
        </main>

        {/* Dedicated desktop vehicle pane. */}
        <div className="hidden lg:block h-full shrink-0 bg-white dark:bg-slate-900">
          {panelOpen && selectedVehicle ? <VehiclePanel {...vehiclePanelProps} docked /> : <div className="h-full w-[410px] xl:w-[440px] border-l border-slate-700 bg-slate-900 p-6 flex items-center justify-center"><div className="text-center"><div className="text-sm font-semibold text-slate-200">No vehicle selected</div><div className="text-xs text-slate-500 mt-1">Choose a vehicle from the dispatch list or map.</div></div></div>}
        </div>

        <AlertSettingsModal
          open={currentUser?.role === "admin" && alertSettingsOpen}
          onClose={() => setAlertSettingsOpen(false)}
          vehicle={selectedVehicle}
        />
      </div>
    </div>
  );
}

function MobileVehicleSheet({ vehicle, selectedTrip, state, setState, onClose, children }) {
  const dragStartRef = useRef(null);
  const states = ["peek", "mid", "full"];
  const stateIndex = Math.max(0, states.indexOf(state));
  const move = direction => setState(states[Math.max(0, Math.min(states.length - 1, stateIndex + direction))]);
  const stats = vehicle?.stats || {};
  const speedRaw = typeof stats.speed === "number" ? stats.speed : stats.location?.speed;
  const speed = Number.isFinite(Number(speedRaw)) ? Math.max(0, Math.round(Number(speedRaw))) : null;
  const driving = !!stats.isRunning || (speed != null && speed > 0);
  const name = vehicle?.nickName || vehicle?.model?.name || vehicle?.vin || "Vehicle";
  const address = stats.location?.address || "Live Bouncie location";
  const peekDetail = selectedTrip ? "Trip route shown on map · tap to reopen details" : address;
  const height = state === "peek" ? "112px" : state === "full" ? "calc(100% - 58px)" : "min(56dvh, 560px)";

  const onPointerDown = event => {
    dragStartRef.current = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerUp = event => {
    if (dragStartRef.current == null) return;
    const delta = event.clientY - dragStartRef.current;
    dragStartRef.current = null;
    if (delta <= -45) move(1);
    else if (delta >= 45) move(-1);
  };

  return <aside className={`absolute inset-x-0 bottom-0 z-40 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-[0_-12px_30px_rgba(0,0,0,.24)] transition-[height] duration-200 ease-out overflow-hidden ${state === "full" ? "rounded-none" : "rounded-t-2xl"}`} style={{ height, paddingBottom: "env(safe-area-inset-bottom, 0px)" }} aria-label={`${name} mobile vehicle sheet`}>
    <div className="h-full flex flex-col min-h-0">
      <div onPointerDown={onPointerDown} onPointerUp={onPointerUp} className="shrink-0 touch-none select-none bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 cursor-grab active:cursor-grabbing">
        <div className="h-6 flex items-center justify-center"><GripHorizontal className="w-8 h-4 text-gray-300 dark:text-slate-600" /></div>
        {state === "peek" ? <div className="px-3 pb-3 flex items-center gap-3">
          <button type="button" onClick={() => setState("mid")} className="min-w-0 flex-1 text-left flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            <span className={`w-3 h-3 rounded-full shrink-0 ${driving ? "bg-emerald-500" : "bg-blue-500"}`} />
            <span className="min-w-0 flex-1"><span className="block font-bold text-gray-900 dark:text-slate-100 truncate">{name}</span><span className={`block text-[11px] truncate ${selectedTrip ? "font-medium text-indigo-600 dark:text-indigo-300" : "text-gray-500 dark:text-slate-400"}`}>{peekDetail}</span></span>
            <span className="shrink-0 text-right"><span className="block text-sm font-bold text-gray-900 dark:text-slate-100">{speed == null ? "—" : `${speed} mph`}</span><span className="block text-[10px] text-gray-400">{stats.odometer == null ? "Mileage —" : `${Math.round(Number(stats.odometer)).toLocaleString()} mi`}</span></span>
          </button>
          <button type="button" onClick={() => setState("mid")} className="min-h-11 min-w-11 rounded-xl border border-gray-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-300" aria-label="Expand vehicle details"><ChevronUp className="w-5 h-5 mx-auto" /></button>
          <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400" aria-label="Close vehicle sheet"><X className="w-4 h-4 mx-auto" /></button>
        </div> : <div className="px-3 pb-2 flex items-center gap-2">
          <button type="button" onClick={() => move(-1)} className="min-h-11 min-w-11 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300" aria-label="Collapse vehicle details"><ChevronDown className="w-4 h-4 mx-auto" /></button>
          <div className="min-w-0 flex-1"><div className="text-xs font-bold text-gray-900 dark:text-slate-100 truncate">{name}</div><div className="text-[10px] text-gray-400">{state === "full" ? "Full details" : "Swipe up for full details · down to peek"}</div></div>
          <div className="hidden sm:flex items-center gap-1 text-[10px] text-gray-500 dark:text-slate-400"><Gauge className="w-3.5 h-3.5" />{speed == null ? "—" : `${speed} mph`}</div>
          <button type="button" onClick={() => setState(state === "full" ? "mid" : "full")} className="min-h-11 min-w-11 rounded-lg border border-gray-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-300" aria-label={state === "full" ? "Reduce vehicle sheet" : "Expand vehicle sheet fully"}>{state === "full" ? <Minimize2 className="w-4 h-4 mx-auto" /> : <Maximize2 className="w-4 h-4 mx-auto" />}</button>
          <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400" aria-label="Close vehicle sheet"><X className="w-4 h-4 mx-auto" /></button>
        </div>}
      </div>
      <div className={state === "peek" ? "hidden" : "min-h-0 flex-1"}>{children}</div>
    </div>
  </aside>;
}