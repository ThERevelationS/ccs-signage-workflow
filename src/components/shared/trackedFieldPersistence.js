import { base44 } from '@/api/base44Client';
import { verifySalesSaveAcknowledgment } from '../../../base44/shared/salesSaveAcknowledgmentGuard.mjs';
export async function saveTrackedFields({ entityType, id, expectedFields, nextFields, guardFields = {}, expectedVersion = '' }) {
  let response;
  try {
    response = await base44.functions.invoke('fieldHistoryAction', {
      action:'save', session_token:localStorage.getItem('sss_session_token') || '', entity_type:entityType, entity_id:id,
      expected_fields:Object.fromEntries(Object.keys(nextFields).map(f=>[f,expectedFields?.[f] ?? null])),
      next_fields:nextFields, guard_fields:guardFields, expected_version:expectedVersion,
    });
  } catch (error) {
    // The server's body carries the real reason ("This field changed in
    // another session: <field>"); axios only exposes the bare status text.
    // Surface it so conflict handling and the user see the actual field.
    const serverError = error?.response?.data?.error;
    if (serverError && serverError !== error?.message) {
      throw Object.assign(new Error(serverError), { status: error?.response?.status });
    }
    throw error;
  }
  const data=response.data;
  if(!data?.success || !data.record)throw new Error(data?.error || 'The saved field could not be verified.');
  // A contradictory success acknowledgment is uncertain; do not auto-retry.
  return verifySalesSaveAcknowledgment(entityType,id,nextFields,data.record);
}