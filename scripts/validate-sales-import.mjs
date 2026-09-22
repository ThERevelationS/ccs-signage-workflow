import {
  parseSalesImportRows,
  validateSalesImportHeaders,
  buildExistingImportIndexes,
  resolveSalesImportMatch,
  buildSalesImportPlan,
  normalizeImportDate,
  normalizeImportNumber,
  summarizeSalesImportPlans,
} from "../base44/shared/salesImportUtils.mjs";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const today = "2026-09-22";

function parseOne(row) {
  const parsed = parseSalesImportRows([row], { todayStamp: today });
  assert(parsed.validRows.length === 1, `Expected one valid row: ${JSON.stringify(parsed.invalidRows)}`);
  return parsed.validRows[0];
}

const roundTrip = parseOne({
  Customer: "Acme Signs",
  "Sales Status": "Follow Up",
  "Est/Inv @": " 12345 ",
  "Estimate Amount": "$12,450.50",
  Probability: "70%",
  "Date Estimate Sent to Customer": "9/20/2026",
  Notes: "Lobby sign",
});
assert(roundTrip.incoming.sales_status === "follow_up", "Sales Status round-trip mapping failed.");
assert(roundTrip.incoming.est_inv_at === "12345", "Est/Inv trimming failed.");
assert(roundTrip.incoming.estimate_amount === 12450.5, "Currency parsing failed.");
assert(roundTrip.incoming.probability === 70, "Probability parsing failed.");
assert(roundTrip.incoming.date_estimate_sent === "2026-09-20", "Date parsing failed.");

const headers = validateSalesImportHeaders(["Customer", "Sales Status", "Est/Inv @"]);
assert(headers.errors.length === 0, "Recognized Customer header should pass.");
assert(headers.warnings.length === 0, "Stable identity header should suppress fallback warning.");
assert(validateSalesImportHeaders(["Sales Status"]).errors.length === 1, "Missing Customer header must fail.");
assert(validateSalesImportHeaders(["Customer", "Notes"]).warnings.length === 1, "Missing stable identity should warn.");

const offsetRows = parseSalesImportRows(
  [{ Customer: "Offset Co", "Est/Inv @": "77" }],
  { todayStamp: today, rowNumberBase: 6 },
);
assert(offsetRows.validRows[0].rowNumber === 6, "Header-row offset must preserve real spreadsheet row numbers.");

const duplicateRows = parseSalesImportRows([
  { Customer: "Acme", "Est/Inv @": "500" },
  { Customer: "Acme", "Est/Inv @": "500" },
], { todayStamp: today });
assert(duplicateRows.validRows.length === 0 && duplicateRows.invalidRows.length === 2, "Duplicate spreadsheet identities must be blocked.");

const existing = {
  id: "wo-1",
  client_name: "Acme Signs",
  title: "Lobby sign",
  est_inv_at: "12345",
  sales_status: "follow_up",
  in_pipeline: true,
  estimate_amount: 12000,
  lead_source: "Referral",
  updated_date: "2026-09-22T12:00:00.000Z",
  sales_import_snapshot: {
    client_name: "Acme Signs",
    title: "Lobby sign",
    est_inv_at: "12345",
    estimate_amount: 12000,
    lead_source: "Referral",
    sales_status: "follow_up",
  },
};
const match = resolveSalesImportMatch(roundTrip, buildExistingImportIndexes([existing]));
assert(match.kind === "matched" && match.record.id === "wo-1", "Stable Est/Inv match failed.");

const updatePlan = buildSalesImportPlan(roundTrip, match, { nowIso: "2026-09-22T13:00:00.000Z" });
assert(updatePlan.kind === "update", "Changed spreadsheet row should produce an update plan.");
assert(updatePlan.nextFields.estimate_amount === 12450.5, "Changed estimate amount missing from plan.");
assert(updatePlan.nextFields.sales_last_activity_at, "Verified imported Sales activity should stamp sales_last_activity_at.");

const firstSyncExisting = { ...existing, id: "wo-first-sync" };
delete firstSyncExisting.sales_import_snapshot;
const firstSyncRow = parseOne({ Customer: "Acme Signs", "Est/Inv @": "12345", "Estimate Amount": "12000" });
const firstSyncPlan = buildSalesImportPlan(
  firstSyncRow,
  resolveSalesImportMatch(firstSyncRow, buildExistingImportIndexes([firstSyncExisting])),
  { nowIso: "2026-09-22T13:00:00.000Z" },
);
assert(firstSyncPlan.firstSync === true, "Existing records without an import snapshot must be labeled first sync.");
assert(summarizeSalesImportPlans([firstSyncPlan], []).baseline === 1, "First-sync summary count failed.");

