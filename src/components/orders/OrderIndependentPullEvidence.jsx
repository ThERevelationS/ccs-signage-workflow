import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  ORDER_PULL_EVIDENCE_KEY,
  orderIndependentPullEvidenceModel,
} from './orderIndependentPullEvidenceModel.mjs';

// Order Form ONLY: read-only admin review. The shared Sales coordinator can
// change without affecting this independent permanent-ID evidence.
export default function OrderIndependentPullEvidence({ currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const [view, setView] = useState({ kind: 'none' });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isAdmin) {
      setView({ kind: 'none' });
      return;
    }
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const rows = await base44.entities.GlobalSettings.filter({
          setting_key: ORDER_PULL_EVIDENCE_KEY,
        });
        if (active) setView(orderIndependentPullEvidenceModel(rows));
      } catch {
        if (active) setView(orderIndependentPullEvidenceModel(null, { readFailed: true }));
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
                          <td className="break-all py-1 pr-2 font-mono">{link.base44Id}</td>
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
