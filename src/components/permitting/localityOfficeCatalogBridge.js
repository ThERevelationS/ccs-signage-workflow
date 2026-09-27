/**
 * A locality owns its editable office copy and workflow, while the optional
 * catalog_office_id records which reusable catalog office it came from.
 * A catalog match alone does not verify that office's legal authority.
 */
export function copyCatalogOfficeToLocality(catalogOffice, order, makeId = () => `${Date.now()}-${Math.random()}`) {
  const source = catalogOffice && typeof catalogOffice === "object" ? catalogOffice : {};
  const catalogId = String(source.id || "").trim();
  return {
    id: makeId(),
    ...(catalogId ? { catalog_office_id: catalogId } : {}),
    name: source.name || "",
    office_type: source.office_type || "",
    contact_phone: source.contact_phone || "",
    contact_email: source.contact_email || "",
    contact_website: source.contact_website || "",
    contact_address: source.contact_address || "",
    contact_notes: source.contact_notes || "",
    workflow_steps: (source.workflow_steps || []).map(step => ({
      ...step,
      id: `${makeId()}-${step.id}`,
    })),
    order,
  };
}
