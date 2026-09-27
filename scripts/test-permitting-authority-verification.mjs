import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LOCALITY_AUTHORITY_ROLES,
  revokeLocalityOfficeAuthorityVerification,
  setLocalityOfficeAuthorityRole,
  summarizeLocalityOfficeAuthority,
  updateLocalityOfficeIdentity,
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

test("role assignment rejects unsupported roles while preserving legacy values for explicit review", () => {
  const legacy = {
    id: "legacy-local", authority_roles: ["zoning", "legacy_unknown"],
    authority_verification_status: "needs_verification", authority_verification_notes: "Review legacy import",
  };
  assert.throws(() => setLocalityOfficeAuthorityRole(legacy, "new_unknown", true), /Unsupported authority role: new_unknown/);
  assert.throws(() => setLocalityOfficeAuthorityRole(legacy, "legacy_unknown", false), /Unsupported authority role: legacy_unknown/);
  assert.deepEqual(legacy.authority_roles, ["zoning", "legacy_unknown"]);
  assert.equal(legacy.authority_verification_notes, "Review legacy import");

  const supported = setLocalityOfficeAuthorityRole(legacy, "building", true);
  assert.deepEqual(supported.authority_roles, ["zoning", "legacy_unknown", "building"]);
  assert.equal(supported.authority_verification_status, "needs_verification");
  assert.equal(supported.authority_verification_notes, "Review legacy import");
});

test("role assignment accepts every canonical schema role", () => {
  for (const [role] of LOCALITY_AUTHORITY_ROLES) {
    const next = setLocalityOfficeAuthorityRole({ authority_roles: [] }, role, true);
    assert.deepEqual(next.authority_roles, [role]);
  }
});

test("staff verification requires an explicit role and records actor/time", () => {
  assert.throws(() => verifyLocalityOfficeAuthority({ authority_roles: [] }, "Brett"), /at least one authority role/);
  const next = verifyLocalityOfficeAuthority({ authority_roles: ["sign_permit"] }, "Reviewer", "2026-09-27T11:00:00.000Z");
  assert.equal(next.authority_verification_status, "staff_verified");
  assert.equal(next.authority_verified_by, "Reviewer");
  assert.equal(next.authority_verified_at, "2026-09-27T11:00:00.000Z");
});

test("staff verification fails closed for unsupported roles and does not mutate the source office", () => {
  const office = { authority_roles: ["zoning", "legacy_unknown"], authority_verification_status: "needs_verification", authority_verification_notes: "Needs migration review" };
  assert.throws(() => verifyLocalityOfficeAuthority(office, "Reviewer"), /Unsupported authority role: legacy_unknown/);
  assert.equal(office.authority_verification_status, "needs_verification");
  assert.deepEqual(office.authority_roles, ["zoning", "legacy_unknown"]);
  assert.equal(office.authority_verification_notes, "Needs migration review");
});

