import React, { useState } from "react";
import { Car } from "lucide-react";
import { makeColor } from "./fleetHelpers";

export default function DetailsTab({ vehicle }) {
  const [editingVehicle, setEditingVehicle] = useState(false);
  const [editingInsurance, setEditingInsurance] = useState(false);
  const [vehicleEdits, setVehicleEdits] = useState({});
  const [insuranceEdits, setInsuranceEdits] = useState({});

  const stats = vehicle?.stats || {};
  const model = vehicle?.model || {};
  const loc = stats.location || {};

  return (
    <div className="p-4">
      {/* Vehicle header */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center relative" style={{ background: makeColor(model.make) }}>
          <Car className="w-10 h-10 text-white" />
          <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow">
            <span className="text-gray-500 text-xs font-bold">···</span>
          </button>
        </div>
        <div className="mt-2 text-center">
          <div className="font-bold text-gray-900">{vehicle?.nickName || model.name || "Vehicle"}</div>
          <div className="text-xs text-gray-500">{model.year} {model.make} {model.name}</div>
        </div>
      </div>

      {/* Daily Summary */}
      <Section title="Daily Summary">
        <Field label="Current Location" value={loc.address || "—"} full />
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Distance" value="—" />
          <Field label="Duration" value="—" />
          <Field label="Idle Time" value="—" />
          <Field label="Max Speed" value="—" />
        </div>
      </Section>

      {/* Vehicle Summary */}
      <Section title="Vehicle Summary" onEdit={() => setEditingVehicle(!editingVehicle)}>
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Nickname" value={vehicle?.nickName || "—"} editing={editingVehicle} onChange={(v) => setVehicleEdits(s => ({ ...s, nickName: v }))} />
          <Field label="Vehicle" value={`${model.year || ""} ${model.make || ""} ${model.name || ""}`} />
          <Field label="Odometer" value={stats.odometer != null ? `${Math.round(stats.odometer).toLocaleString()} miles` : "—"} />
          <Field label="License Plate" value={vehicleEdits.licensePlate || vehicle?.licensePlate || "—"} editing={editingVehicle} onChange={(v) => setVehicleEdits(s => ({ ...s, licensePlate: v }))} />
          <Field label="VIN" value={vehicle?.vin || "—"} />
          <Field label="Device IMEI" value={vehicle?.imei || "—"} />
          <Field label="Engine" value={vehicle?.standardEngine || "—"} full />
          <Field label="Body Style" value={vehicle?.bodyStyle || "—"} />
        </div>
      </Section>

      {/* Insurance Summary */}
      <Section title="Insurance Summary" onEdit={() => setEditingInsurance(!editingInsurance)}>
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Insurance Provider" value={insuranceEdits.provider || vehicle?.insuranceProvider || "ADD INSURANCE"} placeholder editing={editingInsurance} onChange={(v) => setInsuranceEdits(s => ({ ...s, provider: v }))} />
          <Field label="Agent Name" value={insuranceEdits.agentName || vehicle?.insuranceAgent || "ADD AGENT"} placeholder editing={editingInsurance} onChange={(v) => setInsuranceEdits(s => ({ ...s, agentName: v }))} />
          <Field label="Policy Number" value={insuranceEdits.policyNumber || vehicle?.insurancePolicy || "ADD POLICY"} placeholder editing={editingInsurance} onChange={(v) => setInsuranceEdits(s => ({ ...s, policyNumber: v }))} />
          <Field label="Agent Contact" value={insuranceEdits.agentContact || vehicle?.insuranceContact || "ADD AGENT"} placeholder editing={editingInsurance} onChange={(v) => setInsuranceEdits(s => ({ ...s, agentContact: v }))} />
          <Field label="Effective Date" value={vehicle?.insuranceEffective || "—"} />
          <Field label="Expiration Date" value={vehicle?.insuranceExpiration || "—"} />
          <Field label="Reminder" value={vehicle?.insuranceReminder || "None"} full />
        </div>
      </Section>

      <button className="w-full py-3 rounded-lg text-white font-semibold text-sm mt-4" style={{ background: "#2670ff" }}>
        Add User
      </button>
    </div>
  );
}

function Section({ title, onEdit, children }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: "#495057" }}>{title}</h3>
        {onEdit && (
          <button onClick={onEdit} className="text-xs font-semibold" style={{ color: "#2b73ff" }}>EDIT</button>
        )}
      </div>
      <div className="border border-gray-200 rounded p-3">{children}</div>
    </div>
  );
}

function Field({ label, value, full, editing, onChange, placeholder }) {
  return (
    <div className={`py-2 ${full ? "col-span-2" : ""}`}>
      <div className="text-[10px] font-semibold uppercase text-gray-400 mb-1">{label}</div>
      {editing ? (
        <input
          value={value && value !== "ADD INSURANCE" && value !== "ADD AGENT" && value !== "ADD POLICY" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ? `Add ${label.toLowerCase()}` : ""}
          className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
        />
      ) : (
        <div className={`text-sm ${placeholder ? "font-semibold" : "text-gray-800"}`} style={placeholder ? { color: "#2b73ff" } : {}}>
          {value}
        </div>
      )}
    </div>
  );
}