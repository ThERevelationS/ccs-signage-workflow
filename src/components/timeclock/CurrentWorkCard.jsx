import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, Clock3, Loader2, Search, Square, Wrench } from "lucide-react";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { fetchAllWorkOrders } from "@/lib/workOrderCache";

const WorkOrder = base44.entities.WorkOrder;

const ACTIVITY_OPTIONS = [
  ["fabrication", "Fabrication"], ["cnc", "CNC"], ["laser", "Laser"], ["paint", "Paint"],
  ["welding", "Welding"], ["electrical", "Electrical"], ["installation", "Installation"],
  ["service", "Service"], ["survey", "Survey"], ["design", "Design"], ["permitting", "Permitting"],
  ["estimating", "Estimating"], ["admin", "Admin"], ["shop", "Shop"], ["travel", "Travel"], ["other", "Other"],
];

const labelForActivity = (value) => ACTIVITY_OPTIONS.find(([key]) => key === value)?.[1] || value || "Work";

function formatMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}

export default function CurrentWorkCard({
  activeLabor = null,
  laborSummary = { count: 0, total_minutes: 0 },
  disabled = false,
  disabledReason = "",
  onStart,
  onChange,
  onStop,
}) {
  const [activityType, setActivityType] = useState(activeLabor?.activity_type || "shop");
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [recentJobs, setRecentJobs] = useState([]);
  const searchSeqRef = useRef(0);
  const { sessionToken } = useAuth();

  // Recent labor quick-pick: the employee's last distinct allocations.
  useEffect(() => {
    if (!sessionToken) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke("timeClockAction", { action: "my_labor_history", session_token: sessionToken, request_id: crypto.randomUUID() });
        const data = res?.data || res;
        if (!cancelled && data?.success === true && Array.isArray(data.recent)) setRecentJobs(data.recent);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [sessionToken]);

  useEffect(() => {
    if (!activeLabor?.id) return;
    setActivityType(activeLabor.activity_type || "shop");
    setSelectedWorkOrder(activeLabor.work_order_id ? {
      id: activeLabor.work_order_id,
      title: activeLabor.work_order_title,
      client_name: activeLabor.client_name,
    } : null);
  }, [activeLabor?.id, activeLabor?.activity_type, activeLabor?.work_order_id, activeLabor?.work_order_title, activeLabor?.client_name]);

  useEffect(() => {
    if (!activeLabor?.started_at) return undefined;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [activeLabor?.started_at]);

  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      const seq = ++searchSeqRef.current;
      setSearchBusy(true);
      try {
        const rows = await fetchAllWorkOrders().then((rows) =>
          (rows || [])
            .filter((wo) => wo.completed !== true && wo.deleted !== true)
            .sort((a, b) => (b.created_date || "").localeCompare(a.created_date || "")));
        if (seq !== searchSeqRef.current) return;
        const needle = searchTerm.trim().toLowerCase();
        setResults(rows.filter((wo) => [wo.title, wo.client_name, wo.description].filter(Boolean).join(" ").toLowerCase().includes(needle)).slice(0, 12));
      } catch (err) {
        if (seq !== searchSeqRef.current) return;
        console.error("Current Work WorkOrder search failed:", err);
        setError("WorkOrder search could not be loaded. You can still track an activity without a WorkOrder.");
      } finally {
        if (seq === searchSeqRef.current) setSearchBusy(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const elapsedMinutes = activeLabor?.started_at
    ? Math.max(0, Math.floor((now - new Date(activeLabor.started_at)) / 60000))
    : 0;

  const runAction = async (handler) => {
    if (!handler || actionBusy || disabled) return;
    setError("");
    setActionBusy(true);
    try {
      await handler({ activityType, workOrderId: selectedWorkOrder?.id || "" });
      setSearchTerm("");
      setResults([]);
    } catch (err) {
      setError(err?.message || "Current Work was not confirmed by the server.");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-blue-900"><Wrench className="w-4 h-4" />Current Work</div>
          <p className="text-xs text-blue-700 mt-1">Optional live job/activity tracking. Break, Work Pause, and Clock Out automatically end the active segment.</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-blue-700">Tracked this shift</div>
          <div className="font-semibold text-blue-900">{formatMinutes(Number(laborSummary?.total_minutes || 0) + elapsedMinutes)}</div>
        </div>
      </div>

      {activeLabor?.id && (
        <div className="rounded-lg border border-blue-200 bg-white p-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium text-gray-900">{labelForActivity(activeLabor.activity_type)}</div>
            <div className="text-xs text-gray-500">{activeLabor.work_order_id ? `${activeLabor.client_name || "WorkOrder"} — ${activeLabor.work_order_title || activeLabor.work_order_id}` : "No WorkOrder attached"}</div>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-blue-800"><Clock3 className="w-4 h-4" />{formatMinutes(elapsedMinutes)}</div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Activity</Label>
          <Select value={activityType} onValueChange={setActivityType} disabled={actionBusy || disabled}>
            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>{ACTIVITY_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
          {recentJobs.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {recentJobs.slice(0, 6).map((job, i) => (
                <button
                  key={i} type="button"
                  disabled={actionBusy || disabled}
                  onClick={() => {
                    setActivityType(job.activity_type || "shop");
                    setSelectedWorkOrder(job.work_order_id ? { id: job.work_order_id, title: job.work_order_title, client_name: job.client_name } : null);
                  }}
                  className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:border-blue-400 hover:bg-blue-50"
                  title={job.work_order_title || job.inhouse_task || "Recent allocation"}
                >
                  {job.work_order_title || job.inhouse_task || job.client_name || job.activity_type}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <Label className="text-xs">Optional WorkOrder</Label>
          {selectedWorkOrder ? (
            <div className="h-10 rounded-md border bg-white px-3 flex items-center justify-between gap-2">
              <div className="min-w-0 text-sm truncate">{selectedWorkOrder.client_name || selectedWorkOrder.title} — {selectedWorkOrder.title}</div>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSelectedWorkOrder(null)} disabled={actionBusy || disabled}>Clear</Button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search client or job..." className="pl-9 bg-white" disabled={actionBusy || disabled} />
              {searchBusy && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
            </div>
          )}
        </div>
      </div>

      {!selectedWorkOrder && results.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg border bg-white divide-y">
          {results.map((wo) => (
            <button key={wo.id} type="button" className="w-full text-left p-2 hover:bg-gray-50" onClick={() => { setSelectedWorkOrder(wo); setSearchTerm(""); setResults([]); }}>
              <div className="text-sm font-medium flex items-center gap-2"><Briefcase className="w-3.5 h-3.5 text-purple-600" />{wo.client_name || "Client"}</div>
              <div className="text-xs text-gray-500 truncate">{wo.title}</div>
            </button>
          ))}
        </div>
      )}

      {disabledReason && disabled && <div className="text-xs text-amber-700">{disabledReason}</div>}
      {error && <div className="text-xs text-red-700">{error}</div>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => runAction(activeLabor?.id ? onChange : onStart)} disabled={actionBusy || disabled} className="bg-blue-600 hover:bg-blue-700 gap-2">
          {actionBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
          {activeLabor?.id ? "Change Work" : "Start Work"}
        </Button>
        {activeLabor?.id && (
          <Button type="button" variant="outline" onClick={() => runAction(async () => onStop?.())} disabled={actionBusy || disabled} className="gap-2">
            <Square className="w-4 h-4" />Stop Work
          </Button>
        )}
      </div>
    </div>
  );
}