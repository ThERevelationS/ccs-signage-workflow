import { useEffect, useState, useCallback } from "react";
import PermittingRuleEvidenceExtraction from "./PermittingRuleEvidenceExtraction";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Scale,
  CheckCircle,
  XCircle,
  Edit,
  Loader2,
  AlertTriangle,
  FileText,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

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

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "permit_applicability", label: "Permit Applicability" },
  { value: "sign_type_rule", label: "Sign Type Rule" },
  { value: "dimensional", label: "Dimensional" },
  { value: "illumination_electronic", label: "Illumination / Electronic" },
  { value: "submittal_requirement", label: "Submittal Requirement" },
  { value: "fee_timing", label: "Fee / Timing" },
  { value: "exemption", label: "Exemption" },
  { value: "procedure", label: "Procedure" },
  { value: "other", label: "Other" },
];

const STATUSES = [
  { value: "", label: "All Statuses" },
  { value: "extracted", label: "Extracted" },
  { value: "needs_review", label: "Needs Review" },
  { value: "staff_approved", label: "Staff Approved" },
  { value: "staff_rejected", label: "Staff Rejected" },
  { value: "superseded", label: "Superseded" },
  { value: "historical", label: "Historical" },
];

const CONFLICT_STATES = [
  { value: "", label: "All Conflict States" },
  { value: "none", label: "None" },
  { value: "conflicting_sources", label: "Conflicting Sources" },
  { value: "under_review", label: "Under Review" },
];

