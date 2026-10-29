import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Printer, X, AlertTriangle } from "lucide-react";
import { categoryByKey, stripHtml } from "./sopModel";

// Print overlay: a clean, ink-friendly layout for laminating at the shop.
// Renders as a fixed overlay; @media print hides the app shell around it.
export default function SopPrint({ sop, settings, onClose }) {
  useEffect(() => {
    document.body.classList.add("sop-printing");
    return () => document.body.classList.remove("sop-printing");
  }, []);

  if (!sop) return null;
  const cat = categoryByKey(settings, sop.category);
  const version = Number(sop.version) || 1;

  return (
    <div className="sop-print-root fixed inset-0 z-[80] bg-white overflow-y-auto">
      <div className="sop-print-toolbar sticky top-0 flex items-center gap-2 border-b bg-white p-3">
        <Button type="button" size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="h-4 w-4" /> Print
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose} className="gap-1.5">
          <X className="h-4 w-4" /> Close
        </Button>
        <span className="text-xs text-slate-400 ml-2">Tip: choose "Save as PDF" in the print dialog to share it.</span>
      </div>

      <div className="max-w-3xl mx-auto p-6 text-slate-900">
        <header className="border-b-2 border-slate-800 pb-3 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: cat.color }}>
                {cat.label} · Standard Operating Procedure
              </p>
              <h1 className="text-2xl font-bold mt-1">{sop.title}</h1>
            </div>
            <div className="text-right text-xs text-slate-500 shrink-0">
              <p>Version {version}</p>
              {sop.estimated_minutes > 0 && <p>~{sop.estimated_minutes} min</p>}
              {sop.updated_date && <p>Updated {new Date(sop.updated_date).toLocaleDateString()}</p>}
            </div>
          </div>
          {sop.summary && <p className="text-sm text-slate-600 mt-2">{sop.summary}</p>}
        </header>

        {Array.isArray(sop.safety_notes) && sop.safety_notes.length > 0 && (
          <div className="border-2 border-amber-500 bg-amber-50 rounded-lg p-3 mb-4">
            <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
              <AlertTriangle className="h-4 w-4" /> SAFETY
            </p>
            <ul className="list-disc list-inside text-sm text-amber-900 mt-1 space-y-0.5">
              {sop.safety_notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}

        <ol className="space-y-4">
          {(sop.steps || []).map((step, i) => (
            <li key={step.id || i} className="break-inside-avoid">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  {step.title && <h3 className="font-bold">{step.title}</h3>}
                  {step.body && (
                    <div
                      className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                      dangerouslySetInnerHTML={{ __html: step.body }}
                    />
                  )}
                  {Array.isArray(step.images) && step.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {step.images.slice(0, 4).map((url, j) => (
                        <img key={j} src={url} alt="" className="h-32 w-44 object-cover rounded border border-slate-300" />
                      ))}
                    </div>
                  )}
                  {(step.video_url || step.external_video_url) && (
                    <p className="text-xs text-slate-500 mt-1 italic">Video available in the app version of this SOP.</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <footer className="mt-8 pt-3 border-t text-[11px] text-slate-400 flex justify-between">
          <span>CCS Signage · SOP v{version}{sop.requires_ack ? " · read receipt required in app" : ""}</span>
          <span>{sop.created_by_name ? `Author: ${sop.created_by_name}` : ""}</span>
        </footer>
      </div>
    </div>
  );
}

// Injected once by SOP.jsx — keeps print output clean of the app shell.
export const SOP_PRINT_CSS = `
@media print {
  body.sop-printing * { visibility: hidden !important; }
  body.sop-printing .sop-print-root,
  body.sop-printing .sop-print-root * { visibility: visible !important; }
  .sop-print-root { position: static !important; overflow: visible !important; }
  .sop-print-toolbar { display: none !important; }
  nav, .top-nav, .side-nav, [data-shell-navigation-handle] { display: none !important; }
}
.sop-print-root .sop-quill .ql-toolbar { display: none; }
`;
