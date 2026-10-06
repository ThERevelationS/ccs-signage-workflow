import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Edit, Loader2, AlertTriangle, FileText, Clock, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";

const STATUS_COLORS = {
  extracted: "bg-blue-100 text-blue-800",
  needs_review: "bg-amber-100 text-amber-800",
  staff_approved: "bg-green-100 text-green-800",
  staff_rejected: "bg-red-100 text-red-800",
  superseded: "bg-gray-300 text-gray-700 line-through",
  historical: "bg-purple-100 text-purple-800",
};

const CONFLICT_COLORS = {
  none: "bg-gray-100 text-gray-600",
  conflicting_sources: "bg-orange-100 text-orange-800",
  under_review: "bg-yellow-100 text-yellow-800",
};

const CONFIDENCE_COLORS = {
  high: "bg-green-100 text-green-700",
  medium: "bg-blue-100 text-blue-700",
  low: "bg-amber-100 text-amber-700",
};

export default function RuleCard({ rule, expanded, onToggle, onApprove, onReject, onEdit, onResolveConflict, actionLoading }) {
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [resolutionReason, setResolutionReason] = useState("");
  const [citationsReviewed, setCitationsReviewed] = useState(false);

  return (
    <Card className={rule.is_operational ? "border-green-300" : rule.draft_context ? "border-purple-200" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500" role="button" tabIndex={0}
            aria-expanded={expanded} aria-controls={"rule-evidence-" + rule.id} aria-label={"Review evidence: " + rule.requirement}
            onClick={onToggle} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onToggle(); } }}>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge className={STATUS_COLORS[rule.status] || "bg-gray-100"} variant="secondary">{rule.status.replace(/_/g, " ")}</Badge>
              <Badge className={CONFIDENCE_COLORS[rule.confidence] || ""} variant="secondary">{rule.confidence}</Badge>
              {rule.conflict_state !== "none" && <Badge className={CONFLICT_COLORS[rule.conflict_state]} variant="secondary"><AlertTriangle className="w-3 h-3 mr-1" />{rule.conflict_state.replace(/_/g, " ")}</Badge>}
              {rule.is_operational && <Badge className="bg-green-600 text-white" variant="secondary"><ShieldCheck className="w-3 h-3 mr-1" />Operational</Badge>}
              {rule.rule_kind === "administrative_instruction" && <Badge className="bg-blue-100 text-blue-800" variant="secondary">{rule.is_workflow_instruction ? "Reviewed submission instruction" : "Submission instruction"}</Badge>}
              {rule.draft_context && <Badge className="bg-purple-200 text-purple-800" variant="secondary">Draft</Badge>}
            </div>
            <div className="text-sm font-medium text-gray-900 line-clamp-2">{rule.requirement}</div>
            <div className="text-xs text-gray-500 mt-1">
              {rule.rule_category.replace(/_/g, " ")} {rule.sign_type && `· ${rule.sign_type}`} {rule.zoning_district_applicability && `· ${rule.zoning_district_applicability}`}
              {rule.numeric_value != null && ` · ${rule.numeric_value} ${rule.unit || ""}`}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {rule.status !== "staff_approved" && rule.status !== "superseded" && !rule.draft_context && rule.status !== "historical" && (
              <Button size="sm" variant="outline" onClick={onApprove} disabled={actionLoading || rule.conflict_state === "conflicting_sources"} className="text-green-600 border-green-300 hover:bg-green-50">
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                Approve
              </Button>
            )}
            {rule.status !== "staff_rejected" && rule.status !== "superseded" && (
              <Button size="sm" variant="outline" onClick={() => setRejectMode(!rejectMode)} disabled={actionLoading} className="text-red-600 border-red-300 hover:bg-red-50">
                <XCircle className="w-3 h-3 mr-1" />Reject
              </Button>
            )}
            <Button size="sm" variant="ghost" aria-label="Edit rule" onClick={onEdit} disabled={actionLoading || rule.status === "superseded"}><Edit className="w-3 h-3" /></Button>
            <Button size="sm" variant="ghost" aria-label={expanded ? "Collapse rule evidence" : "Expand rule evidence"} aria-expanded={expanded} aria-controls={"rule-evidence-" + rule.id} onClick={onToggle}>{expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</Button>
          </div>
        </div>

        {rejectMode && (
          <div className="mt-2 flex gap-2">
            <Input aria-label="Rejection reason (optional)" placeholder="Rejection reason (optional)" maxLength={2000} disabled={actionLoading} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <Button size="sm" variant="destructive" disabled={actionLoading || rule.status === "superseded"} onClick={() => { if (actionLoading || rule.status === "superseded") return; onReject(rejectReason); setRejectMode(false); }}>Confirm Reject</Button>
          </div>
        )}

        {expanded && (
          <div id={"rule-evidence-" + rule.id} className="mt-3 pt-3 border-t space-y-2 text-sm">
            {rule.conflict_state === "conflicting_sources" && <div className="rounded border border-orange-200 p-3 space-y-2">
              <p className="font-semibold">Resolve conflicting evidence</p>
              <p>Review every citation below and explain why this requirement is supported. Missing or outdated authority must be corrected first. Recording a resolution returns this rule to staff review.</p>
              <Label htmlFor={"conflict-reason-" + rule.id}>Resolution rationale</Label>
              <Textarea id={"conflict-reason-" + rule.id} value={resolutionReason} maxLength={2000} disabled={actionLoading} onChange={e => setResolutionReason(e.target.value)} />
              <label className="flex items-start gap-2"><input type="checkbox" checked={citationsReviewed} disabled={actionLoading} onChange={e => setCitationsReviewed(e.target.checked)} />I reviewed every cited source and its applicability to this requirement.</label>
              <Button size="sm" variant="outline" disabled={actionLoading || !citationsReviewed || resolutionReason.trim().length < 30} onClick={() => onResolveConflict(resolutionReason)}>Record resolution for staff review</Button>
            </div>}
            {(rule.evidence_context?.conflict_resolutions || []).length > 0 && <details><summary>Conflict resolution history</summary>{rule.evidence_context.conflict_resolutions.map((row, index) => <div key={index} className="border rounded p-2 mt-1"><p>{row.rationale}</p><p className="text-xs">{row.reviewer} · {row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : ""} · Rule version {row.rule_version}</p></div>)}</details>}
            {rule.trigger && <div><span className="font-semibold">Trigger:</span> {rule.trigger}</div>}
            {rule.exceptions && <div><span className="font-semibold">Exceptions:</span> {rule.exceptions}</div>}
            {rule.effective_date && <div><span className="font-semibold">Effective:</span> {rule.effective_date}</div>}
            {Array.isArray(rule.evidence_context?.review_history) && rule.evidence_context.review_history.length > 0 && <details>
              <summary>Staff review history ({rule.evidence_context.review_history.length})</summary>
              {rule.evidence_context.review_history.map((event, index) => <div key={event.operation_id || index} className="border rounded p-2 mt-1 text-xs">
                <p>{event.action} · {event.reviewer || event.reviewer_email} · {event.reviewed_at ? new Date(event.reviewed_at).toLocaleString() : "—"}</p>
                <p>Version {event.before?.version} → {event.after?.version} · {event.before?.status} → {event.after?.status}</p>
                {event.changed_fields?.length > 0 && <p>Changed: {event.changed_fields.join(", ")}</p>}
              </div>)}
            </details>}
            {rule.reviewer && <div className="text-xs text-gray-500"><Clock className="w-3 h-3 inline mr-1" />Reviewed by {rule.reviewer} on {rule.reviewed_at ? new Date(rule.reviewed_at).toLocaleDateString() : "—"}</div>}
            <div>
              <span className="font-semibold">Citations:</span>
              <div className="mt-1 space-y-2">
                {(rule.citations || []).map((c, i) => (
                  <div key={i} className="bg-gray-50 rounded p-2 border-l-2 border-indigo-300">
                    <div className="flex items-center gap-2 text-xs">
                      <FileText className="w-3 h-3 text-gray-400" />
                      <span className="font-medium">{c.section_or_page || "—"}</span>
                      {c.verification_status === "draft_context" && <Badge className="bg-purple-100 text-purple-700" variant="secondary">draft</Badge>}
                      {c.verification_status === "historical" && <Badge className="bg-purple-100 text-purple-700" variant="secondary">historical</Badge>}
                      {c.official_url && <a href={c.official_url} target="_blank" rel="noopener noreferrer" className="text-indigo-500 underline">source</a>}
                    </div>
                    <div className="text-xs text-gray-700 mt-1 italic">"{c.excerpt}"</div>
                  </div>
                ))}
                {(!rule.citations || rule.citations.length === 0) && <span className="text-red-500 text-xs">No citations — this rule needs review.</span>}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}