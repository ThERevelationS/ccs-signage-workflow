import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { appendOfficeResearchResponse, createOfficeResearchResponse, responseReviewLabels } from './officeResearchResponses.mjs';
import { safeGovernmentOfficeSourceUrl } from './governmentOfficeCatalog.js';

const blank = () => ({ responding_office: '', response_date: '', exact_quote: '', source_reference: '', source_url: '', scope_description: '', notes: '', currentness: 'unknown', commercial_sign_scope: 'unknown', site_applicability: 'unknown' });
export default function OfficeResearchResponses({ research, role, canEdit = false, actor = 'CCS Staff', onSave }) {
  const [draft, setDraft] = useState(null), [error, setError] = useState(''), [status, setStatus] = useState(''), [saving, setSaving] = useState(false), [frozen, setFrozen] = useState(false);
  const request = useRef(null), basis = useRef(null), lock = useRef(false);
  const label = role === 'electrical_permit' ? 'permit issuer' : 'inspection provider';
  const id = 'response-' + role;
  const history = Array.isArray(research?.staff_responses) ? research.staff_responses.filter(row => row?.role === role) : [];
  const change = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const start = () => { basis.current = research; request.current = null; setDraft(blank()); setFrozen(false); setError(''); setStatus(''); };
  const save = async () => {
    if (lock.current || !draft) return;
    lock.current = true; setSaving(true); setError(''); setStatus('');
    try {
      if (!request.current) request.current = createOfficeResearchResponse(basis.current, role, draft, { id: 'office-response-' + crypto.randomUUID(), actor });
      const next = appendOfficeResearchResponse(research, request.current);
      setFrozen(true);
      if (next !== research) {
        const saved = await onSave(next);
        const confirmed = saved?.office_research?.staff_responses?.filter(row => row?.id === request.current.id);
        if (!Array.isArray(confirmed) || confirmed.length !== 1 || JSON.stringify(confirmed[0]) !== JSON.stringify(request.current))
          throw Error('The response save was not confirmed. Keep this response open and verify the saved research before retrying.');
      }
      setDraft(null); request.current = null; setFrozen(false);
      setStatus('Office response saved as unverified evidence. The saved office findings and authority status were preserved.');
    } catch (e) {
      setFrozen(Boolean(request.current));
      setError(e?.response?.data?.error || e?.message || 'The response save was not confirmed.');
    } finally { lock.current = false; setSaving(false); }
  };
  return <section aria-label={'Office responses: ' + role} className="space-y-2 border-t pt-3">
    <h6 className="font-semibold">Recorded {label} responses</h6>
    <p>Responses are evidence for review. They do not verify responsibility, approve authority or resolve a project address.</p>
    {!history.length && <p>No office responses recorded.</p>}
    {history.map((response, index) => {
      const source = safeGovernmentOfficeSourceUrl(response.source_url);
      return <details key={response.id || index} className="rounded border bg-white p-2">
        <summary className="min-h-11 cursor-pointer content-center">{response.response_date} · {response.responding_office} · Unverified</summary>
        <div className="space-y-2 pt-2">
          <p>Recorded locality: {response.profile_snapshot?.name}, {response.profile_snapshot?.state} ({response.profile_snapshot?.type})</p>
          <blockquote className="whitespace-pre-wrap">{response.exact_quote}</blockquote>
          <p>Source reference: {response.source_reference}</p>
          {source && <a className="inline-flex min-h-11 items-center text-blue-700 underline" href={source} target="_blank" rel="noopener noreferrer">Open response source</a>}
          <p>Discussed site / work: {response.scope_description || 'Not recorded'}</p>
          {Object.entries(responseReviewLabels).map(([key, values]) => <p key={key}>{key === 'currentness' ? 'Currentness' : key === 'commercial_sign_scope' ? 'Commercial sign scope' : 'Site applicability'}: {values[response[key]] || 'Not established'}</p>)}
          <p>Captured by {response.captured_by} · {response.captured_at}</p>
          <p>Saved candidates at capture: {(response.recorded_findings || []).map(row => row.office_name || 'Unnamed finding').join('; ') || 'None recorded'}</p>
          {response.notes && <p className="whitespace-pre-wrap">{response.notes}</p>}
        </div>
      </details>;
    })}
    {status && <p role="status">{status}</p>}
    {canEdit && typeof onSave === 'function' && research?.profile_snapshot?.id && !draft && <Button type="button" variant="outline" className="min-h-11 h-auto w-full whitespace-normal" onClick={start}>Record {label} response</Button>}
    {draft && canEdit && typeof onSave === 'function' && <div className="space-y-3 rounded border bg-blue-50 p-3" aria-label={'Record response: ' + role}>
      <p>Enter the reply exactly and retain its source. Leave unknown scope unestablished. Saving adds a separate historical response.</p>
      <fieldset disabled={saving || frozen} className="space-y-3">
        {[
          ['responding_office', 'Responding office', 200, 'text'],
          ['response_date', 'Response date', 10, 'date'],
          ['source_reference', 'Source reference (email, call or official page)', 1000, 'text'],
          ['source_url', 'Official or retained source URL (optional HTTPS)', 1000, 'url'],
        ].map(([key, title, limit, type]) => <div key={key}><label htmlFor={id + key}>{title}</label><Input id={id + key} type={type} maxLength={limit} value={draft[key]} onChange={event => change(key, event.target.value)} className="min-h-11" /></div>)}
        {[
          ['exact_quote', 'Exact response quote', 4000],
          ['scope_description', 'Site or work scope discussed', 1000],
          ['notes', 'Response notes (optional)', 1500],
        ].map(([key, title, limit]) => <div key={key}><label htmlFor={id + key}>{title}</label><Textarea id={id + key} maxLength={limit} rows={3} value={draft[key]} onChange={event => change(key, event.target.value)} /></div>)}
        {Object.entries(responseReviewLabels).map(([key, values]) => <div key={key}><label htmlFor={id + key}>{key === 'currentness' ? 'Currentness reported by office' : key === 'commercial_sign_scope' ? 'Commercial sign scope reported by office' : 'Site applicability reported by office'}</label>
          <select id={id + key} value={draft[key]} onChange={event => change(key, event.target.value)} className="min-h-11 w-full rounded border bg-white px-2">
            {Object.entries(values).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select></div>)}
      </fieldset>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {frozen && <p>The save was not confirmed. Your original response is kept here. An explicit retry uses the same response identity and evidence; it does not create a second response.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={saving} className="min-h-11 h-auto whitespace-normal" onClick={save}>{saving ? 'Saving response…' : frozen ? 'Retry same response' : 'Save unverified response'}</Button>
        <Button type="button" variant="outline" disabled={saving} className="min-h-11 h-auto whitespace-normal" onClick={() => {setDraft(null);setError('');request.current=null;}}>Close response form</Button>
      </div>
      <p>Closing discards this local form. It does not undo a response that may already have saved.</p>
    </div>}
  </section>;
}
