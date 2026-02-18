import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Trophy, Medal, Award, TrendingUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PALETTE = ["#F59E0B", "#9CA3AF", "#B45309", "#6366F1", "#22C55E", "#F97316", "#8B5CF6", "#06B6D4"];

const formatCurrency = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

const RankIcon = ({ rank }) => {
  if (rank === 1) return <Trophy className="w-4 h-4 text-yellow-500" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-gray-400" />;
  if (rank === 3) return <Award className="w-4 h-4 text-amber-600" />;
  return <span className="text-xs font-bold text-gray-500 w-4 text-center">#{rank}</span>;
};

export default function TeamLeaderboard({ workOrders = [], users = [] }) {
  const [metric, setMetric] = useState("pipeline_value"); // pipeline_value | won_value | leads | conversion | avg_deal

  const leaderboardData = useMemo(() => {
    const personMap = {};

    workOrders.forEach((wo) => {
      // Track estimators
      const fields = [
        { name: wo.estimator, role: "Estimator" },
        { name: wo.project_manager, role: "Project Manager" },
        { name: wo.current_task_assigned_to, role: "Task Assigned" },
      ];

      fields.forEach(({ name, role }) => {
        if (!name) return;
        if (!personMap[name]) {
          personMap[name] = {
            name,
            leads: 0,
            won: 0,
            lost: 0,
            pipeline_value: 0,
            won_value: 0,
            roles: new Set(),
          };
        }
        personMap[name].leads++;
        personMap[name].pipeline_value += wo.estimate_amount || 0;
        personMap[name].roles.add(role);

        if (wo.sales_status === "won") {
          personMap[name].won++;
          personMap[name].won_value += wo.estimate_amount || 0;
        }
        if (wo.sales_status === "lost") {
          personMap[name].lost++;
        }
      });
    });

    return Object.values(personMap)
      .map((p) => ({
        ...p,
        roles: [...p.roles].join(", "),
        conversion: p.leads > 0 ? Math.round((p.won / p.leads) * 100) : 0,
        avg_deal: p.won > 0 ? Math.round(p.won_value / p.won) : 0,
      }))
      .filter((p) => p.leads > 0)
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, 10);
  }, [workOrders, metric]);

  const metricLabel = {
    pipeline_value: "Pipeline Value",
    won_value: "Won Value",
    leads: "Total Leads",
    conversion: "Win Rate (%)",
    avg_deal: "Avg Deal Size",
  }[metric];

  const formatValue = (v) => {
    if (metric === "conversion") return `${v}%`;
    if (metric === "leads") return v;
    return formatCurrency(v);
  };

  const maxVal = leaderboardData[0]?.[metric] || 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-500" />
          Team Leaderboard
        </h3>
        <Select value={metric} onValueChange={setMetric}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pipeline_value">Pipeline Value</SelectItem>
            <SelectItem value="won_value">Won Value</SelectItem>
            <SelectItem value="leads">Total Leads</SelectItem>
            <SelectItem value="conversion">Win Rate</SelectItem>
            <SelectItem value="avg_deal">Avg Deal Size</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {leaderboardData.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">No team data available</div>
      ) : (
        <>
          {/* Top 3 podium */}
          {leaderboardData.length >= 3 && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[leaderboardData[1], leaderboardData[0], leaderboardData[2]].map((person, i) => {
                if (!person) return null;
                const rank = i === 0 ? 2 : i === 1 ? 1 : 3;
                const heights = ["h-16", "h-20", "h-14"];
                return (
                  <div key={person.name} className={`flex flex-col items-center gap-1 ${i === 1 ? "order-2" : i === 0 ? "order-1" : "order-3"}`}>
                    <RankIcon rank={rank} />
                    <div
                      className={`w-full ${heights[i]} rounded-t-lg flex items-end justify-center pb-2`}
                      style={{ backgroundColor: PALETTE[rank - 1] + "33", border: `2px solid ${PALETTE[rank - 1]}` }}
                    >
                      <span className="text-xs font-bold" style={{ color: PALETTE[rank - 1] }}>
                        {formatValue(person[metric])}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-gray-700 text-center leading-tight">{person.name.split(" ")[0]}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full list */}
          <div className="space-y-2">
            {leaderboardData.map((person, idx) => {
              const barPct = maxVal > 0 ? (person[metric] / maxVal) * 100 : 0;
              return (
                <div key={person.name} className="flex items-center gap-3">
                  <div className="w-6 flex-shrink-0 flex items-center justify-center">
                    <RankIcon rank={idx + 1} />
                  </div>
                  <div className="w-24 flex-shrink-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{person.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{person.roles}</p>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(barPct, 3)}%`, backgroundColor: PALETTE[idx % PALETTE.length] }}
                    />
                  </div>
                  <span className="text-xs font-bold text-gray-700 w-20 text-right flex-shrink-0">
                    {formatValue(person[metric])}
                  </span>
                  <span className="text-[10px] text-gray-400 w-12 text-right flex-shrink-0">
                    {person.leads}L/{person.won}W
                  </span>
                </div>
              );
            })}
          </div>

          {/* Chart */}
          <div className="pt-2">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={leaderboardData.slice(0, 8)} layout="vertical" margin={{ left: 60, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={metric === "conversion" ? (v) => `${v}%` : metric === "leads" ? undefined : (v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={56} tick={{ fontSize: 10 }} tickFormatter={(v) => v.split(" ")[0]} />
                <Tooltip formatter={(v) => [formatValue(v), metricLabel]} />
                <Bar dataKey={metric} radius={[0, 4, 4, 0]}>
                  {leaderboardData.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}