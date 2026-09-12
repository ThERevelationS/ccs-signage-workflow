import { base44 } from "@/api/base44Client";

let gmapsLoaderPromise = null;
const googleMaps = () => /** @type {any} */ (window).google?.maps;

export function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (googleMaps()) return Promise.resolve(googleMaps());
  if (gmapsLoaderPromise) return gmapsLoaderPromise;

  gmapsLoaderPromise = (async () => {
    const { data } = await base44.functions.invoke("getGoogleMapsKey", {});
    if (!data?.apiKey) throw new Error(data?.error || "Missing Google Maps API key");
    return new Promise((resolve, reject) => {
      const existing = document.getElementById("google-maps-script");
      if (existing) {
        if (googleMaps()) return resolve(googleMaps());
        existing.addEventListener("load", () => resolve(googleMaps()));
        existing.addEventListener("error", reject);
        return;
      }
      const script = document.createElement("script");
      script.id = "google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&v=weekly`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(googleMaps());
      script.onerror = () => reject(new Error("Failed to load Google Maps"));
      document.head.appendChild(script);
    });
  })();
  return gmapsLoaderPromise;
}