const legacyExisting = { ...existing, id: "wo-legacy", in_pipeline: false };
const legacyRow = parseOne({ Customer: "Acme Signs", "Est/Inv @": "12345", "Sales Status": "Lead" });
const legacyPlan = buildSalesImportPlan(
  legacyRow,
  resolveSalesImportMatch(legacyRow, buildExistingImportIndexes([legacyExisting])),
  { nowIso: "2026-09-22T13:00:00.000Z" },
);
assert(legacyPlan.kind === "adoption", "Legacy WorkOrders must not be promoted into the modern Sales pipeline implicitly.");
assert(summarizeSalesImportPlans([legacyPlan], []).adoption === 1, "Legacy adoption summary count failed.");

const legacyExisting = { ...existing, id: "wo-legacy", in_pipeline: false };
const legacyRow = parseOne({ Customer: "Acme Signs", "Est/Inv @": "12345", "Sales Status": "Lead" });
const legacyPlan = buildSalesImportPlan(
  legacyRow,
  resolveSalesImportMatch(legacyRow, buildExistingImportIndexes([legacyExisting])),
  { nowIso: "2026-09-22T13:00:00.000Z" },
);
assert(legacyPlan.kind === "adoption", "Legacy WorkOrders must not be promoted into the modern Sales pipeline implicitly.");
assert(summarizeSalesImportPlans([legacyPlan], []).adoption === 1, "Legacy adoption summary count failed.");

const blankPreserves = parseOne({
  Customer: "Acme Signs",
  "Est/Inv @": "12345",
  Source: "",
});
const blankPlan = buildSalesImportPlan(
  blankPreserves,
  resolveSalesImportMatch(blankPreserves, buildExistingImportIndexes([existing])),
  { nowIso: "2026-09-22T13:00:00.000Z" },
);
assert(blankPlan.kind === "unchanged", "Blank spreadsheet cells should preserve existing Base44 values.");

const localEdit = { ...existing, estimate_amount: 12500 };
const staleRow = parseOne({ Customer: "Acme Signs", "Est/Inv @": "12345", "Estimate Amount": "13000" });
const stalePlan = buildSalesImportPlan(
  staleRow,
  resolveSalesImportMatch(staleRow, buildExistingImportIndexes([localEdit])),
  { nowIso: "2026-09-22T13:00:00.000Z" },
);
assert(stalePlan.kind === "conflict", "Stale spreadsheet must not overwrite a newer Base44 edit.");

const changedNotes = parseOne({ Customer: "Acme Signs", Notes: "Changed notes" });
const changedNotesMatch = resolveSalesImportMatch(changedNotes, buildExistingImportIndexes([existing]));
assert(changedNotesMatch.kind === "ambiguous", "Changed Notes without stable identity must not create a duplicate.");

const ambiguousEst = parseOne({ Customer: "Acme Signs", "Est/Inv @": "12345" });
const ambiguousMatch = resolveSalesImportMatch(
  ambiguousEst,
  buildExistingImportIndexes([existing, { ...existing, id: "wo-2" }]),
);
assert(ambiguousMatch.kind === "ambiguous", "Duplicate existing Est/Inv identities must be blocked.");

const wonWithoutClose = parseOne({ Customer: "Win Co", "Est/Inv @": "900", "Sales Status": "Won" });
const invalidWon = buildSalesImportPlan(wonWithoutClose, { kind: "new" }, { nowIso: "2026-09-22T13:00:00.000Z" });
assert(invalidWon.kind === "invalid", "Won rows must require Close Date.");

const lostWithoutReason = parseOne({ Customer: "Lost Co", "Est/Inv @": "901", "Sales Status": "Lost", "Close Date": "9/21/2026" });
const invalidLost = buildSalesImportPlan(lostWithoutReason, { kind: "new" }, { nowIso: "2026-09-22T13:00:00.000Z" });
assert(invalidLost.kind === "invalid", "Lost rows must require Lost Reason.");

const validLost = parseOne({
  Customer: "Lost Co",
  "Est/Inv @": "901",
  "Sales Status": "Lost",
  "Close Date": "9/21/2026",
  "Lost Reason": "Budget",
  "Follow Up Date": "9/30/2026",
});
const lostPlan = buildSalesImportPlan(validLost, { kind: "new" }, { nowIso: "2026-09-22T13:00:00.000Z" });
assert(lostPlan.kind === "create", "Valid Lost row should be creatable.");
assert(lostPlan.nextFields.follow_up_date === "", "Closed outcomes must not retain active follow-up.");

const futureQuote = parseSalesImportRows([{
  Customer: "Future Co",
  "Est/Inv @": "902",
  "Date Estimate Sent to Customer": "9/23/2026",
}], { todayStamp: today });
assert(futureQuote.invalidRows.length === 1, "Future quote sent dates must be blocked.");

assert(normalizeImportNumber("(1,234.50)").value === -1234.5, "Accounting number parsing failed.");
assert(normalizeImportDate("02/29/2024").value === "2024-02-29", "Leap-day parsing failed.");
assert(normalizeImportDate("02/29/2025").error, "Invalid leap-day should fail.");

console.log("Sales importer regression validation: PASS");
