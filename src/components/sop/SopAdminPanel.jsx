import React, { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, X, Loader2, Save, Users } from "lucide-react";
import { sopSaveSettings, sopAckReport } from "./sopService";

// Admin drawer: department categories, named SOP editors, module defaults,
// and the read-receipt report. Saves go through manageSops save_settings
// (admin-only server-side).

const slugify = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

function CategoryRow({ cat, inUse, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(cat.color) ? cat.color : "#94A3B8"}
        onChange={(e) => onChange({ ...cat, color: e.target.value })}
        className="h-8 w-10 rounded border cursor-pointer"
        title="Category color"
      />
      <Input value={cat.label} onChange={(e) => onChange({ ...cat, label: e.target.value, key: cat.key === slugify(cat.label) ? slugify(e.target.value) : cat.key })} className="h-8" />
      <span className="text-[10px] text-slate-400 w-20 truncate" title={cat.key}>{cat.key}</span>
      {inUse > 0 && <Badge variant="outline" className="text-[10px]">{inUse} SOP{inUse === 1 ? "" : "s"}</Badge>}
      <Button
        type="button" variant="ghost" size="icon"
        onClick={onRemove}
        disabled={cat.key === "other" || inUse > 0}
        title={cat.key === "other" ? "The 'other' category is required" : inUse > 0 ? "Reassign SOPs to another category first" : "Remove category"}
        className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function SopAdminPanel({ open, onClose, settings, settingsUpdatedDate, sops, onSaved }) {
  const [form, setForm] = useState(null);
  const [editorInput, setEditorInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [expandedReport, setExpandedReport] = useState("");

  useEffect(() => {
    if (open) {
      setForm(settings ? JSON.parse(JSON.stringify(settings)) : null);
      setError("");
      setReport(null);
    }
  }, [open, settings]);

  const inUseByCategory = useMemo(() => {
    const map = {};
    for (const sop of sops || []) map[sop.category] = (map[sop.category] || 0) + 1;
    return map;
  }, [sops]);

  const patch = (fields) => setForm((f) => ({ ...f, ...fields }));
  const patchCategory = (i, next) => patch({ categories: form.categories.map((c, idx) => (idx === i ? next : c)) });

  const addCategory = () => {
    const label = `New department`;
    let key = slugify(label);
    let n = 1;
    while (form.categories.some((c) => c.key === key)) { n += 1; key = slugify(`${label}_${n}`); }
    patch({ categories: [...form.categories, { key, label, color: "#94A3B8", icon: "Folder" }] });
  };

  const removeCategory = (i) => {
    const cat = form.categories[i];
    if (!cat || cat.key === "other" || (inUseByCategory[cat.key] || 0) > 0) return;
    patch({ categories: form.categories.filter((_, idx) => idx !== i) });
  };

  const addEditor = () => {
    const email = editorInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid email for the editor."); return; }
    patch({ editor_emails: [...new Set([...(form.editor_emails || []), email])] });
    setEditorInput("");
    setError("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await sopSaveSettings({ settings: form, expectedUpdatedDate: settingsUpdatedDate });
      onSaved?.(res?.settings || form, res?.settings_updated_date || "");
      onClose?.();
    } catch (e) {
      setError(e?.message || "Could not save SOP settings.");
    }
    setSaving(false);
  };

  const loadReport = async () => {
    setReportBusy(true);
    try {
      const res = await sopAckReport();
      setReport(res?.report || []);
    } catch (e) {
      setError(e?.message || "Could not load the acknowledgment report.");
    }
    setReportBusy(false);
  };

  if (!form) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>SOP settings</SheetTitle>
          <SheetDescription>Departments, who can edit, defaults, and read receipts.</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="categories" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="categories">Departments</TabsTrigger>
            <TabsTrigger value="editors">Editors</TabsTrigger>
            <TabsTrigger value="defaults">Defaults</TabsTrigger>
            <TabsTrigger value="acks" onClick={() => { if (!report && !reportBusy) loadReport(); }}>Receipts</TabsTrigger>
          </TabsList>

          <TabsContent value="categories" className="space-y-3 pt-3">
            <p className="text-xs text-slate-500">Departments group SOPs on the main page. A department can't be removed while SOPs still use it.</p>
            <div className="space-y-2">
              {form.categories.map((cat, i) => (
                <CategoryRow
                  key={cat.key || i}
                  cat={cat}
                  inUse={inUseByCategory[cat.key] || 0}
                  onChange={(next) => patchCategory(i, next)}
                  onRemove={() => removeCategory(i)}
                />
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addCategory} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add department
            </Button>
          </TabsContent>

          <TabsContent value="editors" className="space-y-3 pt-3">
            <p className="text-xs text-slate-500">Admins can always edit. Add staff emails here to let them create and edit SOPs too.</p>
            <div className="flex gap-2">
              <Input
                value={editorInput}
                onChange={(e) => setEditorInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEditor(); } }}
                placeholder="lead@company.com"
                className="h-9"
              />
              <Button type="button" variant="outline" size="sm" onClick={addEditor} className="gap-1">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(form.editor_emails || []).map((email) => (
                <Badge key={email} variant="secondary" className="gap-1">
                  {email}
                  <button type="button" onClick={() => patch({ editor_emails: form.editor_emails.filter((e) => e !== email) })}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {!(form.editor_emails || []).length && <p className="text-xs text-slate-400">No named editors yet — only admins can edit.</p>}
            </div>
          </TabsContent>

          <TabsContent value="defaults" className="space-y-4 pt-3">
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span className="text-sm">
                <span className="font-medium">Require read receipt by default</span>
                <span className="block text-xs text-slate-500">New SOPs start with "I have read this" turned on.</span>
              </span>
              <Switch checked={form.require_ack_default === true} onCheckedChange={(v) => patch({ require_ack_default: v })} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span className="text-sm">
                <span className="font-medium">Allow in-app camera &amp; mic</span>
                <span className="block text-xs text-slate-500">Photo snapshot, video recording, and voice dictation controls.</span>
              </span>
              <Switch checked={form.allow_in_app_recording !== false} onCheckedChange={(v) => patch({ allow_in_app_recording: v })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Max image size (MB)</Label>
                <Input type="number" min={1} max={100} value={form.max_image_upload_mb} onChange={(e) => patch({ max_image_upload_mb: e.target.value })} />
              </div>
              <div>
                <Label>Max video size (MB)</Label>
                <Input type="number" min={1} max={500} value={form.max_video_upload_mb} onChange={(e) => patch({ max_video_upload_mb: e.target.value })} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="acks" className="space-y-3 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Who has acknowledged the current version of each receipt-required SOP.</p>
              <Button type="button" variant="ghost" size="sm" onClick={loadReport} disabled={reportBusy} className="gap-1 h-7 text-xs">
                {reportBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Refresh
              </Button>
            </div>
            {reportBusy && !report && <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
            {report && report.length === 0 && (
              <p className="text-sm text-slate-400">No published SOPs require read receipts yet.</p>
            )}
            {report && report.map((row) => (
              <div key={row.sop_id} className="rounded-lg border p-3">
                <button type="button" className="w-full flex items-center justify-between gap-2 text-left" onClick={() => setExpandedReport((cur) => (cur === row.sop_id ? "" : row.sop_id))}>
                  <span className="text-sm font-medium truncate">{row.title} <span className="text-xs text-slate-400">v{row.version}</span></span>
                  <span className="flex items-center gap-1.5 text-xs shrink-0">
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">{row.acknowledged.length} read</Badge>
                    <Badge variant="secondary" className={row.pending.length ? "bg-red-100 text-red-700" : ""}>{row.pending.length} pending</Badge>
                  </span>
                </button>
                {expandedReport === row.sop_id && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="font-semibold text-emerald-700 mb-1">Acknowledged</p>
                      {row.acknowledged.length ? row.acknowledged.map((a) => (
                        <p key={a.email} className="text-slate-600">{a.name || a.email} · {a.at ? new Date(a.at).toLocaleDateString() : ""}</p>
                      )) : <p className="text-slate-400">Nobody yet</p>}
                    </div>
                    <div>
                      <p className="font-semibold text-red-700 mb-1 flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Pending</p>
                      {row.pending.length ? row.pending.map((p) => (
                        <p key={p.email} className="text-slate-600">{p.name || p.email}</p>
                      )) : <p className="text-slate-400">Everyone is current</p>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </TabsContent>
        </Tabs>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="sticky bottom-0 mt-4 -mx-6 border-t bg-white/95 backdrop-blur px-6 py-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
