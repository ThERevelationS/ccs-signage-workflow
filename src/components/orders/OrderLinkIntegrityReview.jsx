import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Link2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

const CATEGORIES = [
  { key: "base44_unlinked", label: "Base44 Orders without a row link", note: "Active Base44 Orders with no permanent Smartsheet row ID. They are never matched by customer name, description or row position." },
  { key: "unlinked_smartsheet_row", label: "Smartsheet rows without an active Order link", note: "Permanent Smartsheet rows with no active Base44 Order linked to that row ID. Display fields are evidence only; no automatic match is proposed." },
  { key: "linked_row_missing_remote", label: "Linked rows missing from Smartsheet", note: "Base44 has a permanent link, but that exact row ID was absent from the complete verified Order Request sheet download. Sorting or moving a row does not change its ID; deleting and recreating it does. Never relink by customer, description or visual row position." },
  { key: "duplicate_base44_row_link", label: "Duplicate Base44 row links", note: "Multiple active Base44 Orders point to the same permanent Smartsheet row. Sync must fail closed until reviewed." },
  { key: "wrong_sheet_link", label: "Wrong-sheet links", note: "The Order has a row ID but its stored sheet ID is not the configured Order Request sheet." },
  { key: "invalid_base44_row_id", label: "Malformed Base44 row IDs", note: "The stored row identity is not a valid permanent numeric Smartsheet row ID." },
];
const number = value => (Number(value) || 0).toLocaleString();

function RecordCard({ item, category }) {
  if (category === "duplicate_base44_row_link") {
    return <div className="rounded-xl border bg-white p-3 text-xs">
      <p className="font-semibold">Smartsheet row ID: <span className="break-all">{item.row_id}</span></p>
      <p className="text-gray-600">Remote row present: {item.remote_row_present ? "Yes" : "No"}</p>
      <div className="mt-2 space-y-1">
        {(item.orders || []).map(order => <div key={order.base44_order_id} className="rounded-lg bg-gray-50 p-2">
          <p className="font-medium">{order.customer_name || "Unnamed Order"}</p>
          <p className="break-words text-gray-500">{order.description || "No description"}</p>
          <p className="break-all text-gray-500">Base44 Order ID: {order.base44_order_id}</p>
        </div>)}
      </div>
    </div>;
  }

  if (category === "unlinked_smartsheet_row") {
    const evidenceLabel = item.evidence_kind === "blank_or_placeholder" ? "Blank / placeholder"
      : item.evidence_kind === "duplicate_looking_historical" ? "Duplicate-looking historical"
        : item.evidence_kind === "sparse_unlinked_row" ? "Sparse unlinked row"
          : "Populated unlinked Order";
    return <div className="rounded-xl border bg-white p-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold">Smartsheet row ID: <span className="break-all">{item.row_id}</span></p>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700">{evidenceLabel}</span>
      </div>
      {item.row_number && <p className="text-gray-500">Current visual row: {item.row_number} (display only, never used for matching)</p>}
      <p className="mt-1 font-medium">{item.customer_name || "Customer blank"}</p>
      <p className="break-words text-gray-500">{item.description || "Description blank"}</p>
      <p className="text-gray-500">{item.request_type || "Request type blank"}{item.quantity ? " · Qty " + item.quantity : ""}</p>
      {item.evidence_reason && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-slate-700">{item.evidence_reason}</p>}
      {item.evidence_kind === "duplicate_looking_historical" && item.candidate_links?.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-950">
          <p className="font-semibold">Visible-data duplicate hint only</p>
          <p className="mt-0.5">These already-linked Orders look the same in the downloaded identity fields. They are not proposed links.</p>
          <div className="mt-1 space-y-1">
            {item.candidate_links.map(candidate => <p key={candidate.base44_order_id} className="break-all">
              Base44 {candidate.base44_order_id} → Smartsheet row {candidate.linked_smartsheet_row_id}
            </p>)}
          </div>
        </div>
      )}
    </div>;
  }

  return <div className="rounded-xl border bg-white p-3 text-xs">
    <p className="font-semibold">{item.customer_name || "Unnamed Order"}</p>
    <p className="break-words text-gray-500">{item.description || "No description"}</p>
    <p className="mt-1 break-all">Base44 Order ID: {item.base44_order_id}</p>
    <p className="break-all">Stored sheet / row: {item.smartsheet_sheet_id || "—"} / {item.smartsheet_row_id || "—"}</p>
    {item.status && <p>Status: {item.status}</p>}
    {category === "linked_row_missing_remote" && (
      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-red-900">
        <p className="font-semibold">Permanent row ID missing</p>
        <p>The Base44 link must stay unchanged until permanent-ID evidence is reviewed. A replacement row with matching visible values is a different Smartsheet row.</p>
      </div>
    )}
    {item.review_hint === "likely_historical_test_artifact" && (
      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">
        <p className="font-semibold">Likely historical test artifact</p>
        <p>{item.review_hint_reason}</p>
      </div>
    )}
    {item.pending_local_sync && <p className="font-medium text-amber-800">Waiting for Save & Sync</p>}
    {item.create_attempt_status && <p>Create marker: {item.create_attempt_status}</p>}
  </div>;
}

