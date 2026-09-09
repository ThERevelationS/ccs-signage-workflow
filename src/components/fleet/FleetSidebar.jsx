import React from "react";
import { Car, ExternalLink, Menu } from "lucide-react";
import { makeColor } from "./fleetHelpers";

export default function FleetSidebar({ vehicles, selectedVin, onSelectVehicle, onAddVehicle, onMenu, totalCount }) {
  return (
    <div className="h-full flex flex-col" style={{ background: "#1b2029", color: "#fff", width: 280 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#2a2f3a" }}>
        <button onClick={onMenu} className="p-1 hover:opacity-70" title="Menu">
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-sm text-gray-300">
          Viewing {selectedVin ? 1 : 0} of {totalCount || vehicles.length} vehicle{(totalCount || vehicles.length) !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Vehicle list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {vehicles.map((v) => {
          const make = v.model?.make || "";
          const color = makeColor(make);
          const active = v.vin === selectedVin;
          return (
            <button
              key={v.vin}
              onClick={() => onSelectVehicle(v.vin)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg mb-1 text-left transition-colors"
              style={{
                background: active ? "#2f3643" : "transparent",
                border: active ? "1px solid #3b4249" : "1px solid transparent",
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 relative"
                style={{ background: color }}
              >
                <Car className="w-5 h-5 text-white" />
                {v.stats?.location && (
                  <span
                    className="absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full border-2"
                    style={{ background: "#2b73ff", borderColor: "#1b2029" }}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm text-white truncate">{v.nickName || v.model?.name || "Vehicle"}</div>
                <div className="text-xs text-gray-400 truncate">
                  {v.model?.year ? `${v.model.year} ` : ""}{make}
                </div>
              </div>
            </button>
          );
        })}
        {vehicles.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-8">No vehicles found.</div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t" style={{ borderColor: "#2a2f3a" }}>
        <button
          onClick={onAddVehicle}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Manage Vehicles in Bouncie
        </button>
      </div>
    </div>
  );
}