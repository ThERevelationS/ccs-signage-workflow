import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Loader2, MapPin, Search, Sparkles,
  AlertTriangle, Pencil, ListChecks, FileText, ChevronDown, ChevronUp, Minus, Plus, X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { staffEntities } from "@/components/staff/staffEntities";
import { estimateIdsOf, loadEstimateSiteAddress, workOrderSiteAddress } from "./jobSiteAddress";
import { summarizeMatchedLocalityAuthority } from "@/shared/permittingAddressLocality.js";
import { runDesignerPipeline, saveWorkflowDraft, loadWorkflowDrafts } from "./permitWorkflowDesigner";
import {
  EXTRA_LABELS, SIGN_SCOPES, SIGN_TYPE_MAP, SIGN_TYPES,
  addWorkingDays, ensureUnitIds, legacyInputsFromSigns, mapAiError, mergeScannedSigns,
  parseLocalDate, preBuildWarnings, profileLimits, setTypeCount, totalUnitCount,
  unitAreaSqFt, unitRuleFlags, workingDaysBetween,
} from "./permitSigns";
import { buildSignScanPrompt, SIGN_SCAN_JSON_SCHEMA } from "./permitPlanPrompt";
import { withRateLimitRetry } from "@/lib/loadAllEntityRows";

const ROLE_LABELS = {
  sign_permit: "Sign permit", zoning: "Zoning", building: "Building",
  electrical: "Electrical", electrical_permit: "Electrical permit",
  electrical_inspection: "Electrical inspection", right_of_way: "Right-of-way",
  historic_review: "Historic review", planning: "Planning",
  transportation: "Transportation", other: "Other",
};
const KNOWN_ROLES = new Set(Object.keys(ROLE_LABELS));
const SPECULATIVE_ROLES = new Set(["historic_review", "right_of_way", "transportation", "planning", "other"]);
const officeRoles = (o) => {
  const roles = (Array.isArray(o?.authority_roles) ? o.authority_roles : []).filter(r => KNOWN_ROLES.has(r));
  if (roles.length) return roles;
  return (Array.isArray(o?.office_types) && o.office_types.length ? o.office_types : o?.office_type ? [o.office_type] : [])
    .filter(t => KNOWN_ROLES.has(t));
};
const normalizePlaceName = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const normalizeCountyName = (value) => normalizePlaceName(value).replace(/\s+county$/, "");
const countyParts = (value) => String(value || "").split("/").map(normalizeCountyName).filter(Boolean);
const localityCounty = (locality) => locality?.county_name || locality?.parent_county_name || "";
const localityTypeLabel = (locality) => String(locality?.jurisdiction_type || "")
  .replaceAll("_", " ")
  .replace(/\b\w/g, character => character.toUpperCase());
const localityIdentityKey = (locality) => [
  normalizePlaceName(locality?.name),
  normalizePlaceName(locality?.state),
  normalizeCountyName(localityCounty(locality)),
].join("|");
const matchCandidateLocality = (candidate, localities) => {
  const name = normalizePlaceName(candidate?.name);
  if (!name) return [];
  return localities.filter((locality) => {
    if (String(locality?.duplicate_of || "").trim()) return false;
    if (normalizePlaceName(locality?.name) !== name) return false;
    if (candidate.state && normalizePlaceName(locality?.state) !== normalizePlaceName(candidate.state)) return false;
    const county = localityCounty(locality);
    if (candidate.county && county && !countyParts(county).includes(normalizeCountyName(candidate.county))) return false;
    return true;
  });
};

const STEPS = ["Site", "Offices", "AI plan", "Review"];
const STEP_ICONS = { Site: MapPin, Offices: ListChecks, "AI plan": Sparkles, Review: CheckCircle2 };

const defaultPlanForm = (wo, address) => ({
  address: address || "", customer: wo?.client_name || "",
  signs: [],
  signTypes: "", dimensions: "", illuminated: false, electricalWork: false,
  freestanding: false, emcDigital: false,
  temporaryVsPermanent: "Permanent", newVsReplacement: "New sign",
  zoningContext: "", exemptionStatus: "",
});

const OfficeSelectionRow = ({ office, on, onToggle }) => (
  <label className={`px-3 py-1.5 flex items-center gap-2 text-xs cursor-pointer ${on ? "" : "opacity-40"}`}>
    <input type="checkbox" checked={on} className="accent-purple-600" onChange={onToggle} />
    <span className="font-medium text-gray-800">{office.name}</span>
    <span className="text-[10px] text-gray-500 truncate">
      {(office.roles.length ? office.roles.map(role => ROLE_LABELS[role] || role) : [office.label]).filter(Boolean).join(" · ")}
    </span>
    <span className={`ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
      office.verified ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"
    }`}>
      {office.verified ? "verified" : "unverified"}
    </span>
  </label>
);

const normalizeAddress = (raw) => {
  let a = String(raw || "").replace(/\s+/g, " ").trim();
  a = a.replace(/\b(unit|suite|ste|apt|apartment|#)\s*[A-Za-z0-9-]+\b/ig, "");
  a = a.replace(/,\s*(USA|United States|US)\.?$/i, "");
  a = a.replace(/\b([0-9]{5})-[0-9]{4}\b/g, "$1");
  a = a.replace(/[ \t]+,/g, ",").replace(/,(?=\S)/g, ", ").replace(/,\s*,+/g, ",");
  return a.replace(/\s+/g, " ").trim().replace(/^,+|,+$/g, "") || String(raw || "").trim();
};

// Boundary picks mint reusable rules — a resolved conflict fixes every future
// address in that postal-city pattern, not just this one (mirrors the picker).
const ruleNameNorm = (v) => String(v || "").trim().toLowerCase().replace(/\s+(city|village|town|county|township)$/, "").replace(/\s+/g, " ");
function mintResolutionRule({ address, resolution, pickedName, pickedType, pickedCounty, forCity }) {
  if (!address || !pickedName) return;
  const state = String(resolution?.state || pickedName.state || "").toUpperCase();
  if (!state) return;
  const parts = String(address).split(",").map(s => s.trim());
  const enteredCity = parts.length > 1 ? parts[1] : "";
  const county = String(pickedCounty || resolution?.location_resolution?.target?.county || resolution?.location_resolution?.candidates?.[0]?.county || "");
  const data = {
    rule_type: forCity && enteredCity ? "postal_name_map" : "address_override",
    entered_name: forCity && enteredCity ? ruleNameNorm(enteredCity) : "",
    address_key: forCity && enteredCity ? "" : ruleNameNorm(parts[0]),
    state, county: ruleNameNorm(county),
    jurisdiction_name: ruleNameNorm(typeof pickedName === "string" ? pickedName : pickedName.name),
    jurisdiction_type: /township|twp/i.test(String(pickedType)) ? "township" : /county/i.test(String(pickedType)) ? "county" : /village/i.test(String(pickedType)) ? "village" : "municipality",
    source: "staff_review",
    evidence: `Staff resolved "${address}" -> ${typeof pickedName === "string" ? pickedName : pickedName.name} in the setup wizard.`,
    created_from_address: String(address).slice(0, 300),
    active: true,
  };
  staffEntities.PermitResolutionRule.create(data).catch(() => {});
}

const RECENT_KEY = "permitting_recent_addresses";

const loadRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } };
const rememberRecent = (addr) => {
  const a = String(addr || "").trim(); if (!a) return;
  try {
    const list = loadRecent().filter(x => x !== a);
    list.unshift(a);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5)));
  } catch {}
};

const UnitSizeInput = ({ label, value, onChange }) => (
  <label className="flex items-center gap-1 text-[10px] text-gray-500">
    <span className="whitespace-nowrap">{label}</span>
    <input type="number" min="0" step="any" value={value ?? ""}
      onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className="h-7 w-16 rounded-md border border-gray-200 bg-white px-1.5 text-xs" />
    <span>in</span>
  </label>
);

const stripHtml = (v) => String(v || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);