export default function OrderLinkIntegrityReview({ open, onOpenChange, sessionToken }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("base44_unlinked");
  const [historicalRowIds, setHistoricalRowIds] = useState("");
  const [historicalReport, setHistoricalReport] = useState(null);
  const [historicalError, setHistoricalError] = useState("");
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const requestRef = useRef(0);
  const activeRef = useRef(null);

  const load = useCallback(async () => {
    if (activeRef.current !== null) return;
    const requestId = ++requestRef.current;
    activeRef.current = requestId;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      if (!sessionToken) throw new Error("An active administrator session is required.");
      const response = await base44.functions.invoke("smartsheetSyncAction", {
        action: "audit_order_link_integrity",
        session_token: sessionToken,
      });
      const data = response?.data || response;
      if (!data?.success || data.read_only !== true || data.sheet_download_verified !== true ||
          data.matching_strategy !== "permanent_sheet_and_row_ids_only") {
        throw new Error(data?.error || "A complete permanent-link audit could not be verified.");
      }
      if (activeRef.current !== requestId) return;
      setReport(data);
      const first = CATEGORIES.find(item => {
        const key = item.key === "duplicate_base44_row_link" ? "duplicate_base44_row_ids" :
          item.key === "unlinked_smartsheet_row" ? "unlinked_smartsheet_rows" : item.key;
        return Number(data.counts?.[key]) > 0;
      });
      setCategory(first?.key || "base44_unlinked");
    } catch (reason) {
      if (activeRef.current !== requestId) return;
      setError(reason?.response?.data?.error || reason?.data?.error || reason?.message ||
        "The permanent-link audit could not be completed.");
    } finally {
      if (activeRef.current === requestId) {
        activeRef.current = null;
        setLoading(false);
      }
    }
  }, [sessionToken]);

  const auditHistoricalImportRows = useCallback(async () => {
    if (historicalLoading) return;
    setHistoricalError("");
    setHistoricalReport(null);
    const rowIds = historicalRowIds.split(/[\\s,;]+/).map(value => value.trim()).filter(Boolean);
    if (rowIds.length < 1 || rowIds.length > 25 || rowIds.some(value => !/^\\d+$/.test(value)) ||
        new Set(rowIds).size !== rowIds.length) {
      setHistoricalError("Enter 1–25 unique positive numeric Smartsheet row IDs.");
      return;
    }
    setHistoricalLoading(true);
    try {
      if (!sessionToken) throw new Error("An active administrator session is required.");
      const response = await base44.functions.invoke("smartsheetSyncAction", {
        action: "audit_order_import_sync_evidence",
        session_token: sessionToken,
        row_ids: rowIds,
      });
      const data = response?.data || response;
      if (!data?.success || data.read_only !== true || data.writes_attempted !== false ||
          data.local_readback_verified !== true || data.rows?.length !== rowIds.length) {
        throw new Error(data?.error || "The historical import evidence check could not be verified.");
      }
      setHistoricalReport(data);
    } catch (reason) {
      setHistoricalError(reason?.response?.data?.error || reason?.data?.error || reason?.message ||
        "The historical import evidence check failed.");
    } finally {
      setHistoricalLoading(false);
    }
  }, [historicalLoading, historicalRowIds, sessionToken]);

  useEffect(() => {
    if (open) load();
    else {
      activeRef.current = null;
      setLoading(false);
      setError("");
      setReport(null);
      setHistoricalReport(null);
      setHistoricalError("");
      setHistoricalLoading(false);
    }
  }, [open, load]);

  const counts = report?.counts || {};
  const selected = CATEGORIES.find(item => item.key === category) || CATEGORIES[0];
  const records = report?.records_by_category?.[selected.key] || [];
  const categoryCount = category === "duplicate_base44_row_link" ? counts.duplicate_base44_row_ids
    : category === "unlinked_smartsheet_row" ? counts.unlinked_smartsheet_rows
      : counts[category];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="clay-card border-none w-[calc(100vw-1rem)] max-w-5xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-800">
            <Link2 className="h-5 w-5 shrink-0 text-purple-600" />
            Order permanent-link integrity
          </DialogTitle>
          <DialogDescription className="text-left">
            Admin-only, read-only comparison of active Base44 Orders against the complete configured Order Request sheet.
            Matching uses permanent sheet and row IDs only. Names, descriptions and visual row numbers are never used to repair links.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-800">
            Evidence only — no links or Orders are changed
          </span>
          <Button type="button" size="sm" variant="outline" onClick={load} disabled={loading || !sessionToken}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {loading ? "Checking..." : "Refresh integrity audit"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {loading && <div role="status" className="flex items-center gap-3 rounded-xl bg-purple-50 p-4 text-sm text-gray-700">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-purple-600" />
            Downloading every permanent Order Request row ID and reconciling Base44 links...
          </div>}
          {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{error} No partial results are displayed and nothing was changed.</span>
          </div>}

          <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <div>
              <h3 className="text-sm font-semibold text-amber-950">Historical import sync evidence</h3>
              <p className="mt-1 text-xs text-amber-900">
                Compare up to 25 explicit permanent row IDs. This checks active and deleted Base44 claims plus mapped remote values. Missing markers alone never prove sync.
              </p>
            </div>
            <label htmlFor="order-import-audit-row-ids" className="block text-xs font-medium text-gray-700">
              Smartsheet row IDs
            </label>
            <textarea
              id="order-import-audit-row-ids"
              className="min-h-20 w-full rounded-lg border bg-white p-2 text-xs"
              placeholder="Paste 1–25 numeric row IDs, separated by spaces, commas, or lines"
              value={historicalRowIds}
              onChange={event => setHistoricalRowIds(event.target.value)}
              disabled={historicalLoading}
            />
            <Button type="button" size="sm" variant="outline" onClick={auditHistoricalImportRows}
              disabled={historicalLoading || !sessionToken}>
              {historicalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              {historicalLoading ? "Comparing rows..." : "Run read-only evidence check"}
            </Button>
            {historicalError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {historicalError} Nothing was changed.
            </p>}
            {historicalReport && <>
              <p className="text-xs text-gray-700">
                Marker states across {number((historicalReport.counts?.local_marker_true || 0) + (historicalReport.counts?.local_marker_false || 0) +
                  (historicalReport.counts?.local_marker_absent || 0) + (historicalReport.counts?.local_marker_other || 0))} Orders:
                {" "}{number(historicalReport.counts?.local_marker_true)} queued, {number(historicalReport.counts?.local_marker_false)} false,
                {" "}{number(historicalReport.counts?.local_marker_absent)} absent. Missing permanent IDs:
                {" "}{number(historicalReport.counts?.missing_permanent_id_orders)}.
              </p>
              <div className="space-y-2">
                {historicalReport.rows.map(row => <div key={row.row_id} className="rounded-lg border bg-white p-2 text-xs">
                  <p className="font-semibold break-all">Row {row.row_id}: {row.classification.replaceAll("_", " ")}</p>
                  {row.remote_modified_at && <p className="text-gray-500">Remote modified: {row.remote_modified_at}</p>}
                  {row.claims.length === 0
                    ? <p className="text-gray-600">No Base44 Order claims this permanent row ID.</p>
                    : row.claims.map(claim => <div key={claim.order_id} className="mt-1 border-t pt-1">
                      <p className="break-all">Order {claim.order_id} · {claim.deleted ? "deleted" : "active"} · marker {claim.marker_state}</p>
                      <p>Current local vs remote: {claim.local_matches_remote ? "matches" : "differs"} · Saved snapshot vs remote: {claim.saved_snapshot_matches_remote ? "matches" : claim.snapshot_available ? "differs" : "unavailable"}</p>
                      {[...new Set([
                        ...claim.local_mismatched_fields.flatMap(field => field.fields),
                        ...claim.saved_snapshot_mismatched_fields.flatMap(field => field.fields),
                      ])].length > 0 && <p className="text-amber-800">
                        Review fields: {[...new Set([
                          ...claim.local_mismatched_fields.flatMap(field => field.fields),
                          ...claim.saved_snapshot_mismatched_fields.flatMap(field => field.fields),
                        ])].join(", ")}
                      </p>}
                    </div>)}
                  <p className="mt-1 font-medium text-amber-900">
                    {row.classification === "currently_aligned_with_remote"
                      ? "Current alignment only; historical import success is not proven."
                      : "Review required; no automatic repair or retry was attempted."}
                  </p>
                </div>)}
              </div>
            </>}
          </section>

          {report && <>
            <div className={report.link_health?.clean
              ? "rounded-xl border border-green-200 bg-green-50 p-3 text-green-950"
              : "rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950"}>
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-4 w-4" />
                {report.link_health?.clean ? "Permanent links are clean" : number(report.link_health?.action_required) + " link issues require review"}
              </div>
              <p className="mt-1 text-xs">
                Verified sheet {report.sheet_id}, version {report.sheet_version} · {number(counts.smartsheet_rows_examined)} Smartsheet rows · {number(counts.active_base44_orders)} active Base44 Orders.
              </p>
            </div>

            {Number(counts.base44_unlinked_likely_test_artifacts) > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">{number(counts.base44_unlinked_likely_test_artifacts)} unlinked Base44 Order{Number(counts.base44_unlinked_likely_test_artifacts) === 1 ? " looks" : "s look"} like historical test data.</p>
                <p className="mt-1 text-xs">This is a review hint only. Nothing is hidden, deleted, linked, or retired automatically.</p>
              </div>
            )}

            {Number(counts.unlinked_smartsheet_rows) > 0 && (
              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">Remote unlinked-row evidence</p>
                <p className="mt-1 text-xs text-slate-600">Classification uses visible row content only as a review hint. Permanent row IDs remain the only identity used by sync.</p>
                <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {[
                    ["Blank / placeholder", counts.remote_blank_or_placeholder],
                    ["Duplicate-looking", counts.remote_duplicate_looking_historical],
                    ["Sparse", counts.remote_sparse_unlinked],
                    ["Populated", counts.remote_populated_unlinked],
                  ].map(([label, value]) => <div key={label} className="rounded-lg border bg-white p-2">
                    <p className="text-[11px] text-slate-600">{label}</p>
                    <p className="text-lg font-bold tabular-nums text-slate-900">{number(value)}</p>
                  </div>)}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Matched links", counts.matched_permanent_links],
                ["Base44 unlinked", counts.base44_unlinked],
                ["Remote unlinked", counts.unlinked_smartsheet_rows],
                ["Missing remote rows", counts.linked_row_missing_remote],
                ["Duplicate row IDs", counts.duplicate_base44_row_ids],
                ["Wrong / malformed", (Number(counts.wrong_sheet_link) || 0) + (Number(counts.invalid_base44_row_id) || 0)],
              ].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-3">
                <p className="text-xs text-gray-600">{label}</p>
                <p className="text-xl font-bold tabular-nums">{number(value)}</p>
              </div>)}
            </div>

            <div className="space-y-2">
              <label htmlFor="order-link-integrity-category" className="block text-sm font-semibold">Inspect link evidence</label>
              <select id="order-link-integrity-category" className="min-h-11 w-full rounded-lg border bg-white p-2 text-sm"
                value={category} onChange={event => setCategory(event.target.value)}>
                {CATEGORIES.map(item => {
                  const value = item.key === "duplicate_base44_row_link" ? counts.duplicate_base44_row_ids
                    : item.key === "unlinked_smartsheet_row" ? counts.unlinked_smartsheet_rows
                      : counts[item.key];
                  return <option key={item.key} value={item.key}>{item.label} ({number(value)})</option>;
                })}
              </select>
              <p className="text-sm text-gray-600">{selected.note}</p>
              {records.length === 0
                ? <p className="rounded-xl border p-3 text-sm text-gray-600">No records in this category.</p>
                : <div className="space-y-2">{records.map((item, index) =>
                    <RecordCard key={category + "-" + (item.row_id || item.base44_order_id || index)} item={item} category={category} />)}
                  </div>}
              {report.record_lists_truncated?.[category] && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Showing the first {number(records.length)} of {number(categoryCount)} records in this category.
              </p>}
            </div>
          </>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
