import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Loader2, CheckCircle, SettingsIcon, RefreshCw, Shield, Download } from "lucide-react";
import JurisdictionAccuracyAudit from "@/components/admin/JurisdictionAccuracyAudit";
import JurisdictionMonitoringSettings from "@/components/admin/JurisdictionMonitoringSettings";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

export default function AdminPermittingSettings() {
  const [activeTab, setActiveTab] = useState("batch");
  const [jurisdictions, setJurisdictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [selectedJurisdictions, setSelectedJurisdictions] = useState(new Set());
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, current: "" });
  const [batchSettings, setBatchSettings] = useState({
    updateWebsiteUrls: true,
    updatePermittingUrls: true,
    updateRequirements: true,
    updateDocuments: true,
    skipManualData: true,
    autoBackup: true
  });
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await loadAllEntityRows({
          entity: base44.entities.JurisdictionProfile,
          sort: null,
          label: "Permitting admin jurisdiction catalog",
        });
        setJurisdictions(Array.isArray(res) ? res : []);
      } catch (e) {
        console.error("Error loading jurisdictions:", e);
        setMessage({ type: 'error', text: 'Failed to load jurisdictions' });
      }
      setLoading(false);
    };
    load();
  }, []);

  const toggleJurisdiction = (id) => {
    const newSet = new Set(selectedJurisdictions);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedJurisdictions(newSet);
  };

  const toggleAll = () => {
    if (selectedJurisdictions.size === jurisdictions.length) {
      setSelectedJurisdictions(new Set());
    } else {
      setSelectedJurisdictions(new Set(jurisdictions.map(j => j.id)));
    }
  };

  const researchOne = async (jurisdiction) => {
    const request = await base44.functions.invoke('permittingproxy',
 {
      action: 'create',
      payload: {
        jurisdiction_name: jurisdiction.name,
        state: jurisdiction.state || "",
        city: jurisdiction.name,
        county: jurisdiction.parent_county?.name || "",
        ccs_jurisdiction_id: jurisdiction.id,
        status: 'pending',
        requested_by: 'batch_update'
      }
    });

    const maxWait = 180000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 5000));
      const record = await base44.functions.invoke('permittingproxy',
 {
        action: 'poll',
        payload: { id: request.id }
      });
      const data = record.data || record;
      if (data.status === 'completed') return true;
      if (data.status === 'failed') throw new Error(`Research failed for ${jurisdiction.name}: ${data.error}`);
    }
    throw new Error(`Timed out waiting for ${jurisdiction.name}`);
  };

  const handleBatchUpdate = async () => {
    if (selectedJurisdictions.size === 0) {
      setMessage({ type: 'error', text: 'Please select at least one jurisdiction' });
      return;
    }

    setBatchUpdating(true);
    setMessage(null);

    const selected = jurisdictions.filter(j => selectedJurisdictions.has(j.id));
    setBatchProgress({ done: 0, total: selected.length, current: "" });

    let updated = 0;
    let failed = 0;

    for (const jurisdiction of selected) {
      setBatchProgress(p => ({ ...p, current: jurisdiction.name }));
      try {
        await researchOne(jurisdiction);
        updated++;
      } catch (e) {
        console.error(e);
        failed++;
      }
      setBatchProgress(p => ({ ...p, done: p.done + 1 }));
    }

    const refreshed = await loadAllEntityRows({
      entity: base44.entities.JurisdictionProfile,
      sort: null,
      label: "Permitting admin jurisdiction refresh",
    });
    setJurisdictions(Array.isArray(refreshed) ? refreshed : []);
    setSelectedJurisdictions(new Set());
    setBatchProgress({ done: 0, total: 0, current: "" });

    setMessage({
      type: failed === 0 ? 'success' : 'warning',
      text: `Batch complete: ${updated} updated${failed > 0 ? `, ${failed} failed` : ''}.`
    });

    setBatchUpdating(false);
  };

  const triggerBackup = async () => {
    setBackingUp(true);
    try {
      const res = await base44.functions.invoke('backupPermittingRepository', {
        jurisdictionIds: Array.from(selectedJurisdictions).length > 0
          ? Array.from(selectedJurisdictions)
          : undefined
      });
      if (res.data?.success) {
        setMessage({
          type: 'success',
          text: `Backed up to Google Drive (${res.data.foldersCreated || 0} folders, ${res.data.filesUploaded || 0} files).`
        });
      } else {
        setMessage({ type: 'warning', text: 'Backup completed with warnings: ' + (res.data?.warning || '') });
      }
    } catch (e) {
      console.error("Backup error:", e);
      setMessage({ type: 'error', text: 'Error during backup' });
    }
    setBackingUp(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="w-8 h-8 text-purple-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Permitting Repository Admin</h1>
            <p className="text-sm text-gray-500">Batch updates, safeguards, backup, and AI monitoring</p>
          </div>
        </div>

        <div className="flex gap-1 border-b border-gray-200">
          {[
            { key: "batch", label: "Batch Updates" },
            { key: "monitoring", label: "Change Monitoring" },
            { key: "audit", label: "AI Accuracy Auditor" }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-px border-b-2 ${
                activeTab === tab.key
                  ? 'border-purple-500 text-purple-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {message && activeTab === "batch" && (
          <div className={`p-4 rounded-lg border flex items-start gap-3 ${
            message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
            message.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
            'bg-yellow-50 border-yellow-200 text-yellow-800'
          }`}>
            {message.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
            {message.type === 'success' && <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
            <p className="text-sm">{message.text}</p>
          </div>
        )}

        {activeTab === "monitoring" && <JurisdictionMonitoringSettings />}

        {activeTab === "audit" && (
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <JurisdictionAccuracyAudit />
          </div>
        )}

        {activeTab === "batch" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Update Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { key: 'updateWebsiteUrls', label: 'Website URLs' },
                    { key: 'updatePermittingUrls', label: 'Permitting URLs' },
                    { key: 'updateRequirements', label: 'Requirements' },
                    { key: 'updateDocuments', label: 'Documents' }
                  ].map(item => (
                    <label key={item.key} className="flex items-center gap-3 cursor-pointer">
                      <Checkbox
                        checked={batchSettings[item.key]}
                        onCheckedChange={(checked) =>
                          setBatchSettings(prev => ({ ...prev, [item.key]: checked }))
                        }
                      />
                      <span className="text-sm text-gray-700">{item.label}</span>
                    </label>
                  ))}

                  <div className="border-t pt-4 space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <Checkbox
                        checked={batchSettings.skipManualData}
                        onCheckedChange={(checked) =>
                          setBatchSettings(prev => ({ ...prev, skipManualData: checked }))
                        }
                        className="mt-1"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-700">Protect Manual Data</p>
                        <p className="text-xs text-gray-500">Never override manually edited fields</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer">
                      <Checkbox
                        checked={batchSettings.autoBackup}
                        onCheckedChange={(checked) =>
                          setBatchSettings(prev => ({ ...prev, autoBackup: checked }))
                        }
                        className="mt-1"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-700">Auto Backup</p>
                        <p className="text-xs text-gray-500">Backup to Google Drive after update</p>
                      </div>
                    </label>
                  </div>

                  {batchUpdating && batchProgress.total > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span className="truncate">{batchProgress.current}</span>
                        <span>{batchProgress.done}/{batchProgress.total}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={handleBatchUpdate}
                    disabled={batchUpdating || selectedJurisdictions.size === 0}
                    className="w-full bg-purple-600 hover:bg-purple-700 mt-4"
                  >
                    {batchUpdating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Updating {batchProgress.done + 1} of {batchProgress.total}...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Update Selected ({selectedJurisdictions.size})
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={triggerBackup}
                    disabled={backingUp}
                    variant="outline"
                    className="w-full"
                  >
                    {backingUp ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Backing Up...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Manual Backup
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Jurisdictions</CardTitle>
                      <CardDescription>{jurisdictions.length} profiles</CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={toggleAll} className="text-xs">
                      {selectedJurisdictions.size === jurisdictions.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                  ) : jurisdictions.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">No jurisdictions found</p>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {jurisdictions.map(jurisdiction => (
                        <label
                          key={jurisdiction.id}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors ${
                            batchUpdating && batchProgress.current === jurisdiction.name
                              ? 'bg-purple-50 border-purple-300'
                              : 'hover:bg-gray-50 border-transparent hover:border-gray-200'
                          }`}
                        >
                          <Checkbox
                            checked={selectedJurisdictions.has(jurisdiction.id)}
                            onCheckedChange={() => toggleJurisdiction(jurisdiction.id)}
                            disabled={batchUpdating}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {jurisdiction.name}, {jurisdiction.state}
                            </p>
                            <div className="flex gap-2 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-xs">{jurisdiction.type}</Badge>
                              {jurisdiction.documents?.length > 0 && (
                                <Badge variant="outline" className="text-xs bg-blue-50">
                                  {jurisdiction.documents.length} docs
                                </Badge>
                              )}
                              {jurisdiction.permit_requirements?.requires_permit && (
                                <Badge variant="outline" className="text-xs bg-green-50">
                                  Permits Required
                                </Badge>
                              )}
                            </div>
                          </div>
                          {batchUpdating && batchProgress.current === jurisdiction.name && (
                            <Loader2 className="w-4 h-4 animate-spin text-purple-500 flex-shrink-0" />
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-base">How This Works</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700 space-y-2">
                <p>
                  <strong>AI-Powered Updates:</strong> Each selected jurisdiction is sent to the Permitting Super-Agent, which researches sign permit requirements, ordinances, contacts, fees, and documents in real time.
                </p>
                <p>
                  <strong>Manual Data Protection:</strong> When "Protect Manual Data" is enabled, any fields you've manually edited won't be overwritten during batch updates.
                </p>
                <p>
                  <strong>Backup System:</strong> Each jurisdiction gets its own folder in your "Permitting Repository" Google Drive folder. PDFs and documents are automatically backed up with every update.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}