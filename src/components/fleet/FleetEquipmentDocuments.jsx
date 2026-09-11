import { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { filterAllFleetRows } from "./fleetEntityLoaders";
import FleetConfirmDialog from "./FleetConfirmDialog";
import {
  Archive,
  ExternalLink,
  FileImage,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

const DOCUMENT_TYPES = [
  ["registration", "Registration"],
  ["insurance", "Insurance"],
  ["manual", "Manual"],
  ["receipt", "Receipt"],
  ["service_document", "Service Document"],
  ["inspection_document", "Inspection Document"],
  ["photo", "Photo"],
  ["other", "Other"],
];
const TYPE_LABELS = Object.fromEntries(DOCUMENT_TYPES);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "jpg", "jpeg", "png", "webp", "gif", "heic",
  "doc", "docx", "xls", "xlsx", "csv", "txt",
]);
const EMPTY_FORM = {
  title: "",
  document_type: "other",
  document_date: "",
  expiration_date: "",
  notes: "",
};

const todayText = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
};
const formatBytes = (bytes) => {
  const size = Number(bytes || 0);
  if (!size) return "Size unavailable";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};
const extensionOf = (name) => String(name || "").split(".").pop()?.toLowerCase() || "";

function expirationState(value) {
  if (!value) return null;
  const today = todayText();
  if (value < today) return { label: "Expired", tone: "danger" };
  const horizon = new Date(`${today}T12:00:00`);
  horizon.setDate(horizon.getDate() + 30);
  const horizonText = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(horizon);
  if (value <= horizonText) return { label: "Expires within 30 days", tone: "attention" };
  return { label: "Current", tone: "good" };
}

