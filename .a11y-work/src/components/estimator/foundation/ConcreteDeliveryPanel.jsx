import React from "react";
import { money } from "./foundationCalc";

/**
 * Project-level ready-mix ordering, matching SignEstimate Pro:
 * mix strength + admixtures set the rate per yard, then yards are split into
 * 9-yard trucks with a small-load fee bracket and fuel surcharge per truck.
 */
export default function ConcreteDeliveryPanel({ project, delivery, onChange }) {
  const admixtures = project.project_concrete_admixtures || [];

  const toggleAdmix = (id) =>
    onChange({
      project_concrete_admixtures: admixtures.includes(id)
        ? admixtures.filter((a) => a !== id)
        : [...admixtures, id],
    });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 text-sm">Ready-Mix Concrete Order</h3>
        <div className="text-right">
          <div className="font-bold text-gray-900">{money(delivery.concreteTotal)}</div>
          <div className="text-[11px] text-gray-400">
            {delivery.roundedYards.toFixed(2)} CY · {money(delivery.ratePerYard)}/CY
          </div>
        </div>
      </div>

      <label className="text-xs text-gray-500 block">
        Mix strength
        <select
          value={project.project_concrete_type || "4000_ae"}
          onChange={(e) => onChange({ project_concrete_type: e.target.value })}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
        >
          {delivery.availableMixes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} — {money(m.price)}/CY
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-gray-400 mt-1">
        {delivery.availableMixes.find((m) => m.id === (project.project_concrete_type || "4000_ae"))?.desc}
      </p>

      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="text-xs font-medium text-gray-700 mb-2">Admixtures</div>
        <div className="space-y-2">
          {delivery.availableAdmixes.map((a) => (
            <label key={a.id} className="flex gap-2 items-start text-xs text-gray-600">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={admixtures.includes(a.id)}
                onChange={() => toggleAdmix(a.id)}
              />
              <span>
                <span className="font-medium text-gray-800">{a.name}</span> — {money(a.price)}/CY
                <span className="block text-[11px] text-gray-400">{a.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {delivery.trucksList.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
          {delivery.trucksList.map((t, i) => (
            <div key={i} className="flex justify-between text-xs text-gray-600">
              <span>
                Truck {i + 1} — {t.roundedYards.toFixed(2)} CY
                {t.smallOrderFee > 0 && ` (small load ${money(t.smallOrderFee)})`}
                {t.fuelFee > 0 && ` + fuel ${money(t.fuelFee)}`}
              </span>
              <span className="font-medium text-gray-800">{money(t.cost)}</span>
            </div>
          ))}
          {delivery.additionalStopsCost > 0 && (
            <div className="flex justify-between text-xs text-gray-600">
              <span>Additional sign locations / stops</span>
              <span className="font-medium text-gray-800">{money(delivery.additionalStopsCost)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}