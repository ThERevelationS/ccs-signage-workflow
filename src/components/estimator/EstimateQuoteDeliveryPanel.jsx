import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { formatQuoteIssueDate } from "./quoteLifecycle";
import { listEstimateRevisions } from "./estimateRevisionService";

export default function EstimateQuoteDeliveryPanel({ estimate, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [revisionRows, setRevisionRows] = useState([]);

  useEffect(() => {
    let active = true;
    if (!estimate?.id) {
      setRows([]);
      return () => { active = false; };
    }

    Promise.all([
      base44.entities.EstimateQuoteDelivery.filter({ estimate_id: estimate.id }).catch(() => []),
      listEstimateRevisions(estimate.id),
    ]).then(([deliveries, revisions]) => {
      if (!active) return;
      setRows((deliveries || []).slice().sort((a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0)));
      setRevisionRows(revisions || []);
    });

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

  return (
    <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="text-[12px] font-bold text-gray-900 flex items-center gap-2">
          <MailCheck className="w-4 h-4 text-red-600" /> Quote Delivery History
        </div>
        <div className="mt-0.5 text-[10px] text-gray-500">Customer-facing delivery audit by issued quote version. Internal Product cost is never shown here.</div>
      </div>

      <div className="p-4">
        {rows.length === 0 ? (
          <div className="py-2 text-center text-[10px] text-gray-400">No customer quote deliveries have been recorded.</div>
        ) : (
          <div className="border border-gray-200 rounded overflow-hidden">
            {rows.slice(0, 8).map((row) => {
              const issuanceRevision = issuanceRevisionFor(row);
              const trackingIncomplete = Number(row.quote_version || 0) > 0 && !issuanceRevision;
              return (
              <div key={row.id} className="px-3 py-2.5 border-b border-gray-100 last:border-b-0 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-gray-900">Quote Version {Number(row.quote_version || 0)}</span>
                    {row.is_resend && <span className="text-[8px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">Resend</span>}
                    <span className={`text-[8px] px-1.5 py-0.5 rounded border ${row.delivery_status === "sent" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-600"}`}>{row.delivery_status || "sent"}</span>
                    {issuanceRevision && <span className="text-[8px] px-1.5 py-0.5 rounded border border-violet-200 bg-violet-50 text-violet-700">Issued in Revision #{issuanceRevision.revision_number}</span>}
                    {trackingIncomplete && <span className="text-[8px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">Issuance tracking incomplete</span>}
                  </div>
                  <div className="text-[9px] text-gray-400 whitespace-nowrap">{row.sent_at ? new Date(row.sent_at).toLocaleString() : ""}</div>
                </div>
                <div className="mt-1 text-[10px] text-gray-600 truncate">{row.recipient_email || "Recipient not recorded"}</div>
                {row.subject && <div className="mt-0.5 text-[9px] text-gray-500 truncate">{row.subject}</div>}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-gray-400">
                  <span>Issued {row.quote_issue_date ? formatQuoteIssueDate(row.quote_issue_date) : "—"}</span>
                  <span>Quote ${Number(row.quote_total || 0).toFixed(2)}</span>
                  {row.attachment_filename && <span>{row.attachment_filename}</span>}
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