export default function PermittingRulesReview() {
  const [rules, setRules] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ jurisdiction_name: "Boone County", rule_category: "", status: "", confidence: "", conflict_state: "" });
  const [expandedId, setExpandedId] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [editDialog, setEditDialog] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);

  const loadRules = useCallback(async (reset = true) => {
    setLoading(true);
    setError(null);
    try {
      const filterPayload = { action: "list", limit: 50 };
      for (const [k, v] of Object.entries(filters)) {
        if (v) filterPayload[k] = v;
      }
      if (!reset && cursor) filterPayload.cursor = cursor;
      const res = await base44.functions.invoke("permittingRuleReview", filterPayload);
      const data = res?.data || res;
      if (!data?.success) throw new Error(data?.error || "Failed to load rules");
      if (reset) {
        setRules(data.rules || []);
      } else {
        setRules((prev) => [...prev, ...(data.rules || [])]);
      }
      setHasMore(data.has_more || false);
      setCursor(data.next_cursor || null);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [filters, cursor]);

  const loadCounts = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("permittingRuleReview", {
        action: "counts",
        jurisdiction_name: filters.jurisdiction_name || undefined,
      });
      const data = res?.data || res;
      if (data?.success) setCounts(data);
    } catch {
      // Counts can be retried independently of the rule list.
    }
  }, [filters.jurisdiction_name]);

  useEffect(() => { loadRules(true); loadCounts(); }, [filters.jurisdiction_name]);
  useEffect(() => { loadRules(true); }, [filters.rule_category, filters.status, filters.confidence, filters.conflict_state]);

  const handleApprove = async (rule) => {
    setActionLoading(rule.id);
    try {
      const res = await base44.functions.invoke("permittingRuleReview", {
        action: "approve",
        rule_id: rule.id,
        expected_version: rule.version,
      });
      const data = res?.data || res;
      if (!data?.success) throw new Error(data?.error || "Approval failed");
      setRules((prev) => prev.map((r) => r.id === rule.id ? data.rule : r));
      loadCounts();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || String(e));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (rule, reason = "") => {
    setActionLoading(rule.id);
    try {
      const res = await base44.functions.invoke("permittingRuleReview", {
        action: "reject",
        rule_id: rule.id,
        expected_version: rule.version,
        reason,
      });
      const data = res?.data || res;
      if (!data?.success) throw new Error(data?.error || "Rejection failed");
      setRules((prev) => prev.map((r) => r.id === rule.id ? data.rule : r));
      loadCounts();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || String(e));
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!editDialog) return;
    setActionLoading("edit");
    try {
      const res = await base44.functions.invoke("permittingRuleReview", {
        action: "edit",
        rule_id: editDialog.rule.id,
        expected_version: editDialog.rule.version,
        edits: editDialog.edits,
      });
      const data = res?.data || res;
      if (!data?.success) throw new Error(data?.error || "Edit failed");
      setRules((prev) => prev.map((r) => r.id === editDialog.rule.id ? data.rule : r));
      setEditDialog(null);
      loadCounts();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || String(e));
    } finally {
      setActionLoading(null);
    }
  };

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-indigo-600" />
          <h2 className="text-xl font-bold">Permitting Rules Engine</h2>
        </div>
      </div>

      <PermittingRuleEvidenceExtraction key={filters.jurisdiction_name} jurisdictionName={filters.jurisdiction_name} onImported={() => { loadRules(true); loadCounts(); }} />

      {/* Summary cards */}
      {counts && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Card><CardContent className="pt-3 pb-3"><div className="text-xs text-gray-500">Total Rules</div><div className="text-2xl font-bold">{counts.total}</div></CardContent></Card>
          <Card><CardContent className="pt-3 pb-3"><div className="text-xs text-gray-500">Operational</div><div className="text-2xl font-bold text-green-600">{counts.operational}</div></CardContent></Card>
          <Card><CardContent className="pt-3 pb-3"><div className="text-xs text-gray-500">Needs Review</div><div className="text-2xl font-bold text-amber-600">{counts.needs_review}</div></CardContent></Card>
          <Card><CardContent className="pt-3 pb-3"><div className="text-xs text-gray-500">Draft Context</div><div className="text-2xl font-bold text-purple-600">{counts.draft_context}</div></CardContent></Card>
          <Card><CardContent className="pt-3 pb-3"><div className="text-xs text-gray-500">By Status</div><div className="text-xs mt-1 space-y-0.5">{(counts.by_status||[]).map(r => <div key={r._id||r.status}>{r._id||r.status}: {r.count}</div>)}</div></CardContent></Card>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Input placeholder="Jurisdiction" value={filters.jurisdiction_name} onChange={(e) => setFilter("jurisdiction_name", e.target.value)} />
        <Select value={filters.rule_category || "all"} onValueChange={(v) => setFilter("rule_category", v === "all" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value || "all"}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.status || "all"} onValueChange={(v) => setFilter("status", v === "all" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value || "all"}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.conflict_state || "all"} onValueChange={(v) => setFilter("conflict_state", v === "all" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Conflict" /></SelectTrigger>
          <SelectContent>{CONFLICT_STATES.map(c => <SelectItem key={c.value} value={c.value || "all"}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.confidence || "all"} onValueChange={(v) => setFilter("confidence", v === "all" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Confidence" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Confidence</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

      {/* Rules list */}
      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : rules.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-gray-500">No rules found. Select retained document pages and import a cited candidate for review.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              expanded={expandedId === rule.id}
              onToggle={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
              onApprove={() => handleApprove(rule)}
              onReject={(reason) => handleReject(rule, reason)}
              onEdit={() => setEditDialog({ rule, edits: { requirement: rule.requirement, trigger: rule.trigger, exceptions: rule.exceptions, notes: rule.notes } })}
              actionLoading={actionLoading === rule.id}
            />
          ))}
          {hasMore && (
            <Button variant="outline" onClick={() => loadRules(false)} className="w-full">
              Load More
            </Button>
          )}
        </div>
      )}

      {/* Edit dialog */}
      {editDialog && (
        <Dialog open onOpenChange={(v) => !v && setEditDialog(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Rule</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Requirement</Label>
                <Textarea value={editDialog.edits.requirement || ""} onChange={(e) => setEditDialog(d => ({ ...d, edits: { ...d.edits, requirement: e.target.value } }))} rows={3} />
              </div>
              <div>
                <Label>Trigger</Label>
                <Input value={editDialog.edits.trigger || ""} onChange={(e) => setEditDialog(d => ({ ...d, edits: { ...d.edits, trigger: e.target.value } }))} />
              </div>
              <div>
                <Label>Exceptions</Label>
                <Textarea value={editDialog.edits.exceptions || ""} onChange={(e) => setEditDialog(d => ({ ...d, edits: { ...d.edits, exceptions: e.target.value } }))} rows={2} />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={editDialog.edits.notes || ""} onChange={(e) => setEditDialog(d => ({ ...d, edits: { ...d.edits, notes: e.target.value } }))} rows={2} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditDialog(null)}>Cancel</Button>
                <Button onClick={handleSaveEdit} disabled={actionLoading === "edit"}>
                  {actionLoading === "edit" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Edit
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function RuleCard({ rule, expanded, onToggle, onApprove, onReject, onEdit, actionLoading }) {
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  return (
    <Card className={rule.is_operational ? "border-green-300" : rule.draft_context ? "border-purple-200" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge className={STATUS_COLORS[rule.status] || "bg-gray-100"} variant="secondary">{rule.status.replace(/_/g, " ")}</Badge>
              <Badge className={CONFIDENCE_COLORS[rule.confidence] || ""} variant="secondary">{rule.confidence}</Badge>
              {rule.conflict_state !== "none" && <Badge className={CONFLICT_COLORS[rule.conflict_state]} variant="secondary"><AlertTriangle className="w-3 h-3 mr-1" />{rule.conflict_state.replace(/_/g, " ")}</Badge>}
              {rule.is_operational && <Badge className="bg-green-600 text-white" variant="secondary"><ShieldCheck className="w-3 h-3 mr-1" />Operational</Badge>}
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
              <Button size="sm" variant="outline" onClick={onApprove} disabled={actionLoading} className="text-green-600 border-green-300 hover:bg-green-50">
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                Approve
              </Button>
            )}
            {rule.status !== "staff_rejected" && rule.status !== "superseded" && (
              <Button size="sm" variant="outline" onClick={() => setRejectMode(!rejectMode)} disabled={actionLoading} className="text-red-600 border-red-300 hover:bg-red-50">
                <XCircle className="w-3 h-3 mr-1" />Reject
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onEdit} disabled={actionLoading}><Edit className="w-3 h-3" /></Button>
            <Button size="sm" variant="ghost" onClick={onToggle}>{expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</Button>
          </div>
        </div>

        {rejectMode && (
          <div className="mt-2 flex gap-2">
            <Input placeholder="Rejection reason (optional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <Button size="sm" variant="destructive" onClick={() => { onReject(rejectReason); setRejectMode(false); }}>Confirm Reject</Button>
          </div>
        )}

        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-2 text-sm">
            {rule.trigger && <div><span className="font-semibold">Trigger:</span> {rule.trigger}</div>}
            {rule.exceptions && <div><span className="font-semibold">Exceptions:</span> {rule.exceptions}</div>}
            {rule.effective_date && <div><span className="font-semibold">Effective:</span> {rule.effective_date}</div>}
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