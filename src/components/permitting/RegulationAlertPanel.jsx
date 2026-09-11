import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, Trash2, Loader2, RefreshCw, Bell } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/components/auth/EmailGate";

export default function RegulationAlertPanel() {
  const { sessionToken } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [filter, setFilter] = useState("unread"); // unread, all, critical, high

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const loadAlerts = async () => {
    try {
      const query = filter === "unread" ? { is_read: false } : filter === "critical" ? { severity: "critical" } : filter === "high" ? { severity: "high" } : {};
      const loaded = await base44.entities.RegulationAlert.filter(query, "-detected_at", 100);
      setAlerts(Array.isArray(loaded) ? loaded : []);
    } catch (e) {
      console.error("Load alerts error:", e);
    }
    setIsLoading(false);
  };

  const handleRunMonitoring = async () => {
    setIsMonitoring(true);
    try {
      const res = await base44.functions.invoke('monitorJurisdictionChanges', { session_token: sessionToken });
      if (res.data?.alerts_created > 0) {
        await loadAlerts();
      }
    } catch (e) {
      console.error("Monitoring error:", e);
    }
    setIsMonitoring(false);
  };

  const handleMarkAsRead = async (alertId) => {
    try {
      await base44.entities.RegulationAlert.update(alertId, {
        is_read: true,
        read_at: new Date().toISOString(),
        read_by: (await base44.auth.me()).email
      });
      await loadAlerts();
    } catch (e) {
      console.error("Mark read error:", e);
    }
  };

  const handleDelete = async (alertId) => {
    try {
      await base44.entities.RegulationAlert.delete(alertId);
      setAlerts(alerts.filter(a => a.id !== alertId));
    } catch (e) {
      console.error("Delete error:", e);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-300";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      default:
        return "bg-blue-100 text-blue-800 border-blue-300";
    }
  };

  const getSeverityIcon = (severity) => {
    if (severity === "critical" || severity === "high") {
      return <AlertCircle className="w-5 h-5" />;
    }
    return <Bell className="w-5 h-5" />;
  };

  const unreadCount = alerts.filter(a => !a.is_read).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="clay-card p-4 border-l-4 border-l-blue-400">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-lg text-gray-900">Regulation Alerts</h2>
            {unreadCount > 0 && (
              <Badge className="bg-red-500 text-white ml-2">{unreadCount} new</Badge>
            )}
          </div>
          <Button
            onClick={handleRunMonitoring}
            disabled={isMonitoring}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {isMonitoring ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Monitoring...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Run Monitor
              </>
            )}
          </Button>
        </div>
        <p className="text-sm text-gray-600">
          Track changes in permitting regulations across all jurisdictions. Alerts are sent automatically when significant changes are detected.
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: "unread", label: "Unread" },
          { id: "all", label: "All Alerts" },
          { id: "critical", label: "Critical" },
          { id: "high", label: "High Priority" }
        ].map(f => (
          <Button
            key={f.id}
            variant={filter === f.id ? "default" : "outline"}
            size="sm"
            onClick={() => { setFilter(f.id); loadAlerts(); }}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <div className="clay-card p-12 text-center text-gray-500">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <p className="font-medium">No alerts to display</p>
          <p className="text-xs">All regulation changes are up to date</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`clay-card p-4 border-l-4 transition-all ${alert.is_read ? "opacity-75" : "border-l-red-400"} ${getSeverityColor(alert.severity)} border`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  {getSeverityIcon(alert.severity)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{alert.title}</h3>
                      <p className="text-sm text-gray-700 mt-1">{alert.description}</p>
                    </div>
                    {!alert.is_read && (
                      <Badge className="bg-red-500 text-white text-xs flex-shrink-0">NEW</Badge>
                    )}
                  </div>

                  {/* Jurisdiction Badge */}
                  <div className="mt-2">
                    <Badge variant="outline" className="text-xs">
                      {alert.jurisdiction_name}, {alert.jurisdiction_state}
                    </Badge>
                  </div>

                  {/* Impact Summary */}
                  {alert.impact_summary && (
                    <div className="mt-3 p-2 bg-white/50 rounded text-sm text-gray-700 border border-gray-200">
                      <p className="font-medium text-gray-800 text-xs mb-1">Potential Impact:</p>
                      <p>{alert.impact_summary}</p>
                    </div>
                  )}

                  {/* Change Details */}
                  {alert.previous_value && alert.new_value && (
                    <div className="mt-2 text-xs space-y-1 font-mono bg-white/50 p-2 rounded">
                      <div className="text-red-700">- {alert.previous_value}</div>
                      <div className="text-green-700">+ {alert.new_value}</div>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(alert.detected_at), "MMM dd, yyyy h:mm a")}
                    </div>
                    {alert.notification_sent && (
                      <div className="text-blue-600">
                        ✓ Notification sent
                      </div>
                    )}
                    {alert.is_read && (
                      <div className="text-green-600">
                        Read {format(new Date(alert.read_at), "MMM dd, h:mm a")}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  {!alert.is_read && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleMarkAsRead(alert.id)}
                      title="Mark as read"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(alert.id)}
                    title="Delete alert"
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}