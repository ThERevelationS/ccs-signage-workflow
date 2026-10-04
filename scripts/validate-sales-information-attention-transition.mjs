import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

const attentionBlock = page.split("const applyAttentionFilter = (value) => {")[1]?.split("\n  };")[0] || "";
check(attentionBlock.includes("setAttentionFilter(value);"), "Attention selection applies the requested attention mode.");
check(attentionBlock.includes('setFilterStatus("all");'), "Attention selection clears Information Filter state.");
check(attentionBlock.includes('persistFilterPreferences({ informationFilter: "all", attention: value });'),
  "Attention selection persists the mutually-exclusive state.");

const informationBlock = page.split("const applyInformationFilter = (value) => {")[1]?.split("\n  };")[0] || "";
check(informationBlock.includes("setFilterStatus(value);"), "Information selection applies the requested information filter.");
check(informationBlock.includes('setAttentionFilter("all");'), "Information selection clears Attention state.");
check(informationBlock.includes('persistFilterPreferences({ informationFilter: value, attention: "all" });'),
  "Information selection persists the mutually-exclusive state.");

const informationSelect = page.split('<Select value={filterStatus} onValueChange={(value) => {')[1]?.split("}}>")[0] || "";
check(informationSelect.includes('if (value === "manage_filters")'), "Manage Filters remains a non-filter action.");
check(informationSelect.includes("setShowCustomFilterDialog(true);"), "Manage Filters still opens the management dialog.");
check(informationSelect.includes("applyInformationFilter(value);"), "Normal Information choices use the symmetric transition helper.");

check(page.includes('onClick={() => applyAttentionFilter(option.key)}'),
  "Quick Attention buttons continue through the symmetric Attention transition.");
check(page.includes('onSelect={() => applyAttentionFilter(option.key)}'),
  "More Attention choices continue through the symmetric Attention transition.");

check(!informationBlock.includes('setSearchTerm("")'), "Information filters still combine intentionally with visible search.");
check(!informationBlock.includes("clearColumnHeaderFilter"), "Information filters still combine intentionally with table-header filtering.");
check(!attentionBlock.includes('setSearchTerm("")'), "Attention filters still combine intentionally with visible search.");
check(!attentionBlock.includes("clearColumnHeaderFilter"), "Attention filters still combine intentionally with table-header filtering.");

console.log("Sales Information/Attention mutual exclusion: " + checks + "/" + checks + " PASS.");
