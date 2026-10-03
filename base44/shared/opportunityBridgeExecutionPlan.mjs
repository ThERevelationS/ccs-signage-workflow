const clean = (value) => String(value ?? '').trim();

export function opportunityBridgeReceiptKey(workOrderId) {
  const id = clean(workOrderId);
  return id ? `workorder:${id}:opportunity:v1` : '';
}
