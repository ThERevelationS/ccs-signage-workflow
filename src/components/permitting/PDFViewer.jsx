import React, { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function PDFViewer({ fileUrl, fileName, onBack }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  };

  const onDocumentLoadError = (error) => {
    setError(error.message);
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-3">
          <Button
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
        <div className="text-sm text-gray-400">
          {pageNumber} of {numPages || "..."}
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-auto flex items-center justify-center">
        {error ? (
          <div className="flex flex-col items-center gap-4 p-6 text-center">
            <div className="text-red-400 text-sm max-w-xs">
              <p className="font-medium mb-2">Unable to load PDF</p>
              <p className="text-xs text-gray-400 mb-4">{error}</p>
            </div>
            <Button
              onClick={() => window.open(fileUrl, '_blank')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Open in New Tab
            </Button>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading PDF...
          </div>
        ) : (
          <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess} onLoadError={onDocumentLoadError} loading="">
            <Page pageNumber={pageNumber} />
          </Document>
        )}
      </div>

      {/* Navigation */}
      {numPages && numPages > 1 && (
        <div className="flex items-center justify-center gap-4 p-4 border-t border-gray-700 bg-gray-800">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
            disabled={pageNumber <= 1}
            className="border-gray-600 hover:bg-gray-700"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <input
            type="number"
            min={1}
            max={numPages}
            value={pageNumber}
            onChange={(e) => setPageNumber(Math.min(numPages, Math.max(1, parseInt(e.target.value) || 1)))}
            className="w-16 px-2 py-1 text-center bg-gray-700 border border-gray-600 rounded text-white text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
            disabled={pageNumber >= numPages}
            className="border-gray-600 hover:bg-gray-700"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}