import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/components/admin/UserManagement.jsx", "utf8");
const scanner = page.slice(page.indexOf("  const handleLoadDeletionImpact = async"), page.indexOf("  const formatImpactEntity = "));
const refresher = page.slice(page.indexOf("  const loadDeletionRequests = async"), page.indexOf("  const handleLoadDeletionImpact = async"));

test("Impact scan accepts only the currently verified version and fences late results", () => {
  assert.match(scanner, /deletionRequests\.find\(item =>\s*item\.id === request\?\.id && item\.updated_date === request\?\.updated_date\)/);
  assert.match(scanner, /if \(!verifiedRequest \|\| deletionImpactLoading \|\| deletionRequestsLoading \|\|\s*deletionRequestsError \|\| !sessionToken\) return/);
  assert.match(scanner, /requestSequence = \+\+deletionImpactSequence\.current/);
  assert.match(scanner, /await getAccountDeletionImpactAdmin\(\{ request: verifiedRequest, sessionToken \}\)/);
  assert.match(scanner, /if \(requestSequence === deletionImpactSequence\.current\) \{\s*setDeletionImpactReport\(impact\)/);
  assert.match(scanner, /if \(requestSequence === deletionImpactSequence\.current\) \{\s*setDeletionImpactLoading\(false\)/);
});

test("Closing an in-progress scan cancels its UI ownership and clears confidential results", () => {
  assert.match(scanner, /const closeDeletionImpact = \(\) => \{\s*\+\+deletionImpactSequence\.current/);
  assert.match(scanner, /setDeletionImpactRequest\(null\);\s*setDeletionImpactReport\(null\);\s*setDeletionImpactError\(""\);\s*setDeletionImpactLoading\(false\)/);
  assert.match(page, /<Button type="button" variant="outline" onClick=\{closeDeletionImpact\}>/);
  assert.match(refresher, /\+\+deletionImpactSequence\.current;\s*setDeletionImpactRequest\(null\);\s*setDeletionImpactReport\(null\)/);
  assert.match(page, /return \(\) => \{\s*hrReloadOwner\.current = null;\s*hrReloadInFlight\.current = false;\s*hrDraftStatus\.current = null;\s*accountDraftBaseline\.current = null;\s*hrSaveOwner\.current = null;\s*hrSaveInFlight\.current = false;\s*deletionOwner\.current = null;\s*deletionInFlight\.current = false;[\s\S]*?\+\+userLoadSequence\.current;\s*\+\+deletionRequestLoadSequence\.current;\s*\+\+deletionImpactSequence\.current;\s*\}/);
});

test("Impact scan failure uses a generic alert with a read-only retry and no raw backend error", () => {
  assert.match(scanner, /catch \(error\) \{\s*if \(requestSequence === deletionImpactSequence\.current\)/);
  assert.match(scanner, /error\?\.message === "Account deletion impact scan timed out. No report was verified."/);
  assert.match(scanner, /: "The read-only impact scan could not be verified/);
  assert.match(scanner, /\? "The impact scan took too long/);
  assert.doesNotMatch(scanner, /setDeletionImpactError\(error\?\.message/);
  assert.match(page, /role="alert" aria-label="Account deletion impact unavailable"/);
  assert.match(page, /Retry impact scan/);
  assert.match(page, /void handleLoadDeletionImpact\(deletionImpactRequest\)/);
  assert.match(page, /role="status"/);
});
