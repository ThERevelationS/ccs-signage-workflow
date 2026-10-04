function clean(value) {
  return String(value || "").trim();
}

const OFFICE_VERIFICATION_STATUSES = new Set(["needs_verification", "staff_verified"]);

function normalizeVerification(metadata) {
  const status = OFFICE_VERIFICATION_STATUSES.has(metadata?.verification_status)
    ? metadata.verification_status
    : "needs_verification";
  return {
    verification_status: status,
    verified_at: status === "staff_verified" ? clean(metadata?.verified_at) : "",
    verified_by: status === "staff_verified" ? clean(metadata?.verified_by) : "",
    verification_notes: clean(metadata?.verification_notes),
    source_url: clean(metadata?.source_url),
  };
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
      // Preserve retained identity evidence and state alongside normalized contacts.
      // Older catalog edits must not discard metadata added by newer review paths.
      ...metadata,
      name: clean(metadata.name) || clean(source.name),
      phone: clean(metadata.phone) || clean(source.contact_phone),
      email: clean(metadata.email) || clean(source.contact_email),
      website: clean(metadata.website) || clean(source.contact_website),
      address: clean(metadata.address) || clean(source.contact_address),
      notes: clean(metadata.notes) || clean(source.contact_notes),
      ...normalizeVerification(metadata),
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
  const before = normalizeGovernmentOfficeCatalogEntry(source).government_office;
  const updated = normalizeGovernmentOfficeCatalogEntry({ ...next, government_office: metadata });
  // Changing the identity/contact details invalidates only this shared office's
  // verification claim. Keep the official source and reviewer notes for re-review.
  const identityFields = ["name", "phone", "email", "website", "address"];
  if (before.verification_status === "staff_verified" &&
    identityFields.some((field) => before[field] !== updated.government_office[field])) {
    return updateGovernmentOfficeVerification(updated, { verification_status: "needs_verification" });
  }
  return updated;
}

export function updateGovernmentOfficeVerification(office, patch, reviewer = "", now = () => new Date().toISOString()) {
  const source = normalizeGovernmentOfficeCatalogEntry(office);
  const metadata = { ...source.government_office };
  const previousSourceUrl = metadata.source_url;
  if (Object.hasOwn(patch || {}, "source_url")) metadata.source_url = clean(patch.source_url);
  if (Object.hasOwn(patch || {}, "verification_notes")) metadata.verification_notes = clean(patch.verification_notes);
  // A verified claim is tied to the official source staff reviewed. Changing that
  // source requires a fresh verification, while retaining the new URL and notes.
  if (metadata.verification_status === "staff_verified" &&
    previousSourceUrl !== metadata.source_url && !Object.hasOwn(patch || {}, "verification_status")) {
    metadata.verification_status = "needs_verification";
    metadata.verified_at = "";
    metadata.verified_by = "";
  }
  if (patch?.verification_status === "staff_verified") {
    metadata.verification_status = "staff_verified";
    metadata.verified_at = clean(patch.verified_at) || clean(now());
    metadata.verified_by = clean(patch.verified_by) || clean(reviewer);
  } else if (patch?.verification_status === "needs_verification") {
    metadata.verification_status = "needs_verification";
    metadata.verified_at = "";
    metadata.verified_by = "";
  }
  return normalizeGovernmentOfficeCatalogEntry({ ...source, government_office: metadata });
}

/** Only provide navigable links to absolute HTTPS source URLs without credentials. */
export function safeGovernmentOfficeSourceUrl(value) {
  const raw = clean(value);
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export function governmentOfficeMetadata(office) {
  return normalizeGovernmentOfficeCatalogEntry(office).government_office;
}
