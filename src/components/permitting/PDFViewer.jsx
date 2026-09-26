import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { openExternalHttpUrl, safeExternalHttpUrl } from "@/utils/safeExternalUrl";

export default function PDFViewer({ fileUrl, fileName, onBack }) {
  const [showIframe, setShowIframe] = useState(true);
  const backButtonRef = useRef(null);
  const safeFileUrl = safeExternalHttpUrl(fileUrl);

  // The viewer replaces the detail panel; give keyboard users a predictable starting point.
  useLayoutEffect(() => {
    backButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-3">
          <Button
            ref={backButtonRef}
            variant="outline"
            size="sm"
            onClick={onBack}
            className="border-gray-600 hover:bg-gray-700"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <h2 className="text-white font-medium truncate">{fileName}</h2>
        </div>
        <Button
          size="sm"
          onClick={() => openExternalHttpUrl(safeFileUrl)}
          disabled={!safeFileUrl}
          className="bg-blue-600 hover:bg-blue-700 gap-2"
        >
          <ExternalLink className="w-4 h-4" />
          Open in New Tab
        </Button>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-hidden">
        {showIframe && safeFileUrl ? (
          <iframe
            src={`${safeFileUrl}#toolbar=1&navpanes=0&scrollbar=1`}
            className="w-full h-full border-0"
            onError={() => setShowIframe(false)}
            title={fileName}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-800">
            <div className="flex flex-col items-center gap-4 p-6 text-center max-w-sm">
              <div className="text-yellow-400">
                <p className="font-medium mb-2">PDF Preview Not Available</p>
                <p className="text-xs text-gray-400 mb-6">This PDF cannot be previewed in the browser. Click the button below to open it.</p>
              </div>
              <Button
                onClick={() => openExternalHttpUrl(safeFileUrl)}
                disabled={!safeFileUrl}
                size="lg"
                className="bg-blue-600 hover:bg-blue-700"
              >
                Open PDF in New Tab
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}