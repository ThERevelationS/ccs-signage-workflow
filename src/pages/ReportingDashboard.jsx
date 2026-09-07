import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { BarChart3, CheckCircle2, Clock, Users, TrendingUp, Loader2 } from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const STAGES = ["estimating", "sales", "permitting", "design", "production", "fabrication", "installation"];
const STAGE_COLORS = {
  estimating: "#FFF9C4", sales: "#B2DFDB", permitting: "#FFE4D6",
  design: "#D4E9F7", production: "#C8F4E9", fabrication: "#FFD6E8",
  installation: "#E0D4F7", completed: "#A5D6A7"
};
const STAGE_LABEL = {
  estimating: "Estimating", sales: "Sales", permitting: "Permitting",
  design: "Design", production: "Production", fabrication: "Fabrication",
  installation: "Installation", completed: "Completed"
};
const CHART_COLORS = ["#8B5CF6","#3B82F6","#10B981","#F59E0B","#EF4444","#EC4899","#6366F1","#14B8A6"];

export default function ReportingDashboard() {
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");

  useEffect(() => {
    document.title = "Reporting Dashboard - Workflow Manager";
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setReadError("");
    try {
      const [wos, us] = await Promise.all([
        loadAllEntityRows({
          entity: base44.entities.WorkOrder,
          query: { deleted: false },
          sort: "created_date",
          label: "Reporting Dashboard Work Orders",
        }),
        base44.entities.AuthorizedEmail.list()
      ]);
      setWorkOrders(wos || []);
      setUsers(us || []);
    } catch (error) {
      console.error("Error loading reporting dashboard data:", error);
      setWorkOrders([]);
      setUsers([]);
      setReadError(error?.message || "Reporting Dashboard Work Orders could not be verified completely.");
    } finally {
      setLoading(false);
    }
  };

  // Derived stats
  const active = workOrders.filter(wo => !wo.completed && !wo.deleted);
  const completed = workOrders.filter(wo => wo.completed && !wo.deleted);
  const completionRate = workOrders.length > 0
    ? Math.round((completed.length / workOrders.length) * 100) : 0;

  // Stage distribution
  const stageData = STAGES.map(stage => ({
    name: STAGE_LABEL[stage],
    count: active.filter(wo => wo.current_stage === stage).length,
    fill: STAGE_COLORS[stage]
  })).filter(d => d.count > 0);

  // Completion rate pie
  const completionPie = [
    { name: "Active", value: active.length, fill: "#8B5CF6" },
    { name: "Completed", value: completed.length, fill: "#10B981" }
  ];

  // Due dates in next 30 days
  const today = new Date();
  const next30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return format(d, "MMM d");
  });
  const timelineData = next30.map(label => ({
    date: label,
    count: active.filter(wo => {
      if (!wo.due_date) return false;
      return format(new Date(wo.due_date), "MMM d") === label;
    }).length
  })).filter(d => d.count > 0);

  // Resource allocation: count active work orders per assignee
  const assigneeCounts = {};
  active.forEach(wo => {
    const name = wo.assigned_to || "Unassigned";
    assigneeCounts[name] = (assigneeCounts[name] || 0) + 1;
  });
  const resourceData = Object.entries(assigneeCounts)
    .map(([name, count]) => ({ name: name.split(" ")[0] || name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // ASAP count
  const asapCount = active.filter(wo => wo.asap).length;

  // Overdue
  const overdueCount = active.filter(wo => {
    if (!wo.due_date) return false;
    return new Date(wo.due_date) < today;
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-96">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (readError) {
    return (
      <div className="p-6 min-h-full flex items-center justify-center">
        <div className="clay-card p-6 text-center max-w-xl">
          <div className="text-sm font-bold text-red-700">Reporting data could not be verified.</div>
          <div className="mt-1 text-xs text-red-600">{readError}</div>
          <button type="button" onClick={loadData} className="mt-3 h-8 px-3 rounded border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 min-h-full" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="clay-card p-3">
            <BarChart3 className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Reporting Dashboard</h1>
            <p className="text-gray-500 text-sm">Key performance metrics at a glance</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Active Work Orders", value: active.length, icon: Clock, color: "#8B5CF6", bg: "#EDE9FE" },
            { label: "Completed", value: completed.length, icon: CheckCircle2, color: "#10B981", bg: "#D1FAE5" },
            { label: "Completion Rate", value: `${completionRate}%`, icon: TrendingUp, color: "#3B82F6", bg: "#DBEAFE" },
            { label: "ASAP / Overdue", value: `${asapCount} / ${overdueCount}`, icon: Users, color: "#EF4444", bg: "#FEE2E2" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="clay-card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Stage Distribution Bar */}
          <div className="clay-card p-5">
            <h2 className="text-base font-semibold text-gray-700 mb-4">Stage Distribution</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stageData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Work Orders">
                  {stageData.map((entry, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Completion Pie */}
          <div className="clay-card p-5">
            <h2 className="text-base font-semibold text-gray-700 mb-4">Work Order Status</h2>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="60%" height={220}>
                <PieChart>
                  <Pie data={completionPie} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3}>
                    {completionPie.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {completionPie.map(entry => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: entry.fill }} />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{entry.value}</p>
                      <p className="text-xs text-gray-500">{entry.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Due in next 30 days */}
          <div className="clay-card p-5">
            <h2 className="text-base font-semibold text-gray-700 mb-4">Due Dates — Next 30 Days</h2>
            {timelineData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No due dates in the next 30 days</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={timelineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Due" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Resource Allocation */}
          <div className="clay-card p-5">
            <h2 className="text-base font-semibold text-gray-700 mb-4">Resource Allocation (Active WOs)</h2>
            {resourceData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={resourceData} layout="vertical" margin={{ top: 4, right: 16, left: 16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={70} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10B981" radius={[0, 4, 4, 0]} name="Work Orders">
                    {resourceData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}