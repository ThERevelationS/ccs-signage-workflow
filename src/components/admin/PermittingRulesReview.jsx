import { invokePermittingReview } from "@/api/permittingReviewClient";
import { staffEntities } from "@/components/staff/staffEntities";
import { isPermittingPreviewHost } from "./permittingPreviewQa";
import PermittingReviewBrowserFixture from "./PermittingReviewBrowserFixture";
import RuleCard from "./PermittingRuleCard";
import { useEffect, useState, useCallback, useRef } from "react";
import PermittingRuleEvidenceExtraction from "./PermittingRuleEvidenceExtraction";
import { Button } from "@/components/ui/button";
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
  Loader2,
} from "lucide-react";

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
  const [uncoveredLocalities, setUncoveredLocalities] = useState([]);
  const [showBrowserFixture, setShowBrowserFixture] = useState(false);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ jurisdiction_name: "Boone County", rule_category: "", status: "", confidence: "", conflict_state: "" });
  const [expandedId, setExpandedId] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [editDialog, setEditDialog] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const ruleRequest = useRef(0), countRequest = useRef(0), scopeRef = useRef("");
  scopeRef.current = JSON.stringify(filters);

  const loadRules = useCallback(async (reset = true) => {
    const scope = JSON.stringify(filters), request = ++ruleRequest.current;
    const current = () => request === ruleRequest.current && scope === scopeRef.current;
    setLoading(true);
    setError(null);
    try {
      const filterPayload = { action: "list", limit: 50 };
      for (const [k, v] of Object.entries(filters)) {
        if (v) filterPayload[k] = v;
      }
      if (!reset && cursor) filterPayload.cursor = cursor;
      const res = await invokePermittingReview(filterPayload);
      const data = res?.data || res;
      if (!current()) return;
      if (!data?.success) throw new Error(data?.error || "Failed to load rules");
      if (reset) {
        setRules(data.rules || []);
      } else {
        setRules((prev) => [...prev, ...(data.rules || [])]);
      }
      setHasMore(data.has_more || false);
      setCursor(data.next_cursor || null);
    } catch (e) {
      if (current()) setError(e?.response?.data?.error || e.message || String(e));
    } finally {
      if (current()) setLoading(false);
    }
  }, [filters, cursor]);

  const loadCounts = useCallback(async () => {
    const jurisdiction = filters.jurisdiction_name, request = ++countRequest.current;
    try {
      const res = await invokePermittingReview({
        action: "counts",
        jurisdiction_name: filters.jurisdiction_name || undefined,
      });
      const data = res?.data || res;
      if (data?.success && request === countRequest.current && JSON.parse(scopeRef.current).jurisdiction_name === jurisdiction) setCounts(data);
    } catch {
      // Counts can be retried independently of the rule list.
    }
  }, [filters.jurisdiction_name]);

  useEffect(() => { setCounts(null); loadCounts(); }, [filters.jurisdiction_name]);
  useEffect(() => { loadRules(true); }, [filters.jurisdiction_name, filters.rule_category, filters.status, filters.confidence, filters.conflict_state]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      staffEntities.PermitLocality.list().catch(() => []),
      invokePermittingReview({ action: "list", limit: 300 }).then((r) => (r?.data || r)?.rules || []).catch(() => []),
    ]).then(([localities, allRules]) => {
      if (!alive) return;
      const covered = new Set((allRules || []).map((r) => (r.jurisdiction_name || "").trim().toLowerCase()).filter(Boolean));
      setUncoveredLocalities((localities || []).map((l) => l.name || "").filter((n) => n && !covered.has(n.trim().toLowerCase())));
    });
    return () => { alive = false; };
  }, []);

  const handleApprove = async (rule) => {
    setActionLoading(rule.id);
    try {
      const res = await invokePermittingReview({
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

  const handleResolveConflict = async (rule, rationale) => {
    if (actionLoading) return;
    setActionLoading(rule.id); setError(null);
    try {
      const res = await invokePermittingReview({
        action: "resolve_conflict", rule_id: rule.id, expected_version: rule.version,
        rationale, reviewed_all_citations: true,
      });
      const data = res?.data || res;
      if (!data?.success) throw new Error(data?.error || "Conflict resolution failed");
      setRules(prev => prev.map(r => r.id === rule.id ? data.rule : r));
      loadCounts();
    } catch (e) { setError(e?.response?.data?.error || e.message || String(e)); }
    finally { setActionLoading(null); }
  };

  const handleReject = async (rule, reason = "") => {
    setActionLoading(rule.id);
    try {
      const res = await invokePermittingReview({
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
      const res = await invokePermittingReview({
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

      {isPermittingPreviewHost(window.location.hostname, import.meta.env.DEV) && <div>
        <Button variant="outline" onClick={() => setShowBrowserFixture(value => !value)}>
          {showBrowserFixture ? "Close isolated browser acceptance" : "Open isolated browser acceptance"}
        </Button>
        {showBrowserFixture && <PermittingReviewBrowserFixture />}
      </div>}

      <PermittingRuleEvidenceExtraction key={filters.jurisdiction_name} jurisdictionName={filters.jurisdiction_name} onImported={() => { loadRules(true); loadCounts(); }} />

      {/* Summary cards */}
      {counts && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Card><CardContent className="pt-3 pb-3"><div className="text-xs text-gray-500">Total Rules</div><div className="text-2xl font-bold">{counts.total}</div></CardContent></Card>
          <Card><CardContent className="pt-3 pb-3"><div className="text-xs text-gray-500">Reviewed regulatory rules</div><div className="text-2xl font-bold text-green-600">{counts.operational}</div></CardContent></Card>
          <Card><CardContent className="pt-3 pb-3"><div className="text-xs text-gray-500">Reviewed instructions</div><div className="text-2xl font-bold text-blue-600">{counts.reviewed_instructions || 0}</div></CardContent></Card>
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
        {uncoveredLocalities.length > 0 && (
          <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800"
            title={uncoveredLocalities.join(", ")}>
            {uncoveredLocalities.length} localit{uncoveredLocalities.length === 1 ? "y" : "ies"} with no rules
          </span>
        )}
        {rules.filter(r => r.conflict_state === "conflicting_sources" || r.conflict_state === "under_review").length > 0 && (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            {rules.filter(r => r.conflict_state === "conflicting_sources" || r.conflict_state === "under_review").length} conflict{rules.filter(r => r.conflict_state === "conflicting_sources" || r.conflict_state === "under_review").length === 1 ? "" : "s"} to review
          </span>
        )}
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
              key={rule.id + ":" + (rule.version ?? "unversioned")}
              rule={rule}
              expanded={expandedId === rule.id}
              onToggle={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
              onApprove={() => handleApprove(rule)}
              onResolveConflict={rationale => handleResolveConflict(rule, rationale)}
              onReject={(reason) => handleReject(rule, reason)}
              onEdit={() => setEditDialog({ rule, edits: { requirement: rule.requirement, trigger: rule.trigger, exceptions: rule.exceptions, notes: rule.notes } })}
              actionLoading={Boolean(actionLoading)}
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

