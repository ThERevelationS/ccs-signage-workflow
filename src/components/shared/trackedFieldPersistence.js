import { base44 } from '@/api/base44Client';
import { verifySalesSaveAcknowledgment } from '../../../base44/shared/salesSaveAcknowledgmentGuard.mjs';
export async function saveTrackedFields({ entityType, id, expectedFields, nextFields, guardFields = {}, expectedVersion = '' }) {
  const response = await base44.functions.invoke('fieldHistoryAction', {
    action:'save', session_token:localStorage.getItem('sss_session_token') || '', entity_type:entityType, entity_id:id,
    expected_fields:Object.fromEntries(Object.keys(nextFields).map(f=>[f,expectedFields?.[f] ?? null])),
    next_fields:nextFields, guard_fields:guardFields, expected_version:expectedVersion,
  });
  const data=response.data;
  if(!data?.success || !data.record)throw new Error(data?.error || 'The saved field could not be verified.');
  // A contradictory success acknowledgment is uncertain; do not auto-retry.
  return verifySalesSaveAcknowledgment(entityType,id,nextFields,data.record);
}