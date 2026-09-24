import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Check, AlertTriangle, GitBranch, ChevronUp, ChevronDown } from "lucide-react";

export default function SmartsheetSyncWidget() {
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const statusRecords = await base44.entities.GlobalSettings.filter({ setting_key: 'smartsheetSyncStatus' });
      const statusRecord = Array.isArray(statusRecords) ? statusRecords[0] : statusRecords;
      setStatus(statusRecord?.setting_value || null);

      const configRecords = await base44.entities.GlobalSettings.filter({ setting_key: 'smartsheetSyncConfig' });
      const configRecord = Array.isArray(configRecords) ? configRecords[0] : configRecords;
      setConfig(configRecord?.setting_value || null);
    } catch {
      // silent — widget is best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  // Don't render until we've loaded, and don't show if sync isn't enabled
  if (loading) return null;
  if (!config?.global_enabled) return null;

  const isRunning = status?.status === 'running';
  const lastSync = status?.completed_at || status?.started_at;
  const lastSyncDate = lastSync ? new Date(lastSync) : null;
  const minutesAgo = lastSyncDate ? Math.floor((Date.now() - lastSyncDate.getTime()) / 60000) : null;

  const results = status?.results || [];
  const hasErrors = results.some(r => r.errors > 0);
  const totalCreated = results.reduce((sum, r) => sum + (r.created || 0), 0);
  const totalUpdated = results.reduce((sum, r) => sum + (r.updated || 0), 0);

  const timeLabel = isRunning
    ? "In progress…"
    : lastSyncDate
      ? minutesAgo < 1
        ? "just now"
        : minutesAgo < 60
          ? `${minutesAgo}m ago`
          : `${Math.floor(minutesAgo / 60)}h ago`
      : "Never run";

  return (
    <div className="fixed right-3 z-50 bottom-20 md:bottom-3" style={{ maxWidth: '320px' }}>
      <div
        className="clay-card p-3 min-w-[200px] cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex-shrink-0">
              <GitBranch className="w-4 h-4 text-blue-600" />
              {isRunning && (
                <RefreshCw className="w-3 h-3 text-blue-500 animate-spin absolute -top-1 -right-1" />
              )}
              {!isRunning && lastSyncDate && !hasErrors && (
                <Check className="w-3 h-3 text-green-500 absolute -top-1 -right-1" />
              )}
              {!isRunning && hasErrors && (
                <AlertTriangle className="w-3 h-3 text-amber-500 absolute -top-1 -right-1" />
              )}
            </div>
            <div className="text-xs min-w-0">
              <div className="font-semibold text-gray-800 truncate">
                {isRunning ? "Syncing…" : "Smartsheet Sync"}
              </div>
              <div className="text-gray-500 truncate">{timeLabel}</div>
            </div>
          </div>
          {expanded
            ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            : <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
          }
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-2" onClick={(e) => e.stopPropagation()}>
            {results.length > 0 ? (
              results.map((r, i) => (
                <div key={i} className="text-xs space-y-1">
                  <div className="font-medium text-gray-700 capitalize">
                    {r.dataset}
                    {r.direction && <span className="text-gray-400 ml-1">({r.direction === 'pull' ? 'SS→B44' : 'B44→SS'})</span>}
                  </div>
                  {r.skipped ? (
                    <div className="text-amber-600 text-[11px]">Skipped: {r.reason}</div>
                  ) : (
                    <div className="flex gap-3 text-gray-500">
                      {r.created > 0 && <span className="text-green-600">+{r.created} new</span>}
                      {r.updated > 0 && <span className="text-blue-600">↑{r.updated} updated</span>}
                      {r.errors > 0 && <span className="text-red-600">!{r.errors} errors</span>}
                      {r.conflicts > 0 && <span className="text-amber-600">⚠{r.conflicts} conflicts</span>}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-xs text-gray-500">No sync results yet. Waiting for first scheduled run.</div>
            )}
            {(totalCreated > 0 || totalUpdated > 0) && !isRunning && (
              <div className="text-[11px] text-gray-500 pt-1">
                Last run: +{totalCreated} created, ↑{totalUpdated} updated
              </div>
            )}
            <div className="text-[10px] text-gray-400 pt-1 border-t border-gray-100">
              Auto-syncs every 15 min · Runs server-side even when you're away
            </div>
            <Link
              to="/AdminSettings?tab=smartsheet"
              className="block text-xs text-blue-600 hover:underline pt-1 font-medium"
              onClick={() => setExpanded(false)}
            >
              Open Sync Settings →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}