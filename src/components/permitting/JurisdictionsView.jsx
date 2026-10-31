import {useResearchProgress} from "./ResearchProgressContext";
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Wand2, MapPin, Download } from "lucide-react";
import JurisdictionCard from "@/components/permitting/JurisdictionCard";
import DrainLiveFeed from "@/components/permitting/DrainLiveFeed";
import JurisdictionDetailPanel from "@/components/permitting/JurisdictionDetailPanel";
import JurisdictionFormDialog from "@/components/permitting/JurisdictionFormDialog";
import {
  appendJurisdictionActivitySafely,
  createJurisdictionIfAbsent,
  deleteJurisdictionFromLoadedSnapshot,
  jurisdictionIdentityKey,
  saveJurisdictionFromLoadedSnapshot,
} from "@/components/permitting/jurisdictionPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { isFleetCoolingDown } from "@/components/fleet/fleetInvoke";
import { assessJurisdictionTrust } from "@/components/permitting/jurisdictionTrust";
import { normalizePermitJurisdictionName } from "@/components/permitting/jurisdictionPermitBridge";
import { useAuth } from "@/components/auth/EmailGate";
import { staffEntities } from "@/components/staff/staffEntities";

const JurisdictionProfile = staffEntities.JurisdictionProfile;
const PermitLineItem = staffEntities.PermitLineItem;

