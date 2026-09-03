import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { ListFilter } from "lucide-react";

const STATUSES = [
  { key: "", label: "All" },
  { key: "draft", label: "In Draft" },
  { key: "calculated", label: "Calculated" },
  { key: "sent", label: "Awaiting Approval" },
  { key: "approved", label: "Approved" },
  { key: "archived", label: "Archived" },
  { key: "sync_issues", label: "Sync Issues" },
];

export default function EstimatorQueues() {
  const location = useLocation();
  const status = new URLSearchParams(location.search).get("status") || "";
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const res = await base44.entities.AllInOneEstimate.list("-created_date", 300);
      setEstimates(res || []);
      setLoading(false);
    };
    load();
  }, []);

  const rows = status === "sync_issues"
    ? estimates.filter((e) => e.pipeline_sync_pending === true)
    : status
      ? estimates.filter((e) => (e.status || "draft") === status)
      : estimates;

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-3">
        <div className="bg-white px-4 py-3 flex items-center gap-2">
          <ListFilter className="w-4 h-4 text-red-500" />
          <h1 className="text-xs font-bold tracking-wide text-gray-600">ESTIMATE QUEUES</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Link
              key={s.key || "all"}
              to={s.key ? `/EstimatorQueues?status=${s.key}` : "/EstimatorQueues"}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                status === s.key
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white/70 text-gray-600 border-gray-200 hover:border-red-300"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>

        <div className="bg-white">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">Nothing in this queue.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {rows.map((e) => (
                <Link
                  key={e.id}
                  to={`/EstimateDetail?id=${e.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-red-50/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-800 truncate">{e.project_name}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {e.client_name}
                      {e.estimate_number ? ` · ${e.estimate_number}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {e.pipeline_sync_pending && <span className="text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">SYNC ISSUE</span>}
                    <span className="text-xs font-medium text-gray-500 capitalize">
                      {e.status || "draft"}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-gray-800 w-24 text-right flex-shrink-0">
                    ${Number(e.quote_total || e.total_cost || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs text-gray-400 w-16 text-right hidden sm:block flex-shrink-0">
                    {e.created_date ? format(new Date(e.created_date), "MMM d") : ""}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}