import test from "node:test";
import assert from "node:assert/strict";
import { officeResearchChecklist, normalizeOfficeResearch } from "../base44/shared/permittingOfficeResearch.mjs";
import { updateOfficeResearchDraft } from "../src/components/permitting/officeResearchDraftEditing.mjs";

const research = normalizeOfficeResearch({
  roles: [
    { role: "electrical_permit", office_name: "Permit Office", official_source_url: "https://fixture.gov/permits",
      applicability: "potentially_applicable", service_area: "Fixture City",
      responsibility_quote: "The office issues electrical permits.", research_fields: { permit_application: "Use the online application." } },
    { role: "electrical_inspection", office_name: "Inspector", official_source_url: "https://fixture.gov/inspections",
      applicability: "unknown", service_area: "Fixture City", responsibility_quote: "The office performs inspections.",
      research_fields: { required_inspection_stages: "Rough and final." } },
  ],
}, { jurisdiction: { id: "fixture", name: "Fixture City", state: "OH", type: "city" }, now: () => "2026-10-15T12:00:00.000Z" });

test("staff can update one saved electrical role without merging or verifying the other", () => {
  const before = structuredClone(research);
  const draft = structuredClone(research.roles[1]);
  draft.office_name = "Revised Inspector";
  draft.applicability = "potentially_applicable";
  draft.research_fields.required_inspection_stages = "Rough, final, and service inspection.";
  const next = updateOfficeResearchDraft(research, 1, draft, {
    actor: "Reviewer",
    now: () => "2026-10-15T13:00:00.000Z",
  });

  assert.equal(next.roles[0].office_name, "Permit Office");
  assert.equal(next.roles[1].office_name, "Revised Inspector");
  assert.equal(next.roles[1].research_fields.required_inspection_stages, "Rough, final, and service inspection.");
  assert.equal(next.roles[1].verification_status, "needs_verification");
  assert.equal(next.verification_status, "needs_verification");
  assert.equal(next.staff_edited_by, "Reviewer");
  assert.equal(next.staff_edited_at, "2026-10-15T13:00:00.000Z");
  assert.deepEqual(research, before);
});

test("invalid source URLs are rejected and saved findings stay unverified", () => {
  const draft = structuredClone(research.roles[0]);
  draft.official_source_url = "javascript:alert(1)";
  assert.throws(() => updateOfficeResearchDraft(research, 0, draft), /valid HTTPS source URL/);
  assert.equal(research.roles[0].verification_status, "needs_verification");
});

test("research fields are limited to the selected role checklist and unknown roles fail closed", () => {
  const expected = officeResearchChecklist.roles.find(role => role.key === "electrical_inspection");
  assert.ok(expected.research_fields.includes("required_inspection_stages"));
  assert.throws(() => updateOfficeResearchDraft(research, 99, {}), /no longer available/);
  const invalid = structuredClone(research);
  invalid.roles[0].role = "invented_role";
  assert.throws(() => updateOfficeResearchDraft(invalid, 0, invalid.roles[0]), /not recognized/);
});
