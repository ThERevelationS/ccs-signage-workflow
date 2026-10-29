import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Megaphone, Save, Send, Trash2, Volume2, ImageIcon, Users, Monitor,
  Plus, X, RefreshCw, Loader2, ChevronDown, ChevronUp, Music,
  Repeat2, Eye, Info, AlertTriangle, Zap, CalendarClock, Sparkles
} from "lucide-react";
import { playSoundEffect } from "./AnnouncementContext";
import {
  createAnnouncementWithRecovery,
  deleteAnnouncementIfUnchanged,
  publishAnnouncementSafely,
  stopAnnouncementIfUnchanged,
  updateAnnouncementIfUnchanged,
} from "./announcementPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { staffEntities } from "@/components/staff/staffEntities";

const UploadFile = (params) => base44.integrations.Core.UploadFile(params);
const Announcement = base44.entities.Announcement;
const AuthorizedEmail = staffEntities.AuthorizedEmail;

const ALL_PAGES = [
  "MyWorkflow", "MainWorkflow", "SalesPipeline", "Estimating", "Permitting",
  "Design", "Production", "Fabrication", "InstallationDeliver", "OrderForm",
  "SIPs", "SOP", "MondayMorningMeeting", "Financials",
  "WorkOrderCalendar", "TimeClock", "customerportal"
];

const STOCK_SOUNDS = [
  { value: "none",    label: "No Sound" },
  { value: "chime",   label: "Chime (3 tones)" },
  { value: "bell",    label: "Bell" },
  { value: "alert",   label: "Alert Beeps" },
  { value: "fanfare", label: "Fanfare" },
  { value: "ding",    label: "Ding" },
  { value: "custom",  label: "Custom Upload" },
];

const PRIORITY_OPTIONS = [
  { value: "low",    label: "Low",    color: "#BAE6FD" },
  { value: "normal", label: "Normal", color: "#FDE68A" },
  { value: "high",   label: "High",   color: "#FDBA74" },
  { value: "urgent", label: "Urgent", color: "#FCA5A5" },
];

const PAGE_GROUPS = [
  { label: "All pages", all: true },
  { label: "Kiosk", pages: ["TimeClock", "customerportal"] },
  { label: "Workflow", pages: ["MyWorkflow", "MainWorkflow", "WorkOrderCalendar", "MondayMorningMeeting"] },
  { label: "Sales", pages: ["SalesPipeline", "Estimating", "OrderForm", "Permitting"] },
  { label: "Admin", pages: ["Financials", "SIPs", "SOP", "Design", "Production", "Fabrication", "InstallationDeliver"] },
];

const ANNOUNCEMENT_TEMPLATES = [
  { label: "Meeting in 5", fields: { title: "Meeting in 5 minutes", message: "Please gather in the main area — meeting starts in 5 minutes.", priority: "normal", sound_type: "chime", duration_seconds: 20, expires_choice: "30m", display_mode: "repeat", repeat_interval_minutes: 5 } },
  { label: "Lunch break", fields: { title: "Lunch break", message: "Lunch starts now. See you back in 30!", priority: "low", sound_type: "ding", duration_seconds: 15, expires_choice: "1h", display_mode: "once" } },
  { label: "Safety reminder", fields: { title: "Safety reminder", message: "Reminder: wear your PPE and keep work areas clear.", priority: "high", sound_type: "alert", duration_seconds: 0, requires_ack: true, expires_choice: "4h", display_mode: "once" } },
  { label: "Shop closed", fields: { title: "Shop closed", message: "The shop is closed today. See you next shift.", priority: "urgent", sound_type: "fanfare", duration_seconds: 0, expires_choice: "eod", display_mode: "once" } },
  { label: "Birthday", fields: { title: "Happy Birthday!", message: "Join us in wishing a happy birthday today!", priority: "low", sound_type: "fanfare", duration_seconds: 15, expires_choice: "eod", display_mode: "once" } },
];

