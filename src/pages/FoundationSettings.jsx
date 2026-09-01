import React, { useEffect, useState } from "react";
import { Settings as SettingsEntity } from "@/entities/all";
import { Link } from "react-router-dom";
import { ArrowLeft, Bricks, Clock, PaintBucket, Save, Shovel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const GROUPS = [
  {
    title: "Foundation Labor & Timing",
    icon: Shovel,
    fields: [
      ["foundation_main_labor_rate", "Main labor rate", "$/hr"],
      ["foundation_pouring_cost_per_cy", "Pouring labor", "$/CY"],
      ["foundation_forming_cost_per_sqft", "Forming labor", "$/sq ft"],
      ["foundation_finishing_cost_per_sqft", "Finishing labor", "$/sq ft"],
      ["foundation_rebar_time_cross_section", "Rebar labor per intersection", "hr"],
      ["foundation_rebar_time_linear_ft", "Rebar labor per linear foot", "hr/LF"],
      ["foundation_hand_dig_time_per_cy", "Hand excavation time", "hr/CY"],
      ["foundation_equipment_excavation_time_per_cy", "Equipment excavation time", "hr/CY"],
    ],
  },
  {
    title: "Forming Calculation",
    icon: Clock,
    fields: [
      ["foundation_forming_materials_spread_foot", "Spread-foot forming multiplier", "×"],
      ["foundation_forming_materials_pillar", "Pillar forming multiplier", "×"],
    ],
  },
  {
    title: "Masonry Walls",
    icon: Bricks,
    fields: [
      ["wall_labor_rate", "Wall masonry labor", "$/sq ft"],
      ["wall_minimum_charge", "Wall minimum labor charge", "$"],
      ["wall_labor_bricks_per_hour", "Wall production rate", "units/hr"],
    ],
  },
  {
    title: "Pole Painting",
    icon: PaintBucket,
    fields: [
      ["pole_paint_cost_per_lf", "Paint material", "$/LF"],
      ["pole_paint_labor_per_lf", "Paint labor", "$/LF"],
      ["pole_paint_size_multiplier_4in", "4\" pole multiplier", "×"],
      ["pole_paint_size_multiplier_6in", "6\" pole multiplier", "×"],
      ["pole_paint_size_multiplier_8in", "8\" pole multiplier", "×"],
      ["pole_paint_size_multiplier_10in", "10\" pole multiplier", "×"],
      ["pole_paint_size_multiplier_12in", "12\"+ pole multiplier", "×"],
    ],
  },
];

const ACTIVE_KEYS = new Set(GROUPS.flatMap((group) => group.fields.map(([key]) => key)));

export default function FoundationSettings() {
  const [rows, setRows] = useState([]);
  const [values, setValues] = useState({});
  const [original, setOriginal] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const all = await SettingsEntity.list();
        const relevant = (all || []).filter((row) => ACTIVE_KEYS.has(row.setting_name));
        const map = Object.fromEntries(relevant.map((row) => [row.setting_name, row.setting_value ?? ""]));
        setRows(relevant);
        setValues(map);
        setOriginal(map);
      } catch (e) {
        setError(e.message || "Could not load Foundation settings.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const patch = (key, value) => setValues((prev) => ({ ...prev, [key]: String(value) }));
  const dirtyCount = rows.filter((row) => String(values[row.setting_name] ?? "") !== String(original[row.setting_name] ?? "")).length;

  const save = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const changed = rows.filter((row) => String(values[row.setting_name] ?? "") !== String(original[row.setting_name] ?? ""));
      await Promise.all(changed.map((row) => SettingsEntity.update(row.id, { setting_value: String(values[row.setting_name] ?? "") })));
      setOriginal(Object.fromEntries(rows.map((row) => [row.setting_name, String(values[row.setting_name] ?? "")] )));
      setMessage(changed.length ? `Saved ${changed.length} Foundation setting${changed.length === 1 ? "" : "s"}.` : "No Foundation settings changed.");
    } catch (e) {
      setError(e.message || "Could not save Foundation settings. Admin permission may be required.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-400">Loading Foundation settings…</div>;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-[1050px] mx-auto p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link to="/EstimatorSettings" className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Estimator Settings</Link>
          <Button onClick={save} disabled={saving || dirtyCount === 0} className="h-[32px] bg-[#454545] hover:bg-[#353535] text-white text-[12px] font-semibold disabled:opacity-50"><Save className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : `Save${dirtyCount ? ` (${dirtyCount})` : ""}`}</Button>
        </div>

        <div className="bg-white border border-gray-200 rounded-md px-4 py-3">
          <h1 className="text-[18px] font-bold text-gray-900">Foundation Settings</h1>
          <p className="text-[10px] text-gray-500 mt-0.5">Shop-wide calculation settings currently consumed by Concrete | Masonry | Poles. Material and equipment costs continue to come from Master Inventory/Foundation Inventory.</p>
        </div>

        {message && <div className="px-3 py-2 rounded border border-green-200 bg-green-50 text-[11px] text-green-700">{message}</div>}
        {error && <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-[11px] text-red-700">{error}</div>}

        <div className="grid lg:grid-cols-2 gap-4">
          {GROUPS.map((group) => {
            const Icon = group.icon;
            return <section key={group.title} className="bg-white border border-gray-200 rounded-md overflow-hidden"><div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2"><Icon className="w-3.5 h-3.5 text-gray-500" /><div className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">{group.title}</div></div><div className="p-4 grid sm:grid-cols-2 gap-3">{group.fields.map(([key, label, suffix]) => <Field key={key} label={label} suffix={suffix} value={values[key]} onChange={(v) => patch(key, v)} missing={!rows.some((row) => row.setting_name === key)} />)}</div></section>;
          })}
        </div>

        <div className="px-3 py-2.5 bg-blue-50 border border-blue-200 rounded text-[10px] text-blue-800">
          Concrete mix pricing, ready-mix delivery fees, bagged concrete, rebar, forming stock, excavation equipment, poles, masonry units and wall caps are inventory/catalog data in the current system and are intentionally not duplicated here.
        </div>
        <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800">
          The current wall calculator still has a legacy fallback of <b>$10/bag</b> for mortar when no <code>wall_mortar_cost_per_bag</code> setting exists. That fallback is preserved for now rather than silently creating a new production setting during this UI restoration.
        </div>
      </div>
    </div>
  );
}

function Field({ label, suffix, value, onChange, missing }) {
  return <label className="text-[10px] text-gray-500"><span className="block mb-1">{label}</span><div className="relative"><Input type="number" step="0.01" min="0" value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={missing} placeholder={missing ? "No stored setting" : ""} className="h-[30px] text-[11px] pr-16 disabled:bg-gray-100" />{suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-400">{suffix}</span>}</div></label>;
}
