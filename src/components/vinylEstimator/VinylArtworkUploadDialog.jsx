// Artwork upload — Feature #19.
// Hybrid pipeline: free metadata first (SVG viewBox / PDF MediaBox / image px+DPI),
// AI vision (InvokeLLM) as fallback.

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { UploadCloud, FileImage, Wand2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const svgDims = async (file) => {
  const text = await file.text();
  const m = text.match(/viewBox\s*=\s*"([\d.\s-]+)"/i);
  if (m) {
    const parts = m[1].split(/\s+/).map(parseFloat);
    if (parts.length >= 4) return { w: parts[2], h: parts[3], unit: "svg" };
  }
  const wm = text.match(/<svg[^>]*\bwidth\s*=\s*"([\d.]+)/i);
  const hm = text.match(/<svg[^>]*\bheight\s*=\s*"([\d.]+)/i);
  if (wm && hm) return { w: parseFloat(wm[1]), h: parseFloat(hm[1]), unit: "svg" };
  return null;
};

const imgDims = (file) => new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight, unit: "px" }); };
  img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
  img.src = url;
});

const pdfDims = async (file) => {
  const buf = await file.arrayBuffer();
  const sample = new TextDecoder("latin1").decode(buf.slice(0, 200_000));
  const m = sample.match(/\/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*\]/);
  if (!m) return null;
  const x = parseFloat(m[1]); const y = parseFloat(m[2]);
  const x2 = parseFloat(m[3]); const y2 = parseFloat(m[4]);
  const wPt = Math.abs(x2 - x); const hPt = Math.abs(y2 - y);
  return { w: wPt / 72, h: hPt / 72, unit: "in" };
};

const aiDims = async (file) => {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  const response = await base44.integrations.Core.InvokeLLM({
    prompt:
      "Look at this artwork file. Return the width and height of the printable artwork " +
      "bounding box in INCHES. If the file shows real-world dimensions or has a known " +
      "common size, use that. Otherwise estimate from proportions. Always positive numbers.",
    file_urls: [file_url],
    response_json_schema: {
      type: "object",
      properties: {
        width_inches:  { type: "number" },
        height_inches: { type: "number" },
        confidence:    { type: "string", enum: ["low", "medium", "high"] },
        reasoning:     { type: "string" },
      },
      required: ["width_inches", "height_inches"],
    },
  });
  if (!response?.width_inches || !response?.height_inches) return null;
  return {
    w: parseFloat(response.width_inches),
    h: parseFloat(response.height_inches),
    unit: "in",
    confidence: response.confidence,
    reasoning: response.reasoning,
  };
};

export default function VinylArtworkUploadDialog({ open, onClose, onAdd }) {
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [scale, setScale] = useState(96);
  const [error, setError] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const reset = () => { setFile(null); setParsed(null); setError(null); setAiLoading(false); };

  const handleFile = async (f) => {
    setError(null); setParsed(null); setFile(f);
    if (!f) return;
    try {
      let dims = null;
      const name = f.name.toLowerCase();
      if (f.type === "image/svg+xml" || name.endsWith(".svg")) {
        dims = await svgDims(f); if (dims) dims.source = "svg-viewBox";
      } else if (f.type === "application/pdf" || name.endsWith(".pdf")) {
        dims = await pdfDims(f); if (dims) dims.source = "pdf-MediaBox";
      } else if (name.endsWith(".ai")) {
        dims = await pdfDims(f); if (dims) dims.source = "ai-MediaBox";
      } else if (f.type.startsWith("image/")) {
        dims = await imgDims(f); if (dims) dims.source = "raster-pixels";
      }
      if (dims) setParsed({ name: f.name.replace(/\.[^.]+$/, ""), ...dims });
      else setError("Couldn't read dimensions from this file. Try AI fallback below.");
    } catch (e) { setError(e.message || "Failed to parse file."); }
  };

  const runAi = async () => {
    if (!file) return;
    setAiLoading(true); setError(null);
    try {
      const dims = await aiDims(file);
      if (!dims) { setError("AI couldn't determine dimensions."); return; }
      setParsed({ name: file.name.replace(/\.[^.]+$/, ""), ...dims, source: `ai-${dims.confidence || ""}` });
    } catch (e) { setError("AI lookup failed: " + (e.message || e)); }
    setAiLoading(false);
  };

  const finalInches = (() => {
    if (!parsed) return { w: 0, h: 0 };
    if (parsed.unit === "in" || parsed.unit === "svg") return { w: parsed.w, h: parsed.h };
    if (parsed.unit === "px") return { w: parsed.w / Math.max(1, scale), h: parsed.h / Math.max(1, scale) };
    return { w: parsed.w, h: parsed.h };
  })();

  const handleAdd = () => {
    if (!parsed) return;
    onAdd({
      id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      description: parsed.name,
      width_inches: parseFloat(finalInches.w.toFixed(3)),
      height_inches: parseFloat(finalInches.h.toFixed(3)),
      quantity: 1,
      bleed_inches: 0,
      allow_rotation: true,
    });
    reset(); onClose();
  };

  const sourceLabel = ({
    "svg-viewBox":    "✓ SVG viewBox (exact)",
    "pdf-MediaBox":   "✓ PDF MediaBox (exact)",
    "ai-MediaBox":    "✓ AI artwork MediaBox (exact)",
    "raster-pixels":  "Raster pixels — set DPI",
  })[parsed?.source] || (parsed?.source?.startsWith("ai-") ? `🤖 AI vision (${parsed.confidence || "estimated"})` : null);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-blue-600" /> Upload Artwork
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Drop an SVG, PDF, AI, or image. Dimensions are read from the file (free).
            If the file has none, use the AI button to detect them.
          </p>
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center bg-slate-50">
            <input
              type="file"
              accept=".svg,.pdf,.ai,image/svg+xml,image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => handleFile(e.target.files?.[0])}
              className="text-xs"
            />
            <FileImage className="w-8 h-8 mx-auto mt-2 text-slate-400" />
          </div>

          {parsed?.unit === "px" && (
            <div>
              <Label className="text-xs">DPI (pixels per inch)</Label>
              <Input type="number" value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value) || 96)}
                className="h-8 text-sm tabular-nums" />
            </div>
          )}

          {parsed && (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-xs space-y-1">
              <div className="font-semibold">{parsed.name}</div>
              {sourceLabel && <div className="text-[11px] text-slate-600">{sourceLabel}</div>}
              <div className="text-slate-700">
                Raw: {parsed.w.toFixed(2)} × {parsed.h.toFixed(2)} {parsed.unit}
              </div>
              <div className="font-medium tabular-nums text-emerald-900">
                → {finalInches.w.toFixed(2)}″ × {finalInches.h.toFixed(2)}″
              </div>
              {parsed.reasoning && (
                <div className="text-[10px] text-slate-500 italic mt-1">{parsed.reasoning}</div>
              )}
            </div>
          )}

          {file && (
            <Button variant="outline" size="sm" onClick={runAi} disabled={aiLoading} className="w-full">
              {aiLoading
                ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Asking AI…</>
                : <><Wand2 className="w-3.5 h-3.5 mr-1" /> {parsed ? "Re-check with AI" : "Use AI to detect dimensions"}</>}
            </Button>
          )}

          {error && <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={handleAdd} disabled={!parsed} className="bg-blue-600 hover:bg-blue-700 text-white">
            Add as Part
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}