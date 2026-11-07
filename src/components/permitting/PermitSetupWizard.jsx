import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Loader2, MapPin, Search, Sparkles,
  AlertTriangle, Pencil, ListChecks,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { summarizeMatchedLocalityAuthority } from "@/shared/permittingAddressLocality.js";
import { runDesignerPipeline, saveWorkflowDraft, loadWorkflowDrafts } from "./permitWorkflowDesigner";

const ROLE_LABELS = {
  sign_permit: "Sign permit", zoning: "Zoning", building: "Building",
  electrical: "Electrical", electrical_permit: "Electrical permit",
  electrical_inspection: "Electrical inspection", right_of_way: "Right-of-way",
  historic_review: "Historic review", planning: "Planning",
  transportation: "Transportation", other: "Other",
};
const KNOWN_ROLES = new Set(Object.keys(ROLE_LABELS));
const officeRoles = (o) => {
  const roles = (Array.isArray(o?.authority_roles) ? o.authority_roles : []).filter(r => KNOWN_ROLES.has(r));
  if (roles.length) return roles;
  return (Array.isArray(o?.office_types) && o.office_types.length ? o.office_types : o?.office_type ? [o.office_type] : [])
    .filter(t => KNOWN_ROLES.has(t));
};

const STEPS = ["Site", "Offices", "AI plan", "Review"];
const STEP_ICONS = { Site: MapPin, Offices: ListChecks, "AI plan": Sparkles, Review: CheckCircle2 };

const defaultPlanForm = (wo, address) => ({
  address: address || "", customer: wo?.client_name || "",
  signTypes: "", dimensions: "", illuminated: false, electricalWork: false,
  freestanding: false, emcDigital: false,
  temporaryVsPermanent: "Permanent", newVsReplacement: "New sign",
  zoningContext: "", exemptionStatus: "",
});

