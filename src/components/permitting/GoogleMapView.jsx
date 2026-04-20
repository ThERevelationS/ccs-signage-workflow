import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";

// Shared loader so the Google Maps script is only injected once
let gmapsLoaderPromise = null;

function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (gmapsLoaderPromise) return gmapsLoaderPromise;

  gmapsLoaderPromise = (async () => {
    const { data } = await base44.functions.invoke("getGoogleMapsKey", {});
    if (!data?.apiKey) throw new Error(data?.error || "Missing Google Maps API key");

    return new Promise((resolve, reject) => {
      const existing = document.getElementById("google-maps-script");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.google.maps));
        existing.addEventListener("error", reject);
        return;
      }
      const script = document.createElement("script");
      script.id = "google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&v=weekly`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.google.maps);
      script.onerror = () => reject(new Error("Failed to load Google Maps"));
      document.head.appendChild(script);
    });
  })();

  return gmapsLoaderPromise;
}

/**
 * Lightweight Google Maps view with an optional marker.
 * Props:
 *   position: { lat, lng } | null
 *   defaultCenter: { lat, lng }
 *   markerTitle: string
 */
export default function GoogleMapView({ position, defaultCenter = { lat: 39.1031, lng: -84.5120 }, markerTitle }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Initialize map once
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new maps.Map(containerRef.current, {
          center: position || defaultCenter,
          zoom: position ? 16 : 10,
          disableDefaultUI: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || "Map failed to load");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker + center whenever position changes
  useEffect(() => {
    const maps = window.google?.maps;
    if (!maps || !mapRef.current) return;

    if (position) {
      mapRef.current.panTo(position);
      mapRef.current.setZoom(17);
      if (markerRef.current) {
        markerRef.current.setPosition(position);
        markerRef.current.setTitle(markerTitle || "");
      } else {
        markerRef.current = new maps.Marker({
          position,
          map: mapRef.current,
          title: markerTitle || "",
        });
      }
    } else if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
  }, [position, markerTitle]);

  // Trigger resize when the container size changes (dialogs, splits, etc.)
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const maps = window.google?.maps;
      if (maps && mapRef.current) {
        maps.event.trigger(mapRef.current, "resize");
        mapRef.current.setCenter(position || defaultCenter);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [position, defaultCenter]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100/50 pointer-events-none">
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