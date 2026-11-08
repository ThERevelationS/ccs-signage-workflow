import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { money, calcSignageCabinetPricing } from "./foundationCalc";
import { FoundationDimensionInput } from "./foundationFtInEntry";
import { foundationDimensionFieldMeta } from "./foundationGeometryInputs";

// O-093 (CMP-H02): cabinet dimensions take feet/inches entry through the
// shared dimension field — same verbatim-draft contract as the panel's
// cabinetInputValue (blank stays, malformed stores verbatim for diagnostics),
// canonical inches stored, plain-language label + help + suggested-format
// placeholder from the field meta map (never stored defaults). Quantity and
// unit cost are counts/currency, not dimensions — they keep the numeric path.
const cabDimMeta = (field) => foundationDimensionFieldMeta("cabinet", field);

const blankCabinet = (mount, index, canonId) => ({
  id: `cab_${Date.now()}`,
  description: "",
  mount,
  foundation_index: mount === "foundation" ? index : undefined,
  foundation_component_id: mount === "foundation" ? canonId || "" : "",
  pole_index: mount === "pole" ? index : undefined,
  pole_component_id: mount === "pole" ? canonId || "" : "",
  width_inches: 48,
  height_inches: 24,
  depth_inches: 8,
  mount_height_inches: 0,
  quantity: 1,
  unit_cost: 0,
});

// Blank-preserving draft coercion (same rule as the wall/pole/equipment
// panels): a blank draft stays blank, a numeric draft becomes a number, and a
// malformed draft is stored verbatim so the pricing diagnostics can flag it —
// never coerced to 0 by parseFloat || 0.
const cabinetInputValue = (value) =>
  value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : value;

const Field = ({ label, ...props }) => (
  <label className="text-[10px] text-gray-500">
    {label}
    <Input {...props} className="h-8 text-[12px]" />
  </label>
);

