import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2 } from "lucide-react";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

// Entities an admin may reasonably export for audits. Reads rely on each
// entity's normal access rules — anything blocked simply returns an error.
const EXPORTABLE = [
  { value: "AuthorizedEmail", label: "Users / authorized emails" },
  { value: "AutomationRule", label: "Automation rules" },
  { value: "GeneralTask", label: "General tasks" },
  { value: "TimeClockCorrectionRequest", label: "Time-clock correction requests" },
  { value: "EmailGroup", label: "Email groups" },
  { value: "GlobalSettings", label: "Global settings" },
];

const flattenValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
};

const toCsv = (rows) => {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r || {})))].filter((c) => c !== "__v").slice(0, 60);
  const lines = [cols.map(esc).join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => esc(flattenValue(row[c]))).join(","));
  }
  return lines.join(String.fromCharCode(10));
};

export default function DataExportPanel() {
  const [entityName, setEntityName] = useState("AuthorizedEmail");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const runExport = async () => {
    if (busy) return;
    setBusy(true); setMsg("");
    try {
      const rows = await loadAllEntityRows({ entity: staffEntities[entityName], sort: null, label: `${entityName} export` });
      if (!rows.length) { setMsg("No rows found for that entity."); setBusy(false); return; }
      const csv = toCsv(rows);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entityName}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`${rows.length} rows exported.`);
    } catch (e) {
      setMsg(e?.message || "Export failed — you may not have read access to that entity.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white/70 p-4" aria-label="Data export center">
      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <Download className="h-4 w-4 text-indigo-600" /> Data export center
      </h3>
      <p className="mt-1 text-xs text-gray-500">
        Download a CSV snapshot of admin-readable data for audits. List/object columns are exported as JSON text.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs font-medium text-gray-600" htmlFor="data-export-entity">Entity</label>
          <Select value={entityName} onValueChange={setEntityName}>
            <SelectTrigger id="data-export-entity" className="mt-1 h-9 w-64 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXPORTABLE.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={runExport} className="h-9 bg-white">
          {busy ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Exporting…</> : "Export CSV"}
        </Button>
      </div>
      {msg && <p className="mt-2 text-xs text-gray-600">{msg}</p>}
    </section>
  );
}
