// Synthetic behavioral checks against the actual Admin request handlers.
// All backend responses are deferred in memory; no production calls or records.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/admin/UserManagement.jsx", "utf8");
const effect = source.slice(source.indexOf("  useEffect(() => {\n    // A previous Admin session"),
  source.indexOf("  const loadUsers = async () => {"));

function compileHandler(name, following, scope) {
  const start = source.indexOf(`  const ${name} = async (user) => {`);
  const end = source.indexOf(`  const ${following} = `, start + 1);
  assert.ok(start >= 0 && end > start, `Located the real ${name} handler`);
  const text = source.slice(start, end).trim();
  const expression = text.slice(text.indexOf(" = ") + 3).replace(/;$/, "");
  // Test-only extraction. Uses the exact shipping handler, injected synthetic
  // refs and a deferred Base44 call; no JSX rendering or live API traffic.
  return new Function("scope", `with (scope) { return (${expression}); }`)(scope);
}

function harness() {
  const activeSessionToken = { current: "synthetic" };
  const passwordResetOwner = { current: null };
  const passwordResetInFlight = { current: false };
  const onboardingResendOwner = { current: null };
  const onboardingResendInFlight = { current: false };
  const observed = {
    requests: [], alerts: [], errors: [], reads: [], resetSending: null, resendSending: null, logs: [],
  };
  const base44 = { functions: { invoke: (name, payload) => new Promise((resolve, reject) =>
    observed.requests.push({ name, payload, resolve, reject })) } };
  const shared = {
    activeSessionToken, passwordResetOwner, passwordResetInFlight,
    onboardingResendOwner, onboardingResendInFlight, base44,
    isLoading: false, userDirectoryError: false,
    setSendingPasswordReset: id => { observed.resetSending = id; },
    setSendingOnboardingEmail: id => { observed.resendSending = id; },
    setUserMutationError: error => { observed.errors.push(error); },
    alert: message => { observed.alerts.push(message); },
    console: { error: (...items) => observed.logs.push(items) },
  };
  const handlers = token => {
    const scope = {
      ...shared, sessionToken: token,
      loadUsers: async () => { observed.reads.push(token); },
    };
    return {
      reset: compileHandler("handleSendPasswordReset", "handleResendOnboarding", scope),
      resend: compileHandler("handleResendOnboarding", "handleSaveHrData", scope),
    };
  };
  const switchSession = token => {
    activeSessionToken.current = token;
    passwordResetOwner.current = null;
    passwordResetInFlight.current = false;
    onboardingResendOwner.current = null;
    onboardingResendInFlight.current = false;
    observed.resetSending = null;
    observed.resendSending = null;
  };
  return { observed, handlers, switchSession, shared };
}

const oldUser = { id: "old", email: "old@example.invalid" };
const newUser = { id: "new", email: "new@example.invalid" };

