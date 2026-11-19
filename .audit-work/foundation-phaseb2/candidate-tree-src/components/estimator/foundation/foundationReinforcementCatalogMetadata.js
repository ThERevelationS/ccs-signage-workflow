import { foundationInputNumber } from "./foundationGeometryInputs";

export const FOUNDATION_REINFORCEMENT_CATALOG_METADATA_FIELDS = Object.freeze([
  Object.freeze({ key: "rebar_diameter_inches", label: "Nominal bar diameter (in)" }),
  Object.freeze({ key: "rebar_weight_lb_per_ft", label: "Weight (lb/ft)" }),
]);
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

// Keep the authored record separate from temporary text edits. Missing metadata
// stays absent until edited; explicitly clearing a recorded value yields null.
export function createFoundationReinforcementCatalogMetadataDraft(record) {
  return Object.fromEntries(FOUNDATION_REINFORCEMENT_CATALOG_METADATA_FIELDS
    .filter(({ key }) => plain(record) && Object.hasOwn(record, key))
    .map(({ key }) => [key, structuredClone(record[key])]));
}

export function prepareFoundationReinforcementCatalogMetadataDraft(draft) {
  if (!plain(draft)) return {
    ok: false, values: {}, issues: [{ field: "reinforcement_metadata", message: "Reinforcement catalog metadata must be a plain record." }],
  };
  const values = {}, issues = [];
  for (const { key, label } of FOUNDATION_REINFORCEMENT_CATALOG_METADATA_FIELDS) {
    if (!Object.hasOwn(draft, key)) continue;
    const raw = draft[key];
    if (raw == null || (typeof raw === "string" && raw.trim() === "")) { values[key] = null; continue; }
    const number = foundationInputNumber(raw);
    if (number === null || number <= 0) {
      issues.push({ field: key, message: `${label}: enter a finite positive decimal, or leave blank for not recorded.` });
    } else values[key] = number;
  }
  return { ok: issues.length === 0, values, issues };
}
