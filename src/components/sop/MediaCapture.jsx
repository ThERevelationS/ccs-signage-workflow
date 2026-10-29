import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Image as ImageIcon, Video, Link2, Camera, Square, Loader2, Upload, AlertCircle } from "lucide-react";
import { uploadFile } from "./sopAi";
import { externalVideoEmbedUrl } from "./sopModel";

// Attach dialog for SOP steps/records. Modes:
//   photo  — camera snapshot or image file upload
//   video  — camera recording (MediaRecorder) or video file upload
//   link   — external video URL (YouTube/Vimeo embed or plain link)
// Calls onAttach({ type, url, name }) — type: 'image' | 'video' | 'external_video'.

function pickVideoMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

export default function MediaCapture({ open, onClose, onAttach, allowRecording = true, maxImageMb = 15, maxVideoMb = 100 }) {
  const [tab, setTab] = useState("photo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkValue, setLinkValue] = useState("");
  const [cameraState, setCameraState] = useState("off"); // off | live | recording
  const [recording, setRecording] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const stopCamera = useCallback(() => {
    try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch {}
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setCameraState("off");
    setRecording(false);
  }, []);

  useEffect(() => {
    if (!open) { stopCamera(); setError(""); setLinkValue(""); setTab("photo"); }
  }, [open, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const finishUpload = async (file, type) => {
    setBusy(true);
    setError("");
    try {
      const url = await uploadFile(file);
      onAttach?.({ type, url, name: file.name || type });
      onClose?.();
    } catch (e) {
      setError(e?.message || "Upload failed.");
    }
    setBusy(false);
  };

  const checkSize = (file, maxMb) => {
    if (file.size > maxMb * 1024 * 1024) {
      setError(`File is ${(file.size / 1048576).toFixed(1)} MB — the limit is ${maxMb} MB. For long videos, upload to YouTube and paste the link instead.`);
      return false;
    }
    return true;
  };

  const handleImageFiles = (files) => {
    const file = files?.[0];
    if (!file) return;
    if (!checkSize(file, maxImageMb)) return;
    finishUpload(file, "image");
  };

  const handleVideoFiles = (files) => {
    const file = files?.[0];
    if (!file) return;
    if (!checkSize(file, maxVideoMb)) return;
    finishUpload(file, "video");
  };

  const startCamera = async (withAudio) => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: withAudio,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraState("live");
    } catch (e) {
      setError(e?.name === "NotAllowedError"
        ? "Camera permission was denied — allow it in the browser bar or upload a file instead."
        : "Could not open the camera — upload a file instead.");
    }
  };

  const snapPhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) { setError("Could not capture the photo."); return; }
      stopCamera();
      finishUpload(new File([blob], `sop-photo-${Date.now()}.jpg`, { type: "image/jpeg" }), "image");
    }, "image/jpeg", 0.9);
  };

  const startVideoRecording = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record video — upload a file instead.");
      return;
    }
    const mime = pickVideoMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
      if (!checkSize(blob, maxVideoMb)) { stopCamera(); return; }
      stopCamera();
      finishUpload(new File([blob], `sop-video-${Date.now()}.webm`, { type: blob.type }), "video");
    };
    recorder.start(500);
    setRecording(true);
    setCameraState("recording");
  };

  const stopVideoRecording = () => {
    try { recorderRef.current?.stop(); } catch { stopCamera(); }
  };

  const attachLink = () => {
    const { embed, link } = externalVideoEmbedUrl(linkValue);
    if (!link) { setError("Paste a valid https:// video link (YouTube, Vimeo, or direct)."); return; }
    onAttach?.({ type: "external_video", url: embed || link, name: linkValue.trim() });
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add photo or video</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="photo" className="gap-1"><ImageIcon className="h-4 w-4" /> Photo</TabsTrigger>
            <TabsTrigger value="video" className="gap-1"><Video className="h-4 w-4" /> Video</TabsTrigger>
            <TabsTrigger value="link" className="gap-1"><Link2 className="h-4 w-4" /> Link</TabsTrigger>
          </TabsList>

          <TabsContent value="photo" className="space-y-3 pt-3">
            {cameraState === "off" ? (
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageFiles(e.target.files)} />
                  <Button type="button" variant="outline" asChild disabled={busy} className="gap-1.5">
                    <span><Upload className="h-4 w-4" /> Upload photo</span>
                  </Button>
                </label>
                <label className="inline-flex">
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageFiles(e.target.files)} />
                  <Button type="button" variant="outline" asChild disabled={busy} className="gap-1.5">
                    <span><Camera className="h-4 w-4" /> Camera app</span>
                  </Button>
                </label>
                {allowRecording && (
                  <Button type="button" variant="outline" onClick={() => startCamera(false)} disabled={busy} className="gap-1.5">
                    <Camera className="h-4 w-4" /> Take photo in app
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <video ref={videoRef} playsInline muted className="w-full rounded-lg bg-black aspect-video object-cover" />
                <div className="flex gap-2">
                  <Button type="button" onClick={snapPhoto} disabled={busy} className="gap-1.5">
                    <Camera className="h-4 w-4" /> Capture photo
                  </Button>
                  <Button type="button" variant="ghost" onClick={stopCamera}>Cancel</Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="video" className="space-y-3 pt-3">
            {cameraState === "off" ? (
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex">
                  <input type="file" accept="video/*" className="hidden" onChange={(e) => handleVideoFiles(e.target.files)} />
                  <Button type="button" variant="outline" asChild disabled={busy} className="gap-1.5">
                    <span><Upload className="h-4 w-4" /> Upload video</span>
                  </Button>
                </label>
                {allowRecording && (
                  <Button type="button" variant="outline" onClick={() => startCamera(true)} disabled={busy} className="gap-1.5">
                    <Video className="h-4 w-4" /> Record in app
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <video ref={videoRef} playsInline muted className="w-full rounded-lg bg-black aspect-video object-cover" />
                <div className="flex gap-2">
                  {!recording ? (
                    <Button type="button" onClick={startVideoRecording} disabled={busy} className="gap-1.5">
                      <Video className="h-4 w-4" /> Start recording
                    </Button>
                  ) : (
                    <Button type="button" variant="destructive" onClick={stopVideoRecording} className="gap-1.5">
                      <Square className="h-4 w-4" /> Stop &amp; use clip
                    </Button>
                  )}
                  <Button type="button" variant="ghost" onClick={stopCamera}>Cancel</Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="link" className="space-y-3 pt-3">
            <Input
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              placeholder="https://youtube.com/watch?v=… or vimeo.com/…"
              onKeyDown={(e) => e.key === "Enter" && attachLink()}
            />
            <Button type="button" onClick={attachLink} disabled={busy || !linkValue.trim()} className="gap-1.5">
              <Link2 className="h-4 w-4" /> Embed link
            </Button>
          </TabsContent>
        </Tabs>

        {busy && (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
          </p>
        )}
        {error && (
          <p className="flex items-start gap-1.5 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
