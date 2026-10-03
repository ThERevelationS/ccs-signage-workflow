import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Check, AlertTriangle, GitBranch, X } from "lucide-react";
import { interpretSmartsheetSyncStatus } from "./smartsheetSyncStatusModel.js";
import SmartsheetSyncResultDetails from "@/components/admin/SmartsheetSyncResultDetails";
import { orderSyncToastState } from "@/components/orders/orderSyncToastModel";
import { orderSyncLiveProgress } from "@/components/orders/orderSyncLiveProgress.mjs";
import { recoverStalledOrderSync } from "@/components/orders/orderSyncRecovery";
import { orderFormSyncStatusRelevant } from "@/components/orders/orderSyncWidgetRelevance.mjs";

const STATUS_KEY = 'smartsheetSyncStatus';
const CONFIG_KEY = 'smartsheetSyncConfig';

export default function SmartsheetSyncWidget({ compactOrderForm = false, sessionToken = "", currentUser = null }) {
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [dismissedSuccessRun, setDismissedSuccessRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recoveringStaleRun, setRecoveringStaleRun] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const prevRunningRef = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      const [statusRecords, configRecords] = await Promise.all([
        base44.entities.GlobalSettings.filter({ setting_key: STATUS_KEY }),
        base44.entities.GlobalSettings.filter({ setting_key: CONFIG_KEY }),
      ]);
      const statusRecord = Array.isArray(statusRecords) ? statusRecords[0] : statusRecords;
      const configRecord = Array.isArray(configRecords) ? configRecords[0] : configRecords;
      setStatus(statusRecord?.setting_value || null);
      setConfig(configRecord?.setting_value || null);
    } catch {
      // silent — widget is best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    // Running Order syncs publish row-level heartbeat data. Poll quickly enough
    // for that activity to feel live without increasing idle background traffic.
    const interval = setInterval(loadStatus,
      compactOrderForm && status?.status === 'running' ? 1000 : 5000);
    return () => clearInterval(interval);
  }, [loadStatus, compactOrderForm, status?.status]);

  // Reset dismissed when a new sync starts on other pages.
  useEffect(() => {
    const isRunning = status?.status === 'running';
    if (isRunning && !prevRunningRef.current) {
      setDismissed(false);
    }
    prevRunningRef.current = isRunning;
  }, [status?.status]);

  // Healthy completed syncs use a short-lived toast everywhere. The timeout is
  // anchored to the actual completion timestamp, so an old successful run never
  // reappears merely because a page was opened later. Failures/reviews stay visible.
  const orderToast = orderSyncToastState(status);
  useEffect(() => {
    if (!orderToast.compact || !orderToast.visible) return;
    const delay = Math.max(0, orderToast.expiresAt - Date.now());
    const timeout = setTimeout(() => setDismissedSuccessRun(orderToast.key), delay);
    return () => clearTimeout(timeout);
  }, [orderToast.compact, orderToast.visible, orderToast.expiresAt, orderToast.key]);

  if (loading) return null;
  if (!config?.global_enabled) return null;
  // Order Form owns only Order sync feedback. A shared coordinator may be busy
  // with Sales, but that unrelated stage must not look like an Order sync.
  if (compactOrderForm && !orderFormSyncStatusRelevant(status)) return null;

  const interpretedStatus = interpretSmartsheetSyncStatus(status);
  const orderProgress = orderSyncLiveProgress(status?.progress_dataset === 'sales' ? {...status,progress_dataset:'orders'} : status, { enabled: compactOrderForm || status?.progress_dataset === 'sales' });
  // The shared widget historically waits 30m before declaring a run stale.
  // Order Form now emits frequent heartbeats, so five quiet minutes is enough
  // to say the run is stalled without changing other CCS sync consumers.
  const isRunning = interpretedStatus.isRunning && !orderProgress.stalled;
  const isStale = interpretedStatus.isStale || orderProgress.stalled;
  const ageMinutes = orderProgress.stalled && orderProgress.heartbeatAgeMs !== null
    ? Math.floor(orderProgress.heartbeatAgeMs / 60000) : interpretedStatus.ageMinutes;
  const results = status?.results || [];
  const hasErrors = results.some(r => r.errors > 0);
  const hasSkipped = results.some(r => r.skipped);
  const hasConflicts = results.some(r => Number(r.conflicts) > 0);
  const hasReviewNeeded = status?.status === 'needs_review' || status?.needs_review === true;
  const totalCreated = results.reduce((sum, r) => sum + (r.created || 0), 0);
  const totalUpdated = results.reduce((sum, r) => sum + (r.updated || 0), 0);
  const totalExamined = results.reduce((sum, r) => sum + (r.records_examined || r.rows_examined || 0), 0);

  const totalSteps = status?.total_steps || 0;
  const completedSteps = status?.completed_steps || 0;
  const currentStepLabel = status?.current_step_label || '';
  const progressCurrent = orderProgress.current;
  const progressTotal = orderProgress.total;
  const progressItemLabel = orderProgress.itemLabel;
  const progressDetail = orderProgress.detail;
  const progressPercent = orderProgress.show ? orderProgress.percent
    : totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const staleSales = isStale && /^Sales Pipeline\b/.test(currentStepLabel) && interpretedStatus.isStale;
  const canRecoverStaleOrderRun = (compactOrderForm || staleSales) && isStale && status?.status === 'running' &&
    currentUser?.role === 'admin' && Boolean(sessionToken);
  const recoverStaleRun = async () => {
    if (!canRecoverStaleOrderRun || recoveringStaleRun) return;
    setRecoveryError('');
    setRecoveringStaleRun(true);
    try {
      if(staleSales) {
        const response=await base44.functions.invoke('smartsheetSyncAction',{action:'recover_stale_sales_run',session_token:sessionToken,expected_started_at:status.started_at});
        if(!response.data?.success)throw new Error(response.data?.error||'Sales recovery was not confirmed.');
      } else await recoverStalledOrderSync({ sessionToken, expectedStartedAt: status?.started_at });
      await loadStatus();
    } catch (error) {
      setRecoveryError(error?.response?.data?.error || error?.message || 'The stalled sync could not be closed safely.');
    } finally {
      setRecoveringStaleRun(false);
    }
  };

  // A successful completion dismissal belongs to that specific run, so the next
  // completion can still appear even if polling missed its brief running phase.
  if (!isRunning && (orderToast.compact
    ? Boolean(orderToast.key && dismissedSuccessRun === orderToast.key)
    : dismissed)) return null;
  if (orderToast.compact && !orderToast.visible) return null;
  if (!isRunning && !isStale && !status?.completed_at) return null;
  if (!isRunning && !isStale && totalCreated === 0 && totalUpdated === 0 && !hasErrors && !hasReviewNeeded && !(compactOrderForm && hasSkipped)) return null;

  const lastSync = status?.completed_at || status?.started_at;
  const lastSyncDate = lastSync ? new Date(lastSync) : null;
  const minutesAgo = lastSyncDate ? Math.floor((Date.now() - lastSyncDate.getTime()) / 60000) : null;

  // Healthy running/completed syncs use one compact horizontal toast across the
  // app. Error, stale, skipped, conflict and review-required states retain the
  // expanded card below so important failures are never hidden by compact UI.
  if (orderToast.compact ||
    (isRunning && !isStale && !hasErrors && !hasSkipped && !hasConflicts && !hasReviewNeeded)) {
    const orderResults = results.filter(r => r.dataset === 'orders');
    const displayResults = compactOrderForm && orderResults.length ? orderResults : results;
    const created = displayResults.reduce((sum, r) => sum + (Number(r.created) || 0), 0);
    const updated = displayResults.reduce((sum, r) => sum + (Number(r.updated) || 0), 0);
    const onlyResult = displayResults.length === 1 ? displayResults[0] : null;
    const datasetLabel = onlyResult?.dataset
      ? String(onlyResult.dataset).charAt(0).toUpperCase() + String(onlyResult.dataset).slice(1)
      : 'Sync';
    const directionLabel = onlyResult?.direction === 'pull' ? 'SS→B44' : onlyResult?.direction === 'push' ? 'B44→SS' : '';
    return (
      <div className="fixed right-3 bottom-20 z-50 w-[min(620px,calc(100vw-24px))] md:bottom-3"
        role="status" aria-live="polite" aria-label={isRunning ? "Smartsheet sync in progress" : "Smartsheet sync completed"}>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex min-h-9 items-center gap-2.5">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/50">
              {isRunning
                ? <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                : <Check className="h-4 w-4 text-emerald-600" />}
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
              <span className="shrink-0 font-semibold text-slate-800 dark:text-slate-100">{isRunning ? "Syncing" : "Sync Complete"}</span>
              <span className="min-w-0 truncate text-[11px] text-slate-500 dark:text-slate-300">
                {isRunning
                  ? `${currentStepLabel || "Working…"}${progressTotal > 0 ? ` · ${progressCurrent}/${progressTotal}` : ''}${progressItemLabel ? ` · ${progressItemLabel}` : ''} · ${progressPercent}%`
                  : `${datasetLabel}${directionLabel ? ` ${directionLabel}` : ""} · +${created.toLocaleString()} created · ↑${updated.toLocaleString()} updated`}
              </span>
              {!isRunning && <span className="shrink-0 text-[10px] text-slate-400">just now</span>}
            </div>
            {!isRunning && (
              <button type="button" aria-label="Dismiss sync notification"
                onClick={() => setDismissedSuccessRun(orderToast.key)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {isRunning && (
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
              <div className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.max(5, progressPercent)}%` }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed right-3 z-50 bottom-20 md:bottom-3" style={compactOrderForm ? { width: 'min(440px, calc(100vw - 24px))' } : { maxWidth: '360px', minWidth: '280px' }}>
      <div className="clay-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex-shrink-0">
              <GitBranch className="w-4 h-4 text-blue-600" />
              {isRunning && (
                <RefreshCw className="w-3 h-3 text-blue-500 animate-spin absolute -top-1 -right-1" />
              )}
              {!isRunning && !isStale && lastSyncDate && !hasErrors && !hasReviewNeeded && (
                <Check className="w-3 h-3 text-green-500 absolute -top-1 -right-1" />
              )}
              {!isRunning && (isStale || hasErrors || hasReviewNeeded) && (
                <AlertTriangle className="w-3 h-3 text-amber-500 absolute -top-1 -right-1" />
              )}
            </div>
            <div className="text-xs min-w-0">
              <div className="font-semibold text-gray-800 truncate">
                {isRunning ? "Smartsheet Sync" : isStale ? "Sync status needs review" : hasReviewNeeded ? "Sync needs review" : hasErrors ? "Sync has errors" : compactOrderForm && (hasSkipped || hasConflicts) ? "Sync needs review" : "Sync Complete"}
              </div>
              <div className="text-gray-500 truncate">
                {isRunning
                  ? currentStepLabel || "Preparing…"
                  : isStale
                    ? ageMinutes === null ? "Missing progress timestamp" : `No reported progress for ${ageMinutes}m`
                  : lastSyncDate
                    ? minutesAgo < 1
                      ? "just now"
                      : minutesAgo < 60
                        ? `${minutesAgo}m ago`
                        : `${Math.floor(minutesAgo / 60)}h ago`
                    : ""}
              </div>
            </div>
          </div>
          {!isRunning && (
            <button
              onClick={() => compactOrderForm ? setDismissedSuccessRun(orderToast.key) : setDismissed(true)}
              className="flex-shrink-0 p-1 rounded hover:bg-gray-100"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>

        {/* Progress bar */}
        {isStale ? (
          <div className="px-3 py-2.5 space-y-2 text-[11px] text-amber-800" role="status">
            <p>The last sync still says running, but its progress timestamp is stale. Its actual outcome is unverified; do not assume the run completed.</p>
            <p className="text-gray-600">Last reported: {currentStepLabel || "Unknown stage"} · {completedSteps}/{totalSteps} stages</p>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/AdminSettings?tab=smartsheet" className="text-blue-600 hover:underline font-medium">Review sync settings →</Link>
              {canRecoverStaleOrderRun && (
                <button
                  type="button"
                  onClick={recoverStaleRun}
                  disabled={recoveringStaleRun}
                  className="rounded-md border border-amber-300 bg-white px-2 py-1 font-medium text-amber-800 hover:bg-amber-50 disabled:cursor-wait disabled:opacity-60 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-950/30"
                >
                  {recoveringStaleRun ? "Closing stalled run…" : "Close stalled run"}
                </button>
              )}
            </div>
            {recoveryError && <p className="text-red-700 dark:text-red-300" role="alert">{recoveryError}</p>}
          </div>
        ) : isRunning ? (
          <div className="px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-gray-600">
              <span className="font-medium truncate">{currentStepLabel || "Initializing…"}</span>
              <span className="flex-shrink-0 ml-2 text-gray-500">
                {completedSteps}/{totalSteps} steps
              </span>
            </div>
            {(progressItemLabel || progressDetail) && (
              <div className="rounded-md border border-blue-100 bg-blue-50/70 px-2 py-1.5 text-[10px] leading-snug text-slate-700 dark:border-blue-900/60 dark:bg-blue-950/25 dark:text-slate-200" aria-live="polite">
                {progressItemLabel && <div className="truncate font-medium">{progressItemLabel}</div>}
                {progressDetail && <div className="truncate text-slate-500 dark:text-slate-400">{progressDetail}</div>}
              </div>
            )}
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 ease-out"
                style={{ width: `${Math.max(5, progressPercent)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>{progressPercent}%</span>
              <span>
                {progressTotal > 0
                  ? `${progressCurrent.toLocaleString()} / ${progressTotal.toLocaleString()} line items`
                  : totalExamined > 0 && `${totalExamined.toLocaleString()} records examined`}
              </span>
            </div>
          </div>
        ) : (
          /* Completion summary */
          <div className="px-3 py-2.5 space-y-1.5">
            {results.length > 0 ? (
              results.map((r, i) => (
                <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-gray-700 capitalize">
                    {r.dataset}
                    {r.direction && <span className="text-gray-400 ml-1">({r.direction === 'pull' ? 'SS→B44' : 'B44→SS'})</span>}
                  </span>
                  {r.skipped ? (
                    <span className="text-amber-600">Skipped</span>
                  ) : (
                    <span className="flex gap-2 text-gray-500">
                      {r.created > 0 && <span className="text-green-600">+{r.created}</span>}
                      {r.updated > 0 && <span className="text-blue-600">↑{r.updated}</span>}
                      {r.errors > 0 && <span className="text-red-600">!{r.errors}</span>}
                      {!r.created && !r.updated && !r.errors && <span>No changes</span>}
                    </span>
                  )}
                </div>
                <SmartsheetSyncResultDetails result={r} />
                </div>
              ))
            ) : (
              <div className="text-[11px] text-gray-500">No results recorded.</div>
            )}
            {(totalCreated > 0 || totalUpdated > 0) && (
              <div className="text-[10px] text-gray-500 pt-1 border-t border-gray-100">
                +{totalCreated} created · ↑{totalUpdated} updated
              </div>
            )}
            {compactOrderForm && (hasSkipped || hasConflicts) && !hasReviewNeeded && !hasErrors && (
              <div className="text-[11px] text-amber-700 pt-1" role="status">
                Some stages were skipped or had conflicts. Review the sync results before relying on this run.
              </div>
            )}
            {hasReviewNeeded && (
              <div className="text-[11px] text-amber-700 pt-1" role="status">
                A requested sync stage was blocked or reported errors, conflicts or incomplete verification. Review the stage results before treating this run as complete.
              </div>
            )}
            <div className="text-[10px] text-gray-400 pt-0.5">
              Auto-syncs every 15 min · <Link to="/AdminSettings?tab=smartsheet" className="text-blue-600 hover:underline font-medium">Settings →</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}