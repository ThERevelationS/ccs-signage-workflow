// Exercises the shipping Admin deletion handler with deferred synthetic backend responses.
// No Base44 credentials, network calls, or production data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/admin/UserManagement.jsx", "utf8");
const effect = source.slice(source.indexOf("  useEffect(() => {\n    // A previous Admin session"),
  source.indexOf("  const loadUsers = async () => {"));
const slice = source.slice(source.indexOf("  const handleDelete = async (user) => {"),
  source.indexOf("  const getRoleBadge = ", source.indexOf("  const handleDelete = "))).trim();
assert.ok(slice.startsWith("const handleDelete = async (user) => {"));
const handlerExpression = slice.slice(slice.indexOf(" = ") + 3).replace(/;$/, "");
const firstUser = { id: "user-1", email: "first@example.invalid", full_name: "First", updated_date: "version-1" };
const nextUser = { id: "user-2", email: "second@example.invalid", full_name: "Second", updated_date: "version-2" };

function fixture() {
  const activeSessionToken = { current: "old-session" };
  const deletionInFlight = { current: false };
  const deletionOwner = { current: null };
  const userUpdateInFlight = { current: false };
  const hrSaveInFlight = { current: false };
  const state = { saving: false, confirm: firstUser, error: "", directory: [firstUser], calls: [], reads: [], errors: [] };
  let currentlyLoading = false;
  let directoryUnavailable = false;
  const shared = {
    activeSessionToken, deletionInFlight, deletionOwner, userUpdateInFlight, hrSaveInFlight,
    userMutationSaving: false,
    get isLoading() { return currentlyLoading; },
    get userDirectoryError() { return directoryUnavailable; },
    setDeletionSaving: value => { state.saving = value; },
    setDeleteConfirm: value => { state.confirm = value; },
    setUserMutationError: value => { state.error = value; },
    deleteAuthorizedUserAdmin: ({ record, sessionToken }) =>
      new Promise((resolve, reject) => state.calls.push({ record, sessionToken, resolve, reject })),
    console: { error: (...args) => state.errors.push(args) }
  };
  const handler = (token, { user = state.confirm, directory = state.directory } = {}) => {
    const scope = { ...shared, sessionToken: token, deleteConfirm: user, users: directory,
      loadUsers: async () => { state.reads.push(token); } };
    return new Function("scope", `with (scope) { return (${handlerExpression}); }`)(scope);
  };
  const switchSession = token => {
    activeSessionToken.current = token;
    deletionOwner.current = null;
    deletionInFlight.current = false;
    state.saving = false;
    state.confirm = null;
  };
  return { handler, switchSession, state, shared, setLoading: val => { currentlyLoading = val; },
    setDirectoryUnavailable: val => { directoryUnavailable = val; } };
}