const PREVIEW_STYLES = {
  low:    { gradient: "linear-gradient(135deg, #E0F2FE, #BAE6FD)", iconBg: "linear-gradient(135deg, #0EA5E9, #0284C7)", text: "#0C4A6E", sub: "#075985", accent: "#38BDF8", Icon: Info },
  normal: { gradient: "linear-gradient(135deg, #FFF7ED, #FDE68A)", iconBg: "linear-gradient(135deg, #F59E0B, #D97706)", text: "#78350F", sub: "#92400E", accent: "#FBBF24", Icon: Megaphone },
  high:   { gradient: "linear-gradient(135deg, #FFF7ED, #FDBA74)", iconBg: "linear-gradient(135deg, #F97316, #EA580C)", text: "#7C2D12", sub: "#9A3412", accent: "#FB923C", Icon: AlertTriangle },
  urgent: { gradient: "linear-gradient(135deg, #FEF2F2, #FCA5A5)", iconBg: "linear-gradient(135deg, #EF4444, #DC2626)", text: "#7F1D1D", sub: "#991B1B", accent: "#F87171", Icon: Zap },
};

function toLocalInput(iso) {
  const ms = Date.parse(iso || "");
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

function expiresAtFor(f) {
  const now = Date.now();
  switch (f?.expires_choice) {
    case "15m": return new Date(now + 15 * 60000).toISOString();
    case "30m": return new Date(now + 30 * 60000).toISOString();
    case "1h":  return new Date(now + 3600000).toISOString();
    case "4h":  return new Date(now + 4 * 3600000).toISOString();
    case "eod": { const d = new Date(); d.setHours(23, 59, 59, 0); return d.toISOString(); }
    case "custom": return fromLocalInput(f.expires_custom);
    default: return "";
  }
}

function announcementStatus(ann) {
  const now = Date.now();
  const sched = Date.parse(ann?.scheduled_for || "");
  const exp = Date.parse(ann?.expires_at || "");
  if (ann?.is_active === true) {
    if (Number.isFinite(sched) && sched > now) return "Scheduled";
    if (Number.isFinite(exp) && exp <= now) return "Expired";
    return "Live";
  }
  if (ann?.sent_at) return Number.isFinite(exp) && exp <= now ? "Expired" : "Stopped";
  return "Draft";
}

const STATUS_BADGE = {
  Live: "bg-green-100 text-green-700",
  Scheduled: "bg-blue-100 text-blue-700",
  Expired: "bg-gray-100 text-gray-500",
  Stopped: "bg-amber-100 text-amber-700",
  Draft: "bg-slate-100 text-slate-500",
};

const defaultForm = {
  name: "",
  title: "",
  message: "",
  image_url: "",
  sound_type: "chime",
  custom_sound_url: "",
  display_pages: [],
  target_users: [],
  duration_seconds: 10,
  priority: "normal",
  expires_choice: "",
  expires_custom: "",
  scheduled_at: "",
  display_mode: "once",
  repeat_interval_minutes: 30,
  requires_ack: false,
};

export default function AnnouncementManager({ isOpen, onClose, sessionToken }) {
  const [savedAnnouncements, setSavedAnnouncements] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingSound, setUploadingSound] = useState(false);
  const [showSavedList, setShowSavedList] = useState(false);
  const [activeAnnId, setActiveAnnId] = useState(null);
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  const [persistenceError, setPersistenceError] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [anns, activeRows, users] = await Promise.all([
        loadAllEntityRows({ entity: Announcement, sort: "-updated_date", label: "Announcement history" }),
        loadAllEntityRows({ entity: Announcement, query: { is_active: true }, sort: null, label: "Active announcements" }),
        loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "Announcement target users" })
      ]);
      setSavedAnnouncements(anns);
      setAllUsers(users);
      const sortedActive = [...activeRows].sort((a, b) => {
        const aTime = Date.parse(a.updated_date || a.sent_at || "") || 0;
        const bTime = Date.parse(b.updated_date || b.sent_at || "") || 0;
        if (aTime !== bTime) return bTime - aTime;
        return String(b.id || "").localeCompare(String(a.id || ""));
      });
      const active = sortedActive[0] || null;
      setActiveAnnouncement(active);
      setActiveAnnId(active?.id || null);
      if (sortedActive.length > 1) {
        setPersistenceError(`Multiple live announcements were found (${sortedActive.length}). Broadcasting again will converge them to one; review before sending.`);
      }
    } catch (e) {
      console.error("Error loading announcements:", e);
      setPersistenceError(e?.message || "Announcements could not be loaded safely.");
    }
    setLoading(false);
  };

  const handleField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const applyTemplate = (tpl) => setForm(f => ({ ...f, ...tpl.fields }));

  const applyPageGroup = (group) => setForm(f => ({
    ...f,
    display_pages: group.all ? [] : [...new Set(group.pages)],
  }));

  const payloadForm = () => ({
    ...form,
    expires_at: expiresAtFor(form),
    scheduled_for: fromLocalInput(form.scheduled_at),
  });

  const togglePage = (page) => {
    setForm(f => ({
      ...f,
      display_pages: f.display_pages.includes(page)
        ? f.display_pages.filter(p => p !== page)
        : [...f.display_pages, page]
    }));
  };

  const toggleUser = (email) => {
    setForm(f => ({
      ...f,
      target_users: f.target_users.includes(email)
        ? f.target_users.filter(e => e !== email)
        : [...f.target_users, email]
    }));
  };

  const handleUploadImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    const result = await UploadFile({ file });
    handleField("image_url", result.file_url);
    setUploadingImage(false);
  };

  const handleUploadSound = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingSound(true);
    const result = await UploadFile({ file });
    handleField("custom_sound_url", result.file_url);
    handleField("sound_type", "custom");
    setUploadingSound(false);
  };

  const handlePreviewSound = () => {
    playSoundEffect(form.sound_type, form.custom_sound_url);
  };

  const getEditingRecord = () => savedAnnouncements.find(a => a.id === editingId) || null;

  const saveCurrentAnnouncement = async () => {
    if (!form.title || !form.message) return null;
    const loadedRecord = getEditingRecord();
    if (editingId && !loadedRecord) {
      throw new Error("The announcement being edited is no longer in the loaded list. Reload before saving.");
    }
    if (loadedRecord) {
      return updateAnnouncementIfUnchanged({
        record: loadedRecord,
        nextFields: payloadForm(),
        sessionToken,
        label: `Announcement ${loadedRecord.name || loadedRecord.title || loadedRecord.id}`,
      });
    }
    const created = await createAnnouncementWithRecovery({
      data: { ...payloadForm(), is_active: false },
      sessionToken,
      label: `Announcement ${form.name || form.title}`,
    });
    setEditingId(created.record.id);
    return created.record;
  };

  const handleSave = async () => {
    if (!form.title || !form.message || saving) return;
    setPersistenceError("");
    setSaving(true);
    try {
      await saveCurrentAnnouncement();
      await loadData();
    } catch (error) {
      console.error("Announcement save blocked:", error);
      setPersistenceError(error?.message || "This announcement changed in another session. Reload before saving.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !form.title || !form.message || saving) return;
    await handleSave();
  };

  const handleSend = async () => {
    if (!form.title || !form.message || sending) return;
    setPersistenceError("");
    setSending(true);
    try {
      const loadedRecord = getEditingRecord();
      if (editingId && !loadedRecord) {
        throw new Error("The announcement being broadcast is no longer in the loaded list. Reload before broadcasting.");
      }
      const expiresAt = expiresAtFor(form);
      if (!expiresAt) {
        throw new Error("Choose when this announcement should stop broadcasting before sending.");
      }
      const result = await publishAnnouncementSafely({
        loadedRecord,
        form: payloadForm(),
        sessionToken,
        label: `Announcement broadcast ${form.name || form.title}`,
      });
      setEditingId(result.published.id);
      setActiveAnnouncement(result.winner);
      setActiveAnnId(result.winner.id);
      if (!result.won) {
        setPersistenceError(`A newer announcement was broadcast concurrently. "${result.winner.title || result.winner.name || "Another announcement"}" remains live; this broadcast was saved but deactivated.`);
      }
      await loadData();
    } catch (error) {
      console.error("Announcement broadcast blocked:", error);
      setPersistenceError(error?.message || "The announcement could not be broadcast safely. Reload before retrying.");
      await loadData();
    } finally {
      setSending(false);
    }
  };

  const handleStopAnnouncement = async () => {
    if (!activeAnnouncement?.id || sending) return;
    setPersistenceError("");
    setSending(true);
    try {
      await stopAnnouncementIfUnchanged({
        record: activeAnnouncement,
        sessionToken,
        label: `Stop announcement ${activeAnnouncement.title || activeAnnouncement.id}`,
      });
      setActiveAnnouncement(null);
      setActiveAnnId(null);
      await loadData();
    } catch (error) {
      console.error("Stop announcement blocked:", error);
      setPersistenceError(error?.message || "The live announcement changed in another session and was not stopped from this stale screen.");
      await loadData();
    } finally {
      setSending(false);
    }
  };

  const loadSaved = (ann) => {
    setForm({
      name: ann.name || "",
      title: ann.title || "",
      message: ann.message || "",
      image_url: ann.image_url || "",
      sound_type: ann.sound_type || "chime",
      custom_sound_url: ann.custom_sound_url || "",
      display_pages: [...new Set((ann.display_pages || []).map((page) => page === "PermittingRepository" ? "Permitting" : page))],
      target_users: ann.target_users || [],
      duration_seconds: ann.duration_seconds ?? 10,
      priority: ann.priority || "normal",
      expires_choice: ann.expires_at ? "custom" : "",
      expires_custom: toLocalInput(ann.expires_at),
      scheduled_at: toLocalInput(ann.scheduled_for),
      display_mode: ann.display_mode === "repeat" ? "repeat" : "once",
      repeat_interval_minutes: ann.repeat_interval_minutes ?? 30,
      requires_ack: ann.requires_ack === true,
    });
    setEditingId(ann.id);
    setShowSavedList(false);
  };

  const handleNew = () => {
    setPersistenceError("");
    setForm(defaultForm);
    setEditingId(null);
  };

  const previewStyle = PREVIEW_STYLES[form.priority] || PREVIEW_STYLES.normal;
  const PreviewIcon = previewStyle.Icon;

  const handleDelete = async (announcement) => {
    if (!announcement?.id || saving || sending) return;
    setPersistenceError("");
    setSaving(true);
    try {
      await deleteAnnouncementIfUnchanged({
        record: announcement,
        sessionToken,
        label: `Announcement ${announcement.name || announcement.title || announcement.id} deletion`,
      });
      if (editingId === announcement.id) {
        setForm(defaultForm);
        setEditingId(null);
      }
      if (activeAnnId === announcement.id) {
        setActiveAnnouncement(null);
        setActiveAnnId(null);
      }
      await loadData();
    } catch (error) {
      console.error("Announcement delete blocked:", error);
      setPersistenceError(error?.message || "This announcement changed in another session and was not deleted.");
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #FEF2F2 0%, #FFF7ED 50%, #FFFBEB 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-md" style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)' }}>
              <Megaphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
                Announcements
                {activeAnnId && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 border border-green-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Live
                  </span>
                )}
              </DialogTitle>
              <p className="text-xs text-gray-500 mt-0.5">Broadcast messages to your team</p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-4 space-y-5">
          {persistenceError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">Announcement update blocked</div>
                <div className="mt-1 text-xs">{persistenceError}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button type="button" size="sm" variant="outline" className="h-7 border-red-300 bg-white text-red-800" onClick={async () => { await loadData(); setPersistenceError(""); }}>Reload latest</Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-red-800" onClick={() => setPersistenceError("")}>Dismiss</Button>
              </div>
            </div>
          )}

          {/* Saved announcements bar */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="clay-button border-none flex-1 text-xs"
              style={{ background: "linear-gradient(135deg, #FEE2E2 0%, rgba(255,255,255,0.9) 100%)" }}
              onClick={() => setShowSavedList(s => !s)}
            >
              <Save className="w-3 h-3 mr-1 text-red-600" />
              Saved Announcements ({savedAnnouncements.length})
              {showSavedList ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="clay-button border-none text-xs"
              onClick={handleNew}
              style={{ background: "linear-gradient(135deg, #F0FFF4 0%, rgba(255,255,255,0.9) 100%)" }}
            >
              <Plus className="w-3 h-3 mr-1" />
              New
            </Button>
          </div>

          {showSavedList && (
            <div className="space-y-1 max-h-48 overflow-y-auto border rounded-xl p-2 bg-gray-50">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : savedAnnouncements.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">No saved announcements</p>
              ) : savedAnnouncements.map(ann => (
                <div key={ann.id} className={`flex items-center gap-2 p-2 rounded-lg hover:bg-white transition-colors ${editingId === ann.id ? 'bg-white shadow-sm border border-red-200' : ''}`}>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadSaved(ann)}>
                    <p className="text-xs font-semibold text-gray-800 truncate">{ann.name || ann.title}</p>
                    <p className="text-xs text-gray-500 truncate">{ann.title}</p>
                  </div>
                  {(() => {
                    const status = announcementStatus(ann);
                    return <Badge className={`text-[10px] px-1 ${STATUS_BADGE[status] || STATUS_BADGE.Draft}`}>{status}</Badge>;
                  })()}
                  <Button
                    variant="ghost" size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={() => handleDelete(ann)}
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Templates */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />Templates
            </span>
            {ANNOUNCEMENT_TEMPLATES.map(tpl => (
              <button type="button"
                key={tpl.label}
                onClick={() => applyTemplate(tpl)}
                className="px-2 py-1 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-red-300 hover:text-red-700 transition-colors"
              >
                {tpl.label}
              </button>
            ))}
          </div>

          {/* Live preview */}
          <div>
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1 mb-1.5">
              <Eye className="w-3 h-3" />Preview
            </Label>
            <div className="rounded-2xl overflow-hidden shadow-md border" style={{ background: previewStyle.gradient }}>
              <div className="h-1" style={{ background: previewStyle.accent }} />
              <div className="p-3.5 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow flex-shrink-0" style={{ background: previewStyle.iconBg }}>
                  <PreviewIcon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold text-sm leading-tight truncate" style={{ color: previewStyle.text }}>{form.title || "Announcement title"}</p>
                  <p className="text-xs mt-1 leading-relaxed whitespace-pre-wrap" style={{ color: previewStyle.sub }}>{form.message || "Your message will appear here…"}</p>
                  {form.image_url && <img src={form.image_url} alt="" className="mt-2 h-14 rounded-lg object-cover shadow" />}
                </div>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.4)" }}>
                  <X className="w-3.5 h-3.5" style={{ color: previewStyle.text }} />
                </div>
              </div>
              {form.duration_seconds > 0 && !form.requires_ack && (
                <div className="h-1" style={{ background: `${previewStyle.accent}66` }} />
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {expiresAtFor(form) ? `Stops ${new Date(expiresAtFor(form)).toLocaleString()}` : "Pick a stop-showing time to broadcast"}
              {" · "}{form.display_mode === "repeat" ? `repeats every ${form.repeat_interval_minutes}m while live` : "shows once per viewer"}
              {form.requires_ack ? " · requires acknowledgement" : ""}
            </p>
          </div>

          {/* Name (save label) */}
          <div>
            <Label className="text-xs font-semibold text-gray-600">Save Name (optional)</Label>
            <Input
              placeholder="e.g. 'Lunch Announcement'"
              value={form.name}
              onChange={e => handleField("name", e.target.value)}
              className="mt-1 h-8 text-sm"
            />
          </div>

          {/* Title */}
          <div>
            <Label className="text-xs font-semibold text-gray-600">Title *</Label>
            <Input
              placeholder="Announcement headline..."
              value={form.title}
              onChange={e => handleField("title", e.target.value)}
              className="mt-1 h-9 text-sm font-semibold"
            />
          </div>

          {/* Message */}
          <div>
            <Label className="text-xs font-semibold text-gray-600">Message *</Label>
            <Textarea
              placeholder="Announcement details..."
              value={form.message}
              onChange={e => handleField("message", e.target.value)}
              className="mt-1 min-h-20 text-sm"
            />
          </div>

          {/* Priority + Duration row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-gray-600">Priority</Label>
              <Select value={form.priority} onValueChange={v => handleField("priority", v)}>
                <SelectTrigger className="mt-1 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full inline-block" style={{ background: p.color }} />
                        {p.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600">Duration (seconds, 0 = manual)</Label>
              <Input
                type="number"
                min={0}
                max={300}
                value={form.duration_seconds}
                onChange={e => handleField("duration_seconds", parseInt(e.target.value) || 0)}
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          {/* Sound */}
          <div className="clay-card p-3">
            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-2">
              <Volume2 className="w-3 h-3" /> Sound
            </Label>
            <div className="flex gap-2 items-center">
              <Select value={form.sound_type} onValueChange={v => handleField("sound_type", v)}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_SOUNDS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 clay-button border-none text-xs"
                onClick={handlePreviewSound}
                style={{ background: "linear-gradient(135deg, #E0D4F7 0%, rgba(255,255,255,0.9) 100%)" }}
              >
                <Volume2 className="w-3 h-3 mr-1" /> Preview
              </Button>
            </div>
            {form.sound_type === "custom" && (
              <div className="mt-2">
                {form.custom_sound_url ? (
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-green-700 truncate flex-1">Custom sound uploaded</span>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => handleField("custom_sound_url", "")}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <div className="flex items-center gap-2 p-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-400 transition-colors">
                      {uploadingSound ? <Loader2 className="w-4 h-4 animate-spin text-purple-600" /> : <Music className="w-4 h-4 text-gray-400" />}
                      <span className="text-xs text-gray-500">{uploadingSound ? "Uploading..." : "Upload sound file (mp3, wav, ogg)"}</span>
                    </div>
                    <input type="file" accept="audio/*" className="hidden" onChange={handleUploadSound} disabled={uploadingSound} />
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Image */}
          <div className="clay-card p-3">
            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-2">
              <ImageIcon className="w-3 h-3" /> Image (optional)
            </Label>
            {form.image_url ? (
              <div className="flex items-center gap-3">
                <img src={form.image_url} alt="Preview" className="h-16 w-24 object-cover rounded-lg border" />
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600" onClick={() => handleField("image_url", "")}>
                  <X className="w-3 h-3 mr-1" />Remove
                </Button>
              </div>
            ) : (
              <label className="cursor-pointer">
                <div className="flex items-center gap-2 p-3 border-2 border-dashed border-gray-300 rounded-xl hover:border-red-400 transition-colors">
                  {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin text-red-600" /> : <ImageIcon className="w-4 h-4 text-gray-400" />}
                  <span className="text-xs text-gray-500">{uploadingImage ? "Uploading..." : "Click to upload an image"}</span>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleUploadImage} disabled={uploadingImage} />
              </label>
            )}
          </div>

          {/* Delivery window */}
          <div className="clay-card p-3 space-y-3">
            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
              <CalendarClock className="w-3 h-3" /> Delivery
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-gray-500">Start showing</Label>
                <Input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={e => handleField("scheduled_at", e.target.value)}
                  className="mt-1 h-8 text-sm"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">Empty = immediately on send</p>
              </div>
              <div>
                <Label className="text-[11px] text-gray-500">Stop showing *</Label>
                <Select value={form.expires_choice} onValueChange={v => handleField("expires_choice", v)}>
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15m">15 minutes</SelectItem>
                    <SelectItem value="30m">30 minutes</SelectItem>
                    <SelectItem value="1h">1 hour</SelectItem>
                    <SelectItem value="4h">4 hours</SelectItem>
                    <SelectItem value="eod">End of day</SelectItem>
                    <SelectItem value="custom">Custom…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.expires_choice === "custom" && (
              <Input
                type="datetime-local"
                value={form.expires_custom}
                onChange={e => handleField("expires_custom", e.target.value)}
                className="h-8 text-sm"
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-gray-500 flex items-center gap-1">
                  <Repeat2 className="w-3 h-3" /> While live, show
                </Label>
                <Select value={form.display_mode} onValueChange={v => handleField("display_mode", v)}>
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Once per viewer</SelectItem>
                    <SelectItem value="repeat">Repeat while live</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.display_mode === "repeat" && (
                <div>
                  <Label className="text-[11px] text-gray-500">Every (minutes)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={form.repeat_interval_minutes}
                    onChange={e => handleField("repeat_interval_minutes", parseInt(e.target.value) || 30)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ann-ack"
                checked={form.requires_ack}
                onCheckedChange={v => handleField("requires_ack", v === true)}
              />
              <label htmlFor="ann-ack" className="text-xs text-gray-700 cursor-pointer">
                Require viewers to press "Got it" (tracked per viewer)
              </label>
            </div>
          </div>

          {/* Pages */}
          <div className="clay-card p-3">
            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-2">
              <Monitor className="w-3 h-3" /> Display on Pages
              <span className="text-gray-400 font-normal ml-1">(empty = all pages)</span>
            </Label>
            <div className="flex flex-wrap gap-1 mb-2">
              {PAGE_GROUPS.map(group => (
                <button type="button"
                  key={group.label}
                  onClick={() => applyPageGroup(group)}
                  className="px-2 py-1 text-[10px] rounded-md border border-dashed border-gray-300 text-gray-500 hover:border-red-300 hover:text-red-600 transition-colors"
                >
                  {group.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {ALL_PAGES.map(page => (
                <button type="button"
                  key={page}
                  onClick={() => togglePage(page)}
                  className={`px-2 py-1 text-xs rounded-lg transition-all border ${
                    form.display_pages.includes(page)
                      ? "bg-red-100 text-red-700 border-red-300 font-medium"
                      : "bg-white text-gray-600 border-gray-200 hover:border-red-200"
                  }`}
                >
                  {page.replace(/([A-Z])/g, ' $1').trim()}
                </button>
              ))}
            </div>
          </div>

          {/* Users */}
          <div className="clay-card p-3">
            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-2">
              <Users className="w-3 h-3" /> Target Users
              <span className="text-gray-400 font-normal ml-1">(empty = all users)</span>
            </Label>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {allUsers.map(user => (
                <div key={user.id} className="flex items-center gap-2 py-1">
                  <Checkbox
                    id={`user-${user.id}`}
                    checked={form.target_users.includes(user.email)}
                    onCheckedChange={() => toggleUser(user.email)}
                  />
                  <label htmlFor={`user-${user.id}`} className="text-xs cursor-pointer text-gray-700">
                    {user.full_name || user.email}
                    <span className="text-gray-400 ml-1">({user.email})</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 pb-5 pt-4 space-y-3" style={{ background: 'linear-gradient(0deg, rgba(254,242,242,0.3) 0%, transparent 100%)' }}>
          {activeAnnId && (
            <Button
              className="w-full h-10 rounded-xl text-sm font-bold shadow-sm transition-all hover:shadow-md"
              style={{ background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)', color: '#991B1B', border: '1px solid #FCA5A5' }}
              onClick={handleStopAnnouncement}
              disabled={sending}
            >
              <X className="w-4 h-4 mr-2" />
              Stop Live Announcement
            </Button>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Button
              className="h-9 rounded-xl text-xs font-bold shadow-sm transition-all hover:shadow-md"
              style={{ background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF', border: '1px solid #93C5FD' }}
              onClick={handleSave}
              disabled={saving || !form.title || !form.message}
            >
              {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
              Save
            </Button>

            <Button
              className="h-9 rounded-xl text-xs font-bold shadow-sm transition-all hover:shadow-md"
              style={{
                background: editingId ? 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)' : '#F3F4F6',
                color: editingId ? '#92400E' : '#9CA3AF',
                border: editingId ? '1px solid #FCD34D' : '1px solid #E5E7EB'
              }}
              onClick={handleUpdate}
              disabled={saving || !editingId || !form.title || !form.message}
            >
              {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Update
            </Button>

            <Button
              className="h-9 rounded-xl text-xs font-bold shadow-sm transition-all hover:shadow-md hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)', color: 'white', border: '1px solid #EF4444' }}
              onClick={handleSend}
              disabled={sending || !form.title || !form.message || !expiresAtFor(form)}
            >
              {sending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
              Broadcast
            </Button>
          </div>
          <p className="text-xs text-gray-400 text-center">
            {editingId ? `Editing: ${form.name || form.title}` : "New announcement (unsaved)"}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}