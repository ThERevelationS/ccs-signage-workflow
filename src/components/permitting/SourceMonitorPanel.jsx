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
    }).catch(() => { if (active) setError('Retained evidence could not be loaded. Retry or check Documents.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [monitor.source_document_id, monitor.jurisdiction_name, jurisdictionId, retry]);
  const change = monitor.last_change_summary || {};
  const official = safeLink(monitor.official_url);
  const archive = safeLink(source?.archived_file_url);
  return <div className="space-y-3 border-t p-3 text-sm break-words">
    <div><h4 className="font-semibold">What was observed</h4>
      <p>Last successful check: {dateLabel(monitor.last_successful_check)}</p>
      <p>Last detected change: {dateLabel(monitor.last_changed)}</p>
      <p>Next check due: {dateLabel(monitor.next_check_due)}</p>
      <p>Consecutive failures: {monitor.failure_count || 0}{monitor.last_http_status ? ` · HTTP result: ${monitor.last_http_status}` : ''}</p>
      {monitor.last_error && <p className="text-red-700">Last check error: {monitor.last_error}</p>}
      {change.links_added != null && <p>Links added: {change.links_added} · removed: {change.links_removed ?? 'Not recorded'}</p>}
      {(change.old_content_length != null || change.new_content_length != null) && <p>Response size: {change.old_content_length ?? 'Unknown'} → {change.new_content_length ?? 'Unknown'} bytes</p>}
      {change.old_hash && change.new_hash && <details><summary className="min-h-11 cursor-pointer py-3">Observed content fingerprints</summary><p>Previous: {change.old_hash}</p><p>Latest: {change.new_hash}</p></details>}
    </div>
    {change.ai_summary && <div className="rounded bg-amber-50 p-3"><h4 className="font-semibold">AI change assessment · unverified</h4><p>{change.ai_summary}</p><p className="mt-1 text-xs">Compare the actual sources before treating this assessment as a requirement.</p></div>}
    <div><h4 className="font-semibold">Retained evidence</h4>
      {loading ? <p role="status">Loading retained source…</p> : error ? <div role="alert"><p className="text-red-700">{error}</p><Button variant="outline" className="min-h-11" onClick={() => setRetry(v => v + 1)}>Retry evidence</Button></div> : source ? <><p>{source.title}</p><p>Source classification: {source.authority_classification || 'Unknown'} · currentness: {source.content_status || 'Unknown'}</p><p className="text-xs text-gray-600">The retained copy may predate the detected change. Collection or monitoring does not approve authority.</p>{!archive && <p>No downloadable retained copy available. Check Documents for saved links or portals.</p>}</> : <p>No matching retained source found for this jurisdiction. Check Documents or ask an administrator to reconcile the source.</p>}
      <div className="mt-2 flex flex-wrap gap-2">{official && <a href={official} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded border px-3 text-blue-700">Open monitored source</a>}{archive && <a href={archive} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded border px-3 text-blue-700">Open retained copy</a>}</div>
    </div>
    {!monitor.source_document_id && <p className="text-xs text-amber-800">No saved source record is linked to this monitor. Browse Documents to locate evidence; titles and links alone do not confirm a match.</p>}
    <div className="rounded bg-purple-50 p-3"><h4 className="font-semibold">Next action</h4><p>{(monitor.failure_count || 0) >= 3 ? 'Confirm whether the official source moved or is temporarily unavailable. Ask an administrator to repair the monitored link.' : monitor.staff_review_required ? 'Compare the official source with retained evidence. Have an administrator review affected requirements before using them.' : monitor.last_changed ? 'Inspect the changed source and verify whether any requirements were affected.' : 'Review retained evidence as needed. A successful check alone does not establish current authority.'}</p>
      <div className="mt-2 flex flex-wrap gap-2">{onNavigate && <><Button variant="outline" className="min-h-11" onClick={() => onNavigate('documents', monitor.source_document_id)}>Review documents</Button><Button variant="outline" className="min-h-11" onClick={() => onNavigate('requirements')}>Review requirements</Button></>}</div>
      <p className="mt-2 text-xs text-gray-600">Opening this review does not clear the alert, approve requirements, rescan sources or change job workflows.</p>
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
    }).catch(() => { if (active) setError('Monitor data could not be loaded. Refresh to try again.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jurisdictionName, jurisdictionId, refresh]);
  const attention = m => m.staff_review_required || (m.failure_count || 0) >= 3;
  const reviewCount = monitors.filter(attention).length;
  const visible = monitors.filter(m => filter === 'all' || attention(m));
  return <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold text-teal-900"><Activity className="h-4 w-4" />Source changes & review</h3><Button variant="outline" className="min-h-11" onClick={() => setRefresh(v => v + 1)} disabled={loading}>Refresh monitor data</Button></div>
    <p className="text-xs text-gray-600">Monitoring reports source availability and observed changes. It does not establish adopted authority.</p>
    {loading ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading source monitor health…</p> : error ? <p role="alert" className="text-sm text-red-700">{error}</p> : monitors.length === 0 ? <div><p className="text-sm">No enabled source monitors found for this jurisdiction.</p><p className="text-xs text-gray-600">Collected documents can still be reviewed. Ask an administrator about monitoring setup.</p>{onNavigate && <Button variant="outline" className="mt-2 min-h-11" onClick={() => onNavigate('documents')}>Review documents</Button>}</div> : <>
      <div className="flex flex-wrap gap-2"><Button className="min-h-11" variant={filter === 'attention' ? 'default' : 'outline'} aria-pressed={filter === 'attention'} onClick={() => setFilter('attention')}>Needs attention ({reviewCount})</Button><Button className="min-h-11" variant={filter === 'all' ? 'default' : 'outline'} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All monitored ({monitors.length})</Button></div>
      {monitors.length === 100 && <p className="text-xs">Showing up to 100 monitors; this is not a complete inventory.</p>}
      {visible.length === 0 && <p className="text-sm">No loaded monitors currently need attention. Choose All monitored to inspect source history.</p>}
      {visible.map(m => <article key={m.id} className="min-w-0 rounded-lg border bg-white">
        <button type="button" aria-expanded={selected === m.id} className="flex min-h-11 w-full flex-wrap items-start gap-2 p-3 text-left" onClick={() => setSelected(selected === m.id ? null : m.id)}>
          <span className="min-w-0 flex-1 break-words text-sm font-semibold">{m.source_title || m.official_url || 'Untitled source'}</span>
          <Badge>{(m.failure_count || 0) >= 3 ? 'Unavailable' : m.staff_review_required ? 'Needs review' : m.last_changed ? 'Change history' : m.last_successful_check ? 'Checked' : 'Not checked yet'}</Badge>
        </button>
        {selected === m.id && <SourceChangeReview monitor={m} jurisdictionId={jurisdictionId} onNavigate={onNavigate} />}
      </article>)}
    </>}
  </div>;
}