const fmtDay = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtDateMaybe = (v) => {
  const d = parseLocalDate(v);
  return d ? fmtDay(d) : String(v || "");
};
// "due Mon, Dec 8" for a step's working-day offset, or "" when unset/invalid.
const stepDueLabel = (step) => {
  const v = step?.target_days_from_start;
  const n = v === null || v === undefined || v === "" ? null : Number(v);
  if (!Number.isFinite(n) || n < 0) return "";
  const d = addWorkingDays(new Date(), n);
  return d ? `due ${fmtDay(d)}` : "";
};

const RulesOnFilePanel = ({ jurisdiction, limits }) => {
  const [showText, setShowText] = useState(false);
  const chips = [];
  if (limits.maxAreaSqFt != null) chips.push(`Max area ${limits.maxAreaSqFt} sq ft`);
  if (limits.maxHeightFt != null) chips.push(`Max height ${limits.maxHeightFt} ft`);
  if (limits.illuminationAllowed === true) chips.push("Illumination allowed");
  else if (limits.illuminationAllowed === false) chips.push("Illumination not allowed");
  if (limits.electronicAllowed === true) chips.push("Electronic signs allowed");
  else if (limits.electronicAllowed === false) chips.push("Electronic signs not allowed");
  if (limits.feeRange) chips.push(`Fees: ${limits.feeRange}`);
  if (limits.processingTime) chips.push(`Processing: ${limits.processingTime}`);
  if (!chips.length && !limits.texts.length) {
    return <p className="text-[10px] text-gray-400">No size or height rules on file for this jurisdiction.</p>;
  }
  return (
    <div className="space-y-1 rounded-lg border border-gray-200 bg-gray-50/60 px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-gray-600">
          Rules on file for {jurisdiction} — from research, not verified
        </span>
        {limits.texts.length > 0 && (
          <button type="button" onClick={() => setShowText(v => !v)}
            className="ml-auto shrink-0 text-[10px] font-medium text-purple-700 underline underline-offset-2">
            {showText ? "Hide rule text" : "Show rule text"}
          </button>
        )}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((c, i) => (
            <span key={i} className="rounded-full border border-gray-200 bg-white px-1.5 py-px text-[9px] text-gray-600">{c}</span>
          ))}
        </div>
      )}
      {showText && (
        <div className="space-y-1 border-t border-gray-100 pt-1">
          {limits.texts.map((t, i) => (
            <p key={i} className="text-[10px] text-gray-600">
              <span className="font-semibold">{t.label}: </span>
              {t.text.length > 600 ? `${t.text.slice(0, 600)}…` : t.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

const STEP_BASIS_BADGE = {
  approved_rule: { label: "approved", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  pending_review: { label: "research-backed", cls: "border-amber-200 bg-amber-50 text-amber-700" },
};

const PlanStepRow = ({ index, step, officeNames, signCount, expanded, onToggleExpand, onEdit, onMove, onDelete, isFirst, isLast }) => {
  const [docInput, setDocInput] = useState("");
  const badge = STEP_BASIS_BADGE[step.basis] || { label: "needs confirmation", cls: "border-gray-200 bg-gray-50 text-gray-500" };
  const officeIsKnown = officeNames.includes(step.office);
  const dueLabel = stepDueLabel(step);
  return (
    <div className="px-2 py-1.5 text-xs">
      <div className="flex items-center gap-1.5 cursor-pointer" onClick={onToggleExpand}>
        <span className="w-4 shrink-0 font-mono text-purple-400">{index + 1}</span>
        <span className="max-w-[130px] shrink-0 truncate rounded-full border border-purple-200 bg-white px-1.5 py-px text-[9px] font-semibold text-purple-700">
          {step.office || "—"}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{step.action || step.title || `Step ${index + 1}`}</span>
        {(Array.isArray(step.signs) ? step.signs : []).map(n => (
          <span key={n} className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-1 py-px text-[9px] font-semibold text-sky-700">#{n}</span>
        ))}
        <span className={`shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold ${badge.cls}`}>{badge.label}</span>
        {dueLabel && <span className="shrink-0 text-[9px] text-gray-400">{dueLabel}</span>}
        <button type="button" disabled={isFirst} aria-label="Move step up"
          onClick={e => { e.stopPropagation(); onMove(index, -1); }}
          className="shrink-0 text-gray-400 hover:text-purple-700 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
        <button type="button" disabled={isLast} aria-label="Move step down"
          onClick={e => { e.stopPropagation(); onMove(index, 1); }}
          className="shrink-0 text-gray-400 hover:text-purple-700 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
        <button type="button" aria-label="Delete step"
          onClick={e => { e.stopPropagation(); onDelete(index); }}
          className="shrink-0 text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
      </div>
      {expanded && (
        <div className="mt-1.5 space-y-1.5 pl-6" onClick={e => e.stopPropagation()}>
          <Textarea value={step.action || ""} rows={2} placeholder="Action"
            onChange={e => onEdit(index, { action: e.target.value })}
            className="min-h-[52px] text-xs" />
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <Label className="text-[10px]">Office</Label>
              <Select value={officeIsKnown ? step.office : "__other__"}
                onValueChange={v => onEdit(index, { office: v === "__other__" ? (officeIsKnown ? "" : step.office) : v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {officeNames.map(n => <SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>)}
                  <SelectItem value="__other__" className="text-xs">Other…</SelectItem>
                </SelectContent>
              </Select>
              {!officeIsKnown && (
                <Input value={step.office || ""} placeholder="Office name"
                  onChange={e => onEdit(index, { office: e.target.value })} className="mt-1 h-7 text-xs" />
              )}
            </div>
            <div>
              <Label className="text-[10px]">Permit type</Label>
              <Input value={step.permit_type || ""} onChange={e => onEdit(index, { permit_type: e.target.value })} className="h-7 text-xs" />
            </div>
          </div>
          {signCount > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-gray-500">Signs:</span>
              {Array.from({ length: signCount }, (_, k) => k + 1).map(n => {
                const on = (step.signs || []).includes(n);
                return (
                  <button key={n} type="button"
                    onClick={() => onEdit(index, { signs: on ? (step.signs || []).filter(x => x !== n) : [...(step.signs || []), n].sort((a, b) => a - b) })}
                    className={`rounded-full border px-1.5 py-px text-[9px] font-semibold ${on ? "border-sky-300 bg-sky-100 text-sky-800" : "border-gray-200 bg-white text-gray-400"}`}>
                    #{n}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-gray-500">Docs:</span>
            {(Array.isArray(step.required_documents) ? step.required_documents : []).map((d, di) => (
              <span key={di} className="inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1.5 py-px text-[9px] text-gray-600">
                {d}
                <button type="button" className="text-gray-300 hover:text-red-500" aria-label="Remove document"
                  onClick={() => onEdit(index, { required_documents: step.required_documents.filter((_, k) => k !== di) })}>
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            <input value={docInput} onChange={e => setDocInput(e.target.value)}
              onKeyDown={e => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const v = docInput.trim();
                if (!v) return;
                onEdit(index, { required_documents: [...(Array.isArray(step.required_documents) ? step.required_documents : []), v] });
                setDocInput("");
              }}
              placeholder="+ document" className="h-6 w-24 rounded border border-gray-200 px-1.5 text-[10px]" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <Label className="text-[10px]">Fee expectation</Label>
              <Input value={step.fee_expectation || ""} onChange={e => onEdit(index, { fee_expectation: e.target.value })} className="h-7 text-xs" />
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <div className="flex-1">
                <Label className="text-[10px]">Days from start</Label>
                <Input type="number" value={step.target_days_from_start ?? ""}
                  onChange={e => onEdit(index, { target_days_from_start: e.target.value === "" ? null : Number(e.target.value) })}
                  className="h-7 text-xs" />
              </div>
              <label className="flex items-center gap-1 pb-1 text-[10px] text-gray-600">
                <input type="checkbox" className="accent-purple-600" checked={!!step.inspection_needed}
                  onChange={e => onEdit(index, { inspection_needed: e.target.checked })} /> Inspection
              </label>
            </div>
          </div>
          {(Array.isArray(step.citations) ? step.citations : []).length > 0 && (
            <div className="space-y-0.5 rounded border border-gray-100 bg-gray-50/60 p-1.5">
              {step.citations.map((c, ci) => (
                <div key={ci} className="text-[9px] text-gray-500">
                  <span className="font-semibold">{c.title || c.section_or_page || c.source_document_id || `Source ${ci + 1}`}</span>
                  {c.excerpt ? ` — ${String(c.excerpt).slice(0, 160)}` : ""}
                  {c.url ? <> <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-purple-600 underline">link</a></> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const PlanStepsEditor = ({ steps, officeNames, signCount, expanded, onToggleExpand, onEdit, onMove, onDelete, onAdd, installDate }) => {
  const officeCount = new Set(steps.map(s => s.office).filter(Boolean)).size;
  const targets = steps.map(s => {
    const v = s?.target_days_from_start;
    const n = v === null || v === undefined || v === "" ? null : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }).filter(n => n != null);
  const latestDue = targets.length ? addWorkingDays(new Date(), Math.max(...targets)) : null;
  const install = parseLocalDate(installDate);
  const installValid = !!install;
  const overrunDays = installValid && latestDue && latestDue > install ? workingDaysBetween(install, latestDue) : 0;
  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/50">
      <div className="border-b border-purple-100 px-3 py-1.5">
        <div className="text-[10px] font-bold uppercase tracking-wide text-purple-700">
          {steps.length} step{steps.length === 1 ? "" : "s"} across {officeCount} office{officeCount === 1 ? "" : "s"}
        </div>
        <div className="mt-0.5 text-[9px] font-normal normal-case tracking-normal text-gray-500">
          {installDate ? (
            <>
              Install {installValid ? fmtDay(install) : fmtDateMaybe(installDate)}
              {latestDue ? ` · plan finishes ${fmtDay(latestDue)}` : ""}
              {overrunDays > 0 && (
                <span className="font-semibold text-amber-700">
                  {" "}· Plan runs {overrunDays} working day{overrunDays === 1 ? "" : "s"} past the install date
                </span>
              )}
            </>
          ) : "No install date on the work order"}
        </div>
      </div>
      <div className="max-h-72 divide-y divide-purple-100 overflow-y-auto">
        {steps.map((s, i) => (
          <PlanStepRow key={i} index={i} step={s} officeNames={officeNames} signCount={signCount}
            expanded={expanded.has(i)} onToggleExpand={() => onToggleExpand(i)}
            onEdit={onEdit} onMove={onMove} onDelete={onDelete}
            isFirst={i === 0} isLast={i === steps.length - 1} />
        ))}
      </div>
      <button type="button" onClick={onAdd}
        className="w-full border-t border-purple-100 px-3 py-1.5 text-left text-[11px] font-semibold text-purple-700 hover:bg-purple-100/60">
        + Add step
      </button>
    </div>
  );
};

// places_autocomplete returns { text, main, secondary }; older shapes used description/label.
const suggestionText = (s) => (typeof s === "string" ? s : s?.text || s?.description || s?.label || [s?.main, s?.secondary].filter(Boolean).join(", ") || "");

export default function PermitSetupWizard({
  isOpen, onClose, workOrder, existingLines = [], localities = [],
  onApply, onPendingApply, onRemoveLocality, onDeleteLines, initialStep,
}) {
  const { sessionToken } = useAuth() || {};
  const wo = workOrder || {};
  const isEdit = existingLines.length > 0;
  const appliedLocalityId = existingLines.find(li => li.locality_id)?.locality_id || "";
  const startStep = Number.isInteger(initialStep) ? initialStep : isEdit ? 3 : 0;
  const siteAddress = workOrderSiteAddress(wo);

  const [step, setStep] = useState(startStep);
  const [maxStep, setMaxStep] = useState(Math.max(startStep, isEdit ? 3 : 0));
  const [address, setAddress] = useState(siteAddress);
  const [addressSource, setAddressSource] = useState(siteAddress ? "work_order" : "");
  const [sourceEstimate, setSourceEstimate] = useState("");
  const estimateIdsKey = estimateIdsOf(wo).join(",");
  const addressRef = useRef(address);
  addressRef.current = address;
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [resolution, setResolution] = useState(null);
  const [pickedCandidate, setPickedCandidate] = useState(null);
  const [rememberForCity, setRememberForCity] = useState(false);
  const [localityId, setLocalityId] = useState("");
  const [localitySearchQuery, setLocalitySearchQuery] = useState("");
  const [localitySearchOpen, setLocalitySearchOpen] = useState(false);
  const [candidateMatchNote, setCandidateMatchNote] = useState("");
  const [excludeElectrical, setExcludeElectrical] = useState(false);
  const [deselectedOffices, setDeselectedOffices] = useState(new Set());
  const [confirmRemoveLines, setConfirmRemoveLines] = useState(false);
  const [planSteps, setPlanSteps] = useState([]);
  const [expandedSteps, setExpandedSteps] = useState(new Set());
  const [scanning, setScanning] = useState(false);
  const [scanInfo, setScanInfo] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [recent, setRecent] = useState(() => loadRecent());
  const [planForm, setPlanForm] = useState(() => defaultPlanForm(wo, siteAddress));
  const [planning, setPlanning] = useState(false);
  const [preBuild, setPreBuild] = useState([]);
  const [planProfile, setPlanProfile] = useState({ pid: "", loading: false, value: undefined });
  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState("");
  const [planSaved, setPlanSaved] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const searchSeq = useRef(0);
  const suggestionReq = useRef(0);
  // Suggestions only for addresses staff type — a prefilled or picked address
  // never opens the dropdown (or spends a Places request).
  const typedRef = useRef(false);
  const initializedAppliedLocalityRef = useRef(false);
  const editPrefillLocalityRef = useRef("");

  // No usable install address on the WO — use the linked estimate's install
  // site. Only fills an empty field, so anything staff typed meanwhile wins.
  useEffect(() => {
    if (!isOpen || siteAddress || !estimateIdsKey) return;
    let alive = true;
    loadEstimateSiteAddress(estimateIdsKey.split(",")).then(found => {
      if (!alive || !found || String(addressRef.current || "").trim()) return;
      setAddress(found.address);
      setAddressSource("estimate");
      setSourceEstimate(found.estimateNumber);
      setPlanForm(p => (p.address ? p : { ...p, address: found.address }));
    });
    return () => { alive = false; };
  }, [isOpen, siteAddress, estimateIdsKey]);

  const locality = useMemo(
    () => localities.find(l => l.id === localityId) || null,
    [localities, localityId],
  );

  useEffect(() => {
    if (!isOpen) return;
    const existingLocalityId = appliedLocalityId;
    if (existingLocalityId && !initializedAppliedLocalityRef.current && !localityId) {
      setLocalityId(existingLocalityId);
      initializedAppliedLocalityRef.current = true;
    }
  }, [isOpen, appliedLocalityId, localityId]);

  useEffect(() => {
    if (!isOpen || !locality) return;
    loadWorkflowDrafts(locality.jurisdiction_profile_id, locality.name)
      .then(rows => setDrafts(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [isOpen, locality?.id]);

  // Fetch the linked JurisdictionProfile once per jurisdiction when the AI plan
  // step opens — feeds the rules-on-file panel, unit flags, and the plan call.
  // planProfile itself can't be a dep: setPlanProfile would re-fire the effect
  // and the cleanup would drop the in-flight fetch. The ref guards instead, and
  // a killed fetch clears it so revisiting the step refetches.
  const planProfileReq = useRef("");
  useEffect(() => {
    const pid = locality?.jurisdiction_profile_id || "";
    if (!isOpen || step !== 2 || !pid || planProfileReq.current === pid) return;
    planProfileReq.current = pid;
    let alive = true;
    let done = false;
    const finish = (value) => {
      if (!alive) return;
      done = true;
      setPlanProfile({ pid, loading: false, value });
    };
    setPlanProfile({ pid, loading: true, value: undefined });
    withRateLimitRetry(() => staffEntities.JurisdictionProfile.get(pid))
      .then(p => finish(p || null))
      .catch(() => finish(null));
    return () => {
      alive = false;
      if (!done && planProfileReq.current === pid) planProfileReq.current = "";
    };
  }, [isOpen, step, locality?.jurisdiction_profile_id]);

  const loadedPlanProfile = planProfile.pid === (locality?.jurisdiction_profile_id || "")
    ? planProfile.value : undefined;
  const planLimits = useMemo(() => profileLimits(loadedPlanProfile ?? null), [loadedPlanProfile]);

  // Address autocomplete — same places_autocomplete the picker uses.
  useEffect(() => {
    const q = address.trim();
    if (!typedRef.current || !sessionToken || q.length < 4 || resolving) { setSuggestions([]); return; }
    const reqId = ++suggestionReq.current;
    const t = setTimeout(async () => {
      try {
        const { data } = await base44.functions.invoke("findLocalityByAddress", {
          action: "places_autocomplete", input: q, session_token: sessionToken,
        });
        if (reqId === suggestionReq.current) setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions.slice(0, 5) : []);
      } catch {}
    }, 350);
    return () => clearTimeout(t);
  }, [address, resolving, sessionToken]);

  const officePreview = useMemo(() => {
    if (!locality) return [];
    const offices = Array.isArray(locality.offices) && locality.offices.length ? locality.offices : null;
    if (offices) return offices.map((o, i) => {
      const roles = officeRoles(o);
      const verified = o.authority_verification_status === "staff_verified";
      return {
        key: o.id || `office-${i}`,
        officeId: o.id || "",
        name: o.name || "Office",
        roles,
        label: o.office_type || "",
        verified,
        speculative: !verified && (!roles.length || roles.every(role => SPECULATIVE_ROLES.has(role))),
        electrical: roles.some(r => /electrical/i.test(r)) || /electrical/i.test(o.office_type || o.name || ""),
      };
    });
    const cats = locality.categories?.length ? locality.categories : [locality.office_type || "General"];
    return cats.map((cat, i) => ({
      key: `cat-${i}`, officeId: "", name: cat, roles: [], label: cat,
      verified: false, speculative: true,
      electrical: /electrical/i.test(cat),
    }));
  }, [locality]);

  const officePreviewRef = useRef(officePreview);
  officePreviewRef.current = officePreview;

  useEffect(() => {
    if (!localityId) {
      setDeselectedOffices(new Set());
      return;
    }
    if (isEdit && String(localityId) === String(appliedLocalityId)) return;
    setDeselectedOffices(new Set(officePreviewRef.current.filter(o => o.speculative).map(o => o.key)));
    setConfirmRemoveLines(false);
  }, [localityId, isEdit, appliedLocalityId]);

  useEffect(() => {
    if (!isOpen) return;
    if (!isEdit || String(localityId) !== String(appliedLocalityId)) {
      editPrefillLocalityRef.current = "";
      return;
    }
    if (!locality || String(locality.id) !== String(appliedLocalityId)
      || editPrefillLocalityRef.current === String(locality.id)) return;
    const existingOfficeIds = new Set(existingLines
      .filter(line => String(line.locality_id || "") === String(locality.id))
      .map(line => String(line.locality_office_id || "")));
    setDeselectedOffices(new Set(officePreview
      .filter(office => !existingOfficeIds.has(String(office.officeId || "")))
      .map(office => office.key)));
    setConfirmRemoveLines(false);
    editPrefillLocalityRef.current = String(locality.id);
  }, [isOpen, isEdit, localityId, locality, appliedLocalityId, existingLines, officePreview]);

  const visibleOffices = officePreview.filter(o => !o.electrical || !excludeElectrical);
  const chosenOffices = visibleOffices.filter(o => !deselectedOffices.has(o.key));

  const authority = useMemo(() => (locality ? summarizeMatchedLocalityAuthority(locality) : null), [locality]);
  const verifiedCount = authority?.verified_office_count || 0;
  const applyReady = verifiedCount > 0;

  const candidates = useMemo(() => {
    if (resolution?.suggested_locality) return [];
    const list = resolution?.location_resolution?.candidates;
    return Array.isArray(list) ? list : [];
  }, [resolution]);

  const duplicateLocalityCounts = useMemo(() => {
    const counts = new Map();
    for (const item of localities) {
      const key = localityIdentityKey(item);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [localities]);

  const searchResults = useMemo(() => {
    const tokens = localitySearchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const targetCounty = normalizeCountyName(
      resolution?.location_resolution?.target?.county || resolution?.ai_county || "",
    );
    const targetState = normalizePlaceName(resolution?.ai_state || resolution?.state || "");
    const rank = (item) => {
      const sameState = !!targetState && normalizePlaceName(item.state) === targetState;
      const sameCounty = !!targetCounty && countyParts(localityCounty(item)).includes(targetCounty);
      return sameState && sameCounty ? 0 : sameState ? 1 : 2;
    };
    return localities
      .filter((item) => !String(item?.duplicate_of || "").trim())
      .filter((item) => {
        const county = localityCounty(item);
        const haystack = `${item.name || ""} ${county} ${item.state || ""}`.toLowerCase();
        return tokens.every(token => haystack.includes(token));
      })
      .sort((a, b) => rank(a) - rank(b)
        || normalizePlaceName(a.name).localeCompare(normalizePlaceName(b.name))
        || normalizeCountyName(localityCounty(a)).localeCompare(normalizeCountyName(localityCounty(b)))
        || normalizePlaceName(a.state).localeCompare(normalizePlaceName(b.state)))
      .slice(0, 40);
  }, [localities, localitySearchQuery, resolution]);

  const sameLocalityLines = useMemo(
    () => existingLines.filter(line => String(line.locality_id || "") === String(localityId || "")),
    [existingLines, localityId],
  );
  const toAdd = chosenOffices.filter(office => !sameLocalityLines.some(
    line => String(line.locality_office_id || "") === String(office.officeId || ""),
  ));
  const toRemove = sameLocalityLines.filter(line => {
    const office = officePreview.find(item => String(item.officeId || "") === String(line.locality_office_id || ""));
    return office && !chosenOffices.some(item => item.key === office.key);
  });
  const removeLineSignature = toRemove.map(line => line.id).sort().join("|");
  const hasRemovalProgress = (line) => Boolean(
    line.submitted_date || line.permit_number || line.permit_received_date || line.application_reference_number,
  );
  const existingLocalityGroups = useMemo(() => {
    const groups = new Map();
    for (const line of existingLines) {
      const key = String(line.locality_id || line.locality_name || "unknown");
      if (!groups.has(key)) {
        const configured = localities.find(item => String(item.id) === String(line.locality_id || ""));
        groups.set(key, {
          key,
          id: line.locality_id || "",
          name: configured?.name || line.locality_name || "Unknown jurisdiction",
        });
      }
    }
    return [...groups.values()];
  }, [existingLines, localities]);
  const firstExistingLocalityName = localities.find(item => String(item.id) === String(appliedLocalityId))?.name
    || existingLines.find(line => String(line.locality_id || "") === String(appliedLocalityId))?.locality_name
    || existingLocalityGroups[0]?.name
    || "the first jurisdiction";

  useEffect(() => {
    setConfirmRemoveLines(false);
  }, [localityId, removeLineSignature]);

  const goTo = (n) => { setStep(n); setMaxStep(prev => Math.max(prev, n)); };

  const runResolve = async (overrideAddress) => {
    const q = String(overrideAddress ?? address ?? "").trim();
    if (!q || resolving) return;
    const seq = ++searchSeq.current;
    setResolving(true); setResolveError(""); setResolution(null); setPickedCandidate(null); setSuggestions([]);
    setLocalityId(""); setCandidateMatchNote("");
    try {
      let data;
      for (let attempt = 0; ; attempt++) {
        try {
          ({ data } = await base44.functions.invoke("resolvePermittingAddressV2", { address: normalizeAddress(q), session_token: sessionToken }));
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
        if (suggested && localities.some(l => l.id === suggested)) {
          setLocalityId(suggested);
          setLocalitySearchQuery("");
          setLocalitySearchOpen(false);
        } else {
          setLocalitySearchQuery(data?.ai_locality_name || "");
          setLocalitySearchOpen(true);
        }
        if (data?.suggested_locality || data?.geocode) { rememberRecent(q); setRecent(loadRecent()); }
        setPlanForm(prev => ({ ...prev, address: q }));
        goTo(1);
      }
    } catch (e) {
      if (seq === searchSeq.current) setResolveError(e?.message || "Lookup failed — try again in a moment.");
    } finally {
      if (seq === searchSeq.current) setResolving(false);
    }
  };

  // A boundary pick behaves like a detected target — match it to a configured locality.
  useEffect(() => {
    if (!pickedCandidate?.name) {
      setCandidateMatchNote("");
      return;
    }
    const matches = matchCandidateLocality(pickedCandidate, localities);
    if (matches.length === 1) {
      setLocalityId(matches[0].id);
      setLocalitySearchOpen(false);
      setLocalitySearchQuery("");
      setCandidateMatchNote("");
      return;
    }
    setLocalitySearchQuery(pickedCandidate.name);
    setLocalitySearchOpen(true);
    setCandidateMatchNote(matches.length
      ? `${matches.length} configured places named ${pickedCandidate.name} — pick the right one below`
      : `No configured jurisdiction matches ${pickedCandidate.name} yet — search below`);
  }, [pickedCandidate, localities]);

  // Signs — planForm.signs is the source of truth; the legacy flat keys are
  // re-derived on every change so saved drafts and the old designer still work.
  const updateSigns = (next) => setPlanForm(prev => {
    const signs = typeof next === "function" ? next(prev.signs || []) : next;
    return { ...prev, signs, ...legacyInputsFromSigns(signs) };
  });
  const updateUnit = (type, unitIndex, patch) => updateSigns(signs => signs.map(e =>
    e.type === type
      ? { ...e, units: e.units.map((u, i) => (i === unitIndex ? { ...u, ...patch } : u)) }
      : e));
  const removeUnit = (type, unitIndex) => updateSigns(signs =>
    signs.map(e => (e.type === type ? { ...e, units: e.units.filter((_, i) => i !== unitIndex) } : e))
      .filter(e => e.units.length > 0));
  const signUnitCount = totalUnitCount(planForm.signs);
  const estimateIds = estimateIdsOf(wo);
  const installDate = wo.project_install_date || wo.due_date || "";

  const scanEstimateSigns = async (rescan = false) => {
    if (!estimateIds.length || scanning) return;
    setScanning(true); setScanInfo(null); setPlanError("");
    try {
      const estimates = (await Promise.all(
        estimateIds.map(id => staffEntities.AllInOneEstimate.get(id).catch(() => null)),
      )).filter(Boolean);
      if (!estimates.length) { setPlanError("Couldn't load the linked estimate."); return; }
      const results = [];
      let allCached = true;
      for (const est of estimates) {
        const cacheKey = `permit-sign-scan:v1:${est.id}:${est.updated_date || ""}`;
        let result = null;
        if (!rescan) { try { result = JSON.parse(localStorage.getItem(cacheKey) || "null"); } catch { result = null; } }
        if (!result) {
          allCached = false;
          const lines = (Array.isArray(est.line_items) ? est.line_items : [])
            .filter(li => li?.include_in_customer !== false)
            .map(li => ({
              name: stripHtml(li.client_product_name || li.builder_name || li.project_name || "Line item"),
              category: li.product_category || "",
              quantity: li.customer_quantity ?? 1,
              description: stripHtml(li.customer_description || li.product_notes || ""),
            }));
          let ai;
          try {
            ai = await base44.integrations.Core.InvokeLLM({
              model: "gemini_3_8_flash",
              prompt: buildSignScanPrompt({
                estimate_number: est.estimate_number || "",
                project_name: est.project_name || "",
                client_name: est.client_name || "",
                site_address: est.site_address || "",
                lines,
              }),
              response_json_schema: SIGN_SCAN_JSON_SCHEMA,
              add_context_from_internet: false,
            });
          } catch (e) { throw mapAiError(e); }
          result = {
            estimate_number: est.estimate_number || "",
            signs: Array.isArray(ai?.signs) ? ai.signs : [],
            skipped_lines: Array.isArray(ai?.skipped_lines) ? ai.skipped_lines : [],
          };
          try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch {}
        }
        results.push(result);
      }
      const merged = mergeScannedSigns(results.flatMap(r => (r?.signs || [])));
      updateSigns(merged);
      const found = totalUnitCount(merged);
      const skipped = results.flatMap(r => (r?.skipped_lines || []).map(String));
      const names = results.map(r => r?.estimate_number).filter(Boolean).join(", ") || "the estimate";
      setScanInfo({
        text: `Found ${found} sign${found === 1 ? "" : "s"} on ${names} · ${skipped.length} line${skipped.length === 1 ? "" : "s"} skipped`,
        skipped,
        cached: allCached,
      });
    } catch (e) {
      setPlanError(e?.message || "Couldn't scan the estimate — you can still enter signs by hand.");
    } finally {
      setScanning(false);
    }
  };

  // Plan step edits — planSteps is the editable copy; any change unsaves the plan.
  const editStep = (i, patch) => {
    setPlanSteps(prev => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setPlanSaved(false);
  };
  const remapDependencies = (steps, indexMap) => steps.map(s => ({
    ...s,
    dependencies: Array.isArray(s.dependencies)
      ? s.dependencies.map(d => indexMap.get(Math.floor(Number(d)))).filter(v => v != null)
      : [],
  }));
  const moveStep = (i, dir) => {
    setPlanSteps(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const indexMap = new Map(prev.map((_, k) => [k, k === i ? j : k === j ? i : k]));
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return remapDependencies(next, indexMap);
    });
    setPlanSaved(false);
  };
  const deleteStep = (i) => {
    setPlanSteps(prev => {
      const indexMap = new Map();
      prev.forEach((_, k) => { if (k < i) indexMap.set(k, k); else if (k > i) indexMap.set(k, k - 1); });
      return remapDependencies(prev.filter((_, k) => k !== i), indexMap);
    });
    setPlanSaved(false);
  };
  const addStep = () => {
    setPlanSteps(prev => [...prev, {
      office: chosenOffices[0]?.name || "",
      office_type: "",
      permit_type: "",
      action: "",
      required_documents: [],
      signs: [],
      target_days_from_start: null,
      inspection_needed: false,
      citations: [],
      basis: "staff_confirmation_needed",
      gap_reason: "Added by staff — confirm the details.",
    }]);
    setPlanSaved(false);
  };
  const toggleExpandedStep = (i) => setExpandedSteps(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const buildPlan = async (skipCheck = false) => {
    if (planning) return;
    if (!skipCheck) {
      const warnings = preBuildWarnings({ signs: planForm.signs, offices: chosenOffices });
      if (warnings.length) { setPreBuild(warnings); return; }
    }
    setPreBuild([]);
    setPlanning(true); setPlanError(""); setPlan(null); setPlanSaved(false);
    try {
      const jurisdiction = locality ? {
        jurisdiction_id: locality.jurisdiction_profile_id || "",
        jurisdiction_name: locality.name || "",
        state: locality.state || "",
        locality_id: locality.id, locality_name: locality.name || "",
      } : null;
      const officeRecords = Array.isArray(locality?.offices) ? locality.offices : [];
      const options = {
        offices: chosenOffices.map(o => {
          const rec = officeRecords.find(r => String(r?.id || "") === String(o.officeId || ""))
            || officeRecords.find(r => r?.name === o.name)
            || {};
          return {
            name: o.name,
            roles: o.roles,
            verified: o.verified,
            phone: rec.contact_phone || "",
            email: rec.contact_email || "",
            website: rec.contact_website || "",
            submission_url: rec.submission_url || rec.online_portal_url || "",
          };
        }),
        signs: planForm.signs || [],
        profileId: locality?.jurisdiction_profile_id || "",
        profile: loadedPlanProfile,
        installDate,
        county: locality?.county_name || "",
      };
      const input = { ...planForm, ...legacyInputsFromSigns(planForm.signs) };
      const draft = await runDesignerPipeline(input, jurisdiction, sessionToken || "", options);
      setPlan(draft);
      setPlanSteps(Array.isArray(draft.steps) ? draft.steps.map(s => ({ ...s })) : []);
      setExpandedSteps(new Set());
    } catch (e) {
      setPlanError(e?.message || "Couldn't build the plan — you can skip this step and still create the setup.");
    } finally {
      setPlanning(false);
    }
  };

  const cleanedPlan = () => plan
    ? {
        ...plan,
        steps: planSteps.map(s => ({
          ...s,
          signs: Array.isArray(s.signs)
            ? s.signs.filter(n => Number.isInteger(n) && n >= 1 && n <= signUnitCount)
            : [],
        })),
      }
    : null;

  const savePlan = async () => {
    if (!plan || planSaved) return;
    try {
      await saveWorkflowDraft(cleanedPlan(), planForm,
        `${locality?.name || "Permit"} — ${wo.client_name || "job"}`, "");
      setPlanSaved(true);
    } catch (e) {
      setPlanError(e?.message || "Plan generated but couldn't be saved.");
    }
  };

  const localityChanged = isEdit && localityId && localityId !== appliedLocalityId;

  const finish = async () => {
    if (!locality || creating) return;
    setCreating(true);
    try {
      if (pickedCandidate?.name && normalizePlaceName(locality.name) === normalizePlaceName(pickedCandidate.name)) {
        mintResolutionRule({
          address,
          resolution,
          pickedName: pickedCandidate.name,
          pickedType: pickedCandidate.type,
          pickedCounty: pickedCandidate.county,
          forCity: rememberForCity,
        });
      }
      if (plan && !plan.jurisdiction_unresolved && !planSaved) {
        await saveWorkflowDraft(cleanedPlan(), planForm,
          `${locality.name || "Permit"} — ${wo.client_name || "job"}`, "").catch(() => {});
      }
      if (localityChanged) {
        await onRemoveLocality?.(appliedLocalityId);
        const apply = applyReady ? onApply : onPendingApply;
        await (apply || onApply)?.(locality.id, {
          excludeElectrical, locality,
          skip_office_keys: [...deselectedOffices],
        });
      } else if (isEdit) {
        if (toRemove.length) await onDeleteLines?.(toRemove.map(line => line.id));
        if (toAdd.length) {
          const addKeys = new Set(toAdd.map(office => office.key));
          await onApply?.(locality.id, {
            excludeElectrical,
            locality,
            add_missing_only: true,
            skip_office_keys: officePreview.filter(office => !addKeys.has(office.key)).map(office => office.key),
          });
        }
      } else {
        const apply = applyReady ? onApply : onPendingApply;
        await (apply || onApply)?.(locality.id, {
          excludeElectrical, locality,
          skip_office_keys: [...deselectedOffices],
        });
      }
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
      <DialogContent aria-describedby={undefined} className="clay-card border-none max-w-2xl max-h-[88vh] overflow-y-auto">
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
            <div className="relative">
              <Label className="text-sm">Job site address</Label>
              <Input value={address} onChange={e => { typedRef.current = true; setAddress(e.target.value); }}
                onBlur={() => setTimeout(() => setSuggestions([]), 150)}
                placeholder="123 Main St, Cincinnati, OH" className="h-9 text-sm mt-1"
                onKeyDown={e => { if (e.key === "Escape") setSuggestions([]); if (e.key === "Enter" && canNext) { typedRef.current = false; setSuggestions([]); runResolve(); } }} />
              {suggestions.some(x => suggestionText(x)) && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg divide-y text-sm">
                  {suggestions.filter(x => suggestionText(x)).map((s, i) => (
                    <button key={i} type="button"
                      className="w-full text-left px-3 py-1.5 hover:bg-purple-50 text-xs"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { const picked = suggestionText(s); typedRef.current = false; setAddress(picked); setSuggestions([]); runResolve(picked); }}>
                      {suggestionText(s)}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-500 mt-1">
                {addressSource === "estimate"
                  ? `Prefilled from the install site on ${sourceEstimate ? `estimate ${sourceEstimate}` : "the estimate"} — fix it here if it differs.`
                  : addressSource === "work_order"
                    ? "Prefilled from the work order — fix it here if the install address differs."
                    : "No install address on the work order or its estimate — enter the job site."}
              </p>
            </div>
            {recent.length > 0 && !suggestions.length && (
              <div className="flex flex-wrap gap-1.5">
                {recent.map(r => (
                  <button key={r} type="button" onClick={() => { typedRef.current = false; setAddress(r); runResolve(r); }}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[10px] text-gray-600 hover:border-purple-300 hover:bg-purple-50 truncate max-w-[220px]">
                    {r}
                  </button>
                ))}
              </div>
            )}
            {resolveError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {resolveError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              {isEdit && <Button variant="outline" size="sm" onClick={() => goTo(1)}>Skip — keep current office</Button>}
              <Button size="sm" onClick={() => runResolve()} disabled={!canNext || resolving}
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
            {resolution && candidates.length === 0 && (
              <div className={`rounded-lg border px-3 py-2 text-xs ${applyReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                {applyReady
                  ? <>Resolved: <strong>{resolution?.suggested_locality?.name || locality?.name}</strong> — {verifiedCount} verified office{verifiedCount === 1 ? "" : "s"} on file.</>
                  : locality
                    ? <>Resolved to <strong>{locality.name}</strong>, but its offices aren't verified yet — the setup will auto-apply when verification finishes.</>
                    : <>Nothing matched automatically — pick the office below.</>}
              </div>
            )}

            {/* Boundary conflict — official maps disagree; never auto-pick */}
            {candidates.length > 0 && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-2">
                <div>
                  <h4 className="font-semibold text-sm text-sky-950">Pick the right place</h4>
                  <p className="text-[11px] text-sky-800 mt-0.5">The map services disagree about this location — select the correct place.</p>
                </div>
                {candidates.map((c, i) => (
                  <div key={i} className="rounded-md border border-sky-200 bg-white p-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{c.name}{c.state ? `, ${c.state}` : ""}</p>
                      <p className="text-[11px] text-gray-500 capitalize">{c.type}{c.type !== "county" && c.county ? ` • in ${c.county}` : ""}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {c.inside_sources?.length ? `Inside: ${c.inside_sources.join(" + ")}` : "Not inside the pin"}
                      </p>
                    </div>
                    <Button type="button" size="sm" variant={pickedCandidate === c ? "default" : "outline"}
                      onClick={() => setPickedCandidate(prev => (prev === c ? null : c))}
                      className="h-7 text-xs border-sky-300 flex-shrink-0">
                      {pickedCandidate === c ? "Picked" : "Use this one"}
                    </Button>
                  </div>
                ))}
                {pickedCandidate && (
                  <label className="flex items-start gap-2 text-[11px] text-sky-900 cursor-pointer pt-1">
                    <input type="checkbox" checked={rememberForCity} onChange={e => setRememberForCity(e.target.checked)} className="mt-0.5 accent-sky-600" />
                    <span>
                      Remember this for every address that says "{String(address).split(",")[1]?.trim() || "this city"}" in this county.
                      <span className="block text-[10px] text-sky-700">Unchecked = just this one address. Only check if every address with that city name really belongs to the picked place.</span>
                    </span>
                  </label>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-sm">Jurisdiction</Label>
              {locality && !localitySearchOpen ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {locality.name}
                      {(duplicateLocalityCounts.get(localityIdentityKey(locality)) || 0) > 1
                        ? ` #${String(locality.id || "").slice(-5)}`
                        : ""}
                    </p>
                    <p className="truncate text-[11px] text-gray-500">
                      {localityTypeLabel(locality) ? `${localityTypeLabel(locality)} · ` : ""}
                      {localityCounty(locality) || "county unknown"}, {locality.state || "state unknown"} · {(locality.offices || []).length} offices · {(locality.offices || []).filter(office => office.authority_verification_status === "staff_verified").length} verified
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 text-xs"
                    onClick={() => setLocalitySearchOpen(true)}>
                    Change
                  </Button>
                </div>
              ) : (
                <Command shouldFilter={false} className="mt-1 rounded-lg border border-gray-200 bg-white">
                  <CommandInput
                    value={localitySearchQuery}
                    onValueChange={setLocalitySearchQuery}
                    placeholder="Search jurisdiction, county, or state…"
                    className="h-9"
                  />
                  <CommandList className="max-h-56">
                    {searchResults.length ? searchResults.map(item => {
                      const key = localityIdentityKey(item);
                      const duplicate = (duplicateLocalityCounts.get(key) || 0) > 1;
                      return (
                        <CommandItem
                          key={item.id}
                          value={`${item.id} ${item.name} ${localityCounty(item)} ${item.state || ""}`}
                          onSelect={() => {
                            setLocalityId(item.id);
                            setLocalitySearchOpen(false);
                            setCandidateMatchNote("");
                          }}
                          className="cursor-pointer items-start py-2"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-gray-900">
                              {item.name}{duplicate ? ` #${String(item.id || "").slice(-5)}` : ""}
                            </span>
                            <span className="block truncate text-[11px] text-gray-500">
                              {localityTypeLabel(item) ? `${localityTypeLabel(item)} · ` : ""}
                              {localityCounty(item) || "county unknown"}, {item.state || "state unknown"} · {(item.offices || []).length} offices · {(item.offices || []).filter(office => office.authority_verification_status === "staff_verified").length} verified
                            </span>
                          </span>
                        </CommandItem>
                      );
                    }) : (
                      <div className="px-3 py-4 text-center text-xs text-gray-500">No jurisdictions match this search.</div>
                    )}
                  </CommandList>
                </Command>
              )}
              {candidateMatchNote && (
                <p className="text-[11px] text-amber-800">{candidateMatchNote}</p>
              )}
            </div>
            {locality && officePreview.length > 0 && (
              <div className="rounded-lg border border-gray-200 divide-y">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 flex items-center justify-between">
                  <span>Permit lines — {chosenOffices.length} of {visibleOffices.length} selected</span>
                  {officePreview.some(o => o.electrical) && (
                    <label className="flex items-center gap-1 normal-case font-medium text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={excludeElectrical} onChange={e => setExcludeElectrical(e.target.checked)} className="accent-purple-600" />
                      Exclude electrical
                    </label>
                  )}
                </div>
                {visibleOffices.filter(o => !o.speculative).map(o => {
                  const on = !deselectedOffices.has(o.key);
                  return (
                    <OfficeSelectionRow key={o.key} office={o} on={on} onToggle={() => setDeselectedOffices(prev => {
                      const next = new Set(prev);
                      if (on) next.add(o.key); else next.delete(o.key);
                      return next;
                    })} />
                  );
                })}
                {visibleOffices.some(o => o.speculative) && (
                  <>
                    <div className="bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-900">
                      Possibly needed — tick only if this job requires it
                    </div>
                    {visibleOffices.filter(o => o.speculative).map(o => {
                      const on = !deselectedOffices.has(o.key);
                      return (
                        <OfficeSelectionRow key={o.key} office={o} on={on} onToggle={() => setDeselectedOffices(prev => {
                          const next = new Set(prev);
                          if (on) next.add(o.key); else next.delete(o.key);
                          return next;
                        })} />
                      );
                    })}
                  </>
                )}
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
            {locality && (planProfile.loading
              ? <p className="text-[10px] text-gray-400">Loading rules…</p>
              : <RulesOnFilePanel jurisdiction={locality.name} limits={planLimits} />)}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">Signs</Label>
                <span className="text-[10px] text-gray-500">{signUnitCount} sign{signUnitCount === 1 ? "" : "s"}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="text-[9px] text-gray-400">uses AI credits</span>
                  <Button type="button" variant="outline" size="sm"
                    className="h-7 gap-1 text-xs"
                    disabled={!estimateIds.length || scanning}
                    title={estimateIds.length ? "Read the linked estimate and prefill the signs below" : "No estimate linked to this work order"}
                    onClick={() => scanEstimateSigns(false)}>
                    {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Scan estimate with AI
                  </Button>
                </span>
              </div>
              {scanInfo && (
                <p className="text-[11px] text-gray-600"
                  title={scanInfo.skipped.length ? `Skipped: ${scanInfo.skipped.join(", ")}` : undefined}>
                  {scanInfo.cached ? "From an earlier scan · " : ""}{scanInfo.text}
                  {scanInfo.cached && <> · <button type="button" className="font-semibold text-purple-700 underline underline-offset-2"
                    onClick={() => scanEstimateSigns(true)}>Rescan</button></>}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs">
                      Sign types <ChevronDown className="w-3 h-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="max-h-72 w-64 overflow-y-auto p-1">
                    {SIGN_TYPES.map(t => {
                      const count = (planForm.signs || []).find(e => e.type === t.key)?.units?.length || 0;
                      return (
                        <div key={t.key} className="flex items-center gap-1 px-2 py-0.5 text-xs">
                          <span className="flex-1 truncate text-gray-700">{t.label}</span>
                          <button type="button" aria-label={`Remove one ${t.label}`}
                            className="flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                            disabled={count === 0}
                            onClick={() => updateSigns(s => setTypeCount(s, t.key, count - 1))}>
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-5 text-center font-semibold text-gray-800">{count}</span>
                          <button type="button" aria-label={`Add one ${t.label}`}
                            className="flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-100"
                            onClick={() => updateSigns(s => setTypeCount(s, t.key, count + 1))}>
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </PopoverContent>
                </Popover>
                {signUnitCount === 0 && (
                  <span className="text-[10px] text-gray-400">No signs yet — scan the estimate or add types.</span>
                )}
              </div>
              {(planForm.signs || []).length > 0 && (
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
                  {planForm.signs.map((entry, entryIdx) => {
                    const typeDef = SIGN_TYPE_MAP[entry.type];
                    const offset = planForm.signs.slice(0, entryIdx).reduce((a, e) => a + (e.units?.length || 0), 0);
                    return (
                      <div key={entry.type} className="rounded-lg border border-gray-200 bg-white">
                        <div className="flex items-center justify-between rounded-t-lg bg-gray-50 px-2 py-1">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{typeDef?.label || entry.type}</span>
                          <span className="text-[10px] text-gray-400">×{entry.units?.length || 0}</span>
                        </div>
                        {(entry.units || []).map((unit, ui) => {
                          const area = unitAreaSqFt(unit);
                          return (
                            <div key={unit.id || ui} className="space-y-1 border-t border-gray-100 px-2 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="w-6 shrink-0 text-[10px] font-bold text-purple-600">#{offset + ui + 1}</span>
                                <Select value={unit.scope || "new"} onValueChange={v => updateUnit(entry.type, ui, { scope: v })}>
                                  <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {SIGN_SCOPES.map(s => <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <Select value={String(unit.faces === 2 ? 2 : 1)} onValueChange={v => updateUnit(entry.type, ui, { faces: Number(v) })}>
                                  <SelectTrigger className="h-7 w-[78px] text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="1" className="text-xs">1 face</SelectItem>
                                    <SelectItem value="2" className="text-xs">2 faces</SelectItem>
                                  </SelectContent>
                                </Select>
                                <button type="button" aria-label="Remove sign"
                                  className="shrink-0 text-gray-300 hover:text-red-500"
                                  onClick={() => removeUnit(entry.type, ui)}>
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 pl-6">
                                <label className="flex items-center gap-1 text-[10px] text-gray-600">
                                  <input type="checkbox" className="accent-purple-600" checked={!!unit.illuminated}
                                    onChange={e => updateUnit(entry.type, ui, { illuminated: e.target.checked })} /> Illuminated
                                </label>
                                <label className="flex items-center gap-1 text-[10px] text-gray-600">
                                  <input type="checkbox" className="accent-purple-600" checked={!!unit.electrical}
                                    onChange={e => updateUnit(entry.type, ui, { electrical: e.target.checked })} /> Electrical
                                </label>
                                <UnitSizeInput label="W" value={unit.width_in} onChange={v => updateUnit(entry.type, ui, { width_in: v })} />
                                <UnitSizeInput label="H" value={unit.height_in} onChange={v => updateUnit(entry.type, ui, { height_in: v })} />
                                {(typeDef?.extras || []).map(f => (
                                  <UnitSizeInput key={f} label={EXTRA_LABELS[f] || f} value={unit[f]}
                                    onChange={v => updateUnit(entry.type, ui, { [f]: v })} />
                                ))}
                                {area != null && <span className="text-[10px] text-gray-500">{area.toFixed(1)} sq ft</span>}
                              </div>
                              {unit.source_line ? (
                                <p className="truncate pl-6 text-[9px] text-gray-400">from "{unit.source_line}"</p>
                              ) : null}
                              {unitRuleFlags(unit, entry.type, planLimits).map((f, fi) => (
                                <p key={fi} className="pl-6 text-[10px] font-medium text-red-600">{f}</p>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {preBuild.length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                {preBuild.map((w, i) => <p key={i} className="text-[11px] text-amber-800">• {w}</p>)}
                <div className="flex gap-2 pt-0.5">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => setPreBuild([])}>Fix first</Button>
                  <Button type="button" size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700"
                    onClick={() => buildPlan(true)}>Build anyway</Button>
                </div>
              </div>
            )}
            {planError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{planError}</div>
            )}
            {plan && (
              <>
                <PlanStepsEditor steps={planSteps}
                  officeNames={chosenOffices.map(o => o.name)}
                  signCount={signUnitCount}
                  expanded={expandedSteps}
                  onToggleExpand={toggleExpandedStep}
                  onEdit={editStep} onMove={moveStep} onDelete={deleteStep} onAdd={addStep}
                  installDate={installDate} />
                {(Array.isArray(plan.gaps) ? plan.gaps : []).length > 0 && (
                  <div className="space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    {(plan.gaps || []).map((g, gi) => (
                      <p key={gi} className="text-[11px] text-amber-800">
                        • {g.description || g.reason || "Open question"}{g.description && g.reason ? ` — ${g.reason}` : ""}
                      </p>
                    ))}
                  </div>
                )}
                {plan.summary && <p className="text-[11px] text-purple-600">{plan.summary}</p>}
                {planSaved && <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Saved to workflow drafts</p>}
              </>
            )}
            {!plan && drafts.length > 0 && (
              <div className="rounded-lg border border-gray-200 divide-y">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Saved plans for {locality?.name} — reuse instead of regenerating
                </div>
                {drafts.slice(0, 4).map(d => (
                  <button key={d.id} type="button"
                    onClick={() => {
                      const pi = d.project_inputs || {};
                      const signs = ensureUnitIds(Array.isArray(pi.signs) ? pi.signs
                        : Array.isArray(d.snapshot?.input_summary?.signs) ? d.snapshot.input_summary.signs : []);
                      setPlan(d.snapshot);
                      setPlanSteps(Array.isArray(d.snapshot?.steps) ? d.snapshot.steps.map(s => ({ ...s })) : []);
                      setPlanForm(prev => ({ ...prev, ...pi, signs, ...legacyInputsFromSigns(signs) }));
                      setExpandedSteps(new Set());
                      setPlanSaved(true);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-purple-50 text-xs flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                    <span className="font-medium text-gray-800 truncate">{d.title}</span>
                    <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{d.snapshot?.steps?.length || 0} steps</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center">
              <Button variant="ghost" size="sm" onClick={() => goTo(1)} className="gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => goTo(3)}>Skip</Button>
                {plan && !planSaved && (
                  <Button variant="outline" size="sm" onClick={savePlan} className="gap-1">Save plan</Button>
                )}
                <Button size="sm" onClick={() => buildPlan()} disabled={planning}
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
                {existingLocalityGroups.map(group => (
                  <div key={group.key}>
                    {existingLocalityGroups.length > 1 && (
                      <div className="bg-gray-50 px-3 py-1 text-[10px] font-semibold text-gray-600">{group.name}</div>
                    )}
                    {existingLines
                      .filter(line => String(line.locality_id || line.locality_name || "unknown") === group.key)
                      .map(li => (
                        <div key={li.id} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                          <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${li.status === "complete" ? "text-emerald-500" : "text-gray-300"}`} />
                          <span className="font-medium text-gray-800">{li.row_name || li.office_type || "Line"}</span>
                          <span className="text-[10px] text-gray-500">{li.locality_name}</span>
                          <span className="ml-auto text-[10px] text-gray-400">{li.status}</span>
                        </div>
                      ))}
                  </div>
                ))}
                {localityChanged && (
                  <div className="px-3 py-2 text-xs text-amber-800 bg-amber-50">
                    Switching to <strong>{locality?.name}</strong> will remove the lines above and create {chosenOffices.length || 1} new one{(chosenOffices.length || 1) === 1 ? "" : "s"}.
                  </div>
                )}
                {existingLocalityGroups.length > 1 && (
                  <div className="px-3 py-2 text-xs text-amber-900 bg-amber-50">
                    This job has lines from {existingLocalityGroups.length} jurisdictions: {existingLocalityGroups.map(group => group.name).join(", ")}. Editing applies to {firstExistingLocalityName}.
                  </div>
                )}
                {!localityChanged && (
                  <div className="space-y-1.5 px-3 py-2 text-xs">
                    <div>
                      <span className="font-semibold text-gray-700">Will add: </span>
                      <span className="text-gray-600">{toAdd.length ? toAdd.map(office => office.name).join(", ") : "None"}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="font-semibold text-gray-700">Will remove: </span>
                      {toRemove.length ? toRemove.map(line => (
                        <div key={line.id} className="pl-1 text-gray-600">
                          {line.row_name || line.office_type || "Permit line"}
                          {hasRemovalProgress(line) && (
                            <span className="ml-1 font-semibold text-red-700">has recorded progress — its data will be deleted</span>
                          )}
                        </div>
                      )) : <span className="text-gray-600">None</span>}
                    </div>
                    {toRemove.length > 0 && (
                      <label className="mt-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 font-medium text-red-800">
                        <input
                          type="checkbox"
                          checked={confirmRemoveLines}
                          onChange={event => setConfirmRemoveLines(event.target.checked)}
                          className="mt-0.5 accent-red-600"
                        />
                        <span>I understand {toRemove.length} permit line{toRemove.length === 1 ? "" : "s"} will be deleted</span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 divide-y text-xs">
                <div className="px-3 py-2 flex justify-between">
                  <span className="text-gray-500">Site</span>
                  <span className="font-medium text-gray-800 text-right">{address || "—"}</span>
                </div>
                <div className="px-3 py-2 flex justify-between">
                  <span className="text-gray-500">Jurisdiction</span>
                  <span className="font-medium text-gray-800">{locality?.name}{locality?.state ? `, ${locality.state}` : ""}</span>
                </div>
                <div className="px-3 py-2 flex justify-between">
                  <span className="text-gray-500">Permit lines</span>
                  <span className="font-medium text-gray-800">{visibleOffices.length || 1}</span>
                </div>
                <div className="px-3 py-2 flex justify-between">
                  <span className="text-gray-500">AI plan</span>
                  <span className="font-medium text-gray-800">{plan ? `${planSteps.length || 0} steps${planSaved ? " · saved" : ""}` : "Skipped"}</span>
                </div>
              </div>
            )}

            {!applyReady && locality && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {isEdit && !localityChanged
                  ? <>Offices for {locality.name} aren't fully verified — line changes apply now, and added lines carry a review note.</>
                  : <>Offices for {locality.name} aren't verified — the setup applies automatically when verification finishes.</>}
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
                    {!localityChanged && (
                      <Button size="sm" onClick={finish}
                        disabled={!locality || creating || (toRemove.length > 0 && !confirmRemoveLines)}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                        {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        {done ? "Saved!" : "Save setup"}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button size="sm" onClick={finish} disabled={!locality || creating}
                    className={`gap-1.5 ${applyReady ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-500 hover:bg-amber-600"}`}>
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {done ? "Created!" : applyReady ? `Create ${visibleOffices.length || 1} permit line${(visibleOffices.length || 1) === 1 ? "" : "s"}` : "Queue setup"}
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