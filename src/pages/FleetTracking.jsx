import { useEffect, useState, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import FleetSidebar from "@/components/fleet/FleetSidebar";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetMap from "@/components/fleet/FleetMap";
import VehiclePanel from "@/components/fleet/VehiclePanel";
import AlertSettingsModal from "@/components/fleet/AlertSettingsModal";
import { buildWeeklyRanges } from "@/components/fleet/fleetHelpers";
import { filterAllFleetRows, listAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import { Loader2, LinkIcon, AlertCircle, RefreshCw, LogOut, ExternalLink } from "lucide-react";

export default function FleetTracking() {
  const [status, setStatus] = useState(null); // {connected, user, ...}
  const [statusLoading, setStatusLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [fleetEquipment, setFleetEquipment] = useState([]);
  const [fleetWorkOrders, setFleetWorkOrders] = useState([]);
  const [fleetMaintenanceTasks, setFleetMaintenanceTasks] = useState([]);
  const [fleetEquipmentLogs, setFleetEquipmentLogs] = useState([]);
  const [fleetMaintenanceLoading, setFleetMaintenanceLoading] = useState(false);
  const [selectedVin, setSelectedVin] = useState(() => new URLSearchParams(window.location.search).get("vin") || null);
  const [panelOpen, setPanelOpen] = useState(true);
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

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await base44.functions.invoke("bouncieStatus", {});
      setStatus(data);
      return data;
    } catch (e) {
      setStatus({ connected: false, error: e.message });
    }
  }, []);

  const loadVehicles = useCallback(async () => {
    try {
      setVehiclesLoading(true);
      const { data } = await base44.functions.invoke("bouncieApi", {
        method: "GET", path: "/v1/vehicles", query: {}
      });
      setVehicles(data?.data || []);
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load vehicles");
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const notifs = await base44.entities.BouncieNotification.list("-timestamp", 200);
      setNotifications(notifs || []);
    } catch {
      // entity may not be readable yet
    }
  }, []);

  const syncNotifications = useCallback(async () => {
    try {
      await base44.functions.invoke("bouncieSyncNotifications", {});
      loadNotifications();
    } catch {
      // silent
    }
  }, [loadNotifications]);

  const loadTrips = useCallback(async (imei, days) => {
    if (!imei) { setTrips([]); return; }
    setTripsLoading(true);
    try {
      const ranges = buildWeeklyRanges(days);
      const results = await Promise.all(
        ranges.map(r => base44.functions.invoke("bouncieApi", {
          method: "GET", path: "/v1/trips",
          query: { imei, "starts-after": r["starts-after"], "ends-before": r["ends-before"], "gps-format": "geojson" }
        }))
      );
      const all = results.flatMap(r => r?.data?.data || []);
      all.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      setTrips(all);
    } catch {
      setTrips([]);
    } finally {
      setTripsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      listAllFleetRows(base44.entities.FleetEquipment, "name", { label: "Fleet equipment" }),
      filterAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, { status: "open" }, "-created_date", { label: "Open Fleet work orders" }),
      filterAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, { status: "assigned" }, "-created_date", { label: "Assigned Fleet work orders" }),
      filterAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, { status: "in_progress" }, "-created_date", { label: "In-progress Fleet work orders" }),
    ]).then(([equipmentRows, openRows, assignedRows, inProgressRows]) => {
      if (!mounted) return;
      setFleetEquipment(equipmentRows || []);
      setFleetWorkOrders([...(openRows || []), ...(assignedRows || []), ...(inProgressRows || [])]);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Initial load + auth
  useEffect(() => {
    (async () => {
      let authenticatedUser = null;
      try {
        authenticatedUser = await base44.auth.me();
        setCurrentUser(authenticatedUser);
      } catch {}
      const s = await loadStatus();
      setStatusLoading(false);
      if (s?.connected) {
        loadNotifications();
        if (!s?.needsReconnect) {
          loadVehicles();
          if (authenticatedUser?.role === "admin") syncNotifications();
        } else {
          setVehiclesLoading(false);
        }
      }
    })();
  }, []);

  // Refresh the visible map/notification feed every minute. CCS-local alert evaluation
  // runs independently in the scheduled Fleet Bouncie Alert Sync workflow.
  useEffect(() => {
    if (!status?.connected || status?.needsReconnect) return;
    refreshTimer.current = setInterval(() => {
      loadVehicles();
      loadNotifications();
    }, 60000);
    return () => clearInterval(refreshTimer.current);
  }, [status?.connected, status?.needsReconnect, loadVehicles, loadNotifications]);

  // Load trips when selection / range changes
  useEffect(() => {
    setSelectedTrip(null);
    if (!selectedVin) return;
    const v = vehicles.find(v => v.vin === selectedVin);
    if (v?.imei) loadTrips(v.imei, daysBack);
  }, [selectedVin, daysBack, vehicles, loadTrips]);

  const handleConnect = async () => {
    // Open a blank tab synchronously so popup blockers allow it, then navigate
    // it once we have the auth URL. Bouncie's SSO page sets X-Frame-Options,
    // so the flow must run at the top level, not inside the builder iframe.
    const popup = window.open("", "_blank");
    setConnecting(true);
    try {
      const { data } = await base44.functions.invoke("bouncieAuthInitiate", { redirectBase: window.location.origin });
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
      const { data } = await base44.functions.invoke("fleetBouncieNotificationAction", { action: "mark_read", id });
      if (data?.error) throw new Error(data.error);
    } catch (e) {
      setError(e?.message || "Unable to mark Bouncie notification read.");
      loadNotifications();
    }
  };

  const handleClearNotifications = async () => {
    const vin = vehicles.find(v => v.vin === selectedVin)?.vin;
    if (!vin) return;
    try {
      const { data } = await base44.functions.invoke("fleetBouncieNotificationAction", { action: "mark_vehicle_read", vehicle_vin: vin });
      if (data?.error) throw new Error(data.error);
      setNotifications(n => n.map(x => x.vehicle_vin === vin ? { ...x, is_read: true } : x));
      loadNotifications();
    } catch (e) {
      setError(e?.message || "Unable to mark this vehicle's Bouncie notifications read.");
    }
  };

  const selectedVehicle = vehicles.find(v => v.vin === selectedVin);
  const selectedFleetEquipment = selectedVehicle?.vin
    ? fleetEquipment.find(eq => String(eq.vin || "").trim().toUpperCase() === String(selectedVehicle.vin || "").trim().toUpperCase()) || null
    : null;
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
      filterAllFleetRows(base44.entities.FleetMaintenanceTask, { equipment_id: equipmentId }, "start_date", { label: "Selected Fleet equipment maintenance schedules" }),
      filterAllFleetRows(base44.entities.FleetEquipmentLog, { equipment_id: equipmentId }, "-created_date", { label: "Selected Fleet equipment usage history" }),
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
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md text-center">
          <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4" style={{ background: "#a80000" }}>
            <span className="text-white font-bold text-2xl">B</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Bouncie Fleet Tracking</h1>
          <p className="text-gray-500 mb-6 text-sm">
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
            <p className="text-sm text-gray-500">An admin needs to connect the Bouncie account before fleet tracking is available.</p>
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

  // Connected — main dashboard
  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-950">
      <FleetModuleNav />
      <div className="flex-1 min-h-0 flex relative overflow-hidden" style={{ background: "#1b2029" }}>
      {/* Desktop vehicle list. Mobile uses the compact selector in the Bouncie top bar. */}
      <div className="hidden md:block h-full shrink-0">
        <FleetSidebar
          vehicles={vehicles}
          selectedVin={selectedVin}
          onSelectVehicle={(vin) => { setSelectedVin(vin); setPanelOpen(true); }}
          onAddVehicle={() => window.open("https://www.bouncie.com/app", "_blank")}
          totalCount={vehicles.length}
        />
      </div>

      {/* Map area */}
      <div className="flex-1 relative">
        {vehiclesLoading && vehicles.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <FleetMap
            vehicles={vehicles}
            selectedVin={selectedVin}
            selectedTrip={selectedTrip}
            onSelectVehicle={(vin) => { setSelectedVin(vin); setPanelOpen(true); }}
          />
        )}

        {/* Top bar overlay */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between gap-2 px-2 sm:px-4 py-2" style={{ background: "#1b1c21" }}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="hidden sm:inline text-white font-bold text-lg tracking-tight">Bouncie</span>
            <select
              value={selectedVin || ""}
              onChange={(e) => { setSelectedVin(e.target.value || null); setPanelOpen(!!e.target.value); }}
              className="md:hidden min-w-0 max-w-[210px] flex-1 rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs font-medium text-white"
              aria-label="Select Bouncie vehicle"
            >
              <option value="">Select vehicle…</option>
              {vehicles.map((vehicle) => <option key={vehicle.vin} value={vehicle.vin}>{vehicle.nickName || vehicle.model?.name || vehicle.vin}</option>)}
            </select>
            {status?.connectedEmail && (
              <span className="text-xs text-gray-400 ml-3 hidden lg:inline truncate">Connected: {status.connectedEmail}</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              onClick={() => { loadVehicles(); loadNotifications(); if (currentUser?.role === "admin") syncNotifications(); }}
              className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {currentUser?.role === "admin" && (
              <button
                onClick={handleConnect}
                className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded"
                title="Reconnect Bouncie"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
            <a href="https://www.bouncie.com/app" target="_blank" rel="noreferrer"
              className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded" title="Open Bouncie App">
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Floating vehicle panel */}
        {panelOpen && selectedVehicle && (
          <VehiclePanel
            vehicle={selectedVehicle}
            fleetEquipment={selectedFleetEquipment}
            fleetOpenWorkOrders={selectedFleetOpenWorkOrders}
            fleetMaintenanceTasks={fleetMaintenanceTasks}
            fleetEquipmentLogs={fleetEquipmentLogs}
            fleetMaintenanceLoading={fleetMaintenanceLoading}
            trips={trips}
            tripsLoading={tripsLoading}
            selectedTripId={selectedTrip?.transactionId}
            onSelectTrip={(t) => setSelectedTrip(prev => prev?.transactionId === t.transactionId ? null : t)}
            notifications={notifications.filter(n => n.vehicle_vin === selectedVehicle.vin)}
            onClearNotifications={handleClearNotifications}
            onMarkNotificationRead={handleMarkRead}
            onOpenAlertSettings={() => setAlertSettingsOpen(true)}
            canManageAlerts={currentUser?.role === "admin"}
            onClose={() => setPanelOpen(false)}
            daysBack={daysBack}
            onDaysBackChange={setDaysBack}
            avgBy={avgBy}
            onAvgByChange={setAvgBy}
            onTripsRefresh={() => selectedVehicle?.imei && loadTrips(selectedVehicle.imei, daysBack)}
          />
        )}

        {/* Select-vehicle prompt when none selected */}
        {!selectedVehicle && !vehiclesLoading && vehicles.length > 0 && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-white/95 rounded-lg shadow-lg px-6 py-4 text-center">
            <p className="text-gray-600 text-sm">Select a vehicle to view tracking and Fleet maintenance details.</p>
          </div>
        )}

        {error && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-red-600 text-white px-4 py-2 rounded-lg text-sm shadow-lg">
            {error}
          </div>
        )}
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