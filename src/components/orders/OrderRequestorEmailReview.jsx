import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

const REVIEW_CATEGORIES = [
  {
    key: "same_name_valid_smartsheet_email",
    label: "Possible email corrections",
    description: "The permanent Smartsheet row has a valid email and the displayed contact name matches Base44. Verify the address before making any correction.",
  },
  {
    key: "smartsheet_name_mismatch",
    label: "Different contact names",
    description: "Smartsheet has an email, but its contact name differs from Base44. Confirm the correct requestor before editing.",
  },
  {
    key: "smartsheet_name_unverified",
    label: "Contact name unverified",
    description: "Smartsheet has an email but no independently verifiable matching display name.",
  },
  {
    key: "smartsheet_contact_has_no_valid_email",
    label: "No valid Smartsheet email",
    description: "The linked Smartsheet contact does not contain a usable email address.",
  },
  {
    key: "smartsheet_row_missing",
    label: "Smartsheet row missing",
    description: "The permanent Smartsheet row ID was not present in the verified sheet download.",
  },
  {
    key: "duplicate_base44_row_link",
    label: "Duplicate Base44 row links",
    description: "Multiple Base44 Orders share the same permanent Smartsheet row ID; none can be chosen automatically.",
  },
  {
    key: "base44_row_link_missing",
    label: "Missing Smartsheet row ID",
    description: "The Order has no valid permanent Smartsheet row ID to compare.",
  },
];

const number = (value) => (Number(value) || 0).toLocaleString();

