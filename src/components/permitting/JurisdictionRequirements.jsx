import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { staffEntities } from "@/components/staff/staffEntities";

const link = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
export function requirementReviewGroup(rule) {
  if (rule.draft_context || ['historical', 'superseded', 'staff_rejected'].includes(rule.status)) return 'context';
  if (rule.conflict_state && rule.conflict_state !== 'none') return 'pending';
  if (rule.status === 'staff_approved' && rule.is_workflow_instruction && rule.rule_kind === 'administrative_instruction') return 'instructions';
  if (rule.status === 'staff_approved' && rule.is_operational && rule.rule_kind !== 'administrative_instruction') return 'approved';
  return 'pending';
}
const groups = { all: 'All', approved: 'Checked rules', instructions: 'Checked instructions', pending: 'Needs a look', context: 'Draft / old / rejected' };

export default function JurisdictionRequirements({ jurisdictionId, onDocuments }) {
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [group, setGroup] = useState('all'), [category, setCategory] = useState('all');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setRows([]);
    if (!jurisdictionId) { setLoading(false); setError('Pick an office to see its saved rules.'); return () => { active = false; }; }
    staffEntities.PermittingRule.filter({ jurisdiction_id: jurisdictionId }, { sort: '-created_date', limit: 200 }).then(result => {
      if (active) setRows(Array.isArray(result) ? result : result.items || []);
    }).catch(() => { if (active) setError("Couldn't load the saved rules — refresh to try again."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jurisdictionId, refresh]);
  const visible = rows.filter(row => (group === 'all' || requirementReviewGroup(row) === group) && (category === 'all' || row.rule_category === category) &&
    [row.requirement, row.sign_type, row.sign_type_normalized, row.zoning_district_applicability, row.issuing_office, row.trigger, row.exceptions].some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));
  return <section aria-label="Saved rules and proof" className="mb-4 space-y-3 rounded-lg border border-purple-200 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Saved rules & proof</h3><Button variant="outline" className="min-h-11" disabled={loading} onClick={() => setRefresh(v => v + 1)}>Refresh</Button></div>
    <p className="text-xs text-gray-600">Labels come from what's saved. Whether a source is current or applies to your address still needs checking. Steps describe how-to; they are not the actual rules.</p>
    <Input aria-label="Search saved rules" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search rules, signs, zoning, or offices" className="min-h-11" />
    <div className="flex flex-wrap gap-2"><select aria-label="Rule check status" className="min-h-11 w-full rounded-md border px-2 text-sm sm:w-auto" value={group} onChange={e => setGroup(e.target.value)}>{Object.entries(groups).map(([key,title]) => <option key={key} value={key}>{title} ({rows.filter(r => key === 'all' || requirementReviewGroup(r) === key).length})</option>)}</select><select aria-label="Rule type" className="min-h-11 rounded-md border px-2 text-sm" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All types</option>{[...new Set(rows.map(r => r.rule_category).filter(Boolean))].sort().map(value => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></div>
    {loading ? <p role="status">Loading the saved rules…</p> : error ? <p role="alert" className="text-sm text-red-700">{error}</p> : rows.length === 0 ? <div><p className="text-sm font-semibold">No rules saved yet</p><p className="text-xs">That doesn't mean no permit is needed — check Documents and the notes below. Old name-only rules need an admin to sort out.</p></div> : <>
      <p className="text-xs text-gray-500">{visible.length} of {rows.length} saved rules shown (newest 200 max).</p>
      {visible.length === 0 && <p className="text-sm">No rules match.</p>}
      {visible.map(rule => <details key={rule.id} className="min-w-0 rounded-lg border p-3 break-words">
        <summary className="min-h-11 cursor-pointer text-sm"><Badge className="mb-1 mr-2">{groups[requirementReviewGroup(rule)]}</Badge><span className="font-medium">{rule.requirement || 'Rule text not saved'}</span></summary>
        <div className="space-y-2 border-t pt-3 text-sm">
          <p>Status: {rule.status || 'Unknown'} · type: {(rule.rule_category || 'Unknown').replaceAll('_',' ')}</p>
          <p>Sign type: {rule.sign_type || rule.sign_type_normalized || 'Not saved'} · zoning: {rule.zoning_district_applicability || 'Not saved'}</p>
          {rule.issuing_office && <p>Office that issues it: {rule.issuing_office}</p>}{rule.trigger && <p>Applies when: {rule.trigger}</p>}{rule.exceptions && <p>Exceptions: {rule.exceptions}</p>}
          {rule.numeric_value != null && <p>Saved value: {rule.numeric_value} {rule.unit || ''}</p>}
          {rule.conflict_state && rule.conflict_state !== 'none' && <p className="text-amber-800">Flagged: {rule.conflict_state.replaceAll('_',' ')}. Check the proof before using it.</p>}
          {rule.reviewer && <p>Last checked by: {rule.reviewer}</p>}
          <h4 className="font-semibold">Sources</h4>
          {!rule.citations?.length && <p>No sources saved — ask an admin to check where this came from.</p>}
          {(rule.citations || []).map((citation,i) => <div key={i} className="rounded bg-gray-50 p-3 space-y-1">
            <p>{citation.section_or_page || citation.section_reference || 'Where it is in the source not saved'}{citation.physical_page != null ? ` · page ${citation.physical_page}` : ''}</p>
            {citation.excerpt && <blockquote className="border-l-2 pl-2">{citation.excerpt}</blockquote>}
            <p className="text-xs">Checked: {citation.verification_status || 'Not saved'}{citation.source_document_id ? ` · source ${citation.source_document_id}` : ''}</p>
            {typeof citation.source_document_id === 'string' && citation.source_document_id.trim()
              ? onDocuments && <Button variant="outline" className="min-h-11" onClick={() => onDocuments(citation.source_document_id)}>Open the saved source</Button>
              : <p className="text-xs text-amber-800">No saved source linked — check its official or archived link if there is one.</p>}
            <div className="flex flex-wrap gap-2">{link(citation.official_url) && <a className="inline-flex min-h-11 items-center text-blue-700 underline" href={link(citation.official_url)} target="_blank" rel="noopener noreferrer">Open the official page</a>}{link(citation.archived_file_url) && <a className="inline-flex min-h-11 items-center text-blue-700 underline" href={link(citation.archived_file_url)} target="_blank" rel="noopener noreferrer">Open the saved file</a>}</div>
          </div>)}
          <p className="text-xs text-gray-600">An admin can fix missing proof, conflicts, or approvals in the rule review. Looking here does not change anything.</p>
        </div>
      </details>)}
    </>}
    {onDocuments && <Button variant="outline" className="min-h-11" onClick={() => onDocuments()}>Check office documents</Button>}
  </section>;
}
