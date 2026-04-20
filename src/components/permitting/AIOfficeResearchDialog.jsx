import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { aiResearchOffice } from "@/functions/aiResearchOffice";

/**
 * AI Research dialog: user types a rough office name, AI returns a fully
 * populated office (name, type, contact info, suggested workflow steps).
 */
export default function AIOfficeResearchDialog({ isOpen, onClose, onCreate, officeTypes }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const reset = () => {
    setQuery("");
    setState("");
    setResult(null);
    setError("");
    setLoading(false);
  };

  const runResearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await aiResearchOffice({
        query: query.trim(),
        state: state.trim(),
        existing_office_types: officeTypes || []
      });
      if (res?.data?.success && res.data.office) {
        setResult(res.data.office);
      } else {
        setError(res?.data?.error || "AI research failed");
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "AI research failed");
    }
    setLoading(false);
  };

  const acceptResult = () => {
    if (!result) return;
    const steps = (result.workflow_steps || []).map((s, i) => ({
      id: `${Date.now()}-${i}-${Math.random()}`,
      name: s.name,
      type: s.type,
      followup_interval_days: s.type === 'followup_date' ? (s.followup_interval_days || 14) : undefined,
      order: i
    }));
    onCreate({
      id: `${Date.now()}-${Math.random()}`,
      name: result.name || "",
      office_type: result.office_type || "",
      contact_phone: result.contact_phone || "",
      contact_email: result.contact_email || "",
      contact_website: result.contact_website || "",
      contact_address: result.contact_address || "",
      contact_notes: result.contact_notes || "",
      workflow_steps: steps
    });
    reset();
    onClose();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            AI Research Office
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Office / Jurisdiction Name</Label>
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. Hamilton County Zoning, Florence KY Building Dept"
              className="h-9"
              disabled={loading}
              onKeyDown={e => e.key === 'Enter' && !loading && runResearch()}
            />
          </div>
          <div>
            <Label className="text-xs">State (optional, helps accuracy)</Label>
            <Input
              value={state}
              onChange={e => setState(e.target.value)}
              placeholder="e.g. KY, OH"
              className="h-9"
              disabled={loading}
              maxLength={30}
            />
          </div>

          {!result && !loading && (
            <Button onClick={runResearch} disabled={!query.trim()} className="w-full bg-purple-600 hover:bg-purple-700 gap-2">
              <Sparkles className="w-4 h-4" /> Research with AI
            </Button>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Researching... this can take 10-20 seconds.</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="p-3 bg-green-50 border border-green-200 rounded text-sm flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-800">Found it!</p>
                  {result.confidence && (
                    <p className="text-xs text-green-700">Confidence: {result.confidence}</p>
                  )}
                </div>
              </div>

              <div className="bg-white border rounded p-3 space-y-2 text-sm max-h-80 overflow-y-auto">
                <div>
                  <span className="text-[10px] text-gray-500 uppercase">Corrected Name</span>
                  <div className="font-semibold">{result.name}</div>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 uppercase">Office Type</span>
                  <div>{result.office_type || <span className="text-gray-400">—</span>}</div>
                </div>
                {(result.contact_phone || result.contact_email || result.contact_website) && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {result.contact_phone && <div><span className="text-gray-500">Phone:</span> {result.contact_phone}</div>}
                    {result.contact_email && <div><span className="text-gray-500">Email:</span> {result.contact_email}</div>}
                    {result.contact_website && <div className="col-span-2 truncate"><span className="text-gray-500">Web:</span> {result.contact_website}</div>}
                    {result.contact_address && <div className="col-span-2"><span className="text-gray-500">Addr:</span> {result.contact_address}</div>}
                  </div>
                )}
                {result.workflow_steps?.length > 0 && (
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase">Suggested Workflow ({result.workflow_steps.length} steps)</span>
                    <ol className="list-decimal list-inside text-xs space-y-0.5 mt-1">
                      {result.workflow_steps.map((s, i) => (
                        <li key={i}>{s.name} <span className="text-gray-400">({s.type})</span></li>
                      ))}
                    </ol>
                  </div>
                )}
                {result.notes && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded">
                    <strong>Verify:</strong> {result.notes}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setResult(null); }} className="flex-1">Research Again</Button>
                <Button onClick={acceptResult} className="flex-1 bg-purple-600 hover:bg-purple-700">Add to Catalog</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}