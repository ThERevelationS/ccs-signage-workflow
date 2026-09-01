import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Wand2, Image as ImageIcon, X, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          installation_type: {
            type: "string",
            enum: ["flush_mount", "halo_lit", "raceway", "dimensional_lettering"]
          },
          qty_letters: { type: "number" },
          letter_size: {
            type: "string",
            enum: ["extra_small", "small", "medium", "large", "extra_large", "extra_extra_large"]
          },
          letter_height_inches: { type: "number" },
          installation_height_feet: { type: "number" },
          raceway_length_feet: { type: "number" },
          wall_material: { type: "string", enum: ["eifs", "stucco", "brick", "concrete", "metal", "wood", "glass", "drywall"] },
          parapet: { type: "boolean" },
          poor_electrical_access: { type: "boolean" },
          thick_hollow_walls: { type: "boolean" },
          escort_required: { type: "boolean" },
          badging_checkin: { type: "boolean" },
          after_hours_weekend: { type: "boolean" },
          set_hours_installation: { type: "boolean" },
          poor_site_access: { type: "boolean" }
        },
        required: ["installation_type", "qty_letters"]
      }
    },
    notes: { type: "string" }
  }
};

export default function AIInstallScopeModal({ open, onClose, onApply }) {
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mockups, setMockups] = useState([]); // [{ url, name }]
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("append"); // "append" | "replace"

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = [];
      for (const file of Array.from(files)) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        uploaded.push({ url: file_url, name: file.name });
      }
      setMockups((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setError(e.message || "Upload failed");
    }
    setUploading(false);
  };

  const removeMockup = (idx) => {
    setMockups((prev) => prev.filter((_, i) => i !== idx));
  };

  const canGenerate = !loading && !uploading && (rawText.trim().length > 0 || mockups.length > 0);

  const generate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const hasImages = mockups.length > 0;
      const hasText = rawText.trim().length > 0;

      const imageInstructions = hasImages ? `
You've also been provided with ${mockups.length === 1 ? "a sign mockup image" : `${mockups.length} sign mockup images`}. Carefully analyze:
- Count the actual letters/characters in each mockup (don't include spaces in count)
- Estimate letter height proportions if a height isn't stated
- Identify if the sign appears to be flush-mounted, halo-lit (backlit glow), raceway-mounted (visible horizontal mounting bar behind letters), or dimensional (flat cut, non-illuminated)
- Note wall material if visible (EIFS, brick, stucco, glass, metal, etc.)
- Flag any visible site conditions (parapet wall, height obstacles, signs of difficult access)
- If multiple distinct signs appear, create a separate line item for each
${hasText ? "Use the written notes below as the primary source of truth; the image fills in gaps." : "Generate items based on what you observe in the image(s)."}` : "";

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a sign-installation estimator. Parse the input into structured installation line items.
${imageInstructions}

Map installation_type:
- "flush mount" or "face-lit" → flush_mount
- "halo lit" / "backlit" / "reverse channel" → halo_lit
- "raceway mounted" or "raceway" → raceway
- "dimensional" / "flat cut" / "pvc letters" → dimensional_lettering

Map letter_size from letter_height_inches:
- ≤6" → extra_small
- 7–12" → small
- 13–24" → medium
- 25–36" → large
- 37–60" → extra_large
- >60" → extra_extra_large

Defaults if unspecified: installation_height_feet=12, wall_material="eifs", letter_height_inches=24.
Set condition booleans (parapet, after_hours_weekend, escort_required, badging_checkin, poor_electrical_access, poor_site_access, set_hours_installation, thick_hollow_walls) to true ONLY if clearly mentioned or visible. For raceway items also set raceway_length_feet.

