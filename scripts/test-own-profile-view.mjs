// manageOwnProfile must never echo credential, token, biometric, or lockout
// fields from the caller's AuthorizedEmail row back to the client.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { OWN_PROFILE_DENIED_FIELDS, toOwnProfileView } from "../base44/shared/ownProfileView.mjs";

const read = (p) => readFileSync(p, "utf8");
const handler = read("base44/functions/manageOwnProfile/entry.ts");
const gateway = read("base44/functions/staffDataRead/entry.ts");

test("toOwnProfileView strips every credential field and keeps profile fields", () => {
  const row = { id: "u1", email: "a@x.com", username: "alice", full_name: "Alice", role: "user", hr_data: { phone: "1" } };
  for (const field of OWN_PROFILE_DENIED_FIELDS) row[field] = "secret";
  const view = toOwnProfileView(row);
  for (const field of OWN_PROFILE_DENIED_FIELDS) assert.ok(!(field in view), `${field} must be stripped`);
  assert.deepEqual(view, { id: "u1", email: "a@x.com", username: "alice", full_name: "Alice", role: "user", hr_data: { phone: "1" } });
  assert.equal(row.password_hash, "secret", "input row must not be mutated");
  assert.equal(toOwnProfileView(null), null);
  assert.equal(toOwnProfileView([row]), null);
});

test("denylist covers staffDataRead's AuthorizedEmail denylist", () => {
  const block = gateway.match(/AuthorizedEmail:\s*\[([\s\S]*?)\]/)[1];
  const gatewayFields = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(gatewayFields.length > 0);
  for (const field of gatewayFields) assert.ok(OWN_PROFILE_DENIED_FIELDS.includes(field), `missing ${field}`);
});

test("manageOwnProfile only returns sanitized records", () => {
  assert.match(handler, /import \{ toOwnProfileView \} from '\.\.\/\.\.\/shared\/ownProfileView\.mjs';/);
  assert.doesNotMatch(handler, /record:\s*saved\b/);
  assert.equal((handler.match(/record: toOwnProfileView\(saved\)/g) || []).length, 2);
});
