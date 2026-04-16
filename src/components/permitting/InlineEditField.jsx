import React, { useState, useEffect, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Compact inline-editable field for the permit client header row.
 * - Click to edit (text input) or pick from dropdown (when `options` provided).
 * - Keeps the row short: text is truncated until clicked.
 */
export default function InlineEditField({
  value,
  placeholder = "—",
  onSave,
  options,
  disabled,
  maxWidth = 180,
  title,
  icon,
  label,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value || ""); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if ((draft || "") !== (value || "")) onSave(draft || "");
  };

  // Dropdown mode
  if (options) {
    return (
      <div
        className="flex items-center gap-1 text-[11px] flex-shrink-0 min-w-0"
        style={{ maxWidth }}
        onClick={e => e.stopPropagation()}
      >
        {icon}
        {label && <span className="text-gray-500">{label}</span>}
        <Select
          value={value || ""}
          onValueChange={(v) => !disabled && onSave(v === "__clear__" ? "" : v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-6 text-[11px] px-1.5 border-none shadow-none bg-transparent hover:bg-white/60 focus:bg-white w-auto min-w-0 gap-1 [&>svg]:ml-0.5 [&>svg]:opacity-50">
            <SelectValue placeholder={placeholder}>
              <span className="truncate" title={value || placeholder}>
                {value || <span className="text-gray-400">{placeholder}</span>}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__clear__"><span className="text-gray-400 italic">— clear —</span></SelectItem>
            {options.map(opt => (
              <SelectItem key={opt.value || opt} value={opt.value || opt}>
                {opt.label || opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Text input mode
  return (
    <div
      className="flex items-center gap-1 text-[11px] min-w-0"
      style={{ maxWidth }}
      onClick={e => e.stopPropagation()}
    >
      {icon}
      {label && <span className="text-gray-500 flex-shrink-0">{label}</span>}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(value || ""); setEditing(false); }
          }}
          className="h-6 text-[11px] px-1.5 border border-purple-300 rounded bg-white outline-none focus:ring-1 focus:ring-purple-400 min-w-0 flex-1"
        />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setEditing(true)}
          className="text-left truncate text-gray-700 font-medium px-1 py-0.5 rounded hover:bg-white/80 hover:ring-1 hover:ring-purple-200 disabled:cursor-not-allowed min-w-0 flex-1"
          title={title || value || placeholder}
        >
          {value || <span className="text-gray-400 font-normal">{placeholder}</span>}
        </button>
      )}
    </div>
  );
}