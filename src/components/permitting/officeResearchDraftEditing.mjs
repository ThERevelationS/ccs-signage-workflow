import { officeResearchChecklist, OFFICE_RESEARCH_METHOD } from "../../../base44/shared/permittingOfficeResearch.mjs";
import { safeGovernmentOfficeSourceUrl } from "./governmentOfficeCatalog.js";

const text = (value, limit = 1000) => typeof value === "string" && value.trim()
  ? value.trim().slice(0, limit)
  : null;

export function updateOfficeResearchDraft(research, index, draft, { actor = "", now = () => new Date().toISOString() } = {}) {
  if (research?.method !== OFFICE_RESEARCH_METHOD || !Array.isArray(research.roles))
    throw new Error("This office research version cannot be edited. Refresh the jurisdiction first.");
  if (!Number.isInteger(index) || index < 0 || index >= research.roles.length || !draft || typeof draft !== "object")
    throw new Error("The selected office research finding is no longer available.");

  const current = research.roles[index];
  const definition = officeResearchChecklist.roles.find(role => role.key === current?.role);
  if (!definition) throw new Error("The selected office role is not recognized.");
  const sourceInput = String(draft.official_source_url || "").trim();
  const source = sourceInput ? safeGovernmentOfficeSourceUrl(sourceInput) : "";
  if (sourceInput && !source) throw new Error("Enter a valid HTTPS source URL without embedded credentials.");
  const applicability = ["unknown", "potentially_applicable", "not_applicable_candidate"].includes(draft.applicability)
    ? draft.applicability
    : "unknown";
  const researchFieldKeys = [...new Set([
    ...officeResearchChecklist.common_research_fields,
    ...(definition.research_fields || []),
  ])];
  const contactKeys = ["phone", "email", "address"];
  const next = {
    ...current,
    verification_status: "needs_verification",
    office_name: text(draft.office_name, 200),
    official_source_url: source || null,
    applicability,
    service_area: text(draft.service_area),
    responsibility_quote: text(draft.responsibility_quote),
    delegation_quote: text(draft.delegation_quote),
    contact_info: {
      ...(current.contact_info || {}),
      ...Object.fromEntries(contactKeys.map(key => [key, text(draft.contact_info?.[key], 300)])),
    },
    research_fields: {
      ...(current.research_fields || {}),
      ...Object.fromEntries(researchFieldKeys.map(key => [key, text(draft.research_fields?.[key])])),
    },
    notes: text(draft.notes),
  };
  const editedAt = typeof now === "function" ? now() : now;
  const roles = research.roles.map((row, rowIndex) => rowIndex === index ? next : row);
  return {
    ...research,
    verification_status: "needs_verification",
    staff_edited_at: editedAt,
    staff_edited_by: String(actor || "").trim() || "CCS Staff",
    roles,
  };
}
