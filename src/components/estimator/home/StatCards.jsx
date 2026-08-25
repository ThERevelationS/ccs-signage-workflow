import React from "react";
import { Link } from "react-router-dom";

const CARDS = [
  { key: "active", label: "ACTIVE ESTIMATES", color: "text-gray-900", to: "/EstimatorQueues" },
  { key: "sent", label: "AWAITING APPROVAL", color: "text-blue-600", to: "/EstimatorQueues?status=sent" },
  { key: "approved", label: "APPROVED", color: "text-emerald-600", to: "/EstimatorQueues?status=approved" },
  { key: "draft", label: "IN DRAFT", color: "text-amber-600", to: "/EstimatorQueues?status=draft" },
];

export default function StatCards({ counts }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {CARDS.map((c) => (
        <Link key={c.key} to={c.to} className="bg-white p-4 hover:opacity-90 transition-opacity">
          <div className="text-[11px] font-semibold tracking-wide text-gray-500">{c.label}</div>
          <div className={`text-2xl font-bold mt-1 ${c.color}`}>{counts[c.key] ?? 0}</div>
        </Link>
      ))}
    </div>
  );
}