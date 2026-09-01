import React, { useEffect, useMemo, useState } from "react";
import { Settings as SettingsEntity } from "@/entities/all";
import { Link } from "react-router-dom";
import { ArrowLeft, Calculator, Clock, DollarSign, Save, Scissors, Settings as SettingsIcon, Type, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SIZES = ["1/16", "1/8", "3/16", "1/4", "3/8", "1/2", "3/4", "1"];
const MATERIALS = ["Acrylic", "Wood", "Leather"];
const SHARED_KEYS = ["electricity_cost_per_kwh", "operator_cost_per_hour", "facility_overhead_per_hour"];

const LASER_KEYS = new Set([
  "parameter_laser_machine_rate", "parameter_laser_labor_rate", "parameter_handling_time_percentage", "min_parameter_laser_setup_hours", "min_parameter_laser_labor_hours", "parameter_laser_fixed_material_setup_cost",
  "engraving_laser_machine_rate", "engraving_laser_labor_rate", "engraving_handling_time_percentage", "min_engraving_laser_setup_hours", "min_engraving_laser_labor_hours", "engraving_laser_fixed_material_setup_cost",
  "laser_letter_perimeter_factor", "laser_engrave_speed_sqipm",
  ...MATERIALS.flatMap((m) => [`${m.toLowerCase()}_cut_multiplier`, `${m.toLowerCase()}_engrave_multiplier`]),
  ...SIZES.map((s) => `cut_speed_${s.replaceAll("/", "_")}`),
  ...SHARED_KEYS,
  ...["parameter_laser", "engraving_laser"].flatMap((prefix) => [
    `${prefix}_purchase_price`, `${prefix}_lifespan_years`, `${prefix}_usage_hours_per_week`, `${prefix}_annual_maintenance_cost`,
    `${prefix}_chiller_annual_maintenance_cost`, `${prefix}_power_consumption_kw`, `${prefix}_chiller_power_consumption_kw`, `${prefix}_blower_power_consumption_kw`,
    `${prefix}_tube_purchase_price`, `${prefix}_tube_lifespan_hours`,
  ]),
]);

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function calculateLaserRate(values, prefix) {
  const purchasePrice = num(values[`${prefix}_purchase_price`]);
  const lifespan = Math.max(num(values[`${prefix}_lifespan_years`], 1), 0.000001);
  const usageHours = Math.max(num(values[`${prefix}_usage_hours_per_week`], 1), 0.000001);
  const annualHours = usageHours * 52;
  const laserMaintenance = num(values[`${prefix}_annual_maintenance_cost`]);
  const chillerMaintenance = num(values[`${prefix}_chiller_annual_maintenance_cost`]);
  const powerKw = num(values[`${prefix}_power_consumption_kw`]) + num(values[`${prefix}_chiller_power_consumption_kw`]) + num(values[`${prefix}_blower_power_consumption_kw`]);
  const tubeLifespan = Math.max(num(values[`${prefix}_tube_lifespan_hours`], 1), 0.000001);
  const depreciation = (purchasePrice / lifespan) / annualHours;
  const maintenance = (laserMaintenance + chillerMaintenance) / annualHours;
  const power = powerKw * num(values.electricity_cost_per_kwh);
  const tube = num(values[`${prefix}_tube_purchase_price`]) / tubeLifespan;
  const overhead = num(values.facility_overhead_per_hour);
  return { depreciation, maintenance, power, tube, overhead, total: depreciation + maintenance + power + tube + overhead };
}

export default function LaserSettings() {
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
        const relevant = (all || []).filter((row) => LASER_KEYS.has(row.setting_name));
        const map = Object.fromEntries(relevant.map((row) => [row.setting_name, row.setting_value ?? ""]));
        setRows(relevant);
        setValues(map);
        setOriginal(map);
      } catch (e) {
        setError(e.message || "Could not load Laser settings.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const patch = (key, value) => setValues((prev) => ({ ...prev, [key]: String(value) }));
  const dirtyCount = rows.filter((row) => String(values[row.setting_name] ?? "") !== String(original[row.setting_name] ?? "")).length;
  const parameterRate = useMemo(() => calculateLaserRate(values, "parameter_laser"), [values]);
  const engravingRate = useMemo(() => calculateLaserRate(values, "engraving_laser"), [values]);

  const save = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const changed = rows.filter((row) => String(values[row.setting_name] ?? "") !== String(original[row.setting_name] ?? ""));
      await Promise.all(changed.map((row) => SettingsEntity.update(row.id, { setting_value: String(values[row.setting_name] ?? "") })));
      setOriginal(Object.fromEntries(rows.map((row) => [row.setting_name, String(values[row.setting_name] ?? "")] )));
      setMessage(changed.length ? `Saved ${changed.length} Laser setting${changed.length === 1 ? "" : "s"}.` : "No Laser settings changed.");
    } catch (e) {
      setError(e.message || "Could not save Laser settings. Admin permission may be required.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-400">Loading Laser settings…</div>;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-[1180px] mx-auto p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link to="/EstimatorSettings" className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Estimator Settings</Link>
          <Button onClick={save} disabled={saving || dirtyCount === 0} className="h-[32px] bg-[#454545] hover:bg-[#353535] text-white text-[12px] font-semibold disabled:opacity-50"><Save className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : `Save${dirtyCount ? ` (${dirtyCount})` : ""}`}</Button>
        </div>

        <div className="bg-white border border-gray-200 rounded-md px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-pink-100 text-pink-700 flex items-center justify-center"><Zap className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1"><h1 className="text-[18px] font-bold text-gray-900">Laser Settings</h1><p className="text-[10px] text-gray-500">Separate parameter-laser and engraving-laser rates, setup, material behavior and machine-cost calculators.</p></div>
          <div className="hidden md:flex gap-5 text-right text-[10px] text-gray-500"><div>Parameter<br /><b className="text-[13px] text-gray-900">${num(values.parameter_laser_machine_rate).toFixed(2)}/hr</b></div><div>Engraving<br /><b className="text-[13px] text-gray-900">${num(values.engraving_laser_machine_rate).toFixed(2)}/hr</b></div></div>
        </div>

        {message && <div className="px-3 py-2 rounded border border-green-200 bg-green-50 text-[11px] text-green-700">{message}</div>}
        {error && <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-[11px] text-red-700">{error}</div>}

        <Tabs defaultValue="parameter">
          <TabsList className="grid grid-cols-4 h-auto bg-white border border-gray-200 p-1">
            <TabsTrigger value="parameter" className="text-[11px] py-2"><Scissors className="w-3.5 h-3.5 mr-1.5" /> Parameter</TabsTrigger>
            <TabsTrigger value="engraving" className="text-[11px] py-2"><Type className="w-3.5 h-3.5 mr-1.5" /> Engraving</TabsTrigger>
            <TabsTrigger value="shared" className="text-[11px] py-2"><Clock className="w-3.5 h-3.5 mr-1.5" /> Speeds & Shared</TabsTrigger>
            <TabsTrigger value="general" className="text-[11px] py-2"><SettingsIcon className="w-3.5 h-3.5 mr-1.5" /> General</TabsTrigger>
          </TabsList>

          <TabsContent value="parameter" className="space-y-4 mt-4">
            <MachineCalculator title="Parameter Laser Machine Cost" prefix="parameter_laser" values={values} patch={patch} rate={parameterRate} onUseRate={() => patch("parameter_laser_machine_rate", parameterRate.total.toFixed(2))} />
            <RatesPanel title="Parameter Laser Rates & Labor" prefix="parameter_laser" handlingKey="parameter_handling_time_percentage" values={values} patch={patch} />
            <MultiplierPanel title="Material Cut-Time Multipliers" kind="cut" values={values} patch={patch} />
          </TabsContent>

          <TabsContent value="engraving" className="space-y-4 mt-4">
            <MachineCalculator title="Engraving Laser Machine Cost" prefix="engraving_laser" values={values} patch={patch} rate={engravingRate} onUseRate={() => patch("engraving_laser_machine_rate", engravingRate.total.toFixed(2))} />
            <RatesPanel title="Engraving Laser Rates & Labor" prefix="engraving_laser" handlingKey="engraving_handling_time_percentage" values={values} patch={patch} />
            <MultiplierPanel title="Material Engrave-Time Multipliers" kind="engrave" values={values} patch={patch} />
            <section className="bg-white border border-gray-200 rounded-md overflow-hidden"><SectionHeader icon={Clock} title="Engraving Speed" subtitle="Current Laser Builder uses square inches engraved per minute." /><div className="p-4 max-w-xs"><Field label="Engraving speed" suffix="sq in/min" value={values.laser_engrave_speed_sqipm} onChange={(v) => patch("laser_engrave_speed_sqipm", v)} /></div></section>
          </TabsContent>

          <TabsContent value="shared" className="space-y-4 mt-4">
            <section className="bg-white border border-gray-200 rounded-md overflow-hidden"><SectionHeader icon={Clock} title="Parameter Laser Cut Speed by Thickness" subtitle="Current estimator math consumes these values as inches per minute." /><div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">{SIZES.map((size) => { const key = `cut_speed_${size.replaceAll("/", "_")}`; return <Field key={key} label={`${size}\"`} suffix="in/min" value={values[key]} onChange={(v) => patch(key, v)} />; })}</div></section>
            <section className="bg-white border border-gray-200 rounded-md overflow-hidden"><SectionHeader icon={DollarSign} title="Shared Operating Costs" subtitle="Used by both laser machine-cost calculators. Operator labor remains separate from machine cost." /><div className="p-4 grid sm:grid-cols-3 gap-3"><Field label="Electricity" suffix="$/kWh" value={values.electricity_cost_per_kwh} onChange={(v) => patch("electricity_cost_per_kwh", v)} /><Field label="Operator labor reference" suffix="$/hr" value={values.operator_cost_per_hour} onChange={(v) => patch("operator_cost_per_hour", v)} /><Field label="Facility overhead" suffix="$/hr" value={values.facility_overhead_per_hour} onChange={(v) => patch("facility_overhead_per_hour", v)} /></div></section>
          </TabsContent>

          <TabsContent value="general" className="space-y-4 mt-4">
            <section className="bg-white border border-gray-200 rounded-md overflow-hidden"><SectionHeader icon={SettingsIcon} title="General Laser Calculation" /><div className="p-4 max-w-xs"><Field label="Letter perimeter factor" suffix="× height" value={values.laser_letter_perimeter_factor} onChange={(v) => patch("laser_letter_perimeter_factor", v)} /></div></section>
            <div className="text-[10px] text-gray-400">Shared company/notes defaults remain preserved in their existing general settings and are intentionally not duplicated here.</div>
          </TabsContent>
        </Tabs>

        <div className="text-[10px] text-gray-400 pb-3">Loaded {rows.length} existing Laser/shared Settings records. The page updates values in place and does not create a second configuration store.</div>
      </div>
    </div>
  );
}

function MachineCalculator({ title, prefix, values, patch, rate, onUseRate }) {
  return <section className="bg-white border border-gray-200 rounded-md overflow-hidden"><SectionHeader icon={Calculator} title={title} subtitle="Legacy cost basis: depreciation + maintenance + power + CO₂ tube + facility overhead." /><div className="grid lg:grid-cols-[minmax(0,1fr)_330px] gap-4 p-4"><div className="grid sm:grid-cols-2 gap-3"><Field label="Purchase price" suffix="$" value={values[`${prefix}_purchase_price`]} onChange={(v) => patch(`${prefix}_purchase_price`, v)} /><Field label="Expected lifespan" suffix="years" value={values[`${prefix}_lifespan_years`]} onChange={(v) => patch(`${prefix}_lifespan_years`, v)} /><Field label="Usage" suffix="hr/week" value={values[`${prefix}_usage_hours_per_week`]} onChange={(v) => patch(`${prefix}_usage_hours_per_week`, v)} /><Field label="CO₂ tube price" suffix="$" value={values[`${prefix}_tube_purchase_price`]} onChange={(v) => patch(`${prefix}_tube_purchase_price`, v)} /><Field label="CO₂ tube life" suffix="hours" value={values[`${prefix}_tube_lifespan_hours`]} onChange={(v) => patch(`${prefix}_tube_lifespan_hours`, v)} /><Field label="Laser annual maintenance" suffix="$/yr" value={values[`${prefix}_annual_maintenance_cost`]} onChange={(v) => patch(`${prefix}_annual_maintenance_cost`, v)} /><Field label="Chiller annual maintenance" suffix="$/yr" value={values[`${prefix}_chiller_annual_maintenance_cost`]} onChange={(v) => patch(`${prefix}_chiller_annual_maintenance_cost`, v)} /><Field label="Laser power" suffix="kW" value={values[`${prefix}_power_consumption_kw`]} onChange={(v) => patch(`${prefix}_power_consumption_kw`, v)} /><Field label="Chiller power" suffix="kW" value={values[`${prefix}_chiller_power_consumption_kw`]} onChange={(v) => patch(`${prefix}_chiller_power_consumption_kw`, v)} /><Field label="Blower power" suffix="kW" value={values[`${prefix}_blower_power_consumption_kw`]} onChange={(v) => patch(`${prefix}_blower_power_consumption_kw`, v)} /></div><div className="bg-gray-50 border border-gray-200 rounded p-4 self-start text-[11px] space-y-2"><RateRow label="Depreciation" value={rate.depreciation} /><RateRow label="Maintenance" value={rate.maintenance} /><RateRow label="Power" value={rate.power} /><RateRow label="CO₂ tube" value={rate.tube} /><RateRow label="Facility overhead" value={rate.overhead} /><div className="border-t border-gray-300 pt-2 mt-2 flex items-center justify-between"><span className="font-bold text-gray-800">Calculated machine rate</span><span className="text-[18px] font-bold text-pink-700">${rate.total.toFixed(2)}/hr</span></div><Button type="button" variant="outline" onClick={onUseRate} className="h-[30px] w-full text-[11px] mt-2">Use Calculated Rate</Button><p className="text-[9px] text-gray-400">Stages the rate locally. Save the page to persist it with the other changes.</p></div></div></section>;
}

function RatesPanel({ title, prefix, handlingKey, values, patch }) {
  return <section className="bg-white border border-gray-200 rounded-md overflow-hidden"><SectionHeader icon={DollarSign} title={title} /><div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3"><Field label="Machine rate" suffix="$/hr" value={values[`${prefix}_machine_rate`]} onChange={(v) => patch(`${prefix}_machine_rate`, v)} /><Field label="Labor rate" suffix="$/hr" value={values[`${prefix}_labor_rate`]} onChange={(v) => patch(`${prefix}_labor_rate`, v)} /><Field label="Handling time" suffix="% machine time" value={values[handlingKey]} onChange={(v) => patch(handlingKey, v)} /><Field label="Fixed setup" suffix="hours/job" value={values[`min_${prefix}_setup_hours`]} onChange={(v) => patch(`min_${prefix}_setup_hours`, v)} /><Field label="Fixed material setup" suffix="$/job" value={values[`${prefix}_fixed_material_setup_cost`]} onChange={(v) => patch(`${prefix}_fixed_material_setup_cost`, v)} /><Field label="Minimum labor" suffix="hours/job" value={values[`min_${prefix}_labor_hours`]} onChange={(v) => patch(`min_${prefix}_labor_hours`, v)} /></div></section>;
}

function MultiplierPanel({ title, kind, values, patch }) {
  return <section className="bg-white border border-gray-200 rounded-md overflow-hidden"><SectionHeader icon={Zap} title={title} /><div className="p-4 grid sm:grid-cols-3 gap-3">{MATERIALS.map((material) => { const key = `${material.toLowerCase()}_${kind}_multiplier`; return <Field key={key} label={material} suffix="×" value={values[key]} onChange={(v) => patch(key, v)} />; })}</div></section>;
}

function SectionHeader({ icon: Icon, title, subtitle }) { return <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-start gap-2"><Icon className="w-3.5 h-3.5 text-gray-500 mt-0.5" /><div><div className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">{title}</div>{subtitle && <div className="text-[9px] text-gray-500 mt-0.5">{subtitle}</div>}</div></div>; }
function Field({ label, suffix, value, onChange }) { return <label className="text-[10px] text-gray-500 min-w-0"><span className="block mb-1 truncate">{label}</span><div className="relative"><Input type="number" step="0.01" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={`h-[30px] text-[11px] ${suffix ? "pr-20" : ""}`} />{suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-400 pointer-events-none">{suffix}</span>}</div></label>; }
function RateRow({ label, value }) { return <div className="flex items-center justify-between gap-3 text-gray-600"><span>{label}</span><span className="font-mono font-semibold">${Number(value || 0).toFixed(2)}/hr</span></div>; }
