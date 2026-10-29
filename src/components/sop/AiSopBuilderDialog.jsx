import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Mic, Loader2, ArrowRight, AlertCircle } from "lucide-react";
import VoiceRecorder from "./VoiceRecorder";
import { draftSopFromText } from "./sopAi";
import { categoryByKey, stripHtml } from "./sopModel";

// "Build with AI" — paste rough notes or dictate the whole procedure, then the
// AI produces a structured draft (title, category, summary, safety notes,
// steps) the editor can preview and apply.

export default function AiSopBuilderDialog({ open, onClose, categories, settings, onApply }) {
  const [rawText, setRawText] = useState("");
  const [micOpen, setMicOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);

  const generate = async () => {
    setBusy(true);
    setError("");
    setDraft(null);
    try {
      const result = await draftSopFromText(rawText, categories);
      setDraft(result);
    } catch (e) {
      setError(e?.message || "Could not build a draft.");
    }
    setBusy(false);
  };

  const apply = () => {
    if (!draft) return;
    onApply?.(draft);
    setRawText("");
    setDraft(null);
    onClose?.();
  };

  const close = () => { setDraft(null); setError(""); onClose?.(); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" /> Build an SOP with AI
          </DialogTitle>
          <DialogDescription>
            Explain the procedure out loud or paste rough notes — AI turns it into titled steps you can review before saving.
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="space-y-3">
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={8}
              placeholder={'Describe the whole procedure — e.g. "First unplug the router. Then use the two wrenches on the collet nut, top one clockwise…"'}
            />
            {micOpen ? (
              <VoiceRecorder
                onTranscript={(text) => {
                  setRawText((t) => (t.trim() ? `${t.trim()}\n\n${text}` : text));
                  setMicOpen(false);
                }}
                onCancel={() => setMicOpen(false)}
              />
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setMicOpen(true)} className="gap-1.5">
                <Mic className="h-4 w-4" /> Dictate the procedure
              </Button>
            )}
            {error && (
              <p className="flex items-start gap-1.5 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="button" onClick={generate} disabled={busy || !rawText.trim()} className="gap-1.5">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate draft
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-900">{draft.title || "Untitled SOP"}</h3>
                <Badge variant="secondary">{categoryByKey({ categories }, draft.category).label}</Badge>
                {draft.estimated_minutes > 0 && <Badge variant="outline">~{draft.estimated_minutes} min</Badge>}
              </div>
              {draft.summary && <p className="text-sm text-slate-600">{draft.summary}</p>}
            </div>

            {draft.safety_notes.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-900 mb-1">Safety notes</p>
                <ul className="list-disc list-inside text-sm text-amber-800 space-y-0.5">
                  {draft.safety_notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}

            <ol className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {draft.steps.map((s, i) => (
                <li key={s.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-800">{i + 1}. {s.title || "Step"}</p>
                  <p className="text-sm text-slate-600 mt-0.5">{stripHtml(s.body)}</p>
                </li>
              ))}
            </ol>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Back to notes</Button>
              <Button type="button" onClick={apply} className="gap-1.5">
                Use this draft <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
