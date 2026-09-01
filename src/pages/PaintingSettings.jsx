import { useEffect, useMemo, useState } from "react";
import { Settings as SettingsEntity } from "@/entities/all";
import { Link } from "react-router-dom";
import { ArrowLeft, Beaker, Clock, DollarSign, Paintbrush, Plus, Save, Scissors, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { liquidPaintRatePerSqft } from "@/components/estimator/paint/paintCalc";

const PAINT_CATEGORIES = new Set(["painting_pricing", "painting_labor", "painting_supplies"]);
const UNIT_OPTIONS = ["oz", "pint", "quart", "liter", "gallon"];

const GROUPS = [
  {
    key: "rates",
    title: "Rates & Minimums",
    icon: DollarSign,
    names: ["default_labor_rate", "min_labor_hours", "min_paint_cost", "base_supplies_per_job", "default_paint_supplies_per_sqft"],
  },
  {
    key: "mix",
    title: "Paint Mix & Coverage",
    icon: Beaker,
    names: ["paint_cost_per_unit", "paint_unit", "hardener_cost_per_unit", "hardener_unit", "reducer_cost_per_unit", "reducer_unit", "paint_mix_ratio", "hardener_mix_ratio", "reducer_mix_ratio", "mixed_paint_coverage_sqft_per_gallon", "paint_waste_multiplier", "fixed_paint_waste_gallons"],
  },
  {
    key: "mask",
    title: "Paint Mask",
    icon: Scissors,
    names: ["paint_mask_rate_per_sqft", "paint_mask_machine_cutting_rate_per_sqft", "paint_mask_cutting_labor_rate_per_sqft", "paint_mask_application_labor_rate_per_sqft"],
  },
  {
    key: "labor",
    title: "Labor & Complexity",
    icon: Clock,
    names: [
      "base_labor_hours_prep_per_sqft", "base_labor_hours_paint_per_sqft", "base_labor_hours_per_sqft",
      "setup_time_labor_hours", "paint_mixing_labor_hours", "color_change_setup_hours", "paint_gun_cleaning_hours",
      "one_side_paint_multiplier", "both_sides_paint_multiplier", "additional_color_multiplier",
      "simple_complexity_multiplier", "moderate_complexity_multiplier", "complex_complexity_multiplier", "letter_perimeter_factor",
      "lettering_extra_small_prep_multiplier", "lettering_small_prep_multiplier", "lettering_normal_prep_multiplier",
      "lettering_medium_prep_multiplier", "lettering_large_prep_multiplier", "lettering_extra_large_prep_multiplier",
    ],
  },
];

const TIER_SETTINGS = [
  { key: "panel_labor_tiers", label: "Panel quantity tiers" },
  { key: "complex_shapes_labor_tiers", label: "Complex-shape quantity tiers" },
  { key: "lettering_labor_tiers", label: "Lettering quantity tiers" },
];

const parseJsonArray = (value) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const settingLabel = (row) => row?.description || String(row?.setting_name || "").replaceAll("_", " ");

export default function PaintingSettings() {
  const [rows, setRows] = useState([]);
  const [values, setValues] = useState({});
  const [originalValues, setOriginalValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const all = await SettingsEntity.list();
        const paintRows = (all || []).filter((row) => PAINT_CATEGORIES.has(row.category));
        const map = Object.fromEntries(paintRows.map((row) => [row.setting_name, row.setting_value ?? ""]));
        setRows(paintRows);
        setValues(map);
        setOriginalValues(map);
      } catch (e) {
        setError(e.message || "Could not load Painting settings.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const rowByName = useMemo(() => Object.fromEntries(rows.map((row) => [row.setting_name, row])), [rows]);
  const patch = (name, value) => setValues((prev) => ({ ...prev, [name]: String(value) }));

  useEffect(() => {
    if (loading) return;
    const prep = parseFloat(values.base_labor_hours_prep_per_sqft) || 0;
    const paint = parseFloat(values.base_labor_hours_paint_per_sqft) || 0;
    const combined = (prep + paint).toFixed(4);
    if (rowByName.base_labor_hours_per_sqft && values.base_labor_hours_per_sqft !== combined) {
      setValues((prev) => ({ ...prev, base_labor_hours_per_sqft: combined }));
    }
  }, [loading, rowByName.base_labor_hours_per_sqft, values.base_labor_hours_prep_per_sqft, values.base_labor_hours_paint_per_sqft]);

  const consumables = useMemo(() => parseJsonArray(values.paint_consumables_inventory), [values.paint_consumables_inventory]);
  const consumablesTotals = useMemo(() => consumables.reduce((acc, item) => {
    const total = (Number(item.cost) || 0) * (Number(item.qty) || 0);
    if (item.per_sqft) acc.perSqft += total;
    else acc.flat += total;
    return acc;
  }, { flat: 0, perSqft: 0 }), [consumables]);

  useEffect(() => {
    if (loading || !rowByName.paint_consumables_inventory) return;
    setValues((prev) => {
      const next = { ...prev };
      if (rowByName.base_supplies_per_job) next.base_supplies_per_job = consumablesTotals.flat.toFixed(2);
      if (rowByName.default_paint_supplies_per_sqft) next.default_paint_supplies_per_sqft = consumablesTotals.perSqft.toFixed(2);
      return next;
    });
  }, [loading, rowByName.paint_consumables_inventory, rowByName.base_supplies_per_job, rowByName.default_paint_supplies_per_sqft, consumablesTotals.flat, consumablesTotals.perSqft]);

  const liquidRate = useMemo(() => liquidPaintRatePerSqft(values), [values]);
  const coverage = Number(values.mixed_paint_coverage_sqft_per_gallon || 0);
  const mixedGallonCost = liquidRate * coverage;
  const dirtyCount = rows.filter((row) => String(values[row.setting_name] ?? "") !== String(originalValues[row.setting_name] ?? "")).length;

  const updateTier = (settingName, tierIndex, field, value) => {
    const tiers = parseJsonArray(values[settingName]);
    tiers[tierIndex] = { ...tiers[tierIndex], [field]: Number(value) };
    patch(settingName, JSON.stringify(tiers));
  };
  const addTier = (settingName) => {
    const tiers = parseJsonArray(values[settingName]);
    const previous = tiers[tiers.length - 1];
    const min = previous ? Number(previous.max_quantity || 0) + 1 : 1;
    patch(settingName, JSON.stringify([...tiers, { min_quantity: min, max_quantity: min + 9, labor_multiplier: 1 }]));
  };
  const removeTier = (settingName, index) => {
    const tiers = parseJsonArray(values[settingName]).filter((_, i) => i !== index);
    patch(settingName, JSON.stringify(tiers));
  };

  const updateConsumable = (index, field, value) => {
    const items = [...consumables];
    items[index] = { ...items[index], [field]: field === "name" || field === "per_sqft" ? value : Number(value) };
    patch("paint_consumables_inventory", JSON.stringify(items));
  };
  const addConsumable = () => patch("paint_consumables_inventory", JSON.stringify([...consumables, { name: "New Consumable", cost: 0, qty: 1 }]));
  const removeConsumable = (index) => patch("paint_consumables_inventory", JSON.stringify(consumables.filter((_, i) => i !== index)));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const changed = rows.filter((row) => String(values[row.setting_name] ?? "") !== String(originalValues[row.setting_name] ?? ""));
      await Promise.all(changed.map((row) => SettingsEntity.update(row.id, { setting_value: String(values[row.setting_name] ?? "") })));
      const snapshot = Object.fromEntries(rows.map((row) => [row.setting_name, String(values[row.setting_name] ?? "")]));
      setOriginalValues(snapshot);
      setMessage(changed.length ? `Saved ${changed.length} Painting setting${changed.length === 1 ? "" : "s"}.` : "No Painting settings changed.");
    } catch (e) {
      setError(e.message || "Could not save Painting settings. Admin permission may be required.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-400">Loading Painting settings…</div>;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-[1180px] mx-auto p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link to="/EstimatorSettings" className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Estimator Settings</Link>
          <Button onClick={handleSave} disabled={saving || dirtyCount === 0} className="h-[32px] bg-[#454545] hover:bg-[#353535] text-white text-[12px] font-semibold disabled:opacity-50"><Save className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : `Save${dirtyCount ? ` (${dirtyCount})` : ""}`}</Button>
        </div>

        <div className="bg-white border border-gray-200 rounded-md px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-sky-100 text-sky-700 flex items-center justify-center"><Paintbrush className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-bold text-gray-900">Painting Settings</h1>
            <p className="text-[10px] text-gray-500">Edits the existing migrated Painting settings used by the Painting Builder. No separate settings store is created.</p>
          </div>
          <div className="hidden md:block text-right text-[10px] text-gray-500">
            <div>Mixed paint: <span className="font-semibold text-gray-800">${mixedGallonCost.toFixed(2)}/gal</span></div>
            <div>Applied liquid rate: <span className="font-semibold text-gray-800">${liquidRate.toFixed(4)}/sf</span></div>
          </div>
        </div>

        {message && <div className="px-3 py-2 rounded border border-green-200 bg-green-50 text-[11px] text-green-700">{message}</div>}
        {error && <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-[11px] text-red-700">{error}</div>}

        <div className="grid lg:grid-cols-2 gap-4">
          {GROUPS.map((group) => {
            const Icon = group.icon;
            const groupRows = group.names.map((name) => rowByName[name]).filter(Boolean);
            if (!groupRows.length) return null;
            return (
              <section key={group.key} className="bg-white border border-gray-200 rounded-md overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2"><Icon className="w-3.5 h-3.5 text-gray-500" /><span className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">{group.title}</span></div>
                <div className="divide-y divide-gray-100">
                  {groupRows.map((row) => <SettingRow key={row.id} row={row} value={values[row.setting_name] ?? ""} onChange={(value) => patch(row.setting_name, value)} readOnly={row.setting_name === "base_labor_hours_per_sqft"} />)}
                </div>
              </section>
            );
          })}
        </div>

        {rowByName.paint_consumables_inventory && (
          <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3">
              <div><div className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Consumables</div><div className="text-[10px] text-gray-500">Flat items automatically feed Base Supplies / Job; per-sq-ft items feed Paint Application Supplies / sq ft.</div></div>
              <Button variant="outline" onClick={addConsumable} className="h-[28px] text-[10px]"><Plus className="w-3 h-3 mr-1" /> Add</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-white text-gray-500"><tr className="border-b border-gray-100"><th className="text-left px-3 py-2 font-semibold">Item</th><th className="text-right px-3 py-2 font-semibold w-28">Cost</th><th className="text-right px-3 py-2 font-semibold w-24">Qty</th><th className="text-center px-3 py-2 font-semibold w-28">Per sq ft</th><th className="w-10" /></tr></thead>
                <tbody>{consumables.map((item, index) => <tr key={index} className="border-b border-gray-50"><td className="px-3 py-2"><Input value={item.name || ""} onChange={(e) => updateConsumable(index, "name", e.target.value)} className="h-[28px] text-[11px]" /></td><td className="px-3 py-2"><Input type="number" step="0.01" value={item.cost ?? 0} onChange={(e) => updateConsumable(index, "cost", e.target.value)} className="h-[28px] text-[11px] text-right" /></td><td className="px-3 py-2"><Input type="number" step="0.01" value={item.qty ?? 1} onChange={(e) => updateConsumable(index, "qty", e.target.value)} className="h-[28px] text-[11px] text-right" /></td><td className="px-3 py-2 text-center"><input type="checkbox" checked={!!item.per_sqft} onChange={(e) => updateConsumable(index, "per_sqft", e.target.checked)} /></td><td className="px-2"><button type="button" onClick={() => removeConsumable(index)} className="w-7 h-7 inline-flex items-center justify-center text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button></td></tr>)}</tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-gray-600"><span>Flat total: <b>${consumablesTotals.flat.toFixed(2)}/job</b></span><span>Per-sq-ft total: <b>${consumablesTotals.perSqft.toFixed(2)}/sf</b></span></div>
          </section>
        )}

        <div className="grid lg:grid-cols-3 gap-4">
          {TIER_SETTINGS.map((tierDef) => {
            const row = rowByName[tierDef.key];
            if (!row) return null;
            const tiers = parseJsonArray(values[tierDef.key]);
            return (
              <section key={tierDef.key} className="bg-white border border-gray-200 rounded-md overflow-hidden">
                <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2"><div className="text-[11px] font-bold text-gray-700">{tierDef.label}</div><button type="button" onClick={() => addTier(tierDef.key)} className="text-[10px] font-semibold text-sky-700">+ Tier</button></div>
                <div className="p-3 space-y-2">{tiers.map((tier, index) => <div key={index} className="grid grid-cols-[1fr_1fr_1fr_24px] gap-1.5 items-end"><MiniNumber label="Min" value={tier.min_quantity} onChange={(value) => updateTier(tierDef.key, index, "min_quantity", value)} /><MiniNumber label="Max" value={tier.max_quantity} onChange={(value) => updateTier(tierDef.key, index, "max_quantity", value)} /><MiniNumber label="Multiplier" step="0.01" value={tier.labor_multiplier} onChange={(value) => updateTier(tierDef.key, index, "labor_multiplier", value)} /><button type="button" onClick={() => removeTier(tierDef.key, index)} className="h-[28px] text-red-500 hover:bg-red-50 rounded">×</button></div>)}</div>
              </section>
            );
          })}
        </div>

        <div className="text-[10px] text-gray-400 pb-3">Loaded {rows.length} Painting-category settings. Compatibility settings not used by the current Painting Builder remain preserved in the database even when they are not shown here.</div>
      </div>
    </div>
  );
}

function SettingRow({ row, value, onChange, readOnly = false }) {
  const isUnit = ["paint_unit", "hardener_unit", "reducer_unit"].includes(row.setting_name);
  return (
    <div className="grid sm:grid-cols-[minmax(0,1fr)_150px] gap-2 px-4 py-2.5 items-center">
      <div className="min-w-0"><div className="text-[11px] font-medium text-gray-700">{settingLabel(row)}</div><div className="text-[9px] text-gray-400 font-mono mt-0.5">{row.setting_name}</div></div>
      {isUnit ? (
        <Select value={value || "gallon"} onValueChange={onChange} disabled={readOnly}><SelectTrigger className="h-[28px] text-[11px]"><SelectValue /></SelectTrigger><SelectContent>{UNIT_OPTIONS.map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent></Select>
      ) : (
        <Input type={row.setting_type === "number" ? "number" : "text"} step={row.setting_type === "number" ? "0.01" : undefined} value={value} onChange={(e) => onChange(e.target.value)} readOnly={readOnly} className={`h-[28px] text-[11px] text-right ${readOnly ? "bg-gray-100 text-gray-500" : ""}`} />
      )}
    </div>
  );
}

function MiniNumber({ label, value, onChange, step = "1" }) {
  return <label className="text-[9px] text-gray-400">{label}<Input type="number" step={step} value={value ?? 0} onChange={(e) => onChange(e.target.value)} className="h-[28px] text-[10px] mt-0.5 px-2" /></label>;
}
