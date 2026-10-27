import React from "react";
import { Link } from "react-router-dom";
import { Clock, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { isQuoteExpired, localDateStamp, quoteExpirationDate } from "../quoteLifecycle";

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
              {e.status === "sent" && e.quote_issue_date ? (() => {
                const expires = quoteExpirationDate(e.quote_issue_date, e.quote_valid_days);
                const today = localDateStamp(new Date());
                if (!expires) return null;
                if (isQuoteExpired(e.quote_issue_date, e.quote_valid_days)) return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 flex-shrink-0">EXPIRED</span>;
                const daysLeft = Math.round((new Date(`${expires}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
                if (daysLeft <= 7) return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 flex-shrink-0">EXPIRES {format(new Date(`${expires}T00:00:00`), "MMM d").toUpperCase()}</span>;
                return null;
              })() : null}
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