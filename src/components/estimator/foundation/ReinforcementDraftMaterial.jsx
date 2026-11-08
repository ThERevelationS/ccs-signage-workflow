import ReinforcementDraftField from "./ReinforcementDraftField";

const asObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const metaVal = (v) => (typeof v === "string" && v.trim()) || (typeof v === "number" && Number.isFinite(v)) ? v : "Unknown";

export default function ReinforcementDraftMaterial({ draft, catalog = [], disabled, onChange }) {
  const material = asObj(draft?.material) ?? {};
  const overrides = asObj(draft?.overrides) ?? {};
  const isManual = material.kind === "manual";
  const catalogRows = Array.isArray(catalog) ? catalog.filter(c => c && typeof c === "object" && typeof c.id === "string") : [];
  const matches = catalogRows.filter(c => c.id === material.inventory_id);
  const row = matches.length === 1 ? matches[0] : null;
  const meta = (k) => metaVal(row?.[k]);

  const setMaterial = (p) => onChange({ material: { ...material, ...p } });
  const setOverride = (k, v) => onChange({ overrides: { ...overrides, [k]: v === "" ? null : v } });

  const malformed = ["material", "overrides"].filter(key => draft?.[key] !== undefined && !asObj(draft[key]));
  if (malformed.length) return (
    <div className="space-y-2">
      {malformed.map(key => (
        <div key={key} className="rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800">
          {key} draft malformed.{" "}
          <button type="button" disabled={disabled} onClick={() => onChange({
            [key]: key === "material" ? { kind: "" } : { quantity_ft: null, cost_per_ft: null },
          })} className="underline">Replace {key}</button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-3 min-w-0 max-w-full">
      <div>
        <span className="text-[12px] text-gray-600">Material basis</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {["manual", "catalog"].map(k => (
            <button key={k} type="button" disabled={disabled}
              onClick={() => setMaterial(k === "manual"
                ? { kind: "manual", ...(Object.hasOwn(material, "unit") ? {} : { unit: "ft" }) }
                : { kind: "catalog" })}
              className={`rounded-sm border px-2 py-1 text-[12px] ${material.kind === k ? "border-amber-500 bg-amber-50 text-amber-800" : "border-gray-300 text-gray-600"} disabled:text-gray-300`}>
              {k === "manual" ? "Manual" : "Catalog"}
            </button>
          ))}
        </div>
      </div>

      {material.kind === "catalog" && (
        <div>
          <label className="block min-w-0">
            <span className="text-[12px] text-gray-600">Rebar item</span>
            <select aria-label="Rebar item" value={typeof material.inventory_id === "string" ? material.inventory_id : ""} disabled={disabled} onChange={(e) => setMaterial({ inventory_id: e.target.value })} className="mt-0.5 block w-full max-w-full rounded-sm border border-gray-300 px-1.5 py-1 text-[13px] disabled:bg-gray-50">
              <option value="">Choose rebar</option>
              {material.inventory_id !== undefined && material.inventory_id !== null && typeof material.inventory_id !== "string" && <option value="" disabled>Invalid selection</option>}
              {typeof material.inventory_id === "string" && material.inventory_id && !row && <option value={material.inventory_id} disabled>Unavailable: {material.inventory_id}</option>}
              {catalogRows.map((c, index) => <option key={`${c.id}:${index}`} value={c.id}>{typeof c.material_name === "string" ? c.material_name : c.id}</option>)}
            </select>
          </label>
          {!Array.isArray(catalog) && <p className="text-[11px] text-amber-700">Catalog could not be read; no replacement metadata is inferred.</p>}
          {matches.length > 1 && <p className="text-[11px] text-red-700">Duplicate inventory ID; refresh the catalog before pricing.</p>}
          {row && (
            <div className="mt-1 break-words rounded-sm border border-gray-100 bg-gray-50 px-2 py-1 text-[11px] text-gray-500">
              diameter {meta("rebar_diameter_inches")} - weight {meta("rebar_weight_lb_per_ft")} - {meta("cost_per_unit")}/{meta("unit")}
            </div>
          )}
        </div>
      )}

      {isManual && (
        <div className="grid grid-cols-2 gap-2">
          <ReinforcementDraftField label="Name" value={material.name} inputMode="text" disabled={disabled} onChange={(v) => setMaterial({ name: v })} />
          <ReinforcementDraftField label="Reason" value={material.reason} inputMode="text" maxLength={1000} disabled={disabled} onChange={(v) => setMaterial({ reason: v })} />
          <ReinforcementDraftField label="Nominal diameter (in)" value={material.bar_diameter_inches} disabled={disabled} onChange={(v) => setMaterial({ bar_diameter_inches: v })} />
          <ReinforcementDraftField label="Weight (lb/ft)" value={material.weight_lb_per_ft} disabled={disabled} onChange={(v) => setMaterial({ weight_lb_per_ft: v })} />
          <ReinforcementDraftField label="Cost /ft" value={material.cost_per_ft} disabled={disabled} onChange={(v) => setMaterial({ cost_per_ft: v })} />
          <ReinforcementDraftField label="Unit" value={material.unit} inputMode="text" disabled={disabled} onChange={(v) => setMaterial({ unit: v })} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <ReinforcementDraftField label="Quantity override (ft)" value={overrides.quantity_ft ?? ""} placeholder="blank = no override" disabled={disabled} onChange={(v) => setOverride("quantity_ft", v)} />
        <ReinforcementDraftField label="Cost override ($/ft)" value={overrides.cost_per_ft ?? ""} placeholder="blank = no override" disabled={disabled} onChange={(v) => setOverride("cost_per_ft", v)} />
      </div>
    </div>
  );
}
