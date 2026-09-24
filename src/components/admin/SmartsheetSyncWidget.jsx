import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Check, AlertTriangle, GitBranch, X } from "lucide-react";
import { interpretSmartsheetSyncStatus } from "./smartsheetSyncStatusModel.js";

const STATUS_KEY = 'smartsheetSyncStatus';
const CONFIG_KEY = 'smartsheetSyncConfig';

export default function SmartsheetSyncWidget() {
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
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
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  // Reset dismissed when a new sync starts
  useEffect(() => {
    const isRunning = status?.status === 'running';
    if (isRunning && !prevRunningRef.current) {
      setDismissed(false);
    }
    prevRunningRef.current = isRunning;
  }, [status?.status]);

  if (loading) return null;
  if (!config?.global_enabled) return null;

  const { isRunning, isStale, ageMinutes } = interpretSmartsheetSyncStatus(status);
  const results = status?.results || [];
  const hasErrors = results.some(r => r.errors > 0);
  const totalCreated = results.reduce((sum, r) => sum + (r.created || 0), 0);
  const totalUpdated = results.reduce((sum, r) => sum + (r.updated || 0), 0);
  const totalExamined = results.reduce((sum, r) => sum + (r.records_examined || r.rows_examined || 0), 0);

  const totalSteps = status?.total_steps || 0;
  const completedSteps = status?.completed_steps || 0;
  const currentStepLabel = status?.current_step_label || '';
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Only show the widget when a sync is running, or briefly after completion
  if (!isRunning && dismissed) return null;
  if (!isRunning && !isStale && !status?.completed_at) return null;
  if (!isRunning && !isStale && totalCreated === 0 && totalUpdated === 0 && !hasErrors) return null;

  const lastSync = status?.completed_at || status?.started_at;
  const lastSyncDate = lastSync ? new Date(lastSync) : null;
  const minutesAgo = lastSyncDate ? Math.floor((Date.now() - lastSyncDate.getTime()) / 60000) : null;

  return (
    <div className="fixed right-3 z-50 bottom-20 md:bottom-3" style={{ maxWidth: '360px', minWidth: '280px' }}>
      <div className="clay-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex-shrink-0">
              <GitBranch className="w-4 h-4 text-blue-600" />
              {isRunning && (
                <RefreshCw className="w-3 h-3 text-blue-500 animate-spin absolute -top-1 -right-1" />
              )}
              {!isRunning && !isStale && lastSyncDate && !hasErrors && (
                <Check className="w-3 h-3 text-green-500 absolute -top-1 -right-1" />
              )}
              {!isRunning && (isStale || hasErrors) && (
                <AlertTriangle className="w-3 h-3 text-amber-500 absolute -top-1 -right-1" />
              )}
            </div>
            <div className="text-xs min-w-0">
              <div className="font-semibold text-gray-800 truncate">
                {isRunning ? "Smartsheet Sync" : isStale ? "Sync status needs review" : "Sync Complete"}
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
              onClick={() => setDismissed(true)}
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
            <Link to="/AdminSettings?tab=smartsheet" className="text-blue-600 hover:underline font-medium">Review sync settings →</Link>
          </div>
        ) : isRunning ? (
          <div className="px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-gray-600">
              <span className="font-medium truncate">{currentStepLabel || "Initializing…"}</span>
              <span className="flex-shrink-0 ml-2 text-gray-500">
                {completedSteps}/{totalSteps} steps
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 ease-out"
                style={{ width: `${Math.max(5, progressPercent)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>{progressPercent}%</span>
              <span>
                {totalExamined > 0 && `${totalExamined.toLocaleString()} records examined`}
              </span>
            </div>
          </div>
        ) : (
          /* Completion summary */
          <div className="px-3 py-2.5 space-y-1.5">
            {results.length > 0 ? (
              results.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
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
                    </span>
                  )}
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
            <div className="text-[10px] text-gray-400 pt-0.5">
              Auto-syncs every 15 min · <Link to="/AdminSettings?tab=smartsheet" className="text-blue-600 hover:underline font-medium">Settings →</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}