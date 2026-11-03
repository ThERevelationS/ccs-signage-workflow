import { useEffect, useState } from "react";
import { CheckCircle2, FileCheck2, Link2, Loader2, ShieldAlert, Undo2, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { invokePortal } from "@/components/portal/PortalPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { estimateQuoteExpiration, formatQuoteIssueDate, localDateStamp } from "./quoteLifecycle";
import { activeEstimateAcceptances, cleanQuoteRejectReason, isEstimateAcceptanceSuperseded, listEstimateRevisions } from "./estimateRevisionService";
import SignaturePad from "./SignaturePad";
import { loadAllEntityRows } from "./loadAllEntityRows";
import { CcsDateField, CcsDateTimeField } from "@/components/ui/ccs-date-field";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";

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

// (#262) Internal approval gate — mirrors the authorize_send backstop in
// recordEstimateQuoteDelivery and the CustomerQuotePanel send gate. A recorded
// approval is the internal_approval object carrying an approver + timestamp;
// it stops covering the quote once the total grows past quote_total_at_approval.
const QUOTE_APPROVAL_THRESHOLD_KEY = "quote_approval_threshold";
const DEFAULT_QUOTE_APPROVAL_THRESHOLD = 5000;

const thresholdFromSetting = (record) => {
  const raw = record?.setting_value;
  const parsed = Number(raw?.threshold ?? raw?.value ?? raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_QUOTE_APPROVAL_THRESHOLD;
};

const recordedQuoteApproval = (estimate) => {
  const approval = estimate?.internal_approval;
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) return null;
  if (!approval.approved_at && !approval.approved_by_email && !approval.approved_by_user_id) return null;
  return approval;
};

const quoteApprovalCovers = (estimate, quoteTotal) => {
  const approval = recordedQuoteApproval(estimate);
  if (!approval) return false;
  const approvedTotal = Number(approval?.quote_total_at_approval);
  if (Number.isFinite(approvedTotal) && approvedTotal > 0 && quoteTotal > approvedTotal + 0.005) return false;
  return true;
};

const defaultRejectDueDate = () => localDateStamp(new Date(Date.now() + 2 * 86400000));

export default function EstimateAcceptancePanel({ estimate, persistedEstimate, onRecordAcceptance, onRejectQuote, onSupersedeAcceptance, refreshKey = 0, isRegistered = false }) {
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
  const [quoteCopied, setQuoteCopied] = useState(false);
  const [portalError, setPortalError] = useState("");
  const { sessionToken } = useAuth();
  // (#262) Amber "pending internal approval" indicator — the send gate is
  // modeled by internal_approval (absent/blocked above threshold = pending);
  // this is only the visible layer, no schema/status change.
  const [quoteApprovalThreshold, setQuoteApprovalThreshold] = useState(DEFAULT_QUOTE_APPROVAL_THRESHOLD);
  // (#255) Staff-side reject quote dialog state.
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDueDate, setRejectDueDate] = useState(defaultRejectDueDate());
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState("");
  // (#271) Supersede acceptance dialog state.
  const [supersedeOpen, setSupersedeOpen] = useState(false);
  const [supersedeReason, setSupersedeReason] = useState("");
  const [supersedeBusy, setSupersedeBusy] = useState(false);
  const [supersedeError, setSupersedeError] = useState("");

  useEffect(() => {
    let active = true;
    loadSingleGlobalSetting({ entity: staffEntities.GlobalSettings, settingKey: QUOTE_APPROVAL_THRESHOLD_KEY, label: "Quote approval threshold" })
      .then((setting) => { if (active) setQuoteApprovalThreshold(thresholdFromSetting(setting)); })
      .catch(() => { /* threshold stays at the server default */ });
    return () => { active = false; };
  }, []);

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
  // (#271) Superseded acceptance rows stay in history but no longer count as
  // the canonical approval — they never block a fresh acceptance on the same
  // quote version and never count as "already accepted" below.
  const currentAcceptance = activeEstimateAcceptances(rows).find((row) => Number(row.quote_version || 0) === quoteVersion) || null;
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
  // (#255) Staff reject is the staff-side mirror of the portal decline: only a
  // sent quote awaiting a customer decision can be rejected.
  const canRejectQuote = isRegistered && !auditLoading && !auditReadError && persistedStatus === "sent" && quoteVersion > 0;
  // (#271) A recorded acceptance on an Approved estimate can be explicitly
  // superseded, returning the quote to the sent/needs-resend state.
  const canSupersedeAcceptance = isRegistered && !auditLoading && !auditReadError && persistedStatus === "approved" && !!currentAcceptance;
  // (#262) Pending = above the configured approval threshold with no covering
  // internal approval — the same predicate the send gate enforces.
  const quoteTotalNow = Number(estimate?.quote_total ?? persistedEstimate?.quote_total ?? 0);
  const pendingInternalApproval = !!isRegistered
    && quoteTotalNow > quoteApprovalThreshold
    && !quoteApprovalCovers(persistedEstimate || estimate, quoteTotalNow)
    && ["draft", "calculated", "sent"].includes(String(persistedStatus));

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

  const copyQuoteLink = async () => {
    if (!estimate?.id || !sessionToken || portalBusy) return;
    setPortalBusy(true);
    setPortalError("");
    try {
      const data = await invokePortal(sessionToken, { action: "create_link", kind: "estimate", estimate_id: estimate.id, creation_request_key: crypto.randomUUID() });
      const token = String(data?.token || data?.link?.token || "").trim();
      if (!token) throw new Error("No quote link is available for this estimate.");
      await navigator.clipboard.writeText(`${window.location.origin}/customerportal?token=${encodeURIComponent(token)}`);
      setQuoteCopied(true);
      window.setTimeout(() => setQuoteCopied(false), 2500);
    } catch (err) {
      setPortalError(err?.message || "The quote approval link could not be prepared.");
    } finally {
      setPortalBusy(false);
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

  // (#255) Staff-side reject: marks the estimate rejected/lost (cancelled
  // lifecycle state), spawns an estimator-queue follow-up task, and records a
  // cancel lifecycle revision — all through the guarded page-level handler.
  const openRejectDialog = () => {
    if (!canRejectQuote || typeof onRejectQuote !== "function") return;
    setRejectReason("");
    setRejectDueDate(defaultRejectDueDate());
    setRejectError("");
    setRejectOpen(true);
  };

  const submitReject = async () => {
    const cleanReason = cleanQuoteRejectReason(rejectReason);
    if (!cleanReason) {
      setRejectError("A rejection reason is required — a lost quote is never silent.");
      return;
    }
    if (typeof onRejectQuote !== "function") {
      setRejectError("Quote rejection is not available on this page.");
      return;
    }
    setRejectBusy(true);
    setRejectError("");
    try {
      await onRejectQuote({ reason: cleanReason, dueDate: rejectDueDate, quoteVersion });
      await loadRows();
      setRejectOpen(false);
    } catch (err) {
      setRejectError(err?.message || "The quote could not be rejected.");
    } finally {
      setRejectBusy(false);
    }
  };

  // (#271) Supersede: the acceptance row is marked superseded (kept in audit
  // history), the estimate returns to the sent/needs-resend state, and a
  // lifecycle revision records the transition.
  const openSupersedeDialog = () => {
    if (!canSupersedeAcceptance || typeof onSupersedeAcceptance !== "function") return;
    setSupersedeReason("");
    setSupersedeError("");
    setSupersedeOpen(true);
  };

  const submitSupersede = async () => {
    if (typeof onSupersedeAcceptance !== "function") {
      setSupersedeError("Supersede is not available on this page.");
      return;
    }
    setSupersedeBusy(true);
    setSupersedeError("");
    try {
      await onSupersedeAcceptance({
        reason: String(supersedeReason || "").trim(),
        acceptanceId: currentAcceptance?.id || "",
        quoteVersion,
      });
      await loadRows();
      setSupersedeOpen(false);
    } catch (err) {
      setSupersedeError(err?.message || "The acceptance could not be superseded.");
    } finally {
      setSupersedeBusy(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-bold text-gray-900 flex items-center gap-2 flex-wrap"><FileCheck2 className="w-4 h-4 text-red-600" aria-hidden="true" /> Customer Acceptance
            {pendingInternalApproval && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800"><ShieldAlert className="w-3 h-3" aria-hidden="true" /> Pending internal approval</span>
            )}
          </div>
          <div className="mt-0.5 text-[10px] text-gray-500">Records who accepted a specific issued quote version and how the approval was received.</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canAct && (
            <button type="button" onClick={openDialog} className="h-[31px] px-3 rounded border border-emerald-300 bg-emerald-50 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> {repairingApprovedAcceptance ? "Repair Approval Tracking" : recoveringRecordedAcceptance ? "Finalize Recorded Acceptance" : "Record Customer Acceptance"}
            </button>
          )}
          {canSupersedeAcceptance && (
            <button type="button" onClick={openSupersedeDialog} className="h-[31px] px-3 rounded border border-amber-300 bg-amber-50 text-[11px] font-bold text-amber-800 hover:bg-amber-100 inline-flex items-center gap-1.5">
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> Supersede Acceptance
            </button>
          )}
          {canRejectQuote && (
            <button type="button" onClick={openRejectDialog} className="h-[31px] px-3 rounded border border-red-300 bg-red-50 text-[11px] font-bold text-red-800 hover:bg-red-100 inline-flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" aria-hidden="true" /> Reject Quote
            </button>
          )}
        </div>
      </div>

      {pendingInternalApproval && (
        <div className="px-4 py-2 border-b border-amber-200 bg-amber-50 text-[10px] text-amber-800">
          <strong>Pending internal approval.</strong> This quote total (${quoteTotalNow.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) is above the ${quoteApprovalThreshold.toLocaleString("en-US")} internal approval threshold — a manager must approve it before the quote can be sent or resent.
        </div>
      )}

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
              <div key={row.id} className={`px-3 py-2.5 border-b border-gray-100 last:border-b-0 ${isEstimateAcceptanceSuperseded(row) ? "bg-amber-50/40" : "bg-white"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-bold text-gray-900 flex items-center gap-1.5">
                    {isEstimateAcceptanceSuperseded(row)
                      ? <><Undo2 className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" /> Quote Version {row.quote_version} accepted <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-px text-[8px] font-bold uppercase tracking-wide">Superseded</span></>
                      : <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> Quote Version {row.quote_version} accepted</>}
                  </div>
                  <div className="text-[9px] text-gray-400 whitespace-nowrap">{row.accepted_at ? new Date(row.accepted_at).toLocaleString() : ""}</div>
                </div>
                <div className="mt-1 text-[10px] text-gray-600">{row.accepted_by_name}{row.accepted_by_email ? ` · ${row.accepted_by_email}` : ""} · {METHOD_LABELS[row.acceptance_method] || row.acceptance_method}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-gray-400"><span>Issued {row.quote_issue_date ? formatQuoteIssueDate(row.quote_issue_date) : "—"}</span>{row.quote_expiration_date && <span>Valid through {formatQuoteIssueDate(row.quote_expiration_date)}</span>}<span>Accepted quote ${Number(row.quote_total || 0).toFixed(2)}</span>{row.delivery_id && <span>{(() => { const delivery = deliveryRows.find((item) => item.id === row.delivery_id); return delivery ? `Delivery: ${delivery.recipient_email || "email"} · ${delivery.sent_at ? new Date(delivery.sent_at).toLocaleString() : ""}` : "Specific delivery linked"; })()}</span>}{(row.recorded_by_name || row.recorded_by_email) && <span>Recorded by {row.recorded_by_name || row.recorded_by_email}{row.recorded_by_name && row.recorded_by_email ? ` · ${row.recorded_by_email}` : ""}</span>}{row.evidence_reference && <span>Evidence: {row.evidence_reference}</span>}</div>
                {row.notes && <div className="mt-1 text-[9px] text-gray-500">{row.notes}</div>}
                {isEstimateAcceptanceSuperseded(row) && (
                  <div className="mt-1 text-[9px] text-amber-700">Superseded{row.superseded_at ? ` ${new Date(row.superseded_at).toLocaleString()}` : ""}{(row.superseded_by_name || row.superseded_by_email) ? ` by ${row.superseded_by_name || row.superseded_by_email}` : ""}{row.supersede_reason ? ` — ${row.supersede_reason}` : ""}. A fresh acceptance can be recorded for this quote version.</div>
                )}
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
            <div className="text-[10px] text-blue-800"><strong>Share a link</strong> so the customer can approve Quote Version {quoteVersion} online — the quote link opens only this quote; the portal link opens their whole account.</div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={copyQuoteLink} disabled={portalBusy} className="h-[28px] px-3 rounded border border-blue-300 bg-white text-[10px] font-bold text-blue-700 hover:bg-blue-100 inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap">
                {portalBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Link2 className="w-3.5 h-3.5" aria-hidden="true" />} {quoteCopied ? "Quote link copied" : "Copy Quote Link"}
              </button>
              <button type="button" onClick={copyPortalLink} disabled={portalBusy} className="h-[28px] px-3 rounded border border-blue-300 bg-white text-[10px] font-bold text-blue-700 hover:bg-blue-100 inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap">
                {portalCopied ? "Link Copied" : "Copy Portal Link"}
              </button>
            </div>
          </div>
        )}
        {portalError && <div className="mt-2 text-[9px] text-red-600">{portalError}</div>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(next) => !saving && setDialogOpen(next)}>
        <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden border-gray-300 shadow-xl">
          <DialogHeader className="px-5 py-4 bg-[#424242] text-white border-b-4 border-lime-300">
            <DialogTitle className="text-white text-[16px] flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-lime-300" aria-hidden="true" /> {repairingApprovedAcceptance ? "Repair Approval Tracking" : recoveringRecordedAcceptance ? "Finalize Recorded Acceptance" : "Record Customer Acceptance"}</DialogTitle>
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
            {error && <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={saving} onClick={() => setDialogOpen(false)} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={saving || !acceptedByName.trim() || !acceptedAt} onClick={submit} className="h-[32px] px-4 rounded border border-emerald-400 bg-emerald-100 text-[11px] font-bold text-emerald-900 hover:bg-emerald-200 disabled:opacity-50 inline-flex items-center gap-1.5">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />} {saving ? (repairingApprovedAcceptance ? "Repairing…" : recoveringRecordedAcceptance ? "Finalizing…" : "Recording…") : (repairingApprovedAcceptance ? "Repair Tracking" : recoveringRecordedAcceptance ? "Finalize Approval" : "Record Acceptance")}</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={(next) => !rejectBusy && setRejectOpen(next)}>
        <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden border-gray-300 shadow-xl">
          <DialogHeader className="px-5 py-4 bg-[#424242] text-white border-b-4 border-red-400">
            <DialogTitle className="text-white text-[16px] flex items-center gap-2"><XCircle className="w-5 h-5 text-red-300" aria-hidden="true" /> Reject Quote</DialogTitle>
            <p className="mt-1 text-[10px] text-gray-300">Marks Quote Version {quoteVersion} rejected — the estimate moves to the cancelled/lost lifecycle state, a cancel revision is recorded, and an estimator follow-up task is queued for the estimate owner. This mirrors a customer declining in the portal.</p>
          </DialogHeader>
          <div className="p-5 space-y-3 bg-white">
            <label className="block text-[10px] font-bold tracking-wide text-gray-500">REJECTION REASON<textarea autoFocus value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={3} placeholder="e.g. Customer declined the price, chose a competitor, project cancelled…" className="mt-1 w-full rounded border border-gray-300 px-2.5 py-2 text-[12px] font-normal text-gray-800 resize-y" /></label>
            <label className="block text-[10px] font-bold tracking-wide text-gray-500">FOLLOW-UP DUE DATE<CcsDateField value={rejectDueDate} onChange={(event) => setRejectDueDate(event.target.value)} className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800" /></label>
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800"><strong>This cannot be undone from this panel.</strong> The estimate's Sales Pipeline stage moves to Lost and the follow-up task is assigned to {estimate?.salesperson || persistedEstimate?.salesperson || "the estimate owner"}.</div>
            {rejectError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{rejectError}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={rejectBusy} onClick={() => setRejectOpen(false)} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={rejectBusy || !cleanQuoteRejectReason(rejectReason)} onClick={submitReject} className="h-[32px] px-4 rounded border border-red-400 bg-red-100 text-[11px] font-bold text-red-900 hover:bg-red-200 disabled:opacity-50 inline-flex items-center gap-1.5">{rejectBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <XCircle className="w-3.5 h-3.5" aria-hidden="true" />} {rejectBusy ? "Rejecting…" : "Reject Quote"}</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={supersedeOpen} onOpenChange={(next) => !supersedeBusy && setSupersedeOpen(next)}>
        <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden border-gray-300 shadow-xl">
          <DialogHeader className="px-5 py-4 bg-[#424242] text-white border-b-4 border-amber-300">
            <DialogTitle className="text-white text-[16px] flex items-center gap-2"><Undo2 className="w-5 h-5 text-amber-300" aria-hidden="true" /> Supersede Acceptance</DialogTitle>
            <p className="mt-1 text-[10px] text-gray-300">Supersedes the recorded acceptance of Quote Version {quoteVersion} — the acceptance row stays in audit history marked Superseded, the estimate returns to Sent so the quote can be resent or revised, and the transition is recorded in Estimate Revision History.</p>
          </DialogHeader>
          <div className="p-5 space-y-3 bg-white">
            {currentAcceptance && (
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[10px] text-gray-600">Accepting {currentAcceptance.accepted_by_name || "customer"}{currentAcceptance.accepted_at ? ` · ${new Date(currentAcceptance.accepted_at).toLocaleString()}` : ""}{currentAcceptance.acceptance_method ? ` · ${METHOD_LABELS[currentAcceptance.acceptance_method] || currentAcceptance.acceptance_method}` : ""}</div>
            )}
            <label className="block text-[10px] font-bold tracking-wide text-gray-500">REASON (OPTIONAL)<input autoFocus value={supersedeReason} onChange={(event) => setSupersedeReason(event.target.value)} placeholder="e.g. Scope changed after approval, acceptance recorded against the wrong quote…" className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800" /></label>
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800"><strong>The quote is no longer approved after this.</strong> Resend it or start an Estimate Revision to issue a new quote version before the customer can approve again.</div>
            {supersedeError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{supersedeError}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={supersedeBusy} onClick={() => setSupersedeOpen(false)} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={supersedeBusy} onClick={submitSupersede} className="h-[32px] px-4 rounded border border-amber-400 bg-amber-100 text-[11px] font-bold text-amber-900 hover:bg-amber-200 disabled:opacity-50 inline-flex items-center gap-1.5">{supersedeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />} {supersedeBusy ? "Superseding…" : "Supersede Acceptance"}</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}