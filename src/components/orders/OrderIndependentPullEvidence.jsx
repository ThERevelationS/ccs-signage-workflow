import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  ORDER_PULL_EVIDENCE_KEY,
  orderIndependentPullEvidenceModel,
} from './orderIndependentPullEvidenceModel.mjs';

// Order Form ONLY: read-only admin review. The shared Sales coordinator can
// change without affecting this independent permanent-ID evidence.
export default function OrderIndependentPullEvidence({ currentUser, sessionToken = '' }) {
  const isAdmin = currentUser?.role === 'admin';
  const [view, setView] = useState({ kind: 'none' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [comparison, setComparison] = useState(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      setView({ kind: 'none' });
      return;
    }
    let active = true;
    let inFlight = false;
    let lastEvidenceVersion = null;
    setComparison(null);
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const rows = await base44.entities.GlobalSettings.filter({
          setting_key: ORDER_PULL_EVIDENCE_KEY,
        });
        if (active) {
          const nextView = orderIndependentPullEvidenceModel(rows);
          const version = JSON.stringify(rows?.[0]?.setting_value ?? null);
          if (lastEvidenceVersion !== null && lastEvidenceVersion !== version) setComparison(null);
          lastEvidenceVersion = version;
          setView(nextView);
        }
      } catch {
        if (active) {
          setComparison(null);
          setView(orderIndependentPullEvidenceModel(null, { readFailed: true }));
        }
      } finally {
        inFlight = false;
      }
    };
    refresh();
    // Read only for Order Form admins and never at the coordinator's 1s rate.
    const interval = setInterval(refresh, 15000);
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [isAdmin, refreshKey]);

  const compareLivePair = async (link) => {
    if (!isAdmin || !sessionToken || comparing || view.kind !== 'unresolved') return;
    setComparing(true);
    setComparison(null);
    try {
      const response = await base44.functions.invoke('smartsheetSyncAction', {
        action: 'review_unresolved_order_pull_row',
        session_token: sessionToken,
        run_started_at: view.startedAt,
        order_id: link.base44Id,
        smartsheet_row_id: link.smartsheetRowId,
      });
      const data = response?.data || response;
      if (!data?.success || data.read_only !== true || data.writes_attempted !== false ||
          data.evidence_unresolved !== true || data.run_started_at !== view.startedAt ||
          data.sheet_id !== view.sheetId || data.report?.base44_order_id !== link.base44Id ||
          data.report?.smartsheet_row_id !== link.smartsheetRowId) {
        throw new Error(data?.error || 'Live comparison was not verified. No reconciliation is confirmed.');
      }
      setComparison({ kind: 'result', data: data.report });
    } catch (error) {
      setComparison({ kind: 'error',
        message: error?.response?.data?.error || error?.message || 'Could not verify both live records. Refresh and retry the comparison.' });
    } finally {
      setComparing(false);
    }
  };

  if (!isAdmin || view.kind === 'none') return null;

  return (
    <section
      data-order-independent-pull-evidence
      role={view.kind === 'unresolved' || view.kind === 'invalid' ? 'alert' : 'status'}
      aria-label="Independent Order pull evidence review"
      className="mb-4 w-full min-w-0 rounded-xl border border-amber-300 bg-amber-50/80 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">
              {view.kind === 'unavailable' ? 'Order evidence temporarily unavailable'
                : view.kind === 'invalid' ? 'Order evidence needs administrator review'
                : 'Unresolved Order sync batches'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed">
              {view.kind === 'unresolved'
                ? `${view.attempted} attempted batch${view.attempted === 1 ? '' : 'es'} involving ${view.attemptedOrders} Orders. An API acknowledgment is not proof of saved fields or snapshots. Review the permanent IDs before another pull; this panel never retries writes.`
                : view.message}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setRefreshKey(value => value + 1)}
          className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-amber-400 px-2.5 text-xs font-semibold hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:hover:bg-amber-900/40"
          aria-label="Refresh independent Order sync evidence">
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
      {comparison && (
        <div className="mt-3 min-w-0 rounded-md border border-amber-300 bg-white/70 p-2 text-xs dark:border-amber-800 dark:bg-slate-900/50"
          role="status" aria-live="polite">
          {comparison.kind === 'error' ? <p>{comparison.message}</p> : (
            <>
              <p className="font-semibold">Read-only live comparison — {comparison.data.state.replaceAll('_', ' ')}</p>
              <p className="mt-1">{comparison.data.message}</p>
              {comparison.data.fields?.length > 0 && (
                <div className="mt-2 max-h-60 min-w-0 overflow-auto">
                  <table className="w-full min-w-[420px] text-left text-[11px]">
                    <thead><tr><th className="p-1">Mapped field</th><th className="p-1">Base44</th><th className="p-1">Smartsheet translated</th><th className="p-1">Match</th></tr></thead>
                    <tbody>{comparison.data.fields.map(field => (
                      <tr key={field.field} className="border-t border-amber-200 dark:border-amber-900">
                        <td className="break-words p-1 font-medium">{field.field}</td>
                        <td className="max-w-36 break-all p-1">{field.base44_value || '—'}</td>
                        <td className="max-w-36 break-all p-1">{field.smartsheet_pulled_value || '—'}</td>
                        <td className="p-1">{field.matches ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 font-medium">Comparison does not clear the review lock or retry any write.</p>
            </>
          )}
        </div>
      )}
      {view.kind === 'unresolved' && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-semibold">
            Review recorded batches and permanent IDs
          </summary>
          <div className="mt-2 min-w-0 space-y-2">
            <p className="break-words">
              Smartsheet sheet ID: <code>{view.sheetId}</code> ·
              {' '}Run started: <time dateTime={view.startedAt}>{view.startedAt}</time>
            </p>
            <p>
              {view.acknowledged} batch acknowledgments remain unverified;
              {' '}{view.uncertain} reported uncertain write outcomes.
            </p>
            {view.olderOmitted > 0 && (
              <p>
                {view.olderOmitted} older attempted batches are counted but their IDs are not retained here.
                Review the earlier run history for those records.
              </p>
            )}
            <div className="max-h-72 min-w-0 space-y-2 overflow-y-auto">
              {view.entries.map(batch => (
                <details key={batch.number}
                  className="min-w-0 rounded-md border border-amber-300/80 p-2 dark:border-amber-800">
                  <summary className="cursor-pointer font-medium">
                    Batch {batch.number}/{batch.total} · {batch.count} Orders ·
                    {' '}{batch.state === 'attempting' ? 'outcome unknown'
                      : batch.state === 'write_uncertain' ? 'write uncertain'
                      : 'acknowledged, not verified'}
                  </summary>
                  <div className="mt-2 max-h-48 overflow-auto">
                    <table className="w-full table-fixed text-left text-[11px]">
                      <thead><tr>
                        <th className="w-1/2 pr-2">Base44 Order ID</th>
                        <th>Smartsheet row ID</th>
                      </tr></thead>
                      <tbody>{batch.links.map(link => (
                        <tr key={link.base44Id} className="border-t border-amber-200 dark:border-amber-900">
                          <td className="break-all py-1 pr-2 font-mono">
                            {link.base44Id}
                            <button type="button" disabled={comparing || !sessionToken}
                              onClick={() => compareLivePair(link)}
                              className="mt-1 block min-h-8 rounded border border-amber-400 px-2 text-[11px] font-semibold hover:bg-amber-100 disabled:opacity-50 dark:hover:bg-amber-900/40">
                              {comparing ? 'Checking…' : 'Compare live records'}
                            </button>
                          </td>
                          <td className="break-all py-1 font-mono">{link.smartsheetRowId}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </details>
      )}
    </section>
  );
}
