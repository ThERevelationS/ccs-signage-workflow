import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles, X, AlertTriangle, CheckCircle, FileText, MapPin, ChevronDown, ChevronUp, Plus, ShieldCheck } from "lucide-react";
import { runDesignerPipeline, saveWorkflowDraft, loadWorkflowDrafts } from "./permitWorkflowDesigner";
import { createPermitLinesFromDraft, computeDeterministicRowName } from "./permitLineItemIntegration";
import { safeGovernmentOfficeSourceUrl } from "./governmentOfficeCatalog";
import WorkflowCitationList from "./WorkflowCitationList";
import PermittingDraftHistory from "./PermittingDraftHistory";
import WorkflowSourceEvidenceDialog from "./WorkflowSourceEvidenceDialog";
import WorkflowReviewPacket from "./WorkflowReviewPacket";
import ElectricalOfficeResponseContext from "./ElectricalOfficeResponseContext";
import WorkflowPlanningReview from "./WorkflowPlanningReview";
import { editPlanningReview, invalidatePlanningReview, planningReviewIssues, planningReviewSummary } from "./workflowPlanningReview.mjs";

const NEW_VS_REPLACEMENT_OPTIONS = ["New sign", "Face replacement", "Repair/Service"];
const TEMP_PERM_OPTIONS = ["Permanent", "Temporary"];

function handoffText(value) {
  if (typeof value === "string") return value.length ? value : "Not recorded · confirm with the responsible office";
  if (value === null || value === undefined) return "Not recorded · confirm with the responsible office";
  return String(value);
}

function ElectricalPlanningHandoffView({ handoff }) {
  const applicability = value => value === "potentially_applicable"
    ? "potentially applicable · confirm the proposed work"
    : value === "not_applicable_candidate"
      ? "not-applicable candidate · confirm before skipping"
      : value === "unknown" || !value
        ? "unknown · unresolved"
        : handoffText(value);
  return <section aria-label="Electrical planning handoff" className="min-w-0 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 [overflow-wrap:anywhere]">
    <h3 className="font-semibold text-amber-950">Electrical office planning handoff · saved research draft</h3>
    <p className="text-sm text-amber-900">This context is unverified and does not approve requirements, determine applicability, select a provider, or create job tasks. Permit issuance and inspection responsibility remain separate.</p>
    <p className="text-xs text-amber-900">Research method: {handoffText(handoff.research_method)} · Research date: {handoffText(handoff.researched_at)} · Jurisdiction: {handoffText(handoff.jurisdiction?.jurisdiction_name)}{handoff.jurisdiction?.state ? `, ${handoff.jurisdiction.state}` : ""}</p>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {(handoff.roles || []).map(role => <article key={role.role} aria-label={role.label} className="min-w-0 space-y-2 rounded border border-amber-200 bg-white p-3 text-xs">
        <h4 className="font-semibold">{role.label}</h4>
        {!role.findings?.length
          ? <p>No saved finding for this responsibility. Office and applicability remain unresolved.</p>
          : role.findings.map((finding, index) => {
            const source = safeGovernmentOfficeSourceUrl(finding.official_source_url);
            return <div key={index} className="space-y-2 border-t pt-2">
              <p className="font-medium">Finding {index + 1}: {handoffText(finding.office_name)}</p>
              <p><strong>Recorded applicability:</strong> {applicability(finding.applicability)}</p>
              <p><strong>Recorded service area:</strong> {handoffText(finding.service_area)}</p>
              <p><strong>Responsibility evidence:</strong> {handoffText(finding.responsibility_quote)}</p>
              <p><strong>Delegation/provider evidence:</strong> {handoffText(finding.delegation_quote)}</p>
              {Object.entries(finding.contact_info || {}).map(([key, value]) => <p key={key}><strong>{key.replaceAll("_", " ")}:</strong> {handoffText(value)}</p>)}
              {Object.entries(finding.research_fields || {}).map(([key, value]) => <p key={key} className="whitespace-pre-wrap"><strong>{key.replaceAll("_", " ")}:</strong> {handoffText(value)}</p>)}
              <p><strong>Research notes:</strong> {handoffText(finding.notes)}</p>
              {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center break-all text-blue-700 underline">Open recorded office research source</a>
                : <p>Usable recorded source URL unavailable.</p>}
            </div>;
          })}
      </article>)}
    </div>
    <ElectricalOfficeResponseContext context={handoff.office_responses} />
  </section>;
}

