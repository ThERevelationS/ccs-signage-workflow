import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Loader2, MapPin, Search, Sparkles,
  AlertTriangle, Pencil, ListChecks, FileText,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { staffEntities } from "@/components/staff/staffEntities";
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

const PlanSteps = ({ steps, dropped, onToggle }) => (
  <div className="rounded-lg border border-purple-200 bg-purple-50/50 divide-y divide-purple-100 max-h-56 overflow-y-auto">
    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-purple-700">
      {(steps?.length || 0) - (dropped?.size || 0)} of {steps?.length || 0} steps kept
    </div>
    {(steps || []).map((s, i) => {
      const off = dropped?.has(i);
      return (
        <div key={i} className={`px-3 py-1.5 text-xs flex items-center gap-2 ${off ? "opacity-40" : ""}`}>
          <span className="text-purple-400 font-mono w-4 flex-shrink-0">{i + 1}</span>
          <span className={`font-medium truncate ${off ? "line-through text-gray-400" : "text-gray-800"}`}>{s.title || s.action || `Step ${i + 1}`}</span>
          <span className={`ml-auto flex-shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold ${
            s.basis === "approved_rule" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : s.basis === "pending_review" ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-gray-200 bg-gray-50 text-gray-500"}`}>
            {s.basis === "approved_rule" ? "verified" : s.basis === "pending_review" ? "pending" : "confirm"}
          </span>
          {onToggle && (
            <button type="button" onClick={() => onToggle(i)}
              className="flex-shrink-0 text-[9px] font-semibold text-gray-400 hover:text-red-600 underline underline-offset-2">
              {off ? "restore" : "drop"}
            </button>
          )}
        </div>
      );
    })}
  </div>
);

export default function PermitSetupWizard({
  isOpen, onClose, workOrder, existingLines = [], localities = [],
  onApply, onPendingApply, onRemoveLocality, onDeleteLines, initialStep,
}) {
  const { sessionToken } = useAuth() || {};
  const wo = workOrder || {};
  const isEdit = existingLines.length > 0;
  const appliedLocalityId = existingLines.find(li => li.locality_id)?.locality_id || "";
  const startStep = Number.isInteger(initialStep) ? initialStep : isEdit ? 3 : 0;
  const siteAddress = [wo.install_location, wo.address_line_2, wo.township_city, wo.county, wo.state]
    .filter(v => String(v || "").trim()).join(", ");

  const [step, setStep] = useState(startStep);
  const [maxStep, setMaxStep] = useState(Math.max(startStep, isEdit ? 3 : 0));
  const [address, setAddress] = useState(siteAddress);
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
  const [droppedSteps, setDroppedSteps] = useState(new Set());
  const [suggestions, setSuggestions] = useState([]);
  const [recent, setRecent] = useState(() => loadRecent());
  const [planForm, setPlanForm] = useState(() => defaultPlanForm(wo, siteAddress));
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState("");
  const [planSaved, setPlanSaved] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const searchSeq = useRef(0);
  const suggestionReq = useRef(0);
  const initializedAppliedLocalityRef = useRef(false);
  const editPrefillLocalityRef = useRef("");

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

  // Address autocomplete — same places_autocomplete the picker uses.
  useEffect(() => {
    const q = address.trim();
    if (!sessionToken || q.length < 4 || resolving) { setSuggestions([]); return; }
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
          ({ data } = await base44.functions.invoke("resolvePermittingAddress", { address: normalizeAddress(q), session_token: sessionToken }));
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

  const buildPlan = async () => {
    if (planning) return;
    setPlanning(true); setPlanError(""); setPlan(null); setPlanSaved(false); setDroppedSteps(new Set());
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

  const cleanedPlan = () => plan
    ? { ...plan, steps: (plan.steps || []).filter((_, i) => !droppedSteps.has(i)) }
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
            <div className="relative">
              <Label className="text-sm">Job site address</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)}
                placeholder="123 Main St, Cincinnati, OH" className="h-9 text-sm mt-1"
                onKeyDown={e => { if (e.key === "Enter" && canNext) runResolve(); }} />
              {suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg divide-y text-sm">
                  {suggestions.map((s, i) => (
                    <button key={i} type="button"
                      className="w-full text-left px-3 py-1.5 hover:bg-purple-50 text-xs"
                      onClick={() => { const picked = typeof s === "string" ? s : s.description || s.label || ""; setAddress(picked); setSuggestions([]); runResolve(picked); }}>
                      {typeof s === "string" ? s : s.description || s.label}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-500 mt-1">Prefilled from the work order — fix it here if the install address differs.</p>
            </div>
            {recent.length > 0 && !suggestions.length && (
              <div className="flex flex-wrap gap-1.5">
                {recent.map(r => (
                  <button key={r} type="button" onClick={() => { setAddress(r); runResolve(r); }}
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
              <>
                <PlanSteps steps={plan.steps} dropped={droppedSteps}
                  onToggle={(i) => setDroppedSteps(prev => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    return next;
                  })} />
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
                    onClick={() => { setPlan(d.snapshot); setPlanForm(prev => ({ ...prev, ...(d.project_inputs || {}) })); setDroppedSteps(new Set()); setPlanSaved(true); }}
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
                  <span className="font-medium text-gray-800">{plan ? `${plan.steps?.length || 0} steps${planSaved ? " · saved" : ""}` : "Skipped"}</span>
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