import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles, X, AlertTriangle, CheckCircle, FileText, MapPin, ChevronDown, ChevronUp, Plus, ShieldCheck } from "lucide-react";
import { runDesignerPipeline } from "./permitWorkflowDesigner";
import { createPermitLinesFromDraft, computeDeterministicRowName } from "./permitLineItemIntegration";

const SIGN_TYPE_OPTIONS = [
  "Wall Sign", "Monument", "Pole/Pylon", "Channel Letters", "Projecting",
  "Awning/Canopy", "Window", "Banner", "EMC/Digital", "Temporary", "Real Estate", "Directional",
];

const NEW_VS_REPLACEMENT_OPTIONS = ["New sign", "Face replacement", "Repair/Service"];
const TEMP_PERM_OPTIONS = ["Permanent", "Temporary"];

export default function PermitWorkflowDesigner({
  isOpen,
  onClose,
  preselectedJurisdiction = null,
  workOrder = null,
  onLinesCreated = () => {},
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
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState(null);
  const [expandedSteps, setExpandedSteps] = useState(new Set());

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
      setDraft(result);
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-bold text-gray-900">AI Permit Workflow Designer</h2>
            {preselectedJurisdiction?.jurisdiction_name && (
              <Badge className="bg-purple-100 text-purple-700">
                <MapPin className="mr-1 h-3 w-3" />
                {preselectedJurisdiction.jurisdiction_name}
              </Badge>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Input Form */}
          {!draft && (
            <div className="space-y-4">
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

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                    <Button size="sm" variant="ghost" onClick={() => setExpandedSteps(new Set(draft.steps.map((_, i) => i)))} className="text-xs">
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
                      <button
                        onClick={() => toggleStep(idx)}
                        className="flex min-h-11 w-full items-center gap-2 p-3 text-left"
                      >
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">{idx + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{step.permit_type}</span>
                            {basisBadge(step.basis)}
                          </div>
                          <p className="text-xs text-gray-500">{step.office} · {step.office_type}</p>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 flex-shrink-0 text-gray-400" /> : <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />}
                      </button>
                      {isExpanded && (
                        <div className="border-t p-3 space-y-2 text-xs">
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
                          {step.inspection_needed && <p className="text-gray-600"><ShieldCheck className="mr-1 inline h-3 w-3" />Inspection required</p>}
                          {step.dependencies?.length > 0 && (
                            <p className="text-gray-600"><span className="font-medium">Depends on:</span> Step(s) {step.dependencies.map(d => Number(d) + 1).join(", ")}</p>
                          )}
                          {step.gap_reason && <p className="text-red-700"><AlertTriangle className="mr-1 inline h-3 w-3" />{step.gap_reason}</p>}
                          {/* Citations */}
                          {step.citations?.length > 0 && (
                            <div className="mt-2 rounded border border-gray-100 bg-gray-50 p-2">
                              <p className="mb-1 font-semibold text-gray-500">Citations ({step.citations.length})</p>
                              {step.citations.map((c, i) => (
                                <div key={i} className="min-w-0 break-words text-[11px] text-gray-600">
                                  {c.section_or_page && <span className="font-medium">{c.section_or_page}: </span>}
                                  {c.excerpt && <span className="text-gray-500">"{c.excerpt.slice(0, 120)}{c.excerpt.length > 120 ? "…" : ""}"</span>}
                                  {c.source_document_id && <span className="text-gray-400"> [{c.source_document_id.slice(0, 8)}]</span>}
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="text-[10px] text-gray-400">Dedup key: {rowName}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

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
          <div className="flex items-center justify-between gap-2 border-t p-4">
            <Button variant="outline" onClick={() => { setDraft(null); setCreateResult(null); }} className="min-h-11">
              ← Edit inputs
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} className="min-h-11">Close</Button>
              {workOrder?.id && draft.steps.length > 0 && (
                <Button
                  onClick={handleCreateLines}
                  disabled={creating || createResult?.created.length > 0}
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
    </div>
  );
}