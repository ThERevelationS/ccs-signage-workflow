import { buildSnapshot, buildSalesPullSnapshot } from './smartsheetSyncFields.ts';
import { preview } from './fieldAudit.ts';

export async function handleConflictReview({base44,body,actor,token,loadConfig,get,claim,finish,push,assertOwner}) {
  if(actor?.role!=='admin')throw Object.assign(new Error('Only admins can review sync conflicts.'),{status:403});
  const entity=base44.asServiceRole.entities.SyncConflict;
  const query={status:body.status==='resolved'?'resolved':{$in:['open','approved']},...(body.dataset==='sales'||body.dataset==='orders'?{dataset:body.dataset}:{})};
  if(body.action==='conflict_count') {
    const result=await entity.aggregate({query,countDistinct:'entity_id'}), totals=result.rows[0]||{};
    return {success:true,count:totals.count||0,record_count:totals.count_distinct_entity_id||0};
  }
  if(body.action==='conflict_list')return {success:true,page:await entity.filter(query,{sort:'-created_date',limit:25,...(body.cursor?{cursor:body.cursor}:{})}),count:await entity.count(query)};
  if(!['app','smartsheet'].includes(body.decision))throw Object.assign(new Error('Choose which field value to keep.'),{status:400});
  const conflict=await entity.get(String(body.conflict_id||''));
  if(!conflict || !['open','approved'].includes(conflict.status))throw Object.assign(new Error('This review is already closed. Refresh the review page.'),{status:409});
  const {config}=await loadConfig();
  if(!token || !config?.global_enabled || config.observation_mode || !config[conflict.dataset]?.mirror_enabled)throw Object.assign(new Error('Sync is disabled or read-only. Enable verified writes before resolving conflicts.'),{status:409});
  const profile=config[conflict.dataset];
  if(String(profile.smartsheet_sheet_id)!==conflict.sheet_id || String(profile.column_bindings?.[conflict.field_name])!==conflict.column_id)throw Object.assign(new Error('The field mapping changed. Run sync to refresh this review first.'),{status:409});
  const started=new Date().toISOString();
  await claim({status:'running',started_at:started,action:'resolve_conflict',total_steps:1,completed_steps:0,current_step_label:'Admin field conflict review',results:[]},conflict.dataset);
  try {
    const record=await base44.asServiceRole.entities[conflict.dataset==='sales'?'WorkOrder':'Order'].get(conflict.entity_id);
    const remote=await get(`/sheets/${conflict.sheet_id}/rows/${conflict.row_id}`);
    const sameSalesValues = conflict.dataset==='sales' && preview(buildSnapshot(record,profile.column_bindings,'sales')[conflict.column_id]??'')===conflict.local_value && preview(buildSalesPullSnapshot(remote.body,profile.column_bindings)[conflict.column_id]??'')===conflict.remote_value;
    if(record.deleted || (conflict.dataset==='sales' ? !sameSalesValues : record.updated_date!==conflict.local_version || String(remote.body?.modifiedAt||'')!==conflict.remote_version)) {
      await entity.update(conflict.id,{status:'superseded'});
      throw Object.assign(new Error('One side changed since this review was created. Your choice was not applied; run sync to produce a fresh review.'),{status:409});
    }
    await entity.update(conflict.id,{status:'approved',decision:body.decision,resolved_by:actor.full_name||actor.email});
    const result=await push(conflict.dataset,profile,config,{recordIds:[conflict.entity_id],respectSalesCreateSetting:true,runStartedAt:started,assertRunOwnership:()=>assertOwner(started,conflict.dataset)});
    const needsReview=Boolean(result.skipped || result.conflicts || result.errors || result.snapshot_review_required);
    await finish({status:needsReview?'needs_review':'completed',needs_review:needsReview,completed_at:new Date().toISOString(),completed_steps:1,total_steps:1,current_step_label:'',results:[result]},started,conflict.dataset);
    return {success:true,needs_review:needsReview,result,message:needsReview?'Choice recorded. Other fields or a sync safeguard still require review; nothing was marked fully synced.':'Chosen field values were reconciled and verified.'};
  }catch(error){await finish({status:'needs_review',needs_review:true,completed_at:new Date().toISOString(),current_step_label:'',results:[{dataset:conflict.dataset,direction:'push',errors:1,error_details:[error.message]}]},started,conflict.dataset);throw error;}
}