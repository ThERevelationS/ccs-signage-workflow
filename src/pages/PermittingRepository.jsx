import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Wand2, RefreshCw, MapPin, FileText } from "lucide-react";
import JurisdictionCard from "@/components/permitting/JurisdictionCard";
import JurisdictionDetailPanel from "@/components/permitting/JurisdictionDetailPanel";
import JurisdictionFormDialog from "@/components/permitting/JurisdictionFormDialog";

const JurisdictionProfile = base44.entities.JurisdictionProfile;

const PERMITTING_APP_ID = '69b1840cf75aba55e115d020';
const PERMITTING_API_KEY = '570bd85bbd4248b396864e2c628a6028';

async function createResearchRequest(payload) {
  const res = await fetch(`https://app.base44.com/api/apps/${PERMITTING_APP_ID}/entities/ResearchRequest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api_key': PERMITTING_API_KEY },
    body: JSON.stringify(payload)
  });
  return res.json();
}

async function pollResearchRequest(id) {
  const res = await fetch(`https://app.base44.com/api/apps/${PERMITTING_APP_ID}/entities/ResearchRequest/${id}`, {
    headers: { 'api_key': PERMITTING_API_KEY }
  });
  return res.json();
}

export default function PermittingRepository() {
  const [jurisdictions, setJurisdictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedJurisdiction, setSelectedJurisdiction] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingJurisdiction, setEditingJurisdiction] = useState(null);
  const [refreshingIds, setRefreshingIds] = useState(new Set());
  const [aiDiscoverLoading, setAiDiscoverLoading] = useState(false);
  const [aiDiscoverQuery, setAiDiscoverQuery] = useState("");

  useEffect(() => {
    loadJurisdictions();
    const interval = setInterval(loadJurisdictions, 300000);
    return () => clearInterval(interval);
  }, []);

  const loadJurisdictions = async () => {
    try {
      const data = await JurisdictionProfile.list();
      setJurisdictions(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleRefresh = async (jurisdiction) => {
    setRefreshingIds(prev => new Set([...prev, jurisdiction.id]));
    try {
      const request = await createResearchRequest({
        jurisdiction_name: jurisdiction.name,
        state: jurisdiction.state || "",
        city: jurisdiction.name,
        county: jurisdiction.parent_county?.name || "",
        ccs_jurisdiction_id: jurisdiction.id,
        status: 'pending',
        requested_by: 'refresh'
      });

      const maxWait = 180000;
      const start = Date.now();
      while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, 5000));
        const record = await pollResearchRequest(request.id);
        const data = record.data || record;
        if (data.status === 'completed') {
          const updated = await JurisdictionProfile.get(jurisdiction.id);
          setJurisdictions(prev => prev.map(j => j.id === jurisdiction.id ? updated : j));
          if (selectedJurisdiction?.id === jurisdiction.id) setSelectedJurisdiction(updated);
          break;
        }
        if (data.status === 'failed') break;
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

  const handleDelete = async (id) => {
    await JurisdictionProfile.delete(id);
    setJurisdictions(prev => prev.filter(j => j.id !== id));
    if (selectedJurisdiction?.id === id) setSelectedJurisdiction(null);
  };

  const aiDiscover = async () => {
    if (!aiDiscoverQuery.trim()) return;
    setAiDiscoverLoading(true);

    try {
      const placeholder = await JurisdictionProfile.create({
        name: aiDiscoverQuery,
        state: "",
        type: "city",
        ai_summary: "Research in progress...",
        last_updated: new Date().toISOString(),
        auto_refresh: true
      });

      setJurisdictions(prev => [placeholder, ...prev]);
      setSelectedJurisdiction(placeholder);

      const request = await createResearchRequest({
        jurisdiction_name: aiDiscoverQuery,
        state: "",
        city: aiDiscoverQuery,
        county: "",
        ccs_jurisdiction_id: placeholder.id,
        status: 'pending',
        requested_by: 'ccs_app'
      });

      const maxWait = 180000;
      const start = Date.now();
      while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, 5000));
        const record = await pollResearchRequest(request.id);
        const data = record.data || record;
        if (data.status === 'completed') {
          const updated = await JurisdictionProfile.get(placeholder.id);
          setJurisdictions(prev => prev.map(j => j.id === placeholder.id ? updated : j));
          setSelectedJurisdiction(updated);
          setAiDiscoverQuery("");
          break;
        }
        if (data.status === 'failed') throw new Error(`Research failed: ${data.error}`);
      }

    } catch (e) {
      console.error("AI Discover error:", e);
    }

    setAiDiscoverLoading(false);
  };

  const displayList = jurisdictions.filter(j =>
    !searchTerm || j.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalDocs = jurisdictions.reduce((sum, j) => sum + (j.documents?.length || 0), 0);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <div className="flex flex-col w-full" style={{ maxWidth: selectedJurisdiction ? '420px' : '100%', minWidth: '320px', transition: 'max-width 0.3s' }}>
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

          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search jurisdiction names..."
            className="text-sm h-8"
          />
        </div>

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
        onDelete={handleDelete}
      />
    </div>
  );
}