export default function PermitSetupWizard({
  isOpen, onClose, workOrder, existingLines = [], localities = [],
  onApply, onPendingApply, onRemoveLocality,
}) {
  const { sessionToken } = useAuth() || {};
  const wo = workOrder || {};
  const isEdit = existingLines.length > 0;
  const appliedLocalityId = existingLines.find(li => li.locality_id)?.locality_id || "";
  const siteAddress = [wo.install_location, wo.address_line_2, wo.township_city, wo.county, wo.state]
    .filter(v => String(v || "").trim()).join(", ");

  const [step, setStep] = useState(isEdit ? 3 : 0);
  const [maxStep, setMaxStep] = useState(isEdit ? 3 : 0);
  const [address, setAddress] = useState(siteAddress);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [resolution, setResolution] = useState(null);
  const [localityId, setLocalityId] = useState("");
  const [excludeElectrical, setExcludeElectrical] = useState(false);
  const [selectedOffices, setSelectedOffices] = useState(null); // null = all
  const [planForm, setPlanForm] = useState(() => defaultPlanForm(wo, siteAddress));
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const searchSeq = useRef(0);

  const locality = useMemo(
    () => localities.find(l => l.id === localityId) || null,
    [localities, localityId],
  );

  // Edit mode seed: applied locality + existing drafts.
  useEffect(() => {
    if (!isOpen) return;
    const existingLocalityId = existingLines.find(li => li.locality_id)?.locality_id;
    if (existingLocalityId && !localityId) setLocalityId(existingLocalityId);
  }, [isOpen, existingLines]);
  useEffect(() => {
    if (!isOpen || !locality) return;
    loadWorkflowDrafts(locality.jurisdiction_profile_id, locality.name)
      .then(rows => setDrafts(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [isOpen, locality?.id]);

  const officePreview = useMemo(() => {
    if (!locality) return [];
    const offices = Array.isArray(locality.offices) && locality.offices.length ? locality.offices : null;
    if (offices) return offices.map((o, i) => ({
      key: o.id || `office-${i}`,
      name: o.name || "Office",
      roles: officeRoles(o),
      label: o.office_type || "",
      electrical: officeRoles(o).some(r => /electrical/i.test(r)) || /electrical/i.test(o.office_type || o.name || ""),
    }));
    const cats = locality.categories?.length ? locality.categories : [locality.office_type || "General"];
    return cats.map((cat, i) => ({
      key: `cat-${i}`, name: cat, roles: [], label: cat,
      electrical: /electrical/i.test(cat),
    }));
  }, [locality]);

  const visibleOffices = officePreview.filter(o => !o.electrical || !excludeElectrical);
  const chosenOffices = selectedOffices === null ? visibleOffices : visibleOffices.filter(o => selectedOffices.has(o.key));

  const authority = useMemo(() => (locality ? summarizeMatchedLocalityAuthority(locality) : null), [locality]);
  const verifiedCount = authority?.verified_office_count || 0;
  const applyReady = verifiedCount > 0;

  const goTo = (n) => { setStep(n); setMaxStep(prev => Math.max(prev, n)); };

  const runResolve = async () => {
    const q = String(address || "").trim();
    if (!q || resolving) return;
    const seq = ++searchSeq.current;
    setResolving(true); setResolveError(""); setResolution(null);
    try {
      let data;
      for (let attempt = 0; ; attempt++) {
        try {
          ({ data } = await base44.functions.invoke("resolvePermittingAddress", { address: q, session_token: sessionToken }));
          break;
        } catch (e) {
          if (!/status code (429|5\d\d)/.test(String(e?.message || "")) || attempt >= 2) throw e;
          await new Promise(r => setTimeout(r, 4000 * (attempt + 1)));
        }
      }
      if (seq !== searchSeq.current) return;
      if (data?.success === false) {
        setResolveError(data.error || "Couldn't resolve that address.");
      } else {
        setResolution(data);
        const suggested = data?.suggested_locality?.id;
        if (suggested && localities.some(l => l.id === suggested)) setLocalityId(suggested);
        setPlanForm(prev => ({ ...prev, address: q }));
        goTo(1);
      }
    } catch (e) {
      if (seq === searchSeq.current) setResolveError(e?.message || "Lookup failed — try again in a moment.");
    } finally {
      if (seq === searchSeq.current) setResolving(false);
    }
  };

  const buildPlan = async () => {
    if (planning) return;
    setPlanning(true); setPlanError(""); setPlan(null);
    try {
      const jurisdiction = locality ? {
        jurisdiction_id: locality.jurisdiction_profile_id || "",
        jurisdiction_name: locality.name || "",
        state: locality.state || "",
        locality_id: locality.id, locality_name: locality.name || "",
      } : null;
      const draft = await runDesignerPipeline(planForm, jurisdiction, sessionToken || "");
      setPlan(draft);
    } catch (e) {
      setPlanError(e?.message || "Couldn't build the plan — you can skip this step and still create the setup.");
    } finally {
      setPlanning(false);
    }
  };

  const localityChanged = isEdit && localityId && localityId !== appliedLocalityId;

  const finish = async () => {
    if (!locality || creating) return;
    setCreating(true);
    try {
      if (plan && !plan.jurisdiction_unresolved) {
        await saveWorkflowDraft(plan, planForm,
          `${locality.name || "Permit"} — ${wo.client_name || "job"}`, "").catch(() => {});
      }
      if (localityChanged) {
        await onRemoveLocality?.(appliedLocalityId);
      }
      const apply = applyReady ? onApply : onPendingApply;
      await (apply || onApply)?.(locality.id, { excludeElectrical, locality });
      setDone(true);
      setTimeout(() => { setDone(false); onClose(); }, 1400);
    } finally {
      setCreating(false);
    }
  };

  const canNext = step === 0 ? address.trim().length > 3
    : step === 1 ? Boolean(locality)
    : true;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="w-4 h-4 text-purple-600" />
            {isEdit ? "Edit permit setup" : "New permit setup"}
            <span className="text-xs font-normal text-gray-500 truncate">{wo.client_name}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Step rail */}
        <div className="flex items-center gap-1 mb-3" role="tablist" aria-label="Setup steps">
          {STEPS.map((label, i) => {
            const Icon = STEP_ICONS[label];
            const state = i === step ? "active" : i < step ? "done" : "todo";
            return (
              <button key={label} type="button" role="tab" aria-selected={i === step}
                disabled={i > maxStep}
                onClick={() => i <= maxStep && goTo(i)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                  state === "active" ? "border-purple-500 bg-purple-600 text-white"
                  : state === "done" ? "border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100"
                  : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            );
          })}
        </div>

        {/* ── Step 0: Site ── */}
        {step === 0 && (
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Job site address</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)}
                placeholder="123 Main St, Cincinnati, OH" className="h-9 text-sm mt-1"
                onKeyDown={e => { if (e.key === "Enter" && canNext) runResolve(); }} />
              <p className="text-[11px] text-gray-500 mt-1">Prefilled from the work order — fix it here if the install address differs.</p>
            </div>
            {resolveError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {resolveError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              {isEdit && <Button variant="outline" size="sm" onClick={() => goTo(1)}>Skip — keep current office</Button>}
              <Button size="sm" onClick={runResolve} disabled={!canNext || resolving}
                className="bg-purple-600 hover:bg-purple-700 gap-1.5">
                {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                {resolving ? "Resolving jurisdiction…" : "Find jurisdiction"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 1: Offices ── */}
        {step === 1 && (
          <div className="space-y-3">
            {resolution && (
              <div className={`rounded-lg border px-3 py-2 text-xs ${applyReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                {applyReady
                  ? <>Resolved: <strong>{resolution?.suggested_locality?.name || locality?.name}</strong> — {verifiedCount} verified office{verifiedCount === 1 ? "" : "s"} on file.</>
                  : <>Resolved to <strong>{locality?.name || "a jurisdiction"}</strong>, but its offices aren't verified yet — the setup will auto-apply when verification finishes.</>}
              </div>
            )}
            <div>
              <Label className="text-sm">Permitting office</Label>
              <Select value={localityId} onValueChange={setLocalityId}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Pick the jurisdiction…" /></SelectTrigger>
                <SelectContent>
                  {localities.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}{l.state ? ` (${l.state})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {locality && officePreview.length > 0 && (
              <div className="rounded-lg border border-gray-200 divide-y">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 flex items-center justify-between">
                  Permit lines this will create
                  {officePreview.some(o => o.electrical) && (
                    <label className="flex items-center gap-1 normal-case font-medium text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={excludeElectrical} onChange={e => setExcludeElectrical(e.target.checked)} className="accent-purple-600" />
                      Exclude electrical
                    </label>
                  )}
                </div>
                {visibleOffices.map(o => (
                  <div key={o.key} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span className="font-medium text-gray-800">{o.name}</span>
                    <span className="text-[10px] text-gray-500 truncate">
                      {(o.roles.length ? o.roles.map(r => ROLE_LABELS[r] || r) : [o.label]).filter(Boolean).join(" · ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {locality && officePreview.length === 0 && (
              <p className="text-xs text-gray-500">No office list configured — one general line will be created.</p>
            )}
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => goTo(0)} className="gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Back</Button>
              <Button size="sm" disabled={!canNext} onClick={() => goTo(2)} className="bg-purple-600 hover:bg-purple-700 gap-1">
                Next <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: AI plan ── */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Sign type(s)</Label>
                <Input value={planForm.signTypes} onChange={e => setPlanForm(p => ({ ...p, signTypes: e.target.value }))}
                  placeholder="Channel letters, monument…" className="h-8 text-sm mt-0.5" />
              </div>
              <div>
                <Label className="text-xs">Dimensions</Label>
                <Input value={planForm.dimensions} onChange={e => setPlanForm(p => ({ ...p, dimensions: e.target.value }))}
                  placeholder='e.g. 4×8 ft' className="h-8 text-sm mt-0.5" />
              </div>
              <div>
                <Label className="text-xs">Scope</Label>
                <Select value={planForm.newVsReplacement} onValueChange={v => setPlanForm(p => ({ ...p, newVsReplacement: v }))}>
                  <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["New sign", "Face replacement", "Repair", "Temporary"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-3 pb-1">
                {[["illuminated", "Illuminated"], ["electricalWork", "Electrical"], ["freestanding", "Freestanding"]].map(([k, lbl]) => (
                  <label key={k} className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={planForm[k]} onChange={e => setPlanForm(p => ({ ...p, [k]: e.target.checked }))} className="accent-purple-600" />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>

            {planError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{planError}</div>
            )}
            {plan && (
              <div className="rounded-lg border border-purple-200 bg-purple-50/50 divide-y divide-purple-100 max-h-56 overflow-y-auto">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-purple-700 flex justify-between">
                  <span>AI permit plan — {plan.steps?.length || 0} steps</span>
                  {plan.summary && <span className="normal-case font-medium text-purple-500 truncate ml-3">{plan.summary}</span>}
                </div>
                {(plan.steps || []).map((s, i) => (
                  <div key={i} className="px-3 py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400 font-mono w-4 flex-shrink-0">{i + 1}</span>
                      <span className="font-medium text-gray-800 truncate">{s.title || s.action || `Step ${i + 1}`}</span>
                      <span className={`ml-auto flex-shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold ${
                        s.basis === "approved_rule" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : s.basis === "pending_review" ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-gray-200 bg-gray-50 text-gray-500"}`}>
                        {s.basis === "approved_rule" ? "verified" : s.basis === "pending_review" ? "pending" : "confirm"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {drafts.length > 0 && !plan && (
              <p className="text-[11px] text-gray-500">{drafts.length} saved plan{drafts.length === 1 ? "" : "s"} already on file for {locality?.name} — check Workflow drafts.</p>
            )}

            <div className="flex justify-between items-center">
              <Button variant="ghost" size="sm" onClick={() => goTo(1)} className="gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => goTo(3)}>Skip</Button>
                <Button size="sm" onClick={buildPlan} disabled={planning}
                  className="bg-purple-600 hover:bg-purple-700 gap-1.5">
                  {planning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {planning ? "Building…" : plan ? "Rebuild plan" : "Build with AI"}
                </Button>
                <Button size="sm" onClick={() => goTo(3)} disabled={planning}
                  className="bg-emerald-600 hover:bg-emerald-700 gap-1">
                  Next <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Review / edit ── */}
        {step === 3 && (
          <div className="space-y-3">
            {isEdit ? (
              <div className="rounded-lg border border-gray-200 divide-y">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">Current setup</div>
                {existingLines.map(li => (
                  <div key={li.id} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                    <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${li.status === "complete" ? "text-emerald-500" : "text-gray-300"}`} />
                    <span className="font-medium text-gray-800">{li.row_name || li.office_type || "Line"}</span>
                    <span className="text-[10px] text-gray-500">{li.locality_name}</span>
                    <span className="ml-auto text-[10px] text-gray-400">{li.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 divide-y text-xs">
                <div className="px-3 py-2 flex justify-between">
                  <span className="text-gray-500">Site</span>
                  <span className="font-medium text-gray-800 text-right">{address || "—"}</span>
                </div>
                <div className="px-3 py-2 flex justify-between">
                  <span className="text-gray-500">Office</span>
                  <span className="font-medium text-gray-800">{locality?.name}{locality?.state ? `, ${locality.state}` : ""}</span>
                </div>
                <div className="px-3 py-2 flex justify-between">
                  <span className="text-gray-500">Permit lines</span>
                  <span className="font-medium text-gray-800">{chosenOffices.length || 1}</span>
                </div>
                <div className="px-3 py-2 flex justify-between">
                  <span className="text-gray-500">AI plan</span>
                  <span className="font-medium text-gray-800">{plan ? `${plan.steps?.length || 0} steps` : "Skipped"}</span>
                </div>
              </div>
            )}

            {!applyReady && locality && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                Offices for {locality.name} aren't verified — {isEdit ? "changes apply" : "the setup applies"} automatically when verification finishes.
              </div>
            )}

            <div className="flex justify-between items-center">
              <Button variant="ghost" size="sm" onClick={() => goTo(isEdit ? 1 : 2)} className="gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Back</Button>
              <div className="flex gap-2">
                {isEdit ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => goTo(0)} className="gap-1"><Pencil className="w-3 h-3" /> Change offices</Button>
                    <Button variant="outline" size="sm" onClick={() => goTo(2)} className="gap-1"><Sparkles className="w-3 h-3" /> Edit AI plan</Button>
                    {localityChanged && (
                      <Button size="sm" onClick={finish} disabled={creating}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                        {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        {done ? "Saved!" : `Switch to ${locality?.name || "new office"}`}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button size="sm" onClick={finish} disabled={!locality || creating}
                    className={`gap-1.5 ${applyReady ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-500 hover:bg-amber-600"}`}>
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {done ? "Created!" : applyReady ? `Create ${chosenOffices.length || 1} permit line${(chosenOffices.length || 1) === 1 ? "" : "s"}` : "Queue setup"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
