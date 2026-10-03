const clean = (value) => String(value ?? '').trim();

export function opportunityBridgeReceiptKey(workOrderId) {
  const id = clean(workOrderId);
  return id ? `workorder:${id}:opportunity:v1` : '';
}

export const OPPORTUNITY_BRIDGE_EXECUTION = Object.freeze({ CREATE: "proposed_create", HOLD: "hold", ALREADY_LINKED: "already_linked" });
