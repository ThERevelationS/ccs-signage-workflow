import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { retainSourceOcrEvidence, readSourceOcrEvidence } from '../../shared/permittingSourceOcrEvidence.mjs';
import { retainVisualTranscription, readVisualTranscription } from '../../shared/permittingVisualTranscription.mjs';
import { readAndExtractSourcePdf } from '../../shared/jurisdictionSourceTextRuntime.ts';

Deno.serve(async req => {
  try {
    const base44=withEntityRateLimitRetry(createClientFromRequest(req));
    const user=await base44.auth.me().catch(()=>null);
    if(!user || !['admin','user'].includes(user.role)) return Response.json({error:'Staff access required'},{status:403});
    const raw=await req.text();
    if(raw.length>120_000) return Response.json({error:'OCR request exceeds its bound.'},{status:400});
    const body=JSON.parse(raw || '{}');
    const action=body.action || 'read';
    const id=typeof body.source_document_id==='string' ? body.source_document_id.trim() : '';
    if(!id || !['preview','retain','read','get_request','cite','retain_transcription','read_transcription','get_transcription_request','cite_transcription'].includes(action))
      return Response.json({error:'Select a source and a supported OCR evidence action.'},{status:400});
    if(['preview','retain','retain_transcription'].includes(action) && user.role!=='admin')
      return Response.json({error:'Admin access required'},{status:403});
    if(action==='retain') return Response.json(await retainSourceOcrEvidence({
      entity:base44.asServiceRole.entities.PermittingSourceDocument,sourceDocumentId:id,body,actor:user,
      readAndExtract:readAndExtractSourcePdf
    }));
    if(action==='retain_transcription') return Response.json(await retainVisualTranscription({
      entity:base44.asServiceRole.entities.PermittingSourceDocument,sourceDocumentId:id,body,actor:user,
      readAndExtract:readAndExtractSourcePdf
    }));
    const entity=base44.entities.PermittingSourceDocument;
    const source=await entity.get(id);
    if(action==='preview') {
      const state=source.text_extraction_state;
      return Response.json({success:true,source_document_id:id,expected_updated_date:source.updated_date,
        source_sha256:source.file_hash_sha256,archived_file_url:source.archived_file_url,
        total_pages:state?.total_pages,needs_ocr_pages:state?.needs_ocr_pages || [],
        text_extraction_pinned:source.text_extraction_pinned===true,retained_records:(source.ocr_evidence || []).length,
        transcription_records:(source.ocr_transcriptions || []).length,max_records:5,max_text_chars:30_000,requires_admin:true,review_status:'unreviewed',llm_calls:0});
    }
    const requestRead=['get_request','get_transcription_request'].includes(action);
    if(requestRead && (typeof body.request_id!=='string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(body.request_id)))
      return Response.json({error:'A stable OCR request identity is required.'},{status:400});
    if(!requestRead && (typeof body.record_key!=='string' || !/^[a-f0-9]{64}$/.test(body.record_key)))
      return Response.json({error:'An OCR record key is required.'},{status:400});
    const citing=['cite','cite_transcription'].includes(action);
    if(citing && typeof body.excerpt!=='string') return Response.json({error:'An exact evidence excerpt is required.'},{status:400});
    const visual=['read_transcription','get_transcription_request','cite_transcription'].includes(action);
    const result=visual ? await readVisualTranscription({source,requestId:requestRead?body.request_id:undefined,
      recordKey:body.record_key,spanIndex:citing?body.span:undefined,excerpt:citing?body.excerpt:undefined}) :
      await readSourceOcrEvidence({source,requestId:requestRead?body.request_id:undefined,
      recordKey:body.record_key,excerpt:citing?body.excerpt:undefined});
    const latest=await entity.get(id);
    const snapshot=(s:any)=>JSON.stringify([s.archived_file_url,s.file_hash_sha256,s.file_bytes,
      s.text_extraction_state,s.extracted_pages,s.ocr_evidence,s.ocr_transcriptions]);
    if(snapshot(latest)!==snapshot(source)) return Response.json({error:'OCR evidence changed during reading.'},{status:409});
    return Response.json(result);
  } catch(error) {
    console.error('permittingSourceOcrEvidence:',error?.message || error);
    return Response.json({error:'OCR evidence could not be retained or read safely; check the source snapshot and request receipt.'},{status:409});
  }
});
