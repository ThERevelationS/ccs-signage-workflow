import { useEffect, useRef, useState } from "react";
import { invokePermittingReview } from "@/api/permittingReviewClient";
import { Button } from "@/components/ui/button";
import { LOCALITY_AUTHORITY_ROLES } from "./localityAuthorityVerification";
const roleLabels = new Map(LOCALITY_AUTHORITY_ROLES);
function safeUrl(value) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : ""; }
  catch { return ""; }
}
async function retrieve(payload) {
  const response = await invokePermittingReview({ ...payload, action: "retrieve_office_authority" });
  return response?.data || response;
}

export default function LocalityOfficeEvidence({ jurisdictionId, retrieveEvidence = retrieve }) {
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const requestId = useRef(0), inFlight = useRef(false), scope = useRef(jurisdictionId);
  scope.current = jurisdictionId;
  useEffect(() => {
    requestId.current++; inFlight.current = false; setResult(null); setBusy(false); setError("");
    return () => { requestId.current++; };
  }, [jurisdictionId]);
  const visible = result?.jurisdiction_id === jurisdictionId ? result : null;
  async function load(more = false) {
    if (inFlight.current || !jurisdictionId || (more && !visible?.next_cursor)) return;
    const id = ++requestId.current, currentScope = jurisdictionId;
    const current = () => requestId.current === id && scope.current === currentScope;
    inFlight.current = true; setBusy(true); setError("");
    if (!more) setResult(null);
    try {
      const data = await retrieveEvidence({ jurisdiction_id: currentScope, ...(more ? {
        cursor: visible.next_cursor, expected_profile_updated_date: visible.profile_updated_date,
      } : {}) });
      if (!current()) return;
      if (!data?.success || data.jurisdiction_id !== currentScope) throw Error(data?.error || "Office evidence could not be verified for this locality.");
      const rows = data.items.map(row => ({ ...row, checked_at: data.checked_at }));
      setResult(previous => ({ ...data, items: more
        ? [...new Map([...(previous?.items || []), ...rows].map(row => [row.id, row])).values()]
        : rows }));
    } catch (e) {
      if (current()) { setResult(null); setError(e?.response?.data?.error || e.message || "Office verification failed."); }
    } finally { if (current()) { inFlight.current = false; setBusy(false); } }
  }
  return <section aria-label="Reviewed office responsibility" className="min-w-0 space-y-3 rounded border bg-white p-3">
    <h3 className="font-semibold">Reviewed office roles and coverage</h3>
    <p className="text-sm text-gray-600">Checks the office identity, responsibility quote and explicitly covered area. Confirm the property separately; this does not resolve address authority or create job steps.</p>
    <Button size="sm" variant="outline" className="min-h-11 h-auto max-w-full whitespace-normal py-2 text-left" disabled={busy || !jurisdictionId} onClick={() => load()}>{busy ? "Checking office evidence…" : visible ? "Refresh office evidence" : "Load reviewed office evidence"}</Button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {visible && <>
      <p className="text-xs text-gray-600">Latest page checked {visible.checked_at}. {visible.items.length} loaded review records.</p>
      {!visible.items.length && <p className="text-sm text-amber-800">No committed office relationship reviews are recorded. A department contact alone does not establish responsibility.</p>}
      {visible.items.map(row => {
        const verified = row.verified === true && row.is_current_review === true && row.state === "staff_verified" && row.action === "verify";
        return <article key={row.id} className="min-w-0 space-y-1 rounded border p-3 text-sm [overflow-wrap:anywhere]">
          <h4 className="font-semibold">{row.office_snapshot?.name || "Office identity unavailable"} — {roleLabels.get(row.role) || row.role_label || row.role}</h4>
          <p className={verified ? "text-green-800" : "text-amber-800"}>{verified ? "Current staff-verified relationship" : `Not verified for use — ${row.state || "needs_review"}`}</p>
          <p>Covered area: {row.coverage_area || "Not established"}{row.coverage_kind === "unincorporated" ? " (unincorporated area only)" : ""}</p>
          <p>{row.reason}</p>
          <p className="text-xs text-gray-600">Reviewed by {row.requested_by || "Unknown reviewer"} · {row.requested_at || "Date unavailable"}</p>
          <p className="text-xs text-gray-600">Evidence checked {row.checked_at}. Refresh before use.</p>
          {verified && <>
            <blockquote className="whitespace-pre-wrap border-l-2 pl-2">{row.role_proof?.excerpt}</blockquote>
            <p className="text-xs">{row.role_proof?.physical_page ? `Physical PDF page ${row.role_proof.physical_page}` : `Retained HTML block ${row.role_proof?.block ?? "unknown"}`}</p>
            <div className="flex flex-wrap gap-x-4">{[[row.official_url, "Open responsibility source"], [row.archived_file_url, "Open retained source"], [row.office_snapshot?.source_url, "Open office identity source"]].map(([url, label]) => safeUrl(url) && <a key={label} href={safeUrl(url)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-blue-700 underline">{label}</a>)}</div>
          </>}
        </article>;
      })}
      {visible.has_more ? <Button size="sm" variant="outline" className="min-h-11 h-auto max-w-full whitespace-normal py-2 text-left" disabled={busy} onClick={() => load(true)}>Load more office reviews</Button>
        : <p className="text-xs text-gray-600">End of this review sequence. Sources can change; refresh before use.</p>}
    </>}
  </section>;
}
