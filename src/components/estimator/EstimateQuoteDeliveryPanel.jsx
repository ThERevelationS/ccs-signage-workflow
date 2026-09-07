import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { formatQuoteIssueDate, isQuoteExpired, quoteExpirationDate } from "./quoteLifecycle";
import { listEstimateRevisions } from "./estimateRevisionService";
import { loadAllEntityRows } from "./loadAllEntityRows";

const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export default function EstimateQuoteDeliveryPanel({ estimate, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [revisionRows, setRevisionRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditReadError, setAuditReadError] = useState("");

  useEffect(() => {
    let active = true;
    if (!estimate?.id) {
      setRows([]);
      setRevisionRows([]);
      setAuditReadError("");
      setAuditLoading(false);
      return () => { active = false; };
    }

    setAuditLoading(true);
    setAuditReadError("");
    Promise.all([
      loadAllEntityRows({
        entity: base44.entities.EstimateQuoteDelivery,
        query: { estimate_id: estimate.id },
        sort: "sent_at",
        label: "Estimate quote deliveries",
      }),
      listEstimateRevisions(estimate.id, { strict: true }),
    ])
      .then(([deliveries, revisions]) => {
        if (!active) return;
        setRows((deliveries || []).slice().sort((a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0)));
        setRevisionRows(revisions || []);
      })
      .catch((error) => {
        if (!active) return;
        setAuditReadError(error?.message || "Quote delivery or revision history could not be verified.");
      })
      .finally(() => active && setAuditLoading(false));

    return () => { active = false; };
  }, [estimate?.id, refreshKey]);

  const issuanceRevisionFor = (delivery) => revisionRows.find((revision) => {
    const beforeVersion = Number(revision.estimate_snapshot_before?.quote_version || 0);
    const afterVersion = Number(revision.estimate_snapshot_after?.quote_version || revision.quote_version || 0);
    const sameIssue = delivery.quote_issue_key
      ? revision.quote_issue_key === delivery.quote_issue_key
      : Number(revision.quote_version || afterVersion || 0) === Number(delivery.quote_version || 0);
    return sameIssue && afterVersion === Number(delivery.quote_version || 0) && beforeVersion !== afterVersion;
  }) || null;

  // If Gmail succeeded but the dedicated EstimateQuoteDelivery insert failed,
  // the issuance revision still carries compact immutable delivery evidence.
  // Surface it here rather than making the audit look like no email was sent.
  const fallbackRows = revisionRows
    .filter((revision) => {
      const evidence = revision.delivery_evidence || {};
      if (revision.revision_status !== "completed" || Number(revision.quote_version || 0) <= 0) return false;
      if (!evidence.gmail_message_id && !evidence.attachment_file_url) return false;
      return !rows.some((row) =>
        (evidence.delivery_id && row.id === evidence.delivery_id) ||
        (evidence.gmail_message_id && row.gmail_message_id === evidence.gmail_message_id)
      );
    })
    .map((revision) => {
      const evidence = revision.delivery_evidence || {};
      const snapshot = revision.estimate_snapshot_after || {};
      const issueDate = snapshot.quote_issue_date || "";
      const validDays = snapshot.quote_valid_days ?? 30;
      return {
        id: `revision-delivery-${revision.id}`,
        quote_issue_key: revision.quote_issue_key || "",
        quote_version: Number(revision.quote_version || snapshot.quote_version || 0),
        quote_issue_date: issueDate,
        quote_valid_days: validDays,
        quote_expiration_date: quoteExpirationDate(issueDate, validDays),
        quote_total: Number(revision.new_quote_total || snapshot.quote_total || 0),
        recipient_email: evidence.recipient_email || "",
        delivery_status: "sent",
        sent_at: evidence.sent_at || revision.completed_at || "",
        gmail_message_id: evidence.gmail_message_id || "",
        attachment_filename: "Archived customer quote PDF",
        attachment_file_url: evidence.attachment_file_url || "",
        attachment_sha256: evidence.attachment_sha256 || "",
        attachment_size_bytes: Number(evidence.attachment_size_bytes || 0),
        is_resend: false,
        fallback_evidence: true,
      };
    });
  const visibleRows = [...rows, ...fallbackRows]
    .sort((a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0));

  return (
    <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="text-[12px] font-bold text-gray-900 flex items-center gap-2">
          <MailCheck className="w-4 h-4 text-red-600" /> Quote Delivery History
        </div>
        <div className="mt-0.5 text-[10px] text-gray-500">Customer-facing delivery audit by issued quote version. Internal Product cost is never shown here.</div>
      </div>

      <div className="p-4">
        {auditReadError && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] text-red-700">
            <strong>Quote delivery history could not be verified.</strong> {auditReadError} Delivery absence and issuance-tracking status are not shown until both audit sources load successfully.
          </div>
        )}
        {auditLoading ? (
          <div className="py-2 text-center text-[10px] text-gray-400">Loading quote delivery history…</div>
        ) : auditReadError ? null : visibleRows.length === 0 ? (
          <div className="py-2 text-center text-[10px] text-gray-400">No customer quote deliveries have been recorded.</div>
        ) : (
          <div className="border border-gray-200 rounded overflow-hidden">
            {visibleRows.slice(0, 8).map((row) => {
              const issuanceRevision = issuanceRevisionFor(row);
              const trackingIncomplete = Number(row.quote_version || 0) > 0 && !issuanceRevision;
              const expirationDate = row.quote_expiration_date || quoteExpirationDate(row.quote_issue_date, row.quote_valid_days ?? issuanceRevision?.estimate_snapshot_after?.quote_valid_days ?? 30);
              const expired = isQuoteExpired(row.quote_issue_date, row.quote_valid_days ?? issuanceRevision?.estimate_snapshot_after?.quote_valid_days ?? 30);
              return (
              <div key={row.id} className="px-3 py-2.5 border-b border-gray-100 last:border-b-0 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-gray-900">Quote Version {Number(row.quote_version || 0)}</span>
                    {row.is_resend && <span className="text-[8px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">Resend</span>}
                    {row.fallback_evidence && <span className="text-[8px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">Revision fallback evidence</span>}
                    <span className={`text-[8px] px-1.5 py-0.5 rounded border ${row.delivery_status === "sent" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-600"}`}>{row.delivery_status || "sent"}</span>
                    {issuanceRevision && <span className="text-[8px] px-1.5 py-0.5 rounded border border-violet-200 bg-violet-50 text-violet-700">Issued in Revision #{issuanceRevision.revision_number}</span>}
                    {trackingIncomplete && <span className="text-[8px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">Issuance tracking incomplete</span>}
                    {expired && <span className="text-[8px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">Expired</span>}
                  </div>
                  <div className="text-[9px] text-gray-400 whitespace-nowrap">{row.sent_at ? new Date(row.sent_at).toLocaleString() : ""}</div>
                </div>
                <div className="mt-1 text-[10px] text-gray-600 truncate">{row.recipient_email || "Recipient not recorded"}</div>
                {row.subject && <div className="mt-0.5 text-[9px] text-gray-500 truncate">{row.subject}</div>}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-gray-400">
                  <span>Issued {row.quote_issue_date ? formatQuoteIssueDate(row.quote_issue_date) : "—"}</span>
                  {expirationDate && <span>Valid through {formatQuoteIssueDate(expirationDate)}</span>}
                  <span>Quote ${Number(row.quote_total || 0).toFixed(2)}</span>
                  {row.attachment_file_url ? <a href={row.attachment_file_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Open archived PDF</a> : row.attachment_filename && <span>{row.attachment_filename}</span>}
                  {row.attachment_size_bytes > 0 && <span>{formatBytes(row.attachment_size_bytes)}</span>}
                  {row.attachment_sha256 && <span title={row.attachment_sha256}>SHA-256 {row.attachment_sha256.slice(0, 12)}…</span>}
                  {row.gmail_message_id && <span>Gmail ID {row.gmail_message_id}</span>}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
