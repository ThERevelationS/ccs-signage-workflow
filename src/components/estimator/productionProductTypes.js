import { base44 } from "@/api/base44Client";

// Production/SIP owns this taxonomy in GlobalSettings. Estimator Products only
// reference one of these values; they never create a parallel Product Type list.
export async function loadProductionProductTypes() {
  const rows = await base44.entities.GlobalSettings.filter({ setting_key: "productTypes" }).catch(() => []);
  const items = rows?.[0]?.setting_value?.items;
  if (!Array.isArray(items)) return [];
  return [...new Set(items.map((value) => String(value || "").trim()).filter(Boolean))];
}
