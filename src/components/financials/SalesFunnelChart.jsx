import React, { useMemo, useState } from "react";
import { FunnelChart, Funnel, Cell, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { TrendingDown, TrendingUp, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FUNNEL_STAGES = [
  { key: "lead", label: "Lead", color: "#3B82F6" },
  { key: "quoted", label: "Quoted", color: "#F59E0B" },
  { key: "follow_up", label: "Follow Up", color: "#F97316" },
  { key: "won", label: "Won", color: "#22C55E" },
];

const formatCurrency = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

export default function SalesFunnelChart({ workOrders = [] }) {
  const [metric, setMetric] = useState("count"); // count | value

  const funnelData = useMemo(() => {
    return FUNNEL_STAGES.map((stage) => {
      const items = workOrders.filter((wo) => wo.sales_status === stage.key);
      const value = items.reduce((s, wo) => s + (wo.estimate_amount || 0), 0);
      return {
        name: stage.label,
        key: stage.key,
        count: items.length,
        value,
        color: stage.color,
      };
    });
  }, [workOrders]);

  const conversionRates = useMemo(() => {
    const result = [];
    for (let i = 0; i < funnelData.length - 1; i++) {
      const from = funnelData[i];
      const to = funnelData[i + 1];
      const rate = from[metric] > 0 ? Math.round((to[metric] / from[metric]) * 100) : 0;
      result.push({ from: from.name, to: to.name, rate });
    }
    return result;
  }, [funnelData, metric]);

  const totalLost = workOrders.filter((wo) => wo.sales_status === "lost").length;
  const totalWon = workOrders.filter((wo) => wo.sales_status === "won").length;
  const overallConversion = workOrders.length > 0 ? Math.round((totalWon / workOrders.length) * 100) : 0;

  const displayData = funnelData.map((d) => ({ ...d, displayValue: d[metric] }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Sales Funnel</h3>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <Select value={metric} onValueChange={setMetric}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="count">By Count</SelectItem>
              <SelectItem value="value">By Value ($)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Overall Win Rate</p>
          <p className="text-2xl font-bold text-green-600">{overallConversion}%</p>
          <p className="text-xs text-gray-400">{totalWon} won</p>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Total Lost</p>
          <p className="text-2xl font-bold text-red-500">{totalLost}</p>
          <p className="text-xs text-gray-400">leads lost</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Active Pipeline</p>
          <p className="text-2xl font-bold text-blue-600">{workOrders.filter(w => !['won','lost'].includes(w.sales_status)).length}</p>
          <p className="text-xs text-gray-400">in progress</p>
        </div>
      </div>

      {/* Funnel visualization as horizontal bars */}
      <div className="space-y-2">
        {displayData.map((stage, idx) => {
          const maxVal = displayData[0]?.displayValue || 1;
          const pct = maxVal > 0 ? (stage.displayValue / maxVal) * 100 : 0;
          const convRate = idx < conversionRates.length ? conversionRates[idx].rate : null;
          return (
            <div key={stage.key}>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-medium text-gray-600 w-20 text-right">{stage.name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center justify-end pr-3 transition-all duration-500"
                    style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: stage.color }}
                  >
                    <span className="text-white text-xs font-bold">
                      {metric === "value" ? formatCurrency(stage.displayValue) : stage.displayValue}
                    </span>
                  </div>
                </div>
              </div>
              {convRate !== null && (
                <div className="flex items-center gap-1 ml-24 mb-1">
                  <TrendingDown className="w-3 h-3 text-gray-400" />
                  <span className="text-[10px] text-gray-400">{convRate}% conversion to next stage</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bar chart comparison */}
      <div className="pt-2">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={displayData} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={metric === "value" ? (v) => `$${(v / 1000).toFixed(0)}k` : undefined} />
            <Tooltip
              formatter={(v) => [metric === "value" ? formatCurrency(v) : v, metric === "value" ? "Value" : "Count"]}
            />
            <Bar dataKey="displayValue" name={metric === "value" ? "Value" : "Count"} radius={[4, 4, 0, 0]}>
              {displayData.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}