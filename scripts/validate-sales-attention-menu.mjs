import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SALES_PRIMARY_ATTENTION,
  SALES_MORE_ATTENTION_GROUPS,
  SALES_ALL_ATTENTION,
  salesAttentionOption,
  salesMoreAttentionSelected,
  salesAttentionCount,
  visibleSalesMoreAttentionGroups,
} from "../src/components/sales/salesAttentionMenu.mjs";

let checks = 0;
const check = (result, message) => { assert.ok(result, message); checks++; };
const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");

const originalStripKeys = [
  "needs_attention", "no_next_action", "owner_unassigned", "source_missing",
  "quote_timing_missing", "stage_untracked", "placeholder", "all", "overdue",
  "today", "upcoming", "quote_aged", "near_close", "close_overdue", "stale",
  "activity_untracked", "stage_aged", "mine", "age_90_plus",
];
const supportedKeys = new Set(SALES_ALL_ATTENTION.map((option) => option.key));
check(originalStripKeys.every((key) => supportedKeys.has(key)),
  "Every existing visible attention filter must remain accessible.");
check(["due", "quote_no_followup"].every((key) => supportedKeys.has(key)),
  "Existing click-to-filter KPI actions must remain supported.");
check(supportedKeys.size === SALES_ALL_ATTENTION.length,
  "No duplicate attention choices may create confusing active states.");
check(SALES_PRIMARY_ATTENTION.map((item) => item.key).join() ===
  ["all", "overdue", "today", "upcoming", "needs_attention"].join(),
  "Five primary shortcuts must stay directly visible in priority order.");
check(SALES_MORE_ATTENTION_GROUPS.length === 3 &&
  SALES_MORE_ATTENTION_GROUPS.every((group) => group.items.length > 0),
  "Secondary attention filters must appear in labeled groups.");
for (const option of SALES_ALL_ATTENTION) {
  check(salesAttentionOption(option.key) === option, `The ${option.key} label and count have a stable lookup.`);
  check(typeof option.countKey === "string" && option.countKey.length > 0,
    `The ${option.key} filter must use a verified summary field.`);
}
const summaryBody = page.split("const EMPTY_PIPELINE_SUMMARY = {")[1]?.split("};")[0] ?? "";
check(Boolean(summaryBody), "Existing scoped Sales summary must remain present.");
for (const option of SALES_ALL_ATTENTION) {
  check(summaryBody.includes(`  ${option.countKey}: 0,`),
    `The ${option.key} count must refer only to a real scoped summary field.`);
}
check(SALES_PRIMARY_ATTENTION.every((option) => !salesMoreAttentionSelected(option.key)),
  "Prominent quick shortcuts must not be mislabeled as hidden filters.");
check(SALES_MORE_ATTENTION_GROUPS.every((group) => group.items.every((item) =>
  salesMoreAttentionSelected(item.key))), "Secondary choices must display an active More label.");
check(!salesMoreAttentionSelected("nonexistent"), "Unknown filters must never pretend to be selected.");
check(salesAttentionCount({ overdueCount: 6 }, "overdue") === 6 &&
  salesAttentionCount({ overdueCount: -1 }, "overdue") === 0 &&
  salesAttentionCount({ overdueCount: Infinity }, "overdue") === 0 &&
  salesAttentionCount({}, "overdue") === 0,
  "Counts must use existing finite nonnegative scoped values; missing data must not be fabricated.");
check(salesAttentionCount({ quoteTimingMissingCount: 12 }, "quote_timing_missing") === 12,
  "Missing quote timing count comes from the existing trusted-coverage summary.");
check(salesAttentionCount({ stageAgeMissingCount: 7 }, "stage_untracked") === 7,
  "Stage timing missing count comes from the existing trusted-coverage summary.");
const groupsWithoutTest = visibleSalesMoreAttentionGroups({ placeholderCount: 0 }, "all");
check(!groupsWithoutTest.some((group) => group.items.some((item) => item.key === "placeholder")),
  "Test-record filter should not clutter the menu when there are no test records.");
const groupsWithTest = visibleSalesMoreAttentionGroups({ placeholderCount: 2 }, "all");
check(groupsWithTest.some((group) => group.items.some((item) => item.key === "placeholder")),
  "Test-record filter must appear when test records are reported.");
check(visibleSalesMoreAttentionGroups({ placeholderCount: 0 }, "placeholder")
  .some((group) => group.items.some((item) => item.key === "placeholder")),
  "Active Test Records filter remains visible even if its count later reaches zero.");
check(page.includes('aria-label="Quick Sales attention filters"') &&
  page.includes("SALES_PRIMARY_ATTENTION.map((option)"),
  "Five primary choices must render as wrapping accessible quick buttons.");
check(page.includes('aria-pressed={attentionFilter === option.key}') &&
  page.includes('onClick={() => applyAttentionFilter(option.key)}'),
  "Quick filter buttons must update the existing filter state and show selection.");
check(page.includes('visibleSalesMoreAttentionGroups(pipelineSummary, attentionFilter).map((group, index)') &&
  page.includes('onSelect={() => applyAttentionFilter(option.key)}'),
  "Secondary grouped filters must invoke the existing filter transition.");
check(page.includes('selectedMoreAttention ? `More: ${selectedMoreAttention.label}`') &&
  page.includes('title={selectedMoreAttention?.label || "All other Sales attention filters"}'),
  "When a hidden filter is active, users must see its selected name.");
check(page.includes('aria-label="Clear active Sales information and attention filters"') &&
  page.includes('hasActiveFilters &&') &&
  page.includes('onClick={() => applyAttentionFilter("all")}'),
  "Clear filters must be visible for active saved/attention filters and reset both.");
check(page.includes('const quickAttentionVisible = !showDuplicateCleanup && !["insights", "daily"].includes(viewMode)') &&
  page.includes('(recordScope === "current" || recordScope === "all")'),
  "Quick filters must remain hidden in unrelated workspaces and views.");
check(!page.includes('title="Sales attention filters. Swipe or scroll horizontally to see every filter."'),
  "The old overlong horizontal filter strip must be removed.");
check(page.includes('aria-label="Information Filters"') &&
  page.includes('aria-label="Column Filters"') &&
  page.includes('aria-label="Sales Pipeline tools"'),
  "Saved information filters, column editor and protected Tools menu must remain accessible.");
console.log(`Sales attention toolbar preservation, grouping and coverage: ${checks}/${checks} PASS.`);
