import { Input } from "@/components/ui/input";
import { Trash2, Box, Copy } from "lucide-react";
import { money } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
import { inventoryNumberInput, groupInventoryBySupplier } from "@/components/masterInventory/inventoryNormalization";
import { FoundationDimensionInput } from "./foundationFtInEntry";
import { foundationDimensionFieldMeta } from "./foundationGeometryInputs";
import { suggestFeasibleFoundationDims } from "./poleCalculator";

const amt = (v) => (hasFoundationCostSnapshot(v) ? money(v) : "Not saved");
const num2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "Not saved");

const Field = ({ label, field, ...props }) => (
  <label className="text-xs text-gray-500">
    {label}
    <Input data-field={field} {...props} />
  </label>
);

// O-093 — dimension fields share the panels' ft/in widget + one metadata
// source (plain-language label/help/placeholder/unit/signed). Malformed
// drafts stay verbatim + hinted, never silently coerced.
const DimField = ({ field, value, onCommit }) => (
  <FoundationDimensionInput
    {...foundationDimensionFieldMeta("foundation", field)}
    data-field={field}
    value={value ?? ""}
    onCommit={onCommit}
  />
);

// O-093 dimensional diagram — a labeled plan + depth section beside the
// inputs: spread footing shows L×W rectangle, pillar shows Ø circle; the
// depth arrow carries the grade-offset line so +above/−below reads visually.
// Rendered for numeric dims; malformed drafts still parse to a shape or the
// diagram stays empty (honest — it never draws guessed dimensions).
const DiagramDim = ({ x, y, label, value }) => (
  <text x={x} y={y} textAnchor="middle" fontSize="8" fill="#6b7280">{label} {value}</text>
);
const DimensionDiagram = ({ item }) => {
  const isPillar = item.foundation_type === "pillar";
  const l = Number(item.length_inches), w = Number(item.width_inches);
  const d = Number(item.depth_inches), dia = Number(item.diameter);
  const off = Number(item.grade_offset_inches) || 0;
  const planOk = isPillar ? Number.isFinite(dia) && dia > 0 : Number.isFinite(l) && l > 0 && Number.isFinite(w) && w > 0;
  if (!planOk && !(Number.isFinite(d) && d > 0)) return null;
  const fti = (v) => `${Math.floor(v / 12)}' ${Math.round(v % 12)}"`;
  return (
    <svg viewBox="0 0 180 110" className="w-full h-24 rounded-sm bg-gray-50 border border-gray-100" aria-hidden="true">
      {/* plan view, left half */}
      <text x="45" y="10" textAnchor="middle" fontSize="7" fill="#9ca3af">plan</text>
      {isPillar
        ? planOk && <circle cx="45" cy="52" r={Math.min(30, Math.max(14, dia / 4))} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 2" />
        : planOk && <rect x={45 - Math.min(32, Math.max(16, l / 4)) / 2} y={52 - Math.min(22, Math.max(12, w / 4)) / 2} width={Math.min(32, Math.max(16, l / 4))} height={Math.min(22, Math.max(12, w / 4))} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 2" />}
      {planOk && <DiagramDim x="45" y="52" label="" value={isPillar ? `Ø ${fti(dia)}` : `${fti(l)} × ${fti(w)}`} />}
      {/* section view, right half */}
      <text x="128" y="10" textAnchor="middle" fontSize="7" fill="#9ca3af">section</text>
      <line x1="88" y1={52 - off / 8} x2="168" y2={52 - off / 8} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 2" />
      <text x="166" y={50 - off / 8} textAnchor="end" fontSize="6.5" fill="#94a3b8">grade</text>
      {Number.isFinite(d) && d > 0 && (
        <>
          <rect x="103" y={52 - off / 8} width="50" height={Math.min(44, Math.max(14, d / 3))} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="98" y1={52 - off / 8} x2="98" y2={52 - off / 8 + Math.min(44, Math.max(14, d / 3))} stroke="#6b7280" strokeWidth="1" />
          <DiagramDim x="128" y={52 - off / 8 + Math.min(44, Math.max(14, d / 3)) / 2 + 3} label="" value={`D ${fti(d)}`} />
        </>
      )}
      {off !== 0 && <DiagramDim x="128" y="98" label="offset" value={`${off > 0 ? "+" : ""}${off}"`} />}
    </svg>
  );
};

const Check = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
    <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

const Picker = ({ label, value, onChange, options, placeholder }) => {
  const rows = Array.isArray(options) ? options : [];
  const missing = value && !rows.some((o) => o.id === value);
  // O-008 tail (CMP-A08): supplier-grouped options via the boundary's
  // canonical grouping — same convention InventoryTable renders. When no row
  // records a supplier the picker stays flat (a lone "not recorded" group is
  // noise, not signal); unassigned rows sort last, never merged.
  const groups = groupInventoryBySupplier(rows);
  const grouped = groups.some((g) => g.key !== null);
  return (
    <label className="text-xs text-gray-500">
      {label}
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
      >
        <option value="">{placeholder}</option>
        {missing && (
          <option value={value} disabled>
            Catalog item unavailable ({value})
          </option>
        )}
        {grouped
          ? groups.map((group) => (
              <optgroup key={group.key ?? "__unassigned__"} label={`Supplier: ${group.label || "— not recorded"}`}>
                {group.rows.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.material_name}
                  </option>
                ))}
              </optgroup>
            ))
          : rows.map((o) => (
              <option key={o.id} value={o.id}>
                {o.material_name}
              </option>
            ))}
      </select>
    </label>
  );
};

