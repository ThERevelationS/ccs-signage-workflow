import { useState } from "react";
import ReinforcementDraftField from "./ReinforcementDraftField";

const PAGE = 20;
export const uuidOk = () => typeof globalThis.crypto?.randomUUID === "function";
export const newRowId = (prefix) => `${prefix}_${globalThis.crypto.randomUUID()}`;

const isValidRow = (r) => r && typeof r === "object" && !Array.isArray(r);
const strOrInvalid = (v) => (v === null || v === undefined || v === "" ? "" : typeof v === "string" ? v : "__invalid__");

// Generic raw-draft row list: paginated at 20, never truncates stored data.
export default function ReinforcementDraftList({ title, listKey, rows, fields, onReplaceList, onAdd, onDelete, onFieldChange, disabled, addLabel = "Add", maxRows }) {
  const [page, setPage] = useState(0);

  if (rows !== undefined && !Array.isArray(rows)) {
    return (
      <div data-list={listKey} className="rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800">
        {title} list malformed.{" "}
        <button type="button" disabled={disabled} onClick={onReplaceList} className="underline disabled:text-gray-400">Replace List</button>
      </div>
    );
  }

  const safe = Array.isArray(rows) ? rows : [];
  const pages = Math.max(1, Math.ceil(safe.length / PAGE));
  const pageIdx = Math.min(page, pages - 1);
  const shown = safe.slice(pageIdx * PAGE, pageIdx * PAGE + PAGE);
  const atCap = maxRows != null && safe.length >= maxRows;
  const canAdd = !disabled && !atCap && uuidOk();

  return (
    <div data-list={listKey} className="rounded-sm border border-gray-200 min-w-0 max-w-full">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-2 py-1">
        <p className="text-[12px] font-semibold text-gray-700 break-words min-w-0">{title}</p>
        <button type="button" data-add={listKey} disabled={!canAdd} onClick={onAdd} className="shrink-0 text-[12px] text-amber-700 hover:underline disabled:text-gray-300">
          {addLabel}
        </button>
      </div>
      {!uuidOk() && <p className="px-2 py-1 text-[11px] text-amber-700">Secure row IDs unavailable in this browser; rows cannot be added.</p>}
      {atCap && <p className="px-2 py-1 text-[11px] text-gray-500">Row limit reached ({maxRows}).</p>}
      <div className="divide-y divide-gray-50">
        {shown.map((row, i) => {
          const idx = pageIdx * PAGE + i;
          const valid = isValidRow(row);
          const idStr = valid && typeof row.id === "string" ? row.id : null;
          if (!valid) {
            return (
              <div data-row={`${listKey}:${idx}`} key={`bad-${idx}`} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-[12px] text-red-700">
                <span>Malformed row - delete to repair.</span>
                <button type="button" data-del={`${listKey}:${idx}`} disabled={disabled} onClick={() => onDelete(idx)} className="text-[12px] text-red-600 hover:underline disabled:text-gray-300">Delete</button>
              </div>
            );
          }
          return (
            <div data-row={`${listKey}:${idx}`} data-row-id={idStr ?? undefined} key={`${idStr ?? "invalid"}:${idx}`} className="flex flex-wrap items-end gap-2 px-2 py-1.5">
              {idStr && <span className="w-full max-w-full break-words text-[10px] text-gray-400">{idStr}</span>}
              {!idStr && <span className="w-full max-w-full break-words text-[10px] text-red-600">Invalid or missing row id</span>}
              {fields.map(({ key, label, options }) =>
                options ? (
                  <label key={key} className="block min-w-0">
                    <span className="text-[12px] text-gray-600">{label}</span>
                    <select
                      value={strOrInvalid(row[key])}
                      disabled={disabled}
                      onChange={(e) => onFieldChange(idx, key, e.target.value)}
                      className="mt-0.5 block max-w-full rounded-sm border border-gray-300 px-1.5 py-1 text-[13px] disabled:bg-gray-50"
                    >
                      {options.map((o, oi) => <option key={`${o.id ?? o}-${oi}`} value={o.id ?? o}>{o.label ?? o}</option>)}
                      {row[key] !== undefined && row[key] !== null && typeof row[key] !== "string" && (
                        <option value="__invalid__" disabled>Invalid value</option>
                      )}
                      {typeof row[key] === "string" && row[key] !== "" && !options.some(o => (o.id ?? o) === row[key]) && (
                        <option value={row[key]} disabled>Missing: {row[key]}</option>
                      )}
                    </select>
                  </label>
                ) : (
                  <ReinforcementDraftField key={key} label={label} value={row[key]} disabled={disabled} onChange={(v) => onFieldChange(idx, key, v)} />
                )
              )}
              <button type="button" data-del={`${listKey}:${idx}`} disabled={disabled} onClick={() => onDelete(idx)} className="text-[12px] text-red-600 hover:underline disabled:text-gray-300">
                Delete
              </button>
            </div>
          );
        })}
        {!shown.length && <p className="px-2 py-2 text-[12px] text-gray-400">None.</p>}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-2 py-1 text-[12px] text-gray-500">
          <button type="button" data-page="prev" disabled={disabled || pageIdx === 0} onClick={() => setPage(pageIdx - 1)} className="disabled:text-gray-300">Prev</button>
          <span>Page {pageIdx + 1} / {pages}</span>
          <button type="button" data-page="next" disabled={disabled || pageIdx >= pages - 1} onClick={() => setPage(pageIdx + 1)} className="disabled:text-gray-300">Next</button>
        </div>
      )}
    </div>
  );
}
