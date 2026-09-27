import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

check(page.includes("const activeFiltersLoadRef = useRef(0);"),
  "Saved-filter loads have a monotonic request guard.");
const identityEffect = page.split("// Saved-filter selections are user-specific.")[1]?.split("useEffect(() => {")[0] || "";
check(identityEffect.includes("activeFiltersLoadRef.current += 1;"),
  "Identity changes invalidate any older saved-filter request.");
check(identityEffect.includes("setActiveFilters([]);") && identityEffect.includes("setActiveColumnPreset(null);"),
  "Identity changes immediately clear prior-user saved filters and column presets.");
check(identityEffect.includes('current.startsWith("custom_") ? "all" : current'),
  "Identity changes clear only user-specific custom information-filter state.");
check(page.includes("}, [currentUser?.email]);"),
  "Saved-filter identity handling is keyed to the user email rather than unrelated user-object changes.");

const loader = page.split("const loadActiveFilters = async () => {")[1]?.split("\n  };")[0] || "";
check(loader.includes("const requestId = ++activeFiltersLoadRef.current;"),
  "Every saved-filter refresh gets a unique request id.");
check(loader.includes('currentUser?.email?.toLowerCase() || ""'),
  "Saved-filter matching normalizes the current user email.");
check(loader.includes("if (requestId !== activeFiltersLoadRef.current) return;"),
  "A stale async response cannot overwrite a newer user's saved filters.");
check(loader.includes("email?.toLowerCase() === userEmail"),
  "Stored selection email matching is case-insensitive.");
check(loader.includes("setActiveColumnPreset(columnPreset || null);"),
  "Reloading removes a column preset that is no longer selected.");
check(loader.includes('const selectedId = current.slice("custom_".length);') &&
  loader.includes('f.type === "filter" && f.id === selectedId') &&
  loader.includes('? current : "all"'),
  "Reloading clears a custom information filter that is no longer selected.");
check(page.match(/loadActiveFilters\(\);/g)?.length >= 3,
  "Identity initialization and both management-dialog close paths still reload saved selections.");
check(page.includes('activeColumnPreset={activeColumnPreset}') &&
  page.includes('customFilters={activeFilters.filter(f => f.type === "filter")}'),
  "The spreadsheet still receives the selected column preset and custom filters.");

console.log(`Sales saved-filter identity and reload safety: ${checks}/${checks} PASS.`);