export default function OrderRequestorEmailReview({ open, onOpenChange, sessionToken }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(REVIEW_CATEGORIES[0].key);
  const requestIdRef = useRef(0);
  const activeRequestRef = useRef(null);

  const loadReport = useCallback(async () => {
    // Ref-based guard also covers rapid repeated clicks before React re-renders.
    if (activeRequestRef.current !== null) return;
    const requestId = ++requestIdRef.current;
    activeRequestRef.current = requestId;
    setLoading(true);
    setError("");
    setReport(null);

    try {
      if (!sessionToken) throw new Error("An active admin session is required.");
      const response = await base44.functions.invoke("smartsheetSyncAction", {
        action: "audit_order_requestor_emails",
        session_token: sessionToken,
      });
      const data = response?.data || response;
      if (!data?.success || data?.read_only !== true) {
        throw new Error(data?.error || "The read-only audit could not be verified.");
      }
      if (activeRequestRef.current !== requestId) return;
      setReport(data);
      setSelectedCategory(
        REVIEW_CATEGORIES.find(({ key }) => Number(data.counts?.[key] || 0) > 0)?.key
          || REVIEW_CATEGORIES[0].key,
      );
    } catch (reason) {
      if (activeRequestRef.current !== requestId) return;
      setError(
        reason?.response?.data?.error
          || reason?.data?.error
          || reason?.message
          || "The Smartsheet comparison could not be completed.",
      );
    } finally {
      if (activeRequestRef.current === requestId) {
        activeRequestRef.current = null;
        setLoading(false);
      }
    }
  }, [sessionToken]);

  useEffect(() => {
    if (open) {
      loadReport();
    } else {
      // Discard any late response when the dialog is closed or quickly reopened.
      activeRequestRef.current = null;
      setReport(null);
      setError("");
      setLoading(false);
    }
  }, [open, loadReport]);

  const selected = REVIEW_CATEGORIES.find(({ key }) => key === selectedCategory) || REVIEW_CATEGORIES[0];
  const records = report?.record_ids_by_category?.[selected.key] || [];
  const potentialCount = Number(report?.counts?.same_name_valid_smartsheet_email || 0);
  const invalidCount = Number(report?.invalid_base44_email_count || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="clay-card border-none w-[calc(100vw-1rem)] max-w-5xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-800">
            <ShieldCheck className="w-5 h-5 text-purple-600 shrink-0" />
            Requestor email review
          </DialogTitle>
          <DialogDescription className="text-left">
            Read-only comparison of Order Form records with their permanently linked Smartsheet rows.
            Nothing here changes an Order or its Smartsheet contact.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-full">
            Review only — no automatic changes
          </span>
          <Button type="button" size="sm" variant="outline" onClick={loadReport} disabled={loading || !sessionToken}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {loading ? "Checking..." : "Refresh comparison"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-4 pr-1">
          {loading && (
            <div role="status" className="flex items-center gap-3 bg-purple-50 rounded-xl p-4 text-sm text-gray-700">
              <Loader2 className="w-5 h-5 animate-spin text-purple-600 shrink-0" />
              Checking linked Orders and verifying the full Smartsheet download...
            </div>
          )}

          {!!error && (
            <div role="alert" className="flex gap-2 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Review unavailable</p>
                <p>{error}</p>
                <p className="mt-1">No partial comparison is shown. You can retry when the connection is available.</p>
              </div>
            </div>
          )}

          {report && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3" aria-label="Requestor email audit totals">
                {[
                  ["Orders examined", report.total_active_orders_examined],
                  ["Invalid emails", invalidCount],
                  ["Possible corrections", potentialCount],
                  ["Manual review", Math.max(0, invalidCount - potentialCount)],
                ].map(([label, count]) => (
                  <div key={label} className="rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-xs text-gray-600">{label}</p>
                    <p className="text-xl font-bold text-gray-800 tabular-nums">{number(count)}</p>
                  </div>
                ))}
              </div>

              {invalidCount === 0 ? (
                <p role="status" className="text-sm text-green-700 bg-green-50 p-4 rounded-xl">
                  No invalid Requestor Email values were found among these active linked Orders.
                </p>
              ) : (
                <>
                  <div className="space-y-1">
                    <label htmlFor="order-email-review-category" className="block text-sm font-semibold text-gray-700">
                      Review category
                    </label>
                    <select
                      id="order-email-review-category"
                      className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-800 min-h-11"
                      value={selectedCategory}
                      onChange={(event) => setSelectedCategory(event.target.value)}
                    >
                      {REVIEW_CATEGORIES.map(({ key, label }) => (
                        <option key={key} value={key}>
                          {label} ({number(report.counts?.[key])})
                        </option>
                      ))}
                    </select>
                    <p className="text-sm text-gray-600">{selected.description}</p>
                  </div>

                  {records.length === 0 ? (
                    <p className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
                      No Orders in this category.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {records.map((item) => (
                        <div key={item.base44_record_id} className="rounded-xl bg-white border border-gray-200 p-3 space-y-2 text-sm">
                          <div className="flex justify-between gap-3 flex-wrap">
                            <span className="font-semibold text-gray-800">{item.requestor_name || "Unknown requestor"}</span>
                            <span className="text-xs text-gray-500 break-all">Order ID: {item.base44_record_id}</span>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
                            <p className="text-gray-600 break-all">
                              Base44 email: <span className="font-medium text-gray-800">{item.current_base44_email || "—"}</span>
                            </p>
                            <p className="text-gray-600 break-all">
                              Smartsheet email: <span className="font-medium text-gray-800">{item.smartsheet_contact_email || "Not available"}</span>
                            </p>
                            {!!item.smartsheet_contact_name && (
                              <p className="text-gray-600 break-words">
                                Smartsheet name: <span className="text-gray-800">{item.smartsheet_contact_name}</span>
                              </p>
                            )}
                            <p className="text-xs text-gray-500 break-all">Smartsheet row ID: {item.smartsheet_row_id || "Missing"}</p>
                          </div>
                        </div>
                      ))}
                      {report.record_id_lists_truncated?.[selected.key] && (
                        <p className="text-sm font-medium text-amber-800 bg-amber-50 rounded-lg p-3">
                          Showing the first {number(records.length)} of {number(report.counts?.[selected.key])} Orders
                          in this category. Counts include the full set; this preview is limited.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
              <p className="text-xs text-gray-500">
                A matching contact is only a potential correction. Verify the address independently before editing any production record.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
