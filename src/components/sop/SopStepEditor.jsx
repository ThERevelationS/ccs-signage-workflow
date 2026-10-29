import React, { useState } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GripVertical, Mic, ImagePlus, Wand2, Trash2, Copy, X, Loader2,
  Image as ImageIcon, Video, Link2,
} from "lucide-react";
import VoiceRecorder from "./VoiceRecorder";
import MediaCapture from "./MediaCapture";
import { polishStepText, stepTextFromImage } from "./sopAi";
import { externalVideoEmbedUrl } from "./sopModel";

const QUILL_MODULES = {
  toolbar: [
    ["bold", "italic", "underline"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["clean"],
  ],
};

const textToHtml = (text) =>
  String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean)
    .map((line) => `<p>${line.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join("");

// One editable step row inside SopEditor's drag list. The drag handle element
// is provided via `dragHandleProps` from the parent's Draggable.
export default function SopStepEditor({ step, index, settings, onChange, onDelete, onDuplicate, dragHandleProps }) {
  const [micOpen, setMicOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState("");
  const [aiError, setAiError] = useState("");

  const patch = (fields) => onChange?.({ ...step, ...fields });

  const appendTranscript = (text) => {
    setMicOpen(false);
    patch({ body: `${step.body || ""}${textToHtml(text)}` });
  };

  const handleAttach = ({ type, url, name }) => {
    if (type === "image") patch({ images: [...(step.images || []), url] });
    else if (type === "video") patch({ video_url: url });
    else if (type === "external_video") patch({ external_video_url: url });
  };

  const removeImage = (i) => patch({ images: (step.images || []).filter((_, idx) => idx !== i) });
  const moveImage = (i, dir) => {
    const next = [...(step.images || [])];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    patch({ images: next });
  };

  const runPolish = async () => {
    setAiBusy("polish");
    setAiError("");
    try {
      const plain = (step.body || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      const cleaned = await polishStepText(plain);
      patch({ body: textToHtml(cleaned) });
    } catch (e) {
      setAiError(e?.message || "Polish failed.");
    }
    setAiBusy("");
  };

  const describePhoto = async (url) => {
    setAiBusy("photo");
    setAiError("");
    try {
      const out = await stepTextFromImage(url);
      patch({
        title: step.title || out.title,
        body: `${step.body || ""}${textToHtml(out.body)}`,
      });
    } catch (e) {
      setAiError(e?.message || "Could not describe the photo.");
    }
    setAiBusy("");
  };

  const ext = externalVideoEmbedUrl(step.external_video_url);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 p-1"
          title="Drag to reorder"
        >
          <GripVertical className="h-5 w-5" />
        </span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white shrink-0">
          {index + 1}
        </span>
        <Input
          value={step.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="Step title (optional)"
          className="h-8 font-medium"
        />
        <Button type="button" variant="ghost" size="icon" onClick={onDuplicate} title="Duplicate step" className="shrink-0">
          <Copy className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={onDelete} title="Delete step" className="shrink-0 text-red-500 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-2 sop-quill">
        <ReactQuill
          theme="snow"
          value={step.body || ""}
          onChange={(html) => patch({ body: html })}
          modules={QUILL_MODULES}
          placeholder="Explain this step — or record it with the mic button…"
        />
      </div>

      {Array.isArray(step.images) && step.images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {step.images.map((url, i) => (
            <div key={`${url}-${i}`} className="relative group">
              <img src={url} alt="" className="h-20 w-28 object-cover rounded-lg border border-slate-200" />
              <div className="absolute -top-1.5 -right-1.5 flex gap-0.5">
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="rounded-full bg-white border border-slate-300 p-0.5 text-slate-500 hover:text-red-600 shadow"
                  title="Remove photo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="absolute bottom-1 left-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button type="button" onClick={() => moveImage(i, -1)} className="rounded bg-black/60 text-white text-[9px] px-1" title="Move left">◀</button>
                <button type="button" onClick={() => moveImage(i, 1)} className="rounded bg-black/60 text-white text-[9px] px-1" title="Move right">▶</button>
                <button
                  type="button"
                  onClick={() => describePhoto(url)}
                  disabled={!!aiBusy}
                  className="rounded bg-purple-600/80 text-white text-[9px] px-1"
                  title="AI writes step text from this photo"
                >
                  {aiBusy === "photo" ? "…" : "AI"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(step.video_url || ext.link) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {step.video_url && (
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1">
              <Video className="h-3.5 w-3.5 text-slate-500" /> Video attached
              <button type="button" onClick={() => patch({ video_url: "" })} className="text-slate-400 hover:text-red-600 ml-1" title="Remove video"><X className="h-3 w-3" /></button>
            </span>
          )}
          {ext.link && (
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1">
              <Link2 className="h-3.5 w-3.5 text-slate-500" /> {ext.embed ? "Embedded video" : "Video link"}
              <button type="button" onClick={() => patch({ external_video_url: "" })} className="text-slate-400 hover:text-red-600 ml-1" title="Remove link"><X className="h-3 w-3" /></button>
            </span>
          )}
        </div>
      )}

      {micOpen ? (
        <div className="mt-2">
          <VoiceRecorder
            onTranscript={appendTranscript}
            onCancel={() => setMicOpen(false)}
          />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={() => setMicOpen(true)} className="gap-1 h-8 text-xs">
            <Mic className="h-3.5 w-3.5" /> Dictate
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setMediaOpen(true)} className="gap-1 h-8 text-xs">
            <ImagePlus className="h-3.5 w-3.5" /> Photo / video
          </Button>
          <Button
            type="button" variant="outline" size="sm" onClick={runPolish}
            disabled={!!aiBusy || !String(step.body || "").replace(/<[^>]*>/g, "").trim()}
            className="gap-1 h-8 text-xs"
          >
            {aiBusy === "polish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} AI polish
          </Button>
          {aiError && <span className="text-xs text-red-600">{aiError}</span>}
        </div>
      )}

      <MediaCapture
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onAttach={handleAttach}
        allowRecording={settings?.allow_in_app_recording !== false}
        maxImageMb={settings?.max_image_upload_mb || 15}
        maxVideoMb={settings?.max_video_upload_mb || 100}
      />
    </div>
  );
}

