import assert from "node:assert/strict";
import {
  DEFAULT_SALES_LEAD_SOURCES,
  buildSmartsheetVocabularyReview,
  formatSmartsheetVocabularyReview,
} from "../src/components/admin/smartsheetVocabularyReviewModel.js";

function column(field, options, validation = false) {
  return { field, status: "matched", matches: [{ id: field, options, validation }] };
}
const liveMappingAnalysis = {
  sales: {
    status: "ready",
    analysis: { fields: [
      column("lead_source", ["Web", "Networking - Chamber", "Plan Hub", "Return Client", "Referral", "Other"]),
      column("current_task_description", ["Conduct Site Survey", "Lost"], true),
      column("current_task_assigned_to", [
        "PJ", "Aidin", "Cameron", "Kay", "Twyla", "Carl", "Chris", "Brett", "Emily", "Joe", "Kyle",
      ]),
    ] },
  },
  orders: {
    status: "ready",
    analysis: { fields: [
      column("request_type", ["Vinyl", "Substrate", "Supplies", "Other"]),
    ] },
  },
};
const fullNames = [
  "Aidin Gargari", "Brett Heinlein", "Carl Heinlein", "Chris Runyon",
  "Deantae Vandivier", "Jack Test", "Joe Mendoza", "Kay Valentine",
  "Kyle Heinlein", "Mason Muccillo", "Matias", "Twyla Heinlein",
];
const authorizedUsers = fullNames.map((full_name) => ({
  full_name, sales_roles: ["Task Assigned"], is_active: true,
}));
const before = JSON.stringify({ liveMappingAnalysis, authorizedUsers });
const review = buildSmartsheetVocabularyReview({
  liveMappingAnalysis,
  authorizedUsers,
  taskDescriptions: ["Conduct Site Survey", "SIPs", "Lost"].map((text) => ({ text })),
  leadSources: DEFAULT_SALES_LEAD_SOURCES,
  leadSourcesSaved: false,
});

assert.equal(review.ready, true);
assert.deepEqual(review.source.addToBase44, [
  "Networking - Chamber", "Plan Hub", "Return Client", "Other",
]);
assert.deepEqual(review.source.addToSmartsheet, ["Walk-in", "Phone", "Email"]);
assert.equal(review.source.combined.filter((value) => value === "Web").length, 1);
assert.deepEqual(review.tasks.addToSmartsheet, ["SIPs"]);
assert.deepEqual(review.tasks.addToBase44, []);
assert.equal(review.tasks.validated, true);
assert.equal(review.orderTypes.synchronized, true);
assert.equal(review.owners.resolved.length, 8);
assert.deepEqual(review.owners.unresolved, ["PJ", "Cameron", "Emily"]);
assert.deepEqual(review.owners.ambiguous, []);
assert.deepEqual(review.owners.base44Only.map((item) => item.full_name).sort(), [
  "Deantae Vandivier", "Jack Test", "Mason Muccillo", "Matias",
]);
assert.equal(JSON.stringify({ liveMappingAnalysis, authorizedUsers }), before,
  "Read-only review must not change source metadata or user records");
const report = formatSmartsheetVocabularyReview(review);
assert.match(report, /SIPs/);
assert.match(report, /PJ, Cameron, Emily/);
assert.match(report, /NOT saved/);

const unavailable = buildSmartsheetVocabularyReview({ liveMappingAnalysis: { sales: null } });
assert.equal(unavailable.ready, false, "Missing columns must fail closed");
const withoutDisabled = buildSmartsheetVocabularyReview({
  liveMappingAnalysis, authorizedUsers: [
    { full_name: "Brett Heinlein", sales_roles: ["Task Assigned"], is_active: false },
  ], taskDescriptions: [],
});
assert.ok(withoutDisabled.owners.unresolved.includes("Brett"),
  "Inactive people must not be resolved automatically");

console.log("Smartsheet vocabulary read-only regression: PASS");
