function clean(value) {
  return String(value || "").trim();
}

export function normalizeGovernmentOfficeCatalogEntry(office) {
  const source = office && typeof office === "object" ? office : {};
  const id = clean(source.id);
  const governmentOfficeId = clean(source.government_office_id) || id;
  const metadata = source.government_office && typeof source.government_office === "object" ? source.government_office : {};
  return {
    ...source,
    ...(governmentOfficeId ? { government_office_id: governmentOfficeId } : {}),
    government_office: {
      name: clean(metadata.name) || clean(source.name),
      phone: clean(metadata.phone) || clean(source.contact_phone),
      email: clean(metadata.email) || clean(source.contact_email),
      website: clean(metadata.website) || clean(source.contact_website),
      address: clean(metadata.address) || clean(source.contact_address),
      notes: clean(metadata.notes) || clean(source.contact_notes),
    },
  };
}

export function updateGovernmentOfficeCatalogEntry(office, patch) {
  const source = office && typeof office === "object" ? office : {};
  const next = { ...source, ...patch };
  const metadata = { ...(source.government_office || {}) };
  const fieldMap = {
    name: "name",
    contact_phone: "phone",
    contact_email: "email",
    contact_website: "website",
    contact_address: "address",
    contact_notes: "notes",
  };
  for (const [legacyField, metadataField] of Object.entries(fieldMap)) {
    if (Object.hasOwn(patch || {}, legacyField)) metadata[metadataField] = clean(patch[legacyField]);
  }
  return normalizeGovernmentOfficeCatalogEntry({ ...next, government_office: metadata });
}

export function governmentOfficeMetadata(office) {
  return normalizeGovernmentOfficeCatalogEntry(office).government_office;
}
