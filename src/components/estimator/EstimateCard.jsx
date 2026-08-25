import React from "react";
import { Link } from "react-router-dom";
import { FileText, Trash2, User, Calendar } from "lucide-react";
import { format } from "date-fns";

const STATUS_STYLES = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  calculated: "bg-amber-50 text-amber-700 border-amber-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  archived: "bg-slate-100 text-slate-500 border-slate-200",
};

export default function EstimateCard({ estimate, onDelete }) {
  const total = Number(estimate.quote_total || estimate.total_cost || 0);
  const sections = (estimate.line_items || []).length;

  return (
    <div className="clay-card p-4 border-l-4 border-l-red-400">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/EstimateDetail?id=${estimate.id}`} className="flex items-center gap-2 group">
            <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
            <h3 className="font-semibold text-gray-900 truncate group-hover:text-red-600">
              {estimate.project_name}
            </h3>
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              {estimate.client_name}
            </span>
            {estimate.estimate_number && (
              <span className="font-mono text-xs text-gray-400">{estimate.estimate_number}</span>
            )}
            {estimate.created_date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {format(new Date(estimate.created_date), "MMM d, yyyy")}
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-lg font-bold text-gray-900">
            ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-gray-400">{sections} section{sections === 1 ? "" : "s"}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
            STATUS_STYLES[estimate.status] || STATUS_STYLES.draft
          }`}
        >
          {estimate.status || "draft"}
        </span>
        <button
          onClick={() => onDelete(estimate)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Delete estimate"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}