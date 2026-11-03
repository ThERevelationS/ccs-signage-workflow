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

const normalizeAddress=(raw)=>{let a=String(raw||"").replace(/\s+/g," ").trim();a=a.replace(/\b(unit|suite|ste|apt|apartment|#)\s*[A-Za-z0-9-]+\b/ig,"");a=a.replace(/,\s*(USA|United States|US)\.?$/i,"");a=a.replace(/\b([0-9]{5})-[0-9]{4}\b/g,"$1");a=a.replace(/[ \t]+,/g,",").replace(/,(?=\S)/g,", ").replace(/,\s*,+/g,",").replace(/\s+/g," ").trim().replace(/^,+|,+$/g,"");return a||String(raw||"").trim();};
const RECENT_ADDR_KEY="permitting_recent_addresses";
const loadRecentAddresses=()=>{try{return JSON.parse(localStorage.getItem(RECENT_ADDR_KEY)||"[]");}catch{return[];}};
const rememberAddress=(addr)=>{const a=String(addr||"").trim();if(!a)return;try{const list=loadRecentAddresses().filter(x=>x!==a);list.unshift(a);localStorage.setItem(RECENT_ADDR_KEY,JSON.stringify(list.slice(0,5)));}catch{}};
// Browser-side geocode → census_hint payload for the resolver. Shared by the
// geocoding-issue resubmit and the total-failure last try.
async function geocodeInBrowser(address){
  const q=encodeURIComponent(normalizeAddress(address));
  const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&addressdetails=1&q=${q}`);
  const hit=(await r.json())?.[0];
  const st=hit?.address?.state||hit?.address?.state_district||'';
  if(!hit?.lat||!hit?.lon||!/ohio|kentucky/i.test(st))return null;
  return {lat:Number(hit.lat),lng:Number(hit.lon),matched_address:hit.display_name,address_parts:{state:st,city:hit.address?.city||hit.address?.town||hit.address?.village||'',zip:hit.address?.postcode||''}};
}
// When staff resolves a flagged address, mint a PermitResolutionRule so the
// decision becomes reusable logic for every future lookup — reviews kill the
// flag class instead of fixing one address. Best-effort: a failed write must
// never break the apply the staff member just did. Default scope is this
// parcel only (safe); the city checkbox broadens it to the postal-city pattern.
const ruleNameNorm=(v)=>String(v||"").trim().toLowerCase().replace(/\s+(city|village|town|county|township)$/,"").replace(/\s+/g," ");
function mintResolutionRule({address, resolution, pickedName, pickedType, forCity}){
  if(!address||!pickedName||resolution?.status!=='needs_review')return;
  const state=String(resolution?.state||'').toUpperCase();
  if(!state)return;
  const parts=String(address).split(",").map(s=>s.trim());
  const enteredCity=parts.length>1?parts[1]:"";
  const county=String(resolution?.target?.county||resolution?.candidates?.[0]?.county||"");
  const data={
    rule_type: forCity&&enteredCity ? "postal_name_map" : "address_override",
    entered_name: forCity&&enteredCity ? ruleNameNorm(enteredCity) : "",
    address_key: forCity&&enteredCity ? "" : ruleNameNorm(parts[0]),
    state, county: ruleNameNorm(county),
    jurisdiction_name: ruleNameNorm(pickedName),
    jurisdiction_type: /township|twp/i.test(String(pickedType)) ? "township" : /county/i.test(String(pickedType)) ? "county" : /village/i.test(String(pickedType)) ? "village" : "municipality",
    source: "staff_review",
    evidence: `Staff resolved flagged address "${address}" -> ${pickedName}. ${String(resolution?.reason||'').slice(0,400)}`,
    created_from_address: String(address).slice(0,300),
    active: true,
  };
  staffEntities.PermitResolutionRule.create(data).catch(()=>{});
}
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
  onApply,  // (localityId, { excludeElectrical, locality }) => void
  onPendingApply, // (localityId, { excludeElectrical, locality }) => void — apply once offices verify
  initialAddress = "",
}) {
  const { sessionToken,currentUser } = useAuth();

  const searchVersion=useRef(0);
  const serviceFails=useRef(0);
  const pendingSearch=useRef(null),pendingDraft=useRef(null);
  const openRef=useRef(isOpen);openRef.current=isOpen;
  useEffect(()=>()=>{openRef.current=false;searchVersion.current++;},[]);
  const [address, setAddressRaw] = useState("");
  const [searching, setSearching] = useState(false);
  const [recentAddresses, setRecentAddresses] = useState(() => loadRecentAddresses());
  const [slowSearch, setSlowSearch] = useState(false);

  const [firstRun, setFirstRun] = useState(() => { try { return localStorage.getItem("permitting_first_run_done") !== "1"; } catch { return true; } });
  const [showOptions, setShowOptions] = useState(() => { try { return localStorage.getItem("permitting_show_options") === "1"; } catch { return false; } });
  const [advanced, setAdvanced] = useState(() => { try { return localStorage.getItem("permitting_advanced_view") === "1"; } catch { return false; } });
  const [result, setResult] = useState(null); // address location and reference research
  const [error, setError] = useState("");
  const [excludeElectrical, setExcludeElectrical] = useState(() => { try { return localStorage.getItem("permitting_exclude_electrical") === "1"; } catch { return false; } });
  const [selectedLocalityId, setSelectedLocalityId] = useState("");
  const [repositoryJurisdictions, setRepositoryJurisdictions] = useState([]);
  const [repositoryLoading, setRepositoryLoading] = useState(false);
  const [repositoryError, setRepositoryError] = useState("");
  const [repositoryRetry, setRepositoryRetry] = useState(0);
  const [draftCandidate, setDraftCandidate] = useState(null);
  // When official boundary sources disagree, the resolver returns candidates
  // instead of a target — the user picks one, which then behaves exactly like
  // a detected target for office matching and admin drafts.
  const [pickedCandidate, setPickedCandidate] = useState(null);
  const [rememberForCity, setRememberForCity] = useState(false);
  useEffect(() => { setPickedCandidate(null); }, [result]);
  const [repositoryDraftId,setRepositoryDraftId]=useState("");
  const [draftCreateError, setDraftCreateError] = useState("");
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [multiMode, setMultiMode] = useState(false);
  const [multiResults, setMultiResults] = useState([]);
  const [autoSearchNonce, setAutoSearchNonce] = useState(0);
  const [multiRunning, setMultiRunning] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(null);
  // A new or edited address invalidates an earlier "Use my location" fix — the >500ft warning must never compare fresh coordinates against a stale pin.
  const setAddress = (v) => { setAddressRaw(v); setGpsCoords(null); };
  const [suggestions, setSuggestions] = useState([]);
  const suggestionReq = useRef(0);
  // Styled confirms replace window.confirm/alert — a pending ask renders an
  // AlertDialog and resolves with the picked action's value ('cancel' on dismiss).
  const [confirmUi, setConfirmUi] = useState(null);
  const confirmResolve = useRef(null);
  const askConfirm = (ui) => {
    try { if (localStorage.getItem("permitting_skip_confirms") === "1" && ui?.skipValue !== undefined) return Promise.resolve(ui.skipValue); } catch {}
    return new Promise((resolve) => { confirmResolve.current = resolve; setConfirmUi(ui); });
  };
  const answerConfirm = (value) => { setConfirmUi(null); const r = confirmResolve.current; confirmResolve.current = null; r?.(value); };
  useEffect(() => {
    const q = address.trim();
    if (!sessionToken || q.length < 4 || result || searching) { setSuggestions([]); return; }
    const reqId = ++suggestionReq.current;
    const t = setTimeout(async () => {
      try {
        const { data } = await base44.functions.invoke('findLocalityByAddress', { action: 'places_autocomplete', input: q, session_token: sessionToken });
        if (reqId === suggestionReq.current) setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
      } catch { /* suggestions are a convenience — never block the field */ }
    }, 350);
    return () => clearTimeout(t);
  }, [address, result, searching, sessionToken]);
  const [scanningQR, setScanningQR] = useState(false);
  const scanVideoRef = useRef(null);
  const scanStreamRef = useRef(null);
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
    let timer = 0;
    setRepositoryLoading(true);
    setRepositoryError("");

    const attempt = (n) => loadAllEntityRows({
      entity: staffEntities.JurisdictionProfile,
      sort: "name",
      label: "Permitting locality picker repository",
      cacheTtlMs: 60000,
    }).then((rows) => {
      if (!cancelled) setRepositoryJurisdictions(Array.isArray(rows) ? rows : []);
      if (!cancelled) setRepositoryLoading(false);
    }).catch((e) => {
      console.error("Could not load saved jurisdictions in locality picker:", e);
      // The shared entity-read budget refills on a rolling window — spaced
      // retries outlast a busy stretch instead of failing on the first dip.
      if (!cancelled && n < 3) { timer = setTimeout(() => attempt(n + 1), 7000 * (n + 1)); return; }
      if (!cancelled) { setRepositoryError("Could not load the saved offices list — you can still select a configured office."); setRepositoryLoading(false); }
    });
    attempt(0);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [isOpen, repositoryRetry]);

  // Fast path: the full repository catalog pages in slowly under rate limits,
  // but the match card only needs the few profiles sharing this result's
  // name/state. A filtered read (one small page) surfaces them right away;
  // the full catalog still loads for the manual pick list and double checks.
  useEffect(() => {
    if (!isOpen || !result) return undefined;
    const names = [...new Set([
      result.suggested_locality?.name,
      result.ai_locality_name,
      result.ai_county ? (/county$/i.test(result.ai_county) ? result.ai_county : `${result.ai_county} County`) : "",
    ].map((v) => String(v || "").trim()).filter(Boolean))];
    if (!names.length) return undefined;
    let cancelled = false;
    (async () => {
      for (const name of names) {
        try {
          const rows = await loadAllEntityRows({
            entity: staffEntities.JurisdictionProfile,
            query: { name },
            sort: "name",
            limit: 50,
            label: `Repository fast-match ${name}`,
            cacheTtlMs: 15000,
          });
          if (cancelled || !Array.isArray(rows) || !rows.length) continue;
          setRepositoryJurisdictions((prev) => {
            const seen = new Set(prev.map((row) => row.id));
            const extra = rows.filter((row) => !seen.has(row.id));
            return extra.length ? [...prev, ...extra] : prev;
          });
        } catch { /* the full-catalog load still covers this — a fast-match miss is not an error */ }
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, result]);

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
      // Address lookups go straight to the resolver — they are not scan
      // actions and must not register rows in Scan activity.
      const invoke=(name,payload)=>base44.functions.invoke(name,payload);
      const lookup=payload=>invoke('resolvePermittingAddress',payload,`Looking up ${address.trim()}`);
      let data;
      // Patient retry: the app shares one function budget, so 429s come in
      // bursts. Wait out a burst (up to ~22s) before giving up on the user.
      const retryDelays=[4000,6000,8000];
      for(let attempt=0;;attempt++){
        try{ ({ data } = await lookup({ address: normalizeAddress(address), session_token: sessionToken })); break; }
        catch(callErr){
          const m=String(callErr?.message||"");
          const retriable=/status code (429|5\d\d)/.test(m);
          if(!retriable||attempt>=retryDelays.length)throw callErr;
          if(version!==searchVersion.current||!openRef.current)return;
          await new Promise(r=>setTimeout(r,retryDelays[attempt]));
        }
      }
      // "Address lookup is busy" — the resolver's own queue guard. Wait and
      // retry instead of making the user press Find again.
      for(let busy=0;data?.success===false&&Number(data?.retry_after_ms)>0&&busy<6;busy++){
        if(version!==searchVersion.current||!openRef.current)return;
        await new Promise(r=>setTimeout(r,Math.min(Number(data.retry_after_ms)||3000,8000)));
        try{({data}=await lookup({address:normalizeAddress(address),session_token:sessionToken}));}catch{break;}
      }
      // The worker cannot reach external geocoders reliably; when its lookups
      // all fail, geocode from the browser and resubmit the coordinates.
      if (data?.success !== false && !data?.geocode && data?.geocoding_service?.issue) {
        try {
          const hint = await geocodeInBrowser(address);
          if (hint) {
            const retry = await invoke('resolvePermittingAddress', {
              address: normalizeAddress(address), session_token: sessionToken, census_hint: hint,
            },`Looking up ${address.trim()}`);
            if (retry?.data?.success !== false) data = retry.data;
          }
        } catch { /* browser geocode is best-effort */ }
      }
      if(version!==searchVersion.current||!openRef.current)return;
      if (data?.success === false) {
        setError(/busy|try again/i.test(String(data?.error||""))
          ? "A lookup is already running — wait a few seconds and press Find my office again."
          : (data.error || "Search failed"));
      } else {
        setResult(data);
        setError("");
        if(data){serviceFails.current=0;}
        if(data?.suggested_locality||data?.geocode){rememberAddress(address.trim());setRecentAddresses(loadRecentAddresses());}
        if (data?.suggested_locality?.id) {
          setSelectedLocalityId(data.suggested_locality.id);
        }
      }
    } catch (e) {
      if(version!==searchVersion.current||!openRef.current)return;
      serviceFails.current=(serviceFails.current||0)+1;
      // Two failures → one last try from the browser before telling the user.
      if(serviceFails.current>=2){
        try{
          const hint=await geocodeInBrowser(address);
          if(hint){
            const retry=await invoke('resolvePermittingAddress',{address:normalizeAddress(address),session_token:sessionToken,census_hint:hint},`Looking up ${address.trim()}`);
            const d=retry?.data;
            if(d&&d.success!==false){
              setResult(d);setError("");serviceFails.current=0;
              if(d.suggested_locality?.id)setSelectedLocalityId(d.suggested_locality.id);
              if(pendingSearch.current===version)pendingSearch.current=null;
              if(version===searchVersion.current&&openRef.current)setSearching(false);
              return;
            }
          }
        }catch{ /* fall through to the error below */ }
      }
      const busy429=/status code 429/.test(String(e?.message||""));
      setError(serviceFails.current>=2
        ? "The lookup service is temporarily unavailable — try again in a minute, or select a saved office below."
        : busy429
          ? "The system is busy — wait a few seconds and press Find my office again."
          : /status code 5\d\d/.test(String(e?.message||""))
            ? "The lookup service encountered an error — try again, or select a saved office below."
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
  // The address was pin-verified inside a boundary but the offices are not
  // staff-checked — allow a deliberate "use it anyway" so the job isn't
  // dead-ended. The applied lines keep their needs-check badges downstream.
  const addressNeedsCheck=Boolean(address.trim()&&result?.suggested_locality&&!result.apply_allowed&&result?.location_resolution?.status==='location_verified'&&selectedLocalityId===result?.suggested_locality?.id);
  // Apply needs the full locality row — a stale `localities` prop that lacks it
  // silently no-ops downstream. Fetch on demand so the apply can't die quietly.
  const fullLocalityForApply = async () => {
    if (selectedLocality) return selectedLocality;
    const rows = await loadAllEntityRows({ entity: staffEntities.PermitLocality, query: { id: selectedLocalityId }, label: 'Locality apply lookup' }).catch(() => null);
    return rows?.[0] || null;
  };

  const handleApply = async () => {
    if (!openRef.current || !selectedLocalityId || searching || !(addressCanApply||addressNeedsCheck)) return;
    if (addressNeedsCheck) {
      const name = result?.suggested_locality?.name || "this office";
      const choice = await askConfirm({
        title: `Use ${name} before its offices are verified?`,
        body: "Live office research is running for this jurisdiction. You can let it apply automatically once the offices verify, or use it now — its permit lines will be marked “needs review” until verified.",
        actions: [
          { value: 'wait', label: 'Apply when verified', tone: 'outline' },
          { value: 'now', label: 'Use anyway — needs review', tone: 'primary' },
        ],
        skipValue: 'now',
      });
      if (choice === 'cancel' || !openRef.current) return;
      if (choice === 'wait') {
        const locRow = await fullLocalityForApply();
        onPendingApply?.(selectedLocalityId, { excludeElectrical, locality: locRow });
        onClose();
        return;
      }
    }
    // Unverified picks get one deliberate pause — address-flow applies are
    // already gated on a verified review; repository picks may not be.
    if (!address.trim() && selectedAuthority.officeCount === 0) {
      const name = selectedLocality?.name || "this office";
      const ok = await askConfirm({
        title: `${name} is not yet verified`,
        body: "Permit offices and contact info may be incomplete. Use it anyway?",
        actions: [{ value: 'yes', label: 'Use anyway', tone: 'primary' }],
        skipValue: 'yes',
      });
      if (ok !== 'yes' || !openRef.current) return;
    }
    const locRow = await fullLocalityForApply();
    onApply(selectedLocalityId, { excludeElectrical, locality: locRow });
    // First-few-applies reassurance — a small visible win while the workflow is
    // still new to the staff member. Stops after the third apply.
    try {
      const count = (parseInt(localStorage.getItem("permitting_apply_count") || "0", 10) || 0) + 1;
      localStorage.setItem("permitting_apply_count", String(count));
      if (count <= 3 && openRef.current) {
        await askConfirm({
          title: count === 1 ? "Office linked to this job" : "Office linked",
          body: count === 1 ? "Next: enter the dates below or contact the office." : "",
          actions: [{ value: 'ok', label: 'OK', tone: 'primary' }],
          skipValue: 'ok',
          hideCancel: true,
        });
      }
    } catch {}
    onClose();
  };

  const repositoryMatches = result
    ? findRepositoryJurisdictionMatches(repositoryJurisdictions, result)
    : [];

  // When a boundary-verified address resolves to a jurisdiction that has no
  // tracker locality yet, an admin may still create a draft — but only for the
  // profile matching the detected name/type/county, never a same-name sibling.
  const detectedTarget = result?.location_resolution?.target || pickedCandidate;
  // needs_review means the boundary resolved a town/county but the pin wasn't
  // exact — a draft record (which stays review-flagged downstream) is still
  // the honest next step, so admins may create one there too.
  const isDetectedCandidate = (j) => {
    if (!j || !detectedTarget || !['location_verified', 'needs_review'].includes(result?.location_resolution?.status) || result?.suggested_locality) return false;
    const typeMap = { municipality: ['city', 'village', 'municipality'], township: ['township'], county: ['county'] };
    const countyOf = (v) => String(v || '').toLowerCase().replace(/\s*county$/u, '').trim();
    // Records explicitly marked as superseded duplicates are dead identity —
    // they must not match or count as candidates (same rule the bridge uses).
    if (String(j.duplicate_of || '').trim()) return false;
    // Tombstoned historical records (paper/remnant jurisdictions kept for
    // audit) are dead identity too — never a draft candidate.
    if (String(j.verification_status || '').toLowerCase() === 'historical') return false;
    return (typeMap[detectedTarget.type] || [detectedTarget.type]).includes(String(j.type || '').toLowerCase())
      && normalizePermitJurisdictionName(j.name) === normalizePermitJurisdictionName(detectedTarget.name)
      && normalizeState(j.state) === normalizeState(detectedTarget.state)
      && (!detectedTarget.county || !j.parent_county?.name || countyOf(j.parent_county.name) === countyOf(detectedTarget.county));
  };

  const requestDraftFromRepository = (jurisdiction) => {
    if(currentUser?.role!=="admin"){setDraftCreateError("Creating a new office record requires an administrator.");return;}
    if((address.trim()&&!isDetectedCandidate(jurisdiction))||creatingDraft||pendingDraft.current||!openRef.current)return;
    setDraftCreateError("");
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
        allowDuplicate:true,
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
      // Staff resolved a flagged address — mint a reusable resolution rule so
      // this pick fixes the whole pattern for future lookups, not just this one.
      mintResolutionRule({
        address, resolution: result?.location_resolution, pickedName: draftCandidate?.name || pickedCandidate?.name || locality?.name,
        pickedType: draftCandidate?.type || pickedCandidate?.type || locality?.jurisdiction_type || 'municipality',
        forCity: rememberForCity,
      });
      setSelectedLocalityId(locality.id);
      setDraftCandidate(null);
      onApply(locality.id, { excludeElectrical, locality });
      onClose();
      }});
    } catch (e) {
      if(!openRef.current||draftVersion!==searchVersion.current)return;
      console.error("Could not create Permit locality draft from repository:", e);
      setDraftCreateError(e?.message || "Could not create the office record — no changes were made.");
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

  // When the Use button is greyed out, say exactly why in plain words — a dead
  // button with no reason is the top "now what?" moment in this dialog.
  const applyHint = (() => {
    if (searching) return "";
    if (selectedLocalityId && (addressCanApply || addressNeedsCheck)) return "";
    if (!address.trim()) return selectedLocalityId ? "Enter the job address above to verify this office covers that location." : "Enter the job address above to enable Use this office.";
    if (!result) return "Press Find my office to verify this address.";
    if (!result.suggested_locality) {
      const named = repositoryMatches.filter(isDetectedCandidate);
      if (named.length) {
        const nm = named[0].name + (named[0].state ? `, ${named[0].state}` : "");
        return currentUser?.role === 'admin'
          ? `We found ${nm} — press Create draft & apply next to it above.`
          : `We found ${nm} — an admin needs to press Create draft & apply above.`;
      }
      return "No office matched that location — verify the address, or ask an administrator to create the record.";
    }
    if (result.location_resolution?.status !== 'location_verified') return "The exact location is unconfirmed — the address must verify on the map before an office can be used.";
    if (selectedLocalityId && selectedLocalityId !== result.suggested_locality.id) return "The selected office does not match the searched location — run Find my office again.";
    if (!selectedLocalityId) return "No office record is selected — choose a saved office above or contact an administrator.";
    return "";
  })();

  // What the search kicked off for unverified offices — surfaced so "needs
  // review" isn't a dead end with nothing to look at.
  const officeResearchMsg = (() => {
    const s = result?.office_research?.state;
    const nm = result?.suggested_locality?.name || "this jurisdiction";
    if (s === 'queued') return `Researching ${nm}'s permit offices now — verification usually finishes within a few minutes.`;
    if (s === 'already_queued') return `${nm}'s offices are already being researched — verification usually finishes within a few minutes.`;
    if (s === 'backfill_pending') return `${nm}'s office research landed — updating its saved record now.`;
    if (s === 'research_started') return `Researching ${nm}'s permit offices right now — this usually takes a couple of minutes.`;
    if (s === 'verification_pending') return `${nm}'s offices are on file — verification is finishing up.`;
    if (s === 'verified') return `${nm}'s offices verified — ready to use.`;
    return "";
  })();

  // Live office resolution — while the picked locality's offices are being
  // researched/verified, watch the records so roles landing updates this
  // screen in place: no re-search, no manual refresh.
  const [officeWatch, setOfficeWatch] = useState({ roles: 0, offices: 0 });
  useEffect(() => {
    const locId = result?.suggested_locality?.id;
    const profId = result?.suggested_locality?.jurisdiction_profile_id;
    if (!isOpen || !addressNeedsCheck || !locId) return;
    let dead = false;
    const poll = async () => {
      try {
        const [locs, profs] = await Promise.all([
          loadAllEntityRows({ entity: staffEntities.PermitLocality, query: { id: locId }, label: 'Live office watch' }),
          profId ? loadAllEntityRows({ entity: staffEntities.JurisdictionProfile, query: { id: profId }, label: 'Live office watch' }) : Promise.resolve([]),
        ]);
        const loc = locs?.[0], prof = profs?.[0];
        if (dead || !loc) return;
        const auth = summarizeMatchedLocalityAuthority(loc);
        const allowed = auth.verified_roles.includes('sign_permit') && auth.verified_roles.includes('zoning');
        const roles = (prof?.office_research?.roles || []).length;
        setOfficeWatch({ roles, offices: (loc.offices || []).length });
        setResult(prev => prev ? {
          ...prev,
          authority_review: auth,
          apply_allowed: allowed,
          office_research: allowed ? { state: 'verified' }
            : roles && !(loc.offices || []).length ? { state: 'backfill_pending' }
            : roles ? { state: 'verification_pending' }
            : prev.office_research,
        } : prev);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 15000);
    return () => { dead = true; clearInterval(iv); };
  }, [isOpen, addressNeedsCheck, result?.suggested_locality?.id, result?.suggested_locality?.jurisdiction_profile_id]);

  // Picking a suggestion fills the field and searches immediately — same path
  // as a paste or a QR scan, so the user never presses Find after tapping.
  const pickSuggestion = (s) => {
    suggestionReq.current++;
    setSuggestions([]);
    setError("");
    searchVersion.current++; pendingSearch.current = null;
    setAddress(s.text); setResult(null); setSelectedLocalityId(''); setSearching(false);
    setAutoSearchNonce(Date.now());
  };

  return (
    <Dialog open={isOpen} onOpenChange={async (o) => {
      if (o) return;
      if (searching) {
        const ok = await askConfirm({
          title: "A lookup is still running",
          body: "Close anyway? It continues in the background.",
          actions: [{ value: 'yes', label: 'Close', tone: 'primary' }],
          skipValue: 'yes',
        });
        if (ok !== 'yes') return;
      }
      onClose();
    }}>
      <DialogContent className="flex h-[95dvh] w-[96vw] max-w-none flex-col gap-0 overflow-hidden border-none bg-slate-50 p-0">
        <DialogHeader className="border-b bg-white px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-100"><MapPin className="h-4 w-4 text-violet-600" /></span>
            Which office issues permits here?
          </DialogTitle>
        </DialogHeader>

        {firstRun&&<div className="rounded-lg border border-violet-200 bg-violet-50 mx-4 p-3 text-sm text-violet-900 flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0"/><div className="flex-1"><strong>How it works:</strong> enter the job address → we identify the jurisdiction → verify the offices → press Use this office. <span className="cursor-help border-b border-dotted border-violet-400" title='"Office" is the town, township, or county authority that issues your permit — each level differs. "Checked" means the record was verified. "Needs review" means it has not been confirmed.'>terminology</span></div><button type="button" className="text-xs font-semibold underline" onClick={()=>{setFirstRun(false);try{localStorage.setItem("permitting_first_run_done","1");}catch{}}}>Dismiss</button></div>}
        {/* Address search bar */}
        <div className="flex gap-2 items-end flex-wrap px-4">
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
                      if (text) { searchVersion.current++; pendingSearch.current = null; setAddress(text); setResult(null); setSelectedLocalityId(''); setSearching(false); setAutoSearchNonce(Date.now()); }
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
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || searching) return;
                  if (suggestions.length) { e.preventDefault(); pickSuggestion(suggestions[0]); }
                  else runSearch();
                }}
                onPaste={(e) => {
                  // Paste-and-go: if the pasted text looks like a complete
                  // street address, search immediately — zero extra clicks.
                  const text = String(e.clipboardData?.getData("text") || "").trim();
                  const looksComplete = /\d/.test(text) && /[a-zA-Z]{3,}/.test(text) && (/,/.test(text) || /\d{5}/.test(text));
                  if (looksComplete) {
                    e.preventDefault();
                    searchVersion.current++; pendingSearch.current = null;
                    setAddress(text); setResult(null); setSelectedLocalityId(''); setSearching(false);
                    setAutoSearchNonce(Date.now());
                  }
                }}
              />
            </div>
            {suggestions.length > 0 && !result && (
              <ul aria-label="Matching addresses — tap one or press Enter for the first" className="mt-1 divide-y rounded-lg border bg-white shadow-sm">
                <li className="px-3 py-1.5 text-[11px] font-semibold text-gray-500">Select your address — or press Enter for the first result:</li>
                {suggestions.map(s => (
                  <li key={s.place_id || s.text}>
                    <button
                      type="button"
                      className="min-h-11 w-full px-3 py-2 text-left hover:bg-indigo-50"
                      onClick={() => pickSuggestion(s)}
                    >
                      <span className="block text-sm font-medium text-gray-900">{s.main || s.text}</span>
                      {s.secondary && <span className="block text-xs text-gray-500">{s.secondary}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/(\bp\.?o\.?\s*box\b|\brural\s*route\b|\brr\s*\d+\b)/i.test(address) && (
              <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                That looks like a PO box or rural route — we found a postal area, not a physical sign location. Check the map pin before applying.
              </p>
            )}
            {advanced && (
              <button type="button" onClick={() => { setMultiMode(!multiMode); setMultiResults([]); }} className="text-[10px] font-semibold text-purple-600 hover:underline">
                {multiMode ? "Single address" : "Paste several addresses"}
              </button>
            )}
          </div>
          {advanced && multiMode && (
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
                          {r.locality}{r.canApply ? " — use it →" : " — needs review"}
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
              <Search className="w-4 h-4" /> Find my office
            </Button>
            <button type="button" className="min-h-11 self-center rounded-md border border-slate-200 px-2 text-xs font-bold text-slate-500 hover:bg-slate-50" title="Keyboard shortcuts"
              onClick={() => window.alert("Shortcuts:\n• Enter — search the typed address\n• Esc — close this dialog\n• Paste a full address — searches automatically")}>?</button>
            </>
          )}

          <button type="button" className="min-h-11 w-full sm:w-auto text-xs font-semibold text-violet-700 underline self-center" onClick={() => { const v = !showOptions; setShowOptions(v); try { localStorage.setItem("permitting_show_options", v ? "1" : "0"); } catch {} }}>{showOptions ? "Fewer options" : "More options…"}</button>
          <button type="button" className="min-h-11 w-full sm:w-auto text-xs font-semibold text-violet-700 underline self-center" onClick={() => { const v = !advanced; setAdvanced(v); try { localStorage.setItem("permitting_advanced_view", v ? "1" : "0"); } catch {} }}>{advanced ? "Simple view" : "Advanced view"}</button>

          {showOptions && <>
          <button type="button" className="min-h-11 w-full sm:w-auto text-xs font-semibold text-slate-600 underline self-center" onClick={() => { try { const v = localStorage.getItem("permitting_skip_confirms") !== "1"; localStorage.setItem("permitting_skip_confirms", v ? "1" : "0"); window.alert(v ? "Confirmations are now skipped." : "Confirmations are back on."); } catch {} }}>Skip confirmations</button>
          <Button
            variant="outline"
            className="gap-1 min-h-11 w-full sm:w-auto"
            title="Use my current location to find the address (works best on-site)"
            onClick={async () => {
              if (!navigator.geolocation) { setError("This device can't share its location — type the address instead."); return; }
              if (address.trim()) {
                const ok = await askConfirm({
                  title: "Use your GPS location instead?",
                  body: `This replaces the address you typed (${address.slice(0, 40)}${address.length > 40 ? '…' : ''}).`,
                  actions: [{ value: 'yes', label: 'Use my location', tone: 'primary' }],
                  skipValue: 'yes',
                });
                if (ok !== 'yes') return;
              }
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
                  setAutoSearchNonce(Date.now());
                } catch { setError("Couldn't read an address from your location — type it instead."); }
              }, () => setError("Location was blocked — allow location access or type the address."), { timeout: 15000 });
            }}
          >
            <MapPin className="w-4 h-4" /> Use my location
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
                        setAutoSearchNonce(Date.now()); return;
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
                if (!/\d/.test(text) || !/[a-zA-Z]{3,}/.test(text)) { setError("Clipboard contents do not look like a street address — copy the address first."); return; }
                searchVersion.current++; pendingSearch.current = null;
                setAddress(text); setResult(null); setSelectedLocalityId(''); setSearching(false);
                setAutoSearchNonce(Date.now());
              } catch { setError("Couldn't read the clipboard — paste into the field instead."); }
            }}
          >
            <Save className="w-4 h-4" /> Paste address
          </Button>

          {/* Electrical inspector toggle */}
          <Button
            variant="outline"
            onClick={async () => {
              if (!excludeElectrical) {
                const ok = await askConfirm({
                  title: "Hide electrical inspectors on this job?",
                  body: "Only do this if the office confirmed no electrical permit is required.",
                  actions: [{ value: 'yes', label: 'Hide electrical', tone: 'primary' }],
                  skipValue: 'yes',
                });
                if (ok !== 'yes') return;
              }
              setExcludeElectrical(v => { const next = !v; try { localStorage.setItem("permitting_exclude_electrical", next ? "1" : "0"); } catch {} return next; });
            }}
            className={`gap-1 min-h-11 w-full sm:w-auto ${excludeElectrical ? 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100' : 'border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
            title={excludeElectrical ? "Electrical Inspectors will be hidden/excluded" : "Electrical Inspectors will be included"}
          >
            {excludeElectrical ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            {excludeElectrical ? "Electrical: OFF" : "Electrical: ON"}
          </Button>
          </>}
        </div>

        {slowSearch && searching && (
          <div className="bg-blue-50 border border-blue-200 rounded mx-4 p-2 text-sm text-blue-800">
            This lookup is taking longer than usual — it can hang on slow government sites. You can keep waiting, or cancel and try again.
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded mx-4 p-2 text-sm text-red-700 flex items-start gap-2">
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
          <div className="flex flex-wrap gap-1.5 items-center px-4">
            <span className="text-[10px] text-gray-500 font-medium">Recent:</span>
            {recentAddresses.map((addr) => (
              <button type="button" key={addr} title={addr}
                onClick={() => { searchVersion.current++; pendingSearch.current = null; setAddress(addr); setResult(null); setSelectedLocalityId(''); setSearching(false); setAutoSearchNonce(Date.now()); }}
                className="text-[11px] text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2.5 py-1 hover:bg-violet-100 max-w-[240px] truncate">
                {addr}
              </button>
            ))}
          </div>
        )}

        {/* Responsive split: stacked on smaller screens, two columns on desktop. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-4 pb-2 lg:grid-cols-[520px_minmax(0,1fr)] lg:overflow-hidden">
          <div className="w-full space-y-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <AddressSearchSummary address={address} searching={searching} result={result} advanced={advanced}/>
            {gpsMismatch && (
              <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                Your GPS and the typed address disagree by more than 500 ft — verify which location is the actual job site before applying.
              </p>
            )}
            {(result?.suggested_locality||result?.ai_locality_name)&&<section aria-label="Picked office" className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 shadow-sm"><p className="text-xs text-gray-500">Matched jurisdiction</p><p className="font-semibold">{result.suggested_locality?.name||result.ai_locality_name}{(result.suggested_locality?.state||result.ai_state)?", "+(result.suggested_locality?.state||result.ai_state):""}</p><p className="text-xs text-gray-600">{result.apply_allowed?"Match found — review the office notes below, then press Use this office.":result.suggested_locality?"Jurisdiction identified — the offices are not yet verified; you can still use it and the permit lines will be marked needs review.":"Jurisdiction identified — no office record is configured yet. An administrator can create one from the saved offices list below."}</p></section>}
            {advanced && <details className="rounded-xl border border-slate-200 bg-white shadow-sm"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">Search activity</summary><div className="p-3 pt-0"><ResearchProgressBar inline /></div></details>}
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
                    {selectedLocality && <p className="text-xs mt-2">{selectedAuthority.officeCount>0?`${selectedAuthority.officeCount} office(s) verified.`:"Office coverage is not yet verified."}</p>}
                    <details><summary className="min-h-11 py-2 text-xs cursor-pointer">Office verification details</summary>
                    {selectedLocality && (
                      selectedAuthority.officeCount > 0 ? (
                        <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-900">
                          <div className="flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {selectedAuthority.officeCount} office(s) verified
                          </div>
                          <p className="mt-0.5">{selectedAuthority.labels.join(" • ")}</p>
                          <p className="mt-1 text-emerald-800">These offices are verified. Any others listed remain unconfirmed.</p>
                          {selectedAuthority.coverage_status === "partial" && (
                            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
                              <p className="font-semibold">Pending verification: {selectedAuthority.other_office_count} office(s).</p>
                              {selectedAuthority.reviewLabels.length > 0 && <p className="mt-1">Offices pending verification: {selectedAuthority.reviewLabels.join(" • ")}</p>}
                            </div>
                          )}
                          {selectedAuthority.coverage_status === "configured_offices_reviewed" && (
                            <p className="mt-2 text-gray-700">All known offices are verified — coverage may still be incomplete.</p>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                          <div className="flex items-center gap-1 font-semibold">
                            <AlertTriangle className="h-3.5 w-3.5" /> No offices verified yet
                          </div>
                          <p className="mt-1">This jurisdiction can still be used, but no office has been confirmed as the permit authority.</p>
                          {selectedAuthority.reviewLabels.length > 0 && <p className="mt-1">Offices pending verification: {selectedAuthority.reviewLabels.join(" • ")}</p>}
                        </div>
                      )
                    )}
                    {selectedLocality && <ElectricalAuthorityCoverage authority={selectedAuthority} selectionContext="manual" />}
                    </details>
                  </div>
                )}

            {selectedLocalityId && !address.trim() && currentUser?.role!=='admin' && <p role="status" className="rounded border bg-blue-50 p-3 text-sm">Enter the job address above to verify its location before using this office.</p>}
            {advanced&&currentUser?.role==='admin'&&!address.trim()&&<section aria-label="Manual repository draft" className="rounded border bg-violet-50 p-3 space-y-2">
              <h4 className="font-semibold text-sm">Create an office record from the repository</h4>
              <p className="text-xs">This creates a draft — it does not verify the address or confirm the office.</p>
              {repositoryError&&<p role="alert" className="text-xs text-red-700">{repositoryError} <button type="button" className="font-semibold underline" onClick={()=>setRepositoryRetry(n=>n+1)}>Try again</button></p>}
              <label className="block text-xs">Saved office record
                <select aria-label="Repository jurisdiction for draft" className="block w-full min-h-11 border rounded bg-white" value={repositoryDraftId} disabled={repositoryLoading||Boolean(repositoryError)||creatingDraft} onChange={event=>{setRepositoryDraftId(event.target.value);setDraftCandidate(null);}}>
                  <option value="">{repositoryLoading?'Loading saved offices…':'Select a saved office record'}</option>
                  {repositoryJurisdictions.map(row=><option key={row.id} value={row.id} disabled={hasDuplicateRepositoryIdentity(repositoryJurisdictions,row)}>{row.name} · {row.state || 'State unknown'} · {row.type || 'Type unknown'}{row.parent_county?.name?' · '+row.parent_county.name+' County':''}{hasDuplicateRepositoryIdentity(repositoryJurisdictions,row)?' · two copies — needs a fix':''}</option>)}
                </select>
              </label>
              <Button type="button" disabled={!repositoryDraftId||creatingDraft||repositoryLoading||Boolean(repositoryError)} onClick={()=>{const matches=repositoryJurisdictions.filter(row=>row.id===repositoryDraftId);if(matches.length===1)requestDraftFromRepository(matches[0]);}}>Review draft before creating</Button>
            </section>}
            {/* Editing the field clears the result (see onChange), so a result on screen always matches the address shown. */}
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
                    <h4 className="font-semibold text-sm">{result.suggested_locality ? "Location verified" : "Address verification incomplete"}</h4>
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
                        return <p className="text-[11px] text-green-700 mt-0.5" title="Each level is distinct — city, township, and county are separate offices.">{chain.join(' → ')}</p>;
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
                      <details open={addressNeedsCheck || undefined}><summary className="min-h-11 py-2 text-sm cursor-pointer">Office verification details</summary>
                      <div className={`mt-2 rounded border px-2.5 py-2 text-[11px] ${addressAuthority?.status === 'staff_verified_roles' ? 'border-emerald-200 bg-white/70 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                        <div className="flex items-center gap-1 font-semibold">
                          {addressAuthority?.status === 'staff_verified_roles' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                          Permit offices: {addressAuthority?.status === 'staff_verified_roles' ? 'verified' : 'not yet verified'}
                        </div>
                        {addressNeedsCheck && (
                          <p className="mt-1 flex items-center gap-1 text-amber-800">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Live — watching for updates{officeWatch.roles ? `, ${officeWatch.roles} office role${officeWatch.roles === 1 ? '' : 's'} found` : ''}{officeWatch.offices ? `, ${officeWatch.offices} office${officeWatch.offices === 1 ? '' : 's'} saved` : ''}. This updates automatically.
                          </p>
                        )}
                        {addressAuthority?.status === 'staff_verified_roles' ? (
                          <>
                            <p className="mt-0.5">{addressAuthorityLabels.join(" • ")}</p>
                            <p className="mt-1 text-emerald-800">Location verified on the map. The offices above were verified separately.</p>
                          </>
                        ) : (
                          <p className="mt-1">Locating the address does not prove which office handles sign, zoning, building, or electrical permits.</p>
                        )}
                        {addressAuthority?.coverage_status === 'partial' && (
                          <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
                            <p className="font-semibold">Pending verification: {addressAuthority.other_office_count} office(s).</p>
                            {addressRolesNeedingReview.length > 0 && (
                              <p className="mt-1">Offices pending verification: {addressRolesNeedingReview.join(" • ")}</p>
                            )}
                          </div>
                        )}
                        <ElectricalAuthorityCoverage authority={addressAuthority} selectionContext="address" />
                        {addressAuthority?.coverage_status === 'configured_offices_reviewed' && (
                          <p className="mt-2 text-gray-700">All known offices are verified — coverage may still be incomplete.</p>
                        )}
                        {addressAuthority?.coverage_status === 'not_verified' && addressRolesNeedingReview.length > 0 && (
                          <p className="mt-2 text-amber-900">Offices pending verification: {addressRolesNeedingReview.join(" • ")}</p>
                        )}
                      </div>
                      </details>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-amber-900"><strong>{result.geocoding_service?.issue ? (result.geocoding_service.fallback_used ? 'Primary map service unavailable — a fallback provider found the general area.' : 'Our map tool had a problem.') : result.location_resolution?.status==='location_verified' ? 'Location found — offices are pending verification.' : 'The exact location could not be determined.'}</strong></p>
                      <p className="text-xs text-amber-800 mt-2">{result.automatic_scan?.started ? 'Automated research has started on the jurisdiction website — results still require verification.' : 'Additional research tools are available below.'} No manual selection is required.</p>
                      {advanced && result.match_reason && (
                        <p className="text-[11px] text-amber-800 mt-1">{result.match_reason}</p>
                      )}
                    </div>
                  )}
                </div>

                {advanced && <AutomaticAddressScanResults scanResult={result.automatic_scan} archives={result.address_archives}/>}
                {currentUser?.role==='admin'&&result&&<details className="rounded border bg-gray-50 p-2 text-[10px]"><summary className="cursor-pointer font-semibold text-gray-600">Show technical details</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({geocoding_service:result.geocoding_service,location_resolution:result.location_resolution,authority_review:result.authority_review,match_confidence:result.match_confidence,match_method:result.match_method,apply_allowed:result.apply_allowed},null,2)}</pre></details>}
                {result.suggested_locality && !result.apply_allowed && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">Location found. Sign and zoning offices are not yet verified — you can still use it, and the lines will be marked needs review.</p>}
                {/* Boundary conflict — the official map services disagree. Show every
                    candidate they returned so the user picks; never auto-pick. */}
                {!result.suggested_locality && Array.isArray(result?.location_resolution?.candidates) && result.location_resolution.candidates.length > 0 && (
                  <div className="border rounded-lg p-3 bg-sky-50 border-sky-200 space-y-2">
                    <div>
                      <h4 className="font-semibold text-sm text-sky-950">Pick the right place</h4>
                      <p className="text-[11px] text-sky-800 mt-0.5">
                        The map services disagree about this location — select the correct place, and the office list below will update to match.
                      </p>
                    </div>
                    {result.location_resolution.candidates.map((c, i) => (
                      <div key={i} className="rounded-md border border-sky-200 bg-white p-2.5 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{c.name}{c.state ? `, ${c.state}` : ""}</p>
                          <p className="text-[11px] text-gray-500 capitalize">{c.type}{c.type !== 'county' && c.county ? ` • in ${c.county}` : ""}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {c.inside_sources?.length ? `Inside: ${c.inside_sources.join(' + ')}` : 'Not inside the pin'}
                            {c.supported_by?.some((s) => !c.inside_sources?.includes(s)) ? ` · only listed by: ${c.supported_by.filter((s) => !c.inside_sources?.includes(s)).join(' + ')}` : ''}
                          </p>
                        </div>
                        <Button type="button" size="sm" variant={pickedCandidate === c ? "default" : "outline"}
                          onClick={() => setPickedCandidate((prev) => (prev === c ? null : c))}
                          className="h-7 text-xs border-sky-300 flex-shrink-0">
                          {pickedCandidate === c ? "Picked" : "Use this one"}
                        </Button>
                      </div>
                    ))}
                    <label className="flex items-start gap-2 text-[11px] text-sky-900 cursor-pointer pt-1">
                      <input type="checkbox" checked={rememberForCity} onChange={(e) => setRememberForCity(e.target.checked)} className="mt-0.5" />
                      <span>
                        Remember this for every address that says "{String(address).split(",")[1]?.trim() || "this city"}" in this county.
                        <span className="block text-[10px] text-sky-700">Unchecked = just this one address. Only check if every address with that city name really belongs to the picked place.</span>
                      </span>
                    </label>
                  </div>
                )}
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
                        <span>{repositoryError} <button type="button" className="font-semibold underline" onClick={()=>setRepositoryRetry(n=>n+1)}>Try again</button></span>
                      </div>
                    )}

                    {!repositoryLoading && !repositoryError && repositoryMatches.length === 0 && (
                      <p className="text-xs text-violet-700">No matching repository profile was found.</p>
                    )}

                    {repositoryMatches.map((jurisdiction) => {
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
                              disabled={creatingDraft || (currentUser?.role === 'admin' && Boolean(address.trim()) && !isDetectedCandidate(jurisdiction))}
                              title={currentUser?.role!=="admin"?"Copies a ready-made message for an administrator":"Create a draft office record and use it"}
                              onClick={() => {
                                if (currentUser?.role !== 'admin') {
                                  navigator.clipboard?.writeText(`Please set up the permitting office for ${jurisdiction.name}${jurisdiction.state ? ', ' + jurisdiction.state : ''}${jurisdiction.parent_county?.name ? ' (' + jurisdiction.parent_county.name + ' County)' : ''} — the address picker found it but only an admin can create the record.`).catch(() => {});
                                  setDraftCreateError("Copied — send that note to an administrator to create this office record.");
                                  return;
                                }
                                requestDraftFromRepository(jurisdiction);
                              }}
                              className="h-7 text-xs border-violet-300 text-violet-800 hover:bg-violet-100 flex-shrink-0"
                            >
                              {currentUser?.role === 'admin' ? "Create draft & apply" : "Ask an admin to set up"}
                            </Button>
                          </div>
                          {duplicate ? (
                            <p className="text-[11px] text-amber-700 mt-1.5 flex items-start gap-1">
                              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> Two saved entries look the same — you'll use this exact copy. An admin should still clean up the double.
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
            {advanced && <details className="rounded-xl border border-slate-200 bg-white shadow-sm"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">Review and research tools</summary><div className="p-3 pt-0"><SelectorScanActions key={selectedLocalityId || result?.geocode?.display_name || result?.ai_locality_name || 'empty'} locality={selectedLocality} result={result} profiles={repositoryJurisdictions} loading={repositoryLoading} unavailable={repositoryError} onProfileUpdated={profile=>setRepositoryJurisdictions(prev=>prev.some(row=>row.id===profile.id)?prev.map(row=>row.id===profile.id?profile:row):[...prev,profile])}/></div></details>}
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
                if (parts.length) { setAddress(parts.join(', ')); setResult(null); setSelectedLocalityId(''); setSearching(false); setAutoSearchNonce(Date.now()); }
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
            {draftCandidate && result?.location_resolution?.status === 'needs_review' && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">The map found the area but not the exact location — verify the map pin is the correct property before filing.</div>
            )}
            {draftCandidate && hasDuplicateRepositoryIdentity(repositoryJurisdictions, draftCandidate) && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">Heads up: another saved entry has the same name — you're using this exact copy. An admin should still clean up the double later.</div>
            )}
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

        {/* Styled confirm — replaces window.confirm/alert for apply gates,
            GPS override, electrical toggle and the office-linked notice. */}
        <AlertDialog open={!!confirmUi} onOpenChange={(open) => { if (!open) answerConfirm('cancel'); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmUi?.title}</AlertDialogTitle>
              {confirmUi?.body ? <AlertDialogDescription>{confirmUi.body}</AlertDialogDescription> : null}
            </AlertDialogHeader>
            <AlertDialogFooter>
              {confirmUi?.hideCancel ? null : <AlertDialogCancel onClick={() => answerConfirm('cancel')}>Cancel</AlertDialogCancel>}
              {(confirmUi?.actions || []).map((a) => (
                <AlertDialogAction
                  key={a.value}
                  onClick={() => answerConfirm(a.value)}
                  className={a.tone === 'primary' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-white text-purple-700 border border-purple-300 hover:bg-purple-50'}
                >
                  {a.label}
                </AlertDialogAction>
              ))}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t px-4 pb-3 pt-3">
          <div className="text-[11px] text-gray-500">
            {applyHint && <span className="block text-xs font-medium text-slate-600 mb-0.5">{applyHint}</span>}
            {addressNeedsCheck && officeResearchMsg && (
              <span className="block text-xs font-medium text-amber-700 mb-0.5">
                <Loader2 className="inline h-3 w-3 animate-spin mr-1 -mt-0.5" />
                {officeResearchMsg}
                {(officeWatch.roles > 0 || officeWatch.offices > 0) && (
                  <span className="text-amber-800"> {officeWatch.roles > 0 && `${officeWatch.roles} office role${officeWatch.roles === 1 ? '' : 's'} found`}{officeWatch.roles > 0 && officeWatch.offices > 0 ? ' — ' : ''}{officeWatch.offices > 0 && `${officeWatch.offices} saved`}.</span>
                )}
              </span>
            )}
            {excludeElectrical ? "🚫 Electrical Inspectors will be excluded" : "⚡ Electrical Inspectors will be included"}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={onClose} className="gap-1 flex-1 sm:flex-none">
              <X className="w-4 h-4" /> Close
            </Button>
            <Button
              onClick={handleApply}
              aria-label="Use the picked office" disabled={!selectedLocalityId || searching || !(addressCanApply||addressNeedsCheck)}
              className="bg-purple-600 hover:bg-purple-700 gap-1 flex-1 sm:flex-none"
            >
              <Save className="w-4 h-4" /> {addressNeedsCheck ? "Use anyway — needs review" : (() => { const n = selectedLocality?.name || result?.suggested_locality?.name || ""; return n ? `Use ${n.length > 22 ? n.slice(0, 22) + "…" : n}` : "Use this office"; })()}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}