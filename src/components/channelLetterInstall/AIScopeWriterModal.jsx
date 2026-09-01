import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Wand2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const SCHEMA = {
  type: "object",
  properties: {
    letter_purchases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          letter_type: {
            type: "string",
            enum: ["raceway", "channel_raceway_mounted", "channel_flush_mounted", "channel_halo_lit", "capsule_logo_pillbox", "dimensional_letters"]
          },
          description: { type: "string" },
          qty: { type: "number" },
          size_value: { type: "number", description: "Vertical inches for channel letters, linear feet for raceway, sq ft for capsule/dimensional" },
          install_height_feet: { type: "number" },
          wall_material: { type: "string", enum: ["eifs", "stucco", "brick", "concrete", "metal", "wood", "glass", "drywall"] }
        },
        required: ["letter_type", "qty"]
      }
    },
    notes: { type: "string", description: "Brief summary of what was inferred and any assumptions made" }
  }
};

export default function AIScopeWriterModal({ open, onClose, onApply }) {
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("append"); // "append" | "replace"

  const generate = async () => {
    if (!rawText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a sign-shop estimator. Parse the following rough client request into structured channel letter purchase line items.

Map letter types as follows:
- "flush mount" or "face-lit" → channel_flush_mounted
- "halo lit" or "backlit" or "reverse channel" → channel_halo_lit
- "raceway mounted" → channel_raceway_mounted
- just "raceway" (no letters) → raceway
- "dimensional" or "flat cut" or "pvc letters" → dimensional_letters
- "logo" or "capsule" or "pillbox" → capsule_logo_pillbox

For size_value: use vertical inches for channel letters (e.g. "24 inch letters" → 24), linear feet for raceway, square feet for capsule/dimensional.
Default install_height_feet to 12 if not mentioned. Default wall_material to "eifs" if not mentioned.

CLIENT REQUEST:
${rawText}`,
        response_json_schema: SCHEMA
      });
      setResult(res);
    } catch (e) {
      setError(e.message || "Generation failed");
    }
    setLoading(false);
  };

  const apply = () => {
    if (!result?.letter_purchases?.length) return;
    onApply(result.letter_purchases, mode);
    setRawText("");
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            AI Scope Writer
          </DialogTitle>
          <p className="text-xs text-slate-500">Paste rough client notes — AI will extract structured letter line items.</p>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={`Example:\n"Customer wants 12 halo-lit channel letters, 18 inches tall, mounted to a brick wall about 15 feet up. Also need a 10ft raceway."`}
            className="h-32 text-sm"
            disabled={loading}
          />

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
          )}

          {result?.letter_purchases?.length > 0 && (
            <div className="border border-purple-200 bg-purple-50/40 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-purple-900 flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5" />
                AI generated {result.letter_purchases.length} line item{result.letter_purchases.length !== 1 ? "s" : ""}:
              </div>
              <div className="space-y-1.5">
                {result.letter_purchases.map((p, i) => (
                  <div key={i} className="bg-white rounded border border-purple-100 px-2 py-1.5 text-xs flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-[10px]">
                      {p.letter_type?.replace(/_/g, " ")}
                    </Badge>
                    <span className="font-semibold">{p.qty}×</span>
                    {p.size_value > 0 && <span className="text-slate-600">{p.size_value}"</span>}
                    {p.description && <span className="text-slate-600 italic">{p.description}</span>}
                    {p.install_height_feet > 0 && <span className="text-slate-500">@ {p.install_height_feet}ft</span>}
                    {p.wall_material && <span className="text-slate-500">on {p.wall_material}</span>}
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
              <Button onClick={generate} disabled={loading || !rawText.trim()} className="bg-purple-600 hover:bg-purple-700 text-white">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4 mr-2" /> Generate Line Items</>}
              </Button>
            ) : (
              <Button onClick={apply} className={mode === "replace" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"}>
                <Wand2 className="w-4 h-4 mr-2" /> {mode === "replace" ? "Replace All Letters" : "Add to Estimate"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}