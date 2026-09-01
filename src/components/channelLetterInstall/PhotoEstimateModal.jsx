import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, Upload, Wand2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const SCHEMA = {
  type: "object",
  properties: {
    estimated_height_feet: { type: "number", description: "Estimated install height from ground in feet" },
    wall_material: {
      type: "string",
      enum: ["eifs", "stucco", "brick", "concrete", "metal", "wood", "glass", "drywall"],
      description: "Best guess of the wall material"
    },
    recommended_install_type: {
      type: "string",
      enum: ["flush_mount", "halo_lit", "raceway", "dimensional_lettering"]
    },
    site_conditions: {
      type: "object",
      properties: {
        parapet: { type: "boolean" },
        poor_electrical_access: { type: "boolean" },
        thick_hollow_walls: { type: "boolean" }
      }
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    reasoning: { type: "string", description: "Brief explanation of what was observed" }
  }
};

export default function PhotoEstimateModal({ open, onClose, onApply }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setResult(null);
    setError(null);
  };

  const analyze = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You're a sign installer reviewing a photo of a site where channel letters will be installed.
Analyze the photo and estimate:
- The install height (feet from ground to where letters will go)
- The wall material (eifs, stucco, brick, concrete, metal, wood, glass, drywall)
- Recommended install type (flush_mount, halo_lit, raceway, dimensional_lettering)
- Site conditions: is there a parapet? poor electrical access? thick hollow walls?
- Your confidence level (low/medium/high)

Be specific and practical — these will be used in an estimate.`,
        file_urls: [file_url],
        response_json_schema: SCHEMA
      });
      setResult(res);
    } catch (e) {
      setError(e.message || "Analysis failed");
    }
    setLoading(false);
  };

  const apply = () => {
    if (!result) return;
    onApply(result);
    handleClose();
  };

  const handleClose = () => {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    onClose();
  };

  const confidenceColor = {
    high: "bg-green-100 text-green-800 border-green-200",
    medium: "bg-amber-100 text-amber-800 border-amber-200",
    low: "bg-red-100 text-red-800 border-red-200",
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-purple-600" />
            Photo → Estimate
          </DialogTitle>
          <p className="text-xs text-slate-500">Upload a photo of the install site — AI will estimate height, wall material, and conditions.</p>
        </DialogHeader>

        <div className="space-y-3">
          {!previewUrl ? (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-8 cursor-pointer hover:border-purple-400 hover:bg-purple-50/50 transition-colors">
              <Upload className="w-8 h-8 text-slate-400 mb-2" />
              <span className="text-sm font-medium text-slate-700">Click to upload a site photo</span>
              <span className="text-xs text-slate-500 mt-1">JPG, PNG, or HEIC</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>
          ) : (
            <div className="relative">
              <img src={previewUrl} alt="Site preview" className="w-full max-h-64 object-contain rounded-lg border border-slate-200 bg-slate-50" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setFile(null); setPreviewUrl(null); setResult(null); }}
                className="absolute top-2 right-2 h-7 text-xs bg-white"
              >
                Change
              </Button>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
          )}

          {result && (
            <div className="border border-purple-200 bg-purple-50/40 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-purple-900 flex items-center gap-1">
                  <Wand2 className="w-3.5 h-3.5" />
                  AI Analysis
                </div>
                {result.confidence && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${confidenceColor[result.confidence]}`}>
                    {result.confidence} confidence
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Field label="Install Height" value={`${result.estimated_height_feet || 0} ft`} />
                <Field label="Wall Material" value={result.wall_material || "—"} />
                <Field label="Recommended" value={result.recommended_install_type?.replace(/_/g, " ") || "—"} />
                <Field
                  label="Conditions"
                  value={[
                    result.site_conditions?.parapet && "parapet",
                    result.site_conditions?.poor_electrical_access && "poor electrical",
                    result.site_conditions?.thick_hollow_walls && "thick walls"
                  ].filter(Boolean).join(", ") || "none noted"}
                />
              </div>
              {result.reasoning && (
                <div className="text-[11px] text-slate-600 italic border-t border-purple-200 pt-1.5">
                  {result.reasoning}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
          {!result ? (
            <Button onClick={analyze} disabled={!file || loading} className="bg-purple-600 hover:bg-purple-700 text-white">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</> : <><Camera className="w-4 h-4 mr-2" /> Analyze Photo</>}
            </Button>
          ) : (
            <Button onClick={apply} className="bg-green-600 hover:bg-green-700 text-white">
              <Wand2 className="w-4 h-4 mr-2" /> Apply to New Line Item
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Field = ({ label, value }) => (
  <div className="bg-white rounded border border-purple-100 px-2 py-1.5">
    <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    <div className="font-medium text-slate-800 capitalize">{value}</div>
  </div>
);