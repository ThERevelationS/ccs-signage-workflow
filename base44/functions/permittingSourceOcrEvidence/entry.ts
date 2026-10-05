import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { retainSourceOcrEvidence, readSourceOcrEvidence } from '../../shared/permittingSourceOcrEvidence.mjs';
import { readAndExtractSourcePdf } from '../../shared/jurisdictionSourceTextRuntime.ts';

Deno.serve(async req => {
  try {
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me().catch(()=>null);
    if(!user || !['admin','user'].includes(user.role)) return Response.json({error:'Staff access required'},{status:403});
    const raw=await req.text();
    if(raw.length>120_000) return Response.json({error:'OCR request exceeds its bound.'},{status:400});
    const body=JSON.parse(raw || '{}');
    const action=body.action || 'read';
    const id=typeof body.source_document_id==='string' ? body.source_document_id.trim() : '';
    if(!id || !['preview','retain','read','get_request','cite'].includes(action))
      return Response.json({error:'Select a source and a supported OCR evidence action.'},{status:400});
    if(['preview','retain'].includes(action) && user.role!=='admin')
      return Response.json({error:'Admin access required'},{status:403});
    if(action==='retain') return Response.json(await retainSourceOcrEvidence({
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
        max_records:5,max_text_chars:30_000,requires_admin:true,review_status:'unreviewed',llm_calls:0});
    }
    if(action==='get_request' && (typeof body.request_id!=='string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(body.request_id)))
      return Response.json({error:'A stable OCR request identity is required.'},{status:400});
    if(action!=='get_request' && (typeof body.record_key!=='string' || !/^[a-f0-9]{64}$/.test(body.record_key)))
      return Response.json({error:'An OCR record key is required.'},{status:400});
    const result=await readSourceOcrEvidence({source,requestId:action==='get_request'?body.request_id:undefined,
      recordKey:body.record_key,excerpt:action==='cite'?body.excerpt:undefined});
    if(action==='cite' && typeof body.excerpt!=='string') return Response.json({error:'An exact OCR excerpt is required.'},{status:400});
    const latest=await entity.get(id);
    const snapshot=(s:any)=>JSON.stringify([s.archived_file_url,s.file_hash_sha256,s.file_bytes,
      s.text_extraction_state,s.extracted_pages,s.ocr_evidence]);
    if(snapshot(latest)!==snapshot(source)) return Response.json({error:'OCR evidence changed during reading.'},{status:409});
    return Response.json(result);
  } catch(error) {
    console.error('permittingSourceOcrEvidence:',error?.message || error);
    return Response.json({error:'OCR evidence could not be retained or read safely; check the source snapshot and request receipt.'},{status:409});
  }
});
