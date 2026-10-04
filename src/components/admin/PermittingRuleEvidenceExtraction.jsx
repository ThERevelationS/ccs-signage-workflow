import { useEffect, useRef, useState } from "react";
import PermittingSourceAuthorityReview from "./PermittingSourceAuthorityReview";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const message = error => error?.response?.data?.error || error?.message || String(error);
async function invoke(name, body) {
  const response = await base44.functions.invoke(name, body);
  return response?.data || response;
}
const unitKey = (jurisdiction, source, page, count) => ["ccs-rule-evidence", jurisdiction, source, page, count].join(":");
const readRequest = key => { try { return sessionStorage.getItem(key) || ""; } catch { return ""; } };
const saveRequest = (key, id) => { try { sessionStorage.setItem(key, id); } catch { /* State still retains the id for this mounted panel. */ } };

export default function PermittingRuleEvidenceExtraction({ jurisdictionName, onImported }) {
  const [sources, setSources] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [sourceCursor, setSourceCursor] = useState(null);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [requestId, setRequestId] = useState("");
  const [receipts, setReceipts] = useState({});
  const generation = useRef(0);
  const source = sources.find(row => row.id === sourceId);
  const key = unitKey(jurisdictionName, sourceId, page, count);
  const selectedRange = sourceId && Number.isInteger(page) && page > 0 && Number.isInteger(count) && count >= 1 && count <= 5;

  useEffect(() => {
    const current = ++generation.current;
    setSources([]); setSourceId(""); setSourceCursor(null); setBusy("sources"); setError("");
    if (!jurisdictionName.trim()) { setBusy(""); return; }
    invoke("permittingRuleExtraction", { action: "sources", jurisdiction_name: jurisdictionName.trim() })
      .then(data => {
        if (generation.current !== current) return;
        if (!data.success) throw Error(data.error || "Could not load sources.");
        setSources(data.sources || []); setSourceCursor(data.next_cursor);
      }).catch(e => { if (generation.current === current) setError(message(e)); })
      .finally(() => { if (generation.current === current) setBusy(""); });
    return () => { generation.current++; };
  }, [jurisdictionName]);

  useEffect(() => {
    setPreview(null); setResult(null); setReceipts({}); setError("");
    setRequestId(readRequest(key));
  }, [key]);

  async function act(action, payload = {}) {
    const current = generation.current;
    setBusy(action); setError("");
    try {
      if (action === "more_sources") {
        const data = await invoke("permittingRuleExtraction", { action: "sources", jurisdiction_name: jurisdictionName.trim(), cursor: sourceCursor });
        if (!data.success) throw Error(data.error || "Could not load sources.");
        if (generation.current === current) { setSources(rows => [...rows, ...(data.sources || [])]); setSourceCursor(data.next_cursor); }
        return;
      }
      if (action === "import_candidate") {
        const data = await invoke("permittingRuleReview", { action, run_id: result.run_id, ...payload });
        if (!data.success) throw Error(data.error || "Import could not be confirmed; check the same candidate again.");
        if (generation.current === current) { setReceipts(rows => ({ ...rows, [payload.candidate_index]: data.rule.id })); onImported(); }
        return;
      }
      let id = requestId;
      if (action === "extract" && !id) {
        id = crypto.randomUUID(); saveRequest(key, id); setRequestId(id);
      }
      const data = await invoke("permittingRuleExtraction", { action, source_document_id: sourceId,
        start_page: page, page_count: count, ...(id ? { request_id: id } : {}) });
      if (generation.current !== current) return;
      if (action === "preview") {
        if (!data.success) throw Error(data.error || "Preview failed.");
        setPreview(data);
      } else if (action === "get_run") {
        const run = data.run;
        if (run && (run.source_document_id !== sourceId || run.start_page !== page || run.page_count !== count))
          throw Error("Stored request belongs to another evidence selection.");
        setResult(run ? { ...run, run_id: run.id } : { status: "not_found", candidates: [],
          error: "No run is visible. Keep this request id; an uncertain create must be reconciled before another analysis." });
        if (run) setReceipts(Object.fromEntries(Object.entries(run.import_receipts || {}).map(([index, receipt]) => [index, receipt.rule_id])));
      } else setResult(data);
    } catch (e) { if (generation.current === current) setError(message(e)); }
    finally { if (generation.current === current) setBusy(""); }
  }

  function sourceReviewed(data) {
    if (data?.review) {
      const review = data.review;
      setSources(rows => rows.map(row => row.id === sourceId ? { ...row, authority_review: review,
        authority_review_state: data.receipt || null, issuing_office: review.publisher_name,
        jurisdiction_scope: review.scope_label, verification_status: review.status === "active" ? "verified" : "needs_verification" } : row));
      setPreview(null); setResult(null); setReceipts({}); setRequestId("");
      try { sessionStorage.removeItem(key); } catch { /* Prior analyses remain retained in the backend. */ }
    }
    onImported();
  }

  function newAnalysis() {
    const id = crypto.randomUUID(); saveRequest(key, id); setRequestId(id); setResult(null); setReceipts({});
  }
  return <Card><CardContent className="pt-4 space-y-3">
    <div className="font-semibold">Extract requirements from retained pages</div>
    <p className="text-sm text-gray-600">Select a document and preview its physical PDF pages. Manual analysis is outside automated queue limits. Each action analyzes only these selected pages. Candidates remain pending staff review.</p>
    <div className="grid gap-2 md:grid-cols-3">
      <div><Label>Source document</Label><Select value={sourceId} onValueChange={setSourceId} disabled={Boolean(busy)}>
        <SelectTrigger><SelectValue placeholder="Select an archived source" /></SelectTrigger>
        <SelectContent>{sources.map(row => <SelectItem key={row.id} value={row.id}>{row.title || row.id}</SelectItem>)}</SelectContent>
      </Select></div>
      <div><Label htmlFor="rule-start-page">First physical PDF page</Label><Input id="rule-start-page" type="number" min="1" value={page} disabled={Boolean(busy)} onChange={e => setPage(Number(e.target.value))} /></div>
      <div><Label htmlFor="rule-page-count">Number of pages</Label><Input id="rule-page-count" type="number" min="1" max="5" value={count} disabled={Boolean(busy)} onChange={e => setCount(Number(e.target.value))} /></div>
    </div>
    {sourceCursor && <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => act("more_sources")}>Load more sources</Button>}
    {source && <div className="text-sm text-gray-600">
      <div>{source.authority_classification?.replaceAll("_", " ")} · {source.verification_status?.replaceAll("_", " ")}</div>
      <div>{source.text_extraction_state?.pages_extracted || 0} physical pages retained{source.text_extraction_state?.total_pages ? " of " + source.text_extraction_state.total_pages : ""}.
        {!source.text_extraction_state?.method && " This source needs retained PDF page evidence before this extraction route can be used."}</div>
      {source.official_url && <a className="underline" href={source.official_url} target="_blank" rel="noopener noreferrer">Open official source</a>}
    </div>}
    {source && <PermittingSourceAuthorityReview key={source.id} source={source} disabled={Boolean(busy)}
      onBusy={value => setBusy(previous => value ? "authority_review" : previous === "authority_review" ? "" : previous)}
      onReviewed={sourceReviewed} />}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={Boolean(busy) || !selectedRange} onClick={() => act("preview")}>Preview selected pages</Button>
      <Button size="sm" disabled={Boolean(busy) || !preview || Boolean(result)} onClick={() => act("extract")}>Analyze selected pages</Button>
      {requestId && <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => act("get_run")}>Check saved result</Button>}
      {["complete", "failed"].includes(result?.status) && <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={newAnalysis}>Start another manual analysis</Button>}
    </div>
    {busy && <p className="text-sm" role="status">Working…</p>}
    {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    {preview && <details className="text-sm"><summary className="cursor-pointer">Retained page preview ({preview.context_characters} characters)</summary>
      {(preview.evidence || []).map(row => <div key={row.page} className="mt-2"><strong>Physical PDF page {row.page}</strong><pre className="whitespace-pre-wrap text-xs max-h-64 overflow-auto">{row.text}</pre></div>)}
    </details>}
    {requestId && <div className="text-xs text-gray-500 break-all">Saved manual request: {requestId}</div>}
    {result && <div className="space-y-2">
      <p className="text-sm">Analysis status: {result.status}. {(result.candidates || []).length} candidates staged; {result.llm_attempts || 0} research attempts recorded.</p>
      {result.error && <p className="text-sm text-amber-800">{result.error}</p>}
      {["llm_started", "llm_uncertain", "run_uncertain", "not_found"].includes(result.status) && <p className="text-sm text-amber-800">Check this saved result to reconcile the request. Another AI attempt is not started automatically.</p>}
      {(result.rejected || []).length > 0 && <details className="text-sm"><summary>Rejected unsupported candidates ({result.rejected.length})</summary>{result.rejected.map((row, i) => <div key={i}>{row.index}: {row.reason}</div>)}</details>}
      {result.status === "complete" && (result.candidates || []).map((candidate, index) => <div key={candidate.extraction_key || index} className="border rounded p-3 text-sm space-y-1">
        <div className="font-medium">{candidate.requirement}</div>
        <div>{candidate.rule_category.replaceAll("_", " ")} · {candidate.citations?.[0]?.section_or_page} · {candidate.citations?.[0]?.verification_status.replaceAll("_", " ")}</div>
        <blockquote className="text-gray-600">{candidate.citations?.[0]?.excerpt}</blockquote>
        <div className="text-xs text-gray-500">Selected-page evidence. This is not a full-code review.</div>
        <Button size="sm" variant="outline" disabled={Boolean(busy) || Boolean(receipts[index])} onClick={() => act("import_candidate", { candidate_index: index })}>{receipts[index] ? "Imported for staff review" : "Import for staff review"}</Button>
      </div>)}
    </div>}
  </CardContent></Card>;
}
