import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/components/admin/UserManagement.jsx','utf8');
const effect = page.slice(page.indexOf('  useEffect(() => {\n    // A previous Admin session'),page.indexOf('  const loadUsers = async'));
const save = page.slice(page.indexOf('  const handleSave = async () => {'),page.indexOf('  const handleInvite = async () => {'));
const list = page.slice(page.indexOf('  const loadUsers = async () => {'),page.indexOf('  const loadDeletionRequests = async () => {'));

test('Session transition revokes user-update owner and clears sensitive editor state',()=>{
  assert.match(page,/const userUpdateInFlight = useRef\(false\);\s*const userUpdateOwner = useRef\(null\)/);
  assert.match(effect,/userUpdateOwner\.current = null;\s*userUpdateInFlight\.current = false;\s*setUserMutationSaving\(false\)/);
  assert.match(effect,/setEditingUser\(null\);\s*setIsDialogOpen\(false\);\s*setFormData\(\{/);
  assert.match(effect,/password_hash: ""/);
});

test('Existing-user save fences duplicate clicks and captures immutable session ownership',()=>{
  assert.match(save,/userUpdateInFlight\.current \|\| isLoading \|\| userDirectoryError/);
  assert.match(save,/activeSessionToken\.current !== sessionToken\) return/);
  assert.match(save,/const owner = \{ sessionToken \};\s*userUpdateOwner\.current = owner/);
  assert.match(save,/const ownsUpdate = \(\) => userUpdateOwner\.current === owner &&\s*activeSessionToken\.current === sessionToken/);
  assert.match(save,/userUpdateInFlight\.current = true/);
});

test('Old role update cannot start password write, reload directory or dismiss current editor',()=>{
  assert.match(save,/await updateAuthorizedUserAdmin\([\s\S]*?\);\s*\/\/[^\n]*\n\s*if \(!ownsUpdate\(\)\) return/);
  assert.match(save,/if \(newPassword\) \{[\s\S]*?await setPasswordFn/);
  assert.match(save,/if \(!ownsUpdate\(\)\) return;\s*await loadUsers\(\);\s*if \(!ownsUpdate\(\)\) return;\s*setIsDialogOpen\(false\);\s*setEditingUser\(null\)/);
  assert.match(save,/catch \(error\) \{\s*if \(!ownsUpdate\(\)\) return;/);
  assert.match(save,/finally \{\s*if \(ownsUpdate\(\)\) \{\s*userUpdateOwner\.current = null;\s*userUpdateInFlight\.current = false/);
});

test('Late password completion suppresses stale success/failure messages',()=>{
  assert.match(save,/const res = await setPasswordFn\([\s\S]*?\);\s*if \(!ownsUpdate\(\)\) return;\s*if \(!res\?\.data\?\.success\)/);
  assert.match(save,/catch \(e\) \{\s*if \(!ownsUpdate\(\)\) return;\s*alert/);
  assert.match(save,/delete dataToSave\.password_hash/);
});

test('Late directory results and errors from old session are ignored',()=>{
  assert.match(list,/if \(activeSessionToken\.current !== sessionToken\) return null/);
  assert.match(list,/const ownsRead = \(\) => requestSequence === userLoadSequence\.current &&\s*activeSessionToken\.current === sessionToken/);
  assert.match(list,/if \(ownsRead\(\)\) \{\s*setUsers\(allUsers\)/);
  assert.match(list,/return ownsRead\(\) \? allUsers : null/);
  assert.match(list,/if \(ownsRead\(\)\) setUserDirectoryError\(true\)/);
  assert.match(list,/if \(ownsRead\(\)\) setIsLoading\(false\)/);
});
