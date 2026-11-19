import { Link } from "react-router-dom";
import CountUp from "@/components/motion/CountUp";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";

const CARDS = [
  { key: "active", label: "ACTIVE ESTIMATES", color: "text-gray-900", to: "/EstimatorQueues" },
  { key: "sent", label: "AWAITING APPROVAL", color: "text-blue-600", to: "/EstimatorQueues?status=sent" },
  { key: "approved", label: "APPROVED", color: "text-emerald-600", to: "/EstimatorQueues?status=approved" },
  { key: "draft", label: "IN DRAFT", color: "text-amber-600", to: "/EstimatorQueues?status=draft" },
  { key: "syncIssues", label: "SYNC ISSUES", color: "text-red-600", tone: "danger", to: "/EstimatorQueues?status=sync_issues" },
];

export default function StatCards({ counts }) {
  return (
    <Stagger className="grid grid-cols-2 lg:grid-cols-5 gap-3" step={0.05}>
      {CARDS.map((c) => (
        <StaggerItem key={c.key}>
          <Link
            to={c.to}
            className={`glow-card block bg-white p-4 ${c.tone === "danger" && (counts[c.key] ?? 0) > 0 ? "glow-danger" : ""}`}
          >
            <div className="text-[11px] font-semibold tracking-wide text-gray-500">{c.label}</div>
            <div className={`text-2xl font-bold mt-1 ${c.color}`}>
              <CountUp value={counts[c.key] ?? 0} />
            </div>
          </Link>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