test("staff verification deduplicates supported roles without changing their order", () => {
  const next = verifyLocalityOfficeAuthority({ authority_roles: ["zoning", "building", "zoning"] }, "Reviewer", "2026-09-27T11:30:00.000Z");
  assert.deepEqual(next.authority_roles, ["zoning", "building"]);
  assert.equal(next.authority_verification_status, "staff_verified");
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

test("verified locality authority is revoked after material identity/contact edits, preserving provenance", () => {
  const office = {
    id: "local-1", catalog_office_id: "catalog-1", government_office_id: "gov-1",
    name: "County Zoning", contact_phone: "555-0100", contact_email: "office@example.gov",
    contact_website: "https://example.gov", contact_address: "1 Main Street",
    authority_roles: ["sign_permit", "zoning"], authority_verification_notes: "Ordinance and staff review",
    authority_verification_status: "staff_verified", authority_verified_at: "2026-09-27T10:00:00.000Z",
    authority_verified_by: "Reviewer", workflow_steps: [{ id: "submit", name: "Submit application" }],
  };
  for (const [field, replacement] of [
    ["name", "County Planning"], ["contact_phone", "555-0200"],
    ["contact_email", "planning@example.gov"], ["contact_website", "https://planning.example.gov"],
    ["contact_address", "2 Main Street"],
  ]) {
    const edited = updateLocalityOfficeIdentity(office, { [field]: replacement });
    assert.equal(edited[field], replacement, field);
    assert.equal(edited.authority_verification_status, "needs_verification", field);
    assert.equal(edited.authority_verified_at, undefined, field);
    assert.equal(edited.authority_verified_by, undefined, field);
    assert.equal(edited.id, office.id, field);
    assert.equal(edited.catalog_office_id, office.catalog_office_id, field);
    assert.equal(edited.government_office_id, office.government_office_id, field);
    assert.deepEqual(edited.authority_roles, office.authority_roles, field);
    assert.equal(edited.authority_verification_notes, office.authority_verification_notes, field);
    assert.deepEqual(edited.workflow_steps, office.workflow_steps, field);
  }
  assert.equal(office.authority_verification_status, "staff_verified");
});

test("changing a canonical office relationship revokes locality authority verification without losing review evidence", () => {
  const office = {
    id: "local-relationship", catalog_office_id: "catalog-1", government_office_id: "gov-1",
    authority_roles: ["zoning", "building"], authority_verification_status: "staff_verified",
    authority_verified_at: "2026-09-27T10:00:00.000Z", authority_verified_by: "Reviewer",
    authority_verification_notes: "Verified against county responsibility page",
    workflow_steps: [{ id: "submit", name: "Submit" }],
  };
  for (const [field, replacement] of [["catalog_office_id", "catalog-2"], ["government_office_id", "gov-2"]]) {
    const edited = updateLocalityOfficeIdentity(office, { [field]: replacement });
    assert.equal(edited[field], replacement, field);
    assert.equal(edited.authority_verification_status, "needs_verification", field);
    assert.equal(edited.authority_verified_at, undefined, field);
    assert.equal(edited.authority_verified_by, undefined, field);
    assert.deepEqual(edited.authority_roles, office.authority_roles, field);
    assert.equal(edited.authority_verification_notes, office.authority_verification_notes, field);
    assert.deepEqual(edited.workflow_steps, office.workflow_steps, field);
  }
});

test("unchanged or whitespace-only canonical relationship IDs preserve verified authority", () => {
  const office = {
    catalog_office_id: "catalog-1", government_office_id: "gov-1", authority_roles: ["zoning"],
    authority_verification_status: "staff_verified", authority_verified_at: "2026-09-27T10:00:00.000Z", authority_verified_by: "Reviewer",
  };
  for (const patch of [{ catalog_office_id: " catalog-1 " }, { government_office_id: " gov-1 " }]) {
    const edited = updateLocalityOfficeIdentity(office, patch);
    assert.equal(edited.authority_verification_status, "staff_verified");
    assert.equal(edited.authority_verified_by, "Reviewer");
  }
});

test("formatting-only edits and workflow, office-type or note edits preserve verified authority", () => {
  const office = {
    name: "County Zoning", contact_phone: "555-0100", authority_roles: ["zoning"],
    authority_verification_status: "staff_verified", authority_verified_by: "Reviewer",
    authority_verified_at: "2026-09-27T10:00:00.000Z",
  };
  for (const patch of [
    { name: "  County Zoning  " }, { contact_phone: " 555-0100 " },
    { office_type: "Building" }, { contact_notes: "New hours" },
    { authority_verification_notes: "Expanded citation" },
    { workflow_steps: [{ id: "next", name: "Follow up" }] },
  ]) {
    const edited = updateLocalityOfficeIdentity(office, patch);
    assert.equal(edited.authority_verification_status, "staff_verified");
    assert.equal(edited.authority_verified_by, "Reviewer");
    assert.equal(edited.authority_verified_at, office.authority_verified_at);
  }
});

test("unverified legacy office edits do not manufacture review status or change office links", () => {
  const office = { id: "local-2", name: "Legacy", catalog_office_id: "template-2", authority_roles: ["zoning"] };
  const edited = updateLocalityOfficeIdentity(office, { name: "Updated", contact_email: "mail@example.gov" });
  assert.equal(edited.name, "Updated");
  assert.equal(edited.authority_verification_status, undefined);
  assert.equal(edited.catalog_office_id, "template-2");
});

test("locality editor routes direct identity/contact edits through verification invalidation", () => {
  const ui = readFileSync(new URL("../src/components/permitting/LocalityOfficeEditor.jsx", import.meta.url), "utf8");
  assert.match(ui, /onChange\(updateLocalityOfficeIdentity\(office, patch\)\)/);
  for (const field of ["name", "contact_phone", "contact_email", "contact_website", "contact_address"]) {
    assert.match(ui, new RegExp(`update\\(\\{ ${field}: e\\.target\\.value \\}\\)`));
  }
});
