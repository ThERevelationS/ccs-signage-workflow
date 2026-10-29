import React, { useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Plus, Save, Send, Archive, Trash2, Loader2, Sparkles,
  ImagePlus, Paperclip, X, AlertTriangle,
} from "lucide-react";
import SopStepEditor from "./SopStepEditor";
import MediaCapture from "./MediaCapture";
import { newStep, newStepId, attachmentKindFromFile, stripHtml } from "./sopModel";
import { uploadFile } from "./sopAi";
import { openExternalHttpUrl } from "@/utils/safeExternalUrl";

// SOP editor: metadata + drag-reorderable steps + safety notes + attachments.
// Parent owns persistence (sopService create/update/set_status/delete) and
// passes them down as async callbacks; version/CAS errors surface via onError.

export default function SopEditor({ sop, settings, me, isNew, onCancel, onSave, onPublish, onArchive, onDelete, onAiBuild, saving }) {
  const [form, setForm] = useState(() => ({ ...sop, steps: Array.isArray(sop.steps) && sop.steps.length ? sop.steps : [newStep()] }));
  const [mediaOpen, setMediaOpen] = useState(null); // 'cover' | 'attachment'
  const [tagInput, setTagInput] = useState("");
  const [attachBusy, setAttachBusy] = useState(false);
  const isAdmin = me?.role === "admin";
  const categories = settings?.categories || [];

  const patch = (fields) => setForm((f) => ({ ...f, ...fields }));
  const patchStep = (i, next) => patch({ steps: form.steps.map((s, idx) => (idx === i ? next : s)) });
  const removeStep = (i) => patch({ steps: form.steps.filter((_, idx) => idx !== i) });
  const duplicateStep = (i) => {
    const copy = { ...form.steps[i], id: newStepId(), images: [...(form.steps[i].images || [])] };
    const steps = [...form.steps];
    steps.splice(i + 1, 0, copy);
    patch({ steps });
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const steps = [...form.steps];
    const [moved] = steps.splice(result.source.index, 1);
    steps.splice(result.destination.index, 0, moved);
    patch({ steps });
  };

  const addTag = () => {
    const tag = tagInput.trim().slice(0, 60);
    if (!tag) return;
    patch({ tags: [...new Set([...(form.tags || []), tag])] });
    setTagInput("");
  };

  const handleMediaAttach = async ({ type, url, name }) => {
    if (mediaOpen === "cover") {
      patch({ cover_image_url: url });
    } else {
      const kind = type === "image" ? "image" : type === "video" || type === "external_video" ? "video" : "other";
      patch({ attachments: [...(form.attachments || []), { name: name || "Attachment", url, kind }] });
    }
    setMediaOpen(null);
  };

  const attachFile = async (files) => {
    const file = files?.[0];
    if (!file) return;
    setAttachBusy(true);
    try {
      const url = await uploadFile(file);
      patch({ attachments: [...(form.attachments || []), { name: file.name, url, kind: attachmentKindFromFile(file) }] });
    } catch { /* surfaced via upload error paths elsewhere */ }
    setAttachBusy(false);
  };

  const valid = form.title.trim().length > 0;
  const filledSteps = form.steps.filter((s) => s.title || stripHtml(s.body) || s.images?.length || s.video_url || s.external_video_url);

  const buildPayload = () => ({
    title: form.title,
    category: form.category,
    summary: form.summary,
    cover_image_url: form.cover_image_url,
    steps: form.steps,
    safety_notes: (form.safety_notes || []).filter((n) => String(n).trim()),
    attachments: form.attachments || [],
    tags: form.tags || [],
    estimated_minutes: Number(form.estimated_minutes) || 0,
    requires_ack: form.requires_ack === true,
    pinned: form.pinned === true,
    sort_order: Number(form.sort_order) || 0,
  });

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Cancel
        </Button>
        <Badge variant={isNew ? "secondary" : "outline"}>{isNew ? "New SOP" : `Editing${sop.status ? ` · ${sop.status}` : ""}`}</Badge>
        {onAiBuild && (
          <Button type="button" variant="outline" size="sm" onClick={onAiBuild} className="gap-1.5 ml-auto">
            <Sparkles className="h-4 w-4 text-purple-500" /> Build with AI
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3">
          <div>
            <Label htmlFor="sop-title">Title</Label>
            <Input id="sop-title" value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. Changing a router bit on the CNC" />
          </div>
          <div>
            <Label>Department</Label>
            <Select value={form.category} onValueChange={(v) => patch({ category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="sop-summary">Summary <span className="text-slate-400 font-normal">(shown on the card)</span></Label>
          <Textarea id="sop-summary" value={form.summary} onChange={(e) => patch({ summary: e.target.value })} rows={2} placeholder="One line — what this procedure covers" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div>
            <Label htmlFor="sop-minutes">Est. minutes</Label>
            <Input id="sop-minutes" type="number" min={0} value={form.estimated_minutes || ""} onChange={(e) => patch({ estimated_minutes: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm pb-2">
            <Switch checked={form.requires_ack === true} onCheckedChange={(v) => patch({ requires_ack: v })} />
            Requires read receipt
          </label>
          <label className="flex items-center gap-2 text-sm pb-2">
            <Switch checked={form.pinned === true} onCheckedChange={(v) => patch({ pinned: v })} />
            Pinned to top
          </label>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setMediaOpen("cover")} className="gap-1.5">
              <ImagePlus className="h-4 w-4" /> {form.cover_image_url ? "Change cover" : "Cover photo"}
            </Button>
            {form.cover_image_url && (
              <div className="mt-1 relative inline-block">
                <img src={form.cover_image_url} alt="Cover" className="h-14 w-20 object-cover rounded border" />
                <button type="button" onClick={() => patch({ cover_image_url: "" })} className="absolute -top-1.5 -right-1.5 rounded-full bg-white border p-0.5" title="Remove cover"><X className="h-3 w-3" /></button>
              </div>
            )}
          </div>
        </div>

        <div>
          <Label>Tags</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {(form.tags || []).map((t) => (
              <Badge key={t} variant="secondary" className="gap-1">
                {t}
                <button type="button" onClick={() => patch({ tags: form.tags.filter((x) => x !== t) })}><X className="h-3 w-3" /></button>
              </Badge>
            ))}
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="Add tag…"
              className="h-8 w-36"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5 text-amber-900"><AlertTriangle className="h-4 w-4" /> Safety notes</Label>
          <Button type="button" variant="ghost" size="sm" onClick={() => patch({ safety_notes: [...(form.safety_notes || []), ""] })} className="gap-1 h-7 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        {(form.safety_notes || []).map((note, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={note} onChange={(e) => patch({ safety_notes: form.safety_notes.map((n, idx) => (idx === i ? e.target.value : n)) })} placeholder="e.g. Always unplug the router before changing bits" className="h-8 bg-white" />
            <Button type="button" variant="ghost" size="icon" onClick={() => patch({ safety_notes: form.safety_notes.filter((_, idx) => idx !== i) })} className="h-8 w-8 shrink-0"><X className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base">Steps</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => patch({ steps: [...form.steps, newStep()] })} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add step
          </Button>
        </div>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="sop-steps">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
                {form.steps.map((step, i) => (
                  <Draggable key={step.id} draggableId={step.id} index={i}>
                    {(drag) => (
                      <div ref={drag.innerRef} {...drag.draggableProps}>
                        <SopStepEditor
                          step={step}
                          index={i}
                          settings={settings}
                          onChange={(next) => patchStep(i, next)}
                          onDelete={() => removeStep(i)}
                          onDuplicate={() => duplicateStep(i)}
                          dragHandleProps={drag.dragHandleProps}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <Label>Attachments</Label>
          <div className="flex gap-1.5">
            <label className="inline-flex">
              <input type="file" className="hidden" onChange={(e) => attachFile(e.target.files)} />
              <Button type="button" variant="outline" size="sm" asChild disabled={attachBusy} className="gap-1.5 h-8 text-xs">
                <span><Paperclip className="h-3.5 w-3.5" /> {attachBusy ? "Uploading…" : "Upload file"}</span>
              </Button>
            </label>
            <Button type="button" variant="outline" size="sm" onClick={() => setMediaOpen("attachment")} className="gap-1.5 h-8 text-xs">
              <ImagePlus className="h-3.5 w-3.5" /> Photo / video
            </Button>
          </div>
        </div>
        {(form.attachments || []).length > 0 ? (
          <ul className="space-y-1.5">
            {form.attachments.map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <button type="button" onClick={() => openExternalHttpUrl(a.url)} className="text-blue-600 hover:underline truncate">{a.name}</button>
                <button type="button" onClick={() => patch({ attachments: form.attachments.filter((_, idx) => idx !== i) })} className="text-slate-400 hover:text-red-600" title="Remove"><X className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">No attachments yet — PDFs, spec sheets, or reference files.</p>
        )}
      </div>

      <div className="sticky bottom-0 -mx-2 border-t bg-white/95 backdrop-blur p-3 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => onSave?.(buildPayload(), "draft")} disabled={!valid || saving} className="gap-1.5" variant="outline">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isNew ? "Save draft" : "Save changes"}
        </Button>
        <Button type="button" onClick={() => onPublish?.(buildPayload())} disabled={!valid || saving || !filledSteps.length} className="gap-1.5">
          <Send className="h-4 w-4" /> Save &amp; publish
        </Button>
        {!isNew && sop.status === "published" && (
          <Button type="button" variant="outline" onClick={() => onArchive?.(sop)} disabled={saving} className="gap-1.5">
            <Archive className="h-4 w-4" /> Archive
          </Button>
        )}
        {!isNew && isAdmin && (
          <Button type="button" variant="ghost" onClick={() => onDelete?.(sop)} disabled={saving} className="gap-1.5 text-red-600 hover:text-red-700 ml-auto">
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
        {!valid && <span className="text-xs text-slate-400">A title is required.</span>}
        {valid && !filledSteps.length && <span className="text-xs text-slate-400">Add at least one step to publish.</span>}
      </div>

      <MediaCapture
        open={mediaOpen != null}
        onClose={() => setMediaOpen(null)}
        onAttach={handleMediaAttach}
        allowRecording={settings?.allow_in_app_recording !== false}
        maxImageMb={settings?.max_image_upload_mb || 15}
        maxVideoMb={settings?.max_video_upload_mb || 100}
      />
    </div>
  );
}
