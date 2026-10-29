import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { BarChart3, CheckCircle2, Clock, Users, TrendingUp, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { fetchAllWorkOrders } from "@/lib/workOrderCache";
import AttentionFeed from "@/components/workflow/AttentionFeed";
import { staffEntities } from "@/components/staff/staffEntities";

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
  const { sessionToken } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [financials, setFinancials] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [oppRows, setOppRows] = useState([]);
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
        fetchAllWorkOrders().then((rows) =>
          (rows || [])
            .filter((wo) => wo.deleted !== true)
            .sort((a, b) => (a.created_date || "").localeCompare(b.created_date || ""))),
        loadAllEntityRows({ entity: staffEntities.AuthorizedEmail, sort: null, label: "Reporting Dashboard authorized users" })
      ]);
      setWorkOrders(wos || []);
      setUsers(us || []);
      // Financial layer — staff-only functions; failure is non-fatal so the
      // operational charts still render if the session can't be resolved.
      const [revRes, oppRes] = await Promise.all([
        base44.functions.invoke("invoicingAction", { session_token: sessionToken, action: "revenue_summary", months: 12 }).catch(() => null),
        base44.functions.invoke("opportunityWorkspaceAction", { session_token: sessionToken, action: "list_opportunities", include_closed: true }).catch(() => null),
      ]);
      const rev = revRes?.data || revRes;
      if (rev?.success) setFinancials(rev);
      const opp = oppRes?.data || oppRes;
      if (opp?.success) { setPipeline(opp.funnel || null); setOppRows(opp.opportunities || []); }
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

  // Won/lost by month — bucket closed opportunities by their close date.
  const trendData = (() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: format(d, "MMM"), won: 0, lost: 0 });
    }
    const idx = Object.fromEntries(months.map((m, i) => [m.key, i]));
    for (const o of oppRows) {
      const stage = String(o?.stage || "");
      if (stage !== "won" && stage !== "lost") continue;
      const when = String(o?.closed_at || o?.stage_changed_at || "").slice(0, 7);
      const i = idx[when];
      if (i != null) months[i][stage] += 1;
    }
    return months;
  })();

  // Weekly estimate throughput — submissions per ISO week over the last 8w (#279)
  const weeklyThroughput = (() => {
    const weeks = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 86400000);
      const monday = new Date(d); monday.setDate(d.getDate() - d.getDay() + 1);
      const key = monday.toISOString().slice(0, 10);
      if (!weeks.find((w) => w.key === key)) weeks.push({ key, label: format(monday, "MMM d"), count: 0 });
    }
    const idx = Object.fromEntries(weeks.map((w, i) => [w.key, i]));
    for (const o of oppRows) {
      const when = String(o?.created_date || o?.submitted_date || "").slice(0, 10);
      if (!when) continue;
      const d = new Date(when); const monday = new Date(d); monday.setDate(d.getDate() - d.getDay() + 1);
      const i = idx[monday.toISOString().slice(0, 10)];
      if (i != null) weeks[i].count += 1;
    }
    return weeks;
  })();

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
    <div className="p-4 sm:p-6 min-h-full page-gradient-bg">
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

        <AttentionFeed />

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

        {/* Financials Row */}
        {(financials || pipeline) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {financials && (
              <div className="clay-card p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-700">Revenue — Trailing 12 Months</h2>
                  <div className="flex gap-4 text-xs">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "#8B5CF6" }} />Invoiced</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "#10B981" }} />Collected</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={financials.months || []} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                    <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
                    <Bar dataKey="invoiced" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Invoiced" />
                    <Bar dataKey="collected" fill="#10B981" radius={[4, 4, 0, 0]} name="Collected" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center border-t border-gray-100 pt-3">
                  {[
                    ["Invoiced (all)", financials.invoiced_total, "text-gray-800"],
                    ["Collected (all)", financials.collected_total, "text-emerald-600"],
                    ["Open AR", financials.open_ar, "text-violet-700"],
                    [`Overdue AR (${financials.overdue_count || 0})`, financials.overdue_ar, "text-red-600"],
                  ].map(([label, val, cls]) => (
                    <div key={label}>
                      <div className={`text-lg font-bold ${cls}`}>${Number(val || 0).toLocaleString()}</div>
                      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {pipeline && (
              <div className="clay-card p-5">
                <h2 className="text-base font-semibold text-gray-700 mb-4">Sales Pipeline</h2>
                <div className="grid grid-cols-2 gap-3 text-center">
                  {[
                    ["Open pipeline", pipeline.open_pipeline_value, "text-violet-700", true],
                    ["Won value", pipeline.won_value, "text-emerald-600", true],
                    ["Won deals", pipeline.won_count, "text-gray-800", false],
                    ["Win rate", pipeline.win_rate == null ? "—" : `${pipeline.win_rate}%`, "text-gray-800", false],
                  ].map(([label, val, cls, isMoney]) => (
                    <div key={label} className="rounded-lg border border-gray-100 p-2.5">
                      <div className={`text-lg font-bold ${cls}`}>{isMoney ? `$${Number(val || 0).toLocaleString()}` : val}</div>
                      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
                    </div>
                  ))}
                </div>
                {Array.isArray(pipeline.lost_reasons) && pipeline.lost_reasons.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Top loss reasons</div>
                    <div className="flex flex-wrap gap-1.5">
                      {pipeline.lost_reasons.slice(0, 5).map((r) => (
                        <span key={r.reason} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">
                          {r.reason} <b>×{r.count}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {trendData.some((m) => m.won || m.lost) && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Won vs lost — 6 months</div>
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={trendData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }} barGap={1}>
                        <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 9 }} />
                        <Tooltip />
                        <Bar dataKey="won" fill="#10B981" radius={[3, 3, 0, 0]} name="Won" />
                        <Bar dataKey="lost" fill="#EF4444" radius={[3, 3, 0, 0]} name="Lost" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
            {pipeline?.estimate_funnel && (
              <div className="clay-card p-5">
                <h2 className="text-base font-semibold text-gray-700 mb-4">Estimate Funnel</h2>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    ["Win rate", pipeline.estimate_funnel.win_rate == null ? "—" : `${pipeline.estimate_funnel.win_rate}%`, "text-emerald-600"],
                    ["Avg margin", pipeline.estimate_funnel.avg_margin_pct == null ? "—" : `${pipeline.estimate_funnel.avg_margin_pct}%`, "text-blue-600"],
                    ["Margin $", `$${Number(pipeline.estimate_funnel.total_margin || 0).toLocaleString()}`, "text-blue-600"],
                    ["Parts %", pipeline.estimate_funnel.avg_part_cost_ratio == null ? "—" : `${pipeline.estimate_funnel.avg_part_cost_ratio}%`, "text-indigo-600"],
                  ].map(([label, val, cls]) => (
                    <div key={label} className="rounded-lg border border-gray-100 p-2.5">
                      <div className={`text-lg font-bold ${cls}`}>{val}</div>
                      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">By status</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(pipeline.estimate_funnel.status_counts || {}).map(([status, count]) => (
                      <span key={status} className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-700 capitalize">
                        {status} <b>×{count}</b>
                      </span>
                    ))}
                  </div>
                </div>
                {Array.isArray(pipeline.estimate_funnel.by_module) && pipeline.estimate_funnel.by_module.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">By module</div>
                    <div className="space-y-1">
                      {pipeline.estimate_funnel.by_module.slice(0, 8).map((m) => (
                        <div key={m.module} className="flex items-center justify-between text-[11px] rounded border border-gray-100 px-2 py-1">
                          <span className="truncate text-gray-700 capitalize">{String(m.module).replace(/_/g, " ")}</span>
                          <span className="text-gray-500">{m.count} items · <b>${Number(m.value || 0).toLocaleString()}</b></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {weeklyThroughput.some((w) => w.count > 0) && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Estimates per week</div>
                    <div className="flex items-end gap-1">
                      {weeklyThroughput.map((w) => (
                        <div key={w.key} className="flex-1" title={`${w.label}: ${w.count}`}>
                          <div className="rounded-t bg-indigo-300/70" style={{ height: `${Math.max(4, Math.min(40, w.count * 8))}px` }} />
                          <div className="mt-0.5 text-center text-[9px] text-gray-400">{w.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pipeline.estimate_funnel.aging_buckets && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Quote aging</div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        ["Expired", pipeline.estimate_funnel.aging_buckets.expired, "bg-red-50 text-red-700"],
                        ["≤7d", pipeline.estimate_funnel.aging_buckets.expiring_7d, "bg-amber-50 text-amber-700"],
                        ["8–14d", pipeline.estimate_funnel.aging_buckets.valid_14d, "bg-blue-50 text-blue-700"],
                        ["15–30d", pipeline.estimate_funnel.aging_buckets.valid_30d, "bg-gray-50 text-gray-600"],
                        ["30d+", pipeline.estimate_funnel.aging_buckets.valid_30d_plus, "bg-gray-50 text-gray-600"],
                      ].map(([label, count, cls]) => count > 0 ? (
                        <span key={label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${cls}`}>
                          {label} <b>×{count}</b>
                        </span>
                      ) : null)}
                    </div>
                    {Array.isArray(pipeline.estimate_funnel.aging_rows) && pipeline.estimate_funnel.aging_rows.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {pipeline.estimate_funnel.aging_rows.slice(0, 6).map((q) => (
                          <div key={q.id} className="flex items-center justify-between text-[11px] rounded border border-gray-100 px-2 py-1">
                            <span className="truncate text-gray-700">{q.project_name || q.client_name || q.estimate_number}</span>
                            <span className={`shrink-0 ml-2 font-bold ${q.expired ? "text-red-600" : q.days_to_expiry <= 7 ? "text-amber-600" : "text-blue-600"}`}>
                              {q.expired ? `Expired ${Math.abs(q.days_to_expiry)}d` : `${q.days_to_expiry}d`} · ${Number(q.quote_total || 0).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {pipeline.estimate_funnel.request_conversion?.conversion_rate != null && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Request → quote (30d+)</div>
                    <div className="text-sm">
                      <span className="font-bold text-emerald-600">{pipeline.estimate_funnel.request_conversion.conversion_rate}%</span>
                      <span className="text-gray-500"> — {pipeline.estimate_funnel.request_conversion.converted}/{pipeline.estimate_funnel.request_conversion.total_requests_30d} requests quoted</span>
                    </div>
                  </div>
                )}
                {pipeline.estimate_funnel.markup_usage && Object.values(pipeline.estimate_funnel.markup_usage).some((c) => c > 0) && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Adjustment usage</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(pipeline.estimate_funnel.markup_usage).filter(([, count]) => count > 0).map(([bucket, count]) => (
                        <span key={bucket} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                          {bucket} <b>×{count}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(pipeline.estimate_funnel.lost_reasons) && pipeline.estimate_funnel.lost_reasons.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Lost / cancelled reasons</div>
                    <div className="flex flex-wrap gap-1.5">
                      {pipeline.estimate_funnel.lost_reasons.slice(0, 6).map((r) => (
                        <span key={r.reason} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">
                          {r.reason} <b>×{r.count}</b>{r.lost_value > 0 ? ` · $${Number(r.lost_value).toLocaleString()}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(pipeline.estimate_funnel.by_salesperson) && pipeline.estimate_funnel.by_salesperson.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">By salesperson</div>
                    <div className="space-y-1">
                      {pipeline.estimate_funnel.by_salesperson.slice(0, 6).map((s) => (
                        <div key={s.salesperson} className="flex items-center justify-between text-[11px] rounded border border-gray-100 px-2 py-1">
                          <span className="truncate text-gray-700">{s.salesperson}</span>
                          <span className="shrink-0 ml-2 text-gray-600">{s.count} est · avg <b className="text-gray-800">${Number(s.avg_quote_value || 0).toLocaleString()}</b>{s.won_count > 0 ? <span className="text-emerald-600"> · {s.won_count} won</span> : ""}{s.win_rate != null ? <span className="text-emerald-700 font-bold"> {s.win_rate}%</span> : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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