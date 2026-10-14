import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Button } from '@/components/ui/button';

// Reuse the installed pdf.js worker locally; no third-party PDF proxy or new package.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const MAX_PDF_BYTES = 12 * 1024 * 1024;

export default function RenderedPDFPages({ fileUrl, onPageRendered, onFailure, onPageLoading }) {
  const container = useRef(null);
  const [width, setWidth] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [documentBytes, setDocumentBytes] = useState(null);
  const failureCallback = useRef(onFailure);
  failureCallback.current = onFailure;

  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const changePage = nextPage => {
    if (nextPage < 1 || nextPage > pageCount) return;
    onPageLoading();
    setPageNumber(nextPage);
  };

  return <div ref={container} className="flex h-full min-w-0 flex-col bg-gray-700">
    {pageCount > 1 && <div className="flex shrink-0 items-center justify-center gap-3 bg-gray-800 p-2 text-sm text-white">
      <Button variant="outline" size="sm" className="min-h-11" disabled={pageNumber === 1} onClick={() => changePage(pageNumber - 1)}>Previous page</Button>
      <span role="status">Page {pageNumber} of {pageCount}</span>
      <Button variant="outline" size="sm" className="min-h-11" disabled={pageNumber === pageCount} onClick={() => changePage(pageNumber + 1)}>Next page</Button>
    </div>}
    <div className="min-h-0 min-w-0 flex-1 overflow-auto p-2" aria-label="Rendered PDF document page">
      <Document file={fileUrl} onLoadSuccess={data => { setPageCount(data.numPages); setPageNumber(1); }} onLoadError={onFailure} onSourceError={onFailure} loading={<p className="p-3 text-sm text-white">Rendering PDF document…</p>} error={<p className="p-3 text-sm text-white">Could not render this PDF. Try the original file link.</p>}>
        {width > 0 && <Page pageNumber={pageNumber} width={Math.max(160, Math.min(900, width - 16))} renderTextLayer={false} renderAnnotationLayer={false} onRenderSuccess={onPageRendered} onRenderError={onFailure} loading={<p className="p-3 text-sm text-white">Rendering page…</p>} />}
      </Document>
    </div>
  </div>;
}
