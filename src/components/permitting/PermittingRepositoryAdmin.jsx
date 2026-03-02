import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useResearchProgress } from "./ResearchProgressContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  const [progressDialog, setProgressDialog] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(false);
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

    setConfirmDialog(true);
  };

  const proceedWithUpdate = async () => {
    setConfirmDialog(false);
    const idsToUpdate = Array.from(selectedIds);

    // Update global progress
    startResearch(idsToUpdate.length);
    
    // Also update local progress dialog for admin panel feedback
    setProgressDialog({
      total: idsToUpdate.length,
      processed: 0,
      updated: 0,
      skipped: 0,
      currentJurisdiction: null,
      results: []
    });

    setBatchUpdating(true);
    try {
      const res = await base44.functions.invoke('batchUpdateJurisdictions', {
        jurisdictionIds: idsToUpdate,
        settings: batchSettings
      });

      if (res.data?.success) {
        completeResearch(res.data.updated, res.data.skipped);
        setProgressDialog(prev => ({
          ...prev,
          processed: res.data.total,
          updated: res.data.updated,
          skipped: res.data.skipped,
          isComplete: true
        }));
        
        setTimeout(() => {
          loadJurisdictions();
          setSelectedIds(new Set());
          setProgressDialog(null);
        }, 2000);
      } else {
        const errorMsg = res.data?.message || "Unknown error";
        completeResearch(0, 0, errorMsg);
        setProgressDialog(prev => ({
          ...prev,
          error: errorMsg,
          isComplete: true
        }));
      }
    } catch (e) {
      console.error("Batch update error:", e);
      completeResearch(0, 0, e.message);
      setProgressDialog(prev => ({
        ...prev,
        error: e.message,
        isComplete: true
      }));
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
    <>
      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start AI Research</DialogTitle>
            <DialogDescription>
              Research and update {selectedIds.size} jurisdiction(s) with AI discovery
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-900">
                <span className="font-semibold">{selectedIds.size} jurisdictions</span> will be researched and updated with verified information from official government sources.
              </p>
            </div>

            <div className="text-sm text-gray-600 space-y-2">
              <p className="font-medium text-gray-800">Settings:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                {batchSettings.updateWebsites && <li>Update official websites</li>}
                {batchSettings.updatePermittingUrls && <li>Update permitting URLs</li>}
                {batchSettings.updateRequirements && <li>Update permit requirements</li>}
                {batchSettings.updateDocuments && <li>Discover documents</li>}
                {batchSettings.skipManualData && <li>Protect manually entered data</li>}
              </ul>
            </div>

            {batchSettings.skipManualData && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-900">
                  <span className="font-semibold">Protected:</span> Fields you've manually edited won't be overwritten.
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setConfirmDialog(false)}>
              Cancel
            </Button>
            <Button onClick={proceedWithUpdate} className="bg-purple-600 hover:bg-purple-700">
              Start Research
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Progress Dialog */}
      {progressDialog && (
        <Dialog open={!!progressDialog} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {progressDialog.isComplete ? (
                  <>
                    <CheckCircle2 className={`w-5 h-5 ${progressDialog.error ? 'text-red-500' : 'text-green-500'}`} />
                    {progressDialog.error ? 'Update Failed' : 'Research Complete'}
                  </>
                ) : (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                    Researching Jurisdictions...
                  </>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Progress Bar */}
              {!progressDialog.isComplete && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700 font-medium">Progress</span>
                    <span className="text-gray-600">
                      {progressDialog.processed}/{progressDialog.total}
                    </span>
                  </div>
                  <Progress
                    value={(progressDialog.processed / progressDialog.total) * 100}
                    className="h-2"
                  />
                  <p className="text-xs text-gray-500 text-center">
                    {Math.round((progressDialog.processed / progressDialog.total) * 100)}%
                  </p>
                </div>
              )}

              {/* Results */}
              {progressDialog.isComplete && (
                <div className="space-y-3">
                  {progressDialog.error ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-900">
                        <span className="font-semibold">Error:</span> {progressDialog.error}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                          <p className="text-2xl font-bold text-green-600">{progressDialog.updated}</p>
                          <p className="text-xs text-green-700 font-medium">Updated</p>
                        </div>
                        <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                          <p className="text-2xl font-bold text-amber-600">{progressDialog.skipped}</p>
                          <p className="text-xs text-amber-700 font-medium">Skipped</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                          <p className="text-2xl font-bold text-blue-600">{progressDialog.total}</p>
                          <p className="text-xs text-blue-700 font-medium">Total</p>
                        </div>
                      </div>

                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-sm text-green-900">
                          All selected jurisdictions have been processed. Updated data will reload in a moment.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {progressDialog.isComplete && (
              <div className="flex gap-3 justify-end">
                <Button 
                  onClick={() => setProgressDialog(null)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  Close
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

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
    </>
  );
}