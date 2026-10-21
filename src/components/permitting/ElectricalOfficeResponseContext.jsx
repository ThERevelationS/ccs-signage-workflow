import { safeGovernmentOfficeSourceUrl } from './governmentOfficeCatalog.js';
import { responseReviewLabels } from './officeResearchResponses.mjs';
import { electricalResponseRoles } from './electricalOfficeResponseHandoff.mjs';

const text = value => typeof value === 'string' && value ? value : 'Not recorded';
const locality = value => [value?.name, value?.state, value?.type, value?.id].filter(Boolean).join(' · ') || 'Not recorded';
export default function ElectricalOfficeResponseContext({ context }) {
  return <section aria-label="Captured electrical office responses" className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
    <h4 className="font-semibold">Captured electrical office responses · unverified</h4>
    <p>{context?.notice || 'Response evidence was not captured in this older workflow. No current office responses have been substituted.'}</p>
    {context && context.status !== 'captured' && <p role="note"><strong>Response history requires review:</strong> {context.status.replaceAll('_', ' ')}. Unavailable or unsupported entries were not substituted or treated as evidence.</p>}
    {context && <p>Research locality captured with this handoff: {locality(context.profile_snapshot)}</p>}
    {electricalResponseRoles.map(({role, label}) => {
      const rows = context?.roles?.find(row => row.role === role)?.responses || [];
      return <section key={role} aria-label={'Captured responses: ' + role} className="min-w-0 space-y-2 rounded border p-3">
        <h5 className="font-semibold">{label}</h5>
        {!rows.length && <p>No response captured for this responsibility. Scope and responsibility remain unresolved.</p>}
        {rows.map(({evidence: row, response_identity_unique, locality_matches_research, findings_match_research}, index) => {
          const source = safeGovernmentOfficeSourceUrl(row.source_url);
          return <article key={index} className="min-w-0 space-y-2 border-t pt-2">
            <p><strong>Responding office:</strong> {text(row.responding_office)}</p>
            <p><strong>Response date:</strong> {text(row.response_date)} · <strong>Response ID:</strong> {text(row.id)}</p>
            <p className="whitespace-pre-wrap"><strong>Exact response quote:</strong> {text(row.exact_quote)}</p>
            <p className="whitespace-pre-wrap"><strong>Source reference:</strong> {text(row.source_reference)}</p>
            {source ? <a className="inline-flex min-h-11 items-center break-all text-blue-700 underline" href={source} target="_blank" rel="noopener noreferrer">Open captured response source</a> : <p>No usable HTTPS source link recorded.</p>}
            <p className="whitespace-pre-wrap"><strong>Discussed site / work scope:</strong> {text(row.scope_description)}</p>
            {Object.entries(responseReviewLabels).map(([key, labels]) => <p key={key}><strong>{key.replaceAll('_', ' ')}:</strong> {labels[row[key]] || 'Not established'} · unverified</p>)}
            <p><strong>Authority / address applicability:</strong> Unverified; no approval or office selection.</p>
            <p>Historical locality captured with this response: {locality(row.profile_snapshot)}</p>
            <p>{locality_matches_research ? 'Response locality matches the captured research identity; exact-site applicability remains unverified.' : 'Historical locality differs or is incomplete; reconcile before use.'} {findings_match_research ? 'Original role findings match the research captured with this handoff.' : 'Original role findings differ or are unavailable; this response has not been reapplied to changed findings.'} {!response_identity_unique && 'Response identity is missing or duplicated; reconcile before use.'}</p>
            <p className="whitespace-pre-wrap"><strong>Response notes:</strong> {text(row.notes)}</p>
            <p><strong>Captured by:</strong> {text(row.captured_by)} · <strong>Captured at:</strong> {text(row.captured_at)}</p>
            <section aria-label="Original role findings captured with response"><h6 className="font-semibold">Original role findings captured with response · historical</h6>
              <pre className="whitespace-pre-wrap font-sans text-xs">{JSON.stringify(row.recorded_findings ?? null, null, 2)}</pre>
            </section>
          </article>;
        })}
      </section>;
    })}
  </section>;
}
