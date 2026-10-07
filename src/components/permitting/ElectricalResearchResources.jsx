import research from "./cincinnatiElectricalResearch.json";

export default function ElectricalResearchResources({ jurisdiction, isAdmin = false }) {
  if (!isAdmin || jurisdiction?.id !== research.jurisdiction_id ||
      jurisdiction?.name !== research.name || jurisdiction?.state !== research.state ||
      jurisdiction?.type !== research.type) return null;
  return <details className="min-w-0 rounded-lg border border-amber-200 bg-amber-50">
    <summary className="min-h-11 cursor-pointer p-3 text-sm font-semibold text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">
      Cincinnati electrical research — awaiting staff review
    </summary>
    <section className="min-w-0 space-y-3 p-3 pt-0 text-sm [overflow-wrap:anywhere]" aria-label="Unapproved electrical research">
      <p>Inspection Bureau, Inc. is an unapproved candidate for permit and inspection responsibilities. These references do not establish either role, service coverage, or sign-specific requirements.</p>
      <p>City sign guidance supports researching both roles, but the retained handout is dated May 2017. References observed {research.observed_on}. Confirm current submission routing, fees, contractor requirements, and inspection stages with the responsible office.</p>
      <p>The 2017 handout describes submitting paper plan copies. The <a className="underline" href="https://www.cincinnati-oh.gov/buildings/submitting-your-application/electronic-document-submission/" target="_blank" rel="noopener noreferrer">City electronic submission page</a> describes email intake and digital uploads. Confirm the applicable sign submission route; the City process is separate from IBI electrical submissions.</p>
      <ul className="space-y-3">
        {research.resources.map(resource => <li key={resource.file}>
          <p className="font-medium">{resource.label}</p>
          <p>{resource.note}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <a className="min-h-11 inline-flex items-center underline" href={resource.archive} target="_blank" rel="noopener noreferrer">Retained PDF</a>
            <a className="min-h-11 inline-flex items-center underline" href={resource.source} target="_blank" rel="noopener noreferrer">Official source</a>
          </div>
        </li>)}
      </ul>
      <p><a className="underline" href="https://eztrak.cagis.org/CitizenAccess/Default.aspx" target="_blank" rel="noopener noreferrer">Provider-linked Ohio ezTrak portal</a> — operational availability has not been verified.</p>
      <p><a className="underline" href="https://www.inspectionbureau.com/online-inspection-scheduling/" target="_blank" rel="noopener noreferrer">Provider inspection scheduling page</a> — Ohio applicability after the migration remains unresolved.</p>
      <p>The inspection-area spreadsheet could not be retained. No service-area authority has been verified.</p>
      {research.scope_review && <section className="space-y-2 border-t border-amber-200 pt-3" aria-label="Related zoning scope research">
        <p className="font-semibold">Related City zoning scope — awaiting review</p>
        <p>The City's zoning guidance covers land within Cincinnati. Check the actual City boundary, base zoning district, and applicable overlays for each property. A Cincinnati mailing address alone does not resolve jurisdiction. This zoning scope does not establish IBI electrical service coverage.</p>
        <p>Current sign exemptions and the dated handout's legal applicability remain unresolved. Confirm the zoning request form's current fee before submitting.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <a className="min-h-11 inline-flex items-center underline" href={research.scope_review.source} target="_blank" rel="noopener noreferrer">City zoning guidance</a>
          <a className="min-h-11 inline-flex items-center underline" href={research.scope_review.form_archive} target="_blank" rel="noopener noreferrer">Retained zoning request PDF</a>
          <a className="min-h-11 inline-flex items-center underline" href={research.scope_review.form_source} target="_blank" rel="noopener noreferrer">Official zoning request</a>
        </div>
      </section>}
    </section>
  </details>;
}
