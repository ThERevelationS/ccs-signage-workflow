import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const sheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

check(page.includes("const activeSavedDefinitionRef = useRef({ information: null, column: null });"),
  "Page keeps a baseline for the currently active saved definitions.");
check(page.includes("activeSavedDefinitionRef.current = { information: null, column: null };"),
  "Identity/session changes discard prior-user saved-definition baselines.");

const loader = page.split("const loadActiveFilters = async () => {")[1]?.split("\n  };")[0] || "";
check(loader.includes("const previousDefinitions = activeSavedDefinitionRef.current;"),
  "Each successful live refresh compares against the previously applied definitions.");
check(loader.includes("conditions: JSON.stringify(savedCustomFilter.conditions || [])"),
  "Active custom Information Filter conditions are fingerprinted.");
check(loader.includes("layout: JSON.stringify(restoredColumn.column_settings || [])"),
  "Active Column Filter layout is fingerprinted.");
check(loader.includes("previousDefinitions.information.id === nextInformationDefinition?.id"),
  "Information definition changes are compared only when the same saved filter remains active.");
check(loader.includes("previousDefinitions.column.id === nextColumnDefinition?.id"),
  "Column definition changes are compared only when the same preset remains active.");
check(loader.includes("previousDefinitions.information.conditions !== nextInformationDefinition.conditions"),
  "Condition changes are detected separately from name-only edits.");
check(loader.includes("previousDefinitions.information.name !== nextInformationDefinition.name"),
  "Information Filter renames are detected without treating them as condition changes.");
check(loader.includes("previousDefinitions.column.layout !== nextColumnDefinition.layout"),
  "Column layout changes are detected separately from name-only edits.");
check(loader.includes("previousDefinitions.column.name !== nextColumnDefinition.name"),
  "Column Filter renames are detected.");
check(loader.includes("Rows were re-evaluated."),
  "Condition edits explicitly tell the user that row membership was re-evaluated.");
check(loader.includes("The table layout was refreshed."),
  "Column-layout edits explicitly tell the user the table layout changed.");
check(loader.includes("activeSavedDefinitionRef.current = {"),
  "The applied live definitions become the next comparison baseline.");

const sessionKey = sheet.split("const liveViewSessionKey = JSON.stringify({")[1]?.split("\n  });")[0] || "";
check(sessionKey.includes("customConditions: activeCustomFilterForSession?.conditions || null"),
  "Active custom conditions participate in the live-view session key.");
check(!sessionKey.includes("name"),
  "Name-only saved-filter edits do not release locally pinned rows.");
check(!sessionKey.includes("activeColumnPreset") && !sessionKey.includes("column_settings"),
  "Column layout/name edits do not release locally pinned rows because they do not change row membership.");

const sessionEffect = sheet.split("const liveViewSessionKeyRef = useRef(liveViewSessionKey);")[1]?.split("\n\n  const { trackChange }")[0] || "";
check(sessionEffect.includes("releaseLiveEditPins();"),
  "A row-membership session-key change releases local pins for immediate re-evaluation.");

const filterBlock = sheet.split('if (filterStatus.startsWith("custom_")) {')[1]?.split("\n      }")[0] || "";
check(filterBlock.includes("customFilters.find") && filterBlock.includes("applyCustomFilter(viewWo, customFilter.conditions)"),
  "Updated custom conditions directly drive visible row membership.");

check(sheet.includes("() => getVisibleSalesColumnIds(activeColumnPreset)") &&
  sheet.includes("[activeColumnPreset]"),
  "Updated active Column Filter objects immediately recompute the visible table layout.");

check(page.includes('{activeFilters.filter(f => f.type === "filter").map(filter => (') &&
  page.includes("{filter.name}"),
  "Updated Information Filter names render from the refreshed live definitions.");
check(page.includes('{activeFilters.filter(f => f.type === "column_preset").map(preset => (') &&
  page.includes("{preset.name}"),
  "Updated Column Filter names render from the refreshed live definitions.");

console.log("Sales active saved-filter live updates: " + checks + "/" + checks + " PASS.");
