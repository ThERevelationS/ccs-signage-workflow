import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SALES_DATE_FILTER_FIELDS,
  isSalesDateFilterField,
  salesFilterCalendarDay,
  salesDateFilterEquals,
  compareSalesDateFilterRange,
} from "../src/components/sales/salesDateFilterRange.mjs";

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };
const same = (actual, expected, label) => { assert.equal(actual, expected, label); checks += 1; };
const editor = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
const spreadsheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");

// Every date available to saved filters must use calendar comparison, without
// adding timestamps/fields that the filter editor does not offer.
const fieldsSource = editor.split("const FILTER_FIELDS = [")[1]?.split("];")[0];
check(Boolean(fieldsSource), "Filter field catalog must be present");
const configuredDates = [...fieldsSource.matchAll(/value: "([^"]+)", label: "[^"]+", type: "date"/g)]
  .map(([, field]) => field).sort();
same(JSON.stringify([...SALES_DATE_FILTER_FIELDS].sort()), JSON.stringify(configuredDates),
  "Calendar filter field set must exactly match the existing date-typed editor options");
for (const field of configuredDates) {
  check(isSalesDateFilterField(field), `Date filter ${field} must use calendar comparisons`);
}
check(!isSalesDateFilterField("estimate_amount"), "Estimate Amount must retain numeric comparisons");
check(!isSalesDateFilterField("created_date") && !isSalesDateFilterField("updated_date"),
  "Generic record timestamps must never be inferred as trusted Sales filter fields");

same(salesFilterCalendarDay("2026-09-27"), "2026-09-27", "Canonical date accepted");
same(salesFilterCalendarDay("2026-09-27T23:30:05.123-04:00"), "2026-09-27",
  "Saved activity timestamp compares by stored calendar date, not local timezone");
same(salesFilterCalendarDay("2026-09-27T02:15:00Z"), "2026-09-27",
  "UTC timestamp accepted without display timezone conversion");
same(salesFilterCalendarDay("9/27/2026"), "2026-09-27", "Legacy US four-digit cutoff accepted");
same(salesFilterCalendarDay("09/27/26"), "2026-09-27", "Existing two-digit US cutoff means 2026");
same(salesFilterCalendarDay("2/29/2028"), "2028-02-29", "Leap-day cutoff accepted");
same(salesFilterCalendarDay(new Date("2026-09-27T00:00:00Z")), "2026-09-27",
  "Valid date objects have a stable UTC day");
check(salesDateFilterEquals("2026-09-27T23:30:05.123-04:00", "2026-09-27"),
  "Timestamp-backed date filters match a date-only cutoff on the same stored calendar day");
check(salesDateFilterEquals("2026-09-27T02:15:00Z", "09/27/26"),
  "Date equality accepts the existing legacy US cutoff format");
check(!salesDateFilterEquals("2026-09-28T00:00:00Z", "2026-09-27"),
  "Date equality rejects a different calendar day");
check(!salesDateFilterEquals("", "2026-09-27") && !salesDateFilterEquals("2026-09-27", "bad"),
  "Date equality fails closed for missing or invalid values");
for (const invalid of ["", "2026-02-29", "2026-13-01", "2026-09-31", "2026-9-2",
  "2026-09-27Tevil", "2026-09-27T25:00:00Z", "09/27/1899x", "unknown", 20260927, null]) {
  same(salesFilterCalendarDay(invalid), null, `Invalid or ambiguous calendar value rejected: ${String(invalid)}`);
}
check(compareSalesDateFilterRange("2026-09-28", "2026-09-27", "greater_than"),
  "Greater Than distinguishes dates in the same year and month");
check(!compareSalesDateFilterRange("2026-09-26", "2026-09-27", "greater_than"),
  "Greater Than rejects earlier days in same month");
check(compareSalesDateFilterRange("2026-10-01", "2026-09-27", "greater_than"),
  "Greater Than crosses calendar months in same year");
