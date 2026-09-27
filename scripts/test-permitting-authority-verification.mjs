import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LOCALITY_AUTHORITY_ROLES,
  revokeLocalityOfficeAuthorityVerification,
  setLocalityOfficeAuthorityRole,
  summarizeLocalityOfficeAuthority,
  verifyLocalityOfficeAuthority,
} from "../src/components/permitting/localityAuthorityVerification.js";

test("role changes invalidate prior staff verification without changing office identity", () => {
  const office = { id: "local-1", catalog_office_id: "catalog-1", authority_roles: ["zoning"], authority_verification_status: "staff_verified", authority_verified_at: "2026-09-27T10:00:00.000Z", authority_verified_by: "Staff" };
  const next = setLocalityOfficeAuthorityRole(office, "building", true);
  assert.deepEqual(next.authority_roles, ["zoning", "building"]);
  assert.equal(next.authority_verification_status, "needs_verification");
  assert.equal(next.authority_verified_at, undefined);
  assert.equal(next.authority_verified_by, undefined);
  assert.equal(next.id, "local-1");
  assert.equal(next.catalog_office_id, "catalog-1");
});

test("staff verification requires an explicit role and records actor/time", () => {
  assert.throws(() => verifyLocalityOfficeAuthority({ authority_roles: [] }, "Brett"), /at least one authority role/);
  const next = verifyLocalityOfficeAuthority({ authority_roles: ["sign_permit"] }, "Reviewer", "2026-09-27T11:00:00.000Z");
  assert.equal(next.authority_verification_status, "staff_verified");
  assert.equal(next.authority_verified_by, "Reviewer");
  assert.equal(next.authority_verified_at, "2026-09-27T11:00:00.000Z");
});

test("revocation preserves roles and notes but removes verified state", () => {
  const next = revokeLocalityOfficeAuthorityVerification({ authority_roles: ["right_of_way"], authority_verification_notes: "County source", authority_verification_status: "staff_verified", authority_verified_by: "Reviewer" });
  assert.deepEqual(next.authority_roles, ["right_of_way"]);
  assert.equal(next.authority_verification_notes, "County source");
  assert.equal(next.authority_verification_status, "needs_verification");
  assert.equal(next.authority_verified_by, undefined);
});

test("UI exposes every schema authority role and verification controls", () => {
  const schema = JSON.parse(readFileSync(new URL("../base44/entities/PermitLocality.jsonc", import.meta.url)));
  const schemaRoles = schema.properties.offices.items.properties.authority_roles.items.enum;
  assert.deepEqual(LOCALITY_AUTHORITY_ROLES.map(([value]) => value), schemaRoles);
  const ui = readFileSync(new URL("../src/components/permitting/LocalityOfficeEditor.jsx", import.meta.url), "utf8");
  assert.match(ui, /Mark authority verified/);
  assert.match(ui, /Revoke verification/);
  assert.match(ui, /authority_verification_notes/);
});

test("canonical reference is not mistaken for locality authority", () => {
  const summary = summarizeLocalityOfficeAuthority({ government_office_id: "gov-1", office_type: "Zoning" });
  assert.equal(summary.relationship, "Canonical office ID recorded");
  assert.equal(summary.authority, "Locality authority not established");
  assert.equal(summary.verified, false);
  assert.deepEqual(summary.roleLabels, []);
});

test("proposed roles remain unverified until staff confirms this locality", () => {
  const summary = summarizeLocalityOfficeAuthority({
    catalog_office_id: "catalog-1", authority_roles: ["zoning", "building", "zoning"],
    authority_verification_status: "needs_verification",
  });
  assert.equal(summary.relationship, "Office catalog reference recorded");
  assert.equal(summary.authority, "Locality roles not verified");
  assert.deepEqual(summary.roleLabels, ["Zoning", "Building"]);
  assert.equal(summary.verified, false);
});

test("staff-verified roles are distinct from standalone office identity", () => {
  const summary = summarizeLocalityOfficeAuthority({
    authority_roles: ["sign_permit", "right_of_way"], authority_verification_status: "staff_verified",
  });
  assert.equal(summary.relationship, "Standalone office");
  assert.equal(summary.authority, "Locality authority staff verified");
  assert.deepEqual(summary.roleLabels, ["Sign permit", "ROW / Public Works"]);
  assert.equal(summary.verified, true);
});

test("unsupported or empty roles cannot display staff-verified authority", () => {
  const invalid = summarizeLocalityOfficeAuthority({
    authority_roles: ["zoning", "unrecognized_role"], authority_verification_status: "staff_verified",
  });
  assert.equal(invalid.authority, "Authority roles need review");
  assert.equal(invalid.verified, false);
  const empty = summarizeLocalityOfficeAuthority({ authority_verification_status: "staff_verified" });
  assert.equal(empty.authority, "Locality authority not established");
  assert.equal(empty.verified, false);
});

test("locality office summary remains visible outside the expandable editor", () => {
  const ui = readFileSync(new URL("../src/components/permitting/LocalityOfficeEditor.jsx", import.meta.url), "utf8");
  assert.match(ui, /const authoritySummary = summarizeLocalityOfficeAuthority\(office\)/);
  assert.match(ui, /Office relationship and locality authority/);
  assert.ok(ui.indexOf("authoritySummary.relationship") < ui.indexOf("{/* Expanded content */}"));
  assert.ok(ui.indexOf("authoritySummary.authority") < ui.indexOf("{/* Expanded content */}"));
  assert.ok(ui.indexOf("authoritySummary.roleLabels.join") < ui.indexOf("{/* Expanded content */}"));
});