test("Changing or leaving Admin revokes delete owner and confirmation", () => {
  assert.match(source, /const \[deletionSaving, setDeletionSaving\] = useState\(false\);\s*const deletionInFlight = useRef\(false\);\s*const deletionOwner = useRef\(null\)/);
  assert.match(effect, /deletionOwner\.current = null;\s*deletionInFlight\.current = false;\s*setDeletionSaving\(false\);\s*setDeleteConfirm\(null\)/);
  assert.match(effect, /return \(\) => \{\s*hrReloadOwner\.current = null;\s*hrReloadInFlight\.current = false;\s*hrSaveOwner\.current = null;\s*hrSaveInFlight\.current = false;\s*deletionOwner\.current = null;\s*deletionInFlight\.current = false/);
  assert.match(source, /onOpenChange=\{\(open\) => \{ if \(!open && !deletionInFlight\.current\) setDeleteConfirm\(null\); \}\}/);
  assert.match(source, /<AlertDialogCancel disabled=\{deletionSaving\}/);
  assert.match(source, /disabled=\{deletionSaving \|\| userMutationSaving \|\| hrMutationSaving \|\| isLoading/);
  assert.match(source, /if \(!editingUser \|\| userUpdateInFlight\.current \|\| hrSaveInFlight\.current \|\| deletionInFlight\.current/);
});

test("Ordinary deletion succeeds once, closes its confirmation, and refreshes current directory", async () => {
  const f = fixture();
  const submit = f.handler("old-session");
  const one = submit(firstUser);
  const two = submit(firstUser);
  assert.equal(f.state.calls.length, 1);
  assert.equal(f.state.calls[0].record, firstUser);
  assert.equal(f.state.calls[0].sessionToken, "old-session");
  assert.equal(f.state.saving, true);
  f.state.calls[0].resolve({ success: true });
  await Promise.all([one, two]);
  assert.equal(f.state.confirm, null);
  assert.equal(f.state.saving, false);
  assert.deepEqual(f.state.reads, ["old-session"]);
  assert.equal(f.shared.deletionInFlight.current, false);
});

for (const outcome of ["success", "failure"]) {
  test(`Late old deletion ${outcome} cannot dismiss new confirmation or refresh current directory`, async () => {
    const f = fixture();
    const oldAction = f.handler("old-session")(firstUser);
    f.switchSession("new-session");
    f.state.confirm = nextUser;
    f.state.directory = [nextUser];
    const newAction = f.handler("new-session")(nextUser);
    assert.equal(f.state.calls.length, 2);
    if (outcome === "success") f.state.calls[0].resolve({ success: true });
    else f.state.calls[0].reject(new Error("secret-old-session-failure"));
    await oldAction;
    assert.equal(f.state.confirm, nextUser);
    assert.equal(f.state.error, "");
    assert.equal(f.state.saving, true);
    assert.equal(f.shared.deletionInFlight.current, true);
    assert.deepEqual(f.state.reads, []);
    assert.equal(f.state.errors.length, 0);
    f.state.calls[1].resolve({ success: true });
    await newAction;
    assert.equal(f.state.confirm, null);
    assert.deepEqual(f.state.reads, ["new-session"]);
    assert.equal(f.state.saving, false);
  });
}

test("Returning to identical session token cannot re-own an old response", async () => {
  const f = fixture();
  const oldAction = f.handler("old-session")(firstUser);
  f.switchSession("intermediate");
  f.switchSession("old-session");
  f.state.directory = [nextUser];
  f.state.confirm = nextUser;
  const newAction = f.handler("old-session")(nextUser);
  f.state.calls[0].resolve({ success: true });
  await oldAction;
  assert.equal(f.state.saving, true);
  assert.equal(f.state.confirm, nextUser);
  assert.deepEqual(f.state.reads, []);
  f.state.calls[1].resolve({ success: true });
  await newAction;
  assert.deepEqual(f.state.reads, ["old-session"]);
});

test("Current-session backend failure displays error, closes confirmation, refreshes, and releases lock", async () => {
  const f = fixture();
  const pending = f.handler("old-session")(firstUser);
  f.state.calls[0].reject(new Error("synthetic-version-conflict"));
  await pending;
  assert.equal(f.state.error, "synthetic-version-conflict");
  assert.equal(f.state.confirm, null);
  assert.equal(f.state.saving, false);
  assert.deepEqual(f.state.reads, ["old-session"]);
});

test("Stale, missing, or cross-user confirmations never dispatch a deletion", async () => {
  const f = fixture();
  const handler = f.handler("old-session");
  await handler({ ...firstUser, updated_date: "stale" });
  await f.handler("old-session", { user: null })(firstUser);
  await f.handler("old-session", { user: nextUser })(firstUser);
  await f.handler("old-session", { directory: [{ ...firstUser, email: "changed@example.invalid" }] })(firstUser);
  await f.handler("old-session", { directory: [{ ...firstUser, updated_date: "version-3" }] })(firstUser);
  assert.equal(f.state.calls.length, 0);
});

test("Unauthenticated, updating, or unverified directory cannot dispatch delete", async () => {
  const f = fixture();
  await f.handler(null)(firstUser);
  f.setLoading(true); await f.handler("old-session")(firstUser); f.setLoading(false);
  f.setDirectoryUnavailable(true); await f.handler("old-session")(firstUser); f.setDirectoryUnavailable(false);
  f.shared.userUpdateInFlight.current = true; await f.handler("old-session")(firstUser);
  f.shared.userUpdateInFlight.current = false;
  f.shared.activeSessionToken.current = "new-session"; await f.handler("old-session")(firstUser);
  assert.equal(f.state.calls.length, 0);
});

test("Unmounted deletion completion cannot mutate the page or trigger a refresh", async () => {
  const f = fixture();
  const operation = f.handler("old-session")(firstUser);
  f.shared.deletionOwner.current = null;
  f.shared.deletionInFlight.current = false;
  f.state.saving = false;
  f.state.confirm = null;
  f.state.calls[0].resolve({ success: true });
  await operation;
  assert.equal(f.state.error, "");
  assert.equal(f.state.confirm, null);
  assert.deepEqual(f.state.reads, []);
});
