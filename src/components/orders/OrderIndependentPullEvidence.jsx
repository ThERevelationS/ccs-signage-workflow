import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  ORDER_PULL_EVIDENCE_KEY,
  orderIndependentPullEvidenceModel,
} from './orderIndependentPullEvidenceModel.mjs';
import { startOrderBatchReview, appendOrderBatchReviewPage } from './orderBatchReviewSummary.mjs';
import { usePolling } from '@/lib/usePolling';
import { staffEntities } from "@/components/staff/staffEntities";

// Order Form ONLY: read-only admin review. The shared Sales coordinator can
// change without affecting this independent permanent-ID evidence.
export default function OrderIndependentPullEvidence({ currentUser, sessionToken = '' }) {
  const isAdmin = currentUser?.role === 'admin';
  const [view, setView] = useState({ kind: 'none' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [comparison, setComparison] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [batchReview, setBatchReview] = useState(null);
  const [reviewingBatch, setReviewingBatch] = useState(false);
  const [reviewedBatches, setReviewedBatches] = useState(() => new Set());
  const [resolving, setResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState(null);
  const reviewEpoch = useRef(0);
  const batchReviewInFlight = useRef(false);
  const refreshRef = useRef(async () => {});

  // Read only for Order Form admins and never at the coordinator's 1s rate.
  usePolling(() => refreshRef.current(), 60000, { enabled: isAdmin, runOnMount: false });

  useEffect(() => {
    if (!isAdmin) {
      reviewEpoch.current++;
      batchReviewInFlight.current = false;
      setBatchReview(null);
      setReviewingBatch(false);
      setReviewedBatches(new Set());
      setResolveResult(null);
      setView({ kind: 'none' });
      return;
    }
    let active = true;
    let inFlight = false;
    let lastEvidenceVersion = null;
    setComparison(null);
    setBatchReview(null);
    setReviewedBatches(new Set());
    setResolveResult(null);
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const rows = await staffEntities.GlobalSettings.filter({
          setting_key: ORDER_PULL_EVIDENCE_KEY,
        });
        if (active) {
          const nextView = orderIndependentPullEvidenceModel(rows);
          const version = JSON.stringify(rows?.[0]?.setting_value ?? null);
          if (lastEvidenceVersion !== null && lastEvidenceVersion !== version) {
            reviewEpoch.current++;
            batchReviewInFlight.current = false;
            setComparison(null);
            setBatchReview(null);
            setReviewingBatch(false);
            setReviewedBatches(new Set());
            setResolveResult(null);
          }
          lastEvidenceVersion = version;
          setView(nextView);
        }
      } catch {
        if (active) {
          reviewEpoch.current++;
          batchReviewInFlight.current = false;
          setComparison(null);
          setBatchReview(null);
          setReviewingBatch(false);
          setReviewedBatches(new Set());
          setResolveResult(null);
          setView(orderIndependentPullEvidenceModel(null, { readFailed: true }));
        }
      } finally {
        inFlight = false;
      }
    };
    refreshRef.current = refresh;
    refresh();
    return () => {
      active = false;
      reviewEpoch.current++;
      batchReviewInFlight.current = false;
      refreshRef.current = async () => {};
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

  const reviewRecordedBatch = async (batch) => {
    if (!isAdmin || !sessionToken || batchReviewInFlight.current || view.kind !== 'unresolved') return;
    batchReviewInFlight.current = true;
    const epoch = ++reviewEpoch.current;
    let progress;
    setReviewingBatch(true);
    setBatchReview(null);
    try {
      progress = startOrderBatchReview(batch, { runStartedAt: view.startedAt, sheetId: view.sheetId });
      setBatchReview(progress);
      while (progress.nextOffset !== null) {
        const response = await base44.functions.invoke('smartsheetSyncAction', {
          action: 'review_unresolved_order_pull_batch',
          session_token: sessionToken,
          run_started_at: view.startedAt,
          batch_number: batch.number,
          offset: progress.nextOffset,
        });
        if (reviewEpoch.current !== epoch) return;
        progress = appendOrderBatchReviewPage(progress, response?.data || response, batch);
        setBatchReview(progress);
      }
      if (reviewEpoch.current === epoch && progress?.kind === 'complete') {
        setReviewedBatches(previous => new Set(previous).add(batch.number));
      }
    } catch (error) {
      if (reviewEpoch.current === epoch) {
        setBatchReview({
          ...(progress || { batchNumber: batch.number, reviewed: 0, total: batch.count,
            counts: { matching: 0, differing: 0, investigating: 0 }, rows: [] }),
          kind: 'error',
          error: error?.response?.data?.error || error?.message || 'The batch review could not be verified.',
        });
      }
    } finally {
      if (reviewEpoch.current === epoch) {
        batchReviewInFlight.current = false;
        setReviewingBatch(false);
      }
    }
  };

  const allBatchesReviewed = view.kind === 'unresolved' && view.entries.length > 0 &&
    view.entries.every(batch => reviewedBatches.has(batch.number));

  const resolveEvidence = async () => {
    if (!isAdmin || !sessionToken || resolving || view.kind !== 'unresolved' || !allBatchesReviewed) return;
    setResolving(true);
    setResolveResult(null);
    try {
      const response = await base44.functions.invoke('smartsheetSyncAction', {
        action: 'resolve_unresolved_order_pull_evidence',
        session_token: sessionToken,
        run_started_at: view.startedAt,
        sheet_id: view.sheetId,
        confirm_reviewed: true,
      });
      const data = response?.data || response;
      if (!data?.success || data.evidence_state !== 'verified_complete' ||
          data.run_started_at !== view.startedAt || data.sheet_id !== view.sheetId) {
        throw new Error(data?.error || 'Resolution was not confirmed. The review lock remains in place.');
      }
      setResolveResult({ kind: 'resolved', verifiedAt: data.verified_at, checked: data.pairs_checked });
      setRefreshKey(value => value + 1);
    } catch (error) {
      setResolveResult({ kind: 'error',
        message: error?.response?.data?.error || error?.message || 'Resolution failed; the review lock remains in place.' });
    } finally {
      setResolving(false);
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
      {batchReview && (
        <div className="mt-3 min-w-0 rounded-md border border-amber-300 bg-white/70 p-2 text-xs dark:border-amber-800 dark:bg-slate-900/50"
          role="status" aria-live="polite">
          <p className="font-semibold">
            Batch {batchReview.batchNumber} read-only review · {batchReview.reviewed}/{batchReview.total} Orders checked
            {batchReview.kind === 'running' ? ' · Checking…'
              : batchReview.kind === 'complete' ? ' · Review completed' : ' · Incomplete'}
          </p>
          <p className="mt-1">
            {batchReview.counts.matching} currently match · {batchReview.counts.differing} differ ·
            {' '}{batchReview.counts.investigating} require investigation
          </p>
          {batchReview.kind === 'error' && (
            <p className="mt-1 font-medium text-red-700 dark:text-red-300">
              {batchReview.error} Any partial counts above are not a complete batch review.
            </p>
          )}
          {batchReview.kind === 'complete' && (
            <p className="mt-1">All recorded pairs in this batch were compared. Matching values do not resolve the interrupted run or unlock Sync.</p>
          )}
          {batchReview.rows?.some(row => row.category !== 'matching') && (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium">Orders with differences or unresolved questions</summary>
              <div className="mt-1 max-h-36 space-y-1 overflow-y-auto">
                {batchReview.rows.filter(row => row.category !== 'matching').map(row => (
                  <p key={row.base44_order_id} className="break-all">
                    {row.base44_order_id} ↔ {row.smartsheet_row_id} · {row.state.replaceAll('_', ' ')}
                  </p>
                ))}
              </div>
            </details>
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
                  <button type="button"
                    disabled={reviewingBatch || comparing || !sessionToken}
                    onClick={() => reviewRecordedBatch(batch)}
                    className="mb-2 mt-2 min-h-9 rounded-md border border-amber-400 px-3 text-[11px] font-semibold hover:bg-amber-100 disabled:opacity-50 dark:hover:bg-amber-900/40">
                    {reviewingBatch ? 'Reviewing batch…' : 'Review batch'}
                  </button>
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
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
              <button type="button"
                disabled={resolving || !allBatchesReviewed || !sessionToken}
                onClick={resolveEvidence}
                className="min-h-9 rounded-md border border-amber-400 px-3 text-[11px] font-semibold hover:bg-amber-100 disabled:opacity-50 dark:hover:bg-amber-900/40">
                {resolving ? 'Resolving…' : 'Mark reviewed and resolve'}
              </button>
              {!allBatchesReviewed && (
                <p className="text-[11px]">Review every recorded batch above before resolving this run.</p>
              )}
            </div>
            {resolveResult && (
              <p role="status" aria-live="polite"
                className={`mt-2 text-[11px] font-medium ${resolveResult.kind === 'error' ? 'text-red-700 dark:text-red-300' : ''}`}>
                {resolveResult.kind === 'resolved'
                  ? `Resolved at ${resolveResult.verifiedAt} after checking ${resolveResult.checked} permanent link${resolveResult.checked === 1 ? '' : 's'}. Order pulls are unblocked; no writes were replayed.`
                  : resolveResult.message}
              </p>
            )}
          </div>
        </details>
      )}
    </section>
  );
}