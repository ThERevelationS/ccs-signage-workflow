import React, { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";

// Export/import the page's `values` map as JSON. Import keeps only keys that
// exist in `allowedKeys` (the page's known setting names) so unrelated or
// misspelled keys are dropped instead of writing bogus Settings rows.
export default function SettingsTransferBar({ values = {}, allowedKeys = [], fileName = "settings", onImport }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(values, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file) => {
    if (!file || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const parsed = JSON.parse(await file.text());
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("The file must contain a JSON object of setting names to values.");
      }
      const allowed = new Set(allowedKeys);
      const imported = {};
      let dropped = 0;
      for (const [key, value] of Object.entries(parsed)) {
        if (allowed.size && !allowed.has(key)) { dropped++; continue; }
        imported[key] = value;
      }
      if (!Object.keys(imported).length) throw new Error("No recognized setting keys were found in the file.");
      onImport?.(imported);
      setMsg(`Imported ${Object.keys(imported).length} setting${Object.keys(imported).length === 1 ? "" : "s"}${dropped ? ` (${dropped} unrecognized key${dropped === 1 ? "" : "s"} skipped)` : ""}.`);
    } catch (e) {
      setMsg(e?.message || "The JSON file could not be imported.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={exportJson} title="Download this page's settings as JSON"
        className="h-8 px-2.5 inline-flex items-center gap-1 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 hover:bg-gray-50">
        <Download className="w-3.5 h-3.5" /> Export
      </button>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} title="Import settings from a JSON export"
        className="h-8 px-2.5 inline-flex items-center gap-1 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
        <Upload className="w-3.5 h-3.5" /> {busy ? "Importing…" : "Import"}
      </button>
      <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => importJson(e.target.files?.[0])} />
      {msg && <span className="text-[10px] text-gray-500 max-w-[220px] truncate" title={msg}>{msg}</span>}
    </div>
  );
}
