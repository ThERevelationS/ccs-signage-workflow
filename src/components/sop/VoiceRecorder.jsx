import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, RotateCcw, Check, AlertCircle } from "lucide-react";
import { transcribeAudioFile } from "./sopAi";

// Compact mic panel: record → preview → transcribe → hand text back.
// MediaRecorder picks the best supported audio container (webm/opus on
// Chrome/Edge/Firefox, mp4/aac on Safari) so TranscribeAudio always gets a
// format it accepts.

function pickAudioMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

const extFor = (mime) => (mime.includes("mp4") ? "m4a" : mime.includes("mpeg") ? "mp3" : "webm");

export default function VoiceRecorder({ onTranscript, onAudioSaved, onCancel }) {
  const [state, setState] = useState("idle"); // idle | recording | preview | transcribing
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const timerRef = useRef(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    blobRef.current = null;
    chunksRef.current = [];
    setSeconds(0);
    setState("idle");
    setError("");
  }, [previewUrl]);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    stopStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [stopStream, previewUrl]);

  const start = async () => {
    setError("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot record audio — paste or type the text instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickAudioMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        blobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        setState("preview");
      };
      recorder.start(250);
      setState("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      setError(e?.name === "NotAllowedError"
        ? "Microphone permission was denied — allow the mic in the browser bar, or type the text instead."
        : "Could not start the microphone.");
    }
  };

  const stop = () => {
    clearInterval(timerRef.current);
    try { recorderRef.current?.stop(); } catch { setState("idle"); }
  };

  const useRecording = async () => {
    if (!blobRef.current) return;
    setState("transcribing");
    setError("");
    try {
      const mime = blobRef.current.type || "audio/webm";
      const file = new File([blobRef.current], `sop-voice.${extFor(mime)}`, { type: mime });
      const { transcript, audio_url } = await transcribeAudioFile(file);
      onAudioSaved?.(audio_url);
      onTranscript?.(transcript);
    } catch (e) {
      setError(e?.message || "Transcription failed — you can type the text instead.");
      setState("preview");
    }
  };

  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        {state === "idle" && (
          <Button type="button" size="sm" onClick={start} className="gap-1.5">
            <Mic className="h-4 w-4" /> Record
          </Button>
        )}
        {state === "recording" && (
          <>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-sm font-mono text-red-600">{mm}:{ss}</span>
            <Button type="button" size="sm" variant="destructive" onClick={stop} className="gap-1.5">
              <Square className="h-4 w-4" /> Stop
            </Button>
          </>
        )}
        {state === "transcribing" && (
          <span className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Transcribing…
          </span>
        )}
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} className="ml-auto">
            Cancel
          </Button>
        )}
      </div>

      {state === "preview" && previewUrl && (
        <div className="space-y-2">
          <audio controls src={previewUrl} className="w-full h-9" />
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={useRecording} className="gap-1.5">
              <Check className="h-4 w-4" /> Transcribe &amp; use
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={reset} className="gap-1.5">
              <RotateCcw className="h-4 w-4" /> Re-record
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
