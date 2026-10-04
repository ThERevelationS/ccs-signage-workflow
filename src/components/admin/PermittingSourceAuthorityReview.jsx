import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const isAdministrative = source => ["application_form", "checklist", "fee_schedule", "administrative_guidance"].includes(source.authority_classification);
const errorMessage = e => e?.response?.data?.error || e?.message || String(e);
const storageKey = source => "ccs-source-authority-review:" + source.id;
function readPending(source) {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(source)) || "null");
    return value?.source_document_id === source.id && value.request_id ? value : null;
  } catch { return null; }
}
async function invoke(body) {
  const response = await base44.functions.invoke("permittingSourceAuthorityReview", body);
  return response?.data || response;
}

export default function PermittingSourceAuthorityReview({ source, disabled, onBusy, onReviewed }) {
  const review = source.authority_review;
  const [form, setForm] = useState({
    publisher_name: review?.publisher_name || source.issuing_office || "",
    scope_kind: review?.scope_kind || "listed_areas",
    areas: (review?.named_areas || []).join("\n"),
    publisher_page: review?.proofs?.find(p => p.role === "publisher")?.physical_page || 1,
    publisher_quote: review?.proofs?.find(p => p.role === "publisher")?.excerpt || "",
    scope_page: review?.proofs?.find(p => p.role === "scope")?.physical_page || 1,
    scope_quote: review?.proofs?.find(p => p.role === "scope")?.excerpt || "",
    current_evidence_url: review?.current_evidence_url || source.official_url || "",
    current_evidence_reference: "", review_notes: "", current_source_confirmed: false,
    government_office_id: review?.office_reference?.government_office_id || ""
  });
  const [pending, setPending] = useState(() => readPending(source));
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Parent keys this panel by source and blocks source changes while a request is in progress.
  const locked = Boolean(disabled || busy);
  const unresolvedServerIntent = ["creating", "uncertain"].includes(source.authority_review_state?.status);
  const storedRequestId = pending?.request_id || (unresolvedServerIntent ? source.authority_review_state?.request_key?.replace(/^source-authority-review:/, "") : "");
  const change = (field, value) => { setForm(p => ({ ...p, [field]: value })); setPreview(null); };
  const reviewInput = () => ({
    publisher_name: form.publisher_name, scope_kind: form.scope_kind,
    named_areas: form.areas.split("\n").map(a => a.trim()).filter(Boolean),
    publisher_proof: { physical_page: Number(form.publisher_page), excerpt: form.publisher_quote },
    scope_proof: { physical_page: Number(form.scope_page), excerpt: form.scope_quote },
    current_evidence_url: form.current_evidence_url, current_evidence_reference: form.current_evidence_reference,
    review_notes: form.review_notes, current_source_confirmed: form.current_source_confirmed,
    ...(form.government_office_id.trim() ? { government_office_id: form.government_office_id.trim() } : {})
  });
  const acknowledge = data => {
    try { sessionStorage.removeItem(storageKey(source)); } catch { /* Server retains the permanent receipt. */ }
    setPending(null); setPreview(null); onReviewed(data);
  };
  async function act(action) {
    if (locked) return;
    setBusy(true); onBusy(true); setError("");
    try {
      if (["preview", "preview_revoke"].includes(action)) {
        const input = action === "preview" ? reviewInput() : {};
        const data = await invoke({ action, source_document_id: source.id, review: input });
        if (!mounted.current) return;
        if (!data.success) throw Error(data.error || "Source review preview failed.");
        setPreview({ ...data, action: action === "preview" ? "verify" : "revoke", input });
        setResult(null);
        return;
      }
      if (action === "check") {
        const data = await invoke({ action: "get_request", request_id: storedRequestId });
        if (!mounted.current) return;
        if (!data.success) throw Error(data.error || "Saved review could not be checked.");
        if (data.audit && data.audit.source_document_id !== source.id) throw Error("Saved review belongs to another source.");
        setResult({ ...data, status: data.applied ? "applied" : data.audit ? "recorded_not_applied" : "review_uncertain",
          ...(data.applied ? { revalidation: { success: false, resume_after: "", error: "Continue a bounded recheck of dependent rules." } } : {}) });
        if (data.applied) acknowledge(data);
        return;
      }
      if (action === "revalidate") {
        const previous = result?.revalidation;
        const data = await invoke({ action: "revalidate", source_document_id: source.id,
          cursor: previous?.next_cursor || previous?.resume_after || "" });
        if (!mounted.current) return;
        if (!data.success) throw Error(data.error || "Rule recheck failed.");
        setResult(p => ({ ...p, revalidation: data }));
        onReviewed(null);
        return;
      }
      let body = pending;
      if (action === "confirm") {
        if (!preview) return;
        body = { action: preview.action, source_document_id: source.id, request_id: crypto.randomUUID(),
          expected_updated_date: preview.expected_updated_date, review: preview.input };
        // Persist the exact decision before submission so a lost response can reuse the same identity.
        sessionStorage.setItem(storageKey(source), JSON.stringify(body)); setPending(body);
      }
      if (!body) throw Error("The saved decision is unavailable. Check the recorded request before another review.");
      const data = await invoke(body);
      if (!mounted.current) return;
      setResult(data);
      if (data.success && data.status === "applied") acknowledge(data);
      else setError(data.error || "Review outcome is uncertain. Check or resume the same saved decision.");
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally { if (mounted.current) { setBusy(false); onBusy(false); } }
  }
  if (!isAdministrative(source)) return null;
  return <details className="border rounded p-3 text-sm space-y-3">
    <summary className="cursor-pointer font-medium">Review form publisher and covered areas</summary>
    <p className="mt-3 text-gray-600">Use exact quotes from retained pages to identify the office and its stated coverage. Confirm the form is current using official evidence. This review supports submission instructions; location authority still requires separate verification.</p>
    {review && <p>Source review: {review.status} · {review.publisher_name} · {review.scope_label}</p>}
    {storedRequestId && <div className="bg-amber-50 p-2">
      <p>A saved review must be checked or resumed before another decision.</p>
      <p className="text-xs break-all">{storedRequestId}</p>
      <Button size="sm" variant="outline" disabled={locked} onClick={() => act("check")}>Check saved review</Button>
      {pending && <Button size="sm" variant="outline" disabled={locked} onClick={() => act("resume")}>Resume same decision</Button>}
      {!pending && <p className="text-xs mt-1">The original decision is not available in this browser. Its recorded intent needs reconciliation.</p>}
    </div>}
    <fieldset disabled={locked || Boolean(storedRequestId)} className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        <div><Label>Publisher office, exactly as printed</Label><Input value={form.publisher_name} onChange={e => change("publisher_name", e.target.value)} /></div>
        <div><Label>Coverage type</Label><select className="w-full border rounded p-2" value={form.scope_kind} onChange={e => change("scope_kind", e.target.value)}>
          <option value="listed_areas">Explicitly listed areas</option><option value="unincorporated">Unincorporated county area</option>
          <option value="named_jurisdiction">One named city, village or township</option>
        </select></div>
      </div>
      <div><Label>Covered areas, one per line, exactly as quoted</Label><Textarea rows={3} value={form.areas} onChange={e => change("areas", e.target.value)} /></div>
      <div className="grid gap-3 md:grid-cols-2">
        {["publisher", "scope"].map(role => <div key={role} className="space-y-1">
          <Label>{role === "publisher" ? "Publisher" : "Covered areas"} physical PDF page</Label>
          <Input type="number" min="1" value={form[role + "_page"]} onChange={e => change(role + "_page", e.target.value)} />
          <Label>Exact retained-page quote</Label><Textarea rows={3} value={form[role + "_quote"]} onChange={e => change(role + "_quote", e.target.value)} />
        </div>)}
      </div>
      <div><Label>Official evidence that this version is current</Label><Input type="url" value={form.current_evidence_url} onChange={e => change("current_evidence_url", e.target.value)} /></div>
      <div><Label>Current-version evidence reference</Label><Input value={form.current_evidence_reference} onChange={e => change("current_evidence_reference", e.target.value)} placeholder="Official forms index, effective date, or office confirmation" /></div>
      <div><Label>Review notes</Label><Textarea rows={2} value={form.review_notes} onChange={e => change("review_notes", e.target.value)} /></div>
      <div><Label>Verified shared publisher office ID (optional)</Label><Input value={form.government_office_id} onChange={e => change("government_office_id", e.target.value)} /></div>
      <label className="flex gap-2 items-start"><input type="checkbox" checked={form.current_source_confirmed} onChange={e => change("current_source_confirmed", e.target.checked)} />
        <span>I verified this archived version is the office's current form for the quoted coverage.</span></label>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => act("preview")}>Preview source review</Button>
        {review?.status === "active" && <Button size="sm" variant="outline" onClick={() => act("preview_revoke")}>Preview revocation</Button>}
      </div>
    </fieldset>
    {preview && !storedRequestId && <div className="border rounded p-2 space-y-2">
      <p>{preview.action === "revoke" ? "Revoke current source verification and recheck dependent instructions." :
        "Confirm current administrative source: " + preview.proposal.authority_review.publisher_name + " · " + preview.proposal.authority_review.scope_label}</p>
      <Button size="sm" disabled={locked} onClick={() => act("confirm")}>{preview.action === "revoke" ? "Confirm revocation" : "Confirm source review"}</Button>
    </div>}
    {busy && <p role="status">Saving or checking source evidence…</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {result && <p>Review status: {result.status}. No AI credits used.</p>}
    {result?.revalidation && <div>
      <p>{result.revalidation.rules_checked || 0} dependent rules checked; {result.revalidation.rules_flagged || 0} require review.</p>
      {(result.revalidation.has_more || result.revalidation.success === false) && <Button size="sm" variant="outline" disabled={locked} onClick={() => act("revalidate")}>Recheck next group of rules</Button>}
      {result.revalidation.error && <p className="text-amber-800">{result.revalidation.error}</p>}
    </div>}
  </details>;
}
