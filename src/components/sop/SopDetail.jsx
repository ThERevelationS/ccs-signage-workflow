import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Pencil, Printer, CheckCircle2, BellRing, Clock, Paperclip,
  AlertTriangle, FileText, Video, Image as ImageIcon,
} from "lucide-react";
import { categoryByKey, externalVideoEmbedUrl, latestAckFor, needsAcknowledgement } from "./sopModel";
import { openExternalHttpUrl } from "@/utils/safeExternalUrl";
import ImageLightbox from "./ImageLightbox";

const ATTACH_ICONS = { image: ImageIcon, video: Video, doc: FileText, other: Paperclip };

function StepMedia({ step, onImageClick }) {
  const ext = externalVideoEmbedUrl(step.external_video_url);
  return (
    <>
      {Array.isArray(step.images) && step.images.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {step.images.map((url, i) => (
            <button type="button"
              key={`${url}-${i}`}
              type="button"
              onClick={() => onImageClick?.(step.images, i)}
              className="rounded-lg overflow-hidden border border-slate-200 hover:border-slate-400 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
            >
              <img src={url} alt={`Step photo ${i + 1}`} className="h-24 w-32 object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {step.video_url && (
        <video controls src={step.video_url} className="mt-2 w-full max-w-xl rounded-lg bg-black" preload="metadata" />
      )}
      {ext.embed && (
        <div className="mt-2 w-full max-w-xl aspect-video rounded-lg overflow-hidden border border-slate-200">
          <iframe
            src={ext.embed}
            title="Step video"
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
      {!ext.embed && ext.link && (
        <button
          type="button"
          onClick={() => openExternalHttpUrl(ext.link)}
          className="mt-2 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
        >
          <Video className="h-4 w-4" /> Watch reference video
        </button>
      )}
    </>
  );
}

export default function SopDetail({ sop, settings, me, onBack, onEdit, onAcknowledge, onPrint, onRun, onQr, onClone, onSuggest, acknowledging }) {
  const [lightbox, setLightbox] = useState(null); // {images, index}
  const [suggestStep, setSuggestStep] = useState(null); // step id or "" for general
  const [suggestText, setSuggestText] = useState("");
  const [suggestBusy, setSuggestBusy] = useState(false);
  if (!sop) return null;
  const cat = categoryByKey(settings, sop.category);
  const version = Number(sop.version) || 1;
  const needsAck = needsAcknowledgement(sop, me?.email);
  const ack = latestAckFor(sop, me?.email);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" /> All SOPs
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" onClick={() => onRun?.(sop)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            <CheckCircle2 className="h-4 w-4" /> Run
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onQr?.(sop)} className="gap-1.5" title="Machine QR sticker">
            QR
          </Button>
          {me?.canEdit && (
            <Button type="button" variant="outline" size="sm" onClick={() => onEdit?.(sop)} className="gap-1.5">
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => onPrint?.(sop)} className="gap-1.5">
            <Printer className="h-4 w-4" /> Print
          </Button>
          {me?.canEdit && (
            <Button type="button" variant="outline" size="sm" onClick={() => onClone?.(sop)} title="Duplicate this SOP">Clone</Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => { setSuggestStep(""); setSuggestText(""); }} title="Suggest an improvement" className="text-slate-500">
            Suggest edit
          </Button>
        </div>
      </div>

      {sop.cover_image_url && (
        <img src={sop.cover_image_url} alt="" className="w-full max-h-64 object-cover rounded-xl border border-slate-200" />
      )}

      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide" style={{ color: cat.color }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} /> {cat.label}
          </span>
          {sop.status !== "published" && <Badge variant="secondary" className="capitalize">{sop.status}</Badge>}
          <Badge variant="outline">v{version}</Badge>
          {sop.estimated_minutes > 0 && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" /> ~{sop.estimated_minutes} min
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{sop.title}</h1>
        {sop.summary && <p className="mt-1.5 text-slate-600">{sop.summary}</p>}
        {Array.isArray(sop.tags) && sop.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {sop.tags.map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
          </div>
        )}
      </div>

      {Array.isArray(sop.safety_notes) && sop.safety_notes.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" /> Safety notes
          </p>
          <ul className="mt-2 space-y-1 list-disc list-inside text-sm text-amber-800">
            {sop.safety_notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}

      <ol className="space-y-4">
        {(sop.steps || []).map((step, i) => (
          <li key={step.id || i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: cat.color }}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {step.title && <h3 className="font-semibold text-slate-900">{step.title}</h3>}
                {step.body && (
                  <div
                    className="mt-1 text-sm text-slate-700 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1"
                    dangerouslySetInnerHTML={{ __html: step.body }}
                  />
                )}
                <StepMedia step={step} onImageClick={(images, index) => setLightbox({ images, index })} />
                <button type="button" onClick={() => { setSuggestStep(step.id || String(i)); setSuggestText(""); }} className="mt-2 text-[11px] text-slate-400 hover:text-blue-600">
                  Suggest edit on this step
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {Array.isArray(sop.attachments) && sop.attachments.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-800 mb-2">Attachments</p>
          <ul className="space-y-1.5">
            {sop.attachments.map((a, i) => {
              const Icon = ATTACH_ICONS[a.kind] || Paperclip;
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => openExternalHttpUrl(a.url)}
                    className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  >
                    <Icon className="h-4 w-4" /> {a.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {sop.requires_ack === true && sop.status === "published" && (
        <div className={`rounded-xl border p-4 flex flex-wrap items-center gap-3 ${needsAck ? "border-red-300 bg-red-50" : "border-emerald-300 bg-emerald-50"}`}>
          {needsAck ? (
            <>
              <BellRing className="h-5 w-5 text-red-500" />
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-semibold text-red-800">Please read and acknowledge this procedure.</p>
                <p className="text-xs text-red-600">Your confirmation is recorded for version {version}.</p>
              </div>
              <Button type="button" onClick={() => onAcknowledge?.(sop)} disabled={acknowledging} className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> {acknowledging ? "Saving…" : "I have read this"}
              </Button>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="text-sm font-medium text-emerald-800">
                You acknowledged version {ack?.version || version}
                {ack?.acknowledged_at ? ` on ${new Date(ack.acknowledged_at).toLocaleString()}` : ""}.
              </p>
            </>
          )}
        </div>
      )}

      <p className="text-xs text-slate-400">
        {sop.created_by_name ? `Created by ${sop.created_by_name} · ` : ""}
        {sop.updated_date ? `Last updated ${new Date(sop.updated_date).toLocaleString()}` : ""}
      </p>

      {suggestStep !== null && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4" onClick={() => setSuggestStep(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-slate-900">Suggest an improvement{suggestStep ? " for this step" : ""}</p>
            <textarea
              value={suggestText}
              onChange={(e) => setSuggestText(e.target.value)}
              rows={3}
              placeholder="e.g. The bolt is now M8, not M6 — updated after the retrofit"
              className="mt-2 w-full rounded-lg border border-slate-300 p-2 text-sm"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setSuggestStep(null)}>Cancel</Button>
              <Button type="button" size="sm" disabled={suggestBusy || !suggestText.trim()} onClick={async () => {
                setSuggestBusy(true);
                await onSuggest?.({ sopId: sop.id, stepId: suggestStep, text: suggestText });
                setSuggestBusy(false);
                setSuggestStep(null);
              }}>{suggestBusy ? "Sending…" : "Send suggestion"}</Button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={(i) => setLightbox((l) => ({ ...l, index: i }))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