test("Session effect explicitly revokes both operations and clears spinners", () => {
  assert.match(effect, /passwordResetOwner\.current = null;\s*passwordResetInFlight\.current = false;\s*setSendingPasswordReset\(null\)/);
  assert.match(effect, /onboardingResendOwner\.current = null;\s*onboardingResendInFlight\.current = false;\s*setSendingOnboardingEmail\(null\)/);
  assert.match(effect, /return \(\) => \{\s*hrReloadOwner\.current = null;\s*hrReloadInFlight\.current = false;\s*hrSaveOwner\.current = null;\s*hrSaveInFlight\.current = false;\s*deletionOwner\.current = null;\s*deletionInFlight\.current = false;\s*passwordResetOwner\.current = null;\s*passwordResetInFlight\.current = false;\s*onboardingResendOwner\.current = null;\s*onboardingResendInFlight\.current = false/);
});

for (const action of ["reset", "resend"]) {
  test(`${action}: duplicate activations dispatch once and ordinary success finishes`, async () => {
    const { observed, handlers, shared } = harness();
    const handler = handlers("synthetic")[action];
    const first = handler(oldUser);
    const duplicate = handler(oldUser);
    assert.equal(observed.requests.length, 1, "No second email dispatched");
    const request = observed.requests[0];
    assert.equal(request.payload.session_token, "synthetic");
    assert.equal(request.payload.target_email, oldUser.email);
    assert.equal(observed[action === "reset" ? "resetSending" : "resendSending"], oldUser.id);
    request.resolve({ data: { success: true } });
    await Promise.all([first, duplicate]);
    assert.equal(observed.alerts.length, 1, "One confirmation");
    assert.equal(observed[action === "reset" ? "resetSending" : "resendSending"], null);
    assert.deepEqual(observed.reads, action === "resend" ? ["synthetic"] : []);
    assert.equal(shared[action === "reset" ? "passwordResetInFlight" : "onboardingResendInFlight"].current, false);
  });

  for (const outcome of ["success", "failure"]) {
    test(`${action}: old ${outcome} cannot alert, clear new spinner, set error, or refresh old directory`, async () => {
      const { observed, handlers, switchSession, shared } = harness();
      const oldHandler = handlers("synthetic")[action];
      const oldOperation = oldHandler(oldUser);
      assert.equal(observed.requests.length, 1);
      switchSession("synthetic-new");
      const newHandler = handlers("synthetic-new")[action];
      const newOperation = newHandler(newUser);
      assert.equal(observed.requests.length, 2);
      const errorCount = observed.errors.length;
      if (outcome === "failure") {
        observed.requests[0].reject(new Error("secret-synthetic-old-error"));
      } else {
        observed.requests[0].resolve({ data: { success: true } });
      }
      await oldOperation;
      assert.equal(observed.alerts.length, 0);
      assert.equal(observed.errors.length, errorCount);
      assert.deepEqual(observed.reads, []);
      assert.equal(observed[action === "reset" ? "resetSending" : "resendSending"], newUser.id);
      assert.equal(shared[action === "reset" ? "passwordResetInFlight" : "onboardingResendInFlight"].current, true);
      observed.requests[1].resolve({ data: { success: true } });
      await newOperation;
      assert.equal(observed.alerts.length, 1);
      assert.match(observed.alerts[0], /new@example\.invalid/);
      assert.deepEqual(observed.reads, action === "resend" ? ["synthetic-new"] : []);
      assert.equal(observed[action === "reset" ? "resetSending" : "resendSending"], null);
      assert.equal(observed.errors.length, errorCount);
    });
  }

  test(`${action}: same token restored cannot re-own superseded response`, async () => {
    const { observed, handlers, switchSession } = harness();
    const oldOperation = handlers("synthetic")[action](oldUser);
    switchSession("intermediate");
    switchSession("synthetic");
    const newOperation = handlers("synthetic")[action](newUser);
    observed.requests[0].resolve({ data: { success: true } });
    await oldOperation;
    assert.equal(observed.alerts.length, 0);
    assert.equal(observed[action === "reset" ? "resetSending" : "resendSending"], newUser.id);
    observed.requests[1].resolve({ data: { success: true } });
    await newOperation;
    assert.equal(observed.alerts.length, 1);
    assert.deepEqual(observed.reads, action === "resend" ? ["synthetic"] : []);
  });

  test(`${action}: current-session server rejection reports error and frees progress`, async () => {
    const { observed, handlers } = harness();
    const pending = handlers("synthetic")[action](oldUser);
    observed.requests[0].reject(new Error("synthetic-auth-failed"));
    await pending;
    assert.equal(observed.alerts[0], "synthetic-auth-failed");
    assert.equal(observed.errors.at(-1), "synthetic-auth-failed");
    assert.equal(observed[action === "reset" ? "resetSending" : "resendSending"], null);
    assert.deepEqual(observed.reads, []);
  });
}
