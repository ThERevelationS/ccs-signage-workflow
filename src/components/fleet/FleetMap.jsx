import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "./loadGoogleMaps";
import { Loader2, Search, Layers } from "lucide-react";
import { makeColor } from "./fleetHelpers";

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
    anchor: undefined
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

export default function FleetMap({ vehicles, selectedVin, selectedTrip, onSelectVehicle }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const tripLayerRef = useRef([]);
  const [searchValue, setSearchValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const handleSearch = (e) => {
    e.preventDefault();
    const maps = window.google?.maps;
    if (!maps || !mapRef.current || !searchValue.trim()) return;
    const geocoder = new maps.Geocoder();
    geocoder.geocode({ address: searchValue }, (results, status) => {
      if (status === "OK" && results && results.length) {
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
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          zoomControlOptions: { position: maps.ControlPosition?.RIGHT_BOTTOM ?? 3 },
        });

        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || "Map failed to load");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Render / update markers
  useEffect(() => {
    const maps = window.google?.maps;
    if (!maps || !mapRef.current) return;

    // clear old
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const bounds = new maps.LatLngBounds();
    let hasPoints = false;

    vehicles.forEach((v) => {
      const loc = v.stats?.location;
      if (!loc || loc.lat == null || loc.lon == null) return;
      hasPoints = true;
      const pos = { lat: loc.lat, lng: loc.lon };
      const selected = v.vin === selectedVin;
      const make = v.model?.make || "";
      const marker = new maps.Marker({
        position: pos,
        map: mapRef.current,
        icon: pinSvg(makeColor(make), selected),
        title: v.nickName || v.model?.name || "Vehicle",
        zIndex: selected ? 999 : 1,
      });
      marker.addListener("click", () => onSelectVehicle(v.vin));
      markersRef.current.push(marker);
      bounds.extend(pos);
    });

    if (hasPoints && !selectedVin) {
      mapRef.current.fitBounds(bounds, 60);
    }
  }, [vehicles]);

  // Recenter on selected vehicle
  useEffect(() => {
    const maps = window.google?.maps;
    if (!maps || !mapRef.current || !selectedVin) return;
    const sel = vehicles.find(v => v.vin === selectedVin);
    const loc = sel?.stats?.location;
    if (loc && loc.lat != null && loc.lon != null) {
      mapRef.current.panTo({ lat: loc.lat, lng: loc.lon });
      mapRef.current.setZoom(16);
    }
  }, [selectedVin]);

  // Draw selected trip route
  useEffect(() => {
    const maps = window.google?.maps;
    if (!maps || !mapRef.current) return;
    tripLayerRef.current.forEach(o => o.setMap(null));
    tripLayerRef.current = [];
    const path = tripCoords(selectedTrip);
    if (path.length < 2) return;
    const dot = (color) => ({
      path: maps.SymbolPath.CIRCLE, scale: 7, fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2,
    });
    const line = new maps.Polyline({ path, map: mapRef.current, strokeColor: "#2b73ff", strokeWeight: 4, strokeOpacity: 0.9 });
    const start = new maps.Marker({ position: path[0], map: mapRef.current, icon: dot("#28a745"), title: "Trip start", zIndex: 1000 });
    const end = new maps.Marker({ position: path[path.length - 1], map: mapRef.current, icon: dot("#dc3545"), title: "Trip end", zIndex: 1000 });
    tripLayerRef.current = [line, start, end];
    const bounds = new maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    mapRef.current.fitBounds(bounds, 80);
  }, [selectedTrip]);

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const maps = window.google?.maps;
      if (maps && mapRef.current) maps.event.trigger(mapRef.current, "resize");
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Search box */}
      <form onSubmit={handleSearch} className="absolute top-14 left-3 z-10" style={{ width: "min(340px, 70vw)" }}>
        <div className="flex items-center gap-2 bg-white rounded shadow-md px-3 py-2 border border-gray-200">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="City, Neighborhood, ZIP, Address"
            className="flex-1 outline-none text-sm text-gray-700 bg-transparent"
          />
          <Layers className="w-4 h-4 text-gray-400 flex-shrink-0" />
        </div>
      </form>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100/40 pointer-events-none">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 text-red-700 text-sm p-4 text-center">
          {error}
        </div>
      )}
    </div>
  );
}