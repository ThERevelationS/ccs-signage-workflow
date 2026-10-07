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
      <ul className="space-y-3">
        {research.resources.map(resource => <li key={resource.file}>
          <p className="font-medium">{resource.label}</p>
          <p>{resource.note}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <a className="min-h-11 inline-flex items-center underline" href={resource.archive} target="_blank" rel="noopener noreferrer">Retained PDF</a>
            <a className="min-h-11 inline-flex items-center underline" href={resource.source} target="_blank" rel="noopener noreferrer">Provider source</a>
          </div>
        </li>)}
      </ul>
      <p><a className="underline" href="https://eztrak.cagis.org/CitizenAccess/Default.aspx" target="_blank" rel="noopener noreferrer">Provider-linked Ohio ezTrak portal</a> — operational availability has not been verified.</p>
      <p><a className="underline" href="https://www.inspectionbureau.com/online-inspection-scheduling/" target="_blank" rel="noopener noreferrer">Provider inspection scheduling page</a> — Ohio applicability after the migration remains unresolved.</p>
      <p>The inspection-area spreadsheet could not be retained. No service-area authority has been verified.</p>
    </section>
  </details>;
}
