import { useEffect, useState } from "react";
import { CheckCircle2, FileCheck2, Link2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { invokePortal } from "@/components/portal/PortalPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { estimateQuoteExpiration, formatQuoteIssueDate, isQuoteExpired, localDateStamp, quoteExpirationDate } from "./quoteLifecycle";
import { listEstimateRevisions } from "./estimateRevisionService";
import SignaturePad from "./SignaturePad";
import { loadAllEntityRows } from "./loadAllEntityRows";
import { CcsDateTimeField } from "@/components/ui/ccs-date-field";

const METHOD_LABELS = {
  signed_quote: "Signed quote",
  email: "Customer email",
  verbal: "Verbal approval",
  in_person: "In-person approval",
  other: "Other",
};

const localDateTimeInput = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export default function EstimateAcceptancePanel({ estimate, persistedEstimate, onRecordAcceptance, refreshKey = 0, isRegistered = false }) {
  const [rows, setRows] = useState([]);
  const [revisionRows, setRevisionRows] = useState([]);
  const [deliveryRows, setDeliveryRows] = useState([]);
  const [sectionRows, setSectionRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditReadError, setAuditReadError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [acceptedByName, setAcceptedByName] = useState("");
  const [acceptedByEmail, setAcceptedByEmail] = useState("");
  const [acceptanceMethod, setAcceptanceMethod] = useState("signed_quote");
  const [acceptedAt, setAcceptedAt] = useState(localDateTimeInput());
  const [evidenceReference, setEvidenceReference] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [notes, setNotes] = useState("");
  const [deliveryId, setDeliveryId] = useState("");
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalCopied, setPortalCopied] = useState(false);
  const [portalError, setPortalError] = useState("");
  const { sessionToken } = useAuth();

  const loadRows = async () => {
    if (!estimate?.id) return false;
    setAuditLoading(true);
    setAuditReadError("");
    try {
      const [result, revisions, deliveries, sectionDecisions] = await Promise.all([
        loadAllEntityRows({
          entity: base44.entities.EstimateAcceptance,
          query: { estimate_id: estimate.id },
          sort: "accepted_at",
          label: "Estimate acceptances",
        }),
        listEstimateRevisions(estimate.id, { strict: true }),
        loadAllEntityRows({
          entity: base44.entities.EstimateQuoteDelivery,
          query: { estimate_id: estimate.id },
          sort: "sent_at",
          label: "Estimate quote deliveries",
        }),
        loadAllEntityRows({
          entity: base44.entities.EstimateSectionAcceptance,
          query: { estimate_id: estimate.id },
          sort: "decided_at",
          label: "Estimate section responses",
        }).catch(() => []),
      ]);
      setRows((result || []).slice().sort((a, b) => new Date(b.accepted_at || 0) - new Date(a.accepted_at || 0)));
      setRevisionRows(revisions || []);
      setDeliveryRows((deliveries || []).slice().sort((a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0)));
      setSectionRows((sectionDecisions || []).slice().sort((a, b) => new Date(b.decided_at || 0) - new Date(a.decided_at || 0)));
      return true;
    } catch (err) {
      setAuditReadError(err?.message || "Customer acceptance or revision history could not be verified.");
      return false;
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, [estimate?.id, refreshKey]);

  const persistedStatus = persistedEstimate?.status || estimate?.status || "draft";
  const quoteVersion = Math.max(0, Math.floor(Number(estimate?.quote_version || 0)));
  const currentAcceptance = rows.find((row) => Number(row.quote_version || 0) === quoteVersion) || null;
  const currentVersionDeliveries = deliveryRows.filter((row) => Number(row.quote_version || 0) === quoteVersion);
  const currentExpirationDate = estimateQuoteExpiration(estimate || {});
  const currentQuoteExpired = quoteVersion > 0 && !!currentExpirationDate && localDateStamp() > currentExpirationDate;
  const acceptanceLifecycleKey = currentAcceptance?.id ? `customer_acceptance:${currentAcceptance.id}` : "";
  const approvalRevisionRecorded = !!acceptanceLifecycleKey && revisionRows.some((row) =>
    row.revision_status === "completed" &&
    row.revision_type === "status_transition" &&
    row.previous_status === "sent" &&
    row.new_status === "approved" &&
    (row.idempotency_key === acceptanceLifecycleKey || row.notes === acceptanceLifecycleKey)
  );
  const canRecord = persistedStatus === "sent" && quoteVersion > 0;
  const repairingApprovedAcceptance = persistedStatus === "approved" && !!currentAcceptance && !approvalRevisionRecorded;
  const canAct = isRegistered && !auditLoading && !auditReadError && (canRecord || repairingApprovedAcceptance);
  const recoveringRecordedAcceptance = !!currentAcceptance;
  const portalCustomerId = String(estimate?.customer_id || persistedEstimate?.customer_id || "").trim();

  const openDialog = () => {
    if (!canAct) return;
    setAcceptedByName(currentAcceptance?.accepted_by_name || estimate.order_contact || estimate.contact_name || "");
    setAcceptedByEmail(currentAcceptance?.accepted_by_email || estimate.contact_email || "");
    setAcceptanceMethod(currentAcceptance?.acceptance_method || "signed_quote");
    setAcceptedAt(currentAcceptance?.accepted_at ? localDateTimeInput(currentAcceptance.accepted_at) : localDateTimeInput());
    setEvidenceReference(currentAcceptance?.evidence_reference || "");
    setNotes(currentAcceptance?.notes || "");
    setDeliveryId(currentAcceptance?.delivery_id || "");
    setSignatureDataUrl(null);
    setError("");
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!acceptedByName.trim()) {
      setError("Customer name is required.");
      return;
    }
    if (!acceptedAt) {
      setError("Acceptance date/time is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      // If a signature was drawn, archive it to storage and carry its URL as
      // the acceptance evidence alongside whatever the recorder typed.
      let evidenceFinal = evidenceReference.trim();
      if (signatureDataUrl) {
        try {
          const blob = await (await fetch(signatureDataUrl)).blob();
          const file = new File([blob], `signature-${estimate?.id || "estimate"}-${quoteVersion || 0}.png`, { type: "image/png" });
          const uploaded = await base44.integrations.Core.UploadFile({ file });
          const url = uploaded?.file_url || uploaded?.data?.file_url || "";
          if (url) evidenceFinal = `${evidenceFinal ? evidenceFinal + " · " : ""}Signature: ${url}`;
        } catch { /* signature upload failure never blocks the acceptance */ }
      }
      await onRecordAcceptance?.({
        quoteVersion,
        acceptedByName: acceptedByName.trim(),
        acceptedByEmail: acceptedByEmail.trim(),
        acceptanceMethod,
        acceptedAt: new Date(acceptedAt).toISOString(),
        evidenceReference: evidenceFinal,
        notes: notes.trim(),
        deliveryId,
      });
      await loadRows();
      setDialogOpen(false);
    } catch (err) {
      if (String(err?.message || "").startsWith("Customer acceptance")) await loadRows();
      setError(err?.message || "Customer acceptance could not be recorded.");
    } finally {
      setSaving(false);
    }
  };

  const copyPortalLink = async () => {
    if (!portalCustomerId || !sessionToken || portalBusy) return;
    setPortalBusy(true);
    setPortalError("");
    try {
      const data = await invokePortal(sessionToken, { action: "create_link", kind: "customer", customer_id: portalCustomerId, creation_request_key: crypto.randomUUID() });
      const token = String(data?.token || data?.link?.token || "").trim();
      if (!token) throw new Error("No customer portal link is available for this customer.");
      await navigator.clipboard.writeText(`${window.location.origin}/customerportal?token=${encodeURIComponent(token)}`);
      setPortalCopied(true);
      window.setTimeout(() => setPortalCopied(false), 2500);
    } catch (err) {
      setPortalError(err?.message || "The customer portal link could not be prepared.");
    } finally {
      setPortalBusy(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-bold text-gray-900 flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-red-600" /> Customer Acceptance</div>
          <div className="mt-0.5 text-[10px] text-gray-500">Records who accepted a specific issued quote version and how the approval was received.</div>
        </div>
        {canAct && (
          <button type="button" onClick={openDialog} className="h-[31px] px-3 rounded border border-emerald-300 bg-emerald-50 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> {repairingApprovedAcceptance ? "Repair Approval Tracking" : recoveringRecordedAcceptance ? "Finalize Recorded Acceptance" : "Record Customer Acceptance"}
          </button>
        )}
      </div>

      <div className="p-4">
        {auditReadError && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] text-red-700">
            <strong>Customer acceptance history could not be verified.</strong> {auditReadError} Acceptance actions are disabled until the audit history loads successfully.
          </div>
        )}
        {auditLoading ? (
          <div className="py-2 text-center text-[10px] text-gray-400">Loading customer acceptance history…</div>
        ) : rows.length === 0 ? (
          <div className="py-2 text-center text-[10px] text-gray-400">No customer acceptance has been recorded.</div>
        ) : (
          <div className="border border-gray-200 rounded overflow-hidden">
            {rows.slice(0, 6).map((row) => (
              <div key={row.id} className="px-3 py-2.5 border-b border-gray-100 last:border-b-0 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-bold text-gray-900 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Quote Version {row.quote_version} accepted</div>
                  <div className="text-[9px] text-gray-400 whitespace-nowrap">{row.accepted_at ? new Date(row.accepted_at).toLocaleString() : ""}</div>
                </div>
                <div className="mt-1 text-[10px] text-gray-600">{row.accepted_by_name}{row.accepted_by_email ? ` · ${row.accepted_by_email}` : ""} · {METHOD_LABELS[row.acceptance_method] || row.acceptance_method}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-gray-400"><span>Issued {row.quote_issue_date ? formatQuoteIssueDate(row.quote_issue_date) : "—"}</span>{row.quote_expiration_date && <span>Valid through {formatQuoteIssueDate(row.quote_expiration_date)}</span>}<span>Accepted quote ${Number(row.quote_total || 0).toFixed(2)}</span>{row.delivery_id && <span>{(() => { const delivery = deliveryRows.find((item) => item.id === row.delivery_id); return delivery ? `Delivery: ${delivery.recipient_email || "email"} · ${delivery.sent_at ? new Date(delivery.sent_at).toLocaleString() : ""}` : "Specific delivery linked"; })()}</span>}{(row.recorded_by_name || row.recorded_by_email) && <span>Recorded by {row.recorded_by_name || row.recorded_by_email}{row.recorded_by_name && row.recorded_by_email ? ` · ${row.recorded_by_email}` : ""}</span>}{row.evidence_reference && <span>Evidence: {row.evidence_reference}</span>}</div>
                {row.notes && <div className="mt-1 text-[9px] text-gray-500">{row.notes}</div>}
              </div>
            ))}
          </div>
        )}
        {sectionRows.length > 0 && (
          <div className="mt-3">
            <div className="text-[9px] font-bold tracking-wide text-gray-500 uppercase mb-1.5">Per-section responses</div>
            <div className="border border-gray-200 rounded overflow-hidden">
              {sectionRows.slice(0, 10).map((row) => (
                <div key={row.id} className="px-3 py-2 border-b border-gray-100 last:border-b-0 bg-white flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-gray-900">{row.section_label || row.section_key}</div>
                    <div className="text-[9px] text-gray-400">{row.decided_by_name || row.decided_by_email || "Customer"}{row.decided_at ? ` · ${new Date(row.decided_at).toLocaleString()}` : ""}</div>
                    {row.note && <div className="mt-0.5 text-[9px] text-gray-500">{row.note}</div>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${row.decision === "accepted" ? "bg-emerald-100 text-emerald-800" : row.decision === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{row.decision === "accepted" ? "Accepted" : row.decision === "rejected" ? "Declined" : "Question"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {isRegistered && persistedStatus === "sent" && portalCustomerId && (
          <div className="mt-3 rounded border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="text-[10px] text-blue-800"><strong>Share the customer portal link</strong> so the customer can review and approve Quote Version {quoteVersion} online.</div>
            <button type="button" onClick={copyPortalLink} disabled={portalBusy} className="h-[28px] px-3 rounded border border-blue-300 bg-white text-[10px] font-bold text-blue-700 hover:bg-blue-100 inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap">
              {portalBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} {portalCopied ? "Link Copied" : "Copy Approval Link"}
            </button>
          </div>
        )}
        {portalError && <div className="mt-2 text-[9px] text-red-600">{portalError}</div>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(next) => !saving && setDialogOpen(next)}>
        <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden border-gray-300 shadow-xl">
          <DialogHeader className="px-5 py-4 bg-[#424242] text-white border-b-4 border-lime-300">
            <DialogTitle className="text-white text-[16px] flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-lime-300" /> {repairingApprovedAcceptance ? "Repair Approval Tracking" : recoveringRecordedAcceptance ? "Finalize Recorded Acceptance" : "Record Customer Acceptance"}</DialogTitle>
            <p className="mt-1 text-[10px] text-gray-300">{repairingApprovedAcceptance ? `Quote Version ${quoteVersion} is already accepted and the estimate is Approved, but its downstream approval tracking is incomplete. Repairing will reuse the immutable acceptance, re-sync the Sales Pipeline, and ensure exactly one acceptance lifecycle revision.` : recoveringRecordedAcceptance ? `Acceptance of Quote Version ${quoteVersion} is already recorded. Finalizing will reuse that immutable record and retry the Sent → Approved lifecycle tracking.` : `This records acceptance of Quote Version ${quoteVersion}. Saving will move the estimate to Approved and preserve the lifecycle transition in Estimate Revision History.`}</p>
          </DialogHeader>
          <div className="p-5 space-y-3 bg-white">
            {currentQuoteExpired && !recoveringRecordedAcceptance && <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800"><strong>Quote Version {quoteVersion} expired{currentExpirationDate ? ` on ${formatQuoteIssueDate(currentExpirationDate)}` : ""}.</strong> You can still record acceptance if the shop has chosen to honor the quote; this warning does not change pricing or block approval.</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-[10px] font-bold tracking-wide text-gray-500">ACCEPTED BY<input autoFocus={!recoveringRecordedAcceptance} disabled={recoveringRecordedAcceptance} value={acceptedByName} onChange={(event) => setAcceptedByName(event.target.value)} className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800 disabled:bg-gray-100 disabled:text-gray-500" /></label>
              <label className="block text-[10px] font-bold tracking-wide text-gray-500">CUSTOMER EMAIL<input type="email" disabled={recoveringRecordedAcceptance} value={acceptedByEmail} onChange={(event) => setAcceptedByEmail(event.target.value)} className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800 disabled:bg-gray-100 disabled:text-gray-500" /></label>
              <label className="block text-[10px] font-bold tracking-wide text-gray-500">METHOD<select disabled={recoveringRecordedAcceptance} value={acceptanceMethod} onChange={(event) => setAcceptanceMethod(event.target.value)} className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800 disabled:bg-gray-100 disabled:text-gray-500">{Object.entries(METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="block text-[10px] font-bold tracking-wide text-gray-500">ACCEPTED DATE / TIME<CcsDateTimeField disabled={recoveringRecordedAcceptance} value={acceptedAt} onChange={(event) => setAcceptedAt(event.target.value)} className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800 disabled:bg-gray-100 disabled:text-gray-500" /></label>
            </div>
            <label className="block text-[10px] font-bold tracking-wide text-gray-500">RELATED QUOTE DELIVERY (OPTIONAL)<select disabled={recoveringRecordedAcceptance} value={deliveryId} onChange={(event) => setDeliveryId(event.target.value)} className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800 disabled:bg-gray-100 disabled:text-gray-500"><option value="">Not tied to a specific delivery</option>{currentVersionDeliveries.map((delivery) => <option key={delivery.id} value={delivery.id}>{delivery.sent_at ? new Date(delivery.sent_at).toLocaleString() : "Sent"} · {delivery.recipient_email || "recipient not recorded"}{delivery.delivery_n > 1 ? ` · Send #${delivery.delivery_n}` : delivery.is_resend ? " · Resend" : ""}</option>)}</select><span className="mt-1 block text-[9px] font-normal normal-case tracking-normal text-gray-400">Choose the exact email delivery the customer accepted when known. Leave blank for verbal/in-person approval or when the specific delivery is unknown.</span></label>
            <label className="block text-[10px] font-bold tracking-wide text-gray-500">EVIDENCE / REFERENCE<input disabled={recoveringRecordedAcceptance} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="e.g. Signed quote received, approval email, PO #..." className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800 disabled:bg-gray-100 disabled:text-gray-500" /></label>
            {!recoveringRecordedAcceptance && (
              <div>
                <span className="block text-[10px] font-bold tracking-wide text-gray-500">SIGNATURE (OPTIONAL)</span>
                <div className="mt-1"><SignaturePad onChange={setSignatureDataUrl} disabled={saving} /></div>
              </div>
            )}
            <label className="block text-[10px] font-bold tracking-wide text-gray-500">NOTES<textarea disabled={recoveringRecordedAcceptance} value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 w-full rounded border border-gray-300 px-2.5 py-2 text-[12px] font-normal text-gray-800 resize-y disabled:bg-gray-100 disabled:text-gray-500" /></label>
            {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={saving} onClick={() => setDialogOpen(false)} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={saving || !acceptedByName.trim() || !acceptedAt} onClick={submit} className="h-[32px] px-4 rounded border border-emerald-400 bg-emerald-100 text-[11px] font-bold text-emerald-900 hover:bg-emerald-200 disabled:opacity-50 inline-flex items-center gap-1.5">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} {saving ? (repairingApprovedAcceptance ? "Repairing…" : recoveringRecordedAcceptance ? "Finalizing…" : "Recording…") : (repairingApprovedAcceptance ? "Repair Tracking" : recoveringRecordedAcceptance ? "Finalize Approval" : "Record Acceptance")}</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
