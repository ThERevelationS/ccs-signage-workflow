import dossiers from "./ohioMunicipalResearch.json";

export default function OhioMunicipalResearchResources({ jurisdiction, isAdmin = false }) {
  const dossier = isAdmin && dossiers.find(row => ["id", "name", "state", "type"].every(key => row[key] === jurisdiction?.[key]));
  if (!dossier) return null;
  return <details className="min-w-0 rounded-lg border border-amber-200 bg-amber-50">
    <summary className="min-h-11 cursor-pointer p-3 text-sm font-semibold text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">
      {dossier.name} permit and electrical research — awaiting staff review
    </summary>
    <section className="min-w-0 space-y-3 p-3 pt-0 text-sm [overflow-wrap:anywhere]" aria-label={`${dossier.name} unapproved permitting research`}>
      <p>Official references observed {dossier.observed_on}. These documents remain unreviewed for current fees, sign applicability, office responsibility, and geographic coverage.</p>
      <ul className="list-disc space-y-2 pl-5">{dossier.notes.map(note => <li key={note}>{note}</li>)}</ul>
      <p><a className="underline" href={dossier.source} target="_blank" rel="noopener noreferrer">Official City department page</a></p>
      {dossier.online_form_url && <p><a className="min-h-11 inline-flex items-center underline" href={dossier.online_form_url} target="_blank" rel="noopener noreferrer">Officially linked online application portal</a></p>}
      {[...(dossier.references || []), ...(dossier.ocr_references || [])].map(reference => <p key={reference.url}><a className="min-h-11 inline-flex items-center underline" href={reference.url} target="_blank" rel="noopener noreferrer">{reference.label}</a></p>)}
      <ul className="space-y-3">{dossier.resources.map(resource => <li key={resource.file}>
        <p className="font-medium">{resource.label}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <a className="min-h-11 inline-flex items-center underline" href={resource.archive} target="_blank" rel="noopener noreferrer">Retained {resource.format}</a>
          <a className="min-h-11 inline-flex items-center underline" href={resource.source} target="_blank" rel="noopener noreferrer">Official document</a>
        </div>
      </li>)}</ul>
      {(dossier.document_findings || dossier.extraction_note) && <section className="space-y-3 rounded border border-amber-200 p-3" aria-label="Retained document findings">
        <p className="font-medium">Document findings — currentness and applicability unreviewed</p>
        {dossier.extraction_note && <p>{dossier.extraction_note}</p>}
        <ul className="space-y-3">{dossier.document_findings?.map(finding => <li key={finding.label}>
          <p className="font-medium">{finding.label}</p><p>{finding.text}</p>
          <a className="min-h-11 inline-flex items-center underline" href={finding.archive} target="_blank" rel="noopener noreferrer">Original PDF — physical page {finding.physical_page}</a>
        </li>)}</ul>
      </section>}
      {dossier.electrical_research && <section className="space-y-2 rounded border border-amber-200 p-3" aria-label="Electrical provider routing research">
        <p className="font-medium">Electrical provider routing — municipal coverage unresolved</p>
        <p>{dossier.electrical_research.note}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <a className="min-h-11 inline-flex items-center underline" href={dossier.electrical_research.guide_archive} target="_blank" rel="noopener noreferrer">Retained ezTrak guide PDF</a>
          <a className="min-h-11 inline-flex items-center underline" href={dossier.electrical_research.guide_source} target="_blank" rel="noopener noreferrer">Official guide</a>
          <a className="min-h-11 inline-flex items-center underline" href={dossier.electrical_research.portal} target="_blank" rel="noopener noreferrer">CAGIS ezTrak portal</a>
          <a className="min-h-11 inline-flex items-center underline" href={dossier.electrical_research.schedule_source} target="_blank" rel="noopener noreferrer">Official inspection-area XLS — retention gap</a>
        </div>
      </section>}
      <p>Electrical permit issuance and electrical inspection are separate pending reviews. These research references do not create an approved workflow.</p>
    </section>
  </details>;
}
