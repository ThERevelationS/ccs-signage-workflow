import { useMemo, useState } from "react";
import { Car, ExternalLink, MapPin, Menu, Search } from "lucide-react";
import { makeColor } from "./fleetHelpers";

function liveSpeed(vehicle) {
  const stats = vehicle?.stats || {};
  const raw = typeof stats.speed === "number" ? stats.speed : stats.location?.speed;
  return Number.isFinite(Number(raw)) ? Math.max(0, Math.round(Number(raw))) : null;
}

export default function FleetSidebar({ vehicles, selectedVin, onSelectVehicle, onAddVehicle, onMenu = null, totalCount }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter(vehicle => [
      vehicle.nickName,
      vehicle.vin,
      vehicle.licensePlate,
      vehicle.model?.year,
      vehicle.model?.make,
      vehicle.model?.name,
      vehicle.stats?.location?.address,
    ].some(value => String(value || "").toLowerCase().includes(q)));
  }, [vehicles, search]);

  return (
    <aside className="h-full flex flex-col border-r border-slate-700" style={{ background: "#1b2029", color: "#fff", width: 292 }}>
      <div className="px-3 py-3 border-b border-slate-700 space-y-3">
        <div className="flex items-center gap-3">
          {onMenu && <button onClick={onMenu} className="p-1 hover:opacity-70" title="Menu"><Menu className="w-5 h-5" /></button>}
          <div className="min-w-0 flex-1"><div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Dispatch Fleet</div><div className="text-sm text-gray-300 mt-0.5">{totalCount || vehicles.length} tracked vehicle{(totalCount || vehicles.length) === 1 ? "" : "s"}</div></div>
        </div>
        <div className="relative"><Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search vehicles..." className="w-full rounded-lg border border-slate-600 bg-slate-800 pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-indigo-500" /></div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {filtered.map((vehicle) => {
          const make = vehicle.model?.make || "";
          const color = makeColor(make);
          const active = vehicle.vin === selectedVin;
          const stats = vehicle.stats || {};
          const speed = liveSpeed(vehicle);
          const driving = !!stats.isRunning || (speed != null && speed > 0);
          const address = stats.location?.address || "Location unavailable";
          return (
            <button key={vehicle.vin} onClick={() => onSelectVehicle(vehicle.vin)} className={`w-full rounded-xl mb-1.5 text-left transition-colors border ${active ? "bg-slate-700/80 border-slate-500" : "bg-transparent border-transparent hover:bg-slate-800/80"}`}>
              <div className="flex items-start gap-3 px-3 pt-3 pb-2">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 relative" style={{ background: color }}><Car className="w-5 h-5 text-white" />{stats.location && <span className={`absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full border-2 ${driving ? "bg-emerald-400" : "bg-blue-500"}`} style={{ borderColor: "#1b2029" }} />}</div>
                <div className="min-w-0 flex-1"><div className="font-semibold text-sm text-white truncate">{vehicle.nickName || vehicle.model?.name || "Vehicle"}</div><div className="text-xs text-gray-400 truncate mt-0.5">{[vehicle.model?.year, make, vehicle.model?.name].filter(Boolean).join(" ") || vehicle.vin}</div></div>
                <div className={`shrink-0 text-[10px] font-semibold rounded-full px-2 py-1 ${driving ? "bg-emerald-950 text-emerald-300" : "bg-slate-800 text-slate-300"}`}>{driving ? (speed != null ? `${speed} mph` : "Driving") : "Parked"}</div>
              </div>
              <div className="mx-3 pb-3 flex items-center gap-1.5 text-[11px] text-slate-500"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{address}</span></div>
            </button>
          );
        })}
        {filtered.length === 0 && <div className="text-center text-gray-500 text-sm py-8">{vehicles.length ? "No vehicles match this search." : "No vehicles found."}</div>}
      </div>

      <div className="px-3 py-3 border-t border-slate-700"><button onClick={onAddVehicle} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"><ExternalLink className="w-4 h-4" />Manage Vehicles in Bouncie</button></div>
    </aside>
  );
}
