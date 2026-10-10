import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/components/admin/UserManagement.jsx", "utf8");
const loader = page.slice(page.indexOf("  const loadDeletionRequests = async () => {"), page.indexOf("  const handleLoadDeletionImpact = async"));

test("Deletion request reads fail closed without clearing last verified requests", () => {
  assert.match(loader, /requestSequence = \+\+deletionRequestLoadSequence\.current/);
  assert.match(loader, /setDeletionRequestConfirm\(null\)/);
  assert.match(loader, /await listAccountDeletionRequestsAdmin\(\{ sessionToken \}\)/);
  assert.match(loader, /requestSequence === deletionRequestLoadSequence\.current/);
  assert.match(loader, /setDeletionRequests\(requests\)/);
  assert.match(loader, /setDeletionRequestsError\(false\)/);
  assert.match(loader, /catch \{/);
  assert.match(loader, /setDeletionRequestsError\(true\)/);
  assert.match(loader, /return null/);
  assert.match(loader, /finally \{/);
  assert.match(loader, /setDeletionRequestsLoading\(false\)/);
  assert.doesNotMatch(loader, /setDeletionRequests\(\[\]\)/);
});

test("Deletion request error is different from verified empty list and has retry", () => {
  assert.match(page, /deletionRequestsError\s*\? "Pending request count unavailable"/);
  assert.match(page, /\) : deletionRequestsError \? \(/);
  assert.match(page, /\) : deletionRequests\.length === 0 \? \(/);
  assert.match(page, /role="alert" aria-label="Account deletion requests unavailable"/);
  assert.match(page, /Retry loading requests/);
  assert.match(page, /No account deletion requests have been submitted/);
});

test("Impact review and request resolution require a verified directory of requests", () => {
  assert.match(page, /if \(!request\?\.id \|\| deletionImpactLoading \|\| deletionRequestsLoading \|\| deletionRequestsError \|\| !sessionToken\) return/);
  assert.match(page, /if \(!request\?\.id \|\| !resolution \|\| deletionRequestSaving \|\| deletionRequestsLoading \|\| deletionRequestsError \|\| !sessionToken\) return/);
  assert.match(page, /disabled=\{deletionImpactLoading \|\| deletionRequestSaving \|\| deletionRequestsLoading \|\| deletionRequestsError \|\| !sessionToken\}/);
  const disabledResolution = page.match(/disabled=\{deletionRequestSaving \|\| deletionRequestsLoading \|\| deletionRequestsError \|\| !sessionToken\}/g) || [];
  assert.equal(disabledResolution.length, 3);
});

test("Session changes invalidate prior deletion request reads and clear sensitive review state", () => {
  assert.match(page, /\+\+deletionRequestLoadSequence\.current/);
  assert.match(page, /setDeletionRequests\(\[\]\);\s*setDeletionRequestsError\(true\)/);
  assert.match(page, /\+\+deletionImpactSequence\.current;\s*setDeletionImpactRequest\(null\);\s*setDeletionImpactReport\(null\);/);
  assert.match(page, /setDeletionRequests\(\[\]\);\s*setDeletionRequestsError\(true\);\s*setDeletionRequestConfirm\(null\)/);
  assert.match(page, /return \(\) => \{\s*\+\+userLoadSequence\.current;\s*\+\+deletionRequestLoadSequence\.current;\s*\+\+deletionImpactSequence\.current;\s*\}/);
});
