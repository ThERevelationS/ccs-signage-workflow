import {useResearchProgress} from "./ResearchProgressContext";
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Wand2, MapPin } from "lucide-react";
import JurisdictionCard from "@/components/permitting/JurisdictionCard";
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
import { assessJurisdictionTrust } from "@/components/permitting/jurisdictionTrust";
import { normalizePermitJurisdictionName } from "@/components/permitting/jurisdictionPermitBridge";
import { useAuth } from "@/components/auth/EmailGate";

const JurisdictionProfile = base44.entities.JurisdictionProfile;

export default function JurisdictionsView({ focusJurisdiction = null }) {
  const { currentUser } = useAuth();
  const {runAction}=useResearchProgress();
  const [jurisdictions, setJurisdictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
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
    const interval = setInterval(loadJurisdictions, 300000);
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
      const data = await loadAllEntityRows({
        entity: JurisdictionProfile,
        sort: null,
        label: "Permitting Repository catalog",
      });
      setJurisdictions(data);
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

  const normalizedSearch = searchTerm.trim().toLowerCase();

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
    const matchesSearch = !normalizedSearch ||
      jurisdiction.name?.toLowerCase().includes(normalizedSearch) ||
      jurisdiction.state?.toLowerCase().includes(normalizedSearch) ||
      jurisdiction.parent_county?.name?.toLowerCase().includes(normalizedSearch);
    if (!matchesSearch) return false;
    if (trustFilter === "all") return true;
    return assessJurisdictionTrust(jurisdiction, duplicateCountFor(jurisdiction)).key === trustFilter;
  });

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
              <p className="text-xs text-gray-500">{jurisdictions.length} jurisdictions · {totalDocs} documents</p>
              <div className="mt-1 flex items-center gap-2 flex-wrap text-[10px]">
                <span className="text-green-700">{trustCounts.verified || 0} verified</span>
                <span className="text-amber-700">{trustCounts.needs_review || 0} need verification</span>
                <span className="text-red-700">{trustCounts.blocked || 0} duplicate-blocked</span>
                <span className="text-slate-600">{trustCounts.historical || 0} historical</span>
                <span className="text-blue-700">{trustCounts.manual_protected || 0} manual-protected</span>
                <span className="text-purple-700">{trustCounts.ai_researched || 0} AI researched</span>
              </div>
            </div>
            <Button
              onClick={() => { setEditingJurisdiction(null); setShowForm(true); }}
              size="sm"
              className="min-h-11 w-full gap-1 bg-purple-600 hover:bg-purple-700 sm:w-auto"
            >
              <Plus className="w-4 h-4" /> Add
            </Button>
          </div>

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

          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search jurisdiction names..."
            className="min-h-11 text-sm"
          />
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
              <button
                key={key}
                type="button"
                onClick={() => setTrustFilter(key)}
                className={`min-h-11 whitespace-nowrap rounded-full border px-3 py-2 text-[11px] font-medium transition ${colorClass} ${trustFilter === key ? "ring-2 ring-offset-1 ring-purple-300" : "opacity-80 hover:opacity-100"}`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        </div>

        {repositoryNotice && (
          <div className={`mx-3 mt-3 rounded-md border p-3 text-xs ${repositoryNotice.tone === "success" ? "border-green-300 bg-green-50 text-green-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
            <div className="flex items-start justify-between gap-3">
              <span>{repositoryNotice.text}</span>
              <button type="button" onClick={() => setRepositoryNotice(null)} className="font-semibold underline underline-offset-2">Dismiss</button>
            </div>
          </div>
        )}

        {duplicateJurisdictionGroups.length > 0 && (
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
              <JurisdictionCard
                key={j.id}
                jurisdiction={j}
                onEdit={handleEdit}
                onRefresh={handleRefresh}
                onSelect={setSelectedJurisdiction}
                isRefreshing={refreshingIds.has(j.id)}
                duplicateCount={duplicateCountFor(j)}
              />
            ))
          )}
        </div>
      </div>

      {selectedJurisdiction && (
        <div className="min-w-0 flex-1 overflow-hidden md:border-l">
          <JurisdictionDetailPanel
            jurisdiction={selectedJurisdiction}
            duplicateCount={duplicateCountFor(selectedJurisdiction)}
            onSetVerification={handleVerificationChange}
            onClose={() => setSelectedJurisdiction(null)}
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