import { localityOfficeReviewEvidence } from "./localityOfficeReviewEvidence";

export default function LocalityOfficeReviewEvidence({ office, provenance }) {
  const evidence = localityOfficeReviewEvidence(office, provenance);
  return (
    <section aria-label="Locality authority review evidence" className="rounded border bg-gray-50 p-2 text-xs space-y-2">
      <h6 className="font-semibold">Review evidence</h6>
      <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {evidence.electrical.map(item => <div key={item.role}><dt className="text-gray-600">{item.label}</dt><dd className="font-medium">{item.status}</dd></div>)}
      </dl>
      <p className="whitespace-pre-wrap break-words">Locality authority notes: {evidence.notes || "No supporting notes recorded."}</p>
      {evidence.reviewer && <p className="break-words">Reviewed by: {evidence.reviewer}{evidence.reviewedAt ? " · " + evidence.reviewedAt : ""}</p>}
      {evidence.sharedNotes && <p className="whitespace-pre-wrap break-words">Shared office identity notes: {evidence.sharedNotes}</p>}
      <div className="flex flex-wrap gap-3">
        {evidence.sharedSource && <a href={evidence.sharedSource} target="_blank" rel="noopener noreferrer" className="underline text-blue-700">Open shared office source</a>}
        {evidence.website && <a href={evidence.website} target="_blank" rel="noopener noreferrer" className="underline text-blue-700">Open office website</a>}
      </div>
      <p className="text-gray-600">Shared sources and websites are reference material. Confirm each responsibility for this locality before marking authority verified. Issuance and inspection may belong to different offices.</p>
    </section>
  );
}
