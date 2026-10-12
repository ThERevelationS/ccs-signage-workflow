import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/components/admin/UserManagement.jsx", "utf8");
const refresh = page.slice(page.indexOf("  const loadDeletionRequests = async () => {"),
  page.indexOf("  const handleLoadDeletionImpact = async"));
const resolver = page.slice(page.indexOf("  const handleResolveDeletionRequest = async () => {"),
  page.indexOf("  const formatDeletionRequestDate ="));

test("Admin session identity is tracked before effects to fence previous-token responses", () => {
  assert.match(page, /const activeSessionToken = useRef\(sessionToken\);\s*activeSessionToken\.current = sessionToken/);
  assert.match(page, /deletionResolutionOwner\.current = null;\s*deletionResolutionInFlight\.current = false;\s*setDeletionRequestSaving\(false\);\s*setDeletionRequestConfirm\(null\);\s*setUserMutationError\(""\)/);
});

test("A stale request refresh cannot start or complete after session change", () => {
  assert.match(refresh, /if \(activeSessionToken\.current !== sessionToken\) return null/);
  assert.match(refresh, /const ownsRead = \(\) => requestSequence === deletionRequestLoadSequence\.current &&\s*activeSessionToken\.current === sessionToken/);
  assert.match(refresh, /if \(ownsRead\(\)\) \{\s*setDeletionRequests\(requests\)/);
  assert.match(refresh, /return ownsRead\(\) \? requests : null/);
  assert.match(refresh, /if \(ownsRead\(\)\) setDeletionRequestsError\(true\)/);
  assert.match(refresh, /if \(ownsRead\(\)\) setDeletionRequestsLoading\(false\)/);
});

test("Old resolution completion cannot clear the new session's error, confirmation or loading state", () => {
  assert.match(resolver, /const owner = \{ sessionToken \}/);
  assert.match(resolver, /deletionResolutionOwner\.current = owner/);
  assert.match(resolver, /const ownsResolution = \(\) => deletionResolutionOwner\.current === owner &&\s*activeSessionToken\.current === sessionToken/);
  assert.match(resolver, /await resolveAccountDeletionRequestAdmin\([\s\S]*?\);\s*if \(!ownsResolution\(\)\) return;/);
  assert.match(resolver, /catch \(error\) \{\s*if \(!ownsResolution\(\)\) return;/);
  assert.match(resolver, /finally \{\s*if \(ownsResolution\(\)\) \{\s*deletionResolutionOwner\.current = null;\s*deletionResolutionInFlight\.current = false;\s*setDeletionRequestSaving\(false\)/);
  assert.match(resolver, /if \(!verifiedRequest \|\| !resolution \|\| deletionResolutionInFlight\.current \|\|\s*deletionRequestsLoading \|\| deletionRequestsError \|\| !sessionToken \|\|\s*activeSessionToken\.current !== sessionToken\) return/);
});
