import React, { useState } from "react";
import {
  Gauge, MapPin, Car, Cloud, TrafficCone, AlertTriangle, Clock, Route,
  Fuel, Activity, Battery, Wrench, Zap, ChevronRight, MoreHorizontal
} from "lucide-react";

const DEFAULT_SETTINGS = [
  { key: "speed", label: "Speed", icon: Gauge, enabled: true, sub: "" },
  { key: "geozones", label: "Geo-Zones", icon: MapPin, enabled: false, sub: "" },
  { key: "impact", label: "Impact Detection", icon: Car, enabled: true, sub: "Alert when impact detected" },
  { key: "nws", label: "National Weather Service", icon: Cloud, enabled: false, sub: "" },
  { key: "rapidAccel", label: "Rapid Acceleration", icon: TrafficCone, enabled: true, sub: "Excessive" },
  { key: "hardBraking", label: "Hard Braking", icon: AlertTriangle, enabled: true, sub: "Excessive" },
  { key: "curfews", label: "Curfews", icon: Clock, enabled: false, sub: "" },
  { key: "tripStartEnd", label: "Trip Start and End", icon: Route, enabled: false, sub: "" },
  { key: "fuelLevel", label: "Fuel Level", icon: Fuel, enabled: true, sub: "25% left" },
  { key: "distance", label: "Distance Driven", icon: Route, enabled: false, sub: "" },
  { key: "idleTime", label: "Idle Time", icon: Activity, enabled: false, sub: "" },
  { key: "tripFuelEconomy", label: "Trip Fuel Economy", icon: Fuel, enabled: true, sub: "10-19 mpg" },
  { key: "battery", label: "Battery", icon: Battery, enabled: true, sub: "Low and Critical" },
  { key: "dtc", label: "Diagnostic Trouble Code", icon: Wrench, enabled: true, sub: "" },
  { key: "tamper", label: "Tamper Detection", icon: Zap, enabled: true, sub: "" },
];

export default function AlertSettingsModal({ open, onClose, vehicle }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  if (!open) return null;

  const toggle = (key) => setSettings(s => s.map(x => x.key === key ? { ...x, enabled: !x.enabled } : x));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <button onClick={onClose} className="text-sm font-semibold" style={{ color: "#2b73ff" }}>{"< Back to Alerts"}</button>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><MoreHorizontal className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Alert Settings</h2>
          <p className="text-xs text-gray-500">{vehicle?.nickName || "Vehicle"} · {vehicle?.model?.year} {vehicle?.model?.make}</p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {settings.map((s, i) => (
            <div key={s.key} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <s.icon className="w-4 h-4 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800">{s.label}</div>
                {s.sub && <div className="text-xs text-gray-500">{s.sub}</div>}
              </div>
              {s.enabled && (
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#28a745" }} />
              )}
              <button onClick={() => toggle(s.key)} className="relative w-10 h-6 rounded-full transition-colors" style={{ background: s.enabled ? "#28a745" : "#ccc" }}>
                <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all" style={{ left: s.enabled ? "20px" : "2px" }} />
              </button>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}