export default function PermitWorkflowDesigner({
  isOpen,
  onClose,
  preselectedJurisdiction = null,
  initialSavedDraft = null,
  initialStepIndex = null,
  electricalPlanningHandoff = null,
  workOrder = null,
  onLinesCreated = () => {},
  onDraftSaved = () => {},
  onOpenSourceDocument,
}) {
  const [form, setForm] = useState({
    address: preselectedJurisdiction?.jurisdiction_name ? `${preselectedJurisdiction.jurisdiction_name}, ${preselectedJurisdiction.state || ""}` : "",
    customer: workOrder?.client_name || "",
    signTypes: "",
    dimensions: "",
    illuminated: false,
    electricalWork: false,
    freestanding: false,
    emcDigital: false,
    temporaryVsPermanent: "Permanent",
    newVsReplacement: "New sign",
    zoningContext: "",
    exemptionStatus: "",
  });
  const [savedDrafts, setSavedDrafts] = useState([]);
  const [draftTitle, setDraftTitle] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [editingSteps, setEditingSteps] = useState(false);
  const [revisionSource, setRevisionSource] = useState(null);
  const [sourceEvidence, setSourceEvidence] = useState(null);
  const [reviewPacket, setReviewPacket] = useState(null);
  const [draftLoadError, setDraftLoadError] = useState('');
  useEffect(() => {
    let active = true;
    if (isOpen) loadWorkflowDrafts(preselectedJurisdiction?.jurisdiction_id).then(rows => { if (active) setSavedDrafts(rows); })
      .catch(() => { if (active) setDraftLoadError('Saved drafts could not be loaded. You can still preview a new workflow.'); });
    return () => { active = false; };
  }, [isOpen, preselectedJurisdiction?.jurisdiction_id]);

  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState(null);
  const [expandedSteps, setExpandedSteps] = useState(new Set());
  const selectedStepButton = useRef(null), initialStepFocused = useRef(false);

  const reviewIssues = planningReviewIssues(draft?.steps || []);
  const reviewSummary = planningReviewSummary(draft?.steps || []);
  const hasUnsavedReview = Boolean(!saved && revisionSource && JSON.stringify((draft?.steps || []).map(step => step.staff_review || null)) !== JSON.stringify((revisionSource.snapshot?.steps || []).map(step => step.staff_review || null)));
  const unsavedReviewRef = useRef(false);
  unsavedReviewRef.current = hasUnsavedReview;
  useEffect(() => {
    if (!isOpen || !hasUnsavedReview) return;
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isOpen, hasUnsavedReview]);
  const canLeaveReview = () => !hasUnsavedReview || (!saving && window.confirm('Leave without saving your staff review checklist? Unsaved review changes may be lost.'));
  const closeDesigner = () => { if (canLeaveReview()) onClose(); };

  useEffect(() => {
    if (!initialSavedDraft || !isOpen || unsavedReviewRef.current) return;
    setDraft(initialSavedDraft.snapshot); setForm(initialSavedDraft.project_inputs || {});
    setDraftTitle(initialSavedDraft.title); setReviewNotes(initialSavedDraft.review_notes || '');
    setSaved(initialSavedDraft); setRevisionSource(initialSavedDraft); setEditingSteps(false);
    setReviewed(true); setError(''); setCreateResult(null);
    const expanded = initialSavedDraft.snapshot.steps.flatMap((step, index) => step.basis !== 'approved_rule' ? [index] : []);
    if (Number.isInteger(initialStepIndex) && initialStepIndex >= 0 && initialStepIndex < initialSavedDraft.snapshot.steps.length) expanded.push(initialStepIndex);
    setExpandedSteps(new Set(expanded));
  }, [initialSavedDraft, isOpen, initialStepIndex]);

  useEffect(() => {
    if (!isOpen || !saved?.id || !Number.isInteger(initialStepIndex) || initialStepIndex < 0 || initialStepIndex >= saved.snapshot.steps.length || initialStepFocused.current) return;
    const frame = requestAnimationFrame(() => {
      if (!selectedStepButton.current) return;
      selectedStepButton.current.scrollIntoView({ block: 'start' });
      selectedStepButton.current.focus({ preventScroll: true });
      initialStepFocused.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, saved, initialStepIndex]);

  const updateForm = useCallback((key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    setDraft(null);
    setCreateResult(null);
    try {
      const result = await runDesignerPipeline(form, preselectedJurisdiction);
      setDraft(electricalPlanningHandoff
        ? { ...result, electrical_planning_handoff: electricalPlanningHandoff }
        : result);
      setDraftTitle(`${result.jurisdiction.jurisdiction_name || 'Unresolved location'} — ${form.signTypes || 'Sign workflow'}`);
      setReviewed(false); setSaved(null); setRevisionSource(null); setEditingSteps(false); setReviewNotes('');
      // Auto-expand steps that need staff confirmation
      const needsConfirm = new Set(
        result.steps.filter(s => s.basis === "staff_confirmation_needed").map(s => s.step_index),
      );
      setExpandedSteps(needsConfirm);
    } catch (e) {
      setError(e?.message || "Failed to generate workflow");
    } finally {
      setGenerating(false);
    }
  };

  const beginStepEditing = () => {
    const source = saved || revisionSource;
    if (source) {
      const nextRevision = (Number(source.snapshot?.draft_revision?.revision_number) || 1) + 1;
      const rootTitle = source.snapshot?.draft_revision?.root_title || source.title || 'Permitting workflow';
      setRevisionSource(source);
      setDraftTitle(`${rootTitle} — revision ${nextRevision}`);
      setReviewNotes(source.review_notes || '');
      setSaved(null);
    }
    setEditingSteps(true);
    setReviewed(false);
    setError('');
    setCreateResult(null);
    setExpandedSteps(new Set((draft?.steps || []).map((_, index) => index)));
  };

  const updateStepField = (stepIndex, field, value) => {
    if (!editingSteps || saved) return;
    setDraft(previous => {
      if (!previous || !Array.isArray(previous.steps)) return previous;
      const steps = previous.steps.map((step, index) => {
        if (index !== stepIndex) return step;
        const prior = step.staff_override || {};
        const originalValues = { ...(prior.original_values || {}) };
        if (!Object.prototype.hasOwnProperty.call(originalValues, field)) originalValues[field] = step[field] ?? null;
        const editedFields = Array.from(new Set([...(Array.isArray(prior.edited_fields) ? prior.edited_fields : []), field]));
        return {
          ...step,
          ...(step.staff_review ? { staff_review: invalidatePlanningReview(step.staff_review, field) } : {}),
          [field]: value,
          basis: 'staff_confirmation_needed',
          gap_reason: 'Staff changed this proposed detail. Confirm it against current evidence before relying on it.',
          staff_override: {
            original_basis: prior.original_basis ?? step.basis,
            original_values: originalValues,
            edited_fields: editedFields,
            edited_at: new Date().toISOString(),
          },
        };
      });
      return { ...previous, steps };
    });
    setReviewed(false);
    setCreateResult(null);
  };

  const updateStaffReview = (stepIndex, field, value) => {
    if (!editingSteps || saved || saving) return;
    setDraft(previous => ({ ...previous, steps: previous.steps.map((step, index) => index === stepIndex ? { ...step, staff_review: editPlanningReview(step.staff_review, field, value) } : step) }));
    setReviewed(false); setError('');
  };

  const handleSaveDraft = async () => {
    if (!draft || !reviewed || saving || saved) return;
    if (reviewIssues.length) { setError("Resolve the staff planning review questions before saving this revision."); return; }
    setSaving(true); setError('');
    try {
      const snapshot = revisionSource ? {
        ...draft,
        draft_revision: {
          parent_draft_id: revisionSource.id,
          parent_title: revisionSource.title || '',
          root_draft_id: revisionSource.snapshot?.draft_revision?.root_draft_id || revisionSource.id,
          root_title: revisionSource.snapshot?.draft_revision?.root_title || revisionSource.title || '',
          revision_number: (Number(revisionSource.snapshot?.draft_revision?.revision_number) || 1) + 1,
          created_at: new Date().toISOString(),
        },
      } : draft;
      const row = await saveWorkflowDraft(snapshot, form, draftTitle, reviewNotes);
      setDraft(snapshot); setSaved(row); setRevisionSource(row); setEditingSteps(false);
      setSavedDrafts(prev => [row, ...prev]);
      onDraftSaved(row);
    } catch (e) { setError(e?.message || 'Draft could not be saved. Your preview is still available.'); }
    finally { setSaving(false); }
  };

  const handleCreateLines = async () => {
    if (!workOrder?.id || !draft) return;
    setCreating(true);
    setError("");
    try {
      const result = await createPermitLinesFromDraft(draft, workOrder, form.signTypes);
      setCreateResult(result);
      if (result.created.length > 0) onLinesCreated(result);
    } catch (e) {
      setError(e?.message || "Failed to create permit lines");
    } finally {
      setCreating(false);
    }
  };

  const toggleStep = (idx) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (!isOpen) return null;

  const basisBadge = (basis) => {
    if (basis === "approved_rule") return <Badge className="bg-green-100 text-green-700">Approved Rule</Badge>;
    if (basis === "pending_review") return <Badge className="bg-amber-100 text-amber-700">Pending Review</Badge>;
    return <Badge className="bg-red-100 text-red-700">Staff Confirmation Needed</Badge>;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-2 sm:p-4">
      <div className="flex max-h-[95dvh] min-w-0 w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-3 sm:p-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-bold text-gray-900">AI Permit Workflow Designer</h2>
            {preselectedJurisdiction?.jurisdiction_name && (
              <Badge className="bg-purple-100 text-purple-700">
                <MapPin className="mr-1 h-3 w-3" />
                {preselectedJurisdiction.jurisdiction_name}
              </Badge>
            )}
          </div>
          <button type="button" onClick={closeDesigner} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 break-words">
          {/* Input Form */}
          {!draft && (
            <div className="space-y-4">
              <p className="rounded-lg bg-purple-50 p-3 text-sm text-purple-900">1. Describe the sign → 2. Review evidence and open questions → 3. Save a permitting draft</p>
              {draftLoadError && <p role="status" className="text-sm text-amber-700">{draftLoadError}</p>}
              {savedDrafts.length > 0 && <section aria-label="Saved permitting drafts" className="rounded-lg border p-3">
                <h3 className="text-sm font-semibold">Saved drafts · not approved for use</h3>
                {savedDrafts.map(row => <button type="button" key={row.id} className="block min-h-11 w-full break-words py-2 text-left text-sm text-purple-700" onClick={() => {
                  setDraft(row.snapshot); setForm(row.project_inputs || form); setDraftTitle(row.title); setReviewNotes(row.review_notes || '');
                  setSaved(row); setRevisionSource(row); setEditingSteps(false); setReviewed(true); setError(''); setCreateResult(null); setExpandedSteps(new Set());
                }}>{row.title}</button>)}
              </section>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pwd-address">Project Address</Label>
                  <Input
                    id="pwd-address"
                    value={form.address}
                    onChange={e => updateForm("address", e.target.value)}
                    placeholder="123 Main St, Florence, KY"
                    className="min-h-11"
                  />
                </div>
                <div>
                  <Label htmlFor="pwd-customer">Customer</Label>
                  <Input
                    id="pwd-customer"
                    value={form.customer}
                    onChange={e => updateForm("customer", e.target.value)}
                    placeholder="Customer name"
                    className="min-h-11"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pwd-sign-types">Sign Type(s)</Label>
                  <Input
                    id="pwd-sign-types"
                    value={form.signTypes}
                    onChange={e => updateForm("signTypes", e.target.value)}
                    placeholder="e.g. Monument, Channel Letters"
                    className="min-h-11"
                  />
                </div>
                <div>
                  <Label htmlFor="pwd-dimensions">Dimensions</Label>
                  <Input
                    id="pwd-dimensions"
                    value={form.dimensions}
                    onChange={e => updateForm("dimensions", e.target.value)}
                    placeholder='e.g. 48" x 24" x 8"'
                    className="min-h-11"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 sm:grid-cols-3">
                <label className="flex items-center gap-2 rounded-lg border p-3">
                  <Switch checked={form.illuminated} onCheckedChange={v => updateForm("illuminated", v)} />
                  <span className="text-sm">Illuminated</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border p-3">
                  <Switch checked={form.electricalWork} onCheckedChange={v => updateForm("electricalWork", v)} />
                  <span className="text-sm">Electrical</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border p-3">
                  <Switch checked={form.freestanding} onCheckedChange={v => updateForm("freestanding", v)} />
                  <span className="text-sm">Freestanding</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border p-3">
                  <Switch checked={form.emcDigital} onCheckedChange={v => updateForm("emcDigital", v)} />
                  <span className="text-sm">EMC/Digital</span>
                </label>
                <select
                  value={form.temporaryVsPermanent}
                  onChange={e => updateForm("temporaryVsPermanent", e.target.value)}
                  className="min-h-11 rounded-lg border px-3 text-sm"
                >
                  {TEMP_PERM_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
                <select
                  value={form.newVsReplacement}
                  onChange={e => updateForm("newVsReplacement", e.target.value)}
                  className="min-h-11 rounded-lg border px-3 text-sm"
                >
                  {NEW_VS_REPLACEMENT_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pwd-zoning">Zoning / Site Context</Label>
                  <Input
                    id="pwd-zoning"
                    value={form.zoningContext}
                    onChange={e => updateForm("zoningContext", e.target.value)}
                    placeholder="e.g. C-2 Commercial, shopping center"
                    className="min-h-11"
                  />
                </div>
                <div>
                  <Label htmlFor="pwd-exemption">Customer Exemption Status</Label>
                  <Input
                    id="pwd-exemption"
                    value={form.exemptionStatus}
                    onChange={e => updateForm("exemptionStatus", e.target.value)}
                    placeholder="e.g. Government, non-profit, none"
                    className="min-h-11"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button
                onClick={handleGenerate}
                disabled={generating || (!form.address && !preselectedJurisdiction)}
                className="w-full min-h-12 gap-2 bg-purple-600 hover:bg-purple-700"
              >
                {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                {generating ? "Generating workflow..." : "Generate Permit Workflow"}
              </Button>
              <p className="text-center text-xs text-gray-500">
                Uses approved rules first; extracted rules as pending guidance; draft/historical sources never operational.
                Gaps are surfaced honestly — nothing is invented.
              </p>
            </div>
          )}

          {/* Draft Display */}
          {draft && (
            <div className="space-y-4">
              <div className="rounded-lg border border-purple-200 p-3 text-sm">
                <p className="font-semibold">2. Review proposed workflow</p>
                <p>Collected sources are evidence, not approval. Pending findings and open questions remain unverified when this draft is saved.</p>
                {draft.draft_revision && <p>Revision {draft.draft_revision.revision_number} from {draft.draft_revision.parent_title || draft.draft_revision.parent_draft_id}. The earlier saved snapshot remains unchanged.</p>}
                {!editingSteps ? <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={beginStepEditing} disabled={saving || creating}>{saved ? 'Create editable revision' : 'Edit proposed steps'}</Button> : <p role="status" className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">Step editing is on. Changed steps keep their citations and become Staff Confirmation Needed. Save creates a separate permitting draft; it does not approve requirements or create job lines.</p>}
                {draft.jurisdiction_unresolved && <p className="text-amber-800">Location unresolved. This draft cannot establish jurisdiction authority.</p>}
              </div>
              {(saved || revisionSource) && <section aria-label="Staff planning review progress" className="space-y-2 rounded border border-purple-200 bg-purple-50 p-3 text-sm">
                <h3 className="font-semibold">Staff planning review</h3>
                <p>Reviewed for planning: {reviewSummary.reviewed_for_planning} / {draft.steps.length} · Needs follow-up: {reviewSummary.needs_follow_up} · Proposed not applicable: {reviewSummary.not_applicable_proposal} · Not reviewed: {reviewSummary.not_reviewed}</p>
                <p>This is review progress only. It does not establish evidence completeness, authority approval or readiness for job work. {saved ? 'Create an editable revision to record decisions and follow-up.' : 'Save creates a separate immutable revision.'}</p>
                {hasUnsavedReview && <p role="status" className="font-semibold">Unsaved staff review checklist changes</p>}
                {editingSteps && reviewIssues.length > 0 && <ul className="text-amber-900">{reviewIssues.map(issue => <li key={issue.index + issue.message}>Step {issue.index + 1}: {issue.message}</li>)}</ul>}
              </section>}
              {saved?.id && <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={event => setReviewPacket({ draftRow: structuredClone(saved), trigger: event.currentTarget })}>Open saved review packet</Button>}
              {saved && <PermittingDraftHistory key={saved.id} current={saved} onOpenCitation={(citation, draftRow, trigger) => setSourceEvidence({citation, draftRow, trigger})} />}
              {draft.electrical_planning_handoff && <ElectricalPlanningHandoffView handoff={draft.electrical_planning_handoff} /> }
              {/* Summary */}
              <div className="rounded-lg border-l-4 border-l-purple-400 bg-purple-50 p-3">
                <p className="text-sm font-semibold text-purple-900">{draft.summary}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {draft.jurisdiction.jurisdiction_name && (
                    <Badge className="bg-purple-100 text-purple-700">
                      <MapPin className="mr-1 h-3 w-3" />
                      {draft.jurisdiction.jurisdiction_name}
                    </Badge>
                  )}
                  <Badge className="bg-green-100 text-green-700">{draft.rule_counts.approved} approved rules</Badge>
                  <Badge className="bg-amber-100 text-amber-700">{draft.rule_counts.pending} pending review</Badge>
                  <Badge className="bg-blue-100 text-blue-700">{draft.steps.length} steps</Badge>
                  {draft.gaps.length > 0 && (
                    <Badge className="bg-red-100 text-red-700">{draft.gaps.length} gaps</Badge>
                  )}
                </div>
              </div>

              {/* Gaps */}
              {draft.gaps.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="mb-2 flex items-center gap-1 text-sm font-semibold text-red-800">
                    <AlertTriangle className="h-4 w-4" />
                    Staff Confirmation Needed ({draft.gaps.length})
                  </p>
                  <ul className="space-y-1 text-xs text-red-700">
                    {draft.gaps.map((gap, i) => (
                      <li key={i} className="min-w-0">
                        <span className="font-medium">{gap.description}</span>
                        {gap.reason && <span className="block text-red-600">{gap.reason}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Steps */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Workflow Steps ({draft.steps.length})</h3>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setExpandedSteps(new Set(draft.steps.map((s) => s.step_index)))} className="text-xs">
                      Expand all
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setExpandedSteps(new Set())} className="text-xs">
                      Collapse all
                    </Button>
                  </div>
                </div>
                {draft.steps.map((step, idx) => {
                  const isExpanded = expandedSteps.has(idx);
                  const rowName = computeDeterministicRowName({
                    jurisdictionName: draft.jurisdiction.jurisdiction_name,
                    officeType: step.office_type,
                    permitType: step.permit_type,
                  });
                  return (
                    <div key={idx} className={`rounded-lg border ${step.basis === "staff_confirmation_needed" ? "border-red-200 bg-red-50/30" : "border-gray-200 bg-white"}`}>
                      <button type="button"
                        ref={node => { if (idx === initialStepIndex) selectedStepButton.current = node; }}
                        aria-expanded={isExpanded}
                        aria-controls={`pwd-proposed-step-${idx}`}
                        onClick={() => toggleStep(idx)}
                        className="flex min-h-11 w-full items-center gap-2 p-3 text-left"
                      >
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">{idx + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{step.permit_type}</span>
                            {basisBadge(step.basis)}
                            {step.staff_override && <Badge className="bg-orange-100 text-orange-800">Staff edited</Badge>}
                          </div>
                          <p className="text-xs text-gray-500">{step.office} · {step.office_type}</p>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 flex-shrink-0 text-gray-400" /> : <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />}
                      </button>
                      {isExpanded && (
                        <div id={`pwd-proposed-step-${idx}`} className="border-t p-3 space-y-2 text-xs">
                          {editingSteps && <fieldset className="min-w-0 space-y-3 rounded border border-amber-300 bg-amber-50 p-3">
                            <legend className="px-1 font-semibold text-amber-950">Edit proposed step {idx + 1}</legend>
                            <p className="text-amber-900">These are staff overrides of a proposal. Source citations stay attached, while this step requires confirmation.</p>
                            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                              <div className="min-w-0"><Label htmlFor={`pwd-step-office-${idx}`}>Office for step {idx + 1}</Label><Input id={`pwd-step-office-${idx}`} className="min-h-11" value={step.office || ''} onChange={event => updateStepField(idx, 'office', event.target.value)} /></div>
                              <div className="min-w-0"><Label htmlFor={`pwd-step-office-type-${idx}`}>Office type for step {idx + 1}</Label><Input id={`pwd-step-office-type-${idx}`} className="min-h-11" value={step.office_type || ''} onChange={event => updateStepField(idx, 'office_type', event.target.value)} /></div>
                              <div className="min-w-0 sm:col-span-2"><Label htmlFor={`pwd-step-permit-type-${idx}`}>Permit type for step {idx + 1}</Label><Input id={`pwd-step-permit-type-${idx}`} className="min-h-11" value={step.permit_type || ''} onChange={event => updateStepField(idx, 'permit_type', event.target.value)} /></div>
                              <div className="min-w-0 sm:col-span-2"><Label htmlFor={`pwd-step-action-${idx}`}>Action for step {idx + 1}</Label><textarea id={`pwd-step-action-${idx}`} value={step.action || ''} onChange={event => updateStepField(idx, 'action', event.target.value)} className="min-h-24 w-full min-w-0 rounded-md border bg-white p-3 text-sm" /></div>
                              <div className="min-w-0"><Label htmlFor={`pwd-step-documents-${idx}`}>Required documents for step {idx + 1} · one per line</Label><textarea id={`pwd-step-documents-${idx}`} value={Array.isArray(step.required_documents) ? step.required_documents.join('\n') : typeof step.required_documents === 'string' ? step.required_documents : ''} onChange={event => updateStepField(idx, 'required_documents', event.target.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean))} className="min-h-24 w-full min-w-0 rounded-md border bg-white p-3 text-sm" /></div>
                              <div className="min-w-0"><Label htmlFor={`pwd-step-forms-${idx}`}>Required forms for step {idx + 1} · one per line</Label><textarea id={`pwd-step-forms-${idx}`} value={Array.isArray(step.required_forms) ? step.required_forms.join('\n') : typeof step.required_forms === 'string' ? step.required_forms : ''} onChange={event => updateStepField(idx, 'required_forms', event.target.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean))} className="min-h-24 w-full min-w-0 rounded-md border bg-white p-3 text-sm" /></div>
                              <div className="min-w-0 sm:col-span-2"><Label htmlFor={`pwd-step-fee-${idx}`}>Fee expectation for step {idx + 1}</Label><Input id={`pwd-step-fee-${idx}`} className="min-h-11" value={step.fee_expectation || ''} onChange={event => updateStepField(idx, 'fee_expectation', event.target.value)} /></div>
                            </div>
                            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                              <div className="min-w-0"><Label htmlFor={`pwd-step-target-days-${idx}`}>Target day for step {idx + 1}</Label><Input id={`pwd-step-target-days-${idx}`} type="number" inputMode="numeric" step="1" min="0" className="min-h-11" value={step.target_days_from_start ?? ''} onChange={event => { const raw = event.target.value; const value = raw === '' ? null : Number(raw); if (value === null || (Number.isSafeInteger(value) && value >= 0)) updateStepField(idx, 'target_days_from_start', value); }} /></div>
                              <div className="min-w-0"><Label htmlFor={`pwd-step-followup-${idx}`}>Follow-up interval in days for step {idx + 1}</Label><Input id={`pwd-step-followup-${idx}`} type="number" inputMode="numeric" step="1" min="1" className="min-h-11" value={step.followup_interval_days ?? ''} onChange={event => { const raw = event.target.value; const value = raw === '' ? null : Number(raw); if (value === null || (Number.isSafeInteger(value) && value >= 1)) updateStepField(idx, 'followup_interval_days', value); }} /></div>
                              <label className="flex min-h-11 items-center gap-2 rounded border bg-white p-3 sm:col-span-2">
                                <input type="checkbox" checked={step.inspection_needed === true} onChange={event => updateStepField(idx, 'inspection_needed', event.target.checked)} />
                                Inspection planned for step {idx + 1} · confirm provider and stages
                              </label>
                            </div>
                            <fieldset className="min-w-0 space-y-2 rounded border bg-white p-3">
                              <legend className="px-1 font-medium">Prerequisite steps for step {idx + 1}</legend>
                              {idx === 0 ? <p className="text-gray-600">This is the first step, so it has no earlier steps to select.</p> : <>
                                <p className="text-gray-600">Select earlier steps that must happen first.</p>
                                <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                                  {draft.steps.slice(0, idx).map((prerequisite, prerequisiteIndex) => {
                                    const current = (Array.isArray(step.dependencies) ? step.dependencies : []).filter(dependency => Number.isInteger(dependency) && dependency >= 0 && dependency < idx);
                                    return <label key={prerequisiteIndex} className="flex min-h-11 min-w-0 items-center gap-2 rounded border p-2">
                                      <input type="checkbox" aria-label={`Step ${idx + 1} depends on step ${prerequisiteIndex + 1}`} checked={current.includes(prerequisiteIndex)} onChange={event => {
                                        const next = event.target.checked
                                          ? [...new Set([...current, prerequisiteIndex])].sort((a, b) => a - b)
                                          : current.filter(dependency => dependency !== prerequisiteIndex);
                                        updateStepField(idx, 'dependencies', next);
                                      }} />
                                      <span className="min-w-0 break-words">Step {prerequisiteIndex + 1}: {prerequisite.permit_type || 'Untitled step'}</span>
                                    </label>;
                                  })}
                                </div>
                              </>}
                            </fieldset>
                          </fieldset>}
                          {step.staff_override && <p className="rounded bg-amber-100 p-2 text-amber-950">Staff edited · source basis was {step.staff_override.original_basis}; the edited step remains unapproved. Edited fields: {Array.isArray(step.staff_override.edited_fields) ? step.staff_override.edited_fields.join(', ') : 'unavailable'}.</p>}
                          <p className="text-gray-700">{step.action}</p>
                          {(step.required_documents?.length > 0 || step.required_forms?.length > 0) && (
                            <div className="space-y-1">
                              {step.required_documents?.map((doc, i) => (
                                <div key={`doc${i}`} className="flex items-center gap-1 text-gray-600">
                                  <FileText className="h-3 w-3" /> {doc}
                                </div>
                              ))}
                              {step.required_forms?.map((form, i) => (
                                <div key={`form${i}`} className="flex items-center gap-1 text-gray-600">
                                  <FileText className="h-3 w-3" /> Form: {form}
                                </div>
                              ))}
                            </div>
                          )}
                          {step.submission_link && (
                            <a href={step.submission_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                              <FileText className="h-3 w-3" /> Online submission
                            </a>
                          )}
                          {step.fee_expectation && <p className="text-gray-600"><span className="font-medium">Fee:</span> {step.fee_expectation}</p>}
                          {step.exemption_applicable && <p className="text-gray-600"><span className="font-medium">Exemption:</span> {step.exemption_applicable}</p>}
                          {step.variance_needed && <p className="text-amber-700"><AlertTriangle className="mr-1 inline h-3 w-3" />Variance/conditional-use may be required</p>}
                          {step.target_days_from_start != null && <p className="text-gray-600"><span className="font-medium">Target:</span> Day {step.target_days_from_start}</p>}
                          {step.followup_interval_days != null && <p className="text-gray-600"><span className="font-medium">Follow-up:</span> Every {step.followup_interval_days} days</p>}
                          {step.inspection_needed === true && <p className="text-gray-600"><ShieldCheck className="mr-1 inline h-3 w-3" />Inspection planned · confirm provider and required stages</p>}
                          {step.inspection_needed === false && <p className="text-amber-700"><ShieldCheck className="mr-1 inline h-3 w-3" />No inspection currently identified · confirm before relying on this draft</p>}
                          {step.dependencies?.length > 0 && (
                            <p className="text-gray-600"><span className="font-medium">Depends on:</span> Step(s) {step.dependencies.map(d => Number(d) + 1).join(", ")}</p>
                          )}
                          {step.gap_reason && <p className="text-red-700"><AlertTriangle className="mr-1 inline h-3 w-3" />{step.gap_reason}</p>}
                          {(saved || revisionSource) && <WorkflowPlanningReview step={step} index={idx} editable={editingSteps && !saved && !saving} onChange={(field, value) => updateStaffReview(idx, field, value)} />}
                          {/* Citations */}
                          <WorkflowCitationList citations={step.citations} onOpenSourceDocument={(sourceId, citation, trigger) => {
                            if (!saved && onOpenSourceDocument) onOpenSourceDocument(sourceId);
                            else setSourceEvidence({ citation, draftRow: saved || { title: draftTitle, snapshot: draft }, trigger });
                          }} />
                          <p className="text-[10px] text-gray-400">Dedup key: {rowName}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <section aria-label="Save permitting draft" className="space-y-3 rounded-lg border bg-gray-50 p-3">
                <h3 className="text-sm font-semibold">3. Save draft for later review</h3>
                <Label htmlFor="pwd-title">Draft name</Label>
                <Input id="pwd-title" value={draftTitle} disabled={Boolean(saved) || saving} onChange={e => setDraftTitle(e.target.value)} className="min-h-11" />
                <Label htmlFor="pwd-review-notes">Review notes / questions to resolve</Label>
                <textarea id="pwd-review-notes" value={reviewNotes} disabled={Boolean(saved) || saving} onChange={e => setReviewNotes(e.target.value)} className="min-h-24 w-full rounded-md border p-3 text-sm" />
                <label className="flex min-h-11 items-start gap-2 text-sm">
                  <input type="checkbox" checked={reviewed} disabled={Boolean(saved) || saving} onChange={e => setReviewed(e.target.checked)} className="mt-1" />
                  I reviewed the proposed steps and unresolved questions. Saving does not approve requirements or start job work.
                </label>
                {saved && <p role="status" className="text-sm font-semibold text-green-700">Saved permitting draft: {saved.title}. No job lines created by this save.</p>}
              </section>
              {/* Create Result */}
              {createResult && (
                <div className="rounded-lg border p-3 text-sm">
                  <p className="flex items-center gap-1 font-semibold">
                    {createResult.created.length > 0
                      ? <><CheckCircle className="h-4 w-4 text-green-600" /> Created {createResult.created.length} permit line(s)</>
                      : <><AlertTriangle className="h-4 w-4 text-amber-600" /> No new lines created</>}
                  </p>
                  {createResult.skipped.length > 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      {createResult.skipped.length} line(s) already existed (idempotent skip): {createResult.skipped.map(s => s.rowName).join(", ")}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {draft && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 sm:p-4">
            <Button variant="outline" onClick={() => { if (!canLeaveReview()) return; setDraft(null); setCreateResult(null); setSaved(null); setRevisionSource(null); setEditingSteps(false); setReviewed(false); }} className="min-h-11">
              ← Edit inputs
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSaveDraft} disabled={saving || Boolean(saved) || !reviewed || !draftTitle.trim() || reviewIssues.length > 0} className="min-h-11 bg-purple-600 hover:bg-purple-700">{saving ? "Saving draft..." : saved ? "Draft saved" : revisionSource ? "Save revised permitting draft" : "Save permitting draft"}</Button>
              <Button variant="ghost" onClick={closeDesigner} className="min-h-11">Close</Button>
              {workOrder?.id && draft.steps.length > 0 && (
                <Button
                  onClick={handleCreateLines}
                  disabled={creating || !saved || draft.jurisdiction_unresolved || draft.steps.some(s => s.basis !== "approved_rule") || createResult?.created.length > 0}
                  className="min-h-11 gap-2 bg-green-600 hover:bg-green-700"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {creating ? "Creating..." : `Create ${draft.steps.length} Permit Line(s)`}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      {sourceEvidence && <WorkflowSourceEvidenceDialog {...sourceEvidence} onClose={() => setSourceEvidence(null)} />}
      {reviewPacket && <WorkflowReviewPacket {...reviewPacket} onClose={() => setReviewPacket(null)} />}
    </div>
  );
}