import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readSourceEvidencePages } from '../../shared/jurisdictionSourceTextSegments.mjs';

Deno.serve(async req => {
  try {
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me().catch(()=>null);
    if (!user || !['admin','user'].includes(user.role)) return Response.json({error:'Staff access required'},{status:403});
    const body=await req.json().catch(()=>({}));
    const id=String(body.source_document_id || '').trim();
    const startPage=body.start_page ?? 1, pageCount=body.page_count ?? 5;
    if (!id || !Number.isInteger(startPage) || startPage<1 || !Number.isInteger(pageCount) || pageCount<1 || pageCount>5)
      return Response.json({error:'Select a source and one to five physical PDF pages.'},{status:400});
    // Use caller RLS for both source and segment reads, not service-role access.
    const entity=base44.entities.PermittingSourceDocument;
    const source=await entity.get(id);
    const evidence=await readSourceEvidencePages({source,segmentEntity:base44.entities.PermittingSourceTextSegment,startPage,pageCount});
    const latest=await entity.get(id);
    const snapshot=row=>JSON.stringify([row.archived_file_url,row.file_hash_sha256,row.file_bytes,row.text_extraction_state,row.extracted_text,row.extracted_pages]);
    if (snapshot(latest)!==snapshot(source)) return Response.json({error:'Source evidence changed while reading; request the current snapshot.'},{status:409});
    return Response.json({success:true,source_document_id:id,source_sha256:source.file_hash_sha256,
      official_url:source.official_url,archived_file_url:source.archived_file_url,
      authority_classification:source.authority_classification,content_status:source.content_status,
      verification_status:source.verification_status,...evidence,llm_calls:0});
  } catch(error) {
    console.error('getPermittingSourceTextPages:',error?.message || error);
    return Response.json({error:'Page evidence is unavailable or requires review.'},{status:409});
  }
});