${hasText ? `JOB DESCRIPTION / NOTES:
${rawText}` : "(No written notes — rely entirely on the mockup image(s).)"}`,
        ...(hasImages ? { file_urls: mockups.map(m => m.url) } : {}),
        response_json_schema: SCHEMA
      });
      setResult(res);
    } catch (e) {
      setError(e.message || "Generation failed");
    }
    setLoading(false);
  };

  const apply = () => {
    if (!result?.items?.length) return;
    onApply(result.items, mode);
    setRawText("");
    setMockups([]);
    setResult(null);
    onClose();
  };

  const conditionFlags = (it) => {
    const flags = [];
    if (it.parapet) flags.push("parapet");
    if (it.after_hours_weekend) flags.push("after hours");
    if (it.escort_required) flags.push("escort");
    if (it.badging_checkin) flags.push("badging");
    if (it.poor_electrical_access) flags.push("poor electrical");
    if (it.poor_site_access) flags.push("poor access");
    if (it.set_hours_installation) flags.push("set hours");
    if (it.thick_hollow_walls) flags.push("thick walls");
    return flags;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            AI Scope Writer — Installation
          </DialogTitle>
          <p className="text-xs text-slate-500">Paste rough install notes and/or upload a sign mockup — AI will extract structured line items with site conditions.</p>
        </DialogHeader>

        <div className="space-y-3">
          {/* Mockup uploader */}
          <div>
            <label className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-purple-600" />
                Sign Mockups <span className="text-slate-400 font-normal">(optional — drag in or click to add)</span>
              </span>
              {mockups.length > 0 && (
                <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">
                  {mockups.length} attached
                </span>
              )}
            </label>

            <label
              htmlFor="ai-scope-mockup-input"
              className={`relative flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                uploading ? "bg-purple-50 border-purple-300" : "bg-slate-50/60 border-slate-300 hover:bg-purple-50/60 hover:border-purple-300"
              } ${mockups.length === 0 ? "py-5" : "py-3"}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFiles(e.dataTransfer.files);
              }}
            >
              <input
                id="ai-scope-mockup-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
                disabled={uploading || loading}
              />
              {uploading ? (
                <span className="text-xs text-purple-700 inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</span>
              ) : (
                <span className="text-xs text-slate-600 inline-flex items-center gap-2">
                  <Upload className="w-3.5 h-3.5 text-purple-600" />
                  Drop sign mockup(s) here, or click to browse
                </span>
              )}
            </label>

            {mockups.length > 0 && (
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
                {mockups.map((m, i) => (
                  <div key={i} className="relative group bg-white border border-slate-200 rounded-md overflow-hidden">
                    <img src={m.url} alt={m.name} className="w-full h-24 object-contain bg-slate-50" />
                    <button
                      type="button"
                      onClick={() => removeMockup(i)}
                      className="absolute top-1 right-1 bg-white/90 hover:bg-red-50 border border-slate-200 rounded p-0.5 shadow-sm"
                      title="Remove"
                    >
                      <X className="w-3 h-3 text-red-600" />
                    </button>
                    <div className="text-[10px] text-slate-500 truncate px-1.5 py-0.5 bg-white border-t border-slate-100" title={m.name}>{m.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={`Example:\n"Install 12 channel letters at 18ft on EIFS, halo lit, 24" tall. After hours work, parapet wall, escort required. Also 1 raceway-mounted set, 10ft long, at 14ft."\n\nOr leave blank and just upload a mockup above.`}
            className="h-32 text-sm"
            disabled={loading}
          />

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
          )}

          {result?.items?.length > 0 && (
            <div className="border border-purple-200 bg-purple-50/40 rounded-lg p-3 space-y-2 max-h-72 overflow-y-auto">
              <div className="text-xs font-semibold text-purple-900 flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5" />
                AI generated {result.items.length} item{result.items.length !== 1 ? "s" : ""}:
              </div>
              <div className="space-y-1.5">
                {result.items.map((it, i) => (
                  <div key={i} className="bg-white rounded border border-purple-100 px-2 py-1.5 text-xs space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-[10px]">
                        {it.installation_type?.replace(/_/g, " ")}
                      </Badge>
                      <span className="font-semibold">{it.qty_letters}×</span>
                      {it.letter_height_inches > 0 && <span className="text-slate-600">{it.letter_height_inches}"</span>}
                      {it.installation_height_feet > 0 && <span className="text-slate-500">@ {it.installation_height_feet}ft</span>}
                      {it.wall_material && <span className="text-slate-500">on {it.wall_material}</span>}
                      {it.raceway_length_feet > 0 && <span className="text-slate-500">· {it.raceway_length_feet}ft raceway</span>}
                    </div>
                    {it.description && <div className="text-slate-600 italic">{it.description}</div>}
                    {conditionFlags(it).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {conditionFlags(it).map((f) => (
                          <span key={f} className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5">
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {result.notes && (
                <div className="text-[11px] text-slate-600 italic border-t border-purple-200 pt-1.5">
                  <strong>AI notes:</strong> {result.notes}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between flex-wrap">
          {result ? (
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode("append")}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${mode === "append" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Append
              </button>
              <button
                type="button"
                onClick={() => setMode("replace")}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${mode === "replace" ? "bg-white text-red-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Clear & Replace
              </button>
            </div>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            {!result ? (
              <Button onClick={generate} disabled={!canGenerate} className="bg-purple-600 hover:bg-purple-700 text-white">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4 mr-2" /> Generate Items</>}
              </Button>
            ) : (
              <Button onClick={apply} className={mode === "replace" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"}>
                <Wand2 className="w-4 h-4 mr-2" /> {mode === "replace" ? "Replace All Items" : "Add to Estimate"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}