check(compareSalesDateFilterRange("2026-09-26", "2026-09-27", "less_than"),
  "Less Than distinguishes days in the same month");
check(!compareSalesDateFilterRange("2026-10-01", "2026-09-27", "less_than"),
  "Less Than rejects later month");
check(compareSalesDateFilterRange("2025-12-31", "2026-01-01", "less_than"),
  "Less Than crosses calendar years");
check(compareSalesDateFilterRange("2026-09-28T18:30:00Z", "09/27/26", "greater_than"),
  "ISO timestamp and legacy US cutoff compare by calendar day");
check(!compareSalesDateFilterRange("2026-09-27T22:00:00Z", "2026-09-27", "greater_than"),
  "Greater Than is strict; same calendar day is not after its date-only cutoff");
check(!compareSalesDateFilterRange("2026-09-27", "2026-09-27", "less_than"),
  "Less Than is strict; same date is not before itself");
for (const invalid of [null, "", "2026-02-30"]) {
  check(!compareSalesDateFilterRange(invalid, "2026-09-27", "greater_than"),
    "Missing/invalid WorkOrder dates must not accidentally match Greater Than");
  check(!compareSalesDateFilterRange("2026-09-27", invalid, "less_than"),
    "Missing/invalid date cutoffs must not accidentally match Less Than");
}
check(!compareSalesDateFilterRange("2026-09-27", "2026-09-28", "contains"),
  "The date-range helper must fail closed for unsupported operators");

const equalitySource = spreadsheet.split('// Check grouped "is" conditions')[1]?.split('case "contains":')[0];
check(Boolean(equalitySource), "The live spreadsheet equality-operator branch must exist");
check(equalitySource.includes("isSalesDateFilterField(field)") &&
      equalitySource.includes("salesDateFilterEquals(fieldValue, val)"),
  "Grouped Is/Equals filters must use calendar equality for date-typed fields");
check(equalitySource.includes('case "is_not":') &&
      equalitySource.includes("!salesDateFilterEquals(fieldValue, condValue)"),
  "Is Not must use calendar inequality for date-typed fields");
same((equalitySource.match(/salesDateFilterEquals\(fieldValue, value\)/g) || []).length, 2,
  "Is One Of and Is Not One Of must both use calendar equality for date-typed fields");
check(equalitySource.includes("fieldValue == val") && equalitySource.includes("fieldValue != condValue") &&
      equalitySource.includes("fv == value"),
  "Existing non-date equality and membership semantics remain unchanged");

const rangeSource = spreadsheet.split("case \"greater_than\":")[1]?.split('case "not_empty":')[0];
check(Boolean(rangeSource), "The live spreadsheet range-operator branch must exist");
same((rangeSource.match(/isSalesDateFilterField\(condition\.field\)/g) || []).length, 2,
  "Both Greater Than and Less Than must dispatch date fields to the calendar helper");
same((rangeSource.match(/compareSalesDateFilterRange\(fieldValue, condValue, condition\.operator\)/g) || []).length, 2,
  "Both range operators must use the same validated calendar comparison");
check(rangeSource.includes("parseFloat(fieldValue) > parseFloat(condValue)") &&
      rangeSource.includes("parseFloat(fieldValue) < parseFloat(condValue)"),
  "Existing non-date range comparison semantics remain unchanged");
check(editor.includes('placeholder={selectedField?.type === "date" ? "YYYY-MM-DD" : "Value"}') &&
      editor.includes("Date ranges also accept M/D/YYYY or M/D/YY"),
  "Date-typed filter inputs show the supported date format without rewriting old saved values");
check(editor.includes('className="flex flex-wrap gap-1"') &&
      editor.includes('aria-label="Horizontal Sales Pipeline column preview"'),
  "Dense visible checkbox editor and horizontal preview remain intact");

console.log(`Sales custom date range filter regressions: ${checks}/${checks} PASS (source/logic only; browser and live records not tested).`);
