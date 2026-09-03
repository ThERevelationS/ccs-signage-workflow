import { useEffect, useMemo, useRef, useState } from "react";
import { Settings as SettingsEntity } from "@/entities/all";
import { Link } from "react-router-dom";
import { ArrowLeft, Calculator, Cpu, DollarSign, Gauge, Save, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSettingsRowsSafely } from "@/components/estimator/settings/settingsSaveGuard";

const SIZES = ["1/16", "1/8", "3/16", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8", "1", "1-1/4", "1-1/2", "2", "2-1/2", "3", "3-1/2", "4"];
const MATERIALS = ["Acrylic", "Wood", "MDF", "Plywood", "PVC", "HDPE", "Aluminum", "Corian"];

const KEYS = new Set([
  "cnc_machine_rate", "cnc_labor_rate", "cnc_setup_time_percentage", "min_cnc_setup_hours", "min_cnc_labor_hours", "cnc_letter_perimeter_factor",
  "cnc_purchase_price", "cnc_lifespan_years", "cnc_usage_hours_per_week", "cnc_annual_maintenance_cost", "cnc_power_consumption_kw", "cnc_tooling_cost_per_hour",
  "electricity_cost_per_kwh", "operator_cost_per_hour", "facility_overhead_per_hour",
  ...MATERIALS.map((m) => `${m.toLowerCase()}_cnc_cut_multiplier`),
  ...SIZES.map((s) => `cnc_cut_speed_${s.replaceAll("/", "_").replaceAll("-", "_")}`),
]);

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export default function CNCSettings() {
  const [rows, setRows] = useState([]);
  const [values, setValues] = useState({});
  const [original, setOriginal] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const settingsSaveRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      try {
        const all = await SettingsEntity.list();
        const relevant = (all || []).filter((row) => KEYS.has(row.setting_name));
        const map = Object.fromEntries(relevant.map((row) => [row.setting_name, row.setting_value ?? ""]));
        setRows(relevant);
        setValues(map);
        setOriginal(map);
      } catch (e) {
        setError(e.message || "Could not load CNC settings.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const patch = (key, value) => setValues((prev) => ({ ...prev, [key]: String(value) }));
  const dirtyCount = rows.filter((row) => String(values[row.setting_name] ?? "") !== String(original[row.setting_name] ?? "")).length;

  const rate = useMemo(() => {
    const purchasePrice = num(values.cnc_purchase_price);
    const lifespan = Math.max(num(values.cnc_lifespan_years, 1), 0.000001);
    const usageHours = Math.max(num(values.cnc_usage_hours_per_week, 1), 0.000001);
    const annualHours = usageHours * 52;
    const depreciation = (purchasePrice / lifespan) / annualHours;
    const maintenance = num(values.cnc_annual_maintenance_cost) / annualHours;
    const power = num(values.cnc_power_consumption_kw) * num(values.electricity_cost_per_kwh);
    const tooling = num(values.cnc_tooling_cost_per_hour);
    const overhead = num(values.facility_overhead_per_hour);
    const operator = num(values.operator_cost_per_hour);
    // Preserve legacy SignEstimate Pro behavior: operator labor is shown for reference,
    // but is intentionally excluded from CNC machine rate because labor is priced separately.
    return { depreciation, maintenance, power, tooling, overhead, operator, total: depreciation + maintenance + power + tooling + overhead };
  }, [values]);

  const handleSave = async () => {
    if (settingsSaveRef.current) return;
    settingsSaveRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await saveSettingsRowsSafely({
        SettingsEntity,
        rows,
        values,
        originalValues: original,
      });
      setRows(result.rows);
      setOriginal(result.snapshot);
      setMessage(result.changedCount ? `Saved ${result.changedCount} CNC setting${result.changedCount === 1 ? "" : "s"}.` : "No CNC settings changed.");
    } catch (e) {
      setError(e.message || "Could not save CNC settings. Admin permission may be required.");
    } finally {
      settingsSaveRef.current = false;
      setSaving(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-400">Loading CNC settings…</div>;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-[1180px] mx-auto p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link to="/EstimatorSettings" className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Estimator Settings</Link>
          <Button onClick={handleSave} disabled={saving || dirtyCount === 0} className="h-[32px] bg-[#454545] hover:bg-[#353535] text-white text-[12px] font-semibold disabled:opacity-50"><Save className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : `Save${dirtyCount ? ` (${dirtyCount})` : ""}`}</Button>
        </div>

        <div className="bg-white border border-gray-200 rounded-md px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center"><Cpu className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1"><h1 className="text-[18px] font-bold text-gray-900">CNC Settings</h1><p className="text-[10px] text-gray-500">Edits the existing migrated CNC Settings records used by the current CNC Builder.</p></div>
          <div className="hidden md:block text-right text-[10px] text-gray-500">Current machine rate<br /><b className="text-[14px] text-gray-900">${num(values.cnc_machine_rate).toFixed(2)}/hr</b></div>
        </div>

        {message && <div className="px-3 py-2 rounded border border-green-200 bg-green-50 text-[11px] text-green-700">{message}</div>}
        {error && <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-[11px] text-red-700">{error}</div>}

        <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
          <SectionHeader icon={Calculator} title="CNC Machine Rate Calculator" subtitle="Legacy operational-cost calculator. Operator labor remains separate from machine cost." />
          <div className="grid lg:grid-cols-[minmax(0,1fr)_330px] gap-4 p-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <SettingField label="Purchase price" suffix="$" value={values.cnc_purchase_price} onChange={(v) => patch("cnc_purchase_price", v)} />
              <SettingField label="Expected lifespan" suffix="years" value={values.cnc_lifespan_years} onChange={(v) => patch("cnc_lifespan_years", v)} />
              <SettingField label="Usage" suffix="hr/week" value={values.cnc_usage_hours_per_week} onChange={(v) => patch("cnc_usage_hours_per_week", v)} />
              <SettingField label="Annual maintenance" suffix="$/yr" value={values.cnc_annual_maintenance_cost} onChange={(v) => patch("cnc_annual_maintenance_cost", v)} />
              <SettingField label="Power consumption" suffix="kW" value={values.cnc_power_consumption_kw} onChange={(v) => patch("cnc_power_consumption_kw", v)} />
              <SettingField label="Tooling" suffix="$/hr" value={values.cnc_tooling_cost_per_hour} onChange={(v) => patch("cnc_tooling_cost_per_hour", v)} />
              <SettingField label="Electricity" suffix="$/kWh" value={values.electricity_cost_per_kwh} onChange={(v) => patch("electricity_cost_per_kwh", v)} />
              <SettingField label="Facility overhead" suffix="$/hr" value={values.facility_overhead_per_hour} onChange={(v) => patch("facility_overhead_per_hour", v)} />
              <SettingField label="Operator labor reference" suffix="$/hr" value={values.operator_cost_per_hour} onChange={(v) => patch("operator_cost_per_hour", v)} />
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded p-4 self-start text-[11px] space-y-2">
              <RateRow label="Depreciation" value={rate.depreciation} />
              <RateRow label="Maintenance" value={rate.maintenance} />
              <RateRow label="Power" value={rate.power} />
              <RateRow label="Tooling" value={rate.tooling} />
              <RateRow label="Facility overhead" value={rate.overhead} />
              <RateRow label="Operator labor (excluded)" value={rate.operator} muted />
              <div className="border-t border-gray-300 pt-2 mt-2 flex items-center justify-between"><span className="font-bold text-gray-800">Calculated machine rate</span><span className="text-[18px] font-bold text-emerald-700">${rate.total.toFixed(2)}/hr</span></div>
              <Button type="button" variant="outline" onClick={() => patch("cnc_machine_rate", rate.total.toFixed(2))} className="h-[30px] w-full text-[11px] mt-2">Use Calculated Rate</Button>
              <p className="text-[9px] text-gray-400">This stages the calculated value in CNC Machine Rate. Click Save above to persist all changes together.</p>
            </div>
          </div>
        </section>

        <div className="grid lg:grid-cols-2 gap-4">
          <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <SectionHeader icon={DollarSign} title="Rates & Labor" />
            <div className="p-4 grid sm:grid-cols-2 gap-3">
              <SettingField label="Machine rate" suffix="$/hr" value={values.cnc_machine_rate} onChange={(v) => patch("cnc_machine_rate", v)} />
              <SettingField label="Labor rate" suffix="$/hr" value={values.cnc_labor_rate} onChange={(v) => patch("cnc_labor_rate", v)} />
              <SettingField label="Setup time" suffix="% machine time" value={values.cnc_setup_time_percentage} onChange={(v) => patch("cnc_setup_time_percentage", v)} />
              <SettingField label="Fixed setup" suffix="hours/job" value={values.min_cnc_setup_hours} onChange={(v) => patch("min_cnc_setup_hours", v)} />
              <SettingField label="Minimum dynamic labor" suffix="hours/job" value={values.min_cnc_labor_hours} onChange={(v) => patch("min_cnc_labor_hours", v)} />
              <SettingField label="Letter perimeter factor" suffix="× height" value={values.cnc_letter_perimeter_factor} onChange={(v) => patch("cnc_letter_perimeter_factor", v)} />
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <SectionHeader icon={Wrench} title="Material Cut-Time Multipliers" />
            <div className="p-4 grid sm:grid-cols-2 gap-3">
              {MATERIALS.map((material) => {
                const key = `${material.toLowerCase()}_cnc_cut_multiplier`;
                return <SettingField key={key} label={material} suffix="×" value={values[key]} onChange={(v) => patch(key, v)} />;
              })}
            </div>
          </section>
        </div>

        <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
          <SectionHeader icon={Gauge} title="Default Cut Speed by Thickness" subtitle="Used when a CNC item thickness is selected. Units are inches per minute." />
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {SIZES.map((size) => {
              const key = `cnc_cut_speed_${size.replaceAll("/", "_").replaceAll("-", "_")}`;
              return <SettingField key={key} label={`${size}\"`} suffix="in/min" value={values[key]} onChange={(v) => patch(key, v)} compact />;
            })}
          </div>
        </section>

        <div className="text-[10px] text-gray-400 pb-3">Loaded {rows.length} existing CNC/shared Settings records. Unused compatibility settings remain preserved and are not modified by this page.</div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-start gap-2"><Icon className="w-3.5 h-3.5 text-gray-500 mt-0.5" /><div><div className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">{title}</div>{subtitle && <div className="text-[9px] text-gray-500 mt-0.5">{subtitle}</div>}</div></div>;
}

function SettingField({ label, suffix, value, onChange, compact = false }) {
  return <label className="text-[10px] text-gray-500 min-w-0"><span className="block mb-1 truncate">{label}</span><div className="relative"><Input type="number" step="0.01" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={`h-[30px] text-[11px] ${suffix ? "pr-16" : ""} ${compact ? "px-2" : ""}`} />{suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-400 pointer-events-none">{suffix}</span>}</div></label>;
}

function RateRow({ label, value, muted = false }) {
  return <div className={`flex items-center justify-between gap-3 ${muted ? "text-gray-400" : "text-gray-600"}`}><span>{label}</span><span className="font-mono font-semibold">${Number(value || 0).toFixed(2)}/hr</span></div>;
}
