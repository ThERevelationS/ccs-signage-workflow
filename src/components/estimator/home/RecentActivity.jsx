import React from "react";
import { Link } from "react-router-dom";
import { Clock, TrendingUp } from "lucide-react";
import { format } from "date-fns";

export default function RecentActivity({ estimates }) {
  return (
    <div className="bg-white">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <TrendingUp className="w-4 h-4 text-red-500" />
        <h2 className="text-xs font-bold tracking-wide text-gray-600">RECENT ESTIMATE ACTIVITY</h2>
      </div>
      {estimates.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">No estimate activity yet.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {estimates.map((e) => (
            <Link
              key={e.id}
              to={`/EstimateDetail?id=${e.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50/50"
            >
              <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-800 truncate">{e.project_name}</div>
                <div className="text-xs text-gray-500 truncate">
                  {e.client_name} · {e.status || "draft"}
                </div>
              </div>
              <div className="text-xs text-gray-400 flex-shrink-0">
                {e.created_date ? format(new Date(e.created_date), "MMM d") : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}