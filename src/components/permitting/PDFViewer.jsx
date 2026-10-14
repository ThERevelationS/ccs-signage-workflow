import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { openExternalHttpUrl, safeExternalHttpUrl } from "@/utils/safeExternalUrl";

export default function PDFViewer({ fileUrl, fileName, onBack }) {
  const [showIframe, setShowIframe] = useState(true);
  const [loadState, setLoadState] = useState('loading');
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const backButtonRef = useRef(null);
  const fallbackOpenButtonRef = useRef(null);
  const safeFileUrl = safeExternalHttpUrl(fileUrl);

  useEffect(() => {
    if (!showIframe || !safeFileUrl || loadState !== 'loading') return;
    const timer = setTimeout(() => { setLoadState('timeout'); setShowIframe(false); }, 12000);
    return () => clearTimeout(timer);
  }, [showIframe, safeFileUrl, loadState, previewAttempt]);

  const retryPreview = () => {
    setLoadState('loading'); setPreviewAttempt(value => value + 1); setShowIframe(true);
    backButtonRef.current?.focus({ preventScroll: true });
  };

  // The viewer replaces the detail panel; give keyboard users a predictable starting point.
  useLayoutEffect(() => {
    backButtonRef.current?.focus({ preventScroll: true });
  }, []);

  // Focus the replacement action only when there is a safe link to open.
  // Without one, the initial Back focus remains available instead.
  useLayoutEffect(() => {
    if (!showIframe && safeFileUrl) fallbackOpenButtonRef.current?.focus({ preventScroll: true });
  }, [showIframe, safeFileUrl]);

  return (
    <div className="flex min-h-0 min-w-0 flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2 p-3 border-b border-gray-700 bg-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            ref={backButtonRef}
            variant="outline"
            size="sm"
            onClick={onBack}
            aria-label={!safeFileUrl ? "Back to document details; PDF link unavailable" : undefined}
            className="min-h-11 shrink-0 border-gray-600 hover:bg-gray-700"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <h2 title={fileName} className="line-clamp-2 min-w-0 break-words text-sm text-white font-medium [overflow-wrap:anywhere]">{fileName}</h2>
        </div>
        {safeFileUrl && (
          <Button
            size="sm"
            onClick={() => openExternalHttpUrl(safeFileUrl)}
            className="min-h-11 w-full shrink-0 bg-blue-600 hover:bg-blue-700 gap-2 sm:w-auto"
          >
            <ExternalLink className="w-4 h-4" />
            Open in New Tab
          </Button>
        )}
      </div>

      {showIframe && safeFileUrl && <div className="shrink-0 px-3 py-2 text-xs text-gray-200">
        <p role="status">{loadState === 'loading' ? 'Loading PDF preview…' : 'The browser reported the frame loaded. Confirm the document displays correctly.'}</p>
        <button type="button" className="min-h-11 py-2 text-blue-200 underline" onClick={() => { setLoadState('manual'); setShowIframe(false); }}>Preview not working?</button>
      </div>}
      {/* PDF Viewer */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {showIframe && safeFileUrl ? (
          <iframe
            key={safeFileUrl + ":" + previewAttempt}
            src={`${safeFileUrl}#toolbar=1&navpanes=0&scrollbar=1`}
            className="w-full h-full border-0"
            onLoad={() => setLoadState('ready')}
            onError={() => { setLoadState('error'); setShowIframe(false); }}
            title={fileName}
          />
        ) : (
          <div className="w-full h-full overflow-y-auto flex items-center justify-center bg-gray-800">
            <div className="flex flex-col items-center gap-4 p-6 text-center max-w-sm">
              <div className="text-yellow-400">
                <p role="status" className="font-medium mb-2">
                  {safeFileUrl ? loadState === "timeout" ? "PDF preview timed out" : "PDF Preview Not Available" : "PDF Link Unavailable"}
                </p>
                <p className="text-xs text-gray-400 mb-6">
                  {safeFileUrl
                    ? "The embedded preview may be blocked or unavailable. Open the retained file in a new tab or retry. Preview status does not verify file contents."
                    : "This document has no valid PDF link. Return to document details to check for an original source or another file."}
                </p>
              </div>
              {safeFileUrl && <Button variant="outline" className="min-h-11 w-full whitespace-normal" onClick={retryPreview}>Retry PDF preview</Button>}
              {safeFileUrl ? (
                <Button
                  ref={fallbackOpenButtonRef}
                  onClick={() => openExternalHttpUrl(safeFileUrl)}
                  size="lg"
                  className="min-h-11 h-auto w-full whitespace-normal bg-blue-600 hover:bg-blue-700"
                >
                  Open PDF in New Tab
                </Button>
              ) : (
                <Button onClick={onBack} size="lg" className="min-h-11 h-auto w-full whitespace-normal bg-blue-600 hover:bg-blue-700">
                  Back to Document Details
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}