import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { normalizeSignType } from '../../shared/permittingRuleExtraction.ts';
import { extractEvidenceUnit } from '../../shared/permittingRuleEvidenceRun.mjs';

Deno.serve(async req => {
  try {
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me().catch(()=>null);
    if (!user || user.role!=='admin') return Response.json({error:'Admin access required'},{status:403});
    const body=await req.json().catch(()=>({}));
    if (body.automatic===true || body.queued===true) return Response.json({error:'Queued extraction requires its own credit reservation; this route is manual only.'},{status:400});
    const entities=base44.asServiceRole.entities;
    const action=body.action || (body.dry_run?'preview':'extract');
    if (action==='sources') {
      const query:any={};
      if (body.jurisdiction_id) query.jurisdiction_id=String(body.jurisdiction_id);
      else if (body.jurisdiction_name) query.jurisdiction_name=String(body.jurisdiction_name).trim();
      else return Response.json({error:'Select a jurisdiction.'},{status:400});
      const skip=Number(body.cursor || 0);
      if (!Number.isSafeInteger(skip) || skip<0) return Response.json({error:'Invalid source cursor.'},{status:400});
      const rows=await entities.PermittingSourceDocument.filter(query,'id',21,skip,[
        'id','title','jurisdiction_id','jurisdiction_name','issuing_office','authority_classification','verification_status',
        'text_extraction_state','official_url']);
      if (!Array.isArray(rows)) throw Error('Source list did not return an array.');
      return Response.json({success:true,sources:rows.slice(0,20),has_more:rows.length>20,next_cursor:rows.length>20?String(skip+20):null,llm_calls:0});
    }
    if (action==='get_run') {
      let run;
      if (body.run_id) run=await entities.PermittingRuleExtractionRun.get(String(body.run_id));
      else {
        const id=String(body.request_id || '');
        if (!/^[a-zA-Z0-9_-]{16,100}$/.test(id)) return Response.json({error:'A stable request id or run id is required.'},{status:400});
        const rows=await entities.PermittingRuleExtractionRun.filter({request_key:'manual-rule-evidence:'+id},'created_date',2,0);
        if (rows.length>1) throw Error('Extraction request identity is ambiguous.');
        run=rows[0];
      }
      return Response.json({success:true,run:run || null,not_found:!run,llm_calls:0});
    }
    if (!['extract','preview'].includes(action)) return Response.json({error:'Unknown extraction action.'},{status:400});
    const sourceDocumentId=String(body.source_document_id || '').trim(),startPage=body.start_page ?? 1,pageCount=body.page_count ?? 1;
    if (!sourceDocumentId || !Number.isInteger(startPage) || startPage<1 || !Number.isInteger(pageCount) || pageCount<1 || pageCount>5)
      return Response.json({error:'Select one source document and one to five retained physical PDF pages.'},{status:400});
    const result=await extractEvidenceUnit({sourceEntity:entities.PermittingSourceDocument,segmentEntity:entities.PermittingSourceTextSegment,
      runEntity:entities.PermittingRuleExtractionRun,invokeLlm:data=>base44.asServiceRole.integrations.Core.InvokeLLM(data),
      sourceDocumentId,startPage,pageCount,requestId:String(body.request_id || ''),dryRun:action==='preview',
      requestedBy:user.email,normalizeSignType});
    return Response.json(result);
  } catch(error) {
    console.error('permittingRuleExtraction:',error?.message || error);
    return Response.json({error:error?.message || 'Evidence extraction could not complete safely.'},{status:error?.status || 500});
  }
});
