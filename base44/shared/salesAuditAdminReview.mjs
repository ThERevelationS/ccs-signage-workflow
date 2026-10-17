import {SALES_OPPORTUNITY_HISTORY_FIELDS} from './salesOpportunityHistory.mjs';
import {salesHistoryHasUnfinalizedMatchingAudit, SALES_AUDIT_REVIEW_AFTER_MS} from './salesHistoryFinalizationSignal.mjs';

// Admin-only, read-only diagnostic projection. Do not return old/new values,
// costs, margins, notes, fingerprints, or writable status decisions. The
// matching flag is an observation, never evidence that a write committed.
const ALLOWED=new Set(SALES_OPPORTUNITY_HISTORY_FIELDS);
export function projectPendingSalesAuditForAdmin(rows, record, {now=Date.now(),hasMore=false}={}) {
  if(!Array.isArray(rows) || !record?.id)throw new Error('Pending Sales audit evidence is unavailable.');
  const entries=rows.filter(row=>
    row && row.status==='pending' && row.entity_type==='WorkOrder' &&
    row.entity_id===record.id && ALLOWED.has(row.field_name)
  ).slice(0,35).map(row=>{
    const ms=typeof row.created_date==='string'?Date.parse(row.created_date):NaN;
    const timing=!Number.isFinite(ms)?'unknown':ms>now?'future':
      now-ms>=SALES_AUDIT_REVIEW_AFTER_MS?'aged':'recent';
    const matching=salesHistoryHasUnfinalizedMatchingAudit([row],record);
    return {
      audit_id:String(row.id||''),
      event_key:String(row.event_key||''),
      field_name:row.field_name,
      created_at:Number.isFinite(ms)?new Date(ms).toISOString():null,
      timing,
      matching_current_value:matching,
      save_outcome:'unknown',
      operation_receipt:'unavailable',
      source:['app','admin','smartsheet'].includes(row.source)?row.source:'unknown',
      actor_name:String(row.actor_name||'').slice(0,120),
      preview_truncated:row.preview_truncated===true,
    };
  });
  return {entries,has_more:hasMore===true,read_only:true};
}
