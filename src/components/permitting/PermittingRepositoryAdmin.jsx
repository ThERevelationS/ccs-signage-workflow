import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useResearchProgress } from "./ResearchProgressContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, CheckCircle2, RefreshCw, Loader2, Lock, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { createJurisdictionIfAbsent, deleteJurisdictionFromLoadedSnapshot } from "./jurisdictionPersistence";

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
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [bulkAddError, setBulkAddError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ processed: 0, total: 0, currentJurisdiction: '' });
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
    
    setIsBulkAdding(true);
    setBulkAddError('');
    
    try {
      const lines = bulkAddText.trim().split('\n');
      const created = [];
      let existing = 0;
      let failed = 0;
      
      for (const line of lines) {
        const parts = line.trim().split(',').map(p => p.trim());
        if (parts.length >= 2) {
          const [name, state, type = 'county'] = parts;
          try {
            const result = await createJurisdictionIfAbsent({
              entity: base44.entities.JurisdictionProfile,
              data: { name, state, type, auto_refresh: true },
              label: `Bulk jurisdiction ${name}, ${state}`,
            });
            if (result.status === "existing" || result.status === "concurrent_duplicate_discarded") existing++;
            else created.push(result.record);
          } catch (e) {
            failed++;
            console.error(`Failed to create ${name}, ${state}:`, e);
          }
        }
      }
      
      if (created.length > 0) {
        await loadJurisdictions();
        setBulkAddText('');
        setShowBulkAdd(false);
        if (failed > 0 || existing > 0) {
          setBulkAddError(`Created ${created.length} jurisdictions${existing ? `, ${existing} already existed` : ""}${failed ? `, ${failed} failed` : ""}.`);
        }
      } else if (existing > 0) {
        await loadJurisdictions();
        setBulkAddError(`No duplicates were created; ${existing} jurisdiction${existing === 1 ? " already exists" : "s already exist"}.`);
      } else if (failed > 0) {
        setBulkAddError(`Failed to create any jurisdictions. Check the format.`);
      }
    } catch (e) {
      setBulkAddError(`Error: ${e.message}`);
      console.error('Bulk add error:', e);
    } finally {
      setIsBulkAdding(false);
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

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    const total = jurisdictions.length;
    setDeleteProgress({ processed: 0, total, currentJurisdiction: '' });
    
    let deleted = 0;
    try {
      for (let i = 0; i < jurisdictions.length; i++) {
        const jurisdiction = jurisdictions[i];
        setDeleteProgress({
          processed: i,
          total,
          currentJurisdiction: `${jurisdiction.name}, ${jurisdiction.state}`
        });
        
        try {
          await deleteJurisdictionFromLoadedSnapshot({
            entity: base44.entities.JurisdictionProfile,
            jurisdiction,
            label: `Admin delete ${jurisdiction.name || jurisdiction.id}`,
          });
          deleted++;
        } catch (e) {
          console.error(`Failed to delete ${jurisdiction.id}:`, e);
        }
        
        // Small delay to avoid rate limiting
        if (i < jurisdictions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      await loadJurisdictions();
      setShowDeleteConfirm(false);
      setDeleteProgress({ processed: 0, total: 0, currentJurisdiction: '' });
    } catch (e) {
      console.error("Delete all error:", e);
    } finally {
      setIsDeleting(false);
    }
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
              disabled={isBulkAdding}
            />
            {bulkAddError && (
              <div className={`text-xs p-2 rounded ${bulkAddError.includes('Failed') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                {bulkAddError}
              </div>
            )}
            <Button
              onClick={handleBulkAdd}
              disabled={!bulkAddText.trim() || isBulkAdding}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {isBulkAdding ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Adding...
                </>
              ) : (
                'Add Jurisdictions'
              )}
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

        <div className="flex gap-2">
          <Button 
            onClick={handleBatchUpdate}
            disabled={isBatchUpdating || selectedIds.size === 0}
            className="flex-1 bg-purple-600 hover:bg-purple-700 gap-2"
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
          <Button 
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting || jurisdictions.length === 0}
            variant="destructive"
            className="gap-2"
          >
            Delete All
          </Button>
        </div>
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

      {/* Delete All Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Jurisdictions?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {jurisdictions.length} jurisdictions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {isDeleting && (
            <div className="space-y-2 my-4">
              <Progress value={deleteProgress.total > 0 ? (deleteProgress.processed / deleteProgress.total) * 100 : 0} className="h-2" />
              <div className="text-xs text-gray-600 space-y-1">
                <p className="font-medium">{deleteProgress.processed} of {deleteProgress.total} deleted</p>
                {deleteProgress.currentJurisdiction && (
                  <p className="text-gray-500 truncate">Deleting: {deleteProgress.currentJurisdiction}</p>
                )}
              </div>
            </div>
          )}
          
          <div className="flex gap-2">
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete All'
              )}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}