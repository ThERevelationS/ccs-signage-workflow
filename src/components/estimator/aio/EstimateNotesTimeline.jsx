import React, { useState } from "react";
import { Plus, StickyNote } from "lucide-react";
import { useAuth } from "@/components/auth/EmailGate";

const fmt = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

// Append-only estimate note timeline. Entries are {text, by, at} objects on
// estimate.notes_log — the single `notes` field stays the freeform scratch
// pad. Entries are never edited or deleted so the timeline stays trustworthy.
export default function EstimateNotesTimeline({ estimate, onChange, readOnly = false }) {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const log = Array.isArray(estimate?.notes_log) ? estimate.notes_log : [];

  const add = () => {
    const text = draft.trim();
    if (!text || readOnly) return;
    const entry = { text, by: user?.email || user?.full_name || "unknown", at: new Date().toISOString() };
    onChange?.({ notes_log: [...log, entry] });
    setDraft("");
  };

  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <StickyNote className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-600">Notes timeline</span>
        <span className="text-[10px] text-gray-400">{log.length} {log.length === 1 ? "entry" : "entries"}</span>
      </div>
      {log.length > 0 && (
        <div className="max-h-44 overflow-y-auto px-3 py-2 space-y-1.5">
          {[...log].reverse().map((entry, index) => (
            <div key={`${entry.at}-${index}`} className="text-[11px] leading-snug">
              <span className="text-gray-800 whitespace-pre-wrap">{entry.text}</span>
              <span className="block text-[9px] text-gray-400">{entry.by || "unknown"} · {fmt(entry.at)}</span>
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-t border-gray-100">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Add a note to the timeline…"
            className="flex-1 h-7 px-2 border border-gray-300 rounded text-[11px] focus:outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="h-7 px-2.5 rounded bg-emerald-700 text-white text-[11px] font-bold hover:bg-emerald-800 disabled:opacity-40 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
      )}
    </div>
  );
}
