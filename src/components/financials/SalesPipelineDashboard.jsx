import React, { useMemo } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line 
} from "recharts";
import { DollarSign, TrendingUp, Clock, Users } from "lucide-react";
import { differenceInDays } from "date-fns";

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe', '#00C49F'];

const STATUS_COLORS = {
  lead: '#3B82F6',
  quoted: '#F59E0B',
  follow_up: '#F97316',
  won: '#22C55E',
  lost: '#EF4444',
  on_hold: '#6B7280'
};

const STATUS_LABELS = {
  lead: 'Lead',
  quoted: 'Quoted',
  follow_up: 'Follow Up',
  won: 'Won',
  lost: 'Lost',
  on_hold: 'On Hold'
};

export default function SalesPipelineDashboard({ workOrders = [] }) {
  // 1. Total value by sales status
  const valueByStatus = useMemo(() => {
    const statusTotals = {};
    workOrders.forEach(wo => {
      const status = wo.sales_status || 'lead';
      const amount = wo.estimate_amount || 0;
      if (!statusTotals[status]) {
        statusTotals[status] = { count: 0, total: 0 };
      }
      statusTotals[status].count++;
      statusTotals[status].total += amount;
    });
    
    return Object.entries(statusTotals).map(([status, data]) => ({
      name: STATUS_LABELS[status] || status,
      value: data.total,
      count: data.count,
      fill: STATUS_COLORS[status] || '#8884d8'
    }));
  }, [workOrders]);

  // 2. Sales forecast (probability * estimate amount)
  const salesForecast = useMemo(() => {
    let weightedTotal = 0;
    let totalPipeline = 0;
    let activeDeals = 0;
    
    workOrders.forEach(wo => {
      if (wo.sales_status !== 'lost' && wo.sales_status !== 'won') {
        const amount = wo.estimate_amount || 0;
        const probability = (wo.probability || 50) / 100;
        weightedTotal += amount * probability;
        totalPipeline += amount;
        if (amount > 0) activeDeals++;
      }
    });
    
    const wonTotal = workOrders
      .filter(wo => wo.sales_status === 'won')
      .reduce((sum, wo) => sum + (wo.estimate_amount || 0), 0);
    
    return {
      weighted: weightedTotal,
      pipeline: totalPipeline,
      won: wonTotal,
      activeDeals
    };
  }, [workOrders]);

  // 3. Average deal cycle time
  const cycleTimeStats = useMemo(() => {
    const completedDeals = workOrders.filter(wo => 
      wo.sales_status === 'won' && wo.date_initial_contact && wo.date_order_created
    );
    
    if (completedDeals.length === 0) {
      return { average: 0, fastest: 0, slowest: 0, count: 0 };
    }
    
    const cycleTimes = completedDeals.map(wo => {
      const start = new Date(wo.date_initial_contact);
      const end = new Date(wo.date_order_created);
      return differenceInDays(end, start);
    }).filter(d => d >= 0);
    
    if (cycleTimes.length === 0) {
      return { average: 0, fastest: 0, slowest: 0, count: 0 };
    }
    
    const average = cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length;
    const fastest = Math.min(...cycleTimes);
    const slowest = Math.max(...cycleTimes);
    
    return {
      average: Math.round(average),
      fastest,
      slowest,
      count: cycleTimes.length
    };
  }, [workOrders]);

  // 4. Lead source performance
  const leadSourcePerformance = useMemo(() => {
    const sourceData = {};
    
    workOrders.forEach(wo => {
      const source = wo.lead_source || 'Unknown';
      if (!sourceData[source]) {
        sourceData[source] = { total: 0, won: 0, lost: 0, value: 0, wonValue: 0 };
      }
      sourceData[source].total++;
      sourceData[source].value += wo.estimate_amount || 0;
      
      if (wo.sales_status === 'won') {
        sourceData[source].won++;
        sourceData[source].wonValue += wo.estimate_amount || 0;
      } else if (wo.sales_status === 'lost') {
        sourceData[source].lost++;
      }
    });
    
    return Object.entries(sourceData)
      .map(([source, data]) => ({
        name: source,
        leads: data.total,
        won: data.won,
        lost: data.lost,
        value: data.value,
        wonValue: data.wonValue,
        conversionRate: data.total > 0 ? Math.round((data.won / data.total) * 100) : 0
      }))
      .sort((a, b) => b.value - a.value);
  }, [workOrders]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const totalPipelineValue = valueByStatus.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="clay-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Pipeline</p>
              <p className="text-xl font-bold text-gray-800">{formatCurrency(totalPipelineValue)}</p>
              <p className="text-xs text-gray-500">{workOrders.length} leads</p>
            </div>
          </div>
        </div>

        <div className="clay-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Weighted Forecast</p>
              <p className="text-xl font-bold text-gray-800">{formatCurrency(salesForecast.weighted)}</p>
              <p className="text-xs text-gray-500">{salesForecast.activeDeals} active deals</p>
            </div>
          </div>
        </div>

        <div className="clay-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Avg Cycle Time</p>
              <p className="text-xl font-bold text-gray-800">{cycleTimeStats.average} days</p>
              <p className="text-xs text-gray-500">{cycleTimeStats.fastest}-{cycleTimeStats.slowest} day range</p>
            </div>
          </div>
        </div>

        <div className="clay-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100">
              <Users className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Won Revenue</p>
              <p className="text-xl font-bold text-gray-800">{formatCurrency(salesForecast.won)}</p>
              <p className="text-xs text-gray-500">{workOrders.filter(w => w.sales_status === 'won').length} closed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Value by Status */}
        <div className="clay-card p-4">
          <h3 className="font-semibold text-gray-800 mb-4">Pipeline Value by Status</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={valueByStatus} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" width={80} />
              <Tooltip 
                formatter={(value, name) => [formatCurrency(value), name === 'value' ? 'Value' : 'Count']}
              />
              <Bar dataKey="value" name="Value">
                {valueByStatus.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status Distribution Pie */}
        <div className="clay-card p-4">
          <h3 className="font-semibold text-gray-800 mb-4">Lead Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={valueByStatus}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, count }) => `${name}: ${count}`}
                outerRadius={100}
                dataKey="count"
              >
                {valueByStatus.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [value, 'Count']} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Lead Source Performance */}
      <div className="clay-card p-4">
        <h3 className="font-semibold text-gray-800 mb-4">Lead Source Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Source</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">Total Leads</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">Won</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">Lost</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">Conversion %</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">Total Value</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">Won Value</th>
              </tr>
            </thead>
            <tbody>
              {leadSourcePerformance.map((source, idx) => (
                <tr key={source.name} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-2 font-medium">{source.name}</td>
                  <td className="px-4 py-2 text-right">{source.leads}</td>
                  <td className="px-4 py-2 text-right text-green-600">{source.won}</td>
                  <td className="px-4 py-2 text-right text-red-600">{source.lost}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      source.conversionRate >= 50 ? 'bg-green-100 text-green-700' :
                      source.conversionRate >= 25 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {source.conversionRate}%
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{formatCurrency(source.value)}</td>
                  <td className="px-4 py-2 text-right text-green-600">{formatCurrency(source.wonValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lead Source Chart */}
      <div className="clay-card p-4">
        <h3 className="font-semibold text-gray-800 mb-4">Lead Source Comparison</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={leadSourcePerformance.slice(0, 8)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis yAxisId="left" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip 
              formatter={(value, name) => [
                name === 'value' || name === 'wonValue' ? formatCurrency(value) : value,
                name === 'value' ? 'Total Value' : name === 'wonValue' ? 'Won Value' : 'Leads'
              ]}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="value" name="Total Value" fill="#8884d8" />
            <Bar yAxisId="left" dataKey="wonValue" name="Won Value" fill="#82ca9d" />
            <Bar yAxisId="right" dataKey="leads" name="Leads" fill="#ffc658" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}