import React, { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/EmailGate";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { 
  Loader2, 
  RefreshCw, 
  FileText, 
  ShoppingCart,
  User,
  Clock,
  Filter,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { staffEntities } from "@/components/staff/staffEntities";

const CellHistory = staffEntities.CellHistory;
const ActivityLog = staffEntities.ActivityLog;

export default function ActivityFeed() {
  const { currentUser } = useAuth();
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState("all"); // all, WorkOrder, Order
  const [actorFilter, setActorFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [liveTail, setLiveTail] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [savedViews, setSavedViews] = useState(() => {
    try { return JSON.parse(localStorage.getItem("activity_saved_views") || "[]"); } catch { return []; }
  });
  const saveCurrentView = () => {
    const name = (prompt("Name this view") || "").trim();
    if (!name) return;
    const view = { name, filterType, actorFilter, dateFrom, dateTo, mineOnly };
    const next = [...savedViews.filter(v => v.name !== name), view];
    setSavedViews(next);
    try { localStorage.setItem("activity_saved_views", JSON.stringify(next)); } catch { /* ignore */ }
  };
  const applySavedView = (name) => {
    const v = savedViews.find(x => x.name === name);
    if (!v) return;
    setFilterType(v.filterType || "all"); setActorFilter(v.actorFilter || "all");
    setDateFrom(v.dateFrom || ""); setDateTo(v.dateTo || ""); setMineOnly(!!v.mineOnly);
  };
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    loadActivities();
  }, [filterType, limit]);

  // Live-tail: poll the feed every 15s while enabled (monitoring a busy sync).
  useEffect(() => {
    if (!liveTail) return undefined;
    // Jittered cadence + hidden-tab skip — a fleet of open tabs polling in
    // lockstep spikes the entity read path; ~15–20s with visibility checks
    // keeps the feed live without the thundering herd.
    const jitteredTick = () => { if (!document.hidden) loadActivities(); };
    const id = setInterval(jitteredTick, 15000 + Math.floor(Math.random() * 5000));
    return () => clearInterval(id);
  }, [liveTail, filterType, limit]);

  const loadActivities = async () => {
    setIsLoading(true);
    try {
      // Load both CellHistory and ActivityLog
      const [cellHistoryData, activityLogData] = await Promise.all([
        filterType === "all" || filterType === "Order" || filterType === "WorkOrder"
          ? CellHistory.list("-created_date", limit * 2)
          : Promise.resolve([]),
        filterType === "all" || filterType === "WorkOrder"
          ? ActivityLog.list("-created_date", limit)
          : Promise.resolve([])
      ]);

      // Filter cell history by type if needed
      let filteredCellHistory = cellHistoryData;
      if (filterType !== "all") {
        filteredCellHistory = cellHistoryData.filter(h => h.entity_type === filterType);
      }

      // Combine and format activities
      const combinedActivities = [
        ...filteredCellHistory.map(h => ({
          id: h.id,
          type: "cell_change",
          entityType: h.entity_type,
          entityId: h.entity_id,
          field: h.field_name,
          oldValue: h.old_value,
          newValue: h.new_value,
          user: h.changed_by_name || h.changed_by_email || "Unknown",
          userEmail: h.changed_by_email,
          timestamp: h.created_date,
          description: `Changed ${formatFieldName(h.field_name)}`
        })),
        ...activityLogData.map(a => ({
          id: a.id,
          type: "activity",
          entityType: "WorkOrder",
          entityId: a.work_order_id,
          entityTitle: a.work_order_title,
          actionType: a.action_type,
          oldValue: a.previous_value,
          newValue: a.new_value,
          user: a.performed_by_name || a.performed_by_email || "Unknown",
          userEmail: a.performed_by_email,
          timestamp: a.created_date,
          description: a.action_details
        }))
      ];

      // Sort by timestamp descending
      combinedActivities.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );

      // Limit results
      setActivities(combinedActivities.slice(0, limit));
    } catch (error) {
      console.error("Error loading activities:", error);
    }
    setIsLoading(false);
  };

  const formatFieldName = (field) => {
    if (!field) return "";
    return field
      .replace(/_/g, " ")
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatValue = (value) => {
    if (value === null || value === undefined || value === "") return "(empty)";
    if (value.length > 50) return value.substring(0, 50) + "...";
    return value;
  };

  const getEntityIcon = (entityType) => {
    if (entityType === "Order") {
      return <ShoppingCart className="w-4 h-4 text-orange-500" />;
    }
    return <FileText className="w-4 h-4 text-blue-500" />;
  };

  const getActionColor = (actionType) => {
    if (!actionType) return "bg-gray-100";
    if (actionType.includes("created")) return "bg-green-100 text-green-800";
    if (actionType.includes("deleted")) return "bg-red-100 text-red-800";
    if (actionType.includes("completed")) return "bg-purple-100 text-purple-800";
    if (actionType.includes("stage")) return "bg-blue-100 text-blue-800";
    return "bg-gray-100 text-gray-800";
  };

  const oldestActivity = visibleActivities.length
    ? visibleActivities.reduce((min, a) => {
        const t = a.timestamp ? new Date(a.timestamp).getTime() : Infinity;
        return t < min ? t : min;
      }, Infinity)
    : null;

  const displayActivities = (() => {
    const out = [];
    let run = [];
    const flush = () => {
      if (run.length >= 3) {
        const fields = [...new Set(run.map(x => x.field || x.description || "?"))];
        out.push({ group: true, user: run[0].user, entityTitle: run[0].entityTitle, entityId: run[0].entityId,
          entityType: run[0].entityType, timestamp: run[0].timestamp, count: run.length, fields });
      } else out.push(...run);
      run = [];
    };
    for (const a of visibleActivities) {
      const key = a.type === "cell_change" ? `${a.user}|${a.entityType}|${a.entityId}` : null;
      if (key && run.length && `${run[0].user}|${run[0].entityType}|${run[0].entityId}` === key) { run.push(a); continue; }
      flush();
      if (key) run = [a]; else { out.push(a); }
    }
    flush();
    return out;
  })();

  const actorCounts = visibleActivities.reduce((acc, a) => {
    const key = a.user || "Unknown"; acc[key] = (acc[key] || 0) + 1; return acc;
  }, {});
  const burstActors = new Set(Object.entries(actorCounts).filter(([, n]) => n >= 20).map(([k]) => k));

  const exportActivitiesCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Time", "Actor", "Type", "Entity", "Field/Action", "Old Value", "New Value"],
      ...visibleActivities.map((a) => [
        a.timestamp ? new Date(a.timestamp).toLocaleString() : "",
        a.user || "", a.entityType || a.type || "",
        a.entityTitle || a.entityId || "",
        a.field || a.actionType || a.description || "",
        a.oldValue ?? "", a.newValue ?? "",
      ]),
    ].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "activity.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const visibleActivities = activities.filter((a) => {
    if (actorFilter !== "all" && a.user !== actorFilter) return false;
    if (mineOnly && currentUser?.email && a.userEmail !== currentUser.email) return false;
    const t = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    if (dateFrom && t < new Date(dateFrom + "T00:00:00").getTime()) return false;
    if (dateTo && t > new Date(dateTo + "T23:59:59").getTime()) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header and Filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-800">Activity Feed</h2>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activity</SelectItem>
                <SelectItem value="WorkOrder">Sales Pipeline</SelectItem>
                <SelectItem value="Order">Order Forms</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Select value={actorFilter} onValueChange={setActorFilter}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All people" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All people</SelectItem>
              {[...new Set(activities.map(a => a.user).filter(Boolean))].sort().map(u => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-xs" aria-label="From date" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-xs" aria-label="To date" />
          {savedViews.length > 0 && (
            <Select value="" onValueChange={applySavedView}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Saved views" /></SelectTrigger>
              <SelectContent>{savedViews.map(v => <SelectItem key={v.name} value={v.name}>{v.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <button type="button" onClick={saveCurrentView} title="Save current filters"
            className="h-9 rounded-md border border-input px-3 text-xs font-medium hover:bg-gray-50">
            Save view
          </button>
          <button type="button" onClick={exportActivitiesCsv} disabled={visibleActivities.length === 0}
            className="h-9 rounded-md border border-input px-3 text-xs font-medium hover:bg-gray-50 disabled:opacity-40">
            Export CSV
          </button>

          <Select value={String(limit)} onValueChange={(v) => setLimit(parseInt(v))}>
            <SelectTrigger className="w-28 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">Last 25</SelectItem>
              <SelectItem value="50">Last 50</SelectItem>
              <SelectItem value="100">Last 100</SelectItem>
              <SelectItem value="200">Last 200</SelectItem>
            </SelectContent>
          </Select>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadActivities}
            disabled={isLoading}
            className="h-9"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <button type="button" onClick={() => setLiveTail(v => !v)} title="Auto-refresh every 15 seconds"
            className={`h-9 rounded-md border px-3 text-xs font-medium ${liveTail ? "border-green-500 bg-green-50 text-green-700" : "border-input hover:bg-gray-50"}`}>
            {liveTail ? "Live on" : "Live"}
          </button>
          <button type="button" onClick={() => setMineOnly(v => !v)} title="Show only my actions"
            className={`h-9 rounded-md border px-3 text-xs font-medium ${mineOnly ? "border-purple-500 bg-purple-50 text-purple-700" : "border-input hover:bg-gray-50"}`}>
            {mineOnly ? "Mine ✓" : "Mine"}
          </button>
        </div>
      </div>

      {/* Activity List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
      {oldestActivity && Number.isFinite(oldestActivity) && (
        <p className="text-[11px] text-gray-400 mb-2">Showing activity back to {new Date(oldestActivity).toLocaleString()} · {visibleActivities.length} items</p>
      )}
      {visibleActivities.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No activity found
          {(actorFilter !== "all" || dateFrom || dateTo || mineOnly || filterType !== "all") && (
            <p className="mt-2 text-xs text-gray-400">Try clearing the filters — some are active.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {displayActivities.map((activity) => (
            <div 
              key={activity.group ? `group-${activity.user}-${activity.entityId}` : `${activity.type}-${activity.id}`} 
              className="bg-white border rounded-lg p-3 hover:shadow-sm transition-shadow"
            >
              {activity.group ? (
                <div className="flex items-start gap-3">
                  <div className="mt-1">{getEntityIcon(activity.entityType)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-800">{activity.user}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{activity.count} changes</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{activity.entityTitle || activity.entityId} — fields: {activity.fields.join(", ")}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{activity.timestamp ? new Date(activity.timestamp).toLocaleString() : ""}</p>
                  </div>
                </div>
              ) : (
              <div className="flex items-start gap-3">
                {/* Entity Icon */}
                <div className="mt-1">
                  {getEntityIcon(activity.entityType)}
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-800">
                      {activity.user}
                    </span>
                    {burstActors.has(activity.user) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300"
                        title="Unusually high activity in this window">burst</span>
                    )}
                    <span className="text-gray-400">•</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getActionColor(activity.actionType)}`}>
                      {activity.entityType === "Order" ? "Order" : "Sales"}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-700 mt-1">
                    {activity.description}
                  </p>
                  
                  {/* Value changes */}
                  {(activity.oldValue || activity.newValue) && (
                    <div className="mt-2 text-xs bg-gray-50 rounded p-2">
                      {activity.oldValue && (
                        <div className="text-red-600">
                          <span className="text-gray-500">From:</span> {formatValue(activity.oldValue)}
                        </div>
                      )}
                      {activity.newValue && (
                        <div className="text-green-600">
                          <span className="text-gray-500">To:</span> {formatValue(activity.newValue)}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Entity reference */}
                  {activity.entityTitle && (
                    <p className="text-xs text-gray-500 mt-1">
                      Project: {activity.entityTitle}
                    </p>
                  )}
                </div>
                
                {/* Timestamp */}
                <div className="text-xs text-gray-400 whitespace-nowrap flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(activity.timestamp), "M/d/yy h:mm a")}
                </div>
              </div>
              )}
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}