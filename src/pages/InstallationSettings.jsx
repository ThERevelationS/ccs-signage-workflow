import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Settings as SettingsEntity, User } from "@/entities/all";
import { ArrowLeft, Building2, DollarSign, Layers, Lock, Ruler, Save, TriangleAlert, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BaseTimesSizeCard from "@/components/channelLetterInstall/BaseTimesSizeCard";
import RacewayTimesCard from "@/components/channelLetterInstall/RacewayTimesCard";
import { HEIGHT_BUCKETS, ENV_KEYS, qualifiedKey, qualifiedNotesKey } from "@/components/channelLetterInstall/installSizeRates";
import { WALL_MATERIALS } from "@/components/channelLetterInstall/wallMaterials";
import { createSettingRowIfAbsent, preflightSettingsRows, saveSettingsRowsSafely } from "@/components/estimator/settings/settingsSaveGuard";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const SIZE_DEFS = [
  { key: "extra_small", label: "XS", range: '2"–8"' },
  { key: "small", label: "Small", range: '8"–12"' },
  { key: "medium", label: "Medium", range: '12"–24"' },
  { key: "large", label: "Large", range: '24"–48"' },
  { key: "extra_large", label: "XL", range: '48"–60"' },
  { key: "extra_extra_large", label: "XXL", range: '60"+' },
];

const TIME_TYPES = [
  { key: "flush", label: "Flush Mount", category: "install_rates_flush", drill: "install_drill_rate_", prep: "install_prep_rate_", elec: "install_electrical_rate_" },
  { key: "halo", label: "Halo-Lit", category: "install_rates_halo", drill: "install_halo_drill_rate_", prep: "install_halo_prep_rate_", elec: "install_halo_electrical_rate_" },
  { key: "dimensional", label: "Dimensional", category: "install_rates_dimensional", drill: "install_dimensional_drill_rate_", prep: "install_dimensional_prep_rate_", elec: null },
];

const LABOR_KEYS = ["install_labor_rate", "install_crew_lead_rate", "install_installer_rate", "install_helper_rate"];
const RACEWAY_KEYS = ["install_raceway_base_minutes_per_foot", "install_raceway_extra_minutes_per_foot", "install_raceway_letter_mounting_rate", "install_raceway_electrical_hookup_minutes"];
const SITE_MULTIPLIERS = ["install_escort_multiplier", "install_badging_multiplier", "install_after_hours_multiplier", "install_set_hours_multiplier"];
const ADDITIVE_SITE_KEYS = [
  "install_parapet_roof_extra_per_letter", "install_parapet_roof_extra_per_raceway",
  "install_parapet_drop_extra_per_letter", "install_parapet_drop_extra_per_raceway",
  "install_thick_walls_extra_per_letter", "install_thick_walls_extra_per_raceway",
];
const TRAVEL_KEYS = [
  "install_shop_address", "install_gasoline_price_per_gallon", "install_diesel_price_per_gallon",
  "install_travel_labor_rate", "install_travel_avg_speed_mph", "install_travel_overhead_per_mile", "install_min_travel_charge",
];
const LETTER_PRICE_KEYS = [
  "letters_raceway_1st_per_ft", "letters_raceway_2nd_per_ft", "letters_raceway_3rd_per_ft", "letters_raceway_4th_per_ft",
  "letters_channel_raceway_per_inch", "letters_channel_flush_per_inch", "letters_channel_halo_per_inch", "letters_capsule_logo_per_sqft",
];
const FEE_KEYS = ["letters_default_delivery_fee", "letters_default_other_fee"];

const pretty = (name) => String(name || "").replace(/^install_/, "").replace(/^letters_/, "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const settingType = (name) => name.endsWith("__notes") || name.includes("_label_") || name === "install_shop_address" ? "text" : "number";

function categoryForVirtual(name) {
  if (name.startsWith("install_halo_")) return "install_rates_halo";
  if (name.startsWith("install_dimensional_")) return "install_rates_dimensional";
  return "install_rates_flush";
}

function buildEffective(rows) {
  const map = Object.fromEntries((rows || []).map((row) => [row.setting_name, row.setting_value ?? ""]));
  TIME_TYPES.forEach((type) => {
    SIZE_DEFS.forEach((size) => {
      [type.drill, type.prep, type.elec].filter(Boolean).forEach((prefix) => {
        const legacyKey = `${prefix}${size.key}`;
        const legacyNotes = `${legacyKey}__notes`;
        ENV_KEYS.forEach((env) => HEIGHT_BUCKETS.forEach((bucket) => {
          const key = qualifiedKey(prefix, size.key, env, bucket.key);
          const notesKey = qualifiedNotesKey(prefix, size.key, env, bucket.key);
          if (map[key] === undefined) map[key] = map[legacyKey] ?? "";
          if (map[notesKey] === undefined) map[notesKey] = map[legacyNotes] ?? "";
        }));
      });
    });
  });
  return map;
}

export default function InstallationSettings() {
  const [rows, setRows] = useState([]);
  const [values, setValues] = useState({});
  const [original, setOriginal] = useState({});
  const [touched, setTouched] = useState(new Set());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const settingsSaveRef = useRef(false);

  const isAdmin = user?.role === "admin";
  const rowByName = useMemo(() => Object.fromEntries(rows.map((row) => [row.setting_name, row])), [rows]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [all, me] = await Promise.all([
          loadAllEntityRows({ entity: SettingsEntity, sort: null, label: "Installation Settings catalog" }),
          User.me().catch(() => null),
        ]);
        const relevant = (all || []).filter((row) => String(row.setting_name || "").startsWith("install_") || String(row.setting_name || "").startsWith("letters_"));
        const effective = buildEffective(relevant);
        setRows(relevant);
        setValues(effective);
        setOriginal(effective);
        setUser(me);
      } catch (e) {
        setError(e.message || "Could not load Installation settings.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const updateSetting = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: String(value) }));
    setTouched((prev) => new Set(prev).add(name));
  };

  const dirtyNames = useMemo(() => [...touched].filter((name) => String(values[name] ?? "") !== String(original[name] ?? "")), [touched, values, original]);

  const save = async () => {
    if (!isAdmin || !dirtyNames.length || settingsSaveRef.current) return;
    settingsSaveRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const existingDirtyRows = dirtyNames.map((name) => rowByName[name]).filter(Boolean);
      const missingDirtyNames = dirtyNames.filter((name) => !rowByName[name]);

      // Validate the entire mixed update/create batch before the first write.
      await preflightSettingsRows({
        SettingsEntity,
        rows,
        values,
        originalValues: original,
        changedRows: existingDirtyRows,
      });
      const liveBeforeWrite = await loadAllEntityRows({ entity: SettingsEntity, sort: null, label: "Installation Settings preflight catalog" });
      const appearedNames = missingDirtyNames.filter((name) =>
        (liveBeforeWrite || []).some((row) => row.setting_name === name)
      );
      if (appearedNames.length) {
        throw new Error(`These Installation Settings were created in another session: ${appearedNames.join(", ")}. Reload this page, review the new stored overrides, and apply your changes again.`);
      }

      let created = 0;
      let updated = 0;
      if (existingDirtyRows.length) {
        const existingSave = await saveSettingsRowsSafely({
          SettingsEntity,
          rows: existingDirtyRows,
          values,
          originalValues: original,
        });
        updated = existingSave.changedCount;
      }

      for (const name of missingDirtyNames) {
        const setting_value = String(values[name] ?? "");
        const result = await createSettingRowIfAbsent({
          SettingsEntity,
          data: {
            setting_name: name,
            setting_value,
            setting_type: settingType(name),
            category: categoryForVirtual(name),
            description: name.endsWith("__notes") ? "Installation rate notes" : "Installation time override by environment and height",
          },
          label: `Installation Setting ${name}`,
        });

        if (result.status === "existing" || result.status === "concurrent_duplicate_discarded") {
          throw new Error(`The Installation Setting ${name} was created concurrently in another session. Reload and review the canonical stored value before saving again.`);
        }
        created += 1;
      }
      const refreshed = await loadAllEntityRows({ entity: SettingsEntity, sort: null, label: "Installation Settings post-save catalog" });
      const relevant = (refreshed || []).filter((row) => String(row.setting_name || "").startsWith("install_") || String(row.setting_name || "").startsWith("letters_"));
      const effective = buildEffective(relevant);
      setRows(relevant);
      setValues(effective);
      setOriginal(effective);
      setTouched(new Set());
      setMessage(`Saved ${updated + created} Installation setting${updated + created === 1 ? "" : "s"}${created ? ` (${created} new height/environment override${created === 1 ? "" : "s"})` : ""}.`);
    } catch (e) {
      // Always reload after a failed mixed save so a retry starts from the
      // authoritative Settings set even if an earlier write succeeded.
      const refreshed = await loadAllEntityRows({ entity: SettingsEntity, sort: null, label: "Installation Settings recovery catalog" }).catch(() => null);
      if (refreshed) {
        const relevant = refreshed.filter((row) => String(row.setting_name || "").startsWith("install_") || String(row.setting_name || "").startsWith("letters_"));
        const effective = buildEffective(relevant);
        setRows(relevant);
        setValues(effective);
        setOriginal(effective);
        setTouched(new Set());
      }
      setError(e.message || "Could not save Installation settings.");
    } finally {
      settingsSaveRef.current = false;
      setSaving(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-400">Loading Installation settings…</div>;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-[1400px] mx-auto p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link to="/EstimatorSettings" className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Estimator Settings</Link>
          <div className="flex items-center gap-2">
            {!isAdmin && <span className="inline-flex items-center gap-1 text-[10px] text-gray-500"><Lock className="w-3 h-3" /> View only</span>}
            <Button onClick={save} disabled={!isAdmin || saving || dirtyNames.length === 0} className="h-[31px] text-[11px] bg-[#454545] hover:bg-[#353535] text-white disabled:opacity-40"><Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving…" : `Save${dirtyNames.length ? ` (${dirtyNames.length})` : ""}`}</Button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-md px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-violet-100 text-violet-700 flex items-center justify-center"><Ruler className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1"><h1 className="text-[18px] font-bold text-gray-900">Installation Settings</h1><p className="text-[10px] text-gray-500">Shop-wide labor, installation times, conditions, travel and purchased-letter pricing used by Channel Letter and shared installation workflows.</p></div>
        </div>

        <div className="px-3 py-2 rounded border border-violet-200 bg-violet-50 text-[10px] text-violet-800">
          Current size-only installation times remain the fallback for every height/environment combination. A new qualified Settings record is created only after you actually change that specific combination. Legacy height multipliers, unused capsule/backer timing rows and obsolete material keys remain preserved but are not presented as active controls.
        </div>
        {message && <div className="px-3 py-2 rounded border border-green-200 bg-green-50 text-[11px] text-green-700">{message}</div>}
        {error && <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-[11px] text-red-700">{error}</div>}

        <Tabs defaultValue="labor" className="space-y-4">
          <TabsList className="h-auto flex flex-wrap justify-start bg-white border border-gray-200 p-1">
            <TabsTrigger value="labor" className="text-[11px]">Labor</TabsTrigger>
            <TabsTrigger value="times" className="text-[11px]">Install Times</TabsTrigger>
            <TabsTrigger value="conditions" className="text-[11px]">Conditions</TabsTrigger>
            <TabsTrigger value="walls" className="text-[11px]">Wall Materials</TabsTrigger>
            <TabsTrigger value="travel" className="text-[11px]">Travel</TabsTrigger>
            <TabsTrigger value="letters" className="text-[11px]">Letter Pricing</TabsTrigger>
          </TabsList>

          <TabsContent value="labor"><SettingsCard title="Labor Rates" icon={DollarSign} description="The flat install rate prices line-item labor when no crew is assigned; role rates price Personnel rows when a crew is used."><FieldGrid keys={LABOR_KEYS} values={values} rowByName={rowByName} onChange={updateSetting} disabled={!isAdmin} /></SettingsCard></TabsContent>

          <TabsContent value="times" className="space-y-4">
            <Tabs defaultValue="flush">
              <TabsList className="h-auto flex flex-wrap justify-start bg-white border border-gray-200 p-1 mb-3">
                {TIME_TYPES.map((type) => <TabsTrigger key={type.key} value={type.key} className="text-[11px]">{type.label}</TabsTrigger>)}
                <TabsTrigger value="raceway" className="text-[11px]">Raceway</TabsTrigger>
              </TabsList>
              {TIME_TYPES.map((type) => (
                <TabsContent key={type.key} value={type.key}>
                  <SettingsCard title={`${type.label} — Size × Height × Environment`} icon={Ruler} description="Switch Interior/Exterior and height on each size card. Unedited combinations inherit the migrated size-only shop rate.">
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{SIZE_DEFS.map((size) => <BaseTimesSizeCard key={size.key} sizeKey={size.key} sizeLabel={size.label} sizeRange={size.range} drillPrefix={type.drill} prepPrefix={type.prep} elecPrefix={type.elec} includeElectrical={!!type.elec} settings={values} updateSetting={updateSetting} isLocked={!isAdmin} />)}</div>
                  </SettingsCard>
                </TabsContent>
              ))}
              <TabsContent value="raceway"><SettingsCard title="Raceway Installation Time" icon={Ruler} description="All four current raceway inputs are stored and calculated in minutes."><div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3"><RacewayTimesCard title="Base per Foot" badgeLabel="Raceway run" settingName={RACEWAY_KEYS[0]} unitLabel="Per foot" suffix="min/ft" settings={values} updateSetting={updateSetting} isLocked={!isAdmin} /><RacewayTimesCard title="Complexity Extra" badgeLabel="Optional extra" settingName={RACEWAY_KEYS[1]} unitLabel="Per foot" suffix="min/ft" settings={values} updateSetting={updateSetting} isLocked={!isAdmin} /><RacewayTimesCard title="Letter Mounting" badgeLabel="Mount letters" settingName={RACEWAY_KEYS[2]} unitLabel="Per letter" suffix="min/letter" settings={values} updateSetting={updateSetting} isLocked={!isAdmin} /><RacewayTimesCard title="Electrical Hookup" badgeLabel="Electrical" settingName={RACEWAY_KEYS[3]} unitLabel="Per raceway" suffix="min/raceway" settings={values} updateSetting={updateSetting} isLocked={!isAdmin} /></div></SettingsCard></TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="conditions" className="space-y-4">
            <SettingsCard title="Condition Multipliers" icon={TriangleAlert} description="Multipliers apply after base install time and wall-material adjustment."><FieldGrid keys={SITE_MULTIPLIERS} values={values} rowByName={rowByName} onChange={updateSetting} disabled={!isAdmin} /></SettingsCard>
            <SettingsCard title="Parapet / Thick-Wall Adders" icon={TriangleAlert} description="These are additive minutes, not multipliers."><FieldGrid keys={ADDITIVE_SITE_KEYS} values={values} rowByName={rowByName} onChange={updateSetting} disabled={!isAdmin} /></SettingsCard>
            <SeverityEditor title="Poor Electrical Access" prefix="install_poor_electrical" values={values} onChange={updateSetting} disabled={!isAdmin} />
            <SeverityEditor title="Poor Site Access" prefix="install_site_access" values={values} onChange={updateSetting} disabled={!isAdmin} />
          </TabsContent>

          <TabsContent value="walls"><SettingsCard title="Wall-Material Labor Multipliers" icon={Layers} description="Only materials currently selectable in the installation workflow are shown."><div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{WALL_MATERIALS.map((material) => <Field key={material.settingKey} label={material.label} description={material.description} name={material.settingKey} type="number" suffix="×" value={values[material.settingKey] ?? material.default} onChange={updateSetting} disabled={!isAdmin} />)}</div></SettingsCard></TabsContent>

          <TabsContent value="travel"><SettingsCard title="Installation Travel" icon={Building2} description="These are the settings the shared Travel & Fuel calculator currently consumes."><FieldGrid keys={TRAVEL_KEYS} values={values} rowByName={rowByName} onChange={updateSetting} disabled={!isAdmin} /></SettingsCard></TabsContent>

          <TabsContent value="letters" className="space-y-4">
            <SettingsCard title="Purchased Letter / Raceway Pricing" icon={Type} description="Current purchase pricing used by the Letters tab. Dimensional letters use their fabrication configuration instead of the old flat dimensional setting."><FieldGrid keys={LETTER_PRICE_KEYS} values={values} rowByName={rowByName} onChange={updateSetting} disabled={!isAdmin} /></SettingsCard>
            <SettingsCard title="New-Project Fee Defaults" icon={DollarSign} description="Only fee defaults that the current Channel Letter Builder actually pre-fills are shown."><FieldGrid keys={FEE_KEYS} values={values} rowByName={rowByName} onChange={updateSetting} disabled={!isAdmin} /></SettingsCard>
          </TabsContent>
        </Tabs>

        <div className="text-[10px] text-gray-400 pb-3">Loaded {rows.length} persisted install/letter Settings records. Missing height/environment combinations stay virtual until changed and saved.</div>
      </div>
    </div>
  );
}

function SettingsCard({ title, description, icon: Icon, children }) {
  return <section className="bg-white border border-gray-200 rounded-md overflow-hidden"><div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-start gap-2">{Icon && <Icon className="w-3.5 h-3.5 text-gray-500 mt-0.5" />}<div><div className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">{title}</div>{description && <div className="text-[9px] text-gray-500 mt-0.5">{description}</div>}</div></div><div className="p-4">{children}</div></section>;
}

function FieldGrid({ keys, values, rowByName, onChange, disabled }) {
  return <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{keys.map((name) => { const row = rowByName[name]; return <Field key={name} name={name} label={row?.description || pretty(name)} type={row?.setting_type || settingType(name)} value={values[name] ?? ""} onChange={onChange} disabled={disabled} />; })}</div>;
}

function Field({ name, label, description, value, onChange, disabled, type = "number", suffix }) {
  return <div><div className="flex items-baseline justify-between gap-2"><Label className="text-[10px] text-gray-600">{label}</Label>{suffix && <span className="text-[9px] text-gray-400">{suffix}</span>}</div>{type === "text" ? <Input value={value ?? ""} onChange={(e) => onChange(name, e.target.value)} disabled={disabled} className="h-[30px] mt-1 text-[11px]" /> : <Input type="number" step="0.01" value={value ?? ""} onChange={(e) => onChange(name, e.target.value)} disabled={disabled} className="h-[30px] mt-1 text-[11px] text-right" />}{description && <p className="text-[9px] text-gray-400 mt-1">{description}</p>}<div className="text-[8px] text-gray-300 font-mono mt-0.5 truncate">{name}</div></div>;
}

function SeverityEditor({ title, prefix, values, onChange, disabled }) {
  return <SettingsCard title={title} icon={TriangleAlert} description="Minutes are added per letter. Labels are what the estimator shows on the 10-level severity selector."><div className="overflow-x-auto"><table className="w-full text-[10px]"><thead><tr className="border-b border-gray-100 text-gray-500"><th className="text-left py-2 px-2 w-16">Level</th><th className="text-left py-2 px-2">Label</th><th className="text-right py-2 px-2 w-36">Extra min/letter</th></tr></thead><tbody>{Array.from({ length: 10 }, (_, i) => i + 1).map((level) => { const labelKey = `${prefix}_label_${level}`; const minuteKey = `${prefix}_level_${level}`; return <tr key={level} className="border-b border-gray-50"><td className="px-2 py-1.5 font-semibold text-gray-500">{level}</td><td className="px-2 py-1.5"><Input value={values[labelKey] ?? ""} onChange={(e) => onChange(labelKey, e.target.value)} disabled={disabled} className="h-[28px] text-[10px]" /></td><td className="px-2 py-1.5"><Input type="number" step="1" value={values[minuteKey] ?? ""} onChange={(e) => onChange(minuteKey, e.target.value)} disabled={disabled} className="h-[28px] text-[10px] text-right" /></td></tr>; })}</tbody></table></div></SettingsCard>;
}
