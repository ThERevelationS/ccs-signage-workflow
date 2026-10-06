import { useState } from "react";
import RuleCard from "./PermittingRuleCard";
import PermittingApprovedEvidenceSearch from "./PermittingApprovedEvidenceSearch";
import { Button } from "@/components/ui/button";

const rationale = "Reviewed both retained citations and confirmed their recorded authority scope.";
const evidence = { rule_id: "browser-evidence", rule_kind: "regulatory_rule", requirement: "Maximum area is 50 square feet.",
  trigger: "when illuminated", exceptions: "painted wall signs", sign_type: "wall sign", jurisdiction_scope: "Fixture jurisdiction",
  reviewer: "Fixture reviewer", reviewed_at: "2026-10-06", citations: [{ physical_page: 2, excerpt: "Maximum area is 50 square feet." }] };

export default function PermittingReviewBrowserFixture() {
  const [receipt, setReceipt] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(1);
  const [scope, setScope] = useState("fixture-A");
  const [fail, setFail] = useState(false);
  const rule = { id: "fixture-conflict", version, status: "needs_review", confidence: "high", conflict_state: "conflicting_sources",
    rule_category: "submittal_requirement", requirement: "Fixture only — review both retained sources", is_operational: false,
    citations: [{ section_or_page: "PDF page 1", excerpt: "First fixture citation" }, { section_or_page: "PDF page 2", excerpt: "Second fixture citation" }],
    evidence_context: { review_history: [{ operation_id: "fixture-event", action: "edit", reviewer: "Fixture editor",
      reviewed_at: "2026-10-06", before: { version: 1, status: "needs_review" }, after: { version: 2, status: "needs_review" }, changed_fields: ["notes"] }] } };
  async function retrieveEvidence({ cursor }) {
    if (fail) throw Error("Fixture current evidence unavailable");
    return { success: true, evidence: [{ ...evidence, rule_id: cursor ? "browser-instruction" : evidence.rule_id,
      rule_kind: cursor ? "administrative_instruction" : evidence.rule_kind }],
      blocked: cursor ? [] : [{ rule_id: "fixture-blocked", blocker: "Fixture source authority changed" }],
      has_more: !cursor, next_cursor: cursor ? null : "fixture-next", checked_at: new Date().toISOString() };
  }
  return <main className="p-4 max-w-4xl mx-auto space-y-4">
    <h1 className="text-xl font-bold">Isolated permitting browser acceptance</h1>
    <p>Isolated preview. Fixture records and local callbacks; no backend writes, approvals or AI calls. The optional live check below reads approved evidence only.</p>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setBusy(value => !value)}>Toggle fixture busy</Button>
      <Button onClick={() => setVersion(value => value + 1)}>Advance fixture version</Button>
      <Button onClick={() => setScope(value => value === "fixture-A" ? "fixture-B" : "fixture-A")}>Switch fixture jurisdiction</Button>
      <Button onClick={() => setFail(value => !value)}>Toggle fixture retrieval failure</Button>
    </div>
    <RuleCard key={version} rule={rule} expanded={expanded} onToggle={() => setExpanded(value => !value)}
      onApprove={() => setReceipt("Unexpected approval")} onReject={reason => setReceipt("Local rejection: " + reason)}
      onEdit={() => setReceipt("Local edit")} onResolveConflict={reason => setReceipt("Local resolution: " + reason)} actionLoading={busy} />
    <output aria-label="Local callback receipt">{receipt}</output>
    <p className="text-xs">Example rationale: {rationale}</p>
    <PermittingApprovedEvidenceSearch jurisdictionId={scope} jurisdictionName={scope} retrieveEvidence={retrieveEvidence} />
    <details><summary>Live read-only check — Campbell County</summary>
      <PermittingApprovedEvidenceSearch jurisdictionId="6ac19dcc184935c1391ee468" jurisdictionName="Campbell County (live read-only)" />
    </details>
  </main>;
}
