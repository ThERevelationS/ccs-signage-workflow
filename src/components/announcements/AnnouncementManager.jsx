import React, { useState, useEffect } from "react";
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
  Plus, Check, X, RefreshCw, Loader2, ChevronDown, ChevronUp, Music
} from "lucide-react";
import { playSoundEffect } from "./AnnouncementContext";
import {
  createAnnouncementWithRecovery,
  deleteAnnouncementIfUnchanged,
  publishAnnouncementSafely,
  stopAnnouncementIfUnchanged,
  updateAnnouncementIfUnchanged,
} from "./announcementPersistence";

const UploadFile = (params) => base44.integrations.Core.UploadFile(params);
const Announcement = base44.entities.Announcement;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

const ALL_PAGES = [
  "MyWorkflow", "MainWorkflow", "SalesPipeline", "Estimating", "Permitting",
  "Design", "Production", "Fabrication", "InstallationDeliver", "OrderForm",
  "PermittingRepository", "SIPs", "MondayMorningMeeting", "Financials",
  "WorkOrderCalendar", "TimeClock"
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
};

export default function AnnouncementManager({ isOpen, onClose, currentUserEmail }) {
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
        Announcement.list("-updated_date", 50),
        Announcement.filter({ is_active: true }),
        AuthorizedEmail.list()
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

  const handleSave = async () => {
    if (!form.title || !form.message) return;
    setSaving(true);
    if (editingId) {
      await Announcement.update(editingId, { ...form });
    } else {
      const saved = await Announcement.create({ ...form, is_active: false });
      setEditingId(saved.id);
    }
    await loadData();
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (!editingId || !form.title || !form.message) return;
    setSaving(true);
    await Announcement.update(editingId, { ...form });
    await loadData();
    setSaving(false);
  };

  const handleSend = async () => {
    if (!form.title || !form.message) return;
    setSending(true);

    // Deactivate all current announcements first
    const actives = savedAnnouncements.filter(a => a.is_active);
    for (const a of actives) {
      await Announcement.update(a.id, { is_active: false });
    }

    const payload = {
      ...form,
      is_active: true,
      sent_at: new Date().toISOString(),
      sent_by: currentUserEmail || "admin",
    };

    let annId = editingId;
    if (editingId) {
      await Announcement.update(editingId, payload);
    } else {
      const saved = await Announcement.create(payload);
      annId = saved.id;
      setEditingId(saved.id);
    }
    setActiveAnnId(annId);
    await loadData();
    setSending(false);
  };

  const handleStopAnnouncement = async () => {
    if (!activeAnnId) return;
    await Announcement.update(activeAnnId, { is_active: false });
    setActiveAnnId(null);
    await loadData();
  };

  const loadSaved = (ann) => {
    setForm({
      name: ann.name || "",
      title: ann.title || "",
      message: ann.message || "",
      image_url: ann.image_url || "",
      sound_type: ann.sound_type || "chime",
      custom_sound_url: ann.custom_sound_url || "",
      display_pages: ann.display_pages || [],
      target_users: ann.target_users || [],
      duration_seconds: ann.duration_seconds ?? 10,
      priority: ann.priority || "normal",
    });
    setEditingId(ann.id);
    setShowSavedList(false);
  };

  const handleNew = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    await Announcement.delete(id);
    if (editingId === id) { setForm(defaultForm); setEditingId(null); }
    await loadData();
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
                  {ann.is_active && <Badge className="text-[10px] bg-green-100 text-green-700 px-1">Live</Badge>}
                  <Button
                    variant="ghost" size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={() => handleDelete(ann.id)}
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}

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

          {/* Pages */}
          <div className="clay-card p-3">
            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-2">
              <Monitor className="w-3 h-3" /> Display on Pages
              <span className="text-gray-400 font-normal ml-1">(empty = all pages)</span>
            </Label>
            <div className="flex flex-wrap gap-1">
              {ALL_PAGES.map(page => (
                <button
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
              disabled={sending || !form.title || !form.message}
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