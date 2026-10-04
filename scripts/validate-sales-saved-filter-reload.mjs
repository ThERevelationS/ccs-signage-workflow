import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

check(page.includes("const activeFiltersLoadRef = useRef(0);"),
  "Saved-filter loads have a monotonic request guard.");
const identityEffect = page.split("// Saved-filter selections and active filter preferences are user-specific.")[1]?.split("\n\n  const runSaveAndSync")[0] || "";
check(identityEffect.includes("activeFiltersLoadRef.current += 1;"),
  "Identity changes invalidate any older saved-filter request.");
check(identityEffect.includes("setActiveFilters([]);") && identityEffect.includes("setActiveColumnPreset(null);"),
  "Identity changes immediately clear prior-user saved filters and column presets.");
check(identityEffect.includes('setFilterStatus("all");') && identityEffect.includes('setAttentionFilter("all");'),
  "Identity/session changes fail closed by clearing active information and attention filters.");
check(page.includes("}, [currentUser?.email, sessionToken]);"),
  "Saved-filter identity handling is keyed to the authenticated email and session rather than unrelated user-object changes.");

const loader = page.split("const loadActiveFilters = async () => {")[1]?.split("\n  };")[0] || "";
check(loader.includes("const requestId = ++activeFiltersLoadRef.current;"),
  "Every saved-filter refresh gets a unique request id.");
check(loader.includes('currentUser?.email?.toLowerCase() || ""'),
  "Saved-filter matching normalizes the current user email.");
check(loader.includes("if (requestId !== activeFiltersLoadRef.current) return;"),
  "A stale async response cannot overwrite a newer user's saved filters.");
check(loader.includes("email?.toLowerCase() === userEmail"),
  "Stored selection email matching is case-insensitive.");
check(loader.includes('const savedColumnId = String(preferences?.column_preset_id || "default");') &&
  loader.includes('selected.find((filter) => filter.type === "column_preset" && filter.id === savedColumnId) || null') &&
  loader.includes("setActiveColumnPreset(restoredColumn);"),
  "Reloading restores only a selected column preset and otherwise clears it.");
check(loader.includes('const savedInformation = String(preferences?.information_filter || "all");') &&
  loader.includes('selected.some((filter) => filter.type === "filter" && filter.id === savedInformation.slice("custom_".length))') &&
  loader.includes("resolveRestoredSalesFilterModes(restoredInformation, restoredAttention)") &&
  loader.includes("setFilterStatus(restoredModes.informationFilter);"),
  "Reloading restores a selected custom information filter through the mutually-exclusive restore normalizer.");
check(page.match(/loadActiveFilters\(\);/g)?.length >= 3,
  "Identity initialization and both management-dialog close paths still reload saved selections.");
check(page.includes('activeColumnPreset={activeColumnPreset}') &&
  page.includes('customFilters={activeFilters.filter(f => f.type === "filter")}'),
  "The spreadsheet still receives the selected column preset and custom filters.");

console.log(`Sales saved-filter identity and reload safety: ${checks}/${checks} PASS.`);