export default function FoundationItemCard({ item, index, catalog, onChange, onRemove, onDuplicate, pricing }) {
  // O-115 (CMP-I14) -- the item's documented feasible-dims domain
  // (spread_foot depth / wall height minimum), rendered as an advisory.
  const feasible = suggestFeasibleFoundationDims(item);
  const set = (patch) => onChange(index, patch);
  const numSet = (key) => (e) => set({ [key]: parseFloat(e.target.value) || 0 });
  // Blank clears the override (null); a malformed draft is preserved verbatim so
  // the item validation reports it instead of a NaN leaking into saved costs.
  // Delegates to the boundary's catalog draft (CMP-A08) â€” identical contract,
  // plus whitespace-only drafts clear to null instead of minting Number(" ")=0.
  const nullSet = (key) => (e) => set({ [key]: inventoryNumberInput(e.target.value) });
  const isPillar = item.foundation_type === "pillar";
  // Versioned items price steel from the accepted reinforcement design â€” the
  // legacy implicit fields below do not apply to them and stay hidden.
  const legacyReinforcement = item.reinforcement_calculation_version == null || item.reinforcement_calculation_version === 1;
  const unavailable = pricing?.available === false;
  const concreteRow = (catalog.concrete || []).find((c) => c.id === item.selected_concrete_id);
  const overrideLabel = !concreteRow
    ? "Concrete cost override (unknown unit)"
    : concreteRow.material_type === "bagged_concrete"
      ? "Concrete $/bag override"
      : "Concrete $/CY override";

  return (
    <div className="bg-white rounded-sm border border-gray-200 border-l-4 border-l-amber-500 p-4">
      {unavailable && (
        <div className="mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1" id={`foundation-${index}-pricing`}>
          <p className="text-[11px] font-semibold text-amber-800">Saved amounts (not current pricing)</p>
          <p className="text-[10px] text-amber-700">Saved quantities may not reflect the current design.</p>
          {(pricing.issues || []).map((i, k) => (
            <p key={k} className="text-[10px] text-amber-700">{i.message}</p>
          ))}
        </div>
      )}
      {/* O-115 (CMP-I14) -- feasible-dims advisory: the item's documented
          feasible-dims domain (spread_foot depth / wall height minimum) --
          a named governing check vs a blind "bigger than current" multiplier. */}
      {feasible?.available && (
        <p className="mb-2 text-[10px] text-sky-700" title={feasible.governing}>
          Feasible dims: {feasible.depth_inches != null ? `depth >= ${feasible.depth_inches}"` : feasible.height_inches != null ? `height >= ${feasible.height_inches}"` : ""} ({feasible.governing})
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-amber-500" aria-hidden="true" />
          <span className="text-[12px] font-bold text-gray-700">Foundation #{index + 1}</span>
          {item.component_id && (
            <span className="ml-1.5 text-[10px] text-gray-500 font-mono" title={`Scene node id: ${item.component_id}`}>({item.component_id})</span>
          )}
          <select
            value={item.foundation_type || ""}
            onChange={(e) => set({ foundation_type: e.target.value })}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm font-semibold"
          >
            {item.foundation_type !== "spread_foot" && item.foundation_type !== "pillar" && (
              <option value={item.foundation_type || ""} disabled>
                {item.foundation_type ? `Unsupported type: ${item.foundation_type}` : "Choose foundation type"}
              </option>
            )}
            <option value="spread_foot">Spread Footing</option>
            <option value="pillar">Pillar / Caisson</option>
          </select>
        </div>
        <div className="text-right">
          <div className="font-bold text-gray-900">{amt(item.item_total_cost)}</div>
          <div className="text-[11px] text-gray-500">
            {num2(item.concrete_volume_cy)} CY concrete
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onDuplicate && (
            <button type="button" onClick={() => onDuplicate(index)} className="text-gray-500 hover:text-blue-600" title="Duplicate">
              <Copy className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          <button type="button"
            onClick={() => {
              if (!window.confirm(`Remove Foundation #${index + 1}?`)) return;
              onRemove(index);
            }}
            className="text-gray-500 hover:text-red-600"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <Field
        label="Description"
        value={item.description || ""}
        onChange={(e) => set({ description: e.target.value })}
      />

      {/* Dimensions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <Field label="Quantity" type="number" value={item.quantity ?? 1} onChange={numSet("quantity")} />
        {isPillar ? (
          <DimField field="diameter" value={item.diameter} onCommit={(v) => set({ diameter: v })} />
        ) : (
          <>
            <DimField field="length_inches" value={item.length_inches} onCommit={(v) => set({ length_inches: v })} />
            <DimField field="width_inches" value={item.width_inches} onCommit={(v) => set({ width_inches: v })} />
          </>
        )}
        <DimField field="depth_inches" value={item.depth_inches} onCommit={(v) => set({ depth_inches: v })} />
        <DimField field="grade_offset_inches" value={item.grade_offset_inches} onCommit={(v) => set({ grade_offset_inches: v })} />
        <div className="col-span-2 sm:col-span-4">
          <DimensionDiagram item={item} />
        </div>
        <Field
          label="Rotation (Â°)"
          type="number"
          value={item.rotation_degrees ?? 0}
          onChange={numSet("rotation_degrees")}
        />
      </div>

      {/* Concrete + excavation */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
        <Picker
          label="Concrete"
          value={item.selected_concrete_id}
          onChange={(v) => set({ selected_concrete_id: v })}
          options={catalog.concrete}
          placeholder="Use project rate"
        />
        <label className="text-xs text-gray-500">
          Excavation method
          <select
            value={item.excavation_method || ""}
            onChange={(e) => set({ excavation_method: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
          >
            <option value="">Project default</option>
            <option value="hand_dig">Hand dig</option>
            <option value="equipment_excavation">Equipment</option>
          </select>
        </label>
        <Picker
          label="Forming material"
          value={item.selected_forming_id}
          onChange={(v) => set({ selected_forming_id: v })}
          options={catalog.forming || []}
          placeholder="None"
        />
        <Field
          label={overrideLabel}
          type="number"
          step="any"
          min="0"
          value={item.custom_concrete_cost_per_cy ?? ""}
          onChange={nullSet("custom_concrete_cost_per_cy")}
          aria-label={overrideLabel}
          aria-invalid={pricing?.issues?.some((i) => i.field === "custom_concrete_cost_per_cy") || undefined}
          aria-describedby={pricing?.issues?.some((i) => i.field === "custom_concrete_cost_per_cy") ? `foundation-${index}-pricing` : undefined}
        />
        {item.custom_concrete_cost_per_cy !== null && item.custom_concrete_cost_per_cy !== undefined && (
          <button
            type="button"
            className="text-[10px] text-amber-700 hover:underline self-end"
            onClick={() => set({ custom_concrete_cost_per_cy: null })}
          >
            Clear override
          </button>
        )}
      </div>

      {/* Options */}
      <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-100">
        <Check label="Rebar" checked={item.include_rebar} onChange={(v) => set({ include_rebar: v })} />
        <Check label="Forming" checked={item.include_forming} onChange={(v) => set({ include_forming: v })} />
        <Check label="Finishing" checked={item.include_finishing} onChange={(v) => set({ include_finishing: v })} />
        <Check
          label="This is a new sign location"
          checked={item.is_new_sign_location}
          onChange={(v) => set({ is_new_sign_location: v })}
        />
      </div>

      {item.include_rebar && legacyReinforcement && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {isPillar ? (
            <>
              <Field
                label="Rebar size"
                value={item.pillar_rebar_size || "#4"}
                onChange={(e) => set({ pillar_rebar_size: e.target.value })}
              />
              <Field
                label="Hoop dia (in)"
                type="number"
                value={item.pillar_rebar_hoop_diameter ?? 0}
                onChange={numSet("pillar_rebar_hoop_diameter")}
              />
              <Field
                label="Hoops (layers)"
                type="number"
                value={item.pillar_rebar_layers ?? 1}
                onChange={numSet("pillar_rebar_layers")}
              />
              <Field
                label="Vertical bars"
                type="number"
                value={item.pillar_vertical_rebar_count ?? 4}
                onChange={numSet("pillar_vertical_rebar_count")}
              />
            </>
          ) : (
            <>
              <Field
                label="Rebar size"
                value={item.rebar_size ?? ""}
                onChange={(e) => set({ rebar_size: e.target.value })}
              />
              <Field
                label="Spacing length (in)"
                type="number"
                value={item.rebar_spacing_length ?? 12}
                onChange={numSet("rebar_spacing_length")}
              />
              <Field
                label="Spacing width (in)"
                type="number"
                value={item.rebar_spacing_width ?? 12}
                onChange={numSet("rebar_spacing_width")}
              />
              <Field label="Layers" type="number" value={item.rebar_layers ?? 1} onChange={numSet("rebar_layers")} />
            </>
          )}
          {/* O-111 (CMP-I10) -- support-basis field: `support_class` records the
              support type (chair/bolster/stand class) the reinforcement rides
              on -- the register's support taxonomy names the classes; blank =
              "not recorded" (never an invented support). */}
          <Field
            label="Support class"
            value={item.support_class ?? ""}
            onChange={(e) => set({ support_class: e.target.value === "" ? undefined : e.target.value })}
            placeholder="chair / bolster / dobie"
          />
          <div className="col-span-2 sm:col-span-4 text-xs text-gray-500">
            {Number.isFinite(item.rebar_feet) ? item.rebar_feet.toFixed(1) : "Not saved"} ft Â·{" "}
            {Number.isFinite(item.rebar_weight_lbs) ? item.rebar_weight_lbs.toFixed(0) : "Not saved"} lbs Â·{" "}
            {amt(item.rebar_cost)}
          </div>
        </div>
      )}

      {!legacyReinforcement && (
        <p className="mt-3 rounded-sm border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
          {item.reinforcement_calculation_version === 2 ? (
            <>Version 2 reinforcement uses the accepted design. Edit geometry and pricing through the controlled proposal below.{" "}
              <span className="font-semibold text-gray-800">Physical {num2(item.rebar_geometry_feet)} ft / priced {num2(item.rebar_feet)} ft - {amt(item.rebar_cost)}</span>
              {Number.isFinite(item.support_count) && item.support_count > 0 && (
                <> Â· Supports: {item.support_count} required{Number.isFinite(item.support_purchased_units) && item.support_purchased_units !== item.support_count ? ` / ${item.support_purchased_units} purchased` : ""} - {amt(item.support_cost)}</>
              )}</>
          ) : (
            <>Unsupported reinforcement version. Reload before changing reinforcement pricing.</>
          )}
        </p>
      )}

      {/* Excavation summary */}
      <div className="mt-3 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Excavation</div>
        <div className="text-[11px] text-amber-900">
          Volume: ~{Number.isFinite(item.excavation_volume_cy) ? item.excavation_volume_cy.toFixed(2) : "Not saved"} CY Â· Cost: {amt(item.excavation_cost)}
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="mt-3 rounded-sm border border-gray-200 bg-slate-50 p-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[
            ["Rebar", item.rebar_cost],
            ["Forming", item.forming_cost],
            ["Pouring", item.pouring_cost],
            ["Finishing", item.finishing_cost],
            ["Excavation", item.excavation_cost],
          ].map(([label, value]) => (
            <div key={label} className="px-1">
              <div className="text-gray-500">{label}</div>
              <div className="font-semibold text-gray-800">{amt(value)}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-center text-[11px] italic text-amber-700">
          Concrete material &amp; truck costs are aggregated for the entire project.
        </div>
      </div>
    </div>
  );
}