import { getDocument } from 'npm:pdfjs-dist@4.8.69/legacy/build/pdf.mjs';
import { WorkerMessageHandler } from 'npm:pdfjs-dist@4.8.69/legacy/build/pdf.worker.mjs';
import { safeExternalFetch } from './safeExternalFetch.ts';
import { readVerifiedPdfArchive, extractPdfTextChunk } from './jurisdictionSourcePdfText.mjs';

export async function readAndExtractSourcePdf({source,startPage}: any) {
  // Bundled backend functions have no relative pdf.worker.mjs alongside them.
  // PDF.js supports this preloaded handler, avoiding that implicit import.
  (globalThis as any).pdfjsWorker = { WorkerMessageHandler };
  const bytes = await readVerifiedPdfArchive(source,safeExternalFetch);
  return await extractPdfTextChunk({bytes,source,startPage,openPdf: data => getDocument({
    data,isEvalSupported:false,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,
    verbosity:0,
  })});
}
