import AddressSearchSummary from './AddressSearchSummary';
import {runPickerDraftAction,requireReviewedRepositoryProfile} from './pickerDraftAction.mjs';
import SavedAddressResearch from './SavedAddressResearch';
import AutomaticAddressScanResults from './AutomaticAddressScanResults';
import SelectorScanActions from './SelectorScanActions';
import ResearchProgressBar from './ResearchProgressBar';
import {useResearchProgress} from './ResearchProgressContext';
import ElectricalAuthorityCoverage from './ElectricalAuthorityCoverage';
import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { staffEntities } from "@/components/staff/staffEntities";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, MapPin, AlertTriangle, CheckCircle2, Zap, ZapOff, X, Save } from "lucide-react";
import GoogleMapView from "./GoogleMapView";
import { useAuth } from "@/components/auth/EmailGate";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { createPermitLocalityIfAbsent } from "./permitLocalityPersistence";
import {
  findRepositoryJurisdictionMatches,
  hasDuplicateRepositoryIdentity,
  jurisdictionToDraftPermitLocality,
  normalizePermitJurisdictionName,
  normalizeState,
} from "./jurisdictionPermitBridge";
import { assessJurisdictionTrust } from "./jurisdictionTrust";
import { summarizeMatchedLocalityAuthority } from "@/shared/permittingAddressLocality.js";

const AUTHORITY_ROLE_LABELS = {
  sign_permit: "Sign permit",
  zoning: "Zoning",
  building: "Building",
  electrical: "Electrical (legacy broad role)",
  electrical_permit: "Electrical permit issuer",
  electrical_inspection: "Electrical inspection provider",
  right_of_way: "ROW / public works",
  historic_review: "Historic review",
  planning: "Planning",
  transportation: "Transportation",
  other: "Other",
};

function verifiedAuthoritySummary(locality) {
  const review = summarizeMatchedLocalityAuthority(locality);
  return {
    ...review,
    officeCount: review.verified_office_count,
    labels: review.verified_roles.map(role => AUTHORITY_ROLE_LABELS[role] || role),
    reviewLabels: review.roles_needing_review.map(role => AUTHORITY_ROLE_LABELS[role] || role),
  };
}

