import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/components/admin/UserManagement.jsx", "utf8");
const load = page.slice(page.indexOf("  const loadUsers = async () => {"), page.indexOf("  const loadDeletionRequests = async () => {"));

test("User directory tracks latest request and preserves verified data on errors", () => {
  assert.match(load, /requestSequence = \+\+userLoadSequence\.current/);
  assert.match(load, /activeSessionToken\.current !== sessionToken/);
  assert.match(load, /await listAuthorizedUsersAdmin\(\{ sessionToken \}\)/);
  assert.match(load, /if \(ownsRead\(\)\)/);
  assert.match(load, /setUsers\(allUsers\)/);
  assert.match(load, /setUserDirectoryError\(false\)/);
  assert.match(load, /catch \{/);
  assert.match(load, /setUserDirectoryError\(true\)/);
  assert.match(load, /return ownsRead\(\) \? allUsers : null/);
  assert.match(load, /return null/);
  assert.match(load, /finally \{/);
  assert.match(load, /setIsLoading\(false\)/);
  assert.doesNotMatch(load, /setUsers\(\[\]\)/);
});

test("Session changes revoke the previous directory's pending reads", () => {
  assert.match(page, /return \(\) => \{\s*deletionOwner\.current = null;\s*deletionInFlight\.current = false;[\s\S]*?\+\+userLoadSequence\.current;\s*\+\+deletionRequestLoadSequence\.current;\s*\+\+deletionImpactSequence\.current;\s*\}/);
  assert.match(page, /if \(sessionToken\) \{[\s\S]*?void loadUsers\(\)/);
  assert.match(page, /setUsers\(\[\]\);\s*setUserDirectoryError\(true\)/);
});

test("Failed directory reads cannot appear as zero users or permit invites", () => {
  assert.match(page, /role="alert" aria-label="User directory unavailable"/);
  assert.match(page, /Retry loading users/);
  assert.match(page, /userDirectoryError \? "User count unavailable"/);
  assert.match(page, /\) : userDirectoryError \? \(/);
  assert.match(page, /\) : users\.length === 0 \? \(/);
  assert.match(page, /disabled=\{isInviting \|\| isLoading \|\| userDirectoryError \|\| !sessionToken\}/);
});

test("User writes and HR changes require a verified directory", () => {
  assert.match(page, /if \(!editingUser \|\| userUpdateInFlight\.current \|\| deletionInFlight\.current \|\| isLoading \|\| userDirectoryError \|\|\s*!sessionToken \|\| activeSessionToken\.current !== sessionToken\) return/);
  assert.match(page, /if \(inviteInFlight\.current \|\| isLoading \|\| userDirectoryError \|\| !sessionToken \|\|\s*activeSessionToken\.current !== sessionToken\) return/);
  assert.match(page, /if \(!verifiedUser \|\| !user\?\.updated_date \|\| !deleteConfirm \|\|[\s\S]*?deletionInFlight\.current \|\| userUpdateInFlight\.current \|\| userMutationSaving \|\|[\s\S]*?isLoading \|\| userDirectoryError \|\| !sessionToken \|\|[\s\S]*?activeSessionToken\.current !== sessionToken\) return/);
  assert.match(page, /if \(isLoading \|\| userDirectoryError \|\| !sessionToken\) \{\s*throw new Error\("The user directory must be reloaded before saving HR data/);
  assert.match(page, /const refreshed = await loadUsers\(\); if \(refreshed\) setUserMutationError\(""\)/);
});
