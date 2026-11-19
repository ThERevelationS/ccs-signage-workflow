import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell } from "lucide-react";
import StatCards from "@/components/estimator/home/StatCards";
import FadeIn from "@/components/motion/FadeIn";
import RecentActivity from "@/components/estimator/home/RecentActivity";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { staffEntities } from "@/components/staff/staffEntities";

export default function SalesHome() {
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const rows = await loadAllEntityRows({
          entity: staffEntities.AllInOneEstimate,
          sort: "-created_date",
          label: "Sales Home estimates",
        });
        // Trashed estimates are excluded from every stat card and the recent
        // activity feed; they only surface again through Estimate Queues Trash.
        setEstimates((rows || []).filter((e) => e?.deleted !== true));
      } catch (err) {
        console.error("Sales Home estimates could not be loaded:", err);
        setLoadError(err?.message || "Estimates could not be loaded.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const counts = {
    active: estimates.filter((e) => !["archived", "cancelled"].includes(e.status)).length,
    sent: estimates.filter((e) => e.status === "sent").length,
    approved: estimates.filter((e) => e.status === "approved").length,
    draft: estimates.filter((e) => !e.status || e.status === "draft").length,
    syncIssues: estimates.filter((e) => e.pipeline_sync_pending === true).length,
  };

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-3">
        <FadeIn>
        <div className="bg-white px-4 py-3 flex items-center gap-2">
          <Bell className="w-4 h-4 text-emerald-600" />
          <h1 className="text-xs font-bold tracking-wide text-emerald-700">SALES HOME — NOTIFICATIONS</h1>
        </div>
        </FadeIn>

        <StatCards counts={counts} />

        <FadeIn delay={0.12}>
        {loading ? (
          <div className="bg-white px-4 py-10 text-center text-sm text-gray-400">Loading activity…</div>
        ) : loadError ? (
          <div className="bg-white px-4 py-10 text-center text-sm text-red-600">{loadError}</div>
        ) : (
          <RecentActivity estimates={estimates.slice(0, 25)} />
        )}
        </FadeIn>
      </div>
    </div>
  );
}