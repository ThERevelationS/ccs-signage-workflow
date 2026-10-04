import { getDocument } from 'npm:pdfjs-dist@4.8.69/legacy/build/pdf.mjs';
import { safeExternalFetch } from './safeExternalFetch.ts';
import { readVerifiedPdfArchive, extractPdfTextChunk } from './jurisdictionSourcePdfText.mjs';

export async function readAndExtractSourcePdf({source,startPage}: any) {
  const bytes = await readVerifiedPdfArchive(source,safeExternalFetch);
  return await extractPdfTextChunk({bytes,source,startPage,openPdf: data => getDocument({
    data,isEvalSupported:false,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,
    verbosity:0,
  })});
}
