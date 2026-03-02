import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Search, Wand2, RefreshCw, MapPin, FileText, Filter } from "lucide-react";
import JurisdictionCard from "@/components/permitting/JurisdictionCard";
import JurisdictionDetailPanel from "@/components/permitting/JurisdictionDetailPanel";
import JurisdictionFormDialog from "@/components/permitting/JurisdictionFormDialog";
import { refreshJurisdiction } from "@/functions/refreshJurisdiction";
import { searchJurisdictions } from "@/functions/searchJurisdictions";

const JurisdictionProfile = base44.entities.JurisdictionProfile;

const US_STATES = ["All","AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

export default function PermittingRepository() {
  const [jurisdictions, setJurisdictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [stateFilter, setStateFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedJurisdiction, setSelectedJurisdiction] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingJurisdiction, setEditingJurisdiction] = useState(null);
  const [refreshingIds, setRefreshingIds] = useState(new Set());
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [aiDiscoverLoading, setAiDiscoverLoading] = useState(false);
  const [aiDiscoverQuery, setAiDiscoverQuery] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");

  useEffect(() => {
    loadJurisdictions();
    const interval = setInterval(loadJurisdictions, 300000); // refresh every 5 min
    return () => clearInterval(interval);
  }, []);

  const loadJurisdictions = async () => {
    try {
      const data = await JurisdictionProfile.list();
      setJurisdictions(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleSearch = async () => {
    if (!globalQuery.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const res = await searchJurisdictions({ query: globalQuery, state: stateFilter !== "All" ? stateFilter : undefined });
      setSearchResults(res.data?.results || []);
    } catch (e) { console.error(e); }
    setSearching(false);
  };

  const handleRefresh = async (jurisdiction) => {
    setRefreshingIds(prev => new Set([...prev, jurisdiction.id]));
    try {
      const res = await refreshJurisdiction({ jurisdiction_id: jurisdiction.id });
      if (res.data?.jurisdiction) {
        setJurisdictions(prev => prev.map(j => j.id === jurisdiction.id ? res.data.jurisdiction : j));
        if (selectedJurisdiction?.id === jurisdiction.id) setSelectedJurisdiction(res.data.jurisdiction);
      }
    } catch (e) { console.error(e); }
    setRefreshingIds(prev => { const n = new Set(prev); n.delete(jurisdiction.id); return n; });
  };

  const handleSave = async (formData) => {
    if (editingJurisdiction?.id) {
      const updated = await JurisdictionProfile.update(editingJurisdiction.id, formData);
      setJurisdictions(prev => prev.map(j => j.id === updated.id ? updated : j));
      if (selectedJurisdiction?.id === updated.id) setSelectedJurisdiction(updated);
    } else {
      const created = await JurisdictionProfile.create(formData);
      setJurisdictions(prev => [created, ...prev]);
    }
    setShowForm(false);
    setEditingJurisdiction(null);
  };

  const handleEdit = (jurisdiction) => {
    setEditingJurisdiction(jurisdiction);
    setShowForm(true);
  };

  const aiDiscover = async () => {
    if (!aiDiscoverQuery.trim()) return;
    setAiDiscoverLoading(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Research and create a comprehensive profile for this jurisdiction for sign permitting: "${aiDiscoverQuery}"

IMPORTANT: ONLY research jurisdictions in Ohio (OH), Kentucky (KY), or Indiana (IN). Do not provide information about any other states.

Identify:
1. Is this a county, city, township, or municipality?
2. What state is it in? (Must be OH, KY, or IN)
3. Official name
4. Specific permit requirements:
   - SQFT/Width/Height allowance rules
   - Height allowances and rules
   - Setback requirements and rules
   - Lighting allowances and restrictions
5. Available permit forms (electrical IBI, signage/construction, zoning, building, NIC, NKYEI, locality-specific)
6. If this is a city/town/village/township, also research:
   - Parent county name and information
   - Parent county permitting URLs and contacts
   - Parent county permit forms and documents

Return JSON:
{
  "name": "official name",
  "state": "two-letter state code",
  "type": "county|city|township|municipality",
  "website_url": "official website",
  "permitting_url": "permitting/planning department URL",
  "ai_summary": "3 sentence summary of sign permit requirements",
  "contact_info": { "department": "", "phone": "", "email": "", "address": "" },
  "permit_requirements": {
    "requires_permit": true/false,
    "max_sign_area_sqft": null,
    "max_height_ft": null,
    "setback_requirements": "",
    "illumination_allowed": null,
    "electronic_signs_allowed": null,
    "fee_range": "",
    "processing_time": ""
  },
  "documents": [
    { "title": "", "url": "", "doc_type": "sign_ordinance|permit_application|zoning_code|fee_schedule|checklist|other", "ai_summary": "" }
  ],
  "sqft_width_height_rules": "",
  "height_allowances": "",
  "setback_rules": "",
  "lighting_allowances": "",
  "parent_county": {
    "name": "",
    "website_url": "",
    "permitting_url": "",
    "contact_info": { "department": "", "phone": "", "email": "", "address": "" },
    "documents": []
  }
}`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            name: { type: "string" }, state: { type: "string" }, type: { type: "string" },
            website_url: { type: "string" }, permitting_url: { type: "string" },
            ai_summary: { type: "string" }, contact_info: { type: "object" },
            permit_requirements: { type: "object" },
            documents: { type: "array", items: { type: "object" } },
            sqft_width_height_rules: { type: "string" },
            height_allowances: { type: "string" },
            setback_rules: { type: "string" },
            lighting_allowances: { type: "string" },
            parent_county: { type: "object" }
          }
        }
      });

      const data = typeof result === 'string' ? JSON.parse(result) : result;
      const docs = (data.documents || []).map((d, i) => ({
        id: `ai_${Date.now()}_${i}`,
        title: d.title || "Untitled",
        url: d.url || "",
        doc_type: d.doc_type || "other",
        ai_summary: d.ai_summary || "",
        source: "ai_discovered",
        last_fetched: new Date().toISOString()
      }));

      // Add parent county documents if applicable
      const countyDocs = (data.parent_county?.documents || []).map((d, i) => ({
        id: `ai_county_${Date.now()}_${i}`,
        title: `[${data.parent_county.name}] ${d.title || "Untitled"}`,
        url: d.url || "",
        doc_type: d.doc_type || "other",
        ai_summary: d.ai_summary || "",
        source: "ai_discovered",
        last_fetched: new Date().toISOString()
      }));

      const created = await JurisdictionProfile.create({
        ...data,
        documents: [...docs, ...countyDocs],
        last_updated: new Date().toISOString(),
        auto_refresh: true
      });

      setJurisdictions(prev => [created, ...prev]);
      setSelectedJurisdiction(created);
      setAiDiscoverQuery("");
    } catch (e) { console.error("AI Discover error:", e); }
    setAiDiscoverLoading(false);
  };

  const displayList = searchResults !== null ? searchResults : jurisdictions.filter(j => {
    if (stateFilter !== "All" && j.state !== stateFilter) return false;
    if (typeFilter !== "all" && j.type !== typeFilter) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return j.name?.toLowerCase().includes(s) || j.state?.toLowerCase().includes(s) || j.ai_summary?.toLowerCase().includes(s);
    }
    return true;
  });

  const totalDocs = jurisdictions.reduce((sum, j) => sum + (j.documents?.length || 0), 0);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Left Panel */}
      <div className="flex flex-col w-full" style={{ maxWidth: selectedJurisdiction ? '420px' : '100%', minWidth: '320px', transition: 'max-width 0.3s' }}>
        {/* Header */}
        <div className="bg-white border-b px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-purple-600" />
                Permitting Repository
              </h1>
              <p className="text-xs text-gray-500">{jurisdictions.length} jurisdictions · {totalDocs} documents</p>
            </div>
            <Button
              onClick={() => { setEditingJurisdiction(null); setShowForm(true); }}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 gap-1"
            >
              <Plus className="w-4 h-4" /> Add
            </Button>
          </div>

          {/* AI Discover */}
          <div className="flex gap-2 mb-3">
            <Input
              value={aiDiscoverQuery}
              onChange={e => setAiDiscoverQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && aiDiscover()}
              placeholder="AI Discover: e.g. Jefferson County Kentucky..."
              className="text-sm h-9"
            />
            <Button onClick={aiDiscover} disabled={aiDiscoverLoading || !aiDiscoverQuery.trim()} size="sm" className="h-9 bg-purple-600 hover:bg-purple-700 gap-1 flex-shrink-0">
              {aiDiscoverLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              {aiDiscoverLoading ? "Researching..." : "Discover"}
            </Button>
          </div>
          <p className="text-[10px] text-gray-500 mb-2">AI validates all discovered document URLs to prevent 404 errors</p>

          {/* Content Search */}
          <div className="flex gap-2 mb-2">
            <Input
              value={globalQuery}
              onChange={e => setGlobalQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search inside documents..."
              className="text-sm h-8"
            />
            <Button onClick={handleSearch} disabled={searching} size="sm" className="h-8 flex-shrink-0" variant="outline">
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            </Button>
            {searchResults !== null && (
              <Button size="sm" variant="ghost" className="h-8 text-xs flex-shrink-0" onClick={() => { setSearchResults(null); setGlobalQuery(""); }}>
                Clear
              </Button>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {US_STATES.map(s => <SelectItem key={s} value={s} className="text-xs">{s === "All" ? "All States" : s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Types</SelectItem>
                {["county","city","township","municipality"].map(t => <SelectItem key={t} value={t} className="text-xs capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Filter..."
              className="h-8 text-xs flex-1"
            />
          </div>
        </div>

        {searchResults !== null && (
          <div className="px-4 py-1 bg-blue-50 border-b text-xs text-blue-700">
            Document search: {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{globalQuery}"
          </div>
        )}

        {/* List */}
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
              />
            ))
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedJurisdiction && (
        <div className="flex-1 border-l overflow-hidden">
          <JurisdictionDetailPanel
            jurisdiction={selectedJurisdiction}
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
      />
    </div>
  );
}