import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function retrieve(payload) {
  const response = await base44.functions.invoke("permittingRuleReview", { action: "retrieve_evidence", ...payload });
  return response?.data || response;
}

export default function PermittingApprovedEvidenceSearch({ jurisdictionId, jurisdictionName, disabled = false, retrieveEvidence = retrieve }) {
  const [result, setResult] = useState(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0), inFlight = useRef(false);
  const currentScope = useRef(jurisdictionId);
  currentScope.current = jurisdictionId;
  useEffect(() => {
    generation.current++;
    inFlight.current = false;
    setResult(null); setQuery(""); setBusy(false); setError("");
    return () => { generation.current++; };
  }, [jurisdictionId]);

  async function load(more = false) {
    if (inFlight.current || disabled || !jurisdictionId) return;
    inFlight.current = true;
    const request = ++generation.current, scope = jurisdictionId;
    const current = () => generation.current === request && currentScope.current === scope;
    setBusy(true); setError("");
    if (!more) setResult(null);
    try {
      const data = await retrieveEvidence({ jurisdiction_id: scope, limit: 25, ...(more ? { cursor: result.next_cursor } : {}) });
      if (!current()) return;
      if (!data?.success) throw Error(data?.error || "Could not verify approved evidence.");
      const rows = (data.evidence || []).map(row => ({ ...row, checked_at: data.checked_at }));
      setResult(previous => {
        const blockedIds = new Set((data.blocked || []).map(row => row.rule_id));
        const verifiedIds = new Set(rows.map(row => row.rule_id));
        return { ...data, evidence_scope: scope,
          evidence: more ? [...new Map([...(previous?.evidence || []).filter(row => !blockedIds.has(row.rule_id)), ...rows].map(row => [row.rule_id, row])).values()] : rows,
          blocked: more ? [...new Map([...(previous?.blocked || []).filter(row => !verifiedIds.has(row.rule_id)), ...(data.blocked || [])].map(row => [row.rule_id, row])).values()] : data.blocked || [],
        };
      });
    } catch (e) {
      if (current()) { setResult(null); setError(e?.response?.data?.error || e.message || "Evidence retrieval failed."); }
    } finally {
      if (current()) { inFlight.current = false; setBusy(false); }
    }
  }

  const visibleResult = result?.evidence_scope === jurisdictionId ? result : null;
  const needle = query.trim().toLowerCase();
  const matching = (visibleResult?.evidence || []).filter(row => !needle ||
    [row.requirement, row.trigger, row.exceptions, row.sign_type, row.zoning_district_applicability, row.rule_category,
      ...(row.citations || []).map(citation => citation.excerpt)].some(value => String(value || "").toLowerCase().includes(needle)));

  return <section className="rounded border p-3 space-y-3" aria-label="Approved permitting evidence">
    <h3 className="font-semibold">Search approved requirements — {jurisdictionName}</h3>
    <p className="text-sm text-gray-600">Answers below quote staff-approved evidence for this jurisdiction. Confirm the property, zoning district, sign type and exceptions before using a requirement for a job.</p>
    <Button size="sm" variant="outline" disabled={busy || disabled || !jurisdictionId} onClick={() => load(false)}>
      {busy ? "Checking evidence…" : visibleResult ? "Refresh approved evidence" : "Load approved evidence"}
    </Button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {visibleResult && <>
      <div><Label htmlFor={"approved-query-" + jurisdictionId}>Search loaded verified evidence</Label>
        <Input id={"approved-query-" + jurisdictionId} value={query} placeholder="Enter words from a requirement or citation" onChange={event => setQuery(event.target.value)} /></div>
      <p className="text-sm" role="status">{matching.length} matching requirements in {visibleResult.evidence.length} loaded verified records.
        {visibleResult.has_more ? " More approved records remain; load the next page to broaden this search." : " End of this page sequence. Records can change between loads; refresh before use."}
        {" "}No match does not establish that a permit is unnecessary. Address applicability still requires review.</p>
      {matching.map(row => <article key={row.rule_id} className="rounded border p-3 space-y-2 text-sm">
        <p className="font-semibold">{row.rule_kind === "administrative_instruction" ? "Reviewed submission instruction" : "Reviewed regulatory requirement"}</p>
        <p className="whitespace-pre-wrap">{row.requirement}</p>
        {row.trigger && <p className="whitespace-pre-wrap"><strong>Condition:</strong> {row.trigger}</p>}
        {row.exceptions && <p className="whitespace-pre-wrap"><strong>Exceptions:</strong> {row.exceptions}</p>}
        <p>Sign type: {row.sign_type || "Not established"} · District: {row.zoning_district_applicability || "Not established"}</p>
        <p>Authority scope: {typeof row.jurisdiction_scope === "string" ? row.jurisdiction_scope : row.jurisdiction_scope ? JSON.stringify(row.jurisdiction_scope) : "Not established"}</p>
        <p className="text-xs text-gray-600">Reviewed by {row.reviewer || "Not recorded"} · {row.reviewed_at || "Review date not recorded"} · Evidence checked {row.checked_at}. This is a snapshot; refresh after source or rule changes.</p>
        {(row.citations || []).map((citation, index) => <blockquote key={index} className="border-l-2 pl-2 space-y-1">
          <p>{citation.section_or_page || (citation.physical_page ? "Physical PDF page " + citation.physical_page : "Page not recorded")}</p>
          <p className="whitespace-pre-wrap">“{citation.excerpt}”</p>
          <div className="flex gap-3">
            {citation.official_url && <a className="underline" href={citation.official_url} target="_blank" rel="noopener noreferrer">Official source</a>}
            {citation.archived_file_url && <a className="underline" href={citation.archived_file_url} target="_blank" rel="noopener noreferrer">Retained document</a>}
          </div>
        </blockquote>)}
      </article>)}
      {visibleResult.blocked.length > 0 && <details><summary>{visibleResult.blocked.length} approved records blocked by current evidence checks</summary>
        <p className="text-sm">These records cannot support answers until their evidence is reviewed.</p>
        {visibleResult.blocked.map(row => <p key={row.rule_id} className="text-sm">{row.rule_id}: {row.blocker}</p>)}
      </details>}
      {visibleResult.has_more && <Button size="sm" variant="outline" disabled={busy || disabled} onClick={() => load(true)}>Load next evidence page</Button>}
    </>}
  </section>;
}
