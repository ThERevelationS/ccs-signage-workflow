import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transform } from "esbuild";

const source = readFileSync("base44/shared/oauthState.ts", "utf8");
const { code } = await transform(source, { loader: "ts", format: "esm" });
globalThis.Deno = { env: { get: (name) => (name === "SESSION_SIGNING_SECRET" ? "test-signing-secret" : "") } };
const { issueOAuthState, verifyOAuthState } = await import(`data:text/javascript,${encodeURIComponent(code)}`);

const matches = (row, query) => Object.entries(query).every(([key, value]) => row[key] === value);

const fakeBase44 = () => {
  const rows = [];
  let nextId = 0;
  let clock = 0;
  const OAuthStateNonce = {
    rows,
    create: async (data) => {
      const row = { ...data, id: `nonce-${++nextId}`, created_date: `t${++clock}`, updated_date: `t${clock}` };
      rows.push(row);
      return { ...row };
    },
    filter: async (query) => rows.filter((row) => matches(row, query)).map((row) => ({ ...row })),
    delete: async (id) => {
      const idx = rows.findIndex((row) => row.id === id);
      if (idx >= 0) rows.splice(idx, 1);
      return {};
    },
    updateMany: async (query, { $set }) => {
      const hit = rows.filter((row) => matches(row, query));
      for (const row of hit) Object.assign(row, $set, { updated_date: `t${++clock}` });
      return { success: true, updated: hit.length, has_more: false };
    },
  };
  return { asServiceRole: { entities: { OAuthStateNonce } } };
};

const alice = { id: "user-alice", email: "Alice@Example.com" };

test("a state verifies once and is rejected on replay", async () => {
  const base44 = fakeBase44();
  const state = await issueOAuthState(base44, alice, "gmail_oauth");
  const store = base44.asServiceRole.entities.OAuthStateNonce;
  assert.equal(store.rows.length, 1);
  const payload = JSON.parse(Buffer.from(state.split(".")[0], "base64url").toString());
  assert.ok(!JSON.stringify(store.rows).includes(payload.nonce), "raw nonce must not be persisted");

  assert.deepEqual(await verifyOAuthState(base44, state, "gmail_oauth"), { userId: "user-alice", email: "alice@example.com" });
  await assert.rejects(verifyOAuthState(base44, state, "gmail_oauth"), (err) => err.status === 401);
  assert.equal(store.rows[0].used, true);
});

test("concurrent callbacks with the same state: exactly one wins", async () => {
  const base44 = fakeBase44();
  const state = await issueOAuthState(base44, alice, "gmail_oauth");
  const results = await Promise.allSettled([
    verifyOAuthState(base44, state, "gmail_oauth"),
    verifyOAuthState(base44, state, "gmail_oauth"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected" && r.reason.status === 401).length, 1);
});

test("a validly signed state without a persisted nonce is rejected", async () => {
  const issuer = fakeBase44();
  const state = await issueOAuthState(issuer, alice, "gmail_oauth");
  await assert.rejects(verifyOAuthState(fakeBase44(), state, "gmail_oauth"), (err) => err.status === 401);
});

test("wrong purpose does not consume the nonce", async () => {
  const base44 = fakeBase44();
  const state = await issueOAuthState(base44, alice, "gmail_oauth");
  await assert.rejects(verifyOAuthState(base44, state, "drive_oauth"), (err) => err.status === 401);
  assert.equal((await verifyOAuthState(base44, state, "gmail_oauth")).userId, "user-alice");
});

test("expired nonce record is rejected", async () => {
  const base44 = fakeBase44();
  const state = await issueOAuthState(base44, alice, "gmail_oauth");
  base44.asServiceRole.entities.OAuthStateNonce.rows[0].expires_at = new Date(Date.now() - 1000).toISOString();
  await assert.rejects(verifyOAuthState(base44, state, "gmail_oauth"), (err) => err.status === 401);
});

test("tampered signature is rejected", async () => {
  const base44 = fakeBase44();
  const state = await issueOAuthState(base44, alice, "gmail_oauth");
  await assert.rejects(verifyOAuthState(base44, `${state}x`, "gmail_oauth"), (err) => err.status === 401);
});

test("missing nonce store fails closed", async () => {
  await assert.rejects(issueOAuthState({ asServiceRole: { entities: {} } }, alice, "gmail_oauth"), (err) => err.status === 503);
});
