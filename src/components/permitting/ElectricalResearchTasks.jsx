import { Button } from '@/components/ui/button';
import { officeResearchChecklist, officeResearchFieldLabels } from '../../../base44/shared/permittingOfficeResearch.mjs';
import { safeGovernmentOfficeSourceUrl } from './governmentOfficeCatalog';

const recorded = value => typeof value === 'string' && value.trim() ? value : 'Not recorded · confirm with the responsible office';
export default function ElectricalResearchTasks({ rows = [], onInspect, onPreviewWorkflow }) {
  return <section aria-label="Electrical permit and inspection task view" className="min-w-0 space-y-3 rounded border bg-white p-3 [overflow-wrap:anywhere]">
    <h5 className="text-sm font-semibold">Electrical work: permit and inspection planning</h5>
    <p className="text-xs">Saved research drafts for planning questions, not an approved job checklist. Confirm project applicability, office responsibility and current instructions before applying, booking or working. No task completion or job changes are saved here.</p>
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      {officeResearchChecklist.roles.filter(role => ['electrical_permit', 'electrical_inspection'].includes(role.key)).map(role => {
        const findings = rows.map((row, index) => ({ row, index })).filter(item => item.row?.role === role.key);
        return <article key={role.key} aria-label={'Electrical planning: ' + role.key} className="min-w-0 space-y-3 rounded border bg-gray-50 p-3 text-xs">
          <h6 className="text-sm font-semibold">{role.key === 'electrical_permit' ? 'Permit issuance' : 'Inspection scheduling and stages'}</h6>
          {!findings.length ? <p>No saved finding for this responsibility. Do not substitute the other electrical office.</p> : <>
            {findings.length > 1 && <p className="rounded bg-amber-50 p-2">Multiple saved candidates. Review each separately; no provider is automatically assigned.</p>}
            {findings.map(({ row, index }, number) => {
              const source = safeGovernmentOfficeSourceUrl(row.official_source_url);
              return <div key={index} className="space-y-3 border-t pt-2">
                <p className="font-semibold">Finding {number + 1}: {recorded(row.office_name)}</p>
                <p>Applicability: {row.applicability === 'potentially_applicable' ? 'May apply · confirm proposed work' : row.applicability === 'not_applicable_candidate' ? 'Research suggests it may not apply · confirm before skipping' : 'Not established'}</p>
                <p>Service area: {recorded(row.service_area)}<br/>Delegation / provider evidence: {recorded(row.delegation_quote)}</p>
                {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-blue-700 underline">Open saved electrical research source</a> : <p>Usable source link not recorded.</p>}
                <dl className="space-y-3">{role.research_fields.map(key => <div key={key}><dt className="font-semibold">{officeResearchFieldLabels[key] || key}</dt><dd className="whitespace-pre-wrap">{recorded(row.research_fields?.[key])}</dd></div>)}</dl>
                <Button variant="outline" className="min-h-11 h-auto w-full whitespace-normal text-xs" onClick={() => onInspect?.(index)}>Inspect full {role.key === 'electrical_permit' ? 'permit' : 'inspection'} finding {number + 1}</Button>
              </div>;
            })}
          </>}
        </article>;
      })}
    </div>
    <Button variant="outline" className="min-h-11 w-full whitespace-normal" onClick={() => onPreviewWorkflow?.()}>
      Preview workflow with electrical planning
    </Button>
    <p className="text-xs">This explicit handoff keeps saved electrical findings beside the workflow as unverified research context. It does not approve requirements, choose an office, or create job tasks.</p>
  </section>;
}
