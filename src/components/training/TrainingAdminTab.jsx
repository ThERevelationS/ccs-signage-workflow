import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Loader2, Plus, Pencil, Trash2, UserPlus, ChevronDown, ChevronRight,
  BookOpen, Play, FileText, Award, ClipboardList, CheckCircle2,
} from "lucide-react";
import {
  trainingBootstrap, trainingAssign, trainingCancel, trainingReopen,
  trainingItemCreate, trainingItemUpdate, trainingItemDelete,
} from "./trainingService";
import { newRequestKey } from "@/components/sop/sopModel";

// Editor/admin body for the training tracker, rendered as a tab inside the SOP
// admin drawer. Manages the reusable TrainingItem catalog (create/edit/active
// toggle/delete — delete auto-deactivates server-side when history exists) and
// shows per-item assignment rows with cancel/reopen. All calls go through the
// session-authenticated manageTraining gateway.

const TYPE_ICONS = {
  sop: BookOpen,
  video: Play,
  document: FileText,
  certification: Award,
  custom: ClipboardList,
};

const TYPE_LABELS = {
  sop: "SOP",
  video: "Video",
  document: "Document",
  certification: "Certification",
  custom: "Custom",
};

const emptyForm = {
  title: "", type: "custom", description: "", sop_id: "",
  url: "", file_url: "", duration_minutes: "", valid_months: "", active: true,
  sort_order: 0,
};

const fmtDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
};

function itemToForm(item) {
  return {
    title: item.title || "",
    type: item.type || "custom",
    description: item.description || "",
    sop_id: item.sop_id || "",
    url: item.url || "",
    file_url: item.file_url || "",
    duration_minutes: item.duration_minutes ? String(item.duration_minutes) : "",
    valid_months: item.valid_months ? String(item.valid_months) : "",
    active: item.active !== false,
    // Not editable in the form — carried through so an update doesn't reset it.
    sort_order: Number(item.sort_order) || 0,
  };
}

function formToItem(form) {
  return {
    title: form.title,
    type: form.type,
    description: form.description,
    sop_id: form.type === "sop" ? form.sop_id : "",
    url: form.url,
    file_url: form.file_url,
    duration_minutes: Number(form.duration_minutes) || 0,
    valid_months: form.type === "certification" ? (Number(form.valid_months) || 0) : 0,
    active: form.active !== false,
    sort_order: Number(form.sort_order) || 0,
  };
}

