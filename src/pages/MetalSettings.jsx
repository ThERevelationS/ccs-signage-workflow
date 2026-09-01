import React, { useEffect, useState } from "react";
import { Settings as SettingsEntity } from "@/entities/all";
import { Link } from "react-router-dom";
import { ArrowLeft, Hammer, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ACTIVE_KEYS = new Set(["metal_fabrication_rate", "metal_welding_rate", "metal_finishing_rate"]);

export default function MetalSettings() {
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
        setError(e.message || "Could not load Metal settings.");
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
      setMessage(changed.length ? `Saved ${changed.length} Metal setting${changed.length === 1 ? "" : "s"}.` : "No Metal settings changed.");
    } catch (e) {
      setError(e.message || "Could not save Metal settings. Admin permission may be required.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-400">Loading Metal settings…</div>;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-3xl mx-auto p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link to="/EstimatorSettings" className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Estimator Settings</Link>
          <Button onClick={save} disabled={saving || dirtyCount === 0} className="h-[32px] bg-[#454545] hover:bg-[#353535] text-white text-[12px] font-semibold disabled:opacity-50"><Save className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : `Save${dirtyCount ? ` (${dirtyCount})` : ""}`}</Button>
        </div>

        <div className="bg-white border border-gray-200 rounded-md px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-orange-100 text-orange-700 flex items-center justify-center"><Hammer className="w-5 h-5" /></div>
          <div><h1 className="text-[18px] font-bold text-gray-900">Metal Fabrication Settings</h1><p className="text-[10px] text-gray-500">Global labor defaults used when a new Metal Builder Product is created.</p></div>
        </div>

        {message && <div className="px-3 py-2 rounded border border-green-200 bg-green-50 text-[11px] text-green-700">{message}</div>}
        {error && <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-[11px] text-red-700">{error}</div>}

        <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200"><div className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Labor Rates</div><div className="text-[9px] text-gray-500 mt-0.5">These values seed new Metal projects. Existing saved projects retain their own rates until intentionally changed.</div></div>
          <div className="p-4 grid sm:grid-cols-3 gap-3">
            <Field label="Fabrication" suffix="$/hr" value={values.metal_fabrication_rate} onChange={(v) => patch("metal_fabrication_rate", v)} />
            <Field label="Welding" suffix="$/hr" value={values.metal_welding_rate} onChange={(v) => patch("metal_welding_rate", v)} />
            <Field label="Finishing" suffix="$/hr" value={values.metal_finishing_rate} onChange={(v) => patch("metal_finishing_rate", v)} />
          </div>
        </section>

        <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800">
          The migrated <code>weld_time_per_inch</code> compatibility setting is preserved but not shown here because the current Metal Builder prices welding from entered welding hours; it does not currently auto-calculate welding hours from weld length.
        </div>
      </div>
    </div>
  );
}

function Field({ label, suffix, value, onChange }) {
  return <label className="text-[10px] text-gray-500"><span className="block mb-1">{label}</span><div className="relative"><Input type="number" step="0.01" min="0" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="h-[30px] text-[11px] pr-14" /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-400">{suffix}</span></div></label>;
}
