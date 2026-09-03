import { base44 } from "@/api/base44Client";

let gmapsLoaderPromise = null;

export function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (gmapsLoaderPromise) return gmapsLoaderPromise;

  gmapsLoaderPromise = (async () => {
    const { data } = await base44.functions.invoke("getGoogleMapsKey", {});
    if (!data?.apiKey) throw new Error(data?.error || "Missing Google Maps API key");
    return new Promise((resolve, reject) => {
      const existing = document.getElementById("google-maps-script");
      if (existing) {
        if (window.google?.maps) return resolve(window.google.maps);
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