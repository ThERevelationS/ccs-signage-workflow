import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, History, Loader2, RefreshCw } from "lucide-react";
import { staffEntities } from "@/components/staff/staffEntities";

const CellHistory = staffEntities.CellHistory;

const FIELD_LABELS = {
  row_name: "Line name",
  locality_id: "Office link",
  locality_name: "Town / office",
  office_type: "Kind of office",
  office_types: "Kinds of office",
  assigned_to: "Owner",
  status: "Status",
  submitted_date: "Sent",
  next_followup_date: "Check back",
  permit_received_date: "Permit came in",
  application_reference_number: "Application #",
  permit_number: "Permit #",
  approval_date: "Approved",
  expiration_date: "Expires",
  jurisdiction_fee_amount: "Office fee",
  jurisdiction_fee_status: "Fee status",
  jurisdiction_fee_paid_date: "Fee paid",
  correction_status: "Fix status",
  corrections_received_date: "Fixes came in",
  resubmitted_date: "Sent again",
  closeout_status: "Inspection / wrap-up",
  inspection_date: "Inspected",
  closeout_date: "Wrapped up",
};

const DATE_FIELDS = new Set([
  "submitted_date",
  "next_followup_date",
  "permit_received_date",
  "approval_date",
  "expiration_date",
  "jurisdiction_fee_paid_date",
  "corrections_received_date",
  "resubmitted_date",
  "inspection_date",
  "closeout_date",
]);

const STATUS_FIELDS = new Set([
  "status",
  "jurisdiction_fee_status",
  "correction_status",
  "closeout_status",
]);

function titleCaseStatus(value) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayValue(value, fieldName) {
  const text = String(value ?? "").trim();
  if (!text) return "—";

  if (fieldName === "jurisdiction_fee_amount") {
    const amount = Number(text);
    if (Number.isFinite(amount)) {
      return amount.toLocaleString(undefined, { style: "currency", currency: "USD" });
    }
  }

  if (DATE_FIELDS.has(fieldName)) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (match) {
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      if (!Number.isNaN(date.getTime())) return format(date, "MMM d, yyyy");
    }
  }

  if (STATUS_FIELDS.has(fieldName)) return titleCaseStatus(text);
  if (fieldName === "office_types") return text.split(",").map((item) => item.trim()).filter(Boolean).join(", ");
  return text;
}

function displayTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "MMM d, yyyy h:mm a");
}

export default function PermitLineHistory({ lineItemId, lineUpdatedDate = "" }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const lastLoadedLineVersionRef = useRef("");

  const loadHistory = useCallback(async () => {
    if (!lineItemId || loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await CellHistory.filter(
        { entity_type: "PermitLineItem", entity_id: lineItemId },
        "-created_date",
        25,
      );
      setRows(Array.isArray(result) ? result : []);
      setLoaded(true);
    } catch (loadError) {
      console.error("Permit line history could not be loaded:", loadError);
      setRows([]);
      setLoaded(true);
      setError(loadError?.message || "Couldn't load the changes.");
    } finally {
      lastLoadedLineVersionRef.current = String(lineUpdatedDate || "");
      setLoading(false);
    }
  }, [lineItemId, lineUpdatedDate, loading]);

  useEffect(() => {
    const currentVersion = String(lineUpdatedDate || "");
    if (!open || !loaded || loading || !currentVersion) return;
    if (currentVersion === lastLoadedLineVersionRef.current) return;
    loadHistory();
  }, [open, loaded, loading, lineUpdatedDate, loadHistory]);

  const toggle = async () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && !loaded) await loadHistory();
  };

  return (
    <div className="mt-2 border-t border-slate-200 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-slate-600 hover:bg-white hover:text-slate-900"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <History className="h-3.5 w-3.5" /> Recent changes
        </button>
        {open && loaded && (
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[10px]" onClick={loadHistory} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-md border border-slate-200 bg-white/80 p-2">
          {loading && !loaded ? (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading recent changes…</div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          ) : rows.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-400">No changes saved yet. Edits to dates and status will show up here.</div>
          ) : (
            <div>
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {rows.map((entry) => (
                <div key={entry.id} className="rounded-md border border-slate-100 bg-slate-50/70 px-2.5 py-2 text-[11px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="font-semibold text-slate-700">{FIELD_LABELS[entry.field_name] || entry.field_name || "Permit field"}</span>
                    <span className="text-[10px] text-slate-400">{displayTimestamp(entry.created_date)}</span>
                  </div>
                  <div className="mt-0.5 break-words text-slate-600">
                    <span className="text-slate-400 line-through">{displayValue(entry.old_value, entry.field_name)}</span>
                    <span className="mx-1.5 text-slate-400">→</span>
                    <span className="font-medium text-slate-700">{displayValue(entry.new_value, entry.field_name)}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">{entry.changed_by_name || entry.changed_by_email || "Unknown user"}</div>
                </div>
              ))}
              </div>
              {rows.length >= 25 && (
                <div className="pt-2 text-center text-[10px] text-slate-400">Showing the 25 newest changes.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}