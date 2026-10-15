import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { officeResearchChecklist, officeResearchFieldLabels } from '../../../base44/shared/permittingOfficeResearch.mjs';
import { assessOfficeResearchRole, officeResearchEvidenceGaps } from './officeResearchCompleteness.mjs';

export function officeFindingGaps(row) {
  return officeResearchEvidenceGaps(row);
}
const statusLabel = assessment => assessment.status === 'missing' ? 'No finding recorded'
  : assessment.status === 'ambiguous' ? assessment.findings.length + ' findings · review separately'
    : assessment.status === 'incomplete' ? 'Incomplete · ' + (assessment.missing_field_count + assessment.missing_evidence_count) + ' open items'
      : 'Metadata present · unverified';
export default function OfficeRoleOverview({ rows = [], onInspect, onNavigate }) {
  const [filter, setFilter] = useState('all');
  const roles = officeResearchChecklist.roles.map(role => {
    const assessment = assessOfficeResearchRole(rows, role.key);
    return { ...role, assessment, findings: assessment.findings, gap: assessment.status !== 'metadata_present_unverified' };
  });
  const gaps = roles.filter(role => role.gap).length;
  return <section aria-label="Office role evidence overview" className="min-w-0 space-y-3 rounded border bg-white p-3 [overflow-wrap:anywhere]">
    <h5 className="text-sm font-semibold">Role and evidence overview</h5>
    <p className="text-xs">Seven research roles · {roles.filter(role => role.findings.length).length} with saved findings · {gaps} with missing, incomplete or ambiguous metadata. “Metadata present” means checklist fields were recorded; it does not verify an office, authority, current source, project applicability or required permits.</p>
    <p className="text-xs">Electrical permit issuance and inspection are separate responsibilities. Office names, links and populated fields do not establish authority, commercial-sign applicability or coverage of a project address. County membership does not prove responsibility.</p>
    <label className="block text-sm">Show roles
      <select aria-label="Office role gap filter" value={filter} onChange={event => setFilter(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded border px-2">
        <option value="all">All seven roles</option><option value="gaps">Missing or incomplete metadata ({gaps})</option>
      </select>
    </label>
    {filter === 'gaps' && gaps === 0 && <p role="status" className="text-sm">No missing checklist metadata detected. Staff review and location applicability are still required.</p>}
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
      {roles.filter(role => filter === 'all' || role.gap).map(role => <article key={role.key} aria-label={'Role overview: ' + role.label} className="min-w-0 space-y-2 rounded border bg-gray-50 p-3 text-xs">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h6 className="text-sm font-semibold">{role.label}</h6>
          <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${role.gap ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-blue-300 bg-blue-50 text-blue-900'}`} role="status">{statusLabel(role.assessment)}</span>
        </div>
        {!role.findings.length ? <p>No saved finding for this role. Responsibility and applicability remain unknown.</p> : <>
          {role.findings.length > 1 && <p className="rounded bg-amber-50 p-2">Multiple saved findings for this role. They remain separate; no office has been chosen automatically.</p>}
          {role.findings.map(({ row, index }, number) => {
            const missing = role.assessment.findings.find(item => item.index === index)?.missing_fields || [];
            const missingEvidence = role.assessment.findings.find(item => item.index === index)?.missing_evidence || [];
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