export default function TrainingAdminTab({ sops = [], me = null }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null => new
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [assignFor, setAssignFor] = useState(null);
  const [assignEmails, setAssignEmails] = useState([]);
  const [assignDue, setAssignDue] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignResult, setAssignResult] = useState(null);
  const [expandedItem, setExpandedItem] = useState("");
  const [rowBusy, setRowBusy] = useState("");

  const canEdit = me?.canEdit === true || me?.role === "admin";
  const isAdmin = me?.isAdmin === true || me?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await trainingBootstrap();
      setItems(Array.isArray(res?.items) ? res.items : []);
      setAssignments(Array.isArray(res?.assignments) ? res.assignments : []);
      setStaff(Array.isArray(res?.staff) ? res.staff : []);
      setError("");
    } catch (e) {
      setError(e?.message || "Could not load training admin data.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const assignmentsByItem = useMemo(() => {
    const map = {};
    for (const a of assignments) {
      const key = a.training_id || "unknown";
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    return map;
  }, [assignments]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setEditorOpen(true);
    setError("");
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm(itemToForm(item));
    setEditorOpen(true);
    setError("");
  };

  const saveItem = async () => {
    if (!form.title.trim()) { setError("Training needs a title."); return; }
    setSaving(true);
    setError("");
    try {
      if (editing?.id) {
        await trainingItemUpdate({ id: editing.id, expectedUpdatedDate: editing.updated_date, item: formToItem(form) });
      } else {
        await trainingItemCreate({ item: formToItem(form) });
      }
      setEditorOpen(false);
      await load();
    } catch (e) {
      setError(e?.message || "Could not save the training item.");
    }
    setSaving(false);
  };

  const toggleActive = async (item) => {
    setRowBusy(item.id);
    try {
      await trainingItemUpdate({
        id: item.id,
        expectedUpdatedDate: item.updated_date,
        item: { ...itemToForm(item), active: !item.active },
      });
      await load();
    } catch (e) {
      setError(e?.message || "Could not update the training item.");
    }
    setRowBusy("");
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.title}"? If staff assignments exist it will be deactivated instead.`)) return;
    setRowBusy(item.id);
    try {
      const res = await trainingItemDelete({ id: item.id, expectedUpdatedDate: item.updated_date });
      if (res?.deactivated) setError(`"${item.title}" has assignment history — it was deactivated instead of deleted.`);
      await load();
    } catch (e) {
      setError(e?.message || "Could not delete the training item.");
    }
    setRowBusy("");
  };

  const openAssign = (item) => {
    setAssignFor(item);
    setAssignEmails([]);
    setAssignDue("");
    setAssignNotes("");
    setAssignResult(null);
    setError("");
  };

  const toggleEmail = (email) => {
    setAssignEmails((cur) => (cur.includes(email) ? cur.filter((e) => e !== email) : [...cur, email]));
  };

  const runAssign = async () => {
    if (!assignFor?.id || !assignEmails.length) return;
    setAssignBusy(true);
    setError("");
    try {
      const res = await trainingAssign({
        trainingId: assignFor.id,
        emails: assignEmails,
        dueDate: assignDue || "",
        notes: assignNotes,
        // Fresh nonce per submission: retries of THIS call dedupe, but a later
        // deliberate re-assign keys differently so it isn't swallowed by the
        // previous row's dedupe record.
        assignKey: newRequestKey(),
      });
      setAssignResult({ created: (res?.created || []).length, skipped: res?.skipped || [] });
      await load();
    } catch (e) {
      setError(e?.message || "Could not assign this training.");
    }
    setAssignBusy(false);
  };

  const cancelRow = async (row) => {
    setRowBusy(row.id);
    try {
      await trainingCancel({ id: row.id, expectedUpdatedDate: row.updated_date });
      await load();
    } catch (e) {
      setError(e?.message || "Could not cancel the assignment.");
    }
    setRowBusy("");
  };

  const reopenRow = async (row) => {
    setRowBusy(row.id);
    try {
      await trainingReopen({ id: row.id, expectedUpdatedDate: row.updated_date });
      await load();
    } catch (e) {
      setError(e?.message || "Could not reopen the assignment.");
    }
    setRowBusy("");
  };

  if (loading) {
    return <p className="py-8 text-sm text-slate-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading training…</p>;
  }

  if (!canEdit) {
    return <p className="py-8 text-sm text-slate-400">Training administration needs SOP editor or admin access.</p>;
  }

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Reusable training items and who they are assigned to. SOP-type items close automatically when the assignee acknowledges the SOP.</p>
        <Button type="button" size="sm" onClick={openNew} className="gap-1 shrink-0">
          <Plus className="h-4 w-4" /> New training
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-center">
          <ClipboardList className="h-8 w-8 mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">No training items yet — create one to start assigning.</p>
        </div>
      ) : (
        items.map((item) => {
          const Icon = TYPE_ICONS[item.type] || ClipboardList;
          const rows = assignmentsByItem[item.id] || [];
          const pendingCount = rows.filter((r) => r.status === "pending").length;
          const expanded = expandedItem === item.id;
          const busy = rowBusy === item.id;
          return (
            <div key={item.id} className={`rounded-lg border p-3 ${item.active ? "" : "opacity-60 bg-slate-50"}`}>
              <div className="flex items-start gap-2">
                <Icon className="h-4 w-4 mt-0.5 shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-800">{item.title}</span>
                    <Badge variant="secondary" className="text-[10px]">{TYPE_LABELS[item.type] || item.type}</Badge>
                    {!item.active && <Badge variant="secondary" className="bg-slate-200 text-slate-500 text-[10px]">inactive</Badge>}
                    {pendingCount > 0 && <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px]">{pendingCount} pending</Badge>}
                  </div>
                  {item.description && <p className="text-xs text-slate-500 truncate mt-0.5" title={item.description}>{item.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch checked={item.active !== false} onCheckedChange={() => toggleActive(item)} disabled={busy} title="Active — inactive items can't be newly assigned" />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                  {isAdmin && (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => deleteItem(item)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openAssign(item)} disabled={!item.active}>
                  <UserPlus className="h-3.5 w-3.5" /> Assign
                </Button>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                  onClick={() => setExpandedItem((cur) => (cur === item.id ? "" : item.id))}
                >
                  {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Assignments ({rows.length})
                </button>
              </div>

              {expanded && (
                <div className="mt-2 space-y-1 border-t pt-2">
                  {rows.length === 0 && <p className="text-xs text-slate-400">Nobody assigned yet.</p>}
                  {rows.map((row) => (
                    <div key={row.id} className="flex items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5">
                      {row.status === "completed"
                        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        : <span className={`h-2 w-2 rounded-full shrink-0 ${row.status === "cancelled" ? "bg-slate-300" : row.overdue ? "bg-red-500" : "bg-amber-400"}`} />}
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-medium text-slate-700">{row.assignee_name || row.assignee_email}</span>
                        <span className="text-[10px] text-slate-400 ml-1.5">
                          {row.status === "completed" && row.completed_at ? `done ${fmtDate(row.completed_at)}` : ""}
                          {row.status === "pending" && row.due_date ? `due ${fmtDate(row.due_date)}` : ""}
                          {row.expires_at ? ` · valid until ${fmtDate(row.expires_at)}` : ""}
                        </span>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] shrink-0 ${
                          row.status === "completed" ? "bg-emerald-100 text-emerald-800"
                          : row.status === "cancelled" ? "bg-slate-100 text-slate-500"
                          : row.overdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {row.status === "pending" && row.overdue ? "overdue" : row.status}
                      </Badge>
                      {row.status === "pending" && (
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-slate-500" disabled={rowBusy === row.id} onClick={() => cancelRow(row)}>Cancel</Button>
                      )}
                      {row.status !== "pending" && (
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-slate-500" disabled={rowBusy === row.id} onClick={() => reopenRow(row)}>Reopen</Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* New / edit item dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit training" : "New training"}</DialogTitle>
            <DialogDescription>Reusable material you can assign to staff.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Forklift safety refresher" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sop">SOP (this app)</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="document">Document</SelectItem>
                    <SelectItem value="certification">Certification</SelectItem>
                    <SelectItem value="custom">Custom / in-person</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Est. minutes</Label>
                <Input type="number" min={0} value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} />
              </div>
            </div>
            {form.type === "sop" && (
              <div>
                <Label>SOP</Label>
                <Select value={form.sop_id} onValueChange={(v) => setForm((f) => ({ ...f, sop_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pick the SOP" /></SelectTrigger>
                  <SelectContent>
                    {(sops || []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-slate-400">Completes automatically when the assignee acknowledges this SOP.</p>
              </div>
            )}
            {form.type === "certification" && (
              <div>
                <Label>Valid for (months)</Label>
                <Input type="number" min={0} value={form.valid_months} onChange={(e) => setForm((f) => ({ ...f, valid_months: e.target.value }))} placeholder="12" />
                <p className="mt-1 text-[11px] text-slate-400">0 = never expires. Otherwise completions flag for renewal after this window.</p>
              </div>
            )}
            {(form.type === "video" || form.type === "document" || form.type === "custom" || form.type === "certification") && (
              <div>
                <Label>Link (optional)</Label>
                <Input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://…" />
              </div>
            )}
            <div>
              <Label>File URL (optional)</Label>
              <Input value={form.file_url} onChange={(e) => setForm((f) => ({ ...f, file_url: e.target.value }))} placeholder="https://…/file.pdf" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} placeholder="What the assignee should do or learn." />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.active !== false} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} /> Active
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button type="button" onClick={saveItem} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={!!assignFor} onOpenChange={(v) => { if (!v) setAssignFor(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign “{assignFor?.title}”</DialogTitle>
            <DialogDescription>Pick staff — anyone with a pending assignment is skipped.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="max-h-56 overflow-y-auto rounded-md border p-2 space-y-1">
              {staff.length === 0 && <p className="text-xs text-slate-400 p-1">No staff roster available.</p>}
              {staff.map((s) => (
                <label key={s.email} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50 text-sm cursor-pointer">
                  <Checkbox checked={assignEmails.includes(s.email)} onCheckedChange={() => toggleEmail(s.email)} />
                  <span className="truncate">{s.name || s.email} <span className="text-xs text-slate-400">{s.email}</span></span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Due date (optional)</Label>
                <Input type="date" value={assignDue} onChange={(e) => setAssignDue(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} rows={2} placeholder="Shown to the assignee." />
            </div>
            {assignResult && (
              <p className="text-xs text-slate-600">
                Assigned {assignResult.created}.
                {assignResult.skipped.length > 0 && ` Skipped (already pending): ${assignResult.skipped.join(", ")}`}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAssignFor(null)}>Close</Button>
            <Button type="button" onClick={runAssign} disabled={assignBusy || !assignEmails.length} className="gap-1.5">
              {assignBusy && <Loader2 className="h-4 w-4 animate-spin" />} Assign {assignEmails.length ? `(${assignEmails.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
