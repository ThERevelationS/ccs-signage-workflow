import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "./loadGoogleMaps";
import {
  Bike,
  BusFront,
  Crosshair,
  Eye,
  Layers,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  Maximize2,
  Navigation,
  Search,
  TrafficCone,
  X,
} from "lucide-react";
import { makeColor } from "./fleetHelpers";

const PREF_KEY = "ccsFleetMapPreferences:v1";
const DEFAULT_PREFS = {
  mapTypeId: "roadmap",
  traffic: false,
  transit: false,
  bicycling: false,
  autoFit: true,
  followSelected: false,
  vehicleLabels: false,
  remember: true,
};

const googleMaps = () => /** @type {any} */ (window).google?.maps;

function loadPreferences() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREF_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFS;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      mapTypeId: ["roadmap", "satellite", "hybrid", "terrain"].includes(parsed.mapTypeId) ? parsed.mapTypeId : DEFAULT_PREFS.mapTypeId,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function pinSvg(color, selected) {
  const size = selected ? 44 : 34;
  const r = selected ? 18 : 13;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="${color}" stroke="#fff" stroke-width="3"/>
        <g fill="#fff" transform="translate(${size/2 - 9}, ${size/2 - 6}) scale(0.5)">
          <path d="M18.92 6.01l-1.06-3.18C17.55 1.74 16.5 1 15.5 1h-7c-1 0-2.05.74-2.36 1.83L5.08 6.01C3.83 6.11 3 7.05 3 8.25v5.5C3 14.05 3.83 15 5.08 15.1V17c0 .55.45 1 1 1s1-.45 1-1v-2h10v2c0 .55.45 1 1 1s1-.45 1-1v-1.9c1.25-.1 2-1.05 2-2.35v-5.5c0-1.2-.83-2.14-2.08-2.24zM6.5 12.5c-.83 0-1.5-.67-1.5-1.5S5.67 9.5 6.5 9.5 8 10.17 8 11s-.67 1.5-1.5 1.5zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM18 8H6V7h12v1z"/>
        </g>
      </svg>`
    ),
    scaledSize: undefined,
    anchor: undefined,
  };
}

function tripCoords(trip) {
  const gps = trip?.gps;
  if (!gps) return [];
  const geom = gps.type === "Feature" ? gps.geometry : gps;
  const coords = geom?.type === "LineString" ? geom.coordinates
    : geom?.type === "MultiLineString" ? geom.coordinates.flat() : [];
  return coords.filter(c => Array.isArray(c) && c.length >= 2).map(([lng, lat]) => ({ lat, lng }));
}

function vehicleLocation(vehicle) {
  const loc = vehicle?.stats?.location;
  if (!loc || loc.lat == null || loc.lon == null) return null;
  return { lat: Number(loc.lat), lng: Number(loc.lon) };
}

function vehicleLabel(vehicle) {
  return String(vehicle?.nickName || vehicle?.model?.name || vehicle?.model?.make || "Vehicle").trim();
}

export default function FleetMap({ vehicles, selectedVin, selectedTrip, onSelectVehicle }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const tripLayerRef = useRef([]);
  const trafficLayerRef = useRef(null);
  const transitLayerRef = useRef(null);
  const bicyclingLayerRef = useRef(null);
  const didInitialFitRef = useRef(false);
  const onSelectVehicleRef = useRef(onSelectVehicle);
  const [searchValue, setSearchValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [prefs, setPrefs] = useState(loadPreferences);

  useEffect(() => { onSelectVehicleRef.current = onSelectVehicle; }, [onSelectVehicle]);

  useEffect(() => {
    if (!prefs.remember) {
      try { window.localStorage.removeItem(PREF_KEY); } catch {}
      return;
    }
    try { window.localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
  }, [prefs]);

  const selectedVehicle = useMemo(() => vehicles.find(v => v.vin === selectedVin) || null, [vehicles, selectedVin]);
  const selectedLocation = useMemo(() => vehicleLocation(selectedVehicle), [selectedVehicle]);

  const fitFleet = useCallback(() => {
    const maps = googleMaps();
    if (!maps || !mapRef.current) return;
    const bounds = new maps.LatLngBounds();
    let points = 0;
    vehicles.forEach(vehicle => {
      const pos = vehicleLocation(vehicle);
      if (!pos) return;
      bounds.extend(pos);
      points += 1;
    });
    if (!points) return;
    if (points === 1) {
      mapRef.current.panTo(bounds.getCenter());
      mapRef.current.setZoom(16);
      return;
    }
    mapRef.current.fitBounds(bounds, 70);
  }, [vehicles]);

  const centerSelected = useCallback((zoom = 16) => {
    if (!mapRef.current || !selectedLocation) return;
    mapRef.current.panTo(selectedLocation);
    if (zoom != null) mapRef.current.setZoom(zoom);
  }, [selectedLocation]);

  const openStreetView = useCallback(() => {
    if (!mapRef.current || !selectedLocation) return;
    const panorama = mapRef.current.getStreetView();
    panorama.setPosition(selectedLocation);
    panorama.setPov({ heading: 0, pitch: 0 });
    panorama.setVisible(true);
  }, [selectedLocation]);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current.parentElement?.requestFullscreen?.();
    } catch {
      // Built-in Google fullscreen control remains available when the browser blocks programmatic fullscreen.
    }
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    const maps = googleMaps();
    if (!maps || !mapRef.current || !searchValue.trim()) return;
    const geocoder = new maps.Geocoder();
    geocoder.geocode({ address: searchValue }, (results, status) => {
      if (status === "OK" && results?.length) {
        const loc = results[0].geometry.location;
        mapRef.current.panTo(loc);
        mapRef.current.setZoom(14);
      }
    });
  };

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new maps.Map(containerRef.current, {
          center: { lat: 39.1031, lng: -84.5120 },
          zoom: 10,
          mapTypeId: prefs.mapTypeId,
          gestureHandling: "greedy",
          scrollwheel: true,
          draggable: true,
          disableDoubleClickZoom: false,
          keyboardShortcuts: true,
          mapTypeControl: true,
          mapTypeControlOptions: {
            style: maps.MapTypeControlStyle?.HORIZONTAL_BAR,
            position: maps.ControlPosition?.TOP_RIGHT,
            mapTypeIds: ["roadmap", "satellite", "hybrid", "terrain"],
          },
          streetViewControl: true,
          streetViewControlOptions: { position: maps.ControlPosition?.RIGHT_BOTTOM },
          fullscreenControl: true,
          fullscreenControlOptions: { position: maps.ControlPosition?.RIGHT_TOP },
          zoomControl: true,
          zoomControlOptions: { position: maps.ControlPosition?.RIGHT_BOTTOM },
        });
        mapRef.current.addListener("maptypeid_changed", () => {
          const next = mapRef.current?.getMapTypeId?.();
          if (next) setPrefs(prev => prev.mapTypeId === next ? prev : { ...prev, mapTypeId: next });
        });
        trafficLayerRef.current = new maps.TrafficLayer();
        transitLayerRef.current = new maps.TransitLayer();
        bicyclingLayerRef.current = new maps.BicyclingLayer();
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || "Map failed to load");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setMapTypeId(prefs.mapTypeId);
  }, [prefs.mapTypeId]);

  useEffect(() => {
    if (!mapRef.current) return;
    trafficLayerRef.current?.setMap(prefs.traffic ? mapRef.current : null);
    transitLayerRef.current?.setMap(prefs.transit ? mapRef.current : null);
    bicyclingLayerRef.current?.setMap(prefs.bicycling ? mapRef.current : null);
  }, [prefs.traffic, prefs.transit, prefs.bicycling, loading]);

  useEffect(() => {
    const maps = googleMaps();
    if (!maps || !mapRef.current) return;
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    vehicles.forEach((vehicle) => {
      const pos = vehicleLocation(vehicle);
      if (!pos) return;
      const selected = vehicle.vin === selectedVin;
      const marker = new maps.Marker({
        position: pos,
        map: mapRef.current,
        icon: pinSvg(makeColor(vehicle.model?.make || ""), selected),
        title: vehicleLabel(vehicle),
        label: prefs.vehicleLabels ? { text: vehicleLabel(vehicle), color: "#111827", fontSize: "11px", fontWeight: "700" } : undefined,
        zIndex: selected ? 999 : 1,
      });
      marker.addListener("click", () => onSelectVehicleRef.current?.(vehicle.vin));
      markersRef.current.push(marker);
    });

    if (prefs.autoFit && !selectedVin && !didInitialFitRef.current) {
      didInitialFitRef.current = true;
      fitFleet();
    }
  }, [vehicles, selectedVin, prefs.vehicleLabels, prefs.autoFit, fitFleet, loading]);

  useEffect(() => {
    if (!selectedVin || !selectedLocation) return;
    centerSelected(16);
  }, [selectedVin, selectedLocation, centerSelected, loading]);

  useEffect(() => {
    if (!prefs.followSelected || !selectedLocation) return;
    centerSelected(null);
  }, [prefs.followSelected, selectedLocation, centerSelected]);

  useEffect(() => {
    const maps = googleMaps();
    if (!maps || !mapRef.current) return;
    tripLayerRef.current.forEach(layer => layer.setMap(null));
    tripLayerRef.current = [];
    const path = tripCoords(selectedTrip);
    if (path.length < 2) return;
    const dot = (color) => ({ path: maps.SymbolPath.CIRCLE, scale: 7, fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 });
    const line = new maps.Polyline({ path, map: mapRef.current, strokeColor: "#2b73ff", strokeWeight: 4, strokeOpacity: 0.9 });
    const start = new maps.Marker({ position: path[0], map: mapRef.current, icon: dot("#28a745"), title: "Trip start", zIndex: 1000 });
    const end = new maps.Marker({ position: path[path.length - 1], map: mapRef.current, icon: dot("#dc3545"), title: "Trip end", zIndex: 1000 });
    tripLayerRef.current = [line, start, end];
    const bounds = new maps.LatLngBounds();
    path.forEach(point => bounds.extend(point));
    mapRef.current.fitBounds(bounds, 80);
  }, [selectedTrip, loading]);

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const maps = googleMaps();
      if (maps && mapRef.current) maps.event.trigger(mapRef.current, "resize");
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const setBoolPref = (key) => setPrefs(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      <form onSubmit={handleSearch} className="absolute top-14 left-3 z-10" style={{ width: "min(390px, calc(100vw - 100px))" }}>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg shadow-md px-3 py-2 border border-gray-200 dark:border-slate-700">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input type="text" value={searchValue} onChange={(e) => setSearchValue(e.target.value)} placeholder="City, neighborhood, ZIP, address" className="flex-1 min-w-0 outline-none text-sm text-gray-700 dark:text-slate-200 bg-transparent" />
          <button type="button" onClick={() => setLayersOpen(value => !value)} className={`p-1.5 rounded-md transition-colors ${layersOpen ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300" : "text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"}`} title="Map layers and settings" aria-expanded={layersOpen}><Layers className="w-4 h-4" /></button>
        </div>
      </form>

      <div className="absolute top-[102px] left-3 z-10 flex flex-wrap gap-1.5 max-w-[calc(100%-90px)]">
        <MapAction icon={MapIcon} label="My Fleet" onClick={fitFleet} />
        <MapAction icon={LocateFixed} label="Center Vehicle" onClick={() => centerSelected(16)} disabled={!selectedLocation} />
        <MapAction icon={Navigation} label={prefs.followSelected ? "Following" : "Follow"} active={prefs.followSelected} onClick={() => setBoolPref("followSelected")} disabled={!selectedLocation} />
        <MapAction icon={Eye} label="Street View" onClick={openStreetView} disabled={!selectedLocation} />
        <MapAction icon={Maximize2} label="Fullscreen" onClick={toggleFullscreen} />
      </div>

      {layersOpen && <div className="absolute top-[142px] left-3 z-20 w-[min(360px,calc(100vw-24px))] rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between"><div><div className="font-semibold text-gray-900 dark:text-slate-100">Map Layers & Settings</div><div className="text-xs text-gray-500 dark:text-slate-400">Preferences are saved on this device.</div></div><button onClick={() => setLayersOpen(false)} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800" aria-label="Close map settings"><X className="w-4 h-4" /></button></div>
        <div className="p-4 space-y-4 max-h-[calc(100vh-220px)] overflow-y-auto">
          <div><div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Map type</div><div className="grid grid-cols-2 gap-2">{[
            ["roadmap", "Roadmap"], ["satellite", "Satellite"], ["hybrid", "Hybrid"], ["terrain", "Terrain"],
          ].map(([id, label]) => <button key={id} onClick={() => setPrefs(prev => ({ ...prev, mapTypeId: id }))} className={`rounded-lg border px-3 py-2 text-sm text-left ${prefs.mapTypeId === id ? "border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-200" : "border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300"}`}>{label}</button>)}</div></div>
          <div><div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Layers</div><div className="space-y-1"><SettingRow icon={TrafficCone} label="Traffic" checked={prefs.traffic} onChange={() => setBoolPref("traffic")} /><SettingRow icon={BusFront} label="Transit" checked={prefs.transit} onChange={() => setBoolPref("transit")} /><SettingRow icon={Bike} label="Bicycle routes" checked={prefs.bicycling} onChange={() => setBoolPref("bicycling")} /></div></div>
          <div><div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Fleet behavior</div><div className="space-y-1"><SettingRow icon={Crosshair} label="Auto-fit fleet" checked={prefs.autoFit} onChange={() => setBoolPref("autoFit")} /><SettingRow icon={Navigation} label="Follow selected vehicle" checked={prefs.followSelected} disabled={!selectedLocation} onChange={() => setBoolPref("followSelected")} /><SettingRow icon={MapIcon} label="Vehicle labels" checked={prefs.vehicleLabels} onChange={() => setBoolPref("vehicleLabels")} /><SettingRow icon={Layers} label="Remember map preferences" checked={prefs.remember} onChange={() => setBoolPref("remember")} /></div></div>
          <div className="grid grid-cols-2 gap-2"><button onClick={openStreetView} disabled={!selectedLocation} className="rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 text-sm disabled:opacity-40 inline-flex items-center justify-center gap-2"><Eye className="w-4 h-4" />Street View</button><button onClick={toggleFullscreen} className="rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 text-sm inline-flex items-center justify-center gap-2"><Maximize2 className="w-4 h-4" />Fullscreen</button></div>
        </div>
      </div>}

      {loading && <div className="absolute inset-0 flex items-center justify-center bg-gray-100/40 pointer-events-none"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}
      {error && <div className="absolute inset-0 flex items-center justify-center bg-red-50 text-red-700 text-sm p-4 text-center">{error}</div>}
    </div>
  );
}

function MapAction({ icon: Icon, label, onClick, disabled = false, active = false }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={label} className={`rounded-lg border px-2.5 py-2 shadow-sm text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${active ? "border-indigo-400 bg-indigo-600 text-white" : "border-gray-200 bg-white/95 text-gray-700 hover:bg-white dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200"}`}><Icon className="w-4 h-4" /><span className="hidden xl:inline">{label}</span></button>;
}

function SettingRow({ icon: Icon, label, checked, onChange, disabled = false }) {
  return <label className={`flex items-center gap-3 rounded-lg px-2 py-2 ${disabled ? "opacity-45" : "hover:bg-gray-50 dark:hover:bg-slate-800/60 cursor-pointer"}`}><Icon className="w-4 h-4 text-gray-400" /><span className="flex-1 text-sm text-gray-700 dark:text-slate-300">{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="w-4 h-4 rounded border-gray-300 text-indigo-600" /></label>;
}
