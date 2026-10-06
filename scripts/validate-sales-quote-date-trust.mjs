import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getQuoteAgeDays,
  getQuoteAgingState,
  getQuoteSentDate,
  hasTrustworthyQuoteSentDate,
} from "../src/components/sales/salesQuoteAging.js";
import { resolvePipelineLifecycleDates } from "../src/components/estimator/pipelineStatus.js";
import { SALES_SYNC_ALLOWED_FIELDS } from "../base44/shared/smartsheetSalesSafety.mjs";

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };
const same = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks += 1; };

const today = new Date(2026, 9, 5);
const legacy = {
  sales_status: "quoted",
  date_estimate_sent: "2026-09-20",
};
same(hasTrustworthyQuoteSentDate(legacy), false,
  "Legacy quote dates without verification are not trustworthy.");
same(getQuoteSentDate(legacy), "",
  "Legacy quote dates stay excluded from quote aging.");
same(getQuoteAgeDays(legacy, today), null,
  "Legacy quote dates do not produce an age.");
same(getQuoteAgingState(legacy, today).rawSentDate, "2026-09-20",
  "Legacy raw date remains available for display/history.");
same(getQuoteAgingState(legacy, today).tracked, false,
  "Legacy raw date is treated as Quote Timing Missing.");

const verified = {
  ...legacy,
  sales_quote_sent_verified_at: "2026-10-02T00:26:24.284Z",
};
same(hasTrustworthyQuoteSentDate(verified), true,
  "Verification timestamp makes the current quote date trustworthy.");
same(getQuoteSentDate(verified), "2026-09-20",
  "Verified date is returned for aging.");
same(getQuoteAgeDays(verified, today), 15,
  "Verified quote age is computed from the actual sent date.");
same(getQuoteAgingState(verified, today).aged, true,
  "Verified quote reaches the 14-day review threshold.");

same(getQuoteAgeDays({
  sales_status: "follow_up",
  date_estimate_sent: "2026-10-01",
  sales_quote_sent_verified_at: "2026-10-01T16:00:00Z",
}, today), 4, "Follow Up uses verified quote timing.");

same(getQuoteAgeDays({
  sales_status: "lead",
  date_estimate_sent: "2026-10-01",
  sales_quote_sent_verified_at: "2026-10-01T16:00:00Z",
}, today), null, "Lead records do not enter quote aging.");

same(getQuoteAgeDays({
  sales_status: "quoted",
  date_estimate_sent: "2026-10-06",
  sales_quote_sent_verified_at: "2026-10-05T16:00:00Z",
}, today), null, "Future quote dates never produce quote age.");

same(getQuoteAgeDays({
  sales_status: "quoted",
  date_estimate_sent: "2026-02-30",
  sales_quote_sent_verified_at: "2026-02-28T16:00:00Z",
}, today), null, "Invalid calendar dates never produce quote age.");

same(resolvePipelineLifecycleDates({
  estimateStatus: "sent",
  previousEstimateStatus: "calculated",
  existingDateEstimateSent: "",
  existingQuoteSentVerifiedAt: "",
  today: "2026-10-05",
}), { date_estimate_sent: "2026-10-05" },
"Real estimator transition into sent supplies a quote date for server-side verification.");

same(resolvePipelineLifecycleDates({
  estimateStatus: "sent",
  previousEstimateStatus: "sent",
  existingDateEstimateSent: "2026-10-01",
  existingQuoteSentVerifiedAt: "",
  today: "2026-10-05",
  issuedQuoteDate: "2026-10-01",
  issuedQuoteVersion: 1,
}), { date_estimate_sent: "2026-10-01" },
"Matching issued-quote evidence can reconfirm an existing unverified date.");

same(resolvePipelineLifecycleDates({
  estimateStatus: "sent",
  previousEstimateStatus: "sent",
  existingDateEstimateSent: "2026-09-30",
  existingQuoteSentVerifiedAt: "",
  today: "2026-10-05",
  issuedQuoteDate: "2026-10-01",
  issuedQuoteVersion: 1,
}), {},
"Estimator evidence never guesses over a different stored legacy date.");

same(resolvePipelineLifecycleDates({
  estimateStatus: "sent",
  previousEstimateStatus: "sent",
  existingDateEstimateSent: "2026-10-01",
  existingQuoteSentVerifiedAt: "2026-10-02T00:00:00Z",
  today: "2026-10-05",
  issuedQuoteDate: "2026-10-01",
  issuedQuoteVersion: 1,
}), {},
"Already verified quote dates are not re-stamped.");

check(!SALES_SYNC_ALLOWED_FIELDS.includes("date_estimate_sent"),
  "Smartsheet remains unable to establish quote-date trust.");

const schema = readFileSync("base44/entities/WorkOrder.jsonc", "utf8");
check(schema.includes('"sales_quote_sent_verified_at"') &&
      schema.includes("must not drive quote-aging analytics"),
  "WorkOrder stores durable quote-date verification provenance.");

const historyBackend = readFileSync("base44/functions/fieldHistoryAction/entry.ts", "utf8");
check(historyBackend.includes("patch.sales_quote_sent_verified_at=nextQuoteDate ? new Date().toISOString() : ''"),
  "Tracked WorkOrder saves stamp or clear quote-date verification server-side.");
check(historyBackend.includes("Quote sent date cannot be in the future.") &&
      historyBackend.includes("Quote sent date must be a valid calendar date."),
  "Backend rejects future and invalid quote dates before verification.");
check(!historyBackend.match(/optionalFields[^\n]*sales_quote_sent_verified_at/),
  "Clients cannot directly edit the protected verification marker.");

const sheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
check(sheet.includes('changedField === "date_estimate_sent" && quoteDateVerificationRequested'),
  "Sales UI can confirm an already stored legacy date without changing it.");
check(sheet.includes('"sales_quote_sent_verified_at"') &&
      sheet.includes("saved.sales_quote_sent_verified_at"),
  "Sales UI treats quote verification as internal state returned by the server.");
check(sheet.includes("JSON.stringify(currentWo[changedField]) !== JSON.stringify(mergedUpdates[changedField])"),
  "Confirming an unchanged legacy date does not create a fake old-value-to-same-value CellHistory row.");

const dialog = readFileSync("src/components/sales/SalesOpportunityDialog.jsx", "utf8");
check(dialog.includes("Stored legacy quote date is not verified for aging.") &&
      dialog.includes("Confirm stored date"),
  "Opportunity detail explains and can explicitly confirm an unverified legacy date.");

const estimatorSync = readFileSync("src/components/estimator/customerSync.js", "utf8");
check(estimatorSync.includes("existingQuoteSentVerifiedAt: existing?.sales_quote_sent_verified_at") &&
      estimatorSync.includes("sales_quote_sent_verified_at: new Date().toISOString()"),
  "Estimator synchronization can establish verification for issued quotes and new records.");

console.log("Sales quote-date trust/provenance: " + checks + "/" + checks + " PASS.");
