import packets from "./officeIdentityComparisonEvidence.json";
import { officeCandidateEvidence } from "./officeCandidateEvidence.mjs";
import { safeGovernmentOfficeSourceUrl } from "./governmentOfficeCatalog.js";

const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Retained observations only. All exact bindings must match before displaying proof. */
export function officeIdentityComparison(office, evidencePackets = packets, now = Date.now()) {
  const evidence = officeCandidateEvidence(office);
  const packet = Array.isArray(evidencePackets) ? evidencePackets.find(p => p?.candidate_id === office?.id) : null;
  if (!packet) return null;
  const profile = office?.office_candidate_registration?.snapshot?.profile;
  const bindings = [
    [packet.registration_key, evidence?.registrationKey], [packet.profile_id, evidence?.profileId],
    [packet.profile_name, profile?.name], [packet.profile_state, profile?.state], [packet.profile_type, profile?.type],
    [packet.source_id, evidence?.sourceId], [packet.archive_document_id, evidence?.archiveDocumentId],
    [packet.archive_sha256, evidence?.archiveHash], [packet.official_url, evidence?.officialHref],
    [packet.printed_name, evidence?.printedName], [packet.physical_page, evidence?.physicalPage],
    [packet.page_sha256, evidence?.pageHash],
  ];
  const mismatch = !evidence || evidence.gaps.length > 0 ||
    packet.method !== "retained-office-identity-comparison-v1" ||
    bindings.some(([expected, actual]) => !expected || expected !== actual);
  if (mismatch) return { warning: "Retained official comparison withheld: candidate or registration lineage has changed or is incomplete.", observations: [] };
  const observations = packet.observations;
  const valid = Array.isArray(observations) && observations.length > 0 && observations.length <= 5 &&
    observations.every(p => {
      const href = safeGovernmentOfficeSourceUrl(p?.url);
      return href && new URL(href).hostname === new URL(evidence.officialHref).hostname &&
        hash(p.sha256) && Number.isInteger(p.bytes) && p.bytes > 0 &&
        Number.isFinite(Date.parse(p.observed_at)) && Array.isArray(p.quotes) &&
        p.quotes.length > 0 && p.quotes.every(q => typeof q === "string" && q.trim()) &&
        typeof p.name === "string" && p.name.trim();
    });
  if (!valid || !Number.isFinite(now)) return { warning: "Retained official comparison withheld: proof metadata is incomplete or unsafe.", observations: [] };
  // Age is a display reminder, never a legal/currentness approval or automatic scan trigger.
  const stale = observations.some(p => now - Date.parse(p.observed_at) > 30 * 86400000 || Date.parse(p.observed_at) > now);
  return { observations, guideContact: packet.guide_contact, unresolved: packet.unresolved,
    warning: stale ? "Retained observations are over 30 days old or have a future timestamp. Recheck official sources before a decision." : "",
    observedOnly: true };
}
