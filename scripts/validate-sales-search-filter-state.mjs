import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const sheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");

let checks = 0;
const check = (value, message) => {
  assert.ok(value, message);
  checks += 1;
};

const clearBlock = page.split("const clearActiveFilters = () => {")[1]?.split("\n  };")[0] || "";
check(clearBlock.includes('setSearchTerm("");'),
  "Clear Filters clears the active Sales search.");
check(clearBlock.includes('setAttentionFilter("all");') &&
  clearBlock.includes('setFilterStatus("all");') &&
  clearBlock.includes("clearColumnHeaderFilter?.()"),
  "Clear Filters still clears attention, information, and table-column criteria.");
check(page.includes('Boolean(searchTerm.trim()) || attentionFilter !== "all" || filterStatus !== "all" || Boolean(columnHeaderFilter)'),
  "A non-empty search keeps the page-level Clear Filters control visible.");
check(page.includes('aria-label="Clear active Sales search, information, attention, and table column filters"'),
  "Clear Filters accurately describes every criterion it clears.");

check(sheet.includes('const search = searchTerm.trim().toLowerCase();'),
  "Sales search normalizes leading/trailing whitespace before filtering.");
check(sheet.includes("if (search) {"),
  "Whitespace-only search is treated as inactive.");
check(!sheet.includes("const search = searchTerm.toLowerCase();"),
  "Untrimmed search logic cannot silently narrow rows from accidental spaces.");

const informationChange = page.split('<Select value={filterStatus} onValueChange={(value) => {')[1]?.split("}}>")[0] || "";
check(informationChange.includes("setFilterStatus(value);") &&
  !informationChange.includes('setSearchTerm("");'),
  "Choosing a saved/status filter intentionally preserves a visible search so users can combine criteria.");

const attentionChange = page.split("const applyAttentionFilter = (value) => {")[1]?.split("\n  };")[0] || "";
check(attentionChange.includes("setAttentionFilter(value);") &&
  !attentionChange.includes('setSearchTerm("");'),
  "Choosing an attention filter intentionally preserves a visible search for combined filtering.");

console.log(`Sales search/filter clear-state behavior: ${checks}/${checks} PASS.`);
