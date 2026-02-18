import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { FileText, Download, Calendar, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { format, subWeeks, subMonths, startOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";

const formatCurrency = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);

const Trend = ({ current, previous }) => {
  if (!previous) return null;
  const pct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
  if (pct > 0) return <span className="text-green-600 text-xs flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />+{pct}%</span>;
  if (pct < 0) return <span className="text-red-500 text-xs flex items-center gap-0.5"><TrendingDown className="w-3 h-3" />{pct}%</span>;
  return <span className="text-gray-400 text-xs flex items-center gap-0.5"><Minus className="w-3 h-3" />0%</span>;
};

export default function PerformanceSummaryReport({ workOrders = [] }) {
  const [period, setPeriod] = useState("monthly"); // weekly | monthly

  const periodCount = period === "weekly" ? 8 : 6;

  const periodData = useMemo(() => {
    const now = new Date();
    const periods = [];

    for (let i = periodCount - 1; i >= 0; i--) {
      let start, end, label;
      if (period === "weekly") {
        const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
        start = weekStart;
        end = new Date(weekStart);
        end.setDate(end.getDate() + 6);
        label = format(weekStart, "MM/dd");
      } else {
        const monthDate = subMonths(now, i);
        start = startOfMonth(monthDate);
        end = endOfMonth(monthDate);
        label = format(monthDate, "MMM yy");
      }

      const inPeriod = workOrders.filter((wo) => {
        const dateStr = wo.date_initial_contact || wo.created_date;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return isWithinInterval(d, { start, end });
      });

      const wonInPeriod = workOrders.filter((wo) => {
        const dateStr = wo.date_order_created;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return isWithinInterval(d, { start, end }) && wo.sales_status === "won";
      });

      const newLeads = inPeriod.length;
      const newWon = wonInPeriod.length;
      const wonValue = wonInPeriod.reduce((s, wo) => s + (wo.estimate_amount || 0), 0);
      const pipelineValue = inPeriod.reduce((s, wo) => s + (wo.estimate_amount || 0), 0);
      const conversion = newLeads > 0 ? Math.round((newWon / newLeads) * 100) : 0;

      periods.push({ label, newLeads, newWon, wonValue, pipelineValue, conversion, start, end });
    }

    return periods;
  }, [workOrders, period, periodCount]);

  const currentPeriod = periodData[periodData.length - 1];
  const previousPeriod = periodData[periodData.length - 2];

  const handleExport = () => {
    const lines = [
      `Performance Summary Report - ${period === "weekly" ? "Weekly" : "Monthly"} View`,
      `Generated: ${format(new Date(), "MMM d, yyyy")}`,
      "",
      "Period,New Leads,Won Deals,Won Value,Pipeline Value,Conversion Rate",
      ...periodData.map((p) =>
        `${p.label},${p.newLeads},${p.newWon},${formatCurrency(p.wonValue)},${formatCurrency(p.pipelineValue)},${p.conversion}%`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `performance_report_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" />
          Performance Summary
        </h3>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly (8 wks)</SelectItem>
              <SelectItem value="monthly">Monthly (6 mo)</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleExport} className="h-8 gap-1">
            <Download className="w-3 h-3" />
            CSV
          </Button>
        </div>
      </div>

      {/* Current Period KPIs vs Previous */}
      {currentPeriod && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "New Leads", cur: currentPeriod.newLeads, prev: previousPeriod?.newLeads, fmt: (v) => v },
            { label: "Won Deals", cur: currentPeriod.newWon, prev: previousPeriod?.newWon, fmt: (v) => v },
            { label: "Won Value", cur: currentPeriod.wonValue, prev: previousPeriod?.wonValue, fmt: formatCurrency },
            { label: "Win Rate", cur: currentPeriod.conversion, prev: previousPeriod?.conversion, fmt: (v) => `${v}%` },
          ].map(({ label, cur, prev, fmt }) => (
            <div key={label} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">{label} <span className="text-[10px]">(current {period === "weekly" ? "wk" : "mo"})</span></p>
              <p className="text-lg font-bold text-gray-800">{fmt(cur)}</p>
              <Trend current={cur} previous={prev} />
            </div>
          ))}
        </div>
      )}

      {/* New Leads + Won Deals over time */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">New Leads vs Won Deals</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={periodData} barGap={2} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="newLeads" name="New Leads" fill="#3B82F6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="newWon" name="Won" fill="#22C55E" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Won Value trend */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">Won Revenue Trend</p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={periodData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => [formatCurrency(v), "Won Value"]} />
            <Line type="monotone" dataKey="wonValue" stroke="#22C55E" strokeWidth={2} dot={{ r: 3 }} name="Won Value" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Conversion Rate trend */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">Win Rate Over Time</p>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={periodData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
            <Tooltip formatter={(v) => [`${v}%`, "Win Rate"]} />
            <Line type="monotone" dataKey="conversion" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} name="Win Rate" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Period Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-3 py-2 text-left font-medium text-gray-600">Period</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">New Leads</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Won</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Win Rate</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Won Value</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Pipeline Value</th>
            </tr>
          </thead>
          <tbody>
            {[...periodData].reverse().map((p, idx) => (
              <tr key={p.label} className={idx === 0 ? "bg-blue-50 font-semibold" : idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="px-3 py-2">{p.label}{idx === 0 && <span className="ml-1 text-[10px] text-blue-500">(current)</span>}</td>
                <td className="px-3 py-2 text-right">{p.newLeads}</td>
                <td className="px-3 py-2 text-right text-green-600">{p.newWon}</td>
                <td className="px-3 py-2 text-right">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    p.conversion >= 50 ? "bg-green-100 text-green-700" :
                    p.conversion >= 20 ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  }`}>{p.conversion}%</span>
                </td>
                <td className="px-3 py-2 text-right text-green-600">{formatCurrency(p.wonValue)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(p.pipelineValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}