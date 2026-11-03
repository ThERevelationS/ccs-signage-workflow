import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileWarning } from "lucide-react";
import { kindOfExt, fmtBytes } from "./fileBridgeClient";

const TEXT_EXT = ["txt", "csv", "md", "json", "log", "xml", "svg", "srt", "ini", "cfg"];
const TEXT_CAP = 512 * 1024; // render ≤512KB inline; larger text files download

// Honest viewer: renders what the browser can truly render, never pretends.
// Office/design files fall back to download until the preview pipeline (FB-42)
// produces pushed previews.
export default function FileViewerDialog({ open, onClose, file }) {
  const { url, name, ext, size, sha256 } = file || {};
  const kind = kindOfExt(ext, false);
  const e = String(ext || "").toLowerCase();
  const [text, setText] = useState(null);
  const [textErr, setTextErr] = useState("");

  useEffect(() => {
    setText(null); setTextErr("");
    if (!open || !url || !TEXT_EXT.includes(e)) return;
    let dead = false;
    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`fetch ${r.status}`);
        const buf = await r.arrayBuffer();
        if (buf.byteLength > TEXT_CAP) { setTextErr(`too large to preview (${fmtBytes(buf.byteLength)})`); return; }
        if (!dead) setText(new TextDecoder("utf-8", { fatal: false }).decode(buf));
      } catch (err) { if (!dead) setTextErr(String(err?.message || err)); }
    })();
    return () => { dead = true; };
  }, [open, url, e]);

  if (!file) return null;
  const openRaw = () => window.open(url, "_blank", "noopener");

  let body;
  if (kind === "image") {
    body = <img src={url} alt={name} className="max-h-[70vh] w-auto mx-auto object-contain rounded" />;
  } else if (kind === "pdf") {
    body = <iframe title={name} src={url} className="w-full h-[70vh] rounded border bg-white" />;
  } else if (kind === "video") {
    body = <video src={url} controls className="max-h-[70vh] w-full rounded bg-black" />;
  } else if (kind === "audio") {
    body = <audio src={url} controls className="w-full" />;
  } else if (TEXT_EXT.includes(e)) {
    body = text !== null
      ? <pre className="max-h-[70vh] overflow-auto text-xs bg-muted/40 rounded p-3 whitespace-pre-wrap break-all">{text}</pre>
      : textErr
        ? <Fallback name={name} reason={`preview unavailable: ${textErr}`} />
        : <div className="p-8 text-sm text-muted-foreground">Loading preview…</div>;
  } else {
    const why = kind === "design" ? "design files (cdr/ai/psd) get previews when the thumb pipeline lands"
      : kind === "doc" || kind === "sheet" ? "office docs need the preview pipeline (or download to open natively)"
        : "no inline renderer for this file type";
    body = <Fallback name={name} reason={why} />;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base truncate">
            <span className="truncate">{name}</span>
            <span className="text-xs font-normal text-muted-foreground shrink-0">
              {e || "file"} · {fmtBytes(size)}{sha256 ? ` · sha ${sha256.slice(0, 8)}` : ""}
            </span>
          </DialogTitle>
        </DialogHeader>
        {body}
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={openRaw}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open in tab
          </Button>
          <Button size="sm" onClick={() => { const a = document.createElement("a"); a.href = url; a.download = name || "file"; a.rel = "noopener"; a.click(); }}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fallback({ name, reason }) {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      <FileWarning className="h-8 w-8 mx-auto mb-3 text-slate-400" />
      <div className="font-medium text-foreground mb-1">{name}</div>
      <div>{reason} — use Download or Open in tab.</div>
    </div>
  );
}
