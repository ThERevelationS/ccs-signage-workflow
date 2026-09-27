import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CalendarDays, Loader2, RefreshCw } from "lucide-react";

const GROUPS = [
  { key: "missing_dates", label: "Missing Base44 dates", note: "Smartsheet has a valid date, but the linked Base44 Order is blank." },
  { key: "different_dates", label: "Different dates", note: "Both sides contain dates that disagree. No automatic overwrite is proposed." },
  { key: "invalid_values", label: "Unrecognized values", note: "The source value could not be safely translated; resolve these before any pull." },
  { key: "text_choices", label: "Text choices and notes", note: "Date Needed and Date Ordered may contain scheduling notes such as ASAP or N/A. Date Received may contain choices such as Stock or In Stock. These are preserved separately from calendar dates." },
  { key: "ambiguous_links", label: "Duplicate permanent links", note: "Multiple Base44 Orders refer to one Smartsheet row; never choose one by row position or name." },
];
const count = value => (Number(value) || 0).toLocaleString();
const FIELD_LABELS = { date_needed: "Date Needed", date_ordered: "Date Ordered", date_received: "Date Received" };

export default function OrderDateParityReview({ open, onOpenChange, sessionToken }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("missing_dates");
  const active = useRef(null);
  const serial = useRef(0);

  const load = useCallback(async () => {
    if (active.current !== null) return;
    const requestId = ++serial.current;
    active.current = requestId;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      if (!sessionToken) throw new Error("An active administrator session is required.");
      const response = await base44.functions.invoke("smartsheetSyncAction", {
        action: "audit_order_dates", session_token: sessionToken,
      });
      const data = response?.data || response;
      if (!data?.success || data.read_only !== true || data.sheet_download_verified !== true ||
          !Array.isArray(data.date_columns) || data.date_columns.length !== 3) {
        throw new Error(data?.error || "A complete, read-only Smartsheet date comparison could not be verified.");
      }
      if (active.current !== requestId) return;
      setReport(data);
      setCategory(GROUPS.find(group => (data.samples?.[group.key] || []).length)?.key || "missing_dates");
    } catch (reason) {
      if (active.current !== requestId) return;
      setError(reason?.response?.data?.error || reason?.data?.error || reason?.message ||
        "Date evidence is unavailable. No partial comparison is displayed.");
    } finally {
      if (active.current === requestId) {
        active.current = null;
        setLoading(false);
      }
    }
  }, [sessionToken]);

  useEffect(() => {
    if (open) load();
    else {
      active.current = null;
      setReport(null);
      setError("");
      setLoading(false);
    }
  }, [open, load]);

  const selected = GROUPS.find(group => group.key === category) || GROUPS[0];
  const records = report?.samples?.[selected.key] || [];
  const totals = report?.counts || {};
  const totalTextChoices = Object.values(report?.by_field || {})
    .reduce((sum, field) => sum + (Number(field?.text_choices) || 0), 0);
  const blockedByTranslation = (Number(totals.invalid_date_values) || 0) > 0 ||
    (Number(totals.duplicate_base44_links) || 0) > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="clay-card border-none w-[calc(100vw-1rem)] max-w-5xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-800">
            <CalendarDays className="h-5 w-5 shrink-0 text-purple-600" />
            Smartsheet date comparison
          </DialogTitle>
          <DialogDescription className="text-left">
            Admin-only, read-only comparison using permanent Order and Smartsheet row IDs.
            No sync is enabled, no missing dates are applied, and no records are changed by this review.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-800">
            Evidence only — no production writes
          </span>
          <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading || !sessionToken}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {loading ? "Comparing..." : "Refresh comparison"}
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {loading && <p role="status" className="rounded-xl bg-purple-50 p-4 text-sm text-gray-700">
            Downloading the complete Order Request sheet and comparing permanent row IDs...
          </p>}
          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{error} Nothing was applied.</span>
          </div>}
          {report && <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["Matched rows", totals.matched],
                ["Missing Base44 dates", totals.smartsheet_date_missing_in_base44],
                ["Different dates", totals.different_dates],
                ["Text choices / notes", totalTextChoices],
                ["Invalid date values", totals.invalid_date_values],
              ].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-3">
                <p className="text-xs text-gray-600">{label}</p>
                <p className="text-xl font-bold tabular-nums">{count(value)}</p>
              </div>)}
            </div>
            <p className="text-xs text-gray-600">
              Verified sheet {report.sheet_id}, version {report.sheet_version} · {count(report.total_smartsheet_rows)} rows downloaded.
              {report.sync_global_enabled ? " Global sync is enabled." : " Global sync is OFF."}
              {report.sync_observation_mode ? " Observation mode is ON." : " Observation mode is OFF."}
            </p>
            <div className={`rounded-xl border p-3 text-sm ${blockedByTranslation ? "border-amber-300 bg-amber-50 text-amber-950" : "border-green-200 bg-green-50 text-green-950"}`}>
              {blockedByTranslation
                ? `${count(totals.invalid_date_values)} untranslatable date cells and ${count(totals.duplicate_base44_links)} duplicate permanent row links block a full-sheet Order pull. Review the examples below; no data was changed.`
                : "Date translation and permanent row matching passed this read-only comparison. A verified recoverable backup and deployed-code check are still required before a full-sheet pull."}
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[625px] text-left text-xs">
                <thead className="bg-gray-50 text-gray-700"><tr>
                  <th className="p-2">Mapped column</th><th className="p-2">Smartsheet type / ID</th>
                  <th className="p-2 text-right">Source dates</th><th className="p-2 text-right">Missing in Base44</th>
                  <th className="p-2 text-right">Text / notes</th><th className="p-2 text-right">Invalid</th>
                </tr></thead>
                <tbody>{report.date_columns.map(column => {
                  const field = report.by_field?.[column.field] || {};
                  return <tr className="border-t" key={column.field}>
                    <td className="p-2 font-medium">{FIELD_LABELS[column.field] || column.field}</td>
                    <td className="p-2">{column.title} · {column.type}<br/><span className="break-all text-gray-500">{column.column_id}</span></td>
                    <td className="p-2 text-right tabular-nums">{count(field.smartsheet_dates)}</td>
                    <td className="p-2 text-right tabular-nums">{count(field.missing_base44)}</td>
                    <td className="p-2 text-right tabular-nums">{count(field.text_choices)}</td>
                    <td className="p-2 text-right tabular-nums">{count(field.invalid)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <p className="text-xs text-gray-600">
              {count(totals.unlinked_smartsheet_rows)} Smartsheet rows have no matching active Base44 link;
              {" "}{count(totals.duplicate_base44_links)} rows have duplicate links;
              {" "}{count(totals.base44_date_missing_in_smartsheet)} Base44 dates are absent in Smartsheet.
              None will be deleted or silently cleared.
            </p>
            <div className="space-y-2">
              <label htmlFor="order-date-evidence-category" className="block text-sm font-semibold">Inspect evidence</label>
              <select id="order-date-evidence-category" className="min-h-11 w-full rounded-lg border bg-white p-2 text-sm"
                value={category} onChange={event => setCategory(event.target.value)}>
                {GROUPS.map(group => <option key={group.key} value={group.key}>{group.label}</option>)}
              </select>
              <p className="text-sm text-gray-600">{selected.note} Up to {count(report.sample_limit)} examples are shown per category.</p>
              {records.length === 0
                ? <p className="rounded-xl border p-3 text-sm text-gray-600">No examples in this category.</p>
                : <div className="space-y-2">{records.map((item, index) =>
                    <div key={String(item.row_id) + "-" + index} className="rounded-xl border bg-white p-3 text-xs">
                      <p className="font-semibold">Smartsheet row ID: <span className="break-all">{item.row_id}</span></p>
                      {item.base44_order_id && <p className="break-all">Base44 Order ID: {item.base44_order_id}</p>}
                      {item.base44_order_ids && <p className="break-all">Conflicting Base44 IDs: {item.base44_order_ids.join(", ")}</p>}
                      {item.field && <p>Field: {FIELD_LABELS[item.field] || item.field}</p>}
                      {item.smartsheet_date && <p>Smartsheet date: {item.smartsheet_date}</p>}
                      {item.base44_date && <p>Base44 date: {item.base44_date}</p>}
                      {item.smartsheet_value && <p>Smartsheet text: {item.smartsheet_value}</p>}
                      {item.base44_value && <p>Base44 date / text: {item.base44_value}</p>}
                      {item.raw && <p className="break-words">Unrecognized value: {item.raw}</p>}
                      {item.reason && <p className="text-red-700">{item.reason}</p>}
                    </div>)}</div>}
            </div>
            <p className="text-xs text-amber-800">
              A complete read-only comparison is not a recoverable backup or approval to run sync.
              Dates will be applied only after the source values, duplicate links, and backup are verified.
            </p>
          </>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
