import React, { useState, useEffect } from "react";
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

const CellHistory = base44.entities.CellHistory;
const ActivityLog = base44.entities.ActivityLog;

export default function ActivityFeed() {
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState("all"); // all, WorkOrder, Order
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    loadActivities();
  }, [filterType, limit]);

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
        </div>
      </div>

      {/* Activity List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No activity found
        </div>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {activities.map((activity) => (
            <div 
              key={`${activity.type}-${activity.id}`} 
              className="bg-white border rounded-lg p-3 hover:shadow-sm transition-shadow"
            >
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}