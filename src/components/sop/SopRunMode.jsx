import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { categoryByKey, externalVideoEmbedUrl } from "./sopModel";

// Run Mode: one step per screen, huge touch targets, check-off as you go.
// Built for a phone/tablet propped at the machine.
export default function SopRunMode({ sop, settings, onClose }) {
  const steps = sop?.steps || [];
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(() => new Set());
  const cat = categoryByKey(settings, sop?.category);
  const step = steps[idx];
  const finished = done.size >= steps.length && steps.length > 0;
  const ext = externalVideoEmbedUrl(step?.external_video_url);

  const toggleDone = () => setDone((s) => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950 text-white flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button type="button" onClick={onClose} className="p-2 -ml-2 text-white/70 hover:text-white" aria-label="Exit run mode"><X className="h-6 w-6" /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{sop.title}</p>
          <p className="text-xs text-white/50">{cat.label} · Step {idx + 1} of {steps.length}</p>
        </div>
        <div className="h-1.5 w-24 rounded-full bg-white/15 overflow-hidden">
          <div className="h-full bg-emerald-400 transition-all" style={{ width: `${steps.length ? (done.size / steps.length) * 100 : 0}%` }} />
        </div>
      </div>

      {Array.isArray(sop.safety_notes) && sop.safety_notes.length > 0 && idx === 0 && (
        <div className="mx-4 mt-3 rounded-xl border border-amber-400/60 bg-amber-400/10 p-3">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-300"><AlertTriangle className="h-4 w-4" /> Safety first</p>
          <ul className="mt-1 list-disc list-inside text-sm text-amber-100/90 space-y-0.5">
            {sop.safety_notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}

      {finished ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <CheckCircle2 className="h-20 w-20 text-emerald-400" />
          <h2 className="text-2xl font-bold">Procedure complete</h2>
          <p className="text-white/60 text-sm">All {steps.length} steps checked off.</p>
          <Button type="button" size="lg" onClick={onClose} className="mt-2">Back to SOP</Button>
        </div>
      ) : step ? (
        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-xl font-bold">{step.title || `Step ${idx + 1}`}</h2>
            {step.body && (
              <div
                className="mt-3 text-lg leading-relaxed text-white/90 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6"
                dangerouslySetInnerHTML={{ __html: step.body }}
              />
            )}
            {Array.isArray(step.images) && step.images.length > 0 && (
              <div className="mt-4 space-y-2">
                {step.images.map((url, i) => (
                  <img key={i} src={url} alt="" className="w-full rounded-xl border border-white/10 object-contain max-h-[45vh]" />
                ))}
              </div>
            )}
            {step.video_url && <video controls src={step.video_url} className="mt-4 w-full rounded-xl bg-black" />}
            {ext.embed && (
              <div className="mt-4 aspect-video w-full rounded-xl overflow-hidden border border-white/10">
                <iframe src={ext.embed} title="Step video" className="h-full w-full" allowFullScreen />
              </div>
            )}
          </div>
        </div>
      ) : null}

      {!finished && (
        <div className="flex items-center gap-2 border-t border-white/10 p-3">
          <Button type="button" variant="outline" size="lg" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)} className="gap-1 bg-transparent text-white border-white/25">
            <ChevronLeft className="h-5 w-5" /> Back
          </Button>
          <Button
            type="button" size="lg" onClick={toggleDone}
            className={`flex-1 gap-2 ${done.has(idx) ? "bg-emerald-600 hover:bg-emerald-500" : ""}`}
          >
            <CheckCircle2 className="h-5 w-5" /> {done.has(idx) ? "Step done" : "Mark done"}
          </Button>
          <Button type="button" size="lg" disabled={idx >= steps.length - 1} onClick={() => setIdx((i) => i + 1)} className="gap-1">
            Next <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
