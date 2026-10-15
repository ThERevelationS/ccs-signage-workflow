import test from "node:test";
import assert from "node:assert/strict";
import { updateLocalityOfficeIdentity } from "../src/components/permitting/localityAuthorityVerification.js";

const reviewedOffice = {
  id: "office-1",
  name: "Electrical Services",
  authority_roles: ["electrical_permit", "electrical_inspection"],
  authority_verification_status: "staff_verified",
  authority_verified_by: "Reviewer",
  authority_verified_at: "2026-10-14T10:00:00.000Z",
  authority_verification_notes: "Issuer and inspection responsibility checked separately.",
};

test("editing review evidence clears the verification while preserving roles and revised notes", () => {
  const next = updateLocalityOfficeIdentity(reviewedOffice, {
    authority_verification_notes: "Inspection responsibility still needs confirmation.",
  });

  assert.equal(next.authority_verification_status, "needs_verification");
  assert.equal(next.authority_verified_by, undefined);
  assert.equal(next.authority_verified_at, undefined);
  assert.deepEqual(next.authority_roles, ["electrical_permit", "electrical_inspection"]);
  assert.equal(next.authority_verification_notes, "Inspection responsibility still needs confirmation.");
  assert.equal(reviewedOffice.authority_verification_status, "staff_verified");
  assert.equal(reviewedOffice.authority_verification_notes, "Issuer and inspection responsibility checked separately.");
});

test("unchanged notes and workflow-only edits do not revoke authority verification", () => {
  const next = updateLocalityOfficeIdentity(reviewedOffice, {
    authority_verification_notes: reviewedOffice.authority_verification_notes,
    workflow_steps: [{ id: "step-1", name: "Submit application" }],
  });

  assert.equal(next.authority_verification_status, "staff_verified");
  assert.equal(next.authority_verified_by, "Reviewer");
  assert.equal(next.authority_verification_notes, reviewedOffice.authority_verification_notes);
});
