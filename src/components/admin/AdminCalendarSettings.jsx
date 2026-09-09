import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Calendar, Link, Unlink, RefreshCw, Trash2, Plus, Settings,
  CheckCircle2, AlertCircle, Loader2, Globe, Users, Eye
} from "lucide-react";
import { format } from "date-fns";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/shared/globalSettingsPersistence";

export default function AdminCalendarSettings() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [globalSettings, setGlobalSettings] = useState(null);
  const [settingsError, setSettingsError] = useState("");
  const [stats, setStats] = useState({ total: 0, universal: 0, synced: 0 });

  // Connection status (future OAuth)
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [evs, savedSettings] = await Promise.all([
        base44.entities.CalendarEvent.list("-start_datetime", 200),
        loadSingleGlobalSetting({
          entity: base44.entities.GlobalSettings,
          settingKey: "calendarSettings",
          label: "Calendar settings",
        }),
      ]);
      setEvents(evs || []);
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

  const handleDeleteEvent = async (id) => {
    await base44.entities.CalendarEvent.delete(id);
    loadData();
  };

  const upcomingEvents = events
    .filter(e => new Date(e.start_datetime) >= new Date())
    .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))
    .slice(0, 20);

  const pastEvents = events
    .filter(e => new Date(e.start_datetime) < new Date())
    .sort((a, b) => new Date(b.start_datetime) - new Date(a.start_datetime))
    .slice(0, 10);

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
                  <Button variant="ghost" size="icon" className="w-7 h-7"
                    onClick={() => { setEditingEvent(ev); setShowEventForm(true); }}>
                    <Settings className="w-3.5 h-3.5 text-gray-500" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-7 h-7"
                    onClick={() => handleDeleteEvent(ev.id)}>
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

  const toLocal = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  useEffect(() => {
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
    setSaving(true);
    const data = {
      ...form,
      start_datetime: new Date(form.start_datetime).toISOString(),
      end_datetime: form.end_datetime ? new Date(form.end_datetime).toISOString() : new Date(form.start_datetime).toISOString(),
      external_source: "manual"
    };
    if (event?.id) {
      await base44.entities.CalendarEvent.update(event.id, data);
    } else {
      await base44.entities.CalendarEvent.create(data);
    }
    setSaving(false);
    onSaved?.();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? "Edit Event" : "New Company Event"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
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