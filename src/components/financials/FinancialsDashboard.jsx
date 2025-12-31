import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F', '#FFBB28', '#FF8042', '#0088FE'];

const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatCurrency = (value) => {
  if (!value && value !== 0) return "$0";
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

export default function FinancialsDashboard({ workOrders, dateRange, reportPeriod }) {
  // Filter work orders by date range based on install date
  const filteredByDate = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return workOrders;
    
    return workOrders.filter(wo => {
      if (!wo.project_install_date) return false;
      const installDate = parseLocalDate(wo.project_install_date);
      if (!installDate) return false;
      
      if (dateRange.start && installDate < dateRange.start) return false;
      if (dateRange.end && installDate > dateRange.end) return false;
      return true;
    });
  }, [workOrders, dateRange]);

  // Revenue over time (monthly)
  const revenueOverTime = useMemo(() => {
    const monthlyData = {};
    
    filteredByDate.forEach(wo => {
      if (!wo.project_install_date || !wo.estimate_amount) return;
      const date = parseLocalDate(wo.project_install_date);
      if (!date) return;
      
      const monthKey = format(date, 'MMM yyyy');
      const sortKey = format(date, 'yyyy-MM');
      
      if (!monthlyData[sortKey]) {
        monthlyData[sortKey] = { month: monthKey, sortKey, revenue: 0, count: 0 };
      }
      monthlyData[sortKey].revenue += wo.estimate_amount || 0;
      monthlyData[sortKey].count += 1;
    });
    
    return Object.values(monthlyData).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [filteredByDate]);

  // Revenue by Project Manager
  const revenueByPM = useMemo(() => {
    const pmData = {};
    
    filteredByDate.forEach(wo => {
      const pm = wo.project_manager || 'Unassigned';
      if (!pmData[pm]) {
        pmData[pm] = { name: pm, revenue: 0, count: 0 };
      }
      pmData[pm].revenue += wo.estimate_amount || 0;
      pmData[pm].count += 1;
    });
    
    return Object.values(pmData).sort((a, b) => b.revenue - a.revenue);
  }, [filteredByDate]);

  // Revenue by Client (top 10)
  const revenueByClient = useMemo(() => {
    const clientData = {};
    
    filteredByDate.forEach(wo => {
      const client = wo.client_name || 'Unknown';
      if (!clientData[client]) {
        clientData[client] = { name: client, revenue: 0, count: 0 };
      }
      clientData[client].revenue += wo.estimate_amount || 0;
      clientData[client].count += 1;
    });
    
    return Object.values(clientData).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [filteredByDate]);

  // Summary statistics
  const summary = useMemo(() => {
    let totalRevenue = 0;
    let projectCount = 0;
    let inhouseCount = 0;
    let outsourceCount = 0;
    let inhouseRevenue = 0;
    let outsourceRevenue = 0;

    filteredByDate.forEach(wo => {
      const amount = wo.estimate_amount || 0;
      totalRevenue += amount;
      projectCount += 1;
      
      if (wo.production_type === 'inhouse') {
        inhouseCount += 1;
        inhouseRevenue += amount;
      } else if (wo.production_type === 'outsource') {
        outsourceCount += 1;
        outsourceRevenue += amount;
      }
    });

    return {
      totalRevenue,
      projectCount,
      avgProjectValue: projectCount > 0 ? totalRevenue / projectCount : 0,
      inhouseCount,
      outsourceCount,
      inhouseRevenue,
      outsourceRevenue
    };
  }, [filteredByDate]);

  // Period summary (monthly, quarterly, yearly)
  const periodSummary = useMemo(() => {
    const periods = {};
    
    filteredByDate.forEach(wo => {
      if (!wo.project_install_date) return;
      const date = parseLocalDate(wo.project_install_date);
      if (!date) return;
      
      let periodKey, periodLabel;
      
      if (reportPeriod === 'monthly') {
        periodKey = format(date, 'yyyy-MM');
        periodLabel = format(date, 'MMMM yyyy');
      } else if (reportPeriod === 'quarterly') {
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        periodKey = `${date.getFullYear()}-Q${quarter}`;
        periodLabel = `Q${quarter} ${date.getFullYear()}`;
      } else {
        periodKey = format(date, 'yyyy');
        periodLabel = format(date, 'yyyy');
      }
      
      if (!periods[periodKey]) {
        periods[periodKey] = { 
          period: periodLabel, 
          sortKey: periodKey,
          revenue: 0, 
          count: 0,
          avgValue: 0
        };
      }
      periods[periodKey].revenue += wo.estimate_amount || 0;
      periods[periodKey].count += 1;
    });
    
    // Calculate averages
    Object.values(periods).forEach(p => {
      p.avgValue = p.count > 0 ? p.revenue / p.count : 0;
    });
    
    return Object.values(periods).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [filteredByDate, reportPeriod]);

  // Production type breakdown
  const productionBreakdown = useMemo(() => {
    return [
      { name: 'Inhouse', value: summary.inhouseRevenue, count: summary.inhouseCount },
      { name: 'Outsource', value: summary.outsourceRevenue, count: summary.outsourceCount },
      { name: 'Unassigned', value: summary.totalRevenue - summary.inhouseRevenue - summary.outsourceRevenue, count: summary.projectCount - summary.inhouseCount - summary.outsourceCount }
    ].filter(d => d.value > 0);
  }, [summary]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="clay-card p-4">
          <p className="text-xs text-gray-500 uppercase">Total Revenue</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.totalRevenue)}</p>
        </div>
        <div className="clay-card p-4">
          <p className="text-xs text-gray-500 uppercase">Projects</p>
          <p className="text-2xl font-bold text-blue-600">{summary.projectCount}</p>
        </div>
        <div className="clay-card p-4">
          <p className="text-xs text-gray-500 uppercase">Avg Project Value</p>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(summary.avgProjectValue)}</p>
        </div>
        <div className="clay-card p-4">
          <p className="text-xs text-gray-500 uppercase">Inhouse vs Outsource</p>
          <p className="text-lg font-bold">
            <span className="text-green-600">{summary.inhouseCount}</span>
            <span className="text-gray-400 mx-1">/</span>
            <span className="text-orange-600">{summary.outsourceCount}</span>
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Revenue Over Time */}
        <div className="clay-card p-4">
          <h3 className="font-bold text-sm mb-4">Revenue Over Time</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueOverTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip 
                  formatter={(value) => formatCurrency(value)}
                  labelFormatter={(label) => `Month: ${label}`}
                />
                <Bar dataKey="revenue" fill="#8884d8" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue by Project Manager */}
        <div className="clay-card p-4">
          <h3 className="font-bold text-sm mb-4">Revenue by Project Manager</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByPM} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="revenue" fill="#82ca9d" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Top Clients */}
        <div className="clay-card p-4">
          <h3 className="font-bold text-sm mb-4">Top 10 Clients by Revenue</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {revenueByClient.map((client, idx) => (
              <div key={client.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
                    {idx + 1}
                  </span>
                  <span className="truncate max-w-[120px]" title={client.name}>{client.name}</span>
                </div>
                <div className="text-right">
                  <span className="font-medium">{formatCurrency(client.revenue)}</span>
                  <span className="text-gray-400 ml-1">({client.count})</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Production Breakdown */}
        <div className="clay-card p-4">
          <h3 className="font-bold text-sm mb-4">Production Type Breakdown</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={productionBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {productionBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Period Summary Table */}
        <div className="clay-card p-4">
          <h3 className="font-bold text-sm mb-4">
            {reportPeriod === 'monthly' ? 'Monthly' : reportPeriod === 'quarterly' ? 'Quarterly' : 'Yearly'} Summary
          </h3>
          <div className="overflow-y-auto max-h-64">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">Period</th>
                  <th className="text-right px-2 py-1">Revenue</th>
                  <th className="text-right px-2 py-1">Projects</th>
                </tr>
              </thead>
              <tbody>
                {periodSummary.map(period => (
                  <tr key={period.sortKey} className="border-b">
                    <td className="px-2 py-1">{period.period}</td>
                    <td className="text-right px-2 py-1 font-medium">{formatCurrency(period.revenue)}</td>
                    <td className="text-right px-2 py-1">{period.count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td className="px-2 py-1">Total</td>
                  <td className="text-right px-2 py-1">{formatCurrency(summary.totalRevenue)}</td>
                  <td className="text-right px-2 py-1">{summary.projectCount}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}