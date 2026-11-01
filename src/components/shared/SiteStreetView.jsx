import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { getSessionToken } from "@/components/auth/EmailGate";
import { MapPin, Loader2, ExternalLink } from "lucide-react";

/**
 * Street View preview of an address (backend-proxied — API key stays server-side).
 * Renders nothing until an address of reasonable length is present.
 * States: loading → image | no coverage | error (silent-ish, non-blocking).
 */
export default function SiteStreetView({ address, className = "" }) {
  const [state, setState] = useState({ status: "idle" });
  const seqRef = useRef(0);
  const timerRef = useRef(null);
  const addr = String(address || "").trim();

  useEffect(() => {
    const seq = ++seqRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (addr.length < 8) {
      setState({ status: "idle" });
      return;
    }
    timerRef.current = setTimeout(async () => {
      setState({ status: "loading" });
      try {
        const res = await base44.functions.invoke("streetViewPreview", {
          address: addr,
          session_token: getSessionToken(),
        });
        if (seqRef.current !== seq) return;
        const d = res?.data || {};
        if (d.available && d.image_data_url) {
          setState({ status: "ok", img: d.image_data_url, date: d.date });
        } else {
          setState({ status: "none" });
        }
      } catch {
        if (seqRef.current === seq) setState({ status: "error" });
      }
    }, 700);
    return () => timerRef.current && clearTimeout(timerRef.current);
  }, [addr]);

  if (state.status === "idle") return null;

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;

  if (state.status === "loading") {
    return (
      <div className={`flex items-center gap-1.5 text-[11px] text-slate-400 mt-1 ${className}`}>
        <Loader2 className="w-3 h-3 animate-spin" /> Checking Street View…
      </div>
    );
  }

  if (state.status !== "ok") {
    return (
      <div className={`flex items-center gap-1.5 text-[11px] text-slate-400 mt-1 ${className}`}>
        <MapPin className="w-3 h-3" />
        {state.status === "none" ? "No Street View coverage" : "Street View unavailable"}
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
          Maps <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    );
  }

  return (
    <div className={`mt-1.5 ${className}`}>
      <a href={mapsUrl} target="_blank" rel="noreferrer" className="block group relative rounded-md overflow-hidden border border-slate-200">
        <img src={state.img} alt={`Street view of ${addr}`} className="w-full h-auto block" loading="lazy" />
        <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
          Open in Maps <ExternalLink className="w-2.5 h-2.5" />
        </span>
      </a>
      {state.date && <div className="text-[10px] text-slate-400 mt-0.5">Street View imagery: {state.date}</div>}
    </div>
  );
}
