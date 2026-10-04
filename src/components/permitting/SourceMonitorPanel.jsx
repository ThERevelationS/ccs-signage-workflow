import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, CheckCircle2, Clock, Activity, RefreshCw } from "lucide-react";
import { format } from "date-fns";

// ── Source Monitor Health Panel ──
// Shows per-source monitor health for a jurisdiction: last check, last change,
// failures, and staff-review-required alerts. Read-only — staff actions live
// in existing admin surfaces.

export default function SourceMonitorPanel({ jurisdictionName }) {
  const [monitors, setMonitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMonitors = async () => {
    setLoading(true);
    setError("");
    try {
      const page = await base44.entities.SourceMonitorState.filter(
        { jurisdiction_name: jurisdictionName, monitor_enabled: true },
        { sort: "-next_check_due", limit: 100 },
      );
      setMonitors(page.items || []);
    } catch (e) {
      console.error("Monitor load error:", e);
      setError(e?.message || "Failed to load monitor data.");
    }
    setLoading(false);
  };

  useEffect(() => { loadMonitors(); }, [jurisdictionName]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading source monitor health…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-red-600">
        <AlertTriangle className="w-4 h-4" /> {error}
      </div>
    );
  }

  if (monitors.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-gray-400">
        <Activity className="w-3.5 h-3.5" /> Source monitoring not yet enabled for this jurisdiction.
      </div>
    );
  }

  const reviewRequired = monitors.filter((m) => m.staff_review_required);
  const failed = monitors.filter((m) => (m.failure_count || 0) >= 3);
  const changed = monitors.filter((m) => m.last_changed);

  return (
    <div className="rounded-lg border-l-4 border-l-teal-400 bg-teal-50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-teal-800 flex items-center gap-1">
          <Activity className="w-3.5 h-3.5" /> Source Monitor Health
        </p>
        <button
          onClick={loadMonitors}
          className="text-teal-600 hover:text-teal-700 p-1"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="text-[10px]">{monitors.length} monitored</Badge>
        {reviewRequired.length > 0 && (
          <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
            {reviewRequired.length} need review
          </Badge>
        )}
        {failed.length > 0 && (
          <Badge className="text-[10px] bg-red-100 text-red-800 border-red-300">
            {failed.length} unavailable
          </Badge>
        )}
        {changed.length > 0 && (
          <Badge className="text-[10px] bg-blue-100 text-blue-800 border-blue-300">
            {changed.length} changed
          </Badge>
        )}
      </div>

      {/* Staff review required alerts */}
      {reviewRequired.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-amber-700">Staff Review Required</p>
          {reviewRequired.slice(0, 5).map((m) => (
            <div key={m.id} className="bg-white/70 rounded p-2 border border-amber-200">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium text-gray-800 truncate flex-1">
                  {m.source_title || m.official_url}
                </span>
                {m.may_affect_regulatory_data && (
                  <Badge className="text-[9px] bg-amber-100 text-amber-800 shrink-0">Regulatory impact</Badge>
                )}
                {(m.failure_count || 0) >= 3 && (
                  <Badge className="text-[9px] bg-red-100 text-red-800 shrink-0">Unavailable</Badge>
                )}
              </div>
              {m.last_change_summary?.ai_summary && (
                <p className="text-[10px] text-gray-600 mt-1">{m.last_change_summary.ai_summary}</p>
              )}
              {m.last_error && (m.failure_count || 0) >= 3 && (
                <p className="text-[10px] text-red-600 mt-1">Error: {m.last_error.slice(0, 120)}</p>
              )}
            </div>
          ))}
          {reviewRequired.length > 5 && (
            <p className="text-[10px] text-gray-400">+ {reviewRequired.length - 5} more</p>
          )}
        </div>
      )}

      {/* Per-source health list (collapsed) */}
      <details className="text-xs">
        <summary className="cursor-pointer text-teal-700 font-medium py-1">
          All monitored sources ({monitors.length})
        </summary>
        <div className="space-y-1 mt-2 max-h-48 overflow-y-auto">
          {monitors.map((m) => {
            const isOk = !m.staff_review_required && (m.failure_count || 0) < 3;
            const isStale = m.next_check_due && new Date(m.next_check_due) < new Date();
            return (
              <div key={m.id} className="flex items-center justify-between bg-white/50 rounded px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-medium text-gray-700 truncate block">{m.source_title || m.official_url}</span>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    {m.last_successful_check && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {format(new Date(m.last_successful_check), "MMM dd")}
                      </span>
                    )}
                    <span className="capitalize">{m.schedule_cadence}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isOk ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  {isStale && <Clock className="w-3 h-3 text-gray-400" />}
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}