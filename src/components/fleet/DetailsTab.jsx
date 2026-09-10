import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Car, ArrowRight, ExternalLink } from "lucide-react";
import { makeColor } from "./fleetHelpers";

export default function DetailsTab({ vehicle, fleetEquipment }) {
  const stats = vehicle?.stats || {};
  const model = vehicle?.model || {};
  const loc = stats.location || {};
  const maintenanceUrl = fleetEquipment ? `${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(fleetEquipment.id)}` : createPageUrl("FleetEquipment");

  return (
    <div className="p-4">
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: makeColor(model.make) }}>
          <Car className="w-10 h-10 text-white" />
        </div>
        <div className="mt-2 text-center">
          <div className="font-bold text-gray-900 dark:text-slate-100">{vehicle?.nickName || model.name || "Vehicle"}</div>
          <div className="text-xs text-gray-500 dark:text-slate-400">{model.year} {model.make} {model.name}</div>
        </div>
      </div>

      <Section title="Current Bouncie State">
        <Field label="Current Location" value={loc.address || "—"} full />
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Odometer" value={stats.odometer != null ? `${Math.round(stats.odometer).toLocaleString()} miles` : "—"} />
          <Field label="Fuel" value={stats.fuelLevel != null ? `${Math.round(stats.fuelLevel)}%` : "—"} />
          <Field label="Trip State" value={stats.isRunning ? "Running" : "Parked"} />
          <Field label="Timezone" value={stats.localTimeZone || "—"} />
        </div>
      </Section>

      <Section title="Bouncie Vehicle Identity">
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Nickname" value={vehicle?.nickName || "—"} />
          <Field label="Vehicle" value={`${model.year || ""} ${model.make || ""} ${model.name || ""}`.trim() || "—"} />
          <Field label="License Plate" value={vehicle?.licensePlate || "—"} />
          <Field label="VIN" value={vehicle?.vin || "—"} />
          <Field label="Device IMEI" value={vehicle?.imei || "—"} />
          <Field label="Engine" value={vehicle?.standardEngine || "—"} full />
          <Field label="Body Style" value={vehicle?.bodyStyle || "—"} />
        </div>
        <div className="mt-3 text-[11px] text-gray-500 dark:text-slate-400">Bouncie owns tracking identity, telemetry, trips, and device state. These values are intentionally read-only in CCS.</div>
      </Section>

      <Section title="CCS Fleet Maintenance">
        {fleetEquipment ? <>
          <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 p-3">
            <div className="font-semibold text-sm text-gray-900 dark:text-slate-100">{fleetEquipment.name}</div>
            <div className="text-xs text-gray-600 dark:text-slate-300 mt-1 capitalize">Status: {String(fleetEquipment.status || "unknown").replaceAll("_", " ")}</div>
          </div>
          <Link to={maintenanceUrl} className="mt-3 w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm inline-flex items-center justify-center gap-2">Open maintenance & CCS metadata <ArrowRight className="w-4 h-4" /></Link>
        </> : <>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-sm text-amber-800 dark:text-amber-200">No exact FleetEquipment VIN match exists for this Bouncie vehicle. CCS will not guess a maintenance record.</div>
          <Link to={maintenanceUrl} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-300">Review Fleet equipment <ArrowRight className="w-4 h-4" /></Link>
        </>}
      </Section>

      <a href="https://www.bouncie.com/app" target="_blank" rel="noreferrer" className="w-full py-2.5 rounded-lg border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-200 font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-800">Manage Bouncie-owned vehicle settings <ExternalLink className="w-4 h-4" /></a>
    </div>
  );
}

function Section({ title, children }) {
  return <div className="mb-6"><h3 className="text-xs font-bold uppercase tracking-wide mb-2 text-gray-600 dark:text-slate-300">{title}</h3><div className="border border-gray-200 dark:border-slate-700 rounded p-3">{children}</div></div>;
}

function Field({ label, value, full }) {
  return <div className={`py-2 ${full ? "col-span-2" : ""}`}><div className="text-[10px] font-semibold uppercase text-gray-400 dark:text-slate-500 mb-1">{label}</div><div className="text-sm text-gray-800 dark:text-slate-200 break-words">{value}</div></div>;
}