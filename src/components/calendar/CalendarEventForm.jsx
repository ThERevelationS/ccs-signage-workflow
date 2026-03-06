import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";

const EVENT_TYPES = [
  { value: "company", label: "Company Event", color: "#7C3AED" },
  { value: "install", label: "Installation", color: "#059669" },
  { value: "survey", label: "Site Survey", color: "#D97706" },
  { value: "meeting", label: "Meeting", color: "#2563EB" },
  { value: "deadline", label: "Deadline", color: "#DC2626" },
  { value: "holiday", label: "Holiday", color: "#0891B2" },
  { value: "personal", label: "Personal", color: "#9333EA" },
  { value: "other", label: "Other", color: "#6B7280" },
];

const COLOR_PRESETS = [
  "#7C3AED", "#2563EB", "#059669", "#D97706", "#DC2626",
  "#0891B2", "#9333EA", "#DB2777", "#16A34A", "#EA580C"
];

const toLocalDatetimeString = (isoStr) => {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function CalendarEventForm({ isOpen, onClose, onSaved, event, defaultDate }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    start_datetime: "",
    end_datetime: "",
    all_day: false,
    event_type: "company",
    color: "#7C3AED",
    location: "",
    is_universal: true,
    recurrence: "none",
    status: "confirmed",
    assigned_to: []
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    base44.entities.AuthorizedEmail.list().then(setAllUsers).catch(() => {});
  }, []);

  useEffect(() => {
    if (event) {
      setForm({
        ...event,
        start_datetime: toLocalDatetimeString(event.start_datetime),
        end_datetime: toLocalDatetimeString(event.end_datetime),
      });
    } else {
      const defaultStart = defaultDate
        ? `${format(defaultDate, "yyyy-MM-dd")}T09:00`
        : "";
      const defaultEnd = defaultDate
        ? `${format(defaultDate, "yyyy-MM-dd")}T10:00`
        : "";
      setForm({
        title: "",
        description: "",
        start_datetime: defaultStart,
        end_datetime: defaultEnd,
        all_day: false,
        event_type: "company",
        color: "#7C3AED",
        location: "",
        is_universal: true,
        recurrence: "none",
        status: "confirmed",
        assigned_to: []
      });
    }
  }, [event, defaultDate, isOpen]);

  const handleTypeChange = (type) => {
    const preset = EVENT_TYPES.find(e => e.value === type);
    setForm(f => ({ ...f, event_type: type, color: preset?.color || f.color }));
  };

  const handleSave = async () => {
    if (!form.title || !form.start_datetime) return;
    setIsSaving(true);
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
    setIsSaving(false);
    onSaved?.();
    onClose();
  };

  const handleDelete = async () => {
    if (!event?.id) return;
    setIsDeleting(true);
    await base44.entities.CalendarEvent.delete(event.id);
    setIsDeleting(false);
    onSaved?.();
    onClose();
  };

  const toggleUser = (email) => {
    const list = form.assigned_to || [];
    setForm(f => ({
      ...f,
      assigned_to: list.includes(email) ? list.filter(e => e !== email) : [...list, email]
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {event ? "Edit Event" : "New Event"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Title */}
          <div>
            <Label className="text-sm font-medium">Title *</Label>
            <Input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Event title"
              className="mt-1"
            />
          </div>

          {/* Type & Color row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium">Type</Label>
              <Select value={form.event_type} onValueChange={handleTypeChange}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                        {t.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Color</Label>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ background: c, borderColor: form.color === c ? "#1F2937" : "transparent" }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* All Day toggle */}
          <div className="flex items-center gap-3">
            <Switch
              checked={form.all_day}
              onCheckedChange={v => setForm(f => ({ ...f, all_day: v }))}
            />
            <Label className="text-sm">All Day Event</Label>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium">Start {form.all_day ? "Date" : "Date & Time"}</Label>
              <Input
                type={form.all_day ? "date" : "datetime-local"}
                value={form.all_day ? form.start_datetime?.split("T")[0] : form.start_datetime}
                onChange={e => setForm(f => ({ ...f, start_datetime: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">End {form.all_day ? "Date" : "Date & Time"}</Label>
              <Input
                type={form.all_day ? "date" : "datetime-local"}
                value={form.all_day ? form.end_datetime?.split("T")[0] : form.end_datetime}
                onChange={e => setForm(f => ({ ...f, end_datetime: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <Label className="text-sm font-medium">Location</Label>
            <Input
              value={form.location || ""}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="Address or meeting link"
              className="mt-1"
            />
          </div>

          {/* Description */}
          <div>
            <Label className="text-sm font-medium">Notes</Label>
            <Textarea
              value={form.description || ""}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Additional details..."
              className="mt-1 min-h-16"
            />
          </div>

          {/* Recurrence */}
          <div>
            <Label className="text-sm font-medium">Repeat</Label>
            <Select value={form.recurrence} onValueChange={v => setForm(f => ({ ...f, recurrence: v }))}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Does not repeat</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Assign to */}
          {allUsers.length > 0 && (
            <div>
              <Label className="text-sm font-medium">Assign To</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {allUsers.map(u => {
                  const selected = (form.assigned_to || []).includes(u.email);
                  return (
                    <button
                      key={u.email}
                      onClick={() => toggleUser(u.email)}
                      className="px-2 py-1 rounded-full text-xs border transition-all"
                      style={{
                        background: selected ? form.color : "white",
                        color: selected ? "white" : "#374151",
                        borderColor: selected ? form.color : "#D1D5DB"
                      }}
                    >
                      {u.full_name || u.email}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Universal toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-purple-200 bg-purple-50">
            <div>
              <p className="text-sm font-medium text-purple-800">Universal (Company-Wide)</p>
              <p className="text-xs text-purple-600">Visible to all team members</p>
            </div>
            <Switch
              checked={form.is_universal}
              onCheckedChange={v => setForm(f => ({ ...f, is_universal: v }))}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-2 border-t">
            {event?.id ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span className="ml-1">Delete</span>
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !form.title}
                className="clay-button border-none"
                style={{ background: "linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)" }}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {event ? "Update" : "Create"} Event
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}