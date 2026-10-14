import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const link = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
export function requirementReviewGroup(rule) {
  if (rule.draft_context || ['historical', 'superseded', 'staff_rejected'].includes(rule.status)) return 'context';
  if (rule.conflict_state && rule.conflict_state !== 'none') return 'pending';
  if (rule.status === 'staff_approved' && rule.is_workflow_instruction && rule.rule_kind === 'administrative_instruction') return 'instructions';
  if (rule.status === 'staff_approved' && rule.is_operational && rule.rule_kind !== 'administrative_instruction') return 'approved';
  return 'pending';
}
const groups = { all: 'All', approved: 'Staff-approved rules', instructions: 'Reviewed instructions', pending: 'Needs review', context: 'Draft / history / rejected' };

export default function JurisdictionRequirements({ jurisdictionId, onDocuments }) {
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [group, setGroup] = useState('all'), [category, setCategory] = useState('all');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setRows([]);
    if (!jurisdictionId) { setLoading(false); setError('Select a canonical jurisdiction to inspect its saved rules.'); return () => { active = false; }; }
    base44.entities.PermittingRule.filter({ jurisdiction_id: jurisdictionId }, { sort: '-created_date', limit: 200 }).then(result => {
      if (active) setRows(Array.isArray(result) ? result : result.items || []);
    }).catch(() => { if (active) setError('Saved rules could not be loaded. Refresh to retry.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jurisdictionId, refresh]);
  const visible = rows.filter(row => (group === 'all' || requirementReviewGroup(row) === group) && (category === 'all' || row.rule_category === category) &&
    [row.requirement, row.sign_type, row.sign_type_normalized, row.zoning_district_applicability, row.issuing_office, row.trigger, row.exceptions].some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));
  return <section aria-label="Saved requirements and evidence" className="mb-4 space-y-3 rounded-lg border border-purple-200 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Saved rules & supporting evidence</h3><Button variant="outline" className="min-h-11" disabled={loading} onClick={() => setRefresh(v => v + 1)}>Refresh saved rules</Button></div>
    <p className="text-xs text-gray-600">Review labels reflect saved records. Source currentness and applicability to a particular address/sign must still be confirmed. Instructions describe procedure; they are not adopted regulations.</p>
    <Input aria-label="Search saved requirements" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search requirement, sign, zoning or office" className="min-h-11" />
    <div className="flex flex-wrap gap-2"><select aria-label="Requirement review status" className="min-h-11 w-full rounded-md border px-2 text-sm sm:w-auto" value={group} onChange={e => setGroup(e.target.value)}>{Object.entries(groups).map(([key,title]) => <option key={key} value={key}>{title} ({rows.filter(r => key === 'all' || requirementReviewGroup(r) === key).length})</option>)}</select><select aria-label="Requirement category" className="min-h-11 rounded-md border px-2 text-sm" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{[...new Set(rows.map(r => r.rule_category).filter(Boolean))].sort().map(value => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></div>
    {loading ? <p role="status">Loading saved requirements…</p> : error ? <p role="alert" className="text-sm text-red-700">{error}</p> : rows.length === 0 ? <div><p className="text-sm font-semibold">No linked rules found</p><p className="text-xs">This does not mean no permit is required. Check Documents and any collected profile notes below. Legacy name-only rules need administrator reconciliation.</p></div> : <>
      <p className="text-xs text-gray-500">{visible.length} shown from {rows.length} loaded rules. Reads are limited to the newest 200 linked records.</p>
      {visible.length === 0 && <p className="text-sm">No rules match these filters.</p>}
      {visible.map(rule => <details key={rule.id} className="min-w-0 rounded-lg border p-3 break-words">
        <summary className="min-h-11 cursor-pointer text-sm"><Badge className="mb-1 mr-2">{groups[requirementReviewGroup(rule)]}</Badge><span className="font-medium">{rule.requirement || 'Requirement text not recorded'}</span></summary>
        <div className="space-y-2 border-t pt-3 text-sm">
          <p>Saved status: {rule.status || 'Unknown'} · category: {(rule.rule_category || 'Unknown').replaceAll('_',' ')}</p>
          <p>Sign type: {rule.sign_type || rule.sign_type_normalized || 'Not specified'} · zoning: {rule.zoning_district_applicability || 'Not specified'}</p>
          {rule.issuing_office && <p>Issuing office: {rule.issuing_office}</p>}{rule.trigger && <p>Applies when: {rule.trigger}</p>}{rule.exceptions && <p>Exceptions: {rule.exceptions}</p>}
          {rule.numeric_value != null && <p>Recorded value: {rule.numeric_value} {rule.unit || ''}</p>}
          {rule.conflict_state && rule.conflict_state !== 'none' && <p className="text-amber-800">Conflict / review state: {rule.conflict_state.replaceAll('_',' ')}. Confirm the evidence before use.</p>}
          {rule.reviewer && <p>Last reviewer: {rule.reviewer}</p>}
          <h4 className="font-semibold">Supporting citations</h4>
          {!rule.citations?.length && <p>No citations recorded. Ask an administrator to review the supporting source.</p>}
          {(rule.citations || []).map((citation,i) => <div key={i} className="rounded bg-gray-50 p-3 space-y-1">
            <p>{citation.section_or_page || citation.section_reference || 'Source location not recorded'}{citation.physical_page != null ? ` · physical page ${citation.physical_page}` : ''}</p>
            {citation.excerpt && <blockquote className="border-l-2 pl-2">{citation.excerpt}</blockquote>}
            <p className="text-xs">Citation verification: {citation.verification_status || 'Not recorded'}{citation.source_document_id ? ` · source ${citation.source_document_id}` : ''}</p>
            <div className="flex flex-wrap gap-2">{link(citation.official_url) && <a className="inline-flex min-h-11 items-center text-blue-700 underline" href={link(citation.official_url)} target="_blank" rel="noopener noreferrer">Open official citation</a>}{link(citation.archived_file_url) && <a className="inline-flex min-h-11 items-center text-blue-700 underline" href={link(citation.archived_file_url)} target="_blank" rel="noopener noreferrer">Open cited archive</a>}</div>
          </div>)}
          <p className="text-xs text-gray-600">Use the existing administrator rule review to resolve missing evidence, conflicts or approvals. This view does not change review status or job work.</p>
        </div>
      </details>)}
    </>}
    {onDocuments && <Button variant="outline" className="min-h-11" onClick={onDocuments}>Inspect jurisdiction documents</Button>}
  </section>;
}
