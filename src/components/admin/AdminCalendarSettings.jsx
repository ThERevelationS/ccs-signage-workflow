import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Calendar, Link, Unlink, RefreshCw, Trash2, Plus, Settings,
  CheckCircle2, AlertCircle, Loader2, Globe
} from "lucide-react";
import { format } from "date-fns";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/shared/globalSettingsPersistence";
import {
  calendarEventFieldsFromForm,
  createCalendarEventWithRecovery,
  deleteCalendarEventIfUnchanged,
  updateCalendarEventIfUnchanged,
} from "@/components/calendar/calendarEventPersistence";
import { getStoredAdminSettingsCapability } from "@/components/auth/EmailGate";

export default function AdminCalendarSettings() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [globalSettings, setGlobalSettings] = useState(null);
  const [settingsError, setSettingsError] = useState("");
  const [eventError, setEventError] = useState("");
  const [stats, setStats] = useState({ total: 0, universal: 0, synced: 0 });
  const [hiddenTypes, setHiddenTypes] = useState(new Set());
  const [workOrders, setWorkOrders] = useState([]);

  // Connection status (future OAuth)
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [evs, savedSettings, wos] = await Promise.all([
        base44.entities.CalendarEvent.list("-start_datetime", 200),
        loadSingleGlobalSetting({
          entity: base44.entities.GlobalSettings,
          settingKey: "calendarSettings",
          label: "Calendar settings",
        }),
        base44.entities.WorkOrder.list("-created_date", 150).catch(() => []),
      ]);
      setEvents(evs || []);
      setWorkOrders((wos || []).filter((w) => !w.deleted));
      setGlobalSettings(savedSettings);
      const sv = savedSettings?.setting_value || {};
      setOutlookConnected(sv.outlook_connected || false);
      setGoogleConnected(sv.google_connected || false);

      const total = evs?.length || 0;
      const universal = evs?.filter(e => e.is_universal).length || 0;
      const synced = evs?.filter(e => e.external_source !== "manual").length || 0;
      setStats({ total, universal, synced });
    } catch (error) {
      console.error("Error loading calendar settings:", error);
      setSettingsError(error?.message || "Calendar settings could not be loaded safely.");
    } finally {
      setLoading(false);
    }
  };

  const saveGlobalSettings = async (updates) => {
    setSettingsError("");
    const current = globalSettings?.setting_value || {};
    const newVal = { ...current, ...updates };
    try {
      const saved = await saveGlobalSettingValueIfUnchanged({
        entity: base44.entities.GlobalSettings,
        loadedRecord: globalSettings,
        settingKey: "calendarSettings",
        nextValue: newVal,
        label: "Calendar settings",
      });
      setGlobalSettings(saved);
      const savedValue = saved?.setting_value || newVal;
      setOutlookConnected(savedValue.outlook_connected || false);
      setGoogleConnected(savedValue.google_connected || false);
      return saved;
    } catch (error) {
      console.error("Calendar settings save blocked:", error);
      setSettingsError(error?.message || "Calendar settings changed in another session. Reload before saving.");
      await loadData();
      return null;
    }
  };

  const handleDeleteEvent = async (event) => {
    if (!event?.id) return;
    setEventError("");
    // Current stored authorization, not a mount-time snapshot: an expired
    // capability must fail before dispatch rather than reach the server.
    const writeCapability = getStoredAdminSettingsCapability();
    try {
      await deleteCalendarEventIfUnchanged({
        event,
        adminCapability: writeCapability,
        label: `Calendar event ${event.title || event.id} deletion`,
      });
      await loadData();
    } catch (error) {
      console.error("Calendar event deletion blocked:", error);
      setEventError(error?.message || "This calendar event changed in another session and was not deleted.");
      await loadData();
    }
  };

  const upcomingEvents = events
    .filter(e => new Date(e.start_datetime) >= new Date())
    .filter(e => !hiddenTypes.has(e.event_type || "other"))
    .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))
    .slice(0, 20);

  const pastEvents = events
    .filter(e => new Date(e.start_datetime) < new Date())
    .filter(e => !hiddenTypes.has(e.event_type || "other"))
    .sort((a, b) => new Date(b.start_datetime) - new Date(a.start_datetime))
    .slice(0, 10);

  const unscheduledWork = (() => {
    const scheduledIds = new Set(events.map((e) => e.work_order_id).filter(Boolean));
    return workOrders.filter((w) => w.id && !scheduledIds.has(w.id)).slice(0, 8);
  })();

  const printWeekRows = (() => {
    const end = new Date(Date.now() + 7 * 86400000);
    return events
      .filter((e) => { const d = new Date(e.start_datetime || 0); return d >= new Date() && d <= end; })
      .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
  })();

  const crewCapacity = (() => {
    const weekEnd = new Date(Date.now() + 7 * 86400000);
    const byPerson = {};
    for (const e of events) {
      const start = new Date(e.start_datetime || 0);
      if (!(start >= new Date() && start <= weekEnd)) continue;
      for (const email of Array.isArray(e.assigned_to) ? e.assigned_to : []) {
        if (!email) continue;
        byPerson[email] = (byPerson[email] || 0) + 1;
      }
    }
    return Object.entries(byPerson).map(([email, count]) => ({ email, count })).sort((a, b) => b.count - a.count);
  })();

  const bookingConflicts = (() => {
    const byPerson = {};
    for (const e of events) {
      for (const email of Array.isArray(e.assigned_to) ? e.assigned_to : []) {
        if (!email) continue;
        (byPerson[email] = byPerson[email] || []).push(e);
      }
    }
    const pairs = [];
    for (const [email, list] of Object.entries(byPerson)) {
      const buf = (e) => Math.max(0, Number(e.travel_buffer_minutes) || 0) * 60000;
      const sorted = list
        .filter(e => e.start_datetime && e.end_datetime)
        .map(e => ({ e, busyStart: new Date(e.start_datetime).getTime() - buf(e), busyEnd: new Date(e.end_datetime).getTime() + buf(e) }))
        .sort((a, b) => a.busyStart - b.busyStart);
      for (let i = 0; i < sorted.length && pairs.length < 20; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i], b = sorted[j];
          if (b.busyStart >= a.busyEnd) break;
          if (b.busyStart < a.busyEnd && b.busyEnd > a.busyStart) {
            pairs.push({ email, a: a.e, b: b.e });
          }
        }
      }
    }
    return pairs;
  })();

  const EVENT_TYPE_COLORS = {
    company: "#7C3AED", install: "#059669", survey: "#D97706",
    meeting: "#2563EB", deadline: "#DC2626", holiday: "#0891B2",
    personal: "#9333EA", other: "#6B7280"
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Calendar Settings</h2>
          <p className="text-sm text-gray-500">Manage the company universal calendar and external integrations</p>
        </div>
        <Button
          onClick={() => { setEditingEvent(null); setShowEventForm(true); }}
          className="clay-button border-none gap-2"
          style={{ background: "linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)" }}
        >
          <Plus className="w-4 h-4" />
          New Event
        </Button>
      </div>

      {settingsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">Calendar settings update blocked</div>
            <div className="mt-1 text-xs">{settingsError}</div>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0 border-red-300 bg-white text-red-800" onClick={async () => { setSettingsError(""); await loadData(); }}>Reload latest</Button>
        </div>
      )}

      {eventError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">Calendar event update blocked</div>
            <div className="mt-1 text-xs">{eventError}</div>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0 border-red-300 bg-white text-red-800" onClick={async () => { setEventError(""); await loadData(); }}>Reload latest</Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Events", value: stats.total, icon: Calendar, color: "purple" },
          { label: "Company-Wide", value: stats.universal, icon: Globe, color: "blue" },
          { label: "Synced External", value: stats.synced, icon: RefreshCw, color: "green" },
        ].map(s => (
          <div key={s.label} className="clay-card p-4">
            <div className="flex items-center gap-3">
              <s.icon className={`w-5 h-5 text-${s.color}-600`} />
              <div>
                <p className="text-2xl font-bold text-gray-800">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* External Calendar Connections */}
      <div className="clay-card p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Link className="w-4 h-4 text-purple-600" />
          External Calendar Connections
        </h3>
        <div className="space-y-3">
          {/* Outlook */}
          <div className="flex items-center justify-between p-4 rounded-xl border"
            style={{ borderColor: outlookConnected ? "#0078D4" : "#E5E7EB", background: outlookConnected ? "#EFF6FF" : "#F9FAFB" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                style={{ background: "#0078D4" }}>O</div>
              <div>
                <p className="font-medium text-gray-800">Microsoft Outlook Calendar</p>
                <p className="text-sm text-gray-500">
                  {outlookConnected ? "Connected — events syncing" : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {outlookConnected ? (
                <>
                  <Badge className="bg-green-100 text-green-700">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 gap-1"
                    onClick={() => { setOutlookConnected(false); saveGlobalSettings({ outlook_connected: false }); }}>
                    <Unlink className="w-3 h-3" />
                    Disconnect
                  </Button>
                </>
              ) : (
                <div className="text-right">
                  <Button size="sm" variant="outline" className="gap-1 opacity-50 cursor-not-allowed" disabled>
                    <Link className="w-3 h-3" />
                    Connect Outlook
                  </Button>
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Requires OAuth authorization
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Google Calendar */}
          <div className="flex items-center justify-between p-4 rounded-xl border"
            style={{ borderColor: googleConnected ? "#4285F4" : "#E5E7EB", background: googleConnected ? "#EFF6FF" : "#F9FAFB" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                style={{ background: "linear-gradient(135deg, #4285F4, #34A853)" }}>G</div>
              <div>
                <p className="font-medium text-gray-800">Google Calendar</p>
                <p className="text-sm text-gray-500">
                  {googleConnected ? "Connected — events syncing" : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {googleConnected ? (
                <>
                  <Badge className="bg-green-100 text-green-700">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 gap-1"
                    onClick={() => { setGoogleConnected(false); saveGlobalSettings({ google_connected: false }); }}>
                    <Unlink className="w-3 h-3" />
                    Disconnect
                  </Button>
                </>
              ) : (
                <div className="text-right">
                  <Button size="sm" variant="outline" className="gap-1 opacity-50 cursor-not-allowed" disabled>
                    <Link className="w-3 h-3" />
                    Connect Google
                  </Button>
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Requires OAuth authorization
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-700">
          <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
          To enable Outlook/Google Calendar sync, an admin needs to authorize the app connector under
          the platform's integration settings. Once authorized, events will sync automatically every 15 minutes.
        </div>
      </div>

      {bookingConflicts.length > 0 && (
        <div className="clay-card border-amber-300 bg-amber-50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <Calendar className="w-4 h-4" /> Scheduling conflicts — {bookingConflicts.length} overlapping assignment{bookingConflicts.length === 1 ? "" : "s"}
          </h3>
          <ul className="mt-2 space-y-1">
            {bookingConflicts.slice(0, 8).map((c, i) => (
              <li key={i} className="text-xs text-amber-800">
                {c.email}: “{c.a.title || "Event"}” and “{c.b.title || "Event"}” overlap ({String(c.a.start_datetime).slice(0, 10)})
              </li>
            ))}
            {bookingConflicts.length > 8 && <li className="text-xs text-amber-700">…and {bookingConflicts.length - 8} more</li>}
          </ul>
        </div>
      )}

      {unscheduledWork.length > 0 && (
        <div className="clay-card border-blue-200 bg-blue-50/60 p-4">
          <h3 className="text-sm font-semibold text-blue-900">Unscheduled work — {unscheduledWork.length}{workOrders.length > 8 ? "+" : ""} with no calendar event</h3>
          <ul className="mt-2 space-y-1">
            {unscheduledWork.map((w) => (
              <li key={w.id} className="flex items-center gap-2 text-xs text-blue-800">
                <a href={`/MainWorkflow?wo=${w.id}`} className="font-medium truncate underline hover:text-blue-900" title="Open this work order">{w.title || w.id}</a>
                {w.sales_status && <span className="text-blue-600/70">({w.sales_status})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="clay-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Print week view</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="text-xs">Print</Button>
        </div>
        <div id="admin-calendar-print-week" className="mt-2 hidden print:block">
          <table className="w-full text-xs">
            <thead><tr className="border-b text-left"><th>When</th><th>Event</th><th>Type</th><th>Assigned</th><th>Location</th></tr></thead>
            <tbody>
              {printWeekRows.map((e) => (
                <tr key={e.id} className="border-b border-gray-100">
                  <td className="py-1">{String(e.start_datetime).slice(0, 16).replace("T", " ")}</td>
                  <td className="py-1 font-medium">{e.title || "Event"}</td>
                  <td className="py-1">{e.event_type || ""}</td>
                  <td className="py-1">{(e.assigned_to || []).join(", ")}</td>
                  <td className="py-1">{e.location || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {printWeekRows.length === 0 && <p className="py-2 text-gray-500">No events in the next 7 days.</p>}
        </div>
        <p className="mt-1 text-xs text-gray-400 print:hidden">Prints the next 7 days as a plain table for the shop floor.</p>
        <style>{`@media print { body * { visibility: hidden; } #admin-calendar-print-week, #admin-calendar-print-week * { visibility: visible; } #admin-calendar-print-week { position: absolute; left: 0; top: 0; width: 100%; display: block !important; } }`}</style>
      </div>

      {crewCapacity.length > 0 && (
        <div className="clay-card p-4">
          <h3 className="text-sm font-semibold text-gray-800">Crew capacity — next 7 days</h3>
          <div className="mt-2 space-y-1">
            {crewCapacity.slice(0, 10).map((c) => (
              <div key={c.email} className="flex items-center gap-2 text-xs">
                <span className="w-40 truncate text-gray-700">{c.email}</span>
                <div className="h-2 rounded-full bg-purple-500" style={{ width: `${Math.min(160, c.count * 20)}px` }} />
                <span className={`font-medium ${c.count > 6 ? "text-red-600" : "text-gray-500"}`}>{c.count} event{c.count === 1 ? "" : "s"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium uppercase text-gray-400">Layers:</span>
        {Object.entries(EVENT_TYPE_COLORS).map(([type, color]) => {
          const off = hiddenTypes.has(type);
          return (
            <button key={type} type="button" aria-pressed={!off}
              onClick={() => setHiddenTypes((cur) => { const next = new Set(cur); if (next.has(type)) next.delete(type); else next.add(type); return next; })}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${off ? "border-gray-200 bg-gray-50 text-gray-400 line-through" : "border-gray-200 bg-white text-gray-700"}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />{type}
            </button>
          );
        })}
      </div>

      {/* Upcoming Events */}
      <div className="clay-card p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-purple-600" />
          Upcoming Company Events
        </h3>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-purple-600" /></div>
        ) : upcomingEvents.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No upcoming events</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map(ev => (
              <div key={ev.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors group">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: ev.color || EVENT_TYPE_COLORS[ev.event_type] || "#7C3AED" }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{ev.title}</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(ev.start_datetime), ev.all_day ? "MMM d, yyyy" : "MMM d, yyyy h:mm a")}
                    {ev.location && ` · ${ev.location}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {ev.is_universal && <Badge className="bg-purple-100 text-purple-700 text-xs"><Globe className="w-2.5 h-2.5 mr-0.5" />Universal</Badge>}
                  <Button variant="ghost" size="icon" className="w-7 h-7" aria-label={`Edit ${ev.title || "event"}`}
                    onClick={() => { setEditingEvent(ev); setShowEventForm(true); }}>
                    <Settings className="w-3.5 h-3.5 text-gray-500" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-7 h-7" aria-label={`Delete ${ev.title || "event"}`}
                    onClick={() => handleDeleteEvent(ev)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Event Form Dialog */}
      {showEventForm && (
        <AdminEventFormDialog
          event={editingEvent}
          isOpen={showEventForm}
          onClose={() => setShowEventForm(false)}
          onSaved={loadData}
        />
      )}
    </div>
  );
}

function AdminEventFormDialog({ event, isOpen, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: "", description: "", start_datetime: "", end_datetime: "",
    all_day: false, event_type: "company", color: "#7C3AED",
    location: "", is_universal: true, recurrence: "none", status: "confirmed"
  });
  const [saving, setSaving] = useState(false);
  const [persistenceError, setPersistenceError] = useState("");

  const toLocal = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  useEffect(() => {
    setPersistenceError("");
    if (event) {
      setForm({ ...event, start_datetime: toLocal(event.start_datetime), end_datetime: toLocal(event.end_datetime) });
    } else {
      setForm({
        title: "", description: "", start_datetime: "", end_datetime: "",
        all_day: false, event_type: "company", color: "#7C3AED",
        location: "", is_universal: true, recurrence: "none", status: "confirmed"
      });
    }
  }, [event, isOpen]);

  const handleSave = async () => {
    if (!form.title || !form.start_datetime || saving) return;
    setSaving(true);
    setPersistenceError("");
    const writeCapability = getStoredAdminSettingsCapability();
    try {
      const data = calendarEventFieldsFromForm({
        ...form,
        start_datetime: new Date(form.start_datetime).toISOString(),
        end_datetime: form.end_datetime ? new Date(form.end_datetime).toISOString() : new Date(form.start_datetime).toISOString(),
        external_source: "manual"
      });
      if (event?.id) {
        await updateCalendarEventIfUnchanged({
          event,
          nextFields: data,
          adminCapability: writeCapability,
          label: `Calendar event ${event.title || event.id}`,
        });
      } else {
        await createCalendarEventWithRecovery({
          data,
          adminCapability: writeCapability,
          label: `Calendar event ${data.title}`,
        });
      }
      if (onSaved) await onSaved();
      onClose();
    } catch (error) {
      console.error("Calendar event save blocked:", error);
      setPersistenceError(error?.message || "The calendar event could not be saved safely. Reload before retrying.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? "Edit Event" : "New Company Event"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {persistenceError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="font-medium">Calendar event save blocked</div>
              <div className="mt-1 text-xs">{persistenceError}</div>
            </div>
          )}
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start</Label>
              <Input type="datetime-local" value={form.start_datetime} onChange={e => setForm(f => ({ ...f, start_datetime: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>End</Label>
              <Input type="datetime-local" value={form.end_datetime} onChange={e => setForm(f => ({ ...f, end_datetime: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Location</Label>
            <Input value={form.location || ""} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label>Travel buffer (minutes)</Label>
            <Input type="number" min="0" max="240" value={form.travel_buffer_minutes ?? 0}
              onChange={e => setForm(f => ({ ...f, travel_buffer_minutes: Math.max(0, Number(e.target.value) || 0) }))} className="mt-1" />
            <p className="text-xs text-gray-400 mt-0.5">Counted as busy time before and after the event for conflict checks.</p>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.description || ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1" />
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl border border-purple-200 bg-purple-50">
            <div>
              <p className="text-sm font-medium text-purple-800">Show on Universal Calendar</p>
              <p className="text-xs text-purple-600">Visible to all team members</p>
            </div>
            <Switch checked={form.is_universal} onCheckedChange={v => setForm(f => ({ ...f, is_universal: v }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title}
              className="clay-button border-none" style={{ background: "linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {event ? "Update" : "Create"} Event
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}