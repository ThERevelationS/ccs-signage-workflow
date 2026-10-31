import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Activity } from 'lucide-react';
import { staffEntities } from "@/components/staff/staffEntities";

const safeLink = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const dateLabel = value => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Not recorded'; };

function SourceChangeReview({ monitor, jurisdictionId, onNavigate }) {
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setSource(null); setError('');
    const query = { id: monitor.source_document_id, ...(jurisdictionId ? { jurisdiction_id: jurisdictionId } : { jurisdiction_name: monitor.jurisdiction_name }) };
    if (!monitor.source_document_id) { setLoading(false); return () => { active = false; }; }
    staffEntities.PermittingSourceDocument.filter(query, { limit: 1 }).then(result => {
      if (active) setSource((Array.isArray(result) ? result : result.items || [])[0] || null);
    }).catch(() => { if (active) setError("Couldn't load the saved copy. Try again or check Documents."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [monitor.source_document_id, monitor.jurisdiction_name, jurisdictionId, retry]);
  const change = monitor.last_change_summary || {};
  const official = safeLink(monitor.official_url);
  const archive = safeLink(source?.archived_file_url);
  return <div className="space-y-3 border-t p-3 text-sm break-words">
    <div><h4 className="font-semibold">What the page watch saw</h4>
      <p>Last good check: {dateLabel(monitor.last_successful_check)}</p>
      <p>Last change seen: {dateLabel(monitor.last_changed)}</p>
      <p>Next check due: {dateLabel(monitor.next_check_due)}</p>
      <p>Failures in a row: {monitor.failure_count || 0}{monitor.last_http_status ? ` · page answer: ${monitor.last_http_status}` : ''}</p>
      {monitor.last_error && <p className="text-red-700">Last error: {monitor.last_error}</p>}
      {change.links_added != null && <p>Links added: {change.links_added} · removed: {change.links_removed ?? 'Not saved'}</p>}
      {(change.old_content_length != null || change.new_content_length != null) && <p>Page size: {change.old_content_length ?? 'Unknown'} → {change.new_content_length ?? 'Unknown'} bytes</p>}
      {change.old_hash && change.new_hash && <details><summary className="min-h-11 cursor-pointer py-3">Page fingerprints (before / after)</summary><p>Before: {change.old_hash}</p><p>After: {change.new_hash}</p></details>}
    </div>
    {change.ai_summary && <div className="rounded bg-amber-50 p-3"><h4 className="font-semibold">AI read of the change · unchecked</h4><p>{change.ai_summary}</p><p className="mt-1 text-xs">Compare the real pages before treating this as a rule.</p></div>}
    <div><h4 className="font-semibold">Saved copy</h4>
      {loading ? <p role="status">Loading the saved copy…</p> : error ? <div role="alert"><p className="text-red-700">{error}</p><Button variant="outline" className="min-h-11" onClick={() => setRetry(v => v + 1)}>Try again</Button></div> : source ? <><p>{source.title}</p><p>Kind: {source.authority_classification || 'Unknown'} · how fresh: {source.content_status || 'Unknown'}</p><p className="text-xs text-gray-600">The saved copy may be older than the change. Saving or watching it does not make it official.</p>{!archive && <p>No saved file to download — check Documents for links.</p>}</> : <p>No saved copy matches this office. Check Documents or ask an admin to fix the link.</p>}
      <div className="mt-2 flex flex-wrap gap-2">{official && <a href={official} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded border px-3 text-blue-700">Open the live page</a>}{archive && <a href={archive} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded border px-3 text-blue-700">Open the saved copy</a>}</div>
    </div>
    {!monitor.source_document_id && <p className="text-xs text-amber-800">This watch has no saved copy linked. Look in Documents — a matching name alone is not proof.</p>}
    <div className="rounded bg-purple-50 p-3"><h4 className="font-semibold">Next step</h4><p>{(monitor.failure_count || 0) >= 3 ? 'The page may have moved or be down. Ask an admin to fix the watched link.' : monitor.staff_review_required ? 'Compare the live page with the saved copy. Have an admin re-check the rules before using them.' : monitor.last_changed ? 'Look at the changed page and check if any rules are affected.' : 'Look at the saved copy when needed — a working check alone does not make it official.'}</p>
      <div className="mt-2 flex flex-wrap gap-2">{onNavigate && <><Button variant="outline" className="min-h-11" onClick={() => onNavigate('documents', monitor.source_document_id)}>Check documents</Button><Button variant="outline" className="min-h-11" onClick={() => onNavigate('requirements')}>Check rules</Button></>}</div>
      <p className="mt-2 text-xs text-gray-600">Looking at this does not clear the alert, approve rules, rescan pages, or change job steps.</p>
    </div>
  </div>;
}

export default function SourceMonitorPanel({ jurisdictionName, jurisdictionId, onNavigate }) {
  const [monitors, setMonitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('attention');
  const [selected, setSelected] = useState(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setMonitors([]); setSelected(null);
    staffEntities.SourceMonitorState.filter({ ...(jurisdictionId ? {jurisdiction_id: jurisdictionId} : {jurisdiction_name: jurisdictionName}), monitor_enabled: true }, {sort: '-last_changed', limit: 100}).then(result => {
      if (active) setMonitors(Array.isArray(result) ? result : result.items || []);
    }).catch(() => { if (active) setError("Couldn't load the page watch — refresh to try again."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jurisdictionName, jurisdictionId, refresh]);
  const attention = m => m.staff_review_required || (m.failure_count || 0) >= 3;
  const reviewCount = monitors.filter(attention).length;
  const visible = monitors.filter(m => filter === 'all' || attention(m));
  return <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold text-teal-900"><Activity className="h-4 w-4" />Page watch — changes to check</h3><Button variant="outline" className="min-h-11" onClick={() => setRefresh(v => v + 1)} disabled={loading}>Refresh</Button></div>
    <p className="text-xs text-gray-600">The watch reports whether pages are up and what changed — it does not make them official.</p>
    {loading ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading the page watch…</p> : error ? <p role="alert" className="text-sm text-red-700">{error}</p> : monitors.length === 0 ? <div><p className="text-sm">No pages are being watched for this office.</p><p className="text-xs text-gray-600">You can still check the saved documents. Ask an admin to set up a page watch.</p>{onNavigate && <Button variant="outline" className="mt-2 min-h-11" onClick={() => onNavigate('documents')}>Check documents</Button>}</div> : <>
      <div className="flex flex-wrap gap-2"><Button className="min-h-11" variant={filter === 'attention' ? 'default' : 'outline'} aria-pressed={filter === 'attention'} onClick={() => setFilter('attention')}>Needs attention ({reviewCount})</Button><Button className="min-h-11" variant={filter === 'all' ? 'default' : 'outline'} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All watched ({monitors.length})</Button></div>
      {monitors.length === 100 && <p className="text-xs">Showing up to 100 watched pages — not a full list.</p>}
      {visible.length === 0 && <p className="text-sm">Nothing needs a look right now. Tap "All watched" to see history.</p>}
      {visible.map(m => <article key={m.id} className="min-w-0 rounded-lg border bg-white">
        <button type="button" aria-expanded={selected === m.id} className="flex min-h-11 w-full flex-wrap items-start gap-2 p-3 text-left" onClick={() => setSelected(selected === m.id ? null : m.id)}>
          <span className="min-w-0 flex-1 break-words text-sm font-semibold">{m.source_title || m.official_url || 'Page with no name'}</span>
          <Badge>{(m.failure_count || 0) >= 3 ? 'Down' : m.staff_review_required ? 'Needs a look' : m.last_changed ? 'Changed' : m.last_successful_check ? 'Checked' : 'Not checked yet'}</Badge>
        </button>
        {selected === m.id && <SourceChangeReview monitor={m} jurisdictionId={jurisdictionId} onNavigate={onNavigate} />}
      </article>)}
    </>}
  </div>;
}
