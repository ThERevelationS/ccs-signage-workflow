import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { officeResearchChecklist, officeResearchFieldLabels } from '../../../base44/shared/permittingOfficeResearch.mjs';
import { safeGovernmentOfficeSourceUrl } from './governmentOfficeCatalog';

const text = value => typeof value === 'string' && Boolean(value.trim());
export function officeFindingGaps(row) {
  return [
    !text(row.office_name) && 'Office identity missing',
    !safeGovernmentOfficeSourceUrl(row.official_source_url) && 'Usable source link missing',
    !text(row.responsibility_quote) && 'Responsibility quote missing',
    !text(row.service_area) && 'Service area missing',
    !['potentially_applicable', 'not_applicable_candidate'].includes(row.applicability) && 'Applicability unresolved',
  ].filter(Boolean);
}
export default function OfficeRoleOverview({ rows = [], onInspect, onNavigate }) {
  const [filter, setFilter] = useState('all');
  const roles = officeResearchChecklist.roles.map(role => {
    const findings = rows.map((row, index) => ({ row, index })).filter(item => item.row?.role === role.key);
    return { ...role, findings, gap: findings.length !== 1 || findings.some(({ row }) =>
      officeFindingGaps(row).length || [...officeResearchChecklist.common_research_fields, ...(role.research_fields || [])].some(key => !text(row.research_fields?.[key]))) };
  });
  const gaps = roles.filter(role => role.gap).length;
  return <section aria-label="Office role evidence overview" className="min-w-0 space-y-3 rounded border bg-white p-3 [overflow-wrap:anywhere]">
    <h5 className="text-sm font-semibold">Role and evidence overview</h5>
    <p className="text-xs">Seven research roles · {roles.filter(role => role.findings.length).length} with saved findings · {gaps} with missing or ambiguous metadata. These are loaded research counts, not verified coverage or required permits.</p>
    <p className="text-xs">Electrical permit issuance and inspection are separate responsibilities. Office names, links and populated fields do not establish authority, commercial-sign applicability or coverage of a project address. County membership does not prove responsibility.</p>
    <label className="block text-sm">Show roles
      <select aria-label="Office role gap filter" value={filter} onChange={event => setFilter(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded border px-2">
        <option value="all">All seven roles</option><option value="gaps">Missing or ambiguous metadata ({gaps})</option>
      </select>
    </label>
    {filter === 'gaps' && gaps === 0 && <p role="status" className="text-sm">No missing checklist metadata detected. Staff review and location applicability are still required.</p>}
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
      {roles.filter(role => filter === 'all' || role.gap).map(role => <article key={role.key} aria-label={'Role overview: ' + role.label} className="min-w-0 space-y-2 rounded border bg-gray-50 p-3 text-xs">
        <h6 className="text-sm font-semibold">{role.label}</h6>
        {!role.findings.length ? <p>No saved finding for this role. Responsibility and applicability remain unknown.</p> : <>
          {role.findings.length > 1 && <p className="rounded bg-amber-50 p-2">Multiple saved findings for this role. They remain separate; no office has been chosen automatically.</p>}
          {role.findings.map(({ row, index }, number) => {
            const missing = [...officeResearchChecklist.common_research_fields, ...(role.research_fields || [])].filter(key => !text(row.research_fields?.[key]));
            const missingEvidence = officeFindingGaps(row);
            return <div key={index} className="space-y-2 border-t pt-2">
              <p className="font-medium">{row.office_name || 'Office not recorded'}</p>
              <p>{row.applicability === 'potentially_applicable' ? 'May apply · review proposed work' : row.applicability === 'not_applicable_candidate' ? 'Research suggests it may not apply · confirm before skipping' : 'Applicability not established'}</p>
              <p>{missingEvidence.length ? missingEvidence.join(' · ') : 'Office, source, responsibility and service-area metadata present · unverified'}</p>
              <p>Missing checklist fields: {missing.length ? missing.map(key => officeResearchFieldLabels[key] || key).join(' · ') : 'None detected · findings still require review'}</p>
              <Button variant="outline" className="min-h-11 h-auto w-full whitespace-normal text-xs" onClick={() => onInspect?.(index)}>Inspect {role.label} finding {number + 1}</Button>
            </div>;
          })}
        </>}
      </article>)}
    </div>
    {onNavigate && <div className="flex flex-col gap-2 sm:flex-row"><Button variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={() => onNavigate('documents')}>Review office source documents</Button><Button variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={() => onNavigate('requirements')}>Review saved requirements</Button></div>}
  </section>;
}
