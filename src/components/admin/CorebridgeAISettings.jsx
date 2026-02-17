import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Bot,
  Mail,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  FileText,
  ArrowRight,
  Zap,
  Info,
  Building2,
  Package
} from "lucide-react";
import { processCorebridgeEmails } from "@/functions/processCorebridgeEmails";

const GlobalSettings = base44.entities.GlobalSettings;

export default function CorebridgeAISettings() {
  const [isEnabled, setIsEnabled] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [settingId, setSettingId] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await GlobalSettings.filter({ setting_key: "corebridgeAI" });
      if (settings.length > 0) {
        setIsEnabled(settings[0].setting_value?.enabled !== false);
        setSettingId(settings[0].id);
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  };

  const saveEnabled = async (val) => {
    setIsEnabled(val);
    setIsSaving(true);
    try {
      if (settingId) {
        await GlobalSettings.update(settingId, { setting_value: { enabled: val } });
      } else {
        const created = await GlobalSettings.create({
          setting_key: "corebridgeAI",
          setting_value: { enabled: val }
        });
        setSettingId(created.id);
      }
    } catch (err) {
      console.error("Error saving:", err);
    }
    setIsSaving(false);
  };

  const handleTestRun = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await processCorebridgeEmails({});
      setTestResult({ success: true, data: res.data });
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    }
    setIsTesting(false);
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="clay-card p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
              <Bot className="w-7 h-7 text-purple-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">CoreBridge AI Email Importer</h2>
              <p className="text-sm text-gray-500 mt-1">
                Automatically creates or updates projects from CoreBridge estimate & invoice emails
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isSaving && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            <Switch checked={isEnabled} onCheckedChange={saveEnabled} />
            <Badge className={isEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
              {isEnabled ? "Active" : "Disabled"}
            </Badge>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="clay-card p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-500" />
          How It Works
        </h3>
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 font-bold text-blue-700 text-sm">1</div>
            <div>
              <p className="font-medium text-sm text-gray-800">Monitors Gmail every 10 minutes</p>
              <p className="text-xs text-gray-500 mt-0.5">Scans <span className="font-mono bg-gray-100 px-1 rounded">ccsworkflow.noreply@gmail.com</span> for unread emails with subjects like <span className="font-mono bg-gray-100 px-1 rounded">Your Sign Estimate: EST-XXXXX</span> or <span className="font-mono bg-gray-100 px-1 rounded">Your Sign Invoice: INV-XXXXX</span></p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 font-bold text-purple-700 text-sm">2</div>
            <div>
              <p className="font-medium text-sm text-gray-800">AI extracts data from the PDF</p>
              <p className="text-xs text-gray-500 mt-0.5">Downloads the attached PDF and uses AI to pull: client name, billing/install address, products, quoted amount, salesperson, payment terms, and more</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 font-bold text-green-700 text-sm">3</div>
            <div>
              <p className="font-medium text-sm text-gray-800">Creates or updates a Work Order</p>
              <p className="text-xs text-gray-500 mt-0.5">New estimates create a Sales Pipeline entry at the <span className="font-semibold">Sales</span> stage. Revisions update the existing project. If an estimate number becomes an invoice, the project automatically moves to <span className="font-semibold">Production (WIP)</span>.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 font-bold text-orange-700 text-sm">4</div>
            <div>
              <p className="font-medium text-sm text-gray-800">Marks email as read</p>
              <p className="text-xs text-gray-500 mt-0.5">Processed emails are marked as read so they won't be picked up again</p>
            </div>
          </div>
        </div>
      </div>

      {/* Logic Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="clay-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-blue-600" />
            <h4 className="font-semibold text-sm text-gray-800">Estimate Email (EST-XXXXX)</h4>
          </div>
          <div className="space-y-2 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <ArrowRight className="w-3 h-3 text-green-500 flex-shrink-0" />
              <span><strong>New:</strong> Creates work order in <span className="bg-blue-100 text-blue-700 px-1 rounded">Sales</span> stage, status = <span className="bg-yellow-100 text-yellow-700 px-1 rounded">Quoted</span></span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="w-3 h-3 text-blue-500 flex-shrink-0" />
              <span><strong>Revision:</strong> Updates amount, address, and document number on existing project</span>
            </div>
          </div>
        </div>

        <div className="clay-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-orange-600" />
            <h4 className="font-semibold text-sm text-gray-800">Invoice Email (INV-XXXXX)</h4>
          </div>
          <div className="space-y-2 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <ArrowRight className="w-3 h-3 text-green-500 flex-shrink-0" />
              <span><strong>New:</strong> Creates work order directly in <span className="bg-purple-100 text-purple-700 px-1 rounded">Production</span> stage, status = <span className="bg-green-100 text-green-700 px-1 rounded">Won</span></span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="w-3 h-3 text-orange-500 flex-shrink-0" />
              <span><strong>EST → INV:</strong> Existing estimate project moves to <span className="bg-purple-100 text-purple-700 px-1 rounded">Production</span> automatically (WIP)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Fields Extracted */}
      <div className="clay-card p-4">
        <h4 className="font-semibold text-sm text-gray-800 mb-3 flex items-center gap-2">
          <Package className="w-4 h-4 text-purple-500" />
          Fields Extracted from PDF
        </h4>
        <div className="flex flex-wrap gap-2">
          {[
            "Client Name", "Contact Name", "Billing Address", "Install Location",
            "Products (1-5)", "Quoted Amount", "Sales Rep", "Payment Terms",
            "Document Number", "Description"
          ].map(field => (
            <span key={field} className="bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-3 py-1 text-xs font-medium">
              {field}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          AI only populates fields it finds in the PDF — it will not guess or fill in data that isn't there.
        </p>
      </div>

      {/* Test Run */}
      <div className="clay-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-semibold text-sm text-gray-800">Manual Trigger</h4>
            <p className="text-xs text-gray-500 mt-0.5">Run the importer now to check for any unread CoreBridge emails</p>
          </div>
          <Button
            onClick={handleTestRun}
            disabled={isTesting}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isTesting ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Running...</>
            ) : (
              <><RefreshCw className="w-4 h-4 mr-2" />Run Now</>
            )}
          </Button>
        </div>

        {testResult && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            {testResult.success ? (
              <div>
                <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Run completed — {testResult.data?.processed ?? 0} email(s) processed
                </div>
                {testResult.data?.results?.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {testResult.data.results.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                        {r.action === 'created' && <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Created</span>}
                        {r.action === 'updated' && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Updated</span>}
                        {r.action === 'error' && <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Error</span>}
                        <span>{r.docNumber} — {r.client || r.error}</span>
                        {r.estToInv && <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">→ WIP</span>}
                      </div>
                    ))}
                  </div>
                )}
                {testResult.data?.processed === 0 && (
                  <p className="text-xs text-gray-500">No new unread CoreBridge emails found in inbox.</p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-4 h-4" />
                Error: {testResult.error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Schedule Info */}
      <div className="clay-card p-4 bg-blue-50/50 border border-blue-100">
        <div className="flex items-center gap-2 text-blue-700 text-sm">
          <Mail className="w-4 h-4 flex-shrink-0" />
          <span>This automation runs automatically every <strong>10 minutes</strong> via the scheduled automation <em>"Process CoreBridge Emails"</em> in the Base44 automations panel.</span>
        </div>
      </div>
    </div>
  );
}