export default function JurisdictionsView({ focusJurisdiction = null, onOpenJob }) {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const {runAction}=useResearchProgress();
  const [jurisdictions, setJurisdictions] = useState([]);
  const [lineCounts, setLineCounts] = useState({});
  const [permitLines, setPermitLines] = useState([]);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePicks, setComparePicks] = useState([]);
  const toggleComparePick = (j) => setComparePicks((prev) => {
    if (prev.some((p) => p.id === j.id)) return prev.filter((p) => p.id !== j.id);
    return [...prev, j].slice(-2);
  });
  const [denialCounts, setDenialCounts] = useState({});
  const [onboardingDone, setOnboardingDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem("permitting_onboarding") || "[]"); } catch { return []; }
  });
  const toggleOnboarding = (idx) => setOnboardingDone((prev) => {
    const next = prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx];
    try { localStorage.setItem("permitting_onboarding", JSON.stringify(next)); } catch {}
    return next;
  });
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return localStorage.getItem("permitting_onboarding_hidden") !== "1"; } catch { return true; }
  });
  const hideOnboarding = () => { setShowOnboarding(false); try { localStorage.setItem("permitting_onboarding_hidden", "1"); } catch {} };
  const [lastVisit] = useState(() => {
    try { const v = localStorage.getItem("permitting_jurisdictions_last_visit") || ""; localStorage.setItem("permitting_jurisdictions_last_visit", new Date().toISOString()); return v; } catch { return ""; }
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(searchTerm), 300); return () => clearTimeout(t); }, [searchTerm]);
  const [selectedJurisdiction, setSelectedJurisdiction] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingJurisdiction, setEditingJurisdiction] = useState(null);
  const [refreshingIds, setRefreshingIds] = useState(new Set());
  const [aiDiscoverLoading, setAiDiscoverLoading] = useState(false);
  const [aiDiscoverQuery, setAiDiscoverQuery] = useState("");
  const [aiDiscoverState,setAiDiscoverState]=useState("OH");
  const [trustFilter, setTrustFilter] = useState("all");
  const [repositoryNotice, setRepositoryNotice] = useState(null);

  useEffect(() => {
    loadJurisdictions();
    const interval = setInterval(() => { if (!document.hidden && !isFleetCoolingDown()) loadJurisdictions(); }, 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const name = String(focusJurisdiction?.name || "").trim();
    if (!name) return;
    setSearchTerm(name);

    const normalizedName = normalizePermitJurisdictionName(name);
    const normalizedState = String(focusJurisdiction?.state || "").trim().toLowerCase();
    const matches = jurisdictions.filter((jurisdiction) => {
      if (normalizePermitJurisdictionName(jurisdiction?.name) !== normalizedName) return false;
      if (!normalizedState) return true;
      return String(jurisdiction?.state || "").trim().toLowerCase() === normalizedState;
    });
    setSelectedJurisdiction(matches.length === 1 ? matches[0] : null);
  }, [focusJurisdiction?.name, focusJurisdiction?.state, jurisdictions]);

  const loadJurisdictions = async () => {
    try {
      const [data, lines] = await Promise.all([
        loadAllEntityRows({
          entity: JurisdictionProfile,
          sort: null,
          label: "Permitting Repository catalog",
          cacheTtlMs: 15000,
        }),
        loadAllEntityRows({ entity: PermitLineItem, sort: null, label: "Repository permit-line counts", cacheTtlMs: 15000 }).catch(() => []),
      ]);
      setJurisdictions(data);
      const counts = {};
      const denials = {};
      for (const li of lines || []) {
        const key = String(li.locality_name || "").trim().toLowerCase();
        if (key) {
          counts[key] = (counts[key] || 0) + 1;
          if (li.denial_date) denials[key] = (denials[key] || 0) + 1;
        }
      }
      setLineCounts(counts);
      setDenialCounts(denials);
      setPermitLines(lines || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleRefresh = async (jurisdiction) => {
    setRefreshingIds(prev => new Set([...prev, jurisdiction.id]));
    try {
      const res=await runAction('refreshJurisdiction',{jurisdiction_id:jurisdiction.id},`Research ${jurisdiction.name}, ${jurisdiction.state}`);
      const updated=res.data?.jurisdiction;
      if(updated){setJurisdictions(prev=>prev.map(j=>j.id===updated.id?updated:j));setSelectedJurisdiction(prev=>prev?.id===updated.id?updated:prev);}
    } catch (e) { setRepositoryNotice(e.message); }
    setRefreshingIds(prev => { const n = new Set(prev); n.delete(jurisdiction.id); return n; });
  };

  const handleSave = async (formData) => {
    if (editingJurisdiction?.id) {
      const updated = await saveJurisdictionFromLoadedSnapshot({
        entity: JurisdictionProfile,
        jurisdiction: editingJurisdiction,
        formData,
        label: `Jurisdiction ${editingJurisdiction.name || editingJurisdiction.id}`,
      });
      setJurisdictions(prev => prev.map(j => j.id === updated.id ? updated : j));
      if (selectedJurisdiction?.id === updated.id) setSelectedJurisdiction(updated);
    } else {
      const result = await createJurisdictionIfAbsent({
        entity: JurisdictionProfile,
        data: formData,
        label: `Jurisdiction ${formData.name || "create"}`,
      });
      const created = result.record;
      if (result.status === "existing" || result.status === "concurrent_duplicate_discarded") {
        setRepositoryNotice({
          tone: "warning",
          text: `${created.name}, ${created.state || ""} already exists. The existing profile was loaded instead of creating a duplicate.`,
        });
      } else {
        setRepositoryNotice({ tone: "success", text: `${created.name}, ${created.state || ""} was added to the Jurisdiction Repository.` });
      }
      setJurisdictions(prev => prev.some(j => j.id === created.id) ? prev.map(j => j.id === created.id ? created : j) : [created, ...prev]);
      setSelectedJurisdiction(created);
    }
    setShowForm(false);
    setEditingJurisdiction(null);
  };

  const handleEdit = (jurisdiction) => {
    setEditingJurisdiction(jurisdiction);
    setShowForm(true);
  };

  const handleVerificationChange = async (jurisdiction, status, notes = "") => {
    if (!jurisdiction?.id) throw new Error("This jurisdiction is no longer loaded. Reload before changing verification status.");
    const trust = assessJurisdictionTrust(jurisdiction, duplicateCountFor(jurisdiction));
    if (status === "verified" && trust.verificationBlocked) {
      throw new Error("Resolve duplicate, placeholder, or unusable-source issues before marking this jurisdiction verified.");
    }

    const formData = {
      verification_status: status,
      verification_notes: notes.trim(),
    };
    if (status === "verified") {
      formData.verified_at = new Date().toISOString();
      formData.verified_by = currentUser?.full_name || currentUser?.email || "CCS Staff";
    }

    const updated = await saveJurisdictionFromLoadedSnapshot({
      entity: JurisdictionProfile,
      jurisdiction,
      formData,
      label: `Jurisdiction verification ${jurisdiction.name || jurisdiction.id}`,
    });

    const actor = currentUser?.full_name || currentUser?.email || "CCS Staff";
    let finalRecord = updated;
    try {
      finalRecord = await appendJurisdictionActivitySafely({
        entity: JurisdictionProfile,
        jurisdictionId: updated.id,
        entry: {
          id: `verification_${Date.now()}`,
          action: "manual_edit",
          description: `Verification status changed to ${status.replaceAll("_", " ")}.`,
          user: actor,
          timestamp: new Date().toISOString(),
          changes: {
            verification_status: status,
            verification_notes: notes.trim(),
          },
        },
        label: `Jurisdiction verification history ${jurisdiction.name || jurisdiction.id}`,
      });
    } catch (activityError) {
      console.error("Jurisdiction verification saved but activity history append failed:", activityError);
    }

    setJurisdictions(prev => prev.map(j => j.id === finalRecord.id ? finalRecord : j));
    if (selectedJurisdiction?.id === finalRecord.id) setSelectedJurisdiction(finalRecord);
    return finalRecord;
  };

  const handleOfficeResearchSave = async (jurisdiction, officeResearch) => {
    if (!jurisdiction?.id || !officeResearch || !Array.isArray(officeResearch.roles))
      throw new Error("The selected jurisdiction research draft is unavailable. Reload before saving.");
    const actor = currentUser?.full_name || currentUser?.email || "CCS Staff";
    const updated = await saveJurisdictionFromLoadedSnapshot({
      entity: JurisdictionProfile,
      jurisdiction,
      formData: { office_research: officeResearch },
      label: `Office research ${jurisdiction.name || jurisdiction.id}`,
    });
    let finalRecord = updated;
    try {
      finalRecord = await appendJurisdictionActivitySafely({
        entity: JurisdictionProfile,
        jurisdictionId: updated.id,
        entry: {
          id: `office_research_${Date.now()}`,
          action: "manual_edit",
          description: "Staff edited a saved office research draft; office authority remains unverified.",
          user: actor,
          timestamp: new Date().toISOString(),
          changes: { office_research_saved: true, verification_status: "needs_verification" },
        },
        label: `Office research history ${jurisdiction.name || jurisdiction.id}`,
      });
    } catch (activityError) {
      console.error("Office research saved but activity history append failed:", activityError);
    }
    setJurisdictions(prev => prev.map(row => row.id === finalRecord.id ? finalRecord : row));
    if (selectedJurisdiction?.id === finalRecord.id) setSelectedJurisdiction(finalRecord);
    return finalRecord;
  };

  const handleDelete = async (id) => {
    const loaded = jurisdictions.find(j => j.id === id);
    if (!loaded?.id) {
      throw new Error("This jurisdiction is no longer loaded. Reload the repository before deleting it.");
    }
    try {
      await deleteJurisdictionFromLoadedSnapshot({
        entity: JurisdictionProfile,
        jurisdiction: loaded,
        label: `Jurisdiction ${loaded.name || id} deletion`,
      });
      setJurisdictions(prev => prev.filter(j => j.id !== id));
      if (selectedJurisdiction?.id === id) setSelectedJurisdiction(null);
      return true;
    } catch (error) {
      console.error("Jurisdiction deletion blocked:", error);
      await loadJurisdictions();
      throw new Error(error?.message || "This jurisdiction changed in another session. Reload before deleting it.");
    }
  };

  const aiDiscover = async () => {
    if (!aiDiscoverQuery.trim()||!aiDiscoverState.trim()) return;
    setAiDiscoverLoading(true);

    try {
      const placeholderResult = await createJurisdictionIfAbsent({
        entity: JurisdictionProfile,
        data: {
          name: aiDiscoverQuery.trim(),
          state: aiDiscoverState.trim().toUpperCase(),
          type: /county/i.test(aiDiscoverQuery)?"county":"city",
          ai_summary: "Research in progress...",
          last_updated: new Date().toISOString(),
          auto_refresh: true
        },
        label: `AI Discover ${aiDiscoverQuery}`,
      });
      const placeholder = placeholderResult.record;

      setJurisdictions(prev => prev.some(j => j.id === placeholder.id) ? prev : [placeholder, ...prev]);
      setSelectedJurisdiction(placeholder);

      const response=await runAction('refreshJurisdiction',{jurisdiction_id:placeholder.id},`Discover ${aiDiscoverQuery}, ${aiDiscoverState}`);
      const updated=response.data?.jurisdiction || await JurisdictionProfile.get(placeholder.id);
      setJurisdictions(prev=>prev.map(j=>j.id===placeholder.id?updated:j));
      setSelectedJurisdiction(current=>current?.id===placeholder.id?updated:current);
      setAiDiscoverQuery("");

    } catch (e) {
      console.error("AI Discover error:", e);
    }

    setAiDiscoverLoading(false);
  };

  const normalizedSearch = debouncedSearch.trim().toLowerCase();
  const recentlyChanged = useMemo(() => {
    if (!lastVisit) return [];
    return (jurisdictions || []).filter((j) => String(j.updated_date || "") > lastVisit);
  }, [jurisdictions, lastVisit]);
  const staleJurisdictions = useMemo(() => {
    const sixMonthsAgo = Date.now() - 180 * 86400000;
    return (jurisdictions || []).filter((j) => {
      const verified = j.verification_status === "verified" || j.trust === "verified";
      const updated = Date.parse(String(j.updated_date || ""));
      return verified && Number.isFinite(updated) && updated < sixMonthsAgo;
    });
  }, [jurisdictions]);
  const repeatOffenders = useMemo(() => {
    return (jurisdictions || [])
      .map((j) => ({ name: j.name, count: denialCounts[String(j.name || "").trim().toLowerCase()] || 0 }))
      .filter((j) => j.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [jurisdictions, denialCounts]);
  const mostApplied = useMemo(() => {
    return (jurisdictions || [])
      .map((j) => ({ name: j.name, count: lineCounts[String(j.name || "").trim().toLowerCase()] || 0 }))
      .filter((j) => j.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [jurisdictions, lineCounts]);

  // Users type things like "Hamilton County" or "City of Mason" while profiles
  // are stored by bare name + type. Normalize the query (strip type words) and
  // match against every natural alias so real jurisdictions are found.
  const searchAliases = (j) => {
    const name = String(j.name || '').toLowerCase();
    const type = String(j.type || '').toLowerCase();
    const county = String(j.parent_county?.name || j.parent_county_name || '').toLowerCase();
    const officeBits = (j.offices || []).flatMap((o) => [o.name, o.contact_phone, o.contact_email, o.contact_address]).map((v) => String(v || '').toLowerCase());
    const contactBits = [j.contact_info?.phone, j.contact_info?.email, j.contact_info?.address, j.website_url, j.permitting_url].map((v) => String(v || '').toLowerCase());
    return [name, `${name} ${type}`, `${type} of ${name}`, `city of ${name}`,
      `village of ${name}`, `${name} township`, `${name} county`, county,
      `${name} ${county}`, ...officeBits, ...contactBits].filter(Boolean);
  };
  const queryTokens = normalizedSearch.split(/[^a-z0-9]+/)
    .filter(t => t && !['county','city','village','township','of','the','twp','ohio','oh','ky','kentucky'].includes(t));
  const matchesSearchFor = (j) => {
    if (!normalizedSearch) return true;
    if (!queryTokens.length) return true;
    const hay = searchAliases(j);
    return queryTokens.every(t => hay.some(a => a.includes(t)));
  };

  const duplicateMap = new Map();
  jurisdictions.forEach((jurisdiction) => {
    const key = jurisdictionIdentityKey(jurisdiction);
    if (String(jurisdiction.name || "").trim()) duplicateMap.set(key, [...(duplicateMap.get(key) || []), jurisdiction]);
  });
  const duplicateJurisdictionGroups = [...duplicateMap.values()].filter((rows) => rows.length > 1);
  const duplicateCountFor = (jurisdiction) => duplicateMap.get(jurisdictionIdentityKey(jurisdiction))?.length || 1;
  const trustCounts = jurisdictions.reduce((acc, jurisdiction) => {
    const trust = assessJurisdictionTrust(jurisdiction, duplicateCountFor(jurisdiction));
    acc[trust.key] = (acc[trust.key] || 0) + 1;
    return acc;
  }, {});
  const displayList = jurisdictions.filter((jurisdiction) => {
    if (!matchesSearchFor(jurisdiction)) return false;
    if (trustFilter === "all") return true;
    return assessJurisdictionTrust(jurisdiction, duplicateCountFor(jurisdiction)).key === trustFilter;
  }).sort((a, b) => String(b.updated_date || "").localeCompare(String(a.updated_date || "")));

  const totalDocs = jurisdictions.reduce((sum, j) => sum + (j.documents?.length || 0), 0);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-gray-50">
      <div className={`${selectedJurisdiction ? "hidden md:flex md:w-[420px] md:flex-none" : "flex w-full"} min-w-0 flex-col`}>
        <div className="bg-white border-b px-4 py-3">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-purple-600" />
                Jurisdictions
              </h1>
              <p className="text-xs text-gray-500">The saved list of towns, townships, and counties we file permits with — {jurisdictions.length} saved{currentUser?.role === 'admin' ? ` · ${totalDocs} documents` : ''}</p>
              {isAdmin && (
                <div className="mt-1 flex items-center gap-2 flex-wrap text-[10px]">
                  <span className="text-green-700">{trustCounts.verified || 0} verified</span>
                  <span className="text-amber-700">{trustCounts.needs_review || 0} need verification</span>
                  <span className="text-red-700">{trustCounts.blocked || 0} duplicate-blocked</span>
                  <span className="text-slate-600">{trustCounts.historical || 0} historical</span>
                  <span className="text-blue-700">{trustCounts.manual_protected || 0} manual-protected</span>
                  <span className="text-purple-700">{trustCounts.ai_researched || 0} AI researched</span>
                </div>
              )}
            </div>
            {isAdmin && (
              <>
              <Button
                onClick={() => { setEditingJurisdiction(null); setShowForm(true); }}
                size="sm"
                className="min-h-11 w-full gap-1 bg-purple-600 hover:bg-purple-700 sm:w-auto"
              >
                <Plus className="w-4 h-4" /> Add
              </Button>
              <label className="min-h-11 w-full sm:w-auto inline-flex cursor-pointer items-center justify-center gap-1 rounded-md border border-purple-200 px-3 text-xs font-semibold text-purple-800 hover:bg-purple-50" title="Import jurisdictions from CSV: name,state,type per line">
                Import CSV
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const text = await file.text();
                  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                  let created = 0, skipped = 0;
                  for (const line of lines.slice(0, 200)) {
                    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
                    const [name, state, type] = cols;
                    if (!name || name.toLowerCase() === "name") continue;
                    try {
                      const result = await createJurisdictionIfAbsent({
                        entity: JurisdictionProfile,
                        data: { name, state: state || "", jurisdiction_type: type || "", type: type || "" },
                        label: `CSV import ${name}`,
                      });
                      if (result.status === "existing" || result.status === "concurrent_duplicate_discarded") skipped++; else created++;
                      if (result.record) setJurisdictions(prev => prev.some(j => j.id === result.record.id) ? prev : [result.record, ...prev]);
                    } catch { skipped++; }
                  }
                  setRepositoryNotice({ tone: skipped ? "warning" : "success", text: `Imported ${created} jurisdiction${created === 1 ? "" : "s"}; ${skipped} skipped (already existed or failed).` });
                }} />
              </label>
              </>
            )}
          </div>

          {isAdmin && (
            <>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={aiDiscoverQuery}
                  onChange={e => setAiDiscoverQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && aiDiscover()}
                  placeholder="AI Discover: e.g. Jefferson County"
                  className="min-h-11 text-sm"
                />
                <Input aria-label="Discovery state" value={aiDiscoverState} onChange={e=>setAiDiscoverState(e.target.value)} placeholder="State" className="min-h-11 sm:w-20" />
                <Button onClick={aiDiscover} disabled={aiDiscoverLoading || !aiDiscoverQuery.trim() || !aiDiscoverState.trim()} size="sm" className="min-h-11 w-full flex-shrink-0 gap-1 bg-purple-600 hover:bg-purple-700 sm:w-auto">
                  {aiDiscoverLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  {aiDiscoverLoading ? "Researching..." : "Discover"}
                </Button>
              </div>
              <p className="text-[10px] text-gray-500 mb-2">Search instructions, source-page scans and discovered links appear in Scan activity.</p>
            </>
          )}

          {showOnboarding && (
            <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-bold text-indigo-900">New to permitting? Learn these 5:</p>
                <button type="button" onClick={hideOnboarding} className="text-[10px] font-semibold text-indigo-500 hover:underline">Hide</button>
              </div>
              <div className="mt-1.5 space-y-1">
                {[
                  "A county office is not the same as a city, township, or village office — even when the names match",
                  "Type the job's full street address — the tool checks which town it's really in",
                  "Green dot means our team checked the office — gray means nobody checked it yet",
                  "If no town office is found, the county's office handles the permit",
                  "After you call an office, save its phone number here so the next person has it",
                ].map((item, idx) => (
                  <label key={idx} className="flex cursor-pointer items-start gap-2 text-[11px] text-indigo-800">
                    <input type="checkbox" checked={onboardingDone.includes(idx)} onChange={() => toggleOnboarding(idx)} className="mt-0.5" />
                    <span className={onboardingDone.includes(idx) ? "line-through opacity-60" : ""}>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {repeatOffenders.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500" title="Offices that said no before — worth reading the notes before applying again">
              <span className="font-semibold text-slate-600">Denied before:</span>
              {repeatOffenders.map((j) => {
                const match = jurisdictions.find((x) => String(x.name || "").trim().toLowerCase() === String(j.name || "").trim().toLowerCase());
                return match ? (
                  <button key={j.name} type="button" onClick={() => setSelectedJurisdiction(match)} className="font-medium text-red-600 underline decoration-dotted hover:text-red-800" title={`Open ${j.name}'s details`}>{j.name} ({j.count})</button>
                ) : (
                  <span key={j.name} className="font-medium text-red-600">{j.name} ({j.count})</span>
                );
              })}
            </div>
          )}
          {staleJurisdictions.length > 0 && (
            <details className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
              <summary className="cursor-pointer" title="Offices our team checked a while ago — worth a fresh look before relying on them">
                {staleJurisdictions.length} checked office{staleJurisdictions.length === 1 ? "" : "s"} haven't been looked at in 6+ months — click to see which
              </summary>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {staleJurisdictions.map((j) => (
                  <button key={j.id || j.name} type="button" onClick={() => setSelectedJurisdiction(j)} className="text-amber-900 underline decoration-dotted hover:text-amber-950">{j.name}</button>
                ))}
              </div>
            </details>
          )}
          {comparePicks.length === 2 && (
            <div className="mb-3 grid grid-cols-2 gap-3">
              {comparePicks.map((j) => (
                <div key={j.id} className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 text-xs">
                  <div className="mb-1 font-bold text-indigo-900">{j.name}, {j.state} <span className="font-normal text-[10px] text-indigo-500">({j.jurisdiction_type || j.type || "jurisdiction"})</span></div>
                  <div className="text-[10px] text-slate-600">{(j.offices || []).length} offices · {(j.documents || []).length} sources · {String(j.verification_status || "unverified")}</div>
                </div>
              ))}
              <button type="button" onClick={() => { setCompareMode(false); setComparePicks([]); }} className="col-span-2 text-[10px] font-semibold text-slate-400 hover:text-slate-600">Clear compare</button>
            </div>
          )}
          {compareMode && comparePicks.length < 2 && (
            <p className="mb-2 rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700">Click a jurisdiction card's compare checkbox — pick {2 - comparePicks.length} more.</p>
          )}
          {mostApplied.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500" title="Where the permitting effort concentrates — jurisdictions with the most permit lines">
              <span className="font-semibold text-slate-600">Most applied:</span>
              {mostApplied.map((j) => {
                const match = jurisdictions.find((x) => String(x.name || "").trim().toLowerCase() === String(j.name || "").trim().toLowerCase());
                return match ? (
                  <button key={j.name} type="button" onClick={() => setSelectedJurisdiction(match)} className="font-medium text-indigo-700 underline decoration-dotted hover:text-indigo-900" title={`Open ${j.name}'s details`}>{j.name} <span className="text-indigo-600">({j.count})</span></button>
                ) : (
                  <span key={j.name} className="font-medium text-slate-700">{j.name} <span className="text-indigo-600">({j.count})</span></span>
                );
              })}
            </div>
          )}
          <div className="flex gap-2 items-start">
            <button
              type="button"
              onClick={() => { const v = !compareMode; setCompareMode(v); if (!v) setComparePicks([]); }}
              className={`min-h-11 self-center rounded-md border px-2.5 text-[11px] font-semibold ${compareMode ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
              title="Compare two jurisdictions side by side"
            >Compare</button>
            {recentlyChanged.length > 0 && (
              <span className="mr-2 self-center whitespace-nowrap text-[11px] font-semibold text-indigo-700" title={recentlyChanged.slice(0, 5).map(j => j.name).join(", ")}>
                {recentlyChanged.length} changed since your last visit
              </span>
            )}
            <Input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search jurisdictions (e.g. Hamilton County, Mason, Delhi Township)..."
              className="min-h-11 text-sm flex-1"
              autoFocus
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 gap-1 whitespace-nowrap"
              title="Download the current list as a spreadsheet file"
              onClick={() => {
                const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
                const rows = [["Name", "State", "Type", "County", "Verification", "Offices", "Documents"],
                  ...displayList.map((j) => [
                    j.name || "", j.state || "", j.type || "",
                    j.parent_county?.name || j.parent_county_name || "",
                    j.verification_status || "",
                    Array.isArray(j.offices) ? j.offices.length : 0,
                    Array.isArray(j.documents) ? j.documents.length : 0,
                  ])];
                const csv = rows.map(r => r.map(esc).join(",")).join("\r\n");
                const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "jurisdictions.csv"; a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="w-4 h-4" /> Export
            </Button>
          </div>
          {isAdmin && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {[
              ["all", "All", jurisdictions.length, "border-gray-200 bg-white text-gray-700"],
              ["verified", "Verified", trustCounts.verified || 0, "border-green-300 bg-green-50 text-green-800"],
              ["needs_review", "Needs Verification", trustCounts.needs_review || 0, "border-amber-300 bg-amber-50 text-amber-800"],
              ["blocked", "Duplicates", trustCounts.blocked || 0, "border-red-300 bg-red-50 text-red-700"],
              ["historical", "Historical", trustCounts.historical || 0, "border-slate-300 bg-slate-100 text-slate-700"],
              ["manual_protected", "Manual Protected", trustCounts.manual_protected || 0, "border-blue-300 bg-blue-50 text-blue-700"],
              ["ai_researched", "AI Researched", trustCounts.ai_researched || 0, "border-purple-300 bg-purple-50 text-purple-700"],
            ].map(([key, label, count, colorClass]) => (
              <button type="button"
                key={key}
                type="button"
                onClick={() => setTrustFilter(key)}
                className={`min-h-11 whitespace-nowrap rounded-full border px-3 py-2 text-[11px] font-medium transition ${colorClass} ${trustFilter === key ? "ring-2 ring-offset-1 ring-purple-300" : "opacity-80 hover:opacity-100"}`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
          )}
        </div>

        {isAdmin && <div className="mx-3 mt-3"><DrainLiveFeed /></div>}

        {repositoryNotice && (
          <div className={`mx-3 mt-3 rounded-md border p-3 text-xs ${repositoryNotice.tone === "success" ? "border-green-300 bg-green-50 text-green-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
            <div className="flex items-start justify-between gap-3">
              <span>{repositoryNotice.text}</span>
              <button type="button" onClick={() => setRepositoryNotice(null)} className="font-semibold underline underline-offset-2">Dismiss</button>
            </div>
          </div>
        )}

        {isAdmin && duplicateJurisdictionGroups.length > 0 && (
          <div className="mx-3 mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-semibold">Duplicate jurisdiction profiles require review</div>
            <div className="mt-1">
              {duplicateJurisdictionGroups.map((rows) => {
                const first = rows[0];
                const parent = first.type !== "county" && first.parent_county?.name ? ` · ${first.parent_county.name}` : "";
                return `${first.name}, ${first.state}${parent} (${rows.length})`;
              }).join(" · ")}
            </div>
            <div className="mt-1 text-amber-800">No profile was merged or deleted automatically. Review the records and keep the correct history before removing any duplicate.</div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            </div>
          ) : displayList.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No jurisdictions yet</p>
              <p className="text-xs mt-1">Use "AI Discover" to auto-create profiles or click "Add" to add manually.</p>
            </div>
          ) : (
            displayList.map(j => (
              <div key={j.id} className={comparePicks.some((p) => p.id === j.id) ? "ring-2 ring-indigo-400 rounded-xl" : ""}>
                {compareMode && (
                  <label className="mb-1 flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-indigo-700" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={comparePicks.some((p) => p.id === j.id)} onChange={() => toggleComparePick(j)} />
                    Compare
                  </label>
                )}
                <JurisdictionCard
                  jurisdiction={j}
                  onEdit={handleEdit}
                  onRefresh={handleRefresh}
                  onSelect={setSelectedJurisdiction}
                  isRefreshing={refreshingIds.has(j.id)}
                  duplicateCount={duplicateCountFor(j)}
                />
                {(lineCounts[String(j.name || "").trim().toLowerCase()] || 0) > 0 && (
                  <p className="-mt-1 px-3 pb-2 text-[10px] font-medium text-slate-500" title="Permit lines on record here">
                    {lineCounts[String(j.name || "").trim().toLowerCase()]} permit{lineCounts[String(j.name || "").trim().toLowerCase()] === 1 ? "" : "s"} on record
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {selectedJurisdiction && (
        <div className="min-w-0 flex-1 overflow-hidden md:border-l">
          <JurisdictionDetailPanel
            jurisdiction={selectedJurisdiction}
            permitLines={permitLines.filter((li) => String(li.locality_name || "").trim().toLowerCase() === String(selectedJurisdiction.name || "").trim().toLowerCase())}
            onOpenJob={onOpenJob}
            duplicateCount={duplicateCountFor(selectedJurisdiction)}
            onSetVerification={handleVerificationChange}
            onClose={() => setSelectedJurisdiction(null)}
            onSaveOfficeResearch={handleOfficeResearchSave}
            onUpdate={(updated) => {
              setJurisdictions(prev => prev.map(j => j.id === updated.id ? updated : j));
              setSelectedJurisdiction(updated);
            }}
          />
        </div>
      )}

      <JurisdictionFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditingJurisdiction(null); }}
        jurisdiction={editingJurisdiction}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}