import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import SmartsheetTraceMetrics from '@/components/admin/SmartsheetTraceMetrics';
import SmartsheetTraceTimeline from '@/components/admin/SmartsheetTraceTimeline';

export default function SmartsheetSyncTraces({ sessionToken, refreshKey }) {
  const [rows, setRows] = useState([]), [cursor, setCursor] = useState(null), [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const invoke = async payload => {
    const response = await base44.functions.invoke('smartsheetSyncTraceRead', { session_token: sessionToken, ...payload });
    if (!response.data?.success) throw new Error(response.data?.error || 'Measured traces could not be loaded.'); return response.data;
  };
  const load = useCallback(async (nextCursor = null) => {
    if (!sessionToken) return; setLoading(true); setError('');
    try { const data = await invoke(nextCursor ? { cursor: nextCursor } : {}); setRows(old => nextCursor ? [...old, ...(data.items || [])] : data.items || []); setCursor(data.has_more ? data.next_cursor : null); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [sessionToken]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const open = async row => {
    setLoading(true); setError('');
    try { const data = await invoke({ trace_id: row.id }); setSelected(data.trace); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  return <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground">
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Measured sync traces</h3><Button variant="outline" disabled={loading} onClick={() => load()}>Refresh traces</Button></div>
    <p className="text-xs text-muted-foreground">Read-only measurements of current behavior, not proof of a completed architectural repair. No continuous polling.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading && <p role="status" className="text-xs text-muted-foreground">Loading measurements…</p>}
    {!loading && !rows.length && <p className="text-sm text-muted-foreground">No instrumented requests captured yet. Existing runs cannot be measured retroactively.</p>}
    <div className="flex flex-wrap gap-2">{rows.map(row => <button type="button" key={row.id} type="button" onClick={() => open(row)} className="min-h-11 rounded-md border border-border px-3 py-2 text-left text-xs" aria-pressed={selected?.id === row.id}>
      <div className="font-semibold">{row.action} · {row.status}</div><div className="font-mono">{row.requested_at}</div><div>{row.metrics?.duration_ms ?? '—'} ms · {row.metrics?.total_sync_api_calls ?? '—'} calls</div>
    </button>)}</div>
    {cursor && <Button variant="outline" disabled={loading} onClick={() => load(cursor)}>Load more traces</Button>}
    {selected && <div className="space-y-3 border-t border-border pt-3"><p className="break-all text-xs font-mono">Run {selected.sync_run_id} · {selected.source}</p>
      <p className="text-xs text-muted-foreground">Request status: {selected.status}. A request ending is not proof that both systems synchronized; stage outcomes are below.</p>
      <SmartsheetTraceMetrics trace={selected} /><SmartsheetTraceTimeline trace={selected} />
    </div>}
  </section>;
}