const normalizeAddress=(raw)=>{let a=String(raw||"").replace(/s+/g," ").trim();a=a.replace(/(unit|suite|ste|apt|apartment|#)s*[A-Za-z0-9-]+/ig,"");a=a.replace(/,s*(USA|United States|US).?$/i,"");a=a.replace(/([0-9]{5})-[0-9]{4}/g,"$1");a=a.replace(/[ 	]+,/g,",").replace(/,(?=S)/g,", ").replace(/s+/g," ").trim().replace(/^,+|,+$/g,"");return a||String(raw||"").trim();};
const RECENT_ADDR_KEY="permitting_recent_addresses";
const loadRecentAddresses=()=>{try{return JSON.parse(localStorage.getItem(RECENT_ADDR_KEY)||"[]");}catch{return[];}};
const rememberAddress=(addr)=>{const a=String(addr||"").trim();if(!a)return;try{const list=loadRecentAddresses().filter(x=>x!==a);list.unshift(a);localStorage.setItem(RECENT_ADDR_KEY,JSON.stringify(list.slice(0,5)));}catch{}};
export default function LocalityPickerDialog(props) {
  const {sessionToken,currentUser}=useAuth();
  if(!sessionToken||!(currentUser?.id||currentUser?.email))return null;
  const scope=JSON.stringify([currentUser.id || currentUser.email,currentUser.role,sessionToken]);
  return <LocalityPickerSession key={scope} {...props} />;
}
function LocalityPickerSession({
  isOpen,
  onClose,
  localities,
  onApply,  // (localityId, { excludeElectrical }) => void
  initialAddress = "",
}) {
  const { sessionToken,currentUser } = useAuth();
  const {runAction}=useResearchProgress();
  const searchVersion=useRef(0);
  const pendingSearch=useRef(null),pendingDraft=useRef(null);
  const openRef=useRef(isOpen);openRef.current=isOpen;
  useEffect(()=>()=>{openRef.current=false;searchVersion.current++;},[]);
  const [address, setAddress] = useState("");
  const [searching, setSearching] = useState(false);
  const [recentAddresses, setRecentAddresses] = useState(() => loadRecentAddresses());
  const [slowSearch, setSlowSearch] = useState(false);
  const [bigText, setBigText] = useState(() => { try { return localStorage.getItem("permitting_big_text") === "1"; } catch { return false; } });
  const [result, setResult] = useState(null); // address location and reference research
  const [error, setError] = useState("");
  const [excludeElectrical, setExcludeElectrical] = useState(false);
  const [selectedLocalityId, setSelectedLocalityId] = useState("");
  const [repositoryJurisdictions, setRepositoryJurisdictions] = useState([]);
  const [repositoryLoading, setRepositoryLoading] = useState(false);
  const [repositoryError, setRepositoryError] = useState("");
  const [draftCandidate, setDraftCandidate] = useState(null);
  const [repositoryDraftId,setRepositoryDraftId]=useState("");
  const [draftCreateError, setDraftCreateError] = useState("");
  const [creatingDraft, setCreatingDraft] = useState(false);
  const inputRef = useRef(null);

  const autoSearchRef = useRef(false);
  useEffect(() => {
    searchVersion.current++;pendingSearch.current=null;
    if (isOpen) {
      const preset = String(initialAddress || "").trim();
      setAddress(preset);
      setSearching(false);
      setResult(null);
      setError("");
      setSelectedLocalityId("");
      setExcludeElectrical(false);
      setDraftCandidate(null);setRepositoryDraftId("");
      setDraftCreateError("");
      autoSearchRef.current = Boolean(preset);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);
  // When the dialog opens with the job/client address already known, run the
  // jurisdiction lookup immediately instead of making the user retype it.
  useEffect(() => {
    if (!isOpen || !autoSearchRef.current) return;
    if (!String(address || "").trim()) return;
    autoSearchRef.current = false;
    runSearch();
  }, [isOpen, address]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setRepositoryLoading(true);
    setRepositoryError("");

    loadAllEntityRows({
      entity: staffEntities.JurisdictionProfile,
      sort: "name",
      label: "Permitting locality picker repository",
    }).then((rows) => {
      if (!cancelled) setRepositoryJurisdictions(Array.isArray(rows) ? rows : []);
    }).catch((e) => {
      console.error("Could not load saved jurisdictions in locality picker:", e);
      if (!cancelled) setRepositoryError("We could not load the saved jurisdictions list. You can still pick one that is already set up.");
    }).finally(() => {
      if (!cancelled) setRepositoryLoading(false);
    });

    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (!searching) { setSlowSearch(false); return; }
    const t = setTimeout(() => setSlowSearch(true), 90000);
    return () => clearTimeout(t);
  }, [searching]);

  const runSearch = async () => {
    if (!address.trim()) return;
    if(searching||pendingSearch.current!==null||!openRef.current)return;
    const version=++searchVersion.current;pendingSearch.current=version;
    setSelectedLocalityId("");
    setSearching(true);
    // Soft warn on addresses that look incomplete — no city or ZIP signal —
    // but still let the search run: a street+state query can still succeed.
    const norm=normalizeAddress(address);
    const hasSignal=/\d{5}/.test(norm)||(norm.includes(",")&&/[,]\s*[A-Za-z]{2}(\s|$)/.test(norm));
    if(!hasSignal&&!/,\s*\S+/.test(norm))setError("That address is missing a city, state, or ZIP — adding one usually finds it faster.");
    else setError("");
    setResult(null);
    try {
      const invoke=runAction;
      const lookup=payload=>invoke('resolvePermittingAddress',payload,`Looking up ${address.trim()}`);
      let { data };
      try { ({ data } = await lookup({ address: normalizeAddress(address), session_token: sessionToken })); }
      catch(firstErr){ if(/status code 5dd/.test(String(firstErr?.message||""))){ await new Promise(r=>setTimeout(r,1500)); ({ data } = await lookup({ address: normalizeAddress(address), session_token: sessionToken })); } else throw firstErr; }
      // The worker cannot reach external geocoders reliably; when its lookups
      // all fail, geocode from the browser and resubmit the coordinates.
      if (data?.success !== false && !data?.geocode && data?.geocoding_service?.issue) {
        try {
          const q = encodeURIComponent(normalizeAddress(address));
          const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&addressdetails=1&q=${q}`);
          const hit = (await r.json())?.[0];
          const st = hit?.address?.state || hit?.address?.state_district || '';
          if (hit?.lat && hit?.lon && /ohio|kentucky/i.test(st)) {
            const retry = await invoke('resolvePermittingAddress', {
              address: normalizeAddress(address),
              session_token: sessionToken,
              census_hint: {
                lat: Number(hit.lat), lng: Number(hit.lon),
                matched_address: hit.display_name,
                address_parts: { state: st, city: hit.address?.city || hit.address?.town || hit.address?.village || '', zip: hit.address?.postcode || '' },
              },
            },`Looking up ${address.trim()}`);
            if (retry?.data?.success !== false) data = retry.data;
          }
        } catch { /* browser geocode is best-effort */ }
      }
      if(version!==searchVersion.current||!openRef.current)return;
      if (data?.success === false) {
        setError(data.error || "Search failed");
      } else {
        setResult(data);
        setError("");
        if(data?.suggested_locality||data?.geocode){rememberAddress(address.trim());setRecentAddresses(loadRecentAddresses());}
        if (data?.suggested_locality?.id) {
          setSelectedLocalityId(data.suggested_locality.id);
        }
      }
    } catch (e) {
      if(version!==searchVersion.current||!openRef.current)return;
      setError(e.message || "Search failed");
    }
    if(pendingSearch.current===version)pendingSearch.current=null;
    if(version===searchVersion.current&&openRef.current)setSearching(false);
  };

  const selectedLocality = localities.find(locality => locality.id === selectedLocalityId);
  const selectedAuthority = verifiedAuthoritySummary(selectedLocality);
  const addressAuthority = result?.authority_review;
  const addressAuthorityLabels = (addressAuthority?.verified_roles || []).map(role => AUTHORITY_ROLE_LABELS[role] || role);
  const addressRolesNeedingReview = (addressAuthority?.roles_needing_review || []).map(role => AUTHORITY_ROLE_LABELS[role] || role);

  const addressCanApply=address.trim()?Boolean(result?.apply_allowed===true&&result?.location_resolution?.status==='location_verified'&&selectedLocalityId===result?.suggested_locality?.id):currentUser?.role==='admin';
  const handleApply = () => {
    if (!openRef.current || !selectedLocalityId || searching || !addressCanApply) return;
    // Unverified picks get one deliberate pause — address-flow applies are
    // already gated on a verified review; repository picks may not be.
    if (!address.trim() && selectedAuthority.officeCount === 0) {
      const name = selectedLocality?.name || "this office";
      if (!window.confirm(`${name} hasn't been checked by our team yet — the permit offices and contact info may be incomplete. Use it anyway?`)) return;
    }
    onApply(selectedLocalityId, { excludeElectrical });
    onClose();
  };

  const repositoryMatches = result
    ? findRepositoryJurisdictionMatches(repositoryJurisdictions, result)
    : [];

  // When a boundary-verified address resolves to a jurisdiction that has no
  // tracker locality yet, an admin may still create a draft — but only for the
  // profile matching the detected name/type/county, never a same-name sibling.
  const detectedTarget = result?.location_resolution?.target;
  const isDetectedCandidate = (j) => {
    if (!j || !detectedTarget || result?.location_resolution?.status !== 'location_verified' || result?.suggested_locality) return false;
    const typeMap = { municipality: ['city', 'village', 'municipality'], township: ['township'], county: ['county'] };
    const countyOf = (v) => String(v || '').toLowerCase().replace(/\s*county$/u, '').trim();
    return (typeMap[detectedTarget.type] || [detectedTarget.type]).includes(String(j.type || '').toLowerCase())
      && normalizePermitJurisdictionName(j.name) === normalizePermitJurisdictionName(detectedTarget.name)
      && normalizeState(j.state) === normalizeState(detectedTarget.state)
      && (!detectedTarget.county || !j.parent_county?.name || countyOf(j.parent_county.name) === countyOf(detectedTarget.county));
  };

  const requestDraftFromRepository = (jurisdiction) => {
    if(currentUser?.role!=="admin"||(address.trim()&&!isDetectedCandidate(jurisdiction))||creatingDraft||pendingDraft.current||!openRef.current)return;
    setDraftCreateError("");
    if (hasDuplicateRepositoryIdentity(repositoryJurisdictions, jurisdiction)) {
      setDraftCreateError(`Multiple repository profiles match ${jurisdiction.name}, ${jurisdiction.state || ""}. Someone on the team needs to clean up the matching entries first.`);
      return;
    }
    setDraftCandidate(jurisdiction);
  };

  const confirmDraftFromRepository = async () => {
    if (currentUser?.role!=="admin" || !openRef.current || !draftCandidate || creatingDraft || pendingDraft.current || (address.trim() && !isDetectedCandidate(draftCandidate))) return;
    const draftVersion=searchVersion.current;
    setCreatingDraft(true);
    setDraftCreateError("");

    try {
      await runPickerDraftAction({pending:pendingDraft,isCurrent:()=>openRef.current&&draftVersion===searchVersion.current,
      prepare:async()=>requireReviewedRepositoryProfile({
        reviewed:draftCandidate,
        rows:await loadAllEntityRows({entity:staffEntities.JurisdictionProfile,sort:"name",label:"Repository draft source recheck",cacheTtlMs:15000}),
        hasDuplicate:hasDuplicateRepositoryIdentity,
        toDraft:jurisdictionToDraftPermitLocality,
      }),create:payload=>createPermitLocalityIfAbsent({
        entity: staffEntities.PermitLocality,
        data: payload,
        readCurrentLocalities: () => loadAllEntityRows({
          entity: staffEntities.PermitLocality,
          sort: "name",
          label: "Permit locality repository bridge identity",
          cacheTtlMs: 15000,
        }),
        label: `Permit locality draft ${payload.name}`,
      }),apply:locality=>{
      setSelectedLocalityId(locality.id);
      setDraftCandidate(null);
      onApply(locality.id, { excludeElectrical, locality });
      onClose();
      }});
    } catch (e) {
      if(!openRef.current||draftVersion!==searchVersion.current)return;
      console.error("Could not create Permit locality draft from repository:", e);
      setDraftCreateError(e?.message || "The draft locality could not be created safely. Nothing was applied to this Work Order.");
    } finally {
      if(openRef.current&&draftVersion===searchVersion.current)setCreatingDraft(false);
    }
  };

  const mapPosition = Number.isFinite(result?.geocode?.lat)&&Number.isFinite(result?.geocode?.lon) ? { lat: result.geocode.lat, lng: result.geocode.lon } : null;
  const markerTitle = result?.geocode?.display_name || address.trim();

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={"flex h-[95dvh] w-[96vw] max-w-none flex-col gap-0 overflow-hidden border-none bg-slate-50 p-0 "+(bigText?"text-[115%] [&_button]:min-h-12 [&_input]:text-base [&_p]:text-sm [&_span]:text-sm":"")}>
        <DialogHeader className="border-b bg-white px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-100"><MapPin className="h-4 w-4 text-violet-600" /></span>
            Which office issues permits here?
            <button type="button" onClick={()=>{const v=!bigText;setBigText(v);try{localStorage.setItem("permitting_big_text",v?"1":"0");}catch{}}} className="ml-auto text-[10px] font-semibold text-violet-700 border border-violet-200 rounded-full px-2.5 py-1 hover:bg-violet-50" title="Make the text bigger">{bigText?"A−":"A+"}</button>
          </DialogTitle>
        </DialogHeader>

        {/* Address search bar */}
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-0 w-full sm:min-w-[280px]">
            <Label htmlFor="jurisdiction-job-address" className="text-xs">Job address</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                id="jurisdiction-job-address"
                ref={inputRef}
                value={address}
                onChange={(e) => {searchVersion.current++;pendingSearch.current=null;setAddress(e.target.value);setResult(null);setSelectedLocalityId('');setSearching(false);}}
                placeholder="e.g. 4900 Parkway Dr, Mason, OH 45040"
                className="min-h-11 pl-8 text-base"
                onKeyDown={(e) => e.key === 'Enter' && !searching && runSearch()}
                onPaste={(e) => {
                  // Paste-and-go: if the pasted text looks like a complete
                  // street address, search immediately — zero extra clicks.
                  const text = String(e.clipboardData?.getData("text") || "").trim();
                  const looksComplete = /\d/.test(text) && /[a-zA-Z]{3,}/.test(text) && (/,/.test(text) || /\d{5}/.test(text));
                  if (looksComplete) {
                    e.preventDefault();
                    searchVersion.current++; pendingSearch.current = null;
                    setAddress(text); setResult(null); setSelectedLocalityId(''); setSearching(false);
                    setTimeout(() => runSearch(), 0);
                  }
                }}
              />
            </div>
          </div>
          {searching ? (
            <Button
              variant="outline"
              onClick={() => { searchVersion.current++; pendingSearch.current = null; setSearching(false); }}
              className="gap-1 min-h-11 w-full sm:w-auto"
            >
              <Loader2 className="w-4 h-4 animate-spin" /> Cancel search
            </Button>
          ) : (
            <Button onClick={runSearch} disabled={!address.trim()} className="bg-purple-600 hover:bg-purple-700 gap-1 min-h-11 w-full sm:w-auto">
              <Search className="w-4 h-4" /> Find my jurisdiction
            </Button>
          )}

          {/* Electrical inspector toggle */}
          <Button
            variant="outline"
            onClick={() => setExcludeElectrical(v => !v)}
            className={`gap-1 min-h-11 w-full sm:w-auto ${excludeElectrical ? 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100' : 'border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
            title={excludeElectrical ? "Electrical Inspectors will be hidden/excluded" : "Electrical Inspectors will be included"}
          >
            {excludeElectrical ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            {excludeElectrical ? "Electrical: OFF" : "Electrical: ON"}
          </Button>
        </div>

        {slowSearch && searching && (
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-sm text-blue-800">
            This lookup is taking longer than usual — it can hang on slow government sites. You can keep waiting, or cancel and try again.
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            {address.trim() && !searching && (
              <button type="button" onClick={runSearch} className="text-xs font-semibold underline hover:no-underline whitespace-nowrap">
                Try again
              </button>
            )}
          </div>
        )}

        {!address.trim() && !searching && recentAddresses.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] text-gray-500 font-medium">Recent:</span>
            {recentAddresses.map((addr) => (
              <button key={addr} type="button" title={addr}
                onClick={() => { searchVersion.current++; pendingSearch.current = null; setAddress(addr); setResult(null); setSelectedLocalityId(''); setTimeout(() => runSearch(), 0); }}
                className="text-[11px] text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2.5 py-1 hover:bg-violet-100 max-w-[240px] truncate">
                {addr}
              </button>
            ))}
          </div>
        )}

        {/* Responsive split: stacked on smaller screens, two columns on desktop. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto lg:grid-cols-[400px_minmax(0,1fr)] lg:overflow-hidden">
          <div className="w-full space-y-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <AddressSearchSummary address={address} searching={searching} result={result}/>
            {(result?.suggested_locality||result?.ai_locality_name)&&<section aria-label="Selected jurisdiction" className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 shadow-sm"><p className="text-xs text-gray-500">Detected jurisdiction</p><p className="font-semibold">{result.suggested_locality?.name||result.ai_locality_name}{(result.suggested_locality?.state||result.ai_state)?", "+(result.suggested_locality?.state||result.ai_state):""}</p><p className="text-xs text-gray-600">{result.apply_allowed?"Found it — double-check the office notes below, then press Use this jurisdiction.":"We found the town or township — someone on the team still needs to check the offices before it can be used."}</p></section>}
            <details className="rounded-xl border border-slate-200 bg-white shadow-sm"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">Search activity</summary><div className="p-3 pt-0"><ResearchProgressBar inline /></div></details>
                {/* Manual jurisdiction browsing; an entered address must pass location checks. */}
                {!address.trim() && localities.length > 0 && (
                  <div className="border rounded-lg p-3 bg-white">
                    <Label htmlFor="jurisdiction-choice" className="text-xs">Choose a jurisdiction</Label>
                    <select id="jurisdiction-choice"
                      value={selectedLocalityId}
                      disabled={Boolean(address.trim())}
                      onChange={(e) => {searchVersion.current++;setSearching(false);setSelectedLocalityId(e.target.value);}}
                      className="w-full min-h-11 text-sm border rounded px-2 mt-1"
                    >
                      <option value="">— Select —</option>
                      {localities.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.name}{l.state ? ` (${l.state})` : ''}{l.zip ? ` ${l.zip}` : ''}
                        </option>
                      ))}
                    </select>
                    {selectedLocality && <p className="text-xs mt-2">{selectedAuthority.officeCount>0?`${selectedAuthority.officeCount} office(s) reviewed by staff.`:"Office coverage still needs review."}</p>}
                    <details><summary className="min-h-11 py-2 text-xs cursor-pointer">See office review details</summary>
                    {selectedLocality && (
                      selectedAuthority.officeCount > 0 ? (
                        <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-900">
                          <div className="flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {selectedAuthority.officeCount} office checked by our team{selectedAuthority.officeCount === 1 ? "y" : "ies"}
                          </div>
                          <p className="mt-0.5">{selectedAuthority.labels.join(" • ")}</p>
                          <p className="mt-1 text-emerald-800">These offices are confirmed. Any others listed are still just our notes.</p>
                          {selectedAuthority.coverage_status === "partial" && (
                            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
                              <p className="font-semibold">Still needs checking: {selectedAuthority.other_office_count} more office(s).</p>
                              {selectedAuthority.reviewLabels.length > 0 && <p className="mt-1">Offices still being checked: {selectedAuthority.reviewLabels.join(" • ")}</p>}
                            </div>
                          )}
                          {selectedAuthority.coverage_status === "configured_offices_reviewed" && (
                            <p className="mt-2 text-gray-700">Every office we know about has been checked — but there may be another office we do not know about.</p>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                          <div className="flex items-center gap-1 font-semibold">
                            <AlertTriangle className="h-3.5 w-3.5" /> No offices checked yet
                          </div>
                          <p className="mt-1">You can still use this place, but no one has confirmed which office handles permits there.</p>
                          {selectedAuthority.reviewLabels.length > 0 && <p className="mt-1">Offices still being checked: {selectedAuthority.reviewLabels.join(" • ")}</p>}
                        </div>
                      )
                    )}
                    {selectedLocality && <ElectricalAuthorityCoverage authority={selectedAuthority} selectionContext="manual" />}
                    </details>
                  </div>
                )}

            {selectedLocalityId && !address.trim() && currentUser?.role!=='admin' && <p role="status" className="rounded border bg-blue-50 p-3 text-sm">Enter the job address above so we can check its location before you use this jurisdiction.</p>}
            {currentUser?.role==='admin'&&!address.trim()&&<section aria-label="Manual repository draft" className="rounded border bg-violet-50 p-3 space-y-2">
              <h4 className="font-semibold text-sm">Create a tracker from the repository</h4>
              <p className="text-xs">This makes a draft — it does not confirm the address or the right office.</p>
              {repositoryError&&<p role="alert" className="text-xs text-red-700">{repositoryError}</p>}
              <label className="block text-xs">Repository jurisdiction
                <select aria-label="Repository jurisdiction for draft" className="block w-full min-h-11 border rounded bg-white" value={repositoryDraftId} disabled={repositoryLoading||Boolean(repositoryError)||creatingDraft} onChange={event=>{setRepositoryDraftId(event.target.value);setDraftCandidate(null);}}>
                  <option value="">{repositoryLoading?'Loading repository…':'Select a repository jurisdiction'}</option>
                  {repositoryJurisdictions.map(row=><option key={row.id} value={row.id} disabled={hasDuplicateRepositoryIdentity(repositoryJurisdictions,row)}>{row.name} · {row.state || 'State unknown'} · {row.type || 'Type unknown'}{row.parent_county?.name?' · '+row.parent_county.name+' County':''}{hasDuplicateRepositoryIdentity(repositoryJurisdictions,row)?' · Duplicate — needs review':''}</option>)}
                </select>
              </label>
              <Button type="button" disabled={!repositoryDraftId||creatingDraft||repositoryLoading||Boolean(repositoryError)} onClick={()=>{const matches=repositoryJurisdictions.filter(row=>row.id===repositoryDraftId);if(matches.length===1)requestDraftFromRepository(matches[0]);}}>Review draft creation</Button>
            </section>}
            {result && (
              <>
                {/* Locality match */}
                <div className={`border rounded-lg p-3 ${result.apply_allowed ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    {result.suggested_locality ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    )}
                    <h4 className="font-semibold text-sm">{result.suggested_locality ? "Location checked" : "We need to check this address"}</h4>
                  </div>
                  {result.suggested_locality ? (
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-green-900">
                          {result.suggested_locality.name}
                          {result.suggested_locality.state && ` (${result.suggested_locality.state})`}
                        </p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${result.match_confidence === 'high' ? 'border-green-300 bg-green-100 text-green-800' : 'border-amber-300 bg-amber-100 text-amber-800'}`}>
                          Government boundaries checked
                        </span>
                      </div>
                      {result.match_reason && (
                        <p className="text-[11px] text-green-800 mt-1">{result.match_reason}</p>
                      )}
                      {result.suggested_locality.zip && (
                        <p className="text-xs text-green-700">ZIP: {result.suggested_locality.zip}</p>
                      )}
                      <details><summary className="min-h-11 py-2 text-sm cursor-pointer">See office checks</summary>
                      <div className={`mt-2 rounded border px-2.5 py-2 text-[11px] ${addressAuthority?.status === 'staff_verified_roles' ? 'border-emerald-200 bg-white/70 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                        <div className="flex items-center gap-1 font-semibold">
                          {addressAuthority?.status === 'staff_verified_roles' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                          Permit offices: {addressAuthority?.status === 'staff_verified_roles' ? 'checked by our team' : 'not checked yet'}
                        </div>
                        {addressAuthority?.status === 'staff_verified_roles' ? (
                          <>
                            <p className="mt-0.5">{addressAuthorityLabels.join(" • ")}</p>
                            <p className="mt-1 text-emerald-800">We confirmed the spot on the map. The offices above were checked separately by our team.</p>
                          </>
                        ) : (
                          <p className="mt-1">Finding the address does not prove which office handles sign, zoning, building, or electrical permits.</p>
                        )}
                        {addressAuthority?.coverage_status === 'partial' && (
                          <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
                            <p className="font-semibold">Still needs checking: {addressAuthority.other_office_count} more office(s).</p>
                            {addressRolesNeedingReview.length > 0 && (
                              <p className="mt-1">Offices still being checked: {addressRolesNeedingReview.join(" • ")}</p>
                            )}
                          </div>
                        )}
                        <ElectricalAuthorityCoverage authority={addressAuthority} selectionContext="address" />
                        {addressAuthority?.coverage_status === 'configured_offices_reviewed' && (
                          <p className="mt-2 text-gray-700">Every office we know about has been checked — but there may be another office we do not know about.</p>
                        )}
                        {addressAuthority?.coverage_status === 'not_verified' && addressRolesNeedingReview.length > 0 && (
                          <p className="mt-2 text-amber-900">Offices still being checked: {addressRolesNeedingReview.join(" • ")}</p>
                        )}
                      </div>
                      </details>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-amber-900"><strong>{result.geocoding_service?.issue ? (result.geocoding_service.fallback_used ? 'Our main map service was down — a backup found the general area.' : 'Our map tool had a problem.') : result.location_resolution?.status==='location_verified' ? 'Found the spot — the offices still need checking.' : 'We could not pin down the exact spot.'}</strong></p>
                      <p className="text-xs text-amber-800 mt-2">{result.automatic_scan?.started ? 'We started looking up info on the town’s website — someone on the team still needs to check it.' : 'Someone on the team can dig deeper using the tools below.'} You do not need to choose a place or guess.</p>
                      {result.match_reason && (
                        <p className="text-[11px] text-amber-800 mt-1">{result.match_reason}</p>
                      )}
                    </div>
                  )}
                </div>

                <AutomaticAddressScanResults scanResult={result.automatic_scan} archives={result.address_archives}/>
                {result.suggested_locality && !result.apply_allowed && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">We found the spot. Someone on the team needs to check the sign and zoning offices before it can be used.</p>}
                {/* Repository bridge — explicit draft creation only; never treat AI/repository data as verified workflow. */}
                {!result.suggested_locality && (
                  <div className="border rounded-lg p-3 bg-violet-50 border-violet-200 space-y-2">
                    <div>
                      <h4 className="font-semibold text-sm text-violet-950">Saved jurisdictions</h4>
                      <p className="text-[11px] text-violet-800 mt-0.5">
                        These are saved records — not proof of which office handles permits. Check before using one.
                      </p>
                    </div>

                    {repositoryLoading && (
                      <div className="text-xs text-violet-700 flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking repository…
                      </div>
                    )}

                    {repositoryError && (
                      <div className="text-xs text-red-700 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>{repositoryError}</span>
                      </div>
                    )}

                    {!repositoryLoading && !repositoryError && repositoryMatches.length === 0 && (
                      <p className="text-xs text-violet-700">No matching repository profile was found.</p>
                    )}

                    {!repositoryLoading && repositoryMatches.map((jurisdiction) => {
                      const duplicate = hasDuplicateRepositoryIdentity(repositoryJurisdictions, jurisdiction);
                      const trust = assessJurisdictionTrust(jurisdiction, duplicate ? 2 : 1);
                      const parentCounty = jurisdiction.parent_county?.name;
                      const contact = jurisdiction.contact_info || {};
                      return (
                        <div key={jurisdiction.id} className="rounded-md border border-violet-200 bg-white p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">{jurisdiction.name}{jurisdiction.state ? `, ${jurisdiction.state}` : ""}</p>
                              <p className="text-[11px] text-gray-500 capitalize">
                                {jurisdiction.type || "jurisdiction"}{parentCounty ? ` • Parent: ${parentCounty}` : ""}
                              </p>
                              <span className={`inline-flex mt-1 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${trust.className}`} title={trust.description}>
                                {trust.label}
                              </span>
                              {contact.department && contact.department !== "INFORMATION NOT FOUND" && (
                                <p className="text-xs text-gray-700 mt-1">{contact.department}</p>
                              )}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={duplicate || creatingDraft || (Boolean(address.trim()) && !isDetectedCandidate(jurisdiction))}
                              onClick={() => requestDraftFromRepository(jurisdiction)}
                              className="h-7 text-xs border-violet-300 text-violet-800 hover:bg-violet-100 flex-shrink-0"
                            >
                              Create draft & apply
                            </Button>
                          </div>
                          {duplicate ? (
                            <p className="text-[11px] text-amber-700 mt-1.5 flex items-start gap-1">
                              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> Two saved entries match this place — an admin needs to clean them up first.
                            </p>
                          ) : trust.issues.length > 0 ? (
                            <p className="text-[11px] text-amber-700 mt-1.5 flex items-start gap-1">
                              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {trust.issues[0]}{trust.issues.length > 1 ? ` +${trust.issues.length - 1} more review item${trust.issues.length - 1 === 1 ? '' : 's'}` : ''}.
                            </p>
                          ) : null}
                        </div>
                      );
                    })}

                    {draftCreateError && (
                      <div className="text-xs text-red-700 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>{draftCreateError}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Zoning */}
                {(result.zoning?.district_code || result.zoning?.district_name || result.zoning?.summary) && (
                  <div className="border rounded-lg p-3 bg-blue-50 border-blue-200">
                    <h4 className="font-semibold text-sm mb-1.5 text-blue-900">🏛️ Zoning</h4>
                    {result.zoning.district_code && (
                      <p className="text-xs"><strong>District:</strong> {result.zoning.district_code}{result.zoning.district_name ? ` — ${result.zoning.district_name}` : ''}</p>
                    )}
                    {result.zoning.summary && (
                      <p className="text-xs mt-1 text-blue-900/80">{result.zoning.summary}</p>
                    )}
                  </div>
                )}

                {/* Parcel */}
                {(result.parcel?.owner || result.parcel?.parcel_number || result.parcel?.lot_size_acres) && (
                  <div className="border rounded-lg p-3 bg-purple-50 border-purple-200">
                    <h4 className="font-semibold text-sm mb-1.5 text-purple-900">📋 Parcel Info</h4>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-purple-900">
                      {result.parcel.owner && <div><strong>Owner:</strong> {result.parcel.owner}</div>}
                      {result.parcel.lot_size_acres && <div><strong>Lot size:</strong> {result.parcel.lot_size_acres} ac</div>}
                      {result.parcel.parcel_number && <div className="col-span-2"><strong>Parcel #:</strong> {result.parcel.parcel_number}</div>}
                      {result.parcel.source_url && (
                        <div className="col-span-2">
                          <a href={result.parcel.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-[11px]">
                            View source →
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {result.notes && (
                  <div className="text-[11px] text-gray-500 italic px-1">{result.notes}</div>
                )}
              </>
            )}
            <details className="rounded-xl border border-slate-200 bg-white shadow-sm"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">Review and research tools</summary><div className="p-3 pt-0"><SelectorScanActions key={selectedLocalityId || result?.geocode?.display_name || result?.ai_locality_name || 'empty'} locality={selectedLocality} result={result} profiles={repositoryJurisdictions} loading={repositoryLoading} unavailable={repositoryError} onProfileUpdated={profile=>setRepositoryJurisdictions(prev=>prev.some(row=>row.id===profile.id)?prev.map(row=>row.id===profile.id?profile:row):[...prev,profile])}/></div></details>
            <details className="rounded-xl border border-slate-200 bg-white shadow-sm"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">Saved research</summary><div className="p-3 pt-0"><SavedAddressResearch /></div></details>
          </div>

          {/* Map stays visible on mobile without forcing a 420px results column beside it. */}
          <div className="relative min-h-[360px] w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-gray-100 shadow-sm lg:min-h-0 lg:self-stretch">
            <GoogleMapView position={mapPosition} markerTitle={markerTitle} boundaries={result?.location_resolution?.boundaries || []} />
          </div>
        </div>

        {/* Footer */}
        <AlertDialog
          open={!!draftCandidate}
          onOpenChange={(open) => {
            if (!open && !creatingDraft) setDraftCandidate(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Create a draft permit locality?</AlertDialogTitle>
              <AlertDialogDescription>
                This will copy the repository contact information for {draftCandidate?.name || "this jurisdiction"} into a new Permit locality and add only three generic tracking milestones: Application Submitted, Follow-up, and Permit Received. It will not copy AI permit requirements, fees, deadlines, or approval claims. Verify the responsible office and workflow before relying on it for submission.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {draftCreateError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{draftCreateError}</div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={creatingDraft}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={creatingDraft}
                onClick={(e) => {
                  e.preventDefault();
                  confirmDraftFromRepository();
                }}
              >
                {creatingDraft ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                Create Draft & Apply
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t pt-3">
          <div className="text-[11px] text-gray-500">
            {excludeElectrical ? "🚫 Electrical Inspectors will be excluded" : "⚡ Electrical Inspectors will be included"}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={onClose} className="gap-1 flex-1 sm:flex-none">
              <X className="w-4 h-4" /> Close
            </Button>
            <Button
              onClick={handleApply}
              disabled={!selectedLocalityId || searching || !addressCanApply}
              className="bg-purple-600 hover:bg-purple-700 gap-1 flex-1 sm:flex-none"
            >
              <Save className="w-4 h-4" /> Use this jurisdiction
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}