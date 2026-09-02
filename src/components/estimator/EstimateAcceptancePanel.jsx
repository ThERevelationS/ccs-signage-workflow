import { useEffect, useState } from "react";
import { CheckCircle2, FileCheck2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatQuoteIssueDate } from "./quoteLifecycle";

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

export default function EstimateAcceptancePanel({ estimate, persistedEstimate, onRecordAcceptance, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [acceptedByName, setAcceptedByName] = useState("");
  const [acceptedByEmail, setAcceptedByEmail] = useState("");
  const [acceptanceMethod, setAcceptanceMethod] = useState("signed_quote");
  const [acceptedAt, setAcceptedAt] = useState(localDateTimeInput());
  const [evidenceReference, setEvidenceReference] = useState("");
  const [notes, setNotes] = useState("");

  const loadRows = async () => {
    if (!estimate?.id) return;
    const result = await base44.entities.EstimateAcceptance.filter({ estimate_id: estimate.id }).catch(() => []);
    setRows((result || []).slice().sort((a, b) => new Date(b.accepted_at || 0) - new Date(a.accepted_at || 0)));
  };

  useEffect(() => {
    loadRows();
  }, [estimate?.id, refreshKey]);

  const persistedStatus = persistedEstimate?.status || estimate?.status || "draft";
  const quoteVersion = Math.max(0, Math.floor(Number(estimate?.quote_version || 0)));
  const currentAcceptance = rows.find((row) => Number(row.quote_version || 0) === quoteVersion) || null;
  const canRecord = persistedStatus === "sent" && quoteVersion > 0;
  const recoveringRecordedAcceptance = !!currentAcceptance;

  const openDialog = () => {
    if (!canRecord) return;
    setAcceptedByName(currentAcceptance?.accepted_by_name || estimate.order_contact || estimate.contact_name || "");
    setAcceptedByEmail(currentAcceptance?.accepted_by_email || estimate.contact_email || "");
    setAcceptanceMethod(currentAcceptance?.acceptance_method || "signed_quote");
    setAcceptedAt(currentAcceptance?.accepted_at ? localDateTimeInput(currentAcceptance.accepted_at) : localDateTimeInput());
    setEvidenceReference(currentAcceptance?.evidence_reference || "");
    setNotes(currentAcceptance?.notes || "");
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
      await onRecordAcceptance?.({
        quoteVersion,
        acceptedByName: acceptedByName.trim(),
        acceptedByEmail: acceptedByEmail.trim(),
        acceptanceMethod,
        acceptedAt: new Date(acceptedAt).toISOString(),
        evidenceReference: evidenceReference.trim(),
        notes: notes.trim(),
      });
      await loadRows();
      setDialogOpen(false);
    } catch (err) {
      if (String(err?.message || "").startsWith("Customer acceptance was recorded")) await loadRows();
      setError(err?.message || "Customer acceptance could not be recorded.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-bold text-gray-900 flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-red-600" /> Customer Acceptance</div>
          <div className="mt-0.5 text-[10px] text-gray-500">Records who accepted a specific issued quote version and how the approval was received.</div>
        </div>
        {canRecord && (
          <button type="button" onClick={openDialog} className="h-[31px] px-3 rounded border border-emerald-300 bg-emerald-50 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> {recoveringRecordedAcceptance ? "Finalize Recorded Acceptance" : "Record Customer Acceptance"}
          </button>
        )}
      </div>

      <div className="p-4">
        {rows.length === 0 ? (
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
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-gray-400"><span>Issued {row.quote_issue_date ? formatQuoteIssueDate(row.quote_issue_date) : "—"}</span><span>Accepted quote ${Number(row.quote_total || 0).toFixed(2)}</span>{row.evidence_reference && <span>Evidence: {row.evidence_reference}</span>}</div>
                {row.notes && <div className="mt-1 text-[9px] text-gray-500">{row.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(next) => !saving && setDialogOpen(next)}>
        <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden border-gray-300 shadow-xl">
          <DialogHeader className="px-5 py-4 bg-[#424242] text-white border-b-4 border-lime-300">
            <DialogTitle className="text-white text-[16px] flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-lime-300" /> {recoveringRecordedAcceptance ? "Finalize Recorded Acceptance" : "Record Customer Acceptance"}</DialogTitle>
            <p className="mt-1 text-[10px] text-gray-300">{recoveringRecordedAcceptance ? `Acceptance of Quote Version ${quoteVersion} is already recorded. Finalizing will reuse that immutable record and retry only the Sent → Approved lifecycle transition.` : `This records acceptance of Quote Version ${quoteVersion}. Saving will move the estimate to Approved and preserve the lifecycle transition in Estimate Revision History.`}</p>
          </DialogHeader>
          <div className="p-5 space-y-3 bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-[10px] font-bold tracking-wide text-gray-500">ACCEPTED BY<input autoFocus={!recoveringRecordedAcceptance} disabled={recoveringRecordedAcceptance} value={acceptedByName} onChange={(event) => setAcceptedByName(event.target.value)} className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800 disabled:bg-gray-100 disabled:text-gray-500" /></label>
              <label className="block text-[10px] font-bold tracking-wide text-gray-500">CUSTOMER EMAIL<input type="email" disabled={recoveringRecordedAcceptance} value={acceptedByEmail} onChange={(event) => setAcceptedByEmail(event.target.value)} className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800 disabled:bg-gray-100 disabled:text-gray-500" /></label>
              <label className="block text-[10px] font-bold tracking-wide text-gray-500">METHOD<select disabled={recoveringRecordedAcceptance} value={acceptanceMethod} onChange={(event) => setAcceptanceMethod(event.target.value)} className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800 disabled:bg-gray-100 disabled:text-gray-500">{Object.entries(METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="block text-[10px] font-bold tracking-wide text-gray-500">ACCEPTED DATE / TIME<input type="datetime-local" disabled={recoveringRecordedAcceptance} value={acceptedAt} onChange={(event) => setAcceptedAt(event.target.value)} className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800 disabled:bg-gray-100 disabled:text-gray-500" /></label>
            </div>
            <label className="block text-[10px] font-bold tracking-wide text-gray-500">EVIDENCE / REFERENCE<input disabled={recoveringRecordedAcceptance} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="e.g. Signed quote received, approval email, PO #..." className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800 disabled:bg-gray-100 disabled:text-gray-500" /></label>
            <label className="block text-[10px] font-bold tracking-wide text-gray-500">NOTES<textarea disabled={recoveringRecordedAcceptance} value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 w-full rounded border border-gray-300 px-2.5 py-2 text-[12px] font-normal text-gray-800 resize-y disabled:bg-gray-100 disabled:text-gray-500" /></label>
            {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={saving} onClick={() => setDialogOpen(false)} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={saving || !acceptedByName.trim() || !acceptedAt} onClick={submit} className="h-[32px] px-4 rounded border border-emerald-400 bg-emerald-100 text-[11px] font-bold text-emerald-900 hover:bg-emerald-200 disabled:opacity-50 inline-flex items-center gap-1.5">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} {saving ? (recoveringRecordedAcceptance ? "Finalizing…" : "Recording…") : (recoveringRecordedAcceptance ? "Finalize Approval" : "Record Acceptance")}</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
