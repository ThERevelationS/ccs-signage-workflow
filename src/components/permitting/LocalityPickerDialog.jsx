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
import { Search, Loader2, MapPin, AlertTriangle, CheckCircle2, Zap, ZapOff, X, Save , Mic} from "lucide-react";
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
  electrical: "Electrical (old combined role)",
  electrical_permit: "Issues the electrical permit",
  electrical_inspection: "Inspects the electrical work",
  right_of_way: "Roads / sidewalks",
  historic_review: "Historic review",
  planning: "Planning",
  transportation: "Transportation",
  other: "Other",
};

// Power-user mode: a localStorage flag that skips the confirm dialogs — for
// staff who do many applies back-to-back and know what they are doing.
export const confirmOrSkip = (message) => { try { if (localStorage.getItem("permitting_skip_confirms") === "1") return true; } catch {} return window.confirm(message); };

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
const LAST_SEARCH_KEY="permitting_last_search_";
const lastSearchKeyFor=(addr)=>LAST_SEARCH_KEY+normalizeAddress(addr).toLowerCase();
const loadLastSearch=(addr)=>{try{const r=JSON.parse(localStorage.getItem(lastSearchKeyFor(addr))||"null");return r?.result||null;}catch{return null;}};
const saveLastSearch=(addr,result)=>{try{localStorage.setItem(lastSearchKeyFor(addr),JSON.stringify({result,saved_at:Date.now()}));}catch{}};
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
  const serviceFails=useRef(0);
  const pendingSearch=useRef(null),pendingDraft=useRef(null);
  const openRef=useRef(isOpen);openRef.current=isOpen;
  useEffect(()=>()=>{openRef.current=false;searchVersion.current++;},[]);
  const [address, setAddress] = useState("");
  const [searching, setSearching] = useState(false);
  const [recentAddresses, setRecentAddresses] = useState(() => loadRecentAddresses());
  const [slowSearch, setSlowSearch] = useState(false);
  const [searchedFor, setSearchedFor] = useState("");
  const [firstRun, setFirstRun] = useState(() => { try { return localStorage.getItem("permitting_first_run_done") !== "1"; } catch { return true; } });
  const [showOptions, setShowOptions] = useState(() => { try { return localStorage.getItem("permitting_show_options") === "1"; } catch { return false; } });
  const [bigText, setBigText] = useState(() => { try { return localStorage.getItem("permitting_big_text") === "1"; } catch { return false; } });
  const [lang, setLang] = useState(() => { try { return localStorage.getItem("permitting_lang") || "en"; } catch { return "en"; } });
  const t = (en, es) => (lang === "es" ? es : en);
  const [result, setResult] = useState(null); // address location and reference research
  const [error, setError] = useState("");
  const [excludeElectrical, setExcludeElectrical] = useState(() => { try { return localStorage.getItem("permitting_exclude_electrical") === "1"; } catch { return false; } });
  const [selectedLocalityId, setSelectedLocalityId] = useState("");
  const [repositoryJurisdictions, setRepositoryJurisdictions] = useState([]);
  const [repositoryLoading, setRepositoryLoading] = useState(false);
  const [repositoryError, setRepositoryError] = useState("");
  const [draftCandidate, setDraftCandidate] = useState(null);
  const [repositoryDraftId,setRepositoryDraftId]=useState("");
  const [draftCreateError, setDraftCreateError] = useState("");
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [multiMode, setMultiMode] = useState(false);
  const [multiResults, setMultiResults] = useState([]);
  const [autoSearchNonce, setAutoSearchNonce] = useState(0);
  const [multiRunning, setMultiRunning] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [scanningQR, setScanningQR] = useState(false);
  const scanVideoRef = useRef(null);
  const scanStreamRef = useRef(null);
  const inputRef = useRef(null);

  const autoSearchRef = useRef(false);
  useEffect(() => {
    searchVersion.current++;pendingSearch.current=null;
    if (isOpen) {
      const preset = String(initialAddress || "").trim();
      const cached = preset ? loadLastSearch(preset) : null;
      if (cached) setResult(cached);
      setAddress(preset);
      setSearching(false);
      setResult(null);
      setError("");
      setSelectedLocalityId("");
      setExcludeElectrical(() => { try { return localStorage.getItem("permitting_exclude_electrical") === "1"; } catch { return false; } });
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
      if (!cancelled) setRepositoryError("We couldn't load the saved offices list — you can still pick one that's already set up.");
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
    if(/^\s*\d{5}(-\d{4})?\s*$/.test(norm))setError("A ZIP code narrows it down but isn't enough — add the street address.");
    else if(!hasSignal&&!/,\s*\S+/.test(norm))setError("That address is missing a city, state, or ZIP — adding one usually finds it faster.");
    else setError("");
    setResult(null);
    try {
      const invoke=runAction;
      const lookup=payload=>invoke('resolvePermittingAddress',payload,`Looking up ${address.trim()}`);
      let data;
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
        if(data){serviceFails.current=0;setSearchedFor(norm);}
        if(data?.suggested_locality||data?.geocode){rememberAddress(address.trim());setRecentAddresses(loadRecentAddresses());saveLastSearch(address,data);}
        if (data?.suggested_locality?.id) {
          setSelectedLocalityId(data.suggested_locality.id);
        }
      }
    } catch (e) {
      if(version!==searchVersion.current||!openRef.current)return;
      serviceFails.current=(serviceFails.current||0)+1;
      setError(serviceFails.current>=2
        ? "Our lookup service is having trouble right now — try again in a minute, or pick from the saved offices list below."
        : (e.message || "Search failed"));
    }
    if(pendingSearch.current===version)pendingSearch.current=null;
    if(version===searchVersion.current&&openRef.current)setSearching(false);
  };

  // Tapping a multi-address result sets the address then bumps this nonce —
  // the effect runs after the re-render so runSearch sees the fresh address.
  useEffect(() => {
    if (!autoSearchNonce) return;
    runSearch();
  }, [autoSearchNonce]);

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
      if (!confirmOrSkip(`${name} hasn't been checked by our team yet — the permit offices and contact info may be incomplete. Use it anyway?`)) return;
    }
    onApply(selectedLocalityId, { excludeElectrical });
    // First-few-applies reassurance — a small visible win while the workflow is
    // still new to the staff member. Stops after the third apply.
    try {
      const count = (parseInt(localStorage.getItem("permitting_apply_count") || "0", 10) || 0) + 1;
      localStorage.setItem("permitting_apply_count", String(count));
      if (count <= 3) setTimeout(() => window.alert(count === 1 ? "Done — that's right! The office is linked to this job. Next step: scroll down and fill in the dates, or call the office." : "Good — office linked. You've got this."), 350);
    } catch {}
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
      setDraftCreateError(`More than one saved office matches ${jurisdiction.name}, ${jurisdiction.state || ""} — someone on the team needs to fix the doubles first.`);
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
      setDraftCreateError(e?.message || "Couldn't make the office record — nothing changed on this job.");
    } finally {
      if(openRef.current&&draftVersion===searchVersion.current)setCreatingDraft(false);
    }
  };

  const mapPosition = Number.isFinite(result?.geocode?.lat)&&Number.isFinite(result?.geocode?.lon) ? { lat: result.geocode.lat, lng: result.geocode.lon } : null;
  // GPS-vs-geocode disagreement — when "Use my location" and the resolved pin disagree by >500ft, flag the mismatch.
  const gpsMismatch = gpsCoords && mapPosition && (() => {
    const dLat = (mapPosition.lat - gpsCoords.lat) * 111320;
    const dLng = (mapPosition.lng - gpsCoords.lng) * 111320 * Math.cos(gpsCoords.lat * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng) > 152; // 500ft ≈ 152m
  })();
  const markerTitle = result?.geocode?.display_name || address.trim();

  return (
    <Dialog open={isOpen} onOpenChange={(o) => {
      if (o) return;
      if (searching && !confirmOrSkip("A lookup is still running — close anyway? (It keeps running in the background.)")) return;
      onClose();
    }}>
      <DialogContent className={"flex h-[95dvh] w-[96vw] max-w-none flex-col gap-0 overflow-hidden border-none bg-slate-50 p-0 "+(bigText?"text-[115%] [&_button]:min-h-12 [&_input]:text-base [&_p]:text-sm [&_span]:text-sm [&_p]:tracking-wide [&_p]:leading-relaxed [&_button]:tracking-wide":"")}>
        <DialogHeader className="border-b bg-white px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-100"><MapPin className="h-4 w-4 text-violet-600" /></span>
            Which office issues permits here?
            <button type="button" onClick={()=>{const v=lang==="en"?"es":"en";setLang(v);try{localStorage.setItem("permitting_lang",v);}catch{}}} className="ml-auto text-[10px] font-semibold text-violet-700 border border-violet-200 rounded-full px-2.5 py-1 hover:bg-violet-50" title={lang==="en"?"Cambiar a español":"Switch to English"}>{lang==="en"?"ES":"EN"}</button>
            <button type="button" onClick={()=>{const v=!bigText;setBigText(v);try{localStorage.setItem("permitting_big_text",v?"1":"0");}catch{}}} className="text-[10px] font-semibold text-violet-700 border border-violet-200 rounded-full px-2.5 py-1 hover:bg-violet-50" title="Make the text bigger">{bigText?"A−":"A+"}</button>
          </DialogTitle>
        </DialogHeader>

        {firstRun&&<div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900 flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0"/><div className="flex-1"><strong>How this works:</strong> Type or paste the job address → we find the town or township → double-check the offices → press Use this office. That's it. <span className="cursor-help border-b border-dotted border-violet-400" title='"Office" means which town, township, or county office issues your permit — every level is different. "Checked" means our team looked at it. "Needs a look" means nobody confirmed it yet.'>what do these words mean?</span></div><button type="button" className="text-xs font-semibold underline" onClick={()=>{setFirstRun(false);try{localStorage.setItem("permitting_first_run_done","1");}catch{}}}>Got it</button></div>}
        {/* Address search bar */}
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-0 w-full sm:min-w-[280px]">
            <Label htmlFor="jurisdiction-job-address" className="text-xs">Job address</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              {typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition) && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 min-h-11 min-w-8 rounded text-gray-500 hover:text-violet-700"
                  title="Speak the address"
                  onClick={() => {
                    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
                    const rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false;
                    rec.onresult = (ev) => {
                      const text = String(ev.results?.[0]?.[0]?.transcript || '').trim();
                      if (text) { searchVersion.current++; pendingSearch.current = null; setAddress(text); setResult(null); setSelectedLocalityId(''); setSearching(false); setTimeout(() => runSearch(), 0); }
                    };
                    rec.onerror = () => setError("Couldn't hear that — type the address instead.");
                    try { rec.start(); } catch {}
                  }}
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}
              <Input
                id="jurisdiction-job-address"
                ref={inputRef}
                value={address}
                onChange={(e) => {searchVersion.current++;pendingSearch.current=null;setAddress(e.target.value);setResult(null);setSelectedLocalityId('');setSearching(false);}}
                placeholder="e.g. 4900 Parkway Dr, Mason, OH 45040"
                className="min-h-11 pl-8 pr-10 text-base"
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
            {/(\bp\.?o\.?\s*box\b|\brural\s*route\b|\brr\s*\d+\b)/i.test(address) && (
              <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                That looks like a PO box or rural route — we found a postal area, not a physical sign location. Check the map pin before applying.
              </p>
            )}
            <button type="button" onClick={() => { setMultiMode(!multiMode); setMultiResults([]); }} className="text-[10px] font-semibold text-purple-600 hover:underline">
              {multiMode ? "Single address" : "Paste several addresses"}
            </button>
          </div>
          {multiMode && (
            <div className="space-y-2">
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={"One address per line:\n4900 Parkway Dr, Mason, OH\n100 Main St, Loveland, OH"}
                className="min-h-[100px] w-full rounded-md border border-gray-200 p-2 text-sm"
              />
              <Button
                size="sm"
                disabled={multiRunning || !address.trim()}
                className="bg-purple-600 hover:bg-purple-700"
                onClick={async () => {
                  const lines = address.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 20);
                  setMultiRunning(true); setMultiResults([]);
                  const results = [];
                  for (const line of lines) {
                    try {
                      const res = await base44.functions.invoke("resolvePermittingAddress", { address: line });
                      const data = res?.data || res || {};
                      const sug = data.suggested_locality || null;
                      const loc = sug?.name || data.locality_name || data.locality?.name || data.candidates?.[0]?.locality_name || data.candidates?.[0]?.name || "";
                      results.push({ address: line, locality: loc, found: !!loc, localityId: sug?.id || null, canApply: data.apply_allowed === true });
                    } catch { results.push({ address: line, locality: "", found: false, localityId: null, canApply: false }); }
                    setMultiResults([...results]);
                  }
                  setMultiRunning(false);
                }}
              >{multiRunning ? "Checking…" : "Check all addresses"}</Button>
              {multiResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded border border-gray-200 text-[11px]">
                  {multiResults.map((r, i) => (
                    <div key={i} className={`flex items-center justify-between gap-2 border-b border-gray-100 px-2 py-1 ${r.found ? "" : "bg-red-50"}`}>
                      <span className="truncate text-slate-600">{r.address}</span>
                      {r.found && r.localityId ? (
                        <button
                          type="button"
                          onClick={() => { setAddress(r.address); setMultiMode(false); setAutoSearchNonce(Date.now()); }}
                          className="shrink-0 font-semibold text-emerald-700 underline decoration-dotted hover:text-emerald-900"
                          title={r.canApply ? `Use ${r.locality} for this job` : `${r.locality} — found, but offices still need a check`}
                        >
                          {r.locality}{r.canApply ? " — use it →" : " — needs check"}
                        </button>
                      ) : (
                        <span className={`shrink-0 font-semibold ${r.found ? "text-emerald-700" : "text-red-600"}`}>{r.locality || "not found"}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {searching ? (
            <Button
              variant="outline"
              onClick={() => { searchVersion.current++; pendingSearch.current = null; setSearching(false); }}
              className="gap-1 min-h-11 w-full sm:w-auto"
            >
              <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> Cancel search
            </Button>
          ) : (
            <>
            <Button onClick={runSearch} disabled={!address.trim()} className="bg-purple-600 hover:bg-purple-700 gap-1 min-h-11 w-full sm:w-auto">
              <Search className="w-4 h-4" /> {t("Find my office", "Encontrar mi oficina")}
            </Button>
            <button type="button" className="min-h-11 self-center rounded-md border border-slate-200 px-2 text-xs font-bold text-slate-500 hover:bg-slate-50" title="Keyboard shortcuts"
              onClick={() => window.alert("Shortcuts:\n• Enter — search the typed address\n• Esc — close this dialog\n• Paste a full address — searches automatically")}>?</button>
            </>
          )}

          <button type="button" className="min-h-11 w-full sm:w-auto text-xs font-semibold text-violet-700 underline self-center" onClick={() => { const v = !showOptions; setShowOptions(v); try { localStorage.setItem("permitting_show_options", v ? "1" : "0"); } catch {} }}>{showOptions ? "Fewer options" : "More options…"}</button>

          {showOptions && <>
          <button type="button" className="min-h-11 w-full sm:w-auto text-xs font-semibold text-slate-600 underline self-center" onClick={() => { try { const v = localStorage.getItem("permitting_skip_confirms") !== "1"; localStorage.setItem("permitting_skip_confirms", v ? "1" : "0"); window.alert(v ? "Confirmations are now skipped." : "Confirmations are back on."); } catch {} }}>Skip confirmations</button>
          <Button
            variant="outline"
            className="gap-1 min-h-11 w-full sm:w-auto"
            title="Use my current location to find the address (works best on-site)"
            onClick={() => {
              if (!navigator.geolocation) { setError("This device can't share its location — type the address instead."); return; }
              if (address.trim() && !confirmOrSkip(`Use your GPS location instead of the address you typed (${address.slice(0, 40)})?`)) return;
              setError("");
              navigator.geolocation.getCurrentPosition(async (pos) => {
                try {
                  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&addressdetails=1`);
                  const hit = await r.json();
                  const a = hit?.address || {};
                  const parts = [[a.house_number, a.road].filter(Boolean).join(' '), a.city || a.town || a.village || a.hamlet || a.county, a.state, a.postcode].filter(Boolean);
                  if (!parts.length) { setError("Couldn't read an address from your location — type it instead."); return; }
                  const found = parts.join(', ');
                  setAddress(found); setResult(null); setSelectedLocalityId(''); setSearching(false);
                  setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                  setTimeout(() => runSearch(), 0);
                } catch { setError("Couldn't read an address from your location — type it instead."); }
              }, () => setError("Location was blocked — allow location access or type the address."), { timeout: 15000 });
            }}
          >
            <MapPin className="w-4 h-4" /> {t("Use my location", "Usar mi ubicación")}
          </Button>

          {"BarcodeDetector" in window && (
            <Button
              variant="outline"
              className="gap-1 min-h-11 w-full sm:w-auto"
              title="Scan a printed work order's QR code to pull the job address"
              onClick={async () => {
                if (scanningQR) { scanStreamRef.current?.getTracks().forEach((t) => t.stop()); setScanningQR(false); return; }
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
                  scanStreamRef.current = stream; setScanningQR(true);
                  const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
                  const tick = async () => {
                    if (!scanVideoRef.current || scanVideoRef.current.readyState < 2) { if (scanStreamRef.current) setTimeout(tick, 300); return; }
                    try {
                      const codes = await detector.detect(scanVideoRef.current);
                      if (codes.length && codes[0].rawValue) {
                        scanStreamRef.current?.getTracks().forEach((t) => t.stop()); scanStreamRef.current = null; setScanningQR(false);
                        setAddress(String(codes[0].rawValue)); setResult(null); setSelectedLocalityId(''); setSearching(false);
                        setTimeout(() => runSearch(), 0); return;
                      }
                    } catch {}
                    if (scanStreamRef.current) setTimeout(tick, 300);
                  };
                  setTimeout(tick, 300);
                } catch { setError("Camera was blocked — allow access or type the address."); }
              }}
            >
              {scanningQR ? "Stop scan" : "Scan QR"}
            </Button>
          )}
          {scanningQR && (
            <video ref={(el) => { scanVideoRef.current = el; if (el && scanStreamRef.current) { el.srcObject = scanStreamRef.current; el.play().catch(() => {}); } }} className="mt-2 max-h-40 w-full rounded-md border border-slate-200 object-cover" muted playsInline />
          )}

          <Button
            variant="outline"
            className="gap-1 min-h-11 w-full sm:w-auto"
            title="Paste the last address you copied"
            onClick={async () => {
              try {
                const text = String(await navigator.clipboard.readText() || "").trim();
                if (!text) { setError("Nothing on the clipboard — copy an address first."); return; }
                if (!/\d/.test(text) || !/[a-zA-Z]{3,}/.test(text)) { setError("The clipboard doesn't look like a street address — copy the address first."); return; }
                searchVersion.current++; pendingSearch.current = null;
                setAddress(text); setResult(null); setSelectedLocalityId(''); setSearching(false);
                setTimeout(() => runSearch(), 0);
              } catch { setError("Couldn't read the clipboard — paste into the field instead."); }
            }}
          >
            <Save className="w-4 h-4" /> Paste address
          </Button>

          {/* Electrical inspector toggle */}
          <Button
            variant="outline"
            onClick={() => { if (!excludeElectrical && !confirmOrSkip("Hide electrical inspectors on this job? Only do this if the office already confirmed no electrical permit is needed.")) return; setExcludeElectrical(v => { const next = !v; try { localStorage.setItem("permitting_exclude_electrical", next ? "1" : "0"); } catch {} return next; }); }}
            className={`gap-1 min-h-11 w-full sm:w-auto ${excludeElectrical ? 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100' : 'border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
            title={excludeElectrical ? "Electrical Inspectors will be hidden/excluded" : "Electrical Inspectors will be included"}
          >
            {excludeElectrical ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            {excludeElectrical ? "Electrical: OFF" : "Electrical: ON"}
          </Button>
          </>}
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
              <button type="button" key={addr} type="button" title={addr}
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
            {gpsMismatch && (
              <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                Your GPS and the typed address disagree by more than 500 ft — double-check which location is the actual job site before applying.
              </p>
            )}
            {(result?.suggested_locality||result?.ai_locality_name)&&<section aria-label="Picked office" className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 shadow-sm"><p className="text-xs text-gray-500">Found office</p><p className="font-semibold">{result.suggested_locality?.name||result.ai_locality_name}{(result.suggested_locality?.state||result.ai_state)?", "+(result.suggested_locality?.state||result.ai_state):""}</p><p className="text-xs text-gray-600">{result.apply_allowed?"Found it — double-check the office notes below, then press Use this office.":"We found the town or township — someone on the team still needs to check the offices before it can be used."}</p></section>}
            <details className="rounded-xl border border-slate-200 bg-white shadow-sm"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">Search activity</summary><div className="p-3 pt-0"><ResearchProgressBar inline /></div></details>
                {/* Manual jurisdiction browsing; an entered address must pass location checks. */}
                {!address.trim() && localities.length > 0 && (
                  <div className="border rounded-lg p-3 bg-white">
                    <Label htmlFor="jurisdiction-choice" className="text-xs">Pick an office</Label>
                    <select id="jurisdiction-choice"
                      value={selectedLocalityId}
                      disabled={Boolean(address.trim())}
                      onChange={(e) => {searchVersion.current++;setSearching(false);setSelectedLocalityId(e.target.value);}}
                      className="w-full min-h-11 text-sm border rounded px-2 mt-1"
                    >
                      <option value="">— Select —</option>
                      {[...localities].sort((a, b) => {
                        const av = verifiedAuthoritySummary(a).officeCount > 0 ? 0 : 1;
                        const bv = verifiedAuthoritySummary(b).officeCount > 0 ? 0 : 1;
                        return av - bv || String(a.name || '').localeCompare(String(b.name || ''));
                      }).map(l => (
                        <option key={l.id} value={l.id}>
                          {verifiedAuthoritySummary(l).officeCount > 0 ? '✓ ' : ''}{l.name}{l.state ? ` (${l.state})` : ''}{l.zip ? ` ${l.zip}` : ''}
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

            {selectedLocalityId && !address.trim() && currentUser?.role!=='admin' && <p role="status" className="rounded border bg-blue-50 p-3 text-sm">Enter the job address above so we can check its location before you use this office.</p>}
            {currentUser?.role==='admin'&&!address.trim()&&<section aria-label="Manual repository draft" className="rounded border bg-violet-50 p-3 space-y-2">
              <h4 className="font-semibold text-sm">Set up a new office record from the saved list</h4>
              <p className="text-xs">This makes a draft — it does not confirm the address or the right office.</p>
              {repositoryError&&<p role="alert" className="text-xs text-red-700">{repositoryError}</p>}
              <label className="block text-xs">Saved office record
                <select aria-label="Repository jurisdiction for draft" className="block w-full min-h-11 border rounded bg-white" value={repositoryDraftId} disabled={repositoryLoading||Boolean(repositoryError)||creatingDraft} onChange={event=>{setRepositoryDraftId(event.target.value);setDraftCandidate(null);}}>
                  <option value="">{repositoryLoading?'Loading saved offices…':'Pick a saved office record'}</option>
                  {repositoryJurisdictions.map(row=><option key={row.id} value={row.id} disabled={hasDuplicateRepositoryIdentity(repositoryJurisdictions,row)}>{row.name} · {row.state || 'State unknown'} · {row.type || 'Type unknown'}{row.parent_county?.name?' · '+row.parent_county.name+' County':''}{hasDuplicateRepositoryIdentity(repositoryJurisdictions,row)?' · two copies — needs a fix':''}</option>)}
                </select>
              </label>
              <Button type="button" disabled={!repositoryDraftId||creatingDraft||repositoryLoading||Boolean(repositoryError)} onClick={()=>{const matches=repositoryJurisdictions.filter(row=>row.id===repositoryDraftId);if(matches.length===1)requestDraftFromRepository(matches[0]);}}>Check the draft before making it</Button>
            </section>}
            {result && searchedFor && normalizeAddress(address).toLowerCase() !== searchedFor.toLowerCase() && (
              <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">The address changed since this result — press Find again to re-check.</div>
            )}
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
                      {(() => {
                        const t = result.location_resolution?.target;
                        if (!t?.name) return null;
                        const chain = [`${String(t.type || 'area').replace(/^\w/, (c) => c.toUpperCase())} of ${t.name}`, t.county ? `${t.county} County` : null, t.state].filter(Boolean);
                        return <p className="text-[11px] text-green-700 mt-0.5" title="Every level stays separate — the city, the township, and the county are different offices.">{chain.join(' → ')}</p>;
                      })()}
                      {result.location_resolution?.status === 'location_verified' && result.location_resolution?.target?.type && result.location_resolution?.target?.type !== 'township' && (
                        <p className="text-[11px] text-green-700 mt-0.5">Not a township address — it sits inside the {String(result.location_resolution.target.type) === 'county' ? 'county' : `${result.location_resolution.target.type}`}.</p>
                      )}
                      {Number.isFinite(result.location_resolution?.target?.center_distance_miles) && (
                        <p className="text-[11px] text-green-700 mt-0.5">About {result.location_resolution.target.center_distance_miles} mile{result.location_resolution.target.center_distance_miles === 1 ? '' : 's'} from the pin to {result.location_resolution.target.name}'s center.</p>
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
                {currentUser?.role==='admin'&&result&&<details className="rounded border bg-gray-50 p-2 text-[10px]"><summary className="cursor-pointer font-semibold text-gray-600">Show technical details</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({geocoding_service:result.geocoding_service,location_resolution:result.location_resolution,authority_review:result.authority_review,match_confidence:result.match_confidence,match_method:result.match_method,apply_allowed:result.apply_allowed},null,2)}</pre></details>}
                {result.suggested_locality && !result.apply_allowed && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">We found the spot. Someone on the team needs to check the sign and zoning offices before it can be used.</p>}
                {/* Repository bridge — explicit draft creation only; never treat AI/repository data as verified workflow. */}
                {!result.suggested_locality && (
                  <div className="border rounded-lg p-3 bg-violet-50 border-violet-200 space-y-2">
                    <div>
                      <h4 className="font-semibold text-sm text-violet-950">Saved offices</h4>
                      <p className="text-[11px] text-violet-800 mt-0.5">
                        These are saved records — not proof of which office handles permits. Check before using one.
                      </p>
                    </div>

                    {repositoryLoading && (
                      <div className="text-xs text-violet-700 flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" /> Checking repository…
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
                                {jurisdiction.type || "office"}{parentCounty ? ` • in ${parentCounty} County` : ""}
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
            <GoogleMapView position={mapPosition} markerTitle={markerTitle} boundaries={result?.location_resolution?.boundaries || []} onDragEnd={async (coords) => {
              try {
                const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&addressdetails=1`);
                const hit = await r.json();
                const a = hit?.address || {};
                const parts = [[a.house_number, a.road].filter(Boolean).join(' '), a.city || a.town || a.village || a.hamlet || a.county, a.state, a.postcode].filter(Boolean);
                if (parts.length) { setAddress(parts.join(', ')); setResult(null); setSelectedLocalityId(''); setSearching(false); setTimeout(() => runSearch(), 0); }
              } catch { setError("Couldn't read the dragged pin's address — re-type it instead."); }
            }} />
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
              <AlertDialogTitle>Make a new office record?</AlertDialogTitle>
              <AlertDialogDescription>
                This copies the saved office's contact info for {draftCandidate?.name || "this office"} into a new office record and adds three plain steps: Application Sent, Check Back, and Permit Came In. It does not copy rules, fees, deadlines, or approvals. Check the office and steps before filing.
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
                {creatingDraft ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin motion-reduce:animate-none" /> : null}
                Make it & use it
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
              aria-label="Use the picked office" disabled={!selectedLocalityId || searching || !addressCanApply}
              className="bg-purple-600 hover:bg-purple-700 gap-1 flex-1 sm:flex-none"
            >
              <Save className="w-4 h-4" /> Use this office
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}