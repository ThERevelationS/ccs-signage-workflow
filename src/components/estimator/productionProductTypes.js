import { base44 } from "@/api/base44Client";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import { staffEntities } from "@/components/staff/staffEntities";

// Production/SIP owns this taxonomy in GlobalSettings. Estimator Products only
// reference one of these values; they never create a parallel Product Type list.
export async function loadProductionProductTypes() {
  const setting = await loadSingleGlobalSetting({
    entity: staffEntities.GlobalSettings,
    settingKey: "productTypes",
    label: "Estimator production product types",
  }).catch(() => null);
  const items = setting?.setting_value?.items;
  if (!Array.isArray(items)) return [];
  return [...new Set(items.map((value) => String(value || "").trim()).filter(Boolean))];
}