export default function FleetEquipmentDocuments({ equipment, isAdmin }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const loadDocuments = useCallback(async () => {
    if (!equipment?.id) return;
    setLoading(true);
    setError("");
    try {
      const rows = await filterAllFleetRows(
        base44.entities.FleetEquipmentDocument,
        { equipment_id: equipment.id },
        "-created_date",
        { label: `${equipment.name} Fleet documents` },
      );
      setDocuments(rows || []);
    } catch (e) {
      setError(e?.message || "Unable to load Fleet documents.");
    } finally {
      setLoading(false);
    }
  }, [equipment?.id, equipment?.name]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const visibleDocuments = useMemo(() => documents.filter(row => showArchived || !row.is_archived), [documents, showArchived]);
  const activeCount = documents.filter(row => !row.is_archived).length;
  const archivedCount = documents.filter(row => row.is_archived).length;

  const openCreate = () => {
    setError("");
    setNotice("");
    setForm(EMPTY_FORM);
    setFile(null);
    setPendingUpload(null);
    setDialog({ mode: "create", creationKey: crypto.randomUUID() });
  };

  const openEdit = (document) => {
    setError("");
    setNotice("");
    setForm({
      title: document.title || "",
      document_type: document.document_type || "other",
      document_date: document.document_date || "",
      expiration_date: document.expiration_date || "",
      notes: document.notes || "",
    });
    setFile(null);
    setPendingUpload(null);
    setDialog({ mode: "edit", document });
  };

  const resetDialog = () => {
    setDialog(null);
    setFile(null);
    setPendingUpload(null);
    setForm(EMPTY_FORM);
  };

  const closeDialog = () => {
    if (saving) return;
    resetDialog();
  };

  const chooseFile = (event) => {
    const selected = event.target.files?.[0] || null;
    event.target.value = "";
    if (!selected) return;
    if (selected.size > MAX_FILE_BYTES) {
      setError(`${selected.name} is larger than the 20 MB Fleet document limit.`);
      return;
    }
    if (!ALLOWED_EXTENSIONS.has(extensionOf(selected.name))) {
      setError("Fleet documents currently support PDF, image, Office, CSV, and text files.");
      return;
    }
    setError("");
    setFile(selected);
    setPendingUpload(null);
    setForm(current => ({ ...current, title: current.title || selected.name.replace(/\.[^.]+$/, "") }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!dialog) return;
    const title = form.title.trim();
    if (!title) { setError("Document title is required."); return; }
    if (dialog.mode === "create" && !file && !pendingUpload) { setError("Choose a file to upload."); return; }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (dialog.mode === "edit") {
        const { data } = await base44.functions.invoke("fleetEquipmentDocumentAction", {
          action: "update",
          id: dialog.document.id,
          expected_updated_date: dialog.document.updated_date || "",
          document: {
            title,
            document_type: form.document_type,
            document_date: form.document_date || null,
            expiration_date: form.expiration_date || null,
            notes: form.notes.trim(),
          },
        });
        if (data?.error) throw new Error(data.error);
        const updated = data?.document;
        if (!updated?.id) throw new Error("Fleet document was not returned after save.");
        setDocuments(current => current.map(row => row.id === updated.id ? updated : row));
        setNotice("Fleet document details updated.");
        resetDialog();
        return;
      }

      let uploaded = pendingUpload;
      if (!uploaded) {
        const result = await base44.integrations.Core.UploadFile({ file });
        if (!result?.file_url) throw new Error("Fleet document upload did not return a file URL.");
        uploaded = {
          file_url: result.file_url,
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          file_size_bytes: file.size || 0,
        };
        setPendingUpload(uploaded);
      }

      const { data } = await base44.functions.invoke("fleetEquipmentDocumentAction", {
        action: "create",
        creation_key: dialog.creationKey,
        document: {
          equipment_id: equipment.id,
          title,
          document_type: form.document_type,
          document_date: form.document_date || null,
          expiration_date: form.expiration_date || null,
          notes: form.notes.trim(),
          ...uploaded,
        },
      });
      if (data?.error) throw new Error(data.error);
      const created = data?.document;
      if (!created?.id) throw new Error("Fleet document was not returned after save.");
      setDocuments(current => [created, ...current.filter(row => row.id !== created.id)]);
      setNotice(data?.reused ? "This Fleet document was already saved; the existing record was reused safely." : "Fleet document saved.");
      resetDialog();
    } catch (e) {
      setError(e?.message || "Unable to save Fleet document.");
    } finally {
      setSaving(false);
    }
  };

  const archiveOrRestore = async (document, action) => {
    setArchiving(true);
    setError("");
    setNotice("");
    try {
      const { data } = await base44.functions.invoke("fleetEquipmentDocumentAction", {
        action,
        id: document.id,
        expected_updated_date: document.updated_date || "",
      });
      if (data?.error) throw new Error(data.error);
      const updated = data?.document;
      if (!updated?.id) throw new Error("Fleet document was not returned after the archive action.");
      setDocuments(current => current.map(row => row.id === updated.id ? updated : row));
      setNotice(action === "archive" ? "Document archived. Its file and audit metadata were preserved." : "Document restored to the active vehicle file area.");
      setArchiveTarget(null);
    } catch (e) {
      setError(e?.message || "Unable to update Fleet document archive status.");
    } finally {
      setArchiving(false);
    }
  };

  return <div className="space-y-4">
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
      <div className="flex items-start gap-3"><ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-300 mt-0.5 shrink-0"/><div><div className="font-semibold text-indigo-900 dark:text-indigo-100">Private CCS Fleet files</div><p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">These documents are attached to the internal Fleet equipment record. They are not included in the anonymous issue-reporting page or the standalone mechanic portal.</p></div></div>
    </div>

    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div><h2 className="font-semibold text-gray-900 dark:text-slate-100">Documents & Files</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{activeCount} active · {archivedCount} archived</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowArchived(value => !value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700 text-sm inline-flex items-center gap-1.5">{showArchived ? <X className="w-4 h-4"/> : <Archive className="w-4 h-4"/>}{showArchived ? "Hide Archived" : "Show Archived"}</button>
        <button type="button" onClick={loadDocuments} disabled={loading} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700 text-sm inline-flex items-center gap-1.5 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}/>Refresh</button>
        {isAdmin && <button type="button" onClick={openCreate} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold inline-flex items-center gap-1.5"><Plus className="w-4 h-4"/>Add Document</button>}
      </div>
    </div>

    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
    {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div>}

    {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-gray-400"/></div> : visibleDocuments.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-gray-500 dark:border-slate-700 dark:bg-slate-900"><FileText className="w-8 h-8 mx-auto mb-2 text-gray-300"/><div className="font-medium">{showArchived ? "No Fleet documents have been saved for this asset." : "No active Fleet documents."}</div>{isAdmin && <button type="button" onClick={openCreate} className="mt-3 text-sm font-semibold text-indigo-600 dark:text-indigo-300">Add the first document</button>}</div> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
      {visibleDocuments.map(document => <DocumentCard key={document.id} document={document} isAdmin={isAdmin} onEdit={() => openEdit(document)} onArchive={() => setArchiveTarget(document)} onRestore={() => archiveOrRestore(document, "restore")} />)}
    </div>}

    {dialog && <DocumentDialog dialog={dialog} form={form} setForm={setForm} file={file} pendingUpload={pendingUpload} saving={saving} onChooseFile={chooseFile} onSubmit={submit} onClose={closeDialog} />}
    <FleetConfirmDialog
      open={!!archiveTarget}
      title={`Archive ${archiveTarget?.title || "Fleet document"}?`}
      description="The document will leave the active vehicle file area, but its file and Fleet audit metadata will be preserved. You can restore it later."
      confirmLabel="Archive Document"
      tone="warning"
      busy={archiving}
      onCancel={() => !archiving && setArchiveTarget(null)}
      onConfirm={() => archiveTarget && archiveOrRestore(archiveTarget, "archive")}
    />
  </div>;
}

function DocumentCard({ document, isAdmin, onEdit, onArchive, onRestore }) {
  const expiration = expirationState(document.expiration_date);
  const image = String(document.mime_type || "").startsWith("image/");
  const Icon = image ? FileImage : FileText;
  return <article className={`rounded-xl border bg-white dark:bg-slate-900 shadow-sm overflow-hidden ${document.is_archived ? "border-gray-300 opacity-75 dark:border-slate-700" : expiration?.tone === "danger" ? "border-red-300 dark:border-red-900" : expiration?.tone === "attention" ? "border-amber-300 dark:border-amber-900" : "border-gray-200 dark:border-slate-800"}`}>
    {image && <a href={document.file_url} target="_blank" rel="noreferrer" className="block h-36 bg-gray-100 dark:bg-slate-800 overflow-hidden"><img src={document.file_url} alt={document.title} className="w-full h-full object-cover"/></a>}
    <div className="p-4 space-y-3">
      <div className="flex items-start gap-3"><div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-300"/></div><div className="min-w-0 flex-1"><div className="font-semibold text-gray-900 dark:text-slate-100 line-clamp-2">{document.title}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{TYPE_LABELS[document.document_type] || "Other"}{document.is_archived ? " · Archived" : ""}</div></div></div>
      <div className="text-xs text-gray-500 dark:text-slate-400 space-y-1"><div className="truncate">{document.file_name}</div><div>{formatBytes(document.file_size_bytes)}</div>{document.document_date && <div>Document date: {formatDate(document.document_date)}</div>}{document.expiration_date && <div className={expiration?.tone === "danger" ? "font-semibold text-red-700 dark:text-red-300" : expiration?.tone === "attention" ? "font-semibold text-amber-700 dark:text-amber-300" : ""}>Expires: {formatDate(document.expiration_date)}{expiration ? ` · ${expiration.label}` : ""}</div>}</div>
      {document.notes && <div className="text-xs text-gray-600 dark:text-slate-300 line-clamp-3 whitespace-pre-wrap">{document.notes}</div>}
      <div className="text-[11px] text-gray-400">Added by {document.uploaded_by_name || document.uploaded_by_email || "CCS"}{document.created_date ? ` · ${new Date(document.created_date).toLocaleDateString()}` : ""}</div>
      <div className="pt-2 border-t border-gray-100 dark:border-slate-800 flex flex-wrap gap-2"><a href={document.file_url} target="_blank" rel="noreferrer" className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs font-semibold">Open File <ExternalLink className="w-3.5 h-3.5"/></a>{isAdmin && !document.is_archived && <button type="button" onClick={onEdit} className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold"><Pencil className="w-3.5 h-3.5"/>Edit</button>}{isAdmin && !document.is_archived && <button type="button" onClick={onArchive} className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-200 text-amber-700 dark:border-amber-900 dark:text-amber-300 px-3 py-2 text-xs font-semibold"><Archive className="w-3.5 h-3.5"/>Archive</button>}{isAdmin && document.is_archived && <button type="button" onClick={onRestore} className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300 px-3 py-2 text-xs font-semibold"><RotateCcw className="w-3.5 h-3.5"/>Restore</button>}</div>
    </div>
  </article>;
}

function DocumentDialog({ dialog, form, setForm, file, pendingUpload, saving, onChooseFile, onSubmit, onClose }) {
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/60 p-3 sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="fleet-document-title" className="w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 sm:px-5 py-4 dark:border-slate-800 dark:bg-slate-900"><div><h2 id="fleet-document-title" className="text-lg font-bold text-gray-900 dark:text-slate-100">{dialog.mode === "create" ? "Add Fleet Document" : "Edit Fleet Document"}</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Internal CCS Fleet file. Not shared with public reporting or mechanic access.</p></div><button type="button" onClick={onClose} disabled={saving} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-slate-800"><X className="w-5 h-5"/></button></div>
      <form onSubmit={onSubmit} className="p-4 sm:p-5 space-y-4">
        {dialog.mode === "create" && <div><label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1">File *</label><label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-center hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-800/40"><Upload className="w-6 h-6 text-indigo-500"/><span className="mt-2 text-sm font-semibold text-gray-800 dark:text-slate-200">{pendingUpload?.file_name || file?.name || "Choose a Fleet document"}</span><span className="mt-1 text-xs text-gray-400">PDF, image, Office, CSV or text · up to 20 MB</span><input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={onChooseFile} disabled={saving || !!pendingUpload}/></label>{pendingUpload && <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">Upload completed. A retry will reuse this same uploaded file instead of uploading another copy.</div>}</div>}
        <div className="grid sm:grid-cols-2 gap-4"><Field label="Title *"><input required value={form.title} onChange={event => set("title", event.target.value)} maxLength={200} className="field"/></Field><Field label="Document Type"><select value={form.document_type} onChange={event => set("document_type", event.target.value)} className="field">{DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Document Date"><input type="date" value={form.document_date} onChange={event => set("document_date", event.target.value)} className="field"/></Field><Field label="Expiration Date"><input type="date" value={form.expiration_date} onChange={event => set("expiration_date", event.target.value)} className="field"/></Field></div>
        <Field label="Notes"><textarea rows="4" value={form.notes} onChange={event => set("notes", event.target.value)} className="field resize-y" placeholder="Policy notes, inspection details, receipt context, document revision, etc."/></Field>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2"><button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700 disabled:opacity-50">Cancel</button><button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">{saving && <Loader2 className="w-4 h-4 animate-spin"/>}{dialog.mode === "create" ? "Save Document" : "Save Changes"}</button></div>
      </form>
      <style>{`.field{width:100%;border:1px solid rgb(209 213 219);border-radius:.5rem;padding:.55rem .7rem;background:white;color:inherit}.dark .field{background:rgb(15 23 42);border-color:rgb(51 65 85)}`}</style>
    </div>
  </div>;
}

function Field({ label, children }) { return <label className="block text-sm"><span className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1">{label}</span>{children}</label>; }
