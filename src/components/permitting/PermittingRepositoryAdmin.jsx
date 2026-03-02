import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useResearchProgress } from "./ResearchProgressContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, RefreshCw, Loader2, Lock, AlertTriangle, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

export default function PermittingRepositoryAdmin() {
  const [jurisdictions, setJurisdictions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBatchUpdating, setBatchUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchSettings, setBatchSettings] = useState({
    updateWebsites: true,
    updatePermittingUrls: true,
    updateRequirements: true,
    updateDocuments: true,
    skipManualData: true
  });
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkAddText, setBulkAddText] = useState('');
  const { startResearch, updateProgress, completeResearch } = useResearchProgress();

  useEffect(() => {
    loadJurisdictions();
  }, []);

  const loadJurisdictions = async () => {
    setIsLoading(true);
    try {
      const all = await base44.entities.JurisdictionProfile.list("-created_date");
      setJurisdictions(Array.isArray(all) ? all : []);
    } catch (e) {
      console.error("Load error:", e);
    }
    setIsLoading(false);
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(new Set(jurisdictions.map(j => j.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectMissing = () => {
    const missingIds = jurisdictions
      .filter(j => {
        const status = getDataStatus(j);
        return status.score < 4;
      })
      .map(j => j.id);
    setSelectedIds(new Set(missingIds));
  };

  const handleBulkAdd = async () => {
    if (!bulkAddText.trim()) return;
    
    const lines = bulkAddText.trim().split('\n');
    const created = [];
    
    for (const line of lines) {
      const parts = line.trim().split(',').map(p => p.trim());
      if (parts.length >= 2) {
        const [name, state, type = 'county'] = parts;
        try {
          const newJ = await base44.entities.JurisdictionProfile.create({
            name,
            state,
            type,
            auto_refresh: true
          });
          created.push(newJ);
        } catch (e) {
          console.error(`Failed to create ${name}, ${state}:`, e);
        }
      }
    }
    
    if (created.length > 0) {
      loadJurisdictions();
      setBulkAddText('');
      setShowBulkAdd(false);
    }
  };

  const handleSelectOne = (id, checked) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const handleBatchUpdate = async () => {
    const idsToUpdate = Array.from(selectedIds);
    if (idsToUpdate.length === 0) {
      alert("Please select at least one jurisdiction");
      return;
    }

    proceedWithUpdate();
  };

  const proceedWithUpdate = async () => {
    const idsToUpdate = Array.from(selectedIds);
    const total = idsToUpdate.length;

    startResearch(total);
    setBatchUpdating(true);

    let updated = 0;
    let skipped = 0;

    try {
      for (let i = 0; i < idsToUpdate.length; i++) {
        const jurisdictionId = idsToUpdate[i];
        
        try {
          // Get jurisdiction name for progress display
          const jurisdiction = jurisdictions.find(j => j.id === jurisdictionId);
          const jurisdictionName = jurisdiction ? `${jurisdiction.name}, ${jurisdiction.state}` : 'Unknown';
          
          // Update progress with current jurisdiction
          updateProgress({
            processed: i,
            currentJurisdiction: jurisdictionName
          });

          // Call refreshJurisdiction for individual jurisdiction
          const res = await base44.functions.invoke('refreshJurisdiction', {
            jurisdictionId,
            settings: batchSettings
          });

          if (res.data?.success) {
            updated++;
          } else {
            skipped++;
          }
        } catch (e) {
          console.error(`Error updating jurisdiction ${jurisdictionId}:`, e);
          skipped++;
        }
      }

      completeResearch(updated, skipped);
      
      setTimeout(() => {
        loadJurisdictions();
        setSelectedIds(new Set());
      }, 2000);
    } catch (e) {
      console.error("Batch update error:", e);
      completeResearch(updated, skipped, e.message);
    }
    
    setBatchUpdating(false);
  };

  const getDataStatus = (j) => {
    const hasWebsite = !!j.website_url;
    const hasPermitting = !!j.permitting_url;
    const hasRequirements = j.permit_requirements && Object.keys(j.permit_requirements).length > 0;
    const hasDocuments = (j.documents || []).length > 0;
    
    return {
      hasWebsite,
      hasPermitting,
      hasRequirements,
      hasDocuments,
      score: [hasWebsite, hasPermitting, hasRequirements, hasDocuments].filter(Boolean).length
    };
  };

  const getProtectionStatus = (j) => {
    const flags = [j._manual_website_url, j._manual_permitting_url, j._manual_requirements, j._manual_documents];
    return {
      count: flags.filter(Boolean).length,
      locked: flags.some(Boolean)
    };
  };

  if (isLoading) {
    return <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Protection Rules Info */}
      <div className="clay-card border-l-4 border-l-blue-400 p-4 bg-blue-50">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700">
            <p className="font-medium text-blue-900 mb-1">Manual Data Protection Rules</p>
            <ul className="text-xs space-y-1 list-disc list-inside text-blue-800">
              <li>Data marked as manually entered will NEVER be overwritten by AI</li>
              <li>Each field (website, permitting URL, requirements, documents) has its own protection flag</li>
              <li>Protected fields display a lock icon and won't be updated during batch operations</li>
              <li>You can toggle protection on any field individually</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bulk Add Jurisdictions */}
      <div className="clay-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Bulk Add Jurisdictions</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBulkAdd(!showBulkAdd)}
          >
            {showBulkAdd ? 'Hide' : 'Show'} Bulk Add
          </Button>
        </div>

        {showBulkAdd && (
          <div className="space-y-3 bg-gray-50 p-3 rounded-lg border">
            <p className="text-xs text-gray-600">
              Enter one jurisdiction per line in format: <strong>Name, State, Type</strong> (Type is optional, defaults to "county")
              <br />
              Example: <code className="bg-gray-200 px-1 rounded">Hamilton County, OH, county</code>
            </p>
            <textarea
              value={bulkAddText}
              onChange={(e) => setBulkAddText(e.target.value)}
              className="w-full h-32 p-2 border rounded text-sm"
              placeholder="Hamilton County, OH, county&#10;Cincinnati, OH, city&#10;Northern Kentucky, KY, county"
            />
            <Button
              onClick={handleBulkAdd}
              disabled={!bulkAddText.trim()}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Add Jurisdictions
            </Button>
          </div>
        )}
      </div>

      {/* Batch Update Settings */}
      <div className="clay-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Batch AI Research Settings</h3>
          <span className="text-xs text-gray-500">{selectedIds.size} selected</span>
        </div>

        <div className="space-y-3 bg-gray-50 p-3 rounded-lg border">
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-700">Update Official Websites</label>
            <Switch 
              checked={batchSettings.updateWebsites}
              onCheckedChange={(v) => setBatchSettings({...batchSettings, updateWebsites: v})}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-700">Update Permitting URLs</label>
            <Switch 
              checked={batchSettings.updatePermittingUrls}
              onCheckedChange={(v) => setBatchSettings({...batchSettings, updatePermittingUrls: v})}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-700">Update Permit Requirements</label>
            <Switch 
              checked={batchSettings.updateRequirements}
              onCheckedChange={(v) => setBatchSettings({...batchSettings, updateRequirements: v})}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-700">Update/Discover Documents</label>
            <Switch 
              checked={batchSettings.updateDocuments}
              onCheckedChange={(v) => setBatchSettings({...batchSettings, updateDocuments: v})}
            />
          </div>
          <div className="border-t pt-3 flex items-center justify-between bg-amber-50 p-2 rounded">
            <label className="text-sm text-amber-900 font-medium">Skip Manually Protected Data</label>
            <Switch 
              checked={batchSettings.skipManualData}
              onCheckedChange={(v) => setBatchSettings({...batchSettings, skipManualData: v})}
            />
          </div>
        </div>

        <Button 
          onClick={handleBatchUpdate}
          disabled={isBatchUpdating || selectedIds.size === 0}
          className="w-full bg-purple-600 hover:bg-purple-700 gap-2"
        >
          {isBatchUpdating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Updating {selectedIds.size} jurisdiction(s)...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              AI Research Selected ({selectedIds.size})
            </>
          )}
        </Button>
      </div>

      {/* Jurisdictions List */}
      <div className="clay-card overflow-hidden">
        <div className="p-4 border-b flex items-center gap-2">
          <Checkbox 
            checked={selectedIds.size === jurisdictions.length && jurisdictions.length > 0}
            onCheckedChange={(checked) => handleSelectAll(checked)}
          />
          <span className="text-sm font-medium text-gray-700">Select All</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectMissing}
            className="ml-2"
          >
            Select Jurisdictions Missing Information
          </Button>
        </div>

        <div className="divide-y max-h-[600px] overflow-y-auto">
          {jurisdictions.map(j => {
            const status = getDataStatus(j);
            const protection = getProtectionStatus(j);

            return (
              <div key={j.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3">
                  <Checkbox 
                    checked={selectedIds.has(j.id)}
                    onCheckedChange={(checked) => handleSelectOne(j.id, checked)}
                    className="mt-1"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-gray-800">{j.name}, {j.state}</h4>
                      {protection.locked && (
                        <Lock className="w-3.5 h-3.5 text-amber-500" title={`${protection.count} field(s) manually protected`} />
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant={status.hasWebsite ? "default" : "secondary"}>
                        {status.hasWebsite ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                        Website
                      </Badge>
                      <Badge variant={status.hasPermitting ? "default" : "secondary"}>
                        {status.hasPermitting ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                        Permitting URL
                      </Badge>
                      <Badge variant={status.hasRequirements ? "default" : "secondary"}>
                        {status.hasRequirements ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                        Requirements
                      </Badge>
                      <Badge variant={status.hasDocuments ? "default" : "secondary"}>
                        {status.hasDocuments ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                        {(j.documents || []).length} Docs
                      </Badge>
                      <Badge className="ml-auto bg-gray-200 text-gray-800">
                        {status.score}/4 Complete
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats Footer */}
      <div className="grid grid-cols-4 gap-3">
        <div className="clay-card p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{jurisdictions.length}</p>
          <p className="text-xs text-gray-500">Total Jurisdictions</p>
        </div>
        <div className="clay-card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{jurisdictions.filter(j => getDataStatus(j).score === 4).length}</p>
          <p className="text-xs text-gray-500">Fully Populated</p>
        </div>
        <div className="clay-card p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{jurisdictions.filter(j => getProtectionStatus(j).locked).length}</p>
          <p className="text-xs text-gray-500">With Protected Data</p>
        </div>
        <div className="clay-card p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{jurisdictions.filter(j => getDataStatus(j).score < 4).length}</p>
          <p className="text-xs text-gray-500">Need Updates</p>
        </div>
      </div>
    </div>
  );
}