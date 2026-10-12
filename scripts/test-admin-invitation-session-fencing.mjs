import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/admin/UserManagement.jsx", "utf8");
const handler = source.slice(source.indexOf("  const handleInvite = async () => {"),
  source.indexOf("  const handleDelete = async"));
const sessionEffect = source.slice(source.indexOf("  useEffect(() => {\n    // A prior session may still"),
  source.indexOf("  const loadUsers = async"));

test("Session changes revoke old invitation ownership and clear private form state", () => {
  assert.match(source, /const inviteInFlight = useRef\(false\);\s*const inviteOwner = useRef\(null\)/);
  assert.match(sessionEffect, /inviteOwner\.current = null;\s*inviteInFlight\.current = false;\s*setIsInviting\(false\)/);
  assert.match(sessionEffect, /setInviteError\(""\);\s*setInviteSuccess\(""\);\s*setInviteEmail\(""\);\s*setInviteFirstName\(""\);\s*setInviteLastName\(""\);\s*setInviteRole\("user"\)/);
});

test("Invitation submit synchronously prevents duplicates and binds to the initiating session", () => {
  assert.match(handler, /if \(inviteInFlight\.current \|\| isLoading \|\| userDirectoryError \|\| !sessionToken \|\|\s*activeSessionToken\.current !== sessionToken\) return/);
  assert.match(handler, /const owner = \{ sessionToken \};\s*inviteOwner\.current = owner/);
  assert.match(handler, /const ownsInvite = \(\) => inviteOwner\.current === owner &&\s*activeSessionToken\.current === sessionToken/);
  assert.match(handler, /inviteInFlight\.current = true;\s*setIsInviting\(true\)/);
  assert.match(handler, /finally \{\s*if \(ownsInvite\(\)\) \{\s*inviteOwner\.current = null;\s*inviteInFlight\.current = false;\s*setIsInviting\(false\)/);
});

test("Old session responses cannot start onboarding or Smartsheet sync", () => {
  assert.match(handler, /await createAuthorizedUserAdmin\([\s\S]*?\);\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*if \(!ownsInvite\(\)\) return/);
  assert.match(handler, /await base44\.functions\.invoke\("onboardingAccountAction"/);
  assert.match(handler, /if \(!ownsInvite\(\)\) return;\s*const result = response/);
  assert.match(handler, /if \(!ownsInvite\(\)\) return;\s*try \{\s*const contactResponse = await base44\.functions\.invoke\("smartsheetSyncAction"/);
  assert.match(handler, /if \(!ownsInvite\(\)\) return;\s*const contactResult/);
});

test("Previous invitation cannot clear current form, report success or refresh old directory", () => {
  assert.match(handler, /if \(ownsInvite\(\)\) setInviteError\(error\?\.message/);
  assert.match(handler, /setInviteSuccess\(\(previous\) => ownsInvite\(\)/);
  assert.match(handler, /if \(!ownsInvite\(\)\) return;\s*setInviteEmail\(""\);\s*setInviteFirstName\(""\);\s*setInviteLastName\(""\);\s*setInviteRole\("user"\);\s*void loadUsers\(\)/);
  assert.match(handler, /session_token: sessionToken,\s*user_email: email/);
  assert.match(handler, /session_token: sessionToken,\s*target_email: email/);
});
