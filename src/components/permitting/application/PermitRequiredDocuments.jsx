import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { COMMON_DOCUMENTS, getRequiredDocuments, newDocument } from "./applicationTracking";

export default function PermitRequiredDocuments({ lineItem, disabled, onChange }) {
  const [draft, setDraft] = useState("");
  const documents = getRequiredDocuments(lineItem);
  const existing = new Set(documents.map((doc) => doc.name.toLowerCase()));
  const suggestions = COMMON_DOCUMENTS.filter((name) => !existing.has(name.toLowerCase()));

  const add = (name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed || existing.has(trimmed.toLowerCase())) return;
    onChange([...documents, newDocument(trimmed)]);
    setDraft("");
  };
  const toggle = (id) => onChange(documents.map((doc) => (doc.id === id ? { ...doc, done: !doc.done } : doc)));
  const remove = (id) => onChange(documents.filter((doc) => doc.id !== id));

  return (
    <div className="min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Documents this office needs</span>
      {documents.length > 0 && (
        <ul className="mb-1.5 space-y-1">
          {documents.map((doc) => (
            <li key={doc.id} className="flex min-h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-2">
              <Checkbox checked={!!doc.done} disabled={disabled} onCheckedChange={() => toggle(doc.id)} aria-label={`${doc.name} ready`} />
              <span className={`min-w-0 flex-1 truncate text-xs ${doc.done ? "text-slate-400 line-through" : "text-slate-800"}`}>{doc.name}</span>
              {!disabled && (
                <button type="button" onClick={() => remove(doc.id)} className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${doc.name}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <>
          <div className="flex gap-1.5">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") add(draft); }}
              placeholder="Add a document (e.g. Survey)"
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs"
            />
            <button type="button" onClick={() => add(draft)} disabled={!draft.trim()} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {suggestions.map((name) => (
                <button key={name} type="button" onClick={() => add(name)} className="min-h-7 rounded-full border border-dashed border-slate-300 px-2 text-[10px] text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                  + {name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}