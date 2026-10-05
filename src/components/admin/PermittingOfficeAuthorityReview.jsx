import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LOCALITY_AUTHORITY_ROLES } from "@/components/permitting/localityAuthorityVerification";

const message = e => e?.response?.data?.error || e?.message || String(e);
async function invoke(body) { const r = await base44.functions.invoke("permittingOfficeAuthorityReview", body); return r?.data || r; }
const storageKey = sourceId => "ccs-office-authority-review:" + sourceId;
function readPending(sourceId) {
  try { const p = JSON.parse(sessionStorage.getItem(storageKey(sourceId)) || "null"); return p?.source_id === sourceId ? p : null; } catch { return null; }
}
export default function PermittingOfficeAuthorityReview({ source, disabled, onBusy }) {
  const isHtml = source.evidence_kind === "official_html";
  const [context, setContext] = useState(null), [targetId, setTargetId] = useState(() => readPending(source.id)?.body?.jurisdiction_id || source.jurisdiction_id || "");
  const [form, setForm] = useState({ government_office_id: source.authority_review?.office_reference?.government_office_id || "",
    role: isHtml ? "zoning" : "sign_permit", coverage_area: isHtml ? source.jurisdiction_name : "", office_alias: "", page: 1, excerpt: "", review_notes: "", role_label: "", responsibility_confirmed: false });
  const [preview, setPreview] = useState(null), [pending, setPending] = useState(() => readPending(source.id));
  const [reviews, setReviews] = useState([]), [cursor, setCursor] = useState(null), [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const locked = Boolean(disabled || busy), frozen = Boolean(pending);
  const change = (key, value) => { setForm(p => ({ ...p, [key]: value })); setPreview(null); };
  async function act(action, selectedReview) {
    if (locked) return;
    setBusy(true); onBusy(true); setError("");
    try {
      if (action === "context" || action === "more_targets") {
        const data = await invoke({ action: "context", ...(isHtml ? { evidence_kind: "official_html", html_evidence_id: source.id } : { source_document_id: source.id }),
          ...(action === "more_targets" ? { cursor: context?.next_cursor } : {}) });
        if (!mounted.current) return;
        if (!data.success) throw Error(data.error || "Review options unavailable.");
        setContext(previous => action === "more_targets" ? { ...data,
          targets: [...new Map([...(previous?.targets || []), ...data.targets].map(p => [p.id, p])).values()] } : data);
        return;
      }
      if (action === "list" || action === "more_reviews") {
        const data = await invoke({ action: "list", jurisdiction_id: targetId,
          ...(action === "more_reviews" ? { cursor } : {}) });
        if (!mounted.current) return;
        if (!data.success) throw Error(data.error || "Relationship review history unavailable.");
        setReviews(previous => action === "list" ? data.items : [...new Map([...previous, ...data.items].map(p => [p.id, p])).values()]);
        setCursor(data.next_cursor);
        return;
      }
      if (action === "preview" || action === "preview_revoke") {
        const input = action === "preview_revoke" ? { revoke_review_id: selectedReview.id, review_notes: form.review_notes } : {
          ...(isHtml ? { evidence_kind: "official_html", html_evidence_id: source.id, office_alias: form.office_alias } : { source_document_id: source.id }), government_office_id: form.government_office_id, role: form.role, role_label: form.role_label,
          coverage_area: form.coverage_area, role_proof: { ...(isHtml ? { block: Number(form.page) } : { physical_page: Number(form.page) }), excerpt: form.excerpt },
          responsibility_confirmed: form.responsibility_confirmed, review_notes: form.review_notes };
        const data = await invoke({ action, jurisdiction_id: targetId, review: input });
        if (!mounted.current) return;
        if (!data.success) throw Error(data.error || "Relationship preview failed.");
        setPreview({ ...data, jurisdiction_id: targetId, input, action: action === "preview" ? "verify" : "revoke" });
        return;
      }
      if (action === "check") {
        const data = await invoke({ action: "get_request", jurisdiction_id: pending.body.jurisdiction_id, request_id: pending.body.request_id });
        if (!mounted.current) return;
        if (!data.success) throw Error(data.error || "Saved request unavailable.");
        setResult({ ...data, status: data.committed ? "recorded" : "review_uncertain" });
        if (data.committed) clearSaved();
        else if (data.receipt?.request_key?.endsWith(":" + pending.body.request_id) && data.receipt.status === "not_recorded") {
          clearSaved(); setResult({ status: "not_recorded", error: "No event create was attempted. Preview current evidence before another decision." });
        }
        return;
      }
      let saved = pending;
      if (action === "confirm") {
        if (!preview) return;
        saved = { source_id: source.id, body: { action: preview.action, jurisdiction_id: preview.jurisdiction_id,
          request_id: crypto.randomUUID(), expected_updated_date: preview.expected_updated_date, review: preview.input } };
        sessionStorage.setItem(storageKey(source.id), JSON.stringify(saved)); setPending(saved);
      }
      if (!saved) throw Error("Check the saved decision before submitting another review.");
      const data = await invoke(saved.body);
      if (!mounted.current) return;
      setResult(data);
      if ((data.success && data.status === "recorded") || data.retry_safe === true) clearSaved();
      else setError(data.error || "Review outcome is uncertain. Check or resume this same saved decision.");
    } catch (e) { if (mounted.current) setError(message(e)); }
    finally { if (mounted.current) { setBusy(false); onBusy(false); } }
  }
  function clearSaved() {
    try { sessionStorage.removeItem(storageKey(source.id)); } catch { /* Immutable server history remains retained. */ }
    setPending(null); setPreview(null);
  }
  return <details className="border rounded p-3 text-sm space-y-3">
    <summary className="cursor-pointer font-medium">Review office responsibility for a covered area</summary>
    <p className="mt-3 text-gray-600">Record one office role for an explicitly covered jurisdiction. Staff must confirm the quote establishes this office's responsibility. An office name or an attachment list alone does not establish responsibility. Address authority and job steps remain separate.</p>
    <Button size="sm" variant="outline" disabled={locked || frozen} onClick={() => act("context")}>Load source and office options</Button>
    {context && <fieldset disabled={locked || frozen} className="space-y-2">
      {!isHtml && context.source_review?.status !== "active" && <p className="text-amber-800">Verify the form publisher, current version and covered areas first.</p>}
      <div><Label>Canonical jurisdiction receiving this service</Label><select className="w-full border rounded p-2" value={targetId} onChange={e => { setTargetId(e.target.value); setPreview(null); setReviews([]); setCursor(null); }}>
        {context.targets.map(p => <option key={p.id} value={p.id}>{p.name}, {p.state} · {p.type}</option>)}
      </select></div>
      {context.has_more && <Button size="sm" variant="outline" onClick={() => act("more_targets")}>Load more matching jurisdictions</Button>}
      <div><Label>{isHtml ? "Verified responsible office" : "Verified publisher office"}</Label><select className="w-full border rounded p-2" value={form.government_office_id} onChange={e => change("government_office_id", e.target.value)}>
        <option value="">Select canonical office</option>{context.offices.map(o => <option key={o.catalog_id} value={o.id}>{o.name} · {o.verification_status.replaceAll("_", " ")}</option>)}
      </select></div>
      {!context.offices.length && <p className="text-amber-800">{isHtml ? "No verified shared office is available for this state." : "No shared office matches the reviewed publisher."} Add and verify its identity in Permitting Settings first.</p>}
      <div className="grid gap-2 md:grid-cols-2">
        <div><Label>Office role</Label><select className="w-full border rounded p-2" value={form.role} onChange={e => change("role", e.target.value)}>
          {LOCALITY_AUTHORITY_ROLES.filter(([role]) => !isHtml || role === "zoning").map(([role, name]) => <option key={role} value={role}>{name}</option>)}
        </select></div>
        <div><Label>Explicit quoted coverage</Label><select className="w-full border rounded p-2" value={form.coverage_area} onChange={e => change("coverage_area", e.target.value)}>
          <option value="">Select covered area</option>{(context.source_review?.named_areas || []).map(area => <option key={area} value={area}>{area}</option>)}
        </select></div>
      </div>
      {form.role === "other" && <div><Label>Other role, exactly as quoted</Label><Input value={form.role_label} onChange={e => change("role_label", e.target.value)} /></div>}
      {isHtml && <div><Label>Responsible office name, exactly as quoted</Label><Input maxLength={200} value={form.office_alias} onChange={e => change("office_alias", e.target.value)} /></div>}
      {isHtml && <p className="text-gray-600">Quote the city zoning delegation and its direct office link in one retained block. The current website text and link are checked again when saving and reading the relationship.</p>}
      <div><Label>{isHtml ? "HTML text block establishing the delegation" : "Physical PDF page establishing the role"}</Label><Input type="number" min="1" value={form.page} onChange={e => change("page", e.target.value)} /></div>
      <div><Label>{isHtml ? "Exact retained-block delegation and link text" : "Exact retained-page responsibility quote"}</Label><Textarea rows={3} maxLength={1000} value={form.excerpt} onChange={e => change("excerpt", e.target.value)} /></div>
      <div><Label>Relationship review or revocation notes</Label><Textarea rows={2} maxLength={2000} value={form.review_notes} onChange={e => change("review_notes", e.target.value)} /></div>
      <label className="flex gap-2 items-start"><input type="checkbox" checked={form.responsibility_confirmed} onChange={e => change("responsibility_confirmed", e.target.checked)} />
        <span>I confirmed this office handles the selected role for this exact covered area.</span></label>
      <Button size="sm" variant="outline" onClick={() => act("preview")}>Preview responsibility review</Button>
    </fieldset>}
    {preview && !pending && <div className="border rounded p-2 space-y-2">
      <p>{preview.action === "revoke" ? "Revoke" : "Record"}: {preview.proposal.office_snapshot.name} · {preview.proposal.role_label.replaceAll("_", " ")} · {preview.proposal.coverage_area}</p>
      <Button size="sm" disabled={locked} onClick={() => act("confirm")}>Confirm relationship decision</Button>
    </div>}
    {pending && <div className="bg-amber-50 p-2 space-y-1">
      <p>Preserve this saved decision while its outcome is checked.</p><p className="text-xs break-all">{pending.body.request_id}</p>
      <Button size="sm" variant="outline" disabled={locked} onClick={() => act("check")}>Check saved relationship review</Button>
      <Button size="sm" variant="outline" disabled={locked} onClick={() => act("resume")}>Resume same relationship decision</Button>
    </div>}
    <Button size="sm" variant="outline" disabled={locked || frozen || !targetId} onClick={() => act("list")}>Check current relationship history</Button>
    {reviews.map(review => <div key={review.id} className="border rounded p-2 space-y-1">
      <div className="font-medium">{review.office_snapshot?.name} · {review.role_label?.replaceAll("_", " ")} · {review.coverage_area}</div>
      <p>{review.state.replaceAll("_", " ")} · {review.reason}</p>
      <blockquote className="text-xs text-gray-600">{review.role_proof?.excerpt}</blockquote>
      <p className="text-xs">Reviewed by {review.requested_by}. {review.evidence_kind === "official_html" ? "HTML text block " + review.role_proof?.block : "Physical PDF page " + review.role_proof?.physical_page}.</p>
      {review.is_current_review && review.action === "verify" && <Button size="sm" variant="outline" disabled={locked || frozen} onClick={() => act("preview_revoke", review)}>Preview relationship revocation</Button>}
    </div>)}
    {cursor && <Button size="sm" variant="outline" disabled={locked || frozen} onClick={() => act("more_reviews")}>Load more review history</Button>}
    {busy && <p role="status">Checking office and coverage evidence…</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {result && <p>Decision status: {result.status}. {result.error || ""} No AI credits used. Refresh relationship history to check current evidence.</p>}
  </details>;
}
