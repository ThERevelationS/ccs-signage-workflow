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
    const attemptId=typeof row.save_attempt_id==='string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.save_attempt_id)
      ? row.save_attempt_id : null;
    return {
      audit_id:String(row.id||''),
      event_key:String(row.event_key||''),
      field_name:row.field_name,
      created_at:Number.isFinite(ms)?new Date(ms).toISOString():null,
      timing,
      matching_current_value:matching,
      save_outcome:'unknown',
      operation_receipt:'unavailable',
      save_attempt_id:attemptId,
      save_attempt_baseline_recorded:attemptId !== null &&
        typeof row.save_attempt_baseline_version === 'string' &&
        row.save_attempt_baseline_version.length > 0,
      source:['app','admin','smartsheet'].includes(row.source)?row.source:'unknown',
      actor_name:String(row.actor_name||'').slice(0,120),
      preview_truncated:row.preview_truncated===true,
    };
  });
  return {entries,has_more:hasMore===true,read_only:true};
}
