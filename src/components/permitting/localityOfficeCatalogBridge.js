import { governmentOfficeMetadata } from "./governmentOfficeCatalog.js";

/**
 * A locality owns its editable office copy and workflow, while the optional
 * catalog_office_id records which reusable catalog office it came from.
 * A catalog match alone does not verify that office's legal authority.
 */
export function canonicalGovernmentOfficeId(office) {
  const source = office && typeof office === "object" ? office : {};
  return String(source.government_office_id || source.id || "").trim();
}

export function copyCatalogOfficeToLocality(catalogOffice, order, makeId = () => `${Date.now()}-${Math.random()}`) {
  const source = catalogOffice && typeof catalogOffice === "object" ? catalogOffice : {};
  const catalogId = String(source.id || "").trim();
  const governmentOfficeId = canonicalGovernmentOfficeId(source);
  const metadata = governmentOfficeMetadata(source);
  return {
    id: makeId(),
    ...(catalogId ? { catalog_office_id: catalogId } : {}),
    ...(governmentOfficeId ? { government_office_id: governmentOfficeId } : {}),
    name: metadata.name || source.name || "",
    office_type: source.office_type || "",
    contact_phone: metadata.phone,
    contact_email: metadata.email,
    contact_website: metadata.website,
    contact_address: metadata.address,
    contact_notes: metadata.notes,
    workflow_steps: (source.workflow_steps || []).map(step => ({
      ...step,
      id: `${makeId()}-${step.id}`,
    })),
    order,
  };
}
