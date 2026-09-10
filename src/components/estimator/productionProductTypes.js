import { base44 } from "@/api/base44Client";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";

// Production/SIP owns this taxonomy in GlobalSettings. Estimator Products only
// reference one of these values; they never create a parallel Product Type list.
export async function loadProductionProductTypes() {
  const setting = await loadSingleGlobalSetting({
    entity: base44.entities.GlobalSettings,
    settingKey: "productTypes",
    label: "Estimator production product types",
  }).catch(() => null);
  const items = setting?.setting_value?.items;
  if (!Array.isArray(items)) return [];
  return [...new Set(items.map((value) => String(value || "").trim()).filter(Boolean))];
}
