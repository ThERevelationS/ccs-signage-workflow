import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell } from "lucide-react";
import StatCards from "@/components/estimator/home/StatCards";
import RecentActivity from "@/components/estimator/home/RecentActivity";

export default function SalesHome() {
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const res = await base44.entities.AllInOneEstimate.list("-created_date", 200);
      setEstimates(res || []);
      setLoading(false);
    };
    load();
  }, []);

  const counts = {
    active: estimates.filter((e) => e.status !== "archived").length,
    sent: estimates.filter((e) => e.status === "sent").length,
    approved: estimates.filter((e) => e.status === "approved").length,
    draft: estimates.filter((e) => !e.status || e.status === "draft").length,
    syncIssues: estimates.filter((e) => e.pipeline_sync_pending === true).length,
  };

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-3">
        <div className="bg-white px-4 py-3 flex items-center gap-2">
          <Bell className="w-4 h-4 text-emerald-600" />
          <h1 className="text-xs font-bold tracking-wide text-emerald-700">SALES HOME — NOTIFICATIONS</h1>
        </div>

        <StatCards counts={counts} />

        {loading ? (
          <div className="bg-white px-4 py-10 text-center text-sm text-gray-400">Loading activity…</div>
        ) : (
          <RecentActivity estimates={estimates.slice(0, 25)} />
        )}
      </div>
    </div>
  );
}