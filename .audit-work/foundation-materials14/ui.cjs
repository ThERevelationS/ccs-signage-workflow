const fs = require('fs');

// ---------- ConcreteDeliveryPanel.jsx (full rewrite — small file) ----------
fs.writeFileSync('src/components/estimator/foundation/ConcreteDeliveryPanel.jsx', `import { money } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";

const amt = (v) => (hasFoundationCostSnapshot(v) ? money(v) : "Not saved");
const cy = (v) => (Number.isFinite(v) ? \`\${v.toFixed(2)} CY\` : "Not saved");

export default function ConcreteDeliveryPanel({ project, delivery, onChange }) {
  const admixtures = project.project_concrete_admixtures || [];
  const unavailable = delivery?.pricingUnavailable === true;
  const mixes = delivery?.availableMixes || [];
  const admix = delivery?.availableAdmixes || [];
  const savedMixId = project.project_concrete_type;
  const mixMissing = savedMixId && !mixes.some((m) => m.id === savedMixId);
  const trucks = delivery?.trucksList || [];

  const toggleAdmix = (id) =>
    onChange({
      project_concrete_admixtures: admixtures.includes(id)
        ? admixtures.filter((a) => a !== id)
        : [...admixtures, id],
    });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {unavailable && (
        <p className="mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
          Saved amounts (not current pricing)
        </p>
      )}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 text-sm">Ready-Mix Concrete Order</h3>
        <div className="text-right">
          <div className="font-bold text-gray-900">{amt(delivery?.concreteTotal)}</div>
          <div className="text-[11px] text-gray-400">
            {cy(delivery?.roundedYards)} · {amt(delivery?.ratePerYard)}/CY
          </div>
        </div>
      </div>

      <label className="text-xs text-gray-500 block">
        Mix strength
        <select
          value={savedMixId || "4000_ae"}
          disabled={unavailable}
          onChange={(e) => onChange({ project_concrete_type: e.target.value })}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm disabled:opacity-60"
        >
          {mixMissing && <option value={savedMixId} disabled>Catalog mix unavailable ({savedMixId})</option>}
          {mixes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} — {money(m.price)}/CY
            </option>
          ))}
        </select>
      </label>
      {!mixMissing && (
        <p className="text-[11px] text-gray-400 mt-1">
          {mixes.find((m) => m.id === (savedMixId || "4000_ae"))?.desc}
        </p>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="text-xs font-medium text-gray-700 mb-2">Admixtures</div>
        <div className="space-y-2">
          {admixtures
            .filter((id) => !admix.some((a) => a.id === id))
            .map((id) => (
              <div key={id} className="text-xs text-amber-700">Catalog admixture unavailable ({id})</div>
            ))}
          {admix.map((a) => (
            <label key={a.id} className={\`flex gap-2 items-start text-xs \${unavailable ? "text-gray-400" : "text-gray-600"}\`}>
              <input
                type="checkbox"
                className="mt-0.5"
                disabled={unavailable}
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

      {trucks.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
          {trucks.map((t, i) => (
            <div key={i} className="flex justify-between text-xs text-gray-600">
              <span>
                Truck {i + 1} — {cy(t.roundedYards)}
                {Number.isFinite(t.smallOrderFee) && t.smallOrderFee > 0 && \` (small load \${money(t.smallOrderFee)})\`}
                {Number.isFinite(t.fuelFee) && t.fuelFee > 0 && \` + fuel \${money(t.fuelFee)}\`}
              </span>
              <span className="font-medium text-gray-800">{amt(t.cost)}</span>
            </div>
          ))}
          {(delivery?.additionalStopsCost ?? 0) > 0 && (
            <div className="flex justify-between text-xs text-gray-600">
              <span>Additional sign locations / stops</span>
              <span className="font-medium text-gray-800">{amt(delivery.additionalStopsCost)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
`);

// ---------- FoundationTotals.jsx ----------
let p = 'src/components/estimator/foundation/FoundationTotals.jsx';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  `import { money } from "./foundationCalc";

export default function FoundationTotals({ totals, pricingUnavailable = false }) {
  const lines = [`,
  `import { money } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";

const amt = (v) => (hasFoundationCostSnapshot(v) ? money(v) : "Not saved");
const known = (v, d, u) => (Number.isFinite(v) ? \`\${v.toFixed(d)} \${u}\` : "Not saved");

export default function FoundationTotals({ totals, pricingUnavailable = false }) {
  const wallMortar = [totals.total_wall_cost, totals.total_brick_cost, totals.total_fill_cost].every(Number.isFinite)
    ? totals.total_wall_cost - totals.total_brick_cost - totals.total_fill_cost
    : undefined;
  const lines = [`
);
s = s.replace('["Wall mortar + labor", (totals.total_wall_cost || 0) - (totals.total_brick_cost || 0) - (totals.total_fill_cost || 0)],', '["Wall mortar + labor", wallMortar],');
s = s.replace('["Concrete", `${totals.total_concrete_volume_cy.toFixed(2)} CY`],', '["Concrete", known(totals.total_concrete_volume_cy, 2, "CY")],');
s = s.replace('["Excavation", `${totals.total_excavation_volume_cy.toFixed(2)} CY`],', '["Excavation", known(totals.total_excavation_volume_cy, 2, "CY")],');
s = s.replace('["Labor", `${totals.total_labor_hours.toFixed(1)} hr`],', '["Labor", known(totals.total_labor_hours, 1, "hr")],');
s = s.replace('<span>{money(value)}</span>', '<span>{amt(value)}</span>');
fs.writeFileSync(p, s);
console.log('delivery+totals done');
