export function classifyRecoverableStaleSalesSync(status, now = Date.now()) {
  const stamp = Date.parse(status?.progress_updated_at || status?.updated_at || status?.started_at || '');
  const sales = status?.progress_dataset === 'sales' || /^Sales Pipeline\b/.test(status?.current_step_label || '');
  return {recoverable:status?.status === 'running' && sales && Number.isFinite(stamp) && now-stamp > 30*60*1000};
}
export function recoveredStaleSalesSyncValue(status, at = new Date().toISOString()) {
  return {...status,status:'needs_review',needs_review:true,completed_at:at,current_step_label:'',recovered_stale_run:true,stale_recovered_at:at,stale_recovered_from_step:status.current_step_label,progress_phase:'stalled',progress_updated_at:at,results:[...(status.results || []),{dataset:'sales',direction:status.progress_direction || (/→/.test(status.current_step_label || '')?'push':'pull'),skipped:true,stalled:true,partial:true,outcome_unverified:true,errors:0,reason:'Sales stopped reporting progress. The old run was closed without claiming completion; values and review evidence were preserved.'}]};
}