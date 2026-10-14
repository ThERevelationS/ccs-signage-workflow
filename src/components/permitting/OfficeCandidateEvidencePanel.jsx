import { officeCandidateEvidence } from "./officeCandidateEvidence.mjs";
import OfficeIdentityComparisonPanel from "./OfficeIdentityComparisonPanel";

export default function OfficeCandidateEvidencePanel({ office }) {
  const evidence = officeCandidateEvidence(office);
  if (!evidence) return null;
  const rows = [
    ["Printed office name", evidence.printedName],
    ["Editable catalog name", evidence.currentName],
    ["Current official name / parent / division", "Not established by this registration; review separately."],
    ["Candidate ID", evidence.officeId],
    ["Government office ID", evidence.governmentOfficeId],
    ["Profile", [evidence.profileName, evidence.profileState, evidence.profileType].filter(Boolean).join(" / ")],
    ["Profile ID", evidence.profileId],
    ["Source catalog ID", evidence.sourceId],
    ["Saved archive document ID", evidence.archiveDocumentId],
    ["Physical PDF page", evidence.physicalPage],
    ["Exact page text SHA-256", evidence.pageHash],
    ["Archive SHA-256", evidence.archiveHash],
    ["Registration key", evidence.registrationKey],
    ["Registered at", evidence.registeredAt],
    ["Classification at registration", evidence.classification],
    ["Currentness at registration", evidence.contentStatus],
  ];
  return <section aria-label="Office candidate registration evidence" className="rounded border border-amber-200 bg-amber-50 p-3 text-xs space-y-2">
    <h5 className="font-semibold">Review the printed office identity</h5>
    <p>This is retained registration evidence. Current official names, parent departments, divisions and aliases require separate review. A matching name does not confirm equivalence.</p>
    {evidence.gaps.length > 0 && <div role="status" className="text-amber-900">
      <p className="font-medium">Evidence needs attention</p>
      <ul className="list-disc pl-4">{evidence.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>
    </div>}
    <dl className="grid grid-cols-1 sm:grid-cols-[minmax(9rem,1fr)_2fr] gap-x-3 gap-y-1">
      {rows.map(([label, value]) => <div key={label} className="contents">
        <dt className="font-medium">{label}</dt><dd className="min-w-0 break-all whitespace-pre-wrap">{value || "Not retained"}</dd>
      </div>)}
    </dl>
    <div className="flex flex-wrap gap-3">
      {evidence.officialHref && <a className="text-blue-700 underline" href={evidence.officialHref} target="_blank" rel="noopener noreferrer">Recorded official guide (new tab)</a>}
      {evidence.archiveHref && <a className="text-blue-700 underline" href={evidence.archiveHref} target="_blank" rel="noopener noreferrer">Retained archive (new tab)</a>}
    </div>
    <OfficeIdentityComparisonPanel office={office} />
    <p>Historical classification and currentness above may differ from the source catalog today. This panel makes no fresh source check.</p>
    <p>Contacts, permit inboxes, roles, covered areas, currentness, commercial-sign applicability and delegation remain separate evidence decisions. Do not copy a director contact into a permit inbox.</p>
  </section>;
}
