import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { extractKnownSourceText, continueSourceTextBacklog } from '../../shared/jurisdictionSourceTextContinuation.mjs';
import { readAndExtractSourcePdf } from '../../shared/jurisdictionSourceTextRuntime.ts';
import { PERMITTING_RESEARCH_CONFIG_KEY } from '../../shared/permittingResearchDispatchConfig.mjs';

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({error:'Admin access required'},{status:403});
    const body = await req.json().catch(() => ({}));
    const automatic = body.automatic === true;
    const sourceDocumentId = String(body.source_document_id || '').trim();
    if (automatic && sourceDocumentId) return Response.json({error:'Automatic extraction selects its bounded backlog.'},{status:400});
    if (!automatic && !sourceDocumentId) return Response.json({error:'Manual extraction requires a source document id.'},{status:400});
    const options = {entity:base44.asServiceRole.entities.PermittingSourceDocument,readAndExtract:readAndExtractSourcePdf};
    if (!automatic) return Response.json(await extractKnownSourceText({...options,sourceDocumentId,automatic:false}));
    const rows = await base44.asServiceRole.entities.GlobalSettings.filter({setting_key:PERMITTING_RESEARCH_CONFIG_KEY},'created_date',2);
    if (rows.length > 1) throw Error('Duplicate automatic research settings.');
    if (rows[0]?.setting_value?.enabled === false) return Response.json({success:true,skipped:true,reason:'disabled'});
    return Response.json(await continueSourceTextBacklog(options));
  } catch(error) {
    console.error('continuePermittingSourceText:',error?.message || error);
    return Response.json({error:'Document text extraction could not complete safely.'},{status:500});
  }
});
