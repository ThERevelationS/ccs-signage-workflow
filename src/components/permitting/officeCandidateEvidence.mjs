import { safeGovernmentOfficeSourceUrl } from "./governmentOfficeCatalog.js";

const text = value => typeof value === "string" ? value.trim() : "";
const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};

/** Presentation only: registration is historical evidence, never a fresh source read. */
export function officeCandidateEvidence(office) {
  if (!office?.office_candidate_registration) return null;
  const registration = object(office.office_candidate_registration);
  const snapshot = object(registration.snapshot);
  const source = object(snapshot.source), profile = object(snapshot.profile), proof = object(snapshot.proof);
  const printedName = text(proof.excerpt);
  const currentName = text(office.name);
  const officeId = text(office.id), governmentOfficeId = text(office.government_office_id);
  const gaps = [];
  if (!officeId || governmentOfficeId !== officeId) gaps.push("Candidate identifiers are missing or differ.");
  if (!text(registration.registration_key)) gaps.push("Registration key is missing.");
  if (!text(source.id) || !text(profile.id) || source.jurisdiction_id !== profile.id) gaps.push("Source and profile lineage is missing or differs.");
  if (!text(snapshot.archive_document_id)) gaps.push("Saved archive document ID is missing.");
  if (!Number.isInteger(proof.physical_page) || proof.physical_page < 1 || !printedName ||
      !/^[a-f0-9]{64}$/.test(text(proof.text_sha256))) gaps.push("Exact page evidence is incomplete.");
  if (!/^[a-f0-9]{64}$/.test(text(source.file_hash_sha256))) gaps.push("Archive hash is missing or invalid.");
  if (printedName && currentName !== printedName) gaps.push("Editable catalog name differs from the printed registration name.");
  const officialHref = safeGovernmentOfficeSourceUrl(source.official_url);
  const archiveHref = safeGovernmentOfficeSourceUrl(source.archived_file_url);
  if (!officialHref || !archiveHref) gaps.push("A recorded source or archive URL needs review.");
  return { officeId, governmentOfficeId, currentName, printedName, profileName: text(profile.name),
    profileState: text(profile.state), profileType: text(profile.type), profileId: text(profile.id),
    sourceId: text(source.id), archiveDocumentId: text(snapshot.archive_document_id),
    registrationKey: text(registration.registration_key), registeredAt: text(registration.registered_at),
    physicalPage: Number.isInteger(proof.physical_page) && proof.physical_page > 0 ? proof.physical_page : null,
    pageHash: text(proof.text_sha256), archiveHash: text(source.file_hash_sha256),
    classification: text(source.authority_classification), contentStatus: text(source.content_status),
    officialHref, archiveHref, gaps };
}
