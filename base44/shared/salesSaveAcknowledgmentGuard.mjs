import { SALES_OPPORTUNITY_HISTORY_FIELDS } from './salesOpportunityHistory.mjs';

const salesFields = new Set(SALES_OPPORTUNITY_HISTORY_FIELDS);
const equivalent = (a,b) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null) ||
  ((a == null || a === '') && (b == null || b === ''));

// A received success response is not a durable CAS receipt, but the caller
// must not accept a mismatched WorkOrder or changed Sales values as saved.
// This guard performs no writes and never issues an automatic retry.
export function verifySalesSaveAcknowledgment(entityType, id, nextFields, record) {
  if (entityType !== 'WorkOrder' || !nextFields ||
      !Object.keys(nextFields).some(field => salesFields.has(field))) return record;
  const conflict = () => {
    const error = new Error('Sales save acknowledgment does not match the requested WorkOrder and fields. Do not repeat the save; reload the latest record to verify what was stored.');
    error.code = 'SALES_SAVE_ACK_UNVERIFIED';
    error.status = 409;
    return error;
  };
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      record.id !== id) throw conflict();
  if (Object.entries(nextFields).some(([field,value])=>
      !Object.prototype.hasOwnProperty.call(record,field) ||
      !equivalent(record[field],value))) throw conflict();
  return record;
}
