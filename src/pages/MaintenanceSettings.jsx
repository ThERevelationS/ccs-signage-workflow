import { useEffect, useMemo, useRef, useState } from "react";
import { MaintenanceActionRate, Settings as SettingsEntity } from "@/entities/all";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, DollarSign, Info, MapPin, Package, Save, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RatesBySignTypeTab from "@/components/signMaintenance/RatesBySignTypeTab";
import TravelTab from "@/components/signMaintenance/TravelTab";
import MinimumsTab from "@/components/signMaintenance/MinimumsTab";
import SiteConditionsTab from "@/components/signMaintenance/SiteConditionsTab";
import MaintenanceMaterialRulesTab from "@/components/signMaintenance/MaintenanceMaterialRulesTab";
import { preflightSettingsRows } from "@/components/estimator/settings/settingsSaveGuard";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { deleteEntityIfUnchanged, expectedEntityFields, replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

const LABOR_FIELDS = [
  { key: "maintenance_crew_lead_rate", label: "Crew Lead", suffix: "$/hr" },
  { key: "maintenance_tech_rate", label: "Service Tech", suffix: "$/hr" },
  { key: "maintenance_helper_rate", label: "Helper", suffix: "$/hr" },
];

const RATE_FIELDS = [
  "rate_basis", "is_enabled",
  "base_minutes_xs", "base_minutes_s", "base_minutes_m", "base_minutes_l", "base_minutes_xl", "base_minutes_xxl",
  "base_minutes_cab_s", "base_minutes_cab_m", "base_minutes_cab_l", "base_minutes_cab_xl", "base_minutes_flat",
];

const comparableRate = (row = {}) => Object.fromEntries(RATE_FIELDS.map((field) => [field, row[field] ?? null]));
const sameRate = (a, b) => JSON.stringify(comparableRate(a)) === JSON.stringify(comparableRate(b));
const loadAllSettings = () => loadAllEntityRows({ entity: SettingsEntity, sort: "created_date", label: "Estimator Settings" });
const loadAllMaintenanceRates = () => loadAllEntityRows({ entity: MaintenanceActionRate, sort: "created_date", label: "Maintenance action rates" });

export default function MaintenanceSettings() {
  const [settingsRows, setSettingsRows] = useState([]);
  const [globalSettings, setGlobalSettings] = useState({});
  const [originalSettings, setOriginalSettings] = useState({});
  const [rates, setRates] = useState([]);
  const [originalRates, setOriginalRates] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const settingsSaveRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [allSettings, allRates] = await Promise.all([
          loadAllSettings(),
          loadAllMaintenanceRates(),
        ]);
        const maintenanceRows = (allSettings || []).filter((row) => String(row.setting_name || "").startsWith("maintenance_"));
        const settingsMap = Object.fromEntries(maintenanceRows.map((row) => [row.setting_name, row.setting_value ?? ""]));
        setSettingsRows(maintenanceRows);
        setGlobalSettings(settingsMap);
        setOriginalSettings(settingsMap);
        setRates(allRates || []);
        setOriginalRates(new Map((allRates || []).map((row) => [`${row.sign_type}|${row.action}`, structuredClone(row)])));
      } catch (e) {
        setError(e.message || "Could not load Maintenance settings.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const rateMap = useMemo(() => {
    const map = new Map();
    rates.forEach((row) => map.set(`${row.sign_type}|${row.action}`, row));
    return map;
  }, [rates]);

  const changedSettingRows = useMemo(
    () => settingsRows.filter((row) => String(globalSettings[row.setting_name] ?? "") !== String(originalSettings[row.setting_name] ?? "")),
    [settingsRows, globalSettings, originalSettings]
  );

  const changedRateRows = useMemo(
    () => rates.filter((row) => {
      const original = originalRates.get(`${row.sign_type}|${row.action}`);
      return !original || !sameRate(row, original);
    }),
    [rates, originalRates]
  );

  const dirtyCount = changedSettingRows.length + changedRateRows.length;

  const changeRate = (signTypeId, actionId, patch) => {
    setRates((prev) => {
      const index = prev.findIndex((row) => row.sign_type === signTypeId && row.action === actionId);
      if (index < 0) {
        // Do not pre-seed unsupported or absent combinations. If a valid current
        // UI combination is ever genuinely missing, only create it after the user
        // explicitly edits that combination and saves this page.
        return [...prev, { sign_type: signTypeId, action: actionId, ...patch }];
      }
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const saveAll = async () => {
    if (dirtyCount === 0 || settingsSaveRef.current) return;
    settingsSaveRef.current = true;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      // Preflight Settings and the rate matrix before the first write so an older
      // admin browser cannot silently overwrite newer pricing/labor configuration.
      const settingsPreflight = await preflightSettingsRows({
        SettingsEntity,
        rows: settingsRows,
        values: globalSettings,
        originalValues: originalSettings,
        changedRows: changedSettingRows,
      });
      const liveSettingsById = new Map((settingsPreflight.liveRows || []).map((row) => [row.id, row]));

      const liveRates = await loadAllMaintenanceRates();
      const liveById = new Map((liveRates || []).filter((row) => row.id).map((row) => [row.id, row]));
      const liveByKey = new Map((liveRates || []).map((row) => [`${row.sign_type}|${row.action}`, row]));
      const existingRateConflicts = changedRateRows.filter((row) => {
        if (!row.id) return false;
        const key = `${row.sign_type}|${row.action}`;
        const loaded = originalRates.get(key);
        const live = liveById.get(row.id);
        if (!loaded || !live) return true;
        const versionChanged = !!(loaded.updated_date && live.updated_date && loaded.updated_date !== live.updated_date);
        return versionChanged || !sameRate(live, loaded);
      });
      const appearedRateRows = changedRateRows.filter((row) => !row.id && liveByKey.has(`${row.sign_type}|${row.action}`));
      if (existingRateConflicts.length || appearedRateRows.length) {
        const keys = [...existingRateConflicts, ...appearedRateRows].map((row) => `${row.sign_type}/${row.action}`).join(", ");
        throw new Error(`These Maintenance action rates changed in another session: ${keys}. Reload this page, review the latest values, and apply your changes again.`);
      }

      // Create genuinely missing, explicitly edited rate rows first. If another
      // session creates the same key after preflight, remove only our losing row.
      for (const row of changedRateRows.filter((item) => !item.id)) {
        const payload = { sign_type: row.sign_type, action: row.action, ...comparableRate(row) };
        let created;
        try {
          created = await MaintenanceActionRate.create(payload);
        } catch (createError) {
          const recovered = (await loadAllMaintenanceRates())
            .filter((item) => item.sign_type === row.sign_type && item.action === row.action);
          if (recovered.length === 1 && sameRate(recovered[0], payload)) {
            created = recovered[0];
          } else {
            throw createError;
          }
        }
        const sameKey = (await loadAllMaintenanceRates())
          .filter((item) => item.sign_type === row.sign_type && item.action === row.action)
          .sort((a, b) => {
            const dateCompare = String(a.created_date || "").localeCompare(String(b.created_date || ""));
            return dateCompare || String(a.id).localeCompare(String(b.id));
          });
        if (sameKey.length > 1) {
          const ownCreated = sameKey.find((item) => item.id === created?.id);
          if (ownCreated) {
            await deleteEntityIfUnchanged({
              entity: MaintenanceActionRate,
              record: ownCreated,
              label: `Duplicate Maintenance action rate ${row.sign_type}/${row.action}`,
            });
          }
          throw new Error(`The Maintenance action rate ${row.sign_type}/${row.action} was created concurrently in another session. This save's new row was discarded when identifiable; reload before saving again.`);
        }
      }

      let confirmedWrites = changedRateRows.filter((item) => !item.id).length;
      const totalWrites = changedSettingRows.length + changedRateRows.length;
      for (const row of changedSettingRows) {
        const live = liveSettingsById.get(row.id);
        const desired = { setting_value: String(globalSettings[row.setting_name] ?? "") };
        try {
          await replaceEntityFieldsIfUnchanged({
            entity: SettingsEntity,
            id: row.id,
            expectedUpdatedAt: live?.updated_date || "",
            expectedFields: expectedEntityFields(live || {}, desired),
            nextFields: desired,
            label: `Maintenance setting ${row.setting_name}`,
          });
          confirmedWrites += 1;
        } catch (error) {
          throw new Error(`Maintenance settings save stopped after ${confirmedWrites} of ${totalWrites} required writes were confirmed. Reload before retrying; remaining rows were not skipped automatically. ${error?.message || ""}`.trim());
        }
      }
      for (const row of changedRateRows.filter((item) => item.id)) {
        const live = liveById.get(row.id);
        const desired = {
          sign_type: row.sign_type,
          action: row.action,
          ...comparableRate(row),
        };
        try {
          await replaceEntityFieldsIfUnchanged({
            entity: MaintenanceActionRate,
            id: row.id,
            expectedUpdatedAt: live?.updated_date || "",
            expectedFields: expectedEntityFields(live || {}, desired),
            nextFields: desired,
            label: `Maintenance action rate ${row.sign_type}/${row.action}`,
          });
          confirmedWrites += 1;
        } catch (error) {
          throw new Error(`Maintenance settings save stopped after ${confirmedWrites} of ${totalWrites} required writes were confirmed. Reload before retrying; remaining rows were not skipped automatically. ${error?.message || ""}`.trim());
        }
      }

      const [freshSettings, freshRates] = await Promise.all([loadAllSettings(), loadAllMaintenanceRates()]);
      const freshSettingsById = new Map((freshSettings || []).filter((row) => row.id).map((row) => [row.id, row]));
      const freshRatesById = new Map((freshRates || []).filter((row) => row.id).map((row) => [row.id, row]));
      const settingVerificationFailures = changedSettingRows.filter((row) => {
        const current = freshSettingsById.get(row.id);
        return !current || String(current.setting_value ?? "") !== String(globalSettings[row.setting_name] ?? "");
      });
      const rateVerificationFailures = changedRateRows.filter((row) => {
        if (row.id) {
          const current = freshRatesById.get(row.id);
          return !current || current.sign_type !== row.sign_type || current.action !== row.action || !sameRate(current, row);
        }
        const matches = (freshRates || []).filter((item) => item.sign_type === row.sign_type && item.action === row.action);
        return matches.length !== 1 || !sameRate(matches[0], row);
      });
      if (settingVerificationFailures.length || rateVerificationFailures.length) {
        const names = [
          ...settingVerificationFailures.map((row) => row.setting_name),
          ...rateVerificationFailures.map((row) => `${row.sign_type}/${row.action}`),
        ];
        throw new Error(`Maintenance settings final verification found concurrent or incomplete changes: ${names.join(", ")}. Reload and review before saving again.`);
      }
      const maintenanceRows = (freshSettings || []).filter((row) => String(row.setting_name || "").startsWith("maintenance_"));
      const settingsMap = Object.fromEntries(maintenanceRows.map((row) => [row.setting_name, row.setting_value ?? ""]));
      setSettingsRows(maintenanceRows);
      setGlobalSettings(settingsMap);
      setOriginalSettings(settingsMap);
      setRates(freshRates || []);
      setOriginalRates(new Map((freshRates || []).map((row) => [`${row.sign_type}|${row.action}`, structuredClone(row)])));
      setMessage(`Saved ${dirtyCount} Maintenance change${dirtyCount === 1 ? "" : "s"}.`);
    } catch (e) {
      // Reload both stores after any failure so a retry never starts from a
      // partially stale browser snapshot.
      try {
        const [freshSettings, freshRates] = await Promise.all([loadAllSettings(), loadAllMaintenanceRates()]);
        const maintenanceRows = (freshSettings || []).filter((row) => String(row.setting_name || "").startsWith("maintenance_"));
        const settingsMap = Object.fromEntries(maintenanceRows.map((row) => [row.setting_name, row.setting_value ?? ""]));
        setSettingsRows(maintenanceRows);
        setGlobalSettings(settingsMap);
        setOriginalSettings(settingsMap);
        setRates(freshRates || []);
        setOriginalRates(new Map((freshRates || []).map((row) => [`${row.sign_type}|${row.action}`, structuredClone(row)])));
      } catch (reloadError) {
        console.error("Maintenance settings reload after save failure also failed:", reloadError);
      }
      setError(e.message || "Could not save Maintenance settings. Admin permission may be required.");
    } finally {
      settingsSaveRef.current = false;
      setSaving(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-400">Loading Maintenance settings…</div>;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-[1280px] mx-auto p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link to="/EstimatorSettings" className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Estimator Settings</Link>
          <Button onClick={saveAll} disabled={saving || dirtyCount === 0} className="h-[32px] bg-[#454545] hover:bg-[#353535] text-white text-[12px] font-semibold disabled:opacity-50"><Save className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : `Save${dirtyCount ? ` (${dirtyCount})` : ""}`}</Button>
        </div>

        <div className="bg-white border border-gray-200 rounded-md px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-teal-100 text-teal-700 flex items-center justify-center"><Wrench className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-bold text-gray-900">Sign Maintenance Settings</h1>
            <p className="text-[10px] text-gray-500">Edits the existing Maintenance Settings and the persisted 123-row sign-type/action labor matrix. Opening this page does not create records.</p>
          </div>
          <div className="hidden md:block text-right text-[10px] text-gray-500">Action-rate rows<br /><b className="text-[14px] text-gray-900">{rates.length}</b></div>
        </div>

        {message && <div className="px-3 py-2 rounded border border-green-200 bg-green-50 text-[11px] text-green-700">{message}</div>}
        {error && <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-[11px] text-red-700">{error}</div>}

        <Tabs defaultValue="rates" className="space-y-4">
          <TabsList className="grid grid-cols-2 md:grid-cols-6 h-auto bg-white border border-gray-200 p-1">
            <TabsTrigger value="rates" className="text-[11px] py-2"><Clock className="w-3.5 h-3.5 mr-1.5" /> Action Rates</TabsTrigger>
            <TabsTrigger value="materials" className="text-[11px] py-2"><Package className="w-3.5 h-3.5 mr-1.5" /> Material Rules</TabsTrigger>
            <TabsTrigger value="labor" className="text-[11px] py-2"><DollarSign className="w-3.5 h-3.5 mr-1.5" /> Labor</TabsTrigger>
            <TabsTrigger value="travel" className="text-[11px] py-2"><MapPin className="w-3.5 h-3.5 mr-1.5" /> Travel</TabsTrigger>
            <TabsTrigger value="minimums" className="text-[11px] py-2">Minimums</TabsTrigger>
            <TabsTrigger value="site" className="text-[11px] py-2">Site Conditions</TabsTrigger>
          </TabsList>

          <TabsContent value="rates" className="mt-0">
            <RatesBySignTypeTab
              rateMap={rateMap}
              isLocked={false}
              onChangeRate={changeRate}
              globalSettings={globalSettings}
              setGlobalSettings={setGlobalSettings}
            />
          </TabsContent>

          <TabsContent value="materials" className="mt-0">
            <MaintenanceMaterialRulesTab />
          </TabsContent>

          <TabsContent value="labor" className="mt-0">
            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="text-[11px] font-bold uppercase tracking-wide text-gray-700">Active Labor Rates</div>
                <div className="text-[10px] text-gray-500 mt-0.5">Service Tech drives action labor. Crew Lead / Helper are used by the Personnel selector.</div>
              </div>
              <div className="p-4 grid sm:grid-cols-3 gap-4">
                {LABOR_FIELDS.map((field) => <Field key={field.key} {...field} value={globalSettings[field.key]} onChange={(value) => setGlobalSettings((prev) => ({ ...prev, [field.key]: value }))} />)}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="travel" className="mt-0">
            <TravelTab globalSettings={globalSettings} setGlobalSettings={setGlobalSettings} isLocked={false} />
          </TabsContent>

          <TabsContent value="minimums" className="mt-0 space-y-3">
            <InactiveNotice text="These migrated minimum-hour values are preserved in Settings, but the current Maintenance calculation engine does not apply them yet. They are shown read-only so they are not mistaken for active pricing controls." />
            <MinimumsTab globalSettings={globalSettings} setGlobalSettings={setGlobalSettings} isLocked />
          </TabsContent>

          <TabsContent value="site" className="mt-0 space-y-3">
            <InactiveNotice text="These migrated site-condition adjustments are preserved, but the current Maintenance service-item model does not currently collect/apply these conditions. They remain read-only until that workflow is deliberately integrated." />
            <SiteConditionsTab globalSettings={globalSettings} setGlobalSettings={setGlobalSettings} isLocked />
          </TabsContent>
        </Tabs>

        <div className="text-[10px] text-gray-400 pb-3">Loaded {settingsRows.length} Maintenance Settings records and {rates.length} MaintenanceActionRate records. Only changed, editable records are written on Save.</div>
      </div>
    </div>
  );
}

function Field({ label, suffix, value, onChange }) {
  return <label className="text-[10px] text-gray-500"><span className="block mb-1">{label}</span><div className="relative"><Input type="number" step="0.01" min="0" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="h-[32px] text-[11px] pr-14" /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-400">{suffix}</span></div></label>;
}

function InactiveNotice({ text }) {
  return <div className="px-3 py-2.5 rounded border border-amber-200 bg-amber-50 text-[10px] text-amber-800 flex gap-2"><Info className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{text}</span></div>;
}
