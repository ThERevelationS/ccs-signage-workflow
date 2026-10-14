import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { officeCandidateEvidence } from "./officeCandidateEvidence.mjs";
import { loadOfficeIdentityPreview, officePreviewSelectionKey } from "./officeIdentityPreviewRequest.mjs";

export default function OfficeIdentityLivePreview({ office }) {
  const selection = officePreviewSelectionKey(office);
  const evidence = officeCandidateEvidence(office);
  const current = useRef(selection), generation = useRef(0), mounted = useRef(true), inFlight = useRef(null);
  const [view, setView] = useState(null);
  if (current.current !== selection) {
    current.current = selection;
    generation.current += 1;
    inFlight.current = null;
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; inFlight.current = null; };
  }, []);
  const visible = view?.selection === selection ? view : null;
  async function preview() {
    if (!evidence || evidence.gaps.length || inFlight.current?.selection === selection) return;
    const ticket = ++generation.current;
    inFlight.current = { selection, ticket };
    setView({ selection, busy: true });
    try {
      const result = await loadOfficeIdentityPreview({ office: JSON.parse(JSON.stringify(office)),
        settingsEntity: base44.entities.GlobalSettings, invoke: (name, body) => base44.functions.invoke(name, body) });
      if (mounted.current && current.current === selection && generation.current === ticket)
        setView({ selection, result, receivedAt: new Date().toISOString() });
    } catch (error) {
      if (mounted.current && current.current === selection && generation.current === ticket)
        setView({ selection, error: error?.response?.data?.error || error.message || "Identity preview unavailable." });
    } finally {
      if (inFlight.current?.ticket === ticket) inFlight.current = null;
    }
  }
  if (!evidence) return null;
  const result = visible?.result, snapshot = result?.review_snapshot;
  return <section aria-label="Fresh saved identity evidence preview" className="border-t border-amber-200 pt-2 space-y-2">
    <h6 className="font-semibold">Preview freshly saved evidence</h6>
    <p>Reads the saved office catalog, source, profile and retained page. No website scan, AI research, approval or save.</p>
    <button type="button" className="rounded border px-3 py-2 text-xs disabled:opacity-50"
      disabled={Boolean(visible?.busy || evidence.gaps.length)} onClick={preview}>
      {visible?.busy ? "Checking saved evidence…" : "Preview saved identity evidence"}
    </button>
    {visible?.busy && <p role="status">Checking this exact candidate and its saved evidence…</p>}
    {visible?.error && <p role="alert" className="text-red-700">{visible.error}</p>}
    {snapshot && <div className="rounded border bg-white p-2 space-y-2">
      <p className="font-medium">Read-only preview received {visible.receivedAt}. Identity still requires review.</p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {[
          ["Classification at registration", snapshot.historical_registration.source.authority_classification],
          ["Current saved classification", snapshot.current_evidence.source.authority_classification],
          ["Current saved currentness", snapshot.current_evidence.source.content_status],
          ["Catalog version", snapshot.catalog.updated_date],
          ["Source version", snapshot.source_updated_date],
          ["Profile version", snapshot.profile_updated_date],
          ["Physical PDF page", snapshot.current_evidence.proof.physical_page],
          ["Review snapshot SHA-256", result.review_snapshot_sha256],
        ].map(([label, value]) => <div key={label} className="min-w-0">
          <dt className="font-medium">{label}</dt><dd className="break-all">{value || "Unknown"}</dd>
        </div>)}
      </dl>
      <ul className="list-disc pl-4">{result.unresolved_identity.map((gap, index) => <li key={index}>{gap}</li>)}</ul>
      <p>This is a snapshot, not a continuing lock on records. Recheck after changes. Identity, contacts, roles, currentness, commercial-sign applicability and delegation are unapproved.</p>
    </div>}
  </section>;
}