function CabinetRow({ cabinet, detail, diagId, onChange, onRemove }) {
  const issues = detail?.issues || [];
  const broken = issues.length > 0;
  const fieldIssue = (field) => issues.some((i) => i.field === field);
  const describedBy = (field) => (fieldIssue(field) ? diagId : undefined);
  const num = (key) => (e) => onChange({ [key]: cabinetInputValue(e.target.value) });
  const lineTotal = broken || !Number.isFinite(detail?.cost) ? "Not saved" : money(detail.cost);
  return (
    <div className={`rounded-sm border bg-white p-2 ${broken ? "border-amber-300" : "border-gray-200"}`}>
      <div className="flex items-center gap-2 mb-2">
        <Input
          value={cabinet.description || ""}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Cabinet description"
          className="h-8 text-[12px]"
        />
        <span className={`text-[12px] font-bold whitespace-nowrap ${broken ? "text-amber-700" : "text-gray-800"}`}>
          {lineTotal}
        </span>
        <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-600" title="Remove">
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      {broken && (
        <ul role="status" id={diagId} className="list-disc pl-5 mb-2 text-[10px] text-amber-800">
          {issues.map((i, k) => <li key={k}>{i.message}</li>)}
        </ul>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <FoundationDimensionInput
          {...cabDimMeta("width_inches")}
          value={cabinet.width_inches ?? 0}
          onCommit={(v) => onChange({ width_inches: v })}
          invalid={fieldIssue("width_inches") || undefined}
          describedBy={describedBy("width_inches")}
          labelClassName="text-[10px] text-gray-500"
          inputClassName="h-8 text-[12px]"
        />
        <FoundationDimensionInput
          {...cabDimMeta("height_inches")}
          value={cabinet.height_inches ?? 0}
          onCommit={(v) => onChange({ height_inches: v })}
          invalid={fieldIssue("height_inches") || undefined}
          describedBy={describedBy("height_inches")}
          labelClassName="text-[10px] text-gray-500"
          inputClassName="h-8 text-[12px]"
        />
        <FoundationDimensionInput
          {...cabDimMeta("depth_inches")}
          value={cabinet.depth_inches ?? 0}
          onCommit={(v) => onChange({ depth_inches: v })}
          invalid={fieldIssue("depth_inches") || undefined}
          describedBy={describedBy("depth_inches")}
          labelClassName="text-[10px] text-gray-500"
          inputClassName="h-8 text-[12px]"
        />
        <FoundationDimensionInput
          {...cabDimMeta("mount_height_inches")}
          value={cabinet.mount_height_inches ?? 0}
          onCommit={(v) => onChange({ mount_height_inches: v })}
          invalid={fieldIssue("mount_height_inches") || undefined}
          describedBy={describedBy("mount_height_inches")}
          labelClassName="text-[10px] text-gray-500"
          inputClassName="h-8 text-[12px]"
        />
        <Field
          label="Qty"
          type="number"
          min={0}
          step="any"
          placeholder="1"
          data-cabinet-field="quantity"
          value={cabinet.quantity ?? ""}
          aria-invalid={fieldIssue("quantity") || undefined}
          aria-describedby={describedBy("quantity")}
          onChange={num("quantity")}
        />
        <Field
          label="Unit cost"
          type="number"
          min={0}
          step="any"
          placeholder="0"
          data-cabinet-field="unit_cost"
          value={cabinet.unit_cost ?? ""}
          aria-invalid={fieldIssue("unit_cost") || undefined}
          aria-describedby={describedBy("unit_cost")}
          onChange={num("unit_cost")}
        />
      </div>
    </div>
  );
}

export default function SignageCabinetsPanel({ cabinets = [], items = [], poles = [], onChange }) {
  const pricingRows = calcSignageCabinetPricing(cabinets);
  const hasIssues = pricingRows.some((row) => row.issues.length > 0);
  const update = (idx, changes) =>
    onChange(cabinets.map((c, i) => (i === idx ? { ...c, ...changes } : c)));
  const remove = (idx) => {
    if (!window.confirm("Remove this cabinet?")) return;
    onChange(cabinets.filter((_, i) => i !== idx));
  };
  const add = (mount, index) => {
    const parent = mount === "foundation" ? items[index] : poles[index];
    onChange([...cabinets, blankCabinet(mount, index, parent?.component_id)]);
  };

  const canonParentId = (c) => (c.mount === "pole" ? c.pole_component_id : c.foundation_component_id);
  const hasCanonProp = (c) => (c.mount === "pole" ? Object.prototype.hasOwnProperty.call(c, "pole_component_id") : Object.prototype.hasOwnProperty.call(c, "foundation_component_id"));

  const group = (mount, index) =>
    cabinets
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => {
        if (c.mount !== mount) return false;
        const parent = mount === "foundation" ? items[index] : poles[index];
        const canon = canonParentId(c);
        if (hasCanonProp(c)) return canon !== "" && canon === parent?.component_id;
        return mount === "foundation" ? c.foundation_index === index : c.pole_index === index;
      });

  const orphans = cabinets
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => {
      if (c.mount !== "pole" && c.mount !== "foundation") return true;
      const canon = canonParentId(c);
      const pool = c.mount === "pole" ? poles : items;
      if (hasCanonProp(c)) {
        if (canon === "") return true;
        return !pool.some((p) => p?.component_id === canon);
      }
      const legacy = c.mount === "pole" ? c.pole_index : c.foundation_index;
      const resolved = typeof legacy === "number" && Number.isInteger(legacy) && legacy >= 0 && pool[legacy] !== undefined;
      return !resolved;
    });

  const reassign = (i, mount, canonId) => {
    const pool = mount === "pole" ? poles : items;
    const index = pool.findIndex((p) => p?.component_id === canonId);
    if (mount === "pole") update(i, { mount: "pole", pole_component_id: canonId, pole_index: canonId === "" || index < 0 ? undefined : index, foundation_component_id: "", foundation_index: undefined });
    else update(i, { mount: "foundation", foundation_component_id: canonId, foundation_index: canonId === "" || index < 0 ? undefined : index, pole_component_id: "", pole_index: undefined });
  };

  return (
    <div className="space-y-4">
      {hasIssues && (
        <p className="rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
          Cabinet pricing unavailable — fix highlighted inputs. Saved amounts only; the current total is not repriced.
        </p>
      )}
      <div className="bg-white rounded-sm border border-gray-200 p-3">
        <h3 className="text-[13px] font-bold text-gray-900">Signage Cabinets</h3>
        <p className="text-[11px] text-gray-400 mb-2">
          Add cabinets directly on a foundation or mount them on a placed pole.
        </p>

        {items.length === 0 ? (
          <p className="text-[11px] italic text-gray-400">Add a foundation first to mount cabinets on it.</p>
        ) : (
          items.map((item, index) => {
            const rows = group("foundation", index);
            return (
              <div key={index} className="border border-gray-200 rounded-sm p-2 mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-semibold text-gray-700">
                    Foundation {index + 1}
                    {item.description ? ` — ${item.description}` : ""}
                  </span>
                  <button type="button"
                    onClick={() => add("foundation", index)}
                    className="h-[26px] px-2 flex items-center gap-1 rounded-sm border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" /> Add Cabinet
                  </button>
                </div>
                {rows.length === 0 ? (
                  <p className="text-[11px] text-gray-400">No cabinets on this foundation.</p>
                ) : (
                  <div className="space-y-2">
                    {rows.map(({ c, i }) => (
                      <CabinetRow
                        key={c.component_id || c.id || i}
                        cabinet={c}
                        detail={pricingRows[i]}
                        diagId={`signage-cabinet-${i}-pricing`}
                        onChange={(changes) => update(i, changes)}
                        onRemove={() => remove(i)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="bg-white rounded-sm border border-gray-200 p-3">
        <h3 className="text-[13px] font-bold text-gray-900">Signage Cabinets on Poles</h3>
        <p className="text-[11px] text-gray-400 mb-2">
          Add cabinets to placed poles. Place poles in the "Walls &amp; Poles" tab.
        </p>
        {poles.length === 0 ? (
          <p className="text-[11px] italic text-gray-400">
            No poles placed. To mount cabinets on a pole, add poles in the "Walls &amp; Poles" tab. (Or skip this and
            use foundation-mounted cabinets above.)
          </p>
        ) : (
          poles.map((pole, index) => {
            const rows = group("pole", index);
            return (
              <div key={index} className="border border-gray-200 rounded-sm p-2 mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-semibold text-gray-700">Pole {index + 1}</span>
                  <button type="button"
                    onClick={() => add("pole", index)}
                    className="h-[26px] px-2 flex items-center gap-1 rounded-sm border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" /> Add Cabinet
                  </button>
                </div>
                {rows.length === 0 ? (
                  <p className="text-[11px] text-gray-400">No cabinets on this pole.</p>
                ) : (
                  <div className="space-y-2">
                    {rows.map(({ c, i }) => (
                      <CabinetRow
                        key={c.component_id || c.id || i}
                        cabinet={c}
                        detail={pricingRows[i]}
                        diagId={`signage-cabinet-${i}-pricing`}
                        onChange={(changes) => update(i, changes)}
                        onRemove={() => remove(i)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {orphans.length > 0 && (
          <div data-orphan="true" className="border border-amber-300 bg-amber-50 rounded-sm p-2 mt-2">
            <span className="text-[12px] font-semibold text-amber-800">Unassigned cabinets</span>
            <div className="space-y-2 mt-2">
              {orphans.map(({ c, i }) => (
                <div key={c.component_id || c.id || i}>
                  <CabinetRow
                    cabinet={c}
                    detail={pricingRows[i]}
                    diagId={`signage-cabinet-${i}-pricing`}
                    onChange={(changes) => update(i, changes)}
                    onRemove={() => remove(i)}
                  />
                  <label className="block text-[10px] text-amber-800 mt-1">
                    Reassign
                    <select
                      className="ml-2 h-7 rounded-sm border border-amber-300 bg-white px-1 text-[11px]"
                      value=""
                      aria-label="Reassign cabinet"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") return;
                        if (v.startsWith("pole:")) reassign(i, "pole", v.slice(5));
                        else if (v.startsWith("foundation:")) reassign(i, "foundation", v.slice(11));
                      }}
                    >
                      <option value="">Select parent…</option>
                      {items.map((it, ix) => (
                        <option key={it.component_id || ix} value={`foundation:${it.component_id}`}>{it.description || `Foundation ${ix + 1}`}</option>
                      ))}
                      {poles.map((po, ix) => (
                        <option key={po.component_id || ix} value={`pole:${po.component_id}`}>{po.description || `Pole ${ix + 1}`}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
