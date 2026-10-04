import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const persistence = readFileSync("src/components/sales/salesFilterPersistence.js", "utf8");
const backend = readFileSync("base44/functions/manageSalesFilters/entry.ts", "utf8");
const schema = readFileSync("base44/entities/AuthorizedEmail.jsonc", "utf8");

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };
const count = (haystack, needle) => haystack.split(needle).length - 1;

check(schema.includes('"sales_pipeline_preferences"') &&
      schema.includes('"information_filter"') &&
      schema.includes('"attention_filter"') &&
      schema.includes('"column_preset_id"'),
  "AuthorizedEmail must store one user-specific Sales Pipeline preference object");

check(backend.includes("if (action === 'preferences_get')") &&
      backend.includes("actor?.sales_pipeline_preferences"),
  "Authenticated Sales backend must expose only the signed-in user's saved preferences");
check(backend.includes("if (action === 'preferences_set')") &&
      backend.includes("saveSalesPipelinePreferences(AuthorizedEmail, actor, body?.preferences)"),
  "Authenticated Sales backend must save preferences against the signed-in AuthorizedEmail record");
check(backend.includes("AuthorizedEmail.get(actor?.id)") &&
      backend.includes("{ id: current.id, updated_date: current.updated_date }"),
  "Preference writes must use the authenticated user ID and optimistic concurrency");
check(backend.includes("SALES_INFORMATION_FILTERS") &&
      backend.includes("SALES_ATTENTION_FILTERS") &&
      backend.includes("informationValid") &&
      backend.includes("columnValid"),
  "Backend must sanitize persisted filter and column identifiers");
check(!backend.includes("selected_by: next") || backend.includes("sales_pipeline_preferences: next"),
  "Active preference persistence must be separate from preset availability membership");

check(persistence.includes('action: "preferences_get"') &&
      persistence.includes('action: "preferences_set"') &&
      count(persistence, "requireSessionToken(sessionToken, label)") >= 2,
  "Frontend preference helpers must use the authenticated Sales backend");

check(page.includes('const { isRegistered, currentUser, sessionToken } = useAuth();'),
  "Sales page must restore preferences from the custom Sign Shop session");
check(page.includes("preferenceSaveChainRef = useRef(Promise.resolve())"),
  "Rapid preference writes must be serialized");
check(page.includes('preferenceIdentityRef = useRef("")') &&
      page.includes("preferenceIdentityRef.current = `${String(currentUser?.email") &&
      page.includes("if (preferenceIdentityRef.current !== queuedIdentity) return undefined") &&
      page.includes("sessionToken: queuedSessionToken"),
  "Queued preference writes must be discarded after the authenticated identity/session changes");
check(page.includes("loadSalesPipelinePreferencesSafely({ sessionToken") &&
      page.includes("Promise.all(["),
  "Saved presets and active preferences must load together on login");
check(page.includes('savedInformation.startsWith("custom_")') &&
      page.includes('selected.some((filter) => filter.type === "filter"'),
  "A saved custom Information Filter must restore only while still available to that user");
check(page.includes('selected.find((filter) => filter.type === "column_preset"') &&
      page.includes('column_preset_id'),
  "A saved Column Filter must restore only while still available to that user");
check(page.includes("salesAttentionOption(savedAttention) ? savedAttention : \"all\""),
  "Unknown/stale attention preferences must fail closed to All");
check(page.includes('["all", "lead", "quoted", "follow_up", "on_hold"].includes(savedInformation)'),
  "Current Pipeline login must not restore an outcome-only Won/Lost status into the active workspace");

check(page.includes('persistFilterPreferences({ informationFilter: value, attention: "all" })'),
  "Explicit Information Filter selections must persist while clearing the alternate attention mode");
check(page.includes('persistFilterPreferences({ informationFilter: "all", attention: value })'),
  "Explicit attention-filter selections must persist and preserve the existing mutual-exclusion behavior");
check(page.includes('persistFilterPreferences({ columnPresetId: "default" })') &&
      page.includes('persistFilterPreferences({ columnPresetId: preset.id })'),
  "Default and custom Column Filter selections must both persist");
check(page.includes('persistFilterPreferences({ informationFilter: status, attention: "all" })'),
  "Outcome KPI filter buttons must save their selected status through the shared fresh-drilldown path");

check(page.includes("setRecordScope(value);") &&
      page.includes('setAttentionFilter("all");') &&
      page.includes('setFilterStatus("all");'),
  "Workspace changes must retain their temporary UI reset behavior");
const workspaceBlock = page.split("setRecordScope(value);")[1]?.split("if (value === \"history\"")[0] ?? "";
check(!workspaceBlock.includes("persistFilterPreferences"),
  "Temporary workspace-driven resets must not erase the user's persisted filter choices");

check(page.includes('aria-label="Horizontal Sales Pipeline column preview"') === false,
  "Sales page itself should not duplicate the column-preview implementation");

console.log("Sales user filter preference persistence: " + checks + "/" + checks + " PASS.");
